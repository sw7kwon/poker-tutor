// lessons/data/stage1.js (채우는 패키지: M3-P2)
// 레슨 형식은 부록 B. 각 stageN.js는 LESSONS.push({ id, node, title, est, source, scenes: [...] })로 누적한다.
var LESSONS = (typeof LESSONS !== 'undefined') ? LESSONS : [];

// S1 첫 카드(새싹) 레슨 6개(s1-01~s1-06). s1-boss는 journey-data에서 lesson이 null이라 레슨이 없다(안내는 보스 화면).
// 계약 L1~L8(lessons/lesson-core.js 머리 주석)을 따른다.
//   calc 장면의 숫자와 정답은 엔진 값이다(showdown = HandEval, order = 말하는 순서 표, minraise = game-state.js:110,
//   tocall = 현재 벳 - 내가 이번 스트리트에 낸 칩, eqExact = 남은 카드 전부 열거).
//   order 질문의 pick은 마지막에 말하는 자리(last)를 묻고, 그 calc에는 of: 'last'를 둔다(LessonCore 정답 규칙, of가 없으면 first).
//   카드 행 장면의 note 첫 단어는 HandEval.describe 족보 이름, hl은 이긴 쪽에만 붙인다.
//   캡션, 문장, 해설의 숫자+%와 숫자+bb는 {{ }} 템플릿으로만 쓴다(L5).

// ── s1-01 족보 사다리 ──
LESSONS.push({
  id: 's1-01', node: 's1-01', title: '족보 사다리', est: 3, source: '엔진 계산',
  scenes: [
    { t: 'ask', id: 'q1',
      q: '먼저 감으로 골라 봐요. 플러시(같은 무늬 다섯 장)와 스트레이트(이어진 숫자 다섯 장), 더 센 쪽은?',
      choices: ['플러시', '스트레이트', '둘이 똑같다'], answer: 0,
      why: '플러시가 한 칸 위예요. 같은 무늬 다섯 장이 이어진 숫자보다 만들기 어렵거든요.' },
    { t: 'say', text: '내 카드 2장과 보드 5장, 모두 7장 중에서 가장 좋은 5장을 골라 겨뤄요.' },
    { t: 'cards',
      rows: [
        { label: '로열 플러시', cards: ['As', 'Ks', 'Qs', 'Js', 'Ts'], note: '같은 무늬 A K Q J 10' },
        { label: '스트레이트 플러시', cards: ['9h', '8h', '7h', '6h', '5h'], note: '같은 무늬로 이어진 숫자' },
        { label: '포카드', cards: ['Qs', 'Qh', 'Qd', 'Qc', '4s'], note: '같은 숫자 4장' },
        { label: '풀하우스', cards: ['Ks', 'Kh', 'Kd', '7c', '7s'], note: '트리플 + 원페어' },
        { label: '플러시', cards: ['Ad', 'Jd', '8d', '5d', '3d'], note: '같은 무늬 5장', hl: true },
        { label: '스트레이트', cards: ['Tc', '9d', '8s', '7h', '6c'], note: '이어진 숫자 5장', hl: true },
        { label: '트리플', cards: ['8s', '8h', '8d', 'Kc', '2s'], note: '같은 숫자 3장' },
        { label: '투페어', cards: ['Jh', 'Jc', '4s', '4d', 'Ah'], note: '짝 2개' },
        { label: '원페어', cards: ['Ac', 'Ad', '9s', '6h', '3c'], note: '짝 1개' },
        { label: '하이카드', cards: ['Ks', 'Jd', '8c', '5h', '2s'], note: '맞은 게 없으면 높은 카드' }
      ],
      caption: '위로 갈수록 세요. 다섯 장으로 만들기 어려운 패일수록 위에 있어요.' },
    { t: 'cards',
      rows: [
        { label: '보드', cards: ['As', '8d', '6c', '4h', '2s'] },
        { label: '나', cards: ['Ah', 'Kc'], note: '원페어(A), 킥커 K', hl: true },
        { label: '상대', cards: ['Ad', 'Qh'], note: '원페어(A), 킥커 Q' }
      ],
      calc: { type: 'showdown', a: ['Ah', 'Kc'], b: ['Ad', 'Qh'], board: ['As', '8d', '6c', '4h', '2s'] },
      caption: '둘 다 A {{handA}}. 족보가 같으면 남은 카드(킥커)로 겨뤄요. K가 Q보다 높아 내가 이겨요.' },
    { t: 'ask', id: 'q2',
      q: '보드 Q♥ 9♥ 5♥ 3♣ 2♦. 나 K♥ 7♥, 상대 J♥ 10♥. 누가 이길까?',
      choices: ['상대', '나', '무승부(팟을 나눔)'], answer: 1, pick: ['b', 'a', 'tie'],
      calc: { type: 'showdown', a: ['Kh', '7h'], b: ['Jh', 'Th'], board: ['Qh', '9h', '5h', '3c', '2d'] },
      why: '둘 다 {{handA}}. 플러시끼리는 가장 높은 카드부터 비교해서 K를 가진 내가 이겨요.' },
    { t: 'cards',
      rows: [
        { label: '보드', cards: ['Ks', '9s', '5c', '3d', '2h'] },
        { label: '나', cards: ['9c', 'Jd'], note: '원페어(9), K J 5', hl: true },
        { label: '상대', cards: ['9d', '7s'], note: '원페어(9), K 7 5' }
      ],
      calc: { type: 'showdown', a: ['9c', 'Jd'], b: ['9d', '7s'], board: ['Ks', '9s', '5c', '3d', '2h'] },
      caption: '둘 다 9 {{handA}}에 보드의 K까지 같아요. 다음 카드 J가 7을 이겨 내가 이겨요.' },
    { t: 'sum', text: '족보가 높은 쪽이 이기고, 족보가 같으면 높은 숫자와 킥커를 차례로 비교한다.' }
  ]
});

// ── s1-02 테이블 한 바퀴 ──
LESSONS.push({
  id: 's1-02', node: 's1-02', title: '테이블 한 바퀴', est: 3, source: '엔진 계산',
  scenes: [
    { t: 'table', heroPos: 'BTN', hero: ['Ah', 'Kd'], blinds: { sb: 0.5, bb: 1 },
      seats: [
        { pos: 'UTG', name: '교수' }, { pos: 'HJ', name: '바위' }, { pos: 'CO', name: '콜마스터' },
        { pos: 'BTN', name: '나' }, { pos: 'SB', name: '햇살', bet: 0.5 }, { pos: 'BB', name: '불도저', bet: 1 }
      ],
      focus: 'BTN',
      caption: '자리 이름은 6개예요. 딜러 버튼(BTN) 왼쪽의 SB와 BB는 카드를 받기 전에 블라인드를 내요.' },
    { t: 'ask', id: 'q1',
      q: '프리플랍, 6명 모두 카드를 받았어요. 첫 바퀴에서 가장 마지막에 말하는 자리는?',
      choices: ['BTN', 'BB', 'SB'], answer: 1, pick: ['BTN', 'BB', 'SB'],
      calc: { type: 'order', street: 'preflop', seats: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'], of: 'last' },
      why: '프리플랍은 BB 왼쪽 {{first}}부터 시작해, 블라인드를 미리 낸 {{last}}가 맨 끝이에요.' },
    { t: 'table', heroPos: 'BTN', order: 'preflop', blinds: { sb: 0.5, bb: 1 },
      seats: [
        { pos: 'UTG', name: '교수' }, { pos: 'HJ', name: '바위' }, { pos: 'CO', name: '콜마스터' },
        { pos: 'BTN', name: '나' }, { pos: 'SB', name: '햇살', bet: 0.5 }, { pos: 'BB', name: '불도저', bet: 1 }
      ],
      calc: { type: 'order', street: 'preflop', seats: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] },
      caption: '프리플랍 순서: {{list}}. 시계 방향으로 돌고 {{last}}가 끝이에요.' },
    { t: 'table', heroPos: 'BTN', order: 'postflop', board: ['Kd', '8s', '3c'],
      seats: [
        { pos: 'UTG', name: '교수' }, { pos: 'HJ', name: '바위' }, { pos: 'CO', name: '콜마스터' },
        { pos: 'BTN', name: '나' }, { pos: 'SB', name: '햇살' }, { pos: 'BB', name: '불도저' }
      ],
      calc: { type: 'order', street: 'postflop', seats: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] },
      caption: '플랍부터는 {{first}}부터 시작해요. 마지막은 {{last}}, 남들 선택을 다 보고 정할 수 있어요.' },
    { t: 'ask', id: 'q2',
      q: '플랍, SB와 BB와 CO 세 명이 남았어요. 첫 바퀴에서 가장 마지막에 말하는 자리는?',
      choices: ['CO', 'SB', 'BB'], answer: 0, pick: ['CO', 'SB', 'BB'],
      calc: { type: 'order', street: 'postflop', seats: ['SB', 'BB', 'CO'], of: 'last' },
      why: '플랍부터는 SB부터 시계 방향, 남은 셋은 {{list}} 순서라 {{last}}가 끝이에요.' },
    { t: 'say', text: '게임 화면 안내 1. 내가 결정할 때마다 신호등이 떠요. 🟢 좋은 선택, 🟡 아쉬운 선택, 🔴 손해 보는 선택.' },
    { t: 'say', text: '게임 화면 안내 2. 핸드가 끝나면 📝 총평(결과 패널)이 열려요. 큰 점은 승패, 줄마다 신호등은 결정 점수예요.' },
    { t: 'sum', text: '프리플랍은 BB가, 플랍부터는 BTN이 마지막에 말한다.' }
  ]
});

// ── s1-03 액션과 민레이즈 ──
LESSONS.push({
  id: 's1-03', node: 's1-03', title: '액션과 민레이즈', est: 3, source: '엔진 계산',
  scenes: [
    { t: 'say', text: '앞에 벳이 없으면 ⏭️ 체크(넘기기) 아니면 💰 벳(먼저 걸기). 🏳️ 폴드(포기)는 언제든 할 수 있어요.' },
    { t: 'say', text: '앞에 벳이 있으면 📞 콜(같은 만큼 내기), ⬆️ 레이즈(더 올리기), 🏳️ 폴드. 🔥 올인은 내 칩 전부예요.' },
    { t: 'ask', id: 'q1',
      q: '플랍, 앞사람이 모두 체크해서 내가 낼 돈이 없어요. 내 패가 약하면?',
      choices: ['폴드', '체크'], answer: 1,
      why: '공짜로 다음 카드를 볼 수 있으니 체크예요. 여기서 폴드는 이길 기회만 버려요.' },
    { t: 'table', heroPos: 'BTN', hero: ['7c', '2d'], board: ['Ks', '9h', '4d'], potTotal: 6.5, toCall: 0,
      seats: [
        { pos: 'CO', name: '햇살', action: '체크' }, { pos: 'BTN', name: '나' }, { pos: 'BB', name: '교수', action: '체크' }
      ],
      focus: 'toCall',
      caption: '내가 낼 돈 {{toCall}}bb. 이럴 땐 체크가 공짜예요. 게임에서 여기서 폴드하면 🔴 빨간불이에요.' },
    { t: 'table', heroPos: 'BTN', board: ['Jc', '7d', '2s'], potTotal: 9.5, toCall: 4,
      seats: [{ pos: 'BB', name: '교수', bet: 4, action: '벳 4' }, { pos: 'BTN', name: '나' }],
      focus: 'BB',
      calc: { type: 'minraise', currentBet: 4, lastRaise: 4 },
      caption: '첫 벳이 {{inc}}bb면 최소 레이즈는 {{to}}bb까지(총액), 즉 2배예요.' },
    { t: 'table', heroPos: 'BTN', board: ['Qh', '8d', '4c'], potTotal: 15.5, toCall: 6,
      seats: [
        { pos: 'SB', name: '햇살', bet: 2, action: '벳 2' }, { pos: 'BB', name: '교수', bet: 6, action: '레이즈 6' },
        { pos: 'BTN', name: '나' }
      ],
      focus: 'BB',
      calc: { type: 'minraise', currentBet: 6, lastRaise: 4 },
      caption: '레이즈 뒤에는 현재 벳에 직전 증분 {{inc}}bb를 더해요. 최소 {{to}}bb까지예요.' },
    { t: 'ask', id: 'q2',
      q: '프리플랍, UTG가 3bb로 오픈하고 CO가 9bb로 레이즈했어요. 내가 다시 레이즈하려면 최소 몇 bb까지?',
      choices: ['18bb', '15bb', '12bb'], answer: 1,
      calc: { type: 'minraise', currentBet: 9, lastRaise: 6 },
      why: '직전 증분 {{inc}}bb를 현재 벳에 더하면 {{to}}bb. 무조건 2배가 아니에요.' },
    { t: 'sum', text: '낼 돈이 없으면 체크, 최소 레이즈는 현재 벳에 직전 증분을 더한 만큼이다.' }
  ]
});

// ── s1-04 bb로 세기 ──
LESSONS.push({
  id: 's1-04', node: 's1-04', title: 'bb로 세기', est: 2, source: '엔진 계산',
  scenes: [
    { t: 'ask', id: 'q1',
      q: 'UTG가 2.5bb로 오픈했어요. 나는 BB라 이미 1bb를 냈어요. 콜하려면 몇 bb를 더 내야 할까?',
      choices: ['2.5bb', '1.5bb', '3.5bb'], answer: 1,
      calc: { type: 'tocall', currentBet: 2.5, heroBet: 1 },
      why: '이미 낸 칩은 빼요. 모자란 {{amt}}bb만 더 내면 콜이에요.' },
    { t: 'say', text: 'bb는 빅 블라인드 한 개 크기예요. 칩을 bb로 세면 판이 커져도 같은 눈금으로 읽어요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Ah', 'Td'], board: ['Qd', '8c', '3s'], potTotal: 9.5, toCall: 4,
      seats: [
        { pos: 'BB', name: '교수', stack: 93.5, bet: 4, action: '벳 4' }, { pos: 'BTN', name: '나', stack: 97.5 }
      ],
      focus: 'toCall',
      caption: '팟 {{potTotal}}bb(상대 벳 {{toCall}}bb 포함), 콜 {{toCall}}bb. 이 앱은 늘 이렇게 적어요.' },
    { t: 'bar', kind: 'amount',
      rows: [{ label: '내 스택', bb: 97.5 }, { label: '팟(상대 벳 포함)', bb: 9.5 }, { label: '콜', bb: 4 }],
      caption: '같은 장면을 막대로 보면 내 스택에 비해 팟과 콜이 얼마나 작은지 한눈에 보여요.' },
    { t: 'ask', id: 'q2',
      q: 'BTN이 2.5bb로 오픈했어요. 나는 SB라 이미 0.5bb를 냈어요. 콜하려면 몇 bb를 더?',
      choices: ['2bb', '2.5bb', '3bb'], answer: 0,
      calc: { type: 'tocall', currentBet: 2.5, heroBet: 0.5 },
      why: '이미 낸 블라인드를 빼면 {{amt}}bb예요. 블라인드도 내 칩이에요.' },
    { t: 'ask', id: 'q3',
      q: '플랍, 내가 4bb를 벳했는데 상대가 12bb로 레이즈했어요. 콜하려면 몇 bb를 더?',
      choices: ['12bb', '16bb', '8bb'], answer: 2,
      calc: { type: 'tocall', currentBet: 12, heroBet: 4 },
      why: '이번 스트리트에 이미 낸 칩을 빼면 {{amt}}bb예요.' },
    { t: 'sum', text: '콜 금액은 현재 벳에서 이번 스트리트에 내가 이미 낸 칩을 뺀 만큼이다.' }
  ]
});

// ── s1-05 보드와 내 패 ──
LESSONS.push({
  id: 's1-05', node: 's1-05', title: '보드와 내 패', est: 2, source: '엔진 계산',
  scenes: [
    { t: 'ask', id: 'q1',
      q: '보드 5♠ 6♦ 7♣ 8♥ 9♠. 나 A♥ A♦, 상대 2♣ 3♦. 누가 이길까?',
      choices: ['나', '상대', '무승부(팟을 나눔)'], answer: 2, pick: ['a', 'b', 'tie'],
      calc: { type: 'showdown', a: ['Ah', 'Ad'], b: ['2c', '3d'], board: ['5s', '6d', '7c', '8h', '9s'] },
      why: '둘 다 보드의 {{handA}}가 최선이라 팟을 나눠요(스플릿). 드문 장면이에요.' },
    { t: 'say', text: '보드 5장은 모두의 카드예요. 가장 좋은 5장을 만들 때 내 카드는 2장, 1장, 0장 어느 쪽을 써도 돼요.' },
    { t: 'cards',
      rows: [
        { label: '보드', cards: ['Kh', '9h', '6h', '4h', '2h'] },
        { label: '나', cards: ['Ah', '3c'], note: '플러시(A 높음)', hl: true },
        { label: '상대', cards: ['Qc', 'Jc'], note: '플러시(보드 그대로)' }
      ],
      calc: { type: 'showdown', a: ['Ah', '3c'], b: ['Qc', 'Jc'], board: ['Kh', '9h', '6h', '4h', '2h'] },
      caption: '보드가 이미 {{handB}}예요. 상대는 보드를 그대로 쓰고, 나는 A♥를 넣어 더 높은 플러시로 이겨요.' },
    { t: 'cards',
      rows: [
        { label: '보드', cards: ['Qs', 'Qh', '7d', '7c', '3s'] },
        { label: '나', cards: ['Ad', '5c'], note: '투페어(Q, 7), 킥커 A', hl: true },
        { label: '상대', cards: ['Kd', '4h'], note: '투페어(Q, 7), 킥커 K' }
      ],
      calc: { type: 'showdown', a: ['Ad', '5c'], b: ['Kd', '4h'], board: ['Qs', 'Qh', '7d', '7c', '3s'] },
      caption: '보드만으로 {{handA}}예요. 둘 다 그걸 쓰니 다섯 번째 카드, A와 K로 갈려요.' },
    { t: 'say', text: '아무것도 맞지 않은 패를 에어라고 해요. 에어끼리는 가장 높은 카드부터 비교해요.' },
    { t: 'ask', id: 'q2',
      q: '보드 J♠ 8♦ 5♣ 3♥ 2♠. 나 9♣ 7♦, 상대 K♦ Q♣. 누가 이길까?',
      choices: ['나', '상대', '무승부(팟을 나눔)'], answer: 1, pick: ['a', 'b', 'tie'],
      calc: { type: 'showdown', a: ['9c', '7d'], b: ['Kd', 'Qc'], board: ['Js', '8d', '5c', '3h', '2s'] },
      why: '둘 다 {{handA}}(에어)예요. 가장 높은 카드 K를 가진 상대가 이겨요.' },
    { t: 'sum', text: '보드는 모두의 카드, 7장 중 가장 좋은 5장끼리 겨루고 똑같으면 팟을 나눈다.' }
  ]
});

// ── s1-06 결과와 결정은 다르다 ──
LESSONS.push({
  id: 's1-06', node: 's1-06', title: '결과와 결정은 다르다', est: 3, source: '엔진 계산',
  scenes: [
    { t: 'ask', id: 'q1',
      q: '내가 훨씬 유리할 때 올인했는데 마지막 카드에 졌어요. 올인은 잘못이었을까?',
      choices: ['아니요, 좋은 결정이었어요', '네, 졌으니 잘못이에요'], answer: 0,
      why: '결정은 그 순간 알던 것으로 매겨요. 그 뒤에 나온 카드는 운이에요.' },
    { t: 'bar', kind: 'equity',
      rows: [
        { label: '나 A♠ A♦', exact: { hero: ['As', 'Ad'], vs: ['Ks', 'Kc'], board: ['9c', '5d', '2h'] } },
        { label: '상대 K♠ K♣', exact: { hero: ['Ks', 'Kc'], vs: ['As', 'Ad'], board: ['9c', '5d', '2h'] } }
      ],
      calc: { type: 'eqExact', hero: ['As', 'Ad'], vs: ['Ks', 'Kc'], board: ['9c', '5d', '2h'] },
      caption: '플랍 9♣ 5♦ 2♥에서 둘 다 올인. 남은 두 장의 모든 경우를 세면 내 승률 {{eq}}%예요.' },
    { t: 'cards',
      rows: [
        { label: '보드', cards: ['9c', '5d', '2h', '7s', 'Kh'] },
        { label: '나', cards: ['As', 'Ad'], note: '원페어(A)' },
        { label: '상대', cards: ['Ks', 'Kc'], note: '트리플(K)', hl: true }
      ],
      calc: { type: 'showdown', a: ['As', 'Ad'], b: ['Ks', 'Kc'], board: ['9c', '5d', '2h', '7s', 'Kh'] },
      caption: '그런데 리버에 K♥가 나와 상대가 {{handB}}. 이번 결과는 패배예요.' },
    { t: 'say',
      calc: { type: 'eqExact', hero: ['As', 'Ad'], vs: ['Ks', 'Kc'], board: ['9c', '5d', '2h'] },
      text: '같은 올인을 100번 하면 약 {{eq}}번은 내가 이겨요. 진 한 번 때문에 결정을 바꾸지 않아요.' },
    { t: 'say', text: '첫 실전 10핸드는 코칭 L0(풀코칭)로 해요. 추천 버튼에 금색 테두리가 보이니 보고 따라 해 봐요.' },
    { t: 'say', text: '미션은 이긴 판 수가 아니라 신호등 색으로 매겨요. 📝 총평의 큰 점(승패)보다 줄마다 신호등을 보세요.' },
    { t: 'ask', id: 'q2',
      q: '둘 중 더 좋은 결정은?',
      choices: ['질 게 뻔한 패로 큰 벳에 콜해 이긴 것', '훨씬 유리할 때 올인했는데 진 것'], answer: 1,
      why: '한 판 결과에는 운이 섞여도, 유리할 때 거는 습관이 길게 보면 이겨요.' },
    { t: 'sum', text: '한 판의 결과가 아니라 그 순간 알던 정보로 내린 결정을 평가한다.' }
  ]
});
