// engine/win-chance.js (로컬 G3 LIVE, 설계 원문 docs/NEXT_BATCH_DESIGN.md 3.1절 2번, 3.3절)
// 액션별 이길 확률의 상대 모델(WinChance): 결정마다 한 번 비동기로 상대 연속 레인지 모델을 준비하고, 드래그 중에는 캐시만 읽는다(MC 0회).
// 계약(P0 고정):
//   prepare(state, opts{ eq, seed, onReady }) → token(순번 정수). requestIdleCallback(최대 400ms, 없으면 rAF → setTimeout 0) 뒤 두 덩이(접기 모델, 콜 받은 승률 MC)로 계산하고,
//     더 새 prepare나 clear가 오면 묵은 결과는 버린다. 같은 상황(키)이 이미 준비돼 있으면 다시 계산하지 않고 onReady를 바로 부른다.
//   at(amount) → { f(모두 접을 확률 0~1), eqC(콜 받았을 때 승률 0~1), big, variant, ready:true } | null(준비 전, 동기, 할당 1개)
//   model(state, opts) → 같은 계산을 동기로 끝낸 모델 객체(순수, 테스트와 미리보기용) | null(상대 없음)
//   target(state) → 상대 이름(벳 직면이면 state.lastRaiser, 아니면 큐의 내 뒤 첫 생존 빌런, 없으면 행동 순서상 내 뒤 첫 생존 빌런) | null
//   ready() → 불리언, clear() → 캐시와 순번 폐기
// 규칙은 엔진 빌런(ai/villain.js) 그대로다(읽기만, 해시 파일 무수정).
//   프리플랍(Villain._preflopAction): 히어로가 올리면 모든 생존 빌런은 streetBetCount + 1 단계를 마주한다.
//     1단계 연속 = threebet_range ∪ call_vs_raise[자리], 2단계 = fourbet ∪ call_vs_3bet(콜 금액 ≤ 스택 35%일 때만),
//     3단계 이상 = jam ∪ 모든 손(콜 금액 ≤ 스택 10%일 때만). 진입 레인지는 그 빌런이 이번 스트리트에 한 일로 정한다
//     (오픈 = rfi[자리](림프 규칙이 있으면 limp_unless 교집합), 3벳 = threebet_range, 4벳 = fourbet, 콜 = call_vs_raise 또는 call_vs_3bet,
//     림프 = rfi 중 limp_unless 밖 ∪ call_vs_raise, 아직 안 함 또는 블라인드만 = 모든 손).
//     변형 2개: normal(조건부 콜 포함), jam(콜 금액이 한도를 넘어 조건부 콜 제외). 설계 3.3절 3번의 '상대 스택 40%면 fourbet ∪ jam'은
//     엔진에 없는 규칙이라(jamOr의 40%는 빌런 자신의 레이즈 크기 규칙) 엔진 실제 동작을 따른다.
//   포스트플랍(Villain._postflopAction 벳 직면): 콤보마다 Villain._handStrength, 연속 확률 nut 1, strong 1,
//     medium big이면 1 - 0.3ftc(아니면 1), weak-pair 1 - min(.95, ftc(big ? 1.2 : .7)), air 1 - min(.95, 1.6ftc + .15),
//     big = c/(P' + c) ≥ 0.30(c = R - 그 빌런이 이번 스트리트에 낸 칩, P' = P + (R - h)). 변형 2개(small, big).
//     대상 빌런의 레인지는 state.villainRange(없으면 랜덤 표본), 다른 생존 빌런은 랜덤 표본.
//   f = 생존 빌런 모두가 접을 확률(각자 독립, 올인 빌런이 있으면 0), eqC = 대상 빌런의 연속 레인지(연속 확률 가중) 상대 승률.
//   유형 은닉(state.hideTypes)이면 모든 빌런을 일반형(TAG 표, ftc 0.35)으로 본다(유형 유출 방지). Mixed는 엔진처럼 스트리트별 표.
// 예산(이 PC): 준비 2덩이 합 25ms 이하(MC 포스트플랍 500회 1벌(두 변형 공유), 프리플랍 600회(변형이 다르면 늘 연속 360회 + 조건부 콜 300회)), at() 0.1ms 이하.
// 표본은 Drills.rng(seed)(없으면 같은 mulberry32)와 HandEval.evaluateIdx. 상대의 실제 홀카드는 절대 읽지 않는다.
// 규약: 로드 시 DOM 접근 없음(typeof 가드), node 러너 안전.
var WinChance = (function() {
  var RK = '23456789TJQKA', SU = 'shdc';
  var BIG = 0.30;
  var MC_N = 500;           // 포스트플랍 콜 받은 승률 MC 횟수(small과 big을 같은 표본으로, 표준오차 약 0.022)
  var MC_N_PRE = 600;       // 프리플랍 변형마다 MC 횟수(보드 5장을 다 깔아 분산이 커서 더 많이, 표준오차 약 0.02)
  var SAMPLE_TARGET = 300;  // 레인지가 없을 때 대상 빌런 랜덤 표본 콤보 수
  var SAMPLE_OTHER = 120;   // 다른 빌런 랜덤 표본 콤보 수(접기 비율만 쓴다)

  var _token = 0, _cur = null, _pend = null;
  var hooks = { sched: null, defer: null };   // 테스트 주입: sched(fn) = rAF 대신, defer(fn) = setTimeout 0 대신

  // ── 카드, 클래스, 레인지 ──
  function _ci(c) {
    if (!c) return -1;
    var r = RK.indexOf(c.rank), s = SU.indexOf(c.suit);
    return (r < 0 || s < 0) ? -1 : r * 4 + s;
  }
  function _card(i) { return { rank: RK.charAt(i >> 2), suit: SU.charAt(i & 3) }; }
  function _clsOf(a, b) {
    var ra = a >> 2, rb = b >> 2, hi = ra > rb ? ra : rb, lo = ra > rb ? rb : ra;
    return RK.charAt(hi) + RK.charAt(lo) + (hi === lo ? '' : ((a & 3) === (b & 3) ? 's' : 'o'));
  }
  var _byClass = null, _labels = null;
  function _classes() {
    if (_byClass) return _byClass;
    _byClass = Object.create(null); _labels = [];
    for (var a = 0; a < 52; a++) for (var b = a + 1; b < 52; b++) {
      var k = _clsOf(a, b);
      if (!_byClass[k]) { _byClass[k] = []; _labels.push(k); }
      _byClass[k].push([a, b]);
    }
    return _byClass;
  }
  var ALL = 'ALL';
  var _parsed = Object.create(null);
  function _set(str) {
    if (!str || typeof str !== 'string') return [];
    var hit = _parsed[str];
    if (hit) return hit;
    var out = [];
    if (typeof Range !== 'undefined' && Range && typeof Range.parse === 'function') {
      try { Range.parse(str).forEach(function(k) { out.push(k); }); } catch (e) { out = []; }
    }
    _parsed[str] = out;
    return out;
  }
  function _toObj(list) { var o = Object.create(null); for (var i = 0; i < list.length; i++) o[list[i]] = 1; return o; }
  function _union(A, B) {
    if (A === ALL || B === ALL) return ALL;
    var o = _toObj(A), out = A.slice();
    for (var i = 0; i < B.length; i++) if (!o[B[i]]) { o[B[i]] = 1; out.push(B[i]); }
    return out;
  }
  function _inter(A, B) {
    if (A === ALL) return B;
    if (B === ALL) return A;
    var o = _toObj(B);
    return A.filter(function(k) { return o[k]; });
  }
  function _minus(A, B) {
    if (B === ALL) return [];
    _classes();
    var o = _toObj(B);
    return (A === ALL ? _labels : A).filter(function(k) { return !o[k]; });
  }
  function _labelsOf(A) { _classes(); return A === ALL ? _labels : A; }
  // 데드 카드를 뺀 콤보 수
  function _count(A, dead) {
    var byC = _classes(), L = _labelsOf(A), n = 0;
    for (var i = 0; i < L.length; i++) {
      var cs = byC[L[i]];
      if (!cs) continue;
      for (var j = 0; j < cs.length; j++) if (!dead[cs[j][0]] && !dead[cs[j][1]]) n++;
    }
    return n;
  }
  function _combosOf(A, dead) {
    var byC = _classes(), L = _labelsOf(A), out = [];
    for (var i = 0; i < L.length; i++) {
      var cs = byC[L[i]];
      if (!cs) continue;
      for (var j = 0; j < cs.length; j++) if (!dead[cs[j][0]] && !dead[cs[j][1]]) out.push(cs[j]);
    }
    return out;
  }

  function _rng(seed) {
    if (typeof Drills !== 'undefined' && Drills && typeof Drills.rng === 'function') return Drills.rng(seed);
    var a = (seed >>> 0) || 0x9e3779b9;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _hash(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  // ── 대상과 프로필 ──
  var PRE_ORDER = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'], POST_ORDER = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
  function _live(st) {
    var players = (st && st.players) || {}, folded = (st && st.folded) || {};
    var names = (st && st.names) || Object.keys(players);
    return names.filter(function(n) { return n !== 'Hero' && players[n] && !players[n].isHero && !folded[n]; });
  }
  function _toCall(st) {
    var h = (st.playerBets && st.playerBets.Hero) || 0;
    return Math.max(0, (st.currentBet || 0) - h);
  }
  function target(st) {
    if (!st || !st.players) return null;
    var live = _live(st);
    if (!live.length) return null;
    var lr = st.lastRaiser;
    if (_toCall(st) > 0 && lr && lr !== 'Hero' && live.indexOf(lr) >= 0) return lr;
    var q = st.pendingQueue || [];
    for (var i = 0; i < q.length; i++) if (q[i] !== 'Hero' && live.indexOf(q[i]) >= 0) return q[i];
    var order = st.street === 'preflop' ? PRE_ORDER : POST_ORDER;
    var hp = st.players.Hero ? order.indexOf(st.players.Hero.pos) : -1;
    for (var k = 1; k <= order.length; k++) {
      var pos = order[(hp + k + order.length) % order.length];
      for (var j = 0; j < live.length; j++) if (st.players[live[j]].pos === pos) return live[j];
    }
    return live[0];
  }
  function _profile(type, street, generic) {
    var VP = typeof VillainProfiles !== 'undefined' ? VillainProfiles : null;
    if (!VP) return null;
    if (generic) return VP.TAG || null;
    if (type === 'Mixed' && VP.Mixed) {
      var map = VP.Mixed.behavior_by_street || { preflop: 'TAG', flop: 'LAG', turn: 'TAG', river: 'Fish' };
      return VP[map[street] || 'TAG'] || VP.TAG;
    }
    var p = VP[type];
    return (p && p.rfi) ? p : (VP.TAG || null);
  }

  // ── 1덩이: 접기 모델 ──
  function _deadOf(st) {
    var dead = new Uint8Array(52), hero = [], board = [];
    (st.heroCards || []).forEach(function(c) { var i = _ci(c); if (i >= 0) { dead[i] = 1; hero.push(i); } });
    (st.board || []).forEach(function(c) { var i = _ci(c); if (i >= 0) { dead[i] = 1; board.push(i); } });
    return { dead: dead, hero: hero, board: board };
  }

  // 프리플랍: 빌런 한 명의 진입 레인지
  function _preEntry(prof, st, name, pos) {
    var sbc = st.streetBetCount || 0;
    var bet = (st.playerBets && st.playerBets[name]) || 0;
    var posted = pos === 'BB' ? (st.bigBlind || 1) : pos === 'SB' ? 0.5 * (st.bigBlind || 1) : 0;
    var cvr = (prof.call_vs_raise || {})[pos];
    var rfi = (prof.rfi || {})[pos];
    if (name === st.lastRaiser) {
      if (sbc <= 1) {
        if (!rfi) return ALL;
        return prof.limp_unless ? _inter(_set(rfi), _set(prof.limp_unless)) : _set(rfi);
      }
      if (sbc === 2) return _set(prof.threebet_range);
      if (sbc === 3) return _set(prof.fourbet);
      return _set(prof.jam);
    }
    if (bet > posted + 1e-9) {
      if (sbc === 0) {
        var limp = (rfi && prof.limp_unless) ? _minus(_set(rfi), _set(prof.limp_unless)) : [];
        var lr = _union(limp, cvr ? _set(cvr) : []);
        return lr.length ? lr : ALL;
      }
      if (sbc === 1) return cvr ? _set(cvr) : ALL;
      if (sbc === 2) return bet >= (st.currentBet || 0) - 1e-9 ? _set(prof.call_vs_3bet) : (cvr ? _set(cvr) : ALL);
      return ALL;
    }
    return ALL;
  }
  // 프리플랍: 히어로 레이즈를 마주했을 때 { always, cond, k(조건부 콜 한도: 콜 금액 ≤ k x 스택) }
  function _preCont(prof, st, pos) {
    var faces = (st.streetBetCount || 0) + 1;
    var cvr = (prof.call_vs_raise || {})[pos];
    if (faces === 1) return { always: _union(_set(prof.threebet_range), cvr ? _set(cvr) : []), cond: [], k: Infinity };
    if (faces === 2) return { always: _set(prof.fourbet), cond: _set(prof.call_vs_3bet), k: 0.35 };
    return { always: _set(prof.jam), cond: ALL, k: 0.1 };
  }

  // 포스트플랍 연속 확률(ai/villain.js 벳 직면 분기 그대로)
  function _contPost(strength, big, ftc) {
    if (strength === 'nut' || strength === 'strong') return 1;
    if (strength === 'medium') return big ? 1 - ftc * 0.3 : 1;
    if (strength === 'weak-pair') return 1 - Math.min(0.95, ftc * (big ? 1.2 : 0.7));
    return 1 - Math.min(0.95, ftc * 1.6 + 0.15);
  }
  function _sample(list, n, rnd) {
    if (list.length <= n) return list;
    var a = list.slice();
    for (var i = 0; i < n; i++) {
      var j = i + ((rnd() * (a.length - i)) | 0), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    a.length = n;
    return a;
  }
  function _rangeCombos(range, dead) {
    if (!range) return null;
    var list = range instanceof Set ? Array.from(range) : (Array.isArray(range) ? range : null);
    if (!list || !list.length) return null;
    var byC = _classes(), out = [], seen = Object.create(null), any = false;
    list.forEach(function(k) {
      if (typeof k !== 'string') return;
      if (k.length === 4) {
        var x = _ci({ rank: k.charAt(0), suit: k.charAt(1) }), y = _ci({ rank: k.charAt(2), suit: k.charAt(3) });
        if (x < 0 || y < 0 || x === y) return;
        any = true;
        var p = x < y ? [x, y] : [y, x];
        if (!dead[p[0]] && !dead[p[1]] && !seen[p[0] * 52 + p[1]]) { seen[p[0] * 52 + p[1]] = 1; out.push(p); }
        return;
      }
      var cs = byC[k];
      if (!cs) return;
      any = true;
      for (var j = 0; j < cs.length; j++) {
        var c = cs[j];
        if (!dead[c[0]] && !dead[c[1]] && !seen[c[0] * 52 + c[1]]) { seen[c[0] * 52 + c[1]] = 1; out.push(c); }
      }
    });
    return any ? out : null;
  }
  function _strengthOf(c, boardCards) {
    try { return Villain._handStrength([_card(c[0]), _card(c[1])], boardCards); } catch (e) { return 'air'; }
  }

  function _key(st) {
    function cs(a) { return (a || []).map(function(c) { return c ? c.rank + c.suit : ''; }).join(''); }
    var folded = Object.keys(st.folded || {}).filter(function(n) { return st.folded[n]; }).sort().join(',');
    var vr = st.villainRange;
    var vrk = vr ? (Array.isArray(vr) ? vr.length + ':' + vr.slice(0, 4).join('') : 'set') : '-';
    var who = _live(st).map(function(n) {
      return n + ':' + st.players[n].type + ':' + st.players[n].pos + ':' + ((st.playerBets && st.playerBets[n]) || 0) + ':' + ((st.stacks && st.stacks[n]) || 0);
    }).join(',');
    return [st.seed, st.handNum, st.street, cs(st.heroCards), cs(st.board), st.pot, st.currentBet,
      (st.playerBets && st.playerBets.Hero) || 0, st.streetBetCount || 0, st.lastRaiser || '', folded,
      st.hideTypes ? 1 : 0, vrk, who].join('|');
  }

  // 1덩이: 빌런별 접기 비율과 대상의 연속 가중 콤보 목록
  function _foldPart(st, opts) {
    if (!st || !st.players || !st.heroCards || st.heroCards.length < 2) return null;
    if (typeof VillainProfiles === 'undefined') return null;
    var live = _live(st);
    if (!live.length) return null;
    var tgt = target(st);
    var generic = !!st.hideTypes;
    var pre = st.street === 'preflop' || !(st.board && st.board.length >= 3);
    var key = _key(st);
    var seed = (opts && opts.seed != null) ? (opts.seed >>> 0) : _hash(key);
    var rnd = _rng(seed);
    var D = _deadOf(st);
    var h = (st.playerBets && st.playerBets.Hero) || 0;
    var vill = [], ti = -1, tw = null;
    var boardCards = pre ? null : st.board.slice(0, 5);
    var randomAll = null;
    for (var i = 0; i < live.length; i++) {
      var name = live[i], pl = st.players[name], pos = pl.pos;
      var prof = _profile(pl.type, st.street, generic);
      if (!prof) return null;
      var bet = (st.playerBets && st.playerBets[name]) || 0;
      var stack = (st.stacks && st.stacks[name]) || 0;
      var v = { name: name, pos: pos, bet: bet, stack: stack };
      var isT = name === tgt;
      if (pre) {
        var entry = _preEntry(prof, st, name, pos);
        var cont = _preCont(prof, st, pos);
        var nE = _count(entry, D.dead);
        var always = _inter(cont.always, entry);
        var condOnly = _minus(_inter(cont.cond, entry), always);
        var nA = _count(always, D.dead), nC = _count(condOnly, D.dead);
        v.lim = cont.k === Infinity ? Infinity : bet + cont.k * stack;
        v.fN = nE > 0 ? 1 - (nA + nC) / nE : 1;
        v.fJ = nE > 0 ? 1 - nA / nE : 1;
        if (isT) tw = { always: always, condOnly: condOnly, same: nC === 0 };
      } else {
        var combos = null;
        if (isT) combos = _rangeCombos(st.villainRange, D.dead);
        if (!combos) {
          if (!randomAll) randomAll = _combosOf(ALL, D.dead);
          combos = _sample(randomAll, isT ? SAMPLE_TARGET : SAMPLE_OTHER, rnd);
        }
        var ftc = typeof prof.fold_to_cbet === 'number' ? prof.fold_to_cbet : 0.35;
        var sS = 0, sB = 0, wS = isT ? new Float64Array(combos.length) : null, wB = isT ? new Float64Array(combos.length) : null;
        for (var j = 0; j < combos.length; j++) {
          var stg = _strengthOf(combos[j], boardCards);
          var cS = _contPost(stg, false, ftc), cB = _contPost(stg, true, ftc);
          sS += cS; sB += cB;
          if (isT) { wS[j] = cS; wB[j] = cB; }
        }
        var n = combos.length || 1;
        v.fS = 1 - sS / n;
        v.fB = 1 - sB / n;
        if (isT) tw = { combos: combos, small: wS, big: wB };
      }
      if (isT) ti = vill.length;
      vill.push(v);
    }
    return { key: key, seed: seed, rnd: rnd, pre: pre, street: st.street, target: tgt, ti: ti, generic: generic,
      P: st.pot || 0, h: h, X: st.currentBet || 0, vill: vill, tw: tw, D: D, eq: (opts && typeof opts.eq === 'number') ? opts.eq : null };
  }

  // 콜 받은 가지 승률: 가중치 w1에 비례한 층화 표본(콤보) + 남은 보드 무작위. 리버(보드 5장)는 콤보 전수.
  // w2가 있으면 같은 표본을 비율 r = w2/w1로 다시 가중해 두 번째 변형 값도 낸다(포스트플랍 small/big은 r이 0.5~1이라 분산이 거의 늘지 않는다).
  // 반환: [w1 기준 승률, w2 기준 승률 또는 null] | null
  function _eqMC(D, combos, w1, w2, n, rnd) {
    if (typeof HandEval === 'undefined' || !HandEval.evaluateIdx || !combos || !combos.length) return null;
    var len = combos.length, cum = new Float64Array(len), tot = 0, i;
    for (i = 0; i < len; i++) { tot += w1 ? w1[i] : 1; cum[i] = tot; }
    if (!(tot > 0)) return null;
    var evalIdx = HandEval.evaluateIdx, cmp = HandEval.compareHands;
    var board = D.board, need = 5 - board.length;
    var hv = D.hero.concat(board), vv = [0, 0].concat(board), k;
    for (k = 0; k < need; k++) { hv.push(0); vv.push(0); }
    var res, sc;
    if (need <= 0) {   // 리버: 전수
      var hs = evalIdx(hv), s1 = 0, s2 = 0, t2 = 0;
      for (i = 0; i < len; i++) {
        var a1 = w1 ? w1[i] : 1, a2 = w2 ? w2[i] : 0;
        if (!a1 && !a2) continue;
        vv[0] = combos[i][0]; vv[1] = combos[i][1];
        res = cmp(hs, evalIdx(vv));
        sc = res < 0 ? 1 : res === 0 ? 0.5 : 0;
        s1 += a1 * sc; s2 += a2 * sc; t2 += a2;
      }
      return [s1 / tot, w2 && t2 > 0 ? s2 / t2 : null];
    }
    var deck = [];
    for (i = 0; i < 52; i++) if (!D.dead[i]) deck.push(i);
    var A = deck.length, off = 2 + board.length, hoff = D.hero.length + board.length;
    var wins = 0, cnt = 0, rw = 0, rt = 0, idx = 0;
    for (var it = 0; it < n; it++) {
      var u = (it + rnd()) / n * tot;
      while (idx < len - 1 && cum[idx] < u) idx++;
      var a = combos[idx][0], b = combos[idx][1];
      vv[0] = a; vv[1] = b;
      var p = 0;
      for (k = 0; k < need; ) {
        if (p >= A) break;
        var j = p + ((rnd() * (A - p)) | 0), t = deck[j]; deck[j] = deck[p]; deck[p] = t; p++;
        if (t === a || t === b) continue;
        hv[hoff + k] = t; vv[off + k] = t; k++;
      }
      if (k < need) continue;
      res = cmp(evalIdx(hv), evalIdx(vv));
      sc = res < 0 ? 1 : res === 0 ? 0.5 : 0;
      wins += sc; cnt++;
      if (w2) { var r = w1 ? w2[idx] / w1[idx] : w2[idx]; rw += r * sc; rt += r; }
    }
    return cnt ? [wins / cnt, w2 && rt > 0 ? rw / rt : null] : null;
  }

  // 2덩이: 변형별 콜 받은 승률 → 모델
  function _eqPart(fp) {
    if (!fp) return null;
    var t = fp.ti >= 0 ? fp.vill[fp.ti] : null, tw = fp.tw, variants;
    var fb = fp.eq != null ? fp.eq : 0.5;
    if (fp.pre) {
      var eqN = null, eqJ = null;
      if (tw) {
        // 변형이 다르면 늘 연속(always)과 조건부 콜(condOnly)을 따로 재고 콤보 수로 합친다(normal = 합, jam = always만)
        var cA = _combosOf(tw.always, fp.D.dead);
        if (tw.same) {
          var rN = _eqMC(fp.D, cA, null, null, MC_N_PRE, fp.rnd);
          eqN = eqJ = rN ? rN[0] : null;
        } else {
          var cC = _combosOf(tw.condOnly, fp.D.dead);
          var rA = _eqMC(fp.D, cA, null, null, Math.round(MC_N_PRE * 0.6), fp.rnd);
          var rC = _eqMC(fp.D, cC, null, null, Math.round(MC_N_PRE * 0.5), fp.rnd);
          eqJ = rA ? rA[0] : null;
          if (rA && rC) eqN = (cA.length * rA[0] + cC.length * rC[0]) / (cA.length + cC.length);
          else eqN = rA ? rA[0] : (rC ? rC[0] : null);
        }
      }
      variants = {
        normal: { f: t ? t.fN : 1, eqC: eqN != null ? eqN : fb },
        jam: { f: t ? t.fJ : 1, eqC: eqJ != null ? eqJ : (eqN != null ? eqN : fb) }
      };
    } else {
      var rr = tw ? _eqMC(fp.D, tw.combos, tw.small, tw.big, MC_N, fp.rnd) : null;
      var eS = rr ? rr[0] : null, eB = rr ? rr[1] : null;
      variants = {
        small: { f: t ? t.fS : 1, eqC: eS != null ? eS : fb },
        big: { f: t ? t.fB : 1, eqC: eB != null ? eB : (eS != null ? eS : fb) }
      };
    }
    var vill = fp.vill.map(function(v) {
      var o = { name: v.name, pos: v.pos, bet: v.bet, stack: v.stack };
      if (fp.pre) { o.lim = v.lim; o.fN = v.fN; o.fJ = v.fJ; } else { o.fS = v.fS; o.fB = v.fB; }
      return o;
    });
    return { key: fp.key, seed: fp.seed, pre: fp.pre, street: fp.street, target: fp.target, ti: fp.ti, generic: fp.generic,
      P: fp.P, h: fp.h, X: fp.X, vill: vill, variants: variants };
  }

  function model(st, opts) { return _eqPart(_foldPart(st, opts || {})); }

  // 모델에서 레이즈 금액(raise-to) R의 값. 순수, 할당 1개
  function _atModel(m, R) {
    if (!m || typeof R !== 'number' || !isFinite(R)) return null;
    var a = R - m.h, P2 = m.P + a, f = 1, tv = m.pre ? 'normal' : 'small', big = false;
    for (var i = 0; i < m.vill.length; i++) {
      var v = m.vill[i], c = R - v.bet, fv;
      if (!(v.stack > 0)) { f = 0; continue; }   // 올인 빌런은 접을 수 없다
      var b = c > 0 && c / (P2 + c) >= BIG;
      if (m.pre) {
        var nrm = R <= v.lim + 1e-9;   // lim = 그 빌런 벳 + k x 스택(raise-to 기준)
        fv = nrm ? v.fN : v.fJ;
        if (i === m.ti) { tv = nrm ? 'normal' : 'jam'; big = b; }
      } else {
        fv = b ? v.fB : v.fS;
        if (i === m.ti) { tv = b ? 'big' : 'small'; big = b; }
      }
      f *= fv;
    }
    if (f < 0) f = 0; else if (f > 1) f = 1;
    return { f: f, eqC: m.variants[tv].eqC, big: big, variant: tv, ready: true };
  }

  // ── 비동기 준비 ──
  function _sched(fn) {
    if (hooks.sched) return hooks.sched(fn);
    if (typeof requestIdleCallback === 'function') return requestIdleCallback(function() { fn(); }, { timeout: 400 });   // 그린 뒤 한가할 때
    if (typeof requestAnimationFrame === 'function' && typeof setTimeout === 'function') {
      return requestAnimationFrame(function() { setTimeout(fn, 0); });
    }
    return fn();
  }
  function _defer(fn) {
    if (hooks.defer) return hooks.defer(fn);
    if (typeof setTimeout === 'function') return setTimeout(fn, 0);
    return fn();
  }

  function prepare(st, opts) {
    opts = opts || {};
    if (!st) { clear(); return _token; }
    var key = _key(st);
    if (_cur && _cur.key === key) {
      var tk = ++_token;
      _cur.token = tk; _pend = null;
      if (typeof opts.onReady === 'function') { try { opts.onReady(tk); } catch (e) { /* noop */ } }
      return tk;
    }
    if (_pend && _pend.key === key && _pend.token === _token) { _pend.onReady = opts.onReady; return _pend.token; }
    var tok = ++_token;
    _cur = null;
    var job = _pend = { key: key, token: tok, onReady: opts.onReady };
    var o = { eq: opts.eq, seed: opts.seed };
    _sched(function() {
      if (tok !== _token || _pend !== job) return;
      var fp = null;
      try { fp = _foldPart(st, o); } catch (e) { fp = null; }
      if (!fp) { if (_pend === job) _pend = null; return; }
      _defer(function() {
        if (tok !== _token || _pend !== job) return;
        var m = null;
        try { m = _eqPart(fp); } catch (e) { m = null; }
        _pend = null;
        if (!m) return;
        _cur = { key: key, token: tok, m: m };
        if (typeof job.onReady === 'function') { try { job.onReady(tok); } catch (e) { /* noop */ } }
      });
    });
    return tok;
  }
  function at(amount) { return _cur ? _atModel(_cur.m, amount) : null; }
  function ready() { return !!_cur; }
  function clear() { _token++; _cur = null; _pend = null; }

  var api = { prepare: prepare, at: at, model: model, target: target, ready: ready, clear: clear,
    atModel: _atModel, BIG: BIG, MC_N: MC_N, MC_N_PRE: MC_N_PRE, hooks: hooks, _key: _key, _contPost: _contPost };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
