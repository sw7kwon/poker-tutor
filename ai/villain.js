// ai/villain.js
var Villain = (function() {
  function getAction(villain, state) {
    var profile = _getProfile(villain, state.street);
    var r = state.street === 'preflop'
      ? _preflopAction(profile, villain, state)
      : _postflopAction(profile, villain, state);
    var phrase = _pickPhrase(profile, r.label === '올인' ? 'allin' : r.action);
    var out = { action: r.action, amount: r.amount, phrase: phrase };
    if (r.label) out.label = r.label;
    return out;
  }

  function _getProfile(villain, street) {
    var type = villain.type;
    if (type === 'Mixed') {
      var map = { preflop: 'TAG', flop: 'LAG', turn: 'TAG', river: 'Fish' };
      var base = JSON.parse(JSON.stringify(VillainProfiles[map[street] || 'TAG']));
      if (Math.random() < VillainProfiles.Mixed.noise) {
        base.bluff_freq = Math.min(0.6, base.bluff_freq + 0.15);
      }
      return base;
    }
    return VillainProfiles[type];
  }

  // 프리플랍: streetBetCount(sbc) 단계별 — 0 오픈/림프, 1 오픈 직면(3벳/콜), 2 3벳 직면(4벳/콜), 3+ 잼/폴드
  // 히어로 2bb 민레이즈도 sbc=1이라 레이즈로 인식된다.
  function _preflopAction(profile, villain, state) {
    var pos = villain.pos;
    var name = villain.name;
    var h0 = villain.holeCards[0], h1 = villain.holeCards[1];
    var have = (state.playerBets && state.playerBets[name]) || 0;
    var stack = (state.stacks && state.stacks[name]) || 0;
    var maxTo = have + stack;
    var toCall = Math.max(0, state.currentBet - have);
    var sbc = state.streetBetCount || 0;
    var BB = state.bigBlind || 1;
    var cvr = profile.call_vs_raise || {};
    function inR(s) { return !!s && Range.inRange(h0, h1, s); }
    function jamOr(to) {
      to = Math.min(maxTo, Math.round(to * 2) / 2);
      if (to >= 0.4 * maxTo) to = maxTo; // 스택 40% 이상 투입이면 올인으로
      return to;
    }
    function call() { return { action: 'call', amount: Math.min(toCall, stack) }; }
    var FOLD = { action: 'fold', amount: 0 };

    if (sbc === 0) {
      if (toCall === 0) return { action: 'check', amount: 0 }; // BB 옵션
      var limpers = Math.max(0, Math.round((state.pot - 1.5 * BB) / BB));
      if (inR((profile.rfi || {})[pos])) {
        if (profile.limp_unless && !inR(profile.limp_unless)) return call(); // Fish 림프
        return { action: 'raise', amount: jamOr((pos === 'BTN' ? 2.5 : 3) * BB + limpers * BB) };
      }
      if (limpers > 0 && profile.limp_unless && inR(cvr[pos])) return call(); // 오버림프
      return FOLD;
    }
    if (toCall <= 0) return { action: 'check', amount: 0 };

    if (sbc === 1) {
      if (inR(profile.threebet_range)) {
        var mul = (pos === 'SB' || pos === 'BB') ? 3.5 : 3;
        return { action: '3bet', amount: jamOr(state.currentBet * mul), label: '3벳' };
      }
      if (inR(cvr[pos])) return call();
      return FOLD;
    }
    if (sbc === 2) {
      if (inR(profile.fourbet)) return { action: 'raise', amount: jamOr(state.currentBet * 2.3), label: '4벳' };
      if (inR(profile.call_vs_3bet) && toCall <= 0.35 * stack) return call();
      return FOLD;
    }
    if (inR(profile.jam)) return { action: 'raise', amount: maxTo, label: '올인' };
    if (toCall <= 0.1 * stack) return call();
    return FOLD;
  }

  var _RV = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };

  // 보드(3~4장)만으로 된 족보 type: 같은 랭크 4장 3, 3장 7, 페어 2개 8, 페어 1개 9, 없음 10
  function _boardRankType(board) {
    var cnt = {};
    board.forEach(function(c) { cnt[c.rank] = (cnt[c.rank] || 0) + 1; });
    var pairs = 0, trips = false, quads = false;
    Object.keys(cnt).forEach(function(r) {
      if (cnt[r] >= 4) quads = true; else if (cnt[r] === 3) trips = true; else if (cnt[r] === 2) pairs++;
    });
    if (quads) return 3;
    if (trips) return 7;
    if (pairs >= 2) return 8;
    if (pairs === 1) return 9;
    return 10;
  }

  // 핸드 강도 — 보드 기여 기준 (HAND_RANK type은 작을수록 강함: 1 로열 ~ 10 하이카드)
  //   air       = 보드만으로 된 족보(내 카드는 킥커뿐) 또는 하이카드
  //   nut       = 풀하우스 이상(내 카드가 기여)
  //   strong    = 플러시/스트레이트(보드 4장 같은 무늬에 낮은 플러시는 medium), 셋(포켓페어)
  //   medium    = 오버페어, 탑페어, 트립스(보드 페어+내 카드), 홀카드 2장 모두 쓰는 투페어
  //   weak-pair = 세컨드 이하 페어, 보드보다 낮은 포켓페어
  function _handStrength(holeCards, board) {
    if (!board || board.length < 3 || !holeCards || holeCards.length < 2) return 'air';
    var full = HandEval.evaluate(holeCards.concat(board));
    var t = full.type;
    var r0 = holeCards[0].rank, r1 = holeCards[1].rank;
    var pocket = r0 === r1;
    var boardRanks = board.map(function(c) { return c.rank; });
    var onBoard0 = boardRanks.indexOf(r0) >= 0, onBoard1 = boardRanks.indexOf(r1) >= 0;
    if (board.length >= 5) {
      var bScore = HandEval.evaluate(board);
      if (HandEval.compareHands(full, bScore) === 0) return 'air'; // 보드 플레이
      // 같은 족보에서 킥커만 나아진 경우(페어류)도 보드 플레이
      if (t === bScore.type && (t === 3 || t >= 7) && !pocket && !onBoard0 && !onBoard1) return 'air';
    } else {
      if (t >= _boardRankType(board)) return 'air';
    }
    if (t <= 4) return 'nut';
    if (t === 5 || t === 6) {
      if (t === 5) {
        var suitCnt = {};
        board.forEach(function(c) { suitCnt[c.suit] = (suitCnt[c.suit] || 0) + 1; });
        var fs = Object.keys(suitCnt).filter(function(s) { return suitCnt[s] >= 4; })[0];
        if (fs) {
          var myTop = 0;
          holeCards.forEach(function(c) { if (c.suit === fs) myTop = Math.max(myTop, _RV[c.rank]); });
          if (myTop < 12) return 'medium';
        }
      }
      return 'strong';
    }
    if (t === 7) return pocket ? 'strong' : 'medium';
    if (t === 8 && !pocket && onBoard0 && onBoard1) return 'medium';
    if (t === 8 || t === 9) {
      var bMax = Math.max.apply(null, boardRanks.map(function(r) { return _RV[r]; }));
      if (pocket) return _RV[r0] > bMax ? 'medium' : 'weak-pair';
      if (_RV[r0] === bMax || _RV[r1] === bMax) return 'medium';
      return 'weak-pair';
    }
    return 'air';
  }

  function _postflopAction(profile, villain, state) {
    var pot = state.pot;
    var stack = state.stacks[villain.name];
    var have = state.playerBets[villain.name] || 0;
    var toCall = Math.max(0, state.currentBet - have);
    var isWet = _isBoardWet(state.board);
    var cbetFreq = isWet ? profile.cbet.wet : profile.cbet.dry;
    var strength = _handStrength(villain.holeCards, state.board);
    var maxTo = have + stack;
    var raiseTo = function(x) { return Math.min(maxTo, Math.round(x * 2) / 2); };
    var call = function() { return { action: 'call', amount: Math.min(toCall, stack) }; };
    var reraise = function() { return { action: 'raise', amount: raiseTo(state.currentBet * 2.5) }; };
    var strongish = strength === 'nut' || strength === 'strong';

    if (toCall === 0) {
      // 프리플랍 어그레서의 플랍 c-벳
      if (state.pfAggressor && state.pfAggressor === villain.name && state.street === 'flop') {
        if (strongish || Math.random() < cbetFreq) {
          return { action: 'bet', amount: raiseTo(have + pot * (isWet ? 0.67 : 0.4)) };
        }
        return { action: 'check', amount: 0 };
      }
      if (strongish || (strength === 'medium' && Math.random() < cbetFreq * 0.4)) {
        return { action: 'bet', amount: raiseTo(have + pot * profile.bet_sizing.value) };
      }
      if ((strength === 'air' || strength === 'weak-pair') && Math.random() < profile.bluff_freq) {
        return { action: 'bet', amount: raiseTo(have + pot * profile.bet_sizing.bluff) };
      }
      return { action: 'check', amount: 0 };
    }

    // 벳 직면 — 체크 후였다면 아래 raise가 체크레이즈
    var big = toCall / (pot + toCall) >= 0.30;
    var ftc = profile.fold_to_cbet;
    if (strength === 'nut') return reraise();
    if (strength === 'strong') return Math.random() < profile.bluff_freq ? reraise() : call();
    if (strength === 'medium') {
      if (big && Math.random() < ftc * 0.3) return { action: 'fold', amount: 0 };
      return call();
    }
    if (strength === 'weak-pair') {
      if (Math.random() < Math.min(0.95, ftc * (big ? 1.2 : 0.7))) return { action: 'fold', amount: 0 };
      return call();
    }
    // air: 대부분 폴드, 가끔 블러프 레이즈
    if (Math.random() < Math.min(0.95, ftc * 1.6 + 0.15)) return { action: 'fold', amount: 0 };
    if (Math.random() < profile.bluff_freq * 0.4) return reraise();
    return call();
  }

  function _isBoardWet(board) {
    if (!board || board.length < 3) return false;
    var suits = board.slice(0,3).map(function(c){ return c.suit; });
    var RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
    var ranks = board.slice(0,3).map(function(c){ return RANKS.indexOf(c.rank); }).sort(function(a,b){return a-b;});
    var flushDraw = suits.filter(function(s,_,a){ return a.indexOf(s) !== a.lastIndexOf(s); }).length >= 2;
    return flushDraw || (ranks[2]-ranks[0]) <= 4;
  }

  function _pickPhrase(profile, action) {
    var key = action === '3bet' ? '3bet' : action;
    var phrases = (profile.phrases || {})[key] || ['...'];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  if (typeof module !== 'undefined') module.exports = { getAction, _handStrength: _handStrength, _isBoardWet: _isBoardWet };
  return { getAction, _handStrength: _handStrength, _isBoardWet: _isBoardWet };
})();
