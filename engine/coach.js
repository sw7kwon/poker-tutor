// engine/coach.js — 8차 WP2: 단일 코치 판정
// 프리플랍 = 레인지 차트(모든 모드), 포스트플랍 벳 직면 = 팟 오즈(큰 벳 +6%p 여유), 체크 가능 = 전략 가이드.
// M3-P4b: 림퍼 뒤 아이솔 판정(spot 'vs_limp', Gto.preflopHint의 limpers, size, alt), PATTERNS.overlimp, grade의 estimated.
// 별표, 금색 버튼, 신호등, 실수 기록, 약점 가중치, 핸드 총평이 모두 이 판정 하나를 따른다.
var Coach = (function() {
  var KOR = { fold: '폴드', check: '체크', call: '콜', raise: '레이즈', allin: '올인' };
  var BEHIND = { UTG: 5, HJ: 4, CO: 3, BTN: 2, SB: 1 };

  function _clip(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function _pct(x) { return Math.round((x || 0) * 100); }
  function _toCall(state) {
    if (!state) return 0;
    var h = (state.playerBets && state.playerBets.Hero) || 0;
    return Math.max(0, (state.currentBet || 0) - h);
  }
  function _heroPos(state, heroPos) {
    return heroPos || (state && state.players && state.players.Hero && state.players.Hero.pos) || 'BTN';
  }

  function category(a) {
    if (a === 'fold') return 'fold';
    if (a === 'check' || a === 'call') return 'call';
    if (a === 'raise' || a === 'allin' || a === 'raise_half' || a === 'raise_pot' || a === 'bet') return 'raise';
    return 'call';
  }

  var _pctCache = {};
  function rangePct(arr) {
    if (!arr || !arr.length || typeof Gto === 'undefined' || !Gto.rangeClassSet) return 0;
    var key = arr.join(',');
    if (_pctCache[key] != null) return _pctCache[key];
    var set = Gto.rangeClassSet(arr);
    var combos = 0;
    if (set) set.forEach(function(c) {
      combos += c.length === 2 ? 6 : (c.charAt(2) === 's' ? 4 : 12);
    });
    var r = combos / 1326;
    _pctCache[key] = r;
    return r;
  }

  function _label(action, toCall, street) {
    if (action === 'raise') return (toCall === 0 && street !== 'preflop') ? '벳' : '레이즈';
    return KOR[action] || action;
  }

  // 전략 가이드 문구를 초보자 말로
  function _plain(reason) {
    var s = String(reason || '');
    var MAP = [
      ['이니셔티브', '주도권'], ['c-bet', 'c-벳(프리플랍 레이저의 플랍 벳)'], ['도네벳', '선제 벳'],
      ['역임플라이드', '더 큰 손해 위험'], ['레인지 우위', '강한 패를 더 많이 가진 쪽'],
      ['블러프캐처', '상대 블러프만 이기는 패'], ['에쿼티', '승률']
    ];
    MAP.forEach(function(p) { s = s.split(p[0]).join(p[1]); });
    return _clip(s, 70);
  }

  function _base(state, ev, eq, heroPos) {
    var toCall = _toCall(state);
    var hand = '';
    if (state && state.heroCards && state.heroCards.length === 2 && typeof Range !== 'undefined') {
      hand = Range.handClass(state.heroCards[0], state.heroCards[1]);
    }
    return {
      street: state ? state.street : null, eq: eq || 0, potOdds: 0, need: 0, marginal: false,
      toCall: toCall, pot: state ? state.pot : 0, hand: hand, opener: null, strength: null, draw: false
    };
  }

  function _postInfo(V, state) {
    if (state && state.street !== 'preflop' && state.board && state.board.length >= 3) {
      if (typeof Villain !== 'undefined' && Villain._handStrength) {
        try { V.strength = Villain._handStrength(state.heroCards, state.board); } catch (e) { V.strength = null; }
      }
      if (typeof PostflopGuide !== 'undefined' && PostflopGuide.hasDraw) {
        V.draw = !!PostflopGuide.hasDraw(state.heroCards, state.board);
      }
    }
  }

  function _evVerdict(V, ev) {
    ev = ev || {};
    var key = ev.bestAction || 'call';
    if (key === 'fold' && V.toCall === 0) key = 'call';
    var cat = category(key);
    var action = cat === 'call' ? (V.toCall === 0 ? 'check' : 'call') : cat;
    V.action = action; V.evKey = key; V.source = 'ev'; V.spot = 'ev';
    V.concept = V.concept || (V.street === 'preflop' ? 'rfi' : V.street === 'flop' ? 'board_texture' : 'turn_river');
    V.label = _label(action, V.toCall, V.street);
    V.why = 'EV 근사 기준 최선: ' + V.label;
    return V;
  }

  function _bbNum(x) { return String(Math.round((x || 0) * 100) / 100); }

  function _chartWhy(V, pos, hint) {
    var hand = V.hand || '이 패';
    var lbl = V.label;
    if (V.spot === 'vs_limp') {
      var n = V.limpers || 1, sz = _bbNum(V.size) + 'bb';
      var GR = (typeof Gto !== 'undefined' && Gto.GTO_RANGES) ? Gto.GTO_RANGES : null;
      var isoArr = !GR ? null : pos === 'BB' ? GR.vsLimpBB : (GR.rfi ? GR.rfi[pos] : null);
      var ip = isoArr ? Math.round(rangePct(isoArr) * 100) : 0;
      var top = ip ? '(상위 약 ' + ip + '%)' : '';
      if (pos === 'BB') {
        if (V.action === 'raise') return '림퍼 ' + n + '명, BB에서 ' + hand + '는 아주 강한 패' + top + ' → ' + sz + '로 아이솔 레이즈';
        if (V.alt === 'raise') return '림퍼 ' + n + '명, BB에서 ' + hand + '는 공짜 체크도, ' + sz + ' 아이솔 레이즈도 괜찮아요';
        return '림퍼만 있으면 BB는 공짜로 플랍을 봐요 → ' + hand + '는 체크';
      }
      if (V.action === 'raise') return '림퍼 ' + n + '명, ' + pos + '에서 ' + hand + '는 오픈 레인지' + top + ' 안 → ' + sz + '로 아이솔 레이즈';
      return '림퍼가 있어도 ' + pos + ' 오픈 레인지' + top + ' 밖이면 폴드 → ' + hand + '는 따라 콜 말고 폴드';
    }
    if (V.spot === 'rfi') {
      if (pos === 'BB' && V.action === 'check') return '아무도 레이즈 안 했으니 공짜로 플랍을 봐요 → 체크';
      var arr = (typeof Gto !== 'undefined' && Gto.GTO_RANGES && Gto.GTO_RANGES.rfi) ? Gto.GTO_RANGES.rfi[pos] : null;
      var p = arr ? Math.round(rangePct(arr) * 100) : 0;
      if (V.action === 'raise') {
        return pos + '에서 ' + hand + '는 오픈 레인지' + (p ? '(상위 약 ' + p + '%)' : '') + ' 안 → 레이즈';
      }
      if (V.action === 'fold') {
        var n = BEHIND[pos];
        return pos + '는 ' + (n ? '뒤에 ' + n + '명이 남아 ' : '') + (p ? '상위 약 ' + p + '% 패만 ' : '강한 패만 ') +
          '오픈해요 → ' + hand + '는 폴드';
      }
      return pos + '에서 ' + hand + ' → ' + lbl;
    }
    if (V.spot === 'vs_open') {
      var opp = V.opener || '상대';
      if (V.action === 'raise') return opp + ' 오픈에 ' + hand + '는 3벳 레인지 → 레이즈(3벳)';
      if (V.action === 'call') return V.concept === 'blind_defense' ? '이미 낸 칩이 있어 싸게 방어 → 콜' : hand + '는 콜 레인지 → 콜';
      if (V.action === 'fold') return opp + ' 오픈 상대로 ' + hand + '는 약해요 → 폴드';
      return hand + ' → ' + lbl;
    }
    return '3벳 이상을 맞으면 훨씬 강한 패만 계속해요 → ' + lbl;
  }

  function verdict(state, ev, eq, heroPos, opts) {
    var V = _base(state, ev, eq, heroPos);
    var pos = _heroPos(state, heroPos);
    if (!state) return _evVerdict(V, ev);

    if (state.street === 'preflop') {
      var h = null;
      if (typeof Gto !== 'undefined' && Gto.preflopHint) {
        try { h = Gto.preflopHint(state, pos); } catch (e) { h = null; }
      }
      if (!h) return _evVerdict(V, ev);
      var m;
      if (h.action === 'raise') m = ['raise', 'raise_half'];
      else if (h.action === 'call') m = ['call', 'call'];
      else if (h.action === 'check') m = ['check', 'call'];
      else m = V.toCall === 0 ? ['check', 'call'] : ['fold', 'fold'];
      V.action = m[0]; V.evKey = m[1]; V.source = 'chart';
      var f = h.facing;
      // 림퍼 뒤(레이즈 없음, 팟 > 1.5bb)는 'vs_limp': 아이솔 판정, 개념은 오픈과 같은 'rfi'(s2-05)
      var iso = f === false && h.limpers > 0;
      V.spot = iso ? 'vs_limp' : f === false ? 'rfi' : f === true ? 'vs_open' : f === 'vs3bet' ? 'vs_3bet'
        : f === 'vs4bet' ? 'vs_4bet' : f === 'cold3bet' ? 'cold_3bet' : 'vs_3bet';
      if (iso) { V.limpers = h.limpers; V.size = h.size; V.alt = h.alt || null; }
      V.concept = (V.spot === 'rfi' || V.spot === 'vs_limp') ? 'rfi'
        : V.spot === 'vs_open' ? ((pos === 'SB' || pos === 'BB') ? 'blind_defense' : 'vs_rfi') : 'vs_3bet';
      var lr = state.lastRaiser;
      V.opener = h.opener || ((lr && lr !== 'Hero' && state.players && state.players[lr]) ? state.players[lr].pos : null) || null;
      V.label = _label(V.action, V.toCall, 'preflop');
      if (iso && V.alt) V.label += ' 또는 ' + _label(V.alt, V.toCall, 'preflop');   // BB: 둘 다 정답('체크 또는 레이즈')
      V.why = _clip(_chartWhy(V, pos, h), 70);
      return V;
    }

    _postInfo(V, state);
    var g = null;
    if (typeof PostflopGuide !== 'undefined' && PostflopGuide.guide) {
      try { g = PostflopGuide.guide(state); } catch (e) { g = null; }
    }

    if (V.toCall > 0) {
      var toCall = V.toCall, pot = state.pot || 0;
      V.spot = 'facing_bet'; V.source = 'potodds';
      V.potOdds = (pot + toCall) > 0 ? toCall / (pot + toCall) : 0;
      var betBefore = Math.max(0.1, pot - toCall);
      var bigBet = toCall >= 0.66 * betBefore;
      V.need = V.potOdds + (bigBet ? 0.06 : 0);
      V.marginal = Math.abs(V.eq - V.need) < 0.04;
      V.concept = V.draw ? 'draws' : 'pot_odds';
      var po = _pct(V.potOdds), eqp = _pct(V.eq);
      var extra = bigBet ? '+여유 6%p(큰 벳)' : '';
      if (V.eq >= V.need) {
        if (g && g.action === 'raise') {
          V.action = 'raise'; V.evKey = 'raise_half'; V.why = '아주 강한 패 → 레이즈로 팟 키우기';
        } else {
          V.action = 'call'; V.evKey = 'call';
          V.why = '필요 승률 ' + po + '%' + extra + ' < 내 승률 ' + eqp + '% → 콜 (10번 중 ' + (V.eq * 10).toFixed(1) + '번)';
        }
      } else {
        V.action = 'fold'; V.evKey = 'fold';
        V.why = '필요 승률 ' + po + '%' + extra + ' > 내 승률 ' + eqp + '% → 폴드';
      }
      V.label = _label(V.action, toCall, state.street);
      V.why = _clip(V.why, 70);
      return V;
    }

    // 체크 가능(공짜) 스팟
    V.spot = 'free';
    if (!g) {
      V.spot = 'free';
      var r = _evVerdict(V, ev);
      r.spot = 'free';
      return r;
    }
    if (g.action === 'bet' || g.action === 'raise') { V.action = 'raise'; V.evKey = 'raise_half'; }
    else { V.action = 'check'; V.evKey = 'call'; }
    V.source = 'guide';
    V.why = _plain(g.reason);
    var aggr = (typeof PostflopGuide !== 'undefined' && PostflopGuide.heroIsAggressor) ? PostflopGuide.heroIsAggressor(state) : false;
    V.concept = (state.street === 'flop' && aggr) ? 'cbet'
      : V.action === 'raise' ? 'value_bluff'
      : state.street === 'flop' ? 'board_texture' : 'turn_river';
    V.label = _label(V.action, 0, state.street);
    return V;
  }

  function _res(light, delta, pattern, action, why) {
    var title = light === 'green' ? '좋은 ' + KOR[action] : light === 'yellow' ? '아쉬운 ' + KOR[action] : '손해 ' + KOR[action];
    return { light: light, delta: Math.min(0, Math.round(delta * 100) / 100), pattern: pattern || null,
      title: title, why: _clip(why, 80) };
  }

  // 포스트플랍 공짜 상황(콜 0)의 레이즈는 실제로 "벳", 판정 제목도 벳으로 표기(프리플랍 BB의 레이즈는 레이즈 그대로)
  // estimated: delta가 EV 계산이 아니라 고정 벌점(차트, 가이드, 공짜 체크 폴드, 팟 오즈 고정값)이면 true.
  //   화면은 이 delta를 bb 숫자 대신 '큰 실수/작은 실수'로만 보이고(설계서 8.2절 6번), 여정 통계는 payload.estimated로 받는다.
  function grade(V, action, ev, state) {
    var r = _grade(V, action, ev, state);
    if (r && V && V.toCall === 0 && V.street !== 'preflop' && r.title && category(action) === 'raise' && action !== 'allin') r.title = r.title.replace('레이즈', '벳');
    if (r && V && (V.source === 'chart' || V.source === 'guide')) r.estimated = true;
    return r;
  }

  function _fixed(r) { r.estimated = true; return r; }

  function _grade(V, action, ev, state) {
    ev = ev || {};
    if (!V) return null;
    var cat = category(action), vcat = category(V.action);
    if (!KOR[action]) action = cat === 'raise' ? 'raise' : cat;
    if (V.toCall === 0 && action === 'fold') {
      return { light: 'red', delta: -2.0, pattern: 'fold_free_check', title: '공짜 체크를 폴드',
        why: '콜할 돈이 0이면 체크! 공짜로 다음 카드를 볼 수 있어요', estimated: true };
    }
    if (cat === vcat) return _res('green', 0, null, action, V.why);

    var needP = _pct(V.need != null ? V.need : V.potOdds), eqp = _pct(V.eq);

    if (V.source === 'chart') {
      var pattern = null, red = false;
      var rfi = V.spot === 'rfi', iso = V.spot === 'vs_limp';
      // BB(콜 0)의 림퍼 상대: 체크와 아이솔 레이즈가 둘 다 정답인 손(V.alt)
      if (iso && V.alt && category(V.alt) === cat) return _res('green', 0, null, action, V.why);
      var bbIso = iso && V.toCall === 0;   // BB는 콜로 따라 들어갈 수 없으니 오버림프가 아니다
      if (vcat === 'fold' && cat === 'raise') pattern = (rfi || iso) ? 'open_too_loose' : 'call_too_loose_pre';
      else if (vcat === 'fold' && cat === 'call') pattern = rfi ? 'limp' : iso ? 'overlimp' : 'call_too_loose_pre';
      // 림퍼 뒤 아이솔 손을 폴드: 아이솔 표는 림퍼 수와 상관없는 오픈 표라 놓친 기회일 뿐, 작은 실수이고 패턴 없음
      else if (vcat !== 'fold' && cat === 'fold') pattern = iso ? null : 'fold_too_tight_pre';
      else if (V.action === 'raise' && cat === 'call') pattern = rfi ? 'limp' : (iso && !bbIso) ? 'overlimp' : null;
      if (vcat === 'fold' && cat !== 'fold') {
        var cards = state && state.heroCards;
        var btnRaise = false;
        if (cards && typeof Gto !== 'undefined' && Gto.gtoAction) {
          try { btnRaise = Gto.gtoAction('BTN', cards) === 'raise'; } catch (e) { btnRaise = false; }
        }
        red = !btnRaise;
      }
      if (V.action === 'raise' && cat === 'fold' && !iso) red = true;
      return _res(red ? 'red' : 'yellow', red ? -2.0 : -0.5, pattern, action,
        '레인지 차트 정답은 ' + V.label + ': ' + V.why);
    }

    if (V.source === 'potodds') {
      if (V.marginal) {
        if (cat === 'raise') return _fixed(_res('yellow', -0.3, null, action, '아슬아슬한 스팟이라 콜이나 폴드로 충분해요'));
        var r = _res('green', 0, null, action,
          '필요 승률 ' + needP + '%와 내 승률 ' + eqp + '%가 거의 같아요: 콜, 폴드 모두 큰 차이 없음');
        r.title = '아슬아슬한 스팟';
        return r;
      }
      if (cat !== 'fold' && vcat === 'fold') {
        var callEV = ev.call != null ? ev.call : -((V.toCall || 0) * (1 - V.eq) - V.eq * (V.pot || 0));
        var d = Math.min(-0.3, callEV);
        return _res(d < -1.5 ? 'red' : 'yellow', d, 'call_below_odds', action,
          '필요 승률 ' + needP + '%인데 내 승률 ' + eqp + '%: 콜할수록 손해');
      }
      if (cat === 'fold' && vcat !== 'fold') {
        var d2 = -Math.max(0.3, ev.call || 0);
        return _res(d2 < -1.5 ? 'red' : 'yellow', d2, 'fold_above_odds', action,
          '내 승률 ' + eqp + '%가 필요 승률 ' + needP + '%보다 높아요: 콜이 이득');
      }
      if (cat === 'raise' && vcat === 'call') return _fixed(_res('yellow', -0.3, null, action, '콜로 충분해요: ' + V.why));
      if (cat === 'call' && vcat === 'raise') return _fixed(_res('yellow', -0.3, 'missed_value', action, '아주 강한 패는 레이즈로 칩을 받아내요'));
    }

    if (V.source === 'guide') {
      if (vcat === 'raise' && cat === 'call') {
        if (V.strength === 'nut' || V.strength === 'strong') {
          return _res('yellow', -0.3, 'missed_value', action, '강한 패는 벳해서 칩을 받아내요(밸류벳)');
        }
        return _res('green', 0, null, action, '벳도 좋지만 체크도 괜찮은 스팟');
      }
      if (vcat === 'call' && cat === 'raise') {
        if ((V.strength === 'air' || V.strength === 'weak-pair') && !V.draw) {
          return _res('yellow', -0.3, 'bluff_no_reason', action, '벳할 근거(강한 패나 드로우)가 약해요: 체크로 싸게 보기');
        }
        return _res('green', 0, null, action, '탑페어 이상이거나 드로우가 있어 벳도 괜찮아요');
      }
    }

    // source 'ev' (및 예외 폴백)
    var heroKey = action === 'fold' ? 'fold' : (action === 'check' || action === 'call') ? 'call'
      : action === 'allin' ? 'allin' : 'raise_half';
    var delta = (ev[heroKey] || 0) - (ev[V.evKey] || 0);
    if (!(delta < 0)) delta = 0;
    var light = delta >= -0.3 ? 'green' : delta >= -1.5 ? 'yellow' : 'red';
    return _res(light, delta, null, action, light === 'green' ? V.why : 'EV 근사 기준 최선은 ' + V.label + '이에요');
  }

  function _tc(state) { return state ? _toCall(state) : 0; }
  function _pre(state) { return !!state && state.street === 'preflop'; }
  function _unopened(state) {
    return _pre(state) && (state.currentBet || 0) <= (state.bigBlind || 1) &&
      !(state.players && state.players.Hero && state.players.Hero.pos === 'BB');
  }
  function _opened(state) { return _pre(state) && (state.currentBet || 0) > (state.bigBlind || 1); }
  function _post(state) { return !!state && !!state.street && state.street !== 'preflop'; }
  // 림퍼가 있는 미오픈 팟(BB 제외): Gto.limperCount와 같은 셈(ev.js:28-32)
  function _limped(state) {
    if (!_unopened(state) || typeof Gto === 'undefined' || !Gto.limperCount) return false;
    try { return Gto.limperCount(state) > 0; } catch (e) { return false; }
  }

  var PATTERNS = {
    fold_free_check: { label: '공짜 체크를 폴드', rule: '콜할 돈이 0이면 무조건 체크', concept: 'actions',
      goal: '콜 금액이 0이면 무조건 체크 버튼', spotTest: function(s) { return !!s && _tc(s) === 0; } },
    call_below_odds: { label: '필요 승률보다 낮은 승률로 콜', rule: '콜 전에 링의 %(필요 승률)와 내 승률 비교', concept: 'pot_odds',
      goal: '콜하기 전, 링의 %와 내 승률을 먼저 비교하기', spotTest: function(s) { return _post(s) && _tc(s) > 0; } },
    fold_above_odds: { label: '승률이 충분한데 폴드', rule: '내 승률 > 필요 승률이면 콜', concept: 'pot_odds',
      goal: '필요 승률보다 내 승률이 높으면 콜로 따라가기', spotTest: function(s) { return _post(s) && _tc(s) > 0; } },
    open_too_loose: { label: '앞자리에서 너무 넓게 오픈', rule: '앞자리일수록 차트의 레이즈 칸만 오픈', concept: 'rfi',
      goal: 'UTG, HJ에서는 차트 레이즈 칸 핸드만 오픈하기', spotTest: function(s) { return _unopened(s); } },
    limp: { label: '림프(레이즈 없이 콜로 참여)', rule: '먼저 들어갈 땐 레이즈 아니면 폴드', concept: 'rfi',
      goal: '먼저 들어갈 땐 레이즈 아니면 폴드, 콜로 들어가지 않기', spotTest: function(s) { return _unopened(s) && !_limped(s); } },
    overlimp: { label: '오버림프(림퍼 뒤에 콜로 따라 들어가기)', rule: '림퍼가 있으면 아이솔 레이즈 아니면 폴드', concept: 'rfi',
      goal: '앞에 림퍼가 있으면 오픈 사이즈 + 림퍼당 1bb로 레이즈하거나 폴드하기', spotTest: function(s) { return _limped(s); } },
    call_too_loose_pre: { label: '상대 오픈에 너무 넓게 참여', rule: '앞자리 오픈일수록 강한 패만 콜, 3벳', concept: 'vs_rfi',
      goal: '상대 오픈에는 차트의 콜, 3벳 칸만 참여하기', spotTest: function(s) { return _opened(s); } },
    fold_too_tight_pre: { label: '참여해야 할 패를 폴드', rule: '차트의 콜, 3벳 칸은 버리지 않기', concept: 'vs_rfi',
      goal: '블라인드에선 이미 낸 칩이 있으니 차트대로 넓게 방어하기', spotTest: function(s) { return _opened(s); } },
    missed_value: { label: '강한 패로 소극적 플레이', rule: '투페어 이상이면 벳, 레이즈로 칩 받아내기', concept: 'value_bluff',
      goal: '투페어 이상이면 벳을 먼저 생각하기', spotTest: function(s) { return _post(s); } },
    bluff_no_reason: { label: '이유 없는 벳', rule: '벳은 강한 패나 드로우가 있을 때', concept: 'value_bluff',
      goal: '벳하기 전에 강한 패인지, 드로우인지 확인하기', spotTest: function(s) { return _post(s) && _tc(s) === 0; } }
  };

  function _top(counts, min) {
    var best = null, bn = 0;
    Object.keys(counts || {}).forEach(function(k) {
      var n = counts[k] || 0;
      if (PATTERNS[k] && n >= min && n > bn) { best = k; bn = n; }
    });
    return best;
  }

  function goalFor(handCounts, sessionCounts) {
    var t = _top(handCounts, 1);
    if (t) return PATTERNS[t].goal;
    t = _top(sessionCounts, 2);
    if (t) return PATTERNS[t].goal;
    return '🟢 이번 핸드는 정답! 다음에도 결정 전에 필요 승률 vs 내 승률을 먼저 떠올리기';
  }

  var api = { verdict: verdict, grade: grade, category: category, PATTERNS: PATTERNS, goalFor: goalFor, rangePct: rangePct };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
