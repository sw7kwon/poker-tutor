// puzzles/puzzle-modes.js (채우는 패키지: M2-P4c)
// 퍼즐 모드 3종(설계서 5.5절, 3.4절 1번, 4.3절 XP, 4.5절 레이팅). 계약 C6은 puzzles/puzzle-core.js 머리 주석.
//   rush(opts?)      3분 러시. 콤보 5/12/20/30에 +3/+5/+7/+10초, 오답 -10초와 콤보 초기화, 문항마다 난이도 +50. 레이팅 미반영.
//                    개인 최고와 주간 최고(ISO 주)를 poker_journey.modes.rush에 저장.
//   survival(opts?)  시간 무제한, 3번 틀리면 끝. 레이팅 미반영, 최고 기록을 poker_journey.modes.survival에 저장.
//                    틀린 문항은 Drills.record(오답 = box 0)로 복습 큐에 들어간다(1회성 문항 제외).
//   daily5(opts?)    Puzzles.daily5(dayKey, stage)의 5문항(날짜 시드, noReview). 4등급(완벽, 좋음, 아쉬움, 큰 실수)과 100점,
//                    문항마다 한 줄 해설. 결과는 Journey.dayRecord(now).daily5 = {score, grades}, 레이팅은 그날 첫 완주만.
//                    공유 텍스트(날짜 시드와 점수만)는 navigator.clipboard로 복사, 실패하면 선택 가능한 텍스트 상자.
//   daily5Status(now) -> {done, score|null, grades|null}, available(mode) -> bool, records() -> {rush, survival}
//   opts = {onDone(r), stage?, rating?, now?(데일리 5 날짜), ms?(러시 시간), seed?}. 인자 없이 불러도 동작한다(홈 빠른 줄, ?go=rush).
// XP: 러시와 서바이벌은 설계서에 값이 없어 'review' 소스로 정답당 2(하루 반복 상한 적용). 데일리 5는 완주 15 + 만점 10(그날 첫 완주만).
// 순수 코어(시간 규칙, 서바이벌, 등급과 점수, 공유 텍스트, 최고 기록)는 PuzzleModes.core로 공개해 node에서 테스트한다.
// 로드 시 DOM 접근 없음. 다른 모듈은 호출 시점에 전역에서 찾는다(typeof 가드).
var PuzzleModes = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);

  var RUSH_MS = 180000;
  var RUSH_BONUS = [[5, 3000], [12, 5000], [20, 7000], [30, 10000]];   // [콤보, 보너스 ms]
  var RUSH_PENALTY = 10000;
  var RUSH_STEP = 50;          // 문항마다 난이도 +50
  var SURV_LIVES = 3;
  var SURV_STEP = 25;          // 서바이벌은 천천히 어려워진다(설계서에 값 없음)
  var SLOW_MS = 30000;         // 데일리 5: 정답이지만 30초를 넘기면 '좋음'
  var MODE_XP = 2;             // 러시, 서바이벌 정답당('review' 소스)
  var DAILY_N = 5;
  var GRADES = ['perfect', 'good', 'close', 'miss'];
  var GRADE = {
    perfect: { icon: '🟩', mark: '★', text: '완벽', pts: 100, desc: '정답' },
    good:    { icon: '🟨', mark: '●', text: '좋음', pts: 70, desc: '정답, 30초 넘김' },
    close:   { icon: '🟧', mark: '▲', text: '아쉬움', pts: 30, desc: '정답에 가까운 보기' },
    miss:    { icon: '⬛', mark: '✖', text: '큰 실수', pts: 0, desc: '오답' }
  };

  var _env = {};               // 테스트 주입 { now, setInterval, clearInterval }
  var _lastShare = null;

  // ── 공용 헬퍼 ──────────────────────────────────────────
  function _m(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _can(mod, fn) { var o = _m(mod); return !!(o && typeof o[fn] === 'function'); }
  function _call(mod, fn) {
    var o = _m(mod);
    if (!o || typeof o[fn] !== 'function') return undefined;
    try { return o[fn].apply(o, Array.prototype.slice.call(arguments, 2)); }
    catch (e) { _warn(mod + '.' + fn, e); return undefined; }
  }
  function _warn(where, e) { if (typeof console !== 'undefined' && console.warn) console.warn('[PuzzleModes] ' + where + ' 실패:', e && e.message ? e.message : e); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function _now() { return typeof _env.now === 'function' ? _env.now() : Date.now(); }
  function _every(fn, ms) {
    if (typeof _env.setInterval === 'function') return _env.setInterval(fn, ms);
    return (typeof setInterval === 'function') ? setInterval(fn, ms) : null;
  }
  function _stopEvery(id) {
    if (id == null) return;
    if (typeof _env.clearInterval === 'function') { _env.clearInterval(id); return; }
    if (typeof clearInterval === 'function') clearInterval(id);
  }
  function _toast(msg, ms) { _call('JourneyUI', 'toast', msg, ms); }
  function _xp(src, amount) {
    if (!(amount > 0)) return 0;
    var r;
    if (_can('JourneyUI', 'xp')) r = _call('JourneyUI', 'xp', src, amount);
    else if (_can('Journey', 'addXp')) r = _call('Journey', 'addXp', src, amount, _now());
    else return 0;
    if (r && isFinite(r.granted)) return Number(r.granted);
    return (r === undefined || r === null) ? 0 : amount;
  }
  function _xpConst(k, d) { var X = _m('JOURNEY_XP'); return X && isFinite(X[k]) ? Number(X[k]) : d; }
  function _pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(now) {
    var k = _call('Journey', 'dayKey', now);
    if (typeof k === 'string' && k) return k;
    var t = new Date(now);
    return t.getFullYear() + '-' + _pad(t.getMonth() + 1) + '-' + _pad(t.getDate());
  }
  function _UI() { return _m('PuzzleUI'); }

  // ── 순수 코어: 러시 시간 규칙 ────────────────────────────
  function rushInit(now, ms) {
    now = _num(now, 0);
    var dur = Math.max(1, _num(ms, RUSH_MS));
    return { start: now, end: now + dur, dur: dur, n: 0, ok: 0, combo: 0, best: 0, bonus: 0, penalty: 0, last: 0, lastAt: null, over: false };
  }
  function rushBonusFor(combo) {
    for (var i = 0; i < RUSH_BONUS.length; i++) if (RUSH_BONUS[i][0] === combo) return RUSH_BONUS[i][1];
    return 0;
  }
  function rushLeft(st, now) { return st ? Math.max(0, st.end - _num(now, 0)) : 0; }
  function rushOver(st, now) { return !st || st.over || rushLeft(st, now) <= 0; }
  // 답 1개 반영(새 객체). 시간이 이미 끝났으면 바꾸지 않고 over만 세운다.
  function rushAnswer(st, ok, now) {
    var o = {}, k;
    for (k in st) if (Object.prototype.hasOwnProperty.call(st, k)) o[k] = st[k];
    if (rushOver(st, now)) { o.over = true; o.last = 0; return o; }
    o.n++;
    if (ok) {
      o.ok++; o.combo++; if (o.combo > o.best) o.best = o.combo;
      var b = rushBonusFor(o.combo);
      o.end += b; o.bonus += b; o.last = b;
    } else {
      o.combo = 0; o.end -= RUSH_PENALTY; o.penalty += RUSH_PENALTY; o.last = -RUSH_PENALTY;
    }
    o.lastAt = _num(now, 0);
    if (rushLeft(o, now) <= 0) o.over = true;
    return o;
  }
  function rushRating(base, i) { return _num(base, 1000) + RUSH_STEP * Math.max(0, Math.floor(_num(i, 0))); }
  function clock(ms) {
    var s = Math.ceil(Math.max(0, _num(ms, 0)) / 1000), m = Math.floor(s / 60);
    return m + ':' + _pad(s % 60);
  }

  // ── 순수 코어: 서바이벌 ────────────────────────────────
  function survInit() { return { n: 0, ok: 0, strikes: 0, lives: SURV_LIVES, combo: 0, best: 0 }; }
  function survAnswer(st, ok) {
    var o = { n: st.n + 1, ok: st.ok, strikes: st.strikes, lives: st.lives, combo: st.combo, best: st.best };
    if (survOver(st)) return st;
    if (ok) { o.ok++; o.combo++; if (o.combo > o.best) o.best = o.combo; }
    else { o.strikes++; o.combo = 0; }
    o.lives = Math.max(0, SURV_LIVES - o.strikes);
    return o;
  }
  function survOver(st) { return !!st && st.strikes >= SURV_LIVES; }

  // ── 순수 코어: 데일리 5 등급과 점수, 공유 텍스트 ────────────────
  // 정답 = 완벽, 정답이지만 느리면(SLOW_MS 초과) 좋음, near 보기를 고른 오답 = 아쉬움, 나머지 = 큰 실수
  function grade(ok, near, ms, slowMs) {
    if (ok) return _num(ms, 0) > _num(slowMs, SLOW_MS) ? 'good' : 'perfect';
    return near ? 'close' : 'miss';
  }
  // 100점 환산: 등급 점수(100/70/30/0)의 평균, 반올림
  function score(grades) {
    if (!Array.isArray(grades) || !grades.length) return 0;
    var s = 0;
    grades.forEach(function(g) { s += GRADE[g] ? GRADE[g].pts : 0; });
    return Math.round(s / grades.length);
  }
  function dateCode(day) { return String(day || '').replace(/-/g, ''); }
  // 날짜 시드와 점수만(문항, 손, 정답은 넣지 않는다)
  function shareText(day, sc, grades) {
    var row = (Array.isArray(grades) ? grades : []).map(function(g) { return GRADE[g] ? GRADE[g].icon : GRADE.miss.icon; }).join('');
    return '포커 여정 데일리 5\n' + day + ' (시드 #' + dateCode(day) + ')\n' + _num(sc, 0) + '점 ' + row;
  }
  function gradeCounts(grades) {
    var c = { perfect: 0, good: 0, close: 0, miss: 0 };
    (grades || []).forEach(function(g) { if (c[g] != null) c[g]++; });
    return c;
  }

  // ── 순수 코어: 주간 키와 최고 기록 ──────────────────────────
  // ISO 주(월요일 시작, 그 주 목요일이 속한 해), 로컬 날짜 기준. 예 '2026-W43'
  function weekKey(now) {
    var t = new Date(_num(now, 0));
    var d = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    var dow = (d.getDay() + 6) % 7;                 // 월 0 ... 일 6
    d.setDate(d.getDate() - dow + 3);               // 그 주 목요일
    var y = d.getFullYear();
    var jan4 = new Date(y, 0, 4);
    var w = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    return y + '-W' + _pad(w);
  }
  // rec = {best, bestAt, week:{key, best}, runs} | null → {rec(새 객체), newBest, newWeek}
  function bestUpdate(rec, value, now) {
    rec = rec && typeof rec === 'object' ? rec : {};
    value = Math.max(0, Math.floor(_num(value, 0)));
    var wk = weekKey(now);
    var out = { best: _num(rec.best, 0), bestAt: rec.bestAt || null, runs: _num(rec.runs, 0) + 1,
      week: (rec.week && rec.week.key === wk) ? { key: wk, best: _num(rec.week.best, 0) } : { key: wk, best: 0 } };
    var newBest = value > out.best, newWeek = value > out.week.best;
    if (newBest) { out.best = value; out.bestAt = new Date(_num(now, 0)).toISOString(); }
    if (newWeek) out.week.best = value;
    return { rec: out, newBest: newBest && value > 0, newWeek: newWeek && value > 0 };
  }

  // ── 저장(poker_journey.modes) ───────────────────────────
  var _memModes = {};
  function _modes() {
    var st = _call('Journey', 'load');
    if (!st || typeof st !== 'object') return _memModes;
    if (!st.modes || typeof st.modes !== 'object' || Array.isArray(st.modes)) st.modes = {};
    return st.modes;
  }
  function _save() { _call('Journey', 'save'); }
  function records() {
    var md = _modes();
    return { rush: md.rush || null, survival: md.survival || null };
  }

  // ── 문항 공급(러시, 서바이벌) ────────────────────────────
  function _P() { return _m('Puzzles'); }
  function _meta(t) {
    var P = _P(); if (!P) return null;
    var tm = P.TYPE_META && typeof P.TYPE_META === 'object' ? P.TYPE_META[t] : null;
    if (tm) return tm;
    if (typeof P.meta === 'function') { try { return P.meta(t); } catch (e) { return null; } }
    return null;
  }
  function _usable(t) {
    var U = _UI();
    if (U && typeof U.can === 'function') return !!U.can(t);
    return false;
  }
  function _stage(opts) {
    if (opts && isFinite(opts.stage)) return Math.max(1, Math.min(6, Math.floor(opts.stage)));
    var U = _UI();
    if (U && typeof U.stage === 'function') return U.stage();
    var s = _call('Journey', 'load');
    return Math.max(1, Math.min(6, Math.floor(_num(s && s.stage, 1))));
  }
  function _baseRating(opts) {
    if (opts && isFinite(opts.rating)) return Number(opts.rating);
    var U = _UI();
    if (U && typeof U.rating === 'function') return U.rating();
    return 1000;
  }
  // 점수 모드에 쓰는 유형: 화면에 낼 수 있고(paint 제외) 참고/근사가 아니며 현재 단계 +1 이하
  function pool(stage) {
    var P = _P();
    if (!P || typeof P.types !== 'function') return [];
    var list = [];
    try { list = P.types() || []; } catch (e) { list = []; }
    return list.filter(function(t) {
      var mt = _meta(t) || {};
      if (mt.confidence === 'approx') return false;
      if (isFinite(mt.stage) && mt.stage > stage + 1) return false;
      return _usable(t);
    });
  }
  function _pick(stage, rating, rnd, types) {
    var P = _P(), t = null;
    if (P && typeof P.pickType === 'function') {
      try { t = P.pickType(stage, rating, rnd); } catch (e) { t = null; }   // Puzzles.pickType(stage, rating, rnd, opts)
      if (t && typeof t === 'object') t = t.type || null;
    }
    if (t && types.indexOf(t) >= 0) return t;
    return types.length ? types[Math.floor(rnd() * types.length) % types.length] : null;
  }
  function _question(stage, rating, rnd, types, mode) {
    var P = _P(); if (!P || typeof P.next !== 'function') return null;
    var U = _UI(), win = (U && typeof U.ratingWindow === 'function') ? U.ratingWindow(rating) : [rating - 300, rating - 200];
    for (var k = 0; k < 4; k++) {
      var t = _pick(stage, rating, rnd, types);
      if (!t) return null;
      var q = null;
      try { q = P.next(t, rnd, { stage: stage, rating: rating, window: win, now: _now(), mode: mode }); } catch (e) { q = null; }
      if (q && q.confidence !== 'approx' && Array.isArray(q.options) && q.options.length >= 2) return q;
    }
    return null;
  }
  function _ready(opts) {
    var U = _UI();
    return !!(U && typeof U.run === 'function' && pool(_stage(opts)).length);
  }
  // 모드를 지금 열 수 있는지(홈 빠른 줄의 '곧' 표시용). daily5는 Puzzles.daily5 또는 next가 있어야 한다.
  function available(mode) {
    if (!_ready()) return false;
    if (mode === 'daily5') { var P = _P(); return !!(P && (typeof P.daily5 === 'function' || typeof P.next === 'function')); }
    return true;
  }
  function _soon(opts) {
    _toast('퍼즐을 준비하고 있어요. 다음 업데이트에서 열려요', 2600);
    if (opts && typeof opts.onDone === 'function') { try { opts.onDone(null); } catch (e) { _warn('onDone', e); } }
    return false;
  }
  function _seed(opts) {
    if (opts && opts.seed != null) return opts.seed >>> 0;
    return ((_now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  }
  function _rng(seed) {
    var U = _UI();
    if (U && typeof U.rng === 'function') return U.rng(seed);
    var a = (seed >>> 0) || 0x9e3779b9;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _bestHTML(mode, res, unit) {
    var rec = res && res.rec;
    if (!rec) return '';
    return '<div class="pz-best">' +
      '<div class="pz-best-r">' + (res.newBest ? '🎉 새 개인 최고!' : '🏅 개인 최고') + ' <b>' + rec.best + unit + '</b></div>' +
      '<div class="pz-best-r">' + (res.newWeek && !res.newBest ? '🎉 이번 주 최고!' : '📅 이번 주 최고') + ' <b>' + rec.week.best + unit + '</b></div></div>';
  }

  // 끝 카드에서 이어 한 판(한 번 더, 러시 → 서바이벌)은 같은 onDone 하나로 끝난다. 앞 판의 문항 수, 정답, XP를 더해 넘겨
  // 오늘의 5분 블록 결과가 마지막 판만 세지 않게 한다(onDone이 없으면 그대로)
  function _chain(opts, prev) {
    var o = {};
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    var done = opts.onDone;
    if (typeof done !== 'function' || !prev || typeof prev !== 'object') return o;
    var pn = Math.max(0, _num(prev.n, 0)), pok = Math.max(0, _num(prev.ok, 0)), pxp = Math.max(0, _num(prev.xp, 0));
    o.onDone = function(r) {
      if (r && typeof r === 'object') {
        r.n = _num(r.n, 0) + pn; r.ok = _num(r.ok, 0) + pok; r.xp = _num(r.xp, 0) + pxp;
      }
      done(r);
    };
    return o;
  }

  // ── 3분 러시 ──────────────────────────────────────────
  function rush(opts) {
    opts = opts || {};
    if (!_ready(opts)) return _soon(opts);
    var U = _UI(), stage = _stage(opts), base = _baseRating(opts), rnd = _rng(_seed(opts)), types = pool(stage);
    var data = { st: rushInit(_now(), opts.ms), saved: null };
    var tick = null;
    function stopTick() { _stopEvery(tick); tick = null; }
    var ok = U.run({
      mode: 'rush', title: '⚡ 3분 퍼즐 러시', navParam: 'rush', total: null, rated: false, data: data,
      autoMs: 350, flashMs: 1000, endTitle: '⏱ 시간 끝!',
      next: function(i) {
        if (rushOver(data.st, _now())) return null;
        return _question(stage, rushRating(base, i), rnd, types, 'rush');
      },
      xp: function(q, okA) { return okA ? { src: 'review', amount: MODE_XP } : null; },
      feedback: function(q, okA) { return okA ? 'auto' : 'flash'; },
      onAnswer: function(q, okA) { data.st = rushAnswer(data.st, okA, _now()); },
      over: function() { return rushOver(data.st, _now()); },
      hud: function() { return rushHud(data.st, _now()); },
      onStop: stopTick,
      onEnd: function(r) {
        r.score = data.st.ok; r.combo = data.st.best;
        var md = _modes(), up = bestUpdate(md.rush, data.st.ok, _now());
        md.rush = up.rec; _save();
        data.saved = up; r.record = up.rec; r.newBest = up.newBest;
        return r;
      },
      endHTML: function(r) {
        return '<div class="pz-mode-res"><div class="pz-big"><b>' + data.st.ok + '</b><span>정답</span></div>' +
          '<div class="pz-mode-sub">최고 콤보 ' + data.st.best + ', 보너스 +' + Math.round(data.st.bonus / 1000) + '초, 벌점 -' + Math.round(data.st.penalty / 1000) + '초</div>' +
          _bestHTML('rush', data.saved, '개') + '</div>';
      },
      // 서바이벌은 따로 들어가는 곳이 없어 러시 끝 카드에서 고른다(같은 opts, 끝나면 같은 onDone)
      endActions: function() { return [{ id: 'again', label: '⚡ 한 번 더' }, { id: 'survival', label: '❤ 서바이벌(3번 틀리면 끝)' }, { id: 'done', label: '완료', primary: true }]; },
      onAction: function(id, r) {
        if (id === 'again') { rush(_chain(opts, r)); return true; }
        if (id === 'survival') { survival(_chain(opts, r)); return true; }
        return false;
      },
      onDone: opts.onDone
    });
    if (!ok) return false;
    tick = _every(function() {
      var s = U.state ? U.state() : null;
      if (!s || s.data !== data || s.ended) { stopTick(); return; }
      if (rushOver(data.st, _now())) { stopTick(); U.stop(); return; }
      U.refresh();
    }, 250);
    return true;
  }
  function rushHud(st, now) {
    var left = rushLeft(st, now), pct = Math.max(0, Math.min(100, Math.round(left / _num(st.dur, RUSH_MS) * 100)));
    var low = left <= 30000;
    var bonus = '';
    if (st.lastAt != null && now - st.lastAt < 1500 && st.last) {
      bonus = '<span class="pz-bonus ' + (st.last > 0 ? 'is-up' : 'is-down') + '">' + (st.last > 0 ? '⏫ +' : '⏬ ') + Math.round(st.last / 1000) + '초</span>';
    }
    return '<div class="pz-time' + (low ? ' is-low' : '') + '" role="timer" aria-label="남은 시간 ' + clock(left) + '">' +
      '<span class="pz-time-t">⏱ ' + clock(left) + '</span><span class="pz-time-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
      '<span class="pz-time-s">✔ ' + st.ok + '</span>' + bonus + '</div>';
  }

  // ── 서바이벌 ──────────────────────────────────────────
  function survival(opts) {
    opts = opts || {};
    if (!_ready(opts)) return _soon(opts);
    var U = _UI(), stage = _stage(opts), base = _baseRating(opts), rnd = _rng(_seed(opts)), types = pool(stage);
    var data = { st: survInit(), saved: null };
    var ok = U.run({
      mode: 'survival', title: '❤ 서바이벌', navParam: 'survival', total: null, rated: false, data: data,
      endTitle: '💔 끝! 3번 틀렸어요',
      next: function(i) {
        if (survOver(data.st)) return null;
        return _question(stage, _num(base, 1000) + SURV_STEP * i, rnd, types, 'survival');
      },
      xp: function(q, okA) { return okA ? { src: 'review', amount: MODE_XP } : null; },
      onAnswer: function(q, okA) { data.st = survAnswer(data.st, okA); },
      over: function() { return survOver(data.st); },
      hud: function() { return survHud(data.st); },
      onEnd: function(r) {
        r.score = data.st.ok;
        var md = _modes(), up = bestUpdate(md.survival, data.st.ok, _now());
        md.survival = up.rec; _save();
        data.saved = up; r.record = up.rec; r.newBest = up.newBest;
        return r;
      },
      endHTML: function(r) {
        return '<div class="pz-mode-res"><div class="pz-big"><b>' + data.st.ok + '</b><span>맞힌 문제</span></div>' +
          '<div class="pz-mode-sub">' + survReviewLine(r && r.results) + '</div>' +
          _bestHTML('survival', data.saved, '개') + '</div>';
      },
      endActions: function() { return [{ id: 'again', label: '❤ 다시 도전' }, { id: 'done', label: '완료', primary: true }]; },
      onAction: function(id, r) { if (id === 'again') { survival(_chain(opts, r)); return true; } return false; },
      onDone: opts.onDone
    });
    return !!ok;
  }
  // 끝 카드 안내: 틀린 문제 중 복습 목록에 들어간 것(키가 있는 유형)만 센다. 쇼다운처럼 매번 새로 만드는 유형은 키가 없다
  function survReviewLine(results) {
    var wrong = 0, queued = 0;
    (Array.isArray(results) ? results : []).forEach(function(x) {
      if (!x || x.ok) return;
      wrong++;
      if (x.key != null && x.key !== '') queued++;
    });
    if (!wrong) return '틀린 문제가 없어요';
    if (queued) return '틀린 ' + queued + '문제는 복습 목록에 넣었어요. 다음 오늘의 5분 복습에서 다시 나와요';
    return '틀린 문제는 매번 새로 만드는 유형이라 복습 목록에는 넣지 않았어요';
  }
  function survHud(st) {
    var hearts = '';
    // 남은 기회는 빨간 하트(이모지 표시 강제 U+FE0F), 잃은 기회는 검은 하트. 글자 표시 하트는 회색으로 보여 반대로 읽힌다
    for (var i = 0; i < SURV_LIVES; i++) hearts += (i < st.lives ? '❤️' : '🖤');
    return '<div class="pz-lives" role="status" aria-label="남은 기회 ' + st.lives + '번"><span aria-hidden="true">' + hearts + '</span>' +
      '<span class="pz-lives-t">남은 기회 ' + st.lives + '</span><span class="pz-time-s">✔ ' + st.ok + '</span></div>';
  }

  // ── 데일리 5 ──────────────────────────────────────────
  function _hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function _dailySeed(day) {
    var P = _P();
    if (P && typeof P.dailySeed === 'function') { var s = _num(_call('Puzzles', 'dailySeed', day), NaN); if (isFinite(s)) return s >>> 0; }
    return _hash(dateCode(day));
  }
  function _d5ok(q) {
    return !!q && Array.isArray(q.options) && q.options.length >= 2 && q.confidence !== 'approx' && !q.appDef && (!q.ui || q.ui === 'choice');
  }
  // Puzzles.daily5가 정본(M2-P1). 없을 때만 같은 규칙(프리플랍 2, 수학 1, 그 외 2, exact/chart, noReview, 날짜 시드)으로 직접 만든다.
  function dailyList(day, stage) {
    var P = _P(); if (!P) return [];
    var raw = null;
    if (typeof P.daily5 === 'function') {
      try { raw = P.daily5(day, stage, { noReview: true }); } catch (e) { _warn('Puzzles.daily5', e); raw = null; }
      var arr = Array.isArray(raw) ? raw : (raw && (raw.items || raw.list || raw.qs)) || [];
      return arr.filter(_d5ok).slice(0, DAILY_N);
    }
    if (typeof P.next !== 'function' || typeof P.types !== 'function') return [];
    var rnd = _rng(_dailySeed(day));
    var cand = [];
    try { cand = (P.types() || []).slice().sort(); } catch (e) { cand = []; }
    cand = cand.filter(function(t) {
      var mt = _meta(t) || {};
      if (mt.confidence === 'approx' || mt.appDef || mt.rated === false) return false;
      if (isFinite(mt.stage) && mt.stage > stage + 1) return false;
      return _usable(t);
    });
    var byG = { preflop: [], math: [], other: [] };
    cand.forEach(function(t) { var g = (_meta(t) || {}).group; (byG[g] || byG.other).push(t); });
    var slots = [];
    function take(list, n) { for (var i = 0; i < n && list.length; i++) slots.push(list[Math.floor(rnd() * list.length) % list.length]); }
    take(byG.preflop, 2); take(byG.math, 1);
    take(byG.other.length ? byG.other : cand, DAILY_N - slots.length);
    while (slots.length < DAILY_N && cand.length) take(cand, 1);
    var out = [];
    slots.forEach(function(t) {
      for (var k = 0; k < 4; k++) {
        var q = null;
        try { q = P.next(t, rnd, { stage: stage, noReview: true, daily: true }); } catch (e) { q = null; }
        if (_d5ok(q)) { out.push(q); return; }
      }
    });
    return out.slice(0, DAILY_N);
  }
  function daily5Status(now) {
    now = _num(now, _now());
    var st = _call('Journey', 'load');
    var d = st && st.daily ? st.daily[dayKey(now)] : null;
    var d5 = d && d.daily5 && typeof d.daily5 === 'object' ? d.daily5 : null;
    var done = !!(d5 && isFinite(d5.score));
    return { done: done, score: done ? Number(d5.score) : null, grades: done && Array.isArray(d5.grades) ? d5.grades.slice() : null };
  }
  function _gradeRowHTML(grades) {
    return '<div class="pz-grades" role="list" aria-label="문항별 등급">' + (grades || []).map(function(g, i) {
      var G1 = GRADE[g] || GRADE.miss;
      return '<span class="pz-g pz-g--' + (GRADE[g] ? g : 'miss') + '" role="listitem"><i aria-hidden="true">' + G1.mark + '</i>' + (i + 1) + '. ' + G1.text + '</span>';
    }).join('') + '</div>';
  }
  function _shareHTML(text) {
    return '<div class="pz-share"><div class="pz-share-msg" role="status" aria-live="polite"></div>' +
      '<textarea class="pz-share-box" readonly rows="3" aria-label="공유 텍스트, 길게 눌러 복사" hidden>' + _esc(text) + '</textarea></div>';
  }
  function daily5(opts) {
    opts = opts || {};
    var U = _UI();
    var now0 = _num(opts.now, _now()), day = dayKey(now0), stage = _stage(opts);
    var list = (U && typeof U.run === 'function') ? dailyList(day, stage) : [];
    if (!list.length) return _soon(opts);
    var status = daily5Status(now0);
    // 이미 완주한 날: 결과 카드부터(다시 풀기는 연습, 점수와 레이팅에 반영 안 함)
    if (status.done && !opts.replay) return _dailyResult(day, status, opts);
    var first = !status.done && !opts.replay;
    var md = _modes();
    if (!md.daily5 || md.daily5.day !== day) md.daily5 = { day: day, seen: [] };
    var seen = md.daily5.seen;
    var data = { grades: [], day: day, first: first, score: null, text: null };
    var ok = U.run({
      mode: 'daily5', title: '📅 데일리 5' + (first ? '' : ' (연습)'), navParam: 'daily5', total: list.length, rated: first, data: data,
      noRecord: !first,
      endTitle: first ? '📅 오늘의 데일리 5 결과' : '📅 연습 결과',
      rateable: function(q, S) { return first && seen.indexOf(S.i - 1) < 0 && (typeof U.isRated === 'function' ? U.isRated(q) : true); },
      next: function(i) {
        var src = list[i]; if (!src) return null;
        var q = {}, k;
        for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) q[k] = src[k];
        return q;
      },
      xp: function() { return null; },                // 데일리 5 XP는 완주 보상(15 + 만점 10)으로만
      feedback: function() { return 'overlay'; },     // 문항마다 즉시 한 줄 해설
      onAnswer: function(q, okA, S, info) {
        var g = grade(okA, info.near, info.ms, opts.slowMs);
        info.grade = g;
        data.grades.push(g);
        if (first && seen.indexOf(S.i - 1) < 0) { seen.push(S.i - 1); _save(); }
      },
      overlayHead: function(q, okA, S, info) {
        var g = GRADE[info && info.grade] || GRADE.miss, ans = '';
        if (!okA) {
          var o = null;
          (q.options || []).forEach(function(x) { if (x && String(x.id) === String(q.answer)) o = x; });
          ans = ', 정답은 <b>' + _esc(o ? o.label : q.answer) + '</b>';
        }
        return '<span class="pz-g pz-g--' + (info && info.grade) + '"><i aria-hidden="true">' + g.mark + '</i>' + g.text + '</span> ' +
          '<span class="pz-ov-sub">' + _esc(g.desc) + ans + '</span>';
      },
      onEnd: function(r, S) {
        var complete = !r.aborted && data.grades.length === list.length;
        r.grades = data.grades.slice();
        if (!complete) return r;
        var sc = score(data.grades);
        data.score = sc; r.score = sc;
        data.text = shareText(day, sc, data.grades);
        if (first) {
          var d = _call('Journey', 'dayRecord', now0);
          if (d && typeof d === 'object') { d.daily5 = { score: sc, grades: data.grades.slice() }; _save(); }
          var bonus = _xp('daily5', _xpConst('daily5', 15));
          if (sc === 100) bonus += _xp('daily5Perfect', _xpConst('daily5Perfect', 10));
          r.xp += bonus; S.xp += bonus;
        }
        return r;
      },
      endHTML: function(r) {
        if (data.score == null) return '';
        return '<div class="pz-mode-res"><div class="pz-big"><b>' + data.score + '</b><span>/ 100점</span></div>' +
          _gradeRowHTML(data.grades) +
          (first ? '' : '<div class="pz-mode-sub">연습 풀이는 점수와 레이팅에 남기지 않아요</div>') +
          _shareHTML(data.text) + '</div>';
      },
      endActions: function() {
        return data.text ? [{ id: 'share', label: '📋 결과 복사' }, { id: 'done', label: '완료', primary: true }] : [{ id: 'done', label: '완료', primary: true }];
      },
      onAction: function(id) { if (id === 'share' && data.text) { copy(data.text); return true; } return false; },
      onDone: opts.onDone
    });
    return !!ok;
  }
  // 이미 완주한 날의 결과 카드(문항 없음)
  function _dailyResult(day, status, opts) {
    var U = _UI(), text = shareText(day, status.score, status.grades || []);
    var ok = U.run({
      mode: 'daily5', title: '📅 데일리 5', navParam: 'daily5', total: 0, rated: false, hideStats: true,
      endTitle: '📅 오늘의 데일리 5는 끝났어요',
      next: function() { return null; },
      endHTML: function() {
        return '<div class="pz-mode-res"><div class="pz-big"><b>' + status.score + '</b><span>/ 100점</span></div>' +
          _gradeRowHTML(status.grades || []) + '<div class="pz-mode-sub">내일 새 5문제가 나와요. 다시 풀기는 연습으로만 남아요</div>' +
          _shareHTML(text) + '</div>';
      },
      endActions: function() { return [{ id: 'share', label: '📋 결과 복사' }, { id: 'replay', label: '🔁 다시 풀기(연습)' }, { id: 'done', label: '완료', primary: true }]; },
      onAction: function(id) {
        if (id === 'share') { copy(text); return true; }
        if (id === 'replay') {
          var o = {}, k;
          for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
          o.replay = true;
          daily5(o);
          return true;
        }
        return false;
      },
      onDone: opts.onDone
    });
    return !!ok;
  }

  // ── 공유 텍스트 복사 ────────────────────────────────────
  // 복사 결과는 결과 카드 안에 글로(하단 토스트는 엄지 영역 버튼을 가린다)
  function _shareMsg(msg) {
    if (_lastShare) _lastShare.msg = msg;
    if (typeof document === 'undefined' || !document || typeof document.querySelector !== 'function') return;
    var el = document.querySelector('.pz-share-msg');
    if (!el) { _toast(msg, 2400); return; }
    el.textContent = msg;
    if (el.classList) el.classList.toggle('is-warn', _lastShare && _lastShare.via === 'box');
  }
  function _showBox(text) {
    _lastShare = { text: text, via: 'box' };
    if (typeof document === 'undefined' || !document || typeof document.querySelector !== 'function') return;
    var box = document.querySelector('.pz-share-box');
    if (!box) return;
    box.value = text;
    box.hidden = false;
    if (box.removeAttribute) box.removeAttribute('hidden');
    try { box.focus(); box.select(); } catch (e) { /* 무시 */ }
    _shareMsg('자동 복사가 안 돼요. 아래 글을 길게 눌러 복사해 주세요');
  }
  function copy(text) {
    var nav = (typeof navigator !== 'undefined') ? navigator : null;
    var cb = nav && nav.clipboard && typeof nav.clipboard.writeText === 'function' ? nav.clipboard : null;
    if (!cb) { _showBox(text); return false; }
    try {
      var p = cb.writeText(text);
      var ok = function() { _lastShare = { text: text, via: 'clipboard' }; _shareMsg('✔ 결과를 복사했어요. 붙여 넣어 자랑해 보세요'); };
      if (p && typeof p.then === 'function') p.then(ok, function() { _showBox(text); });
      else ok();
    } catch (e) { _showBox(text); return false; }
    return true;
  }

  // ── 테스트 전용 ────────────────────────────────────────
  function _setEnv(env) { _env = env || {}; }
  function _reset() { _env = {}; _lastShare = null; _memModes = {}; }

  var api = {
    RUSH_MS: RUSH_MS, RUSH_BONUS: RUSH_BONUS, RUSH_PENALTY: RUSH_PENALTY, RUSH_STEP: RUSH_STEP, SURV_LIVES: SURV_LIVES,
    SLOW_MS: SLOW_MS, MODE_XP: MODE_XP, GRADES: GRADES, GRADE: GRADE,
    rush: rush, survival: survival, daily5: daily5, daily5Status: daily5Status, records: records, copy: copy, available: available,
    core: {
      rushInit: rushInit, rushAnswer: rushAnswer, rushLeft: rushLeft, rushOver: rushOver, rushBonusFor: rushBonusFor, rushRating: rushRating,
      clock: clock, survInit: survInit, survAnswer: survAnswer, survOver: survOver,
      grade: grade, score: score, shareText: shareText, dateCode: dateCode, gradeCounts: gradeCounts,
      weekKey: weekKey, bestUpdate: bestUpdate, dailyList: dailyList, pool: pool, dayKey: dayKey
    },
    _lastShare: function() { return _lastShare; }, _setEnv: _setEnv, _reset: _reset
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
