// lessons/data/stage4b.js (채우는 그룹: M5-S4B, s4-06~10)
// LESSONS.push({ id, node, title, est, source, scenes: [...] }) 형식으로 누적(부록 B). LESSONS는 stage1.js가 선언한다.
// S4 콤보 읽기(리더) 레슨 후반 5개: s4-06 블러프 비율과 손익분기, s4-07 씬 밸류와 리버 콜/폴드, s4-08 블로커 입문,
// s4-09 알파와 레이즈 직면, s4-10 운 미터 읽기. s4-boss는 journey-data에서 lesson이 null이라 레슨이 없다.
// 새 calc 유형(alpha, bluffratio, eqRange, blockers)은 lessons/calc/stage4b.js가 등록한다(계약 L9, 로드맵 M5 계약 F7).
// 표기: alpha와 bluffratio의 potBefore는 벳 전 팟(설계서 2.4절 세션 16), ring과 table의 potTotal은 상대 벳 포함 팟(8.4절).
// 리버 콜/폴드 장면은 상대 레인지를 콤보 목록으로 명시하고 eqRange 열거로 센다(설계서 3.2절 출제 제외 1(a), 8.2절 1번
// '주어진 상대 레인지 기준 엔진 계산'). 화면의 콤보 그림과 캡션 목록, ring의 내 승률은 같은 장면 calc와 같은 배열에서 만든다
// (아래 R 도우미, ring eq는 로드 때 LessonCore.calc eqRange 값이고 LessonCore가 없으면 링에 필요 승률만 보인다).
(function() {
  var SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  // 카드 문자열('Ts') → 화면 글자('10♠')
  function sym(c) { return (c.charAt(0) === 'T' ? '10' : c.charAt(0)) + SYM[c.charAt(1)]; }
  function comboText(cb) { return sym(cb[0]) + sym(cb[1]); }
  // 이어지는 줄의 이름 칸(줄 바꿈 없는 빈칸). 이름이 ''이면 SceneRender가 이름 칸을 빼서 카드가 왼쪽으로 밀리므로
  // 빈칸 이름으로 칸을 남겨 위 줄 카드와 세로로 맞춘다(같은 묶음으로 보이게).
  var BLANK = '\u00a0';
  var R = {
    // 콤보 목록 → 'K♠Q♠ K♣Q♣' 글
    list: function(cbs, sep) { return cbs.map(comboText).join(sep == null ? ' ' : sep); },
    // 콤보 목록 → cards 줄(콤보 하나에 한 줄, 이름은 첫 줄에만, 다음 줄은 빈칸 이름으로 줄 맞춤)
    rows: function(label, cbs) { return cbs.map(function(cb, i) { return { label: i ? BLANK : label, cards: cb.slice() }; }); },
    // ring의 내 승률(0~1): 같은 장면 calc eqRange의 (win + tie / 2) / runs. LessonCore가 없으면(린트 vm) 비움
    eq: function(spec) {
      if (typeof LessonCore === 'undefined' || !LessonCore || typeof LessonCore.calc !== 'function') return undefined;
      var r = LessonCore.calc(spec);
      return (r && !r.error && r.runs > 0) ? (r.win + r.tie / 2) / r.runs : undefined;
    }
  };

  // ── s4-06 블러프 비율과 손익분기(커리큘럼 세션 16, 설계서 2.4절: 블러프 비율 = 벳 ÷ (팟 + 2벳), 팟은 벳 전) ──
  // 폴라 그림: 리버 K♦9♣6♥4♥2♠에서 팟만큼 벳하는 레인지 = 밸류(셋) 2콤보 + 블러프(놓친 하트 드로우) 1콤보.
  // 블러프 비율 33%(bluffratio)와 같은 몫이라 상대의 블러프캐처 Q♠Q♦는 승률 33% = 필요 승률 33%, 콜해도 접어도 본전(eqRange).
  var B6 = ['Kd', '9c', '6h', '4h', '2s'];
  var V6 = [['Kh', 'Kc'], ['6s', '6c']], F6 = [['Ah', '5h']];
  var CATCH6 = { type: 'eqRange', hero: ['Qs', 'Qd'], board: B6, combos: V6.concat(F6) };
  LESSONS.push({
    id: 's4-06', node: 's4-06', title: '블러프 비율과 손익분기', est: 3,
    source: '엔진 계산(블러프 비율 = 벳 ÷ (팟+2벳), 알파 = 벳 ÷ (팟+벳), 팟은 벳 전, 주어진 레인지 열거), GTO Wizard 블로그(폴라 레인지, 참고)',
    scenes: [
      { t: 'say', label: '참고', text: '리버에서 크게 거는 레인지는 흔히 아주 강한 손(밸류)과 놓친 드로우(블러프)로 갈려요. 이런 모양이 폴라예요.' },
      { t: 'cards', rows: [
          { label: '보드', cards: B6 },
          { label: '밸류(셋)', cards: V6[0] },
          { label: '밸류(셋)', cards: V6[1] },
          { label: '블러프(놓친 드로우)', cards: F6[0], hl: true }
        ],
        calc: { type: 'bluffratio', potBefore: 10, bet: 10 },
        caption: '팟만큼 벳하는 레인지가 밸류 2콤보에 블러프 1콤보면 블러프 비율 {{pct}}%예요.' },
      { t: 'ring', potTotal: 20, toCall: 10, eq: R.eq(CATCH6), calc: CATCH6,
        caption: '콜하는 쪽 눈으로: Q♠Q♦는 블러프만 이겨 승률 {{eq}}%, 필요 {{need}}%와 같아 본전이에요.' },
      { t: 'bar', kind: 'pct', rows: [{ label: '밸류', v: 'value' }, { label: '블러프', v: 'pct', hl: true }],
        calc: { type: 'bluffratio', potBefore: 12, bet: 6 },
        caption: '벳 전 팟 {{potBefore}}bb에 {{bet}}bb(팟의 반)면 블러프는 {{pct}}%까지. 작게 걸면 블러프를 덜 섞어요.' },
      { t: 'say', calc: { type: 'alpha', potBefore: 10, bet: 10 },
        text: '블러프 한 번만 보면 기준은 알파 = 벳 ÷ (팟+벳). 팟만큼 블러프는 상대가 {{pct}}% 넘게 접어야 이득.' },
      { t: 'ask', id: 'q1', q: '리버, 벳 전 팟 20bb에 15bb 벳(팟의 3/4). 상대 콜이 딱 본전이 되는 블러프 비율은?',
        choices: ['25%', '30%', '43%', '50%'], answer: 1,
        calc: { type: 'bluffratio', potBefore: 20, bet: 15 },
        why: '벳 ÷ (팟+2벳) = {{bet}} ÷ ({{potBefore}}+{{bet}}+{{bet}}) = {{pct}}%. 팟은 벳 전이에요.' },
      { t: 'ask', id: 'q2', q: '리버, 벳 전 팟 9bb에 6bb 블러프. 상대가 몇 % 넘게 접어야 이득일까(알파)?',
        choices: ['29%', '40%', '60%'], answer: 1,
        calc: { type: 'alpha', potBefore: 9, bet: 6 },
        why: '알파 = 벳 ÷ (팟+벳) = {{bet}} ÷ ({{potBefore}}+{{bet}}) = {{pct}}%.' },
      { t: 'ask', id: 'q3', q: '내 리버 벳 레인지에 블러프가 이 비율보다 훨씬 많으면 상대의 블러프캐처는?',
        choices: ['콜하면 이득', '폴드하면 이득', '어느 쪽이든 본전'], answer: 0,
        why: '블러프가 많을수록 콜하는 쪽 승률이 필요 승률보다 높아져 콜이 이득이에요.' },
      { t: 'sum', text: '리버에서 균형 블러프 비율은 벳 ÷ (팟+2벳), 블러프 한 번의 본전 폴드율(알파)은 벳 ÷ (팟+벳), 팟은 벳 전.' }
    ]
  });

  // ── s4-07 씬 밸류와 리버 콜/폴드(커리큘럼 세션 17, 18, 설계서 2.4절, 3.2절 출제 제외 1(a)) ──
  // 사이즈 사다리와 씬 밸류, 페어 보드 c벳은 참고 라벨(세션 18의 227 보드 예시는 77이 넛이라 넛 아닌 A♦5♦로, 커리큘럼 c18-1과 같음).
  // 명시 레인지 콜/폴드 2장면: 같은 리버, 같은 가격(팟 벳, 필요 33%)에 레인지만 다르다(블러프 3콤보 → 콜, 1콤보 → 폴드).
  var B7 = ['Kd', '9c', '6h', '4h', '2s'], H7 = ['9s', '8s'];
  var V7 = [['Ks', 'Qs'], ['Kc', 'Qc']], F7 = [['Ah', '5h'], ['8h', '7h'], ['Qh', 'Jh']];
  var SPOT7A = { type: 'eqRange', hero: H7, board: B7, combos: V7.concat(F7) };
  var R7B = V7.concat([['Ks', 'Js'], ['Kc', 'Jc'], ['Ah', '5h']]);
  var SPOT7B = { type: 'eqRange', hero: H7, board: B7, combos: R7B };
  var Q7 = { type: 'eqRange', hero: ['Kh', 'Th'], board: ['Ad', 'Ts', '7c', '4d', '2h'], combos: [['As', 'Qs'], ['Ac', 'Jc'], ['6s', '5s']],
    potTotal: 18, toCall: 6, of: 'act' };
  LESSONS.push({
    id: 's4-07', node: 's4-07', title: '씬 밸류와 리버 콜/폴드', est: 3,
    source: '엔진 계산(주어진 상대 레인지 열거, 필요 승률 = 콜 ÷ (팟+콜)), Run It Once와 GTO Wizard 블로그(리버 사이즈, 참고)',
    scenes: [
      { t: 'say', text: '리버엔 더 올 카드가 없어요. 씬 밸류는 상대가 콜할 손보다 근소하게 앞선 손으로 하는 밸류벳이에요.' },
      { t: 'cards', label: '참고', rows: [
          { label: '보드', cards: B7 },
          { label: '셋', cards: ['Ks', 'Kc'], note: '크게(팟의 3/4 이상)' },
          { label: '탑페어', cards: ['Kh', 'Qc'], note: '작게(씬 밸류)', hl: true },
          { label: '미들 페어', cards: ['9s', '8s'], note: '체크' },
          { label: '놓친 드로우', cards: ['Ah', '5h'], note: '체크 또는 블러프' }
        ],
        caption: '리버 사이즈 사다리: 강할수록 크게, 아슬아슬한 밸류는 작게, 중간은 체크. 크게 치면 더 센 손만 콜해요.' },
      { t: 'say', label: '참고', text: '사이즈는 플랍에서도 골라요. 2♠ 2♥ 7♣ 같은 페어 보드는 맞은 손이 드물어 A♦5♦ 같은 손도 작게 자주 c벳해요.' },
      { t: 'cards', rows: [{ label: '내 손', cards: H7, hl: true }, { label: '보드', cards: B7 }]
          .concat(R.rows('상대 밸류', V7), R.rows('상대 블러프', F7)),
        calc: SPOT7A,
        caption: '주어진 상대 레인지 기준: 상대 벳이 이 {{n}}콤보뿐이면 내 9 원페어는 {{win}}개를 이기고 {{lose}}개에 져요.' },
      { t: 'ring', potTotal: 20, toCall: 10, eq: R.eq(SPOT7A), calc: SPOT7A,
        caption: '{{n}}콤보 중 {{win}}개를 이겨 승률 {{eq}}%, 필요 {{need}}%보다 높아 콜이에요.' },
      { t: 'ring', potTotal: 20, toCall: 10, eq: R.eq(SPOT7B), calc: SPOT7B,
        caption: '레인지가 ' + R.list(R7B) + '라면 승률 {{eq}}%, 폴드예요.' },
      { t: 'ask', id: 'q1', q: '리버 A♦ 10♠ 7♣ 4♦ 2♥, 내 K♥ 10♥. 팟 18bb(상대 벳 6bb 포함), 콜 6bb. 상대가 ' + R.list(Q7.combos) + '라면?',
        choices: ['콜', '폴드'], pick: ['call', 'fold'], answer: 0, calc: Q7,
        why: '{{n}}콤보 중 {{win}}개를 이겨 {{eq}}%, 필요 {{need}}%보다 높아 콜. 벳이 작으면 가격이 싸요.' },
      { t: 'ask', id: 'q2', label: '참고', q: '리버 K♦ 9♣ 6♥ 4♥ 2♠, 내 K♥Q♣는 탑페어 좋은 킥커. 더 약한 K나 9 페어가 콜해 주길 바란다면?',
        choices: ['작게 벳', '팟 이상 크게 벳'], answer: 0,
        why: '크게 치면 더 약한 손은 접고 더 센 손만 남아요. 씬 밸류는 작게 쳐요.' },
      { t: 'sum', text: '리버 밸류는 강할수록 크게, 씬 밸류는 작게(참고). 콜은 주어진 상대 레인지로 승률을 세어 가격과 견준다.' }
    ]
  });

  // ── s4-08 블로커 입문(신규 노드, 설계서 부록 A 38번, 부록 D 블로커) ──
  // 격자 1: UTG가 3벳을 맞고 4벳하는 손(이 앱 차트 Gto.GTO_RANGES.vs3bet.UTG.fourbet = QQ+, AKs, AKo).
  // 격자 2: 이 앱 차트에서 BTN은 3벳을 맞으면 A5s, A4s로 4벳한다(vs3bet.BTN.fourbet). 콤보 수는 blockers 열거.
  LESSONS.push({
    id: 's4-08', node: 's4-08', title: '블로커 입문', est: 2,
    source: '엔진 계산(콤보 열거), 이 앱 차트(Gto.GTO_RANGES vs3bet)',
    scenes: [
      { t: 'say', text: '블로커는 내가 쥔 카드 때문에 상대가 그 카드가 든 손을 가질 가짓수가 줄어드는 효과예요.' },
      { t: 'cards', rows: [
          { label: '내 손', cards: ['As', '5s'], hl: true },
          { label: '남는 AA', cards: ['Ah', 'Ad'] },
          { label: BLANK, cards: ['Ah', 'Ac'] },
          { label: BLANK, cards: ['Ad', 'Ac'] }
        ],
        calc: { type: 'blockers', range: 'AA', hero: ['As', '5s'] },
        caption: 'AA는 원래 {{total}}콤보. 내가 A♠를 쥐면 A♠가 든 {{removed}}콤보가 사라져 {{left}}콤보만 남아요.' },
      // 이 격자는 상대(UTG) 쪽 표라 머리 줄('UTG, 내 오픈에 3벳을 맞음')을 끄고 캡션에서 누구의 표인지 밝힌다
      { t: 'grid', pos: 'UTG', facing: 'vs3bet', head: false, highlight: ['AA', 'AKs', 'AKo'], claim: { hand: 'AKo', action: 'raise' },
        calc: { type: 'blockers', range: 'QQ+,AKs,AKo', hero: ['As', '5s'] },
        caption: '상대 UTG가 내 3벳에 4벳하는 손(초록, 이 앱 차트) {{total}}콤보. 내 A♠5♠가 그중 {{removed}}콤보를 지워요.' },
      { t: 'grid', pos: 'BTN', facing: 'vs3bet', highlight: ['A5s', 'A4s'], claim: { hand: 'A5s', action: 'raise' },
        caption: '이 앱 차트에서 BTN은 3벳을 맞으면 A5s, A4s로도 4벳해요. 쥔 A가 상대의 AA, AK를 줄여 줘요.' },
      { t: 'say', label: '참고', text: '그래서 블러프는 상대가 강하게 맞설 손을 지우는 카드를 쥔 손으로 고르는 경우가 많아요.' },
      { t: 'ask', id: 'q1', q: '상대 레인지 QQ+, AK({{total}}콤보). 내가 K♠K♦를 쥐면 남는 콤보는?',
        choices: ['13콤보', '21콤보', '28콤보', '34콤보'], answer: 1,
        calc: { type: 'blockers', range: 'QQ+,AKs,AKo', hero: ['Ks', 'Kd'], of: 'left' },
        why: 'K♠, K♦가 든 KK와 AK {{removed}}콤보가 빠져 {{left}}콤보가 남아요.' },
      { t: 'ask', id: 'q2', q: '리버에 하트가 3장 깔렸어요. 내가 A♥를 쥐었다면 상대가 들 수 없는 손은?',
        choices: ['A♥가 든 가장 센 플러시', '모든 하트 플러시'], answer: 0,
        why: 'A♥는 내 손에 있으니 A 하이 플러시는 0콤보. 다른 하트 플러시는 여전히 있을 수 있어요.' },
      { t: 'sum', text: '내가 쥔 카드는 상대가 그 카드를 쓴 콤보를 지운다. 콤보를 세면 블로커가 보인다.' }
    ]
  });

  // ── s4-09 알파와 레이즈 직면(신규 노드, 설계서 부록 A 39번) ──
  // 알파 = 리스크 ÷ (리워드 + 리스크). 레이즈면 리스크 = 새로 넣는 칩, 리워드 = 그 전 팟(상대 벳 포함).
  // 리버 벳 전 팟 20bb, 벳 10bb, 레이즈 30bb: 내 블러프 레이즈 알파 30 ÷ 60 = 50%, 민레이즈 20bb면 20 ÷ 50 = 40%.
  // 거꾸로 내 10bb 벳에 상대가 30bb로 레이즈하면 팟(상대 레이즈 포함) 60bb, 콜 20bb → 필요 승률 25%, 상대 블러프 레이즈의 알파 50%.
  var B9 = ['Qs', '8d', '5c', '3h', '2s'];
  LESSONS.push({
    id: 's4-09', node: 's4-09', title: '알파와 레이즈 직면', est: 2,
    source: '엔진 계산(알파 = 벳 ÷ (팟+벳), 필요 승률 = 콜 ÷ (팟+콜)), GTO Wizard 블로그(알파와 MDF)',
    scenes: [
      { t: 'say', text: '레이즈도 리스크와 리워드로 따져요. 리스크는 새로 넣는 칩, 리워드는 이미 팟에 있는 칩(상대 벳 포함)이에요.' },
      { t: 'table', heroPos: 'BTN', hero: ['Jh', 'Th'], board: B9, potTotal: 30, toCall: 10,
        seats: [
          { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
          { pos: 'BTN', active: true }, { pos: 'SB', folded: true }, { pos: 'BB', action: '벳', bet: 10 }
        ],
        calc: { type: 'alpha', potBefore: 30, bet: 30 },
        caption: '팟 {{potTotal}}bb(상대 벳 {{toCall}}bb 포함). {{bet}}bb로 블러프 레이즈하면 알파 {{pct}}%예요.' },
      { t: 'say', calc: { type: 'alpha', potBefore: 30, bet: 20 },
        text: '민레이즈 {{bet}}bb면 리스크 {{bet}}bb, 리워드 {{potBefore}}bb라 알파 {{pct}}%. 상대가 덜 접어도 본전.' },
      { t: 'table', heroPos: 'BTN', hero: ['Ah', 'Qh'], board: B9, potTotal: 60, toCall: 20, focus: 'toCall',
        seats: [
          { pos: 'UTG', folded: true }, { pos: 'HJ', folded: true }, { pos: 'CO', folded: true },
          { pos: 'BTN', bet: 10, active: true }, { pos: 'SB', folded: true }, { pos: 'BB', action: '레이즈', bet: 30 }
        ],
        caption: '이번엔 내 벳에 상대가 레이즈. 팟 {{potTotal}}bb(상대 레이즈 포함), 콜 {{toCall}}bb, 필요 승률 {{need}}%.' },
      { t: 'say', calc: { type: 'alpha', potBefore: 30, bet: 30 },
        text: '상대 레이즈가 블러프라면 {{bet}}bb를 걸어 {{potBefore}}bb를 노려요. 내가 {{pct}}% 넘게 접어야 상대가 이득.' },
      { t: 'ask', id: 'q1', q: '리버, 팟 30bb(상대 벳 10bb 포함)에서 40bb로 블러프 레이즈. 상대가 몇 % 넘게 접어야 이득일까(알파)?',
        choices: ['36%', '43%', '57%', '75%'], answer: 2,
        calc: { type: 'alpha', potBefore: 30, bet: 40 },
        why: '알파 = 리스크 ÷ (리워드+리스크) = {{bet}} ÷ ({{potBefore}}+{{bet}}) = {{pct}}%.' },
      { t: 'ask', id: 'q2', q: '같은 팟에서 블러프 레이즈를 더 크게 하면, 상대가 접어야 하는 비율(알파)은?',
        choices: ['올라가요', '내려가요', '그대로예요'], answer: 0,
        why: '리스크가 커지면 같은 리워드를 얻으려 상대가 더 자주 접어야 해요.' },
      { t: 'sum', text: '레이즈도 알파 = 리스크 ÷ (리워드+리스크)로 잰다. 크게 올릴수록 상대가 더 자주 접어야 본전이고, 리버 블러프 레이즈는 드물게 쓴다.' }
    ]
  });

  // ── s4-10 운 미터 읽기(신규 노드, 설계서 부록 A 40번, 4.5절 끝: 운 미터는 결정 품질과 분리) ──
  // 운 미터 카드 2: 앞선 올인의 패배(A♠K♥ 대 K♦Q♠, 플랍 K♣7♦2♠), 뒤진 올인의 승리(A♥K♥ 대 J♠J♦, 플랍 J♥8♥3♣).
  // 승률은 eqExact 열거, 결과는 showdown. 분산 맛보기는 참고. 운 미터 카드 자체는 거울 HUD 그룹 화면(로드맵 M5 계약 F1)이라
  // 여기서는 세션 요약과 📊 내 실력에서 보인다는 안내만 한다.
  LESSONS.push({
    id: 's4-10', node: 's4-10', title: '운 미터 읽기', est: 2,
    source: '엔진 계산(HandEval 열거), 설계서 4.5절(결정 품질과 결과 분리)',
    scenes: [
      { t: 'say', text: '운 미터는 올인한 순간의 내 승률과 실제 결과를 나란히 놓아요. 결정이 좋았는지와는 따로 봐요.' },
      { t: 'bar', kind: 'equity',
        rows: [
          { label: '나 A♠K♥', exact: { hero: ['As', 'Kh'], vs: ['Kd', 'Qs'], board: ['Kc', '7d', '2s'] } },
          { label: '상대 K♦Q♠', exact: { hero: ['Kd', 'Qs'], vs: ['As', 'Kh'], board: ['Kc', '7d', '2s'] } }
        ],
        calc: { type: 'eqExact', hero: ['As', 'Kh'], vs: ['Kd', 'Qs'], board: ['Kc', '7d', '2s'] },
        caption: '운 미터 카드 1: 플랍 K♣ 7♦ 2♠에서 올인, 내 승률 {{eq}}%로 크게 앞섰어요.' },
      { t: 'cards', rows: [
          { label: '보드', cards: ['Kc', '7d', '2s', '5h', 'Qc'] },
          { label: '나', cards: ['As', 'Kh'] },
          { label: '상대', cards: ['Kd', 'Qs'], hl: true }
        ],
        calc: { type: 'showdown', a: ['As', 'Kh'], b: ['Kd', 'Qs'], board: ['Kc', '7d', '2s', '5h', 'Qc'] },
        caption: '리버 Q♣로 상대가 {{handB}}, 이번엔 졌어요. 앞선 올인의 패배는 운이 나빴던 판이에요.' },
      { t: 'bar', kind: 'equity',
        rows: [
          { label: '나 A♥K♥', exact: { hero: ['Ah', 'Kh'], vs: ['Js', 'Jd'], board: ['Jh', '8h', '3c'] } },
          { label: '상대 J♠J♦', exact: { hero: ['Js', 'Jd'], vs: ['Ah', 'Kh'], board: ['Jh', '8h', '3c'] } }
        ],
        calc: { type: 'eqExact', hero: ['Ah', 'Kh'], vs: ['Js', 'Jd'], board: ['Jh', '8h', '3c'] },
        caption: '운 미터 카드 2: 플랍 J♥ 8♥ 3♣에서 올인, 이번엔 내 승률 {{eq}}%로 뒤졌어요.' },
      { t: 'cards', rows: [
          { label: '보드', cards: ['Jh', '8h', '3c', '2d', '5h'] },
          { label: '나', cards: ['Ah', 'Kh'], hl: true },
          { label: '상대', cards: ['Js', 'Jd'] }
        ],
        calc: { type: 'showdown', a: ['Ah', 'Kh'], b: ['Js', 'Jd'], board: ['Jh', '8h', '3c', '2d', '5h'] },
        caption: '리버 5♥로 내가 {{handA}}, 이겼어요. 이긴 건 운, 결정이 좋았는지는 그때 가격으로 따로 봐요.' },
      { t: 'say', label: '참고', text: '같은 결정도 몇 판만 보면 결과가 크게 출렁여요. 수백, 수천 판이 쌓여야 결과가 승률 쪽으로 모여요.' },
      { t: 'say', text: '6인 게임에서 리버 전에 올인하고 쇼다운까지 가면 운 미터 카드가 남아요(연습 제외). 세션 요약과 📊 내 실력에서 열어 봐요.' },
      { t: 'ask', id: 'q1', q: '플랍 9♠ 7♠ 2♦, 내 7♥7♣ 대 상대 A♠Q♠로 올인. 내 승률은 약 몇 %?',
        choices: ['약 45%', '약 75%', '약 95%'], answer: 1,
        calc: { type: 'eqExact', hero: ['7h', '7c'], vs: ['As', 'Qs'], board: ['9s', '7s', '2d'] },
        why: '남은 두 장을 다 세면 약 {{eq}}%. 여기서 져도 운 미터엔 운이 나빴던 판으로 남아요.' },
      { t: 'sum', text: '운 미터로 결과의 운을 따로 보고, 결정은 그 순간의 승률과 가격으로 평가한다.' }
    ]
  });
})();
