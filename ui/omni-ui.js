// ui/omni-ui.js (n2 G4 OMNI-UI, 설계 원문 docs/NEXT2_DESIGN.md 5.4절 2~8번, 7.4절)
// 완전 분석 오픈 모드 화면. 데이터는 HandLog(핸드 로그)에서만 읽고 엔진 상태는 건드리지 않는다.
//   panelHTML(log, name, tab, frameIndex) → 분석 패널 html(순수). 탭 4개: hand(🃏 손), chart(📋 차트), think(💭 생각), time(⏪ 타임라인)
//   framesOf(log) → 타임라인 프레임 [{ i, kind, st, text, actor, view }]. Replay.frames가 실제 구현이면 그쪽, 스텁이면 _framesFallback(로그의 post로 직접)
//   openPanel(log, name, tab, fi, opts) 좌석 분석 패널(폰 하단 시트, 데스크톱 모달), closePanel(), setTab(tab), setPerspective(name)
//   selectFrame(i) → Table.render(frame.view)(replay: true, revealAll: true), live() 라이브 테이블로 되돌림
//   openLast() 결과바 '⏪ 리플레이'(직전 핸드 로그), open(logKey, opts) 기록 화면의 '🔍 완전 분석'(게임 화면을 빌려 #omni-root 타임라인 바)
//   abort() 리플레이 화면 상태 정리(App.showScreen이 게임 화면 밖으로 갈 때와 새 핸드에서 부른다). 정리했으면 true
// 규약: 로드 때 DOM, 저장소 접근 없음(init은 DOMContentLoaded 뒤). 다른 모듈은 전부 typeof 가드. 테스트는 _setEnv({ dom, mobile, mods })로 주입.
// 라이브 세션(App.omni())의 좌석 탭은 document 위임 리스너 1개(.poker-table .seat). 좌석 className은 Table.render가 매번 다시 쓰므로
// .omni-focus 고리는 테이블 변경 관찰(MutationObserver)로 다시 붙인다. 가운뎃점과 긴줄표 없음.
var OmniUI = (function() {
  var TABS = [{ key: 'hand', label: '🃏 손' }, { key: 'chart', label: '📋 차트' }, { key: 'think', label: '💭 생각' }, { key: 'time', label: '⏪ 타임라인' }];
  var TAB_KEYS = { hand: true, chart: true, think: true, time: true };
  var POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var STREET_KOR = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운' };
  var GRADE_KOR = { premium: '프리미엄 손', good: '좋은 손', spec: '투기 손(수딧, 커넥터)', weak: '약한 손' };
  var LIGHT_ICON = { green: '🟢', yellow: '🟡', red: '🔴' };
  var TYPE_KOR = { TAG: 'TAG(타이트 공격형)', LAG: 'LAG(루즈 공격형)', Fish: 'Fish(느슨한 콜러)', Nit: 'Nit(아주 타이트)', Station: 'Station(콜만)', Mixed: '카멜레온(스트리트마다 바뀜)', Hero: '나' };

  var _env = {};          // 테스트 주입 { dom: bool, mobile: bool, mods: { 이름: 모듈 } }
  var _sess = null;       // 열린 분석 { log, name, tab, fi, frames, mode: 'live' | 'history', replaying, panelOpen, root, bar, unbind, evLen }
  var _lastLive = null;   // 마지막 라이브(replay 아님) Table.render 상태. 리플레이에서 '▶ 라이브로'가 되돌릴 때
  var _fcache = { key: null, frames: null };
  var _eqcache = { key: null, eq: null };   // Replay.equityByStreet 결과(로그 id + 이벤트 수). 라이브 패널은 빌런 걸음마다 다시 그리므로 승률 재계산을 막는다
  var _inited = false, _obs = null, _hookedRender = null;

  // ── 환경, 모듈 가드 ──
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : {});
  function _m(name) {
    if (_env.mods && Object.prototype.hasOwnProperty.call(_env.mods, name)) return _env.mods[name];
    try { return G[name]; } catch (e) { return undefined; }
  }
  function _fn(mod, f) { var o = _m(mod); return !!(o && typeof o[f] === 'function'); }
  function _call(mod, f) {
    var o = _m(mod);
    if (!o || typeof o[f] !== 'function') return undefined;
    try { return o[f].apply(o, Array.prototype.slice.call(arguments, 2)); } catch (e) { _warn(mod + '.' + f, e); return undefined; }
  }
  function _real(mod) { var o = _m(mod); return !!(o && typeof o === 'object' && !o.STUB); }
  function _warn(where, e) { try { if (typeof console !== 'undefined' && console.warn) console.warn('[OmniUI] ' + where, e && e.message ? e.message : e); } catch (x) {} }
  function _doc() { return (typeof document !== 'undefined' && document) ? document : null; }
  function _el(id) { var d = _doc(); return d && typeof d.getElementById === 'function' ? d.getElementById(id) : null; }
  // 실제 게임 화면이 있는 페이지인지(node 러너의 문서 스텁은 querySelector가 null이라 false)
  function _hasDom() {
    if (typeof _env.dom === 'boolean') return _env.dom;
    var d = _doc();
    if (!d || typeof d.querySelector !== 'function' || typeof d.createElement !== 'function') return false;
    try { return !!d.querySelector('#screen-game .table-area'); } catch (e) { return false; }
  }
  function _isMobile() {
    if (typeof _env.mobile === 'boolean') return _env.mobile;
    return !!_call('MobileUI', 'isMobile');
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _fmt(v) { var n = Math.round((Number(v) || 0) * 10) / 10; return (n % 1 === 0) ? String(n) : n.toFixed(1); }
  function _signed(v) { var n = Math.round((Number(v) || 0) * 10) / 10; return (n > 0 ? '+' : n < 0 ? '-' : '±') + _fmt(Math.abs(n)); }
  function _toast(msg) {
    if (_fn('JourneyUI', 'toast')) { _call('JourneyUI', 'toast', msg); return; }
    var d = _doc();
    if (!d || typeof d.createElement !== 'function' || !d.body) return;
    var old = _el('app-toast');
    if (old && old.remove) old.remove();
    var t = d.createElement('div');
    t.id = 'app-toast';
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:14%;left:50%;transform:translateX(-50%);background:rgba(20,20,30,0.95);color:#e3b341;border:1px solid #e3b341;border-radius:6px;padding:8px 18px;z-index:500;font-size:0.9rem;pointer-events:none';
    d.body.appendChild(t);
    setTimeout(function() { if (t.remove) t.remove(); }, 2400);
  }

  // ── 카드, 로그 읽기(순수) ──
  function _card(c) {
    if (!c) return null;
    if (typeof c === 'object') return c;
    var s = String(c);
    if (s.length < 2) return null;
    return { rank: s.slice(0, -1) === '10' ? 'T' : s.slice(0, -1), suit: s.slice(-1) };
  }
  function _cards(arr) { return (arr || []).map(_card).filter(Boolean); }
  function _cardHTML(c) {
    var h = _call('Cards', 'html', c, { cls: 'omni-card' });
    if (h) return h;
    var SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
    return '<div class="card omni-card ' + ((c.suit === 'h' || c.suit === 'd') ? 'red' : 'black') + '" data-suit="' + _esc(c.suit) + '">' + (c.rank === 'T' ? '10' : _esc(c.rank)) + (SYM[c.suit] || '') + '</div>';
  }
  function _glyphs(cards) {
    return _cards(cards).map(function(c) {
      var g = _call('Cards', 'glyph', c);
      return g || _esc((c.rank === 'T' ? '10' : c.rank) + ({ s: '♠', h: '♥', d: '♦', c: '♣' })[c.suit]);
    }).join(' ');
  }
  function _players(log) { return (log && Array.isArray(log.players)) ? log.players : []; }
  function _playerOf(log, name) {
    var pl = _players(log);
    for (var i = 0; i < pl.length; i++) if (pl[i] && pl[i].name === name) return pl[i];
    return null;
  }
  function _heroName(log) { var pl = _players(log); for (var i = 0; i < pl.length; i++) if (pl[i] && pl[i].hero) return pl[i].name; return 'Hero'; }
  function _nameAtPos(log, pos) { var pl = _players(log); for (var i = 0; i < pl.length; i++) if (pl[i] && pl[i].pos === pos) return pl[i].name; return null; }
  function _who(log, name) {
    var p = _playerOf(log, name);
    if (!p) return _esc(name);
    if (p.hero) return '나' + (p.pos ? '(' + _esc(p.pos) + ')' : '');
    return _esc(p.pos || name);
  }
  // 유형 낱말: 숨김 테이블은 '이 손님'
  function _typeWord(log, p) {
    if (!p) return '이 손님';
    if (p.hero) return '나';
    if (log && log.hidden) return '이 손님';
    return p.type ? (TYPE_KOR[p.type] || String(p.type)) : '이 손님';
  }
  function _endEv(log) { var ev = (log && log.ev) || []; for (var i = ev.length - 1; i >= 0; i--) if (ev[i].k === 'e') return ev[i]; return null; }
  function _decisions(log, name, preflopOnly) {
    var out = [], ev = (log && log.ev) || [];
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.k !== 'a' || e.n !== name) continue;
      if (preflopOnly && e.st !== 'preflop') continue;
      out.push({ i: i, ev: e });
    }
    return out;
  }
  function _actKey(ev) { var k = _call('ActionText', 'actKey', ev); return k || ev.act || ''; }
  function _actKor(k) { var s = _call('ActionText', 'kor', k); return s || String(k || ''); }
  function _actIcon(k) { var s = _call('ActionText', 'icon', k); return s == null ? '' : s; }
  function _actCls(k) { var s = _call('ActionText', 'cls', k); return s || ''; }
  function _line(ev, log) { var s = _call('ActionText', 'line', ev, { log: log }); return s == null ? '' : s; }
  // 액션 머리글 '플랍, 벳 6.7bb'
  function _actHead(ev) {
    var k = _actKey(ev), amt = Number(ev.amt) || 0;
    return (STREET_KOR[ev.st] || '프리플랍') + ', ' + _actKor(k) + ((k !== 'fold' && k !== 'check' && amt > 0) ? ' ' + _fmt(amt) + 'bb' : '');
  }

  // ── 프레임(타임라인) ──
  function _framesKey(log) { return log ? String(log.id) + '#' + ((log.ev && log.ev.length) || 0) : null; }
  function framesOf(log) {
    if (!log) return [];
    var key = _framesKey(log);
    if (_fcache.key === key && _fcache.frames) return _fcache.frames;
    var fr = null;
    if (_real('Replay') && _fn('Replay', 'frames')) {
      var r = _call('Replay', 'frames', log);
      if (Array.isArray(r) && r.length) fr = _enrich(log, r);
    }
    if (!fr) fr = _framesFallback(log);
    _fcache = { key: key, frames: fr };
    return fr;
  }
  // Replay.frames(설계 5.3절 1번 모양)에 화면이 쓰는 필드를 더한다(폴백과 같게): 액션 프레임 act와 hero(판정 요약, 타임라인 색과 신호등), view.bigBlind, 끝 프레임 view.handOver
  function _enrich(log, fr) {
    var evs = (log.ev || []).filter(Boolean), bb = Number(log.blinds && log.blinds.bb) || 1;
    fr.forEach(function(f, k) {
      if (!f) return;
      var ev = k > 0 ? evs[k - 1] : null;
      if (f.kind === 'a' && ev && ev.k === 'a') {
        if (f.act == null) f.act = _actKey(ev);
        if (f.hero == null) f.hero = ev.hero || false;
      }
      if (f.view) {
        if (f.view.bigBlind == null) f.view.bigBlind = bb;
        if (f.kind === 'e') f.view.handOver = true;
      }
    });
    return fr;
  }
  // 임시 변환(설계 7.4절 2번): 로그 이벤트의 post(stacks, bets, pot)를 그대로 색인해 Table.render 상태 모양을 만든다. 칩 계산 다시 안 함
  function _framesFallback(log) {
    if (!log || !Array.isArray(log.players) || !log.players.length) return [];
    var players = {}, order = [];
    log.players.forEach(function(p) {
      if (!p || !p.name) return;
      players[p.name] = { name: p.name, type: p.hero ? 'Hero' : (p.type || '?'), pos: p.pos || null, isHero: !!p.hero };
      order.push(p.name);
    });
    var names = order.slice().sort(function(a, b) { return POSITIONS.indexOf(players[a].pos) - POSITIONS.indexOf(players[b].pos); });
    var hole = {};
    names.forEach(function(n) { hole[n] = _cards(log.hole && log.hole[n]); });
    var heroName = _heroName(log);
    var stacks = {}, bets = {}, pot = 0, folded = {}, board = [], street = 'preflop';
    names.forEach(function(n) { var p = _playerOf(log, n); stacks[n] = Number(p && p.stack0) || 0; bets[n] = 0; });
    var sb = Number(log.blinds && log.blinds.sb) || 0.5, bb = Number(log.blinds && log.blinds.bb) || 1;
    var sbName = _nameAtPos(log, 'SB') || (names.length === 2 ? _nameAtPos(log, 'BTN') : null), bbName = _nameAtPos(log, 'BB');
    if (sbName) { stacks[sbName] = Math.round((stacks[sbName] - sb) * 100) / 100; bets[sbName] = sb; pot += sb; }
    if (bbName) { stacks[bbName] = Math.round((stacks[bbName] - bb) * 100) / 100; bets[bbName] = bb; pot += bb; }
    pot = Math.round(pot * 100) / 100;
    function copy(o) { var out = {}; Object.keys(o || {}).forEach(function(k) { out[k] = o[k]; }); return out; }
    function view(extra) {
      var v = { players: players, names: names, stacks: copy(stacks), playerBets: copy(bets), pot: pot, board: board.slice(), folded: copy(folded),
        holeCards: hole, heroCards: hole[heroName] || null, street: street, seed: log.seed, handNum: log.handNum, hideTypes: !!log.hidden,
        bigBlind: bb, revealAll: true, replay: true };
      if (extra) Object.keys(extra).forEach(function(k) { v[k] = extra[k]; });
      return v;
    }
    var frames = [{ i: 0, kind: 'deal', st: 'preflop', actor: null,
      text: '카드를 받았어요' + (sbName || bbName ? ' (블라인드 ' + _fmt(sb) + ' / ' + _fmt(bb) + 'bb)' : ''), view: view() }];
    (log.ev || []).forEach(function(ev, idx) {
      var i = idx + 1;
      if (!ev) return;
      if (ev.k === 'a') {
        if (ev.post) {
          if (ev.post.stacks) stacks = copy(ev.post.stacks);
          if (ev.post.bets) bets = copy(ev.post.bets);
          if (ev.post.pot != null) pot = Number(ev.post.pot) || 0;
        }
        if (ev.act === 'fold') folded[ev.n] = true;
        if (ev.st) street = ev.st;
        frames.push({ i: i, kind: 'a', st: street, actor: ev.n, act: _actKey(ev), hero: ev.hero || false, text: _line(ev, log), view: view({ acting: ev.n }) });
      } else if (ev.k === 's') {
        board = _cards(ev.board);
        if (ev.pot != null) pot = Number(ev.pot) || 0;
        bets = {};
        names.forEach(function(n) { bets[n] = 0; });
        if (ev.st) street = ev.st;
        frames.push({ i: i, kind: 's', st: street, actor: null, text: _line(ev, log), view: view() });
      } else if (ev.k === 'e') {
        if (ev.board && ev.board.length) board = _cards(ev.board);
        if (ev.stacks) stacks = copy(ev.stacks);
        if (ev.folded) folded = copy(ev.folded);
        pot = 0; bets = {};
        names.forEach(function(n) { bets[n] = 0; });
        street = 'showdown';
        frames.push({ i: i, kind: 'e', st: 'showdown', actor: ev.winner != null ? ev.winner : null, text: _line(ev, log),
          view: view({ payouts: copy(ev.payouts), winner: ev.winner != null ? ev.winner : null, handOver: true }) });
      } else if (ev.k === 'n') {
        frames.push({ i: i, kind: 'n', st: street, actor: ev.name || null, text: _line(ev, log), view: view() });
      }
    });
    return frames;
  }
  function _clampFi(frames, fi) {
    var n = frames.length;
    if (!n) return 0;
    if (fi == null || !isFinite(Number(fi))) return n - 1;
    return Math.max(0, Math.min(n - 1, Math.round(Number(fi))));
  }

  // ── 차트 문맥(Reasoning.chartContext가 스텁이면 설계 5.3절 4-2번 규칙으로 직접) ──
  function _chartCtx(log, i) {
    if (_real('Reasoning') && _fn('Reasoning', 'chartContext')) {
      var r = _call('Reasoning', 'chartContext', log, i);
      if (r && r.pos) return r;
    }
    var ev = log && log.ev && log.ev[i];
    if (!ev || ev.k !== 'a') return null;
    var p = _playerOf(log, ev.n), pre = ev.pre || {};
    if (!p || !p.pos) return null;
    var sbc = Number(pre.sbc) || 0, facing, limpers = 0;
    if (sbc <= 0) { facing = false; limpers = Math.max(0, Math.round(((Number(pre.pot) || 1.5) - 1.5) / 1)); }
    else if (sbc === 1) facing = true;
    else if (sbc === 2) facing = ((Number(pre.have) || 0) > 0) ? 'vs3bet' : 'cold3bet';
    else facing = 'vs4bet';
    var opener = null;
    if (facing === true && pre.lr) { var op = _playerOf(log, pre.lr); opener = op ? op.pos : null; }
    return { pos: p.pos, facing: facing, opener: opener, limpers: limpers, sbc: sbc };
  }
  // 상대 표(캐릭터 프로필) 안인지: Reasoning이 실제면 explain().chart.profileIn, 스텁이면 프로필 문자열을 Range.inRange로 직접(오픈과 오픈 대응만)
  function _profileLine(log, i, ctx, p, hole) {
    if (!p || p.hero || log.hidden || !p.type || p.type === 'Mixed') return '';
    var inTbl = null, tblName = '';
    if (_real('Reasoning') && _fn('Reasoning', 'explain')) {
      var ex = _call('Reasoning', 'explain', log, i);
      if (ex && ex.chart && typeof ex.chart.profileIn === 'boolean') { inTbl = ex.chart.profileIn; tblName = ctx.facing === false ? '오픈 표' : '대응 표'; }
    }
    if (inTbl === null) {
      var VP = _m('VillainProfiles'), prof = VP && VP[p.type];
      if (!prof || !_fn('Range', 'inRange') || hole.length < 2) return '';
      try {
        if (ctx.facing === false && prof.rfi && prof.rfi[ctx.pos]) { inTbl = !!_call('Range', 'inRange', hole[0], hole[1], prof.rfi[ctx.pos]); tblName = '오픈 표'; }
        else if (ctx.facing === true) {
          var in3 = prof.threebet_range ? !!_call('Range', 'inRange', hole[0], hole[1], prof.threebet_range) : false;
          var inC = (prof.call_vs_raise && prof.call_vs_raise[ctx.pos]) ? !!_call('Range', 'inRange', hole[0], hole[1], prof.call_vs_raise[ctx.pos]) : false;
          if (in3) { inTbl = true; tblName = '3벳 표'; } else if (inC) { inTbl = true; tblName = '콜 표'; } else { inTbl = false; tblName = '오픈 대응 표'; }
        }
      } catch (e) { inTbl = null; }
    }
    if (inTbl === null) return '';
    return '<div class="omni-prof"><span class="omni-lb omni-lb-char">캐릭터 표</span> ' + _esc(TYPE_KOR[p.type] || p.type) + ' ' + _esc(tblName) + ' ' + (inTbl ? '안' : '밖') + '</div>';
  }

  // ── 패널 HTML(순수) ──
  function panelHTML(log, name, tab, frameIndex) {
    if (!log || !Array.isArray(log.players) || !log.players.length) return '';
    var frames = framesOf(log);
    var fi = _clampFi(frames, frameIndex);
    if (!_playerOf(log, name)) name = _heroName(log);
    tab = TAB_KEYS[tab] ? tab : 'hand';
    var body = tab === 'hand' ? _handTab(log, name, frames, fi) : tab === 'chart' ? _chartTab(log, name) : tab === 'think' ? _thinkTab(log, name) : _timeTab(log, name, frames, fi);
    return '<div class="omni-head">' + _perspHTML(log, name) + '</div>' +
      '<div class="omni-tabs" role="tablist">' + TABS.map(function(t) {
        return '<button type="button" role="tab" class="omni-tab" data-tab="' + t.key + '" aria-selected="' + (t.key === tab ? 'true' : 'false') + '">' + t.label + '</button>';
      }).join('') + '</div>' +
      '<div class="omni-body" data-tab="' + tab + '">' + body + '</div>';
  }
  // 관점 칩 줄(좌석 전원, 44px, 가로 스크롤)
  function _perspHTML(log, name) {
    var pl = _players(log).slice().sort(function(a, b) { return POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos); });
    return '<div class="omni-persp-row" role="group" aria-label="관점">' + pl.map(function(p) {
      var on = p.name === name;
      return '<button type="button" class="omni-persp' + (p.hero ? ' is-hero' : '') + '" data-name="' + _esc(p.name) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<b>' + _esc(p.pos || '') + '</b><small>' + (p.hero ? '나' : _esc(p.name)) + '</small></button>';
    }).join('') + '</div>';
  }
  function _handTab(log, name, frames, fi) {
    var p = _playerOf(log, name), hole = _cards(log.hole && log.hole[name]);
    var f = frames[fi], v = (f && f.view) || {};
    var board = _cards(v.board);
    var out = '<div class="omni-sec omni-hand-cards">' + (hole.length ? hole.map(_cardHTML).join('') : '<span class="omni-dim">카드 정보가 없어요</span>') +
      '<div class="omni-hand-who">' + _who(log, name) + (p && p.hero ? '' : ' <span class="omni-dim">' + _esc(_typeWord(log, p)) + '</span>') + '</div></div>';
    // 족보(선택 프레임 기준)
    var desc = '';
    if (hole.length === 2 && board.length >= 3 && _fn('HandEval', 'evaluate') && _fn('HandEval', 'describe')) {
      var sc = _call('HandEval', 'evaluate', hole.concat(board));
      if (sc) desc = _call('HandEval', 'describe', sc) || '';
    }
    if (!desc && hole.length === 2) { var g = _call('Thinking', 'preflopGrade', hole); desc = GRADE_KOR[g] || ''; }
    out += '<div class="omni-sec"><div class="omni-row"><span class="omni-lb">엔진 계산</span> ' + _esc(STREET_KOR[v.street] || STREET_KOR[f && f.st] || '프리플랍') +
      (board.length ? ' ' + _glyphs(board) : '') + (desc ? ': <b>' + _esc(desc) + '</b>' : '') + '</div></div>';
    // 스트리트별 승률(Replay.equityByStreet가 실제일 때)
    out += '<div class="omni-sec">' + _eqHTML(log, name) + '</div>';
    // 투입과 결과. 끝 프레임의 스택은 정산 뒤라 투입은 그 앞 장면(마지막 액션) 기준
    var stack0 = Number(p && p.stack0) || 0;
    var vInv = (f && f.kind === 'e' && fi > 0 && frames[fi - 1] && frames[fi - 1].view) ? frames[fi - 1].view : v;
    var now = Number(vInv.stacks && vInv.stacks[name]);
    var invested = isFinite(now) ? Math.max(0, Math.round((stack0 - now) * 10) / 10) : 0;
    var e = _endEv(log), res;
    if (!e) res = '<span class="omni-dim">진행 중</span>';
    else if (e.folded && e.folded[name]) res = '<span class="omni-res-fold">폴드</span>';
    else {
      var net = Number(e.payouts && e.payouts[name]) || 0;
      res = net > 0 ? '<span class="omni-res-win">승 ' + _signed(net) + 'bb</span>' : '<span class="omni-res-loss">패 ' + _signed(net) + 'bb</span>';
    }
    var basis = (f && f.kind === 'e') ? '' : (!e && fi === frames.length - 1) ? ' <span class="omni-dim">(지금 기준)</span>' : ' <span class="omni-dim">(' + (fi + 1) + '번째 장면 기준)</span>';
    out += '<div class="omni-sec"><div class="omni-row">투입 <b>' + _fmt(invested) + 'bb</b> <span class="omni-sep">|</span> 결과 ' + res + basis + '</div></div>';
    return out;
  }
  function _eqHTML(log, name) {
    if (!(_real('Replay') && _fn('Replay', 'equityByStreet'))) return '<div class="omni-dim">스트리트별 승률은 분석 모듈이 준비되면 보여요</div>';
    var key = _framesKey(log), eq;
    if (_eqcache.key === key && _eqcache.eq) eq = _eqcache.eq;
    else { eq = _call('Replay', 'equityByStreet', log) || {}; _eqcache = { key: key, eq: eq }; }
    var parts = [], STS = ['preflop', 'flop', 'turn', 'river'];
    STS.forEach(function(st) {
      var m = eq[st];
      if (!m || m[name] == null) return;
      var pct = Math.round(Number(m[name]) * 100);
      parts.push('<div class="omni-eq"><span class="omni-eq-st">' + STREET_KOR[st] + '</span><span class="omni-eq-bar"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></span><b>' + pct + '%</b></div>');
    });
    if (!parts.length) return '<div class="omni-dim">승률을 계산할 스트리트가 없어요</div>';
    return '<div class="omni-row"><span class="omni-lb">엔진 계산</span> 스트리트별 승률(살아 있는 사람 기준)</div>' + parts.join('');
  }
  function _chartTab(log, name) {
    var p = _playerOf(log, name), decs = _decisions(log, name, true);
    if (!decs.length) return '<div class="omni-sec omni-dim">프리플랍에 ' + _who(log, name) + '의 결정이 없어요(블라인드만 냈거나 차례가 오지 않았어요)</div>';
    var hole = _cards(log.hole && log.hole[name]);
    var GC = _m('GtoChart');
    var canChart = !!(GC && typeof GC.cachedModel === 'function' && typeof GC._renderHTML === 'function' && hole.length === 2);
    var chips = decs.length > 1 ? '<div class="omni-dec-chips" role="tablist">' + decs.map(function(d, k) {
      return '<button type="button" role="tab" class="omni-dec-chip" data-dec="' + k + '" aria-selected="' + (k === 0 ? 'true' : 'false') + '">' + _esc(_actHead(d.ev)) + '</button>';
    }).join('') + '</div>' : '';
    var blocks = decs.map(function(d, k) {
      var ev = d.ev, ctx = _chartCtx(log, d.i), inner = '';
      if (!ctx || !canChart) inner = '<div class="omni-dim">차트 자료가 없어요</div>';
      else {
        var model = null, html = '', ro = null;
        try {
          model = GC.cachedModel(ctx.pos, ctx.facing, ctx.opener, ctx.limpers);
          html = GC._renderHTML(model, hole, { flash: false, heroPos: ctx.pos });
          ro = typeof GC.readout === 'function' ? GC.readout(model, hole, null, { heroPos: ctx.pos }) : null;
        } catch (e) { _warn('chart', e); model = null; }
        if (!model) inner = '<div class="omni-dim">이 자리의 차트가 없어요</div>';
        else {
          // (n3-B) 보기 칩 줄(.gv-bar)이 있으면 격자 위에 같이 넣는다(칩 누름은 _onPanelClick이 GtoChart.onViewChip으로)
          var a0 = html.indexOf('<div class="gv-bar"'), a = a0 >= 0 ? a0 : html.indexOf('<div class="gto-chart-grid'), b = html.indexOf('<div class="gto-chart-legend');
          var grid = (a >= 0) ? html.slice(a, b > a ? b : undefined) : '';
          var read = ro ? (_esc(ro.ctx) + ': ' + String(ro.handHTML || '').replace(/^내 손 /, '')) : '';
          var actual = _actKor(_actKey(ev)) + ((Number(ev.amt) || 0) > 0 && _actKey(ev) !== 'fold' && _actKey(ev) !== 'check' ? ' ' + _fmt(ev.amt) + 'bb' : '');
          var same = ro && ro.action && grid ? (ro.action === 'raise' ? /raise|3bet|4bet|allin|bet/.test(_actKey(ev)) : ro.action === 'call' ? _actKey(ev) === 'call' : ro.action === 'fold' ? _actKey(ev) === 'fold' : null) : null;
          inner = (grid ? '<div class="omni-read"><span class="omni-lb omni-lb-app">이 앱 차트 기준</span> ' + read + '</div>' +
            '<div class="gto-big omni-grid-wrap">' + grid + '</div>' : '<div class="omni-dim">이 자리와 상황의 차트 칸이 없어요</div>') +
            '<div class="omni-row">실제 ' + _who(log, name) + ': <b>' + _esc(actual) + '</b>' +
            (same === null ? '' : same ? ' <span class="omni-same">차트 칸과 같아요</span>' : ' <span class="omni-diff">차트 칸과 달라요' + (p && !p.hero ? '(캐릭터 표대로 쳤어요)' : '') + '</span>') + '</div>' +
            _profileLine(log, d.i, ctx, p, hole);
        }
      }
      return '<div class="omni-dec" data-dec="' + k + '"' + (k === 0 ? '' : ' hidden') + '>' + (decs.length > 1 ? '' : '<div class="omni-dec-head">' + _esc(_actHead(ev)) + '</div>') + inner + '</div>';
    }).join('');
    return '<div class="omni-sec">' + chips + blocks + '</div>';
  }
  function _thinkTab(log, name) {
    var p = _playerOf(log, name), decs = _decisions(log, name, false);
    if (!decs.length) return '<div class="omni-sec omni-dim">' + _who(log, name) + '의 결정이 아직 없어요</div>';
    var real = _real('Reasoning') && _fn('Reasoning', 'explain');
    var cards = decs.map(function(d) {
      var ev = d.ev, pre = ev.pre || {};
      var out = '<div class="omni-tcard ' + _esc(_actCls(_actKey(ev))) + '"><div class="omni-tcard-head">' + _esc(_actIcon(_actKey(ev))) + ' ' + _esc(_actHead(ev)) + '</div>';
      if (ev.hero && typeof ev.hero === 'object') {
        var h = ev.hero, diff = (h.actualEV != null && h.bestEV != null) ? Math.round((h.actualEV - h.bestEV) * 10) / 10 : null;
        out += '<div class="omni-row">내 결정 <b>' + _esc(_actKor(h.executed || h.intended || ev.act)) + '</b>' +
          (h.verdict ? ', 판정 ' + (LIGHT_ICON[h.light] || '') + ' 추천 ' + _esc(_actKor(h.verdict)) + (diff != null && diff !== 0 ? '(EV ' + _signed(diff) + 'bb)' : '') : '') +
          (h.eq != null ? ', 승률 ' + Math.round(Number(h.eq) * 100) + '%' : '') + '</div>';
      } else if (real) {
        var ex = _call('Reasoning', 'explain', log, d.i);
        if (ex) {
          if (ex.thought) out += '<div class="omni-thought"><span class="omni-lb omni-lb-char">캐릭터 읽기(정답 아님)</span> ' + _esc(ex.thought) + '</div>';
          (ex.lines || []).slice(0, 3).forEach(function(l) { out += '<div class="omni-row omni-rule">' + _esc(l) + '</div>'; });
          if (ex.random && ex.random.p != null) out += '<div class="omni-row omni-dim">확률 분기 ' + Math.round(Number(ex.random.p) * 100) + '%, 이번엔 ' + (ex.random.hit ? '걸렸어요' : '안 걸렸어요') + '</div>';
          if (ex.mismatch) out += '<div class="omni-row omni-dim">(보정이나 강등으로 표와 달랐어요)</div>';
        } else out += '<div class="omni-row omni-dim">이 결정의 규칙 설명이 없어요</div>';
      } else {
        out += '<div class="omni-row omni-dim">분석 모듈 준비 중(' + _esc(_typeWord(log, p)) + '의 규칙 설명은 곧 들어와요)</div>';
      }
      // 팟 오즈(순수 계산): 콜 금액 = 현재 벳 - 이미 넣은 칩
      var toCall = Math.max(0, (Number(pre.cb) || 0) - (Number(pre.have) || 0)), pot0 = Number(pre.pot) || 0;
      if (toCall > 0) out += '<div class="omni-row omni-odds"><span class="omni-lb">엔진 계산</span> 콜 ' + _fmt(toCall) + 'bb, 팟 ' + _fmt(pot0) + 'bb, 필요 승률 ' + Math.round(toCall / (pot0 + toCall) * 100) + '%</div>';
      if (ev.ov) out += '<div class="omni-row omni-dim">' + (ev.ov === 'adaptive' ? '적응 보정 적용 핸드' : ev.ov === 'career' ? '커리어 라이벌 보정 적용 핸드' : _esc(ev.ov)) + '</div>';
      return out + '</div>';
    });
    var hid = log.hidden ? '<div class="omni-row omni-dim">유형 숨김 테이블이라 유형 낱말 없이 보여요(세션이 끝난 뒤에만 열려요)</div>' : '';
    return '<div class="omni-sec">' + hid + cards.join('') + '</div>';
  }
  function _timeTab(log, name, frames, fi) {
    var n = frames.length;
    var list = frames.map(function(f) {
      var cur = f.i === fi, cls = 'omni-fr omni-k-' + f.kind + (f.act ? ' ' + _actCls(f.act) : '') + (cur ? ' cur' : '') + (f.actor === name && f.kind === 'a' ? ' mine' : '');
      var icon = f.kind === 'a' ? _actIcon(f.act) : f.kind === 's' ? '▦' : f.kind === 'e' ? '🏁' : f.kind === 'n' ? '💰' : '🃏';
      var hero = (f.hero && typeof f.hero === 'object' && f.hero.light) ? ' ' + (LIGHT_ICON[f.hero.light] || '') : '';
      return '<button type="button" class="' + cls + '" data-fi="' + f.i + '" aria-current="' + (cur ? 'true' : 'false') + '">' +
        '<span class="omni-fr-n">' + (f.i + 1) + '</span><span class="omni-fr-ic" aria-hidden="true">' + _esc(icon) + '</span><span class="omni-fr-t">' + _esc(f.text) + hero + '</span></button>';
    }).join('');
    return '<div class="omni-sec">' + _barHTML(fi, n) + '<div class="omni-list" role="list">' + list + '</div></div>';
  }
  // 재생 바(⏮ ◀ 7 / 23 ▶ ⏭), 48px
  function _barHTML(fi, n) {
    return '<div class="omni-bar" role="group" aria-label="재생">' +
      '<button type="button" class="omni-go" data-go="first" aria-label="처음으로"' + (fi <= 0 ? ' disabled' : '') + '>⏮</button>' +
      '<button type="button" class="omni-go" data-go="prev" aria-label="앞 장면"' + (fi <= 0 ? ' disabled' : '') + '>◀</button>' +
      '<span class="omni-pos" aria-live="polite">' + (n ? (fi + 1) + ' / ' + n : '0 / 0') + '</span>' +
      '<button type="button" class="omni-go" data-go="next" aria-label="다음 장면"' + (fi >= n - 1 ? ' disabled' : '') + '>▶</button>' +
      '<button type="button" class="omni-go" data-go="last" aria-label="끝으로"' + (fi >= n - 1 ? ' disabled' : '') + '>⏭</button>' +
      '</div>';
  }
  // 패널 아래 줄: 라이브 세션에서 리플레이 중이면 '▶ 라이브로', 기록 리플레이면 '↩ 기록으로'
  function _footHTML(s) {
    if (!s) return '';
    if (s.mode === 'history') return '<div class="omni-foot"><button type="button" class="omni-btn" data-act="back">↩ 기록으로</button><button type="button" class="omni-btn omni-btn-close" data-act="close">닫기</button></div>';
    return '<div class="omni-foot">' + (s.replaying ? '<button type="button" class="omni-btn omni-btn-live" data-act="live">▶ 라이브로</button>' : '') +
      '<button type="button" class="omni-btn omni-btn-close" data-act="close">닫기</button></div>';
  }

  // ── DOM: 패널(폰 하단 시트, 데스크톱 모달) ──
  var _panelEl = null;   // 만든 패널 요소(문서 스텁은 id 검색이 안 되므로 직접 기억)
  var _rootEl = null;    // 기록 리플레이의 타임라인 바 #omni-root
  function _panel() { return (_panelEl && _panelEl.parentNode) ? _panelEl : _el('omni-panel'); }
  function _ensurePanel() {
    var d = _doc();
    if (!d || typeof d.createElement !== 'function') return null;
    var root = _panel();
    if (root && root.parentNode) return root;
    root = d.createElement('div');
    root.id = 'omni-panel';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '완전 분석');
    root.innerHTML = '<div class="omni-backdrop" data-act="close"></div>' +
      '<div class="omni-box"><button type="button" class="omni-handle" data-act="close" aria-label="분석 패널 닫기">' +
      '<span class="omni-grip" aria-hidden="true"></span><span class="omni-title">🔍 완전 분석</span><span class="omni-handle-who"></span><span class="omni-x" aria-hidden="true">✕</span></button>' +
      '<div class="omni-content"></div><div class="omni-footwrap"></div></div>';
    var parent = _el('screen-game') || d.body;
    if (parent && parent.appendChild) parent.appendChild(root);
    if (typeof root.addEventListener === 'function') root.addEventListener('click', _onPanelClick);
    _panelEl = root;
    return root;
  }
  function _renderPanel() {
    var s = _sess;
    if (!s || !s.panelOpen) return;
    var root = _ensurePanel();
    if (!root) return;
    root.className = 'omni-panel ' + (_isMobile() ? 'omni-sheet' : 'omni-modal');
    root.style.display = '';
    _placeSheet(root);
    var content = root.querySelector ? root.querySelector('.omni-content') : null;
    var fi = s.replaying || s.mode === 'history' ? s.fi : null;
    var keep = 0;
    if (content) {
      var lst = content.querySelector ? content.querySelector('.omni-list') : null;
      keep = lst ? (lst.scrollTop || 0) : 0;
      content.innerHTML = panelHTML(s.log, s.name, s.tab, fi);
      var lst2 = content.querySelector ? content.querySelector('.omni-list') : null;
      if (lst2 && keep) lst2.scrollTop = keep;
    }
    var who = root.querySelector ? root.querySelector('.omni-handle-who') : null;
    if (who) who.textContent = _whoText(s.log, s.name);
    var foot = root.querySelector ? root.querySelector('.omni-footwrap') : null;
    if (foot) foot.innerHTML = _footHTML(s);
    s.evLen = (s.log.ev && s.log.ev.length) || 0;
    _markFocus();
  }
  // 폰 시트는 액션바(또는 결과바, 기록 리플레이의 #omni-root)를 덮지 않게 그 위에 붙인다(차트 시트와 같은 규칙). 데스크톱 모달은 그대로.
  // 라이브 리플레이 중(결정 중이라 액션바가 남아 있을 때)은 테이블 장면이 보여야 하므로 시트 높이를 줄인다(뷰포트 36%는 테이블, 시트 최소 300px).
  // 결과바는 리플레이 중 CSS(omni-replaying)로 숨겨 시트가 바닥에 붙고 테이블 위 38dvh가 보인다
  function _placeSheet(root) {
    if (!root || !root.style) return;
    var off = 0, ih = 0;
    if (_isMobile() && typeof window !== 'undefined' && window && window.innerHeight) {
      ih = window.innerHeight;
      ['omni-root', 'action-bar', 'result-actions-bar'].forEach(function(id) {
        var b = _el(id);
        if (!b || typeof b.getBoundingClientRect !== 'function' || !b.style || b.style.display === 'none') return;
        var r = b.getBoundingClientRect();
        if (r.height > 0 && r.bottom > ih - 2 && r.top > ih * 0.4) off = Math.max(off, ih - r.top);
      });
    }
    // 가로 폰 간이 배치는 #screen-game에 zoom이 걸려 fixed 좌표도 줄어든다. 실제 높이와 레이아웃 높이의 비로 되돌린다
    var z = 1;
    if (off && typeof root.getBoundingClientRect === 'function' && root.offsetHeight) {
      z = root.getBoundingClientRect().height / root.offsetHeight;
      if (!(z > 0) || Math.abs(z - 1) <= 0.01) z = 1;
      off = off / z;
    }
    root.style.bottom = off ? Math.round(off) + 'px' : '';
    var box = root.querySelector ? root.querySelector('.omni-box') : null;
    if (!box || !box.style) return;
    var cap = '';
    if (off && ih && _sess && _sess.mode === 'live' && _sess.replaying) {
      var h = Math.max(300, Math.min(ih * 0.62, ih - off * z - ih * 0.36)) / z;
      cap = Math.round(h) + 'px';
    }
    box.style.height = cap;
  }
  function _whoText(log, name) {
    var p = _playerOf(log, name);
    if (!p) return String(name || '');
    return (p.hero ? '나' : p.name) + (p.pos ? ' (' + p.pos + ')' : '');
  }
  function _hidePanel() {
    var root = _panel();
    if (root && root.style) root.style.display = 'none';
    if (_sess) _sess.panelOpen = false;
  }
  function _onPanelClick(e) {
    var t = e && e.target;
    if (!t || typeof t.closest !== 'function') return;
    var el;
    if ((el = t.closest('[data-act]'))) {
      var act = el.getAttribute('data-act');
      if (act === 'close') closePanel();
      else if (act === 'live') live();
      else if (act === 'back') _toHistory();
      else if (act === 'analyze' && _sess) openPanel(_sess.log, _sess.name, _sess.tab === 'time' ? 'hand' : _sess.tab, _sess.fi, { mode: _sess.mode });
      return;
    }
    if ((el = t.closest('.omni-tab'))) { setTab(el.getAttribute('data-tab')); return; }
    if ((el = t.closest('.omni-persp'))) { setPerspective(el.getAttribute('data-name')); return; }
    if ((el = t.closest('.omni-fr'))) { selectFrame(Number(el.getAttribute('data-fi'))); return; }
    if ((el = t.closest('.omni-go'))) { step(el.getAttribute('data-go')); return; }
    if ((el = t.closest('.gv-chip'))) { var GCv = _m('GtoChart'); if (GCv && typeof GCv.onViewChip === 'function') { try { GCv.onViewChip(el); } catch (e) { _warn('view', e); } } return; }
    if ((el = t.closest('.omni-dec-chip'))) {
      var k = el.getAttribute('data-dec'), box = el.closest('.omni-sec');
      if (!box || !box.querySelectorAll) return;
      Array.prototype.forEach.call(box.querySelectorAll('.omni-dec-chip'), function(c) { c.setAttribute('aria-selected', c.getAttribute('data-dec') === k ? 'true' : 'false'); });
      Array.prototype.forEach.call(box.querySelectorAll('.omni-dec'), function(dv) { dv.hidden = dv.getAttribute('data-dec') !== k; });
    }
  }

  // ── 열기, 탭, 관점, 프레임 ──
  // opts = { mode: 'live' | 'history' }. 열렸으면 true
  function openPanel(log, name, tab, fi, opts) {
    if (!log || !Array.isArray(log.players) || !log.players.length) return false;
    opts = opts || {};
    if (_sess && _sess.log !== log) {
      // 다른 핸드의 로그: 기록 리플레이 화면이면 정리, 라이브 패널이면 닫고 새로
      if (_sess.mode === 'history') _teardownHistory();
      else { _hidePanel(); _clearFocus(); _unbindAll(_sess); _sess = null; }
    }
    if (!_sess) _sess = { log: log, name: null, tab: 'hand', fi: null, mode: opts.mode || 'live', replaying: false, panelOpen: false, root: null, bar: null, unbind: [], evLen: 0 };
    _sess.name = _playerOf(log, name) ? name : _heroName(log);
    _sess.tab = TAB_KEYS[tab] ? tab : _sess.tab || 'hand';
    if (fi != null) _sess.fi = _clampFi(framesOf(log), fi);
    _sess.panelOpen = true;
    if (_hasDom()) _renderPanel();
    return true;
  }
  function closePanel() {
    if (!_sess) return false;
    if (_sess.mode === 'history') { _hidePanel(); return true; }
    if (_sess.replaying) live();
    _hidePanel();
    _clearFocus();
    var s = _sess; _sess = null;
    _unbindAll(s);
    return true;
  }
  function setTab(tab) {
    if (!_sess || !TAB_KEYS[tab]) return false;
    _sess.tab = tab;
    if (_hasDom()) _renderPanel();
    return true;
  }
  function setPerspective(name) {
    if (!_sess || !_playerOf(_sess.log, name)) return false;
    _sess.name = name;
    _markFocus();
    if (_hasDom()) _renderPanel();
    return true;
  }
  // 타임라인 프레임 선택: 테이블을 그 장면으로(Table.render, replay: true, revealAll: true). 그린 상태 사본을 돌려준다(없으면 null)
  function selectFrame(i) {
    if (!_sess) return null;
    var frames = framesOf(_sess.log);
    if (!frames.length) return null;
    _sess.fi = _clampFi(frames, i);
    var f = frames[_sess.fi];
    var was = _sess.replaying;
    _sess.replaying = true;
    var view = f.view;
    if (view && (view.replay !== true || view.revealAll !== true)) { view = Object.assign({}, view, { replay: true, revealAll: true }); }
    if (_fn('Table', 'render')) _call('Table', 'render', view);
    var sc = _el('screen-game');
    if (sc && sc.classList && _sess.mode === 'live') sc.classList.add('omni-replaying');
    if (_hasDom()) {
      // 이미 리플레이 중이면 장면만 바뀐다: 타임라인 탭은 현재 줄과 재생 바만 고치고(패널 전체 다시 그리기와 강제 레이아웃을 피한다),
      // 차트와 생각 탭은 장면과 무관. 손 탭(족보, 투입)과 처음 리플레이에 들어갈 때(아래 줄 '▶ 라이브로', 시트 배치)는 전체
      if (!was || !_sess.panelOpen || _sess.tab === 'hand' || (_sess.tab === 'time' && !_patchTimeline())) _renderPanel();
      _renderBar();
    }
    _markFocus();
    return view;
  }
  // 타임라인 탭 제자리 갱신: 현재 프레임 줄(cur, aria-current)과 재생 바. 패널이 없거나 모양이 다르면 false(전체 다시 그리기)
  function _patchTimeline() {
    var s = _sess, root = _panel();
    if (!s || !root || !root.querySelector || !root.querySelectorAll) return false;
    var rows = root.querySelectorAll('.omni-content .omni-fr'), bar = root.querySelector('.omni-content .omni-bar');
    var n = framesOf(s.log).length;
    if (!rows || rows.length !== n || !bar || !bar.parentNode) return false;
    for (var i = 0; i < rows.length; i++) {
      var on = Number(rows[i].getAttribute('data-fi')) === s.fi;
      rows[i].classList.toggle('cur', on);
      rows[i].setAttribute('aria-current', on ? 'true' : 'false');
    }
    bar.outerHTML = _barHTML(s.fi, n);
    return true;
  }
  function step(how) {
    if (!_sess) return null;
    var n = framesOf(_sess.log).length, cur = _sess.replaying || _sess.mode === 'history' ? _clampFi(framesOf(_sess.log), _sess.fi) : n - 1;
    var to = how === 'first' ? 0 : how === 'last' ? n - 1 : how === 'prev' ? cur - 1 : cur + 1;
    return selectFrame(Math.max(0, Math.min(n - 1, to)));
  }
  // 라이브 테이블로 되돌리기(라이브 세션만). 마지막 라이브 상태가 있으면 그것, 없으면 로그의 마지막 장면
  function live() {
    if (!_sess || _sess.mode !== 'live') return false;
    _sess.replaying = false;
    var sc = _el('screen-game');
    if (sc && sc.classList) sc.classList.remove('omni-replaying');
    var st = _lastLive;
    if (!st) { var fr = framesOf(_sess.log); st = fr.length ? fr[fr.length - 1].view : null; }
    if (st && _fn('Table', 'render')) _call('Table', 'render', st);
    if (_hasDom()) _renderPanel();
    _markFocus();
    return true;
  }

  // ── 좌석 고리(.omni-focus) ──
  function _seatEl(log, name) {
    var p = _playerOf(log, name);
    return p && p.pos ? _el('seat-' + p.pos) : null;
  }
  function _clearFocus() {
    var d = _doc();
    if (!d || typeof d.querySelectorAll !== 'function') return;
    var list = d.querySelectorAll('#screen-game .seat.omni-focus');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('omni-focus');
  }
  function _markFocus() {
    _clearFocus();
    if (!_sess || !_sess.panelOpen) return;
    var el = _seatEl(_sess.log, _sess.name);
    if (el && el.classList) el.classList.add('omni-focus');
  }

  // ── 결과바 '⏪ 리플레이'(라이브 세션, 직전 핸드) ──
  function openLast() {
    var log = _call('HandLog', 'last') || _call('HandLog', 'current');
    if (!log) { _toast('리플레이할 핸드 로그가 없어요'); return false; }
    if (log.hiddenUntil) { _toast('유형 숨김 테이블은 세션이 끝난 뒤에 볼 수 있어요'); return false; }
    if (_sess && _sess.mode === 'history') _teardownHistory();
    openPanel(log, _heroName(log), 'time', 0, { mode: 'live' });
    selectFrame(0);
    return true;
  }

  // ── 기록 화면의 '🔍 완전 분석': 게임 화면을 빌려 타임라인 바(#omni-root)를 액션바 자리에 ──
  function open(logKey, opts) {
    opts = opts || {};
    var log = (logKey && typeof logKey === 'object') ? logKey : _call('HandLog', 'get', logKey);
    if (!log || !Array.isArray(log.players)) { _toast('이 핸드의 분석 로그가 없어요(최근 30핸드만 남아요)'); return false; }
    if (log.hiddenUntil) { _toast('유형 숨김 테이블은 세션이 끝난 뒤에 볼 수 있어요'); return false; }
    if (_sess) { if (_sess.mode === 'history') _teardownHistory(); else { _hidePanel(); _clearFocus(); _unbindAll(_sess); _sess = null; } }
    _sess = { log: log, name: _heroName(log), tab: 'time', fi: 0, mode: 'history', replaying: true, panelOpen: false, root: null, bar: null, unbind: [], evLen: 0, from: opts.from || 'history' };
    if (_fn('App', 'showScreen')) _call('App', 'showScreen', 'screen-game');
    var d = _doc(), sc = _el('screen-game');
    if (sc && sc.classList) { sc.classList.add('omni-replay'); if ('scrollTop' in sc) sc.scrollTop = 0; }
    if (d && typeof d.createElement === 'function' && sc) {
      var root = _rootEl || _el('omni-root');
      if (root && root.parentNode && root.parentNode.removeChild) root.parentNode.removeChild(root);
      root = d.createElement('div');
      root.id = 'omni-root';
      root.className = 'omni-root';
      root.setAttribute('role', 'region');
      root.setAttribute('aria-label', '리플레이');
      var bar = _el('action-bar');
      if (bar && bar.parentNode === sc && typeof sc.insertBefore === 'function') sc.insertBefore(root, bar);
      else if (typeof sc.appendChild === 'function') sc.appendChild(root);
      if (typeof root.addEventListener === 'function') root.addEventListener('click', _onPanelClick);
      _sess.root = root; _rootEl = root;
    }
    if (_fn('Nav', 'setBack')) {
      var s = _sess;
      var un = _call('Nav', 'setBack', 'screen-game', function() { if (_sess !== s) return false; _toHistory(); return true; });
      if (typeof un === 'function') _sess.unbind.push(un);
    }
    selectFrame(0);
    return true;
  }
  function _barHTMLFull(s) {
    var frames = framesOf(s.log), fi = _clampFi(frames, s.fi), f = frames[fi];
    return '<div class="omni-rline">' + (f ? '<span class="omni-fr-n">' + (fi + 1) + '</span> ' + _esc(f.text) : '') + '</div>' +
      '<div class="omni-rbar">' +
      '<button type="button" class="omni-btn omni-rback" data-act="back">↩ 기록으로</button>' +
      _barHTML(fi, frames.length) +
      '<button type="button" class="omni-btn omni-ranalyze" data-act="analyze">🔍 분석</button>' +
      '</div>';
  }
  function _renderBar() {
    var s = _sess;
    if (!s || s.mode !== 'history' || !s.root) return;
    s.root.innerHTML = _barHTMLFull(s);
  }
  function _toHistory() {
    var from = _sess && _sess.from;
    abort();
    if (_fn('HistoryUI', 'reopen')) _call('HistoryUI', 'reopen');
    else if (_fn('HistoryUI', 'open')) _call('HistoryUI', 'open', from === 'game' ? 'game' : 'menu');
    else if (_fn('App', 'showMenu')) _call('App', 'showMenu');
  }
  function _teardownHistory() {
    var s = _sess;
    _sess = null;
    var sc = _el('screen-game');
    if (sc && sc.classList) sc.classList.remove('omni-replay');
    var root = (s && s.root) || _rootEl || _el('omni-root');
    if (root && root.parentNode && root.parentNode.removeChild) root.parentNode.removeChild(root);
    _rootEl = null;
    _hidePanel();
    _clearFocus();
    _unbindAll(s);
  }
  function _unbindAll(s) {
    if (!s || !s.unbind) return;
    s.unbind.forEach(function(f) { try { f(); } catch (e) { /* 무시 */ } });
    s.unbind = [];
  }
  // 화면 전환 방어: 리플레이 화면 상태(omni-replay, omni-replaying, #omni-root, 패널, 좌석 고리)를 지운다. 무언가 정리했으면 true.
  // 리플레이 장면이 테이블에 남아 있으면 마지막 라이브 상태로 되돌린다(기록 리플레이 뒤 '↩ 게임으로 돌아가기'가 지난 핸드 장면을 보이지 않게)
  function abort() {
    var hit = false;
    if (_sess && _sess.replaying && _lastLive && _fn('Table', 'render')) _call('Table', 'render', _lastLive);
    var sc = _el('screen-game');
    if (sc && sc.classList) {
      if (sc.classList.contains('omni-replay')) { sc.classList.remove('omni-replay'); hit = true; }
      if (sc.classList.contains('omni-replaying')) { sc.classList.remove('omni-replaying'); hit = true; }
    }
    var root = (_sess && _sess.root) || _rootEl || _el('omni-root');
    if (root && root.parentNode && root.parentNode.removeChild) { root.parentNode.removeChild(root); hit = true; }
    _rootEl = null;
    var panel = _panel();
    if (panel && panel.parentNode && panel.style && panel.style.display !== 'none') { panel.style.display = 'none'; hit = true; }
    _clearFocus();
    if (_sess) { _unbindAll(_sess); _sess = null; hit = true; }
    return hit;
  }
  function active() { return !!_sess; }

  // ── 라이브 세션 표시(🔍 배지)와 좌석 탭 ──
  function _omniLive() { return !!_call('App', 'omni'); }
  function _syncBadge() {
    var chips = _el('eq-chips');
    if (!chips) return false;
    var on = _omniLive();
    var b = chips.querySelector ? chips.querySelector('#omni-badge') : null;
    if (on && !b) {
      var d = _doc();
      b = d.createElement('button');
      b.type = 'button';
      b.id = 'omni-badge';
      b.className = 'eq-chip omni-badge';
      b.setAttribute('aria-label', '완전 분석 세션');
      b.setAttribute('title', '완전 분석 세션: 좌석을 누르면 그 사람의 카드, 차트, 생각을 볼 수 있어요');
      b.textContent = '🔍';
      b.addEventListener('click', function() { _toast('완전 분석 세션이에요. 좌석을 누르면 그 사람의 카드, 차트, 생각이 보여요'); });
      if (chips.firstChild && chips.insertBefore) chips.insertBefore(b, chips.firstChild); else chips.appendChild(b);
    } else if (!on && b && b.parentNode) b.parentNode.removeChild(b);
    return on;
  }
  function _onDocClick(e) {
    var t = e && e.target;
    if (!t || typeof t.closest !== 'function') return;
    var seat = t.closest('#screen-game .poker-table .seat');
    if (!seat || !seat.id || seat.id.indexOf('seat-') !== 0) return;
    var sc = _el('screen-game');
    if (sc && sc.classList && (sc.classList.contains('th-on'))) return;   // 극장은 자기 좌석 규칙
    var log = _sess ? _sess.log : null;
    if (!log) {
      if (!_omniLive()) return;
      log = _call('HandLog', 'current') || _call('HandLog', 'last');
      if (!log) return;
    }
    var name = _nameAtPos(log, seat.id.slice(5));
    if (!name) return;
    openPanel(log, name, _sess ? _sess.tab : 'hand', null, { mode: _sess ? _sess.mode : 'live' });
    if (e.preventDefault) e.preventDefault();
    _call('TouchUI', 'hideTip');   // 좌석 탭이 HUD 설명 팁(touch.js, 캡처 단계)을 같이 띄우면 패널 머리를 가리므로 닫는다
  }
  // Table.render 뒤(좌석 className이 다시 쓰임): 고리 다시, 배지 동기화, 라이브 패널은 로그가 자랐으면 다시 그림
  function _afterRender() {
    _syncBadge();
    if (!_sess) return;
    _markFocus();
    if (_sess.mode === 'live' && _sess.panelOpen && !_sess.replaying) {
      var n = (_sess.log.ev && _sess.log.ev.length) || 0;
      if (n !== _sess.evLen) _renderPanel();
    }
  }
  // Table.render 래퍼: 마지막 라이브 상태(_lastLive)를 기억한다. 다른 코드가 Table.render를 바꿔 끼웠으면 다시 감싼다
  function _hookTable() {
    var T = _m('Table');
    if (!T || typeof T.render !== 'function' || T.render === _hookedRender) return false;
    var orig = T.render;
    _hookedRender = T.render = function(st) {
      if (st && !st.replay && !st.spectator) _lastLive = st;
      return orig.apply(this, arguments);
    };
    return true;
  }
  function init() {
    if (_inited) return false;
    var d = _doc();
    if (!d || !_hasDom()) return false;
    _inited = true;
    if (typeof d.addEventListener === 'function') d.addEventListener('click', _onDocClick);
    _hookTable();
    try {
      var tbl = d.querySelector('#screen-game .poker-table');
      if (tbl && typeof MutationObserver !== 'undefined') {
        _obs = new MutationObserver(function() { _afterRender(); });
        _obs.observe(tbl, { childList: true, subtree: true });
      }
    } catch (e) { _warn('observe', e); }
    return true;
  }
  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { init(); });
    else if (document.readyState) setTimeout(function() { init(); }, 0);
  }

  // ── 테스트 ──
  // 주입 모듈이 바뀌면 프레임과 승률 캐시도 비운다(같은 로그 키라도 다른 Replay의 결과)
  function _setEnv(env) { _env = env || {}; _fcache = { key: null, frames: null }; _eqcache = { key: null, eq: null }; }
  function _reset() {
    abort();
    if (_panelEl && _panelEl.parentNode && _panelEl.parentNode.removeChild) _panelEl.parentNode.removeChild(_panelEl);
    _panelEl = null; _env = {}; _lastLive = null; _fcache = { key: null, frames: null }; _eqcache = { key: null, eq: null };
  }
  function _state() { return _sess ? { name: _sess.name, tab: _sess.tab, fi: _sess.fi, mode: _sess.mode, replaying: !!_sess.replaying, panelOpen: !!_sess.panelOpen } : null; }

  var api = { TABS: TABS.slice(), panelHTML: panelHTML, framesOf: framesOf, _framesFallback: _framesFallback, _chartCtx: _chartCtx,
    openPanel: openPanel, closePanel: closePanel, setTab: setTab, setPerspective: setPerspective, selectFrame: selectFrame, step: step, live: live,
    openLast: openLast, open: open, abort: abort, active: active, init: init,
    _setEnv: _setEnv, _reset: _reset, _state: _state, _syncBadge: _syncBadge, _afterRender: _afterRender, _onDocClick: _onDocClick, _hookTable: _hookTable };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
