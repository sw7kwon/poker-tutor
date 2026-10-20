// lessons/calc/stage5b.js (채우는 그룹: M6-L56, s5-07~09)
// 레슨 calc 등록부(계약 L9, lessons/lesson-core.js 머리 주석)에 LessonCore.defineCalc로 등록할 유형(계약 H13, docs/JOURNEY_ROADMAP.md M6).
// 새 유형 이름은 그룹 접두 's56'로 시작한다(예 's56Hud'). M5 등록 유형(stage3a~4b)은 읽기 전용으로 써도 된다.
// 입력에 pot 필드 금지(potBefore = 벳 전 팟, potTotal = 상대 벳 포함 팟), 퍼센트 변수는 정수 반올림.
// verify는 calc 코드를 부르지 않는 독립 경로, cases는 손으로 확인한 값 2개 이상. 유형별 입력, 변수, main은 이 머리 주석에 적는다.
//
// 이 파일이 등록하는 유형 2개(둘 다 칩 'chart' = 이 앱 차트 기준, 설계서 8.2절 2번):
//
// s56Range {spot} | {spots:[1~4개]} (main 'pct')
//   이 앱 프리플랍 차트(Gto.GTO_RANGES) 레인지 하나가 전체 1326콤보 중 몇 콤보, 몇 %인지(s5-07 '좁은 레인지').
//   spot 표기(lessons/calc/stage4a.js와 같은 뜻, 이 파일 안에서 따로 구현):
//     'rfi|POS'(앞 전원 폴드에 오픈), '3bet|POS@OPENER'(오픈에 3벳), 'call|POS@OPENER'(오픈에 콜),
//     '4bet|POS'(오픈 뒤 3벳을 맞고 4벳), 'call3|POS'(오픈 뒤 3벳을 맞고 콜), 'cont3|POS'(3벳을 맞고 계속 = 콜과 4벳).
//     오프너는 내 앞자리. BB가 CO, BTN, SB 오픈을 맞으면 넓은 방어표(vsRfiBB_LP, GtoChart.buildChartModel 규칙).
//     콜 칸은 레이즈(3벳, 4벳) 칸을 뺀 나머지(차트 모델은 레이즈 칸이 먼저).
//   → n(콤보 수), pct(= round(n x 100 / 1326)), spots가 있으면 n1..nK, pct1..pctK(차례대로, n = n1, pct = pct1).
//   calc: GtoChart.buildChartModel 칸을 무늬 조합 수(페어 6, 수딧 4, 오프수트 12)로 더한다.
//   verify: Gto.GTO_RANGES 원본 배열을 Range.parse로 읽은 칸 집합에 대해 52장 두 장 쌍 1326개를 전부 돌며
//     Range.handClass가 집합 안인 쌍을 센다(정수 반올림 floor((200n + 1326) / 2652)).
//
// s56Paint {spot, miss?:[칸], extra?:[칸], goal?(0~1, 기본 0.7)} (main 'overlap')
//   레인지 색칠 겹침(s5-09). spot은 rangepaint 표기('rfi|POS', 'vsRfi|POS@OPENER', 'vs3bet|POS', puzzles/gen-range.js PAINT_SPOTS),
//   정답 칸 = 차트에서 폴드가 아닌 칸(레이즈와 콜, rangepaint 정답과 같다). miss = 정답 칸 중 빠뜨린 칸, extra = 정답 밖에 더 칠한 칸.
//   겹침(Jaccard) = 같이 칠한 칸 ÷ 둘 중 하나라도 칠한 칸 = (target - missN) ÷ (target + extraN)
//   (Puzzles.get('rangepaint').score와 같은 정의, 칸 단위이고 콤보 가중이 아니다).
//   → target(정답 칸 수), combos(정답 콤보 수), missN, extraN, hit(= target - missN), union(= target + extraN),
//     overlap(= round(hit x 100 / union)), goal(= round(goal x 100), 통과 기준 %), pass('yes' | 'no', hit ÷ union ≥ goal, 반올림 전 값).
//   칸 이름은 'AKs', 'T9o', '77' 형식. miss가 정답 밖이거나 extra가 정답 안이거나 같은 칸이 두 번이면 오류.
//   calc: 차트 모델 칸. verify: GTO_RANGES 원본 배열 Range.parse(정수 산술로 겹침 반올림).
//   qNums = [missN, extraN](질문에 빠뜨린 칸 수와 더 칠한 칸 수를 적는다).
//
// 로드 때 LessonCore가 없으면 아무것도 하지 않는다. DOM, window, localStorage에 손대지 않는다.
// Gto, GtoChart, Range는 호출 때 typeof 가드.
(function() {
  var LC = (typeof LessonCore !== 'undefined' && LessonCore) ? LessonCore : null;
  if (!LC || typeof LC.defineCalc !== 'function') return;

  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var LATE = { CO: true, BTN: true, SB: true };
  var RANKS = 'AKQJT98765432';   // 격자 순서(높은 랭크 먼저)
  var SUITS = 'shdc';
  var TOTAL = 1326;

  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _fin(x) { return typeof x === 'number' && isFinite(x); }
  function _has(name) {
    var G = (typeof globalThis !== 'undefined') ? globalThis : this;
    var o = G && G[name];
    return !!o && (typeof o === 'object' || typeof o === 'function');
  }
  function _need(list) {
    for (var i = 0; i < list.length; i++) if (!_has(list[i])) return { error: list[i] + '가 없어요' };
    return null;
  }
  // 칸 이름 하나의 콤보 수(페어 6, 수딧 4, 오프수트 12)
  function _w(label) { return label.length === 2 ? 6 : (label.charAt(2) === 's' ? 4 : 12); }
  // 칸 이름 검사: 'AA', 'AKs', 'AKo'(높은 랭크 먼저) | null
  function _label(x) {
    var s = String(x == null ? '' : x).trim();
    if (s.length === 2) return (RANKS.indexOf(s.charAt(0)) >= 0 && s.charAt(0) === s.charAt(1)) ? s : null;
    if (s.length !== 3) return null;
    var a = RANKS.indexOf(s.charAt(0)), b = RANKS.indexOf(s.charAt(1)), k = s.charAt(2);
    return (a >= 0 && b >= 0 && a < b && (k === 's' || k === 'o')) ? s : null;
  }

  // ── s56Range 스팟 표기 ────────────────────────────────
  var KINDS = {
    rfi: { facing: false, acts: ['raise'], opener: false },
    '3bet': { facing: true, acts: ['raise'], opener: true },
    call: { facing: true, acts: ['call'], opener: true },
    '4bet': { facing: 'vs3bet', acts: ['raise'], opener: false },
    call3: { facing: 'vs3bet', acts: ['call'], opener: false },
    cont3: { facing: 'vs3bet', acts: ['raise', 'call'], opener: false }
  };
  function _rangeSpot(spot) {
    var m = /^([a-z0-9]+)\|([A-Z]+)(?:@([A-Z]+))?$/.exec(String(spot == null ? '' : spot).trim());
    var k = (m && Object.prototype.hasOwnProperty.call(KINDS, m[1])) ? KINDS[m[1]] : null;
    if (!k) return { error: 's56Range spot 표기를 알 수 없어요: ' + spot };
    var pos = m[2], op = m[3] || null;
    if (POS6.indexOf(pos) < 0) return { error: 's56Range spot 자리를 알 수 없어요: ' + pos };
    if (k.opener) {
      if (!op || POS6.indexOf(op) < 0 || POS6.indexOf(op) >= POS6.indexOf(pos)) return { error: 's56Range spot 오프너가 맞지 않아요(@오프너, 내 앞자리): ' + spot };
    } else if (op) return { error: 's56Range spot에 오프너를 쓰지 않는 표기예요: ' + spot };
    if (k.facing === 'vs3bet' && pos === 'BB') return { error: 'BB는 오픈하지 않아서 3벳을 맞는 표가 없어요: ' + spot };
    return { kind: m[1], pos: pos, opener: op, facing: k.facing, acts: k.acts };
  }
  function _rangeList(c) {
    var hasOne = c.spot != null, hasMany = c.spots != null;
    if (hasOne === hasMany) return { error: 's56Range는 spot 또는 spots 하나만 써요' };
    var list = hasOne ? [c.spot] : c.spots;
    if (!Array.isArray(list) || list.length < 1 || list.length > 4) return { error: 's56Range spots는 1~4개예요' };
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var sp = _rangeSpot(list[i]);
      if (sp.error) return sp;
      out.push(sp);
    }
    return { list: out, many: hasMany };
  }

  // calc 경로: 차트 모델 칸의 무늬 조합 수 합
  function rangeCalc(c) {
    var rl = _rangeList(c);
    if (rl.error) return rl;
    var e = _need(['GtoChart']);
    if (e) return e;
    var res = {};
    for (var i = 0; i < rl.list.length; i++) {
      var sp = rl.list[i], model = GtoChart.buildChartModel(sp.pos, sp.facing, sp.opener || undefined), n = 0;
      for (var r = 0; r < 13; r++) for (var q = 0; q < 13; q++) {
        var cell = model.cells[r][q];
        if (sp.acts.indexOf(cell.action) >= 0) n += _w(cell.label);
      }
      if (!n) return { error: '이 스팟의 차트 레인지가 비었어요: ' + (rl.many ? c.spots[i] : c.spot) };
      var pct = Math.round(n * 100 / TOTAL);
      if (rl.many) { res['n' + (i + 1)] = n; res['pct' + (i + 1)] = pct; }
      if (i === 0) { res.n = n; res.pct = pct; }
    }
    return res;
  }

  // verify 경로: 원본 배열 Range.parse 칸 집합 → 1326 쌍 전수(Range.handClass)
  function _rawRangeSet(sp) {
    var G = Gto.GTO_RANGES, set = new Set(), raise = null, call = null;
    function add(arr) { if (Array.isArray(arr) && arr.length) Range.parse(arr.join(',')).forEach(function(h) { set.add(h); }); }
    function minus(arr) { if (Array.isArray(arr) && arr.length) Range.parse(arr.join(',')).forEach(function(h) { set.delete(h); }); }
    if (sp.facing === false) { add(G.rfi[sp.pos]); return set; }
    if (sp.facing === 'vs3bet') {
      var v3 = G.vs3bet[sp.pos];
      if (!v3) return set;
      raise = v3.fourbet; call = v3.call;
    } else {
      var vs = (sp.pos === 'BB' && LATE[sp.opener] && G.vsRfiBB_LP) ? G.vsRfiBB_LP : G.vsRfi[sp.pos];
      if (!vs) return set;
      raise = vs.threebet; call = vs.call;
    }
    var wantR = sp.acts.indexOf('raise') >= 0, wantC = sp.acts.indexOf('call') >= 0;
    if (wantR && wantC) { add(raise); add(call); return set; }
    if (wantR) { add(raise); return set; }
    add(call); minus(raise);
    return set;
  }
  var _PAIRS = null;
  function _pairClasses() {
    if (_PAIRS) return _PAIRS;
    var deck = [], out = [];
    for (var r = 0; r < 13; r++) for (var s = 0; s < 4; s++) deck.push({ rank: RANKS.charAt(r), suit: SUITS.charAt(s) });
    for (var i = 0; i < 52; i++) for (var j = i + 1; j < 52; j++) out.push(Range.handClass(deck[i], deck[j]));
    _PAIRS = out;
    return out;
  }
  function _ipct(n, d) { return Math.floor((200 * n + d) / (2 * d)); }
  function rangeVerify(c) {
    var rl = _rangeList(c);
    if (rl.error) return rl;
    var e = _need(['Gto', 'Range']);
    if (e) return e;
    var pairs = _pairClasses(), res = {};
    for (var i = 0; i < rl.list.length; i++) {
      var set = _rawRangeSet(rl.list[i]), n = 0;
      for (var k = 0; k < pairs.length; k++) if (set.has(pairs[k])) n++;
      if (!n) return { error: '이 스팟의 차트 레인지가 비었어요' };
      var pct = _ipct(n, pairs.length);
      if (rl.many) { res['n' + (i + 1)] = n; res['pct' + (i + 1)] = pct; }
      if (i === 0) { res.n = n; res.pct = pct; }
    }
    return res;
  }

  // ── s56Paint 스팟 표기(rangepaint) ─────────────────────
  function _paintSpot(spot) {
    var p = String(spot == null ? '' : spot).trim().split('|'), kind = p[0], at = String(p[1] || '').split('@');
    var facing = kind === 'rfi' ? false : (kind === 'vsRfi' ? true : (kind === 'vs3bet' ? 'vs3bet' : null));
    if (facing === null || p.length !== 2 || POS6.indexOf(at[0]) < 0) return { error: 's56Paint spot 표기를 알 수 없어요: ' + spot };
    var op = at[1] || null;
    if (kind === 'vsRfi') {
      if (!op || POS6.indexOf(op) < 0 || POS6.indexOf(op) >= POS6.indexOf(at[0])) return { error: 's56Paint spot 오프너가 맞지 않아요: ' + spot };
    } else if (op) return { error: 's56Paint spot에 오프너를 쓰지 않는 표기예요: ' + spot };
    return { kind: kind, pos: at[0], opener: op, facing: facing };
  }
  // 입력 칸 목록 → [칸] | {error}(형식, 중복)
  function _labels(list, name) {
    if (list == null) return [];
    if (!Array.isArray(list)) return { error: name + '는 칸 이름 배열이에요' };
    var seen = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      var l = _label(list[i]);
      if (!l) return { error: name + ' 칸 이름을 읽을 수 없어요: ' + list[i] };
      if (seen[l]) return { error: name + '에 같은 칸이 두 번 나와요: ' + l };
      seen[l] = true;
      out.push(l);
    }
    return out;
  }
  function _paintIn(c) {
    var sp = _paintSpot(c.spot);
    if (sp.error) return sp;
    var miss = _labels(c.miss, 'miss'), extra = _labels(c.extra, 'extra');
    if (miss.error) return miss;
    if (extra.error) return extra;
    var goal = c.goal == null ? 0.7 : c.goal;
    if (!_fin(goal) || goal <= 0 || goal > 1) return { error: 's56Paint goal은 0보다 크고 1 이하예요(0.7 = 70%)' };
    return { sp: sp, miss: miss, extra: extra, goal: goal };
  }
  function _paintVars(T, combos, missN, extraN, goal, overlap, pass) {
    return { target: T, combos: combos, missN: missN, extraN: extraN, hit: T - missN, union: T + extraN,
      overlap: overlap, goal: goal, pass: pass ? 'yes' : 'no' };
  }

  // calc 경로: 차트 모델에서 폴드가 아닌 칸(레이즈, 콜)
  function paintCalc(c) {
    var p = _paintIn(c);
    if (p.error) return p;
    var e = _need(['GtoChart']);
    if (e) return e;
    var model = GtoChart.buildChartModel(p.sp.pos, p.sp.facing, p.sp.opener || undefined), tgt = {}, T = 0, combos = 0;
    for (var r = 0; r < 13; r++) for (var q = 0; q < 13; q++) {
      var cell = model.cells[r][q];
      if (cell.action === 'raise' || cell.action === 'call') { tgt[cell.label] = true; T++; combos += _w(cell.label); }
    }
    if (!T) return { error: '이 스팟의 차트 레인지가 비었어요: ' + c.spot };
    for (var i = 0; i < p.miss.length; i++) if (!tgt[p.miss[i]]) return { error: 'miss 칸 ' + p.miss[i] + ': 정답 칸이 아니에요' };
    for (var j = 0; j < p.extra.length; j++) if (tgt[p.extra[j]]) return { error: 'extra 칸 ' + p.extra[j] + ': 이미 정답 칸이에요' };
    var hit = T - p.miss.length, union = T + p.extra.length, ratio = hit / union;
    return _paintVars(T, combos, p.miss.length, p.extra.length, Math.round(p.goal * 100), Math.round(ratio * 100), ratio >= p.goal - 1e-9);
  }

  // verify 경로: GTO_RANGES 원본 배열(Range.parse), 정수 산술
  function paintVerify(c) {
    var p = _paintIn(c);
    if (p.error) return p;
    var e = _need(['Gto', 'Range']);
    if (e) return e;
    var G = Gto.GTO_RANGES, set = new Set(), sp = p.sp;
    function add(arr) { if (Array.isArray(arr) && arr.length) Range.parse(arr.join(',')).forEach(function(h) { set.add(h); }); }
    if (sp.kind === 'rfi') add(G.rfi[sp.pos]);
    else if (sp.kind === 'vsRfi') {
      var vs = (sp.pos === 'BB' && LATE[sp.opener] && G.vsRfiBB_LP) ? G.vsRfiBB_LP : G.vsRfi[sp.pos];
      if (vs) { add(vs.threebet); add(vs.call); }
    } else {
      var v3 = G.vs3bet[sp.pos];
      if (v3) { add(v3.fourbet); add(v3.call); }
    }
    if (!set.size) return { error: '이 스팟의 차트 레인지가 비었어요' };
    var combos = 0;
    set.forEach(function(l) { combos += _w(l); });
    if (p.miss.some(function(l) { return !set.has(l); })) return { error: 'miss에 정답 밖 칸이 있어요' };
    if (p.extra.some(function(l) { return set.has(l); })) return { error: 'extra에 정답 칸이 있어요' };
    var T = set.size, hit = T - p.miss.length, union = T + p.extra.length;
    // goal을 천분율 정수로(0.7 → 700). 기준 % = round(천분율 ÷ 10), 통과: hit ÷ union ≥ goal ↔ hit x 1000 ≥ 천분율 x union
    var g1000 = Math.round(p.goal * 1000);
    return _paintVars(T, combos, p.miss.length, p.extra.length, Math.floor((2 * g1000 + 10) / 20), _ipct(hit, union), hit * 1000 >= g1000 * union);
  }

  var ok = [];
  ok.push(LC.defineCalc('s56Range', {
    calc: rangeCalc, verify: rangeVerify, main: 'pct', chip: 'chart',
    // 손으로 센 값(Gto.GTO_RANGES):
    //   rfi|CO = 22+(13 x 6 = 78) + 수딧 27칸 x 4 = 108 + 오프수트 10칸 x 12 = 120 → 306콤보, 306 ÷ 1326 = 23.1% → 23
    //   3bet|BTN@CO = 88+ 42 + ATs+ 16 + A5s-A4s 8 + KQs, KJs 8 + AJo+ 36 + KQo 12 = 122 → 9.2% → 9
    //   cont3|CO = 4벳 TT+ 30 + AQs+ 8 + AKo 12, 콜 99, 88 12 + AJs, ATs 8 + KQs, KJs, QJs 12 = 82 → 6.2% → 6
    //   3bet|BB@BTN(넓은 방어표) = TT+ 30 + A9s+ 20 + A5s-A3s 12 + KTs+ 12 + QJs 4 + AJo+ 36 + KQo 12 + 76s 4 + 65s 4 = 134 → 10.1% → 10
    //   call3|CO = 82 - 50(4벳) = 32 → 2.4% → 2
    cases: [
      { c: { spot: 'rfi|CO' }, want: { n: 306, pct: 23 } },
      { c: { spot: '3bet|BTN@CO' }, want: { n: 122, pct: 9 } },
      { c: { spots: ['rfi|CO', 'cont3|CO', 'call3|CO'] }, want: { n: 306, pct: 23, n1: 306, pct1: 23, n2: 82, pct2: 6, n3: 32, pct3: 2 } },
      { c: { spots: ['3bet|BB@BTN'] }, want: { n1: 134, pct1: 10, pct: 10 } }
    ]
  }));
  ok.push(LC.defineCalc('s56Paint', {
    calc: paintCalc, verify: paintVerify, main: 'overlap', chip: 'chart',
    // 손으로 센 값: CO 오픈 정답 50칸(22+ 13, A2s+ 12, K9s+ 4, Q9s+ 3, J9s+ 2, T8s+ 2, 97s+ 2, 87s, 76s, ATo+ 4, KTo+ 3, QTo+ 2, JTo).
    //   그대로 칠하면 50 ÷ 50 = 100%. 5칸 빠뜨리고 5칸 더 칠하면 45 ÷ 55 = 81.8% → 82(통과).
    //   10칸 빠뜨리고 10칸 더 칠하면 40 ÷ 60 = 66.7% → 67(기준 70 미달).
    cases: [
      { c: { spot: 'rfi|CO' }, want: { target: 50, combos: 306, overlap: 100, goal: 70, pass: 'yes', hit: 50, union: 50 } },
      { c: { spot: 'rfi|CO', miss: ['K9s', 'Q9s', 'J9s', 'T8s', '97s'], extra: ['K8s', 'Q8s', 'J8s', 'T7s', '96s'] },
        want: { overlap: 82, hit: 45, union: 55, missN: 5, extraN: 5, pass: 'yes' } },
      { c: { spot: 'rfi|CO', goal: 0.7, miss: ['K9s', 'Q9s', 'J9s', 'T8s', '97s', '87s', '76s', 'KTo', 'QTo', 'JTo'],
        extra: ['K8s', 'Q8s', 'J8s', 'T7s', '96s', '86s', '65s', 'K9o', 'Q9o', 'J9o'] },
        want: { overlap: 67, hit: 40, union: 60, pass: 'no', goal: 70 } }
    ],
    qNums: function(c) {
      return [Array.isArray(c.miss) ? c.miss.length : 0, Array.isArray(c.extra) ? c.extra.length : 0].filter(function(x) { return x > 0; });
    }
  }));
  if (ok.indexOf(false) >= 0 && typeof console !== 'undefined' && console.warn) {
    console.warn('[lessons/calc/stage5b] 등록 실패: ' + ['s56Range', 's56Paint'].filter(function(t, i) { return !ok[i]; }).join(', '));
  }
})();
