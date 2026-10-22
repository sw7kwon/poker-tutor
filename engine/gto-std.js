// engine/gto-std.js (스텁, 채우는 작업: 클라우드 E 표준 차트 티어와 승률 시뮬. 지시문 docs/cloud-tasks/E.md, 설계 원문 4절 R4)
// 표준 근사 프리플랍 차트(GtoStd). engine/gto.js(입문 차트, 은행 해시)는 그대로 두고 자유 게임 코칭과 차트 패널에서만 쓴다.
// 계약(P0 고정, E가 구현):
//   RANGES: 스팟 키는 Gto.GTO_RANGES와 같고 값은 { raise:[], call:[], mix:{ 'A5s': { raise:.5, fold:.5 } } }
//   tier() → 'auto'|'beginner'|'standard'(A11y 설정 chartTier, 기본 'auto')
//   active(state) → 불리언. 'standard'면 참, 'auto'면 Journey.summary().stage ≥ 3이고 자유 게임일 때만.
//     Boss.active()이거나 Journey.session() kind가 boss/mission이면 늘 거짓(승급과 레이팅은 입문 차트).
//   modelFor(state, heroPos) → ui/gto-chart.js 모델 모양({ pos, facing, opener, limpers?, cells[13][13] }) + 칸마다 w{ raise, call, fold }(합 1) | null
//   preflopHint(state, heroPos) → Gto.preflopHint 필드 + w, ok | null
//   bluffHints(model) → '3벳 블러프 후보: A5s~A2s, 76s(50%)' 같은 한 줄 | ''
// GtoChart.modelFor는 typeof GtoStd !== 'undefined' && GtoStd.active(state)면 GtoStd.modelFor를 쓴다(G4). 라벨 종류 'chart-std'.
// 지금(스텁)은 늘 꺼짐(active false, modelFor와 preflopHint는 null).
// 규약: 로드 시 DOM, 저장소 접근 없음(typeof 가드).
var GtoStd = (function() {
  var TIERS = ['auto', 'beginner', 'standard'];
  function tier() {
    try {
      var s = (typeof A11y !== 'undefined' && A11y && typeof A11y.load === 'function') ? A11y.load() : null;
      var t = s && s.chartTier;
      return TIERS.indexOf(t) >= 0 ? t : 'auto';
    } catch (e) { return 'auto'; }
  }
  function active(state) { return false; }
  function modelFor(state, heroPos) { return null; }
  function preflopHint(state, heroPos) { return null; }
  function bluffHints(model) { return ''; }
  var api = { RANGES: {}, TIERS: TIERS.slice(), tier: tier, active: active, modelFor: modelFor, preflopHint: preflopHint, bluffHints: bluffHints, STUB: true };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
