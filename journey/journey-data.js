// journey/journey-data.js (채우는 패키지: M1-P1a, M6-BOSS 주석)
// 여정 데이터만(로직 없음). 설계서 9절 M1-P1a 형식, 부록 A 노드 60(학습 54 + 보스 6), 2.4절 흡수 매핑, 4.3절 XP.
// 로드 시 DOM/window 접근 없음. 전역 7개: JOURNEY_STAGES, JOURNEY_NODES, CURRICULUM_MAP, JOURNEY_XP, JOURNEY_UNLOCKS, PUZZLE_TYPES, CONCEPT_KEYS.
//
// 노드 필드: id, stage, kind('learn'|'boss'), title, goal, prereq[], lesson(레슨 id = 노드 id | null),
//   drill { type, count, pass, spots?, variant?, tol?, overlap?, set? } | null, mission { ... } | null, concept, absorbs[], est(분)
//   통과 = 레슨 완료 AND 드릴 기준 AND 미션 기준(없는 조건은 생략, 2.2절).
// drill
//   count = 문항 수, pass = 통과에 필요한 정답 수. pass 0 = 연습용(부록 A 통과 기준에 드릴이 없는 노드).
//   type 'mixed'는 set [[유형, 문항 수], ...]를 갖고 count = set 문항 수 합.
//   spots(preflop): PreflopDrill 스팟 키 'rfi|POS', 'vsRfi|POS@OPENER', 'vs3bet|POS', 'cold3bet|POS', 'vs4bet|POS'.
//   variant: 생성기 변형 힌트(board, opensize, draw, multiway, steps, blocker, compare, marginal).
//   tol: combos 허용 오차(±콤보). overlap: rangepaint 1문항 정답 기준(겹침 비율).
// mission { config: 'sixmax-cast'|'sixmax-cast-hidden', emphasis: 캐스트 이름|null, hands: 최소 핸드 수(롤링),
//           coach: 고정 코칭 레벨 0~3|null, conditions: [...], approx?: true, hiddenSeats?: n, earlySubmit?: true }
//   hiddenSeats: 은닉 테이블에서 유형을 숨긴 좌석 수(5 = 손님A~E 전원, 1 = 그 좌석만 중립 이름 '손님'이고 나머지 4자리는 캐스트).
//   earlySubmit: identify 조건의 조기 제출 허용(설계서 11절 4번, s6-boss만).
//   approx 미션은 conditions가 kind 'hands'만(체험 완료).
// 조건 DSL(Boss가 M3부터 평가, 데이터는 여기서 확정)
//   { kind:'pattern', pattern, max, window? | minOpp?, filter? }   window = 최근 핸드 수, minOpp = 최근 기회(필터에 맞는 결정) 수
//   { kind:'light', filter, light, min? | max? | maxCount?, minOpp, window?, per?, ref? }
//       light 토큰 'green'|'yellow'|'red'|'marginal'(marginal 플래그 결정), min/max = 비율, maxCount = 개수 상한,
//       window = 최근 결정 수, per:'concept' = 결정 유형(개념)별로 각각 판정, ref:true = 참고 표시만(통과에 미반영)
//   판정 창(2.2절 롤링 규약의 해석)
//     비율(light의 min/max): window가 없으면 노드 open 뒤 롤링 전체(링 버퍼 300결정 한도), 기회 minOpp 이상일 때만 판정.
//     개수 상한(pattern의 max, light의 maxCount): window가 없으면 필터에 맞는 최근 minOpp개 결정만 센다(미달이면 판정 보류).
//       open 뒤 전체를 세면 이른 실수 1개로 링 버퍼가 밀려날 때까지 통과가 막힌다. 그래서 개수 상한은 window 또는 minOpp 필수.
//     pattern은 window(핸드)와 minOpp(기회)를 함께 쓰지 않는다. 좌석이 매 핸드 돌아(app.js nextRound) 핸드 창 안의 기회 수가
//       포지션 비율로 묶이기 때문(예: 30핸드에 UTG 5 + HJ 5 = 앞자리 기회 최대 10).
//     filter.source로 기회를 그 패턴이 나오는 판정 소스로 좁힌다(차트 패턴은 chart, bluff_no_reason은 guide).
//   { kind:'drillSet', type, count, pass } / { kind:'puzzleSet', type(유형 또는 배열), count, pass, tol? }
//   { kind:'band', metric:'vpip'|'pfr'|'tb'|'f3', tol, minOpp } / { kind:'hands', min }
//   { kind:'identify', seats, min, minHands } / { kind:'weeks', what:'review', min }
//   { kind:'overlap', puzzle:'rangepaint', spots, min } / { kind:'custom', fn, min, ... }
//   M6-BOSS 판정(정본 해석, 자세한 규칙은 journey/boss.js 머리 주석)
//     identify: 은닉 좌석(mission.hiddenSeats곳, 배정은 poker_journey.boss.hidden[노드])마다 관찰 핸드(JStats.castObs(이름, 배정 key).hands,
//       그 좌석이 프리플랍에 액션한 핸드 수)가 minHands 이상이고 맞히기 제출의 정답 수가 min 이상. 보기 = H4 4분류(Fish와 Station 같은 정답),
//       정답 = 배정 프로필의 분류. mission.earlySubmit(s6-boss)이면 좌석마다 30핸드부터 조기 제출 가능(정답 min 이상이면 minHands를 갈음).
//       min에 못 미친 제출은 정답을 공개하고 좌석을 다시 섞는다(관찰 처음부터). 은닉 보스의 실전 칸(hands)은 배정 뒤 누적 은닉 핸드.
//     weeks: ReviewQueue.reportWeeks()의 ISO 주 중 지금 이어지는 연속 주 수 ≥ min(이번 주나 지난주가 마지막이면 이어지는 중).
//     overlap: 보스 색칠 드릴 결과 r.paint(계약 H2)에서 겹침 ≥ min인 항목 수 ≥ spots.
//     custom shortSession {min, maxHands}: 판정 창 안에서 분량 전에 스스로 끝낸 Journey 세션(1 ≤ 핸드 ≤ maxHands) 수 ≥ min.
//     custom luckMeterViews {min}(M5), srsBoxRatio {type, keyPrefix, box, min, minOpp?}(M3).
//   filter 키: street[], source[], concept[], pos[], marginal, multiway, oop, potType('3bet')
//     multiway, oop, potType은 결정 기록의 mw, oop, pt(계약 F2, journey-core decisionFields)와 맞춘다. 그 필드가 없는(null 포함)
//     예전 기록과 프리플랍 oop는 필터에 맞지 않는 것으로 본다. potType은 문자열 또는 배열('limp'|'srp'|'3bet'|'4bet').
//   보스 드릴이 PuzzleUI 세트 상한(20)보다 크면 Boss가 set을 20문항 이하 세트 여러 개로 나눠 차례로 풀게 한다(s4-boss 50 = 20, 20, 10).
//     puzzleSet 조건은 그 시도의 세트 결과를 유형별로 합쳐 판정한다.
// CURRICULUM_MAP = 세션 완료 시 레슨 완료로 옮길 노드(2.4절 표). absorbs = 레슨이 내용을 참조하는 세션(부록 A).
//   CURRICULUM_MAP의 노드는 반드시 그 세션을 absorbs에 갖는다(역은 아님: s3-02는 세션 8을 참조만 한다).

var JOURNEY_STAGES = [
  { n: 1, key: 's1', name: '첫 카드', title: '새싹', question: '누가 이기고, 누가 먼저 말하나', coachMax: 1, sizeButtons: 'simple', baseRating: 1000, boss: 's1-boss' },
  { n: 2, key: 's2', name: '자리 지키기', title: '견습', question: '내 자리에서 무엇을 오픈하고, 콜의 가격은 얼마인가', coachMax: 2, sizeButtons: 'simple', baseRating: 1250, boss: 's2-boss' },
  { n: 3, key: 's3', name: '주도권', title: '레귤러', question: '상대 오픈에 어떻게 대응하고, 플랍에서 칠까 말까 얼마나', coachMax: 3, sizeButtons: 'grouped', baseRating: 1500, boss: 's3-boss' },
  { n: 4, key: 's4', name: '콤보 읽기', title: '리더', question: '상대 손은 몇 가지이고 리버에서 얼마나 버티나', coachMax: 3, sizeButtons: 'grouped', baseRating: 1750, boss: 's4-boss' },
  { n: 5, key: 's5', name: '밸런스', title: '샤크', question: '왜 섞어 치고, 어디서 크게 치나', coachMax: 3, sizeButtons: 'grouped', baseRating: 2000, boss: 's5-boss' },
  { n: 6, key: 's6', name: '익스플로잇', title: '마스터', question: '이 상대는 누구고, 어디서 균형을 떠나나', coachMax: 3, sizeButtons: 'grouped', baseRating: 2250, boss: 's6-boss' }
];

var JOURNEY_NODES = [
  // ── S1 첫 카드(새싹) 7 ──
  { id: 's1-01', stage: 1, kind: 'learn', title: '족보 사다리', goal: '10단계 족보와 킥커로 승자를 고른다', prereq: [],
    lesson: 's1-01', drill: { type: 'showdown', count: 20, pass: 19 }, mission: null, concept: 'showdown', absorbs: [1], est: 3 },
  { id: 's1-02', stage: 1, kind: 'learn', title: '테이블 한 바퀴', goal: '6자리 이름과 말하는 순서, 블라인드, 게임 화면 읽기', prereq: ['s1-01'],
    lesson: 's1-02', drill: { type: 'order', count: 15, pass: 15 },
    mission: { config: 'sixmax-cast', emphasis: '햇살', hands: 5, coach: null, conditions: [] },
    concept: 'order', absorbs: [2], est: 3 },
  { id: 's1-03', stage: 1, kind: 'learn', title: '액션과 민레이즈', goal: '폴드/체크/콜/벳/레이즈/올인과 민레이즈 규칙', prereq: ['s1-02'],
    lesson: 's1-03', drill: { type: 'minraise', count: 10, pass: 9 },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 5, coach: null,
               conditions: [ { kind: 'pattern', pattern: 'fold_free_check', max: 0, window: 5 } ] },
    concept: 'actions', absorbs: [3], est: 3 },
  { id: 's1-04', stage: 1, kind: 'learn', title: 'bb로 세기', goal: '팟, 스택, 콜 금액을 bb로 읽는다', prereq: ['s1-03'],
    lesson: 's1-04', drill: { type: 'tocall', count: 10, pass: 9 }, mission: null, concept: 'actions', absorbs: [], est: 2 },
  { id: 's1-05', stage: 1, kind: 'learn', title: '보드와 내 패', goal: '보드 플레이, 스플릿, 에어', prereq: ['s1-01'],
    lesson: 's1-05', drill: { type: 'showdown', count: 15, pass: 14, variant: 'board' }, mission: null, concept: 'showdown', absorbs: [1], est: 2 },
  { id: 's1-06', stage: 1, kind: 'learn', title: '결과와 결정은 다르다 + 첫 실전 10핸드부터', goal: '운과 결정을 분리하는 마음가짐으로 완주', prereq: ['s1-03', 's1-05'],
    lesson: 's1-06', drill: null,
    mission: { config: 'sixmax-cast', emphasis: '햇살', hands: 10, coach: 0,
               conditions: [ { kind: 'light', filter: { source: ['chart', 'potodds'] }, light: ['green', 'yellow'], min: 0.7, minOpp: 30 } ] },
    concept: 'variance', absorbs: [], est: 2 },
  { id: 's1-boss', stage: 1, kind: 'boss', title: '승급 시험 1', goal: '새싹 졸업', prereq: ['s1-01', 's1-02', 's1-03', 's1-04', 's1-05', 's1-06'],
    lesson: null, drill: { type: 'mixed', set: [ ['showdown', 10], ['order', 5], ['minraise', 5] ], count: 20, pass: 18 },
    mission: { config: 'sixmax-cast', emphasis: '햇살', hands: 10, coach: 0,
               conditions: [ { kind: 'pattern', pattern: 'fold_free_check', max: 0, window: 30 } ] },
    concept: 'boss', absorbs: [], est: 8 },

  // ── S2 자리 지키기(견습) 11 ──
  { id: 's2-01', stage: 2, kind: 'learn', title: '뒷자리가 좋은 이유', goal: '정보와 마지막 액션의 가치', prereq: ['s1-boss'],
    lesson: 's2-01', drill: { type: 'order', count: 10, pass: 10 }, mission: null, concept: 'order', absorbs: [2], est: 2 },
  { id: 's2-02', stage: 2, kind: 'learn', title: '손 등급', goal: '169 손을 4등급과 상위 %로', prereq: ['s2-01'],
    lesson: 's2-02', drill: { type: 'preflop', count: 10, pass: 8, spots: ['rfi|UTG', 'rfi|HJ', 'rfi|CO', 'rfi|BTN'] },
    mission: null, concept: 'range', absorbs: [6], est: 3 },
  { id: 's2-03', stage: 2, kind: 'learn', title: 'RFI 앞자리', goal: 'UTG, HJ 오픈 레인지', prereq: ['s2-02'],
    lesson: 's2-03', drill: { type: 'preflop', count: 20, pass: 16, spots: ['rfi|UTG', 'rfi|HJ'] },
    // 부록 A "최근 30핸드, 앞자리 기회 ≥10" = 최근 앞자리 기회 10번(약 30핸드). 30핸드 창은 기회가 최대 10이라 판정이 거의 안 됨.
    mission: { config: 'sixmax-cast', emphasis: '교수', hands: 30, coach: null,
               conditions: [ { kind: 'pattern', pattern: 'open_too_loose', max: 0, minOpp: 10,
                               filter: { street: ['preflop'], source: ['chart'], concept: ['rfi'], pos: ['UTG', 'HJ'] } } ] },
    concept: 'rfi', absorbs: [7], est: 3 },
  { id: 's2-04', stage: 2, kind: 'learn', title: 'RFI 뒷자리', goal: 'CO, BTN, SB 오픈 레인지', prereq: ['s2-03'],
    lesson: 's2-04', drill: { type: 'preflop', count: 20, pass: 16, spots: ['rfi|CO', 'rfi|BTN', 'rfi|SB'] },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 10, coach: null, conditions: [] },
    concept: 'rfi', absorbs: [7], est: 3 },
  { id: 's2-05', stage: 2, kind: 'learn', title: '림프 금지와 아이솔레이션', goal: '먼저 들어갈 땐 레이즈 아니면 폴드, 림퍼가 있으면 아이솔(1명이면 내 자리 RFI 표, 2명 이상이면 한 칸 좁은 표, 림퍼당 +1bb)', prereq: ['s2-03'],
    lesson: 's2-05', drill: { type: 'minraise', count: 10, pass: 0, variant: 'opensize' },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 15, coach: null,
               conditions: [ { kind: 'pattern', pattern: 'limp', max: 0, window: 15 },
                             { kind: 'pattern', pattern: 'overlimp', max: 0, window: 15 } ] },
    concept: 'rfi', absorbs: [7], est: 3 },
  { id: 's2-06', stage: 2, kind: 'learn', title: '팟 오즈는 가격표', goal: '콜/(팟+콜)로 필요 승률, 팟은 상대 벳 포함', prereq: ['s1-04'],
    lesson: 's2-06', drill: { type: 'potodds', count: 15, pass: 13 }, mission: null, concept: 'pot_odds', absorbs: [4], est: 3 },
  { id: 's2-07', stage: 2, kind: 'learn', title: '아웃츠와 x2/x4 조건', goal: '아웃츠를 세고 조건에 맞는 규칙', prereq: ['s2-06'],
    lesson: 's2-07', drill: { type: 'mixed', set: [ ['outs', 10], ['outs-x4', 10] ], count: 20, pass: 17 },
    mission: null, concept: 'outs', absorbs: [5], est: 3 },
  { id: 's2-08', stage: 2, kind: 'learn', title: '에쿼티 감 잡기', goal: '손 vs 랜덤/레인지 승률 구간, 가격과 승률 비교', prereq: ['s2-07'],
    lesson: 's2-08', drill: { type: 'eqbucket', count: 10, pass: 8 }, mission: null, concept: 'equity', absorbs: [], est: 3 },
  { id: 's2-09', stage: 2, kind: 'learn', title: 'BB 방어의 이유', goal: '이미 낸 1bb 덕에 BTN 2.5bb 오픈엔 27.3%만 필요, 상대 레인지가 강하면 좁아짐', prereq: ['s2-06'],
    lesson: 's2-09', drill: { type: 'preflop', count: 15, pass: 12, spots: ['vsRfi|BB@BTN'] },
    // BB 방어 기회(상대 오픈을 맞은 차트 결정)는 캐스트 테이블 실측 핸드당 0.08번, 기회 5번에 약 60핸드.
    mission: { config: 'sixmax-cast', emphasis: null, hands: 60, coach: null,
               conditions: [ { kind: 'pattern', pattern: 'fold_too_tight_pre', max: 1, minOpp: 5,
                               filter: { street: ['preflop'], source: ['chart'], concept: ['blind_defense'], pos: ['BB'] } } ] },
    concept: 'blind_defense', absorbs: [9], est: 4 },
  { id: 's2-10', stage: 2, kind: 'learn', title: '30핸드 실전 밴드', goal: 'VPIP/PFR을 이 앱 차트 밴드(±4) 안에, 림프 0', prereq: ['s2-04', 's2-05', 's2-09'],
    lesson: 's2-10', drill: null,
    mission: { config: 'sixmax-cast', emphasis: null, hands: 32, coach: 1,
               conditions: [ { kind: 'band', metric: 'vpip', tol: 4, minOpp: 30 },
                             { kind: 'band', metric: 'pfr', tol: 4, minOpp: 30 },
                             { kind: 'pattern', pattern: 'limp', max: 0, window: 20 } ] },
    concept: 'rfi', absorbs: [], est: 2 },
  { id: 's2-boss', stage: 2, kind: 'boss', title: '승급 시험 2', goal: '견습 졸업',
    prereq: ['s2-01', 's2-02', 's2-03', 's2-04', 's2-05', 's2-06', 's2-07', 's2-08', 's2-09', 's2-10'],
    lesson: null, drill: { type: 'potodds', count: 10, pass: 9 },
    mission: { config: 'sixmax-cast', emphasis: '교수', hands: 15, coach: 1,
               conditions: [ { kind: 'custom', fn: 'srsBoxRatio', type: 'preflop', keyPrefix: 'rfi|', box: 3, min: 0.6 },
                             { kind: 'light', filter: { street: ['preflop'], source: ['chart'] }, light: ['green'], min: 0.85, minOpp: 30 },
                             { kind: 'pattern', pattern: 'limp', max: 0, window: 30 },
                             { kind: 'pattern', pattern: 'overlimp', max: 0, window: 30 } ] },
    concept: 'boss', absorbs: [23], est: 8 },

  // ── S3 주도권(레귤러) 12 ──
  { id: 's3-01', stage: 3, kind: 'learn', title: '상대 오픈 대응', goal: '3벳/콜/폴드 세 갈래', prereq: ['s2-boss'],
    lesson: 's3-01', drill: { type: 'preflop', count: 20, pass: 16, spots: ['vsRfi|HJ@UTG', 'vsRfi|CO@HJ', 'vsRfi|BTN@CO', 'vsRfi|BTN@HJ'] },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 15, coach: null,
               conditions: [ { kind: 'pattern', pattern: 'call_too_loose_pre', max: 2, minOpp: 10,
                               filter: { street: ['preflop'], source: ['chart'], concept: ['vs_rfi', 'blind_defense'] } } ] },
    concept: 'vs_rfi', absorbs: [8], est: 3 },
  { id: 's3-02', stage: 3, kind: 'learn', title: 'SB는 3벳 아니면 폴드', goal: 'SB 콜이 왜 비어 있는지', prereq: ['s3-01'],
    lesson: 's3-02', drill: { type: 'preflop', count: 10, pass: 8, spots: ['vsRfi|SB@BTN'] }, mission: null, concept: 'blind_defense', absorbs: [8], est: 2 },
  { id: 's3-03', stage: 3, kind: 'learn', title: 'BB vs 뒷자리 넓은 방어', goal: '뒷자리 오픈에 BB 약 49% 방어', prereq: ['s2-09'],
    lesson: 's3-03', drill: { type: 'preflop', count: 15, pass: 12, spots: ['vsRfi|BB@BTN'] },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 15, coach: null, conditions: [] },
    concept: 'blind_defense', absorbs: [9], est: 3 },
  { id: 's3-04', stage: 3, kind: 'learn', title: '3벳을 맞으면', goal: '4벳/콜/폴드와 사이즈 2.3배', prereq: ['s3-01'],
    lesson: 's3-04', drill: { type: 'preflop', count: 15, pass: 12, spots: ['vs3bet|UTG', 'vs3bet|HJ', 'vs3bet|CO', 'vs3bet|BTN', 'vs3bet|SB'] },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null,
               conditions: [ { kind: 'light', filter: { concept: ['vs_3bet'] }, light: ['green'], min: 0.7, minOpp: 10 } ] },
    concept: 'vs_3bet', absorbs: [10], est: 3 },
  { id: 's3-05', stage: 3, kind: 'learn', title: '콜드 3벳과 4벳', goal: '콜드 3벳 직면과 vs4벳', prereq: ['s3-04'],
    lesson: 's3-05', drill: { type: 'preflop', count: 10, pass: 8, spots: ['cold3bet|BTN', 'cold3bet|BB', 'vs4bet|BTN', 'vs4bet|SB', 'vs4bet|BB'] },
    mission: null, concept: 'vs_3bet', absorbs: [10], est: 2 },
  { id: 's3-06', stage: 3, kind: 'learn', title: '보드 날씨 2축', goal: '플랍을 날씨(맑음/비/구름/안개) x 높이(하이/미드/로우)로', prereq: ['s2-boss'],
    lesson: 's3-06', drill: { type: 'texture', count: 20, pass: 18 }, mission: null, concept: 'board_texture', absorbs: [13], est: 3 },
  { id: 's3-07', stage: 3, kind: 'learn', title: 'c벳 2축', goal: '칠까(빈도)와 얼마나(사이즈) 분리', prereq: ['s3-06'],
    lesson: 's3-07', drill: { type: 'cbet2', count: 10, pass: 0 },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null, approx: true, conditions: [ { kind: 'hands', min: 20 } ] },
    concept: 'cbet', absorbs: [14], est: 3 },
  { id: 's3-08', stage: 3, kind: 'learn', title: '드로우와 세미블러프', goal: '폴드 에쿼티 + 완성 확률', prereq: ['s2-07'],
    lesson: 's3-08', drill: { type: 'facingbet-next', count: 15, pass: 12, variant: 'draw' },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null,
               conditions: [ { kind: 'light', filter: { concept: ['draws'] }, light: ['green', 'yellow'], min: 0.75, minOpp: 15 } ] },
    concept: 'draws', absorbs: [15], est: 3 },
  { id: 's3-09', stage: 3, kind: 'learn', title: 'SPR과 커밋', goal: '스택/팟 비율 계산과 해석', prereq: ['s3-08'],
    lesson: 's3-09', drill: { type: 'spr', count: 10, pass: 9 }, mission: null, concept: 'spr', absorbs: [], est: 2 },
  { id: 's3-10', stage: 3, kind: 'learn', title: '멀티웨이', goal: '3명 이상이면 넛 위주, 큰 벳 드묾', prereq: ['s3-07'],
    lesson: 's3-10', drill: { type: 'facingbet-river', count: 10, pass: 8, variant: 'multiway' },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null,
               // 멀티웨이 팟 = 플랍 이후 결정만(프리플랍은 아직 말하지 않은 상대도 '폴드 안 함'이라 거의 전부 mw가 된다)
               conditions: [ { kind: 'light', filter: { street: ['flop', 'turn', 'river'], multiway: true }, light: ['red'], maxCount: 2, minOpp: 10 } ] },
    concept: 'equity', absorbs: [11], est: 2 },
  { id: 's3-11', stage: 3, kind: 'learn', title: '프리플랍 종합 시험', goal: 'S2~S3 프리플랍 전부', prereq: ['s3-02', 's3-03', 's3-04', 's3-05'],
    lesson: null,
    drill: { type: 'preflop', count: 20, pass: 17,
             spots: ['rfi|UTG', 'rfi|HJ', 'rfi|CO', 'rfi|BTN', 'rfi|SB',
                     'vsRfi|HJ@UTG', 'vsRfi|CO@HJ', 'vsRfi|BTN@CO', 'vsRfi|SB@BTN', 'vsRfi|BB@BTN', 'vsRfi|BB@UTG',
                     'vs3bet|UTG', 'vs3bet|HJ', 'vs3bet|CO', 'vs3bet|BTN', 'vs3bet|SB',
                     'cold3bet|BTN', 'vs4bet|BTN', 'vs4bet|BB'] },
    mission: null, concept: 'range', absorbs: [12], est: 8 },
  { id: 's3-boss', stage: 3, kind: 'boss', title: '승급 시험 3', goal: '레귤러 졸업',
    prereq: ['s3-01', 's3-02', 's3-03', 's3-04', 's3-05', 's3-06', 's3-07', 's3-08', 's3-09', 's3-10', 's3-11'],
    lesson: null, drill: { type: 'texture', count: 20, pass: 18 },
    mission: { config: 'sixmax-cast', emphasis: '불도저', hands: 15, coach: 2,
               conditions: [ { kind: 'light', filter: { street: ['preflop'], source: ['chart'] }, light: ['green'], min: 0.85, minOpp: 30 },
                             { kind: 'light', filter: { street: ['preflop'], concept: ['vs_rfi', 'blind_defense'] }, light: ['green'], min: 0.8, minOpp: 20 },
                             { kind: 'light', filter: { source: ['potodds'] }, light: ['green'], min: 0.8, minOpp: 20, ref: true } ] },
    concept: 'boss', absorbs: [23], est: 8 },

  // ── S4 콤보 읽기(리더) 11 ──
  { id: 's4-01', stage: 4, kind: 'learn', title: '콤보 세기', goal: '페어 6, 수딧 4, 오프 12와 카드 제거', prereq: ['s3-boss'],
    lesson: 's4-01', drill: { type: 'combos', count: 15, pass: 13 }, mission: null, concept: 'combos', absorbs: [], est: 3 },
  { id: 's4-02', stage: 4, kind: 'learn', title: '용의자 명단', goal: '액션마다 상대 레인지를 지우고 남은 콤보 수 구간을 맞힌다', prereq: ['s4-01'],
    lesson: 's4-02', drill: { type: 'rangehit', count: 10, pass: 8, variant: 'steps' },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null, approx: true, conditions: [ { kind: 'hands', min: 20 } ] },
    concept: 'range', absorbs: [19], est: 3 },
  { id: 's4-03', stage: 4, kind: 'learn', title: '레인지 적중 막대', goal: '상대 레인지 중 탑페어 이상이 몇 %인지', prereq: ['s4-02'],
    lesson: 's4-03', drill: { type: 'rangehit', count: 10, pass: 8 }, mission: null, concept: 'range', absorbs: [], est: 3 },
  { id: 's4-04', stage: 4, kind: 'learn', title: '턴 배럴과 프로브', goal: '계속 칠 카드와 멈출 카드(참고)', prereq: ['s3-07'],
    lesson: 's4-04', drill: null,
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null, approx: true, conditions: [ { kind: 'hands', min: 20 } ] },
    concept: 'turn_river', absorbs: [17], est: 2 },
  { id: 's4-05', stage: 4, kind: 'learn', title: '리버 블러프캐처와 MDF', goal: 'MDF = 팟/(팟+벳)(팟은 벳 전), 내 레인지 중 계속할 비율, 블러프캐처는 경계 손, 균형 상대 가정', prereq: ['s4-03'],
    lesson: 's4-05', drill: { type: 'mdf', count: 15, pass: 13 }, mission: null, concept: 'mdf', absorbs: [16], est: 3 },
  { id: 's4-06', stage: 4, kind: 'learn', title: '블러프 비율과 손익분기', goal: '리버 블러프 비율 = 벳/(팟+2벳), 알파 = 벳/(팟+벳)(팟은 벳 전)', prereq: ['s4-05'],
    lesson: 's4-06', drill: { type: 'mixed', set: [ ['bluffratio', 10], ['alpha', 10] ], count: 20, pass: 17 },
    mission: null, concept: 'value_bluff', absorbs: [16], est: 3 },
  { id: 's4-07', stage: 4, kind: 'learn', title: '씬 밸류와 리버 콜/폴드', goal: '강할수록 크게, 중간은 작게 또는 체크(참고). 리버 콜은 명시 레인지로 계산', prereq: ['s4-05'],
    lesson: 's4-07', drill: { type: 'facingbet-river', count: 20, pass: 16 },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null,
               conditions: [ { kind: 'light', filter: { street: ['river'], source: ['chart', 'potodds'] }, light: ['green'], min: 0.75, minOpp: 15, ref: true } ] },
    concept: 'turn_river', absorbs: [17, 18], est: 3 },
  { id: 's4-08', stage: 4, kind: 'learn', title: '블로커 입문', goal: '내 카드가 상대 콤보를 지운다', prereq: ['s4-01'],
    lesson: 's4-08', drill: { type: 'combos', count: 10, pass: 8, variant: 'blocker' }, mission: null, concept: 'combos', absorbs: [], est: 2 },
  { id: 's4-09', stage: 4, kind: 'learn', title: '알파와 레이즈 직면', goal: '레이즈 받을 때 리스크/리워드', prereq: ['s4-06'],
    lesson: 's4-09', drill: { type: 'alpha', count: 10, pass: 9 }, mission: null, concept: 'alpha', absorbs: [], est: 2 },
  { id: 's4-10', stage: 4, kind: 'learn', title: '운 미터 읽기', goal: '올인 승률 vs 결과를 운 미터로 분리해 본다', prereq: ['s3-boss'],
    lesson: 's4-10', drill: null,
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null,
               conditions: [ { kind: 'custom', fn: 'luckMeterViews', min: 3 } ] },
    concept: 'variance', absorbs: [], est: 2 },
  { id: 's4-boss', stage: 4, kind: 'boss', title: '승급 시험 4', goal: '리더 졸업',
    prereq: ['s4-01', 's4-02', 's4-03', 's4-04', 's4-05', 's4-06', 's4-07', 's4-08', 's4-09', 's4-10'],
    lesson: null,
    drill: { type: 'mixed', set: [ ['combos', 10], ['mdf', 5], ['alpha', 5], ['facingbet-river', 20], ['rangehit', 10] ], count: 50, pass: 42 },
    mission: { config: 'sixmax-cast', emphasis: '바위', hands: 15, coach: 2,
               conditions: [ { kind: 'puzzleSet', type: 'combos', count: 10, pass: 9 },
                             { kind: 'puzzleSet', type: ['mdf', 'alpha'], count: 10, pass: 9 },
                             { kind: 'puzzleSet', type: 'facingbet-river', count: 20, pass: 16 },
                             { kind: 'puzzleSet', type: 'rangehit', count: 10, pass: 8 },
                             { kind: 'light', filter: { street: ['preflop'], source: ['chart'] }, light: ['green'], min: 0.85, minOpp: 30 } ] },
    concept: 'boss', absorbs: [24], est: 8 },

  // ── S5 밸런스(샤크) 10 ──
  { id: 's5-01', stage: 5, kind: 'learn', title: '레인지 vs 넛 어드밴티지', goal: '누가 더 많이, 누가 더 세게 맞았나', prereq: ['s4-boss'],
    lesson: 's5-01', drill: { type: 'rangehit', count: 10, pass: 8, variant: 'compare' }, mission: null, concept: 'range', absorbs: [], est: 3 },
  { id: 's5-02', stage: 5, kind: 'learn', title: '에쿼티 실현', goal: '포지션과 플레이어빌리티(참고)', prereq: ['s5-01'],
    lesson: 's5-02', drill: null,
    mission: { config: 'sixmax-cast', emphasis: '카멜레온', hands: 20, coach: null,
               conditions: [ { kind: 'light', filter: { oop: true }, light: ['red'], maxCount: 3, minOpp: 20 } ] },
    concept: 'equity', absorbs: [], est: 2 },
  { id: 's5-03', stage: 5, kind: 'learn', title: '폴라 컨덴스드 머지드 캡드', goal: '레인지 모양 4종', prereq: ['s5-01'],
    lesson: 's5-03', drill: { type: 'rangeshape', count: 10, pass: 8 }, mission: null, concept: 'range', absorbs: [], est: 3 },
  { id: 's5-04', stage: 5, kind: 'learn', title: '3장 토이 게임', goal: '무차별 원리', prereq: ['s4-06'],
    lesson: 's5-04', drill: { type: 'toygame', count: 5, pass: 5 }, mission: null, concept: 'value_bluff', absorbs: [], est: 3 },
  { id: 's5-05', stage: 5, kind: 'learn', title: '혼합 전략', goal: '둘 다 OK인 스팟과 명백한 오답', prereq: ['s5-04'],
    lesson: 's5-05', drill: { type: 'facingbet-river', count: 10, pass: 8, variant: 'marginal' },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null,
               conditions: [ { kind: 'light', filter: { marginal: true }, light: ['yellow', 'red'], maxCount: 1, minOpp: 10 } ] },
    concept: 'value_bluff', absorbs: [], est: 3 },
  { id: 's5-06', stage: 5, kind: 'learn', title: '기하 사이즈와 오버벳', goal: '여러 스트리트에 걸쳐 스택 나눠 넣기', prereq: ['s4-07'],
    lesson: 's5-06', drill: { type: 'geosize', count: 10, pass: 8 }, mission: null, concept: 'spr', absorbs: [18], est: 3 },
  { id: 's5-07', stage: 5, kind: 'learn', title: '3벳팟 포스트플랍', goal: '낮은 SPR과 좁은 레인지', prereq: ['s3-09', 's5-01'],
    lesson: 's5-07', drill: { type: 'spr', count: 10, pass: 8 },
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null,
               conditions: [ { kind: 'light', filter: { street: ['flop', 'turn', 'river'], potType: '3bet' }, light: ['red'], maxCount: 2, minOpp: 10 } ] },
    concept: 'spr', absorbs: [], est: 3 },
  { id: 's5-08', stage: 5, kind: 'learn', title: '체크레이즈와 동크', goal: '주도권 없는 쪽의 공격(참고)', prereq: ['s5-03'],
    lesson: 's5-08', drill: null,
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null, approx: true, conditions: [ { kind: 'hands', min: 20 } ] },
    concept: 'value_bluff', absorbs: [], est: 3 },
  { id: 's5-09', stage: 5, kind: 'learn', title: '레인지 색칠', goal: '확대 모드 드래그로 레인지를 칠해 기준과 겹침을 본다', prereq: ['s5-03'],
    lesson: 's5-09', drill: { type: 'rangepaint', count: 3, pass: 3, overlap: 0.7, spots: ['rfi|CO', 'rfi|BTN', 'vsRfi|BB@BTN'] }, mission: null, concept: 'range', absorbs: [], est: 3 },
  { id: 's5-boss', stage: 5, kind: 'boss', title: '승급 시험 5', goal: '샤크 졸업',
    prereq: ['s5-01', 's5-02', 's5-03', 's5-04', 's5-05', 's5-06', 's5-07', 's5-08', 's5-09'],
    lesson: null, drill: { type: 'rangepaint', count: 3, pass: 3, overlap: 0.7 },
    mission: { config: 'sixmax-cast', emphasis: '카멜레온', hands: 20, coach: 3,
               conditions: [ { kind: 'overlap', puzzle: 'rangepaint', spots: 3, min: 0.7 },
                             { kind: 'light', filter: { source: ['chart', 'potodds'] }, light: ['green', 'marginal'], min: 0.8, minOpp: 30, window: 200 },
                             { kind: 'light', filter: { source: ['chart', 'potodds'] }, light: ['red'], max: 0.03, minOpp: 30, window: 200 },
                             { kind: 'light', filter: { source: ['chart', 'potodds'] }, light: ['red'], max: 0.1, minOpp: 20, window: 200, per: 'concept' } ] },
    concept: 'boss', absorbs: [24], est: 8 },

  // ── S6 익스플로잇(마스터) 9 ──
  { id: 's6-01', stage: 6, kind: 'learn', title: 'HUD와 표본 크기', goal: 'VPIP/PFR/3벳/AF와 신뢰할 수 있는 핸드 수', prereq: ['s5-boss'],
    lesson: 's6-01', drill: { type: 'hudread', count: 10, pass: 9 }, mission: null, concept: 'read', absorbs: [20], est: 3 },
  { id: 's6-02', stage: 6, kind: 'learn', title: '프로필 탐정', goal: '누적 관찰로 유형을 맞힌다', prereq: ['s6-01'],
    lesson: 's6-02', drill: null,
    mission: { config: 'sixmax-cast-hidden', emphasis: null, hands: 50, coach: null, hiddenSeats: 1,
               conditions: [ { kind: 'identify', seats: 1, min: 1, minHands: 50 } ] },
    concept: 'read', absorbs: [], est: 2 },
  { id: 's6-03', stage: 6, kind: 'learn', title: '익스플로잇 4단계', goal: '균형 상상, 리드, 식별, 이탈 정도', prereq: ['s6-02'],
    lesson: 's6-03', drill: null,
    mission: { config: 'sixmax-cast', emphasis: null, hands: 20, coach: null, approx: true, conditions: [ { kind: 'hands', min: 20 } ] },
    concept: 'read', absorbs: [], est: 3 },
  { id: 's6-04', stage: 6, kind: 'learn', title: '유형별 처방', goal: '상대 유형 4가지(타이트, 정석, 루즈-공격, 루즈-패시브)에 무엇을 바꾸나(참고)', prereq: ['s6-03'],
    lesson: 's6-04', drill: { type: 'prescribe', count: 10, pass: 0 },
    mission: { config: 'sixmax-cast', emphasis: '햇살', hands: 20, coach: null,
               conditions: [ { kind: 'pattern', pattern: 'bluff_no_reason', max: 0, minOpp: 10, filter: { street: ['flop', 'turn', 'river'], source: ['guide'] } } ] },
    concept: 'read', absorbs: [20], est: 3 },
  { id: 's6-05', stage: 6, kind: 'learn', title: '흔한 실수 자가 점검', goal: '흔한 실수 10종을 내 기록에서 찾는다', prereq: ['s6-01'],
    lesson: 's6-05', drill: null,
    mission: { config: 'sixmax-cast', emphasis: null, hands: 5, coach: null, conditions: [ { kind: 'weeks', what: 'review', min: 1 } ] },
    concept: 'review', absorbs: [21], est: 2 },
  { id: 's6-06', stage: 6, kind: 'learn', title: '분산 콘과 뱅크롤', goal: '같은 실력도 결과가 얼마나 퍼지나', prereq: ['s4-10'],
    lesson: 's6-06', drill: { type: 'variance', count: 5, pass: 5 }, mission: null, concept: 'variance', absorbs: [22], est: 3 },
  { id: 's6-07', stage: 6, kind: 'learn', title: '틸트와 세션 루틴', goal: '멈출 신호와 복귀 루틴', prereq: ['s6-06'],
    lesson: 's6-07', drill: null,
    mission: { config: 'sixmax-cast', emphasis: null, hands: 5, coach: null, conditions: [ { kind: 'custom', fn: 'shortSession', min: 1, maxHands: 5 } ] },
    concept: 'tilt', absorbs: [22], est: 2 },
  { id: 's6-08', stage: 6, kind: 'learn', title: '복기 루프', goal: '주간 리포트 → 실수 다시 풀기 → 플레이', prereq: ['s6-05'],
    lesson: 's6-08', drill: null,
    mission: { config: 'sixmax-cast', emphasis: null, hands: 5, coach: null, conditions: [ { kind: 'weeks', what: 'review', min: 2 } ] },
    concept: 'review', absorbs: [], est: 2 },
  { id: 's6-boss', stage: 6, kind: 'boss', title: '마스터 시험', goal: '엔드게임 루프 진입',
    prereq: ['s6-01', 's6-02', 's6-03', 's6-04', 's6-05', 's6-06', 's6-07', 's6-08'],
    lesson: null, drill: { type: 'hudread', count: 10, pass: 9 },
    mission: { config: 'sixmax-cast-hidden', emphasis: null, hands: 100, coach: 3, hiddenSeats: 5, earlySubmit: true,
               conditions: [ { kind: 'identify', seats: 5, min: 4, minHands: 100 },
                             { kind: 'light', filter: { source: ['chart', 'potodds'] }, light: ['red'], max: 0.05, minOpp: 20, per: 'concept' },
                             { kind: 'pattern', pattern: 'bluff_no_reason', max: 0, minOpp: 20, filter: { street: ['flop', 'turn', 'river'], source: ['guide'] }, ref: true },
                             { kind: 'pattern', pattern: 'missed_value', max: 0, minOpp: 20, filter: { street: ['flop', 'turn', 'river'], source: ['potodds'] } },
                             { kind: 'weeks', what: 'review', min: 4 } ] },
    concept: 'boss', absorbs: [], est: 8 }
];

// 2.4절 표: 세션 → 흡수 노드(마이그레이션과 routePractice가 사용)
var CURRICULUM_MAP = {
  1: ['s1-01', 's1-05'], 2: ['s1-02', 's2-01'], 3: ['s1-03'], 4: ['s2-06'], 5: ['s2-07'], 6: ['s2-02'],
  7: ['s2-03', 's2-04', 's2-05'], 8: ['s3-01'], 9: ['s2-09', 's3-03'], 10: ['s3-04', 's3-05'], 11: ['s3-10'], 12: ['s3-11'],
  13: ['s3-06'], 14: ['s3-07'], 15: ['s3-08'], 16: ['s4-05', 's4-06'], 17: ['s4-04', 's4-07'], 18: ['s4-07', 's5-06'],
  19: ['s4-02'], 20: ['s6-01', 's6-04'], 21: ['s6-05'], 22: ['s6-06', 's6-07'], 23: ['s2-boss', 's3-boss'], 24: ['s4-boss', 's5-boss']
};

// 4.3절: 획득 XP와 레벨 곡선(n → n+1 필요 XP = levelBase + levelStep x (n-1))
var JOURNEY_XP = { lesson: 15, ask: 2, puzzle: 5, puzzleTier: [0, 2, 4, 6, 8], puzzleWrong: 1, review: 2, reviewRepeat: 1,
  decision: { green: 3, yellow: 1, red: 0 }, hintFactor: 0.5, mission: 40, boss: 150, theater: 10, theaterHit: 2,
  daily5: 15, daily5Perfect: 10, todayDone: 20, weekly: 60, season: 50, repeatCap: 120, levelBase: 300, levelStep: 50 };

// 레벨 해금(외형만, 무작위 없음)
var JOURNEY_UNLOCKS = [ { level: 3, kind: 'tableColor', id: 'navy' }, { level: 6, kind: 'cardBack', id: 'diamond' },
  { level: 10, kind: 'castFrame', id: 'gold' }, { level: 15, kind: 'cardBorder', id: 'film' }, { level: 20, kind: 'tableColor', id: 'wine' } ];

var PUZZLE_TYPES = ['showdown', 'order', 'minraise', 'tocall', 'preflop', 'potodds', 'outs', 'outs-x4', 'eqbucket', 'texture', 'cbet2', 'mdf', 'alpha',
  'bluffratio', 'combos', 'facingbet-river', 'facingbet-next', 'spr', 'rangehit', 'rangepaint', 'rangeshape', 'toygame', 'geosize', 'variance',
  'intent', 'hudread', 'prescribe', 'mixed'];

var CONCEPT_KEYS = ['rfi', 'vs_rfi', 'blind_defense', 'vs_3bet', 'pot_odds', 'draws', 'cbet', 'value_bluff', 'board_texture', 'turn_river', 'actions',
  'showdown', 'order', 'outs', 'equity', 'combos', 'mdf', 'alpha', 'spr', 'range', 'texture', 'read', 'variance', 'tilt', 'review', 'boss'];

if (typeof module !== 'undefined') module.exports = { JOURNEY_STAGES: JOURNEY_STAGES, JOURNEY_NODES: JOURNEY_NODES, CURRICULUM_MAP: CURRICULUM_MAP, JOURNEY_XP: JOURNEY_XP, JOURNEY_UNLOCKS: JOURNEY_UNLOCKS, PUZZLE_TYPES: PUZZLE_TYPES, CONCEPT_KEYS: CONCEPT_KEYS };
