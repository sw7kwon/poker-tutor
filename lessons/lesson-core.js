// lessons/lesson-core.js (채우는 패키지: M3-P1b)
//
// 그룹 간 계약 정본 L1~L8 (M3 사전 등록). 각 패키지는 이 계약에 맞춰 구현한다. 설계서와 다르면 이 주석이 우선한다.
//
// L1 레슨 객체: LESSONS.push({ id, node, title, est, source, scenes }).
//   id = node = 노드 id(journey-data의 lesson 필드와 같음). est는 분(2~4), source는 1차 출처 또는 '엔진 계산'.
//   장면 6~9개, 마지막 장면은 sum 1개. LESSONS 선언은 stage1.js만, 다른 stageN.js는 push만.
//
// L2 장면(t). 공통 선택 필드: caption(80자 이내, 템플릿 {{이름}}), label:'참고'(approx 내용이면 필수), calc(L3).
//   say {text}.
//   sum {text}(노드 시트에 남는 한 문장, 숫자+%나 숫자+bb 쓰지 않음).
//   cards {cards[] | rows:[{label, cards[], note?, hl?}], compare?}(기존).
//   grid {pos, facing(false|true|'vs3bet'|'vs4bet'|'cold3bet'), opener?, highlight[], layers?[자리...], claim?{hand, action}}
//     (기존, 변수 pct = 참여 레인지 %).
//   ring {potTotal(상대 벳 포함), toCall, eq?}(기존).
//   table {heroPos, hero?[2], board?[], potTotal?, toCall?, seats:[{pos, name?, stack?, bet?, action?, active?, folded?}],
//     blinds?, order?('preflop'|'postflop', 자리마다 말하는 순서 번호), focus?('pot'|'toCall'|자리)}:
//     자리는 UTG, HJ, CO, BTN, SB, BB 6개 고정 배치, seats에 없는 자리는 빈 자리, 금액은 bb 숫자.
//   bar {kind:'amount', rows:[{label, bb}]}
//     | {kind:'equity', rows:[{label, precalc} | {label, exact:{hero, vs, board}}]}
//     | {kind:'compare', precalc | exact, need:{potTotal, toCall}}(같은 축에 내 승률 막대와 필요 승률, 콜/폴드 바늘),
//     변수 eq(첫 줄), need.
//   ask {id(레슨 안에서 유일, 예 'q1'), q, choices[2~4], answer(0부터), why(한 줄), calc?, pick?[], ref?}:
//     ref는 커리큘럼 문항 id('c4-1')를 가리키는 예약 필드로 M3 데이터에서는 쓰지 않는다.
//   compare {cols:[{who, text}] 3개, mine?}(S4 이상, 렌더만).
//   widget {name, params}(M6, 모듈이 없으면 플레이어가 '다음 업데이트' 카드).
//   렌더 분담: SceneRender.render가 cards, grid, ring, scene, table, bar, compare, sum(P1a가 table, bar, compare, sum을 추가),
//     LessonPlayer가 say, ask, widget과 모든 장면의 caption 줄과 label 칩.
//
// L3 calc 유형과 템플릿 변수. 표기: 퍼센트는 정수 반올림(Math.round), bb는 소수 둘째 자리까지 끝 0 제거(15, 7.5, 2.25).
//   potodds {potTotal, toCall} → pct = toCall/(potTotal+toCall), potTotal, toCall.
//   tocall {currentBet, heroBet} → amt = currentBet - heroBet.
//   minraise {currentBet, lastRaise} → to = currentBet + lastRaise, inc = lastRaise(game-state.js:110 규칙, 첫 벳이면 lastRaise = 그 벳).
//   opensize {pos, limpers} → size = (SB면 3, 아니면 2.5) + limpers(ev.js:28-32, gen-basic opensize와 같은 표).
//   showdown {a[2], b[2], board[5]} → winner 'a'|'b'|'tie', handA, handB(HandEval.describe 이름).
//   order {street:'preflop'|'postflop', seats[남은 자리]} → first, last, list(쉼표로 이은 문자열),
//     프리플랍 UTG, HJ, CO, BTN, SB, BB 순, 포스트플랍 SB, BB, UTG, HJ, CO, BTN 순.
//   rangePct {pos, facing?, opener?} → pct = Math.round(Coach.rangePct(레이즈 배열 + 콜 배열) x 100)(SceneRender.rangeInfo total과 같음).
//   chart {pos, facing?, opener?, hand} → action = GtoChart.buildChartModel(pos, facing, opener) 셀('raise'|'call'|'fold').
//   eq {precalc:키} → eq = Math.round(PRECALC[키] x 100).
//   eqExact {hero[2], vs[2], board[3~4장]} → eq = 남은 카드 전부 열거(HandEval, 무승부 반),
//     SceneRender.eqExact(hero, vs, board) → 0~1(P1a)와 같은 값.
//   LessonCore.vars(scene) = SceneRender.vars(scene)(potTotal, toCall, need, pct, eq) 위에 calc 변수를 덮어쓴 것.
//   정의 안 된 변수는 화면에 '?'로 그리고 LessonCore.check(lesson)가 오류로 보고.
//
// L4 ask 정답: calc가 있으면 정답은 엔진값이다.
//   pick(보기마다 그 보기가 뜻하는 결과값, 예 showdown ['a','b','tie'], order ['BB','SB','BTN'], chart ['raise','call','fold'])이
//   있으면 pick[answer] === 결과값이고 다른 보기의 pick은 달라야 한다.
//   pick이 없으면 각 보기 문자열의 첫 숫자를 L3 표기의 결과값과 비교해 정확히 하나만 같고 그것이 answer.
//   calc 없는 ask는 개념 문항(숫자+%와 숫자+bb 금지). j-lessons(P5)가 독립 경로로 검산한다.
//
// L5 린트(numericTemplate는 M3-P5가 기본으로 켠다): caption, text, why의 숫자+%와 숫자+bb는 {{ }}로만 쓴다.
//   ask의 q와 choices는 같은 장면에 calc가 있을 때만 숫자 리터럴 허용. pot 필드 금지(potTotal만).
//   가운뎃점 U+00B7, 긴줄표 U+2014와 U+2013 대신 쉼표. 표기는 '팟 오즈'(띄어쓰기), '에쿼티', 콜/폴드 나열은 빗금이나 쉼표,
//   팟 문장은 '팟 X bb(상대 벳 Y bb 포함), 콜 Y bb'.
//
// L6 Leitner 유형 'lesson', 키 '<노드>|<qid>'.
//   레슨 ask: qid = ask.id, 오답이면 Drills.record('lesson', 키, false), 정답이면 이미 항목이 있을 때만 record(true).
//   커리큘럼 선택지 문항: CURRICULUM[k].quiz[j] = {q, a, choices[2~4], answer, why?, id:'c<세션>-<j+1>'},
//     키 노드 = CURRICULUM_MAP[세션][0], 기록 규칙은 레슨 ask와 같다.
//   복습 출제는 puzzles/gen-lesson.js(M3-P5)가 Puzzles.register('lesson', ...)의 fromKey(키)로 복원한다
//     (레이팅, 데일리 5, pickType, 약점 채움 제외, next는 null).
//
// L7 PRECALC(lessons/data/precalc.js): PRECALC['eq:<hero>:<board>:<vs>'] = 0~1(히어로 에쿼티, 무승부 반).
//   hero 'AhKd', board '' 또는 'Th7c2h', vs 'random' 또는 'range=<스팟>'(예 range=rfi|BTN, Gto.GTO_RANGES 배열).
//   특정 손 대 특정 손은 PRECALC 대신 eqExact(보드 3장 이상).
//   j-lessons가 Equity._mc(시드 Drills.rng(1)과 Drills.rng(2) 각 5000회) 평균과 ±4%p로 대조.
//
// L8 API.
//   LessonCore(순수, P1b): find(id) → lesson|null,
//     create(lesson, sceneIdx, deps{timer(fn, ms) → h, clear(h), record(evt)}) → core,
//     core.state() → {idx, n, scene, phase:'show'|'answered'|'done', picked, ok}, core.next(), core.prev(),
//     core.answer(i) → {ok, why}(정답은 바로 표시, 오답은 한 줄 해설 뒤 deps.timer로 1초 뒤 다음),
//     record evt = {kind:'scene', idx} | {kind:'answer', qid, key, ok, first} | {kind:'done'},
//     vars(scene), fill(text, scene), check(lesson) → [{scene, msg}].
//   LessonPlayer(DOM, P1b): start(lessonId, sceneIdx, onDone) → bool,
//     장면마다 Journey.completeLesson(node, idx, false), 끝에 completeLesson(node, 마지막, true) 뒤 onDone({done:true, scene}),
//     중간 종료(↩와 안드로이드 뒤로)는 onDone({done:false, scene}), 화면은 JourneyUI.mountView('lesson', html),
//     뒤로는 Nav.view('lesson', id) + Nav.setBack('j/lesson', fn),
//     호출자는 journey-ui _act('lesson')와 today-ui 레슨 블록(이미 연결됨).
//   SceneRender 추가(P1a): render가 table, bar, compare, sum 처리, supports(t), vars(scene)에 bar 변수, eqExact(hero, vs, board).
//   Boss와 CoachUI는 설계서 2.5절과 7.3절 9번(CoachUI.snapshot() → {auto, level, recent}, CoachUI.restore(s)) 그대로.
//
// 구현 메모(M3-P1b, 위 계약의 의미는 바꾸지 않고 구현에서 정한 것만 적는다)
//   M1 상태기계. phase 'show' → (ask에서 answer) 'answered' → (마지막 장면에서 next) 'done'.
//      답하지 않은 ask에서는 next가 false(넘어가지 않음). 답한 ask는 다시 와도 답한 상태 그대로(같은 실행 안에서 재시도 없음).
//      오답 뒤 deps.timer(1초)가 끝나기 전까지 state().ready가 false이고 next가 false다(오답 해설을 읽게 하는 속도 방지턱).
//      deps.autoNext가 true면 그 1초 뒤 next를 스스로 부른다(설계 5.4절 '1초 뒤 다음'의 다른 해석, 기본 false).
//      deps.timer가 없으면 기다림 없이 ready. state()는 계약 필드에 ready, last, canNext, canPrev, node, id를 더 준다.
//      record evt는 create 때 첫 장면에도 {kind:'scene', idx}를 한 번 낸다(이어 보기 위치 저장). core.destroy()는 타이머 정리.
//   M2 answer evt의 first = 이 실행에서 그 qid에 처음 답했는지. XP와 Leitner 기록 규칙은 LessonPlayer가 정한다.
//   M3 calc(spec) → 변수 객체 | {error}. bb 값은 숫자(소수 둘째 자리 반올림)라 String()이 15, 7.5, 2.25로 끝 0 없이 나온다.
//      rangePct와 chart는 SceneRender.rangeInfo, SceneRender.cellAction(격자와 같은 경로)을 쓴다. chart의 'none' 셀은 오류.
//      eqExact는 이 파일이 HandEval로 직접 열거한다(보드 3~5장, 무승부 반). eq는 PRECALC 상수.
//      vars는 SceneRender.vars 위에 calc 변수를 덮는다. bar 장면의 eq, need는 SceneRender.vars가 아직 주지 않으면
//      (P1a 병합 전) 여기서 같은 규칙(첫 줄 precalc 또는 exact, need 객체)으로 채운다.
//   M4 ask 정답 비교에 쓰는 결과값(j-lessons의 wantOf와 같은 규칙) = calc.of(결과 변수 이름)가 있으면 그 변수, 없으면 유형의 첫 변수
//      (potodds pct, tocall amt, minraise to, opensize size, showdown winner, order first, rangePct pct, chart action, eq eq,
//      eqExact eq). answerIndex(ask)가 이 규칙으로 정답 칸을 구한다. order 질문이 '마지막', '맨 끝', '가장 늦게' 자리를 묻는데
//      calc.of가 없으면 check가 "calc.of = 'last'를 적어요"로 알린다(j-lessons ask.of와 같은 규칙, 추측해서 바꾸지 않는다).
//      calc potodds의 pct(와 SceneRender.vars가 없을 때의 need 대체 계산)는 Math.round(toCall x 100 / (potTotal + toCall))
//      (j-lessons와 같은 식, 14.5처럼 딱 반인 값이 toCall / (potTotal + toCall) x 100의 부동소수 오차로 14가 되지 않게).
//      opensize는 BB면 림퍼 1명 이상(아무도 안 들어오면 BB는 오픈할 일이 없다), potodds는 toCall이 0보다 커야 한다.
//   M5 check(lesson)은 L1, L2 필드, L4, L5(숫자 템플릿, 금지 문자, pot 필드, 80자), 정의 안 된 변수, sum의 템플릿 금지,
//      grid claim, PRECALC 키 존재를 본다. 반환 [{scene, msg}], scene -1은 레슨 전체. JOURNEY_NODES가 있으면 노드 연결도 본다.
//   로드 시 DOM, window, localStorage에 손대지 않는다. HandEval, SceneRender, PRECALC, LESSONS, JOURNEY_NODES는 호출 때 typeof 가드.
var LessonCore = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  var TYPES = ['say', 'table', 'cards', 'grid', 'ring', 'bar', 'ask', 'compare', 'widget', 'sum'];
  var CALC_MAIN = { potodds: 'pct', tocall: 'amt', minraise: 'to', opensize: 'size', showdown: 'winner', order: 'first',
    rangePct: 'pct', chart: 'action', eq: 'eq', eqExact: 'eq' };
  var PRE = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var POST = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
  var FACINGS = [false, true, 'vs3bet', 'vs4bet', 'cold3bet'];
  var WRONG_MS = 1000;
  var CAP_MAX = 80;
  var RANKS = 'AKQJT98765432';
  var SUITS = 'shdc';
  var FORBID = /[\u00b7\u2014\u2013]/;
  var NUM_UNIT = /\d+(?:\.\d+)?\s*(?:%|bb(?![A-Za-z]))/i;
  var TPL = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

  function _has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _fin(x) { return x !== null && x !== '' && x !== undefined && isFinite(Number(x)); }
  function _bb(x) { var v = Math.round(Number(x) * 100) / 100; return v === 0 ? 0 : v; }
  function _mod(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _sr() { return _mod('SceneRender'); }
  function _lessons() { return (typeof LESSONS !== 'undefined' && Array.isArray(LESSONS)) ? LESSONS : []; }
  function _precalc() { return (typeof PRECALC !== 'undefined' && _isObj(PRECALC)) ? PRECALC : null; }

  // ── 카드 ──────────────────────────────────────────────
  function _card(x) {
    if (x && typeof x === 'object') x = String(x.rank || '') + String(x.suit || '');
    var s = String(x == null ? '' : x).trim();
    if (s.length === 3 && s.slice(0, 2) === '10') s = 'T' + s.charAt(2);
    if (s.length !== 2) return null;
    var r = s.charAt(0).toUpperCase(), u = s.charAt(1).toLowerCase();
    if (RANKS.indexOf(r) < 0 || SUITS.indexOf(u) < 0) return null;
    return { rank: r, suit: u };
  }
  // 카드 묶음 파싱. 같은 카드가 두 번 나오면 오류
  function _cards(groups) {
    var seen = {}, out = [];
    for (var g = 0; g < groups.length; g++) {
      var list = groups[g].list, want = groups[g].n;
      if (!Array.isArray(list)) return { error: groups[g].name + ' 카드 목록이 없어요' };
      if (want && (list.length < want[0] || list.length > want[1])) return { error: groups[g].name + ' 카드 수가 맞지 않아요(' + list.length + '장)' };
      var row = [];
      for (var i = 0; i < list.length; i++) {
        var c = _card(list[i]);
        if (!c) return { error: '카드를 읽을 수 없어요: ' + list[i] };
        var k = c.rank + c.suit;
        if (seen[k]) return { error: '같은 카드가 두 번 나와요: ' + k };
        seen[k] = true;
        row.push(c);
      }
      out.push(row);
    }
    return { groups: out, used: seen };
  }
  function _he() {
    var H = _mod('HandEval');
    return (H && typeof H.evaluate === 'function' && typeof H.compareHands === 'function') ? H : null;
  }

  // 히어로 vs 상대 손 에쿼티: 남은 카드 전부 열거(무승부 반). board 3~5장
  function eqExact(hero, vs, board) {
    var H = _he();
    if (!H) return null;
    var p = _cards([{ name: '내 손', list: hero, n: [2, 2] }, { name: '상대 손', list: vs, n: [2, 2] }, { name: '보드', list: board, n: [3, 5] }]);
    if (p.error) return null;
    var h = p.groups[0], v = p.groups[1], b = p.groups[2];
    var deck = [];
    for (var ri = 0; ri < 13; ri++) for (var si = 0; si < 4; si++) {
      var k = RANKS.charAt(ri) + SUITS.charAt(si);
      if (!p.used[k]) deck.push({ rank: RANKS.charAt(ri), suit: SUITS.charAt(si) });
    }
    var need = 5 - b.length, win = 0, tie = 0, tot = 0;
    var score = function(extra) {
      var full = b.concat(extra);
      var c = H.compareHands(H.evaluate(h.concat(full)), H.evaluate(v.concat(full)));
      tot++;
      if (c < 0) win++; else if (c === 0) tie++;
    };
    if (need === 0) score([]);
    else if (need === 1) for (var i = 0; i < deck.length; i++) score([deck[i]]);
    else for (var a = 0; a < deck.length; a++) for (var z = a + 1; z < deck.length; z++) score([deck[a], deck[z]]);
    return tot ? (win + tie / 2) / tot : null;
  }

  // ── calc(L3) ─────────────────────────────────────────
  function _spot(c) {
    var s = { pos: c.pos, facing: _has(c, 'facing') && c.facing != null ? c.facing : false };
    if (c.opener) s.opener = c.opener;
    return s;
  }
  function _facingOk(f) { return FACINGS.indexOf(f) >= 0; }
  var CALCS = {
    potodds: function(c) {
      if (!_fin(c.potTotal) || !_fin(c.toCall)) return { error: 'potodds에는 potTotal과 toCall 숫자가 필요해요' };
      var p = Number(c.potTotal), t = Number(c.toCall);
      if (p < 0 || t <= 0) return { error: 'potodds 금액이 맞지 않아요(potTotal 0 이상, toCall 0보다 큼)' };
      return { pct: Math.round(t * 100 / (p + t)), potTotal: _bb(p), toCall: _bb(t) };
    },
    tocall: function(c) {
      if (!_fin(c.currentBet) || !_fin(c.heroBet)) return { error: 'tocall에는 currentBet과 heroBet 숫자가 필요해요' };
      var cb = Number(c.currentBet), hb = Number(c.heroBet);
      if (hb < 0 || cb < hb) return { error: 'tocall 금액이 맞지 않아요(currentBet < heroBet)' };
      return { amt: _bb(cb - hb) };
    },
    minraise: function(c) {
      if (!_fin(c.currentBet) || !_fin(c.lastRaise)) return { error: 'minraise에는 currentBet과 lastRaise 숫자가 필요해요' };
      var cb = Number(c.currentBet), lr = Number(c.lastRaise);
      if (cb <= 0 || lr <= 0) return { error: 'minraise 금액은 0보다 커야 해요' };
      return { to: _bb(cb + lr), inc: _bb(lr) };
    },
    opensize: function(c) {
      if (PRE.indexOf(c.pos) < 0) return { error: 'opensize 자리를 알 수 없어요: ' + c.pos };
      var n = c.limpers == null ? 0 : Number(c.limpers);
      if (!(n >= 0) || Math.floor(n) !== n) return { error: 'opensize limpers는 0 이상의 정수예요' };
      if (c.pos === 'BB' && n < 1) return { error: 'BB는 림퍼가 있을 때만 레이즈 크기를 물어요(limpers 1 이상)' };
      return { size: _bb((c.pos === 'SB' ? 3 : 2.5) + n) };
    },
    showdown: function(c) {
      var H = _he();
      if (!H || typeof H.describe !== 'function') return { error: 'HandEval이 없어요' };
      var p = _cards([{ name: 'a', list: c.a, n: [2, 2] }, { name: 'b', list: c.b, n: [2, 2] }, { name: '보드', list: c.board, n: [5, 5] }]);
      if (p.error) return { error: p.error };
      var sa = H.evaluate(p.groups[0].concat(p.groups[2])), sb = H.evaluate(p.groups[1].concat(p.groups[2]));
      var r = H.compareHands(sa, sb);
      return { winner: r < 0 ? 'a' : (r > 0 ? 'b' : 'tie'), handA: H.describe(sa), handB: H.describe(sb) };
    },
    order: function(c) {
      var ord = c.street === 'preflop' ? PRE : (c.street === 'postflop' ? POST : null);
      if (!ord) return { error: "order street는 'preflop' 또는 'postflop'이에요" };
      if (!Array.isArray(c.seats) || c.seats.length < 2) return { error: 'order seats는 두 자리 이상이에요' };
      var seen = {};
      for (var i = 0; i < c.seats.length; i++) {
        if (PRE.indexOf(c.seats[i]) < 0) return { error: '자리 이름을 알 수 없어요: ' + c.seats[i] };
        if (seen[c.seats[i]]) return { error: '같은 자리가 두 번 나와요: ' + c.seats[i] };
        seen[c.seats[i]] = true;
      }
      var list = ord.filter(function(p) { return seen[p]; });
      return { first: list[0], last: list[list.length - 1], list: list.join(', ') };
    },
    rangePct: function(c) {
      var S = _sr();
      if (PRE.indexOf(c.pos) < 0) return { error: 'rangePct 자리를 알 수 없어요: ' + c.pos };
      var sp = _spot(c);
      if (!_facingOk(sp.facing)) return { error: 'rangePct facing 값을 알 수 없어요: ' + sp.facing };
      var ri = (S && typeof S.rangeInfo === 'function') ? S.rangeInfo(sp) : null;
      if (!ri || !isFinite(ri.total)) return { error: '이 스팟의 레인지를 찾지 못했어요' };
      return { pct: Math.round(ri.total * 100) };
    },
    chart: function(c) {
      var S = _sr();
      if (PRE.indexOf(c.pos) < 0) return { error: 'chart 자리를 알 수 없어요: ' + c.pos };
      var sp = _spot(c);
      if (!_facingOk(sp.facing)) return { error: 'chart facing 값을 알 수 없어요: ' + sp.facing };
      var act = (S && typeof S.cellAction === 'function') ? S.cellAction(sp, c.hand) : null;
      if (act !== 'raise' && act !== 'call' && act !== 'fold') return { error: '차트 셀을 찾지 못했어요(' + c.hand + ', ' + act + ')' };
      return { action: act };
    },
    eq: function(c) {
      var P = _precalc();
      var v = (P && c.precalc != null && _has(P, c.precalc)) ? Number(P[c.precalc]) : NaN;
      if (!(v >= 0 && v <= 1)) return { error: 'PRECALC에 키가 없어요: ' + c.precalc };
      return { eq: Math.round(v * 100) };
    },
    eqExact: function(c) {
      if (!_he()) return { error: 'HandEval이 없어요' };
      var p = _cards([{ name: '내 손', list: c.hero, n: [2, 2] }, { name: '상대 손', list: c.vs, n: [2, 2] }, { name: '보드', list: c.board, n: [3, 5] }]);
      if (p.error) return { error: p.error };
      var e = eqExact(c.hero, c.vs, c.board);
      return e == null ? { error: 'eqExact 계산 실패' } : { eq: Math.round(e * 100) };
    }
  };
  function calc(c) {
    if (!_isObj(c) || !c.type) return { error: 'calc에 type이 없어요' };
    if (_has(c, 'pot')) return { error: 'pot 필드는 쓰지 않아요(potTotal만)' };
    var f = CALCS[c.type];
    if (!f) return { error: '알 수 없는 calc 유형: ' + c.type };
    try { return f(c); } catch (e) { return { error: 'calc 계산 실패: ' + (e && e.message ? e.message : e) }; }
  }

  // ── 템플릿 변수(L3) ──────────────────────────────────
  function _need(potTotal, toCall) {
    if (!_fin(potTotal) || !_fin(toCall)) return null;
    var p = Number(potTotal), t = Number(toCall);
    if (p < 0 || t < 0 || p + t <= 0) return null;
    return Math.round(t * 100 / (p + t));
  }
  function _eqFrac(e) {
    if (!_fin(e)) return null;
    e = Number(e);
    if (e > 1) e = e / 100;
    return (e >= 0 && e <= 1) ? e : null;
  }
  // SceneRender.vars가 없을 때(또는 bar 변수가 아직 없을 때) 같은 규칙으로 채우는 대체 경로
  function _baseVars(sc) {
    var out = {};
    if (_fin(sc.potTotal)) out.potTotal = _bb(sc.potTotal);
    if (_fin(sc.toCall)) out.toCall = _bb(sc.toCall);
    var nd = _need(sc.potTotal, sc.toCall);
    if (nd != null) { out.need = nd; out.pct = nd; }
    if (_isObj(sc.need)) { var n2 = _need(sc.need.potTotal, sc.need.toCall); if (n2 != null) out.need = n2; }
    var e = _eqFrac(sc.eq);
    if (e != null) out.eq = Math.round(e * 100);
    return out;
  }
  function _barEq(sc) {
    var src = null;
    if (sc.kind === 'compare') src = sc;
    else if (Array.isArray(sc.rows) && sc.rows.length) src = sc.rows[0];
    if (!src) return null;
    var r = null;
    if (src.precalc != null) r = calc({ type: 'eq', precalc: src.precalc });
    else if (_isObj(src.exact)) r = calc({ type: 'eqExact', hero: src.exact.hero, vs: src.exact.vs, board: src.exact.board });
    return (r && !r.error) ? r.eq : null;
  }
  function vars(scene) {
    var sc = _isObj(scene) ? scene : {};
    var out = {}, S = _sr(), k;
    var base = null;
    if (S && typeof S.vars === 'function') { try { base = S.vars(sc); } catch (e) { base = null; } }
    if (!_isObj(base)) base = _baseVars(sc);
    for (k in base) if (_has(base, k) && base[k] != null) out[k] = base[k];
    if (sc.t === 'bar') {
      if (out.eq == null) { var be = _barEq(sc); if (be != null) out.eq = be; }
      if (out.need == null && _isObj(sc.need)) { var bn = _need(sc.need.potTotal, sc.need.toCall); if (bn != null) out.need = bn; }
    }
    if (_isObj(sc.calc)) {
      var r = calc(sc.calc);
      if (!r.error) for (k in r) if (_has(r, k) && r[k] != null) out[k] = r[k];
    }
    return out;
  }
  function _fillV(text, v) {
    return String(text == null ? '' : text).replace(TPL, function(m, name) {
      return (_has(v, name) && v[name] != null && v[name] !== '') ? String(v[name]) : '?';
    });
  }
  function fill(text, scene) { return _fillV(text, vars(scene)); }
  function _tplNames(text) {
    var out = [], m;
    var re = new RegExp(TPL.source, 'g');
    while ((m = re.exec(String(text == null ? '' : text))) !== null) out.push(m[1]);
    return out;
  }

  // ── 찾기 ─────────────────────────────────────────────
  function find(id) {
    if (id == null || id === '') return null;
    var L = _lessons(), i;
    for (i = 0; i < L.length; i++) if (L[i] && L[i].id === id) return L[i];
    for (i = 0; i < L.length; i++) if (L[i] && L[i].node === id) return L[i];
    return null;
  }

  // ── L4 정답 칸 ───────────────────────────────────────
  function _same(a, b) {
    if (_fin(a) && _fin(b) && typeof a !== 'boolean' && typeof b !== 'boolean') return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
    return String(a) === String(b);
  }
  function _firstNum(s) {
    var m = /-?\d+(?:\.\d+)?/.exec(String(s == null ? '' : s));
    return m ? Number(m[0]) : null;
  }
  var LAST_Q = /마지막|맨 끝|가장 늦게/;
  // 결과 변수 이름(M4): calc.of가 있으면 그것, 없으면 유형의 첫 변수(j-lessons wantOf와 같은 규칙)
  function wantKey(ask) {
    var c = _isObj(ask) && _isObj(ask.calc) ? ask.calc : {};
    if (typeof c.of === 'string' && c.of) return c.of;
    return CALC_MAIN[c.type];
  }
  // order 질문이 마지막 자리를 묻는데 calc.of가 없으면 첫 자리(first)와 비교하게 되므로 데이터 오류(j-lessons ask.of와 같은 규칙)
  function _lastWithoutOf(ask) {
    var c = _isObj(ask) && _isObj(ask.calc) ? ask.calc : null;
    return !!(c && c.type === 'order' && !c.of && LAST_Q.test(String(ask.q == null ? '' : ask.q)));
  }
  function answerValue(ask) {
    if (!_isObj(ask) || !_isObj(ask.calc)) return { error: 'calc 없음' };
    var r = calc(ask.calc);
    if (r.error) return r;
    var key = wantKey(ask);
    if (!_has(r, key)) return { error: 'calc 결과에 ' + key + ' 값이 없어요' };
    return { value: r[key], key: key, vars: r };
  }
  // calc가 있는 ask의 엔진 정답 칸(0부터) | {error}
  function answerIndex(ask) {
    var av = answerValue(ask);
    if (av.error) return av;
    var ch = Array.isArray(ask.choices) ? ask.choices : [];
    var hits = [], i;
    if (Array.isArray(ask.pick)) {
      if (ask.pick.length !== ch.length) return { error: 'pick 길이가 보기 수와 달라요' };
      for (i = 0; i < ask.pick.length; i++) if (_same(ask.pick[i], av.value)) hits.push(i);
    } else {
      if (!_fin(av.value)) return { error: '결과값이 숫자가 아니라 pick이 필요해요(' + av.key + ' = ' + av.value + ')' };
      var v = vars(ask);
      for (i = 0; i < ch.length; i++) { var n = _firstNum(_fillV(ch[i], v)); if (n != null && _same(n, av.value)) hits.push(i); }
    }
    if (hits.length !== 1) return { error: '엔진값(' + av.key + ' = ' + av.value + ')과 같은 보기가 ' + hits.length + '개예요(정확히 1개여야 해요)' };
    return { index: hits[0], value: av.value, key: av.key };
  }

  // ── 상태기계(L8) ─────────────────────────────────────
  function create(lesson, sceneIdx, deps) {
    deps = deps || {};
    var scenes = (lesson && Array.isArray(lesson.scenes)) ? lesson.scenes.filter(_isObj) : [];
    var n = scenes.length;
    var node = lesson ? String(lesson.node || lesson.id || '') : '';
    var lid = lesson ? String(lesson.id || lesson.node || '') : '';
    var start = Math.floor(_fin(sceneIdx) ? Number(sceneIdx) : 0);
    var idx = n ? Math.max(0, Math.min(n - 1, start)) : 0;
    var phase = n ? 'show' : 'done';
    var answers = {}, tried = {};
    var ready = true, timerH = null, dead = false;

    function emit(evt) {
      if (typeof deps.record !== 'function') return;
      try { deps.record(evt); } catch (e) { /* 기록 실패는 진행을 막지 않는다 */ }
    }
    function clearT() {
      if (timerH != null && typeof deps.clear === 'function') { try { deps.clear(timerH); } catch (e) { /* 무시 */ } }
      timerH = null;
    }
    function enter(i) {
      clearT();
      idx = i;
      phase = answers[i] ? 'answered' : 'show';
      ready = true;
      emit({ kind: 'scene', idx: i });
    }
    function _canNext() {
      if (phase === 'done' || !n || dead) return false;
      var sc = scenes[idx];
      if (sc.t === 'ask' && !answers[idx]) return false;
      return ready;
    }
    function state() {
      var a = answers[idx] || null;
      return { idx: idx, n: n, scene: scenes[idx] || null, phase: phase, picked: a ? a.picked : null, ok: a ? a.ok : null,
        ready: ready, last: idx === n - 1, canNext: _canNext(), canPrev: phase !== 'done' && idx > 0 && !dead, node: node, id: lid };
    }
    function next() {
      if (!_canNext()) return false;
      if (idx >= n - 1) { clearT(); phase = 'done'; emit({ kind: 'done' }); return true; }
      enter(idx + 1);
      return true;
    }
    function prev() {
      if (phase === 'done' || idx <= 0 || dead) return false;
      enter(idx - 1);
      return true;
    }
    function answer(i) {
      if (phase !== 'show' || dead) return null;
      var sc = scenes[idx];
      if (!sc || sc.t !== 'ask') return null;
      var ch = Array.isArray(sc.choices) ? sc.choices : [];
      i = Number(i);
      if (!(i >= 0 && i < ch.length) || Math.floor(i) !== i) return null;
      var ok = i === Number(sc.answer);
      var qid = String(sc.id != null && sc.id !== '' ? sc.id : 'q' + (idx + 1));
      var first = !tried[qid];
      tried[qid] = true;
      answers[idx] = { picked: i, ok: ok };
      phase = 'answered';
      var why = sc.why ? fill(sc.why, sc) : '';
      emit({ kind: 'answer', qid: qid, key: node + '|' + qid, ok: ok, first: first });
      if (!ok && typeof deps.timer === 'function') {
        ready = false;
        var at = idx;
        try {
          timerH = deps.timer(function() {
            timerH = null;
            if (dead || idx !== at || phase !== 'answered') return;
            ready = true;
            if (deps.autoNext) next();
          }, WRONG_MS);
        } catch (e) { ready = true; timerH = null; }
      }
      return { ok: ok, why: why };
    }
    function destroy() { clearT(); dead = true; }

    if (n) emit({ kind: 'scene', idx: idx });
    return { state: state, next: next, prev: prev, answer: answer, destroy: destroy };
  }

  // ── 검사(check) ──────────────────────────────────────
  function _strings(o, out, depth) {
    if (depth > 6 || o == null) return out;
    if (typeof o === 'string') { out.push(o); return out; }
    if (Array.isArray(o)) { o.forEach(function(x) { _strings(x, out, depth + 1); }); return out; }
    if (typeof o === 'object') Object.keys(o).forEach(function(k) { _strings(o[k], out, depth + 1); });
    return out;
  }
  function _hasPot(o, depth) {
    if (!o || typeof o !== 'object' || depth > 6) return false;
    if (Array.isArray(o)) return o.some(function(x) { return _hasPot(x, depth + 1); });
    if (_has(o, 'pot')) return true;
    return Object.keys(o).some(function(k) { return _hasPot(o[k], depth + 1); });
  }
  function _numOutsideTpl(s) { return NUM_UNIT.test(String(s).replace(new RegExp(TPL.source, 'g'), '')); }

  function check(lesson) {
    var errs = [];
    function e(scene, msg) { errs.push({ scene: scene, msg: msg }); }
    if (!_isObj(lesson)) { e(-1, '레슨 객체가 아니에요'); return errs; }
    if (!lesson.id || typeof lesson.id !== 'string') e(-1, 'id가 없어요');
    if (!lesson.node || typeof lesson.node !== 'string') e(-1, 'node가 없어요');
    else if (lesson.id && lesson.id !== lesson.node) e(-1, 'id와 node가 달라요(L1: id = node)');
    if (!lesson.title || typeof lesson.title !== 'string') e(-1, 'title이 없어요');
    if (!(_fin(lesson.est) && Number(lesson.est) >= 2 && Number(lesson.est) <= 4)) e(-1, 'est는 2~4분이에요');
    if (!lesson.source || typeof lesson.source !== 'string') e(-1, 'source가 없어요');
    var nodes = (typeof JOURNEY_NODES !== 'undefined' && Array.isArray(JOURNEY_NODES)) ? JOURNEY_NODES : null;
    if (nodes && lesson.node) {
      var nd = nodes.filter(function(x) { return x && x.id === lesson.node; })[0];
      if (!nd) e(-1, '노드가 없어요: ' + lesson.node);
      else if (nd.lesson !== lesson.id) e(-1, '노드의 lesson 필드(' + nd.lesson + ')와 레슨 id가 달라요');
    }
    _strings({ title: lesson.title, source: lesson.source }, [], 0).forEach(function(s) { if (FORBID.test(s)) e(-1, '가운뎃점이나 긴줄표가 있어요: ' + s); });
    var scenes = Array.isArray(lesson.scenes) ? lesson.scenes : null;
    if (!scenes) { e(-1, 'scenes가 없어요'); return errs; }
    if (scenes.length < 6 || scenes.length > 9) e(-1, '장면은 6~9개예요(지금 ' + scenes.length + '개)');
    var sums = scenes.filter(function(s) { return _isObj(s) && s.t === 'sum'; }).length;
    if (sums !== 1) e(-1, 'sum 장면은 1개여야 해요(지금 ' + sums + '개)');
    if (!scenes.length || !_isObj(scenes[scenes.length - 1]) || scenes[scenes.length - 1].t !== 'sum') e(-1, '마지막 장면은 sum이에요');
    var qids = {};
    scenes.forEach(function(sc, i) {
      if (!_isObj(sc)) { e(i, '장면 객체가 아니에요'); return; }
      if (TYPES.indexOf(sc.t) < 0) { e(i, '알 수 없는 장면 유형: ' + sc.t); return; }
      _strings(sc, [], 0).forEach(function(s) { if (FORBID.test(s)) e(i, '가운뎃점이나 긴줄표가 있어요: ' + s); });
      if (_hasPot(sc, 0)) e(i, 'pot 필드는 쓰지 않아요(potTotal만)');
      if (_has(sc, 'label') && sc.label !== '참고') e(i, "label은 '참고'만 써요");
      var v = vars(sc);
      var tplCheck = function(field, s, allowNum) {
        if (s == null) return;
        if (typeof s !== 'string') { e(i, field + '는 문자열이에요'); return; }
        _tplNames(s).forEach(function(name) { if (!_has(v, name) || v[name] == null || v[name] === '') e(i, field + '의 {{' + name + '}}가 정의되지 않았어요'); });
        if (!allowNum && _numOutsideTpl(s)) e(i, field + '에 숫자+% 또는 숫자+bb는 {{ }} 템플릿으로만 써요: ' + s);
      };
      if (sc.caption != null) {
        tplCheck('caption', sc.caption, false);
        if (typeof sc.caption === 'string' && sc.caption.length > CAP_MAX) e(i, 'caption이 ' + CAP_MAX + '자를 넘어요(' + sc.caption.length + '자)');
      }
      var cr = null;
      if (_isObj(sc.calc) || _has(sc, 'calc')) {
        cr = calc(sc.calc);
        if (cr.error) e(i, 'calc: ' + cr.error);
      }
      switch (sc.t) {
        case 'say':
          if (!sc.text || typeof sc.text !== 'string') e(i, 'say에 text가 없어요');
          else { tplCheck('text', sc.text, false); if (sc.text.length > CAP_MAX) e(i, 'say text가 ' + CAP_MAX + '자를 넘어요'); }
          break;
        case 'sum':
          if (!sc.text || typeof sc.text !== 'string') e(i, 'sum에 text가 없어요');
          else {
            if (_tplNames(sc.text).length) e(i, 'sum에는 {{ }} 템플릿을 쓰지 않아요(노드 시트에 그대로 남아요)');
            if (NUM_UNIT.test(sc.text)) e(i, 'sum에는 숫자+% 또는 숫자+bb를 쓰지 않아요');
            if (sc.text.length > CAP_MAX) e(i, 'sum text가 ' + CAP_MAX + '자를 넘어요');
          }
          break;
        case 'ask': {
          var id = sc.id;
          if (id == null || id === '' || typeof id !== 'string') e(i, 'ask에 id가 없어요');
          else if (qids[id]) e(i, 'ask id가 겹쳐요: ' + id);
          else qids[id] = true;
          if (!sc.q || typeof sc.q !== 'string') e(i, 'ask에 q가 없어요');
          var ch = sc.choices;
          if (!Array.isArray(ch) || ch.length < 2 || ch.length > 4) e(i, 'choices는 2~4개예요');
          else ch.forEach(function(c, k) { if (typeof c !== 'string' || !c.trim()) e(i, k + 1 + '번 보기가 비었어요'); });
          var nch = Array.isArray(ch) ? ch.length : 0;
          if (!(_fin(sc.answer) && Math.floor(Number(sc.answer)) === Number(sc.answer) && Number(sc.answer) >= 0 && Number(sc.answer) < nch)) e(i, 'answer 칸 번호가 맞지 않아요');
          if (!sc.why || typeof sc.why !== 'string') e(i, 'ask에 why(한 줄 해설)가 없어요');
          else { tplCheck('why', sc.why, false); if (sc.why.length > CAP_MAX) e(i, 'why가 ' + CAP_MAX + '자를 넘어요'); }
          var hasCalc = _isObj(sc.calc);
          tplCheck('q', sc.q, hasCalc);
          if (Array.isArray(ch)) ch.forEach(function(c, k) { if (typeof c === 'string') tplCheck((k + 1) + '번 보기', c, hasCalc); });
          if (_has(sc, 'pick') && !Array.isArray(sc.pick)) e(i, 'pick은 배열이에요');
          if (hasCalc && cr && !cr.error && _lastWithoutOf(sc)) {
            e(i, "L4: 순서 문제가 마지막 자리를 물으면 calc.of = 'last'를 적어요(없으면 첫 자리와 비교해요)");
          } else if (hasCalc && cr && !cr.error) {
            var ai = answerIndex(sc);
            if (ai.error) e(i, 'L4: ' + ai.error);
            else if (ai.index !== Number(sc.answer)) e(i, 'L4: 엔진 정답은 ' + (ai.index + 1) + '번 보기인데 answer는 ' + (Number(sc.answer) + 1) + '번이에요');
          } else if (!hasCalc && _has(sc, 'pick')) e(i, 'pick은 calc가 있을 때만 써요');
          break;
        }
        case 'grid':
          if (PRE.indexOf(sc.pos) < 0 && !(Array.isArray(sc.layers) && sc.layers.length)) e(i, 'grid 자리를 알 수 없어요: ' + sc.pos);
          if (_has(sc, 'facing') && !_facingOk(sc.facing)) e(i, 'grid facing 값을 알 수 없어요: ' + sc.facing);
          if (_has(sc, 'highlight') && !Array.isArray(sc.highlight)) e(i, 'highlight는 배열이에요');
          if (_has(sc, 'claim')) {
            var cl = sc.claim, S = _sr();
            if (!_isObj(cl) || !cl.hand || !cl.action) e(i, 'claim은 {hand, action}이에요');
            else {
              var act = (S && typeof S.cellAction === 'function') ? S.cellAction(_spot(sc), cl.hand) : null;
              if (act !== cl.action) e(i, 'claim ' + cl.hand + ' ' + cl.action + '가 차트(' + act + ')와 달라요');
            }
          }
          break;
        case 'ring': {
          if (_need(sc.potTotal, sc.toCall) == null) e(i, 'ring에는 potTotal과 toCall 숫자가 필요해요');
          break;
        }
        case 'table':
          if (!Array.isArray(sc.seats)) e(i, 'table에 seats가 없어요');
          else {
            var seen = {};
            sc.seats.forEach(function(s) {
              if (!_isObj(s) || PRE.indexOf(s.pos) < 0) e(i, 'table 자리를 알 수 없어요: ' + (s && s.pos));
              else if (seen[s.pos]) e(i, 'table 자리가 겹쳐요: ' + s.pos);
              else seen[s.pos] = true;
            });
          }
          if (sc.heroPos != null && PRE.indexOf(sc.heroPos) < 0) e(i, 'heroPos를 알 수 없어요: ' + sc.heroPos);
          break;
        case 'bar': {
          var kind = sc.kind;
          var srcOk = function(src, where) {
            if (!_isObj(src)) { e(i, where + ' 항목이 없어요'); return; }
            if (src.precalc != null) { var r1 = calc({ type: 'eq', precalc: src.precalc }); if (r1.error) e(i, where + ': ' + r1.error); }
            else if (_isObj(src.exact)) { var r2 = calc({ type: 'eqExact', hero: src.exact.hero, vs: src.exact.vs, board: src.exact.board }); if (r2.error) e(i, where + ': ' + r2.error); }
            else e(i, where + '에 precalc 또는 exact가 필요해요');
          };
          if (kind === 'amount') {
            if (!Array.isArray(sc.rows) || !sc.rows.length) e(i, 'bar amount에 rows가 없어요');
            else sc.rows.forEach(function(r, k) { if (!_isObj(r) || !_fin(r.bb)) e(i, 'bar amount ' + (k + 1) + '번 줄에 bb 숫자가 없어요'); });
          } else if (kind === 'equity') {
            if (!Array.isArray(sc.rows) || !sc.rows.length) e(i, 'bar equity에 rows가 없어요');
            else sc.rows.forEach(function(r, k) { srcOk(r, 'bar equity ' + (k + 1) + '번 줄'); });
          } else if (kind === 'compare') {
            srcOk(sc, 'bar compare');
            if (!_isObj(sc.need) || _need(sc.need.potTotal, sc.need.toCall) == null) e(i, 'bar compare에 need{potTotal, toCall}가 필요해요');
          } else e(i, "bar kind는 'amount', 'equity', 'compare'예요");
          break;
        }
        case 'cards':
          if (!Array.isArray(sc.cards) && !Array.isArray(sc.rows)) e(i, 'cards에 cards 또는 rows가 없어요');
          break;
        case 'compare':
          if (!Array.isArray(sc.cols) || sc.cols.length !== 3) e(i, 'compare cols는 3개예요');
          break;
        case 'widget':
          if (!sc.name || typeof sc.name !== 'string') e(i, 'widget에 name이 없어요');
          break;
      }
    });
    return errs;
  }

  var api = {
    TYPES: TYPES.slice(), CALC_MAIN: CALC_MAIN, WRONG_MS: WRONG_MS, CAP_MAX: CAP_MAX,
    find: find, create: create, vars: vars, fill: fill, check: check,
    calc: calc, eqExact: eqExact, wantKey: wantKey, answerValue: answerValue, answerIndex: answerIndex, tplNames: _tplNames
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
