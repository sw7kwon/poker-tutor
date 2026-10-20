// lessons/data/precalc.js (채우는 패키지: M3-P2, M4-P7(s2-08 키 7개), 검산은 tests/j-lessons.test.js)
// 에쿼티 선계산 상수, 키 'eq:<hero>:<board>:<vs>'(계약 L7, lessons/lesson-core.js 머리 주석), 값 = 히어로 에쿼티 0~1(무승부 반, 소수 4자리).
// 만든 방법(M4-P7, 2026-10-20):
//   vs random = Equity._mc(hero, null, board, 5000, Drills.rng(1))과 Drills.rng(2)의 평균(설계서 8.4절 2번, 부록 B).
//   vs range = 같은 시드와 횟수의 균등 콤보 MC 평균(tools/seed-bank.js mcUniform, 상대 레인지 Gto.rangeClassSet(rfi[자리])).
//     Equity._mc의 레인지 샘플러는 콤보를 고르게 뽑지 않아 레인지 상대 값이 틀린다(seed-bank.js 머리 주석, 실측 AKo 대 UTG -3.1%p).
//     편향이 작은 키만 골라 Equity._mc 평균과의 차이도 ±4%p 안이다(AA 대 BTN -1.1%p, KJo 대 BTN 0.0%p).
//   고른 기준: 화면의 반올림 정수(Math.round(값 x 100))가 균등 콤보 MC 20만 회(시드 777) 기준값의 반올림과 같은 키만 쓴다.
//     기준값: AA 85.18, AKo 65.39, KJo 60.59, 72o 34.54, T9s 54.03, AA 대 BTN 84.18, KJo 대 BTN 51.08.
// j-lessons 9는 Equity._mc 평균과 ±4%p, 9b는 독립 균등 콤보 MC(시드 3, 4 각 5000회)와 ±2%p로 다시 대조한다.
var PRECALC = {
  // s2-08 아무 손(랜덤) 상대 프리플랍 막대(장면 2)와 질문 2(T9s)
  'eq:AhAd::random': 0.851,
  'eq:AhKd::random': 0.6535,
  'eq:KhJd::random': 0.6131,
  'eq:7c2d::random': 0.3463,
  'eq:Ts9s::random': 0.542,
  // s2-08 BTN 오픈 레인지 상대 프리플랍 막대(장면 4)
  'eq:AhAd::range=rfi|BTN': 0.8438,
  'eq:KhJd::range=rfi|BTN': 0.5114
};
if (typeof module !== 'undefined') module.exports = { PRECALC: PRECALC };
