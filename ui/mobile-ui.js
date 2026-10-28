// ui/mobile-ui.js — 세로 폰 학습 도크 (A-1 소유)
// 세로 폰에서만 #m-dock(테이블과 액션바 사이)을 만들고 코칭/차트/띵킹/총평 패널을 DOM 이동으로 모은다.
// 원위치를 기록해 데스크톱 폭으로 돌아가면 그대로 되돌림. 패널의 style.display는 건드리지 않고
// #m-dock[data-tab] + CSS(css/mobile.css)로 비활성 탭만 숨긴다 → 기존 JS(getElementById 접근)는 무수정.
// 로드 시 DOM 접근 없음(node 테스트 러너 안전). app.js 훅은 모두 typeof 가드로 호출된다.
// M4-P5: openTab(key) 추가(계약 T2, 극장이 띵킹 탭을 연다). 기존 동작은 그대로.
// R7(G2 DOCK, 설계 6절 2번): 상단부는 판정 띠(#coach-line 44px), 리마인더 1줄, 띵킹 패널만(합 132px 이하).
//   판정 상세(#last-verdict)와 체크리스트, 예측 카드(#coach-pre)는 본문 코칭 탭(#equity-overlay 안)으로 내려갔고 L2도 자동 펼침.
//   openTab(key)는 공개 계약(G4 차트 시트, 극장, CoachUI.lineTap이 부른다).
// (n2 G2 PACE, 설계 docs/NEXT2_DESIGN.md 4.4절 3번) 상단부 맨 앞에 액션 로그 줄 #hand-log(36px, ui/pacer.js HandLogUI가 만든다).
//   예산 132px: 판정 띠 44 + 리마인더 44 + 로그 36 = 124(띵킹 패널은 켠 사람만, 넘치면 상단부 안쪽 스크롤). _mount가 먼저 HandLogUI.ensure()를 부른다.
// (n4 G1 NAV, 설계 docs/NEXT4_DESIGN.md 1.3절, 1.4절, 결정 59, 61) 결과바 정리: 폰에서는 [▶ 다음 핸드][⋯ 더 보기] 한 줄(64px)이고,
//   나머지 6개(💰 리바이, 🔁 같은 핸드 다시, ⏪ 리플레이, ⚡ 1문제, 📜 히스토리, 세션 종료)는 더 보기 시트 #result-more-sheet(z 37, 결과바 위)로 DOM 이동한다.
//   id와 onclick, 인라인 display는 그대로라 App._syncRebuyBtn, _syncReplayBtn과 연습의 히스토리, 세션 종료 숨김이 그대로 동작한다(숨은 버튼은 줄도 숨는다).
//   데스크톱 폭으로 돌아가면 _unmount가 원위치로 되돌린다. openMore(), closeMore(), placeMore()(바닥 = 보이는 바 위, NextBar가 바가 바뀔 때 부른다),
//   moreOpen(), MORE(옮기는 버튼 id). 시트 머리줄 48px(✕ 닫기 72x48), 시트 밖 누름, 아래로 끌기(SheetGesture)로 닫는다.
var MobileUI = (function() {
  var MQ = '(max-width: 600px), (orientation: portrait) and (max-width: 760px)';   // css/mobile.css와 같은 문자열
  var TOP = ['hand-log', 'coach-line', 'coach-reminder', 'thinking-panel'];           // 항상 보이는 상단부(R7, n2 액션 로그 줄 맨 앞)
  var BODY = ['equity-overlay', 'gto-chart', 'thinking-feed', 'gto-commentary'];      // 탭 + 접기 본문
  var TABS = [
    { key: 'coach', label: '🎓 코칭' },
    { key: 'chart', label: '📋 차트' },
    { key: 'think', label: '💭 띵킹' },
    { key: 'review', label: '📝 총평' }
  ];
  var TAB_KEYS = { coach: true, chart: true, think: true, review: true };
  var _active = false, _moved = [], _dock = null, _tab = 'coach', _collapsed = true, _inited = false;
  var _forced = null;     // openTab으로 연 탭 키(내용이 비어 보여도 숨기지 않음)
  var _savedTop = null;   // _reveal 직전 게임 화면 스크롤 위치 — 접으면 되돌림
  var _revealSeq = 0;     // _reveal 연속 호출 토큰(마지막 것만 실행)
  var MORE = ['btn-rebuy', 'btn-practice-same', 'btn-replay', 'btn-quick-drill', 'btn-history', 'btn-session-end'];   // 더 보기 시트로 옮기는 결과바 버튼(이 순서, 세션 종료 맨 아래)
  var _moreOpen = false, _moreBound = false, _more = null;   // _more = { sheet, head, body, close }

  function _el(id) { return document.getElementById(id); }

  function init() {
    if (_inited || typeof window === 'undefined' || !window.matchMedia || typeof document === 'undefined') return;
    _inited = true;
    var m = window.matchMedia(MQ);
    apply(m.matches);
    var onChange = function(e) { apply(e.matches); };
    if (m.addEventListener) m.addEventListener('change', onChange);
    else if (m.addListener) m.addListener(onChange);
    // 액션바의 🎯 GTO 정답 세팅 / ▶ 이유 버튼 → 이유는 총평 패널(#gto-reason)에 뜨므로 총평 탭을 열어 줌
    document.addEventListener('click', function(e) {
      if (!_active || !e.target || !e.target.closest) return;
      if (!e.target.closest('#gto-preset-btn, #gto-reason-toggle')) return;
      var r = _el('gto-reason');
      if (r && r.style.display !== 'none' && r.innerHTML.trim()) { _open('review'); }
    });
  }

  function apply(on) {
    if (on && !_active) _mount();
    else if (!on && _active) _unmount();
  }

  function _mount() {
    var area = document.querySelector('#screen-game .table-area');
    if (!area || !area.parentNode) return;
    var dock = document.createElement('div');
    dock.id = 'm-dock';
    dock.className = 'm-dock m-collapsed';
    dock.setAttribute('data-tab', _tab);
    var html = '<div class="m-dock-top"></div><div class="m-dock-tabs" role="tablist">';
    TABS.forEach(function(t) {
      html += '<button type="button" role="tab" data-tab="' + t.key + '">' + t.label + '</button>';
    });
    html += '<button type="button" class="m-dock-handle" aria-label="학습 패널 펼치기">▾</button></div>' +
      '<div class="m-dock-body"></div>';
    dock.innerHTML = html;
    area.parentNode.insertBefore(dock, area.nextSibling);
    _dock = dock;
    var top = dock.querySelector('.m-dock-top'), body = dock.querySelector('.m-dock-body');
    if (typeof HandLogUI !== 'undefined' && HandLogUI && typeof HandLogUI.ensure === 'function') { try { HandLogUI.ensure(); } catch (e) { /* noop */ } }
    _moved = [];
    TOP.forEach(function(id) { _move(id, top); });
    BODY.forEach(function(id) { _move(id, body); });
    _mountMore();
    // selectVillains와 같은 동기화: 코칭 패널은 도크 탭이 대신 여닫으므로 항상 표시 상태로 둠
    var ov = _el('equity-overlay'), tg = _el('equity-toggle'), ch = _el('gto-chart');
    if (ov) ov.style.display = 'flex';
    if (tg) tg.classList.add('active');
    if (ch) ch.classList.remove('panel-closed');
    dock.addEventListener('click', _onDockClick);
    document.documentElement.classList.add('m-mobile');
    _active = true;
    _refresh();
  }

  function _move(id, target) {
    var el = _el(id);
    if (!el || !el.parentNode) return;
    _moved.push({ el: el, parent: el.parentNode, next: el.nextSibling });
    target.appendChild(el);
  }

  function _unmount() {
    closeMore();
    var mb = _el('btn-result-more');
    if (mb) mb.style.display = 'none';
    for (var i = _moved.length - 1; i >= 0; i--) {
      var m = _moved[i];
      if (m.next && m.next.parentNode === m.parent) m.parent.insertBefore(m.el, m.next);
      else m.parent.appendChild(m.el);
    }
    _moved = [];
    _savedTop = null;
    var tp = _el('thinking-panel');
    if (tp) tp.classList.remove('m-collapsed');
    if (_dock && _dock.parentNode) _dock.parentNode.removeChild(_dock);
    _dock = null;
    document.documentElement.classList.remove('m-mobile');
    _active = false;
  }

  function _onDockClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var tabBtn = t.closest('.m-dock-tabs button');
    if (tabBtn) {
      var key = tabBtn.getAttribute('data-tab');
      if (!key) { if (_collapsed) _open(_tab); else _collapse(); return; }   // 핸들
      if (key === _tab && !_collapsed) { _collapse(); return; }            // 같은 탭 다시 누르면 접기
      _open(key);
      return;
    }
    if (t.closest('.cp-hint')) { _open('coach'); return; }                                      // 💡 정답 보기 직후 코칭 펼침
    if (t.closest('.thinking-panel-title')) {
      var tp = _el('thinking-panel');
      if (tp) tp.classList.toggle('m-collapsed');
    }
  }

  function _open(key) {
    if (!_active) return;
    _tab = key;
    _collapsed = false;
    _refresh();
    _reveal();
  }

  // 강제 레이아웃 묶기(TABLE-06a): 스크롤 쓰기는 다음 프레임에 1회(읽기 뒤 쓰기). rAF가 없으면 즉시
  function _raf(fn) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
    else fn();
  }

  function _collapse() {
    _collapsed = true;
    _refresh();
    var top = _savedTop;
    _savedTop = null;
    if (top == null) return;
    _raf(function() {
      var sc = _el('screen-game');
      if (sc && _collapsed) sc.scrollTop = top;   // 펼치며 내려갔던 만큼 되돌려 테이블을 다시 보여 줌
    });
  }

  // 펼친 본문이 하단 고정 액션바 뒤에 숨지 않게 게임 화면을 필요한 만큼만 스크롤(탭 바가 화면 위로 넘어가지 않는 범위)
  // rAF 1회 안에서 getBoundingClientRect 읽기를 전부 먼저 모은 뒤 scrollTop 쓰기 1회(레이아웃 스래싱 방지)
  function _reveal() {
    var seq = ++_revealSeq;
    _raf(function() {
      if (seq !== _revealSeq) return;   // 연속 호출은 마지막 것만
      var sc = _el('screen-game');
      if (!_dock || _collapsed || !sc || !sc.getBoundingClientRect) return;
      var body = _dock.querySelector('.m-dock-body'), tabs = _dock.querySelector('.m-dock-tabs');
      if (!body || !tabs) return;
      // ── 읽기 ──
      var bar = null;
      var ids = (typeof NextBar !== 'undefined' && NextBar && Array.isArray(NextBar.BARS)) ? NextBar.BARS : ['action-bar', 'result-actions-bar'];   // (n4-P0) 바 후보 공통 상수
      ids.forEach(function(id) {
        var b = _el(id);
        if (b && b.style.display !== 'none' && b.offsetHeight > 0) bar = b;
      });
      var scRect = sc.getBoundingClientRect(), scTop = scRect.top;
      var limit = bar ? bar.getBoundingClientRect().top : scRect.bottom;
      var over = body.getBoundingClientRect().bottom - limit + 4;
      var room = tabs.getBoundingClientRect().top - scTop;
      // 내 카드(히어로 카드)는 화면 안에 남겨 둠, 읽으면서 내 패를 확인할 수 있게
      var hc = document.querySelector('#screen-game .seat.hero .seat-cards');
      if (hc && hc.offsetHeight > 0) room = Math.min(room, hc.getBoundingClientRect().top - scTop - 4);
      // (n4 G1, 설계 1.3절 3번) 핸드 끝(결과바)에는 보드도 화면 안에 남긴다(승자와 보드를 보며 총평을 읽게)
      var bc = bar && bar.id === 'result-actions-bar' ? document.getElementById('board-cards') : null;
      if (bc && bc.offsetHeight > 0) room = Math.min(room, bc.getBoundingClientRect().top - scTop - 4);
      var d = Math.min(over, room);
      var cur = sc.scrollTop;
      // ── 쓰기 ──
      if (d > 0) {
        if (_savedTop == null) _savedTop = cur;
        sc.scrollTop = cur + d;
      }
    });
  }

  function _hidden(el) {
    return !el || el.style.display === 'none' || !el.innerHTML.replace(/\s+/g, '');
  }

  function _refresh() {
    if (!_active || !_dock) return;
    var hide = {
      coach: false,
      chart: _hidden(_el('gto-chart')),
      think: !(typeof ThinkingUI !== 'undefined' && ThinkingUI.isOn && ThinkingUI.isOn()) || _hidden(_el('thinking-feed')),
      review: _hidden(_el('gto-commentary'))
    };
    if (_forced && Object.prototype.hasOwnProperty.call(hide, _forced)) hide[_forced] = false;   // openTab으로 연 탭은 늘 보임
    if (hide[_tab]) { _tab = 'coach'; }
    var tg = _el('equity-toggle');
    var lv = tg && /코칭\s*L\d/.exec(tg.textContent || '');
    var btns = _dock.querySelectorAll('.m-dock-tabs button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], key = b.getAttribute('data-tab');
      if (!key) {
        b.textContent = _collapsed ? '▾' : '▴';
        b.setAttribute('aria-label', _collapsed ? '학습 패널 펼치기' : '학습 패널 접기');
        b.setAttribute('aria-expanded', _collapsed ? 'false' : 'true');
        continue;
      }
      b.hidden = !!hide[key];
      if (key === 'coach') b.textContent = '🎓 ' + (lv ? lv[0].replace(/\s+/, ' ') : '코칭');
      var on = key === _tab && !_collapsed;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    var top = _dock.querySelector('.m-dock-top');
    var allHidden = TOP.every(function(id) { var el = _el(id); return _hidden(el); });
    top.classList.toggle('is-empty', allHidden);
    _dock.setAttribute('data-tab', _tab);
    _dock.classList.toggle('m-collapsed', _collapsed);
  }

  // ── (n4 G1) 결과바 더 보기 시트 ──
  // 시트 뼈대(index.html의 빈 #result-more-sheet)에 머리줄과 본문을 만들고 MORE 버튼을 본문으로 옮긴다(_moved에 기록, _unmount가 되돌린다)
  function _mk(tag, cls, attrs, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function(k) { e.setAttribute(k, attrs[k]); });
    if (html) e.innerHTML = html;
    return e;
  }
  function _mountMore() {
    var sh = _el('result-more-sheet'), mb = _el('btn-result-more');
    if (!sh || !mb) return false;
    if (!_more || _more.sheet !== sh) {
      var head = _mk('div', 'sheet-head result-more-head');
      head.appendChild(_mk('span', 'sheet-grip', { 'aria-hidden': 'true' }));
      head.appendChild(_mk('span', 'sheet-title', null, '더 보기'));
      var close = _mk('button', 'sheet-close', { type: 'button', 'aria-label': '더 보기 닫기' }, '<span aria-hidden="true">✕</span><span class="sheet-close-t">닫기</span>');
      head.appendChild(close);
      var body = _mk('div', 'result-more-body', { role: 'group', 'aria-label': '결과 화면 다른 메뉴' });
      sh.innerHTML = '';
      sh.appendChild(head);
      sh.appendChild(body);
      _more = { sheet: sh, head: head, body: body, close: close };
      close.addEventListener('click', function(e) { if (e && e.stopPropagation) e.stopPropagation(); closeMore(); });
      body.addEventListener('click', function(e) {
        var t = e && e.target;
        if (t && t.closest && t.closest('.action-btn')) _raf(closeMore);   // 줄을 누르면 그 일(버튼 onclick)을 하고 시트는 닫는다
      });
      if (typeof SheetGesture !== 'undefined' && SheetGesture && typeof SheetGesture.bind === 'function') {
        // (n4g1 리뷰) 손가락 누름은 SheetGesture가 머리줄 touchend 기본 동작을 막아 '✕ 닫기'의 click이 오지 않는다(412x915 실측: ✕를 눌러도 안 닫힘).
        //   머리줄 누름(✕ 포함) = 닫기로 받는다(설계 1.4절 1번: 손잡이 누름도 닫기). 키보드 Enter는 ✕의 click이 그대로 닫는다
        SheetGesture.bind(sh, head, { onClose: closeMore, onTap: closeMore });
      }
    }
    MORE.forEach(function(id) { _move(id, _more.body); });
    mb.style.display = '';
    mb.setAttribute('aria-expanded', 'false');
    if (!_moreBound && typeof document.addEventListener === 'function') {
      _moreBound = true;
      // 시트 밖 누름은 닫는다(그 누름의 일은 그대로, 예: ▶ 다음 핸드)
      document.addEventListener('click', function(e) {
        if (!_moreOpen) return;
        var t = e && e.target;
        if (t && t.closest && (t.closest('#result-more-sheet') || t.closest('#btn-result-more'))) return;
        closeMore();
      }, true);
    }
    return true;
  }
  // 보이는 더 보기 줄 수(숨은 버튼은 줄도 숨는다)
  function _moreCount() {
    var n = 0;
    MORE.forEach(function(id) { var b = _el(id); if (b && b.style.display !== 'none' && _more && b.parentNode === _more.body) n++; });
    return n;
  }
  function openMore() {
    if (!_active) return false;
    var sh = _el('result-more-sheet');
    if (!sh || !_more || _more.sheet !== sh) return false;
    if (_moreOpen) { closeMore(); return false; }   // 더 보기를 다시 누르면 닫기
    _moreOpen = true;
    sh.style.display = '';
    var mb = _el('btn-result-more');
    if (mb) mb.setAttribute('aria-expanded', 'true');
    placeMore();
    _raf(function() { var c = _more && _more.close; if (c && _moreOpen && typeof c.focus === 'function') { try { c.focus({ preventScroll: true }); } catch (e) { /* noop */ } } });
    return true;
  }
  function closeMore() {
    var sh = _el('result-more-sheet');
    var was = _moreOpen;
    _moreOpen = false;
    if (sh) { sh.style.display = 'none'; sh.style.transform = ''; }
    var mb = _el('btn-result-more');
    if (mb) mb.setAttribute('aria-expanded', 'false');
    if (was && mb && typeof mb.focus === 'function' && document.activeElement && document.activeElement !== document.body && sh && sh.contains && sh.contains(document.activeElement)) {
      try { mb.focus({ preventScroll: true }); } catch (e) { /* noop */ }
    }
    return was;
  }
  // 시트 바닥 = 보이는 하단 바(NextBar.BARS 중) 위 끝. 강제 레이아웃은 시트가 열려 있을 때만
  function placeMore() {
    if (!_moreOpen || typeof window === 'undefined') return false;
    var sh = _el('result-more-sheet');
    if (!sh) return false;
    var bar = null, ids = (typeof NextBar !== 'undefined' && NextBar && Array.isArray(NextBar.BARS)) ? NextBar.BARS : ['action-bar', 'result-actions-bar'];
    ids.forEach(function(id) { var b = _el(id); if (b && b.style.display !== 'none' && b.offsetHeight > 0) bar = b; });
    var ih = window.innerHeight || 0, top = bar && bar.getBoundingClientRect ? bar.getBoundingClientRect().top : ih;
    sh.style.bottom = Math.max(0, Math.round(ih - top)) + 'px';
    sh.style.maxHeight = Math.max(160, Math.round(top - 8)) + 'px';
    return true;
  }
  // 결과바의 더 보기 버튼: 시트에 보일 줄이 없으면(모두 숨김) 숨긴다
  function _syncMore() {
    var mb = _el('btn-result-more');
    if (!mb || !_active) return;
    mb.style.display = _moreCount() > 0 ? '' : 'none';
  }

  // ── app.js 훅 (모바일이 아니면 전부 no-op) ──
  // 다른 모듈이 도크 탭을 직접 연다(M4 계약 T2, 극장이 세로 폰에서 '💭 띵킹' 탭을 자동 선택).
  // key = 'coach'|'chart'|'think'|'review'. 연 탭은 내용 판정(띵킹 꺼짐 등)과 무관하게 보이고, onNewHand나 openTab(null)이 푼다.
  // key가 비어 있으면 강제 표시를 풀고 접는다. 도크가 없으면(데스크톱, node 테스트) 아무것도 하지 않고 false.
  function openTab(key) {
    if (!_active || !_dock) return false;
    if (!key) { _forced = null; _collapse(); return true; }
    if (!TAB_KEYS[key]) return false;
    _forced = key;
    _open(key);
    return true;
  }

  function onNewHand() {
    if (!_active) return;
    closeMore();
    _forced = null;
    _tab = 'coach'; _collapsed = true; _savedTop = null;
    _refresh();
    _raf(function() {
      var sc = _el('screen-game');
      if (sc) sc.scrollTop = 0;   // 새 핸드는 테이블 전체가 보이게
    });
  }

  function onHeroTurn(view, ctx) {
    if (!_active) return;
    // 자동 펼침: L0(풀코칭), L2(예측 카드가 본문에 있음, R7), GTO 2회차(힌트 회차)
    if (autoOpen(view, ctx)) { _tab = 'coach'; _collapsed = false; }
    _refresh();
    _raf(function() {
      var top = _dock && _dock.querySelector('.m-dock-top');
      if (top) top.scrollTop = 0;
    });
  }

  // 순수: 결정 차례에 코칭 탭을 자동으로 펼치는지(L0, L2, GTO 2회차). L1은 판정 띠 ▸ 체크리스트로 직접 연다, L3은 접힘
  function autoOpen(view, ctx) {
    var lv = view && view.level;
    return lv === 0 || lv === 2 || !!(ctx && ctx.gtoMode && ctx.gtoRound === 2);
  }

  function onAfterDecision() { if (_active) _refresh(); }

  // (n4 G1) 연습 재생은 '🔁 같은 핸드 다시'가 주 행동(▶ 다음 핸드 = 연습 종료)이라 결과바에 둔다. 연습이 아니면 더 보기 시트로 되돌린다
  function _placePractice(on) {
    var b = _el('btn-practice-same'), rb = _el('result-actions-bar'), mb = _el('btn-result-more');
    if (!b || !rb || !mb || !_more) return false;
    if (on && b.parentNode !== rb) rb.insertBefore(b, mb);
    else if (!on && b.parentNode !== _more.body) _more.body.insertBefore(b, _el('btn-replay') && _el('btn-replay').parentNode === _more.body ? _el('btn-replay') : _more.body.firstChild);
    if (b.classList) b.classList.toggle('rb-practice', !!on);
    return true;
  }
  function onHandEnd(ctx) {
    if (!_active) return;
    _placePractice(!!(ctx && ctx.practice));
    _syncMore();
    _refresh();
    if (_hidden(_el('gto-commentary'))) return;
    _open('review');
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    if (typeof document !== 'undefined' && document.readyState === 'complete') init();
    else window.addEventListener('load', init);
  }

  return {
    init: init, isMobile: function() { return _active; },
    onNewHand: onNewHand, onHeroTurn: onHeroTurn, onAfterDecision: onAfterDecision, onHandEnd: onHandEnd,
    openTab: openTab, autoOpen: autoOpen, TOP: TOP.slice(),
    openMore: openMore, closeMore: closeMore, placeMore: placeMore, moreOpen: function() { return _moreOpen; }, moreCount: _moreCount, MORE: MORE.slice(),
    _state: function() { return { active: _active, tab: _tab, collapsed: _collapsed, forced: _forced }; },
    _apply: apply   // (n4 G1) 테스트: 폰 도크 붙이기와 떼기(결과바 더 보기 DOM 이동과 복원)
  };
})();
