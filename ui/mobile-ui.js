// ui/mobile-ui.js — 세로 폰 학습 도크 (A-1 소유)
// 세로 폰에서만 #m-dock(테이블과 액션바 사이)을 만들고 코칭/차트/띵킹/총평 패널을 DOM 이동으로 모은다.
// 원위치를 기록해 데스크톱 폭으로 돌아가면 그대로 되돌림. 패널의 style.display는 건드리지 않고
// #m-dock[data-tab] + CSS(css/mobile.css)로 비활성 탭만 숨긴다 → 기존 JS(getElementById 접근)는 무수정.
// 로드 시 DOM 접근 없음(node 테스트 러너 안전). app.js 훅은 모두 typeof 가드로 호출된다.
var MobileUI = (function() {
  var MQ = '(max-width: 600px), (orientation: portrait) and (max-width: 760px)';   // css/mobile.css와 같은 문자열
  var TOP = ['last-verdict', 'coach-reminder', 'coach-pre', 'thinking-panel'];        // 항상 보이는 상단부
  var BODY = ['equity-overlay', 'gto-chart', 'thinking-feed', 'gto-commentary'];      // 탭 + 접기 본문
  var TABS = [
    { key: 'coach', label: '🎓 코칭' },
    { key: 'chart', label: '📋 차트' },
    { key: 'think', label: '💭 띵킹' },
    { key: 'review', label: '📝 총평' }
  ];
  var _active = false, _moved = [], _dock = null, _tab = 'coach', _collapsed = true, _inited = false;
  var _savedTop = null;   // _reveal 직전 게임 화면 스크롤 위치 — 접으면 되돌림

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
    _moved = [];
    TOP.forEach(function(id) { _move(id, top); });
    BODY.forEach(function(id) { _move(id, body); });
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

  function _collapse() {
    _collapsed = true;
    _refresh();
    var sc = _el('screen-game');
    if (sc && _savedTop != null) sc.scrollTop = _savedTop;   // 펼치며 내려갔던 만큼 되돌려 테이블을 다시 보여 줌
    _savedTop = null;
  }

  // 펼친 본문이 하단 고정 액션바 뒤에 숨지 않게 게임 화면을 필요한 만큼만 스크롤(탭 바가 화면 위로 넘어가지 않는 범위)
  function _reveal() {
    var sc = _el('screen-game');
    if (!_dock || _collapsed || !sc || !sc.getBoundingClientRect) return;
    var body = _dock.querySelector('.m-dock-body'), tabs = _dock.querySelector('.m-dock-tabs');
    var bar = null;
    ['action-bar', 'result-actions-bar'].forEach(function(id) {
      var b = _el(id);
      if (b && b.style.display !== 'none' && b.offsetHeight > 0) bar = b;
    });
    var scTop = sc.getBoundingClientRect().top;
    var limit = bar ? bar.getBoundingClientRect().top : sc.getBoundingClientRect().bottom;
    var over = body.getBoundingClientRect().bottom - limit + 4;
    var room = tabs.getBoundingClientRect().top - scTop;
    // 내 카드(히어로 카드)는 화면 안에 남겨 둠 — 읽으면서 내 패를 확인할 수 있게
    var hc = document.querySelector('#screen-game .seat.hero .seat-cards');
    if (hc && hc.offsetHeight > 0) room = Math.min(room, hc.getBoundingClientRect().top - scTop - 4);
    var d = Math.min(over, room);
    if (d > 0) {
      if (_savedTop == null) _savedTop = sc.scrollTop;
      sc.scrollTop += d;
    }
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

  // ── app.js 훅 (모바일이 아니면 전부 no-op) ──
  function onNewHand() {
    if (!_active) return;
    _tab = 'coach'; _collapsed = true; _savedTop = null;
    _refresh();
    var sc = _el('screen-game');
    if (sc) sc.scrollTop = 0;   // 새 핸드는 테이블 전체가 보이게
  }

  function onHeroTurn(view, ctx) {
    if (!_active) return;
    // 자동 펼침: L0(풀코칭) / GTO 2회차(힌트 회차)
    if ((view && view.level === 0) || (ctx && ctx.gtoMode && ctx.gtoRound === 2)) { _tab = 'coach'; _collapsed = false; }
    _refresh();
    var top = _dock.querySelector('.m-dock-top');
    if (top) top.scrollTop = 0;
  }

  function onAfterDecision() { if (_active) _refresh(); }

  function onHandEnd() {
    if (!_active) return;
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
    _state: function() { return { active: _active, tab: _tab, collapsed: _collapsed }; }
  };
})();
