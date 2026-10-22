// journey/career/tourney.js (스텁, 채우는 작업: 클라우드 F5 싯앤고와 MTT. 지시문 docs/cloud-tasks/F5.md)
// 계약: journey/career/contract.js 머리 주석의 tourney 인터페이스. 다 채운 뒤 CareerContract.register('tourney', api).
//   create(spec), onHandEnd(ctx), levelFor(hand), payouts(n), toEngineStacks(), fromEngineStacks(), simOtherTables(level, rnd)
// 블라인드 레벨과 상금 비율은 balance.js의 TOURNEY. 엔진 블라인드는 고정이고 스택을 2^k로 나눠 넘긴다(미니시즌과 같은 식).
// 규약: 로드 시 DOM, 저장소 접근 없음(typeof 가드). engine/*, theater/*는 고치지 않는다.
