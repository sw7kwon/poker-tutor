// engine/deck.js
var Deck = (function() {
  var RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  var SUITS = ['s','h','d','c'];

  function create() {
    var deck = [];
    for (var r = 0; r < RANKS.length; r++) {
      for (var s = 0; s < SUITS.length; s++) {
        deck.push({ rank: RANKS[r], suit: SUITS[s], idx: r * 4 + s });
      }
    }
    return deck;
  }

  function shuffle(deck, seed) {
    var arr = deck.slice();
    var rng = _seededRng(seed != null ? seed : Date.now());
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function deal(deck, n, dead) {
    dead = dead || [];
    var deadSet = {};
    dead.forEach(function(c) { deadSet[cardKey(c)] = true; });
    var result = [], remaining = [];
    for (var i = 0; i < deck.length; i++) {
      if (result.length < n && !deadSet[cardKey(deck[i])]) {
        result.push(deck[i]);
      } else {
        remaining.push(deck[i]);
      }
    }
    return { cards: result, remaining: remaining };
  }

  function cardKey(c) { return c.rank + c.suit; }

  function fromString(str) {
    var rank = str[0] === 'T' ? 'T' : str[0];
    var suit = str[1];
    var ri = RANKS.indexOf(rank);
    var si = SUITS.indexOf(suit);
    return { rank: rank, suit: suit, idx: ri * 4 + si };
  }

  function toString(card) { return card.rank + card.suit; }

  function _seededRng(seed) {
    var s = seed >>> 0;
    return function() {
      s = (s ^ (s << 13)) >>> 0;
      s = (s ^ (s >> 17)) >>> 0;
      s = (s ^ (s << 5)) >>> 0;
      return s / 4294967296;
    };
  }

  if (typeof module !== 'undefined') module.exports = { create, shuffle, deal, fromString, toString, RANKS, SUITS };
  return { create, shuffle, deal, fromString, toString, RANKS, SUITS };
})();
