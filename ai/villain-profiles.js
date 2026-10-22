// ai/villain-profiles.js
// 로드맵 결정 26(엔진 빌런 레인지 확장): Nit, TAG, LAG, Fish, Station의 프리플랍 표(rfi, threebet_range, call_vs_raise, call_vs_3bet,
//   limp_unless)를 실제 6-max 숫자에 가깝게 넓혔다. 포스트플랍 값(cbet, fold_to_cbet, bluff_freq, bet_sizing)과 Mixed는 그대로다.
//   은닉 6인 테이블 시뮬레이션(tests/p8-reads-flow.test.js와 같은 방식) 누적 VPIP/PFR:
//     히어로가 늘 콜하면 Nit 11/9, TAG 22/18, LAG 34/29, Fish 41/6, Station 48/4,
//     히어로가 이 앱 차트대로 치면(폴드하면 그 핸드가 끝나 뒤 좌석이 덜 보인다) Nit 10/9, TAG 21/17, LAG 33/28, Fish 40/7, Station 47/4.
//   (예전 값: Nit 6/5, TAG 15/14, LAG 21~22/18~20, Fish 35~36/3, Station 31~32/3.) vpip/pfr 필드는 이 실측을 반올림한 표시용 기대치다
//   (Station은 설계서 3.3절 수치 45/5 그대로). HUD 4분류 임계는 ai/villain-tracker.js RULE0.
var VillainProfiles = {
  TAG: {
    name_default: 'Mike', vpip: 0.22, pfr: 0.18, // vpip/pfr: 표시용 기대치(로직 미사용)
    rfi: {
      UTG: '44+,A7s+,KTs+,QTs+,JTs,T9s,98s,ATo+,KJo+',
      HJ:  '22+,A3s+,K8s+,Q9s+,J9s+,T9s,98s,87s,76s,A9o+,KTo+,QTo+',
      CO:  '22+,A2s+,K6s+,Q8s+,J8s+,T8s+,97s+,86s+,76s,65s,54s,A7o+,KTo+,QTo+,JTo',
      BTN: '22+,A2s+,K4s+,Q6s+,J7s+,T7s+,96s+,86s+,75s+,64s+,54s,A2o+,K9o+,Q9o+,J9o+,T9o',
      SB:  '22+,A2s+,K6s+,Q8s+,J8s+,T8s+,97s+,87s,76s,65s,A5o+,K9o+,Q9o+,J9o+,T9o'
    },
    threebet_range: 'TT+,AQs+,AKo,A5s,A4s,KQs',
    call_vs_raise: {
      UTG: '99-55,AJs,ATs,A9s,KJs,KTs,QJs,QTs,JTs,T9s,98s,87s,AJo,KQo,AQo',
      HJ:  '99-44,AJs-A8s,KJs,KTs,QJs,QTs,JTs,T9s,98s,87s,AJo,KQo,AQo',
      CO:  '99-33,AJs-A7s,KJs,KTs,K9s,QJs,QTs,JTs,J9s,T9s,98s,87s,76s,AJo,ATo,KQo,KJo,AQo',
      BTN: '99-22,AJs-A2s,KJs-K8s,QJs,QTs,Q9s,JTs,J9s,T9s,T8s,98s,87s,76s,65s,54s,AJo,ATo,KQo,KJo,QJo,AQo',
      SB:  'JJ-55,AQs,AJs,ATs,KQs,KJs,QJs,JTs,T9s,98s,87s',
      BB:  '22-99,AJs-A2s,K5s+,Q7s+,J7s+,T7s+,96s+,86s+,75s+,65s,54s,ATo+,K9o+,QTo+,JTo,T9o'
    },
    fourbet: 'QQ+,AKs,AKo,A5s',
    jam: 'KK+,AKs',
    call_vs_3bet: '99,TT,JJ,AQs,AJs,ATs,KQs,KJs,QJs,JTs,AQo',
    cbet: { dry: 0.70, wet: 0.50 },
    fold_to_cbet: 0.35, bluff_freq: 0.20,
    bet_sizing: { value: 0.67, bluff: 0.50 },
    phrases: {
      raise: ['레이즈.', '올린다.', '레이즈.'], call: ['콜.', '받지.', '콜.'],
      fold: ['폴드.', '접는다.', '폴드.'], check: ['체크.', '봐봐.', '체크.'],
      allin: ['올인.', '끝내자.'], '3bet': ['올려.', '레이즈.']
    }
  },
  LAG: {
    name_default: 'Carlos', vpip: 0.33, pfr: 0.28, // vpip/pfr: 표시용 기대치(로직 미사용)
    rfi: {
      UTG: '22+,A2s+,K6s+,Q8s+,J8s+,T8s+,97s+,86s+,75s+,65s,54s,A8o+,KTo+,QTo+,JTo',
      HJ:  '22+,A2s+,K4s+,Q6s+,J7s+,T7s+,96s+,85s+,75s+,64s+,54s,A5o+,K9o+,QTo+,JTo',
      CO:  '22+,A2s+,K2s+,Q5s+,J7s+,T7s+,96s+,85s+,74s+,64s+,53s+,A3o+,K8o+,Q9o+,J9o+,T9o,98o',
      BTN: '22+,A2s+,K2s+,Q3s+,J5s+,T6s+,95s+,85s+,74s+,64s+,53s+,43s,A2o+,K6o+,Q8o+,J8o+,T8o+,97o+,87o',
      SB:  '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,54s,A2o+,K7o+,Q8o+,J8o+,T8o+,98o'
    },
    threebet_range: 'TT+,AJs+,KQs,KJs,QJs,AQo+,A5s-A2s,JTs,T9s,98s,87s,76s,65s',
    call_vs_raise: {
      UTG: '99-22,ATs-A2s,KTs,K9s,QTs,Q9s,J9s,J8s,T9s,T8s,97s,86s,76s,65s,54s,AJo,ATo,A9o,KQo,KJo,KTo,QJo',
      HJ:  '99-22,ATs-A2s,KTs,K9s,QTs,Q9s,J9s,J8s,T9s,T8s,97s,86s,76s,65s,54s,AJo,ATo,A9o,KQo,KJo,KTo,QJo',
      CO:  '99-22,ATs-A2s,KTs-K6s,QTs-Q8s,J9s,J8s,T8s,97s,86s,75s,64s,54s,AJo,ATo,A9o,KQo,KJo,KTo,QJo,QTo,JTo',
      BTN: '99-22,ATs-A2s,KTs-K2s,QTs-Q6s,J9s-J7s,T8s,T7s,97s,96s,86s,85s,75s,74s,64s,54s,53s,43s,AJo,ATo-A7o,KQo,KJo,KTo,K9o,QJo,QTo,Q9o,JTo,J9o,T9o',
      SB:  '99-44,AQo,AJs,ATs,A9s,KQs,KJs,QJs,JTs,T9s,98s,87s,76s',
      BB:  '22-99,A9s-A2s,K2s+,Q3s+,J6s+,T6s+,95s+,85s+,74s+,63s+,53s+,43s,A2o+,K6o+,Q8o+,J8o+,T8o+,97o+,87o'
    },
    fourbet: 'JJ+,AKs,AKo,A5s,A4s',
    jam: 'QQ+,AKs,AKo',
    call_vs_3bet: '88,99,TT,JJ,AQs,AJs,ATs,KQs,KJs,KTs,QJs,JTs,T9s,98s,AQo,AJo',
    cbet: { dry: 0.80, wet: 0.65 },
    fold_to_cbet: 0.20, bluff_freq: 0.40,
    bet_sizing: { value: 0.75, bluff: 0.67 },
    phrases: {
      raise: ['올려봐.', '좀 올리지?', '레이즈!'], call: ['어, 콜.', '받아줄게.', '콜.'],
      fold: ['이번엔 접지.', '그래, 폴드.'], check: ['체크.', '한번 봐봐.'],
      allin: ['올인이야. 어떻게 할래?', '다 간다!'], '3bet': ['더 올린다!', '레이즈!']
    }
  },
  Fish: {
    name_default: 'Jimmy', vpip: 0.40, pfr: 0.07, // vpip/pfr: 표시용 기대치(로직 미사용)
    rfi: {
      UTG: '22+,A2s+,K4s+,Q7s+,J7s+,T7s+,97s+,87s,A5o+,K9o+,QTo+,JTo',
      HJ:  '22+,A2s+,K2s+,Q6s+,J7s+,T7s+,96s+,86s+,76s,A4o+,K8o+,Q9o+,J9o+,T9o',
      CO:  '22+,A2s+,K2s+,Q4s+,J5s+,T6s+,95s+,85s+,74s+,64s+,54s,A2o+,K6o+,Q8o+,J8o+,T8o+,98o',
      BTN: '22+,A2s+,K2s+,Q2s+,J3s+,T4s+,94s+,84s+,73s+,63s+,53s+,43s,A2o+,K4o+,Q6o+,J7o+,T7o+,97o+,87o,76o',
      SB:  '22+,A2s+,K2s+,Q2s+,J4s+,T5s+,95s+,84s+,74s+,63s+,53s+,A2o+,K3o+,Q6o+,J7o+,T7o+,97o+,87o'
    },
    threebet_range: 'JJ+,AQs+,AKo',
    call_vs_raise: {
      UTG: '22+,A2s+,K6s+,Q8s+,J8s+,T8s+,98s,A4o+,K9o+,QTo+,JTo',
      HJ:  '22+,A2s+,K5s+,Q7s+,J7s+,T7s+,97s+,87s,A3o+,K8o+,Q9o+,JTo,T9o',
      CO:  '22+,A2s+,K3s+,Q6s+,J7s+,T7s+,96s+,86s+,75s+,65s,A2o+,K7o+,Q8o+,J8o+,T8o+,98o',
      BTN: '22+,A2s+,K2s+,Q5s+,J6s+,T6s+,95s+,85s+,74s+,64s+,54s,A2o+,K5o+,Q7o+,J8o+,T8o+,98o,87o,76o',
      SB:  '22+,A2s+,K5s+,Q8s+,J8s+,T8s+,97s+,87s,A4o+,K8o+,QTo+,JTo,T9o',
      BB:  '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,95s+,85s+,74s+,64s+,A2o+,K6o+,Q8o+,J8o+,T8o+,98o,87o'
    },
    fourbet: 'AA,KK',
    jam: 'AA,KK',
    call_vs_3bet: '22+,A9s+,KTs+,QTs+,JTs,ATo+,KQo',
    cbet: { dry: 0.20, wet: 0.12 },
    fold_to_cbet: 0.30, bluff_freq: 0.05,
    limp_unless: '88+,ATs+,KJs+,AJo+,KQo', // 이 레인지 밖 오픈 핸드는 레이즈 대신 림프(콜)
    bet_sizing: { value: 0.50, bluff: 0.33 },
    phrases: {
      raise: ['오 올려볼게요!', '한번 해볼까요?', '레이즈!'], call: ['어... 콜 할게요', '그냥 콜!'],
      fold: ['아 폴드요.', '이번엔 패스!'], check: ['체크요!', '음, 체크'],
      allin: ['올인! 다 넣어요!', '다 걸어요!'], '3bet': ['더 올릴게요!', '레이즈요!']
    }
  },
  Nit: {
    name_default: 'David', vpip: 0.11, pfr: 0.09, // vpip/pfr: 표시용 기대치(로직 미사용)
    rfi: {
      UTG: '77+,ATs+,KTs+,QJs,AJo+,KQo',
      HJ:  '66+,A9s+,KTs+,QJs,AJo+,KQo',
      CO:  '55+,A8s+,K9s+,QTs+,JTs,ATo+,KJo+',
      BTN: '33+,A5s+,K9s+,Q9s+,J9s+,T9s,ATo+,KTo+,QJo',
      SB:  '44+,A8s+,KTs+,QTs+,JTs,ATo+,KJo+'
    },
    threebet_range: 'QQ+,AKs,AKo',
    call_vs_raise: {
      UTG: 'JJ-77,AQs,AJs,KQs',
      HJ:  'JJ-66,AQs,AJs,ATs,KQs',
      CO:  'JJ-55,AQs,AJs,ATs,KQs,KJs,AQo',
      BTN: 'JJ-44,AQs,AJs,ATs,KQs,KJs,QJs,JTs,AQo,AJo',
      SB:  'JJ,TT,99,88,AKs,AQs,AJs,KQs',
      BB:  '22-JJ,AQs-A8s,K9s+,QTs+,JTs,T9s,ATo+,KJo+'
    },
    fourbet: 'KK+',
    jam: 'KK+',
    call_vs_3bet: 'QQ,JJ,AKs,AKo',
    cbet: { dry: 0.35, wet: 0.20 },
    fold_to_cbet: 0.60, bluff_freq: 0.05,
    bet_sizing: { value: 0.75, bluff: 0.50 },
    phrases: {
      raise: ['레이즈하겠습니다.', '올리겠습니다.'], call: ['콜합니다.', '콜.'],
      fold: ['폴드합니다.', '접겠습니다.'], check: ['체크합니다.', '체크.'],
      allin: ['올인합니다.', '전부 넣겠습니다.'], '3bet': ['리레이즈합니다.', '올리겠습니다.']
    }
  },
  Mixed: {
    name_default: 'Alex', vpip: 0.30, pfr: 0.22, // vpip/pfr: 표시용 기대치(로직 미사용)
    behavior_by_street: { preflop: 'TAG', flop: 'LAG', turn: 'TAG', river: 'Fish' },
    noise: 0.15,
    rfi: {
      UTG: '77+,ATs+,KTs+,QTs+,JTs,AJo+,KQo',
      HJ:  '66+,A9s+,KTs+,QTs+,JTs,T9s,ATo+,KJo+,KQo',
      CO:  '44+,A7s+,K9s+,Q9s+,J9s+,T9s,98s,ATo+,KTo+,QJo',
      BTN: '22+,A2s+,K7s+,Q8s+,J8s+,T8s+,97s+,87s,76s,A8o+,K9o+,Q9o+,J9o+,T9o',
      SB:  '22+,A2s+,K5s+,Q7s+,J8s+,T8s+,97s+,87s,76s,A5o+,K9o+,Q9o+'
    },
    threebet_range: 'QQ+,AKs,AKo,A5s',
    call_vs_raise: {
      UTG: 'JJ-77,AQs,AJs,KQs,JTs,T9s',
      HJ:  'JJ-77,AQs,AJs,KQs,JTs,T9s',
      CO:  'JJ-55,AQs,AJs,ATs,KQs,JTs,T9s,87s',
      BTN: 'JJ-44,AQs,AJs,ATs,KQs,KJs,JTs,T9s,98s,AQo,AJo',
      SB:  'JJ-55,AQs,AJs,KQs,JTs,T9s',
      BB:  '22-JJ,A2s-AQs,K9s+,Q9s+,J9s+,T8s+,97s+,87s,76s,65s,ATo+,KTo+,QJo'
    },
    fourbet: 'QQ+,AKs,AKo,A5s',
    jam: 'KK+,AKs',
    call_vs_3bet: 'TT,JJ,AQs,AJs,KQs,AQo',
    cbet: { dry: 0.55, wet: 0.58 },
    fold_to_cbet: 0.38, bluff_freq: 0.22,
    bet_sizing: { value: 0.67, bluff: 0.50 },
    phrases: {
      raise: ['레이즈.', '올립니다.', '올려요.'], call: ['콜.', '받죠.', '콜할게요.'],
      fold: ['폴드.', '접겠습니다.', '이번엔 패스.'], check: ['체크.', '볼게요.'],
      allin: ['올인.', '다 가죠.', '올인합니다.'], '3bet': ['리레이즈.', '올립니다.']
    }
  },
  // Station(콜링 스테이션, M4-P2): 웬만하면 콜, 레이즈는 거의 없음. 설계서 3.3절 캐스트 6인(콜마스터)의 수치.
  // 오픈은 대부분 림프(limp_unless 밖), 레이즈 직면엔 넓게 콜, 3벳은 QQ+와 AKs만. 포스트플랍은 fold_to_cbet 0.15라 잘 안 접는다.
  // villain.js가 읽는 필수 키(rfi, threebet_range, call_vs_raise, fourbet, jam, call_vs_3bet, cbet, fold_to_cbet,
  // bluff_freq, bet_sizing, phrases)를 전부 가진다(tests/j-cast-ai.test.js가 고정).
  Station: {
    name_default: 'Ben', vpip: 0.45, pfr: 0.05, // vpip/pfr: 표시용 기대치(로직 미사용)
    rfi: {
      UTG: '22+,A2s+,K2s+,Q6s+,J7s+,T7s+,96s+,86s+,75s+,65s,A2o+,K8o+,Q9o+,J9o+,T9o',
      HJ:  '22+,A2s+,K2s+,Q5s+,J6s+,T6s+,96s+,85s+,75s+,64s+,54s,A2o+,K7o+,Q8o+,J8o+,T8o+,98o',
      CO:  '22+,A2s+,K2s+,Q3s+,J5s+,T5s+,95s+,84s+,74s+,63s+,53s+,43s,A2o+,K5o+,Q7o+,J7o+,T7o+,97o+,87o',
      BTN: '22+,A2s+,K2s+,Q2s+,J2s+,T3s+,93s+,84s+,73s+,62s+,52s+,42s+,32s,A2o+,K2o+,Q5o+,J6o+,T6o+,96o+,86o+,75o+,65o',
      SB:  '22+,A2s+,K2s+,Q2s+,J4s+,T5s+,95s+,84s+,74s+,63s+,53s+,43s,A2o+,K4o+,Q6o+,J7o+,T7o+,97o+,87o'
    },
    threebet_range: 'QQ+,AKs',
    call_vs_raise: {
      UTG: '22+,A2s+,K5s+,Q7s+,J7s+,T7s+,97s+,87s,76s,A2o+,K9o+,Q9o+,J9o+,T9o',
      HJ:  '22+,A2s+,K4s+,Q6s+,J7s+,T7s+,96s+,86s+,76s,65s,A2o+,K8o+,Q9o+,J9o+,T9o',
      CO:  '22+,A2s+,K2s+,Q5s+,J6s+,T6s+,95s+,85s+,75s+,64s+,54s,A2o+,K7o+,Q8o+,J8o+,T8o+,98o',
      BTN: '22+,A2s+,K2s+,Q3s+,J5s+,T5s+,95s+,84s+,74s+,63s+,53s+,43s,A2o+,K5o+,Q7o+,J7o+,T7o+,97o+,87o,76o',
      SB:  '22+,A2s+,K3s+,Q6s+,J7s+,T7s+,96s+,86s+,75s+,65s,A2o+,K8o+,Q9o+,J9o+,T9o',
      BB:  '22+,A2s+,K2s+,Q2s+,J4s+,T5s+,95s+,84s+,74s+,63s+,53s+,43s,A2o+,K4o+,Q6o+,J7o+,T7o+,97o+,87o,76o'
    },
    fourbet: 'KK+',
    jam: 'KK+',
    call_vs_3bet: '22+,A8s+,KTs+,QTs+,JTs,T9s,ATo+,KJo+,QJo',
    cbet: { dry: 0.25, wet: 0.15 },
    fold_to_cbet: 0.15, bluff_freq: 0.02,
    limp_unless: '99+,AJs+,KQs,AQo+', // 이 레인지 밖 오픈 핸드는 레이즈 대신 림프(콜)
    bet_sizing: { value: 0.50, bluff: 0.33 },
    phrases: {
      raise: ['이번엔 올려 볼게.', '레이즈.'], call: ['콜. 일단 봐야지.', '받을게.', '콜.'],
      fold: ['이건 못 따라가.', '폴드.'], check: ['체크.', '일단 체크.'],
      allin: ['다 걸어 볼게.', '올인.'], '3bet': ['이번엔 올린다.', '리레이즈.'],
      bet: ['조금만 걸게.', '벳.']
    }
  }
};

if (typeof module !== 'undefined') module.exports = VillainProfiles;
