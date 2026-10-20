// lessons/data/stage2.js (채우는 패키지: M3-P6(s2-01~05), M4-P7(s2-06~10))
// LESSONS.push({ id, node, title, est, source, scenes: [...] }) 형식으로 누적(부록 B). LESSONS는 stage1.js가 선언한다.
// 계약 L1~L7(lessons/lesson-core.js 머리 주석)을 따른다. 이 파일은 순수 데이터(로드할 때 엔진을 부르지 않는다).
// 수치 원칙: 캡션, text, why의 퍼센트와 bb는 {{ }} 템플릿과 같은 장면의 calc(또는 grid의 pct)로만 쓴다.
//   레인지 %는 rangePct calc(Coach.rangePct, 이 앱 입문용 차트 Gto.GTO_RANGES), 경계 손은 grid claim과 chart calc,
//   오픈과 아이솔 사이즈는 opensize calc(engine/ev.js:28-32, 오픈 2.5bb, SB 3bb, 림퍼 1명당 +1bb).
// s2-01~s2-05는 M3-P6, s2-06~s2-10은 M4-P7이 이 아래에 이어 쓴다.

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
    { t: 'grid', pos: 'CO', facing: false, highlight: ['87s', '76s'], claim: { hand: '76s', action: 'raise' },
      caption: '수딧 커넥터(87s, 76s)도 CO부터. 스트레이트나 플러시가 될 수 있어 뒷자리에서 좋아요.' },
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
// 아이솔 레인지 = 그 자리 RFI 표(설계서 7.3절 9번 gto.js vs-limp 분기).
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
      caption: '아이솔은 림퍼에게 크게 레이즈해 그 한 명과 맞붙으려는 거예요. 이 앱 기준 내 자리 RFI 표의 손이면 {{size}}bb로 올려요.' },
    { t: 'say', label: '참고', text: '림프한 사람은 레이즈할 만큼 강하지 않을 때가 많아요. 그래서 따라 림프하기보다 크게 올려 혼자 상대하는 편이 좋아요.' },
    { t: 'ask', id: 'q1', q: '앞사람 모두 폴드, CO에서 65s. 이 앱 차트로는?', choices: ['오픈 레이즈', '림프(콜)', '폴드'], answer: 2,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'CO', facing: false, hand: '65s' },
      why: '65s는 CO 표에 없어요. 레이즈할 손이 아니면 림프 말고 폴드.' },
    { t: 'ask', id: 'q2', q: 'UTG, HJ가 림프. CO에서 아이솔하면 몇 bb로 올릴까?', choices: ['2.5bb', '3.5bb', '4.5bb', '5bb'], answer: 2,
      calc: { type: 'opensize', pos: 'CO', limpers: 2 },
      why: '기본 2.5에 림퍼 한 명마다 1씩 더해 {{size}}bb예요.' },
    { t: 'sum', text: '먼저 들어갈 땐 레이즈 아니면 폴드, 림퍼가 있으면 따라 림프하지 말고 RFI 표의 손으로 아이솔한다.' }
  ]
});
