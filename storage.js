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
  // 내보내기 파일 = {app:'poker-tutor', schema:1, exportedAt, appVersion, device, data:{6키: 값|null}}
  // 가져오기 직전 상태는 PREV_KEY 1슬롯에 원문 문자열 그대로 보관 → restorePrev로 정확히 되돌림
  var BACKUP_KEYS = ['poker_progress', 'poker_mistakes', 'poker_game_history', 'poker_drills', 'poker_coach', 'poker_thinking_mode'];
  var DATA_KEYS = ['poker_progress', 'poker_mistakes', 'poker_game_history', 'poker_drills']; // 학습 기록
  var SETTING_KEYS = ['poker_coach', 'poker_thinking_mode'];                                   // 기기 설정
  var PREV_KEY = 'poker_backup_prev';
  var SCHEMA = 1;
  var MAX_CHARS = 4 * 1024 * 1024;
  var CAP = 200;

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
    poker_drills: '드릴 기록', poker_coach: '코칭 설정', poker_thinking_mode: '띵킹 설정' };
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

  // local·incoming = {6키: 값|null} → 새 객체(입력 불변)
  function mergeData(local, incoming) {
    local = _isObj(local) ? local : {}; incoming = _isObj(incoming) ? incoming : {};
    var out = {};
    out.poker_progress = _mergeProgress(local.poker_progress, incoming.poker_progress);
    out.poker_game_history = _unionByKey(local.poker_game_history, incoming.poker_game_history, _historyKey);
    out.poker_mistakes = _unionByKey(local.poker_mistakes, incoming.poker_mistakes, _mistakeKey);
    out.poker_drills = _mergeDrills(local.poker_drills, incoming.poker_drills);
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

  function _writeRaw(rawMap) {
    BACKUP_KEYS.forEach(function(k) {
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
    BACKUP_KEYS.forEach(function(k) { raw[k] = (typeof p.raw[k] === 'string') ? p.raw[k] : null; });
    _writeRaw(raw);
    try { localStorage.removeItem(PREV_KEY); } catch (e) {}
    return true;
  }

  // mode 'merge' | 'replace'. 검증 실패·되돌리기 사본 저장 실패 시 throw(기존 데이터 불변)
  function importAll(obj, mode) {
    if (mode !== 'merge' && mode !== 'replace') throw new Error('가져오기 방식은 merge 또는 replace여야 해요');
    var v = validateBackup(obj);
    if (!v.ok) throw new Error(v.errors.join(' / '));
    var local = _readAll();
    var next = mode === 'merge' ? mergeData(local, obj.data) : _replaceData(local, obj.data);
    if (!snapshotPrev()) throw new Error('저장 공간이 부족해 되돌리기용 사본을 만들지 못했어요');
    var rawNext = {};
    BACKUP_KEYS.forEach(function(k) { rawNext[k] = next[k] == null ? null : JSON.stringify(next[k]); });
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
    BACKUP_KEYS, PREV_KEY, SCHEMA, exportAll, validateBackup, mergeData, importAll, snapshotPrev, hasPrev, prevInfo, restorePrev };
  if (typeof module !== 'undefined') module.exports = _api;
  return _api;
})();
