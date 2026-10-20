// puzzles/gen-range.js (채우는 패키지: M2-P3b)
// 퍼즐 생성기 4종. typeof Puzzles 가드 후 Puzzles.register로 등록한다. 계약은 puzzles/puzzle-core.js 머리 주석 C1~C3.
//   combos     콤보 세기(exact, srs). 레인지 묶음 + 데드카드(보드, 내 손) → 남은 콤보 수. variant 'blocker' = 내 손이 지우는 콤보 수
//   rangehit   레인지 적중 분포(exact, once). 차트 레인지 + 플랍 → Villain._handStrength 범주 분포, 4지 구간. variant 'compare' = 두 레인지 비교
//              variant 'steps'(M5-WEEKLY, 노드 s4-02 용의자 명단): 이 앱의 지우기 규칙 v1(계약 F10)로 상대가 플랍, 턴, 리버에서
//              계속할 때마다 레인지를 지우고 단계 1~3 뒤 남은 콤보 수 구간(4지)을 묻는다. 규칙이 이 앱의 정의라 rated false(3.2절 앱 정의 원칙)
//   rangepaint 레인지 색칠(chart, srs, ui 'paint'). 정답 칸 집합 + Jaccard 채점 score(spot, cells) → 0~1. 색칠 위젯은 M6-P1c
//   rangeshape 레인지 모양(앱 정의, rated false, srs). 폴라, 머지드, 컨덴스드, 캡드 판정 규칙은 아래 SHAPE_TIERS, SHAPES 상수
// 정답 경로와 verify 경로를 일부러 나눈다(C1 "독립 경로").
//   combos: 생성은 랭크와 무늬별 남은 카드 공식, verify는 52장 1326조합 전수 열거 + Range.parse
//   rangehit: 생성은 차트 모델(GtoChart.buildChartModel) 칸을 실제 카드로 펼쳐 센다, verify는 GTO_RANGES 원본 배열 Range.parse + 1326 열거
//             steps도 같다(생성 = 칸 펼침 + 단계별 걸러내기, verify = 원본 Range.parse + 1326 열거 + 강도 순위 문턱으로 다시 센다)
//   rangepaint: 생성은 차트 모델 칸, verify는 GTO_RANGES 원본 배열 Range.parse
//   rangeshape: 생성은 칸 무게(페어 6, 수딧 4, 오프 12), verify는 1326 열거로 층별 콤보를 다시 센다
// 로드 시 DOM, window, localStorage 접근 없음. 다른 모듈(Range, HandEval, Gto, GtoChart, Villain, PostflopGuide, Drills, Puzzles)은
// 호출 시점에 typeof 가드.
(function() {
  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  var GRID_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']; // gto-chart.js와 같은 13x13 순서
  var SUITS = ['s', 'h', 'd', 'c'];
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var RI = {};
  RANKS.forEach(function(r, i) { RI[r] = i; });
  var LATE = { CO: true, BTN: true, SB: true };

  // ── 공통 도우미 ──
  function _rng(rnd) { return typeof rnd === 'function' ? rnd : Math.random; }
  function _int(rnd, n) { var i = Math.floor(rnd() * n); return i >= n ? n - 1 : (i < 0 ? 0 : i); }
  function _pick(rnd, arr) { return arr[_int(rnd, arr.length)]; }
  function _shuffle(rnd, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = _int(rnd, i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function _weighted(rnd, list) { // [{w}, ...] → 하나
    var tot = 0, i;
    for (i = 0; i < list.length; i++) tot += list[i].w;
    var x = rnd() * tot;
    for (i = 0; i < list.length; i++) { x -= list[i].w; if (x < 0) return list[i]; }
    return list[list.length - 1];
  }
  var _CO = {};
  function _card(s) { return _CO[s] || (_CO[s] = { rank: s.charAt(0), suit: s.charAt(1) }); }
  function _cardsOf(list) { return (list || []).map(_card); }
  function _sym(list, sep) {
    return (list || []).map(function(s) { return s.charAt(0) + (SUIT_SYM[s.charAt(1)] || s.charAt(1)); }).join(sep == null ? ' ' : sep);
  }
  function _sortHand(h) { return h.slice().sort(function(a, b) { return RI[b.charAt(0)] - RI[a.charAt(0)] || SUITS.indexOf(a.charAt(1)) - SUITS.indexOf(b.charAt(1)); }); }
  var _DECK = null;
  function _deck() {
    if (!_DECK) { _DECK = []; RANKS.forEach(function(r) { SUITS.forEach(function(s) { _DECK.push(r + s); }); }); }
    return _DECK;
  }
  function _deadMap(list) { var m = {}; (list || []).forEach(function(s) { m[s] = true; }); return m; }
  function _w(label) { return label.length === 2 ? 6 : (label.charAt(2) === 's' ? 4 : 12); } // 칸 무게: 페어 6, 수딧 4, 오프 12
  function _labelKey(l) {
    var t = l.length === 2 ? 0 : (l.charAt(2) === 's' ? 1 : 2);
    return (12 - RI[l.charAt(0)]) * 100 + (12 - RI[l.charAt(1)]) * 3 + t;
  }
  function _sortLabels(arr) { return arr.slice().sort(function(x, y) { return _labelKey(x) - _labelKey(y); }); }
  function _round(x, d) { var p = Math.pow(10, d || 0); return Math.round(x * p) / p; }
  function _fmt(x) { return String(_round(x, 1)); }
  function _has(name) {
    switch (name) {
      case 'Range': return typeof Range !== 'undefined' && !!Range.parse;
      case 'HandEval': return typeof HandEval !== 'undefined' && !!HandEval.evaluate;
      case 'Villain': return typeof Villain !== 'undefined' && typeof Villain._handStrength === 'function';
      case 'Gto': return typeof Gto !== 'undefined' && !!Gto.GTO_RANGES;
      case 'GtoChart': return typeof GtoChart !== 'undefined' && typeof GtoChart.buildChartModel === 'function';
      case 'PostflopGuide': return typeof PostflopGuide !== 'undefined' && typeof PostflopGuide.hasDraw === 'function';
    }
    return false;
  }
  function _ready(list) { for (var i = 0; i < list.length; i++) if (!_has(list[i])) return false; return true; }

  // 13x13 좌표 → 칸 이름(gto-chart.js comboLabel과 같은 규칙: r===c 페어, r<c 수딧, r>c 오프)
  function _gridLabel(r, c) {
    if (r === c) return GRID_RANKS[r] + GRID_RANKS[r];
    if (r < c) return GRID_RANKS[r] + GRID_RANKS[c] + 's';
    return GRID_RANKS[c] + GRID_RANKS[r] + 'o';
  }
  var _ALL = null; // 169칸 이름 → true
  function _allLabels() {
    if (!_ALL) { _ALL = {}; for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) _ALL[_gridLabel(r, c)] = true; }
    return _ALL;
  }

  var _pc = {};
  function _parse(str) { if (!_pc[str]) _pc[str] = Range.parse(str); return _pc[str]; } // 캐시된 Set(읽기 전용으로만 쓴다)
  function _classesOf(str) { return _sortLabels(Array.from(_parse(str))); }

  // 칸 → 실제 카드 2장 목록(생성 경로)
  var _ex = {};
  function _expand(label) {
    if (_ex[label]) return _ex[label];
    var r1 = label.charAt(0), r2 = label.charAt(1), out = [];
    if (label.length === 2) {
      for (var i = 0; i < 4; i++) for (var j = i + 1; j < 4; j++) out.push([r1 + SUITS[i], r1 + SUITS[j]]);
    } else if (label.charAt(2) === 's') {
      SUITS.forEach(function(s) { out.push([r1 + s, r2 + s]); });
    } else {
      SUITS.forEach(function(a) { SUITS.forEach(function(b) { if (a !== b) out.push([r1 + a, r2 + b]); }); });
    }
    _ex[label] = out;
    return out;
  }

  // 52장에서 2장 1326조합 전수 순회(verify 경로). 칸 이름은 Range.handClass로 한 번 구해 둔다
  var _PAIRS = null;
  function _each1326(fn) {
    if (!_PAIRS) {
      _PAIRS = [];
      var d = _deck();
      for (var i = 0; i < 52; i++) for (var j = i + 1; j < 52; j++) _PAIRS.push([d[i], d[j], Range.handClass(_card(d[i]), _card(d[j]))]);
    }
    for (var k = 0; k < _PAIRS.length; k++) fn(_PAIRS[k][0], _PAIRS[k][1], _PAIRS[k][2]);
  }

  // 숫자 4지 보기: 서로 2 이상 떨어지고 0 이상, 오름차순. near = 정답과 2 차이(데일리 5 '아쉬움')
  // 정답 위치(아래 보기 개수 k)는 호출자가 먼저 고르게 뽑아 넘긴다(_kMax 이하로 줄여 쓴다).
  // '카드 제거를 잊은 값'처럼 늘 큰 함정, 블로커처럼 늘 작은 정답 때문에 보기 위치로 답이 새지 않게
  function _kMax(ans) { return Math.min(3, Math.floor(ans / 2)); } // 아래에 0 이상, 2 간격으로 놓을 수 있는 보기 수
  function _numOptions(rnd, ans, extras, wantK) {
    var k = typeof wantK === 'number' ? Math.min(wantK, _kMax(ans)) : _int(rnd, _kMax(ans) + 1);
    var cands = (extras || []).concat(_shuffle(rnd, [-6, -4, -3, -2, 2, 3, 4, 6, 8, -8]).map(function(o) { return ans + o; }));
    function fill(side, want) {
      var got = [];
      function ok(v) {
        if (typeof v !== 'number' || v < 0 || v !== Math.round(v) || Math.abs(v - ans) < 2) return false;
        if (side < 0 ? v > ans : v < ans) return false;
        for (var i = 0; i < got.length; i++) if (Math.abs(got[i] - v) < 2) return false;
        return true;
      }
      cands.forEach(function(v) { if (got.length < want && ok(v)) got.push(v); });
      for (var s = 2; got.length < want && s < 200; s++) if (ok(ans + side * s)) got.push(ans + side * s);
      if (got.length < want) { got = []; for (var j = 1; j <= want; j++) got.push(ans + side * 2 * j); } // 아래쪽 막힘 대비
      return got;
    }
    var vals = [ans].concat(fill(-1, k), fill(1, 3 - k));
    vals.sort(function(a, b) { return a - b; });
    return vals.map(function(x) {
      var o = { id: String(x), label: String(x) };
      if (x !== ans && Math.abs(x - ans) <= 2) o.near = true;
      return o;
    });
  }

  function _optionsOk(q, n) {
    if (!q || !Array.isArray(q.options) || q.options.length !== n) return false;
    var ids = {};
    for (var i = 0; i < q.options.length; i++) {
      var o = q.options[i];
      if (!o || typeof o.id !== 'string' || !o.label || ids[o.id]) return false;
      ids[o.id] = true;
    }
    return !!ids[q.answer];
  }

  // ── 스팟(차트 레인지) 표: rangehit와 rangeshape가 같이 쓴다 ──
  // act: 차트 모델 칸 action(raise = 오픈/3벳/4벳, call = 콜). facing은 buildChartModel 인자 그대로.
  var SPOTS = {
    'rfi|UTG': { label: 'UTG 오픈 레인지', role: 'UTG 오픈', short: 'UTG', pos: 'UTG', facing: false, opener: null, act: 'raise' },
    'rfi|HJ': { label: 'HJ 오픈 레인지', role: 'HJ 오픈', short: 'HJ', pos: 'HJ', facing: false, opener: null, act: 'raise' },
    'rfi|CO': { label: 'CO 오픈 레인지', role: 'CO 오픈', short: 'CO', pos: 'CO', facing: false, opener: null, act: 'raise' },
    'rfi|BTN': { label: 'BTN 오픈 레인지', role: 'BTN 오픈', short: 'BTN', pos: 'BTN', facing: false, opener: null, act: 'raise' },
    'rfi|SB': { label: 'SB 오픈 레인지', role: 'SB 오픈', short: 'SB', pos: 'SB', facing: false, opener: null, act: 'raise' },
    'call|BB@BTN': { label: 'BB가 BTN 오픈에 콜한 레인지', role: 'BB 콜', short: 'BB', pos: 'BB', facing: true, opener: 'BTN', act: 'call' },
    'call|BB@UTG': { label: 'BB가 UTG 오픈에 콜한 레인지', role: 'BB 콜', short: 'BB', pos: 'BB', facing: true, opener: 'UTG', act: 'call' },
    'call|BTN@CO': { label: 'BTN이 CO 오픈에 콜한 레인지', role: 'BTN 콜', short: 'BTN', pos: 'BTN', facing: true, opener: 'CO', act: 'call' },
    'call|CO@HJ': { label: 'CO가 HJ 오픈에 콜한 레인지', role: 'CO 콜', short: 'CO', pos: 'CO', facing: true, opener: 'HJ', act: 'call' },
    'call|HJ@UTG': { label: 'HJ가 UTG 오픈에 콜한 레인지', role: 'HJ 콜', short: 'HJ', pos: 'HJ', facing: true, opener: 'UTG', act: 'call' },
    '3bet|BTN@CO': { label: 'BTN이 CO 오픈에 3벳한 레인지', role: 'BTN 3벳', short: 'BTN', pos: 'BTN', facing: true, opener: 'CO', act: 'raise' },
    '3bet|BB@BTN': { label: 'BB가 BTN 오픈에 3벳한 레인지', role: 'BB 3벳', short: 'BB', pos: 'BB', facing: true, opener: 'BTN', act: 'raise' },
    '3bet|CO@HJ': { label: 'CO가 HJ 오픈에 3벳한 레인지', role: 'CO 3벳', short: 'CO', pos: 'CO', facing: true, opener: 'HJ', act: 'raise' },
    'call3|BTN': { label: 'BTN 오픈 뒤 3벳을 맞고 콜한 레인지', role: 'BTN(3벳에 콜)', short: 'BTN', pos: 'BTN', facing: 'vs3bet', opener: null, act: 'call' },
    'call3|CO': { label: 'CO 오픈 뒤 3벳을 맞고 콜한 레인지', role: 'CO(3벳에 콜)', short: 'CO', pos: 'CO', facing: 'vs3bet', opener: null, act: 'call' },
    '4bet|BTN': { label: 'BTN 오픈 뒤 3벳을 맞고 4벳한 레인지', role: 'BTN 4벳', short: 'BTN', pos: 'BTN', facing: 'vs3bet', opener: null, act: 'raise' }
  };

  var _spotCls = {};
  function _spotClasses(id) { // 생성 경로: 차트 모델 칸
    if (_spotCls[id]) return _spotCls[id];
    var sp = SPOTS[id];
    if (!sp || !_has('GtoChart')) return null;
    var m = GtoChart.buildChartModel(sp.pos, sp.facing, sp.opener), out = [];
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) if (m.cells[r][c].action === sp.act) out.push(m.cells[r][c].label);
    _spotCls[id] = out.length ? _sortLabels(out) : null;
    return _spotCls[id];
  }

  // verify 경로: GTO_RANGES 원본 배열을 Range.parse로 바로 읽는다(차트 모델을 거치지 않음)
  function _rawSpotSet(sp) {
    var G = Gto.GTO_RANGES, set = new Set();
    function add(arr) { if (arr && arr.length) Range.parse(arr.join(',')).forEach(function(h) { set.add(h); }); }
    function minus(arr) { if (arr && arr.length) Range.parse(arr.join(',')).forEach(function(h) { set.delete(h); }); }
    if (sp.facing === false) { add(G.rfi[sp.pos]); return set; }
    var raiseArr, callArr;
    if (sp.facing === 'vs3bet') {
      var v3 = G.vs3bet[sp.pos]; if (!v3) return set;
      raiseArr = v3.fourbet; callArr = v3.call;
    } else {
      var vs = (sp.pos === 'BB' && LATE[sp.opener] && G.vsRfiBB_LP) ? G.vsRfiBB_LP : G.vsRfi[sp.pos];
      if (!vs) return set;
      raiseArr = vs.threebet; callArr = vs.call;
    }
    if (sp.act === 'raise') { add(raiseArr); return set; }
    add(callArr); minus(raiseArr); // 차트 모델은 레이즈 칸이 콜보다 먼저
    return set;
  }

  function _spotFilter(list, allowed) {
    if (!Array.isArray(list) || !list.length) return allowed.slice();
    var out = list.filter(function(id) { return allowed.indexOf(id) >= 0; });
    return out.length ? out : allowed.slice();
  }

  function _flop(rnd, n) { return _shuffle(rnd, _deck()).slice(0, n || 3); }
  function _paired(board) {
    var seen = {};
    for (var i = 0; i < board.length; i++) { var r = board[i].charAt(0); if (seen[r]) return true; seen[r] = true; }
    return false;
  }

  // ═══════════════════ 1. combos ═══════════════════
  // 레인지 묶음 조각(Range.parse 표기). 조각 1~3개를 겹치지 않게 묶는다.
  var COMBO_PARTS = [
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22', 'QQ+', 'JJ+', 'TT+', '99+', '77-99', '55-77', '22-44',
    'AKs', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs', 'T9s', '98s', '87s', '76s', '65s', 'A5s', 'A4s', 'AQs+', 'AJs+', 'KJs+', 'A5s-A4s',
    'AKo', 'AQo', 'AJo', 'KQo', 'KJo', 'QJo', 'AQo+', 'AJo+', 'KJo+',
    'AK', 'AQ', 'AJ', 'KQ', 'KJ', 'QJ', 'JT', 'AQ+', 'KJ+'
  ];
  // 블로커 변형용 상대 레인지(강한 손 위주, 내 카드가 실제로 지우는 장면이 자주 나오게)
  var BLOCK_PARTS = ['AA', 'KK', 'QQ', 'JJ', 'QQ+', 'KK+', 'AKs', 'AKo', 'AK', 'AQs', 'AQ', 'KQs', 'AQs+', 'A5s-A4s', 'TT+', 'JJ+'];
  var COMBO_MAX = 60;
  // 데드카드 구성(n = 데드카드 수, SRS 키의 두 번째 칸)
  var COMBO_DEAD = [
    { n: 0, board: 0, hero: 0, w: 0.10 },
    { n: 2, board: 0, hero: 2, w: 0.15 },
    { n: 3, board: 3, hero: 0, w: 0.35 },
    { n: 4, board: 4, hero: 0, w: 0.15 },
    { n: 5, board: 3, hero: 2, w: 0.25 }
  ];
  var BLOCK_DEAD = [
    { n: 2, board: 0, hero: 2, w: 0.75 },
    { n: 5, board: 3, hero: 2, w: 0.25 }
  ];
  function _deadSpec(list, n) { for (var i = 0; i < list.length; i++) if (list[i].n === n) return list[i]; return null; }

  // 표기 순서: 페어 조각 먼저(높은 랭크부터), 그다음 나머지 조각(가장 강한 칸 기준)
  function _partKey(p) {
    var cls = Array.from(_parse(p));
    var pairs = cls.every(function(c) { return c.length === 2; });
    return (pairs ? 0 : 10000) + Math.min.apply(null, cls.map(_labelKey));
  }
  function _orderParts(parts) { return parts.slice().sort(function(a, b) { return _partKey(a) - _partKey(b); }); }

  // 조각 목록이 서로 겹치지 않고 콤보 합이 상한 이하인지
  function _partsOk(parts) {
    if (!Array.isArray(parts) || !parts.length) return false;
    var seen = {}, base = 0;
    for (var i = 0; i < parts.length; i++) {
      if (!/^[AKQJT2-9+so\-]+$/.test(parts[i])) return false;
      var cls = Array.from(_parse(parts[i]));
      if (!cls.length) return false;
      for (var j = 0; j < cls.length; j++) { if (seen[cls[j]]) return false; seen[cls[j]] = true; base += _w(cls[j]); }
    }
    return base > 0 && base <= COMBO_MAX + 24;
  }

  function _rangeGroup(rnd, pool) {
    var roll = rnd();
    var n = roll < 0.35 ? 1 : (roll < 0.8 ? 2 : 3);
    for (var t = 0; t < 20; t++) {
      var parts = [], seen = {}, base = 0, cand = _shuffle(rnd, pool);
      for (var i = 0; i < cand.length && parts.length < n; i++) {
        var cls = Array.from(_parse(cand[i]));
        if (cls.some(function(c) { return seen[c]; })) continue;
        var w = cls.reduce(function(s, c) { return s + _w(c); }, 0);
        if (base + w > COMBO_MAX) continue;
        cls.forEach(function(c) { seen[c] = true; });
        base += w;
        parts.push(cand[i]);
      }
      if (parts.length === n) return _orderParts(parts);
    }
    return ['AK'];
  }

  // 생성 경로: 랭크와 무늬별로 남은 카드를 센 공식
  function _leftOf(label, dm) {
    var r1 = label.charAt(0), r2 = label.charAt(1);
    if (label.length === 2) {
      var k = 0;
      SUITS.forEach(function(s) { if (!dm[r1 + s]) k++; });
      return k * (k - 1) / 2;
    }
    var a = 0, b = 0, both = 0;
    SUITS.forEach(function(s) { var x = !dm[r1 + s], y = !dm[r2 + s]; if (x) a++; if (y) b++; if (x && y) both++; });
    return label.charAt(2) === 's' ? both : a * b - both;
  }

  // 데드카드 뽑기. force = 'board'|'hero'|null → 그 자리에 레인지에 있는 랭크 카드 1장을 먼저 넣는다
  function _deal(rnd, classes, spec, force) {
    var used = {}, board = [], hero = [];
    if (force && classes.length) {
      var cl = _pick(rnd, classes);
      var r = cl.length === 2 ? cl.charAt(0) : cl.charAt(_int(rnd, 2));
      var s = r + _pick(rnd, SUITS);
      used[s] = true;
      (force === 'hero' ? hero : board).push(s);
    }
    var rest = _shuffle(rnd, _deck().filter(function(c) { return !used[c]; })), k = 0;
    while (board.length < spec.board) board.push(rest[k++]);
    while (hero.length < spec.hero) hero.push(rest[k++]);
    return { board: _shuffle(rnd, board), hero: _sortHand(hero) };
  }

  function _perClass(classes, dm) {
    return classes.map(function(c) { return { c: c, full: _w(c), left: _leftOf(c, dm) }; });
  }
  function _sum(list, f) { return list.reduce(function(s, x) { return s + x[f]; }, 0); }

  function _comboKey(parts, n, blocker) { return parts.join(',') + '|' + n + (blocker ? '|b' : ''); }

  // wantK = 정답 아래 보기 수(정답 위치). strict면 그 위치를 낼 수 없는 정답(_kMax < wantK)은 다시 뽑고, 30번 안에 못 찾으면 null
  function _combosBuild(rnd, parts, spec, blocker, wantK, strict) {
    var rangeText = parts.join(', ');
    var classes = _classesOf(parts.join(','));
    if (!classes.length) return null;
    for (var t = 0; t < 30; t++) {
      var force = null;
      if (blocker) force = 'hero';
      else if (spec.n > 0 && rnd() < 0.8) force = spec.board ? (spec.hero && rnd() < 0.4 ? 'hero' : 'board') : 'hero';
      var dl = _deal(rnd, classes, spec, force);
      var dmBoard = _deadMap(dl.board), dmAll = _deadMap(dl.board.concat(dl.hero));
      var base = _sum(_perClass(classes, {}), 'full');
      var pcBoard = _perClass(classes, dmBoard), pcAll = _perClass(classes, dmAll);
      var afterBoard = _sum(pcBoard, 'left'), left = _sum(pcAll, 'left');
      var answer, extras, per;
      if (blocker) {
        answer = afterBoard - left;
        if (answer < 1) continue; // 내 손이 아무것도 안 지우면 다시
        extras = [left, afterBoard];
        per = pcAll.map(function(x, i) { return { c: x.c, full: pcBoard[i].left, left: x.left }; });
      } else {
        answer = left;
        extras = [base];
        per = pcAll;
      }
      if (strict && _kMax(answer) < wantK) continue;
      var boardHit = afterBoard < base;
      var difficulty = 1700 + (boardHit ? 100 : 0) - (spec.n === 0 ? 100 : 0);
      var trivial = !blocker && spec.n === 0 && classes.length === 1; // 'AA는 몇 콤보' 같은 암기 문항
      var where = [];
      if (dl.board.length) where.push('보드 ' + _sym(dl.board));
      if (dl.hero.length) where.push('내 손 ' + _sym(dl.hero, ''));
      var prompt;
      if (blocker) {
        prompt = (dl.board.length ? '보드 ' + _sym(dl.board) + ', ' : '') + '상대 레인지 ' + rangeText + '\n' +
          '내 손 ' + _sym(dl.hero, '') + '가 ' + (dl.board.length ? '추가로 ' : '') + '지우는 상대 콤보는 몇 개?';
      } else if (!where.length) {
        prompt = '상대 레인지 ' + rangeText + '\n이 레인지의 콤보는 모두 몇 개?';
      } else {
        prompt = '상대 레인지 ' + rangeText + '\n' + where.join(', ') + '일 때 남은 콤보는 몇 개?';
      }
      var scene = {
        range: { label: '상대 레인지', text: rangeText },
        grid: { pos: null, facing: false, opener: null, highlight: classes.slice() }
      };
      if (dl.board.length) scene.board = dl.board.slice();
      if (dl.hero.length) scene.hero = dl.hero.slice();
      var q = {
        type: 'combos', key: _comboKey(parts, spec.n, blocker), concept: 'combos', difficulty: difficulty,
        confidence: 'exact', appDef: false, rated: !trivial, srs: 'srs',
        prompt: prompt, scene: scene, options: _numOptions(rnd, answer, extras, wantK), answer: String(answer),
        data: {
          range: rangeText, parts: parts.slice(), classes: classes, board: dl.board.slice(), hero: dl.hero.slice(),
          dead: dl.board.concat(dl.hero), base: base, afterBoard: afterBoard, left: left, count: answer, per: per
        }
      };
      if (blocker) q.variant = 'blocker';
      return q;
    }
    return null;
  }

  function combosNext(rnd, opts) {
    rnd = _rng(rnd); opts = opts || {};
    if (!_ready(['Range'])) return null;
    var blocker = opts.variant === 'blocker';
    var wantK = _int(rnd, 4), parts, spec;
    // 정답 위치를 먼저 정하고 그 위치를 낼 수 있는 문항을 찾는다(블로커 정답은 대개 1~5라 그냥 두면 가장 작은 보기가 정답인 쪽으로 쏠림)
    for (var t = 0; t < 12; t++) {
      parts = _rangeGroup(rnd, blocker ? BLOCK_PARTS : COMBO_PARTS);
      spec = _weighted(rnd, blocker ? BLOCK_DEAD : COMBO_DEAD);
      var q = _combosBuild(rnd, parts, spec, blocker, wantK, true);
      if (q) return q;
    }
    return _combosBuild(rnd, parts, spec, blocker, wantK, false);
  }

  function _parseComboKey(key) {
    var p = String(key || '').split('|');
    if (p.length < 2 || p.length > 3) return null;
    var blocker = p[2] === 'b';
    if (p.length === 3 && !blocker) return null;
    var n = Number(p[1]);
    var spec = _deadSpec(blocker ? BLOCK_DEAD : COMBO_DEAD, n);
    var parts = p[0].split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    if (!spec || !_ready(['Range']) || !_partsOk(parts)) return null;
    return { parts: parts, spec: spec, blocker: blocker }; // 키의 표기 순서를 그대로 둔다
  }

  function combosFromKey(key, rnd, opts) {
    var k = _parseComboKey(key);
    if (!k) return null;
    rnd = _rng(rnd);
    var wantK = _int(rnd, 4);
    return _combosBuild(rnd, k.parts, k.spec, k.blocker, wantK, true) || _combosBuild(rnd, k.parts, k.spec, k.blocker, wantK, false);
  }

  // verify 경로: 52장 1326조합 전수 열거(데드카드 제외, Range.handClass ∈ Range.parse(레인지))
  function _enumLeft(rangeStr, dead) {
    var set = Range.parse(rangeStr), dm = _deadMap(dead), n = 0;
    _each1326(function(a, b, h) {
      if (dm[a] || dm[b]) return;
      if (set.has(h)) n++;
    });
    return n;
  }

  function combosVerify(q) {
    try {
      if (!q || q.type !== 'combos' || !q.data || !_ready(['Range'])) return false;
      if (!_optionsOk(q, 4)) return false;
      var vals = q.options.map(function(o) { return Number(o.id); });
      for (var i = 0; i < vals.length; i++) {
        if (!(vals[i] >= 0) || String(vals[i]) !== q.options[i].id || q.options[i].label !== q.options[i].id) return false;
        for (var j = i + 1; j < vals.length; j++) if (Math.abs(vals[i] - vals[j]) < 2) return false;
      }
      var d = q.data;
      var dead = (d.board || []).concat(d.hero || []);
      var seen = {};
      for (var k = 0; k < dead.length; k++) { if (seen[dead[k]] || !/^[2-9TJQKA][shdc]$/.test(dead[k])) return false; seen[dead[k]] = true; }
      var left = _enumLeft(d.range, dead);
      var ans = q.variant === 'blocker' ? _enumLeft(d.range, d.board || []) - left : left;
      if (q.variant === 'blocker' && ans < 1) return false;
      if (Number(q.answer) !== ans || d.count !== ans) return false;
      var kk = _parseComboKey(q.key);
      if (!kk || kk.spec.n !== dead.length || kk.blocker !== (q.variant === 'blocker')) return false;
      return q.confidence === 'exact' && q.srs === 'srs';
    } catch (e) { return false; }
  }

  function combosExplain(q) {
    if (!q || !q.data) return { line: '' };
    var d = q.data, per = d.per || [];
    var changed = per.filter(function(x) { return x.left !== x.full; });
    var same = per.filter(function(x) { return x.left === x.full; });
    var bits = changed.map(function(x) { return x.c + ' ' + x.full + '→' + x.left; });
    if (q.variant === 'blocker') {
      var cut = changed.map(function(x) { return x.full - x.left; });
      var line1 = bits.join(', ') + ': 지운 콤보 ' + (cut.length > 1 ? cut.join('+') + ' = ' : '') + d.count + '개';
      return {
        line: line1 + '\n내 손 ' + _sym(d.hero, '') + '에 있는 카드가 들어간 조합은 상대가 가질 수 없어요(블로커)',
        scene: q.scene
      };
    }
    if (same.length) {
      if (same.length <= 3) same.forEach(function(x) { bits.push(x.c + ' ' + x.full); });
      else bits.push('나머지 ' + same.length + '종 ' + _sum(same, 'full'));
    }
    var line = bits.join(', ') + ', 합 ' + d.count + '콤보';
    var why = (d.dead && d.dead.length)
      ? '보드와 내 손에 보이는 카드는 상대가 가질 수 없어 그만큼 빠져요(페어 6, 수딧 4, 오프 12에서 출발)'
      : '페어 6, 수딧 4, 오프수트 12콤보';
    return { line: line + '\n' + why, scene: q.scene };
  }

  // ═══════════════════ 2. rangehit ═══════════════════
  var CATS = ['nut', 'strong', 'medium', 'weak-pair', 'air'];
  var CAT_LABEL = {
    nut: '넛(풀하우스 이상)', strong: '강함(셋, 스트레이트, 플러시)', medium: '중간(오버페어, 탑페어, 트립스, 투페어)',
    'weak-pair': '약한 페어', air: '에어(내 카드로 페어도 못 만든 손, 드로우 포함)'
  };
  var CAT_SHORT = { nut: '넛', strong: '강함', medium: '중간', 'weak-pair': '약한 페어', air: '에어' };
  // 묻는 지표. w = 구간 폭(%p), a = 경계 간격, margin = 정답이 경계에서 떨어져야 하는 최소 거리(애매하면 내지 않는다)
  var MEASURES = {
    top: { cats: ['nut', 'strong', 'medium'], name: '탑페어 이상', def: '탑페어 이상(오버페어, 탑페어, 트립스, 투페어 이상)',
      ask: '탑페어 이상으로 맞은 콤보 비율은?', w: 10, a: 5, margin: 1.5, p: 0.6 },
    air: { cats: ['air'], name: '에어', def: '에어(내 카드로 페어도 못 만든 손, 드로우 포함)',
      ask: '아무것도 못 맞힌(에어, 드로우 포함) 콤보 비율은?', w: 10, a: 5, margin: 1.5, p: 0.25 },
    strong: { cats: ['nut', 'strong'], name: '셋 이상', def: '셋, 스트레이트, 플러시 이상',
      ask: '셋, 스트레이트, 플러시 이상인 콤보 비율은?', w: 3, a: 1, margin: 0.5, p: 0.15, unpaired: true, min: 0.5 }
  };
  var HIT_SINGLE = ['rfi|UTG', 'rfi|HJ', 'rfi|CO', 'rfi|BTN', 'rfi|SB', 'call|BB@BTN', 'call|BB@UTG', 'call|BTN@CO', '3bet|BTN@CO'];
  // 비교 짝: 앞이 프리플랍 공격자. 화면에서는 순서를 무작위로 바꿔 보기 위치로 답이 새지 않게 한다
  var HIT_PAIRS = [['rfi|BTN', 'call|BB@BTN'], ['rfi|UTG', 'call|BB@UTG'], ['rfi|CO', 'call|BTN@CO'], ['rfi|HJ', 'call|CO@HJ'],
    ['3bet|BTN@CO', 'call3|CO'], ['3bet|BB@BTN', 'call3|BTN']];
  var COMPARE_GAP = { top: 3, strong: 1.5 }; // 비교 변형: 두 레인지 차이가 이보다 작으면 내지 않는다

  // 생성 경로: 칸을 실제 카드로 펼쳐 범주를 센다
  function _hitCounts(classes, board) {
    var dm = _deadMap(board), bc = _cardsOf(board), cnt = {}, total = 0;
    CATS.forEach(function(k) { cnt[k] = 0; });
    classes.forEach(function(cl) {
      _expand(cl).forEach(function(p) {
        if (dm[p[0]] || dm[p[1]]) return;
        cnt[Villain._handStrength([_card(p[0]), _card(p[1])], bc)]++;
        total++;
      });
    });
    return { counts: cnt, total: total };
  }

  // verify 경로: 1326 전수 열거
  function _hitCounts1326(classSet, board) {
    var dm = _deadMap(board), bc = _cardsOf(board), cnt = {}, total = 0;
    CATS.forEach(function(k) { cnt[k] = 0; });
    _each1326(function(a, b, h) {
      if (dm[a] || dm[b]) return;
      if (!classSet.has(h)) return;
      cnt[Villain._handStrength([_card(a), _card(b)], bc)]++;
      total++;
    });
    return { counts: cnt, total: total };
  }

  // 범주 분포(소수 1자리). 최대 나머지 방식이라 합이 정확히 100.0
  function _pcts(counts, total) {
    var units = {}, sum = 0, rem = [];
    CATS.forEach(function(k, i) {
      var x = total ? counts[k] * 1000 / total : 0, f = Math.floor(x + 1e-9);
      units[k] = f; sum += f; rem.push({ k: k, r: x - f, i: i });
    });
    if (total) {
      rem.sort(function(a, b) { return (b.r - a.r) || (a.i - b.i); });
      for (var i = 0; sum < 1000; i++, sum++) units[rem[i % rem.length].k]++;
    }
    var out = {};
    CATS.forEach(function(k) { out[k] = units[k] / 10; });
    return out;
  }

  function _measure(hc, m) {
    if (!hc.total) return 0;
    var n = 0;
    m.cats.forEach(function(k) { n += hc.counts[k]; });
    return n * 100 / hc.total;
  }
  function _measureN(hc, m) { var n = 0; m.cats.forEach(function(k) { n += hc.counts[k]; }); return n; }

  // 4지 구간: [b1 미만], [b1~b2), [b2~b3), [b3 이상]. 정답 칸을 고르게 섞고 경계에서 margin 이상 떨어진 것만.
  // 양 끝 칸이 정답이어도 값이 바깥 경계에서 구간 폭 w 안에 있어야 한다(_nearBounds). 값이 8%인데 "60% 미만, 60~70%, ..."처럼
  // 보기가 값과 동떨어지면 생각 없이도 맞히는 문항이 된다
  function _nearBounds(v, bs, m) { return v >= bs[0] - m.w && v < bs[2] + m.w; }
  function _buckets(rnd, v, m) {
    var cands = [];
    for (var b1 = m.a; b1 + 2 * m.w <= 100 - m.a; b1 += m.a) {
      var bs = [b1, b1 + m.w, b1 + 2 * m.w];
      if (bs.some(function(b) { return Math.abs(v - b) < m.margin; })) continue;
      if (!_nearBounds(v, bs, m)) continue;
      cands.push({ bs: bs, idx: _bucketIdx(v, bs) });
    }
    if (!cands.length) return null;
    var idxs = [];
    cands.forEach(function(c) { if (idxs.indexOf(c.idx) < 0) idxs.push(c.idx); });
    var want = _pick(rnd, idxs);
    return _pick(rnd, cands.filter(function(c) { return c.idx === want; }));
  }
  function _bucketIdx(v, bs) { return v < bs[0] ? 0 : (v < bs[1] ? 1 : (v < bs[2] ? 2 : 3)); }
  function _bucketOptions(bs, idx) {
    var labels = [bs[0] + '% 미만', bs[0] + '~' + bs[1] + '%', bs[1] + '~' + bs[2] + '%', bs[2] + '% 이상'];
    return labels.map(function(l, i) {
      var o = { id: 'b' + i, label: l };
      if (Math.abs(i - idx) === 1) o.near = true;
      return o;
    });
  }

  function _pickMeasure(rnd) {
    var list = Object.keys(MEASURES).map(function(k) { return { k: k, w: MEASURES[k].p }; });
    return _weighted(rnd, list).k;
  }

  // 차트 격자. 오픈 레인지는 레이즈 칸이 곧 레인지라 강조 없음, 콜/3벳/4벳 레인지는 차트에 다른 액션도 섞여 있어 레인지 칸을 강조
  function _gridOf(sp, classes) {
    return { pos: sp.pos, facing: sp.facing, opener: sp.opener, highlight: (sp.facing === false || !classes) ? [] : classes.slice() };
  }

  function _hitSingle(rnd, opts) {
    var ids = _spotFilter(opts.spots, HIT_SINGLE);
    for (var t = 0; t < 40; t++) {
      var id = _pick(rnd, ids), sp = SPOTS[id], classes = _spotClasses(id);
      if (!classes) continue;
      var mk = opts.measure && MEASURES[opts.measure] ? opts.measure : _pickMeasure(rnd), m = MEASURES[mk];
      var board = _flop(rnd);
      if (m.unpaired && _paired(board)) continue;
      var hc = _hitCounts(classes, board);
      if (!hc.total) continue;
      var v = _measure(hc, m);
      if (m.min && v < m.min) continue;
      var bk = _buckets(rnd, v, m);
      if (!bk) continue;
      var dist = _pcts(hc.counts, hc.total);
      return {
        type: 'rangehit', key: null, concept: 'range', difficulty: 1750 + (mk === 'strong' ? 50 : 0),
        confidence: 'exact', appDef: false, rated: true, srs: 'once',
        prompt: sp.label + ', 플랍 ' + _sym(board) + '\n' + m.ask,
        scene: { board: board.slice(), range: { label: sp.label }, grid: _gridOf(sp, classes) },
        options: _bucketOptions(bk.bs, bk.idx), answer: 'b' + bk.idx,
        data: {
          spot: id, board: board.slice(), classes: classes.slice(), counts: hc.counts, total: hc.total, dist: dist,
          measure: mk, value: _round(v, 2), hits: _measureN(hc, m), bounds: bk.bs
        }
      };
    }
    return null;
  }

  function _hitCompare(rnd, opts) {
    for (var t = 0; t < 80; t++) {
      var pair = _pick(rnd, HIT_PAIRS);
      if (rnd() < 0.5) pair = [pair[1], pair[0]];
      var A = SPOTS[pair[0]], B = SPOTS[pair[1]];
      var ca = _spotClasses(pair[0]), cb = _spotClasses(pair[1]);
      if (!ca || !cb) continue;
      var board = _flop(rnd);
      if (_paired(board)) continue; // 셋 이상 = 포켓 페어 셋, 스트레이트, 플러시만 되도록(트립스 혼동 방지)
      var ha = _hitCounts(ca, board), hb = _hitCounts(cb, board);
      if (!ha.total || !hb.total) continue;
      var ta = _measure(ha, MEASURES.top), tb = _measure(hb, MEASURES.top);
      var sa = _measure(ha, MEASURES.strong), sb = _measure(hb, MEASURES.strong);
      if (Math.abs(ta - tb) < COMPARE_GAP.top || Math.abs(sa - sb) < COMPARE_GAP.strong) continue;
      var ans = (ta > tb ? 'A' : 'B') + (sa > sb ? 'A' : 'B');
      var opt = [
        { id: 'AA', label: '둘 다 ' + A.short },
        { id: 'AB', label: '많이 ' + A.short + ', 세게 ' + B.short },
        { id: 'BA', label: '많이 ' + B.short + ', 세게 ' + A.short },
        { id: 'BB', label: '둘 다 ' + B.short }
      ];
      opt.forEach(function(o) {
        var diff = (o.id.charAt(0) !== ans.charAt(0) ? 1 : 0) + (o.id.charAt(1) !== ans.charAt(1) ? 1 : 0);
        if (diff === 1) o.near = true;
      });
      function side(id, sp, cls, hc, top, str) {
        return { spot: id, label: sp.label, role: sp.role, short: sp.short, classes: cls.slice(), counts: hc.counts, total: hc.total,
          dist: _pcts(hc.counts, hc.total), top: _round(top, 2), strong: _round(str, 2) };
      }
      return {
        type: 'rangehit', key: null, concept: 'range', difficulty: 1900,
        confidence: 'exact', appDef: false, rated: true, srs: 'once', variant: 'compare',
        prompt: A.role + ' vs ' + B.role + ', 플랍 ' + _sym(board) + '\n많이(탑페어 이상)와 세게(셋 이상) 맞은 쪽은?',
        scene: { board: board.slice(), range: { label: A.label + ' vs ' + B.label }, grid: _gridOf(A, ca),
          note: '격자는 ' + A.role + ' 레인지' },
        options: opt, answer: ans,
        data: { board: board.slice(), a: side(pair[0], A, ca, ha, ta, sa), b: side(pair[1], B, cb, hb, tb, sb) }
      };
    }
    return null;
  }

  // ═══════════════════ 2b. rangehit steps(용의자 명단, s4-02) ═══════════════════
  // 이 앱의 지우기 규칙 v1(계약 F10, lessons/calc/stage4a.js suspects와 같은 규칙):
  //   시작 = 이 앱 차트 레인지(그 자리 오픈 또는 콜)를 콤보로 펴고 보드와 내 손 카드를 뺀다.
  //   플랍에서 계속(벳, 레이즈, 콜) → Villain._handStrength 'air'이고 PostflopGuide.hasDraw가 거짓인 콤보를 지운다.
  //   턴에서 다시 계속 → 'weak-pair' 이하이고 드로우 없는 콤보를 지운다.
  //   리버에서 계속 → 'medium' 미만(weak-pair, air)을 지운다.
  // 단계 k(1 플랍, 2 턴, 3 리버)의 답 = 내 손과 그 단계까지의 보드 카드가 없고 단계 1~k를 모두 통과한 콤보 수(열거로 센다).
  // 문제에는 단계 k 직전의 수(k = 1이면 시작 수, 아니면 지난 단계 뒤 수)를 보이고 단계 k 뒤 남은 수를 4지 구간으로 묻는다.
  // 턴과 리버 카드가 든 콤보는 그 단계에서 카드 제거로 먼저 빠진다(cut, 해설에 따로 적는다).
  var STEP_STREETS = ['flop', 'turn', 'river'];
  var STREET_KO = { flop: '플랍', turn: '턴', river: '리버' };
  var STEP_RULE = { flop: '드로우 없는 에어', turn: '드로우 없는 약한 페어와 에어', river: '약한 페어와 에어' };
  // 해설용: 이 앱의 드로우(PostflopGuide.hasDraw) = 상대 카드를 넣어 같은 무늬 4장이나 연속 숫자 4장. 거트샷은 드로우로 세지 않아
  // 보통 말하는 '드로우'와 다르므로 해설에 정의를 붙인다(지문은 2줄 제한이라 STEP_RULE 그대로)
  var DRAW_DEF = '드로우(같은 무늬 4장이나 연속 숫자 4장, 거트샷 제외)';
  var STEP_RULE_EX = { flop: DRAW_DEF + ' 없는 에어', turn: DRAW_DEF + ' 없는 약한 페어와 에어', river: '약한 페어와 에어' };
  // 상대 레인지 스팟 → 내 자리와 손을 뽑을 레인지(이 앱 차트), 상대가 계속하는 말(오픈한 쪽은 벳, 콜한 쪽은 내 벳에 콜)
  var STEP_SPOTS = {
    'rfi|UTG': { hero: 'call|BB@UTG', act: 'bet' },
    'rfi|HJ': { hero: 'call|CO@HJ', act: 'bet' },
    'rfi|CO': { hero: 'call|BTN@CO', act: 'bet' },
    'rfi|BTN': { hero: 'call|BB@BTN', act: 'bet' },
    'call|BB@BTN': { hero: 'rfi|BTN', act: 'call' },
    'call|BB@UTG': { hero: 'rfi|UTG', act: 'call' },
    'call|BTN@CO': { hero: 'rfi|CO', act: 'call' },
    'call|CO@HJ': { hero: 'rfi|HJ', act: 'call' },
    'call|HJ@UTG': { hero: 'rfi|UTG', act: 'call' }
  };
  var STEP_ACT = { bet: '벳', call: '콜' };
  var STEP_W = [2, 4, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100]; // 구간 폭 후보(콤보)
  var STEP_MIN = { shown: 12, value: 3, erased: 2 };                // 보인 수, 답, 이 단계에서 지운 수의 하한(애매하면 내지 않는다)
  var STEP_CATS = ['nut', 'strong', 'medium', 'weak-pair', 'air'];

  // 생성 경로: 규칙 문장 그대로(범주 이름 비교)
  function _stepKeep(street, cat, draw) {
    if (street === 'flop') return !(cat === 'air' && !draw);
    if (street === 'turn') return !((cat === 'weak-pair' || cat === 'air') && !draw);
    return !(cat === 'weak-pair' || cat === 'air');
  }
  function _clsOf(list) { var m = {}; list.forEach(function(x) { m[x.cl] = true; }); return _sortLabels(Object.keys(m)); }

  // 칸 → 실제 카드 2장. 단계마다 새 보드 카드가 든 콤보를 빼고(cut) 규칙으로 지운다(erased).
  // → { start, steps:[{street, card, cut, prior, erased, left, comp, pcls, cls}] }
  //   (prior = 카드 제거 뒤 액션 직전 수, pcls/cls = 액션 직전/뒤에 1콤보라도 남은 칸)
  function _stepChain(classes, hero, board, k) {
    var dm = _deadMap(hero.concat(board.slice(0, 3))), alive = [];
    classes.forEach(function(cl) {
      _expand(cl).forEach(function(p) { if (!dm[p[0]] && !dm[p[1]]) alive.push({ p: p, cl: cl }); });
    });
    var out = { start: alive.length, steps: [] };
    var strength = Villain._handStrength, hasDraw = PostflopGuide.hasDraw;   // 안쪽 반복에서 전역 조회를 줄인다
    for (var j = 0; j < k; j++) {
      var street = STEP_STREETS[j], bc = _cardsOf(board.slice(0, 3 + j)), card = j > 0 ? board[2 + j] : null, cut = 0;
      if (card) {
        var before = alive.length;
        alive = alive.filter(function(x) { return x.p[0] !== card && x.p[1] !== card; });
        cut = before - alive.length;
      }
      var prior = alive.length, priorCls = _clsOf(alive), kept = [], comp = {};
      STEP_CATS.forEach(function(c) { comp[c] = 0; });
      alive.forEach(function(x) {
        var hc = [_card(x.p[0]), _card(x.p[1])];
        var cat = strength(hc, bc);
        // 드로우가 결과를 바꾸는 경우만 센다(플랍 에어, 턴 약한 페어와 에어. 리버는 드로우 없음)
        var need = (street === 'flop' && cat === 'air') || (street === 'turn' && (cat === 'air' || cat === 'weak-pair'));
        if (_stepKeep(street, cat, need ? !!hasDraw(hc, bc) : false)) { kept.push(x); comp[cat]++; }
      });
      alive = kept;
      out.steps.push({ street: street, card: card, cut: cut, prior: prior, erased: prior - kept.length, left: kept.length, comp: comp,
        pcls: priorCls, cls: _clsOf(kept) });
    }
    return out;
  }

  // 구간 폭: 보인 수의 약 20%에 가장 가까운 후보. 경계 여유: 폭의 15%(최소 2콤보)
  function _stepWidth(shown) {
    var t = shown * 0.2, best = STEP_W[0];
    STEP_W.forEach(function(w) { if (Math.abs(w - t) < Math.abs(best - t)) best = w; });
    return best;
  }
  function _stepMargin(w) { return Math.max(2, Math.round(w * 0.15)); }
  // 4지 구간 [b1 미만], [b1~b2), [b2~b3), [b3 이상]. 0 < b1, b3 ≤ 보인 수, 값은 모든 경계에서 여유 이상,
  // 바깥 경계에서 폭 안(_nearBounds와 같은 이유). 정답 칸을 고르게 섞는다
  // want(0~3)를 주면 그 칸이 정답인 구간만(정답 위치를 먼저 고르게 뽑는다: 리버처럼 대부분 남는 단계가 많아 그냥 두면 '미만' 칸 정답이 드묾)
  function _stepBuckets(rnd, v, shown, w, want) {
    var a = Math.max(1, Math.floor(w / 2)), mg = _stepMargin(w), cands = [];
    for (var b1 = a; b1 + 2 * w <= shown; b1 += a) {
      var bs = [b1, b1 + w, b1 + 2 * w];
      if (bs.some(function(b) { return Math.abs(v - b) < mg; })) continue;
      if (!(v >= b1 - w && v < bs[2] + w)) continue;
      var idx = _bucketIdx(v, bs);
      if (want == null || idx === want) cands.push({ bs: bs, idx: idx });
    }
    if (!cands.length) return null;
    var idxs = [];
    cands.forEach(function(c) { if (idxs.indexOf(c.idx) < 0) idxs.push(c.idx); });
    var pick = _pick(rnd, idxs);
    return _pick(rnd, cands.filter(function(c) { return c.idx === pick; }));
  }
  function _stepOptions(bs, idx) {
    var labels = [bs[0] + '콤보 미만', bs[0] + '~' + bs[1] + '콤보', bs[1] + '~' + bs[2] + '콤보', bs[2] + '콤보 이상'];
    return labels.map(function(l, i) {
      var o = { id: 'b' + i, label: l };
      if (Math.abs(i - idx) === 1) o.near = true;
      return o;
    });
  }
  // 단계 사슬 글: '시작 312콤보 → 플랍 벳 141 → 8♥ 제외 137 → 턴 벳 ?'(upto = 보일 단계 수, ask면 마지막 칸 '?').
  // 묻는 단계의 새 보드 카드가 지운 콤보(카드 제거, s4-01)는 따로 보여 주어 이 문제가 액션으로 지우는 몫만 묻게 한다
  function _stepChainText(d, upto, ask) {
    var act = STEP_ACT[(STEP_SPOTS[d.spot] || {}).act] || '계속';
    var parts = ['시작 ' + d.start + '콤보'];
    for (var j = 0; j < upto; j++) {
      var x = d.chain[j], last = j === upto - 1;
      if (last && x.card && x.cut > 0) parts.push(_sym([x.card]) + ' 제외 ' + x.prior);
      parts.push(STREET_KO[STEP_STREETS[j]] + ' ' + act + ' ' + (ask && last ? '?' : x.left));
    }
    return parts.join(' → ');
  }
  // 지문 1줄 = 이 단계의 규칙(이 앱의 지우기 규칙 명시, F10), 2줄 = 묻는 것. 상대 레인지 이름과 단계 사슬은 장면 range에.
  // 폰 412px에서 내 손, 보드, 사슬, 13x13 격자, 지문 2줄이 하단 보기에 가리지 않게 자리 칩과 note는 문제 장면에 넣지 않는다
  function _stepPrompt(ss, k) {
    var st = STEP_STREETS[k - 1], street = STREET_KO[st], also = k > 1 ? '에서도 ' : '에서 ';
    var what = ss.act === 'call' ? '내 벳에 콜했다면' : '벳했다면';
    return '이 앱의 지우기 규칙 기준, ' + street + '에서 계속하면 ' + STEP_RULE[st] + '를 지워요\n' +
      '상대가 ' + street + also + what + ' 남은 콤보는?';
  }

  function _hitSteps(rnd, opts) {
    var ids = _spotFilter(opts.spots, Object.keys(STEP_SPOTS));
    var k = (opts.step === 1 || opts.step === 2 || opts.step === 3) ? opts.step : 1 + _int(rnd, 3);
    var want = _int(rnd, 4);
    for (var t = 0; t < 60; t++) {
      var id = _pick(rnd, ids), sp = SPOTS[id], ss = STEP_SPOTS[id];
      var classes = _spotClasses(id), hcls = _spotClasses(ss.hero);
      if (!classes || !hcls) continue;
      var hero = _sortHand(_pick(rnd, _expand(_pick(rnd, hcls))));
      var dh = _deadMap(hero);
      var board = _shuffle(rnd, _deck().filter(function(c) { return !dh[c]; })).slice(0, 2 + k);
      var ch = _stepChain(classes, hero, board, k), st = ch.steps[k - 1];
      var shown = st.prior, v = st.left;   // 보인 수 = 이 단계 액션 직전(새 보드 카드 제외 뒤)
      if (shown < STEP_MIN.shown || v < STEP_MIN.value || st.erased < STEP_MIN.erased) continue;
      var w = _stepWidth(shown), bk = _stepBuckets(rnd, v, shown, w, t < 45 ? want : null);   // 45번 안에 못 찾으면 아무 칸
      if (!bk) continue;
      var before = st.pcls;   // 문제 격자 = 이 단계 액션 직전에 1콤보라도 남은 칸
      var data = {
        spot: id, heroSpot: ss.hero, hero: hero.slice(), board: board.slice(), step: k, street: STEP_STREETS[k - 1],
        classes: classes.slice(), start: ch.start,
        chain: ch.steps.map(function(s) {
          return { street: s.street, card: s.card, cut: s.cut, prior: s.prior, erased: s.erased, left: s.left, comp: s.comp };
        }),
        shown: shown, value: v, width: w, margin: _stepMargin(w), bounds: bk.bs,
        before: before.slice(), after: st.cls.slice()
      };
      return {
        type: 'rangehit', key: null, concept: 'range', difficulty: 1750 + 50 * (k - 1),
        confidence: 'exact', appDef: false, rated: false, srs: 'once', variant: 'steps',
        prompt: _stepPrompt(ss, k),
        scene: {
          hero: hero.slice(), board: board.slice(),
          range: { label: '상대 ' + sp.label, text: _stepChainText(data, k, true) },
          grid: { pos: null, facing: false, opener: null, highlight: before.slice() }
        },
        options: _stepOptions(bk.bs, bk.idx), answer: 'b' + bk.idx,
        data: data
      };
    }
    return null;
  }

  // verify 경로: GTO_RANGES 원본 Range.parse + 1326 전수 열거, 규칙은 강도 순위 문턱(드로우는 플랍, 턴에서만 면제)으로 다시 쓴다
  var STEP_RANK = { air: 0, 'weak-pair': 1, medium: 2, strong: 3, nut: 4 };
  var STEP_NEED = [1, 2, 2];
  function _stepsCount1326(raw, hero, board, k) {
    var dmHero = _deadMap(hero), flop = _deadMap(board.slice(0, 3));
    var res = { start: 0, steps: [] };
    var bcs = [];
    for (var j = 0; j < k; j++) {
      bcs.push(_cardsOf(board.slice(0, 3 + j)));
      var comp = {};
      STEP_CATS.forEach(function(c) { comp[c] = 0; });
      res.steps.push({ cut: 0, erased: 0, left: 0, comp: comp, pcls: {}, cls: {} });
    }
    var strength = Villain._handStrength, hasDraw = PostflopGuide.hasDraw;
    _each1326(function(a, b, h) {
      if (!raw.has(h) || dmHero[a] || dmHero[b] || flop[a] || flop[b]) return;
      res.start++;
      var hc = [_card(a), _card(b)];
      for (var j = 0; j < k; j++) {
        var s = res.steps[j];
        if (j > 0 && (a === board[2 + j] || b === board[2 + j])) { s.cut++; return; }
        s.pcls[h] = true;
        var cat = strength(hc, bcs[j]);
        var pass = STEP_RANK[cat] >= STEP_NEED[j] || (j < 2 && !!hasDraw(hc, bcs[j]));
        if (!pass) { s.erased++; return; }
        s.left++; s.comp[cat]++; s.cls[h] = true;
      }
    });
    return res;
  }

  function _stepsVerify(q) {
    var d = q.data, k = d.step;
    if (q.rated !== false || q.difficulty !== 1750 + 50 * (k - 1)) return false;
    if (k !== 1 && k !== 2 && k !== 3) return false;
    var sp = SPOTS[d.spot], ss = STEP_SPOTS[d.spot];
    if (!sp || !ss || d.heroSpot !== ss.hero || d.street !== STEP_STREETS[k - 1]) return false;
    var hero = d.hero, board = d.board;
    if (!Array.isArray(hero) || hero.length !== 2 || !Array.isArray(board) || board.length !== 2 + k) return false;
    var cards = hero.concat(board), seen = {};
    for (var i = 0; i < cards.length; i++) {
      if (!/^[2-9TJQKA][shdc]$/.test(cards[i]) || seen[cards[i]]) return false;
      seen[cards[i]] = true;
    }
    var raw = _rawSpotSet(sp), rawHero = _rawSpotSet(SPOTS[ss.hero]);
    if (!_sameList(_sortLabels(Array.from(raw)), d.classes)) return false;
    if (!rawHero.has(Range.handClass(_card(hero[0]), _card(hero[1])))) return false;  // 내 손 = 내 자리 차트 레인지
    var c = _stepsCount1326(raw, hero, board, k);
    if (c.start !== d.start || !Array.isArray(d.chain) || d.chain.length !== k) return false;
    var prev = c.start;
    for (var j = 0; j < k; j++) {
      var s = c.steps[j], x = d.chain[j];
      if (!x || x.street !== STEP_STREETS[j] || x.card !== (j > 0 ? board[2 + j] : null)) return false;
      if (x.cut !== s.cut || x.prior !== prev - s.cut || x.erased !== s.erased || x.left !== s.left) return false;
      if (s.left !== prev - s.cut - s.erased) return false;
      for (var m = 0; m < STEP_CATS.length; m++) if (!x.comp || x.comp[STEP_CATS[m]] !== s.comp[STEP_CATS[m]]) return false;
      prev = s.left;
    }
    var shown = (k === 1 ? c.start : c.steps[k - 2].left) - c.steps[k - 1].cut, v = c.steps[k - 1].left;
    if (d.shown !== shown || d.value !== v || Number(q.answer.slice(1)) !== _bucketIdx(v, d.bounds || [])) return false;
    if (shown < STEP_MIN.shown || v < STEP_MIN.value || c.steps[k - 1].erased < STEP_MIN.erased) return false;
    // 구간: 폭, 여유, 경계 범위, 보기 글
    var w = _stepWidth(shown), mg = _stepMargin(w), bs = d.bounds;
    if (d.width !== w || d.margin !== mg || !Array.isArray(bs) || bs.length !== 3) return false;
    if (bs[1] - bs[0] !== w || bs[2] - bs[1] !== w || bs[0] < 1 || bs[2] > shown) return false;
    for (var b = 0; b < 3; b++) if (Math.abs(v - bs[b]) < mg) return false;
    if (!(v >= bs[0] - w && v < bs[2] + w)) return false;
    var labels = _stepOptions(bs, 0).map(function(o) { return o.label; });
    for (var o = 0; o < 4; o++) if (q.options[o].id !== 'b' + o || q.options[o].label !== labels[o]) return false;
    // 장면: 카드, 격자 강조(단계 k 직전에 1콤보라도 남은 칸), 해설 격자(단계 k 뒤), 문제에 규칙 명시
    var beforeCls = _sortLabels(Object.keys(c.steps[k - 1].pcls));
    var afterCls = _sortLabels(Object.keys(c.steps[k - 1].cls));
    if (!_sameList(beforeCls, d.before) || !_sameList(afterCls, d.after)) return false;
    var sc = q.scene;
    if (!sc || !_sameList(sc.hero, hero) || !_sameList(sc.board, board) || !sc.grid || !_sameList(sc.grid.highlight, beforeCls)) return false;
    return q.prompt === _stepPrompt(ss, k) && (sc.range && sc.range.text) === _stepChainText(d, k, true);
  }

  function _stepComp(x, street) {
    var name = { nut: '넛', strong: '강함', medium: '중간', 'weak-pair': street === 'flop' ? '약한 페어' : '약한 페어+드로우', air: '드로우만' };
    var out = STEP_CATS.filter(function(c) { return x.comp[c] > 0; }).map(function(c) { return name[c] + ' ' + x.comp[c]; });
    return out.length ? out.join(', ') : '없음';
  }
  function _stepsExplain(q) {
    var d = q.data, k = d.step, x = d.chain[k - 1], st = STREET_KO[x.street];
    var line1 = st + ' ' + _sym(x.card ? [x.card] : d.board.slice(0, 3)) + '에서 계속: ' + STEP_RULE_EX[x.street] + ' ' + x.erased + '콤보를 지워 ' + x.left + '콤보 남음' +
      (x.cut ? '(' + st + ' 카드가 든 ' + x.cut + '콤보도 빠짐)' : '');
    var line2 = '남은 ' + x.left + '콤보: ' + _stepComp(x, x.street);
    return {
      line: line1 + '\n' + line2,
      scene: {
        hero: d.hero.slice(), board: d.board.slice(),
        range: { label: '남은 용의자', text: _stepChainText(d, k, false) },
        grid: { pos: null, facing: false, opener: null, highlight: d.after.slice() },
        note: '칸에 1콤보라도 남으면 표시. 내 손과 보드에 보이는 카드가 든 콤보는 상대가 가질 수 없어 빠져요'
      }
    };
  }

  function rangehitNext(rnd, opts) {
    rnd = _rng(rnd); opts = opts || {};
    if (!_ready(['Range', 'HandEval', 'Villain', 'Gto', 'GtoChart'])) return null;
    if (opts.variant === 'steps') return _ready(['PostflopGuide']) ? _hitSteps(rnd, opts) : null;
    if (opts.variant === 'compare') return _hitCompare(rnd, opts);
    return _hitSingle(rnd, opts);
  }

  function _sameList(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function _sameCounts(a, b) {
    for (var i = 0; i < CATS.length; i++) if ((a && a[CATS[i]]) !== (b && b[CATS[i]])) return false;
    return true;
  }
  function _distOk(dist, counts, total) {
    var s = 0, p = _pcts(counts, total);
    for (var i = 0; i < CATS.length; i++) {
      var k = CATS[i];
      if (typeof dist[k] !== 'number' || Math.abs(dist[k] - p[k]) > 1e-9) return false;
      if (Math.abs(dist[k] - counts[k] * 100 / total) > 0.1 + 1e-9) return false;
      s += dist[k];
    }
    return Math.abs(s - 100) <= 0.1;
  }

  function _verifySide(id, classes, board) {
    var sp = SPOTS[id];
    if (!sp) return null;
    var raw = _rawSpotSet(sp);
    if (!_sameList(_sortLabels(Array.from(raw)), classes)) return null;
    return _hitCounts1326(raw, board);
  }

  function rangehitVerify(q) {
    try {
      if (!q || q.type !== 'rangehit' || !q.data || !_ready(['Range', 'HandEval', 'Villain', 'Gto'])) return false;
      if (q.key !== null || q.srs !== 'once' || q.confidence !== 'exact' || !_optionsOk(q, 4)) return false;
      if (q.variant === 'steps') return _ready(['PostflopGuide']) && _stepsVerify(q);
      var d = q.data, board = d.board;
      if (!Array.isArray(board) || board.length !== 3 || Object.keys(_deadMap(board)).length !== 3) return false;
      if (q.variant === 'compare') {
        if (_paired(board)) return false;
        var ha = _verifySide(d.a && d.a.spot, d.a && d.a.classes, board), hb = _verifySide(d.b && d.b.spot, d.b && d.b.classes, board);
        if (!ha || !hb || !ha.total || !hb.total) return false;
        if (!_sameCounts(ha.counts, d.a.counts) || !_sameCounts(hb.counts, d.b.counts) || ha.total !== d.a.total || hb.total !== d.b.total) return false;
        if (!_distOk(d.a.dist, ha.counts, ha.total) || !_distOk(d.b.dist, hb.counts, hb.total)) return false;
        var ta = _measure(ha, MEASURES.top), tb = _measure(hb, MEASURES.top);
        var sa = _measure(ha, MEASURES.strong), sb = _measure(hb, MEASURES.strong);
        if (Math.abs(ta - tb) < COMPARE_GAP.top || Math.abs(sa - sb) < COMPARE_GAP.strong) return false;
        return q.answer === (ta > tb ? 'A' : 'B') + (sa > sb ? 'A' : 'B');
      }
      var m = MEASURES[d.measure];
      if (!m) return false;
      if (m.unpaired && _paired(board)) return false;
      var hc = _verifySide(d.spot, d.classes, board);
      if (!hc || !hc.total || hc.total !== d.total || !_sameCounts(hc.counts, d.counts)) return false;
      if (!_distOk(d.dist, hc.counts, hc.total)) return false;
      var v = _measure(hc, m), bs = d.bounds;
      if (!Array.isArray(bs) || bs.length !== 3 || bs[1] - bs[0] !== m.w || bs[2] - bs[1] !== m.w) return false;
      for (var i = 0; i < 3; i++) if (Math.abs(v - bs[i]) < m.margin) return false;
      if (!_nearBounds(v, bs, m)) return false;
      if (q.answer !== 'b' + _bucketIdx(v, bs)) return false;
      var labels = _bucketOptions(bs, 0).map(function(o) { return o.label; });
      for (var j = 0; j < 4; j++) if (q.options[j].id !== 'b' + j || q.options[j].label !== labels[j]) return false;
      return true;
    } catch (e) { return false; }
  }

  function _distLine(dist) {
    return '분포: ' + CATS.map(function(k) { return CAT_SHORT[k] + ' ' + _fmt(dist[k]) + '%'; }).join(', ');
  }

  function rangehitExplain(q) {
    if (!q || !q.data) return { line: '' };
    var d = q.data;
    if (q.variant === 'steps') return _stepsExplain(q);
    if (q.variant === 'compare') {
      var A = d.a, B = d.b;
      var many = A.top > B.top ? A.short : B.short, hard = A.strong > B.strong ? A.short : B.short;
      return {
        line: '탑페어 이상 ' + A.short + ' ' + _fmt(A.top) + '% vs ' + B.short + ' ' + _fmt(B.top) + '%, 셋 이상 ' +
          A.short + ' ' + _fmt(A.strong) + '% vs ' + B.short + ' ' + _fmt(B.strong) + '%\n' +
          '많이 맞은 쪽 ' + many + ', 세게 맞은 쪽 ' + hard + '(두 레인지 콤보 전부를 앱 강도 기준으로 셈)',
        scene: { board: d.board, range: { label: SPOTS[B.spot] ? SPOTS[B.spot].label : B.label },
          grid: SPOTS[B.spot] ? _gridOf(SPOTS[B.spot], B.classes) : null, note: '격자는 ' + B.role + ' 레인지' }
      };
    }
    var m = MEASURES[d.measure];
    return {
      line: m.def + ' ' + _fmt(d.value) + '%, ' + d.total + '콤보 중 ' + d.hits + '\n' + _distLine(d.dist),
      scene: { board: d.board, range: q.scene && q.scene.range, grid: q.scene && q.scene.grid, note: _distLine(d.dist) }
    };
  }

  // ═══════════════════ 3. rangepaint ═══════════════════
  var PAINT_SPOTS = ['rfi|UTG', 'rfi|HJ', 'rfi|CO', 'rfi|BTN', 'rfi|SB', 'vsRfi|BB@BTN', 'vsRfi|BB@UTG', 'vsRfi|BTN@CO', 'vsRfi|SB@BTN', 'vs3bet|BTN'];
  var PAINT_OVERLAP = 0.7; // 노드 s5-09, s5-boss의 drill.overlap 기본값
  function _josa(pos) { return pos === 'BTN' ? '이' : '가'; }

  function _paintSpot(spot) { // 'rfi|CO', 'vsRfi|BB@BTN', 'vs3bet|BTN'(PreflopDrill 스팟 표기)
    var p = String(spot || '').split('|'), kind = p[0], at = String(p[1] || '').split('@');
    var facing = kind === 'rfi' ? false : (kind === 'vsRfi' ? true : (kind === 'vs3bet' ? 'vs3bet' : null));
    if (facing === null || !at[0] || p.length !== 2) return null;
    if (kind === 'vsRfi' && !at[1]) return null;
    return { kind: kind, pos: at[0], opener: at[1] || null, facing: facing, spot: kind + '|' + p[1] };
  }
  function _paintLabel(sp) {
    if (sp.kind === 'rfi') return sp.pos + ' 오픈 레인지(앞 전원 폴드)';
    var hasCall = _paintHasCall(sp);
    if (sp.kind === 'vsRfi') return sp.pos + _josa(sp.pos) + ' ' + sp.opener + ' 오픈에 참여하는 손' + (hasCall ? '(콜과 3벳)' : '(3벳만, 콜 없음)');
    return sp.pos + ' 오픈 뒤 3벳을 맞고 계속하는 손' + (hasCall ? '(콜과 4벳)' : '(4벳만, 콜 없음)');
  }

  function _paintHasCall(sp) { // 차트 모델에 콜 칸이 있는지(SB vs 오픈은 3벳 아니면 폴드)
    if (!_has('GtoChart')) return true;
    var m = GtoChart.buildChartModel(sp.pos, sp.facing, sp.opener);
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) if (m.cells[r][c].action === 'call') return true;
    return false;
  }

  var _paintCache = {};
  function _paintTarget(spot) { // 생성 경로: 차트 모델에서 폴드와 none이 아닌 칸
    var sp = _paintSpot(spot);
    if (!sp || !_has('GtoChart')) return null;
    if (_paintCache[sp.spot] !== undefined) return _paintCache[sp.spot];
    var m = GtoChart.buildChartModel(sp.pos, sp.facing, sp.opener), out = [];
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var a = m.cells[r][c].action;
      if (a === 'raise' || a === 'call') out.push(m.cells[r][c].label);
    }
    _paintCache[sp.spot] = out.length ? _sortLabels(out) : null;
    return _paintCache[sp.spot];
  }
  function _paintRaw(spot) { // verify 경로: GTO_RANGES 원본 배열
    var sp = _paintSpot(spot);
    if (!sp || !_has('Gto') || !_has('Range')) return null;
    var G = Gto.GTO_RANGES, set = new Set();
    function add(arr) { if (arr && arr.length) Range.parse(arr.join(',')).forEach(function(h) { set.add(h); }); }
    if (sp.kind === 'rfi') add(G.rfi[sp.pos]);
    else if (sp.kind === 'vsRfi') {
      var vs = (sp.pos === 'BB' && LATE[sp.opener] && G.vsRfiBB_LP) ? G.vsRfiBB_LP : G.vsRfi[sp.pos];
      if (vs) { add(vs.threebet); add(vs.call); }
    } else {
      var v3 = G.vs3bet[sp.pos];
      if (v3) { add(v3.fourbet); add(v3.call); }
    }
    return set.size ? _sortLabels(Array.from(set)) : null;
  }

  // 칠한 칸 정규화: 칸 이름('AKs') 또는 {r, c} 좌표, 배열이나 Set. 잘못된 칸과 중복은 버린다
  function _normCells(cells) {
    var all = _allLabels(), out = {}, list = [];
    if (cells && typeof cells.forEach === 'function') cells.forEach(function(x) { list.push(x); });
    list.forEach(function(x) {
      var l = null;
      if (typeof x === 'string') l = x;
      else if (x && typeof x === 'object' && typeof x.r === 'number' && typeof x.c === 'number' &&
        x.r >= 0 && x.r < 13 && x.c >= 0 && x.c < 13 && x.r === Math.floor(x.r) && x.c === Math.floor(x.c)) l = _gridLabel(x.r, x.c);
      if (l && all[l]) out[l] = true;
    });
    return out;
  }

  function _jaccard(target, mine) {
    var tset = {}, inter = 0, uni = 0;
    target.forEach(function(l) { tset[l] = true; uni++; });
    Object.keys(mine).forEach(function(l) { if (tset[l]) inter++; else uni++; });
    return uni ? inter / uni : 1;
  }

  // 공개 채점 함수: Jaccard = 겹친 칸 / 둘 중 하나라도 칠한 칸. 같은 집합 1, 교집합 없음 0
  function paintScore(spot, cells) {
    var id = (spot && typeof spot === 'object' && spot.data) ? spot.data.spot : spot;
    var target = _paintTarget(id);
    if (!target) return 0;
    return _jaccard(target, _normCells(cells));
  }

  // 채점 상세(위젯과 해설용): {score, ok, missing[], extra[]}
  function paintCheck(q, cells) {
    var id = q && q.data ? q.data.spot : q;
    var target = _paintTarget(id) || [], mine = _normCells(cells), tset = {};
    target.forEach(function(l) { tset[l] = true; });
    var missing = target.filter(function(l) { return !mine[l]; });
    var extra = _sortLabels(Object.keys(mine).filter(function(l) { return !tset[l]; }));
    var s = target.length ? _jaccard(target, mine) : 0;
    var need = (q && q.data && typeof q.data.overlap === 'number') ? q.data.overlap : PAINT_OVERLAP;
    return { score: s, ok: s >= need - 1e-9, missing: missing, extra: extra };
  }

  function _paintBuild(id, opts) {
    var sp = _paintSpot(id), cells = _paintTarget(id);
    if (!sp || !cells) return null;
    var overlap = (opts && typeof opts.overlap === 'number' && opts.overlap > 0 && opts.overlap <= 1) ? opts.overlap : PAINT_OVERLAP;
    var combos = cells.reduce(function(s, l) { return s + _w(l); }, 0);
    var label = _paintLabel(sp);
    return {
      type: 'rangepaint', key: sp.spot, concept: 'range', difficulty: 2000,
      confidence: 'chart', appDef: false, rated: true, srs: 'srs', ui: 'paint',
      prompt: '격자에 칠하기: ' + label + '\n이 앱 차트 기준, 겹침 ' + Math.round(overlap * 100) + '% 이상이면 통과',
      scene: { range: { label: label }, note: '빈 격자에 칠하기' },
      options: [], answer: cells.slice(),
      data: { spot: sp.spot, pos: sp.pos, facing: sp.facing, opener: sp.opener, cells: cells.slice(), overlap: overlap,
        combos: combos, pct: _round(combos * 100 / 1326, 1) }
    };
  }

  function rangepaintNext(rnd, opts) {
    rnd = _rng(rnd); opts = opts || {};
    if (!_ready(['Range', 'Gto', 'GtoChart'])) return null;
    // opts.spots: 차트 데이터가 있는 스팟만 받는다(PAINT_SPOTS 밖이어도 된다). 하나도 없으면 기본 목록
    var ids = Array.isArray(opts.spots) ? opts.spots.filter(function(s) { return !!_paintTarget(s); }) : [];
    if (!ids.length) ids = PAINT_SPOTS;
    return _paintBuild(_pick(rnd, ids), opts);
  }

  function rangepaintFromKey(key, rnd, opts) {
    if (!_ready(['Range', 'Gto', 'GtoChart'])) return null;
    return _paintBuild(key, opts || {});
  }

  function rangepaintVerify(q) {
    try {
      if (!q || q.type !== 'rangepaint' || !q.data || q.ui !== 'paint' || q.confidence !== 'chart' || q.srs !== 'srs') return false;
      var raw = _paintRaw(q.data.spot);
      if (!raw || q.key !== q.data.spot) return false;
      if (!_sameList(raw, q.data.cells) || !_sameList(raw, q.answer)) return false;
      return paintScore(q.data.spot, raw) === 1 && paintScore(q.data.spot, []) === 0;
    } catch (e) { return false; }
  }

  function rangepaintExplain(q, cells) {
    if (!q || !q.data) return { line: '' };
    var d = q.data;
    var line = _paintLabel(_paintSpot(d.spot)) + ' = ' + d.cells.length + '칸, ' + d.combos + '콤보(전체의 약 ' + d.pct + '%)';
    if (cells) {
      var r = paintCheck(q, cells);
      line += ', 내 겹침 ' + Math.round(r.score * 100) + '%(빠진 칸 ' + r.missing.length + ', 더 칠한 칸 ' + r.extra.length + ')';
    }
    return {
      line: line + '\n겹침 = 같이 칠한 칸 ÷ 둘 중 하나라도 칠한 칸(이 앱 차트 기준)',
      scene: { range: { label: _paintLabel(_paintSpot(d.spot)) }, grid: { pos: d.pos, facing: d.facing, opener: d.opener, highlight: [] } }
    };
  }

  // ═══════════════════ 4. rangeshape(앱 정의) ═══════════════════
  // 이 앱의 손 3층(169칸). 위 = QQ 이상과 AK(이 앱 차트 vsCold3bet 4벳 손과 같음),
  // 가운데 = 이 앱 UTG 오픈 레인지에서 위를 뺀 손, 아래 = 그 밖의 모든 손.
  var SHAPE_TIERS = {
    top: ['QQ+', 'AKs', 'AKo'],
    mid: ['66-JJ', 'ATs-AQs', 'KTs+', 'QTs+', 'JTs', 'AJo-AQo', 'KQo']
  };
  var TIER_LABEL = { top: '위(QQ 이상, AK)', mid: '가운데(UTG 오픈의 나머지 손)', bot: '아래(그 밖의 손)' };
  // 판정 규칙(콤보 비율, 0~1). 넷은 서로 겹치지 않고 어디에도 안 맞으면 null(애매해서 내지 않음)
  var SHAPES = [
    { id: 'polar', label: '폴라', rule: { topMin: 0.2, midMax: 0.1, botMin: 0.2 },
      desc: '위와 아래만 있고 가운데가 거의 없다(강한 손 + 블러프, 가운데가 많으면 머지드)' },
    { id: 'merged', label: '머지드', rule: { topMin: 0.2, midMin: 0.3, botMax: 0.1 },
      desc: '위와 가운데로 이어지고 아래가 거의 없다(위에서부터 차례로 담은 모양, 리니어라고도 함)' },
    { id: 'condensed', label: '컨덴스드', rule: { topMax: 0, midMin: 0.6 },
      desc: '위가 비었고 가운데 손이 대부분이다(아래가 대부분이면 캡드)' },
    { id: 'capped', label: '캡드', rule: { topMax: 0, botMin: 0.6 },
      desc: '위가 막혔고(가장 강한 손이 없음) 아래 손이 대부분이다(가운데가 대부분이면 컨덴스드)' }
  ];
  var SHAPE_SIBLING = { polar: 'merged', merged: 'polar', condensed: 'capped', capped: 'condensed' };
  var SHAPE_CLEAR = 0.05; // 출제는 경계에서 이만큼 떨어진 것만

  function _shapeById(id) { for (var i = 0; i < SHAPES.length; i++) if (SHAPES[i].id === id) return SHAPES[i]; return null; }

  function _ruleOk(rule, s, pad) {
    pad = pad || 0;
    var e = 1e-9;
    if (rule.topMin != null && s.top < rule.topMin + pad - e) return false;
    if (rule.topMax != null && s.top > rule.topMax + e) return false;
    if (rule.midMin != null && s.mid < rule.midMin + pad - e) return false;
    if (rule.midMax != null && s.mid > rule.midMax - pad + e) return false;
    if (rule.botMin != null && s.bot < rule.botMin + pad - e) return false;
    if (rule.botMax != null && s.bot > rule.botMax - pad + e) return false;
    return true;
  }

  // shares = {top, mid, bot}(합 1) → 모양 id 또는 null. pad > 0이면 경계 여유를 요구
  function shapeClassify(shares, pad) {
    if (!shares) return null;
    var hit = SHAPES.filter(function(sh) { return _ruleOk(sh.rule, shares, pad); });
    return hit.length === 1 ? hit[0].id : null;
  }

  var _tierMap = null;
  function _tierOf(label) {
    if (!_tierMap) {
      _tierMap = {};
      _parse(SHAPE_TIERS.top.join(',')).forEach(function(h) { _tierMap[h] = 'top'; });
      _parse(SHAPE_TIERS.mid.join(',')).forEach(function(h) { if (!_tierMap[h]) _tierMap[h] = 'mid'; });
    }
    return _tierMap[label] || 'bot';
  }

  // 생성 경로: 칸 무게로 층별 콤보
  function _shapeCounts(classes) {
    var c = { top: 0, mid: 0, bot: 0 };
    classes.forEach(function(l) { c[_tierOf(l)] += _w(l); });
    return c;
  }
  function _shares(c) {
    var t = c.top + c.mid + c.bot;
    return t ? { top: c.top / t, mid: c.mid / t, bot: c.bot / t } : null;
  }

  // 그림 재료. 아래 층 손들은 실전에서 블러프나 넓은 콜에 자주 섞이는 손 위주
  var TOP_SETS = [['QQ+', 'AKs', 'AKo'], ['KK+', 'AKs'], ['QQ+', 'AKs'], ['KK+', 'AKs', 'AKo'], ['AA', 'KK', 'AKs'], ['QQ+', 'AKo']];
  var BLUFF_POOL = ['A5s', 'A4s', 'A3s', 'A2s', 'K9s', 'Q9s', 'J9s', 'T9s', '98s', '87s', '76s', '65s', '54s', 'T8s', '97s', '86s', '75s',
    'K8s', 'K7s', 'A9s', 'A8s', 'A7s', 'A6s'];
  var MID_ORDER = ['JJ', 'AQs', 'TT', 'AQo', 'AJs', 'KQs', '99', 'ATs', 'KJs', '88', 'AJo', 'KQo', 'QJs', 'KTs', '77', 'JTs', 'QTs', '66'];
  var COND_EXTRA = ['55', '44', '33', '22', 'T9s', '98s', '87s', 'A9s', 'A8s', 'K9s', 'Q9s', 'J9s', 'KJo', 'QJo'];
  var CAP_POOL = ['55', '44', '33', '22', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'Q9s', 'Q8s',
    'J9s', 'J8s', 'T9s', 'T8s', '98s', '97s', '87s', '86s', '76s', '75s', '65s', '64s', '54s', 'ATo', 'A9o', 'A8o', 'KJo', 'KTo', 'QJo', 'QTo',
    'JTo', 'K9o', 'T9o', '98o'];
  // 차트 그림 후보. call|BTN@CO(BTN이 CO 오픈에 콜)는 넣지 않는다: 이 앱 층으로는 아래가 87%라 캡드로 나오지만,
  // 표준 이론에서 포지션 있는 플랫 콜은 컨덴스드의 대표 예라 '컨덴스드'를 오답으로 가르치게 된다
  var SHAPE_CHART = ['call|BB@BTN', 'call|BB@UTG', 'call|CO@HJ', 'call|HJ@UTG', '3bet|BTN@CO', '3bet|BB@BTN', '3bet|CO@HJ',
    'call3|BTN', '4bet|BTN', 'rfi|UTG', 'rfi|BTN'];

  function _pickSome(rnd, pool, lo, hi) { return _shuffle(rnd, pool).slice(0, lo + _int(rnd, hi - lo + 1)); }
  function _labelsOfParts(parts) {
    var seen = {}, out = [];
    parts.forEach(function(p) { _parse(p).forEach(function(h) { if (!seen[h]) { seen[h] = true; out.push(h); } }); });
    return _sortLabels(out);
  }

  // 모양별 합성 그림: {parts, classes}
  function _synthShape(rnd, id) {
    var parts;
    if (id === 'polar') parts = _pick(rnd, TOP_SETS).concat(_pickSome(rnd, BLUFF_POOL, 2, 6));
    else if (id === 'merged') parts = _pick(rnd, TOP_SETS.slice(0, 4)).concat(MID_ORDER.slice(0, 2 + _int(rnd, 8)));
    else if (id === 'condensed') parts = _pickSome(rnd, MID_ORDER, 7, 16).concat(_pickSome(rnd, COND_EXTRA, 0, 4));
    else parts = _pickSome(rnd, CAP_POOL, 10, 26).concat(_pickSome(rnd, MID_ORDER, 0, 4));
    parts = _sortLabels(_labelsOfParts(parts)); // 칸 이름 목록(겹침 제거, 격자 순)
    return { parts: parts, classes: parts.slice() };
  }

  var _shapeChartCache = null;
  function _chartShapes() { // 차트 레인지 중 판정이 분명한 것(모양 id → [스팟 id])
    if (_shapeChartCache) return _shapeChartCache;
    var out = {};
    SHAPE_CHART.forEach(function(id) {
      var cls = _spotClasses(id);
      if (!cls) return;
      var sh = shapeClassify(_shares(_shapeCounts(cls)), SHAPE_CLEAR);
      if (sh) (out[sh] = out[sh] || []).push(id);
    });
    _shapeChartCache = out;
    return out;
  }

  function _shapeBuild(rnd, id) {
    var sh = _shapeById(id);
    if (!sh) return null;
    var charts = _chartShapes()[id] || [];
    for (var t = 0; t < 30; t++) {
      var src, classes, label, text = null;
      if (charts.length && rnd() < 0.4) {
        src = _pick(rnd, charts);
        classes = _spotClasses(src);
        label = SPOTS[src].label.replace(/레인지$/, '손') + '(이 앱 차트)';
      } else {
        var syn = _synthShape(rnd, id);
        src = null; classes = syn.classes; label = '격자에 칠한 레인지';
        text = classes.join(', ');
      }
      var counts = _shapeCounts(classes), shares = _shares(counts);
      if (shapeClassify(shares, SHAPE_CLEAR) !== id) continue;
      var opts = SHAPES.map(function(s) {
        var o = { id: s.id, label: s.label };
        if (s.id === SHAPE_SIBLING[id]) o.near = true;
        return o;
      });
      var scene = { range: { label: label }, grid: { pos: null, facing: false, opener: null, highlight: classes.slice() } };
      if (text) scene.range.text = text;
      return {
        type: 'rangeshape', key: id, concept: 'range', difficulty: 2000,
        confidence: 'exact', appDef: true, rated: false, srs: 'srs',
        prompt: label + '\n이 레인지의 모양은?(이 앱의 분류 기준)',
        scene: scene, options: opts, answer: id,
        data: { source: src, classes: classes.slice(), counts: counts, shares: shares, shape: id }
      };
    }
    return null;
  }

  function rangeshapeNext(rnd, opts) {
    rnd = _rng(rnd); opts = opts || {};
    if (!_ready(['Range', 'Gto', 'GtoChart'])) return null;
    var id = opts.shape && _shapeById(opts.shape) ? opts.shape : _pick(rnd, SHAPES).id;
    return _shapeBuild(rnd, id);
  }

  function rangeshapeFromKey(key, rnd, opts) {
    if (!_shapeById(key) || !_ready(['Range', 'Gto', 'GtoChart'])) return null;
    return _shapeBuild(_rng(rnd), key);
  }

  // verify 경로: 1326 열거로 층별 콤보를 다시 센다(층 집합도 Range.parse로 새로 만든다)
  function rangeshapeVerify(q) {
    try {
      if (!q || q.type !== 'rangeshape' || !q.data || !_ready(['Range'])) return false;
      if (q.confidence !== 'exact' || q.appDef !== true || q.rated !== false || q.srs !== 'srs' || q.key !== q.answer) return false;
      if (!_optionsOk(q, 4)) return false;
      for (var i = 0; i < SHAPES.length; i++) if (q.options[i].id !== SHAPES[i].id) return false;
      var d = q.data, set = new Set(d.classes);
      if (!set.size || set.size !== d.classes.length) return false;
      var g = q.scene && q.scene.grid;
      if (!g || !_sameList(_sortLabels(g.highlight || []), _sortLabels(d.classes))) return false;
      if (d.source) {
        var raw = _rawSpotSet(SPOTS[d.source]);
        if (!_sameList(_sortLabels(Array.from(raw)), _sortLabels(d.classes))) return false;
      }
      var top = Range.parse(SHAPE_TIERS.top.join(',')), mid = Range.parse(SHAPE_TIERS.mid.join(','));
      var c = { top: 0, mid: 0, bot: 0 };
      _each1326(function(a, b, h) {
        if (!set.has(h)) return;
        if (top.has(h)) c.top++; else if (mid.has(h)) c.mid++; else c.bot++;
      });
      if (c.top !== d.counts.top || c.mid !== d.counts.mid || c.bot !== d.counts.bot) return false;
      var sh = shapeClassify(_shares(c), 0);
      return !!sh && sh === q.answer && sh === d.shape;
    } catch (e) { return false; }
  }

  function _pctStr(x) { return Math.round(x * 100) + '%'; }
  function rangeshapeExplain(q) {
    if (!q || !q.data) return { line: '' };
    var d = q.data, sh = _shapeById(d.shape), c = d.counts, s = d.shares;
    return {
      line: '위 ' + c.top + '콤보(' + _pctStr(s.top) + '), 가운데 ' + c.mid + '(' + _pctStr(s.mid) + '), 아래 ' + c.bot + '(' + _pctStr(s.bot) +
        ') → ' + sh.label + '\n' + sh.desc + '. 이 앱 기준 위 = QQ 이상과 AK, 가운데 = UTG 오픈의 나머지 손',
      scene: q.scene
    };
  }

  // ═══════════════════ 등록 ═══════════════════
  var gens = {
    combos: { title: '🧮 콤보 세기', next: combosNext, verify: combosVerify, explain: combosExplain, fromKey: combosFromKey,
      ready: function() { return _ready(['Range']); } },
    rangehit: { title: '🎯 레인지 적중', next: rangehitNext, verify: rangehitVerify, explain: rangehitExplain,
      fromKey: function() { return null; }, // once 유형(키 없음)
      ready: function() { return _ready(['Range', 'HandEval', 'Villain', 'Gto', 'GtoChart']); } },
    rangepaint: { title: '🖌 레인지 색칠', next: rangepaintNext, verify: rangepaintVerify, explain: rangepaintExplain,
      fromKey: rangepaintFromKey, score: paintScore, check: paintCheck, target: function(spot) { var t = _paintTarget(spot); return t ? t.slice() : null; },
      ready: function() { return _ready(['Range', 'Gto', 'GtoChart']); } },
    rangeshape: { title: '🔷 레인지 모양', next: rangeshapeNext, verify: rangeshapeVerify, explain: rangeshapeExplain,
      fromKey: rangeshapeFromKey, classify: shapeClassify,
      ready: function() { return _ready(['Range', 'Gto', 'GtoChart']); } }
  };
  // 테스트와 이후 패키지(M5-P7, M6-P1c)가 쓰는 내부 상수와 순수 함수
  var internals = {
    SHAPES: SHAPES, SHAPE_TIERS: SHAPE_TIERS, TIER_LABEL: TIER_LABEL, MEASURES: MEASURES, CATS: CATS, CAT_LABEL: CAT_LABEL,
    SPOTS: SPOTS, PAINT_SPOTS: PAINT_SPOTS, PAINT_OVERLAP: PAINT_OVERLAP, COMBO_DEAD: COMBO_DEAD, BLOCK_DEAD: BLOCK_DEAD,
    leftOf: _leftOf, enumLeft: _enumLeft, hitCounts: _hitCounts, hitCounts1326: _hitCounts1326, pcts: _pcts,
    spotClasses: function(id) { var c = _spotClasses(id); return c ? c.slice() : null; },
    rawSpot: function(id) { return SPOTS[id] ? _sortLabels(Array.from(_rawSpotSet(SPOTS[id]))) : null; },
    paintRaw: _paintRaw, shapeCounts: _shapeCounts, shares: _shares, tierOf: _tierOf, chartShapes: _chartShapes,
    // M5-WEEKLY rangehit steps(계약 F10 지우기 규칙)
    STEP_SPOTS: STEP_SPOTS, STEP_RULE: STEP_RULE, stepKeep: _stepKeep, stepChain: _stepChain, stepsCount1326: _stepsCount1326,
    stepWidth: _stepWidth, stepMargin: _stepMargin
  };
  Object.keys(gens).forEach(function(k) { gens[k]._ = internals; });

  // meta: C1 {stage, group, concept}. confidence, rated, srs, base는 정본(M2-P1 TYPE_META, 부록 C)과 같은 값을 참고로 함께 둔다
  var META = {
    combos: { stage: 4, group: 'math', concept: 'combos', confidence: 'exact', appDef: false, rated: true, srs: 'srs', base: 1700 },
    rangehit: { stage: 4, group: 'other', concept: 'range', confidence: 'exact', appDef: false, rated: true, srs: 'once', base: 1750 },
    rangepaint: { stage: 5, group: 'preflop', concept: 'range', confidence: 'chart', appDef: false, rated: true, srs: 'srs', base: 2000, ui: 'paint' },
    rangeshape: { stage: 5, group: 'other', concept: 'range', confidence: 'exact', appDef: true, rated: false, srs: 'srs', base: 2000 }
  };

  if (typeof Puzzles !== 'undefined' && Puzzles && typeof Puzzles.register === 'function') {
    Object.keys(gens).forEach(function(k) { Puzzles.register(k, gens[k], META[k]); });
  }
  if (typeof Drills !== 'undefined' && Drills && typeof Drills.keyPolicy === 'function') Drills.keyPolicy('rangehit', 'once');
  if (typeof module !== 'undefined' && module) module.exports = { gens: gens, META: META };
})();
