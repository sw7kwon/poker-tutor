// puzzles/gen-postflop.js (채우는 패키지: M2-P3a)
// 포스트플랍 퍼즐 생성기 4종. 설계서 3.2절 출제 제외 1, 2, 6번, 8.2절 라벨 1, 3, 4, 부록 C, 계약 C1~C3(puzzle-core.js 머리 주석).
//   texture          앱 정의(appDef, rated false, srs 키 = classifyFlop 클래스). 날씨 x 높이 조합 카드 4개, 날씨별 층화 25%.
//   cbet2            approx(참고, rated false, once). PostflopTables.CBET를 빈도 x 사이즈 2축 보기 4개로.
//                    비 보드는 붙은(차이 4 이하) J 하이 이하만 낸다(떨어진 투톤과 A, K, Q 하이 비 보드는 통념과 표가 어긋나 제외).
//   facingbet-river  exact(주어진 상대 레인지 기준). 보드 5장, 상대 벳 레인지를 콤보 목록으로 명시(보드와 내 카드 블로커 제외),
//                    히어로 vs 명시 레인지 열거 에쿼티(무승부 0.5) vs need = 콜/(팟+콜). |eq - need| >= 0.08만,
//                    히어로 강도 nut/strong 제외, Coach.verdict가 raise면 폐기. 'multiway'는 명시 레인지 2개를 모두 이겨야 승리.
//                    'marginal'(둘 다 OK, S5)은 소비처 s5-05가 M6이라 M6으로 이월(M5-P0 결정, 지금은 null).
//   facingbet-next   exact. 플랍/턴, 상대는 명시한 손 1개 또는 작은 레인지. 남은 덱의 다음 1장을 열거해 "다음 카드 뒤 앞서는 비율"을
//                    지금 콜 가격과 비교(마진 0.08). 'draw'는 히어로 드로우 스팟. 강도 제외와 raise 폐기도 리버와 같이 적용.
// M5-COACH: raise 폐기 판정 때 코치에 명시 콤보를 그대로 넘긴다(헤즈업, { narrow: false }). 코치가 같은 레인지로 다시 센
//   승률(Equity.nextCard 경로)이 문항 eq와 다르면 폐기한다. 멀티웨이는 { basis: 'eq' }(넘긴 eq 그대로).
// 높이 규칙(설계서가 정하지 않은 구름(paired)과 안개(monotone)): 보드에서 가장 높은 카드가 Q 이상이면 하이, 10 또는 J면 미드, 9 이하면 로우.
//   나머지 5클래스는 설계서 그대로다(맑음: a-high-dry, broadway-dry = 하이(가장 높은 카드 Q 이상), low-dry = 로우(J 이하),
//   비: mid-wet = 미드(10 이상), low-wet = 로우(9 이하)). 구름과 안개 규칙은 classifyFlop의 두 경계(Q, 10)를 그대로 이은 것이다.
// 즉석 열거만 쓴다(MC 없음). 로드 시 DOM 접근 없음, 엔진 전역은 전부 typeof 가드. 등록은 typeof Puzzles 가드.
var GenPostflop = (function() {
  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  var SUITS = ['s', 'h', 'd', 'c'];
  var RIDX = {}, SIDX = {};
  RANKS.forEach(function(r, i) { RIDX[r] = i; });
  SUITS.forEach(function(s, i) { SIDX[s] = i; });
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var MARGIN = 0.08;
  var LABEL_APPDEF = '이 앱의 분류 기준';
  var LABEL_APPROX = '참고';
  var LABEL_APPROX_TEXT = '공개 솔버 통념을 근사한 참고값';
  var LABEL_RIVER = '주어진 상대 레인지 기준 엔진 계산';
  var LABEL_EXACT = '엔진 계산';

  var ALL = [];
  RANKS.forEach(function(r) { SUITS.forEach(function(s) { ALL.push(r + s); }); });
  var ALL_CLASSES = [];
  (function() {
    for (var i = 12; i >= 0; i--) {
      for (var j = i; j >= 0; j--) {
        if (i === j) ALL_CLASSES.push(RANKS[i] + RANKS[j]);
        else { ALL_CLASSES.push(RANKS[i] + RANKS[j] + 's'); ALL_CLASSES.push(RANKS[i] + RANKS[j] + 'o'); }
      }
    }
  })();

  // ── 공통 도우미 ──
  function _ready() {
    return typeof HandEval !== 'undefined' && typeof PostflopTables !== 'undefined' &&
      typeof Villain !== 'undefined' && typeof Villain._handStrength === 'function';
  }
  function _rnd(rnd) { return typeof rnd === 'function' ? rnd : Math.random; }
  function _pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
  function _shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)) % (i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function _clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function _validCard(c) { return typeof c === 'string' && c.length === 2 && RIDX[c.charAt(0)] !== undefined && SIDX[c.charAt(1)] !== undefined; }
  function _int(c) { return RIDX[c.charAt(0)] * 4 + SIDX[c.charAt(1)]; }
  function _obj(c) { return { rank: c.charAt(0), suit: c.charAt(1) }; }
  function _objs(list) { return list.map(_obj); }
  function _split(combo) { return [combo.slice(0, 2), combo.slice(2, 4)]; }
  function cardText(c) { var r = c.charAt(0); return (r === 'T' ? '10' : r) + SUIT_SYM[c.charAt(1)]; }
  function _rankText(r) { return r === 'T' ? '10' : r; }
  function _num(x) { var v = Math.round(x * 10) / 10; return (v % 1 === 0) ? String(v) : v.toFixed(1); }
  function _pct(x) { return Math.round(x * 100); }
  function _deadMap(list) { var m = {}; list.forEach(function(c) { m[c] = 1; }); return m; }
  function _draw(rnd, n, dead) {
    var out = [], used = {}, k;
    for (k in dead) used[k] = 1;
    for (var guard = 0; out.length < n && guard < 2000; guard++) {
      var c = ALL[Math.floor(rnd() * 52) % 52];
      if (used[c]) continue;
      used[c] = 1; out.push(c);
    }
    return out.length === n ? out : null;
  }
  function _cls(a, b) {
    var ra = RIDX[a.charAt(0)], rb = RIDX[b.charAt(0)];
    if (ra < rb) { var t = a; a = b; b = t; var tr = ra; ra = rb; rb = tr; }
    if (ra === rb) return a.charAt(0) + b.charAt(0);
    return a.charAt(0) + b.charAt(0) + (a.charAt(1) === b.charAt(1) ? 's' : 'o');
  }
  function _classCombos(cls) {
    var r1 = cls.charAt(0), r2 = cls.charAt(1), out = [], i, j;
    if (cls.length === 2) {
      for (i = 0; i < 4; i++) for (j = i + 1; j < 4; j++) out.push(r1 + SUITS[i] + r2 + SUITS[j]);
    } else if (cls.charAt(2) === 's') {
      for (i = 0; i < 4; i++) out.push(r1 + SUITS[i] + r2 + SUITS[i]);
    } else {
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) if (i !== j) out.push(r1 + SUITS[i] + r2 + SUITS[j]);
    }
    return out;
  }
  // 표시 순서(정답을 드러내지 않는 중립 순서): 페어 높은 순 → 높은 카드, 낮은 카드 순, 같은 쌍이면 수딧 먼저
  function _clsKey(cls) {
    var a = RIDX[cls.charAt(0)], b = RIDX[cls.charAt(1)];
    if (cls.length === 2) return 12 - a;
    return 100 + (12 - a) * 40 + (12 - b) * 2 + (cls.charAt(2) === 's' ? 0 : 1);
  }
  // HandEval 결과 → 정수 점수(클수록 강함). 엔진 내부 순서와 같다(족보, 그다음 tiebreakers 사전순).
  function _scoreOf(ev) {
    var s = (10 - ev.type) * 1048576, tb = ev.tiebreakers, m = 65536;
    for (var i = 0; i < tb.length && i < 5; i++) { s += tb[i] * m; m /= 16; }
    return s;
  }
  function _strength(cards2, board) {
    try { return Villain._handStrength(_objs(cards2), _objs(board)); } catch (e) { return null; }
  }
  function _hasDraw(cards2, board) {
    if (typeof PostflopGuide === 'undefined' || typeof PostflopGuide.hasDraw !== 'function') return false;
    try { return !!PostflopGuide.hasDraw(_objs(cards2), _objs(board)); } catch (e) { return false; }
  }
  function _streetOf(n) { return n >= 5 ? 'river' : n === 4 ? 'turn' : 'flop'; }

  // 프리플랍 레인지(이 앱 차트). Gto가 없으면 169 클래스 전체로 대체.
  var _sets = null;
  function _S() {
    if (_sets) return _sets;
    var G = (typeof Gto !== 'undefined' && Gto.GTO_RANGES) ? Gto.GTO_RANGES : null;
    function cs(arr) {
      var out = null;
      if (G && arr && arr.length && typeof Gto.rangeClassSet === 'function') {
        try { out = Array.from(Gto.rangeClassSet(arr)); } catch (e) { out = null; }
      }
      return (out && out.length) ? out : ALL_CLASSES.slice();
    }
    function map(list) { var m = {}; list.forEach(function(c) { m[c] = 1; }); return m; }
    var bbLate = cs(G && G.vsRfiBB_LP && G.vsRfiBB_LP.call);
    var bbEarly = cs(G && G.vsRfi && G.vsRfi.BB && G.vsRfi.BB.call);
    _sets = {
      hu: [
        { vpos: 'BTN', vill: cs(G && G.rfi && G.rfi.BTN), hero: map(bbLate) },
        { vpos: 'CO', vill: cs(G && G.rfi && G.rfi.CO), hero: map(bbLate) },
        { vpos: 'HJ', vill: cs(G && G.rfi && G.rfi.HJ), hero: map(bbEarly) }
      ],
      mw: { apos: 'CO', bpos: 'BTN', a: cs(G && G.rfi && G.rfi.CO), b: cs(G && G.vsRfi && G.vsRfi.BTN && G.vsRfi.BTN.call), hero: map(bbLate) }
    };
    return _sets;
  }
  function _heroFrom(heroMap, dead, rnd) {
    for (var t = 0; t < 300; t++) {
      var a = ALL[Math.floor(rnd() * 52) % 52], b = ALL[Math.floor(rnd() * 52) % 52];
      if (a === b || dead[a] || dead[b]) continue;
      if (heroMap[_cls(a, b)]) return [a, b];
    }
    return null;
  }

  // 코치 판정(raise면 폐기). Coach가 없으면 'none', 예외면 'error'(폐기 쪽).
  // M5-COACH: 헤즈업은 명시 콤보를 state.villainRange로 넘기고 { narrow: false }(이미 상대 벳 레인지라 지우지 않음).
  //   그러면 코치가 같은 레인지로 다음 1장(플랍/턴) 또는 리버 승부를 직접 열거한다(V.eqUsed = 문항 eq, verify가 대조).
  //   멀티웨이(combos 없음)는 코치가 레인지 1개만 다루므로 { basis: 'eq' }로 넘겨받은 eq(두 레인지를 모두 이길 확률) 그대로.
  function _coachVerdict(hero, board, potTotal, toCall, eq, heroPos, others, combos) {
    if (typeof Coach === 'undefined' || typeof Coach.verdict !== 'function') return null;
    var players = { Hero: { pos: heroPos } };
    (others || []).forEach(function(p, i) { players['V' + (i + 1)] = { pos: p }; });
    var state = {
      street: _streetOf(board.length), board: _objs(board), heroCards: _objs(hero), pot: potTotal, currentBet: toCall,
      playerBets: { Hero: 0 }, players: players, decisions: [], folded: {}, stacks: { Hero: 100 }, bigBlind: 1,
      villainRange: combos ? combos.slice() : null
    };
    return Coach.verdict(state, null, eq, heroPos, combos ? { narrow: false } : { basis: 'eq' });
  }
  function _coachAction(hero, board, potTotal, toCall, eq, heroPos, others, combos) {
    if (typeof Coach === 'undefined' || typeof Coach.verdict !== 'function') return 'none';
    try {
      var V = _coachVerdict(hero, board, potTotal, toCall, eq, heroPos, others, combos);
      // 헤즈업에서 코치가 다시 센 승률이 문항 승률과 다르면(정의 불일치) 폐기 쪽
      if (V && combos && V.eqUsed != null && V.basis !== 'eq' && Math.abs(V.eqUsed - eq) > 1e-9) return 'error';
      return (V && V.action) || 'none';
    } catch (e) { return 'error'; }
  }

  // ── 독립 경로(verify 전용): 생성 경로의 정수 점수(_scoreOf)와 클래스 묶음을 쓰지 않고, 콤보 목록과 남은 52장을
  //    그대로 돌며 HandEval.compareHands로 다시 센다 ──
  function _ev(cards) { return HandEval.evaluateIdx(cards.map(_int)); }
  function _share2(hEv, vEv) {
    var c = HandEval.compareHands(hEv, vEv);
    return c < 0 ? 1 : c === 0 ? 0.5 : 0;
  }
  // 히어로 vs 명시 콤보(리버). 무승부 0.5. 반환 {eq, wins, ties, losses, n}
  function equityVsCombos(hero, board, combos) {
    var hEv = _ev(hero.concat(board));
    var w = 0, t = 0, l = 0;
    combos.forEach(function(cb) {
      var s = _share2(hEv, _ev(_split(cb).concat(board)));
      if (s === 1) w++; else if (s === 0.5) t++; else l++;
    });
    var n = w + t + l;
    return { eq: n ? (w + 0.5 * t) / n : 0, wins: w, ties: t, losses: l, n: n };
  }
  // 멀티웨이(리버): 겹치는 카드가 없는 (A, B) 조합마다 둘 다 이겨야 1, 최고 손 동점이면 1/동점 인원.
  function equityMultiway(hero, board, combosA, combosB) {
    var hEv = _ev(hero.concat(board));
    var evA = combosA.map(function(c) { return _ev(_split(c).concat(board)); });
    var evB = combosB.map(function(c) { return _ev(_split(c).concat(board)); });
    var tot = 0, cnt = 0;
    for (var i = 0; i < combosA.length; i++) {
      var a = _split(combosA[i]);
      var cA = HandEval.compareHands(hEv, evA[i]);
      for (var j = 0; j < combosB.length; j++) {
        var b = _split(combosB[j]);
        if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) continue;
        cnt++;
        var cB = HandEval.compareHands(hEv, evB[j]);
        if (cA > 0 || cB > 0) continue;
        tot += 1 / (1 + (cA === 0 ? 1 : 0) + (cB === 0 ? 1 : 0));
      }
    }
    return { eq: cnt ? tot / cnt : 0, pairs: cnt };
  }
  // 다음 1장(플랍/턴): 남은 52장 전체를 돌며 죽은 카드(내 패, 보드, 그 콤보)를 건너뛴다. 반환 {eq, n, cards, winCards, tieCards}
  function equityNextCard(hero, board, combos) {
    var tot = 0, cnt = 0, winC = 0, tieC = 0, perCombo = 0;
    var dead = _deadMap(hero.concat(board)), hEv = {};
    var vb = [0, 0].concat(board.map(_int), [0]), last = vb.length - 1;
    ALL.forEach(function(x) { if (!dead[x]) hEv[x] = _ev(hero.concat(board, [x])); });
    combos.forEach(function(cb) {
      var v = _split(cb), k = 0;
      vb[0] = _int(v[0]); vb[1] = _int(v[1]);
      ALL.forEach(function(x) {
        if (dead[x] || x === v[0] || x === v[1]) return;
        vb[last] = _int(x);
        var s = _share2(hEv[x], HandEval.evaluateIdx(vb));
        tot += s; cnt++; k++;
        if (s === 1) winC++; else if (s === 0.5) tieC++;
      });
      perCombo = k;
    });
    return { eq: cnt ? tot / cnt : 0, n: cnt, cards: perCombo, winCards: winC, tieCards: tieC };
  }

  // ════════════════ texture ════════════════
  var WEATHERS = ['sun', 'rain', 'cloud', 'fog'];
  var W_KOR = { sun: '맑음', rain: '비', cloud: '구름', fog: '안개' };
  var W_ICON = { sun: '☀', rain: '🌧', cloud: '☁', fog: '🌫' };
  var H_KOR = { high: '하이', mid: '미드', low: '로우' };
  var CLASS_WEATHER = { 'a-high-dry': 'sun', 'broadway-dry': 'sun', 'low-dry': 'sun', 'mid-wet': 'rain', 'low-wet': 'rain', paired: 'cloud', monotone: 'fog' };
  var CLASS_HEIGHT = { 'a-high-dry': 'high', 'broadway-dry': 'high', 'low-dry': 'low', 'mid-wet': 'mid', 'low-wet': 'low' };
  var CLASS_KOR = { 'a-high-dry': 'A 하이 드라이', 'broadway-dry': 'K, Q 하이 드라이', 'low-dry': '로우 드라이', 'mid-wet': '미드 웻',
    'low-wet': '로우 웻', paired: '페어 보드', monotone: '모노톤' };
  var CELLS = {
    sun: [['a-high-dry', 'high'], ['broadway-dry', 'high'], ['low-dry', 'low']],
    rain: [['mid-wet', 'mid'], ['low-wet', 'low']],
    cloud: [['paired', 'high'], ['paired', 'mid'], ['paired', 'low']],
    fog: [['monotone', 'high'], ['monotone', 'mid'], ['monotone', 'low']]
  };
  var VALID_IDS = [];
  WEATHERS.forEach(function(w) { CELLS[w].forEach(function(c) { var id = w + '-' + c[1]; if (VALID_IDS.indexOf(id) < 0) VALID_IDS.push(id); }); });

  function _topIdx(board) { var m = -1; board.slice(0, 3).forEach(function(c) { var r = RIDX[c.charAt(0)]; if (r > m) m = r; }); return m; }
  // 구름/안개 높이(이 패키지가 정한 규칙): Q 이상 하이, 10/J 미드, 9 이하 로우
  function topHeight(topIdx) { return topIdx >= 10 ? 'high' : topIdx >= 8 ? 'mid' : 'low'; }
  function heightOf(cls, board) { return CLASS_HEIGHT[cls] || topHeight(_topIdx(board)); }
  function axesOf(board) {
    var cls = PostflopTables.classifyFlop(_objs(board.slice(0, 3)));
    if (!cls || !CLASS_WEATHER[cls]) return null;
    return { cls: cls, weather: CLASS_WEATHER[cls], height: heightOf(cls, board) };
  }
  // verify 전용 독립 분류기(classifyFlop 규칙을 문자열로 다시 구현). 테스트가 22100 플랍 전수로 classifyFlop과 대조한다.
  function _classifyIndep(board) {
    var b = board.slice(0, 3), su = {};
    b.forEach(function(c) { su[c.charAt(1)] = 1; });
    var nSuit = Object.keys(su).length;
    if (nSuit === 1) return 'monotone';
    var rk = b.map(function(c) { return RIDX[c.charAt(0)]; }).sort(function(x, y) { return y - x; });
    if (rk[0] === rk[1] || rk[1] === rk[2]) return 'paired';
    var wet = (rk[0] - rk[2]) <= 4 || nSuit === 2;
    if (!wet) return rk[0] === 12 ? 'a-high-dry' : rk[0] >= 10 ? 'broadway-dry' : 'low-dry';
    return rk[0] >= 8 ? 'mid-wet' : 'low-wet';
  }
  function _axesIndep(board) {
    var cls = _classifyIndep(board), top = _topIdx(board), w, h;
    if (cls === 'monotone') { w = 'fog'; h = top >= 10 ? 'high' : top >= 8 ? 'mid' : 'low'; }
    else if (cls === 'paired') { w = 'cloud'; h = top >= 10 ? 'high' : top >= 8 ? 'mid' : 'low'; }
    else if (cls === 'mid-wet' || cls === 'low-wet') { w = 'rain'; h = top >= 8 ? 'mid' : 'low'; }
    else { w = 'sun'; h = top >= 10 ? 'high' : 'low'; }
    return { cls: cls, weather: w, height: h };
  }
  function _rankIn(height, rnd) {   // 높이 구간 안의 랭크 인덱스(구름/안개용: 하이 10~12, 미드 8~9, 로우 0~7)
    var lo = height === 'high' ? 10 : height === 'mid' ? 8 : 0, hi = height === 'high' ? 12 : height === 'mid' ? 9 : 7;
    return lo + Math.floor(rnd() * (hi - lo + 1)) % (hi - lo + 1);
  }
  function _flopDirect(cls, height, rnd) {
    var top = _rankIn(height, rnd), b;
    if (cls === 'monotone') {
      if (top < 2) return null;
      var su = SUITS[Math.floor(rnd() * 4) % 4], r = {}, rs = [top];
      r[top] = 1;
      for (var g = 0; rs.length < 3 && g < 50; g++) { var x = Math.floor(rnd() * top) % top; if (!r[x]) { r[x] = 1; rs.push(x); } }
      b = _shuffle(rs, rnd).map(function(i) { return RANKS[i] + su; });
    } else {
      // 페어 보드: 가장 높은 카드가 top. 페어가 top이거나(키커는 아래) 키커가 top(페어는 아래). 트립스 보드도 가끔.
      var u = rnd(), pr, kk;
      if (u < 0.04) { pr = top; kk = top; }
      else if (top === 0) return null;
      else if (u < 0.52) { pr = top; kk = Math.floor(rnd() * top) % top; }
      else { kk = top; pr = Math.floor(rnd() * top) % top; }
      var ss = _shuffle(SUITS, rnd);
      b = pr === kk ? [RANKS[pr] + ss[0], RANKS[pr] + ss[1], RANKS[pr] + ss[2]]
        : [RANKS[pr] + ss[0], RANKS[pr] + ss[1], RANKS[kk] + _pick(SUITS, rnd)];
      if (b[2] === b[0] || b[2] === b[1]) return null;
      b = _shuffle(b, rnd);
    }
    return b;
  }
  function _flopOf(cls, height, rnd, ok) {
    for (var t = 0; t < 8000; t++) {
      var b = (cls === 'monotone' || cls === 'paired') && t < 50 ? _flopDirect(cls, height, rnd) : _draw(rnd, 3, {});
      if (!b) continue;
      var c = PostflopTables.classifyFlop(_objs(b));
      if (c !== cls) continue;
      if (height && heightOf(c, b) !== height) continue;
      if (ok && !ok(b)) continue;
      return b;
    }
    return null;
  }
  function _texLabel(id) { var p = id.split('-'); return W_ICON[p[0]] + ' ' + W_KOR[p[0]] + ', ' + H_KOR[p[1]]; }
  function _texOptions(w, h, rnd) {
    var ans = w + '-' + h;
    var pool = VALID_IDS.filter(function(id) { return id !== ans; });
    var sameW = pool.filter(function(id) { return id.split('-')[0] === w; });
    var sameH = pool.filter(function(id) { return id.split('-')[1] === h && id.split('-')[0] !== w; });
    var chosen = [];
    if (sameW.length) chosen.push(_pick(sameW, rnd));
    if (sameH.length) chosen.push(_pick(sameH, rnd));
    var rest = _shuffle(pool.filter(function(id) { return chosen.indexOf(id) < 0; }), rnd);
    while (chosen.length < 3 && rest.length) chosen.push(rest.shift());
    return _shuffle([ans].concat(chosen), rnd).map(function(id) {
      var o = { id: id, label: _texLabel(id) };
      if (id !== ans && id.split('-')[0] === w) o.near = true;
      return o;
    });
  }
  function _texDifficulty(board, cls) {
    var rk = board.slice(0, 3).map(function(c) { return RIDX[c.charAt(0)]; }).sort(function(x, y) { return y - x; });
    var top = rk[0], span = rk[0] - rk[2], edge = false;
    if (cls === 'paired' || cls === 'monotone') edge = top >= 7 && top <= 10;           // 9/10, J/Q 경계
    else {
      edge = span === 4 || span === 5;                                                 // 붙음/떨어짐 경계
      if (CLASS_WEATHER[cls] === 'sun' && (top === 9 || top === 10)) edge = true;      // J/Q 경계
      if (CLASS_WEATHER[cls] === 'rain' && (top === 7 || top === 8)) edge = true;      // 9/10 경계
    }
    return 1450 + (edge ? 100 : 0);
  }
  function _texBuild(cls, height, rnd) {
    var board = _flopOf(cls, height, rnd);
    if (!board) return null;
    var ax = axesOf(board);
    if (!ax) return null;
    return {
      type: 'texture', key: ax.cls, concept: 'board_texture', difficulty: _texDifficulty(board, ax.cls),
      confidence: 'exact', appDef: true, rated: false, srs: 'srs', label: LABEL_APPDEF,
      prompt: '이 플랍의 날씨와 높이는? 이 앱의 분류 기준으로 골라요.',
      scene: { board: board, note: LABEL_APPDEF },
      options: _texOptions(ax.weather, ax.height, rnd), answer: ax.weather + '-' + ax.height, ui: 'choice',
      data: { cls: ax.cls, weather: ax.weather, height: ax.height, top: board.slice().sort(function(a, b) { return RIDX[b.charAt(0)] - RIDX[a.charAt(0)]; })[0].charAt(0) }
    };
  }
  function _texNext(rnd, opts) {
    if (!_ready()) return null;
    rnd = _rnd(rnd);
    var w = WEATHERS[Math.floor(rnd() * 4) % 4];
    var cell = _pick(CELLS[w], rnd);
    return _texBuild(cell[0], cell[1], rnd);
  }
  function _texFromKey(key, rnd, opts) {
    if (!_ready() || !CLASS_WEATHER[key]) return null;
    rnd = _rnd(rnd);
    var cells = CELLS[CLASS_WEATHER[key]].filter(function(c) { return c[0] === key; });
    return _texBuild(key, _pick(cells, rnd)[1], rnd);
  }
  function _texVerify(q) {
    try {
      if (!q || q.type !== 'texture' || !q.scene || !Array.isArray(q.scene.board) || q.scene.board.length !== 3) return false;
      var b = q.scene.board;
      if (!b.every(_validCard) || Object.keys(_deadMap(b)).length !== 3) return false;
      var ax = _axesIndep(b), ans = ax.weather + '-' + ax.height;
      if (q.answer !== ans || q.key !== ax.cls) return false;
      if (q.confidence !== 'exact' || q.appDef !== true || q.rated !== false || q.srs !== 'srs') return false;
      var ids = (q.options || []).map(function(o) { return o.id; });
      if (ids.length !== 4 || Object.keys(_deadMap(ids)).length !== 4) return false;
      if (ids.filter(function(id) { return id === ans; }).length !== 1) return false;
      return ids.every(function(id) { return VALID_IDS.indexOf(id) >= 0; });
    } catch (e) { return false; }
  }
  // 숫자 뒤 조사: 받침이 ㄹ이 아닌 숫자(0 영, 3 삼, 6 육, 10 십)는 '으로', 나머지는 '로'
  function _ro(n) { var d = Math.abs(n) % 10; return n + (d === 0 || d === 3 || d === 6 ? '으로' : '로'); }
  function _weatherWhy(board, cls) {
    var b = board.slice(0, 3), su = {};
    b.forEach(function(c) { su[c.charAt(1)] = (su[c.charAt(1)] || 0) + 1; });
    var rk = b.map(function(c) { return RIDX[c.charAt(0)]; }).sort(function(x, y) { return y - x; });
    var span = rk[0] - rk[2], two = Object.keys(su).length === 2;
    if (cls === 'monotone') return '세 장 무늬가 모두 같아(모노톤) 안개, 플러시가 가까워 작게, 조심';
    if (cls === 'paired') return (rk[0] === rk[2] ? '같은 숫자가 3장' : '같은 숫자가 2장') + '이라(페어 보드) 구름';
    if (CLASS_WEATHER[cls] === 'rain') {
      if (two && span <= 4) return '같은 무늬 2장에 카드도 붙어 있어(차이 ' + span + ') 비';
      if (two) return '같은 무늬가 2장이라(플러시 드로우 가능) 비';
      return '가장 높은 카드와 낮은 카드 차이가 ' + _ro(span) + ' 4 이하라(스트레이트 가능) 비';
    }
    return '무늬가 모두 다르고 높낮이 차이가 ' + _ro(span) + ' 4보다 커서 맑음';
  }
  function _heightWhy(board, cls, h) {
    var top = _rankText(RANKS[_topIdx(board)]);
    var w = CLASS_WEATHER[cls];
    if (w === 'sun') return '가장 높은 카드(' + top + ')가 ' + (h === 'high' ? 'Q 이상이라 하이' : 'J 이하라 로우');
    // 비는 높이를 두 칸(10 이상 미드, 9 이하 로우)으로만 나눈다. A, K, Q 하이 비 보드도 미드라 그 규칙을 함께 적는다.
    if (w === 'rain') return '가장 높은 카드(' + top + ')가 ' + (h === 'mid' ? '10 이상이라 미드(비 보드는 높이를 미드, 로우 두 칸으로만 나눠요)' : '9 이하라 로우');
    return '높이는 가장 높은 카드(' + top + ') 기준(Q 이상 하이, 10과 J 미드, 9 이하 로우)으로 ' + H_KOR[h];
  }
  function _texExplain(q) {
    var b = q.scene.board, d = q.data || _axesIndep(b);
    var s1 = _weatherWhy(b, d.cls) + '.';
    var s2 = _heightWhy(b, d.cls, d.height) + '. (' + LABEL_APPDEF + ')';
    return { line: s1 + ' ' + s2, lines: [s1, s2], label: LABEL_APPDEF };
  }

  // ════════════════ cbet2 ════════════════
  var CB_OPENERS = ['UTG', 'HJ', 'CO', 'BTN'];
  var CB_IDS = ['often-small', 'often-big', 'rarely-small', 'rarely-big'];
  var CB_LABEL = { 'often-small': '자주(절반 넘게), 작게(팟 1/3 안팎)', 'often-big': '자주(절반 넘게), 크게(팟 2/3 안팎)',
    'rarely-small': '가끔(절반 아래), 작게(팟 1/3 안팎)', 'rarely-big': '가끔(절반 아래), 크게(팟 2/3 안팎)' };
  var CB_WHY = {
    'a-high-dry': 'A가 있는 마른 보드는 레이저 레인지가 크게 유리해 자주, 작게',
    'broadway-dry': 'K, Q 하이 마른 보드도 레이저가 유리해 자주, 작게',
    'low-dry': '낮고 마른 보드는 중간보다 조금 자주, 작게',
    paired: '페어 보드는 양쪽 다 잘 안 맞아 자주, 작게',
    'mid-wet': '젖은 보드는 상대도 많이 맞아 덜 자주, 치면 크게(드로우에 비싼 가격)',
    'low-wet': '낮고 젖은 보드는 콜러 레인지에 잘 맞아 골라서, 크게',
    monotone: '모노톤은 가끔(절반 아래), 치면 작게, 나머지는 체크'
  };
  function _cbBucket(cls) {
    var t = PostflopTables.CBET && PostflopTables.CBET[cls];
    if (!t) return null;
    return { freq: t.freq, size: t.size, id: (t.freq >= 50 ? 'often' : 'rarely') + '-' + (t.size >= 50 ? 'big' : 'small') };
  }
  // cbet2 출제 보드 제한(애매하면 내지 않는다): 비(mid-wet, low-wet)는 서로 붙은 보드(최고와 최저 차이 4 이하)이면서
  // 가장 높은 카드가 J 이하인 것만 낸다. 무늬만 2장 같고 떨어진 보드(예: A♥7♥2♣, 10♥6♥2♣)나 A, K, Q 하이 비 보드는
  // classifyFlop으로는 비지만 공개 솔버 통념에서 인포지션 레이저가 여전히 자주, 작게 치는 보드라 표(덜 자주, 크게)와 어긋난다.
  function _cbBoardOk(board, cls) {
    if (CLASS_WEATHER[cls] !== 'rain') return true;
    var rk = board.slice(0, 3).map(function(c) { return RIDX[c.charAt(0)]; }).sort(function(x, y) { return y - x; });
    return rk[0] - rk[2] <= 4 && rk[0] <= RIDX.J;
  }
  function _cbNext(rnd, opts) {
    if (!_ready() || !PostflopTables.CBET) return null;
    rnd = _rnd(rnd);
    var w = WEATHERS[Math.floor(rnd() * 4) % 4];
    var cell = _pick(CELLS[w], rnd);
    var board = _flopOf(cell[0], cell[1], rnd, function(b) { return _cbBoardOk(b, cell[0]); });
    if (!board) return null;
    var ax = axesOf(board), bk = ax && _cbBucket(ax.cls);
    if (!bk) return null;
    var opener = _pick(CB_OPENERS, rnd);
    return {
      type: 'cbet2', key: null, concept: 'cbet', difficulty: 1500, confidence: 'approx', appDef: false, rated: false, srs: 'once',
      label: LABEL_APPROX,
      prompt: opener + ' 오픈, BB 콜, 플랍에서 BB 체크. 내 레인지 전체의 c벳은 얼마나 자주, 얼마나 크게?(참고)',
      scene: { board: board, potTotal: 5.5, toCall: 0,
        seats: [{ pos: opener, label: '오픈', hero: true, active: true }, { pos: 'BB', label: '체크' }],
        note: LABEL_APPROX + ': ' + LABEL_APPROX_TEXT + '(인포지션 오픈 레이저 기준)' },
      options: CB_IDS.map(function(id) { return { id: id, label: CB_LABEL[id] }; }),
      answer: bk.id, ui: 'choice',
      data: { cls: ax.cls, weather: ax.weather, height: ax.height, freq: bk.freq, size: bk.size, opener: opener }
    };
  }
  function _cbVerify(q) {
    try {
      if (!q || q.type !== 'cbet2' || !q.scene || !Array.isArray(q.scene.board) || q.scene.board.length !== 3) return false;
      if (q.confidence !== 'approx' || q.rated !== false || q.srs !== 'once' || q.key !== null) return false;
      var cls = _classifyIndep(q.scene.board), t = PostflopTables.CBET[cls];
      if (!t || !_cbBoardOk(q.scene.board, cls)) return false;
      var id = (t.freq >= 50 ? 'often' : 'rarely') + '-' + (t.size >= 50 ? 'big' : 'small');
      var ids = (q.options || []).map(function(o) { return o.id; });
      return q.answer === id && ids.length === 4 && ids.indexOf(id) >= 0;
    } catch (e) { return false; }
  }
  function _cbExplain(q) {
    var cls = (q.data && q.data.cls) || _classifyIndep(q.scene.board);
    var bk = _cbBucket(cls);
    var s1 = LABEL_APPROX + '(' + LABEL_APPROX_TEXT + '): ' + W_KOR[CLASS_WEATHER[cls]] + ' 보드(' + CLASS_KOR[cls] + ')의 c벳은 약 ' +
      bk.freq + '%, 사이즈 팟 ' + bk.size + '%.';
    var s2 = CB_WHY[cls] + '. 실제 빈도는 상대와 레인지에 따라 달라져요.';
    return { line: s1 + ' ' + s2, lines: [s1, s2], label: LABEL_APPROX };
  }

  // ════════════════ 열거 공통(생성 경로: 정수 카드 + evaluateIdx) ════════════════
  // 클래스별 콤보 묶음과 히어로 대비 결과. out: 'W'(상대가 이김), 'L'(내가 이김), 'T'(비김), 'M'(섞임)
  var _CC = {};   // 클래스 → [{c, a, b, i0, i1}] 캐시(문자열 자르기와 정수 변환을 딜마다 반복하지 않게)
  function _classItems(cls) {
    var v = _CC[cls];
    if (v) return v;
    v = _CC[cls] = _classCombos(cls).map(function(cb) {
      var a = cb.slice(0, 2), b = cb.slice(2, 4);
      return { c: cb, a: a, b: b, i0: _int(a), i1: _int(b) };
    });
    return v;
  }
  function _groups(classes, dead, boardInts, heroScore, memo) {
    var evIdx = HandEval.evaluateIdx, buf = [0, 0].concat(boardInts), out = [];
    memo = memo || {};
    for (var i = 0; i < classes.length; i++) {
      var cls = classes[i], all = _classItems(cls), live = [];
      for (var k = 0; k < all.length; k++) {
        var it = all[k];
        if (dead[it.a] || dead[it.b]) continue;
        var sc = memo[it.c];
        if (sc === undefined) { buf[0] = it.i0; buf[1] = it.i1; sc = memo[it.c] = _scoreOf(evIdx(buf)); }
        live.push({ c: it.c, i0: it.i0, i1: it.i1, s: sc });
      }
      if (!live.length) continue;
      var w = 0, l = 0, t = 0, minT = 99, maxT = 0;
      live.forEach(function(x) {
        if (x.s > heroScore) w++; else if (x.s < heroScore) l++; else t++;
        var ty = _typeOf(x.s);
        if (ty < minT) minT = ty;
        if (ty > maxT) maxT = ty;
      });
      out.push({ cls: cls, items: live, n: live.length, full: all.length, minT: minT, maxT: maxT,
        out: w === live.length ? 'W' : l === live.length ? 'L' : t === live.length ? 'T' : 'M' });
    }
    return out;
  }
  // 점수 → 족보 번호(1 로열 ~ 10 하이카드, 작을수록 강함)
  function _typeOf(score) { return 10 - Math.floor(score / 1048576); }
  // 엔진 강도 판정(_handStrength) 전에 거르는 필요조건: 에어는 보드와 같은 족보, 메이드 손은 보드보다 높은 족보.
  // 통과한 묶음만 엔진으로 확정하므로 결과는 엔진 판정 그대로다(드문 경계 손이 후보에서 빠질 뿐).
  function _airCand(g, bt) { return g.minT === bt && g.maxT === bt; }
  function _madeCand(g, bt) { return g.maxT < bt; }
  // 묶음 안 콤보의 엔진 강도 분포. 같은 클래스(같은 랭크)에서 7장 점수가 같으면 강도도 같으므로 점수별로 한 번만 묻는다.
  // (상대 콤보의 강도는 레인지 구성에만 쓰고 정답 계산에는 쓰지 않는다.)
  function _groupStrengths(g, board) {
    if (g._st) return g._st;
    var st = {}, byScore = {};
    g.items.forEach(function(x) {
      var s = byScore[x.s];
      if (s === undefined) s = byScore[x.s] = _strength(_split(x.c), board) || 'unknown';
      st[s] = (st[s] || 0) + 1;
    });
    g._st = st;
    return st;
  }
  function _onlyStrengths(g, board, allowed) {
    var st = _groupStrengths(g, board);
    return Object.keys(st).every(function(k) { return allowed.indexOf(k) >= 0; });
  }
  function _missedDraw(g, board) {
    if (g._md !== undefined) return g._md;
    var turn = board.slice(0, 4);
    g._md = g.items.some(function(x) { return _hasDraw(_split(x.c), turn); });
    return g._md;
  }
  // 묶음을 앞에서부터 k개까지 고른다(조건 ok, 콤보 합 base + n <= cap)
  function _pickGroups(list, k, ok, cap, base) {
    var out = [], n = 0;
    for (var i = 0; i < list.length && out.length < k; i++) {
      var g = list[i];
      if (base + n + g.n > cap || !ok(g)) continue;
      out.push(g); n += g.n;
    }
    return out;
  }
  function _bySize(gs) {   // 안정 정렬(콤보 수 오름차순), 같은 크기 안에서는 기존 순서 유지
    return gs.map(function(g, i) { return { g: g, i: i }; }).sort(function(a, b) { return (a.g.n - b.g.n) || (a.i - b.i); })
      .map(function(x) { return x.g; });
  }
  function _sumN(gs) { var n = 0; gs.forEach(function(g) { n += g.n; }); return n; }
  // 레인지를 먼저 정한 뒤, 마진 0.08을 지키면서 정답이 target 쪽이 되는 벳 크기를 고른다. callers = 벳 뒤에 콜한 인원
  function _chooseSize(eq, P, fracs, callers, target, rnd) {
    var ok = fracs.map(function(f) {
      var B = _bet(P, f), pt = P + (1 + callers) * B;
      return { B: B, potTotal: pt, need: _need(pt, B) };
    }).filter(function(o) { return Math.abs(eq - o.need) >= MARGIN && (eq > o.need ? 'call' : 'fold') === target; });
    return ok.length ? _pick(ok, rnd) : null;
  }
  function _flatItems(groups) {
    var gs = groups.slice().sort(function(a, b) { return _clsKey(a.cls) - _clsKey(b.cls); });
    var items = [];
    gs.forEach(function(g) { g.items.forEach(function(x) { items.push(x); }); });
    return { groups: gs, items: items };
  }
  function _rangeText(groups) {
    var n = 0;
    var parts = groups.map(function(g) { n += g.n; return g.cls + '(' + g.n + ')'; });
    return parts.join(', ') + ', 총 ' + n + '콤보';
  }
  function _groupInfo(groups, heroScore) {
    return groups.map(function(g) {
      var w = 0, l = 0, t = 0;
      g.items.forEach(function(x) { if (x.s > heroScore) l++; else if (x.s < heroScore) w++; else t++; });
      return { cls: g.cls, combos: g.items.map(function(x) { return x.c; }), n: g.n, full: g.full, blocked: g.full - g.n,
        heroWins: w, heroTies: t, heroLoses: l };
    });
  }

  // ════════════════ facingbet-river ════════════════
  var RIVER_POTS = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40];
  var RIVER_FRACS = [1 / 3, 1 / 2, 2 / 3, 3 / 4, 1, 1.5];
  var MW_POTS = [12, 14, 16, 18, 20, 24, 28, 32, 36];
  var MW_FRACS = [1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
  var VALUE_OK = ['nut', 'strong', 'medium'];
  var CALLER_OK = ['strong', 'medium', 'weak-pair'];
  function _bet(P, f) { var B = Math.round(P * f * 2) / 2; return B < 0.5 ? 0.5 : B; }
  function _need(potTotal, toCall) { return toCall / (potTotal + toCall); }
  function _heroOkRiver(hs, hero, board) {
    if (hs === 'medium' || hs === 'weak-pair') return true;
    if (hs !== 'air') return false;
    // 에어는 A 하이 블러프캐처만(보드에 없는 A를 들고 있을 때)
    var br = board.map(function(c) { return c.charAt(0); });
    return hero.some(function(c) { return c.charAt(0) === 'A'; }) && br.indexOf('A') < 0;
  }
  function _riverDifficulty(margin, multi, blocked) {
    return _clamp(1500 + (margin < 0.12 ? 150 : 0) + (multi ? 100 : 0) + (blocked ? 100 : 0), 1500, 1800);
  }
  function _orderBluffs(board, rnd) {
    return function(Lc) {
      var md = [], other = [];
      _shuffle(Lc, rnd).forEach(function(g) { (_missedDraw(g, board) ? md : other).push(g); });
      return md.concat(other);
    };
  }
  function _riverDeal(rnd, heroMap) {
    for (var t = 0; t < 30; t++) {
      var board = _draw(rnd, 5, {});
      if (!board) return null;
      var hero = _heroFrom(heroMap, _deadMap(board), rnd);
      if (!hero) continue;
      var hs = _strength(hero, board);
      if (!_heroOkRiver(hs, hero, board)) continue;
      return { board: board, hero: hero, hs: hs };
    }
    return null;
  }
  function _riverHU(rnd) {
    var S = _S(), target = rnd() < 0.5 ? 'call' : 'fold';   // 정답 쪽을 먼저 정해 콜/폴드 비율을 반반으로
    for (var deal = 0; deal < 25; deal++) {
      var sc = _pick(S.hu, rnd);
      var d = _riverDeal(rnd, sc.hero);
      if (!d) continue;
      var board = d.board, hero = d.hero;
      var boardInts = board.map(_int), heroScore = _scoreOf(HandEval.evaluateIdx(hero.map(_int).concat(boardInts)));
      var groups = _groups(sc.vill, _deadMap(board.concat(hero)), boardInts, heroScore);
      var bt = _typeOf(_scoreOf(HandEval.evaluateIdx(boardInts)));
      var W = groups.filter(function(g) { return g.out === 'W' && _madeCand(g, bt); });
      var L = groups.filter(function(g) { return g.out === 'L' && _airCand(g, bt); });
      if (!W.length) continue;
      var P = _pick(RIVER_POTS, rnd);
      var okW = function(g) { return _onlyStrengths(g, board, VALUE_OK); };
      var okL = function(g) { return _onlyStrengths(g, board, ['air']); };
      for (var sel = 0; sel < 20; sel++) {
        // 폴드 쪽은 밸류 묶음을 늘리고 작은 블러프 묶음 1개만. 블러프 없는 레인지(승률 0)는 폴드 쪽 첫 시도에서 가끔만
        var kV = target === 'fold' ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
        var kB = target === 'fold' ? (sel === 0 && rnd() < 0.15 ? 0 : 1) : 1 + Math.floor(rnd() * 3);
        var V = _pickGroups(_shuffle(W, rnd), kV, okW, 18, 0);
        if (!V.length) continue;
        var bl = _orderBluffs(board, rnd)(L);
        if (target === 'fold') bl = _bySize(bl);
        var Bl = kB ? _pickGroups(bl, kB, okL, 24, _sumN(V)) : [];
        if (kB && !Bl.length) continue;
        var flat = _flatItems(V.concat(Bl)), wins = 0, ties = 0, losses = 0;
        flat.items.forEach(function(x) { if (x.s < heroScore) wins++; else if (x.s === heroScore) ties++; else losses++; });
        var n = flat.items.length, eq = (wins + 0.5 * ties) / n;
        if (n < 3) continue;
        var Z = _chooseSize(eq, P, RIVER_FRACS, 0, target, rnd);
        if (!Z) continue;
        var B = Z.B, potTotal = Z.potTotal, need = Z.need;
        var coach = _coachAction(hero, board, potTotal, B, eq, 'BB', [sc.vpos], flat.items.map(function(x) { return x.c; }));
        if (coach === 'raise' || coach === 'error') break;
        var info = _groupInfo(flat.groups, heroScore);
        var combos = flat.items.map(function(x) { return x.c; });
        var blocked = info.some(function(g) { return g.blocked > 0; });
        var answer = eq > need ? 'call' : 'fold';
        return {
          type: 'facingbet-river', key: null, concept: 'pot_odds', difficulty: _riverDifficulty(Math.abs(eq - need), false, blocked),
          confidence: 'exact', appDef: false, rated: true, srs: 'once', label: LABEL_RIVER, variant: 'default',
          prompt: '리버. 팟 ' + _num(potTotal) + 'bb(상대 벳 ' + _num(B) + 'bb 포함), 콜 ' + _num(B) + 'bb. 상대 벳 레인지가 표시된 ' +
            n + '콤보뿐이라면 콜? 폴드?',
          scene: { hero: hero, board: board, potTotal: potTotal, toCall: B,
            seats: [{ pos: sc.vpos, label: '벳 ' + _num(B) + 'bb', active: true }, { pos: 'BB', hero: true }],
            range: { label: sc.vpos + ' 벳 레인지', combos: combos, text: _rangeText(flat.groups) },
            note: LABEL_RIVER },
          options: [{ id: 'call', label: '콜' }, { id: 'fold', label: '폴드' }], answer: answer, ui: 'choice',
          data: { street: 'river', hero: hero, board: board, potTotal: potTotal, toCall: B, need: need, eq: eq,
            wins: wins, ties: ties, losses: losses, n: n, margin: Math.abs(eq - need), groups: info,
            heroStrength: d.hs, heroPos: 'BB', villPos: sc.vpos, coachAction: coach }
        };
      }
    }
    return null;
  }
  // 멀티웨이 정수 경로: 히어로 점수 h, A/B 항목 {i0, i1, s}
  function _eqMultiFast(h, A, B) {
    var tot = 0, cnt = 0;
    for (var i = 0; i < A.length; i++) {
      var a = A[i];
      for (var j = 0; j < B.length; j++) {
        var b = B[j];
        if (a.i0 === b.i0 || a.i0 === b.i1 || a.i1 === b.i0 || a.i1 === b.i1) continue;
        cnt++;
        if (a.s > h || b.s > h) continue;
        tot += 1 / (1 + (a.s === h ? 1 : 0) + (b.s === h ? 1 : 0));
      }
    }
    return cnt ? tot / cnt : 0;
  }
  function _shareHU(h, items) {
    var t = 0;
    items.forEach(function(x) { t += x.s < h ? 1 : x.s === h ? 0.5 : 0; });
    return items.length ? t / items.length : 0;
  }
  function _riverMW(rnd) {
    var S = _S(), sc = S.mw, target = rnd() < 0.5 ? 'call' : 'fold';
    for (var deal = 0; deal < 25; deal++) {
      var d = _riverDeal(rnd, sc.hero);
      if (!d) continue;
      var board = d.board, hero = d.hero, dead = _deadMap(board.concat(hero));
      var boardInts = board.map(_int), h = _scoreOf(HandEval.evaluateIdx(hero.map(_int).concat(boardInts)));
      var memo = {}, gA = _groups(sc.a, dead, boardInts, h, memo), gB = _groups(sc.b, dead, boardInts, h, memo);
      var bt = _typeOf(_scoreOf(HandEval.evaluateIdx(boardInts)));
      var WA = gA.filter(function(g) { return g.out === 'W' && _madeCand(g, bt); });
      var LA = gA.filter(function(g) { return g.out === 'L' && _airCand(g, bt); });
      var WB = gB.filter(function(g) { return g.out === 'W' && _madeCand(g, bt); });
      var LB = gB.filter(function(g) { return g.out === 'L' && _madeCand(g, bt); });
      if (!WA.length || !WB.length || !LB.length) continue;
      var P = _pick(MW_POTS, rnd);
      var okVal = function(g) { return _onlyStrengths(g, board, VALUE_OK); };
      var okAir = function(g) { return _onlyStrengths(g, board, ['air']); };
      var okCall = function(g) { return _onlyStrengths(g, board, CALLER_OK); };
      for (var sel = 0; sel < 20; sel++) {
        // 벳 레인지(A)는 밸류 + 블러프, 콜 레인지(B)는 내가 지는 손과 이기는 손이 함께 있어야 한다
        var aV = _pickGroups(_shuffle(WA, rnd), 1 + Math.floor(rnd() * 2), okVal, 12, 0);
        var la = _orderBluffs(board, rnd)(LA);
        if (target === 'fold') la = _bySize(la);
        var aB = _pickGroups(la, target === 'fold' ? 1 : 1 + Math.floor(rnd() * 2), okAir, 18, _sumN(aV));
        if (!aV.length || !aB.length) continue;
        var bW = _pickGroups(_shuffle(WB, rnd), target === 'fold' ? 1 + Math.floor(rnd() * 2) : 1, okCall, 10, 0);
        var bL = _pickGroups(_shuffle(LB, rnd), target === 'fold' ? 1 : 1 + Math.floor(rnd() * 2), okCall, 14, _sumN(bW));
        if (!bW.length || !bL.length) continue;
        var fa = _flatItems(aV.concat(aB)), fb = _flatItems(bW.concat(bL));
        var eq = _eqMultiFast(h, fa.items, fb.items);
        var Z = _chooseSize(eq, P, MW_FRACS, 1, target, rnd);
        if (!Z) continue;
        var Bt = Z.B, potTotal = Z.potTotal, need = Z.need;
        var coach = _coachAction(hero, board, potTotal, Bt, eq, 'BB', [sc.apos, sc.bpos]);
        if (coach === 'raise' || coach === 'error') break;
        var infoA = _groupInfo(fa.groups, h), infoB = _groupInfo(fb.groups, h);
        var cA = fa.items.map(function(x) { return x.c; }), cB = fb.items.map(function(x) { return x.c; });
        var blocked = infoA.concat(infoB).some(function(g) { return g.blocked > 0; });
        var rA = { label: sc.apos + ' 벳 레인지', combos: cA, text: _rangeText(fa.groups) };
        var rB = { label: sc.bpos + ' 콜 레인지', combos: cB, text: _rangeText(fb.groups) };
        return {
          type: 'facingbet-river', key: null, concept: 'pot_odds', difficulty: _riverDifficulty(Math.abs(eq - need), true, blocked),
          confidence: 'exact', appDef: false, rated: true, srs: 'once', label: LABEL_RIVER, variant: 'multiway',
          prompt: '리버 3인. 팟 ' + _num(potTotal) + 'bb(' + sc.apos + ' 벳 ' + _num(Bt) + 'bb, ' + sc.bpos + ' 콜 ' + _num(Bt) +
            'bb 포함), 콜 ' + _num(Bt) + 'bb. 두 레인지를 모두 이겨야 내 승리, 콜? 폴드?',
          scene: { hero: hero, board: board, potTotal: potTotal, toCall: Bt,
            seats: [{ pos: sc.apos, label: '벳 ' + _num(Bt) + 'bb', active: true }, { pos: sc.bpos, label: '콜 ' + _num(Bt) + 'bb' },
              { pos: 'BB', hero: true }],
            range: rA, range2: rB, ranges: [rA, rB],
            note: LABEL_RIVER + '. ' + rB.label + ': ' + rB.text },
          options: [{ id: 'call', label: '콜' }, { id: 'fold', label: '폴드' }], answer: eq > need ? 'call' : 'fold', ui: 'choice',
          data: { street: 'river', hero: hero, board: board, potTotal: potTotal, toCall: Bt, need: need, eq: eq,
            margin: Math.abs(eq - need), eqA: _shareHU(h, fa.items), eqB: _shareHU(h, fb.items),
            ranges: [{ pos: sc.apos, groups: infoA }, { pos: sc.bpos, groups: infoB }],
            heroStrength: d.hs, heroPos: 'BB', villPos: [sc.apos, sc.bpos], coachAction: coach }
        };
      }
    }
    return null;
  }
  function _riverNext(rnd, opts) {
    if (!_ready()) return null;
    rnd = _rnd(rnd);
    var v = opts && opts.variant;
    if (v === 'marginal') return null; // 둘 다 OK 변형은 M6(소비처 s5-05)
    return v === 'multiway' ? _riverMW(rnd) : _riverHU(rnd);
  }
  function _combosOk(list, dead) {
    if (!Array.isArray(list) || !list.length) return false;
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var cb = list[i];
      if (typeof cb !== 'string' || cb.length !== 4) return false;
      var p = _split(cb);
      if (!_validCard(p[0]) || !_validCard(p[1]) || p[0] === p[1]) return false;
      if (dead[p[0]] || dead[p[1]]) return false;
      var k = _cls(p[0], p[1]) + '|' + [p[0], p[1]].sort().join('');
      if (seen[k]) return false;
      seen[k] = 1;
    }
    return true;
  }
  function _baseOk(q, type, nBoard) {
    var s = q && q.scene;
    if (!q || q.type !== type || !s || !Array.isArray(s.board) || !Array.isArray(s.hero)) return false;
    if (nBoard.indexOf(s.board.length) < 0 || s.hero.length !== 2) return false;
    var cards = s.board.concat(s.hero);
    if (!cards.every(_validCard) || Object.keys(_deadMap(cards)).length !== cards.length) return false;
    if (!(s.potTotal > 0) || !(s.toCall > 0)) return false;
    if (q.confidence !== 'exact' || q.srs !== 'once' || q.key !== null) return false;
    var ids = (q.options || []).map(function(o) { return o.id; }).sort().join(',');
    if (ids !== 'call,fold') return false;
    var hs = _strength(s.hero, s.board);
    return !(hs === 'nut' || hs === 'strong' || hs === null);
  }
  function _riverVerify(q) {
    try {
      if (!_baseOk(q, 'facingbet-river', [5])) return false;
      var s = q.scene, dead = _deadMap(s.board.concat(s.hero));
      var need = _need(s.potTotal, s.toCall), r;
      if (q.variant === 'multiway') {
        var A = s.ranges ? s.ranges[0] : s.range, B = s.ranges ? s.ranges[1] : s.range2;
        if (!A || !B || !_combosOk(A.combos, dead) || !_combosOk(B.combos, dead)) return false;
        r = equityMultiway(s.hero, s.board, A.combos, B.combos);
        if (!r.pairs) return false;
      } else {
        if (!s.range || !_combosOk(s.range.combos, dead)) return false;
        r = equityVsCombos(s.hero, s.board, s.range.combos);
      }
      if (Math.abs(r.eq - need) < MARGIN) return false;
      if (q.data && typeof q.data.eq === 'number' && Math.abs(q.data.eq - r.eq) > 1e-9) return false;
      if (q.answer !== (r.eq > need ? 'call' : 'fold')) return false;
      var vp = q.data && q.data.villPos, others = Array.isArray(vp) ? vp : [vp || 'BTN'];
      var ca = _coachAction(s.hero, s.board, s.potTotal, s.toCall, r.eq, 'BB', others, q.variant === 'multiway' ? null : s.range.combos);
      return ca !== 'raise' && ca !== 'error';
    } catch (e) { return false; }
  }
  function _groupList(info, pick) {
    return info.filter(pick).map(function(g) { return g.cls + ' ' + g.n; }).join(', ');
  }
  function _riverExplain(q) {
    var d = q.data || {}, s = q.scene, need = _need(s.potTotal, s.toCall), call = q.answer === 'call', s1, s2;
    var price = '필요 승률 ' + _num(s.toCall) + ' ÷ (' + _num(s.potTotal) + '+' + _num(s.toCall) + ') = ' + _pct(need) + '%';
    if (q.variant === 'multiway') {
      var vp = Array.isArray(d.villPos) ? d.villPos : ['CO', 'BTN'];
      s1 = vp[0] + ' 레인지 중 내가 이기는 비율 ' + _pct(d.eqA) + '%, ' + vp[1] + ' 레인지 중 ' + _pct(d.eqB) + '%. 둘 다 이기는 비율은 ' + _pct(d.eq) +
        '%(겹치는 카드 반영).';
      s2 = price + ' → ' + (call ? '콜' : '폴드') + '. 상대가 둘이면 둘 다 이겨야 해서 승률이 크게 줄어요.';
    } else {
      var info = d.groups || [];
      var win = _groupList(info, function(g) { return g.heroWins === g.n; });
      var lose = _groupList(info, function(g) { return g.heroLoses === g.n; });
      s1 = '내가 이기는 콤보 ' + d.wins + '개' + (win ? '(' + win + ')' : '') + (d.ties ? ', 비김 ' + d.ties + '개' : '') + ', 지는 콤보 ' +
        d.losses + '개' + (lose ? '(' + lose + ')' : '') + ' → 내 승률 ' + _pct(d.eq) + '%.';
      s2 = price + ' → ' + (call ? '콜' : '폴드') + '. (' + LABEL_RIVER + ')';
    }
    return { line: s1 + ' ' + s2, lines: [s1, s2], label: LABEL_RIVER,
      scene: { hero: s.hero, board: s.board, ring: { potTotal: s.potTotal, toCall: s.toCall, eq: d.eq } } };
  }

  // ════════════════ facingbet-next ════════════════
  var NEXT_POTS = { flop: [6, 8, 10, 12, 14], turn: [10, 12, 14, 16, 18, 20, 24] };
  var NEXT_FRACS = { flop: [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1], turn: [1 / 3, 1 / 2, 2 / 3, 3 / 4, 1, 1.5] };
  var PHRASE_FLOP = '다음 1장 기준(리버까지 아님)';
  var PHRASE_TURN = '다음 1장(리버) 기준';
  // 다음 1장 정수 경로: 히어로 점수를 카드마다 1번만 구하고 콤보마다 비교
  function _nextFast(hero, board, items) {
    var evIdx = HandEval.evaluateIdx, dead = _deadMap(hero.concat(board));
    var deck = ALL.filter(function(c) { return !dead[c]; }).map(_int);
    var bi = board.map(_int), hb = hero.map(_int).concat(bi, [0]), vb = [0, 0].concat(bi, [0]), last = hb.length - 1;
    var hs = new Array(deck.length);
    for (var k = 0; k < deck.length; k++) { hb[last] = deck[k]; hs[k] = _scoreOf(evIdx(hb)); }
    var tot = 0, cnt = 0, win = 0, tie = 0, per = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      vb[0] = it.i0; vb[1] = it.i1;
      var m = 0;
      for (var j = 0; j < deck.length; j++) {
        var x = deck[j];
        if (x === it.i0 || x === it.i1) continue;
        vb[last] = x;
        var v = _scoreOf(evIdx(vb)), h = hs[j];
        cnt++; m++;
        if (h > v) { tot += 1; win++; } else if (h === v) { tot += 0.5; tie++; }
      }
      per = m;
    }
    return { eq: cnt ? tot / cnt : 0, n: cnt, cards: per, winCards: win, tieCards: tie };
  }
  function _itemOf(cb) { var p = _split(cb); return { c: cb, i0: _int(p[0]), i1: _int(p[1]) }; }
  function _curScore(cards2, board) { return _scoreOf(HandEval.evaluateIdx(cards2.map(_int).concat(board.map(_int)))); }
  // 보드(3~4장)만의 족보 번호(엔진 Villain의 보드 기준과 같은 규칙): 4장 3, 3장 7, 페어 2개 8, 페어 1개 9, 없음 10
  function _boardRankType(board) {
    var cnt = {}, pairs = 0, trips = false, quads = false;
    board.forEach(function(c) { cnt[c.charAt(0)] = (cnt[c.charAt(0)] || 0) + 1; });
    Object.keys(cnt).forEach(function(r) { if (cnt[r] >= 4) quads = true; else if (cnt[r] === 3) trips = true; else if (cnt[r] === 2) pairs++; });
    return quads ? 3 : trips ? 7 : pairs >= 2 ? 8 : pairs === 1 ? 9 : 10;
  }
  // 상대가 벳할 만한 손(출제 분포용 휴리스틱): 지금 보드보다 높은 족보(메이드) 또는 드로우. 순수 에어는 가끔(블러프)만.
  function _bettable(cards2, board, rnd) {
    if (_typeOf(_curScore(cards2, board)) < _boardRankType(board)) return true;
    if (_hasDraw(cards2, board)) return true;
    return rnd() < 0.15;
  }
  function _nextVillain(sc, board, hero, rnd, single, drawVar, target) {
    var dead = _deadMap(board.concat(hero)), hNow = _curScore(hero, board), t, cb, p;
    var classes = sc.vill;
    if (single) {
      for (t = 0; t < 60; t++) {
        var cls = _pick(classes, rnd), live = _classCombos(cls).filter(function(c) { p = _split(c); return !dead[p[0]] && !dead[p[1]]; });
        if (!live.length) continue;
        cb = _pick(live, rnd);
        p = _split(cb);
        if (!_bettable(p, board, rnd)) continue;
        if (drawVar && !(_curScore(p, board) > hNow)) continue;    // 드로우 스팟: 상대가 지금 앞서 있다
        return { combos: [cb], groups: [{ cls: cls, n: 1 }], single: true };
      }
      return null;
    }
    for (t = 0; t < 40; t++) {
      var k = 2 + Math.floor(rnd() * 2), gs = [], n = 0, used = {};
      for (var u = 0; u < 20 && gs.length < k; u++) {
        var c2 = _pick(classes, rnd);
        if (used[c2]) continue;
        used[c2] = 1;
        var lv = _classCombos(c2).filter(function(c) { p = _split(c); return !dead[p[0]] && !dead[p[1]]; });
        if (!lv.length || n + lv.length > 12) continue;
        if (!lv.every(function(c) { return _bettable(_split(c), board, function() { return 1; }); })) continue;
        gs.push({ cls: c2, combos: lv, n: lv.length }); n += lv.length;
      }
      if (gs.length < 2) continue;
      gs.sort(function(a, b) { return _clsKey(a.cls) - _clsKey(b.cls); });
      var combos = [];
      gs.forEach(function(g) { combos = combos.concat(g.combos); });
      var ahead = combos.filter(function(c) { return _curScore(_split(c), board) > hNow; }).length;
      if (drawVar && ahead * 2 < combos.length) continue;          // 드로우 스팟: 절반 이상이 지금 앞서 있다
      if (drawVar && target === 'call' && ahead === combos.length && rnd() < 0.5) continue;
      return { combos: combos, groups: gs.map(function(g) { return { cls: g.cls, n: g.n }; }), single: false };
    }
    return null;
  }
  function _nextDifficulty(margin, range) { return _clamp(1500 + (margin < 0.12 ? 150 : 0) + (range ? 100 : 0), 1500, 1800); }
  function _nextBuild(rnd, drawVar) {
    var S = _S(), target = rnd() < 0.5 ? 'call' : 'fold';
    for (var deal = 0; deal < 100; deal++) {
      var sc = _pick(S.hu, rnd);
      var street = rnd() < 0.5 ? 'flop' : 'turn', nb = street === 'flop' ? 3 : 4;
      var board = _draw(rnd, nb, {});
      if (!board) return null;
      var hero = _heroFrom(sc.hero, _deadMap(board), rnd);
      if (!hero) continue;
      var hd = _hasDraw(hero, board);
      if (drawVar && !hd) continue;
      var hs = _strength(hero, board);
      if (!hs || hs === 'nut' || hs === 'strong') continue;
      if (!drawVar && !hd && hs !== 'medium' && hs !== 'weak-pair') continue;
      var vill = _nextVillain(sc, board, hero, rnd, rnd() < 0.6, drawVar, target);
      if (!vill) continue;
      var res = _nextFast(hero, board, vill.combos.map(_itemOf));
      var P = _pick(NEXT_POTS[street], rnd);
      var sizes = NEXT_FRACS[street].map(function(f) {
        var B = _bet(P, f);
        return { B: B, potTotal: P + B, need: _need(P + B, B) };
      }).filter(function(o) { return Math.abs(res.eq - o.need) >= MARGIN; });
      if (!sizes.length) continue;
      var pref = sizes.filter(function(o) { return (res.eq > o.need ? 'call' : 'fold') === target; });
      if (!pref.length && deal < 70) continue;          // 70딜 안에 못 맞추면 어느 쪽이든 받는다
      var Z = _pick(pref.length ? pref : sizes, rnd);
      var coach = _coachAction(hero, board, Z.potTotal, Z.B, res.eq, 'BB', [sc.vpos], vill.combos);
      if (coach === 'raise' || coach === 'error') continue;
      var answer = res.eq > Z.need ? 'call' : 'fold';
      var phrase = street === 'flop' ? PHRASE_FLOP : PHRASE_TURN;
      var vText = vill.single ? cardText(vill.combos[0].slice(0, 2)) + cardText(vill.combos[0].slice(2, 4)) : null;
      var who = vill.single ? '상대 패는 ' + vText + '.' : '상대 패는 표시된 ' + vill.combos.length + '콤보 중 하나.';
      return {
        type: 'facingbet-next', key: null, concept: hd ? 'draws' : 'pot_odds',
        difficulty: _nextDifficulty(Math.abs(res.eq - Z.need), !vill.single),
        confidence: 'exact', appDef: false, rated: true, srs: 'once', label: LABEL_EXACT, variant: drawVar ? 'draw' : 'default',
        prompt: (street === 'flop' ? '플랍' : '턴') + '. 팟 ' + _num(Z.potTotal) + 'bb(상대 벳 ' + _num(Z.B) + 'bb 포함), 콜 ' + _num(Z.B) +
          'bb. ' + who + ' ' + phrase + '으로 콜? 폴드?',
        scene: { hero: hero, board: board, potTotal: Z.potTotal, toCall: Z.B,
          seats: [{ pos: sc.vpos, label: '벳 ' + _num(Z.B) + 'bb', active: true }, { pos: 'BB', hero: true }],
          range: { label: vill.single ? sc.vpos + ' 패' : sc.vpos + ' 레인지', combos: vill.combos,
            text: vill.single ? vText : vill.groups.map(function(g) { return g.cls + '(' + g.n + ')'; }).join(', ') + ', 총 ' + vill.combos.length + '콤보' },
          note: phrase + ', ' + LABEL_EXACT },
        options: [{ id: 'call', label: '콜' }, { id: 'fold', label: '폴드' }], answer: answer, ui: 'choice',
        data: { street: street, hero: hero, board: board, potTotal: Z.potTotal, toCall: Z.B, need: Z.need, eq: res.eq,
          margin: Math.abs(res.eq - Z.need), n: res.n, cards: res.cards, winCards: res.winCards, tieCards: res.tieCards,
          single: vill.single, groups: vill.groups, heroStrength: hs, heroDraw: hd, heroPos: 'BB', villPos: sc.vpos, coachAction: coach }
      };
    }
    return null;
  }
  function _nextNext(rnd, opts) {
    if (!_ready()) return null;
    rnd = _rnd(rnd);
    return _nextBuild(rnd, !!(opts && opts.variant === 'draw'));
  }
  function _nextVerify(q) {
    try {
      if (!_baseOk(q, 'facingbet-next', [3, 4])) return false;
      var s = q.scene, flop = s.board.length === 3;
      if (String(q.prompt).indexOf(flop ? PHRASE_FLOP : PHRASE_TURN) < 0) return false;
      if (!s.range || !_combosOk(s.range.combos, _deadMap(s.board.concat(s.hero)))) return false;
      if (q.variant === 'draw' && !_hasDraw(s.hero, s.board)) return false;
      var r = equityNextCard(s.hero, s.board, s.range.combos), need = _need(s.potTotal, s.toCall);
      if (r.cards !== 52 - 2 - s.board.length - 2) return false;
      if (Math.abs(r.eq - need) < MARGIN) return false;
      if (q.data && typeof q.data.eq === 'number' && Math.abs(q.data.eq - r.eq) > 1e-9) return false;
      if (q.answer !== (r.eq > need ? 'call' : 'fold')) return false;
      var ca = _coachAction(s.hero, s.board, s.potTotal, s.toCall, r.eq, 'BB', [(q.data && q.data.villPos) || 'BTN'], s.range.combos);
      return ca !== 'raise' && ca !== 'error';
    } catch (e) { return false; }
  }
  function _nextExplain(q) {
    var d = q.data || {}, s = q.scene, need = _need(s.potTotal, s.toCall), call = q.answer === 'call', s1;
    var flop = s.board.length === 3;
    if (d.single) {
      s1 = '다음 1장 ' + d.cards + '장 중 내가 앞서는 카드 ' + d.winCards + '장' + (d.tieCards ? ', 비기는 카드 ' + d.tieCards + '장' : '') +
        ' → ' + _pct(d.eq) + '%.';
    } else {
      s1 = '상대 ' + s.range.combos.length + '콤보마다 다음 1장 ' + d.cards + '장을 모두 따지면 내가 앞서는 비율 ' + _pct(d.eq) + '%.';
    }
    var s2 = '필요 승률 ' + _num(s.toCall) + ' ÷ (' + _num(s.potTotal) + '+' + _num(s.toCall) + ') = ' + _pct(need) + '% → ' +
      (call ? '콜' : '폴드') + '.' + (flop ? ' 리버 카드와 그 뒤 벳(임플라이드 오즈)은 계산에 없어요.' : '');
    return { line: s1 + ' ' + s2, lines: [s1, s2], label: LABEL_EXACT,
      scene: { hero: s.hero, board: s.board, ring: { potTotal: s.potTotal, toCall: s.toCall, eq: d.eq } } };
  }

  // ── 생성기 객체(C1)와 등록 ──
  var gens = {
    texture: { next: _texNext, verify: _texVerify, explain: _texExplain, fromKey: _texFromKey, ready: _ready },
    cbet2: { next: _cbNext, verify: _cbVerify, explain: _cbExplain, ready: _ready },
    'facingbet-river': { next: _riverNext, verify: _riverVerify, explain: _riverExplain, ready: _ready },
    'facingbet-next': { next: _nextNext, verify: _nextVerify, explain: _nextExplain, ready: _ready }
  };
  var META = {
    texture: { stage: 3, group: 'other', concept: 'board_texture' },
    cbet2: { stage: 3, group: 'other', concept: 'cbet' },
    'facingbet-river': { stage: 3, group: 'other', concept: 'turn_river' },   // M2-P1 TYPE_META 정본과 같게(다르면 등록 때 warn)
    'facingbet-next': { stage: 3, group: 'other', concept: 'draws' }
  };
  if (typeof Puzzles !== 'undefined' && Puzzles && typeof Puzzles.register === 'function') {
    Object.keys(gens).forEach(function(t) { Puzzles.register(t, gens[t], META[t]); });
  }

  var api = {
    gens: gens, META: META, MARGIN: MARGIN, VALID_IDS: VALID_IDS, CLASS_WEATHER: CLASS_WEATHER, CLASS_HEIGHT: CLASS_HEIGHT,
    topHeight: topHeight, heightOf: heightOf, axesOf: axesOf, classifyIndep: _classifyIndep, axesIndep: _axesIndep,
    equityVsCombos: equityVsCombos, equityMultiway: equityMultiway, equityNextCard: equityNextCard,
    cardText: cardText, classCombos: _classCombos,
    _scoreOf: _scoreOf, _eqMultiFast: _eqMultiFast, _nextFast: _nextFast, _itemOf: _itemOf, _coachAction: _coachAction, _coachVerdict: _coachVerdict
  };
  if (typeof module !== 'undefined' && module) module.exports = api;
  return api;
})();
