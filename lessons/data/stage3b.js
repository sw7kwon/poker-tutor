// lessons/data/stage3b.js (채우는 그룹: M5-S3B, s3-07~10)
// LESSONS.push({ id, node, title, est, source, scenes: [...] }) 형식으로 누적(부록 B). LESSONS는 stage1.js가 선언한다.
// 계약 L1~L9(lessons/lesson-core.js 머리 주석)를 따른다. 이 파일은 순수 데이터(로드할 때 엔진을 부르지 않는다).
// 수치 원칙: 캡션, text, why의 퍼센트와 bb는 {{ }} 템플릿과 같은 장면의 calc로만 쓴다.
//   이 그룹의 등록 calc(lessons/calc/stage3b.js): cbet(이 앱 c벳 표, 참고), spr(남은 유효 스택 ÷ 팟), eqMulti(멀티웨이 팟 지분 열거).
//   내장 calc: outs(아웃츠 열거와 2열 정확값), 승률 막대 compare의 exact(남은 카드 열거).
// 참고 라벨: c벳 빈도와 사이즈(PostflopTables.CBET), 공짜 스팟의 벳/체크 권고, SPR 커밋 구간 해석, 멀티웨이 사이즈 통념은
//   엔진으로 검산할 수 없어 장면에 label '참고'를 단다(설계서 3.2절 출제 제외 2번, 8.2절 4번).
// 아웃츠 표기는 설계서 8.4절 3번: 2열(턴과 리버 2장 / 다음 1장), 올인이 아니면 다음 1장 기준.

// ── s3-07 c벳 2축(커리큘럼 세션 14, 설계서 2.4절 세션 14) ──
// 'Dry 50~70 / Wet 30~50'의 빈도와 사이즈 모호성을 두 축으로 나눈다. 876 퀴즈 정답은 '빈도 낮추고 66%'(덜 자주, 크게),
// A72는 CBET 표 a-high-dry(75, 33)와 맞춘다. 모든 c벳 수치는 인포지션 오픈 레이저 기준 참고 표.
LESSONS.push({
  id: 's3-07', node: 's3-07', title: 'c벳 2축', est: 3,
  source: 'PostflopTables.CBET(공개 솔버 통념을 근사한 참고 표), GTO Wizard c벳 휴리스틱(참고)',
  scenes: [
    { t: 'say', text: 'c벳은 프리플랍 마지막 레이저가 플랍에서 이어 치는 벳이에요. 얼마나 자주(빈도)와 얼마나 크게(사이즈)를 따로 봐요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Ac', 'Kd'], board: ['As', '7h', '2d'], potTotal: 5.5, label: '참고',
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', active: true }, { pos: 'SB', folded: true }, { pos: 'BB', action: '체크' }
      ],
      calc: { type: 'cbet', board: ['As', '7h', '2d'], aggressor: 'BTN' },
      caption: 'BTN 오픈, BB 콜. A♠7♥2♦에서 BB 체크. {{weather}} 보드라 이 앱 c벳 표로는 {{axisKo}}예요.' },
    { t: 'bar', kind: 'pct', label: '참고',
      rows: [{ label: '빈도: 레인지 중 c벳하는 몫', v: 'freq', hl: true }, { label: '사이즈: 칠 때 팟 대비 크기', v: 'size' }],
      calc: { type: 'cbet', board: ['As', '7h', '2d'], aggressor: 'BTN' },
      caption: '레인지 전체의 약 {{freq}}%를 팟의 {{size}}%로. A♣K♦ 같은 탑페어는 거의 늘 쳐요.' },
    { t: 'ask', id: 'q1', label: '참고', q: 'BTN 오픈, BB 콜. 플랍 8♥7♠6♦에서 BB 체크. 이 앱 c벳 표(참고)로 BTN의 c벳은?',
      choices: ['자주, 작게', '덜 자주, 크게', '덜 자주, 작게', '자주, 크게'], answer: 1,
      pick: ['often-small', 'rarely-big', 'rarely-small', 'often-big'],
      calc: { type: 'cbet', board: ['8h', '7s', '6d'], aggressor: 'BTN', of: 'axis' },
      why: '이어진 낮은 보드는 BB가 많이 맞아요. 덜 자주({{freq}}%), 칠 땐 크게(팟의 {{size}}%).' },
    { t: 'bar', kind: 'pct', label: '참고',
      rows: [{ label: '빈도: 레인지 중 c벳하는 몫', v: 'freq' }, { label: '사이즈: 칠 때 팟 대비 크기', v: 'size', hl: true }],
      calc: { type: 'cbet', board: ['8h', '7s', '6d'], aggressor: 'BTN' },
      caption: '{{weather}} 보드 8♥7♠6♦는 빈도를 {{freq}}%로 낮추고, 칠 땐 팟의 {{size}}%로 드로우에 비싼 값을 물려요.' },
    // 비(classifyFlop mid-wet, low-wet) 중 표(덜 자주, 크게)가 맞는 건 J 이하로 서로 붙은 보드뿐이라(calc cbet 거름 규칙,
    // 전체 비 플랍의 약 5분의 1) 비를 통째로 '덜 자주 크게'라 하지 않는다. s3-06은 K♥Q♥5♠ 같은 보드도 비로 가르친다.
    { t: 'say', label: '참고', text: '맑음과 구름은 자주 작게, 안개는 가끔 작게. 비는 8♥7♠6♦처럼 붙은 낮은 보드면 덜 자주 크게, A♥7♥2♣처럼 띄엄띄엄하면 자주 작게.' },
    { t: 'ask', id: 'q2', q: 'c벳 빈도가 높다는 말은 무슨 뜻일까?',
      choices: ['내 레인지에서 c벳하는 손이 많다', '칠 때마다 크게 친다', '상대가 자주 폴드한다'], answer: 0,
      why: '빈도는 몇 번 치나, 사이즈는 칠 때 얼마나. 두 축은 따로 정해요.' },
    { t: 'ask', id: 'q3', label: '참고', q: 'CO 오픈, BB 콜. 플랍 Q♥8♥3♥에서 BB 체크. 이 앱 c벳 표(참고)로 CO의 c벳은?',
      choices: ['자주, 작게', '덜 자주, 크게', '덜 자주, 작게', '자주, 크게'], answer: 2,
      pick: ['often-small', 'rarely-big', 'rarely-small', 'often-big'],
      calc: { type: 'cbet', board: ['Qh', '8h', '3h'], aggressor: 'CO', of: 'axis' },
      why: '세 장이 같은 무늬(안개)라 조심. 가끔({{freq}}%), 칠 땐 작게(팟의 {{size}}%).' },
    { t: 'sum', text: 'c벳은 빈도와 사이즈를 따로 본다. 맑은 보드는 자주 작게, 서로 붙은 낮은 비 보드는 덜 자주 크게(참고).' }
  ]
});

// ── s3-08 드로우와 세미블러프(커리큘럼 세션 15, 설계서 2.4절 세션 15: x4 단서를 본문으로) ──
// 7♥6♥ 대 K♥9♥2♣: 다음 1장으로 스트레이트 이상이 되는 카드는 하트 9장뿐(outs calc 열거). 플랍 반 팟 벳의 가격(25%)과
// 다음 1장 플러시(19.1%)를 같은 막대에 둔다. 턴 비교는 상대 손(K♣J♦)을 명시한 남은 카드 열거(bar compare exact).
// 상대 손은 이 앱 BB 차트가 BTN 오픈에 콜하는 손(vsRfiBB_LP call의 KJo)으로 고른다(A♣K♣는 이 앱 차트에서 3벳).
LESSONS.push({
  id: 's3-08', node: 's3-08', title: '드로우와 세미블러프', est: 3,
  source: '엔진 계산(아웃츠 HandEval 열거와 조합 확률, 남은 카드 열거 승률), 세미블러프 원칙(참고)',
  scenes: [
    { t: 'say', text: '드로우로 하는 벳을 세미블러프라고 해요. 상대가 접어도 이기고, 콜한 뒤 완성돼도 이겨요.' },
    { t: 'table', heroPos: 'BTN', hero: ['7h', '6h'], board: ['Kh', '9h', '2c'], potTotal: 5.5,
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', active: true }, { pos: 'SB', folded: true }, { pos: 'BB', action: '체크' }
      ],
      calc: { type: 'outs', hero: ['7h', '6h'], board: ['Kh', '9h', '2c'] },
      caption: 'BTN 오픈, BB 콜, 플랍에서 BB 체크. 7♥6♥는 아직 아무것도 안 맞았지만 하트 {{outs}}장 중 하나면 플러시예요.' },
    // 2열 정확값 표(설계서 8.4절 3번): 줄마다 내 손 2장 + 플랍 3장, note = 2장(턴과 리버), 1장(다음 카드) 정확값
    { t: 'cards', rows: [
        { label: '플러시 9장', cards: ['7h', '6h', 'Kh', '9h', '2c'], note: '2장 35.0%, 1장 19.1%', outs: 9, hl: true },
        { label: '양방향 8장', cards: ['Td', '9d', '8c', '7h', '2s'], note: '2장 31.5%, 1장 17.0%', outs: 8 },
        { label: '플러시+양방향 15장', cards: ['Js', 'Ts', '9s', '8d', '2s'], note: '2장 54.1%, 1장 31.9%', outs: 15 }
      ],
      calc: { type: 'outs', hero: ['7h', '6h'], board: ['Kh', '9h', '2c'] },
      caption: '2장 값(어림 x4)은 올인으로 턴과 리버를 다 볼 때만. 내 벳이 콜을 받으면 보장되는 건 다음 1장({{pct1}}%)이에요.' },
    // 세미블러프 대 콜 비교 1: 같은 드로우로 반 팟 벳을 받으면 가격과 다음 1장 완성 확률을 같은 막대에
    { t: 'bar', kind: 'pct', need: { potTotal: 8.25, toCall: 2.75 },
      rows: [{ label: '콜 가격(필요 승률)', v: 'need' }, { label: '다음 1장에 플러시', v: 'pct1', hl: true }],
      calc: { type: 'outs', hero: ['7h', '6h'], board: ['Kh', '9h', '2c'] },
      caption: '이번엔 BB가 팟의 반을 벳. 필요 {{need}}%인데 다음 1장 플러시는 {{pct1}}%라 카드만으론 모자라요.' },
    { t: 'say', label: '참고', text: '모자란 몫은 맞았을 때 더 받는 몫이나, 레이즈로 상대를 접게 하는 몫(세미블러프)으로 채워요.' },
    // 턴에서 다시 반 팟 벳: 리버 1장만 남아 남은 카드 44장 열거 = 다음 1장 기준 승률(하트 9장)
    { t: 'bar', kind: 'compare', exact: { hero: ['7h', '6h'], vs: ['Kc', 'Jd'], board: ['Kh', '9h', '2c', '4d'] },
      need: { potTotal: 16.5, toCall: 5.5 },
      caption: '턴 4♦, 상대(K♣J♦)가 또 팟의 반. 리버 1장 남은 내 승률 {{eq}}%, 필요 {{need}}%. 가격만 보면 폴드 쪽이에요.' },
    { t: 'ask', id: 'q1', q: '내 손 J♠10♠, 보드 9♠8♦2♠. 다음 1장으로 스트레이트 이상이 되는 카드는 몇 장?',
      choices: ['8장', '9장', '15장'], answer: 2,
      calc: { type: 'outs', hero: ['Js', 'Ts'], board: ['9s', '8d', '2s'], of: 'outs' },
      why: '스페이드 9장에 스페이드가 아닌 Q와 7 여섯 장을 더해 {{outs}}장. 드로우가 클수록 세미블러프가 든든해요.' },
    { t: 'ask', id: 'q2', q: '플랍에서 벳을 받았어요(올인 아님). 드로우로 콜할 때와 세미블러프 레이즈의 차이는?',
      choices: ['레이즈는 상대가 접는 갈래가 하나 더 있다', '레이즈하면 다음 카드에 완성될 확률이 오른다', '콜하면 턴과 리버를 둘 다 본다'],
      answer: 0, why: '완성 확률은 그대로예요. 레이즈에는 상대가 접어서 바로 이기는 길이 더해져요.' },
    { t: 'sum', text: '세미블러프는 상대가 접는 몫과 완성되는 몫으로 이기고, 올인이 아니면 완성은 다음 1장 기준으로 센다.' }
  ]
});

// ── s3-09 SPR과 커밋(신규 노드, 부록 A 27번: SPR 막대 3, 커밋 구간은 참고) ──
// 팟과 스택: BTN 2.5 오픈, BB 콜이면 플랍 팟 2.5 + 2.5 + 0.5 = 5.5, 남은 97.5. CO 2.5 오픈, BTN 7.5 3벳, CO 콜이면 16.5와 92.5.
// CO 17.5 4벳(3벳의 약 2.3배, ev.js), BTN 콜이면 36.5와 82.5. SPR은 spr calc(puzzles/gen-math.js spr과 같은 정의와 반올림).
LESSONS.push({
  id: 's3-09', node: 's3-09', title: 'SPR과 커밋', est: 2,
  source: '엔진 계산(SPR = 남은 유효 스택 ÷ 팟), 커밋 구간은 공개 통념(참고)',
  scenes: [
    { t: 'say', text: 'SPR은 남은 유효 스택을 팟으로 나눈 값이에요. 플랍이 깔릴 때 재요.' },
    { t: 'bar', kind: 'amount', rows: [{ label: '플랍 팟', bb: 5.5 }, { label: '남은 유효 스택', bb: 97.5, hl: true }],
      calc: { type: 'spr', stack: 97.5, potTotal: 5.5 },
      caption: 'BTN 오픈, BB 콜. 팟 {{potTotal}}bb, 남은 스택 {{stack}}bb. SPR = {{spr}}.' },
    { t: 'bar', kind: 'amount', rows: [{ label: '플랍 팟', bb: 16.5 }, { label: '남은 유효 스택', bb: 92.5, hl: true }],
      calc: { type: 'spr', stack: 92.5, potTotal: 16.5 },
      caption: '3벳 팟(CO 오픈, BTN 3벳, CO 콜)은 팟이 커서 {{potTotal}}bb, 남은 {{stack}}bb. SPR = {{spr}}.' },
    { t: 'bar', kind: 'amount', rows: [{ label: '플랍 팟', bb: 36.5 }, { label: '남은 유효 스택', bb: 82.5, hl: true }],
      calc: { type: 'spr', stack: 82.5, potTotal: 36.5 },
      caption: '4벳 팟이면 SPR = {{spr}}. 팟만큼 한 번 벳하고 받으면 남은 스택이 팟보다 작아요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Ah', 'Qd'], board: ['Qs', '8c', '4h'], potTotal: 5.5,
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', active: true, stack: 147.5 }, { pos: 'SB', folded: true }, { pos: 'BB', action: '프리플랍 콜', stack: 57.5 }
      ],
      calc: { type: 'spr', stack: 57.5, potTotal: 5.5 },
      caption: '스택이 다르면 작은 쪽(유효 스택)이 기준이에요. 남은 {{stack}}bb로 SPR = {{spr}}.' },
    { t: 'say', label: '참고', text: 'SPR이 약 4 이하면 탑페어로도 올인까지 가기(커밋) 쉽고, 약 10 이상이면 더 센 손이 필요하다는 통념이에요.' },
    { t: 'ask', id: 'q1', q: '플랍 팟 20bb, 남은 유효 스택 90bb. SPR은?', choices: ['0.2', '4.5', '11.0'], answer: 1,
      calc: { type: 'spr', stack: 90, potTotal: 20 },
      why: '{{stack}} ÷ {{potTotal}} = {{spr}}. 스택을 팟으로 나눠요.' },
    { t: 'ask', id: 'q2', label: '참고', q: 'SPR이 2쯤인 4벳 팟, 플랍에서 오버페어를 들었어요. 통념으로는?',
      choices: ['올인까지 각오하고 친다', '팟을 작게 지키다 큰 벳엔 접는다', '플랍에서 바로 접는다'], answer: 0,
      why: 'SPR이 낮으면 팟에 비해 남은 스택이 적어 오버페어로도 보통 올인까지 가요.' },
    { t: 'sum', text: 'SPR은 남은 유효 스택을 팟으로 나눈 값이고, 낮을수록 적은 손으로도 올인까지 간다(참고).' }
  ]
});

// ── s3-10 멀티웨이(커리큘럼 세션 11, 설계서 2.4절 세션 11: '작은 벳 또는 체크, 멀티웨이는 큰 벳 드묾', Galfond) ──
// 지분 막대는 eqMulti(남은 카드 열거, 무승부는 나눔). eq1, eq2, eq3 = 앞에서부터 상대 1, 2, 3명만 있을 때.
// K♦Q♣ 탑페어와 3♦3♠ 셋을 같은 세 상대(J♣J♠, A♥5♥, 8♠7♠), 같은 플랍 K♥8♥3♣로 비교한다.
LESSONS.push({
  id: 's3-10', node: 's3-10', title: '멀티웨이', est: 2,
  source: '엔진 계산(HandEval 남은 카드 열거), Galfond 멀티웨이 원칙과 커리큘럼 세션 11(참고)',
  scenes: [
    { t: 'say', text: '플랍을 셋 이상이 함께 보면 멀티웨이예요. 상대가 늘면 같은 손도 이기기 어려워져요.' },
    { t: 'cards', rows: [
        { label: '나', cards: ['Kd', 'Qc'], hl: true },
        { label: '상대 1', cards: ['Jc', 'Js'] },
        { label: '상대 2', cards: ['Ah', '5h'] },
        { label: '상대 3', cards: ['8s', '7s'] },
        { label: '플랍', cards: ['Kh', '8h', '3c'] }
      ],
      calc: { type: 'eqMulti', hero: ['Kd', 'Qc'], vs: [['Jc', 'Js'], ['Ah', '5h'], ['8s', '7s']], board: ['Kh', '8h', '3c'] },
      caption: '플랍 K♥8♥3♣, 내 K♦Q♣는 탑페어. 넷이 끝까지 가면 내 팟 몫은 {{eq}}%예요.' },
    { t: 'bar', kind: 'pct',
      rows: [{ label: '상대 1명(J♣J♠)', v: 'eq1' }, { label: '2명(+A♥5♥)', v: 'eq2' }, { label: '3명(+8♠7♠)', v: 'eq3', hl: true }],
      calc: { type: 'eqMulti', hero: ['Kd', 'Qc'], vs: [['Jc', 'Js'], ['Ah', '5h'], ['8s', '7s']], board: ['Kh', '8h', '3c'] },
      caption: '상대가 늘 때마다 내 손을 이기는 카드가 늘어요. 1명이면 {{eq1}}%, 3명이면 {{eq3}}%.' },
    { t: 'bar', kind: 'pct',
      rows: [{ label: '상대 1명(J♣J♠)', v: 'eq1' }, { label: '2명(+A♥5♥)', v: 'eq2' }, { label: '3명(+8♠7♠)', v: 'eq3', hl: true }],
      calc: { type: 'eqMulti', hero: ['3d', '3s'], vs: [['Jc', 'Js'], ['Ah', '5h'], ['8s', '7s']], board: ['Kh', '8h', '3c'] },
      caption: '같은 상대들에게 3♦3♠(셋)은 3명을 만나도 {{eq3}}%. 넛에 가까운 손일수록 덜 나뉘어요.' },
    { t: 'say', label: '참고', text: '블러프는 모든 상대가 접어야 통해요. 상대가 늘수록 덜 통하니 블러프는 줄여요.' },
    { t: 'ask', id: 'q1', q: '내 손 A♠A♦, 상대 K♥Q♥와 9♣8♣, 플랍 J♥10♥4♣. 셋이 끝까지 가면 내 팟 몫은 얼마쯤일까?',
      choices: ['약 33%', '약 51%', '약 80%'], answer: 0,
      calc: { type: 'eqMulti', hero: ['As', 'Ad'], vs: [['Kh', 'Qh'], ['9c', '8c']], board: ['Jh', 'Th', '4c'] },
      why: 'K♥Q♥ 하나만 상대하면 {{eq1}}%지만 드로우 둘을 함께 만나면 {{eq}}%로 줄어요.' },
    // 상대 콜은 이 앱 차트에 있는 콜로만(SB는 BTN 오픈에 3벳 아니면 폴드라 s3-02와 어긋나지 않게 CO 오픈, BTN과 BB 콜)
    { t: 'ask', id: 'q2', label: '참고', q: 'CO 오픈에 BTN과 BB가 콜. 플랍 K♠8♦3♣, 내 손(CO) K♥Q♥(탑페어). 통념으로는?',
      choices: ['작게 벳하거나 체크', '팟보다 크게 벳', '올인'], answer: 0,
      why: '멀티웨이는 큰 벳이 드물어요. 누군가 더 센 손일 수 있어 작게 치거나 체크해요.' },
    { t: 'sum', text: '상대가 둘 이상이면 같은 손의 몫이 나뉘니 넛에 가까운 손 위주로 치고, 큰 벳과 블러프는 줄인다(참고).' }
  ]
});
