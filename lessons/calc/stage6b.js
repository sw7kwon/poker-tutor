// lessons/calc/stage6b.js (채우는 그룹: M6-L6B, s6-04~08)
// 레슨 calc 등록부(계약 L9, lessons/lesson-core.js 머리 주석)에 LessonCore.defineCalc로 등록하는 유형(계약 H13, docs/JOURNEY_ROADMAP.md M6).
// 이름은 그룹 접두 's6b'. 입력에 pot 필드는 쓰지 않는다. 퍼센트 변수는 정수(conf 95), bb 값은 정수 반올림, bb/100과 '만 핸드'는 소수 첫째 자리.
// verify는 calc 코드를 부르지 않는 독립 경로다(tests/j-lessons.test.js가 장면마다 calc와 verify의 공통 변수를 대조한다).
//
//   s6bVariance {winrate(bb/100, -100~100), hands(100 이상 정수), sd?(bb/100, 기본 90 = 이 앱 가정)}
//     같은 실력(승률 winrate)으로 hands 핸드를 쳤을 때 총 결과가 95% 확률로 들어올 구간(설계서 부록 A 57번, 4.7절 6번).
//     식은 GenMath.varianceBand(w, N)와 같다(puzzles/gen-math.js, 퍼즐 variance, 표준편차 90bb/100 고정):
//       가운데 = w x N ÷ 100, 반폭 = 1.96 x SD x √(N ÷ 100), 구간 = 가운데 ± 반폭.
//       100핸드당(bb/100) 반폭 = 1.96 x SD ÷ √(N ÷ 100)(위젯 varianceCone과 같은 식, 계약 H1).
//     → winrate, hands, sd, conf(95), center(가운데 bb, 소수 둘째 자리), half(반폭 bb, 정수 반올림),
//       lo, hi(구간 끝 bb, 가운데 ∓ 반폭의 정확값을 정수 반올림. GenMath 라벨 _signed와 같은 반올림),
//       rateHalf, rateLo, rateHi(bb/100 구간, 소수 첫째 자리), half4(핸드가 4배일 때 반폭, 정수),
//       handsKo, hands4Ko(화면용 핸드 수 글자: 1만 단위면 '1만', 아니면 쉼표 '2,500'),
//       sureMan(winrate > 0일 때만: 구간 아래 끝(가운데 - 반폭)이 0이 되는 핸드 수 ÷ 1만, 소수 첫째 자리.
//         그보다 많이 치면 95% 구간이 통째로 플러스가 된다). main 'half'.
//     verify: GenMath.varianceBand(w, N)(다른 엔진 함수)의 가운데와 반폭을 쓰고 sd가 90이 아니면 반폭을 sd ÷ 90배
//       (로드맵 M6 결정 7번). GenMath가 없으면 100핸드 묶음 N ÷ 100개의 분산 합(SD² x 묶음 수)의 제곱근 x 1.96.
//       bb/100은 총 반폭 ÷ 묶음 수, sureMan은 가운데 - 반폭 = 0을 이분 탐색으로 푼다(calc는 닫힌 식).
//     qNums: [winrate, hands, sd(없으면 90)](질문 문장에 승률, 핸드 수, 표준편차 가정이 모두 나와야 한다).
// 로드 때 LessonCore가 있으면 등록만 한다(DOM, window, localStorage 접근 없음). GenMath는 호출 때 typeof 가드.
(function() {
  var Z = 1.96, CONF = 95, SD0 = 90;

  function _fin(x) { return typeof x === 'number' && isFinite(x); }
  function _r1(x) { var v = Math.round(x * 10) / 10; return v === 0 ? 0 : v; }
  function _r0(x) { var v = Math.round(x); return v === 0 ? 0 : v; }
  function _bb(x) { var v = Math.round(x * 100) / 100; return v === 0 ? 0 : v; }
  // 화면용 핸드 수: 1만 단위면 '3만', 아니면 세 자리 쉼표
  function _handsKo(n) {
    if (n % 10000 === 0) return (n / 10000) + '만';
    var s = String(n), out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return s + out;
  }
  // 입력 검사(calc와 verify 공용 아님: verify는 아래에서 따로 본다)
  function _input(c) {
    if (!_fin(c.winrate) || Math.abs(c.winrate) > 100) return { error: 's6bVariance winrate는 -100~100 숫자(bb/100)예요' };
    if (!_fin(c.hands) || c.hands < 100 || c.hands > 10000000 || Math.floor(c.hands) !== c.hands) return { error: 's6bVariance hands는 100 이상의 정수예요' };
    var sd = c.sd == null ? SD0 : c.sd;
    if (!_fin(sd) || !(sd > 0) || sd > 500) return { error: 's6bVariance sd는 0보다 크고 500 이하예요(bb/100)' };
    return { w: c.winrate, n: c.hands, sd: sd };
  }

  var variance = {
    main: 'half',
    calc: function varianceCalc(c) {
      var p = _input(c);
      if (p.error) return p;
      var blocks = p.n / 100;
      var center = p.w * p.n / 100, half = Z * p.sd * Math.sqrt(blocks), rate = Z * p.sd / Math.sqrt(blocks);
      var out = {
        winrate: p.w, hands: p.n, sd: p.sd, conf: CONF,
        center: _bb(center), half: _r0(half), lo: _r0(center - half), hi: _r0(center + half),
        rateHalf: _r1(rate), rateLo: _r1(p.w - rate), rateHi: _r1(p.w + rate),
        half4: _r0(Z * p.sd * Math.sqrt(4 * blocks)), handsKo: _handsKo(p.n), hands4Ko: _handsKo(4 * p.n)
      };
      if (p.w > 0) out.sureMan = _r1(100 * Math.pow(Z * p.sd / p.w, 2) / 10000);
      return out;
    },
    // 독립 경로: GenMath.varianceBand(엔진 퍼즐 함수) 또는 100핸드 묶음 분산 합, sureMan은 이분 탐색
    verify: function(c) {
      var w = c.winrate, n = c.hands, sd = (c.sd == null) ? SD0 : c.sd;
      if (typeof w !== 'number' || !isFinite(w) || w < -100 || w > 100) return { error: 'winrate' };
      if (typeof n !== 'number' || !isFinite(n) || n < 100 || n > 10000000 || n % 1 !== 0) return { error: 'hands' };
      if (typeof sd !== 'number' || !isFinite(sd) || sd <= 0 || sd > 500) return { error: 'sd' };
      var GM = (typeof GenMath !== 'undefined' && GenMath && typeof GenMath.varianceBand === 'function') ? GenMath : null;
      function band(N) {
        if (GM) { var b = GM.varianceBand(w, N); return { center: b.center, half: b.half * sd / SD0 }; }
        var k = N / 100, varSum = 0;
        varSum = sd * sd * k;                               // 묶음마다 분산 SD²(100핸드 단위), 독립 묶음 k개의 합
        return { center: w * k, half: 1.96 * Math.sqrt(varSum) };
      }
      var b0 = band(n), b4 = band(4 * n);
      var rate = b0.half / (n / 100);
      var r1 = function(x) { var v = Math.round(x * 10) / 10; return v === 0 ? 0 : v; };
      var r0 = function(x) { var v = Math.round(x); return v === 0 ? 0 : v; };
      var ko = function(x) { return x % 10000 === 0 ? (x / 10000) + '만' : String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
      var out = {
        winrate: w, hands: n, sd: sd, conf: 95,
        center: Math.round(b0.center * 100) / 100, half: r0(b0.half), lo: r0(b0.center - b0.half), hi: r0(b0.center + b0.half),
        rateHalf: r1(rate), rateLo: r1(w - rate), rateHi: r1(w + rate),
        half4: r0(b4.half), handsKo: ko(n), hands4Ko: ko(4 * n)
      };
      if (w > 0) {
        // 가운데 - 반폭은 핸드가 늘수록(충분히 크면) 커진다. 0이 되는 핸드 수를 이분 탐색
        var lo = 1, hi = 1;
        while (band(hi).center - band(hi).half < 0 && hi < 1e15) hi *= 2;
        for (var i = 0; i < 200; i++) {
          var mid = (lo + hi) / 2, bm = band(mid);
          if (bm.center - bm.half < 0) lo = mid; else hi = mid;
        }
        out.sureMan = r1(hi / 10000);
      }
      return out;
    },
    cases: [
      // 승률 5bb/100으로 1만 핸드: 가운데 500, 반폭 1.96 x 90 x 10 = 1764 → -1264 ~ +2264(GenMath.varianceBand(5, 10000)과 같음)
      // bb/100 반폭 176.4 ÷ 10 = 17.64, 4배(4만 핸드) 반폭 3528, 통째로 플러스가 되는 핸드 100 x (176.4 ÷ 5)² = 124,467.84 → 12.4만
      { c: { winrate: 5, hands: 10000 }, want: { half: 1764, center: 500, lo: -1264, hi: 2264, rateHalf: 17.6, rateLo: -12.6, rateHi: 22.6,
        half4: 3528, sureMan: 12.4, sd: 90, conf: 95, handsKo: '1만', hands4Ko: '4만' } },
      // 2,500핸드: 반폭 176.4 x 5 = 882, 가운데 125 → -757 ~ +1007, bb/100 반폭 35.28 → 35.3
      { c: { winrate: 5, hands: 2500 }, want: { half: 882, center: 125, lo: -757, hi: 1007, rateHalf: 35.3, rateLo: -30.3, rateHi: 40.3,
        half4: 1764, handsKo: '2,500', hands4Ko: '1만' } },
      // 표준편차 100, 10만 핸드, 승률 2: 반폭 196 x √1000 = 6198.06, 가운데 2000 → -4198 ~ +8198, 100 x 98² = 96.04만
      { c: { winrate: 2, hands: 100000, sd: 100 }, want: { half: 6198, center: 2000, lo: -4198, hi: 8198, rateHalf: 6.2, sureMan: 96 } },
      // 승률 0, 1,000핸드: 반폭 176.4 x √10 = 557.83 → ±558, 플러스 핸드 수(sureMan)는 없음
      { c: { winrate: 0, hands: 1000 }, want: { half: 558, center: 0, lo: -558, hi: 558, rateHalf: 55.8, handsKo: '1,000' } }
    ],
    qNums: function(c) { return [c.winrate, c.hands, c.sd == null ? SD0 : c.sd]; }
  };

  if (typeof LessonCore !== 'undefined' && LessonCore && typeof LessonCore.defineCalc === 'function') {
    LessonCore.defineCalc('s6bVariance', variance);
  }
})();
