// journey/career/rivals.js (채우는 작업: 클라우드 F4 라이벌 12명과 서사. 지시문 docs/cloud-tasks/F4.md, 설계 원문 5.1절 4번)
// 계약: journey/career/contract.js 머리 주석의 rivals 인터페이스. 로드 때 CareerContract.register('rivals', api).
//
// 라이벌 항목 { id, name, icon, type(엔진 프로필), cast(캐스트 6명이면 true, 얼굴은 journey/cast.js에서 읽는다), face(SVG 문자열),
//   overlay:{ 프로필 경로: δ }(VillainAdaptive.overlay가 쓰는 점 경로, |δ| ≤ OVERLAY_CAP, 기본값 + δ가 범위 안),
//   threebet?(프리플랍 3벳 빈도 δ, F2 table이 VillainAdaptive._threebet과 같은 규칙으로 쓴다), adaptive?(전설의 테이블 최종 상대),
//   tells:{ real, fake }(진짜 버릇 1, 가짜 버릇 1), bio, homeVenues[](단골 장소), regions[](돌아다니는 지역), exclusive?(regions 밖엔 안 나옴),
//   lines:{ greet[], win[], lose[], story[3] }(해요체, 세션 시작과 끝, 서사 단계), story:{ hands2, hands3, net3 }(2단계 핸드, 3단계 핸드와 순이익 bb) }
// API
//   RIVALS(12, 캐스트 6 + 신규 6), ids(), get(id), list() → 얕은 복사 배열
//   roster(venueId, daySeed, state) → 5명 [{ name, type, rivalId, hidden, overlay:{ fields }(계약 모양, fields = 라이벌 overlay 사본), threebet?, adaptive?, icon }]
//     단골(balance.VENUES[id].regulars)은 늘 앉고, 오늘 이벤트 라이벌(state.events.rival)이 있으면 앉고, 나머지는 장소와 지역 가중으로
//     날짜 시드(CareerContract.seedOf(venueId + '|' + daySeed))로 뽑는다. 숨김 좌석 수 = VENUES[id].hidden(안개 이벤트 state.events.id 'fog'면 5).
//     숨김 좌석은 이름이 '손님A'~'손님E'이고 rivalId는 남는다(통계용). 같은 입력이면 같은 결과(결정론).
//   line(rivalId, moment, state) → 문장('greet' | 'win' | 'lose' | 'story'). story는 지금 단계의 대사. 모르는 라이벌이나 moment면 ''.
//   story(rivalId, state) → { rivalId, stage(0~3), next:{ stage, name, text, need, value, progress(0~1), done } | null, stages:[{ stage, name, done }] }
//     1 만남: 같은 테이블에 앉은 세션 1회(stats.byRival[id].met), 2 도전: 함께 친 핸드 hands2, 3 결전: 핸드 hands3 이상이고 상대로 순이익 net3 bb 이상.
//   ready(state) → [{ rivalId, stage }] 다음 단계 조건을 채운 라이벌(core F1이 story 단계를 올리고 'story'를 emit할 때 쓴다).
//     (웨이브2 후속, 결정 47) 이 모듈은 평판을 더하지 않는다. 'story' 평판(REP.story)은 core의 'story' 수신만 준다.
//   face(id) → SVG, faces() → { id: SVG }
// 원작 이름, 캐릭터, 문구는 쓰지 않는다. 규약: 로드 시 DOM, 저장소 접근 없음(typeof 가드).
var CareerRivals = (function() {
  var OVERLAY_CAP = 0.25;
  var SEATS = 5;
  var LETTERS = ['A', 'B', 'C', 'D', 'E'];
  var MOMENTS = ['greet', 'win', 'lose', 'story'];
  var STAGE_NAMES = ['만남', '도전', '결전'];
  var W_HOME = 4, W_REGION = 1.5, W_FAR = 0.3;

  function _svgFace(label, body) {
    return '<svg class="cast-face" viewBox="0 0 48 48" width="48" height="48" role="img" aria-label="' + label + '">' + body + '</svg>';
  }
  var EYES = '<circle cx="18" cy="22" r="2.4" fill="#2b2b2b"/><circle cx="30" cy="22" r="2.4" fill="#2b2b2b"/>';

  // 캐스트 6명(얼굴과 소개는 journey/cast.js, 여기는 커리어 전용 필드만)
  var CAST6 = [
    { id: '교수', type: 'TAG', icon: '🎓', homeVenues: ['backyard', 'tavern'], regions: ['harbor', 'riverside'],
      overlay: {}, tells: { real: '벳 사이즈가 늘 비슷해요. 갑자기 커지면 밸류가 많아요.', fake: '안경을 고쳐 쓰는 건 버릇일 뿐 손과 상관없어요.' },
      lines: { greet: ['정석대로 치면 돼요. 오늘도 그렇게 할게요.', '자리 잡았죠? 천천히 가요.', '좋은 손으로만 싸우는 날이에요.'],
        win: ['정석이 이겼네요. 다음에 또 봐요.', '오늘은 제 자리가 좋았어요.'],
        lose: ['잘 치셨어요. 정석대로 접은 게 많았네요.', '오늘은 제가 배웠어요.'],
        story: ['처음 뵙네요. 차트를 외우고 오셨다면 반가워요.', '제 레인지를 읽기 시작하셨군요. 그럼 저도 바꿔 볼게요.', '정석을 넘어선 분이네요. 인정해요.'] },
      story: { hands2: 30, hands3: 60, net3: 40 } },
    { id: '불도저', type: 'LAG', icon: '🚜', homeVenues: ['tavern', 'harbor-room'], regions: ['harbor', 'riverside'],
      overlay: {}, tells: { real: '세 번째 배럴까지 쏘는 날이 많아요. 센 손으로 받아 주면 돼요.', fake: '칩을 세게 던져도 손이 센 건 아니에요.' },
      lines: { greet: ['겁낼 것 없어요. 어차피 다 밀 거니까요.', '오늘도 벳으로 말할게요.', '앉았으면 바로 붙어요.'],
        win: ['밀어붙이면 되는 거예요.', '오늘 테이블은 제 거였어요.'],
        lose: ['이번 건 보내 드릴게요. 다음엔 안 접어요.', '잘 받아 내셨어요. 인정이에요.'],
        story: ['새 얼굴이네요. 접는 법부터 배우게 될 거예요.', '제 블러프를 몇 번 잡으셨죠? 이제부터 진짜예요.', '저를 상대로 이만큼 버는 사람은 드물어요.'] },
      story: { hands2: 30, hands3: 60, net3: 50 } },
    { id: '햇살', type: 'Fish', icon: '🌞', homeVenues: ['backyard'], regions: ['harbor'],
      overlay: {}, tells: { real: '예쁜 카드면 다 들어와요. 좋은 손으로 밸류벳을 크게 해도 콜해요.', fake: '웃고 있어도 손이 좋은 건 아니에요. 늘 웃어요.' },
      lines: { greet: ['오늘도 재밌게 쳐요! 일단 가 보는 거죠.', '카드 두 장이 예쁘면 들어갈 거예요.', '같이 앉으니까 좋네요.'],
        win: ['오늘은 카드가 예뻤어요!', '재밌었죠? 또 해요.'],
        lose: ['에이, 재미없다. 그래도 또 올게요.', '오늘은 카드가 안 왔어요.'],
        story: ['처음 보는 분이네요! 재밌게 쳐요.', '요즘 잘 치시네요. 저도 조금 배워 볼까요?', '이제 제가 못 이기겠어요. 그래도 재밌어요.'] },
      story: { hands2: 20, hands3: 40, net3: 30 } },
    { id: '바위', type: 'Nit', icon: '🗿', homeVenues: ['harbor-room', 'riverside-casino'], regions: ['harbor', 'riverside'],
      overlay: {}, tells: { real: '프리플랍 레이즈가 드물어요. 레이즈하면 센 손이에요.', fake: '오래 생각한다고 약한 건 아니에요. 늘 오래 생각해요.' },
      lines: { greet: ['확실할 때만 갈 거예요. 기다릴게요.', '오늘도 좋은 패를 기다려요.', '급할 것 없어요.'],
        win: ['기다린 보람이 있었어요.', '확실한 손이 이겼네요.'],
        lose: ['확실하지 않으면 안 가요. 오늘은 그래서 졌어요.', '잘 치셨어요. 저는 기다릴게요.'],
        story: ['새로 오셨군요. 저는 말이 없어요.', '제 레이즈에 접기 시작하셨네요. 읽으셨군요.', '제 인내를 넘어선 분이에요. 드문 일이에요.'] },
      story: { hands2: 30, hands3: 60, net3: 30 } },
    { id: '카멜레온', type: 'Mixed', icon: '🦎', homeVenues: ['riverside-casino', 'vip-room'], regions: ['riverside', 'highland'],
      overlay: {}, tells: { real: '스트리트마다 성향이 바뀌어요. 리버에선 약해지는 편이에요.', fake: '색이 바뀐 듯한 말투는 그냥 말투예요.' },
      lines: { greet: ['이번엔 어떤 색으로 칠까요.', '오늘의 저는 어제의 저와 달라요.', '읽을 수 있으면 읽어 봐요.'],
        win: ['색을 잘 바꿨네요.', '오늘 색은 잘 맞았어요.'],
        lose: ['색을 바꿀 때예요.', '오늘은 읽히고 말았네요.'],
        story: ['새 얼굴이네요. 제 색을 맞혀 볼래요?', '제 패턴을 조금 읽으셨네요. 더 바꿔 볼게요.', '카멜레온을 이기는 사람은 드물어요. 축하해요.'] },
      story: { hands2: 40, hands3: 80, net3: 50 } },
    { id: '콜마스터', type: 'Station', icon: '📞', homeVenues: ['backyard', 'tavern'], regions: ['harbor'],
      overlay: {}, tells: { real: '웬만해선 안 접어요. 블러프는 통하지 않고 밸류벳은 다 받아 줘요.', fake: '전화기를 보는 건 습관이에요. 손과 상관없어요.' },
      lines: { greet: ['쉽게는 안 접을 거예요.', '끝까지 볼게요. 각오해요.', '오늘도 콜이에요.'],
        win: ['끝까지 본 보람이 있네요.', '제가 쉽게 안 접는다고 했죠.'],
        lose: ['이건 저도 못 따라갔어요.', '오늘은 콜이 안 맞았네요.'],
        story: ['새로 오셨네요. 저한텐 블러프 안 통해요.', '밸류로만 치시네요. 저를 읽으셨어요.', '저를 상대로 이렇게 꾸준히 벌다니, 인정해요.'] },
      story: { hands2: 20, hands3: 40, net3: 40 } }
  ];

  // 신규 6명(자체 작명, 원작 고유명사 아님). 얼굴은 48x48 SVG, 색과 모양으로 구분.
  var NEW6 = [
    {
      id: '선장', name: '선장', type: 'Nit', icon: '⚓', homeVenues: ['harbor-room', 'tavern'], regions: ['harbor', 'riverside'],
      face: _svgFace('선장',
        '<circle cx="24" cy="26" r="17" fill="#e6c3a0"/>' +
        '<path d="M6 16 Q24 4 42 16 L40 20 L8 20 Z" fill="#1f3a5f"/>' +
        '<rect x="8" y="18" width="32" height="4" rx="1" fill="#2d4f7c"/>' +
        '<circle cx="24" cy="15" r="2" fill="#f2c94c"/>' +
        EYES +
        '<path d="M14 36 Q24 40 34 36 L34 42 Q24 46 14 42 Z" fill="#8c8c8c"/>' +
        '<path d="M19 33 L29 33" stroke="#4a2f1a" stroke-width="2" stroke-linecap="round"/>'),
      overlay: { 'cbet.dry': -0.1, 'cbet.wet': -0.05, fold_to_cbet: -0.15, bluff_freq: 0.05 },
      tells: { real: '체크 뒤에 레이즈가 오면 거의 센 손이에요. 함정을 파고 기다리는 사람이에요.', fake: '모자를 고쳐 쓰는 건 버릇이에요. 손과 상관없어요.' },
      bio: '항구를 오래 지킨 함정 전문가. 체크로 숨겼다가 한 번에 거둬요.',
      lines: { greet: ['바다는 급한 사람을 먼저 삼켜요. 천천히 가요.', '오늘 파도는 잔잔하네요. 기다리기 좋은 날이에요.', '그물은 이미 쳐 뒀어요.'],
        win: ['그물에 걸리셨네요.', '기다린 쪽이 이기는 법이에요.'],
        lose: ['오늘은 제 그물이 비었네요.', '잘 피해 가셨어요. 항해 잘하시네요.'],
        story: ['새 선원이군요. 체크는 약하다는 뜻이 아니에요.', '제 함정을 알아채셨네요. 그럼 그물을 바꿔야겠어요.', '제 그물을 뚫은 사람은 손에 꼽아요. 좋은 항해였어요.'] },
      story: { hands2: 30, hands3: 60, net3: 40 }
    },
    {
      id: '유령', name: '유령', type: 'LAG', icon: '👻', homeVenues: ['riverside-casino', 'vip-room'], regions: ['riverside', 'highland'],
      face: _svgFace('유령',
        '<path d="M10 44 L10 24 Q10 8 24 8 Q38 8 38 24 L38 44 L33 39 L28 44 L24 39 L20 44 L15 39 Z" fill="#dfe7f2" stroke="#9fb0c6" stroke-width="1.4"/>' +
        '<ellipse cx="18" cy="23" rx="2.6" ry="3.4" fill="#2b2b2b"/><ellipse cx="30" cy="23" rx="2.6" ry="3.4" fill="#2b2b2b"/>' +
        '<ellipse cx="24" cy="32" rx="3" ry="2" fill="#2b2b2b"/>'),
      overlay: { bluff_freq: 0.15, 'cbet.dry': 0.1, fold_to_cbet: -0.05, 'bet_sizing.bluff': 0.1 },
      tells: { real: '블러프가 많아요. 중간 손으로도 콜을 받아 주면 자주 이겨요.', fake: '조용하다고 약한 게 아니에요. 늘 조용해요.' },
      bio: '있는 듯 없는 듯 팟을 훔치는 블러프의 달인. 겁먹은 사람의 칩만 가져가요.',
      lines: { greet: ['제가 여기 있는 거, 보이세요?', '오늘은 바람이 많이 불겠네요.', '겁내지 마세요. 아직은요.'],
        win: ['역시 접으시는군요.', '보이지 않는 손이 가져갔어요.'],
        lose: ['제가 보이셨나 봐요.', '오늘은 제 허세가 잡혔네요.'],
        story: ['새 얼굴이네요. 제 벳은 반은 비어 있어요.', '제 빈 벳을 잡기 시작하셨군요. 재밌어졌어요.', '유령을 잡은 사람, 오랜만이에요.'] },
      story: { hands2: 30, hands3: 60, net3: 50 }
    },
    {
      id: '회계사', name: '회계사', type: 'TAG', icon: '🧮', homeVenues: ['riverside-casino', 'harbor-room'], regions: ['harbor', 'riverside'],
      face: _svgFace('회계사',
        '<circle cx="24" cy="25" r="18" fill="#f6d6b8"/>' +
        '<path d="M9 18 Q24 6 39 18 L39 14 Q24 2 9 14 Z" fill="#5c4033"/>' +
        '<rect x="12" y="19" width="10" height="7" rx="2" fill="none" stroke="#2b2b2b" stroke-width="1.6"/>' +
        '<rect x="26" y="19" width="10" height="7" rx="2" fill="none" stroke="#2b2b2b" stroke-width="1.6"/>' +
        '<path d="M22 22 L26 22" stroke="#2b2b2b" stroke-width="1.6"/>' +
        '<circle cx="17" cy="22.5" r="1.5" fill="#2b2b2b"/><circle cx="31" cy="22.5" r="1.5" fill="#2b2b2b"/>' +
        '<path d="M18 34 L30 34" stroke="#7a4a2a" stroke-width="1.8" stroke-linecap="round"/>'),
      overlay: { fold_to_cbet: 0.05, bluff_freq: -0.05, 'bet_sizing.value': 0.08 },
      tells: { real: '가격이 안 맞으면 바로 접어요. 큰 벳에는 센 손만 콜해요.', fake: '숫자를 중얼거리는 건 습관이에요. 손과 상관없어요.' },
      bio: '팟 오즈를 암산으로 맞추는 수학형. 가격이 틀린 콜은 절대 하지 않아요.',
      lines: { greet: ['가격부터 맞춰 보죠.', '오늘도 계산대로 칠게요.', '필요 승률이 안 나오면 접을 거예요.'],
        win: ['계산이 맞았네요.', '숫자는 거짓말을 안 해요.'],
        lose: ['제 계산 밖의 결과네요. 분산이죠.', '잘 치셨어요. 가격을 아시는 분이네요.'],
        story: ['새 분이군요. 콜하기 전에 가격은 보세요.', '제 폴드를 이용하시네요. 계산에 넣어야겠어요.', '제 장부에 적자를 남긴 분은 드물어요.'] },
      story: { hands2: 30, hands3: 60, net3: 40 }
    },
    {
      id: '춤꾼', name: '춤꾼', type: 'Mixed', icon: '💃', homeVenues: ['vip-room', 'highroller'], regions: ['riverside', 'highland'],
      face: _svgFace('춤꾼',
        '<circle cx="24" cy="25" r="18" fill="#f3b6a4"/>' +
        '<path d="M6 20 Q10 4 24 6 Q38 4 42 20 Q36 12 24 13 Q12 12 6 20 Z" fill="#c0392b"/>' +
        '<circle cx="40" cy="12" r="4" fill="#e74c3c"/><circle cx="40" cy="12" r="1.6" fill="#f9e79f"/>' +
        '<path d="M15 22 Q18 19 21 22 M27 22 Q30 19 33 22" fill="none" stroke="#2b2b2b" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M17 32 Q24 38 31 32" fill="none" stroke="#7a2a2a" stroke-width="2" stroke-linecap="round"/>'),
      overlay: { noise: 0.1, bluff_freq: 0.05, 'cbet.wet': 0.05 },
      tells: { real: '같은 자리에서도 행동이 자주 바뀌어요. 한 핸드로 유형을 정하지 마세요.', fake: '리듬을 타는 건 음악 때문이에요. 손과 상관없어요.' },
      bio: '스텝처럼 성향이 바뀌는 변덕쟁이. 읽었다 싶으면 다음 스텝으로 넘어가요.',
      lines: { greet: ['오늘 스텝은 어떤 걸로 할까요.', '리듬 타 볼까요?', '따라올 수 있으면 따라와 봐요.'],
        win: ['스텝이 맞았네요.', '오늘 무대는 제 거였어요.'],
        lose: ['박자를 놓쳤네요.', '오늘은 제 스텝이 읽혔어요.'],
        story: ['새 파트너네요. 박자 맞춰 봐요.', '제 스텝을 반쯤 읽으셨네요. 바꿔야겠어요.', '제 춤을 끝까지 따라온 분이에요. 멋져요.'] },
      story: { hands2: 40, hands3: 80, net3: 50 }
    },
    {
      id: '쌍둥이', name: '쌍둥이', type: 'Station', icon: '👯', homeVenues: ['tavern', 'riverside-casino'], regions: ['harbor', 'riverside'],
      face: _svgFace('쌍둥이',
        '<circle cx="16" cy="26" r="12" fill="#bfe3d0"/><circle cx="32" cy="26" r="12" fill="#bfe3d0"/>' +
        '<path d="M6 22 Q16 10 26 22" fill="#2e7d5b"/><path d="M22 22 Q32 10 42 22" fill="#2e7d5b"/>' +
        '<circle cx="13" cy="26" r="1.8" fill="#2b2b2b"/><circle cx="19" cy="26" r="1.8" fill="#2b2b2b"/>' +
        '<circle cx="29" cy="26" r="1.8" fill="#2b2b2b"/><circle cx="35" cy="26" r="1.8" fill="#2b2b2b"/>' +
        '<path d="M12 32 Q16 35 20 32 M28 32 Q32 35 36 32" fill="none" stroke="#2b5a45" stroke-width="1.6" stroke-linecap="round"/>'),
      overlay: { fold_to_cbet: -0.05, 'cbet.dry': 0.05, bluff_freq: 0.03 },
      tells: { real: '둘 다 끝까지 콜해요. 블러프는 아끼고 밸류벳을 두껍게 쳐요.', fake: '둘이 눈을 맞추는 건 신호가 아니에요. 그냥 쌍둥이예요.' },
      bio: '늘 둘이 붙어 다니는 콜의 쌍둥이. 접는 법을 서로에게도 안 가르쳐요.',
      lines: { greet: ['저희 둘 다 콜이에요.', '오늘도 끝까지 봐요.', '접는 건 다음 생에 할게요.'],
        win: ['콜이 이겼네요. 둘 다요.', '끝까지 본 게 맞았어요.'],
        lose: ['이번엔 둘 다 틀렸네요.', '잘 치셨어요. 저희는 또 콜할 거예요.'],
        story: ['새 분이네요. 저희한텐 블러프 아끼세요.', '밸류로만 치시네요. 둘이서 상의해야겠어요.', '저희 둘을 상대로 꾸준히 벌다니, 대단해요.'] },
      story: { hands2: 20, hands3: 40, net3: 40 }
    },
    {
      id: '여왕', name: '여왕', type: 'TAG', icon: '👑', homeVenues: ['legend', 'highroller'], regions: ['highland'], exclusive: true, adaptive: true,
      face: _svgFace('여왕',
        '<circle cx="24" cy="27" r="17" fill="#f1d3c1"/>' +
        '<path d="M8 16 L13 6 L19 14 L24 4 L29 14 L35 6 L40 16 Z" fill="#d4af37"/>' +
        '<circle cx="13" cy="7" r="1.6" fill="#c0392b"/><circle cx="24" cy="5" r="1.8" fill="#2980b9"/><circle cx="35" cy="7" r="1.6" fill="#c0392b"/>' +
        '<path d="M14 21 L21 21 M27 21 L34 21" stroke="#2b2b2b" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="18" cy="24" r="2" fill="#2b2b2b"/><circle cx="30" cy="24" r="2" fill="#2b2b2b"/>' +
        '<path d="M18 35 Q24 33 30 35" fill="none" stroke="#8e3b46" stroke-width="2" stroke-linecap="round"/>'),
      overlay: { fold_to_cbet: -0.05, bluff_freq: 0.08, 'cbet.wet': 0.1, 'bet_sizing.value': 0.1 },
      threebet: 0.1,
      tells: { real: '내 성향을 읽고 바꿔요. 내가 많이 접으면 더 밀고, 많이 콜하면 밸류만 쳐요.', fake: '왕관을 만지는 건 버릇이에요. 손과 상관없어요.' },
      bio: '전설의 테이블을 지키는 마지막 상대. 상대의 버릇을 읽고 자기 플레이를 바꿔요.',
      lines: { greet: ['여기까지 온 걸 환영해요. 이제부터는 제가 당신을 읽을 차례예요.', '왕관은 아무에게나 넘기지 않아요.', '당신의 버릇, 이미 보고 있어요.'],
        win: ['왕관은 아직 제 거예요.', '당신의 버릇이 보였어요.'],
        lose: ['이런 날도 있군요. 다음엔 다르게 칠 거예요.', '제 읽기를 넘어서셨네요. 인정해요.'],
        story: ['전설의 자리에 앉은 새 얼굴. 지켜볼게요.', '제 적응을 알아채고 바꾸시는군요. 재밌어요.', '왕관을 나눠 가질 때가 됐네요. 축하해요.'] },
      story: { hands2: 40, hands3: 80, net3: 60 }
    }
  ];

  var RIVALS = [];
  var _byId = {};
  CAST6.forEach(function(c) {
    var r = { id: c.id, name: c.id, icon: c.icon, type: c.type, cast: true, face: null, overlay: c.overlay, tells: c.tells, bio: null,
      homeVenues: c.homeVenues, regions: c.regions, lines: c.lines, story: c.story };
    RIVALS.push(r); _byId[r.id] = r;
  });
  NEW6.forEach(function(r) { r.cast = false; RIVALS.push(r); _byId[r.id] = r; });

  // ── 작은 도구 ──
  function _cc() { return (typeof CareerContract !== 'undefined' && CareerContract) ? CareerContract : null; }
  function _balance() {
    var C = _cc();
    var B = C && typeof C.mod === 'function' ? C.mod('balance') : null;
    if (!B && typeof CareerBalance !== 'undefined') B = CareerBalance;
    return B || null;
  }
  function _castEntry(id) {
    if (typeof CAST === 'undefined' || !Array.isArray(CAST)) return null;
    for (var i = 0; i < CAST.length; i++) if (CAST[i] && CAST[i].key === id) return CAST[i];
    return null;
  }
  function _seedOf(s) {
    var C = _cc();
    if (C && typeof C.seedOf === 'function') return C.seedOf(s);
    var h = 0x811c9dc5; s = String(s == null ? '' : s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0) || 1;
  }
  // mulberry32: 같은 시드면 같은 수열
  function _rng(seed) {
    var a = (seed >>> 0) || 1;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _n(x) { x = Number(x); return isFinite(x) ? x : 0; }
  function _copy(o) { var out = {}; Object.keys(o || {}).forEach(function(k) { out[k] = o[k]; }); return out; }

  // ── 조회 ──
  function get(id) { return Object.prototype.hasOwnProperty.call(_byId, id) ? _byId[id] : null; }
  function ids() { return RIVALS.map(function(r) { return r.id; }); }
  function face(id) {
    var r = get(id);
    if (!r) return '';
    if (r.cast) { var c = _castEntry(id); return c && typeof c.face === 'string' ? c.face : ''; }
    return r.face || '';
  }
  function bio(id) {
    var r = get(id);
    if (!r) return '';
    if (r.cast) { var c = _castEntry(id); return c && typeof c.bio === 'string' ? c.bio : ''; }
    return r.bio || '';
  }
  function faces() {
    var out = {};
    RIVALS.forEach(function(r) { out[r.id] = face(r.id); });
    return out;
  }
  function list() {
    return RIVALS.map(function(r) {
      var o = _copy(r);
      o.face = face(r.id); o.bio = bio(r.id);
      return o;
    });
  }

  // ── 오늘의 좌석(결정론) ──
  function _weight(r, venueId, region) {
    if (r.homeVenues.indexOf(venueId) >= 0) return W_HOME;
    if (region && r.regions.indexOf(region) >= 0) return W_REGION;
    return r.exclusive ? 0 : W_FAR;
  }
  function _pickWeighted(cands, rnd) {
    var tot = 0;
    cands.forEach(function(c) { tot += c.w; });
    if (tot <= 0) return cands.length ? cands[Math.floor(rnd() * cands.length) % cands.length] : null;
    var x = rnd() * tot;
    for (var i = 0; i < cands.length; i++) { x -= cands[i].w; if (x < 0) return cands[i]; }
    return cands[cands.length - 1];
  }
  function roster(venueId, daySeed, state) {
    var B = _balance();
    var V = (B && _isObj(B.VENUES) && _isObj(B.VENUES[venueId])) ? B.VENUES[venueId] : null;
    var region = V ? V.region : null;
    var rnd = _rng(_seedOf(String(venueId) + '|' + String(daySeed == null ? '' : daySeed)));
    var picked = [], used = {};
    function take(id) {
      var r = get(id);
      if (!r || used[id] || picked.length >= SEATS) return false;
      used[id] = true; picked.push(r); return true;
    }
    (V && Array.isArray(V.regulars) ? V.regulars : []).forEach(take);
    var ev = state && _isObj(state.events) ? state.events : null;
    if (ev && ev.id === 'rival' && ev.rival) take(ev.rival);
    while (picked.length < SEATS) {
      var cands = RIVALS.filter(function(r) { return !used[r.id]; }).map(function(r) { return { r: r, w: _weight(r, venueId, region) }; })
        .filter(function(c) { return c.w > 0; });
      if (!cands.length) cands = RIVALS.filter(function(r) { return !used[r.id]; }).map(function(r) { return { r: r, w: 1 }; });
      if (!cands.length) break;
      var c = _pickWeighted(cands, rnd);
      take(c.r.id);
    }
    var hidden = Math.max(0, Math.min(SEATS, Math.floor(_n(V && V.hidden))));
    if (ev && ev.id === 'fog') hidden = SEATS;
    var out = [], h = 0;
    picked.forEach(function(r, i) {
      var isHidden = i >= picked.length - hidden;
      var seat = { name: isHidden ? '손님' + LETTERS[h++] : r.name, type: r.type, rivalId: r.id, hidden: isHidden, overlay: { fields: _copy(r.overlay) }, icon: r.icon };
      if (r.threebet) seat.threebet = r.threebet;
      if (r.adaptive) seat.adaptive = true;
      out.push(seat);
    });
    return out;
  }

  // ── 대사 ──
  function _byRival(state, id) {
    var s = state && _isObj(state.stats) && _isObj(state.stats.byRival) ? state.stats.byRival[id] : null;
    return _isObj(s) ? s : { hands: 0, net: 0, met: 0 };
  }
  function _stageOf(state, id) {
    var s = state && _isObj(state.story) && _isObj(state.story[id]) ? state.story[id] : null;
    var st = s ? Math.floor(_n(s.stage)) : 0;
    return Math.max(0, Math.min(3, st));
  }
  function line(rivalId, moment, state) {
    var r = get(rivalId);
    if (!r || MOMENTS.indexOf(moment) < 0) return '';
    var arr = r.lines[moment] || [];
    if (!arr.length) return '';
    if (moment === 'story') return arr[Math.max(0, Math.min(arr.length - 1, _stageOf(state, rivalId) - 1))];
    var br = _byRival(state, rivalId);
    var day = state && _isObj(state.daily) && state.daily.day ? String(state.daily.day) : '';
    var k = _seedOf(rivalId + '|' + moment + '|' + day + '|' + _n(br.hands)) % arr.length;
    return arr[k];
  }

  // ── 서사 3단계 ──
  function _stages(r) {
    var s = r.story || {};
    return [
      { stage: 1, name: STAGE_NAMES[0], need: { met: 1 } },
      { stage: 2, name: STAGE_NAMES[1], need: { hands: Math.max(1, _n(s.hands2)) } },
      { stage: 3, name: STAGE_NAMES[2], need: { hands: Math.max(1, _n(s.hands3)), net: _n(s.net3) } }
    ];
  }
  function _progress(need, br) {
    var parts = [];
    if (need.met) parts.push(Math.min(1, _n(br.met) / need.met));
    if (need.hands) parts.push(Math.min(1, _n(br.hands) / need.hands));
    if (need.net) parts.push(Math.min(1, Math.max(0, _n(br.net)) / need.net));
    if (!parts.length) return 1;
    var p = 1;
    parts.forEach(function(x) { if (x < p) p = x; });
    return Math.round(p * 100) / 100;
  }
  function story(rivalId, state) {
    var r = get(rivalId);
    if (!r) return null;
    var cur = _stageOf(state, rivalId), br = _byRival(state, rivalId);
    var stages = _stages(r);
    var nx = cur < 3 ? stages[cur] : null;
    var next = null;
    if (nx) {
      var prog = _progress(nx.need, br);
      next = { stage: nx.stage, name: nx.name, text: r.lines.story[nx.stage - 1] || '', need: nx.need,
        value: { met: _n(br.met), hands: _n(br.hands), net: _n(br.net) }, progress: prog, done: prog >= 1 };
    }
    return { rivalId: rivalId, stage: cur, next: next, stages: stages.map(function(s) { return { stage: s.stage, name: s.name, done: s.stage <= cur }; }) };
  }
  function ready(state) {
    var out = [];
    RIVALS.forEach(function(r) {
      var s = story(r.id, state);
      if (s && s.next && s.next.done) out.push({ rivalId: r.id, stage: s.next.stage });
    });
    return out;
  }

  var api = {
    RIVALS: RIVALS, OVERLAY_CAP: OVERLAY_CAP, SEATS: SEATS, MOMENTS: MOMENTS.slice(), STAGE_NAMES: STAGE_NAMES.slice(),
    ids: ids, get: get, list: list, face: face, faces: faces, bio: bio,
    roster: roster, line: line, story: story, ready: ready
  };
  if (typeof CareerContract !== 'undefined' && CareerContract && typeof CareerContract.register === 'function') CareerContract.register('rivals', api);
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
