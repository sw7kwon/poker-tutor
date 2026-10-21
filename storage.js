// storage.js
var Storage = (function() {
  var K = { progress:'poker_progress', mistakes:'poker_mistakes', history:'poker_game_history' };
  function _get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; } }
  function _set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} }
  function getProgress() { return _get(K.progress) || { currentSession:1, completedSessions:[], weakSpots:{} }; }
  function saveProgress(p) { _set(K.progress, p); }
  function getMistakes()  { return _get(K.mistakes) || []; }
  function addMistake(m)  {
    var list = getMistakes(); list.push(m);
    if (list.length>200) list=list.slice(-200);
    _set(K.mistakes, list);
  }
  function saveHandHistory(state, result, meta) {
    var h = _get(K.history)||[];
    h.push({ date:new Date().toISOString(),
      sessionId: meta && meta.sessionId, mode: meta && meta.mode, heroPos: meta && meta.heroPos,
      seed: state.seed,
      heroCards:(state.heroCards||[]).map(function(c){return c.rank+c.suit;}),
      board:(state.board||[]).map(function(c){return c.rank+c.suit;}),
      result:(state.folded&&state.folded.Hero)?'fold':(result&&result.heroWon?'win':'loss'),
      pot:(meta&&meta.pot!=null)?meta.pot:state.pot,
      net:(meta&&meta.net!=null)?meta.net:undefined,
      gtoRound:meta&&meta.gtoRound, v:3,
      decisions:state.decisions });
    if (h.length>200) h=h.slice(-200);
    _set(K.history, h);
  }
  function getHandHistory() { return _get(K.history) || []; }
  // groupSessions: 핸드 히스토리 레코드 배열 → 세션별 그룹 배열
  // sessionId 있는 레코드는 세션별로 묶어 내림차순(최신 우선) 정렬
  // sessionId 없는(legacy) 레코드는 하나의 그룹으로 묶어 '이전 기록' 라벨을 붙이고 맨 뒤에 배치
  function groupSessions(records) {
    records = records || [];
    var order = []; // sessionId 등장 순서 보존용
    var map = {}; // sessionId -> hands 배열
    var legacy = [];
    records.forEach(function(rec) {
      var sid = rec.sessionId;
      if (sid === null || sid === undefined) { legacy.push(rec); return; }
      if (!map[sid]) { map[sid] = []; order.push(sid); }
      map[sid].push(rec);
    });
    var groups = order
      .sort(function(a, b) { return b - a; }) // sessionId 내림차순(최신 우선)
      .map(function(sid) {
        var hands = map[sid];
        return { sessionId: sid, mode: hands[0].mode, label: null, date: hands[0].date, hands: hands, count: hands.length };
      });
    if (legacy.length > 0) {
      groups.push({ sessionId: null, mode: legacy[0].mode, label: '이전 기록', date: legacy[0].date, hands: legacy, count: legacy.length });
    }
    return groups;
  }
  // ── 기록 백업/복원 (모바일 PWA 9차 A-4b) ──────────────────────────────
  // 내보내기 파일 = {app:'poker-tutor', schema:2, exportedAt, appVersion, device, data:{9키: 값|null}}
  // schema 1(6키) 파일도 그대로 가져온다(없는 여정 3키는 null). 가져오기 직전 상태는 PREV_KEY 1슬롯에 원문 그대로 보관
  var BACKUP_KEYS = ['poker_progress', 'poker_mistakes', 'poker_game_history', 'poker_drills', 'poker_coach', 'poker_thinking_mode',
    'poker_journey', 'poker_journey_stats', 'poker_journey_settings'];
  var DATA_KEYS = ['poker_progress', 'poker_mistakes', 'poker_game_history', 'poker_drills',
    'poker_journey', 'poker_journey_stats'];                                                 // 학습 기록
  var SETTING_KEYS = ['poker_coach', 'poker_thinking_mode', 'poker_journey_settings'];       // 기기 설정
  var PREV_KEY = 'poker_backup_prev';
  var SCHEMA = 2;
  var MAX_CHARS = 4 * 1024 * 1024;
  var CAP = 200;
  var SPACE_LIMIT = 4.5 * 1024 * 1024;   // 바이트(문자 수 x 2로 추정)
  var PREV_DAYS = 30;                    // 되돌리기 사본 보관 기간(일)
  var DAY_MS = 86400000;
  var CARD_CAP = 100;                    // 여정 명장면 카드 상한

  function _has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function _clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
  function _raw(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

  function _readAll() {
    var data = {};
    BACKUP_KEYS.forEach(function(k) { data[k] = _get(k); });
    return data;
  }

  function _device() {
    var nav = (typeof navigator !== 'undefined') ? navigator : null;
    var standalone = false;
    try {
      if (typeof window !== 'undefined' && window.matchMedia) standalone = !!window.matchMedia('(display-mode: standalone)').matches;
    } catch (e) {}
    if (!standalone && nav && nav.standalone === true) standalone = true;
    if (!standalone && typeof PWA !== 'undefined' && PWA && PWA.standalone === true) standalone = true;
    return {
      ua: (nav && nav.userAgent) || '',
      platform: (nav && ((nav.userAgentData && nav.userAgentData.platform) || nav.platform)) || '',
      standalone: standalone
    };
  }

  function exportAll() {
    return {
      app: 'poker-tutor', schema: SCHEMA, exportedAt: new Date().toISOString(),
      appVersion: (typeof PWA !== 'undefined' && PWA && PWA.version) || 'dev',
      device: _device(),
      data: _readAll()
    };
  }

  // 키별 형식 검사 → 오류 문구(초보자용) 또는 null
  var _LABEL = { poker_progress: '커리큘럼 진도', poker_mistakes: '실수 기록', poker_game_history: '핸드 기록',
    poker_drills: '드릴 기록', poker_coach: '코칭 설정', poker_thinking_mode: '띵킹 설정',
    poker_journey: '여정 기록', poker_journey_stats: '여정 통계', poker_journey_settings: '여정 설정' };
  function _checkKey(k, v) {
    if (v == null) return null;
    var bad = _LABEL[k] + ' 형식이 올바르지 않아요';
    if (k === 'poker_mistakes' || k === 'poker_game_history') {
      if (!Array.isArray(v)) return bad;
      for (var i = 0; i < v.length; i++) if (!_isObj(v[i])) return bad;
      return null;
    }
    if (!_isObj(v)) return bad;
    if (k === 'poker_drills') {
      var parts = ['items', 'stats', 'daily'];
      for (var j = 0; j < parts.length; j++) {
        if (v[parts[j]] != null && !_isObj(v[parts[j]])) return bad;
      }
    }
    if (k === 'poker_progress') {
      if (v.completedSessions != null && !Array.isArray(v.completedSessions)) return bad;
      if (v.weakSpots != null && !_isObj(v.weakSpots)) return bad;
    }
    if (k === 'poker_journey') {
      if (v.nodes != null && !_isObj(v.nodes)) return bad;
      if (v.xp != null && _num(v.xp) === null) return bad;
    }
    if (k === 'poker_journey_stats') {
      if (v.days != null && !_isObj(v.days)) return bad;
      if (v.weeks != null && !_isObj(v.weeks)) return bad;
      if (v.recent != null && !Array.isArray(v.recent)) return bad;
    }
    return null;
  }

  function validateBackup(obj) {
    var errors = [];
    var res = { ok: false, errors: errors, counts: { history: 0, mistakes: 0, drills: 0 }, exportedAt: null, device: null };
    if (!_isObj(obj)) { errors.push('백업 파일 형식이 아니에요'); return res; }
    if (obj.app !== 'poker-tutor') errors.push('포커 튜터 백업 파일이 아니에요');
    if (typeof obj.schema !== 'number' || !(obj.schema >= 1) || Math.floor(obj.schema) !== obj.schema) errors.push('백업 파일 버전 정보가 없어요');
    else if (obj.schema > SCHEMA) errors.push('더 새 버전의 앱에서 만든 파일이에요. 앱을 업데이트한 뒤 다시 가져와 주세요');
    if (!_isObj(obj.data)) errors.push('백업 파일에 기록 데이터가 없어요');
    else {
      BACKUP_KEYS.forEach(function(k) {
        var e = _checkKey(k, obj.data[k]);
        if (e) errors.push(e);
      });
    }
    if (!errors.length) {
      var len = 0;
      try { len = JSON.stringify(obj).length; } catch (e) { len = Infinity; }
      if (!(len < MAX_CHARS)) errors.push('파일이 너무 커요(4MB 이상)');
    }
    if (_isObj(obj.data)) {
      var d = obj.data;
      if (Array.isArray(d.poker_game_history)) res.counts.history = d.poker_game_history.length;
      if (Array.isArray(d.poker_mistakes)) res.counts.mistakes = d.poker_mistakes.length;
      if (_isObj(d.poker_drills) && _isObj(d.poker_drills.items)) res.counts.drills = Object.keys(d.poker_drills.items).length;
    }
    if (typeof obj.exportedAt === 'string') res.exportedAt = obj.exportedAt;
    if (_isObj(obj.device)) res.device = obj.device;
    res.ok = errors.length === 0;
    return res;
  }

  // ── 병합 (순수 함수) ──
  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function _max(a, b) {
    var x = _num(a), y = _num(b);
    if (x === null) return y === null ? a : y;
    if (y === null) return x;
    return Math.max(x, y);
  }

  function _mergeProgress(l, r) {
    if (!_isObj(l)) return _clone(_isObj(r) ? r : null);
    if (!_isObj(r)) return _clone(l);
    var out = _clone(r);                         // 파일에만 있는 필드는 가져오고
    Object.keys(l).forEach(function(k) { out[k] = _clone(l[k]); }); // 겹치면 로컬 우선
    if (l.currentSession != null || r.currentSession != null) out.currentSession = _max(l.currentSession, r.currentSession);
    var cs = [], seen = Object.create(null);
    (Array.isArray(l.completedSessions) ? l.completedSessions : []).concat(Array.isArray(r.completedSessions) ? r.completedSessions : [])
      .forEach(function(s) { var key = typeof s + ':' + s; if (!seen[key]) { seen[key] = 1; cs.push(s); } });
    cs.sort(function(a, b) { return (typeof a === 'number' && typeof b === 'number') ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; });
    if (l.completedSessions != null || r.completedSessions != null) out.completedSessions = cs;
    var lw = _isObj(l.weakSpots) ? l.weakSpots : {}, rw = _isObj(r.weakSpots) ? r.weakSpots : {};
    if (l.weakSpots != null || r.weakSpots != null) {
      var ws = {};
      Object.keys(lw).forEach(function(k) { ws[k] = lw[k]; });
      Object.keys(rw).forEach(function(k) { ws[k] = _has(ws, k) ? _max(ws[k], rw[k]) : rw[k]; });
      out.weakSpots = ws;
    }
    return out;
  }

  // 키 기준 합집합(로컬 우선) → date 오름차순(안정 정렬) → 뒤 CAP개
  function _unionByKey(l, r, keyFn) {
    var la = Array.isArray(l) ? l : null, ra = Array.isArray(r) ? r : null;
    if (!la && !ra) return null;
    var out = [], seen = Object.create(null);
    (la || []).concat(ra || []).forEach(function(rec, i) {
      if (!_isObj(rec)) return;
      var key = keyFn(rec);
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ rec: rec, i: i });
    });
    out.sort(function(a, b) {
      var da = String(a.rec.date || ''), db = String(b.rec.date || '');
      return da < db ? -1 : da > db ? 1 : a.i - b.i;
    });
    if (out.length > CAP) out = out.slice(-CAP);
    return out.map(function(o) { return _clone(o.rec); });
  }
  function _historyKey(h) { return [h.date, h.seed, h.sessionId].join('|'); }
  function _mistakeKey(m) {
    var game = m.type === 'game' || Array.isArray(m.heroCards);
    var hc = Array.isArray(m.heroCards) ? m.heroCards.join(',') : String(m.heroCards == null ? '' : m.heroCards);
    return String(m.date) + '|' + (game ? 'g:' + hc + '|' + m.street + '|' + m.action : 'q:' + m.subtype);
  }

  function _pickBy(a, b, better) { return (a && b) ? (better(b, a) ? b : a) : (a || b); }
  function _n(v) { return _isObj(v) ? (_num(v.n) || 0) : 0; }
  function _mergeDrills(l, r) {
    if (!_isObj(l) && !_isObj(r)) return null;
    l = _isObj(l) ? l : {}; r = _isObj(r) ? r : {};
    var out = { v: 1, items: {}, stats: {}, daily: {} };
    Object.keys(l).forEach(function(k) { if (!_has(out, k)) out[k] = _clone(l[k]); });
    function part(name, better) {
      var lp = _isObj(l[name]) ? l[name] : {}, rp = _isObj(r[name]) ? r[name] : {};
      Object.keys(lp).concat(Object.keys(rp)).forEach(function(k) {
        if (_has(out[name], k)) return;
        var a = _isObj(lp[k]) ? lp[k] : null, b = _isObj(rp[k]) ? rp[k] : null;
        var pick = _pickBy(a, b, better);
        if (pick) out[name][k] = _clone(pick);
      });
    }
    // items: 최근 학습(last) 큰 쪽, 동률이면 n 큰 쪽 / stats·daily: n 큰 쪽 (합산하지 않음)
    part('items', function(b, a) {
      var lb = _num(b.last) || 0, la = _num(a.last) || 0;
      return lb > la || (lb === la && _n(b) > _n(a));
    });
    part('stats', function(b, a) { return _n(b) > _n(a); });
    part('daily', function(b, a) { return _n(b) > _n(a); });
    return out;
  }

  // ── 여정 2키 병합(M1-P4, 설계서 6.3절 3번). 겹치는 필드는 로컬 우선, 파일에만 있는 필드는 가져오고, 아래 필드만 규칙 병합 ──
  var _STATUS_RANK = { locked: 0, open: 1, done: 2, passed: 3 };
  function _rank(node) { return (_isObj(node) && _has(_STATUS_RANK, node.status)) ? _STATUS_RANK[node.status] : -1; }
  function _time(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    var t = typeof v === 'string' ? Date.parse(v) : NaN;
    return isNaN(t) ? -Infinity : t;
  }
  function _put(o, k, v) { if (v !== undefined) o[k] = v; }
  function _overlay(l, r) {
    var out = _clone(r);
    Object.keys(l).forEach(function(k) { out[k] = _clone(l[k]); });
    return out;
  }
  // 키별 합집합. 값은 객체만, 양쪽에 있으면 better(파일, 로컬)이 true일 때만 파일 값
  function _mergeMap(lm, rm, better) {
    if (!_isObj(lm) && !_isObj(rm)) return undefined;
    lm = _isObj(lm) ? lm : {}; rm = _isObj(rm) ? rm : {};
    var out = {};
    Object.keys(lm).concat(Object.keys(rm)).forEach(function(k) {
      if (_has(out, k)) return;
      var pick = _pickBy(_isObj(lm[k]) ? lm[k] : null, _isObj(rm[k]) ? rm[k] : null, better);
      if (pick) out[k] = _clone(pick);
    });
    return out;
  }
  // 배열 합집합(로컬 먼저, keyFn 중복 제거, 객체만)
  function _unionList(la, ra, keyFn) {
    if (!Array.isArray(la) && !Array.isArray(ra)) return undefined;
    var out = [], seen = Object.create(null);
    (Array.isArray(la) ? la : []).concat(Array.isArray(ra) ? ra : []).forEach(function(x) {
      if (!_isObj(x)) return;
      var key = keyFn(x);
      if (seen[key]) return;
      seen[key] = 1;
      out.push(_clone(x));
    });
    return out;
  }
  // 레벨 = T(n) = levelBase(n-1) + levelStep/2 x (n-1)(n-2)의 역함수. Journey.levelFor가 있으면 그것을 쓴다
  function _levelFor(xp) {
    if (typeof Journey !== 'undefined' && Journey && typeof Journey.levelFor === 'function') {
      var lv = Journey.levelFor(xp);
      if (_num(lv) !== null) return lv;
    }
    var X = (typeof JOURNEY_XP !== 'undefined' && JOURNEY_XP) ? JOURNEY_XP : {};
    var base = _num(X.levelBase) || 300, step = _num(X.levelStep) || 50;
    var n = 1;
    while (n < 1000 && base * n + step / 2 * n * (n - 1) <= xp) n++;
    return n;
  }
  // 노드: status 서열 큰 쪽(동률 로컬)이 바탕, 진척 수치는 max
  function _mergeNode(a, b) {
    var base = _rank(b) > _rank(a) ? b : a, other = base === a ? b : a;
    var out = _clone(base);
    if (_isObj(out.lesson) && _isObj(other.lesson)) {
      _put(out.lesson, 'scene', _max(out.lesson.scene, other.lesson.scene));
      if (!out.lesson.done && other.lesson.done === true) {
        out.lesson.done = true;
        if (other.lesson.doneAt != null) out.lesson.doneAt = other.lesson.doneAt;
      }
    }
    if (_isObj(out.drill) && _isObj(other.drill)) {
      _put(out.drill, 'best', _max(out.drill.best, other.drill.best));
      _put(out.drill, 'n', _max(out.drill.n, other.drill.n));
      if (_time(other.drill.lastAt) > _time(out.drill.lastAt)) out.drill.lastAt = other.drill.lastAt;
    }
    if (_isObj(out.mission) && _isObj(other.mission)) _put(out.mission, 'hands', _max(out.mission.hands, other.mission.hands));
    return out;
  }
  // ── 여정 병합 확장(M7 결정 28, DATA-02~05, DATA-07, TIME-10, TIME-11) ──
  // 규칙 요약: id 집합과 열람 목록은 합집합(상한 유지), 횟수는 큰 값, 단일 타임스탬프는 최신 우선, 기기 설정과 닿는 필드는 로컬.
  var REVIEW_CAP = 200, REVIEW_VIEWS_MAX = 260;                 // review-queue.js CAP, VIEWS_MAX
  var LUCK_CARD_CAP = 50, LUCK_VIEW_CAP = 100;                  // hero-stats.js LUCK_CAP, VIEW_CAP
  var SHORT_CAP = 20, MINI_HIST_CAP = 20;                       // journey-core.js SHORT_CAP, theater-ui.js MINI_HIST
  var BACKUP_MONTHS_CAP = 36, PERIOD_HIST_MAX = 12;             // badges.js BACKUP_MONTHS_MAX, seasons.js HIST_MAX
  var FROZEN_MAX = 60, GRAD_BOX = 4;
  var _PERIOD_KEY = /^\d{4}-(?:W\d{2}|\d{2})$/;

  // 시간 오름차순(동률은 입력 순서) 정렬 뒤 뒤쪽 cap개
  function _sortTail(list, timeFn, cap) {
    var arr = list.map(function(x, i) { return { x: x, i: i, t: timeFn(x) }; });
    arr.sort(function(a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : a.i - b.i; });
    var out = arr.map(function(o) { return o.x; });
    return out.length > cap ? out.slice(-cap) : out;
  }
  // 문자열 목록 합집합(오름차순, 뒤쪽 cap개). 양쪽 다 배열이 아니면 undefined
  function _unionStrings(la, ra, cap) {
    if (!Array.isArray(la) && !Array.isArray(ra)) return undefined;
    var seen = Object.create(null), out = [];
    (Array.isArray(la) ? la : []).concat(Array.isArray(ra) ? ra : []).forEach(function(s) {
      if (typeof s !== 'string' || seen[s]) return;
      seen[s] = 1; out.push(s);
    });
    out.sort();
    return out.length > cap ? out.slice(-cap) : out;
  }
  function _idKey(x) { return x.id != null ? String(x.id) : JSON.stringify(x); }
  function _clone2(v) { return (v !== null && typeof v === 'object') ? _clone(v) : v; }
  function _dayIdxOfKey(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k));
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS) : null;
  }
  // ISO 8601 주 키(JStats.weekKey와 같은 식, 저장 모듈이 통계 모듈보다 먼저 올라와서 복사)
  function _isoWeekKey(dayKey) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey));
    if (!m) return null;
    var t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    var dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    var y = t.getUTCFullYear();
    var wk = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY_MS + 1) / 7);
    return y + '-W' + (wk < 10 ? '0' : '') + wk;
  }

  // 실수 복습(review-queue.js). 항목은 키별로 마지막 사건(at, lastAt 중 늦은 쪽)이 더 새로운 쪽이 이기고(실수가 다시 들어와
  // at이 새로워진 항목이나 틀려서 상자가 0이 된 항목을 옛 상자로 되돌리지 않는다), 같으면 더 진행된 상자, 그다음 늦은 기한.
  // 횟수 n, ok는 큰 값. 열람 주(views)는 합집합, coach(연습 연쇄 중 코칭 스냅샷)는 기기 설정이라 로컬.
  function _reviewPick(a, b) {
    var ta = Math.max(_time(a.at), _time(a.lastAt)), tb = Math.max(_time(b.at), _time(b.lastAt));
    if (ta !== tb) return tb > ta ? b : a;
    var ba = _num(a.box) || 0, bb = _num(b.box) || 0;
    if (ba !== bb) return bb > ba ? b : a;
    return (_num(b.due) || 0) > (_num(a.due) || 0) ? b : a;
  }
  // 200개를 넘으면 졸업 항목(오래된 순)부터, 그다음 오래된 항목부터 지운다(ReviewQueue._prune과 같은 순서)
  function _reviewPrune(items) {
    var keys = Object.keys(items);
    if (keys.length <= REVIEW_CAP) return items;
    var cand = keys.map(function(k) {
      var it = items[k], grad = (_num(it.box) || 0) >= GRAD_BOX ? 0 : 1;
      var t = _time(grad === 0 ? (it.lastAt || it.at) : it.at);
      return { k: k, g: grad, t: isFinite(t) ? t : 0 };
    }).sort(function(a, b) { return (a.g - b.g) || (a.t - b.t) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0); });
    var drop = {};
    for (var i = 0; i < keys.length - REVIEW_CAP; i++) drop[cand[i].k] = 1;
    var out = {};
    keys.forEach(function(k) { if (!drop[k]) out[k] = items[k]; });
    return out;
  }
  function _mergeReview(l, r) {
    var lo = _isObj(l), ro = _isObj(r);
    if (!lo && !ro) return undefined;
    if (!lo) { var c = _clone(r); delete c.coach; return c; }
    if (!ro) return _clone(l);
    var out = _overlay(l, r);
    var li = _isObj(l.items) ? l.items : {}, ri = _isObj(r.items) ? r.items : {}, items = {};
    Object.keys(li).concat(Object.keys(ri)).forEach(function(k) {
      if (_has(items, k)) return;
      var a = _isObj(li[k]) ? li[k] : null, b = _isObj(ri[k]) ? ri[k] : null;
      if (!a || !b) { items[k] = _clone(a || b); return; }
      var win = _clone(_reviewPick(a, b));
      ['n', 'ok'].forEach(function(f) { var m = _max(a[f], b[f]); if (_num(m) !== null) win[f] = m; });
      items[k] = win;
    });
    out.items = _reviewPrune(items);
    out.views = _unionStrings(l.views, r.views, REVIEW_VIEWS_MAX) || [];
    if (_has(l, 'coach')) out.coach = _clone2(l.coach); else delete out.coach;
    return out;
  }

  // 운 미터(hero-stats.js): 카드는 id 합집합 최근 50장, 열람은 (at, id) 합집합 최근 100개
  function _mergeLuck(l, r) {
    var lo = _isObj(l), ro = _isObj(r);
    if (!lo && !ro) return undefined;
    if (!lo) return _clone(r);
    if (!ro) return _clone(l);
    var out = _overlay(l, r);
    var cards = _unionList(l.cards, r.cards, _idKey);
    if (cards) out.cards = _sortTail(cards, function(c) { return _time(c.at); }, LUCK_CARD_CAP);
    var views = _unionList(l.views, r.views, function(v) { return String(v.at) + '|' + String(v.id); });
    if (views) out.views = _sortTail(views, function(v) { return _time(v.at); }, LUCK_VIEW_CAP);
    return out;
  }

  // 배지 이벤트 기록(badges.js badgeMeta): 횟수와 최고 기록은 큰 값, 현재 연속(cur)은 로컬, 백업 달은 합집합 최근 36개,
  // 맞히기 최고는 맞힌 수가 큰 쪽(같으면 전체 수가 작은 쪽). L3 유지 시작(l3Since)은 단일 타임스탬프라 늦은 쪽(더 보수적인 쪽, 코칭 레벨은 기기 설정이라
  // 이 기기가 L3가 아니면 Badges.check가 다음에 비운다), 아직 알리지 않은 배지(unseen)는 로컬.
  function _mergeBadgeMeta(l, r) {
    var lo = _isObj(l), ro = _isObj(r);
    if (!lo && !ro) return undefined;
    var L = lo ? l : {}, R = ro ? r : {};
    var out = _overlay(L, R);
    if (_isObj(L.run) || _isObj(R.run)) {
      var lr = _isObj(L.run) ? L.run : {}, rr = _isObj(R.run) ? R.run : {}, run = {};
      Object.keys(lr).concat(Object.keys(rr)).forEach(function(k) {
        if (_has(run, k)) return;
        var a = _isObj(lr[k]) ? lr[k] : null, b = _isObj(rr[k]) ? rr[k] : null;
        if (a && b) {
          var o = _overlay(a, b);
          o.best = _max(_max(a.best, b.best), a.cur);
          run[k] = o;
        } else run[k] = _clone(a || b);
      });
      out.run = run;
    }
    ['river', 'cone', 'mini', 'paint'].forEach(function(f) { _put(out, f, _max(L[f], R[f])); });
    var li = _isObj(L.identify) ? L.identify : null, ri = _isObj(R.identify) ? R.identify : null;
    if (li || ri) {
      out.identify = _clone(_pickBy(li, ri, function(b, a) {
        var cb = _num(b.correct) || 0, ca = _num(a.correct) || 0;
        return cb > ca || (cb === ca && (_num(b.total) || 0) < (_num(a.total) || 0));
      }));
    }
    var bk = _unionStrings(L.backups, R.backups, BACKUP_MONTHS_CAP);
    if (bk) out.backups = bk;
    var t3a = _time(L.l3Since), t3b = _time(R.l3Since);
    out.l3Since = (isFinite(t3a) || isFinite(t3b)) ? (t3b > t3a ? R.l3Since : L.l3Since) : null;
    out.unseen = (lo && Array.isArray(L.unseen)) ? _clone(L.unseen) : [];
    return out;
  }

  // 외형(badges.js cosmetic): 칸마다 로컬이 자동(null)이면 파일에서 고른 값을 가져온다
  function _mergeCosmetic(l, r) {
    var lo = _isObj(l), ro = _isObj(r);
    if (!lo && !ro) return undefined;
    var out = {};
    Object.keys(lo ? l : {}).concat(Object.keys(ro ? r : {})).forEach(function(k) {
      if (_has(out, k)) return;
      var lv = lo ? l[k] : undefined, rv = ro ? r[k] : undefined;
      out[k] = _clone2(lv != null ? lv : (rv != null ? rv : null));
    });
    return out;
  }

  // 보스 상태(boss.js, journey-core.js): 진행 중 시도와 코칭 고정은 기기 상태라 로컬(파일의 것은 가져오지 않음).
  // last, sets는 노드마다 시각이 늦은 쪽, hidden(은닉 좌석 배정)은 관찰 핸드 hands가 큰 쪽(같으면 at이 늦은 쪽),
  // identify(맞히기 제출)는 고른 배정과 key가 같은 기록만 남기고 노드마다 at이 늦은 쪽, hiddenLast는 로컬 우선.
  function _bossTime(x) { return Math.max(_time(x.endedAt), _time(x.startedAt), _time(x.at)); }
  function _mergeBoss(l, r) {
    var lo = _isObj(l), ro = _isObj(r);
    if (!lo && !ro) return undefined;
    if (!lo) { var c = _clone(r); c.active = null; c.coachLock = null; return c; }
    if (!ro) return _clone(l);
    var out = _overlay(l, r);
    out.active = _isObj(l.active) ? _clone(l.active) : null;
    out.coachLock = _has(l, 'coachLock') ? _clone2(l.coachLock) : null;
    var later = function(b, a) { return _bossTime(b) > _bossTime(a); };
    _put(out, 'last', _mergeMap(l.last, r.last, later));
    _put(out, 'sets', _mergeMap(l.sets, r.sets, later));
    _put(out, 'hidden', _mergeMap(l.hidden, r.hidden, function(b, a) {
      var hb = _num(b.hands) || 0, ha = _num(a.hands) || 0;
      return hb > ha || (hb === ha && _time(b.at) > _time(a.at));
    }));
    if (_isObj(l.identify) || _isObj(r.identify)) {
      var li = _isObj(l.identify) ? l.identify : {}, ri = _isObj(r.identify) ? r.identify : {}, ident = {};
      Object.keys(li).concat(Object.keys(ri)).forEach(function(id) {
        if (_has(ident, id)) return;
        var hk = (_isObj(out.hidden) && _isObj(out.hidden[id])) ? out.hidden[id].key : null;
        var ok = function(x) { return _isObj(x) && (hk == null || x.key == null || x.key === hk); };
        var pick = _pickBy(ok(li[id]) ? li[id] : null, ok(ri[id]) ? ri[id] : null, function(b, a) { return _time(b.at) > _time(a.at); });
        if (pick) ident[id] = _clone(pick);
      });
      out.identify = ident;
    }
    var hl = l.hiddenLast != null ? l.hiddenLast : r.hiddenLast;
    if (hl != null) out.hiddenLast = hl; else delete out.hiddenLast;
    return out;
  }

  // 미니시즌(theater-ui.js theater.mini): 로컬이 없으면 파일, 끝난 시즌(로컬 done)과 안 끝난 시즌(파일)이면 파일,
  // 같은 id면 편(episode)이 더 진행된 쪽(같으면 끝난 쪽), 서로 다른 진행 중 시즌이면 로컬
  function _mergeMini(a, b) {
    var ao = _isObj(a), bo = _isObj(b);
    if (!ao && !bo) return (a === null || b === null) ? null : undefined;
    if (!ao) return _clone(b);
    if (!bo) return _clone(a);
    var ad = a.done === true, bd = b.done === true;
    if (a.id != null && a.id === b.id) {
      var ea = _num(a.episode) || 0, eb = _num(b.episode) || 0;
      if (ea !== eb) return _clone(eb > ea ? b : a);
      return _clone(bd && !ad ? b : a);
    }
    return _clone(ad && !bd ? b : a);
  }

  // 스트릭(journey-core.js touchDay): 마지막 활동이 늦은 쪽(L)이 바탕이고 freezes, lastActiveAt, lastDay도 L의 것이다.
  // 두 기기의 연속 구간이 날짜로 이어지거나 겹치면 합친 구간 길이를 cur로 한다(구간 = 마지막 날 - cur + 1 ~ 마지막 날).
  // 구간 사이가 떨어져 있으면 L의 cur. best는 셋 중 최댓값, frozenDays는 합집합 최근 60개.
  function _streakDay(s) {
    var d = _dayIdxOfKey(s.lastDay);
    if (d !== null) return d;
    var t = _time(s.lastActiveAt);
    if (!isFinite(t)) return null;
    var x = new Date(t);
    return Math.round(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / DAY_MS);
  }
  function _mergeStreak(ls, rs) {
    var lo = _isObj(ls), ro = _isObj(rs);
    if (!lo && !ro) return undefined;
    if (!lo || !ro) {
      var s0 = _clone(lo ? ls : rs);
      _put(s0, 'best', _max(s0.best, s0.cur));
      return s0;
    }
    var L = _time(rs.lastActiveAt) > _time(ls.lastActiveAt) ? rs : ls, E = L === rs ? ls : rs;
    var out = _clone(L), cur = _num(L.cur) || 0, cE = _num(E.cur) || 0;
    var eL = _streakDay(L), eE = _streakDay(E);
    if (cur > 0 && cE > 0 && eL !== null && eE !== null && eE <= eL) {
      var sL = eL - cur + 1, sE = eE - cE + 1;
      if (eE >= sL - 1) cur = eL - Math.min(sL, sE) + 1;
    }
    out.cur = cur;
    out.best = _max(_max(_max(ls.best, rs.best), cur), 0);
    var fz = _unionStrings(ls.frozenDays, rs.frozenDays, FROZEN_MAX);
    if (fz) out.frozenDays = fz;
    return out;
  }

  // 주간 챌린지와 시즌(seasons.js): key가 같으면 칸별 max, done은 OR. key가 다르면 늦은 key 쪽이 현재 기간이고(그 진행, done, seen을
  // 그대로 쓴다) 이른 쪽 기간은 hist 요약으로 남긴다. hist(지난 기간 { key, done, n })는 양쪽 합집합(done OR, n max) 최근 12개.
  // params.since(레벨 기준 주)는 이른 쪽. 이 기기에서 지난주 백업을 합쳐도 연속 주 기록이 0부터 시작하지 않는다.
  function _pkey(p) { return (_isObj(p) && typeof p.key === 'string' && _PERIOD_KEY.test(p.key)) ? p.key : null; }
  function _periodN(p) {
    var pr = Array.isArray(p.progress) ? p.progress : [];
    if (p.done === true) return pr.length;
    return pr.filter(function(x) { return _num(x) !== null && x >= 1; }).length;
  }
  function _mergePeriod(l, r) {
    var lo = _isObj(l), ro = _isObj(r);
    if (!lo || !ro) return _clone(lo ? l : r);
    var kl = _pkey(l), kr = _pkey(r), out, dropped = null;
    if (kl !== null && kl === kr) {
      out = _overlay(l, r);
      if (Array.isArray(l.progress) && Array.isArray(r.progress)) {
        var len = Math.max(l.progress.length, r.progress.length);
        out.progress = [];
        for (var i = 0; i < len; i++) out.progress.push(_max(l.progress[i], r.progress[i]));
      }
      out.done = l.done === true || r.done === true;
      if (out.done) out.doneAt = (l.done === true && l.doneAt != null) ? l.doneAt : (r.done === true && r.doneAt != null ? r.doneAt : (_has(l, 'doneAt') ? l.doneAt : null));
      var sl = typeof l.seen === 'string' ? l.seen : null, sr = typeof r.seen === 'string' ? r.seen : null;
      if (sl || sr) out.seen = (sl && sr) ? (sr > sl ? sr : sl) : (sl || sr);
    } else {
      var useR = kr !== null && (kl === null || kr > kl);
      var base = useR ? r : l, other = useR ? l : r;
      out = _clone(base);
      if (_pkey(other) !== null) dropped = { key: other.key, done: other.done === true, n: _periodN(other) };
    }
    var pa = _isObj(l.params) ? l.params.since : null, pb = _isObj(r.params) ? r.params.since : null;
    if (typeof pa === 'string' && typeof pb === 'string' && _PERIOD_KEY.test(pa) && _PERIOD_KEY.test(pb) && _isObj(out.params)) {
      out.params.since = pa < pb ? pa : pb;
    }
    var byKey = Object.create(null), keys = [];
    (Array.isArray(l.hist) ? l.hist : []).concat(Array.isArray(r.hist) ? r.hist : []).concat(dropped ? [dropped] : []).forEach(function(h) {
      if (!_isObj(h) || typeof h.key !== 'string' || !_PERIOD_KEY.test(h.key)) return;
      var e = byKey[h.key];
      if (!e) { e = byKey[h.key] = { key: h.key, done: false, n: 0 }; keys.push(h.key); }
      if (h.done === true) e.done = true;
      var n = _num(h.n);
      if (n !== null && n > e.n) e.n = n;
    });
    keys.sort();
    if (keys.length > PERIOD_HIST_MAX) keys = keys.slice(-PERIOD_HIST_MAX);
    out.hist = keys.map(function(k) { return byKey[k]; });
    return out;
  }

  function _mergeJourney(l, r) {
    if (!_isObj(l)) return _clone(_isObj(r) ? r : null);
    if (!_isObj(r)) return _clone(l);
    var out = _overlay(l, r);
    _put(out, 'v', _max(l.v, r.v));
    var c1 = _time(l.createdAt), c2 = _time(r.createdAt);                       // 시작일은 이른 쪽(주간 챌린지 주차와 임계 상승의 기준)
    if (isFinite(c2) && (!isFinite(c1) || c2 < c1)) out.createdAt = r.createdAt;
    _put(out, 'stage', _max(l.stage, r.stage));
    if (_isObj(l.nodes) || _isObj(r.nodes)) {
      var ln = _isObj(l.nodes) ? l.nodes : {}, rn = _isObj(r.nodes) ? r.nodes : {}, nodes = {};
      Object.keys(ln).concat(Object.keys(rn)).forEach(function(id) {
        if (_has(nodes, id)) return;
        var a = _isObj(ln[id]) ? ln[id] : null, b = _isObj(rn[id]) ? rn[id] : null;
        nodes[id] = (a && b) ? _mergeNode(a, b) : _clone(a || b);
      });
      out.nodes = nodes;
    }
    _put(out, 'xp', _max(l.xp, r.xp));
    if (_num(out.xp) !== null) out.level = _levelFor(out.xp);
    if (Array.isArray(l.unlocks) || Array.isArray(r.unlocks)) {
      var un = [];
      (Array.isArray(l.unlocks) ? l.unlocks : []).concat(Array.isArray(r.unlocks) ? r.unlocks : [])
        .forEach(function(u) { if (un.indexOf(u) < 0) un.push(u); });
      out.unlocks = un;
    }
    _put(out, 'streak', _mergeStreak(l.streak, r.streak));
    _put(out, 'badges', _unionList(l.badges, r.badges, function(b) { return String(b.id); }));
    if (_isObj(l.rating) || _isObj(r.rating)) {
      out.rating = _clone(_pickBy(_isObj(l.rating) ? l.rating : null, _isObj(r.rating) ? r.rating : null,
        function(b, a) { return (_num(b.n) || 0) > (_num(a.n) || 0); }));
    }
    _put(out, 'daily', _mergeMap(l.daily, r.daily, function(b, a) { return (_num(b.xp) || 0) > (_num(a.xp) || 0); }));
    if (_isObj(l.theater) || _isObj(r.theater)) {
      var lt = _isObj(l.theater) ? l.theater : {}, rt = _isObj(r.theater) ? r.theater : {};
      var th = _overlay(lt, rt);
      ['episodes', 'predicted', 'hit', 'hitW'].forEach(function(f) { _put(th, f, _max(lt[f], rt[f])); });
      var cards = _unionList(lt.cards, rt.cards, function(c) { return String(c.id); });
      if (cards) {
        cards = cards.map(function(c, i) { return { c: c, i: i }; })
          .sort(function(a, b) { var ta = _time(a.c.at), tb = _time(b.c.at); return ta < tb ? -1 : ta > tb ? 1 : a.i - b.i; })
          .map(function(o) { return o.c; });
        if (cards.length > CARD_CAP) cards = cards.slice(-CARD_CAP);   // 오래된 카드부터 버림
        th.cards = cards;
      }
      var mh = _unionList(lt.miniHist, rt.miniHist, _idKey);
      if (mh) th.miniHist = _sortTail(mh, function(h) { return _time(h.at); }, MINI_HIST_CAP);
      if (_has(lt, 'mini') || _has(rt, 'mini')) {
        var mini = _mergeMini(lt.mini, rt.mini);
        // 이미 끝난 시즌 기록(miniHist)에 있는 id의 진행 중 시즌은 다른 기기에서 끝난 것이라 되살리지 않는다
        if (_isObj(mini) && mini.done !== true && mini.id != null && (Array.isArray(th.miniHist) ? th.miniHist : []).some(function(h) { return _isObj(h) && h.id === mini.id; })) mini = null;
        if (mini !== undefined) th.mini = mini;
      }
      out.theater = th;
    }
    var lp = _isObj(l.placement) ? l.placement : null, rp = _isObj(r.placement) ? r.placement : null;
    if (rp && rp.done === true && !(lp && lp.done === true)) out.placement = _clone(rp);
    // 배치를 건너뛴 기록(declinedAt)도 넘긴다. 없으면 새 기기 홈에 '어디서부터 시작할까요?' 카드가 다시 뜬다
    else if (rp && rp.declinedAt && !(lp && (lp.done === true || lp.declinedAt))) {
      out.placement = _isObj(lp) ? _clone(lp) : {};
      out.placement.declinedAt = rp.declinedAt;
    }
    if (_isObj(l.flags) || _isObj(r.flags)) {
      var lf = _isObj(l.flags) ? l.flags : {}, rf = _isObj(r.flags) ? r.flags : {}, flags = {};
      Object.keys(lf).concat(Object.keys(rf)).forEach(function(id) {
        if (_has(flags, id)) return;
        flags[id] = _unionList(lf[id], rf[id], function(f) { return String(f.at) + '|' + String(f.scene); }) || [];
      });
      out.flags = flags;
    }
    ['weekly', 'season'].forEach(function(k) { if (_isObj(l[k]) || _isObj(r[k])) out[k] = _mergePeriod(l[k], r[k]); });
    // M7 결정 28 8필드와 DATA-03: 로컬에 키가 있으면 파일 것을 통째로 버리던 필드
    _put(out, 'review', _mergeReview(l.review, r.review));
    _put(out, 'luck', _mergeLuck(l.luck, r.luck));
    _put(out, 'badgeMeta', _mergeBadgeMeta(l.badgeMeta, r.badgeMeta));
    _put(out, 'cosmetic', _mergeCosmetic(l.cosmetic, r.cosmetic));
    var ss = _unionList(l.shortSessions, r.shortSessions, function(x) { return String(x.at) + '|' + String(x.node); });
    if (ss) out.shortSessions = _sortTail(ss, function(x) { return _time(x.at); }, SHORT_CAP);
    _put(out, 'boss', _mergeBoss(l.boss, r.boss));
    return out;
  }

  // 일 집계: dec.n 큰 쪽(합산하지 않음). 같으면 xp, minutes 순으로 비교하고 모두 같으면 로컬
  function _dayBetter(b, a) {
    var fs = [function(d) { return _isObj(d.dec) ? (_num(d.dec.n) || 0) : 0; },
      function(d) { return _num(d.xp) || 0; }, function(d) { return _num(d.minutes) || 0; }];
    for (var i = 0; i < fs.length; i++) {
      var x = fs[i](b), y = fs[i](a);
      if (x !== y) return x > y;
    }
    return false;
  }
  // 결정 링의 마지막 결정 시각(없으면 -Infinity)
  function _ringEnd(arr) {
    var t = -Infinity;
    if (Array.isArray(arr)) arr.forEach(function(e) { if (_isObj(e) && _time(e.t) > t) t = _time(e.t); });
    return t;
  }
  // 주 합계(weeks)에 이미 들어간 날을 days에서 뺀다(DATA-06). 주 기록의 keys(롤업한 날 키)가 있으면 그 날만, keys가 없는 예전 주
  // 기록은 7일이 다 찼거나 그 날이 가장 늦은 날보다 90일 넘게 오래됐을 때(어차피 다음 로드에서 롤업될 날)만 뺀다.
  function _dropRolledDays(out) {
    var days = out.days, weeks = out.weeks;
    if (!_isObj(days) || !_isObj(weeks)) return;
    var latest = -Infinity;
    Object.keys(days).forEach(function(k) { var i = _dayIdxOfKey(k); if (i !== null && i > latest) latest = i; });
    Object.keys(days).forEach(function(k) {
      var i = _dayIdxOfKey(k), w = i === null ? null : weeks[_isoWeekKey(k)];
      if (!_isObj(w)) return;
      if (Array.isArray(w.keys)) { if (w.keys.indexOf(k) >= 0) delete days[k]; return; }
      if ((_num(w.days) || 0) >= 7 || latest - i > 90) delete days[k];
    });
  }
  // hiddenKeys: 병합된 여정 상태에서 고른 은닉 배정의 key 집합(없으면 undefined). 그 key의 좌석 관찰이 hands와 무관하게 이긴다
  function _mergeStats(l, r, hiddenKeys) {
    if (!_isObj(l)) return _clone(_isObj(r) ? r : null);
    if (!_isObj(r)) return _clone(l);
    var out = _overlay(l, r);
    _put(out, 'v', _max(l.v, r.v));
    // 결정 링과 핸드 순번은 한 쌍이다(h 번호 체계가 한쪽 것). 마지막 결정이 더 늦은 쪽 쌍을 통째로 쓴다. 둘 다 비었으면 순번은 큰 값
    var el = _ringEnd(l.recent), er = _ringEnd(r.recent);
    if (er > el) {
      out.recent = _clone(r.recent);
      if (_has(r, 'hseq')) out.hseq = r.hseq; else delete out.hseq;
    } else if (!isFinite(el) && !isFinite(er)) {
      _put(out, 'hseq', _max(l.hseq, r.hseq));
    }
    _put(out, 'days', _mergeMap(l.days, r.days, _dayBetter));
    _put(out, 'weeks', _mergeMap(l.weeks, r.weeks, _dayBetter));
    _dropRolledDays(out);
    _put(out, 'castObs', _mergeMap(l.castObs, r.castObs, function(b, a) {
      if (hiddenKeys) {
        var kb = b.key != null && hiddenKeys[b.key] === 1, ka = a.key != null && hiddenKeys[a.key] === 1;
        if (kb !== ka) return kb;
      }
      return (_num(b.hands) || 0) > (_num(a.hands) || 0);
    }));
    var lm = _isObj(l.marks) ? l.marks : null, rm = _isObj(r.marks) ? r.marks : null;
    if (lm && rm && (_isObj(lm.stageEnter) || _isObj(rm.stageEnter))) {
      var le = _isObj(lm.stageEnter) ? lm.stageEnter : {}, re = _isObj(rm.stageEnter) ? rm.stageEnter : {}, se = {};
      Object.keys(le).concat(Object.keys(re)).forEach(function(k) {
        if (_has(se, k)) return;
        var a = _has(le, k) ? le[k] : null, b = _has(re, k) ? re[k] : null;
        se[k] = (a != null && b != null) ? (_time(b) < _time(a) ? b : a) : (a != null ? a : b);   // 먼저 들어간 시각
      });
      out.marks.stageEnter = se;
    }
    return out;
  }
  function _hiddenKeys(journey) {
    var h = (_isObj(journey) && _isObj(journey.boss) && _isObj(journey.boss.hidden)) ? journey.boss.hidden : null;
    if (!h) return undefined;
    var keys = Object.create(null), any = false;
    Object.keys(h).forEach(function(id) { if (_isObj(h[id]) && h[id].key != null) { keys[h[id].key] = 1; any = true; } });
    return any ? keys : undefined;
  }

  // local, incoming = {9키: 값|null} → 새 객체(입력 불변)
  function mergeData(local, incoming) {
    local = _isObj(local) ? local : {}; incoming = _isObj(incoming) ? incoming : {};
    var out = {};
    out.poker_progress = _mergeProgress(local.poker_progress, incoming.poker_progress);
    out.poker_game_history = _unionByKey(local.poker_game_history, incoming.poker_game_history, _historyKey);
    out.poker_mistakes = _unionByKey(local.poker_mistakes, incoming.poker_mistakes, _mistakeKey);
    out.poker_drills = _mergeDrills(local.poker_drills, incoming.poker_drills);
    out.poker_journey = _mergeJourney(local.poker_journey, incoming.poker_journey);
    out.poker_journey_stats = _mergeStats(local.poker_journey_stats, incoming.poker_journey_stats, _hiddenKeys(out.poker_journey));
    // 기기 설정: 로컬 유지(로컬에 없을 때만 파일 값)
    SETTING_KEYS.forEach(function(k) { out[k] = _clone(local[k] != null ? local[k] : (incoming[k] != null ? incoming[k] : null)); });
    return out;
  }

  // 덮어쓰기: 학습 기록 4키는 파일대로(null=삭제, 키 자체가 없으면 로컬 유지), 설정 2키는 파일에 값이 있을 때만
  function _replaceData(local, incoming) {
    var out = {};
    DATA_KEYS.forEach(function(k) {
      out[k] = _clone(_has(incoming, k) ? incoming[k] : local[k]);
    });
    SETTING_KEYS.forEach(function(k) { out[k] = _clone(incoming[k] != null ? incoming[k] : local[k]); });
    return out;
  }

  // rawMap에 없는 키는 건드리지 않는다(구버전 되돌리기 사본에 여정 3키가 없을 때 지우지 않기 위해)
  function _writeRaw(rawMap) {
    BACKUP_KEYS.forEach(function(k) {
      if (!_has(rawMap, k)) return;
      var v = rawMap[k];
      if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    });
  }

  function snapshotPrev() {
    var raw = {};
    BACKUP_KEYS.forEach(function(k) { raw[k] = _raw(k); });
    try {
      localStorage.setItem(PREV_KEY, JSON.stringify({ v: 1, kind: 'import', savedAt: new Date().toISOString(), raw: raw }));
      return true;
    } catch (e) { return false; }
  }
  function _prev() {
    var p = _get(PREV_KEY);
    return (_isObj(p) && _isObj(p.raw)) ? p : null;
  }
  function hasPrev() { return !!_prev(); }

  // 기록 요약(되돌리기 확인 문구, 가져오기 미리보기): 여정 XP, 통과 노드, 실수 복습 항목, 핸드, 실수, 스트릭
  function brief(data) {
    var d = _isObj(data) ? data : {};
    var j = _isObj(d.poker_journey) ? d.poker_journey : {};
    var nodes = _isObj(j.nodes) ? j.nodes : {}, passed = 0;
    Object.keys(nodes).forEach(function(id) { if (_isObj(nodes[id]) && nodes[id].status === 'passed') passed++; });
    return {
      xp: _num(j.xp) || 0, passed: passed,
      review: (_isObj(j.review) && _isObj(j.review.items)) ? Object.keys(j.review.items).length : 0,
      streak: _isObj(j.streak) ? (_num(j.streak.cur) || 0) : 0,
      hands: Array.isArray(d.poker_game_history) ? d.poker_game_history.length : 0,
      mistakes: Array.isArray(d.poker_mistakes) ? d.poker_mistakes.length : 0
    };
  }
  function _parseRaw(rawMap) {
    var out = {};
    BACKUP_KEYS.forEach(function(k) {
      if (!_isObj(rawMap) || typeof rawMap[k] !== 'string') return;
      try { out[k] = JSON.parse(rawMap[k]); } catch (e) { /* 깨진 원문은 요약에서 뺀다 */ }
    });
    return out;
  }
  // 되돌리기 사본 정보(M7 DATA-08): savedAt, kind('import' 가져오기 직전 | 'undo' 되돌리기 직전), ageDays, prev(사본의 요약), current(지금의 요약)
  function prevInfo() {
    var p = _prev();
    if (!p) return null;
    var t = Date.parse(p.savedAt);
    return { savedAt: p.savedAt || null, kind: p.kind === 'undo' ? 'undo' : 'import',
      ageDays: isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / DAY_MS)) : null,
      prev: brief(_parseRaw(p.raw)), current: brief(_readAll()) };
  }
  // 사본은 기한 없이 남아 몇 달 뒤에도 '되돌리기'가 보이고, 누르면 그 뒤 기록을 지웠다. 오래된 사본은 지운다(기본 30일). 지웠으면 true
  function expirePrev(days) {
    var p = _prev();
    if (!p) return false;
    var limit = (_num(days) !== null && days >= 0) ? days : PREV_DAYS;
    var t = Date.parse(p.savedAt);
    if (isFinite(t) && Date.now() - t <= limit * DAY_MS) return false;
    return dropPrev();
  }
  function dropPrev() {
    var had = !!_prev();
    try { localStorage.removeItem(PREV_KEY); } catch (e) { return false; }
    return had;
  }
  // 되돌리기 자체도 되돌릴 수 있다: 쓰기 전에 지금 9키를 슬롯(kind 'undo')에 바꿔 넣는다. 슬롯을 못 쓰면 예전처럼 비운다
  function restorePrev() {
    var p = _prev();
    if (!p) return false;
    var cur = {};
    BACKUP_KEYS.forEach(function(k) { cur[k] = _raw(k); });
    var raw = {};
    BACKUP_KEYS.forEach(function(k) { if (_has(p.raw, k)) raw[k] = (typeof p.raw[k] === 'string') ? p.raw[k] : null; });
    _writeRaw(raw);
    try { localStorage.setItem(PREV_KEY, JSON.stringify({ v: 1, kind: 'undo', savedAt: new Date().toISOString(), raw: cur })); }
    catch (e) { try { localStorage.removeItem(PREV_KEY); } catch (e2) {} }
    return true;
  }

  // ── 가져오기 전 여유 공간 추정(6.3절 5번) ──
  // 사용량 = localStorage 키(이름 + 값) 길이 합 x 2바이트, 한도 4.5MB. "현재 사용량 + 새 데이터"가 한도를 넘으면 거절
  // 되돌리기 사본 슬롯(PREV_KEY)은 빼고 센다: importAll이 그 슬롯을 지금 9키의 새 사본으로 바꿔 쓰므로, 새 사본 몫은
  // 사용량에 이미 든 지금 9키가 대신한다. 옛 사본까지 세면 한 번 가져온 뒤부터 데이터 전체 크기만큼 이중으로 잡혀 거절된다.
  var _spaceProbe = null;
  // 테스트 주입: fn() → 사용 바이트 | {used, limit} | {limit}(사용량은 실측)
  function _setSpaceProbe(fn) { _spaceProbe = (typeof fn === 'function') ? fn : null; }
  function _measured() {
    var chars = 0;
    try {
      if (typeof localStorage.length === 'number' && typeof localStorage.key === 'function') {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k === PREV_KEY) continue;
          var v = localStorage.getItem(k);
          chars += String(k).length + (v == null ? 0 : String(v).length);
        }
      } else {
        // 열거가 안 되는 저장소(node 러너 스텁 등): 이 앱의 키만 센다
        BACKUP_KEYS.forEach(function(k2) { var v2 = _raw(k2); if (v2 != null) chars += k2.length + v2.length; });
      }
    } catch (e) {}
    return chars * 2;
  }
  function _usage() {
    var limit = SPACE_LIMIT;
    if (_spaceProbe) {
      var p = _spaceProbe();
      if (_isObj(p)) {
        if (_num(p.limit) !== null) limit = p.limit;
        return { used: _has(p, 'used') ? (_num(p.used) || 0) : _measured(), limit: limit };
      }
      return { used: _num(p) || 0, limit: limit };
    }
    return { used: _measured(), limit: limit };
  }
  function spaceCheck(nextRaw) {
    var chars = 0;
    if (typeof nextRaw === 'string') chars = nextRaw.length;
    else if (_isObj(nextRaw)) Object.keys(nextRaw).forEach(function(k) { if (typeof nextRaw[k] === 'string') chars += k.length + nextRaw[k].length; });
    var need = chars * 2, u = _usage();
    return { ok: u.used + need <= u.limit, needKB: Math.ceil(need / 1024), freeKB: Math.max(0, Math.floor((u.limit - u.used) / 1024)) };
  }

  // 사용량 요약(홈의 용량 경고 카드): used는 되돌리기 사본을 뺀 값(spaceCheck와 같은 기준), ratio는 사본까지 합친 비율
  function usage() {
    var u = _usage(), prevChars = 0;
    var pr = _raw(PREV_KEY);
    if (pr != null) prevChars = PREV_KEY.length + pr.length;
    var prevBytes = prevChars * 2;
    return { usedKB: Math.ceil(u.used / 1024), prevKB: Math.ceil(prevBytes / 1024), limitKB: Math.floor(u.limit / 1024),
      ratio: u.limit > 0 ? (u.used + prevBytes) / u.limit : 0 };
  }

  // 가져오기 계획(쓰지 않음): { next(병합 또는 덮어쓴 결과), rawNext, space(spaceCheck 결과) }. 미리보기가 방식마다 공간 경고를 미리 보인다.
  function planImport(obj, mode) {
    if (mode !== 'merge' && mode !== 'replace') throw new Error('가져오기 방식은 merge 또는 replace여야 해요');
    var v = validateBackup(obj);
    if (!v.ok) throw new Error(v.errors.join(' / '));
    var local = _readAll();
    var next = mode === 'merge' ? mergeData(local, obj.data) : _replaceData(local, obj.data);
    var rawNext = {};
    BACKUP_KEYS.forEach(function(k) { rawNext[k] = next[k] == null ? null : JSON.stringify(next[k]); });
    return { next: next, rawNext: rawNext, space: spaceCheck(rawNext) };
  }

  // mode 'merge' | 'replace'. 검증 실패, 공간 부족, 되돌리기 사본 저장 실패 시 throw(기존 데이터 불변)
  function importAll(obj, mode) {
    var plan = planImport(obj, mode);
    var next = plan.next, rawNext = plan.rawNext, sc = plan.space;
    if (!sc.ok) throw new Error('저장 공간이 부족해요(백업 파일 ' + sc.needKB + ' KB, 여유 ' + sc.freeKB + ' KB)');
    if (!snapshotPrev()) throw new Error('저장 공간이 부족해 되돌리기용 사본을 만들지 못했어요');
    try { _writeRaw(rawNext); }
    catch (e) {
      // 쓰다 실패하면(용량 초과 등) 직전 상태로 원복
      var p = _prev();
      if (p) { try { var back = {}; BACKUP_KEYS.forEach(function(k) { back[k] = p.raw[k]; }); _writeRaw(back); } catch (e2) {} }
      throw new Error('저장 공간이 부족해 가져오지 못했어요');
    }
    var hist = next.poker_game_history, mis = next.poker_mistakes, dr = next.poker_drills;
    return { mode: mode, counts: {
      history: Array.isArray(hist) ? hist.length : 0,
      mistakes: Array.isArray(mis) ? mis.length : 0,
      drills: (_isObj(dr) && _isObj(dr.items)) ? Object.keys(dr.items).length : 0 } };
  }

  var _api = { getProgress, saveProgress, getMistakes, addMistake, saveHandHistory, getHandHistory, groupSessions,
    BACKUP_KEYS, PREV_KEY, SCHEMA, exportAll, validateBackup, mergeData, importAll, planImport, snapshotPrev, hasPrev, prevInfo, restorePrev,
    expirePrev, dropPrev, brief, usage, spaceCheck, _setSpaceProbe };
  // 앱을 열 때 오래된 되돌리기 사본을 지운다(M7 DATA-08). 저장소가 없거나 막혀 있으면 아무 일도 없다
  try { expirePrev(PREV_DAYS); } catch (e) { /* 정리 실패는 앱에 영향 없음 */ }
  if (typeof module !== 'undefined') module.exports = _api;
  return _api;
})();
