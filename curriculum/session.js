// curriculum/session.js (M3-P3: 교정 커리큘럼 화면, 세션 완료의 여정 반영, practice(n) 라우팅, describeRange)
// 로드 시 DOM, window 접근 없음. 다른 모듈(Gto, Coach, Journey, JourneyUI, PuzzleUI, Storage, App)은 호출 때 typeof 가드.
//   load(n) → bool       화면 3칸(session-nav, session-content, session-actions)에 html(n)을 그린다
//   html(n) → {nav, content, actions} | null   문자열만 만든다(DOM 접근 없음, 테스트용)
//   open(n)              load + 커리큘럼 화면 전환
//   startQuiz(n)         확인 문제(Quiz.startForSession). 끝나면 Quiz가 complete(n)을 부른다
//   complete(n, now) → {session, newly, nodes[]}   진도(poker_progress) 기록 + CURRICULUM_MAP 학습 노드 레슨 완료
//     (Journey.completeLesson(node, 0, true), 보스와 레슨 없는 노드는 건너뜀, 이미 완료면 생략)
//   markRead(n)          퀴즈 없는 세션(12, 23, 24)의 완료 버튼
//   mixedDrill(n)        세션 12: 노드 s3-11 드릴(프리플랍 20문항)을 PuzzleUI 세트로. 끝까지 풀면 완료
//                        (여정에서 넘어와 JourneyUI가 복귀를 기다리면 그 결과를 먼저 반영한 뒤 연다)
//   practice(n) → {kind, node, config}   Journey.routePractice(n): 미션이면 startSession + selectVillains, 아니면 GTO 미러
//   describeRange(arr) → '약 N%: 66+, ATs+, ...'   Coach.rangePct 반올림 + 레인지 표기(설계서 8.1절 3번의 생성 함수)
//   exampleFor(n) → 문장 | null   세션 6, 7, 8, 9 예시 문장을 Gto.GTO_RANGES에서 생성
// 설계서는 생성 함수를 Journey.describeRange로 두었지만 journey-core.js가 M3에서 다른 패키지 소유라 여기에 둔다.
var Session = (function() {
  var LAST = 24;
  var RFI_POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];
  var EXAM = { 23: true, 24: true };
  var READ_ONLY = { 12: true, 23: true, 24: true };   // 퀴즈가 없어 다른 완료 경로가 필요한 세션
  var APPROX_NOTE = '참고: 공개 솔버 통념을 근사한 참고값';

  function _fn(o, k) { return !!o && typeof o[k] === 'function'; }
  function _esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function _warn(e) { try { if (typeof console !== 'undefined' && console.warn) console.warn('[Session]', (e && e.message) || e); } catch (x) {} }

  function _list() { return (typeof CURRICULUM !== 'undefined' && Array.isArray(CURRICULUM)) ? CURRICULUM : []; }
  function data(n) {
    n = Number(n);
    var L = _list();
    for (var i = 0; i < L.length; i++) if (L[i] && L[i].session === n) return L[i];
    return null;
  }
  function _map() { return (typeof CURRICULUM_MAP !== 'undefined' && CURRICULUM_MAP) ? CURRICULUM_MAP : {}; }
  function _mapIds(n) { var M = _map(), ids = M[n] || M[String(n)]; return Array.isArray(ids) ? ids : []; }
  function _node(id) {
    if (typeof JOURNEY_NODES === 'undefined' || !Array.isArray(JOURNEY_NODES)) return null;
    for (var i = 0; i < JOURNEY_NODES.length; i++) if (JOURNEY_NODES[i] && JOURNEY_NODES[i].id === id) return JOURNEY_NODES[i];
    return null;
  }
  function _journey() { return (typeof Journey !== 'undefined' && Journey) ? Journey : null; }
  function _jstate() {
    var J = _journey();
    if (!_fn(J, 'load')) return null;
    try { return J.load(); } catch (e) { return null; }
  }
  function _status(id) {
    var J = _journey();
    if (!_fn(J, 'nodeStatus')) return null;
    try { return J.nodeStatus(id); } catch (e) { return null; }
  }
  function _progress() {
    if (typeof Storage === 'undefined' || !_fn(Storage, 'getProgress')) return null;
    try { return Storage.getProgress(); } catch (e) { return null; }
  }
  function isDone(n) {
    var p = _progress();
    return !!(p && Array.isArray(p.completedSessions) && p.completedSessions.indexOf(Number(n)) >= 0);
  }

  // ── 엔진 표에서 만든 문장(세션 6, 7, 8, 9) ─────────────────
  function _G() { return (typeof Gto !== 'undefined' && Gto && Gto.GTO_RANGES) ? Gto.GTO_RANGES : null; }
  function rangePct(arr) {
    if (!Array.isArray(arr) || !arr.length || typeof Coach === 'undefined' || !_fn(Coach, 'rangePct')) return null;
    return Math.round(Coach.rangePct(arr) * 100);
  }
  function describeRange(arr) {
    if (!Array.isArray(arr) || !arr.length) return '';
    var p = rangePct(arr);
    return (p == null ? '' : '약 ' + p + '%: ') + arr.join(', ');
  }
  var GEN = {
    6: function(G) {
      return '이 앱 차트에서 처음 오픈하는 손의 비율: ' +
        RFI_POS.map(function(p) { return p + ' 약 ' + rangePct(G.rfi[p]) + '%'; }).join(', ');
    },
    7: function(G) { return 'UTG 오픈 ' + describeRange(G.rfi.UTG) + '. BTN 오픈 ' + describeRange(G.rfi.BTN); },
    8: function(G) { return 'CO 오픈에 BTN 3벳 ' + describeRange(G.vsRfi.BTN.threebet); },
    9: function(G) {
      var L = G.vsRfiBB_LP, B = G.vsRfi.BB;
      return 'BB 방어 비율(이 앱 차트): BTN 오픈에는 약 ' + rangePct(L.threebet.concat(L.call)) + '%(3벳 약 ' + rangePct(L.threebet) +
        '%, 콜 약 ' + rangePct(L.call) + '%), UTG 오픈에는 약 ' + rangePct(B.threebet.concat(B.call)) + '%';
    }
  };
  function exampleFor(n) {
    var G = _G();
    if (!G || !GEN[n] || rangePct(['AA']) == null) return null;
    try { return GEN[n](G); } catch (e) { _warn(e); return null; }
  }

  // ── 렌더(순수 문자열) ────────────────────────────────────
  function _block(title, body) {
    return '<div class="session-block"><h3>' + title + '</h3>' + body + '</div>';
  }
  function _tableHTML(t) {
    if (!t || !Array.isArray(t.head) || !Array.isArray(t.rows)) return '';
    var cell = 'padding:6px 8px;border-bottom:1px solid var(--hud-border);text-align:center';
    return '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-top:4px">' +
      '<thead><tr>' + t.head.map(function(h) { return '<th style="' + cell + ';color:var(--blue);font-weight:600">' + _esc(h) + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + t.rows.map(function(r) {
        return '<tr>' + r.map(function(c) { return '<td style="' + cell + '">' + _esc(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }
  function _chip(text) {
    return '<div class="session-note" style="margin:0 0 12px;font-size:0.82rem;color:var(--text-dim)">' + _esc(text) + '</div>';
  }
  function _examHTML(n) {
    var ids = _mapIds(n);
    if (!ids.length) return '';
    var rows = ids.map(function(id) {
      var nd = _node(id), st = _status(id);
      // 잠긴 보스도 건너뛰기(점프 테스트)로 바로 도전할 수 있다(설계서 2.2절)
      var mark = st === 'passed' ? '✅ 통과' : (st === 'open' || st === 'done') ? '🔓 도전 가능' : '🔒 잠김(건너뛰기로 바로 도전 가능)';
      return '<li style="margin:4px 0">' + _esc(nd ? nd.title + '(' + nd.goal + ')' : id) + ': ' + mark + '</li>';
    }).join('');
    return _block('승급 시험 안내',
      '<p>이 시험은 여정의 승급 시험으로 바뀌었어요. 여정 홈 지도에서 각 단계 끝의 큰 원을 눌러 도전해요.</p>' +
      '<ul style="margin:8px 0 0 18px;padding:0">' + rows + '</ul>');
  }
  function _practiceLabel(n) {
    var r = _route(n);
    return '🎯 이 주제로 실습 (' + (r.kind === 'mission' ? '6인 5핸드' : 'GTO 미러') + ')';
  }
  function _canMixed(n) {
    var nodeId = _mapIds(n)[0];
    if (!nodeId || typeof PuzzleUI === 'undefined' || !_fn(PuzzleUI, 'start')) return false;
    if (!_fn(PuzzleUI, 'can')) return true;
    try { return !!PuzzleUI.can({ node: nodeId, type: 'preflop' }); } catch (e) { return false; }
  }

  function html(n) {
    n = Number(n);
    var d = data(n);
    if (!d) return null;
    var done = isDone(n);
    var gen = exampleFor(n);
    var nav = '<span>Phase ' + d.phase + '</span> <span style="color:var(--gold)">세션 ' + n + '/' + LAST + '</span> <span>' + d.topic + '</span>' +
      (done ? ' <span style="color:var(--green)">✅ 완료</span>' : '');
    var content = '<div class="session-section">' +
      '<h2 class="session-title">♠ 세션 ' + n + ', ' + d.topic + '</h2>' +
      (d.label === '참고' ? _chip(APPROX_NOTE) : '') +
      _block('핵심', '<p>' + d.summary + '</p>') +
      _block('공식/기준', '<p>' + d.formula + '</p>') +
      _block('실전 예시', '<p>' + (gen || d.example) + '</p>' +
        (gen ? '<div style="margin-top:6px;font-size:0.8rem;color:var(--text-dim)">이 앱 차트 표에서 자동으로 만든 문장(입문용 차트, 표준보다 조금 타이트)</div>' : '')) +
      (d.table ? _block('정확값 표(어림이 아닌 계산값)', _tableHTML(d.table)) : '') +
      (EXAM[n] ? _examHTML(n) : '') +
      (done ? _chip('완료한 세션이에요. 다시 풀어도 기록은 그대로예요') : '') +
      '</div>';
    var btn = function(cls, onclick, label) { return '<button class="menu-btn' + (cls ? ' ' + cls : '') + '" onclick="' + onclick + '">' + label + '</button>'; };
    var acts = [];
    if (d.quiz && d.quiz.length) acts.push(btn('', 'Session.startQuiz(' + n + ')', '📝 확인 문제'));
    if (n === 12 && _canMixed(n)) acts.push(btn('', 'Session.mixedDrill(' + n + ')', '🃏 혼합 드릴 20문항'));
    if (EXAM[n] && typeof JourneyUI !== 'undefined' && _fn(JourneyUI, 'open')) acts.push(btn('', 'Session.toJourney(' + n + ')', '🗺 승급 시험으로'));
    if (READ_ONLY[n] && !done) acts.push(btn('secondary', 'Session.markRead(' + n + ')', EXAM[n] ? '✅ 안내를 읽었어요' : '✅ 다 읽었어요'));
    acts.push(btn('', 'Session.practice(' + n + ')', _practiceLabel(n)));
    if (n < LAST) acts.push(btn('secondary', 'Session.load(' + (n + 1) + ')', '다음 →'));
    acts.push(btn('secondary', 'App.showMenu()', '메뉴로'));
    return { nav: nav, content: content, actions: acts.join('') };
  }

  function _el(id) {
    if (typeof document === 'undefined' || !_fn(document, 'getElementById')) return null;
    return document.getElementById(id);
  }
  function load(n) {
    n = Math.floor(Number(n));
    if (!data(n)) {
      if (!(n > LAST)) return false;
      n = LAST;    // 예전 진도 기록(currentSession 25)은 마지막 세션으로
    }
    if (EXAM[n]) _autoExam(n);
    var h = html(n);
    if (!h) return false;
    var nav = _el('session-nav'), content = _el('session-content'), actions = _el('session-actions');
    if (nav) nav.innerHTML = h.nav;
    if (content) { content.className = 'session-content fadein'; content.innerHTML = h.content; if (content.scrollTop) content.scrollTop = 0; }
    if (actions) actions.innerHTML = h.actions;
    return true;
  }
  function open(n) {
    var ok = load(n);
    if (ok && typeof App !== 'undefined' && _fn(App, 'showScreen')) App.showScreen('screen-curriculum');
    return ok;
  }

  // ── 완료(진도 + 여정 지도) ───────────────────────────────
  function _journeyComplete(n, now) {
    var J = _journey(), out = [];
    if (!_fn(J, 'completeLesson')) return out;
    var st = _jstate();
    _mapIds(n).forEach(function(id) {
      var nd = _node(id);
      if (!nd || nd.kind === 'boss' || !nd.lesson) return;   // 보스와 레슨 없는 노드(s3-11)는 옮길 레슨이 없음(마이그레이션과 같은 규칙)
      var r = st && st.nodes && st.nodes[id];
      if (r && r.lesson && r.lesson.done) return;            // 이미 완료면 생략
      try { J.completeLesson(id, 0, true, now); out.push(id); } catch (e) { _warn(e); }
    });
    return out;
  }
  function complete(n, now) {
    n = Math.floor(Number(n));
    if (!data(n)) return null;
    var res = { session: n, newly: false, nodes: [] };
    if (typeof Storage !== 'undefined' && _fn(Storage, 'getProgress') && _fn(Storage, 'saveProgress')) {
      try {
        var p = Storage.getProgress() || {};
        if (!Array.isArray(p.completedSessions)) p.completedSessions = [];
        if (p.completedSessions.indexOf(n) < 0) {
          p.completedSessions.push(n);
          p.currentSession = Math.max(p.currentSession || 1, Math.min(LAST, n + 1));
          Storage.saveProgress(p);
          res.newly = true;
        }
      } catch (e) { _warn(e); }
    }
    res.nodes = _journeyComplete(n, typeof now === 'number' ? now : undefined);
    return res;
  }
  // 23, 24: 대응 보스를 모두 통과했으면 저절로 완료
  function _autoExam(n) {
    var ids = _mapIds(n);
    if (!ids.length || isDone(n)) return false;
    if (!ids.every(function(id) { return _status(id) === 'passed'; })) return false;
    complete(n);
    return true;
  }
  function markRead(n) {
    var r = complete(n);
    load(n);
    return r;
  }
  function toJourney(n) {
    if (typeof JourneyUI === 'undefined' || !_fn(JourneyUI, 'open')) return false;
    JourneyUI.open();
    var ids = _mapIds(n).filter(function(id) { var s = _status(id); return s === 'open' || s === 'done'; });
    if (ids.length && _fn(JourneyUI, 'openNode')) JourneyUI.openNode(ids[0]);
    return true;
  }

  // 여정 노드 시트나 오늘의 5분에서 넘어온 커리큘럼 화면이면 JourneyUI가 복귀를 기다린다. 이때 퍼즐 화면(screen-journey)이
  // 뜨면 JourneyUI가 대기 결과를 반영하며 여정 홈으로 돌아가 드릴 화면을 덮는다. 그래서 대기 결과를 먼저 반영하고 드릴을 연다.
  function _settleJourneyReturn() {
    if (typeof JourneyUI === 'undefined' || !_fn(JourneyUI, 'hasPending') || !_fn(JourneyUI, 'resume')) return false;
    var pend = false;
    try { pend = !!JourneyUI.hasPending(); } catch (e) { return false; }
    if (!pend) return false;
    try { JourneyUI.resume(); } catch (e) { _warn(e); }
    return true;
  }

  // 세션 12: 노드 드릴(프리플랍 종합 20문항)을 퍼즐 세트로. 결과는 노드 드릴 기록에도 쌓인다.
  function mixedDrill(n) {
    n = Number(n) || 12;
    var nodeId = _mapIds(n)[0];
    if (!nodeId || !_canMixed(n)) return false;
    _settleJourneyReturn();
    var fired = false;
    var spec = {
      node: nodeId, type: 'preflop', title: '프리플랍 종합 20문항',
      onDone: function(r) {
        if (fired) return; fired = true;
        var cnt = r ? Math.max(0, Math.floor(Number(r.n) || 0)) : 0;
        var ok = r ? Math.max(0, Math.min(cnt, Math.floor(Number(r.ok) || 0))) : 0;
        var J = _journey();
        if (cnt > 0 && _fn(J, 'recordDrillSet')) { try { J.recordDrillSet(nodeId, { n: cnt, ok: ok }); } catch (e) { _warn(e); } }
        if (cnt > 0 && !r.aborted) complete(n);
        open(n);
      }
    };
    try { return PuzzleUI.start(spec) !== false; } catch (e) { _warn(e); return false; }
  }

  // ── 실습 라우팅(설계서 5.8절 4번) ────────────────────────
  function _route(n) {
    var J = _journey(), r = null;
    if (n != null && _fn(J, 'routePractice')) { try { r = J.routePractice(Number(n)); } catch (e) { r = null; } }
    var nd = r && r.node ? _node(r.node) : null;
    if (r && nd && nd.kind !== 'boss' && typeof r.config === 'string' && r.config.indexOf('sixmax-cast') === 0) {
      var cfg = r.config;
      if (typeof JourneyUI !== 'undefined' && _fn(JourneyUI, 'missionConfig')) { try { cfg = JourneyUI.missionConfig(nd) || cfg; } catch (e) { /* 그대로 */ } }
      return { kind: 'mission', node: r.node, config: cfg };
    }
    return { kind: 'gto', node: (r && r.node) || null, config: 'gto-mirror' };
  }
  // 커리큘럼 → 실습 직결: 노드에 미션이 있으면 6인 미션 5핸드, 아니면 GTO 미러(같은 카드 3회와 해설)
  function practice(n) {
    var r = _route(n);
    if (r.kind === 'mission') {
      var J = _journey();
      if (_fn(J, 'startSession')) J.startSession({ kind: 'mission', node: r.node, chunk: 5 });
    }
    if (typeof App !== 'undefined' && _fn(App, 'selectVillains')) App.selectVillains(r.config);
    // 미션 세션은 요약에서 "여정으로 돌아가기"로 그 노드 시트에 돌아온다(JourneyUI.hasPending이 노드 세션을 본다)
    if (r.kind === 'mission' && typeof JourneyUI !== 'undefined' && _fn(JourneyUI, 'watchReturn')) { try { JourneyUI.watchReturn(true); } catch (e) { _warn(e); } }
    return r;
  }

  function startQuiz(n) {
    var d = data(n);
    if (!d || !d.quiz || !d.quiz.length || typeof Quiz === 'undefined' || !_fn(Quiz, 'startForSession')) return false;
    Quiz.startForSession(d.quiz, Number(n), d.key);
    return true;
  }

  var api = {
    load: load, html: html, open: open, data: data, isDone: isDone, startQuiz: startQuiz, complete: complete,
    markRead: markRead, toJourney: toJourney, mixedDrill: mixedDrill, practice: practice, route: _route,
    describeRange: describeRange, rangePct: rangePct, exampleFor: exampleFor
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
