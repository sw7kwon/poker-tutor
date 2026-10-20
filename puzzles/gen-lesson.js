// puzzles/gen-lesson.js (채우는 패키지: M3-P5)
// 레슨 즉석 질문과 커리큘럼 선택지 문항의 Leitner 복습 어댑터(유형 'lesson'). 계약 L2~L4, L6은 lessons/lesson-core.js
// 머리 주석, 생성기 C1과 문항 C2는 puzzles/puzzle-core.js 머리 주석.
//   키 '<노드>|<qid>'(Drills 항목 'lesson|<노드>|<qid>').
//     레슨 ask: qid = ask.id. 같은 노드의 레슨(LESSONS의 node 또는 id가 노드)에서 t:'ask'이고 id가 같은 장면.
//     커리큘럼 선택지 문항: qid = 'c<세션>-<번호>', CURRICULUM의 session 항목 quiz[번호-1](id가 있으면 같아야 함),
//       노드 = CURRICULUM_MAP[세션][0]이어야 한다. 보기 choices(2~4)와 answer가 없으면(M3-P3 전) 문항이 없다.
//   next() → null: 새 문항을 만들지 않는다(복습 전용). 데일리 5, 러시, 서바이벌, 세트, 약점 채움은 next로만 문항을
//     만들기 때문에 레슨 문항이 섞이지 않는다.
//   fromKey(key) → C2 문항 | null(못 찾거나 형식이 틀리면). 보기 = choices(id는 보기 번호 '0'부터), answer = 정답 번호,
//     prompt = 질문, explain 한 줄 = why. 템플릿 {{ }}은 LessonCore.fill(text, scene)이 있으면 그것으로 채우고,
//     없으면 이 파일의 vars(scene)(SceneRender.vars 위에 calc 변수, 계약 L3)로 채운다.
//     장면: calc가 그림을 줄 수 있으면 그 그림(쇼다운 두 손과 보드, 팟 오즈 링, 차트 격자는 해설에만), 아니면 note만.
//     레슨의 앞 table 장면은 옮기지 않는다(질문과 다른 상황인 경우가 많아 복습에서 정답을 헷갈리게 한다).
//     note에 어느 레슨의 복습인지 적는다.
//   verify(q) → 원본을 다시 찾아 보기와 정답이 같은지 보고, calc가 있으면 엔진(HandEval, GtoChart, PRECALC 등)으로
//     결과값을 다시 구해 정답 규칙 L4(pick 또는 보기 첫 숫자가 정확히 하나만 같음)를 확인한다.
//     결과값 = calc.of(있으면) 아니면 유형의 첫 변수(LessonCore.answerValue와 같은 규칙, 순서 문제의 '마지막'은 of 'last').
//     (M4-P7) 이 파일이 직접 계산하지 않는 유형(outs, band 등 M4 이후 L3 유형)은 LessonCore.calc로 계산한다.
//     (M5-P0) 레슨 calc 등록부(계약 L9) 유형도 LessonCore.calc로 계산하고, 결과값 이름은 LessonCore.CALC_MAIN(등록 때 main이
//     더해진다), 없으면 LessonCore.calcDef(type).main이다(wantOf와 calcResult가 같은 규칙). 그림은 그리지 않고 note만.
//   등록 meta: confidence 'exact', rated false, srs 'srs', stage 6, group 'other', concept 'lesson', label '레슨 복습'.
//     base는 레이팅 창에서 한참 먼 값이라 Puzzles.pickType(rated:false 포함)의 가중치가 0이 된다
//     (문항 difficulty는 노드 단계 기준값으로 따로 채운다). 레이팅, 데일리 5, pickType, 약점 채움 제외(L6).
//     부록 C에 없는 유형이라 등록할 때 Puzzles가 console.warn 1줄을 남긴다(tools/mobile-check.py는 console.error만 센다).
//   (M6-PAINT, 계약 H12, 로드맵 결정 15) 라벨: fromKey가 q.labelKind를 채운다. 그 장면 calc.type이 chart, rangePct, band이거나
//     LessonCore.calcDef(type).chip이 'chart'면 'chart'(이 앱 차트 기준), chip이 'appdef'면 'appdef'(이 앱의 분류 기준), 나머지는
//     채우지 않는다(= 엔진 계산). 레슨 플레이어 칩(lesson-player.js _chips)과 같은 규칙이고 appdef가 chart보다 먼저다.
//     Puzzles.label은 유형 'lesson'에서만 이 값을 따른다. confidence('exact')와 레이팅 제외는 그대로. verify도 같은 값인지 본다.
//     커리큘럼 선택지 문항(calc 없음)은 채우지 않는다.
//     (리뷰 보강, 설계서 8.2절 4번) 질문 장면의 label이 '참고'면 calc와 상관없이 'approx'(참고/근사)가 가장 먼저다.
//     labelKind(calc, 장면?)의 두 번째 인자가 그 장면이다(없으면 calc만 본다).
//   GenLesson._use(src) 테스트 전용 데이터 주입 {lessons, curriculum, curriculumMap, nodes, stages, precalc}, null이면 전역으로.
// 로드 시 DOM 접근 없음. 다른 모듈은 호출 시점에 typeof 가드.
var GenLesson = (function() {
  var CUR_RE = /^c(\d+)-(\d+)$/;
  var PRE = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var POST = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
  var BTN_CW = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];   // 장면용 자리 나열(말하는 순서와 무관)
  var FACINGS = [false, true, 'vs3bet', 'vs4bet', 'cold3bet'];
  var MAIN = { potodds: 'pct', tocall: 'amt', minraise: 'to', opensize: 'size', showdown: 'winner', order: 'first',
    rangePct: 'pct', chart: 'action', eq: 'eq', eqExact: 'eq', outs: 'outs', band: 'pct' };
  var OUT_OF_WINDOW = 1e9;   // pickType 가중치 0(레이팅 창 [Ru-300, Ru-200]에서 한참 먼 base)
  var CHART_CALC = { chart: true, rangePct: true, band: true };   // 계약 H12: 이 앱 차트에서 나온 값(설계서 8.2절 2번)
  var TEMPLATE_RE = /\{\{\s*([A-Za-z_]\w*)\s*\}\}/g;

  var _src = null;

  // ── 데이터 원천(전역, 테스트는 _use로 주입) ─────────────
  function _pickSrc(k, globalVal) { return (_src && _src[k] !== undefined) ? _src[k] : globalVal; }
  function _lessons() { var L = _pickSrc('lessons', typeof LESSONS !== 'undefined' ? LESSONS : null); return Array.isArray(L) ? L : []; }
  function _curriculum() { var C = _pickSrc('curriculum', typeof CURRICULUM !== 'undefined' ? CURRICULUM : null); return Array.isArray(C) ? C : []; }
  function _cmap() { var M = _pickSrc('curriculumMap', typeof CURRICULUM_MAP !== 'undefined' ? CURRICULUM_MAP : null); return (M && typeof M === 'object') ? M : {}; }
  function _nodes() { var N = _pickSrc('nodes', typeof JOURNEY_NODES !== 'undefined' ? JOURNEY_NODES : null); return Array.isArray(N) ? N : []; }
  function _stages() { var S = _pickSrc('stages', typeof JOURNEY_STAGES !== 'undefined' ? JOURNEY_STAGES : null); return Array.isArray(S) ? S : []; }
  function _precalc() { var P = _pickSrc('precalc', typeof PRECALC !== 'undefined' ? PRECALC : null); return (P && typeof P === 'object') ? P : {}; }
  function _use(src) { _src = (src && typeof src === 'object') ? src : null; }
  function _lc() { return (typeof LessonCore !== 'undefined' && LessonCore) ? LessonCore : null; }
  function _own(o, k) { return !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); }
  // 유형의 결과값 이름: 이 파일 표(L3 내장), LessonCore.CALC_MAIN(L9 등록 때 main 추가), LessonCore.calcDef(type).main 순
  function _mainOf(type) {
    if (_own(MAIN, type)) return MAIN[type];
    var LC = _lc();
    if (LC && _own(LC.CALC_MAIN, type) && LC.CALC_MAIN[type]) return LC.CALC_MAIN[type];
    if (LC && typeof LC.calcDef === 'function') {
      var d = null;
      try { d = LC.calcDef(type); } catch (e) { d = null; }
      if (d && typeof d.main === 'string' && d.main) return d.main;
    }
    return null;
  }

  // ── 작은 도구 ─────────────────────────────────────────
  function _n(x) { var v = Number(x); return (x === null || x === '' || x === undefined || !isFinite(v)) ? NaN : v; }
  function _bb(x) { var v = Math.round(Number(x) * 100) / 100; return String(v === 0 ? 0 : v); }
  function _card(s) { var m = /^([2-9TJQKA])([shdc])$/.exec(String(s == null ? '' : s)); return m ? { rank: m[1], suit: m[2] } : null; }
  function _cards(arr, min, max) {
    if (!Array.isArray(arr) || arr.length < min || arr.length > max) return null;
    var out = [];
    for (var i = 0; i < arr.length; i++) { var c = _card(arr[i]); if (!c) return null; out.push(c); }
    return out;
  }
  function _distinct(list) {
    var seen = {};
    for (var i = 0; i < list.length; i++) { var k = list[i].rank + list[i].suit; if (seen[k]) return false; seen[k] = 1; }
    return true;
  }
  function _copy(o) { return JSON.parse(JSON.stringify(o)); }
  function _firstNum(s) { var m = /\d+(?:\.\d+)?/.exec(String(s == null ? '' : s)); return m ? parseFloat(m[0]) : null; }
  function _same(a, b) {
    var x = _n(a), y = _n(b);
    if (isFinite(x) && isFinite(y)) return Math.abs(x - y) < 1e-9;
    return String(a) === String(b);
  }
  function _handOk(h) { return /^(?:([2-9TJQKA])\1|[2-9TJQKA]{2}[so])$/.test(String(h || '')) && (h.length === 2 || h[0] !== h[1]); }

  // ── 차트(GtoChart 모델) ────────────────────────────────
  function _model(c) {
    if (typeof GtoChart === 'undefined' || !GtoChart || typeof GtoChart.buildChartModel !== 'function') return null;
    if (PRE.indexOf(c.pos) < 0) return null;
    var f = (c.facing === undefined || c.facing === null) ? false : c.facing;
    if (FACINGS.indexOf(f) < 0) return null;
    try { return GtoChart.buildChartModel(c.pos, f, c.opener || undefined); } catch (e) { return null; }
  }
  function _cellOf(m, hand) {
    for (var r = 0; r < 13; r++) for (var k = 0; k < 13; k++) if (m.cells[r][k].label === hand) return m.cells[r][k];
    return null;
  }
  function _rangeFrac(m) {
    var w = 0, any = false;
    for (var r = 0; r < 13; r++) for (var k = 0; k < 13; k++) {
      var a = m.cells[r][k].action;
      if (a !== 'none') any = true;
      if (a === 'raise' || a === 'call') w += (r === k ? 6 : (r < k ? 4 : 12));
    }
    return any ? w / 1326 : null;
  }

  // ── 에쿼티 ────────────────────────────────────────────
  // 히어로 2장 vs 상대 2장, 보드 3~5장: 남은 카드 전부 열거(무승부 반)
  function _eqExact(hero, vs, board) {
    if (typeof HandEval === 'undefined' || !HandEval) return null;
    var dead = hero.concat(vs, board);
    if (!_distinct(dead)) return null;
    var deck = [], R = '23456789TJQKA', S = 'shdc', used = {};
    dead.forEach(function(c) { used[c.rank + c.suit] = 1; });
    for (var i = 0; i < 13; i++) for (var j = 0; j < 4; j++) if (!used[R[i] + S[j]]) deck.push({ rank: R[i], suit: S[j] });
    var need = 5 - board.length, win = 0, n = 0;
    function score(extra) {
      var b = board.concat(extra);
      var cmp = HandEval.compareHands(HandEval.evaluate(hero.concat(b)), HandEval.evaluate(vs.concat(b)));
      n++; if (cmp < 0) win += 1; else if (cmp === 0) win += 0.5;
    }
    if (need === 0) score([]);
    else if (need === 1) deck.forEach(function(c) { score([c]); });
    else if (need === 2) { for (var a = 0; a < deck.length; a++) for (var b2 = a + 1; b2 < deck.length; b2++) score([deck[a], deck[b2]]); }
    else return null;
    return n ? win / n : null;
  }
  // PRECALC 키 'eq:<hero>:<board>:<vs>' → {hero, board} 카드 문자열(장면용)
  function _eqKeyCards(key) {
    var m = /^eq:((?:[2-9TJQKA][shdc]){2}):((?:[2-9TJQKA][shdc]){0,5}):(.+)$/.exec(String(key || ''));
    if (!m) return null;
    var split = function(s) { var o = []; for (var i = 0; i + 1 < s.length; i += 2) o.push(s.slice(i, i + 2)); return o; };
    return { hero: split(m[1]), board: split(m[2]) };
  }

  // ── calc 결과(계약 L3) ─────────────────────────────────
  // → { vars, main } | null(형식이 틀리거나 계산 불가)
  function calcResult(c) {
    if (!c || typeof c !== 'object') return null;
    var v = {};
    switch (c.type) {
      case 'potodds': {
        var P = _n(c.potTotal), T = _n(c.toCall);
        if (!(P >= 0) || !(T > 0)) return null;
        v.pct = Math.round(T / (P + T) * 100); v.potTotal = _bb(P); v.toCall = _bb(T);
        break;
      }
      case 'tocall': {
        var cb = _n(c.currentBet), hb = _n(c.heroBet);
        if (!(cb >= 0) || !(hb >= 0) || hb > cb) return null;
        v.amt = _bb(cb - hb);
        break;
      }
      case 'minraise': {
        var cur = _n(c.currentBet), lr = _n(c.lastRaise);
        if (!(cur > 0) || !(lr > 0)) return null;
        v.to = _bb(cur + lr); v.inc = _bb(lr);
        break;
      }
      case 'opensize': {
        // BB는 림퍼가 있을 때만 레이즈(아이솔레이션)로 들어간다(gen-basic opensize와 같은 규칙)
        var lim = _n(c.limpers === undefined ? 0 : c.limpers);
        if (PRE.indexOf(c.pos) < 0 || !(lim >= 0) || Math.floor(lim) !== lim || (c.pos === 'BB' && lim < 1)) return null;
        v.size = _bb((c.pos === 'SB' ? 3 : 2.5) + lim);
        break;
      }
      case 'showdown': {
        var a = _cards(c.a, 2, 2), b = _cards(c.b, 2, 2), bd = _cards(c.board, 5, 5);
        if (!a || !b || !bd || !_distinct(a.concat(b, bd)) || typeof HandEval === 'undefined' || !HandEval) return null;
        var ea = HandEval.evaluate(a.concat(bd)), eb = HandEval.evaluate(b.concat(bd));
        var cmp = HandEval.compareHands(ea, eb);
        v.winner = cmp < 0 ? 'a' : (cmp > 0 ? 'b' : 'tie');
        v.handA = HandEval.describe(ea); v.handB = HandEval.describe(eb);
        break;
      }
      case 'order': {
        var seats = Array.isArray(c.seats) ? c.seats : null;
        if (!seats || seats.length < 2 || (c.street !== 'preflop' && c.street !== 'postflop')) return null;
        for (var i = 0; i < seats.length; i++) if (PRE.indexOf(seats[i]) < 0 || seats.indexOf(seats[i]) !== i) return null;
        var list = (c.street === 'preflop' ? PRE : POST).filter(function(p) { return seats.indexOf(p) >= 0; });
        v.first = list[0]; v.last = list[list.length - 1]; v.list = list.join(', ');
        break;
      }
      case 'rangePct': {
        var m = _model(c);
        var fr = m ? _rangeFrac(m) : null;
        if (fr == null) return null;
        v.pct = Math.round(fr * 100);
        break;
      }
      case 'chart': {
        var mm = _model(c);
        if (!mm || !_handOk(c.hand)) return null;
        var cell = _cellOf(mm, c.hand);
        if (!cell || cell.action === 'none') return null;
        v.action = cell.action;
        break;
      }
      case 'eq': {
        var pc = _precalc(), val = pc[c.precalc];
        if (typeof val !== 'number' || !(val >= 0 && val <= 1)) return null;
        v.eq = Math.round(val * 100);
        break;
      }
      case 'eqExact': {
        var h = _cards(c.hero, 2, 2), vs = _cards(c.vs, 2, 2), bo = _cards(c.board, 3, 5);
        var e = (h && vs && bo) ? _eqExact(h, vs, bo) : null;
        if (e == null) return null;
        v.eq = Math.round(e * 100);
        break;
      }
      default: {
        // (M4-P7) M4에 더한 유형(outs, band)과 앞으로 더할 유형은 LessonCore.calc(계약 L3)로 계산한다.
        // 레슨 데이터 자체는 j-lessons가 독립 경로로 검산하므로 여기서는 같은 계산을 다시 부르기만 한다.
        // (M5-P0) 레슨 calc 등록부(L9) 유형도 같은 길이고 결과값 이름은 _mainOf(CALC_MAIN 또는 calcDef의 main)다.
        var LC = _lc();
        if (!LC || typeof LC.calc !== 'function') return null;
        var lr = null;
        try { lr = LC.calc(c); } catch (x) { lr = null; }
        if (!lr || typeof lr !== 'object' || lr.error) return null;
        return { vars: lr, main: _mainOf(c.type) };
      }
    }
    return { vars: v, main: MAIN[c.type] };
  }

  // 계약 H12: calc → 'chart' | 'appdef' | null(엔진 계산). 등록 유형의 chip이 appdef면 그것이 먼저(플레이어 칩과 같음)
  // (M6-PAINT 리뷰) 장면 label이 '참고'면 calc와 상관없이 'approx'가 먼저다. 레슨 플레이어는 이 장면에 '참고' 칩을 달므로
  //   복습 카드가 '엔진 계산'이나 '이 앱의 분류 기준'만 보이면 통념 문항을 검산된 정답처럼 보이게 한다(설계서 8.2절 4번).
  function labelKind(c, sc) {
    if (sc && typeof sc === 'object' && sc.label === '참고') return 'approx';
    if (!c || typeof c !== 'object' || typeof c.type !== 'string') return null;
    var LC = _lc(), def = null;
    if (LC && typeof LC.calcDef === 'function') { try { def = LC.calcDef(c.type); } catch (e) { def = null; } }
    if (def && def.chip === 'appdef') return 'appdef';
    if (_own(CHART_CALC, c.type) || (def && def.chip === 'chart')) return 'chart';
    return null;
  }

  // 정답 판정에 쓰는 결과 변수: calc.of가 있으면 그것, 없으면 유형의 주 변수(LessonCore.answerValue와 같음)
  function wantOf(c) {
    if (!c) return null;
    if (typeof c.of === 'string' && c.of) return c.of;
    return _mainOf(c.type);
  }

  // 계약 L4: calc가 있는 ask의 정답 번호가 엔진 결과와 맞는지. choices는 템플릿을 채운 문자열.
  function answerOk(scene, choices) {
    if (!scene || !scene.calc) return false;
    var r = calcResult(scene.calc);
    var key = wantOf(scene.calc);
    if (!r || !key || !Object.prototype.hasOwnProperty.call(r.vars, key)) return false;
    var val = r.vars[key], ans = scene.answer, n = choices.length;
    if (Array.isArray(scene.pick)) {
      if (scene.pick.length !== n) return false;
      for (var i = 0; i < n; i++) {
        var hit = _same(scene.pick[i], val);
        if ((i === ans) !== hit) return false;
      }
      return true;
    }
    var num = _n(val);
    if (!isFinite(num)) return false;   // 숫자가 아닌 결과(승자, 자리, 액션)는 pick이 있어야 한다
    var hits = [];
    choices.forEach(function(ch, j) { var x = _firstNum(ch); if (x != null && Math.abs(x - num) < 1e-9) hits.push(j); });
    return hits.length === 1 && hits[0] === ans;
  }

  // ── 템플릿 ────────────────────────────────────────────
  // 이 파일의 변수 계산: SceneRender.vars(장면 필드) 위에 calc 변수(L3)
  function vars(scene) {
    var out = {};
    if (typeof SceneRender !== 'undefined' && SceneRender && typeof SceneRender.vars === 'function') {
      try { var sv = SceneRender.vars(scene); if (sv && typeof sv === 'object') Object.keys(sv).forEach(function(k) { out[k] = sv[k]; }); } catch (e) { /* 무시 */ }
    }
    var r = scene && scene.calc ? calcResult(scene.calc) : null;
    if (r) Object.keys(r.vars).forEach(function(k) { out[k] = r.vars[k]; });
    return out;
  }
  // → { text, ok }: ok false = 이 파일의 계산으로 채우지 못한 변수가 있음
  function _fillInfo(text, scene) {
    if (typeof text !== 'string') return { text: '', ok: false };
    if (text.indexOf('{{') < 0) return { text: text, ok: true };
    var LC = (typeof LessonCore !== 'undefined' && LessonCore) ? LessonCore : null;
    if (LC && typeof LC.fill === 'function') {
      try { var f = LC.fill(text, scene); if (typeof f === 'string') return { text: f, ok: true }; } catch (e) { /* 아래 경로 */ }
    }
    var v = null;
    if (LC && typeof LC.vars === 'function') { try { v = LC.vars(scene); } catch (e) { v = null; } }
    if (!v || typeof v !== 'object') v = vars(scene);
    var ok = true;
    var t = text.replace(TEMPLATE_RE, function(m, k) {
      if (v[k] === undefined || v[k] === null || v[k] === '') { ok = false; return '?'; }
      return String(v[k]);
    });
    return { text: t, ok: ok };
  }
  function fill(text, scene) { return _fillInfo(text, scene).text; }

  // ── 원본 찾기 ─────────────────────────────────────────
  function parseKey(key) {
    if (typeof key !== 'string') return null;
    var p = key.split('|');
    if (p.length !== 2 || !p[0] || !p[1]) return null;
    var m = CUR_RE.exec(p[1]);
    return { node: p[0], qid: p[1], session: m ? Number(m[1]) : null, num: m ? Number(m[2]) : null };
  }
  function _choicesOk(ch, ans) {
    if (!Array.isArray(ch) || ch.length < 2 || ch.length > 4) return false;
    for (var i = 0; i < ch.length; i++) if (typeof ch[i] !== 'string' || !ch[i].trim()) return false;
    return typeof ans === 'number' && Math.floor(ans) === ans && ans >= 0 && ans < ch.length;
  }
  function _findAsk(node, qid) {
    var L = _lessons();
    for (var i = 0; i < L.length; i++) {
      var l = L[i];
      if (!l || !Array.isArray(l.scenes) || (l.node !== node && l.id !== node)) continue;
      for (var j = 0; j < l.scenes.length; j++) {
        var sc = l.scenes[j];
        if (sc && sc.t === 'ask' && sc.id === qid) return { lesson: l, scene: sc, idx: j };
      }
    }
    return null;
  }
  function _findCur(k) {
    if (k.session == null) return null;
    var ids = _cmap()[k.session] || _cmap()[String(k.session)];
    if (!Array.isArray(ids) || ids[0] !== k.node) return null;
    var sess = _curriculum().filter(function(s) { return s && Number(s.session) === k.session; })[0];
    if (!sess || !Array.isArray(sess.quiz)) return null;
    var want = 'c' + k.session + '-' + k.num;
    var item = sess.quiz[k.num - 1];
    if (!item || (item.id != null && item.id !== want)) item = sess.quiz.filter(function(x) { return x && x.id === want; })[0] || null;
    return item ? { session: sess, item: item } : null;
  }
  // 키 → 원본 {kind, node, qid, q, choices, answer, why, scene?, lesson?, idx?, session?}
  function _source(k) {
    var a = _findAsk(k.node, k.qid);
    if (a) {
      var sc = a.scene;
      if (!_choicesOk(sc.choices, sc.answer) || typeof sc.q !== 'string' || !sc.q.trim()) return null;
      return { kind: 'lesson', node: k.node, qid: k.qid, q: sc.q, choices: sc.choices, answer: sc.answer, why: sc.why,
        scene: sc, lesson: a.lesson, idx: a.idx, title: a.lesson.title || k.node };
    }
    var c = _findCur(k);
    if (c) {
      var it = c.item;
      if (!_choicesOk(it.choices, it.answer) || typeof it.q !== 'string' || !it.q.trim()) return null;
      return { kind: 'curriculum', node: k.node, qid: k.qid, q: it.q, choices: it.choices, answer: it.answer,
        why: (typeof it.why === 'string' && it.why) ? it.why : (typeof it.a === 'string' ? it.a : ''),
        session: c.session.session, title: c.session.topic || ('커리큘럼 ' + c.session.session + '강') };
    }
    return null;
  }

  // ── 장면 ──────────────────────────────────────────────
  // → { scene(C3), explain(C3|null) }. 그림은 calc에서만 만든다(질문 문장과 calc 입력은 j-lessons가 대조한다).
  function _scenes(src) {
    var note = src.kind === 'lesson' ? '📖 ' + src.title + ' 복습' : '📖 커리큘럼 ' + src.session + '강 복습';
    var c = src.kind === 'lesson' ? src.scene.calc : null, sc = null, ex = null, extraNote = '';
    if (c && calcResult(c)) {
      switch (c.type) {
        case 'potodds':
          sc = { potTotal: c.potTotal, toCall: c.toCall, ring: { potTotal: c.potTotal, toCall: c.toCall } };
          ex = { potTotal: c.potTotal, toCall: c.toCall, ring: { potTotal: c.potTotal, toCall: c.toCall } };
          break;
        case 'showdown':
          sc = { hero: c.a.slice(), board: c.board.slice(), range: { label: '상대(B)', combos: [c.b.join('')] } };
          ex = _copy(sc);
          break;
        case 'eqExact':
          sc = { hero: c.hero.slice(), board: c.board.slice(), range: { label: '상대', combos: [c.vs.join('')] } };
          ex = _copy(sc);
          break;
        case 'outs':
          // (M4-P7) 내 손과 보드가 질문에 이미 있으니 그림으로도 보인다(아웃 카드는 보이지 않는다). n 형식은 그림 없음
          if (Array.isArray(c.hero) && Array.isArray(c.board)) { sc = { hero: c.hero.slice(), board: c.board.slice() }; ex = _copy(sc); }
          break;
        case 'eq': {
          var kc = _eqKeyCards(c.precalc);
          if (kc) { sc = { hero: kc.hero }; if (kc.board.length) sc.board = kc.board; }
          break;
        }
        case 'order':
          // 말하는 순서로 늘어놓으면 정답이 보이므로 gen-basic order처럼 BTN부터 시계 방향으로 보인다
          sc = { seats: BTN_CW.filter(function(p) { return c.seats.indexOf(p) >= 0; }).map(function(p) { return { pos: p }; }) };
          extraNote = ', 자리는 BTN부터 시계 방향';
          break;
        case 'chart':
          ex = { grid: { pos: c.pos, facing: c.facing == null ? false : c.facing, opener: c.opener || null, highlight: [c.hand] } };
          break;
        case 'rangePct':
          ex = { grid: { pos: c.pos, facing: c.facing == null ? false : c.facing, opener: c.opener || null, highlight: [] } };
          break;
      }
    }
    sc = sc || {};
    sc.note = note + extraNote;
    if (ex) ex.note = note;
    return { scene: sc, explain: ex };
  }

  function _difficulty(node) {
    var nd = _nodes().filter(function(x) { return x && x.id === node; })[0];
    var st = nd ? _stages()[nd.stage - 1] : null;
    return (st && isFinite(st.baseRating)) ? st.baseRating : 1000;
  }

  // ── 생성기 함수(C1) ───────────────────────────────────
  function fromKey(key) {
    var k = parseKey(key);
    if (!k) return null;
    var src = _source(k);
    if (!src) return null;
    var tsc = src.kind === 'lesson' ? src.scene : null;
    var prompt = fill(src.q, tsc).trim();
    var opts = src.choices.map(function(ch, i) { return { id: String(i), label: fill(ch, tsc) }; });
    var label = opts[src.answer].label;
    var w = _fillInfo(typeof src.why === 'string' ? src.why : '', tsc);
    var line = (w.ok && w.text.trim()) ? w.text.trim() : '정답은 ' + label + '이에요.';
    var scs = _scenes(src);
    var nd = _nodes().filter(function(x) { return x && x.id === k.node; })[0];
    var lk = tsc ? labelKind(tsc.calc, tsc) : null;
    var q = {
      type: 'lesson', key: k.node + '|' + k.qid, concept: 'lesson', difficulty: _difficulty(k.node),
      confidence: 'exact', appDef: false, rated: false, srs: 'srs',
      prompt: prompt, scene: scs.scene, options: opts, answer: String(src.answer), ui: 'choice',
      data: { node: k.node, qid: k.qid, src: src.kind, lesson: src.kind === 'lesson' ? (src.lesson.id || k.node) : null,
        session: src.kind === 'curriculum' ? src.session : null, title: src.title, nodeConcept: nd ? nd.concept || null : null,
        calc: tsc && tsc.calc ? _copy(tsc.calc) : null, why: line, explain: scs.explain }
    };
    if (lk) q.labelKind = lk;
    return q;
  }

  function verify(q) {
    if (!q || q.type !== 'lesson' || typeof q.key !== 'string' || !q.data) return false;
    var k = parseKey(q.key);
    if (!k || q.data.node !== k.node || q.data.qid !== k.qid) return false;
    var src = _source(k);
    if (!src || q.data.src !== src.kind) return false;
    var tsc = src.kind === 'lesson' ? src.scene : null;
    var labels = src.choices.map(function(ch) { return fill(ch, tsc); });
    if (!Array.isArray(q.options) || q.options.length !== labels.length) return false;
    for (var i = 0; i < labels.length; i++) {
      var o = q.options[i];
      if (!o || o.id !== String(i) || o.label !== labels[i]) return false;
    }
    if (q.answer !== String(src.answer)) return false;
    if ((q.labelKind || null) !== (tsc ? labelKind(tsc.calc, tsc) : null)) return false;   // 라벨도 원본 장면과 같아야 한다(H12)
    if (tsc && tsc.calc) return answerOk(tsc, labels);
    return true;
  }

  function explain(q) {
    var d = (q && q.data) || {};
    var opt = null;
    (q && q.options || []).forEach(function(o) { if (o && String(o.id) === String(q.answer)) opt = o; });
    return { line: d.why || ('정답은 ' + (opt ? opt.label : '') + '이에요.'), scene: d.explain || null };
  }

  var gen = { title: '📖 레슨 복습', next: function() { return null; }, fromKey: fromKey, verify: verify, explain: explain,
    ready: function() { return true; } };

  if (typeof Puzzles !== 'undefined' && Puzzles && typeof Puzzles.register === 'function') {
    Puzzles.register('lesson', gen, { confidence: 'exact', rated: false, srs: 'srs', stage: 6, group: 'other', concept: 'lesson',
      label: '레슨 복습', base: OUT_OF_WINDOW });
  }

  var api = { gen: gen, next: gen.next, fromKey: fromKey, verify: verify, explain: explain, parseKey: parseKey,
    calcResult: calcResult, answerOk: answerOk, wantOf: wantOf, vars: vars, fill: fill, MAIN: MAIN, OUT_OF_WINDOW: OUT_OF_WINDOW,
    labelKind: labelKind, CHART_CALC: CHART_CALC,
    _use: _use };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
