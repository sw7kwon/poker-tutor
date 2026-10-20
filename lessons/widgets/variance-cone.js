// lessons/widgets/variance-cone.js (채우는 그룹: M6-WIDGET, 이름 varianceCone)
// 레슨 위젯(분산 콘, 같은 승률의 결과 폭). 계약 H1(docs/JOURNEY_ROADMAP.md M6): LessonWidgets.varianceCone = { html(params) → 순수 문자열(node 안전),
//   mount?(el, params, api{note(kind, data), toast(msg)}), unmount?() }. LessonPlayer가 .lp-widget[data-nogesture]로 감싸 그린다.
//
// params = { winrate(bb/100, 기본 5), hands?(기본 1만, 1천~10만), sd?(bb/100 표준편차, 기본 90) }.
//   핸드 수 슬라이더(1천~10만)와 승률 칩(0, 2, 5, 10, 레슨 값). 숫자는 GenMath.varianceBand(w, N)(puzzles/gen-math.js, variance 퍼즐과 같은 식,
//   SD 90 고정)로 내고 sd가 90이 아니면 반폭만 sd/90배(로드맵 M6 결정 7). 가운데 = w x N/100, 반폭 = 1.96 x SD x sqrt(N/100),
//   100핸드당 표시는 w ± 1.96 x SD / sqrt(N/100). 승률이 양수면 구간 전체가 0 위로 올라가는 핸드 수 = 100 x (1.96 x SD / w)^2.
//   그림의 예시 3명 경로는 시드 고정 무작위(같은 입력이면 같은 그림)이고 숫자로는 보이지 않는다.
// 위젯을 열면(mount, 장면에 들어올 때마다) 한 번 api.note('varianceCone', { hands, winrate })(레슨 값, 없으면 Badges.note, typeof 가드).
//   로드맵 M6 WIDGET 행 '열면 api.note'와 계약 H1/H8, COLLECT 배지 '분산 체험'(위젯을 열었을 때)에 맞춘다. 조작은 따로 기록하지 않는다.
// html은 순수 문자열(DOM, window 접근 없음). 이벤트는 mount에서만 el에 위임(click, input)으로 걸고 unmount에서 뗀다.
var LessonWidgets = (typeof LessonWidgets !== 'undefined' && LessonWidgets) ? LessonWidgets : {};
(function() {
  var Z = 1.96, SD0 = 90;
  var STEPS = [1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000];
  var RATES = [0, 2, 5, 10];
  var N_MIN = 1000, N_MAX = 100000;

  function _gm() { return (typeof GenMath !== 'undefined' && GenMath) ? GenMath : null; }
  // 95% 구간(엔진 식). sd가 90이 아니면 반폭만 sd/90배
  function band(w, N, sd) {
    sd = sd || SD0;
    var G = _gm(), b = null;
    if (G && typeof G.varianceBand === 'function') b = G.varianceBand(w, N);
    var center = b ? b.center : w * N / 100;
    var half = (b ? b.half : Z * SD0 * Math.sqrt(N / 100)) * (sd / SD0);
    var h100 = half / (N / 100);
    return { w: w, N: N, sd: sd, center: center, half: half, lo: center - half, hi: center + half, half100: h100, lo100: w - h100, hi100: w + h100,
      nClear: w > 0 ? 100 * Math.pow(Z * sd / w, 2) : null };
  }

  function _num(x, d) { x = Number(x); return isFinite(x) ? x : d; }
  function _clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function _comma(n) {
    var r = Math.round(n), s = String(Math.abs(r)), out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return (r < 0 ? '-' : '') + s + out;
  }
  function _signed(n) { var r = Math.round(n); return (r > 0 ? '+' : '') + _comma(r); }
  function _d1(x) { var v = Math.round(x * 10) / 10; if (v === 0) v = 0; return (v % 1 === 0) ? String(v) : v.toFixed(1); }
  function _sd1(x) { var s = _d1(x); return (Number(s) > 0 ? '+' : '') + s; }
  function handsKor(N) {
    if (N >= 10000) { var m = N / 10000; return (m % 1 === 0 ? String(m) : String(Math.round(m * 100) / 100)) + '만'; }
    if (N % 1000 === 0) return (N / 1000) + '천';
    return _comma(N);
  }

  // params → 상태(순수). 레슨 값이 목록에 없으면 슬라이더 눈금과 칩에 끼워 넣는다
  function state(params) {
    params = (params && typeof params === 'object') ? params : {};
    var w = _clamp(_num(params.winrate, 5), -50, 50);
    w = Math.round(w * 10) / 10;
    var sd = _clamp(_num(params.sd, SD0) || SD0, 20, 300);
    var N = Math.round(_clamp(_num(params.hands, 10000), N_MIN, N_MAX));
    var steps = STEPS.slice();
    if (steps.indexOf(N) < 0) steps = steps.concat([N]).sort(function(a, b) { return a - b; });
    var rates = RATES.slice();
    if (rates.indexOf(w) < 0) rates = rates.concat([w]).sort(function(a, b) { return a - b; });
    return { w: w, w0: w, sd: sd, N: N, steps: steps, rates: rates, noted: false };
  }

  // ── 그림: 0~N 핸드의 95% 콘, 기대값 선, 0 선, 예시 경로 3개(시드 고정) ──
  function _rng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _gauss(rnd) {
    var u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  var PATH_STEPS = 100, CONE_STEPS = 40;
  function paths(st) {
    var out = [], k = (st.N / 100) / PATH_STEPS;   // 한 칸 = 100핸드 k개 묶음: 평균 w x k, 표준편차 SD x sqrt(k)
    for (var i = 0; i < 3; i++) {
      var rnd = _rng((Math.round(st.w * 10) + 1000) * 7919 + st.N * 31 + i * 104729 + Math.round(st.sd)), y = 0, p = [0];
      for (var j = 0; j < PATH_STEPS; j++) { y += st.w * k + st.sd * Math.sqrt(k) * _gauss(rnd); p.push(y); }
      out.push(p);
    }
    return out;
  }
  var VW = 300, VH = 136, L = 6, R = 294, T = 16, Bt = 114;
  function chart(st) {
    var b = band(st.w, st.N, st.sd), ps = paths(st);
    var lo = Math.min(b.lo, 0), hi = Math.max(b.hi, 0);
    ps.forEach(function(p) { p.forEach(function(v) { if (v < lo) lo = v; if (v > hi) hi = v; }); });
    var pad = (hi - lo) * 0.06 || 1;
    lo -= pad; hi += pad;
    function X(n) { return L + (R - L) * n / st.N; }
    function Y(v) { return Bt - (Bt - T) * (v - lo) / (hi - lo); }
    function f(v) { return Math.round(v * 10) / 10; }
    var up = [], dn = [];
    for (var i = 0; i <= CONE_STEPS; i++) {
      var n = st.N * i / CONE_STEPS, bb = band(st.w, n || 1e-9, st.sd);
      up.push(f(X(n)) + ',' + f(Y(n ? bb.hi : 0)));
      dn.push(f(X(n)) + ',' + f(Y(n ? bb.lo : 0)));
    }
    var s = '<svg class="lw-svg" viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="' + handsKor(st.N) + ' 핸드 동안 결과가 퍼지는 95% 구간 그림" focusable="false">';
    s += '<polygon class="lw-cone" points="' + up.concat(dn.reverse()).join(' ') + '"/>';
    s += '<line class="lw-svg-zero" x1="' + L + '" y1="' + f(Y(0)) + '" x2="' + R + '" y2="' + f(Y(0)) + '"/>';
    ps.forEach(function(p, k) {
      var pts = p.map(function(v, j) { return f(X(st.N * j / PATH_STEPS)) + ',' + f(Y(v)); }).join(' ');
      s += '<polyline class="lw-path lw-path-' + (k + 1) + '" points="' + pts + '"/>';
    });
    s += '<line class="lw-svg-line" x1="' + f(X(0)) + '" y1="' + f(Y(0)) + '" x2="' + f(X(st.N)) + '" y2="' + f(Y(b.center)) + '"/>';
    s += '<text class="lw-svg-t lw-svg-tp" x="' + (R - 3) + '" y="' + _clamp(f(Y(b.hi)) - 4, T - 4, Bt) + '" text-anchor="end">' + _signed(b.hi) + 'bb</text>';
    s += '<text class="lw-svg-t lw-svg-tn" x="' + (R - 3) + '" y="' + _clamp(f(Y(b.lo)) + 13, T + 10, Bt + 2) + '" text-anchor="end">' + _signed(b.lo) + 'bb</text>';
    s += '<text class="lw-svg-t lw-svg-ax" x="' + (L + 2) + '" y="' + _clamp(f(Y(0)) - 4, T, Bt) + '" text-anchor="start">0</text>';
    s += '<text class="lw-svg-t lw-svg-ax" x="' + L + '" y="' + (VH - 6) + '" text-anchor="start">0핸드</text>';
    s += '<text class="lw-svg-t lw-svg-ax" x="' + ((L + R) / 2) + '" y="' + (VH - 6) + '" text-anchor="middle">예시 3명(같은 실력, 무작위)</text>';
    s += '<text class="lw-svg-t lw-svg-ax" x="' + R + '" y="' + (VH - 6) + '" text-anchor="end">' + handsKor(st.N) + '</text>';
    return s + '</svg>';
  }

  // 100핸드당 구간 막대(가로축 고정: 1천 핸드 반폭 + 10, 0 눈금 가운데)
  function _per100Bar(st, b) {
    var M = Math.ceil((Z * st.sd / Math.sqrt(10) + 10) / 10) * 10;
    if (Math.abs(st.w) + b.half100 > M) M = Math.ceil((Math.abs(st.w) + b.half100) / 10) * 10;
    function P(v) { return Math.round(_clamp((v + M) / (2 * M), 0, 1) * 1000) / 10; }
    var l = P(b.lo100), r = P(b.hi100);
    return '<div class="lw-pbar" aria-hidden="true"><span class="lw-pbar-zero" style="left:50%"></span>' +
      '<span class="lw-pbar-band" style="left:' + l + '%;width:' + Math.round((r - l) * 10) / 10 + '%"></span>' +
      '<span class="lw-pbar-dot" style="left:' + P(st.w) + '%"></span></div>' +
      '<div class="lw-pbar-ax" aria-hidden="true"><span>-' + M + '</span><span>0</span><span>+' + M + '</span></div>';
  }

  function parts(st) {
    var b = band(st.w, st.N, st.sd), hk = handsKor(st.N);
    var chips = st.rates.map(function(w) {
      var on = w === st.w;
      return '<button type="button" class="lw-chip' + (on ? ' is-on' : '') + '" data-act="wr" data-w="' + w + '" aria-pressed="' + on + '">' +
        (w > 0 ? '+' : '') + _d1(w) + '<small>bb/100</small></button>';
    }).join('');
    var verdict;
    if (st.w > 0) verdict = b.lo < 0 ? '구간 아래쪽이 0보다 낮아요: 이기는 실력이어도 ' + hk + ' 핸드 뒤 손해일 수 있어요.'
      : '구간 전체가 0 위: ' + hk + ' 핸드쯤 치면 실력이 결과로 드러나요.';
    else if (st.w === 0) verdict = '본전 실력이어도 결과가 ±' + _comma(b.half) + 'bb까지 오르내려요: 결과만 보고 실력을 판단하면 안 돼요.';
    else verdict = b.hi > 0 ? '지는 실력이어도 ' + hk + ' 핸드 동안은 이길 수도 있어요(운).' : '구간 전체가 0 아래: 지는 실력이 결과로 드러나요.';
    var clear = '';
    if (b.nClear) {
      var nc = b.nClear;
      clear = '구간 전체가 0 위로 올라가는 핸드 수 = 100 × (1.96 × ' + _d1(st.sd) + ' ÷ ' + _d1(st.w) + ')² ≈ ' +
        (nc >= 10000 ? (Math.round(nc / 1000) / 10) + '만' : _comma(nc)) + ' 핸드';
    }
    return {
      chips: chips,
      nVal: hk + ' 핸드',
      band: _signed(b.lo) + 'bb ~ ' + _signed(b.hi) + 'bb',
      center: '가운데(기대값) ' + _signed(b.center) + 'bb = ' + _d1(st.w) + ' × ' + _comma(st.N) + ' ÷ 100',
      formula: '반폭 = 1.96 × ' + _d1(st.sd) + ' × √(' + _comma(st.N) + ' ÷ 100) = ' + _comma(b.half) + 'bb',
      chart: chart(st),
      per100: '<div class="lw-row"><span>100핸드당으로 보면</span><b>' + _d1(st.w) + ' ± ' + _d1(b.half100) + 'bb/100</b></div>' + _per100Bar(st, b) +
        '<p class="lw-key">' + _sd1(b.lo100) + ' ~ ' + _sd1(b.hi100) + 'bb/100: 핸드가 늘면 총 bb 폭은 커지고 100핸드당 폭은 좁아져요.</p>',
      verdict: '<span class="lw-out ' + (b.lo >= 0 ? 'is-pos' : b.hi <= 0 ? 'is-neg' : 'is-zero') + '">' + verdict + '</span>',
      clear: clear
    };
  }

  function html(params) {
    var st = state(params), p = parts(st), idx = st.steps.indexOf(st.N);
    return '<div class="lw lw-cone-w" data-w="' + st.w + '" data-n="' + st.N + '">' +
      '<p class="lw-sub"><b class="lw-title">📈 분산 콘</b> 승률을 고르고 핸드 수를 늘려 봐요(표준편차 ' + _d1(st.sd) + 'bb/100 가정)</p>' +
      '<div class="lw-chips" role="group" aria-label="승률, 100핸드당 bb" data-r="chips">' + p.chips + '</div>' +
      '<div class="lw-row"><span>핸드 수</span><b class="lw-val" data-r="nVal">' + p.nVal + '</b></div>' +
      '<input class="lw-range" type="range" data-in="n" min="0" max="' + (st.steps.length - 1) + '" step="1" value="' + idx + '" aria-label="핸드 수, 1천에서 10만" aria-valuetext="' + p.nVal + '">' +
      '<div class="lw-big"><span>95% 구간</span><b data-r="band">' + p.band + '</b></div>' +
      '<div class="lw-chart" data-r="chart">' + p.chart + '</div>' +
      '<p class="lw-msg" aria-live="polite" data-r="verdict">' + p.verdict + '</p>' +
      '<p class="lw-key" data-r="center">' + p.center + '</p>' +
      '<p class="lw-key" data-r="formula">' + p.formula + '</p>' +
      '<div class="lw-p100" data-r="per100">' + p.per100 + '</div>' +
      '<p class="lw-key" data-r="clear">' + p.clear + '</p>' +
    '</div>';
  }

  // ── mount/unmount ──
  var _cur = null;
  function _q(el, sel) { try { return el && typeof el.querySelector === 'function' ? el.querySelector(sel) : null; } catch (e) { return null; } }
  function _attr(t, k) { return t && typeof t.getAttribute === 'function' ? t.getAttribute(k) : null; }
  function _closestAct(t, root) {
    for (var n = t, i = 0; n && n !== root && i < 8; n = n.parentNode, i++) if (_attr(n, 'data-act')) return n;
    return null;
  }
  function _note(c) {
    if (c.st.noted) return;
    c.st.noted = true;
    var data = { hands: c.st.N, winrate: c.st.w };
    try {
      if (c.api && typeof c.api.note === 'function') c.api.note('varianceCone', data);
      else if (typeof Badges !== 'undefined' && Badges && typeof Badges.note === 'function') Badges.note('varianceCone', data, Date.now());
    } catch (e) { /* 배지 기록 실패는 위젯 동작과 무관 */ }
  }
  function _refresh(c) {
    var p = parts(c.st);
    Object.keys(p).forEach(function(k) { var n = _q(c.el, '[data-r="' + k + '"]'); if (n) n.innerHTML = p[k]; });
    var inp = _q(c.el, '[data-in="n"]');
    if (inp && inp.setAttribute) inp.setAttribute('aria-valuetext', p.nVal);
  }
  function mount(el, params, api) {
    if (!el) return;
    if (_cur) unmount();
    var c = { el: el, st: state(params), api: api || null };
    c.onInput = function(e) {
      var t = e && e.target;
      if (_attr(t, 'data-in') !== 'n') return;
      var i = Math.round(Number(t.value));
      if (!isFinite(i)) return;
      c.st.N = c.st.steps[_clamp(i, 0, c.st.steps.length - 1)];
      _refresh(c);
    };
    c.onClick = function(e) {
      var b = _closestAct(e && e.target, el);
      if (!b || _attr(b, 'data-act') !== 'wr') return;
      var w = Number(_attr(b, 'data-w'));
      if (!isFinite(w)) return;
      c.st.w = w;
      _refresh(c);
    };
    el.addEventListener('input', c.onInput);
    el.addEventListener('click', c.onClick);
    _cur = c;
    _note(c);   // 열면 1번(H1)
  }
  function unmount() {
    var c = _cur;
    _cur = null;
    if (!c || !c.el) return;
    try { c.el.removeEventListener('input', c.onInput); c.el.removeEventListener('click', c.onClick); } catch (e) { /* 무시 */ }
  }

  LessonWidgets.varianceCone = {
    html: html, mount: mount, unmount: unmount,
    _: { state: state, band: band, parts: parts, paths: paths, handsKor: handsKor, STEPS: STEPS, current: function() { return _cur ? _cur.st : null; } }
  };
  if (typeof module !== 'undefined' && module) module.exports = LessonWidgets.varianceCone;
})();
