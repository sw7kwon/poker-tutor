// lessons/calc/stage4b.js (채우는 그룹: M5-S4B)
// 레슨 calc 등록부(계약 L9, lessons/lesson-core.js 머리 주석)에 LessonCore.defineCalc로 등록하는 유형 4개(로드맵 M5 계약 F7).
// 입력에 pot 필드는 쓰지 않는다(potBefore = 벳 전 팟, potTotal = 상대 벳 포함 팟). 퍼센트 변수는 정수 반올림.
// 모든 유형의 verify는 calc 코드를 부르지 않는 독립 경로다(tests/j-lessons.test.js가 장면마다 calc와 verify의 공통 변수를 대조).
//
//   alpha {potBefore, bet}: 블러프(또는 블러프 레이즈) 한 번이 본전이 되는 상대의 최소 폴드율(설계서 부록 D, gen-math alpha와 같은 식).
//     potBefore = 내 칩이 들어가기 전 팟(레이즈면 상대 벳 포함), bet = 내가 새로 넣는 칩(리스크).
//     → pct = round(bet x 100 / (potBefore + bet)), potBefore, bet. main 'pct'.
//     verify: 1 - potBefore / (potBefore + bet)를 정수 분수로 반올림(다른 공식 형태).
//   bluffratio {potBefore, bet}: 상대 콜이 딱 본전이 되는 내 벳 레인지의 블러프 몫(밸류는 콜에 이기고 블러프는 진다고 가정).
//     → pct = round(bet x 100 / (potBefore + 2 x bet)), value = 100 - pct, potBefore, bet,
//       oppPot = potBefore + bet(상대가 보는 팟, 내 벳 포함), oppCall = bet. main 'pct'.
//     verify: 상대 팟 오즈 Y / (X + Y) 경로(X = oppPot, Y = oppCall, gen-math bluffratio check와 같은 독립 경로).
//   eqRange {hero[2], board[4|5], range:'Range.parse 문자열' | combos:[[c1, c2] | 'c1c2', ...], potTotal?, toCall?}
//     주어진 상대 레인지 기준 내 에쿼티(설계서 3.2절 출제 제외 1(a), facingbet-river와 같은 뜻). 무승부는 반.
//     range는 Range.parse 문자열(예 'QQ+,AKs,AKo')이고 내 손과 보드에 걸리는 콤보는 빠진다(블로커). 읽을 수 없는 조각은 오류.
//     combos는 명시 콤보 목록이고 내 손이나 보드와 겹치는 콤보, 같은 콤보 두 번은 오류(화면에 보이는 목록 = 계산한 목록).
//     리버(보드 5장): 콤보마다 쇼다운 1번. 턴(보드 4장): 콤보마다 남은 리버 44장(내 손, 보드, 그 콤보 카드 제외)을 전부 연다.
//     → eq = round((win + tie / 2) x 100 / runs), win, tie, lose(리버면 콤보 수, 턴이면 콤보 x 리버 수), runs(셈한 쇼다운 수),
//       n(살아 있는 콤보 수). potTotal과 toCall이 있으면 need = round(toCall x 100 / (potTotal + toCall)),
//       act = eq > need면 'call', 작으면 'fold', 같으면 'even'(정수 % 비교, SceneRender ring 판정과 같은 규칙). main 'eq'.
//     verify: 52장에서 두 장 쌍 1326개를 전부 돌며 Range.handClass가 레인지에 드는 쌍(또는 명시 콤보)을 고르고,
//       HandEval.evaluate(카드 객체) 경로로 비교, 정수 분수 반올림(calc는 정수 카드 evaluateIdx 경로와 클래스 펼치기).
//   blockers {range, hero[2], board?[0~5]}: 내 손이 지우는 상대 콤보(설계서 부록 D 블로커).
//     → total(보드 카드를 뺀 레인지 콤보 수), left(내 손 카드까지 뺀 수), removed = total - left. main 'removed'.
//     verify: 1326 쌍 전수 + Range.handClass(calc는 클래스를 콤보로 펼친다).
// 질문 문장 대조(L9 qNums, qCards): alpha와 bluffratio는 [potBefore, bet], eqRange는 [potTotal, toCall](있으면)과
//   카드 = 내 손 + 보드 + 명시 콤보 카드(range 문자열이면 내 손 + 보드), blockers는 카드 = 내 손 + 보드.
// 로드 때 LessonCore가 있으면 등록만 한다(DOM, window, localStorage 접근 없음). Range, HandEval은 호출 때 typeof 가드.
(function() {
  var RANKS = '23456789TJQKA', SUITS = 'shdc';

  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _fin(x) { return typeof x === 'number' && isFinite(x); }
  function _bb(x) { var v = Math.round(Number(x) * 100) / 100; return v === 0 ? 0 : v; }
  function _cardStr(x) {
    var s = String(x == null ? '' : x).trim();
    if (s.length === 3 && s.slice(0, 2) === '10') s = 'T' + s.charAt(2);
    if (s.length !== 2) return null;
    var r = s.charAt(0).toUpperCase(), u = s.charAt(1).toLowerCase();
    return (RANKS.indexOf(r) >= 0 && SUITS.indexOf(u) >= 0) ? r + u : null;
  }
  // 콤보 하나: ['Ks','Qs'] 또는 'KsQs' → ['Ks','Qs'] | null
  function _comboStrs(x) {
    var a = Array.isArray(x) ? x : (typeof x === 'string' && x.trim().length === 4 ? [x.trim().slice(0, 2), x.trim().slice(2)] : null);
    if (!a || a.length !== 2) return null;
    var p = _cardStr(a[0]), q = _cardStr(a[1]);
    return (p && q && p !== q) ? [p, q] : null;
  }
  function _haveRange() { return typeof Range !== 'undefined' && Range && typeof Range.parse === 'function' && typeof Range.handClass === 'function'; }
  function _haveHE() { return typeof HandEval !== 'undefined' && HandEval && typeof HandEval.compareHands === 'function'; }
  // 레인지 문자열 → 손 클래스 배열 | {error}. 쉼표 조각마다 Range.parse가 하나 이상 읽어야 한다(모르는 조각은 오류)
  function _rangeClasses(str) {
    if (typeof str !== 'string' || !str.trim()) return { error: 'range는 레인지 문자열이에요(예 QQ+,AKs)' };
    var out = [], seen = {};
    var parts = str.split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      var set = p ? Range.parse(p) : null;
      if (!set || !set.size) return { error: '레인지 조각을 읽을 수 없어요: ' + (p || '(빈 조각)') };
      set.forEach(function(h) { if (!seen[h]) { seen[h] = 1; out.push(h); } });
    }
    return out;
  }
  // 카드 묶음 검사: {hero, board, dead(map)} | {error}
  function _heroBoard(c, boardMin, boardMax, boardName) {
    var hero = Array.isArray(c.hero) ? c.hero.map(_cardStr) : null;
    if (!hero || hero.length !== 2 || hero.indexOf(null) >= 0) return { error: 'hero는 카드 2장이에요' };
    var raw = c.board == null ? [] : c.board;
    var board = Array.isArray(raw) ? raw.map(_cardStr) : null;
    if (!board || board.indexOf(null) >= 0 || board.length < boardMin || board.length > boardMax) return { error: boardName };
    var dead = {}, all = hero.concat(board);
    for (var i = 0; i < all.length; i++) {
      if (dead[all[i]]) return { error: '같은 카드가 두 번 나와요: ' + all[i] };
      dead[all[i]] = 1;
    }
    return { hero: hero, board: board, dead: dead };
  }

  // ── alpha ──────────────────────────────────────────────
  function _sizeIn(c, name) {
    if (!_fin(c.potBefore) || !_fin(c.bet)) return { error: name + '에는 potBefore와 bet 숫자가 필요해요' };
    if (!(c.potBefore > 0) || !(c.bet > 0)) return { error: name + ' potBefore와 bet은 0보다 커야 해요' };
    return null;
  }
  // 정수 분수 반올림(0.5는 올림): num / den x 100, 입력은 소수 둘째 자리까지
  function _roundFrac(num, den) {
    var n = Math.round(num * 100), d = Math.round(den * 100);
    return Math.floor((200 * n + d) / (2 * d));
  }
  var alpha = {
    main: 'pct',
    calc: function alphaCalc(c) {
      var bad = _sizeIn(c, 'alpha');
      if (bad) return bad;
      return { pct: Math.round(c.bet * 100 / (c.potBefore + c.bet)), potBefore: _bb(c.potBefore), bet: _bb(c.bet) };
    },
    // 독립 경로: 폴드율 f에서 블러프 EV = f x 팟 - (1 - f) x 벳 = 0 → f = 1 - 팟 / (팟 + 벳)
    verify: function(c) {
      if (typeof c.potBefore !== 'number' || typeof c.bet !== 'number' || !isFinite(c.potBefore) || !isFinite(c.bet)) return { error: 'potBefore, bet 숫자' };
      if (c.potBefore <= 0 || c.bet <= 0) return { error: 'potBefore, bet > 0' };
      var whole = c.potBefore + c.bet;
      return { pct: _roundFrac(whole - c.potBefore, whole), potBefore: Math.round(c.potBefore * 100) / 100, bet: Math.round(c.bet * 100) / 100 };
    },
    cases: [
      { c: { potBefore: 10, bet: 10 }, want: { pct: 50, potBefore: 10, bet: 10 } },   // 팟만큼 블러프: 반은 접어야 본전
      { c: { potBefore: 20, bet: 10 }, want: { pct: 33 } },                           // 팟 절반: 10 / 30
      { c: { potBefore: 30, bet: 20 }, want: { pct: 40 } },                           // 상대 벳 10을 20으로 민레이즈(팟 30)
      { c: { potBefore: 30, bet: 40 }, want: { pct: 57 } }                            // 40 / 70 = 57.1
    ],
    qNums: function(c) { return [c.potBefore, c.bet]; }
  };

  // ── bluffratio ─────────────────────────────────────────
  var bluffratio = {
    main: 'pct',
    calc: function bluffRatioCalc(c) {
      var bad = _sizeIn(c, 'bluffratio');
      if (bad) return bad;
      var pct = Math.round(c.bet * 100 / (c.potBefore + 2 * c.bet));
      return { pct: pct, value: 100 - pct, potBefore: _bb(c.potBefore), bet: _bb(c.bet), oppPot: _bb(c.potBefore + c.bet), oppCall: _bb(c.bet) };
    },
    // 독립 경로: 상대가 받는 팟 오즈. 팟(내 벳 포함) X, 콜 Y → 콜 본전 승률 Y / (X + Y) = 블러프 몫
    verify: function(c) {
      if (typeof c.potBefore !== 'number' || typeof c.bet !== 'number' || !isFinite(c.potBefore) || !isFinite(c.bet)) return { error: 'potBefore, bet 숫자' };
      if (c.potBefore <= 0 || c.bet <= 0) return { error: 'potBefore, bet > 0' };
      var X = c.potBefore + c.bet, Y = c.bet;
      var pct = _roundFrac(Y, X + Y);
      return { pct: pct, value: 100 - pct, potBefore: Math.round(c.potBefore * 100) / 100, bet: Math.round(c.bet * 100) / 100,
        oppPot: Math.round(X * 100) / 100, oppCall: Math.round(Y * 100) / 100 };
    },
    cases: [
      { c: { potBefore: 10, bet: 10 }, want: { pct: 33, value: 67, oppPot: 20, oppCall: 10 } },   // 팟 벳: 블러프 1 : 밸류 2
      { c: { potBefore: 12, bet: 6 }, want: { pct: 25, value: 75 } },                            // 팟 절반: 6 / 24
      { c: { potBefore: 20, bet: 15 }, want: { pct: 30 } },                                      // 팟의 3/4: 15 / 50
      { c: { potBefore: 10, bet: 20 }, want: { pct: 40 } }                                       // 2배 오버벳: 20 / 50
    ],
    qNums: function(c) { return [c.potBefore, c.bet]; }
  };

  // ── eqRange ────────────────────────────────────────────
  function _price(c) {
    var hasP = c.potTotal != null, hasT = c.toCall != null;
    if (!hasP && !hasT) return null;
    if (!_fin(c.potTotal) || !_fin(c.toCall) || c.potTotal < 0 || !(c.toCall > 0)) return { error: 'eqRange potTotal과 toCall은 함께, potTotal 0 이상, toCall 0보다 커요' };
    return { potTotal: c.potTotal, toCall: c.toCall };
  }
  function _idx(s) { return RANKS.indexOf(s.charAt(0)) * 4 + SUITS.indexOf(s.charAt(1)); }
  // 클래스('AKs', 'QQ', 'T9o') → 콤보 [카드 문자열 2] 배열(죽은 카드 제외)
  function _expand(cls, dead) {
    var r1 = cls.charAt(0), r2 = cls.charAt(1), k = cls.charAt(2), out = [];
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      if (r1 === r2 ? j <= i : (k === 's' ? i !== j : i === j)) continue;
      var a = r1 + SUITS.charAt(i), b = r2 + SUITS.charAt(j);
      if (!dead[a] && !dead[b]) out.push([a, b]);
    }
    return out;
  }
  // 상대 콤보 목록 | {error}
  function _villCombos(c, dead) {
    var hasR = c.range != null, hasC = c.combos != null;
    if (hasR === hasC) return { error: 'range 또는 combos 하나만 써요' };
    var out = [];
    if (hasR) {
      if (!_haveRange()) return { error: 'Range가 없어요' };
      var cls = _rangeClasses(c.range);
      if (cls.error) return cls;
      cls.forEach(function(h) { out = out.concat(_expand(h, dead)); });
    } else {
      if (!Array.isArray(c.combos) || !c.combos.length) return { error: 'combos는 콤보 목록이에요' };
      var seen = {};
      for (var i = 0; i < c.combos.length; i++) {
        var cb = _comboStrs(c.combos[i]);
        if (!cb) return { error: '콤보를 읽을 수 없어요: ' + JSON.stringify(c.combos[i]) };
        if (dead[cb[0]] || dead[cb[1]]) return { error: '내 손이나 보드와 겹치는 콤보예요: ' + cb.join('') };
        var key = cb.slice().sort().join('');
        if (seen[key]) return { error: '같은 콤보가 두 번 나와요: ' + cb.join('') };
        seen[key] = 1;
        out.push(cb);
      }
    }
    if (!out.length) return { error: '살아 있는 상대 콤보가 없어요' };
    return out;
  }
  var eqRange = {
    main: 'eq',
    calc: function eqRangeCalc(c) {
      if (!_haveHE() || typeof HandEval.evaluateIdx !== 'function') return { error: 'HandEval이 없어요' };
      var hb = _heroBoard(c, 4, 5, 'eqRange board는 4장(턴) 또는 5장(리버)이에요');
      if (hb.error) return hb;
      var pr = _price(c);
      if (pr && pr.error) return pr;
      var vc = _villCombos(c, hb.dead);
      if (vc.error) return vc;
      var H = hb.hero.map(_idx), B = hb.board.map(_idx);
      var win = 0, tie = 0, lose = 0, runs = 0;
      var one = function(rest, v) {
        var full = B.concat(rest);
        var r = HandEval.compareHands(HandEval.evaluateIdx(H.concat(full)), HandEval.evaluateIdx(v.concat(full)));
        runs++;
        if (r < 0) win++; else if (r === 0) tie++; else lose++;
      };
      vc.forEach(function(cb) {
        var v = cb.map(_idx);
        if (B.length === 5) { one([], v); return; }
        for (var x = 0; x < 52; x++) {
          if (H.indexOf(x) >= 0 || B.indexOf(x) >= 0 || v.indexOf(x) >= 0) continue;
          one([x], v);
        }
      });
      var out = { eq: Math.round((2 * win + tie) * 50 / runs), win: win, tie: tie, lose: lose, runs: runs, n: vc.length };
      if (pr) {
        out.potTotal = _bb(pr.potTotal); out.toCall = _bb(pr.toCall);
        out.need = Math.round(pr.toCall * 100 / (pr.potTotal + pr.toCall));
        out.act = out.eq > out.need ? 'call' : (out.eq < out.need ? 'fold' : 'even');
      }
      return out;
    },
    // 독립 경로: 1326 쌍 전수에서 상대 손 고르기(Range.handClass), HandEval.evaluate(카드 객체), 정수 분수 반올림
    verify: function(c) {
      if (typeof HandEval === 'undefined' || !HandEval || typeof HandEval.evaluate !== 'function') return { error: 'HandEval 없음' };
      var cardOf = function(s) {
        s = String(s == null ? '' : s).trim();
        if (/^10[shdc]$/i.test(s)) s = 'T' + s.charAt(2);
        var m = /^([2-9TJQKA])([shdc])$/i.exec(s);
        return m ? { rank: m[1].toUpperCase(), suit: m[2].toLowerCase() } : null;
      };
      var key = function(o) { return o.rank + o.suit; };
      var hero = Array.isArray(c.hero) && c.hero.length === 2 ? c.hero.map(cardOf) : null;
      var board = Array.isArray(c.board) ? c.board.map(cardOf) : null;
      if (!hero || !board || hero.concat(board).some(function(x) { return !x; })) return { error: '카드 표기' };
      if (board.length !== 4 && board.length !== 5) return { error: '보드 4~5장' };
      var used = {};
      var known = hero.concat(board);
      for (var i = 0; i < known.length; i++) { if (used[key(known[i])]) return { error: '카드 중복' }; used[key(known[i])] = 1; }
      var priced = c.potTotal != null || c.toCall != null;
      if (priced && (typeof c.potTotal !== 'number' || typeof c.toCall !== 'number' || !(c.potTotal >= 0) || !(c.toCall > 0))) return { error: '가격' };
      if ((c.range != null) === (c.combos != null)) return { error: 'range 또는 combos 하나' };
      var deck = [];
      for (var r = 0; r < 13; r++) for (var s = 0; s < 4; s++) deck.push({ rank: RANKS.charAt(r), suit: SUITS.charAt(s) });
      var pick = [];
      if (c.range != null) {
        if (typeof Range === 'undefined' || !Range || typeof Range.handClass !== 'function') return { error: 'Range 없음' };
        if (typeof c.range !== 'string') return { error: 'range 문자열' };
        var want = new Set(), okParts = c.range.split(',').every(function(p) {
          var st = p.trim() ? Range.parse(p.trim()) : null;
          if (!st || !st.size) return false;
          st.forEach(function(h) { want.add(h); });
          return true;
        });
        if (!okParts) return { error: '레인지 조각' };
        for (var a = 0; a < 52; a++) for (var b = a + 1; b < 52; b++) {
          if (used[key(deck[a])] || used[key(deck[b])]) continue;
          if (want.has(Range.handClass(deck[a], deck[b]))) pick.push([deck[a], deck[b]]);
        }
      } else {
        if (!Array.isArray(c.combos) || !c.combos.length) return { error: 'combos 목록' };
        var listed = {};
        for (var k = 0; k < c.combos.length; k++) {
          var x = typeof c.combos[k] === 'string' ? c.combos[k].trim() : c.combos[k];
          var pair = Array.isArray(x) ? x : (typeof x === 'string' && x.length === 4 ? [x.slice(0, 2), x.slice(2)] : []);
          if (pair.length !== 2) return { error: '콤보 표기' };
          var p0 = cardOf(pair[0]), p1 = cardOf(pair[1]);
          if (!p0 || !p1 || key(p0) === key(p1) || used[key(p0)] || used[key(p1)]) return { error: '콤보 카드' };
          var kk = [key(p0), key(p1)].sort().join('');
          if (listed[kk]) return { error: '콤보 중복' };
          listed[kk] = 1;
        }
        for (var a2 = 0; a2 < 52; a2++) for (var b2 = a2 + 1; b2 < 52; b2++) {
          if (listed[[key(deck[a2]), key(deck[b2])].sort().join('')]) pick.push([deck[a2], deck[b2]]);
        }
      }
      if (!pick.length) return { error: '콤보 0개' };
      var w = 0, t = 0, l = 0, runs = 0;
      pick.forEach(function(vh) {
        var rivers = board.length === 5 ? [null] : deck.filter(function(d) {
          return !used[key(d)] && key(d) !== key(vh[0]) && key(d) !== key(vh[1]);
        });
        rivers.forEach(function(rv) {
          var bd = rv ? board.concat([rv]) : board;
          var cmp = HandEval.compareHands(HandEval.evaluate(hero.concat(bd)), HandEval.evaluate(vh.concat(bd)));
          runs++;
          if (cmp < 0) w++; else if (cmp > 0) l++; else t++;
        });
      });
      // 반올림(0.5 올림) = floor((100 x (2w + t) + runs) / (2 x runs))
      var out = { eq: Math.floor((100 * (2 * w + t) + runs) / (2 * runs)), win: w, tie: t, lose: l, runs: runs, n: pick.length };
      if (priced) {
        out.potTotal = Math.round(c.potTotal * 100) / 100; out.toCall = Math.round(c.toCall * 100) / 100;
        out.need = _roundFrac(c.toCall, c.potTotal + c.toCall);
        out.act = out.eq === out.need ? 'even' : (out.eq > out.need ? 'call' : 'fold');
      }
      return out;
    },
    cases: [
      // 팟 벳(필요 33%)에 밸류 2 + 블러프 1: 블러프캐처(9 원페어)는 1/3 → 본전
      { c: { hero: ['9s', '8s'], board: ['Kd', '9c', '6h', '4h', '2s'], combos: [['Ks', 'Qs'], ['Kc', 'Qc'], ['Ah', '5h']], potTotal: 20, toCall: 10 },
        want: { eq: 33, win: 1, tie: 0, lose: 2, runs: 3, n: 3, need: 33, act: 'even' } },
      // 블러프 3콤보면 3/5 = 60% > 33% → 콜
      { c: { hero: ['9s', '8s'], board: ['Kd', '9c', '6h', '4h', '2s'], combos: ['KsQs', 'KcQc', 'Ah5h', '8h7h', 'QhJh'], potTotal: 20, toCall: 10 },
        want: { eq: 60, win: 3, lose: 2, n: 5, act: 'call' } },
      // 레인지 문자열과 블로커: 보드 K♦가 KK를 3콤보로, 내 Q♣가 QQ를 3콤보로 줄인다. QQ 3 + KK 3 + AA 6 = 12콤보 전부 짐
      { c: { hero: ['Qc', 'Js'], board: ['Kd', '9c', '6h', '4h', '2s'], range: 'QQ+' }, want: { eq: 0, win: 0, lose: 12, n: 12 } },
      // 턴(보드 4장): 콤보 1개 x 리버 44장 열거. 9♠9♥(셋) 대 A♥Q♥(넛 플러시 드로우): 남은 하트 8장(3♥, 5♥, 6♥, 7♥, 8♥,
      // J♥, K♥, 2♥) 중 2♥는 보드 2를 페어로 만들어 내 풀하우스가 이기므로 지는 리버는 7장, 이기는 리버 37장(37/44 = 84%)
      { c: { hero: ['9s', '9h'], board: ['Th', '9c', '4h', '2d'], combos: [['Ah', 'Qh']] }, want: { runs: 44, n: 1, win: 37, tie: 0, lose: 7, eq: 84 } }
    ],
    qNums: function(c) { return (c.potTotal != null && c.toCall != null) ? [c.potTotal, c.toCall] : []; },
    qCards: function(c) {
      var out = [];
      var add = function(x) { var s = _cardStr(x); if (s && out.indexOf(s) < 0) out.push(s); };
      (Array.isArray(c.hero) ? c.hero : []).forEach(add);
      (Array.isArray(c.board) ? c.board : []).forEach(add);
      if (Array.isArray(c.combos)) c.combos.forEach(function(cb) { (_comboStrs(cb) || []).forEach(add); });
      return out;
    }
  };

  // ── blockers ───────────────────────────────────────────
  var blockers = {
    main: 'removed',
    calc: function blockersCalc(c) {
      if (!_haveRange()) return { error: 'Range가 없어요' };
      var hb = _heroBoard(c, 0, 5, 'blockers board는 0~5장이에요');
      if (hb.error) return hb;
      var cls = _rangeClasses(c.range);
      if (cls.error) return cls;
      var boardDead = {};
      hb.board.forEach(function(x) { boardDead[x] = 1; });
      var total = 0, left = 0;
      cls.forEach(function(h) {
        _expand(h, boardDead).forEach(function(cb) {
          total++;
          if (!hb.dead[cb[0]] && !hb.dead[cb[1]]) left++;
        });
      });
      if (!total) return { error: '보드에 다 걸려 남은 콤보가 없어요' };
      return { removed: total - left, left: left, total: total };
    },
    // 독립 경로: 1326 쌍 전수에서 Range.handClass가 레인지에 드는 쌍을 센다
    verify: function(c) {
      if (typeof Range === 'undefined' || !Range || typeof Range.handClass !== 'function') return { error: 'Range 없음' };
      if (typeof c.range !== 'string' || !c.range.trim()) return { error: 'range 문자열' };
      var want = new Set(), okParts = c.range.split(',').every(function(p) {
        var st = p.trim() ? Range.parse(p.trim()) : null;
        if (!st || !st.size) return false;
        st.forEach(function(h) { want.add(h); });
        return true;
      });
      if (!okParts) return { error: '레인지 조각' };
      var norm = function(s) { s = String(s == null ? '' : s).trim(); if (/^10[shdc]$/i.test(s)) s = 'T' + s.charAt(2); return /^[2-9TJQKA][shdc]$/i.test(s) ? s.charAt(0).toUpperCase() + s.charAt(1).toLowerCase() : null; };
      var hero = Array.isArray(c.hero) && c.hero.length === 2 ? c.hero.map(norm) : null;
      var board = c.board == null ? [] : (Array.isArray(c.board) ? c.board.map(norm) : null);
      if (!hero || !board || board.length > 5 || hero.concat(board).some(function(x) { return !x; })) return { error: '카드 표기' };
      var all = hero.concat(board);
      if (all.some(function(x, i) { return all.indexOf(x) !== i; })) return { error: '카드 중복' };
      var total = 0, left = 0;
      for (var a = 0; a < 52; a++) for (var b = a + 1; b < 52; b++) {
        var ca = { rank: RANKS.charAt(a >> 2), suit: SUITS.charAt(a & 3) }, cb = { rank: RANKS.charAt(b >> 2), suit: SUITS.charAt(b & 3) };
        if (!want.has(Range.handClass(ca, cb))) continue;
        var ka = ca.rank + ca.suit, kb = cb.rank + cb.suit;
        if (board.indexOf(ka) >= 0 || board.indexOf(kb) >= 0) continue;
        total++;
        if (hero.indexOf(ka) < 0 && hero.indexOf(kb) < 0) left++;
      }
      if (!total) return { error: '콤보 0개' };
      return { removed: total - left, left: left, total: total };
    },
    cases: [
      // AA 6콤보에서 A♠를 쥐면 A♠가 든 3콤보가 지워진다
      { c: { range: 'AA', hero: ['As', '5s'] }, want: { removed: 3, left: 3, total: 6 } },
      // QQ+, AK = 6 + 6 + 6 + 4 + 12 = 34. A♠5♠는 AA 3, AK 4(A♠K♠, A♠K♥, A♠K♦, A♠K♣)를 지운다
      { c: { range: 'QQ+,AKs,AKo', hero: ['As', '5s'] }, want: { removed: 7, left: 27, total: 34 } },
      // K♠K♦는 KK 6 → 1(K♥K♣만), AKs 4 → 2(A♠K♠, A♦K♦ 지움), AKo 12 → 6(K♠ 3개, K♦ 3개 지움)
      { c: { range: 'QQ+,AKs,AKo', hero: ['Ks', 'Kd'] }, want: { removed: 13, left: 21, total: 34 } },
      // 보드 카드는 total에서 먼저 빠진다(보드 A♥: AA 3, AK 8 → total 23), 내 A♠가 AA 2, AK 4 더 지운다
      { c: { range: 'AA,AKs,AKo', hero: ['As', 'Qd'], board: ['Ah', '7c', '2d'] }, want: { total: 15, left: 9, removed: 6 } }
    ],
    qCards: function(c) {
      var out = [];
      var add = function(x) { var s = _cardStr(x); if (s && out.indexOf(s) < 0) out.push(s); };
      (Array.isArray(c.hero) ? c.hero : []).forEach(add);
      (Array.isArray(c.board) ? c.board : []).forEach(add);
      return out;
    }
  };

  if (typeof LessonCore !== 'undefined' && LessonCore && typeof LessonCore.defineCalc === 'function') {
    LessonCore.defineCalc('alpha', alpha);
    LessonCore.defineCalc('bluffratio', bluffratio);
    LessonCore.defineCalc('eqRange', eqRange);
    LessonCore.defineCalc('blockers', blockers);
  }
})();
