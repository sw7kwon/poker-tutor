// engine/thinking.js, WP8: 띵킹 프로세스 모드 (속마음 중계). M4-P3 개편(계약 T5는 theater/theater-core.js 머리 주석)
// 순수 함수만 (DOM 없음, Math.random 없음). 강도/텍스처는 Villain._handStrength / _isBoardWet / PostflopGuide 재사용.
//   villainThought(state, name, action, amount, opts) → { name, street, text('💭 이름: ' 접두), intent, conf, body, tail,
//     calc{toCall, pot, need} }. conf는 'high'|'mid'|'low'(CONF_KOR).
//     opts.snapshot{potBefore, currentBetBefore, haveBefore}(또는 그 필드를 가진 액션 객체 자체)가 있으면
//     toCall = currentBetBefore - haveBefore, 팟 = potBefore로 계산한다.
//     대사 변형은 opts.rnd가 있으면 그것으로, 없으면 (이름, 스트리트, 보드, 액션, 홀카드, 핸드 번호) 해시로 고른다.
//     같은 입력이면 같은 문장이다. 리버에는 '드로우' 문구를 쓰지 않는다(스트리트 분기).
//   readOf(reader, target, state, opts{action, amount, label?, snapshot?}) → { grade, text, conf, examples } | null
//     grade는 'strong'|'medium'|'weak'|'air'(T5 4단계, 보드 3장 미만이면 null). 상대 유형 + 액션으로 추정한다.
//   truthGrade(hole, board): T5 대응(nut, strong → strong / medium → medium / weak-pair, draw → weak / air → air).
//   rangeExamples(arr, opts) → 대표 조합 문자열(말 이름 + 기호, 예 '에이스퀸 A♠Q♦'). 엔진 표(GTO_RANGES)를 Range로 펼치고
//     보드와 죽은 카드에 겹치는 조합은 뺀다. 보드가 있으면 진실 등급으로 거른다.
//   state.hideTypes면 말버릇은 중립이고 유형에 기대는 문구와 판단(proThought의 rtype 포함)을 쓰지 않는다.
//   좌석 이름이 캐스트(전역 CAST, typeof 가드)면 그 캐릭터의 tail(포기할 때는 tailGiveUp) 말버릇을 쓴다.
var Thinking = (function() {
  var RANKS = '23456789TJQKA';
  var INTENT_KOR = {
    value: '밸류', bluff: '블러프', semibluff: '세미블러프', 'pot-control': '팟컨트롤',
    'call-odds': '팟 오즈 콜', 'give-up': '포기', trap: '함정'
  };
  var GRADE_KOR = { premium: '프리미엄', good: '좋음', spec: '투기적', weak: '약함' };
  var STREET_KOR = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
  var GRADE_ADJ = { premium: '프리미엄', good: '좋은', spec: '투기적인', weak: '약한' };
  var READ_KOR = { strong: '강한 손', medium: '중간 손', weak: '약한 손', air: '아무것도 없는 손' };
  var CONF_KOR = { high: '확신', mid: '보통', low: '애매' };
  var TRUTH = { nut: 'strong', strong: 'strong', medium: 'medium', 'weak-pair': 'weak', draw: 'weak', air: 'air' };

  var RANK_NAME = { A: '에이스', K: '킹', Q: '퀸', J: '잭', T: '텐', '9': '나인', '8': '에잇', '7': '세븐',
    '6': '식스', '5': '파이브', '4': '포', '3': '쓰리', '2': '듀스' };
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var SUITS = ['s', 'h', 'd', 'c'];

  // ── 한국어 조사 ──
  // 끝 숫자는 읽는 소리로(영 일 이 삼 사 오 육 칠 팔 구): 좌석 이름 'V3' → '삼'(ㅁ 받침)
  var DIGIT_JONG = { '0': 21, '1': 8, '3': 16, '6': 1, '7': 8, '8': 8 };
  function _jong(word) {
    word = String(word || '');
    var last = word.charAt(word.length - 1);
    if (/[0-9]/.test(last)) return DIGIT_JONG[last] || 0;
    var c = word.charCodeAt(word.length - 1);
    if (!(c >= 0xAC00 && c <= 0xD7A3)) return 0;
    return (c - 0xAC00) % 28;
  }
  // 받침 유무로 조사 선택: _j('페어', '이라', '라') → '페어라'
  function _j(word, withB, noB) { return word + (_jong(word) > 0 ? withB : noB); }
  // (으)로: 받침이 없거나 ㄹ 받침이면 '로'
  function _ro(word) { var j = _jong(word); return word + (j > 0 && j !== 8 ? '으로' : '로'); }
  // 기존 모듈 사유 문구 정리: 긴줄표/가운뎃점 → 쉼표, 용어 사전 표기(팟 오즈, c벳)
  function _clean(t) {
    return String(t || '').replace(/\s*\u2014\s*/g, ', ').replace(/\s*\u00B7\s*/g, ', ')
      .replace(/팟\s*오즈/g, '팟 오즈').replace(/c-bet/gi, 'c벳');
  }

  function _ri(r) { return RANKS.indexOf(r); }
  function _isAggro(a) { return a === 'bet' || a === 'raise' || a === '3bet' || a === 'allin'; }
  function _cardKey(c) { return c ? String(c.rank) + String(c.suit) : ''; }
  function _cardsKey(cs) { return (cs || []).map(_cardKey).join(''); }
  // 보드 장수로 스트리트를 정한다(전달된 state.street가 늦어도 리버 분기를 놓치지 않게)
  function _boardStreet(board, street) {
    var n = (board || []).length;
    if (n >= 5) return 'river';
    if (n === 4) return 'turn';
    if (n === 3) return 'flop';
    return street || 'preflop';
  }

  // ── 결정론 선택(Math.random 금지) ──
  function _hash(str) {
    var h = 2166136261;
    str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    // 마무리 섞기(끝 글자만 다른 입력도 고르게 퍼지게)
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  // 선택기: rnd가 있으면 rnd(), 없으면 seed 문자열 해시(호출마다 다른 소금)
  function _picker(seed, rnd) {
    var n = 0;
    return function(len) {
      if (!(len > 1)) return 0;
      if (typeof rnd === 'function') {
        var v = Number(rnd());
        if (!(v >= 0)) v = 0;
        return Math.min(len - 1, Math.floor(v * len));
      }
      return _hash(seed + '#' + (n++)) % len;
    };
  }
  // 풀에서 문장 하나: 항목은 문자열 또는 c → 문자열|null(null이면 이번 맥락에서 못 씀)
  function _fromPool(pool, c, pick) {
    var outs = [];
    (pool || []).forEach(function(f) {
      var s = typeof f === 'function' ? f(c) : f;
      if (s) outs.push(s);
    });
    if (!outs.length) return '';
    return outs[pick(outs.length)];
  }

  // 프리플랍 핸드 등급: premium / good / spec / weak
  function preflopGrade(cards) {
    if (!cards || cards.length < 2) return 'weak';
    var a = _ri(cards[0].rank), b = _ri(cards[1].rank);
    var hi = Math.max(a, b), lo = Math.min(a, b);
    var suited = cards[0].suit === cards[1].suit;
    if (a === b) return hi >= _ri('J') ? 'premium' : hi >= _ri('7') ? 'good' : 'spec';
    if (hi === _ri('A') && lo === _ri('K')) return 'premium';
    if (hi === _ri('A') && lo === _ri('Q') && suited) return 'premium';
    if (lo >= _ri('T')) return 'good';                     // 브로드웨이 두 장
    if (hi === _ri('A') && (suited || lo >= _ri('9'))) return suited ? 'spec' : 'good';
    if (suited && hi - lo <= 2 && lo >= _ri('4')) return 'spec'; // 수딧 커넥터/원갭
    return 'weak';
  }

  // 포스트플랍 강도: nut/strong/medium/weak-pair/draw/air (에어+드로우 → draw, 리버엔 드로우 없음)
  function strength(hole, board) {
    if (!board || board.length < 3) return null;
    var s = (typeof Villain !== 'undefined') ? Villain._handStrength(hole, board) : 'air';
    var draw = (typeof PostflopGuide !== 'undefined') && PostflopGuide.hasDraw(hole, board);
    if (s === 'air' && draw) return 'draw';
    return s;
  }

  // 진실 등급(T5): 오독 판정의 기준
  function truthGrade(hole, board) {
    var s = strength(hole, board);
    return s ? (TRUTH[s] || 'air') : null;
  }

  function _isWet(board) {
    return (typeof Villain !== 'undefined') ? Villain._isBoardWet(board) : false;
  }

  // 원페어 세부: 탑페어 / 오버페어 / 약한 페어
  function _pairDesc(hole, board) {
    var top = Math.max.apply(null, board.map(function(c) { return _ri(c.rank); }));
    if (hole[0].rank === hole[1].rank && _ri(hole[0].rank) > top) return '오버페어';
    if (hole.some(function(c) { return _ri(c.rank) === top; })) return '탑페어';
    return '약한 페어';
  }

  function _drawName(hole, board) {
    var cnt = {};
    hole.concat(board).forEach(function(c) { cnt[c.suit] = (cnt[c.suit] || 0) + 1; });
    for (var s in cnt) {
      if (cnt[s] === 4 && hole.some(function(c) { return c.suit === s; })) return '플러시 드로우';
    }
    return '스트레이트 드로우';
  }

  // 손 이름(강도 + 족보): '풀하우스', '셋', '탑페어', '약한 페어', '플러시 드로우', '아무것도 없는 손' 등
  var MADE_NAME = { 1: '로열 플러시', 2: '스트레이트 플러시', 3: '포카드', 4: '풀하우스', 5: '플러시', 6: '스트레이트' };
  function _handTxt(hole, board, s) {
    if (s === 'air') return '아무것도 없는 손';
    if (s === 'weak-pair') return '약한 페어';
    if (s === 'draw') return _drawName(hole, board);
    var ev = (typeof HandEval !== 'undefined' && hole && hole.length >= 2) ? HandEval.evaluate(hole.concat(board)) : null;
    var t = ev ? ev.type : 0;
    if (s === 'medium') {
      if (t === 9) return _pairDesc(hole, board);
      if (t === 8) return '투페어';
      if (t === 7) return '트립스';
      if (t === 5) return '낮은 플러시';
      return '중간 손';
    }
    if (t === 7) return '셋';
    if (t === 8) return '투페어';
    return MADE_NAME[t] || (s === 'nut' ? '넛급 손' : '강한 손');
  }

  // ── 말버릇(꼬리말) ──
  // 의도 묶음: go(밸류), bluff(블러프, 세미블러프), wait(콜, 체크, 함정), stop(포기)
  var TAILS = {
    Fish: { go: [' 일단 가보자~', ' 재밌겠다~', ' 느낌 좋아~'], bluff: [' 될 대로 돼라~', ' 한번 해 보는 거야~', ' 두근두근~'],
      wait: [' 뭐 어때~', ' 천천히 가자~', ' 다음 카드 기대된다~'], stop: [' 에이 재미없다~', ' 다음 판은 꼭~', ' 아쉽다~'] },
    Nit: { go: [' 확실할 때만 간다.', ' 무리는 안 한다.', ' 차분하게.'], bluff: [' 드물게 한 번.', ' 이번 한 번만.', ' 들키면 안 돼.'],
      wait: [' 서두르지 않는다.', ' 조심해서.', ' 위험은 작게.'], stop: [' 확실하지 않으면 안 간다.', ' 참는 것도 실력.', ' 기다리면 기회가 온다.'] },
    LAG: { go: [' 계속 압박하자.', ' 밀어붙인다.', ' 쉴 틈을 안 준다.'], bluff: [' 계속 압박하자.', ' 밀어붙인다.', ' 쉴 틈을 안 준다.'],
      wait: [' 다음엔 내가 친다.', ' 잠깐 숨 고르기.', ' 기회를 엿본다.'], stop: [' 이번 건 보내주지.', ' 다음에 갚아 주지.', ' 한 판쯤이야.'] },
    TAG: { go: [' 정석대로.', ' 계획대로.', ' 기본에 충실하게.'], bluff: [' 계산된 블러프.', ' 빈도대로.', ' 정석대로.'],
      wait: [' 정석대로.', ' 서두를 것 없어.', ' 계산대로.'], stop: [' 정석대로.', ' 손해는 작게.', ' 다음 기회를 보자.'] },
    Mixed: { go: [' 오늘은 이렇게 가 볼까.', ' 기분 따라.', ' 이번엔 이 방법.'], bluff: [' 한번 흔들어 볼까.', ' 기분 따라.', ' 오늘은 이렇게 가 볼까.'],
      wait: [' 이번엔 조용히.', ' 오늘은 느긋하게.', ' 기분 따라.'], stop: [' 이번엔 접어 두지.', ' 오늘은 아니네.', ' 그럴 때도 있지.'] },
    Station: { go: [' 일단 가 보자.', ' 오랜만에 친다.', ' 이번엔 내가 먼저.'], bluff: [' 나도 가끔은 친다.', ' 오랜만에 친다.', ' 이번엔 내가 먼저.'],
      wait: [' 일단 보자.', ' 끝까지 가 보자.', ' 접는 건 싫어.'], stop: [' 이건 진짜 못 받겠다.', ' 웬일로 접네.', ' 어쩔 수 없지.'] }
  };
  // 유형 은닉(state.hideTypes)용 중립 말버릇: 어느 유형의 풀과도 겹치지 않는다
  var NEUTRAL_TAIL = { go: [' 좋아.', ' 가자.', ' 이렇게 하자.'], bluff: [' 한번 해 보자.', ' 밀어 보자.', ' 승부.'],
    wait: [' 지켜보자.', ' 천천히.', ' 일단 이렇게.'], stop: [' 다음을 보자.', ' 다음 판.', ' 됐어.'] };
  var TAIL_GROUPS = ['go', 'bluff', 'wait', 'stop'];
  function _tailGroup(intent) {
    if (intent === 'give-up') return 'stop';
    if (intent === 'bluff' || intent === 'semibluff') return 'bluff';
    return intent === 'value' ? 'go' : 'wait';
  }

  function _castOf(name) {
    if (typeof CAST === 'undefined' || !CAST || typeof CAST.filter !== 'function') return null;
    return CAST.filter(function(c) { return c && (c.key === name || c.name === name); })[0] || null;
  }
  // CAST tail(포기면 tailGiveUp 우선): 문자열, 문자열 배열, 또는 {go, bluff, wait, stop(또는 'give-up'), any, default} 객체(bluff가 없으면 go)
  function _tailList(t, group) {
    if (!t) return [];
    if (typeof t === 'string') return [t];
    if (Array.isArray(t)) return t.filter(function(x) { return typeof x === 'string' && x; });
    if (typeof t === 'object') {
      var v = group === 'stop' ? (t.stop || t['give-up'] || t.fold) : group === 'bluff' ? (t.bluff || t.go) : t[group];
      return _tailList(v || t.any || t['default'] || t.go, group);
    }
    return [];
  }
  function _spaced(s) { s = String(s || ''); return !s ? '' : (/^\s/.test(s) ? s : ' ' + s); }

  // 꼬리말: 은닉이면 중립, 캐스트 좌석이면 CAST tail, 아니면 유형 말투
  function _tone(type, intent, pick, opt) {
    opt = opt || {};
    var grp = _tailGroup(intent);
    var pool;
    if (opt.hide) pool = NEUTRAL_TAIL[grp] || NEUTRAL_TAIL.go;
    else {
      var cast = opt.name ? _castOf(opt.name) : null;
      // 캐스트(journey/cast.js): tail(평소), tailGiveUp(포기할 때, 있으면)
      var ct = cast ? _tailList((grp === 'stop' && cast.tailGiveUp) ? cast.tailGiveUp : cast.tail, grp) : [];
      pool = ct.length ? ct : (TAILS[type] ? (TAILS[type][grp] || TAILS[type].go) : []);
    }
    if (!pool || !pool.length) return '';
    return _spaced(pool[(pick || function() { return 0; })(pool.length)]);
  }

  // ── 대사 풀(의도별 상황마다 3개 이상) ──
  var PF = {
    foldGood: [
      function(c) { return c.gk + ' 손이지만 가격이 비싸. 이번엔 접자.'; },
      function(c) { return c.gk + ' 손이긴 한데 이 레이즈를 따라가긴 무리야. 폴드.'; },
      function(c) { return '이번엔 ' + c.gk + ' 손을 내려놓는다. 더 좋은 자리를 기다리자.'; }
    ],
    foldWeak: [
      function(c) { return c.gk + ' 손이라 ' + c.where + '들어갈 이유가 없어. 폴드.'; },
      function(c) { return _ro(c.gk + ' 손') + ' ' + c.where + '버티면 손해야. 접는다.'; },
      function(c) { return c.gk + ' 손은 ' + c.where + '그냥 버리는 게 이득이야. 폴드.'; }
    ],
    raiseValue: [
      function(c) { return c.gk + ' 손, ' + c.where + _ro(c.aw) + ' 팟을 키우자.'; },
      function(c) { return c.gk + ' 손이 왔어. ' + c.where + '올려서 더 약한 손들한테 돈을 받자.'; },
      function(c) { return c.where + c.gk + ' 손이면 망설일 게 없지. ' + c.aw + '.'; }
    ],
    raiseSpec: [
      function(c) { return '투기적인 손이지만 ' + c.where + '주도권 잡고 플랍을 노려보자.'; },
      function(c) { return '지금은 약해도 플랍에서 크게 맞을 수 있는 손이야. ' + c.where + '먼저 올려 두자.'; },
      function(c) { return c.where + _ro(c.aw) + ' 먼저 나가면 지금 가져갈 수도 있고, 플랍에서 맞으면 크게 이긴다.'; }
    ],
    raiseWeak: [
      function(c) { return '솔직히 약한 손인데 ' + c.where + _ro(c.aw) + ' 다들 접게 만들자.'; },
      function(c) { return '카드는 별로지만 ' + c.where + '지금 올리면 다들 접을 것 같아.'; },
      function(c) { return c.where + '약한 손이라도 먼저 세게 나가면 팟을 가져올 수 있어.'; }
    ],
    callTrap: [
      '프리미엄 손인데 일부러 콜만. 상대가 더 쳐주길 기다리자.',
      '강한 손을 숨기고 콜. 뒤에서 레이즈가 나오면 그때 올린다.',
      '여기선 조용히 콜만 하자. 강한 손인 걸 들키면 안 돼.'
    ],
    callFish: [
      '카드 두 장이 예뻐 보여. 그냥 궁금해서 콜~',
      '이 손 왠지 맞을 것 같아. 콜~',
      '접기엔 아까운 느낌이야. 콜하고 플랍 보자~'
    ],
    call: [
      function(c) { return c.gk + ' 손, 가격이 괜찮으니 콜하고 플랍 보자.'; },
      function(c) { return c.gk + ' 손이라 레이즈까지는 아니야. 콜로 플랍을 본다.'; },
      function(c) { return _ro(c.where + c.gk + ' 손') + ' 싸게 플랍을 볼 수 있으면 콜.'; }
    ],
    checkTrap: [
      '프리미엄 손이지만 일부러 체크. 플랍에서 받아내자.',
      '여기서 올리면 다 접을 거야. 체크로 숨기자.',
      '강한 손을 숨기고 체크. 승부는 플랍부터.'
    ],
    check: [
      function(c) { return c.gk + ' 손이라 공짜로 플랍 보자. 체크.'; },
      '돈 안 내고 플랍을 볼 수 있으면 좋지. 체크.',
      function(c) { return c.gk + ' 손이라 굳이 올릴 필요 없어. 체크로 플랍 보자.'; }
    ]
  };

  // 포스트플랍. c.h 손 이름, c.tex 텍스처(플랍/턴만), c.aw 액션 낱말, c.need 필요 승률 %(없으면 null)
  var PO = {
    fold: [
      function(c) { return _ro(c.h) + '는 못 버텨. 여기서 접는다.'; },
      function(c) { return _ro(c.h) + ' 이 벳을 받기엔 너무 약해. 폴드.'; },
      function(c) { return '아쉽지만 ' + _j(c.h, '은', '는') + ' 여기까지. 접자.'; }
    ],
    foldRiver: [
      function(c) { return '리버까지 왔지만 ' + _ro(c.h) + '는 못 이겨. 폴드.'; },
      function(c) { return _ro(c.h) + ' 리버 벳을 받기엔 약해. 접는다.'; },
      function(c) { return '아쉽지만 ' + _j(c.h, '은', '는') + ' 여기까지. 리버에서 접자.'; }
    ],
    valueWet: [
      function(c) { return c.h + ', ' + c.tex + ' 지금 크게 쳐서 드로우한테 비싸게 만들자.'; },
      function(c) { return _j(c.h, '이니', '니') + ' 밸류야. ' + c.tex + ' 공짜 카드를 주면 안 돼.'; },
      function(c) { return _ro(c.h) + ' ' + c.aw + '. ' + c.tex + ' 따라오려면 비싸게 내야 할 거야.'; }
    ],
    valueDry: [
      function(c) { return c.h + ', ' + c.tex + ' 약한 손한테서 콜을 받아내자.'; },
      function(c) { return _j(c.h, '이니', '니') + ' 밸류 ' + c.aw + '. ' + c.tex + ' 더 약한 페어가 따라올 거야.'; },
      function(c) { return c.tex + ' 무서운 카드가 적어. ' + _ro(c.h) + ' 차곡차곡 받아내자.'; }
    ],
    valueRiver: [
      function(c) { return '리버, ' + _j(c.h, '이면', '면') + ' 더 약한 손이 콜해 줄 때 받아내야지. ' + c.aw + '.'; },
      function(c) { return _ro(c.h) + ' 마지막 ' + c.aw + '. 쇼다운까지 가면 내가 이길 때가 많아.'; },
      function(c) { return '리버에서 ' + _j(c.h, '이라', '라') + ' 밸류 ' + c.aw + '. 빗나간 손은 접어도 페어들은 따라올 거야.'; }
    ],
    weakBet: [
      function(c) { return '약한 페어지만 쇼다운 가치가 애매해. ' + _ro(c.aw) + ' 접게 만들자.'; },
      function(c) { return '약한 페어로는 체크해도 불안해. 먼저 ' + c.aw + '해서 더 좋은 손을 접게 해 보자.'; },
      function(c) { return '약한 페어로 ' + c.aw + '. 더 높은 페어도 접어 줄지 몰라.'; }
    ],
    weakBetRiver: [
      function(c) { return '리버, 약한 페어로는 쇼다운이 불안해. ' + _ro(c.aw) + ' 더 좋은 손을 접게 해 보자.'; },
      '약한 페어지만 리버에서 세게 나가면 상대가 접을 수도 있어.',
      '리버에 약한 페어. 체크하면 지는 쪽이 많을 것 같아서 블러프처럼 친다.'
    ],
    semiFlop: [
      function(c) { return '아직 드로우지만 ' + c.aw + '하면 상대가 접을 수도 있고, 맞으면 이긴다.'; },
      function(c) { return _ro(c.h) + ' 세미블러프. 지금 접게 하거나, 다음 카드에 완성하거나.'; },
      function(c) { return _j(c.h, '이니', '니') + ' 먼저 치자. 폴드로 가져오면 좋고 맞으면 더 좋고.'; }
    ],
    semiTurn: [
      function(c) { return '한 장 남은 ' + c.h + '. ' + _ro(c.aw) + ' 지금 접게 만드는 게 제일 좋아.'; },
      function(c) { return '턴에서 ' + _ro(c.h) + ' 세미블러프. 리버에 맞으면 크게 이긴다.'; },
      function(c) { return '아직 ' + _j(c.h, '이지만', '지만') + ' 세게 나가면 상대가 버티기 힘들 거야.'; }
    ],
    bluffFlop: [
      '맞은 게 없어. 이 보드는 내가 강해 보일 테니 블러프로 가져오자.',
      '완전히 빗나갔어. 그래도 상대도 대부분 빗나갔을 테니 먼저 치자. 블러프.',
      function(c) { return '아무것도 없어. 그래서 ' + _j(c.aw, '이야', '야') + '. 체크하면 이길 방법이 없어.'; }
    ],
    bluffTurn: [
      '턴에도 맞은 게 없어. 지금 밀어서 접게 만들자.',
      '이 턴 카드는 내가 맞은 것처럼 보일 거야. 블러프.',
      '아무것도 없지만 여기서 멈추면 그냥 지는 거야. 친다.'
    ],
    bluffRiver: [
      '리버까지 빗나갔어. 이길 길은 블러프뿐이야.',
      '쇼다운하면 거의 져. 크게 쳐서 접게 만들자.',
      '맞은 건 없지만 이 보드면 강한 손인 척하기 좋아. 마지막 블러프.'
    ],
    callTrap: [
      function(c) { return c.h + '인데 일부러 콜만. 다음 스트리트에 더 받아내자.'; },
      function(c) { return _j(c.h, '이지만', '지만') + ' 여기선 레이즈 안 해. 상대가 계속 치게 두자.'; },
      function(c) { return '콜로 숨기자. ' + c.h + '인 걸 들키면 상대가 멈출 거야.'; }
    ],
    callTrapRiver: [
      function(c) { return _j(c.h, '이라', '라') + ' 콜. 레이즈하면 더 약한 손은 다 접을 거야.'; },
      function(c) { return '리버에서 ' + c.h + '. 레이즈로 겁주기보다 콜로 확실히 이기자.'; },
      function(c) { return _j(c.h, '이면', '면') + ' 이 벳은 받아야지. 콜로 쇼다운.'; }
    ],
    // Fish 에어 콜: 모든 변형에 '궁금해서 콜'(기존 단언 tests/p8-thinking.test.js 유지)
    callFishAir: [
      '맞은 건 없지만 그냥 궁금해서 콜~',
      '뭘 들고 있는지 궁금해서 콜! 운 좋으면 이기겠지~',
      '아무것도 없는데 궁금해서 콜~ 혹시 모르잖아.'
    ],
    callAir: [
      '맞은 건 없지만 상대가 자주 치는 걸 알아. 한 번 받고 다음 카드 보자.',
      '지금은 아무것도 없어. 그래도 다음 카드에 맞을 수도 있고 상대가 포기할 수도 있어. 콜.',
      '아무것도 없지만 상대 벳을 믿지 않아. 콜로 다음 카드를 보자.'
    ],
    callAirRiver: [
      '하이카드뿐이지만 상대가 블러프일 것 같아. 콜.',
      '맞은 건 없어. 그래도 상대 이야기가 이상해. 한 번 잡아 본다.',
      '아무것도 없지만 상대 블러프만 이기면 돼. 콜.'
    ],
    callDrawFlop: [
      function(c) { return c.need ? c.h + ' 남았어. 필요 승률 ' + c.need + '%라 콜하고 다음 카드 보자.' : null; },
      function(c) { return _ro(c.h) + ' 콜. 맞으면 크게 이길 수 있어.'; },
      function(c) { return '아직 미완성 ' + c.h + '. 가격이 괜찮으니 따라간다.'; }
    ],
    callDrawTurn: [
      function(c) { return c.need ? '리버 한 장 남았어. ' + _ro(c.h) + ' 필요 승률 ' + c.need + '%면 콜.' : null; },
      function(c) { return c.h + ', 한 장에 맞혀야 해. 가격 보고 콜.'; },
      function(c) { return '턴에서도 ' + c.h + '. 마지막 카드 하나 보자. 콜.'; }
    ],
    callMid: [
      function(c) { return c.need ? _j(c.h, '이면', '면') + ' 블러프는 이긴다. 필요 승률 ' + c.need + '% 정도면 콜.' : null; },
      function(c) { return _ro(c.h) + ' 접기엔 아까워. 한 번 받아 보자.'; },
      function(c) { return _j(c.h, '이라', '라') + ' 레이즈까진 아니고 콜로 버틴다.'; }
    ],
    callMidRiver: [
      function(c) { return c.need ? '리버, ' + _j(c.h, '이면', '면') + ' 블러프는 잡는다. 필요 승률 ' + c.need + '%면 콜.' : null; },
      function(c) { return _ro(c.h) + ' 쇼다운해 보자. 상대가 블러프일 수도 있어.'; },
      function(c) { return c.need ? c.h + '. 이길 때가 ' + c.need + '%만 넘으면 콜이 맞아.' : null; }
    ],
    checkTrap: [
      function(c) { return _j(c.h, '이지만', '지만') + ' 체크로 숨기자. 상대 벳 나오면 레이즈.'; },
      function(c) { return c.h + '. 일부러 체크해서 상대가 치게 만들자.'; },
      function(c) { return '조용히 체크. ' + _j(c.h, '이라', '라') + ' 서두를 필요 없어.'; }
    ],
    checkTrapRiver: [
      function(c) { return _j(c.h, '이지만', '지만') + ' 체크. 상대가 벳하면 그때 레이즈.'; },
      '리버에서 체크로 함정. 블러프가 나오길 기다린다.',
      function(c) { return c.h + '. 내가 치면 접을 것 같아서 체크로 기다린다.'; }
    ],
    checkAir: [
      '맞은 게 없어. 조용히 체크.',
      '아무것도 없으니 돈 안 쓰고 다음 카드 보자. 체크.',
      '이 보드는 나랑 안 맞아. 체크하고 지켜보자.'
    ],
    checkAirRiver: [
      '리버까지 빗나갔어. 블러프할 이야기도 없으니 체크.',
      '맞은 게 없어. 여기서 돈 더 쓰지 말자. 체크.',
      '아무것도 없는 손. 체크하고 끝내자.'
    ],
    checkDraw: [
      function(c) { return _j(c.h, '이니', '니') + ' 공짜로 다음 카드 보자. 체크.'; },
      function(c) { return _j(c.h, '이라', '라') + ' 돈 안 내고 한 장 더 보면 최고야. 체크.'; },
      function(c) { return '벳하기엔 애매한 ' + c.h + '. 체크로 공짜 카드.'; }
    ],
    checkMid: [
      function(c) { return _j(c.h, '이라', '라') + ' 팟을 작게 유지하자. 체크.'; },
      function(c) { return _ro(c.h) + ' 큰 팟은 싫어. 체크하고 쇼다운 가치를 지키자.'; },
      function(c) { return c.h + ', 벳하면 더 좋은 손만 콜할 것 같아. 체크.'; }
    ],
    checkMidRiver: [
      function(c) { return '리버, ' + _j(c.h, '이라', '라') + ' 쇼다운하면 이길 수도 있어. 체크.'; },
      function(c) { return _ro(c.h) + ' 싸게 끝내자. 체크.'; },
      function(c) { return '벳하면 더 좋은 손만 받을 거야. ' + _ro(c.h) + ' 체크.'; }
    ]
  };

  function _actWord(action, label) {
    if (action === 'allin' || label === '올인') return '올인';
    if (action === '3bet') return '3벳';
    if (action === 'raise') return '레이즈';
    return '벳';
  }

  // 프리플랍 상황 → { intent, pool, conf }
  function _preflopCase(type, g, action) {
    if (action === 'fold') return { intent: 'give-up', pool: (g === 'premium' || g === 'good') ? 'foldGood' : 'foldWeak', conf: 'mid' };
    if (_isAggro(action)) {
      if (g === 'premium' || g === 'good') return { intent: 'value', pool: 'raiseValue', conf: g === 'premium' ? 'high' : 'mid' };
      if (g === 'spec') return { intent: action === '3bet' ? 'bluff' : 'semibluff', pool: 'raiseSpec', conf: 'low' };
      return { intent: 'bluff', pool: 'raiseWeak', conf: 'low' };
    }
    if (action === 'call') {
      if (g === 'premium') return { intent: 'trap', pool: 'callTrap', conf: 'high' };
      if (type === 'Fish' && g === 'weak') return { intent: 'call-odds', pool: 'callFish', conf: 'low' };
      return { intent: 'call-odds', pool: 'call', conf: 'mid' };
    }
    if (g === 'premium') return { intent: 'trap', pool: 'checkTrap', conf: 'high' };
    return { intent: 'pot-control', pool: 'check', conf: 'mid' };
  }

  // 포스트플랍 상황 → { intent, pool, conf }
  function _postflopCase(type, s, action, pst, wet) {
    var river = pst === 'river', turn = pst === 'turn';
    var made = s === 'nut' || s === 'strong';
    if (action === 'fold') return { intent: 'give-up', pool: river ? 'foldRiver' : 'fold', conf: 'mid' };
    if (_isAggro(action)) {
      if (made || s === 'medium') return { intent: 'value', pool: river ? 'valueRiver' : wet ? 'valueWet' : 'valueDry', conf: made ? 'high' : 'mid' };
      if (s === 'weak-pair') return { intent: 'bluff', pool: river ? 'weakBetRiver' : 'weakBet', conf: 'low' };
      if (s === 'draw') return { intent: 'semibluff', pool: turn ? 'semiTurn' : 'semiFlop', conf: 'mid' };
      return { intent: 'bluff', pool: river ? 'bluffRiver' : turn ? 'bluffTurn' : 'bluffFlop', conf: 'low' };
    }
    if (action === 'call') {
      if (made) return { intent: 'trap', pool: river ? 'callTrapRiver' : 'callTrap', conf: 'high' };
      if (s === 'air' && type === 'Fish') return { intent: 'call-odds', pool: 'callFishAir', conf: 'low' };
      if (s === 'air') return { intent: 'call-odds', pool: river ? 'callAirRiver' : 'callAir', conf: 'low' };
      if (s === 'draw') return { intent: 'call-odds', pool: turn ? 'callDrawTurn' : 'callDrawFlop', conf: 'mid' };
      return { intent: 'call-odds', pool: river ? 'callMidRiver' : 'callMid', conf: 'mid' };
    }
    if (made) return { intent: 'trap', pool: river ? 'checkTrapRiver' : 'checkTrap', conf: 'high' };
    if (s === 'air') return { intent: 'give-up', pool: river ? 'checkAirRiver' : 'checkAir', conf: 'mid' };
    if (s === 'draw') return { intent: 'pot-control', pool: 'checkDraw', conf: 'mid' };
    return { intent: 'pot-control', pool: river ? 'checkMidRiver' : 'checkMid', conf: 'mid' };
  }

  // 액션 직전 스냅샷: opts.snapshot 또는 potBefore 필드를 가진 opts(액션 객체) 자체
  function _snap(opts) {
    if (!opts) return null;
    var s = opts.snapshot || opts;
    return (s && typeof s.potBefore === 'number') ? s : null;
  }

  // villainThought(state, name, action, amount, opts) → { name, street, text, intent, conf, body, tail, calc }
  function villainThought(state, name, action, amount, opts) {
    opts = opts || {};
    state = state || {};
    var p = (state.players && state.players[name]) || {};
    var hide = !!state.hideTypes;
    var type = hide ? null : (p.type || 'TAG');
    var hole = (state.holeCards && state.holeCards[name]) || p.holeCards || [];
    var board = state.board || [];
    var street = state.street || 'preflop';
    var pst = _boardStreet(board, street);
    var pick = _picker(['vt', name, street, _cardsKey(board), action, _cardsKey(hole),
      state.handNum == null ? '' : state.handNum, state.seed == null ? '' : state.seed].join('|'), opts.rnd);
    var snap = _snap(opts);
    var toCall, pot;
    if (snap) {
      toCall = Math.max(0, (snap.currentBetBefore || 0) - (snap.haveBefore || 0));
      pot = snap.potBefore || 0;
    } else {
      toCall = action === 'call' ? (amount || 0)
        : Math.max(0, (state.currentBet || 0) - ((state.playerBets && state.playerBets[name]) || 0));
      pot = state.pot || 0;
    }
    var need = (toCall > 0 && pot > 0) ? toCall / (pot + toCall) : 0;
    var aw = _actWord(action, opts.label);
    var r, body;
    if (board.length < 3 || street === 'preflop') {
      var g = preflopGrade(hole);
      r = _preflopCase(type, g, action);
      body = _fromPool(PF[r.pool], { gk: GRADE_ADJ[g], where: p.pos ? p.pos + '에서 ' : '', aw: aw }, pick);
    } else {
      var s = strength(hole, board);
      var wet = _isWet(board);
      r = _postflopCase(type, s, action, pst, wet);
      var c = {
        h: _handTxt(hole, board, s),
        tex: pst === 'river' ? '' : (wet ? '보드에 드로우가 많아' : '보드가 드라이해서'),
        aw: aw, need: need > 0 ? Math.round(need * 100) : null
      };
      body = _fromPool(PO[r.pool], c, pick);
    }
    var tail = _tone(type, r.intent, pick, { hide: hide, name: name });
    var text = '💭 ' + name + ': ' + body + tail + ' (' + INTENT_KOR[r.intent] + ')';
    return { name: name, street: street, text: text, intent: r.intent, conf: r.conf,
      body: body, tail: tail, calc: { toCall: toCall, pot: pot, need: need } };
  }

  // ── 레인지 대표 조합 ──
  function _clsName(cls) {
    if (cls.length === 2) return '포켓 ' + RANK_NAME[cls.charAt(0)];
    return RANK_NAME[cls.charAt(0)] + RANK_NAME[cls.charAt(1)];
  }
  function _cardTxt(c) { return (c.rank === 'T' ? '10' : c.rank) + SUIT_SYM[c.suit]; }
  function comboText(cls, combo) { return _clsName(cls) + ' ' + _cardTxt(combo[0]) + _cardTxt(combo[1]); }
  // 클래스('AQs', 'AQo', '66') → 살아 있는 구체 조합 목록(무늬 순서는 rot만큼 회전)
  function _clsCombos(cls, dead, rot) {
    var r1 = cls.charAt(0), r2 = cls.charAt(1), kind = cls.length === 2 ? 'p' : cls.charAt(2);
    var su = SUITS.slice(rot).concat(SUITS.slice(0, rot));
    var out = [], i, j;
    function add(a, b) { if (!dead[r1 + a] && !dead[r2 + b]) out.push([{ rank: r1, suit: a }, { rank: r2, suit: b }]); }
    if (kind === 'p') { for (i = 0; i < 4; i++) for (j = i + 1; j < 4; j++) add(su[i], su[j]); }
    else if (kind === 's') { for (i = 0; i < 4; i++) add(su[i], su[i]); }
    else { for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) if (i !== j) add(su[i], su[j]); }
    return out;
  }
  function _clsEq(cls) {
    if (typeof PreflopEquity !== 'undefined' && PreflopEquity && typeof PreflopEquity[cls] === 'number') return PreflopEquity[cls];
    return (_ri(cls.charAt(0)) + _ri(cls.charAt(1))) / 30 + (cls.length === 2 ? 0.2 : 0);
  }
  function _kind(cls) { return cls.length === 2 ? 'p' : cls.charAt(2); }

  // rangeExamples(arr, opts{board, dead, grades, n, seed}) → ['에이스퀸 A♠Q♦', ...]
  //   보드 3장 미만: 레인지를 프리플랍 에쿼티 순으로 세워 위, 가운데, 아래에서 고른다.
  //   보드 3장 이상: 조합마다 진실 등급을 매겨 opts.grades(없으면 등급마다 고루)에 맞는 손을 콤보 수가 많은 순으로 고른다.
  //   같은 입력은 작은 캐시로 다시 계산하지 않는다(폰에서 넓은 레인지 리버 계산이 수 ms).
  var _exCache = {}, _exCacheN = 0;
  function rangeExamples(arr, opts) {
    opts = opts || {};
    if (!arr || !arr.length || typeof Range === 'undefined') return [];
    var key = [arr.join(','), _cardsKey(opts.board), _cardsKey(opts.dead), (opts.grades || []).join(','),
      opts.n || 3, (opts.seed >>> 0) % 4].join('|');
    if (Object.prototype.hasOwnProperty.call(_exCache, key)) return _exCache[key].slice();
    var out = _rangeExamplesRaw(arr, opts);
    if (_exCacheN >= 200) { _exCache = {}; _exCacheN = 0; }
    _exCache[key] = out.slice();
    _exCacheN++;
    return out;
  }
  function _rangeExamplesRaw(arr, opts) {
    var n = opts.n || 3;
    var board = opts.board || [];
    var dead = {};
    board.concat(opts.dead || []).forEach(function(c) { if (c) dead[_cardKey(c)] = true; });
    var rot = (opts.seed >>> 0) % 4;
    var classes = [];
    Range.parse(arr.join(',')).forEach(function(cls) { classes.push(cls); });
    classes.sort(function(a, b) { return (_clsEq(b) - _clsEq(a)) || (a < b ? -1 : a > b ? 1 : 0); });
    if (board.length < 3) {
      var live = classes.filter(function(cls) { return _clsCombos(cls, dead, rot).length > 0; });
      if (!live.length) return [];
      var qs = n >= 3 ? [0.15, 0.5, 0.85] : n === 2 ? [0.2, 0.7] : [0.3];
      var seen = {}, out = [];
      qs.forEach(function(q) {
        // 분위수 자리에서 시작해 아직 안 쓴 말 이름(AKs와 AKo는 같은 '에이스킹')을 찾는다
        for (var i = Math.round(q * (live.length - 1)); i < live.length; i++) {
          var cls = live[i];
          if (seen[_clsName(cls)]) continue;
          seen[_clsName(cls)] = true;
          out.push(comboText(cls, _clsCombos(cls, dead, rot)[0]));
          return;
        }
      });
      return out;
    }
    var byGrade = { strong: [], medium: [], weak: [], air: [] };
    classes.forEach(function(cls) {
      var cnt = {}, first = {};
      _clsCombos(cls, dead, rot).forEach(function(cb) {
        var g = truthGrade(cb, board);
        cnt[g] = (cnt[g] || 0) + 1;
        if (!first[g]) first[g] = cb;
      });
      Object.keys(cnt).forEach(function(g) {
        if (byGrade[g]) byGrade[g].push({ cls: cls, n: cnt[g], combo: first[g], eq: _clsEq(cls) });
      });
    });
    Object.keys(byGrade).forEach(function(g) {
      byGrade[g].sort(function(a, b) { return (b.n - a.n) || (b.eq - a.eq); });
    });
    var grades = (opts.grades && opts.grades.length) ? opts.grades.slice() : ['medium', 'weak', 'strong', 'air'];
    var lists = grades.map(function(g) { return (byGrade[g] || []).slice(); });
    var picked = [], used = {}, kinds = {};
    // 등급을 번갈아 가며 고른다. 같은 모양(페어, 수딧, 오프수트)은 2개까지(남는 자리가 있으면 다시 채움)
    for (var pass = 0; pass < 2 && picked.length < n; pass++) {
      var moved = true;
      while (picked.length < n && moved) {
        moved = false;
        for (var gi = 0; gi < lists.length && picked.length < n; gi++) {
          var L = lists[gi];
          for (var k = 0; k < L.length; k++) {
            var e = L[k];
            if (used[_clsName(e.cls)]) continue;
            if (pass === 0 && (kinds[_kind(e.cls)] || 0) >= 2) continue;
            used[_clsName(e.cls)] = true;
            kinds[_kind(e.cls)] = (kinds[_kind(e.cls)] || 0) + 1;
            picked.push(e);
            moved = true;
            break;
          }
        }
      }
    }
    return picked.map(function(e) { return comboText(e.cls, e.combo); });
  }

  // 캐릭터 엔진 표(ai/villain-profiles.js): 문자열 레인지 → 배열. 표가 없으면 null
  function _profArr(type, key, pos) {
    if (!type || typeof VillainProfiles === 'undefined' || !VillainProfiles || !VillainProfiles[type]) return null;
    var P = VillainProfiles[type];
    var v = pos ? (P[key] && P[key][pos]) : P[key];
    return (typeof v === 'string' && v) ? v.split(',') : null;
  }
  // 대상 좌석의 추정 레인지 → { arr, label, src: 'profile'|'chart' } | null
  //   type(유형 공개일 때만 넘긴다)이 있고 그 캐릭터 표가 있으면 실제 엔진 표(VillainProfiles),
  //   아니면 이 앱 차트(GTO_RANGES). 둘 다 Range로 펼친다.
  function _rangeOf(state, target, type) {
    var G = (typeof Gto !== 'undefined' && Gto.GTO_RANGES) ? Gto.GTO_RANGES : null;
    if (!G || !state) return null;
    var p = state.players && state.players[target];
    var pos = p && p.pos;
    if (!pos) return null;
    function callArr(ps) {
      var v = G.vsRfi[ps];
      return (v && v.call && v.call.length) ? v.call : G.vsRfi.BB.call;
    }
    function out(prof, chart, label) {
      return prof ? { arr: prof, label: label, src: 'profile' } : { arr: chart, label: label, src: 'chart' };
    }
    // 오픈 레이즈 표: 림프가 기본인 캐릭터(limp_unless)는 그 표만 레이즈한다
    var raiseProf = _profArr(type, 'limp_unless') || _profArr(type, 'rfi', pos);
    var pre = (state.board || []).length < 3 || state.street === 'preflop';
    if (pre) {
      if (state.lastRaiser === target) {
        var n = state.streetBetCount || 1;
        if (n >= 4) return out(_profArr(type, 'jam'), (G.vs4bet[pos] || G.vs4bet.CO).fivebet, '5벳 레인지');
        if (n === 3) return out(_profArr(type, 'fourbet'), (G.vs3bet[pos] || G.vs3bet.CO).fourbet, '4벳 레인지');
        if (n === 2) return out(_profArr(type, 'threebet_range'), (G.vsRfi[pos] || G.vsRfi.BB).threebet, '3벳 레인지');
        if (G.rfi[pos]) return out(raiseProf, G.rfi[pos], '오픈 레인지');
        return out(null, G.vsLimpBB || G.vsRfi.BB.threebet, '레이즈 레인지');
      }
      return out(_profArr(type, 'call_vs_raise', pos), callArr(pos), '콜 레인지');
    }
    if (state.pfAggressor && state.pfAggressor === target) {
      return out(G.rfi[pos] ? raiseProf : _profArr(type, 'threebet_range'),
        G.rfi[pos] || (G.vsRfi[pos] || G.vsRfi.BB).threebet, '프리플랍 레이즈 레인지');
    }
    if (state.pfAggressor) return out(_profArr(type, 'call_vs_raise', pos), callArr(pos), '프리플랍 콜 레인지');
    return out(_profArr(type, 'rfi', pos), G.rfi.BTN, '넓은 레인지');
  }

  function _exampleTail(list) {
    return list && list.length ? ' (예: ' + list.join(', ') + ' 같은 손)' : '';
  }

  // ── 상대 읽기(T5) ──
  // 유형 x 액션 → 읽기 등급. 엔진 빌런(ai/villain.js)으로 6인 4000핸드를 돌려 액션별 실제 강도(truthGrade)의
  // 최빈값을 보고, 포커 상식(블러프가 드문 사람의 벳은 강하다, 공격적인 사람의 벳은 블러프가 많다)과 맞춘 표다.
  // 캐릭터 읽기(참고)이고 정답이 아니다. 유형을 모르면(hideTypes) NEUTRAL 줄만 쓴다.
  var READ_KEYS = ['allin', 'raise', 'betBig', 'betSmall', 'bet', 'call', 'check'];
  var READ_TABLE = {
    TAG:     { allin: 'strong', raise: 'strong', betBig: 'strong', betSmall: 'weak', bet: 'medium', call: 'medium', check: 'weak' },
    LAG:     { allin: 'medium', raise: 'air', betBig: 'air', betSmall: 'air', bet: 'weak', call: 'medium', check: 'air' },
    Fish:    { allin: 'strong', raise: 'strong', betBig: 'strong', betSmall: 'strong', bet: 'strong', call: 'weak', check: 'weak' },
    Nit:     { allin: 'strong', raise: 'strong', betBig: 'strong', betSmall: 'weak', bet: 'medium', call: 'medium', check: 'air' },
    Mixed:   { allin: 'strong', raise: 'air', betBig: 'air', betSmall: 'air', bet: 'weak', call: 'weak', check: 'air' },
    Station: { allin: 'strong', raise: 'strong', betBig: 'strong', betSmall: 'strong', bet: 'strong', call: 'weak', check: 'weak' },
    NEUTRAL: { allin: 'strong', raise: 'strong', betBig: 'strong', betSmall: 'weak', bet: 'medium', call: 'medium', check: 'weak' }
  };
  // 이유 문구: up(공격 액션을 강하게 읽음), down(공격 액션을 약하게 읽음), call, check
  var READ_WHY = {
    TAG: { up: '정석대로 치는 사람이 크게 나왔으니', down: '정석대로 치는 사람의 작은 벳은 넓게 치는 c벳일 때가 많아서',
      call: '정석대로 치는 사람이 콜했으니', check: '정석대로 치는 사람이 치지 않았으니' },
    LAG: { up: '공격적인 사람의 올인은 강한 손과 블러프가 섞여서', down: '블러프가 많은 사람이라',
      call: '공격적인 사람이 레이즈 대신 콜했으니', check: '공격적인 사람이 치지 않았으니' },
    Fish: { up: '블러프가 드문 사람이라', down: '블러프가 드문 사람이지만',
      call: '아무 손으로나 따라오는 사람이라', check: '아무 손으로나 들어오는 사람이 치지 않았으니' },
    Nit: { up: '조심스러운 사람이 이렇게 나왔으니', down: '조심스러운 사람의 작은 벳이라',
      call: '단단한 사람이 콜했으니', check: '단단한 사람이 치지 않았으니' },
    Mixed: { up: '스타일이 자주 바뀌어 단정은 어렵지만', down: '스타일이 자주 바뀌어 단정은 어렵지만',
      call: '스타일이 자주 바뀌어 단정은 어렵지만', check: '스타일이 자주 바뀌어 단정은 어렵지만' },
    Station: { up: '좀처럼 먼저 치지 않는 사람이 쳤으니', down: '좀처럼 먼저 치지 않는 사람이지만',
      call: '끝까지 따라오는 사람이라', check: '먼저 치는 일이 드문 사람이라' },
    NEUTRAL: { up: '성향은 아직 모르니 액션만 보면', down: '성향은 아직 모르니 액션만 보면',
      call: '성향은 아직 모르니 액션만 보면', check: '성향은 아직 모르니 액션만 보면' }
  };
  var READ_POOLS = {
    strong: [
      function(c) { return c.t + '의 ' + c.act + '. ' + c.why + ' 강한 손으로 본다.'; },
      function(c) { return c.t + '의 ' + c.act + ', ' + c.why + ' 강한 손 쪽이야.'; },
      function(c) { return c.why + ' ' + _j(c.t, '은', '는') + ' 강한 손을 들고 있다고 읽는다.'; }
    ],
    medium: [
      function(c) { return c.t + '의 ' + c.act + '. ' + c.why + ' 중간 정도 손으로 본다.'; },
      function(c) { return c.t + '의 ' + c.act + ', ' + c.why + ' 탑페어 정도로 읽는다.'; },
      function(c) { return c.why + ' ' + _j(c.t, '은', '는') + ' 중간 세기 손이라고 본다.'; }
    ],
    weak: [
      function(c) { return c.t + '의 ' + c.act + '. ' + c.why + ' 약한 손으로 본다.'; },
      function(c) { return c.t + '의 ' + c.act + ', ' + c.why + ' 약한 페어나 드로우 쪽이야.'; },
      function(c) { return c.why + ' ' + _j(c.t, '은', '는') + ' 별로 강하지 않다고 본다.'; }
    ],
    weakRiver: [
      function(c) { return c.t + '의 ' + c.act + '. ' + c.why + ' 약한 손으로 본다.'; },
      function(c) { return c.t + '의 ' + c.act + ', ' + c.why + ' 약한 페어 쪽이야.'; },
      function(c) { return c.why + ' ' + _j(c.t, '은', '는') + ' 별로 강하지 않다고 본다.'; }
    ],
    airAggr: [
      function(c) { return c.t + '의 ' + c.act + '. ' + c.why + ' 블러프로 본다.'; },
      function(c) { return c.t + '의 ' + c.act + ', ' + c.why + ' 블러프 냄새가 나.'; },
      function(c) { return c.why + ' ' + _j(c.t, '은', '는') + ' 빈손으로 치고 있다고 읽는다.'; }
    ],
    airPass: [
      function(c) { return c.t + '의 ' + c.act + '. ' + c.why + ' 아무것도 없는 손일 수 있어.'; },
      function(c) { return c.t + '의 ' + c.act + ', ' + c.why + ' 맞은 게 없어 보여.'; },
      function(c) { return c.why + ' ' + _j(c.t, '은', '는') + ' 빈손이라고 읽는다.'; }
    ],
    fold: [
      function(c) { return _j(c.t, '은', '는') + ' 접었다. 이길 손이 아니었다고 본다.'; },
      function(c) { return c.t + '의 폴드. 버틸 손이 없었던 거야.'; },
      function(c) { return _j(c.t, '이', '가') + ' 물러났어. 빈손이었겠지.'; }
    ]
  };

  // readOf(reader, target, state, opts{action, amount, label, snapshot, rnd}) → { grade, text, conf, examples, key } | null
  //   key = 읽기 표의 액션 키(allin, raise, betBig, betSmall, bet, call, check, fold)
  function readOf(reader, target, state, opts) {
    opts = opts || {};
    state = state || {};
    var board = state.board || [];
    if (board.length < 3) return null;
    var hide = !!state.hideTypes;
    var tp = state.players && state.players[target];
    var type = (!hide && tp && tp.type !== 'NEUTRAL' && READ_TABLE[tp.type]) ? tp.type : null;
    var pst = _boardStreet(board, state.street);
    var action = opts.action;
    if (!action) action = state.lastRaiser === target ? 'bet' : 'check';
    if (action === '3bet') action = 'raise';
    var allin = action === 'allin' || opts.label === '올인';
    var key, actTxt;
    if (action === 'fold') { key = 'fold'; actTxt = '폴드'; }
    else if (allin) { key = 'allin'; actTxt = '올인'; }
    else if (action === 'raise') { key = 'raise'; actTxt = '레이즈'; }
    else if (action === 'bet') {
      var snap = _snap(opts);
      var potB = snap ? (snap.potBefore || 0) : (state.pot || 0);
      var have = snap ? (snap.haveBefore || 0) : ((state.playerBets && state.playerBets[target]) || 0);
      var add = (opts.amount || 0) - have;
      if (opts.amount > 0 && potB > 0 && add > 0) {
        var big = add / potB >= 0.6;
        key = big ? 'betBig' : 'betSmall'; actTxt = big ? '큰 벳' : '작은 벳';
      } else { key = 'bet'; actTxt = '벳'; }
    }
    else if (action === 'call') { key = 'call'; actTxt = '콜'; }
    else { key = 'check'; actTxt = '체크'; }

    var row = READ_TABLE[type || 'NEUTRAL'];
    var grade = key === 'fold' ? 'air' : row[key];
    var aggr = key !== 'call' && key !== 'check' && key !== 'fold';
    var whyT = READ_WHY[type || 'NEUTRAL'];
    var why = aggr ? ((grade === 'strong' || grade === 'medium') ? whyT.up : whyT.down) : (key === 'call' ? whyT.call : whyT.check);
    var pick = _picker(['ro', reader, target, state.street, _cardsKey(board), action, opts.amount || 0,
      state.handNum == null ? '' : state.handNum].join('|'), opts.rnd);
    var poolKey = key === 'fold' ? 'fold'
      : grade === 'air' ? (aggr ? 'airAggr' : 'airPass')
      : (grade === 'weak' && pst === 'river') ? 'weakRiver' : grade;
    var body = _fromPool(READ_POOLS[poolKey], { t: target, act: actTxt, why: why }, pick);
    var examples = [];
    if (key !== 'fold') {
      var rg = _rangeOf(state, target, type);
      var readerHole = (state.holeCards && state.holeCards[reader]) || (reader === 'Hero' ? state.heroCards : null) || [];
      if (rg) examples = rangeExamples(rg.arr, { board: board, dead: readerHole, grades: [grade],
        seed: _hash(_cardsKey(board) + '|' + target) });
    }
    var conf = (!type || type === 'Mixed') ? 'low'
      : (aggr && (type === 'Nit' || type === 'Station' || type === 'Fish') && grade === 'strong') ? 'high'
      : (aggr && type === 'LAG') ? 'low' : 'mid';
    return { grade: grade, text: body + _exampleTail(examples), conf: conf, examples: examples, key: key };
  }

  // 히어로 3단계 생각 선택지
  var OPTIONS = {
    range: [{ key: 'strong', label: '강함' }, { key: 'medium', label: '중간' }, { key: 'weak', label: '약함/블러프 많음' }],
    hand: [{ key: 'value', label: '넛/강한 밸류' }, { key: 'medium', label: '블러프캐처/중간' }, { key: 'draw', label: '드로우' }, { key: 'air', label: '에어' }],
    plan: [{ key: 'value', label: '밸류' }, { key: 'bluff', label: '블러프/세미블러프' }, { key: 'control', label: '팟컨트롤/체크콜' }, { key: 'fold', label: '포기(폴드)' }]
  };
  var STEP_TITLE = { range: '① 상대 레인지', hand: '② 내 손', plan: '③ 의도' };
  // heroThoughtOptions(street): 리버면 '드로우' 보기를 뺀다(리버엔 드로우가 없다). 인자가 없으면 기존 그대로.
  function heroThoughtOptions(street) {
    var options = OPTIONS;
    if (street === 'river') {
      options = { range: OPTIONS.range, plan: OPTIONS.plan,
        hand: OPTIONS.hand.filter(function(o) { return o.key !== 'draw'; }) };
    }
    return { steps: ['range', 'hand', 'plan'], titles: STEP_TITLE, options: options };
  }
  function _label(step, key) {
    var o = OPTIONS[step].filter(function(x) { return x.key === key; })[0];
    return o ? o.label : key;
  }

  // 리버 사유: 가이드(플랍 기준 휴리스틱) 문구 대신 리버에 맞는 한 줄(드로우, 보호벳 같은 말 없음)
  function _riverWhy(ga, s) {
    var made = s === 'nut' || s === 'strong';
    if (ga === 'raise') return '리버, 넛급이라 레이즈로 더 받아낸다';
    if (ga === 'bet') {
      if (made) return '리버, 더 약한 손의 콜을 받는 밸류 벳';
      if (s === 'medium' || s === 'weak-pair') return '리버, 더 약한 손이 콜해 줄 만큼 작게 얇은 밸류 벳';
      return '리버, 쇼다운으로는 못 이기는 손이라 벳은 블러프, 상대가 자주 접을 때만';
    }
    if (ga === 'call') {
      if (made) return '리버, 강한 손이라 콜';
      if (s === 'medium') return '리버, 블러프캐처라 상대 블러프가 충분하면 콜';
      return '리버, 약한 페어는 싸게 볼 수 있을 때만 콜';
    }
    if (ga === 'fold') return s === 'air' ? '리버, 이길 수 있는 손이 없어 폴드' : '리버, 이 손으로 이 벳은 버거워 폴드';
    if (made) return '리버, 상대 벳을 유도해 레이즈를 노리는 체크';
    if (s === 'air') return '리버, 맞은 게 없어 체크, 블러프는 상대가 자주 접을 때만';
    return '리버, 쇼다운 가치가 있어 체크로 싸게 확인';
  }

  // proThought에서 레인지를 볼 상대: 마지막 레이저 → 프리플랍 공격자 → 살아 있는 첫 상대
  function _proOpp(state, raiser) {
    if (raiser) return raiser;
    var folded = state.folded || {};
    var pa = state.pfAggressor;
    if (pa && pa !== 'Hero' && !folded[pa] && state.players && state.players[pa]) return pa;
    var names = state.names || Object.keys(state.players || {});
    return names.filter(function(n) { return n !== 'Hero' && !folded[n]; })[0] || null;
  }

  // proThought(state, heroPos, eq, toCall, pot) → { range, hand, plan, keys:{range,hand,plan}, odds, street, examples }
  function proThought(state, heroPos, eq, toCall, pot) {
    toCall = toCall || 0; pot = pot || 0; eq = eq || 0;
    var hide = !!state.hideTypes;
    var odds = toCall > 0 ? toCall / (pot + toCall) : 0;
    var oddsPct = Math.round(odds * 100), eqPct = Math.round(eq * 100);
    var board = state.board || [];
    var hero = state.heroCards || [];
    var raiser = state.lastRaiser && state.lastRaiser !== 'Hero' ? state.lastRaiser : null;
    var rp = raiser && state.players && state.players[raiser];
    var rtype = (!hide && rp) ? rp.type : null;
    var keys = {}, range, hand, plan;
    var preflop = board.length < 3 || state.street === 'preflop';
    var opp = _proOpp(state, raiser);
    var oppP = opp && state.players && state.players[opp];
    var oppType = (!hide && oppP) ? oppP.type : null;
    var rg = opp ? _rangeOf(state, opp, oppType) : null;        // 유형을 알면 그 캐릭터 표
    var rgChart = opp ? _rangeOf(state, opp, null) : null;      // 이 앱 차트 표
    var exSeed = _hash(_cardsKey(board) + '|' + (opp || '') + '|' + _cardsKey(hero));
    var examples = [];

    if (preflop) {
      var facing3 = typeof Gto !== 'undefined' && (Gto.isFacing3bet(state) || Gto.isFacing4bet(state));
      var sbc = state.streetBetCount || 0;
      if (facing3 || (raiser && sbc >= 2)) {
        keys.range = 'strong'; range = '상대 레인지: 3벳 이상은 강한 손 위주 (프리미엄 비중 높음)';
        if (rg && raiser) examples = rangeExamples(rg.arr, { dead: hero, seed: exSeed });
      } else if (raiser && (state.currentBet || 0) > (state.bigBlind || 1)) {
        // 오픈 레인지는 넓이로 읽는다(포지션마다 다르다): 상위 15% 이하 좁고 강함, 35% 이상 넓고 약함, 그 사이 중간.
        //   유형이 보이면 그 캐릭터 엔진 표(VillainProfiles, 실제로 그 표로 연다), 은닉이거나 표가 없으면 이 앱 차트(GTO_RANGES).
        //   예) TAG UTG 약 8%는 강함, LAG BTN 약 38%는 약함. 퍼센트를 못 재면 예전처럼 유형으로만 정한다.
        var openRg = (rg && rg.src === 'profile') ? rg : rgChart;
        var pct = (openRg && typeof Coach !== 'undefined' && Coach.rangePct) ? Math.round(Coach.rangePct(openRg.arr) * 100) : 0;
        if (pct > 0) keys.range = pct <= 15 ? 'strong' : pct >= 35 ? 'weak' : 'medium';
        else if (hide) keys.range = 'medium';
        else keys.range = (rtype === 'Nit' || rtype === 'Fish' || rtype === 'Station') ? 'strong' : rtype === 'LAG' ? 'weak' : 'medium';
        var lead = hide ? '성향은 모르니 '
          : keys.range === 'strong' && rtype === 'Nit' ? '타이트해서 '
          : keys.range === 'strong' && (rtype === 'Fish' || rtype === 'Station') ? '레이즈가 드문 사람이라 '
          : keys.range === 'weak' && rtype === 'LAG' ? '넓게 여는 사람이라 ' : '';
        var size = pct > 0 ? ((openRg.src === 'chart' ? '이 앱 차트 기준 ' : '') + '상위 약 ' + pct + '%로 ') : '';
        range = '상대 레인지: ' + (rp && rp.pos ? rp.pos + ' ' : '') + ((openRg && openRg.label) || '오픈 레인지') + ', ' + lead + size +
          (keys.range === 'strong' ? '좁고 강함' : keys.range === 'weak' ? '넓고 약한 손 많음' : '중간');
        if (openRg) examples = rangeExamples(openRg.arr, { dead: hero, seed: exSeed });
      } else { keys.range = 'weak'; range = '상대 레인지: 아직 레이즈 없음, 남은 플레이어 레인지는 넓고 약함'; }
      var g = preflopGrade(hero);
      keys.hand = { premium: 'value', good: 'medium', spec: 'draw', weak: 'air' }[g];
      hand = '내 손: ' + GRADE_KOR[g] + ' 등급' + (heroPos ? ', 포지션 ' + heroPos : '');
      var hint = (typeof Gto !== 'undefined' && Gto.preflopHint) ? Gto.preflopHint(state, heroPos) : null;
      var act = hint ? hint.action : (toCall > 0 && eq < odds ? 'fold' : 'call');
      if (act === 'raise') keys.plan = keys.hand === 'value' || keys.hand === 'medium' ? 'value' : 'bluff';
      else if (act === 'fold') keys.plan = 'fold';
      else keys.plan = 'control';
      plan = '의도: ' + _label('plan', keys.plan) + (hint ? ' (GTO 차트: ' + hint.label + ')' : '');
    } else {
      var pst = _boardStreet(board, state.street);
      var s = strength(hero, board);
      var wet = _isWet(board);
      var grades = null;
      if (toCall > 0) {
        // 상대 벳 크기 = 콜 금액 ÷ (이 스트리트 시작 팟). pot은 이번 스트리트에 들어온 돈(상대 벳, 먼저 콜한 사람 몫)을
        // 포함하므로 playerBets 합을 뺀다(멀티웨이에서 콜한 사람 몫까지 팟으로 세면 큰 벳을 작게 잰다).
        // 레이즈(이 스트리트 두 번째 공격, 또는 내가 이미 낸 돈이 있는데 더 내라는 상황)는 큰 벳처럼 강한 손 비중이 높다.
        var pb = state.playerBets || {}, streetIn = 0;
        Object.keys(pb).forEach(function(n) { streetIn += Number(pb[n]) || 0; });
        if (streetIn < toCall) streetIn = toCall;
        var potStart = pot - streetIn;
        var facingRaise = (state.streetBetCount || 0) >= 2 || (Number(pb.Hero) || 0) > 0;
        var big = facingRaise || (potStart > 0 ? toCall / potStart >= 0.6 : true);
        // 블러프가 드문 유형(Nit, Fish, Station)의 벳은 강한 손 위주(엔진 bluff_freq 0.05, Fish와 Nit의 벳은 강한 손이 가장 많다)
        if (hide) keys.range = big ? 'strong' : 'medium';
        else keys.range = (big || rtype === 'Nit' || rtype === 'Station' || rtype === 'Fish') ? 'strong' : rtype === 'LAG' ? 'weak' : 'medium';
        range = '상대 레인지: ' + (raiser ? raiser + (rtype && rtype !== 'Mixed' ? '(' + rtype + ')' : '') + '의 ' : '') +
          (facingRaise ? '레이즈, 강한 손 비중 높음'
            : big ? '큰 벳, 강한 손 비중 높음'
            : keys.range === 'strong' ? '벳, 블러프가 드문 성향이라 강한 손 위주'
            : keys.range === 'weak' ? '벳이지만 블러프가 많은 성향'
            : '벳 레인지, 밸류와 블러프 섞인 중간');
        grades = keys.range === 'strong' ? ['strong'] : keys.range === 'weak' ? ['weak', 'air'] : ['medium'];
      } else {
        keys.range = 'medium';
        range = '상대 레인지: 아직 벳 없음, 넓은 중간 레인지';
      }
      if (rg) examples = rangeExamples(rg.arr, { board: board, dead: hero, grades: grades, seed: exSeed });
      keys.hand = (s === 'nut' || s === 'strong') ? 'value' : (s === 'medium' || s === 'weak-pair') ? 'medium' : s === 'draw' ? 'draw' : 'air';
      hand = '내 손: ' + _label('hand', keys.hand) + ' (' + (wet ? '웻보드' : '드라이보드') + ', 에쿼티 ' + eqPct + '%)';
      var gd = (typeof PostflopGuide !== 'undefined') ? PostflopGuide.guide(state) : null;
      var ga = gd ? gd.action : (keys.hand === 'value' ? 'bet' : toCall > 0 ? 'call' : 'check');
      if (ga === 'bet' || ga === 'raise') keys.plan = keys.hand === 'value' || keys.hand === 'medium' ? 'value' : 'bluff';
      else if (ga === 'fold') keys.plan = 'fold';
      else keys.plan = 'control';
      var why = pst === 'river' ? _riverWhy(ga, s) : (gd ? _clean(gd.reason) : '');
      // 팟 오즈 판정: 벳을 마주했고 밸류 손이 아니면 에쿼티 vs 필요 승률로 결론
      if (toCall > 0 && keys.hand !== 'value') {
        if (eq < odds) { keys.plan = 'fold'; why = '에쿼티 ' + eqPct + '% < 필요 ' + oddsPct + '%, 팟 오즈 안 맞음'; }
        else if (keys.plan === 'fold') { keys.plan = 'control'; why = '에쿼티 ' + eqPct + '% ≥ 필요 ' + oddsPct + '%, 팟 오즈 맞아서 콜'; }
      }
      plan = '의도: ' + _label('plan', keys.plan) + (why ? ' (' + why + ')' : '');
    }
    range += _exampleTail(examples);
    if (preflop && toCall > 0) plan += ', 필요 승률 ' + oddsPct + '% / 내 에쿼티 ' + eqPct + '%';
    return { range: range, hand: hand, plan: plan, keys: keys, odds: odds, street: state.street, examples: examples };
  }

  // gradeHeroThought(choice, pro) → { steps:[{step,title,chosen,pro,match}], matched, total, feedback }
  function gradeHeroThought(choice, pro) {
    choice = choice || {};
    var steps = [], matched = 0;
    ['range', 'hand', 'plan'].forEach(function(k) {
      if (!choice[k]) return;
      var m = choice[k] === pro.keys[k];
      if (m) matched++;
      steps.push({ step: k, title: STEP_TITLE[k], chosen: _label(k, choice[k]), pro: _label(k, pro.keys[k]), match: m });
    });
    var miss = steps.filter(function(s) { return !s.match; })[0];
    var feedback = steps.length === 0 ? '선택 없음'
      : !miss ? '✅ 프로와 같은 생각! (' + matched + '/' + steps.length + ')'
      : '❌ ' + miss.title + ': 프로는 "' + miss.pro + '" 쪽. ' + pro[miss.step];
    return { steps: steps, matched: matched, total: steps.length, feedback: feedback };
  }

  var api = {
    villainThought: villainThought, proThought: proThought, heroThoughtOptions: heroThoughtOptions,
    gradeHeroThought: gradeHeroThought, preflopGrade: preflopGrade, strength: strength,
    readOf: readOf, truthGrade: truthGrade, rangeExamples: rangeExamples, comboText: comboText,
    INTENT_KOR: INTENT_KOR, STREET_KOR: STREET_KOR, READ_KOR: READ_KOR, CONF_KOR: CONF_KOR, TRUTH: TRUTH,
    POOLS: { preflop: PF, postflop: PO, read: READ_POOLS }, TAILS: TAILS, NEUTRAL_TAIL: NEUTRAL_TAIL, TAIL_GROUPS: TAIL_GROUPS, READ_TABLE: READ_TABLE, READ_KEYS: READ_KEYS,
    _tone: _tone, _rangeOf: _rangeOf
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
