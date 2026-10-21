// lessons/data/stage5.js (채우는 그룹: M6-L5A, s5-01~06)
// LESSONS.push({ id, node, title, est, source, scenes: [...] }) 형식으로 누적(부록 B). LESSONS는 stage1.js가 선언한다.
// S5 밸런스(샤크) 레슨 앞 6개: s5-01 레인지 vs 넛 어드밴티지, s5-02 에쿼티 실현(참고), s5-03 폴라 컨덴스드 머지드 캡드,
// s5-04 3장 토이 게임(toyGame 위젯), s5-05 혼합 전략('둘 다 OK', 계약 H3), s5-06 기하 사이즈와 오버벳.
// 계약 L1~L9(lessons/lesson-core.js 머리 주석)와 로드맵 M6 계약 H1, H3, H13을 따른다.
// 수치 원칙: 캡션, text, why의 숫자+%와 숫자+bb는 {{ }} 템플릿과 같은 장면의 calc로만 쓴다. 이 파일이 쓰는 calc 유형은
//   lessons/calc/stage5a.js가 등록한 s5aAdv(두 레인지 적중 비교, 이 앱 차트), s5aShape(레인지 모양, 이 앱의 분류 기준),
//   s5aToy(A/K/Q 토이 게임 무차별 빈도), s5aMix(리버 '둘 다 OK' 판정, 주어진 레인지 열거), s5aGeo(기하 사이즈)와
//   내장 order, eq(PRECALC)다. 화면 그림의 숫자(토이 링의 내 승률, 기하 사이즈 막대의 벳 금액)는 같은 장면 calc와 같은 입력에서 만든다.
// 손으로 적은 사실(테스트 밖, 바꾸면 다시 확인할 것):
//   s5-01 '6♠5♥4♦에선 BB 콜 레인지의 66, 55, 44(셋)와 87s(스트레이트)': 이 앱 차트 vsRfi.BB.call(22-99, 87s)이고 UTG 오픈(66+)에는
//     55, 44, 87s가 없다. s5aAdv cases 1번이 셋 이상 UTG 3콤보(66), BB 13콤보(셋 9 + 87s 4)를 고정한다.
//   s5-05 해설의 승률과 필요 승률은 소수 첫째 자리(eqd, needd). 정수로 쓰면 q1이 25%와 29%인데 3.6%p라 4%p 기준과 어긋나 보인다.
//     'BB의 센 A, K 손은 3벳으로 빠짐': vsRfiBB_LP.threebet(TT+, A9s+, KTs+, AJo+, KQo 등). 'KQ4에선 UTG가 둘 다 앞섬'은 cases 2번(탑페어 이상 33% 대 16%, 셋 이상 5% 대 2%).
//     K72는 쓰지 않는다: 셋 이상 차이가 1.5%p 아래(4.8% 대 3.3%)라 gen-range rangehit compare가 문제로 내지 않는 근소한 차이다.
//   s5-02 'SB는 콜 없이 3벳 아니면 폴드'는 s3-02(Gto.GTO_RANGES.vsRfi.SB 콜 칸 없음)와 같은 말이다.
//   s5-03 모양 예시: 폴라 'QQ+, AKs, AKo, A5s-A3s, 76s, 65s, 54s'(SHAPE_POLAR), 머지드 'QQ+, AKs, AKo, JJ, TT, AQs, AJs, KQs, AQo'(SHAPE_MERGED),
//     컨덴스드 = 이 앱 차트 HJ의 UTG 오픈 콜 칸(vsRfi.HJ: 3벳 JJ+, AQs+, AKo), 캡드 = BB의 BTN 오픈 콜 칸. 캡션의 손 목록은 이 상수와 같게 적었다.
//     네 예시 모두 경계에서 0.05 이상 떨어진다(s5aShape clear true, gen-range가 문제로 낼 만큼 분명).
//   s5-04 토이 게임은 계약 H1 toyGame { potBefore, bet }과 같은 식(무차별 블러프 몫 = bet ÷ (potBefore + 2 x bet),
//     콜 무차별 = potBefore ÷ (potBefore + bet)). 위젯 장면의 params와 calc는 같은 상수(TOY)다.
//   s5-05 '둘 다 OK' 기준은 계약 H3(|승률 - 필요 승률| < 0.04, engine/coach.js marginal과 같은 값, 0.08 이상이면 분명한 쪽).
//   s5-06 기하 사이즈 = puzzles/gen-math.js geoSize와 같은 식(s5aGeo verify가 GenMath.geoSize와도 대조). '오버벳 조건'은 커리큘럼
//     세션 18 공식(넛 어드밴티지와 양극화일수록 크게)이고 참고 라벨.
(function() {
  var SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  // 카드 문자열('Ts') → 화면 글자('10♠')
  function sym(c) { return (c.charAt(0) === 'T' ? '10' : c.charAt(0)) + SYM[c.charAt(1)]; }
  function cardsText(list, sep) { return list.map(sym).join(sep == null ? '' : sep); }
  function combosText(cbs) { return cbs.map(function(cb) { return cardsText(cb); }).join(' '); }
  // 이어지는 줄의 이름 칸(줄 바꿈 없는 빈칸, stage4b와 같은 이유: 위 줄 카드와 세로로 맞춘다)
  var BLANK = ' ';
  function comboRows(label, cbs, hl) {
    return cbs.map(function(cb, i) { var r = { label: i ? BLANK : label, cards: cb.slice() }; if (hl) r.hl = true; return r; });
  }
  // 같은 장면 calc 값(로드 때 LessonCore.calc). LessonCore가 없으면(린트 vm) undefined
  function calcOf(spec) {
    if (typeof LessonCore === 'undefined' || !LessonCore || typeof LessonCore.calc !== 'function') return undefined;
    var r = LessonCore.calc(spec);
    return (r && !r.error) ? r : undefined;
  }
  function seats(map) {
    return ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'].map(function(p) { return map[p] || { pos: p, folded: true }; });
  }

  // ── s5-01 레인지 vs 넛 어드밴티지(신규 노드, 부록 A 42번) ──
  // 두 레인지(이 앱 차트)의 적중을 같은 막대에서 견준다. 탑페어 이상 = 레인지 어드밴티지, 셋 이상 = 넛 어드밴티지.
  var BK = ['Ks', 'Qh', '4d'], BL = ['6s', '5h', '4d'], BA = ['As', 'Kd', '4c'];
  var ADV_K = { type: 's5aAdv', a: 'rfi|UTG', b: 'call|BB@UTG', board: BK };
  var ADV_L = { type: 's5aAdv', a: 'rfi|UTG', b: 'call|BB@UTG', board: BL };
  var ADV_BTN = { type: 's5aAdv', a: 'rfi|BTN', b: 'call|BB@BTN', board: BK };
  var ADV_A = { type: 's5aAdv', a: 'rfi|BTN', b: 'call|BB@BTN', board: BA, of: 'rangeAdv' };
  function advRows(a, b) {
    return [
      { label: a + ' 탑페어 이상', v: 'aTop' }, { label: b + ' 탑페어 이상', v: 'bTop' },
      { label: a + ' 셋 이상', v: 'aNut' }, { label: b + ' 셋 이상', v: 'bNut' }
    ];
  }
  var rowsK = advRows('UTG', 'BB'), rowsL = advRows('UTG', 'BB');
  rowsK[0].hl = true; rowsK[2].hl = true;   // KQ4: UTG가 둘 다 앞선다
  rowsL[0].hl = true; rowsL[3].hl = true;   // 654: 탑페어 이상은 UTG, 셋 이상은 BB
  LESSONS.push({
    id: 's5-01', node: 's5-01', title: '레인지 vs 넛 어드밴티지', est: 3,
    source: '엔진 계산(이 앱 차트 Gto.GTO_RANGES 레인지 콤보 열거, Villain._handStrength 범주), GTO Wizard 블로그(레인지와 넛 어드밴티지, 참고), 레인지/넛 어드밴티지는 손 범주 콤보 비율로 어림(에쿼티 우위의 근사)',
    scenes: [
      { t: 'say', text: '플랍이 깔리면 두 레인지를 견줘요. 누가 더 많이 맞았나(레인지 어드밴티지), 누가 센 손을 더 많이 쥐었나(넛 어드밴티지).' },
      { t: 'table', heroPos: 'BB', board: BK,
        seats: seats({ UTG: { pos: 'UTG', name: '상대', action: '오픈' }, BB: { pos: 'BB', action: '콜', active: true } }),
        caption: 'UTG 오픈, BB 콜, 플랍 ' + cardsText(BK) + '. 이 앱은 탑페어 이상(오버페어 포함)과 셋 이상(스트레이트, 플러시 포함) 비율로 어림해요.' },
      { t: 'bar', kind: 'pct', rows: rowsK, calc: ADV_K,
        caption: 'KQ4는 UTG가 둘 다 앞서요. 탑페어 이상 {{aTop}}% 대 {{bTop}}%, 셋 이상 {{aNut}}% 대 {{bNut}}%.' },
      { t: 'bar', kind: 'pct', rows: rowsL, calc: ADV_L,
        caption: cardsText(BL) + ': 탑페어 이상은 UTG {{aTop}}%가 많지만 셋 이상은 BB {{bNut}}%가 UTG {{aNut}}%보다 많아요.' },
      { t: 'ask', id: 'q1', q: 'UTG 오픈, BB 콜. 플랍 ' + cardsText(BL, ' ') + '에서 셋 이상이 더 많은 쪽(넛 어드밴티지)은?',
        choices: ['UTG', 'BB'], pick: ['a', 'b'], answer: 1, calc: { type: 's5aAdv', a: ADV_L.a, b: ADV_L.b, board: BL, of: 'nutAdv' },
        why: 'BB 콜엔 66, 55, 44(셋)와 87s(스트레이트)가 있어 {{bNut}}%, UTG 오픈은 66 셋뿐이라 {{aNut}}%예요.' },
      { t: 'bar', kind: 'pct', rows: advRows('BTN', 'BB'), calc: ADV_BTN,
        caption: '같은 KQ4도 BTN 오픈은 넓어서 탑페어 이상 {{aTop}}% 대 BB {{bTop}}%. 레인지가 넓으면 차이가 작아져요.' },
      { t: 'say', label: '참고', text: '레인지 어드밴티지가 크면 작은 c벳을 자주, 넛 어드밴티지가 크면 큰 벳까지 쓸 수 있어요. 둘 다 없으면 체크를 늘려요.' },
      { t: 'ask', id: 'q2', q: 'BTN 오픈, BB 콜. 플랍 ' + cardsText(BA, ' ') + '에서 탑페어 이상이 더 많은 쪽(레인지 어드밴티지)은?',
        choices: ['BTN', 'BB'], pick: ['a', 'b'], answer: 0, calc: ADV_A,
        why: 'BTN 오픈엔 A, K가 든 손이 많아 {{aTop}}% 대 {{bTop}}%. BB의 센 A, K 손은 3벳으로 빠졌어요.' },
      { t: 'sum', text: '두 레인지를 견줄 땐 많이 맞은 쪽(레인지 어드밴티지)과 센 손이 많은 쪽(넛 어드밴티지)을 따로 본다.' }
    ]
  });

  // ── s5-02 에쿼티 실현(신규 노드, 부록 A 43번, 참고 레슨) ──
  // 실현 비율 자체는 근사 개념이라 숫자로 쓰지 않는다. 숫자는 말하는 순서(order)와 아무 손 상대 승률(PRECALC)만.
  LESSONS.push({
    id: 's5-02', node: 's5-02', title: '에쿼티 실현', est: 2,
    source: '엔진 계산(말하는 순서, PRECALC 프리플랍 승률), GTO Wizard 블로그와 Upswing(에쿼티 실현, 참고)',
    scenes: [
      { t: 'say', text: '에쿼티는 남은 카드를 끝까지 다 봤을 때 내 몫이에요. 실제 게임에선 그 사이에 벳이 오가요.' },
      { t: 'say', label: '참고', text: '벳에 밀려 접거나 이겨도 덜 받으면 그 몫을 다 못 가져가요. 실제로 가져가는 비율이 에쿼티 실현이에요.' },
      { t: 'table', label: '참고', heroPos: 'BB', board: ['Qd', '8s', '3c'], order: 'postflop',
        seats: seats({ BTN: { pos: 'BTN', name: '상대', action: '오픈' }, BB: { pos: 'BB', action: '콜', active: true } }),
        calc: { type: 'order', street: 'postflop', seats: ['BTN', 'BB'] },
        caption: '플랍부터 {{first}}가 먼저, {{last}}이 나중에 말해요. 나중에 말하는 IP가 상대를 보고 정해 더 많이 실현해요.' },
      { t: 'ask', id: 'q1', label: '참고', q: '두 사람의 승률이 같다면 에쿼티를 더 많이 실현하는 쪽은?',
        choices: ['나중에 말하는 IP', '먼저 말하는 OOP'], answer: 0,
        why: 'IP는 상대를 보고 공짜 카드를 받을지, 팟을 키울지 고를 수 있어요.' },
      { t: 'bar', kind: 'equity', rows: [{ label: 'KJo', precalc: 'eq:KhJd::random' }, { label: 'T9s', precalc: 'eq:Ts9s::random' }],
        caption: '아무 손 상대 프리플랍 승률(끝까지 간다면)은 KJo가 {{eq}}%로 T9s보다 높아요.' },
      { t: 'say', label: '참고', text: '그래도 T9s는 스트레이트, 플러시로 큰 팟을 이기기 쉽고 KJo는 페어가 돼도 킥커에 밀려요. 이런 다루기 쉬움이 플레이어빌리티예요.' },
      { t: 'ask', id: 'q2', label: '참고', q: 'KJo와 T9s 중 승률에 비해 에쿼티 실현이 더 잘 되는 손은?',
        choices: ['T9s', 'KJo'], answer: 0,
        why: '수딧 커넥터는 센 드로우와 넛을 자주 만들어 끝까지 가기 쉽고, 맞으면 크게 이겨요.' },
      { t: 'say', label: '참고', text: '그래서 OOP 콜은 줄여요(블라인드를 이미 낸 BB는 예외). 이 앱 차트의 SB가 3벳 아니면 폴드인 이유 중 하나예요.' },
      { t: 'sum', label: '참고', text: '에쿼티를 늘 다 가져가진 못한다. 포지션(IP)과 다루기 쉬운 손이 실현을 높인다.' }
    ]
  });

  // ── s5-03 폴라 컨덴스드 머지드 캡드(신규 노드, 부록 A 44번, 이 앱의 분류 기준) ──
  // 층과 규칙은 gen-range rangeshape와 같다(s5aShape verify가 gen-range 표로 다시 센다).
  var SHAPE_POLAR = 'QQ+, AKs, AKo, A5s-A3s, 76s, 65s, 54s';
  var SHAPE_MERGED = 'QQ+, AKs, AKo, JJ, TT, AQs, AJs, KQs, AQo';
  var SHAPE_Q = 'KK+, AKs, A5s, A4s, 87s, 76s';
  var tierRows = [{ label: '위(QQ 이상, AK)', v: 'pctTop' }, { label: '가운데(UTG 오픈의 나머지)', v: 'pctMid' }, { label: '아래(그 밖의 손)', v: 'pctBot' }];
  function tiers(hl) { return tierRows.map(function(r, i) { var o = { label: r.label, v: r.v }; if (hl.indexOf(i) >= 0) o.hl = true; return o; }); }
  LESSONS.push({
    id: 's5-03', node: 's5-03', title: '폴라 컨덴스드 머지드 캡드', est: 3,
    source: '이 앱의 분류 기준(gen-range rangeshape 층과 규칙, 1326 콤보 열거), 이 앱 차트(Gto.GTO_RANGES), GTO Wizard 블로그(레인지 모양, 참고)',
    scenes: [
      { t: 'say', text: '레인지 모양은 손을 3층으로 나눠 봐요. 위 = QQ 이상과 AK, 가운데 = 이 앱 UTG 오픈의 나머지 손, 아래 = 그 밖의 손.' },
      { t: 'bar', kind: 'pct', rows: tiers([0, 2]), calc: { type: 's5aShape', range: SHAPE_POLAR },
        caption: '폴라: QQ 이상, AK에 A5s~A3s, 76s, 65s, 54s. 위 {{pctTop}}%와 아래 {{pctBot}}%뿐, 가운데가 비어요.' },
      { t: 'bar', kind: 'pct', rows: tiers([0, 1]), calc: { type: 's5aShape', range: SHAPE_MERGED },
        caption: '머지드: QQ 이상, AK에서 JJ, TT, AQ, AJs, KQs까지 빈틈없이 이어지고 아래가 없어요(가운데 {{pctMid}}%).' },
      { t: 'bar', kind: 'pct', rows: tiers([1]), calc: { type: 's5aShape', spot: 'call|HJ@UTG' },
        caption: '컨덴스드: HJ가 UTG 오픈에 콜하는 손(이 앱 차트). 센 손은 3벳으로 빠져 위가 없고 가운데가 {{pctMid}}%예요.' },
      { t: 'bar', kind: 'pct', rows: tiers([2]), calc: { type: 's5aShape', spot: 'call|BB@BTN' },
        caption: '캡드: BB가 BTN 오픈에 콜하는 손(이 앱 차트). 센 손이 3벳으로 빠져 위가 막혔고 아래가 {{pctBot}}%예요.' },
      { t: 'ask', id: 'q1', q: '레인지가 AA, KK, AKs와 A5s, A4s, 87s, 76s뿐이에요. 이 앱 기준 모양은?',
        choices: ['폴라', '머지드', '컨덴스드', '캡드'], pick: ['polar', 'merged', 'condensed', 'capped'], answer: 0,
        calc: { type: 's5aShape', range: SHAPE_Q },
        why: '위 {{pctTop}}%, 가운데 {{pctMid}}%, 아래 {{pctBot}}%. 가운데 없이 양 끝만 있으면 폴라예요.' },
      { t: 'say', label: '참고', text: '쓰임: 폴라 레인지는 크게 벳하기 좋아요. 상대 레인지가 캡드면 큰 벳에 버틸 센 손이 적어요.' },
      { t: 'ask', id: 'q2', q: 'BB가 BTN 오픈에 콜만 한 레인지가 캡드인 이유는?',
        choices: ['가장 센 손은 3벳으로 빼서', '약한 손을 모두 폴드해서', '블러프만 남겨서'], answer: 0,
        why: 'AA, KK, AK 같은 손은 3벳하니 콜 레인지에는 위층이 없어요.' },
      { t: 'sum', text: '레인지를 위, 가운데, 아래 3층으로 나눠 폴라, 머지드, 컨덴스드, 캡드 네 모양으로 읽는다.' }
    ]
  });

  // ── s5-04 3장 토이 게임(신규 노드, 부록 A 45번, 위젯 toyGame 계약 H1) ──
  // 나는 A(밸류) 또는 Q(블러프)를 반반 받고 상대는 늘 K. 리버에서 나만 벳, 상대는 콜 또는 폴드.
  var TOY = { potBefore: 10, bet: 10 };
  var TOY_CALC = { type: 's5aToy', potBefore: TOY.potBefore, bet: TOY.bet };
  var TOY2 = { type: 's5aToy', potBefore: 12, bet: 6 };
  LESSONS.push({
    id: 's5-04', node: 's5-04', title: '3장 토이 게임', est: 3,
    source: '엔진 계산(무차별 식: 블러프 몫 = 벳 ÷ (팟+2벳), 콜 = 팟 ÷ (팟+벳), 팟은 벳 전), AKQ 게임(Chen과 Ankenman, The Mathematics of Poker)',
    scenes: [
      { t: 'say', text: '카드가 A, K, Q 3장뿐인 리버 게임이에요. 나는 A 아니면 Q를 반반 확률로 받고, 상대는 늘 K를 받아요.' },
      { t: 'cards', rows: [
          { label: '내 밸류', cards: ['Ah'] },
          { label: '상대 K', cards: ['Ks'], hl: true },
          { label: '내 블러프', cards: ['Qh'] }
        ],
        caption: '리버에서 나만 벳할 수 있고 상대는 콜 아니면 폴드. K는 Q를 이기고 A에 지는 블러프캐처예요.' },
      { t: 'ask', id: 'q1', q: '토이 게임에서 내가 A일 때만 벳하면 상대 K는 벳을 보고 어떻게 할까?',
        choices: ['늘 폴드한다', '늘 콜한다'], answer: 0,
        why: '벳이 곧 A라는 뜻이라 K는 접어요. Q로 블러프를 섞어야 A도 콜을 받아요.' },
      { t: 'bar', kind: 'pct', rows: [{ label: '밸류(A)', v: 'value' }, { label: '블러프(Q)', v: 'bluff', hl: true }], calc: TOY_CALC,
        caption: '벳 전 팟 {{potBefore}}bb에 {{bet}}bb 벳이면, 벳 중 블러프가 {{bluff}}%일 때 K는 콜과 폴드가 같아져요.' },
      { t: 'ring', potTotal: TOY.potBefore + TOY.bet, toCall: TOY.bet, eq: TOY.bet / (TOY.potBefore + 2 * TOY.bet), calc: TOY_CALC,
        caption: 'K 눈으로 본 가격이에요. K가 이길 확률(벳 중 블러프) {{bluff}}%가 필요 승률 {{need}}%와 같아 본전이에요.' },
      { t: 'widget', name: 'toyGame', params: { potBefore: TOY.potBefore, bet: TOY.bet }, calc: TOY_CALC,
        caption: '블러프 몫과 K의 콜 빈도를 움직여 봐요. 두 무차별점은 벳 중 블러프 {{bluff}}%, K 콜 {{call}}%예요.' },
      { t: 'bar', kind: 'pct', rows: [{ label: 'K 콜', v: 'call', hl: true }, { label: 'K 폴드', v: 'fold' }], calc: TOY_CALC,
        caption: '반대로 K가 {{call}}% 콜하면 Q 블러프도 이득이 0이에요. 벳 전 팟 ÷ (팟+벳), MDF와 같은 값이에요.' },
      { t: 'ask', id: 'q2', q: '토이 게임, 벳 전 팟 12bb에 6bb(팟의 절반) 벳. 상대 K를 무차별하게 만드는 벳 중 블러프 몫은?',
        choices: ['20%', '25%', '33%', '50%'], answer: 1, calc: TOY2,
        why: '벳 ÷ (팟+2벳) = {{bet}} ÷ ({{potBefore}}+2x{{bet}}) = {{bluff}}%. 작게 걸면 블러프도 줄어요.' },
      { t: 'sum', text: '리버의 균형 잡힌 벳은 블러프 몫을 벳 ÷ (팟+2벳)에 맞춰 상대 블러프캐처를 콜과 폴드 사이에서 무차별하게 만든다.' }
    ]
  });

  // ── s5-05 혼합 전략(신규 노드, 부록 A 46번, 계약 H3 '둘 다 OK') ──
  // 혼합 빈도 막대 3: 토이 게임 K(콜, 폴드), Q(블러프, 체크), 리버 스팟의 승률과 필요 승률.
  // 리버 Q♠8♦5♣3♥2♦, 내 8♠7♠(8 원페어). 보여 주는 스팟: 상대 Q♣J♣, Q♦10♦(탑페어) + 7♥6♥(놓친 스트레이트 드로우), 팟의 3/4 벳.
  // 질문 2개는 같은 4콤보(밸류 3 + 블러프 1)에 가격만 다르다(팟의 2/3 벳 → 둘 다 OK, 팟만큼 벳 → 폴드).
  var H5 = ['8s', '7s'], B5 = ['Qs', '8d', '5c', '3h', '2d'];
  var V5 = [['Qc', 'Jc'], ['Qd', 'Td']], F5 = [['7h', '6h']];
  var MIX_SHOW = { type: 's5aMix', hero: H5, board: B5, combos: V5.concat(F5), potTotal: 35, toCall: 15 };
  var R5 = [['Qc', 'Jc'], ['Qd', 'Td'], ['Ac', '8c'], ['Jh', 'Th']];
  var MIX_Q1 = { type: 's5aMix', hero: H5, board: B5, combos: R5, potTotal: 25, toCall: 10 };
  var MIX_Q2 = { type: 's5aMix', hero: H5, board: B5, combos: R5, potTotal: 20, toCall: 10 };
  var SPOT5 = cardsText(B5) + ', 내 ' + cardsText(H5) + '. ';
  LESSONS.push({
    id: 's5-05', node: 's5-05', title: '혼합 전략', est: 3,
    source: '엔진 계산(토이 게임 무차별 식, 주어진 상대 레인지 열거), 이 앱 코치 marginal 기준(로드맵 M6 계약 H3), GTO Wizard 블로그(혼합 전략, 참고)',
    scenes: [
      { t: 'say', text: '혼합 전략은 같은 상황에서 두 액션을 정해진 비율로 섞는 거예요. 토이 게임의 K와 Q가 그랬어요.' },
      { t: 'bar', kind: 'pct', rows: [{ label: 'K 콜', v: 'call' }, { label: 'K 폴드', v: 'fold' }], calc: TOY_CALC,
        caption: '팟만큼 벳을 맞은 K는 콜 {{call}}%, 폴드 {{fold}}%로 섞어요. 늘 콜하거나 늘 접으면 상대가 노려요.' },
      { t: 'bar', kind: 'pct', rows: [{ label: 'Q 블러프', v: 'qBluff' }, { label: 'Q 체크', v: 'qCheck' }], calc: TOY_CALC,
        caption: '벳하는 쪽도 Q로 블러프 {{qBluff}}%, 체크 {{qCheck}}%를 섞어요. 그래야 벳 중 블러프가 {{bluff}}%가 돼요.' },
      { t: 'cards', rows: [{ label: '내 손', cards: H5, hl: true }, { label: '보드', cards: B5 }]
          .concat(comboRows('상대 밸류', V5), comboRows('상대 블러프', F5)),
        calc: MIX_SHOW,
        caption: '주어진 상대 레인지 기준. 팟 {{potTotal}}bb(상대 벳 {{toCall}}bb 포함), 콜 {{toCall}}bb예요.' },
      { t: 'bar', kind: 'pct', rows: [{ label: '내 승률', v: 'eq', hl: true }, { label: '필요 승률', v: 'need' }], calc: MIX_SHOW,
        caption: '{{n}}콤보 중 {{win}}개를 이겨 승률 {{eqd}}%, 필요 {{needd}}%. 차이가 {{gap}}%p뿐이에요.' },
      { t: 'say', calc: MIX_SHOW,
        text: '콜이 조금 낫지만 차이가 작아요. {{band}}%p 미만은 둘 다 OK, {{clear}}%p 이상은 분명한 답, 그 사이는 퍼즐로 안 내요.',
        caption: '{{band}}%p와 {{clear}}%p는 이 앱 코치와 퍼즐 출제가 쓰는 기준값이에요.' },
      { t: 'ask', id: 'q1', q: SPOT5 + '팟 25bb(상대 벳 10bb 포함), 콜 10bb. 상대가 ' + combosText(R5) + '면?',
        choices: ['콜', '폴드', '둘 다 OK'], pick: ['call', 'fold', 'both'], answer: 2, calc: MIX_Q1,
        why: '{{n}}콤보 중 {{win}}개를 이겨 {{eqd}}%, 필요 {{needd}}%. {{gap}}%p 차이라 둘 다 OK(코치도 초록)예요.' },
      { t: 'ask', id: 'q2', q: SPOT5 + '팟 20bb(상대 벳 10bb 포함), 콜 10bb. 상대가 ' + combosText(R5) + '면?',
        choices: ['콜', '폴드', '둘 다 OK'], pick: ['call', 'fold', 'both'], answer: 1, calc: MIX_Q2,
        why: '같은 레인지라도 팟에 비해 벳이 커지면(팟만큼 벳) 필요 {{needd}}%. 승률 {{eqd}}%와 {{gap}}%p 차이라 폴드가 분명해요.' },
      { t: 'sum', text: '승률이 필요 승률과 거의 같으면 콜도 폴드도 괜찮고, 차이가 크면 한쪽이 분명한 정답이다.' }
    ]
  });

  // ── s5-06 기하 사이즈와 오버벳(커리큘럼 세션 18, 부록 A 47번) ──
  // 막대의 벳 금액은 같은 장면 calc(s5aGeo)를 로드 때 계산한 값이다(LessonCore가 없으면 비움).
  var GEO_SRP = { type: 's5aGeo', potBefore: 5.5, stack: 97.5, n: 3 };
  var GEO_TURN = { type: 's5aGeo', potBefore: 20, stack: 40, n: 2 };
  var GEO_3B = { type: 's5aGeo', potBefore: 20, stack: 90, n: 3 };
  function geoRows(spec) {
    var r = calcOf(spec) || {};
    return [
      { label: '플랍 벳', bb: r.bet1 }, { label: '턴 벳', bb: r.bet2 }, { label: '리버 벳(올인)', bb: r.bet3, hl: true }
    ];
  }
  LESSONS.push({
    id: 's5-06', node: 's5-06', title: '기하 사이즈와 오버벳', est: 3,
    source: '엔진 계산(기하 사이즈 = ((1 + 2 x 스택 ÷ 팟)의 n제곱근 - 1) ÷ 2, gen-math geoSize와 같은 식), GTO Wizard 블로그와 Upswing(오버벳 조건: 넛 어드밴티지와 폴라 레인지, 참고), 커리큘럼 세션 18과 같은 말',
    scenes: [
      { t: 'say', text: '센 손으로 리버까지 스택을 다 넣고 싶을 때, 스트리트마다 팟의 같은 비율로 치는 크기를 기하 사이즈라고 해요.' },
      { t: 'bar', kind: 'amount', rows: geoRows(GEO_SRP), calc: GEO_SRP,
        caption: 'BTN 오픈, BB 콜. 팟 {{potBefore}}bb, 스택 {{stack}}bb를 3번에 다 넣기로 하면 팟의 약 {{pct}}%씩이에요.' },
      { t: 'say', label: '참고', text: '싱글 레이즈 팟에서 3번 다 넣을 손은 드물어요. 보통 플랍 벳은 더 작아요. 이 크기는 다 넣기로 정했을 때의 계산이에요.' },
      { t: 'say', text: '벳과 콜이 오갈 때마다 팟이 (1 + 2 x 비율)배로 커져요. 그래서 같은 비율이어도 뒤로 갈수록 벳 금액이 커져요.' },
      { t: 'ask', id: 'q1', q: '턴, 팟 20bb, 유효 스택 40bb. 턴과 리버 2번에 같은 비율로 쳐서 올인하려면 팟의 약 몇 %?',
        choices: ['약 62%', '약 73%', '약 100%'], answer: 0, calc: GEO_TURN,
        why: '((1 + 2 x 스택 ÷ 팟)의 제곱근 - 1) ÷ 2 = 약 {{pct}}%. 턴 {{bet1}}bb, 리버 {{bet2}}bb예요.' },
      { t: 'bar', kind: 'amount', rows: geoRows(GEO_3B), calc: GEO_3B,
        caption: '3벳 팟은 팟 {{potBefore}}bb에 스택 {{stack}}bb로 스택이 팟에 비해 짧아, 매번 팟의 약 {{pct}}%면 다 들어가요.' },
      { t: 'say', label: '참고', text: '팟보다 큰 오버벳은 보통 내 레인지에 넛이 더 많고(넛 어드밴티지), 벳하는 손이 폴라일 때 써요.' },
      { t: 'ask', id: 'q2', label: '참고', q: '오버벳이 가장 잘 어울리는 상황은?',
        choices: ['내 레인지에 넛이 더 많고 상대는 캡드', '두 레인지가 비슷하게 맞은 보드', '세 명 이상 남은 멀티웨이 팟'], answer: 0,
        why: '상대가 버틸 센 손이 적고 내 센 손이 많을 때 큰 벳이 가장 많이 벌어요. 멀티웨이는 큰 벳이 드물어요.' },
      { t: 'sum', text: '스택을 여러 스트리트에 다 넣기로 했다면 기준값은 매번 같은 팟 비율(기하 사이즈)이고, 그 비율이 팟보다 크면 오버벳이다.' }
    ]
  });
})();
