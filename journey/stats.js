// journey/stats.js (채우는 패키지: M1-P2)
// 여정 집계(poker_journey_stats, 설계서 6.1): 일별 집계, 90일 지난 날은 ISO 주 합계로 롤업,
// 최근 300결정 링 버퍼(미션/보스 롤링 판정), 캐스트 좌석 누적(castObs), 단계 진입 기록.
// 저장은 localStorage(try/catch), 실패하면 메모리에만 유지한다. 로드 시 DOM/타이머 접근 없음.
var JStats = (function() {
  var KEY = 'poker_journey_stats';
  var V = 1;
  var RECENT_MAX = 300;
  var ROLLUP_DAYS = 90;
  var DAY_MS = 86400000;
  var HERO_KEYS = ['hands', 'vpipOpp', 'vpip', 'pfrOpp', 'pfr', 'tbOpp', 'tb', 'f3Opp', 'f3', 'cbetOpp', 'cbet', 'wtsdOpp', 'wtsd', 'wsd'];
  var LIGHT_KEY = { green: 'g', yellow: 'y', red: 'r' };

  var _st = null;          // 캐시된 상태
  var _mem = null;         // 메모리 폴백(직렬화 문자열)
  var _storeOverride;      // 테스트 주입(undefined = 실제 localStorage)
  var _batch = 0, _dirty = false;

  // ── 날짜 유틸(로컬 날짜 기준) ──
  function _2(n) { return (n < 10 ? '0' : '') + n; }
  function _date(now) {
    var d;
    if (now == null) d = new Date();
    else if (now instanceof Date) d = now;
    else if (typeof now === 'string') d = new Date(Date.parse(now));
    else d = new Date(Number(now));
    return isNaN(d.getTime()) ? new Date() : d;
  }
  function _ms(now) { return _date(now).getTime(); }
  function dayKey(now) {
    var d = _date(now);
    return d.getFullYear() + '-' + _2(d.getMonth() + 1) + '-' + _2(d.getDate());
  }
  function _parseKey(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k));
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }
  // 날짜 키 → 정수 일 번호(서머타임 무관)
  function _dayIndex(k) {
    var p = _parseKey(k);
    return p ? Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / DAY_MS) : null;
  }
  function _keyOfIndex(i) {
    var d = new Date(i * DAY_MS);
    return d.getUTCFullYear() + '-' + _2(d.getUTCMonth() + 1) + '-' + _2(d.getUTCDate());
  }
  // ISO 8601 주 키 'YYYY-Www'(날짜 키 또는 now)
  function weekKey(x) {
    var p = _parseKey(x);
    if (!p) { var d = _date(x); p = [d.getFullYear(), d.getMonth() + 1, d.getDate()]; }
    var t = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    var dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    var y = t.getUTCFullYear();
    var wk = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY_MS + 1) / 7);
    return y + '-W' + _2(wk);
  }
  // 주 키 → [월요일 일 번호, 일요일 일 번호]
  function _weekSpan(wk) {
    var m = /^(\d{4})-W(\d{2})$/.exec(String(wk));
    if (!m) return null;
    var y = Number(m[1]), w = Number(m[2]);
    var jan4 = Date.UTC(y, 0, 4);
    var dow = new Date(jan4).getUTCDay() || 7;
    var mon = Math.round(jan4 / DAY_MS) - (dow - 1) + (w - 1) * 7;
    return [mon, mon + 6];
  }

  function _r1(x) { return Math.round(x * 10) / 10; }
  function _r2(x) { return Math.round(x * 100) / 100; }
  function _num(x) { if (x === true) return 1; var n = Number(x); return isFinite(n) ? n : 0; }
  function _arr(v) { return Array.isArray(v) ? v : [v]; }

  // ── 상태 ──
  function defaults() {
    return { v: V, days: {}, weeks: {}, recent: [], castObs: {}, marks: { stageEnter: {} } };
  }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _normalize(o) {
    if (!_isObj(o) || !_isObj(o.days)) return defaults();
    if (!_isObj(o.weeks)) o.weeks = {};
    if (!Array.isArray(o.recent)) o.recent = [];
    if (o.recent.length > RECENT_MAX) o.recent = o.recent.slice(-RECENT_MAX);
    if (!_isObj(o.castObs)) o.castObs = {};
    if (!_isObj(o.marks)) o.marks = {};
    if (!_isObj(o.marks.stageEnter)) o.marks.stageEnter = {};
    o.v = V;
    return o;
  }
  function _store() {
    if (_storeOverride !== undefined) return _storeOverride;
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; }
  }
  function _read() {
    var raw = null, ls = _store();
    if (ls) { try { raw = ls.getItem(KEY); } catch (e) { raw = null; } }
    if (raw == null) raw = _mem;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  // force: 캐시를 버리고 저장소에서 다시 읽기. 로드할 때마다 90일 지난 날을 주 단위로 롤업한다.
  function load(force) {
    if (_st && !force) return _st;
    _st = _normalize(_read());
    if (_rollup(_st, Date.now())) save();
    return _st;
  }
  function save(state) {
    if (state) _st = _normalize(state);
    if (!_st) return;
    if (_batch > 0) { _dirty = true; return; }
    _dirty = false;
    var raw;
    try { raw = JSON.stringify(_st); } catch (e) { return; }
    _mem = raw;
    var ls = _store();
    if (ls) { try { ls.setItem(KEY, raw); } catch (e) {} }
  }
  function reset() {
    _st = null; _mem = null; _dirty = false;
    var ls = _store();
    if (ls) { try { ls.removeItem(KEY); } catch (e) {} }
  }
  // 여러 record를 저장 1회로 묶는다(마이그레이션 소급 집계 등)
  function batch(fn) {
    _batch++;
    try { fn(); } finally {
      _batch--;
      if (!_batch && _dirty) save();
    }
  }
  // 테스트용: 저장소 교체(null = 저장소 없음, undefined = 실제 localStorage)
  function _setStorage(s) { _storeOverride = s; }

  function _newDay() {
    var st = { preflop: null, flop: null, turn: null, river: null };
    Object.keys(st).forEach(function(k) { st[k] = { n: 0, g: 0, y: 0, r: 0 }; });
    var hero = {};
    HERO_KEYS.forEach(function(k) { hero[k] = 0; });
    return {
      dec: { n: 0, g: 0, y: 0, r: 0, hint: 0, evLoss: 0, evN: 0, bySrc: {} },
      street: st, concept: {}, hero: hero, drill: {},
      puzzle: { n: 0, ok: 0, rated: 0 }, think: { m: 0, t: 0 }, intent: { n: 0, ok: 0, w: 0 },
      theater: { ep: 0, pred: 0, hit: 0 }, minutes: 0, xp: 0
    };
  }
  // 병합/구버전으로 빠진 하위 필드를 채운다(있는 값은 유지)
  function _fill(rec, tpl) {
    Object.keys(tpl).forEach(function(k) {
      var t = tpl[k];
      if (_isObj(t)) { if (!_isObj(rec[k])) rec[k] = t; else _fill(rec[k], t); }
      else if (typeof rec[k] !== 'number') rec[k] = t;
    });
    return rec;
  }
  function day(key) {
    var st = load();
    var k = _parseKey(key) ? key : dayKey(key);
    if (!_isObj(st.days[k])) st.days[k] = _newDay();
    else _fill(st.days[k], _newDay());
    return st.days[k];
  }
  function _bucket(map, k) {
    if (!_isObj(map[k])) map[k] = { n: 0, g: 0, y: 0, r: 0 };
    return map[k];
  }
  function _countLight(b, lk) { b.n = (b.n || 0) + 1; b[lk] = (b[lk] || 0) + 1; }
  function _addNums(target, src, keys) {
    keys.forEach(function(k) { if (src[k] != null) target[k] = (target[k] || 0) + _num(src[k]); });
  }

  // kind별 페이로드는 설계서 9절 M1-P2. 제외 규칙(연습, GTO 2회차, HU)은 Journey가 거르고, 여기선 HU 프리플랍만 한 번 더 막는다.
  function record(kind, payload, now) {
    var p = payload;
    var d = day(dayKey(now));
    var st = _st;
    switch (kind) {
      case 'dec': {
        if (!p) return;
        var lk = LIGHT_KEY[p.light];
        if (!lk) return;
        if (p.hu && p.street === 'preflop') return;
        _countLight(d.dec, lk);
        if (p.hint) d.dec.hint++;
        if (p.evLoss != null && isFinite(Number(p.evLoss))) {
          d.dec.evLoss = _r2(d.dec.evLoss + Math.abs(Number(p.evLoss)));
          d.dec.evN++;
        }
        if (!_isObj(d.dec.bySrc)) d.dec.bySrc = {};
        if (p.source) _countLight(_bucket(d.dec.bySrc, p.source), lk);
        if (p.street) _countLight(_bucket(d.street, p.street), lk);
        if (p.concept) _countLight(_bucket(d.concept, p.concept), lk);
        var e = { t: _ms(now), street: p.street || null, source: p.source || null, concept: p.concept || null,
          light: p.light, marginal: !!p.marginal, pattern: p.pattern || null, pos: p.pos || null,
          hu: !!p.hu, mode: p.mode || null, node: p.node || null };
        if (p.hint) e.hint = true;
        if (p.estimated) e.est = true;
        st.recent.push(e);
        if (st.recent.length > RECENT_MAX) st.recent.splice(0, st.recent.length - RECENT_MAX);
        break;
      }
      case 'hero':
        if (!p) return;
        _addNums(d.hero, p, HERO_KEYS.slice(1));
        break;
      case 'handEnd':
        d.hero.hands++;
        if (p) _addNums(d.hero, p, ['wtsdOpp', 'wtsd', 'wsd']);
        break;
      case 'drill': {
        if (!p || !p.type) return;
        var dr = _isObj(d.drill[p.type]) ? d.drill[p.type] : (d.drill[p.type] = { n: 0, ok: 0 });
        dr.n++; if (p.ok) dr.ok++;
        break;
      }
      case 'puzzle':
        if (!p) return;
        d.puzzle.n++; if (p.ok) d.puzzle.ok++; if (p.rated) d.puzzle.rated++;
        break;
      case 'think':
        if (!p) return;
        d.think.m += _num(p.m); d.think.t += _num(p.t);
        break;
      case 'intent':
        if (!p) return;
        d.intent.n++; if (p.ok) d.intent.ok++; d.intent.w = _r2(d.intent.w + _num(p.w));
        break;
      case 'theater':
        if (!p) return;
        // 설계 페이로드는 { pred, hit }(에피소드 1편 요약). ep를 따로 주지 않으면 호출 1회 = 1편
        d.theater.ep += (p.ep != null ? _num(p.ep) : 1); d.theater.pred += _num(p.pred); d.theater.hit += _num(p.hit);
        break;
      case 'minutes':
        d.minutes = _r2(d.minutes + _num(_isObj(p) ? p.n : p));
        break;
      case 'xp':
        d.xp += _num(_isObj(p) ? p.n : p);
        break;
      case 'cast': {
        if (!p || !p.name) return;
        var o = st.castObs[p.name];
        if (!_isObj(o)) o = st.castObs[p.name] = { hands: 0, vpip: 0, pfr: 0, tb: 0, aggr: 0, calls: 0, folds: 0, facing: 0, since: _date(now).toISOString() };
        if (p.hand) {
          o.hands++;
          if (p.hand.vpip) o.vpip++;
          if (p.hand.pfr) o.pfr++;
          if (p.hand.tb) o.tb++;
        }
        if (p.post) _addNums(o, p.post, ['aggr', 'calls', 'folds', 'facing']);
        break;
      }
      default:
        return;
    }
    save();
  }

  // ── 조회 ──
  // range(days, now, {weeks:true}) 또는 range({days, weeks}, now). 오래된 순. weeks는 창과 겹치는 주 합계(일부만 겹쳐도 주 전체).
  function range(days, now, opts) {
    if (_isObj(days)) { opts = days; days = opts.days; }
    var st = load();
    var n = Math.max(1, Math.floor(Number(days) || 1));
    var end = _dayIndex(dayKey(now)), start = end - n + 1;
    var out = [];
    if (opts && opts.weeks) {
      Object.keys(st.weeks).sort().forEach(function(w) {
        var sp = _weekSpan(w);
        if (sp && sp[1] >= start && sp[0] <= end) out.push(st.weeks[w]);
      });
    }
    Object.keys(st.days).sort().forEach(function(k) {
      var i = _dayIndex(k);
      if (i != null && i >= start && i <= end) out.push(st.days[k]);
    });
    return out;
  }
  function _recs(days, now) { return range(days, now, { weeks: Number(days) > ROLLUP_DAYS }); }

  // concept 생략(또는 'all')이면 전체 결정
  function accuracy(concept, days, now) {
    var n = 0, g = 0;
    _recs(days, now).forEach(function(r) {
      var b = (!concept || concept === 'all') ? r.dec : (r.concept && r.concept[concept]);
      if (b) { n += b.n || 0; g += b.g || 0; }
    });
    return { n: n, g: g, pct: n ? _r1(g / n * 100) : null };
  }

  // filter = {street?, source?, concept?}(값은 문자열 또는 배열). 한 가지 축은 일별 집계, 두 축 이상(또는 marginal)은 최근 링 기준.
  function lights(filter, days, now) {
    filter = filter || {};
    var out = { n: 0, green: 0, yellow: 0, red: 0 };
    var dims = ['street', 'source', 'concept'].filter(function(k) { return filter[k] != null; });
    function add(b) {
      if (!b) return;
      out.n += b.n || 0; out.green += b.g || 0; out.yellow += b.y || 0; out.red += b.r || 0;
    }
    if (dims.length <= 1 && filter.marginal == null) {
      _recs(days, now).forEach(function(r) {
        if (!dims.length) { add(r.dec); return; }
        var dim = dims[0];
        var map = dim === 'street' ? r.street : dim === 'source' ? (r.dec && r.dec.bySrc) : r.concept;
        if (!map) return;
        _arr(filter[dim]).forEach(function(v) { add(map[v]); });
      });
      return out;
    }
    var p = _parseKey(_keyOfIndex(_dayIndex(dayKey(now)) - Math.max(1, Math.floor(Number(days) || 1)) + 1));
    var since = new Date(p[0], p[1] - 1, p[2]).getTime();
    var f = {};
    Object.keys(filter).forEach(function(k) { f[k] = filter[k]; });
    f.since = since;
    recent(f).forEach(function(e) {
      out.n++;
      if (e.light === 'green') out.green++; else if (e.light === 'yellow') out.yellow++; else if (e.light === 'red') out.red++;
    });
    return out;
  }

  function _match(e, filter) {
    if (!filter) return true;
    for (var k in filter) {
      if (!Object.prototype.hasOwnProperty.call(filter, k)) continue;
      var fv = filter[k];
      if (fv == null) continue;
      if (k === 'since') { if (!(e.t >= fv)) return false; continue; }
      if (Array.isArray(fv)) { if (fv.indexOf(e[k]) < 0) return false; }
      else if (typeof fv === 'boolean') { if (!!e[k] !== fv) return false; }
      else if (e[k] !== fv) return false;
    }
    return true;
  }
  // 링 버퍼 조회: 조건에 맞는 최신 limit개를 오래된 순으로. filter 키는 결정 필드(street, source, concept, light, marginal, mode, node, hu, pos, pattern)와 since(ms).
  function recent(filter, limit) {
    var arr = load().recent, out = [];
    var lim = limit == null ? Infinity : Math.max(0, Number(limit) || 0);
    for (var i = arr.length - 1; i >= 0 && out.length < lim; i--) {
      if (_match(arr[i], filter)) out.push(arr[i]);
    }
    return out.reverse();
  }

  function heroTotals(days, now) {
    var t = {};
    HERO_KEYS.forEach(function(k) { t[k] = 0; });
    _recs(days, now).forEach(function(r) { if (r.hero) _addNums(t, r.hero, HERO_KEYS); });
    return t;
  }

  // 숫자 필드 깊은 합산(주 롤업, 주별 추이)
  function _sumInto(target, src) {
    Object.keys(src || {}).forEach(function(k) {
      var v = src[k];
      if (typeof v === 'number') target[k] = (typeof target[k] === 'number' ? target[k] : 0) + v;
      else if (_isObj(v)) { if (!_isObj(target[k])) target[k] = {}; _sumInto(target[k], v); }
    });
    return target;
  }
  function _pct(a, b) { return b ? _r1(a / b * 100) : null; }
  var HERO_RATE = { vpip: 'vpipOpp', pfr: 'pfrOpp', tb: 'tbOpp', f3: 'f3Opp', cbet: 'cbetOpp', wtsd: 'wtsdOpp', wsd: 'wtsd' };
  function _metric(r, metric) {
    var m = String(metric || '');
    var dec = r.dec || {}, hero = r.hero || {};
    if (m === 'accuracy') return _pct(dec.g || 0, dec.n || 0);
    if (m === 'decisions') return dec.n || 0;
    if (HERO_RATE[m]) return _pct(hero[m] || 0, hero[HERO_RATE[m]] || 0);
    if (m === 'hands') return hero.hands || 0;
    if (m === 'minutes' || m === 'xp') return _r2(r[m] || 0);
    if (m === 'evLoss') return dec.evN ? _r2(dec.evLoss / dec.evN) : null;
    if (m === 'puzzle') return r.puzzle ? _pct(r.puzzle.ok || 0, r.puzzle.n || 0) : null;
    if (m === 'think') return r.think ? _pct(r.think.m || 0, r.think.t || 0) : null;
    if (m === 'intent') return r.intent ? _pct(r.intent.ok || 0, r.intent.n || 0) : null;
    if (m === 'theater') return r.theater ? _pct(r.theater.hit || 0, r.theater.pred || 0) : null;
    var c = m.split(':');
    if (c.length === 2) {
      var map = c[0] === 'concept' ? r.concept : c[0] === 'src' ? dec.bySrc : c[0] === 'street' ? r.street : null;
      var b = map && map[c[1]];
      return b ? _pct(b.g || 0, b.n || 0) : null;
    }
    return null;
  }
  // 최근 weeks개 ISO 주의 지표(오래된 순). metric: accuracy, decisions, vpip, pfr, tb, f3, cbet, wtsd, wsd, hands,
  // minutes, xp, evLoss, puzzle, think, intent, theater, 'concept:키', 'src:키', 'street:키'. 데이터 없으면 비율은 null.
  function trend(metric, weeks, now) {
    var st = load();
    var n = Math.max(1, Math.floor(Number(weeks) || 1));
    var end = _dayIndex(dayKey(now));
    var keys = [], agg = {};
    for (var i = n - 1; i >= 0; i--) {
      var wk = weekKey(_keyOfIndex(end - i * 7));
      if (keys.indexOf(wk) < 0) { keys.push(wk); agg[wk] = null; }
    }
    function put(wk, rec) {
      if (!(wk in agg)) return;
      agg[wk] = _sumInto(agg[wk] || {}, rec);
    }
    Object.keys(st.weeks).forEach(function(w) { put(w, st.weeks[w]); });
    Object.keys(st.days).forEach(function(k) { if (_parseKey(k)) put(weekKey(k), st.days[k]); });
    return keys.map(function(wk) {
      return { week: wk, value: agg[wk] ? _metric(agg[wk], metric) : null };
    });
  }

  function markStageEnter(stage, now) {
    var st = load();
    var k = String(stage);
    if (!st.marks.stageEnter[k]) {
      st.marks.stageEnter[k] = _date(now).toISOString();
      save();
    }
  }

  function _rollup(st, now) {
    var today = _dayIndex(dayKey(now));
    var moved = 0;
    Object.keys(st.days).forEach(function(k) {
      var i = _dayIndex(k);
      if (i == null || today - i <= ROLLUP_DAYS) return;
      var wk = weekKey(k);
      var w = _isObj(st.weeks[wk]) ? st.weeks[wk] : (st.weeks[wk] = { days: 0 });
      _sumInto(w, st.days[k]);
      w.days = (w.days || 0) + 1;
      delete st.days[k];
      moved++;
    });
    return moved;
  }
  // 90일 지난 days → weeks(ISO 주) 합계. 90일째까지는 일별 유지.
  function rollup(now) {
    var st = load();
    var moved = _rollup(st, now);
    if (moved) save();
    return { moved: moved };
  }

  function castObs(name) {
    var o = load().castObs[name];
    return _isObj(o) ? o : null;
  }

  var api = {
    KEY: KEY, V: V, RECENT_MAX: RECENT_MAX, ROLLUP_DAYS: ROLLUP_DAYS,
    load: load, save: save, reset: reset, batch: batch, defaults: defaults,
    record: record, day: day, range: range, accuracy: accuracy, lights: lights, recent: recent,
    heroTotals: heroTotals, trend: trend, markStageEnter: markStageEnter, rollup: rollup, castObs: castObs,
    dayKey: dayKey, weekKey: weekKey, _setStorage: _setStorage
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
