// engine/coach.js — 8차 WP2: 단일 코치 판정
// 프리플랍 = 레인지 차트(모든 모드), 포스트플랍 벳 직면 = 팟 오즈(M5-COACH: 다음 1장, 축소 레인지 기준), 체크 가능 = 전략 가이드.
// M3-P4b: 림퍼 뒤 아이솔 판정(spot 'vs_limp', Gto.preflopHint의 limpers, size, alt), PATTERNS.overlimp, grade의 estimated.
// M4-P9: 아이솔 표는 림퍼 수로 좁힌다(V.isoPos = Gto.preflopHint의 isoPos, 림퍼 2명 이상이면 한 칸 좁은 자리 표).
// M5-COACH: 벳 직면은 상대 레인지 축소 1단계(narrowRange, 'air' 하위 절반 제거) 뒤 플랍/턴은 다음 1장 에쿼티(V.eqNext,
//   basis 'next'), 리버는 축소 레인지 열거(basis 'river')로 필요 승률과 비교한다(V.eqUsed). '큰 벳 +6%p'는 예전 경로(basis 'eq')에만.
//   플랍에서 콜이 곧 올인(더 벳 없음)이면 리버까지 본 승률(basis 'allin', 넘겨받은 eq)로 판정한다(아웃츠 x4가 맞는 경우).
//   공짜 스팟은 PostflopGuide.guide(state, { eq })(F5), 승률 규칙 벳을 체크하면 missed_value 노란불. 결과는 여전히 코치 참고.
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
    // 긴 합성어를 먼저 바꾼다(M7 CO-04: '폴드에쿼티'가 '폴드승률', '레인지 우위로'가 '...가진 쪽로'로 깨지던 것)
    var MAP = [
      ['폴드에쿼티', '상대가 접을 가능성'], ['폴드 에쿼티', '상대가 접을 가능성'], ['에쿼티 거부', '드로우에 비싼 값 물리기'],
      ['레인지 우위로', '강한 패를 더 많이 가진 쪽이라'],
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

  // ── 레인지 축소 1단계(M5-COACH, 설계서 10절 8번 (b), 코치 참고용) ──
  // narrowRange(range, heroCards, board) → { combos:['AhKd', ...], before, after, air, removed } 또는 null.
  //   range(state.villainRange: 클래스 라벨 배열 또는 Set, 콤보 4글자도 가능, null = 랜덤)를 콤보로 펴고 내 카드와 보드를 뺀 뒤,
  //   Villain._handStrength가 'air'인 콤보를 약한 순으로 세워 하위 절반(내림)을 지운다.
  //   약한 순 = 드로우(PostflopGuide.hasDraw) 없는 콤보 먼저, 같으면 지금 족보 점수가 낮은 콤보 먼저, 같으면 콤보 글자순(결정론).
  //   상대가 이번 스트리트에 벳/레이즈했다는 사실만 쓰는 1단계라 스트리트마다 프리플랍 레인지에서 새로 한 번만 지운다.
  function _sc(ev) {
    var s = (10 - ev.type) * 1048576, tb = ev.tiebreakers, m = 65536;
    for (var i = 0; i < tb.length && i < 5; i++) { s += tb[i] * m; m /= 16; }
    return s;
  }
  function _obj2(cb) { return [{ rank: cb.charAt(0), suit: cb.charAt(1) }, { rank: cb.charAt(2), suit: cb.charAt(3) }]; }
  function narrowRange(range, heroCards, board) {
    if (typeof Equity === 'undefined' || !Equity.liveCombos || typeof Villain === 'undefined' || !Villain._handStrength) return null;
    if (!heroCards || heroCards.length !== 2 || !board || board.length < 3) return null;
    var all = Equity.liveCombos(range, heroCards.concat(board));
    if (!all.length) return null;
    var air = [], keep = [];
    all.forEach(function(cb) {
      var h = _obj2(cb), s = null;
      try { s = Villain._handStrength(h, board); } catch (e) { s = null; }
      if (s !== 'air') { keep.push(cb); return; }
      var d = (typeof PostflopGuide !== 'undefined' && PostflopGuide.hasDraw) ? !!PostflopGuide.hasDraw(h, board) : false;
      var ev = (typeof HandEval !== 'undefined' && HandEval.evaluate) ? HandEval.evaluate(h.concat(board)) : null;
      air.push({ cb: cb, d: d ? 1 : 0, s: ev ? _sc(ev) : 0 });
    });
    air.sort(function(a, b) { return (a.d - b.d) || (a.s - b.s) || (a.cb < b.cb ? -1 : a.cb > b.cb ? 1 : 0); });
    var cut = Math.floor(air.length / 2);
    var left = keep.concat(air.slice(cut).map(function(x) { return x.cb; }));
    return { combos: left, before: all.length, after: left.length, air: air.length, removed: cut };
  }

  // 콜하면 더 벳할 사람이 없는 올인인지(M5-COACH 리뷰): 내 스택이 콜 금액 이하(콜이 곧 올인), 또는 폴드 안 한 상대가 모두 스택 0.
  //   그러면 남은 카드를 끝까지 공짜로 보므로(아웃츠 x4가 맞는 경우) 다음 1장이 아니라 리버까지 본 승률로 판정한다.
  function _allInCall(state, toCall) {
    var st = state.stacks || {};
    if (typeof st.Hero === 'number' && st.Hero <= toCall + 1e-9) return true;
    var ps = state.players || {}, fd = state.folded || {}, names = Object.keys(ps), any = false;
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (n === 'Hero' || fd[n]) continue;
      if (typeof st[n] !== 'number' || st[n] > 1e-9) return false;
      any = true;
    }
    return any;
  }

  // 벳 직면 판정 근거(M5-COACH). V.basis = 'next'(플랍/턴: 축소 레인지 상대 다음 1장 에쿼티 V.eqNext),
  //   'river'(리버: 축소 레인지 상대 지금 승부 열거), 'eq'(예전: 넘겨받은 eq = 리버까지 MC, Equity가 없거나 opts.basis 'eq'),
  //   'allin'(플랍 올인 콜: 턴과 리버를 다 보므로 넘겨받은 eq = 리버까지 본 HUD 승률 그대로, 큰 벳 +6%p 없음.
  //   턴 올인은 다음 1장이 곧 리버라 'next'가 그대로 맞다).
  //   V.eqUsed = 필요 승률과 비교한 승률, V.range = { before, after, removed }(축소했을 때). 결과는 코치 참고(승급 기준 아님).
  //   opts.narrow === false: state.villainRange가 이미 상대 벳 레인지(명시 레인지 퍼즐)라 지우지 않는다.
  function _betEq(V, state, opts) {
    V.basis = 'eq'; V.eqUsed = V.eq; V.eqNext = null; V.range = null;
    if (opts && opts.basis === 'eq') return;
    var nb = state.board ? state.board.length : 0;
    if (nb < 3 || nb > 5) return;
    if (nb === 3 && _allInCall(state, V.toCall)) { V.basis = 'allin'; return; }
    if (typeof Equity === 'undefined' || !Equity._nextInfo) return;
    var range = state.villainRange || null, nr = null, r = null;
    try {
      if (!(opts && opts.narrow === false)) {
        nr = narrowRange(range, state.heroCards, state.board);
        if (nr) range = nr.combos;
      }
      r = Equity._nextInfo(state.heroCards, range, state.board);
    } catch (e) { r = null; }
    if (!r) return;
    V.basis = nb === 5 ? 'river' : 'next';
    V.eqUsed = r.eq;
    if (nb < 5) V.eqNext = r.eq;
    if (nr) V.range = { before: nr.before, after: nr.after, removed: nr.removed };
  }

  // 판정 근거 라벨(화면 문구 앞머리). 'eq'(예전 경로)는 빈 문자열
  function basisLabel(basis) {
    return basis === 'next' ? '다음 1장 기준(참고)' : basis === 'river' ? '상대 벳 레인지 기준(참고)'
      : basis === 'allin' ? '올인이라 리버까지(참고)' : '';
  }
  // 문장 안에서 쓰는 승률 이름: '내 승률'(예전), '다음 1장 기준 승률', '상대 벳 레인지 기준 승률', '리버까지 본 승률'(올인)
  function _eqName(V) {
    return V && V.basis === 'next' ? '다음 1장 기준 승률' : V && V.basis === 'river' ? '상대 벳 레인지 기준 승률'
      : V && V.basis === 'allin' ? '리버까지 본 승률' : '내 승률';
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

  // 이유 문구의 '상위 약 n%': 입문은 Gto.GTO_RANGES 표(rangePct), 표준 티어(V.tierLabel 'chart-std')는 GtoStd.RANGES의 콤보 가중 빈도.
  //   key 'rfi'(자리 at의 오픈 표) | 'vsLimpBB'. 표가 없으면 0
  function _tablePct(V, key, at) {
    try {
      if (V && V.tierLabel === 'chart-std' && typeof GtoStd !== 'undefined' && GtoStd && GtoStd.RANGES && typeof GtoStd.freq === 'function') {
        var sp = key === 'vsLimpBB' ? GtoStd.RANGES.vsLimpBB : (GtoStd.RANGES.rfi ? GtoStd.RANGES.rfi[at] : null);
        return sp ? Math.round(GtoStd.freq(sp).total * 100) : 0;
      }
      var GR = (typeof Gto !== 'undefined' && Gto.GTO_RANGES) ? Gto.GTO_RANGES : null;
      var arr = !GR ? null : key === 'vsLimpBB' ? GR.vsLimpBB : (GR.rfi ? GR.rfi[at] : null);
      return arr ? Math.round(rangePct(arr) * 100) : 0;
    } catch (e) { return 0; }
  }

  function _chartWhy(V, pos, hint) {
    var hand = V.hand || '이 패';
    var lbl = V.label;
    if (V.spot === 'vs_limp') {
      var n = V.limpers || 1, sz = _bbNum(V.size) + 'bb';
      // 아이솔 기준 표(M4-P9): 림퍼 1명 = 내 자리 RFI 표, 2명 이상 = 한 칸 좁은 자리(V.isoPos) RFI 표, BB = vsLimpBB
      var isoAt = V.isoPos || pos;
      var ip = _tablePct(V, pos === 'BB' ? 'vsLimpBB' : 'rfi', isoAt);
      var top = ip ? '(상위 약 ' + ip + '%)' : '';
      if (pos === 'BB') {
        if (V.action === 'raise') return '림퍼 ' + n + '명, BB에서 ' + hand + '는 아주 강한 패' + top + ' → ' + sz + '로 아이솔 레이즈';
        if (V.alt === 'raise') return '림퍼 ' + n + '명, BB에서 ' + hand + '는 공짜 체크도, ' + sz + ' 아이솔 레이즈도 괜찮아요';
        return '림퍼만 있으면 BB는 공짜로 플랍을 봐요 → ' + hand + '는 체크';
      }
      if (isoAt !== pos) {
        // 림퍼 2명 이상: 한 칸 좁은 표 기준(예: CO에서 림퍼 2명 → HJ 표)
        var narrow = '림퍼 ' + n + '명, 2명 이상이면 한 칸 좁은 ' + isoAt + ' 오픈 표' + top;
        if (V.action === 'raise') return narrow + ' → ' + hand + '는 ' + sz + '로 아이솔 레이즈';
        return narrow + ' → ' + hand + '는 표 밖, 따라 콜 말고 폴드';
      }
      if (V.action === 'raise') return '림퍼 ' + n + '명, ' + pos + '에서 ' + hand + '는 오픈 레인지' + top + ' 안 → ' + sz + '로 아이솔 레이즈';
      return '림퍼가 있어도 ' + pos + ' 오픈 레인지' + top + ' 밖이면 폴드 → ' + hand + '는 따라 콜 말고 폴드';
    }
    if (V.spot === 'rfi') {
      if (pos === 'BB' && V.action === 'check') return '아무도 레이즈 안 했으니 공짜로 플랍을 봐요 → 체크';
      var p = _tablePct(V, 'rfi', pos);
      if (V.action === 'raise') {
        return pos + '에서 ' + hand + '는 오픈 레인지' + (p ? '(상위 약 ' + p + '%)' : '') + ' 안 → 레이즈';
      }
      if (V.action === 'fold') {
        var n = BEHIND[pos];
        // BTN(버튼)은 받침이 있어 '은', 나머지 자리 이름은 '는'
        return pos + (pos === 'BTN' ? '은 ' : '는 ') + (n ? '뒤에 ' + n + '명이 남아 ' : '') + (p ? '상위 약 ' + p + '% 패만 ' : '강한 패만 ') +
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

  // M7 CO-01: 벳을 맞았을 때 밸류 레이즈도 정답인 손. 셋 이상(strong)과, 내 카드 두 장이 모두 만든 투페어와 트립스(medium).
  //   탑페어와 오버페어(보드 페어에 얹힌 투페어 포함)는 콜이 기본이라 넣지 않는다. 승률 70% 이상일 때만(리버 얇은 밸류 제외)
  var VALUE_RAISE_EQ = 0.7;
  function _valueRaiseHand(V, state) {
    if (V.strength === 'nut' || V.strength === 'strong') return true;
    if (V.strength !== 'medium' || typeof HandEval === 'undefined' || !HandEval || !HandEval.evaluate) return false;
    var h = state && state.heroCards, b = state && state.board;
    if (!h || h.length !== 2 || !b || b.length < 3) return false;
    var t = HandEval.evaluate(h.concat(b)).type;
    // medium의 트립스(보드 페어 + 내 카드 1장)는 레이즈도 정답. 4장 플러시 보드의 낮은 플러시(medium, type 5)는 더 높은 플러시만
    //   따라오므로 넣지 않는다(M7 리뷰: 5하이 플러시 레이즈가 초록이던 것)
    if (t === 7) return true;
    if (t !== 8 || h[0].rank === h[1].rank) return false;
    var br = b.map(function(c) { return c.rank; });
    return br.indexOf(h[0].rank) >= 0 && br.indexOf(h[1].rank) >= 0;
  }

  // 표준 차트 티어(클라우드 E, GtoStd)가 켜져 있나: 설정 chartTier와 단계, 승급 시험과 미션 제외는 GtoStd.active가 판정한다.
  //   opts.tier 'beginner'|'standard'로 강제할 수 있다(시뮬과 테스트용). 스텁(STUB)이면 늘 입문.
  function _stdOn(state, opts) {
    if (typeof GtoStd === 'undefined' || !GtoStd || GtoStd.STUB || typeof GtoStd.preflopHint !== 'function') return false;
    if (opts && opts.tier === 'beginner') return false;
    if (opts && opts.tier === 'standard') return true;
    try { return typeof GtoStd.active === 'function' && GtoStd.active(state) === true; } catch (e) { return false; }
  }
  var _W_KOR = { raise: '레이즈', call: '콜', fold: '폴드' };
  // 표준 차트의 섞는 손 문구: 'A5s는 표준 차트(참고)로 레이즈 50%, 콜 50%로 섞는 손'
  function _mixWhy(V, w) {
    var parts = ['raise', 'call', 'fold'].filter(function(k) { return w[k] > 0.0001; })
      .map(function(k) { return _W_KOR[k] + ' ' + _pct(w[k]) + '%'; });
    return (V.hand || '이 패') + '는 표준 차트(참고)로 ' + parts.join(', ') + '로 섞는 손';
  }
  function _isMixed(w) { return !!w && ['raise', 'call', 'fold'].filter(function(k) { return w[k] > 0.0001; }).length > 1; }

  function verdict(state, ev, eq, heroPos, opts) {
    var V = _base(state, ev, eq, heroPos);
    var pos = _heroPos(state, heroPos);
    if (!state) return _evVerdict(V, ev);

    if (state.street === 'preflop') {
      var h = null, std = _stdOn(state, opts);
      if (std) {
        try { h = GtoStd.preflopHint(state, pos); } catch (e) { h = null; }
        if (!h) std = false;
      }
      if (!h && typeof Gto !== 'undefined' && Gto.preflopHint) {
        try { h = Gto.preflopHint(state, pos); } catch (e) { h = null; }
      }
      if (!h) return _evVerdict(V, ev);
      var m;
      if (h.action === 'raise') m = ['raise', 'raise_half'];
      else if (h.action === 'call') m = ['call', 'call'];
      else if (h.action === 'check') m = ['check', 'call'];
      else m = V.toCall === 0 ? ['check', 'call'] : ['fold', 'fold'];
      V.action = m[0]; V.evKey = m[1]; V.source = 'chart';
      if (std) V.tierLabel = 'chart-std';   // _chartWhy의 '상위 약 n%'가 표준 표 빈도를 쓰게 먼저 둔다
      var f = h.facing;
      // 림퍼 뒤(레이즈 없음, 팟 > 1.5bb)는 'vs_limp': 아이솔 판정, 개념은 오픈과 같은 'rfi'(s2-05)
      var iso = f === false && h.limpers > 0;
      V.spot = iso ? 'vs_limp' : f === false ? 'rfi' : f === true ? 'vs_open' : f === 'vs3bet' ? 'vs_3bet'
        : f === 'vs4bet' ? 'vs_4bet' : f === 'cold3bet' ? 'cold_3bet' : 'vs_3bet';
      if (iso) { V.limpers = h.limpers; V.size = h.size; V.alt = h.alt || null; V.isoPos = h.isoPos || null; }
      V.concept = (V.spot === 'rfi' || V.spot === 'vs_limp') ? 'rfi'
        : V.spot === 'vs_open' ? ((pos === 'SB' || pos === 'BB') ? 'blind_defense' : 'vs_rfi') : 'vs_3bet';
      var lr = state.lastRaiser;
      V.opener = h.opener || ((lr && lr !== 'Hero' && state.players && state.players[lr]) ? state.players[lr].pos : null) || null;
      V.label = _label(V.action, V.toCall, 'preflop');
      if (iso && V.alt) V.label += ' 또는 ' + _label(V.alt, V.toCall, 'preflop');   // BB: 둘 다 정답('체크 또는 레이즈')
      V.why = _clip(_chartWhy(V, pos, h), 70);
      if (std) {
        // 표준 티어(클라우드 E): 라벨 종류 'chart-std'(파란 칩 '이 앱 표준 차트 기준(참고)'), 빈도 w와 둘 다 정답 목록 ok.
        //   섞는 손은 이유 문구를 빈도로 바꾸고, 빈도 0.25 이상인 두 번째 액션을 라벨에 '또는'으로 붙인다(grade가 둘 다 초록).
        V.tierLabel = 'chart-std';
        V.w = h.w || null;
        V.ok = Array.isArray(h.ok) ? h.ok.slice() : null;
        if (_isMixed(V.w)) {
          var second = ['raise', 'call', 'fold'].filter(function(k) { return k !== category(V.action) && V.w[k] >= 0.25; })[0] || null;
          if (second && !(iso && V.alt)) {
            var alt2 = second === 'call' ? (V.toCall === 0 ? 'check' : 'call') : second === 'fold' ? (V.toCall === 0 ? 'check' : 'fold') : 'raise';
            if (category(alt2) !== category(V.action)) {
              if (iso) V.alt = alt2;
              V.label += ' 또는 ' + _label(alt2, V.toCall, 'preflop');
            }
          }
          V.why = _clip(_mixWhy(V, V.w), 70);
        }
      }
      return V;
    }

    _postInfo(V, state);
    var g = null, free = !(V.toCall > 0);
    if (typeof PostflopGuide !== 'undefined' && PostflopGuide.guide) {
      // F5: 공짜 스팟은 { eq }(가이드가 승률 >= EQ_VALUE면 체크 대신 밸류벳), 벳 직면은 예전 그대로 opts 없이
      try { g = free ? PostflopGuide.guide(state, { eq: V.eq }) : PostflopGuide.guide(state); } catch (e) { g = null; }
    }

    if (V.toCall > 0) {
      var toCall = V.toCall, pot = state.pot || 0;
      V.spot = 'facing_bet'; V.source = 'potodds';
      V.potOdds = (pot + toCall) > 0 ? toCall / (pot + toCall) : 0;
      _betEq(V, state, opts);
      var betBefore = Math.max(0.1, pot - toCall);
      var bigBet = toCall >= 0.66 * betBefore;
      // '큰 벳 +6%p'는 리버까지 MC(basis 'eq')의 임시 보정이라 그 경로에만 남긴다. 다음 1장과 축소 레인지 판정에는 더하지 않는다
      // (M5-COACH 표본 스팟 판정, j-coach-ext 테스트로 고정).
      var extraOn = bigBet && V.basis === 'eq';
      V.bigBet = bigBet;
      V.need = V.potOdds + (extraOn ? 0.06 : 0);
      V.marginal = Math.abs(V.eqUsed - V.need) < 0.04;
      V.concept = V.draw ? 'draws' : 'pot_odds';
      var po = _pct(V.potOdds), eqp = _pct(V.eqUsed);
      var extra = extraOn ? '+여유 6%p(큰 벳)' : '';
      var pre = basisLabel(V.basis);
      pre = pre ? pre + ' ' : '';
      if (V.eqUsed >= V.need) {
        if (g && g.action === 'raise') {
          V.action = 'raise'; V.evKey = 'raise_half'; V.why = '아주 강한 패 → 레이즈로 팟 키우기';
        } else {
          V.action = 'call'; V.evKey = 'call';
          V.why = pre + '필요 승률 ' + po + '%' + extra + ' < 내 승률 ' + eqp + '% → 콜 (10번 중 ' + (V.eqUsed * 10).toFixed(1) + '번)';
          // M7 CO-01: 셋, 스트레이트, 플러시와 내 카드로 만든 투페어 이상은 밸류 레이즈도 정답(콜이 기본, 레이즈도 초록)
          if (V.eqUsed >= VALUE_RAISE_EQ && _valueRaiseHand(V, state)) {
            V.alt = 'raise';
            V.why = pre + '필요 승률 ' + po + '%' + extra + ' < 내 승률 ' + eqp + '% → 콜, 강한 패라 레이즈도 좋아요';
          }
        }
      } else {
        V.action = 'fold'; V.evKey = 'fold';
        V.why = pre + '필요 승률 ' + po + '%' + extra + ' > 내 승률 ' + eqp + '% → 폴드';
      }
      V.label = _label(V.action, toCall, state.street);
      if (V.alt) V.label += ' 또는 ' + _label(V.alt, toCall, state.street);   // 둘 다 정답('콜 또는 레이즈')
      V.why = _clip(V.why, 70);
      return V;
    }

    // 체크 가능(공짜) 스팟
    V.spot = 'free';
    V.eqRule = !!(g && g.eqRule);
    if (!g) {
      V.spot = 'free';
      var r = _evVerdict(V, ev);
      r.spot = 'free';
      return r;
    }
    if (g.action === 'bet' || g.action === 'raise') { V.action = 'raise'; V.evKey = 'raise_half'; }
    else { V.action = 'check'; V.evKey = 'call'; }
    // M7 CO-02, CO-05: 가이드가 두 액션을 다 인정하는 자리(주도권 없는 OOP 콜러의 강한 패, 멀티웨이 드로우)는 alt를 받는다
    if (g.alt && category(g.alt) !== category(V.action)) V.alt = g.alt;
    V.source = 'guide';
    V.why = _plain(g.reason);
    var aggr = (typeof PostflopGuide !== 'undefined' && PostflopGuide.heroIsAggressor) ? PostflopGuide.heroIsAggressor(state) : false;
    V.concept = (state.street === 'flop' && aggr) ? 'cbet'
      : V.action === 'raise' ? 'value_bluff'
      : state.street === 'flop' ? 'board_texture' : 'turn_river';
    V.label = _label(V.action, 0, state.street);
    if (V.alt) V.label += ' 또는 ' + _label(category(V.alt) === 'raise' ? 'raise' : V.alt, 0, state.street);   // '체크 또는 벳'
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

  // M7 CO-03: 이 앱 3벳 표(data gto.js)에서 가끔 섞는 블러프 3벳(4벳) 손. 표를 바꾸면 함께 바꾼다(A5s-A4s, A5s-A3s, 76s, 65s)
  var BLUFF3 = { A5s: true, A4s: true, A3s: true, '76s': true, '65s': true };

  // 림퍼 뒤 '아주 강한 패'(Gto.GTO_RANGES.vsLimpBB, BB가 체크 대신 레이즈해야 하는 손과 같은 표)인지. hand = 'AA', 'AKo' 등 클래스 라벨
  var _premiumSet = null;
  function _premiumIso(hand) {
    if (!hand || typeof Gto === 'undefined' || !Gto.rangeClassSet || !Gto.GTO_RANGES || !Gto.GTO_RANGES.vsLimpBB) return false;
    if (!_premiumSet) _premiumSet = Gto.rangeClassSet(Gto.GTO_RANGES.vsLimpBB);
    return !!(_premiumSet && _premiumSet.has(hand));
  }

  // 프리플랍, 4벳 직면 전(streetBetCount 3 미만), 히어로 남은 스택 15bb 초과(EV.calcOptions의 올인 배제 조건과 같음)
  function _deepPreflopJam(state) {
    if (!state || state.street !== 'preflop') return false;
    var stack = (state.stacks && state.stacks.Hero) || 0;
    return stack > 15 && (state.streetBetCount || 0) < 3;
  }

  function _grade(V, action, ev, state) {
    ev = ev || {};
    if (!V) return null;
    var cat = category(action), vcat = category(V.action);
    if (!KOR[action]) action = cat === 'raise' ? 'raise' : cat;
    if (V.toCall === 0 && action === 'fold') {
      return { light: 'red', delta: -2.0, pattern: 'fold_free_check', title: '공짜 체크를 폴드',
        why: '콜할 돈이 0이면 체크! 공짜로 다음 카드를 볼 수 있어요', estimated: true };
    }
    // 프리플랍 차트 레이즈 자리(오픈, 아이솔, 3벳, 4벳)에서 깊은 스택(15bb 초과) 올인은 크기 실수(작은 실수). EV.calcOptions가
    // 올인을 추천 후보에서 빼는 규칙(프리플랍 스택 15bb 초과, streetBetCount 3 미만)과 같고, 5벳 잼(4벳 직면)과 짧은 스택은 그대로 정답.
    // 손은 차트대로라 sizeOnly(플래시카드는 맞힌 것으로, app.js). M5 통합 검증: 운 미터 카드가 100bb 오픈 올인을 '결정 좋음'으로 보이던 것
    if (V.source === 'chart' && action === 'allin' && vcat === 'raise' && _deepPreflopJam(state)) {
      var jr = _res('yellow', -0.5, null, action, '레인지 차트로는 레이즈가 맞지만 스택 ' + Math.round(state.stacks.Hero) +
        'bb의 올인은 너무 커요. 표준 크기로 레이즈해요(올인은 5벳이나 짧은 스택에서)');
      jr.sizeOnly = true;
      return jr;
    }
    if (cat === vcat) return _res('green', 0, null, action, V.why);

    // 표준 차트 티어(클라우드 E): 내가 고른 액션의 차트 빈도 w로 3분기. 0.25 이상이면 둘 다 정답(초록), 0보다 크고 0.25 미만이면
    //   '가끔만 섞는 손'(노랑, 작은 실수, 패턴 없음), 0이면 아래 입문 패턴 규칙 그대로(큰 실수/작은 실수와 패턴).
    if (V.source === 'chart' && V.tierLabel === 'chart-std' && V.w && typeof V.w[cat] === 'number') {
      var wk = V.w[cat];
      if (wk >= 0.25) return _res('green', 0, null, action, '표준 차트(참고)는 ' + _W_KOR[cat] + ' ' + _pct(wk) + '%로 섞는 손이라 둘 다 정답이에요');
      if (wk > 0) return _res('yellow', -0.5, null, action, '가끔만 섞는 손이에요(표준 차트 ' + _W_KOR[cat] + ' ' + _pct(wk) + '%): 보통은 ' + V.label);
    }

    // 벳 직면은 필요 승률과 비교한 승률(V.eqUsed, 다음 1장 또는 축소 레인지 기준)로 말한다. 예전 V(eqUsed 없음)는 V.eq
    var eqU = (V.eqUsed != null) ? V.eqUsed : V.eq;
    var needP = _pct(V.need != null ? V.need : V.potOdds), eqp = _pct(eqU), eqN = _eqName(V);

    if (V.source === 'chart') {
      var pattern = null, red = false;
      var rfi = V.spot === 'rfi', iso = V.spot === 'vs_limp';
      // BB(콜 0)의 림퍼 상대: 체크와 아이솔 레이즈가 둘 다 정답인 손(V.alt)
      if (iso && V.alt && category(V.alt) === cat) return _res('green', 0, null, action, V.why);
      var bbIso = iso && V.toCall === 0;   // BB는 콜로 따라 들어갈 수 없으니 오버림프가 아니다
      if (vcat === 'fold' && cat === 'raise') pattern = (rfi || iso) ? 'open_too_loose' : 'call_too_loose_pre';
      else if (vcat === 'fold' && cat === 'call') pattern = rfi ? 'limp' : iso ? 'overlimp' : 'call_too_loose_pre';
      // 림퍼 뒤 아이솔 손을 폴드: 아이솔 표(림퍼 1명 = 내 자리 RFI 표, 2명 이상 = 한 칸 좁은 표, M4-P9) 안의 손을 버린 건
      // 대개 놓친 기회라 작은 실수이고 패턴 없음(fold_too_tight_pre는 상대 오픈 상대 방어용). 아주 강한 패는 아래에서 큰 실수.
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
      // M7 CO-03: 차트의 3벳(또는 4벳) 칸이어도 가끔 섞는 블러프 손(A5s~A3s, 76s, 65s)은 폴드해도 손해가 작다(큰 실수가 아니라 작은 실수, 패턴 없음)
      if (V.action === 'raise' && cat === 'fold' && !iso && BLUFF3[V.hand] && (V.spot === 'vs_open' || V.spot === 'vs_3bet')) {
        return _res('yellow', -0.5, null, action, '차트는 ' + V.label + '이지만 가끔 섞는 블러프 손이라 폴드해도 손해는 작아요');
      }
      if (V.action === 'raise' && cat === 'fold' && !iso) red = true;
      // M4-P9 리뷰: 림퍼 뒤 아주 강한 패(vsLimpBB: TT+, AQ+)를 폴드하면 큰 실수. 림퍼가 넣은 칩까지 걸린 팟을 버리므로
      // 아무도 안 들어온 팟에서 같은 손을 폴드한 것(위 줄, 큰 실수)보다 손해가 작지 않다.
      if (V.action === 'raise' && cat === 'fold' && iso && _premiumIso(V.hand)) red = true;
      return _res(red ? 'red' : 'yellow', red ? -2.0 : -0.5, pattern, action,
        '레인지 차트 정답은 ' + V.label + ': ' + V.why);
    }

    if (V.source === 'potodds') {
      // M7 CO-01: 콜이 기본인 강한 패(V.alt 'raise')의 밸류 레이즈는 초록(고정 벌점 없음)
      if (V.alt && category(V.alt) === cat) return _res('green', 0, null, action, '강한 패라 레이즈도 좋아요: 콜과 레이즈 둘 다 정답');
      if (V.marginal) {
        if (cat === 'raise') return _fixed(_res('yellow', -0.3, null, action, '아슬아슬한 스팟이라 콜이나 폴드로 충분해요'));
        var r = _res('green', 0, null, action,
          '필요 승률 ' + needP + '%와 ' + eqN + ' ' + eqp + '%가 거의 같아요: 콜, 폴드 모두 큰 차이 없음');
        r.title = '아슬아슬한 스팟';
        return r;
      }
      if (cat !== 'fold' && vcat === 'fold') {
        var callEV = ev.call != null ? ev.call : -((V.toCall || 0) * (1 - eqU) - eqU * (V.pot || 0));
        var d = Math.min(-0.3, callEV);
        return _res(d < -1.5 ? 'red' : 'yellow', d, 'call_below_odds', action,
          '필요 승률 ' + needP + '%인데 ' + eqN + ' ' + eqp + '%: 콜할수록 손해');
      }
      if (cat === 'fold' && vcat !== 'fold') {
        var d2 = -Math.max(0.3, ev.call || 0);
        return _res(d2 < -1.5 ? 'red' : 'yellow', d2, 'fold_above_odds', action,
          eqN + ' ' + eqp + '%가 필요 승률 ' + needP + '%보다 높아요: 콜이 이득');
      }
      if (cat === 'raise' && vcat === 'call') return _fixed(_res('yellow', -0.3, null, action, '콜로 충분해요: ' + V.why));
      if (cat === 'call' && vcat === 'raise') return _fixed(_res('yellow', -0.3, 'missed_value', action, '아주 강한 패는 레이즈로 칩을 받아내요'));
    }

    if (V.source === 'guide') {
      // M7 CO-02, CO-05: 체크가 기본이고 벳도 정답인 자리의 벳은 초록(고정 벌점 없음)
      if (V.alt && category(V.alt) === cat) return _res('green', 0, null, action, '체크도 벳도 괜찮은 자리예요');
      if (vcat === 'raise' && cat === 'call') {
        if (V.strength === 'nut' || V.strength === 'strong') {
          return _res('yellow', -0.3, 'missed_value', action, '강한 패는 벳해서 칩을 받아내요(밸류벳)');
        }
        // F5 승률 규칙(가이드가 체크 대신 밸류벳, eqRule): 감사 결함 '승률 73% 투페어 체크가 🟢'을 노란불로
        if (V.eqRule) {
          return _res('yellow', -0.3, 'missed_value', action, '승률 ' + _pct(V.eq) + '%면 앞설 때가 많아요: 벳해서 칩을 받아내요(밸류벳)');
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

  var api = { verdict: verdict, grade: grade, category: category, PATTERNS: PATTERNS, goalFor: goalFor, rangePct: rangePct,
    narrowRange: narrowRange, basisLabel: basisLabel };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
