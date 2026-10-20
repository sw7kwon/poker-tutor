// lessons/calc/stage4a.js (채우는 그룹: M5-S4A)
// 레슨 calc 등록부(계약 L9, lessons/lesson-core.js 머리 주석)에 LessonCore.defineCalc로 등록할 유형: combos, rangehit, mdf, suspects.
// 유형 소유는 docs/JOURNEY_ROADMAP.md M5 계약 F7. 입력에 pot 필드 금지(potBefore = 벳 전 팟), 퍼센트 변수는 정수 반올림.
//
// 공통 입력
//   카드 'Ah', 'Td'('10d'도 받는다). 같은 카드가 두 번 나오면 오류.
//   range = Range.parse 표기 문자열('JJ+, AKs, KQo', 쉼표 조각마다 손이 하나 이상 나와야 한다, 오타는 오류).
//   spot  = 이 앱 차트 레인지 이름(gen-range SPOTS와 같은 표기). 'rfi|POS'(오픈), 'call|POS@OPENER'(오픈에 콜),
//           '3bet|POS@OPENER'(오픈에 3벳), 'call3|POS'(오픈 뒤 3벳을 맞고 콜), '4bet|POS'(오픈 뒤 3벳을 맞고 4벳).
//           BB가 CO, BTN, SB 오픈을 맞으면 넓은 방어표(vsRfiBB_LP)를 쓴다(GtoChart.buildChartModel 규칙). 콜 칸은 레이즈 칸을 뺀 나머지.
//   range와 spot은 둘 중 하나만.
//
// combos {range, dead?[카드]} → n(데드카드를 뺀 콤보 수), full(데드카드 없이), removed(= full - n). main 'n'.
//   calc: Range.parse 칸마다 무늬별 남은 카드로 센 공식(페어 k(k-1)/2, 수딧 두 랭크가 같은 무늬로 남은 수, 오프 a x b - 수딧).
//   verify: 52장 1326조합 전수 열거(Range.handClass가 레인지 안이고 데드카드를 안 쓰는 조합).
//   qCards = dead(질문에 데드카드를 다 적는다).
// rangehit {range | spot, board[3~5], dead?[카드], hero?[2]} → 상대 레인지 콤보를 보드(와 dead, hero 카드)를 빼고 펴서
//   Villain._handStrength 범주(gen-range CATS와 같다)로 센 분포.
//   total, nStrong(넛 + 강함 = 셋, 스트레이트, 플러시 이상), nMid(중간 = 오버페어, 탑페어, 트립스, 두 장 다 쓰는 투페어),
//   nWeak(약한 페어), nAir(에어, 드로우 포함), nTop(= nStrong + nMid, 탑페어 이상), 각 pct* = 정수 반올림(n x 100 / total).
//   hero가 있으면 heroCat = 내 손 범주 'strong'(넛, 강함) | 'medium' | 'weak' | 'air'(막대 4줄과 같은 묶음). main 'pctTop'.
//   calc: 칸을 실제 카드로 펴서 센다(spot은 차트 모델 칸). verify: 1326 전수 열거(spot은 GTO_RANGES 원본 배열 Range.parse).
//   qCards = board + dead + hero. chip 'chart'(이 앱 차트 기준, 설계서 8.2절 2번): 레슨은 spot(이 앱 차트 레인지)만 쓰고
//   막대 퍼센트가 차트 폭에 따라 바뀐다. range 문자열로 그리는 장면이 필요하면 칩이 맞지 않으니 새 유형으로 등록한다.
// mdf {potBefore(벳 전 팟), bet, bets?[금액 1~4개]} → pct = round(potBefore x 100 / (potBefore + bet))(MDF, 설계서 8.3절 2(b)),
//   potBefore, bet, potTotal(= potBefore + bet, 벳 포함 팟), size = round(bet x 100 / potBefore)(벳이 팟의 몇 %),
//   bets가 있으면 pct1..pctN(같은 팟에 그 벳일 때 MDF, 사이즈 비교 막대용). main 'pct'.
//   calc: 소수 나눗셈 뒤 Math.round. verify: 1/100bb 정수로 바꿔 정수 반올림(floor((2 x 100p + (p + b)) / (2(p + b)))).
//   qNums = [potBefore, bet].
// suspects {range | spot, hero[2], board[3~5], steps?:['flop'|'turn'|'river' 순서대로, 겹치지 않게]} → 용의자 지우기 규칙 v1
//   (로드맵 계약 F10, 문제와 레슨에 '이 앱의 지우기 규칙'으로 적는다).
//   시작 = 레인지를 콤보로 펴고 보드와 내 손 카드를 뺀다(n0). 단계마다 상대가 계속(벳, 레이즈, 콜)했다고 보고 지운다.
//     flop:  플랍 3장 기준 'air'이고 PostflopGuide.hasDraw가 거짓인 콤보.
//     turn:  보드 4장 기준 'weak-pair' 이하('weak-pair', 'air')이고 드로우 없는 콤보(보드 4장 이상 필요).
//     river: 보드 5장 기준 'medium' 미만('weak-pair', 'air')(보드 5장 필요).
//   변수 n0, nK = K번째 단계 뒤 남은 수(K = 1..steps 길이, 단계 순서 기준), n = 마지막 단계 뒤(단계가 없으면 n0),
//   p0 = 100, pK = round(nK x 100 / n0)(남은 비율 막대용). main 'n'.
//   calc: 칸을 카드로 펴고 단계마다 걸러 낸다. verify: 1326 전수 열거로 콤보마다 처음 지워지는 단계를 구해 센다.
//   qCards = hero + board. chip 'appdef'(이 앱의 지우기 규칙).
// 로드 시 DOM, window, localStorage에 손대지 않는다. Range, HandEval, Villain, PostflopGuide, Gto, GtoChart, LessonCore는
// 호출 시점에 typeof 가드.
(function() {
  var RANKS = '23456789TJQKA';
  var SUITS = 'shdc';
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var LATE = { CO: true, BTN: true, SB: true };
  var STREETS = ['flop', 'turn', 'river'];
  var GROUP = { nut: 'strong', strong: 'strong', medium: 'medium', 'weak-pair': 'weak', air: 'air' };

  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _fin(x) { return x !== null && x !== '' && x !== undefined && typeof x !== 'boolean' && isFinite(Number(x)); }
  function _bb(x) { var v = Math.round(Number(x) * 100) / 100; return v === 0 ? 0 : v; }
  function _ok(name) {
    switch (name) {
      case 'Range': return typeof Range !== 'undefined' && !!Range && typeof Range.parse === 'function' && typeof Range.handClass === 'function';
      case 'HandEval': return typeof HandEval !== 'undefined' && !!HandEval && typeof HandEval.evaluate === 'function';
      case 'Villain': return typeof Villain !== 'undefined' && !!Villain && typeof Villain._handStrength === 'function';
      case 'Guide': return typeof PostflopGuide !== 'undefined' && !!PostflopGuide && typeof PostflopGuide.hasDraw === 'function';
      case 'Gto': return typeof Gto !== 'undefined' && !!Gto && !!Gto.GTO_RANGES;
      case 'GtoChart': return typeof GtoChart !== 'undefined' && !!GtoChart && typeof GtoChart.buildChartModel === 'function';
    }
    return false;
  }
  function _need(list) {
    for (var i = 0; i < list.length; i++) if (!_ok(list[i])) return { error: (list[i] === 'Guide' ? 'PostflopGuide' : list[i]) + '가 없어요' };
    return null;
  }

  // ── 카드 ──────────────────────────────────────────────
  function _card(x) {
    var s = String(x == null ? '' : x).trim();
    if (s.length === 3 && s.slice(0, 2) === '10') s = 'T' + s.charAt(2);
    if (s.length !== 2) return null;
    var r = s.charAt(0).toUpperCase(), u = s.charAt(1).toLowerCase();
    return (RANKS.indexOf(r) >= 0 && SUITS.indexOf(u) >= 0) ? r + u : null;
  }
  // groups = [{name, list, min, max, opt}] → {lists:[[카드 문자열]], dead:{카드:true}} | {error}
  function _cardGroups(groups) {
    var seen = {}, lists = [];
    for (var g = 0; g < groups.length; g++) {
      var gr = groups[g], list = gr.list;
      if (list == null && gr.opt) { lists.push([]); continue; }
      if (!Array.isArray(list)) return { error: gr.name + ' 카드 목록이 없어요' };
      if (list.length < gr.min || list.length > gr.max) return { error: gr.name + ' 카드 수가 맞지 않아요(' + list.length + '장)' };
      var row = [];
      for (var i = 0; i < list.length; i++) {
        var c = _card(list[i]);
        if (!c) return { error: '카드를 읽을 수 없어요: ' + list[i] };
        if (seen[c]) return { error: '같은 카드가 두 번 나와요: ' + c };
        seen[c] = true;
        row.push(c);
      }
      lists.push(row);
    }
    return { lists: lists, dead: seen };
  }
  function _obj(s) { return { rank: s.charAt(0), suit: s.charAt(1) }; }
  function _objs(list) { return list.map(_obj); }

  // ── 레인지 문자열(Range.parse) ─────────────────────────
  // 쉼표 조각마다 손이 하나 이상 나와야 한다(Range.parse는 모르는 조각을 조용히 버리므로 오타를 여기서 잡는다)
  function _rangeSet(str) {
    if (typeof str !== 'string' || !str.trim()) return { error: 'range 문자열이 없어요' };
    var parts = str.split(',').map(function(s) { return s.trim(); });
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i] || !Range.parse(parts[i]).size) return { error: '레인지 조각을 읽을 수 없어요: ' + (parts[i] || '(빈 조각)') };
    }
    return { set: Range.parse(str) };
  }

  // ── 차트 스팟 ─────────────────────────────────────────
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
    return { kind: m[1], pos: pos, opener: op, facing: k.facing, act: k.act };
  }

  // ═══════════ calc 경로(칸을 카드로 펴서 센다) ═══════════
  var _chartCache = {};
  // spot → 칸 이름 배열(차트 모델 셀)
  function _chartClasses(sp) {
    var key = sp.pos + '|' + String(sp.facing) + '|' + (sp.opener || '') + '|' + sp.act;
    if (_chartCache[key]) return _chartCache[key];
    var m = GtoChart.buildChartModel(sp.pos, sp.facing, sp.opener || undefined), out = [];
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) if (m.cells[r][c].action === sp.act) out.push(m.cells[r][c].label);
    _chartCache[key] = out;
    return out;
  }
  // 입력의 range 또는 spot → {classes:[칸 이름]} | {error}
  function _classesOf(c) {
    var hasR = c.range != null, hasS = c.spot != null;
    if (hasR === hasS) return { error: 'range와 spot 중 하나만 써요' };
    if (hasR) {
      var rs = _rangeSet(c.range);
      return rs.error ? rs : { classes: Array.from(rs.set) };
    }
    var sp = _spotSpec(c.spot);
    if (sp.error) return sp;
    var e = _need(['GtoChart']);
    if (e) return e;
    var cls = _chartClasses(sp);
    return cls.length ? { classes: cls } : { error: '이 스팟의 차트 레인지가 비었어요: ' + c.spot };
  }
  // 칸 이름 → 실제 카드 조합(문자열 2장)
  function _expand(label) {
    var r1 = label.charAt(0), r2 = label.charAt(1), out = [], i, j;
    if (label.length === 2) {
      for (i = 0; i < 4; i++) for (j = i + 1; j < 4; j++) out.push([r1 + SUITS.charAt(i), r1 + SUITS.charAt(j)]);
    } else if (label.charAt(2) === 's') {
      for (i = 0; i < 4; i++) out.push([r1 + SUITS.charAt(i), r2 + SUITS.charAt(i)]);
    } else {
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) if (i !== j) out.push([r1 + SUITS.charAt(i), r2 + SUITS.charAt(j)]);
    }
    return out;
  }
  function _liveCombos(classes, dead) {
    var out = [];
    classes.forEach(function(cl) {
      _expand(cl).forEach(function(p) { if (!dead[p[0]] && !dead[p[1]]) out.push(p); });
    });
    return out;
  }
  // 무늬별 남은 카드로 센 칸 하나의 콤보 수
  function _leftOf(label, dead) {
    var r1 = label.charAt(0), r2 = label.charAt(1), a = 0, b = 0, both = 0;
    for (var i = 0; i < 4; i++) {
      var s = SUITS.charAt(i), x = !dead[r1 + s], y = !dead[r2 + s];
      if (x) a++;
      if (y) b++;
      if (x && y) both++;
    }
    if (label.length === 2) return a * (a - 1) / 2;
    return label.charAt(2) === 's' ? both : a * b - both;
  }

  function combosCalc(c) {
    var e = _need(['Range']);
    if (e) return e;
    var rs = _rangeSet(c.range);
    if (rs.error) return rs;
    var cg = _cardGroups([{ name: 'dead', list: c.dead, min: 0, max: 7, opt: true }]);
    if (cg.error) return cg;
    var full = 0, n = 0;
    rs.set.forEach(function(cl) { full += _leftOf(cl, {}); n += _leftOf(cl, cg.dead); });
    return { n: n, full: full, removed: full - n };
  }

  function _pct(n, tot) { return Math.round(n * 100 / tot); }

  function rangehitCalc(c) {
    var e = _need(['Range', 'HandEval', 'Villain']);
    if (e) return e;
    var cl = _classesOf(c);
    if (cl.error) return cl;
    var cg = _cardGroups([{ name: '보드', list: c.board, min: 3, max: 5 }, { name: 'dead', list: c.dead, min: 0, max: 4, opt: true },
      { name: '내 손', list: c.hero, min: 2, max: 2, opt: true }]);
    if (cg.error) return cg;
    var board = _objs(cg.lists[0]), cnt = { strong: 0, medium: 0, weak: 0, air: 0 }, total = 0;
    _liveCombos(cl.classes, cg.dead).forEach(function(p) {
      cnt[GROUP[Villain._handStrength([_obj(p[0]), _obj(p[1])], board)]]++;
      total++;
    });
    if (!total) return { error: '보드와 카드를 빼면 남는 콤보가 없어요' };
    var out = { total: total, nStrong: cnt.strong, nMid: cnt.medium, nWeak: cnt.weak, nAir: cnt.air, nTop: cnt.strong + cnt.medium };
    out.pctTop = _pct(out.nTop, total);
    out.pctStrong = _pct(out.nStrong, total);
    out.pctMid = _pct(out.nMid, total);
    out.pctWeak = _pct(out.nWeak, total);
    out.pctAir = _pct(out.nAir, total);
    if (cg.lists[2].length) out.heroCat = GROUP[Villain._handStrength(_objs(cg.lists[2]), board)];
    return out;
  }

  function _mdfIn(c) {
    if (!_fin(c.potBefore) || !_fin(c.bet)) return { error: 'mdf에는 potBefore(벳 전 팟)와 bet 숫자가 필요해요' };
    var P = Number(c.potBefore), B = Number(c.bet);
    if (!(P > 0) || !(B > 0)) return { error: 'mdf 금액은 0보다 커야 해요' };
    var bets = [];
    if (c.bets != null) {
      if (!Array.isArray(c.bets) || c.bets.length < 1 || c.bets.length > 4) return { error: 'mdf bets는 금액 1~4개 배열이에요' };
      for (var i = 0; i < c.bets.length; i++) {
        if (!_fin(c.bets[i]) || !(Number(c.bets[i]) > 0)) return { error: 'mdf bets 금액은 0보다 커야 해요' };
        bets.push(Number(c.bets[i]));
      }
    }
    return { P: P, B: B, bets: bets };
  }
  function mdfCalc(c) {
    var m = _mdfIn(c);
    if (m.error) return m;
    var out = { pct: Math.round(m.P * 100 / (m.P + m.B)), potBefore: _bb(m.P), bet: _bb(m.B), potTotal: _bb(m.P + m.B),
      size: Math.round(m.B * 100 / m.P) };
    m.bets.forEach(function(b, i) { out['pct' + (i + 1)] = Math.round(m.P * 100 / (m.P + b)); });
    return out;
  }

  // 단계 목록 검사 → {steps} | {error}
  function _steps(list, boardN) {
    if (list == null) return { steps: [] };
    if (!Array.isArray(list) || list.length > 3) return { error: "steps는 'flop', 'turn', 'river' 배열이에요" };
    var last = -1;
    for (var i = 0; i < list.length; i++) {
      var k = STREETS.indexOf(list[i]);
      if (k < 0) return { error: '알 수 없는 단계: ' + list[i] };
      if (k <= last) return { error: 'steps는 flop, turn, river 순서로 한 번씩만 써요' };
      if (boardN < k + 3) return { error: list[i] + ' 단계에는 보드가 ' + (k + 3) + '장 이상 필요해요' };
      last = k;
    }
    return { steps: list.slice() };
  }
  // 그 단계에서 지워지는 콤보인가(F10)
  function _dropAt(street, hole, board) {
    if (street === 'flop') {
      var f = board.slice(0, 3);
      return Villain._handStrength(hole, f) === 'air' && !PostflopGuide.hasDraw(hole, f);
    }
    if (street === 'turn') {
      var t = board.slice(0, 4), st = Villain._handStrength(hole, t);
      return (st === 'weak-pair' || st === 'air') && !PostflopGuide.hasDraw(hole, t);
    }
    var sr = Villain._handStrength(hole, board.slice(0, 5));
    return sr === 'weak-pair' || sr === 'air';
  }
  function suspectsCalc(c) {
    var e = _need(['Range', 'HandEval', 'Villain', 'Guide']);
    if (e) return e;
    var cl = _classesOf(c);
    if (cl.error) return cl;
    var cg = _cardGroups([{ name: '내 손', list: c.hero, min: 2, max: 2 }, { name: '보드', list: c.board, min: 3, max: 5 }]);
    if (cg.error) return cg;
    var st = _steps(c.steps, cg.lists[1].length);
    if (st.error) return st;
    var board = _objs(cg.lists[1]);
    var live = _liveCombos(cl.classes, cg.dead).map(function(p) { return [_obj(p[0]), _obj(p[1])]; });
    if (!live.length) return { error: '보드와 내 손 카드를 빼면 남는 콤보가 없어요' };
    var out = { n0: live.length, p0: 100 };
    st.steps.forEach(function(street, i) {
      live = live.filter(function(h) { return !_dropAt(street, h, board); });
      out['n' + (i + 1)] = live.length;
      out['p' + (i + 1)] = _pct(live.length, out.n0);
    });
    out.n = live.length;
    return out;
  }

  // ═══════════ verify 경로(1326 전수 열거, 정수 반올림) ═══════════
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
  // 반올림 정수 퍼센트(정수 산술): round(100n / d), d > 0
  function _ipct(n, d) { return Math.floor((200 * n + d) / (2 * d)); }
  // GTO_RANGES 원본 배열 → 칸 집합(Set). 콜 칸은 레이즈 칸을 뺀 나머지(차트 모델은 레이즈 칸이 먼저)
  function _rawSpotSet(sp) {
    var R = Gto.GTO_RANGES, set = new Set(), raise = null, call = null;
    function add(arr) { if (Array.isArray(arr) && arr.length) Range.parse(arr.join(',')).forEach(function(h) { set.add(h); }); }
    function minus(arr) { if (Array.isArray(arr) && arr.length) Range.parse(arr.join(',')).forEach(function(h) { set.delete(h); }); }
    if (sp.facing === false) { add(R.rfi[sp.pos]); return set; }
    if (sp.facing === 'vs3bet') {
      var v3 = R.vs3bet[sp.pos];
      if (!v3) return set;
      raise = v3.fourbet; call = v3.call;
    } else {
      var vs = (sp.pos === 'BB' && LATE[sp.opener] && R.vsRfiBB_LP) ? R.vsRfiBB_LP : R.vsRfi[sp.pos];
      if (!vs) return set;
      raise = vs.threebet; call = vs.call;
    }
    if (sp.act === 'raise') { add(raise); return set; }
    add(call); minus(raise);
    return set;
  }
  function _setOf(c) {
    if ((c.range != null) === (c.spot != null)) return { error: 'range와 spot 중 하나만 써요' };
    if (c.range != null) return _rangeSet(c.range);
    var sp = _spotSpec(c.spot);
    if (sp.error) return sp;
    var e = _need(['Gto']);
    if (e) return e;
    var set = _rawSpotSet(sp);
    return set.size ? { set: set } : { error: '이 스팟의 차트 레인지가 비었어요: ' + c.spot };
  }

  function combosVerify(c) {
    var e = _need(['Range']);
    if (e) return e;
    var rs = _rangeSet(c.range);
    if (rs.error) return rs;
    var cg = _cardGroups([{ name: 'dead', list: c.dead, min: 0, max: 7, opt: true }]);
    if (cg.error) return cg;
    var full = 0, n = 0;
    _pairs().forEach(function(p) {
      if (!rs.set.has(p.cls)) return;
      full++;
      if (!cg.dead[p.a] && !cg.dead[p.b]) n++;
    });
    return { n: n, full: full, removed: full - n };
  }

  function rangehitVerify(c) {
    var e = _need(['Range', 'HandEval', 'Villain']);
    if (e) return e;
    var rs = _setOf(c);
    if (rs.error) return rs;
    var cg = _cardGroups([{ name: '보드', list: c.board, min: 3, max: 5 }, { name: 'dead', list: c.dead, min: 0, max: 4, opt: true },
      { name: '내 손', list: c.hero, min: 2, max: 2, opt: true }]);
    if (cg.error) return cg;
    var board = _objs(cg.lists[0]), k = { nut: 0, strong: 0, medium: 0, 'weak-pair': 0, air: 0 }, total = 0;
    _pairs().forEach(function(p) {
      if (cg.dead[p.a] || cg.dead[p.b] || !rs.set.has(p.cls)) return;
      k[Villain._handStrength(p.h, board)]++;
      total++;
    });
    if (!total) return { error: '보드와 카드를 빼면 남는 콤보가 없어요' };
    var nStrong = k.nut + k.strong, nTop = nStrong + k.medium;
    var out = { total: total, nStrong: nStrong, nMid: k.medium, nWeak: k['weak-pair'], nAir: k.air, nTop: nTop,
      pctTop: _ipct(nTop, total), pctStrong: _ipct(nStrong, total), pctMid: _ipct(k.medium, total),
      pctWeak: _ipct(k['weak-pair'], total), pctAir: _ipct(k.air, total) };
    if (cg.lists[2].length) {
      var hs = Villain._handStrength(_objs(cg.lists[2]), board);
      out.heroCat = (hs === 'nut' || hs === 'strong') ? 'strong' : (hs === 'weak-pair' ? 'weak' : hs);
    }
    return out;
  }

  function mdfVerify(c) {
    if (!_fin(c.potBefore) || !_fin(c.bet)) return { error: 'mdf에는 potBefore(벳 전 팟)와 bet 숫자가 필요해요' };
    // 1/100bb 정수로 바꿔 정수 반올림
    var p = Math.round(Number(c.potBefore) * 100), b = Math.round(Number(c.bet) * 100);
    if (!(p > 0) || !(b > 0)) return { error: 'mdf 금액은 0보다 커야 해요' };
    var out = { pct: _ipct(p, p + b), potBefore: p / 100, bet: b / 100, potTotal: (p + b) / 100, size: _ipct(b, p) };
    if (c.bets != null) {
      if (!Array.isArray(c.bets) || c.bets.length < 1 || c.bets.length > 4) return { error: 'mdf bets는 금액 1~4개 배열이에요' };
      for (var i = 0; i < c.bets.length; i++) {
        var bi = _fin(c.bets[i]) ? Math.round(Number(c.bets[i]) * 100) : 0;
        if (!(bi > 0)) return { error: 'mdf bets 금액은 0보다 커야 해요' };
        out['pct' + (i + 1)] = _ipct(p, p + bi);
      }
    }
    return out;
  }

  function suspectsVerify(c) {
    var e = _need(['Range', 'HandEval', 'Villain', 'Guide']);
    if (e) return e;
    var rs = _setOf(c);
    if (rs.error) return rs;
    var cg = _cardGroups([{ name: '내 손', list: c.hero, min: 2, max: 2 }, { name: '보드', list: c.board, min: 3, max: 5 }]);
    if (cg.error) return cg;
    var st = _steps(c.steps, cg.lists[1].length);
    if (st.error) return st;
    var board = _objs(cg.lists[1]), steps = st.steps;
    // 콤보마다 처음 지워지는 단계 번호(1부터, 끝까지 남으면 steps.length + 1)
    var gone = [], n0 = 0, i;
    for (i = 0; i <= steps.length + 1; i++) gone.push(0);
    _pairs().forEach(function(p) {
      if (cg.dead[p.a] || cg.dead[p.b] || !rs.set.has(p.cls)) return;
      n0++;
      var at = steps.length + 1;
      for (var k = 0; k < steps.length; k++) {
        var s = steps[k], cut = s === 'flop' ? 3 : (s === 'turn' ? 4 : 5), b = board.slice(0, cut);
        var hs = Villain._handStrength(p.h, b);
        var weak = s === 'flop' ? hs === 'air' : (hs === 'air' || hs === 'weak-pair');
        if (weak && (s === 'river' || !PostflopGuide.hasDraw(p.h, b))) { at = k + 1; break; }
      }
      gone[at]++;
    });
    if (!n0) return { error: '보드와 내 손 카드를 빼면 남는 콤보가 없어요' };
    var out = { n0: n0, p0: 100 }, left = n0;
    for (i = 1; i <= steps.length; i++) {
      left -= gone[i];
      out['n' + i] = left;
      out['p' + i] = _ipct(left, n0);
    }
    out.n = left;
    return out;
  }

  // ═══════════ 등록 ═══════════
  var DEFS = {
    combos: {
      calc: combosCalc, verify: combosVerify, main: 'n',
      qCards: function(c) { return Array.isArray(c.dead) ? c.dead.slice() : []; },
      cases: [
        { c: { range: 'JJ+' }, want: { n: 24, full: 24, removed: 0 } },
        { c: { range: 'AKo' }, want: { n: 12, full: 12, removed: 0 } },
        { c: { range: 'KK', dead: ['Ks', '7h', '2d'] }, want: { n: 3, full: 6, removed: 3 } },
        { c: { range: 'AK', dead: ['As', '7h', '2d', 'Kc', 'Qc'] }, want: { n: 9, full: 16, removed: 7 } },
        { c: { range: 'AKs', dead: ['Ah'] }, want: { n: 3, full: 4, removed: 1 } }
      ]
    },
    rangehit: {
      calc: rangehitCalc, verify: rangehitVerify, main: 'pctTop', chip: 'chart',
      qCards: function(c) { return [].concat(c.board || [], c.dead || [], c.hero || []); },
      cases: [
        // AA 6콤보 = 오버페어(중간), KK는 K♥이 보드에 있어 3콤보 = 셋(강함) → 9콤보 전부 탑페어 이상
        { c: { range: 'AA, KK', board: ['Kh', '7c', '2d'] },
          want: { total: 9, nStrong: 3, nMid: 6, nWeak: 0, nAir: 0, nTop: 9, pctTop: 100, pctStrong: 33, pctMid: 67, pctAir: 0 } },
        // QQ 6콤보 = A 아래 포켓 페어(약한 페어), JTs 4콤보 = 에어(드로우만) → 탑페어 이상 0
        { c: { range: 'QQ, JTs', board: ['Ah', '9c', '2d'], hero: ['As', 'Kd'] },
          want: { total: 10, nTop: 0, nWeak: 6, nAir: 4, pctTop: 0, pctWeak: 60, pctAir: 40, heroCat: 'medium' } }
      ]
    },
    mdf: {
      calc: mdfCalc, verify: mdfVerify, main: 'pct',
      qNums: function(c) { return [Number(c.potBefore), Number(c.bet)]; },
      cases: [
        { c: { potBefore: 20, bet: 10 }, want: { pct: 67, potTotal: 30, size: 50 } },
        { c: { potBefore: 12, bet: 12 }, want: { pct: 50, potTotal: 24, size: 100 } },
        { c: { potBefore: 10, bet: 6 }, want: { pct: 63, size: 60 } },
        { c: { potBefore: 12, bet: 4, bets: [4, 8, 12] }, want: { pct: 75, pct1: 75, pct2: 60, pct3: 50, size: 33 } }
      ]
    },
    suspects: {
      calc: suspectsCalc, verify: suspectsVerify, main: 'n', chip: 'appdef',
      qCards: function(c) { return [].concat(c.hero || [], c.board || []); },
      cases: [
        // AA 6콤보는 끝까지 오버페어(중간)라 남고, 76s는 7♣이 보드에 있어 3콤보. 플랍 세컨드 페어라 남고,
        // 턴(5♠)에 약한 페어이면서 드로우가 없어 지워진다.
        { c: { range: 'AA, 76s', hero: ['Kc', 'Qc'], board: ['Kh', '7c', '2d', '5s', '9h'], steps: ['flop', 'turn', 'river'] },
          want: { n0: 9, n1: 9, n2: 6, n3: 6, n: 6, p0: 100, p1: 100, p2: 67, p3: 67 } },
        // JTs 4콤보는 98 보드에서 양방향 스트레이트 드로우라 플랍과 턴 둘 다 남는다
        { c: { range: 'JTs', hero: ['As', 'Ad'], board: ['9h', '8c', '2h', '3d'], steps: ['flop', 'turn'] },
          want: { n0: 4, n1: 4, n2: 4, n: 4 } },
        // QQ 6콤보는 A 보드에서 약한 페어: 플랍은 남고 턴(드로우 없음)에서 전부 지워진다
        { c: { range: 'QQ', hero: ['As', 'Kd'], board: ['Ah', '9c', '4d', '2s'], steps: ['flop', 'turn'] },
          want: { n0: 6, n1: 6, n2: 0, n: 0, p2: 0 } },
        { c: { range: 'AA', hero: ['Kc', 'Qc'], board: ['Kh', '7c', '2d'] }, want: { n0: 6, n: 6, p0: 100 } }
      ]
    }
  };

  if (typeof LessonCore !== 'undefined' && LessonCore && typeof LessonCore.defineCalc === 'function') {
    Object.keys(DEFS).forEach(function(t) {
      if (typeof LessonCore.calcDef === 'function' && LessonCore.calcDef(t)) return;   // 다시 로드돼도 조용히 넘긴다
      if (!LessonCore.defineCalc(t, DEFS[t]) && typeof console !== 'undefined' && console.warn) console.warn('[stage4a] calc 등록 실패: ' + t);
    });
  }
})();
