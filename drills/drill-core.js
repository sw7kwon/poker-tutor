// drills/drill-core.js — 8차 WP6: 드릴 레지스트리 + Leitner 간격반복 저장소 + 시드 RNG
// 저장 키 'poker_drills' = {v:1, items:{'type|key':{box,due,n,wrong,last}}, stats:{type:{n,ok,streak,best}}, daily:{'YYYY-MM-DD':{n,ok}}}
var Drills = (function() {
  var KEY = 'poker_drills';
  var MIN = 60 * 1000, DAY = 24 * 60 * MIN;
  var INTERVALS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY];
  var MAX_ITEMS = 600;
  var _registry = {};
  var _mem = null; // localStorage 불가 시 메모리 폴백

  function _empty() { return { v: 1, items: {}, stats: {}, daily: {} }; }

  function _load() {
    var d = null;
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) d = JSON.parse(raw);
    } catch (e) { d = null; }
    if (!d && _mem) d = _mem;
    if (!d || typeof d !== 'object') d = _empty();
    if (!d.items) d.items = {};
    if (!d.stats) d.stats = {};
    if (!d.daily) d.daily = {};
    d.v = 1;
    return d;
  }

  function _save(d) {
    _mem = d;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 메모리 폴백 유지 */ }
  }

  function _dayKey(now) {
    var t = new Date(now);
    var m = t.getMonth() + 1, dd = t.getDate();
    return t.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function register(type, gen) { _registry[type] = gen; return gen; }
  function get(type) { return _registry[type] || null; }
  function types() { return Object.keys(_registry); }

  // mulberry32 시드 RNG → 0~1 실수
  function rng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function _prune(d) {
    var keys = Object.keys(d.items);
    if (keys.length <= MAX_ITEMS) return;
    var old = keys.filter(function(k) { return d.items[k].box >= 4; })
      .sort(function(a, b) { return (d.items[a].last || 0) - (d.items[b].last || 0); });
    var over = keys.length - MAX_ITEMS;
    for (var i = 0; i < old.length && over > 0; i++, over--) delete d.items[old[i]];
  }

  // 1문항 결과 기록. 정답 box+1(최대 5), due=now+INTERVALS[box] / 오답 box 0, due=now+10분
  function record(type, key, ok, ms, now) {
    if (!type || !key) return null;
    now = (typeof now === 'number') ? now : Date.now();
    var d = _load();
    var id = type + '|' + key;
    var it = d.items[id] || { box: 0, due: now, n: 0, wrong: 0, last: 0 };
    it.box = ok ? Math.min(it.box + 1, 5) : 0;
    it.due = now + (ok ? INTERVALS[it.box] : INTERVALS[1]); // 오답은 box 0 + 10분 뒤 복습
    it.n += 1;
    if (!ok) it.wrong += 1;
    it.last = now;
    d.items[id] = it;
    var s = d.stats[type] || { n: 0, ok: 0, streak: 0, best: 0 };
    s.n += 1;
    if (ok) { s.ok += 1; s.streak += 1; if (s.streak > s.best) s.best = s.streak; }
    else s.streak = 0;
    if (typeof ms === 'number' && ms > 0) { s.ms = (s.ms || 0) + ms; }
    d.stats[type] = s;
    var dk = _dayKey(now);
    var dy = d.daily[dk] || { n: 0, ok: 0 };
    dy.n += 1; if (ok) dy.ok += 1;
    d.daily[dk] = dy;
    _prune(d);
    _save(d);
    return it;
  }

  // 복습 기한이 지난 키 목록(오래 밀린 것부터). 반환은 type 접두를 뗀 key
  function due(type, now, limit) {
    now = (typeof now === 'number') ? now : Date.now();
    var d = _load();
    var pre = type + '|';
    var list = Object.keys(d.items).filter(function(id) {
      return id.indexOf(pre) === 0 && d.items[id].n > 0 && d.items[id].due <= now;
    }).sort(function(a, b) { return d.items[a].due - d.items[b].due; })
      .map(function(id) { return id.slice(pre.length); });
    return (typeof limit === 'number') ? list.slice(0, limit) : list;
  }

  function dueCount(type, now) { return due(type, now).length; }

  function stats(type) {
    var d = _load();
    var s = d.stats[type] || { n: 0, ok: 0, streak: 0, best: 0 };
    return { n: s.n, ok: s.ok, streak: s.streak, best: s.best };
  }

  function today(now) {
    var d = _load();
    var dy = d.daily[_dayKey((typeof now === 'number') ? now : Date.now())];
    return dy ? { n: dy.n, ok: dy.ok } : { n: 0, ok: 0 };
  }

  function item(type, key) {
    var d = _load();
    return d.items[type + '|' + key] || null;
  }

  // 게임 중 프리플랍 차트 판정 → SRS 기록(WP2 heroAction이 V.source==='chart'일 때 호출)
  function recordFromGame(state, heroPos, V, ok, now) {
    if (!V || !V.hand || !heroPos) return null;
    var key = null;
    if (V.spot === 'rfi') key = 'rfi|' + heroPos + '|' + V.hand;
    else if (V.spot === 'vs_open') key = 'vsRfi|' + heroPos + (V.opener ? '@' + V.opener : '') + '|' + V.hand;
    else if (V.spot === 'vs_3bet') key = 'vs3bet|' + heroPos + '|' + V.hand;
    if (!key) return null;
    return record('preflop', key, !!ok, 0, now);
  }

  function _reset() {
    _mem = null;
    try { localStorage.removeItem(KEY); } catch (e) { /* noop */ }
  }

  var api = {
    INTERVALS: INTERVALS, register: register, get: get, types: types, rng: rng,
    record: record, due: due, dueCount: dueCount, stats: stats, today: today, item: item,
    recordFromGame: recordFromGame, _load: _load, _reset: _reset
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
