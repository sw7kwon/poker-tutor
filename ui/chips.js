// ui/chips.js (클라우드 작업 K): 칩을 눈으로 보이게. 좌석 스택 칩 기둥, 이번 스트리트 벳 더미, 중앙 팟 더미, 승자 이동.
// 연결: ui/table.js는 고치지 않는다. 이 파일이 로드될 때 Table.render와 Table.renderShowdown을 한 번만 감싸
//   렌더 직후 ChipsUI.decorate(state)를 부른다(원본 반환값과 예외는 그대로). 감싸기 표식은 Table.__chipsWrapped.
// 그리기: DOM 쓰기는 rAF 1회에 묶는다(한 프레임에 여러 렌더가 오면 마지막 state만). 읽기(좌석과 팟 위치)는 쓰기 전에 한 번.
//   좌석 안에 .chips-seat(스택 기둥, 승자 배지), .poker-table 안에 .chips-layer(벳 더미 .chips-bets, 이동 .chips-fx),
//   .pot-display-wrap 맨 앞에 .chips-pot(팟 더미와 "팟 23.5bb"). 기존 숫자(.seat-stack, #pot-amount)는 지우지 않는다.
// 칩 단위(bb): 0.5 작은 회색, 1 흰색, 5 빨강, 25 초록, 100 검정, 500 보라. 색과 가장자리 무늬와 숫자를 함께 쓴다(색맹 대비).
// (웨이브2 후속) 좌석 스택은 기둥 1개: 높이가 스택 크기 구간(STACK_TIERS)을 따르고 색은 가장 큰 단위(stackColumn). 벳과 팟은 단위별 기둥 그대로.
// 설정: A11y 설정 키 chipVisual(기본 true)을 읽기만 한다. false면 decorate는 그린 것을 치우고 아무것도 하지 않는다.
// 모션: prefers-reduced-motion 또는 A11y.reduced()면 이동과 반짝임 없이 즉시 표시.
// 규약: 로드 때 DOM과 저장소에 닿지 않는다(typeof 가드). node 러너에서 로드돼도 안전하다. 테스트는 opts.doc으로 가짜 문서를 넣는다.
var ChipsUI = (function() {
  var UNITS = [500, 100, 25, 5, 1, 0.5];
  var UNIT_CLASS = { 500: 'u500', 100: 'u100', 25: 'u25', 5: 'u5', 1: 'u1', 0.5: 'u05' };
  var UNIT_LABEL = { 500: '500', 100: '100', 25: '25', 5: '5', 1: '1', 0.5: '½' };
  var MAX_PER_COL = 5;          // 단위당 그리는 최대 개수, 나머지는 +n
  var COLS_STACK = 3, COLS_BET = 3, COLS_POT = 4, COLS_FLY = 2;
  var POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var MQ = '(max-width: 600px), (orientation: portrait) and (max-width: 760px)';   // css/mobile.css, ui/mobile-ui.js와 같은 문자열
  var FLY_MS = 260, FLY_GAP = 120, EPS = 0.004;
  var SETTINGS_KEY = 'poker_journey_settings';

  var _prev = null;        // 마지막으로 그린 상태 요약 { key, pot, stacks, bets, anchors }
  var _awardKey = null;    // 승자 이동을 이미 보여 준 핸드 키
  var _pending = null;     // rAF 대기 중인 state
  var _rafOn = false;
  var _warned = false;

  // ── 순수 함수 ──
  function _r2(x) { return Math.round(x * 100) / 100; }
  function _num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fmt(bb) { return _num(bb).toFixed(1) + 'bb'; }
  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // breakdown(bb) → { total, chips: [{ unit, count }](큰 단위부터, 단위당 최대 5개), extra(+n으로 넘긴 개수), shown }
  // 0.5bb 아래 끝수(정산 0.01bb)는 버린다(숫자 라벨이 정확한 값을 보인다).
  function breakdown(bb) {
    var total = Math.max(0, _num(bb));
    var rest = Math.floor(total / 0.5 + 1e-6) * 0.5;
    var chips = [], extra = 0, shown = 0;
    for (var i = 0; i < UNITS.length; i++) {
      var u = UNITS[i];
      var n = Math.floor(rest / u + 1e-6);
      if (n <= 0) continue;
      rest = _r2(rest - n * u);
      var draw = Math.min(n, MAX_PER_COL);
      chips.push({ unit: u, count: draw });
      extra += n - draw;
      shown += draw;
    }
    return { total: total, chips: chips, extra: extra, shown: shown };
  }

  // 기둥 수를 maxCols로 제한한 더미 모델 → { cols: [{ unit, count }], extra }. 잘린 작은 단위는 extra(+n)로 넘긴다.
  function columns(bb, maxCols) {
    var b = breakdown(bb);
    var max = Math.max(1, maxCols || COLS_STACK);
    var cols = b.chips.slice(0, max), extra = b.extra;
    for (var i = max; i < b.chips.length; i++) extra += b.chips[i].count;
    return { cols: cols, extra: extra, total: b.total };
  }

  function colHTML(unit, count) {
    var cls = UNIT_CLASS[unit] || 'u1', out = '';
    for (var i = 0; i < count; i++) {
      out += (i === count - 1)
        ? '<i class="chip chip-top"><b>' + UNIT_LABEL[unit] + '</b></i>'
        : '<i class="chip"></i>';
    }
    return '<span class="chip-col ' + cls + '" title="' + (unit === 0.5 ? '0.5' : unit) + 'bb x ' + count + '">' + out + '</span>';
  }

  // 칩 더미 HTML(기둥 여러 개 + '+n')
  function pileHTML(bb, maxCols) {
    var c = columns(bb, maxCols), out = '';
    for (var i = 0; i < c.cols.length; i++) out += colHTML(c.cols[i].unit, c.cols[i].count);
    if (c.extra > 0) out += '<span class="chips-more">+' + c.extra + '</span>';
    return '<span class="chips-pile' + (c.cols.length ? '' : ' is-empty') + '">' + out + '</span>';
  }

  // (웨이브2 후속) 좌석 스택은 단위 개수가 아니라 높이로 보인다: 칩 수는 스택 크기의 구간(로그 눈금, STACK_TIERS 경계 미만이면 그 개수),
  // 색은 그 스택이 가진 가장 큰 단위(99bb = 초록 25, 100bb = 검정 100). 정확한 값은 좌석의 숫자 라벨(.seat-stack)이 보인다.
  //   0 → 없음, 5 미만 1개, 15 미만 2, 35 미만 3, 70 미만 4, 130 미만 5, 250 미만 6, 500 미만 7, 그 이상 8개
  var STACK_TIERS = [5, 15, 35, 70, 130, 250, 500];
  function stackColumn(bb) {
    var total = Math.max(0, _num(bb));
    var b = breakdown(total);
    if (!b.chips.length) return { unit: null, count: 0, total: total };
    var n = 1;
    for (var i = 0; i < STACK_TIERS.length; i++) if (total >= STACK_TIERS[i]) n = i + 2;
    return { unit: b.chips[0].unit, count: n, total: total };
  }
  // 좌석 스택 기둥(delta: 이전 렌더와 비교한 변화, 양수 초록, 음수 붉은 반짝임)
  function stackHTML(bb, delta) {
    var cls = 'chips-stack';
    if (delta > EPS) cls += ' chips-up'; else if (delta < -EPS) cls += ' chips-down';
    var c = stackColumn(bb);
    var pile = c.count ? '<span class="chips-pile">' + colHTML(c.unit, c.count) + '</span>' : '<span class="chips-pile is-empty"></span>';
    return '<span class="' + cls + '" aria-hidden="true">' + pile + '</span>';
  }

  // 벳 더미(좌석과 중앙 사이, 좌표는 .poker-table 안쪽 기준 px)
  function betHTML(bb, x, y, seatPos) {
    var pos = (x != null && y != null) ? ' style="left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px"' : '';
    if (seatPos) pos += ' data-pos="' + _esc(seatPos) + '"';
    return '<div class="chips-bet"' + pos + ' aria-hidden="true">' + pileHTML(bb, COLS_BET) + '<span class="chips-amt">' + fmt(bb) + '</span></div>';
  }

  // 사이드팟(순수): 올인(스택 0)인 생존자의 누적 투입이 다른 생존자보다 적을 때만 나눈다 → [메인, 사이드...] 합 = pot.
  // 아직 콜을 기다리는 벳 차이는 나누지 않는다(engine/game-state.js resolveShowdown의 레이어와 같은 기준, 표시용).
  function sidePots(state) {
    if (!state) return [];
    var pot = _num(state.pot);
    if (pot <= EPS) return [];
    var names = state.names || Object.keys(state.players || {});
    var contrib = state.totalContrib, stacks = state.stacks || {}, folded = state.folded || {};
    if (!contrib) return [pot];
    var active = names.filter(function(n) { return !folded[n]; });
    var maxC = 0;
    active.forEach(function(n) { maxC = Math.max(maxC, _num(contrib[n])); });
    var caps = [];
    active.forEach(function(n) {
      var c = _num(contrib[n]);
      if (_num(stacks[n]) <= EPS && c > EPS && c < maxC - EPS && caps.indexOf(c) < 0) caps.push(c);
    });
    if (!caps.length) return [pot];
    caps.sort(function(a, b) { return a - b; });
    var out = [], prev = 0, acc = 0;
    caps.forEach(function(level) {
      var layer = 0;
      names.forEach(function(n) { layer += Math.max(0, Math.min(_num(contrib[n]), level) - prev); });
      layer = _r2(layer);
      out.push(layer); acc += layer; prev = level;
    });
    out.push(_r2(pot - acc));
    return out.filter(function(x) { return x > EPS; });
  }

  // 중앙 팟 안쪽 HTML: 더미(메인/사이드로 나눠) + "팟 23.5bb" + 사이드 줄
  function potHTML(pot, pots) {
    pot = _num(pot);
    pots = (pots && pots.length) ? pots : (pot > EPS ? [pot] : []);
    var piles = '';
    for (var i = 0; i < pots.length; i++) {
      piles += '<span class="chips-pot-pile ' + (i === 0 ? 'chips-main' : 'chips-side') + '">' + pileHTML(pots[i], COLS_POT) + '</span>';
    }
    var sub = '';
    if (pots.length > 1) {
      var sides = pots.slice(1).map(function(x) { return x.toFixed(1); }).join(' + ');
      sub = '<span class="chips-pot-sub">메인 ' + pots[0].toFixed(1) + ' / 사이드 ' + sides + '</span>';
    }
    return '<span class="chips-pot-piles" aria-hidden="true">' + piles + '</span>' +
      '<span class="chips-pot-label">팟 <b>' + fmt(pot) + '</b></span>' + sub;
  }

  function handKey(state) { return (state && (state.seed + '#' + state.handNum)) || ''; }

  // 앉은 사람(관전이면 히어로 제외, ui/table.js _seatPlayers와 같은 규칙) → { pos: player }
  function seatPlayers(state) {
    var all = (state && state.players) || {}, out = {};
    Object.keys(all).forEach(function(k) {
      var p = all[k];
      if (!p || !p.pos) return;
      if (state.spectator && p.isHero) return;
      out[p.pos] = p;
    });
    return out;
  }

  // 모델(순수): 이번 렌더에 그릴 것과 이전 렌더와의 차이
  //   seats[pos] = { name, stack, bet, delta, hero, folded }, pots, award(이번에 팟이 0이 되며 스택이 늘어난 사람 { name: 양 }),
  //   moved(벳이 0으로 돌아가며 팟으로 간 사람 { name: 벳 }), potUp(팟이 늘었는지)
  function model(state, prev) {
    var key = handKey(state), same = !!(prev && prev.key === key);
    var players = seatPlayers(state);
    var stacks = state.stacks || {}, bets = state.playerBets || {}, folded = state.folded || {};
    var pot = _num(state.pot);
    var award = null, moved = null;
    var potZero = pot <= EPS;
    if (same && prev.pot > EPS && potZero) {
      award = {};
      Object.keys(stacks).forEach(function(n) {
        var d = _r2(_num(stacks[n]) - _num(prev.stacks[n]));
        if (d > EPS) award[n] = d;
      });
      if (!Object.keys(award).length) award = null;
    }
    if (same && prev.bets) {
      Object.keys(prev.bets).forEach(function(n) {
        var was = _num(prev.bets[n]);
        if (was > EPS && _num(bets[n]) <= EPS && (pot >= prev.pot - EPS || potZero)) {
          if (!moved) moved = {};
          moved[n] = was;
        }
      });
    }
    var seats = {};
    POSITIONS.forEach(function(pos) {
      var p = players[pos];
      if (!p) return;
      var n = p.name, stack = _num(stacks[n]);
      var bet = (potZero && state.handOver) ? 0 : _num(bets[n]);
      seats[pos] = {
        name: n, stack: stack, bet: bet > EPS ? bet : 0,
        delta: same && prev.stacks && prev.stacks[n] != null ? _r2(stack - _num(prev.stacks[n])) : 0,
        hero: !!p.isHero, folded: !!folded[n]
      };
    });
    return { key: key, same: same, pot: pot, pots: sidePots(state), seats: seats, award: award, moved: moved,
      potUp: same && pot > prev.pot + EPS };
  }

  function snapshot(m, anchors) {
    var stacks = {}, bets = {};
    Object.keys(m.seats).forEach(function(pos) { var s = m.seats[pos]; stacks[s.name] = s.stack; bets[s.name] = s.bet; });
    return { key: m.key, pot: m.pot, stacks: stacks, bets: bets, anchors: anchors || {} };
  }

  // ── 설정 ──
  function settings() {
    try { if (typeof A11y !== 'undefined' && A11y && typeof A11y.load === 'function') return A11y.load() || {}; } catch (e) { /* 아래 */ }
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        var s = localStorage.getItem(SETTINGS_KEY);
        if (s) { var o = JSON.parse(s); if (o && typeof o === 'object') return o; }
      }
    } catch (e) { /* 기본값 */ }
    return {};
  }
  // chipVisual: 끄는 값(false, 0, 'false')만 끔, 나머지(없음 포함)는 켬
  function enabled(s) {
    var v = (s || settings()).chipVisual;
    return !(v === false || v === 0 || v === 'false');
  }
  function reduced() {
    try { if (typeof A11y !== 'undefined' && A11y && typeof A11y.reduced === 'function') return !!A11y.reduced(); } catch (e) { /* 아래 */ }
    try { if (typeof matchMedia === 'function') { var m = matchMedia('(prefers-reduced-motion: reduce)'); return !!(m && m.matches); } } catch (e) { /* 기본 */ }
    return false;
  }
  function mobile(doc) {
    try {
      var w = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
      var mm = (w && typeof w.matchMedia === 'function') ? w.matchMedia : (typeof matchMedia === 'function' ? matchMedia : null);
      if (!mm) return false;
      var m = mm(MQ);
      return !!(m && m.matches);
    } catch (e) { return false; }
  }

  // ── DOM 도우미(전부 가드) ──
  function _doc(opts) {
    if (opts && opts.doc) return opts.doc;
    return (typeof document !== 'undefined' && document) ? document : null;
  }
  function _q(root, sel) { try { return (root && typeof root.querySelector === 'function') ? root.querySelector(sel) : null; } catch (e) { return null; } }
  function _byId(doc, id) { try { return (doc && typeof doc.getElementById === 'function') ? doc.getElementById(id) : null; } catch (e) { return null; } }
  function _mk(doc, cls) {
    if (!doc || typeof doc.createElement !== 'function') return null;
    var el = doc.createElement('div');
    if (!el) return null;
    el.className = cls;
    return el;
  }
  function _hasClass(el, c) {
    if (!el) return false;
    if (el.classList && typeof el.classList.contains === 'function') return el.classList.contains(c);
    return (' ' + String(el.className || '') + ' ').indexOf(' ' + c + ' ') >= 0;
  }
  function _timer(fn, ms) {
    try { if (typeof setTimeout === 'function') setTimeout(fn, ms); } catch (e) { /* 없음 */ }
  }

  // 위치 읽기: .poker-table 안쪽(테두리 제외) px 좌표. 테이블이 안 보이면(폭 0) null.
  function readGeom(doc, table, posList) {
    if (!table || typeof table.getBoundingClientRect !== 'function') return null;
    var tr = table.getBoundingClientRect();
    if (!tr || !(tr.width > 0)) return null;
    var ow = table.offsetWidth || tr.width;
    var scale = (tr.width / ow) || 1;
    var bl = table.clientLeft || 0, bt = table.clientTop || 0;
    var cw = table.clientWidth || (ow - 2 * bl), ch = table.clientHeight || ((table.offsetHeight || tr.height / scale) - 2 * bt);
    function local(el) {
      if (!el || typeof el.getBoundingClientRect !== 'function') return null;
      var r = el.getBoundingClientRect();
      if (!r || !(r.width > 0)) return null;
      return { x: (r.left - tr.left) / scale - bl, y: (r.top - tr.top) / scale - bt, w: r.width / scale, h: r.height / scale };
    }
    var g = { center: { x: cw / 2, y: ch / 2 }, seats: {}, pot: null, mobile: mobile(doc), avoid: [] };
    // 가로 한계(테이블 안쪽 좌표): 화면 폭 안. 벳 더미가 좁은 폰(320, 360)에서 화면 밖으로 나가 가로 스크롤을 만들지 않게(로컬 확인 수정)
    var vw = 0;
    try { vw = (doc && doc.documentElement && doc.documentElement.clientWidth) || ((typeof window !== 'undefined' && window && window.innerWidth) || 0); } catch (e) { vw = 0; }
    if (vw > 0) { g.xLim = [(0 - tr.left) / scale - bl, (vw - tr.left) / scale - bl]; g.vw = vw; }
    var potWrap = _q(doc, '.pot-display-wrap');
    var pr = local(potWrap);
    g.pot = pr ? { x: pr.x + pr.w / 2, y: pr.y + pr.h / 2 } : g.center;
    if (pr) g.avoid.push(pr);
    var board = _byId(doc, 'board-cards');
    var br = (board && board.children && board.children.length) ? local(board) : null;
    if (br) g.avoid.push(br);
    var hi = local(_byId(doc, 'hand-info'));
    if (hi) g.avoid.push(hi);
    var band = local(_byId(doc, 'ct-band'));   // (웨이브2 후속) 커리어 토너먼트 띠
    if (band) g.avoid.push(band);
    posList.forEach(function(pos) {
      var el = _byId(doc, 'seat-' + pos);
      var r = local(el);
      if (!r) return;
      var tag = local(_q(el, '.seat-tag'));   // (n2-G1) 좌석 바깥 모서리 포지션 묶음(자기 좌석 더미는 마지막 수단으로 덮을 수 있다, r.tag)
      if (tag) g.avoid.push(tag);
      r.slot = (el.getAttribute && el.getAttribute('data-slot')) || null;
      if (tag) r.tag = tag;
      g.seats[pos] = r;
    });
    return g;
  }

  // 벳 더미 자리: 좌석 테두리에서 팟 쪽으로 조금 나간 점. 팟 표시와 보드 카드(g.avoid)에 겹치면 좌석 쪽으로 물린다.
  // 폰 히어로(slot 0)는 말풍선이 위 가운데, 포지션 묶음이 왼쪽 위라 좌석 오른쪽 위 모서리(n2-G1).
  // 더미 크기 어림: 데스크톱은 가로 배치(칩 옆에 숫자) 90x32, 폰은 세로 배치 56x42(n2-G1: 금액 글자 .78rem).
  // 좌석 포지션 묶음(.seat-tag, readGeom이 g.avoid에 넣는다)도 피한다.
  //   폰 폭은 벳 금액을 알면 글자 수로 어림한다(금액 글자 약 7px + 안쪽 여백과 테두리 14px, '3.0bb' 49, '12.5bb' 56, '100.0bb' 63). 모르면 56
  var PILE_W_M = 56, PILE_H_M = 42, PILE_W_D = 90, PILE_H_D = 32;
  function _pileW(g, bet) {
    if (!g.mobile) return PILE_W_D;
    if (!(bet > 0)) return PILE_W_M;
    return Math.max(42, Math.round(fmt(bet).length * 7 + 14));
  }
  //   폰 높이도 금액을 알면 칩 기둥 높이(윗면 13 + 아래 칩마다 4) + 틈 1 + 금액 줄 20으로 어림한다(1bb 34, 3bb 42, 5개 기둥 50). 모르면 42
  //   (n2-G1) 320 폭(330 이하)은 벳 더미의 칩 그림을 숨기고 금액 알약만(css/chips.css) 보이므로 높이 20
  //   (n2-verify) 360 폭까지 넓힘: 360에서 위 가운데(UTG) 좌석 아래와 팟 사이 틈이 약 36px라 42px 더미가 들어가지 못해
  //   자기 포지션 묶음과 레이즈 말풍선 위에 내려앉았다(412x915 밖 360x780 실측)
  var COMPACT_VW = 360;
  function _pileH(g, bet) {
    if (!g.mobile) return PILE_H_D;
    if (g.vw > 0 && g.vw <= COMPACT_VW) return 20;
    if (!(bet > 0)) return PILE_H_M;
    var c = columns(bet, COLS_BET), n = 1;
    for (var i = 0; i < c.cols.length; i++) n = Math.max(n, c.cols[i].count);
    return 34 + (n - 1) * 4;
  }
  function _hits(x, y, w, h, rects) {
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (x - w / 2 < r.x + r.w && x + w / 2 > r.x && y - h / 2 < r.y + r.h && y + h / 2 > r.y) return true;
    }
    return false;
  }
  // 화면 가로 한계(g.xLim) 안에 더미 폭 pw가 다 들어가는지
  function _inX(x, pw, g) { return !g.xLim || (x - pw / 2 >= g.xLim[0] + 2 && x + pw / 2 <= g.xLim[1] - 2); }
  function _clampX(x, pw, g) {
    if (!g.xLim) return x;
    var lo = g.xLim[0] + 2 + pw / 2, hi = g.xLim[1] - 2 - pw / 2;
    return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, x));
  }
  function betAnchor(seat, g, bet) {
    var a = _betAnchor(seat, g, bet), pw = _pileW(g, bet);
    return { x: _clampX(a.x, pw, g), y: a.y };
  }
  function _betAnchor(seat, g, bet) {
    var cx = seat.x + seat.w / 2, cy = seat.y + seat.h / 2;
    var pw = _pileW(g, bet), ph = _pileH(g, bet);
    // (웨이브2 후속) 좁은 폰(320, 360)에서 벳 더미가 이웃 좌석 상자에 걸리던 것: 이웃 좌석도 피한다(화면 폭 안으로 민 자리 기준)
    var others = [];
    Object.keys(g.seats || {}).forEach(function(p) { var r = g.seats[p]; if (r && r !== seat) others.push(r); });
    if (g.mobile && String(seat.slot) === '0') {
      // 폰 히어로: 좌석 오른쪽 위 모서리(가운데 말풍선과 왼쪽 위 포지션 묶음을 피함). 오른쪽 이웃 좌석에 걸리면 왼쪽으로 민다(좌석 가운데 오른쪽까지)
      // (n2-G1) 헤즈업은 포지션 묶음이 길어(BTN, D, 0.5) 왼쪽 위 묶음에 걸리면 오른쪽(좌석 밖)으로 먼저 민다
      var hx = seat.x + seat.w - 10, hy = seat.y - 8, lim = seat.x + seat.w / 2 + pw / 2;
      var hav = g.avoid || [];
      var hxs = [hx];
      for (var hr = hx + 4; hr <= seat.x + seat.w + pw / 2 + 8; hr += 4) hxs.push(hr);
      for (var hl = hx - 4; hl >= lim; hl -= 4) hxs.push(hl);
      for (var hi = 0; hi < hxs.length; hi++) {
        var hc = _clampX(hxs[hi], pw, g);
        if (!_hits(hc, hy, pw, ph, others) && !_hits(hc, hy, pw, ph, hav)) return { x: hxs[hi], y: hy };
      }
      while (hx > lim && _hits(_clampX(hx, pw, g), hy, pw, ph, others)) hx -= 4;
      return { x: hx, y: hy };
    }
    var dx = g.pot.x - cx, dy = g.pot.y - cy, len = Math.sqrt(dx * dx + dy * dy);
    if (!len) return { x: cx, y: cy };
    var ux = dx / len, uy = dy / len;
    var t = Math.min(seat.w / 2 / Math.max(Math.abs(ux), 1e-6), seat.h / 2 / Math.max(Math.abs(uy), 1e-6));
    var off = g.mobile ? 24 : 26;
    var avoid = g.avoid || [];
    // (n2-G1 리뷰) 폰: 바깥 자리를 찾는 동안은 자기 좌석 안으로 6px 넘게 들어가지 않는다(더미가 56px로 커져 옆 좌석 말풍선과 스택 막대를 가리던 것).
    // 좌석 안쪽(o < 0)은 맨 마지막 수단 그대로(free0)
    var OWN_TOL = 6;
    var ownIn = g.mobile ? { x: seat.x + OWN_TOL, y: seat.y + OWN_TOL, w: Math.max(0, seat.w - 2 * OWN_TOL), h: Math.max(0, seat.h - 2 * OWN_TOL) } : null;
    function ok(x, y, av) { return !_hits(x, y, pw, ph, av) && !_hits(x, y, pw, ph, others) && !(ownIn && _hits(x, y, pw, ph, [ownIn])); }
    function free(x, y, av) { return ok(_clampX(x, pw, g), y, av); }
    function free0(x, y, av) { var xc = _clampX(x, pw, g); return !_hits(xc, y, pw, ph, av) && !_hits(xc, y, pw, ph, others); }
    function along(o) { return { x: cx + ux * (t + o), y: cy + uy * (t + o) }; }
    // (n2-G1) 기본 자리가 포지션 묶음 같은 작은 것에 걸리면 먼저 조금 더 바깥(+6, +12)을 본다. 그다음 좌석 쪽으로 물린다
    function farther(av) {
      var p0 = along(off);
      if (_hits(_clampX(p0.x, pw, g), p0.y, pw, ph, av)) {
        var fs = [off + 6, off + 12];
        for (var f = 0; f < fs.length; f++) { var p = along(fs[f]); if (free(p.x, p.y, av)) return p; }
      }
      return null;
    }
    // 팟 쪽에 자리가 없으면(데스크톱 히어로 위 보드와 핸드 번호) 좌석 모서리 바깥(팟 쪽 변, 오른쪽 먼저). 다른 좌석과도 안 겹치게
    function corner(av) {
      var cy2 = (cy < g.pot.y) ? seat.y + seat.h - ph / 2 + 2 : seat.y + ph / 2 - 2;
      var gaps = [8, 16, 24];
      for (var k = 0; k < gaps.length; k++) {
        var cands = [seat.x + seat.w + gaps[k] + pw / 2, seat.x - gaps[k] - pw / 2];
        for (var c = 0; c < cands.length; c++) {
          if (_inX(cands[c], pw, g) && ok(cands[c], cy2, av)) return { x: cands[c], y: cy2 };
        }
      }
      return null;
    }
    // (웨이브2 검증) 폰에서 팟 쪽 바깥 자리가 다 막히면 좌석 안으로 물리기(이름 글자를 가림) 전에 좌석 위나 아래 변 바깥을 먼저 본다.
    // 토너먼트 띠(#ct-band)가 가운데를 막을 때 옆 좌석(CO, SB) 벳이 그 좌석 이름 위로 내려앉던 것.
    // (n2-G1) 변 바깥 줄을 4px씩 더 훑는다(팟 쪽 먼저): 바깥 모서리의 포지션 묶음과 가운데 핸드 정보 줄 사이 틈을 찾는다
    function edgeRow(av) {
      var dirY = (g.pot.y < cy) ? -1 : 1;
      var ey0 = dirY < 0 ? seat.y - ph / 2 - 2 : seat.y + seat.h + ph / 2 + 2;
      var toC = (g.pot.x < cx) ? -1 : 1, exs = [cx, cx + toC * seat.w / 4, cx - toC * seat.w / 4];
      for (var d = 4; d <= seat.w / 2 + pw / 2; d += 4) { exs.push(cx + toC * d); exs.push(cx - toC * d); }
      // (n2-G1 리뷰) 첫 줄이 다 막히면 팟 쪽으로 4px씩 더미 높이만큼 더 들어가며 본다(가까운 줄 먼저): 320과 360에서 옆 좌석 더미가
      // 자기 포지션 묶음을 덮거나, 위아래 좌석 사이 한 칸(360에서 약 87px)에 더미 2개(42px씩)가 들어가야 할 때(HJ와 CO) 자기 좌석 이름 위로
      // 내려앉던 것. 4px 간격이라 틈이 3px 남는 자리도 찾는다
      // 줄 순서: 변 바깥 바로(0), 좌석 변에 2px 걸침(-4, 위 가운데 좌석의 더미가 자기 포지션 묶음 옆 모서리로 비켜 설 때), 그다음 팟 쪽으로
      var rows = [ey0, ey0 - dirY * 4];
      for (var k = 4; k <= ph + 8; k += 4) rows.push(ey0 + dirY * k);
      for (var ri = 0; ri < rows.length; ri++) {
        for (var e = 0; e < exs.length; e++) {
          if (_inX(exs[e], pw, g) && ok(exs[e], rows[ri], av)) return { x: exs[e], y: rows[ri] };
        }
      }
      return null;
    }
    // 바깥 자리 찾기: 더 바깥 → 팟 쪽 길(o = off..0) → (폰) 변 바깥 줄 → (폰) 옆 모서리
    function outside(av) {
      var r = farther(av);
      if (r) return r;
      for (var o = off; o >= 0; o -= 4) { var p = along(o); if (free(p.x, p.y, av)) return p; }
      if (!g.mobile) return null;
      return edgeRow(av) || corner(av);
    }
    var r = outside(avoid);
    if (r) return r;
    // (n2-G1) 폰: 바깥이 다 막히면 좌석 안보다 자기 포지션 묶음 위가 낫다(마커 0.5, 1은 더미 금액과 같은 정보)
    if (g.mobile && seat.tag) {
      var av2 = avoid.filter(function(q) { return q !== seat.tag; });
      r = outside(av2);
      if (r) return r;
    }
    for (var oi = off; oi >= -8; oi -= 4) { if (oi >= 0) continue; var pi = along(oi); if (free0(pi.x, pi.y, avoid)) return pi; }
    if (!g.mobile) { r = corner(avoid); if (r) return r; }
    return along(-8);
  }
  function seatCenter(seat) { return { x: seat.x + seat.w / 2, y: seat.y + seat.h / 2 }; }

  function flyHTML(bb, from, to, delay) {
    return '<div class="chips-fly' + (delay ? ' chips-fly-late' : '') + '" aria-hidden="true" style="left:' + Math.round(from.x) + 'px;top:' + Math.round(from.y) +
      'px;--tx:' + Math.round(to.x - from.x) + 'px;--ty:' + Math.round(to.y - from.y) + 'px">' + pileHTML(bb, COLS_FLY) +
      '<span class="chips-amt">' + fmt(bb) + '</span></div>';
  }

  // .poker-table 안의 칩 층(.chips-layer > .chips-bets, .chips-fx)을 찾거나 만든다
  function ensureLayer(doc, table) {
    if (!table) return null;
    var layer = _q(table, '.chips-layer');
    if (!layer) {
      layer = _mk(doc, 'chips-layer');
      if (!layer) return null;
      layer.setAttribute && layer.setAttribute('aria-hidden', 'true');
      var bets = _mk(doc, 'chips-bets'), fx = _mk(doc, 'chips-fx');
      if (!bets || !fx) return null;
      layer.appendChild(bets); layer.appendChild(fx);
      layer._chipsBets = bets; layer._chipsFx = fx;
      if (typeof table.appendChild === 'function') table.appendChild(layer);
    }
    return { layer: layer, bets: layer._chipsBets || _q(layer, '.chips-bets'), fx: layer._chipsFx || _q(layer, '.chips-fx') };
  }

  function ensurePot(doc) {
    var wrap = _q(doc, '.pot-display-wrap');
    if (!wrap) return null;
    var el = _q(wrap, '.chips-pot');
    if (!el) {
      el = _mk(doc, 'chips-pot');
      if (!el) return null;
      var first = (wrap.children && wrap.children[0]) || wrap.firstChild || null;
      if (first && typeof wrap.insertBefore === 'function') wrap.insertBefore(el, first);
      else if (typeof wrap.appendChild === 'function') wrap.appendChild(el);
    }
    return el;
  }

  function addFx(fxEl, html) {
    if (!fxEl) return;
    var doc = fxEl.ownerDocument || null;
    var holder = _mk(doc || (typeof document !== 'undefined' ? document : null), 'chips-fx-group');
    if (!holder) return;
    holder.innerHTML = html;
    fxEl.appendChild(holder);
    _timer(function() { try { if (holder.parentNode && holder.parentNode.removeChild) holder.parentNode.removeChild(holder); } catch (e) { /* 이미 없음 */ } }, FLY_MS + FLY_GAP + 160);
  }

  // 그린 것 치우기(설정을 끄거나 테스트 정리)
  function cleanup(doc) {
    doc = doc || _doc();
    if (!doc) return;
    var layer = _q(doc, '.chips-layer'), pot = _q(doc, '.chips-pot');
    [layer, pot].forEach(function(el) { if (el && el.parentNode && el.parentNode.removeChild) el.parentNode.removeChild(el); });
    POSITIONS.forEach(function(pos) {
      var seat = _byId(doc, 'seat-' + pos), cs = _q(seat, '.chips-seat');
      if (cs && cs.parentNode && cs.parentNode.removeChild) cs.parentNode.removeChild(cs);
    });
  }

  // ── 실제 그리기(한 번에 쓰기) ──
  function _apply(state, doc, opts) {
    var m = model(state, _prev);
    var noMotion = (opts && opts.reduced != null) ? !!opts.reduced : reduced();
    if (state.replay) noMotion = true;   // (n2-G1) 리플레이 프레임(state.replay, 설계 6.2절 1번)은 칩 이동과 반짝임 없이 그 순간 모습만
    var table = _q(doc, '.poker-table');
    // 읽기: 좌석, 팟 위치(한 번)
    var g = table ? readGeom(doc, table, Object.keys(m.seats)) : null;
    var anchors = {};
    var fx = '';
    var awardNow = !!(m.award && _awardKey !== m.key);
    if (awardNow) _awardKey = m.key;
    // 쓰기 1: 좌석 스택 기둥(+ 승자 배지)
    Object.keys(m.seats).forEach(function(pos) {
      var s = m.seats[pos];
      var seatEl = _byId(doc, 'seat-' + pos);
      if (!seatEl) return;
      var old = _q(seatEl, '.chips-seat');
      if (old && old.parentNode && old.parentNode.removeChild) old.parentNode.removeChild(old);
      var box = _mk(doc, 'chips-seat');
      if (!box) return;
      var html = stackHTML(s.stack, noMotion ? 0 : s.delta);
      if (awardNow && m.award[s.name] && !_hasClass(seatEl, 'winner')) {
        var contrib = (state.totalContrib && _num(state.totalContrib[s.name])) || 0;
        if (m.award[s.name] - contrib > EPS) html += '<span class="chips-win' + (noMotion ? '' : ' chips-win-anim') + '">+' + fmt(m.award[s.name]) + '</span>';
      }
      box.innerHTML = html;
      seatEl.appendChild(box);
      if (g && g.seats[pos]) {
        anchors[s.name] = { bet: betAnchor(g.seats[pos], g, s.bet), center: seatCenter(g.seats[pos]) };
        // (n2-G1) 놓인 벳 더미는 다음 좌석의 더미가 피한다(좁은 폰에서 두 더미가 겹치던 것)
        if (s.bet > 0) {
          var bw = _pileW(g, s.bet), bh = _pileH(g, s.bet), ba = anchors[s.name].bet;
          g.avoid.push({ x: ba.x - bw / 2, y: ba.y - bh / 2, w: bw, h: bh });
        }
      }
    });
    // 쓰기 2: 벳 더미 층
    var L = ensureLayer(doc, table);
    if (L && L.bets) {
      var betsHtml = '';
      Object.keys(m.seats).forEach(function(pos) {
        var s = m.seats[pos];
        if (!(s.bet > 0)) return;
        var a = anchors[s.name] && anchors[s.name].bet;
        if (!a) return;   // 좌석 위치를 못 읽으면(테이블이 안 보임) 벳 더미는 건너뛴다
        betsHtml += betHTML(s.bet, a.x, a.y, pos);
      });
      if (L.bets.innerHTML !== betsHtml) L.bets.innerHTML = betsHtml;
    }
    // 쓰기 3: 중앙 팟
    var potEl = ensurePot(doc);
    if (potEl) {
      var ph = potHTML(m.pot, m.pots);
      if (potEl.innerHTML !== ph) potEl.innerHTML = ph;
      if (potEl.classList) {
        potEl.classList.remove('chips-bump');
        if (m.potUp && !noMotion) potEl.classList.add('chips-bump');
      }
    }
    // 쓰기 4: 이동(벳 → 팟, 팟 → 승자). 모션 줄이기면 없음
    if (!noMotion && g && L && L.fx) {
      if (m.moved) {
        Object.keys(m.moved).forEach(function(n) {
          var from = _prev && _prev.anchors && _prev.anchors[n] && _prev.anchors[n].bet;
          if (from) fx += flyHTML(m.moved[n], from, g.pot, false);
        });
      }
      if (awardNow) {
        Object.keys(m.award).forEach(function(n) {
          var to = anchors[n] && anchors[n].center;
          if (to) fx += flyHTML(m.award[n], g.pot, to, !!m.moved);
        });
      }
      if (fx) addFx(L.fx, fx);
    }
    _prev = snapshot(m, anchors);
    return m;
  }

  function _flush(doc, opts) {
    _rafOn = false;
    var st = _pending;
    _pending = null;
    if (!st) return null;
    try { return _apply(st, doc, opts || {}); }
    catch (e) { if (!_warned) { _warned = true; try { console.warn('ChipsUI 그리기 실패', e); } catch (e2) { /* 무시 */ } } return null; }
  }

  // decorate(state, opts): Table.render 뒤에 부른다. opts = { doc, sync, reduced, settings }(테스트용)
  // 반환: 바로 그렸으면 모델, rAF에 미뤘으면 true, 안 그렸으면 null
  function decorate(state, opts) {
    opts = opts || {};
    if (!state || typeof state !== 'object') return null;
    var doc = _doc(opts);
    if (!doc) return null;
    if (!enabled(opts.settings)) { cleanup(doc); return null; }
    var raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : null;
    if (opts.sync || !raf) { _pending = state; return _flush(doc, opts); }
    _pending = state;
    if (!_rafOn) {
      _rafOn = true;
      raf(function() { _flush(doc, opts); });
    }
    return true;
  }

  // 쇼다운 직후(Table.renderShowdown 감싸기): 아직 이 핸드의 승자 이동을 보이지 않았으면 팟 → 승자 이동과 배지.
  // 좌석 스택 숫자는 Table이 다시 그릴 때(다음 render) 바뀌므로 여기서는 손대지 않는다.
  function onShowdown(result, opts) {
    opts = opts || {};
    if (!result || !result.newState) return null;
    var st = result.newState, key = handKey(st);
    if (_awardKey === key) return null;
    var doc = _doc(opts);
    if (!doc || !enabled(opts.settings)) return null;
    var gains = {};
    if (result.payouts && typeof result.payouts === 'object') {
      Object.keys(result.payouts).forEach(function(n) { if (_num(result.payouts[n]) > EPS) gains[n] = _num(result.payouts[n]); });
    } else if (result.winner && _prev && _prev.key === key && _prev.pot > EPS) {
      gains[result.winner] = _prev.pot;
    }
    if (!Object.keys(gains).length) return null;
    _awardKey = key;
    var run = function() {
      try {
        var noMotion = (opts.reduced != null) ? !!opts.reduced : reduced();
        var players = seatPlayers(st), byName = {};
        Object.keys(players).forEach(function(pos) { byName[players[pos].name] = pos; });
        var table = _q(doc, '.poker-table');
        var g = table ? readGeom(doc, table, Object.keys(players)) : null;
        var L = ensureLayer(doc, table);
        var fx = '';
        Object.keys(gains).forEach(function(n) {
          var pos = byName[n];
          var seatEl = pos ? _byId(doc, 'seat-' + pos) : null;
          if (!seatEl) return;
          var contrib = (st.totalContrib && _num(st.totalContrib[n])) || 0;
          if (gains[n] - contrib > EPS && !_hasClass(seatEl, 'winner')) {
            var box = _q(seatEl, '.chips-seat');
            if (!box) { box = _mk(doc, 'chips-seat'); if (box) seatEl.appendChild(box); }
            if (box) {
              var old = _q(box, '.chips-win');
              if (old && old.parentNode && old.parentNode.removeChild) old.parentNode.removeChild(old);
              var badge = _mk(doc, 'chips-win' + (noMotion ? '' : ' chips-win-anim'));
              if (badge) { badge.textContent = '+' + fmt(gains[n]); box.appendChild(badge); }
            }
          }
          if (!noMotion && g && g.seats[pos]) fx += flyHTML(gains[n], g.pot, seatCenter(g.seats[pos]), false);
        });
        if (L && L.bets) L.bets.innerHTML = '';
        var potEl = ensurePot(doc);
        if (potEl) potEl.innerHTML = potHTML(0, []);
        if (fx && L && L.fx) addFx(L.fx, fx);
        if (_prev && _prev.key === key) { _prev.pot = 0; _prev.bets = {}; }
      } catch (e) { if (!_warned) { _warned = true; try { console.warn('ChipsUI 쇼다운 그리기 실패', e); } catch (e2) { /* 무시 */ } } }
    };
    var raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : null;
    if (opts.sync || !raf) { run(); return gains; }
    raf(run);
    return gains;
  }

  // Table.render, Table.renderShowdown 감싸기(한 번만). 원본 반환값과 예외는 그대로.
  function wrap(T) {
    if (!T || typeof T !== 'object') return false;
    if (T.__chipsWrapped) return false;
    var render = T.render, showdown = T.renderShowdown;
    if (typeof render === 'function') {
      var wr = function(state) {
        var out = render.apply(this, arguments);
        try { decorate(state); } catch (e) { /* 칩 그림 실패는 게임을 막지 않는다 */ }
        return out;
      };
      wr.__chipsOrig = render;
      T.render = wr;
    }
    if (typeof showdown === 'function') {
      var ws = function(result) {
        var out = showdown.apply(this, arguments);
        try { onShowdown(result); } catch (e) { /* 같음 */ }
        return out;
      };
      ws.__chipsOrig = showdown;
      T.renderShowdown = ws;
    }
    T.__chipsWrapped = true;
    return true;
  }

  function _reset() { _prev = null; _awardKey = null; _pending = null; _rafOn = false; }

  var api = {
    UNITS: UNITS.slice(), UNIT_CLASS: UNIT_CLASS, MAX_PER_COL: MAX_PER_COL, MQ: MQ, FLY_MS: FLY_MS,
    STACK_TIERS: STACK_TIERS.slice(), stackColumn: stackColumn,
    breakdown: breakdown, columns: columns, fmt: fmt, colHTML: colHTML, pileHTML: pileHTML, stackHTML: stackHTML, betHTML: betHTML,
    sidePots: sidePots, potHTML: potHTML, seatPlayers: seatPlayers, model: model, betAnchor: betAnchor,
    enabled: enabled, settings: settings, reduced: reduced,
    decorate: decorate, onShowdown: onShowdown, wrap: wrap, cleanup: cleanup, readGeom: readGeom,
    _reset: _reset, _prev: function() { return _prev; }
  };

  if (typeof Table !== 'undefined' && Table) wrap(Table);
  if (typeof module !== 'undefined' && module) module.exports = api;
  return api;
})();
