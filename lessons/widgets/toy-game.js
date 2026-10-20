// lessons/widgets/toy-game.js (채우는 그룹: M6-WIDGET, 이름 toyGame)
// 레슨 위젯(토이 게임 슬라이더, A/K/Q 리버 블러프 빈도 무차별점). 계약 H1(docs/JOURNEY_ROADMAP.md M6): LessonWidgets.toyGame = { html(params) → 순수 문자열(node 안전),
//   mount?(el, params, api{note(kind, data), toast(msg)}), unmount?() }. LessonPlayer가 .lp-widget[data-nogesture]로 감싸 그린다.
//
// params = { potBefore(벳 전 팟 bb, 기본 10), bet(내 벳 bb, 기본 = 팟) }. 게임: 나는 A(넛) 또는 Q(블러프), 상대는 K(블러프캐처)만.
//   ① 블러프 몫 f 슬라이더 → 상대 K의 콜 EV = f x (팟+벳) - (1-f) x 벳(폴드 = 0 기준). 0이 되는 무차별점 = 벳/(팟+2벳).
//   ② 상대 콜 빈도 c 슬라이더 → 내 Q 블러프 EV = (1-c) x 팟 - c x 벳(체크 = 0 기준). 0이 되는 콜 무차별(MDF) = 팟/(팟+벳).
//   숫자는 엔진 식 GenMath.toyGame, toyCallEV, toyBluffEV(puzzles/gen-math.js, toygame 퍼즐과 같은 식)로 낸다(typeof 가드, 없으면 같은 식).
//   벳 크기 칩(팟 1/3, 절반, 팟, 2배, 레슨 값)으로 크기를 바꾸면 두 무차별점이 함께 움직인다.
// html은 순수 문자열(DOM, window 접근 없음). 이벤트는 mount에서만 el에 위임(click, input)으로 걸고 unmount에서 뗀다.
var LessonWidgets = (typeof LessonWidgets !== 'undefined' && LessonWidgets) ? LessonWidgets : {};
(function() {
  var DEF_POT = 10;
  var RATIOS = [{ r: 1 / 3, lab: '팟 1/3' }, { r: 1 / 2, lab: '팟 절반' }, { r: 1, lab: '팟 크기' }, { r: 2, lab: '팟 2배' }];
  var F0 = 0.5, C0 = 1;   // 시작 위치: 블러프 반반(무차별점은 늘 50% 아래라 K 콜이 이득), K가 늘 콜(블러프 손해)
  var TOL = 0.005 + 1e-9; // 슬라이더 1% 눈금에서 무차별점과 반 칸(0.5%p) 이내면 '무차별'(37.5%처럼 반 칸이면 양쪽 눈금 모두)

  function _gm() { return (typeof GenMath !== 'undefined' && GenMath) ? GenMath : null; }
  function _game(P, B) {
    var G = _gm();
    if (G && typeof G.toyGame === 'function') { var t = G.toyGame(P, B); if (t) return t; }
    return { P: P, B: B, bluffShare: B / (P + 2 * B), callFreq: P / (P + B), alpha: B / (P + B), ratio: B / P };
  }
  function _callEV(P, B, f) {
    var G = _gm();
    return (G && typeof G.toyCallEV === 'function') ? G.toyCallEV(P, B, f) : f * (P + B) - (1 - f) * B;
  }
  function _bluffEV(P, B, c) {
    var G = _gm();
    return (G && typeof G.toyBluffEV === 'function') ? G.toyBluffEV(P, B, c) : (1 - c) * P - c * B;
  }

  function _numOr(x, d) { x = Number(x); return (isFinite(x) && x > 0) ? x : d; }
  function _clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function _bbs(x) { var v = Math.round(x * 100) / 100; return String(v); }   // bb는 소수 둘째 자리까지, 끝 0 제거
  function _pct(x) { return Math.round(x * 100) + '%'; }
  function _ev(x) { var v = Math.round(x * 10) / 10; if (v === 0) v = 0; return (v > 0 ? '+' : '') + v + 'bb'; }
  function _half(x) { return Math.round(x * 2) / 2; }

  // params → 상태(순수). bet이 없으면 팟 크기, 범위 밖이면 잘라 낸다(벳 0.5bb ~ 팟의 5배)
  function state(params) {
    params = (params && typeof params === 'object') ? params : {};
    var P = _clamp(_numOr(params.potBefore, DEF_POT), 1, 1000);
    var B = _clamp(_numOr(params.bet, P), 0.5, 5 * P);
    return { P: P, B0: B, B: B, f: F0, c: C0, tab: 'bluff', noted: false };
  }
  // 벳 크기 칩: 팟 1/3, 절반, 팟, 2배(0.5bb 단위) + 레슨 값(목록에 없으면)
  function sizes(st) {
    var out = [], seen = {};
    RATIOS.forEach(function(x) {
      var b = Math.max(0.5, _half(st.P * x.r));
      if (seen[b]) return;
      seen[b] = 1;
      out.push({ b: b, lab: x.lab });
    });
    if (!seen[st.B0]) out.push({ b: st.B0, lab: '레슨 값' });
    return out.sort(function(a, b) { return a.b - b.b; });
  }

  // 한 상태의 숫자 전부(순수, 테스트 대조용)
  function model(st) {
    var t = _game(st.P, st.B);
    var evC = _callEV(st.P, st.B, st.f), evB = _bluffEV(st.P, st.B, st.c);
    var atF = Math.abs(st.f - t.bluffShare) <= TOL, atC = Math.abs(st.c - t.callFreq) <= TOL;
    return { P: st.P, B: st.B, f: st.f, c: st.c, fStar: t.bluffShare, cStar: t.callFreq, evCall: evC, evBluff: evB,
      signF: atF ? 0 : (evC > 0 ? 1 : -1), signC: atC ? 0 : (evB > 0 ? 1 : -1) };
  }

  // ── 그림(SVG, 순수 문자열). x = 0~1 슬라이더 값, y = EV(bb). 직선 하나, 0 선, 무차별점 세로선, 현재 점 ──
  var W = 300, H = 116, L = 10, R = 290, T = 18, Bt = 90;
  function _svgLine(o) {
    var lo = Math.min(o.y0, o.y1, 0), hi = Math.max(o.y0, o.y1, 0), pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    function X(v) { return L + (R - L) * v; }
    function Y(v) { return Bt - (Bt - T) * (v - lo) / (hi - lo); }
    function n(v) { return Math.round(v * 10) / 10; }
    var z = n(Y(0)), sx = n(X(o.star)), cx = n(X(o.cur)), cy = n(Y(o.curY));
    var cls = o.sign > 0 ? 'is-pos' : o.sign < 0 ? 'is-neg' : 'is-zero';
    var s = '<svg class="lw-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + o.aria + '" focusable="false">';
    s += '<rect class="lw-svg-pos" x="' + L + '" y="' + T + '" width="' + (R - L) + '" height="' + n(z - T) + '"/>';
    s += '<rect class="lw-svg-neg" x="' + L + '" y="' + z + '" width="' + (R - L) + '" height="' + n(Bt - z) + '"/>';
    s += '<text class="lw-svg-t lw-svg-tp" x="' + (o.posLeft ? L + 4 : R - 4) + '" y="' + (T + 13) + '" text-anchor="' + (o.posLeft ? 'start' : 'end') + '">' + o.posLab + '</text>';
    s += '<text class="lw-svg-t lw-svg-tn" x="' + (o.posLeft ? R - 4 : L + 4) + '" y="' + (Bt - 5) + '" text-anchor="' + (o.posLeft ? 'end' : 'start') + '">' + o.negLab + '</text>';
    s += '<line class="lw-svg-zero" x1="' + L + '" y1="' + z + '" x2="' + R + '" y2="' + z + '"/>';
    s += '<line class="lw-svg-star" x1="' + sx + '" y1="' + T + '" x2="' + sx + '" y2="' + Bt + '"/>';
    s += '<text class="lw-svg-t lw-svg-ts" x="' + _clamp(sx, L + 34, R - 34) + '" y="' + (T - 5) + '" text-anchor="middle">무차별 ' + _pct(o.star) + '</text>';
    s += '<line class="lw-svg-line" x1="' + L + '" y1="' + n(Y(o.y0)) + '" x2="' + R + '" y2="' + n(Y(o.y1)) + '"/>';
    s += '<circle class="lw-svg-dot ' + cls + '" cx="' + cx + '" cy="' + cy + '" r="6"/>';
    s += '<text class="lw-svg-t lw-svg-ax" x="' + L + '" y="' + (Bt + 16) + '" text-anchor="start">0%</text>';
    s += '<text class="lw-svg-t lw-svg-ax" x="' + ((L + R) / 2) + '" y="' + (Bt + 16) + '" text-anchor="middle">' + o.xname + '</text>';
    s += '<text class="lw-svg-t lw-svg-ax" x="' + R + '" y="' + (Bt + 16) + '" text-anchor="end">100%</text>';
    return s + '</svg>';
  }

  // ── 영역별 문자열(html과 mount 갱신이 같은 함수를 쓴다) ──
  function parts(st) {
    var m = model(st), P = _bbs(st.P), B = _bbs(st.B), B2 = _bbs(2 * st.B);
    var chips = sizes(st).map(function(x) {
      var on = x.b === st.B;
      return '<button type="button" class="lw-chip' + (on ? ' is-on' : '') + '" data-act="size" data-b="' + x.b + '" aria-pressed="' + on + '">' +
        x.lab + '<small>' + _bbs(x.b) + 'bb</small></button>';
    }).join('');
    var fMsg = m.signF === 0 ? '무차별: 상대 K는 콜해도 폴드해도 같아요(콜 EV 약 0bb)'
      : m.signF > 0 ? '블러프가 많아요: 상대 K는 콜이 이득(콜 EV ' + _ev(m.evCall) + ')'
      : '블러프가 적어요: 상대 K는 폴드가 이득(콜 EV ' + _ev(m.evCall) + ')';
    var cMsg = m.signC === 0 ? '무차별: 내 Q는 블러프해도 체크해도 같아요(블러프 EV 약 0bb)'
      : m.signC > 0 ? '콜이 적어요: 내 Q 블러프가 이득(블러프 EV ' + _ev(m.evBluff) + ')'
      : '콜이 많아요: 내 Q 블러프가 손해(블러프 EV ' + _ev(m.evBluff) + ')';
    var fp = Math.round(st.f * 100), ap = 100 - fp;
    return {
      head: '벳 전 팟 <b>' + P + 'bb</b>, 내 벳 <b>' + B + 'bb</b>',
      chips: chips,
      fVal: fp + '%',
      mix: '<span class="lw-mix-a" style="width:' + ap + '%">' + (ap >= 14 ? 'A ' + ap + '%' : '') + '</span>' +
        '<span class="lw-mix-q" style="width:' + fp + '%">' + (fp >= 14 ? 'Q ' + fp + '%' : '') + '</span>',
      chartF: _svgLine({ y0: _callEV(st.P, st.B, 0), y1: _callEV(st.P, st.B, 1), star: m.fStar, cur: st.f, curY: m.evCall, sign: m.signF,
        posLab: 'K 콜 이득', negLab: 'K 폴드 이득', posLeft: true, xname: '내 벳 중 블러프(Q) 몫', aria: '상대 K의 콜 EV 그래프' }),
      outF: '<span class="lw-out ' + (m.signF > 0 ? 'is-pos' : m.signF < 0 ? 'is-neg' : 'is-zero') + '">' + fMsg + '</span>',
      keyF: 'K의 콜 EV가 0인 무차별점: 블러프 몫 <b>' + _pct(m.fStar) + '</b> = 벳 ÷ (팟+2벳) = ' + B + ' ÷ (' + P + '+' + B2 + ')',
      cVal: Math.round(st.c * 100) + '%',
      chartC: _svgLine({ y0: _bluffEV(st.P, st.B, 0), y1: _bluffEV(st.P, st.B, 1), star: m.cStar, cur: st.c, curY: m.evBluff, sign: m.signC,
        posLab: '블러프 이득', negLab: '블러프 손해', posLeft: false, xname: '상대 K의 콜 빈도', aria: '내 Q 블러프 EV 그래프' }),
      outC: '<span class="lw-out ' + (m.signC > 0 ? 'is-pos' : m.signC < 0 ? 'is-neg' : 'is-zero') + '">' + cMsg + '</span>',
      keyC: '내 블러프가 본전인 콜 빈도(MDF): <b>' + _pct(m.cStar) + '</b> = 팟 ÷ (팟+벳) = ' + P + ' ÷ (' + P + '+' + B + ')'
    };
  }

  function _tabBtn(id, label, on) {
    return '<button type="button" class="lw-tab' + (on ? ' is-on' : '') + '" role="tab" data-act="tab" data-tab="' + id + '" aria-selected="' + on + '">' + label + '</button>';
  }
  function html(params) {
    var st = state(params), p = parts(st), fp = Math.round(st.f * 100), cp = Math.round(st.c * 100);
    return '<div class="lw lw-toy" data-p="' + st.P + '" data-b="' + st.B + '">' +
      '<p class="lw-sub"><b class="lw-title">🃏 토이 게임</b> 나 A(넛) 또는 Q(블러프), 상대 K. <span data-r="head">' + p.head + '</span></p>' +
      '<div class="lw-chips" role="group" aria-label="벳 크기" data-r="chips">' + p.chips + '</div>' +
      '<div class="lw-tabs" role="tablist">' + _tabBtn('bluff', '① 내 블러프 몫', true) + _tabBtn('call', '② 상대 콜 빈도', false) + '</div>' +
      '<div class="lw-panel" data-panel="bluff" role="tabpanel">' +
        '<div class="lw-row"><span>내 벳 중 Q(블러프) 몫</span><b class="lw-val" data-r="fVal">' + p.fVal + '</b></div>' +
        '<input class="lw-range" type="range" data-in="f" min="0" max="100" step="1" value="' + fp + '" aria-label="내 벳 중 블러프 몫, 퍼센트" aria-valuetext="' + p.fVal + '">' +
        '<div class="lw-mix" aria-hidden="true" data-r="mix">' + p.mix + '</div>' +
        '<div class="lw-chart" data-r="chartF">' + p.chartF + '</div>' +
        '<p class="lw-msg" aria-live="polite" data-r="outF">' + p.outF + '</p>' +
        '<p class="lw-key" data-r="keyF">' + p.keyF + '</p>' +
        '<button type="button" class="lw-btn" data-act="snap" data-k="f">무차별점에 놓아 보기</button>' +
      '</div>' +
      '<div class="lw-panel" data-panel="call" role="tabpanel" hidden>' +
        '<div class="lw-row"><span>상대 K가 콜하는 빈도</span><b class="lw-val" data-r="cVal">' + p.cVal + '</b></div>' +
        '<input class="lw-range" type="range" data-in="c" min="0" max="100" step="1" value="' + cp + '" aria-label="상대 K의 콜 빈도, 퍼센트" aria-valuetext="' + p.cVal + '">' +
        '<div class="lw-chart" data-r="chartC">' + p.chartC + '</div>' +
        '<p class="lw-msg" aria-live="polite" data-r="outC">' + p.outC + '</p>' +
        '<p class="lw-key" data-r="keyC">' + p.keyC + '</p>' +
        '<button type="button" class="lw-btn" data-act="snap" data-k="c">무차별점에 놓아 보기</button>' +
      '</div>' +
    '</div>';
  }

  // ── mount/unmount: el에 위임 리스너 2개(click, input). 같은 el을 다시 mount하면 앞 리스너를 먼저 뗀다 ──
  var _cur = null;   // { el, st, onClick, onInput }
  function _q(el, sel) { try { return el && typeof el.querySelector === 'function' ? el.querySelector(sel) : null; } catch (e) { return null; } }
  function _qa(el, sel) { try { return el && typeof el.querySelectorAll === 'function' ? el.querySelectorAll(sel) : []; } catch (e) { return []; } }
  function _attr(t, k) { return t && typeof t.getAttribute === 'function' ? t.getAttribute(k) : null; }
  function _closestAct(t, root) {
    for (var n = t, i = 0; n && n !== root && i < 8; n = n.parentNode, i++) if (_attr(n, 'data-act')) return n;
    return null;
  }
  function _refresh(c) {
    var p = parts(c.st);
    Object.keys(p).forEach(function(k) { var n = _q(c.el, '[data-r="' + k + '"]'); if (n) n.innerHTML = p[k]; });
    var fi = _q(c.el, '[data-in="f"]'), ci = _q(c.el, '[data-in="c"]');
    if (fi && fi.setAttribute) fi.setAttribute('aria-valuetext', p.fVal);
    if (ci && ci.setAttribute) ci.setAttribute('aria-valuetext', p.cVal);
  }
  function _setTab(c, tab) {
    c.st.tab = tab === 'call' ? 'call' : 'bluff';
    var ps = _qa(c.el, '[data-panel]'), ts = _qa(c.el, '[data-act="tab"]');
    for (var i = 0; i < ps.length; i++) ps[i].hidden = _attr(ps[i], 'data-panel') !== c.st.tab;
    for (var j = 0; j < ts.length; j++) {
      var on = _attr(ts[j], 'data-tab') === c.st.tab;
      if (ts[j].setAttribute) ts[j].setAttribute('aria-selected', String(on));
      if (ts[j].classList) ts[j].classList.toggle('is-on', on);
    }
  }
  function mount(el, params, api) {
    if (!el) return;
    if (_cur) unmount();
    var c = { el: el, st: state(params), api: api || null };
    c.onInput = function(e) {
      var t = e && e.target, k = _attr(t, 'data-in');
      if (k !== 'f' && k !== 'c') return;
      var v = _clamp(Number(t.value) / 100, 0, 1);
      if (!isFinite(v)) return;
      c.st[k] = v;
      _refresh(c);
    };
    c.onClick = function(e) {
      var b = _closestAct(e && e.target, el);
      if (!b) return;
      var act = _attr(b, 'data-act');
      if (act === 'tab') _setTab(c, _attr(b, 'data-tab'));
      else if (act === 'size') {
        var nb = Number(_attr(b, 'data-b'));
        if (isFinite(nb) && nb > 0) { c.st.B = nb; _refresh(c); }
      } else if (act === 'snap') {
        var key = _attr(b, 'data-k') === 'c' ? 'c' : 'f', m = model(c.st);
        var v = Math.round((key === 'f' ? m.fStar : m.cStar) * 100);
        c.st[key] = v / 100;
        var inp = _q(el, '[data-in="' + key + '"]');
        if (inp) inp.value = String(v);
        _refresh(c);
      }
    };
    el.addEventListener('input', c.onInput);
    el.addEventListener('click', c.onClick);
    _cur = c;
  }
  function unmount() {
    var c = _cur;
    _cur = null;
    if (!c || !c.el) return;
    try { c.el.removeEventListener('input', c.onInput); c.el.removeEventListener('click', c.onClick); } catch (e) { /* 무시 */ }
  }

  LessonWidgets.toyGame = {
    html: html, mount: mount, unmount: unmount,
    // 테스트용 내부(순수 함수와 현재 mount 상태)
    _: { state: state, model: model, parts: parts, sizes: sizes, current: function() { return _cur ? _cur.st : null; }, TOL: TOL }
  };
  if (typeof module !== 'undefined' && module) module.exports = LessonWidgets.toyGame;
})();
