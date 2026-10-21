// puzzles/gen-math.js (채우는 패키지: M2-P2b)
// 수학 퍼즐 생성기 11종: outs, outs-x4, potodds, eqbucket, mdf, alpha, bluffratio, spr, geosize, variance, toygame(M6-WIDGET).
// 계약: puzzles/puzzle-core.js 머리 주석 C1(생성기), C2(문항), C3(장면), C9(eqbucket 은행).
// 정확성 규칙(설계서 3.2절 출제 제외 5번, 8.3절 2(b), 8.4절):
//   아웃츠 = 남은 덱(플랍 47장, 턴 46장) 중 다음 1장으로 스트레이트 이상이 되는 카드 수. HandEval 열거로 센다.
//   드로우가 명확한 스팟만 낸다(하이카드 상태, 페어 없음, 보드만으로 되는 아웃 없음, 의도한 드로우 개수와 열거 결과 일치).
//   턴 문항은 x2만 쓴다. x4 함정 짝(outs-x4)은 플랍 올인/비올인 짝으로만 낸다. 확률은 2열(턴+리버 2장 / 다음 1장) 머리글을 붙인다.
//   팟 오즈 지문은 MathDrill과 같은 '팟 Xbb(상대 벳 Bbb 포함), 콜 Bbb' 형식, 정답 B/(P+2B). 키 'P|B', 레거시 'f=1/2'도 받는다.
//   MDF = 팟/(팟+벳), 알파 = 벳/(팟+벳), 블러프 비율 = 벳/(팟+2벳), 여기서 팟은 벳 전 팟.
//   SPR은 계산값만 exact이고 구간 해석은 '참고' 한 줄. 기하 사이즈 b = ((1+2S/P)^(1/n) - 1)/2.
//   분산 95% 구간 = 승률 x N/100 ± 1.96 x 90 x sqrt(N/100) (SD 90bb/100, 설계서 1.3절).
//   토이 게임(A/K/Q 리버, M6-WIDGET): 무차별 블러프 몫 = 벳/(팟+2벳), 콜 무차별(MDF) = 팟/(팟+벳), 팟은 벳 전 팟. 키 = 벳 비율.
//   eqbucket은 PUZZLE_SEEDS.eqbucket(또는 opts.bank) 항목에서만 낸다. 은행이 비면 ready() false, next null. 즉석 MC 없음.
// verify(q)는 next와 다른 경로로 정답을 다시 계산한다(아웃츠는 evaluateIdx 정수 경로, 공식은 대수적으로 다른 식).
// 로드 시 DOM, window, localStorage 접근 없음. HandEval, Puzzles, PUZZLE_SEEDS는 호출 시점에 typeof 가드.
var GenMath = (function() {
  var RANKS = '23456789TJQKA';
  var SUITS = 'shdc';
  var SUIT_ID = { s: 0, h: 1, d: 2, c: 3 };
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
  function _pct1(p) { return (Math.round(p * 1000) / 10).toFixed(1) + '%'; }
  function _close(a, b) { return Math.abs(a - b) < 1e-9; }
  function _comma(n) {
    var r = Math.round(n), s = String(Math.abs(r)), out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return (r < 0 ? '-' : '') + s + out;
  }
  function _signed(n) { var r = Math.round(n); return (r > 0 ? '+' : '') + _comma(r); }
  function _hasEval() { return typeof HandEval !== 'undefined' && HandEval && typeof HandEval.evaluate === 'function'; }

  // 보기 만들기: correct = {v, label}, wrongs = [{v, label, near?}] → 섞어서 a~d id 부여
  function _options(correct, wrongs, rnd) {
    var all = [correct].concat(wrongs);
    var order = _shuffle(all, rnd);
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

  // 수치형 오답 고르기: 후보 순서대로, 라벨이 겹치지 않고 정답과 minGap 이상 떨어진 것 need개
  function _wrongs(c, cands, fmt, minGap, need, nearGap, lo, hi) {
    var out = [], seen = {};
    seen[fmt(c)] = true;
    for (var i = 0; i < cands.length && out.length < need; i++) {
      var v = cands[i];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      if (lo != null && v <= lo) continue;
      if (hi != null && v >= hi) continue;
      var lab = fmt(v);
      if (seen[lab] || Math.abs(v - c) < minGap) continue;
      seen[lab] = true;
      var w = { v: v, label: lab };
      if (nearGap && Math.abs(v - c) <= nearGap) w.near = true;
      out.push(w);
    }
    return out;
  }

  function _base(type, extra) {
    var m = META[type];
    var q = {
      type: type, key: null, concept: m.concept, difficulty: BASE[type], confidence: 'exact', appDef: false,
      rated: true, srs: 'srs', prompt: '', scene: null, options: [], answer: null, ui: 'choice', data: {}
    };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) q[k] = extra[k];
    return q;
  }

  function _commonOk(q, type) {
    if (!q || q.type !== type || q.confidence !== 'exact' || q.srs !== 'srs' || q.appDef !== false) return false;
    if (typeof q.key !== 'string' || !q.key) return false;
    if (typeof q.rated !== 'boolean' || typeof q.difficulty !== 'number') return false;
    if (typeof q.prompt !== 'string' || !q.prompt || q.prompt.split('\n').length > 2) return false;
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return false;
    var ids = {}, labels = {}, hasAns = false;
    for (var i = 0; i < q.options.length; i++) {
      var o = q.options[i];
      if (!o || typeof o.id !== 'string' || typeof o.label !== 'string' || !o.label) return false;
      if (ids[o.id] || labels[o.label]) return false;
      ids[o.id] = true; labels[o.label] = true;
      if (o.id === q.answer) hasAns = true;
    }
    return hasAns && !!q.data;
  }

  function _answerLabel(q) {
    for (var i = 0; i < q.options.length; i++) if (q.options[i].id === q.answer) return q.options[i].label;
    return null;
  }

  // 생성 → 자체 검산 → 실패면 재생성(최대 20회) 후 null
  function _retry(build, verify) {
    for (var i = 0; i < MAX_TRY; i++) {
      var q = build(i);
      if (q && verify(q)) return q;
    }
    return null;
  }

  // ── 카드 ──
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
  function _split(str) {
    if (str == null || str === '') return [];
    if (Array.isArray(str)) return str.slice();
    var s = String(str), out = [];
    if (s.length % 2) return null;
    for (var i = 0; i < s.length; i += 2) out.push(s.slice(i, i + 2));
    return out;
  }
  function _int52(cs) { return (RANKS.indexOf(cs[0])) * 4 + SUIT_ID[cs[1]]; }
  function _rankChar(v) { return v === 1 ? 'A' : RANKS[v - 2]; }
  function _rankVal(ch) { return RANKS.indexOf(ch) + 2; }
  function _rankKor(ch) { return ch === 'T' ? '10' : ch; }
  function _byRankDesc(a, b) { return _rankVal(b[0]) - _rankVal(a[0]); }

  // ── 아웃츠 열거(설계서 3.2절 5번) ──
  // 반환 {outs:[카드], unseen, cur(현재 족보 type, 10 = 하이카드), boardOuts(보드만으로 같은 족보가 되는 카드 수)}
  function countOuts(hero, board) {
    if (!_hasEval() || !_cardsOk((hero || []).concat(board || []))) return null;
    var known = hero.concat(board), kc = known.map(_card), bc = board.map(_card);
    var used = {};
    known.forEach(function(c) { used[c] = true; });
    var cur = known.length >= 5 ? HandEval.evaluate(kc) : null;
    var outs = [], boardOuts = 0, unseen = 0;
    for (var r = 0; r < 13; r++) {
      for (var s = 0; s < 4; s++) {
        var cs = RANKS[r] + SUITS[s];
        if (used[cs]) continue;
        unseen++;
        var c = { rank: RANKS[r], suit: SUITS[s] };
        var ev = HandEval.evaluate(kc.concat([c]));
        if (!ev || ev.type > 6) continue; // 6 = 스트레이트, 숫자가 작을수록 강함
        if (board.length + 1 >= 5) {
          var bv = HandEval.evaluate(bc.concat([c]));
          if (bv && HandEval.compareHands(ev, bv) === 0) { boardOuts++; continue; }
        }
        outs.push(cs);
      }
    }
    return { outs: outs, unseen: unseen, cur: cur ? cur.type : null, boardOuts: boardOuts };
  }

  // verify 전용 독립 경로: 정수 카드 + evaluateIdx
  function _countOutsIdx(hero, board) {
    if (typeof HandEval === 'undefined' || typeof HandEval.evaluateIdx !== 'function') return null;
    var dead = [], known = [], bi = [], i;
    for (i = 0; i < 52; i++) dead.push(false);
    hero.concat(board).forEach(function(cs) { var k = _int52(cs); dead[k] = true; known.push(k); });
    board.forEach(function(cs) { bi.push(_int52(cs)); });
    var curEv = HandEval.evaluateIdx(known);
    var n = 0, unseen = 0, boardOnly = 0;
    for (i = 0; i < 52; i++) {
      if (dead[i]) continue;
      unseen++;
      var ev = HandEval.evaluateIdx(known.concat([i]));
      if (ev.type > 6) continue;
      if (bi.length + 1 >= 5 && HandEval.compareHands(ev, HandEval.evaluateIdx(bi.concat([i]))) === 0) { boardOnly++; continue; }
      n++;
    }
    return { n: n, unseen: unseen, cur: curEv.type, boardOnly: boardOnly };
  }

  // 다음 cards장(1 또는 2) 안에 아웃이 1장 이상 나올 정확 확률
  function outsPct(outs, unseen, cards) {
    if (cards === 2) return 1 - ((unseen - outs) * (unseen - outs - 1)) / (unseen * (unseen - 1));
    return outs / unseen;
  }

  // 설계서 2.4절 세션 5행의 2열 표(플랍 기준, 남은 47장). 소수 1자리 문자열.
  var OUTS_TABLE = (function() {
    var t = {};
    [4, 8, 9, 12, 15].forEach(function(o) {
      t[o] = { two: (Math.round(outsPct(o, 47, 2) * 1000) / 10).toFixed(1), one: (Math.round(outsPct(o, 47, 1) * 1000) / 10).toFixed(1) };
    });
    return t;
  })();

  // 드로우 종류: 아웃츠 수 → 구성. gut 4, oesd 8, fd 9, fdgut 12, fdoesd 15
  var OUTS_CATS = { 4: 'gut', 8: 'oesd', 9: 'fd', 12: 'fdgut', 15: 'fdoesd' };
  var OUTS_LIST = [4, 8, 9, 12, 15];
  var OUTS_WRONG = { 4: [8, 2, 3, 6, 5], 8: [4, 16, 6, 10, 9], 9: [13, 11, 8, 4, 10], 12: [13, 9, 15, 11, 16], 15: [17, 12, 9, 13, 16] };
  var OUTS_DOUBLE = { 12: 13, 15: 17 }; // 겹친 카드를 두 번 센 실수

  // 의도한 드로우를 직접 조립한다(무작위 딜보다 빠르고 아웃츠 수를 고를 수 있다). 검산은 열거로.
  function _drawSpot(outs, street, rnd) {
    var cat = OUTS_CATS[outs];
    if (!cat) return null;
    var flush = cat.indexOf('fd') === 0;
    var straight = cat !== 'fd';
    var oesd = cat === 'oesd' || cat === 'fdoesd';
    var heroV, boardV, i;
    if (straight) {
      var run = [];
      if (oesd) { var x = 2 + _int(9, rnd); run = [x, x + 1, x + 2, x + 3]; }            // 2345 ~ TJQK, 양끝 열림
      else {
        var w = 1 + _int(10, rnd), miss = w + 1 + _int(3, rnd);                           // A2345 ~ TJQKA 창에서 안쪽 1칸 빔
        for (var v = w; v <= w + 4; v++) if (v !== miss) run.push(v);
      }
      run = _shuffle(run, rnd);
      heroV = [run[0], run[1]]; boardV = [run[2], run[3]];
    } else {
      var pool = _shuffle([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], rnd);
      heroV = [pool[0], pool[1]]; boardV = [pool[2], pool[3]];
    }
    var heroR = heroV.map(_rankChar), boardR = boardV.map(_rankChar);
    var usedR = {};
    heroR.concat(boardR).forEach(function(r) { usedR[r] = true; });
    var blanks = street === 'turn' ? 2 : 1;
    var freeR = _shuffle(RANKS.split('').filter(function(r) { return !usedR[r]; }), rnd);
    for (i = 0; i < blanks; i++) boardR.push(freeR[i]);
    var fs = flush ? SUITS[_int(4, rnd)] : null;
    var others = SUITS.split('').filter(function(s) { return s !== fs; });
    var heroS, boardS;
    if (flush) {
      heroS = [fs, fs];
      var pos = _shuffle(boardR.map(function(r, k) { return k; }), rnd).slice(0, 2);
      boardS = boardR.map(function(r, k) { return pos.indexOf(k) >= 0 ? fs : _pick(others, rnd); });
    } else {
      heroS = [_pick(SUITS, rnd), _pick(SUITS, rnd)];
      boardS = boardR.map(function() { return _pick(SUITS, rnd); });
    }
    var hero = [heroR[0] + heroS[0], heroR[1] + heroS[1]].sort(_byRankDesc);
    var board = _shuffle(boardR.map(function(r, k) { return r + boardS[k]; }), rnd);
    if (!_cardsOk(hero.concat(board))) return null;
    var res = countOuts(hero, board);
    if (!res || res.cur !== 10 || res.boardOuts !== 0 || res.outs.length !== outs) return null;
    return { hero: hero, board: board, outs: res.outs, unseen: res.unseen };
  }

  function _drawSpotTry(outs, street, rnd) {
    for (var i = 0; i < 40; i++) { var s = _drawSpot(outs, street, rnd); if (s) return s; }
    return null;
  }

  // 아웃츠 구성 문장: "하트 9장 + J(3장) + 6(3장)"
  function _outsParts(hero, board, outs) {
    var cnt = {}, fs = null, parts = [], ranks = {}, rankOrder = [];
    hero.concat(board).forEach(function(c) { cnt[c[1]] = (cnt[c[1]] || 0) + 1; });
    for (var s in cnt) if (cnt[s] >= 4) fs = s;
    var flushN = 0;
    outs.forEach(function(c) {
      if (fs && c[1] === fs) { flushN++; return; }
      if (!ranks[c[0]]) { ranks[c[0]] = 0; rankOrder.push(c[0]); }
      ranks[c[0]]++;
    });
    rankOrder.sort(function(a, b) { return _rankVal(b) - _rankVal(a); });
    if (flushN) parts.push(SUIT_KOR[fs] + ' ' + flushN + '장');
    rankOrder.forEach(function(r) { parts.push(_rankKor(r) + '(' + ranks[r] + '장)'); });
    var txt = parts.join(' + ');
    if (flushN && rankOrder.length) txt += '(' + rankOrder.map(_rankKor).join(', ') + '의 ' + SUIT_KOR[fs] + (fs === 'c' ? '은' : '는') + ' 플러시에 이미 셈)';   // 받침 있는 '클럽'만 '은'(M7 S2-07)
    return txt;
  }

  // ── 1. outs ──
  function _buildOuts(outs, street, rnd, key) {
    var sp = _drawSpotTry(outs, street, rnd);
    if (!sp) return null;
    var wl = _shuffle(OUTS_WRONG[outs].slice(1), rnd);
    var cand = [OUTS_WRONG[outs][0]].concat(wl);
    var wrongs = [];
    for (var i = 0; i < cand.length && wrongs.length < 3; i++) {
      var v = cand[i];
      if (v === outs) continue;
      var w = { v: v, label: v + '장' };
      if (Math.abs(v - outs) <= 1 || OUTS_DOUBLE[outs] === v) w.near = true;
      wrongs.push(w);
    }
    var op = _options({ v: outs, label: outs + '장' }, wrongs, rnd);
    var flop = street === 'flop';
    var prompt = (flop ? '플랍. 다음 1장' : '턴. 리버 1장') + '으로 스트레이트 이상이 되는 카드(아웃츠)는 남은 ' + sp.unseen + '장 중 몇 장?';
    return _base('outs', {
      key: key || String(outs), variant: street,
      difficulty: BASE.outs + (outs >= 12 ? 100 : 0) + (flop ? 0 : 50),
      prompt: prompt, scene: { hero: sp.hero, board: sp.board },
      options: op.options, answer: op.answer,
      data: { hero: sp.hero, board: sp.board, street: street, outs: outs, unseen: sp.unseen, outList: sp.outs, values: op.values }
    });
  }

  function _verifyOuts(q) {
    if (!_commonOk(q, 'outs')) return false;
    var d = q.data, hero = d.hero, board = d.board;
    if (!_cardsOk((hero || []).concat(board || [])) || hero.length !== 2) return false;
    var street = board.length === 3 ? 'flop' : board.length === 4 ? 'turn' : null;
    if (!street || street !== d.street) return false;
    if (!q.scene || JSON.stringify(q.scene.hero) !== JSON.stringify(hero) || JSON.stringify(q.scene.board) !== JSON.stringify(board)) return false;
    var r = _countOutsIdx(hero, board);
    if (!r || r.cur !== 10 || r.boardOnly !== 0 || r.unseen !== 52 - 2 - board.length) return false;
    if (q.prompt.indexOf('남은 ' + r.unseen + '장') < 0) return false;
    if (_answerLabel(q) !== r.n + '장' || q.key !== String(r.n)) return false;
    for (var i = 0; i < q.options.length; i++) {
      var lab = q.options[i].label;
      if (!/^\d+장$/.test(lab)) return false;
      if (q.options[i].id !== q.answer && lab === r.n + '장') return false;
      if (street === 'turn' && lab.indexOf('x4') >= 0) return false;
    }
    return true;
  }

  function _explainOuts(q) {
    var d = q.data, n = d.outs;
    var comp = '아웃츠 ' + n + '장 = ' + _outsParts(d.hero, d.board, d.outList) + '.';
    if (d.street === 'flop') {
      var two = outsPct(n, d.unseen, 2), one = outsPct(n, d.unseen, 1);
      var prob = ' 정확값 턴+리버 2장: ' + _pct1(two) + ', 다음 1장: ' + _pct1(one) + '. 어림은 올인이면 x4(' + 4 * n + '%), 아니면 x2(' + 2 * n + '%)' +
        (n > 9 ? ', 9장이 넘으면 x4는 과대 추정이에요.' : '.');
      return { line: comp + prob, table: { head: ['아웃츠', '턴+리버 2장', '다음 1장'], rows: [[n, _pct1(two), _pct1(one)]] } };
    }
    var p = outsPct(n, d.unseen, 1);
    return {
      line: comp + ' 정확값 리버 1장: ' + n + '/' + d.unseen + ' = ' + _pct1(p) + '. 턴에서는 남은 카드가 1장이라 x2 어림(' + 2 * n + '%)만 써요.',
      table: { head: ['아웃츠', '리버 1장'], rows: [[n, _pct1(p)]] }
    };
  }

  function _street(opts, rnd) {
    var v = opts && opts.variant;
    if (v === 'flop' || v === 'turn') return v;
    return rnd() < 0.5 ? 'flop' : 'turn';
  }

  var genOuts = {
    title: '아웃츠 세기',
    next: function(rnd, opts) {
      rnd = _rnd(rnd);
      if (!_hasEval()) return null;
      return _retry(function() { return _buildOuts(_pick(OUTS_LIST, rnd), _street(opts, rnd), rnd); }, _verifyOuts);
    },
    fromKey: function(key, rnd, opts) {
      rnd = _rnd(rnd);
      var n = /^\d+$/.test(String(key)) ? parseInt(key, 10) : NaN;
      if (OUTS_LIST.indexOf(n) < 0 || !_hasEval()) return null;
      return _retry(function() { return _buildOuts(n, _street(opts, rnd), rnd); }, _verifyOuts);
    },
    verify: _verifyOuts,
    explain: _explainOuts,
    ready: _hasEval
  };

  // ── 2. outs-x4(플랍 올인/비올인 짝) ──
  var X4_OPTS = [
    { k: 'two_x4', mult: 4, two: true }, { k: 'one_x2', mult: 2, two: false },
    { k: 'one_x4', mult: 4, two: false }, { k: 'two_x2', mult: 2, two: true }
  ];
  function _x4Label(o, n) { return 'x' + o.mult + ': ' + (o.two ? '턴과 리버 2장' : '다음 1장') + ', 약 ' + (o.mult * n) + '%'; }

  // 같은 rnd 시드면 variant와 무관하게 같은 스팟이 나온다(스팟을 먼저 만들고 모드는 그 뒤에 정함) → 올인/비올인 짝
  function _buildX4(outs, mode, rnd, opts) {
    var sp = _drawSpotTry(outs, 'flop', rnd);
    if (!sp) return null;
    var v = opts && opts.variant;
    if (mode !== 'allin' && mode !== 'call') mode = (v === 'allin' || v === 'call') ? v : (rnd() < 0.5 ? 'allin' : 'call');
    var allin = mode === 'allin';
    var ok = allin ? 'two_x4' : 'one_x2';
    var correct = null, wrongs = [];
    X4_OPTS.forEach(function(o) {
      var item = { v: o.k, label: _x4Label(o, outs) };
      if (o.k === ok) correct = item; else wrongs.push(item);
    });
    var op = _options(correct, wrongs, rnd);
    var prompt = allin
      ? '플랍, 아웃츠 ' + outs + '장. 상대가 올인해서 콜하면 턴과 리버를 다 본다. 맞는 어림은?'
      : '플랍, 아웃츠 ' + outs + '장. 콜해도 올인이 아니라 턴에 또 벳이 올 수 있다. 이번 콜의 가격과 비교할 어림은?';
    return _base('outs-x4', {
      key: mode + '|' + outs, variant: mode,
      difficulty: BASE['outs-x4'] + (outs > 9 ? 50 : 0),
      prompt: prompt, scene: { hero: sp.hero, board: sp.board },
      options: op.options, answer: op.answer,
      data: { hero: sp.hero, board: sp.board, street: 'flop', mode: mode, outs: outs, unseen: sp.unseen, outList: sp.outs, values: op.values,
        pair: { mode: allin ? 'call' : 'allin', answer: allin ? 'one_x2' : 'two_x4' } }
    });
  }

  function _verifyX4(q) {
    if (!_commonOk(q, 'outs-x4') || q.options.length !== 4) return false;
    var d = q.data, hero = d.hero, board = d.board;
    if (!_cardsOk((hero || []).concat(board || [])) || hero.length !== 2 || board.length !== 3 || d.street !== 'flop') return false;
    if (d.mode !== 'allin' && d.mode !== 'call') return false;
    var r = _countOutsIdx(hero, board);
    if (!r || r.cur !== 10 || r.boardOnly !== 0 || r.n !== d.outs || r.unseen !== 47) return false;
    if (q.key !== d.mode + '|' + r.n || q.prompt.indexOf('아웃츠 ' + r.n + '장') < 0) return false;
    // 정답 규칙: 올인 = 2장 확률을 x4로, 비올인 = 다음 1장 확률을 x2로
    var want = d.mode === 'allin' ? ('x4: 턴과 리버 2장, 약 ' + 4 * r.n + '%') : ('x2: 다음 1장, 약 ' + 2 * r.n + '%');
    if (_answerLabel(q) !== want) return false;
    var seen = {};
    q.options.forEach(function(o) { seen[o.label] = true; });
    return X4_OPTS.every(function(o) { return seen[_x4Label(o, r.n)]; });
  }

  function _explainX4(q) {
    var d = q.data, n = d.outs;
    var two = outsPct(n, d.unseen, 2), one = outsPct(n, d.unseen, 1);
    var head = d.mode === 'allin'
      ? '올인이라 턴과 리버 2장을 다 보니 x4가 맞고, 올인이 아니면 이번 콜은 다음 1장만 보니 x2예요.'
      : '올인이 아니면 이번 콜로 보장되는 건 다음 1장뿐이라 x2와 비교해요. 올인이었다면 2장을 다 보니 x4.';
    var tail = ' 정확값 턴+리버 2장: ' + _pct1(two) + ', 다음 1장: ' + _pct1(one) + '.';
    if (n > 9) tail += ' 9장이 넘으면 x4는 과대 추정이에요(x4 ' + 4 * n + '% vs 정확 ' + _pct1(two) + ').';
    return { line: head + tail, table: { head: ['아웃츠', '턴+리버 2장', '다음 1장'], rows: [[n, _pct1(two), _pct1(one)]] } };
  }

  var genX4 = {
    title: '아웃츠 어림 규칙(x2, x4)',
    next: function(rnd, opts) {
      rnd = _rnd(rnd);
      if (!_hasEval()) return null;
      return _retry(function() { return _buildX4(_pick(OUTS_LIST, rnd), null, rnd, opts); }, _verifyX4);
    },
    fromKey: function(key, rnd, opts) {
      rnd = _rnd(rnd);
      var m = /^(allin|call)\|(\d+)$/.exec(String(key));
      if (!m || OUTS_LIST.indexOf(parseInt(m[2], 10)) < 0 || !_hasEval()) return null;
      return _retry(function() { return _buildX4(parseInt(m[2], 10), m[1], rnd, opts); }, _verifyX4);
    },
    verify: _verifyX4,
    explain: _explainX4,
    ready: _hasEval
  };

  // ── 3. potodds(키 'P|B', 레거시 'f=1/2') ──
  var PO_POTS = [4, 6, 8, 10, 12, 15, 20, 30, 40];
  var PO_FRACS = [
    { v: 1 / 4, k: '1/4' }, { v: 1 / 3, k: '1/3' }, { v: 1 / 2, k: '1/2' }, { v: 2 / 3, k: '2/3' },
    { v: 3 / 4, k: '3/4' }, { v: 1, k: '1' }, { v: 1.5, k: '1.5' }, { v: 2, k: '2' }
  ];
  function oddsLabel(p) { return _num(1 / p) + '번에 1번 (' + Math.round(p * 100) + '%)'; }
  function _poPrompt(P, B) { return '팟 ' + _num(P + B) + 'bb(상대 벳 ' + _num(B) + 'bb 포함), 콜 ' + _num(B) + 'bb. 콜하면 몇 번에 1번 이겨야 본전일까?'; }

  function _parseFrac(s) {
    s = String(s);
    var m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(s);
    var v = m ? parseFloat(m[1]) / parseFloat(m[2]) : (/^\d+(?:\.\d+)?$/.test(s) ? parseFloat(s) : NaN);
    return (isFinite(v) && v > 0 && v <= 5) ? v : null;
  }

  function _buildPotodds(P, B, key, rnd) {
    var c = B / (P + 2 * B);
    var cands = [B / (P + B), Math.min(B / P, 0.9), c + 0.08, c - 0.08, c + 0.12, c - 0.04, c + 0.16, c + 0.04];
    var used = {}, wrongs = [];
    used[Math.round(c * 100)] = true;
    for (var i = 0; i < cands.length && wrongs.length < 3; i++) {
      var p = cands[i], pr = Math.round(p * 100);
      if (!(p > 0.01 && p < 0.99) || used[pr]) continue;
      var lab = oddsLabel(p);
      if (lab === oddsLabel(c) || wrongs.some(function(w) { return w.label === lab; })) continue;
      used[pr] = true;
      var w = { v: p, label: lab };
      if (Math.abs(p - c) <= 0.04 + 1e-9) w.near = true;
      wrongs.push(w);
    }
    var op = _options({ v: c, label: oddsLabel(c) }, wrongs, rnd);
    var X = P + B;
    return _base('potodds', {
      key: key, prompt: _poPrompt(P, B),
      scene: { potTotal: X, toCall: B, ring: { potTotal: X, toCall: B } },
      options: op.options, answer: op.answer,
      data: { P: P, B: B, potTotal: X, toCall: B, legacy: key.indexOf('f=') === 0, values: op.values }
    });
  }

  function _verifyPotodds(q) {
    if (!_commonOk(q, 'potodds') || q.options.length < 3) return false;
    var d = q.data, s = q.scene;
    if (!s || !(d.P > 0) || !(d.B > 0)) return false;
    var X = s.potTotal, Y = s.toCall;
    if (!_close(X, d.P + d.B) || !_close(Y, d.B) || !s.ring || !_close(s.ring.potTotal, X) || !_close(s.ring.toCall, Y)) return false;
    var need = Y / (X + Y); // 화면 규약: 콜 ÷ (팟+콜), 생성은 B/(P+2B)
    if (_answerLabel(q) !== oddsLabel(need)) return false;
    if (q.prompt !== _poPrompt(d.P, d.B)) return false;
    var pct = Math.round(need * 100);
    for (var i = 0; i < q.options.length; i++) {
      if (q.options[i].id === q.answer) continue;
      var m = /\((\d+)%\)$/.exec(q.options[i].label);
      if (!m || parseInt(m[1], 10) === pct) return false;
    }
    if (d.legacy) return /^f=/.test(q.key);
    return q.key === _num(d.P) + '|' + _num(d.B);
  }

  function _explainPotodds(q) {
    var X = q.data.P + q.data.B, Y = q.data.B;
    var pct = Math.round(Y / (X + Y) * 100);
    var line = '필요 승률 = 콜 ÷ (팟+콜) = ' + _num(Y) + ' ÷ (' + _num(X) + '+' + _num(Y) + ') = ' + pct + '%, ' +
      _num((X + Y) / Y) + '번에 1번 이기면 본전. 콜하면 최종 팟 ' + _num(X + Y) + 'bb 중 내 콜 몫이 ' + _num(Y) + 'bb예요.';
    return { line: line, scene: { ring: { potTotal: X, toCall: Y } } };
  }

  var genPotodds = {
    title: '팟 오즈 암산',
    next: function(rnd) {
      rnd = _rnd(rnd);
      return _retry(function() {
        var P = _pick(PO_POTS, rnd), F = _pick(PO_FRACS, rnd);
        var B = Math.round(P * F.v * 2) / 2;
        if (B <= 0) B = 0.5;
        return _buildPotodds(P, B, _num(P) + '|' + _num(B), rnd);
      }, _verifyPotodds);
    },
    // 'P|B'는 같은 수치로, 레거시 'f=1/2'는 같은 벳 비율로 다시 낸다. key는 받은 그대로 둔다(같은 Leitner 항목 갱신).
    fromKey: function(key, rnd) {
      rnd = _rnd(rnd);
      key = String(key == null ? '' : key);
      var m = /^(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)$/.exec(key);
      if (m) {
        var P = parseFloat(m[1]), B = parseFloat(m[2]);
        if (!(P > 0 && B > 0 && P <= 1000 && B <= 1000)) return null;
        return _retry(function() { return _buildPotodds(P, B, key, rnd); }, _verifyPotodds);
      }
      var f = /^f=(.+)$/.exec(key);
      var fv = f ? _parseFrac(f[1]) : null;
      if (fv == null) return null;
      return _retry(function() {
        var P2 = _pick(PO_POTS, rnd);
        var B2 = Math.round(P2 * fv * 2) / 2;
        if (B2 <= 0) B2 = 0.5;
        return _buildPotodds(P2, B2, key, rnd);
      }, _verifyPotodds);
    },
    verify: _verifyPotodds,
    explain: _explainPotodds,
    ready: function() { return true; }
  };

  // ── 4. eqbucket(PUZZLE_SEEDS.eqbucket 은행 전용, C9) ──
  var EQ_BUCKETS = [0, 0.30, 0.50, 0.70, 1];
  var EQ_LABELS = ['30% 미만', '30~50%', '50~70%', '70% 이상'];
  var EQ_MARGIN = 0.01; // 경계에 너무 붙은 항목(시뮬레이션 오차 범위)은 내지 않는다
  var STREET_KOR = { 0: '프리플랍', 3: '플랍', 4: '턴', 5: '리버' };

  function bucketOf(eq, buckets) {
    var b = buckets || EQ_BUCKETS;
    for (var i = 0; i < b.length - 2; i++) if (eq < b[i + 1]) return i;
    return b.length - 2;
  }

  function _bank(opts) {
    if (opts && opts.bank) return opts.bank;
    if (typeof PUZZLE_SEEDS !== 'undefined' && PUZZLE_SEEDS && PUZZLE_SEEDS.eqbucket) return PUZZLE_SEEDS.eqbucket;
    return null;
  }
  function _bucketsOk(b) {
    if (!Array.isArray(b) || b.length !== 5 || b[0] !== 0 || b[4] !== 1) return false;
    for (var i = 1; i < 5; i++) if (!(b[i] > b[i - 1])) return false;
    return true;
  }
  function _spotLabel(vs) {
    if (!vs || vs.kind !== 'range') return '랜덤 손';
    if (typeof vs.label === 'string' && vs.label) return vs.label;
    var sp = String(vs.spot || ''), m;
    if ((m = /^rfi\|(\w+)$/.exec(sp))) return m[1] + ' 오픈 레인지';
    if ((m = /^vsRfi\|(\w+)@(\w+)$/.exec(sp))) return m[2] + ' 오픈에 맞선 ' + m[1] + '의 계속 레인지';
    if ((m = /^vs3bet\|(\w+)$/.exec(sp))) return '3벳을 맞은 ' + m[1] + '의 계속 레인지';
    return '정해진 레인지';
  }
  // 장면 레인지 칩 본문(SceneRender가 그대로 보여 준다). 내부 키 'rfi|BTN'은 화면에 내지 않는다.
  function _spotText(vs) {
    if (vs && typeof vs.text === 'string' && vs.text) return vs.text;
    var sp = String((vs && vs.spot) || '');
    if (/^rfi\|/.test(sp)) return '이 앱 차트에서 오픈하는 손 전체';
    if (/^(vsRfi|vs3bet)\|/.test(sp)) return '이 앱 차트에서 계속하는 손 전체';
    return '문제에 정해진 손 묶음';
  }
  function _itemOk(it, buckets) {
    if (!it || typeof it.id !== 'string' || !it.id || typeof it.eq !== 'number' || !(it.eq >= 0 && it.eq <= 1)) return false;
    var hero = _split(it.hero), board = _split(it.board);
    if (!hero || !board || hero.length !== 2 || STREET_KOR[board.length] === undefined || !_cardsOk(hero.concat(board))) return false;
    if (!it.vs || (it.vs.kind !== 'random' && !(it.vs.kind === 'range' && typeof it.vs.spot === 'string' && it.vs.spot))) return false;
    for (var i = 1; i < buckets.length - 1; i++) if (Math.abs(it.eq - buckets[i]) < EQ_MARGIN) return false;
    return true;
  }
  function _usable(opts) {
    var bk = _bank(opts);
    if (!bk || !Array.isArray(bk.items) || !bk.items.length) return null;
    var buckets = _bucketsOk(bk.buckets) ? bk.buckets : EQ_BUCKETS;
    var items = bk.items.filter(function(it) { return _itemOk(it, buckets); });
    return items.length ? { buckets: buckets, items: items } : null;
  }

  function _buildEq(it, buckets, rnd) {
    var hero = _split(it.hero), board = _split(it.board);
    var bi = bucketOf(it.eq, buckets);
    var labels = (buckets === EQ_BUCKETS) ? EQ_LABELS : [
      Math.round(buckets[1] * 100) + '% 미만',
      Math.round(buckets[1] * 100) + '~' + Math.round(buckets[2] * 100) + '%',
      Math.round(buckets[2] * 100) + '~' + Math.round(buckets[3] * 100) + '%',
      Math.round(buckets[3] * 100) + '% 이상'];
    var opts4 = labels.map(function(l, i) { var o = { v: i, label: l }; if (Math.abs(i - bi) === 1) o.near = true; return o; });
    // 구간은 순서가 있는 보기라 섞지 않는다(a = 가장 낮은 구간)
    var op = { options: [], answer: IDS[bi], values: {} };
    opts4.forEach(function(o, i) {
      var opt = { id: IDS[i], label: o.label };
      if (o.near) opt.near = true;
      op.options.push(opt); op.values[IDS[i]] = i;
    });
    var vsLabel = _spotLabel(it.vs);
    var range = it.vs.kind === 'range';
    var prompt = STREET_KOR[board.length] + '. 상대가 ' + (range ? vsLabel : '아무 손(랜덤)') + '일 때 내 승률(에쿼티)은 어느 구간일까?';
    var scene = { hero: hero, board: board };
    if (range) scene.range = { label: vsLabel, text: _spotText(it.vs) };
    else scene.note = '상대: 랜덤 손';
    return _base('eqbucket', {
      key: it.id, difficulty: BASE.eqbucket + (range ? 100 : 0),
      prompt: prompt, scene: scene, options: op.options, answer: op.answer,
      data: { id: it.id, hero: hero, board: board, vs: it.vs, eq: it.eq, buckets: buckets.slice(), values: op.values }
    });
  }

  function _verifyEq(q) {
    if (!_commonOk(q, 'eqbucket') || q.options.length !== 4) return false;
    var d = q.data;
    if (!d || typeof d.eq !== 'number' || !(d.eq >= 0 && d.eq <= 1) || !_bucketsOk(d.buckets)) return false;
    if (!_cardsOk((d.hero || []).concat(d.board || [])) || d.hero.length !== 2 || STREET_KOR[d.board.length] === undefined) return false;
    if (q.key !== d.id) return false;
    // 독립 경로: 내부 경계 중 eq 이하인 개수 = 구간 번호
    var idx = 0;
    for (var i = 1; i < 4; i++) if (d.eq >= d.buckets[i]) idx++;
    for (i = 1; i < 4; i++) if (Math.abs(d.eq - d.buckets[i]) < EQ_MARGIN) return false;
    if (q.answer !== IDS[idx]) return false;
    // 전역 은행에 같은 id가 있으면 값도 같아야 한다(주입 은행 문항은 건너뜀)
    if (typeof PUZZLE_SEEDS !== 'undefined' && PUZZLE_SEEDS && PUZZLE_SEEDS.eqbucket && Array.isArray(PUZZLE_SEEDS.eqbucket.items) && !d.injected) {
      var hit = PUZZLE_SEEDS.eqbucket.items.filter(function(x) { return x && x.id === d.id; })[0];
      if (hit && (hit.eq !== d.eq || _split(hit.hero).join('') !== d.hero.join('') || _split(hit.board).join('') !== d.board.join(''))) return false;
    }
    return true;
  }

  function _explainEq(q) {
    var d = q.data, bi = 0;
    for (var i = 1; i < 4; i++) if (d.eq >= d.buckets[i]) bi++;
    var lab = q.options[bi] ? q.options[bi].label : '';
    var vs = d.vs && d.vs.kind === 'range' ? _spotLabel(d.vs) : '랜덤 손';
    return { line: '상대 ' + vs + ' 기준 내 승률은 약 ' + _pct1(d.eq) + '(미리 계산한 엔진 값, 무승부는 절반)이라 ' + lab + ' 구간이에요.' };
  }

  var genEq = {
    title: '에쿼티 구간',
    next: function(rnd, opts) {
      rnd = _rnd(rnd);
      var u = _usable(opts);
      if (!u) return null;
      var injected = !!(opts && opts.bank);
      return _retry(function() {
        var q = _buildEq(_pick(u.items, rnd), u.buckets, rnd);
        if (q && injected) q.data.injected = true;
        return q;
      }, _verifyEq);
    },
    fromKey: function(key, rnd, opts) {
      rnd = _rnd(rnd);
      var u = _usable(opts);
      if (!u) return null;
      var it = u.items.filter(function(x) { return x.id === String(key); })[0];
      if (!it) return null;
      var q = _buildEq(it, u.buckets, rnd);
      if (q && opts && opts.bank) q.data.injected = true;
      return q && _verifyEq(q) ? q : null;
    },
    verify: _verifyEq,
    explain: _explainEq,
    ready: function(opts) { return !!_usable(opts); }
  };

  // ── 5~7. mdf, alpha, bluffratio(팟 = 벳 전 팟, 키 = 벳 비율) ──
  var SIZES = [
    { k: '1/4', v: 1 / 4, kor: '팟의 1/4' }, { k: '1/3', v: 1 / 3, kor: '팟의 1/3' }, { k: '1/2', v: 1 / 2, kor: '팟 절반' },
    { k: '2/3', v: 2 / 3, kor: '팟의 2/3' }, { k: '3/4', v: 3 / 4, kor: '팟의 3/4' }, { k: '1', v: 1, kor: '팟 크기' },
    { k: '1.5', v: 1.5, kor: '팟의 1.5배 오버벳' }, { k: '2', v: 2, kor: '팟의 2배 오버벳' }
  ];
  var SIZE_POTS = [4, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30, 36, 40, 45, 60];
  function _sizeByKey(k) { for (var i = 0; i < SIZES.length; i++) if (SIZES[i].k === k) return SIZES[i]; return null; }
  function _potsFor(sz) {
    // 벳이 0.5bb 단위로 딱 떨어지는 팟만(비율이 키와 정확히 같게)
    return SIZE_POTS.filter(function(P) { var x = P * sz.v * 2; return Math.abs(x - Math.round(x)) < 1e-9; });
  }

  var RATIO = {
    mdf: {
      title: 'MDF(최소 방어 빈도)',
      val: function(P, B) { return P / (P + B); },
      check: function(P, B) { return 1 - B / (P + B); },
      wrong: function(P, B, c) { return [B / (P + B), B / (P + 2 * B), (P + B) / (P + 2 * B), P / (P + 2 * B), c + 0.1, c - 0.1, c + 0.15]; },
      prompt: function(P, B, sz) { return '리버. 벳 전 팟 ' + _num(P) + 'bb, 상대 벳 ' + _num(B) + 'bb(' + sz.kor + '). MDF(내 레인지 중 최소 계속할 비율)는?'; },
      explain: function(P, B) {
        return 'MDF = 팟 ÷ (팟+벳) = ' + _num(P) + ' ÷ (' + _num(P) + '+' + _num(B) + ') = ' + _pct0(P / (P + B)) + '(팟은 벳 전). ' +
          '내 레인지 중 최소 이만큼은 강한 손부터 콜/레이즈로 계속한다는 비율이고 블러프캐처는 그 경계 손이에요. 균형 상대 가정이라 블러프 안 하는 상대에겐 무시해요.';
      }
    },
    alpha: {
      title: '알파(블러프 손익분기 폴드율)',
      val: function(P, B) { return B / (P + B); },
      check: function(P, B) { return 1 - P / (P + B); },
      wrong: function(P, B, c) { return [P / (P + B), B / (P + 2 * B), B / P, (P + B) / (P + 2 * B), c + 0.1, c - 0.1, c + 0.15]; },
      prompt: function(P, B, sz) { return '리버. 벳 전 팟 ' + _num(P) + 'bb, 내가 ' + _num(B) + 'bb 블러프(' + sz.kor + '). 상대가 최소 몇 % 폴드해야 본전일까(알파)?'; },
      explain: function(P, B) {
        return '알파 = 벳 ÷ (팟+벳) = ' + _num(B) + ' ÷ (' + _num(P) + '+' + _num(B) + ') = ' + _pct0(B / (P + B)) + '(팟은 벳 전). ' +
          _num(B) + 'bb를 걸어 ' + _num(P) + 'bb를 노리니, 상대가 이보다 자주 폴드하면 블러프가 이득이에요.';
      }
    },
    bluffratio: {
      title: '블러프 비율',
      val: function(P, B) { return B / (P + 2 * B); },
      // 독립 경로: 상대가 받는 팟 오즈 = 콜 ÷ (벳 포함 팟 + 콜)
      check: function(P, B) { var X = P + B, Y = B; return Y / (X + Y); },
      wrong: function(P, B, c) { return [B / (P + B), B / P, P / (P + 2 * B), P / (P + B), c + 0.08, c - 0.08, c + 0.12]; },
      prompt: function(P, B, sz) { return '리버. 벳 전 팟 ' + _num(P) + 'bb, 내가 ' + _num(B) + 'bb 벳(' + sz.kor + '). 상대 콜이 딱 본전이 되는 내 벳 중 블러프 비율은?'; },
      explain: function(P, B) {
        return '블러프 비율 = 벳 ÷ (팟+2벳) = ' + _num(B) + ' ÷ (' + _num(P) + '+' + _num(2 * B) + ') = ' + _pct0(B / (P + 2 * B)) + '(팟은 벳 전). ' +
          '상대가 받는 팟 오즈(팟 ' + _num(P + B) + 'bb, 콜 ' + _num(B) + 'bb)와 같아서 이 비율이면 상대 콜이 본전이에요(밸류는 콜에 이기고 블러프는 진다고 가정). 팟 크기 벳이면 33%.';
      }
    }
  };

  function _makeRatioGen(type) {
    var R = RATIO[type];
    function build(sz, rnd) {
      var pots = _potsFor(sz);
      if (!pots.length) return null;
      var P = _pick(pots, rnd), B = Math.round(P * sz.v * 2) / 2;
      var c = R.val(P, B);
      var wrongs = _wrongs(c, R.wrong(P, B, c), _pct0, 0.03, 3, 0.05, 0.01, 0.99);
      if (wrongs.length < 3) return null;
      var op = _options({ v: c, label: _pct0(c) }, wrongs, rnd);
      var scene = type === 'mdf' ? { potTotal: P + B, toCall: B, note: '벳 전 팟 ' + _num(P) + 'bb' } : { potTotal: P, note: '내 벳 ' + _num(B) + 'bb' };
      return _base(type, {
        key: sz.k, prompt: R.prompt(P, B, sz), scene: scene, options: op.options, answer: op.answer,
        difficulty: BASE[type] + (sz.v > 1 ? 50 : 0),
        data: { P: P, B: B, size: sz.k, values: op.values }
      });
    }
    function verify(q) {
      if (!_commonOk(q, type) || q.options.length !== 4) return false;
      var d = q.data, sz = _sizeByKey(d.size);
      if (!sz || q.key !== sz.k || !(d.P > 0) || !_close(d.B, d.P * sz.v)) return false;
      if (q.prompt !== R.prompt(d.P, d.B, sz)) return false;
      var c = R.check(d.P, d.B);
      if (_answerLabel(q) !== _pct0(c)) return false;
      for (var i = 0; i < q.options.length; i++) {
        var o = q.options[i];
        if (!/^\d+%$/.test(o.label)) return false;
        if (o.id !== q.answer && Math.abs(parseInt(o.label, 10) - Math.round(c * 100)) < 2) return false;
      }
      return true;
    }
    return {
      title: R.title,
      next: function(rnd) { rnd = _rnd(rnd); return _retry(function() { return build(_pick(SIZES, rnd), rnd); }, verify); },
      fromKey: function(key, rnd) {
        rnd = _rnd(rnd);
        var sz = _sizeByKey(String(key));
        if (!sz) return null;
        return _retry(function() { return build(sz, rnd); }, verify);
      },
      verify: verify,
      explain: function(q) { return { line: R.explain(q.data.P, q.data.B) }; },
      ready: function() { return true; }
    };
  }

  // ── 11. toygame(A/K/Q 리버 토이 게임, M6-WIDGET. 키 = 벳 비율, 정답 = 벳/(팟+2벳), 팟 = 벳 전 팟) ──
  // 나(벳하는 쪽)는 A(넛) 또는 Q(블러프), 상대는 K(블러프캐처: A에 지고 Q에 이김)만 든다. 벳 전 팟 P, 내 벳 B.
  //   상대 K의 콜 EV(폴드 = 0 기준, 내 벳 중 블러프 몫 f) = f x (P+B) - (1-f) x B → 0이 되는 f = B/(P+2B)(무차별 블러프 몫).
  //   내 Q 블러프의 EV(체크 = 0 기준, 상대 콜 빈도 c) = (1-c) x P - c x B → 0이 되는 c = P/(P+B)(콜 무차별 = MDF).
  // 레슨 위젯 toyGame(lessons/widgets/toy-game.js)도 이 함수로 숫자를 낸다(계약 H1).
  function toyCallEV(P, B, f) { return f * (P + B) - (1 - f) * B; }
  function toyBluffEV(P, B, c) { return (1 - c) * P - c * B; }
  function toyGame(P, B) {
    P = Number(P); B = Number(B);
    if (!(P > 0) || !(B > 0) || !isFinite(P) || !isFinite(B)) return null;
    return { P: P, B: B, bluffShare: B / (P + 2 * B), callFreq: P / (P + B), alpha: B / (P + B), ratio: B / P };
  }
  var TOY_SIZES = ['1/4', '1/3', '1/2', '2/3', '3/4', '1', '1.5', '2'];
  function _toyPrompt(P, B, sz) {
    return '토이 게임: 나는 A 또는 Q, 상대는 K. 벳 전 팟 ' + _num(P) + 'bb, 내 벳 ' + _num(B) + 'bb(' + sz.kor + '). K의 콜이 본전이 되는 내 벳 중 Q 몫은?';
  }
  function _buildToy(sz, rnd) {
    var pots = _potsFor(sz);
    if (!pots.length) return null;
    var P = _pick(pots, rnd), B = Math.round(P * sz.v * 2) / 2, t = toyGame(P, B);
    var c = t.bluffShare;
    // 흔한 착각: 알파(벳/(팟+벳)), K의 콜 빈도(MDF), 벳/팟, 밸류 몫, 반반
    var cands = [t.alpha, t.callFreq, B / P, (P + B) / (P + 2 * B), 0.5, c + 0.08, c - 0.08, c + 0.12];
    var wrongs = _wrongs(c, cands, _pct0, 0.03, 3, 0.05, 0.01, 0.99);
    if (wrongs.length < 3) return null;
    var op = _options({ v: c, label: _pct0(c) }, wrongs, rnd);
    return _base('toygame', {
      key: sz.k, prompt: _toyPrompt(P, B, sz), scene: { potTotal: P, note: 'A/K/Q 토이 게임, 내 벳 ' + _num(B) + 'bb' },
      options: op.options, answer: op.answer, difficulty: BASE.toygame + (sz.v > 1 ? 50 : 0),
      data: { P: P, B: B, size: sz.k, values: op.values }
    });
  }
  function _verifyToy(q) {
    if (!_commonOk(q, 'toygame') || q.options.length !== 4) return false;
    var d = q.data, sz = _sizeByKey(d.size);
    if (!sz || TOY_SIZES.indexOf(sz.k) < 0 || q.key !== sz.k || !(d.P > 0) || !_close(d.B, d.P * sz.v)) return false;
    if (q.prompt !== _toyPrompt(d.P, d.B, sz)) return false;
    // 독립 경로: K의 콜 EV를 블러프 몫의 함수로 직접 적고 0이 되는 점을 이분 탐색으로 찾는다(공식 B/(P+2B)를 쓰지 않음)
    function ev(f) { var win = f * (d.P + d.B), lose = (1 - f) * d.B; return win - lose; }
    var lo = 0, hi = 1;
    if (!(ev(lo) < 0 && ev(hi) > 0)) return false;
    for (var k = 0; k < 60; k++) { var mid = (lo + hi) / 2; if (ev(mid) < 0) lo = mid; else hi = mid; }
    var f = (lo + hi) / 2;
    if (_answerLabel(q) !== _pct0(f)) return false;
    var pc = Math.round(f * 100);
    return q.options.every(function(o) { return /^\d+%$/.test(o.label) && (o.id === q.answer || Math.abs(parseInt(o.label, 10) - pc) >= 2); });
  }
  function _explainToy(q) {
    var d = q.data, t = toyGame(d.P, d.B);
    return {
      line: 'K의 콜 EV = Q 몫 × (팟+벳) - A 몫 × 벳 = 0 → Q 몫 = 벳 ÷ (팟+2벳) = ' + _num(d.B) + ' ÷ (' + _num(d.P) + '+' + _num(2 * d.B) + ') = ' +
        _pct0(t.bluffShare) + '(팟은 벳 전). 이보다 블러프가 많으면 K는 콜, 적으면 폴드가 이득이에요.\n' +
        '거꾸로 K가 팟 ÷ (팟+벳) = ' + _pct0(t.callFreq) + '만큼 콜하면(MDF) 내 Q 블러프도 본전이라, 서로 상대를 무차별로 만드는 지점이에요.'
    };
  }
  var genToy = {
    title: '토이 게임',
    next: function(rnd) {
      rnd = _rnd(rnd);
      return _retry(function() { return _buildToy(_sizeByKey(_pick(TOY_SIZES, rnd)), rnd); }, _verifyToy);
    },
    fromKey: function(key, rnd) {
      rnd = _rnd(rnd);
      var sz = _sizeByKey(String(key));
      if (!sz || TOY_SIZES.indexOf(sz.k) < 0) return null;
      return _retry(function() { return _buildToy(sz, rnd); }, _verifyToy);
    },
    verify: _verifyToy,
    explain: _explainToy,
    ready: function() { return true; }
  };

  // ── 8. spr(계산값 exact, 구간 해석은 참고 한 줄) ──
  // 프리플랍 줄거리 템플릿: pot(o) = 플랍 팟, inv(o) = 한 사람이 넣은 칩. o = 오픈 크기
  function _half(x) { return Math.round(x * 2) / 2; }
  var SPR_TPL = [
    { id: 'btn-bb', line: function(o) { return 'BTN ' + _num(o) + 'bb 오픈, BB 콜'; }, pot: function(o) { return 2 * o + 0.5; }, inv: function(o) { return o; } },
    { id: 'co-btn', line: function(o) { return 'CO ' + _num(o) + 'bb 오픈, BTN 콜'; }, pot: function(o) { return 2 * o + 1.5; }, inv: function(o) { return o; } },
    { id: 'co-btn-bb', line: function(o) { return 'CO ' + _num(o) + 'bb 오픈, BTN과 BB 콜'; }, pot: function(o) { return 3 * o + 0.5; }, inv: function(o) { return o; } },
    { id: '3b-ip', line: function(o) { return 'CO ' + _num(o) + 'bb 오픈, BTN ' + _num(3 * o) + 'bb 3벳, CO 콜'; }, pot: function(o) { return 6 * o + 1.5; }, inv: function(o) { return 3 * o; } },
    { id: '3b-oop', line: function(o) { return 'BTN ' + _num(o) + 'bb 오픈, BB ' + _num(_half(3.5 * o)) + 'bb 3벳, BTN 콜'; }, pot: function(o) { return 2 * _half(3.5 * o) + 0.5; }, inv: function(o) { return _half(3.5 * o); } },
    { id: '4b', line: function(o) { return 'CO ' + _num(o) + 'bb 오픈, BTN ' + _num(3 * o) + 'bb 3벳, CO ' + _num(_half(2.3 * 3 * o)) + 'bb 4벳, BTN 콜'; },
      pot: function(o) { return 2 * _half(2.3 * 3 * o) + 1.5; }, inv: function(o) { return _half(2.3 * 3 * o); } }
  ];
  var SPR_OPENS = [2, 2.5, 3];
  var SPR_STACKS = [100, 100, 100, 60, 150, 200];
  function _sprTpl(id) { for (var i = 0; i < SPR_TPL.length; i++) if (SPR_TPL[i].id === id) return SPR_TPL[i]; return null; }
  function _f1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function _sprPrompt(d) {
    return '플랍 팟 ' + _num(d.pot) + 'bb, 남은 유효 스택 ' + _num(d.eff) + 'bb' + (d.start ? '(시작 ' + _num(d.start) + 'bb)' : '') + '. SPR은?';
  }
  function _sprNote(d) { return d.tpl ? _sprTpl(d.tpl).line(d.open) : null; }

  function _buildSpr(d, key, rnd) {
    var v = d.eff / d.pot;
    var cands = [];
    if (d.start && !_close(d.start, d.eff)) cands.push(d.start / d.pot);
    cands.push(v / 2, v * 2, d.pot / d.eff, v + 2, v - 2, v * 1.5);
    var wrongs = _wrongs(v, cands, _f1, 0.3, 3, 0.6, 0.05, null);
    if (wrongs.length < 3) return null;
    var op = _options({ v: v, label: _f1(v) }, wrongs, rnd);
    return _base('spr', {
      key: key || (_num(d.eff) + '|' + _num(d.pot)),
      difficulty: BASE.spr + (/^[34]b/.test(d.tpl || '') ? 50 : 0),
      prompt: _sprPrompt(d), scene: _sprScene(d),
      options: op.options, answer: op.answer,
      data: { pot: d.pot, eff: d.eff, start: d.start || null, tpl: d.tpl || null, open: d.open || null, values: op.values }
    });
  }

  function _sprScene(d) {
    var sc = { potTotal: d.pot, stack: d.eff };
    var note = _sprNote(d);
    if (note) sc.note = note;
    return sc;
  }

  function _verifySpr(q) {
    if (!_commonOk(q, 'spr') || q.options.length !== 4) return false;
    var d = q.data;
    if (!(d.pot > 0) || !(d.eff > 0)) return false;
    if (d.tpl) {
      var t = _sprTpl(d.tpl);
      if (!t || !_close(t.pot(d.open), d.pot) || !_close(d.start - t.inv(d.open), d.eff)) return false;
    }
    if (q.prompt !== _sprPrompt(d) || q.key !== _num(d.eff) + '|' + _num(d.pot)) return false;
    if (!q.scene || !_close(q.scene.potTotal, d.pot) || !_close(q.scene.stack, d.eff) || (q.scene.note || null) !== _sprNote(d)) return false;
    var spr = d.eff / d.pot;
    if (_answerLabel(q) !== _f1(spr)) return false;
    return q.options.every(function(o) { return /^\d+\.\d$/.test(o.label); });
  }

  function _explainSpr(q) {
    var d = q.data;
    return {
      line: 'SPR = 남은 유효 스택 ÷ 팟 = ' + _num(d.eff) + ' ÷ ' + _num(d.pot) + ' = ' + _f1(d.eff / d.pot) + '.\n' +
        '참고: SPR이 낮을수록(약 4 이하) 탑페어로도 올인까지 가기 쉽고, 높을수록(약 10 이상) 더 강한 손이 필요하다는 통념이에요.',
      ref: '참고'
    };
  }

  var genSpr = {
    title: 'SPR 계산',
    next: function(rnd) {
      rnd = _rnd(rnd);
      return _retry(function() {
        var t = _pick(SPR_TPL, rnd), o = _pick(SPR_OPENS, rnd), S0 = _pick(SPR_STACKS, rnd);
        var d = { tpl: t.id, open: o, start: S0, pot: t.pot(o), eff: S0 - t.inv(o) };
        if (!(d.eff > 0)) return null;
        return _buildSpr(d, null, rnd);
      }, _verifySpr);
    },
    fromKey: function(key, rnd) {
      rnd = _rnd(rnd);
      var m = /^(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)$/.exec(String(key));
      if (!m) return null;
      var eff = parseFloat(m[1]), pot = parseFloat(m[2]);
      if (!(eff > 0 && pot > 0 && eff <= 10000 && pot <= 10000)) return null;
      return _retry(function() { return _buildSpr({ eff: eff, pot: pot }, String(key), rnd); }, _verifySpr);
    },
    verify: _verifySpr,
    explain: _explainSpr,
    ready: function() { return true; }
  };

  // ── 9. geosize(기하 사이즈) ──
  var GEO_POTS = [5.5, 6, 6.5, 8, 10, 12, 15, 18, 20, 24, 30, 40];
  var GEO_STACKS = [30, 40, 50, 60, 75, 90, 97.5, 100, 120, 150];
  var GEO_STREETS = { 2: '턴, 리버', 3: '플랍, 턴, 리버' };
  function geoSize(P, S, n) { return (Math.pow(1 + 2 * S / P, 1 / n) - 1) / 2; }
  function _geoPrompt(P, S, n) {
    return '팟 ' + _num(P) + 'bb, 유효 스택 ' + _num(S) + 'bb, 벳 ' + n + '번(' + GEO_STREETS[n] + '). 매번 같은 팟 비율로 쳐서 마지막에 올인하려면 팟의 약 몇 %?';
  }
  function _buildGeo(P, S, n, rnd) {
    if (!GEO_STREETS[n]) return null;
    var b = geoSize(P, S, n);
    if (!(b >= 0.25 && b <= 2)) return null;
    var cands = [S / (n * P), Math.pow(1 + S / P, 1 / n) - 1, 2 * b, b + 0.15, b - 0.15, b + 0.25];
    var wrongs = _wrongs(b, cands, _pct0, 0.05, 3, 0.1, 0.05, 5);
    if (wrongs.length < 3) return null;
    var op = _options({ v: b, label: _pct0(b) }, wrongs, rnd);
    return _base('geosize', {
      key: _num(P) + '|' + _num(S) + '|' + n, variant: String(n),
      difficulty: BASE.geosize + (n === 3 ? 50 : 0),
      prompt: _geoPrompt(P, S, n), scene: { potTotal: P, stack: S },
      options: op.options, answer: op.answer,
      data: { P: P, S: S, n: n, values: op.values }
    });
  }
  function _verifyGeo(q) {
    if (!_commonOk(q, 'geosize') || q.options.length !== 4) return false;
    var d = q.data;
    if (!(d.P > 0) || !(d.S > 0) || !GEO_STREETS[d.n]) return false;
    if (q.prompt !== _geoPrompt(d.P, d.S, d.n) || q.key !== _num(d.P) + '|' + _num(d.S) + '|' + d.n) return false;
    // 독립 경로: 이분 탐색으로 "n번 벳/콜 뒤 한 사람이 넣은 칩 = 스택"인 비율을 찾는다
    function invested(b) { var pot = d.P, inv = 0; for (var i = 0; i < d.n; i++) { var bet = b * pot; inv += bet; pot += 2 * bet; } return inv; }
    var lo = 0, hi = 10;
    for (var k = 0; k < 80; k++) { var mid = (lo + hi) / 2; if (invested(mid) < d.S) lo = mid; else hi = mid; }
    var b = (lo + hi) / 2;
    if (Math.abs(invested(b) - d.S) > 1e-6 * d.S) return false;
    if (_answerLabel(q) !== _pct0(b)) return false;
    var pc = Math.round(b * 100);
    return q.options.every(function(o) { return /^\d+%$/.test(o.label) && (o.id === q.answer || Math.abs(parseInt(o.label, 10) - pc) >= 5); });
  }
  function _explainGeo(q) {
    var d = q.data, base = 1 + 2 * d.S / d.P, root = Math.pow(base, 1 / d.n), b = geoSize(d.P, d.S, d.n);
    var rootName = d.n === 2 ? '제곱근' : '세제곱근';
    return {
      line: '기하 사이즈 = ((1 + 2×스택÷팟)의 ' + rootName + ' - 1) ÷ 2 = ((1 + 2×' + _num(d.S) + '÷' + _num(d.P) + ')의 ' + rootName + ' - 1) ÷ 2 = (' +
        root.toFixed(3) + ' - 1) ÷ 2 ≈ ' + _pct0(b) + '. 벳과 콜이 오갈 때마다 팟이 (1 + 2×비율)배로 커져 ' + d.n + '번 뒤 스택이 다 들어가요.'
    };
  }
  var genGeo = {
    title: '기하 사이즈',
    next: function(rnd) {
      rnd = _rnd(rnd);
      return _retry(function() { return _buildGeo(_pick(GEO_POTS, rnd), _pick(GEO_STACKS, rnd), rnd() < 0.5 ? 2 : 3, rnd); }, _verifyGeo);
    },
    fromKey: function(key, rnd) {
      rnd = _rnd(rnd);
      var m = /^(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)\|([23])$/.exec(String(key));
      if (!m) return null;
      var P = parseFloat(m[1]), S = parseFloat(m[2]), n = parseInt(m[3], 10);
      if (!(P > 0 && S > 0 && P <= 10000 && S <= 10000)) return null;
      return _retry(function() { return _buildGeo(P, S, n, rnd); }, _verifyGeo);
    },
    verify: _verifyGeo,
    explain: _explainGeo,
    ready: function() { return true; }
  };

  // ── 10. variance(SD 90bb/100, 95% 구간) ──
  var VAR_SD = 90, VAR_Z = 1.96;
  var VAR_RATES = [0, 2, 3, 5, 8, 10];
  var VAR_HANDS = [1000, 2500, 5000, 10000, 20000, 40000, 100000];
  function varianceBand(w, N) {
    var center = w * N / 100, half = VAR_Z * VAR_SD * Math.sqrt(N / 100);
    return { center: center, half: half, lo: center - half, hi: center + half };
  }
  function _bandLabel(lo, hi) { return _signed(lo) + 'bb ~ ' + _signed(hi) + 'bb'; }
  function _handsKor(N) { return (N % 10000 === 0) ? (N / 10000) + '만' : _comma(N); }
  function _varPrompt(w, N) { return '승률 ' + w + 'bb/100으로 ' + _handsKor(N) + ' 핸드를 친다(표준편차 90bb/100 가정). 결과가 95% 확률로 들어올 구간은?'; }
  function _buildVar(w, N, rnd) {
    var band = varianceBand(w, N), c = band.center;
    var correct = { v: 'ok', label: _bandLabel(band.lo, band.hi) };
    var raw = [
      { v: 'sd1', h: VAR_SD * Math.sqrt(N / 100), c: c, near: true },              // 1.96을 빼먹음(68% 구간)
      { v: 'nosqrt', h: VAR_Z * VAR_SD * (N / 100), c: c },                         // 제곱근을 빼먹음
      { v: 'sqrtN', h: VAR_Z * VAR_SD * Math.sqrt(N), c: c },                       // 100핸드 단위를 잊음
      { v: 'center', h: band.half, c: w * N }                                        // 가운데를 100으로 안 나눔
    ];
    var seen = {}, wrongs = [];
    seen[correct.label] = true;
    _shuffle(raw, rnd).forEach(function(r) {
      var lab = _bandLabel(r.c - r.h, r.c + r.h);
      if (seen[lab] || wrongs.length >= 3) return;
      seen[lab] = true;
      var o = { v: r.v, label: lab };
      if (r.near) o.near = true;
      wrongs.push(o);
    });
    if (wrongs.length < 3) return null;
    var op = _options(correct, wrongs, rnd);
    return _base('variance', {
      key: w + '|' + N, difficulty: BASE.variance + (N >= 40000 ? 50 : 0),
      prompt: _varPrompt(w, N), scene: { note: '표준편차 90bb/100 가정' },
      options: op.options, answer: op.answer,
      data: { w: w, N: N, values: op.values }
    });
  }
  function _verifyVar(q) {
    if (!_commonOk(q, 'variance') || q.options.length !== 4) return false;
    var d = q.data;
    if (typeof d.w !== 'number' || !(d.N > 0) || q.key !== d.w + '|' + d.N || q.prompt !== _varPrompt(d.w, d.N)) return false;
    // 독립 경로: 1핸드 표준편차 = 90/√100 = 9bb, N핸드 합 표준편차 = 9 × √N, 평균 = (w/100) × N
    var sd = (VAR_SD / Math.sqrt(100)) * Math.sqrt(d.N), mean = (d.w / 100) * d.N;
    if (_answerLabel(q) !== _bandLabel(mean - VAR_Z * sd, mean + VAR_Z * sd)) return false;
    return q.options.every(function(o) { return /bb ~ [+-]?[\d,]+bb$/.test(o.label); });
  }
  function _explainVar(q) {
    var d = q.data, b = varianceBand(d.w, d.N);
    return {
      line: '가운데 = ' + d.w + ' × ' + _comma(d.N) + ' ÷ 100 = ' + _comma(b.center) + 'bb, 폭 = 1.96 × 90 × √(' + _comma(d.N) + ' ÷ 100) = ' + _comma(b.half) + 'bb → ' +
        _bandLabel(b.lo, b.hi) + '(100핸드당 ±' + _num(b.half / (d.N / 100)) + 'bb). 실력이 같아도 결과가 이만큼 퍼져요.'
    };
  }
  var genVar = {
    title: '분산 구간',
    next: function(rnd) { rnd = _rnd(rnd); return _retry(function() { return _buildVar(_pick(VAR_RATES, rnd), _pick(VAR_HANDS, rnd), rnd); }, _verifyVar); },
    fromKey: function(key, rnd) {
      rnd = _rnd(rnd);
      var m = /^(-?\d+(?:\.\d+)?)\|(\d+)$/.exec(String(key));
      if (!m) return null;
      var w = parseFloat(m[1]), N = parseInt(m[2], 10);
      if (!(N >= 100 && N <= 10000000) || Math.abs(w) > 100) return null;
      return _retry(function() { return _buildVar(w, N, rnd); }, _verifyVar);
    },
    verify: _verifyVar,
    explain: _explainVar,
    ready: function() { return true; }
  };

  // ── 등록(C1). stage = 부록 A에서 처음 나오는 단계, group = 'math'(M2-P1 TYPE_META 정본과 같게, eqbucket 포함) ──
  var META = {
    'outs': { stage: 2, group: 'math', concept: 'outs' },          // s2-07
    'outs-x4': { stage: 2, group: 'math', concept: 'outs' },       // s2-07
    'potodds': { stage: 2, group: 'math', concept: 'pot_odds' },   // s2-06
    'eqbucket': { stage: 2, group: 'math', concept: 'equity' },    // s2-08
    'spr': { stage: 3, group: 'math', concept: 'spr' },            // s3-09
    'mdf': { stage: 4, group: 'math', concept: 'mdf' },            // s4-05
    'alpha': { stage: 4, group: 'math', concept: 'alpha' },        // s4-06, s4-09
    'bluffratio': { stage: 4, group: 'math', concept: 'value_bluff' }, // s4-06
    'geosize': { stage: 5, group: 'math', concept: 'spr' },        // s5-06
    'variance': { stage: 6, group: 'math', concept: 'variance' },  // s6-06
    'toygame': { stage: 5, group: 'math', concept: 'value_bluff' }  // s5-04(M6-WIDGET)
  };
  // 기본 난이도(부록 C). 정본은 Puzzles.TYPE_META(M2-P1)이고 이 값은 문항의 difficulty 기준점
  var BASE = { 'outs': 1300, 'outs-x4': 1350, 'potodds': 1200, 'eqbucket': 1300, 'spr': 1450, 'mdf': 1700, 'alpha': 1700, 'bluffratio': 1700, 'geosize': 2100, 'variance': 2000, 'toygame': 2000 };

  var GENS = {
    'outs': genOuts, 'outs-x4': genX4, 'potodds': genPotodds, 'eqbucket': genEq,
    'mdf': _makeRatioGen('mdf'), 'alpha': _makeRatioGen('alpha'), 'bluffratio': _makeRatioGen('bluffratio'),
    'spr': genSpr, 'geosize': genGeo, 'variance': genVar, 'toygame': genToy
  };

  if (typeof Puzzles !== 'undefined' && Puzzles && typeof Puzzles.register === 'function') {
    Object.keys(GENS).forEach(function(t) {
      var m = META[t];
      Puzzles.register(t, GENS[t], { stage: m.stage, group: m.group, concept: m.concept });
    });
  }

  var api = {
    GENS: GENS, META: META, BASE: BASE, OUTS_TABLE: OUTS_TABLE, OUTS_LIST: OUTS_LIST, EQ_BUCKETS: EQ_BUCKETS,
    countOuts: countOuts, outsPct: outsPct, bucketOf: bucketOf, geoSize: geoSize, varianceBand: varianceBand, oddsLabel: oddsLabel,
    toyGame: toyGame, toyCallEV: toyCallEV, toyBluffEV: toyBluffEV, TOY_SIZES: TOY_SIZES
  };
  if (typeof module !== 'undefined' && module) module.exports = api;
  return api;
})();
