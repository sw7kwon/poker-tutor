// engine/range.js
var Range = (function() {
  var RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  var RANK_IDX = {};
  RANKS.forEach(function(r,i){ RANK_IDX[r] = i; });

  function handClass(c1, c2) {
    var r1 = RANK_IDX[c1.rank], r2 = RANK_IDX[c2.rank];
    if (r1 < r2) { var tmp = c1; c1 = c2; c2 = tmp; var t=r1; r1=r2; r2=t; }
    var suited = c1.suit === c2.suit ? 's' : 'o';
    if (r1 === r2) return c1.rank + c2.rank;
    return c1.rank + c2.rank + suited;
  }

  function inRange(c1, c2, rangeStr) {
    var cls = handClass(c1, c2);
    var combos = parse(rangeStr);
    return combos.has(cls);
  }

  function parse(rangeStr) {
    var result = new Set();
    var parts = rangeStr.split(',').map(function(s){return s.trim();});
    parts.forEach(function(part) {
      _expandPart(part).forEach(function(h){ result.add(h); });
    });
    return result;
  }

  function _expandPart(part) {
    if (!part) return [];
    var plus = part.endsWith('+');
    var p = plus ? part.slice(0,-1) : part;

    if (/^[AKQJT2-9]{2}$/.test(p) && p[0]===p[1]) {
      var idx = RANK_IDX[p[0]];
      if (plus) {
        return RANKS.slice(idx).map(function(r){ return r+r; });
      }
      return [p[0]+p[1]];
    }

    var dashMatch = p.match(/^([AKQJT2-9])([AKQJT2-9])-([AKQJT2-9])([AKQJT2-9])$/);
    if (dashMatch) {
      var lo = Math.min(RANK_IDX[dashMatch[1]], RANK_IDX[dashMatch[3]]);
      var hi = Math.max(RANK_IDX[dashMatch[1]], RANK_IDX[dashMatch[3]]);
      var result = [];
      for (var i = lo; i <= hi; i++) result.push(RANKS[i]+RANKS[i]);
      return result;
    }

    // 수딧/오프수트 킥커 범위: "AJs-A9s", "KQo-KTo" (첫 랭크 동일)
    var dashSuited = p.match(/^([AKQJT2-9])([AKQJT2-9])([so])-([AKQJT2-9])([AKQJT2-9])([so])$/);
    if (dashSuited && dashSuited[1] === dashSuited[4] && dashSuited[3] === dashSuited[6]) {
      var hiK = RANK_IDX[dashSuited[2]], loK = RANK_IDX[dashSuited[5]];
      var from = Math.min(hiK, loK), to = Math.max(hiK, loK);
      var out = [];
      for (var k = from; k <= to; k++) out.push(dashSuited[1] + RANKS[k] + dashSuited[3]);
      return out;
    }

    var suited = p.endsWith('s') ? 's' : p.endsWith('o') ? 'o' : null;
    if (suited) {
      var base = p.slice(0,-1);
      var r1 = base[0], r2 = base[1];
      var i1 = RANK_IDX[r1], i2 = RANK_IDX[r2];
      if (plus) {
        var res = [];
        for (var j = i2; j < i1; j++) res.push(r1 + RANKS[j] + suited);
        return res;
      }
      return [r1 + r2 + suited];
    }

    if (p.length === 2 && p[0] !== p[1]) {
      var r1 = p[0], r2 = p[1];
      var i1 = RANK_IDX[r1], i2 = RANK_IDX[r2];
      if (plus) {
        var res = [];
        for (var j = i2; j < i1; j++) {
          res.push(r1+RANKS[j]+'s');
          res.push(r1+RANKS[j]+'o');
        }
        return res;
      }
      return [r1+r2+'s', r1+r2+'o'];
    }

    return [];
  }

  if (typeof module !== 'undefined') module.exports = { parse, inRange, handClass };
  return { parse, inRange, handClass };
})();
