// engine/equity-multi.js (폴리시 TABLE-03a), 다자 승률 계산기: 카드가 전부 공개된 상황(전원 올인 런아웃, 쇼다운, 극장 관전)의 좌석별 승률.
// 극장 은행 THEATER_FILES에 넣지 말 것, 해시 밖. 기존 engine/equity.js(레인지 vs 히어로 MC)와 별개이며 그 파일을 바꾸지 않는다.
// multiway(hands, board, opts) → { eq: [0..1 좌석별], exact: bool, n: 평가한 런아웃 수 }
//   hands = [[card, card], ...] 카드 객체({rank, suit}, Equity.calc와 같은 형식, idx 없어도 됨), board = 카드 객체 0~5장
//   보드 3~5장: 남은 카드 전부 열거(정확, 무승부는 n분의 1씩), 5장은 즉시 판정 1회
//   보드 0장(프리플랍): 몬테카를로 opts.iters(기본 300)회, opts.rnd로 난수 주입 가능(테스트 재현)
// 규약: 로드 시 DOM 접근 없음, var IIFE + module.exports(node 러너), HandEval만 의존(evaluateIdx 정수 카드 r*4+s)
var EquityMulti = (function() {
  var RANKS = '23456789TJQKA', SUITS = 'shdc';
  function _idx(c) {
    if (c == null) return -1;
    if (typeof c.idx === 'number') return c.idx;
    var r = RANKS.indexOf(c.rank), s = SUITS.indexOf(c.suit);
    return (r < 0 || s < 0) ? -1 : r * 4 + s;
  }
  function _score(bufs, n, eq, evalIdx, cmp) {
    var best = null, winners = [];
    for (var k = 0; k < n; k++) {
      var s = evalIdx(bufs[k]);
      if (best === null) { best = s; winners = [k]; continue; }
      var c = cmp(s, best);
      if (c < 0) { best = s; winners = [k]; } else if (c === 0) winners.push(k);
    }
    for (var w = 0; w < winners.length; w++) eq[winners[w]] += 1 / winners.length;
  }
  function multiway(hands, board, opts) {
    opts = opts || {};
    var n = (hands || []).length;
    var empty = { eq: [], exact: true, n: 0 };
    if (!n || typeof HandEval === 'undefined' || !HandEval.evaluateIdx) return empty;
    var evalIdx = HandEval.evaluateIdx, cmp = HandEval.compareHands;
    var H = [], dead = new Uint8Array(52), i, j, k;
    for (i = 0; i < n; i++) {
      var h = hands[i];
      if (!h || h.length !== 2) return empty;
      var a = _idx(h[0]), b = _idx(h[1]);
      if (a < 0 || b < 0) return empty;
      H.push([a, b]); dead[a] = 1; dead[b] = 1;
    }
    var B = [];
    for (i = 0; i < (board || []).length; i++) { var bi = _idx(board[i]); if (bi < 0) return empty; B.push(bi); dead[bi] = 1; }
    var deck = []; for (i = 0; i < 52; i++) if (!dead[i]) deck.push(i);
    var eq = new Float64Array(n), total = 0;
    var need = 5 - B.length;
    if (B.length >= 3) {
      var bufs = H.map(function(h) { var o = h.concat(B); for (var q = 0; q < need; q++) o.push(0); return o; });
      var L = 2 + B.length;
      if (need === 0) { _score(bufs, n, eq, evalIdx, cmp); total = 1; }
      else if (need === 1) {
        for (i = 0; i < deck.length; i++) { for (k = 0; k < n; k++) bufs[k][L] = deck[i]; _score(bufs, n, eq, evalIdx, cmp); total++; }
      } else {
        for (i = 0; i < deck.length - 1; i++) for (j = i + 1; j < deck.length; j++) {
          for (k = 0; k < n; k++) { bufs[k][L] = deck[i]; bufs[k][L + 1] = deck[j]; }
          _score(bufs, n, eq, evalIdx, cmp); total++;
        }
      }
      return { eq: Array.prototype.map.call(eq, function(x) { return x / total; }), exact: true, n: total };
    }
    // 프리플랍(0장. 1~2장 보드는 엔진에 없으므로 보드를 고정하고 나머지를 MC로 채움)
    var iters = Math.max(1, (opts.iters | 0) || 300), rnd = (typeof opts.rnd === 'function') ? opts.rnd : Math.random;
    var A = deck.length, mbufs = H.map(function(h) { var o = h.concat(B); for (var q = 0; q < need; q++) o.push(0); return o; });
    var base = 2 + B.length;
    for (var it = 0; it < iters; it++) {
      for (k = 0; k < need; k++) { var jj = k + ((rnd() * (A - k)) | 0), t = deck[jj]; deck[jj] = deck[k]; deck[k] = t; }
      for (var p = 0; p < n; p++) for (k = 0; k < need; k++) mbufs[p][base + k] = deck[k];
      _score(mbufs, n, eq, evalIdx, cmp); total++;
    }
    return { eq: Array.prototype.map.call(eq, function(x) { return x / total; }), exact: false, n: total };
  }
  var api = { multiway: multiway };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
