// journey/career/balance.js (P0 기본 상수, 설계 원문 docs/NEXT_BATCH_DESIGN.md 5.1절. 클라우드 F6이 시뮬로 보정, 보고 docs/cloud-reports/F6.md)
// 커리어 경제와 해금 수치를 이 한 곳에 둔다. 다른 모듈은 하드코딩하지 말고 CareerContract.mod('balance') 또는 CareerBalance를 읽는다.
// id(REGIONS, VENUES 키, TITLES 순서)는 contract.js가 정한다. 여기서는 숫자와 화면 이름만 바꾼다(F6).
// 단위: 코인(CareerContract.CURRENCY), bb(엔진 단위). 현금 게임 바이인(코인) = BUYIN_BB x rate x stake.
// 해금 조건 unlock: { bankroll(코인), rep(평판), stage(Journey.summary().stage 이상, null이면 없음), lesson(커리어 레슨 id, null이면 없음) }
//   bankroll = 그 장소 1배 스테이크 바이인 x BUYIN_RULE(이 앱의 뱅크롤 관리 규칙 "바이인 5배", 첫 장소 backyard는 0으로 처음부터 열림).
//   지역 2(riverside) = S2 승급 통과(stage 3 이상) + 'c-01' 뱅크롤 관리, 지역 3(highland) = S4 승급 통과(stage 5 이상) + 'c-02' 스테이크 오르내리기,
//   토너먼트(weekend-sng, championship) = 'c-05' 토너먼트 기본.
// 경제 목표(5.1절 7번): 지역 2 진입 15~25세션, 지역 3 진입 60~90세션. F6 시뮬(tools/career-sim.js, 코치를 100% 따르는 봇, 하루 1세션) 결과
//   지역 2 첫 세션 중앙값 17~20, 지역 3 첫 세션 중앙값 약 60(보고 참고).
//   웨이브2 머지 때 다시 보정: 웨이브1의 주간 챌린지 보상(평판 3~8, 코인 80~300)과 오늘 이벤트, 라이벌 오버레이가 더해져 평판이 세션당 약 5씩 쌓여
//   지역 평판 문턱을 올렸다(강변 도시 70 → 85, 카지노 90 → 115, 싯앤고 70 → 85, VIP 150 → 200, 고원 리조트 250 → 380, 하이롤러와 챔피언십 270 → 410).
//   시뮬(rivals, events 포함, 엔진 전 과정 300회, safe, 토너먼트 20%) 코치 100% 봇 지역 2 첫 세션 중앙값 18, 지역 3 첫 세션 72(도달 97%),
//   80% 봇 17과 74(도달 68%), 60% 봇 18과 지역 3 도달 16%. 10핸드 세션은 평균 +3~4bb, 표준편차 36bb(바이인의 36%)라
//   자산은 진행 속도를 정하지 못한다(바이인 20배 규칙으로는 수백 세션). 그래서 속도는 평판(세션 +1, 수익 +3, 트로피 +10, 입상 +8, 우승 +20)이 정하고,
//   자산 조건은 "그 장소에 앉을 여유(바이인 5배)"로 둔다. 시작 자산 5,000코인 = 뒷마당 바이인 50개, 리버사이드 카지노 바이인 10개.
//   환율은 1/2/3/5/8/12/20으로 눌렀다(윗 장소일수록 세션 표준편차가 자산 대비 커져 환율 비율이 2를 넘으면 자산 중앙값이 내려간다).
// 규약: 로드 시 DOM, 저장소 접근 없음. 상수만.
var CareerBalance = {
  VERSION: 2,
  START_BANKROLL: 5000,
  BUYIN_BB: 100,
  BUYIN_RULE: 5,                // 해금 자산 = 바이인 x 5(이 앱 기준. 실제 뱅크롤 관리 권장은 20배 이상, 레슨 c-01이 설명)
  SESSION_HANDS: 10,
  STAKES: [1, 2],
  STIPEND: 100,                 // 후원금: 하루 1회, 자산이 가장 싼 열린 장소 바이인보다 적을 때(뒷마당 한 세션 분량)
  HERO_BUST_BB: 0.5,            // 히어로 스택이 이보다 적으면 세션 끝(F2 beforeNextHand)
  VILLAIN_REBUY_BB: 20,         // 빌런 스택이 이보다 적으면 100bb로 다시 채움
  XP: { session: 10, winHand: 1, tourneyCash: 30 },
  XP_DAY_CAP: 80,               // 커리어 XP 하루 상한(Career가 셈, Journey.addXp('career', n))
  REP: { session: 1, winSession: 3, trophy: 10, story: 5, tourneyCash: 8, tourneyWin: 20 },
  TITLE_REP: [0, 20, 60, 150, 300, 600, 1000],   // CareerContract.TITLES와 같은 길이(새내기 ... 전설). 평판은 세션당 약 5씩 쌓인다(주간 챌린지 포함)
  TRAVEL_COST: { harbor: 0, riverside: 50, highland: 300 },   // 그 지역으로 가는 교통비(하루 1회 여행)
  HOME_COST: { studio: 0, apartment: 20000, penthouse: 100000 },
  HOME_STIPEND_BONUS: { studio: 0, apartment: 20, penthouse: 50 },   // 집 단계별 후원금 소폭 추가
  REGIONS: {
    harbor: { name: '항구 마을', icon: '⚓', order: 1, unlock: { bankroll: 0, rep: 0, stage: null, lesson: null } },
    riverside: { name: '강변 도시', icon: '🌉', order: 2, unlock: { bankroll: 0, rep: 85, stage: 3, lesson: 'c-01' } },
    highland: { name: '고원 리조트', icon: '🏔', order: 3, unlock: { bankroll: 0, rep: 380, stage: 5, lesson: 'c-02' } }
  },
  // 현금 장소 unlock.bankroll = BUYIN_BB x rate x BUYIN_RULE, 토너먼트 = buyIn x BUYIN_RULE(tests/j-career-balance.test.js가 검사)
  VENUES: {
    'backyard': { region: 'harbor', name: '뒷마당 홈 게임', icon: '🏡', kind: 'cash', rate: 1, hidden: 0,
      regulars: ['햇살', '콜마스터', '교수'], guests: 2, unlock: { bankroll: 0, rep: 0, stage: null, lesson: null } },
    'tavern': { region: 'harbor', name: '선술집 카드룸', icon: '🍺', kind: 'cash', rate: 2, hidden: 0,
      unlock: { bankroll: 1000, rep: 10, stage: null, lesson: null } },
    'harbor-room': { region: 'harbor', name: '항구 카드룸', icon: '⚓', kind: 'cash', rate: 3, hidden: 0,
      unlock: { bankroll: 1500, rep: 30, stage: null, lesson: null } },
    'riverside-casino': { region: 'riverside', name: '리버사이드 카지노', icon: '🎰', kind: 'cash', rate: 5, hidden: 1,
      unlock: { bankroll: 2500, rep: 115, stage: null, lesson: null } },
    'vip-room': { region: 'riverside', name: '카지노 VIP 룸', icon: '🥂', kind: 'cash', rate: 8, hidden: 5,
      unlock: { bankroll: 4000, rep: 200, stage: null, lesson: null } },
    'weekend-sng': { region: 'riverside', name: '주말 싯앤고', icon: '🥇', kind: 'sng', players: 6, buyIn: 500, payouts: [0.5, 0.3, 0.2],
      unlock: { bankroll: 2500, rep: 85, stage: null, lesson: 'c-05' } },
    'highroller': { region: 'highland', name: '하이롤러 라운지', icon: '💎', kind: 'cash', rate: 12, hidden: 1,
      unlock: { bankroll: 6000, rep: 410, stage: null, lesson: null } },
    'championship': { region: 'highland', name: '챔피언십 홀', icon: '🏆', kind: 'mtt', players: [18, 36], buyIn: 1000,
      unlock: { bankroll: 5000, rep: 410, stage: null, lesson: 'c-05' } },
    'legend': { region: 'highland', name: '전설의 테이블', icon: '🗝', kind: 'cash', rate: 20, hidden: 5, adaptive: true, inviteOnly: true,
      unlock: { bankroll: 10000, rep: 600, stage: null, lesson: null } }
  },
  TOURNEY: {
    START_BB: 50,               // 시작 스택(1레벨 bb 기준)
    LEVEL_HANDS: 5,             // N핸드마다 블라인드 2배(엔진 블라인드는 고정, 스택을 2^k로 나눠 넘김)
    PAYOUTS: { 6: [0.5, 0.3, 0.2], 18: [0.5, 0.3, 0.2], 36: [0.4, 0.25, 0.15, 0.12, 0.08] },
    TABLE_SIZE: 6
  },
  EVENTS: { happyHourBuyIn: 0.5 }   // 해피아워 바이인 배율(F4 이벤트 효과)
};
if (typeof CareerContract !== 'undefined' && CareerContract && typeof CareerContract.register === 'function') {
  CareerContract.register('balance', CareerBalance);
}
