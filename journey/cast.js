// journey/cast.js (채우는 패키지: M4-P2)
// 캐스트 6인(설계서 3.3절, 7.1절 14번, 부록 E, 계약 T3). 데이터만.
// 항목 { key, type, name, icon, face, tail, tailGiveUp, bio, unlockStage, theater{...} }
//   key = 좌석 이름(journey-core DEFAULT_CAST와 같음), name = 화면 이름(key와 같다, j-nodes 강조 캐스트 검사가 name으로 찾는다)
//   type = 엔진 프로필(ai/villain-profiles.js), icon = 이모지 1자(글자 자리에도 안전), face = 얼굴 SVG 문자열(innerHTML 전용)
//   tail / tailGiveUp = 말버릇 꼬리말(평소 / 포기할 때, 앞뒤 공백 없음, thinking.js가 붙인다. hideTypes면 쓰지 않는다)
//     tail은 밸류, 블러프, 체크나 콜 속마음 어디에 붙어도 어긋나지 않는 말로 쓴다(예: 콜 속마음 뒤 '계속 밀어붙이자' 금지).
//   bio = 자기소개 1줄, unlockStage = 도감 페이지가 열리는 단계(강조 캐스트로 처음 나오는 단계)
//   theater = 극장 전용 파라미터(게임 모드 프로필은 그대로). 기본값은 설계값, 시즌 규칙이 ±0.1 변형한다.
//     plan_weights { 계획키: 가중 } 핸드 시작 때 후보 계획 추첨 가중(theater/plans.js 9종, 0이면 뽑지 않음)
//     trap_freq       함정 성향. 블라인드의 핸드 시작 추첨과 OOP 중간 이상 손의 계획 재선택에서 체크레이즈 함정 가중에
//                     100 x trap_freq를 더한다(theater/cast-ai.js TRAP_BONUS)
//     checkraise_freq 벳을 맞았을 때 레이즈를 더하는 확률(밸류 극대화: 투페어 이상 0.6 +, 원페어 0.3 +, 세미블러프 압박: 0.5 + 2배)
//     barrel          3배럴 블러프가 턴과 리버에 계속 쏘는 확률, 벳을 맞으면 블러프 레이즈하는 확률, 프리플랍 스틸 확률,
//                     세미블러프가 리버에 못 맞췄을 때 블러프하는 확률
//     slowplay_freq   프리미엄 손으로 레이즈를 맞았을 때 3벳 대신 콜로 숨기는 확률(슬로플레이 계획은 항상 콜)
//     bluffcatch_freq 블러프캐치 계획이 큰 벳(팟의 75% 초과)을, 팟컨트롤 계획의 중간 손이 큰 벳을 맞았을 때 그래도 콜하는 확률
// 문구 규칙: 원작 고유명사 금지(content-lint), 가운뎃점과 긴줄표 대신 쉼표.
var CAST = (function() {
  function face(label, body) {
    return '<svg class="cast-face" viewBox="0 0 48 48" width="48" height="48" role="img" aria-label="' + label + '">' + body + '</svg>';
  }
  var EYES = '<circle cx="18" cy="22" r="2.4" fill="#2b2b2b"/><circle cx="30" cy="22" r="2.4" fill="#2b2b2b"/>';
  function w(b3, tc, sp, bf, bc, vm, sm, pc, gu) {
    return { barrel3: b3, trap_cr: tc, slowplay: sp, bet_fold: bf, bluffcatch: bc, value_max: vm, semi_push: sm, pot_control: pc, give_up: gu };
  }
  return [
    {
      key: '교수', type: 'TAG', name: '교수', icon: '🎓', unlockStage: 1,
      face: face('교수',
        '<circle cx="24" cy="25" r="18" fill="#f2c9a0"/>' +
        '<path d="M8 15 L24 7 L40 15 L24 21 Z" fill="#33415c"/>' +
        '<circle cx="18" cy="24" r="5" fill="none" stroke="#2b2b2b" stroke-width="1.6"/>' +
        '<circle cx="30" cy="24" r="5" fill="none" stroke="#2b2b2b" stroke-width="1.6"/>' +
        '<path d="M23 24 L25 24" stroke="#2b2b2b" stroke-width="1.6"/>' +
        '<circle cx="18" cy="24" r="1.6" fill="#2b2b2b"/><circle cx="30" cy="24" r="1.6" fill="#2b2b2b"/>' +
        '<path d="M19 34 Q24 36 29 34" fill="none" stroke="#7a4a2a" stroke-width="1.8" stroke-linecap="round"/>'),
      tail: '정석대로.', tailGiveUp: '정석대로 접는다.',
      bio: '정석을 사랑하는 원칙주의자. 좋은 자리에서 좋은 손으로만 싸운다.',
      theater: { plan_weights: w(1, 2, 1, 3, 2, 3, 2, 3, 3), trap_freq: 0.10, checkraise_freq: 0.08, barrel: 0.5, slowplay_freq: 0.05, bluffcatch_freq: 0.25 }
    },
    {
      key: '불도저', type: 'LAG', name: '불도저', icon: '🚜', unlockStage: 3,
      face: face('불도저',
        '<circle cx="24" cy="25" r="18" fill="#e8a87c"/>' +
        '<rect x="7" y="12" width="34" height="5" rx="2" fill="#d64545"/>' +
        '<path d="M13 19 L22 22 M35 19 L26 22" stroke="#2b2b2b" stroke-width="2.2" stroke-linecap="round"/>' +
        EYES +
        '<path d="M16 31 Q24 38 32 31 Z" fill="#fff" stroke="#7a2a2a" stroke-width="1.6" stroke-linejoin="round"/>'),
      tail: '겁낼 것 없다.', tailGiveUp: '이번 건 보내주지.',
      bio: '멈추는 법을 모르는 공격수. 말 대신 벳으로 대화한다.',
      theater: { plan_weights: w(4, 2, 1, 2, 3, 2, 4, 1, 1), trap_freq: 0.10, checkraise_freq: 0.15, barrel: 0.8, slowplay_freq: 0.05, bluffcatch_freq: 0.40 }
    },
    {
      key: '햇살', type: 'Fish', name: '햇살', icon: '🌞', unlockStage: 1,
      face: face('햇살',
        '<circle cx="24" cy="25" r="18" fill="#ffd166"/>' +
        '<path d="M24 1 L24 6 M5 8 L9 11 M43 8 L39 11" stroke="#f4a261" stroke-width="2" stroke-linecap="round"/>' +
        EYES +
        '<circle cx="13" cy="29" r="3" fill="#f4978e"/><circle cx="35" cy="29" r="3" fill="#f4978e"/>' +
        '<path d="M16 30 Q24 39 32 30" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>'),
      tail: '일단 가보자~', tailGiveUp: '에이 재미없다~',
      bio: '포커가 그냥 즐거운 낙천가. 카드 두 장이 예뻐 보이면 일단 들어간다.',
      theater: { plan_weights: w(1, 1, 2, 1, 4, 2, 1, 3, 2), trap_freq: 0.05, checkraise_freq: 0.03, barrel: 0.3, slowplay_freq: 0.15, bluffcatch_freq: 0.60 }
    },
    {
      key: '바위', type: 'Nit', name: '바위', icon: '🗿', unlockStage: 4,
      face: face('바위',
        '<path d="M8 30 Q6 12 22 8 Q40 6 42 24 Q44 40 26 42 Q10 43 8 30 Z" fill="#b0b7c3"/>' +
        '<path d="M14 18 L22 18 M26 18 L34 18" stroke="#3d3d3d" stroke-width="2.2" stroke-linecap="round"/>' +
        EYES +
        '<path d="M18 33 L30 33" stroke="#3d3d3d" stroke-width="2" stroke-linecap="round"/>'),
      tail: '확실할 때만 간다.', tailGiveUp: '확실하지 않으면 안 간다.',
      bio: '좋은 패가 올 때까지 몇 시간이고 기다리는 인내의 화신.',
      theater: { plan_weights: w(0, 2, 3, 2, 1, 4, 1, 2, 4), trap_freq: 0.15, checkraise_freq: 0.05, barrel: 0.4, slowplay_freq: 0.20, bluffcatch_freq: 0.10 }
    },
    {
      key: '카멜레온', type: 'Mixed', name: '카멜레온', icon: '🦎', unlockStage: 5,
      face: face('카멜레온',
        '<path d="M24 7 A18 18 0 0 0 24 43 Z" fill="#7bc47f"/>' +
        '<path d="M24 7 A18 18 0 0 1 24 43 Z" fill="#5aa0d8"/>' +
        '<circle cx="18" cy="22" r="2.4" fill="#2b2b2b"/>' +
        '<path d="M27 22 Q30 19 33 22" fill="none" stroke="#2b2b2b" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M17 32 Q22 35 26 32 Q29 30 32 32" fill="none" stroke="#2b2b2b" stroke-width="1.8" stroke-linecap="round"/>'),
      tail: '이번엔 이 색으로.', tailGiveUp: '색을 바꿀 때다.',
      bio: '스트리트마다 얼굴이 바뀌는 변덕쟁이. 다음 수를 읽기 가장 어렵다.',
      theater: { plan_weights: w(2, 2, 2, 2, 2, 2, 2, 2, 2), trap_freq: 0.12, checkraise_freq: 0.12, barrel: 0.6, slowplay_freq: 0.10, bluffcatch_freq: 0.30 }
    },
    {
      key: '콜마스터', type: 'Station', name: '콜마스터', icon: '📞', unlockStage: 2,
      face: face('콜마스터',
        '<circle cx="24" cy="25" r="18" fill="#c9a7eb"/>' +
        '<path d="M7 24 Q7 8 24 8 Q41 8 41 24" fill="none" stroke="#4a3b5c" stroke-width="2.4"/>' +
        '<rect x="4" y="21" width="6" height="9" rx="2" fill="#4a3b5c"/><rect x="38" y="21" width="6" height="9" rx="2" fill="#4a3b5c"/>' +
        '<path d="M15 23 L21 23 M27 23 L33 23" stroke="#2b2b2b" stroke-width="2.4" stroke-linecap="round"/>' +
        '<path d="M19 32 Q24 35 29 32" fill="none" stroke="#4a3b5c" stroke-width="1.8" stroke-linecap="round"/>'),
      tail: '쉽게는 안 접는다.', tailGiveUp: '이건 나도 못 따라가.',
      bio: '웬만해선 접지 않는 끈기의 승부사. 끝까지 봐야 직성이 풀린다.',
      theater: { plan_weights: w(0, 1, 2, 1, 5, 2, 1, 3, 1), trap_freq: 0.03, checkraise_freq: 0.02, barrel: 0.2, slowplay_freq: 0.10, bluffcatch_freq: 0.80 }
    }
  ];
})();
if (typeof module !== 'undefined') module.exports = { CAST: CAST };
