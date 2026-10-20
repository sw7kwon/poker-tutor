// ai/villain-profiles.js
var VillainProfiles = {
  TAG: {
    name_default: 'Mike', vpip: 0.27, pfr: 0.22, // vpip/pfr: 표시용 기대치(로직 미사용)
    rfi: {
      UTG: 'QQ+,ATs+,KTs+,QTs+,JTs,AJo+,KQo',
      HJ:  '77+,A9s+,KTs+,QTs+,JTs,T9s,ATo+,KJo+,KQo',
      CO:  '44+,A7s+,K9s+,Q9s+,J9s+,T9s,98s,ATo+,KTo+,QJo',
      BTN: '22+,A2s+,K7s+,Q8s+,J8s+,T8s+,97s+,87s,76s,A8o+,K9o+,Q9o+,J9o+,T9o',
      SB:  '22+,A2s+,K5s+,Q7s+,J8s+,T8s+,97s+,87s,76s,A5o+,K9o+,Q9o+'
    },
    threebet_range: 'QQ+,AKs,AKo,A5s,A4s',
    call_vs_raise: {
      UTG: 'JJ-77,AQs,AJs,ATs,KQs,KJs,QJs,JTs,T9s,98s',
      HJ:  'JJ-77,AQs,AJs,ATs,KQs,KJs,QJs,JTs,T9s,98s',
      CO:  'JJ-55,AQs,AJs,ATs,KQs,KJs,QJs,JTs,T9s,98s,87s',
      BTN: 'JJ-44,AQs,AJs,ATs,A9s,KQs,KJs,QJs,JTs,T9s,98s,87s,76s,AQo,AJo',
      SB:  'JJ-55,AQs,AJs,ATs,KQs,KJs,QJs,JTs,T9s,98s,87s',
      BB:  '22-JJ,A2s-AQs,K9s+,Q9s+,J9s+,T8s+,97s+,87s,76s,65s,ATo+,KTo+,QJo'
    },
    fourbet: 'QQ+,AKs,AKo,A5s',
    jam: 'KK+,AKs',
    call_vs_3bet: 'TT,JJ,AQs,AJs,KQs,AQo',
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
    name_default: 'Carlos', vpip: 0.35, pfr: 0.28, // vpip/pfr: 표시용 기대치(로직 미사용)
    rfi: {
      UTG: '55+,A9s+,KTs+,QTs+,JTs,T9s,98s,AJo+,KQo',
      HJ:  '44+,A7s+,K9s+,Q9s+,J9s+,T9s,98s,87s,A9o+,KTo+,QJo',
      CO:  '33+,A5s+,K7s+,Q8s+,J8s+,T8s+,97s+,87s,76s,65s,A8o+,K9o+,Q9o+,J9o+',
      BTN: '22+,A2s+,K4s+,Q6s+,J7s+,T7s+,96s+,86s+,76s,65s,54s,A4o+,K8o+,Q9o+,J9o+,T9o,98o',
      SB:  '22+,A2s+,K2s+,Q5s+,J6s+,T7s+,96s+,86s+,75s+,64s+,54s,A3o+,K7o+,Q8o+'
    },
    threebet_range: 'QQ+,AKs,AKo,JJ,TT,A5s,A4s,A3s,A2s,KQs',
    call_vs_raise: {
      UTG: '99-55,AQo,AJs,ATs,KQs,KJs,QJs,JTs,T9s,98s,87s',
      HJ:  '99-55,AQo,AJs,ATs,KQs,KJs,QJs,JTs,T9s,98s,87s',
      CO:  '99-44,AQo,AJo,ATs,A9s,KQo,KQs,KJs,QJs,JTs,T9s,98s,87s,76s',
      BTN: '99-33,AQo,AJo,ATo,A9s,A8s,KQo,KJo,KTs,QJs,QTs,JTs,T9s,98s,87s,76s,65s',
      SB:  '99-44,AQo,AJs,ATs,A9s,KQs,KJs,QJs,JTs,T9s,98s,87s,76s',
      BB:  '22-JJ,A2s-AQs,K9s+,Q9s+,J9s+,T8s+,97s+,87s,76s,65s,ATo+,KTo+,QJo,K5s+,Q8s+,J8s+,T7s+,86s+,75s+,64s+,A8o+,K9o+,Q9o+,J9o+,T9o'
    },
    fourbet: 'JJ+,AKs,AKo,A5s,A4s',
    jam: 'QQ+,AKs,AKo',
    call_vs_3bet: '99,TT,JJ,AQs,AJs,ATs,KQs,KJs,QJs,JTs,AQo',
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
    name_default: 'Jimmy', vpip: 0.55, pfr: 0.08, // vpip/pfr: 표시용 기대치(로직 미사용)
    rfi: {
      UTG: '22+,A2s+,K5s+,Q8s+,J8s+,T8s+,97s+,A7o+,KTo+,QJo',
      HJ:  '22+,A2s+,K4s+,Q7s+,J7s+,T7s+,96s+,86s+,A6o+,K9o+,QTo+,JTo',
      CO:  '22+,A2s+,K2s+,Q5s+,J6s+,T6s+,95s+,85s+,74s+,64s+,A4o+,K7o+,Q8o+,J9o+,T9o',
      BTN: '22+,A2s+,K2s+,Q2s+,J4s+,T5s+,94s+,84s+,73s+,63s+,53s+,43s,A2o+,K5o+,Q7o+,J8o+,T8o+,97o+,87o',
      SB:  '22+,A2s+,K2s+,Q3s+,J5s+,T6s+,95s+,85s+,74s+,63s+,53s,A2o+,K4o+,Q7o+,J8o+,T8o+'
    },
    threebet_range: 'AA,KK',
    call_vs_raise: {
      UTG: '22+,A2s+,K7s+,Q9s+,J9s+,T9s,A5o+,K9o+,QTo+,JTo',
      HJ:  '22+,A2s+,K6s+,Q8s+,J8s+,T8s+,97s+,A4o+,K8o+,QTo+,JTo,T9o',
      CO:  '22+,A2s+,K5s+,Q7s+,J7s+,T7s+,96s+,86s+,75s+,A3o+,K7o+,Q9o+,J9o+,T9o,98o',
      BTN: '22+,A2s+,K3s+,Q6s+,J7s+,T7s+,96s+,85s+,75s+,64s+,54s,A2o+,K6o+,Q8o+,J8o+,T8o+,98o,87o,76o',
      SB:  '22+,A2s+,K5s+,Q8s+,J8s+,T8s+,97s+,87s,A4o+,K8o+,QTo+,JTo,T9o',
      BB:  '22+,A2s+,K2s+,Q5s+,J7s+,T7s+,96s+,85s+,74s+,A2o+,K7o+,Q8o+,J8o+,T8o+,98o,87o'
    },
    fourbet: 'AA,KK',
    jam: 'AA,KK',
    call_vs_3bet: '22+,A9s+,KTs+,QTs+,JTs,ATo+,KQo',
    cbet: { dry: 0.20, wet: 0.12 },
    fold_to_cbet: 0.30, bluff_freq: 0.05,
    limp_unless: 'TT+,AQs+,AKo', // 이 레인지 밖 오픈 핸드는 레이즈 대신 림프(콜)
    bet_sizing: { value: 0.50, bluff: 0.33 },
    phrases: {
      raise: ['오 올려볼게요!', '한번 해볼까요?', '레이즈!'], call: ['어... 콜 할게요', '그냥 콜!'],
      fold: ['아 폴드요.', '이번엔 패스!'], check: ['체크요!', '음, 체크'],
      allin: ['올인! 다 넣어요!', '다 걸어요!'], '3bet': ['더 올릴게요!', '레이즈요!']
    }
  },
  Nit: {
    name_default: 'David', vpip: 0.14, pfr: 0.11, // vpip/pfr: 표시용 기대치(로직 미사용)
    rfi: {
      UTG: '99+,AKs,AQs',
      HJ:  '88+,AKs,AQs,AJs,AKo',
      CO:  '77+,ATs+,KQs,AJo+,KQo',
      BTN: '66+,A9s+,KTs+,QTs+,JTs,ATo+,KJo+,KQo',
      SB:  '55+,A8s+,KTs+,QTs+,ATo+,KQo'
    },
    threebet_range: 'AA,KK,QQ',
    call_vs_raise: {
      UTG: 'JJ,TT,AKs,AQs',
      HJ:  'JJ,TT,99,AKs,AQs,AJs',
      CO:  'JJ,TT,99,88,AKs,AQs,AJs,KQs',
      BTN: 'JJ,TT,99,88,77,AKs,AQs,AJs,ATs,KQs,KJs',
      SB:  'JJ,TT,99,88,AKs,AQs,AJs,KQs',
      BB:  '66-JJ,ATs-AQs,KQs,AQo'
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
      UTG: '22+,A2s+,K6s+,Q8s+,J8s+,T8s+,98s,A8o+,KTo+,QJo',
      HJ:  '22+,A2s+,K5s+,Q8s+,J8s+,T8s+,97s+,87s,A7o+,K9o+,QTo+,JTo',
      CO:  '22+,A2s+,K3s+,Q6s+,J7s+,T7s+,96s+,86s+,75s+,65s,A5o+,K8o+,Q9o+,J9o+,T9o',
      BTN: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,95s+,85s+,74s+,64s+,54s,A2o+,K6o+,Q8o+,J8o+,T8o+,98o',
      SB:  '22+,A2s+,K4s+,Q6s+,J7s+,T7s+,96s+,85s+,75s+,64s+,A3o+,K7o+,Q8o+,J8o+,T8o+'
    },
    threebet_range: 'QQ+,AKs',
    call_vs_raise: {
      UTG: '22+,A2s+,K8s+,Q9s+,J9s+,T9s,A7o+,KTo+,QTo+,JTo',
      HJ:  '22+,A2s+,K7s+,Q9s+,J8s+,T8s+,98s,A5o+,K9o+,QTo+,JTo',
      CO:  '22+,A2s+,K6s+,Q8s+,J8s+,T8s+,97s+,87s,A4o+,K8o+,Q9o+,J9o+,T9o',
      BTN: '22+,A2s+,K4s+,Q7s+,J7s+,T7s+,96s+,86s+,75s+,65s,A2o+,K7o+,Q8o+,J8o+,T8o+,98o',
      SB:  '22+,A2s+,K6s+,Q8s+,J8s+,T8s+,97s+,87s,A5o+,K9o+,QTo+,JTo',
      BB:  '22+,A2s+,K2s+,Q5s+,J7s+,T7s+,96s+,86s+,75s+,A2o+,K8o+,Q9o+,J9o+,T9o'
    },
    fourbet: 'KK+',
    jam: 'KK+',
    call_vs_3bet: '22+,A8s+,KTs+,QTs+,JTs,T9s,ATo+,KJo+,QJo',
    cbet: { dry: 0.25, wet: 0.15 },
    fold_to_cbet: 0.15, bluff_freq: 0.02,
    limp_unless: 'TT+,AQs+,AKo', // 이 레인지 밖 오픈 핸드는 레이즈 대신 림프(콜)
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
