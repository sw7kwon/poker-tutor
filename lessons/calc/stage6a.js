// lessons/calc/stage6a.js (채우는 그룹: M6-L56, s6-01~03)
// 레슨 calc 등록부(계약 L9, lessons/lesson-core.js 머리 주석)에 LessonCore.defineCalc로 등록할 유형(계약 H13, docs/JOURNEY_ROADMAP.md M6).
// 새 유형 이름은 그룹 접두 's56'로 시작한다(예 's56Hud'). M5 등록 유형(stage3a~4b)은 읽기 전용으로 써도 된다.
// 입력에 pot 필드 금지(potBefore = 벳 전 팟, potTotal = 상대 벳 포함 팟), 퍼센트 변수는 정수 반올림.
// verify는 calc 코드를 부르지 않는 독립 경로, cases는 손으로 확인한 값 2개 이상. 유형별 입력, 변수, main은 이 머리 주석에 적는다.
//
// 이 파일이 등록하는 유형 3개:
//
// s56Hud {vpip, pfr, n} (main 'cls', 칩 'appdef' = 이 앱의 분류 기준, 설계서 8.2절 3번)
//   HUD 4분류(로드맵 M6 계약 H4, 트래커, hudread, 레슨, 보스 공통 규칙). vpip, pfr = HUD 퍼센트(0~100, pfr ≤ vpip), n = 관찰 핸드 수.
//   이 순서로: 'tight'(VPIP ≤ 10), 'loose-passive'(VPIP ≥ 20이고 PFR ÷ VPIP < 0.35), 'loose-aggr'(VPIP ≥ 18이고 PFR ÷ VPIP ≥ 0.6),
//   'standard'(나머지). n < 15면 'unknown'(H4의 null, 아직 모름). 임계는 엔진 빌런 실측에 맞춘 값(로드맵 결정 21, ai/villain-tracker.js RULE0).
//   → cls, clsKo('🧊 타이트' | '⚖ 정석' | '🔥 루즈-공격' | '🐟 루즈-패시브' | '❔ 아직 모름'), vpip, pfr, n,
//     ratio(PFR ÷ VPIP 소수 둘째 자리 문자열, '0.15', VPIP 0이면 '0.00'), gap(= vpip - pfr).
//   calc: H4의 if 순서. VillainTracker.classify(H4, M6-READ 구현)가 있으면 그것으로 분류한다(머지 뒤에는 트래커와 레슨이
//     같은 함수를 쓰고, 계약과 다르면 j-lessons가 verify와의 불일치로 잡는다). 없으면 이 파일의 if 순서.
//   verify: 비율을 곱셈 비교(100 x PFR < 35 x VPIP, 10 x PFR ≥ 6 x VPIP)로 바꾼 판정 표.
//   qNums = [vpip, pfr, n].
//
// s56Af {bets, raises, calls} (main 'af', 칩 'exact')
//   AF(공격성 지수) = 포스트플랍 (벳 + 레이즈) ÷ 콜, 소수 첫째 자리 숫자(2.5). 콜이 0이면 벳 + 레이즈를 그대로 쓴다
//   (ai/villain-tracker.js stats, data/glossary.js AF와 같은 정의). 입력은 0 이상의 정수 횟수.
//   → af, aggr(= 벳 + 레이즈), bets, raises, calls(입력 그대로).
//   calc: 나눗셈 뒤 Math.round(x 10) ÷ 10. verify: 정수 산술 반올림 floor((20 aggr + calls) ÷ (2 calls)) ÷ 10.
//   qNums = [bets, raises, calls].
//
// s56Se {p, n, ns?:[핸드 수 1~4개]} (main 'moe', 칩 'exact')
//   관찰한 VPIP p%(1~99)를 n핸드에서 봤을 때의 표준오차와 95% 범위(s6-01 표본 크기 표, s6-02 누적 관찰).
//   표준오차 SE = √(p(1 - p) ÷ n)(이항 비율, p는 0~1로 계산, 화면은 %p), 95% 범위 = p ± 1.96 x SE.
//   → p, n, ci(= 95, 문장의 '95% 범위'를 템플릿으로 쓰려고 내는 상수), se(SE %p를 소수 첫째 자리 문자열, '7.9'), moe(= round(1.96 x SE), %p 정수), lo(= max(0, p - moe)), hi(= min(100, p + moe)),
//     ns가 있으면 핸드 수 k마다 se<k>, moe<k>, lo<k>, hi<k>(예 se30, moe1000).
//   calc: 0~1 비율로 SE를 구한 뒤 x 100. verify: 퍼센트 그대로 √(p(100 - p) ÷ n), se는 √(100 p(100 - p) ÷ n)을 반올림해 ÷ 10,
//     moe는 √(1.96² p(100 - p) ÷ n) 반올림(다른 식 형태).
//   qNums = [p, n].
//
// 로드 때 LessonCore가 없으면 아무것도 하지 않는다. DOM, window, localStorage에 손대지 않는다. VillainTracker는 호출 때 typeof 가드.
(function() {
  var LC = (typeof LessonCore !== 'undefined' && LessonCore) ? LessonCore : null;
  if (!LC || typeof LC.defineCalc !== 'function') return;

  var KO = { tight: '🧊 타이트', standard: '⚖ 정석', 'loose-aggr': '🔥 루즈-공격', 'loose-passive': '🐟 루즈-패시브', unknown: '❔ 아직 모름' };
  var MIN_N = 15;

  function _fin(x) { return typeof x === 'number' && isFinite(x); }
  function _int(x) { return _fin(x) && Math.floor(x) === x; }

  // ── s56Hud ────────────────────────────────────────────
  function _hudIn(c) {
    if (!_fin(c.vpip) || c.vpip < 0 || c.vpip > 100) return { error: 's56Hud vpip는 0~100 숫자예요' };
    if (!_fin(c.pfr) || c.pfr < 0 || c.pfr > c.vpip) return { error: 's56Hud pfr는 0 이상 vpip 이하 숫자예요' };
    if (!_int(c.n) || c.n < 0) return { error: 's56Hud n(관찰 핸드 수)은 0 이상의 정수예요' };
    return {};
  }
  function _two(x) { return (Math.round(x * 100) / 100).toFixed(2); }

  function hudCalc(c) {
    var h = _hudIn(c);
    if (h.error) return h;
    var v = c.vpip, p = c.pfr, cls = null;
    var VT = (typeof VillainTracker !== 'undefined' && VillainTracker && typeof VillainTracker.classify === 'function') ? VillainTracker : null;
    if (VT) {
      var got = VT.classify({ vpip: v, pfr: p, n: c.n });
      cls = got == null ? 'unknown' : String(got);
      if (!Object.prototype.hasOwnProperty.call(KO, cls)) return { error: 'VillainTracker.classify가 4분류 밖 값을 냈어요: ' + cls };
    } else if (c.n < MIN_N) cls = 'unknown';
    else {
      var ratio = v > 0 ? p / v : 0;
      if (v <= 10) cls = 'tight';
      else if (v >= 20 && ratio < 0.35) cls = 'loose-passive';
      else if (v >= 18 && ratio >= 0.6) cls = 'loose-aggr';
      else cls = 'standard';
    }
    return { cls: cls, clsKo: KO[cls], vpip: v, pfr: p, n: c.n, ratio: _two(v > 0 ? p / v : 0), gap: Math.round((v - p) * 100) / 100 };
  }

  function hudVerify(c) {
    var h = _hudIn(c);
    if (h.error) return h;
    var v = c.vpip, p = c.pfr;
    // 판정 표: [조건, 분류] 중 처음 맞는 것(H4 순서), n이 모자라면 맨 앞에서 아직 모름
    var table = [
      [c.n < MIN_N, 'unknown'],
      [v <= 10, 'tight'],
      [v >= 20 && 100 * p < 35 * v, 'loose-passive'],
      [v >= 18 && 10 * p >= 6 * v, 'loose-aggr'],
      [true, 'standard']
    ];
    var cls = table.filter(function(row) { return row[0]; })[0][1];
    // PFR ÷ VPIP 소수 둘째 자리: 정수 산술 반올림(vpip, pfr가 소수 둘째 자리까지라고 보고 100배)
    var V = Math.round(v * 100), P = Math.round(p * 100);
    var r100 = V > 0 ? Math.floor((200 * P + V) / (2 * V)) : 0;
    var ratio = Math.floor(r100 / 100) + '.' + ('0' + (r100 % 100)).slice(-2);
    return { cls: cls, clsKo: KO[cls], vpip: v, pfr: p, n: c.n, ratio: ratio, gap: (V - P) / 100 };
  }

  // ── s56Af ─────────────────────────────────────────────
  function _afIn(c) {
    var ok = [c.bets, c.raises, c.calls].every(function(x) { return _int(x) && x >= 0; });
    return ok ? {} : { error: 's56Af bets, raises, calls는 셋 다 0 이상의 정수(포스트플랍 횟수)예요' };
  }
  function afCalc(c) {
    var e = _afIn(c);
    if (e.error) return e;
    var aggr = c.bets + c.raises;
    return { af: c.calls ? Math.round(aggr / c.calls * 10) / 10 : aggr, aggr: aggr, bets: c.bets, raises: c.raises, calls: c.calls };
  }
  function afVerify(c) {
    var e = _afIn(c);
    if (e.error) return e;
    var a = c.raises + c.bets, k = c.calls;
    return { af: k > 0 ? Math.floor((20 * a + k) / (2 * k)) / 10 : a, aggr: a, bets: c.bets, raises: c.raises, calls: k };
  }

  // ── s56Se ─────────────────────────────────────────────
  function _seIn(c) {
    if (!_int(c.p) || c.p < 1 || c.p > 99) return { error: 's56Se p는 1~99 정수(관찰한 VPIP %)예요' };
    if (!_int(c.n) || c.n < 1) return { error: 's56Se n은 1 이상의 정수(핸드 수)예요' };
    var ns = c.ns == null ? [] : c.ns;
    if (!Array.isArray(ns) || ns.length > 4) return { error: 's56Se ns는 핸드 수 배열(최대 4개)이에요' };
    for (var i = 0; i < ns.length; i++) {
      if (!_int(ns[i]) || ns[i] < 1) return { error: 's56Se ns의 핸드 수는 1 이상의 정수예요: ' + ns[i] };
      if (ns.indexOf(ns[i]) !== i) return { error: 's56Se ns에 같은 핸드 수가 두 번 나와요: ' + ns[i] };
    }
    return { ns: ns };
  }
  function seCalc(c) {
    var s = _seIn(c);
    if (s.error) return s;
    var f = c.p / 100;
    function one(n) {
      var se = Math.sqrt(f * (1 - f) / n) * 100;
      var moe = Math.round(1.96 * se);
      return { se: (Math.round(se * 10) / 10).toFixed(1), moe: moe, lo: Math.max(0, c.p - moe), hi: Math.min(100, c.p + moe) };
    }
    var base = one(c.n), out = { p: c.p, n: c.n, ci: 95, se: base.se, moe: base.moe, lo: base.lo, hi: base.hi };
    s.ns.forEach(function(n) {
      var r = one(n);
      out['se' + n] = r.se; out['moe' + n] = r.moe; out['lo' + n] = r.lo; out['hi' + n] = r.hi;
    });
    return out;
  }
  function seVerify(c) {
    var s = _seIn(c);
    if (s.error) return s;
    var p = c.p, q = 100 - c.p;
    function row(n) {
      var se10 = Math.round(Math.sqrt(100 * p * q / n));          // SE x 10(%p)
      var moe = Math.round(Math.sqrt(1.96 * 1.96 * p * q / n));   // 1.96 x SE(%p)
      return { se: Math.floor(se10 / 10) + '.' + (se10 % 10), moe: moe, lo: p - moe < 0 ? 0 : p - moe, hi: p + moe > 100 ? 100 : p + moe };
    }
    var out = {}, base = row(c.n);
    out.p = p; out.n = c.n; out.ci = Math.round(100 * 0.95); out.se = base.se; out.moe = base.moe; out.lo = base.lo; out.hi = base.hi;
    for (var i = 0; i < s.ns.length; i++) {
      var k = s.ns[i], r = row(k);
      out['se' + k] = r.se; out['moe' + k] = r.moe; out['lo' + k] = r.lo; out['hi' + k] = r.hi;
    }
    return out;
  }

  var ok = [];
  ok.push(LC.defineCalc('s56Hud', {
    calc: hudCalc, verify: hudVerify, main: 'cls', chip: 'appdef',
    // 손으로 확인한 값(H4, 재보정 임계 10/20/18): VPIP 55, PFR 8 → 55 ≥ 20이고 8 ÷ 55 = 0.145 < 0.35 → 루즈-패시브.
    //   VPIP 34, PFR 26 → 34 > 10, 26 ÷ 34 = 0.765(0.35 이상이라 루즈-패시브 아님), 34 ≥ 18이고 0.765 ≥ 0.6 → 루즈-공격.
    //   VPIP 6, PFR 5 → 6 ≤ 10 → 타이트. VPIP 14, PFR 12 → 10 초과, 20 미만, 18 미만 → 어느 조건도 아님 → 정석.
    //   VPIP 45, PFR 20 → 20 ÷ 45 = 0.44(0.35 이상, 0.6 미만) → 정석(H4 순서 그대로). VPIP 16, PFR 2 → 20 미만이라 루즈-패시브 아님 → 정석.
    //   10핸드 → 아직 모름.
    cases: [
      { c: { vpip: 55, pfr: 8, n: 120 }, want: { cls: 'loose-passive', clsKo: '🐟 루즈-패시브', ratio: '0.15', gap: 47 } },
      { c: { vpip: 34, pfr: 26, n: 150 }, want: { cls: 'loose-aggr', ratio: '0.76' } },
      { c: { vpip: 6, pfr: 5, n: 200 }, want: { cls: 'tight', clsKo: '🧊 타이트' } },
      { c: { vpip: 14, pfr: 12, n: 80 }, want: { cls: 'standard', clsKo: '⚖ 정석', ratio: '0.86' } },
      { c: { vpip: 45, pfr: 20, n: 60 }, want: { cls: 'standard' } },
      { c: { vpip: 16, pfr: 2, n: 60 }, want: { cls: 'standard' } },
      { c: { vpip: 60, pfr: 5, n: 10 }, want: { cls: 'unknown', clsKo: '❔ 아직 모름' } }
    ],
    qNums: function(c) { return [c.vpip, c.pfr, c.n]; }
  }));
  ok.push(LC.defineCalc('s56Af', {
    calc: afCalc, verify: afVerify, main: 'af', chip: 'exact',
    // 손으로 확인한 값: 벳 30 + 레이즈 10 = 40, 콜 16 → 40 ÷ 16 = 2.5. 벳 12 + 레이즈 2 = 14, 콜 20 → 0.7.
    //   벳 7 + 레이즈 3 = 10, 콜 3 → 3.33 → 3.3. 콜 0이면 벳 + 레이즈 그대로(3 + 1 = 4).
    cases: [
      { c: { bets: 30, raises: 10, calls: 16 }, want: { af: 2.5, aggr: 40, calls: 16 } },
      { c: { bets: 12, raises: 2, calls: 20 }, want: { af: 0.7, aggr: 14 } },
      { c: { bets: 7, raises: 3, calls: 3 }, want: { af: 3.3 } },
      { c: { bets: 3, raises: 1, calls: 0 }, want: { af: 4, aggr: 4 } }
    ],
    qNums: function(c) { return [c.bets, c.raises, c.calls]; }
  }));
  ok.push(LC.defineCalc('s56Se', {
    calc: seCalc, verify: seVerify, main: 'moe', chip: 'exact',
    // 손으로 확인한 값(p = 25%): 25 x 75 = 1875. 30핸드 √(1875 ÷ 30) = √62.5 = 7.91 → se 7.9, 1.96 x 7.91 = 15.5(15.495) → moe 15, 범위 10~40.
    //   100핸드 √18.75 = 4.33 → 4.3, x 1.96 = 8.49 → 8. 300핸드 √6.25 = 2.5 → 2.5, x 1.96 = 4.9 → 5. 1000핸드 √1.875 = 1.37 → 1.4, x 1.96 = 2.68 → 3.
    //   p = 30%, 40핸드: √(2100 ÷ 40) = √52.5 = 7.25 → 7.2, x 1.96 = 14.2 → 14, 범위 16~44.
    cases: [
      { c: { p: 25, n: 30, ns: [30, 100, 300, 1000] },
        want: { ci: 95, se: '7.9', moe: 15, lo: 10, hi: 40, se30: '7.9', se100: '4.3', se300: '2.5', se1000: '1.4', moe100: 8, moe300: 5, moe1000: 3, lo1000: 22, hi1000: 28 } },
      { c: { p: 30, n: 40 }, want: { se: '7.2', moe: 14, lo: 16, hi: 44 } },
      { c: { p: 47, n: 50 }, want: { moe: 14, lo: 33, hi: 61 } }
    ],
    qNums: function(c) { return [c.p, c.n]; }
  }));
  if (ok.indexOf(false) >= 0 && typeof console !== 'undefined' && console.warn) {
    console.warn('[lessons/calc/stage6a] 등록 실패: ' + ['s56Hud', 's56Af', 's56Se'].filter(function(t, i) { return !ok[i]; }).join(', '));
  }
})();
