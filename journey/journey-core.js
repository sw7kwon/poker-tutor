// journey/journey-core.js (채우는 패키지: M1-P1b)
// 여정 상태 poker_journey(설계서 6.1절) 로드/저장/마이그레이션(6.4절), 노드 상태 전이, XP와 레벨, 스트릭(36시간 규칙),
// 블록 기록, 미션/자유/보스 세션 컨텍스트, app.js 훅 수신과 전달(JStats, HeroStats, Boss, ReviewQueue는 전부 typeof 가드),
// playersSpec, routePractice, mapModel(홈 지도 순수 모델). 설계서 9절 M1-P1b.
// M3-P4a: 학습 노드 미션은 핸드 수 AND Boss.evaluate 조건(롤링, minOpp 미달은 판정 보류)으로 통과한다. 보스 노드의 실전 핸드는
//   롤링 집계가 아니라 Boss가 세는 보스 카운터(이 시험의 실전 핸드)다. 세션 시작/끝/교체는 Boss.onSessionStart/onSessionEnd로
//   알린다(코칭 고정과 보스 판정). 지도 힌트의 "핸드 n개 더"는 기회 미달 조건의 어림도 반영한다.
// M4-P8(계약 T9): recordTheater(극장 1편 기록, 명장면 카드 도감 최대 100장, XP 10 + 비자명 적중 건당 2, JStats theater, touchDay)와
//   highlightOfDay(오늘의 명장면, 날짜 시드 결정론). 오늘의 5분 재미 블록의 명장면 가용(avail.highlights)은 카드가 있고
//   TheaterUI.showCard가 있을 때다(카드를 다시 보여 줄 화면이 있어야 블록이 열린다).
// M5-BOSS: 결정 기록 필드(계약 F2) decisionFields(pre, ctx) → { mw, oop, pt }를 'dec' 페이로드에 싣는다. 실수 SRS 연결(계약 F4):
//   연습 핸드 끝(onHandEnd, ctx.practice)에 ReviewQueue.onPracticeHandEnd(ctx), todayCtx.mistakes = ReviewQueue.due(now, 3)(없으면 []).
// M6-BOSS(계약 H9): 은닉 좌석 배정과 관찰
//   hiddenSeats(노드, now, opts) → 배정(없으면 만든다, opts.peek면 만들지 않음), reshuffleHidden(노드, now) → 새 배정.
//     poker_journey.boss.hidden[노드] = { key('노드:시드'), node, seed, names[], slots[](CAST_SEATS 순번), seats{ 좌석 이름: 엔진 유형 }, at, hands }
//     mission.hiddenSeats 5(s6-boss) = 손님A~E에 TAG, LAG, Fish, Nit, Station 시드 셔플(mulberry32 + Fisher-Yates, 예전 seed 경로와 같은 식),
//     1(s6-02) = 같은 셔플의 첫 유형 1개를 시드로 고른 자리 1곳에 앉히고 그 좌석만 중립 이름 '손님', 나머지 4자리는 캐스트.
//     배정은 그 노드의 은닉 게임이 처음 필요할 때 만들고 맞히기에 실패해 다시 섞을 때까지 세션과 시도를 넘어 유지한다(누적 관찰).
//     boss.hiddenLast = 마지막 은닉 노드(세션 밖에서 다시 친 같은 핸드, 연습이 같은 배정으로 앉게).
//   관찰: 은닉 핸드(연습, GTO 2회차, HU 제외)의 빌런 액션을 VillainTracker.observe 통과 탭(원래 동작 그대로 부른 뒤 액션 묶음을 본다,
//     app.js 수정 없이 은닉 좌석 액션을 받는 유일한 길)으로 모아 onHandEnd에서 은닉 좌석만 JStats.record('cast', { name, key, hand, post }).
//     프리플랍에 한 번이라도 액션한 좌석만 그 핸드를 센다(VillainTracker와 같은 기준이라 게임 HUD 숫자와 맞는다). observeVillains가 공개 입구다.
//     함께 앉은 캐스트 좌석(1곳 은닉 s6-02의 나머지 4자리)도 같은 방식으로 JStats.record('cast', { name: 캐스트 키, ... })에 key 없이 쌓는다
//     (맞히기 화면의 비교 숫자, hiddenCast(노드) = 그 테이블 캐스트 목록. 게임 HUD는 5핸드 세션마다 비워져 비교에 못 쓴다).
//     같은 탭과 Table.updateVillainActions 통과 탭이 은닉 좌석의 대사(va.phrase, 프로필마다 말투가 달라 유형이 샌다)를 지운다
//     (maskPhrases, 은닉 테이블 핸드의 은닉 이름만. 연습 재생은 VillainTracker.observe를 거치지 않아 말풍선 탭이 맡는다).
//     app.js가 Journey.observeVillains와 대사 가림을 직접 부르게 되면 이 탭들은 지운다.
//   짧은 세션(s6-07): endSession 때 1 ≤ 핸드 < 세션 분량(chunk)이면 사용자가 스스로 멈춘 세션으로 보고 shortSessions[{ at, hands, chunk, kind, node }]
//     (최근 20)에 남긴다. 분량을 채워 자동으로 끝난 세션, 교체(replaced)나 다른 게임(other)으로 끝난 세션은 세지 않는다.
//   checkNode(id, now) = 학습 노드 자동 통과 재판정(맞히기 제출 뒤), nextNode는 기다리기만 남은 노드(br.later, 다음 주 복기)도 뒤로 미룬다.
// 로드 시 document, window, localStorage, setTimeout에 접근하지 않는다(전부 함수 안에서 typeof 가드).
// PERF-6(클라우드 C'): 저장은 지연 쓰기다. save()는 메모리 캐시를 '쓸 것'으로 표시만 하고 DEFER_MS(300ms) 안의 연속 save()를 한 번의
//   localStorage.setItem으로 묶는다(퍼즐 1문항의 XP, 배지, 레이팅, 활동 기록 5회가 1회로). 즉시 쓰는 때: flush()(visibilitychange hidden,
//   pagehide, beforeunload, 백업 내보내기와 가져오기 직전), 지연을 쓸 수 없는 환경(document.visibilityState가 없는 node 러너, 테스트 주입
//   저장소, setTimeout 없음). 쓸 때 원문이 마지막으로 쓴(읽은) 원문과 같으면 쓰지 않는다(홈을 다시 그리거나 복귀할 때의 빈 저장).
//   _unsaved(마지막 쓰기 실패, 메모리 캐시가 유일한 최신본)와 _invalidateExternal(다른 창 저장 이벤트는 캐시를 버린다)의 뜻은 그대로다.
//   다른 창의 storage 이벤트가 오면 이 창의 미기록 변경(최대 300ms)은 버린다(예전에도 다른 창의 저장이 이 창의 저장을 덮었다).
//   앱이 갑자기 꺼져도 잃는 것은 마지막 수백 ms의 변경뿐이다.
//
// 노드 상태: locked(선행 미통과) / open(열림) / done(레슨 완료, 아직 통과 아님) / passed(통과, skipped면 건너뜀 통과).
// "가용(available)" = 선행이 모두 통과이고 상태가 open 또는 done(마이그레이션으로 잠긴 채 done이 된 노드는 선행 통과 뒤 가용).
// XP는 addXp 한 곳으로만 쌓인다. 이 모듈이 직접 주는 XP: 레슨 첫 완료(lesson), 미션 노드 통과(mission), 보스 통과(boss),
// 게임 결정(decision, 힌트 사용 시 절반 내림), 오늘의 5분 완주(markBlock('wrap') 하루 1회, todayDone).
// 퍼즐, 복습 드릴, 데일리 5 등 바깥 출처는 호출하는 쪽이 addXp(src, amount)를 부른다. 극장은 recordTheater가 준다(theater, theaterHit).
var Journey = (function() {
  var KEY = 'poker_journey';
  var SETTINGS_KEY = 'poker_journey_settings';
  var V = 1;
  var H = 3600 * 1000, DAY = 24 * H, STREAK_GAP = 36 * H;
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var CAST_SEATS = [0, 1, 2, 4, 5];                       // app.js sixmax와 같은 좌석 배치(히어로는 3번 좌석 고정)
  var HIDDEN_NAMES = ['손님A', '손님B', '손님C', '손님D', '손님E'];
  var HIDDEN_ONE = '손님';                                // 은닉 좌석이 1곳(s6-02)일 때 그 좌석 이름
  var HIDDEN_TYPES = ['TAG', 'LAG', 'Fish', 'Nit', 'Station'];
  var SHORT_CAP = 20;                                     // shortSessions 보관 수
  var BASE_TYPES = { TAG: 1, LAG: 1, Fish: 1, Nit: 1, Mixed: 1 };
  var TYPE_FALLBACK = { Station: 'Fish' };                // Station 프로필(M4-P2) 전에는 Fish로 플레이
  var CHUNK = { mission: 5, free: 3, boss: 5 };
  var REPEAT_SRC = { review: 1, reviewRepeat: 1, decision: 1 };
  var COACH_CONCEPTS = ['rfi', 'vs_rfi', 'blind_defense', 'vs_3bet', 'pot_odds', 'draws', 'cbet', 'value_bluff', 'board_texture', 'turn_river', 'actions'];
  var STATUS_RANK = { locked: 0, open: 1, done: 2, passed: 3 };
  var CARD_CAP = 100;                                     // 명장면 카드 도감 상한(storage.js CARD_CAP과 같은 값)

  // journey-data.js가 비어 있을 때(병렬 구현 중)만 쓰는 폴백. 값은 설계서 2.1절, 4.3절, 9절 M1-P1a와 같다.
  var DEFAULT_XP = { lesson: 15, ask: 2, puzzle: 5, puzzleTier: [0, 2, 4, 6, 8], puzzleWrong: 1, review: 2, reviewRepeat: 1,
    decision: { green: 3, yellow: 1, red: 0 }, hintFactor: 0.5, mission: 40, boss: 150, theater: 10, theaterHit: 2,
    daily5: 15, daily5Perfect: 10, todayDone: 20, weekly: 60, season: 50, repeatCap: 120, levelBase: 300, levelStep: 50 };
  var DEFAULT_UNLOCKS = [ { level: 3, kind: 'tableColor', id: 'navy' }, { level: 6, kind: 'cardBack', id: 'diamond' },
    { level: 10, kind: 'castFrame', id: 'gold' }, { level: 15, kind: 'cardBorder', id: 'film' }, { level: 20, kind: 'tableColor', id: 'wine' } ];
  var DEFAULT_STAGES = [
    { n: 1, key: 's1', name: '첫 카드', title: '새싹', coachMax: 1, sizeButtons: 'simple', baseRating: 1000, boss: 's1-boss' },
    { n: 2, key: 's2', name: '자리 지키기', title: '견습', coachMax: 2, sizeButtons: 'simple', baseRating: 1250, boss: 's2-boss' },
    { n: 3, key: 's3', name: '주도권', title: '레귤러', coachMax: 3, sizeButtons: 'grouped', baseRating: 1500, boss: 's3-boss' },
    { n: 4, key: 's4', name: '콤보 읽기', title: '리더', coachMax: 3, sizeButtons: 'grouped', baseRating: 1750, boss: 's4-boss' },
    { n: 5, key: 's5', name: '밸런스', title: '샤크', coachMax: 3, sizeButtons: 'grouped', baseRating: 2000, boss: 's5-boss' },
    { n: 6, key: 's6', name: '익스플로잇', title: '마스터', coachMax: 3, sizeButtons: 'grouped', baseRating: 2250, boss: 's6-boss' }
  ];
  // CAST(journey/cast.js, M4-P2)가 비어 있을 때의 캐스트 6인(부록 E). key가 좌석 이름이 된다.
  var DEFAULT_CAST = [
    { key: '교수', type: 'TAG' }, { key: '불도저', type: 'LAG' }, { key: '햇살', type: 'Fish' },
    { key: '바위', type: 'Nit' }, { key: '카멜레온', type: 'Mixed' }, { key: '콜마스터', type: 'Station' }
  ];
  // 강조 캐스트가 없을 때 앉는 순서(앞 5명). 강조 캐스트가 있으면 그 사람 + 나머지에서 앞 4명.
  var CAST_ORDER = ['교수', '햇살', '바위', '콜마스터', '불도저', '카멜레온'];

  var _cache = null;          // 상태 캐시(메모리 폴백 겸용)
  var _unsaved = false;       // 마지막 저장이 실패함(저장소 없음, 용량 초과): 메모리 캐시만 최신이라 바깥 이벤트로 비우면 진행이 사라진다
  var DEFER_MS = 300;         // 같은 키 연속 save()를 묶는 지연(PERF-6)
  var _dirty = false;         // 캐시에 아직 저장소에 쓰지 않은 변경이 있음(지연 쓰기 대기)
  var _timer = null;          // 지연 쓰기 타이머 id
  var _lastRaw = null;        // 마지막으로 저장소에 쓴(또는 읽은) 원문. 같은 원문은 다시 쓰지 않는다
  var _deferOver = null;      // 테스트 주입 지연 ms(null = 환경 자동 판정, 0 = 즉시)
  var _writes = 0;            // 실제 setItem 시도 횟수(테스트, 진단용)
  var _session = null;       // 세션 컨텍스트(메모리 전용, 새로고침하면 사라짐)
  var _todayRunning = false;  // 오늘의 5분 진행 중(메모리 전용)
  var _hand = null;           // 진행 중 핸드 메타(onNewHand)
  var _lastPass = null;       // 자동 통과 결과 { id, opened, promoted, at }
  var _lastTouch = null;      // 마지막 touchDay 결과
  var _dataOver = null;       // 테스트 주입 { nodes, stages, map, xp, unlocks }
  var _storeOver = null;      // 테스트 주입 저장소(false = 저장소 없음)

  // ── 기본 유틸 ───────────────────────────────────────
  function _now(now) { return (typeof now === 'number' && isFinite(now)) ? now : Date.now(); }
  function _iso(t) { return new Date(t).toISOString(); }
  function _ms(iso) { var t = (typeof iso === 'number') ? iso : Date.parse(iso); return isFinite(t) ? t : NaN; }
  function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function _num(x, d) { x = Number(x); return isFinite(x) ? x : d; }
  function _warn(e) { try { if (typeof console !== 'undefined' && console.warn) console.warn('[Journey]', (e && e.message) || e); } catch (x) {} }
  function _fn(o, k) { return !!o && typeof o[k] === 'function'; }

  function dayKey(now) {
    var t = new Date(_now(now));
    var m = t.getMonth() + 1, d = t.getDate();
    return t.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  // mulberry32(Drills.rng와 같은 식, 의존 없이 자체 사본)
  function _rng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── 저장소 ──────────────────────────────────────────
  function _store() {
    if (_storeOver === false) return null;
    if (_storeOver) return _storeOver;
    try { return (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null; } catch (e) { return null; }
  }
  function _readRaw(key) {
    var s = _store(); if (!s) return null;
    try { var raw = s.getItem(key); return raw == null ? null : String(raw); } catch (e) { return null; }
  }
  function _readJSON(key) {
    var raw = _readRaw(key);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function _writeJSON(key, val) {
    var s = _store(); if (!s) return false;
    try { s.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  // ── 데이터(journey-data.js, 늦은 조회) ───────────────
  function _nodesData() {
    if (_dataOver && _dataOver.nodes) return _dataOver.nodes;
    return (typeof JOURNEY_NODES !== 'undefined' && Array.isArray(JOURNEY_NODES)) ? JOURNEY_NODES : [];
  }
  function _stagesData() {
    if (_dataOver && _dataOver.stages) return _dataOver.stages;
    return (typeof JOURNEY_STAGES !== 'undefined' && Array.isArray(JOURNEY_STAGES) && JOURNEY_STAGES.length) ? JOURNEY_STAGES : DEFAULT_STAGES;
  }
  function _mapData() {
    if (_dataOver && _dataOver.map) return _dataOver.map;
    return (typeof CURRICULUM_MAP !== 'undefined' && _isObj(CURRICULUM_MAP)) ? CURRICULUM_MAP : {};
  }
  function _unlocksData() {
    if (_dataOver && _dataOver.unlocks) return _dataOver.unlocks;
    return (typeof JOURNEY_UNLOCKS !== 'undefined' && Array.isArray(JOURNEY_UNLOCKS) && JOURNEY_UNLOCKS.length) ? JOURNEY_UNLOCKS : DEFAULT_UNLOCKS;
  }
  function _xpc(k) {
    var X = (_dataOver && _dataOver.xp) || ((typeof JOURNEY_XP !== 'undefined' && _isObj(JOURNEY_XP)) ? JOURNEY_XP : null);
    return (X && X[k] != null) ? X[k] : DEFAULT_XP[k];
  }
  var _idxSrc = null, _idxLen = -1, _idx = {};
  function _index() {
    var arr = _nodesData();
    if (arr !== _idxSrc || arr.length !== _idxLen) {
      _idx = {};
      arr.forEach(function(n) { if (n && n.id) _idx[n.id] = n; });
      _idxSrc = arr; _idxLen = arr.length;
    }
    return _idx;
  }
  function _node(id) { return _index()[id] || null; }
  function _stageInfo(n) {
    var list = _stagesData();
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].n === n) return list[i];
    for (var j = 0; j < DEFAULT_STAGES.length; j++) if (DEFAULT_STAGES[j].n === n) return DEFAULT_STAGES[j];
    return null;
  }
  function _maxStage() {
    var m = 1;
    _stagesData().forEach(function(s) { if (s && s.n > m) m = s.n; });
    return m;
  }
  // 단계 순(같은 단계는 데이터 순서 유지)
  function _ordered() {
    return _nodesData().map(function(n, i) { return { n: n, i: i }; })
      .sort(function(a, b) { return ((a.n.stage || 0) - (b.n.stage || 0)) || (a.i - b.i); })
      .map(function(x) { return x.n; });
  }

  // ── 상태 형태(6.1절) ────────────────────────────────
  function _newRec(status) {
    return { status: status || 'locked', skipped: false,
      lesson: { scene: 0, done: false, doneAt: null },
      drill: { best: 0, n: 0, lastAt: null },
      mission: { openedAt: null, hands: 0, passedAt: null },
      passedAt: null };
  }
  function _fixRec(r) {
    if (!_isObj(r)) return _newRec('locked');
    if (!(r.status in STATUS_RANK)) r.status = 'locked';
    r.skipped = !!r.skipped;
    if (!_isObj(r.lesson)) r.lesson = { scene: 0, done: false, doneAt: null };
    r.lesson.scene = Math.max(0, _num(r.lesson.scene, 0)); r.lesson.done = !!r.lesson.done;
    if (r.lesson.doneAt === undefined) r.lesson.doneAt = null;
    if (!_isObj(r.drill)) r.drill = { best: 0, n: 0, lastAt: null };
    r.drill.best = Math.max(0, Math.min(1, _num(r.drill.best, 0))); r.drill.n = Math.max(0, _num(r.drill.n, 0));
    if (r.drill.lastAt === undefined) r.drill.lastAt = null;
    if (!_isObj(r.mission)) r.mission = { openedAt: null, hands: 0, passedAt: null };
    r.mission.hands = Math.max(0, _num(r.mission.hands, 0));
    if (r.mission.openedAt === undefined) r.mission.openedAt = null;
    if (r.mission.passedAt === undefined) r.mission.passedAt = null;
    if (r.passedAt === undefined) r.passedAt = null;
    return r;
  }
  function _rec(st, id) {
    var r = st.nodes[id];
    if (!_isObj(r)) r = st.nodes[id] = _newRec('locked');
    return r;
  }
  function _template(now) {
    var s1 = _stageInfo(1);
    return { v: V, createdAt: _iso(now),
      stage: 1,
      nodes: {},
      xp: 0, level: 1, unlocks: [],
      streak: { cur: 0, best: 0, lastActiveAt: null, lastDay: null, freezes: 0, frozenDays: [] },
      goal: { minutes: 5 }, habit: { when: null, custom: '' },
      daily: {},
      rating: { r: (s1 && s1.baseRating) || 1000, rd: 350, vol: 0.06, n: 0, pending: [], history: [] },
      badges: [],
      weekly: null,
      season: null,
      theater: { episodes: 0, predicted: 0, hit: 0, hitW: 0, cards: [], mini: null },
      boss: { active: null },
      placement: { done: false, stage: null, correct: null, at: null },
      flags: {},
      migratedFrom: null };
  }
  function defaults(now) {
    now = _now(now);
    var st = _template(now);
    _nodesData().forEach(function(nd) { if (nd && nd.id) st.nodes[nd.id] = _newRec('locked'); });
    _syncOpen(st, now);
    return st;
  }

  var _MIGRATIONS = {};       // { 1: function(st) { ...1을 2로... return st; } } 이후 버전 체인(6.4절 5번)
  function _upgrade(st) {
    if (typeof st.v !== 'number') st.v = V;
    while (st.v < V && typeof _MIGRATIONS[st.v] === 'function') { st = _MIGRATIONS[st.v](st) || st; st.v += 1; }
    return st;
  }
  function _normalize(st, now) {
    var tpl = _template(now);
    Object.keys(tpl).forEach(function(k) {
      if (k === 'nodes') return;
      if (st[k] === undefined) st[k] = tpl[k];
      else if (_isObj(tpl[k]) && !_isObj(st[k])) st[k] = tpl[k];
      else if (Array.isArray(tpl[k]) && !Array.isArray(st[k])) st[k] = tpl[k];
    });
    ['streak', 'goal', 'habit', 'rating', 'theater', 'boss', 'placement'].forEach(function(k) {
      Object.keys(tpl[k]).forEach(function(f) { if (st[k][f] === undefined) st[k][f] = tpl[k][f]; });
    });
    if (!Array.isArray(st.streak.frozenDays)) st.streak.frozenDays = [];
    st.streak.cur = Math.max(0, _num(st.streak.cur, 0)); st.streak.best = Math.max(st.streak.cur, _num(st.streak.best, 0));
    st.streak.freezes = Math.max(0, Math.min(2, _num(st.streak.freezes, 0)));
    st.xp = Math.max(0, _num(st.xp, 0));
    st.level = levelFor(st.xp);
    st.stage = Math.max(1, Math.min(_maxStage(), Math.floor(_num(st.stage, 1))));
    if (!_isObj(st.nodes)) st.nodes = {};
    Object.keys(st.nodes).forEach(function(id) { st.nodes[id] = _fixRec(st.nodes[id]); });
    _nodesData().forEach(function(nd) { if (nd && nd.id && !st.nodes[nd.id]) st.nodes[nd.id] = _newRec('locked'); });
    // 오래된 날의 plan은 지운다(하루 기록 자체는 유지)
    var keep = dayKey(_now(now) - 14 * DAY);
    Object.keys(st.daily).forEach(function(k) { var d = st.daily[k]; if (_isObj(d) && k < keep && d.plan) d.plan = null; });
    _syncOpen(st, now);
    return st;
  }

  // ── 로드/저장 ───────────────────────────────────────
  function load() {
    if (_cache) return _cache;
    var now = Date.now();
    var raw = _readRaw(KEY), obj = null;
    if (raw != null) { try { obj = JSON.parse(raw); } catch (e) { obj = null; } }
    _lastRaw = null;
    if (_isObj(obj) && _isObj(obj.nodes)) {
      _lastRaw = raw;                                        // 정규화로 바뀐 것이 없으면 save()가 다시 쓰지 않는다
      _cache = _normalize(_upgrade(obj), now);
    } else {
      _cache = defaults(now);
      _migrateInto(_cache, now);
    }
    save();
    return _cache;
  }
  function _st() { return _cache || load(); }

  // ── 지연 쓰기(PERF-6) ──
  // 지연 ms: 테스트 주입값 > 테스트 주입 저장소(테스트가 저장소 원문을 바로 읽는다)와 숨김 이벤트를 받을 수 없는 환경
  // (document.visibilityState 없음 = node 러너)과 setTimeout 없음은 0(즉시) > DEFER_MS
  function _deferMs() {
    if (typeof _deferOver === 'number') return Math.max(0, _deferOver);
    if (_storeOver) return 0;
    if (typeof document === 'undefined' || !document || typeof document.visibilityState !== 'string') return 0;
    if (typeof setTimeout !== 'function') return 0;
    return DEFER_MS;
  }
  function _cancelTimer() {
    if (_timer == null) return;
    try { clearTimeout(_timer); } catch (e) {}
    _timer = null;
  }
  // 지금 쓴다. 원문이 마지막으로 쓴(읽은) 것과 같으면 setItem을 부르지 않는다. → 저장소와 캐시가 같은가
  function _writeNow() {
    _dirty = false;
    if (!_cache) return !_unsaved;
    var s = _store();
    if (!s) { _unsaved = true; return false; }
    var raw;
    try { raw = JSON.stringify(_cache); } catch (e) { _unsaved = true; return false; }
    if (raw === _lastRaw) { _unsaved = false; return true; }
    _writes++;
    try { s.setItem(KEY, raw); _lastRaw = raw; _unsaved = false; return true; }
    catch (e) { _unsaved = true; return false; }
  }
  function _onTimer() { _timer = null; if (_dirty || _unsaved) _writeNow(); }
  // 캐시를 '쓸 것'으로 표시. 지연이 0이면 바로 쓰고, 아니면 DEFER_MS 뒤 한 번만 쓴다(타이머가 이미 있으면 그 타이머가 맡는다)
  function save(state) {
    if (_isObj(state)) _cache = state;
    if (!_cache) return;
    _dirty = true;
    var ms = _deferMs();
    if (!(ms > 0)) { _cancelTimer(); _writeNow(); return; }
    if (_timer != null) return;
    try { _timer = setTimeout(_onTimer, ms); }
    catch (e) { _timer = null; _writeNow(); }
  }
  // 대기 중인 쓰기를 지금 끝낸다(화면 숨김, 페이지 떠남, 백업 직전). 실패했던 쓰기도 다시 시도한다. → 저장소와 캐시가 같은가
  function flush() {
    _cancelTimer();
    if ((_dirty || _unsaved) && _cache) return _writeNow();
    return !_unsaved;
  }
  function _dropCache() { _cancelTimer(); _dirty = false; _cache = null; _lastRaw = null; }
  function reset() {
    _dropCache(); _session = null; _todayRunning = false; _hand = null; _lastPass = null; _lastTouch = null;
    var s = _store();
    if (s) { try { s.removeItem(KEY); } catch (e) {} }
  }

  // ── 마이그레이션(6.4절) ─────────────────────────────
  function _migrateInto(st, now) {
    var prog = _readJSON('poker_progress');
    var sessions = (prog && Array.isArray(prog.completedSessions)) ? prog.completedSessions : [];
    var map = _mapData();
    var from = [];
    sessions.forEach(function(n) {
      n = Number(n);
      var ids = map[n] || map[String(n)];
      if (!isFinite(n) || !Array.isArray(ids) || !ids.length) return;
      if (from.indexOf(n) < 0) from.push(n);
      ids.forEach(function(id) {
        var nd = _node(id);
        if (!nd || nd.kind === 'boss' || !nd.lesson) return;     // 보스와 레슨 없는 노드는 옮길 레슨이 없음
        var r = _rec(st, id);
        if (!r.lesson.done) { r.lesson.done = true; r.lesson.doneAt = _iso(now); }
        if (r.status !== 'passed') r.status = 'done';            // 통과는 아님(드릴 기준이 없었음)
      });
    });
    from.sort(function(a, b) { return a - b; });
    var coach = _readJSON('poker_coach');
    var lv = (coach && typeof coach.level === 'number') ? coach.level : null;
    var hintStage = (lv != null && lv >= 2) ? 2 : 1;               // L0~1: S1, L2와 L3: S2(배치 고사 카드 힌트)
    var drills = _readJSON('poker_drills');
    var pn = (drills && drills.stats && drills.stats.preflop && _num(drills.stats.preflop.n, 0)) || 0;
    if (pn >= 100) {
      ['s2-03', 's2-04'].forEach(function(id) {
        var nd = _node(id); if (!nd || !nd.drill) return;
        var r = _rec(st, id), c = _drillCount(nd.drill);
        if (c > 0) r.drill.best = Math.max(r.drill.best, Math.min(1, _num(nd.drill.pass, c) / c));
        r.drill.lastAt = r.drill.lastAt || _iso(now);
      });
    }
    // 게임 기록 소급은 첫 마이그레이션 1회만(migrate()를 다시 불러도 JStats에 두 번 쌓지 않음)
    var backfilled = (st.migratedFrom && st.migratedFrom.backfilled != null) ? st.migratedFrom.backfilled : _backfill(now);
    st.migratedFrom = { completedSessions: from, coachLevel: lv, hintStage: hintStage, preflopDrills: pn, backfilled: backfilled, at: _iso(now) };
    return { fromSessions: from, hintStage: hintStage };
  }
  // poker_game_history 최근 200핸드 결정을 JStats로 1회 소급(dec/concept/street만, 6.4절 4번)
  function _backfill(now) {
    if (typeof JStats === 'undefined' || !_fn(JStats, 'record')) return 0;
    var hist = _readJSON('poker_game_history');
    if (!Array.isArray(hist) || !hist.length) return 0;
    var count = 0;
    var run = function() {
      hist.slice(-200).forEach(function(h) {
        if (!_isObj(h) || !Array.isArray(h.decisions)) return;
        if (h.mode === 'headsup-tag' || h.mode === 'mixed') return;     // HU 제외
        var t = _ms(h.date); if (!isFinite(t)) t = now;
        h.decisions.forEach(function(d) {
          if (!_isObj(d) || !d.light || d.gtoRound === 2) return;
          JStats.record('dec', { street: d.street || null, source: d.source || null, concept: d.spot || null, light: d.light,
            marginal: false, pattern: d.pattern || null, pos: h.heroPos || null, hu: false, mode: h.mode || null, node: null,
            hint: d.hidden === false, evLoss: Math.max(0, _num(d.bestEV, 0) - _num(d.actualEV, 0)), estimated: false, backfill: true }, t);
          count++;
        });
      });
    };
    try { if (_fn(JStats, 'batch')) JStats.batch(run); else run(); } catch (e) { _warn(e); }
    return count;
  }
  function migrate(now) {
    now = _now(now);
    var st = _st();
    var res = _migrateInto(st, now);
    save();
    return res;
  }

  // ── 노드 판정 ───────────────────────────────────────
  function _drillCount(dr) {
    if (!dr) return 0;
    if (_num(dr.count, 0) > 0) return _num(dr.count, 0);
    if (Array.isArray(dr.set)) return dr.set.reduce(function(s, x) {
      return s + (Array.isArray(x) ? _num(x[1], 0) : (_isObj(x) ? _num(x.count, 0) : 0));
    }, 0);
    return 0;
  }
  function _drillMet(nd, r) {
    if (!nd.drill) return true;
    var c = _drillCount(nd.drill);
    if (!(c > 0)) return true;
    var need = Math.min(1, _num(nd.drill.pass, c) / c);
    return r.drill.best + 1e-9 >= need;
  }
  function _missionMin(nd) { return nd.mission ? Math.max(0, _num(nd.mission.hands, 0)) : 0; }
  function _passedRec(st, id) { var r = st.nodes[id]; return !!r && r.status === 'passed'; }
  function _unlocked(st, nd) {
    var pre = Array.isArray(nd.prereq) ? nd.prereq : [];
    for (var i = 0; i < pre.length; i++) if (!_passedRec(st, pre[i])) return false;
    if (nd.kind === 'boss') {
      var list = _nodesData();
      for (var j = 0; j < list.length; j++) {
        var x = list[j];
        if (x && x.stage === nd.stage && x.kind !== 'boss' && !_passedRec(st, x.id)) return false;
      }
    }
    return true;
  }
  function _availableRec(st, nd) {
    var r = st.nodes[nd.id];
    return !!r && (r.status === 'open' || r.status === 'done') && _unlocked(st, nd);
  }
  function _availSet(st) {
    var o = {};
    _nodesData().forEach(function(nd) { if (nd && _availableRec(st, nd)) o[nd.id] = true; });
    return o;
  }
  // 선행이 모두 통과된 locked 노드를 open으로, 가용 노드의 mission.openedAt을 기록
  function _syncOpen(st, now) {
    var opened = [];
    _ordered().forEach(function(nd) {
      if (!nd || !nd.id) return;
      var r = _rec(st, nd.id);
      if (r.status === 'passed' || !_unlocked(st, nd)) return;
      if (r.status === 'locked') { r.status = 'open'; opened.push(nd.id); }
      if (nd.mission && !r.mission.openedAt) r.mission.openedAt = _iso(now);
    });
    return opened;
  }
  function _countPassed(st) {
    var c = 0;
    _nodesData().forEach(function(nd) { if (nd && _passedRec(st, nd.id)) c++; });
    return c;
  }

  // 끝낸 레슨 수(M7 FLOW-06: 첫 실행 판정)
  function _countLessonsDone(st) {
    var c = 0;
    _nodesData().forEach(function(nd) { var r = nd && st.nodes[nd.id]; if (r && r.lesson && r.lesson.done) c++; });
    return c;
  }

  function nodeStatus(id) {
    var r = _st().nodes[id];
    return (r && r.status) || 'locked';
  }
  function openNodes() {
    var st = _st();
    return _ordered().filter(function(nd) { return nd && _availableRec(st, nd); }).map(function(nd) { return nd.id; });
  }
  function _stepOf(st, nd, r) {
    if (nd.kind === 'boss') return 'boss';
    if (nd.lesson && !r.lesson.done) return 'lesson';
    if (nd.drill && !_drillMet(nd, r)) return 'drill';
    if (nd.mission && r.mission.hands < _missionMin(nd)) return 'mission';
    if (nd.mission) { var br = _bossEval(nd, st); if (br && !br.pass) return 'mission'; }   // 핸드는 채웠지만 조건 미달
    return null;
  }
  // 가장 앞 가용 노드의 남은 할 일. 남은 할 일이 이번 버전에서 판정할 수 없는 미션 조건(Boss pending)뿐이면 뒤 노드를 먼저 안내하고,
  // 그런 노드만 남았을 때 그 노드를 돌려준다.
  function nextNode() {
    var st = _st();
    var list = _ordered();
    var parked = null;
    for (var i = 0; i < list.length; i++) {
      var nd = list[i];
      if (!nd || !_availableRec(st, nd)) continue;
      var r = st.nodes[nd.id];
      var step = _stepOf(st, nd, r);
      if (!step) continue;
      if (step === 'mission' && nd.kind !== 'boss' && r.mission.hands >= _missionMin(nd)) {
        var br = _bossEval(nd, st);
        // 판정할 수 없거나(pending) 지금은 기다리기만 남은(later, 다음 주 주간 복기) 노드는 뒤 노드를 먼저 안내
        if (br && (br.pending || br.later)) { if (!parked) parked = { id: nd.id, step: step }; continue; }
      }
      return { id: nd.id, step: step };
    }
    return parked;
  }

  // 미션 조건 판정(M3-P4a, Boss.evaluate). Boss가 없거나 실패하면 null(M1 동작: 핸드 수만)
  function _bossEval(nd, st) {
    if (!nd || !nd.mission || typeof Boss === 'undefined' || !_fn(Boss, 'evaluate')) return null;
    try { return Boss.evaluate(nd, (typeof JStats !== 'undefined') ? JStats : null, st || _st()) || null; } catch (e) { _warn(e); return null; }
  }
  // bossResult = Boss.evaluate 결과({ pass, cond?, ... }). 없으면 미션이 있는 노드는 Boss.evaluate를 직접 부른다.
  // 학습 노드: 통과 = 레슨 AND 드릴 AND (미션 핸드 수 AND 조건). 이미 passed인 노드는 이 결과로 되돌리지 않는다(표시용).
  // 보스 노드: 실전 칸(mission) = 보스 카운터 핸드 수 AND 조건(드릴 제외), 통과는 Boss 흐름이 넘긴 bossResult.pass가 있어야만.
  function evaluateNode(id, bossResult) {
    var st = _st(), nd = _node(id), r = st.nodes[id];
    if (!nd || !r) return { lesson: false, drill: false, mission: false, pass: false };
    var needL = !!nd.lesson, needD = !!nd.drill, needM = !!nd.mission;
    var lessonOk = !needL || !!r.lesson.done;
    var drillOk = !needD || _drillMet(nd, r);
    var handsOk = !needM || r.mission.hands >= _missionMin(nd);
    var given = _isObj(bossResult) ? bossResult : null;
    var br = given || (needM ? _bossEval(nd, st) : null);
    var condOk = br ? !!(nd.kind === 'boss' && br.cond != null ? br.cond : br.pass) : true;
    var missionOk = !needM || (handsOk && condOk);
    var pass = (nd.kind === 'boss')
      ? (!!(given && given.pass) && lessonOk && drillOk)
      : (lessonOk && drillOk && missionOk);
    var c = _drillCount(nd.drill);
    return { lesson: lessonOk, drill: drillOk, mission: missionOk, pass: pass,
      need: { lesson: needL, drill: needD, mission: needM },
      have: { scene: r.lesson.scene, best: r.drill.best, hands: r.mission.hands },
      req: { drillPass: needD ? _num(nd.drill.pass, c) : null, drillCount: needD ? c : null, hands: needM ? _missionMin(nd) : null },
      cond: br ? { pass: !!br.pass, hold: !!br.hold, pending: !!br.pending, more: _num(br.more, 0), est: !!br.est } : null };
  }

  // 기준을 모두 채운 가용 학습 노드는 자동 통과(결과는 lastPass()로 조회)
  function _autoPass(st, id, now) {
    var nd = _node(id), r = st.nodes[id];
    if (!nd || !r || nd.kind === 'boss' || r.status === 'passed') return null;
    if (!_unlocked(st, nd) || !evaluateNode(id).pass) return null;
    var res = passNode(id, { skipped: false }, now);
    _lastPass = { id: id, opened: res.opened, promoted: res.promoted, at: now };
    return res;
  }
  // 핸드, 레슨, 드릴 밖에서 조건이 채워졌을 때(숨은 좌석 맞히기 제출 등) 학습 노드 자동 통과를 다시 본다. 통과면 passNode 결과, 아니면 null
  function checkNode(id, now) {
    now = _now(now);
    var st = _st();
    var res = _autoPass(st, id, now);
    save();
    return res;
  }

  function completeLesson(id, sceneIdx, done, now) {
    now = _now(now);
    var st = _st(), nd = _node(id);
    if (!nd) return null;
    var r = _rec(st, id);
    r.lesson.scene = Math.max(r.lesson.scene || 0, Math.max(0, Math.floor(_num(sceneIdx, 0))));
    if (done) {
      if (!r.lesson.done) {
        r.lesson.done = true; r.lesson.doneAt = _iso(now);
        addXp('lesson', undefined, now);
        noteActivity(now, Math.min(10, _num(nd.est, 3)));   // M7 FLOW-07: 첫 완료만 활동일과 분(노드 예상 시간)으로
      } else noteActivity(now, 0);                           // 다시 본 레슨도 활동일(분은 첫 완료에만)
      if (r.status !== 'passed') r.status = 'done';
    }
    _autoPass(st, id, now);
    save();
    return r;
  }

  // res = { n, ok }. drill.best = max(best, ok/n). 노드 기준 세트(최대 10문항)보다 작은 세트는 best에 넣지 않는다.
  function recordDrillSet(id, res, now) {
    now = _now(now);
    var st = _st(), nd = _node(id);
    if (!nd) return null;
    var r = _rec(st, id);
    var n = Math.floor(_num(res && res.n, 0)), ok = Math.max(0, Math.min(n, Math.floor(_num(res && res.ok, 0))));
    if (n > 0) {
      r.drill.n += 1;
      r.drill.lastAt = _iso(now);
      var c = _drillCount(nd.drill) || n;
      if (n >= Math.min(c, 10)) r.drill.best = Math.max(r.drill.best, ok / n);
      _autoPass(st, id, now);
      save();
      noteActivity(now, n * 25 / 60);                        // M7 FLOW-07: 드릴 세트도 활동일, 문항당 25초(Today.SEC.puzzle)
    }
    return r;
  }

  function recordMissionHand(id, now) {
    now = _now(now);
    var st = _st(), nd = _node(id);
    if (!nd) return null;
    var r = _rec(st, id);
    r.mission.hands += 1;
    if (!r.mission.openedAt) r.mission.openedAt = _iso(now);
    _autoPass(st, id, now);
    save();
    return r;
  }

  function passNode(id, opts, now) {
    now = _now(now);
    var st = _st(), nd = _node(id);
    if (!nd) return { opened: [], promoted: null };
    var skipped = !!(opts && opts.skipped);
    var before = _availSet(st);
    var r = _rec(st, id);
    var wasPassed = r.status === 'passed';
    if (!wasPassed) {
      r.status = 'passed'; r.passedAt = _iso(now); r.skipped = skipped;
      if (nd.mission && !r.mission.passedAt) r.mission.passedAt = _iso(now);
      if (!skipped && nd.kind === 'boss') addXp('boss', undefined, now);
      else if (!skipped && nd.mission) addXp('mission', undefined, now);
    } else if (!skipped && r.skipped) {
      r.skipped = false;                                   // 건너뜀 통과 뒤 실제 통과
    }
    var promoted = null;
    if (nd.kind === 'boss') {
      // 보스 통과 = 그 단계(와 아래 단계)의 남은 노드 전부 건너뜀 통과(점프 테스트, 2.2절)
      _nodesData().forEach(function(x) {
        if (!x || x.id === id || !(x.stage <= nd.stage)) return;
        var xr = _rec(st, x.id);
        if (xr.status !== 'passed') { xr.status = 'passed'; xr.skipped = true; xr.passedAt = _iso(now); }
      });
      var next = nd.stage + 1;
      if (next <= _maxStage() && st.stage < next) { promote(next, now); promoted = next; }
    }
    _syncOpen(st, now);
    // 새로 가용이 된 노드 중 이미 기준을 채운 노드는 연쇄 자동 통과
    var after = _availSet(st);
    var opened = _ordered().filter(function(x) { return x && after[x.id] && !before[x.id]; }).map(function(x) { return x.id; });
    opened.forEach(function(oid) { if (oid !== id) _autoPass(st, oid, now); });
    save();
    return { opened: opened, promoted: promoted };
  }

  // 단계 진입: 아래 단계 노드는 건너뜀 통과로 맞추고, JStats.markStageEnter와 settings(coachMax, stageSizeButtons)에 기록
  function promote(stage, now) {
    now = _now(now);
    stage = Math.floor(_num(stage, 0));
    if (!(stage >= 1)) return;
    stage = Math.min(stage, _maxStage());
    var st = _st();
    _nodesData().forEach(function(x) {
      if (!x || !(x.stage < stage)) return;
      var xr = _rec(st, x.id);
      if (xr.status !== 'passed') { xr.status = 'passed'; xr.skipped = true; xr.passedAt = _iso(now); }
    });
    if (stage > st.stage) {
      st.stage = stage;
      if (typeof JStats !== 'undefined' && _fn(JStats, 'markStageEnter')) { try { JStats.markStageEnter(stage, now); } catch (e) { _warn(e); } }
      _writeStageSettings(stage);
    }
    _syncOpen(st, now);
    save();
  }
  function _defaultSettings() {
    return { v: 1, fontScale: 100, fourColor: false, cbChart: false, reduceMotion: null, sound: false, vibrate: false,
      thinkingReveal: 'after', guessInGame: true, sizeButtons: 'auto', ghostLeague: false, castNames: false };
  }
  // sizeButtons(사용자 선택 'auto'|'simple'|'grouped')는 건드리지 않고, 'auto'가 따를 단계값을 stageSizeButtons로 둔다
  function _writeStageSettings(stage) {
    var sd = _stageInfo(stage);
    if (!sd) return;
    var s = _readJSON(SETTINGS_KEY);
    if (!_isObj(s)) s = _defaultSettings();
    if (sd.coachMax != null) s.coachMax = sd.coachMax;
    if (sd.sizeButtons) s.stageSizeButtons = sd.sizeButtons;
    _writeJSON(SETTINGS_KEY, s);
  }

  // ── XP와 레벨(4.3절) ────────────────────────────────
  // T(n) = base(n-1) + (step/2)(n-1)(n-2), base 300, step 50 → T(10)=4500, T(20)=14250
  function _T(n) {
    var b = _num(_xpc('levelBase'), 300), s = _num(_xpc('levelStep'), 50);
    return b * (n - 1) + (s / 2) * (n - 1) * (n - 2);
  }
  function levelFor(xp) {
    xp = Math.max(0, _num(xp, 0));
    var b = _num(_xpc('levelBase'), 300), s = _num(_xpc('levelStep'), 50);
    var a = s / 2, c = b - s / 2;                          // T = a m^2 + c m, m = n-1
    var m = a > 0 ? Math.floor((-c + Math.sqrt(c * c + 4 * a * xp)) / (2 * a)) : Math.floor(xp / (b || 1));
    var n = Math.max(1, m + 1);
    while (n > 1 && _T(n) > xp) n--;
    while (_T(n + 1) <= xp) n++;
    return n;
  }
  function xpToNext(xp) {
    if (xp === undefined) xp = _st().xp;
    xp = Math.max(0, _num(xp, 0));
    var lv = levelFor(xp);
    return { have: xp - _T(lv), need: _T(lv + 1) - _T(lv), level: lv };
  }
  // src: lesson, ask, puzzle, review, reviewRepeat, decision, mission, boss, theater, theaterHit, daily5, daily5Perfect, todayDone, weekly, season 등.
  // amount 생략 시 JOURNEY_XP[src](숫자일 때). 반복 출처(review, reviewRepeat, decision)는 하루 repeatCap(120)까지.
  function addXp(src, amount, now) {
    now = _now(now);
    var st = _st();
    var amt = (typeof amount === 'number' && isFinite(amount)) ? amount : _num(typeof _xpc(src) === 'number' ? _xpc(src) : 0, 0);
    amt = Math.max(0, amt);
    var capped = false;
    var d = _day(st, now);
    if (REPEAT_SRC[src]) {
      var cap = _num(_xpc('repeatCap'), 120), used = _num(d.repeatXp, 0);
      var room = Math.max(0, cap - used);
      if (amt > room) { amt = room; capped = true; }
      d.repeatXp = used + amt;
    }
    var prev = levelFor(st.xp);
    st.xp = Math.max(0, _num(st.xp, 0)) + amt;
    d.xp = _num(d.xp, 0) + amt;
    var lv = levelFor(st.xp);
    st.level = lv;
    if (!Array.isArray(st.unlocks)) st.unlocks = [];
    var unlocked = [];
    _unlocksData().slice().sort(function(a, b) { return a.level - b.level; }).forEach(function(u) {
      if (!u || !(u.level <= lv)) return;
      var k = u.kind + ':' + u.id;
      if (st.unlocks.indexOf(k) < 0) { st.unlocks.push(k); unlocked.push(k); }
    });
    if (amt > 0 && typeof JStats !== 'undefined' && _fn(JStats, 'record')) { try { JStats.record('xp', amt, now); } catch (e) { _warn(e); } }
    save();
    return { xp: st.xp, level: lv, leveledUp: lv > prev, capped: capped, unlocked: unlocked, granted: amt };
  }

  // ── 하루 기록과 스트릭(4.2절) ────────────────────────
  // key: 시작한 날의 기록에 쓰고 싶을 때(자정을 넘긴 오늘의 5분, M7 TIME-02). 생략하면 now의 날짜.
  function _day(st, now, key) {
    var k = key || dayKey(now);
    var d = st.daily[k];
    if (!_isObj(d)) d = st.daily[k] = {};
    if (!Array.isArray(d.blocks)) d.blocks = [];
    if (!Array.isArray(d.done)) d.done = [];
    d.doneBlocks = _num(d.doneBlocks, 0);
    d.minutes = _num(d.minutes, 0);
    d.xp = _num(d.xp, 0);
    d.repeatXp = _num(d.repeatXp, 0);
    if (!_isObj(d.blockXp)) d.blockXp = {};
    if (d.daily5 === undefined) d.daily5 = null;
    if (d.plan === undefined) d.plan = null;
    return d;
  }
  function dayRecord(now) { var d = _day(_st(), _now(now)); return d; }

  // 'YYYY-MM-DD' ↔ 일 번호(UTC 자정 기준, seasons.js와 같은 식). 날짜 덧셈은 일 번호로 해서 ms 덧셈과 서머타임 오차가 없다.
  function _dayIdx(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k));
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : NaN;
  }
  function _keyOf(idx) {
    var t = new Date(idx * DAY);
    var m = t.getUTCMonth() + 1, d = t.getUTCDate();
    return t.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  // 마지막 활동 날짜 키(저장된 lastDay가 깨졌으면 lastActiveAt에서 다시 계산)
  function _lastKey(s, last) { return isFinite(_dayIdx(s.lastDay)) ? s.lastDay : dayKey(last); }
  // 빠진 날 수: 달력 날짜 차(dd-1)와 시간 차(36h 유예 뒤 24h 단위) 중 관대한 쪽
  function _missDays(dd, gap) { return Math.min(dd - 1, Math.floor((gap - STREAK_GAP) / DAY) + 1); }

  // 규칙(TIME-01): 달력 날짜 차 dd = 오늘 - 마지막 활동일. 같은 dayKey면 cur 변화 없음. dd ≤ 0(서쪽 이동)이면 cur 유지.
  // dd === 1(어제 했음)이거나 gap ≤ 36h면 cur+1. 그 밖에는 miss = min(dd-1, floor((gap-36h)/24h)+1)이고,
  // freezes ≥ miss면 소모하고 cur+1(frozenDays에 빠진 날 기록), 아니면 cur = 1. cur가 7의 배수가 되면 freezes = min(2, freezes+1).
  function touchDay(now) {
    now = _now(now);
    var st = _st(), s = st.streak;
    var dk = dayKey(now);
    var last = s.lastActiveAt ? _ms(s.lastActiveAt) : NaN;
    var res = { cur: s.cur, best: s.best, changed: false, freezeUsed: 0, freezeGranted: false };
    var inc = false;
    if (!isFinite(last)) { s.cur = 1; res.changed = true; inc = true; }
    else if (s.lastDay !== dk && now >= last) {
      var gap = now - last;
      var ld = _lastKey(s, last);
      var dd = _dayIdx(dk) - _dayIdx(ld);
      if (dd <= 0) { /* 서쪽으로 이동해 날짜가 같거나 앞섬: cur 그대로, 시각만 갱신 */ }
      else if (dd === 1 || gap <= STREAK_GAP) { s.cur += 1; inc = true; res.changed = true; }
      else {
        var miss = _missDays(dd, gap);
        if (s.freezes >= miss) {
          s.freezes -= miss; s.cur += 1; inc = true; res.freezeUsed = miss;
          var base = _dayIdx(ld);
          for (var i = 1; i <= miss; i++) s.frozenDays.push(_keyOf(base + i));
          if (s.frozenDays.length > 60) s.frozenDays = s.frozenDays.slice(-60);
        } else s.cur = 1;
        res.changed = true;
      }
    }
    if (inc && s.cur > 0 && s.cur % 7 === 0 && s.freezes < 2) { s.freezes += 1; res.freezeGranted = true; }
    if (s.cur > s.best) s.best = s.cur;
    if (!isFinite(last) || now >= last) { s.lastActiveAt = _iso(now); s.lastDay = dk; }
    res.cur = s.cur; res.best = s.best;
    _lastTouch = res;
    save();
    return res;
  }
  // 화면 표시용 현재 스트릭(저장값을 바꾸지 않음): 마지막 활동 뒤 공백을 프리즈로 메울 수 없으면 0
  function _liveStreak(st, now) {
    var s = st.streak, last = s.lastActiveAt ? _ms(s.lastActiveAt) : NaN;
    if (!isFinite(last) || !(s.cur > 0)) return 0;
    var gap = now - last, dk = dayKey(now);
    if (gap <= STREAK_GAP || s.lastDay === dk) return s.cur;
    var dd = _dayIdx(dk) - _dayIdx(_lastKey(s, last));
    if (dd <= 1) return s.cur;
    return s.freezes >= _missDays(dd, gap) ? s.cur : 0;
  }

  // 블록 1개 완료: doneBlocks와 minutes 누적, 스트릭 갱신(touchDay). XP는 지급하지 않고 blockXp[name]에 표시용으로만 남긴다.
  // name === 'wrap'이면 오늘의 5분 완주(하루 1회 todayDone XP)로 보고 진행 중 표시를 끈다.
  // opts.day('YYYY-MM-DD')가 있으면 그 날의 기록(doneBlocks, done, minutes, blockXp, todayDone)에 쓴다. 자정을 넘겨 끝낸 블록을 계획을 시작한 날에
  // 붙이기 위한 것이고, 스트릭(touchDay)과 JStats 분은 실제 시각(now)으로 센다.
  function markBlock(name, minutes, xp, now, opts) {
    now = _now(now);
    var okDay = (opts && typeof opts.day === 'string' && isFinite(_dayIdx(opts.day))) ? opts.day : null;
    var st = _st(), d = _day(st, now, okDay);
    name = String(name || 'block');
    d.doneBlocks += 1;
    if (d.done.indexOf(name) < 0) d.done.push(name);
    var m = Math.max(0, _num(minutes, 0));
    if (m > 0) {
      d.minutes = Math.round((d.minutes + m) * 100) / 100;
      if (typeof JStats !== 'undefined' && _fn(JStats, 'record')) { try { JStats.record('minutes', m, now); } catch (e) { _warn(e); } }
    }
    var x = Math.max(0, _num(xp, 0));
    if (x > 0) d.blockXp[name] = _num(d.blockXp[name], 0) + x;
    touchDay(now);
    if (name === 'wrap') {
      _todayRunning = false;
      if (!d.todayDone) { d.todayDone = true; addXp('todayDone', undefined, now); }
    }
    save();
    return d;
  }
  // 학습 활동 1개(레슨 완료, 드릴 세트, 데일리 5 완주, 6인 실전 1핸드 등)를 활동일로 센다(M7 FLOW-07, 설계서 4.2절).
  // 스트릭(touchDay)과 오늘 분(목표 링)은 오늘의 5분 블록과 극장 1편 말고도 쌓여야 한다. 오늘의 5분이 진행 중이면 블록 완료(markBlock)가
  // 활동일과 분을 세므로 여기서는 아무것도 하지 않는다(중복 방지, 마무리 카드의 프리즈 표시도 지켜짐). minutes는 추정 분, 0이면 활동일만.
  function noteActivity(now, minutes) {
    if (_todayRunning) return null;
    now = _now(now);
    var res = touchDay(now);
    var m = Math.max(0, Math.min(30, _num(minutes, 0)));
    if (m > 0) {
      var d = _day(_st(), now);
      d.minutes = Math.round((d.minutes + m) * 100) / 100;
      if (typeof JStats !== 'undefined' && _fn(JStats, 'record')) { try { JStats.record('minutes', m, now); } catch (e) { _warn(e); } }
      save();
    }
    return res;
  }
  // 오늘의 plan 저장(TodayUI). 저장하면 오늘의 5분 진행 중(active)으로 본다.
  function setPlan(plan, now) {
    now = _now(now);
    var d = _day(_st(), now);
    d.plan = plan || null;
    d.blocks = (plan && Array.isArray(plan.blocks)) ? plan.blocks.map(function(b) { return b && b.id; }).filter(Boolean) : [];
    _todayRunning = !!plan;
    save();
    return d;
  }
  function endToday() { _todayRunning = false; }

  // ── 속마음 극장 기록과 오늘의 명장면(계약 T9, M4-P8) ─────
  function _theater(st) {
    var t = st.theater;
    if (!_isObj(t)) t = st.theater = { episodes: 0, predicted: 0, hit: 0, hitW: 0, cards: [], mini: null };
    ['episodes', 'predicted', 'hit'].forEach(function(k) { t[k] = Math.max(0, Math.floor(_num(t[k], 0))); });
    t.hitW = Math.max(0, _num(t.hitW, 0));
    if (!Array.isArray(t.cards)) t.cards = [];
    if (t.mini === undefined) t.mini = null;
    return t;
  }
  // 도감의 카드(id가 있는 객체만)
  function _cards(st) {
    var t = st && st.theater;
    return (_isObj(t) && Array.isArray(t.cards)) ? t.cards.filter(function(c) { return _isObj(c) && c.id != null && String(c.id) !== ''; }) : [];
  }
  function _copyJSON(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } }
  // 카드 id = card.id, 없으면 'th-<seed>'(계약 T7 형식). 둘 다 없으면 null(카드를 담지 않음)
  function _cardId(card, seed) {
    if (!_isObj(card)) return null;
    if (card.id != null && String(card.id) !== '') return String(card.id);
    var sd = (card.seed != null) ? card.seed : seed;
    return (sd != null && String(sd) !== '') ? 'th-' + sd : null;
  }
  // res = { seed, predicted, hit, hitW, card|null }. 호출 1회 = 극장 1편(TheaterUI가 편이 끝날 때마다 부른다, 계약 T8).
  // 누적(episodes, predicted, hit, hitW). 카드는 at(지금)을 붙여 도감에 담고, id가 같으면 무시, 100장을 넘으면 오래된 것(at)부터 지운다.
  // XP는 addXp('theater')(10)와 addXp('theaterHit', 2 x hit). 예측은 비자명 결정에서만 묻으므로 적중은 전부 비자명 적중이다(4.3절).
  // 그리고 JStats.record('theater', {ep:1, pred, hit})와 touchDay(극장 1편도 활동일).
  // 반환 { xp(이번에 받은 XP 합), card(새로 담은 카드 사본|null), duplicate, level, leveledUp, unlocked, episodes(누적) }
  function recordTheater(res, now) {
    now = _now(now);
    res = _isObj(res) ? res : {};
    var st = _st(), t = _theater(st);
    var pred = Math.max(0, Math.floor(_num(res.predicted, 0)));
    var hit = Math.max(0, Math.floor(_num(res.hit, 0)));
    if (hit > pred) pred = hit;
    var hitW = Math.max(0, Math.min(hit, _num(res.hitW, 0)));
    t.episodes += 1;
    t.predicted += pred;
    t.hit += hit;
    t.hitW = Math.round((t.hitW + hitW) * 1000) / 1000;
    var stored = null, dup = false;
    var cid = _cardId(res.card, res.seed);
    if (cid) {
      if (t.cards.some(function(c) { return _isObj(c) && String(c.id) === cid; })) dup = true;
      else {
        var c = _copyJSON(res.card) || {};
        c.id = cid;
        if (c.seed == null && res.seed != null) c.seed = res.seed;
        c.at = _iso(now);
        t.cards.push(c);
        if (t.cards.length > CARD_CAP) {
          t.cards = t.cards.map(function(x, i) { return { x: x, i: i }; }).sort(function(a, b) {
            var ta = _ms(_isObj(a.x) ? a.x.at : null), tb = _ms(_isObj(b.x) ? b.x.at : null);
            ta = isFinite(ta) ? ta : 0; tb = isFinite(tb) ? tb : 0;
            return (ta - tb) || (a.i - b.i);
          }).map(function(o) { return o.x; }).slice(-CARD_CAP);
        }
        if (t.cards.indexOf(c) >= 0) stored = _copyJSON(c);
      }
    }
    save();
    var r1 = addXp('theater', undefined, now);
    var hx = hit * _num(_xpc('theaterHit'), 2);
    var r2 = hx > 0 ? addXp('theaterHit', hx, now) : null;
    if (typeof JStats !== 'undefined' && _fn(JStats, 'record')) { try { JStats.record('theater', { ep: 1, pred: pred, hit: hit }, now); } catch (e) { _warn(e); } }
    touchDay(now);
    var last = r2 || r1;
    return { xp: _num(r1.granted, 0) + (r2 ? _num(r2.granted, 0) : 0), card: stored, duplicate: dup,
      level: last.level, leveledUp: !!(r1.leveledUp || (r2 && r2.leveledUp)), unlocked: r1.unlocked.concat(r2 ? r2.unlocked : []),
      episodes: t.episodes };
  }
  // 32비트 FNV-1a(문자열 결정론 해시)
  function _hash(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  // 오늘의 명장면: 도감 카드 중 날짜 시드로 1장. 카드마다 hash('YYYY-MM-DD|id')를 매겨 가장 큰 카드를 고른다(같은 날 같은 도감이면
  // 같은 카드, 카드 순서와 무관, 카드가 늘거나 지워져도 그 카드가 1등이 아니면 그대로). 어제까지 모은 카드(at이 오늘 0시 전이거나 없음)가
  // 있으면 그중에서만 골라, 오늘 막 담은 카드가 그날의 명장면으로 바뀌어 끼어들지 않게 한다. 카드가 없으면 null. 반환은 사본.
  function highlightOfDay(now) {
    now = _now(now);
    var cards = _cards(_st());
    if (!cards.length) return null;
    var dk = dayKey(now);
    var d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    var start = d0.getTime();
    var old = cards.filter(function(c) { var t = _ms(c.at); return !isFinite(t) || t < start; });
    var pool = old.length ? old : cards;
    var best = null, bh = -1;
    pool.forEach(function(c) {
      var id = String(c.id), h = _hash(dk + '|' + id);
      if (h > bh || (h === bh && best && id < String(best.id))) { best = c; bh = h; }
    });
    return _copyJSON(best);
  }

  // ── 세션(미션 5핸드, 자유 3핸드, 보스 5핸드 단위) ─────
  // 세션이 끝나거나(end) 새 세션으로 바뀌거나(replaced) 다른 게임이 시작되면(other) Boss에 알린다(코칭 고정 해제, 보스 판정)
  function _sessionEnded(s, reason) {
    if (!s || typeof Boss === 'undefined' || !_fn(Boss, 'onSessionEnd')) return;
    try { Boss.onSessionEnd(s, { reason: reason }); } catch (e) { _warn(e); }
  }
  function startSession(opts) {
    opts = opts || {};
    if (_session) { var old = _session; _session = null; _sessionEnded(old, 'replaced'); }
    var kind = (opts.kind === 'mission' || opts.kind === 'free' || opts.kind === 'boss') ? opts.kind : 'free';
    var nd = opts.node ? _node(opts.node) : null;
    var chunk = Math.floor(_num(opts.chunk, CHUNK[kind]));
    // sid = 이 세션이 묶인 게임(app.js _sessionId). 첫 onNewHand에서 정해지고, 다른 게임이 시작되면 세션은 끝난 것으로 본다.
    _session = { kind: kind, node: opts.node || null, chunk: chunk > 0 ? chunk : CHUNK[kind], hands: 0, startedAt: Date.now(),
      emphasis: opts.emphasis || (nd && nd.mission && nd.mission.emphasis) || null,
      cast: Array.isArray(opts.cast) ? opts.cast.slice() : null,
      seed: (opts.seed != null) ? opts.seed : null, sid: null };
    if (typeof Boss !== 'undefined' && _fn(Boss, 'onSessionStart')) { try { Boss.onSessionStart(_session); } catch (e) { _warn(e); } }
    return _session;
  }
  function session() { return _session; }
  function endSession() { var s = _session; _session = null; _noteShort(s, Date.now()); _sessionEnded(s, 'end'); return s; }
  // 분량(chunk)을 채우기 전에 사용자가 끝낸 세션(세션 종료 버튼, 메뉴, 뒤로). 한 핸드도 안 친 세션은 세지 않는다
  function _noteShort(s, now) {
    if (!s) return;
    var h = Math.floor(_num(s.hands, 0)), ch = Math.floor(_num(s.chunk, 0));
    if (!(h >= 1 && h < ch)) return;
    try {
      var st = _st();
      if (!Array.isArray(st.shortSessions)) st.shortSessions = [];
      st.shortSessions.push({ at: _iso(now), hands: h, chunk: ch, kind: s.kind || null, node: s.node || null });
      if (st.shortSessions.length > SHORT_CAP) st.shortSessions.splice(0, st.shortSessions.length - SHORT_CAP);
      save();
    } catch (e) { _warn(e); }
  }
  function shouldEndSession() { return !!(_session && _session.chunk > 0 && _session.hands >= _session.chunk); }
  function active() { return !!_session || _todayRunning; }

  // ── 좌석 구성(6인 캐스트) ───────────────────────────
  function _castList() {
    var src = (typeof CAST !== 'undefined' && Array.isArray(CAST)) ? CAST.filter(function(c) { return c && c.key && c.type; }) : [];
    if (src.length < 5) src = DEFAULT_CAST;
    return src.map(function(c) { return { key: c.key, type: c.type }; });
  }
  function _playable(type) {
    var P = (typeof VillainProfiles !== 'undefined' && VillainProfiles) ? VillainProfiles : null;
    if (P) return P[type] ? type : (P[TYPE_FALLBACK[type]] ? TYPE_FALLBACK[type] : 'TAG');
    return BASE_TYPES[type] ? type : (TYPE_FALLBACK[type] || 'TAG');
  }
  function _pickCast(emphasis, keys) {
    var all = _castList(), byKey = {};
    all.forEach(function(c) { byKey[c.key] = c; });
    var out = [], used = {};
    function take(k) { if (out.length < 5 && byKey[k] && !used[k]) { used[k] = true; out.push(byKey[k]); } }
    if (emphasis) take(emphasis);
    (Array.isArray(keys) ? keys : []).forEach(take);
    CAST_ORDER.forEach(take);
    all.forEach(function(c) { take(c.key); });
    return out;
  }
  // 'sixmax-cast' → 캐스트 5인(히어로 제외, 강조 캐스트 포함), 좌석 고정 + 포지션 회전(app.js sixmax와 같은 식)
  // 'sixmax-cast-hidden' → 은닉 좌석(이름은 중립, spec.hidden:true). 정하는 순서:
  //   opts.seatTypes(손님A~E 5개) > opts.seed(유형 5종 셔플) > 은닉 노드(opts.node, 세션 노드, 세션이 없으면 boss.hiddenLast)의 배정
  //   (hiddenSeats, 1곳 은닉이면 나머지 4자리는 캐스트) > 세션 시드 > boss.active.seatTypes/seed > 시드 1
  // opts(선택) = { emphasis, cast:[keys], seed, seatTypes:{name:type}, node }. 없으면 현재 세션 컨텍스트와 boss를 본다.
  // spec.type은 엔진이 실제로 쓰는 프로필(없는 유형은 폴백), spec.castType은 설계상의 유형.
  function playersSpec(config, heroPos, POS, opts) {
    if (config !== 'sixmax-cast' && config !== 'sixmax-cast-hidden') return null;
    POS = (Array.isArray(POS) && POS.length === 6) ? POS : POS6;
    opts = opts || {};
    var heroIdx = POS.indexOf(heroPos); if (heroIdx < 0) heroIdx = POS.indexOf('BTN');
    var btnSeat = (6 - heroIdx) % 6;
    var posFor = function(seat) { return POS[(seat - btnSeat + 3 + 6) % 6]; };
    var ses = _session;
    if (config === 'sixmax-cast') {
      var emph = opts.emphasis || (ses && ses.emphasis) || null;
      var list = _pickCast(emph, opts.cast || (ses && ses.cast));
      return CAST_SEATS.map(function(seat, i) {
        var c = list[i];
        var o = { type: _playable(c.type), name: c.key, pos: posFor(seat), castType: c.type };
        if (emph && c.key === emph) o.emphasis = true;
        return o;
      });
    }
    var active = null;
    try { active = _st().boss && _st().boss.active; } catch (e) { active = null; }
    var seatTypes = opts.seatTypes || null;
    var types = null;
    if (!(_isObj(seatTypes) && HIDDEN_NAMES.every(function(n) { return typeof seatTypes[n] === 'string'; })) && opts.seed == null) {
      var asg = _hiddenFor(opts.node || (ses && ses.node) || null, !ses);
      if (asg) return _specOf(asg, posFor, opts.emphasis || (ses && ses.emphasis) || null);
      seatTypes = (active && active.seatTypes) || null;
    }
    if (_isObj(seatTypes) && HIDDEN_NAMES.every(function(n) { return typeof seatTypes[n] === 'string'; })) {
      types = HIDDEN_NAMES.map(function(n) { return seatTypes[n]; });
    } else {
      var seed = (opts.seed != null) ? opts.seed : ((ses && ses.seed != null) ? ses.seed : ((active && active.seed != null) ? active.seed : 1));
      types = _shuffleTypes(seed).types;
    }
    return CAST_SEATS.map(function(seat, k) {
      return { type: _playable(types[k]), name: HIDDEN_NAMES[k], pos: posFor(seat), castType: types[k], hidden: true };
    });
  }

  // ── 은닉 좌석 배정(M6-BOSS, 계약 H9) ─────────────────
  // 유형 5종 시드 셔플(mulberry32 + Fisher-Yates). 같은 rnd를 이어 써서 1곳 은닉의 자리를 고른다
  function _shuffleTypes(seed) {
    var rnd = _rng(Math.floor(_num(seed, 1)) >>> 0);
    var types = HIDDEN_TYPES.slice();
    for (var i = types.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = types[i]; types[i] = types[j]; types[j] = t; }
    return { types: types, rnd: rnd };
  }
  function _hiddenNode(id) {
    var nd = id ? _node(id) : null;
    return (nd && nd.mission && nd.mission.config === 'sixmax-cast-hidden') ? nd : null;
  }
  function _hiddenMap(st) {
    if (!_isObj(st.boss)) st.boss = { active: null };
    if (!_isObj(st.boss.hidden)) st.boss.hidden = {};
    return st.boss.hidden;
  }
  // 배정 1개(순수): n = mission.hiddenSeats(1~5). 5면 손님A~E 전부, 아니면 셔플 앞 n개 유형을 시드로 고른 n자리에(1곳이면 이름 '손님')
  function _makeAssign(nd, seed, now) {
    var n = Math.max(1, Math.min(5, Math.floor(_num(nd.mission && nd.mission.hiddenSeats, 5))));
    var sh = _shuffleTypes(seed), seats = {}, names, slots;
    if (n >= 5) { names = HIDDEN_NAMES.slice(); slots = [0, 1, 2, 3, 4]; }
    else {
      var order = [0, 1, 2, 3, 4];
      for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(sh.rnd() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
      slots = order.slice(0, n).sort(function(a, b) { return a - b; });
      names = (n === 1) ? [HIDDEN_ONE] : HIDDEN_NAMES.slice(0, n);
    }
    names.forEach(function(nm, k) { seats[nm] = sh.types[k]; });
    return { key: nd.id + ':' + seed, node: nd.id, seed: seed, names: names, slots: slots, seats: seats, at: _iso(now), hands: 0 };
  }
  function _newSeed(now, old) {
    var s = Math.floor(_num(now, Date.now()) % 1000000) + 1;
    if (old != null && s === old) s = (s % 1000000) + 1;
    return s;
  }
  // 노드의 은닉 배정(없으면 만든다). opts.peek = 만들지 않음, opts.seed = 처음 만들 때 시드(테스트)
  function hiddenSeats(id, now, opts) {
    var nd = _hiddenNode(id);
    if (!nd) return null;
    var st = _st(), map = _hiddenMap(st), cur = map[id];
    if (_isObj(cur) && _isObj(cur.seats) && Array.isArray(cur.names) && Array.isArray(cur.slots)) return cur;
    if (opts && opts.peek) return null;
    map[id] = _makeAssign(nd, (opts && opts.seed != null) ? Math.floor(_num(opts.seed, 1)) : _newSeed(_now(now)), _now(now));
    st.boss.hiddenLast = id;
    save();
    return map[id];
  }
  // 맞히기 실패 뒤 좌석을 새로 섞는다(새 key라 castObs 관찰이 처음부터). 보스 시도 중이면 active.seatTypes도 맞춘다
  function reshuffleHidden(id, now, opts) {
    var nd = _hiddenNode(id);
    if (!nd) return null;
    now = _now(now);
    var st = _st(), map = _hiddenMap(st), old = map[id];
    var seed = (opts && opts.seed != null) ? Math.floor(_num(opts.seed, 1)) : _newSeed(now + 7919, old && old.seed);
    map[id] = _makeAssign(nd, seed, now);
    var a = st.boss.active;
    if (_isObj(a) && a.node === id) { a.seatTypes = _copyJSON(map[id].seats); a.seed = seed; }
    st.boss.hiddenLast = id;
    save();
    return map[id];
  }
  // playersSpec와 onNewHand가 쓸 배정: 은닉 노드면 그 배정(없으면 만든다), 아니면 lastOk일 때만 마지막 은닉 노드의 배정(만들지 않음)
  function _hiddenFor(nodeId, lastOk) {
    if (_hiddenNode(nodeId)) return hiddenSeats(nodeId);
    if (!lastOk) return null;
    var st = _st(), last = st.boss && st.boss.hiddenLast;
    return last ? hiddenSeats(last, null, { peek: true }) : null;
  }
  function _specOf(asg, posFor, emph) {
    var cast = _pickCast(emph, null).filter(function(c) { return asg.names.indexOf(c.key) < 0; });
    var ci = 0;
    return CAST_SEATS.map(function(seat, i) {
      var k = asg.slots.indexOf(i);
      if (k >= 0) {
        var nm = asg.names[k], t = asg.seats[nm];
        return { type: _playable(t), name: nm, pos: posFor(seat), castType: t, hidden: true };
      }
      var c = cast[ci++] || cast[0];
      var o = { type: _playable(c.type), name: c.key, pos: posFor(seat), castType: c.type };
      if (emph && c.key === emph) o.emphasis = true;
      return o;
    });
  }
  // 은닉 노드 테이블에 함께 앉는 캐스트(1곳 은닉인 s6-02의 비교 상대) [{ name: 캐스트 키, type }](_specOf와 같은 순서, 배정이 없거나 5곳 은닉이면 [])
  function hiddenCast(id) {
    var nd = _hiddenNode(id);
    var asg = nd ? hiddenSeats(id, null, { peek: true }) : null;
    if (!asg || asg.names.length >= CAST_SEATS.length) return [];
    return _pickCast((nd.mission && nd.mission.emphasis) || null, null).filter(function(c) { return asg.names.indexOf(c.key) < 0; })
      .slice(0, CAST_SEATS.length - asg.names.length).map(function(c) { return { name: c.key, type: c.type }; });
  }

  // ── 은닉 좌석 관찰(VillainTracker.observe 통과 탭) ─────
  var OBS_VPIP = { call: 1, raise: 1, '3bet': 1, bet: 1, allin: 1 };
  var OBS_PFR = { raise: 1, '3bet': 1, bet: 1, allin: 1 };
  var HIDDEN_SET = {};
  HIDDEN_NAMES.concat([HIDDEN_ONE]).forEach(function(n) { HIDDEN_SET[n] = 1; });
  function _ensureTap() {
    var VT = (typeof VillainTracker !== 'undefined' && VillainTracker) ? VillainTracker : null;
    if (!VT || typeof VT.observe !== 'function' || VT.observe.__journeyTap) return false;
    var orig = VT.observe;
    var tap = function(sid, state, acts) {
      var r = orig.apply(this, arguments);
      try { observeVillains(state, acts); maskPhrases(acts); } catch (e) { _warn(e); }
      return r;
    };
    tap.__journeyTap = true; tap.__orig = orig;
    VT.observe = tap;
    return true;
  }
  // 좌석 말풍선(Table.updateVillainActions) 통과 탭: 연습 재생(🔁, 실수 다시 풀기)은 VillainTracker.observe를 거치지 않아
  // 은닉 좌석 대사가 그대로 그려진다. 말풍선을 그리기 직전에 같은 가림을 한 번 더 건다(은닉 테이블 핸드에서만)
  function _ensureTableTap() {
    var T = (typeof Table !== 'undefined' && Table) ? Table : null;
    if (!T || typeof T.updateVillainActions !== 'function' || T.updateVillainActions.__journeyTap) return false;
    var orig = T.updateVillainActions;
    var tap = function(acts) {
      try { maskPhrases(acts); } catch (e) { _warn(e); }
      return orig.apply(this, arguments);
    };
    tap.__journeyTap = true; tap.__orig = orig;
    T.updateVillainActions = tap;
    return true;
  }
  // 진행 중 은닉 핸드의 빌런 액션 묶음(app.js가 VillainTracker.observe에 넘기는 그대로). 같은 핸드(seed)만 센다.
  // 은닉 좌석과 함께 앉은 캐스트 좌석(c.others, s6-02 비교용)을 센다
  function observeVillains(state, acts) {
    var c = _hand && _hand.cast;
    if (!c || !state || !Array.isArray(acts) || !acts.length) return;
    if (c.seed != null && state.seed != null && state.seed !== c.seed) return;
    var pre = state.street === 'preflop';
    var others = Array.isArray(c.others) ? c.others : [];
    acts.forEach(function(va) {
      if (!va || (c.names.indexOf(va.name) < 0 && others.indexOf(va.name) < 0)) return;
      var o = c.obs[va.name] || (c.obs[va.name] = { acted: false, vpip: false, pfr: false, tb: false, aggr: 0, calls: 0, folds: 0, facing: 0 });
      var a = va.action;
      if (pre) {
        o.acted = true;
        if (OBS_VPIP[a]) o.vpip = true;
        if (OBS_PFR[a]) o.pfr = true;
        if (a === '3bet' || va.label === '3벳') o.tb = true;
      } else {
        if (a === 'bet' || a === 'raise' || a === 'allin') o.aggr++;
        else if (a === 'call') o.calls++;
        else if (a === 'fold') o.folds++;
        if (a === 'fold' || a === 'call' || a === 'raise') o.facing++;
      }
    });
  }
  // 은닉 좌석의 대사(Villain.getAction이 프로필 phrases에서 고른 말, 예 '이번엔 패스!'는 Fish만 쓴다)는 유형을 알려 준다.
  // app.js는 같은 villainActions 배열을 VillainTracker.observe 다음에 Table.updateVillainActions로 그리므로 두 탭에서 은닉 좌석 대사만 지운다
  // (좌석 말풍선에는 액션과 금액만 남는다. 캐스트 좌석은 이름으로 유형을 아는 사람들이라 그대로).
  // 은닉 테이블 핸드(연습 포함, _hand.mode)에서 은닉 이름(손님, 손님A~E)만 본다. → 지운 수
  function maskPhrases(acts) {
    if (!_hand || _hand.mode !== 'sixmax-cast-hidden' || !Array.isArray(acts)) return 0;
    var k = 0;
    acts.forEach(function(va) { if (va && HIDDEN_SET[va.name] && va.phrase != null) { va.phrase = null; k++; } });
    return k;
  }
  function _recordCast(c, now) {
    if (typeof JStats === 'undefined' || !_fn(JStats, 'record')) return;
    var seen = 0;
    c.names.forEach(function(nm) {
      var o = c.obs[nm];
      if (!o || !o.acted) return;                                       // 프리플랍 액션을 못 본 좌석(워크, 히어로 폴드로 끝난 핸드)은 세지 않음
      seen++;
      JStats.record('cast', { name: nm, key: c.key, hand: { vpip: o.vpip, pfr: o.pfr, tb: o.tb },
        post: { aggr: o.aggr, calls: o.calls, folds: o.folds, facing: o.facing } }, now);
    });
    // 함께 앉은 캐스트(s6-02 비교용): 배정 key 없이 이름별로 계속 쌓는다(캐스트 성향은 고정이라 다시 섞어도 이어진다)
    (Array.isArray(c.others) ? c.others : []).forEach(function(nm) {
      var o = c.obs[nm];
      if (!o || !o.acted) return;
      JStats.record('cast', { name: nm, hand: { vpip: o.vpip, pfr: o.pfr, tb: o.tb },
        post: { aggr: o.aggr, calls: o.calls, folds: o.folds, facing: o.facing } }, now);
    });
    var st = _st(), map = _hiddenMap(st), asg = map[c.node];
    if (_isObj(asg) && asg.key === c.key) { asg.hands = Math.max(0, _num(asg.hands, 0)) + 1; save(); }
    return seen;
  }

  // ── 결정 기록 필드(M5-BOSS, 계약 F2) ─────────────────
  // pre = 히어로 결정 직전 상태(app.js afterDecision의 state). → { mw, oop, pt }, 알 수 없는 값은 null(필터 판정에서 빠진다)
  //   mw  = 결정 시점에 폴드하지 않은 상대가 2명 이상(올인한 상대 포함, 프리플랍은 아직 말하지 않은 상대도 포함)
  //   oop = 포스트플랍에서 남은 상대(폴드, 올인 제외) 중 한 명이라도 히어로 뒤에 말한다(마지막에 말해야 IP). 프리플랍은 null
  //   pt  = 프리플랍 레이즈 수로 정한 팟 종류 0 'limp', 1 'srp', 2 '3bet', 3 이상 '4bet'. 프리플랍 결정은 그때까지의 레이즈 수,
  //         포스트플랍 결정은 이 핸드 히어로의 마지막 프리플랍 결정 뒤 레이즈 수(_hand.pf), 그 기록이 없으면 프리플랍 레이저가
  //         없을 때만 'limp'이고 아니면 null
  var POST_ORDER = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
  var PT_NAMES = ['limp', 'srp', '3bet', '4bet'];
  function _ptOf(n) { return PT_NAMES[Math.min(3, Math.max(0, Math.floor(_num(n, 0))))]; }
  function decisionFields(pre, ctx) {
    ctx = ctx || {};
    var out = { mw: null, oop: null, pt: null };
    if (!_isObj(pre)) return out;
    var names = Array.isArray(pre.names) ? pre.names : (_isObj(pre.players) ? Object.keys(pre.players) : []);
    var folded = _isObj(pre.folded) ? pre.folded : {};
    var opp = names.filter(function(n) { return n !== 'Hero' && !folded[n]; });
    if (names.length) out.mw = opp.length >= 2;
    var street = pre.street || null;
    if (street === 'preflop') {
      var sbc = Math.max(0, Math.floor(_num(pre.streetBetCount, 0)));
      out.pt = _ptOf(sbc);
      var act = ctx.executed || ctx.action;
      var raised = (act === 'raise' || act === 'allin' || act === 'bet') && _num(ctx.amount, 0) > _num(pre.currentBet, 0) + 1e-9;
      if (!_hand) _hand = {};
      _hand.pf = { seed: pre.seed, n: sbc + (raised ? 1 : 0) };
    } else if (street === 'flop' || street === 'turn' || street === 'river') {
      var pf = _hand && _hand.pf;
      if (pf && pf.seed === pre.seed) out.pt = _ptOf(pf.n);
      else if (pre.pfAggressor === null) out.pt = 'limp';                               // advanceStreet가 프리플랍 레이저 없음을 null로 남긴다
      var players = _isObj(pre.players) ? pre.players : {};
      var heroPos = (players.Hero && players.Hero.pos) || ctx.heroPos || null;
      var hi = POST_ORDER.indexOf(heroPos);
      if (hi >= 0) {
        var stacks = _isObj(pre.stacks) ? pre.stacks : {};
        out.oop = opp.some(function(n) {
          var p = players[n];
          if (!p || (stacks[n] != null && !(_num(stacks[n], 0) > 0))) return false;      // 올인한 상대는 더 말하지 않는다
          return POST_ORDER.indexOf(p.pos) > hi;
        });
      }
    }
    return out;
  }

  // ── app.js 훅(9절 M1-P2 페이로드) ───────────────────
  function _excluded(ctx) { return !!(ctx.practice || (ctx.gtoMode && ctx.gtoRound === 2) || ctx.hu); }

  function onNewHand(ctx) {
    try {
      ctx = ctx || {};
      _st();                                                            // 첫 핸드에서 로드와 마이그레이션(게임 기록 소급)을 먼저 끝낸다
      // 세션은 시작 뒤 처음 만난 게임(sessionId)에 묶는다. 분량을 채운 세션이 끝나지 않은 채 다른 게임(메뉴의 자유 게임 등)이
      // 시작되면 그 세션은 끝난 것으로 보고 비운다(남겨 두면 새 게임이 매 핸드 세션 요약으로 끊기고 핸드가 엉뚱한 노드에 붙는다).
      if (_session && !ctx.practice && ctx.sessionId != null) {
        if (_session.sid == null) _session.sid = ctx.sessionId;
        else if (_session.sid !== ctx.sessionId) { var gone = _session; _session = null; _sessionEnded(gone, 'other'); }
      }
      var names = (ctx.state && ctx.state.names) || [];
      var hu = (ctx.hu != null) ? !!ctx.hu : names.length === 2;
      _hand = { hu: hu, practice: !!ctx.practice, excluded: _excluded({ practice: ctx.practice, gtoMode: ctx.gtoMode, gtoRound: ctx.gtoRound, hu: hu }),
        mode: ctx.mode || null, heroPos: ctx.heroPos || null, handNum: ctx.handNum || null };
      // 은닉 테이블(M6-BOSS): 이 핸드의 은닉 좌석 관찰을 연다(연습, GTO 2회차, HU는 관찰하지 않음)
      if (ctx.mode === 'sixmax-cast-hidden') _ensureTableTap();            // 연습 재생에서도 은닉 좌석 대사를 가린다
      if (ctx.mode === 'sixmax-cast-hidden' && !_hand.excluded) {
        var asg = _hiddenFor(_session && _session.node, !_session);
        if (asg) {
          var ckeys = {};
          _castList().forEach(function(c) { ckeys[c.key] = 1; });
          var others = names.filter(function(n) { return n !== 'Hero' && asg.names.indexOf(n) < 0 && ckeys[n]; });
          _hand.cast = { key: asg.key, node: asg.node, seed: (ctx.state && ctx.state.seed != null) ? ctx.state.seed : null, names: asg.names.slice(),
            others: others, obs: {} };
          var bst = _st();
          if (bst.boss && bst.boss.hiddenLast !== asg.node) { bst.boss.hiddenLast = asg.node; save(); }
          _ensureTap();
        }
      }
      if (typeof Boss !== 'undefined' && _fn(Boss, 'onNewHand')) Boss.onNewHand(ctx);
    } catch (e) { _warn(e); }
  }

  function afterDecision(ctx) {
    try {
      ctx = ctx || {};
      if (_excluded(ctx)) return;                                       // 연습, GTO 2회차, HU는 집계/XP 없음
      var now = Date.now();
      var V0 = ctx.verdict || null, g = ctx.grade || null, pre = ctx.state || {};
      var node = _session ? _session.node : null;
      var payload = null;
      var df = decisionFields(pre, ctx);                                // 판정이 없어도 프리플랍 레이즈 수는 따라간다(pt)
      if (V0 && g && g.light) {
        payload = { street: pre.street || null, source: V0.source || null, concept: V0.concept || null, light: g.light,
          marginal: !!V0.marginal, pattern: g.pattern || null, pos: ctx.heroPos || null, hu: !!ctx.hu, mode: ctx.mode || null,
          node: node, hint: !!ctx.hint, evLoss: Math.max(0, -_num(g.delta, 0)), estimated: !!g.estimated,
          mw: df.mw, oop: df.oop, pt: df.pt };
        if (typeof JStats !== 'undefined' && _fn(JStats, 'record')) JStats.record('dec', payload, now);
      }
      if (typeof HeroStats !== 'undefined' && _fn(HeroStats, 'observe') && ctx.state) {
        var delta = HeroStats.observe(ctx.state, ctx.executed || ctx.action, ctx.amount, ctx.heroPos);
        if (_isObj(delta) && Object.keys(delta).length && typeof JStats !== 'undefined' && _fn(JStats, 'record')) JStats.record('hero', delta, now);
      }
      if (payload) {
        var table = _xpc('decision') || {};
        var base = _num(table[g.light], 0);
        if (ctx.hint) base = Math.floor(base * _num(_xpc('hintFactor'), 0.5));
        if (base > 0) addXp('decision', base, now);
        if (g.light === 'red' && typeof ReviewQueue !== 'undefined' && _fn(ReviewQueue, 'add')) {
          ReviewQueue.add(ctx.mode || null, ctx.heroPos || null, pre.seed, pre.street || null,
            { light: g.light, pattern: g.pattern || null, concept: V0.concept || null, evLoss: payload.evLoss, estimated: !!g.estimated });
        }
      }
      if (typeof Boss !== 'undefined' && _fn(Boss, 'afterDecision')) Boss.afterDecision(ctx, payload);
    } catch (e) { _warn(e); }
  }

  function onHandEnd(ctx) {
    try {
      ctx = ctx || {};
      var now = Date.now();
      var names = (ctx.state && ctx.state.names) || [];
      var hu = (ctx.hu != null) ? !!ctx.hu : ((_hand && _hand.hu != null) ? _hand.hu : names.length === 2);
      var excluded = _excluded({ practice: ctx.practice, gtoMode: ctx.gtoMode, gtoRound: ctx.gtoRound, hu: hu });
      if (_session && !ctx.practice) _session.hands += 1;                // 세션 카운터는 GTO 2회차와 HU도 센다(연습 핸드는 제외)
      if (!excluded) {
        if (typeof HeroStats !== 'undefined' && _fn(HeroStats, 'onHandEnd') && ctx.state) {
          var he = HeroStats.onHandEnd(ctx.state, ctx.result, !!ctx.heroFolded);
          if (typeof JStats !== 'undefined' && _fn(JStats, 'record')) JStats.record('handEnd', _isObj(he) ? he : null, now);
        } else if (typeof JStats !== 'undefined' && _fn(JStats, 'record')) JStats.record('handEnd', null, now);
        // 미션 롤링 집계: 가용 학습 노드 중 미션이 있는 노드 전부에 핸드 1개(2.2절, 노드가 열린 뒤의 모든 6인 플레이)
        // 목록을 먼저 고정한다(이 핸드로 통과해 새로 열린 노드에는 이 핸드를 세지 않음). 보스의 실전 핸드는 Boss.onHandEnd가 센다.
        // 은닉 좌석 관찰(M6-BOSS)은 롤링 집계보다 먼저 남긴다(이 핸드로 s6-02 관찰 핸드가 기준에 닿으면 판정에 바로 반영)
        if (_hand && _hand.cast) { try { _recordCast(_hand.cast, now); } catch (e3) { _warn(e3); } }
        var st = _st();
        _ordered().filter(function(nd) { return nd && nd.mission && nd.kind !== 'boss' && _availableRec(st, nd); })
          .forEach(function(nd) { recordMissionHand(nd.id, now); });
        noteActivity(now, 1);                                // M7 FLOW-07: 연습, GTO 2회차, 헤즈업을 뺀 실전 1핸드(1분)도 활동일
      }
      if (typeof Boss !== 'undefined' && _fn(Boss, 'onHandEnd')) Boss.onHandEnd(ctx, { excluded: excluded });
      // 실수 SRS(계약 F4): 연습 핸드는 집계하지 않지만 다시 풀기 판정으로 ReviewQueue에 넘긴다
      if (ctx.practice && typeof ReviewQueue !== 'undefined' && _fn(ReviewQueue, 'onPracticeHandEnd')) {
        try { ReviewQueue.onPracticeHandEnd(ctx); } catch (e2) { _warn(e2); }
      }
      _hand = null;
    } catch (e) { _warn(e); }
  }

  // ── 오늘의 5분 입력(Today.build ctx) ─────────────────
  function _dueItems(now) {
    if (typeof Drills === 'undefined' || !Drills) return [];
    try {
      if (_fn(Drills, 'dueAll')) return Drills.dueAll(now) || [];
      if (!_fn(Drills, 'due')) return [];
      var types = _fn(Drills, 'types') ? Drills.types() : ['preflop', 'potodds'];
      var out = [];
      types.forEach(function(t) {
        (Drills.due(t, now) || []).forEach(function(k) {
          var it = _fn(Drills, 'item') ? Drills.item(t, k) : null;
          out.push({ type: t, key: k, box: it ? it.box : 0, due: it ? it.due : now });
        });
      });
      return out;
    } catch (e) { _warn(e); return []; }
  }
  function _weak(now) {
    var list = [];
    if (typeof JStats !== 'undefined' && _fn(JStats, 'accuracy')) {
      try {
        COACH_CONCEPTS.forEach(function(c) {
          var a = JStats.accuracy(c, 7, now);
          if (a && a.pct != null && _num(a.n, 0) >= 3) list.push({ k: c, v: _num(a.pct, 0) });
        });
      } catch (e) { list = []; }
      list.sort(function(a, b) { return (a.v - b.v) || (a.k < b.k ? -1 : 1); });
    }
    if (!list.length) {
      var prog = _readJSON('poker_progress');
      var ws = (prog && _isObj(prog.weakSpots)) ? prog.weakSpots : {};
      Object.keys(ws).forEach(function(k) { if (_num(ws[k], 0) > 0) list.push({ k: k, v: -_num(ws[k], 0) }); });
      list.sort(function(a, b) { return (a.v - b.v) || (a.k < b.k ? -1 : 1); });
    }
    return list.slice(0, 2).map(function(x) { return x.k; });
  }
  function _avail(st) {
    var puzzles = typeof Puzzles !== 'undefined' && _fn(Puzzles, 'next');
    var lessons = typeof LessonPlayer !== 'undefined' && _fn(LessonPlayer, 'start') && typeof LESSONS !== 'undefined' && Array.isArray(LESSONS) && LESSONS.length > 0;
    var theater = typeof Theater !== 'undefined' && _fn(Theater, 'newEpisode') && typeof TheaterUI !== 'undefined' && _fn(TheaterUI, 'start');
    var daily5 = puzzles && _fn(Puzzles, 'daily5') && typeof PuzzleModes !== 'undefined' && _fn(PuzzleModes, 'daily5');
    var rush = typeof PuzzleModes !== 'undefined' && _fn(PuzzleModes, 'rush');
    // 오늘의 명장면은 도감에 쌓인 카드를 다시 보여 주는 블록이라 Highlight.pick이 아니라 카드와 TheaterUI.showCard가 있어야 한다(M4-P8)
    var highlights = _cards(st).length > 0 && typeof TheaterUI !== 'undefined' && _fn(TheaterUI, 'showCard');
    var weekly = typeof Seasons !== 'undefined' && _fn(Seasons, 'weekly');
    return { puzzles: !!puzzles, lessons: !!lessons, theater: !!theater, daily5: !!daily5, highlights: !!highlights, rush: !!rush, weekly: !!weekly };
  }
  // CURRICULUM_MAP 역매핑: 노드를 흡수한 첫 세션 번호
  function sessionFor(nodeId) {
    var map = _mapData(), best = null;
    Object.keys(map).forEach(function(k) {
      var n = Number(k);
      if (isFinite(n) && Array.isArray(map[k]) && map[k].indexOf(nodeId) >= 0 && (best === null || n < best)) best = n;
    });
    return best;
  }
  // 실수 핸드 복습 기한(계약 F4, ReviewQueue.due(now, 3)). ReviewQueue가 없거나(머지 전 스텁) 실패하면 빈 배열
  function _mistakes(now) {
    if (typeof ReviewQueue === 'undefined' || !_fn(ReviewQueue, 'due')) return [];
    try { var r = ReviewQueue.due(now, 3); return Array.isArray(r) ? r : []; } catch (e) { _warn(e); return []; }
  }
  function todayCtx(now) {
    now = _now(now);
    var st = _st();
    var d = st.daily[dayKey(now)];
    var nn = nextNode(), next = null;
    if (nn) {
      var nd = _node(nn.id), r = st.nodes[nn.id];
      next = { id: nn.id, step: nn.step, est: (nd && nd.est) || null, lesson: (nd && nd.lesson) || null, scene: r ? r.lesson.scene : 0 };
    }
    return {
      now: now, weekday: new Date(now).getDay(), goalMinutes: _num(st.goal && st.goal.minutes, 5), stage: st.stage,
      nextNode: next, due: _dueItems(now), mistakes: _mistakes(now), weak: _weak(now), avail: _avail(st),
      daily5Done: !!(_isObj(d) && d.daily5), theaterEpisode: (st.theater && st.theater.mini) || null,
      placementDone: !!(st.placement && st.placement.done), nodesPassed: _countPassed(st), lessonsDone: _countLessonsDone(st),
      // M7 FLOW-05: 모든 노드를 통과해 다음 노드가 없음(엔드게임). 데이터가 없어 nextNode가 없는 경우와 구분한다
      endgame: !nn && _nodesData().length > 0 && _countPassed(st) >= _nodesData().length,
      prevPlan: (_isObj(d) && d.plan) || null, curriculumSession: nn ? sessionFor(nn.id) : null,
      rating: st.rating ? { r: st.rating.r, rd: st.rating.rd } : null,
      // M7 TIME-08: 이번 주 챌린지 소개를 아직 안 봤나(월요일만이 아니라 그 주 첫 방문). Seasons가 없으면 null(Today는 월요일로 판단)
      weeklyUnseen: (typeof Seasons !== 'undefined' && _fn(Seasons, 'seenWeek')) ? !Seasons.seenWeek(st, now) : null
    };
  }

  // ── 커리큘럼 실습 라우팅(5.8절 4번) ──────────────────
  function routePractice(sessionN) {
    var ids = _mapData()[sessionN] || _mapData()[String(sessionN)] || [];
    var st = _st(), pick = null;
    ids.forEach(function(id) { var nd = _node(id); if (!pick && nd && nd.kind !== 'boss' && _availableRec(st, nd)) pick = id; });
    if (!pick) ids.forEach(function(id) { if (!pick && _node(id)) pick = id; });
    if (!pick) return { config: 'gto-mirror', node: null, drill: null };
    var nd = _node(pick);
    var config = nd.mission ? 'sixmax-cast' : 'gto-mirror';
    var drill = (nd.drill && nd.drill.type && nd.drill.type !== 'mixed') ? { type: nd.drill.type, spots: nd.drill.spots || null } : null;
    return { config: config, node: pick, drill: drill };
  }

  // ── 홈 지도 모델(순수, 5.2절) ────────────────────────
  function _hint(st, nd, r, avail) {
    if (r.status === 'passed') return r.skipped ? '건너뜀' : '통과';
    var act = (nd.kind === 'boss' && st.boss && _isObj(st.boss.active) && st.boss.active.node === nd.id) ? st.boss.active : null;
    if (act) {
      var bb = _bossEval(nd, st), bm = (bb && !bb.pass) ? _num(bb.more, 0) : 0;
      var items = (bb && Array.isArray(bb.items)) ? bb.items : [];
      // 실전 핸드 칸: Boss의 보스 카운터 항목(은닉 보스는 배정 뒤 누적 핸드, 맞히기 통과면 채움)
      var hi = items.filter(function(x) { return x && x.kind === 'hands' && x.boss; })[0];
      var left = hi ? ((hi.ok || hi.waive) ? 0 : Math.max(0, _num(hi.need, 0) - _num(hi.have, 0))) : Math.max(0, _missionMin(nd) - _num(act.hands, 0));
      // 드릴을 아직 못 끝낸 시도(M5-BOSS: 세트 나눔 드릴은 다음 세트 번호)
      var di = items.filter(function(x) { return x && x.drill; })[0];
      if (di && !di.ok) return '시험 중, 드릴' + (di.part ? ' 세트 ' + di.part + '/' + di.parts : '') + '부터';
      if (items.some(function(x) { return x && x.submit && !x.ok; })) return '시험 중, 유형 맞히기 제출';
      if (bm > left) return '시험 중, 핸드 ' + (bb.est ? '약 ' : '') + bm + '개 더';
      return '시험 중' + (left > 0 ? ', 핸드 ' + left + '개 더' : '');
    }
    if (!avail) return r.status === 'done' ? '레슨 완료' : '';
    if (nd.kind === 'boss') return '승급 시험';
    if (nd.lesson && !r.lesson.done) return r.lesson.scene > 0 ? '레슨 이어 보기' : '레슨';
    if (nd.drill && !_drillMet(nd, r)) { var c = _drillCount(nd.drill); return '드릴 ' + c + '문항 중 ' + _num(nd.drill.pass, c) + '개 이상'; }
    if (nd.mission) {
      var short = Math.max(0, _missionMin(nd) - r.mission.hands);
      var br = _bossEval(nd, st);
      var more = (br && !br.pass) ? _num(br.more, 0) : 0;
      if (more > short) return '핸드 ' + (br.est ? '약 ' : '') + more + '개 더';      // 기회(minOpp) 미달이나 창에서 빠질 기록
      if (short > 0) return '핸드 ' + short + '개 더';
      if (br && !br.pass && Array.isArray(br.items) && br.items.some(function(x) { return x && x.submit && !x.ok; })) return '유형 맞히기 제출';
      if (br && !br.pass && br.later) return '다음 주에 이어서';
      if (br && !br.pass) return br.pending ? '다음 업데이트에서 판정' : '실전 조건 확인';
    }
    return '통과 가능';
  }
  // [ { stage, title, name, pct, open(단계 열림 = 현재 단계 이하), current, boss, nodes: [ { id, title, status, kind, hint, available, skipped } ] } ]
  function mapModel() {
    var st = _st();
    var stages = _stagesData().slice().sort(function(a, b) { return a.n - b.n; });
    var all = _ordered();
    return stages.map(function(s) {
      var list = all.filter(function(nd) { return nd && nd.stage === s.n; });
      var passed = 0;
      var nodes = list.map(function(nd) {
        var r = st.nodes[nd.id] || _newRec('locked');
        var av = _availableRec(st, nd);
        if (r.status === 'passed') passed++;
        return { id: nd.id, title: nd.title || nd.id, status: r.status, kind: nd.kind || 'learn', hint: _hint(st, nd, r, av), available: av, skipped: !!r.skipped };
      });
      return { stage: s.n, title: s.title, name: s.name, pct: list.length ? Math.round(passed / list.length * 100) : 0,
        open: s.n <= st.stage, current: s.n === st.stage, boss: s.boss || null, nodes: nodes };
    });
  }
  function summary(now) {
    now = _now(now);
    var st = _st();
    var s = _stageInfo(st.stage);
    var nn = nextNode();
    return { stage: st.stage, title: s ? s.title : '', xp: st.xp, level: levelFor(st.xp), streak: _liveStreak(st, now),
      nodesPassed: _countPassed(st), nextNode: nn,
      bestStreak: st.streak.best, freezes: st.streak.freezes, xpToNext: xpToNext(st.xp), goalMinutes: _num(st.goal && st.goal.minutes, 5) };
  }
  // 홈 첫 카드(실력 확인 3분 / 보스로 건너뛰기 / 그냥 시작) 조건: 배치 고사 미완 && 통과 노드 0
  function showFirstCard() {
    var st = _st();
    return !(st.placement && st.placement.done) && _countPassed(st) === 0;
  }
  function lastPass() { return _lastPass; }
  function lastTouch() { return _lastTouch; }

  // ── 테스트 주입 ────────────────────────────────────
  // d = { nodes, stages, map, xp, unlocks } 일부만 줘도 된다. null이면 전역 데이터로 복귀. 캐시는 비운다.
  function _setData(d) { _dataOver = _isObj(d) ? d : null; _idxSrc = null; _dropCache(); _session = null; _todayRunning = false; }
  // s = 저장소 객체(getItem/setItem/removeItem) | false(저장소 없음) | null(실제 localStorage). 캐시(와 대기 중인 쓰기)는 비운다.
  function _setStore(s) { _storeOver = (s === false) ? false : (s || null); _dropCache(); }
  // 지연 ms 주입(테스트): 숫자(0 = 즉시), null = 환경 자동 판정. 대기 중인 쓰기는 먼저 끝낸다
  function _setDefer(ms) { flush(); _deferOver = (typeof ms === 'number' && isFinite(ms)) ? ms : null; }
  function _writeCount() { return _writes; }
  function _pendingWrite() { return _dirty; }

  // M7 DATA-01: 같은 출처의 창(탭)은 localStorage를 공유한다. 다른 창이 저장한 뒤 이 창이 오래된 메모리 캐시를 그대로 저장하면
  // 다른 창에서 쌓은 여정 전체를 덮어쓴다. 캐시를 비우면 다음 load()가 저장소를 다시 읽는다. 진행 중 세션(_session, _hand)은 메모리 그대로 둔다.
  // Storage.importAll, restorePrev처럼 이 창이 저장소를 직접 바꾼 곳(BackupUI)은 바꾼 직후 이 함수를 불러야 한다(같은 창에는 storage 이벤트가
  // 안 온다). 대기 중이거나 실패했던 쓰기도 함께 버린다(저장소가 이제 최신본이라, 새로고침 전 beforeunload의 flush가 옛 캐시로 덮지 않게).
  function _invalidate() { _dropCache(); _unsaved = false; }
  // 바깥 이벤트(다른 창 저장, 화면 복귀)로 비울 때: 이 창의 마지막 저장이 실패했으면(저장소 없음, 용량 초과) 메모리 캐시가 유일한 최신본이라
  // 비우지 않는다. 비우면 다음 load()가 예전 값(또는 기본값)을 읽어 앱을 오갈 때마다 진행이 되돌아간다.
  // 대기 중인 쓰기(최대 300ms)는 버린다: 다른 창이 방금 저장했으므로 옛 캐시로 덮어쓰면 그 창의 기록이 사라진다.
  function _invalidateExternal() { if (!_unsaved) _dropCache(); }
  // 화면 복귀(visible, bfcache 복귀): 숨길 때 flush가 안 됐으면 이 창의 미기록 변경을 먼저 쓴 뒤 캐시를 비운다(다른 창이 그동안 저장했으면
  // storage 이벤트가 이미 대기 변경을 버렸다)
  function _onReturn() { flush(); _invalidateExternal(); }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', function(e) { if (!e || e.key === null || e.key === undefined || e.key === KEY) _invalidateExternal(); });
    window.addEventListener('pageshow', function(e) { if (e && e.persisted) _onReturn(); });   // 뒤로가기 캐시(bfcache)에서 되살아남
    window.addEventListener('pagehide', function() { flush(); });                              // 떠나기(bfcache 진입 포함): 대기 쓰기 즉시
    window.addEventListener('beforeunload', function() { flush(); });
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') flush();                                      // 앱 전환, 화면 끔: 대기 쓰기 즉시
      else if (document.visibilityState === 'visible') _onReturn();
    });
  }

  var api = {
    KEY: KEY, V: V,
    load: load, save: save, flush: flush, reset: reset, defaults: defaults, migrate: migrate,
    nodeStatus: nodeStatus, openNodes: openNodes, nextNode: nextNode,
    completeLesson: completeLesson, recordDrillSet: recordDrillSet, recordMissionHand: recordMissionHand,
    evaluateNode: evaluateNode, passNode: passNode, promote: promote,
    addXp: addXp, levelFor: levelFor, xpToNext: xpToNext,
    touchDay: touchDay, noteActivity: noteActivity, markBlock: markBlock, dayKey: dayKey, dayRecord: dayRecord, setPlan: setPlan, endToday: endToday,
    recordTheater: recordTheater, highlightOfDay: highlightOfDay,
    todayCtx: todayCtx, active: active, shouldEndSession: shouldEndSession,
    startSession: startSession, session: session, endSession: endSession,
    playersSpec: playersSpec, onNewHand: onNewHand, afterDecision: afterDecision, onHandEnd: onHandEnd, decisionFields: decisionFields,
    hiddenSeats: hiddenSeats, reshuffleHidden: reshuffleHidden, observeVillains: observeVillains, checkNode: checkNode,
    hiddenCast: hiddenCast, maskPhrases: maskPhrases,
    HIDDEN_NAMES: HIDDEN_NAMES.slice(), HIDDEN_ONE: HIDDEN_ONE, HIDDEN_TYPES: HIDDEN_TYPES.slice(),
    routePractice: routePractice, sessionFor: sessionFor, mapModel: mapModel, summary: summary, showFirstCard: showFirstCard,
    lastPass: lastPass, lastTouch: lastTouch, castList: _castList, node: _node,
    _setData: _setData, _setStore: _setStore, _invalidate: _invalidate,
    _setDefer: _setDefer, _writeCount: _writeCount, _pendingWrite: _pendingWrite
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
