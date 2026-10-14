// engine/hand-eval.js — 5카드 평가 + 7카드 최선 조합
// 모바일 성능(A-4a): 5장 조합 인덱스 사전계산 + 할당 없는 5장 평가.
// 공개 API·출력 형태 불변 — evaluate()는 {type, tiebreakers}, 5장 미만이면 null.
// evaluateIdx()는 정수 카드(r*4+s, Deck의 idx와 동일) 입력 고속 경로(equity 전용).
var HandEval = (function() {
  var HAND_RANK = {
    ROYAL_FLUSH: 1, STRAIGHT_FLUSH: 2, FOUR_OF_A_KIND: 3, FULL_HOUSE: 4,
    FLUSH: 5, STRAIGHT: 6, THREE_OF_A_KIND: 7, TWO_PAIR: 8, ONE_PAIR: 9, HIGH_CARD: 10
  };

  var RANK_VAL = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
  var SUIT_ID = { s: 0, h: 1, d: 2, c: 3 };
  var _extraSuits = {}, _nextSuit = 4; // 표준 밖 무늬 문자열도 '같은 무늬' 비교만 되면 충분

  // 족보별 tiebreakers 길이 (기존 _eval5 결과와 동일)
  var TB_LEN = [0, 1, 1, 2, 2, 5, 1, 3, 3, 4, 5];

  // 점수 정수 = (10 - type) * 2^20 + tiebreakers 5니블(첫 값이 최상위, 빈 칸 0) → 클수록 강함.
  // 같은 족보는 tiebreakers 길이가 고정이라 기존 _compare(빈 칸=0 사전순)와 순서가 정확히 일치.
  var TYPE_SHIFT = 1048576;

  // 스크래치 버퍼 (동기 호출 전용, 재진입 없음)
  var R = new Int32Array(7), S = new Int32Array(7);
  var V = new Int32Array(5), RV = new Int32Array(5), RC = new Int32Array(5);

  // n장 → 5장 조합 인덱스(평탄화) 사전계산. 5·6·7장은 로드 시, 그 밖은 첫 사용 시 캐시.
  var COMBOS = {};
  function _combos(n) {
    var c = COMBOS[n];
    if (c) return c;
    var out = [];
    for (var a = 0; a < n; a++)
      for (var b = a + 1; b < n; b++)
        for (var d = b + 1; d < n; d++)
          for (var e = d + 1; e < n; e++)
            for (var f = e + 1; f < n; f++) out.push(a, b, d, e, f);
    c = COMBOS[n] = new Int8Array(out);
    return c;
  }
  _combos(5); _combos(6); _combos(7);

  function _ensure(n) {
    if (R.length < n) { R = new Int32Array(n); S = new Int32Array(n); }
  }

  function _suitId(s) {
    var id = SUIT_ID[s];
    if (id !== undefined) return id;
    if (!Object.prototype.hasOwnProperty.call(_extraSuits, s)) _extraSuits[s] = _nextSuit++;
    return _extraSuits[s];
  }

  function evaluate(cards7) {
    var n = cards7 ? cards7.length : 0;
    if (n < 5) return null;
    _ensure(n);
    for (var i = 0; i < n; i++) {
      R[i] = RANK_VAL[cards7[i].rank];
      S[i] = _suitId(cards7[i].suit);
    }
    return _decode(_best(n));
  }

  function evaluateIdx(ints) {
    var n = ints ? ints.length : 0;
    if (n < 5) return null;
    _ensure(n);
    for (var i = 0; i < n; i++) {
      R[i] = (ints[i] >> 2) + 2;
      S[i] = ints[i] & 3;
    }
    return _decode(_best(n));
  }

  function _best(n) {
    var cb = _combos(n), best = -1;
    for (var k = 0; k < cb.length; k += 5) {
      var s = _eval5At(cb[k], cb[k + 1], cb[k + 2], cb[k + 3], cb[k + 4]);
      if (s > best) best = s;
    }
    return best;
  }

  // 5장(R/S의 인덱스 a..e) 점수 정수 — 할당 없음
  function _eval5At(a, b, c, d, e) {
    // 랭크 내림차순 삽입정렬
    V[0] = R[a]; V[1] = R[b]; V[2] = R[c]; V[3] = R[d]; V[4] = R[e];
    for (var i = 1; i < 5; i++) {
      var x = V[i], j = i - 1;
      while (j >= 0 && V[j] < x) { V[j + 1] = V[j]; j--; }
      V[j + 1] = x;
    }
    var x0 = V[0], x1 = V[1], x2 = V[2], x3 = V[3], x4 = V[4];
    var sa = S[a];
    var isFlush = S[b] === sa && S[c] === sa && S[d] === sa && S[e] === sa;
    var top = 0; // 스트레이트 최고값 (휠은 5), 아니면 0
    if (x0 - x1 === 1 && x1 - x2 === 1 && x2 - x3 === 1 && x3 - x4 === 1) top = x0;
    else if (x0 === 14 && x1 === 5 && x2 === 4 && x3 === 3 && x4 === 2) top = 5;

    if (isFlush && top) return (10 - (top === 14 ? HAND_RANK.ROYAL_FLUSH : HAND_RANK.STRAIGHT_FLUSH)) * TYPE_SHIFT + (top << 16);

    // 같은 랭크 묶음(정렬돼 있어 연속 구간) → 값 내림차순 run
    var g = 0;
    RV[0] = x0; RC[0] = 1;
    for (var k = 1; k < 5; k++) {
      if (V[k] === V[k - 1]) RC[g]++;
      else { g++; RV[g] = V[k]; RC[g] = 1; }
    }
    g++;
    var maxCount = 0, pairs = 0;
    for (var r = 0; r < g; r++) {
      if (RC[r] > maxCount) maxCount = RC[r];
      if (RC[r] === 2) pairs++;
    }

    var type;
    if (maxCount === 4) type = HAND_RANK.FOUR_OF_A_KIND;
    else if (maxCount === 3 && pairs > 0) type = HAND_RANK.FULL_HOUSE;
    else if (isFlush) return (10 - HAND_RANK.FLUSH) * TYPE_SHIFT + ((x0 << 16) | (x1 << 12) | (x2 << 8) | (x3 << 4) | x4);
    else if (top) return (10 - HAND_RANK.STRAIGHT) * TYPE_SHIFT + (top << 16);
    else if (maxCount === 3) type = HAND_RANK.THREE_OF_A_KIND;
    else if (pairs === 2) type = HAND_RANK.TWO_PAIR;
    else if (maxCount === 2) type = HAND_RANK.ONE_PAIR;
    else return (10 - HAND_RANK.HIGH_CARD) * TYPE_SHIFT + ((x0 << 16) | (x1 << 12) | (x2 << 8) | (x3 << 4) | x4);

    // 그룹 정렬: 개수 내림차순 → 값 내림차순 (기존 _groupSort와 동일)
    var packed = 0, shift = 16;
    for (var cnt = 4; cnt >= 1; cnt--) {
      for (var q = 0; q < g; q++) {
        if (RC[q] === cnt) { packed |= RV[q] << shift; shift -= 4; }
      }
    }
    return (10 - type) * TYPE_SHIFT + packed;
  }

  function _decode(score) {
    var type = 10 - (score >> 20); // TYPE_SHIFT = 2^20
    var len = TB_LEN[type], tiebreakers = [];
    for (var i = 0; i < len; i++) tiebreakers.push((score >> (16 - 4 * i)) & 15);
    return { type: type, tiebreakers: tiebreakers };
  }

  function _compare(a, b) {
    if (a.type !== b.type) return a.type - b.type;
    var la = a.tiebreakers.length, lb = b.tiebreakers.length, len = la > lb ? la : lb;
    for (var i = 0; i < len; i++) {
      var diff = (b.tiebreakers[i] || 0) - (a.tiebreakers[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  function compareHands(scoreA, scoreB) { return _compare(scoreA, scoreB); }

  function describe(score) {
    var names = {
      1:'로열 플러시', 2:'스트레이트 플러시', 3:'포카드', 4:'풀하우스',
      5:'플러시', 6:'스트레이트', 7:'트리플', 8:'투페어', 9:'원페어', 10:'하이카드'
    };
    return names[score.type] || '알수없음';
  }

  if (typeof module !== 'undefined') module.exports = { evaluate, evaluateIdx, compareHands, describe };
  return { evaluate, evaluateIdx, compareHands, describe };
})();
