// journey/today-ui.js (채우는 패키지: M1-P3)
// ▶ 오늘의 5분 진행 셸: 계획(Today.build) → 블록 실행(기존 화면 어댑터) → 복귀 시 결과 반영 → 다음 블록 카드 → 마무리 카드.
// 계획과 진행은 poker_journey.daily[오늘].plan에 저장해 "여기까지" 뒤 다시 열면 남은 블록부터 이어간다.
// 블록 하나라도 끝나면 Journey.markBlock + Journey.touchDay(활동일, 36h 스트릭). 다른 패키지 모듈은 전부 typeof 가드.
var TodayUI = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var ICON = { review: '🔁', learn: '📖', fun: '🎲', wrap: '🎉' };
  var NAME = { review: '복습', learn: '새 배움', fun: '재미', wrap: '마무리' };
  var CONCEPT_LABEL = { rfi: '오픈', vs_rfi: '상대 오픈 대응', blind_defense: '블라인드 방어', vs_3bet: '3벳 대응', pot_odds: '팟 오즈',
    draws: '드로우', cbet: 'c벳', value_bluff: '밸류와 블러프', board_texture: '보드 텍스처', turn_river: '턴, 리버', actions: '액션 기본',
    showdown: '쇼다운', order: '말하는 순서', outs: '아웃츠', equity: '에쿼티', combos: '콤보', mdf: 'MDF', alpha: '알파', spr: 'SPR',
    range: '레인지', texture: '보드 날씨', read: '상대 읽기', variance: '분산', tilt: '틸트', review: '복기' };
  var CACHE_MS = 5 * 60 * 1000;

  var _active = false;      // 오늘의 5분 진행 중(셸 표시 또는 외부 블록 실행 중)
  var _pending = null;      // 외부 화면에서 실행 중인 블록 { idx, kind, startedAt, xpStart, ... }
  var _last = null;         // 직전 블록 결과 { idx, line, retry }
  var _streak = null;       // 마지막 touchDay 결과
  var _cache = null;        // 홈 미리보기용 계획 { day, goal, at, plan }

  // ── 헬퍼 ──────────────────────────────────────────────
  function _m(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _can(mod, fn) { var o = _m(mod); return !!(o && typeof o[fn] === 'function'); }
  function _call(mod, fn) {
    var o = _m(mod);
    if (!o || typeof o[fn] !== 'function') return undefined;
    try { return o[fn].apply(o, Array.prototype.slice.call(arguments, 2)); }
    catch (e) { if (typeof console !== 'undefined' && console.warn) console.warn('[TodayUI] ' + mod + '.' + fn + ' 실패:', e && e.message ? e.message : e); return undefined; }
  }
  function _num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function _now() { return Date.now(); }
  function _iso(t) { return new Date(t).toISOString(); }
  function _esc(s) { return _can('JourneyUI', 'esc') ? JourneyUI.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function _clean(s) { return _can('JourneyUI', 'clean') ? JourneyUI.clean(s) : String(s == null ? '' : s); }
  function _state() { return _can('JourneyUI', 'state') ? JourneyUI.state() : {}; }
  function _save(s) { if (_can('JourneyUI', 'save')) JourneyUI.save(s); }
  function _day(now) {
    if (_can('JourneyUI', 'dayKey')) return JourneyUI.dayKey(now || _now());
    var t = new Date(now || _now()), m = t.getMonth() + 1, d = t.getDate();
    return t.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  function _goal(s) { var g = _num(s && s.goal && s.goal.minutes, 5); return (g === 10 || g === 15) ? g : 5; }
  function _node(id) { return id && _can('JourneyUI', 'node') ? JourneyUI.node(id) : null; }
  function _nodeTitle(id) { var n = _node(id); return n ? n.title : (id || ''); }
  function _typeName(t) { return _can('JourneyUI', 'typeName') ? JourneyUI.typeName(t) : t; }
  function _toast(msg, ms) { if (_can('JourneyUI', 'toast')) JourneyUI.toast(msg, ms); }
  function _xpNow() { return _num(_state().xp, 0); }
  function _xpConst(k, d) { var X = _m('JOURNEY_XP'); return X && isFinite(X[k]) ? X[k] : d; }
  function _addXp(src, n) { if (n > 0 && _can('JourneyUI', 'xp')) JourneyUI.xp(src, n); }

  // ── 계획 저장(poker_journey.daily[day].plan) ─────────────────────
  function _dayRec(s, create, day) {
    s.daily = s.daily || {};
    day = day || _day();
    var r = s.daily[day];
    if (!r && create) r = s.daily[day] = { blocks: [], doneBlocks: 0, minutes: 0, xp: 0, daily5: null, plan: null };
    return r || null;
  }
  function plan() {
    var r = _dayRec(_state(), false);
    return (r && r.plan && Array.isArray(r.plan.blocks)) ? r.plan : null;
  }
  function _savePlan(p) {
    var s = _state();
    var r = _dayRec(s, true, p.day);
    if (!r.blocks || !r.blocks.length) r.blocks = p.blocks.map(function(b) { return b.id; });
    r.plan = p;
    _save(s);
    _syncRunning();
  }
  // Journey.active()(App.showMenu 분기, 배치 고사 복귀)가 오늘의 5분 진행을 알도록: 진행 중이면 setPlan, 아니면 endToday
  function _syncRunning() {
    if (_active || _pending) {
      var p = plan();
      if (p && p.day === _day() && _can('Journey', 'setPlan')) _call('Journey', 'setPlan', p, _now());
    } else _call('Journey', 'endToday');
  }

  // ── 계획 만들기: Journey.todayCtx → Today.build. 없으면 M1 폴백(4.1절 마일스톤 폴백 규칙) ──
  function ctx(extra) {
    var now = _now();
    var c = _call('Journey', 'todayCtx', now);
    c = (c && typeof c === 'object') ? _copy(c) : _fallbackCtx(now);
    // 다음 노드의 남은 단계가 이번 버전에 없는 기능이면(M1의 쇼다운 퍼즐 등) 지금 할 수 있는 다음 가용 노드로 계획한다
    var nn0 = c.nextNode;
    if (nn0 && nn0.id && _can('JourneyUI', 'nextDoable')) {
      var nx = JourneyUI.nextDoable({ id: nn0.id, step: nn0.step });
      if (nx && nx.id && nx.id !== nn0.id) {
        var nd = _node(nx.id), rec = ((_state().nodes || {})[nx.id] || {});
        c.nextNode = { id: nx.id, step: nx.step, est: (nd && nd.est) || null, lesson: (nd && nd.lesson) || null,
          scene: _num(rec.lesson && rec.lesson.scene, 0) };
        c.curriculumSession = (_can('JourneyUI', 'curriculumFor') && JourneyUI.curriculumFor(nx.id)) || null;
      }
    }
    var s = _state();
    if (s.placement && s.placement.declinedAt) c.placementDone = true;   // 첫 카드 "그냥 시작"
    if (extra) Object.keys(extra).forEach(function(k) { c[k] = extra[k]; });
    return c;
  }
  function _copy(o) { var r = {}; Object.keys(o).forEach(function(k) { r[k] = o[k]; }); return r; }
  function _fallbackCtx(now) {
    var s = _state(), D = _m('Drills');
    var due = [];
    var dueAll = _call('Drills', 'dueAll', now);
    if (Array.isArray(dueAll)) due = dueAll;
    else if (D && typeof D.due === 'function') {
      ['preflop', 'potodds'].forEach(function(t) {
        (_call('Drills', 'due', t, now) || []).forEach(function(k) {
          var it = _call('Drills', 'item', t, k) || {};
          due.push({ type: t, key: k, box: _num(it.box, 0), due: _num(it.due, now) });
        });
      });
    }
    var sm = _can('JourneyUI', 'summary') ? JourneyUI.summary(s) : {};
    var prog = _call('Storage', 'getProgress') || {};
    return { now: now, weekday: new Date(now).getDay(), goalMinutes: _goal(s), stage: _num(s.stage, 1),
      nextNode: sm.nextNode || null, due: due, weak: [], avail: { puzzles: false, lessons: false, theater: false, daily5: false, highlights: false, rush: false },
      daily5Done: false, theaterEpisode: null, placementDone: !!(s.placement && s.placement.done), nodesPassed: _num(sm.nodesPassed, 0),
      prevPlan: null, curriculumSession: prog.currentSession || null };
  }
  function _fallbackPlan(c) {
    var cap = { 5: 8, 10: 15, 15: 25 }[c.goalMinutes] || 8;
    var items = (c.due || []).slice().sort(function(a, b) { return (a.box - b.box) || (a.due - b.due); }).slice(0, cap)
      .map(function(d) { return { type: d.type, key: d.key, box: d.box }; });
    var nn = c.nextNode;
    var learn = (!c.placementDone && !c.nodesPassed) ? { id: 'learn', kind: 'placement', node: null } :
      (nn && nn.step === 'lesson') ? { id: 'learn', kind: 'curriculum', node: nn.id } : { id: 'learn', kind: 'gto', node: nn ? nn.id : null, hands: 5 };
    return { day: _day(c.now), blocks: [{ id: 'review', items: items, daily5: false }, learn, { id: 'fun', kind: 'free', hands: 3 }, { id: 'wrap' }] };
  }
  function build(extra) {
    var c = ctx(extra);
    var p = _call('Today', 'build', c);
    if (!p || !Array.isArray(p.blocks) || !p.blocks.length) p = _fallbackPlan(c);
    return _normalize(p, c);
  }
  function _normalize(p, c) {
    p.day = p.day || _day(c && c.now);
    p.blocks = p.blocks.filter(function(b) { return b && b.id; });
    if (!p.blocks.length || p.blocks[p.blocks.length - 1].id !== 'wrap') p.blocks.push({ id: 'wrap' });
    p.blocks.forEach(function(b) { if (!b.status) b.status = 'todo'; });
    if (c && c.curriculumSession && !p.curriculumSession) p.curriculumSession = c.curriculumSession;
    if (!isFinite(p.estMin) || p.estMin <= 0) {
      var e = _call('Today', 'estimate', p);
      p.estMin = (isFinite(e) && e > 0) ? Math.round(e * 10) / 10 : Math.round(p.blocks.reduce(function(a, b) { return a + _estSec(b); }, 0) / 6) / 10;
    }
    p.xp = _num(p.xp, 0); p.minutes = _num(p.minutes, 0);
    return p;
  }
  // 표시용 추정(초): 복습 10초, 레슨 장면 20초(커리큘럼 페이지는 약 2분), 게임 1핸드 60초, 극장 90초
  function _estSec(b) {
    if (b.id === 'review') return (b.items || []).length * 10;
    if (b.id === 'wrap') return 30;
    if (b.kind === 'placement') return 180;
    if (b.kind === 'curriculum' || b.kind === 'lesson') return 120;
    if (b.kind === 'drill') { var n = _node(b.node); return (n && n.drill ? _num(n.drill.count, 10) : 10) * 25; }
    if (b.kind === 'theater') return 90 * _num(b.episodes, 1);
    if (b.kind === 'mission') return 5 * 60;
    return _num(b.hands, b.id === 'fun' ? 3 : 5) * 60;
  }
  function _estTxt(b) { var m = Math.max(1, Math.round(_estSec(b) / 60)); return '약 ' + m + '분'; }

  function _blockReady(b) { return !(b.id === 'review' && !_reviewGroups(b.items || []).length); }
  function _firstRemaining(p) {
    for (var i = 0; i < p.blocks.length; i++) if (p.blocks[i].status !== 'done' && p.blocks[i].status !== 'skipped') return i;
    return -1;
  }
  function _left(p) { return p.blocks.filter(function(b) { return b.id !== 'wrap' && b.status !== 'done' && b.status !== 'skipped'; }).length; }

  // 칩 문구
  function label(b) {
    if (b.id === 'review') { var n = (b.items || []).length; return n ? '복습 ' + n : '복습 없음'; }
    if (b.id === 'wrap') return '마무리';
    var t = _nodeTitle(b.node);
    switch (b.kind) {
      case 'placement': return '실력 확인 3분';
      case 'lesson': case 'curriculum': return '레슨 ' + (t || '커리큘럼');
      case 'drill': return '드릴 ' + t;
      case 'mission': return '미션 ' + t;
      case 'gto': return 'GTO 미러 ' + _num(b.hands, 5) + '핸드';
      case 'theater': return '극장 ' + _num(b.episodes, 1) + '편';
      case 'highlight': return '명장면';
      case 'rush': return '퍼즐 러시';
      case 'weeklyIntro': return '주간 챌린지';
      default: return '자유 게임 ' + _num(b.hands, 3) + '핸드';
    }
  }

  // 홈 버튼과 칩: { state:'new'|'progress'|'done', left, estMin, chips }
  function preview() {
    var s = _state(), day = _day(), p = plan();
    var rec = _dayRec(s, false, day);
    if (p && p.day === day && p.finishedAt) return { state: 'done', completed: !!(rec && rec.todayDoneAt), left: 0, estMin: p.estMin, chips: _chips(p), plan: p };
    if (p && p.day === day && p.startedAt) return { state: 'progress', left: _left(p), estMin: p.estMin, chips: _chips(p), plan: p };
    var g = _goal(s), now = _now();
    if (!_cache || _cache.day !== day || _cache.goal !== g || now - _cache.at > CACHE_MS) _cache = { day: day, goal: g, at: now, plan: build() };
    return { state: 'new', left: _left(_cache.plan), estMin: _cache.plan.estMin, chips: _chips(_cache.plan), plan: _cache.plan };
  }
  function _chips(p) {
    return p.blocks.filter(function(b) { return b.id !== 'wrap' && _blockReady(b); })
      .map(function(b) { return { id: b.id, label: label(b), done: b.status === 'done' }; });
  }

  // ── 진행 ──────────────────────────────────────────────
  function start(p) {
    if (_pending) { resume(); return; }
    var day = _day(), cur = plan();
    if (!p) {
      if (cur && cur.day === day && !cur.finishedAt) p = cur;
      else if (cur && cur.day === day && cur.finishedAt) { p = build({ prevPlan: cur }); p.round = _num(cur.round, 1) + 1; }
      else p = (_cache && _cache.day === day && _now() - _cache.at <= CACHE_MS) ? _cache.plan : build();
    } else _normalize(p, { now: _now() });
    _cache = null;
    p.startedAt = p.startedAt || _iso(_now());
    p.stoppedAt = null;
    _savePlan(p);
    _active = true;
    _last = null;
    _next(p);
  }
  function again() {
    var cur = plan();
    var p = build({ prevPlan: cur || null });
    p.round = _num(cur && cur.round, 1) + 1;
    p.startedAt = null;
    start(p);
  }
  function _next(p) {
    var i = _firstRemaining(p);
    if (i < 0) { _wrap(); return; }
    runBlock(i);
  }

  function runBlock(i) {
    var p = plan();
    if (!p || !p.blocks[i]) { show(); return; }
    var b = p.blocks[i];
    _active = true;
    _last = null;
    p.cur = i;
    _savePlan(p);
    if (b.id === 'wrap') { _wrap(); return; }
    var launched = false;
    if (b.id === 'review') launched = _review(b.items || [], i);
    else if (b.id === 'learn') launched = _learn(b, i);
    else if (b.id === 'fun') launched = _fun(b, i);
    if (!launched) {
      // 할 게 없는 블록(복습 0개, 이 버전에 없는 기능)은 조용히 건너뛰고 다음 블록으로 바로 간다
      b.status = 'skipped';
      b.auto = true;
      _savePlan(p);
      _next(p);
      return;
    }
    var n = p.blocks.filter(function(x) { return x.id !== 'wrap'; }).length;
    _toast(ICON[b.id] + ' ' + (i + 1) + '/' + n + ' ' + label(b), 1800);
  }

  function _setPending(p) {
    _pending = p;
    if (_can('JourneyUI', 'watchReturn')) JourneyUI.watchReturn(!!p || (_can('JourneyUI', 'hasPending') && JourneyUI.hasPending()));
  }
  function _base(i, kind, extra) {
    var p = { idx: i, kind: kind, startedAt: _now(), xpStart: _xpNow() };
    if (extra) Object.keys(extra).forEach(function(k) { p[k] = extra[k]; });
    return p;
  }

  // 어댑터: 복습(M1 = 기존 DrillUI 유형별 순차, 기한 지난 항목 우선)
  function _reviewGroups(items) {
    var order = [], cnt = {};
    items.forEach(function(it) {
      if (!it || !it.type) return;
      if (!(it.type in cnt)) { cnt[it.type] = 0; order.push(it.type); }
      cnt[it.type]++;
    });
    return order.filter(function(t) { return _can('DrillUI', 'start') && !!_call('Drills', 'get', t); })
      .map(function(t) { return { type: t, count: cnt[t] }; });
  }
  function _review(items, i) {
    var groups = _reviewGroups(items);
    if (!groups.length) return false;
    _launchReview(_base(i, 'review', { groups: groups, sub: 0, acc: { n: 0, ok: 0 } }));
    return true;
  }
  function _launchReview(p) {
    var g = p.groups[p.sub];
    p.before = _drillStats(g.type);
    _setPending(p);
    _call('DrillUI', 'start', g.type, { count: g.count, dueFirst: true });
  }
  function _drillStats(t) { var st = _call('Drills', 'stats', t) || {}; return { n: _num(st.n, 0), ok: _num(st.ok, 0) }; }

  // 어댑터: 새 배움(placement, lesson, curriculum, drill, mission, gto)
  function _learn(b, i) {
    var s = _state();
    if (b.kind === 'placement') {
      if (!_can('PlacementView', 'open')) return false;
      _setPending(_base(i, 'placement', { inJourney: true }));
      var opened = true;
      if (_can('JourneyUI', 'view')) {
        JourneyUI.view('placement');
        if (_can('PlacementView', 'state')) opened = !!_call('PlacementView', 'state');
      } else opened = _call('PlacementView', 'open') !== false;
      if (!opened) { _setPending(null); return false; }   // 이미 봤거나 열 수 없음: 블록을 건너뛰고 다음으로
      return true;
    }
    if (b.kind === 'lesson') {
      var nd = _node(b.node), L = _m('LESSONS');
      if (nd && nd.lesson && _can('LessonPlayer', 'start') && Array.isArray(L) && L.some(function(l) { return l && (l.id === nd.lesson || l.node === nd.id); })) {
        var rec = (s.nodes || {})[nd.id] || {};
        _setPending(_base(i, 'lesson', { inJourney: true, node: nd.id }));
        _call('LessonPlayer', 'start', nd.lesson, _num(rec.lesson && rec.lesson.scene, 0), function(res) {
          if (!_pending || _pending.kind !== 'lesson') return;
          var fin = !(res && res.done === false);
          _finish(_pending, { done: fin, stats: fin ? { lesson: 1 } : null, line: fin ? nd.title + ' 레슨 완료' : '레슨을 끝까지 보지 않았어요(본 곳까지 저장됨)' });
        });
        return true;
      }
      // M3 전: 커리큘럼 페이지로 대체
    }
    if (b.kind === 'lesson' || b.kind === 'curriculum') {
      var n = _num(b.session, 0) || (_can('JourneyUI', 'curriculumFor') && b.node ? JourneyUI.curriculumFor(b.node) : null) ||
        _num(_plan_cs(), 0) || _num((_call('Storage', 'getProgress') || {}).currentSession, 1) || 1;
      if (!_can('Session', 'load') || !_can('App', 'showScreen')) return false;
      var wasDone = !!(b.node && ((s.nodes || {})[b.node] || {}).lesson && s.nodes[b.node].lesson.done);
      _setPending(_base(i, 'curriculum', { node: b.node || null, session: n, wasDone: wasDone }));
      _call('Session', 'load', n);
      _call('App', 'showScreen', 'screen-curriculum');
      return true;
    }
    if (b.kind === 'drill') {
      var dn = _node(b.node), t = dn && dn.drill && dn.drill.type;
      if (!t || !_can('DrillUI', 'start') || !_call('Drills', 'get', t)) return false;
      var p = _base(i, 'drill', { node: dn.id, type: t, before: _drillStats(t) });
      _setPending(p);
      _call('DrillUI', 'start', t, { count: _num(dn.drill.count, 10), spots: dn.drill.spots });
      return true;
    }
    if (b.kind === 'mission') {
      var mn = _node(b.node);
      if (!mn || !_can('App', 'selectVillains')) return false;
      _setPending(_base(i, 'game', { node: mn.id, mission: true }));
      _call('Journey', 'startSession', { kind: 'mission', node: mn.id, chunk: 5 });
      _call('App', 'selectVillains', _can('JourneyUI', 'missionConfig') ? JourneyUI.missionConfig(mn) : 'sixmax');
      return true;
    }
    // gto(기본): GTO 미러 5핸드(세션 핸드 수로 끊음)
    if (!_can('App', 'selectVillains')) return false;
    _setPending(_base(i, 'game', { node: b.node || null }));
    _call('Journey', 'startSession', { kind: 'free', node: null, chunk: _num(b.hands, 5) });
    _call('App', 'selectVillains', 'gto-mirror');
    return true;
  }
  function _plan_cs() { var p = plan(); return p && p.curriculumSession; }

  // 어댑터: 재미(M1 = 자유 게임 3핸드, 극장/명장면/러시는 해당 마일스톤 모듈이 생기면 그쪽)
  function _fun(b, i) {
    if (b.kind === 'rush' && _can('PuzzleModes', 'rush')) {
      _setPending(_base(i, 'external', { inJourney: true }));
      _call('PuzzleModes', 'rush', { onDone: function() { if (_pending) _finish(_pending, { done: true }); } });
      return true;
    }
    if (!_can('App', 'selectVillains')) return false;
    _setPending(_base(i, 'game', {}));
    _call('Journey', 'startSession', { kind: 'free', chunk: _num(b.hands, 3) });
    _call('App', 'selectVillains', 'sixmax');
    return true;
  }

  // ── 복귀 ──────────────────────────────────────────────
  function hasPending() { return !!_pending; }
  function pendingInfo() { return _pending ? { kind: _pending.kind, inJourney: !!_pending.inJourney, idx: _pending.idx } : null; }
  function running() { return _active || !!_pending; }
  function leave() { if (!_pending) { _active = false; _syncRunning(); } }

  function _handsSince(t) {
    var h = _call('Storage', 'getHandHistory');
    if (!Array.isArray(h)) return 0;
    return h.filter(function(x) { var d = x && Date.parse(x.date); return isFinite(d) && d >= t - 1000; }).length;
  }

  function resume() {
    var p = _pending;
    if (!p) { show(); return; }
    var now = _now(), r = { done: false };
    if (p.kind === 'review') {
      var g = p.groups[p.sub], a = _drillStats(g.type);
      var n = a.n - p.before.n, ok = a.ok - p.before.ok;
      if (n > 0) { p.acc.n += n; p.acc.ok += ok; _addXp('review', ok * _xpConst('review', 2)); }
      // 이 유형을 끝까지 풀었으면 다음 유형 바로 이어서. 중간에 나왔으면 거기까지를 블록 결과로
      if (n >= g.count && p.sub + 1 < p.groups.length) { p.sub++; _launchReview(p); return; }
      r.done = p.acc.n > 0;
      r.stats = { n: p.acc.n, ok: p.acc.ok };
      r.line = r.done ? '복습 ' + p.acc.n + '문제 중 ' + p.acc.ok + '개 정답' : '복습을 아직 풀지 않았어요';
    } else if (p.kind === 'curriculum') {
      if (p.node) {
        _call('Journey', 'completeLesson', p.node, 0, true, now);   // 첫 완료 레슨 XP는 Journey가 준다(중복 지급 금지)
        if (_can('JourneyUI', 'checkPass')) JourneyUI.checkPass(p.node);
      }
      r.done = true;
      r.stats = { lesson: 1 };
      r.line = '커리큘럼 세션 ' + p.session + ' 읽기 완료' + (p.node ? ', ' + _nodeTitle(p.node) + ' 레슨 표시' : '');
    } else if (p.kind === 'placement') {
      var pl = _state().placement || {};
      r.done = !!pl.done;
      r.line = r.done ? '실력 확인 끝! S' + _num(pl.stage, _num(_state().stage, 1)) + '부터 시작해요' : '실력 확인을 마치지 않았어요';
    } else if (p.kind === 'drill') {
      var d = _drillStats(p.type), dn = d.n - p.before.n, dok = d.ok - p.before.ok;
      if (dn > 0) {
        _call('Journey', 'recordDrillSet', p.node, { n: dn, ok: dok }, now);
        if (_can('JourneyUI', 'checkPass')) JourneyUI.checkPass(p.node);
      }
      r.done = dn > 0;
      r.stats = { n: dn, ok: dok };
      r.line = r.done ? _typeName(p.type) + ' ' + dn + '문항 중 ' + dok + '개 정답' : '드릴을 아직 풀지 않았어요';
    } else if (p.kind === 'game') {
      var hands = _handsSince(p.startedAt);
      if (_can('Journey', 'session') && _call('Journey', 'session') && _can('Journey', 'endSession')) _call('Journey', 'endSession');
      if (p.mission && p.node && _can('JourneyUI', 'checkPass')) JourneyUI.checkPass(p.node);
      r.done = hands > 0;
      r.stats = { hands: hands };
      r.line = r.done ? '실전 ' + hands + '핸드 완료' : '아직 한 핸드도 끝내지 않았어요';
    } else if (p.kind === 'lesson') {
      // 레슨 플레이어(M3)를 콜백 없이 빠져나온 경우: 저장된 레슨 완료 여부로 판정
      var lr = ((_state().nodes || {})[p.node] || {}).lesson || {};
      r.done = !!lr.done;
      r.stats = r.done ? { lesson: 1 } : null;
      r.line = r.done ? _nodeTitle(p.node) + ' 레슨 완료' : '레슨을 끝까지 보지 않았어요(본 곳까지 저장됨)';
    } else {
      r.done = true;
    }
    _finish(p, r);
  }

  function _finish(p, r) {
    _setPending(null);
    var now = _now();
    r.idx = p.idx;
    r.minutes = Math.min(30, Math.max(0.1, Math.round((now - p.startedAt) / 6000) / 10));
    r.xp = Math.max(0, _xpNow() - _num(p.xpStart, _xpNow()));
    onBlockDone(r);
  }

  // 블록 결과 반영: done이면 markBlock + touchDay(활동일), 아니면 다시 시도 카드
  function onBlockDone(result) {
    result = result || {};
    // 외부 모듈이 직접 알릴 때(PlacementView: { kind:'placement', applied, stage, ... }, idx 없음): 진행 중 블록의 결과로 마무리
    if (result.idx == null && _pending && (!result.kind || result.kind === _pending.kind)) {
      var pd = _pending, ok = (result.done != null) ? !!result.done : result.applied !== false;
      var ln = result.line || (pd.kind === 'placement' ?
        (ok ? '실력 확인 끝! S' + _num(result.stage, _num(_state().stage, 1)) + '부터 시작해요' : '실력 확인을 마치지 않았어요') : '');
      _finish(pd, { done: ok, stats: result.stats || null, line: ln });
      return;
    }
    var p = plan();
    if (!p) { show(); return; }
    var i = (result && result.idx != null) ? result.idx : _num(p.cur, 0);
    var b = p.blocks[i];
    if (!b) { show(); return; }
    var now = _now();
    if (result.done) {
      b.status = 'done';
      b.doneAt = _iso(now);
      b.minutes = _num(result.minutes, 0);
      b.xp = _num(result.xp, 0);
      if (result.stats) b.res = result.stats;
      p.xp = _num(p.xp, 0) + b.xp;
      p.minutes = Math.round((_num(p.minutes, 0) + b.minutes) * 10) / 10;
      _markBlock(b.id, b.minutes, b.xp, now);
    } else if (result.skipped) {
      b.status = 'skipped';
    }
    _savePlan(p);
    _last = { idx: i, line: result.line || '', retry: !result.done && !result.skipped, ok: !!result.done };
    show();
  }

  // Journey.markBlock은 안에서 touchDay(36h 스트릭)까지 한다. 같은 날 두 번째 touchDay는 변화 없음 결과라
  // 프리즈 사용/지급 표시가 지워지므로 다시 부르지 않고 lastTouch를 쓴다. 변화 있는 결과만 마무리 카드용으로 남긴다.
  function _markBlock(name, minutes, xp, now) {
    var st;
    if (_can('Journey', 'markBlock')) { _call('Journey', 'markBlock', name, minutes, xp, now); st = _call('Journey', 'lastTouch'); }
    else st = _call('Journey', 'touchDay', now);
    if (st && (st.changed || !_streak)) _streak = st;
  }

  function skip(i) {
    var p = plan();
    if (!p || !p.blocks[i]) return;
    p.blocks[i].status = 'skipped';
    _savePlan(p);
    _last = { idx: i, line: label(p.blocks[i]) + ' 건너뜀', retry: false, ok: false };
    show();
  }

  function stopHere() {
    if (_pending) _setPending(null);
    var p = plan();
    if (p && !p.finishedAt) { p.stoppedAt = _iso(_now()); _savePlan(p); }
    _active = false;
    _last = null;
    _syncRunning();
    if (_can('JourneyUI', 'open')) JourneyUI.open();
    if (p && !p.finishedAt) _toast('저장했어요. 다음에 남은 블록부터 이어서 해요', 2600);
  }

  // ── 셸 화면: 다음 블록 카드 ─────────────────────────────
  function _dots(p, cur) {
    var list = p.blocks.filter(function(b) { return b.id !== 'wrap'; });
    var done = list.filter(function(b) { return b.status === 'done'; }).length;
    return '<span class="j-dots" role="img" aria-label="블록 ' + list.length + '개 중 ' + done + '개 완료">' + list.map(function(b, k) {
      var c = b.status === 'done' ? 'is-done' : (b.status === 'skipped' ? 'is-skip' : (k === cur ? 'is-cur' : ''));
      return '<i class="' + c + '">' + (b.status === 'done' ? '✓' : (b.status === 'skipped' ? '↷' : (k === cur ? '●' : '○'))) + '</i>';
    }).join('') + '</span>';
  }
  function _desc(b) {
    if (b.id === 'review') {
      var g = _reviewGroups(b.items || []);
      return '때가 된 문제와 틀렸던 문제를 다시 풀어요' + (g.length ? '(' + g.map(function(x) { return _typeName(x.type) + ' ' + x.count; }).join(', ') + ')' : '');
    }
    switch (b.kind) {
      case 'placement': return '10문제로 시작 단계를 정해요. 결과는 한 번만 반영돼요';
      case 'lesson': case 'curriculum': {
        var n = _num(b.session, 0) || (_can('JourneyUI', 'curriculumFor') && b.node ? JourneyUI.curriculumFor(b.node) : null) || _plan_cs() || 1;
        var C = _m('CURRICULUM'), topic = '';
        if (Array.isArray(C)) { var it = C.filter(function(x) { return x && x.session === n; })[0]; if (it) topic = _clean(it.topic); }
        return '커리큘럼 세션 ' + n + (topic ? ' "' + topic + '"' : '') + '을 읽고 돌아와요';
      }
      case 'drill': return '노드 드릴을 풀어요. 결과가 통과 기준에 쌓여요';
      case 'mission': return '6인 테이블 5핸드. 결정 기록이 미션 진행에 쌓여요';
      case 'gto': return '같은 카드를 3번 치며 정답과 비교해요(5핸드)';
      default: return '6인 테이블에서 가볍게 ' + _num(b.hands, 3) + '핸드. 끝나면 요약에서 돌아와요';
    }
  }
  function show() {
    var p = plan();
    if (!p) { if (_can('JourneyUI', 'open')) JourneyUI.open(); return; }
    var i = (_last && _last.retry) ? _last.idx : _firstRemaining(p);
    if (i < 0 || p.blocks[i].id === 'wrap') { _wrap(); return; }
    _active = true;
    var b = p.blocks[i];
    var res = _last && _last.line ? '<div class="j-done-line' + (_last.ok ? ' is-ok' : '') + '">' + (_last.ok ? '✅ ' : 'ℹ ') + _esc(_last.line) +
      (_last.ok && p.blocks[_last.idx] && p.blocks[_last.idx].xp ? ', XP +' + p.blocks[_last.idx].xp : '') + '</div>' : '';
    var retry = !!(_last && _last.retry);
    var html = '<div class="j-today">' +
      '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여기까지 하고 여정 홈으로" onclick="TodayUI.stopHere()">↩</button>' +
        '<h2 class="j-sub-t">오늘의 ' + _goal(_state()) + '분</h2>' + _dots(p, i) + '</div>' + res +
      '<div class="j-block-card">' +
        '<div class="j-block-k">' + (ICON[b.id] || '•') + ' ' + (retry ? '다시 해 볼까요?' : '다음 블록') + ', ' + NAME[b.id] + '</div>' +
        '<div class="j-block-t">' + _esc(label(b)) + '</div>' +
        '<div class="j-block-d">' + _esc(_desc(b)) + '</div>' +
        '<div class="j-block-e">' + _estTxt(b) + '</div>' +
      '</div>' +
      '<div class="j-today-acts">' +
        '<button type="button" class="j-btn j-primary j-big" onclick="TodayUI.runBlock(' + i + ')">' + (retry ? '▶ 다시 시작' : '▶ 시작') + '</button>' +
        '<div class="j-row2"><button type="button" class="j-btn" onclick="TodayUI.skip(' + i + ')">건너뛰기</button>' +
        '<button type="button" class="j-btn j-ghost" onclick="TodayUI.stopHere()">여기까지</button></div>' +
      '</div></div>';
    if (_can('JourneyUI', 'mountView')) JourneyUI.mountView('today', html);
  }

  // ── 마무리 ────────────────────────────────────────────
  // 완주 = 할 일이 있던 블록을 전부 끝냄(할 게 없어 자동으로 넘긴 블록은 제외, 직접 건너뛴 블록이 있으면 완주 아님)
  function _allDone(p) {
    return p.blocks.every(function(b) { return b.id === 'wrap' || b.status === 'done' || (b.status === 'skipped' && b.auto); }) &&
      p.blocks.some(function(b) { return b.id !== 'wrap' && b.status === 'done'; });
  }
  // 오늘의 5분 완주 XP(todayDone, 하루 1회)는 Journey.markBlock('wrap')이 준다. 완주일 때만 부르고 여기서 따로 주지 않는다.
  function _complete(p) {
    if (!p || p.finishedAt) return;
    var now = _now(), s = _state(), rec = _dayRec(s, true, p.day);
    var all = _allDone(p);
    var xp0 = _xpNow();
    if (all) {
      if (!rec.todayDoneAt) { rec.todayDoneAt = _iso(now); _save(s); }
      if (_can('Journey', 'markBlock')) _markBlock('wrap', 0.5, 0, now);
    }
    var gained = Math.max(0, _xpNow() - xp0);
    p = plan() || p;
    var w = p.blocks[p.blocks.length - 1];
    w.status = 'done';
    w.doneAt = _iso(now);
    w.xp = gained;
    p.xp = _num(p.xp, 0) + gained;
    p.finishedAt = _iso(now);
    _savePlan(p);
  }
  function _infoLine(p) {
    var now = _now();
    var lb = p.blocks.filter(function(b) { return b.id === 'learn'; })[0];
    var nd = lb && _node(lb.node);
    var concept = (nd && nd.concept && CONCEPT_LABEL[nd.concept]) ? nd.concept : 'pot_odds';
    var a7 = _call('JStats', 'accuracy', concept, 7, now), a14 = _call('JStats', 'accuracy', concept, 14, now);
    var name = CONCEPT_LABEL[concept] || concept;
    if (a7 && a14 && _num(a7.n, 0) >= 5 && _num(a14.n, 0) - _num(a7.n, 0) >= 5) {
      var pn = a14.n - a7.n, pg = a14.g - a7.g;
      return name + ' 판단 지난주 ' + Math.round(pg / pn * 100) + '% → 이번주 ' + Math.round(a7.g / a7.n * 100) + '%';
    }
    if (a7 && _num(a7.n, 0) > 0) return '이번 주 ' + name + ' 판단 ' + a7.n + '번 중 초록 ' + _num(a7.g, 0) + '번';
    // 집계가 아직 없으면 오늘 계획의 블록 결과로(게임 중 차트 판정 기록과 섞지 않음)
    var q = { n: 0, ok: 0 }, hands = 0, lessons = 0;
    p.blocks.forEach(function(b) {
      var r = b.status === 'done' && b.res;
      if (!r) return;
      if (r.n) { q.n += r.n; q.ok += _num(r.ok, 0); }
      hands += _num(r.hands, 0); lessons += _num(r.lesson, 0);
    });
    var parts = [];
    if (q.n) parts.push('문제 ' + q.n + '개 중 ' + q.ok + '개 정답');
    if (lessons) parts.push('레슨 ' + lessons + '개');
    if (hands) parts.push('실전 ' + hands + '핸드');
    if (parts.length) return '오늘 ' + parts.join(', ');
    var k = p.blocks.filter(function(b) { return b.id !== 'wrap' && b.status === 'done'; }).length;
    return '오늘 블록 ' + k + '개를 마쳤어요';
  }
  function _streakLine() {
    var s = _state(), st = _streak || {};
    var cur = _num(st.cur, _num((s.streak || {}).cur, 0)), best = _num(st.best, _num((s.streak || {}).best, 0));
    if (!cur) return '';
    var out = '🔥 ' + cur + '일째';
    if ([7, 14, 30, 60, 100, 200].indexOf(cur) >= 0) out = '🔥 ' + cur + '일 연속 달성!';
    else if (cur === 1 && best > 1) out = '🔥 새로 1일째. 습관은 하루로 깨지지 않아요';
    if (st.freezeUsed) out += ', ❄ 프리즈로 이어졌어요';
    if (st.freezeGranted) out += ', ❄ 프리즈 1개 받음';
    return out;
  }
  function _nextLine() {
    var sm = _can('JourneyUI', 'summary') ? JourneyUI.summary() : {};
    var nn = sm.nextNode;
    if (!nn || !nn.id) return '';
    var step = { lesson: '레슨', drill: '드릴', mission: '실전', boss: '승급 시험' }[nn.step] || '';
    // 할 수 있는 다음 단계가 이번 버전에 없으면(JourneyUI.nextDoable도 대안을 못 찾음) 막다른 안내 대신 사유와 대안
    if (step && _can('JourneyUI', 'canDo') && !JourneyUI.canDo(nn.step, _node(nn.id))) {
      return _nodeTitle(nn.id) + ' ' + step + '은 다음 업데이트에서 열려요. 그동안 오늘의 5분으로 실전 감각을 쌓아요';
    }
    return '다음 할 일: ' + _nodeTitle(nn.id) + (step ? ', ' + step : '');
  }
  function _wrap() {
    var p = plan();
    if (!p) { if (_can('JourneyUI', 'open')) JourneyUI.open(); return; }
    _complete(p);
    p = plan() || p;
    _active = true;
    var all = _allDone(p);
    var sl = _streakLine(), nl = _nextLine();
    var html = '<div class="j-today j-wrap">' +
      '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여정 홈으로" onclick="TodayUI.finish()">↩</button>' +
        '<h2 class="j-sub-t">마무리</h2>' + _dots(p, -1) + '</div>' +
      '<div class="j-wrap-card">' +
        '<div class="j-wrap-t">' + (all ? '🎉 오늘의 ' + _goal(_state()) + '분 완주!' : '✅ 오늘은 여기까지 완료') + '</div>' +
        '<div class="j-wrap-line">📈 ' + _esc(_infoLine(p)) + '</div>' +
        '<div class="j-wrap-stats"><span>⭐ XP +' + _num(p.xp, 0) + '</span>' + (p.minutes ? '<span>⏱ ' + p.minutes + '분</span>' : '') + '</div>' +
        (sl ? '<div class="j-wrap-streak">' + _esc(sl) + '</div>' : '') +
        (nl ? '<div class="j-wrap-next">🧭 ' + _esc(nl) + '</div>' : '') +
      '</div>' +
      '<div class="j-today-acts"><button type="button" class="j-btn j-primary j-big" onclick="TodayUI.finish()">여정 홈으로</button></div></div>';
    if (_can('JourneyUI', 'mountView')) JourneyUI.mountView('today', html);
  }
  function finish() {
    var p = plan();
    if (p) _complete(p);
    _active = false;
    _last = null;
    _syncRunning();
    if (_can('JourneyUI', 'open')) JourneyUI.open();
  }

  var api = {
    start: start, again: again, runBlock: runBlock, stopHere: stopHere, finish: finish, onBlockDone: onBlockDone, skip: skip,
    resume: resume, show: show, leave: leave, running: running, hasPending: hasPending, pendingInfo: pendingInfo,
    preview: preview, plan: plan, build: build, ctx: ctx, label: label,
    _review: _review, _learn: _learn, _fun: _fun, _wrap: _wrap
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
