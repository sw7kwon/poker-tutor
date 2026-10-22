// journey/career/core.js (스텁, 채우는 작업: 클라우드 F1 커리어 코어와 저장. 지시문 docs/cloud-tasks/F1.md)
// 계약: journey/career/contract.js 머리 주석의 core 인터페이스. 다 채운 뒤 CareerContract.register('core', api).
//   state, load, save, reset, canAfford(venueId, stake), buyIn(venueId, stake, kind), settle(result), requirements(venueId),
//   unlockCheck(), addTrophy(id), addReputation(n, why), title(), dayRoll(now), grantXp(n), travel(regionId)
// 등록 전에는 파사드 Career가 null/false/''을 돌려준다(커리어 화면은 안내 카드). 수치는 balance.js에서 읽는다.
// 규약: 로드 시 DOM, 저장소 접근 없음(typeof 가드).
