// lessons/data/stage4.js (채우는 그룹: M5-S4A, s4-01~05)
// LESSONS.push({ id, node, title, est, source, scenes: [...] }) 형식으로 누적(부록 B). LESSONS는 stage1.js가 선언한다.
// 계약 L1~L9(lessons/lesson-core.js 머리 주석)를 따른다. 이 파일은 순수 데이터(로드할 때 엔진을 부르지 않는다).
// 수치 원칙: 캡션, text, why의 숫자는 {{ }} 템플릿과 같은 장면의 calc로만 쓴다. 이 파일이 쓰는 calc 유형은
//   lessons/calc/stage4a.js가 등록한 combos(콤보 수, 1326 열거로 검산), rangehit(레인지 적중 분포, Villain._handStrength 범주),
//   mdf(벳 전 팟 ÷ (팟+벳)), suspects(용의자 지우기 규칙 v1, 로드맵 계약 F10, 화면에는 '이 앱의 지우기 규칙')뿐이다.
// 손으로 적은 사실(테스트 밖, 바꾸면 다시 확인할 것):
//   s4-01 카드 그림 줄(AA 6줄, AKs 4줄, 남은 KK 3줄, 남은 A 3장과 K 3장)은 같은 장면 calc combos의 n과 같은 조합이다.
//   s4-02 막대 캡션 '셋과 투페어': 이 예시(BB 콜 레인지, 내 손 A♥J♦, 보드 J♠7♣3♦2♥Q♠)에서 리버까지 남는 콤보는
//     22, 33, 77(셋) 9개와 QJo, J7s(투페어) 5개(M5-S4A가 열거로 확인).
//   s4-03 막대의 hl 줄(약한 페어 ◀ 내 손)은 같은 장면 rangehit heroCat 'weak'와 같고, 질문 q1이 그 값을 엔진으로 묻는다.
//   s4-03 참고 문장: Q♠7♥2♦에서 탑페어 이상은 BTN 오픈(rfi.BTN) 18%, BB 콜(vsRfiBB_LP.call에서 3벳 칸을 뺀 것) 13%
//     (rangehit 'rfi|BTN'과 'call|BB@BTN', 내 손 없이, M5-S4A 리뷰가 열거로 확인). BTN이 이 보드에 c벳을 자주 하는 표준 이론과 같은 방향.
//   s4-05 내 손 8♥8♣: 이 앱 차트에서 BB가 BTN 오픈(vsRfiBB_LP)과 UTG 오픈(vsRfi.BB)에 콜하는 손이다(JJ, TT는 3벳 칸).
//   s4-04는 calc 없는 참고(공개 솔버 통념) 레슨이라 장면마다 label '참고'.

// ── s4-01 콤보 세기(신규 노드, 부록 A 31번) ──
LESSONS.push({
  id: 's4-01', node: 's4-01', title: '콤보 세기', est: 3,
  source: '엔진 계산(52장 1326조합 열거, Range.parse)',
  scenes: [
    { t: 'say', text: 'AA라는 손도 실제 카드로는 여러 조합이 있어요. 이 조합 하나하나를 콤보라고 불러요.' },
    { t: 'cards', rows: [
        { label: '1', cards: ['As', 'Ah'] }, { label: '2', cards: ['As', 'Ad'] }, { label: '3', cards: ['As', 'Ac'] },
        { label: '4', cards: ['Ah', 'Ad'] }, { label: '5', cards: ['Ah', 'Ac'] }, { label: '6', cards: ['Ad', 'Ac'] }
      ],
      calc: { type: 'combos', range: 'AA' },
      caption: 'AA 같은 페어는 에이스 4장 중 2장을 고르는 조합이라 {{n}}콤보예요.' },
    { t: 'cards', rows: [
        { label: '스페이드', cards: ['As', 'Ks'] }, { label: '하트', cards: ['Ah', 'Kh'] },
        { label: '다이아', cards: ['Ad', 'Kd'] }, { label: '클럽', cards: ['Ac', 'Kc'] }
      ],
      calc: { type: 'combos', range: 'AKs' },
      caption: 'AKs 같은 수딧은 두 장의 무늬가 같은 짝만 되니 {{n}}콤보예요.' },
    { t: 'ask', id: 'q1', q: 'AKo(두 장의 무늬가 다른 AK)는 몇 콤보일까?', choices: ['4개', '6개', '12개', '16개'], answer: 2,
      calc: { type: 'combos', range: 'AKo' },
      why: 'A 4장 x K 4장 = 16가지 중 무늬가 같은 4개를 빼면 {{n}}개예요.' },
    { t: 'cards', rows: [
        { label: '보드', cards: ['Ks', '7h', '2d'] },
        { label: '남은 KK', cards: ['Kh', 'Kd'], hl: true }, { label: '', cards: ['Kh', 'Kc'], hl: true }, { label: '', cards: ['Kd', 'Kc'], hl: true }
      ],
      calc: { type: 'combos', range: 'KK', dead: ['Ks', '7h', '2d'] },
      caption: '보드에 K♠이 보이면 상대는 K♠이 든 KK를 못 들어요. {{full}}콤보가 {{n}}콤보로 줄어요.' },
    { t: 'cards', rows: [
        { label: '보드', cards: ['As', '7h', '2d'] }, { label: '내 손', cards: ['Kc', 'Qc'] },
        { label: '남은 A', cards: ['Ah', 'Ad', 'Ac'], hl: true }, { label: '남은 K', cards: ['Ks', 'Kh', 'Kd'], hl: true }
      ],
      calc: { type: 'combos', range: 'AK', dead: ['As', '7h', '2d', 'Kc', 'Qc'] },
      caption: '내 손 카드도 지워요. 상대 AK는 A 3장 x K 3장 = {{n}}콤보만 남아요(원래 {{full}}).' },
    { t: 'ask', id: 'q2', q: '보드 Q♠ 8♦ 3♣. 상대 레인지 QQ, 88의 남은 콤보는 몇 개?', choices: ['6개', '9개', '12개'], answer: 0,
      calc: { type: 'combos', range: 'QQ, 88', dead: ['Qs', '8d', '3c'] },
      why: 'Q와 8이 한 장씩 보여 페어마다 3콤보만 남아 {{n}}개예요(원래 {{full}}).' },
    { t: 'ask', id: 'q3', q: '보드 A♥ J♠ 5♦. 상대 레인지 JJ+, AK의 남은 콤보는 몇 개?', choices: ['24개', '30개', '34개', '40개'], answer: 1,
      calc: { type: 'combos', range: 'JJ+, AK', dead: ['Ah', 'Js', '5d'] },
      why: 'JJ 3, QQ 6, KK 6, AA 3, AK 12(A가 3장)를 더해 {{n}}개, 보드가 {{removed}}개를 지웠어요.' },
    { t: 'sum', text: '페어 6, 수딧 4, 오프수트 12콤보에서 출발해 보드와 내 손에 보이는 카드만큼 뺀다.' }
  ]
});

// ── s4-02 용의자 명단(커리큘럼 세션 19 핸드 리딩, 부록 A 32번) ──
// 예시: BTN(나) A♥J♦ 오픈, BB 콜. 플랍 J♠7♣3♦ BB 체크 콜, 턴 2♥ BB 체크 콜, 리버 Q♠ BB 벳.
// 명단은 리버에서 거꾸로 읽는다(보이는 카드 전부, 보드 5장과 내 손을 처음부터 뺀다. 계약 F10 '시작').
// 숫자는 suspects calc(이 앱의 지우기 규칙 v1). 같은 손을 단계만 늘려 가며 부른다.
LESSONS.push({
  id: 's4-02', node: 's4-02', title: '용의자 명단', est: 3,
  source: '이 앱의 지우기 규칙 v1(로드맵 계약 F10)과 이 앱 차트(Gto.GTO_RANGES vsRfiBB_LP) 열거',
  scenes: [
    { t: 'say', text: '용의자 명단은 상대가 들 수 있는 손 목록이에요. 액션마다 이 앱의 지우기 규칙으로 지워요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Ah', 'Jd'], board: ['Js', '7c', '3d', '2h', 'Qs'],
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', active: true }, { pos: 'SB', folded: true }, { pos: 'BB', name: '상대', action: '리버 벳' }
      ],
      caption: 'BTN 오픈에 BB 콜, 플랍과 턴은 BB가 체크 콜, 리버에 BB가 벳. 이 손을 처음부터 읽어요.' },
    { t: 'grid', pos: 'BB', facing: true, opener: 'BTN',
      calc: { type: 'suspects', spot: 'call|BB@BTN', hero: ['Ah', 'Jd'], board: ['Js', '7c', '3d', '2h', 'Qs'], steps: [] },
      caption: '처음 명단은 이 앱 차트에서 BB가 콜하는 칸. 보이는 카드를 빼면 {{n0}}콤보예요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Ah', 'Jd'], board: ['Js', '7c', '3d'],
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', action: 'c벳' }, { pos: 'SB', folded: true }, { pos: 'BB', name: '상대', action: '체크 후 콜', active: true }
      ],
      calc: { type: 'suspects', spot: 'call|BB@BTN', hero: ['Ah', 'Jd'], board: ['Js', '7c', '3d', '2h', 'Qs'], steps: ['flop'] },
      caption: '규칙 1, 플랍에서 계속하면 에어이면서 드로우(플러시, 양방향)도 없는 손을 지워요. {{n0}}에서 {{n1}}콤보로.' },
    { t: 'table', heroPos: 'BTN', hero: ['Ah', 'Jd'], board: ['Js', '7c', '3d', '2h'],
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', action: '벳' }, { pos: 'SB', folded: true }, { pos: 'BB', name: '상대', action: '체크 후 콜', active: true }
      ],
      calc: { type: 'suspects', spot: 'call|BB@BTN', hero: ['Ah', 'Jd'], board: ['Js', '7c', '3d', '2h', 'Qs'], steps: ['flop', 'turn'] },
      caption: '규칙 2, 턴에서 또 계속하면 약한 페어 이하이면서 드로우 없는 손도 지워요. {{n1}}에서 {{n2}}콤보로.' },
    { t: 'ask', id: 'q1', q: 'BTN 오픈에 BB 콜, 내 손 A♥J♦, 보드 J♠7♣3♦2♥Q♠. BB가 플랍, 턴 콜 뒤 리버 벳. 이 앱의 지우기 규칙으로 남은 콤보는?',
      choices: ['14개', '46개', '142개', '387개'], answer: 0,
      calc: { type: 'suspects', spot: 'call|BB@BTN', hero: ['Ah', 'Jd'], board: ['Js', '7c', '3d', '2h', 'Qs'], steps: ['flop', 'turn', 'river'] },
      why: '규칙 3, 리버에서 계속하면 중간 미만(약한 페어, 에어)을 지워요. {{n2}}에서 {{n}}콤보로.' },
    { t: 'bar', kind: 'pct', rows: [
        { label: '처음', v: 'p0' }, { label: '플랍 콜 뒤', v: 'p1' }, { label: '턴 콜 뒤', v: 'p2' }, { label: '리버 벳 뒤', v: 'p3', hl: true }
      ],
      calc: { type: 'suspects', spot: 'call|BB@BTN', hero: ['Ah', 'Jd'], board: ['Js', '7c', '3d', '2h', 'Qs'], steps: ['flop', 'turn', 'river'] },
      caption: '명단이 {{n0}}에서 {{n}}콤보로 줄었고 남은 건 셋과 투페어. 실제 상대는 블러프도 섞어요.' },
    { t: 'ask', id: 'q2', q: '이 앱의 지우기 규칙에서 상대가 턴에 또 콜했을 때 명단에 남겨 두는 손은?',
      choices: ['약한 페어지만 드로우도 있는 손', '드로우 없는 약한 페어', '드로우 없는 에어'], answer: 0,
      why: '턴까지는 드로우가 있으면 남겨요. 지우는 건 약한 페어 이하이면서 드로우 없는 손이에요.' },
    { t: 'sum', text: '액션마다 그 스트리트에서 계속하기엔 너무 약한 손을 지워 상대의 용의자 명단을 좁힌다.' }
  ]
});

// ── s4-03 레인지 적중 막대(신규 노드, 부록 A 33번) ──
// 범주는 Villain._handStrength(gen-range CATS와 같다). 셋 이상 = 넛 + 강함, 중간 = 오버페어, 탑페어, 트립스, 두 장 다 쓰는 투페어.
// 같은 플랍 Q♠7♥2♦에서 BTN 오픈(넓다)과 UTG 오픈(좁다)을 비교한다. 두 막대 모두 네 줄 합이 100, 위 두 줄 합이 탑페어 이상.
LESSONS.push({
  id: 's4-03', node: 's4-03', title: '레인지 적중 막대', est: 3,
  source: '엔진 계산(이 앱 차트 Gto.GTO_RANGES 레인지 콤보 열거, Villain._handStrength 범주)',
  scenes: [
    { t: 'say', text: '상대 손 하나를 찍는 대신 상대 레인지 전체가 이 플랍에 얼마나 맞았는지 막대로 봐요.' },
    { t: 'table', heroPos: 'BB', hero: ['8s', '7s'], board: ['Qs', '7h', '2d'],
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', name: '상대', action: '오픈' }, { pos: 'SB', folded: true }, { pos: 'BB', action: '콜', active: true }
      ],
      caption: 'BTN 오픈에 BB인 내가 8♠7♠로 콜. 플랍 Q♠7♥2♦에서 내 손은 세컨드 페어예요.' },
    { t: 'ask', id: 'q1', q: 'BTN 오픈 레인지, 플랍 Q♠ 7♥ 2♦. 내 손 8♠7♠는 적중 막대의 어느 줄일까?',
      choices: ['셋 이상', '중간(탑페어, 오버페어 등)', '약한 페어', '에어(드로우 포함)'], answer: 2,
      pick: ['strong', 'medium', 'weak', 'air'],
      calc: { type: 'rangehit', spot: 'rfi|BTN', board: ['Qs', '7h', '2d'], hero: ['8s', '7s'], of: 'heroCat' },
      why: '보드의 가장 높은 카드(Q)가 아닌 7과 맞은 페어라 약한 페어 줄이에요.' },
    { t: 'bar', kind: 'pct', rows: [
        { label: '셋 이상', v: 'pctStrong' }, { label: '중간(탑페어, 오버페어 등)', v: 'pctMid' },
        { label: '약한 페어 ◀ 내 손', v: 'pctWeak', hl: true }, { label: '에어(드로우 포함)', v: 'pctAir' }
      ],
      calc: { type: 'rangehit', spot: 'rfi|BTN', board: ['Qs', '7h', '2d'], hero: ['8s', '7s'] },
      caption: 'BTN 오픈 {{total}}콤보 중 탑페어 이상(위 두 줄)은 {{pctTop}}%, 에어가 {{pctAir}}%로 가장 많아요.' },
    { t: 'bar', kind: 'pct', rows: [
        { label: '셋 이상', v: 'pctStrong' }, { label: '중간(탑페어, 오버페어 등)', v: 'pctMid' },
        { label: '약한 페어', v: 'pctWeak' }, { label: '에어(드로우 포함)', v: 'pctAir' }
      ],
      calc: { type: 'rangehit', spot: 'rfi|UTG', board: ['Qs', '7h', '2d'] },
      caption: '같은 플랍을 UTG 오픈 레인지로 보면 탑페어 이상이 {{pctTop}}%. 좁고 강한 레인지가 더 많이 맞아요.' },
    { t: 'ask', id: 'q2', q: 'BTN 오픈 레인지, 플랍 A♥ K♣ 4♦. 탑페어 이상은 약 몇 %?', choices: ['약 12%', '약 22%', '약 32%', '약 42%'], answer: 2,
      calc: { type: 'rangehit', spot: 'rfi|BTN', board: ['Ah', 'Kc', '4d'] },
      why: '오픈 레인지엔 A와 K가 든 손이 많아 탑페어 이상이 약 {{pctTop}}%로 Q72보다 많아요.' },
    { t: 'say', label: '참고', text: '벳을 자주 할지는 두 사람 막대를 견줘 정해요. Q72에선 BTN 오픈 레인지가 BB 콜 레인지보다 더 많이 맞아 BTN이 c벳을 자주 해요.' },
    { t: 'sum', text: '상대 레인지 전체를 범주별로 세어 보면 내 손이 그 안 어디쯤인지 보인다.' }
  ]
});

// ── s4-04 턴 배럴과 프로브(커리큘럼 세션 17, 부록 A 34번, 참고 레슨) ──
// calc 없는 개념 레슨. 턴 카드 유형 3(겁주는 카드, 이어지는 카드, 빈 카드)과 프로브. 공개 솔버 통념이라 장면마다 label '참고'.
// 이어지는 카드 예(8♠6♥2♦ 턴 5♣): 이 앱 차트에서 BB의 BTN 상대 콜 레인지에는 74s, 43s, 53s, 63s처럼 낮은 연결 손이 있고
//   BTN 오픈 레인지에는 없다(Gto.GTO_RANGES rfi.BTN, vsRfiBB_LP.call).
LESSONS.push({
  id: 's4-04', node: 's4-04', title: '턴 배럴과 프로브', est: 2,
  source: '공개 솔버 통념(GTO Wizard 턴 플레이 해설, Upswing) 참고',
  scenes: [
    { t: 'say', text: '플랍에 c벳했다면 턴에 또 칠지(배럴) 정해요. 턴 카드가 누구 레인지에 유리한지 봐요.' },
    { t: 'table', label: '참고', heroPos: 'BTN', board: ['Ks', '7h', '2d', 'Ac'],
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', active: true }, { pos: 'SB', folded: true }, { pos: 'BB', name: '상대', action: '체크' }
      ],
      caption: '겁주는 카드: A, K처럼 높은 카드는 오픈한 쪽 레인지에 더 많아 계속 치기 좋아요.' },
    { t: 'table', label: '참고', heroPos: 'BTN', board: ['8s', '6h', '2d', '5c'],
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', active: true }, { pos: 'SB', folded: true }, { pos: 'BB', name: '상대', action: '체크' }
      ],
      caption: '이어지는 카드: 낮고 이어지는 카드는 BB 콜 레인지의 낮은 연결 손을 완성해 줘요. 체크도 섞어요.' },
    { t: 'table', label: '참고', heroPos: 'BTN', board: ['Ks', '7h', '2d', '3c'],
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', active: true }, { pos: 'SB', folded: true }, { pos: 'BB', name: '상대', action: '체크' }
      ],
      caption: '빈 카드: 아무것도 바꾸지 않은 카드라면 강한 손과 좋은 드로우로 계속 치고, 나머지는 쉬어요.' },
    { t: 'table', label: '참고', heroPos: 'BB', board: ['Ks', '7h', '2d', '6c'],
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', name: '상대', action: '플랍 체크' }, { pos: 'SB', folded: true }, { pos: 'BB', active: true }
      ],
      caption: '프로브: 오픈한 쪽이 플랍을 체크로 넘기면 강한 손이 적어요. 턴에 BB가 먼저 치는 벳이에요.' },
    { t: 'ask', id: 'q1', label: '참고', q: 'BTN이 K♠7♥2♦에 c벳, 턴에 A♣. 오픈한 BTN에게 이 턴 카드는?',
      choices: ['계속 치기 좋은 카드', '멈추고 체크할 카드'], answer: 0,
      why: 'A와 K가 든 손은 오픈한 쪽 레인지에 더 많아 겁주는 카드가 돼요.' },
    { t: 'ask', id: 'q2', q: 'BTN이 플랍을 체크로 넘겼어요. 턴에 BB가 먼저 벳하는 것을 뭐라고 할까?',
      choices: ['프로브', '3벳', '체크레이즈'], answer: 0,
      why: '플랍에서 공격하지 않은 상대에게 턴에 먼저 거는 벳을 프로브라고 해요.' },
    { t: 'sum', text: '턴 카드가 누구 레인지에 유리한지 보고 배럴을 정하고, 상대가 플랍을 넘기면 프로브를 생각한다.' }
  ]
});

// ── s4-05 리버 블러프캐처와 MDF(커리큘럼 세션 16, 부록 A 35번, 설계서 8.3절 2(b) 문구) ──
// MDF = 벳 전 팟 ÷ (벳 전 팟 + 벳)(gen-math mdf와 같은 '벳 전 팟' 표기). 숫자는 mdf calc. 테이블 그림의 팟은 상대 벳 포함(8.4절).
LESSONS.push({
  id: 's4-05', node: 's4-05', title: '리버 블러프캐처와 MDF', est: 3,
  source: '엔진 계산(MDF 공식), 설계서 8.3절 2(b), GTO Wizard MDF 해설',
  scenes: [
    { t: 'table', heroPos: 'BB', hero: ['8h', '8c'], board: ['Ks', '9h', '5c', '3d', '2s'], potTotal: 30, toCall: 10, focus: 'toCall',
      seats: [
        { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', name: '상대', action: '벳', bet: 10 }, { pos: 'SB', folded: true }, { pos: 'BB', active: true }
      ],
      calc: { type: 'mdf', potBefore: 20, bet: 10 },
      caption: '리버, 벳 전 팟 {{potBefore}}bb, 상대 벳 {{bet}}bb. 내 레인지에서 얼마나 계속해야 할까?' },
    { t: 'ask', id: 'q1', q: '리버, 벳 전 팟 20bb, 상대 벳 10bb(팟 절반). MDF(내 레인지 중 최소 계속할 비율)는?',
      choices: ['33%', '50%', '67%', '75%'], answer: 2,
      calc: { type: 'mdf', potBefore: 20, bet: 10 },
      why: 'MDF = 벳 전 팟 ÷ (팟+벳) = {{potBefore}} ÷ ({{potBefore}}+{{bet}}) = 약 {{pct}}%예요.' },
    { t: 'bar', kind: 'pct', rows: [
        { label: '팟의 1/3 벳', v: 'pct1' }, { label: '팟의 2/3 벳', v: 'pct2' }, { label: '팟 크기 벳', v: 'pct3', hl: true }
      ],
      calc: { type: 'mdf', potBefore: 12, bet: 12, bets: [4, 8, 12] },
      caption: '벳이 클수록 MDF가 내려가요. 팟 크기 벳이면 {{pct3}}%만 계속해도 돼요.' },
    { t: 'say', text: 'MDF는 내 레인지 중 최소 이만큼은 강한 손부터 콜이나 레이즈로 계속한다는 비율이에요.' },
    { t: 'say', text: '그 경계에 걸린 손이 블러프캐처예요. 상대 블러프만 이기고 밸류벳에는 져요.' },
    { t: 'table', label: '참고', heroPos: 'BB', hero: ['8h', '8c'], board: ['Ks', '9h', '5c', '3d', '2s'],
      seats: [
        { pos: 'UTG', name: '바위', action: '리버 큰 벳' }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', folded: true }, { pos: 'SB', folded: true }, { pos: 'BB', active: true }
      ],
      caption: 'MDF는 밸류와 블러프를 섞는 균형 상대 가정이에요. 블러프 안 하는 바위에겐 무시하고 접어요.' },
    { t: 'ask', id: 'q2', q: '리버, 벳 전 팟 10bb, 상대 벳 10bb(팟 크기). MDF는?', choices: ['33%', '50%', '67%'], answer: 1,
      calc: { type: 'mdf', potBefore: 10, bet: 10 },
      why: '{{potBefore}} ÷ ({{potBefore}}+{{bet}}) = {{pct}}%, 레인지의 절반만 계속하면 돼요.' },
    { t: 'ask', id: 'q3', q: '리버에 블러프를 거의 안 하는 상대가 크게 벳했어요. 내 블러프캐처는?',
      choices: ['MDF만큼 콜해서 지킨다', '대체로 폴드한다'], answer: 1,
      why: 'MDF는 균형 상대 가정이에요. 블러프가 없으면 블러프캐처가 이길 상대 손도 없어요.' },
    { t: 'sum', text: 'MDF = 벳 전 팟 ÷ (팟+벳)은 균형 상대에게 계속할 최소 비율이고, 블러프 안 하는 상대엔 무시한다.' }
  ]
});
