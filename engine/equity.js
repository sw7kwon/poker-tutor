// engine/equity.js — 프리플랍 룩업 + 포스트플랍 인라인 MC (file:// Worker 차단 우회)
// 모바일 성능(A-4a): 정수 카드(r*4+s) + 부분 Fisher–Yates, 반복마다 덱 생성/셔플/filter 제거,
// 핸드 클래스 룩업 상수화. calc(state, cb)는 기존처럼 cb를 동기로 호출한다.
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

  function calc(state, cb) {
    if (!state || !state.heroCards || state.heroCards.length < 2) {
      cb(0.5); return;
    }
    var board = state.board || [];
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

  api.calc = calc;
  api._mc = _monteCarlo;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
