// lessons/data/stage5b.js (채우는 그룹: M6-L56, s5-07~09)
// LESSONS.push({ id, node, title, est, source, scenes: [...] }) 형식으로 누적(부록 B). LESSONS는 stage1.js가 선언한다.
// 계약 L1~L9(lessons/lesson-core.js 머리 주석)와 로드맵 M6 계약 H1(위젯), H13(calc 접두 s56)을 따른다. 순수 데이터(로드 때 엔진을 부르지 않는다).
// 수치 원칙: 캡션, text, why의 퍼센트와 bb는 {{ }} 템플릿과 같은 장면의 calc로만 쓴다.
//   이 그룹의 등록 calc(lessons/calc/stage5b.js): s56Range(이 앱 차트 레인지 콤보 수와 %), s56Paint(색칠 겹침 Jaccard).
//   M5 등록 유형(읽기 전용): spr(남은 유효 스택 ÷ 팟, 소수 첫째 자리), alpha(블러프 본전 폴드율). 내장: eqExact(남은 카드 열거).
// 참고 라벨: 3벳 팟 c벳 경향과 커밋 통념, 체크레이즈 손 묶음, 동크 사용 시점은 엔진으로 검산할 수 없어 장면에 label '참고'를 단다
//   (설계서 3.2절 출제 제외 2번, 8.2절 4번). s5-08은 노드 자체가 참고 노드다(부록 A 49번, 미션은 체험만).
// 전역을 늘리지 않게 IIFE로 감싼다(LESSONS.push만 밖으로 보인다).
// 프리플랍 금액은 이 앱 규칙: 오픈 2.5bb, 3벳은 IP 3배와 OOP 약 3.5배(ai/villain.js, puzzles/gen-math.js spr 템플릿 '3b-oop'과 같은 9bb).

(function() {
  // ── s5-07 3벳팟 포스트플랍(신규 노드, 부록 A 48번: 3벳팟 SPR 장면 2, 질문 2, 드릴 spr 10) ──
  // 팟과 스택: BTN 2.5 오픈, BB 9 3벳, BTN 콜 → 9 + 9 + 0.5(SB) = 18.5, 남은 91 → SPR 4.9.
  //   CO 2.5 오픈, BTN 7.5 3벳, CO 콜 → 7.5 + 7.5 + 0.5 + 1 = 16.5, 남은 92.5 → SPR 5.6(싱글 레이즈 팟 BTN 대 BB는 5.5로 딱 3분의 1).
  //   질문: BTN 2.5 오픈, SB 9 3벳, BTN 콜, BB 폴드 → 9 + 9 + 1 = 19, 남은 91 → 4.8.
  // 좁은 레인지: s56Range(BTN 오픈 554콤보 42%, BB 3벳 134콤보 10%, BTN이 3벳 받고 계속 140콤보 11%, CO 오픈에 BTN 3벳 122콤보 9%).
  LESSONS.push({
    id: 's5-07', node: 's5-07', title: '3벳팟 포스트플랍', est: 3,
    source: '엔진 계산(SPR = 남은 유효 스택 ÷ 팟, 이 앱 차트 콤보 수), 3벳 팟 c벳과 커밋 통념(GTO Wizard 블로그, 참고)',
    scenes: [
      { t: 'say', text: '3벳 팟은 프리플랍에 칩이 많이 들어가요. 팟은 크고 남은 스택은 작아서 SPR이 낮아요.' },
      { t: 'table', heroPos: 'BB', hero: ['As', 'Kd'], board: ['Kh', '7c', '2d'], potTotal: 18.5,
        seats: [
          { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
          { pos: 'BTN', action: '3벳에 콜', stack: 91 }, { pos: 'SB', folded: true }, { pos: 'BB', active: true, stack: 91 }
        ],
        calc: { type: 'spr', stack: 91, potTotal: 18.5 },
        caption: 'BTN 오픈, BB 3벳, BTN 콜. 플랍 팟 {{potTotal}}bb, 남은 스택 {{stack}}bb로 SPR {{spr}}예요.' },
      { t: 'bar', kind: 'amount', rows: [{ label: '싱글 레이즈 팟(BTN 오픈, BB 콜)', bb: 5.5 }, { label: '3벳 팟(CO 오픈, BTN 3벳, CO 콜)', bb: 16.5, hl: true }],
        calc: { type: 'spr', stack: 92.5, potTotal: 16.5 },
        caption: '시작 스택이 같아도 3벳 팟은 플랍 팟이 세 배예요. 팟 {{potTotal}}bb, 남은 {{stack}}bb로 SPR {{spr}}.' },
      { t: 'bar', kind: 'pct',
        rows: [{ label: 'BTN 오픈', v: 'pct1' }, { label: 'BB 3벳(BTN 오픈에)', v: 'pct2', hl: true }, { label: 'BTN이 3벳 받고 계속', v: 'pct3', hl: true }],
        calc: { type: 's56Range', spots: ['rfi|BTN', '3bet|BB@BTN', 'cont3|BTN'] },
        caption: '전체 손 기준 BTN 오픈은 {{pct1}}%지만 BB 3벳은 {{pct2}}%, 그 3벳을 받고 계속하는 손은 {{pct3}}%예요.' },
      { t: 'say', label: '참고', text: '두 레인지가 다 좁고 강해요. 3벳한 쪽 레인지가 더 강한 경우가 많아 c벳을 자주, 작게 치는 편이에요.' },
      { t: 'say', label: '참고', text: 'SPR이 낮으면 벳 몇 번에 스택이 다 들어가요. 좋은 키커의 탑페어 이상은 보통 올인까지 각오해요.' },
      { t: 'ask', id: 'q1', q: 'BTN 오픈, SB 3벳, BTN 콜(BB 폴드). 플랍 팟 19bb, 남은 유효 스택 91bb. SPR은?', choices: ['0.2', '4.8', '9.6'], answer: 1,
        calc: { type: 'spr', stack: 91, potTotal: 19 },
        why: '{{stack}} ÷ {{potTotal}} = {{spr}}. 3벳 팟이라 싱글 레이즈 팟보다 훨씬 낮아요.' },
      { t: 'ask', id: 'q2', q: 'CO 오픈에 BTN이 3벳하는 손은 이 앱 차트로 전체 손의 약 몇 %?', choices: ['9%', '23%', '42%'], answer: 0,
        calc: { type: 's56Range', spot: '3bet|BTN@CO' },
        why: '{{n}}콤보 ÷ 1326 = 약 {{pct}}%. 3벳 팟의 레인지는 이만큼 좁아요.' },
      { t: 'sum', text: '3벳 팟은 SPR이 낮고 두 레인지가 좁고 강해서, 좋은 탑페어 이상은 올인까지 가기 쉽다(참고).' }
    ]
  });

  // ── s5-08 체크레이즈와 동크(신규 노드, 부록 A 49번: 장면 3(참고), 질문 2, 미션 6인 20핸드 체험) ──
  // 체크레이즈 장면: BTN 2.5 오픈, BB 콜 → 플랍 팟 5.5. 플랍 7♥6♠2♠에서 BB 체크, BTN 2bb c벳 → 팟 7.5(c벳 포함), 콜 2.
  //   BB 9♠8♠ = 양방향 스트레이트 드로우(10, 5) + 스페이드 플러시 드로우. J♣J♦ 상대 승률은 eqExact(턴과 리버 990장 조합 열거).
  //   7.5bb로 체크레이즈(이 스트리트에 처음 넣는 칩 7.5) → 알파 = 7.5 ÷ (7.5 + 7.5) = 50%(alpha, potBefore = 상대 c벳 포함).
  // 질문 1: 팟 8(5.5 + 상대 c벳 2.5)에 9로 체크레이즈 → 9 ÷ 17 = 52.9% → 53. 47%(= 8 ÷ 17)는 팟 몫을 거꾸로 센 함정.
  LESSONS.push({
    id: 's5-08', node: 's5-08', title: '체크레이즈와 동크', est: 3,
    source: '엔진 계산(남은 카드 열거 승률, 알파 = 벳 ÷ (팟+벳)), 체크레이즈와 동크 사용 통념(GTO Wizard 블로그, Upswing, 참고)',
    scenes: [
      { t: 'say', text: '프리플랍에 마지막으로 레이즈한 쪽이 주도권을 쥐어요. 콜하고 먼저 말하는 쪽의 공격 수단이 체크레이즈와 동크예요.' },
      { t: 'table', label: '참고', heroPos: 'BB', hero: ['9s', '8s'], board: ['7h', '6s', '2s'], potTotal: 7.5, toCall: 2,
        seats: [
          { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
          { pos: 'BTN', action: 'c벳 2' }, { pos: 'SB', folded: true }, { pos: 'BB', active: true, action: '체크' }
        ],
        calc: { type: 'eqExact', hero: ['9s', '8s'], vs: ['Jc', 'Jd'], board: ['7h', '6s', '2s'] },
        caption: 'BB 체크, BTN c벳. 9♠8♠는 양방향 스트레이트와 플러시 드로우라 J♣J♦에게도 승률 {{eq}}%.' },
      { t: 'say', label: '참고', calc: { type: 'alpha', potBefore: 7.5, bet: 7.5 },
        text: '팟 {{potBefore}}bb(c벳 포함)에 {{bet}}bb로 체크레이즈. 순수 블러프면 상대가 {{pct}}% 넘게 접어야 이득이에요.' },
      { t: 'say', label: '참고', text: '이 손은 콜을 받아도 이길 몫이 커서 접게 하면 좋고, 받아도 괜찮아요. 이게 체크레이즈 세미블러프예요.' },
      { t: 'table', label: '참고', heroPos: 'BB', board: ['Ks', '9d', '4c'], potTotal: 5.5,
        seats: [
          { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
          { pos: 'BTN', action: '프리플랍 오픈' }, { pos: 'SB', folded: true }, { pos: 'BB', active: true, action: '먼저 벳(동크)' }
        ],
        caption: '프리플랍에 콜한 BB가 레이저 BTN보다 먼저 벳하면 동크예요. 플랍 동크는 드물게 써요.' },
      { t: 'say', label: '참고', text: '동크는 대개 보드가 콜한 쪽 레인지에 크게 유리해진 턴, 리버에서 써요. 그 밖엔 체크하고 상대 벳에 답해요.' },
      { t: 'ask', id: 'q1', q: '팟 8bb(상대 c벳 2.5bb 포함)에 9bb로 체크레이즈 블러프. 상대가 몇 % 넘게 접어야 이득일까?',
        choices: ['47%', '53%', '75%'], answer: 1,
        calc: { type: 'alpha', potBefore: 8, bet: 9 },
        why: '알파 = {{bet}} ÷ ({{potBefore}}+{{bet}}) = {{pct}}%. 크게 레이즈할수록 더 많이 접어야 해요.' },
      { t: 'ask', id: 'q2', label: '참고', q: '체크레이즈에 가장 어울리는 손 묶음은?',
        choices: ['셋, 투페어와 강한 드로우', '세컨드 페어 같은 중간 손', '드로우도 없는 에어 전부'], answer: 0,
        why: '체크레이즈는 아주 강한 손과 강한 드로우로 섞고, 중간 손은 보통 콜로 받아요.' },
      { t: 'sum', text: '체크레이즈는 강한 손과 강한 드로우로, 동크는 보드가 콜한 쪽에 유리해질 때 드물게 쓴다(참고).' }
    ]
  });

  // ── s5-09 레인지 색칠(신규 노드, 부록 A 50번: 색칠 위젯 3스팟, 드릴 rangepaint 3, 겹침 70%) ──
  // 위젯(로드맵 M6 계약 H1): rangePaint { spot(puzzles/gen-range.js PAINT_SPOTS 중 하나), goal 0.7, chip false(장면 calc s56Paint가
  //   '이 앱 차트 기준' 칩을 이미 그려 위젯 머리 칩은 뺀다, M6 통합 검증) }. 겹침은
  //   Puzzles.get('rangepaint').score(spot, cells)(Jaccard, 칸 단위). 위젯 모듈이 머지되기 전에는 플레이어가 '다음 업데이트' 카드를 그린다.
  // 스팟 3개: rfi|CO(50칸), rfi|BTN(84칸), vsRfi|BB@BTN(콜과 3벳 97칸), 정답 칸 수는 s56Paint target(차트 모델, verify는 원본 배열).
  // 겹침 예: CO 50칸 중 5칸 빠뜨리고 5칸 더 칠함 → 45 ÷ 55 = 82%(통과), 10칸과 10칸 → 40 ÷ 60 = 67%(미달). 80%(= 40 ÷ 50)는 더 칠한 칸을 잊은 함정.
  var MISS5 = ['K9s', 'Q9s', 'J9s', 'T8s', '97s'], EXTRA5 = ['K8s', 'Q8s', 'J8s', 'T7s', '96s'];
  LESSONS.push({
    id: 's5-09', node: 's5-09', title: '레인지 색칠', est: 3,
    source: '이 앱의 프리플랍 차트(Gto.GTO_RANGES), 겹침 = 같이 칠한 칸 ÷ 둘 중 하나라도 칠한 칸(Jaccard, rangepaint 채점과 같은 정의)',
    scenes: [
      { t: 'say', text: '이번엔 직접 칠해요. 빈 13x13 격자에 이 앱 차트의 레인지를 손가락으로 끌어 칠해요.' },
      { t: 'grid', pos: 'CO', highlight: ['A2s', '76s', 'JTo'], claim: { hand: '76s', action: 'raise' },
        caption: 'CO 오픈 레인지(약 {{pct}}%). 페어 대각선, 위쪽 수딧, 왼쪽 오프수트 덩어리로 기억해요.' },
      { t: 'bar', kind: 'pct', rows: [{ label: '내 겹침', v: 'overlap', hl: true }, { label: '통과 기준', v: 'goal' }],
        calc: { type: 's56Paint', spot: 'rfi|CO', miss: MISS5, extra: EXTRA5 },
        caption: '{{missN}}칸 빼고 {{extraN}}칸 더 칠하면 겹침 {{hit}} ÷ {{union}} = {{overlap}}%.' },
      { t: 'ask', id: 'q1', q: 'CO 오픈 {{target}}칸 중 10칸을 빠뜨리고, 바깥 10칸을 더 칠했어요. 겹침은?', choices: ['67%', '80%', '100%'], answer: 0,
        calc: { type: 's56Paint', spot: 'rfi|CO', goal: 0.7,
          miss: MISS5.concat(['87s', '76s', 'KTo', 'QTo', 'JTo']), extra: EXTRA5.concat(['86s', '65s', 'K9o', 'Q9o', 'J9o']) },
        why: '{{hit}} ÷ {{union}} = {{overlap}}%. 빠뜨린 칸도 더 칠한 칸도 겹침을 깎아 기준 {{goal}}%에 못 미쳐요.' },
      { t: 'widget', name: 'rangePaint', params: { spot: 'rfi|CO', goal: 0.7, chip: false },
        calc: { type: 's56Paint', spot: 'rfi|CO', goal: 0.7 },
        caption: '직접 칠해요: CO 오픈 {{target}}칸. 겹침 {{goal}}% 이상이면 통과예요.' },
      { t: 'widget', name: 'rangePaint', params: { spot: 'rfi|BTN', goal: 0.7, chip: false },
        calc: { type: 's56Paint', spot: 'rfi|BTN', goal: 0.7 },
        caption: 'BTN 오픈은 {{target}}칸으로 더 넓어요. 오프수트 쪽까지 퍼져요. 기준 {{goal}}%.' },
      { t: 'widget', name: 'rangePaint', params: { spot: 'vsRfi|BB@BTN', goal: 0.7, chip: false },
        calc: { type: 's56Paint', spot: 'vsRfi|BB@BTN', goal: 0.7 },
        caption: 'BB가 BTN 오픈에 참여하는 손(콜과 3벳) {{target}}칸. 블라인드 방어는 넓어요.' },
      { t: 'sum', text: '레인지는 페어 대각선, 위쪽 수딧, 왼쪽 오프수트 덩어리로 칠하고, 빠뜨린 칸과 더 칠한 칸이 둘 다 겹침을 깎는다.' }
    ]
  });
})();
