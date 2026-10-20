// lessons/calc/stage5a.js (채우는 그룹: M6-L5A, s5-01~06)
// 레슨 calc 등록부(계약 L9, lessons/lesson-core.js 머리 주석)에 LessonCore.defineCalc로 등록하는 유형 5개(계약 H13, 접두 s5a).
// 입력에 pot 필드는 쓰지 않는다(potBefore = 벳 전 팟, potTotal = 상대 벳 포함 팟). 퍼센트 변수는 정수 반올림(0.5는 올림).
// 모든 유형의 verify는 calc 코드를 부르지 않는 독립 경로다(tests/j-lessons.test.js가 장면마다 calc와 verify의 공통 변수를 대조).
//
// 공통 입력 spot = 이 앱 차트 레인지 이름(stage4a rangehit, gen-range SPOTS와 같은 표기).
//   'rfi|POS'(오픈), 'call|POS@OPENER'(오픈에 콜), '3bet|POS@OPENER'(오픈에 3벳), 'call3|POS'(오픈 뒤 3벳을 맞고 콜),
//   '4bet|POS'(오픈 뒤 3벳을 맞고 4벳). BB가 CO, BTN, SB 오픈을 맞으면 넓은 방어표(vsRfiBB_LP). 콜 칸은 레이즈 칸을 뺀 나머지.
//
// s5aAdv {a: spot, b: spot, board[3~5]}: 두 레인지의 적중 비교(s5-01 레인지 vs 넛 어드밴티지, 설계서 부록 A 42번).
//   범주는 Villain._handStrength(stage4a rangehit, gen-range CATS와 같다). 탑페어 이상 = 넛 + 강함 + 중간
//   (셋, 스트레이트, 플러시 이상과 오버페어, 탑페어, 트립스, 두 장 다 쓰는 투페어), 셋 이상 = 넛 + 강함(셋, 스트레이트, 플러시 이상).
//   → aN, bN(보드 카드를 뺀 콤보 수), aTop, bTop(탑페어 이상 %), aNut, bNut(셋 이상 %),
//     rangeAdv = 탑페어 이상 비율이 큰 쪽 'a' | 'b' | 'even', nutAdv = 셋 이상 비율이 큰 쪽 'a' | 'b' | 'even'
//     (반올림 전 콤보 비율을 곱셈으로 비교). main 'nutAdv'.
//   calc: stage4a rangehit(차트 모델 칸을 카드로 펼쳐 센다)를 두 번 부른다(계약 H13, M5 유형 읽기 전용).
//   verify: GTO_RANGES 원본 배열 Range.parse + 52장 1326조합 전수 열거 + 정수 반올림.
//   qCards = board. chip 'chart'(이 앱 차트 레인지 기준).
// s5aShape {range: Range.parse 문자열 | spot}: 레인지 모양(s5-03, 이 앱의 분류 기준, gen-range rangeshape와 같은 규칙).
//   층(169칸): 위 = QQ 이상과 AK, 가운데 = 이 앱 UTG 오픈에서 위를 뺀 손(66-JJ, ATs-AQs, KTs+, QTs+, JTs, AJo-AQo, KQo), 아래 = 나머지.
//   모양 규칙(콤보 비율): 폴라 위 ≥ 0.2, 가운데 ≤ 0.1, 아래 ≥ 0.2 / 머지드 위 ≥ 0.2, 가운데 ≥ 0.3, 아래 ≤ 0.1 /
//     컨덴스드 위 0, 가운데 ≥ 0.6 / 캡드 위 0, 아래 ≥ 0.6. 하나만 맞으면 그 모양, 아니면 'none'.
//   → top, mid, bot(층별 콤보 수, 페어 6, 수딧 4, 오프 12), total, pctTop, pctMid, pctBot, shape('polar' | 'merged' | 'condensed' |
//     'capped' | 'none'), clear(경계에서 0.05 이상 떨어져 gen-range가 문제로 낼 만큼 분명하면 true). main 'shape'.
//   calc: 이 파일의 층 표와 규칙 표, 칸 무게 합(spot은 GtoChart.buildChartModel 칸).
//   verify: gen-range의 실제 표와 판정(Puzzles.get('rangeshape')._.SHAPE_TIERS, .classify)을 1326 전수 열거로 다시 센다.
//     그래서 j-lessons의 calc와 verify 대조가 곧 'gen-range rangeshape 분류와 일치' 검사다(Puzzles가 없으면 오류).
//   chip 'appdef'(이 앱의 분류 기준, 설계서 8.2절 3번).
// s5aToy {potBefore, bet}: A/K/Q 리버 토이 게임(s5-04, 계약 H1 toyGame과 같은 식). 나는 A(밸류) 또는 Q(블러프)를 같은 확률로 받고
//   상대는 늘 K(블러프캐처). A는 늘 벳, Q는 일부만 블러프, K는 일부만 콜할 때 서로 무차별해지는 빈도.
//   → bluff = round(bet x 100 / (potBefore + 2 x bet))(벳 중 블러프 몫, K의 콜이 본전), value = 100 - bluff,
//     call = round(potBefore x 100 / (potBefore + bet))(K의 콜 빈도 = MDF, Q 블러프가 본전), fold = 100 - call,
//     qBluff = round(bet x 100 / (potBefore + bet))(Q를 받았을 때 블러프하는 빈도, A와 Q가 같은 확률일 때), qCheck = 100 - qBluff,
//     potBefore, bet, potTotal = potBefore + bet(K가 보는 팟), toCall = bet. main 'bluff'.
//   calc: 닫힌 식. verify: 1/100bb 정수로 바꿔 EV = 0 식을 다른 형태로 풀어 정수 반올림. qNums = [potBefore, bet].
// s5aMix {hero[2], board[5], combos:[[c1, c2] | 'c1c2', ...], potTotal, toCall}: 리버 '둘 다 OK' 판정(s5-05, 계약 H3).
//   주어진 상대 콤보 목록을 열거한 내 승률 eq와 필요 승률 need = toCall / (potTotal + toCall)(반올림 전 값)로
//   |eq - need| < 0.04면 'both'(둘 다 OK, engine/coach.js marginal과 같은 값), eq - need ≥ 0.08이면 'call', need - eq ≥ 0.08이면 'fold',
//   그 사이는 'gray'(퍼즐로 내지 않는 구간).
//   → eq, need(정수 %), eqd, needd(같은 값의 소수 첫째 자리 문자열, potodds pctd와 같은 예외: 4%p 기준과 견주는 문장에서
//     정수끼리 빼면 기준과 어긋나 보이므로(25%와 29%인데 3.6%p) 해설은 이 값을 쓴다. facingbet-river marginal 해설도 소수 첫째 자리),
//     gap(|eq - need|를 %p로 소수 첫째 자리 문자열), verdict, win, tie, lose, n(콤보 수), potTotal, toCall,
//     band = 4, clear = 8(기준 %p, 문장용). main 'verdict'.
//   calc: stage4b eqRange(정수 카드 evaluateIdx 경로)로 센 뒤 소수로 판정. verify: 카드 객체 HandEval.evaluate 경로와 정수 곱셈 비교.
//   qNums = [potTotal, toCall], qCards = hero + board + 콤보 카드.
// s5aGeo {potBefore(지금 팟), stack(유효 스택), n(남은 벳 횟수 1~3)}: 기하 사이즈(s5-06, puzzles/gen-math.js geoSize와 같은 식).
//   매번 팟의 같은 비율 b로 벳하고 콜을 받아 n번째 벳에 딱 올인이 되는 b = ((1 + 2 x stack ÷ potBefore)^(1/n) - 1) ÷ 2.
//   → pct = round(b x 100), potBefore, stack, n, betK(K번째 벳 bb), potK(K번째 벳과 콜 뒤 팟 bb), K = 1..n. main 'pct'.
//   calc: 닫힌 식(GenMath.geoSize와 같은 식). verify: 스트리트마다 벳과 콜을 쌓는 시뮬레이션으로 b를 이분 탐색(독립 경로),
//     GenMath가 있으면 GenMath.geoSize와 1e-9 안에서 같은지도 본다. qNums = [potBefore, stack, n].
// 로드 때 LessonCore가 있으면 등록만 한다(DOM, window, localStorage 접근 없음). 다른 모듈은 호출 때 typeof 가드.
(function() {
  var RANKS = '23456789TJQKA', SUITS = 'shdc';
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var LATE = { CO: true, BTN: true, SB: true };

  function _fin(x) { return typeof x === 'number' && isFinite(x); }
  function _bb(x) { var v = Math.round(Number(x) * 100) / 100; return v === 0 ? 0 : v; }
  // 정수 반올림 퍼센트(0.5 올림): round(100 n / d), n, d는 0 이상 정수, d > 0
  function _ipct(n, d) { return Math.floor((200 * n + d) / (2 * d)); }
  function _cents(x) { return Math.round(Number(x) * 100); }
  function _cardStr(x) {
    var s = String(x == null ? '' : x).trim();
    if (s.length === 3 && s.slice(0, 2) === '10') s = 'T' + s.charAt(2);
    if (s.length !== 2) return null;
    var r = s.charAt(0).toUpperCase(), u = s.charAt(1).toLowerCase();
    return (RANKS.indexOf(r) >= 0 && SUITS.indexOf(u) >= 0) ? r + u : null;
  }
  function _obj(s) { return { rank: s.charAt(0), suit: s.charAt(1) }; }
  function _comboStrs(x) {
    var a = Array.isArray(x) ? x : (typeof x === 'string' && x.trim().length === 4 ? [x.trim().slice(0, 2), x.trim().slice(2)] : null);
    if (!a || a.length !== 2) return null;
    var p = _cardStr(a[0]), q = _cardStr(a[1]);
    return (p && q && p !== q) ? [p, q] : null;
  }
  // 카드 목록 → 문자열 배열 | null(표기 오류, 장 수, 중복)
  function _list(arr, min, max) {
    if (!Array.isArray(arr) || arr.length < min || arr.length > max) return null;
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var c = _cardStr(arr[i]);
      if (!c || out.indexOf(c) >= 0) return null;
      out.push(c);
    }
    return out;
  }
  function _have(name) {
    switch (name) {
      case 'Range': return typeof Range !== 'undefined' && !!Range && typeof Range.parse === 'function' && typeof Range.handClass === 'function';
      case 'Villain': return typeof Villain !== 'undefined' && !!Villain && typeof Villain._handStrength === 'function';
      case 'Gto': return typeof Gto !== 'undefined' && !!Gto && !!Gto.GTO_RANGES;
      case 'GtoChart': return typeof GtoChart !== 'undefined' && !!GtoChart && typeof GtoChart.buildChartModel === 'function';
      case 'HandEval': return typeof HandEval !== 'undefined' && !!HandEval && typeof HandEval.evaluate === 'function' && typeof HandEval.compareHands === 'function';
      case 'LessonCore': return typeof LessonCore !== 'undefined' && !!LessonCore && typeof LessonCore.calc === 'function';
    }
    return false;
  }
  function _need(list) {
    for (var i = 0; i < list.length; i++) if (!_have(list[i])) return { error: list[i] + '가 없어요' };
    return null;
  }

  // ── 차트 스팟 표기(stage4a와 같은 규칙) ─────────────────
  var KINDS = {
    rfi: { facing: false, act: 'raise', opener: false },
    call: { facing: true, act: 'call', opener: true },
    '3bet': { facing: true, act: 'raise', opener: true },
    call3: { facing: 'vs3bet', act: 'call', opener: false },
    '4bet': { facing: 'vs3bet', act: 'raise', opener: false }
  };
  function _spotSpec(spot) {
    var m = /^([a-z0-9]+)\|([A-Z]+)(?:@([A-Z]+))?$/.exec(String(spot == null ? '' : spot).trim());
    var k = m && Object.prototype.hasOwnProperty.call(KINDS, m[1]) ? KINDS[m[1]] : null;
    if (!k) return { error: 'spot 표기를 알 수 없어요: ' + spot };
    var pos = m[2], op = m[3] || null;
    if (POS6.indexOf(pos) < 0) return { error: 'spot 자리를 알 수 없어요: ' + pos };
    if (k.opener) {
      if (!op || POS6.indexOf(op) < 0 || POS6.indexOf(op) >= POS6.indexOf(pos)) return { error: 'spot 오프너가 맞지 않아요(@오프너, 내 앞자리): ' + spot };
    } else if (op) return { error: 'spot에 오프너를 쓰지 않는 표기예요: ' + spot };
    return { pos: pos, opener: op, facing: k.facing, act: k.act };
  }
  // GTO_RANGES 원본 배열 → 칸 집합(Set). 콜 칸은 레이즈 칸을 뺀 나머지(verify 경로)
  function _rawSpotSet(sp) {
    var R = Gto.GTO_RANGES, set = new Set(), raise = null, call = null;
    function add(arr) { if (Array.isArray(arr) && arr.length) Range.parse(arr.join(',')).forEach(function(h) { set.add(h); }); }
    function minus(arr) { if (Array.isArray(arr) && arr.length) Range.parse(arr.join(',')).forEach(function(h) { set.delete(h); }); }
    if (sp.facing === false) { add(R.rfi[sp.pos]); return set; }
    if (sp.facing === 'vs3bet') {
      var v3 = R.vs3bet && R.vs3bet[sp.pos];
      if (!v3) return set;
      raise = v3.fourbet; call = v3.call;
    } else {
      var vs = (sp.pos === 'BB' && LATE[sp.opener] && R.vsRfiBB_LP) ? R.vsRfiBB_LP : (R.vsRfi && R.vsRfi[sp.pos]);
      if (!vs) return set;
      raise = vs.threebet; call = vs.call;
    }
    if (sp.act === 'raise') { add(raise); return set; }
    add(call); minus(raise);
    return set;
  }
  // 차트 모델 칸 이름 배열(calc 경로)
  function _chartClasses(sp) {
    var m = GtoChart.buildChartModel(sp.pos, sp.facing, sp.opener || undefined), out = [];
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) if (m.cells[r][c].action === sp.act) out.push(m.cells[r][c].label);
    return out;
  }
  // 레인지 문자열 → 칸 집합 | {error}. 쉼표 조각마다 손이 하나 이상 나와야 한다(오타를 조용히 버리지 않게)
  function _rangeSet(str) {
    if (typeof str !== 'string' || !str.trim()) return { error: 'range는 레인지 문자열이에요(예 QQ+, AKs)' };
    var parts = str.split(','), set = new Set();
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim(), s = p ? Range.parse(p) : null;
      if (!s || !s.size) return { error: '레인지 조각을 읽을 수 없어요: ' + (p || '(빈 조각)') };
      s.forEach(function(h) { set.add(h); });
    }
    return { set: set };
  }

  // 52장 1326조합 열거(verify 공용)
  var _PAIRS = null;
  function _pairs() {
    if (!_PAIRS) {
      _PAIRS = [];
      var deck = [];
      for (var r = 0; r < 13; r++) for (var s = 0; s < 4; s++) deck.push(RANKS.charAt(r) + SUITS.charAt(s));
      for (var i = 0; i < 52; i++) for (var j = i + 1; j < 52; j++) {
        var a = _obj(deck[i]), b = _obj(deck[j]);
        _PAIRS.push({ a: deck[i], b: deck[j], h: [a, b], cls: Range.handClass(a, b) });
      }
    }
    return _PAIRS;
  }
  // 두 비율 n1/d1과 n2/d2 비교(곱셈) → 'a' | 'b' | 'even'
  function _cmp(n1, d1, n2, d2) {
    var x = n1 * d2, y = n2 * d1;
    return x > y ? 'a' : (x < y ? 'b' : 'even');
  }

  // ═══════════ s5aAdv ═══════════
  function advCalc(c) {
    var e = _need(['LessonCore']);
    if (e) return e;
    if (!LessonCore.calcDef || !LessonCore.calcDef('rangehit')) return { error: 'rangehit 유형(stage4a)이 없어요' };
    if (c.a == null || c.b == null) return { error: 's5aAdv에는 a, b 스팟 둘 다 필요해요' };
    var board = _list(c.board, 3, 5);
    if (!board) return { error: 's5aAdv board는 서로 다른 카드 3~5장이에요' };
    var ra = LessonCore.calc({ type: 'rangehit', spot: c.a, board: board });
    if (ra.error) return { error: 'a: ' + ra.error };
    var rb = LessonCore.calc({ type: 'rangehit', spot: c.b, board: board });
    if (rb.error) return { error: 'b: ' + rb.error };
    return {
      aN: ra.total, bN: rb.total, aTop: ra.pctTop, bTop: rb.pctTop, aNut: ra.pctStrong, bNut: rb.pctStrong,
      rangeAdv: _cmp(ra.nTop, ra.total, rb.nTop, rb.total), nutAdv: _cmp(ra.nStrong, ra.total, rb.nStrong, rb.total)
    };
  }
  function advVerify(c) {
    var e = _need(['Range', 'Villain', 'Gto', 'HandEval']);
    if (e) return e;
    var board = _list(c.board, 3, 5);
    if (!board) return { error: 'board 3~5장' };
    var bo = board.map(_obj), dead = {};
    board.forEach(function(x) { dead[x] = 1; });
    var side = function(spot) {
      var sp = _spotSpec(spot);
      if (sp.error) return sp;
      var set = _rawSpotSet(sp);
      if (!set.size) return { error: '빈 차트 레인지: ' + spot };
      var n = 0, top = 0, strong = 0;
      _pairs().forEach(function(p) {
        if (dead[p.a] || dead[p.b] || !set.has(p.cls)) return;
        var hs = Villain._handStrength(p.h, bo);
        n++;
        if (hs === 'nut' || hs === 'strong') { strong++; top++; } else if (hs === 'medium') top++;
      });
      return n ? { n: n, top: top, strong: strong } : { error: '남는 콤보 없음: ' + spot };
    };
    var A = side(c.a);
    if (A.error) return A;
    var B = side(c.b);
    if (B.error) return B;
    return {
      aN: A.n, bN: B.n, aTop: _ipct(A.top, A.n), bTop: _ipct(B.top, B.n), aNut: _ipct(A.strong, A.n), bNut: _ipct(B.strong, B.n),
      rangeAdv: _cmp(A.top, A.n, B.top, B.n), nutAdv: _cmp(A.strong, A.n, B.strong, B.n)
    };
  }

  // ═══════════ s5aShape ═══════════
  // 이 파일의 층 표와 규칙 표(gen-range SHAPE_TIERS, SHAPES와 같아야 한다. 다르면 verify 대조가 실패한다)
  var TIER_TOP = 'QQ+, AKs, AKo';
  var TIER_MID = '66-JJ, ATs-AQs, KTs+, QTs+, JTs, AJo-AQo, KQo';
  var SHAPE_RULES = [
    { id: 'polar', topMin: 0.2, midMax: 0.1, botMin: 0.2 },
    { id: 'merged', topMin: 0.2, midMin: 0.3, botMax: 0.1 },
    { id: 'condensed', topMax: 0, midMin: 0.6 },
    { id: 'capped', topMax: 0, botMin: 0.6 }
  ];
  var CLEAR_PAD = 0.05;   // gen-range SHAPE_CLEAR(문제로 낼 만큼 분명한 거리)
  function _ruleHit(r, s, pad) {
    var e = 1e-9;
    if (r.topMin != null && s.top < r.topMin + pad - e) return false;
    if (r.topMax != null && s.top > r.topMax + e) return false;
    if (r.midMin != null && s.mid < r.midMin + pad - e) return false;
    if (r.midMax != null && s.mid > r.midMax - pad + e) return false;
    if (r.botMin != null && s.bot < r.botMin + pad - e) return false;
    if (r.botMax != null && s.bot > r.botMax - pad + e) return false;
    return true;
  }
  function _shapeOf(s, pad) {
    var hit = SHAPE_RULES.filter(function(r) { return _ruleHit(r, s, pad); });
    return hit.length === 1 ? hit[0].id : 'none';
  }
  function _weight(label) { return label.length === 2 ? 6 : (label.charAt(2) === 's' ? 4 : 12); }
  function shapeCalc(c) {
    var e = _need(['Range']);
    if (e) return e;
    if ((c.range != null) === (c.spot != null)) return { error: 'range와 spot 중 하나만 써요' };
    var classes;
    if (c.range != null) {
      var rs = _rangeSet(c.range);
      if (rs.error) return rs;
      classes = Array.from(rs.set);
    } else {
      var sp = _spotSpec(c.spot);
      if (sp.error) return sp;
      var e2 = _need(['GtoChart']);
      if (e2) return e2;
      classes = _chartClasses(sp);
      if (!classes.length) return { error: '이 스팟의 차트 레인지가 비었어요: ' + c.spot };
    }
    var top = Range.parse(TIER_TOP), mid = Range.parse(TIER_MID), cnt = { top: 0, mid: 0, bot: 0 };
    classes.forEach(function(l) { cnt[top.has(l) ? 'top' : (mid.has(l) ? 'mid' : 'bot')] += _weight(l); });
    var t = cnt.top + cnt.mid + cnt.bot, sh = { top: cnt.top / t, mid: cnt.mid / t, bot: cnt.bot / t };
    var shape = _shapeOf(sh, 0);
    return { top: cnt.top, mid: cnt.mid, bot: cnt.bot, total: t,
      pctTop: Math.round(cnt.top * 100 / t), pctMid: Math.round(cnt.mid * 100 / t), pctBot: Math.round(cnt.bot * 100 / t),
      shape: shape, clear: shape !== 'none' && _shapeOf(sh, CLEAR_PAD) === shape };
  }
  function shapeVerify(c) {
    var e = _need(['Range']);
    if (e) return e;
    var G = (typeof Puzzles !== 'undefined' && Puzzles && typeof Puzzles.get === 'function') ? Puzzles.get('rangeshape') : null;
    if (!G || typeof G.classify !== 'function' || !G._ || !G._.SHAPE_TIERS) return { error: 'gen-range rangeshape(Puzzles)가 없어요' };
    if ((c.range != null) === (c.spot != null)) return { error: 'range와 spot 중 하나' };
    var set;
    if (c.range != null) {
      var rs = _rangeSet(c.range);
      if (rs.error) return rs;
      set = rs.set;
    } else {
      var e2 = _need(['Gto']);
      if (e2) return e2;
      var sp = _spotSpec(c.spot);
      if (sp.error) return sp;
      set = _rawSpotSet(sp);
      if (!set.size) return { error: '빈 차트 레인지' };
    }
    var T = G._.SHAPE_TIERS, top = Range.parse(T.top.join(',')), mid = Range.parse(T.mid.join(','));
    var k = { top: 0, mid: 0, bot: 0 };
    _pairs().forEach(function(p) {
      if (!set.has(p.cls)) return;
      if (top.has(p.cls)) k.top++; else if (mid.has(p.cls)) k.mid++; else k.bot++;
    });
    var t = k.top + k.mid + k.bot;
    if (!t) return { error: '콤보 0개' };
    var shares = { top: k.top / t, mid: k.mid / t, bot: k.bot / t };
    var shape = G.classify(shares, 0) || 'none';
    return { top: k.top, mid: k.mid, bot: k.bot, total: t, pctTop: _ipct(k.top, t), pctMid: _ipct(k.mid, t), pctBot: _ipct(k.bot, t),
      shape: shape, clear: shape !== 'none' && G.classify(shares, 0.05) === shape };
  }

  // ═══════════ s5aToy ═══════════
  function _sizeErr(c) {
    if (!_fin(c.potBefore) || !_fin(c.bet)) return { error: 's5aToy에는 potBefore(벳 전 팟)와 bet 숫자가 필요해요' };
    if (!(c.potBefore > 0) || !(c.bet > 0)) return { error: 's5aToy potBefore와 bet은 0보다 커야 해요' };
    return null;
  }
  function toyCalc(c) {
    var bad = _sizeErr(c);
    if (bad) return bad;
    var P = c.potBefore, B = c.bet;
    var bluff = Math.round(B * 100 / (P + 2 * B)), call = Math.round(P * 100 / (P + B)), qb = Math.round(B * 100 / (P + B));
    return { bluff: bluff, value: 100 - bluff, call: call, fold: 100 - call, qBluff: qb, qCheck: 100 - qb,
      potBefore: _bb(P), bet: _bb(B), potTotal: _bb(P + B), toCall: _bb(B) };
  }
  // 독립 경로: 1/100bb 정수. K의 콜 EV = s(P + B) - (1 - s)B = 0 → 블러프 몫 s = 1 - (P + B)/(P + 2B),
  // Q 블러프 EV = (1 - c)P - cB = 0 → 콜 c = 1 - B/(P + B), A와 Q가 반반이면 q/(1 + q) = s → q = s/(1 - s) = B/(P + B)
  function toyVerify(c) {
    if (typeof c.potBefore !== 'number' || typeof c.bet !== 'number' || !isFinite(c.potBefore) || !isFinite(c.bet)) return { error: 'potBefore, bet 숫자' };
    var p = _cents(c.potBefore), b = _cents(c.bet);
    if (!(p > 0) || !(b > 0)) return { error: 'potBefore, bet > 0' };
    var s = _ipct((p + 2 * b) - (p + b), p + 2 * b);
    var call = _ipct((p + b) - b, p + b);
    var q = _ipct(b * (p + 2 * b), (p + 2 * b) * (p + b));   // (B/(P+2B)) ÷ ((P+B)/(P+2B))
    return { bluff: s, value: 100 - s, call: call, fold: 100 - call, qBluff: q, qCheck: 100 - q,
      potBefore: p / 100, bet: b / 100, potTotal: (p + b) / 100, toCall: b / 100 };
  }

  // ═══════════ s5aMix ═══════════
  var MIX_BAND = 4, MIX_CLEAR = 8;   // %p(계약 H3, engine/coach.js marginal 0.04와 facingbet-river 출제 간격 0.08)
  function _priceErr(c) {
    if (!_fin(c.potTotal) || !_fin(c.toCall) || c.potTotal < 0 || !(c.toCall > 0)) return { error: 's5aMix에는 potTotal(0 이상)과 toCall(0보다 큼)이 필요해요' };
    return null;
  }
  function mixCalc(c) {
    var e = _need(['LessonCore']);
    if (e) return e;
    if (!LessonCore.calcDef || !LessonCore.calcDef('eqRange')) return { error: 'eqRange 유형(stage4b)이 없어요' };
    var bad = _priceErr(c);
    if (bad) return bad;
    if (!Array.isArray(c.board) || c.board.length !== 5) return { error: 's5aMix는 리버(보드 5장)만 써요' };
    if (!Array.isArray(c.combos)) return { error: 's5aMix는 상대 콤보 목록(combos)을 적어요' };
    var r = LessonCore.calc({ type: 'eqRange', hero: c.hero, board: c.board, combos: c.combos, potTotal: c.potTotal, toCall: c.toCall });
    if (r.error) return { error: r.error };
    var eqF = (r.win + r.tie / 2) / r.runs, needF = c.toCall / (c.potTotal + c.toCall), d = eqF - needF, ad = Math.abs(d);
    var verdict = ad < MIX_BAND / 100 - 1e-12 ? 'both' : (ad >= MIX_CLEAR / 100 - 1e-12 ? (d > 0 ? 'call' : 'fold') : 'gray');
    var d1 = function(x) { return (Math.round(x * 1000) / 10).toFixed(1); };
    return { eq: r.eq, need: Math.round(c.toCall * 100 / (c.potTotal + c.toCall)), eqd: d1(eqF), needd: d1(needF), gap: d1(ad),
      verdict: verdict, win: r.win, tie: r.tie, lose: r.lose, n: r.n, potTotal: _bb(c.potTotal), toCall: _bb(c.toCall),
      band: MIX_BAND, clear: MIX_CLEAR };
  }
  // 독립 경로: 카드 객체 HandEval.evaluate로 콤보마다 쇼다운, 정수 곱셈으로 판정
  function mixVerify(c) {
    if (!_have('HandEval')) return { error: 'HandEval 없음' };
    if (typeof c.potTotal !== 'number' || typeof c.toCall !== 'number' || !(c.potTotal >= 0) || !(c.toCall > 0)) return { error: '가격' };
    var hero = _list(c.hero, 2, 2), board = _list(c.board, 5, 5);
    if (!hero || !board) return { error: 'hero 2장, board 5장' };
    var used = {};
    hero.concat(board).forEach(function(x) { used[x] = (used[x] || 0) + 1; });
    if (Object.keys(used).some(function(k) { return used[k] > 1; })) return { error: '카드 중복' };
    if (!Array.isArray(c.combos) || !c.combos.length) return { error: 'combos 목록' };
    var seen = {}, list = [];
    for (var i = 0; i < c.combos.length; i++) {
      var cb = _comboStrs(c.combos[i]);
      if (!cb || used[cb[0]] || used[cb[1]]) return { error: '콤보 카드' };
      var key = cb.slice().sort().join('');
      if (seen[key]) return { error: '콤보 중복' };
      seen[key] = 1;
      list.push(cb);
    }
    var bo = board.map(_obj), me = HandEval.evaluate(hero.map(_obj).concat(bo)), w = 0, t = 0, l = 0;
    list.forEach(function(cb) {
      var r = HandEval.compareHands(me, HandEval.evaluate(cb.map(_obj).concat(bo)));
      if (r < 0) w++; else if (r > 0) l++; else t++;
    });
    var n = list.length, P = _cents(c.potTotal), T = _cents(c.toCall);
    // eqF - needF = ((2w + t)(P + T) - 2nT) / (2n(P + T))
    var num = (2 * w + t) * (P + T) - 2 * n * T, den = 2 * n * (P + T), an = Math.abs(num);
    var verdict = 100 * an < MIX_BAND * den ? 'both' : (100 * an >= MIX_CLEAR * den ? (num > 0 ? 'call' : 'fold') : 'gray');
    // round(분자 ÷ 분모 x 1000)을 '정수.한 자리' 문자열로(정수 산술)
    var dec1 = function(nu, de) { var g = Math.floor((2000 * nu + de) / (2 * de)); return Math.floor(g / 10) + '.' + (g % 10); };
    return { eq: _ipct(2 * w + t, 2 * n), need: _ipct(T, P + T), eqd: dec1(2 * w + t, 2 * n), needd: dec1(T, P + T), gap: dec1(an, den),
      verdict: verdict, win: w, tie: t, lose: l, n: n, potTotal: P / 100, toCall: T / 100, band: MIX_BAND, clear: MIX_CLEAR };
  }

  // ═══════════ s5aGeo ═══════════
  function _geoErr(c) {
    if (!_fin(c.potBefore) || !_fin(c.stack) || !(c.potBefore > 0) || !(c.stack > 0)) return { error: 's5aGeo에는 potBefore(지금 팟)와 stack(유효 스택) 양수가 필요해요' };
    if (!(c.n === 1 || c.n === 2 || c.n === 3)) return { error: 's5aGeo n은 남은 벳 횟수 1~3이에요' };
    return null;
  }
  function geoCalc(c) {
    var bad = _geoErr(c);
    if (bad) return bad;
    var P = c.potBefore, S = c.stack, n = c.n;
    var b = (Math.pow(1 + 2 * S / P, 1 / n) - 1) / 2;   // GenMath.geoSize와 같은 식
    var out = { pct: Math.round(b * 100), potBefore: _bb(P), stack: _bb(S), n: n };
    for (var k = 1; k <= n; k++) {
      out['bet' + k] = _bb(b * P * Math.pow(1 + 2 * b, k - 1));
      out['pot' + k] = _bb(P * Math.pow(1 + 2 * b, k));
    }
    return out;
  }
  // 독립 경로: 벳 비율 x로 n번 벳과 콜을 쌓은 내 투자액이 스택이 되는 x를 이분 탐색
  function geoVerify(c) {
    if (typeof c.potBefore !== 'number' || typeof c.stack !== 'number' || !(c.potBefore > 0) || !(c.stack > 0)) return { error: 'potBefore, stack 양수' };
    if ([1, 2, 3].indexOf(c.n) < 0) return { error: 'n 1~3' };
    var P = c.potBefore, S = c.stack, n = c.n;
    var run = function(x) {
      var pot = P, inv = 0, bets = [], pots = [];
      for (var i = 0; i < n; i++) { var bet = x * pot; inv += bet; pot += 2 * bet; bets.push(bet); pots.push(pot); }
      return { inv: inv, bets: bets, pots: pots };
    };
    var lo = 0, hi = 1;
    while (run(hi).inv < S) hi *= 2;
    for (var it = 0; it < 200; it++) { var mid = (lo + hi) / 2; if (run(mid).inv < S) lo = mid; else hi = mid; }
    var x = (lo + hi) / 2, sim = run(x);
    if (Math.abs(sim.inv - S) > 1e-7 * S) return { error: '이분 탐색 수렴 실패' };
    if (typeof GenMath !== 'undefined' && GenMath && typeof GenMath.geoSize === 'function' && Math.abs(GenMath.geoSize(P, S, n) - x) > 1e-9) {
      return { error: 'GenMath.geoSize ' + GenMath.geoSize(P, S, n) + ' ≠ 시뮬레이션 ' + x };
    }
    var out = { pct: Math.floor(x * 100 + 0.5), potBefore: Math.round(P * 100) / 100, stack: Math.round(S * 100) / 100, n: n };
    for (var k = 0; k < n; k++) {
      out['bet' + (k + 1)] = Math.round(sim.bets[k] * 100) / 100;
      out['pot' + (k + 1)] = Math.round(sim.pots[k] * 100) / 100;
    }
    return out;
  }

  // ═══════════ 등록 ═══════════
  var DEFS = {
    s5aAdv: {
      calc: advCalc, verify: advVerify, main: 'nutAdv', chip: 'chart',
      qCards: function(c) { return Array.isArray(c.board) ? c.board.slice() : []; },
      cases: [
        // UTG 오픈(66+, ATs+, KTs+, QTs+, JTs, AJo+, KQo) 대 BB 콜(vsRfi.BB.call에서 3벳 칸을 뺀 것), 플랍 6♠5♥4♦:
        // UTG 셋 이상은 66 셋 3콤보뿐(139콤보 중 2%), BB는 66, 55, 44 셋 9콤보와 87s 스트레이트 4콤보(191 중 7%).
        { c: { a: 'rfi|UTG', b: 'call|BB@UTG', board: ['6s', '5h', '4d'] },
          want: { aN: 139, bN: 191, aNut: 2, bNut: 7, nutAdv: 'b', rangeAdv: 'a' } },
        // 같은 두 레인지, 플랍 K♠Q♥4♦: UTG가 탑페어 이상(39/117)도 셋 이상(KK, QQ 셋 6/117)도 앞선다(BB는 44 셋 3/182)
        { c: { a: 'rfi|UTG', b: 'call|BB@UTG', board: ['Ks', 'Qh', '4d'] }, want: { aN: 117, bN: 182, aTop: 33, bTop: 16, aNut: 5, bNut: 2, nutAdv: 'a', rangeAdv: 'a' } },
        // 같은 스팟을 a, b에 넣으면 'even'
        { c: { a: 'rfi|BTN', b: 'rfi|BTN', board: ['Ks', '7h', '2d'] }, want: { nutAdv: 'even', rangeAdv: 'even' } }
      ]
    },
    s5aShape: {
      calc: shapeCalc, verify: shapeVerify, main: 'shape', chip: 'appdef',
      cases: [
        // QQ+ 18, AK 16 = 위 34. A5s-A3s 12, 76s, 65s, 54s 12 = 아래 24. 가운데 0 → 폴라(위 59%, 아래 41%)
        { c: { range: 'QQ+, AKs, AKo, A5s-A3s, 76s, 65s, 54s' }, want: { top: 34, mid: 0, bot: 24, shape: 'polar', clear: true } },
        // 위 34, 가운데 JJ, TT 12 + AQs, AJs, KQs 12 + AQo 12 = 36 → 머지드
        { c: { range: 'QQ+, AKs, AKo, JJ, TT, AQs, AJs, KQs, AQo' }, want: { top: 34, mid: 36, bot: 0, shape: 'merged', clear: true } },
        // 위 0, 가운데 66 6 + JTs 4, 아래 22 6 → 가운데 63%라 컨덴스드지만 경계(0.6)에 가까워 clear false
        { c: { range: '66, JTs, 22' }, want: { top: 0, mid: 10, bot: 6, shape: 'condensed', clear: false } },
        // 위 AA 6, 가운데 JJ 6, 아래 22 6 → 어느 규칙에도 맞지 않음
        { c: { range: 'AA, JJ, 22' }, want: { top: 6, mid: 6, bot: 6, shape: 'none', clear: false } },
        // 이 앱 차트에서 BB가 BTN 오픈에 콜하는 손은 위가 없고(QQ+, AK는 3벳) 아래가 대부분 → 캡드
        { c: { spot: 'call|BB@BTN' }, want: { top: 0, shape: 'capped', clear: true } }
      ]
    },
    s5aToy: {
      calc: toyCalc, verify: toyVerify, main: 'bluff',
      qNums: function(c) { return [c.potBefore, c.bet]; },
      cases: [
        // 팟만큼 벳: 벳 중 블러프 1/3, K는 반만 콜, Q는 반만 블러프(A 1 + Q 0.5 = 블러프 0.5/1.5)
        { c: { potBefore: 10, bet: 10 }, want: { bluff: 33, value: 67, call: 50, fold: 50, qBluff: 50, qCheck: 50, potTotal: 20, toCall: 10 } },
        // 팟 절반: 6/24 = 25%, 콜 12/18 = 67%, Q 블러프 6/18 = 33%
        { c: { potBefore: 12, bet: 6 }, want: { bluff: 25, call: 67, qBluff: 33 } },
        // 2배 오버벳: 20/50 = 40%, 콜 10/30 = 33%, Q 블러프 20/30 = 67%
        { c: { potBefore: 10, bet: 20 }, want: { bluff: 40, value: 60, call: 33, qBluff: 67 } }
      ]
    },
    s5aMix: {
      calc: mixCalc, verify: mixVerify, main: 'verdict',
      qNums: function(c) { return [c.potTotal, c.toCall]; },
      qCards: function(c) {
        var out = [];
        var add = function(x) { var s = _cardStr(x); if (s && out.indexOf(s) < 0) out.push(s); };
        (Array.isArray(c.hero) ? c.hero : []).forEach(add);
        (Array.isArray(c.board) ? c.board : []).forEach(add);
        (Array.isArray(c.combos) ? c.combos : []).forEach(function(cb) { (_comboStrs(cb) || []).forEach(add); });
        return out;
      },
      cases: [
        // 리버 Q♠8♦5♣3♥2♦, 내 8♠7♠(8 원페어). 상대 Q♣J♣, Q♦10♦(탑페어) + 7♥6♥(놓친 스트레이트 드로우).
        // 팟 35(벳 15 포함), 콜 15: 필요 30%, 승률 1/3 = 33.3%, 차이 3.3%p < 4 → 둘 다 OK
        { c: { hero: ['8s', '7s'], board: ['Qs', '8d', '5c', '3h', '2d'], combos: [['Qc', 'Jc'], ['Qd', 'Td'], ['7h', '6h']], potTotal: 35, toCall: 15 },
          want: { eq: 33, need: 30, eqd: '33.3', needd: '30.0', gap: '3.3', verdict: 'both', win: 1, lose: 2, n: 3 } },
        // 밸류 3(Q♣J♣, Q♦10♦, A♣8♣) + 블러프 1(J♥10♥) = 승률 25%. 팟 25(벳 10 포함): 필요 28.6%, 3.6%p → 둘 다 OK
        // (정수로는 25 대 29라 4%p처럼 보인다. 그래서 해설은 eqd, needd를 쓴다)
        { c: { hero: ['8s', '7s'], board: ['Qs', '8d', '5c', '3h', '2d'], combos: ['QcJc', 'QdTd', 'Ac8c', 'JhTh'], potTotal: 25, toCall: 10 },
          want: { eq: 25, need: 29, eqd: '25.0', needd: '28.6', gap: '3.6', verdict: 'both' } },
        // 같은 레인지, 팟만큼 벳(팟 20, 콜 10): 필요 33.3%, 8.3%p 모자라 폴드
        { c: { hero: ['8s', '7s'], board: ['Qs', '8d', '5c', '3h', '2d'], combos: ['QcJc', 'QdTd', 'Ac8c', 'JhTh'], potTotal: 20, toCall: 10 },
          want: { eq: 25, need: 33, eqd: '25.0', needd: '33.3', gap: '8.3', verdict: 'fold' } },
        // 밸류 1 + 블러프 2 = 66.7%, 필요 30% → 콜
        { c: { hero: ['8s', '7s'], board: ['Qs', '8d', '5c', '3h', '2d'], combos: ['QcJc', '7h6h', 'JhTh'], potTotal: 35, toCall: 15 },
          want: { eq: 67, need: 30, gap: '36.7', verdict: 'call' } },
        // 밸류 3 + 블러프 2 = 40%, 필요 33.3% → 6.7%p는 출제하지 않는 회색 구간
        { c: { hero: ['8s', '7s'], board: ['Qs', '8d', '5c', '3h', '2d'], combos: ['QcJc', 'QdTd', 'Ac8c', '7h6h', 'JhTh'], potTotal: 20, toCall: 10 },
          want: { eq: 40, gap: '6.7', verdict: 'gray' } }
      ]
    },
    s5aGeo: {
      calc: geoCalc, verify: geoVerify, main: 'pct',
      qNums: function(c) { return [c.potBefore, c.stack, c.n]; },
      cases: [
        // 턴 팟 20, 스택 40, 2번: (1 + 4)의 제곱근 = 2.236 → (2.236 - 1) ÷ 2 = 0.618 → 62%. 턴 12.36, 리버 27.64(합 40)
        { c: { potBefore: 20, stack: 40, n: 2 }, want: { pct: 62, bet1: 12.36, bet2: 27.64, pot1: 44.72, pot2: 100 } },
        // 3벳 팟 20, 스택 90, 3번: 10의 세제곱근 2.154 → 0.577 → 58%
        { c: { potBefore: 20, stack: 90, n: 3 }, want: { pct: 58, pot3: 200 } },
        // BTN 오픈에 BB 콜(팟 5.5, 스택 97.5), 3번: 36.45의 세제곱근 3.317 → 1.159 → 116%(오버벳)
        { c: { potBefore: 5.5, stack: 97.5, n: 3 }, want: { pct: 116, pot3: 200.5 } },
        // 1번이면 남은 스택 전부 = 팟의 stack ÷ potBefore
        { c: { potBefore: 10, stack: 15, n: 1 }, want: { pct: 150, bet1: 15, pot1: 40 } }
      ]
    }
  };

  if (typeof LessonCore !== 'undefined' && LessonCore && typeof LessonCore.defineCalc === 'function') {
    Object.keys(DEFS).forEach(function(t) {
      if (typeof LessonCore.calcDef === 'function' && LessonCore.calcDef(t)) return;   // 다시 로드돼도 조용히 넘긴다
      if (!LessonCore.defineCalc(t, DEFS[t]) && typeof console !== 'undefined' && console.warn) console.warn('[stage5a] calc 등록 실패: ' + t);
    });
  }
})();
