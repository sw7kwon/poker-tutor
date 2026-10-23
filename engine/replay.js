// engine/replay.js (n2-P0 계약, 클라우드 L1 구현. 설계 원문 docs/NEXT2_DESIGN.md 5.3절 1~3번, 6.1절 4번, 지시문 docs/cloud-tasks/L1.md)
// 핸드 로그(HandLog) → 테이블 프레임과 스트리트별 승률(순수. 칩 계산을 다시 하지 않고 로그의 post 값을 색인만 한다).
//   frames(log) → [{ i, kind('deal' | 'a' | 's' | 'e' | 'n'), st, text(ActionText.line), actor, view }]
//     view는 Table.render가 받는 상태 모양: players { 이름: { name, type(숨김이면 '?'), pos, isHero } }, names(포지션 순), stacks, playerBets,
//     pot, board(카드 객체), folded, holeCards(카드 객체, 전원), heroCards, street, seed, handNum, hideTypes, acting(그 프레임의 행동 좌석),
//     revealAll: true, replay: true, 끝 프레임은 payouts, winner, pot 0, playerBets {}. 0번 프레임은 딜 직후(stack0에서 블라인드만 뺀 값).
//   equityByStreet(log, opts) → { preflop: { 이름: 0.xx }, flop, turn, river }(그 스트리트 시작 때 살아 있는 사람만, 없는 스트리트는 키 생략)
//     EquityMulti.multiway(hands, board, { iters, rnd }). 보드 3장 이상은 열거(정확), 프리플랍은 MC 300회에 opts.rnd(기본 Drills.rng(seed),
//     없으면 mulberry32 자체 구현)로 결정론. 기본 난수 결과는 _eqCache[log.id]에 캐시한다(opts.rnd나 opts.iters를 주면 캐시 안 함).
//   perspective(frames, name) → { decisions: [프레임 번호], invested, result: 'win' | 'loss' | 'fold' | 'none' }
//   카드 문자열('As') → 객체는 Deck.fromString이 있으면 그것, 없으면 자체 파서. 같은 로그면 결과가 같다(결정론).
// 규약: 로드 때 DOM, 저장소 접근 없음. 해시 파일(equity, hand-eval, deck, drill-core)은 호출만 한다. 성능 frames 30이벤트 2ms 이하.
var Replay = (function() {
  var POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var STREETS = ['preflop', 'flop', 'turn', 'river'];
  var _eqCache = {};

  function _card(s) {
    if (!s) return null;
    if (typeof s === 'object') return s;
    if (typeof Deck !== 'undefined' && Deck && typeof Deck.fromString === 'function') return Deck.fromString(s);
    return { rank: s.charAt(0), suit: s.charAt(1) };
  }
  function _cards(arr) { return (arr || []).map(_card).filter(Boolean); }
  function _copy(o) { var out = {}; if (o) Object.keys(o).forEach(function(k) { out[k] = o[k]; }); return out; }
  function _rank(pos) { var i = POSITIONS.indexOf(pos); return i < 0 ? 99 : i; }

  // 로그 머리에서 프레임 공통 뼈대(players, names, holeCards)를 만든다
  function _base(log) {
    var players = {}, names = [], hole = {};
    (log.players || []).forEach(function(p) {
      if (!p || !p.name) return;
      var hero = !!p.hero;
      players[p.name] = { name: p.name, type: hero ? (p.type || 'Hero') : (log.hidden || !p.type ? '?' : p.type), pos: p.pos || null, isHero: hero };
      names.push(p.name);
      hole[p.name] = _cards(log.hole && log.hole[p.name]);
    });
    names.sort(function(a, b) { return _rank(players[a].pos) - _rank(players[b].pos); });
    return { players: players, names: names, holeCards: hole, heroCards: hole.Hero || null };
  }
  // 블라인드를 낸 사람: SB 자리, 없고 2인이면 BTN(엔진의 BTN=SB 규칙)
  function _blindSeats(log, base) {
    var sb = null, bb = null;
    base.names.forEach(function(n) {
      var pos = base.players[n].pos;
      if (pos === 'SB') sb = n;
      if (pos === 'BB') bb = n;
    });
    if (!sb && base.names.length === 2) base.names.forEach(function(n) { if (base.players[n].pos === 'BTN') sb = n; });
    return { sb: sb, bb: bb };
  }
  function _fmt(v) { var n = Math.round((Number(v) || 0) * 10) / 10; return (n % 1 === 0) ? String(n) : n.toFixed(1); }

  function _view(base, log, f) {
    return { players: base.players, names: base.names, holeCards: base.holeCards, heroCards: base.heroCards,
      stacks: f.stacks, playerBets: f.bets, pot: f.pot, board: f.board, folded: f.folded, street: f.street,
      seed: log.seed, handNum: log.handNum, hideTypes: !!log.hidden, acting: f.acting || null, revealAll: true, replay: true };
  }

  function frames(log) {
    if (!log || !Array.isArray(log.ev) || !Array.isArray(log.players)) return [];
    var base = _base(log), out = [];
    var blinds = log.blinds || { sb: 0.5, bb: 1 }, seats = _blindSeats(log, base);
    var stacks = {}, bets = {}, pot = 0;
    (log.players || []).forEach(function(p) { if (p && p.name) { stacks[p.name] = Number(p.stack0) || 0; bets[p.name] = 0; } });
    if (seats.sb) { stacks[seats.sb] = Math.round((stacks[seats.sb] - blinds.sb) * 100) / 100; bets[seats.sb] = blinds.sb; pot += blinds.sb; }
    if (seats.bb) { stacks[seats.bb] = Math.round((stacks[seats.bb] - blinds.bb) * 100) / 100; bets[seats.bb] = blinds.bb; pot += blinds.bb; }
    pot = Math.round(pot * 100) / 100;
    var board = [], folded = {}, street = 'preflop';
    var ctx = { log: log };
    var AT = (typeof ActionText !== 'undefined' && ActionText && typeof ActionText.line === 'function') ? ActionText : null;
    out.push({ i: 0, kind: 'deal', st: 'preflop', text: '핸드 ' + (log.handNum != null ? log.handNum : '') + ' 시작, 블라인드 ' + _fmt(blinds.sb) + '/' + _fmt(blinds.bb) + 'bb',
      actor: null, view: _view(base, log, { stacks: stacks, bets: bets, pot: pot, board: board, folded: folded, street: street, acting: null }) });
    for (var i = 0; i < log.ev.length; i++) {
      var e = log.ev[i];
      if (!e) continue;
      var k = e.k, acting = null, payouts = null, winner = null;
      if (k === 'a') {
        if (e.st) street = e.st;
        if (e.post) { stacks = _copy(e.post.stacks); bets = _copy(e.post.bets); pot = e.post.pot; }
        if (e.act === 'fold') { folded = _copy(folded); folded[e.n] = true; }
        acting = e.n;
      } else if (k === 's') {
        street = e.st || STREETS[Math.min(3, Math.max(0, (e.board || []).length - 2))];
        board = _cards(e.board);
        pot = e.pot != null ? e.pot : pot;
        bets = {}; base.names.forEach(function(n) { bets[n] = 0; });
      } else if (k === 'e') {
        if (e.board && e.board.length) board = _cards(e.board);
        if (e.stacks) stacks = _copy(e.stacks);
        pot = 0; bets = {};
        if (e.folded) { folded = _copy(folded); Object.keys(e.folded).forEach(function(n) { if (e.folded[n]) folded[n] = true; }); }
        if (e.showdown) street = 'showdown';
        payouts = e.payouts || {}; winner = e.winner != null ? e.winner : null;
      }
      var view = _view(base, log, { stacks: stacks, bets: bets, pot: pot, board: board, folded: folded, street: street, acting: acting });
      if (k === 'e') { view.payouts = payouts; view.winner = winner; }
      out.push({ i: out.length, kind: k, st: (k === 'e' || k === 'n') ? street : (e.st || street), text: AT ? AT.line(e, ctx) : '', actor: acting, view: view });
    }
    return out;
  }

  // mulberry32(Drills.rng와 같은 식, Drills가 없을 때)
  function _rng(seed) {
    var a = (Number(seed) >>> 0) || 0x9e3779b9;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _defaultRnd(seed) {
    if (typeof Drills !== 'undefined' && Drills && typeof Drills.rng === 'function') return Drills.rng(Number(seed) || 0);
    return _rng(seed);
  }

  function equityByStreet(log, opts) {
    opts = opts || {};
    if (!log || !Array.isArray(log.ev) || typeof EquityMulti === 'undefined' || !EquityMulti) return {};
    var custom = typeof opts.rnd === 'function' || opts.iters != null;
    if (!custom && log.id != null && _eqCache[log.id]) return _eqCache[log.id];
    var rnd = typeof opts.rnd === 'function' ? opts.rnd : _defaultRnd(log.seed);
    var iters = opts.iters != null ? opts.iters : 300;
    var base = _base(log), out = {};
    var folded = {}, spots = [{ st: 'preflop', board: [], folded: {} }];
    log.ev.forEach(function(e) {
      if (!e) return;
      if (e.k === 'a' && e.act === 'fold') folded[e.n] = true;
      else if (e.k === 's' && e.st && STREETS.indexOf(e.st) > 0) spots.push({ st: e.st, board: _cards(e.board), folded: _copy(folded) });
    });
    spots.forEach(function(sp) {
      var live = base.names.filter(function(n) { return !sp.folded[n] && base.holeCards[n] && base.holeCards[n].length === 2; });
      if (live.length < 2) return;
      var r = EquityMulti.multiway(live.map(function(n) { return base.holeCards[n]; }), sp.board, { iters: iters, rnd: rnd });
      if (!r || !r.eq || r.eq.length !== live.length) return;
      var m = {};
      live.forEach(function(n, i) { m[n] = r.eq[i]; });
      out[sp.st] = m;
    });
    if (!custom && log.id != null) _eqCache[log.id] = out;
    return out;
  }

  function perspective(fr, name) {
    var none = { decisions: [], invested: 0, result: 'none' };
    if (!Array.isArray(fr) || !fr.length || name == null) return none;
    var first = fr[0], v0 = first && first.view;
    if (!v0 || !v0.stacks || !(name in v0.stacks)) return none;
    var decisions = [], end = null, lastPre = v0;
    fr.forEach(function(f) {
      if (!f || !f.view) return;
      if (f.kind === 'a' && f.actor === name) decisions.push(f.i);
      if (f.kind === 'e') end = f; else lastPre = f.view;
    });
    var stack0 = (Number(v0.stacks[name]) || 0) + (Number(v0.playerBets && v0.playerBets[name]) || 0);
    var before = lastPre && lastPre.stacks ? (Number(lastPre.stacks[name]) || 0) : stack0;
    var invested = Math.max(0, Math.round((stack0 - before) * 100) / 100);
    var result = 'none';
    if (end) {
      var ev = end.view;
      if (ev.folded && ev.folded[name]) result = 'fold';
      else if (ev.payouts && Number(ev.payouts[name]) > 0.005) result = 'win';
      else result = 'loss';
    }
    return { decisions: decisions, invested: invested, result: result };
  }

  function _clearCache() { _eqCache = {}; }
  var api = { frames: frames, equityByStreet: equityByStreet, perspective: perspective, _eqCache: function() { return _eqCache; }, _clearCache: _clearCache, _rng: _rng };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
