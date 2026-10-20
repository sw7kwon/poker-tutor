// puzzles/gen-read.js (채우는 그룹: M6-READ, 계약 H4)
// 상대 읽기 퍼즐 생성기 3종. typeof Puzzles 가드 후 Puzzles.register로 등록한다. 계약은 puzzles/puzzle-core.js 머리 주석 C1~C3.
//   hudread   HUD 읽기(앱 정의: exact + appDef, rated false, srs 키 = 분류 id). 관찰 n, VPIP, PFR, 3벳, AF를 보이고 4분류를 고른다.
//             판정은 VPIP와 PFR(표시값, % 정수)만 쓰는 H4 규칙(정본 ai/villain-tracker.js VillainTracker.classify, RULE).
//             3벳과 AF는 그 분류에 어울리는 값으로 함께 보이는 보조 숫자다(판정에 쓰지 않는다).
//             출제 제외: 표시값 VPIP, PFR를 각각 ±2%p 안에서 움직인 모든 정수 점(PFR ≤ VPIP)이 같은 분류가 아니면 내지 않는다
//             (경계 2%p 안쪽 출제 안 함). 분류마다 실전에서 어색한 구석도 내지 않는다(정석은 VPIP 23~37이고 PFR/VPIP 0.45 이상).
//             표시 숫자는 관찰 횟수(n, VPIP 수, PFR 수, 3벳 수, 포스트플랍 벳+레이즈 수, 콜 수)에서 트래커와 같은 반올림으로 낸다.
//             verify(독립 경로): 횟수에서 표시값과 HUD 글자를 다시 만들고, 규칙을 따로 구현한 판정과 ±2%p 안정성을 다시 본다.
//   prescribe 유형별 처방(approx 참고, rated false, once). H4 처방 표 그대로. 변형 class(분류 → 처방), hud(HUD → 처방),
//             cast(캐스트 이름과 소개 → 처방, Mixed 제외), reverse(처방 → 분류), spot(처방 표 한 줄을 그대로 따르는 장면 고르기).
//   intent    캐릭터 속마음(approx 캐릭터 읽기, rated false, once). 빌런 손과 보드를 다 보이고 그 액션의 의도를 4~6지에서 고른다.
//             액션은 엔진 빌런(Villain.getAction, 시드 RNG로 Math.random을 잠깐 바꿔 재현), 정답은 Thinking.villainThought의 intent.
//             폴드(늘 '포기')는 내지 않는다. verify는 q.data로 상태를 새로 만들어 villainThought를 다시 부른다.
//             등록(REGISTER_INTENT true, M6 통합 검증에서 tests/j-thinking-ui.test.js의 '(M6 전) intent 퍼즐 미등록' 전제와
//             reviewable 환경 단언을 정책 'srs'를 잠깐 거는 방식으로 고친 뒤 켰다). 키 정책은 정본(TYPE_META) 그대로 once라
//             게임 중 맞히기 확신 오답은 등록 뒤에도 상자에 들어가지 않는다(로드맵 M4 남은 것 6, 이 그룹 결정: once 유지).
// 문구 규칙: 가운뎃점과 긴줄표 대신 쉼표, 원작 고유명사 금지(content-lint).
(function() {
  // ── 공통 도구 ──
  function _rng(rnd) { return typeof rnd === 'function' ? rnd : Math.random; }
  function _int(rnd, n) { return Math.floor(rnd() * n) % n; }
  function _pick(rnd, arr) { return arr[_int(rnd, arr.length)]; }
  function _between(rnd, lo, hi) { return lo + rnd() * (hi - lo); }
  function _VT() { return (typeof VillainTracker !== 'undefined' && VillainTracker && VillainTracker.RULE) ? VillainTracker : null; }
  function _sameIds(opts, ids) {
    if (!Array.isArray(opts) || opts.length !== ids.length) return false;
    for (var i = 0; i < ids.length; i++) if (!opts[i] || opts[i].id !== ids[i] || typeof opts[i].label !== 'string' || !opts[i].label) return false;
    return true;
  }
  function _isInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }
  // 받침 유무(한글 끝 글자 기준, 이모지와 기호는 건너뛴다): 조사 고르기
  function _jong(word) {
    var s = String(word || '');
    for (var i = s.length - 1; i >= 0; i--) {
      var c = s.charCodeAt(i);
      if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 > 0;
    }
    return false;
  }
  function _ieyo(w) { return w + (_jong(w) ? '이에요' : '예요'); }
  function _euro(w) { return w + (_jong(w) ? '으로' : '로'); }

  // ═══════════════════ H4 4분류(정본 VillainTracker) ═══════════════════
  var CLASSES = ['tight', 'standard', 'loose-aggr', 'loose-passive'];
  var LABEL = { tight: '🧊 타이트', standard: '⚖ 정석', 'loose-aggr': '🔥 루즈-공격', 'loose-passive': '🐟 루즈-패시브' };
  var SHORT = { tight: '타이트', standard: '정석', 'loose-aggr': '루즈-공격', 'loose-passive': '루즈-패시브' };
  var FALLBACK_RULE = { minN: 15, tightMax: 10, lpMin: 20, lpRatio: 0.35, laMin: 18, laRatio: 0.6 };
  var MARGIN = 2;           // 경계 2%p 안쪽은 내지 않는다
  function _rule() { var V = _VT(); return V ? V.RULE : FALLBACK_RULE; }
  function _label(cls) { var V = _VT(); return (V && V.CLASS_LABEL && V.CLASS_LABEL[cls]) || LABEL[cls]; }

  // 생성 경로 판정: VillainTracker.classify(정본)
  function _classGen(v, p) {
    var V = _VT();
    if (V && typeof V.classify === 'function') return V.classify({ vpip: v, pfr: p });
    return _classIndep(v, p, FALLBACK_RULE);
  }
  // 검증 경로 판정: 규칙을 따로 구현(조건을 모두 세운 뒤 순서대로 고른다)
  function _classIndep(v, p, R) {
    if (!isFinite(v) || !isFinite(p)) return null;
    var low = v <= R.tightMax;
    var passive = v > 0 && p * 100 < R.lpRatio * 100 * v;   // p/v < 0.35를 곱셈으로
    var aggr = v > 0 && p * 100 >= R.laRatio * 100 * v;     // p/v ≥ 0.6
    var loose40 = v >= R.lpMin, loose30 = v >= R.laMin;
    var hits = [low ? 'tight' : null, (!low && loose40 && passive) ? 'loose-passive' : null,
      (!low && !(loose40 && passive) && loose30 && aggr) ? 'loose-aggr' : null];
    for (var i = 0; i < hits.length; i++) if (hits[i]) return hits[i];
    return 'standard';
  }
  // ±margin 안 정수 점(0 ≤ PFR ≤ VPIP ≤ 100)이 모두 같은 분류인가
  function _stable(v, p, cls, fn, margin) {
    var m = margin == null ? MARGIN : margin;
    for (var dv = -m; dv <= m; dv++) for (var dp = -m; dp <= m; dp++) {
      var a = v + dv, b = p + dp;
      if (a < 0 || b < 0 || a > 100 || b > a) continue;
      if (fn(a, b) !== cls) return false;
    }
    return true;
  }
  // 가장 가까운 다른 분류(정수 격자 L1 거리, 같으면 CLASSES 순서). 데일리 5 '아쉬움' near 표시용
  function _nearest(v, p, cls) {
    var best = null, bestD = 1e9;
    for (var dv = -15; dv <= 15; dv++) for (var dp = -15; dp <= 15; dp++) {
      var a = v + dv, b = p + dp, d = Math.abs(dv) + Math.abs(dp);
      if (a < 0 || b < 0 || a > 100 || b > a || d >= bestD) continue;
      var c = _classGen(a, b);
      if (c && c !== cls && (d < bestD || (d === bestD && CLASSES.indexOf(c) < CLASSES.indexOf(best)))) { best = c; bestD = d; }
    }
    return best;
  }

  // ═══════════════════ 1. hudread(앱 정의) ═══════════════════
  // 분류별 생성 범위: VPIP %, PFR/VPIP, 3벳 %, AF. 실전에서 그 유형으로 읽히는 모양만(애매한 구석은 뺀다).
  // VPIP 범위는 RULE에서 낸다(임계를 다시 정하면 VillainTracker.RULE 한 곳만 바꾸면 된다). 지금 기준(타이트 10, 루즈-공격 18, 루즈-패시브 20) 값:
  //   타이트 2~7, 정석 13~15(주로, 비율 0.6~0.9, 교수 모양)와 26~40(가끔, 비율 0.42~0.52, 넓지만 공격 비율이 중간),
  //   루즈-공격 21~40(비율 0.65~0.92), 루즈-패시브 23~50(비율 0.04~0.3)
  //   정석 낮은 쪽은 타이트 임계 + 3부터 루즈-공격 임계 - 3까지, 높은 쪽은 두 루즈 임계 중 큰 값 + 6부터(±2 안정성 여유)
  function _shape(cls) {
    var R = _rule(), m = MARGIN + 1;
    if (cls === 'tight') return { v: [Math.max(2, R.tightMax - 16), R.tightMax - m], r: [0.35, 0.95], tb: [1, 4], af: [1.2, 2.8] };
    if (cls === 'standard') {
      var hi = Math.max(R.laMin, R.lpMin) + 6;
      return { v: [R.tightMax + m, hi + 14], lowTop: Math.max(R.tightMax + m, R.laMin - m), hiLow: hi,
        r: [Math.max(0.45, R.laRatio), 0.9], rHigh: [R.lpRatio + 0.07, R.laRatio - 0.08], tb: [3, 8], af: [1.6, 3.2] };
    }
    if (cls === 'loose-aggr') return { v: [R.laMin + m, R.laMin + 22], r: [R.laRatio + 0.05, 0.92], tb: [7, 14], af: [2.8, 5.0] };
    if (cls === 'loose-passive') return { v: [R.lpMin + m, R.lpMin + 30], r: [0.04, R.lpRatio - 0.05], tb: [0, 3], af: [0.3, 1.0] };
    return null;
  }
  var SHAPE = {};
  CLASSES.forEach(function(c) { SHAPE[c] = _shape(c); });   // H4 기준 값(테스트와 문서용 사본, 생성은 _shape를 매번 부른다)
  var N_LIST = [20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500];
  // 표시값 반올림: 트래커(VillainTracker.stats)와 같은 식 k x 100 / n(소수 오차 없이 반올림)
  function _pct(k, n) { return Math.round(k * 100 / n); }
  function _af(aggr, calls) { return calls ? Math.round(aggr * 10 / calls) / 10 : aggr; }
  function _hudLine(d) { return 'VPIP ' + d.vpip + ' | PFR ' + d.pfr + ' | 3벳 ' + d.tb + ' | AF ' + d.af + ' | ' + d.n + '핸드'; }

  // 관찰 횟수 → 표시값 { n, vc, pc, tc, aggr, calls, vpip, pfr, tb, af }
  function _counts(rnd, cls, n) {
    var sh = _shape(cls), R = _rule();
    var v = _between(rnd, sh.v[0], sh.v[1]), r = sh.r;
    // 정석은 루즈-공격 VPIP 임계 아래(교수 모양)를 주로, 그 위(넓지만 공격 비율이 중간인 쪽)를 가끔
    if (cls === 'standard') {
      if (rnd() < 0.7) v = _between(rnd, sh.v[0], sh.lowTop + 0.49);
      else { v = _between(rnd, sh.hiLow, sh.v[1]); r = sh.rHigh; }
    }
    var ratio = _between(rnd, r[0], r[1]);
    var vc = Math.max(1, Math.min(n, Math.round(v / 100 * n)));
    var pc = Math.max(0, Math.min(vc, Math.round(vc * ratio)));
    // 3벳은 프리플랍 레이즈의 일부라 PFR 횟수의 절반을 넘지 않게(재보정 뒤 PFR이 낮은 정석, 타이트에서 '3벳 8 | PFR 10'처럼 보이던 것)
    var tc = Math.max(0, Math.min(Math.floor(pc / 2), Math.round(_between(rnd, sh.tb[0], sh.tb[1]) / 100 * n)));
    var calls = Math.max(4, Math.round(n * _between(rnd, 0.12, 0.3)));
    var aggr = Math.max(0, Math.round(calls * _between(rnd, sh.af[0], sh.af[1])));
    return { n: n, vc: vc, pc: pc, tc: tc, aggr: aggr, calls: calls,
      vpip: _pct(vc, n), pfr: _pct(pc, n), tb: _pct(tc, n), af: _af(aggr, calls) };
  }
  // 분류별 모양 조건(표시값 기준, verify도 같은 조건을 다시 본다)
  function _shapeOk(cls, d) {
    var sh = _shape(cls);
    if (!sh || d.vpip < 1) return false;
    var ratio = d.pfr / d.vpip;
    if (cls === 'standard' && !(d.vpip >= sh.v[0] && d.vpip <= sh.v[1] && ratio >= (d.vpip >= sh.hiLow ? sh.rHigh[0] - 0.02 : 0.45))) return false;
    if (cls === 'loose-passive' && d.af > 1.2) return false;
    if (cls === 'loose-aggr' && d.af < 2.5) return false;
    return true;
  }

  function _hudBuild(rnd, cls, n) {
    if (CLASSES.indexOf(cls) < 0) return null;
    for (var t = 0; t < 60; t++) {
      var nn = n || _pick(rnd, N_LIST);
      var d = _counts(rnd, cls, nn);
      if (_classGen(d.vpip, d.pfr) !== cls || !_shapeOk(cls, d) || !_stable(d.vpip, d.pfr, cls, _classGen)) continue;
      d.cls = cls;
      var near = _nearest(d.vpip, d.pfr, cls);
      return {
        type: 'hudread', key: cls, concept: 'read', difficulty: 2200,
        confidence: 'exact', appDef: true, rated: false, srs: 'srs',
        prompt: '상대 HUD예요. 이 상대는 어떤 유형일까요?\n(이 앱의 분류 기준, VPIP와 PFR로 판정)',
        scene: { range: { label: 'HUD', text: _hudLine(d) } },
        options: CLASSES.map(function(c) { var o = { id: c, label: _label(c) }; if (c === near) o.near = true; return o; }),
        answer: cls,
        data: d
      };
    }
    return null;
  }
  function hudreadNext(rnd, opts) {
    rnd = _rng(rnd); opts = opts || {};
    var cls = CLASSES.indexOf(opts.cls) >= 0 ? opts.cls : _pick(rnd, CLASSES);
    var n = _isInt(opts.n) && opts.n >= _rule().minN ? opts.n : null;
    return _hudBuild(rnd, cls, n);
  }
  function hudreadFromKey(key, rnd) { return CLASSES.indexOf(key) >= 0 ? _hudBuild(_rng(rnd), key, null) : null; }

  // 횟수 → 표시값 재계산과 형식 검사(hudread, prescribe hud 공용)
  function _dataOk(d) {
    if (!d || typeof d !== 'object') return false;
    var R = _rule();
    var ks = ['n', 'vc', 'pc', 'tc', 'aggr', 'calls'];
    for (var i = 0; i < ks.length; i++) if (!_isInt(d[ks[i]]) || d[ks[i]] < 0) return false;
    if (d.n < R.minN || d.vc > d.n || d.pc > d.vc || d.tc > d.pc || d.calls < 1) return false;
    var vp = Math.round(d.vc * 100 / d.n), pf = Math.round(d.pc * 100 / d.n), tb = Math.round(d.tc * 100 / d.n);
    var af = Math.round(d.aggr * 10 / d.calls) / 10;
    return vp === d.vpip && pf === d.pfr && tb === d.tb && Math.abs(af - d.af) < 1e-9;
  }
  function hudreadVerify(q) {
    try {
      if (!q || q.type !== 'hudread' || q.confidence !== 'exact' || q.appDef !== true || q.rated !== false || q.srs !== 'srs') return false;
      if (!_sameIds(q.options, CLASSES) || q.key !== q.answer) return false;
      var d = q.data;
      if (!_dataOk(d)) return false;
      var line = 'VPIP ' + Math.round(d.vc * 100 / d.n) + ' | PFR ' + Math.round(d.pc * 100 / d.n) + ' | 3벳 ' + Math.round(d.tc * 100 / d.n) +
        ' | AF ' + (Math.round(d.aggr * 10 / d.calls) / 10) + ' | ' + d.n + '핸드';
      if (!q.scene || !q.scene.range || q.scene.range.text !== line) return false;
      var R = _rule();
      var cls = _classIndep(d.vpip, d.pfr, R);
      if (cls !== q.answer || d.cls !== cls) return false;
      var fn = function(a, b) { return _classIndep(a, b, R); };
      return _stable(d.vpip, d.pfr, cls, fn) && _shapeOk(cls, d);
    } catch (e) { return false; }
  }
  // 판정 이유 한 줄(표시값 기준)
  function _why(d) {
    var R = _rule(), cls = d.cls, ratio = d.vpip ? d.pfr / d.vpip : 0;
    var rs = d.pfr + '/' + d.vpip + ' = ' + ratio.toFixed(2);
    if (cls === 'tight') return 'VPIP ' + d.vpip + ' ≤ ' + R.tightMax + ' → ' + _label(cls);
    if (cls === 'loose-passive') return 'VPIP ' + d.vpip + ' ≥ ' + R.lpMin + '이고 PFR/VPIP ' + rs + ' < ' + R.lpRatio + ' → ' + _label(cls);
    if (cls === 'loose-aggr') return 'VPIP ' + d.vpip + ' ≥ ' + R.laMin + '이고 PFR/VPIP ' + rs + ' ≥ ' + R.laRatio + ' → ' + _label(cls);
    if (d.vpip < R.laMin) return 'VPIP ' + d.vpip + '(' + (R.tightMax + 1) + '~' + (R.laMin - 1) + ', 타이트도 루즈도 아님), PFR/VPIP ' + rs + ' → ' + _label(cls);
    if (d.vpip < R.lpMin) return 'VPIP ' + d.vpip + '(' + R.laMin + ' 이상)이지만 PFR/VPIP ' + rs + ' < ' + R.laRatio + ' → ' + _label(cls);
    return 'VPIP ' + d.vpip + '(' + R.lpMin + ' 이상)이지만 PFR/VPIP ' + rs + '(' + R.lpRatio + '~' + R.laRatio + ' 사이) → ' + _label(cls);
  }
  function _ruleLine() {
    var R = _rule();
    return '이 앱 기준: 타이트 VPIP ' + R.tightMax + ' 이하, 루즈-패시브 ' + R.lpMin + ' 이상이고 PFR/VPIP ' + R.lpRatio + ' 미만, 루즈-공격 ' +
      R.laMin + ' 이상이고 PFR/VPIP ' + R.laRatio + ' 이상, 나머지 정석';
  }
  function _sampleNote(n) { return n < 100 ? ' (' + n + '핸드는 아직 잠정, 100핸드부터 믿을 만해요)' : ''; }
  function hudreadExplain(q) {
    if (!q || !q.data) return { line: '' };
    return { line: _why(q.data) + _sampleNote(q.data.n) + '\n' + _ruleLine() + '. 3벳과 AF는 확인용 보조 숫자', scene: q.scene };
  }

  // ═══════════════════ 2. prescribe(참고) ═══════════════════
  // H4 처방 표(참고, s6-04 레슨과 같은 문장)
  var RX = {
    'loose-passive': { id: 'rx-lp', text: '블러프를 줄이고 밸류벳은 크게, 얇게까지' },
    tight: { id: 'rx-tight', text: '스틸과 c벳 블러프를 늘리고, 큰 벳과 레이즈엔 강한 손이 아니면 폴드' },
    'loose-aggr': { id: 'rx-la', text: '블러프캐치를 넓히고 강한 손은 체크콜로 상대가 치게, 약한 블러프는 줄이기' },
    standard: { id: 'rx-std', text: '이 앱 차트와 기본 전략 그대로' }
  };
  var RX_IDS = CLASSES.map(function(c) { return RX[c].id; });
  function _rxOptions() {
    return CLASSES.map(function(c) { return { id: RX[c].id, label: RX[c].text }; });
  }
  function _clsOfRx(id) { for (var i = 0; i < CLASSES.length; i++) if (RX[CLASSES[i]].id === id) return CLASSES[i]; return null; }
  // 캐스트(엔진 유형 → 분류는 VillainTracker.CLASS_OF_TYPE). 카멜레온(Mixed)은 스트리트마다 달라 내지 않는다
  var CAST_TYPES = ['Nit', 'TAG', 'LAG', 'Fish', 'Station'];
  var CAST_FALLBACK = { Nit: '바위', TAG: '교수', LAG: '불도저', Fish: '햇살', Station: '콜마스터' };
  var TYPE_CLASS = { Nit: 'tight', TAG: 'standard', LAG: 'loose-aggr', Fish: 'loose-passive', Station: 'loose-passive' };
  function _castOf(type) {
    if (typeof CAST !== 'undefined' && Array.isArray(CAST)) {
      for (var i = 0; i < CAST.length; i++) if (CAST[i] && CAST[i].type === type) return CAST[i];
    }
    return { key: CAST_FALLBACK[type], name: CAST_FALLBACK[type], icon: '', bio: '', type: type };
  }
  // 해설용 '이름(유형)'(지문과 같은 표기)
  function _castWho(type) { var c = _castOf(type); return (c.icon ? c.icon + ' ' : '') + c.name + '(' + type + ')'; }
  function _typeClass(type) {
    var V = _VT();
    return (V && V.CLASS_OF_TYPE && V.CLASS_OF_TYPE[type]) || TYPE_CLASS[type] || null;
  }
  // 장면 고르기(spot): 처방 표 한 줄을 그대로 따르는 보기가 정답. 정답은 표에서 늘 'a'라 낼 때 보기 순서를 섞는다
  // (고정 순서면 정답이 늘 1번이라 내용을 몰라도 맞힌다). id와 글자 짝은 그대로
  var SPOTS = [
    { id: 'lp-river-value', cls: 'loose-passive', q: '상대는 🐟 루즈-패시브, 리버까지 체크콜로 따라왔어요. 내 손은 탑페어.\n리버에서 어떻게 할까요?',
      opts: [['a', '얇게라도 밸류벳'], ['b', '체크하고 쇼다운'], ['c', '팟보다 큰 블러프처럼 벳'], ['d', '폴드할 준비로 체크']], answer: 'a' },
    { id: 'lp-air', cls: 'loose-passive', q: '상대는 🐟 루즈-패시브, 플랍 벳에 콜했어요. 내 손은 아무것도 없는 에어.\n턴에서 어떻게 할까요?',
      opts: [['a', '블러프를 줄이고 체크'], ['b', '더 크게 블러프'], ['c', '올인으로 밀기'], ['d', '작게 블러프를 이어 가기']], answer: 'a' },
    { id: 'lp-value-size', cls: 'loose-passive', q: '상대는 🐟 루즈-패시브. 내 손은 강한 투페어, 상대는 콜을 자주 해요.\n벳 크기는?',
      opts: [['a', '크게 밸류벳(상대가 콜하니까)'], ['b', '아주 작게'], ['c', '체크로 숨기기'], ['d', '기본 전략 그대로, 바꿀 것 없음']], answer: 'a' },
    { id: 'tight-steal', cls: 'tight', q: '블라인드 두 명이 모두 🧊 타이트해요. 내 자리는 BTN.\n스틸 오픈은?',
      opts: [['a', '평소보다 넓게 스틸 오픈'], ['b', '평소보다 좁게'], ['c', '림프로 들어가기'], ['d', '이 앱 차트대로, 바꿀 것 없음']], answer: 'a' },
    { id: 'tight-raise', cls: 'tight', q: '🧊 타이트한 상대가 리버에서 크게 레이즈했어요. 내 손은 탑페어.\n어떻게 할까요?',
      opts: [['a', '강한 손이 아니면 폴드'], ['b', '블러프캐치로 콜'], ['c', '다시 레이즈'], ['d', '올인으로 맞받기']], answer: 'a' },
    { id: 'tight-cbet', cls: 'tight', q: '🧊 타이트한 상대가 프리플랍 콜, 플랍은 드라이해요. 내 손은 에어.\nc벳은?',
      opts: [['a', 'c벳 블러프를 늘린다'], ['b', '체크로 포기'], ['c', '올인'], ['d', '체크레이즈를 노린다']], answer: 'a' },
    { id: 'la-catch', cls: 'loose-aggr', q: '🔥 루즈-공격 상대가 리버에서 크게 벳했어요. 내 손은 미들 페어(블러프캐처).\n어떻게 할까요?',
      opts: [['a', '블러프캐치로 콜을 넓힌다'], ['b', '바로 폴드'], ['c', '블러프 레이즈'], ['d', '올인으로 맞받기']], answer: 'a' },
    { id: 'la-checkcall', cls: 'loose-aggr', q: '🔥 루즈-공격 상대 앞에서 내가 먼저 말해요. 내 손은 강한 투페어.\n어떻게 할까요?',
      opts: [['a', '체크해서 상대가 치게(체크콜)'], ['b', '체크폴드'], ['c', '아주 작게 벳'], ['d', '기본 전략 그대로, 바꿀 것 없음']], answer: 'a' },
    { id: 'la-bluff', cls: 'loose-aggr', q: '🔥 루즈-공격 상대가 내 벳에 자주 레이즈해요. 내 손은 약한 에어.\n블러프는?',
      opts: [['a', '약한 블러프를 줄인다'], ['b', '블러프를 더 늘린다'], ['c', '더 크게 블러프'], ['d', '레이즈를 맞아도 계속']], answer: 'a' },
    { id: 'std-base', cls: 'standard', q: '상대는 ⚖ 정석, 이 앱 차트와 비슷하게 쳐요.\n무엇을 바꿀까요?',
      opts: [['a', '이 앱 차트와 기본 전략 그대로'], ['b', '블러프를 크게 늘린다'], ['c', '모든 벳에 콜'], ['d', '강한 손만 남기고 다 폴드']], answer: 'a' }
  ];
  var RX_VARIANTS = ['class', 'hud', 'cast', 'reverse', 'spot'];
  function _spotById(id) { for (var i = 0; i < SPOTS.length; i++) if (SPOTS[i].id === id) return SPOTS[i]; return null; }

  function _rxBase(variant, prompt, scene, options, answer, data) {
    return { type: 'prescribe', key: null, concept: 'read', difficulty: null, confidence: 'approx', appDef: false, rated: false, srs: 'once',
      prompt: prompt, scene: scene, options: options, answer: answer, variant: variant, data: data };
  }
  function prescribeNext(rnd, opts) {
    rnd = _rng(rnd); opts = opts || {};
    var variant = RX_VARIANTS.indexOf(opts.variant) >= 0 ? opts.variant : _pick(rnd, RX_VARIANTS);
    var cls;
    if (variant === 'class') {
      cls = CLASSES.indexOf(opts.cls) >= 0 ? opts.cls : _pick(rnd, CLASSES);
      return _rxBase('class', '상대는 ' + _ieyo(_label(cls)) + '. 무엇을 바꿀까요?(참고)', null, _rxOptions(), RX[cls].id, { cls: cls });
    }
    if (variant === 'hud') {
      cls = CLASSES.indexOf(opts.cls) >= 0 ? opts.cls : _pick(rnd, CLASSES);
      var h = _hudBuild(rnd, cls, _pick(rnd, [40, 60, 80, 100, 150, 200, 300]));
      if (!h) return null;
      return _rxBase('hud', '상대 HUD를 읽고 처방을 골라요(참고)\n(분류는 이 앱 기준, VPIP와 PFR)', h.scene, _rxOptions(), RX[cls].id, h.data);
    }
    if (variant === 'cast') {
      var type = CAST_TYPES.indexOf(opts.castType) >= 0 ? opts.castType : _pick(rnd, CAST_TYPES);
      var c = _castOf(type);
      cls = _typeClass(type);
      if (!cls) return null;
      var who = (c.icon ? c.icon + ' ' : '') + c.name;
      // 엔진 유형 → 처방 줄(VillainTracker.CLASS_OF_TYPE). HUD 숫자가 그 분류로 읽힌다고 단정하지 않는다(표본과 테이블에 따라 다름)
      var p = who + '(' + type + ') 상대예요. 무엇을 바꿀까요?(참고)';
      return _rxBase('cast', p, c.bio ? { note: c.name + ': ' + c.bio } : null, _rxOptions(), RX[cls].id, { castType: type, cls: cls });
    }
    if (variant === 'reverse') {
      cls = CLASSES.indexOf(opts.cls) >= 0 ? opts.cls : _pick(rnd, CLASSES);
      var ops = CLASSES.map(function(k) { return { id: k, label: _label(k) }; });
      return _rxBase('reverse', '처방: ' + RX[cls].text + '\n어떤 상대에게 맞는 처방일까요?(참고)', null, ops, cls, { cls: cls });
    }
    var sp = _spotById(opts.spot) || _pick(rnd, SPOTS);
    var spOpts = _shuffle(rnd, sp.opts).map(function(o) { return { id: o[0], label: o[1] }; });
    return _rxBase('spot', sp.q, null, spOpts, sp.answer, { spot: sp.id, cls: sp.cls });
  }
  function prescribeVerify(q) {
    try {
      if (!q || q.type !== 'prescribe' || q.confidence !== 'approx' || q.rated !== false || q.srs !== 'once' || q.key != null) return false;
      var d = q.data || {};
      var v = q.variant;
      if (v === 'class' || v === 'hud' || v === 'cast') {
        if (!_sameIds(q.options, RX_IDS)) return false;
        var cls = d.cls;
        if (v === 'hud') {
          if (!_dataOk(d)) return false;
          var R = _rule();
          cls = _classIndep(d.vpip, d.pfr, R);
          if (cls !== d.cls || !_stable(d.vpip, d.pfr, cls, function(a, b) { return _classIndep(a, b, R); })) return false;
          if (!q.scene || !q.scene.range || q.scene.range.text !== _hudLine(d)) return false;
        }
        if (v === 'cast') {
          if (TYPE_CLASS[d.castType] == null || TYPE_CLASS[d.castType] !== cls) return false;
          var V = _VT();
          if (V && V.CLASS_OF_TYPE && V.CLASS_OF_TYPE[d.castType] !== cls) return false;
        }
        if (CLASSES.indexOf(cls) < 0) return false;
        // 정답 = 그 분류의 처방(보기 글자도 표 그대로)
        var want = RX[cls];
        var o = q.options.filter(function(x) { return x.id === q.answer; })[0];
        return q.answer === want.id && !!o && o.label === want.text && _clsOfRx(q.answer) === cls;
      }
      if (v === 'reverse') {
        if (!_sameIds(q.options, CLASSES) || CLASSES.indexOf(d.cls) < 0) return false;
        return q.answer === d.cls && q.prompt.indexOf(RX[d.cls].text) >= 0;
      }
      if (v === 'spot') {
        var sp = _spotById(d.spot);
        if (!sp || sp.cls !== d.cls || CLASSES.indexOf(sp.cls) < 0 || q.prompt !== sp.q || q.answer !== sp.answer) return false;
        // 보기 = 그 장면 보기 4개의 순열(id와 글자 짝 그대로, 중복 없음)
        if (!Array.isArray(q.options) || q.options.length !== sp.opts.length) return false;
        var want = {}, seenId = {};
        sp.opts.forEach(function(x) { want[x[0]] = x[1]; });
        return q.options.every(function(x) {
          if (!x || !Object.prototype.hasOwnProperty.call(want, x.id) || seenId[x.id] || x.label !== want[x.id]) return false;
          seenId[x.id] = true; return true;
        });
      }
      return false;
    } catch (e) { return false; }
  }
  function prescribeExplain(q) {
    if (!q || !q.data) return { line: '' };
    var d = q.data, cls = d.cls;
    var head = (q.variant === 'hud' ? _why(d) + '. ' : q.variant === 'cast' ? _castWho(d.castType) + ' 상대에게는 ' : '') +
      _label(cls) + ' 처방: ' + RX[cls].text;
    var tail = q.variant === 'spot' ? '처방 표 한 줄을 이 장면에 그대로 옮긴 답이에요(참고, 정답이 하나로 정해진 계산이 아님)'
      : '유형별 처방은 상대 경향에 맞춘 참고값이에요. 표본이 적으면(100핸드 미만) 기본 전략에서 조금만 벗어나요';
    return { line: head + '\n' + tail, scene: q.variant === 'hud' ? q.scene : null };
  }

  // ═══════════════════ 3. intent(캐릭터 읽기) ═══════════════════
  var INTENTS = ['value', 'bluff', 'semibluff', 'pot-control', 'call-odds', 'give-up', 'trap'];
  var INTENT_FALLBACK = { value: '밸류', bluff: '블러프', semibluff: '세미블러프', 'pot-control': '팟컨트롤', 'call-odds': '팟 오즈 콜', 'give-up': '포기', trap: '함정' };
  var INTENT_TYPES = ['TAG', 'LAG', 'Fish', 'Nit', 'Mixed', 'Station'];
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var STREETS = [['preflop', 0.2], ['flop', 0.35], ['turn', 0.25], ['river', 0.2]];
  var STREET_KOR = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
  var ACT_KOR = { bet: '벳', raise: '레이즈', '3bet': '3벳', call: '콜', check: '체크', allin: '올인' };
  var STRENGTH_KOR = { nut: '넛급', strong: '강한 손', medium: '중간 손', 'weak-pair': '약한 페어', draw: '드로우', air: '에어' };
  var GRADE_KOR = { premium: '프리미엄', good: '좋은 손', spec: '투기적인 손', weak: '약한 손' };
  var CARD_RE = /^[2-9TJQKA][shdc]$/;
  var RANKS = '23456789TJQKA', SUITS = 'shdc';
  var MIXED_MAP = { preflop: 'TAG', flop: 'LAG', turn: 'TAG', river: 'Fish' };

  function _intentLabel(k) {
    var m = (typeof Thinking !== 'undefined' && Thinking && Thinking.INTENT_KOR) ? Thinking.INTENT_KOR : null;
    return (m && m[k]) || INTENT_FALLBACK[k] || String(k);
  }
  function _intentReady() {
    return typeof Thinking !== 'undefined' && Thinking && typeof Thinking.villainThought === 'function' &&
      typeof Villain !== 'undefined' && Villain && typeof Villain.getAction === 'function' &&
      typeof VillainProfiles !== 'undefined' && typeof Range !== 'undefined' && typeof HandEval !== 'undefined';
  }
  function _card(s) { return { rank: s.charAt(0), suit: s.charAt(1) }; }
  function _cstr(c) { return c.rank + c.suit; }
  function _deck() { var d = []; for (var r = 0; r < 13; r++) for (var s = 0; s < 4; s++) d.push(RANKS[r] + SUITS[s]); return d; }
  function _shuffle(rnd, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = _int(rnd, i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  var _rangeCache = {};
  function _inR(c1, c2, str) {
    if (!str) return false;
    var set = _rangeCache[str] || (_rangeCache[str] = Range.parse(str));
    return set.has(Range.handClass(c1, c2));
  }
  function _castName(type) {
    if (typeof CAST !== 'undefined' && Array.isArray(CAST)) {
      for (var i = 0; i < CAST.length; i++) if (CAST[i] && CAST[i].type === type) return CAST[i].name;
    }
    return { TAG: '교수', LAG: '불도저', Fish: '햇살', Nit: '바위', Mixed: '카멜레온', Station: '콜마스터' }[type] || type;
  }
  // 이 유형이 그 자리에서 플레이하는 손(오픈 또는 오픈 콜 레인지)인가: 실전에 나올 법한 손만 낸다
  function _plays(type, pos, c1, c2) {
    var P = VillainProfiles[type === 'Mixed' ? 'TAG' : type];
    if (!P) return false;
    return (pos !== 'BB' && _inR(c1, c2, (P.rfi || {})[pos])) || _inR(c1, c2, (P.call_vs_raise || {})[pos]) || _inR(c1, c2, P.threebet_range);
  }

  // q.data → GameState 모양 상태(생성과 verify가 같이 쓴다. 판정 대상 빌런 1명 + 히어로)
  function _intentState(d) {
    var name = d.name;
    var hole = d.hole.map(_card), board = d.board.map(_card);
    var players = {}; players[name] = { name: name, type: d.vtype, pos: d.pos, holeCards: hole };
    var holeCards = {}; holeCards[name] = hole;
    var stacks = {}; stacks[name] = 100; stacks.Hero = 100;
    var bets = {}; bets[name] = d.have; bets.Hero = d.heroBet;
    return {
      street: d.street, board: board, pot: d.pot, currentBet: d.currentBet, playerBets: bets, stacks: stacks, bigBlind: 1,
      streetBetCount: d.sbc, lastRaiseSize: Math.max(1, d.currentBet - d.have), reopened: true, lastRaiser: d.sbc > 0 ? 'Hero' : null,
      pfAggressor: d.pfAgg, players: players, holeCards: holeCards, names: ['Hero', name], folded: {}, handNum: d.hand, seed: d.seed
    };
  }
  // 상황 만들기: 프리플랍(먼저 들어감 | 오픈 직면), 포스트플랍(체크로 넘어옴 | 내 벳 직면)
  function _situation(rnd, street, pos) {
    if (street === 'preflop') {
      // BB는 먼저 들어갈 일이 없고(모두 폴드면 핸드 끝), UTG는 앞에 오픈이 있을 수 없다
      var facing = pos === 'BB' ? true : pos === 'UTG' ? false : rnd() < 0.5;
      if (!facing) return { kind: 'first', pot: 1.5, currentBet: 1, have: pos === 'SB' ? 0.5 : 0, heroBet: 0, sbc: 0, pfAgg: null };
      var have = pos === 'SB' ? 0.5 : pos === 'BB' ? 1 : 0;
      return { kind: 'open', pot: 4, currentBet: 2.5, have: have, heroBet: 2.5, sbc: 1, pfAgg: null };
    }
    var potBefore = Math.round(_between(rnd, 5, 40) * 2) / 2;
    if (rnd() < 0.5) {
      var cbet = street === 'flop' && rnd() < 0.5;
      return { kind: cbet ? 'cbet' : 'checked', pot: potBefore, currentBet: 0, have: 0, heroBet: 0, sbc: 0, pfAgg: cbet ? 'V' : 'Hero' };
    }
    var bet = Math.round(potBefore * _pick(rnd, [0.33, 0.5, 0.67, 1]) * 2) / 2;
    return { kind: 'facing', pot: potBefore + bet, currentBet: bet, have: 0, heroBet: bet, sbc: 1, pfAgg: 'Hero', bet: bet, potBefore: potBefore };
  }
  function _situationText(d) {
    if (d.kind === 'first') return '앞이 모두 폴드한 ' + d.pos;
    if (d.kind === 'open') return '내 오픈 2.5bb를 맞은 ' + d.pos;
    if (d.kind === 'cbet') return '프리플랍 레이저라 c벳할 수 있는 자리(팟 ' + d.pot + 'bb)';
    if (d.kind === 'checked') return '내가 체크로 넘긴 자리(팟 ' + d.pot + 'bb)';
    return '내가 ' + d.bet + 'bb 벳(팟은 내 벳 포함 ' + d.pot + 'bb)';
  }
  function _withSeeded(rnd, fn) {
    var M = Math, orig = M.random;
    M.random = rnd;
    try { return fn(); } finally { M.random = orig; }
  }

  // 의도 분포가 '팟 오즈 콜'에 쏠리므로(엔진 빌런은 콜이 많다) 목표 의도 7개 중 하나를 먼저 고르고 맞을 때까지 다시 뽑는다.
  // 드문 의도(함정, 세미블러프)는 못 맞출 때가 있다. 그러면 처음 나온 의도를 받는다
  var TARGETS = INTENTS;
  var TARGET_TRIES = 100;
  function intentNext(rnd, opts) {
    rnd = _rng(rnd); opts = opts || {};
    if (!_intentReady()) return null;
    var target = INTENTS.indexOf(opts.target) >= 0 ? opts.target : (opts.target === null ? null : _pick(rnd, TARGETS));
    var any = null;
    for (var t = 0; t < TARGET_TRIES; t++) {
      var vtype = INTENT_TYPES.indexOf(opts.vtype) >= 0 ? opts.vtype : _pick(rnd, INTENT_TYPES);
      var x = rnd(), acc = 0, street = 'flop';
      for (var i = 0; i < STREETS.length; i++) { acc += STREETS[i][1]; if (x < acc) { street = STREETS[i][0]; break; } }
      if (opts.street && STREET_KOR[opts.street]) street = opts.street;
      var pos = _pick(rnd, POS6);
      var deck = _shuffle(rnd, _deck());
      var hole = deck.slice(0, 2), nb = { preflop: 0, flop: 3, turn: 4, river: 5 }[street];
      if (RANKS.indexOf(hole[0].charAt(0)) < RANKS.indexOf(hole[1].charAt(0))) hole = [hole[1], hole[0]];   // 높은 카드 먼저(표시)
      if (!_plays(vtype, pos, _card(hole[0]), _card(hole[1]))) continue;
      var board = deck.slice(2, 2 + nb);
      var sit = _situation(rnd, street, pos);
      var name = _castName(vtype);
      var d = { vtype: vtype, name: name, pos: pos, street: street, hole: hole, board: board, kind: sit.kind,
        pot: sit.pot, currentBet: sit.currentBet, have: sit.have, heroBet: sit.heroBet, sbc: sit.sbc,
        pfAgg: sit.pfAgg === 'V' ? name : sit.pfAgg, hand: 1 + _int(rnd, 999), seed: 1 + _int(rnd, 999999) };
      if (sit.kind === 'facing') { d.bet = sit.bet; d.potBefore = sit.potBefore; }
      var st = _intentState(d);
      var villain = st.players[name];
      var act = _withSeeded(rnd, function() { return Villain.getAction(villain, st); });
      if (!act || !ACT_KOR[act.action] || act.action === 'fold') continue;
      d.action = act.action; d.amount = act.amount; d.label = act.label || null;
      var th = Thinking.villainThought(_intentState(d), name, d.action, d.amount, { label: d.label });
      if (!th || INTENTS.indexOf(th.intent) < 0) continue;
      if (!target || th.intent === target) return _intentBuild(rnd, d, th);
      if (!any) any = { d: d, th: th };
    }
    return any ? _intentBuild(rnd, any.d, any.th) : null;
  }
  // 그 액션으로 나올 수 있는 의도(게임 중 맞히기와 같은 묶음) + 다른 의도로 4개를 채운다. 보기 순서는 INTENTS 순서
  function _intentOptions(rnd, action, street, answer) {
    var aggro = action === 'bet' || action === 'raise' || action === '3bet' || action === 'allin';
    var base = aggro ? ['value', 'bluff', 'semibluff'] : action === 'call' ? ['trap', 'call-odds'] : ['trap', 'pot-control', 'give-up'];
    if (street === 'river') base = base.filter(function(k) { return k !== 'semibluff'; });   // 리버는 다음 카드가 없다
    if (base.indexOf(answer) < 0) base.push(answer);
    var rest = _shuffle(rnd, INTENTS.filter(function(k) { return base.indexOf(k) < 0; }));
    while (base.length < 4 && rest.length) base.push(rest.shift());
    return INTENTS.filter(function(k) { return base.indexOf(k) >= 0; });
  }
  function _intentBuild(rnd, d, th) {
    var ids = _intentOptions(rnd, d.action, d.street, th.intent);
    var hole = d.hole.map(_card);
    var handTxt = (typeof Thinking.comboText === 'function') ? Thinking.comboText(Range.handClass(hole[0], hole[1]), hole) : d.hole.join(' ');
    var act = d.label === '올인' ? '올인' : ACT_KOR[d.action];
    var scene = { range: { label: d.name + '의 손', text: handTxt }, note: STREET_KOR[d.street] + ', ' + _situationText(d) };
    if (d.board.length) scene.board = d.board.slice();
    return {
      type: 'intent', key: null, concept: 'read', difficulty: null, confidence: 'approx', appDef: false, rated: false, srs: 'once',
      prompt: d.name + '(' + d.vtype + ')의 ' + act + '. 이 캐릭터의 속마음(의도)은?\n카드는 모두 공개, 정답은 이 캐릭터의 생각',
      scene: scene,
      options: ids.map(function(k) { return { id: k, label: _intentLabel(k) }; }),
      answer: th.intent,
      data: d
    };
  }
  function intentVerify(q) {
    try {
      if (!q || q.type !== 'intent' || q.confidence !== 'approx' || q.rated !== false || q.srs !== 'once' || q.key != null) return false;
      if (!_intentReady()) return false;
      var d = q.data;
      if (!d || INTENT_TYPES.indexOf(d.vtype) < 0 || POS6.indexOf(d.pos) < 0 || !STREET_KOR[d.street]) return false;
      if (!Array.isArray(d.hole) || d.hole.length !== 2 || !Array.isArray(d.board)) return false;
      var nb = { preflop: 0, flop: 3, turn: 4, river: 5 }[d.street];
      if (d.board.length !== nb) return false;
      var all = d.hole.concat(d.board), seen = {};
      for (var i = 0; i < all.length; i++) { if (!CARD_RE.test(all[i]) || seen[all[i]]) return false; seen[all[i]] = 1; }
      if (d.action === 'fold' || !ACT_KOR[d.action]) return false;
      // 액션이 상황에 맞는가(벳 직면이면 콜이나 레이즈, 아니면 벳이나 체크, 프리플랍 먼저 들어가면 레이즈, 림프, 체크)
      var toCall = Math.max(0, d.currentBet - d.have);
      var aggro = d.action === 'bet' || d.action === 'raise' || d.action === '3bet' || d.action === 'allin';
      if (d.street !== 'preflop') {
        if (toCall > 0 && !(d.action === 'call' || aggro)) return false;
        if (toCall === 0 && !(d.action === 'check' || aggro)) return false;
      }
      var ids = (q.options || []).map(function(o) { return o && o.id; });
      if (ids.length < 4 || ids.length > 6 || ids.indexOf(q.answer) < 0) return false;
      for (var k = 0; k < ids.length; k++) if (INTENTS.indexOf(ids[k]) < 0 || ids.indexOf(ids[k]) !== k) return false;
      // 상태를 q.data로 새로 만들어 속마음을 다시 계산한다
      var th = Thinking.villainThought(_intentState(d), d.name, d.action, d.amount, { label: d.label });
      return !!th && th.intent === q.answer;
    } catch (e) { return false; }
  }
  function intentExplain(q) {
    if (!q || !q.data || !_intentReady()) return { line: '' };
    var d = q.data;
    var th = Thinking.villainThought(_intentState(d), d.name, d.action, d.amount, { label: d.label });
    var hole = d.hole.map(_card), board = d.board.map(_card);
    var how;
    if (d.street === 'preflop') how = '손 등급 ' + (GRADE_KOR[Thinking.preflopGrade(hole)] || '');
    else how = '손 세기 ' + (STRENGTH_KOR[Thinking.strength(hole, board)] || '');
    var act = d.label === '올인' ? '올인' : ACT_KOR[d.action];
    return { line: (th ? th.text : '') + '\n' + act + ', ' + how + ' → ' + _intentLabel(q.answer) + '. 캐릭터의 생각이라 정답이 아니에요(판독 연습)', scene: q.scene };
  }

  // ═══════════════════ 등록 ═══════════════════
  var gens = {
    hudread: { title: '📟 HUD 읽기', next: hudreadNext, verify: hudreadVerify, explain: hudreadExplain, fromKey: hudreadFromKey,
      ready: function() { return true; } },
    prescribe: { title: '💊 유형별 처방', next: prescribeNext, verify: prescribeVerify, explain: prescribeExplain,
      fromKey: function() { return null; }, ready: function() { return true; } },
    intent: { title: '💭 속마음 읽기', next: intentNext, verify: intentVerify, explain: intentExplain,
      fromKey: function() { return null; }, ready: _intentReady }
  };
  var internals = {
    CLASSES: CLASSES, LABEL: LABEL, SHORT: SHORT, MARGIN: MARGIN, SHAPE: SHAPE, N_LIST: N_LIST, RX: RX, RX_IDS: RX_IDS, SPOTS: SPOTS,
    RX_VARIANTS: RX_VARIANTS, CAST_TYPES: CAST_TYPES, INTENTS: INTENTS, INTENT_TYPES: INTENT_TYPES,
    rule: _rule, classGen: _classGen, classIndep: _classIndep, stable: _stable, nearest: _nearest, dataOk: _dataOk, hudLine: _hudLine,
    intentState: _intentState, intentOptions: _intentOptions, intentGen: gens.intent
  };
  Object.keys(gens).forEach(function(k) { gens[k]._ = internals; });

  // meta: C1 {stage, group, concept}. 나머지는 부록 C(TYPE_META)와 같은 값을 참고로 함께 둔다
  var META = {
    hudread: { stage: 6, group: 'other', concept: 'read', confidence: 'exact', appDef: true, rated: false, srs: 'srs', base: 2200 },
    prescribe: { stage: 6, group: 'other', concept: 'read', confidence: 'approx', appDef: false, rated: false, srs: 'once', base: null },
    intent: { stage: 6, group: 'other', concept: 'read', confidence: 'approx', appDef: false, rated: false, srs: 'once', base: null }
  };
  var REGISTER_INTENT = true;    // 위 머리 주석 intent 줄(M6 통합 검증에서 등록)
  if (typeof Puzzles !== 'undefined' && Puzzles && typeof Puzzles.register === 'function') {
    Object.keys(gens).forEach(function(k) { if (k !== 'intent' || REGISTER_INTENT) Puzzles.register(k, gens[k], META[k]); });
  }
  if (typeof module !== 'undefined' && module) module.exports = { gens: gens, META: META };
})();
