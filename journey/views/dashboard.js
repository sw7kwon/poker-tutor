// journey/views/dashboard.js (채우는 패키지: M5-P6, 그룹 M5-HUD)
// 📊 내 실력(DashboardView, 설계서 5.7절, 계약 F8): JourneyUI.view('dashboard', params)가 open(params, el)로 연다(빠른 줄 📊).
// 탭 3개
//   실력: 결정 정확도 주간 꺾은선 12주(코치 초록 비율), 퍼즐 레이팅 추세, 개념별 정확도 막대(7/30/90일), 거울 HUD(HeroStats.mirror,
//         이 앱 차트 기준 밴드와 신뢰도), 운 미터 기록(HeroStats.luckSummary와 카드), EV 손실 추세('근사' 라벨, 승급 기준 아님),
//         띵킹 일치율과 속마음 적중률 추세(데이터가 있을 때만).
//         이상해요 표시한 레슨 목록(설계서 8.3절 4번, poker_journey.flags가 있을 때만).
//   습관: 활동 달력 90일, 스트릭(현재, 최장, 프리즈), 데일리 목표(최근 7일), 월별 XP(6개월).
//   수집(M6-COLLECT): 배지 수, 명장면 카드 수, 도감 열린 쪽, 외형 열린 수 요약(CollectionView.summary)과 '🗂 수집 열기'
//         (JourneyUI.view('collection')). 수집 화면 자체는 journey/views/collection.js.
//   하단: 💾 기록 백업(BackupUI.open).
// 구조: collect(now)가 JStats, Journey, Rating, HeroStats에서 평범한 객체(input)를 모으고, 순수 함수 weeksFrom, conceptsFrom,
//   skillModel, habitModel이 화면 모델을, lineSVG, html이 문자열을 만든다(tests/j-dashboard.test.js). 그림은 인라인 SVG와 HTML만.
// 운 미터 카드가 화면에 보이면 HeroStats.watchLuckViews로 열람 기록(계약 F1, s4-10 미션 '운 미터 카드 3회 열람').
// 클래스는 css/dashboard.css의 db- 접두와 journey.css 공용(j-sub, j-sub-top, j-back, j-card, j-pick, j-btn). 로드 시 DOM 접근 없음.
var DashboardView = (function() {
  var DAY_MS = 86400000;
  var WEEKS = 12;
  var WINDOWS = [7, 30, 90];
  var CONCEPTS = ['rfi', 'vs_rfi', 'blind_defense', 'vs_3bet', 'pot_odds', 'draws', 'cbet', 'value_bluff', 'board_texture', 'turn_river', 'actions'];
  var CONCEPT_LABEL = { rfi: '오픈', vs_rfi: '상대 오픈 대응', blind_defense: '블라인드 방어', vs_3bet: '3벳 대응', pot_odds: '팟 오즈',
    draws: '드로우', cbet: 'c벳', value_bluff: '밸류와 블러프', board_texture: '보드 텍스처', turn_river: '턴, 리버', actions: '액션 기본' };
  var TABS = [['skill', '📈 실력'], ['habit', '🔥 습관'], ['collect', '🗂 수집']];
  var FEW = 10;                       // 개념 막대: 결정 10개 미만은 '표본 적음'
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var COLOR = { line: '#58a6ff', grid: '#30363d', text: '#8b949e', ink: '#c9d1d9', surface: '#11161d' };

  var _el = null, _tab = 'skill', _days = 30, _open = {}, _input = null;

  // ── 작은 도구 ──
  function _n(x) { var v = Number(x); return isFinite(v) ? v : 0; }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _r1(x) { return Math.round(x * 10) / 10; }
  function _r2(x) { return Math.round(x * 100) / 100; }
  function _pct(g, n) { return n ? _r1(g / n * 100) : null; }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function _2(n) { return (n < 10 ? '0' : '') + n; }
  function _localKey(now) {
    var d = new Date(typeof now === 'number' ? now : Date.now());
    return d.getFullYear() + '-' + _2(d.getMonth() + 1) + '-' + _2(d.getDate());
  }
  function _idx(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS) : null;
  }
  function _key(i) { var d = new Date(i * DAY_MS); return d.getUTCFullYear() + '-' + _2(d.getUTCMonth() + 1) + '-' + _2(d.getUTCDate()); }
  function _dow(i) { return new Date(i * DAY_MS).getUTCDay(); }
  function _monday(i) { return i - ((_dow(i) + 6) % 7); }
  function _md(i) { var d = new Date(i * DAY_MS); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); }
  // ISO 주 키(월요일 일 번호에서). JStats.weekKey와 같은 규칙
  function _weekKeyOfMonday(mon) {
    var t = new Date((mon + 3) * DAY_MS);                  // 그 주 목요일
    var y = t.getUTCFullYear();
    var wk = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY_MS + 1) / 7);
    return y + '-W' + _2(wk);
  }
  function _m(name) {
    if (name === 'JStats') return (typeof JStats !== 'undefined' && JStats) ? JStats : null;
    if (name === 'Journey') return (typeof Journey !== 'undefined' && Journey) ? Journey : null;
    if (name === 'Rating') return (typeof Rating !== 'undefined' && Rating) ? Rating : null;
    if (name === 'HeroStats') return (typeof HeroStats !== 'undefined' && HeroStats) ? HeroStats : null;
    if (name === 'JourneyUI') return (typeof JourneyUI !== 'undefined' && JourneyUI) ? JourneyUI : null;
    if (name === 'BackupUI') return (typeof BackupUI !== 'undefined' && BackupUI) ? BackupUI : null;
    if (name === 'CollectionView') return (typeof CollectionView !== 'undefined' && CollectionView) ? CollectionView : null;
    return null;
  }

  // ── 순수 집계 ──
  // 최근 n개 ISO 주(오래된 순). stats = poker_journey_stats 모양 { days, weeks }. 90일 지난 날은 weeks(롤업)에서 더한다.
  function weeksFrom(stats, now, n) {
    n = Math.max(1, Math.floor(_n(n) || WEEKS));
    stats = stats || {};
    var today = _idx(_localKey(now)), mon = _monday(today);
    var out = [], by = {};
    for (var i = n - 1; i >= 0; i--) {
      var m = mon - 7 * i, wk = _weekKeyOfMonday(m);
      var rec = { week: wk, mon: _key(m), label: _md(m), dec: { n: 0, g: 0 }, base: { n: 0, g: 0 }, evLoss: 0, evN: 0,
        think: { m: 0, t: 0 }, intent: { n: 0, ok: 0 }, xp: 0 };
      out.push(rec); by[wk] = rec;
    }
    function add(rec, d) {
      if (!_isObj(d)) return;
      var dec = d.dec || {};
      rec.dec.n += _n(dec.n); rec.dec.g += _n(dec.g);
      var src = dec.bySrc || {};
      ['chart', 'potodds'].forEach(function(k) { if (_isObj(src[k])) { rec.base.n += _n(src[k].n); rec.base.g += _n(src[k].g); } });
      rec.evLoss += _n(dec.evLoss); rec.evN += _n(dec.evN);
      if (_isObj(d.think)) { rec.think.m += _n(d.think.m); rec.think.t += _n(d.think.t); }
      if (_isObj(d.intent)) { rec.intent.n += _n(d.intent.n); rec.intent.ok += _n(d.intent.ok); }
      rec.xp += _n(d.xp);
    }
    Object.keys(stats.days || {}).forEach(function(k) {
      var i2 = _idx(k);
      if (i2 === null) return;
      var rec = by[_weekKeyOfMonday(_monday(i2))];
      if (rec) add(rec, stats.days[k]);
    });
    Object.keys(stats.weeks || {}).forEach(function(wk) { if (by[wk]) add(by[wk], stats.weeks[wk]); });
    out.forEach(function(r) { r.evLoss = _r2(r.evLoss); });
    return out;
  }

  // 최근 days일(오늘 포함) 개념별 { n, g }. 7/30/90일은 전부 일별 기록 안에 있다(롤업은 90일 넘은 날만).
  function conceptsFrom(stats, now, days) {
    days = Math.max(1, Math.floor(_n(days) || 30));
    var end = _idx(_localKey(now)), start = end - days + 1;
    var out = {};
    Object.keys((stats && stats.days) || {}).forEach(function(k) {
      var i = _idx(k);
      if (i === null || i < start || i > end) return;
      var c = (stats.days[k] && stats.days[k].concept) || {};
      Object.keys(c).forEach(function(key) {
        if (!_isObj(c[key])) return;
        var o = out[key] || (out[key] = { n: 0, g: 0 });
        o.n += _n(c[key].n); o.g += _n(c[key].g);
      });
    });
    return out;
  }

  function _series(weeks, fn) {
    var pts = (weeks || []).map(function(w) { var v = fn(w); return { label: w.label, week: w.week, v: v.v, n: v.n }; });
    var any = pts.some(function(p) { return p.v !== null; });
    return { pts: pts, any: any };
  }
  function _lastTwo(pts) {
    var have = pts.filter(function(p) { return p.v !== null; });
    return { last: have[have.length - 1] || null, prev: have[have.length - 2] || null };
  }

  // 실력 탭 모델(순수). input = collect() 결과 모양
  function skillModel(input) {
    input = input || {};
    var weeks = input.weeks || [];
    var acc = _series(weeks, function(w) { return { v: _pct(w.dec.g, w.dec.n), n: w.dec.n }; });
    var lt = _lastTwo(acc.pts);
    var tot = { n: 0, g: 0 }, base = { n: 0, g: 0 };
    weeks.forEach(function(w) { tot.n += w.dec.n; tot.g += w.dec.g; base.n += w.base.n; base.g += w.base.g; });
    acc.last = lt.last; acc.prev = lt.prev;
    acc.text = !lt.last ? '아직 기록이 없어요. 게임에서 결정을 내리면 주마다 점이 찍혀요.'
      : lt.prev ? lt.prev.label + ' 주 ' + lt.prev.v + '% → ' + lt.last.label + ' 주 ' + lt.last.v + '%(결정 ' + lt.last.n + '개)'
      : lt.last.label + ' 주 ' + lt.last.v + '%(결정 ' + lt.last.n + '개)';
    acc.total = { n: tot.n, pct: _pct(tot.g, tot.n) };
    acc.base = { n: base.n, pct: _pct(base.g, base.n) };

    // 퍼즐 레이팅: 최근 12주 안의 일별 기록(하루 1줄), 30개까지
    var rt = input.rating || {};
    var hist = Array.isArray(rt.history) ? rt.history : [];
    var end = _idx(_localKey(input.now)), from = end - WEEKS * 7 + 1;
    var rows = hist.filter(function(h) { var i = h ? _idx(h.day) : null; return i !== null && i >= from && i <= end && isFinite(Number(h.r)); });
    if (rows.length > 30) rows = rows.slice(-30);
    var rating = { pts: rows.map(function(h) { return { label: _md(_idx(h.day)), v: Math.round(Number(h.r)), n: null, rd: _n(h.rd) }; }),
      cur: rt.label || (rt.r != null ? String(Math.round(_n(rt.r))) : ''), n: _n(rt.n) };
    rating.any = rating.pts.length > 0;
    rating.text = !rating.any ? '퍼즐 세트를 끝내면 레이팅이 기록돼요(첫 시도, 레이팅 퍼즐만).'
      : '지금 ' + rating.cur + (rating.pts.length > 1 ? ', ' + rating.pts[0].label + ' ' + rating.pts[0].v + '에서 ' +
        (rating.pts[rating.pts.length - 1].v - rating.pts[0].v >= 0 ? '+' : '') + (rating.pts[rating.pts.length - 1].v - rating.pts[0].v) : '') +
        (String(rating.cur).indexOf('?') >= 0 ? '. ?는 아직 잠정이라는 뜻이에요' : '');

    // 개념별 정확도(선택한 창)
    var days = WINDOWS.indexOf(input.days) >= 0 ? input.days : 30;
    var cmap = (input.concepts && input.concepts[days]) || {};
    var crow = CONCEPTS.filter(function(k) { return cmap[k] && cmap[k].n > 0; }).map(function(k) {
      var c = cmap[k];
      return { key: k, label: CONCEPT_LABEL[k], n: c.n, g: c.g, pct: _pct(c.g, c.n), few: c.n < FEW };
    });

    var ev = _series(weeks, function(w) { return { v: w.evN ? _r2(w.evLoss / w.evN) : null, n: w.evN }; });
    var think = _series(weeks, function(w) { return { v: _pct(w.think.m, w.think.t), n: w.think.t }; });
    var intent = _series(weeks, function(w) { return { v: _pct(w.intent.ok, w.intent.n), n: w.intent.n }; });

    var HS = _m('HeroStats');
    var mirror = (HS && typeof HS.mirror === 'function') ? HS.mirror(input.hero || {}, { days: 30 }) : null;
    var cards = Array.isArray(input.luck) ? input.luck : [];
    var luck = { cards: cards.slice(0, 6), summary: (HS && typeof HS.luckSummary === 'function') ? HS.luckSummary(cards) : null };
    return { acc: acc, rating: rating, concepts: { days: days, rows: crow }, ev: ev, think: think, intent: intent, mirror: mirror, luck: luck,
      flags: flagRows(input.flags) };
  }

  // '이상해요' 목록(설계서 8.3절 4번): poker_journey.flags = { 레슨 id: [{ at(ISO), scene(0부터) }] } → 최근 표시 순
  function _lessonTitle(id) {
    try {
      if (typeof LessonCore !== 'undefined' && LessonCore && typeof LessonCore.find === 'function') {
        var l = LessonCore.find(id);
        if (l && l.title) return String(l.title);
      }
      if (typeof LESSONS !== 'undefined' && Array.isArray(LESSONS)) {
        for (var i = 0; i < LESSONS.length; i++) if (LESSONS[i] && LESSONS[i].id === id && LESSONS[i].title) return String(LESSONS[i].title);
      }
    } catch (e) { /* 제목 없이 id만 */ }
    return '';
  }
  function flagRows(flags) {
    if (!_isObj(flags)) return [];
    return Object.keys(flags).map(function(id) {
      var list = Array.isArray(flags[id]) ? flags[id].filter(_isObj) : [];
      if (!list.length) return null;
      var scenes = [], last = '';
      list.forEach(function(f) {
        var sc = Math.floor(_n(f.scene)) + 1;
        if (sc >= 1 && scenes.indexOf(sc) < 0) scenes.push(sc);
        if (String(f.at || '') > last) last = String(f.at || '');
      });
      scenes.sort(function(a, b) { return a - b; });
      var t = Date.parse(last), date = '';
      if (isFinite(t)) { var d = new Date(t); date = (d.getMonth() + 1) + '/' + d.getDate(); }
      return { id: id, title: _lessonTitle(id), n: list.length, scenes: scenes, last: last, date: date };
    }).filter(Boolean).sort(function(a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : 0; });
  }

  // 습관 탭 모델(순수). 활동일 = 그날 블록 완료, XP, 결정, 퍼즐, 분 중 하나라도 있으면.
  function habitModel(input) {
    input = input || {};
    var daily = input.daily || {}, sd = input.statsDays || {};
    var today = _idx(_localKey(input.now));
    var first = today - 89;                                // 90일 창
    var frozen = {};
    ((input.streak && input.streak.frozenDays) || []).forEach(function(k) { frozen[k] = true; });
    function dayInfo(i) {
      var k = _key(i), d = daily[k], s = sd[k];
      var xp = (d && d.xp != null) ? _n(d.xp) : (s ? _n(s.xp) : 0);
      var blocks = d ? _n(d.doneBlocks) : 0;
      var minutes = d ? _n(d.minutes) : (s ? _n(s.minutes) : 0);
      var acts = s ? _n(s.dec && s.dec.n) + _n(s.puzzle && s.puzzle.n) + _n(s.theater && s.theater.ep) : 0;
      var active = blocks > 0 || xp > 0 || minutes > 0 || acts > 0;
      var level = !active ? 0 : xp < 30 ? 1 : xp < 80 ? 2 : 3;
      return { key: k, xp: xp, minutes: _r1(minutes), blocks: blocks, active: active, level: level, frozen: !!frozen[k] };
    }
    var startMon = _monday(first), cols = [];
    var activeDays = 0, active30 = 0, active7 = 0;
    for (var c = 0; startMon + c * 7 <= today; c++) {
      var col = { mon: _key(startMon + c * 7), month: null, cells: [] };
      for (var r = 0; r < 7; r++) {
        var i = startMon + c * 7 + r;
        var cell = dayInfo(i);
        cell.dow = DOW[_dow(i)];
        cell.today = i === today;
        cell.out = i < first;
        cell.future = i > today;
        if (cell.out || cell.future) { cell.active = false; cell.level = 0; }
        if (cell.active) { activeDays++; if (i > today - 30) active30++; if (i > today - 7) active7++; }
        col.cells.push(cell);
      }
      cols.push(col);
    }
    // 열 머리의 달: 그 열에서 처음으로 1일이 들어 있거나 첫 열이면
    var lastMonth = null;
    cols.forEach(function(col) {
      var mi = new Date(_idx(col.mon) * DAY_MS).getUTCMonth() + 1;
      var hasFirst = col.cells.some(function(x) { return /-01$/.test(x.key) && !x.out && !x.future; });
      if (lastMonth === null) { col.month = mi + '월'; lastMonth = mi; }
      else if (hasFirst) { var m2 = Number(col.cells.filter(function(x) { return /-01$/.test(x.key); })[0].key.slice(5, 7)); col.month = m2 + '월'; lastMonth = m2; }
    });
    if (cols.length > 1 && cols[1].month) cols[0].month = null;   // 바로 옆 열에 새 달이 오면 첫 열 글자는 뺀다(좁은 화면 겹침)

    var goalMin = Math.max(1, _n(input.goalMinutes) || 5);
    var week = [];
    for (var g = 6; g >= 0; g--) {
      var di = dayInfo(today - g);
      week.push({ key: di.key, dow: DOW[_dow(today - g)], minutes: di.minutes, met: di.minutes >= goalMin - 1e-9,
        pct: Math.max(0, Math.min(100, Math.round(di.minutes / goalMin * 100))), today: g === 0 });
    }
    var met = week.filter(function(w) { return w.met; }).length;

    // 월별 XP: 최근 6개월(이번 달 포함)
    var months = [], byMonth = {};
    var td = new Date(today * DAY_MS), y = td.getUTCFullYear(), mo = td.getUTCMonth();
    for (var k2 = 5; k2 >= 0; k2--) {
      var dt = new Date(Date.UTC(y, mo - k2, 1));
      var key = dt.getUTCFullYear() + '-' + _2(dt.getUTCMonth() + 1);
      var row = { key: key, label: (dt.getUTCMonth() + 1) + '월', xp: 0 };
      months.push(row); byMonth[key] = row;
    }
    var seen = {};
    Object.keys(daily).forEach(function(k) { if (byMonth[k.slice(0, 7)] && _idx(k) !== null) { byMonth[k.slice(0, 7)].xp += _n(daily[k] && daily[k].xp); seen[k] = true; } });
    Object.keys(sd).forEach(function(k) { if (!seen[k] && byMonth[k.slice(0, 7)] && _idx(k) !== null) byMonth[k.slice(0, 7)].xp += _n(sd[k] && sd[k].xp); });
    var maxXp = Math.max.apply(null, months.map(function(m) { return m.xp; }).concat([0]));

    var st = input.streak || {};
    return {
      cal: { cols: cols, activeDays: activeDays, active30: active30, active7: active7 },
      streak: { cur: Math.max(0, _n(st.cur)), best: Math.max(0, _n(st.best)), freezes: Math.max(0, _n(st.freezes)) },
      goal: { minutes: goalMin, week: week, met: met },
      months: { rows: months, max: maxXp },
      xp: _n(input.xp), level: _n(input.level) || 1
    };
  }

  // ── 그림(순수 문자열) ──
  // 꺾은선 하나: pts = [{label, v|null, n}], opts = {min, max, unit, fmt, title, ticks}. 빈 주는 끊는다(선을 잇지 않음).
  function lineSVG(pts, opts) {
    opts = opts || {};
    pts = pts || [];
    var W = 320, H = 140, L = 36, R = 50, T = 12, B = 22;
    var vals = pts.filter(function(p) { return p && p.v !== null && isFinite(Number(p.v)); }).map(function(p) { return Number(p.v); });
    if (!vals.length) return '';
    var min = (opts.min != null) ? opts.min : Math.min.apply(null, vals);
    var max = (opts.max != null) ? opts.max : Math.max.apply(null, vals);
    if (max - min < 1e-9) { min -= 1; max += 1; }
    var unit = opts.unit || '';
    var fmt = opts.fmt || function(v) { return String(Math.round(v)) + unit; };
    var N = pts.length, iw = W - L - R, ih = H - T - B;
    function x(i) { return N > 1 ? L + i * iw / (N - 1) : L + iw / 2; }
    function y(v) { return T + ih - (v - min) / (max - min) * ih; }
    var s = '<svg class="db-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
      _esc((opts.title || '') + (opts.summary ? ': ' + opts.summary : '')) + '">';
    // 눈금 3줄(가는 실선)
    [min, (min + max) / 2, max].forEach(function(tv) {
      var yy = y(tv).toFixed(1);
      s += '<line x1="' + L + '" x2="' + (W - R + 6) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + COLOR.grid + '" stroke-width="1"/>';
      s += '<text x="' + (L - 6) + '" y="' + (Number(yy) + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="' + COLOR.text + '">' + _esc(fmt(tv)) + '</text>';
    });
    // x 라벨: 처음, 1/3, 2/3, 끝
    var xl = N > 1 ? [0, Math.round((N - 1) / 3), Math.round((N - 1) * 2 / 3), N - 1] : [0];
    xl.filter(function(v, i, a) { return a.indexOf(v) === i; }).forEach(function(i) {
      var anchor = (N > 1 && i === 0) ? 'start' : (N > 1 && i === N - 1) ? 'end' : 'middle';
      var xx = x(i) + (anchor === 'start' ? -4 : anchor === 'end' ? 4 : 0);
      s += '<text x="' + xx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + anchor + '" font-size="10" fill="' + COLOR.text + '">' + _esc(pts[i].label) + '</text>';
    });
    // 선(연속 구간만)
    var seg = [];
    function flush() {
      if (seg.length > 1) s += '<polyline fill="none" stroke="' + COLOR.line + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' + seg.join(' ') + '"/>';
      seg = [];
    }
    pts.forEach(function(p, i) {
      if (!p || p.v === null || !isFinite(Number(p.v))) { flush(); return; }
      seg.push(x(i).toFixed(1) + ',' + y(Number(p.v)).toFixed(1));
    });
    flush();
    var lastI = -1;
    var dense = N > 16;                                     // 점이 촘촘하면 작은 점(테두리 없음)으로 선이 끊겨 보이지 않게
    pts.forEach(function(p, i) {
      if (!p || p.v === null || !isFinite(Number(p.v))) return;
      lastI = i;
      s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(Number(p.v)).toFixed(1) + '" r="' + (dense ? 2.5 : 4) + '" fill="' + COLOR.line + '"' +
        (dense ? '' : ' stroke="' + COLOR.surface + '" stroke-width="2"') + '>' +
        '<title>' + _esc(p.label + ': ' + fmt(Number(p.v)) + (p.n != null ? ' (' + (opts.nLabel || '표본') + ' ' + p.n + ')' : '')) + '</title></circle>';
    });
    if (lastI >= 0) {
      var lv = Number(pts[lastI].v);
      s += '<text x="' + (x(lastI) + 7).toFixed(1) + '" y="' + (y(lv) + 4).toFixed(1) + '" font-size="11" font-weight="700" fill="' + COLOR.ink + '">' + _esc(fmt(lv)) + '</text>';
    }
    return s + '</svg>';
  }

  // 표로 보기(그림 대신 숫자)
  function _table(pts, head, fmt, nHead) {
    var rows = pts.filter(function(p) { return p.v !== null; });
    if (!rows.length) return '';
    return '<details class="db-table"><summary>표로 보기</summary><table><thead><tr><th>' + _esc(head) + '</th><th>값</th>' +
      (nHead ? '<th>' + _esc(nHead) + '</th>' : '') + '</tr></thead><tbody>' +
      rows.map(function(p) {
        return '<tr><td>' + _esc(p.label) + '</td><td>' + _esc(fmt(p.v)) + '</td>' + (nHead ? '<td>' + _esc(p.n == null ? '' : p.n) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></details>';
  }

  function _card(title, body, extra) {
    return '<section class="j-card db-card"' + (extra || '') + '><h3 class="db-h">' + title + '</h3>' + body + '</section>';
  }

  function _skillHTML(sm) {
    var out = [];
    var pctFmt = function(v) { return Math.round(v) + '%'; };
    // 결정 정확도
    var a = sm.acc;
    var accBody = '<p class="db-d">코치 판정이 초록인 결정의 비율, 주마다 한 점이에요.</p>';
    if (a.any) {
      accBody += lineSVG(a.pts, { min: 0, max: 100, unit: '%', title: '결정 정확도 주간 추세', summary: a.text, nLabel: '결정' }) +
        '<p class="db-line">' + _esc(a.text) + '</p>' +
        '<p class="db-sub">12주 전체 ' + (a.total.pct === null ? '없음' : a.total.pct + '%') + '(결정 ' + a.total.n + '개)' +
        (a.base.n ? ', 승급 기준(차트, 팟 오즈 판정)만 ' + a.base.pct + '%(' + a.base.n + '개)' : '') + '</p>' +
        _table(a.pts, '주(월요일)', pctFmt, '결정');
    } else accBody += '<p class="db-empty">' + _esc(a.text) + '</p>';
    out.push(_card('🎯 결정 정확도(12주)', accBody));

    // 퍼즐 레이팅
    var r = sm.rating;
    var rBody = '<p class="db-d">첫 시도한 레이팅 퍼즐로만 움직여요. 나의 추세를 보는 값이에요.</p>';
    if (r.any) {
      var lo = Math.floor((Math.min.apply(null, r.pts.map(function(p) { return p.v; })) - 30) / 50) * 50;
      var hi = Math.ceil((Math.max.apply(null, r.pts.map(function(p) { return p.v; })) + 30) / 50) * 50;
      rBody += lineSVG(r.pts, { min: lo, max: hi, title: '퍼즐 레이팅 추세', summary: r.text }) +
        '<p class="db-line">' + _esc(r.text) + '</p>' + _table(r.pts, '날짜', function(v) { return String(v); });
    } else rBody += '<p class="db-empty">' + _esc(r.text) + '</p>';
    out.push(_card('🧩 퍼즐 레이팅' + (r.cur ? ' <span class="db-chip">' + _esc(r.cur) + '</span>' : ''), rBody));

    // 개념별 정확도
    var cm = sm.concepts;
    var picks = '<div class="j-picks db-picks" role="group" aria-label="기간">' + WINDOWS.map(function(d) {
      var on = d === cm.days;
      return '<button type="button" class="j-pick' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" onclick="DashboardView.setDays(' + d + ')">' + d + '일</button>';
    }).join('') + '</div>';
    var cBody = picks;
    if (cm.rows.length) {
      cBody += '<ul class="db-bars">' + cm.rows.map(function(c) {
        return '<li class="db-bar' + (c.few ? ' is-few' : '') + '" aria-label="' + _esc(c.label + ' ' + c.pct + '%, 결정 ' + c.n + '개' + (c.few ? ', 표본 적음' : '')) + '">' +
          '<span class="db-bar-top"><span class="db-bar-k">' + _esc(c.label) + '</span><span class="db-bar-v">' + c.pct + '%</span>' +
          '<span class="db-bar-n">' + c.n + '개' + (c.few ? ', 표본 적음' : '') + '</span></span>' +
          '<span class="db-bar-track" aria-hidden="true"><span class="db-bar-fill" style="width:' + Math.max(0, Math.min(100, c.pct)) + '%"></span></span></li>';
      }).join('') + '</ul><p class="db-sub">게임 결정의 코치 초록 비율이에요. 결정 ' + FEW + '개 미만은 흐리게 보여요.</p>';
    } else cBody += '<p class="db-empty">최근 ' + cm.days + '일 동안 게임 결정이 없어요.</p>';
    out.push(_card('📚 개념별 정확도', cBody));

    // 거울 HUD
    var HS = _m('HeroStats');
    if (sm.mirror && HS && typeof HS.mirrorHTML === 'function') {
      out.push(_card('🪞 거울 HUD <span class="db-chip is-chart">' + _esc(sm.mirror.basis) + '</span>',
        '<p class="db-d">최근 ' + sm.mirror.days + '일 ' + sm.mirror.hands + '핸드. 밴드는 이 앱 차트대로 쳤을 때의 값 ±4%p예요(인구 통계 아님).</p>' +
        HS.mirrorHTML(sm.mirror, {}) +
        '<p class="db-sub">신뢰도: 기회 30번 미만은 아직 모름, 100번까지 잠정, 그 뒤 확정(3벳과 3벳에 폴드는 20, 50번).</p>'));
    }

    // 운 미터
    var L = sm.luck;
    var lBody = '<p class="db-d">올인하고 쇼다운까지 간 핸드에서 그때 승률과 결과를 나란히 봐요. 레이팅과 정확도에는 넣지 않아요.</p>';
    if (L && L.cards.length && HS) {
      lBody += '<p class="db-line">' + _esc(L.summary ? L.summary.text : '') + '</p>' + HS.luckCardHTML(L.cards[0]);
      var rest = L.cards.slice(1);
      if (rest.length) {
        lBody += '<ul class="db-luck-list">' + rest.map(function(c) {
          var m = HS.luckCardModel(c);
          var opened = !!_open[c.id];
          return '<li>' + (opened ? HS.luckCardHTML(c) :
            '<button type="button" class="db-luck-row" onclick="DashboardView.openLuck(\'' + _esc(String(c.id).replace(/[^A-Za-z0-9_-]/g, '')) + '\')">' +
            '<span class="db-luck-a">' + _esc(m.date + ' ' + m.streetText) + '</span>' +
            '<span class="db-luck-b">내 승률 ' + m.eqPct + '%, ' + m.resultIcon + ' ' + _esc(m.resultText) + ' <span class="db-luck-l">(' + _esc(m.label) + ')</span></span></button>') + '</li>';
        }).join('') + '</ul>';
      }
    } else lBody += '<p class="db-empty">아직 올인 쇼다운 기록이 없어요. 6인 게임에서 올인하고 쇼다운까지 가면 여기에 카드가 생겨요.</p>';
    out.push(_card('🎲 운 미터', lBody));

    // EV 손실(근사)
    if (sm.ev.any) {
      out.push(_card('📉 결정당 EV 손실 <span class="db-chip is-approx">근사</span>',
        '<p class="db-d">결정 하나에 잃은 기대값(bb)의 주 평균이에요. 코치의 고정 벌점이 섞인 근사값이라 추세만 보고, 승급 기준에는 쓰지 않아요. 낮을수록 좋아요.</p>' +
        lineSVG(sm.ev.pts, { min: 0, fmt: function(v) { return _r2(v) + 'bb'; }, title: 'EV 손실 추세', nLabel: '결정' }) +
        _table(sm.ev.pts, '주(월요일)', function(v) { return _r2(v) + 'bb'; }, '결정')));
    }
    // 띵킹과 속마음(데이터 있을 때만)
    if (sm.think.any) {
      out.push(_card('💭 띵킹 일치율', '<p class="db-d">레인지와 손 2단계에서 프로 생각과 맞은 비율이에요(의도 단계는 참고라 빼요).</p>' +
        lineSVG(sm.think.pts, { min: 0, max: 100, unit: '%', title: '띵킹 일치율 추세' }) + _table(sm.think.pts, '주(월요일)', pctFmt, '판정')));
    }
    if (sm.intent.any) {
      out.push(_card('🎭 속마음 적중률', '<p class="db-d">뻔하지 않은 결정에서 캐릭터의 속마음을 맞힌 비율이에요. 캐릭터의 생각이고 정답은 아니에요.</p>' +
        lineSVG(sm.intent.pts, { min: 0, max: 100, unit: '%', title: '속마음 적중률 추세' }) + _table(sm.intent.pts, '주(월요일)', pctFmt, '예측')));
    }
    // 이상해요 표시(있을 때만)
    if (sm.flags && sm.flags.length) {
      out.push(_card('🤔 이상해요 표시한 레슨', '<p class="db-d">레슨에서 이상해요를 누른 장면이에요. 내용을 다시 살펴볼 때 써요.</p>' +
        '<ul class="db-flags">' + sm.flags.map(function(f) {
          return '<li class="db-flag"><span class="db-flag-t">' + _esc(f.title || f.id) + '</span>' +
            '<span class="db-flag-d">' + _esc((f.title ? f.id + ', ' : '') + f.scenes.join(', ') + '번 장면, ' + f.n + '회' + (f.date ? ', 마지막 ' + f.date : '')) + '</span></li>';
        }).join('') + '</ul>'));
    }
    return out.join('');
  }

  function _habitHTML(hm) {
    var out = [];
    var st = hm.streak;
    out.push(_card('🔥 스트릭',
      '<div class="db-stats"><span class="db-stat"><b>' + st.cur + '일</b><small>지금</small></span>' +
      '<span class="db-stat"><b>' + st.best + '일</b><small>최장</small></span>' +
      '<span class="db-stat"><b>❄ ' + st.freezes + '</b><small>프리즈</small></span>' +
      '<span class="db-stat"><b>Lv ' + hm.level + '</b><small>' + hm.xp + ' XP</small></span></div>' +
      '<p class="db-sub">마지막 활동 뒤 36시간 안에 블록 1개면 이어져요. 습관은 하루로 깨지지 않아요.</p>'));

    // 활동 달력
    var cal = hm.cal;
    var grid = '<div class="db-cal-grid" style="--cols:' + cal.cols.length + '">';
    grid += '<span class="db-cal-m"></span>' + cal.cols.map(function(c) { return '<span class="db-cal-m">' + _esc(c.month || '') + '</span>'; }).join('');
    for (var r = 0; r < 7; r++) {
      var dl = cal.cols[0] ? cal.cols[0].cells[r].dow : '';
      grid += '<span class="db-cal-d">' + (r % 2 === 0 ? _esc(dl) : '') + '</span>';
      cal.cols.forEach(function(col) {
        var c = col.cells[r];
        var cls = 'db-cal-c lv' + c.level + (c.today ? ' is-today' : '') + ((c.out || c.future) ? ' is-out' : '') + (c.frozen && !c.active ? ' is-frozen' : '');
        var tip = (c.out || c.future) ? '' : c.key.slice(5).replace('-', '/') + ': ' + (c.active ? '활동 ' + c.xp + 'XP' : c.frozen ? '프리즈로 지킨 날' : '쉼');
        grid += '<span class="' + cls + '"' + (tip ? ' title="' + _esc(tip) + '"' : '') + '>' + (c.frozen && !c.active && !c.out && !c.future ? '❄' : '') + '</span>';
      });
    }
    grid += '</div>';
    out.push(_card('📅 활동 달력(90일)',
      '<div class="db-cal" role="img" aria-label="' + _esc('최근 90일 중 활동 ' + cal.activeDays + '일, 최근 30일 ' + cal.active30 + '일, 최근 7일 ' + cal.active7 + '일') + '">' + grid + '</div>' +
      '<div class="db-legend" aria-hidden="true">적게 <span class="db-cal-c lv1"></span><span class="db-cal-c lv2"></span><span class="db-cal-c lv3"></span> 많이(XP), ' +
      '<span class="db-cal-c lv0 is-frozen">❄</span> 프리즈, <span class="db-cal-c lv0 is-today"></span> 오늘</div>' +
      '<p class="db-line">90일 중 ' + cal.activeDays + '일, 최근 30일 ' + cal.active30 + '일, 최근 7일 ' + cal.active7 + '일 활동했어요.</p>'));

    // 데일리 목표
    var gl = hm.goal;
    out.push(_card('⏱ 데일리 목표 ' + gl.minutes + '분',
      '<div class="db-goal" role="img" aria-label="' + _esc('최근 7일 중 목표 달성 ' + gl.met + '일') + '">' + gl.week.map(function(w) {
        return '<span class="db-gday' + (w.met ? ' is-met' : '') + (w.today ? ' is-today' : '') + '">' +
          '<span class="db-gv">' + (w.minutes ? _r1(w.minutes) + '분' : '') + '</span>' +
          '<span class="db-gbar"><span style="height:' + w.pct + '%"></span></span>' +
          '<span class="db-gd">' + _esc(w.dow) + (w.met ? ' ✓' : '') + '</span></span>';
      }).join('') + '</div>' +
      '<p class="db-line">최근 7일 중 ' + gl.met + '일 목표를 채웠어요. 오늘의 5분 블록 시간으로 세요.</p>'));

    // 월별 XP
    var mo = hm.months;
    out.push(_card('⭐ 월별 XP',
      '<div class="db-months" role="img" aria-label="' + _esc(mo.rows.map(function(m) { return m.label + ' ' + m.xp + 'XP'; }).join(', ')) + '">' +
      mo.rows.map(function(m) {
        var h = mo.max ? Math.round(m.xp / mo.max * 100) : 0;
        return '<span class="db-mcol"><span class="db-mv">' + m.xp + '</span><span class="db-mbar"><span style="height:' + h + '%"></span></span>' +
          '<span class="db-mk">' + _esc(m.label) + '</span></span>';
      }).join('') + '</div>'));
    return out.join('');
  }

  // 수집 탭 요약(M6-COLLECT). col = CollectionView.summary 결과 { badges, cards, castOpen, castTotal, looksOpen, looksTotal, lines }
  function _collectHTML(col) {
    col = _isObj(col) ? col : {};
    var rows = [
      ['🏅', '배지', _n(col.badges) + '개', '조건은 미리 알리지 않아요. 얻은 배지만 보여요.'],
      ['🎬', '명장면 카드', _n(col.cards) + '장', '극장에서 드라마가 큰 핸드가 나오면 생겨요(최대 100장).'],
      ['👥', '캐릭터 도감', _n(col.castOpen) + '/' + (_n(col.castTotal) || 6) + '쪽', '단계가 오르면 새 쪽이 열려요.'],
      ['💭', '속마음 아카이브', _n(col.lines) + '줄', '명장면 카드의 속마음 한 줄을 인물별로 모아요.'],
      ['🎨', '외형', _n(col.looksOpen) + '/' + (_n(col.looksTotal) || 5) + '개 열림', '레벨 3, 6, 10, 15, 20에서 외형이 열려요.']
    ];
    return _card('🗂 수집', '<ul class="db-col">' + rows.map(function(r) {
      return '<li class="db-col-row"><span class="db-col-ic" aria-hidden="true">' + r[0] + '</span><span class="db-col-k">' + r[1] + '</span>' +
        '<b class="db-col-v">' + _esc(r[2]) + '</b><span class="db-col-d">' + r[3] + '</span></li>';
    }).join('') + '</ul>' +
      '<button type="button" class="j-btn j-primary db-col-open" onclick="JourneyUI.view(\'collection\')">🗂 수집 열기</button>');
  }

  // 화면 문자열(순수: input과 탭만으로 만든다)
  function html(input, tab) {
    tab = (tab === 'habit' || tab === 'collect') ? tab : 'skill';
    var body = tab === 'habit' ? _habitHTML(habitModel(input)) : tab === 'collect' ? _collectHTML(input && input.col) : _skillHTML(skillModel(input));
    var tabs = '<div class="db-tabs" role="tablist" aria-label="내 실력 탭">' + TABS.map(function(t) {
      var on = t[0] === tab;
      return '<button type="button" role="tab" class="db-tab' + (on ? ' is-on' : '') + '" aria-selected="' + on + '" id="db-tab-' + t[0] + '"' +
        ' onclick="DashboardView.tab(\'' + t[0] + '\')">' + t[1] + '</button>';
    }).join('') + '</div>';
    return '<div class="j-sub db-view">' +
      '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여정 홈으로" onclick="DashboardView.back()">↩</button>' +
      '<h2 class="j-sub-t">📊 내 실력</h2></div>' + tabs +
      '<div class="db-panel" role="tabpanel" aria-labelledby="db-tab-' + tab + '">' + body + '</div>' +
      '<div class="db-foot"><button type="button" class="j-btn db-backup" onclick="DashboardView.backup()">💾 기록 백업</button>' +
      '<p class="db-sub">기록은 이 기기에만 있어요. 한 달에 한 번 백업 파일로 내려받아 두면 안전해요.</p></div></div>';
  }

  // ── 데이터 모으기(전역 모듈, typeof 가드) ──
  function collect(now) {
    now = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
    var JS = _m('JStats'), J = _m('Journey'), RT = _m('Rating'), HS = _m('HeroStats');
    var stats = { days: {}, weeks: {} }, js = null;
    try { if (JS && typeof JS.load === 'function') stats = JS.load() || stats; } catch (e) { /* 빈 기록 */ }
    try { if (J && typeof J.load === 'function') js = J.load(); } catch (e) { js = null; }
    js = js || {};
    var sm = null;
    try { if (J && typeof J.summary === 'function') sm = J.summary(now); } catch (e) { sm = null; }
    var rt = _isObj(js.rating) ? js.rating : {};
    var label = '';
    try { label = (RT && typeof RT.label === 'function') ? RT.label(_isObj(js.rating) ? rt : undefined) : ''; } catch (e) { label = ''; }
    var hero = {};
    try { if (JS && typeof JS.heroTotals === 'function') hero = JS.heroTotals(30, now); } catch (e) { hero = {}; }
    var luck = [];
    try { if (HS && typeof HS.luckCards === 'function') luck = HS.luckCards(20); } catch (e) { luck = []; }
    var streak = _isObj(js.streak) ? js.streak : {};
    var CV = _m('CollectionView'), col = null;
    try { if (CV && typeof CV.summary === 'function') col = CV.summary(js); } catch (e) { col = null; }
    return {
      now: now, days: _days,
      weeks: weeksFrom(stats, now, WEEKS),
      concepts: { 7: conceptsFrom(stats, now, 7), 30: conceptsFrom(stats, now, 30), 90: conceptsFrom(stats, now, 90) },
      rating: { r: rt.r, rd: rt.rd, n: rt.n, history: Array.isArray(rt.history) ? rt.history : [], label: label },
      hero: hero, luck: luck, flags: _isObj(js.flags) ? js.flags : {},
      daily: _isObj(js.daily) ? js.daily : {}, statsDays: _isObj(stats.days) ? stats.days : {},
      streak: { cur: sm ? sm.streak : _n(streak.cur), best: _n(streak.best), freezes: _n(streak.freezes),
        frozenDays: Array.isArray(streak.frozenDays) ? streak.frozenDays : [] },
      goalMinutes: (_isObj(js.goal) && js.goal.minutes) || 5,
      xp: _n(js.xp), level: sm ? sm.level : (_n(js.level) || 1),
      col: col
    };
  }

  // ── DOM ──
  function render(el) {
    el = el || _el;
    _input = collect();
    _input.days = _days;
    var out = html(_input, _tab);
    if (!el) return out;
    _el = el;
    el.innerHTML = out;
    if (_tab === 'skill') {
      var HS = _m('HeroStats');
      var shown = (_input.luck || []).slice(0, 6).filter(function(c, i) { return i === 0 || _open[c.id]; }).map(function(c) { return c.id; });
      if (HS && typeof HS.watchLuckViews === 'function' && shown.length) {
        try { HS.watchLuckViews(el, shown); } catch (e) { /* 기록 실패는 화면에 영향 없음 */ }
      }
    }
    return out;
  }

  function open(params, el) {
    if (!el) { var JU = _m('JourneyUI'); if (JU && typeof JU.viewEl === 'function') { try { el = JU.viewEl(); } catch (e) { el = null; } } }
    var p = String(params == null ? '' : params);
    _tab = (p === 'habit' || p === 'collect') ? p : 'skill';
    _open = {};
    render(el);
    return true;
  }

  function _focusTab() {
    if (!_el || typeof document === 'undefined') return;
    try { var b = _el.querySelector('#db-tab-' + _tab); if (b && b.focus) b.focus({ preventScroll: true }); } catch (e) { /* noop */ }
  }

  function tab(name) {
    _tab = (name === 'habit' || name === 'collect') ? name : 'skill';
    render();
    _focusTab();
    return _tab;
  }

  function setDays(d) {
    if (WINDOWS.indexOf(Number(d)) < 0) return _days;
    _days = Number(d);
    render();
    if (_el && typeof document !== 'undefined') {
      try { var b = _el.querySelector('.db-picks .j-pick.is-on'); if (b && b.focus) b.focus({ preventScroll: true }); } catch (e) { /* noop */ }
    }
    return _days;
  }

  function openLuck(id) {
    if (!id) return false;
    _open[id] = true;
    render();
    return true;
  }

  function backup() {
    var B = _m('BackupUI');
    if (B && typeof B.open === 'function') { B.open(); return true; }
    return false;
  }

  function back() {
    var JU = _m('JourneyUI');
    if (JU && typeof JU.back === 'function') { JU.back(); return; }
    if (typeof App !== 'undefined' && App && typeof App.showMenu === 'function') App.showMenu();
  }

  var api = {
    WEEKS: WEEKS, WINDOWS: WINDOWS, CONCEPT_LABEL: CONCEPT_LABEL,
    open: open, render: render, tab: tab, setDays: setDays, openLuck: openLuck, backup: backup, back: back,
    collect: collect, weeksFrom: weeksFrom, conceptsFrom: conceptsFrom, skillModel: skillModel, habitModel: habitModel, flagRows: flagRows,
    lineSVG: lineSVG, html: html
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
