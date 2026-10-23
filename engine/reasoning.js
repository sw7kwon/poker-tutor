// engine/reasoning.js (n2-P0 계약 스텁, 설계 원문 docs/NEXT2_DESIGN.md 5.3절 4번, 6.1절 4번. 클라우드 L1이 채운다)
// 빌런 결정마다 "왜 그렇게 했나"를 엔진 규칙(ai/villain.js 분기)으로 되짚는다(순수, 해시 파일은 호출만).
//   explain(log, evIndex, opts) → { name, type, street, action, strength, lines, chart, odds, thought, random, overlay, mismatch? } | null
//   chartContext(log, evIndex) → { pos, facing(false | true | 'vs3bet' | 'vs4bet' | 'cold3bet'), opener, limpers, sbc } | null
// 스텁(STUB: true): null만 돌려준다.
var Reasoning = (function() {
  function explain(log, evIndex, opts) { return null; }
  function chartContext(log, evIndex) { return null; }
  var api = { STUB: true, explain: explain, chartContext: chartContext };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
