// journey/journey-ui.js (채우는 패키지: M1-P3, M2 연결: M2-P7)
// 여정 홈(칭호, 스트릭, 데일리 목표 링, 오늘의 5분 버튼, 첫 카드, 지도, 빠른 줄, 카드)과 노드 시트, 서브뷰 라우팅.
// M2-P7: 노드 드릴은 PuzzleUI.can(드릴 명세)이면 PuzzleUI.start(C5), 아니면 기존 DrillUI. 홈 상단 ⚙ 설정과 퍼즐 레이팅 칩(C7),
//        카드 영역의 데일리 5 카드(C6). 퍼즐 결과의 XP는 PuzzleUI가 준다(여기서는 recordDrillSet과 통과 판정만).
// M4-P8: 카드 영역의 오늘의 명장면(Journey.highlightOfDay 카드가 있고 TheaterUI.cardHTML이 있을 때만, "자세히 보기"는
//        TheaterUI.showCard). 빠른 줄 🎭는 TheaterUI.open(계약 T8)이 생기면 "곧"이 풀리고 바로 연다.
// M5-WEEKLY: 카드 영역의 📅 주간 리포트 카드(WeeklyView.cardInfo가 리포트 내용이 있다고 할 때만, 월요일에 이번 주 리포트를 아직 안
//        봤으면 맨 앞에 강조), 서브뷰 제목 weekly = '📅 주간 리포트'(뷰는 WeeklyView.open, 계약 F8), 노드 시트 롤링 줄의 판정 전 항목
//        (Boss.evaluate item.wait, 계약 F3)은 '⏳ ' 접두와 '판정 전(기준 ...)'.
// M6-P0(계약 H11, docs/JOURNEY_ROADMAP.md M6): (a) 카드 영역 공급자 Seasons, TheaterUI, Badges 순 M.homeCard(state, now) →
//        { html, emph? } | null(emph는 카드 영역 맨 앞, 나머지는 데일리 5 카드 뒤), (b) 노드 시트 버튼 줄 뒤 Boss.sheetActions(nodeId,
//        rec, state) → html, (c) 홈을 그린 뒤 Badges.onHome(now), (d) 빠른 줄 자유 게임 세션 요약 정적 버튼 '↩ 여정 홈으로'(결정 15).
//        M6에서 그룹은 이 파일을 고치지 않는다(필요하면 보고).
// 규약: 로드 시 DOM 접근 없음(window.addEventListener('load')만). 다른 패키지 모듈은 전부 typeof 가드로 부르고,
//       없거나 실패하면 화면이 깨지지 않게 대체 표시로 내려간다(병렬 구현 중 스텁일 수 있음).
// 화면 구조: #journey-root > .j-view(홈 또는 서브뷰, TodayUI 셸) + .j-layer(노드 시트). 토스트는 body의 #journey-toast.
var JourneyUI = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);

  // 단계 표시 폴백(journey-data 미로드 시). 칭호와 이름은 설계서 2.1절.
  var STAGE_FALLBACK = [
    { n: 1, key: 's1', name: '첫 카드', title: '새싹', boss: 's1-boss' },
    { n: 2, key: 's2', name: '자리 지키기', title: '견습', boss: 's2-boss' },
    { n: 3, key: 's3', name: '주도권', title: '레귤러', boss: 's3-boss' },
    { n: 4, key: 's4', name: '콤보 읽기', title: '리더', boss: 's4-boss' },
    { n: 5, key: 's5', name: '밸런스', title: '샤크', boss: 's5-boss' },
    { n: 6, key: 's6', name: '익스플로잇', title: '마스터', boss: 's6-boss' }
  ];
  var STAGE_ICON = ['🌱', '🛡️', '🎯', '🧭', '🦈', '👑'];
  // 노드 상태 4종: 색만이 아니라 아이콘, 테두리 모양(점선/실선/이중선), 채움(없음/반/전체), 글자로 함께 구분
  var STATUS = {
    locked: { icon: '🔒', label: '잠김' },
    open:   { icon: '▶', label: '열림' },
    done:   { icon: '◐', label: '일부 완료' },
    passed: { icon: '★', label: '통과' }
  };
  var TYPE_LABEL = { showdown: '쇼다운', order: '말하는 순서', minraise: '민레이즈', tocall: '콜 금액', preflop: '프리플랍 레인지',
    potodds: '팟 오즈', outs: '아웃츠', 'outs-x4': '아웃츠 x4 조건', eqbucket: '에쿼티 구간', texture: '보드 날씨', cbet2: 'c벳 2축',
    mdf: 'MDF', alpha: '알파', bluffratio: '블러프 비율', combos: '콤보 세기', 'facingbet-river': '리버 콜/폴드',
    'facingbet-next': '다음 1장 콜/폴드', spr: 'SPR', rangehit: '레인지 적중', rangepaint: '레인지 색칠', rangeshape: '레인지 모양',
    toygame: '토이 게임', geosize: '기하 사이즈', variance: '분산', intent: '속마음 읽기', hudread: 'HUD 읽기', prescribe: '유형별 처방',
    mixed: '혼합',
    // M2 퍼즐 모드와 복습 채움(구형 계획의 type 'puzzle')
    puzzle: '약점 퍼즐', daily5: '데일리 5', rush: '퍼즐 러시', survival: '서바이벌' };
  // 진행 상태를 저장하지 않는 퍼즐 화면(해시 #j/puzzle, #j/rush, #j/daily5, #j/survival): 뒤로/새로고침으로 다시 오면 홈으로.
  // 러시와 서바이벌은 빠른 줄에서 다시 시작하면 된다.
  // 극장(#j/theater, M4-P8)도 진행 상태를 저장하지 않는다. 극장이 떠 있을 때(TheaterUI.active())는 view가 아무것도 하지 않는다.
  var TRANSIENT_VIEWS = { puzzle: true, rush: true, daily5: true, survival: true, lesson: true, boss: true, theater: true };
  var RATING_TIP = '퍼즐 레이팅, 나의 추세용';
  var LIGHT_LABEL = { green: '초록', yellow: '노랑', red: '빨강', marginal: '애매한 스팟' };
  // 통과 기준 문구용(조건 DSL, journey-data.js 머리 주석의 필드 의미 그대로)
  var CONCEPT_LABEL = { rfi: '오픈', vs_rfi: '상대 오픈 대응', blind_defense: '블라인드 방어', vs_3bet: '3벳 대응', pot_odds: '팟 오즈',
    draws: '드로우', cbet: 'c벳', value_bluff: '밸류와 블러프', board_texture: '보드 텍스처', turn_river: '턴, 리버', actions: '액션 기본' };
  var SOURCE_LABEL = { chart: '차트', potodds: '팟 오즈', guide: '가이드', ev: 'EV' };
  var STREET_LABEL = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
  var METRIC_LABEL = { vpip: 'VPIP', pfr: 'PFR', tb: '3벳', f3: '3벳에 폴드' };
  var COACH_NAME = { 0: '풀코칭', 1: '먼저 판단', 2: '예측', 3: '실전' };   // index.html 코칭 보조 선택지와 같은 이름
  var PATTERN_FALLBACK = { overlimp: '림퍼 뒤에 콜로 따라 들어가기' };   // Coach.PATTERNS.overlimp(M3) 전 라벨
  var VIEWS = { dashboard: 'DashboardView', weekly: 'WeeklyView', collection: 'CollectionView', placement: 'PlacementView', settings: 'SettingsView' };
  var VIEW_TITLE = { dashboard: '📊 내 실력', weekly: '📅 주간 리포트', collection: '🗂 수집', placement: '📝 실력 확인 3분',
    settings: '⚙ 설정', rush: '⚡ 퍼즐 러시', theater: '🎭 속마음 극장' };
  var HABITS = [ { id: '출근길', text: '출근길에' }, { id: '점심 후', text: '점심 먹고' }, { id: '자기 전', text: '자기 전에' } ];
  var SETTINGS_KEY = 'poker_journey_settings';
  var CARD_PROVIDERS = ['Seasons', 'TheaterUI', 'Badges', 'BackupUI'];   // (M6-P0, 계약 H11 a) 홈 카드 영역 공급자 순서. BackupUI는 M7 P5(용량 90% 경고, 월간 백업 카드)
  var SUMMARY_HOME = '↩ 여정 홈으로';                        // (M6-P0, 계약 H11 d) 빠른 줄 자유 게임 세션 요약 정적 버튼

  var _inited = false;
  var _mem = null;          // Journey.load 불가 시 메모리 상태(저장 안 함)
  var _cur = 'home';        // 현재 .j-view 내용: 'home' | 'today' | 뷰 이름
  var _sheetId = null;      // 열린 노드 시트 id
  var _expanded = {};       // 사용자가 펼친 단계 번호
  var _pending = null;      // 노드 시트에서 시작한 외부 화면 { kind:'lesson'|'drill'|'mission', node, startedAt, ... }
  var _obs = null;          // 복귀 감시 MutationObserver
  var _obsQueued = false;
  var _resuming = false;
  var _toastTimer = null;
  var _keysBound = false;
  var _habitDraft = null;   // 설정 카드에서 고른 습관(저장 전)
  var _origin = false;      // 빠른 줄(자유 게임, 리뷰)로 여정 홈에서 나감: 그 흐름의 "메뉴로"는 더보기 대신 여정 홈으로
  var _passToastAt = null;  // 마지막으로 알린 Journey 자동 통과(lastPass().at)
  var _homeDay = null;      // 홈을 마지막으로 그린 날짜 키(M7 TIME-04: 백그라운드에서 날짜가 바뀐 채 돌아오면 다시 그린다)

  // ── 공용 헬퍼 ──────────────────────────────────────────
  function _m(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _can(mod, fn) { var o = _m(mod); return !!(o && typeof o[fn] === 'function'); }
  function _call(mod, fn) {
    var o = _m(mod);
    if (!o || typeof o[fn] !== 'function') return undefined;
    try { return o[fn].apply(o, Array.prototype.slice.call(arguments, 2)); }
    catch (e) { _warn(mod + '.' + fn, e); return undefined; }
  }
  function _warn(where, e) { if (typeof console !== 'undefined' && console.warn) console.warn('[JourneyUI] ' + where + ' 실패:', e && e.message ? e.message : e); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _clean(s) { return String(s == null ? '' : s).replace(/\s*[\u00b7\u2014\u2013]\s*/g, ', '); } // 기존 데이터의 가운뎃점, 긴줄표 → 쉼표
  function _num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function _now() { return Date.now(); }
  function _iso(t) { return new Date(t).toISOString(); }
  function _hasDom() { return typeof document !== 'undefined' && !!document.getElementById; }
  function _el(id) { return _hasDom() ? document.getElementById(id) : null; }

  function _dayKey(now) {
    var k = _call('Journey', 'dayKey', now);
    if (typeof k === 'string' && k) return k;
    var t = new Date(now), m = t.getMonth() + 1, d = t.getDate();
    return t.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  // ── 상태 접근(Journey 우선, 없으면 메모리 기본값) ────────────────
  function _defaultState() {
    return { v: 1, stage: 1, nodes: {}, xp: 0, level: 1, unlocks: [],
      streak: { cur: 0, best: 0, lastActiveAt: null, lastDay: null, freezes: 0, frozenDays: [] },
      goal: { minutes: 5 }, habit: { when: null, custom: '' }, daily: {}, placement: { done: false, stage: null, correct: null, at: null } };
  }
  function state() {
    var s = _call('Journey', 'load');
    if (!s || typeof s !== 'object') s = _mem || (_mem = _defaultState());
    return s;
  }
  function save(s) { if (_can('Journey', 'save')) _call('Journey', 'save', s || state()); }

  function _stages() { var s = _m('JOURNEY_STAGES'); return (Array.isArray(s) && s.length) ? s : STAGE_FALLBACK; }
  function _stageInfo(n) {
    var list = _stages();
    for (var i = 0; i < list.length; i++) if (list[i].n === n) return list[i];
    return STAGE_FALLBACK[Math.max(0, Math.min(5, (n || 1) - 1))];
  }
  function _allNodes() { var n = _m('JOURNEY_NODES'); return Array.isArray(n) ? n : []; }
  function node(id) {
    var list = _allNodes();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function _nodeRec(s, id) { return (s && s.nodes && s.nodes[id]) || null; }
  function status(id, s) {
    var r = _call('Journey', 'nodeStatus', id);
    if (STATUS[r]) return r;
    var rec = _nodeRec(s || state(), id);
    if (rec && STATUS[rec.status]) return rec.status;
    var nd = node(id);
    return (nd && (!nd.prereq || !nd.prereq.length)) ? 'open' : 'locked';
  }
  function _passedCount(s) {
    var n = 0, nodes = (s && s.nodes) || {};
    Object.keys(nodes).forEach(function(k) { if (nodes[k] && nodes[k].status === 'passed') n++; });
    return n;
  }
  function summary(s) {
    s = s || state();
    var sm = _call('Journey', 'summary') || {};
    var st = (typeof sm.streak === 'object' && sm.streak) ? sm.streak : (s.streak || {});
    var stage = _num(sm.stage, _num(s.stage, 1)) || 1;
    var xp = _num(sm.xp, _num(s.xp, 0));
    var lv = _call('Journey', 'xpToNext', xp) || null;
    return {
      stage: stage, title: sm.title || _stageInfo(stage).title, name: _stageInfo(stage).name,
      xp: xp, level: _num(sm.level, lv && lv.level ? lv.level : _num(s.level, 1)) || 1,
      xpHave: lv ? _num(lv.have, 0) : null, xpNeed: lv ? _num(lv.need, 0) : null,
      streak: typeof sm.streak === 'number' ? sm.streak : _num(st.cur, 0),
      best: _num(st.best, _num((s.streak || {}).best, 0)), freezes: _num(st.freezes, _num((s.streak || {}).freezes, 0)),
      nodesPassed: _num(sm.nodesPassed, _passedCount(s)),
      nextNode: nextDoable(sm.nextNode !== undefined ? sm.nextNode : (_call('Journey', 'nextNode') || null))
    };
  }

  // ── 다음 할 일: 이번 버전에서 실제로 할 수 있는 단계 우선 ──────────
  // Journey.nextNode는 가장 앞 가용 노드의 남은 단계를 준다. 그 단계가 이번 버전에 없는 기능이면(M1의 쇼다운,
  // 말하는 순서 퍼즐, 보스 등) 지금 할 수 있는 다음 가용 노드로 안내한다. 할 수 있는 게 없으면 원래 노드(시트가 사유 안내).
  function _stepOf(id) {
    var nd = node(id);
    if (!nd) return null;
    if (nd.kind === 'boss') return 'boss';
    var ev = _call('Journey', 'evaluateNode', id);
    if (!ev || ev.pass || !ev.need) return null;
    if (ev.need.lesson && !ev.lesson) return 'lesson';
    if (ev.need.drill && !ev.drill) return 'drill';
    if (ev.need.mission && !ev.mission) return 'mission';
    return null;
  }
  function canDo(step, nd) {
    if (!nd) return false;
    if (step === 'lesson') return !!_lessonPath(nd);
    if (step === 'drill') return !!_drillPath(nd);
    if (step === 'mission') return _can('App', 'selectVillains') && _can('Journey', 'startSession');
    if (step === 'boss') return _can('Boss', 'start');
    return false;
  }
  function nextDoable(raw) {
    if (!raw || !raw.id || canDo(raw.step, node(raw.id))) return raw || null;
    var ids = _call('Journey', 'openNodes');
    if (!Array.isArray(ids)) return raw;
    for (var i = 0; i < ids.length; i++) {
      var step = _stepOf(ids[i]);
      if (step && canDo(step, node(ids[i]))) return { id: ids[i], step: step };
    }
    return raw;
  }
  function _goalMin(s) { var g = _num(s && s.goal && s.goal.minutes, 5); return (g === 10 || g === 15) ? g : 5; }
  function _todayRec(s) { var d = (s && s.daily) || {}; return d[_dayKey(_now())] || null; }

  // 첫 카드 조건: 배치 고사 미완 && 통과 노드 0(+ "그냥 시작"을 고른 적 없음)
  function needFirstCard(s) {
    s = s || state();
    var pl = s.placement || {};
    return !pl.done && !pl.declinedAt && summary(s).nodesPassed === 0;
  }
  // 첫 완주 뒤 1회 설정 카드 조건
  function _everFinished(s) {
    var d = (s && s.daily) || {};
    return Object.keys(d).some(function(k) { var r = d[k]; return !!(r && r.todayDoneAt); });
  }
  function needSettingsCard(s) { s = s || state(); return _everFinished(s) && !(s.habit && s.habit.askedAt); }

  // ── 지도 모델 ──────────────────────────────────────────
  function _mapModel(s) {
    var m = _call('Journey', 'mapModel');
    if (Array.isArray(m) && m.length) return m;
    var nodes = _allNodes(), cur = _num(s.stage, 1);
    return _stages().map(function(st) {
      var ns = nodes.filter(function(n) { return n.stage === st.n; }).map(function(n) {
        return { id: n.id, title: n.title, kind: n.kind, status: status(n.id, s), hint: '' };
      });
      return { stage: st.n, title: st.title, name: st.name, pct: null, open: st.n <= cur, nodes: ns };
    });
  }
  function _pct(sm) {
    var ns = sm.nodes || [];
    if (ns.length) return Math.round(ns.filter(function(n) { return n.status === 'passed'; }).length / ns.length * 100);
    var p = _num(sm.pct, 0);
    return Math.max(0, Math.min(100, Math.round(p <= 1 && p > 0 && String(sm.pct).indexOf('.') >= 0 ? p * 100 : p)));
  }
  function _stepLabel(step, nd) {
    if (step === 'lesson') return '레슨';
    if (step === 'drill') return (nd && nd.drill ? _typeName(nd.drill.type) + ' ' + _drillCount(nd.drill) + '문항' : '드릴');
    if (step === 'mission') return (nd && nd.mission ? '실전 ' + nd.mission.hands + '핸드' : '실전');
    if (step === 'boss') return '승급 시험';
    return '';
  }
  function _typeName(t) {
    if (TYPE_LABEL[t]) return TYPE_LABEL[t];
    // 이 표에 없는 새 유형은 퍼즐 등록부(M2-P1 TYPE_META 또는 register meta)의 이름을 쓴다
    var P = _m('Puzzles'), m = null;
    try { m = (P && P.TYPE_META && P.TYPE_META[t]) || (P && typeof P.meta === 'function' ? P.meta(t) : null); } catch (e) { m = null; }
    var nm = m && (m.label || m.name || m.title);
    return (typeof nm === 'string' && nm) ? nm : (t || '');
  }
  function _drillCount(d) {
    if (!d) return 0;
    if (d.type === 'mixed' && Array.isArray(d.set)) return d.set.reduce(function(a, x) { return a + _num(x && x[1], 0); }, 0);
    return _num(d.count, 0);
  }

  // ── 렌더: 루트, 마운트 ─────────────────────────────────
  function _root() { return _el('journey-root'); }
  function _mount() {
    var root = _root();
    if (!root) return null;
    var v = root.querySelector ? root.querySelector(':scope > .j-view') : null;
    if (!v) {
      root.innerHTML = '<div class="j-view"></div><div class="j-layer"></div>';
      v = root.querySelector('.j-view');
      _sheetId = null;
    }
    return v;
  }
  function viewEl() { return _mount(); }
  function _layer() { var r = _root(); return r && r.querySelector ? r.querySelector(':scope > .j-layer') : null; }
  function _screenActive() { var s = _el('screen-journey'); return !!(s && s.classList && s.classList.contains('active')); }
  function _showScreen() {
    if (_screenActive()) return;
    if (_can('App', 'showScreen')) _call('App', 'showScreen', 'screen-journey');
    else {
      var all = document.querySelectorAll('.screen');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
      var s = _el('screen-journey'); if (s) s.classList.add('active');
    }
  }
  function _scrollTop() { var s = _el('screen-journey'); if (s) s.scrollTop = 0; }

  function render() {
    var v = _mount();
    if (!v) return;
    _cur = 'home';
    var html;
    try { html = _homeHTML(state()); }
    catch (e) {
      if (typeof console !== 'undefined') console.error('[JourneyUI] 홈 렌더 실패', e);
      html = _fallbackHTML();
    }
    v.innerHTML = html;
    _homeDay = _dayKey(_now());
    // (M6-P0, 계약 H11 c) 홈을 그린 뒤 배지 깜짝 해금 확인(COLLECT). 예외는 경고만 남기고 홈은 그대로
    if (_can('Badges', 'onHome')) _call('Badges', 'onHome', _now());
  }

  // (M7 TIME-04, FLOW-04) 설치형 PWA가 백그라운드에 살아 있는 채 날짜가 바뀐 뒤 앞으로 오면 홈은 그릴 때의 날짜 HTML 그대로라
  // 어제 기준 카드(주간 챌린지 남은 날, 데일리 5 완료 표시, 오늘 링)가 남는다. 순수 판정: 홈이고 시트가 닫혀 있고 날짜가 바뀌었을 때만 true.
  function needsRefresh(prevDay, now, cur, sheet) {
    return !!prevDay && cur === 'home' && !sheet && prevDay !== _dayKey(now);
  }
  function _onVisible() {
    try {
      if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible') return;
      if (!_screenActive()) return;                                              // 게임, 레슨 등 다른 화면은 건드리지 않음
      if (_can('TodayUI', 'running') && _call('TodayUI', 'running')) return;    // 오늘의 5분 진행 중
      if (needsRefresh(_homeDay, _now(), _cur, _sheetId)) render();
    } catch (e) { _warn('날짜 넘김 복귀', e); }
  }

  function _fallbackHTML() {
    return '<div class="j-home"><div class="j-card"><div class="j-card-t">여정 홈을 불러오지 못했어요</div>' +
      '<div class="j-card-d">기록은 그대로예요. 자유 연습은 더보기에서 할 수 있어요.</div>' +
      '<div class="j-card-acts"><button type="button" class="j-btn" onclick="JourneyUI.render()">다시 시도</button>' +
      '<button type="button" class="j-btn j-ghost" onclick="JourneyUI.quick(\'more\')">⋯ 더보기</button></div></div></div>';
  }

  function homeHTML(s) { return _homeHTML(s || state()); }   // 순수 문자열(테스트, 하네스용)
  function _homeHTML(s) {
    var sm = summary(s), pc = providerCards(s);
    // (POLISH UX-01) 빠른 줄은 오늘의 5분 바로 아래(설계서 5.2절 순서와 다름): 매일 쓰는 입구가 폰 첫 화면에 보이게.
    // (POLISH UX-03) 첫 완주 뒤 1회 설정 카드는 지도 위(.j-cards-top)에: 카드 영역은 지도 아래라 스크롤해야 보였다.
    return '<div class="j-home">' + _topHTML(s, sm) +
      '<section class="j-today-area" aria-label="오늘의 학습">' + (needFirstCard(s) ? firstCard() : _todayBtnHTML(s)) + '</section>' +
      _quickHTML() +
      _topCardsHTML(pc, needSettingsCard(s) ? settingsCard() : '') +
      '<section class="j-map" aria-label="여정 지도">' + renderMap(_mapModel(s), true) + '</section>' +
      '<section class="j-cards" aria-label="알림 카드">' + _cardsHTML(s, sm, pc) + '</section>' +
      '</div>';
  }

  // (1) 상단: 칭호 배지, 🔥 스트릭, ❄ 프리즈, 데일리 목표 링, 레벨 막대, 습관 문장
  function _topHTML(s, sm) {
    var st = _stageInfo(sm.stage);
    var goal = _goalMin(s), rec = _todayRec(s), mins = Math.max(0, _num(rec && rec.minutes, 0));
    var ringPct = Math.max(0, Math.min(1, mins / goal));
    var C = 2 * Math.PI * 17, dash = (C * ringPct).toFixed(1);
    var have = sm.xpHave, need = sm.xpNeed;
    var barPct = (need && need > 0) ? Math.max(0, Math.min(100, Math.round(have / need * 100))) : 0;
    var lvTxt = (need && need > 0) ? '다음 레벨까지 ' + Math.max(0, need - have) + ' XP' : sm.xp + ' XP';
    var habit = _habitSentence(s);
    return '<header class="j-top">' +
      '<div class="j-top-row">' +
        '<div class="j-badge" title="칭호는 승급 시험으로만 바뀌어요">' +
          '<span class="j-badge-ic" aria-hidden="true">' + (STAGE_ICON[sm.stage - 1] || '🌱') + '</span>' +
          '<span class="j-badge-txt"><b class="j-badge-t">' + _esc(sm.title) + '</b><span class="j-badge-s">S' + sm.stage + ' ' + _esc(st.name) + '</span></span>' +
        '</div>' +
        '<div class="j-stats">' +
          '<span class="j-stat j-streak" title="하루에 활동 1개(오늘의 5분 블록, 레슨, 퍼즐, 6인 실전 핸드, 극장)면 이어져요(시간대 이동은 36시간까지 봐줘요)" aria-label="연속 ' + sm.streak + '일">🔥<b>' + sm.streak + '</b>일</span>' +
          '<span class="j-stat j-freeze" title="공백을 메워 주는 프리즈(최대 2개)" aria-label="프리즈 ' + sm.freezes + '개">❄<b>' + sm.freezes + '</b></span>' +
          '<span class="j-ring" role="img" aria-label="오늘 목표 ' + goal + '분 중 ' + _fmtMin(mins) + '분">' +
            '<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><circle cx="20" cy="20" r="17" class="j-ring-bg"/>' +
            '<circle cx="20" cy="20" r="17" class="j-ring-fg" stroke-dasharray="' + dash + ' ' + C.toFixed(1) + '" transform="rotate(-90 20 20)"/></svg>' +
            '<span class="j-ring-t">' + _fmtMin(mins) + '<small>/' + goal + '</small></span></span>' +
          gearButton() +   // 스트릭, 링과 한 묶음(좁은 화면에서 줄이 바뀌어도 같이 오른쪽 정렬)
        '</div>' +
      '</div>' +
      '<div class="j-level"><span class="j-lv">L' + sm.level + '</span>' +
        '<span class="j-xpbar" aria-hidden="true"><i style="width:' + barPct + '%"></i></span>' +
        '<span class="j-xp-t">' + lvTxt + '</span>' + ratingChip() + '</div>' +
      (habit ? '<div class="j-habit">🧭 ' + _esc(habit) + '</div>' : '') +
      '</header>';
  }
  // 상단 ⚙ 설정(44px, 설정 뷰는 M2-P5 SettingsView. 없으면 준비 중 카드)
  function gearButton() {
    return '<button type="button" class="j-gear" aria-label="설정" title="설정(글자 크기, 4색 덱, 모션, 소리)" onclick="JourneyUI.view(\'settings\')">' +
      '<span aria-hidden="true">⚙</span></button>';
  }
  // 퍼즐 레이팅 칩: Rating.label()(RD가 크면 '1000?'). Rating 모듈이 없거나 label이 비면 숨긴다.
  function _ratingLabel() {
    if (!_can('Rating', 'label')) return '';
    var lb = _call('Rating', 'label');
    if ((lb == null || lb === '') && _can('Rating', 'current')) lb = _call('Rating', 'label', _call('Rating', 'current'));
    if (typeof lb === 'number' && isFinite(lb)) lb = String(Math.round(lb));
    return (typeof lb === 'string' && lb) ? lb : '';
  }
  function ratingChip() {
    var lb = _ratingLabel();
    if (!lb) return '';
    return '<button type="button" class="j-rating" title="' + RATING_TIP + '" aria-label="퍼즐 레이팅 ' + _esc(lb) + ', 나의 추세용" onclick="JourneyUI._ratingTap()">' +
      '<span class="j-rating-in"><span aria-hidden="true">🎯</span><b>' + _esc(lb) + '</b></span></button>';
  }
  // 폰에는 툴팁이 없으니 탭하면 같은 문구를 토스트로
  function _ratingTap() {
    var lb = _ratingLabel();
    toast(RATING_TIP + (/\?$/.test(lb) ? '. ?는 아직 푼 문제가 적어 잠정 값이라는 뜻이에요' : '') + '. 승급은 레이팅이 아니라 통과 기준으로 정해져요', 3200);
  }
  function _fmtMin(m) { m = Math.round(m * 10) / 10; return (m % 1 === 0) ? String(m) : m.toFixed(1); }
  function _habitSentence(s) {
    var h = (s && s.habit) || {}, goal = _goalMin(s);
    if (!h.when) return '';
    if (h.when === 'custom') return h.custom ? _clean(h.custom).slice(0, 30) + ' 포커 ' + goal + '분' : '';
    for (var i = 0; i < HABITS.length; i++) if (HABITS[i].id === h.when) return HABITS[i].text + ' 포커 ' + goal + '분';
    return '';
  }

  // (2) ▶ 오늘의 5분 버튼 + 블록 미리보기 칩
  function _todayBtnHTML(s) {
    var goal = _goalMin(s);
    var pv = _can('TodayUI', 'preview') ? _call('TodayUI', 'preview') : null;
    var main = '▶ 오늘의 ' + goal + '분', sub = '';
    if (pv && pv.state === 'progress') { main = '▶ 이어서 하기'; sub = '남은 블록 ' + pv.left + '개'; }
    else if (pv && pv.state === 'done' && pv.completed) { main = '✓ 오늘 완주'; sub = '한 번 더 하려면 눌러요'; }
    else if (pv && pv.state === 'done') { sub = '새 블록으로 다시 시작해요'; }
    else if (pv && pv.estMin) sub = '약 ' + Math.max(1, Math.round(pv.estMin)) + '분, 블록 ' + (pv.chips || []).length + '개';   // (UX-07) 소수점 분 숨김, 저장값은 그대로
    var chips = (pv && pv.chips) || [];
    return '<button type="button" class="j-today-btn' + (pv && pv.state === 'done' && pv.completed ? ' is-done' : '') + '" onclick="JourneyUI._todayTap()">' +
        '<span class="j-today-main">' + main + '</span>' + (sub ? '<span class="j-today-sub">' + _esc(sub) + '</span>' : '') +
      '</button>' +
      (chips.length ? '<div class="j-chips" aria-label="오늘 블록">' + chips.map(function(c) {
        return '<span class="j-chip' + (c.done ? ' is-done' : '') + '">' + (c.done ? '✓ ' : '') + _esc(c.label) + '</span>';
      }).join('') + '</div>' : '');
  }

  function firstCard() {
    if (!needFirstCard()) return '';
    return '<div class="j-first" role="group" aria-label="시작 방법">' +
      '<div class="j-first-t">어디서부터 시작할까요?</div>' +
      '<div class="j-first-d">아는 게 있으면 3분 확인으로 앞 단계를 건너뛸 수 있어요. 몰라도 괜찮아요.</div>' +
      '<button type="button" class="j-btn j-primary j-first-btn" onclick="JourneyUI._first(\'placement\')">📝 실력 확인 3분<small>10문제로 시작 단계를 정해요</small></button>' +
      '<button type="button" class="j-btn j-first-btn" onclick="JourneyUI._first(\'boss\')">👑 보스로 건너뛰기<small>승급 시험을 통과하면 그 단계가 통과돼요</small></button>' +
      '<button type="button" class="j-btn j-ghost j-first-btn" onclick="JourneyUI._first(\'start\')">▶ 그냥 시작<small>새싹 단계부터 오늘의 5분</small></button>' +
      '</div>';
  }

  function _first(choice) {
    if (choice === 'placement') { view('placement'); return; }
    if (choice === 'boss') { openNode(_bossId(1)); return; }
    var s = state();
    s.placement = s.placement || {};
    if (!s.placement.declinedAt) s.placement.declinedAt = _iso(_now());
    save(s);
    if (_can('TodayUI', 'start')) _call('TodayUI', 'start');
    else render();
  }
  function _bossId(stage) {
    var id = _call('Placement', 'skipToBoss', stage);
    if (typeof id === 'string' && id) return id;
    var st = _stageInfo(stage);
    return (st && st.boss) || ('s' + stage + '-boss');
  }

  function _todayTap() {
    if (!_can('TodayUI', 'start')) { toast('오늘의 5분을 준비하고 있어요'); return; }
    var pv = _call('TodayUI', 'preview');
    if (pv && pv.state === 'done' && _can('TodayUI', 'again')) _call('TodayUI', 'again');
    else _call('TodayUI', 'start');
  }

  // (3) 여정 지도: 현재 단계 펼침, 다른 단계는 접힌 띠
  function renderMap(model, asString) {
    var s = state();
    model = Array.isArray(model) ? model : _mapModel(s);
    var cur = summary(s).stage;
    var next = summary(s).nextNode;
    var html = '<h2 class="j-sec-t">여정 지도</h2>' + model.map(function(sm) {
      var n = _num(sm.stage, 0), pct = _pct(sm);
      var open = (n === cur) ? (_expanded[n] !== false) : !!_expanded[n];
      var nodes = sm.nodes || [];
      var passed = nodes.filter(function(x) { return x.status === 'passed'; }).length;
      var head = '<button type="button" class="j-stage-head' + (open ? '' : ' j-band') + (n === cur ? ' is-cur' : '') + '" aria-expanded="' + open + '" onclick="JourneyUI._toggleStage(' + n + ')">' +
        '<span class="j-stage-ic" aria-hidden="true">' + (STAGE_ICON[n - 1] || '•') + '</span>' +
        '<span class="j-stage-name"><b>S' + n + ' ' + _esc(sm.title || _stageInfo(n).title) + '</b><span>' + _esc(sm.name || _stageInfo(n).name) + '</span></span>' +
        '<span class="j-stage-pct">' + (nodes.length ? passed + '/' + nodes.length + ' 통과' : pct + '%') + '</span>' +
        '<span class="j-chev" aria-hidden="true">' + (open ? '▴' : '▾') + '</span></button>';
      if (!open) return '<div class="j-stage">' + head + '</div>';
      var body = nodes.length ? '<ol class="j-path">' + nodes.map(function(x) { return _nodeRowHTML(x, next, s); }).join('') + '</ol>'
        : '<div class="j-empty">이 단계 지도는 곧 열려요</div>';
      return '<div class="j-stage is-open">' + head + body + '</div>';
    }).join('');
    if (!asString) {
      var v = _root() && _root().querySelector('.j-map');
      if (v) v.innerHTML = html;
    }
    return html;
  }

  function _nodeRowHTML(x, next, s) {
    var st = STATUS[x.status] ? x.status : 'locked';
    var skipped = st === 'passed' && !!((_nodeRec(s, x.id) || {}).skipped);
    var isBoss = x.kind === 'boss';
    var isCur = !!(next && next.id === x.id);
    var nd = node(x.id);
    var hint = x.hint || (isCur && next.step ? '다음: ' + _stepLabel(next.step, nd) : '');
    if (x.available && (st === 'open' || st === 'done')) {
      var step = _stepOf(x.id), STEP_W = { lesson: '레슨', drill: '드릴', mission: '실전', boss: '승급 시험' };
      if (step && STEP_W[step] && !canDo(step, nd)) hint = STEP_W[step] + '은 다음 업데이트에서 열려요';
    }
    var stLabel = STATUS[st].label + (skipped ? '(건너뜀)' : '');
    var label = (x.title || x.id) + ', ' + stLabel + (isBoss ? ', 승급 시험' : '') + (isCur ? ', 지금 할 차례' : '');
    return '<li class="j-step"><button type="button" class="j-node is-' + st + (isBoss ? ' is-boss' : '') + (isCur ? ' is-cur' : '') +
      '" data-id="' + _esc(x.id) + '" data-status="' + st + '" aria-label="' + _esc(label) + '" onclick="JourneyUI.openNode(\'' + _esc(x.id) + '\')">' +
      '<span class="j-dot" aria-hidden="true"><span class="j-dot-ic">' + (isBoss && st !== 'passed' && st !== 'locked' ? '👑' : STATUS[st].icon) + '</span></span>' +
      '<span class="j-node-txt"><span class="j-node-t">' + _esc(x.title || x.id) + '</span>' +
      '<span class="j-node-s">' + STATUS[st].icon + ' ' + stLabel + (isBoss ? ', 승급 시험' : '') + '</span>' +
      (hint ? '<span class="j-node-h">' + _esc(hint) + '</span>' : '') + '</span></button></li>';
  }

  function _toggleStage(n) {
    var cur = summary().stage;
    var open = (n === cur) ? (_expanded[n] !== false) : !!_expanded[n];
    _expanded[n] = !open;
    renderMap();
  }

  // (4) 빠른 줄 6개
  function _quickHTML() {
    var Q = [['rush', '⚡', '퍼즐 러시'], ['theater', '🎭', '극장'], ['game', '🃏', '자유 게임'],
      ['review', '📜', '리뷰'], ['stats', '📊', '내 실력'], ['more', '⋯', '더보기']];
    // 이번 버전에 아직 없는 화면(퍼즐 러시, 극장, 내 실력)은 흐리게 + "곧" 표시(눌러도 준비 중 카드)
    var PM = _m('PuzzleModes'), TU = _m('TheaterUI'), DV = _m('DashboardView');
    var soon = { rush: !(PM && (typeof PM.rush === 'function' || typeof PM.start === 'function')),
      theater: !(TU && (typeof TU.open === 'function' || typeof TU.start === 'function')),
      stats: !(DV && (typeof DV.open === 'function' || typeof DV.render === 'function')) };
    return '<nav class="j-quick" aria-label="빠른 이동">' + Q.map(function(q) {
      var sn = !!soon[q[0]];
      return '<button type="button" class="j-q' + (sn ? ' is-soon' : '') + '"' + (sn ? ' aria-label="' + q[2] + ', 준비 중"' : '') +
        ' onclick="JourneyUI.quick(\'' + q[0] + '\')"><span class="j-q-ic" aria-hidden="true">' + q[1] +
        '</span><span class="j-q-t">' + q[2] + '</span>' + (sn ? '<span class="j-q-soon" aria-hidden="true">곧</span>' : '') + '</button>';
    }).join('') + '</nav>';
  }

  function quick(name) {
    if (name === 'game') { _setOrigin(); if (_can('App', 'startGame')) _call('App', 'startGame'); return; }
    if (name === 'review') { _setOrigin(); if (_can('App', 'showHistory')) _call('App', 'showHistory'); return; }
    if (name === 'more') { _origin = false; _syncSummaryBtn(); if (_can('App', 'showScreen')) _call('App', 'showScreen', 'screen-menu'); return; }
    if (name === 'stats') { view('dashboard'); return; }
    if (name === 'rush') {
      var PM = _m('PuzzleModes');
      if (PM && typeof PM.rush === 'function') { _call('PuzzleModes', 'rush'); return; }
      if (PM && typeof PM.start === 'function') { _call('PuzzleModes', 'start', 'rush'); return; }
      _soonView('rush'); return;   // view('rush')는 진행 상태 없는 퍼즐 해시라 홈으로 가므로 준비 중 카드를 직접 띄운다
    }
    if (name === 'theater') {
      var TU = _m('TheaterUI');
      if (TU && typeof TU.open === 'function') { _call('TheaterUI', 'open'); return; }
      // open 없이 start만 있으면 1편을 보고 여정 홈으로(계약 T8 start 형식). 열지 못하면(onDone(null)) 준비 중 카드
      if (TU && typeof TU.start === 'function') {
        _call('TheaterUI', 'start', { episodes: 1, onDone: function(r) { if (r) open(); else _soonView('theater'); } });
        return;
      }
      _soonView('theater'); return;
    }
  }

  // (5) 카드 영역: 공급자 강조 카드(M6, H11 a), 첫 완주 뒤 설정 카드, (월요일 강조면) 주간 리포트, 데일리 5, 공급자 카드(시즌, 미니시즌,
  //     배지 순), 오늘의 명장면, 주간 리포트, 실력 확인(건너뛴 경우), 월초 백업 안내
  function _cardsHTML(s, sm, pc) {
    var out = [];
    pc = pc || providerCards(s);
    out = out.concat(pc.emph);   // (M6-P0, H11 a) 공급자 강조 카드는 카드 영역 맨 앞
    // (POLISH UX-03) 첫 완주 뒤 설정 카드는 _homeHTML이 지도 위(.j-cards-top)에 그린다. 여기(지도 아래)에는 없음.
    var wk = _weeklyInfo(), wkHTML = weeklyCard(wk);
    if (wkHTML && wk.emph) out.push(wkHTML);
    var d5 = daily5Card();
    if (d5) out.push(d5);
    out = out.concat(pc.rest);   // 나머지 공급자 카드는 데일리 5 카드 뒤
    var hl = highlightCard();
    if (hl) out.push(hl);
    if (wkHTML && !wk.emph) out.push(wkHTML);
    var pl = s.placement || {};
    if (!pl.done && pl.declinedAt && sm.nodesPassed === 0) {
      out.push('<div class="j-card"><div class="j-card-t">📝 실력 확인 3분</div>' +
        '<div class="j-card-d">이미 아는 단계는 10문제 확인으로 건너뛸 수 있어요(한 번만).</div>' +
        '<div class="j-card-acts"><button type="button" class="j-btn" onclick="JourneyUI.view(\'placement\')">실력 확인</button></div></div>');
    }
    // 월초 백업 안내: BackupUI.homeCard(공급자, M7 P5)가 있으면 그쪽이 월간 백업 카드를 맡으므로 이 카드는 생략한다(중복 방지)
    if (sm.xp > 0 && new Date(_now()).getDate() <= 7 && _can('BackupUI', 'open') && !_can('BackupUI', 'homeCard')) {
      out.push('<div class="j-card"><div class="j-card-t">💾 이번 달 기록 백업</div>' +
        '<div class="j-card-d">기록은 이 기기에만 있어요. 한 달에 한 번 파일로 남겨 두면 안심이에요.</div>' +
        '<div class="j-card-acts"><button type="button" class="j-btn" onclick="BackupUI.open()">백업하기</button></div></div>');
    }
    return out.join('');
  }

  // (M6-P0, 계약 H11 a) 카드 영역 공급자: CARD_PROVIDERS 순으로 M.homeCard(state, now) → { html, emph? } | null.
  // typeof 가드, 예외나 html이 빈 문자열이면 그 카드만 뺀다. emph 카드는 카드 영역 맨 앞, 나머지는 데일리 5 카드 뒤(공급자 순서 유지).
  // (M7 통합 검증) top: true 카드(저장 공간 경고)는 out.top(있을 때만 키가 생김)에 모아 카드 영역이 아니라 오늘의 5분 바로 아래(지도 위)에
  //   그린다. 카드 영역은 지도 아래라 폰 첫 화면에 보이지 않아, 기록이 저장되지 않을 수 있다는 경고를 스크롤해야 볼 수 있던 것.
  function providerCards(s) {
    var out = { emph: [], rest: [] }, now = _now();
    s = s || state();
    // (POLISH UX-10) 아직 아무것도 안 한 사용자(첫 카드 단계 또는 XP 0)에게는 주간 챌린지 카드를 보이지 않는다(첫 화면 정보량).
    //   Seasons.homeCard(sync 포함)는 그대로 불러 XP 판정과 상태 갱신은 변함없고, html만 버린다.
    var hideSeason = needFirstCard(s) || summary(s).xp === 0;
    CARD_PROVIDERS.forEach(function(name) {
      var M = _m(name);
      if (!M || typeof M.homeCard !== 'function') return;
      var c = null;
      try { c = M.homeCard(s, now); } catch (e) { _warn(name + '.homeCard', e); return; }
      if (!c || typeof c !== 'object' || typeof c.html !== 'string' || !c.html) return;
      if (name === 'Seasons' && hideSeason) return;
      if (c.top) { (out.top = out.top || []).push(c.html); return; }
      (c.emph ? out.emph : out.rest).push(c.html);
    });
    return out;
  }
  // (POLISH UX-03) extra: 공급자 top 카드 뒤에 붙일 카드 문자열(첫 완주 뒤 설정 카드). 빈 문자열이면 무시.
  function _topCardsHTML(pc, extra) {
    var list = ((pc && pc.top) || []).slice();
    if (extra) list.push(extra);
    return list.length ? '<section class="j-cards j-cards-top" aria-label="중요 알림" style="margin:12px 0">' + list.join('') + '</section>' : '';
  }

  // 📅 주간 리포트 카드(M5-WEEKLY): WeeklyView.cardInfo(ReviewQueue, now)가 내용이 있다고 할 때만. 없으면 빈 문자열(홈 출력 그대로).
  // emph(월요일, 이번 주 리포트 아직 안 봄)면 강조 테두리와 주 버튼, 카드 영역 맨 앞(_cardsHTML)
  function _weeklyInfo() {
    if (!_can('WeeklyView', 'cardInfo') || !_m('ReviewQueue')) return null;
    var c = _call('WeeklyView', 'cardInfo', _m('ReviewQueue'), _now());
    return (c && typeof c === 'object' && c.show) ? c : null;
  }
  function weeklyCard(info) {
    var c = info === undefined ? _weeklyInfo() : info;
    if (!c) return '';
    return '<div class="j-card j-wk-card' + (c.emph ? ' is-new' : '') + '" role="group" aria-label="주간 리포트">' +
      '<div class="j-card-t">' + _esc(c.title || '📅 주간 리포트') + '</div>' +
      (c.desc ? '<div class="j-card-d">' + _esc(c.desc) + '</div>' : '') +
      '<div class="j-card-acts"><button type="button" class="j-btn' + (c.emph ? ' j-primary' : '') + '" onclick="JourneyUI.view(\'weekly\')">📅 리포트 보기</button></div></div>';
  }

  // 데일리 5 카드(C6): 오늘 미완이면 시작 버튼, 완료면 점수. PuzzleModes.daily5/daily5Status가 없으면 숨긴다.
  function daily5Card() {
    if (!_can('PuzzleModes', 'daily5') || !_can('PuzzleModes', 'daily5Status')) return '';
    var st = _call('PuzzleModes', 'daily5Status', _now());
    if (!st || typeof st !== 'object') return '';
    if (st.done) {
      var sc = Number(st.score);
      return '<div class="j-card j-d5 is-done" role="group" aria-label="데일리 5 완료">' +
        '<div class="j-d5-head"><span class="j-d5-ic" aria-hidden="true">🗓</span><div class="j-card-t">데일리 5 완료</div>' +
        (isFinite(sc) && st.score !== null ? '<span class="j-d5-score">' + Math.round(sc) + '점</span>' : '') + '</div>' +
        '<div class="j-card-d">' + (isFinite(sc) && st.score !== null ? '오늘 점수 ' + Math.round(sc) + '점(100점 만점). ' : '') + '내일 새 5문제가 나와요.</div></div>';
    }
    return '<div class="j-card j-d5" role="group" aria-label="데일리 5">' +
      '<div class="j-d5-head"><span class="j-d5-ic" aria-hidden="true">🗓</span><div class="j-card-t">데일리 5</div></div>' +
      '<div class="j-card-d">날마다 바뀌는 5문제, 약 3분이에요. 문제마다 한 줄 해설이 나오고 100점 만점으로 채점해요.</div>' +
      '<div class="j-card-acts"><button type="button" class="j-btn j-primary" onclick="JourneyUI._daily5()">▶ 데일리 5 시작</button></div></div>';
  }
  // 홈 카드에서 시작: 인자 없이 부른다(C6, 끝난 뒤 화면 정리는 PuzzleModes가 맡고 홈은 다시 그릴 때 점수를 보인다)
  function _daily5() {
    if (!_can('PuzzleModes', 'daily5')) { toast('데일리 5를 준비하고 있어요'); return; }
    _call('PuzzleModes', 'daily5');
  }

  // 오늘의 명장면 카드(M4-P8, 5.1절): Journey.highlightOfDay(날짜 시드) 카드가 있고 TheaterUI.cardHTML이 있을 때만.
  // 카드 그림은 TheaterUI.cardHTML(순수 문자열, 계약 T8). "자세히 보기"는 TheaterUI.showCard가 있을 때만(그때 홈 카드는 요약).
  function highlightCard() {
    if (!_can('TheaterUI', 'cardHTML') || !_can('Journey', 'highlightOfDay')) return '';
    var card = _call('Journey', 'highlightOfDay', _now());
    if (!card || typeof card !== 'object') return '';
    var inner = _call('TheaterUI', 'cardHTML', card);
    if (typeof inner !== 'string' || !inner) return '';
    var n = _highlightCount(), big = _can('TheaterUI', 'showCard');
    return '<div class="j-card j-hl" role="group" aria-label="오늘의 명장면">' +
      '<div class="j-card-t">🎬 오늘의 명장면</div>' +
      '<div class="j-card-d">' + (n > 1 ? '극장에서 모은 카드 ' + n + '장 중 오늘의 한 장이에요. 날마다 새로 골라요.'
        : '극장에서 처음 모은 카드예요. 카드가 늘면 날마다 한 장씩 골라 보여 줘요.') + '</div>' +
      // 홈에서는 제목, 보드, 팟만 보이는 요약(에쿼티, 계획, 출연은 '자세히 보기' 창에서). 창을 열 수 없으면 전부 보인다
      '<div class="j-hl-card' + (big ? ' is-compact' : '') + '">' + inner + '</div>' +
      (big ? '<div class="j-card-acts"><button type="button" class="j-btn" onclick="JourneyUI._highlight()">🔍 자세히 보기(에쿼티, 계획)</button></div>' : '') +
      '</div>';
  }
  function _highlightCount() {
    var t = state().theater;
    return (t && Array.isArray(t.cards)) ? t.cards.length : 0;
  }
  function _highlight() {
    var card = _call('Journey', 'highlightOfDay', _now());
    if (!card || !_can('TheaterUI', 'showCard')) { toast('명장면을 준비하고 있어요'); return; }
    _call('TheaterUI', 'showCard', { card: card, onDone: function() { open(); } });
  }

  function settingsCard() {
    var s = state();
    if (!needSettingsCard(s)) return '';
    var goal = _goalMin(s), h = s.habit || {};
    var pick = _habitDraft || h.when || null;
    var set = _readSettings();
    var canVib = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    var chip = function(on, attrs, txt) { return '<button type="button" class="j-pick' + (on ? ' is-on' : '') + '" aria-pressed="' + !!on + '" ' + attrs + '>' + txt + '</button>'; };
    return '<div class="j-card j-settings" id="j-settings-card">' +
      '<div class="j-card-t">🎉 첫 완주! 내게 맞게 정해요</div>' +
      '<div class="j-set-row"><span class="j-set-l">하루 목표</span><span class="j-picks">' +
        [5, 10, 15].map(function(m) { return chip(goal === m, 'onclick="JourneyUI._setGoal(' + m + ')"', m + '분'); }).join('') + '</span></div>' +
      '<div class="j-set-row"><span class="j-set-l">언제 할까요?</span><span class="j-picks">' +
        HABITS.map(function(x) { return chip(pick === x.id, 'onclick="JourneyUI._pickHabit(\'' + x.id + '\')"', _esc(x.id)); }).join('') +
        chip(pick === 'custom', 'onclick="JourneyUI._pickHabit(\'custom\')"', '직접 입력') + '</span></div>' +
      (pick === 'custom' ? '<div class="j-set-row"><input id="j-habit-custom" class="j-input" maxlength="30" placeholder="예: 지하철에서" value="' + _esc(h.custom || '') + '"></div>' : '') +
      '<div class="j-set-row"><span class="j-set-l">효과</span><span class="j-picks">' +
        chip(!!set.sound, 'onclick="JourneyUI._toggleSet(\'sound\')"', '🔔 소리') +
        (canVib ? chip(!!set.vibrate, 'onclick="JourneyUI._toggleSet(\'vibrate\')"', '📳 진동') : '') + '</span></div>' +
      '<div class="j-card-acts"><button type="button" class="j-btn j-primary" onclick="JourneyUI._saveSettings()">저장</button>' +
      '<button type="button" class="j-btn j-ghost" onclick="JourneyUI._saveSettings(true)">건너뛰기</button></div></div>';
  }
  function _setGoal(m) { var s = state(); s.goal = s.goal || {}; s.goal.minutes = m; save(s); render(); }
  function _pickHabit(id) { _habitDraft = id; render(); }
  function _toggleSet(k) {
    var set = _readSettings(); set[k] = !set[k]; _writeSettings(set);
    if (k === 'vibrate' && set.vibrate && typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* noop */ } }
    render();
  }
  function _saveSettings(skip) {
    var s = state();
    s.habit = s.habit || { when: null, custom: '' };
    if (!skip && _habitDraft) {
      s.habit.when = _habitDraft;
      if (_habitDraft === 'custom') { var inp = _el('j-habit-custom'); s.habit.custom = inp ? String(inp.value || '').trim().slice(0, 30) : ''; if (!s.habit.custom) s.habit.when = null; }
    }
    s.habit.askedAt = _iso(_now());
    _habitDraft = null;
    save(s);
    render();
    toast(skip ? '설정은 나중에 바꿀 수 있어요' : '저장했어요');
  }
  function _readSettings() {
    var o = null;
    try { var raw = localStorage.getItem(SETTINGS_KEY); if (raw) o = JSON.parse(raw); } catch (e) { o = null; }
    return (o && typeof o === 'object') ? o : { v: 1 };
  }
  function _writeSettings(o) {
    o.v = o.v || 1;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(o)); } catch (e) { /* 저장 불가: 이번 화면에서만 적용 */ }
    if (_can('A11y', 'apply')) _call('A11y', 'apply', o);
  }

  // ── 노드 시트(바텀 시트) ──────────────────────────────
  function openNode(id, opts) {
    if (!id) return;
    if (!_screenActive()) { _showScreen(); }
    var v = _mount();
    if (!v) return;
    if (_cur !== 'home') render();
    var layer = _layer();
    if (!layer) return;
    var swap = !!_sheetId && !(opts && opts.fromNav);   // 시트 안에서 다른 노드로(선행 칩): 히스토리를 쌓지 않고 교체
    _sheetId = id;
    // 교체는 Nav 논리 스택과 함께(Nav.replaceView). 브라우저 기록만 바꾸면 그 위에 쌓인 뷰(맞히기 화면 등)에서 뒤로 올 때
    // 예전 노드 시트가 다시 열린다(M6 통합 검증). Nav가 없으면 예전처럼 해시만 교체
    if (swap && typeof location !== 'undefined' && String(location.hash || '').indexOf('#j/node/') === 0) {
      if (_can('Nav', 'replaceView')) { _call('Nav', 'replaceView', 'node', id); opts = { fromNav: true }; }
      else if (typeof history !== 'undefined' && history.replaceState) {
        try { history.replaceState(history.state, '', '#j/node/' + id); opts = { fromNav: true }; } catch (e) { /* 해시 교체 불가: 그냥 push */ }
      }
    }
    layer.innerHTML = '<div class="j-sheet-bg" onclick="JourneyUI.closeSheet()"></div>' + _sheetHTML(id);
    layer.classList.add('is-open');
    var x = layer.querySelector('.j-x'); if (x && x.focus) { try { x.focus({ preventScroll: true }); } catch (e) { /* noop */ } }
    if (!(opts && opts.fromNav)) _navView('node', id);
  }

  function closeSheet(opts) {
    var layer = _layer();
    var was = _sheetId;
    _sheetId = null;
    if (layer) { layer.innerHTML = ''; layer.classList.remove('is-open'); }
    if (was && !(opts && (opts.silent || opts.fromNav)) && typeof location !== 'undefined' &&
        String(location.hash || '').indexOf('#j/node/') === 0 && _can('Nav', 'back')) _call('Nav', 'back');
  }

  function _navView(name, params) {
    if (!_can('Nav', 'view') || typeof location === 'undefined') return;
    var want = '#j/' + name + '/' + (params == null ? '' : params);
    if (String(location.hash || '') === want) return;   // 뒤로 가기(popstate)로 다시 열 때 중복 push 방지
    _call('Nav', 'view', name, params);
  }

  function _sheetHTML(id) {
    var s = state(), nd = node(id), st = status(id, s), rec = _nodeRec(s, id) || {};
    var stInfo = STATUS[st] || STATUS.locked;
    if (!nd) {
      return '<div class="j-sheet" role="dialog" aria-modal="true" aria-labelledby="j-sheet-t">' + _sheetHead(id, st, id) +
        '<p class="j-goal">이 노드 정보는 다음 업데이트에서 채워져요.</p></div>';
    }
    var isBoss = nd.kind === 'boss';
    var stage = _stageInfo(nd.stage);
    var ev = _call('Journey', 'evaluateNode', id) || {};
    var parts = [];
    // 선행 노드 칩
    var pre = (nd.prereq || []).map(function(p) {
      var pn = node(p), ps = status(p, s);
      return '<button type="button" class="j-pre-chip is-' + ps + '" onclick="JourneyUI.openNode(\'' + _esc(p) + '\')">' + STATUS[ps].icon + ' ' + _esc(pn ? pn.title : p) + '</button>';
    });
    if (pre.length) parts.push('<div class="j-pre"><span class="j-pre-l">먼저</span>' + pre.join('') + '</div>');
    // 진행 3칸(레슨/드릴/미션)
    var cells = [];
    if (nd.lesson) cells.push(_cell('레슨', _evOk(ev.lesson, !!(rec.lesson && rec.lesson.done)), rec.lesson && rec.lesson.done ? '완료' : (rec.lesson && rec.lesson.scene ? rec.lesson.scene + '장면까지' : '아직')));
    if (nd.drill) {
      var cnt = _drillCount(nd.drill), best = _num(rec.drill && rec.drill.best, 0), dpass = _num(nd.drill.pass, cnt);
      cells.push(_cell('드릴', _evOk(ev.drill, best * cnt >= dpass), rec.drill && rec.drill.n ? '최고 ' + Math.round(best * cnt) + '/' + cnt : (dpass > 0 ? '아직' : '연습(선택)')));
    }
    if (nd.mission) {
      // 롤링 집계라 기준보다 많이 칠 수 있다(보스 핸드 포함). 칸에는 기준까지만 보인다("10/5핸드" 대신 "5/5핸드")
      var mh = _num(rec.mission && rec.mission.hands, 0), mneed = _num(nd.mission.hands, 0);
      cells.push(_cell('실전', _evOk(ev.mission, mh >= mneed && !(nd.mission.conditions || []).length), Math.min(mh, mneed) + '/' + mneed + '핸드'));
    }
    if (cells.length) parts.push('<div class="j-prog3">' + cells.join('') + '</div>');
    // 통과 기준과 롤링 진행
    var crit = _critLines(nd);
    var roll = _rollLines(nd, s);
    if (crit.length) parts.push('<div class="j-crit"><div class="j-crit-t">통과 기준</div><ul>' + crit.map(function(c) { return '<li>' + _esc(c) + '</li>'; }).join('') + '</ul>' +
      (roll.length ? '<div class="j-roll">' + roll.map(_esc).join('<br>') + '</div>' : '') + '</div>');
    // 요약 문장
    var sumTxt = _lessonSum(nd);
    if (sumTxt) parts.push('<div class="j-sum">💡 ' + _esc(sumTxt) + '</div>');
    // 버튼
    parts.push(_actsHTML(nd, st, rec, s));
    // (M6-P0, 계약 H11 b) 버튼 줄 뒤에 Boss.sheetActions(nodeId, rec, state) → html(S6 은닉 보스 유형 맞히기 등, 없으면 '')
    var extra = _bossSheetActions(id, rec, s);
    if (extra) parts.push(extra);
    var meta = 'S' + nd.stage + ' ' + _esc(stage.name) + (nd.est ? ', 약 ' + nd.est + '분' : '') + ', ' + stInfo.icon + ' ' + stInfo.label + (rec.skipped ? '(건너뜀)' : '');
    return '<div class="j-sheet' + (isBoss ? ' is-boss' : '') + '" role="dialog" aria-modal="true" aria-labelledby="j-sheet-t">' +
      _sheetHead(id, st, (isBoss ? '👑 ' : '') + nd.title) +
      '<p class="j-goal">' + _esc(nd.goal || '') + '</p><div class="j-meta">' + meta + '</div>' + parts.join('') + '</div>';
  }
  function _bossSheetActions(id, rec, s) {
    var B = _m('Boss');
    if (!B || typeof B.sheetActions !== 'function') return '';
    try {
      var h = B.sheetActions(id, rec, s);
      return (typeof h === 'string') ? h : '';
    } catch (e) { _warn('Boss.sheetActions', e); return ''; }
  }
  function _sheetHead(id, st, title) {
    return '<div class="j-sheet-grip" aria-hidden="true"></div><div class="j-sheet-head">' +
      '<span class="j-dot j-dot-sm is-' + st + '" aria-hidden="true"><span class="j-dot-ic">' + (STATUS[st] || STATUS.locked).icon + '</span></span>' +
      '<h3 id="j-sheet-t" class="j-sheet-t">' + _esc(title) + '</h3>' +
      '<button type="button" class="j-x" aria-label="닫기" onclick="JourneyUI.closeSheet()">✕</button></div>';
  }
  function _evOk(v, fb) { if (v === true || v === false) return v; if (v && typeof v === 'object' && 'ok' in v) return !!v.ok; return !!fb; }
  function _cell(name, ok, txt) {
    return '<div class="j-cell' + (ok ? ' is-ok' : '') + '"><span class="j-cell-n">' + (ok ? '✓ ' : '○ ') + name + '</span><span class="j-cell-v">' + _esc(txt) + '</span></div>';
  }
  function _critLines(nd) {
    var out = [];
    if (nd.lesson) out.push('레슨 끝까지 보기');
    var d = nd.drill;
    if (d) {
      var dc = _drillCount(d), dp = _num(d.pass, dc);
      var what = (d.type === 'mixed' && Array.isArray(d.set)) ?
        '혼합 ' + dc + '문항(' + d.set.map(function(x) { return _typeName(x[0]) + ' ' + x[1]; }).join(', ') + ')' : _typeName(d.type) + ' ' + dc + '문항';
      // pass 0 = 연습용 세트(부록 A 통과 기준에 드릴이 없는 노드)
      out.push(dp > 0 ? what + ' 중 ' + dp + '개 이상' + (d.tol ? '(콤보 수 ±' + d.tol + ' 허용)' : '') : what + ' 풀어 보기(연습, 통과 조건 아님)');
    }
    var m = nd.mission;
    if (m) {
      out.push((m.config === 'sixmax-cast-hidden' ? '6인 실전(유형 숨김) ' : '6인 실전 ') + m.hands + '핸드' +
        (m.approx ? '(체험, 참고 기준)' : '') + (m.coach != null ? ', 코칭 L' + m.coach + (COACH_NAME[m.coach] ? '(' + COACH_NAME[m.coach] + ')' : '') : ''));
      (m.conditions || []).forEach(function(c) {
        if (c && c.kind === 'hands' && _num(c.min, 0) <= _num(m.hands, 0)) return;   // 위 핸드 수 줄과 같은 말
        var t = _condText(c, m); if (t) out.push(t);
      });
    }
    return out;
  }
  function _arr(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
  function _list(v, map) { return _arr(v).map(function(x) { return (map && map[x]) || x; }).join(', '); }
  function _pctTxt(x) { return String(Math.round(_num(x, 0) * 1000) / 10); }   // 0.7 → 70, 0.03 → 3
  function _filterTxt(f) {
    f = f || {};
    var parts = [];
    if (f.street) parts.push(_list(f.street, STREET_LABEL));
    if (f.pos) parts.push(_list(f.pos));
    if (f.potType === '3bet') parts.push('3벳 팟');
    if (f.multiway) parts.push('3명 이상 팟');
    if (f.oop) parts.push('포지션 불리(OOP)');
    if (f.marginal) parts.push('애매한 스팟');
    if (f.concept) parts.push(_list(f.concept, CONCEPT_LABEL));
    if (f.source) parts.push(_list(f.source, SOURCE_LABEL) + ' 판정');
    return parts.join(', ');
  }
  function _patternLabel(k) {
    var C = _m('Coach'), P = C && C.PATTERNS && C.PATTERNS[k];
    return (P && P.label) || PATTERN_FALLBACK[k] || k;
  }
  // 조건 DSL 1개 → 통과 기준 문장(비율 min/max, 개수 maxCount, 판정 창 window/minOpp, per, ref 의미 그대로)
  function _condText(c, m) {
    if (!c || !c.kind) return '';
    if (c.kind === 'light') {
      var lights = _arr(c.light && c.light.length ? c.light : ['green']).map(function(l) { return LIGHT_LABEL[l] || l; }).join(' 또는 ');
      var ft = _filterTxt(c.filter), per = c.per === 'concept';
      var head = (ft ? ft + ' ' : '') + '결정' + (per ? ' 유형마다 ' : '에서 ');
      var thr;
      if (c.maxCount != null) thr = lights + ' ' + _num(c.maxCount, 0) + '번' + (_num(c.maxCount, 0) > 0 ? ' 이하' : '');
      else if (c.max != null) thr = lights + ' ' + _pctTxt(c.max) + '% 이하';
      else thr = lights + ' ' + _pctTxt(c.min) + '% 이상';
      var win = [];
      if (c.window) win.push('최근 ' + c.window + '결정');
      if (c.minOpp != null) {
        if (c.maxCount != null && !c.window) win.push('최근 기회 ' + c.minOpp + '번');
        else win.push((per ? '유형별 ' : '') + '기회 ' + c.minOpp + '번부터 판정');
      }
      return head + thr + (win.length ? '(' + win.join(', ') + ')' : '') + (c.ref ? ', 참고 표시(통과 조건 아님)' : '');
    }
    if (c.kind === 'pattern') {
      var where = c.window ? '최근 ' + c.window + '핸드' : (c.minOpp ? '최근 기회 ' + c.minOpp + '번' : '최근 30핸드');
      var pos = (c.filter && c.filter.pos) ? '(' + _list(c.filter.pos) + ')' : '';
      var mx = _num(c.max, 0);
      return where + pos + '에서 "' + _patternLabel(c.pattern) + '" ' + mx + '회' + (mx > 0 ? ' 이하' : '');
    }
    if (c.kind === 'hands') return _num(c.min, 0) + '핸드 체험';
    if (c.kind === 'drillSet' || c.kind === 'puzzleSet') {
      return _arr(c.type).map(_typeName).join(', ') + ' ' + c.count + '문항 중 ' + c.pass + '개 이상' + (c.tol ? '(콤보 수 ±' + c.tol + ' 허용)' : '');
    }
    if (c.kind === 'band') {
      return '내 ' + (METRIC_LABEL[c.metric] || c.metric) + ' 수치가 이 앱 차트 밴드 ±' + _num(c.tol, 4) + '%p 안' +
        (c.minOpp != null ? '(기회 ' + c.minOpp + '번부터 판정)' : '');
    }
    if (c.kind === 'identify') {
      var seats = _num(c.seats, 5), need = _num(c.min, seats);
      // 조기 제출(mission.earlySubmit, s6-boss)은 좌석마다 30핸드부터(journey/boss.js EARLY_HANDS). 시트에도 적어 100핸드 x 5좌석만 보이지 않게(M6 통합 검증)
      return '숨은 좌석 ' + seats + '곳' + (need < seats ? ' 중 ' + need + '곳' : '') + '의 유형 맞히기(관찰 ' + _num(c.minHands, 100) + '핸드 뒤' +
        (m && m.earlySubmit ? ', 확신이 서면 30핸드부터 조기 제출' : '') + ')';
    }
    if (c.kind === 'weeks') return _num(c.min, 1) > 1 ? '주간 복기 ' + c.min + '주 연속' : '주간 복기 1번';
    if (c.kind === 'overlap') return '레인지 색칠 ' + _num(c.spots, 3) + '스팟 겹침 ' + _pctTxt(c.min) + '% 이상';
    if (c.kind === 'custom') {
      if (c.fn === 'srsBoxRatio') return '오픈 레인지 복습 카드의 ' + _pctTxt(c.min) + '% 이상을 ' + _num(c.box, 3) + '단계 이상으로 익히기';
      if (c.fn === 'luckMeterViews') return '운 미터 카드 ' + _num(c.min, 1) + '번 열어 보기';
      if (c.fn === 'shortSession') return '세션 종료 버튼으로 ' + _num(c.maxHands, 5) + '핸드 안에 끝낸 세션 ' + _num(c.min, 1) + '번';
    }
    return '추가 조건 1개';
  }
  function _rollLines(nd, s) {
    var B = _m('Boss');
    if (!B || typeof B.evaluate !== 'function') return [];
    var r = _call('Boss', 'evaluate', nd, _m('JStats'), s);
    if (!r || !Array.isArray(r.items)) return [];
    return r.items.map(function(it) {
      if (it.need == null) return '';
      var label = it.label || _condText(it) || it.kind;
      // 판정 전(F3 wait: 판정 창 안 핸드 0개 또는 기회 0). ok, pass 의미는 그대로이고 표시만 '⏳ 판정 전(기준 ...)'
      if (it.wait) return '⏳ ' + label + ': ' + (it.have == null ? '판정 전' : it.have) + '(기준 ' + it.need + (it.opp != null ? ', 기회 ' + it.opp : '') + ')';
      return (it.ok ? '✓ ' : '○ ') + label + ': ' + (it.have == null ? '-' : it.have) + '/' + it.need + (it.opp != null ? '(기회 ' + it.opp + ')' : '');
    }).filter(Boolean);
  }
  function _lessonSum(nd) {
    var L = _m('LESSONS');
    if (!Array.isArray(L) || !nd.lesson) return '';
    for (var i = 0; i < L.length; i++) {
      if (L[i] && (L[i].id === nd.lesson || L[i].node === nd.id)) {
        var sc = (L[i].scenes || []).filter(function(x) { return x && x.t === 'sum'; })[0];
        return sc ? (sc.text || '') : '';
      }
    }
    return '';
  }

  // 시트 버튼: 가능하면 실행, 이번 버전에 없는 기능은 이유와 함께 비활성
  function _actsHTML(nd, st, rec, s) {
    if (st === 'locked' && nd.kind !== 'boss') return '<div class="j-acts"><div class="j-why">🔒 먼저 위 노드를 통과하면 열려요</div></div>';
    var btns = [];
    var passed = st === 'passed';
    if (nd.kind === 'boss') {
      var canBoss = _can('Boss', 'start');
      btns.push(_actBtn(canBoss, 'boss', nd.id, '👑 승급 시험 도전', canBoss ? '' : '승급 시험은 다음 업데이트에서 열려요'));
      if (!(s.placement || {}).done && summary(s).nodesPassed === 0) {
        btns.push('<button type="button" class="j-btn j-act" onclick="JourneyUI.closeSheet({silent:true});JourneyUI.view(\'placement\')">📝 실력 확인 3분으로 건너뛰기</button>');
      }
      return '<div class="j-acts">' + btns.join('') + '</div>';
    }
    if (nd.lesson) {
      var lp = _lessonPath(nd);
      btns.push(_actBtn(!!lp, 'lesson', nd.id, (passed || (rec.lesson && rec.lesson.done) ? '📖 다시 보기' : (rec.lesson && rec.lesson.scene ? '📖 레슨 이어 보기' : '📖 레슨 시작')) +
        (lp && lp.kind === 'curriculum' ? '(커리큘럼 ' + lp.session + ')' : ''), lp ? '' : '레슨은 다음 업데이트에서 열려요'));
    }
    if (nd.drill) {
      var dp = _drillPath(nd);
      // (POLISH VIS-02 위계) 레슨이 있는 노드에서는 레슨 시작만 주 버튼. 드릴은 보조(레슨 없는 노드면 드릴이 주 버튼)
      btns.push(_actBtn(!!dp, 'drill', nd.id, passed ? '⚡ 같은 유형 퍼즐' : '⚡ 드릴 ' + _drillCount(nd.drill) + '문항', dp ? '' : _typeName(nd.drill.type) + ' 퍼즐은 다음 업데이트에서 열려요', !nd.lesson));
    }
    if (nd.mission && !passed) {
      var canM = _can('App', 'selectVillains') && _can('Journey', 'startSession');
      // (M7 통합 검증) 레슨은 끝났지만(예전 커리큘럼 기록 이전 등) 앞 노드를 아직 통과하지 않은 노드는 실전 핸드가 미션에 쌓이지 않는다
      // (Journey.onHandEnd는 가용 노드에만 센다). 60핸드를 쳐도 '실전 0/50핸드'로 남던 것을 버튼 단계에서 막고 이유를 보인다
      var openIds = _call('Journey', 'openNodes'), availM = !Array.isArray(openIds) || openIds.indexOf(nd.id) >= 0;
      btns.push(_actBtn(canM && availM, 'mission', nd.id, '🃏 실전 시작(5핸드씩)', !canM ? '실전 미션은 곧 열려요' : (availM ? '' : '먼저 위 노드를 통과하면 실전 핸드가 쌓여요')));
    }
    return '<div class="j-acts">' + btns.join('') + '</div>';
  }
  // primary(기본 true): 누를 수 있을 때 주 버튼(초록 금테)으로 그릴지. false면 누를 수 있어도 보조 버튼
  function _actBtn(ok, what, id, label, why, primary) {
    return '<button type="button" class="j-btn j-act' + (ok && primary !== false ? ' j-primary' : '') + '"' + (ok ? ' onclick="JourneyUI._act(\'' + what + '\',\'' + _esc(id) + '\')"' : ' disabled aria-disabled="true"') + '>' + label + '</button>' +
      (!ok && why ? '<div class="j-why">' + _esc(why) + '</div>' : '');
  }
  // 레슨 경로: M3 레슨 플레이어 > M1 커리큘럼 세션 페이지(absorbs, CURRICULUM_MAP 역매핑)
  function _lessonPath(nd) {
    var L = _m('LESSONS');
    if (_can('LessonPlayer', 'start') && Array.isArray(L) && L.some(function(l) { return l && (l.id === nd.lesson || l.node === nd.id); })) return { kind: 'lesson' };
    var n = curriculumFor(nd.id);
    if (n && _can('Session', 'load')) return { kind: 'curriculum', session: n };
    return null;
  }
  function curriculumFor(id) {
    var map = _m('CURRICULUM_MAP');
    if (map) {
      var keys = Object.keys(map).map(Number).sort(function(a, b) { return a - b; });
      for (var i = 0; i < keys.length; i++) if ((map[keys[i]] || []).indexOf(id) >= 0) return keys[i];
    }
    var nd = node(id);
    return (nd && Array.isArray(nd.absorbs) && nd.absorbs.length) ? nd.absorbs[0] : null;
  }
  // 드릴 경로(5.8절 2번): 여정 드릴은 PuzzleUI가 맡고 Drills.record/due를 공유한다. PuzzleUI가 없거나 can이 false면 기존 DrillUI.
  // 아직 생성기가 없는 유형(rangepaint, toygame, hudread, prescribe, intent 등)은 can이 false라 null → nextDoable이 다음 노드로 안내.
  function _drillPath(nd) {
    var t = nd && nd.drill && nd.drill.type;
    if (!t) return null;
    if (_puzzleCan(puzzleSpec(nd))) return { kind: 'puzzle' };
    if (t !== 'mixed' && _can('DrillUI', 'start') && _can('Drills', 'get') && _call('Drills', 'get', t)) return { kind: 'drill' };
    return null;
  }
  // 노드 드릴 → PuzzleUI.start/can 명세(C5): {type, count, set?, variant?, spots?, tol?, overlap?, node}
  function puzzleSpec(nd, count) {
    var d = nd && nd.drill;
    if (!d || !d.type) return null;
    var s = { type: d.type, count: _num(count, 0) > 0 ? Math.floor(count) : _drillCount(d), node: nd.id };
    if (Array.isArray(d.set)) s.set = d.set.map(function(x) { return Array.isArray(x) ? x.slice() : x; });
    if (d.variant) s.variant = d.variant;
    if (Array.isArray(d.spots)) s.spots = d.spots.slice();
    if (d.tol != null) s.tol = d.tol;
    if (d.overlap != null) s.overlap = d.overlap;
    return s;
  }
  function _puzzleCan(spec) {
    if (!spec || !_can('PuzzleUI', 'start') || !_can('PuzzleUI', 'can')) return false;
    return !!_call('PuzzleUI', 'can', spec);
  }
  function missionConfig(nd) {
    var cfg = (nd && nd.mission && nd.mission.config) || 'sixmax';
    var cast = _m('CAST');
    if (cfg.indexOf('sixmax-cast') === 0 && !(Array.isArray(cast) && cast.length >= 5)) cfg = 'sixmax'; // 캐스트(M4) 전에는 기존 6인
    return cfg;
  }

  function _act(what, id) {
    var nd = node(id);
    if (!nd) return;
    closeSheet({ silent: true });
    var now = _now();
    if (what === 'lesson') {
      var lp = _lessonPath(nd);
      if (!lp) return;
      if (lp.kind === 'lesson') {
        var rec = _nodeRec(state(), id) || {};
        _call('LessonPlayer', 'start', nd.lesson, _num(rec.lesson && rec.lesson.scene, 0), function() { _afterNode(id); });
        return;
      }
      _setPending({ kind: 'lesson', node: id, session: lp.session, startedAt: now, wasDone: !!((_nodeRec(state(), id) || {}).lesson || {}).done });
      _call('Session', 'load', lp.session);
      _call('App', 'showScreen', 'screen-curriculum');
      return;
    }
    if (what === 'drill') {
      var dp = _drillPath(nd);
      if (!dp) return;
      var t = nd.drill.type, cnt = _drillCount(nd.drill);
      if (dp.kind === 'puzzle') {
        var spec = puzzleSpec(nd), fired = false;
        spec.title = nd.title;
        spec.onDone = function(r) { if (fired) return; fired = true; _onNodePuzzleDone(id, r); };
        try { _m('PuzzleUI').start(spec); return; }
        catch (e) { _warn('PuzzleUI.start', e); }
        if (fired) return;
        // 퍼즐 화면을 열지 못함: 기존 드릴이 있는 유형이면 DrillUI로, 없으면 시트로 돌아가 안내
        if (!(t !== 'mixed' && _can('DrillUI', 'start') && _call('Drills', 'get', t))) { toast('퍼즐을 열지 못했어요. 잠시 뒤 다시 해 주세요'); openNode(id); return; }
      }
      _setPending({ kind: 'drill', node: id, type: t, count: cnt, startedAt: now, before: _drillStats(t) });
      _call('DrillUI', 'start', t, { count: cnt, spots: nd.drill.spots, dueFirst: false });
      return;
    }
    if (what === 'mission') {
      _setPending({ kind: 'mission', node: id, startedAt: now });
      _call('Journey', 'startSession', { kind: 'mission', node: id, chunk: 5 });
      _call('App', 'selectVillains', missionConfig(nd));
      return;
    }
    if (what === 'boss') { _call('Boss', 'start', id, now); return; }
  }
  function _drillStats(t) { var st = _call('Drills', 'stats', t) || {}; return { n: _num(st.n, 0), ok: _num(st.ok, 0) }; }
  // 노드 시트에서 연 퍼즐 세트가 끝남(C5 r = {n, ok, xp, rated, ratingDelta}): 노드 드릴 기록과 통과 판정만.
  // Drills.record, JStats, Rating, XP는 PuzzleUI가 이미 처리했으므로 여기서 XP를 다시 주지 않는다.
  function _onNodePuzzleDone(id, r) {
    var n = Math.max(0, Math.floor(_num(r && r.n, 0))), ok = Math.max(0, Math.min(n, Math.floor(_num(r && r.ok, 0))));
    _closeNavView('puzzle');
    if (n > 0) {
      _call('Journey', 'recordDrillSet', id, { n: n, ok: ok }, _now());
      var rd = _num(r && r.ratingDelta, 0);
      toast('드릴 ' + n + '문항 중 ' + ok + '개 정답' + (Math.round(rd) ? ', 레이팅 ' + (rd > 0 ? '+' : '') + Math.round(rd) : '') + _drillPassHint(id), 3200);
    }
    _afterNode(id);
  }
  // 세트 직후 토스트에 붙일 통과 안내: 드릴 기준 미달이면 기준 개수, 드릴은 됐지만 레슨이 남았으면 그 안내(통과면 빈 문자열)
  function _drillPassHint(id) {
    if (status(id) === 'passed' || !_can('Journey', 'evaluateNode')) return '';
    var ev = _call('Journey', 'evaluateNode', id);
    if (!ev || ev.pass || !ev.need) return '';
    var rq = ev.req || {};
    if (ev.need.drill && !ev.drill && rq.drillPass) return '. 드릴 통과는 ' + rq.drillCount + '문항 중 ' + rq.drillPass + '개 이상이에요';
    if (ev.need.drill && ev.drill && ev.need.lesson && !ev.lesson) return '. 드릴 기준은 채웠어요, 레슨을 끝까지 보면 통과';
    return '';
  }
  // 퍼즐 화면이 남긴 해시 기록(#j/puzzle 등)이 맨 위면 조용히 걷어낸다(없으면 아무 일 없음)
  function _closeNavView(name) { if (_can('Nav', 'closeView')) _call('Nav', 'closeView', name); }

  // 노드 진행 기록 뒤 통과 판정(이미 통과면 생략), 결과 토스트
  function checkPass(id) {
    // Journey는 레슨, 드릴, 미션 기록 때 기준을 채우면 스스로 통과시킨다(lastPass). 그 통과도 한 번 알려 준다.
    var lp = _call('Journey', 'lastPass');
    if (lp && lp.id === id && lp.at !== _passToastAt) { _passToastAt = lp.at; _passToast(id, lp); return lp; }
    if (!_can('Journey', 'evaluateNode') || !_can('Journey', 'passNode')) return null;
    if (status(id) === 'passed') return null;
    var ev = _call('Journey', 'evaluateNode', id);
    if (!ev || !ev.pass) return null;
    var r = _call('Journey', 'passNode', id, { skipped: false }, _now()) || {};
    _passToast(id, r);
    return r;
  }
  function _passToast(id, r) {
    var nd = node(id);
    var msg = '★ 통과! ' + (nd ? nd.title : id) + ((r.opened && r.opened.length) ? ', 새 노드 ' + r.opened.length + '개 열림' : '');
    if (r.promoted) msg = '🎉 승급! ' + _stageInfo(r.promoted).title + ' 단계 시작';
    toast(msg, 3000);
  }
  function _afterNode(id) { checkPass(id); open(); openNode(id); }

  // 노드 시트에서 시작한 외부 화면에서 돌아올 때 결과 반영
  function _finishNodePending(p) {
    var now = _now();
    if (p.kind === 'lesson') {
      _call('Journey', 'completeLesson', p.node, 0, true, now);   // 첫 완료 레슨 XP는 Journey가 준다(중복 지급 금지)
    } else if (p.kind === 'drill') {
      var a = _drillStats(p.type), n = a.n - p.before.n, ok = a.ok - p.before.ok;
      if (n > 0) {
        _call('Journey', 'recordDrillSet', p.node, { n: n, ok: ok }, now);
        _xp('review', ok * _xpConst('review', 2));
        toast('드릴 ' + n + '문항 중 ' + ok + '개 정답', 2400);
      }
    } else if (p.kind === 'mission') {
      if (_can('Journey', 'endSession')) _call('Journey', 'endSession');
    }
    checkPass(p.node);
  }
  function _xpConst(k, d) { var X = _m('JOURNEY_XP'); return X && isFinite(X[k]) ? X[k] : d; }
  function _xp(src, amount) {
    if (!(amount > 0)) return null;
    var r = _call('Journey', 'addXp', src, amount, _now());
    if (r && r.leveledUp) toast('⭐ 레벨 업! L' + r.level, 2600);
    if (r && r.unlocked && r.unlocked.length) toast('새 외형이 열렸어요: ' + r.unlocked.map(_unlockName).join(', '), 3000);
    return r;
  }
  function _unlockName(u) {
    var p = String(u).split(':');
    var k = { tableColor: '테이블 색', cardBack: '카드 뒷면', castFrame: '캐스트 테두리', cardBorder: '명장면 카드 테두리' }[p[0]] || p[0];
    var nm = p[1] || '';
    // 외형 이름은 Badges.looks의 한국어 이름(남색, 다이아 무늬 등)으로. 없으면 id 그대로(M6 통합 검증)
    var L = _call('Badges', 'looks');
    if (L && Array.isArray(L.kinds)) L.kinds.forEach(function(x) {
      if (x && x.kind === p[0] && Array.isArray(x.options)) x.options.forEach(function(o) { if (o && o.id === nm && o.name) nm = o.name; });
    });
    return k + (nm ? ' ' + nm : '');
  }

  // ── 열기, 복귀 ─────────────────────────────────────────
  function open() {
    if (!_mount()) return;
    closeSheet({ silent: true });
    if (hasPending()) { resume(); return; }                       // 외부 블록에서 돌아온 경우 결과부터 반영
    if (_can('TodayUI', 'leave')) _call('TodayUI', 'leave');   // 홈에 오면 오늘의 5분 "진행 중" 해제(남은 블록은 저장됨)
    _showScreen();
    render();
    _scrollTop();
  }

  // TodayUI 등 다른 모듈이 .j-view에 화면을 그릴 때(시트 닫기, 여정 화면 표시, 현재 뷰 이름 기록)
  function mountView(name, html) {
    var v = _mount();
    if (!v) return null;
    closeSheet({ silent: true });
    _showScreen();
    _cur = name || 'custom';
    if (html != null) v.innerHTML = html;
    _scrollTop();
    return v;
  }

  // App.showMenu 분기(M1-P2)와 주입한 "계속" 버튼이 부른다: 진행 중 블록 또는 노드 시트로 복귀
  function resume() {
    if (_resuming) return;
    _resuming = true;
    try {
      _cleanupContinue();
      if (_can('TodayUI', 'hasPending') && _call('TodayUI', 'hasPending')) { _showScreen(); _call('TodayUI', 'resume'); return; }
      if (_pending) {
        var p = _pending; _setPending(null);
        _showScreen(); render(); _finishNodePending(p);
        render(); openNode(p.node); return;
      }
      var ses = _call('Journey', 'session');
      if (ses) {
        if (_can('Journey', 'endSession')) _call('Journey', 'endSession');
        _showScreen(); render();
        if (ses.node) { checkPass(ses.node); render(); openNode(ses.node); }
        return;
      }
      if (_can('TodayUI', 'running') && _call('TodayUI', 'running')) { _showScreen(); _call('TodayUI', 'show'); return; }
      _showScreen(); render(); _scrollTop();
    } finally { _resuming = false; }
  }

  // ── 외부 화면 복귀 감시: "계속" 버튼 주입 + 여정 화면이 다시 보이면 자동 복귀 ──────────
  function _setPending(p) { _pending = p; watchReturn(!!p); }
  function _setOrigin() { _origin = true; watchReturn(true); }
  // 노드에 묶인 실전 세션(보스, 커리큘럼 '이 주제로 실습'의 미션)도 복귀 대상이다. 세션 요약에 "여정으로 돌아가기"를 붙인다
  function _nodeSession() { var ses = _call('Journey', 'session'); return !!(ses && ses.node); }
  function hasPending() { return !!_pending || !!(_can('TodayUI', 'hasPending') && _call('TodayUI', 'hasPending')) || _nodeSession(); }
  function watchReturn(on) {
    if (typeof MutationObserver === 'undefined' || !_hasDom() || !document.body) return;
    if (!on && (_origin || hasPending())) on = true;   // 아직 감시할 대상이 남아 있으면 유지
    if (!on) { if (_obs) { _obs.disconnect(); _obs = null; } return; }
    if (_obs) return;
    _obs = new MutationObserver(function() {
      if (_obsQueued) return;
      _obsQueued = true;
      Promise.resolve().then(function() { _obsQueued = false; _onMutate(); });
    });
    _obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
  }
  function _onMutate() {
    var pend = hasPending();
    var scr = document.querySelector('.screen.active');
    var id = scr ? scr.id : '';
    _syncSummaryBtn(pend);
    if (!pend) {
      _cleanupContinue();
      if (_origin && (id === 'screen-menu' || id === 'screen-journey')) {
        _origin = false;
        _syncSummaryBtn(pend);
        if (id === 'screen-menu') open();
      }
      if (!_origin) watchReturn(false);
      return;
    }
    // 여정 화면 또는 기존 메뉴에 도착하면 진행 중이던 노드/블록 결과를 반영하며 여정으로 복귀한다.
    // (노드 시트에서 연 드릴 결과의 "메뉴", 커리큘럼 "메뉴로"는 App.showMenu → 메뉴 화면이라 여기서 받아야 결과가 남는다)
    if (id === 'screen-journey' || id === 'screen-menu') {
      var pi = _call('TodayUI', 'pendingInfo');
      if (id === 'screen-journey' && pi && pi.inJourney) return;   // 배치 고사처럼 여정 화면 안에서 도는 블록은 자동 복귀하지 않음
      if (!_resuming) resume();
      return;
    }
    var label = (_can('TodayUI', 'hasPending') && _call('TodayUI', 'hasPending')) ? '▶ 오늘의 5분 계속' : '↩ 여정으로 돌아가기';
    if (id === 'screen-drill') {
      var res = _el('drill-result'), hub = _el('drill-hub');
      if (res && res.style.display !== 'none') _inject(res.querySelector('.res-btns') || res, label, true);
      else if (hub && hub.style.display !== 'none') _inject(hub, label, false);
    } else if (id === 'screen-curriculum') {
      _inject(_el('session-actions'), label, true);
    } else if (id === 'screen-session-summary') {
      var box = scr.firstElementChild;
      var mb = box && box.querySelector(':scope > .menu-btn:not(.j-continue)');
      if (box && !box.querySelector('.j-continue')) {
        var b = _contBtn(label);
        if (mb) box.insertBefore(b, mb); else box.appendChild(b);
      }
    }
  }
  // (M6-P0, 계약 H11 d, 로드맵 결정 15) 여정 홈 빠른 줄에서 연 자유 게임(_origin, 대기 블록 없음)의 세션 요약 정적 버튼
  // '↩ 메뉴로'는 실제로 여정 홈으로 가므로 글자를 '↩ 여정 홈으로'로, 다른 진입에서는 원래 글자로 되돌린다(동작은 그대로 App.showMenu).
  // summaryButton(btn, home)은 글자만 바꾸는 순수에 가까운 함수(테스트용 공개): 원래 글자는 data-j-orig에 두고 같은 상태면 건드리지 않는다.
  function summaryButton(btn, home) {
    if (!btn) return false;
    var cur = String(btn.textContent == null ? '' : btn.textContent);
    var orig = btn.getAttribute ? btn.getAttribute('data-j-orig') : null;
    if (home) {
      if (cur !== SUMMARY_HOME) {
        if (btn.setAttribute) btn.setAttribute('data-j-orig', cur);
        btn.textContent = SUMMARY_HOME;
      }
      return true;
    }
    if (orig != null) {
      if (cur === SUMMARY_HOME) btn.textContent = orig;
      if (btn.removeAttribute) btn.removeAttribute('data-j-orig');
    }
    return false;
  }
  function _summaryStaticBtn() {
    var scr = _el('screen-session-summary');
    var box = scr && scr.firstElementChild;
    return (box && typeof box.querySelector === 'function') ? box.querySelector(':scope > .menu-btn:not(.j-continue)') : null;
  }
  function _syncSummaryBtn(pend) {
    if (!_hasDom()) return;
    try { summaryButton(_summaryStaticBtn(), _origin && !(pend === undefined ? hasPending() : pend)); }
    catch (e) { _warn('summaryButton', e); }
  }
  function _contBtn(label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-btn j-continue';
    b.textContent = label;
    b.onclick = function() { resume(); };
    return b;
  }
  function _inject(box, label, first) {
    if (!box || box.querySelector('.j-continue')) return;
    var b = _contBtn(label);
    if (first && box.firstChild) box.insertBefore(b, box.firstChild); else box.appendChild(b);
  }
  function _cleanupContinue() {
    if (!_hasDom() || !document.querySelectorAll) return;
    var list = document.querySelectorAll('.j-continue');
    for (var i = 0; i < list.length; i++) if (list[i].parentNode) list[i].parentNode.removeChild(list[i]);
  }

  // ── 서브뷰 라우팅 ──────────────────────────────────────
  // 라우팅 판정(순수): 'home' | 'node' | 'today' | 'view'(views/* 위임 또는 준비 중 카드)
  function viewRoute(name) {
    if (!name || name === 'home' || TRANSIENT_VIEWS[name]) return 'home';
    if (name === 'node' || name === 'today') return name;
    return 'view';
  }
  function view(name, params) {
    if (name === 'theater' && _call('TheaterUI', 'active') === true) return;   // 극장 화면은 TheaterUI가 관리(계약 T8)
    var route = viewRoute(name);
    if (route === 'home') { open(); return; }   // 퍼즐 세트, 러시, 데일리 5 해시는 진행 상태가 없으니 홈(진행 중 블록이면 그 블록)으로
    if (route === 'node') { if (!_screenActive()) _showScreen(); if (_cur !== 'home') render(); openNode(params, { fromNav: true }); return; }
    if (route === 'today') { _showScreen(); if (_can('TodayUI', 'show')) _call('TodayUI', 'show'); else render(); return; }
    _showScreen();
    var v = _mount();
    if (!v) return;
    closeSheet({ silent: true });
    var gname = VIEWS[name], V = gname ? _m(gname) : null;
    _navView(name, params == null ? '' : params);
    _cur = name;
    _scrollTop();
    try {
      if (V && typeof V.open === 'function') { V.open(params, v); return; }
      if (V && typeof V.render === 'function') { v.innerHTML = ''; V.render(v, params); return; }
    } catch (e) { if (typeof console !== 'undefined') console.error('[JourneyUI] 뷰 ' + name + ' 실패', e); }
    v.innerHTML = _soonHTML(name);
  }
  // 준비 중 카드를 직접 띄운다(빠른 줄의 퍼즐 러시처럼 모듈이 아직 없을 때)
  function _soonView(name) {
    _showScreen();
    var v = _mount();
    if (!v) return;
    closeSheet({ silent: true });
    _navView(name, '');
    _cur = name;
    _scrollTop();
    v.innerHTML = _soonHTML(name);
  }
  function _soonHTML(name) {
    return '<div class="j-sub"><div class="j-sub-top"><button type="button" class="j-back" aria-label="여정 홈으로" onclick="JourneyUI.back()">↩</button>' +
      '<h2 class="j-sub-t">' + _esc(VIEW_TITLE[name] || name) + '</h2></div>' +
      '<div class="j-card"><div class="j-card-t">🚧 준비 중</div><div class="j-card-d">이 화면은 다음 업데이트에서 열려요. 지금은 오늘의 5분과 드릴, 게임으로 연습해요.</div>' +
      '<div class="j-card-acts"><button type="button" class="j-btn j-primary" onclick="JourneyUI.back()">여정 홈으로</button></div></div></div>';
  }
  // 서브뷰의 ↩: 홈을 그리고, 해시가 서브뷰면 히스토리도 한 칸 되돌린다
  function back() {
    var h = (typeof location !== 'undefined') ? String(location.hash || '') : '';
    open();
    if (h.indexOf('#j/') === 0 && _can('Nav', 'back')) _call('Nav', 'back');
  }

  // ── 토스트 ────────────────────────────────────────────
  function toast(msg, ms) {
    if (!_hasDom() || !document.body) return;
    var t = _el('journey-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'journey-toast';
      t.className = 'j-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('is-on');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function() { t.classList.remove('is-on'); }, ms || 2200);
  }

  // ── 초기화 ────────────────────────────────────────────
  function _onKey(e) {
    if (!_screenActive()) return;
    if (e.key === 'Escape' && _sheetId) { e.preventDefault(); closeSheet(); }
  }
  function init() {
    if (_inited || !_hasDom()) return;
    if (!_root()) return;          // test.html 등 여정 화면이 없는 페이지
    _inited = true;
    var s = state();               // Journey.load: 첫 실행이면 defaults + migrate 1회
    if (_can('A11y', 'apply')) _call('A11y', 'apply', _readSettings());
    if (_can('Nav', 'init')) _call('Nav', 'init');
    if (!_keysBound && typeof window !== 'undefined' && window.addEventListener) { window.addEventListener('keydown', _onKey); _keysBound = true; }
    render();
    if (!s) return;
    var go = _call('Nav', 'startParam');
    if (go === 'today') { if (_can('TodayUI', 'start')) _call('TodayUI', 'start'); }
    else if (go === 'rush') quick('rush');
    else if (go === 'game') quick('game');
  }
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('load', init);
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', _onVisible);
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('pageshow', _onVisible);

  var api = {
    init: init, open: open, resume: resume, render: render, renderMap: renderMap, openNode: openNode, closeSheet: closeSheet,
    view: view, back: back, toast: toast, firstCard: firstCard, settingsCard: settingsCard, quick: quick, viewEl: viewEl, mountView: mountView,
    typeName: _typeName, esc: _esc, clean: _clean,
    // 순수에 가까운 판정(노드 테스트, 다른 패키지용)
    state: state, save: save, summary: summary, status: status, node: node, needFirstCard: needFirstCard, needSettingsCard: needSettingsCard,
    curriculumFor: curriculumFor, missionConfig: missionConfig, checkPass: checkPass, hasPending: hasPending, watchReturn: watchReturn,
    canDo: canDo, nextDoable: nextDoable,
    xp: _xp, dayKey: _dayKey, needsRefresh: needsRefresh, _onVisible: _onVisible,
    // M2-P7 연결(순수 문자열과 판정: 테스트, 하네스, 다른 패키지용)
    homeHTML: homeHTML, ratingChip: ratingChip, gearButton: gearButton, daily5Card: daily5Card,
    puzzleSpec: puzzleSpec, viewRoute: viewRoute,
    // M4-P8 연결(오늘의 명장면 카드 문자열)
    highlightCard: highlightCard,
    // M5-WEEKLY 연결(주간 리포트 카드 문자열, 노드 시트 롤링 줄)
    weeklyCard: weeklyCard, rollLines: _rollLines,
    // M6-P0 훅(계약 H11): 카드 공급자, 노드 시트 문자열(Boss.sheetActions 포함), 세션 요약 정적 버튼 글자
    providerCards: providerCards, sheetHTML: _sheetHTML, summaryButton: summaryButton, CARD_PROVIDERS: CARD_PROVIDERS.slice(),
    // 인라인 onclick 핸들러
    _todayTap: _todayTap, _first: _first, _toggleStage: _toggleStage, _act: _act,
    _setGoal: _setGoal, _pickHabit: _pickHabit, _toggleSet: _toggleSet, _saveSettings: _saveSettings,
    _ratingTap: _ratingTap, _daily5: _daily5, _highlight: _highlight
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
