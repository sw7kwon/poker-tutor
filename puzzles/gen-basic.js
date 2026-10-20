// puzzles/gen-basic.js (채우는 패키지: M2-P2a)
// 기초 퍼즐 생성기 4종: showdown(쇼다운 승자), order(말하는 순서), minraise(최소 레이즈, 변형 opensize), tocall(콜 금액).
// 계약: puzzles/puzzle-core.js 머리 주석 C1(생성기), C2(문항), C3(장면).
//   등록: Puzzles.register(type, gen, {stage:1, group:'other', concept}), typeof Puzzles 가드.
//   gen = { next(rnd, opts), verify(q), explain(q), fromKey(key, rnd, opts)(srs 유형만), ready() }
// 정답을 만드는 경로와 verify의 검산 경로는 서로 다르다.
//   showdown: 정답 = HandEval.compareHands, 검산 = 이 파일의 독립 7장 평가기(_ind7, 랭크와 무늬 세기 방식)
//   order: 정답 = 순서 배열(UTG..BB / SB..BTN), 검산 = GameState 큐 재현(buildInitialState의 pendingQueue,
//     advanceStreet의 포스트플랍 큐). GameState가 없으면 시계 방향 좌석 계산.
//   minraise: 정답 = key의 currentBet + lastRaiseSize(game-state.js:110, :132), 검산 = 액션 원장 재생과
//     GameState.applyHeroAction(정답은 통과, 0.5bb 적으면 actionError)
//   minraise 변형 opensize: 정답 = 이 앱 표준 사이즈 표(오픈 2.5bb, SB 3bb, 림퍼당 +1bb),
//     검산 = EV.calcOptions(engine/ev.js:28-32)의 raiseHalfAmt. ai/villain.js:54의 AI 오픈(3bb)과는 다르므로 AI 기준이라 쓰지 않는다.
//   tocall: 정답 = 상황 유형별 식(오픈 X면 X, SB면 X - 0.5 등), 검산 = 액션 원장 재생과 GameState.applyHeroAction('call') 지불액
// 키 정책(설계서 3.2절): showdown, order는 once(key null, 로드 시 Drills.keyPolicy 'once' 등록).
//   minraise key = 'cb|lr'(예 '8|5.5'), opensize key = 'os|POS|림퍼 수'(예 'os|CO|2'), tocall key = 상황 버킷(TC_KINDS).
// 쇼다운 무승부는 20%만 출제하고 보기에 '무승부'를 둔다(3.2절 출제 제외 4번).
// 자명 문항은 rated:false: 보드가 스트레이트 플러시 이상인 쇼다운, 순서 기본 3사실(프리플랍 UTG 처음, BB 마지막,
//   포스트플랍 BTN 마지막, 폴드 없음), 프리플랍 첫 레이즈 2bb('1|1'), 내 칩이 없는 콜 금액, opensize(앱 정의라 전부).
// 로드 시 DOM/window 접근 없음. 다른 모듈은 typeof 가드.
(function() {
  'use strict';

  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];   // 프리플랍 말하는 순서
  var POST6 = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];  // 플랍부터 말하는 순서
  // 실제 테이블 자리 배치(BTN부터 시계 방향). order 장면은 이 순서로 그린다(말하는 순서로 늘어놓으면 정답이 보인다)
  var TABLE6 = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];
  var STREET_KO = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var RANKS = '23456789TJQKA';
  var SUITS = 'shdc';
  var RV = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

  // ── 공통 도우미 ──
  function _rng(rnd) { return typeof rnd === 'function' ? rnd : Math.random; }
  function _int(rnd, n) { return n <= 0 ? 0 : Math.floor(rnd() * n) % n; }
  function _pick(arr, rnd) { return arr[_int(rnd, arr.length)]; }
  function _shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = _int(rnd, i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function _half(x) { return Math.round(x * 2) / 2; }
  function _r2(x) { return Math.round(x * 100) / 100; }
  function _num(x) { var v = Math.round(x * 10) / 10; return (v % 1 === 0) ? String(v) : v.toFixed(1); }
  function _bb(x) { return _num(x) + 'bb'; }
  function _same(a, b) { return Math.abs(a - b) < 1e-9; }
  function _street(rnd) { return _pick(['flop', 'turn', 'river'], rnd); }
  function _optsOk(q, n) {
    if (!q || !Array.isArray(q.options) || q.options.length !== n) return false;
    var seen = {};
    for (var i = 0; i < q.options.length; i++) {
      var o = q.options[i];
      if (!o || typeof o.id !== 'string' || !o.id || seen[o.id] || typeof o.label !== 'string' || !o.label) return false;
      seen[o.id] = true;
    }
    return !!seen[q.answer];
  }
  function _baseOk(q, type, n) {
    return !!q && q.type === type && q.confidence === 'exact' && typeof q.prompt === 'string' &&
      q.prompt.split('\n').length <= 2 && typeof q.rated === 'boolean' && _optsOk(q, n);
  }
  function _list(arr) { return arr.join(', '); }

  // ── 카드 ──
  function _cardText(c) { return (c.charAt(0) === 'T' ? '10' : c.charAt(0)) + SUIT_SYM[c.charAt(1)]; }
  function _cardsText(cs) { return cs.map(_cardText).join(' '); }
  function _obj(c) { return { rank: c.charAt(0), suit: c.charAt(1) }; }
  function _fullDeck() { var d = []; for (var r = 0; r < 13; r++) for (var s = 0; s < 4; s++) d.push(RANKS.charAt(r) + SUITS.charAt(s)); return d; }
  function _draw(deck, rnd) { return deck.splice(_int(rnd, deck.length), 1)[0]; }
  function _take(deck, card) { var i = deck.indexOf(card); if (i < 0) return false; deck.splice(i, 1); return true; }
  function _rankName(v) { return v === 14 ? 'A' : v === 13 ? 'K' : v === 12 ? 'Q' : v === 11 ? 'J' : String(v); }

  // =====================================================================
  // 1. showdown
  // =====================================================================
  var SD_TIE_RATE = 0.2;

  function _score(cards) { return HandEval.evaluate(cards.map(_obj)); }
  function _cmp(a, b, board) { return HandEval.compareHands(_score(a.concat(board)), _score(b.concat(board))); }

  // 보드 강한 패 만들기(variant 'board'와 무승부 보드 플레이). 덱에서 5장을 뺀다. 실패하면 null.
  var BOARD_KINDS = ['straight', 'flush', 'fullhouse', 'quads', 'twopair', 'trips'];
  function _boardOf(kind, deck, rnd) {
    var picks = [];
    function rankCards(rc, n) {
      var cs = _shuffle(SUITS.split(''), rnd).slice(0, n).map(function(s) { return rc + s; });
      for (var i = 0; i < cs.length; i++) picks.push(cs[i]);
    }
    function distinctRanks(n, excl) {
      var pool = RANKS.split('').filter(function(r) { return (excl || []).indexOf(r) < 0; });
      return _shuffle(pool, rnd).slice(0, n);
    }
    if (kind === 'royal') {
      var s0 = _pick(SUITS.split(''), rnd);
      picks = ['T', 'J', 'Q', 'K', 'A'].map(function(r) { return r + s0; });
    } else if (kind === 'straight') {
      var top = 3 + _int(rnd, 10); // RANKS 인덱스 3('5', 휠) ~ 12('A')
      for (var k = 0; k < 5; k++) {
        var ri = top - k; var rc = ri < 0 ? 'A' : RANKS.charAt(ri); // 휠(5 하이)의 마지막 장은 A
        picks.push(rc + _pick(SUITS.split(''), rnd));
      }
      var suits = {}; picks.forEach(function(c) { suits[c.charAt(1)] = (suits[c.charAt(1)] || 0) + 1; });
      for (var sk in suits) if (suits[sk] >= 3) return null; // 플러시 가능성이 큰 보드는 피한다(보드 스트레이트 장면을 흐리지 않게)
    } else if (kind === 'flush') {
      var fs = _pick(SUITS.split(''), rnd);
      var rs = distinctRanks(5).sort(function(a, b) { return RV[b] - RV[a]; });
      var vs = rs.map(function(r) { return RV[r]; });
      if (vs[0] - vs[4] === 4 || (vs[0] === 14 && vs[1] === 5)) return null; // 스트레이트 플러시 배제
      picks = rs.map(function(r) { return r + fs; });
    } else if (kind === 'fullhouse') {
      var fr = distinctRanks(2); rankCards(fr[0], 3); rankCards(fr[1], 2);
    } else if (kind === 'quads') {
      var qr = distinctRanks(2); rankCards(qr[0], 4); rankCards(qr[1], 1);
    } else if (kind === 'twopair') {
      var tr = distinctRanks(3); rankCards(tr[0], 2); rankCards(tr[1], 2); rankCards(tr[2], 1);
    } else if (kind === 'trips') {
      var xr = distinctRanks(3); rankCards(xr[0], 3); rankCards(xr[1], 1); rankCards(xr[2], 1);
    } else return null;
    for (var i = 0; i < picks.length; i++) if (!_take(deck, picks[i])) return null;
    return _shuffle(picks, rnd);
  }

  function _dealHoles(deck, rnd) { return [[_draw(deck, rnd), _draw(deck, rnd)], [_draw(deck, rnd), _draw(deck, rnd)]]; }

  // 한 번의 시도: 조건에 맞으면 {a, b, board, sub}, 아니면 null
  function _sdTry(rnd, wantTie, variant) {
    var deck = _fullDeck(), a, b, board, sub, h;
    if (variant === 'board') {
      var kind = rnd() < 0.04 ? 'royal' : _pick(BOARD_KINDS, rnd);
      board = _boardOf(kind, deck, rnd);
      if (!board) return null;
      h = _dealHoles(deck, rnd); a = h[0]; b = h[1]; sub = 'board-' + kind;
    } else if (wantTie) {
      var u = rnd();
      if (u < 0.5) { // 같은 숫자 두 장(무늬만 다름)
        var rr = _shuffle(RANKS.split(''), rnd).slice(0, 2);
        var s1 = _shuffle(SUITS.split(''), rnd), s2 = _shuffle(SUITS.split(''), rnd);
        a = [rr[0] + s1[0], rr[1] + s2[0]]; b = [rr[0] + s1[1], rr[1] + s2[1]];
        if (!(_take(deck, a[0]) && _take(deck, a[1]) && _take(deck, b[0]) && _take(deck, b[1]))) return null;
        board = [_draw(deck, rnd), _draw(deck, rnd), _draw(deck, rnd), _draw(deck, rnd), _draw(deck, rnd)];
        sub = 'same';
      } else if (u < 0.8) { // 보드 플레이
        board = _boardOf(_pick(['straight', 'fullhouse', 'quads', 'twopair', 'flush'], rnd), deck, rnd);
        if (!board) return null;
        h = _dealHoles(deck, rnd); a = h[0]; b = h[1]; sub = 'boardplay';
      } else {
        h = _dealHoles(deck, rnd); a = h[0]; b = h[1];
        board = [_draw(deck, rnd), _draw(deck, rnd), _draw(deck, rnd), _draw(deck, rnd), _draw(deck, rnd)];
        sub = 'random';
      }
    } else {
      h = _dealHoles(deck, rnd); a = h[0]; b = h[1];
      board = [_draw(deck, rnd), _draw(deck, rnd), _draw(deck, rnd), _draw(deck, rnd), _draw(deck, rnd)];
      var w = rnd();
      sub = w < 0.35 ? 'random' : (w < 0.7 ? 'kicker' : 'close');
    }
    var c = _cmp(a, b, board);
    if (wantTie !== (c === 0)) return null;
    if (!wantTie && variant !== 'board' && (sub === 'kicker' || sub === 'close')) {
      var ta = _score(a.concat(board)).type, tb = _score(b.concat(board)).type;
      if (sub === 'kicker' && ta !== tb) return null;
      if (sub === 'close' && Math.abs(ta - tb) !== 1) return null;
    }
    return { a: a, b: b, board: board, sub: sub };
  }

  function _sdBuild(rnd, variant) {
    var wantTie = rnd() < SD_TIE_RATE, d = null;
    for (var t = 0; t < 400 && !d; t++) d = _sdTry(rnd, wantTie, variant);
    if (!d && !wantTie) { // 드문 실패: 무작위 비무승부로 대체
      for (var t2 = 0; t2 < 200 && !d; t2++) { d = _sdTry(rnd, false, null); if (d) d.sub = 'random'; }
    }
    if (!d) return null;
    var c = _cmp(d.a, d.b, d.board);
    var sa = _score(d.a.concat(d.board)), sb = _score(d.b.concat(d.board)), sBoard = _score(d.board);
    var trivial = sBoard.type <= 2; // 보드가 로열/스트레이트 플러시면 둘 다 보드를 쓴다(자명)
    var diff = 1000 + (sa.type === sb.type ? 50 : 0) + (c === 0 ? 50 : 0) + (variant === 'board' ? 50 : 0);
    var q = {
      type: 'showdown', key: null, concept: 'showdown', difficulty: trivial ? 900 : diff,
      confidence: 'exact', appDef: false, rated: !trivial, srs: 'once', ui: 'choice',
      prompt: '나(A) ' + _cardsText(d.a) + ', 상대(B) ' + _cardsText(d.b) + '. 보드 5장이 모두 열렸다.\n누가 이길까?',
      scene: { hero: d.a.slice(), board: d.board.slice(), range: { label: '상대(B)', combos: [d.b.join('')] }, note: '쇼다운' },
      options: [{ id: 'A', label: '나(A) 승' }, { id: 'B', label: '상대(B) 승' }, { id: 'tie', label: '무승부(팟을 나눔)' }],
      answer: c < 0 ? 'A' : (c > 0 ? 'B' : 'tie'),
      data: { a: d.a, b: d.b, board: d.board, sub: d.sub }
    };
    if (variant === 'board') q.variant = 'board';
    return q;
  }

  // 독립 7장 평가기(검산 전용). [족보 등급(9 스트레이트 플러시 ~ 1 하이카드), 비교 숫자...]
  function _ind7(cards) {
    var cnt = {}, bySuit = { s: [], h: [], d: [], c: [] };
    for (var i = 0; i < cards.length; i++) {
      var v = RV[cards[i].charAt(0)], s = cards[i].charAt(1);
      if (!v || !bySuit[s]) return null;
      cnt[v] = (cnt[v] || 0) + 1; bySuit[s].push(v);
    }
    function stTop(set) {
      for (var top = 14; top >= 5; top--) {
        var ok = true;
        for (var k = 0; k < 5; k++) { var x = top - k; if (x === 1) x = 14; if (!set[x]) { ok = false; break; } }
        if (ok) return top;
      }
      return 0;
    }
    var fl = null;
    for (var su in bySuit) if (bySuit[su].length >= 5) fl = bySuit[su].slice().sort(function(a, b) { return b - a; });
    if (fl) { var fset = {}; fl.forEach(function(x) { fset[x] = true; }); var sf = stTop(fset); if (sf) return [9, sf]; }
    var ranks = Object.keys(cnt).map(Number).sort(function(a, b) { return b - a; });
    function of(n) { return ranks.filter(function(r) { return cnt[r] === n; }); }
    function kick(excl, n) { return ranks.filter(function(r) { return excl.indexOf(r) < 0; }).slice(0, n); }
    var quads = of(4), trips = of(3), pairs = of(2);
    if (quads.length) return [8, quads[0]].concat(kick([quads[0]], 1));
    if (trips.length && (trips.length > 1 || pairs.length)) return [7, trips[0], Math.max(trips[1] || 0, pairs[0] || 0)];
    if (fl) return [6].concat(fl.slice(0, 5));
    var all = {}; ranks.forEach(function(r) { all[r] = true; });
    var st = stTop(all);
    if (st) return [5, st];
    if (trips.length) return [4, trips[0]].concat(kick([trips[0]], 2));
    if (pairs.length >= 2) return [3, pairs[0], pairs[1]].concat(kick([pairs[0], pairs[1]], 1));
    if (pairs.length) return [2, pairs[0]].concat(kick([pairs[0]], 3));
    return [1].concat(ranks.slice(0, 5));
  }
  function _cmpArr(x, y) {
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (x[i] || 0) - (y[i] || 0);
      if (d) return d;
    }
    return 0;
  }
  function _cardsValid(list) {
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (typeof c !== 'string' || c.length !== 2 || RANKS.indexOf(c.charAt(0)) < 0 || SUITS.indexOf(c.charAt(1)) < 0 || seen[c]) return false;
      seen[c] = true;
    }
    return true;
  }

  function _sdVerify(q) {
    if (!_baseOk(q, 'showdown', 3) || q.key !== null || q.srs !== 'once') return false;
    var d = q.data;
    if (!d || !Array.isArray(d.a) || !Array.isArray(d.b) || !Array.isArray(d.board)) return false;
    if (d.a.length !== 2 || d.b.length !== 2 || d.board.length !== 5 || !_cardsValid(d.a.concat(d.b, d.board))) return false;
    var ids = q.options.map(function(o) { return o.id; }).sort().join(',');
    if (ids !== 'A,B,tie') return false;
    var ea = _ind7(d.a.concat(d.board)), eb = _ind7(d.b.concat(d.board));
    if (!ea || !eb) return false;
    var c = _cmpArr(ea, eb);
    var exp = c > 0 ? 'A' : (c < 0 ? 'B' : 'tie');
    if (q.answer !== exp) return false;
    var sc = q.scene || {};
    return (sc.board || []).join() === d.board.join() && (sc.hero || []).join() === d.a.join();
  }

  // 족보 한 줄 설명: describe(족보 이름) + 비교 숫자
  function _sdDesc(sc) {
    var name = HandEval.describe(sc), tb = sc.tiebreakers.map(_rankName);
    switch (sc.type) {
      case 1: return name;
      case 2: return name + '(' + tb[0] + ' 하이)';
      case 3: return name + '(' + tb[0] + ', 킥커 ' + tb[1] + ')';
      case 4: return name + '(' + tb[0] + ' 트리플 + ' + tb[1] + ' 페어)';
      case 5: return name + '(' + tb.join(' ') + ')';
      case 6: return name + '(' + tb[0] + ' 하이)';
      case 7: return name + '(' + tb[0] + ', 킥커 ' + tb.slice(1).join(' ') + ')';
      case 8: return name + '(' + tb[0] + ', ' + tb[1] + ', 킥커 ' + tb[2] + ')';
      case 9: return name + '(' + tb[0] + ', 킥커 ' + tb.slice(1).join(' ') + ')';
      default: return name + '(' + tb.join(' ') + ')';
    }
  }
  function _sdReason(type, i) {
    switch (type) {
      case 9: return i === 0 ? '페어 숫자가 높은' : '킥커가 높은';
      case 8: return i === 0 ? '높은 페어가 더 큰' : (i === 1 ? '낮은 페어가 더 큰' : '킥커가 높은');
      case 7: return i === 0 ? '트리플 숫자가 높은' : '킥커가 높은';
      case 6: case 2: return '더 높은 스트레이트인';
      case 5: return '플러시 카드를 위에서부터 비교해 앞선';
      case 4: return i === 0 ? '트리플 쪽 숫자가 높은' : '페어 쪽 숫자가 높은';
      case 3: return i === 0 ? '포카드 숫자가 높은' : '킥커가 높은';
      default: return '높은 카드부터 비교해 앞선';
    }
  }
  function _best5(cards) {
    var objs = cards.map(_obj), best = null, bestSc = null, five = [], idx = [];
    for (var a = 0; a < 7; a++) for (var b = a + 1; b < 7; b++) {
      five.length = 0; idx.length = 0;
      for (var k = 0; k < 7; k++) if (k !== a && k !== b) { five.push(objs[k]); idx.push(k); }
      var sc = HandEval.evaluate(five);
      if (!bestSc || HandEval.compareHands(sc, bestSc) < 0) { best = idx.slice(); bestSc = sc; }
    }
    return best.map(function(k) { return cards[k]; }).sort(function(x, y) { return RV[y.charAt(0)] - RV[x.charAt(0)]; });
  }
  function _sdExplain(q) {
    var d = q.data, A = 'A(나)', B = 'B(상대)';
    var sa = _score(d.a.concat(d.board)), sb = _score(d.b.concat(d.board)), sBoard = _score(d.board);
    var c = HandEval.compareHands(sa, sb), line;
    var aBoard = HandEval.compareHands(sa, sBoard) === 0, bBoard = HandEval.compareHands(sb, sBoard) === 0;
    if (c === 0) {
      if (aBoard && bBoard) line = '둘 다 보드 5장 그대로가 최고 패: ' + _sdDesc(sBoard) + '. 무승부, 팟을 나눠요.';
      else line = '둘 다 ' + _sdDesc(sa) + ', 숫자까지 같아서 무승부, 팟을 나눠요.';
    } else {
      var W = c < 0 ? A : B, why;
      if (sa.type !== sb.type) why = '족보가 더 높은';
      else {
        var i = 0;
        while (i < sa.tiebreakers.length && sa.tiebreakers[i] === sb.tiebreakers[i]) i++;
        why = _sdReason(sa.type, i);
      }
      line = A + ' ' + _sdDesc(sa) + ', ' + B + ' ' + _sdDesc(sb) + '. ' + why + ' ' + W + ' 승.';
      var L = c < 0 ? bBoard : aBoard;
      if (L) line += ' ' + (c < 0 ? B : A) + '는 보드를 그대로 써요.';
    }
    var scene = {
      hero: d.a.slice(), board: d.board.slice(), range: { label: '상대(B)', combos: [d.b.join('')] },
      note: 'A 최고 5장 ' + _cardsText(_best5(d.a.concat(d.board))) + ', B 최고 5장 ' + _cardsText(_best5(d.b.concat(d.board)))
    };
    return { line: line, scene: scene };
  }

  var showdownGen = {
    next: function(rnd, opts) { return _sdBuild(_rng(rnd), opts && opts.variant === 'board' ? 'board' : null); },
    verify: function(q) { try { return _sdVerify(q); } catch (e) { return false; } },
    explain: _sdExplain,
    ready: function() { return typeof HandEval !== 'undefined'; }
  };

  // =====================================================================
  // 2. order
  // =====================================================================
  function _ordOf(street) { return street === 'preflop' ? POS6 : POST6; }
  function _ordAnswer(kind, street, folded, x) {
    var q = _ordOf(street).filter(function(p) { return folded.indexOf(p) < 0; });
    if (kind === 'first') return q[0];
    if (kind === 'last') return q[q.length - 1];
    var i = q.indexOf(x);
    return (i >= 0 && i < q.length - 1) ? q[i + 1] : null;
  }

  function _ordBuild(rnd) {
    var pre = rnd() < 0.4, street = pre ? 'preflop' : _street(rnd), folded = [], kind, x = null, xAct = null, u = rnd();
    if (pre) {
      kind = u < 0.4 ? 'first' : (u < 0.6 ? 'last' : 'next');
      if (kind === 'first' && rnd() < 0.6) folded = POS6.slice(0, 1 + _int(rnd, 3));
      if (kind === 'next') {
        var xi = _int(rnd, 5); x = POS6[xi]; xAct = _pick(['콜', '폴드', '레이즈'], rnd);
        if (xi > 0 && rnd() < 0.5) folded = POS6.slice(0, 1 + _int(rnd, xi));
      }
    } else {
      kind = u < 0.4 ? 'first' : (u < 0.7 ? 'last' : 'next');
      if (rnd() < 0.7) folded = _shuffle(POS6, rnd).slice(0, 1 + _int(rnd, 4));
      var act = POST6.filter(function(p) { return folded.indexOf(p) < 0; });
      if (kind === 'next') { x = _pick(act.slice(0, act.length - 1), rnd); xAct = _pick(['체크', '벳'], rnd); }
      folded = POS6.filter(function(p) { return folded.indexOf(p) >= 0; }); // 프리플랍에 폴드했으니 프리플랍 순서로 적는다
    }
    var ans = _ordAnswer(kind, street, folded, x);
    if (!ans) return null;
    // 오답 후보: 폴드를 무시했을 때의 답, 다른 스트리트 순서의 답, 그 밖의 자리
    var tempt = [];
    if (folded.length) tempt.push(_ordAnswer(kind, street, [], x));
    tempt.push(_ordAnswer(kind, pre ? 'flop' : 'preflop', folded, x));
    var ok = function(p) { return p && p !== ans && p !== x; };
    var opts = [ans], ti = _shuffle(tempt, rnd);
    for (var i = 0; i < ti.length && opts.length < 2; i++) if (ok(ti[i]) && opts.indexOf(ti[i]) < 0) opts.push(ti[i]);
    var rest = _shuffle(POS6.filter(function(p) { return ok(p) && opts.indexOf(p) < 0; }), rnd);
    while (opts.length < 3 && rest.length) opts.push(rest.shift());
    opts = _shuffle(opts, rnd);

    var st = STREET_KO[street], line1, line2;
    if (pre) {
      if (kind === 'next') {
        line1 = st + '. ' + folded.map(function(p) { return p + ' 폴드'; }).concat([x + ' ' + xAct]).join(', ') + '.';
        line2 = '다음에 말하는 자리는?';
      } else if (folded.length) {
        line1 = st + '. ' + folded.map(function(p) { return p + ' 폴드'; }).join(', ') + '.';
        line2 = '이제 누가 말할 차례일까?';
      } else {
        line1 = st + ', 6명이 모두 카드를 받았다.';
        line2 = kind === 'first' ? '가장 먼저 말하는 자리는?' : '첫 바퀴에서 가장 마지막에 말하는 자리는?';
      }
    } else {
      line1 = folded.length ? st + '. 프리플랍에서 ' + _list(folded) + ' 폴드.' : st + ', 6명이 모두 남아 있다.';
      if (kind === 'next') line2 = x + ' ' + xAct + '. 다음에 말하는 자리는?';
      else if (kind === 'first') line2 = (folded.length ? '남은 사람 중 ' : '') + '가장 먼저 말하는 자리는?';
      else line2 = '첫 바퀴에서 가장 마지막에 말하는 자리는?';
    }
    var trivial = !folded.length && ((pre && kind === 'first') || kind === 'last');
    var seats = TABLE6.map(function(p) {
      var s = { pos: p, active: folded.indexOf(p) < 0 };
      if (folded.indexOf(p) >= 0) s.label = '폴드';
      else if (p === x) s.label = xAct;
      return s;
    });
    return {
      type: 'order', key: null, concept: 'order', difficulty: trivial ? 900 : 1000 + (folded.length ? 50 : 0) + (kind === 'next' ? 50 : 0),
      confidence: 'exact', appDef: false, rated: !trivial, srs: 'once', ui: 'choice',
      prompt: line1 + '\n' + line2,
      scene: { seats: seats, note: st + ', 자리는 BTN부터 시계 방향' },
      options: opts.map(function(p) { return { id: p, label: p }; }),
      answer: ans,
      data: { street: street, kind: kind, folded: folded, x: x, xAct: xAct }
    };
  }

  // 검산 경로: GameState 큐 재현(names는 포지션 순서로 정렬되고 pendingQueue가 실제 말하는 순서)
  function _engineQueue(street, folded) {
    if (typeof GameState === 'undefined' || !GameState.buildInitialState || !GameState.advanceStreet) return null;
    var spec = POS6.filter(function(p) { return p !== 'BTN'; }).map(function(p) { return { name: 'V_' + p, type: 'TAG', pos: p }; });
    var s = GameState.buildInitialState(spec, 'BTN', 777);
    var posOf = function(n) { return s.players[n].pos; };
    if (street === 'preflop') return s.pendingQueue.map(posOf).filter(function(p) { return folded.indexOf(p) < 0; });
    folded.forEach(function(p) { s.folded[p === 'BTN' ? 'Hero' : 'V_' + p] = true; });
    s.pendingQueue = [];
    var s2 = GameState.advanceStreet(s);
    return s2.pendingQueue.map(function(n) { return s2.players[n].pos; });
  }
  // GameState가 없을 때: 시계 방향 좌석(BTN, SB, BB, UTG, HJ, CO). 프리플랍은 BB 왼쪽, 포스트플랍은 BTN 왼쪽부터
  function _ringQueue(street, folded) {
    var ring = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];
    var start = (ring.indexOf(street === 'preflop' ? 'BB' : 'BTN') + 1) % 6, out = [];
    for (var i = 0; i < 6; i++) { var p = ring[(start + i) % 6]; if (folded.indexOf(p) < 0) out.push(p); }
    return out;
  }
  function _ordVerify(q) {
    if (!_baseOk(q, 'order', 3) || q.key !== null || q.srs !== 'once') return false;
    var d = q.data;
    if (!d || !STREET_KO[d.street] || !Array.isArray(d.folded)) return false;
    if (q.options.some(function(o) { return POS6.indexOf(o.id) < 0; })) return false;
    var queue = _engineQueue(d.street, d.folded) || _ringQueue(d.street, d.folded);
    if (queue.length < 2) return false;
    if (d.street === 'preflop' && d.folded.length) { // 프리플랍 폴드는 앞사람부터(아직 말하지 않은 자리는 폴드할 수 없다)
      var full = _engineQueue('preflop', []) || _ringQueue('preflop', []);
      if (full.slice(0, d.folded.length).join() !== d.folded.join()) return false;
    }
    var exp;
    if (d.kind === 'first') exp = queue[0];
    else if (d.kind === 'last') exp = queue[queue.length - 1];
    else if (d.kind === 'next') { var i = queue.indexOf(d.x); exp = (i >= 0 && i < queue.length - 1) ? queue[i + 1] : null; }
    return !!exp && q.answer === exp;
  }
  function _ordExplain(q) {
    var d = q.data, pre = d.street === 'preflop';
    var ord = _ordOf(d.street), act = ord.filter(function(p) { return d.folded.indexOf(p) < 0; });
    var line = (pre ? '프리플랍 순서: UTG, HJ, CO, BTN, SB, BB(BB가 마지막).' : '플랍부터 순서: SB, BB, UTG, HJ, CO, BTN(BTN이 마지막).');
    if (d.folded.length) line += ' 폴드한 자리(' + _list(d.folded) + ')는 건너뛰어요.';
    var ans = _ordAnswer(d.kind, d.street, d.folded, d.x);
    // 프리플랍 앞사람 폴드 뒤 'first'는 지문이 '이제 누가 말할 차례'라 해설도 같은 말로(가장 먼저 말한 자리는 폴드한 UTG다)
    line += d.kind === 'next' ? ' 그래서 ' + d.x + ' 다음 차례는 ' + ans + '.' :
      (d.kind === 'first' ? (pre && d.folded.length ? ' 그래서 이제 말할 차례는 ' : ' 그래서 가장 먼저 말하는 자리는 ') + ans + '.' : ' 그래서 첫 바퀴 마지막 자리는 ' + ans + '.');
    var seats = TABLE6.map(function(p) {
      var i = act.indexOf(p);
      return { pos: p, active: i >= 0, label: i >= 0 ? (i + 1) + '번' : '폴드' };
    });
    return { line: line, scene: { seats: seats, note: STREET_KO[d.street] + ', 숫자는 말하는 순서' } };
  }

  var orderGen = {
    next: function(rnd) { rnd = _rng(rnd); for (var t = 0; t < 20; t++) { var q = _ordBuild(rnd); if (q) return q; } return null; },
    verify: function(q) { try { return _ordVerify(q); } catch (e) { return false; } },
    explain: _ordExplain,
    ready: function() { return true; }
  };

  // =====================================================================
  // 액션 장면 공통(minraise, tocall): 스크립트 진행기와 원장
  // =====================================================================
  // 스크립트 진행: 말하는 순서대로 돌며 script 사건을 차례로 넣고, 나머지는 채움 액션(체크/폴드/콜)으로 채운다.
  // script가 끝난 뒤 히어로 차례가 오면 액션 목록을 돌려준다. 순서가 맞지 않으면 null.
  function _run(street, active, script, hero, rnd, fillerCall) {
    var pre = street === 'preflop', bets = {}, acted = {}, folded = {}, acts = [], si = 0, n = active.length;
    active.forEach(function(p) { bets[p] = 0; });
    if (pre) { bets.SB = 0.5; bets.BB = 1; }
    var cb = pre ? 1 : 0;
    for (var step = 0; step < 80; step++) {
      var p = active[step % n];
      if (folded[p]) continue;
      var need = !acted[p] || bets[p] < cb;
      if (si >= script.length && p === hero) return need ? acts : null;
      var ev = script[si];
      if (ev && ev.pos === p) {
        if (!need) return null;
        var a = { pos: p, act: ev.act };
        if (ev.act === 'bet' || ev.act === 'raise') { a.to = ev.to; cb = ev.to; bets[p] = ev.to; acted = {}; }
        else if (ev.act === 'call' || ev.act === 'limp') { a.to = cb; bets[p] = cb; }
        else if (ev.act === 'fold') folded[p] = true;
        a.s = true; // 스크립트 사건(지문에 쓴다)
        acts.push(a); acted[p] = true; si++;
        continue;
      }
      if (!need) continue;
      if (p === hero) return null;
      var pending = false;
      for (var k = si; k < script.length; k++) if (script[k].pos === p) pending = true;
      if (bets[p] >= cb) acts.push({ pos: p, act: 'check' });
      else if (pending || (fillerCall && rnd() < fillerCall)) { acts.push({ pos: p, act: 'call', to: cb }); bets[p] = cb; }
      else { acts.push({ pos: p, act: 'fold' }); folded[p] = true; }
      acted[p] = true;
    }
    return null;
  }

  // 원장 재생(검산 경로): 이번 스트리트 투입액, currentBet, lastRaiseSize(game-state.js 규칙), 팟
  function _ledger(d) {
    var pre = d.street === 'preflop', bets = {}, ok = true;
    POS6.forEach(function(p) { bets[p] = 0; });
    if (pre) { bets.SB = 0.5; bets.BB = 1; }
    var cb = pre ? 1 : 0, lr = 1;
    (d.actions || []).forEach(function(a) {
      if (POS6.indexOf(a.pos) < 0) { ok = false; return; }
      if (a.act === 'bet' || a.act === 'raise') {
        if (!(a.to > cb) || a.to < cb + lr - 1e-9) ok = false; // 민레이즈 미달
        lr = a.to - cb; cb = a.to; bets[a.pos] = a.to;
      } else if (a.act === 'call' || a.act === 'limp') bets[a.pos] = cb;
    });
    var sum = 0;
    POS6.forEach(function(p) { sum += bets[p]; });
    return { bets: bets, cb: cb, lr: lr, pot: _r2((d.prevPot || 0) + sum), ok: ok };
  }

  // 지문과 좌석 라벨
  function _actTexts(d) {
    var pre = d.street === 'preflop', raises = 0, limped = false, checked = {};
    return d.actions.map(function(a) {
      if (a.act === 'fold') return '폴드';
      if (a.act === 'check') { checked[a.pos] = true; return '체크'; }
      if (a.act === 'limp') { limped = true; return '림프'; }
      if (a.act === 'call') return '콜';
      raises++;
      if (a.act === 'bet') return _bb(a.to) + ' 벳';
      if (pre) return _bb(a.to) + ' ' + (raises === 1 ? (limped ? '레이즈' : '오픈') : (raises === 2 ? '3벳' : '4벳'));
      return _bb(a.to) + ' ' + (checked[a.pos] ? '체크레이즈' : '레이즈');
    });
  }
  function _heroActed(d) { return d.actions.some(function(a) { return a.pos === d.hero; }); }
  function _heroRaised(d) { return d.actions.some(function(a) { return a.pos === d.hero && (a.act === 'bet' || a.act === 'raise'); }); }
  function _blindTxt(d) {
    if (d.street !== 'preflop') return '';
    return d.hero === 'SB' ? '(블라인드 0.5bb)' : (d.hero === 'BB' ? '(블라인드 1bb)' : '');
  }
  function _storyLine(d) {
    var tx = _actTexts(d), parts = [], shown = {};
    d.actions.forEach(function(a, i) {
      // 채움 폴드는 생략하되, 앞서 지문에 나온 자리(예: 체크한 SB)가 폴드하면 적는다(아직 남은 줄 오해 방지)
      if (a.act === 'fold' && !a.s && !shown[a.pos]) return;
      shown[a.pos] = true;
      parts.push((a.pos === d.hero ? '나(' + a.pos + ')' : a.pos) + ' ' + tx[i]);
    });
    var line = STREET_KO[d.street] + '.';
    if (parts.length) line += ' ' + parts.join(', ') + '.';
    else if (d.street === 'preflop') line += d.hero === 'UTG' ? ' 내가 첫 차례.' : ' 앞사람은 모두 폴드.';
    if (!_heroActed(d)) line += ' 내 자리 ' + d.hero + _blindTxt(d) + '.';
    return line;
  }
  function _seats(d) {
    var tx = _actTexts(d), last = {}, inHand = d.street === 'preflop' ? POS6 : (d.active || POS6);
    d.actions.forEach(function(a, i) { last[a.pos] = { a: a, t: tx[i] }; });
    return POS6.map(function(p) {
      var L = last[p], s = { pos: p, active: inHand.indexOf(p) >= 0 && !(L && L.a.act === 'fold') };
      if (p === d.hero) s.hero = true;
      if (L) s.label = (L.a.act === 'call' || L.a.act === 'limp') ? L.t + ' ' + _bb(L.a.to) : L.t;
      else if (d.street === 'preflop' && (p === 'SB' || p === 'BB')) s.label = '블라인드 ' + (p === 'SB' ? '0.5bb' : '1bb');
      else if (inHand.indexOf(p) < 0) s.label = '폴드';
      return s;
    });
  }

  // 숫자 4지 보기: id = 'v' + 값, near = 정답과 0.5bb 이내 또는 10% 이내
  function _numOptions(correct, cands, rnd, minV) {
    var vals = [correct], pool = _shuffle(cands.slice(0, 2), rnd).concat(_shuffle(cands.slice(2), rnd));
    for (var i = 0; i < pool.length && vals.length < 4; i++) {
      var v = _half(pool[i]);
      if (!(v > minV) || vals.some(function(x) { return _same(x, v); })) continue;
      vals.push(v);
    }
    for (var k = 1; vals.length < 4 && k < 40; k++) { // 후보가 모자라면 정답 위아래로 채운다
      var w = _half(correct + (k % 2 ? 1 : -1) * Math.ceil(k / 2));
      if (w > minV && !vals.some(function(x) { return _same(x, w); })) vals.push(w);
    }
    return _shuffle(vals, rnd).map(function(v) {
      var o = { id: 'v' + _num(v), label: _bb(v) };
      if (!_same(v, correct) && Math.abs(v - correct) <= Math.max(0.5, 0.1 * correct) + 1e-9) o.near = true;
      return o;
    });
  }
  function _optVal(id) { return (typeof id === 'string' && id.charAt(0) === 'v') ? parseFloat(id.slice(1)) : NaN; }
  function _numOptsOk(q) {
    var seen = {};
    return q.options.every(function(o) {
      var v = _optVal(o.id);
      if (!(v > 0) || seen[v] || o.label !== _bb(v)) return false;
      seen[v] = true; return true;
    });
  }

  // 엔진 상태 만들기(검산): 히어로 자리 + 나머지 5자리, 원장의 투입액과 currentBet 반영
  function _engineState(d, L) {
    if (typeof GameState === 'undefined' || !GameState.buildInitialState || !GameState.applyHeroAction) return null;
    var spec = POS6.filter(function(p) { return p !== d.hero; }).map(function(p) { return { name: 'V_' + p, type: 'TAG', pos: p }; });
    var s = GameState.buildInitialState(spec, d.hero, 4242);
    var nm = function(p) { return p === d.hero ? 'Hero' : 'V_' + p; };
    s.street = d.street; s.playerBets = {};
    POS6.forEach(function(p) { s.playerBets[nm(p)] = L.bets[p] || 0; });
    s.currentBet = L.cb; s.lastRaiseSize = L.lr; s.reopened = true; s.pot = L.pot;
    s.stacks.Hero = 200; s.heroStack = 200;
    return s;
  }

  // 포스트플랍 팟(이전 스트리트까지): 벳 크기와 어울리는 값
  var POST_POTS = [5.5, 6, 6.5, 8, 9, 10, 12, 15, 18, 20, 24, 30, 40];
  function _potFor(bet, rnd) {
    var c = POST_POTS.filter(function(P) { return bet >= 0.25 * P && bet <= 1.25 * P; });
    return c.length ? _pick(c, rnd) : Math.max(2, _half(bet * 2.5));
  }
  function _postBetOf(P, rnd) { return Math.max(1, _half(P * _pick([1 / 3, 1 / 2, 2 / 3, 3 / 4, 1], rnd))); }
  // 100bb 캐시(이 앱 기본 스택): 이전 스트리트 몫(팟 / 남은 인원) + 이번 스트리트 최대 투입(top)이 100bb를 넘는 장면은 내지 않는다
  var STACK_BB = 100;
  function _deepOk(d, top) {
    var share = d.street === 'preflop' ? 0 : (d.prevPot || 0) / Math.max(1, (d.active || POS6).length);
    return share + top <= STACK_BB + 1e-9;
  }
  function _sortPost(arr) { return POST6.filter(function(p) { return arr.indexOf(p) >= 0; }); }

  // ── 장면 빌더(위치 고르기 + 스크립트). 실패하면 null(호출자가 다시 시도) ──
  // 프리플랍 오픈 1회 뒤 히어로 차례. heroIn: 'any' | 'nonblind' | 'SB' | 'BB'
  function _bPreOpen(rnd, O, heroIn, opt) {
    opt = opt || {};
    var h;
    if (heroIn === 'SB') h = 4; else if (heroIn === 'BB') h = 5;
    else if (heroIn === 'nonblind') h = 1 + _int(rnd, 3);
    else h = 1 + _int(rnd, 5);
    var a = _int(rnd, h); // 오프너는 히어로 앞
    if (heroIn === 'SB' && a > 3) return null;
    var script = [], limpers = [];
    if (opt.limp && a >= 1 && rnd() < 0.4) {
      var nl = 1 + _int(rnd, Math.min(2, a));
      if (O < 2.5 + nl) nl = Math.max(0, Math.floor(O - 2.5));
      limpers = _shuffle(POS6.slice(0, a), rnd).slice(0, nl);
      limpers = POS6.filter(function(p) { return limpers.indexOf(p) >= 0; });
    }
    limpers.forEach(function(p) { script.push({ pos: p, act: 'limp' }); });
    script.push({ pos: POS6[a], act: 'raise', to: O });
    if (opt.caller && h - a >= 2 && rnd() < 0.35) script.push({ pos: POS6[a + 1 + _int(rnd, h - a - 1)], act: 'call' });
    var acts = _run('preflop', POS6, script, POS6[h], rnd, 0);
    return acts ? { street: 'preflop', prevPot: 0, actions: acts, hero: POS6[h] } : null;
  }
  // 프리플랍 3벳 장면. role: 'opener'(내가 오픈, 3벳을 맞음) | 'after'(남의 오픈과 3벳 뒤 내 차례) | 'caller'(오픈에 콜한 뒤 3벳)
  function _bPre3bet(rnd, O, T, role) {
    var a, v, h, script;
    if (role === 'opener') {
      a = _int(rnd, 4); v = a + 1 + _int(rnd, 5 - a); h = a;
      script = [{ pos: POS6[a], act: 'raise', to: O }, { pos: POS6[v], act: 'raise', to: T }];
    } else if (role === 'after') {
      a = _int(rnd, 3); v = a + 1 + _int(rnd, 4 - a); h = v + 1 + _int(rnd, 5 - v);
      script = [{ pos: POS6[a], act: 'raise', to: O }, { pos: POS6[v], act: 'raise', to: T }];
    } else {
      a = _int(rnd, 3); h = a + 1 + _int(rnd, 3 - a); v = h + 1 + _int(rnd, 5 - h);
      script = [{ pos: POS6[a], act: 'raise', to: O }, { pos: POS6[h], act: 'call' }, { pos: POS6[v], act: 'raise', to: T },
        { pos: POS6[a], act: rnd() < 0.4 ? 'call' : 'fold' }];
    }
    if (!(h >= 0 && h <= 5 && v <= 5)) return null;
    var acts = _run('preflop', POS6, script, POS6[h], rnd, 0);
    return acts ? { street: 'preflop', prevPot: 0, actions: acts, hero: POS6[h] } : null;
  }
  // 포스트플랍 첫 벳 뒤 히어로 차례(히어로는 벳 뒤 자리이거나 먼저 체크한 자리)
  function _bPostBet(rnd, P, B, street) {
    var act = _sortPost(_shuffle(POST6, rnd).slice(0, rnd() < 0.35 ? 3 : 2));
    var two = _shuffle(act, rnd).slice(0, 2), V = two[0], H = two[1];
    var script = (POST6.indexOf(H) < POST6.indexOf(V) ? [{ pos: H, act: 'check' }] : []).concat([{ pos: V, act: 'bet', to: B }]);
    var acts = _run(street, act, script, H, rnd, 0.35);
    return acts ? { street: street, prevPot: P, active: act, actions: acts, hero: H } : null;
  }
  // 포스트플랍 벳 b와 레이즈 R. role: 'bettor'(내가 벳, 레이즈를 맞음, 체크레이즈 포함) | 'after'(남의 벳과 레이즈 뒤) | 'caller'(벳에 콜한 뒤 레이즈)
  function _bPostRaise(rnd, P, b, R, street, role) {
    var k = role === 'bettor' ? (rnd() < 0.35 ? 3 : 2) : (rnd() < 0.3 ? 4 : 3);
    var act = _sortPost(_shuffle(POST6, rnd).slice(0, k)), script, H;
    if (role === 'bettor') {
      var two = _shuffle(act, rnd).slice(0, 2); H = two[0];
      script = [{ pos: H, act: 'bet', to: b }, { pos: two[1], act: 'raise', to: R }];
    } else {
      var three = _sortPost(_shuffle(act, rnd).slice(0, 3));
      if (role === 'after') {
        H = three[2];
        script = [{ pos: three[0], act: 'bet', to: b }, { pos: three[1], act: 'raise', to: R }];
      } else {
        H = three[1];
        script = [{ pos: three[0], act: 'bet', to: b }, { pos: H, act: 'call' }, { pos: three[2], act: 'raise', to: R },
          { pos: three[0], act: rnd() < 0.4 ? 'call' : 'fold' }];
      }
    }
    var acts = _run(street, act, script, H, rnd, 0.35);
    return acts ? { street: street, prevPot: P, active: act, actions: acts, hero: H } : null;
  }

  // =====================================================================
  // 3. minraise (+ 변형 opensize)
  // =====================================================================
  var MR_OPEN = [2, 2.5, 3, 3.5, 4, 4.5, 5];
  var MR_3B_MUL = [3, 3.5, 4, 4.5];
  var MR_POST_BET = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20];
  var MR_POST_MUL = [2, 2.5, 3, 3.5];

  function _mrKey(cb, lr) { return _num(cb) + '|' + _num(lr); }
  function _mrPickKey(rnd) {
    var u = rnd(), O, T, B, R;
    if (u < 0.08) return [1, 1];
    if (u < 0.33) { O = _pick(MR_OPEN, rnd); return [O, O - 1]; }
    if (u < 0.53) { O = _pick([2, 2.5, 3, 3.5], rnd); T = _half(O * _pick(MR_3B_MUL, rnd)); return [T, T - O]; }
    if (u < 0.75) { B = _pick(MR_POST_BET, rnd); return [B, B]; }
    B = _pick([2, 3, 4, 5, 6, 8, 10], rnd); R = _half(B * _pick(MR_POST_MUL, rnd)); return [R, R - B];
  }
  // (cb, lr)에서 이야기 고르기. 같은 key면 정답(cb + lr)이 같다.
  function _mrBuild(cb, lr, rnd) {
    var prev = _half(cb - lr), kinds = [];
    if (!(cb > 0) || !(lr > 0) || prev < 0) return null;
    if (prev === 0 && cb === 1) kinds.push('pre-first');
    if (prev === 0 && cb >= 1) kinds.push('post-bet');
    if (prev === 1 && cb >= 2) kinds.push('pre-open');
    if (prev >= 2 && prev <= 5 && lr >= prev - 1) kinds.push('pre-3bet');
    if (prev >= 2 && lr >= prev) kinds.push('post-raise');
    if (!kinds.length) return null;
    var kind = _pick(kinds, rnd), d = null, street = _street(rnd);
    if (kind === 'pre-first') {
      var H = _pick(['UTG', 'HJ', 'CO', 'BTN', 'SB'], rnd), acts = _run('preflop', POS6, [], H, rnd, 0);
      d = acts ? { street: 'preflop', prevPot: 0, actions: acts, hero: H } : null;
    } else if (kind === 'post-bet') d = _bPostBet(rnd, _potFor(cb, rnd), cb, street);
    else if (kind === 'pre-open') d = _bPreOpen(rnd, cb, 'any', { limp: true, caller: true });
    else if (kind === 'pre-3bet') d = _bPre3bet(rnd, prev, cb, rnd() < 0.5 ? 'opener' : 'after');
    else d = _bPostRaise(rnd, _potFor(prev, rnd), prev, cb, street, rnd() < 0.5 ? 'bettor' : 'after');
    if (!d) return null;
    d.kind = kind;
    var ans = cb + lr, L = _ledger(d);
    if (!_deepOk(d, ans)) return null;
    var limped = d.actions.some(function(a) { return a.act === 'limp'; });
    // 오답 후보: 앞 2개는 흔한 착각(무조건 2배, 1bb만 더), 나머지는 섞어서 고른다
    var cands = [2 * cb, cb + 1, 2 * cb - lr, ans + lr, ans + 1, ans - 1, cb + lr / 2, 3 * cb];
    var trivial = cb === 1 && lr === 1;
    return {
      type: 'minraise', key: _mrKey(cb, lr), concept: 'actions',
      difficulty: trivial ? 950 : 1050 + (prev > 0 ? 50 : 0) + (kind === 'pre-3bet' || kind === 'post-raise' ? 50 : 0) + (limped ? 50 : 0),
      confidence: 'exact', appDef: false, rated: !trivial, srs: 'srs', ui: 'choice',
      prompt: _storyLine(d) + '\n' + (_heroRaised(d) ? '다시 ' : '') + '레이즈하려면 최소 몇 bb까지 올려야 할까?',
      scene: { potTotal: L.pot, seats: _seats(d), note: STREET_KO[d.street] },
      options: _numOptions(ans, cands, rnd, cb),
      answer: 'v' + _num(ans),
      data: d
    };
  }
  function _mrFromKey(key, rnd) {
    var m = /^(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)$/.exec(String(key || ''));
    if (!m) return null;
    var cb = parseFloat(m[1]), lr = parseFloat(m[2]);
    if (_mrKey(cb, lr) !== key) return null;
    for (var t = 0; t < 40; t++) { var q = _mrBuild(cb, lr, rnd); if (q) return q; }
    return null;
  }

  // opensize: 이 앱 표준 사이즈(engine/ev.js:28-32) = 오픈 2.5bb, SB 3bb, 림퍼 1명당 +1bb
  function _osSize(pos, n) { return (pos === 'SB' ? 3 : 2.5) + n; }
  function _osBuild(pos, n, rnd) {
    var before = POS6.slice(0, Math.min(POS6.indexOf(pos), 4)); // 림프할 수 있는 자리(블라인드 제외, 히어로 앞)
    if (POS6.indexOf(pos) < 0 || n < 0 || n > Math.min(3, before.length) || (pos === 'BB' && n < 1)) return null;
    var sample = _shuffle(before, rnd).slice(0, n);
    var limpers = POS6.filter(function(p) { return sample.indexOf(p) >= 0; });
    var acts = _run('preflop', POS6, limpers.map(function(p) { return { pos: p, act: 'limp' }; }), pos, rnd, 0);
    if (!acts) return null;
    var d = { street: 'preflop', prevPot: 0, actions: acts, hero: pos, kind: 'opensize' };
    var ans = _osSize(pos, n), base = _osSize(pos, 0), other = (pos === 'SB' ? 2.5 : 3) + n;
    var cands = n ? [base, other, ans + 1, ans - 1, 2 * ans, ans + 0.5] : [other, ans + 1, ans + 0.5, 2 * ans, ans + 1.5];
    // 내 뒤 자리는 아직 말하지 않았으므로 '나머지는 폴드'라고 쓰지 않고 앞자리만 말한다(SB면 BB가 아직 남아 있다)
    var folds = acts.some(function(a) { return a.act === 'fold'; });
    var line1 = '프리플랍, 내 자리 ' + pos + _blindTxt(d) + '. ' +
      (n ? _list(limpers) + ' 림프(1bb 콜)' + (folds ? ', 앞의 다른 자리는 폴드.' : '.') : (pos === 'UTG' ? '내가 첫 차례.' : '앞사람은 모두 폴드.'));
    return {
      type: 'minraise', key: 'os|' + pos + '|' + n, concept: 'rfi', difficulty: 1250,
      confidence: 'exact', appDef: true, rated: false, srs: 'srs', ui: 'choice', variant: 'opensize',
      prompt: line1 + '\n이 앱 표준 사이즈로 ' + (n ? '아이솔레이션 레이즈' : '오픈') + '하면 몇 bb까지?',
      scene: { potTotal: _ledger(d).pot, seats: _seats(d), note: '프리플랍, 이 앱 표준 사이즈' },
      options: _numOptions(ans, cands, rnd, 1),
      answer: 'v' + _num(ans),
      data: d
    };
  }
  function _osNext(rnd) {
    var pos = _pick(POS6, rnd), before = Math.min(POS6.indexOf(pos), 4);
    var lo = pos === 'BB' ? 1 : 0, hi = Math.min(3, before);
    var n = (lo === 0 && rnd() < 0.3) ? 0 : Math.max(lo, Math.min(hi, 1 + _int(rnd, Math.max(1, hi))));
    return _osBuild(pos, n, rnd);
  }
  function _osFromKey(key, rnd) {
    var m = /^os\|(UTG|HJ|CO|BTN|SB|BB)\|([0-3])$/.exec(String(key || ''));
    return m ? _osBuild(m[1], parseInt(m[2], 10), rnd) : null;
  }

  function _mrVerify(q) {
    if (!_baseOk(q, 'minraise', 4) || q.srs !== 'srs' || typeof q.key !== 'string' || !_numOptsOk(q)) return false;
    var d = q.data;
    if (!d || !Array.isArray(d.actions) || POS6.indexOf(d.hero) < 0 || !STREET_KO[d.street]) return false;
    var L = _ledger(d), v = _optVal(q.answer);
    if (!L.ok || _same(L.pot, 0) || !_same((q.scene || {}).potTotal, L.pot)) return false;
    if (q.variant === 'opensize') {
      if (d.street !== 'preflop' || !_same(L.cb, 1)) return false;
      var n = d.actions.filter(function(a) { return a.act === 'limp'; }).length;
      // appDef와 rated는 메타 값이라 검산하지 않는다(puzzle-core가 TYPE_META로 다시 채울 수 있다)
      if (q.key !== 'os|' + d.hero + '|' + n) return false;
      var s = _engineState(d, L);
      if (s && typeof EV !== 'undefined' && EV.calcOptions) {
        s.streetBetCount = 0;
        var ev = EV.calcOptions(s, 0.5);
        return _same(ev.raiseHalfAmt, v);
      }
      return _same(v, (d.hero === 'SB' ? 3 : 2.5) + n);
    }
    if (q.key !== _mrKey(L.cb, L.lr) || !_same(v, L.cb + L.lr)) return false;
    var st = _engineState(d, L);
    if (st) {
      var okR = GameState.applyHeroAction(st, 'raise', v), lowR = GameState.applyHeroAction(st, 'raise', v - 0.5);
      if (okR.actionError || !lowR.actionError) return false;
    }
    return true;
  }
  function _mrExplain(q) {
    var d = q.data, L = _ledger(d), v = _optVal(q.answer), line;
    if (q.variant === 'opensize') {
      var n = d.actions.filter(function(a) { return a.act === 'limp'; }).length, base = d.hero === 'SB' ? 3 : 2.5;
      line = '이 앱 표준 사이즈: 오픈 2.5bb(SB는 3bb), 림퍼 1명당 +1bb. ' + (n ? _num(base) + ' + ' + n + ' = ' : '') + _bb(v) + '.';
      if (n) line += ' 림퍼보다 크게 올려 1명만 상대하려는 레이즈예요.';
    } else {
      var prev = _half(L.cb - L.lr);
      if (prev === 0 && d.street === 'preflop') line = 'BB 1bb가 첫 벳이라 2배: 1 + 1 = 최소 2bb까지.';
      else if (prev === 0) line = '첫 벳이면 2배: 현재 벳 ' + _bb(L.cb) + ' + 직전 증분 ' + _bb(L.lr) + '(0 → ' + _num(L.cb) + ') = 최소 ' + _bb(v) + '까지.';
      else line = '레이즈 뒤에는 현재 벳 + 직전 증분: ' + _bb(L.cb) + ' + ' + _bb(L.lr) + '(' + _num(prev) + ' → ' + _num(L.cb) + ') = 최소 ' + _bb(v) + '까지.';
      if (d.actions.some(function(a) { return a.act === 'limp' || a.act === 'call'; })) line += ' 콜과 림프는 증분을 바꾸지 않아요.';
      line += ' 금액은 이번 스트리트 총액 기준.';
    }
    return { line: line, scene: q.scene };
  }

  var minraiseGen = {
    next: function(rnd, opts) {
      rnd = _rng(rnd);
      for (var t = 0; t < 40; t++) {
        var q;
        if (opts && opts.variant === 'opensize') q = _osNext(rnd);
        else { var k = _mrPickKey(rnd); q = _mrBuild(k[0], k[1], rnd); }
        if (q) return q;
      }
      return null;
    },
    fromKey: function(key, rnd) {
      rnd = _rng(rnd);
      if (/^os\|/.test(String(key || ''))) { for (var t = 0; t < 20; t++) { var q = _osFromKey(key, rnd); if (q) return q; } return null; }
      return _mrFromKey(key, rnd);
    },
    verify: function(q) { try { return _mrVerify(q); } catch (e) { return false; } },
    explain: _mrExplain,
    ready: function() { return true; }
  };

  // =====================================================================
  // 4. tocall
  // =====================================================================
  // 상황 버킷(key). heroBet이 0인 버킷(open, post-bet)은 자명 문항으로 rated:false
  var TC_KINDS = ['open', 'sb', 'bb', '3bet', 'squeeze', 'post-bet', 'post-raise', 'post-callraise'];
  var TC_W = [0.12, 0.14, 0.16, 0.14, 0.1, 0.1, 0.14, 0.1];
  var TC_DIFF = { 'open': 950, 'sb': 1000, 'bb': 1000, '3bet': 1050, 'squeeze': 1100, 'post-bet': 950, 'post-raise': 1050, 'post-callraise': 1100 };

  function _tcPickKind(rnd) {
    var u = rnd(), acc = 0;
    for (var i = 0; i < TC_KINDS.length; i++) { acc += TC_W[i]; if (u < acc) return TC_KINDS[i]; }
    return TC_KINDS[TC_KINDS.length - 1];
  }
  function _openSize(rnd, n) { return n ? _half(2.5 + n + _pick([0, 0.5, 1], rnd)) : _pick([2, 2.5, 3, 3.5, 4], rnd); }

  // 반환 {d, ans}. ans는 버킷별 식(생성 경로)
  function _tcStory(kind, rnd) {
    var d = null, ans, O, T, P, B, R, street = _street(rnd);
    if (kind === 'open') { O = _openSize(rnd, 0); d = _bPreOpen(rnd, O, 'nonblind', { caller: true }); ans = O; }
    else if (kind === 'sb' || kind === 'bb') {
      var n = rnd() < 0.35 ? 1 + _int(rnd, 2) : 0;
      O = _openSize(rnd, n);
      d = _bPreOpen(rnd, O, kind === 'sb' ? 'SB' : 'BB', { limp: n > 0, caller: true });
      ans = O - (kind === 'sb' ? 0.5 : 1);
    } else if (kind === '3bet' || kind === 'squeeze') {
      O = _pick([2, 2.5, 3], rnd); T = _half(O * _pick(MR_3B_MUL, rnd));
      d = _bPre3bet(rnd, O, T, kind === '3bet' ? 'opener' : 'caller'); ans = T - O;
    } else if (kind === 'post-bet') {
      P = _pick(POST_POTS, rnd); B = _postBetOf(P, rnd); d = _bPostBet(rnd, P, B, street); ans = B;
    } else {
      P = _pick(POST_POTS, rnd); B = _postBetOf(P, rnd); R = _half(B * _pick([2.5, 3, 3.5], rnd));
      d = _bPostRaise(rnd, P, B, R, street, kind === 'post-raise' ? 'bettor' : 'caller'); ans = R - B;
    }
    if (!d || !_deepOk(d, _ledger(d).cb)) return null;
    d.kind = kind;
    return { d: d, ans: ans };
  }
  function _tcBuild(kind, rnd) {
    var r = null;
    for (var t = 0; t < 40 && !r; t++) r = _tcStory(kind, rnd);
    if (!r) return null;
    var d = r.d, ans = r.ans, L = _ledger(d), hb = L.bets[d.hero];
    var cands = [L.cb, L.pot, L.cb + hb, ans + 0.5, ans - 0.5, ans + 1, ans - 1, L.pot - L.cb, ans * 2];
    if (_same(hb, 0)) cands = [L.pot, ans + 1, ans - 1, ans * 2, L.pot - L.cb, ans + 0.5, ans - 0.5];
    return {
      type: 'tocall', key: kind, concept: 'actions', difficulty: TC_DIFF[kind],
      confidence: 'exact', appDef: false, rated: !_same(hb, 0), srs: 'srs', ui: 'choice',
      prompt: _storyLine(d) + '\n콜하려면 몇 bb를 더 내야 할까? (팟 ' + _bb(L.pot) + ', 모든 벳 포함)',
      scene: { potTotal: L.pot, seats: _seats(d), note: STREET_KO[d.street] },
      options: _numOptions(ans, cands, rnd, 0),
      answer: 'v' + _num(ans),
      data: d
    };
  }
  function _tcVerify(q) {
    if (!_baseOk(q, 'tocall', 4) || q.srs !== 'srs' || TC_KINDS.indexOf(q.key) < 0 || !_numOptsOk(q)) return false;
    var d = q.data;
    if (!d || d.kind !== q.key || !Array.isArray(d.actions) || POS6.indexOf(d.hero) < 0 || !STREET_KO[d.street]) return false;
    if ((d.street === 'preflop') !== (['open', 'sb', 'bb', '3bet', 'squeeze'].indexOf(q.key) >= 0)) return false;
    var L = _ledger(d), v = _optVal(q.answer);
    if (!L.ok || !_same((q.scene || {}).potTotal, L.pot)) return false;
    var exp = L.cb - L.bets[d.hero];
    if (!(exp > 0) || !_same(v, exp)) return false;
    if (q.prompt.indexOf('(팟 ' + _bb(L.pot) + ',') < 0) return false;
    var s = _engineState(d, L);
    if (s) {
      var r = GameState.applyHeroAction(s, 'call', 0);
      if (r.actionError || !_same(_r2(s.stacks.Hero - r.stacks.Hero), v) || !_same(r.pot, _r2(L.pot + v))) return false;
    }
    return true;
  }
  function _tcExplain(q) {
    var d = q.data, L = _ledger(d), hb = L.bets[d.hero], v = _optVal(q.answer), line;
    if (_same(hb, 0)) line = '이번 스트리트에 내가 낸 칩이 없으니 가장 큰 벳 ' + _bb(L.cb) + '를 그대로 맞춰요.';
    else {
      var why = (d.street === 'preflop' && !_heroActed(d)) ? '(' + d.hero + ' 블라인드)' : '';
      line = '콜 금액 = 가장 큰 벳 ' + _bb(L.cb) + ' - 이번 스트리트에 내가 이미 낸 ' + _bb(hb) + why + ' = ' + _bb(v) + '.';
    }
    line += ' 팟 크기와는 상관없어요.';
    return { line: line, scene: { potTotal: L.pot, toCall: v, seats: _seats(d), note: STREET_KO[d.street] } };
  }

  var tocallGen = {
    next: function(rnd) {
      rnd = _rng(rnd);
      for (var t = 0; t < 10; t++) { var q = _tcBuild(_tcPickKind(rnd), rnd); if (q) return q; }
      return null;
    },
    fromKey: function(key, rnd) { return TC_KINDS.indexOf(key) >= 0 ? _tcBuild(key, _rng(rnd)) : null; },
    verify: function(q) { try { return _tcVerify(q); } catch (e) { return false; } },
    explain: _tcExplain,
    ready: function() { return true; }
  };

  // ── 등록 ──
  if (typeof Drills !== 'undefined' && Drills.keyPolicy) { Drills.keyPolicy('showdown', 'once'); Drills.keyPolicy('order', 'once'); }
  if (typeof Puzzles !== 'undefined' && Puzzles.register) {
    Puzzles.register('showdown', showdownGen, { stage: 1, group: 'other', concept: 'showdown' });
    Puzzles.register('order', orderGen, { stage: 1, group: 'other', concept: 'order' });
    Puzzles.register('minraise', minraiseGen, { stage: 1, group: 'other', concept: 'actions' });
    Puzzles.register('tocall', tocallGen, { stage: 1, group: 'other', concept: 'actions' });
  }
  var api = { showdown: showdownGen, order: orderGen, minraise: minraiseGen, tocall: tocallGen, TC_KINDS: TC_KINDS, _ind7: _ind7 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
