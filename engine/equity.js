// engine/equity.js — 프리플랍 룩업 + 포스트플랍 인라인 MC (file:// Worker 차단 우회)
// 모바일 성능(A-4a): 정수 카드(r*4+s) + 부분 Fisher–Yates, 반복마다 덱 생성/셔플/filter 제거,
// 핸드 클래스 룩업 상수화. calc(state, cb)는 기존처럼 cb를 동기로 호출한다.
// M5-COACH: calc(state, cb, { toStreet: 'next' })와 순수 nextCard(heroCards, range, board)(다음 1장 열거), liveCombos.
var Equity = (function() {
  var RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  var SUITS = ['s','h','d','c'];
  var RANK_IDX = Object.create(null), SUIT_IDX = Object.create(null);
  RANKS.forEach(function(r, i) { RANK_IDX[r] = i; });
  SUITS.forEach(function(s, i) { SUIT_IDX[s] = i; });

  // 카드쌍(정수 a*52+b) → 169 핸드 클래스 id, 클래스 라벨('AKs','QQ','72o') → id
  var CLASS_INDEX = Object.create(null);
  var CLASS_ID = new Int16Array(52 * 52);
  (function() {
    var next = 0;
    for (var a = 0; a < 52; a++) {
      for (var b = 0; b < 52; b++) {
        if (a === b) { CLASS_ID[a * 52 + b] = -1; continue; }
        var ra = a >> 2, rb = b >> 2, hi = ra > rb ? ra : rb, lo = ra > rb ? rb : ra;
        var name = RANKS[hi] + RANKS[lo] + (hi === lo ? '' : ((a & 3) === (b & 3) ? 's' : 'o'));
        var id = CLASS_INDEX[name];
        if (id === undefined) id = CLASS_INDEX[name] = next++;
        CLASS_ID[a * 52 + b] = id;
      }
    }
  })();

  var api = { ITERATIONS: 500 };

  // calc(state, cb, opts): opts 없으면 예전 그대로(프리플랍 룩업 또는 리버까지 MC 500회).
  // M5-COACH: opts.toStreet === 'next'이고 보드가 3~5장이면 nextCard(다음 1장 열거, 리버는 지금 승부 열거)로 cb.
  //   상대 레인지는 state.villainRange(없으면 랜덤). 프리플랍은 다음 1장이 아니라 3장이라 예전 경로 그대로.
  function calc(state, cb, opts) {
    if (!state || !state.heroCards || state.heroCards.length < 2) {
      cb(0.5); return;
    }
    var board = state.board || [];
    if (opts && opts.toStreet === 'next' && board.length >= 3 && board.length <= 5) {
      var nx = nextCard(state.heroCards, state.villainRange || null, board);
      cb(nx == null ? 0.5 : nx); return;   // 살아 있는 콤보가 없으면 MC 경로와 같은 0.5
    }
    // 프리플랍 룩업은 vs랜덤 값 — 빌런 레인지가 지정된 스팟은 룩업 대신 레인지 MC 사용 (07-20 7차-3)
    if (board.length === 0 && !state.villainRange && typeof PreflopEquity !== 'undefined') {
      var key = _preflopKey(state.heroCards);
      var eq = PreflopEquity[key];
      if (eq != null) { cb(eq); return; }
    }
    // 인라인 MC — Worker 없이 실행 (500회, 모바일에서도 수 ms~수십 ms)
    var raw = state.villainRange;
    var villainRange = raw instanceof Set ? raw : (Array.isArray(raw) ? new Set(raw) : null);
    var equity = _monteCarlo(state.heroCards, villainRange, board, api.ITERATIONS);
    cb(equity);
  }

  function _cardInt(c) { return RANK_IDX[c.rank] * 4 + SUIT_IDX[c.suit]; }

  // rnd: [0,1) 난수 함수(기본 Math.random, 테스트는 시드 RNG 주입)
  // onSample(a, b): 테스트 훅 — 채택된 빌런 카드쌍(정수)을 반복마다 알려준다
  function _monteCarlo(heroCards, rangeSet, board, n, rnd, onSample) {
    rnd = rnd || Math.random;
    var heroN = heroCards.length, boardN = board.length;
    var need = 5 - boardN;
    if (need < 0) need = 0;

    // 1. 데드 카드 제외한 가용 덱 1회 생성 (반복 중엔 같은 배열을 계속 섞는다 — FY는 시작 순서와 무관하게 균등)
    var dead = new Uint8Array(52);
    var hero = _zeros(heroN + boardN + need), vill = _zeros(2 + boardN + need);
    for (var h = 0; h < heroN; h++) { hero[h] = _cardInt(heroCards[h]); dead[hero[h]] = 1; }
    for (var b = 0; b < boardN; b++) {
      var bc = _cardInt(board[b]);
      dead[bc] = 1;
      hero[heroN + b] = bc; vill[2 + b] = bc;
    }
    var deck = new Int8Array(52), A = 0;
    for (var c = 0; c < 52; c++) if (!dead[c]) deck[A++] = c;

    // 2. 레인지 마스크 (기존: 빈 레인지 = vs랜덤). Set 또는 배열
    var mask = null;
    if (rangeSet && (rangeSet.size || rangeSet.length) > 0) {
      mask = _buildMask(rangeSet);
      // 뽑을 수 있는 레인지 쌍이 하나도 없으면 기존 코드도 매 반복 실패 → 0.5
      if (!mask || !_hasRangePair(deck, A, mask)) return 0.5;
    }

    // 전역 조회는 반복 밖에서 1회 (node vm 컨텍스트에선 전역 조회가 특히 느림)
    var evalIdx = HandEval.evaluateIdx, compare = HandEval.compareHands;
    var wins = 0, ties = 0, total = 0;
    var heroOff = heroN + boardN, villOff = 2 + boardN;
    for (var it = 0; it < n; it++) {
      // 빌런 2장 → deck 위치 0,1
      if (mask) { if (!_pickRangePair(deck, A, mask, rnd)) continue; }
      else if (!_pickRandomPair(deck, A, rnd)) continue;
      if (onSample) onSample(deck[0], deck[1]);
      if (A - 2 < need) continue;
      // 런아웃: 위치 2..A-1에서 별도 부분 FY — 쌍 선택 스캔이 남긴 순서 편향을 끊는다
      for (var k = 0; k < need; k++) {
        var i = 2 + k, j = i + ((rnd() * (A - i)) | 0), t = deck[j];
        deck[j] = deck[i]; deck[i] = t;
        hero[heroOff + k] = t; vill[villOff + k] = t;
      }
      vill[0] = deck[0]; vill[1] = deck[1];
      var cmp = compare(evalIdx(hero), evalIdx(vill));
      if (cmp < 0) wins++;
      else if (cmp === 0) ties += 0.5;
      total++;
    }
    return total > 0 ? (wins + ties) / total : 0.5;
  }

  function _zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }

  // 레인지 라벨 → 169 마스크. 유효 라벨이 하나도 없으면 null
  function _buildMask(rangeSet) {
    var mask = new Uint8Array(169), any = false;
    rangeSet.forEach(function(k) {
      var id = typeof k === 'string' ? CLASS_INDEX[k] : undefined;
      if (id !== undefined) { mask[id] = 1; any = true; }
    });
    return any ? mask : null;
  }

  // vs랜덤: 부분 FY 2장
  function _pickRandomPair(deck, A, rnd) {
    if (A < 2) return false;
    var j = (rnd() * A) | 0, t = deck[0]; deck[0] = deck[j]; deck[j] = t;
    j = 1 + ((rnd() * (A - 1)) | 0); t = deck[1]; deck[1] = deck[j]; deck[j] = t;
    return true;
  }

  // 레인지: 전체 FY 순열 → 사전순 첫 in-range 쌍 (기존 샘플러 분포 그대로 보존) → 위치 0,1로
  function _pickRangePair(deck, A, mask, rnd) {
    var i, j, t;
    for (i = A - 1; i > 0; i--) {
      j = (rnd() * (i + 1)) | 0; t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    for (i = 0; i < A - 1; i++) {
      var row = deck[i] * 52;
      for (j = i + 1; j < A; j++) {
        if (mask[CLASS_ID[row + deck[j]]]) {
          // i < j: 0↔i 다음 1↔j (i===1이어도 j의 카드는 그대로)
          t = deck[0]; deck[0] = deck[i]; deck[i] = t;
          t = deck[1]; deck[1] = deck[j]; deck[j] = t;
          return true;
        }
      }
    }
    return false;
  }

  function _hasRangePair(deck, A, mask) {
    for (var i = 0; i < A - 1; i++) {
      var row = deck[i] * 52;
      for (var j = i + 1; j < A; j++) if (mask[CLASS_ID[row + deck[j]]]) return true;
    }
    return false;
  }

  function _rankIdx(r) { var i = RANK_IDX[r]; return i === undefined ? -1 : i; }

  function _preflopKey(heroCards) {
    var c1 = heroCards[0], c2 = heroCards[1];
    var i1 = _rankIdx(c1.rank), i2 = _rankIdx(c2.rank);
    if (i1 < i2) { var tmp=c1; c1=c2; c2=tmp; var t=i1; i1=i2; i2=t; }
    return c1.rank + c2.rank + (i1 === i2 ? '' : (c1.suit === c2.suit ? 's' : 'o'));
  }

  // ── 다음 1장 에쿼티(M5-COACH, 설계서 3.2절 출제 제외 1번 (b), 10절 8번 (a)) ──
  // nextCard(heroCards, range, board) → 0~1 또는 null.
  //   보드 3장(플랍)은 턴 1장, 4장(턴)은 리버 1장을 열거한다. 남은 덱 = 52 - 내 2장 - 보드(플랍 47장, 턴 46장)이고
  //   상대 콤보마다 그 콤보의 2장도 빼서(플랍 45장, 턴 44장) (콤보, 다음 카드) 쌍을 모두 센다. 내가 앞서면 1, 같으면 0.5.
  //   콤보마다 카드 수가 같아 쌍 평균 = 레인지 콤보 균등 가중 평균이다. 보드 5장은 남은 카드 없이 지금 승부를 콤보마다 센다.
  //   range: null 또는 빈 값 = 랜덤(데드카드를 뺀 전체 콤보). Set 또는 배열 원소는 클래스 라벨('AKs', 'QQ', '72o') 또는
  //   콤보 4글자('AhKd'). 유효 원소가 하나도 없으면 랜덤, 살아 있는 콤보가 0개이거나 보드가 3~5장이 아니면 null.
  //   gen-postflop facingbet-next의 '다음 1장'(GenPostflop.equityNextCard)과 같은 정의다(j-coach-ext 테스트로 고정).
  // _nextInfo(...) → { eq, n(쌍 수), combos(살아 있는 콤보 수), cards(콤보당 다음 카드 수, 리버 0) } 또는 null.
  function _score(ev) {   // HandEval 결과 → 정수(클수록 강함). 족보, 그다음 tiebreakers 사전순(hand-eval.js 점수와 같은 순서)
    var s = (10 - ev.type) * 1048576, tb = ev.tiebreakers, m = 65536;
    for (var i = 0; i < tb.length && i < 5; i++) { s += tb[i] * m; m /= 16; }
    return s;
  }
  function _cardStrInt(s) {
    if (typeof s !== 'string' || s.length !== 2) return -1;
    var r = RANK_IDX[s.charAt(0)], u = SUIT_IDX[s.charAt(1)];
    return (r === undefined || u === undefined) ? -1 : r * 4 + u;
  }
  // 레인지 → 살아 있는 콤보 [a, b](정수, a < b) 목록. null = 랜덤
  function _liveCombos(range, dead) {
    var list = null;
    if (range) list = (range instanceof Set) ? Array.from(range) : (Array.isArray(range) ? range : null);
    if (list && !list.length) list = null;   // 빈 레인지 = 랜덤(MC 경로와 같음)
    var mask = null, explicit = [], a, b;
    if (list && list.length) {
      mask = new Uint8Array(169);
      var anyClass = false;
      list.forEach(function(k) {
        if (typeof k !== 'string') return;
        if (k.length === 4) {
          var x = _cardStrInt(k.slice(0, 2)), y = _cardStrInt(k.slice(2, 4));
          if (x >= 0 && y >= 0 && x !== y) explicit.push(x < y ? [x, y] : [y, x]);
          return;
        }
        var id = CLASS_INDEX[k];
        if (id !== undefined) { mask[id] = 1; anyClass = true; }
      });
      if (!anyClass) mask = null;
      if (!mask && !explicit.length) list = null;   // 유효 원소 없음 → 랜덤
    }
    var out = [], seen = new Uint8Array(52 * 52);
    function add(p, q) {
      if (dead[p] || dead[q] || seen[p * 52 + q]) return;
      seen[p * 52 + q] = 1; out.push([p, q]);
    }
    if (!list) {
      for (a = 0; a < 52; a++) for (b = a + 1; b < 52; b++) add(a, b);
      return out;
    }
    if (mask) for (a = 0; a < 52; a++) for (b = a + 1; b < 52; b++) if (mask[CLASS_ID[a * 52 + b]]) add(a, b);
    explicit.forEach(function(p) { add(p[0], p[1]); });
    return out;
  }
  function _nextInfo(heroCards, range, board) {
    if (!heroCards || heroCards.length !== 2 || !board || board.length < 3 || board.length > 5) return null;
    if (typeof HandEval === 'undefined' || !HandEval.evaluateIdx) return null;
    var dead = new Uint8Array(52), hero = [], bd = [], i, j;
    for (i = 0; i < 2; i++) hero.push(_cardInt(heroCards[i]));
    for (i = 0; i < board.length; i++) bd.push(_cardInt(board[i]));
    var all = hero.concat(bd);
    for (i = 0; i < all.length; i++) {
      if (!(all[i] >= 0 && all[i] < 52) || dead[all[i]]) return null;   // 잘못된 카드 또는 중복
      dead[all[i]] = 1;
    }
    var combos = _liveCombos(range, dead);
    if (!combos.length) return null;
    var evalIdx = HandEval.evaluateIdx, tot = 0, cnt = 0, per = 0;
    if (bd.length === 5) {   // 리버: 남은 카드 없음, 지금 승부
      var h5 = _score(evalIdx(all)), vb5 = [0, 0].concat(bd);
      for (i = 0; i < combos.length; i++) {
        vb5[0] = combos[i][0]; vb5[1] = combos[i][1];
        var v5 = _score(evalIdx(vb5));
        tot += h5 > v5 ? 1 : h5 === v5 ? 0.5 : 0; cnt++;
      }
      return { eq: tot / cnt, n: cnt, combos: combos.length, cards: 0 };
    }
    var deck = [];
    for (i = 0; i < 52; i++) if (!dead[i]) deck.push(i);
    var hb = all.concat([0]), vb = [0, 0].concat(bd, [0]), last = vb.length - 1, hs = new Array(deck.length);
    for (j = 0; j < deck.length; j++) { hb[hb.length - 1] = deck[j]; hs[j] = _score(evalIdx(hb)); }
    for (i = 0; i < combos.length; i++) {
      var c0 = combos[i][0], c1 = combos[i][1], m = 0;
      vb[0] = c0; vb[1] = c1;
      for (j = 0; j < deck.length; j++) {
        var x = deck[j];
        if (x === c0 || x === c1) continue;
        vb[last] = x;
        var v = _score(evalIdx(vb)), h = hs[j];
        tot += h > v ? 1 : h === v ? 0.5 : 0; cnt++; m++;
      }
      per = m;
    }
    return cnt ? { eq: tot / cnt, n: cnt, combos: combos.length, cards: per } : null;
  }
  function nextCard(heroCards, range, board) {
    var r = _nextInfo(heroCards, range, board);
    return r ? r.eq : null;
  }
  // liveCombos(range, deadCards) → 콤보 4글자 목록(높은 카드 먼저 아님, 정수 순서). 레인지 해석은 nextCard와 같다(null = 랜덤).
  // Coach의 레인지 축소가 이 목록을 걸러 nextCard에 다시 넘긴다.
  var _CR = '23456789TJQKA', _CS = 'shdc';
  function _intStr(i) { return _CR.charAt(i >> 2) + _CS.charAt(i & 3); }
  function liveCombos(range, deadCards) {
    var dead = new Uint8Array(52);
    (deadCards || []).forEach(function(c) { var i = _cardInt(c); if (i >= 0 && i < 52) dead[i] = 1; });
    return _liveCombos(range, dead).map(function(p) { return _intStr(p[0]) + _intStr(p[1]); });
  }

  api.calc = calc;
  api.nextCard = nextCard;
  api.liveCombos = liveCombos;
  api._nextInfo = _nextInfo;
  api._mc = _monteCarlo;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
