// lessons/data/stage3.js (채우는 그룹: M5-S3A, s3-01~06)
// LESSONS.push({ id, node, title, est, source, scenes: [...] }) 형식으로 누적(부록 B). LESSONS는 stage1.js가 선언한다.
// 계약 L1~L9(lessons/lesson-core.js 머리 주석)를 따른다. 이 파일은 순수 데이터(로드할 때 엔진을 부르지 않는다).
// 수치 원칙: 캡션, text, why의 퍼센트와 bb는 {{ }} 템플릿과 같은 장면의 calc(또는 grid의 pct)로만 쓴다.
//   레인지 %는 rangePct calc와 grid의 pct(Coach.rangePct, 이 앱 입문용 차트 Gto.GTO_RANGES), 손의 액션은 grid claim과 chart calc,
//   3벳과 4벳 크기는 betsize calc(lessons/calc/stage3a.js: 히어로 engine/ev.js, AI ai/villain.js), 보드 날씨와 높이는 texture calc
//   (lessons/calc/stage3a.js, PostflopTables.classifyFlop과 puzzles/gen-postflop.js texture 규칙, 칩 '이 앱의 분류 기준').
// 캡션의 손 목록(예 '88 이상, AJo 이상')과 cards 줄 라벨(보드의 날씨와 높이)은 j-lessons가 검산하지 않는 글이라 작성할 때
//   GtoChart.buildChartModel 셀과 texture calc(LessonCore.calc, 22100 플랍 전수로 GenPostflop.axesOf와 같음을 확인)로 하나씩 대조했다.
//   차트를 바꾸면 이 파일의 손 목록도 다시 대조한다.
// 차트 메모: vs3bet.BTN의 콜 칸은 M5 통합 검증에서 'ATo'(AJo, AQo는 폴드인 역전)를 'ATo+'(ATo, AJo, AQo 콜)로 고쳤다.
//   vsRfi.BTN 표는 오프너와 상관없이 하나라서 'BTN vs CO' 격자는 vsRfi.BTN 그대로다.
// 사이즈 메모: 히어로 오픈 2.5bb(SB 3bb), AI 오픈은 BTN 2.5bb, 나머지 자리 3bb(ai/villain.js:54). 3벳은 히어로 IP 3배, OOP 4배,
//   AI는 IP 3배, OOP(SB, BB) 3.5배를 0.5bb로 반올림. 4벳은 둘 다 2.3배(히어로 0.1bb 반올림, AI 0.5bb 반올림).
// 질문 문장 메모(리뷰 수정): 레슨 복습(puzzles/gen-lesson.js)은 질문 문장만 보이고 라벨이 늘 '엔진 계산'이라, 차트 값과
//   앱 분류 값을 묻는 ask의 q에는 '이 앱 차트로', '이 앱 표준', '이 앱의 분류로'를 직접 적는다.

// ── s3-01 상대 오픈 대응(커리큘럼 세션 8, 설계서 2.4절 세션 8) ──
// 3벳 예시는 GTO_RANGES.vsRfi.BTN.threebet(88+, ATs+, A5s-A4s, KQs, KJs, AJo+, KQo). 사이즈 문구 'IP 3배, OOP 3.5~4배(이 앱 AI는 3.5배)'.
LESSONS.push({
  id: 's3-01', node: 's3-01', title: '상대 오픈 대응', est: 3,
  source: '이 앱 차트(Gto.GTO_RANGES vsRfi)와 Coach.rangePct, 이 앱 표준 사이즈(engine/ev.js, ai/villain.js)',
  scenes: [
    { t: 'say', text: '앞사람이 먼저 오픈했어요. 이제 길은 셋, 다시 올리는 3벳, 따라가는 콜, 접는 폴드예요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Ah', 'Qd'], board: [], potTotal: 4.5, toCall: 3,
      seats: [
        { pos: 'UTG', folded: true, action: '폴드' }, { pos: 'HJ', folded: true, action: '폴드' },
        { pos: 'CO', action: '오픈', bet: 3 }, { pos: 'BTN', active: true },
        { pos: 'SB', bet: 0.5 }, { pos: 'BB', bet: 1 }
      ],
      calc: { type: 'betsize', kind: '3bet', facing: 3, oop: false },
      caption: 'CO가 {{facing}}bb로 오픈, 나는 BTN에서 AQo. 3벳하면 오픈의 {{mult}}배인 {{size}}bb로 올려요.' },
    { t: 'grid', pos: 'BTN', facing: true, opener: 'CO', highlight: ['88', 'AJo', 'A5s'], claim: { hand: 'A5s', action: 'raise' },
      caption: 'BTN이 CO 오픈을 맞으면 전체 손의 약 {{pct}}%만 참여. 3벳은 88 이상, AJo 이상 같은 센 손과 A5s, A4s.' },
    { t: 'grid', pos: 'BTN', facing: true, opener: 'CO', highlight: ['77', 'QJs', 'T9s'], claim: { hand: 'QJs', action: 'call' },
      caption: '콜은 77 이하 페어, QJs, T9s 같은 손. BTN은 플랍부터 마지막에 말해서(IP) 따라가기 편해요.' },
    { t: 'grid', pos: 'HJ', facing: true, opener: 'UTG', highlight: ['AJo', 'KQo'], claim: { hand: 'AJo', action: 'fold' },
      caption: '앞자리 오픈엔 더 좁게. HJ가 UTG 오픈을 맞으면 약 {{pct}}%만, AJo와 KQo도 폴드예요.' },
    { t: 'say', calc: { type: 'betsize', kind: '3bet', facing: 3, oop: true },
      text: 'OOP(플랍부터 먼저 말하는 자리, 보통 SB와 BB)는 더 크게 3벳해요. 이 앱 표준 {{mult}}배, AI는 {{aimult}}배.' },
    { t: 'ask', id: 'q1', q: 'CO 오픈, 나는 BTN에서 A4s. 이 앱 차트로는?', choices: ['3벳', '콜', '폴드'], answer: 0,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'BTN', facing: true, opener: 'CO', hand: 'A4s' },
      why: 'A4s는 콜 대신 3벳으로 쓰는 손이에요. 에이스를 쥐고 있어 상대의 AA, AK가 줄어들어요.' },
    { t: 'ask', id: 'q2', q: 'CO가 3bb로 오픈했고 나는 BB예요. 3벳한다면 이 앱 표준 크기는?', choices: ['9bb', '10.5bb', '12bb'], answer: 2,
      calc: { type: 'betsize', kind: '3bet', facing: 3, oop: true },
      why: 'BB는 OOP라 {{mult}}배, {{facing}} x {{mult}} = {{size}}bb. 이 앱 AI라면 {{ai}}bb예요.' },
    { t: 'sum', text: '상대 오픈엔 3벳, 콜, 폴드 중 하나. 3벳 크기는 IP 3배, OOP 3.5~4배(이 앱 AI는 3.5배).' }
  ]
});

// ── s3-02 SB는 3벳 아니면 폴드(커리큘럼 세션 8, 설계서 부록 A 20번) ──
// GTO_RANGES.vsRfi.SB는 콜 칸이 비어 있다(3벳 TT+, AJs+, KQs, A5s-A4s, AQo+). BB가 뒤에 남는 그림과 플랍 말하는 순서로 이유를 보인다.
LESSONS.push({
  id: 's3-02', node: 's3-02', title: 'SB는 3벳 아니면 폴드', est: 2,
  source: '이 앱 차트(Gto.GTO_RANGES vsRfi.SB, 콜 칸 없음)와 Coach.rangePct, 엔진 계산(콜 금액, 말하는 순서)',
  scenes: [
    { t: 'say', text: 'BTN이 오픈했고 나는 SB예요. 이 앱 차트의 SB는 콜 칸이 비어 있어요. 3벳 아니면 폴드, 이유를 볼게요.' },
    { t: 'table', heroPos: 'SB', hero: ['Kh', '9c'], board: [], potTotal: 4, toCall: 2, focus: 'BB',
      seats: [
        { pos: 'UTG', folded: true, action: '폴드' }, { pos: 'HJ', folded: true, action: '폴드' },
        { pos: 'CO', folded: true, action: '폴드' }, { pos: 'BTN', action: '오픈', bet: 2.5 },
        { pos: 'SB', bet: 0.5, active: true }, { pos: 'BB', bet: 1 }
      ],
      calc: { type: 'tocall', currentBet: 2.5, heroBet: 0.5 },
      caption: '콜하려면 {{amt}}bb를 더 내요. 그런데 내 뒤에 BB가 아직 남아 있어 3벳이 또 올 수 있어요.' },
    { t: 'table', heroPos: 'SB', hero: ['Kh', '9c'], board: ['Qd', '7s', '4h'], potTotal: 7.5, order: 'postflop',
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', action: '프리플랍 오픈' }, { pos: 'SB', active: true }, { pos: 'BB', action: '프리플랍 콜' }
      ],
      calc: { type: 'order', street: 'postflop', seats: ['SB', 'BB', 'BTN'] },
      caption: 'BB까지 따라와 플랍을 보면 첫 차례는 {{first}}인 나. 두 사람 앞에서 먼저 말해야 해요(OOP).' },
    { t: 'grid', pos: 'SB', facing: true, opener: 'BTN', highlight: ['K9o', 'AQo'], claim: { hand: 'K9o', action: 'fold' },
      caption: 'SB가 BTN 오픈을 맞으면 약 {{pct}}%만 참여하고 전부 3벳이에요. BB라면 콜하는 K9o도 여기선 폴드.' },
    { t: 'grid', pos: 'SB', facing: true, opener: 'BTN', highlight: ['TT', 'A5s', 'A4s'], claim: { hand: 'A5s', action: 'raise' },
      caption: '3벳은 TT 이상, AJs 이상, AQo 이상, KQs와 블러프 A5s, A4s. 모두 접으면 바로 팟을 가져와요.' },
    { t: 'say', label: '참고',
      text: '실전 솔버는 SB 콜을 조금 섞기도 해요. 그래도 3벳 아니면 폴드가 단순하고 손해가 작아서 입문 차트로 써요.' },
    { t: 'ask', id: 'q1', q: 'BTN 오픈, 나는 SB에서 AQo. 이 앱 차트로는?', choices: ['3벳', '콜', '폴드'], answer: 0,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'SB', facing: true, opener: 'BTN', hand: 'AQo' },
      why: 'AQo는 센 손이라 3벳해요. 콜로 BB를 불러들이지 않고 주도권을 잡아요.' },
    { t: 'ask', id: 'q2', q: 'SB에서 BTN 오픈을 맞았을 때 이 앱 차트에 없는 선택은?', choices: ['3벳', '콜', '폴드'], answer: 1,
      why: 'SB는 BB가 뒤에 남고 플랍부터 먼저 말해서 콜 칸을 비워 뒀어요.' },
    { t: 'sum', text: 'SB는 BB가 뒤에 남고 플랍부터 먼저 말하니, 상대 오픈엔 3벳 아니면 폴드.' }
  ]
});

// ── s3-03 BB vs 뒷자리 넓은 방어(커리큘럼 세션 9, 설계서 2.4절 세션 9) ──
// 오프너 레인지(rfi.BTN, rfi.UTG)를 먼저 보고, BB 방어 격자 vsRfiBB_LP(CO, BTN, SB 오픈)와 vsRfi.BB(UTG, HJ 오픈)를 비교한다.
// '약 49%'는 rangePct calc(설계서 부록 A 21번, journey-data s3-03 goal).
LESSONS.push({
  id: 's3-03', node: 's3-03', title: 'BB vs 뒷자리 넓은 방어', est: 3,
  source: '이 앱 차트(Gto.GTO_RANGES rfi, vsRfiBB_LP, vsRfi.BB)와 Coach.rangePct',
  scenes: [
    { t: 'say', text: 'BB가 얼마나 넓게 지킬지는 누가 오픈했느냐에 달려 있어요. 먼저 오프너의 레인지부터 봐요.' },
    { t: 'grid', pos: 'BTN', facing: false, highlight: ['J9o', 'K2s'], claim: { hand: 'J9o', action: 'raise' },
      caption: 'BTN은 약 {{pct}}%를 오픈해요. J9o, K2s 같은 약한 손도 많이 섞여 있어요.' },
    { t: 'grid', pos: 'UTG', facing: false, highlight: ['ATs', 'KQo'], claim: { hand: 'KQo', action: 'raise' },
      caption: 'UTG는 약 {{pct}}%만 오픈해요. 센 손 위주라 맞서기가 훨씬 어려워요.' },
    { t: 'grid', pos: 'BB', facing: true, opener: 'BTN', highlight: ['Q8o', 'K4s', 'T7s'], claim: { hand: 'Q8o', action: 'call' },
      calc: { type: 'rangePct', pos: 'BB', facing: true, opener: 'BTN' },
      caption: '그래서 BTN 오픈엔 BB가 약 {{pct}}%를 지켜요. Q8o, K4s, T7s도 콜이에요.' },
    { t: 'grid', pos: 'BB', facing: true, opener: 'BTN', highlight: ['A3s', '76s', '65s'], claim: { hand: '65s', action: 'raise' },
      caption: '3벳도 넓어져요. 센 손에 더해 A5s부터 A3s, 76s, 65s 같은 손을 3벳으로 섞어요.' },
    { t: 'grid', pos: 'BB', facing: true, opener: 'UTG', highlight: ['Q8o', 'K4s', 'T7s'], claim: { hand: 'K4s', action: 'fold' },
      calc: { type: 'rangePct', pos: 'BB', facing: true, opener: 'UTG' },
      caption: 'UTG 오픈엔 약 {{pct}}%만 지켜요. 같은 Q8o, K4s, T7s가 전부 폴드로 바뀌어요.' },
    { t: 'ask', id: 'q1', q: 'CO가 오픈했어요. 이 앱 차트로 BB에서 3벳과 콜을 합친 방어는 전체 손의 약 몇 %?',
      choices: ['약 20%', '약 34%', '약 49%'], answer: 2,
      calc: { type: 'rangePct', pos: 'BB', facing: true, opener: 'CO' },
      why: '이 앱 차트는 CO, BTN, SB 오픈에 같은 넓은 표를 써요. 약 {{pct}}%예요.' },
    { t: 'ask', id: 'q2', q: 'BTN 오픈, 나는 BB에서 J6s. 이 앱 차트로는?', choices: ['3벳', '콜', '폴드'], answer: 1,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'BB', facing: true, opener: 'BTN', hand: 'J6s' },
      why: 'BTN 오픈엔 수딧 J를 J6s까지 지켜요. 싼 가격으로 플러시와 스트레이트를 노려요.' },
    { t: 'sum', text: '뒷자리(CO, BTN, SB) 오픈은 레인지가 넓어 BB도 넓게 지키고, 앞자리 오픈엔 좁힌다.' }
  ]
});

// ── s3-04 3벳을 맞으면(커리큘럼 세션 10, 설계서 2.4절 세션 10: 4벳은 ev.js의 2.3배) ──
// 장면: BTN 2.5bb 오픈에 BB(AI)가 3.5배 3벳(8.75 → 0.5bb 반올림 9bb), 내 4벳은 9 x 2.3 = 20.7bb. 격자는 vs3bet.BTN.
LESSONS.push({
  id: 's3-04', node: 's3-04', title: '3벳을 맞으면', est: 3,
  source: '이 앱 차트(Gto.GTO_RANGES vs3bet)와 Coach.rangePct, 이 앱 표준 사이즈(engine/ev.js 4벳 2.3배, ai/villain.js)',
  scenes: [
    { t: 'say', text: '내가 오픈했는데 뒤에서 다시 올렸어요(3벳). 이번에도 길은 셋, 4벳, 콜, 폴드예요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Kh', 'Jd'], board: [], potTotal: 12, toCall: 6.5,
      seats: [
        { pos: 'UTG', folded: true, action: '폴드' }, { pos: 'HJ', folded: true, action: '폴드' },
        { pos: 'CO', folded: true, action: '폴드' }, { pos: 'BTN', active: true, action: '오픈', bet: 2.5 },
        { pos: 'SB', folded: true, action: '폴드' }, { pos: 'BB', action: '3벳', bet: 9 }
      ],
      calc: { type: 'betsize', kind: '3bet', facing: 2.5, oop: true },
      caption: 'BTN에서 {{facing}}bb로 오픈했더니 BB가 {{ai}}bb로 3벳. 이 앱 AI는 OOP에서 약 {{aimult}}배로 올려요.' },
    { t: 'grid', pos: 'BTN', facing: 'vs3bet', highlight: ['KJo', 'A8o'], claim: { hand: 'KJo', action: 'fold' },
      caption: '3벳을 맞은 BTN은 전체 손의 약 {{pct}}%만 계속해요. 오픈했던 KJo, A8o도 여기선 폴드예요.' },
    { t: 'grid', pos: 'BTN', facing: 'vs3bet', highlight: ['99', 'AKo', 'A5s'], claim: { hand: 'A5s', action: 'raise' },
      caption: '4벳은 99 이상, ATs 이상, AKo, KQs 같은 센 손과 블러프 A5s, A4s예요.' },
    { t: 'grid', pos: 'BTN', facing: 'vs3bet', highlight: ['77', 'KJs', 'JTs'], claim: { hand: 'JTs', action: 'call' },
      caption: '콜은 77, 88 같은 페어, KJs, JTs 같은 수딧 손, ATo 이상 오프 에이스. BTN은 마지막에 말해서(IP) 따라가기 좋아요.' },
    { t: 'say', calc: { type: 'betsize', kind: '4bet', facing: 9 },
      text: '4벳 크기는 상대 3벳의 {{mult}}배예요. {{facing}}bb 3벳이면 {{size}}bb, 이 앱 AI도 같은 배수를 써요.' },
    { t: 'ask', id: 'q1', q: 'BTN에서 오픈했다가 BB의 3벳을 맞았어요. 내 손 QJs, 이 앱 차트로는?', choices: ['4벳', '콜', '폴드'], answer: 1,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'BTN', facing: 'vs3bet', hand: 'QJs' },
      why: 'QJs는 콜 칸이에요. IP에서 플랍을 보며 플러시와 스트레이트를 노려요.' },
    { t: 'ask', id: 'q2', q: '상대 3벳이 9bb예요. 4벳한다면 이 앱 표준 크기는?', choices: ['18bb', '20.7bb', '27bb'], answer: 1,
      calc: { type: 'betsize', kind: '4bet', facing: 9 },
      why: '3벳의 {{mult}}배라서 {{facing}} x {{mult}} = {{size}}bb예요.' },
    { t: 'sum', text: '3벳을 맞으면 오픈한 손 대부분은 접고, 센 손은 3벳의 약 2.3배로 4벳한다.' }
  ]
});

// ── s3-05 콜드 3벳과 4벳(커리큘럼 세션 10, 설계서 부록 A 23번) ──
// 콜드 3벳 직면 = 내가 칩을 넣기 전에 앞에서 오픈과 3벳이 나온 상황(Gto.isFacingCold3bet, vsCold3bet 단일 표).
// vs4bet = 내 3벳에 4벳을 맞음(vs4bet.BTN). AI 사이즈: UTG 3bb 오픈, HJ 3배 9bb 3벳, CO 4벳 9 x 2.3 = 20.7 → 0.5bb 반올림 20.5bb.
LESSONS.push({
  id: 's3-05', node: 's3-05', title: '콜드 3벳과 4벳', est: 2,
  source: '이 앱 차트(Gto.GTO_RANGES vsCold3bet, vs4bet)와 Coach.rangePct, 이 앱 AI 사이즈(ai/villain.js)',
  scenes: [
    { t: 'say', text: '콜드 3벳 직면은 내가 아직 아무 액션도 안 했는데 앞에서 오픈과 3벳이 이미 나온 상황이에요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Ad', 'Qc'], board: [], potTotal: 13.5, toCall: 9,
      seats: [
        { pos: 'UTG', action: '오픈', bet: 3 }, { pos: 'HJ', action: '3벳', bet: 9 },
        { pos: 'CO', folded: true, action: '폴드' }, { pos: 'BTN', active: true },
        { pos: 'SB', bet: 0.5 }, { pos: 'BB', bet: 1 }
      ],
      calc: { type: 'betsize', kind: '3bet', facing: 3, oop: false },
      caption: 'UTG가 {{facing}}bb로 오픈, HJ가 {{ai}}bb로 3벳. 내 BTN 차례인데 앞의 두 사람 모두 센 손을 보여 줬어요.' },
    { t: 'grid', pos: 'BTN', facing: 'cold3bet', highlight: ['AQo', '99', 'KQs'], claim: { hand: 'AQo', action: 'fold' },
      caption: '콜드 3벳엔 전체 손의 약 {{pct}}%만 계속해요. AQo, 99, KQs처럼 괜찮아 보이는 손도 폴드예요.' },
    { t: 'grid', pos: 'BTN', facing: 'cold3bet', highlight: ['QQ', 'AKo', 'JJ', 'AQs'], claim: { hand: 'JJ', action: 'call' },
      caption: '4벳은 QQ 이상과 AK, 콜은 JJ, TT, AQs뿐이에요. 앞의 두 레인지가 다 강해서 이렇게 좁아요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Jh', 'Jd'], board: [], potTotal: 31, toCall: 11.5,
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true },
        { pos: 'CO', action: '4벳', bet: 20.5 }, { pos: 'BTN', active: true, action: '3벳', bet: 9 },
        { pos: 'SB', folded: true }, { pos: 'BB', folded: true }
      ],
      calc: { type: 'betsize', kind: '4bet', facing: 9 },
      caption: 'CO 오픈에 내가 BTN에서 {{facing}}bb로 3벳, CO가 {{ai}}bb로 4벳. 이제 5벳 올인, 콜, 폴드예요.' },
    { t: 'grid', pos: 'BTN', facing: 'vs4bet', highlight: ['QQ', 'AKs', 'JJ', 'AKo'], claim: { hand: 'JJ', action: 'call' },
      caption: '4벳을 맞으면 전체 손의 약 {{pct}}%만 계속. QQ 이상과 AKs는 5벳 올인, JJ, TT, AKo, AQs는 콜.' },
    { t: 'ask', id: 'q1', q: 'UTG 오픈에 HJ가 3벳, 나는 BTN에서 KQs. 이 앱 차트로는?', choices: ['4벳', '콜', '폴드'], answer: 2,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'BTN', facing: 'cold3bet', hand: 'KQs' },
      why: '두 사람이 강하게 나온 팟이라 KQs도 접어요. TT 이상과 AK, AQs만 계속해요.' },
    { t: 'ask', id: 'q2', q: '내 3벳에 4벳이 왔어요. 나는 BTN, 손은 AKs. 이 앱 차트로는?', choices: ['5벳 올인', '콜', '폴드'], answer: 0,
      pick: ['raise', 'call', 'fold'], calc: { type: 'chart', pos: 'BTN', facing: 'vs4bet', hand: 'AKs' },
      why: 'AKs는 QQ 이상과 함께 5벳 올인 칸이에요. SB, BB라면 KK 이상과 AKs만 올인해요.' },
    { t: 'sum', text: '콜드 3벳과 4벳 앞에선 아주 좁게, 센 페어와 AK 근처만 계속한다.' }
  ]
});

// ── s3-06 보드 날씨 2축(커리큘럼 세션 13, 설계서 3.2절 출제 제외 6번) ──
// classifyFlop 7클래스 → 날씨(맑음 = dry 3종, 비 = mid-wet, low-wet, 구름 = paired, 안개 = monotone) x 높이.
// 높이: 맑음 Q 이상 하이, J 이하 로우 / 비 10 이상 미드, 9 이하 로우 / 구름과 안개 Q 이상 하이, 10과 J 미드, 9 이하 로우
// (puzzles/gen-postflop.js texture와 같은 규칙, texture calc 칩 '이 앱의 분류 기준'). 예시 8개는 날씨마다 2개(층화).
// cards 줄 라벨은 작성할 때 texture calc로 하나씩 대조했다(파일 머리 주석).
LESSONS.push({
  id: 's3-06', node: 's3-06', title: '보드 날씨 2축', est: 3,
  source: '이 앱의 분류 기준(PostflopTables.classifyFlop 7클래스를 날씨와 높이 2축으로, puzzles/gen-postflop.js texture와 같은 규칙)',
  scenes: [
    { t: 'say', text: '플랍은 두 축으로 읽어요. 날씨는 드로우(다음 카드로 완성될 손)가 많은지, 높이는 가장 높은 카드예요.' },
    { t: 'cards', rows: [
        { label: '🌫 안개', cards: ['Qh', '7h', '3h'], note: '세 장 같은 무늬' },
        { label: '☁ 구름', cards: ['8s', '8d', '3c'], note: '같은 숫자가 있음' },
        { label: '🌧 비', cards: ['Jh', 'Th', '9d'], note: '무늬 2장 또는 붙음' },
        { label: '☀ 맑음', cards: ['Ks', '7h', '2d'], note: '무늬 셋, 띄엄띄엄' }
      ],
      calc: { type: 'texture', board: ['Qh', '7h', '3h'] },
      caption: '위부터 차례로 봐요. 세 장 같은 무늬면 안개, 같은 숫자가 있으면 구름, 그다음에 비와 맑음을 가려요.' },
    { t: 'say', text: '같은 무늬가 2장이거나 가장 높은 카드와 낮은 카드의 차이가 4 이하면 비(웨트 보드), 아니면 맑음(드라이 보드).' },
    { t: 'cards', rows: [
        { label: '하이', cards: ['Ks', 'Kd', '4c'], note: 'Q 이상' },
        { label: '미드', cards: ['Js', 'Jd', '6c'], note: '10과 J' },
        { label: '로우', cards: ['7s', '7d', '2c'], note: '9 이하' }
      ],
      calc: { type: 'texture', board: ['Js', 'Jd', '6c'] },
      caption: '높이는 가장 높은 카드로 봐요. 구름과 안개는 Q 이상 하이, 10과 J는 미드, 9 이하는 로우예요.' },
    { t: 'cards', rows: [
        { label: '☀ 맑음', cards: ['As', '8d', '3c'], note: '하이(맨 위 A)' },
        { label: '☀ 맑음', cards: ['Js', '6d', '2c'], note: '로우(맨 위 J)' },
        { label: '🌧 비', cards: ['Kh', 'Qh', '5s'], note: '미드(맨 위 K)' },
        { label: '🌧 비', cards: ['7s', '6d', '5c'], note: '로우(맨 위 7)' }
      ],
      calc: { type: 'texture', board: ['Js', '6d', '2c'] },
      caption: '맑음은 Q 이상 하이, J 이하 로우. 비는 10 이상 미드, 9 이하 로우. 이 둘은 높이가 두 칸뿐이에요.' },
    { t: 'cards', rows: [
        { label: '☁ 구름', cards: ['Qs', 'Qd', '7c'], note: '하이(맨 위 Q)' },
        { label: '☁ 구름', cards: ['9s', '5d', '5c'], note: '로우(맨 위 9)' },
        { label: '🌫 안개', cards: ['Th', '8h', '4h'], note: '미드(맨 위 10)' },
        { label: '🌫 안개', cards: ['As', 'Js', '6s'], note: '하이(맨 위 A)' }
      ],
      calc: { type: 'texture', board: ['9s', '5d', '5c'] },
      caption: '구름과 안개는 세 칸을 다 써요. 둘째 줄은 가장 높은 카드가 {{top}}라서 {{weather}}, {{height}}예요.' },
    { t: 'ask', id: 'q1', q: '이 앱의 분류로 9♥8♥2♣ 플랍의 날씨는?', choices: ['☀ 맑음', '🌧 비', '☁ 구름', '🌫 안개'], answer: 1,
      pick: ['맑음', '비', '구름', '안개'], calc: { type: 'texture', board: ['9h', '8h', '2c'] },
      why: '하트가 2장이라 플러시 드로우가 생겨요. 그래서 {{weather}}, 높이는 {{height}}예요.' },
    { t: 'ask', id: 'q2', q: '이 앱의 분류로 10♠9♠6♠ 플랍의 날씨와 높이는?',
      choices: ['🌫 안개, 미드', '🌫 안개, 로우', '🌧 비, 미드', '☁ 구름, 미드'], answer: 0,
      pick: ['안개, 미드', '안개, 로우', '비, 미드', '구름, 미드'], calc: { type: 'texture', board: ['Ts', '9s', '6s'], of: 'axes' },
      why: '세 장이 모두 스페이드라 {{weather}}, 가장 높은 카드가 {{top}}이라 {{height}}예요.' },
    { t: 'sum', text: '플랍은 날씨(맑음, 비, 구름, 안개)와 높이(하이, 미드, 로우) 두 축으로 나눠 읽는다.' }
  ]
});
