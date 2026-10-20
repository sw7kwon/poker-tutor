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
  // 주간 챌린지와 시즌: 같은 key면 진행 칸별 max, done은 어느 쪽이든 true면 true. key가 다르면 로컬
  function _mergePeriod(l, r) {
    if (!_isObj(l) || !_isObj(r) || l.key !== r.key) return _clone(_isObj(l) ? l : r);
    var out = _overlay(l, r);
    if (Array.isArray(l.progress) && Array.isArray(r.progress)) {
      var len = Math.max(l.progress.length, r.progress.length);
      out.progress = [];
      for (var i = 0; i < len; i++) out.progress.push(_max(l.progress[i], r.progress[i]));
    }
    out.done = l.done === true || r.done === true;
    return out;
  }
  function _mergeJourney(l, r) {
    if (!_isObj(l)) return _clone(_isObj(r) ? r : null);
    if (!_isObj(r)) return _clone(l);
    var out = _overlay(l, r);
    _put(out, 'v', _max(l.v, r.v));
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
    if (_isObj(l.streak) || _isObj(r.streak)) {
      var ls = l.streak, rs = r.streak;
      var cur = !_isObj(ls) ? rs : !_isObj(rs) ? ls : (_time(rs.lastActiveAt) > _time(ls.lastActiveAt) ? rs : ls);
      var st = _clone(cur);
      _put(st, 'best', _max(_max(_isObj(ls) ? ls.best : null, _isObj(rs) ? rs.best : null), st.cur));
      out.streak = st;
    }
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
      out.theater = th;
    }
    var lp = _isObj(l.placement) ? l.placement : null, rp = _isObj(r.placement) ? r.placement : null;
    if (rp && rp.done === true && !(lp && lp.done === true)) out.placement = _clone(rp);
    if (_isObj(l.flags) || _isObj(r.flags)) {
      var lf = _isObj(l.flags) ? l.flags : {}, rf = _isObj(r.flags) ? r.flags : {}, flags = {};
      Object.keys(lf).concat(Object.keys(rf)).forEach(function(id) {
        if (_has(flags, id)) return;
        flags[id] = _unionList(lf[id], rf[id], function(f) { return String(f.at) + '|' + String(f.scene); }) || [];
      });
      out.flags = flags;
    }
    ['weekly', 'season'].forEach(function(k) { if (_isObj(l[k]) || _isObj(r[k])) out[k] = _mergePeriod(l[k], r[k]); });
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
  function _mergeStats(l, r) {
    if (!_isObj(l)) return _clone(_isObj(r) ? r : null);
    if (!_isObj(r)) return _clone(l);
    var out = _overlay(l, r);                    // recent(최근 결정 링)는 로컬 유지
    _put(out, 'v', _max(l.v, r.v));
    _put(out, 'days', _mergeMap(l.days, r.days, _dayBetter));
    _put(out, 'weeks', _mergeMap(l.weeks, r.weeks, _dayBetter));
    _put(out, 'castObs', _mergeMap(l.castObs, r.castObs, function(b, a) { return (_num(b.hands) || 0) > (_num(a.hands) || 0); }));
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

  // local, incoming = {9키: 값|null} → 새 객체(입력 불변)
  function mergeData(local, incoming) {
    local = _isObj(local) ? local : {}; incoming = _isObj(incoming) ? incoming : {};
    var out = {};
    out.poker_progress = _mergeProgress(local.poker_progress, incoming.poker_progress);
    out.poker_game_history = _unionByKey(local.poker_game_history, incoming.poker_game_history, _historyKey);
    out.poker_mistakes = _unionByKey(local.poker_mistakes, incoming.poker_mistakes, _mistakeKey);
    out.poker_drills = _mergeDrills(local.poker_drills, incoming.poker_drills);
    out.poker_journey = _mergeJourney(local.poker_journey, incoming.poker_journey);
    out.poker_journey_stats = _mergeStats(local.poker_journey_stats, incoming.poker_journey_stats);
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
      localStorage.setItem(PREV_KEY, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), raw: raw }));
      return true;
    } catch (e) { return false; }
  }
  function _prev() {
    var p = _get(PREV_KEY);
    return (_isObj(p) && _isObj(p.raw)) ? p : null;
  }
  function hasPrev() { return !!_prev(); }
  function prevInfo() { var p = _prev(); return p ? { savedAt: p.savedAt || null } : null; }
  function restorePrev() {
    var p = _prev();
    if (!p) return false;
    var raw = {};
    BACKUP_KEYS.forEach(function(k) { if (_has(p.raw, k)) raw[k] = (typeof p.raw[k] === 'string') ? p.raw[k] : null; });
    _writeRaw(raw);
    try { localStorage.removeItem(PREV_KEY); } catch (e) {}
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

  // mode 'merge' | 'replace'. 검증 실패, 공간 부족, 되돌리기 사본 저장 실패 시 throw(기존 데이터 불변)
  function importAll(obj, mode) {
    if (mode !== 'merge' && mode !== 'replace') throw new Error('가져오기 방식은 merge 또는 replace여야 해요');
    var v = validateBackup(obj);
    if (!v.ok) throw new Error(v.errors.join(' / '));
    var local = _readAll();
    var next = mode === 'merge' ? mergeData(local, obj.data) : _replaceData(local, obj.data);
    var rawNext = {};
    BACKUP_KEYS.forEach(function(k) { rawNext[k] = next[k] == null ? null : JSON.stringify(next[k]); });
    var sc = spaceCheck(rawNext);
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
    BACKUP_KEYS, PREV_KEY, SCHEMA, exportAll, validateBackup, mergeData, importAll, snapshotPrev, hasPrev, prevInfo, restorePrev,
    spaceCheck, _setSpaceProbe };
  if (typeof module !== 'undefined') module.exports = _api;
  return _api;
})();
