// engine/thinking.js — WP8: 띵킹 프로세스 모드 (투머치포커식 속마음 중계)
// 순수 함수만 (DOM 없음). 강도/텍스처는 Villain._handStrength / _isBoardWet / PostflopGuide 재사용.
var Thinking = (function() {
  var RANKS = '23456789TJQKA';
  var INTENT_KOR = {
    value: '밸류', bluff: '블러프', semibluff: '세미블러프', 'pot-control': '팟컨트롤',
    'call-odds': '팟오즈 콜', 'give-up': '포기', trap: '함정'
  };
  var GRADE_KOR = { premium: '프리미엄', good: '좋음', spec: '투기적', weak: '약함' };
  var STREET_KOR = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
  var GRADE_ADJ = { premium: '프리미엄', good: '좋은', spec: '투기적인', weak: '약한' };

  // 받침 유무로 조사 선택: _j('페어', '이라', '라') → '페어라'
  function _j(word, withB, noB) {
    var c = word.charCodeAt(word.length - 1);
    var has = c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0;
    return word + (has ? withB : noB);
  }
  // 기존 모듈 사유 문구의 긴줄표/가운뎃점 → 쉼표 (UI 문구 규칙)
  function _clean(t) { return String(t || '').replace(/\s*—\s*/g, ', ').replace(/\s*·\s*/g, ', '); }

  function _ri(r) { return RANKS.indexOf(r); }
  function _isAggro(a) { return a === 'bet' || a === 'raise' || a === '3bet' || a === 'allin'; }

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

  // 포스트플랍 강도: nut/strong/medium/weak-pair/draw/air (에어+드로우 → draw)
  function strength(hole, board) {
    if (!board || board.length < 3) return null;
    var s = (typeof Villain !== 'undefined') ? Villain._handStrength(hole, board) : 'air';
    var draw = (typeof PostflopGuide !== 'undefined') && PostflopGuide.hasDraw(hole, board);
    if (s === 'air' && draw) return 'draw';
    return s;
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

  // 프로파일 말투 (짧은 꼬리말)
  function _tone(type, intent) {
    if (type === 'Fish') return intent === 'give-up' ? ' 에이 재미없다~' : ' 일단 가보자~';
    if (type === 'Nit') return intent === 'give-up' ? ' 확실하지 않으면 안 간다.' : ' 확실할 때만 간다.';
    if (type === 'LAG') return intent === 'give-up' ? ' 이번 건 보내주지.' : ' 계속 압박하자.';
    if (type === 'TAG') return ' 정석대로.';
    return '';
  }

  function _preflopVillain(type, pos, hole, action) {
    var g = preflopGrade(hole);
    var gk = GRADE_ADJ[g];
    var where = pos ? pos + '에서 ' : '';
    var intent, body;
    if (action === 'fold') {
      intent = 'give-up';
      body = (g === 'premium' || g === 'good') ? gk + ' 손이지만 가격이 비싸. 이번엔 접자.'
        : gk + ' 손이라 ' + where + '들어갈 이유가 없어. 폴드.';
    } else if (_isAggro(action)) {
      if (g === 'premium' || g === 'good') { intent = 'value'; body = gk + ' 손, ' + where + '레이즈로 팟을 키우자.'; }
      else if (g === 'spec') { intent = action === '3bet' ? 'bluff' : 'semibluff'; body = '투기적인 손이지만 ' + where + '주도권 잡고 플랍을 노려보자.'; }
      else { intent = 'bluff'; body = '솔직히 약한 손인데 ' + where + '레이즈로 다들 접게 만들자.'; }
    } else if (action === 'call') {
      if (g === 'premium') { intent = 'trap'; body = '프리미엄 손인데 일부러 콜만. 상대가 더 쳐주길 기다리자.'; }
      else if (type === 'Fish' && g === 'weak') { intent = 'call-odds'; body = '카드 두 장이 예뻐 보여. 그냥 궁금해서 콜~'; }
      else { intent = 'call-odds'; body = gk + ' 손, 가격이 괜찮으니 콜하고 플랍 보자.'; }
    } else {
      intent = 'pot-control'; body = gk + ' 손이라 공짜로 플랍 보자. 체크.';
    }
    return { intent: intent, body: body };
  }

  function _postflopVillain(type, hole, board, action, toCall, pot) {
    var s = strength(hole, board);
    var wet = _isWet(board);
    var tex = wet ? '보드에 드로우가 많아' : '보드가 드라이해서';
    var handTxt = s === 'weak-pair' ? _pairDesc(hole, board)
      : { nut: '넛급 손', strong: '강한 손', medium: '투페어급 손', draw: '드로우', air: '아무것도 없는 손' }[s];
    var intent, body;
    if (action === 'fold') {
      intent = 'give-up';
      body = _j(handTxt, '으로는', '로는') + ' 못 버텨. 여기서 접는다.';
    } else if (_isAggro(action)) {
      if (s === 'nut' || s === 'strong' || s === 'medium') {
        intent = 'value';
        body = handTxt + ', ' + (wet ? tex + ' 지금 크게 쳐서 드로우한테 비싸게 만들자.' : tex + ' 약한 손한테서 콜을 받아내자.');
      } else if (s === 'weak-pair') {
        var tp = handTxt !== '약한 페어';
        intent = tp ? 'value' : 'bluff';
        body = tp ? handTxt + ' 괜찮은 손이야. ' + (wet ? tex + ' 보호 겸 벳.' : '얇게 밸류 받자.') : '약한 페어지만 쇼다운 가치가 애매해. 벳으로 접게 만들자.';
      } else if (s === 'draw') {
        intent = 'semibluff';
        body = '아직 드로우지만 벳하면 상대가 접을 수도 있고, 맞으면 이긴다.';
      } else {
        intent = 'bluff';
        body = '맞은 게 없어. 이 보드는 내가 강해 보일 테니 블러프로 가져오자.';
      }
    } else if (action === 'call') {
      var odds = (toCall > 0 && pot > 0) ? Math.round(toCall / (pot + toCall) * 100) : 0;
      if (s === 'nut' || s === 'strong') { intent = 'trap'; body = _j(handTxt, '인데', '인데') + ' 일부러 콜만. 다음 스트리트에 더 받아내자.'; }
      else if (s === 'air' && type === 'Fish') { intent = 'call-odds'; body = '맞은 건 없지만 그냥 궁금해서 콜~'; }
      else if (s === 'draw') { intent = 'call-odds'; body = '드로우 남았어. 팟의 ' + odds + '%만 내면 되니까 콜하고 다음 카드 보자.'; }
      else { intent = 'call-odds'; body = _j(handTxt, '이면', '면') + ' 블러프는 이긴다. 팟의 ' + odds + '% 정도면 콜.'; }
    } else {
      if (s === 'nut' || s === 'strong') { intent = 'trap'; body = _j(handTxt, '이지만', '지만') + ' 체크로 숨기자. 상대 벳 나오면 레이즈.'; }
      else if (s === 'air') { intent = 'give-up'; body = '맞은 게 없어. 조용히 체크.'; }
      else { intent = 'pot-control'; body = _j(handTxt, '이라', '라') + ' 팟을 작게 유지하자. 체크.'; }
    }
    return { intent: intent, body: body };
  }

  // villainThought(state, name, action, amount) → { name, street, text, intent }
  function villainThought(state, name, action, amount) {
    var p = (state.players && state.players[name]) || {};
    var type = p.type || 'TAG';
    var hole = (state.holeCards && state.holeCards[name]) || p.holeCards || [];
    var board = state.board || [];
    var street = state.street || 'preflop';
    var r;
    if (board.length < 3 || street === 'preflop') {
      r = _preflopVillain(type, p.pos, hole, action);
    } else {
      var toCall = action === 'call' ? (amount || 0)
        : Math.max(0, (state.currentBet || 0) - ((state.playerBets && state.playerBets[name]) || 0));
      r = _postflopVillain(type, hole, board, action, toCall, state.pot || 0);
    }
    var text = '💭 ' + name + ': ' + r.body + _tone(type, r.intent) + ' (' + INTENT_KOR[r.intent] + ')';
    return { name: name, street: street, text: text, intent: r.intent };
  }

  // 히어로 3단계 생각 선택지
  var OPTIONS = {
    range: [{ key: 'strong', label: '강함' }, { key: 'medium', label: '중간' }, { key: 'weak', label: '약함/블러프 많음' }],
    hand: [{ key: 'value', label: '넛/강한 밸류' }, { key: 'medium', label: '블러프캐처/중간' }, { key: 'draw', label: '드로우' }, { key: 'air', label: '에어' }],
    plan: [{ key: 'value', label: '밸류' }, { key: 'bluff', label: '블러프/세미블러프' }, { key: 'control', label: '팟컨트롤/체크콜' }, { key: 'fold', label: '포기(폴드)' }]
  };
  var STEP_TITLE = { range: '① 상대 레인지', hand: '② 내 손', plan: '③ 의도' };
  function heroThoughtOptions() { return { steps: ['range', 'hand', 'plan'], titles: STEP_TITLE, options: OPTIONS }; }
  function _label(step, key) {
    var o = OPTIONS[step].filter(function(x) { return x.key === key; })[0];
    return o ? o.label : key;
  }

  // proThought(state, heroPos, eq, toCall, pot) → { range, hand, plan, keys:{range,hand,plan}, odds }
  function proThought(state, heroPos, eq, toCall, pot) {
    toCall = toCall || 0; pot = pot || 0; eq = eq || 0;
    var odds = toCall > 0 ? toCall / (pot + toCall) : 0;
    var oddsPct = Math.round(odds * 100), eqPct = Math.round(eq * 100);
    var board = state.board || [];
    var hero = state.heroCards || [];
    var raiser = state.lastRaiser && state.lastRaiser !== 'Hero' ? state.lastRaiser : null;
    var rp = raiser && state.players && state.players[raiser];
    var rtype = rp ? rp.type : null;
    var keys = {}, range, hand, plan;
    var preflop = board.length < 3 || state.street === 'preflop';

    if (preflop) {
      var facing3 = typeof Gto !== 'undefined' && (Gto.isFacing3bet(state) || Gto.isFacing4bet(state));
      if (facing3) { keys.range = 'strong'; range = '상대 레인지: 3벳 이상은 강한 손 위주 (프리미엄 비중 높음)'; }
      else if (raiser && (state.currentBet || 0) > (state.bigBlind || 1)) {
        keys.range = rtype === 'Nit' ? 'strong' : (rtype === 'LAG' || rtype === 'Fish') ? 'weak' : 'medium';
        range = '상대 레인지: ' + (rp && rp.pos ? rp.pos + ' ' : '') + '오픈 레인지, ' +
          (keys.range === 'strong' ? '타이트해서 강함' : keys.range === 'weak' ? '넓어서 약한 손 많음' : '상위 15~25% 정도로 중간');
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
      var s = strength(hero, board);
      var wet = _isWet(board);
      if (toCall > 0) {
        var big = pot > 0 && toCall >= pot * 0.6;
        keys.range = rtype === 'Nit' || big ? 'strong' : (rtype === 'LAG' || rtype === 'Fish') ? 'weak' : 'medium';
        range = '상대 레인지: ' + (raiser ? raiser + (rtype && rtype !== 'Mixed' ? '(' + rtype + ')' : '') + '의 ' : '') +
          (big ? '큰 벳, 강한 손 비중 높음' : keys.range === 'weak' ? '벳이지만 블러프가 많은 성향' : '벳 레인지, 밸류와 블러프 섞인 중간');
      } else {
        keys.range = 'medium';
        range = '상대 레인지: 아직 벳 없음, 넓은 중간 레인지';
      }
      keys.hand = (s === 'nut' || s === 'strong') ? 'value' : (s === 'medium' || s === 'weak-pair') ? 'medium' : s === 'draw' ? 'draw' : 'air';
      hand = '내 손: ' + _label('hand', keys.hand) + ' (' + (wet ? '웻보드' : '드라이보드') + ', 에쿼티 ' + eqPct + '%)';
      var gd = (typeof PostflopGuide !== 'undefined') ? PostflopGuide.guide(state) : null;
      var ga = gd ? gd.action : (keys.hand === 'value' ? 'bet' : toCall > 0 ? 'call' : 'check');
      if (ga === 'bet' || ga === 'raise') keys.plan = keys.hand === 'value' || keys.hand === 'medium' ? 'value' : 'bluff';
      else if (ga === 'fold') keys.plan = 'fold';
      else keys.plan = 'control';
      var why = gd ? _clean(gd.reason) : '';
      // 팟오즈 판정: 벳을 마주했고 밸류 손이 아니면 에쿼티 vs 필요 승률로 결론
      if (toCall > 0 && keys.hand !== 'value') {
        if (eq < odds) { keys.plan = 'fold'; why = '에쿼티 ' + eqPct + '% < 필요 ' + oddsPct + '%, 팟오즈 안 맞음'; }
        else if (keys.plan === 'fold') { keys.plan = 'control'; why = '에쿼티 ' + eqPct + '% ≥ 필요 ' + oddsPct + '%, 팟오즈 맞아서 콜'; }
      }
      plan = '의도: ' + _label('plan', keys.plan) + (why ? ' (' + why + ')' : '');
    }
    if (preflop && toCall > 0) plan += ', 팟오즈 필요 ' + oddsPct + '% / 내 에쿼티 ' + eqPct + '%';
    return { range: range, hand: hand, plan: plan, keys: keys, odds: odds, street: state.street };
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
    INTENT_KOR: INTENT_KOR, STREET_KOR: STREET_KOR
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
