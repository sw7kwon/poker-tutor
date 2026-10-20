// journey/journey-core.js (채우는 패키지: M1-P1b)
// 여정 상태 poker_journey(설계서 6.1절) 로드/저장/마이그레이션(6.4절), 노드 상태 전이, XP와 레벨, 스트릭(36시간 규칙),
// 블록 기록, 미션/자유/보스 세션 컨텍스트, app.js 훅 수신과 전달(JStats, HeroStats, Boss, ReviewQueue는 전부 typeof 가드),
// playersSpec, routePractice, mapModel(홈 지도 순수 모델). 설계서 9절 M1-P1b.
// M3-P4a: 학습 노드 미션은 핸드 수 AND Boss.evaluate 조건(롤링, minOpp 미달은 판정 보류)으로 통과한다. 보스 노드의 실전 핸드는
//   롤링 집계가 아니라 Boss가 세는 보스 카운터(이 시험의 실전 핸드)다. 세션 시작/끝/교체는 Boss.onSessionStart/onSessionEnd로
//   알린다(코칭 고정과 보스 판정). 지도 힌트의 "핸드 n개 더"는 기회 미달 조건의 어림도 반영한다.
// 로드 시 document, window, localStorage, setTimeout에 접근하지 않는다(전부 함수 안에서 typeof 가드).
//
// 노드 상태: locked(선행 미통과) / open(열림) / done(레슨 완료, 아직 통과 아님) / passed(통과, skipped면 건너뜀 통과).
// "가용(available)" = 선행이 모두 통과이고 상태가 open 또는 done(마이그레이션으로 잠긴 채 done이 된 노드는 선행 통과 뒤 가용).
// XP는 addXp 한 곳으로만 쌓인다. 이 모듈이 직접 주는 XP: 레슨 첫 완료(lesson), 미션 노드 통과(mission), 보스 통과(boss),
// 게임 결정(decision, 힌트 사용 시 절반 내림), 오늘의 5분 완주(markBlock('wrap') 하루 1회, todayDone).
// 퍼즐, 복습 드릴, 데일리 5, 극장 등 바깥 출처는 호출하는 쪽이 addXp(src, amount)를 부른다.
var Journey = (function() {
  var KEY = 'poker_journey';
  var SETTINGS_KEY = 'poker_journey_settings';
  var V = 1;
  var H = 3600 * 1000, DAY = 24 * H, STREAK_GAP = 36 * H;
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var CAST_SEATS = [0, 1, 2, 4, 5];                       // app.js sixmax와 같은 좌석 배치(히어로는 3번 좌석 고정)
  var HIDDEN_NAMES = ['손님A', '손님B', '손님C', '손님D', '손님E'];
  var HIDDEN_TYPES = ['TAG', 'LAG', 'Fish', 'Nit', 'Station'];
  var BASE_TYPES = { TAG: 1, LAG: 1, Fish: 1, Nit: 1, Mixed: 1 };
  var TYPE_FALLBACK = { Station: 'Fish' };                // Station 프로필(M4-P2) 전에는 Fish로 플레이
  var CHUNK = { mission: 5, free: 3, boss: 5 };
  var REPEAT_SRC = { review: 1, reviewRepeat: 1, decision: 1 };
  var COACH_CONCEPTS = ['rfi', 'vs_rfi', 'blind_defense', 'vs_3bet', 'pot_odds', 'draws', 'cbet', 'value_bluff', 'board_texture', 'turn_river', 'actions'];
  var STATUS_RANK = { locked: 0, open: 1, done: 2, passed: 3 };

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
  var _session = null;        // 세션 컨텍스트(메모리 전용, 새로고침하면 사라짐)
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
  function _readJSON(key) {
    var s = _store(); if (!s) return null;
    try { var raw = s.getItem(key); return raw == null ? null : JSON.parse(raw); } catch (e) { return null; }
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
    var raw = _readJSON(KEY);
    if (_isObj(raw) && _isObj(raw.nodes)) {
      _cache = _normalize(_upgrade(raw), now);
    } else {
      _cache = defaults(now);
      _migrateInto(_cache, now);
    }
    save();
    return _cache;
  }
  function _st() { return _cache || load(); }
  function save(state) {
    if (_isObj(state)) _cache = state;
    if (!_cache) return;
    _writeJSON(KEY, _cache);
  }
  function reset() {
    _cache = null; _session = null; _todayRunning = false; _hand = null; _lastPass = null; _lastTouch = null;
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
        if (br && br.pending) { if (!parked) parked = { id: nd.id, step: step }; continue; }
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
      }
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
  function _day(st, now) {
    var k = dayKey(now);
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

  // gap = now - lastActiveAt. 같은 dayKey면 cur 변화 없음. gap ≤ 36h면 cur+1. gap > 36h면 miss = floor((gap-36h)/24h)+1,
  // freezes ≥ miss면 소모하고 cur+1(frozenDays 기록), 아니면 cur = 1. cur가 7의 배수가 되면 freezes = min(2, freezes+1).
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
      if (gap <= STREAK_GAP) { s.cur += 1; inc = true; }
      else {
        var miss = Math.floor((gap - STREAK_GAP) / DAY) + 1;
        if (s.freezes >= miss) {
          s.freezes -= miss; s.cur += 1; inc = true; res.freezeUsed = miss;
          for (var i = 1; i <= miss; i++) s.frozenDays.push(dayKey(last + i * DAY));
          if (s.frozenDays.length > 60) s.frozenDays = s.frozenDays.slice(-60);
        } else s.cur = 1;
      }
      res.changed = true;
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
    var gap = now - last;
    if (gap <= STREAK_GAP || s.lastDay === dayKey(now)) return s.cur;
    var miss = Math.floor((gap - STREAK_GAP) / DAY) + 1;
    return s.freezes >= miss ? s.cur : 0;
  }

  // 블록 1개 완료: doneBlocks와 minutes 누적, 스트릭 갱신(touchDay). XP는 지급하지 않고 blockXp[name]에 표시용으로만 남긴다.
  // name === 'wrap'이면 오늘의 5분 완주(하루 1회 todayDone XP)로 보고 진행 중 표시를 끈다.
  function markBlock(name, minutes, xp, now) {
    now = _now(now);
    var st = _st(), d = _day(st, now);
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
  function endSession() { var s = _session; _session = null; _sessionEnded(s, 'end'); return s; }
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
  // 'sixmax-cast-hidden' → 유형 5종(TAG, LAG, Fish, Nit, Station) 시드 셔플, 이름은 중립(손님A~E), 각 spec에 hidden:true
  // opts(선택) = { emphasis, cast:[keys], seed, seatTypes:{name:type} }. 없으면 현재 세션 컨텍스트와 boss.active를 본다.
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
    var seatTypes = opts.seatTypes || (active && active.seatTypes) || null;
    var types;
    if (_isObj(seatTypes) && HIDDEN_NAMES.every(function(n) { return typeof seatTypes[n] === 'string'; })) {
      types = HIDDEN_NAMES.map(function(n) { return seatTypes[n]; });
    } else {
      var seed = (opts.seed != null) ? opts.seed : ((ses && ses.seed != null) ? ses.seed : ((active && active.seed != null) ? active.seed : 1));
      var rnd = _rng(Math.floor(_num(seed, 1)) >>> 0);
      types = HIDDEN_TYPES.slice();
      for (var i = types.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = types[i]; types[i] = types[j]; types[j] = t; }
    }
    return CAST_SEATS.map(function(seat, k) {
      return { type: _playable(types[k]), name: HIDDEN_NAMES[k], pos: posFor(seat), castType: types[k], hidden: true };
    });
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
      if (V0 && g && g.light) {
        payload = { street: pre.street || null, source: V0.source || null, concept: V0.concept || null, light: g.light,
          marginal: !!V0.marginal, pattern: g.pattern || null, pos: ctx.heroPos || null, hu: !!ctx.hu, mode: ctx.mode || null,
          node: node, hint: !!ctx.hint, evLoss: Math.max(0, -_num(g.delta, 0)), estimated: !!g.estimated };
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
            { light: g.light, pattern: g.pattern || null, concept: V0.concept || null, evLoss: payload.evLoss });
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
        var st = _st();
        _ordered().filter(function(nd) { return nd && nd.mission && nd.kind !== 'boss' && _availableRec(st, nd); })
          .forEach(function(nd) { recordMissionHand(nd.id, now); });
      }
      if (typeof Boss !== 'undefined' && _fn(Boss, 'onHandEnd')) Boss.onHandEnd(ctx, { excluded: excluded });
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
    var highlights = typeof Highlight !== 'undefined' && _fn(Highlight, 'pick') && !!(st.theater && st.theater.cards && st.theater.cards.length);
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
      nextNode: next, due: _dueItems(now), weak: _weak(now), avail: _avail(st),
      daily5Done: !!(_isObj(d) && d.daily5), theaterEpisode: (st.theater && st.theater.mini) || null,
      placementDone: !!(st.placement && st.placement.done), nodesPassed: _countPassed(st),
      prevPlan: (_isObj(d) && d.plan) || null, curriculumSession: nn ? sessionFor(nn.id) : null,
      rating: st.rating ? { r: st.rating.r, rd: st.rating.rd } : null
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
      var left = Math.max(0, _missionMin(nd) - _num(act.hands, 0));
      var bb = _bossEval(nd, st), bm = (bb && !bb.pass) ? _num(bb.more, 0) : 0;
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
  function _setData(d) { _dataOver = _isObj(d) ? d : null; _idxSrc = null; _cache = null; _session = null; _todayRunning = false; }
  // s = 저장소 객체(getItem/setItem/removeItem) | false(저장소 없음) | null(실제 localStorage). 캐시는 비운다.
  function _setStore(s) { _storeOver = (s === false) ? false : (s || null); _cache = null; }

  var api = {
    KEY: KEY, V: V,
    load: load, save: save, reset: reset, defaults: defaults, migrate: migrate,
    nodeStatus: nodeStatus, openNodes: openNodes, nextNode: nextNode,
    completeLesson: completeLesson, recordDrillSet: recordDrillSet, recordMissionHand: recordMissionHand,
    evaluateNode: evaluateNode, passNode: passNode, promote: promote,
    addXp: addXp, levelFor: levelFor, xpToNext: xpToNext,
    touchDay: touchDay, markBlock: markBlock, dayKey: dayKey, dayRecord: dayRecord, setPlan: setPlan, endToday: endToday,
    todayCtx: todayCtx, active: active, shouldEndSession: shouldEndSession,
    startSession: startSession, session: session, endSession: endSession,
    playersSpec: playersSpec, onNewHand: onNewHand, afterDecision: afterDecision, onHandEnd: onHandEnd,
    routePractice: routePractice, sessionFor: sessionFor, mapModel: mapModel, summary: summary, showFirstCard: showFirstCard,
    lastPass: lastPass, lastTouch: lastTouch, castList: _castList, node: _node,
    _setData: _setData, _setStore: _setStore
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
