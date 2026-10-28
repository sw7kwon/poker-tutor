// engine/range-stats.js (n4 G3 SEAT+GRAPH, 설계 docs/NEXT4_DESIGN.md 4.3절, 결정 64)
// 좌석 시트 포스트플랍 블록의 수학(순수, 엔진 호출만, 로드 때 DOM 없음).
//   strength(rangeLabels, board, dead) → { n, counts: { nut, strong, medium, weakPair, draw, air }, pct, label, random } | null
//     Equity.liveCombos(rangeLabels, 데드카드 = 보드 + 내 카드 2장)로 살아 있는 콤보를 만들고 콤보마다 Villain._handStrength(hole, board)
//     (nut, strong, medium, weak-pair, air)로 나눈다. air 가운데 PostflopGuide.hasDraw가 참이면 draw로 옮긴다(합 = n). 상대 실제 카드는 절대 읽지 않는다:
//     입력은 범위 라벨(이 앱 차트 칸)과 공개 카드뿐이다. rangeLabels가 null이면 랜덤 손(1326콤보, 라벨 참고).
//     pct는 같은 키 0~100 정수(합 100, 최대 나머지법). (범위, 보드, 데드) 문자열 키 캐시 32개.
//     해시 파일의 비공개 이름(Villain._handStrength, PostflopGuide.hasDraw)에 기대므로 없으면 null(화면은 "분포를 계산할 수 없어요").
//   classify(hole, board) → 같은 6키 중 하나 | null(완전 분석 실제 손 ▼ 표시용, 그 사람 카드는 완전 분석 경로에서만 넘긴다)
//   odds(state, name, ctx) → { toCall, pot, need, bet, potBefore, mdf, breakEven } | null(P0 완성본): 그 좌석이 마주한 콜 c = currentBet - playerBets[name],
//     팟 P = state.pot(상대 벳 포함), 필요 승률 need = c / (P + c)(엔진 계산). 이번 스트리트 첫 벳(앞선 벳 수준 0)일 때만 bet = currentBet,
//     potBefore = P - bet로 MDF = potBefore / (potBefore + bet), 벳한 쪽 손익분기 폴드율 breakEven = bet / (potBefore + bet)(둘 다 균형 가정, 참고).
//     레이즈를 마주했거나 프리플랍이면 mdf와 breakEven은 null(ctx.bet, ctx.potBefore를 넘기면 그 값으로 센다). 벳을 마주하지 않으면 null.
//     (G3) 벳한 사람 말고 남은 사람이 그 좌석 말고도 있으면(멀티웨이, multi 참) mdf와 breakEven은 null: 벳한 쪽은 남은 사람이 모두 접어야 이기므로 1대1 식이 맞지 않는다.
//   mdf(potBefore, bet), breakEven(potBefore, bet): 식만. 예 mdf(20, 10) = 0.667, breakEven(20, 10) = 0.333.
//   KEYS(막대 순서), NAMES(화면 낱말), DESC(낱말 풀이), ENGINE_WORDS(엔진 낱말 → 키)
// 규약: 로드 때 DOM 접근 없음. 가운뎃점과 긴줄표 없음.
var RangeStats = (function() {
  var KEYS = ['nut', 'strong', 'medium', 'weakPair', 'draw', 'air'];
  var ENGINE_WORDS = { nut: 'nut', strong: 'strong', medium: 'medium', 'weak-pair': 'weakPair', air: 'air' };
  var NAMES = { nut: '넛급', strong: '강함', medium: '중간', weakPair: '약한 페어', draw: '드로우', air: '빈손' };
  var DESC = { nut: '풀하우스 이상', strong: '스트레이트, 플러시, 셋', medium: '탑페어, 오버페어, 투페어, 트립스', weakPair: '탑페어보다 낮은 페어',
    draw: '플러시 드로우, 연속 4장 스트레이트 드로우', air: '페어도 드로우도 없음' };
  var LABEL = '엔진 계산(이 앱 차트 범위 기준)';
  var LABEL_RANDOM = '참고(랜덤 손 기준)';

  function _num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function mdf(potBefore, bet) {
    potBefore = _num(potBefore); bet = _num(bet);
    if (potBefore == null || bet == null || bet <= 0 || potBefore < 0) return null;
    return potBefore / (potBefore + bet);
  }
  function breakEven(potBefore, bet) {
    potBefore = _num(potBefore); bet = _num(bet);
    if (potBefore == null || bet == null || bet <= 0 || potBefore < 0) return null;
    return bet / (potBefore + bet);
  }
  function odds(state, name, ctx) {
    if (!state || !name) return null;
    ctx = ctx || {};
    var cb = Number(state.currentBet) || 0, have = Number((state.playerBets || {})[name]) || 0;
    var stack = (state.stacks && typeof state.stacks[name] === 'number') ? state.stacks[name] : Infinity;
    var c = Math.min(cb - have, stack);
    if (!(c > 0.001)) return null;
    var P = Number(state.pot) || 0;
    var bet = _num(ctx.bet), potBefore = _num(ctx.potBefore);
    // (n4 G3) 벳한 사람 말고 남은 사람(폴드 안 함)이 둘 이상이면(멀티웨이) MDF와 손익분기는 보이지 않는다. 두 식은 1대1 식이다:
    //   벳한 쪽은 남은 사람이 모두 접어야 이기고, 지키는 쪽도 혼자 MDF만큼 지킬 필요가 없다(이미 콜한 사람, 뒤에 남은 사람, 올인한 사람 모두 센다)
    var multi = false;
    if (state.lastRaiser) {
      var seen = {}, others = 0;
      [state.players, state.playerBets].forEach(function(o) { if (o) Object.keys(o).forEach(function(n) { seen[n] = 1; }); });
      Object.keys(seen).forEach(function(n) {
        if (n === name || n === state.lastRaiser || (state.folded && state.folded[n])) return;
        others++;
      });
      multi = others > 0;
    }
    if (bet == null && !multi) {
      var prior = cb - (Number(state.lastRaiseSize) || 0);
      var pureBet = !!state.lastRaiser && state.street && state.street !== 'preflop' && prior <= 0.001;
      if (pureBet) bet = cb;
    }
    if (bet != null && potBefore == null) potBefore = P - bet;
    return { toCall: c, pot: P, need: c / (P + c), bet: bet, potBefore: potBefore, multi: multi,
      mdf: bet != null ? mdf(potBefore, bet) : null, breakEven: bet != null ? breakEven(potBefore, bet) : null };
  }

  // ── 범위 강도 분포 ──
  function _ok() {
    return typeof Equity !== 'undefined' && Equity && typeof Equity.liveCombos === 'function' &&
      typeof Villain !== 'undefined' && Villain && typeof Villain._handStrength === 'function' &&
      typeof PostflopGuide !== 'undefined' && PostflopGuide && typeof PostflopGuide.hasDraw === 'function';
  }
  function _card(c) {
    if (!c) return null;
    if (typeof c === 'string') return c.length >= 2 ? { rank: c.charAt(0), suit: c.charAt(1) } : null;
    return (c.rank && c.suit) ? { rank: c.rank, suit: c.suit } : null;
  }
  function _cards(arr) { var out = []; (arr || []).forEach(function(c) { var x = _card(c); if (x) out.push(x); }); return out; }
  function _cstr(cs) { return cs.map(function(c) { return c.rank + c.suit; }).join(''); }
  // 한 손 분류(공개 카드 기준): 엔진 낱말 → 화면 키, air 중 드로는 draw
  function classify(hole, board) {
    if (!_ok()) return null;
    var h = _cards(hole), b = _cards(board);
    if (h.length < 2 || b.length < 3) return null;
    var w = ENGINE_WORDS[Villain._handStrength(h, b)];
    if (!w) return null;
    if (w === 'air' && PostflopGuide.hasDraw(h, b)) return 'draw';
    return w;
  }
  // 최대 나머지법: 합이 정확히 100인 정수 퍼센트
  function _pct(counts, n) {
    var out = {}, rest = [], sum = 0;
    KEYS.forEach(function(k) {
      var raw = n ? counts[k] * 100 / n : 0, f = Math.floor(raw);
      out[k] = f; sum += f; rest.push({ k: k, r: raw - f });
    });
    if (n) {
      rest.sort(function(a, b) { return b.r - a.r || KEYS.indexOf(a.k) - KEYS.indexOf(b.k); });
      for (var i = 0; sum < 100 && i < rest.length; i++) { out[rest[i].k]++; sum++; }
    }
    return out;
  }
  var _cache = {}, _cacheN = 0;
  function strength(rangeLabels, board, dead) {
    if (!_ok()) return null;
    var b = _cards(board);
    if (b.length < 3 || b.length > 5) return null;
    var random = !(Array.isArray(rangeLabels) && rangeLabels.length);
    var labels = random ? null : rangeLabels.filter(function(x) { return typeof x === 'string'; }).slice().sort();
    var d = b.concat(_cards(dead));
    var key = (random ? '*' : labels.join(',')) + '|' + _cstr(b) + '|' + _cstr(_cards(dead));
    if (Object.prototype.hasOwnProperty.call(_cache, key)) return _cache[key];
    var combos = Equity.liveCombos(labels, d) || [];
    var counts = { nut: 0, strong: 0, medium: 0, weakPair: 0, draw: 0, air: 0 };
    for (var i = 0; i < combos.length; i++) {
      var s = combos[i], h = [{ rank: s.charAt(0), suit: s.charAt(1) }, { rank: s.charAt(2), suit: s.charAt(3) }];
      var w = ENGINE_WORDS[Villain._handStrength(h, b)] || 'air';
      if (w === 'air' && PostflopGuide.hasDraw(h, b)) w = 'draw';
      counts[w]++;
    }
    var n = combos.length;
    var out = { n: n, counts: counts, pct: _pct(counts, n), label: random ? LABEL_RANDOM : LABEL, random: random, street: b.length === 3 ? 'flop' : b.length === 4 ? 'turn' : 'river' };
    if (++_cacheN > 32) { _cache = {}; _cacheN = 1; }
    _cache[key] = out;
    return out;
  }

  return { STUB: false, KEYS: KEYS.slice(), NAMES: NAMES, DESC: DESC, ENGINE_WORDS: ENGINE_WORDS, LABEL: LABEL, LABEL_RANDOM: LABEL_RANDOM,
    strength: strength, classify: classify, odds: odds, mdf: mdf, breakEven: breakEven,
    _clear: function() { _cache = {}; _cacheN = 0; } };
})();
