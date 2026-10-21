// engine/thinking.js, WP8: 띵킹 프로세스 모드 (속마음 중계). M4-P3 개편(계약 T5는 theater/theater-core.js 머리 주석)
// 순수 함수만 (DOM 없음, Math.random 없음). 강도/텍스처는 Villain._handStrength / _isBoardWet / PostflopGuide 재사용.
//   villainThought(state, name, action, amount, opts) → { name, street, text('💭 이름: ' 접두), intent, conf, body, tail,
//     calc{toCall, pot, need} }. conf는 'high'|'mid'|'low'(CONF_KOR).
//     opts.snapshot{potBefore, currentBetBefore, haveBefore}(또는 그 필드를 가진 액션 객체 자체)가 있으면
//     toCall = currentBetBefore - haveBefore, 팟 = potBefore로 계산한다.
//     대사 변형은 opts.rnd가 있으면 그것으로, 없으면 (이름, 스트리트, 보드, 액션, 홀카드, 핸드 번호) 해시로 고른다.
//     같은 입력이면 같은 문장이다. 리버에는 '드로우' 문구를 쓰지 않는다(스트리트 분기).
//     opts.label('올인')이면 액션 낱말이 올인. opts.plan{key, kor, step}(M6-MINI, 극장 코어만 넘긴다)이면 포스트플랍의 계획 걸음
//     (PLAN_STEP)에서 계획에 맞는 문장과 꼬리표 '(계획 이름)'을 쓰고 반환에 plan(계획키)을 더한다. 없으면 기존 문장 그대로.
//   readOf(reader, target, state, opts{action, amount, label?, snapshot?, table?, prev?}) → { grade, text, conf, examples } | null
//     grade는 'strong'|'medium'|'weak'|'air'(T5 4단계, 보드 3장 미만이면 null). 상대 유형 + 액션으로 추정한다.
//     opts.table === 'theater'면 극장 계획 AI 실측 표(THEATER_READ, M5-THEATER)를 쓰고 확신이 낮은 장면은 null이다.
//     없으면 게임 엔진 빌런 기준 표(READ_TABLE) 그대로다.
//   truthGrade(hole, board): T5 대응(nut, strong → strong / medium → medium / weak-pair, draw → weak / air → air).
//   rangeExamples(arr, opts) → 대표 조합 문자열(말 이름 + 기호, 예 '에이스퀸 A♠Q♦'). 엔진 표(GTO_RANGES)를 Range로 펼치고
//     보드와 죽은 카드에 겹치는 조합은 뺀다. 보드가 있으면 진실 등급으로 거른다.
//   state.hideTypes면 말버릇은 중립이고 유형에 기대는 문구와 판단(proThought의 rtype 포함)을 쓰지 않는다.
//   좌석 이름이 캐스트(전역 CAST, typeof 가드)면 그 캐릭터의 tail(포기할 때는 tailGiveUp) 말버릇을 쓴다.
var Thinking = (function() {
  var RANKS = '23456789TJQKA';
  var INTENT_KOR = {
    value: '밸류', bluff: '블러프', semibluff: '세미블러프', 'pot-control': '팟컨트롤',
    'call-odds': '팟 오즈 콜', 'give-up': '포기', trap: '함정',
    curious: '찍어 보는 콜'   // M7 TH-05: 맞은 게 없는데 호기심이나 감으로 받는 콜(팟 오즈로 정당화되는 콜이 아님)
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

  // 다음 1장으로 스트레이트 이상이 되는 카드의 비율(정수 %). 레슨 s2-07 아웃츠와 같은 정의(lessons/lesson-core.js outsOf):
  //   남은 덱 중 한 장이 더해져 스트레이트 이상이 되는 카드, 턴 보드(4장)에 리버를 더한 5장만으로 같은 족보면(보드 플레이) 뺀다.
  //   보드 3~4장이 아니거나 이미 스트레이트 이상이면 null. 드로우 콜 속마음의 '필요 승률 vs 바로 맞을 확률' 비교에 쓴다(M7 TH-04).
  //   toEnd(올인을 받는 콜)이고 플랍이면 턴과 리버 두 장 중 한 장이라도 맞을 확률 1 - (1 - o/n)(1 - o/(n-1))(레슨 s2-07 '2장' 정확값과 같은 식).
  var _STRAIGHT = 6;
  function _hitPct(hole, board, toEnd) {
    if (typeof HandEval === 'undefined' || !HandEval || !hole || hole.length < 2 || !board || (board.length !== 3 && board.length !== 4)) return null;
    var known = hole.concat(board), cur = HandEval.evaluate(known);
    if (!cur || cur.type <= _STRAIGHT) return null;
    var used = {}, outs = 0, unseen = 0, i, j;
    known.forEach(function(c) { used[_cardKey(c)] = true; });
    for (i = 0; i < RANKS.length; i++) for (j = 0; j < SUITS.length; j++) {
      var c = { rank: RANKS.charAt(i), suit: SUITS[j] };
      if (used[_cardKey(c)]) continue;
      unseen++;
      var ev = HandEval.evaluate(known.concat([c]));
      if (!ev || ev.type > _STRAIGHT) continue;
      if (board.length + 1 >= 5) {
        var bv = HandEval.evaluate(board.concat([c]));
        if (bv && HandEval.compareHands(ev, bv) === 0) continue;
      }
      outs++;
    }
    if (!unseen) return null;
    var p = outs / unseen;
    if (toEnd && board.length === 3 && unseen > 1) p = 1 - (1 - outs / unseen) * (1 - outs / (unseen - 1));
    return Math.round(p * 100);
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
    // M7 TH-03: 프리미엄 손의 일반 콜(극장 계획의 슬로플레이 플랫이 아닌 것). 함정이 아니라 팟을 적당히 유지하는 콜
    callPremium: [
      function(c) { return c.gk + ' 손이지만 여기선 콜. 더 올리면 약한 손은 접고 더 센 손만 남아.'; },
      function(c) { return c.gk + ' 손, 레이즈 대신 콜로 팟을 적당히 유지하자.'; },
      '좋은 손이지만 지금 올리면 상대 레인지만 좁아져. 콜로 플랍을 본다.'
    ],
    // M7 TH-02: 올인을 마주한 콜(더 걸 칩도 숨길 것도 없다)
    callAllin: [
      function(c) { return '올인이다. ' + c.gk + ' 손이면 받아야지. 콜.'; },
      function(c) { return _ro(c.gk + ' 손') + ' 올인도 받는다. 앞서 있을 때가 많아.'; },
      function(c) { return c.gk + ' 손. 올인이지만 이 정도면 콜이야.'; }
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
      // M7 TH-07: '이길 때가 많아'는 강한 손(셋, 스트레이트, 플러시 이상)일 때만. 탑페어 같은 중간 손은 더 약한 손이 받아 줘야 이득
      function(c) { return c.made ? _ro(c.h) + ' 마지막 ' + c.aw + '. 쇼다운까지 가면 내가 이길 때가 많아.'
        : _ro(c.h) + ' 마지막 ' + c.aw + '. 더 약한 손이 받아 주면 이득, 더 센 손이면 어쩔 수 없어.'; },
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
    // M7 TH-02: 강한 손으로 올인을 받는 콜. 더 받아낼 스트리트도, 숨기거나 레이즈할 선택도 없다(함정 문장 금지)
    callAllin: [
      function(c) { return '올인이다. ' + _j(c.h, '이면', '면') + ' 앞서 있을 때가 많아. 콜.'; },
      function(c) { return _ro(c.h) + ' 올인을 받는다. 더 걸 칩이 없으니 이 콜이 곧 밸류야.'; },
      function(c) { return c.h + '. 올인 콜, 이제는 카드가 정한다.'; }
    ],
    callAllinRiver: [
      function(c) { return '리버 올인이다. ' + _j(c.h, '이면', '면') + ' 앞서 있을 때가 많아. 콜.'; },
      function(c) { return _ro(c.h) + ' 올인을 받는다. 마지막 카드까지 왔으니 쇼다운이야.'; },
      function(c) { return '올인이다. ' + c.h + ', 숨길 것도 없이 그냥 콜.'; }
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
    // M7 TH-04: 필요 승률이 다음 1장으로 맞힐 확률(c.hit, 레슨 아웃츠와 같은 정의)보다 높으면 '가격이 괜찮다'고 말하지 않는다.
    //   그때는 맞으면 크게 받아낼 거라는 기대(임플라이드 오즈)로 콜한다고 쉬운 말로 풀어 준다.
    callDrawFlop: [
      function(c) { return (c.need && c.hit != null && c.need <= c.hit) ? c.h + ' 남았어. 필요 승률 ' + c.need + '%라 콜하고 다음 카드 보자.' : null; },
      function(c) { return _ro(c.h) + ' 콜. 맞으면 크게 이길 수 있어.'; },
      function(c) { return c.hit != null && c.need && c.need <= c.hit ? '아직 미완성 ' + c.h + '. 가격이 괜찮으니 따라간다.' : '아직 미완성 ' + c.h + '. 다음 카드에 맞으면 크게 받아낼 수 있으니 따라간다.'; },
      function(c) { return (c.need && c.hit != null && c.need > c.hit) ? c.h + '. 필요 승률 ' + c.need + '%인데 바로 맞을 확률은 ' + c.hit + '%쯤이라 가격은 비싸. 맞으면 크게 받는다고 보고 콜.' : null; }
    ],
    callDrawTurn: [
      function(c) { return (c.need && c.hit != null && c.need <= c.hit) ? '리버 한 장 남았어. ' + _ro(c.h) + ' 필요 승률 ' + c.need + '%면 콜.' : null; },
      function(c) { return c.hit != null && c.need && c.need <= c.hit ? c.h + ', 한 장에 맞혀야 해. 가격 보고 콜.' : c.h + ', 한 장에 맞혀야 해. 맞으면 크게 받는다고 보고 콜.'; },
      function(c) { return '턴에서도 ' + c.h + '. 마지막 카드 하나 보자. 콜.'; },
      function(c) { return (c.need && c.hit != null && c.need > c.hit) ? '리버 한 장 남았어. ' + c.h + ', 필요 승률 ' + c.need + '%인데 맞힐 확률은 ' + c.hit + '%쯤이라 비싼 콜이야. 맞으면 크게 받는다고 보고 콜.' : null; }
    ],
    // M7 리뷰(TH-04 후속): 올인을 받는 드로우 콜. 더 받아낼 칩이 없어 '맞으면 크게 받는다'는 말이 성립하지 않는다.
    //   레슨 s2-07처럼 올인이면 남은 카드 전부(플랍이면 턴과 리버 두 장)로 맞힐 확률 c.hit과 필요 승률 c.need만 견준다.
    //   c.left는 '남은 두 장에'(플랍) 또는 '리버 한 장에'(턴). 가격이 맞으면(c.need <= c.hit) 이 풀, 아니면 callDrawAllinPricey
    callDrawAllin: [
      function(c) { return (c.need && c.hit != null) ? '올인이다. ' + c.h + ', ' + c.left + ' 맞힐 확률 ' + c.hit + '%쯤이라 필요 승률 ' + c.need + '%보다 높아. 콜.' : null; },
      function(c) { return c.hit != null ? _ro(c.h) + ' 올인을 받는다. 더 받아낼 칩은 없지만 ' + c.left + ' 맞힐 확률 ' + c.hit + '%쯤이면 가격은 맞아.' : null; },
      function(c) { return c.need ? '올인 콜. 이제 ' + _j(c.h, '이', '가') + ' 맞느냐에 달렸어. 필요 승률 ' + c.need + '%면 해 볼 만해.' : null; }
    ],
    // 올인을 받는데 가격이 안 맞는 드로우 콜: 팟 오즈로 정당화되는 콜이 아니라 찍어 보는 콜(의도 curious)
    callDrawAllinPricey: [
      function(c) { return (c.need && c.hit != null) ? '올인이다. ' + c.h + ', ' + c.left + ' 맞힐 확률은 ' + c.hit + '%쯤인데 필요 승률은 ' + c.need + '%. 비싸지만 한번 걸어 본다.' : null; },
      function(c) { return _ro(c.h) + ' 올인을 받는다. 더 받아낼 칩도 없고 가격도 비싸지만 맞으면 이 팟을 가져온다.'; },
      function(c) { return '가격은 안 맞아. 그래도 ' + c.h + '에 걸어 본다. 올인 콜.'; }
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
    ],
    // ── 아래는 극장 계획 걸음 전용(PLAN_STEP, M6-MINI). 게임 경로는 쓰지 않는다 ──
    // 체크해 두었다가 벳을 맞고 올리는 순간(체크레이즈 함정 발동)
    springTrap: [
      function(c) { return '기다리던 벳이 왔어. ' + _j(c.h, '이니', '니') + ' 이제 ' + _ro(c.aw) + ' 키운다.'; },
      function(c) { return '체크해 둔 보람이 있네. ' + _ro(c.h) + ' ' + c.aw + '.'; },
      function(c) { return '걸렸어. ' + c.h + ', 이제 숨기지 않고 ' + _ro(c.aw) + ' 간다.'; }
    ],
    // 슬로플레이로 숨기다 리버에서 꺼내는 순간
    springSlow: [
      function(c) { return '여기까지 조용히 숨겼어. 이제 ' + _ro(c.h) + ' ' + c.aw + '.'; },
      function(c) { return '숨겨 둔 ' + _j(c.h, '을', '를') + ' 꺼낼 때야. ' + c.aw + '.'; },
      function(c) { return '끝까지 약한 척했으니 상대는 모를 거야. ' + _ro(c.h) + ' ' + c.aw + '.'; }
    ],
    // M7 TH-06: 밸류 극대화 계획이 강한 손으로 벳을 맞고 레이즈 대신 콜하는 걸음(슬로플레이 함정 문장이 아니라 '더 받아내려고 지금은 콜')
    callValueWait: [
      function(c) { return _j(c.h, '이라', '라') + ' 이번엔 콜. 상대가 계속 쳐 주면 그게 더 큰 밸류야.'; },
      function(c) { return _ro(c.h) + ' 콜. 레이즈는 다음 스트리트에 더 크게.'; },
      function(c) { return '지금 올리면 접을 손도 한 번 더 치게 두자. ' + _ro(c.h) + ' 콜.'; }
    ],
    callValueWaitRiver: [
      function(c) { return '리버, ' + _j(c.h, '이라', '라') + ' 콜. 레이즈하면 더 약한 손은 다 접을 거야.'; },
      function(c) { return _ro(c.h) + ' 쇼다운까지 간다. 더 약한 손이 따라오게 두는 것도 밸류야.'; },
      function(c) { return '마지막 카드까지 왔어. ' + _ro(c.h) + ' 받으면 충분히 이겨.'; }
    ],
    // 블러프캐치: 먼저 치지 않고 상대 벳을 받을 생각
    checkCatch: [
      function(c) { return _ro(c.h) + ' 먼저 치진 않아. 상대가 치면 받아 줄 생각이야.'; },
      function(c) { return '체크로 넘기자. 저 사람이 블러프로 치면 ' + _ro(c.h) + ' 잡는다.'; },
      '내가 치면 더 좋은 손만 따라와. 체크하고 상대 벳을 기다린다.'
    ],
    checkCatchRiver: [
      function(c) { return '리버, ' + _ro(c.h) + ' 먼저 치진 않아. 상대가 치면 받는다.'; },
      '마지막까지 체크로 기다린다. 블러프가 나오면 잡는다.',
      function(c) { return _j(c.h, '이라', '라') + ' 벳하면 더 좋은 손만 받아. 체크하고 블러프를 기다린다.'; }
    ],
    callCatch: [
      function(c) { return '저 사람 블러프가 많아. ' + _ro(c.h) + ' 받는다.'; },
      function(c) { return c.need ? '블러프만 이기면 돼. 필요 승률 ' + c.need + '%라 ' + _ro(c.h) + ' 콜.' : null; },
      function(c) { return _ro(c.h) + ' 끝까지 본다. 쳐도 따라간다.'; }
    ],
    callCatchRiver: [
      function(c) { return '리버에서도 받는다. 블러프라면 ' + _j(c.h, '이', '가') + ' 이긴다.'; },
      function(c) { return c.need ? '필요 승률 ' + c.need + '%. 블러프가 그만큼만 섞여 있어도 콜이 맞아.' : null; },
      function(c) { return '여기까지 따라왔으니 ' + _ro(c.h) + ' 쇼다운까지 간다.'; }
    ],
    // 팟컨트롤의 작은 벳
    smallBet: [
      function(c) { return _ro(c.h) + ' 작게 한 번. 팟을 크게 키울 손은 아니야.'; },
      function(c) { return '작은 벳으로 싸게 정리하자. ' + _j(c.h, '은', '는') + ' 큰 팟이 부담스러워.'; },
      function(c) { return c.h + ', 작게 쳐서 약한 손만 접게 하자.'; }
    ],
    // 포기 계획의 체크(손이 있어도 더 넣지 않는다)
    checkGiveUp: [
      function(c) { return _ro(c.h) + '는 여기서 더 넣지 않아. 체크.'; },
      '이번 팟은 욕심내지 않는다. 체크.',
      function(c) { return '여기선 접을 준비. ' + _ro(c.h) + ' 돈을 더 쓰지 않는다. 체크.'; }
    ],
    checkGiveUpRiver: [
      function(c) { return '리버, ' + _ro(c.h) + '는 더 넣지 않아. 체크.'; },
      '마지막 카드까지 왔지만 욕심내지 않는다. 체크.',
      function(c) { return _ro(c.h) + ' 여기서 돈을 더 쓰지 않는다. 체크하고 끝내자.'; }
    ],
    // 벳폴드: 내 벳에 레이즈가 와서 계획대로 접는다
    foldPlan: [
      '한 번 쳤으니 됐어. 반격이 왔으니 계획대로 접는다.',
      function(c) { return _ro(c.h) + ' 레이즈까지 받을 순 없어. 폴드.'; },
      '내 벳에 레이즈가 왔어. 여기서 버티면 손해야. 접는다.'
    ]
  };

  // ── 극장 계획 걸음 → 속마음(M6-MINI, 로드맵 M4 남은 것 3, 결정 14) ──
  // opts.plan = { key, kor, step }은 극장 코어가 극장 AI가 계획대로 둔 걸음(theater/cast-ai.js RUN의 step)일 때만 넘긴다.
  // 포스트플랍에서 아래 표의 걸음이고 액션 갈래(act)가 맞으면 그 계획에 맞는 문장 풀과 의도를 쓰고 괄호 꼬리표를 계획 이름으로 한다
  //   (예: 체크레이즈 함정의 체크가 '(팟컨트롤)'이 아니라 '체크로 숨기자 ... (체크레이즈 함정)'). 표에 없는 걸음(엔진 폴백, c벳,
  //   계획 밖의 콜과 폴드 등), 프리플랍, opts.plan이 없으면 기존 규칙 그대로다(게임 문구 불변, j-thinking 17).
  //   값 { act: 'check'|'call'|'aggro'|'fold', intent, pool: 풀 이름 | fn(s, pst, ctx) → 풀 이름|null(null이면 기존 규칙),
  //        gen: true면 문장은 기존 규칙(그 의도가 keep 목록일 때만 계획 꼬리표), tag: 꼬리표 뒤에 붙는 말(예 '멈춤') }
  function _riv(name) { return function(s, pst) { return pst === 'river' ? name + 'River' : name; }; }
  function _valuePool(s, pst, x) { return pst === 'river' ? 'valueRiver' : (x.wet ? 'valueWet' : 'valueDry'); }
  var _HAS_HAND = { nut: true, strong: true, medium: true, 'weak-pair': true };
  var PLAN_STEP = {
    'trap-check': { act: 'check', intent: 'trap', pool: _riv('checkTrap') },
    'trap-call': { act: 'call', intent: 'trap', pool: _riv('callTrap') },
    'trap-raise': { act: 'aggro', intent: 'trap', pool: 'springTrap' },
    'slow-check': { act: 'check', intent: 'trap', pool: _riv('checkTrap') },
    'slow-call': { act: 'call', intent: 'trap', pool: _riv('callTrap') },
    'slow-spring': { act: 'aggro', intent: 'trap', pool: 'springSlow' },
    'bc-check': { act: 'check', intent: 'pot-control', pool: _riv('checkCatch') },
    'bc-call': { act: 'call', intent: 'call-odds', pool: _riv('callCatch') },
    'vm-bet': { act: 'aggro', intent: 'value', pool: _valuePool },
    'vm-raise': { act: 'aggro', intent: 'value', pool: _valuePool },
    'vm-reraise': { act: 'aggro', intent: 'value', pool: _valuePool },
    // M7 TH-06: 강한 손의 콜은 '밸류' 문장(함정 문장에 '밸류 극대화' 꼬리표가 붙던 모순 제거). 중간 손은 기존 규칙 그대로(pool이 null이면 gen으로)
    'vm-call': { act: 'call', intent: 'value', pool: function(s, pst) { return (s === 'nut' || s === 'strong') ? _riv('callValueWait')(s, pst) : null; },
      gen: true, keep: { trap: true, 'call-odds': true } },
    'bf-bet': { act: 'aggro', intent: 'value', pool: function(s, pst, x) { return _HAS_HAND[s] && s !== 'weak-pair' ? _valuePool(s, pst, x) : null; } },
    'bf-fold': { act: 'fold', intent: 'give-up', pool: function(s, pst, x) { return x.bet ? 'foldPlan' : null; } },
    'pc-small': { act: 'aggro', intent: 'pot-control', pool: function(s) { return _HAS_HAND[s] ? 'smallBet' : null; } },
    'pc-thin': { act: 'aggro', intent: 'value', pool: function(s, pst) { return pst === 'river' && _HAS_HAND[s] ? 'valueRiver' : null; } },
    'pc-check': { act: 'check', intent: 'pot-control', pool: function(s, pst) { return _HAS_HAND[s] ? (pst === 'river' ? 'checkMidRiver' : 'checkMid') : null; } },
    'pc-call': { act: 'call', intent: 'call-odds', pool: function(s, pst) { return _HAS_HAND[s] ? (pst === 'river' ? 'callMidRiver' : 'callMid') : null; } },
    'gu-check': { act: 'check', intent: 'give-up', pool: _riv('checkGiveUp') },
    'gu-fold': { act: 'fold', gen: true, keep: { 'give-up': true } },
    'barrel': { act: 'aggro', gen: true, keep: { bluff: true, semibluff: true } },
    'barrel-raise': { act: 'aggro', gen: true, keep: { bluff: true, semibluff: true } },
    'barrel-stop': { act: 'check', intent: 'give-up', tag: '멈춤', pool: function(s, pst) { return s === 'air' ? (pst === 'river' ? 'checkAirRiver' : 'checkAir') : (pst === 'river' ? 'checkGiveUpRiver' : 'checkGiveUp'); } },
    'sp-bet': { act: 'aggro', gen: true, keep: { semibluff: true, bluff: true } },
    'sp-raise': { act: 'aggro', gen: true, keep: { semibluff: true, bluff: true } },
    'sp-bluff': { act: 'aggro', gen: true, keep: { bluff: true } }
  };
  function _actGroup(a) {
    if (a === 'fold' || a === 'check' || a === 'call') return a;
    return _isAggro(a) ? 'aggro' : null;
  }
  // gen = 기존 규칙의 { intent, pool, conf } → 계획 걸음이면 { intent, pool, conf, label } | null(기존 그대로)
  function _planCase(pl, gen, s, action, pst, x) {
    var d = PLAN_STEP[pl.step];
    if (!d || d.act !== _actGroup(action)) return null;
    var label = String(pl.kor || pl.key || '');
    if (!label) return null;
    if (d.tag) label += ' ' + d.tag;   // 계획 안의 멈춤(3배럴 블러프 멈춤)
    // pool과 gen이 함께 있으면(vm-call) pool이 이름을 주는 손에서는 pool, 아니면 기존 규칙(gen)
    var pool = null;
    if (d.pool) {
      pool = typeof d.pool === 'function' ? d.pool(s, pst, x) : d.pool;
      if ((!pool || !PO[pool]) && !d.gen) return null;
    }
    if (d.gen && !(pool && PO[pool])) return d.keep && d.keep[gen.intent] ? { intent: gen.intent, pool: gen.pool, conf: gen.conf, label: label } : null;
    var made = s === 'nut' || s === 'strong';
    return { intent: d.intent, pool: pool, conf: d.intent === 'give-up' ? 'mid' : (made ? 'high' : 'mid'), label: label };
  }

  function _actWord(action, label) {
    if (action === 'allin' || label === '올인') return '올인';
    if (action === '3bet') return '3벳';
    if (action === 'raise') return '레이즈';
    return '벳';
  }

  // 올인을 마주했는가(M7 TH-02): 이 콜이 곧 내 올인(콜 금액이 내 스택 이상)이거나, 마지막으로 벳/레이즈한 상대의 스택이 0.
  //   state는 액션 직전 상태(극장 코어의 before, 게임의 액션 전 상태, 퍼즐 상태)라 stacks와 lastRaiser가 그 순간 값이다.
  function _facingAllin(state, name, toCall) {
    if (!(toCall > 0) || !state) return false;
    var st = state.stacks || {}, mine = st[name], lr = state.lastRaiser;
    if (typeof mine === 'number' && toCall >= mine - 1e-9) return true;
    return !!(lr && lr !== name && typeof st[lr] === 'number' && st[lr] <= 1e-9);
  }

  // 프리플랍 상황 → { intent, pool, conf }. x { flat: 극장 AI의 슬로플레이 플랫 걸음, allin: 올인 직면 }
  function _preflopCase(type, g, action, x) {
    x = x || {};
    if (action === 'fold') return { intent: 'give-up', pool: (g === 'premium' || g === 'good') ? 'foldGood' : 'foldWeak', conf: 'mid' };
    if (_isAggro(action)) {
      if (g === 'premium' || g === 'good') return { intent: 'value', pool: 'raiseValue', conf: g === 'premium' ? 'high' : 'mid' };
      if (g === 'spec') return { intent: action === '3bet' ? 'bluff' : 'semibluff', pool: 'raiseSpec', conf: 'low' };
      return { intent: 'bluff', pool: 'raiseWeak', conf: 'low' };
    }
    if (action === 'call') {
      // M7 TH-02, TH-03: 올인 직면 콜은 밸류, 프리미엄의 일반 콜은 팟컨트롤, 함정은 극장 AI가 일부러 슬로플레이 플랫을 한 걸음만
      if (g === 'premium') {
        if (x.allin) return { intent: 'value', pool: 'callAllin', conf: 'high' };
        if (x.flat) return { intent: 'trap', pool: 'callTrap', conf: 'high' };
        return { intent: 'pot-control', pool: 'callPremium', conf: 'mid' };
      }
      if (type === 'Fish' && g === 'weak') return { intent: 'call-odds', pool: 'callFish', conf: 'low' };
      return { intent: 'call-odds', pool: 'call', conf: 'mid' };
    }
    if (g === 'premium') return { intent: 'trap', pool: 'checkTrap', conf: 'high' };
    return { intent: 'pot-control', pool: 'check', conf: 'mid' };
  }

  // 포스트플랍 상황 → { intent, pool, conf }
  function _postflopCase(type, s, action, pst, wet, x) {
    x = x || {};
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
      // M7 TH-02: 올인을 받는 강한 손의 콜은 함정이 아니라 밸류(더 받아낼 스트리트도 레이즈할 선택도 없다)
      if (made && x.allin) return { intent: 'value', pool: river ? 'callAllinRiver' : 'callAllin', conf: 'high' };
      if (made) return { intent: 'trap', pool: river ? 'callTrapRiver' : 'callTrap', conf: 'high' };
      // M7 TH-05: 맞은 게 없는 콜은 '팟 오즈 콜'이 아니라 '찍어 보는 콜'(꼬리말 묶음은 기다림)
      if (s === 'air' && type === 'Fish') return { intent: 'curious', pool: 'callFishAir', conf: 'low' };
      if (s === 'air') return { intent: 'curious', pool: river ? 'callAirRiver' : 'callAir', conf: 'low' };
      // M7 리뷰: 올인을 받는 드로우는 남은 카드 전부로 맞힐 확률과 필요 승률만 견준다(가격이 맞으면 팟 오즈 콜, 아니면 찍어 보는 콜)
      if (s === 'draw' && x.allin) return x.priced ? { intent: 'call-odds', pool: 'callDrawAllin', conf: 'mid' } : { intent: 'curious', pool: 'callDrawAllinPricey', conf: 'low' };
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
      r = _preflopCase(type, g, action, { allin: action === 'call' && _facingAllin(state, name, toCall),
        flat: !!(opts.plan && typeof opts.plan === 'object' && opts.plan.step === 'pf-flat') });
      body = _fromPool(PF[r.pool], { gk: GRADE_ADJ[g], where: p.pos ? p.pos + '에서 ' : '', aw: aw }, pick);
    } else {
      var s = strength(hole, board);
      var wet = _isWet(board);
      var allin = action === 'call' && _facingAllin(state, name, toCall);
      var needPct = need > 0 ? Math.round(need * 100) : null;
      // 드로우 콜의 적중률: 올인이 아니면 다음 1장(TH-04), 올인이면 남은 카드 전부(M7 리뷰, 레슨 s2-07 x4와 x2 구분)
      var hit = (s === 'draw' && action === 'call' && pst !== 'river') ? _hitPct(hole, board, allin) : null;
      r = _postflopCase(type, s, action, pst, wet, { allin: allin, priced: needPct != null && hit != null && needPct <= hit });
      // 극장 계획 걸음이면 계획에 맞는 풀과 꼬리표(opts.plan은 극장 코어만 넘긴다)
      var pl = (opts.plan && typeof opts.plan === 'object' && opts.plan.step) ? opts.plan : null;
      if (pl) {
        var pc = _planCase(pl, r, s, action, pst, { wet: wet, bet: !!(snap && (snap.haveBefore || 0) > 0) });
        if (pc) r = pc;
      }
      var c = {
        h: _handTxt(hole, board, s),
        tex: pst === 'river' ? '' : (wet ? '보드에 드로우가 많아' : '보드가 드라이해서'),
        aw: aw, need: needPct,
        made: s === 'nut' || s === 'strong',
        hit: hit, left: board.length === 3 ? '남은 두 장에' : '리버 한 장에'
      };
      body = _fromPool(PO[r.pool], c, pick);
    }
    var tail = _tone(type, r.intent, pick, { hide: hide, name: name });
    var text = '💭 ' + name + ': ' + body + tail + ' (' + (r.label || INTENT_KOR[r.intent]) + ')';
    var out = { name: name, street: street, text: text, intent: r.intent, conf: r.conf,
      body: body, tail: tail, calc: { toCall: toCall, pot: pot, need: need } };
    if (r.label) out.plan = pl.key;   // 계획 걸음 문장(극장 전용)
    return out;
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
  // ── 극장 읽기 표(M5-THEATER, 로드맵 결정 사항 14번) ──
  // 극장(theater/theater-core.js)만 readOf(..., { table: 'theater', prev })로 쓴다. 위 READ_TABLE(게임 엔진 빌런 기준)은 그대로다.
  // 극장 계획 AI(theater/cast-ai.js)는 계획대로 함정과 블러프를 더 많이 해서 게임 표로 읽으면 은행 500편 읽기 3282건 중 60.5%가
  // 오독이었다. 그래서 극장 AI를 실제로 돌려 잰 표를 따로 둔다.
  //   실측(2026-10-21): 은행 500편(읽기 3282건)과 은행 밖 시드 100001~200000 중 드라마 점수 78 이상 574편(읽기 3743건)을
  //   합쳐 유형 x 읽기 키 x 스트리트마다 실제 강도(truthGrade) 분포를 쟀다. 칸 표본이 15개 미만이면 유형을 합친 같은 키와 스트리트
  //   (NEUTRAL 줄과 같음)를 쓴다. 칸의 가장 흔한 등급을 읽기로 쓰고, 그 비율이 45% 미만이면 읽지 않는다(readOf가 null, 극장에서는
  //   읽기 줄과 배지가 없다). 결과: 은행 읽기 약 78%만 남고 그중 오독 약 30%(은행 밖 같은 점수대 시드로 검증하면 약 34%).
  //   M7 재측정(2026-10-21, TH-01로 체크레이즈 함정이 탑페어와 오버페어에서 빠져 극장 AI가 바뀜): 같은 방법으로 새 은행 500편(읽기 3266건)과
  //   은행 밖 100001~200000 중 점수 78 이상 477편(읽기 3131건)을 다시 쟀다. 예전 표를 새 AI에 그대로 쓰면 이 표본에서 오독 31.8%(은행 60편 표본은
  //   35.5%로 한도 초과)였고, 새 표로는 읽는 비율 약 73%에 오독 약 27%다. 체크레이즈는 이제 강한 손이 대부분(플랍 S63~81)이라 읽기가 강함으로 모인다.
  //   유형, 액션, 크기, 스트리트, 같은 스트리트의 앞 액션까지 봐도 같은 장면에서 실제 손이 넓게 퍼져서(계획이 손을 숨긴다)
  //   모든 장면을 읽으면 오독이 36% 아래로 내려가지 않는다.
  // 읽기 키: allin, raise, betBig, betSmall, call(게임 표와 같은 뜻)에 같은 스트리트 앞 액션(opts.prev)으로 둘을 더 나눈다.
  //   checkraise = 이 스트리트에서 체크한 사람의 레이즈(올인 포함), betcall = 이 스트리트에서 벳이나 레이즈를 한 사람의 콜.
  // 칸 표기 '플랍 턴 리버': 첫 글자 S 강함, M 중간, W 약함, A 빈손. 대문자면 그 등급으로 읽고, 소문자면 읽지 않는다.
  //   숫자는 그 등급의 실측 비율(%)이다. 소문자는 비율이 45% 미만인 칸, 그리고 리버 체크레이즈(극장 AI에서는 3배럴 블러프만
  //   리버에 체크레이즈를 해서 빈손이 92%이지만 실전에서는 강한 손이 많은 줄이라 그렇게 가르치지 않는다).
  //   극장 AI(cast-ai, plans, cast)가 바뀌어 은행을 다시 만들면 이 표도 다시 잰다(tests/j-highlight.test.js 14가 은행 오독 비율을 본다).
  var THEATER_READ_KEYS = ['allin', 'checkraise', 'raise', 'betBig', 'betSmall', 'betcall', 'call'];
  var THEATER_STREETS = ['flop', 'turn', 'river'];
  var THEATER_MIN_P = 45;
  var THEATER_READ_SRC = {
    TAG: {
      allin: 'S67 S67 S91', checkraise: 'S79 S67 a90', raise: 's44 S81 S90', betBig: 'a35 S73 S96',
      betSmall: 'w36 m34 M100', betcall: 'w44 S59 S64', call: 'M53 s44 S66'
    },
    LAG: {
      allin: 'S67 S67 S66', checkraise: 'S74 S70 a94', raise: 's31 S81 S77', betBig: 's35 w42 S84',
      betSmall: 'A53 a44 M68', betcall: 'W62 W52 S75', call: 's33 S61 S49'
    },
    Fish: {
      allin: 'S67 S67 S90', checkraise: 'S63 S58 a90', raise: 'S50 S81 S94', betBig: 'W63 S66 S100',
      betSmall: 'W54 s44 M64', betcall: 'W58 S65 S83', call: 'm39 S45 S54'
    },
    Nit: {
      allin: 'S67 S67 S96', checkraise: 'S81 S86 a90', raise: 's44 S81 S100', betBig: 'W52 S81 S100',
      betSmall: 'M75 m34 M68', betcall: 'S53 S73 S88', call: 'S60 S79 S50'
    },
    Mixed: {
      allin: 'S67 S67 S84', checkraise: 'S75 S71 a87', raise: 's44 S81 S90', betBig: 'w43 w41 S94',
      betSmall: 'w44 m40 S65', betcall: 'W78 s43 S80', call: 'S46 S74 M53'
    },
    Station: {
      allin: 'S67 S67 S97', checkraise: 'S80 S65 a90', raise: 'w41 S81 S96', betBig: 'W77 S74 S100',
      betSmall: 'W71 M49 M76', betcall: 'W71 S54 S82', call: 'w40 s41 s43'
    },
    NEUTRAL: {
      allin: 'S67 S67 S86', checkraise: 'S74 S67 a90', raise: 's44 S81 S91', betBig: 'W52 S51 S95',
      betSmall: 'w43 m34 M68', betcall: 'W61 S53 S79', call: 'm37 S48 S50'
    }
  };
  var THEATER_LETTER = { S: 'strong', M: 'medium', W: 'weak', A: 'air' };
  // → { 유형: { 키: { flop|turn|river: { grade(읽지 않으면 null), guess(가장 흔한 등급), p(그 비율 %) } } } }
  function _parseTheaterRead(src) {
    var out = {};
    Object.keys(src).forEach(function(ty) {
      out[ty] = {};
      Object.keys(src[ty]).forEach(function(k) {
        var cells = String(src[ty][k]).split(/\s+/);
        out[ty][k] = {};
        THEATER_STREETS.forEach(function(st, i) {
          var c = cells[i] || '', ch = c.charAt(0), up = ch.toUpperCase();
          var g = THEATER_LETTER[up] || null;
          out[ty][k][st] = { grade: (g && ch === up) ? g : null, guess: g, p: Number(c.slice(1)) || 0 };
        });
      });
    });
    return out;
  }
  var THEATER_READ = _parseTheaterRead(THEATER_READ_SRC);
  // 극장 읽기 이유(유형 말 없이 액션과 스트리트로만, 등급 방향에 맞는 문장). cls: strong, medium, low(약함과 빈손).
  //   값이 문자열이면 모든 스트리트, 객체면 스트리트별(any는 나머지).
  var THEATER_WHY = {
    allin: { strong: '올인까지 밀었으니', medium: '올인이지만 맞은 손으로 버티며 밀 때가 많아서',
      low: '올인이지만 블러프로 밀 때도 있어서' },
    checkraise: { strong: '체크로 기다렸다가 레이즈했으니', medium: '체크했다가 올리는 건 맞은 손일 때가 많아서',
      low: { river: '쇼다운으로 못 이기는 손이 리버에서 쓰는 수일 때가 많아서', any: '체크했다가 올렸지만 드로우로 칠 때도 많아서' } },
    raise: { strong: { flop: '플랍부터 레이즈로 맞섰으니', turn: '턴에서 레이즈로 맞섰으니', river: '리버에서 레이즈로 맞섰으니' },
      medium: '레이즈는 맞은 손으로 할 때가 많아서', low: '레이즈지만 드로우나 블러프로 칠 때도 많아서' },
    betBig: { strong: { flop: '플랍부터 크게 걸었으니', turn: '턴에서 크게 걸었으니', river: '리버에서 크게 걸었으니' },
      medium: '크게 걸었지만 맞은 손을 지키려는 벳일 때가 많아서',
      low: { river: '리버에서 크게 거는 건 블러프일 때도 많아서', any: '크게 걸었지만 드로우로 밀 때가 많아서' } },
    betSmall: { strong: '작게 걸어 콜을 받아내려는 것 같아서',
      medium: { river: '리버에서 작게 거는 건 적당히 맞은 손일 때가 많아서', any: '작게 거는 건 적당히 맞은 손일 때가 많아서' },
      low: '아무 손으로나 칠 수 있는 크기라' },
    betcall: { strong: '레이즈를 받고도 따라왔으니', medium: '레이즈를 받고 콜만 했으니',
      low: { river: '레이즈를 받고 콜만 했으니', any: '걸었다가 레이즈를 받자 콜만 했으니' } },   // 앞 액션이 벳이든 레이즈든 맞는 말
    call: { strong: { flop: '플랍부터 조용히 따라왔으니', turn: '턴까지 따라왔으니', river: '리버까지 따라왔으니' },
      medium: '레이즈 대신 콜로 받았으니', low: '콜로만 따라오니' }
  };
  function _theaterWhy(key, grade, pst) {
    var w = THEATER_WHY[key];
    if (!w) return '';
    var v = w[(grade === 'strong' || grade === 'medium') ? grade : 'low'];
    if (v && typeof v === 'object') v = v[pst] || v.any || '';
    return v || '';
  }
  function _theaterConf(p) { return p >= 70 ? 'high' : p >= 55 ? 'mid' : 'low'; }

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

  // readOf(reader, target, state, opts{action, amount, label, snapshot, rnd, table?, prev?}) → { grade, text, conf, examples, key } | null
  //   key = 읽기 표의 액션 키(allin, raise, betBig, betSmall, bet, call, check, fold)
  //   opts.table === 'theater'면 극장 읽기 표(THEATER_READ)를 쓴다. opts.prev = 대상이 이 스트리트에서 먼저 한 액션들
  //   (예 ['check']). 그때 key는 checkraise, betcall일 수 있고, 표가 읽지 않는 칸이면 null이다. 반환에 table:'theater'와
  //   p(그 등급의 실측 비율 %)가 붙고, conf는 p로 정한다(70 이상 high, 55 이상 mid). 표에 없는 키(fold, check, 금액 없는 bet)는
  //   게임 표로 읽는다. 이유 문장은 유형 말 없이 액션과 스트리트로만 쓴다.
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
    var tcell = null;
    if (opts.table === 'theater') {
      var prev = Array.isArray(opts.prev) ? opts.prev : [];
      var tkey = key;
      if ((key === 'raise' || key === 'allin') && prev.indexOf('check') >= 0) {
        tkey = 'checkraise'; actTxt = key === 'allin' ? '체크 뒤 올인' : '체크레이즈';
      } else if (key === 'call' && prev.some(_isAggro)) tkey = 'betcall';
      var trow = THEATER_READ[type || 'NEUTRAL'];
      tcell = (trow && trow[tkey] && trow[tkey][pst]) || null;
      if (tcell) {
        if (!tcell.grade) return null;          // 실측 확신이 낮은 장면은 읽지 않는다
        key = tkey;
        grade = tcell.grade;
        why = _theaterWhy(tkey, grade, pst);
      }
    }
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
    var res = { grade: grade, text: body + _exampleTail(examples), conf: conf, examples: examples, key: key };
    if (tcell) { res.conf = _theaterConf(tcell.p); res.table = 'theater'; res.p = tcell.p; }
    return res;
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
      hand = '내 손: ' + _label('hand', keys.hand) + ' (' + (wet ? '웨트 보드' : '드라이 보드') + ', 에쿼티 ' + eqPct + '%)';
      var gd = (typeof PostflopGuide !== 'undefined') ? PostflopGuide.guide(state) : null;
      var ga = gd ? gd.action : (keys.hand === 'value' ? 'bet' : toCall > 0 ? 'call' : 'check');
      if (ga === 'bet' || ga === 'raise') keys.plan = keys.hand === 'value' || keys.hand === 'medium' ? 'value' : 'bluff';
      else if (ga === 'fold') keys.plan = 'fold';
      else if (gd && gd.alt === 'bet' && keys.hand === 'value') keys.plan = 'value';   // M7 CO-02: 주도권 없는 OOP 강한 패는 체크해서 받아내는 밸류 계획
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
    THEATER_READ: THEATER_READ, THEATER_READ_SRC: THEATER_READ_SRC, THEATER_READ_KEYS: THEATER_READ_KEYS,
    THEATER_STREETS: THEATER_STREETS, THEATER_MIN_P: THEATER_MIN_P, THEATER_WHY: THEATER_WHY, PLAN_STEP: PLAN_STEP,
    _tone: _tone, _rangeOf: _rangeOf
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
