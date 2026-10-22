// journey/career/events.js (스텁, 채우는 작업: 클라우드 F4 일일 이벤트와 주간 챌린지. 지시문 docs/cloud-tasks/F4.md)
// 계약: journey/career/contract.js 머리 주석의 events 인터페이스. 다 채운 뒤 CareerContract.register('events', api).
//   today(daySeed, state) → 이벤트 | null, challenges(weekKey) → [], evaluate(item, ctx)(순수)
// 날짜 시드는 CareerContract.seedOf(CareerContract.dayKey(now)), 주 키는 CareerContract.weekKey(now).
// 규약: 로드 시 DOM, 저장소 접근 없음(typeof 가드).
