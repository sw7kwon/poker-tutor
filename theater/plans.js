// theater/plans.js (채우는 패키지: M4-P2)
// 계획 9종(설계서 부록 E, 계약 T3). 데이터만. 실행 규칙은 theater/cast-ai.js(TheaterAI)가 가진다.
// 항목 { key, kor, needs, keep, steps, foreshadow, lines, predictLabel, hint }
//   needs { strength:[...], position?:'ip'|'oop'|'any', aggressor?:true|false }
//     strength 어휘: nut, strong, medium, weak(약한 페어), draw, air. 핸드 시작 때 후보 필터에 쓴다.
//     프리플랍은 Thinking.preflopGrade 등급을 예상 강도로 바꿔 대조한다(TheaterAI.GRADE_CLASS).
//     position 'oop'는 버튼(포스트플랍에 늘 마지막)을, 'ip'는 SB(늘 처음)를 후보에서 뺀다.
//     aggressor true는 프리플랍 레이저(또는 아무도 레이즈하지 않은 팟), false는 레이저가 아닌 사람.
//   keep { flop, turn, river }: 플랍 뒤 실제 강도(Thinking.strength)가 이 목록에 있으면 계획을 이어 간다.
//     벗어나면 핸드당 1회 계획을 바꾸고 '계획 변경' 자막을 낸다(설계서 부록 E 후보 필터 문단).
//     needs보다 넓을 수 있다(예: 3배럴 블러프에 드로우가 생겨도 블러프는 그대로 이어 감).
//     예외(M7 TH-01): trap_cr의 keep에 든 medium은 내 카드로 만든 투페어 이상일 때만 이어 간다(theater/cast-ai.js context의 two).
//     탑페어와 오버페어(medium)로 '걸렸다! 체크레이즈'를 하면 승률 47%짜리 레이즈가 성공담이 되므로 계획을 바꾼다.
//   steps { flop, turn, river }: 스트리트별 행동 요약(화면과 레슨 설명용 문장).
//   foreshadow: 핸드 시작 예고 문장 변형(3개 이상). lines { flop, turn, river, ... }: 스트리트별 예고(각 3개).
//     lines.cbet(포기, 블러프캐치): 프리플랍 레이저가 플랍 첫 행동에서 엔진 c벳 빈도로 실제 벳했을 때의 대사.
//     극장 코어는 스트리트 예고를 그 스트리트의 첫 액션과 함께 보여 준다(TheaterAI.foreshadow는 액션을 모른다). 그래서
//     lines.flop/turn/river는 그 스트리트에서 계획이 낼 수 있는 어느 액션(예: 3배럴의 턴 벳 또는 멈춤, 블러프캐치의 체크
//     또는 콜)과도 어긋나지 않는 의도 문장으로 쓰고, keep의 어느 강도에서도 맞는 말만 쓴다(약한 페어에 '맞은 게 없다' 금지).
//     핸드 시작 예고도 프리플랍 등급과 상관없이 맞는 말만 쓴다(투기적 손에 '강한 손이다' 금지). trigger, fold, stop은
//     decide가 그 걸음에서 고르는 대사(line)다.
//   predictLabel: 예측 보기 칩 문구(계획 이름과 같다, theater-ui가 칩과 카드에 쓴다), hint: 칩 아래 짧은 풀이(선택).
// 문구 규칙: 가운뎃점과 긴줄표 대신 쉼표, 용어 표기는 data/glossary.js(팟컨트롤, 세미블러프, 블러프캐처, 플랍).
var THEATER_PLANS = [
  {
    key: 'barrel3', kor: '3배럴 블러프',
    needs: { strength: ['air', 'weak'], position: 'any', aggressor: true },
    keep: { flop: ['air', 'weak', 'draw'], turn: ['air', 'weak', 'draw'], river: ['air', 'weak', 'draw'] },
    steps: { flop: '벳', turn: '벳 또는 포기(배럴 빈도)', river: '벳 또는 포기(배럴 빈도)' },
    foreshadow: [
      '플랍부터 끝까지 밀어 볼 생각.',
      '세 번 연속 벳하면 누군가는 접는다.',
      '패는 상관없어, 끝까지 벳으로 간다.',
      '한 번 시작한 블러프는 리버까지 이어 간다.'
    ],
    lines: {
      flop: ['블러프는 플랍부터 시작이다.', '패보다 주도권으로 이긴다.', '먼저 압박해서 접게 만들자.'],
      turn: ['한 발 더 쏠지, 여기서 멈출지.', '두 번째 배럴을 쏠 차례인가.', '상대가 버티면 블러프는 멈춘다.'],
      river: ['마지막 한 발을 쏠지, 여기서 멈출지.', '리버에서 접게 만들면 팟은 내 것.', '세 번째 벳까지 갈 배짱이 있나.'],
      stop: ['여기서 멈춘다. 블러프는 이만.', '상대가 버틴다. 더 쏘지 않는다.', '배럴은 여기까지.']
    },
    predictLabel: '3배럴 블러프', hint: '끝까지 블러프'
  },
  {
    key: 'trap_cr', kor: '체크레이즈 함정',
    needs: { strength: ['strong', 'nut'], position: 'oop' },
    keep: { flop: ['strong', 'nut', 'medium'], turn: ['strong', 'nut', 'medium'], river: ['strong', 'nut', 'medium'] },
    steps: { flop: '체크 후 레이즈', turn: '체크 후 레이즈', river: '체크 후 레이즈, 아무도 안 치면 벳' },
    foreshadow: [
      '체크하면 저 사람은 벳할 거다. 그때 올린다.',
      '일부러 약한 척 체크, 벳이 나오면 덮친다.',
      '먼저 치지 않는다. 상대가 벳하길 기다린다.'
    ],
    lines: {
      flop: ['약한 척 체크, 벳이 나오면 덮친다.', '먼저 치지 않는다. 벳이 오면 올린다.', '미끼를 던지고 상대 벳을 기다린다.'],
      turn: ['아직 안 물었다면 한 번 더 기다린다.', '턴에도 함정은 그대로, 벳이 오면 올린다.', '참는다. 벳이 나오면 그때 올린다.'],
      river: ['함정이 안 통하면 이제 직접 친다.', '리버는 먼저 받아내거나, 벳이 오면 올린다.', '기다림은 끝, 이제 밸류를 받는다.'],
      trigger: ['걸렸다! 체크레이즈.', '기다리던 벳이다. 크게 올린다.', '함정 발동, 레이즈.']
    },
    predictLabel: '체크레이즈 함정', hint: '체크 후 레이즈'
  },
  {
    key: 'slowplay', kor: '슬로플레이',
    needs: { strength: ['nut'], position: 'any' },
    keep: { flop: ['nut', 'strong'], turn: ['nut', 'strong'], river: ['nut', 'strong'] },
    steps: { flop: '체크 또는 콜', turn: '체크 또는 콜', river: '벳 또는 레이즈' },
    foreshadow: [
      '아직은 조용히.',
      '강한 걸 숨기고 일단 콜로 따라간다.',
      '서두를 필요 없다. 마지막에 터뜨린다.'
    ],
    lines: {
      flop: ['체크나 콜, 약해 보이게.', '아직 드러내지 않는다.', '조용히 따라가며 지켜본다.'],
      turn: ['조금만 더 참는다.', '상대가 계속 치게 둔다.', '턴도 조용히.'],
      river: ['이제 공개할 시간. 크게 간다.', '리버에서 터뜨린다.', '참은 만큼 받아낸다.']
    },
    predictLabel: '슬로플레이', hint: '조용히 따라가기'
  },
  {
    key: 'bet_fold', kor: '벳폴드',
    needs: { strength: ['medium'], position: 'any', aggressor: true },
    keep: { flop: ['medium'], turn: ['medium'], river: ['medium'] },
    steps: { flop: '벳, 레이즈를 맞으면 폴드', turn: '체크, 작은 벳엔 콜', river: '체크, 작은 벳엔 콜' },
    foreshadow: [
      '한 번은 치고, 반격이 오면 접는다.',
      '먼저 벳, 하지만 레이즈가 오면 미련 없이 접는다.',
      '작게 밸류를 받고, 크게 맞으면 내려놓는다.'
    ],
    lines: {
      flop: ['괜찮은 손, 한 번은 친다.', '레이즈만 아니면 된다.', '작게라도 밸류를 받자.'],
      turn: ['더 키울 손은 아니다.', '여기선 조심, 작은 벳만 받는다.', '크게 키우지 않고 지켜본다.'],
      river: ['작은 벳이면 콜, 크면 접는다.', '쇼다운까지 싸게 가자.', '조용히 마무리.'],
      fold: ['레이즈가 왔다. 계획대로 접는다.', '반격이다. 미련 없이 폴드.', '여기까지. 접는다.']
    },
    predictLabel: '벳폴드', hint: '한 번 치고 반격엔 폴드'
  },
  {
    key: 'bluffcatch', kor: '블러프캐치',
    needs: { strength: ['medium', 'weak'], position: 'any', aggressor: false },
    keep: { flop: ['medium', 'weak'], turn: ['medium', 'weak'], river: ['medium', 'weak'] },
    steps: { flop: '체크 후 콜', turn: '체크 후 콜', river: '콜, 벳이 너무 크면 폴드' },
    foreshadow: [
      '저 사람 블러프가 많다, 끝까지 본다.',
      '내 손으로는 블러프만 이기면 된다. 콜로 따라간다.',
      '먼저 치지 않고, 상대 벳을 받아 준다.'
    ],
    lines: {
      flop: ['먼저 치지 않고, 벳이 오면 받는다.', '먼저 칠 이유는 없다.', '받아 줄 준비.'],
      turn: ['아직 믿을 수 없다. 벳이 오면 받는다.', '턴도 먼저 치지 않는다.', '블러프일 수 있다. 계속 본다.'],
      river: ['벳이 오면 받아 줄까, 말까.', '여기까지 왔으니 확인하고 싶다.', '블러프라면 이 팟은 내 것.'],
      cbet: ['한 번은 먼저 쳐 본다. 그다음엔 받는 쪽으로.', '먼저 한 번 치고, 그 뒤로는 상대 벳을 받는다.', '첫 벳은 내가, 그다음은 받아 준다.']
    },
    predictLabel: '블러프캐치', hint: '끝까지 콜'
  },
  {
    key: 'value_max', kor: '밸류 극대화',
    needs: { strength: ['strong', 'nut'], position: 'any' },
    keep: { flop: ['strong', 'nut', 'medium'], turn: ['strong', 'nut', 'medium'], river: ['strong', 'nut', 'medium'] },
    steps: { flop: '크게 벳, 벳을 맞으면 레이즈', turn: '벳', river: '벳' },
    foreshadow: [
      '최대한 받아낸다.',
      '강한 손이 되면 스트리트마다 크게 친다.',
      '팟을 최대한 키울 생각.'
    ],
    lines: {
      flop: ['어떻게 해야 더 받아낼지 생각한다.', '강할 때는 팟을 키운다.', '받아낼 수 있을 만큼 받아낸다.'],
      turn: ['계속 받아낸다.', '상대가 따라오면 더 좋다.', '아직 더 받아낼 수 있다.'],
      river: ['리버, 얼마나 더 받아낼 수 있을까.', '마지막 승부, 받을 만큼 받는다.', '여기서 최대한.']
    },
    predictLabel: '밸류 극대화', hint: '크게 밸류'
  },
  {
    key: 'semi_push', kor: '세미블러프 압박',
    needs: { strength: ['draw'], position: 'any' },
    keep: {
      flop: ['draw', 'strong', 'nut'],
      turn: ['draw', 'strong', 'nut', 'medium', 'weak', 'air'],
      river: ['draw', 'strong', 'nut', 'medium', 'weak', 'air']
    },
    steps: { flop: '벳 또는 레이즈', turn: '벳 또는 레이즈, 완성되면 밸류', river: '완성되면 밸류, 못 맞추면 블러프 또는 포기(배럴 빈도)' },
    foreshadow: [
      '드로우로 밀어 본다.',
      '맞으면 이기고, 안 맞아도 상대가 접을 수 있다.',
      '완성 전이라도 벳으로 압박한다.'
    ],
    lines: {
      flop: ['접게 만들거나, 맞추거나.', '드로우라면 먼저 압박한다.', '맞으면 밸류, 아니면 압박.'],
      turn: ['한 장 남았다. 밀지 말지 정한다.', '맞으면 밸류, 아니면 블러프.', '아직 끝나지 않았다. 압박할지 고른다.'],
      river: ['리버, 결정의 순간.', '맞았으면 밸류, 아니면 블러프냐 포기냐.', '마지막 카드가 답을 정한다.']
    },
    predictLabel: '세미블러프 압박', hint: '드로우로 압박'
  },
  {
    key: 'pot_control', kor: '팟컨트롤',
    needs: { strength: ['medium'], position: 'any' },
    keep: { flop: ['medium', 'weak'], turn: ['medium', 'weak'], river: ['medium', 'weak'] },
    steps: { flop: '체크, 작은 벳엔 콜', turn: '체크, 작은 벳엔 콜', river: '체크, 작은 벳엔 콜' },
    foreshadow: [
      '작게 가져가자.',
      '팟을 키우지 않고 쇼다운까지 간다.',
      '중간 손이면 크게 싸울 이유는 없다.'
    ],
    lines: {
      flop: ['팟을 작게 가져간다.', '무리하지 않는다.', '작은 벳이면 받는다.'],
      turn: ['계속 작게.', '팟 크기를 조절한다.', '큰 벳이면 생각해 본다.'],
      river: ['싸게 쇼다운.', '작게 마무리.', '크게 싸우지 않고 확인한다.']
    },
    predictLabel: '팟컨트롤', hint: '작게 가져가기'
  },
  {
    key: 'give_up', kor: '포기',
    needs: { strength: ['air', 'weak'], position: 'any' },
    keep: { flop: ['air', 'weak'], turn: ['air', 'weak'], river: ['air', 'weak'] },
    steps: { flop: '체크, 벳엔 폴드', turn: '체크, 벳엔 폴드', river: '체크, 벳엔 폴드' },
    foreshadow: [
      '여긴 아니다.',
      '이번 판은 쉬어 간다.',
      '맞지 않으면 조용히 접는다.'
    ],
    lines: {
      flop: ['이번 판은 크게 싸우지 않는다.', '반격이 오면 바로 놓는다.', '무리하지 않는다.'],
      turn: ['여전히 아니다.', '공짜면 보고, 아니면 접는다.', '무리하지 않는다.'],
      river: ['이번 판은 여기까지.', '더 넣지 않는다.', '다음 판을 기다린다.'],
      cbet: ['한 번만 먼저 쳐 본다. 반격이 오면 바로 놓는다.', '레이즈한 사람답게 한 번은 친다. 안 되면 접는다.', '한 번 쳐 보고, 받아치면 미련 없이 내려놓는다.']
    },
    predictLabel: '포기', hint: '여긴 아니다'
  }
];
if (typeof module !== 'undefined') module.exports = { THEATER_PLANS: THEATER_PLANS };
