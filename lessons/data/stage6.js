// lessons/data/stage6.js (채우는 그룹: M6-L56, s6-01~03)
// LESSONS.push({ id, node, title, est, source, scenes: [...] }) 형식으로 누적(부록 B). LESSONS는 stage1.js가 선언한다.
// 계약 L1~L9(lessons/lesson-core.js 머리 주석)와 로드맵 M6 계약 H4(HUD 4분류), H13(calc 접두 s56)을 따른다. 순수 데이터.
// 수치 원칙: 캡션, text, why의 퍼센트와 bb는 {{ }} 템플릿과 같은 장면의 calc로만 쓴다.
//   이 그룹의 등록 calc(lessons/calc/stage6a.js): s56Hud(HUD 4분류), s56Af(AF), s56Se(VPIP 표준오차와 95% 범위).
//   M5 등록 유형(읽기 전용): alpha(블러프 본전 폴드율 = 벳 ÷ (벳 전 팟 + 벳)).
// HUD 4분류(H4, 이 순서): 🧊 타이트 VPIP ≤ 14, 🐟 루즈-패시브 VPIP ≥ 30이고 PFR ÷ VPIP < 0.35, 🔥 루즈-공격 VPIP ≥ 28이고
//   PFR ÷ VPIP ≥ 0.6, 나머지 ⚖ 정석, 15핸드 전엔 판정 안 함. 햇살(Fish)과 콜마스터(Station)는 같은 루즈-패시브(설계서 10절 23번).
//   임계는 엔진 빌런 실측에 맞춘 이 앱의 기준이다(로드맵 결정 21에서 10/20/18로 낮췄다가, 결정 26에서 엔진 빌런 레인지를 실제 6-max
//   숫자 쪽으로 넓히고 14/30/28로 되돌렸다. 정본 ai/villain-tracker.js RULE0).
// 예시 HUD 숫자(VPIP, PFR)는 은닉 6인 테이블 엔진 시뮬레이션의 대략 실측값(바위 Nit 11/9, 교수 TAG 21~22/17~18, 불도저 LAG 33~34/28,
//   햇살 Fish 40/7, 콜마스터 Station 47~48/4)이다. ai/villain-profiles.js의 vpip/pfr 표시용 기대치도 이 실측을 반올림한 값이다.
// 참고 라벨: 익스플로잇 단계와 처방 방향은 통념(설계서 8.2절 4번, s6-03은 참고 노드). 처방 방향은 H4 처방 표와 같은 방향.

// ── s6-01 HUD와 표본 크기(커리큘럼 세션 20, 부록 A 52번: HUD 읽기 장면 3, 표본 표 30/100/300/1000, 질문 2, 드릴 hudread 10) ──
// 표본 표: s56Se p = 25%(흔한 VPIP 예). SE = √(0.25 x 0.75 ÷ n): 30핸드 7.9%p, 100핸드 4.3, 300핸드 2.5, 1000핸드 1.4.
//   (결정 26) 95% 범위 장면은 정석 띠(VPIP 15~27)에 있는 교수 근처 VPIP 21%로 보인다: 30핸드 ±15 → 6~36%, 100핸드 ±8 → 13~29%.
//   엔진 빌런 레인지를 넓히고 정석 띠가 넓어져 은닉 좌석 실측(시뮬 100~300테이블) 100핸드 정답률이 교수 75~87%, 불도저 77~90%로
//   올랐다(예전 10/20/18 임계에서는 TAG 약 50~67%). 그래서 예전의 'TAG/LAG 경계가 자주 바뀐다' 안내는 '경계 근처 숫자만 더 본다'로 줄였다.
//   s6-02는 연습 노드라 틀려도 벌점이 없다.
// 질문 2: VPIP 30%, 40핸드 → SE √(0.21 ÷ 40) = 7.2%p, 반폭 14%p. 7%p는 1.96배를 잊은 함정, 3%p는 1000핸드 값.
LESSONS.push({
  id: 's6-01', node: 's6-01', title: 'HUD와 표본 크기', est: 3,
  source: '엔진 계산(이항 비율 표준오차 √(p(1-p) ÷ n), 95% 범위 ±1.96배), 이 앱의 HUD 4분류(로드맵 M6 계약 H4), 커리큘럼 세션 20',
  scenes: [
    { t: 'say', text: 'HUD는 상대마다 쌓이는 숫자예요. VPIP는 스스로 칩을 넣은, PFR은 프리플랍에 레이즈한, 3벳은 오픈에 다시 레이즈한 비율이에요.' },
    { t: 'table', heroPos: 'BB',
      seats: [
        { pos: 'UTG', name: '바위', action: '11 / 9' }, { pos: 'CO', name: '햇살', action: '40 / 7' },
        { pos: 'BTN', name: '불도저', action: '33 / 28' }, { pos: 'BB', active: true }
      ],
      caption: '좌석 숫자는 VPIP / PFR(이 앱 상대들을 오래 본 대략 값). 많이 들어오는지, 들어올 때 레이즈하는지 같이 봐요.' },
    { t: 'bar', kind: 'pct', rows: [{ label: 'VPIP', v: 'vpip' }, { label: 'PFR', v: 'pfr', hl: true }],
      calc: { type: 's56Hud', vpip: 40, pfr: 7, n: 120 },
      caption: '햇살: VPIP {{vpip}}%, PFR {{pfr}}%. 자주 들어오지만 레이즈는 드물어서 {{clsKo}} 쪽이에요.' },
    { t: 'say', calc: { type: 's56Af', bets: 30, raises: 10, calls: 16 },
      text: 'AF는 포스트플랍 (벳+레이즈) ÷ 콜. 벳과 레이즈 {{aggr}}번, 콜 {{calls}}번이면 AF {{af}}, 클수록 공격적이에요.' },
    { t: 'bar', kind: 'pct',
      rows: [{ label: '30핸드', v: 'se30' }, { label: '100핸드', v: 'se100' }, { label: '300핸드', v: 'se300' }, { label: '1000핸드', v: 'se1000', hl: true }],
      calc: { type: 's56Se', p: 25, n: 30, ns: [30, 100, 300, 1000] },
      caption: '표준오차는 VPIP {{p}}%가 우연으로 보통 흔들리는 폭. 30핸드 {{se30}}%p에서 1000핸드 {{se1000}}%p로 줄어요.' },
    { t: 'say', calc: { type: 's56Se', p: 21, n: 100, ns: [30] },
      text: '{{ci}}% 범위로 VPIP {{p}}%는 30핸드 {{lo30}}~{{hi30}}%, 100핸드도 {{lo}}~{{hi}}%예요.',
      caption: '30핸드는 아직 잠정이에요. 100핸드쯤 쌓이면 대부분 읽히고, 경계 근처 숫자만 더 지켜봐요.' },
    { t: 'ask', id: 'q1', q: 'HUD: VPIP 34%, PFR 26%(150핸드). 이 앱 4분류로는?',
      choices: ['🧊 타이트', '⚖ 정석', '🔥 루즈-공격', '🐟 루즈-패시브'], pick: ['tight', 'standard', 'loose-aggr', 'loose-passive'], answer: 2,
      calc: { type: 's56Hud', vpip: 34, pfr: 26, n: 150 },
      why: 'VPIP {{vpip}}는 28 이상이고 PFR ÷ VPIP = {{ratio}}, 0.6 이상이라 {{clsKo}} 쪽이에요.' },
    { t: 'ask', id: 'q2', q: 'VPIP 30%를 40핸드 동안 봤어요. 95% 범위의 반폭(1.96 x 표준오차)은 약?',
      choices: ['±3%p', '±7%p', '±14%p', '±28%p'], answer: 2,
      calc: { type: 's56Se', p: 30, n: 40 },
      why: '표준오차 {{se}}%p의 1.96배 = 약 {{moe}}%p. 실제는 {{lo}}~{{hi}}% 어디쯤이라 아직 잠정이에요.' },
    { t: 'sum', text: 'HUD는 VPIP와 PFR ÷ VPIP로 유형을 읽고, 핸드가 적거나 3벳처럼 드문 숫자, 경계(14, 28, 30) 근처는 잠정으로만 믿는다.' }
  ]
});

// ── s6-02 프로필 탐정(신규 노드, 부록 A 53번: 탐정 안내 2(판별 임계 설명), 미션 은닉 1좌석 누적 50핸드 뒤 4분류 정답) ──
// 판별 순서는 H4 그대로. 예시 좌석 VPIP 44, PFR 5(햇살과 콜마스터 사이) → 5 ÷ 44 = 0.11 < 0.35이고 44 ≥ 30 → 루즈-패시브.
// 50핸드 표본: VPIP 44%면 SE √(0.44 x 0.56 ÷ 50) = 7.0%p, 95% 범위 ±14 → 30~58%(타이트 14 이하와는 겹치지 않음).
// 질문: VPIP 22, PFR 18(교수 근처) → 14 초과, 28 미만(루즈-공격 아님), 30 미만(루즈-패시브 아님) → 어느 규칙에도 안 걸려 정석.
// 미션 연결: journey-data s6-02 mission(config 'sixmax-cast-hidden', hiddenSeats 1, identify minHands 50), 맞히기는 노드 화면 버튼
//   (로드맵 M6 계약 H9 Boss.sheetActions), 관찰은 좌석 이름별 누적(JStats.castObs, 여러 판 합산).
LESSONS.push({
  id: 's6-02', node: 's6-02', title: '프로필 탐정', est: 3,
  source: '이 앱의 HUD 4분류(로드맵 M6 계약 H4, 설계서 2.5절 판별 임계), 엔진 계산(표준오차 95% 범위)',
  scenes: [
    { t: 'say', text: '프로필 탐정: 유형 이름이 가려진 좌석을 HUD 숫자만 보고 맞혀요. 보기는 이 앱의 4분류예요.' },
    { t: 'say', text: '판별 순서 1: VPIP 14 이하면 🧊 타이트. 2: VPIP 30 이상이고 PFR이 VPIP의 0.35배 미만이면 🐟 루즈-패시브.' },
    { t: 'say', text: '3: VPIP 28 이상이고 PFR이 VPIP의 0.6배 이상이면 🔥 루즈-공격. 셋 다 아니면 ⚖ 정석. 15핸드 전엔 보류해요.' },
    { t: 'table', heroPos: 'BTN',
      seats: [
        { pos: 'UTG', name: '가려진 좌석', action: 'VPIP 44, PFR 5' }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
        { pos: 'BTN', active: true }, { pos: 'SB', folded: true }, { pos: 'BB', folded: true }
      ],
      calc: { type: 's56Hud', vpip: 44, pfr: 5, n: 60 },
      caption: 'VPIP {{vpip}}, PFR {{pfr}}: PFR ÷ VPIP = {{ratio}}. 2번 규칙에 걸려 {{clsKo}} 쪽이에요.' },
    { t: 'say', calc: { type: 's56Se', p: 44, n: 50 },
      text: '50핸드에 VPIP {{p}}%면 {{ci}}% 범위 {{lo}}~{{hi}}%. 타이트와는 확실히 다르지만 경계 근처는 더 봐요.' },
    { t: 'say', text: '이 기준은 이 앱 상대들 숫자에 맞춘 값이고, 실제 6인 게임 숫자와도 대략 비슷해요. 햇살과 콜마스터는 둘 다 🐟 루즈-패시브예요.' },
    { t: 'say', text: '미션: 한 좌석이 가려진 6인 테이블을 50핸드 이상 지켜본 뒤 노드 화면에서 그 좌석 유형을 골라요.',
      caption: '여러 판이 합쳐져요. 경계(14, 28, 30) 근처면 더 오래 보고, 틀려도 벌점 없이 좌석이 새로 섞여요.' },
    { t: 'ask', id: 'q1', q: '가려진 좌석: VPIP 22%, PFR 18%(80핸드). 이 앱 4분류로는?',
      choices: ['🧊 타이트', '⚖ 정석', '🔥 루즈-공격', '🐟 루즈-패시브'], pick: ['tight', 'standard', 'loose-aggr', 'loose-passive'], answer: 1,
      calc: { type: 's56Hud', vpip: 22, pfr: 18, n: 80 },
      why: 'VPIP {{vpip}}%는 14보다 크고 28보다 작아 {{clsKo}} 쪽이에요. {{n}}핸드면 아직 잠정이라 더 지켜봐요.' },
    { t: 'sum', text: '가려진 좌석은 VPIP와 PFR을 판별 순서대로 대 보고, 핸드가 충분히 쌓인 뒤에 유형을 고른다.' }
  ]
});

// ── s6-03 익스플로잇 4단계(신규 노드, 부록 A 54번: 4단계 카드, 예 2, 질문 2, 미션 6인 20핸드 체험) ──
// 예 1: 반 팟 c벳 블러프(벳 전 팟 6, 벳 3) 알파 = 3 ÷ 9 = 33%. 이 앱의 바위(Nit)는 c벳 폴드 성향이 높다(fold_to_cbet 0.60).
// 예 2: 팟만큼 블러프(6, 6) 알파 = 50%. 콜마스터(Station)는 c벳에 잘 안 접는다(fold_to_cbet 0.15).
//   처방 방향은 H4 처방 표(타이트 = c벳 블러프 늘리기, 루즈-패시브 = 블러프 줄이고 밸류벳을 얇게까지)와 같다.
// 질문 1: 벳 전 팟 10에 7.5(3/4 팟) → 7.5 ÷ 17.5 = 42.9% → 43. 75%는 벳 ÷ 팟(팟 몫을 빼먹은 함정), 25%는 너무 낮은 오답.
LESSONS.push({
  id: 's6-03', node: 's6-03', title: '익스플로잇 4단계', est: 3,
  source: '엔진 계산(알파 = 벳 ÷ (팟+벳), 팟은 벳 전), 익스플로잇 단계와 처방 통념(Upswing, GTO Wizard 블로그, 참고)',
  scenes: [
    { t: 'say', label: '참고', text: '익스플로잇은 상대의 치우친 습관을 노려 균형에서 일부러 벗어나는 플레이예요. 4단계로 생각해요.' },
    { t: 'say', label: '참고', text: '1 균형 상상: 상대가 균형이라면 여기서 뭘 할지 먼저 떠올려요. 2 리드: HUD와 쇼다운으로 습관을 읽어요.' },
    { t: 'say', label: '참고', text: '3 식별: 균형보다 너무 접는지, 너무 콜하는지 찾아요. 4 이탈 정도: 표본과 확신만큼만 벗어나요.' },
    { t: 'say', label: '참고', calc: { type: 'alpha', potBefore: 6, bet: 3 },
      text: '예 1: 반 팟 c벳 블러프는 상대가 {{pct}}% 넘게 접으면 이득. 바위처럼 자주 접는 상대에겐 블러프를 늘려요.' },
    { t: 'say', label: '참고', calc: { type: 'alpha', potBefore: 6, bet: 6 },
      text: '예 2: 팟만큼 블러프는 {{pct}}% 넘게 접어야 해요. 잘 안 접는 콜마스터에겐 블러프를 줄이고 밸류벳을 얇게 쳐요.' },
    { t: 'ask', id: 'q1', q: '벳 전 팟 10bb에 7.5bb(3/4 팟) c벳 블러프. 상대가 몇 % 넘게 접어야 이득일까?', choices: ['25%', '43%', '75%'], answer: 1,
      calc: { type: 'alpha', potBefore: 10, bet: 7.5 },
      why: '알파 = {{bet}} ÷ ({{potBefore}}+{{bet}}) = {{pct}}%. 상대가 이보다 자주 접으면 블러프가 이득이에요.' },
    { t: 'ask', id: 'q2', label: '참고', q: '아직 20핸드뿐인데 VPIP가 아주 높은 상대. 4단계의 이탈 정도로 알맞은 것은?',
      choices: ['조금만 벗어나고 더 지켜본다', '바로 크게 벗어난다', '숫자는 무시하고 균형만 친다'], answer: 0,
      why: '표본이 적으면 숫자가 크게 흔들려요. 조금만 벗어나고, 쌓일수록 더 벗어나요.' },
    { t: 'sum', text: '균형을 먼저 그리고, 습관을 읽고, 어긋난 곳을 찾고, 표본과 확신만큼만 벗어난다(참고).' }
  ]
});
