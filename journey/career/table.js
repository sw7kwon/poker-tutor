// journey/career/table.js (스텁, 채우는 작업: 클라우드 F2 커리어 테이블 연결. 지시문 docs/cloud-tasks/F2.md)
// 계약: journey/career/contract.js 머리 주석의 table 인터페이스와 app.js 훅(config 'career'). 다 채운 뒤 CareerContract.register('table', api).
//   playersSpec(heroPos, POS), stacksFor(), beforeNextHand(stacks) → { stacks, end }, villainOpts(ctx) → { decide } | null,
//   onHandEnd(ctx), sessionEnd(ctx) → html, startSession(venueId, stake, kind), leaveSession()
// 규약: 로드 시 DOM, 저장소 접근 없음(typeof 가드). 엔진과 ai 파일은 고치지 않는다(VillainAdaptive._decide와 같은 프로필 교체 방식).
