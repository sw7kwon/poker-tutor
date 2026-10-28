// ui/next-bar.js (n4 G1 NAV, 설계 docs/NEXT4_DESIGN.md 1.2절, 2.5절, 2.6절, 결정 59, 60, 66)
// 주 진행 버튼 바 #next-bar(index.html, #action-bar 바로 뒤 형제, 하단 고정 슬롯 z 40).
//   하단 슬롯에는 늘 바 하나만: 내 차례 액션바 | 상대 차례와 스트리트 전환 대기 다음 바 | 핸드 끝 결과바.
//   판정은 app.js의 'hand:phase'(document, detail { phase: 'wait' | 'hero' | 'end' | 'none' })와 Pacer 대기(Pacer._ui가 update(waiting())를 부른다).
//     wait: 다음 바가 보이고 액션바는 숨는다(#screen-game.nb-on, css/next-bar.css). 대기 정보가 없는 틈(보드 딜, 카드 나눔)에도 자리를 지키고 주 버튼만 disabled.
//     end: 결과바가 뜨기 전(app.js가 350ms 뒤 띄운다)까지 disabled로 자리를 지킨다. 결과바가 보이면 숨는다.
//     hero, none: 숨는다(액션바).
//   BARS = 하단 바 후보 id 공통 상수(GtoChart._placeSheet와 _watchBars, MobileUI._reveal, HandLogUI 시트, OmniUI 시트가 같은 값을 읽는다).
//   누름: #nb-main 짧게 = Pacer.step()(탭) 또는 Pacer.finish()(시간 속도 공개 중), 길게(500ms, 움직임 10px 이내) = 이번 스트리트 끝까지(Pacer.finish),
//     #nb-skip = Pacer.skipHand()(내 차례나 핸드 끝까지). 포인터 누름은 이 바에서 시작한 pointerdown이 있어야 센다(바가 바뀐 순간 남은 손끝 무시),
//     바가 나타난 뒤 APPEAR_MS 안의 누름도 무시(앞 바에서 이어진 연타). 키보드 click(detail 0)은 바로 센다.
//   연타 보호(결정 66): 이 바로 넘긴 걸음이 내 차례에 닿으면 Pacer가 armGuard(450, ⏭ 600)로 액션바 탭을 삼키고, 비동기(보드 딜 뒤 내 차례)로 닿아도
//     'hand:phase' hero에서 최근 누름이 있으면 여기서 세운다. 결과바가 최근 누름 뒤에 뜨면 결과바 탭도 같은 시간 삼킨다(▶ 다음 핸드 연타로 결과를 못 보는 일 방지).
// API(이름과 인자 고정): init(), update(w) → 바꿨으면 true, state() → { visible, kind, label, idle }, labelFor(w) → { html, sub, aria } | null,
//   short() → 320 폭 짧은 글을 쓰는가. 테스트용 _setEnv({ doc, now, raf, setTimeout, clearTimeout, width, pointer }), _onPhase(p), _press(how), _reset().
// 규약: 로드 때 DOM, localStorage 접근 없음(전부 typeof 가드). 가운뎃점과 긴줄표 없음.
var NextBar = (function() {
  var BARS = ['action-bar', 'next-bar', 'result-actions-bar'];
  var HOLD_MS = 500, HOLD_MOVE = 10, APPEAR_MS = 250, RECENT_MS = 1200, SHORT_W = 340;
  var LABEL = {
    deal: '카드를 나눠요', skipping: '⏭ 빠르게 넘기는 중', end: '결과를 보여 줘요',
    timed: '⏩ 빨리 넘기기', timedSub: '상대 행동 보는 중', tail: '▶ 결과 보기'
  };

  var _env = {};
  var _phase = 'none', _w = null, _inited = false, _vis = false, _shownAt = 0, _tok = null, _holdT = null;
  var _last = { t: -1e9, skip: false }, _resGuard = 0, _resT = null, _resWas = false, _html = '';

  function _doc() {
    if (_env.doc) return _env.doc;
    return (typeof document !== 'undefined' && document && typeof document.getElementById === 'function') ? document : null;
  }
  function _now() {
    if (typeof _env.now === 'function') return _env.now();
    try { if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') return performance.now(); } catch (e) { /* noop */ }
    return Date.now();
  }
  function _setT(fn, ms) { var f = _env.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null); return f ? f(fn, ms) : null; }
  function _clearT(id) { var f = _env.clearTimeout || (typeof clearTimeout === 'function' ? clearTimeout : null); if (f && id != null) f(id); }
  function _raf(fn) {
    var r = _env.raf || ((typeof window !== 'undefined' && window && typeof window.requestAnimationFrame === 'function') ? window.requestAnimationFrame.bind(window) : null);
    if (r) r(fn); else fn();
  }
  function _P() { return (typeof Pacer !== 'undefined' && Pacer) ? Pacer : null; }
  function _call(o, fn) { try { return (o && typeof o[fn] === 'function') ? o[fn].apply(o, Array.prototype.slice.call(arguments, 2)) : undefined; } catch (e) { return undefined; } }
  function _el(id) { var d = _doc(); return d ? d.getElementById(id) : null; }

  // 320 폭 짧은 글(설계 1.5절 9번, 2.5절 6번). 폭은 init과 resize 때만 읽어 둔다: window.innerWidth 읽기는 막 고친 DOM의 스타일과 레이아웃을
  //   강제해(412x915, CPU 4배 실측: 결정 동기 블록 p90 65ms 중 대부분이 여기) 결정 동기 블록 안에서 읽지 않는다
  var _width = null;
  function _readWidth() { try { _width = (typeof window !== 'undefined' && window && window.innerWidth) || 0; } catch (e) { _width = 0; } return _width; }
  function short() {
    var w = _env.width != null ? _env.width : (_width != null ? _width : _readWidth());
    return w > 0 && w <= SHORT_W;
  }
  // 결과바가 보이는가(app.js가 인라인 display flex로 띄운다)
  function _resultShown() {
    var r = _el('result-actions-bar');
    return !!(r && r.style && r.style.display && r.style.display !== 'none');
  }

  // 대기 정보 → 라벨. Pacer.labelFor(2.5절 표)를 쓰고, 그 밖의 바 상태(시간 속도, 딜, tail, 끝)는 여기서
  function labelFor(w) {
    if (!w) return null;
    var P = _P(), sh = short();
    if (w.kind === 'timed') return { html: LABEL.timed, sub: sh ? '' : LABEL.timedSub, aria: '상대 행동 빨리 넘기기' };
    if (w.kind === 'tail') return { html: LABEL.tail, sub: '', aria: '결과 보기' };
    if (w.kind === 'deal') return { html: LABEL.deal, sub: '', aria: LABEL.deal };
    if (w.kind === 'skipping') return { html: LABEL.skipping, sub: '', aria: '핸드 끝까지 빠르게 넘기는 중' };
    if (w.kind === 'end') return { html: LABEL.end, sub: '', aria: LABEL.end };
    var lab = (P && typeof P.labelFor === 'function') ? _call(P, 'labelFor', w, { short: sh }) : null;
    if (!lab) return null;
    return { html: lab.html || '', sub: lab.sub || '', aria: lab.aria || '' };
  }

  // 상태 기계(설계 1.2절 3번): → { visible, kind, label, idle, skip(⏭ 누를 수 있나) }
  function state() {
    var P = _P();
    if (_phase === 'wait') {
      var w = P ? _call(P, 'waiting') : _w;
      if (w) return { visible: true, kind: w.kind || 'seat', label: labelFor(w), idle: false, skip: true };
      if (P && _call(P, 'busy')) {
        if (_call(P, 'mode') === 'timed') return { visible: true, kind: 'timed', label: labelFor({ kind: 'timed' }), idle: false, skip: true };
        return { visible: true, kind: 'tail', label: labelFor({ kind: 'tail' }), idle: false, skip: true };
      }
      var sk = !!(P && _call(P, 'skipping'));
      return { visible: true, kind: sk ? 'skipping' : 'deal', label: labelFor({ kind: sk ? 'skipping' : 'deal' }), idle: true, skip: !sk };
    }
    if (_phase === 'end' && !_resultShown()) return { visible: true, kind: 'end', label: labelFor({ kind: 'end' }), idle: true, skip: false };
    return { visible: false, kind: _phase, label: null, idle: true, skip: false };
  }

  // 그리기: 하단 슬롯 표시, 라벨(바뀔 때만 innerHTML), disabled, 포커스(rAF), 시트 바닥 다시 맞추기. → 바꿨으면 true
  function update(w) {
    if (arguments.length) _w = w || null;
    var d = _doc(), bar = d ? d.getElementById('next-bar') : null;
    if (!bar) return false;
    var s = state(), changed = false, sg = d.getElementById('screen-game');
    if (sg && sg.classList) sg.classList.toggle('nb-on', s.visible);
    if (sg && sg.setAttribute) sg.setAttribute('data-phase', _phase);
    var want = s.visible ? '' : 'none';
    if (bar.style.display !== want) { bar.style.display = want; changed = true; }
    _resultGuard();
    if (!s.visible) {
      if (_vis) { _vis = false; _cancelHold(); _replace(); }
      return changed;
    }
    var main = d.getElementById('nb-main'), skip = d.getElementById('nb-skip');
    var lab = s.label || { html: '', sub: '', aria: '' };
    var html = lab.html + '|' + lab.sub;
    if (main) {
      var tx = main.querySelector ? main.querySelector('.nb-text') : null, lf = main.querySelector ? main.querySelector('.nb-left') : null;
      if (html !== _html) {
        _html = html;
        var sp = _split(lab.html), ic = main.querySelector ? main.querySelector('.nb-ic') : null;
        if (ic) ic.textContent = sp.icon;
        if (tx) tx.innerHTML = ic ? sp.text : lab.html; else main.innerHTML = lab.html;
        if (lf) lf.textContent = lab.sub || '';
        changed = true;
      }
      if (main.setAttribute) { main.setAttribute('aria-label', lab.aria || ''); main.setAttribute('aria-disabled', s.idle ? 'true' : 'false'); }
      _setDisabled(main, !!s.idle);
      if (main.classList) { main.classList.toggle('nb-sub-on', !!lab.sub); main.classList.toggle('nb-sub-long', String(lab.sub || '').length > 8); }   // 긴 작은 글(쇼다운 안내)은 주 글 아래 둘째 줄
    }
    if (skip) { if (skip.disabled !== !s.skip) skip.disabled = !s.skip; if (skip.setAttribute) skip.setAttribute('aria-disabled', s.skip ? 'false' : 'true'); }
    if (bar.classList) { bar.classList.toggle('nb-idle', !!s.idle); bar.classList.toggle('nb-timed', s.kind === 'timed'); bar.classList.toggle('nb-gate', s.kind === 'street' || s.kind === 'showdown'); }
    if (!_vis) {
      _vis = true; _shownAt = _now(); _tok = null; changed = true;
      _replace();
      _focusLater(main);
    }
    return changed;
  }
  // (n4 검증) 주 버튼 disabled. 켜는 쪽은 다음 프레임에 쓴다: 크롬은 disabled를 켤 때 스타일을 강제로 다시 계산해(412x915, CPU 4배 실측:
  //   다음 바 갱신 p90 13ms, 탭 1걸음 p90 30ms 중 대부분이 공개 끝 'deal' 전환의 이 쓰기) 걸음 동기 블록이 길어진다. 그 틈의 누름은 _press가
  //   idle로 거절하고(_onDown도 같은 판정), aria-disabled는 바로 쓴다. 끄는 쪽(누를 수 있게)은 바로 쓴다. 같은 값이면 쓰지 않는다
  var _disWant = false;
  function _setDisabled(main, dis) {
    _disWant = dis;
    if (!dis) { if (main.disabled) main.disabled = false; return; }
    if (main.disabled) return;
    _raf(function() { var m = _el('nb-main'); if (_disWant && m && !m.disabled) m.disabled = true; });
  }
  // 라벨 앞 아이콘(▶, ⏩, ⏭)을 떼어 왼쪽 금색 아이콘 칸(.nb-ic)에 둔다(설계 1.2절 2번). 아이콘이 없는 글(카드를 나눠요)은 칸을 비운다
  function _split(html) {
    var m = /^(▶|⏩|⏭)\s*/.exec(String(html || ''));
    return m ? { icon: m[1], text: String(html).slice(m[0].length) } : { icon: '', text: String(html || '') };
  }
  // 바가 나타나거나 사라지면 열린 기록 시트와 더 보기 시트의 바닥을 다시 맞춘다(차트 시트는 GtoChart가 스타일 변화를 지켜본다)
  function _replace() {
    _call(typeof HandLogUI !== 'undefined' ? HandLogUI : null, 'place');
    _call(typeof MobileUI !== 'undefined' ? MobileUI : null, 'placeMore');
  }
  // 포커스: 다음 프레임에(결정 58, 동기 블록 안 focus 금지). 포커스가 몸통, 방금 누른 액션바나 결과바, 이 바 안에 있을 때만 옮긴다
  function _focusLater(main) {
    if (!main || typeof main.focus !== 'function') return;
    _raf(function() {
      try {
        var d = _doc(), bar = d && d.getElementById('next-bar');
        if (!bar || bar.style.display === 'none' || main.disabled) return;
        var ae = d.activeElement;
        if (ae === main) return;
        var free = !ae || ae === d.body || (typeof ae.closest === 'function' && ae.closest('#action-bar, #result-actions-bar, #next-bar'));
        if (free) main.focus({ preventScroll: true });
      } catch (e) { /* noop */ }
    });
  }

  // ── 누름 ──
  function _vibrate() {
    try {
      var on = (typeof A11y !== 'undefined' && A11y && typeof A11y.load === 'function') ? A11y.load().vibrate : false;
      if (on && typeof navigator !== 'undefined' && navigator && typeof navigator.vibrate === 'function') navigator.vibrate(20);
    } catch (e) { /* noop */ }
  }
  // how = 'step'(짧게) | 'finish'(길게, 이번 스트리트 끝까지) | 'skip'(⏭). → Pacer에 넘겼으면 true
  function _press(how) {
    var P = _P(), s = state();
    if (!P || !s.visible) return false;
    if (how === 'skip') {
      if (!s.skip) return false;
      _last = { t: _now(), skip: true };
      _call(P, 'skipHand');
    } else {
      if (s.idle) return false;
      _last = { t: _now(), skip: false };
      if (how === 'finish' || _call(P, 'mode') === 'timed') _call(P, 'finish'); else _call(P, 'step');
    }
    update();
    return true;
  }
  function _cancelHold() {
    _clearT(_holdT); _holdT = null;
    var m = _el('nb-main');
    if (m && m.classList) m.classList.remove('nb-hold');
  }
  function _xy(e) { var t = (e && e.touches && e.touches[0]) || (e && e.changedTouches && e.changedTouches[0]) || e || {}; return { x: Number(t.clientX) || 0, y: Number(t.clientY) || 0 }; }
  function _onDown(e) {
    var m = _el('nb-main');
    if (!m || m.disabled || _disWant) { _tok = null; return; }
    var p = _xy(e);
    _tok = { x: p.x, y: p.y, t: _now(), shown: _shownAt, held: false, moved: false };
    var tok = _tok;
    _cancelHold();
    var reduce = false;
    try { reduce = !!(typeof A11y !== 'undefined' && A11y && typeof A11y.reduced === 'function' && A11y.reduced()); } catch (x) { reduce = false; }
    if (m.classList && !reduce) m.classList.add('nb-hold');
    _holdT = _setT(function() {
      _holdT = null;
      if (_tok !== tok || tok.moved) return;
      tok.held = true;
      if (m.classList) m.classList.remove('nb-hold');
      _vibrate();
      _press('finish');
    }, HOLD_MS);
  }
  function _onMove(e) {
    if (!_tok) return;
    var p = _xy(e);
    if (Math.abs(p.x - _tok.x) > HOLD_MOVE || Math.abs(p.y - _tok.y) > HOLD_MOVE) { _tok.moved = true; _cancelHold(); }
  }
  function _onUp() { _clearT(_holdT); _holdT = null; var m = _el('nb-main'); if (m && m.classList) m.classList.remove('nb-hold'); }
  function _onCancel() { _cancelHold(); if (_tok) _tok.moved = true; }
  // click 판정(순수에 가까움): 키보드(detail 0)는 센다. 포인터는 이 바에서 시작한 누름이고, 길게 누르기나 끌기가 아니고, 바가 그대로이고, 나타난 뒤 APPEAR_MS가 지났을 때
  function _clickOk(e, tok) {
    var ptr = _env.pointer != null ? !!_env.pointer : (typeof document !== 'undefined' && document && ('onpointerdown' in document));
    if (e && e.detail === 0) return true;
    if (!ptr) return _now() - _shownAt >= APPEAR_MS;
    if (!tok || tok.held || tok.moved || tok.shown !== _shownAt) return false;
    return tok.t - _shownAt >= APPEAR_MS;
  }
  function _onMainClick(e) {
    var tok = _tok;
    _tok = null;
    if (e && typeof e.preventDefault === 'function' && tok && tok.held) e.preventDefault();
    if (!_clickOk(e, tok)) return false;
    return _press('step');
  }
  function _onSkipClick(e) {
    if (!(e && e.detail === 0) && _now() - _shownAt < APPEAR_MS) return false;
    return _press('skip');
  }

  // ── 연타 보호(결정 66) ──
  function _recent() { return _now() - _last.t <= RECENT_MS; }
  function _guardMs() {
    var P = _P(), T = (P && P.TAP) || {};
    return _last.skip ? (T.skipGuardMs || 600) : (T.guardMs || 450);
  }
  // 결과바가 막 나타났고 최근 이 바를 눌렀으면 결과바 탭을 잠깐 삼킨다(.guard로 흐림)
  function _resultGuard() {
    var shown = _resultShown();
    if (shown && !_resWas && _recent()) {
      var ms = _guardMs(), r = _el('result-actions-bar');
      _resGuard = _now() + ms;
      if (r && r.classList) r.classList.add('guard');
      _clearT(_resT);
      _resT = _setT(function() { _resT = null; var rb = _el('result-actions-bar'); if (rb && rb.classList) rb.classList.remove('guard'); }, ms);
    }
    _resWas = shown;
  }
  function _swallowResult(e) {
    if (!(_resGuard > _now())) return false;
    var t = e && e.target;
    if (!(t && typeof t.closest === 'function' && t.closest('#result-actions-bar'))) return false;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    return true;
  }
  // 'hand:phase' 처리. hero로 바뀌었는데 최근 이 바를 눌렀으면(보드 딜 뒤 비동기로 내 차례가 온 경우) 액션바 탭을 삼킨다
  function _onPhase(p) {
    var prev = _phase;
    _phase = p || 'none';
    if (_phase === 'hero' && prev !== 'hero' && _recent()) _call(_P(), 'armGuard', _guardMs());
    if (_phase === 'none') { _resWas = false; }
    update();
    return _phase;
  }

  function init() {
    if (_inited) return false;
    var d = _doc();
    if (!d || typeof d.addEventListener !== 'function') return false;
    _inited = true;
    _readWidth();
    if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') window.addEventListener('resize', function() { _readWidth(); _html = ''; update(); });
    d.addEventListener('hand:phase', function(e) { _onPhase(e && e.detail && e.detail.phase); });
    d.addEventListener('click', _swallowResult, true);
    var m = d.getElementById('nb-main'), k = d.getElementById('nb-skip'), bar = d.getElementById('next-bar');
    if (m && typeof m.addEventListener === 'function') {
      m.addEventListener('pointerdown', _onDown);
      m.addEventListener('pointermove', _onMove);
      m.addEventListener('pointerup', _onUp);
      m.addEventListener('pointercancel', _onCancel);
      m.addEventListener('click', _onMainClick);
    }
    if (k && typeof k.addEventListener === 'function') k.addEventListener('click', _onSkipClick);
    if (bar && typeof bar.addEventListener === 'function') bar.addEventListener('contextmenu', function(e) { if (e && typeof e.preventDefault === 'function') e.preventDefault(); });
    update();
    return true;
  }
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    if (typeof document !== 'undefined' && document && document.readyState && document.readyState !== 'loading') init();
    else window.addEventListener('DOMContentLoaded', function() { init(); });
  }

  function _setEnv(o) { _env = o ? Object.assign({}, _env, o) : {}; return _env; }
  function _reset() {
    _phase = 'none'; _w = null; _vis = false; _shownAt = 0; _tok = null; _disWant = false; _cancelHold(); _last = { t: -1e9, skip: false };
    _resGuard = 0; _clearT(_resT); _resT = null; _resWas = false; _html = ''; _inited = false;
  }

  return { BARS: BARS, HOLD_MS: HOLD_MS, HOLD_MOVE: HOLD_MOVE, APPEAR_MS: APPEAR_MS, RECENT_MS: RECENT_MS, LABEL: LABEL,
    init: init, update: update, state: state, labelFor: labelFor, short: short, phase: function() { return _phase; },
    _setEnv: _setEnv, _onPhase: _onPhase, _press: _press, _reset: _reset, _clickOk: _clickOk,
    _split: _split, _onDown: _onDown, _onMove: _onMove, _onUp: _onUp, _onMainClick: _onMainClick, _onSkipClick: _onSkipClick, _swallowResult: _swallowResult };
})();
