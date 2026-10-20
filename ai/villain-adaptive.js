// ai/villain-adaptive.js (채우는 그룹: M6-READ, 계약 H6)
// 적응형 빌런과 시즌 캐스트 변형(설계서 4.8절 1번, 10절 20번). 런타임 오버레이만 쓴다:
//   ai/villain.js, ai/villain-profiles.js, journey/cast.js는 고치지 않고 VillainProfiles 원본 객체도 바꾸지 않는다.
//   app.js가 GameState.applyVillainActions(state, VillainAdaptive.opts(ctx))로 부르면, 바꿀 값이 있는 빌런 차례에만
//   decide(villain, state)가 그 빌런용 오버레이 프로필(원본 깊은 복사 + 변형)을 만들어 Villain.getAction을 부른다.
//   Villain은 VillainProfiles[유형]을 읽으므로 그 한 번의 동기 호출 동안만 VillainProfiles[키]를 오버레이로 바꿔 끼우고
//   finally에서 원래 객체로 되돌린다(원본 객체는 읽기만, 키가 가리키는 객체도 호출 뒤 그대로).
//   바꿀 값이 없으면 decide는 null(엔진이 원래 경로 Villain.getAction으로 간다).
// 원래 경로(오버레이 없음): 극장 관전(state.spectator), 연습(ctx.practice), 은닉 테이블(ctx.mode 'sixmax-cast-hidden',
//   state.hideTypes, 좌석 hidden), 보스 세션(Journey.session().kind 'boss' 또는 ctx.boss). 극장은 이 경로를 쓰지 않는다.
// 시즌 변형: Seasons.season('YYYY-MM').cast = { 엔진 유형: { 프로필 필드: δ } }를 |δ| ≤ 0.1로 잘라 위 제외 말고 모든 게임에.
//   필드는 숫자 최상위 필드(fold_to_cbet, bluff_freq 등), 'cbet.dry'처럼 점 경로, { cbet: { dry } } 중첩, 그리고 아래 'threebet'.
// 적응(필드당 ±0.15): s5-boss 통과(unlocked)이고 설정 adaptive가 false가 아닐 때(A11y.load().adaptive, 기본 true).
//   히어로 최근 30일 누적(JStats.heroTotals)을 세션 시작 때 한 번 읽어 그 세션 내내 같은 값을 쓴다(주기 = 세션).
//   c벳 빈도 → 빌런 fold_to_cbet: 40~70%면 그대로, 70% 넘으면 덜 접고(최대 -0.15, 90%에서), 40% 밑이면 더 접는다(20%에서 +0.15).
//   3벳에 폴드 → 빌런 3벳(threebet): 이 앱 차트 밴드(HeroStats.bandsFromChart().f3, 없으면 60~80) 위면 3벳을 넓히고
//     (+, 밴드 위 15%p에서 +0.15), 아래면 3벳 블러프를 줄인다(-).
//   WTSD(플랍을 본 핸드 중 쇼다운까지 간 비율) → 빌런 bluff_freq: 24~34%면 그대로, 높으면(콜을 많이 함) 블러프를 줄이고
//     (50%에서 -0.15), 낮으면(잘 접음) 늘린다(10%에서 +0.15).
//   기회 수가 신뢰 임계(HeroStats.confidence가 'gray', c벳과 WTSD 30, 3벳에 폴드 20) 미만이면 그 필드는 바꾸지 않는다.
//   'threebet' δ는 확률이다: δ > 0이면 오픈을 맞아 콜하려던 손(그 자리 call_vs_raise)을 δ 확률로 3벳으로,
//     δ < 0이면 4벳 레인지 밖 3벳 손(블러프 3벳)을 |δ| 확률로 콜로 바꾼다. 3벳 크기는 엔진과 같다(IP 3배, 블라인드 3.5배).
// API: unlocked(), enabled(), excluded(ctx) → 사유|null, opts(ctx) → { decide }|null, plan(ctx), summaryLine(sessionId) → 한 줄|'',
//   lean(totals, bands) → 적응 δ(순수), seasonDeltas(now), overlay(base, fields) → 새 프로필(순수), CAP, SEASON_CAP.
//   테스트 주입: _setRng(fn), _setNow(fn), _reset().
// 규약: 로드 시 DOM, window, localStorage 접근 없음. 다른 모듈은 전부 typeof 가드.
var VillainAdaptive = (function() {
  var CAP = 0.15;            // 적응 필드당 상한
  var SEASON_CAP = 0.1;      // 시즌 변형 상한
  var DAYS = 30;             // 히어로 누적 기간
  var MIXED_MAP = { preflop: 'TAG', flop: 'LAG', turn: 'TAG', river: 'Fish' };
  var ZONE = { cbet: [40, 70], wtsd: [24, 34] };
  var FULL = { cbetHi: 20, cbetLo: 20, f3: 15, wtsdHi: 16, wtsdLo: 14 };   // 이만큼(%p) 벗어나면 상한
  var MIN_OPP = { cbet: 30, f3: 20, wtsd: 30 };
  var ADAPT_FIELDS = ['fold_to_cbet', 'threebet', 'bluff_freq'];
  var FIELD_KOR = { fold_to_cbet: 'c벳에 접기', bluff_freq: '블러프', threebet: '3벳', 'cbet.dry': '드라이 보드 c벳', 'cbet.wet': '웨트 보드 c벳',
    'bet_sizing.value': '밸류벳 크기', 'bet_sizing.bluff': '블러프 크기', noise: '변덕' };

  var _rnd = null, _nowFn = null;
  var _cur = null;           // 세션 계획 { sid, at, season, adapt, used, usedSeason, usedAdapt, names }
  var _ovCache = {};

  function _now() { return _nowFn ? _nowFn() : Date.now(); }
  function _r() { return (_rnd || Math.random)(); }
  function _num(x, d) { x = Number(x); return isFinite(x) ? x : d; }
  function _clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function _r2(x) { return Math.round(x * 100) / 100; }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _warn(e) { try { if (typeof console !== 'undefined' && console.warn) console.warn('[VillainAdaptive]', e && e.message ? e.message : e); } catch (x) {} }
  function _monthKey(ms) { var d = new Date(ms); var m = d.getMonth() + 1; return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m; }

  // ── 해금과 설정 ──
  function unlocked() {
    try { return typeof Journey !== 'undefined' && !!Journey && typeof Journey.nodeStatus === 'function' && Journey.nodeStatus('s5-boss') === 'passed'; }
    catch (e) { return false; }
  }
  function _settingOn() {
    try {
      if (typeof A11y === 'undefined' || !A11y || typeof A11y.load !== 'function') return true;
      var s = A11y.load();
      return !(s && s.adaptive === false);
    } catch (e) { return true; }
  }
  function enabled() { return unlocked() && _settingOn(); }

  // ── 제외(원래 경로) ──
  function excluded(ctx) {
    ctx = ctx || {};
    var st = ctx.state || {};
    if (st.spectator) return 'theater';
    if (ctx.practice) return 'practice';
    if (ctx.mode === 'sixmax-cast-hidden' || st.hideTypes) return 'hidden';
    var pl = st.players || {};
    for (var n in pl) if (Object.prototype.hasOwnProperty.call(pl, n) && pl[n] && pl[n].hidden) return 'hidden';
    if (ctx.boss) return 'boss';
    try {
      if (typeof Journey !== 'undefined' && Journey && typeof Journey.session === 'function') {
        var s = Journey.session();
        if (s && s.kind === 'boss') return 'boss';
      }
    } catch (e) { /* 세션 정보 없음 = 보스 아님 */ }
    return null;
  }

  // ── 적응 δ(순수) ──
  // totals = JStats.heroTotals 모양, bands = HeroStats.bandsFromChart 모양(f3만 쓴다). 반환 { fold_to_cbet, threebet, bluff_freq, why }
  function _conf(opp, metric, min) {
    if (typeof HeroStats !== 'undefined' && HeroStats && typeof HeroStats.confidence === 'function') {
      try { return HeroStats.confidence(opp, metric) !== 'gray'; } catch (e) { /* 아래 */ }
    }
    return opp >= min;
  }
  function lean(totals, bands) {
    var t = totals || {};
    var out = { fold_to_cbet: 0, threebet: 0, bluff_freq: 0, why: {} };
    var cOpp = _num(t.cbetOpp, 0), fOpp = _num(t.f3Opp, 0), wOpp = _num(t.wtsdOpp, 0);
    if (cOpp > 0 && cOpp >= MIN_OPP.cbet && _conf(cOpp, 'cbet', MIN_OPP.cbet)) {
      var c = _num(t.cbet, 0) / cOpp * 100;
      if (c > ZONE.cbet[1]) out.fold_to_cbet = -Math.min(CAP, (c - ZONE.cbet[1]) / FULL.cbetHi * CAP);
      else if (c < ZONE.cbet[0]) out.fold_to_cbet = Math.min(CAP, (ZONE.cbet[0] - c) / FULL.cbetLo * CAP);
      out.why.cbet = { pct: Math.round(c), opp: cOpp };
    }
    if (fOpp > 0 && fOpp >= MIN_OPP.f3 && _conf(fOpp, 'f3', MIN_OPP.f3)) {
      var f = _num(t.f3, 0) / fOpp * 100;
      var b = (bands && bands.f3 && isFinite(bands.f3.lo) && isFinite(bands.f3.hi)) ? bands.f3 : { lo: 60, hi: 80 };
      if (f > b.hi) out.threebet = Math.min(CAP, (f - b.hi) / FULL.f3 * CAP);
      else if (f < b.lo) out.threebet = -Math.min(CAP, (b.lo - f) / FULL.f3 * CAP);
      out.why.f3 = { pct: Math.round(f), opp: fOpp, lo: b.lo, hi: b.hi };
    }
    if (wOpp > 0 && wOpp >= MIN_OPP.wtsd && _conf(wOpp, 'wtsd', MIN_OPP.wtsd)) {
      var w = _num(t.wtsd, 0) / wOpp * 100;
      if (w > ZONE.wtsd[1]) out.bluff_freq = -Math.min(CAP, (w - ZONE.wtsd[1]) / FULL.wtsdHi * CAP);
      else if (w < ZONE.wtsd[0]) out.bluff_freq = Math.min(CAP, (ZONE.wtsd[0] - w) / FULL.wtsdLo * CAP);
      out.why.wtsd = { pct: Math.round(w), opp: wOpp };
    }
    ADAPT_FIELDS.forEach(function(k) { out[k] = _r2(_clamp(out[k], -CAP, CAP)); if (out[k] === 0) out[k] = 0; });
    return out;
  }
  function _adaptNow(now) {
    if (typeof JStats === 'undefined' || !JStats || typeof JStats.heroTotals !== 'function') return null;
    var totals = null, bands = null;
    try { totals = JStats.heroTotals(DAYS, now); } catch (e) { _warn(e); return null; }
    try { if (typeof HeroStats !== 'undefined' && HeroStats && typeof HeroStats.bandsFromChart === 'function') bands = HeroStats.bandsFromChart(); } catch (e) { bands = null; }
    var l = lean(totals, bands);
    return (l.fold_to_cbet || l.threebet || l.bluff_freq) ? l : null;
  }

  // ── 시즌 δ ──
  // Seasons.season(월).cast → { 유형: { 경로: δ } }(경로는 점 표기로 평탄화, |δ| ≤ 0.1). 없거나 비면 null
  function _flatten(obj, prefix, out) {
    Object.keys(obj || {}).forEach(function(k) {
      var v = obj[k], path = prefix ? prefix + '.' + k : k;
      if (_isObj(v)) _flatten(v, path, out);
      else if (typeof v === 'number' && isFinite(v) && v !== 0) out[path] = _r2(_clamp(v, -SEASON_CAP, SEASON_CAP));
    });
    return out;
  }
  function seasonDeltas(now) {
    if (typeof Seasons === 'undefined' || !Seasons || typeof Seasons.season !== 'function') return null;
    var s = null;
    try { s = Seasons.season(_monthKey(now == null ? _now() : now)); } catch (e) { _warn(e); return null; }
    if (!s || !_isObj(s.cast)) return null;
    var types = {}, any = false;
    Object.keys(s.cast).forEach(function(t) {
      if (!_isObj(s.cast[t])) return;
      var f = _flatten(s.cast[t], '', {});
      if (Object.keys(f).length) { types[t] = f; any = true; }
    });
    return any ? { key: s.key || _monthKey(now == null ? _now() : now), title: typeof s.title === 'string' ? s.title : '', types: types } : null;
  }

  // ── 오버레이(순수) ──
  function _range(path) { return path.indexOf('bet_sizing') === 0 ? [0.1, 3] : [0, 1]; }
  // base 깊은 복사에 fields{경로: δ}를 더한다(숫자 필드만, 범위 안으로). 'threebet'처럼 프로필에 없는 경로는 무시
  function overlay(base, fields) {
    var p = JSON.parse(JSON.stringify(base || {}));
    Object.keys(fields || {}).forEach(function(path) {
      var d = Number(fields[path]);
      if (!isFinite(d) || !d) return;
      var parts = path.split('.'), o = p;
      for (var i = 0; i < parts.length - 1; i++) { o = o && _isObj(o[parts[i]]) ? o[parts[i]] : null; if (!o) return; }
      var k = parts[parts.length - 1];
      if (!o || typeof o[k] !== 'number' || !isFinite(o[k])) return;
      var rg = _range(path);
      o[k] = _r2(_clamp(o[k] + d, rg[0], rg[1]));
    });
    return p;
  }

  // 그 빌런 유형에 걸 δ: 시즌(그 유형) + 적응(모두 같게). { fields, threebet, season, adapt }
  function _deltasFor(type) {
    var p = _cur, fields = {}, tb = 0, season = false, adapt = false;
    if (!p) return null;
    var sd = p.season && p.season.types && p.season.types[type];
    if (sd) Object.keys(sd).forEach(function(k) {
      if (k === 'threebet') tb += sd[k]; else fields[k] = (fields[k] || 0) + sd[k];
      season = true;
    });
    if (p.adapt) {
      if (p.adapt.fold_to_cbet) { fields.fold_to_cbet = (fields.fold_to_cbet || 0) + p.adapt.fold_to_cbet; adapt = true; }
      if (p.adapt.bluff_freq) { fields.bluff_freq = (fields.bluff_freq || 0) + p.adapt.bluff_freq; adapt = true; }
      if (p.adapt.threebet) { tb += p.adapt.threebet; adapt = true; }
    }
    if (!season && !adapt) return null;
    return { fields: fields, threebet: _clamp(tb, -(CAP + SEASON_CAP), CAP + SEASON_CAP), season: season, adapt: adapt };
  }

  // ── 세션 계획 ──
  function plan(ctx) {
    ctx = ctx || {};
    var sid = ctx.sessionId == null ? null : ctx.sessionId;
    if (_cur && _cur.sid === sid) return _cur;
    var now = _now();
    _cur = { sid: sid, at: now, season: seasonDeltas(now), adapt: enabled() ? _adaptNow(now) : null,
      used: 0, usedSeason: 0, usedAdapt: 0, names: [] };
    _ovCache = {};
    return _cur;
  }

  // ── 결정 ──
  var _setCache = {};
  function _inR(h, str) {
    if (!str || !h || h.length < 2 || typeof Range === 'undefined') return false;
    var set = _setCache[str] || (_setCache[str] = Range.parse(str));
    return set.has(Range.handClass(h[0], h[1]));
  }
  function _phrase(prof, key) {
    var arr = (prof && prof.phrases && prof.phrases[key]) || null;
    return arr && arr.length ? arr[Math.floor(_r() * arr.length) % arr.length] : '...';
  }
  // 프리플랍 오픈 직면(레이즈 1번)에서 3벳 빈도 조정. prof = 이번에 쓴 프로필(오버레이)
  function _threebet(r, villain, s, prof, d) {
    if (!d || !r || s.street !== 'preflop' || (s.streetBetCount || 0) !== 1) return r;
    var name = villain.name, pos = villain.pos, h = villain.holeCards;
    var have = (s.playerBets && s.playerBets[name]) || 0, stack = (s.stacks && s.stacks[name]) || 0;
    var toCall = Math.max(0, (s.currentBet || 0) - have);
    if (toCall <= 0 || stack <= 0) return r;
    if (d > 0 && r.action === 'call' && _inR(h, (prof.call_vs_raise || {})[pos]) && _r() < d) {
      var maxTo = have + stack, mul = (pos === 'SB' || pos === 'BB') ? 3.5 : 3;
      var to = Math.min(maxTo, Math.round(s.currentBet * mul * 2) / 2);
      if (to >= 0.4 * maxTo) to = maxTo;   // 엔진 jamOr와 같다
      return { action: '3bet', amount: to, phrase: _phrase(prof, '3bet'), label: '3벳' };
    }
    if (d < 0 && r.action === '3bet' && !_inR(h, prof.fourbet) && _r() < -d) {
      return { action: 'call', amount: Math.min(toCall, stack), phrase: _phrase(prof, 'call') };
    }
    return r;
  }
  function _decide(villain, s) {
    if (!villain || !s || typeof Villain === 'undefined' || typeof VillainProfiles === 'undefined') return null;
    var T = villain.type;
    var d = _deltasFor(T);
    if (!d) return null;
    var key = T === 'Mixed' ? (MIXED_MAP[s.street] || 'TAG') : T;
    var base = VillainProfiles[key];
    if (!base) return null;
    var ck = T + '>' + key;
    var ov = _ovCache[ck] || (_ovCache[ck] = overlay(base, d.fields));
    var orig = VillainProfiles[key], r;
    VillainProfiles[key] = ov;
    try { r = Villain.getAction(villain, s); }
    finally { VillainProfiles[key] = orig; }
    r = _threebet(r, villain, s, ov, d.threebet);
    var p = _cur;
    if (p) {
      p.used++;
      if (d.season) p.usedSeason++;
      if (d.adapt) p.usedAdapt++;
      if (villain.name && p.names.indexOf(villain.name) < 0) p.names.push(villain.name);
    }
    return r;
  }

  // app.js: GameState.applyVillainActions(state, VillainAdaptive.opts({ state, mode, practice, sessionId }) || undefined)
  function opts(ctx) {
    try {
      if (excluded(ctx)) return null;
      var p = plan(ctx);
      if (!p.season && !p.adapt) return null;
      return { decide: _decide };
    } catch (e) { _warn(e); return null; }
  }

  // ── 세션 요약 한 줄(정보형) ──
  function _jong(w) {
    var s = String(w || ''), c = s.charCodeAt(s.length - 1);
    return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0;
  }
  function _ga(w) { return w + (_jong(w) ? '이' : '가'); }
  function summaryLine(sessionId) {
    var p = _cur;
    if (!p || p.sid !== sessionId || !p.used) return '';
    var parts = [];
    var a = p.adapt;
    if (a && p.usedAdapt) {
      var who = p.names.length === 1 ? _ga(p.names[0]) : '상대들이';
      // [이어 쓰는 꼴, 끝맺는 꼴, 근거]
      var bits = [];
      if (a.fold_to_cbet < 0) bits.push(['c벳에 덜 접고', 'c벳에 덜 접어요', '내 c벳 ' + a.why.cbet.pct + '%']);
      else if (a.fold_to_cbet > 0) bits.push(['c벳에 더 잘 접고', 'c벳에 더 잘 접어요', '내 c벳 ' + a.why.cbet.pct + '%']);
      if (a.threebet > 0) bits.push(['3벳을 더 하고', '3벳을 더 해요', '내 3벳에 폴드 ' + a.why.f3.pct + '%']);
      else if (a.threebet < 0) bits.push(['3벳 블러프를 덜 하고', '3벳 블러프를 덜 해요', '내 3벳에 폴드 ' + a.why.f3.pct + '%']);
      if (a.bluff_freq < 0) bits.push(['블러프를 덜 하고', '블러프를 덜 해요', '내 쇼다운 비율 ' + a.why.wtsd.pct + '%']);
      else if (a.bluff_freq > 0) bits.push(['블러프를 더 하고', '블러프를 더 해요', '내 쇼다운 비율 ' + a.why.wtsd.pct + '%']);
      if (bits.length) {
        var txt = bits.map(function(b, i) { return (i === bits.length - 1 ? b[1] : b[0]) + '(' + b[2] + ')'; }).join(', ');
        parts.push('🧠 ' + who + ' 내 성향을 읽고 ' + txt + '. ⚙ 설정에서 끌 수 있어요');
      }
    }
    if (p.season && p.usedSeason) {
      var t = p.season.title ? '\'' + p.season.title + '\'' : '이번 달';
      parts.push('📅 시즌 ' + t + ' 변형이 상대 성향에 반영돼 있어요');
    }
    return parts.join(' | ');
  }

  function _reset() { _cur = null; _ovCache = {}; }
  function _setRng(fn) { _rnd = typeof fn === 'function' ? fn : null; }
  function _setNow(fn) { _nowFn = typeof fn === 'function' ? fn : null; _cur = null; }
  function _plan() { return _cur; }

  var api = {
    CAP: CAP, SEASON_CAP: SEASON_CAP, DAYS: DAYS, ZONE: ZONE, MIN_OPP: MIN_OPP, ADAPT_FIELDS: ADAPT_FIELDS, FIELD_KOR: FIELD_KOR,
    unlocked: unlocked, enabled: enabled, excluded: excluded, opts: opts, plan: plan, summaryLine: summaryLine,
    lean: lean, seasonDeltas: seasonDeltas, overlay: overlay,
    _decide: _decide, _reset: _reset, _setRng: _setRng, _setNow: _setNow, _plan: _plan
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
