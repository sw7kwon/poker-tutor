// lessons/data/career.js (채우는 작업: 클라우드 F4 커리어 레슨 6편. 지시문 docs/cloud-tasks/F4.md, 설계 원문 5.3절 2번)
// 커리어 레슨 등록부 CAREER_LESSONS(여정 LESSONS와 따로, 노드 연결 없음). 항목 형식은 README 8절 레슨과 같고(계약 L1~L5)
// id 'c-01'~'c-06', node 'career', career: true. LessonPlayer.start가 객체(또는 'c-01' 같은 id)를 받는 분기(F4)로 연다.
//   c-01 뱅크롤 관리, c-02 스테이크 오르내리기, c-03 테이블 선택, c-04 틸트와 세션 중단, c-05 토너먼트 기본, c-06 ICM 맛보기(참고)
// 완료는 LessonPlayer가 CareerContract.emit('lesson:done', { id })로 알린다(커리어 상태 lessons[id]에 기록, 장소 해금 조건:
//   지역 2 = c-01, 지역 3 = c-02, 토너먼트 = c-05). 커리어 레슨은 여정 노드가 없어 Journey.completeLesson과 Leitner 복습 키를 남기지 않는다.
// 수치 원칙(README 8절, 11절): 캡션과 문장의 퍼센트와 bb는 같은 장면 calc의 {{ }} 템플릿으로만 쓴다. 이 파일의 calc는 내장 유형만
//   (potodds, eq(PRECALC 키), band(이 앱 차트 기준)). 바이인 배수(20배, 15배)와 규칙은 journey/career/balance.js(BUYIN_RULE 20)와 같다.
//   ICM(c-06)은 공개 통념을 근사한 설명이라 모든 장면에 label '참고'를 붙인다. 숫자가 아닌 방향만 가르친다.
// ask id는 6편 전체에서 유일하게('c1q1' 식) 둔다(여섯 편이 같은 node를 쓰므로).
var CAREER_LESSONS = [];

// ── c-01 뱅크롤 관리(바이인 20배와 파산 확률) ──
CAREER_LESSONS.push({
  id: 'c-01', node: 'career', career: true, title: '뱅크롤 관리', est: 3,
  source: '이 앱 커리어 규칙(바이인 20배, journey/career/balance.js), 분산 콘(GenMath.varianceBand와 같은 식)',
  scenes: [
    { t: 'say', text: '커리어의 돈은 코인이에요. 한 자리에 앉는 값이 바이인이고, 자산은 바이인 몇 개짜리인지로 봐요.' },
    { t: 'bar', kind: 'amount', rows: [
        { label: '바이인 1개', bb: 100 }, { label: '바이인 5개', bb: 500 }, { label: '바이인 20개(이 앱 규칙)', bb: 2000, hl: true }
      ],
      caption: '이 앱 규칙: 그 장소 바이인의 20배가 모여야 앉아요. 막대는 bb로 센 자산이에요.' },
    { t: 'widget', name: 'varianceCone', params: { winrate: 5, hands: 10000, sd: 90 },
      caption: '같은 실력이라도 결과는 이만큼 퍼져요. 바이인이 적으면 이 폭 안에서 바닥을 쳐요.' },
    { t: 'say', text: '파산 확률은 실력과 바이인 수로 정해져요. 바이인이 많을수록 운이 나쁜 구간을 버틸 수 있어요.' },
    { t: 'ask', id: 'c1q1', q: '자산이 그 장소 바이인의 20배보다 적어졌어요. 좋은 선택은?',
      choices: ['더 싼 장소로 내려가요', '같은 장소에서 더 세게 쳐요', '자산을 전부 걸고 한 판 해요'], answer: 0,
      why: '규칙 아래로 내려가면 싼 장소로 옮겨 자산을 다시 쌓아요. 세게 치는 건 파산을 앞당겨요.' },
    { t: 'ask', id: 'c1q2', q: '바이인 20배 규칙이 지키려는 것은?',
      choices: ['한 세션에서 가장 많이 버는 것', '상대를 겁주는 것', '운이 나쁜 구간에서 파산하지 않는 것'], answer: 2,
      why: '실력이 있어도 몇천 핸드는 출렁여요. 바이인이 많으면 그 출렁임을 버텨요.' },
    { t: 'say', text: '후원금은 자산이 가장 싼 바이인보다 적을 때 하루 한 번 나와요. 기대지 말고 규칙을 지켜요.' },
    { t: 'sum', text: '자산은 그 장소 바이인의 20배를 기준으로 지키고, 모자라면 싼 자리로 내려간다.' }
  ]
});

// ── c-02 스테이크 오르내리기 ──
CAREER_LESSONS.push({
  id: 'c-02', node: 'career', career: true, title: '스테이크 오르내리기', est: 3,
  source: '이 앱 커리어 규칙(올라갈 때 다음 바이인의 20배, 내려올 때 지금 바이인의 15배, journey/career/balance.js)',
  scenes: [
    { t: 'say', text: '같은 장소에서도 스테이크 x1과 x2를 고를 수 있어요. x2는 환율이 두 배라 바이인도 두 배예요.' },
    { t: 'bar', kind: 'amount', rows: [
        { label: 'x1 바이인', bb: 100 }, { label: 'x2 바이인', bb: 200 }, { label: 'x2로 올라갈 때 자산(바이인 20개)', bb: 4000, hl: true }
      ],
      caption: '환율 1 기준으로 그린 막대예요. x2는 모든 값이 두 배라 자산도 두 배가 필요해요.' },
    { t: 'say', text: '올라가는 기준은 다음 스테이크 바이인의 20배, 내려오는 기준은 지금 바이인의 15배 아래예요.' },
    { t: 'compare', cols: [
        { who: '서두르는 사람', text: '오늘 이겼으니 바로 x2로 가야지.' },
        { who: '버티는 사람', text: '잃었지만 x2에서 한 번에 만회할래.' },
        { who: '규칙대로', text: '자산이 기준을 넘었는지만 보고 정해요.' }
      ], mine: 2,
      caption: '이긴 기분도 잃은 기분도 기준이 아니에요. 자산이 기준이에요.' },
    { t: 'ask', id: 'c2q1', q: '자산이 지금 바이인 15개 아래로 떨어졌어요. 뭘 할까요?',
      choices: ['그대로 쳐요', '한 단계 내려가요', '올라가서 만회해요'], answer: 1,
      why: '내려오는 기준을 넘었으니 한 단계 내려가요. 만회하러 올라가는 건 틸트예요.' },
    { t: 'ask', id: 'c2q2', q: '올라갈 때 자산 기준은 어느 쪽 바이인의 20배인가요?',
      choices: ['다음(높은) 스테이크', '지금 스테이크'], answer: 0,
      why: 'x2의 바이인은 두 배니까 자산도 그 기준으로 세요.' },
    { t: 'say', text: '커리어의 지역과 장소도 같은 규칙이에요. 장소마다 열리는 자산 기준이 그곳 바이인의 20배예요.' },
    { t: 'sum', text: '올라갈 땐 다음 바이인의 20배, 내려올 땐 지금 바이인의 15배 아래. 기분이 아니라 숫자로 정한다.' }
  ]
});

// ── c-03 테이블 선택(상대 유형 보고 자리 고르기) ──
var C3_BAND = { type: 'band', metric: 'vpip' };
CAREER_LESSONS.push({
  id: 'c-03', node: 'career', career: true, title: '테이블 선택', est: 3,
  source: '이 앱 차트(HeroStats.bandsFromChart, 참여율 밴드)와 이 앱의 상대 유형(ai/villain-profiles.js)',
  scenes: [
    { t: 'say', text: '이기기 쉬운 테이블은 실수를 많이 하는 상대가 있는 테이블이에요. 앉기 전에 누가 있는지 봐요.' },
    { t: 'bar', kind: 'pct', rows: [{ label: '이 앱 차트대로 치는 참여율(VPIP)', v: 'pct', hl: true }], calc: C3_BAND,
      caption: '이 앱 차트대로 치면 참여율은 약 {{pct}}%예요. 이보다 훨씬 넓게 들어오는 상대가 좋은 손님이에요.' },
    { t: 'table', heroPos: 'BTN', hero: ['Ah', 'Qs'], board: [], potTotal: 1.5, order: 'preflop',
      seats: [
        { pos: 'UTG', name: '햇살', action: '넓게 들어와요' }, { pos: 'HJ', name: '콜마스터', action: '안 접어요' },
        { pos: 'CO', name: '불도저', action: '공격적' }, { pos: 'BTN', active: true },
        { pos: 'SB', name: '바위', bet: 0.5, action: '타이트' }, { pos: 'BB', name: '교수', bet: 1, action: '정석' }
      ],
      caption: '공격적인 상대(불도저)가 내 오른쪽이면 내가 뒤에 말해요. 넓은 상대는 어디 있어도 좋아요.' },
    { t: 'ask', id: 'c3q1', q: '이 앱 차트대로 치면 참여율(VPIP)은 약 몇 %일까요?',
      choices: ['약 10%', '약 {{pct}}%', '약 45%'], answer: 1, calc: C3_BAND,
      why: '이 앱 차트 기준 약 {{pct}}%예요. 이보다 두 배 가까이 넓은 상대는 약한 손이 많아요.' },
    { t: 'say', text: '유형을 모르면 HUD 분류와 처음 몇 핸드의 참여를 봐요. 모두 타이트하고 공격적이면 자리를 옮겨요.' },
    { t: 'ask', id: 'c3q2', q: '어떤 테이블이 가장 좋은 자리일까요?',
      choices: ['모두 타이트하고 공격적인 곳', '아무도 말이 없는 곳', '넓게 들어오고 잘 접지 않는 상대가 많은 곳'], answer: 2,
      why: '넓게 들어오고 안 접는 상대에겐 밸류벳만 해도 돈이 와요. 어려운 상대와는 싸울 이유가 없어요.' },
    { t: 'say', text: '커리어에서는 장소마다 오늘 와 있는 라이벌이 보여요. 누구와 앉을지 고르는 것도 실력이에요.' },
    { t: 'sum', text: '앉기 전에 상대를 본다. 넓게 들어오는 상대가 많고 공격적인 상대가 내 오른쪽인 자리가 좋다.' }
  ]
});

// ── c-04 틸트와 세션 중단 ──
CAREER_LESSONS.push({
  id: 'c-04', node: 'career', career: true, title: '틸트와 세션 중단', est: 3,
  source: '이 앱 커리어 규칙(세션 10핸드, journey/career/balance.js), 틸트 통념(참고)',
  scenes: [
    { t: 'say', text: '틸트는 잃은 뒤 감정이 결정을 대신하는 상태예요. 실력이 아니라 상태가 돈을 잃게 해요.' },
    { t: 'compare', cols: [
        { who: '복수', text: '이 사람한테 꼭 되찾는다.' },
        { who: '체념', text: '운이 없네. 오늘은 다 안 맞아.' },
        { who: '차분', text: '결정은 맞았고 결과만 나빴어. 한 핸드 쉬자.' }
      ], mine: 2,
      caption: '큰 팟을 리버에서 진 직후 세 사람의 속마음이에요. 차분한 쪽만 다음 핸드를 제대로 쳐요.' },
    { t: 'bar', kind: 'amount', rows: [
        { label: '세션 바이인', bb: 100 }, { label: '중단선(바이인 2개)', bb: 200, hl: true }
      ],
      caption: '중단선은 치기 전에 정해요. 예를 들어 바이인 2개를 잃으면 그날은 끝이에요.', label: '참고' },
    { t: 'say', text: '틸트 신호: 콜 가격을 안 보고 콜, 레이즈가 갑자기 커짐, 한 상대만 보임. 하나라도 보이면 멈춰요.' },
    { t: 'ask', id: 'c4q1', q: '큰 팟을 리버에서 졌어요. 다음 핸드 전에 먼저 할 일은?',
      choices: ['바로 큰 손으로 되찾아요', '한 핸드 쉬며 결정이 맞았는지 돌아봐요', '스테이크를 올려요'], answer: 1,
      why: '결과가 아니라 결정을 돌아봐요. 되찾으려는 마음이 틸트의 시작이에요.' },
    { t: 'ask', id: 'c4q2', q: '중단선은 언제 정하는 게 좋을까요?',
      choices: ['잃기 시작한 뒤에', '딴 뒤에', '세션을 시작하기 전에'], answer: 2,
      why: '감정이 섞이기 전에 숫자로 정해 둬야 지켜져요.' },
    { t: 'say', text: '커리어 세션은 10핸드씩이에요. 세션이 끝나면 자산과 기분을 확인하고 다음을 정해요.' },
    { t: 'sum', text: '틸트 신호가 보이면 멈춘다. 중단선은 치기 전에 정한다.' }
  ]
});

// ── c-05 토너먼트 기본(블라인드와 스택 깊이) ──
CAREER_LESSONS.push({
  id: 'c-05', node: 'career', career: true, title: '토너먼트 기본', est: 3,
  source: '엔진 계산(팟 오즈, PRECALC 승률), 이 앱 토너먼트 규칙(시작 50bb, 5핸드마다 블라인드 2배, journey/career/balance.js)',
  scenes: [
    { t: 'say', text: '토너먼트는 바이인을 내고 칩을 받아요. 칩이 다 없어지면 탈락이고, 순위에 따라 상금을 나눠요.' },
    { t: 'bar', kind: 'amount', rows: [
        { label: '시작 스택(레벨 1)', bb: 50, hl: true }, { label: '레벨 2(블라인드 2배)', bb: 25 }, { label: '레벨 3(블라인드 4배)', bb: 12.5 }
      ],
      caption: '블라인드가 오르면 같은 칩도 bb로는 줄어요. 스택 깊이는 늘 bb로 세요.' },
    { t: 'bar', kind: 'amount', rows: [
        { label: '깊은 스택: 현금 게임처럼', bb: 50 }, { label: '얕은 스택: 올인 아니면 폴드', bb: 12, hl: true }
      ],
      caption: '스택이 얕아지면 선택지가 줄어요. 플랍을 보고 접을 여유가 없으니 프리플랍에 정해요.' },
    { t: 'ask', id: 'c5q1', q: '팟 6bb(상대 올인 4bb 포함), 콜 4bb. 필요 승률은?',
      choices: ['25%', '40%', '60%'], answer: 1, calc: { type: 'potodds', potTotal: 6, toCall: 4 },
      why: '토너먼트도 콜 가격은 같아요. {{pct}}%를 넘는 손이면 콜이에요.' },
    { t: 'ask', id: 'c5q2', q: 'AKo로 올인을 받았어요. 아무 손(랜덤) 상대 승률은?',
      choices: ['약 50%', '약 65%', '약 80%'], answer: 1, calc: { type: 'eq', precalc: 'eq:AhKd::random' },
      why: 'AK는 아무 손 상대로 약 {{eq}}%예요. 얕은 스택에서 자신 있게 밀 수 있는 손이에요.' },
    { t: 'say', text: '싯앤고는 여섯 명이 치고 상위 세 명이 상금을 받아요. 탈락 직전인 사람이 있으면 기다리는 것도 작전이에요.' },
    { t: 'sum', text: '토너먼트는 스택을 bb로 세고, 얕아지면 단순하게, 상금 구조를 보고 친다.' }
  ]
});

// ── c-06 ICM 맛보기(참고) ──
CAREER_LESSONS.push({
  id: 'c-06', node: 'career', career: true, title: 'ICM 맛보기', est: 2,
  source: 'ICM 통념(참고, 공개 자료를 근사한 방향 설명. 숫자는 가르치지 않는다)',
  scenes: [
    { t: 'say', label: '참고', text: 'ICM은 내 칩이 상금으로 얼마인지 어림하는 방법이에요. 칩과 상금은 비례하지 않아요.' },
    { t: 'bar', kind: 'amount', label: '참고', rows: [
        { label: '칩 리더', bb: 60, hl: true }, { label: '중간 스택', bb: 30 }, { label: '짧은 스택', bb: 10 }
      ],
      caption: '세 명 남은 싯앤고. 칩은 6:3:1이지만 상금 몫은 그렇게까지 벌어지지 않아요.' },
    { t: 'say', label: '참고', text: '칩이 많을수록 칩 하나의 값은 작아져요. 리더는 짧은 스택을 압박하고, 중간은 버블에서 무리한 콜을 피해요.' },
    { t: 'compare', label: '참고', cols: [
        { who: '칩 리더', text: '짧은 사람이 떨어질 때까지 밀어붙여요.' },
        { who: '중간 스택', text: '지금 콜하면 상금이 깨질 수 있어요. 기다려요.' },
        { who: '짧은 스택', text: '한 번은 밀어야 해요. 좋은 손을 기다릴 시간이 없어요.' }
      ],
      caption: '같은 테이블, 같은 손이라도 스택 크기에 따라 할 일이 달라요.' },
    { t: 'ask', id: 'c6q1', label: '참고', q: '버블(한 명만 더 떨어지면 상금)에서 중간 스택이 가장 조심할 것은?',
      choices: ['짧은 스택의 올인에 센 손으로 콜', '칩 리더와 비슷한 승률로 올인 싸움', '블라인드를 그냥 내주기'], answer: 1,
      why: '같은 승률이라도 탈락하면 상금 전부를 잃어요. 칩 EV와 상금 EV는 달라요.' },
    { t: 'say', label: '참고', text: '이 앱의 토너먼트 요약은 ICM 참고 문구를 보여 줘요. 정확한 계산이 아니라 방향만 알려 주는 참고값이에요.' },
    { t: 'sum', text: '토너먼트에서 칩과 상금은 비례하지 않는다. 버블에서는 탈락 위험을 먼저 본다.' }
  ]
});

// 커리어 레슨 도우미(순수 조회 + 열기). CareerLessons.start(id, sceneIdx, onDone) → LessonPlayer.start(레슨 객체, ...).
// 완료 알림('lesson:done')은 LessonPlayer가 보내므로 여기서는 다시 보내지 않는다.
var CareerLessons = (function() {
  function find(id) {
    if (id == null || id === '') return null;
    for (var i = 0; i < CAREER_LESSONS.length; i++) if (CAREER_LESSONS[i] && CAREER_LESSONS[i].id === id) return CAREER_LESSONS[i];
    return null;
  }
  function ids() { return CAREER_LESSONS.map(function(l) { return l.id; }); }
  function start(id, sceneIdx, onDone) {
    var l = (id && typeof id === 'object') ? id : find(id);
    if (!l || typeof LessonPlayer === 'undefined' || !LessonPlayer || typeof LessonPlayer.start !== 'function') return false;
    return LessonPlayer.start(l, sceneIdx || 0, onDone);
  }
  var api = { find: find, ids: ids, start: start };
  if (typeof module !== 'undefined') module.exports = { CAREER_LESSONS: CAREER_LESSONS, CareerLessons: api };
  return api;
})();
