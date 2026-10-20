// engine/game-state.js
var GameState = (function() {
  var POSITIONS = ['UTG','HJ','CO','BTN','SB','BB'];
  var BB = 1;

  // opts(M4, 계약 T1): { spectator:true } → Hero를 만들지 않는다(관전, 극장). heroPos는 무시하고
  // heroCards와 heroStack은 undefined, state.spectator=true. opts를 생략하면 기존 동작 그대로.
  function buildInitialState(playersSpec, heroPos, seed, prevStacks, opts) {
    var spectator = !!(opts && opts.spectator === true);
    heroPos = heroPos || 'BTN';
    seed = seed != null ? seed : (Math.random() * 1e9 | 0);
    var players = {};
    if (!spectator) players['Hero'] = { name: 'Hero', type: 'Hero', pos: heroPos, isHero: true };
    playersSpec.forEach(function(spec) {
      players[spec.name] = { name: spec.name, type: spec.type, pos: spec.pos, isHero: false };
    });
    var stacks = {};
    Object.keys(players).forEach(function(n) {
      var prev = prevStacks && prevStacks[n];
      stacks[n] = (prev != null && prev > 0) ? prev : 100 * BB;
    });
    var deck = Deck.shuffle(Deck.create(), seed);
    var names = Object.keys(players).sort(function(a,b){
      return POSITIONS.indexOf(players[a].pos) - POSITIONS.indexOf(players[b].pos);
    });
    var dealt = Deck.deal(deck, 2 * names.length, []);
    var holeCards = {};
    names.forEach(function(n, i) { holeCards[n] = [dealt.cards[i*2], dealt.cards[i*2+1]]; });
    // HU(2인)는 BTN이 SB를 포스팅 (BTN=SB 룰)
    var sbPlayer = names.find(function(n){ return players[n].pos === 'SB'; });
    if (!sbPlayer && names.length === 2) {
      sbPlayer = names.find(function(n){ return players[n].pos === 'BTN'; });
    }
    var bbPlayer = names.find(function(n){ return players[n].pos === 'BB'; });
    var playerBets = {};
    var totalContrib = {}; // 핸드 전체 누적 투입 (사이드팟 계산용 — 스트리트 리셋 없음)
    names.forEach(function(n){ playerBets[n] = 0; totalContrib[n] = 0; });
    if (sbPlayer) { stacks[sbPlayer] -= 0.5; playerBets[sbPlayer] = 0.5; totalContrib[sbPlayer] = 0.5; }
    if (bbPlayer) { stacks[bbPlayer] -= 1;   playerBets[bbPlayer] = 1;   totalContrib[bbPlayer] = 1; }
    var pot = (sbPlayer ? 0.5 : 0) + (bbPlayer ? 1 : 0);
    var st = {
      players: players, names: names, stacks: stacks,
      holeCards: holeCards, heroCards: holeCards['Hero'],
      board: [], pot: pot, playerBets: playerBets, totalContrib: totalContrib,
      currentBet: BB, minRaise: BB * 2, street: 'preflop',
      // lastRaiseSize: 직전 레이즈 증분 (민레이즈 = currentBet + lastRaiseSize)
      // reopened: 미달 올인 후 false — 베팅 재개방 없음(레이즈 불가, 콜/폴드만)
      lastRaiseSize: BB, reopened: true,
      pendingQueue: _preflopQueue(names, players),
      waitingForHero: false, handOver: false,
      folded: {}, decisions: [], seed: seed, handNum: 1, round: 1,
      villainRange: null, heroStack: stacks['Hero'],
      bigBlind: BB, lastRaiser: null, streetBetCount: 0
    };
    if (spectator) st.spectator = true; // 기본 경로의 상태 키는 그대로 둔다
    return st;
  }

  // 프리플랍: UTG→HJ→CO→BTN→SB→BB
  function _preflopQueue(names, players) {
    var queue = [];
    POSITIONS.forEach(function(pos) {
      var n = names.find(function(nm){ return players[nm].pos === pos; });
      if (n) queue.push(n);
    });
    return queue;
  }

  // 포스트플랍: SB→BB→UTG→HJ→CO→BTN (버튼이 마지막)
  function _postflopQueue(names, players, folded) {
    var postOrder = ['SB','BB','UTG','HJ','CO','BTN'];
    var queue = [];
    postOrder.forEach(function(pos) {
      var n = names.find(function(nm){ return players[nm].pos === pos; });
      if (n && !folded[n]) queue.push(n);
    });
    return queue;
  }

  // 레이즈 후 응답 필요한 플레이어 큐 (raiser 바로 다음부터 한 바퀴)
  function _queueAfterRaise(state, raiser) {
    var raiserIdx = POSITIONS.indexOf(state.players[raiser].pos);
    var queue = [];
    for (var i = 1; i <= POSITIONS.length; i++) {
      var pos = POSITIONS[(raiserIdx + i) % POSITIONS.length];
      var name = state.names.find(function(n){ return state.players[n].pos === pos; });
      if (name && !state.folded[name] && name !== raiser) queue.push(name);
    }
    return queue;
  }

  // amount는 raise-to(이번 스트리트 총 베팅액) 기준.
  // 검증 실패 시 상태 불변 + actionError만 설정해 반환 (칩 이동 없음).
  function applyHeroAction(state, action, amount) {
    var s = _clone(state);
    delete s.actionError;
    amount = parseFloat(amount) || 0;
    s.waitingForHero = false;

    if (action === 'fold') {
      s.folded['Hero'] = true;
      s.handOver = true;
    } else if (action === 'call' || action === 'check') {
      var toCall = Math.min(s.currentBet - (s.playerBets['Hero'] || 0), s.stacks['Hero']);
      toCall = Math.max(0, toCall);
      s.stacks['Hero'] -= toCall;
      s.playerBets['Hero'] = (s.playerBets['Hero'] || 0) + toCall;
      s.totalContrib['Hero'] += toCall;
      s.pot += toCall;
      // pendingQueue 유지 — 남은 빌런들 순서대로 액션
    } else if (action === 'raise' || action === 'allin') {
      var have = s.playerBets['Hero'] || 0;
      var maxTo = have + s.stacks['Hero'];
      var raiseTo = action === 'allin' ? maxTo : Math.min(amount, maxTo);
      var minTo = s.currentBet + (s.lastRaiseSize || s.bigBlind);
      var isAllIn = raiseTo >= maxTo;
      if (raiseTo <= s.currentBet) {
        var e1 = _clone(state);
        e1.actionError = '레이즈는 현재 베팅(' + s.currentBet + 'bb)보다 커야 합니다';
        return e1;
      }
      if (raiseTo < minTo && !isAllIn) {
        var e2 = _clone(state);
        e2.actionError = '최소 레이즈는 ' + minTo + 'bb입니다';
        return e2;
      }
      if (!s.reopened && !isAllIn) {
        var e3 = _clone(state);
        e3.actionError = '미달 올인 이후에는 콜/폴드만 가능합니다';
        return e3;
      }
      var add = raiseTo - have;
      s.stacks['Hero'] -= add; s.pot += add;
      s.playerBets['Hero'] = raiseTo;
      s.totalContrib['Hero'] += add;
      if (raiseTo >= minTo) {
        s.lastRaiseSize = raiseTo - s.currentBet;
        s.reopened = true;
      } else {
        s.reopened = false; // 미달 올인 — 베팅 미재개방
      }
      s.currentBet = raiseTo;
      s.minRaise = s.currentBet + s.lastRaiseSize;
      s.lastRaiser = 'Hero'; s.streetBetCount++;
      // 레이즈 → 모든 활성 빌런이 다시 응답해야 함
      s.pendingQueue = _queueAfterRaise(s, 'Hero');
    }

    s.heroStack = s.stacks['Hero'];
    s.decisions.push({ street: s.street, action: action, amount: amount, actualEV: 0, bestEV: 0 });
    return s;
  }

  // 주입 결정(opts.decide) 정규화: 엔진이 처리하지 못하는 모양만 고친다. 금액 규칙과 강등은 아래 공통 경로가 맡는다.
  //   'allin' → 스택 전부(raise-to = 기존 투입 + 스택), 벳 직면 'check' → 'call', 공짜 'fold'/'call' → 'check',
  //   숫자가 아닌 금액 → 0(레이즈면 콜 강등), 모르는 액션이나 빈 결과 → null(Villain.getAction 폴백).
  //   기록 금액은 실제 이동 칩과 맞춘다: 콜은 min(콜 금액, 스택)(raise-to나 빈 금액을 넘겨도), 폴드와 체크는 0.
  var _DECIDE_ACTIONS = { fold: 1, check: 1, call: 1, bet: 1, raise: 1, '3bet': 1, allin: 1 };
  function _fromDecide(r, s, name) {
    if (!r || typeof r !== 'object' || !_DECIDE_ACTIONS[r.action]) return null;
    var have = s.playerBets[name] || 0, stack = s.stacks[name] || 0;
    var toCall = Math.max(0, s.currentBet - have);
    var amt = parseFloat(r.amount);
    if (!isFinite(amt)) amt = 0;
    var out = { action: r.action, amount: amt, phrase: r.phrase };
    if (r.label) out.label = r.label;
    if (r.action === 'allin') {
      out.action = s.currentBet > 0 ? 'raise' : 'bet';
      out.amount = have + stack;
      if (!out.label) out.label = '올인';
    } else if (r.action === 'check' && toCall > 0) {
      out.action = 'call'; out.amount = Math.min(toCall, stack);
    } else if ((r.action === 'fold' || r.action === 'call') && toCall <= 0) {
      out.action = 'check'; out.amount = 0;
    } else if (r.action === 'call') {
      out.amount = Math.min(toCall, stack);
    } else if (r.action === 'fold' || r.action === 'check') {
      out.amount = 0;
    }
    return out;
  }

  // opts(M4, 계약 T1, 생략하면 기존 동작 그대로):
  //   stepOne: 실제 액션 1개를 처리하고 바로 반환(폴드나 올인 좌석 건너뛰기는 소비만, 처리할 액션이 없으면 villainActions [])
  //   decide(villain, state) → {action, amount, phrase?, label?}: Villain.getAction 대신 쓴다(villain.holeCards는 호출 전에 채움)
  function applyVillainActions(state, opts) {
    var stepOne = !!(opts && opts.stepOne);
    var decide = (opts && typeof opts.decide === 'function') ? opts.decide : null;
    var s = _clone(state);
    var villainActions = [];

    while (s.pendingQueue.length > 0) {
      var name = s.pendingQueue[0];

      // 폴드됐거나 올인(스택 0)이면 스킵. 짧은 올인 뒤 누가 더 올려도 올인 좌석은 더 할 액션이 없다
      // (예전에는 다시 물어서 폴드로 메인 팟 몫을 잃을 수 있었다. 스택이 다른 이월 스택, 미니시즌에서 생긴다)
      if (s.folded[name] || s.stacks[name] === 0) {
        s.pendingQueue.shift(); continue;
      }

      // 히어로 차례 → 멈추고 UI 에 넘김
      if (name === 'Hero') {
        s.pendingQueue.shift();
        s.waitingForHero = true;
        return { newState: s, villainActions: villainActions };
      }

      s.pendingQueue.shift();
      var villain = s.players[name];
      villain.holeCards = s.holeCards[name];
      // 액션 직전 스냅샷(속마음/극장이 이 값으로 콜 금액과 팟을 계산)
      var potBefore = s.pot, currentBetBefore = s.currentBet, haveBefore = s.playerBets[name] || 0;
      var result = decide ? _fromDecide(decide(villain, s), s, name) : null;
      if (!result) result = Villain.getAction(villain, s);
      var action = result.action, amt = result.amount;

      if (action === 'fold') {
        s.folded[name] = true;
      } else if (action === 'call') {
        var toCall = Math.max(0, Math.min(s.currentBet - (s.playerBets[name] || 0), s.stacks[name]));
        s.stacks[name] -= toCall;
        s.playerBets[name] = (s.playerBets[name] || 0) + toCall;
        s.totalContrib[name] += toCall;
        s.pot += toCall;
      } else if (action === 'raise' || action === '3bet' || action === 'bet') {
        // amt = raise-to(이번 스트리트 총 베팅액). 실제 차감은 기존 투입 공제 (과다 차감 버그 수정)
        var haveV = s.playerBets[name] || 0;
        var maxToV = haveV + s.stacks[name];
        var raiseToV = Math.min(amt, maxToV);
        var minToV = s.currentBet + (s.lastRaiseSize || s.bigBlind);
        var isAllInV = raiseToV >= maxToV;
        // 민레이즈 미달(비올인) 또는 미재개방 상태의 레이즈 시도 → 콜 강등
        if (raiseToV <= s.currentBet || (raiseToV < minToV && !isAllInV) || (!s.reopened && !isAllInV)) {
          var toCallV = Math.max(0, Math.min(s.currentBet - haveV, s.stacks[name]));
          s.stacks[name] -= toCallV;
          s.playerBets[name] = haveV + toCallV;
          s.totalContrib[name] += toCallV;
          s.pot += toCallV;
          action = toCallV > 0 ? 'call' : 'check';
          amt = toCallV;
        } else {
          var addV = raiseToV - haveV;
          s.stacks[name] -= addV; s.pot += addV;
          s.playerBets[name] = raiseToV;
          s.totalContrib[name] += addV;
          if (raiseToV >= minToV) {
            s.lastRaiseSize = raiseToV - s.currentBet;
            s.reopened = true;
          } else {
            s.reopened = false;
          }
          s.currentBet = raiseToV;
          s.minRaise = s.currentBet + s.lastRaiseSize;
          s.lastRaiser = name; s.streetBetCount++;
          amt = raiseToV;
          // 레이즈 → 히어로 포함 모든 나머지 플레이어가 다시 응답
          s.pendingQueue = _queueAfterRaise(s, name);
        }
      }

      // label('3벳','4벳','올인'): 강등(콜/체크)되면 null
      villainActions.push({ name: name, action: action, amount: amt, phrase: result.phrase,
        label: action === result.action ? (result.label || null) : null,
        potBefore: potBefore, currentBetBefore: currentBetBefore, haveBefore: haveBefore });

      var active = s.names.filter(function(n){ return !s.folded[n]; });
      if (active.length <= 1) {
        s.handOver = true;
        return { newState: s, villainActions: villainActions };
      }
      if (stepOne) return { newState: s, villainActions: villainActions };
    }

    // 큐 소진 → 스트리트 종료 또는 핸드 종료
    var active = s.names.filter(function(n){ return !s.folded[n]; });
    if (active.length === 1) s.handOver = true;
    return { newState: s, villainActions: villainActions };
  }

  // 큐가 비어있고 2명 이상 생존 → 다음 스트리트로
  function needsStreetAdvance(state) {
    if (state.handOver) return false;
    if (state.street === 'showdown') return false;
    if (state.pendingQueue && state.pendingQueue.length > 0) return false;
    var active = state.names.filter(function(n){ return !state.folded[n]; });
    return active.length > 1;
  }

  function advanceStreet(state) {
    var s = _clone(state);
    var streets = ['preflop','flop','turn','river'];
    var idx = streets.indexOf(s.street);
    // 프리플랍 마지막 레이저 = 플랍 c-벳 주도권(이후 스트리트에도 유지)
    if (state.street === 'preflop') s.pfAggressor = state.lastRaiser || null;
    s.street = streets[idx + 1] || 'showdown';
    s.currentBet = 0;
    s.playerBets = {};
    s.names.forEach(function(n){ s.playerBets[n] = 0; });
    s.streetBetCount = 0; s.lastRaiser = null;
    s.lastRaiseSize = s.bigBlind; s.reopened = true;
    s.minRaise = s.bigBlind; // 새 스트리트 최소 벳
    // totalContrib는 리셋하지 않음 — 핸드 누적 (사이드팟 기준)

    var allUsed = Object.values(s.holeCards).reduce(function(acc,h){ return acc.concat(h); }, []).concat(s.board);
    var deck = Deck.shuffle(Deck.create(), s.seed + idx);
    var avail = deck.filter(function(c){
      return !allUsed.some(function(u){ return u.rank===c.rank && u.suit===c.suit; });
    });
    if (s.street === 'flop')  s.board = s.board.concat(avail.slice(0,3));
    if (s.street === 'turn')  s.board = s.board.concat([avail[0]]);
    if (s.street === 'river') s.board = s.board.concat([avail[0]]);

    s.pendingQueue = _postflopQueue(s.names, s.players, s.folded);
    return s;
  }

  // 보드 5장 완주 — advanceStreet과 동일한 seed 유도로 결정성 유지 (폴드 종결·올인 런아웃용)
  function _completeBoard(s) {
    while (s.board.length < 5) {
      var idx = s.board.length === 0 ? 0 : s.board.length === 3 ? 1 : 2;
      var allUsed = Object.values(s.holeCards).reduce(function(acc, h){ return acc.concat(h); }, []).concat(s.board);
      var deck = Deck.shuffle(Deck.create(), s.seed + idx);
      var avail = deck.filter(function(c){
        return !allUsed.some(function(u){ return u.rank === c.rank && u.suit === c.suit; });
      });
      s.board = s.board.concat(avail.slice(0, s.board.length === 0 ? 3 : 1));
    }
    return s;
  }

  function _round2(x) { return Math.round(x * 100) / 100; }

  function resolveShowdown(state) {
    var s = _clone(state);
    s.handOver = true;
    var active = s.names.filter(function(n){ return !s.folded[n]; });
    if (active.length === 1) {
      s.stacks[active[0]] = _round2(s.stacks[active[0]] + s.pot); s.pot = 0;
      return { newState: s, heroWon: active[0] === 'Hero', winner: active[0], showCards: false };
    }

    // 다자 생존 (히어로 폴드 포함) — 보드 완주 후 정식 평가
    s = _completeBoard(s);
    var scores = {};
    active.forEach(function(n){ scores[n] = HandEval.evaluate(s.holeCards[n].concat(s.board)); });

    // ── 사이드팟: 누적 기여 상한 오름차순 레이어 분할 ──
    // 각 레이어 팟은 그 구간에 기여한 전원(폴드자 포함)의 칩, 자격은 기여가 상한 이상인 미폴드자.
    var contrib = s.totalContrib || {};
    var levels = active
      .map(function(n){ return contrib[n] || 0; })
      .filter(function(v){ return v > 0; })
      .sort(function(a, b){ return a - b; })
      .filter(function(v, i, arr){ return arr.indexOf(v) === i; });
    var payouts = {};
    var refund = {}; // 혼자만 낸 레이어(콜 안 된 초과분) 반환액 — 승패 판정에서 제외
    s.names.forEach(function(n){ payouts[n] = 0; });
    var prev = 0;
    levels.forEach(function(level) {
      var layerPot = 0, contributors = 0;
      s.names.forEach(function(n) {
        var c = Math.min(contrib[n] || 0, level) - prev;
        if (c > 0) { layerPot += c; contributors++; }
      });
      prev = level;
      if (layerPot <= 0) return;
      var eligible = active.filter(function(n){ return (contrib[n] || 0) >= level; });
      if (!eligible.length) return;
      if (contributors === 1 && eligible.length === 1) refund[eligible[0]] = _round2((refund[eligible[0]] || 0) + layerPot);
      var best = eligible.reduce(function(b, n){
        return b === null || HandEval.compareHands(scores[n], scores[b]) < 0 ? n : b;
      }, null);
      var winners = eligible.filter(function(n){ return HandEval.compareHands(scores[n], scores[best]) === 0; });
      // 스플릿: 균등 분할(0.01bb), 홀수 칩 잔여는 큐 앞 승자에게
      var share = Math.floor((layerPot / winners.length) * 100) / 100;
      var remainder = _round2(layerPot - share * winners.length);
      winners.forEach(function(n, i){ payouts[n] = _round2(payouts[n] + share + (i === 0 ? remainder : 0)); });
    });
    s.names.forEach(function(n){ s.stacks[n] = _round2(s.stacks[n] + payouts[n]); });
    s.pot = 0;

    // 표시용 승자: 전체 베스트 핸드 (메인팟 승자)
    var winner = active.reduce(function(best, n){
      return best === null || HandEval.compareHands(scores[n], scores[best]) < 0 ? n : best;
    }, null);
    var handDescriptions = {};
    active.forEach(function(n){ handDescriptions[n] = HandEval.describe(scores[n]); });
    // 승리 = 상대 칩이 섞인 팟을 (일부라도) 땀. 내 초과 베팅만 돌려받은 경우는 패배
    // 관전(spectator) 상태에는 Hero가 없으므로 0으로 본다(heroWon false, NaN 방지)
    return { newState: s, heroWon: _round2((payouts['Hero'] || 0) - (refund['Hero'] || 0)) > 0, winner: winner, showCards: true,
             scores: scores, handDescriptions: handDescriptions, payouts: payouts };
  }

  function _clone(state) { return JSON.parse(JSON.stringify(state)); }

  if (typeof module !== 'undefined') module.exports = { buildInitialState, applyHeroAction, applyVillainActions, needsStreetAdvance, advanceStreet, resolveShowdown };
  return { buildInitialState, applyHeroAction, applyVillainActions, needsStreetAdvance, advanceStreet, resolveShowdown };
})();
