// theater/highlight.js (채우는 패키지: M4-P6)
// 주의: 브라우저 내장 전역 Highlight(CSS Custom Highlight API)를 이 var가 덮어쓴다. 존재 확인은 typeof Highlight 대신 Highlight.pick 같은 메서드로 한다.
// 명장면(드라마 점수와 카드). 설계서 3.3절 시드 은행 문단과 "한 편" 구성, 4.6절 2번(100장), 6.1절 theater.cards, 8.1절 5번,
// 계약 T6(ep와 event 필드), T7(theater/theater-core.js 머리 주석). 순수 함수만(DOM, Math.random, 날짜 없음).
//
// Highlight.summary(ep) → 요약(결정론, JSON으로 그대로 비교 가능)
//   { v, seed, street('preflop'|'flop'|'turn'|'river'|'showdown'), showdown, pot(bb, 소수 2자리), players(끝까지 남은 수),
//     decisive(비자명 결정 수, 핸드당 최대 4), allin, winners[],
//     bluff: null | { name, street, outcome('success'|'caught'|'suckout'|'fold'), barrels },
//     cooler: null | { level('full'|'semi'), winner, loser },
//     trap: null | { name, street, kind('plan'|'checkraise'), plan },
//     switched(계획 변경 수, 함정 계획 trap_cr와 slowplay로 바꾼 전환은 빼고 센다), misreads(오독 배지 수),
//     key(명장면 순간의 log 번호|null) }
// Highlight.dramaScore(ep|summary) → { score(0~100 정수), parts{reach, pot, decisive, bluff, cooler, trap, switched} }
//   만점 배분: 도달 스트리트 18, 최종 팟 18, 비자명 결정 20(1회 5), 블러프 성패 16, 쿨러 14, 함정 발동 14 = 100.
//   계획 변경은 회당 -6(설계서 10절 21번: 계획이 깨진 핸드는 덜 뽑히게). 극장 AI가 함정을 노리고 체크레이즈 함정이나
//   슬로플레이로 바꾼 전환은 계획이 깨진 것이 아니라 함정 발동(가점)의 준비라서 감점하지 않는다.
// Highlight.pick(ep) → card | null (점수가 THRESHOLD 60 미만이면 null)
//   card = { id:'th-<seed>', seed, title, cast[], board['As',...], pot, eq:[{name, eq}], plan{이름:계획키}, score,
//            street(에쿼티를 잰 스트리트), winners[] }. at은 Journey가 붙인다.
//   명장면 순간(key) = 함정 발동 액션, 없으면 마지막 비자명 결정, 없으면 마지막 돈이 들어간 액션, 없으면 마지막 액션.
//   그 액션 직전의 보드와 아직 폴드하지 않은 좌석(액션한 사람 포함)으로 에쿼티를 재고, 제목도 그 순간의 속마음에서
//   고른다(그 액션에 없으면 같은 스트리트의 가장 가까운 속마음, 그래도 없으면 핸드 전체에서 가장 가까운 것).
//   제목, 보드, 에쿼티가 같은 순간을 보여 준다.
//   에쿼티: 보드 3장 이상이면 남은 카드 전부 열거(HandEval), 프리플랍은 MC 5000회를 Drills.rng(seed ^ EQ_SALT)로 돌린다
//   (빌런 결정 스트림과 Math.random을 건드리지 않는다).
// Highlight.equity(players[{name, cards}], board, seed) → [{name, eq}] (위 규칙 그대로, 소수 3자리, 무승부는 나눠 가짐)
// Highlight.truthGrade(hole, board) → 'strong'|'medium'|'weak'|'air'|null (계약 T5 대응: nut, strong → strong / medium →
//   medium / weak-pair, draw → weak / air → air, 보드 3장 미만이면 null)
// Highlight.audit(ep) → [문제 문장] (오독 배지가 실제 카드와 맞는지: misread === (read.grade !== 진실 등급))
var Highlight = (function() {
  var VERSION = 1;
  var THRESHOLD = 60;
  var EQ_MC = 5000;
  var EQ_SALT = 0x51A7E;          // 에쿼티 MC 난수 = Drills.rng((seed ^ EQ_SALT) >>> 0)
  var MAX_STOPS = 4;              // 핸드당 멈춤 상한(설계서 3.3절)
  var TITLE_MAX = 56;
  var THOUGHT_MARK = String.fromCharCode(0xD83D, 0xDCAD);   // 속마음 머리표(생각 풍선 이모지), 제목에서는 뗀다
  var STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  var BOARD_N = { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 };
  var REACH = { preflop: 0, flop: 5, turn: 9, river: 13, showdown: 18 };
  var WEIGHTS = { reach: 18, pot: 18, decisive: 20, bluff: 16, cooler: 14, trap: 14 };
  var POT_FULL = 100;             // 팟 100bb 이상이면 팟 점수 만점(제곱근 곡선)
  var PER_STOP = 5;
  var BLUFF_PTS = { success: { flop: 8, turn: 12, river: 16 }, caught: 12, suckout: 10, fold: 6 };
  var COOLER_PTS = { full: 14, semi: 7 };
  var COOLER_FULL_POT = 20;
  var COOLER_SEMI_POT = 30;
  var TRAP_PTS = { plan: 14, checkraise: 10 };
  var SWITCH_PENALTY = 6;
  var TRAP_PLANS = { trap_cr: true, slowplay: true };
  var AGGRO = { bet: true, raise: true, '3bet': true, allin: true };
  var MONEY = { bet: true, raise: true, '3bet': true, allin: true, call: true };
  var RANKS = '23456789TJQKA', SUITS = 'shdc';

  var api = {
    VERSION: VERSION, THRESHOLD: THRESHOLD, EQ_MC: EQ_MC, EQ_SALT: EQ_SALT, WEIGHTS: WEIGHTS, MAX_STOPS: MAX_STOPS,
    TITLE_MAX: TITLE_MAX, STREETS: STREETS
  };

  // ── 작은 도구 ──
  function _isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function _si(st) { var i = STREETS.indexOf(st); return i < 0 ? 0 : i; }
  function _r1(x) { return Math.round(x * 10) / 10; }
  function _r2(x) { return Math.round(x * 100) / 100; }
  function _r3(x) { return Math.round(x * 1000) / 1000; }
  function _card(c) {
    if (!c) return null;
    if (typeof c === 'string') return c.length >= 2 ? { rank: c[0], suit: c[1] } : null;
    return (c.rank && c.suit) ? { rank: String(c.rank), suit: String(c.suit) } : null;
  }
  function _cards(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function(c) { var k = _card(c); if (k) out.push(k); });
    return out;
  }
  function _str(c) { return c.rank + c.suit; }
  function _int(c) {
    var r = RANKS.indexOf(c.rank), s = SUITS.indexOf(c.suit);
    return (r < 0 || s < 0) ? -1 : r * 4 + s;
  }
  // mulberry32(Drills.rng와 같은 식). Drills가 있으면 그것을 쓴다.
  function _rng(seed) {
    if (typeof Drills !== 'undefined' && Drills && typeof Drills.rng === 'function') return Drills.rng(seed);
    var a = (seed >>> 0) || 0x9e3779b9;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _hasEval() { return typeof HandEval !== 'undefined' && HandEval && typeof HandEval.evaluate === 'function'; }

  // ── 강도(진실값) ──
  // 원 등급: nut, strong, medium, weak-pair, draw, air(Thinking.strength 우선, 없으면 Villain._handStrength, 없으면 족보만)
  function rawStrength(hole, board) {
    hole = _cards(hole); board = _cards(board);
    if (hole.length < 2 || board.length < 3) return null;
    if (typeof Thinking !== 'undefined' && Thinking && typeof Thinking.strength === 'function') {
      var s = Thinking.strength(hole, board);
      if (s) return s;
    }
    if (typeof Villain !== 'undefined' && Villain && typeof Villain._handStrength === 'function') return Villain._handStrength(hole, board);
    if (!_hasEval()) return null;
    var t = HandEval.evaluate(hole.concat(board)).type;
    return t <= 4 ? 'nut' : t <= 7 ? 'strong' : t === 8 ? 'medium' : t === 9 ? 'weak-pair' : 'air';
  }
  // 프리플랍 손 등급 premium/good/spec/weak(Thinking.preflopGrade 우선, 없으면 같은 규칙)
  function preflopGrade(hole) {
    hole = _cards(hole);
    if (typeof Thinking !== 'undefined' && Thinking && typeof Thinking.preflopGrade === 'function') return Thinking.preflopGrade(hole);
    if (hole.length < 2) return 'weak';
    var a = RANKS.indexOf(hole[0].rank), b = RANKS.indexOf(hole[1].rank), hi = Math.max(a, b), lo = Math.min(a, b);
    var suited = hole[0].suit === hole[1].suit, A = 12, K = 11, Q = 10, J = 9, T = 8;
    if (a === b) return hi >= J ? 'premium' : hi >= 5 ? 'good' : 'spec';
    if (hi === A && (lo === K || (lo === Q && suited))) return 'premium';
    if (lo >= T) return 'good';
    if (hi === A && (suited || lo >= 7)) return suited ? 'spec' : 'good';
    if (suited && hi - lo <= 2 && lo >= 2) return 'spec';
    return 'weak';
  }
  var T5 = { nut: 'strong', strong: 'strong', medium: 'medium', 'weak-pair': 'weak', draw: 'weak', air: 'air' };
  function truthGrade(hole, board) {
    var s = rawStrength(hole, board);
    return s ? (T5[s] || 'air') : null;
  }

  // ── ep 읽기(계약 T6, 빠진 필드는 log와 state에서 다시 만든다) ──
  function _log(ep) { return (ep && Array.isArray(ep.log)) ? ep.log : []; }
  function _acts(ep) {
    var out = [];
    _log(ep).forEach(function(e, i) { if (e && e.kind === 'action' && e.name) out.push({ e: e, i: i }); });
    return out;
  }
  function _names(ep) {
    var st = (ep && ep.state) || {};
    if (Array.isArray(st.names) && st.names.length) return st.names.slice();
    var out = [];
    if (ep && Array.isArray(ep.cast)) ep.cast.forEach(function(c) { if (c && c.name && out.indexOf(c.name) < 0) out.push(c.name); });
    if (out.length) return out;
    _acts(ep).forEach(function(a) { if (out.indexOf(a.e.name) < 0) out.push(a.e.name); });
    return out;
  }
  function _finalBoard(ep) {
    var res = (ep && ep.result) || {}, st = (ep && ep.state) || {};
    if (Array.isArray(res.board) && res.board.length) return _cards(res.board);
    if (Array.isArray(st.board) && st.board.length) return _cards(st.board);
    var log = _log(ep), best = [];
    log.forEach(function(e) { if (e && e.before && Array.isArray(e.before.board) && e.before.board.length > best.length) best = e.before.board; });
    return _cards(best);
  }
  function _boardAt(ep, e) {
    if (e && e.before && Array.isArray(e.before.board)) return _cards(e.before.board);
    return _finalBoard(ep).slice(0, BOARD_N[e && e.street] || 0);
  }
  function _holeOf(ep, name, e) {
    var b = e && e.before;
    if (b && b.holeCards && b.holeCards[name]) return _cards(b.holeCards[name]);
    var st = (ep && ep.state) || {};
    if (st.holeCards && st.holeCards[name]) return _cards(st.holeCards[name]);
    if (st.players && st.players[name] && st.players[name].holeCards) return _cards(st.players[name].holeCards);
    return [];
  }
  // log 번호 idx의 액션 직전에 폴드한 좌석
  function _foldedBefore(ep, idx) {
    var e = _log(ep)[idx];
    var out = {};
    if (e && e.before && _isObj(e.before.folded)) {
      Object.keys(e.before.folded).forEach(function(n) { if (e.before.folded[n]) out[n] = true; });
      return out;
    }
    _log(ep).forEach(function(x, i) { if (i < idx && x && x.kind === 'action' && x.action === 'fold' && x.name) out[x.name] = true; });
    return out;
  }
  function _foldedEnd(ep) {
    var out = {}, st = (ep && ep.state) || {};
    if (_isObj(st.folded)) Object.keys(st.folded).forEach(function(n) { if (st.folded[n]) out[n] = true; });
    _acts(ep).forEach(function(a) { if (a.e.action === 'fold') out[a.e.name] = true; });
    return out;
  }
  function _bigBlind(ep) {
    var st = (ep && ep.state) || {};
    var b = Number(st.bigBlind);
    return b > 0 ? b : 1;
  }
  function _finalPot(ep) {
    var res = (ep && ep.result) || {}, st = (ep && ep.state) || {};
    var p = Number(res.pot);
    if (p > 0) return p;
    if (_isObj(st.totalContrib)) {
      var s = 0;
      Object.keys(st.totalContrib).forEach(function(n) { s += Number(st.totalContrib[n]) || 0; });
      if (s > 0) return s;
    }
    if (Number(st.pot) > 0) return Number(st.pot);
    var m = 0;
    _log(ep).forEach(function(e) { if (e && Number(e.pot) > m) m = Number(e.pot); });
    return m;
  }
  // 이 액션으로 스택이 0이 됐는가: 금액 규칙(콜 = 낸 금액, 벳/레이즈 = 이번 스트리트 총액) 또는 다음 액션 직전 스택 0
  function _isAllIn(e, next) {
    var b = e && e.before;
    if (!b || !b.stacks || !(e.name in b.stacks)) return false;
    var stack = Number(b.stacks[e.name]) || 0, have = Number(b.playerBets && b.playerBets[e.name]) || 0;
    if (stack <= 0 || !MONEY[e.action]) return false;
    if (e.action === 'call' && Number(e.amount) >= stack - 1e-9) return true;
    if (AGGRO[e.action] && Number(e.amount) >= have + stack - 1e-9) return true;
    var nb = next && next.before;
    return !!(nb && nb.stacks && (e.name in nb.stacks) && Number(nb.stacks[e.name]) <= 1e-9);
  }
  function _planKey(ep, e) {
    if (e && e.planKey) return e.planKey;
    var p = ep && ep.plans && e && ep.plans[e.name];
    if (!p) return null;
    return p.switched || p.key || null;
  }
  // 쇼다운 평가(보드 5장): [{name, score}] 강한 순
  function _ranked(ep, names, board) {
    if (!_hasEval() || board.length < 5) return null;
    var out = [];
    for (var i = 0; i < names.length; i++) {
      var h = _holeOf(ep, names[i]);
      if (h.length < 2) return null;
      out.push({ name: names[i], hole: h, score: HandEval.evaluate(h.concat(board)) });
    }
    out.sort(function(a, b) { return HandEval.compareHands(a.score, b.score) || (names.indexOf(a.name) - names.indexOf(b.name)); });
    return out;
  }
  function _winners(ep, active, ranked) {
    var res = (ep && ep.result) || {};
    if (Array.isArray(res.winners) && res.winners.length) return res.winners.filter(function(n) { return typeof n === 'string'; });
    if (typeof res.winner === 'string') return [res.winner];
    if (active.length === 1) return active.slice();
    if (!ranked || !ranked.length) return [];
    return ranked.filter(function(r) { return HandEval.compareHands(r.score, ranked[0].score) === 0; }).map(function(r) { return r.name; });
  }

  // ── 요약 ──
  function summary(ep) {
    ep = ep || {};
    var acts = _acts(ep), names = _names(ep);
    var foldedEnd = _foldedEnd(ep);
    var active = names.filter(function(n) { return !foldedEnd[n]; });
    var showdown = active.length >= 2;
    var last = 'preflop';
    acts.forEach(function(a) { if (_si(a.e.street) > _si(last) && a.e.street !== 'showdown') last = a.e.street; });
    var street = showdown ? 'showdown' : last;
    var bb = _bigBlind(ep);
    var pot = _r2(_finalPot(ep) / bb);
    var board = _finalBoard(ep);
    var ranked = showdown ? _ranked(ep, active, board) : null;
    var winners = _winners(ep, active, ranked);

    var decisive = 0, allin = false, pfAllin = false, switched = 0, misreads = 0;
    acts.forEach(function(a, j) {
      if (a.e.decisive) decisive++;
      if (_isAllIn(a.e, acts[j + 1] && acts[j + 1].e)) { allin = true; if (a.e.street === 'preflop') pfAllin = true; }
      if (a.e.switched && !TRAP_PLANS[a.e.switched]) switched++;   // 함정 계획으로 바꾼 전환은 계획이 깨진 것이 아니다
      if (a.e.misread) misreads++;
    });
    if (decisive > MAX_STOPS) decisive = MAX_STOPS;

    // 블러프 성패: 포스트플랍에서 에어나 드로우로 벳/레이즈한 마지막 사람
    var bluffs = [];
    acts.forEach(function(a) {
      if (!AGGRO[a.e.action] || _si(a.e.street) < 1 || a.e.street === 'showdown') return;
      var raw = rawStrength(_holeOf(ep, a.e.name, a.e), _boardAt(ep, a.e));
      if (raw === 'air' || raw === 'draw') bluffs.push(a);
    });
    var bluff = null;
    if (bluffs.length) {
      var lb = bluffs[bluffs.length - 1], who = lb.e.name;
      var foldedLater = acts.some(function(a) { return a.i > lb.i && a.e.name === who && a.e.action === 'fold'; });
      var won = winners.indexOf(who) >= 0;
      var outcome = foldedLater ? 'fold' : (!showdown ? (won ? 'success' : 'fold') : (won ? 'suckout' : 'caught'));
      bluff = { name: who, street: lb.e.street, outcome: outcome,
        barrels: bluffs.filter(function(a) { return a.e.name === who; }).length, i: lb.i };
    }

    // 쿨러: 쇼다운에서 진 쪽 최고 손이 강함(nut, strong)이고 팟 20bb 이상이면 full, 진 쪽이 중간(medium)이고 이긴 쪽이 강하고
    //   팟 30bb 이상이면 semi(작은 팟 체크다운은 쿨러가 아니다).
    //   프리플랍에서 올인이 나오고 돈이 프리플랍에서 다 들어갔으면(올인 런아웃) 그때의 손 등급으로 본다:
    //   진 쪽 premium이면 full(AA 대 KK), 진 쪽 good이고 이긴 쪽 premium, 팟 30bb 이상이면 semi.
    var cooler = null;
    if (ranked && ranked.length >= 2) {
      var top = ranked[0];
      var loser = null;
      for (var k = 1; k < ranked.length && !loser; k++) if (HandEval.compareHands(ranked[k].score, top.score) > 0) loser = ranked[k];
      var lastMoney = null;
      acts.forEach(function(a) { if (MONEY[a.e.action]) lastMoney = a.e.street; });
      if (loser && lastMoney === 'preflop' && pfAllin) {
        var lg = preflopGrade(loser.hole), wg = preflopGrade(top.hole);
        if (lg === 'premium') cooler = { level: 'full', winner: top.name, loser: loser.name };
        else if (lg === 'good' && wg === 'premium' && pot >= COOLER_SEMI_POT) cooler = { level: 'semi', winner: top.name, loser: loser.name };
      } else if (loser) {
        var lr = rawStrength(loser.hole, board), wr = rawStrength(top.hole, board);
        var strong = function(s) { return s === 'nut' || s === 'strong'; };
        if (strong(lr) && pot >= COOLER_FULL_POT) cooler = { level: 'full', winner: top.name, loser: loser.name };
        else if ((lr === 'medium' || strong(lr)) && strong(wr) && pot >= COOLER_SEMI_POT) cooler = { level: 'semi', winner: top.name, loser: loser.name };
      }
    }

    // 함정 발동: 계획(trap_cr, slowplay)의 전환점 액션, 없으면 같은 스트리트 체크 뒤 레이즈(체크레이즈)
    var trap = null;
    for (var t = 0; t < acts.length && !trap; t++) {
      var a = acts[t], pk = _planKey(ep, a.e);
      if (AGGRO[a.e.action] && a.e.planTurn && TRAP_PLANS[pk]) trap = { name: a.e.name, street: a.e.street, kind: 'plan', plan: pk, i: a.i };
    }
    if (!trap) {
      var checked = {};
      for (var c = 0; c < acts.length && !trap; c++) {
        var x = acts[c].e, key = x.street + '|' + x.name;
        if (_si(x.street) < 1) continue;
        if (x.action === 'check') checked[key] = true;
        else if ((x.action === 'raise' || x.action === 'allin') && checked[key]) {
          trap = { name: x.name, street: x.street, kind: 'checkraise', plan: _planKey(ep, x), i: acts[c].i };
        }
      }
    }

    // 명장면 순간(제목, 보드, 에쿼티가 모두 이 순간)
    var keyIdx = trap ? trap.i : null, k2;
    for (k2 = acts.length - 1; k2 >= 0 && keyIdx === null; k2--) if (acts[k2].e.decisive) keyIdx = acts[k2].i;
    for (k2 = acts.length - 1; k2 >= 0 && keyIdx === null; k2--) if (MONEY[acts[k2].e.action]) keyIdx = acts[k2].i;
    if (keyIdx === null && acts.length) keyIdx = acts[acts.length - 1].i;

    return {
      v: VERSION, seed: (ep.seed === undefined ? null : ep.seed), street: street, showdown: showdown, pot: pot,
      players: active.length, decisive: decisive, allin: allin, winners: winners,
      bluff: bluff ? { name: bluff.name, street: bluff.street, outcome: bluff.outcome, barrels: bluff.barrels } : null,
      cooler: cooler,
      trap: trap ? { name: trap.name, street: trap.street, kind: trap.kind, plan: trap.plan || null } : null,
      switched: switched, misreads: misreads, key: keyIdx
    };
  }

  // ── 드라마 점수 ──
  function dramaScore(x) {
    var sm = (x && Array.isArray(x.log)) ? summary(x) : x;
    var parts = { reach: 0, pot: 0, decisive: 0, bluff: 0, cooler: 0, trap: 0, switched: 0 };
    if (!_isObj(sm)) return { score: 0, parts: parts };
    parts.reach = REACH[sm.street] || 0;
    var pot = Math.max(0, Number(sm.pot) || 0);
    parts.pot = _r1(WEIGHTS.pot * Math.min(1, Math.sqrt(pot / POT_FULL)));
    parts.decisive = PER_STOP * Math.max(0, Math.min(MAX_STOPS, Math.floor(Number(sm.decisive) || 0)));
    var b = sm.bluff;
    if (b && b.outcome === 'success') parts.bluff = BLUFF_PTS.success[b.street] || 0;
    else if (b && typeof BLUFF_PTS[b.outcome] === 'number') parts.bluff = BLUFF_PTS[b.outcome];
    if (sm.cooler && COOLER_PTS[sm.cooler.level]) parts.cooler = COOLER_PTS[sm.cooler.level];
    if (sm.trap && TRAP_PTS[sm.trap.kind]) parts.trap = TRAP_PTS[sm.trap.kind];
    parts.switched = -SWITCH_PENALTY * Math.max(0, Math.min(2, Math.floor(Number(sm.switched) || 0)));
    var total = parts.reach + parts.pot + parts.decisive + parts.bluff + parts.cooler + parts.trap + parts.switched;
    var score = Math.round(total);
    if (score < 0) score = 0;
    if (score > 100) score = 100;
    return { score: score, parts: parts };
  }

  // ── 에쿼티 ──
  // 보드 3장 이상: 남은 카드로 보드를 채우는 모든 경우를 열거. 프리플랍(보드 3장 미만): MC EQ_MC회, 난수 Drills.rng((seed ^ EQ_SALT) >>> 0).
  function equity(players, board, seed) {
    var ps = [];
    (Array.isArray(players) ? players : []).forEach(function(p) {
      var h = _cards(p && p.cards);
      if (p && p.name && h.length >= 2) ps.push({ name: p.name, hole: h.slice(0, 2) });
    });
    if (!ps.length) return [];
    if (ps.length === 1) return [{ name: ps[0].name, eq: 1 }];
    if (typeof HandEval === 'undefined' || !HandEval || typeof HandEval.evaluateIdx !== 'function') return null;
    var bd = _cards(board).slice(0, 5);
    var dead = [], i, j, c;
    for (c = 0; c < 52; c++) dead.push(0);
    var hands = ps.map(function(p) { return p.hole.map(_int); });
    var bInts = bd.map(_int);
    var all = bInts.concat.apply(bInts, hands);
    for (i = 0; i < all.length; i++) {
      if (all[i] < 0 || dead[all[i]]) return null;     // 잘못된 카드나 중복
      dead[all[i]] = 1;
    }
    var deck = [];
    for (c = 0; c < 52; c++) if (!dead[c]) deck.push(c);
    var need = 5 - bInts.length, off = 2 + bInts.length, P = ps.length;
    var H = hands.map(function(h) { var a = h.concat(bInts); for (var k = 0; k < need; k++) a.push(0); return a; });
    var share = [], total = 0;
    for (i = 0; i < P; i++) share.push(0);
    var evalIdx = HandEval.evaluateIdx, compare = HandEval.compareHands;
    var scores = new Array(P);
    function settle(fill) {
      var p, k;
      for (p = 0; p < P; p++) {
        for (k = 0; k < need; k++) H[p][off + k] = fill[k];
        scores[p] = evalIdx(H[p]);
      }
      var best = 0;
      for (p = 1; p < P; p++) if (compare(scores[p], scores[best]) < 0) best = p;
      var win = [];
      for (p = 0; p < P; p++) if (compare(scores[p], scores[best]) === 0) win.push(p);
      for (k = 0; k < win.length; k++) share[win[k]] += 1 / win.length;
      total++;
    }
    var A = deck.length;
    if (need === 0) settle([]);
    else if (bInts.length >= 3 && need === 1) { for (i = 0; i < A; i++) settle([deck[i]]); }
    else if (bInts.length >= 3 && need === 2) { for (i = 0; i < A; i++) for (j = i + 1; j < A; j++) settle([deck[i], deck[j]]); }
    else {
      var rnd = _rng(((Number(seed) || 0) ^ EQ_SALT) >>> 0);
      var fill = new Array(need);
      for (var it = 0; it < EQ_MC; it++) {
        for (var d = 0; d < need; d++) {
          var r = d + Math.floor(rnd() * (A - d));
          var tmp = deck[d]; deck[d] = deck[r]; deck[r] = tmp;
          fill[d] = deck[d];
        }
        settle(fill);
      }
    }
    return ps.map(function(p, k) { return { name: p.name, eq: _r3(share[k] / total) }; });
  }

  // ── 카드 ──
  // 제목 대사: idx 액션에 속마음이 없으면 같은 스트리트의 가장 가까운(같으면 앞) 속마음, 그래도 없으면 핸드 전체에서 가장 가까운 것
  function _titleEvent(ep, idx) {
    var log = _log(ep);
    if (idx === null || idx === undefined || !log[idx]) return null;
    var street = log[idx].street;
    var has = function(e, same) { return e && e.kind === 'action' && e.thought && e.thought.text && (!same || e.street === street); };
    for (var pass = 0; pass < 2; pass++) {
      for (var d = 0; d < log.length; d++) {
        if (has(log[idx - d], !pass)) return log[idx - d];
        if (has(log[idx + d], !pass)) return log[idx + d];
      }
    }
    return log[idx];
  }
  function _title(ep, e) {
    var t = e && e.thought && e.thought.text ? String(e.thought.text) : '';
    if (!t && e && e.name && ep && Array.isArray(ep.intro)) {
      ep.intro.forEach(function(x) { if (!t && x && x.name === e.name && x.text) t = String(x.text); });
    }
    if (!t) return e && e.name ? e.name + '의 결정적인 순간' : '결정적인 순간';
    t = t.replace(/^\s+/, '');
    if (t.indexOf(THOUGHT_MARK) === 0) t = t.slice(THOUGHT_MARK.length);
    t = t.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
    if (e && e.name && t.indexOf(e.name + ':') !== 0 && t.indexOf(e.name + ' :') !== 0) t = e.name + ': ' + t;
    var chars = Array.from(t);
    if (chars.length <= TITLE_MAX) return t;
    // 첫 문장에서 자르고, 그래도 길면 단어 경계에서 자른 뒤 '...'
    var m = /^(.*?[.!?~])\s/.exec(t);
    if (m && Array.from(m[1]).length <= TITLE_MAX) return m[1];
    var cut = chars.slice(0, TITLE_MAX - 3).join('');
    var sp = cut.lastIndexOf(' ');
    if (sp > TITLE_MAX / 2) cut = cut.slice(0, sp);
    return cut.replace(/[\s,.]+$/, '') + '...';
  }

  function pick(ep) {
    if (!ep || !Array.isArray(ep.log)) return null;
    var sm = summary(ep);
    var d = dramaScore(sm);
    if (d.score < THRESHOLD) return null;
    var log = ep.log, key = sm.key !== null ? log[sm.key] : null;
    var names = _names(ep);
    var board = key ? _boardAt(ep, key) : _finalBoard(ep);
    var folded = key ? _foldedBefore(ep, sm.key) : _foldedEnd(ep);
    var cast = names.filter(function(n) { return !folded[n]; });
    var players = cast.map(function(n) { return { name: n, cards: _holeOf(ep, n, key) }; });
    var eq = equity(players, board, sm.seed) || [];
    var story = _titleEvent(ep, sm.key);
    var plan = {};
    cast.forEach(function(n) {
      var p = ep.plans && ep.plans[n];
      var k = p ? (p.switched || p.key || null) : null;
      if (k) plan[n] = k;
    });
    return {
      id: 'th-' + (sm.seed === null ? 'x' : sm.seed), seed: sm.seed, title: _title(ep, story || key),
      cast: cast, board: board.map(_str), pot: sm.pot, eq: eq, plan: plan, score: d.score,
      street: key && key.street ? key.street : sm.street, winners: sm.winners.slice()
    };
  }

  // ── 오독 배지 점검 ──
  function audit(ep) {
    var out = [];
    _log(ep).forEach(function(e, i) {
      if (!e || !e.read || !e.read.grade) return;
      var target = e.read.target || e.name;
      var truth = truthGrade(_holeOf(ep, target, e), _boardAt(ep, e));
      if (truth === null) { out.push('#' + i + ' 보드 3장 미만인데 읽기가 있음'); return; }
      var want = e.read.grade !== truth;
      if (!!e.misread !== want) out.push('#' + i + ' ' + (e.read.reader || '?') + ' → ' + target + ': 읽기 ' + e.read.grade +
        ', 실제 ' + truth + ', 오독 배지 ' + (e.misread ? '있음' : '없음'));
    });
    return out;
  }

  api.rawStrength = rawStrength;
  api.truthGrade = truthGrade;
  api.summary = summary;
  api.dramaScore = dramaScore;
  api.equity = equity;
  api.pick = pick;
  api.audit = audit;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
