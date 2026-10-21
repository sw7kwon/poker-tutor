// lessons/data/stage2.js (채우는 패키지: M3-P6(s2-01~05), M4-P7(s2-06~10))
// LESSONS.push({ id, node, title, est, source, scenes: [...] }) 형식으로 누적(부록 B). LESSONS는 stage1.js가 선언한다.
// 계약 L1~L7(lessons/lesson-core.js 머리 주석)을 따른다. 이 파일은 순수 데이터(로드할 때 엔진을 부르지 않는다).
// 수치 원칙: 캡션, text, why의 퍼센트와 bb는 {{ }} 템플릿과 같은 장면의 calc(또는 grid의 pct)로만 쓴다.
//   레인지 %는 rangePct calc(Coach.rangePct, 이 앱 입문용 차트 Gto.GTO_RANGES), 경계 손은 grid claim과 chart calc,
//   오픈과 아이솔 사이즈는 opensize calc(engine/ev.js:28-32, 오픈 2.5bb, SB 3bb, 림퍼 1명당 +1bb).
//   (M4-P7) 팟 오즈는 ring과 potodds calc, 아웃츠는 outs calc와 cards 줄 outs/outCards(LessonCore.check가 열거로 검산),
//   승률 막대는 PRECALC(lessons/data/precalc.js 머리 주석) 또는 eqExact 열거, 밴드는 band calc(HeroStats.bandsFromChart).
// s2-01~s2-05는 M3-P6, s2-06~s2-10은 M4-P7이 썼다(s2-05 아이솔 문구는 M4-P7이 결정 사항 13번에 맞춰 고침).

// ── s2-01 뒷자리가 좋은 이유(커리큘럼 세션 2) ──
LESSONS.push({
  id: 's2-01', node: 's2-01', title: '뒷자리가 좋은 이유', est: 2,
  source: '엔진 계산(말하는 순서), 이 앱 차트(Gto.GTO_RANGES)',
  scenes: [
    { t: 'say', text: '같은 손이라도 어디에 앉았는지에 따라 값이 달라져요. UTG와 BTN을 나란히 볼게요.' },
    // 비교 1(프리플랍): 같은 KJo, UTG는 뒤에 다섯 명, BTN은 앞 셋의 폴드를 본 뒤 블라인드 둘만 남음
    { t: 'table', heroPos: 'UTG', hero: ['Kh', 'Jd'], board: [], potTotal: 1.5, order: 'preflop',
      seats: [
        { pos: 'UTG', active: true }, { pos: 'HJ' }, { pos: 'CO' }, { pos: 'BTN' },
        { pos: 'SB', bet: 0.5 }, { pos: 'BB', bet: 1 }
      ],
      calc: { type: 'order', street: 'preflop', seats: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] },
      caption: 'KJo로 UTG. 프리플랍 첫 차례가 {{first}}라 내 뒤로 다섯 명이 아직 남아 있어요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Kh', 'Jd'], board: [], potTotal: 1.5, order: 'preflop',
      seats: [
        { pos: 'UTG', folded: true, action: '폴드' }, { pos: 'HJ', folded: true, action: '폴드' },
        { pos: 'CO', folded: true, action: '폴드' }, { pos: 'BTN', active: true },
        { pos: 'SB', bet: 0.5 }, { pos: 'BB', bet: 1 }
      ],
      calc: { type: 'order', street: 'preflop', seats: ['BTN', 'SB', 'BB'] },
      caption: '같은 KJo, 이번엔 BTN. 앞 셋은 이미 폴드했고 {{first}} 뒤로는 블라인드 둘만 남았어요.' },
    { t: 'ask', id: 'q1', q: '이 앱 차트에서 UTG의 KJo는?', choices: ['오픈 레이즈', '폴드'], answer: 1,
      pick: ['raise', 'fold'], calc: { type: 'chart', pos: 'UTG', facing: false, hand: 'KJo' },
      why: '뒤에 다섯 명이 남는 UTG에선 폴드, 같은 손도 BTN에선 오픈해요.' },
    // 비교 2(플랍): 같은 JTs, UTG 오픈과 BTN 콜. 내가 UTG면 먼저, BTN이면 마지막에 말한다
    { t: 'table', heroPos: 'UTG', hero: ['Jh', 'Th'], board: ['Qs', '7h', '2d'], potTotal: 6.5, order: 'postflop',
      seats: [
        { pos: 'UTG', active: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', action: '프리플랍 콜' }, { pos: 'SB', folded: true }, { pos: 'BB', folded: true }
      ],
      calc: { type: 'order', street: 'postflop', seats: ['UTG', 'BTN'] },
      caption: 'JTs로 UTG 오픈, BTN 콜. 플랍부터 첫 차례는 {{first}}인 나, 상대는 내 행동을 보고 정해요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Jh', 'Th'], board: ['Qs', '7h', '2d'], potTotal: 6.5, order: 'postflop',
      seats: [
        { pos: 'UTG', active: true, action: '프리플랍 오픈' }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN' }, { pos: 'SB', folded: true }, { pos: 'BB', folded: true }
      ],
      calc: { type: 'order', street: 'postflop', seats: ['UTG', 'BTN'] },
      caption: '자리를 바꿔 마지막 차례 {{last}}인 나는 상대의 체크나 벳을 먼저 보고 정할 수 있어요.' },
    { t: 'ask', id: 'q2', q: '플랍부터 BTN이 유리한 가장 큰 이유는?',
      choices: ['상대 행동을 다 보고 마지막에 정해서', '더 좋은 카드가 들어와서', '팟을 먼저 가져가서'], answer: 0,
      why: '마지막에 말하는 사람이 정보를 가장 많이 가져요.' },
    { t: 'sum', text: '뒷자리는 남의 행동을 보고 마지막에 정하니, 같은 손도 더 값지다.' }
  ]
});

// ── s2-02 손 등급(커리큘럼 세션 6, 고정 문구 대신 Coach.rangePct) ──
LESSONS.push({
  id: 's2-02', node: 's2-02', title: '손 등급', est: 3,
  source: '이 앱 차트(Gto.GTO_RANGES)와 Coach.rangePct',
  scenes: [
    { t: 'say', text: '시작 손은 169가지예요. 13x13 격자 한 칸이 손 하나예요.' },
    { t: 'grid', pos: 'UTG', facing: false, blank: true, highlight: ['AA', 'AKs', 'AKo'],
      caption: '대각선은 페어(AA), 오른쪽 위는 수딧(같은 무늬, AKs), 왼쪽 아래는 오프수트(AKo)예요.' },
    // 포지션별 레이어 채우기(UTG에서 BTN까지, 좁은 자리부터)
    { t: 'grid', pos: 'BTN', facing: false, layers: ['UTG', 'HJ', 'CO', 'BTN'], highlight: [],
      calc: { type: 'rangePct', pos: 'BTN', facing: false },
      caption: '뒷자리로 갈수록 오픈하는 손이 층층이 늘어요. BTN은 상위 약 {{pct}}%까지.' },
    { t: 'grid', pos: 'BTN', facing: false, layers: ['UTG', 'HJ', 'CO', 'BTN'], highlight: ['22', 'K2s', 'A2o'],
      caption: '페어는 대각선을 따라(22), 수딧은 위에서 오른쪽으로(K2s), 오프수트는 왼쪽에서 아래로(A2o) 자라요.' },
    // 4등급 = 처음 오픈하는 자리(레이어). 예시 손은 j-lessons와 별개로 작성 시 buildChartModel로 대조했다.
    { t: 'cards', rows: [
        { label: '1등급, UTG부터', cards: ['As', 'Qs'], note: 'AQs, 66, KQo' },
        { label: '2등급, HJ에서 추가', cards: ['Ts', '9s'], note: 'T9s, 55, KJo' },
        { label: '3등급, CO에서 추가', cards: ['8h', '7h'], note: '87s, A5s, 22' },
        { label: '4등급, BTN에서 추가', cards: ['5d', '4d'], note: '54s, K2s, A2o' },
        { label: '등급 밖', cards: ['7c', '2d'], note: 'BTN에서도 폴드' }
      ],
      caption: '손의 등급은 처음 오픈하는 자리예요. 격자 색이 진할수록 높은 등급이에요.' },
    { t: 'ask', id: 'q1', q: 'BTN 오픈 레인지는 전체 손의 약 몇 %일까?',
      choices: ['약 11%', '약 23%', '약 42%', '약 70%'], answer: 2,
      calc: { type: 'rangePct', pos: 'BTN', facing: false },
      why: 'BTN은 상위 약 {{pct}}%. 앞자리보다 훨씬 넓어요.' },
    { t: 'ask', id: 'q2', q: 'UTG에서 A5s, 이 앱 차트로는?', choices: ['오픈 레이즈', '폴드'], answer: 1,
      pick: ['raise', 'fold'], calc: { type: 'chart', pos: 'UTG', facing: false, hand: 'A5s' },
      why: 'A5s는 3등급(CO부터)이라 UTG에선 폴드예요.' },
    { t: 'say', text: '퍼센트는 실제 카드 조합 수로 센 값이에요. 이 앱 차트는 입문용이라 표준보다 앞자리가 조금 좁아요.' },
    { t: 'sum', text: '자리가 뒤로 갈수록 오픈 손이 층층이 늘고, 손의 등급은 처음 오픈하는 자리로 기억한다.' }
  ]
});

// ── s2-03 RFI 앞자리(커리큘럼 세션 7, UTG와 HJ) ──
LESSONS.push({
  id: 's2-03', node: 's2-03', title: 'RFI 앞자리', est: 3,
  source: '이 앱 차트(Gto.GTO_RANGES)와 Coach.rangePct',
  scenes: [
    { t: 'say', text: 'RFI는 앞사람이 모두 폴드했을 때 처음 레이즈로 들어가는 거예요. 앞자리는 뒤에 사람이 많아 좁게 열어요.' },
    { t: 'grid', pos: 'UTG', facing: false, highlight: [],
      calc: { type: 'rangePct', pos: 'UTG', facing: false },
      caption: 'UTG 오픈은 상위 약 {{pct}}%. 뒤에 다섯 명이 남아 센 손만 열어요.' },
    // 경계 손 3: UTG 55, UTG KJo, HJ T9s
    { t: 'grid', pos: 'UTG', facing: false, highlight: ['66', '55'], claim: { hand: '55', action: 'fold' },
      caption: '경계 1: 페어는 66까지 오픈. 55는 UTG에서 폴드예요.' },
    { t: 'grid', pos: 'UTG', facing: false, highlight: ['KQo', 'KJo'], claim: { hand: 'KJo', action: 'fold' },
      caption: '경계 2: 오프수트 K는 KQo까지. KJo는 UTG에서 폴드예요.' },
    { t: 'grid', pos: 'HJ', facing: false, highlight: ['55', 'KJo', 'T9s'], claim: { hand: 'T9s', action: 'raise' },
      calc: { type: 'rangePct', pos: 'HJ', facing: false },
      caption: '경계 3: HJ는 상위 약 {{pct}}%. 55, KJo, T9s 같은 손이 새로 들어와요.' },
    { t: 'ask', id: 'q1', q: 'UTG에서 A9s는?', choices: ['오픈 레이즈', '림프(콜)', '폴드'], answer: 2,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'UTG', facing: false, hand: 'A9s' },
      why: 'UTG의 수딧 에이스는 ATs까지. A9s는 HJ부터 열어요.' },
    { t: 'ask', id: 'q2', q: 'HJ에서 KJo는?', choices: ['오픈 레이즈', '림프(콜)', '폴드'], answer: 0,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'HJ', facing: false, hand: 'KJo' },
      why: 'KJo는 HJ부터 오픈 레인지에 들어와요. 림프는 쓰지 않아요.' },
    { t: 'say', text: '이 앱 차트는 입문용이라 표준 차트보다 UTG, HJ가 조금 더 좁아요. 드릴과 코치도 이 차트로 채점해요.' },
    { t: 'sum', text: '앞자리(UTG, HJ)는 뒤에 사람이 많아 센 손만 오픈한다.' }
  ]
});

// ── s2-04 RFI 뒷자리(커리큘럼 세션 7, CO와 BTN과 SB) ──
LESSONS.push({
  id: 's2-04', node: 's2-04', title: 'RFI 뒷자리', est: 3,
  source: '이 앱 차트(Gto.GTO_RANGES)와 Coach.rangePct',
  scenes: [
    { t: 'say', text: '뒷자리는 남은 상대가 적고 플랍부터 늦게 말해서 넓게 열어요. 단, SB는 예외예요.' },
    { t: 'grid', pos: 'CO', facing: false, highlight: ['22', 'A2s'], claim: { hand: '22', action: 'raise' },
      calc: { type: 'rangePct', pos: 'CO', facing: false },
      caption: 'CO는 상위 약 {{pct}}%. 모든 페어와 모든 수딧 에이스가 들어와요.' },
    { t: 'grid', pos: 'CO', facing: false, highlight: ['98s', '87s', '76s'], claim: { hand: '76s', action: 'raise' },
      caption: '낮은 수딧 커넥터(98s, 87s, 76s)는 CO부터(JTs, T9s는 더 앞자리). 스트레이트와 플러시를 노려요.' },
    { t: 'grid', pos: 'BTN', facing: false, highlight: ['K2s', 'A2o'], claim: { hand: 'A2o', action: 'raise' },
      calc: { type: 'rangePct', pos: 'BTN', facing: false },
      caption: 'BTN은 상위 약 {{pct}}%. 수딧 K와 오프수트 에이스를 전부 열어요.' },
    { t: 'grid', pos: 'SB', facing: false, highlight: ['K4s', 'A2o'], claim: { hand: 'A2o', action: 'fold' },
      calc: { type: 'rangePct', pos: 'SB', facing: false },
      caption: 'SB는 상위 약 {{pct}}%. BB가 뒤에 남고 플랍부터 먼저 말해서 BTN보다 좁아요. K4s, A2o는 폴드.' },
    { t: 'ask', id: 'q1', q: 'BTN에서 K4s는?', choices: ['오픈 레이즈', '림프(콜)', '폴드'], answer: 0,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'BTN', facing: false, hand: 'K4s' },
      why: 'BTN은 수딧 K를 전부 열어요.' },
    { t: 'ask', id: 'q2', q: '같은 K4s, SB에서는?', choices: ['오픈 레이즈', '림프(콜)', '폴드'], answer: 2,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'SB', facing: false, hand: 'K4s' },
      why: 'SB의 수딧 K는 K5s까지. BB가 남고 플랍부터 먼저 말해서 더 좁아요.' },
    { t: 'say', text: '이 앱 차트는 입문용이라 CO와 SB도 표준 차트보다 조금 좁아요. 드릴과 코치는 이 차트로 채점해요.' },
    { t: 'sum', text: '뒷자리 CO, BTN은 넓게 열고, SB는 BB가 남아 있어 BTN보다 좁게 연다.' }
  ]
});

// ── s2-05 림프 금지와 아이솔레이션(커리큘럼 세션 7, 아이솔 장면 추가) ──
// 사이즈는 이 앱 표준(engine/ev.js:28-32, puzzles/gen-basic.js opensize): 오픈 2.5bb, SB 3bb, 림퍼 1명당 +1bb.
// 아이솔 레인지(로드맵 결정 사항 13번, M4-P9 엔진 규칙과 같은 문장, M4-P7이 문구를 고침):
//   림퍼 1명이면 내 자리 RFI 표, 2명 이상이면 한 칸 좁은 표(CO는 HJ 표, BTN과 SB는 CO 표). 사이즈는 오픈 + 림퍼당 1bb.
//   (UTG 앞에는 림퍼가 없고 HJ 앞 림퍼는 UTG 1명뿐이라 2명 이상은 CO, BTN, SB만 해당. BB는 결정 사항 11번 vsLimpBB 규칙)
LESSONS.push({
  id: 's2-05', node: 's2-05', title: '림프 금지와 아이솔레이션', est: 3,
  source: '이 앱 표준 사이즈(engine/ev.js)와 이 앱 차트(Gto.GTO_RANGES)',
  scenes: [
    { t: 'say', text: '림프는 레이즈 없이 빅블라인드만큼만 콜하고 들어가는 거예요(그 사람이 림퍼). 먼저 들어갈 땐 레이즈 아니면 폴드.' },
    // 림프의 손해 1: 블라인드를 가져올 기회를 버리고 BB에게 공짜 플랍을 준다
    { t: 'table', heroPos: 'CO', hero: ['Kh', '9h'], board: [], potTotal: 2.5,
      seats: [
        { pos: 'UTG', folded: true, action: '폴드' }, { pos: 'HJ', folded: true, action: '폴드' },
        { pos: 'CO', action: '림프', bet: 1 }, { pos: 'BTN', folded: true, action: '폴드' },
        { pos: 'SB', folded: true, action: '폴드' }, { pos: 'BB', action: '체크', bet: 1 }
      ],
      caption: '손해 1: CO 림프에 BB는 체크로 공짜 플랍. 레이즈였다면 모두 폴드해 바로 이길 수도 있었어요.' },
    // 림프의 손해 2: 뒤에서 아이솔을 맞으면 낸 칩을 버리거나 불리한 자리에서 싸운다
    { t: 'table', heroPos: 'UTG', hero: ['9s', '8s'], board: [], potTotal: 6, toCall: 2.5,
      seats: [
        { pos: 'UTG', action: '림프', bet: 1, active: true }, { pos: 'HJ', folded: true, action: '폴드' },
        { pos: 'CO', folded: true, action: '폴드' }, { pos: 'BTN', action: '레이즈', bet: 3.5 },
        { pos: 'SB', folded: true, action: '폴드' }, { pos: 'BB', folded: true, action: '폴드' }
      ],
      calc: { type: 'opensize', pos: 'BTN', limpers: 1 },
      caption: '손해 2: 내 림프 뒤 BTN이 {{size}}bb로 레이즈. 폴드하면 낸 칩을 잃고, 콜하면 불리한 자리예요.' },
    // 오픈 사이즈 표(값은 opensize 규칙: UTG~BTN 오픈, SB 오픈, CO 기준 림퍼 1명, 2명)
    { t: 'bar', kind: 'amount',
      rows: [
        { label: '오픈(SB 말고)', bb: 2.5 },
        { label: 'SB 오픈', bb: 3 },
        { label: '림퍼 1명 뒤(SB 말고)', bb: 3.5 },
        { label: '림퍼 2명 뒤(SB 말고)', bb: 4.5 }
      ],
      calc: { type: 'opensize', pos: 'CO', limpers: 0 },
      caption: '이 앱 표준 사이즈: 오픈 {{size}}bb, SB는 조금 더 크게, 림퍼 한 명마다 빅블라인드 하나씩 더.' },
    // 아이솔 장면: UTG 림프, 내 BTN에 AJo(BTN RFI 표 안)
    { t: 'table', heroPos: 'BTN', hero: ['Ah', 'Jc'], board: [], potTotal: 2.5, toCall: 1,
      seats: [
        { pos: 'UTG', action: '림프', bet: 1 }, { pos: 'HJ', folded: true, action: '폴드' },
        { pos: 'CO', folded: true, action: '폴드' }, { pos: 'BTN', active: true },
        { pos: 'SB', bet: 0.5 }, { pos: 'BB', bet: 1 }
      ],
      calc: { type: 'opensize', pos: 'BTN', limpers: 1 },
      caption: '아이솔은 림퍼에게 크게 올려 그 한 명과 맞붙는 거예요. 림퍼 1명이면 내 자리 RFI 표의 손으로 {{size}}bb.' },
    // 림퍼 2명 이상: 한 칸 좁은 표. CO는 HJ 표라 CO 표에 있던 KTo가 빠진다(HJ 표 KJo까지)
    { t: 'grid', pos: 'HJ', facing: false, highlight: ['KJo', 'KTo'], claim: { hand: 'KTo', action: 'fold' },
      caption: '림퍼가 2명 이상이면 한 칸 좁은 표로. CO는 HJ 표, BTN과 SB는 CO 표예요. 그림은 HJ 표, KTo는 빠져요.' },
    { t: 'ask', id: 'q1', q: '앞사람 모두 폴드, CO에서 65s. 이 앱 차트로는?', choices: ['오픈 레이즈', '림프(콜)', '폴드'], answer: 2,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'CO', facing: false, hand: '65s' },
      why: '65s는 CO 표에 없어요. 레이즈할 손이 아니면 림프 말고 폴드.' },
    { t: 'ask', id: 'q2', q: 'UTG, HJ가 림프. CO에서 아이솔하면 몇 bb로 올릴까?', choices: ['2.5bb', '3.5bb', '4.5bb', '5bb'], answer: 2,
      calc: { type: 'opensize', pos: 'CO', limpers: 2 },
      why: '손은 한 칸 좁은 HJ 표로 고르고, 크기는 기본 2.5에 림퍼마다 1씩 더해 {{size}}bb예요.' },
    { t: 'sum', text: '먼저 들어갈 땐 레이즈 아니면 폴드, 림퍼 뒤엔 따라 림프 말고 아이솔, 림퍼가 둘 이상이면 한 칸 좁은 표로.' }
  ]
});

// ── s2-06 팟 오즈는 가격표(커리큘럼 세션 4, 설계서 8.4절 표기 규약) ──
// 팟은 상대 벳까지 넣어 센다(potTotal). 필요 승률 = 콜 ÷ (팟 + 콜)(ring 렌더와 potodds calc가 같은 식).
// 링 3개: 벳 전 팟 12bb에 팟의 1/3(4bb), 반(6bb), 팟만큼(12bb) 벳 → 팟(상대 벳 포함) 16, 18, 24bb, 콜 4, 6, 12bb.
LESSONS.push({
  id: 's2-06', node: 's2-06', title: '팟 오즈는 가격표', est: 3,
  source: '엔진 계산(필요 승률 = 콜 ÷ (팟 + 콜), 설계서 8.4절 표기)',
  scenes: [
    { t: 'say', text: '콜은 물건을 사는 일이에요. 사기 전에 가격표, 곧 필요 승률부터 봐요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Qh', 'Jh'], board: ['Th', '7c', '2h'], potTotal: 18, toCall: 6, focus: 'pot',
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', active: true }, { pos: 'SB', folded: true }, { pos: 'BB', action: '벳', bet: 6 }
      ],
      caption: '팟 {{potTotal}}bb(상대 벳 {{toCall}}bb 포함), 콜 {{toCall}}bb. 팟은 상대가 방금 낸 벳까지 넣어 세요.' },
    { t: 'ring', potTotal: 16, toCall: 4, caption: '상대가 팟의 1/3을 벳하면 필요 승률은 {{pct}}%예요.' },
    { t: 'ring', potTotal: 18, toCall: 6, caption: '팟의 반을 벳하면 {{pct}}%.' },
    { t: 'ring', potTotal: 24, toCall: 12, caption: '팟만큼 벳하면 {{pct}}%. 벳이 클수록 가격(필요 승률)이 올라가요.' },
    { t: 'ask', id: 'q1', q: '팟 20bb(상대 벳 10bb 포함), 콜 10bb. 필요 승률은?', choices: ['25%', '33%', '50%'], answer: 1,
      calc: { type: 'potodds', potTotal: 20, toCall: 10 },
      why: '{{toCall}} ÷ ({{potTotal}}+{{toCall}}) = {{pct}}%. 콜 금액도 팟에 더해서 나눠요.' },
    { t: 'ask', id: 'q2', q: '팟 9bb(상대 벳 3bb 포함), 콜 3bb. 필요 승률은?', choices: ['25%', '20%', '33%'], answer: 0,
      calc: { type: 'potodds', potTotal: 9, toCall: 3 },
      why: '{{toCall}} ÷ ({{potTotal}}+{{toCall}}) = {{pct}}%. 팟의 반을 벳한 경우예요.' },
    { t: 'ask', id: 'q3', q: '상대 벳이 팟의 1/3에서 팟만큼으로 커지면 내 필요 승률은?', choices: ['올라가요', '내려가요', '그대로예요'], answer: 0,
      why: '콜 금액이 커질수록 같은 팟을 사는 값이 비싸져요.' },
    { t: 'sum', text: '콜 전에 가격표부터 본다. 필요 승률 = 콜 ÷ (팟 + 콜), 팟은 상대 벳까지 넣어 센다.' }
  ]
});

// ── s2-07 아웃츠와 x2/x4 조건(커리큘럼 세션 5, 설계서 2.4절 세션 5, 3.2절 출제 제외 5번) ──
// 아웃츠 = 남은 덱(플랍 47장) 중 다음 1장으로 스트레이트 이상이 되는 카드 수(outs calc, HandEval 열거).
// 2열 정확값(플랍 기준): 2장 = 턴과 리버 중 아웃이 1장 이상 올 확률, 1장 = 다음 카드가 아웃일 확률. 표 줄은 cards rows의 outs로
// LessonCore.check와 j-lessons가 열거(5장 = 내 손 2 + 플랍 3)와 조합 확률로 검산한다. x4는 올인(턴과 리버를 다 봄)일 때만.
LESSONS.push({
  id: 's2-07', node: 's2-07', title: '아웃츠와 x2/x4 조건', est: 3,
  source: '엔진 계산(HandEval 열거로 아웃츠, 조합으로 정확 확률)',
  scenes: [
    { t: 'say', text: '아웃츠는 다음 카드 1장으로 내 손을 스트레이트 이상으로 만들어 주는 카드예요(이 앱 기준).' },
    // 플러시 드로우 9장 그림: 아웃 카드 줄은 calc outs의 열거 결과와 같아야 한다(outCards)
    { t: 'cards', rows: [
        { label: '내 손', cards: ['Kh', 'Qh'] },
        { label: '보드', cards: ['9h', '4h', '2c'] },
        { label: '아웃츠', cards: ['Ah', 'Jh', 'Th', '8h', '7h', '6h', '5h', '3h', '2h'], hl: true, outCards: true }
      ],
      calc: { type: 'outs', hero: ['Kh', 'Qh'], board: ['9h', '4h', '2c'] },
      caption: '하트가 넷 보여요. 남은 하트 {{outs}}장 중 하나만 와도 플러시, 이게 플러시 드로우예요.' },
    { t: 'ask', id: 'q1', q: '내 손 8♠7♠, 보드 6♦5♣K♥. 다음 1장으로 스트레이트가 되는 카드는 몇 장?',
      choices: ['4장', '8장', '9장', '15장'], answer: 1,
      calc: { type: 'outs', hero: ['8s', '7s'], board: ['6d', '5c', 'Kh'], of: 'outs' },
      why: '9가 4장, 4가 4장이라 {{outs}}장이에요. 양쪽이 열린 스트레이트 드로우(양방향)예요.' },
    // 2열 정확값 표(설계서 2.4절 세션 5 값): 줄마다 내 손 2장 + 플랍 3장, note = 2장, 1장 정확값
    { t: 'cards', rows: [
        { label: '거트샷 4장', cards: ['9s', '8s', 'Jh', '7d', '2c'], note: '2장 16.5%, 1장 8.5%', outs: 4 },
        { label: '양방향 8장', cards: ['Td', '9d', '8c', '7h', '2s'], note: '2장 31.5%, 1장 17.0%', outs: 8 },
        { label: '플러시 9장', cards: ['Kh', 'Qh', '9h', '4h', '2c'], note: '2장 35.0%, 1장 19.1%', outs: 9, hl: true },
        { label: '플러시+거트샷 12장', cards: ['Jh', 'Th', '8h', '7c', '2h'], note: '2장 45.0%, 1장 25.5%', outs: 12 },
        { label: '플러시+양방향 15장', cards: ['9h', '8h', '7h', '6c', '2h'], note: '2장 54.1%, 1장 31.9%', outs: 15 }
      ],
      calc: { type: 'outs', n: 9 },
      caption: '앞 2장은 내 손, 뒤 3장은 플랍. 2장 = 턴과 리버를 다 볼 때, 1장 = 다음 카드만 볼 때의 정확값.' },
    // 올인과 비올인 짝: 같은 플러시 드로우, 상대 액션만 다르다
    { t: 'table', heroPos: 'BTN', hero: ['Kh', 'Qh'], board: ['9h', '4h', '2c'],
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', active: true }, { pos: 'SB', folded: true }, { pos: 'BB', action: '올인' }
      ],
      calc: { type: 'outs', hero: ['Kh', 'Qh'], board: ['9h', '4h', '2c'] },
      caption: '상대가 올인이면(드문 장면) 콜 한 번으로 턴과 리버를 다 봐요. 어림 x4는 {{x4}}%, 정확값 {{pct2}}%.' },
    { t: 'table', heroPos: 'BTN', hero: ['Kh', 'Qh'], board: ['9h', '4h', '2c'],
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', active: true }, { pos: 'SB', folded: true }, { pos: 'BB', action: '반 팟 벳' }
      ],
      calc: { type: 'outs', hero: ['Kh', 'Qh'], board: ['9h', '4h', '2c'] },
      caption: '올인이 아니면 턴에 또 벳이 올 수 있어요. 이번 콜로 보장되는 건 다음 1장, 어림 x2는 {{x2}}%, 정확값 {{pct1}}%.' },
    { t: 'ask', id: 'q2', q: '플랍에서 상대가 팟의 반을 벳했어요(올인 아님). 이번 콜의 가격과 비교할 어림은?',
      choices: ['아웃츠 x2(다음 1장)', '아웃츠 x4(턴과 리버 2장)'], answer: 0,
      why: '올인이 아니면 보장되는 건 다음 1장뿐. x2는 완성 몫만 센 값이라 작은 벳엔 가격에 조금 못 미쳐도 콜이 흔해요.' },
    { t: 'say', calc: { type: 'outs', n: 15 },
      text: '아웃츠가 9장을 넘으면 x4는 부풀려져요. {{outs}}장이면 x4는 {{x4}}%인데 정확값은 {{pct2}}%예요.' },
    { t: 'sum', text: '아웃츠를 세고, 올인이면 x4, 아니면 x2로 어림한다. x2는 완성 몫만 센 값이라 가격 바로 밑이면 콜도 흔하다.' }
  ]
});

// ── s2-08 에쿼티 감 잡기(신규 노드, 설계서 부록 A 15번, 부록 B 비교 장면) ──
// 승률 막대 6개는 PRECALC(lessons/data/precalc.js 머리 주석의 만든 방법과 고른 기준). 비교 장면 2개는 올인 스팟이라
// 끝까지 본 승률(eqExact 열거)과 이번 콜의 필요 승률을 같은 축에 둔다(s2-07: 끝까지 본 승률을 가격과 바로 견주는 건 올인일 때만).
LESSONS.push({
  id: 's2-08', node: 's2-08', title: '에쿼티 감 잡기', est: 3,
  source: '엔진 계산(Equity._mc와 균등 콤보 MC 선계산, HandEval 열거), 이 앱 차트(Gto.GTO_RANGES)',
  scenes: [
    { t: 'say', text: '에쿼티(승률)는 지금 손으로 끝까지 갔을 때 이기는 몫이에요. 비기면 반으로 쳐요.' },
    { t: 'bar', kind: 'equity', rows: [
        { label: 'AA', precalc: 'eq:AhAd::random' },
        { label: 'AKo', precalc: 'eq:AhKd::random' },
        { label: 'KJo', precalc: 'eq:KhJd::random', hl: true },
        { label: '72o', precalc: 'eq:7c2d::random' }
      ],
      caption: '상대가 아무 손이면 AA도 약 {{eq}}%. 프리플랍 승률은 생각보다 서로 붙어 있어요.' },
    { t: 'ask', id: 'q1', q: '상대가 BTN에서 오픈했다면 내 KJo의 승률은 아무 손을 만날 때보다?',
      choices: ['올라가요', '내려가요', '그대로예요'], answer: 1,
      why: '오픈한 손은 아무 손보다 강해서 같은 KJo라도 승률이 내려가요.' },
    { t: 'bar', kind: 'equity', rows: [
        { label: 'AA 대 BTN 오픈', precalc: 'eq:AhAd::range=rfi|BTN' },
        { label: 'KJo 대 BTN 오픈', precalc: 'eq:KhJd::range=rfi|BTN', hl: true }
      ],
      caption: '상대가 이 앱 차트의 BTN 오픈 레인지면 AA는 약 {{eq}}%로 거의 그대로, KJo는 크게 내려가요.' },
    { t: 'ask', id: 'q2', q: '10♠9♠는 아무 손 상대로 프리플랍 승률이 약 몇 %?', choices: ['약 34%', '약 54%', '약 74%'], answer: 1,
      calc: { type: 'eq', precalc: 'eq:Ts9s::random' },
      why: '수딧 커넥터도 아무 손 상대로는 약 {{eq}}%, 절반을 조금 넘어요.' },
    // 같은 축 비교 1(콜): 플러시와 양방향 스트레이트 드로우 대 탑페어, 상대 올인(팟만큼)
    { t: 'bar', kind: 'compare', exact: { hero: ['9h', '8h'], vs: ['As', 'Ts'], board: ['Th', '7c', '2h'] }, need: { potTotal: 40, toCall: 20 },
      caption: '탑페어의 올인(드문 장면)에 콜하면 끝까지 봐요. 내 드로우 {{eq}}%가 필요 {{need}}%보다 커서 콜이 이득.' },
    // 같은 축 비교 2(폴드): 같은 가격, 거트샷만
    { t: 'bar', kind: 'compare', exact: { hero: ['9s', '8s'], vs: ['Qd', 'Jd'], board: ['Jh', '7d', '2c'] }, need: { potTotal: 40, toCall: 20 },
      caption: '같은 가격에 거트샷뿐이면 {{eq}}%. 필요 {{need}}%에 못 미쳐 폴드가 나아요.' },
    { t: 'ask', id: 'q3', q: '플랍에서 상대가 팟의 반을 벳(올인 아님). 끝까지 본 내 승률을 이번 콜 가격과 바로 견줘도 될까?',
      choices: ['아니요, 턴에 또 벳이 올 수 있어요', '네, 언제나 같아요'], answer: 0,
      why: '끝까지 본 승률을 이번 가격과 바로 견주는 건 올인처럼 남은 카드를 다 볼 때뿐이에요.' },
    { t: 'sum', text: '상대 레인지가 강할수록 내 승률은 내려가고, 올인이면 내 승률이 필요 승률보다 높을 때 콜한다.' }
  ]
});

// ── s2-09 BB 방어의 이유(커리큘럼 세션 9, 설계서 2.4절 세션 9) ──
// BTN 2.5bb 오픈(engine/ev.js 표준), SB 폴드: 팟(상대 벳 포함) 2.5 + 0.5 + 1 = 4bb, BB 콜 1.5bb → 1.5 ÷ 5.5 = 27.3%.
// 이 앱 AI는 BTN만 2.5bb, 나머지 자리는 3bb로 오픈해서(villain.js, tests/j-nodes 17) 가격은 BTN 오픈에만 적는다.
// 방어 격자: BTN 오픈 = vsRfiBB_LP(뒷자리 오프너 표), UTG 오픈 = vsRfi.BB(GtoChart.buildChartModel 선택 규칙).
LESSONS.push({
  id: 's2-09', node: 's2-09', title: 'BB 방어의 이유', est: 3,
  source: '엔진 계산(팟 오즈), 이 앱 차트(Gto.GTO_RANGES vsRfi.BB, vsRfiBB_LP)와 Coach.rangePct',
  scenes: [
    { t: 'say', text: 'BB는 카드를 보기도 전에 빅블라인드를 내고 앉아요. 그 칩은 이미 팟에 들어 있어요.' },
    { t: 'table', heroPos: 'BB', hero: ['Kd', '7c'], board: [], potTotal: 4, toCall: 1.5, focus: 'toCall',
      seats: [
        { pos: 'UTG', folded: true, action: '폴드' }, { pos: 'HJ', folded: true, action: '폴드' },
        { pos: 'CO', folded: true, action: '폴드' }, { pos: 'BTN', action: '레이즈', bet: 2.5 },
        { pos: 'SB', folded: true, action: '폴드' }, { pos: 'BB', bet: 1, active: true }
      ],
      calc: { type: 'opensize', pos: 'BTN', limpers: 0 },
      caption: 'BTN이 {{size}}bb로 오픈, SB 폴드. 팟 {{potTotal}}bb에 내 빅블라인드가 들어 있어 콜은 {{toCall}}bb.' },
    { t: 'ring', potTotal: 4, toCall: 1.5, calc: { type: 'potodds', potTotal: 4, toCall: 1.5 },
      caption: '링의 {{pct}}%는 반올림, 정확히는 {{pctd}}%예요. 이미 낸 빅블라인드 덕분에 콜 가격이 싸요.' },
    { t: 'grid', pos: 'BB', facing: true, opener: 'BTN', highlight: ['K7o'], claim: { hand: 'K7o', action: 'call' },
      caption: 'BTN 오픈에는 넓게 지켜요(참여 약 {{pct}}%). BTN 레인지가 넓어서 K7o도 콜이에요.' },
    { t: 'grid', pos: 'BB', facing: true, opener: 'UTG', highlight: ['K7o'], claim: { hand: 'K7o', action: 'fold' },
      caption: 'UTG 오픈에는 약 {{pct}}%만. 상대 레인지가 강하면 내 승률이 낮아져 K7o는 폴드예요.' },
    { t: 'say', label: '참고', text: 'BB는 플랍부터 먼저 말해서 승률을 다 살리기 어려워요. 그래서 싸다고 아무 손이나 지키지 않아요.' },
    { t: 'ask', id: 'q1', q: 'BTN 2.5bb 오픈, SB 폴드. BB인 나는 팟(상대 벳 포함) 4bb, 콜 1.5bb. 필요 승률은?',
      choices: ['약 27%', '약 38%', '약 50%'], answer: 0,
      calc: { type: 'potodds', potTotal: 4, toCall: 1.5 },
      why: '{{toCall}} ÷ ({{potTotal}}+{{toCall}}) = 약 {{pct}}%. 콜 금액을 팟에 더해서 나눠요.' },
    { t: 'ask', id: 'q2', q: 'UTG가 오픈했어요. BB에서 A8o는?', choices: ['3벳', '콜', '폴드'], answer: 2,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'BB', facing: true, opener: 'UTG', hand: 'A8o' },
      why: 'UTG 오픈에는 에이스 오프수트를 ATo부터 지켜요. A8o는 폴드예요.' },
    { t: 'sum', text: '이미 낸 빅블라인드 덕에 BB는 싸게 넓게 지키지만, 상대 레인지가 강할수록 좁힌다.' }
  ]
});

// ── s2-10 30핸드 실전 밴드(신규 노드, 설계서 1.3절 7번: 밴드 = HeroStats.bandsFromChart ±4, 이 앱 차트 기준) ──
// 미션(journey-data s2-10): VPIP, PFR이 밴드 안(기회 30번부터, journey/boss.js band), 림프 0. 밴드 수치는 band calc.
LESSONS.push({
  id: 's2-10', node: 's2-10', title: '30핸드 실전 밴드', est: 3,
  source: '이 앱 차트(Gto.GTO_RANGES)로 계산한 HeroStats.bandsFromChart',
  scenes: [
    { t: 'say', text: 'VPIP는 스스로 칩을 넣은 핸드 비율(블라인드만 낸 건 빼요), PFR은 프리플랍에 레이즈한 비율이에요.' },
    { t: 'table', heroPos: 'CO', hero: ['Ah', 'Td'], board: [], potTotal: 4, blinds: true,
      seats: [
        { pos: 'UTG', folded: true, action: '폴드' }, { pos: 'HJ', folded: true, action: '폴드' },
        { pos: 'CO', action: '레이즈', bet: 2.5, active: true }, { pos: 'BTN' }, { pos: 'SB' }, { pos: 'BB' }
      ],
      caption: '앞이 모두 폴드, CO에서 ATo로 오픈 레이즈. 이 핸드는 VPIP와 PFR이 둘 다 올라가요.' },
    { t: 'table', heroPos: 'BB', hero: ['Qs', '9s'], board: [], potTotal: 5.5,
      seats: [
        { pos: 'UTG', folded: true, action: '폴드' }, { pos: 'HJ', folded: true, action: '폴드' },
        { pos: 'CO', folded: true, action: '폴드' }, { pos: 'BTN', action: '레이즈', bet: 2.5 },
        { pos: 'SB', folded: true, action: '폴드' }, { pos: 'BB', action: '콜', bet: 2.5, active: true }
      ],
      caption: 'BTN 오픈에 BB에서 Q9s로 콜. 칩을 스스로 넣어 VPIP는 오르지만 레이즈가 아니라 PFR은 그대로예요.' },
    { t: 'say', calc: { type: 'band', metric: 'vpip' },
      text: '이 앱 차트대로만 치면 VPIP가 약 {{pct}}%예요. 통과 밴드는 {{lo}}~{{hi}}%(차트 값 ±4).' },
    { t: 'say', calc: { type: 'band', metric: 'pfr' },
      text: '같은 차트로 PFR은 약 {{pct}}%, 밴드 {{lo}}~{{hi}}%. 사람들 평균이 아니라 이 앱 차트에서 나온 값이에요.' },
    { t: 'ask', id: 'q1', q: '이 앱 차트대로만 치면 VPIP는 약 몇 %?', choices: ['약 9%', '약 21%', '약 42%'], answer: 1,
      calc: { type: 'band', metric: 'vpip', of: 'pct' },
      why: '자리마다 오픈과 방어를 차트대로 하면 약 {{pct}}%, 밴드는 {{lo}}~{{hi}}%예요.' },
    { t: 'ask', id: 'q2', q: '앞사람이 모두 폴드했는데 림프(콜)로 들어가면 오르는 것은?', choices: ['VPIP만', 'PFR만', '둘 다'], answer: 0,
      why: '림프도 스스로 칩을 넣은 거라 VPIP만 올라요. 이 미션은 림프 0번이에요.' },
    { t: 'say', text: '30번부터 판정해요. 핸드마다 기회 1번이라 미션 핸드를 다 치면 거의 채워지고, 모자라면 몇 핸드 더.' },
    { t: 'sum', text: '차트대로 치면 VPIP와 PFR이 이 앱 차트 밴드 안에 들고, 림프는 하지 않는다.' }
  ]
});
