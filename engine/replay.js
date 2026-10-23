// engine/replay.js (n2-P0 계약 스텁, 설계 원문 docs/NEXT2_DESIGN.md 5.3절 1~3번, 6.1절 4번. 클라우드 L1이 채운다)
// 핸드 로그(HandLog) → 테이블 프레임과 스트리트별 승률(순수).
//   frames(log) → [{ i, kind('deal' | 'a' | 's' | 'e' | 'n'), st, text(ActionText.line), actor, view(Table.render 상태 모양, replay: true, revealAll: true) }]
//   equityByStreet(log, opts) → { preflop: { 이름: 0.xx }, flop, turn, river }(그 스트리트가 없으면 키 생략, opts.rnd 결정론)
//   perspective(frames, name) → { decisions: [프레임 번호], invested, result: 'win' | 'loss' | 'fold' | 'none' }
// 스텁(STUB: true): 빈 결과만 돌려준다. 화면(ui/omni-ui.js)은 STUB이면 자체 폴백을 쓴다.
var Replay = (function() {
  function frames(log) { return []; }
  function equityByStreet(log, opts) { return {}; }
  function perspective(frames, name) { return { decisions: [], invested: 0, result: 'none' }; }
  var api = { STUB: true, frames: frames, equityByStreet: equityByStreet, perspective: perspective };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
