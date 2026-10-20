// journey/rating.js (채우는 패키지: M2-P1)
// 퍼즐 레이팅(설계서 4.5절, 계약 C7). Glicko-2(Glickman, glicko2.pdf) 순수 계산 + 레이팅 기간 관리.
//   update(player{r, rd, vol}, results[{r, rd, s} | {pr, prd, s}], opts{tau}) -> {r, rd, vol}  순수, 입력 불변
//     경기가 없는 기간은 phi* = sqrt(phi^2 + sigma^2)만 적용(r, vol 그대로).
//   current() -> {r, rd, vol, n}
//   label(rating?) -> '1000?' (RD가 100을 넘으면 잠정 표시 '?')
//   record(q, ok, now, opts) -> bool: 첫 시도이고 Puzzles.isRated(q)일 때만 pending에 {pr, prd:50, s}를 넣는다.
//     재도전, 같은 핸드 연습, 2번째 이후 시도, 복습(q.review, Puzzles.fromKey가 붙인다)은 넣지 않는다.
//   commit(now) -> {r, rd, delta, n, changed}: 세트 1회 = 레이팅 기간 1회. pending이 비면 아무것도 바꾸지 않는다.
// 저장 위치는 poker_journey.rating(Journey.load/save, typeof 가드). Journey가 없으면 메모리 상태로 돈다.
// 로드 시 DOM, window, localStorage 접근 없음.
var Rating = (function() {
  var SCALE = 173.7178;
  var TAU = 0.5;
  var EPS = 1e-6;
  var ITEM_RD = 50;               // 퍼즐 문항의 RD(설계값 레이팅 고정)
  var PROVISIONAL_RD = 100;       // 이 값을 넘으면 '1000?'처럼 잠정 표시
  var MAX_RD = 350;
  var R_MIN = 100, R_MAX = 3000;  // 저장 값 안전 범위(update 자체는 순수 그대로, commit만 가둔다)
  var DEF = { r: 1000, rd: 350, vol: 0.06 };
  var PENDING_CAP = 60;           // 세트를 끝내지 않고 쌓인 pending 상한(오래된 것부터 버림)
  var HISTORY_CAP = 400;          // 하루 1줄(같은 날은 마지막 값으로 덮음), 1년 넘게 보관

  var _src = null;                // 테스트 주입: null = 전역 Journey, false = 메모리 전용, 객체 = {load, save}
  var _mem = null;

  function _num(x, d) { x = Number(x); return isFinite(x) ? x : d; }
  function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function _now(now) { return (typeof now === 'number' && isFinite(now)) ? now : Date.now(); }
  function _warn(e) { try { if (typeof console !== 'undefined' && console.warn) console.warn('[Rating]', (e && e.message) || e); } catch (x) {} }

  // ── Glicko-2 순수 계산(논문 단계 2~8) ─────────────────
  function _g(phi) { return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI)); }
  function _E(mu, muj, phij) { return 1 / (1 + Math.exp(-_g(phij) * (mu - muj))); }

  // 단계 5: Illinois 알고리즘으로 새 변동성 sigma'
  function _volatility(phi, sigma, delta, v, tau) {
    var a = Math.log(sigma * sigma);
    var d2 = delta * delta, p2 = phi * phi;
    function f(x) {
      var ex = Math.exp(x);
      var den = p2 + v + ex;
      return ex * (d2 - p2 - v - ex) / (2 * den * den) - (x - a) / (tau * tau);
    }
    var A = a, B, k;
    if (d2 > p2 + v) B = Math.log(d2 - p2 - v);
    else {
      k = 1;
      while (f(a - k * tau) < 0 && k < 1000) k++;
      B = a - k * tau;
    }
    var fA = f(A), fB = f(B), guard = 0;
    while (Math.abs(B - A) > EPS && guard++ < 200) {
      var C = A + (A - B) * fA / (fB - fA);
      var fC = f(C);
      if (fC * fB <= 0) { A = B; fA = fB; }
      else fA = fA / 2;
      B = C; fB = fC;
    }
    var out = Math.exp(A / 2);
    return isFinite(out) && out > 0 ? out : sigma;
  }

  function _results(results) {
    var out = [];
    (Array.isArray(results) ? results : []).forEach(function(x) {
      if (!x || typeof x !== 'object') return;
      var r = _num(x.r != null ? x.r : x.pr, NaN), rd = _num(x.rd != null ? x.rd : x.prd, NaN), s = _num(x.s, NaN);
      if (!isFinite(r) || !isFinite(rd) || rd <= 0 || !isFinite(s) || s < 0 || s > 1) return;
      out.push({ r: r, rd: rd, s: s });
    });
    return out;
  }

  function update(player, results, opts) {
    player = player || {};
    var tau = _num(opts && opts.tau, TAU);
    var r = _num(player.r, DEF.r), rd = _num(player.rd, DEF.rd), sigma = _num(player.vol, DEF.vol);
    if (rd <= 0) rd = DEF.rd;
    if (sigma <= 0) sigma = DEF.vol;
    var mu = (r - 1500) / SCALE, phi = rd / SCALE;
    var games = _results(results);
    if (!games.length) {
      // 경기가 없는 기간: 레이팅과 변동성은 그대로, 편차만 커진다
      var phiStar0 = Math.sqrt(phi * phi + sigma * sigma);
      return { r: r, rd: phiStar0 * SCALE, vol: sigma };
    }
    var vInv = 0, sum = 0;
    games.forEach(function(gm) {
      var muj = (gm.r - 1500) / SCALE, phij = gm.rd / SCALE;
      var g = _g(phij), E = _E(mu, muj, phij);
      vInv += g * g * E * (1 - E);
      sum += g * (gm.s - E);
    });
    var v = 1 / vInv;
    var delta = v * sum;
    var sigmaP = _volatility(phi, sigma, delta, v, tau);
    var phiStar = Math.sqrt(phi * phi + sigmaP * sigmaP);
    var phiP = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    var muP = mu + phiP * phiP * sum;
    return { r: SCALE * muP + 1500, rd: SCALE * phiP, vol: sigmaP };
  }

  // ── 저장(poker_journey.rating) ───────────────────────
  function _J() {
    if (_src === false) return null;
    if (_src && typeof _src.load === 'function') return _src;
    if (typeof Journey !== 'undefined' && Journey && typeof Journey.load === 'function') return Journey;
    return null;
  }
  function _base() {
    var s1 = (typeof JOURNEY_STAGES !== 'undefined' && JOURNEY_STAGES && JOURNEY_STAGES[0]) || null;
    return (s1 && typeof s1.baseRating === 'number') ? s1.baseRating : DEF.r;
  }
  function _fix(rt) {
    if (!_isObj(rt)) rt = {};
    rt.r = _num(rt.r, _base());
    rt.rd = _num(rt.rd, DEF.rd); if (rt.rd <= 0) rt.rd = DEF.rd;
    rt.vol = _num(rt.vol, DEF.vol); if (rt.vol <= 0) rt.vol = DEF.vol;
    rt.n = Math.max(0, Math.floor(_num(rt.n, 0)));
    if (!Array.isArray(rt.pending)) rt.pending = [];
    if (!Array.isArray(rt.history)) rt.history = [];
    return rt;
  }
  // { st, rt, J }: st는 저장 대상 객체(Journey 상태 또는 메모리), rt = st.rating
  function _ctx() {
    var J = _J();
    if (J) {
      try {
        var st = J.load();
        if (_isObj(st)) { st.rating = _fix(st.rating); return { st: st, rt: st.rating, J: J }; }
      } catch (e) { _warn(e); }
    }
    if (!_mem) _mem = { rating: _fix(null) };
    _mem.rating = _fix(_mem.rating);
    return { st: _mem, rt: _mem.rating, J: null };
  }
  function _save(c) {
    if (c.J && typeof c.J.save === 'function') { try { c.J.save(c.st); } catch (e) { _warn(e); } }
  }
  function _dayKey(now) {
    if (typeof Journey !== 'undefined' && Journey && typeof Journey.dayKey === 'function') {
      try { return Journey.dayKey(now); } catch (e) { /* 아래 자체 계산 */ }
    }
    var t = new Date(now), m = t.getMonth() + 1, d = t.getDate();
    return t.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function current() {
    var rt = _ctx().rt;
    return { r: rt.r, rd: rt.rd, vol: rt.vol, n: rt.n };
  }

  function label(rating) {
    var x = _isObj(rating) ? rating : current();
    var r = Math.round(_num(x.r, _base())), rd = _num(x.rd, DEF.rd);
    return String(r) + (rd > PROVISIONAL_RD ? '?' : '');
  }

  // ── 문항 기록 ────────────────────────────────────────
  function _isRated(q) {
    if (typeof Puzzles !== 'undefined' && Puzzles && typeof Puzzles.isRated === 'function') {
      try { return !!Puzzles.isRated(q); } catch (e) { return false; }
    }
    return !!q && q.rated === true && !q.appDef && (q.confidence === 'exact' || q.confidence === 'chart');
  }
  // 같은 기간 안에서 같은 문항을 두 번 넣지 않기 위한 짧은 서명(FNV-1a).
  // once 유형(key null)은 지문이 같아도(예: '누가 이길까요?') 장면과 원자료가 다르면 다른 문항이라 둘 다 서명에 넣는다.
  function _sig(q) {
    var parts = [q.type, q.key == null ? '' : q.key, q.prompt == null ? '' : q.prompt, q.answer == null ? '' : q.answer];
    if (q.key == null) {
      try { parts.push(JSON.stringify(q.scene == null ? null : q.scene), JSON.stringify(q.data == null ? null : q.data)); } catch (e) { /* 순환 등은 무시 */ }
    }
    var s = parts.join('\u0001');
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  function _itemRating(q) {
    var d = _num(q.difficulty, NaN);
    if (isFinite(d)) return d;
    var m = (typeof Puzzles !== 'undefined' && Puzzles && typeof Puzzles.meta === 'function') ? Puzzles.meta(q.type) : null;
    return _num(m && m.base, DEF.r);
  }

  function record(q, ok, now, opts) {
    if (!q || typeof q !== 'object' || !_isRated(q)) return false;
    // 첫 시도만: 같은 문항 재도전, 같은 핸드 연습, 2번째 이후 시도, 복습(SRS로 다시 낸 문항, q.review)은 제외
    if (q.retry === true || q.practice === true || q.review === true || _num(q.attempt, 1) > 1) return false;
    if (opts && (opts.retry === true || opts.practice === true || opts.review === true || _num(opts.attempt, 1) > 1)) return false;
    var c = _ctx(), sig = _sig(q);
    for (var i = 0; i < c.rt.pending.length; i++) if (c.rt.pending[i] && c.rt.pending[i].q === sig) return false;
    c.rt.pending.push({ pr: _itemRating(q), prd: ITEM_RD, s: ok ? 1 : 0, t: String(q.type), q: sig, at: _now(now) });
    if (c.rt.pending.length > PENDING_CAP) c.rt.pending.splice(0, c.rt.pending.length - PENDING_CAP);
    _save(c);
    return true;
  }

  function commit(now) {
    now = _now(now);
    var c = _ctx(), rt = c.rt;
    var games = _results(rt.pending);
    if (!games.length) {
      if (rt.pending.length) { rt.pending = []; _save(c); }
      return { r: rt.r, rd: rt.rd, delta: 0, n: rt.n, changed: false };
    }
    var res = update({ r: rt.r, rd: rt.rd, vol: rt.vol }, games);
    var before = rt.r;
    rt.r = Math.max(R_MIN, Math.min(R_MAX, res.r));
    rt.rd = Math.min(MAX_RD, res.rd);
    rt.vol = res.vol;
    rt.n += games.length;
    rt.pending = [];
    var day = _dayKey(now), row = { day: day, r: Math.round(rt.r), rd: Math.round(rt.rd) };
    var last = rt.history[rt.history.length - 1];
    if (last && last.day === day) rt.history[rt.history.length - 1] = row;
    else rt.history.push(row);
    if (rt.history.length > HISTORY_CAP) rt.history.splice(0, rt.history.length - HISTORY_CAP);
    _save(c);
    return { r: rt.r, rd: rt.rd, delta: rt.r - before, n: rt.n, changed: true };
  }

  function pending() { return _ctx().rt.pending.length; }

  // ── 테스트 주입 ─────────────────────────────────────
  // s = null(전역 Journey) | false(메모리 전용) | {load, save}
  function _setSource(s) { _src = (s === false) ? false : (s && typeof s.load === 'function' ? s : null); }
  function _resetMemory() { _mem = null; }

  var api = {
    TAU: TAU, EPS: EPS, SCALE: SCALE, ITEM_RD: ITEM_RD, PROVISIONAL_RD: PROVISIONAL_RD,
    update: update, current: current, label: label, record: record, commit: commit, pending: pending,
    _setSource: _setSource, _resetMemory: _resetMemory
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
