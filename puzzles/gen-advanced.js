// puzzles/gen-advanced.js (스텁, 채우는 작업: 클라우드 J 퍼즐 유형 4종. 지시문 docs/cloud-tasks/J.md)
// 유형: blockers(블로커 콤보 수, exact), sprplan(SPR 구간별 계획, appDef), bluffratio-river(리버 벳 사이즈별 밸류:블러프, exact),
//   bankroll(바이인 수와 파산 위험 구간, exact). 각 생성기는 next, verify(독립 경로), explain, fromKey를 채우고
//   파일 끝에서 typeof Puzzles 가드 안에서 Puzzles.register(type, gen, meta)를 부른다(README 9절 순서).
// 지금(스텁)은 아무것도 등록하지 않는다. 규약: 로드 시 DOM, 저장소 접근 없음, 즉석 몬테카를로 없음.
