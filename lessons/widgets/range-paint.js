// lessons/widgets/range-paint.js (채우는 그룹: M6-PAINT, 이름 rangePaint)
// 레슨 위젯(레인지 색칠, 확대 모드 드래그와 겹침). 계약 H1(docs/JOURNEY_ROADMAP.md M6): LessonWidgets.rangePaint = { html(params) → 순수 문자열(node 안전),
//   mount?(el, params, api{note(kind, data), toast(msg)}), unmount?() }. LessonPlayer가 .lp-widget[data-nogesture]로 감싸 그린다.
//   params = { spot(Puzzles.get('rangepaint')._.PAINT_SPOTS 중 하나, 차트가 있는 다른 스팟도 된다), goal?(기본 0.7),
//     chip?(false면 머리의 '이 앱 차트 기준' 칩을 뺀다: 장면 calc 칩이 같은 라벨을 이미 보일 때) }.
//   스팟이 틀리거나 채점기(gen-range rangepaint)가 없으면 html은 '' → 플레이어가 '다음 업데이트' 카드를 그린다.
//
// 이 파일은 색칠 화면의 공용 부품 RangePaint도 만든다(퍼즐 화면 PuzzleUI의 rangepaint 문항이 같은 부품을 쓴다, 계약 H2).
//   격자 = 13x13(gto-chart.js와 같은 순서: 대각선 페어, 위 오른쪽 수딧, 아래 왼쪽 오프수트). 작은 칸(약 27px)은 손가락에 작아서
//   (설계서 5.9절 6번) 칸을 누르면 그 줄이 아래 '크게 보기' 줄(칸 44px 이상)로 열리고, 크게 본 줄에서 손가락으로 끌어 칠한다.
//   끌기 시작한 칸이 빈칸이면 칠하기, 칠한 칸이면 지우기로 정해지고 끄는 동안 지나간 칸에 같은 동작을 한 번씩 한다.
//   크게 보기 줄은 touch-action: none(css/puzzle.css)이라 끄는 동안 화면이 스크롤되지 않고, 루트에 data-nogesture가 있어
//   레슨 스와이프로 새지 않는다. 키보드는 ▲▼(줄 이동)와 크게 보기 칸 버튼(Enter, Space로 한 칸씩)으로 같은 일을 한다.
//   겹침 = Puzzles.get('rangepaint').score(spot, cells) 그대로(Jaccard, 같이 칠한 칸 ÷ 둘 중 하나라도 칠한 칸).
//   채점 상세 = .check(q, cells)의 missing(놓친 칸), extra(넘친 칸). 표시 %는 내림(69.6%는 69%, 통과 기준과 어긋나지 않게).
//
// RangePaint API(전부 typeof 가드, 로드 시 DOM 접근 없음)
//   ready() → bool: 채점기(gen-range rangepaint의 score, check, target)가 있는지
//   create(spot, {goal?, row?}) → 상태 st | null(스팟 틀림). st = {spot, goal, label, on{칸:true}, row, drag, graded}
//   label(r, c), rcOf(label), weight(label)(페어 6, 수딧 4, 오프 12), cells(st), count(st) → {n, combos, pct}
//   setCell(st, l, on) → 바뀌었는지, toggle(st, l), setCells(st, list), clear(st), setRow(st, r), moveRow(st, d)
//   dragStart(st, l) → 바뀐 칸 [], dragOver(st, l) → 바뀐 칸 [], dragEnd(st): 순수 상태기계(같은 끌기에서 칸마다 한 번)
//   grade(st) → {score, pct, ok, goal, missing[], extra[], hit} | null, pct(score) → 정수 %(내림)
//   html(st, {ctx:'lesson'|'puzzle', head?, acts?, hint?}) → 순수 문자열, resultHTML(spot, chk{score, ok, goal}, cells, {score?, note?, listMax?}) → 채점 격자
//   레슨 장면은 높이가 55vh라(lesson-player .lp-scene) 레슨용은 작은 격자를 240px로 줄이고 안내 한 줄, 채점 화면은 정의 줄 대신 title
//   bind(el, ctl{state(), render(), action(name)?, changed?(what), hit?(x, y)}) → 해제 함수. el 아래 위임 이벤트.
//     state()가 null이면 칠하기를 받지 않는다(채점 뒤 등). hit은 테스트용(좌표 → 칸 이름), 기본은 document.elementFromPoint.
var LessonWidgets = (typeof LessonWidgets !== 'undefined' && LessonWidgets) ? LessonWidgets : {};
var RangePaint = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  var GOAL = 0.7;
  var LIST_MAX = 14;           // 놓친 칸, 넘친 칸 목록에 이름으로 보이는 최대 칸 수
  var CHART_FULL = '이 앱의 차트 기준(입문용, 표준보다 UTG/HJ/CO가 2~8%p 타이트, SB RFI 32.1%와 vs3bet 표도 타이트)';
  var RI = {};
  RANKS.forEach(function(r, i) { RI[r] = i; });

  // ── 작은 도구 ─────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function _rk(r) { return RANKS[r] === 'T' ? 'T(10)' : RANKS[r]; }
  function label(r, c) {
    if (r === c) return RANKS[r] + RANKS[r];
    if (r < c) return RANKS[r] + RANKS[c] + 's';
    return RANKS[c] + RANKS[r] + 'o';
  }
  // 칸 이름 → {r, c} | null
  function rcOf(l) {
    l = String(l == null ? '' : l);
    var a = RI[l.charAt(0)], b = RI[l.charAt(1)];
    if (a === undefined || b === undefined) return null;
    if (l.length === 2) return a === b ? { r: a, c: a } : null;
    if (l.length !== 3 || a >= b) return null;
    if (l.charAt(2) === 's') return { r: a, c: b };
    if (l.charAt(2) === 'o') return { r: b, c: a };
    return null;
  }
  function _ok(l) { return typeof l === 'string' && !!rcOf(l); }
  function weight(l) { return l.length === 2 ? 6 : (l.charAt(2) === 's' ? 4 : 12); }
  function pct(score) { return Math.max(0, Math.min(100, Math.floor(_num(score, 0) * 100 + 1e-9))); }
  function _gen() {
    var P = G.Puzzles;
    if (!P || typeof P.get !== 'function') return null;
    var g = null;
    try { g = P.get('rangepaint'); } catch (e) { g = null; }
    return (g && typeof g.score === 'function' && typeof g.check === 'function' && typeof g.target === 'function') ? g : null;
  }
  function ready() {
    var g = _gen();
    if (!g) return false;
    if (typeof g.ready !== 'function') return true;
    try { return !!g.ready(); } catch (e) { return false; }
  }
  function _target(spot) {
    var g = _gen();
    if (!g || typeof spot !== 'string' || !spot) return null;
    try { var t = g.target(spot); return (t && t.length) ? t : null; } catch (e) { return null; }
  }
  function spotLabel(spot) {
    var g = _gen();
    if (g && typeof g.spotLabel === 'function') { try { var s = g.spotLabel(spot); if (s) return String(s); } catch (e) { /* 아래 */ } }
    return String(spot || '');
  }
  function _chartFull() {
    var P = G.Puzzles;
    return (P && P.LABEL_TEXT && P.LABEL_TEXT.chart) ? String(P.LABEL_TEXT.chart) : CHART_FULL;
  }

  // ── 상태(순수) ─────────────────────────────────────────
  function create(spot, opts) {
    opts = opts || {};
    if (!ready() || !_target(spot)) return null;
    var goal = _num(opts.goal, GOAL);
    if (!(goal > 0 && goal <= 1)) goal = GOAL;
    var row = Math.floor(_num(opts.row, 0));
    return { spot: spot, goal: goal, label: spotLabel(spot), on: {}, row: (row >= 0 && row <= 12) ? row : 0, drag: null, graded: null };
  }
  function cells(st) {
    var out = [];
    if (!st) return out;
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) { var l = label(r, c); if (st.on[l]) out.push(l); }
    return out;
  }
  function count(st) {
    var list = cells(st), combos = 0;
    list.forEach(function(l) { combos += weight(l); });
    return { n: list.length, combos: combos, pct: Math.round(combos * 1000 / 1326) / 10 };
  }
  function countText(st) {
    var k = count(st);
    if (!k.n) return '아직 칠한 칸이 없어요';
    return '칠한 칸 ' + k.n + '개, ' + k.combos + '콤보(전체의 약 ' + k.pct + '%)';
  }
  function setCell(st, l, on) {
    if (!st || !_ok(l)) return false;
    var cur = !!st.on[l];
    if (cur === !!on) return false;
    if (on) st.on[l] = true; else delete st.on[l];
    st.armed = false;
    return true;
  }
  function toggle(st, l) { return !!st && setCell(st, l, !st.on[l]); }
  function clear(st) { if (!st) return false; var had = cells(st).length > 0; st.on = {}; st.graded = null; st.armed = false; return had; }
  function setCells(st, list) {
    if (!st) return 0;
    st.on = {};
    (Array.isArray(list) ? list : []).forEach(function(l) { if (_ok(l)) st.on[l] = true; });
    return cells(st).length;
  }
  function setRow(st, r) {
    if (!st) return false;
    r = Math.floor(_num(r, NaN));
    if (!(r >= 0 && r <= 12) || r === st.row) return false;
    st.row = r;
    return true;
  }
  function moveRow(st, d) { return !!st && setRow(st, st.row + (d < 0 ? -1 : 1)); }
  function dragStart(st, l) {
    if (!st || !_ok(l)) return [];
    st.drag = { mode: st.on[l] ? 'erase' : 'paint', seen: {} };
    return dragOver(st, l);
  }
  function dragOver(st, l) {
    if (!st || !st.drag || !_ok(l) || st.drag.seen[l]) return [];
    st.drag.seen[l] = true;
    return setCell(st, l, st.drag.mode === 'paint') ? [l] : [];
  }
  function dragEnd(st) { if (st) st.drag = null; }
  function grade(st) {
    var g = _gen();
    if (!st || !g) return null;
    var mine = cells(st), chk = null;
    try { chk = g.check({ data: { spot: st.spot, overlap: st.goal } }, mine); } catch (e) { chk = null; }
    if (!chk || !isFinite(chk.score)) return null;
    var res = { score: chk.score, pct: pct(chk.score), ok: chk.score >= st.goal - 1e-9, goal: st.goal,
      missing: (chk.missing || []).slice(), extra: (chk.extra || []).slice(), hit: mine.length - (chk.extra || []).length };
    st.graded = res;
    return res;
  }

  // ── 그리기(순수 문자열) ─────────────────────────────────
  function chipHTML() {
    return '<span class="rp-chip" title="' + _esc(_chartFull()) + '"><span aria-hidden="true">▦</span> 이 앱 차트 기준</span>';
  }
  function _gridHTML(st) {
    var h = '<div class="rp-grid" aria-hidden="true">';
    for (var r = 0; r < 13; r++) {
      for (var c = 0; c < 13; c++) {
        var l = label(r, c);
        h += '<i class="rp-c' + (r === c ? ' is-p' : '') + (st.on[l] ? ' is-on' : '') + (r === st.row ? ' is-row' : '') +
          '" data-rp="row" data-r="' + r + '" data-c="' + c + '" data-l="' + l + '">' + l + '</i>';
      }
    }
    return h + '</div>';
  }
  function _actsHTML(where) {
    return '<span class="rp-acts rp-acts--' + where + '">' +
      '<button type="button" class="rp-btn" data-rp="act" data-a="clear">지우기</button>' +
      '<button type="button" class="rp-btn rp-btn--go" data-rp="act" data-a="grade">겹침 보기</button></span>';
  }
  function _zoomHTML(st, acts) {
    var r = st.row, rk = _rk(r);
    var h = '<div class="rp-zoom" data-r="' + r + '" role="group" aria-label="' + rk + ' 줄 크게 보기, 끌어서 칠하기">' +
      '<div class="rp-zhead">' +
      '<button type="button" class="rp-nav" data-rp="up" aria-label="위 줄"' + (r === 0 ? ' disabled' : '') + '>▲</button>' +
      '<span class="rp-zt"><b>' + rk + ' 줄</b></span>' +
      '<button type="button" class="rp-nav" data-rp="down" aria-label="아래 줄"' + (r === 12 ? ' disabled' : '') + '>▼</button>' +
      (acts ? _actsHTML('zoom') : '') + '</div><div class="rp-zcells">';
    for (var c = 0; c < 13; c++) {
      var l = label(r, c), on = !!st.on[l];
      h += '<button type="button" class="rp-z' + (r === c ? ' is-p' : '') + (on ? ' is-on' : '') + '" data-rp="z" data-l="' + l +
        '" aria-pressed="' + (on ? 'true' : 'false') + '"><b>' + l + '</b><small aria-hidden="true">' + (on ? '✔' : '') + '</small></button>';
    }
    return h + '</div></div>';
  }
  var HINT = '줄을 누르면 아래에 크게 보여요. 큰 칸을 손가락으로 끌면 칠하고, 칠한 칸에서 시작하면 지워요.';
  var HINT_SHORT = '줄 누르기, 큰 칸 끌어 칠하기(칠한 칸에서 시작하면 지우기)';   // 레슨 장면(높이 55vh)용 한 줄
  function html(st, opts) {
    if (!st) return '';
    opts = opts || {};
    var ctx = opts.ctx === 'puzzle' ? 'puzzle' : 'lesson';
    var head = (opts.head !== false) ? '<div class="rp-head"><b class="rp-title">' + _esc(st.label) + '</b>' + (opts.chip === false ? '' : chipHTML()) + '</div>' : '';
    if (st.graded && ctx === 'lesson') {
      return '<div class="rp rp--' + ctx + ' is-graded" data-nogesture data-spot="' + _esc(st.spot) + '">' + head +
        resultHTML(st.spot, st.graded, cells(st), { score: true, note: false, listMax: 8 }) +
        '<div class="rp-acts rp-acts--end">' +
        '<button type="button" class="rp-btn rp-btn--go" data-rp="act" data-a="again">✏ 이어서 칠하기</button>' +
        '<button type="button" class="rp-btn" data-rp="act" data-a="reset">처음부터</button></div></div>';
    }
    return '<div class="rp rp--' + ctx + '" data-nogesture data-spot="' + _esc(st.spot) + '">' + head +
      _gridHTML(st) + _zoomHTML(st, !!opts.acts) +
      '<div class="rp-count" aria-live="polite">' + _esc(countText(st)) + '</div>' +
      (opts.hint !== false ? '<div class="rp-hint">' + (ctx === 'lesson' ? HINT_SHORT : HINT) + '</div>' : '') + '</div>';
  }
  function _names(list, max) {
    max = max || LIST_MAX;
    if (!list.length) return '없음';
    var shown = list.slice(0, max).join(', ');
    return shown + (list.length > max ? ' 외 ' + (list.length - max) + '칸' : '');
  }
  // 채점 격자: 맞게 칠함(초록 꽉 찬 칸), 놓친 칸(노란 귀퉁이와 테두리), 넘친 칸(빨강 빗금). 색 + 무늬 + 글자(범례) 3중 표시
  function resultHTML(spot, chk, mine, opts) {
    opts = opts || {};
    var tgt = _target(spot);
    if (!tgt || !chk) return '';
    var tset = {}, mset = {};
    tgt.forEach(function(l) { tset[l] = true; });
    (Array.isArray(mine) ? mine : []).forEach(function(l) { if (_ok(l)) mset[l] = true; });
    var hit = 0, miss = 0, extra = 0, cellsH = '';
    for (var r = 0; r < 13; r++) {
      for (var c = 0; c < 13; c++) {
        var l = label(r, c), t = !!tset[l], m = !!mset[l], cls = '';
        if (t && m) { cls = ' is-hit'; hit++; }
        else if (t) { cls = ' is-miss'; miss++; }
        else if (m) { cls = ' is-extra'; extra++; }
        cellsH += '<i class="rp-c' + (r === c ? ' is-p' : '') + cls + '" data-l="' + l + '">' + l + '</i>';
      }
    }
    var p = pct(chk.score), goal = Math.round(_num(chk.goal, GOAL) * 100), ok = !!chk.ok;
    var missList = [], extraList = [];
    for (var r2 = 0; r2 < 13; r2++) for (var c2 = 0; c2 < 13; c2++) {
      var l2 = label(r2, c2);
      if (tset[l2] && !mset[l2]) missList.push(l2);
      else if (!tset[l2] && mset[l2]) extraList.push(l2);
    }
    return '<div class="rp-res">' +
      (opts.score ? '<div class="rp-score ' + (ok ? 'is-ok' : 'is-bad') + '" title="겹침 = 같이 칠한 칸 ÷ 둘 중 하나라도 칠한 칸"><b>' + p + '%</b><span>겹침, 기준 ' + goal + '%' +
        (ok ? ' <em>✔ 통과</em>' : ' <em>✖ 아직</em>') + '</span></div>' : '') +
      '<div class="rp-grid rp-grid--res" role="img" aria-label="채점 격자: 맞게 칠함 ' + hit + '칸, 놓친 칸 ' + miss + '칸, 넘친 칸 ' + extra + '칸">' + cellsH + '</div>' +
      '<div class="rp-legend">' +
      '<span class="rp-lg"><i class="rp-c is-hit" aria-hidden="true"></i>맞게 칠함 ' + hit + '</span>' +
      '<span class="rp-lg"><i class="rp-c is-miss" aria-hidden="true"></i>놓친 칸 ' + miss + '</span>' +
      '<span class="rp-lg"><i class="rp-c is-extra" aria-hidden="true"></i>넘친 칸 ' + extra + '</span></div>' +
      '<div class="rp-lists"><div><b>놓친 칸</b> ' + _esc(_names(missList, opts.listMax)) + '</div><div><b>넘친 칸</b> ' + _esc(_names(extraList, opts.listMax)) + '</div></div>' +
      (opts.note === false ? '' : '<div class="rp-note">겹침 = 같이 칠한 칸 ÷ 둘 중 하나라도 칠한 칸. ' + chipHTML() + '</div>') + '</div>';
  }

  // ── DOM 연결(위임) ─────────────────────────────────────
  function _up(node, root) {
    while (node && node !== root && node.nodeType !== 9) {
      if (node.getAttribute && node.getAttribute('data-rp')) return node;
      node = node.parentNode;
    }
    return null;
  }
  function _hasPointer() { return typeof window !== 'undefined' && !!window && typeof window.PointerEvent !== 'undefined'; }
  function bind(el, ctl) {
    if (!el || typeof el.addEventListener !== 'function' || !ctl || typeof ctl.state !== 'function') return function() {};
    var drag = null;
    function st() { try { return ctl.state() || null; } catch (e) { return null; } }
    function changed(what, list) { if (typeof ctl.changed === 'function') { try { ctl.changed(what, list); } catch (e) { /* 무시 */ } } }
    function render() { if (typeof ctl.render === 'function') { try { ctl.render(); } catch (e) { /* 무시 */ } } }
    function hit(x, y) {
      if (typeof ctl.hit === 'function') return ctl.hit(x, y);
      var doc = el.ownerDocument || (typeof document !== 'undefined' ? document : null);
      if (!doc || typeof doc.elementFromPoint !== 'function') return null;
      var n = _up(doc.elementFromPoint(x, y), el);
      return (n && n.getAttribute('data-rp') === 'z') ? n.getAttribute('data-l') : null;
    }
    // 칸 몇 개만 바뀜: 화면을 다시 그리지 않고 클래스와 글자만 바꾼다(끄는 중 손가락 아래 요소가 바뀌지 않게)
    function paintCells(list) {
      var s = st();
      if (!s || !list || !list.length) return;
      if (typeof el.querySelectorAll === 'function') {
        list.forEach(function(l) {
          var on = !!s.on[l], ns = el.querySelectorAll('[data-l="' + l + '"]') || [];
          for (var i = 0; i < ns.length; i++) {
            var n = ns[i];
            if (n.classList) n.classList.toggle('is-on', on);
            if (n.getAttribute && n.getAttribute('data-rp') === 'z') {
              n.setAttribute('aria-pressed', on ? 'true' : 'false');
              var sm = n.querySelector ? n.querySelector('small') : null;
              if (sm) sm.textContent = on ? '✔' : '';
            }
          }
        });
        var cnt = el.querySelector ? el.querySelector('.rp-count') : null;
        if (cnt) cnt.textContent = countText(s);
      }
      changed('cells', list);
    }
    function onDown(e) {
      if (!e || (e.pointerType === 'mouse' && e.button != null && e.button !== 0)) return;
      var z = _up(e.target, el);
      if (!z || z.getAttribute('data-rp') !== 'z') return;
      var s = st();
      if (!s) return;
      drag = { id: e.pointerId };
      if (e.pointerType === 'mouse' && typeof e.preventDefault === 'function') e.preventDefault();   // 끄는 동안 글자 선택 막기
      try { if (typeof el.setPointerCapture === 'function' && e.pointerId != null) el.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
      paintCells(dragStart(s, z.getAttribute('data-l')));
    }
    function onMove(e) {
      if (!drag || !e || e.pointerId !== drag.id) return;
      var s = st();
      if (!s || !s.drag) { drag = null; return; }
      if (e.pointerType === 'mouse' && e.buttons === 0) { onEnd(e); return; }
      var l = hit(e.clientX, e.clientY);
      if (l) paintCells(dragOver(s, l));
      if (e.cancelable && typeof e.preventDefault === 'function') e.preventDefault();
    }
    function onEnd(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var s = st();
      if (s) dragEnd(s);
      try { if (typeof el.releasePointerCapture === 'function' && drag.id != null) el.releasePointerCapture(drag.id); } catch (x) { /* 무시 */ }
      drag = null;
      changed('end');
    }
    function onClick(e) {
      var t = _up(e && e.target, el);
      if (!t) return;
      var kind = t.getAttribute('data-rp');
      if (kind === 'act') { if (typeof ctl.action === 'function') ctl.action(t.getAttribute('data-a')); return; }
      var s = st();
      if (!s) return;
      if (kind === 'row') { if (setRow(s, Number(t.getAttribute('data-r')))) { render(); changed('row'); } return; }
      if (kind === 'up' || kind === 'down') {
        if (moveRow(s, kind === 'up' ? -1 : 1)) {
          render(); changed('row');
          var again = el.querySelector ? el.querySelector('[data-rp="' + kind + '"]') : null;   // 키보드로 줄을 옮기면 같은 버튼에 포커스 유지
          if (again && !again.disabled && typeof again.focus === 'function') { try { again.focus({ preventScroll: true }); } catch (x) { again.focus(); } }
        }
        return;
      }
      // 크게 보기 칸: 손가락과 마우스는 pointerdown에서 이미 칠했다. 키보드(Enter, Space → detail 0)와 PointerEvent가 없는 브라우저만 여기서
      if (kind === 'z' && ((e && e.detail === 0) || !_hasPointer() || ctl.clickToggle)) {
        var l = t.getAttribute('data-l');
        if (toggle(s, l)) paintCells([l]);
      }
    }
    var on = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onEnd], ['pointercancel', onEnd], ['click', onClick]];
    on.forEach(function(p) { el.addEventListener(p[0], p[1]); });
    return function() {
      on.forEach(function(p) { if (typeof el.removeEventListener === 'function') el.removeEventListener(p[0], p[1]); });
      drag = null;
    };
  }

  return {
    GOAL: GOAL, RANKS: RANKS, HINT: HINT, HINT_SHORT: HINT_SHORT,
    ready: ready, create: create, label: label, rcOf: rcOf, weight: weight, cells: cells, count: count, countText: countText,
    setCell: setCell, toggle: toggle, setCells: setCells, clear: clear, setRow: setRow, moveRow: moveRow,
    dragStart: dragStart, dragOver: dragOver, dragEnd: dragEnd, grade: grade, pct: pct, spotLabel: spotLabel,
    html: html, resultHTML: resultHTML, chipHTML: chipHTML, bind: bind
  };
})();

// ── 레슨 위젯(계약 H1) ─────────────────────────────────────
(function() {
  var LESSON_OPTS = { ctx: 'lesson', head: true, acts: true, hint: true };
  // params.chip === false: 장면 calc가 이미 같은 라벨 칩('이 앱 차트 기준')을 그리는 레슨 장면(s5-09)이라 머리 칩을 뺀다(M6 통합 검증, 칩 두 번)
  var LESSON_OPTS_NOCHIP = { ctx: 'lesson', head: true, acts: true, hint: true, chip: false };
  function _lopts(p) { return p && p.chip === false ? LESSON_OPTS_NOCHIP : LESSON_OPTS; }
  var W = null;   // 지금 mount된 위젯(레슨 플레이어는 한 번에 한 장면)
  function _params(p) { return (p && typeof p === 'object') ? p : {}; }
  function _off() { if (W) { try { W.off(); } catch (e) { /* 무시 */ } W = null; } }
  LessonWidgets.rangePaint = {
    html: function(params) {
      var p = _params(params);
      var st = RangePaint.create(p.spot, { goal: p.goal });
      return st ? RangePaint.html(st, _lopts(p)) : '';
    },
    mount: function(el, params, api) {
      _off();
      var p = _params(params);
      var st = RangePaint.create(p.spot, { goal: p.goal });
      if (!st || !el) return;
      var w = { el: el, st: st, off: null };
      function render() { el.innerHTML = RangePaint.html(w.st, _lopts(p)); }
      function toast(m) { if (api && typeof api.toast === 'function') api.toast(m); }
      w.off = RangePaint.bind(el, {
        state: function() { return w.st.graded ? null : w.st; },
        render: render,
        action: function(a) {
          if (a === 'grade') {
            if (!RangePaint.cells(w.st).length) { toast('먼저 칸을 칠해 보세요'); return; }
            if (!RangePaint.grade(w.st)) { toast('채점기를 불러오지 못했어요'); return; }
          } else if (a === 'clear') {
            if (!RangePaint.cells(w.st).length) return;
            if (!w.st.armed) { w.st.armed = true; toast('한 번 더 누르면 모두 지워요'); return; }
            RangePaint.clear(w.st);
          } else if (a === 'again') w.st.graded = null;
          else if (a === 'reset') { RangePaint.clear(w.st); w.st.row = 0; }
          else return;
          render();
        }
      });
      W = w;
      render();
    },
    unmount: function() { _off(); }
  };
})();
if (typeof module !== 'undefined' && module) module.exports = { RangePaint: RangePaint, LessonWidgets: LessonWidgets };
