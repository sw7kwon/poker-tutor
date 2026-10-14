// ui/touch.js — 터치 레이어 (A-3 소유)
// 손가락 기기((hover:none) and (pointer:coarse))에서만 html.touch를 붙이고,
// 마우스 툴팁(title)을 탭 토스트/롱프레스 팁으로 바꿔 보여 준다. 데스크톱(마우스)은 아무것도 바뀌지 않는다.
//  - 빌런 선택 버튼의 title 설명 → 버튼 안 .opt-help 본문으로 노출(단일 출처: title 문구)
//  - 버튼이 아닌 title 요소(팟 오즈 링, 좌석 HUD, 미니 차트 칸, 실수 목록 행) 탭 → #touch-tip 토스트
//  - title 있는 버튼(폴드/벳 설명, 닫기) 0.5초 길게 누르기 → 팁 표시 + 뒤따르는 클릭 1회 무시
// node 테스트 러너에서 로드돼도 안전하도록 window/document/matchMedia는 모두 typeof 가드.
var TouchUI = (function () {
  'use strict';

  var MQ = '(hover: none) and (pointer: coarse)';
  var LONG_MS = 500;          // 롱프레스 판정
  var MOVE_TOL = 10;          // 이만큼(px) 움직이면 스크롤로 보고 롱프레스 취소
  var TIP_MS = 2800;          // 토스트 기본 표시 시간
  var TIP_MAX_MS = 6000;      // 긴 설명은 글자 수에 비례해 최대 6초
  var SUPPRESS_MS = 800;      // 롱프레스 뒤 손을 뗀 다음 이 시간 안의 클릭 1회 무시
  // 이 요소(또는 그 안)를 누르면 원래 동작이 우선 — 탭 토스트를 띄우지 않는다
  var INTERACTIVE = 'button, a, input, select, textarea, label, [onclick]';

  var _mq = null, _on = false, _bound = false;
  var _tipEl = null, _tipTimer = null, _tipOwner = null;
  var _press = null;          // { el, x, y, id, timer, fired }
  // 롱프레스한 바로 그 버튼의, 같은 손가락 동작에서 나온 click만 무시한다.
  // (click을 보내지 않는 브라우저에서 곧바로 누른 다른 버튼·새 탭까지 삼키지 않도록)
  var _suppressUntil = 0, _suppressEl = null;

  function _hasDom() {
    return typeof window !== 'undefined' && typeof document !== 'undefined' &&
      !!document.documentElement && typeof window.matchMedia === 'function';
  }

  function _now() { return Date.now(); }

  function _titleOf(el) {
    if (!el || !el.getAttribute) return '';
    return String(el.getAttribute('title') || '').trim();
  }

  // ── 켜기/끄기 ─────────────────────────────────────────
  function init() {
    if (!_hasDom() || _mq) return;
    _mq = window.matchMedia(MQ);
    _apply(_mq.matches);
    var onChange = function (e) { _apply(e.matches); };
    if (_mq.addEventListener) _mq.addEventListener('change', onChange);
    else if (_mq.addListener) _mq.addListener(onChange);
  }

  function _apply(on) {
    _on = !!on;
    var cl = document.documentElement.classList;
    if (cl) { if (_on) cl.add('touch'); else cl.remove('touch'); }
    if (_on) { _convertHelp(); _bind(); }
    else { _restoreHelp(); _cancelPress(); hideTip(); _clearSuppress(); }
  }

  function _clearSuppress() { _suppressUntil = 0; _suppressEl = null; }

  // ── 빌런 선택 설명: title → .opt-help 본문 ────────────────
  function _convertHelp() {
    if (typeof document.querySelectorAll !== 'function') return;
    var opts = document.querySelectorAll('.villain-opt[title]');
    for (var i = 0; i < opts.length; i++) {
      var b = opts[i], t = _titleOf(b);
      if (!t) continue;
      var help = b.querySelector('.opt-help');
      if (!help) {
        help = document.createElement('span');
        help.className = 'opt-help';
        b.appendChild(help);
      }
      help.textContent = t;
      b.setAttribute('data-touch-title', t);   // 마우스 기기로 바뀌면 툴팁 복원용
      b.removeAttribute('title');
    }
  }

  function _restoreHelp() {
    if (typeof document.querySelectorAll !== 'function') return;
    var opts = document.querySelectorAll('.villain-opt[data-touch-title]');
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute('title', opts[i].getAttribute('data-touch-title'));
      opts[i].removeAttribute('data-touch-title');
      // .opt-help는 남겨 둠 — html.touch가 없으면 CSS가 숨긴다
    }
  }

  // ── 토스트 ───────────────────────────────────────────
  function _tipNode() {
    if (_tipEl && _tipEl.parentNode) return _tipEl;
    _tipEl = document.getElementById('touch-tip');
    if (!_tipEl) {
      _tipEl = document.createElement('div');
      _tipEl.id = 'touch-tip';
      _tipEl.setAttribute('role', 'status');
      _tipEl.setAttribute('aria-live', 'polite');
      _tipEl.hidden = true;
      (document.body || document.documentElement).appendChild(_tipEl);
    }
    return _tipEl;
  }

  function showTip(text, owner) {
    if (!_hasDom()) return;
    text = String(text || '').trim();
    if (!text) return;
    var el = _tipNode();
    el.textContent = text;
    el.hidden = false;
    _tipOwner = owner || null;
    if (_tipTimer) clearTimeout(_tipTimer);
    var ms = Math.min(TIP_MAX_MS, Math.max(TIP_MS, 1200 + text.length * 60));
    _tipTimer = setTimeout(hideTip, ms);
  }

  function hideTip() {
    if (_tipTimer) { clearTimeout(_tipTimer); _tipTimer = null; }
    if (_tipEl) _tipEl.hidden = true;
    _tipOwner = null;
  }

  function _tipVisible() { return !!(_tipEl && !_tipEl.hidden); }

  // ── 탭 대상 찾기 ───────────────────────────────────────
  // 버튼이 아닌 title 요소. 좌석은 HUD 글자가 작아서 좌석 아무 곳이나 눌러도 그 좌석 HUD 설명을 보여 준다.
  function _tapTarget(t) {
    if (!t || !t.closest) return null;
    if (t.closest(INTERACTIVE)) return null;
    var titled = t.closest('[title]');
    if (titled && _titleOf(titled)) return titled;
    var seat = t.closest('.seat');
    if (seat) {
      var hud = seat.querySelector('.seat-hud[title]');
      if (hud && _titleOf(hud)) return hud;
    }
    return null;
  }

  // ── 이벤트 ───────────────────────────────────────────
  function _onClick(e) {
    if (!_on) return;
    if (_suppressUntil) {
      var hit = _now() <= _suppressUntil && !!_suppressEl && !!e.target &&
        typeof _suppressEl.contains === 'function' && _suppressEl.contains(e.target);
      _clearSuppress();
      if (hit) {   // 롱프레스로 팁을 본 버튼 — 이번 클릭은 실행하지 않음
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        return;
      }
    }
    var target = _tapTarget(e.target);
    if (_tipVisible()) {
      var same = target && target === _tipOwner;
      hideTip();
      if (same) return;   // 같은 곳을 다시 누르면 닫기만
    }
    if (target) showTip(_titleOf(target), target);
  }

  function _onPointerDown(e) {
    if (!_on) return;
    _cancelPress();
    if (e.isPrimary === false) return;
    _clearSuppress();   // 새 손가락 동작 — 이전 롱프레스의 click은 (왔다면) 이미 지나갔다
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var t = e.target;
    var btn = t && t.closest ? t.closest('button[title]') : null;
    if (!btn || btn.disabled || !_titleOf(btn)) return;
    var p = { el: btn, x: e.clientX, y: e.clientY, id: e.pointerId, fired: false, timer: null };
    p.timer = setTimeout(function () {
      if (_press !== p) return;
      p.fired = true;
      showTip(_titleOf(btn), btn);
      _suppressEl = btn;
      _suppressUntil = _now() + 60000;   // 손을 뗄 때 SUPPRESS_MS로 다시 맞춤
    }, LONG_MS);
    _press = p;
  }

  function _onPointerMove(e) {
    if (!_press || _press.fired || e.pointerId !== _press.id) return;
    var dx = e.clientX - _press.x, dy = e.clientY - _press.y;
    if (dx * dx + dy * dy > MOVE_TOL * MOVE_TOL) _cancelPress();
  }

  function _onPointerEnd(e) {
    if (!_press || (e && e.pointerId !== _press.id)) return;
    if (_press.fired) _suppressUntil = _now() + SUPPRESS_MS;
    _cancelPress();
  }

  function _cancelPress() {
    if (_press && _press.timer) clearTimeout(_press.timer);
    _press = null;
  }

  // 롱프레스 중 길게 누르기 메뉴/글자 선택이 뜨지 않게
  function _onContextMenu(e) {
    if (!_on) return;
    var t = e.target;
    if ((_press && _press.fired) || (t && t.closest && t.closest('button[title]'))) e.preventDefault();
  }

  function _bind() {
    if (_bound) return;
    _bound = true;
    document.addEventListener('click', _onClick, true);   // 캡처: 인라인 onclick보다 먼저 억제 판정
    document.addEventListener('pointerdown', _onPointerDown, { capture: true, passive: true });
    document.addEventListener('pointermove', _onPointerMove, { capture: true, passive: true });
    document.addEventListener('pointerup', _onPointerEnd, true);
    document.addEventListener('pointercancel', _onPointerEnd, true);
    document.addEventListener('contextmenu', _onContextMenu, true);
  }

  if (_hasDom()) {
    init();   // 스크립트가 body 끝에서 로드되므로 빌런 선택 버튼은 이미 있다
    if (document.readyState === 'loading' && document.addEventListener) {
      document.addEventListener('DOMContentLoaded', function () { if (_on) _convertHelp(); });
    }
  }

  return {
    init: init,
    isTouch: function () { return _on; },
    showTip: showTip,
    hideTip: hideTip,
    refreshHelp: function () { if (_on) _convertHelp(); }
  };
})();
