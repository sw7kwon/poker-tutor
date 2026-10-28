// ui/sheet-gesture.js (n4-P0 완성본, 설계 docs/NEXT4_DESIGN.md 1.4절 4번, 결정 61)
// 하단 시트 공용 끌기 도우미 SheetGesture. 머리줄(handleEl)에서 시작한 세로 끌기만 받는다(본문 스크롤과 충돌하지 않게).
//   bind(root, handleEl, { onClose, onOpen, onTap, isPeek, peekPx }):
//     끌리는 동안 root에 transform translateY(dy)(접힌 시트는 calc(100% - peekPx + dy)), 손을 떼면 decide()로 판정한다.
//     열린 시트: dy ≥ 72px 또는 속도 ≥ 0.5px/ms(마지막 80ms 기준)면 onClose, 아니면 제자리.
//     접힌 시트(isPeek()가 참): 위로 72px 또는 -0.5px/ms면 onOpen. 6px 넘게 움직이지 않은 누름은 onTap.
//     키보드 Enter, Space(click, detail 0)도 onTap. 마우스 클릭은 pointerup이 이미 처리해 두 번 세지 않는다.
//     움직임 줄이기(html.reduce-motion)면 끌리는 동안 변환 없이 손을 뗄 때 바로 판정만 한다.
//   decide({ dy, v, moved, peek }) → 'tap' | 'close' | 'open' | 'stay'(순수, 테스트용), velocity(samples) → px/ms(순수).
// 규약: 로드 때 DOM 접근 없음(전부 typeof 가드). 가운뎃점과 긴줄표 없음.
var SheetGesture = (function() {
  var CLOSE_PX = 72, CLOSE_V = 0.5, V_WINDOW = 80, MOVE_PX = 6, PEEK_PX = 48;

  function decide(g) {
    g = g || {};
    if (!g.moved) return 'tap';
    var dy = Number(g.dy) || 0, v = Number(g.v) || 0;
    if (!g.peek) return (dy >= CLOSE_PX || v >= CLOSE_V) ? 'close' : 'stay';
    return (dy <= -CLOSE_PX || v <= -CLOSE_V) ? 'open' : 'stay';
  }
  // samples = [{ y, t }] 시간순. 마지막 점과 80ms 안의 가장 이른 점 사이 속도(아래가 +)
  function velocity(samples) {
    if (!samples || samples.length < 2) return 0;
    var last = samples[samples.length - 1], first = last;
    for (var i = samples.length - 1; i >= 0; i--) { if (last.t - samples[i].t > V_WINDOW) break; first = samples[i]; }
    var dt = last.t - first.t;
    return dt > 0 ? (last.y - first.y) / dt : 0;
  }
  function _now(e) {
    if (e && typeof e.timeStamp === 'number' && e.timeStamp > 0) return e.timeStamp;
    try { if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') return performance.now(); } catch (x) { /* noop */ }
    return Date.now();
  }
  function _y(e) {
    if (!e) return 0;
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    return t ? t.clientY : (Number(e.clientY) || 0);
  }
  function _reduced() {
    try {
      var de = typeof document !== 'undefined' && document && document.documentElement;
      return !!(de && de.classList && typeof de.classList.contains === 'function' && de.classList.contains('reduce-motion'));
    } catch (e) { return false; }
  }
  function bind(root, handleEl, o) {
    if (!root || !handleEl || typeof handleEl.addEventListener !== 'function' || handleEl.__sheetGesture) return false;
    handleEl.__sheetGesture = true;
    o = o || {};
    var peekPx = o.peekPx || PEEK_PX, st = null;
    function isPeek() { try { return typeof o.isPeek === 'function' ? !!o.isPeek() : false; } catch (e) { return false; } }
    function call(fn) { if (typeof fn === 'function') { try { fn(); } catch (e) { if (typeof console !== 'undefined' && console.error) console.error('[SheetGesture]', e); } } }
    function setT(v) { if (root.style) root.style.transform = v; }
    function down(e) {
      st = { y0: _y(e), dy: 0, moved: false, peek: isPeek(), samples: [{ y: _y(e), t: _now(e) }] };
      if (root.classList) root.classList.add('dragging');
    }
    function move(e) {
      if (!st) return;
      var y = _y(e);
      st.dy = y - st.y0;
      st.samples.push({ y: y, t: _now(e) });
      if (st.samples.length > 12) st.samples.shift();
      if (Math.abs(st.dy) > MOVE_PX) st.moved = true;
      if (!_reduced()) {
        if (!st.peek && st.dy > 0) setT('translateY(' + st.dy + 'px)');
        else if (st.peek && st.dy < 0) setT('translateY(calc(100% - ' + peekPx + 'px + ' + st.dy + 'px))');
      }
      if (st.moved && e && e.cancelable && typeof e.preventDefault === 'function') e.preventDefault();
    }
    function up(e) {
      if (!st) return null;
      var hasY = !!(e && ((e.changedTouches && e.changedTouches[0]) || typeof e.clientY === 'number'));
      if (hasY) {   // 뗀 자리도 표본에 넣는다(마지막 move 뒤 움직임)
        var y = _y(e);
        st.dy = y - st.y0;
        st.samples.push({ y: y, t: _now(e) });
        if (Math.abs(st.dy) > MOVE_PX) st.moved = true;
      }
      var res = decide({ dy: st.dy, v: velocity(st.samples), moved: st.moved, peek: st.peek });
      st = null;
      if (root.classList) root.classList.remove('dragging');
      setT('');
      if (res === 'tap') call(o.onTap);
      else if (res === 'close') call(o.onClose);
      else if (res === 'open') call(o.onOpen);
      return res;
    }
    var pointer = typeof document !== 'undefined' && document && ('onpointerdown' in document);
    if (pointer) {
      handleEl.addEventListener('pointerdown', function(e) { down(e); try { handleEl.setPointerCapture(e.pointerId); } catch (x) { /* noop */ } });
      handleEl.addEventListener('pointermove', move);
      handleEl.addEventListener('pointerup', up);
      handleEl.addEventListener('pointercancel', function() { st = null; if (root.classList) root.classList.remove('dragging'); setT(''); });
      // (n4 검증) pointermove의 preventDefault는 브라우저 제스처(스크롤, 플링)를 막지 못한다. 머리줄을 빠르게 튕겨 닫으면(1px/ms 넘게) 크롬이 플링을 만들고
      //   그다음 누름 1번(다른 버튼도)을 플링 멈춤으로 먹어(412x915 실측: 더 보기 시트나 좌석 시트를 튕겨 닫은 뒤 ⋯ 더 보기 첫 누름이 무반응) touchmove도 취소한다
      handleEl.addEventListener('touchmove', function(e) { if (st && e && e.cancelable && typeof e.preventDefault === 'function') e.preventDefault(); }, { passive: false });
    } else {
      handleEl.addEventListener('touchstart', down, { passive: true });
      handleEl.addEventListener('touchmove', move, { passive: false });
      handleEl.addEventListener('touchend', up);
    }
    // 터치 뒤 따라오는 합성 click은 막고(touchend 기본 동작 취소), 키보드 click(detail 0)만 누름으로 센다
    handleEl.addEventListener('touchend', function(e) { if (e && e.cancelable && typeof e.preventDefault === 'function') e.preventDefault(); }, { passive: false });
    handleEl.addEventListener('click', function(e) { if (e && e.detail === 0) call(o.onTap); });
    return true;
  }

  return { CLOSE_PX: CLOSE_PX, CLOSE_V: CLOSE_V, V_WINDOW: V_WINDOW, MOVE_PX: MOVE_PX, PEEK_PX: PEEK_PX, bind: bind, decide: decide, velocity: velocity };
})();
