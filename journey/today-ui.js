// journey/today-ui.js (채우는 패키지: M1-P3, M2 연결: M2-P7, M5-P8 실수 핸드 단계, M6-SEASON 월요일 주간 소개)
// ▶ 오늘의 5분 진행 셸: 계획(Today.build) → 블록 실행(기존 화면 어댑터) → 복귀 시 결과 반영 → 다음 블록 카드 → 마무리 카드.
// 계획과 진행은 poker_journey.daily[오늘].plan에 저장해 "여기까지" 뒤 다시 열면 남은 블록부터 이어간다.
// 블록 하나라도 끝나면 Journey.markBlock + Journey.touchDay(활동일, 36h 스트릭). 다른 패키지 모듈은 전부 typeof 가드.
// M2-P7 퍼즐 연결(계약 C5, C6, C7, C9)
//   ctx.puzzleTypes = Puzzles.types() 중 PuzzleUI.can을 통과한 유형(Today.build의 약점 채움 입력).
//   복습 블록: PuzzleUI.review가 있으면 퍼즐로 풀 수 있는 srs 항목과 채움 항목을 한 번에 넘긴다(1회). 퍼즐로 못 푸는 기존 유형은
//     DrillUI로 차례대로(PuzzleUI가 없으면 전부 M1처럼 DrillUI). block.daily5면 그 뒤 PuzzleModes.daily5를 열고, 끝나야 블록 완료.
//   새 배움 'drill': PuzzleUI.can(노드 드릴)이면 PuzzleUI.start, 아니면 DrillUI. 재미 'rush': PuzzleModes.rush.
//   퍼즐 결과 r = {n, ok, xp, rated, ratingDelta}: XP는 PuzzleUI/PuzzleModes가 이미 줬으므로 블록에는 r.xp만 기록한다(재지급 없음).
//   마무리 카드는 블록들의 ratingDelta 합이 있으면 레이팅 변화를 한 줄로 보인다.
// M4-P8 재미 블록 연결(계약 T8, T9)
//   'theater': TheaterUI.start({episodes, onDone, mini?}). 결과 r = {episodes, predicted, hit, hitW, cards[]}로 블록 결과 줄
//     '극장 n편, 예측 n번 중 m번 적중'을 만든다. 편마다 Journey.recordTheater는 TheaterUI가 부르고(XP 10 + 적중 건당 2),
//     블록 XP는 그 사이 늘어난 여정 XP(r.xp가 있으면 그것)다. TheaterUI가 한 편도 기록하지 않았으면(Journey 누적 편 수 그대로)
//     여기서 대신 기록한다(중복 없음). onDone(null)(열지 못함)이면 자유 게임 3핸드로 넘긴다. onDone 없이 떠나면 그동안
//     Journey에 쌓인 편 수로 판정한다. 극장은 #screen-game을 쓰므로 여정 화면이 다시 보이면 결과를 받는다(inJourney false).
//   'highlight': Journey.highlightOfDay(now) 카드를 TheaterUI.showCard({card, onDone})로 연다. 카드나 showCard가 없으면 자유 게임.
//     카드 보기는 여정 화면 위에서 돌 수 있으므로 inJourney true(여정 화면이 보여도 자동 복귀하지 않음).
//   'weeklyIntro'(M6-SEASON, 설계서 4.1절 3번, 계약 H5, H7): 월요일 재미 블록은 먼저 주간 챌린지 소개 화면을 그린다(Seasons.sync:
//     이번 주 테마와 조건 3칸, 조건 문장 3개, 지난주 결과, 이번 달 시즌). TheaterUI.miniStatus(now).canStart면 '🏆 미니시즌 우승 예측'
//     버튼(TheaterUI.openMini({ onDone }) → onDone에서, 열지 못하면 바로 이어서), '▶ 이어서 <원래 재미 블록>'은 introNext.
//     둘 다 b.introDone을 계획에 남기고 runBlock으로 이어 붙인 원래 재미 블록(follow)을 연다(그 뒤 진행은 원래 재미 블록과 같다).
//     소개를 그리면 Seasons.ack로 이번 주를 본 것으로 기록하고, 이번 주 소개를 이미 봤거나 Seasons가 없으면 바로 원래 재미 블록.
//   마무리 카드는 Seasons.sync로 주간 챌린지 진행 한 줄('🏆 주간 챌린지(테마) n/3칸' 또는 완료와 XP)을 덧붙인다.
//   마지막 블록의 결과 줄은 마무리 카드 위에 보인다(다음 블록 카드가 없으므로).
//   가정(P5와 맞출 것): 편마다 recordTheater를 onDone보다 먼저 부른다. start와 showCard는 onDone을 부른 뒤 화면을 직접 옮기지
//     않는다(다음 화면은 TodayUI가 그린다). 한 편도 못 보고 나오면 onDone({episodes:0, ...}), 열지 못할 때만 onDone(null).
// M5-P8 실수 핸드 단계(계약 F4)
//   ctx.mistakes가 없으면(Journey.todayCtx가 아직 채우지 않음) ReviewQueue.due(now, 3)로 채운다. Today.build가 복습 블록 끝에
//   { type:'mistake', key, box }를 붙인다. 복습 블록 단계 순서: 퍼즐 → DrillUI → 데일리 5 → 실수 핸드(ReviewQueue.practice 연쇄).
//   연쇄의 핸드마다 onItem으로 결과를 받아 블록 진행(b.prog)에 저장하고, 끝나면(onDone) 블록을 마친다. 연습은 XP와 레이팅에 없다.
//   이어하기: 블록 진행 b.prog = { pz, sub, n, ok, xp, rd, used, mk:[푼 키], mkN, mkOk, d5:{score,n,ok}|null }를 계획에 저장해 새로고침이나 다시 시작 때
//   끝난 단계(퍼즐 세트, DrillUI 묶음, 푼 실수 핸드)를 건너뛰고 쌓인 결과를 이어 센다. 실수 핸드 중 뒤로(안드로이드)나 메뉴로
//   여정에 돌아오면 resume이 연쇄를 정리(ReviewQueue.abort)하고 거기까지를 블록 결과로 낸다. 남은 실수 핸드는 다음 복습에 다시 나온다.
var TodayUI = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var ICON = { review: '🔁', learn: '📖', fun: '🎲', wrap: '🎉' };
  var NAME = { review: '복습', learn: '새 배움', fun: '재미', wrap: '마무리' };
  var CONCEPT_LABEL = { rfi: '오픈', vs_rfi: '상대 오픈 대응', blind_defense: '블라인드 방어', vs_3bet: '3벳 대응', pot_odds: '팟 오즈',
    draws: '드로우', cbet: 'c벳', value_bluff: '밸류와 블러프', board_texture: '보드 텍스처', turn_river: '턴, 리버', actions: '액션 기본',
    showdown: '쇼다운', order: '말하는 순서', outs: '아웃츠', equity: '에쿼티', combos: '콤보', mdf: 'MDF', alpha: '알파', spr: 'SPR',
    range: '레인지', texture: '보드 날씨', read: '상대 읽기', variance: '분산', tilt: '틸트', review: '복기' };
  var CACHE_MS = 5 * 60 * 1000;
  var FREE_HANDS = 3;       // 재미 블록 폴백 자유 게임 핸드 수(4.1절)

  var _active = false;      // 오늘의 5분 진행 중(셸 표시 또는 외부 블록 실행 중)
  var _pending = null;      // 외부 화면에서 실행 중인 블록 { idx, kind, startedAt, xpStart, ... }
  var _runDay = null;       // 진행 중인 계획을 시작한 날 키(자정을 넘겨도 그 날의 계획을 계속 읽는다, M7 TIME-02)
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
  // 기존 DrillUI 복습처럼 여정 XP를 스스로 주지 않는 화면만 쓴다(퍼즐 화면은 XP를 직접 준다). 반환 = 실제 지급량
  function _addXp(src, n) {
    if (!(n > 0) || !_can('JourneyUI', 'xp')) return 0;
    var r = JourneyUI.xp(src, n);
    return (r && isFinite(r.granted)) ? Math.max(0, r.granted) : 0;
  }
  function _closeNav(name) { if (_can('Nav', 'closeView')) _call('Nav', 'closeView', name); }
  // 화면을 여는 호출: 실패(예외)를 알 수 있게 true/false. 실패하면 호출자가 다음 단계나 기존 화면으로 넘어간다
  function _invoke(mod, fn, arg) {
    var o = _m(mod);
    if (!o || typeof o[fn] !== 'function') return false;
    try { o[fn](arg); return true; }
    catch (e) { if (typeof console !== 'undefined' && console.warn) console.warn('[TodayUI] ' + mod + '.' + fn + ' 실패:', e && e.message ? e.message : e); return false; }
  }

  // ── 퍼즐 모듈 판정(C5, C6) ─────────────────────────────
  function _pzCan(x) { return _can('PuzzleUI', 'can') && !!_call('PuzzleUI', 'can', x); }
  // Puzzles.types() 중 PuzzleUI.can을 통과한 유형(C9 ctx.puzzleTypes)
  function puzzleTypes() {
    if (!_can('Puzzles', 'types') || !_can('PuzzleUI', 'can')) return [];
    var list = _call('Puzzles', 'types');
    if (!Array.isArray(list)) return [];
    return list.filter(function(t) { return typeof t === 'string' && t && _pzCan(t); });
  }
  function _drillCan(t) { return !!t && t !== 'mixed' && t !== 'puzzle' && _can('DrillUI', 'start') && !!_call('Drills', 'get', t); }
  function _daily5Done() {
    if (_can('PuzzleModes', 'daily5Status')) {
      var st = _call('PuzzleModes', 'daily5Status', _now());
      if (st && typeof st === 'object') return !!st.done;
    }
    var r = _dayRec(_state(), false);
    return !!(r && r.daily5);
  }
  function _daily5Open(b) { return !!(b && b.daily5) && _can('PuzzleModes', 'daily5') && !_daily5Done(); }

  // ── 계획 저장(poker_journey.daily[day].plan) ─────────────────────
  function _dayRec(s, create, day) {
    s.daily = s.daily || {};
    day = day || _day();
    var r = s.daily[day];
    if (!r && create) r = s.daily[day] = { blocks: [], doneBlocks: 0, minutes: 0, xp: 0, daily5: null, plan: null };
    return r || null;
  }
  function _planOf(day) {
    var r = _dayRec(_state(), false, day);
    return (r && r.plan && Array.isArray(r.plan.blocks)) ? r.plan : null;
  }
  // 진행 중(_active 또는 _pending)이면 시작한 날의 계획, 아니면 오늘의 계획. 23:5x에 시작해 자정 뒤에 블록을 끝내도 결과가 버려지지 않는다.
  function plan() {
    if ((_active || _pending) && _runDay) { var rp = _planOf(_runDay); if (rp) return rp; }
    return _planOf(_day());
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
    c.puzzleTypes = puzzleTypes();                                          // C9: 약점 채움에 쓸 수 있는 퍼즐 유형
    // F4: 실수 핸드(Journey.todayCtx가 채우기 전에도). 연습을 열 수 없으면 계획에 넣지 않는다
    if (!_mkCan()) c.mistakes = [];
    else if (c.mistakes === undefined) {
      var mk = _call('ReviewQueue', 'due', _num(c.now, now), 3);
      c.mistakes = Array.isArray(mk) ? mk : [];
    }
    if (extra) Object.keys(extra).forEach(function(k) { c[k] = extra[k]; });
    return c;
  }
  // 실수 핸드 연습을 열 수 있나(ReviewQueue 연쇄와 App.startPractice)
  function _mkCan() { return _can('ReviewQueue', 'practice') && _can('App', 'startPractice'); }
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
  // 표시용 추정(초): 복습 10초, 레슨 장면 20초(커리큘럼 페이지는 약 2분), 게임 1핸드 60초, 극장 90초, 미니시즌 1편 180초(Today.SEC.mini)
  function _estSec(b) {
    if (b.id === 'review') {
      var rp = _reviewPlan(b);
      return rp.pz.reduce(function(a, it) { return a + (it.fill ? 25 : 10); }, 0) + rp.groups.reduce(function(a, g) { return a + g.count * 10; }, 0) +
        (rp.d5 ? 5 * 25 : 0) + rp.mk.length * 60;
    }
    if (b.id === 'wrap') return 30;
    if (b.kind === 'placement') return 180;
    if (b.kind === 'curriculum' || b.kind === 'lesson') return 120;
    if (b.kind === 'drill') { var n = _node(b.node); return (_num(b.count, 0) || (n && n.drill ? _num(n.drill.count, 10) : 10)) * 25; }
    if (b.kind === 'rush') return 180;
    if (b.id === 'fun' && b.fallback === 'free') return FREE_HANDS * 60;
    if (b.kind === 'theater') return b.mini ? 180 : 90 * _num(b.episodes, 1);   // (M7 통합 검증) 미니시즌 편 블록이 설명은 '약 3분', 추정 줄은 '약 2분'이던 것
    if (b.kind === 'highlight') return 90;
    if (b.kind === 'weeklyIntro' && b.follow && typeof b.follow === 'object') return _estSec(b.follow);
    if (b.kind === 'mission') return _num(b.hands, 5) * 60;
    return _num(b.hands, b.id === 'fun' ? 3 : 5) * 60;
  }
  function _estTxt(b) { var m = Math.max(1, Math.round(_estSec(b) / 60)); return '약 ' + m + '분'; }

  // 복습 블록은 퍼즐로 풀 항목, DrillUI로 풀 항목, 오늘 미완 데일리 5 중 하나라도 있어야 할 일이 있다
  function _blockReady(b) {
    if (b.id !== 'review') return true;
    var rp = _reviewPlan(b);
    return rp.pz.length > 0 || rp.groups.length > 0 || rp.d5 || rp.mk.length > 0;
  }
  function _firstRemaining(p) {
    for (var i = 0; i < p.blocks.length; i++) if (p.blocks[i].status !== 'done' && p.blocks[i].status !== 'skipped') return i;
    return -1;
  }
  function _left(p) { return p.blocks.filter(function(b) { return b.id !== 'wrap' && b.status !== 'done' && b.status !== 'skipped'; }).length; }

  // 칩 문구
  function label(b) {
    if (b.id === 'review') {
      var rp = _reviewPlan(b), n = rp.total, m = rp.mk.length, parts = [];
      if (n) parts.push('복습 ' + n);
      if (rp.d5) parts.push('데일리 5');
      if (m) parts.push('실수 핸드 다시 풀기 ' + m);
      return parts.length ? parts.join(', ') : '복습 없음';
    }
    if (b.id === 'wrap') return '마무리';
    if (b.id === 'fun' && b.fallback === 'free') return '자유 게임 ' + FREE_HANDS + '핸드';   // 극장, 명장면을 열 수 없어 바꿈
    var t = _nodeTitle(b.node);
    switch (b.kind) {
      case 'placement': return '실력 확인 3분';
      case 'lesson': case 'curriculum': return '레슨 ' + (t || '커리큘럼');
      case 'drill': return '드릴 ' + t;
      case 'mission': return '미션 ' + t;
      case 'gto': return 'GTO 미러 ' + _num(b.hands, 5) + '핸드';
      case 'boss': return (t || '승급 시험') + ' 도전';
      case 'endgame': return '엔드게임 실전 ' + _num(b.hands, 5) + '핸드';
      case 'theater': return b.mini ? '미니시즌 ' + _miniNo(b) + '편' : '극장 ' + _num(b.episodes, 1) + '편';
      case 'highlight': return '오늘의 명장면';
      case 'rush': return '퍼즐 러시';
      case 'weeklyIntro': return (b.follow && typeof b.follow === 'object' && b.follow.kind) ? '주간 챌린지, ' + label(_funFollow(b.follow)) : '주간 챌린지';
      default: return '자유 게임 ' + _num(b.hands, 3) + '핸드';
    }
  }

  // 드릴 블록 설명(M7 통합 검증): 드릴 통과는 한 세트의 정답률(Journey.recordDrillSet의 best)이라 세트끼리 쌓이지 않는다.
  // '결과가 통과 기준에 쌓여요'로 읽혀 20문항 노드(10문항씩 이틀)를 이어 모으면 되는 줄 알던 것을, 이 세트에서 몇 개를 맞히면 되는지로
  function _drillDesc(b) {
    var nd = _node(b.node), dr = nd && nd.drill, c = dr ? _num(dr.count, 0) : 0, p = dr ? _num(dr.pass, c) : 0;
    var n = _num(b.count, 0) || Math.min(10, c);
    if (!(c > 0 && p > 0 && n > 0)) return '노드 드릴을 풀어요. 한 세트의 정답률이 통과 기준을 넘으면 드릴 통과예요';
    var k = Math.min(n, Math.ceil(n * Math.min(1, p / c) - 1e-9));
    return '노드 드릴 ' + n + '문항. 이번 세트에서 ' + k + '개 이상 맞히면 드릴 통과예요' + (n !== c ? '(통과 기준 ' + c + '문항 중 ' + p + '개와 같은 비율)' : '');
  }
  // 주간 소개 뒤에 이어 붙인 원래 재미 블록을 재미 블록처럼(미니시즌 편 표시 mini, episode까지 그대로, M7 통합 검증)
  function _funFollow(f) {
    var o = { id: 'fun' };
    for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k) && k !== 'id') o[k] = f[k];
    return o;
  }
  // 미니시즌 편 번호 'n/전체'(Today가 실은 b.episode = poker_journey.theater.mini 사본, M6 통합 검증)
  function _miniNo(b) {
    var m = (b && b.episode && typeof b.episode === 'object') ? b.episode : {};
    return Math.max(1, Math.floor(_num(m.episode, 1))) + '/' + Math.max(1, Math.floor(_num(m.total, 3)));
  }

  // 홈 버튼과 칩: { state:'new'|'progress'|'done', left, estMin, chips }
  function preview() {
    var s = _state(), day = _day(), p = _planOf(day);
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
    var day = _day(), cur = _planOf(day);
    if (!p) {
      if (cur && cur.day === day && !cur.finishedAt) p = cur;
      else if (cur && cur.day === day && cur.finishedAt) { p = build({ prevPlan: cur }); p.round = _num(cur.round, 1) + 1; }
      else p = (_cache && _cache.day === day && _now() - _cache.at <= CACHE_MS) ? _cache.plan : build();
    } else _normalize(p, { now: _now() });
    _cache = null;
    p.startedAt = p.startedAt || _iso(_now());
    p.stoppedAt = null;
    _runDay = p.day || day;
    _savePlan(p);
    _active = true;
    _last = null;
    _next(p);
  }
  function again() {
    var cur = _planOf(_day());
    var p = build({ prevPlan: cur || null, more: true });   // '더 하기': 첫 라운드가 시간 예산 때문에 뺀 데일리 5도 이번에는 넣는다(M7 결정 32)
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
    if (p.day) _runDay = p.day;
    _last = null;
    p.cur = i;
    _savePlan(p);
    if (b.id === 'wrap') { _wrap(); return; }
    var launched = false;
    if (b.id === 'review') launched = _review(b, i);
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

  // 어댑터: 복습
  // 단계 1 퍼즐(PuzzleUI.review 1회: 퍼즐로 풀 수 있는 srs 항목 + 채움 항목) → 단계 2 DrillUI(퍼즐로 못 푸는 기존 유형, 유형별 순차,
  // 기한 지난 항목 우선) → 단계 3 데일리 5(block.daily5이고 오늘 미완일 때, 4.1절 "복습 블록 끝"). PuzzleUI가 없으면 M1처럼 전부 DrillUI.
  // 채움 항목의 구형 type 'puzzle'은 개념(concept)으로 등록 유형을 골라 바꾸고, 고를 수 없으면 뺀다.
  var FILL_TYPE = { pot_odds: 'potodds', rfi: 'preflop', vs_rfi: 'preflop', blind_defense: 'preflop', vs_3bet: 'preflop', draws: 'outs',
    outs: 'outs', showdown: 'showdown', order: 'order', actions: 'tocall', equity: 'eqbucket', combos: 'combos', mdf: 'mdf', alpha: 'alpha',
    spr: 'spr', value_bluff: 'bluffratio', board_texture: 'texture', texture: 'texture', range: 'rangehit', turn_river: 'facingbet-river' };
  function _fillType(concept, usable) {
    if (!concept) return null;
    var P = _m('Puzzles');
    for (var i = 0; i < usable.length; i++) {
      var m = null;
      try { m = (P && typeof P.meta === 'function') ? P.meta(usable[i]) : null; } catch (e) { m = null; }
      if (m && m.concept === concept) return usable[i];
    }
    var t = FILL_TYPE[concept];
    return (t && usable.indexOf(t) >= 0) ? t : null;
  }
  // 블록 → { pz: PuzzleUI.review 항목, groups: DrillUI [{type, count}], d5: 데일리 5를 열지, total: 퍼즐과 드릴 문항 수,
  //          mk: 실수 핸드 [{type:'mistake', key, box}](연습을 열 수 있을 때만) }
  // live(블록 실행): 블록 진행(b.prog)에서 끝난 단계와 푼 실수 핸드를 빼고, 실수 핸드는 지금도 기한인 것만 남긴다.
  function _reviewPlan(b, live) {
    var items = (b && b.items) || [];
    var useP = _can('PuzzleUI', 'review');
    var types = useP ? puzzleTypes() : [];
    var pz = [], order = [], cnt = {}, mk = [], mkSeen = {};
    var prog = live ? _prog(b) : null, canMk = _mkCan(), now = _now();
    items.forEach(function(it) {
      if (!it || !it.type) return;
      var t = it.type;
      if (t === 'mistake') {
        if (!canMk || typeof it.key !== 'string' || !it.key || mkSeen[it.key]) return;
        mkSeen[it.key] = true;
        if (live && !_mkLive(it.key, prog, now)) return;
        mk.push({ type: 'mistake', key: it.key, box: it.box == null ? null : it.box });
        return;
      }
      if (t === 'puzzle') {                         // 구형 채움 항목: 개념으로 유형을 고른다(퍼즐 우선, 없으면 DrillUI 유형)
        var drillTypes = ['preflop', 'potodds'].filter(_drillCan);
        t = _fillType(it.concept, types) || _fillType(it.concept, drillTypes);
        if (!t) return;
      }
      if (useP && types.indexOf(t) >= 0) {
        var q = { type: t, key: it.key == null ? null : it.key, box: it.box == null ? null : it.box };
        if (it.fill) q.fill = true;
        if (it.concept) q.concept = it.concept;
        if (Array.isArray(it.spots)) q.spots = it.spots.slice();
        pz.push(q);
        return;
      }
      if (!_drillCan(t)) return;
      if (!(t in cnt)) { cnt[t] = 0; order.push(t); }
      cnt[t]++;
    });
    var groups = order.map(function(t) { return { type: t, count: cnt[t] }; });
    if (prog && prog.pz) pz = [];
    if (prog && prog.sub > 0) groups = groups.slice(prog.sub);
    var total = pz.length + groups.reduce(function(a, g) { return a + g.count; }, 0);
    return { pz: pz, groups: groups, d5: _daily5Open(b), total: total, mk: mk };
  }
  // 블록 진행(이어하기용, 계획에 저장). 없으면 null
  function _prog(b) {
    var g = b && b.prog;
    if (!g || typeof g !== 'object') return null;
    return { pz: !!g.pz, sub: Math.max(0, Math.floor(_num(g.sub, 0))), n: Math.max(0, _num(g.n, 0)), ok: Math.max(0, _num(g.ok, 0)),
      xp: Math.max(0, _num(g.xp, 0)), rd: _num(g.rd, 0), used: !!g.used,
      mk: Array.isArray(g.mk) ? g.mk.filter(function(k) { return typeof k === 'string'; }) : [],
      mkN: Math.max(0, _num(g.mkN, 0)), mkOk: Math.max(0, _num(g.mkOk, 0)),
      d5: (g.d5 && typeof g.d5 === 'object' && g.d5.score != null && isFinite(Number(g.d5.score))) ?
        { score: Number(g.d5.score), n: Math.max(0, _num(g.d5.n, 0)), ok: Math.max(0, _num(g.d5.ok, 0)) } : null };
  }
  // 실행할 실수 핸드인가: 이 블록에서 아직 안 풀었고, 큐에 있고 졸업 전이며 지금 기한
  function _mkLive(key, prog, now) {
    if (prog && prog.mk.indexOf(key) >= 0) return false;
    if (!_can('ReviewQueue', 'get')) return true;
    var it = _call('ReviewQueue', 'get', key);
    return !!(it && _num(it.box, 0) < 4 && it.due != null && _num(it.due, Infinity) <= now);
  }
  function _review(b, i) {
    if (Array.isArray(b)) b = { id: 'review', items: b };   // 구 호출 형식(items 배열)
    var rp = _reviewPlan(b, true), prog = _prog(b);
    var p = _base(i, 'review', { pz: rp.pz, groups: rp.groups, sub: 0, sub0: prog ? prog.sub : 0, d5: rp.d5, acc: { n: 0, ok: 0 },
      xpR: 0, xpOwn: 0, rd: 0, pzDone: !rp.pz.length, pzOk: !!(prog && prog.pz), d5Done: false, d5Res: null, used: false,
      mk: rp.mk, mkDone: !rp.mk.length, mkKeys: [], mkAcc: { n: 0, ok: 0 }, mkN0: 0 });
    if (prog) {                                // 이어하기: 앞서 끝낸 단계의 결과를 이어 센다
      p.acc.n = prog.n; p.acc.ok = prog.ok; p.xpR = prog.xp; p.rd = prog.rd; p.used = prog.used;
      p.mkKeys = prog.mk.slice(); p.mkAcc = { n: prog.mkN, ok: prog.mkOk }; p.mkN0 = prog.mkN;
      if (prog.d5) { p.d5Done = true; p.d5Res = prog.d5; }          // 끝낸 데일리 5 점수도 결과 줄에
    }
    if (!rp.pz.length && !rp.groups.length && !rp.d5 && !rp.mk.length) {
      if (prog && (p.acc.n > 0 || p.mkAcc.n > 0 || p.d5Done)) { _finishReview(p); return true; }   // 남은 단계 없이 쌓인 결과만: 블록 마무리
      return false;
    }
    p.init = true;
    _reviewStep(p);
    p.init = false;
    return !p.launchFail;
  }
  // 블록 진행을 계획에 저장(새로고침 뒤 이어하기)
  function _saveProg(p) {
    var pl = plan(), b = pl && pl.blocks[p.idx];
    if (!b || b.id !== 'review') return;
    var d5 = (p.d5Done && p.d5Res) ? { score: Number(p.d5Res.score), n: _num(p.d5Res.n, 0), ok: _num(p.d5Res.ok, 0) } : null;
    b.prog = { pz: !!p.pzOk, sub: p.sub0 + p.sub, n: p.acc.n, ok: p.acc.ok, xp: p.xpR + p.xpOwn, rd: p.rd, used: !!p.used,
      mk: p.mkKeys.slice(), mkN: p.mkAcc.n, mkOk: p.mkAcc.ok, d5: d5 };
    _savePlan(pl);
  }
  // 다음 단계 실행(남은 게 없으면 블록 마무리)
  function _reviewStep(p) {
    if (!p.pzDone) {
      p.phase = 'puzzle'; p.inJourney = true; p.phaseXp = _xpNow();
      _setPending(p);
      var ok1 = _invoke('PuzzleUI', 'review', { items: p.pz, onDone: function(r) {
        if (_pending !== p || p.phase !== 'puzzle') return;
        p.pzDone = true;
        _closeNav('puzzle');
        _accPuzzle(p, r);
        if (_stopped(r)) { _finishReview(p); return; }
        if (_num(r && r.n, 0) > 0) { p.pzOk = true; _saveProg(p); }
        _reviewStep(p);
      } });
      if (!ok1 && _pending === p && p.phase === 'puzzle') { p.pzDone = true; _reviewStep(p); }   // 퍼즐 화면 실패: 다음 단계로
      return;
    }
    if (p.sub < p.groups.length) { p.phase = 'drill'; p.inJourney = false; _launchReview(p); return; }
    if (p.d5 && !p.d5Done && _can('PuzzleModes', 'daily5') && !_daily5Done()) {
      p.phase = 'daily5'; p.inJourney = true; p.phaseXp = _xpNow();
      _setPending(p);
      var ok2 = _invoke('PuzzleModes', 'daily5', { onDone: function(r) {
        if (_pending !== p || p.phase !== 'daily5') return;
        p.d5Done = true;
        // 5문제를 끝까지 풀어 점수가 나온 경우만 완료. 중간에 ↩/뒤로로 나오거나(aborted) 열지 못하면(null) 미완
        p.d5Res = _d5Complete(r) ? r : null;
        p.d5Quit = !p.d5Res;
        _closeNav('puzzle');                     // 퍼즐 모드 해시는 #j/puzzle/daily5(뷰 이름 'puzzle')
        p.used = true;
        p.xpR += _xpOf(r, p.phaseXp);
        p.rd += _num(r && r.ratingDelta, 0);
        if (p.d5Quit) { _finishReview(p); return; }   // 중간에 나옴: 거기까지(실수 핸드는 다음 복습에)
        if (p.mk.length && !p.mkDone) _saveProg(p);
        _reviewStep(p);
      } });
      if (!ok2 && _pending === p && p.phase === 'daily5') { p.d5 = false; _reviewStep(p); }
      return;
    }
    if (p.mk.length && !p.mkDone) { _mistakeStep(p); return; }
    _finishReview(p);
  }
  // 실수 핸드 다시 풀기(F4): ReviewQueue.practice 연쇄. 핸드마다 onItem(진행 저장), 끝나면 onDone(블록 마무리)
  function _mistakeStep(p) {
    p.phase = 'mistake'; p.inJourney = false;
    _setPending(p);
    var opts = { tag: 'today', onItem: function(r) {
      if (_pending !== p || p.phase !== 'mistake' || !r || !r.key) return;
      if (p.mkKeys.indexOf(r.key) < 0) {
        p.mkKeys.push(r.key);
        p.mkAcc.n++;
        if (r.ok) p.mkAcc.ok++;
        _saveProg(p);
      }
    }, onDone: function(res) {
      if (_pending !== p || p.phase !== 'mistake') return;
      p.mkDone = true;
      p.mkRes = res || null;
      _finishReview(p);
    } };
    var started = _call('ReviewQueue', 'practice', p.mk.map(function(m) { return m.key; }), opts) === true;
    if (started || _pending !== p) return;
    // 연습을 열지 못함: 블록의 첫 단계였으면 할 일 없는 블록으로(runBlock이 건너뜀), 아니면 거기까지를 결과로
    p.mkDone = true; p.mkFail = true;
    if (p.init && !p.used && !p.acc.n && !p.mkAcc.n) { _setPending(null); p.launchFail = true; return; }
    _finishReview(p);
  }
  // 퍼즐 화면이 중간 종료를 알렸는지(계약 밖 표시도 너그럽게 받는다)
  function _stopped(r) { return !!(r && (r.aborted || r.quit || r.stopped || r.done === false)); }
  // 데일리 5 결과가 완주인지: 중간 종료가 아니고 점수(0~100)가 있을 때만
  function _d5Complete(r) { return !!r && !_stopped(r) && r.score != null && isFinite(Number(r.score)); }
  // r.xp가 있으면 그것, 없으면 그 단계 동안 늘어난 XP(표시용, 지급은 하지 않음)
  function _xpOf(r, xp0) { return (r && isFinite(r.xp)) ? Math.max(0, Number(r.xp)) : Math.max(0, _xpNow() - _num(xp0, _xpNow())); }
  function _accPuzzle(p, r) {
    var n = Math.max(0, Math.floor(_num(r && r.n, 0))), ok = Math.max(0, Math.min(n, Math.floor(_num(r && r.ok, 0))));
    p.acc.n += n; p.acc.ok += ok;
    p.used = true;
    p.xpR += _xpOf(r, p.phaseXp);
    p.rd += _num(r && r.ratingDelta, 0);
  }
  function _finishReview(p) {
    var r = { stats: { n: p.acc.n, ok: p.acc.ok } };
    var d5 = p.d5Done && p.d5Res;
    var sc = d5 ? Number(p.d5Res.score) : NaN;
    var mk = p.mkAcc || { n: 0, ok: 0 };
    r.done = p.acc.n > 0 || !!d5 || mk.n > 0;
    var parts = [];
    if (p.acc.n > 0) parts.push('복습 ' + p.acc.n + '문제 중 ' + p.acc.ok + '개 정답');
    if (d5) parts.push('데일리 5 ' + Math.round(sc) + '점');
    if (mk.n > 0) {
      parts.push('실수 핸드 ' + mk.n + '개 다시 풀기, ' + mk.ok + '개 바로잡음');
      r.stats.mk = mk.n; r.stats.mkOk = mk.ok;
    }
    var d5Left = p.phase === 'daily5' && !d5;       // 데일리 5를 열었지만 끝내지 않음(홈 카드에서 다시 할 수 있다)
    // 실수 핸드를 남김: 연쇄를 중간에 나왔거나, 앞 단계에서 멈춰 실수 핸드 단계까지 가지 못함
    var mkLeft = !!(p.mk && p.mk.length) && !p.mkFail && (mk.n - _num(p.mkN0, 0)) < p.mk.length;
    var mkNote = mkLeft ? '(남은 실수 핸드는 다음 복습에 다시 나와요)' : ((p.mkFail && !mk.n) ? '(실수 핸드 연습을 열지 못했어요)' : '');
    r.line = parts.length ? parts.join(', ') + (d5Left ? '(데일리 5는 홈 카드에서 다시 할 수 있어요)' : mkNote)
      : (d5Left ? '데일리 5를 끝내지 않았어요' : (p.phase === 'mistake' ? '실수 핸드를 아직 다시 풀지 않았어요' : '복습을 아직 풀지 않았어요'));
    if (d5) {
      r.stats.daily5 = Math.round(sc);
      // 마무리 카드의 "오늘 문제 n개"에 데일리 5 문항도 센다(복습 줄의 n, ok는 복습 퍼즐만 그대로)
      r.stats.d5n = Math.max(0, Math.floor(_num(p.d5Res.n, 0)));
      r.stats.d5ok = Math.max(0, Math.min(r.stats.d5n, Math.floor(_num(p.d5Res.ok, 0))));
    }
    if (p.used) r.xp = p.xpR + p.xpOwn;      // 퍼즐 단계가 있었으면 r.xp 합(+ DrillUI 단계에서 여기서 준 XP). 없으면 M1처럼 XP 차이
    if (p.rd) r.ratingDelta = p.rd;
    _finish(p, r);
  }
  function _launchReview(p) {
    var g = p.groups[p.sub];
    p.before = _drillStats(g.type);
    _setPending(p);
    _call('DrillUI', 'start', g.type, { count: g.count, dueFirst: true });
  }
  function _drillStats(t) { var st = _call('Drills', 'stats', t) || {}; return { n: _num(st.n, 0), ok: _num(st.ok, 0) }; }

  // 이 노드의 레슨을 M3 레슨 플레이어로 볼 수 있나(없으면 커리큘럼 페이지로 대체)
  function _lessonPlayable(nd) {
    var L = _m('LESSONS');
    return !!(nd && nd.lesson && _can('LessonPlayer', 'start') && Array.isArray(L) &&
      L.some(function(l) { return l && (l.id === nd.lesson || l.node === nd.id); }));
  }
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
      var nd = _node(b.node);
      if (_lessonPlayable(nd)) {
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
      if (!t) return false;
      // 여정 드릴은 PuzzleUI(5.8절 2번). 세트 크기는 계획의 b.count(노드 지정 유형 10문항, 노드가 더 작으면 그 수)
      var spec = _learnSpec(dn, b);
      if (spec && _can('PuzzleUI', 'start') && _pzCan(spec)) {
        var pp = _base(i, 'puzzle', { inJourney: true, node: dn.id, type: t });
        _setPending(pp);
        spec.title = dn.title;
        spec.onDone = function(r) { if (_pending === pp) _onLearnPuzzle(pp, r); };
        if (_invoke('PuzzleUI', 'start', spec)) return true;
        if (_pending !== pp) return true;      // 예외 전에 onDone까지 끝남
        _setPending(null);                     // 퍼즐 화면 실패: 아래 기존 DrillUI로
      }
      if (!_drillCan(t)) return false;
      var p = _base(i, 'drill', { node: dn.id, type: t, before: _drillStats(t) });
      _setPending(p);
      _call('DrillUI', 'start', t, { count: _num(dn.drill.count, 10), spots: dn.drill.spots });
      return true;
    }
    if (b.kind === 'mission') {
      var mn = _node(b.node);
      if (!mn || !_can('App', 'selectVillains')) return false;
      _setPending(_base(i, 'game', { node: mn.id, mission: true }));
      _call('Journey', 'startSession', { kind: 'mission', node: mn.id, chunk: _num(b.hands, 5) });
      _call('App', 'selectVillains', _can('JourneyUI', 'missionConfig') ? JourneyUI.missionConfig(mn) : 'sixmax');
      return true;
    }
    // 승급 시험(M7 FLOW-05): 단계 학습 노드를 다 끝내고 시험만 남았을 때. 시험 카드를 열고(Boss.start), 시험 화면에서 드릴과 실전 핸드를 이어서 한다.
    // 여정 홈으로 돌아오면 resume이 시작 뒤 시험 기록(시도 시작, 드릴, 핸드, 결과)이 달라졌는지로 블록 완료를 정한다.
    if (b.kind === 'boss') {
      if (!_node(b.node) || !_can('Boss', 'start')) return false;
      // 드릴 미달 뒤 24시간 재도전 대기 중이면 시험을 열 수 없으니 이 블록은 시험 전과 같은 GTO 미러 실전으로 바꿔 진행한다
      if (_num(_call('Boss', 'retryWait', b.node, _now()), 0) > 0) {
        b.kind = 'gto'; b.node = null; b.hands = 5; b.waited = true;
        return _learn(b, i);
      }
      // 48시간이 지난 시도는 지문을 뜨기 전에 정리한다. Boss.start 안의 expire가 정리하면 시험을 하지 않고 돌아와도 지문이 달라져 완료로 보인다
      _call('Boss', 'expire', _now());
      var bp = _base(i, 'boss', { inJourney: true, node: b.node, sig: _bossSig(b.node) });
      _setPending(bp);
      if (_call('Boss', 'start', b.node, _now()) === false) { _setPending(null); return false; }
      return true;
    }
    // gto(기본): GTO 미러 5핸드, endgame: 6인 캐스트 5핸드(모든 노드를 통과한 뒤, M7 FLOW-05). 세션 핸드 수로 끊음
    if (!_can('App', 'selectVillains')) return false;
    _setPending(_base(i, 'game', { node: b.node || null }));
    _call('Journey', 'startSession', { kind: 'free', node: null, chunk: _num(b.hands, 5) });
    _call('App', 'selectVillains', b.kind === 'endgame' ? 'sixmax-cast' : 'gto-mirror');
    return true;
  }
  // 승급 시험 기록의 지문: 시도 시작/핸드/드릴 진행/결과/통과가 바뀌면 달라진다(블록을 여는 동안 시험이 진행됐는지 판정)
  function _bossSig(node) {
    var s = _state(), b = s.boss || {}, a = (b.active && b.active.node === node) ? b.active : null, rec = (s.nodes || {})[node] || {};
    var dr = a && a.drill ? [a.drill.passed ? 1 : 0, Array.isArray(a.drill.parts) ? a.drill.parts.length : 0] : null;
    return JSON.stringify([(b.last || {})[node] || null, a ? [a.startedAt, a.hands, dr] : null, rec.status || null]);
  }
  function _plan_cs() { var p = plan(); return p && p.curriculumSession; }

  // 새 배움 드릴 → PuzzleUI.start 명세(C5). 혼합 세트는 b.count에 맞춰 유형별 문항 수를 비례로 줄인다(합 = b.count)
  function _learnSpec(nd, b) {
    if (!_can('JourneyUI', 'puzzleSpec')) return null;
    var d = nd.drill || {}, full = 0;
    if (Array.isArray(d.set)) full = d.set.reduce(function(a, x) { return a + _num(x && x[1], 0); }, 0);
    else full = _num(d.count, 10);
    var want = _num(b && b.count, 0) > 0 ? Math.floor(b.count) : Math.min(10, full || 10);
    if (full > 0 && want > full) want = full;
    var spec = JourneyUI.puzzleSpec(nd, want);
    if (spec && Array.isArray(spec.set) && full > want) spec.set = _scaleSet(spec.set, want, full);
    return spec;
  }
  function _scaleSet(set, want, full) {
    var out = set.map(function(x) { return [x[0], Math.max(1, Math.round(_num(x[1], 0) * want / full))]; });
    var sum = out.reduce(function(a, x) { return a + x[1]; }, 0);
    for (var k = out.length - 1; sum > want && k >= 0; k--) { var cut = Math.min(out[k][1] - 1, sum - want); out[k][1] -= cut; sum -= cut; }
    for (var j = 0; sum < want; j = (j + 1) % out.length) { out[j][1]++; sum++; }
    return out;
  }
  // PuzzleUI 세트 결과(C5 r): 노드 드릴 기록과 통과 판정만. XP는 PuzzleUI가 줬으므로 블록에는 r.xp만 남긴다
  function _onLearnPuzzle(p, r) {
    var n = Math.max(0, Math.floor(_num(r && r.n, 0))), ok = Math.max(0, Math.min(n, Math.floor(_num(r && r.ok, 0))));
    _closeNav('puzzle');
    if (n > 0) {
      _call('Journey', 'recordDrillSet', p.node, { n: n, ok: ok }, _now());
      if (_can('JourneyUI', 'checkPass')) JourneyUI.checkPass(p.node);
    }
    var res = { done: n > 0, stats: { n: n, ok: ok }, xp: _xpOf(r, p.xpStart),
      line: n > 0 ? _typeName(p.type) + ' ' + n + '문항 중 ' + ok + '개 정답' : '드릴을 아직 풀지 않았어요' };
    if (_num(r && r.ratingDelta, 0)) res.ratingDelta = Number(r.ratingDelta);
    _finish(p, res);
  }

  // 어댑터: 재미(극장 > 오늘의 명장면 > 자유 게임 3핸드, 주말 러시. 모듈이 없거나 열지 못하면 자유 게임)
  function _fun(b, i) {
    if (b.kind === 'weeklyIntro' && b.follow && typeof b.follow === 'object' && !b.introDone) {
      if (_weeklyIntro(b, i)) return true;
      b.introDone = true;                     // 소개를 그릴 수 없거나 이번 주 소개를 이미 봤으면 원래 재미 블록으로
    }
    var fb = (b.kind === 'weeklyIntro' && b.follow && typeof b.follow === 'object') ? b.follow : b;   // 소개 뒤 이어 붙인 원래 재미 블록
    if (b.fallback) delete b.fallback;
    if (fb.kind === 'theater') {
      if (_theaterStart(b, fb, i)) return true;
      return _freeGame(b, i, true);
    }
    if (fb.kind === 'highlight') {
      if (_highlightShow(b, i)) return true;
      return _freeGame(b, i, true);
    }
    if (fb.kind === 'rush' && _can('PuzzleModes', 'rush')) {
      var rp = _base(i, 'rush', { inJourney: true });
      _setPending(rp);
      var okR = _invoke('PuzzleModes', 'rush', { onDone: function(r) {
        if (_pending !== rp) return;
        if (!r && !rp.opened) { rp.refused = true; return; }   // 러시를 열지 못함(퍼즐 준비 전, C6 onDone(null)): 아래에서 자유 게임으로
        _closeNav('puzzle');                   // 퍼즐 모드 해시는 #j/puzzle/rush(뷰 이름 'puzzle')
        var n = Math.max(0, Math.floor(_num(r && r.n, 0))), ok = Math.max(0, Math.floor(_num(r && r.ok, 0)));
        // 한 문제라도 풀어야 블록 완료(자유 게임의 "한 핸드 이상"과 같은 기준). 바로 나오면 다시 하기 카드
        _finish(rp, { done: n > 0, xp: _xpOf(r, rp.xpStart), stats: n ? { n: n, ok: ok } : null,
          line: n ? '퍼즐 러시 ' + n + '문제 중 ' + ok + '개 정답' : '퍼즐 러시를 아직 풀지 않았어요' });
      } });
      rp.opened = true;
      if (okR && !rp.refused) return true;
      if (_pending !== rp) return true;
      _setPending(null);                       // 러시 실패: 자유 게임으로
      return _freeGame(b, i, true);
    }
    return _freeGame(b, i, false, _num(fb.hands, _num(b.hands, FREE_HANDS)));
  }
  // 자유 게임(6인, 세션 핸드 수로 끊음). fallback이면 계획 블록에 표시해 칩과 안내가 '자유 게임 3핸드'로 보이게 한다
  function _freeGame(b, i, fallback, hands) {
    if (!_can('App', 'selectVillains')) return false;
    if (fallback) b.fallback = 'free';
    _setPending(_base(i, 'game', {}));
    _call('Journey', 'startSession', { kind: 'free', chunk: fallback ? FREE_HANDS : _num(hands, FREE_HANDS) });
    _call('App', 'selectVillains', 'sixmax');
    return true;
  }

  // ── 월요일 주간 챌린지 소개(M6-SEASON) ──
  function _introSeen(now) { return _can('Seasons', 'seenWeek') && !!_call('Seasons', 'seenWeek', null, now); }
  function _miniStatus(now) {
    if (!_can('TheaterUI', 'miniStatus')) return null;
    var st = _call('TheaterUI', 'miniStatus', now);
    return (st && typeof st === 'object') ? st : null;
  }
  function _followLabel(b) {
    var f = b.follow || {};
    return label({ id: 'fun', kind: f.kind, episodes: f.episodes, hands: f.hands });
  }
  function _weeklyIntro(b, i) {
    if (!_can('Seasons', 'sync')) return false;
    var now = _now();
    if (_introSeen(now)) return false;
    var r = _call('Seasons', 'sync', now);
    if (!r || !r.weekly || !r.weekly.def) return false;
    var html = _introHTML(b, i, r, _miniStatus(now), now);
    if (!html) return false;
    _call('Seasons', 'ack', now, { render: false });
    if (_can('JourneyUI', 'mountView')) JourneyUI.mountView('today', html);
    return true;
  }
  function _md(key) { return Number(key.slice(5, 7)) + '월 ' + Number(key.slice(8, 10)) + '일'; }
  // 소개 화면 문자열: 조건 3칸과 문장, 지난주 결과, 이번 달 시즌, 미니시즌, 이어서 버튼
  function _introHTML(b, i, r, ms, now) {
    var S = _m('Seasons'), w = r.weekly, d = w.def, s = r.season;
    var cells = (S && typeof S.condsHTML === 'function') ? S.condsHTML(w.items || [], '이번 주 조건') : '';
    var conds = '<ol class="j-intro-conds" style="margin:8px 0 0;padding-left:20px;font-size:.88rem;line-height:1.55">' +
      (d.conds || []).map(function(c) { return '<li>' + _esc(c.text) + '</li>'; }).join('') + '</ol>';
    var range = (d.from && d.to) ? ', ' + _md(d.from) + '부터 ' + _md(d.to) + '까지' : '';
    var prev = '';
    var pk = (S && typeof S.isoWeek === 'function') ? S.isoWeek(now - 7 * 864e5) : null;
    var ph = (w.state && Array.isArray(w.state.hist)) ? w.state.hist.filter(function(h) { return h && h.key === pk; })[0] : null;
    if (ph) {
      var pd = (S && typeof S.weekly === 'function') ? S.weekly(pk) : null, pt = pd ? pd.icon + ' ' + pd.title : '챌린지';
      prev = ph.done ? '지난주 ' + pt + ' 완료' + (w.prev && w.prev.key === pk && w.prev.xp ? ', XP +' + w.prev.xp + ' 받았어요' : '') + '. 잘했어요!'
        : '지난주 ' + pt + '는 ' + _num(ph.n, 0) + '/3칸까지 했어요. 이번 주는 새로 시작해요';
    }
    var sea = '';
    if (s && s.def) {
      sea = '<div class="j-card" style="margin-top:12px"><div class="j-card-t">' + _esc('🗓 ' + Number(s.key.slice(5, 7)) + '월 시즌: ' + s.def.icon + ' ' + s.def.title) + '</div>' +
        '<div class="j-card-d">' + _esc(s.def.desc) + '</div>' +
        '<div class="j-card-d" style="margin-top:4px">' + _esc('시즌 퀘스트 ' + _num(s.count, 0) + '/' + (s.items || []).length + (s.done ? ' 완료' : ', 다 채우면 XP +' + s.def.xp)) + '</div></div>';
    }
    var canMini = !!(ms && ms.canStart === true && _can('TheaterUI', 'openMini'));
    var mini = '';
    if (canMini) mini = '<div class="j-card-d" style="margin-top:12px">🏆 극장 미니시즌: 캐릭터들이 며칠에 걸쳐 탈락전을 해요. 시작 전에 우승자를 골라 보세요.</div>';
    else if (ms && ms.active && !ms.done) {
      mini = '<div class="j-card-d" style="margin-top:12px">' + _esc('🏆 미니시즌 진행 중' + (ms.episode && ms.total ? ', ' + ms.episode + '/' + ms.total + '편' : '') +
        (ms.pick ? ', 내 우승 예측은 ' + ms.pick : '')) + '</div>';
    }
    var p = plan() || { blocks: [] };
    return '<div class="j-today j-week-intro">' +
      '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여기까지 하고 여정 홈으로" onclick="TodayUI.stopHere()">↩</button>' +
        '<h2 class="j-sub-t">새 주 시작</h2>' + _dots(p, i) + '</div>' +
      (prev ? '<div class="j-done-line' + (ph && ph.done ? ' is-ok' : '') + '">' + (ph && ph.done ? '✅ ' : 'ℹ ') + _esc(prev) + '</div>' : '') +
      '<div class="j-block-card">' +
        '<div class="j-block-k">' + _esc('🏆 이번 주 챌린지' + range) + '</div>' +
        '<div class="j-block-t">' + _esc(d.icon + ' ' + d.title) + '</div>' +
        '<div class="j-block-d">' + _esc(d.desc) + '</div>' +
        '<div style="margin-top:10px">' + cells + '</div>' + conds +
        '<div class="j-block-e">' + _esc(w.done ? '✅ 이번 주 챌린지 완료!' : '세 칸을 모두 채우면 XP +' + d.xp + '. 일요일 밤까지 이어서 쌓여요') + '</div>' +
      '</div>' + sea + mini +
      '<div class="j-today-acts">' +
        (canMini ? '<button type="button" class="j-btn j-primary j-big" onclick="TodayUI.introMini(' + i + ')">🏆 미니시즌 우승 예측</button>' : '') +
        '<button type="button" class="j-btn' + (canMini ? '' : ' j-primary') + ' j-big" onclick="TodayUI.introNext(' + i + ')">' + _esc('▶ 이어서 ' + _followLabel(b)) + '</button>' +
        '<div class="j-row2"><button type="button" class="j-btn" onclick="TodayUI.skip(' + i + ')">건너뛰기</button>' +
        '<button type="button" class="j-btn j-ghost" onclick="TodayUI.stopHere()">여기까지</button></div>' +
      '</div></div>';
  }
  function _introBlock(i) {
    var p = plan(), b = p && p.blocks[i];
    if (!b || b.kind !== 'weeklyIntro') return null;
    b.introDone = true;
    _savePlan(p);
    return b;
  }
  // '▶ 이어서': 이어 붙인 원래 재미 블록을 연다
  function introNext(i) {
    if (!_introBlock(i)) { show(); return; }
    runBlock(i);
  }
  // '🏆 미니시즌 우승 예측': TheaterUI.openMini({ onDone }). 열면(true) onDone에서, 못 열면 바로 원래 재미 블록으로(한 번만)
  function introMini(i) {
    if (!_introBlock(i)) { show(); return; }
    var fired = false;
    var go = function() { if (fired) return; fired = true; runBlock(i); };
    var opened = false;
    if (_can('TheaterUI', 'openMini')) {
      try { opened = TheaterUI.openMini({ onDone: function() { go(); } }) === true; }
      catch (e) { if (typeof console !== 'undefined' && console.warn) console.warn('[TodayUI] TheaterUI.openMini 실패:', e && e.message ? e.message : e); opened = false; }
    }
    if (!opened) go();
  }
  // 마무리 카드의 주간 챌린지 한 줄(Seasons.sync: 완료 XP는 여기서 한 번 받을 수 있다)
  function _seasonWrapLine() {
    if (!_can('Seasons', 'sync')) return '';
    var r = _call('Seasons', 'sync', _now());
    if (!r || !r.weekly || !r.weekly.def) return '';
    var w = r.weekly, s = r.season, out = [];
    if (w.justDone) out.push('🏆 주간 챌린지 완료! XP +' + (w.xp > 0 ? w.xp : w.def.xp));
    else if (!w.done && Array.isArray(w.items)) out.push('🏆 주간 챌린지(' + w.def.icon + ' ' + w.def.title + ') ' + _num(w.count, 0) + '/' + w.items.length + '칸');
    if (s && s.justDone && s.def) out.push('🗓 시즌 퀘스트 완료! XP +' + (s.xp > 0 ? s.xp : s.def.xp));
    return out.join(', ');
  }

  // ── 극장(계약 T8) ──
  // Journey의 극장 누적(편 수, 예측, 적중, 카드 수) 사본: 블록 동안 TheaterUI가 recordTheater를 불렀는지 보는 기준
  function _theaterSnap() {
    var t = (_state().theater) || {};
    return { episodes: _num(t.episodes, 0), predicted: _num(t.predicted, 0), hit: _num(t.hit, 0), hitW: _num(t.hitW, 0),
      cards: Array.isArray(t.cards) ? t.cards.length : 0 };
  }
  function _theaterStart(b, fb, i) {
    if (!_can('TheaterUI', 'start')) return false;
    var n = Math.max(1, Math.floor(_num(fb.episodes, 1)));
    var tp = _base(i, 'theater', { episodes: n, th0: _theaterSnap() });
    var sync = true;
    _setPending(tp);
    var arg = { episodes: n, onDone: function(r) {
      if (_pending !== tp) return;
      if (!r) {
        // 열지 못함(계약 T8 onDone(null)): 부르는 중이면 아래에서, 나중에 오면 여기서 자유 게임으로
        if (sync) { tp.refused = true; return; }
        _setPending(null);
        _freeGame(b, i, true);
        _toast('🎭 극장을 열 수 없어 자유 게임 ' + FREE_HANDS + '핸드로 바꿨어요', 2600);
        return;
      }
      _onTheater(tp, r);
    } };
    if (fb.episode && typeof fb.episode === 'object') arg.mini = JSON.parse(JSON.stringify(fb.episode));   // 미니시즌 편(M6)
    var ok = _invoke('TheaterUI', 'start', arg);
    sync = false;
    if (ok && !tp.refused) return true;
    if (_pending !== tp) return true;          // 부르는 중에 결과까지 끝남
    _setPending(null);                          // 실패(예외) 또는 onDone(null): 자유 게임으로
    return false;
  }
  // r = {episodes, predicted, hit, hitW, cards[]}(없는 값은 블록 동안 Journey에 쌓인 차이로 채운다)
  function _onTheater(p, r) {
    _closeNav('theater');
    var now = _now(), d = _theaterDiff(p.th0);
    r = (r && typeof r === 'object') ? r : {};
    var cards = Array.isArray(r.cards) ? r.cards.filter(function(c) { return c && typeof c === 'object'; }) : [];
    var eps = Math.max(0, Math.floor(_num(r.episodes, d.episodes)));
    var pred = Math.max(0, Math.floor(_num(r.predicted, d.predicted)));
    var hit = Math.max(0, Math.min(pred, Math.floor(_num(r.hit, d.hit))));
    var hitW = Math.max(0, _num(r.hitW, d.hitW));
    // TheaterUI가 편마다 recordTheater를 부르는 것이 계약이다. 한 편도 쌓이지 않았으면 여기서 대신 기록한다(일부만 쌓였으면 건드리지 않음)
    if (eps > 0 && d.episodes === 0 && _can('Journey', 'recordTheater')) {
      for (var k = 0; k < eps; k++) {
        _call('Journey', 'recordTheater', { seed: (cards[k] && cards[k].seed != null) ? cards[k].seed : null,
          predicted: k === 0 ? pred : 0, hit: k === 0 ? hit : 0, hitW: k === 0 ? hitW : 0, card: cards[k] || null }, now);
      }
    }
    _keepTouch();
    _finish(p, _theaterRes(eps, pred, hit, cards.length, _xpOf(r, p.xpStart)));
  }
  function _theaterDiff(th0) {
    var a = th0 || { episodes: 0, predicted: 0, hit: 0, hitW: 0, cards: 0 }, b = _theaterSnap();
    return { episodes: Math.max(0, b.episodes - a.episodes), predicted: Math.max(0, b.predicted - a.predicted),
      hit: Math.max(0, b.hit - a.hit), hitW: Math.max(0, Math.round((b.hitW - a.hitW) * 1000) / 1000), cards: Math.max(0, b.cards - a.cards) };
  }
  // 극장 블록 결과: 한 편 이상 끝까지 봤으면 완료. 줄 = '극장 n편, 예측 n번 중 m번 적중'. 예측이 0번이면 멈춤이 없었는지
  // 멈춤을 건너뛰었는지 결과만으로는 모르므로 '예측 없이 끝까지 봤어요'라고만 말한다
  function _theaterRes(eps, pred, hit, nCards, xp) {
    var res = { done: eps > 0, xp: xp };
    if (eps > 0) {
      res.stats = { episodes: eps, pred: pred, hit: hit };
      if (nCards) res.stats.cards = nCards;
      res.line = theaterLine(eps, pred, hit, nCards);
    } else res.line = '극장을 끝까지 보지 않았어요';
    return res;
  }
  function theaterLine(eps, pred, hit, nCards) {
    return '극장 ' + eps + '편, ' + (pred > 0 ? '예측 ' + pred + '번 중 ' + hit + '번 적중' : '예측 없이 끝까지 봤어요') +
      (nCards ? ', 명장면 카드 ' + nCards + '장' : '');
  }
  // recordTheater 안의 touchDay가 낸 스트릭 변화(프리즈 사용/지급)를 마무리 카드에 남긴다(markBlock의 같은 날 touchDay는 변화 없음)
  function _keepTouch() {
    var lt = _call('Journey', 'lastTouch');
    if (lt && lt.changed) _streak = lt;
  }

  // ── 오늘의 명장면(계약 T8 showCard, T9 highlightOfDay) ──
  function _highlightShow(b, i) {
    if (!_can('TheaterUI', 'showCard') || !_can('Journey', 'highlightOfDay')) return false;
    var card = _call('Journey', 'highlightOfDay', _now());
    if (!card || typeof card !== 'object') return false;
    var hp = _base(i, 'highlight', { inJourney: true, card: card.id || null, title: card.title || '' });
    _setPending(hp);
    var ok = _invoke('TheaterUI', 'showCard', { card: card, onDone: function() {
      if (_pending !== hp) return;
      _finish(hp, _highlightRes(hp));
    } });
    if (ok) return true;
    if (_pending !== hp) return true;
    _setPending(null);
    return false;
  }
  function _highlightRes(p) {
    var t = _clean(p.title || '');
    return { done: true, stats: { highlight: 1 }, line: '오늘의 명장면을 다시 봤어요' + (t ? ': ' + t : '') };
  }

  // ── 복귀 ──────────────────────────────────────────────
  function hasPending() { return !!_pending; }
  function pendingInfo() {
    if (!_pending) return null;
    var o = { kind: _pending.kind, inJourney: !!_pending.inJourney, idx: _pending.idx };
    if (_pending.phase) o.phase = _pending.phase;          // 복습 블록 단계(puzzle, drill, daily5, mistake)
    return o;
  }
  function running() { return _active || !!_pending; }
  function leave() { if (!_pending) { _active = false; _runDay = null; _syncRunning(); } }

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
      // 실수 핸드 연습 중 여정으로 돌아옴(뒤로, 메뉴): 연쇄를 정리하고 거기까지를 블록 결과로(남은 핸드는 다음 복습에)
      if (p.phase === 'mistake') { _call('ReviewQueue', 'abort', 'today'); _finishReview(p); return; }
      if (p.phase !== 'drill') { _finishReview(p); return; }   // 퍼즐/데일리 5 화면을 onDone 없이 떠남: 거기까지를 블록 결과로
      var g = p.groups[p.sub], a = _drillStats(g.type);
      var n = a.n - p.before.n, ok = a.ok - p.before.ok;
      if (n > 0) { p.acc.n += n; p.acc.ok += ok; p.xpOwn += _addXp('review', ok * _xpConst('review', 2)); }
      // 이 유형을 끝까지 풀었으면 다음 유형(또는 데일리 5) 바로 이어서. 중간에 나왔으면 거기까지를 블록 결과로
      if (n >= g.count) { p.sub++; if (p.mk.length && !p.mkDone) _saveProg(p); _reviewStep(p); return; }
      _finishReview(p);
      return;
    } else if (p.kind === 'puzzle') {
      // 노드 드릴 퍼즐 세트를 onDone 없이 떠남: 결과를 모르니 다시 시도 카드(풀린 문항의 기록과 XP는 PuzzleUI가 이미 남김)
      r.done = false;
      r.line = '드릴을 끝까지 풀지 않았어요';
    } else if (p.kind === 'rush') {
      r.done = false;
      r.line = '퍼즐 러시를 끝내지 않았어요';
    } else if (p.kind === 'theater') {
      // 극장을 onDone 없이 떠남: 그동안 TheaterUI가 Journey에 기록한 편(recordTheater)만큼을 블록 결과로
      _closeNav('theater');
      var td = _theaterDiff(p.th0);
      _keepTouch();
      _finish(p, _theaterRes(td.episodes, td.predicted, Math.min(td.predicted, td.hit), td.cards, null));
      return;
    } else if (p.kind === 'highlight') {
      // 카드 보기를 onDone 없이 닫음: 카드는 이미 봤으니 완료
      _finish(p, _highlightRes(p));
      return;
    } else if (p.kind === 'boss') {
      // 승급 시험 카드에서 돌아옴(M7 FLOW-05): 시험 기록이 시작 때와 달라졌으면(시도 시작, 드릴, 실전 핸드, 결과) 완료
      var passedNow = (((_state().nodes || {})[p.node] || {}).status) === 'passed';
      r.done = _bossSig(p.node) !== p.sig;
      r.stats = r.done ? { boss: 1 } : null;
      r.line = passedNow ? _nodeTitle(p.node) + ' 통과!' : (r.done ? _nodeTitle(p.node) + ' 시험을 진행했어요(기록은 이어져요)' : '승급 시험을 아직 시작하지 않았어요');
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
    // 퍼즐 결과가 알려 준 XP(r.xp)가 있으면 그것만 기록(재지급 없음). 없으면 블록 동안 늘어난 XP(M1 방식)
    r.xp = (r.xp != null && isFinite(r.xp)) ? Math.max(0, Number(r.xp)) : Math.max(0, _xpNow() - _num(p.xpStart, _xpNow()));
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
      if (_num(result.ratingDelta, 0)) b.ratingDelta = Math.round(Number(result.ratingDelta) * 10) / 10;
      p.xp = _num(p.xp, 0) + b.xp;
      p.minutes = Math.round((_num(p.minutes, 0) + b.minutes) * 10) / 10;
      _markBlock(b.id, b.minutes, b.xp, now, p.day);
    } else if (result.skipped) {
      b.status = 'skipped';
    }
    _savePlan(p);
    _last = { idx: i, line: result.line || '', retry: !result.done && !result.skipped, ok: !!result.done };
    show();
  }

  // Journey.markBlock은 안에서 touchDay(36h 스트릭)까지 한다. 같은 날 두 번째 touchDay는 변화 없음 결과라
  // 프리즈 사용/지급 표시가 지워지므로 다시 부르지 않고 lastTouch를 쓴다. 변화 있는 결과만 마무리 카드용으로 남긴다.
  // day: 계획을 시작한 날 키. 자정을 넘겨 끝낸 블록은 그 날의 기록(doneBlocks, 분)에 붙고 스트릭은 실제 시각으로 센다(M7 TIME-02).
  function _markBlock(name, minutes, xp, now, day) {
    var st;
    if (_can('Journey', 'markBlock')) { _call('Journey', 'markBlock', name, minutes, xp, now, day ? { day: day } : undefined); st = _call('Journey', 'lastTouch'); }
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
    if (_pending && _pending.phase === 'mistake') _call('ReviewQueue', 'abort', 'today');
    if (_pending) _setPending(null);
    var p = plan();
    if (p && !p.finishedAt) { p.stoppedAt = _iso(_now()); _savePlan(p); }
    _active = false;
    _runDay = null;
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
      var rp = _reviewPlan(b), cnt = {}, order = [];
      rp.pz.forEach(function(it) { if (!(it.type in cnt)) { cnt[it.type] = 0; order.push(it.type); } cnt[it.type]++; });
      rp.groups.forEach(function(g) { if (!(g.type in cnt)) { cnt[g.type] = 0; order.push(g.type); } cnt[g.type] += g.count; });
      var d5 = rp.d5 ? '데일리 5(5문제, 약 3분)' : '';
      var m = rp.mk.length;
      var mk = m ? '실수 핸드 다시 풀기 ' + m + '핸드(지난 게임에서 빨강 판정을 받은 핸드를 같은 카드로 다시 쳐요. 연습이라 기록과 XP에는 안 들어가요)' : '';
      if (!rp.total) {
        if (d5 && mk) return '오늘의 ' + d5 + '를 풀어요. 이어서 ' + mk;
        if (mk) return mk;
        return '오늘의 ' + d5 + '를 풀어요. 문제마다 한 줄 해설이 나와요';
      }
      var fill = rp.pz.some(function(it) { return it.fill; });
      var due = rp.groups.length > 0 || rp.pz.some(function(it) { return !it.fill; });
      var what = (due ? '때가 된 문제와 틀렸던 문제' : '') + (due && fill ? ', ' : '') + (fill ? '약한 개념 문제' : '') + (due && !fill ? '를 다시 풀어요' : '를 풀어요');
      return what + '(' + order.map(function(t) { return _typeName(t) + ' ' + cnt[t]; }).join(', ') + ')' + (d5 ? '. 이어서 ' + d5 : '') +
        (mk ? '. 이어서 ' + mk : '');
    }
    if (b.id === 'fun' && b.fallback === 'free') return '6인 테이블에서 가볍게 ' + FREE_HANDS + '핸드. 끝나면 요약에서 돌아와요';
    switch (b.kind) {
      case 'placement': return '10문제로 시작 단계를 정해요. 결과는 한 번만 반영돼요';
      case 'lesson': case 'curriculum': {
        if (b.kind === 'lesson' && _lessonPlayable(_node(b.node))) {
          var from = _num(b.scene, 0);
          return from > 0 ? '그림 레슨을 ' + (from + 1) + '번째 장면부터 이어 봐요. 질문은 탭으로 답해요'
            : '그림 레슨' + (_num(b.scenes, 0) > 0 ? ' ' + _num(b.scenes, 0) + '장면' : '') + '. 질문은 탭으로 답해요';
        }
        var n = _num(b.session, 0) || (_can('JourneyUI', 'curriculumFor') && b.node ? JourneyUI.curriculumFor(b.node) : null) || _plan_cs() || 1;
        var C = _m('CURRICULUM'), topic = '';
        if (Array.isArray(C)) { var it = C.filter(function(x) { return x && x.session === n; })[0]; if (it) topic = _clean(it.topic); }
        return '커리큘럼 세션 ' + n + (topic ? ' "' + topic + '"' : '') + '을 읽고 돌아와요';
      }
      case 'drill': return _drillDesc(b);
      // 핸드 수는 계획 값(시간 예산으로 4, 3핸드로 줄 수 있음, M7 결정 32). 칩 이름, 세션 분량과 같게
      case 'mission': return '6인 테이블 ' + _num(b.hands, 5) + '핸드. 결정 기록이 미션 진행에 쌓여요';
      case 'gto': return '같은 카드를 3번 치며 정답과 비교해요(' + _num(b.hands, 5) + '핸드)';
      case 'boss': return '단계의 마지막 관문이에요. 시험 카드에서 드릴이나 실전 핸드를 이어서 해요. 벌점은 없고 기록은 이어져요';
      case 'endgame': return '모든 단계를 통과했어요. 6인 캐스트 테이블에서 ' + _num(b.hands, 5) + '핸드로 감각을 유지해요';
      case 'rush': return '3분 동안 퍼즐을 연달아 풀어요. 연속으로 맞히면 시간이 늘고 틀리면 10초 줄어요(레이팅에는 반영 안 돼요)';
      case 'theater':
        if (b.mini) return '🏆 극장 미니시즌 ' + _miniNo(b) + '편: 캐릭터들의 탈락전 6~8핸드(약 3분)예요. 결정적인 순간에 멈추니 다음 행동과 계획을 맞혀 봐요';
        return '캐릭터 6명이 카드를 모두 펼친 채 치는 핸드를 봐요(' + Math.max(1, _num(b.episodes, 1)) + '편). 결정적인 순간에만 멈추니 다음 행동과 계획을 맞혀 봐요';
      case 'highlight': return '극장에서 모은 명장면 카드 중 오늘의 한 장을 다시 봐요';
      case 'weeklyIntro':
        if (b.follow && typeof b.follow === 'object' && b.follow.kind) {
          var fd = _desc(_funFollow(b.follow));
          return (b.introDone || !_can('Seasons', 'sync') || _introSeen(_now())) ? fd : '이번 주 챌린지(조건 3개)를 먼저 보고 이어서 해요. ' + fd;
        }
        break;
    }
    return '6인 테이블에서 가볍게 ' + _num(b.hands, FREE_HANDS) + '핸드. 끝나면 요약에서 돌아와요';
  }
  // 직전 블록 결과 줄(다음 블록 카드 위, 마지막 블록이면 마무리 카드 위)
  function _resHTML(p) {
    if (!_last || !_last.line) return '';
    var bx = p.blocks[_last.idx];
    return '<div class="j-done-line' + (_last.ok ? ' is-ok' : '') + '">' + (_last.ok ? '✅ ' : 'ℹ ') + _esc(_last.line) +
      (_last.ok && bx && bx.xp ? ', XP +' + bx.xp : '') + '</div>';
  }
  function show() {
    var p = plan();
    if (!p) { if (_can('JourneyUI', 'open')) JourneyUI.open(); return; }
    var i = (_last && _last.retry) ? _last.idx : _firstRemaining(p);
    if (i < 0 || p.blocks[i].id === 'wrap') { _wrap(); return; }
    _active = true;
    var b = p.blocks[i];
    var res = _resHTML(p);
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
      if (_can('Journey', 'markBlock')) _markBlock('wrap', 0.5, 0, now, p.day);
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
      // JStats는 오늘을 포함한 최근 7일과 그 앞 7일이다. ISO 주(월~일)인 '이번 주 챌린지', 주간 리포트의 '지난주'와 헷갈리지 않게 '그 전 7일', '최근 7일'로 쓴다(M7 TIME-09)
      return name + ' 판단 그 전 7일 ' + Math.round(pg / pn * 100) + '% → 최근 7일 ' + Math.round(a7.g / a7.n * 100) + '%';
    }
    if (a7 && _num(a7.n, 0) > 0) return '최근 7일 ' + name + ' 판단 ' + a7.n + '번 중 초록 ' + _num(a7.g, 0) + '번';
    // 집계가 아직 없으면 오늘 계획의 블록 결과로(게임 중 차트 판정 기록과 섞지 않음)
    var q = { n: 0, ok: 0 }, hands = 0, lessons = 0, eps = 0, mks = 0;
    p.blocks.forEach(function(b) {
      var r = b.status === 'done' && b.res;
      if (!r) return;
      if (r.n || r.d5n) { q.n += _num(r.n, 0) + _num(r.d5n, 0); q.ok += _num(r.ok, 0) + _num(r.d5ok, 0); }
      hands += _num(r.hands, 0); lessons += _num(r.lesson, 0); eps += _num(r.episodes, 0); mks += _num(r.mk, 0);
    });
    var parts = [];
    if (q.n) parts.push('문제 ' + q.n + '개 중 ' + q.ok + '개 정답');
    if (mks) parts.push('실수 핸드 ' + mks + '개 다시 풀기');
    if (lessons) parts.push('레슨 ' + lessons + '개');
    if (hands) parts.push('실전 ' + hands + '핸드');
    if (eps) parts.push('극장 ' + eps + '편');
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
    if (!nn || !nn.id) {
      // 모든 노드를 통과한 뒤(M7 FLOW-05): 빈 줄 대신 엔드게임 안내
      var cx = _call('Journey', 'todayCtx', _now());
      return (cx && cx.endgame) ? '모든 단계를 통과했어요. 이제 주간 리포트의 비싼 실수 다시 풀기, 주간 챌린지, 시즌 퀘스트로 실력을 다져요' : '';
    }
    var step = { lesson: '레슨', drill: '드릴', mission: '실전', boss: '승급 시험' }[nn.step] || '';
    // 할 수 있는 다음 단계가 이번 버전에 없으면(JourneyUI.nextDoable도 대안을 못 찾음) 막다른 안내 대신 사유와 대안
    if (step && _can('JourneyUI', 'canDo') && !JourneyUI.canDo(nn.step, _node(nn.id))) {
      return _nodeTitle(nn.id) + ' ' + step + '은 다음 업데이트에서 열려요. 그동안 오늘의 5분으로 실전 감각을 쌓아요';
    }
    return '다음 할 일: ' + _nodeTitle(nn.id) + (step ? ', ' + step : '');
  }
  // 마무리 카드 레이팅 한 줄: 오늘 계획의 블록들이 받은 ratingDelta 합(C5 r.ratingDelta). 변화가 없으면 ''
  function ratingLine(p) {
    p = p || plan();
    if (!p || !Array.isArray(p.blocks)) return '';
    var sum = p.blocks.reduce(function(a, b) { return a + (b && b.status === 'done' ? _num(b.ratingDelta, 0) : 0); }, 0);
    var d = Math.round(sum);
    if (!d) return '';
    var lb = _can('Rating', 'label') ? _call('Rating', 'label') : '';
    return '퍼즐 레이팅 ' + (d > 0 ? '+' : '') + d + (typeof lb === 'string' && lb ? ', 지금 ' + lb : '') + '(나의 추세용)';
  }
  function _wrap() {
    var p = plan();
    if (!p) { if (_can('JourneyUI', 'open')) JourneyUI.open(); return; }
    _complete(p);
    p = plan() || p;
    _active = true;
    var all = _allDone(p);
    var sl = _streakLine(), nl = _nextLine(), rl = ratingLine(p), zl = _seasonWrapLine();
    // 마지막 블록(보통 재미 블록: '극장 1편, 예측 n번 중 m번 적중')의 결과 줄은 다음 블록 카드가 없으니 여기서 보인다
    var last = (_last && _last.ok) ? _resHTML(p) : '';
    var html = '<div class="j-today j-wrap">' +
      '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여정 홈으로" onclick="TodayUI.finish()">↩</button>' +
        '<h2 class="j-sub-t">마무리</h2>' + _dots(p, -1) + '</div>' + last +
      '<div class="j-wrap-card">' +
        '<div class="j-wrap-t">' + (all ? '🎉 오늘의 ' + _goal(_state()) + '분 완주!' : '✅ 오늘은 여기까지 완료') + '</div>' +
        '<div class="j-wrap-line">📈 ' + _esc(_infoLine(p)) + '</div>' +
        '<div class="j-wrap-stats"><span>⭐ XP +' + _num(p.xp, 0) + '</span>' + (p.minutes ? '<span>⏱ ' + (p.minutes < 1 ? '1분 미만' : Math.round(p.minutes) + '분') + '</span>' : '') + '</div>' +
        (rl ? '<div class="j-wrap-rating">🎯 ' + _esc(rl) + '</div>' : '') +
        (sl ? '<div class="j-wrap-streak">' + _esc(sl) + '</div>' : '') +
        (nl ? '<div class="j-wrap-next">🧭 ' + _esc(nl) + '</div>' : '') +
        (zl ? '<div class="j-wrap-next j-wrap-season">' + _esc(zl) + '</div>' : '') +
      '</div>' +
      '<div class="j-today-acts"><button type="button" class="j-btn j-primary j-big" onclick="TodayUI.finish()">여정 홈으로</button>' +
        '<button type="button" class="j-btn j-big" onclick="TodayUI.again()">➕ 더 하기</button></div></div>';
    if (_can('JourneyUI', 'mountView')) JourneyUI.mountView('today', html);
  }
  function finish() {
    var p = plan();
    if (p) _complete(p);
    _active = false;
    _runDay = null;
    _last = null;
    _syncRunning();
    if (_can('JourneyUI', 'open')) JourneyUI.open();
  }

  var api = {
    start: start, again: again, runBlock: runBlock, stopHere: stopHere, finish: finish, onBlockDone: onBlockDone, skip: skip,
    resume: resume, show: show, leave: leave, running: running, hasPending: hasPending, pendingInfo: pendingInfo,
    preview: preview, plan: plan, build: build, ctx: ctx, label: label, desc: _desc, estSec: _estSec,
    // M2-P7 연결(순수 판정: 테스트, 하네스용)
    puzzleTypes: puzzleTypes, reviewPlan: _reviewPlan, ratingLine: ratingLine, blockReady: _blockReady,
    // M4-P8 재미 블록(극장, 명장면) 결과 줄
    theaterLine: theaterLine,
    // M6-SEASON 월요일 주간 소개(소개 화면 버튼)
    introNext: introNext, introMini: introMini,
    _review: _review, _learn: _learn, _fun: _fun, _wrap: _wrap
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
