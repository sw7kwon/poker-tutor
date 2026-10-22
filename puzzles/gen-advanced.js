// puzzles/gen-advanced.js (채우는 작업: 클라우드 J 퍼즐 유형 4종. 지시문 docs/cloud-tasks/J.md)
// 유형 4종(정본 confidence, rated, srs, base는 puzzles/puzzle-core.js TYPE_META):
//   blockers         블로커 콤보 수(exact, rated, srs, S4 s4-08 뒤). 보드와 내 손이 주어졌을 때 상대가 가질 수 있는
//                    메이드 핸드 콤보(플러시 이상, 셋, 오버페어)가 몇 개 남는지(ask 'left'), 내 손이 몇 개를 지우는지(ask 'cut').
//                    상대 손은 "남은 카드의 모든 2장 조합"으로 둔다(레인지 가정 없음). 생성 = 랭크와 무늬별 남은 카드 공식(C(k,2) 합),
//                    verify = 남은 카드 2장 조합 전수 열거(HandEval.evaluateIdx 정수 경로, 족보 종류와 보드 랭크로 분류).
//   sprplan          SPR 구간별 계획(이 앱의 분류 기준, appDef, rated false, srs, S3 s3-09). SPR = 남은 유효 스택 ÷ 플랍 팟은 엔진 계산이고
//                    구간(낮음 4 미만, 중간 4 이상 10 미만, 높음 10 이상)과 구간별 계획은 이 앱이 정한 규칙(SPR_BANDS).
//                    생성 = 나눗셈으로 SPR을 구해 구간, verify = 곱셈 비교(스택 < 팟 x 4, 스택 < 팟 x 10)로 구간을 다시 정한다.
//   bluffratio-river 리버 벳 사이즈별 밸류:블러프 비율(exact, rated, srs, S4 s4-06 뒤). 상대 콜이 딱 본전이 되는 비율.
//                    밸류:블러프 = (팟+벳):벳 = 1 ÷ 알파(알파 = 벳 ÷ (팟+벳)), 팟은 벳 전 팟. variant 'ratio'(비율 보기)와
//                    'combos'(밸류 콤보 V개일 때 블러프 최대 콤보 수 = V x 벳 ÷ (팟+벳), 정수로 떨어지는 조합만 낸다).
//                    생성 = 알파 공식, verify = 상대 콜 EV(블러프 몫 f의 함수)가 0이 되는 f를 이분 탐색으로 찾아 (1-f):f로 대조.
//   bankroll         바이인 수와 파산 위험 구간(exact, rated, srs, S6 s6-06 뒤). 커리어 레슨 c-01(뱅크롤 관리)과 같은 식:
//                    파산 위험 = exp(-2 x 승률 x 뱅크롤 ÷ 표준편차²), 승률 bb/100, 표준편차 90bb/100(이 앱 가정, gen-math variance와 같음),
//                    뱅크롤 = 바이인 수 x 100bb. variant 'risk'(바이인 수 → 위험 구간 4지: 1% 미만, 1~5%, 5~20%, 20% 이상)와
//                    'buyins'(위험 상한 → 필요한 최소 바이인 수 = 올림(-ln(위험) x 표준편차² ÷ (2 x 승률) ÷ 100)).
//                    생성 = 지수 공식, verify = 로그로 뒤집은 문턱 뱅크롤(-ln(경계) x 표준편차² ÷ (2 x 승률))과 비교.
// 계약: puzzles/puzzle-core.js 머리 주석 C1(생성기), C2(문항), C3(장면). 각 생성기는 next, verify(독립 경로), explain, fromKey, ready.
// 규칙: 로드 시 DOM, window, localStorage 접근 없음. 즉석 몬테카를로 없음. HandEval, Puzzles는 호출 시점에 typeof 가드.
//   문구는 한국어 해요체, 가운뎃점과 긴줄표 없음. 숫자 보기는 정답 위치를 먼저 뽑아 보기 위치로 답이 새지 않게 한다.
var GenAdvanced = (function() {
  var RANKS = '23456789TJQKA';
  var SUITS = 'shdc';
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var SUIT_KOR = { s: '스페이드', h: '하트', d: '다이아', c: '클럽' };
  var IDS = ['a', 'b', 'c', 'd'];
  var MAX_TRY = 20;

  // ── 공통 도우미 ──
  function _rnd(r) { return typeof r === 'function' ? r : Math.random; }
  function _int(n, rnd) { return Math.floor(rnd() * n) % n; }
  function _pick(arr, rnd) { return arr[_int(arr.length, rnd)]; }
  function _shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = _int(i + 1, rnd); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function _num(x) { var v = Math.round(x * 10) / 10; return (v % 1 === 0) ? String(v) : v.toFixed(1); }
  function _pct0(p) { return Math.round(p * 100) + '%'; }
  function _close(a, b) { return Math.abs(a - b) < 1e-9; }
  function _f1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function _hasEval() { return typeof HandEval !== 'undefined' && HandEval && typeof HandEval.evaluateIdx === 'function'; }
  function _card(s) {
    if (typeof s !== 'string' || s.length !== 2) return null;
    if (RANKS.indexOf(s[0]) < 0 || SUITS.indexOf(s[1]) < 0) return null;
    return { rank: s[0], suit: s[1] };
  }
  function _cardsOk(list) {
    if (!Array.isArray(list)) return false;
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      if (!_card(list[i]) || seen[list[i]]) return false;
      seen[list[i]] = true;
    }
    return true;
  }
  function _int52(cs) { return RANKS.indexOf(cs[0]) * 4 + SUITS.indexOf(cs[1]); }
  function _rankVal(ch) { return RANKS.indexOf(ch) + 2; }
  function _rankKor(ch) { return ch === 'T' ? '10' : ch; }
  function _sym(list, sep) {
    return (list || []).map(function(s) { return _rankKor(s[0]) + (SUIT_SYM[s[1]] || s[1]); }).join(sep == null ? ' ' : sep);
  }
  function _sortHand(h) {
    return h.slice().sort(function(a, b) { return _rankVal(b[0]) - _rankVal(a[0]) || SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]); });
  }
  function _c2(k) { return k < 2 ? 0 : k * (k - 1) / 2; }
  function _gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }

  function _base(type, extra) {
    var m = META[type];
    var q = {
      type: type, key: null, concept: m.concept, difficulty: BASE[type], confidence: 'exact', appDef: m.appDef === true,
      rated: m.appDef !== true, srs: 'srs', prompt: '', scene: null, options: [], answer: null, ui: 'choice', data: {}
    };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) q[k] = extra[k];
    return q;
  }

  function _commonOk(q, type) {
    var m = META[type];
    if (!q || q.type !== type || q.confidence !== 'exact' || q.srs !== 'srs' || q.appDef !== (m.appDef === true)) return false;
    if (typeof q.key !== 'string' || !q.key) return false;
    if (typeof q.rated !== 'boolean' || typeof q.difficulty !== 'number') return false;
    if (m.appDef === true && q.rated !== false) return false;
    if (typeof q.prompt !== 'string' || !q.prompt || q.prompt.split('\n').length > 2) return false;
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return false;
    var ids = {}, labels = {}, hasAns = false;
    for (var i = 0; i < q.options.length; i++) {
      var o = q.options[i];
      if (!o || typeof o.id !== 'string' || typeof o.label !== 'string' || !o.label) return false;
      if (ids[o.id] || labels[o.label]) return false;
      ids[o.id] = true; labels[o.label] = true;
      if (o.id === q.answer) hasAns = true;
      if (o.near && o.id === q.answer) return false;
    }
    return hasAns && !!q.data;
  }
  function _answerLabel(q) {
    for (var i = 0; i < q.options.length; i++) if (q.options[i].id === q.answer) return q.options[i].label;
    return null;
  }
  function _retry(build, verify) {
    for (var i = 0; i < MAX_TRY; i++) {
      var q = build(i);
      if (q && verify(q)) return q;
    }
    return null;
  }

  // 보기 섞기: correct = {v, label}, wrongs = [{v, label, near?}] → a~d
  function _options(correct, wrongs, rnd) {
    var order = _shuffle([correct].concat(wrongs), rnd);
    var options = [], values = {}, answer = null;
    for (var i = 0; i < order.length; i++) {
      var o = order[i], id = IDS[i];
      var opt = { id: id, label: o.label };
      if (o.near) opt.near = true;
      options.push(opt);
      values[id] = o.v;
      if (o === correct) answer = id;
    }
    return { options: options, answer: answer, values: values };
  }
  // 수치형 오답: 후보 순서대로 라벨이 안 겹치고 정답과 minGap 이상 떨어진 것 need개. nearGap 안이면 near
  function _wrongs(c, cands, fmt, minGap, need, nearGap, lo, hi) {
    var out = [], seen = {};
    seen[fmt(c)] = true;
    for (var i = 0; i < cands.length && out.length < need; i++) {
      var v = cands[i];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      if (lo != null && v < lo) continue;
      if (hi != null && v > hi) continue;
      var lab = fmt(v);
      if (seen[lab] || Math.abs(v - c) < minGap) continue;
      seen[lab] = true;
      var w = { v: v, label: lab };
      if (nearGap && Math.abs(v - c) <= nearGap) w.near = true;
      out.push(w);
    }
    return out;
  }
  // 정수 4지(정답 위치를 먼저 뽑는다): 정답 아래 k개, 위 3-k개. 서로 2 이상 떨어지고 0 이상, 오름차순.
  // 작은 정답(블로커는 대개 0~10)이 늘 맨 아래 보기가 되지 않게 k를 먼저 고르고, 그 위치가 불가능하면 줄인다.
  function _intOptions(ans, extras, rnd, wantK, unit) {
    var kMax = Math.min(3, Math.floor(ans / 2));
    var k = typeof wantK === 'number' ? Math.min(wantK, kMax) : _int(kMax + 1, rnd);
    var cands = (extras || []).concat(_shuffle([-6, -4, -3, -2, 2, 3, 4, 6, 8, -8, 10, 12], rnd).map(function(o) { return ans + o; }));
    function fill(side, want) {
      var got = [];
      function ok(v) {
        if (typeof v !== 'number' || v < 1 || v !== Math.round(v) || Math.abs(v - ans) < 2) return false;
        if (side < 0 ? v >= ans : v <= ans) return false;
        for (var j = 0; j < got.length; j++) if (Math.abs(got[j] - v) < 2) return false;
        return true;
      }
      for (var i = 0; i < cands.length && got.length < want; i++) if (ok(cands[i])) got.push(cands[i]);
      var step = 2;
      while (got.length < want && step < 60) { var v2 = ans + side * step; if (ok(v2)) got.push(v2); step++; }
      return got;
    }
    var below = fill(-1, k), above = fill(1, 3 - k);
    if (below.length + above.length < 3) return null;
    var all = below.concat([ans], above).sort(function(a, b) { return a - b; });
    var options = [], answer = null;
    all.forEach(function(v, i) {
      var o = { id: IDS[i], label: v + unit };
      if (v !== ans && Math.abs(v - ans) <= 2) o.near = true;
      if (v === ans) answer = IDS[i];
      options.push(o);
    });
    return { options: options, answer: answer };
  }

  // ═══════════════════ 1. blockers ═══════════════════
  // 카테고리: flush(플러시 이상, 보드에 같은 무늬 딱 3장), set(셋, 보드 랭크와 같은 포켓 페어), overpair(보드 최고 랭크보다 높은 포켓 페어)
  // 생성 공식(남은 카드 k): flush = C(k_suit, 2), set = Σ C(k_r, 2)(보드 랭크 r), overpair = Σ C(k_r, 2)(보드 최고보다 높은 r)
  var BLK_CATS = ['flush', 'set', 'overpair'];
  var BLK_KOR = { flush: '플러시(이상)', set: '셋', overpair: '오버페어' };
  var BLK_ASKS = ['left', 'cut'];
  var STREET_KOR = { 3: '플랍', 4: '턴', 5: '리버' };

  function _rankCounts(dead) {
    var k = {};
    for (var i = 0; i < 13; i++) k[RANKS[i]] = 4;
    dead.forEach(function(c) { k[c[0]]--; });
    return k;
  }
  function _suitCount(dead, s) { var n = 13; dead.forEach(function(c) { if (c[1] === s) n--; }); return n; }
  function _boardRanks(board) {
    var seen = {}, out = [];
    board.forEach(function(c) { if (!seen[c[0]]) { seen[c[0]] = true; out.push(c[0]); } });
    return out;
  }
  function _flushSuit(board) {
    var cnt = {};
    board.forEach(function(c) { cnt[c[1]] = (cnt[c[1]] || 0) + 1; });
    for (var s in cnt) if (cnt[s] === 3) return s;
    return null;
  }
  // 공식 경로: 보드만 데드일 때(base)와 보드 + 내 손일 때(left)
  function _blkCount(cat, board, dead) {
    var kr = _rankCounts(dead), n = 0;
    if (cat === 'flush') {
      var fs = _flushSuit(board);
      return fs ? _c2(_suitCount(dead, fs)) : null;
    }
    if (cat === 'set') {
      _boardRanks(board).forEach(function(r) { n += _c2(kr[r]); });
      return n;
    }
    var top = Math.max.apply(null, board.map(function(c) { return _rankVal(c[0]); }));
    for (var i = 0; i < 13; i++) if (_rankVal(RANKS[i]) > top) n += _c2(kr[RANKS[i]]);
    return n;
  }
  function _boardOk(cat, board) {
    if (!_cardsOk(board) || board.length < 3 || board.length > 5) return false;
    var ranks = _boardRanks(board);
    if (ranks.length !== board.length) return false;                     // 페어 보드 제외(셋과 풀하우스, 쿼드가 섞인다)
    var cnt = {};
    board.forEach(function(c) { cnt[c[1]] = (cnt[c[1]] || 0) + 1; });
    var maxSuit = 0;
    for (var s in cnt) if (cnt[s] > maxSuit) maxSuit = cnt[s];
    if (cat === 'flush') return maxSuit === 3;                             // 같은 무늬 딱 3장
    if (maxSuit >= 3) return false;                                       // 셋과 오버페어 보드는 플러시 불가(3장 이상 같은 무늬 없음)
    // 스트레이트 가능 보드도 뺀다(포켓 페어가 스트레이트를 완성하면 셋/오버페어가 아니다): 보드 랭크 중 어느 셋도 한 창(5칸) 안에 없게
    var vals = board.map(function(c) { return _rankVal(c[0]); }).sort(function(a, b) { return a - b; });
    var withA = vals.indexOf(14) >= 0 ? [1].concat(vals) : vals;
    for (var i = 0; i + 2 < withA.length; i++) if (withA[i + 2] - withA[i] <= 4) return false;
    if (cat === 'overpair') return Math.max.apply(null, vals) <= 12;        // 보드 최고가 Q 이하(K, A 오버페어가 있게)
    return true;
  }
  function _dealBoard(cat, n, rnd) {
    for (var t = 0; t < 60; t++) {
      var deck = [];
      for (var i = 0; i < 13; i++) for (var s = 0; s < 4; s++) deck.push(RANKS[i] + SUITS[s]);
      deck = _shuffle(deck, rnd);
      var board = deck.slice(0, n);
      if (cat === 'flush') {
        var fs = _pick(SUITS.split(''), rnd);
        var same = deck.filter(function(c) { return c[1] === fs; }).slice(0, 3);
        var other = deck.filter(function(c) { return c[1] !== fs; }).slice(0, n - 3);
        board = _shuffle(same.concat(other), rnd);
      }
      if (_boardOk(cat, board)) return board;
    }
    return null;
  }
  // 내 손: 그 카테고리의 블로커를 want장(0~2) 들게 뽑는다. 내 손이 그 카테고리를 직접 완성하는 조합(포켓 페어로 셋, 플러시 2장)은 뺀다
  function _dealHero(cat, board, want, rnd) {
    var dead = {};
    board.forEach(function(c) { dead[c] = true; });
    var fs = cat === 'flush' ? _flushSuit(board) : null;
    var top = Math.max.apply(null, board.map(function(c) { return _rankVal(c[0]); }));
    var br = _boardRanks(board);
    function isBlocker(c) {
      if (cat === 'flush') return c[1] === fs;
      if (cat === 'set') return br.indexOf(c[0]) >= 0;
      return _rankVal(c[0]) > top;
    }
    var rest = [];
    for (var i = 0; i < 13; i++) for (var s = 0; s < 4; s++) { var c = RANKS[i] + SUITS[s]; if (!dead[c]) rest.push(c); }
    var bl = _shuffle(rest.filter(isBlocker), rnd), nb = _shuffle(rest.filter(function(c) { return !isBlocker(c); }), rnd);
    for (var t = 0; t < 40; t++) {
      var hero;
      if (want === 2) hero = [bl[0], bl[1]];
      else if (want === 1) hero = [bl[0], nb[0]];
      else hero = [nb[0], nb[1]];
      if (!hero[0] || !hero[1]) return null;
      if (hero[0][0] === hero[1][0]) { bl = _shuffle(bl, rnd); nb = _shuffle(nb, rnd); continue; }   // 포켓 페어 제외(셋/오버페어를 내가 든다)
      if (cat === 'flush' && want === 2) { bl = _shuffle(bl, rnd); continue; }                       // 플러시 2장은 내가 플러시
      return _sortHand(hero);
    }
    return null;
  }
  function _blkKey(cat, ask, want) { return cat + '|' + ask + '|' + want; }
  // 내 손의 블로커 장수: 플러시는 0~1(2장이면 내가 플러시), 셋과 오버페어는 0~2. 지우는 수를 물을 때는 1장 이상
  function _wantOk(cat, ask, want) {
    if (!(want >= 0 && want <= 2) || want !== Math.round(want)) return false;
    if (ask === 'cut' && want < 1) return false;
    if (cat === 'flush' && want > 1) return false;
    return true;
  }
  function _blkPrompt(d) {
    var st = STREET_KOR[d.board.length];
    if (d.ask === 'left') return st + '. 상대 손은 남은 카드의 아무 2장. 내 손을 빼면 상대의 ' + BLK_KOR[d.cat] + ' 조합은 몇 개 남을까?';
    return st + '. 상대 손은 남은 카드의 아무 2장. 내 손이 지우는(블로커) 상대 ' + BLK_KOR[d.cat] + ' 조합은 몇 개?';
  }
  function _buildBlk(cat, ask, want, rnd, wantK) {
    if (!_wantOk(cat, ask, want)) return null;
    var n = _pick([3, 4, 5], rnd);
    var board = _dealBoard(cat, n, rnd);
    if (!board) return null;
    var hero = _dealHero(cat, board, want, rnd);
    if (!hero) return null;
    var base = _blkCount(cat, board, board), left = _blkCount(cat, board, board.concat(hero));
    if (base == null || left == null) return null;
    var cut = base - left;
    if (ask === 'cut' && cut < 1) return null;
    if (ask === 'left' && left < 1 && cut < 1) return null;
    var ans = ask === 'left' ? left : cut;
    // 흔한 함정: 내 손을 잊은 값(base), 반대 물음(left/cut), 순서쌍으로 센 값(2배), 카드 수 자체
    var fs = cat === 'flush' ? _flushSuit(board) : null;
    var extras = ask === 'left' ? [base, cut, left * 2] : [left, base, cut * 2];
    if (fs) extras.push(_suitCount(board.concat(hero), fs));
    var op = _intOptions(ans, extras, rnd, wantK, '개');
    if (!op) return null;
    var d = { cat: cat, ask: ask, want: want, board: board, hero: hero, base: base, left: left, cut: cut, suit: fs };
    return _base('blockers', {
      key: _blkKey(cat, ask, want), variant: cat,
      difficulty: BASE.blockers + (cat === 'flush' ? 0 : 50) + (ask === 'cut' ? 50 : 0),
      prompt: _blkPrompt(d), scene: { hero: hero, board: board, note: '상대 손: 남은 카드의 모든 2장 조합' },
      options: op.options, answer: op.answer, data: d
    });
  }
  // verify 경로: 남은 카드 2장 조합 전수 열거 + evaluateIdx(정수)로 족보 분류. set과 overpair는 포켓 페어 판정 + 랭크 비교로 센다
  function _blkEnum(cat, board, dead) {
    var dm = {}, rest = [], bi = board.map(_int52);
    dead.forEach(function(c) { dm[c] = true; });
    for (var i = 0; i < 52; i++) { var cs = RANKS[i >> 2] + SUITS[i & 3]; if (!dm[cs]) rest.push(i); }
    var top = Math.max.apply(null, board.map(function(c) { return _rankVal(c[0]); }));
    var br = {};
    board.forEach(function(c) { br[c[0]] = true; });
    var n = 0;
    for (var a = 0; a < rest.length; a++) for (var b = a + 1; b < rest.length; b++) {
      var ra = RANKS[rest[a] >> 2], rb = RANKS[rest[b] >> 2];
      if (cat === 'flush') {
        var ev = HandEval.evaluateIdx(bi.concat([rest[a], rest[b]]));
        if (ev && ev.type <= 5) n++;                                     // 5 = 플러시, 더 작으면 그 이상
      } else if (ra === rb) {
        if (cat === 'set' ? !!br[ra] : _rankVal(ra) > top) {
          var ev2 = HandEval.evaluateIdx(bi.concat([rest[a], rest[b]]));
          if (ev2 && ev2.type === (cat === 'set' ? 7 : 9)) n++;        // 셋은 트립스(7), 오버페어는 원페어(9)여야 한다
        }
      }
    }
    return n;
  }
  function _verifyBlk(q) {
    if (!_commonOk(q, 'blockers') || q.options.length !== 4 || !_hasEval()) return false;
    var d = q.data;
    if (BLK_CATS.indexOf(d.cat) < 0 || BLK_ASKS.indexOf(d.ask) < 0 || !_wantOk(d.cat, d.ask, d.want)) return false;
    if (!Array.isArray(d.hero) || d.hero.length !== 2 || !_boardOk(d.cat, d.board) || !_cardsOk(d.board.concat(d.hero))) return false;
    if (!q.scene || JSON.stringify(q.scene.hero) !== JSON.stringify(d.hero) || JSON.stringify(q.scene.board) !== JSON.stringify(d.board)) return false;
    if (q.key !== _blkKey(d.cat, d.ask, d.want) || q.prompt !== _blkPrompt(d)) return false;
    if (d.hero[0][0] === d.hero[1][0]) return false;
    var fs = _flushSuit(d.board), top = Math.max.apply(null, d.board.map(function(c) { return _rankVal(c[0]); })), br = _boardRanks(d.board);
    var held = d.hero.filter(function(c) { return d.cat === 'flush' ? c[1] === fs : d.cat === 'set' ? br.indexOf(c[0]) >= 0 : _rankVal(c[0]) > top; }).length;
    if (held !== d.want) return false;
    var base = _blkEnum(d.cat, d.board, d.board), left = _blkEnum(d.cat, d.board, d.board.concat(d.hero));
    if (base !== d.base || left !== d.left || base - left !== d.cut) return false;
    var ans = d.ask === 'left' ? left : base - left;
    if (d.ask === 'cut' && ans < 1) return false;
    if (_answerLabel(q) !== ans + '개') return false;
    var vals = q.options.map(function(o) { return parseInt(o.label, 10); });
    for (var i = 0; i < vals.length; i++) {
      if (!/^\d+개$/.test(q.options[i].label) || vals[i] < 0) return false;
      if (i && vals[i] - vals[i - 1] < 2) return false;
    }
    return true;
  }
  function _blkPartsLine(d) {
    var dead = d.board.concat(d.hero), kr = _rankCounts(dead), kb = _rankCounts(d.board);
    if (d.cat === 'flush') {
      var k0 = _suitCount(d.board, d.suit), k = _suitCount(dead, d.suit), sk = SUIT_KOR[d.suit];
      var first = sk + ' 남은 ' + k0 + '장 중 2장 = ' + k0 + '×' + (k0 - 1) + '÷2 = ' + _c2(k0) + '개';
      if (!d.want) return first + ', 내 손에 ' + sk + '가 없어 그대로예요';
      return first + ', 내 손의 ' + sk + ' 1장을 빼면 ' + k + '장 중 2장 = ' + _c2(k) + '개';
    }
    var ranks = d.cat === 'set' ? _boardRanks(d.board) : RANKS.split('').filter(function(r) { return _rankVal(r) > Math.max.apply(null, d.board.map(function(c) { return _rankVal(c[0]); })); });
    var parts = ranks.map(function(r) { return _rankKor(r) + _rankKor(r) + ' ' + _c2(kb[r]) + (kr[r] !== kb[r] ? '→' + _c2(kr[r]) : ''); });
    return parts.join(', ') + '(남은 카드 k장이면 k×(k-1)÷2)';
  }
  function _explainBlk(q) {
    var d = q.data;
    var head = d.cut
      ? BLK_KOR[d.cat] + ' 조합은 ' + d.base + '개, 내 손 ' + _sym(d.hero, '') + ' 카드가 든 ' + d.cut + '개를 빼면 ' + d.left + '개가 남아요. '
      : BLK_KOR[d.cat] + ' 조합은 ' + d.base + '개, 내 손 ' + _sym(d.hero, '') + '에는 블로커가 없어 그대로 ' + d.left + '개예요. ';
    return { line: head + _blkPartsLine(d) + '.\n상대 손을 남은 카드의 아무 2장으로 본 수예요. 내 카드가 든 조합은 상대가 가질 수 없어요(블로커).', scene: q.scene };
  }
  var genBlockers = {
    title: '블로커 콤보 수',
    next: function(rnd, opts) {
      rnd = _rnd(rnd); opts = opts || {};
      if (!_hasEval()) return null;
      var cat = BLK_CATS.indexOf(opts.variant) >= 0 ? opts.variant : null;
      return _retry(function() {
        var c = cat || _pick(BLK_CATS, rnd), ask = rnd() < 0.5 ? 'left' : 'cut';
        var top = c === 'flush' ? 1 : 2;
        var want = ask === 'cut' ? 1 + _int(top, rnd) : _int(top + 1, rnd);
        return _buildBlk(c, ask, want, rnd, _int(4, rnd));
      }, _verifyBlk);
    },
    fromKey: function(key, rnd) {
      rnd = _rnd(rnd);
      var m = /^(flush|set|overpair)\|(left|cut)\|([012])$/.exec(String(key));
      if (!m || !_hasEval()) return null;
      var want = parseInt(m[3], 10);
      if (!_wantOk(m[1], m[2], want)) return null;
      return _retry(function() { return _buildBlk(m[1], m[2], want, rnd, _int(4, rnd)); }, _verifyBlk);
    },
    verify: _verifyBlk,
    explain: _explainBlk,
    ready: _hasEval
  };

  // ═══════════════════ 2. sprplan(이 앱의 분류 기준) ═══════════════════
  // 이 앱이 정한 SPR 구간과 계획(s3-09 레슨의 참고 통념을 구간 규칙으로 고정한 것). 경계는 4와 10, 아래쪽 포함.
  var SPR_BANDS = [
    { id: 'low', max: 4, name: '낮음(4 미만)', plan: '탑페어, 오버페어로도 올인까지 간다' },
    { id: 'mid', max: 10, name: '중간(4 이상 10 미만)', plan: '탑페어는 한두 번 벳하고 큰 레이즈에는 조심, 올인은 투페어 이상' },
    { id: 'high', max: Infinity, name: '높음(10 이상)', plan: '올인은 셋, 스트레이트, 플러시급, 탑페어는 팟을 키우지 않는다' }
  ];
  var SPR_POTS = [4, 5, 5.5, 6, 6.5, 7, 8, 9, 10, 12, 13, 15, 18, 20, 24, 30, 36, 40];
  var SPR_STACKS = [20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 95, 97, 100, 120, 150, 180, 200];
  var SPR_MARGIN = 0.15;   // 경계(4, 10)와 SPR 차이가 이보다 작으면 내지 않는다(반올림 표기와 구간이 어긋나 보이지 않게)
  function _bandIdx(spr) { for (var i = 0; i < SPR_BANDS.length; i++) if (spr < SPR_BANDS[i].max) return i; return SPR_BANDS.length - 1; }
  function _sprPrompt(d) { return '플랍 팟 ' + _num(d.pot) + 'bb, 남은 유효 스택 ' + _num(d.eff) + 'bb. 이 앱 기준 SPR 구간과 계획은?'; }
  function _buildSprPlan(eff, pot, rnd) {
    if (!(eff > 0 && pot > 0)) return null;
    var spr = eff / pot;
    if (Math.abs(spr - 4) < SPR_MARGIN || Math.abs(spr - 10) < SPR_MARGIN) return null;
    var bi = _bandIdx(spr);
    // 구간은 순서가 있는 보기라 섞지 않는다(a = 낮음). near = 이웃 구간
    var options = SPR_BANDS.map(function(b, i) {
      var o = { id: IDS[i], label: b.name + ': ' + b.plan };
      if (Math.abs(i - bi) === 1) o.near = true;
      return o;
    });
    return _base('sprplan', {
      key: _num(eff) + '|' + _num(pot), variant: SPR_BANDS[bi].id,
      difficulty: BASE.sprplan + (Math.min(Math.abs(spr - 4), Math.abs(spr - 10)) < 1 ? 100 : 0),
      prompt: _sprPrompt({ eff: eff, pot: pot }), scene: { potTotal: pot, stack: eff },
      options: options, answer: IDS[bi], data: { eff: eff, pot: pot, spr: spr, band: SPR_BANDS[bi].id }
    });
  }
  function _verifySprPlan(q) {
    if (!_commonOk(q, 'sprplan') || q.options.length !== 3) return false;
    var d = q.data;
    if (!(d.eff > 0) || !(d.pot > 0) || q.key !== _num(d.eff) + '|' + _num(d.pot) || q.prompt !== _sprPrompt(d)) return false;
    if (!q.scene || !_close(q.scene.potTotal, d.pot) || !_close(q.scene.stack, d.eff)) return false;
    // 독립 경로: 나눗셈 없이 곱셈 비교로 구간을 정한다
    var idx = d.eff < d.pot * 4 ? 0 : (d.eff < d.pot * 10 ? 1 : 2);
    if (Math.abs(d.eff - d.pot * 4) < SPR_MARGIN * d.pot || Math.abs(d.eff - d.pot * 10) < SPR_MARGIN * d.pot) return false;
    if (q.answer !== IDS[idx] || d.band !== SPR_BANDS[idx].id) return false;
    for (var i = 0; i < 3; i++) if (q.options[i].id !== IDS[i] || q.options[i].label.indexOf(SPR_BANDS[i].name) !== 0) return false;
    return true;
  }
  function _explainSprPlan(q) {
    var d = q.data, b = SPR_BANDS[_bandIdx(d.spr)];
    return {
      line: 'SPR = 남은 유효 스택 ÷ 팟 = ' + _num(d.eff) + ' ÷ ' + _num(d.pot) + ' = ' + _f1(d.spr) + ' → 이 앱 기준 ' + b.name + '. ' + b.plan + '.\n' +
        '구간(4와 10)과 계획은 이 앱이 정한 분류 기준이고, 숫자 SPR만 엔진 계산이에요.'
    };
  }
  var genSprPlan = {
    title: 'SPR 구간별 계획',
    next: function(rnd) {
      rnd = _rnd(rnd);
      return _retry(function() { return _buildSprPlan(_pick(SPR_STACKS, rnd), _pick(SPR_POTS, rnd), rnd); }, _verifySprPlan);
    },
    fromKey: function(key, rnd) {
      rnd = _rnd(rnd);
      var m = /^(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)$/.exec(String(key));
      if (!m) return null;
      var eff = parseFloat(m[1]), pot = parseFloat(m[2]);
      if (!(eff > 0 && pot > 0 && eff <= 10000 && pot <= 10000)) return null;
      var q = _buildSprPlan(eff, pot, rnd);
      return q && _verifySprPlan(q) ? q : null;
    },
    verify: _verifySprPlan,
    explain: _explainSprPlan,
    ready: function() { return true; }
  };

  // ═══════════════════ 3. bluffratio-river ═══════════════════
  // 밸류:블러프 = (팟+벳):벳 = 1 ÷ 알파. 팟은 벳 전 팟. 사이즈 키는 gen-math SIZES와 같은 표기.
  var SIZES = [
    { k: '1/4', v: 1 / 4, kor: '팟의 1/4' }, { k: '1/3', v: 1 / 3, kor: '팟의 1/3' }, { k: '1/2', v: 1 / 2, kor: '팟 절반' },
    { k: '2/3', v: 2 / 3, kor: '팟의 2/3' }, { k: '3/4', v: 3 / 4, kor: '팟의 3/4' }, { k: '1', v: 1, kor: '팟 크기' },
    { k: '1.5', v: 1.5, kor: '팟의 1.5배 오버벳' }, { k: '2', v: 2, kor: '팟의 2배 오버벳' }
  ];
  var SIZE_POTS = [4, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30, 36, 40, 45, 60];
  var BR_VALUES = [6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 24, 27, 28, 30, 32, 35, 36, 40, 42, 45, 48];
  function _sizeByKey(k) { for (var i = 0; i < SIZES.length; i++) if (SIZES[i].k === k) return SIZES[i]; return null; }
  function _potsFor(sz) { return SIZE_POTS.filter(function(P) { var x = P * sz.v * 2; return Math.abs(x - Math.round(x)) < 1e-9; }); }
  // 비율 라벨: (P+B):B를 0.5bb 단위 정수로 만들어 약분. '3:1', '5:2'
  function _ratioLabel(a, b) {
    var x = Math.round(a * 2), y = Math.round(b * 2), g = _gcd(x, y);
    return (x / g) + ':' + (y / g);
  }
  function _brPrompt(d, sz) {
    if (d.variant === 'combos') {
      return '리버. 벳 전 팟 ' + _num(d.P) + 'bb, 내 벳 ' + _num(d.B) + 'bb(' + sz.kor + '). 밸류 ' + d.V + '콤보로 벳한다면 상대 콜이 본전이 되는 블러프는 최대 몇 콤보?';
    }
    return '리버. 벳 전 팟 ' + _num(d.P) + 'bb, 내 벳 ' + _num(d.B) + 'bb(' + sz.kor + '). 상대 콜이 딱 본전이 되는 내 벳의 밸류:블러프 비율은?';
  }
  function _buildBr(sz, variant, rnd) {
    var pots = _potsFor(sz);
    if (!pots.length) return null;
    var P = _pick(pots, rnd), B = Math.round(P * sz.v * 2) / 2;
    var alpha = B / (P + B);           // 알파 공식
    var ratio = 1 / alpha;             // 밸류:블러프 = (P+B):B
    var d = { P: P, B: B, size: sz.k, variant: variant, alpha: alpha, ratio: ratio };
    var op, key;
    if (variant === 'combos') {
      // 블러프 최대 콤보 = V x B ÷ (P+B) = V x 알파. 정수로 떨어지는 V만
      var cands = _shuffle(BR_VALUES, rnd).filter(function(V) { var x = V * alpha; return Math.abs(x - Math.round(x)) < 1e-9 && Math.round(x) >= 2; });
      if (!cands.length) return null;
      var V = cands[0], X = Math.round(V * alpha);
      d.V = V; d.X = X;
      // 함정: 알파 대신 블러프 몫 B/(P+2B)로 센 값, 밸류와 같은 수(1:1), 벳/팟 비율, 반
      var wrongs = _wrongs(X, [Math.round(V * B / (P + 2 * B)), V, Math.round(V * Math.min(sz.v, 1)), Math.round(V / 2), X + 3, X - 3, X + 5, X - 5, X + 2, X - 2], function(v) { return v + '콤보'; }, 1, 3, 2, 1, null);
      if (wrongs.length < 3) return null;
      op = _options({ v: X, label: X + '콤보' }, wrongs, rnd);
      key = sz.k + '|c';
    } else {
      var lab = _ratioLabel(P + B, B);
      // 함정: 팟:벳(알파 분모를 잊음), (팟+2벳):벳(블러프 몫의 역), 1:1, 벳:팟
      var raw = [[P, B], [P + 2 * B, B], [1, 1], [B, P], [P + B, 2 * B], [2 * (P + B), B], [P + B, P]];
      var seen = {}, wl = [];
      seen[lab] = true;
      for (var i = 0; i < raw.length && wl.length < 3; i++) {
        var l2 = _ratioLabel(raw[i][0], raw[i][1]);
        if (seen[l2]) continue;
        seen[l2] = true;
        var w = { v: raw[i][0] / raw[i][1], label: l2 };
        if (Math.abs(w.v - ratio) <= 0.6) w.near = true;
        wl.push(w);
      }
      if (wl.length < 3) return null;
      op = _options({ v: ratio, label: lab }, wl, rnd);
      key = sz.k;
    }
    return _base('bluffratio-river', {
      key: key, variant: variant, difficulty: BASE['bluffratio-river'] + (sz.v > 1 ? 50 : 0) + (variant === 'combos' ? 50 : 0),
      prompt: _brPrompt(d, sz), scene: { potTotal: P, note: '내 벳 ' + _num(B) + 'bb(' + sz.kor + ')' },
      options: op.options, answer: op.answer, data: d
    });
  }
  // 독립 경로: 상대(블러프캐처) 콜 EV = f x (P+B) - (1-f) x B가 0이 되는 블러프 몫 f를 이분 탐색(공식을 쓰지 않음)
  function _bluffShareBisect(P, B) {
    function ev(f) { return f * (P + B) - (1 - f) * B; }
    var lo = 0, hi = 1;
    if (!(ev(lo) < 0 && ev(hi) > 0)) return null;
    for (var k = 0; k < 60; k++) { var mid = (lo + hi) / 2; if (ev(mid) < 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function _verifyBr(q) {
    if (!_commonOk(q, 'bluffratio-river') || q.options.length !== 4) return false;
    var d = q.data, sz = _sizeByKey(d.size);
    if (!sz || !(d.P > 0) || !_close(d.B, d.P * sz.v) || (d.variant !== 'ratio' && d.variant !== 'combos')) return false;
    if (q.key !== sz.k + (d.variant === 'combos' ? '|c' : '') || q.prompt !== _brPrompt(d, sz)) return false;
    if (!q.scene || !_close(q.scene.potTotal, d.P)) return false;
    var f = _bluffShareBisect(d.P, d.B);
    if (f == null) return false;
    if (d.variant === 'combos') {
      if (!(d.V > 0) || d.V !== Math.round(d.V)) return false;
      // 밸류 V가 (1-f) 몫이면 전체는 V/(1-f), 블러프는 그중 f 몫
      var X = d.V / (1 - f) * f;
      if (Math.abs(X - Math.round(X)) > 1e-6 || Math.round(X) < 2) return false;
      if (_answerLabel(q) !== Math.round(X) + '콤보') return false;
      return q.options.every(function(o) { return /^\d+콤보$/.test(o.label); });
    }
    var want = _ratioLabel((1 - f) / f * d.B, d.B);   // 밸류:블러프 = (1-f):f, 0.5bb 단위로 올려 약분
    if (_answerLabel(q) !== want) return false;
    return q.options.every(function(o) { return /^\d+:\d+$/.test(o.label); });
  }
  function _explainBr(q) {
    var d = q.data, sz = _sizeByKey(d.size);
    var head = '알파 = 벳 ÷ (팟+벳) = ' + _num(d.B) + ' ÷ (' + _num(d.P) + '+' + _num(d.B) + ') = ' + _pct0(d.alpha) + '(팟은 벳 전). 밸류:블러프 = (팟+벳):벳 = 1 ÷ 알파 = ' + _ratioLabel(d.P + d.B, d.B) + '. ';
    if (d.variant === 'combos') {
      return { line: head + '밸류 ' + d.V + '콤보면 블러프는 ' + d.V + ' × ' + _num(d.B) + ' ÷ ' + _num(d.P + d.B) + ' = ' + d.X + '콤보까지.\n' +
        '이보다 블러프가 많으면 상대 콜이 이득, 적으면 상대 폴드가 이득이에요(' + (sz ? sz.kor : '') + ').' };
    }
    return { line: head + '상대가 받는 팟 오즈(팟 ' + _num(d.P + d.B) + 'bb, 콜 ' + _num(d.B) + 'bb)와 같은 몫이 블러프라서 콜이 본전이에요.\n' +
      '벳이 클수록 블러프를 더 섞을 수 있어요(팟 크기 벳 2:1, 팟 절반 3:1).' };
  }
  var genBr = {
    title: '리버 밸류:블러프 비율',
    next: function(rnd, opts) {
      rnd = _rnd(rnd); opts = opts || {};
      var v = opts.variant === 'combos' || opts.variant === 'ratio' ? opts.variant : null;
      return _retry(function() { return _buildBr(_pick(SIZES, rnd), v || (rnd() < 0.5 ? 'ratio' : 'combos'), rnd); }, _verifyBr);
    },
    fromKey: function(key, rnd) {
      rnd = _rnd(rnd);
      var m = /^(.+?)(\|c)?$/.exec(String(key));
      var sz = m ? _sizeByKey(m[1]) : null;
      if (!sz) return null;
      return _retry(function() { return _buildBr(sz, m[2] ? 'combos' : 'ratio', rnd); }, _verifyBr);
    },
    verify: _verifyBr,
    explain: _explainBr,
    ready: function() { return true; }
  };

  // ═══════════════════ 4. bankroll ═══════════════════
  // 파산 위험 = exp(-2 x 승률 x 뱅크롤 ÷ 표준편차²). 승률 bb/100, 표준편차 90bb/100(이 앱 가정), 뱅크롤 bb(바이인 100bb).
  var BR_SD = 90, BUYIN_BB = 100;
  var BR_RATES = [2, 2.5, 3, 4, 5, 6, 8, 10];
  var BR_BUYINS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100];
  var BR_BUCKETS = [0, 0.01, 0.05, 0.20, 1];
  var BR_LABELS = ['1% 미만', '1~5%', '5~20%', '20% 이상'];
  var BR_LIMITS = [{ r: 0.01, k: '1' }, { r: 0.05, k: '5' }, { r: 0.10, k: '10' }, { r: 0.20, k: '20' }];
  var BR_REL_MARGIN = 0.08;   // 경계값의 8% 안쪽(1%면 0.08%p)은 내지 않는다
  function ruinRisk(w, bankrollBb) { return Math.exp(-2 * w * bankrollBb / (BR_SD * BR_SD)); }
  function buyinsFor(w, risk) { return Math.ceil(-Math.log(risk) * BR_SD * BR_SD / (2 * w) / BUYIN_BB - 1e-9); }
  function _riskBucket(r) { for (var i = 1; i < BR_BUCKETS.length - 1; i++) if (r < BR_BUCKETS[i]) return i - 1; return BR_BUCKETS.length - 2; }
  function _limitByKey(k) { for (var i = 0; i < BR_LIMITS.length; i++) if (BR_LIMITS[i].k === k) return BR_LIMITS[i]; return null; }
  function _bkPrompt(d) {
    if (d.variant === 'buyins') {
      return '승률 ' + _num(d.w) + 'bb/100, 표준편차 90bb/100 가정. 파산 위험을 ' + _num(d.risk * 100) + '% 이하로 두려면 바이인(100bb) 최소 몇 개?';
    }
    return '승률 ' + _num(d.w) + 'bb/100, 표준편차 90bb/100 가정, 뱅크롤 바이인(100bb) ' + d.n + '개. 전부 잃을 확률(파산 위험)은 어느 구간?';
  }
  function _buildBkRisk(w, n, rnd) {
    var r = ruinRisk(w, n * BUYIN_BB);
    for (var i = 1; i < BR_BUCKETS.length - 1; i++) if (Math.abs(r - BR_BUCKETS[i]) < BR_BUCKETS[i] * BR_REL_MARGIN) return null;
    var bi = _riskBucket(r);
    var options = BR_LABELS.map(function(l, i) { var o = { id: IDS[i], label: l }; if (Math.abs(i - bi) === 1) o.near = true; return o; });
    var d = { variant: 'risk', w: w, n: n, bankroll: n * BUYIN_BB, risk: r, bucket: bi };
    return _base('bankroll', {
      key: 'risk|' + _num(w) + '|' + n, variant: 'risk', difficulty: BASE.bankroll + (n >= 40 ? 50 : 0),
      prompt: _bkPrompt(d), scene: { note: '표준편차 90bb/100 가정, 바이인 = 100bb' },
      options: options, answer: IDS[bi], data: d
    });
  }
  function _buildBkBuyins(w, lim, rnd) {
    var N = buyinsFor(w, lim.r);
    if (!(N >= 3 && N <= 200)) return null;
    // 함정: 통념 20개 고정, 로그를 빼먹은 값(표준편차²/(2 x 승률)/100), 절반, 2배, 근처 값
    var cands = [20, Math.ceil(BR_SD * BR_SD / (2 * w) / BUYIN_BB), Math.round(N / 2), N * 2, N + 5, N - 5, N + 10, N - 10, N + 3, N - 3];
    var wrongs = _wrongs(N, cands, function(v) { return v + '개'; }, 2, 3, 3, 1, null);
    if (wrongs.length < 3) return null;
    var op = _options({ v: N, label: N + '개' }, wrongs, rnd);
    var d = { variant: 'buyins', w: w, risk: lim.r, limit: lim.k, n: N, bankroll: N * BUYIN_BB };
    return _base('bankroll', {
      key: 'buyins|' + _num(w) + '|' + lim.k, variant: 'buyins', difficulty: BASE.bankroll + 50,
      prompt: _bkPrompt(d), scene: { note: '표준편차 90bb/100 가정, 바이인 = 100bb' },
      options: op.options, answer: op.answer, data: d
    });
  }
  function _verifyBk(q) {
    if (!_commonOk(q, 'bankroll') || q.options.length !== 4) return false;
    var d = q.data;
    if (!(d.w > 0) || q.prompt !== _bkPrompt(d)) return false;
    if (!q.scene || !q.scene.note) return false;
    // 독립 경로: 로그로 뒤집은 문턱 뱅크롤. 위험 < 경계 ⇔ 뱅크롤 > -ln(경계) x 표준편차² ÷ (2 x 승률)
    function threshold(risk) { return -Math.log(risk) * BR_SD * BR_SD / (2 * d.w); }
    if (d.variant === 'risk') {
      if (!(d.n > 0) || d.n !== Math.round(d.n) || d.bankroll !== d.n * BUYIN_BB || q.key !== 'risk|' + _num(d.w) + '|' + d.n) return false;
      var idx = 3;
      for (var i = 1; i < BR_BUCKETS.length - 1; i++) if (d.bankroll > threshold(BR_BUCKETS[i])) { idx = i - 1; break; }
      // 경계 여유: 뱅크롤이 문턱과 너무 가까우면(위험이 경계의 8% 안) 내지 않는다
      for (i = 1; i < BR_BUCKETS.length - 1; i++) {
        var lo = threshold(BR_BUCKETS[i] * (1 + BR_REL_MARGIN)), hi = threshold(BR_BUCKETS[i] * (1 - BR_REL_MARGIN));
        if (d.bankroll >= lo && d.bankroll <= hi) return false;
      }
      if (q.answer !== IDS[idx] || d.bucket !== idx) return false;
      for (i = 0; i < 4; i++) if (q.options[i].id !== IDS[i] || q.options[i].label !== BR_LABELS[i]) return false;
      return true;
    }
    if (d.variant !== 'buyins') return false;
    var lim = _limitByKey(d.limit);
    if (!lim || d.risk !== lim.r || q.key !== 'buyins|' + _num(d.w) + '|' + lim.k) return false;
    var N = parseInt(_answerLabel(q), 10);
    if (!(N >= 1) || d.n !== N) return false;
    // 최소성: N개는 위험이 상한 이하, N-1개는 상한 초과
    if (!(N * BUYIN_BB >= threshold(lim.r) - 1e-6) || !((N - 1) * BUYIN_BB < threshold(lim.r))) return false;
    return q.options.every(function(o) { return /^\d+개$/.test(o.label); });
  }
  function _explainBk(q) {
    var d = q.data, sd2 = BR_SD * BR_SD;
    if (d.variant === 'buyins') {
      var bb = -Math.log(d.risk) * sd2 / (2 * d.w);
      return { line: '필요 뱅크롤 = -ln(위험) × 표준편차² ÷ (2 × 승률) = ' + (-Math.log(d.risk)).toFixed(2) + ' × ' + sd2 + ' ÷ ' + _num(2 * d.w) + ' ≈ ' + Math.round(bb) + 'bb → 바이인 ' + d.n + '개(올림).\n' +
        '승률이 낮을수록 필요한 바이인이 빠르게 늘어요. 20개 규칙은 승률이 꽤 높을 때 이야기예요.' };
    }
    return { line: '파산 위험 = exp(-2 × 승률 × 뱅크롤 ÷ 표준편차²) = exp(-2 × ' + _num(d.w) + ' × ' + d.bankroll + ' ÷ ' + sd2 + ') ≈ ' + (Math.round(d.risk * 1000) / 10).toFixed(1) + '% → ' + BR_LABELS[d.bucket] + '.\n' +
      '같은 바이인 수라도 승률이 낮으면 위험이 훨씬 커요. 커리어 레슨 뱅크롤 관리와 같은 식이에요.' };
  }
  var genBankroll = {
    title: '뱅크롤과 파산 위험',
    next: function(rnd, opts) {
      rnd = _rnd(rnd); opts = opts || {};
      var v = opts.variant === 'buyins' || opts.variant === 'risk' ? opts.variant : null;
      return _retry(function() {
        var w = _pick(BR_RATES, rnd);
        if ((v || (rnd() < 0.5 ? 'risk' : 'buyins')) === 'buyins') return _buildBkBuyins(w, _pick(BR_LIMITS, rnd), rnd);
        return _buildBkRisk(w, _pick(BR_BUYINS, rnd), rnd);
      }, _verifyBk);
    },
    fromKey: function(key, rnd) {
      rnd = _rnd(rnd);
      var m = /^(risk|buyins)\|(\d+(?:\.\d+)?)\|(\d+)$/.exec(String(key));
      if (!m) return null;
      var w = parseFloat(m[2]);
      if (!(w > 0 && w <= 100)) return null;
      var q;
      if (m[1] === 'risk') {
        var n = parseInt(m[3], 10);
        if (!(n >= 1 && n <= 1000)) return null;
        q = _buildBkRisk(w, n, rnd);
      } else {
        var lim = _limitByKey(m[3]);
        if (!lim) return null;
        q = _buildBkBuyins(w, lim, rnd);
      }
      return q && _verifyBk(q) ? q : null;
    },
    verify: _verifyBk,
    explain: _explainBk,
    ready: function() { return true; }
  };

  // ── 등록(C1). stage = 그 개념이 처음 나오는 노드의 단계, group은 데일리 5 구성용. 정본은 Puzzles.TYPE_META ──
  var META = {
    blockers: { stage: 4, group: 'other', concept: 'combos', appDef: false },             // s4-08 블로커 입문
    sprplan: { stage: 3, group: 'other', concept: 'spr', appDef: true },                  // s3-09 SPR과 커밋
    'bluffratio-river': { stage: 4, group: 'math', concept: 'value_bluff', appDef: false }, // s4-06 블러프 비율과 손익분기
    bankroll: { stage: 6, group: 'math', concept: 'variance', appDef: false }              // s6-06 분산
  };
  var BASE = { blockers: 1800, sprplan: 1500, 'bluffratio-river': 1750, bankroll: 2050 };
  var GENS = { blockers: genBlockers, sprplan: genSprPlan, 'bluffratio-river': genBr, bankroll: genBankroll };

  if (typeof Puzzles !== 'undefined' && Puzzles && typeof Puzzles.register === 'function') {
    Object.keys(GENS).forEach(function(t) {
      var m = META[t];
      // title은 정본 표에 없는 필드라 그대로 남고, JourneyUI.typeName이 TYPE_LABEL에 없는 유형의 이름으로 쓴다
      Puzzles.register(t, GENS[t], { stage: m.stage, group: m.group, concept: m.concept, title: GENS[t].title });
    });
  }

  var api = {
    GENS: GENS, META: META, BASE: BASE, SPR_BANDS: SPR_BANDS, BR_BUCKETS: BR_BUCKETS, BR_LABELS: BR_LABELS, BR_SD: BR_SD, BUYIN_BB: BUYIN_BB,
    ruinRisk: ruinRisk, buyinsFor: buyinsFor, ratioLabel: _ratioLabel, blockerCount: _blkCount, blockerEnum: _blkEnum, boardOk: _boardOk
  };
  if (typeof module !== 'undefined' && module) module.exports = api;
  return api;
})();
