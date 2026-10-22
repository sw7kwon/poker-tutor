// ui/raise-info.js (로컬 G3 LIVE, 설계 원문 docs/NEXT_BATCH_DESIGN.md 3절 R3, R3b)
// 슬라이더 실시간 읽기(RaiseInfo): 레이즈 금액을 움직이는 동안 손익분기 폴드율, MDF, 밸류:블러프, 이길 확률, EV를 #raise-info 2줄에 쓴다.
// 계약(P0 고정, G2가 화면 배선):
//   compute(state, eq, amount, model) → { a, P, be, mdf, vb|null, ev:{ call, raise, fold }, win:{ call, raise }|null, f, eqC, approx } | null (순수)
//     a = R - h(이번 스트리트에 더 넣는 금액), P = state.pot(모든 베팅 포함), BE = a / (P + a), MDF = P / (P + a) = 1 - BE.
//     밸류:블러프(리버 벳만) = (P + a) : a. 레슨 s4-06의 블러프 비율 = 벳 ÷ (팟 + 2벳)과 같은 몫이다
//       (설계 3.2절의 (1 - BE) : BE = P : a는 팟 크기 벳에서 1:1이 되어 레슨의 2:1과 어긋나므로 레슨 기준을 따른다).
//     콜 EV = eq x P - (1 - eq) x toCall(체크면 eq x P, 폴드 0 기준), 레이즈 EV = EV._raiseEVFor(P, X, h, toCall, R, eqC, f)(engine/ev.js).
//     f(모두 접을 확률), eqC(콜 받았을 때 승률)는 model(WinChance.at(R))이 있으면 그 값, 없으면 ev.js 휴리스틱 복제(approx: true).
//     이길 확률(지금 팟을 가져올 확률, 이후 스트리트 벳 제외 참고값): 폴드 0, 콜(체크) = eq, 레이즈 = f + (1 - f) x eqC.
//   onDecision(ctx{ state, eq, ev, view, boss, graded, gtoRound? }) : 결정 시작(HUD.update가 부른다, G2). 다음 프레임에 눈금(#raise-ticks)을
//     그리고 WinChance.prepare(슬라이더 칸이 숨어 있으면 보일 때까지 미룬다). 같은 결정에 다시 불러도(승률 칩 토글) 안전하다.
//   onAmount(amount) : 금액이 바뀜(app.js _setRaiseAmount와 syncRaiseFromInput). rAF 묶음 렌더(프레임당 계산 1회, DOM 쓰기는
//     #raise-info innerHTML 1회와 눈금 강조 속성 1회, 바뀐 것만).
//   clear() : 결정 끝(HUD.clear가 부른다, G2). 읽기 줄과 눈금을 비우고 숨긴다. WinChance도 비운다.
//   allowed(flags{ winChance, showEq, boss, mission, hideTypes, gtoRound, hide, hidePotOdds, graded, chartPre }) → { be, ev, win } (순수, 3.5절)
//     be(1줄) = !hidePotOdds, ev = !hide 또는 showEq(보스 제외), 단 프리플랍 차트 판정(chartPre)이면 HUD처럼 EV 숨김,
//     win(R3b) = winChance && showEq이고 미션, 은닉 테이블, GTO 미러 3회차, 채점 결정(graded)이 아닐 때만. 보스면 전부 false.
//   ticks(state) → [{ amount, label }](3.4절 표준 사이즈 눈금, 민레이즈 미만, 올인 초과, 중복 제외, 0.1bb 반올림)
//   snap(amount, ticks, span) → 눈금 ±2%(span 기준) 안이면 가장 가까운 눈금 금액, 아니면 amount
// 자체 input 리스너(#raise-slider): 드래그가 눈금 구역에 들어설 때 한 번 그 눈금으로 붙인다(구역 안에서는 자유, 키보드 화살표가 갇히지 않게).
//   붙일 때 #raise-amount 값을 바꾸고 App.syncRaiseFromInput()을 불러 슬라이더, 스택 %, onAmount를 함께 맞춘다. 진동 설정이 켜져 있으면 A11y.fx('tap').
// 겉모양: 기본 규칙을 <style id="raise-info-style">로 한 번 넣는다(:where로 우선순위 0, css/mobile.css 등 G2 규칙이 이긴다).
//   폰 액션바 그리드에서 두 띠의 자리(grid-area)는 G2(css/mobile.css)가 정한다.
// 규약: 로드 시 DOM 접근 없음(typeof 가드), node 러너 안전.
var RaiseInfo = (function() {
  var SNAP = 0.02;
  var hooks = { raf: null, byId: null };   // 테스트 주입: raf(fn) = requestAnimationFrame 대신, byId(id) = document.getElementById 대신

  // ── 순수 계산 ──
  function _num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function _base(st) {
    var P = _num(st.pot, 0), X = _num(st.currentBet, 0);
    var h = _num(st.playerBets && st.playerBets.Hero, 0);
    var stack = _num(st.stacks && st.stacks.Hero, 0);
    return { P: P, X: X, h: h, toCall: Math.max(0, X - h), maxTo: h + stack, bb: _num(st.bigBlind, 1) || 1,
      pre: st.street === 'preflop', sbc: st.streetBetCount || 0 };
  }

  // ev.js calcOptions 휴리스틱 복제(foldEqFor 곡선, CALLED_EQ_MUL 0.93/0.87/0.75를 사이즈 비율로 보간)
  function _heur(st, b, eq, R) {
    var raisedAgainst = b.sbc >= 2 && st.lastRaiser && st.lastRaiser !== 'Hero';
    var facingPost = !b.pre && b.toCall > 0;
    var feMul = (raisedAgainst ? 0.5 : 1) * (facingPost ? 0.6 : 1);
    var base = b.P + b.toCall;
    var ratio = base > 0 ? (R - b.X) / base : 1;
    var fe = Math.max(0, Math.min(0.55, 0.18 + 0.14 * Math.min(ratio, 2.5))) * feMul;
    var mul;
    if (R >= b.maxTo - 1e-9) mul = 0.75;
    else if (ratio <= 0.5) mul = 0.93;
    else if (ratio <= 1) mul = 0.93 + (ratio - 0.5) / 0.5 * (0.87 - 0.93);
    else {
      var allR = base > 0 ? (b.maxTo - b.X) / base : 2;
      var t = allR > 1 ? Math.min(1, (ratio - 1) / (allR - 1)) : 1;
      mul = 0.87 + t * (0.75 - 0.87);
    }
    return { f: fe, eqC: Math.max(0.05, eq * mul) };
  }

  function _raiseEV(P, X, h, toCall, R, eqC, f) {
    if (typeof EV !== 'undefined' && EV && typeof EV._raiseEVFor === 'function') return EV._raiseEVFor(P, X, h, toCall, R, eqC, f);
    return f * P + (1 - f) * (eqC * (P + R - X) - (1 - eqC) * (R - h));
  }

  function compute(st, eq, amount, model) {
    if (!st || typeof st !== 'object' || typeof amount !== 'number' || !isFinite(amount)) return null;
    var b = _base(st), R = amount, a = R - b.h;
    if (!(a > 0) || !(R > b.X)) return null;
    var P = b.P, be = a / (P + a);
    var vb = (st.street === 'river' && b.toCall === 0) ? (P + a) / a : null;
    var hasEq = typeof eq === 'number' && isFinite(eq);
    var m = (model && model.ready && typeof model.f === 'number' && typeof model.eqC === 'number') ? model : null;
    var fe, eqC, approx = !m;
    if (m) { fe = m.f; eqC = m.eqC; }
    else if (hasEq) { var hh = _heur(st, b, eq, R); fe = hh.f; eqC = hh.eqC; }
    else { fe = null; eqC = null; }
    var ev = { fold: 0, call: hasEq ? eq * P - (1 - eq) * b.toCall : null,
      raise: (fe != null && eqC != null) ? _raiseEV(P, b.X, b.h, b.toCall, R, eqC, fe) : null };
    var win = (hasEq && fe != null) ? { call: eq, raise: fe + (1 - fe) * eqC } : null;
    return { a: a, P: P, be: be, mdf: 1 - be, vb: vb, ev: ev, win: win, f: fe, eqC: eqC, approx: approx };
  }

  function allowed(fl) {
    fl = fl || {};
    if (fl.boss) return { be: false, ev: false, win: false };
    var be = !fl.hidePotOdds;
    var ev = (!fl.hide || !!fl.showEq) && !fl.chartPre;
    var win = !!fl.winChance && !!fl.showEq && !fl.mission && !fl.hideTypes && fl.gtoRound !== 3 && !fl.graded;
    return { be: be, ev: ev, win: win };
  }

  function _r1(v) { return Math.round(v * 10) / 10; }
  function _xs(v) { var r = _r1(v); return (r === Math.round(r) ? String(Math.round(r)) : r.toFixed(1)) + 'x'; }
  function ticks(st) {
    if (!st || typeof st !== 'object') return [];
    var b = _base(st), out = [], seen = Object.create(null);
    var minTo = _num(st.minRaise, b.X + b.bb) || (b.X + b.bb);
    var pos = (st.players && st.players.Hero && st.players.Hero.pos) || 'BTN';
    function add(amt, label) {
      amt = _r1(amt);
      if (amt < minTo - 1e-9 || amt > b.maxTo + 1e-9 || seen[amt]) return;
      seen[amt] = 1; out.push({ amount: amt, label: label });
    }
    if (b.pre) {
      if (b.sbc === 0) {
        var lim = b.X === b.bb ? Math.max(0, Math.round((b.P - 1.5 * b.bb) / b.bb)) : 0;
        var open = (pos === 'SB' ? 3 : 2.5) * b.bb + lim * b.bb;
        add(open, _xs(open / b.bb));
        add(3 * b.bb + lim * b.bb, _xs(3 + lim));
      } else if (b.sbc === 1) {
        var oop = pos === 'SB' || pos === 'BB';
        add(b.X * (oop ? 4 : 3), oop ? '4x' : '3x');
      } else if (b.sbc === 2) {
        add(b.X * 2.3, '2.3x');
      }
    } else if (b.toCall === 0) {
      [[0.33, '33%'], [0.5, '50%'], [0.75, '75%'], [1, '팟']].forEach(function(p) { add(b.X + p[0] * b.P, p[1]); });
    } else {
      [[0.5, '50%'], [0.75, '75%'], [1, '팟']].forEach(function(p) { add(b.X + p[0] * (b.P + b.toCall), p[1]); });
    }
    out.sort(function(x, y) { return x.amount - y.amount; });
    return out;
  }

  function _nearest(amount, list, span) {
    if (!list || !list.length || !(span > 0) || typeof amount !== 'number') return -1;
    var best = -1, bd = Infinity, lim = SNAP * span + 1e-9;
    for (var i = 0; i < list.length; i++) {
      var d = Math.abs(amount - list[i].amount);
      if (d <= lim && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function snap(amount, list, span) {
    var i = _nearest(amount, list, span);
    return i >= 0 ? list[i].amount : amount;
  }

  // ── 화면 ──
  var _ctx = null, _allow = null, _ticks = [], _amt = null, _rafPending = false;
  var _lastHtml = null, _lastOn = null, _lastShow = null, _zone = -1, _bound = null, _styled = false, _ticksDirty = false, _prepped = true;
  var _stats = { renders: 0, writes: 0 };

  function _el(id) {
    if (hooks.byId) return hooks.byId(id);
    if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return null;
    return document.getElementById(id);
  }
  function _raf(fn) {
    if (hooks.raf) return hooks.raf(fn);
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
    return fn();
  }
  function _settings() {
    try { return (typeof A11y !== 'undefined' && A11y && typeof A11y.load === 'function') ? (A11y.load() || {}) : {}; } catch (e) { return {}; }
  }
  function _sessionKind() {
    try {
      var s = (typeof Journey !== 'undefined' && Journey && typeof Journey.session === 'function') ? Journey.session() : null;
      return s && s.kind ? s.kind : '';
    } catch (e) { return ''; }
  }

  var CSS = [
    ':where(#raise-info){font-size:.78rem;line-height:1.35;color:var(--text-dim,#8b949e);margin:0 0 6px;}',
    ':where(#raise-info) .ri-l{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:12px;row-gap:1px;}',
    ':where(#raise-info) .ri-g{white-space:nowrap;}',
    ':where(#raise-info) .ri-k{color:#a8b3bf;}',
    ':where(#raise-info) b{font-size:.9rem;font-weight:700;color:var(--text,#e6edf3);}',
    ':where(#raise-info) b.ri-up{color:#6bdc8a;}',
    ':where(#raise-info) b.ri-dn{color:#ff8a80;}',
    ':where(#raise-info) .ri-ap{font-size:.7rem;color:#e3b341;border:1px solid #6b5a1e;border-radius:4px;padding:0 4px;}',
    '@media (max-width:360px){:where(#raise-info) .ri-vb{display:none;}}',
    ':where(#raise-ticks){position:relative;height:14px;margin:-2px 0 4px;overflow:visible;}',
    ':where(#raise-ticks) .rt-in{position:absolute;top:0;bottom:0;left:0;right:0;}',
    ':where(#raise-ticks) .rt{position:absolute;top:0;transform:translateX(-50%);font-size:11px;line-height:1;color:#a8b3bf;white-space:nowrap;font-variant-numeric:tabular-nums;}',
    ':where(#raise-ticks) .rt::before{content:"";display:block;width:2px;height:3px;margin:0 auto 1px;background:currentColor;border-radius:1px;}',
    ':where(#raise-ticks) .rt.rt-l{transform:none;}',
    ':where(#raise-ticks) .rt.rt-l::before{margin-left:0;}',
    ':where(#raise-ticks) .rt.rt-r{transform:translateX(-100%);}',
    ':where(#raise-ticks) .rt.rt-r::before{margin-right:0;}',
    ':where(#raise-ticks) .rt.rt-m{color:#6e7781;}',
    ':where(#raise-ticks) .rt .rt-o{display:none;}',
    // 눈금에 붙으면 그 눈금 자기 라벨만 금색으로 보이고 다른 라벨(무리 범위 라벨 포함)은 잠시 감춘다
    ':where(#raise-ticks)[data-on] .rt .rt-g{visibility:hidden;}'
  ];
  (function() {
    for (var i = 0; i < 8; i++) {
      var sel = ':where(#raise-ticks)[data-on="' + i + '"] .rt:nth-child(' + (i + 1) + ')';
      CSS.push(sel + '{color:var(--gold,#d4af37);font-weight:700;}');
      CSS.push(sel + ' .rt-g{display:none;}');
      CSS.push(sel + ' .rt-o{display:inline;}');
    }
  })();
  function _style() {
    if (_styled || typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return;
    _styled = true;
    try {
      if (typeof document.getElementById === 'function') {
        var ex = document.getElementById('raise-info-style');
        if (ex && ex.tagName === 'STYLE') return;
      }
      var head = document.head;
      if (!head || !head.appendChild) return;
      var st = document.createElement('style');
      st.id = 'raise-info-style';
      st.textContent = CSS.join('\n');
      head.appendChild(st);
    } catch (e) { /* noop */ }
  }

  function _flagsFor(ctx) {
    var s = _settings(), st = ctx.state || {}, view = ctx.view || {}, kind = _sessionKind();
    var gr = typeof ctx.gtoRound === 'number' ? ctx.gtoRound : (typeof st.round === 'number' ? st.round : 0);
    return {
      winChance: !!s.winChance, showEq: !!s.showEq || !!view.eqShown,
      boss: !!ctx.boss || kind === 'boss', mission: !!ctx.mission || kind === 'mission', hideTypes: !!st.hideTypes || !!ctx.hideTypes,
      gtoRound: gr, hide: !!view.hide, hidePotOdds: !!view.hidePotOdds, graded: !!ctx.graded,
      chartPre: st.street === 'preflop' && !!(ctx.ev && ctx.ev.bestSource === 'chart')
    };
  }

  function _canRaise(st) {
    if (!st || !st.players || !st.players.Hero) return false;
    if (st.waitingForHero === false || st.handOver) return false;
    var b = _base(st);
    if (!(b.maxTo > b.X) || b.maxTo - b.h <= b.toCall) return false;   // 콜만 가능(스택이 콜 금액 이하)
    return true;
  }

  function _pct(v) { return Math.round(v * 100) + '%'; }
  function _sg(v) { var r = _r1(v); if (r === 0) r = 0; return (r > 0 ? '+' : '') + r.toFixed(1); }
  function _evB(v) { var r = _r1(v); return '<b class="' + (r > 0 ? 'ri-up' : r < 0 ? 'ri-dn' : '') + '">' + _sg(v) + '</b>'; }

  // 용어 풀이(데스크톱 마우스 올림, 화면 낭독기). 폰에서는 코칭 해설과 레슨이 같은 말을 가르친다
  var TIP = {
    be: '블러프여도 본전이 되려면 상대가 이만큼 접어야 해요. 더 넣는 금액 ÷ (팟 + 더 넣는 금액)',
    mdf: '상대가 이 크기에 최소 이만큼은 계속해야 내 블러프가 저절로 이득이 되지 않아요. 팟 ÷ (팟 + 더 넣는 금액)',
    vb: '이 크기 리버 벳에서 균형 잡힌 밸류 대 블러프 비율이에요. 블러프 몫 = 벳 ÷ (팟 + 2 x 벳)',
    win: '지금 팟을 가져올 확률(참고값). 레이즈는 모두 접을 확률 + 콜 받고 이길 확률이고, 이후 스트리트 벳은 빼고 셌어요',
    ev: '그 선택의 평균 손익(bb, 폴드 0 기준이라 체크는 지금 팟 x 승률). 상대 모델은 이 앱 빌런 규칙이라 EV 표의 어림값과 다를 수 있어요',
    ap: '상대 모델을 준비하는 동안 어림값을 보여 줘요. 곧 바뀌어요'
  };
  function _k(text, tip) { return '<span class="ri-k" title="' + tip + '">' + text + '</span>'; }

  function _html(r, st, al) {
    if (!r) return '';
    var b = _base(st);
    var callW = b.toCall > 0 ? '콜' : '체크';
    var raiseW = (!b.pre && b.X === 0) ? '벳' : '레이즈';
    var l1 = '', l2 = '';
    if (al.be) {
      l1 = '<div class="ri-l">' +
        '<span class="ri-g">' + _k('손익분기 폴드', TIP.be) + ' <b>' + _pct(r.be) + '</b></span>' +
        '<span class="ri-g">' + _k('MDF', TIP.mdf) + ' <b>' + (100 - Math.round(r.be * 100)) + '%</b></span>' +   // 반올림해도 합 100
        (r.vb != null ? '<span class="ri-g ri-vb">' + _k('밸류:블러프', TIP.vb) + ' <b>' + r.vb.toFixed(1) + ':1</b></span>' : '') +
        '</div>';
    }
    var parts = [];
    if (al.win && r.win) {
      parts.push('<span class="ri-g">' + _k('이길 확률', TIP.win) + ' ' + callW + ' <b>' + _pct(r.win.call) + '</b> ' +
        raiseW + ' <b>' + _pct(r.win.raise) + '</b></span>');
    }
    if (al.ev && r.ev && r.ev.call != null && r.ev.raise != null) {
      parts.push('<span class="ri-g">' + _k('EV', TIP.ev) + ' ' + callW + ' ' + _evB(r.ev.call) + ' ' + raiseW + ' ' + _evB(r.ev.raise) + '</span>');
    }
    if (parts.length && r.approx) parts.push('<span class="ri-ap" title="' + TIP.ap + '">근사</span>');
    if (parts.length) l2 = '<div class="ri-l">' + parts.join('') + '</div>';
    return l1 + l2;
  }

  function _model(amount) {
    if (!_allow || !(_allow.ev || _allow.win) || !_prepped) return null;   // 이번 결정 준비를 시작하기 전에는 지난 결정 모델을 읽지 않는다
    try { return (typeof WinChance !== 'undefined' && WinChance && typeof WinChance.at === 'function') ? WinChance.at(amount) : null; } catch (e) { return null; }
  }

  // 슬라이더가 실제로 보이는지(GTO 미러처럼 슬라이더 칸을 숨긴 동안은 눈금 배치와 모델 준비를 미룬다). 잴 수 없으면(node) 보인다고 본다
  function _sliderShown() {
    var sl = _el('raise-slider');
    if (!sl || typeof sl.getBoundingClientRect !== 'function') return true;
    try { return sl.getBoundingClientRect().width > 0; } catch (e) { return true; }
  }
  function _prepare(ctx) {
    try {
      if (typeof WinChance !== 'undefined' && WinChance && typeof WinChance.prepare === 'function') {
        WinChance.prepare(ctx.state, { eq: ctx.eq, onReady: function() { if (_ctx === ctx) _schedule(); } });
      }
    } catch (e) { /* noop */ }
  }

  function _render() {
    _rafPending = false;
    if (!_ctx || !_allow) return;
    _stats.renders++;
    var st = _ctx.state, el = _el('raise-info');
    if (_ticksDirty || !_prepped) {
      var shown = _sliderShown();
      if (_ticksDirty && shown) { _drawTicks(st); _ticksDirty = false; }
      if (!_prepped && shown) { _prepped = true; if (_allow.ev || _allow.win) _prepare(_ctx); }
    }
    var r = (_amt != null) ? compute(st, _ctx.eq, _amt, _model(_amt)) : null;
    var html = _html(r, st, _allow);
    if (el && html !== _lastHtml) { el.innerHTML = html; _lastHtml = html; _stats.writes++; }
    var show = !!html;
    if (el && el.style && show !== _lastShow) { el.style.display = show ? '' : 'none'; _lastShow = show; }
    var on = '';
    if (_ticks.length && _amt != null) {
      for (var i = 0; i < _ticks.length; i++) if (Math.abs(_ticks[i].amount - _amt) < 0.051) { on = String(i); break; }
    }
    if (on !== _lastOn) {
      var tk = _el('raise-ticks');
      if (tk && typeof tk.setAttribute === 'function') {
        if (on === '') { if (typeof tk.removeAttribute === 'function') tk.removeAttribute('data-on'); }
        else tk.setAttribute('data-on', on);
      }
      _lastOn = on;
    }
  }
  function _schedule() {
    if (_rafPending) return;
    _rafPending = true;
    _raf(_render);
  }

  // 눈금 띠: 슬라이더 트랙과 맞춘다(엄지 반지름만큼 안쪽). 결정마다 1회 배치 읽기
  function _drawTicks(st) {
    var tk = _el('raise-ticks');
    if (!tk) return;
    var b = _base(st), min = _num(st.minRaise, b.X + b.bb), max = b.maxTo, span = max - min;
    if (!_ticks.length || !(span > 0)) {
      tk.innerHTML = ''; if (tk.style) tk.style.display = 'none'; return;
    }
    if (tk.style) tk.style.display = '';
    var left = 0, right = 0, width = 0, thumb = 16;
    var sl = _el('raise-slider');
    try {
      if (sl && typeof sl.getBoundingClientRect === 'function' && typeof tk.getBoundingClientRect === 'function') {
        var sr = sl.getBoundingClientRect(), tr = tk.getBoundingClientRect();
        if (sr.height >= 40) thumb = 28;
        if (sr.width > thumb) { left = sr.left - tr.left + thumb / 2; right = (tr.left + tr.width) - (sr.left + sr.width) + thumb / 2; width = sr.width - thumb; }
      }
    } catch (e) { width = 0; }
    // 양쪽 여백(px)으로 붙여 두면 화면 회전이나 창 크기 변화로 슬라이더 폭만 바뀌어도 눈금이 트랙을 따라간다(−/+ 버튼 폭은 고정)
    var inStyle = width > 0 ? ' style="left:' + left.toFixed(1) + 'px;right:' + right.toFixed(1) + 'px"' : '';
    // 라벨이 겹치면 뒤 눈금은 표시만 남기고, 무리의 첫 라벨을 '50%~팟'처럼 범위로 바꾼다(스택이 깊어 눈금이 왼쪽에 몰릴 때)
    var cells = [], head = -1, lastEnd = -1e9;
    function _lw(s) { return String(s).length * 7 + 4; }   // 11px 라벨 폭 어림
    function _end(c, lab) { return c.cls.indexOf('rt-l') >= 0 ? c.px + _lw(lab) : c.cls.indexOf('rt-r') >= 0 ? c.px : c.px + _lw(lab) / 2; }
    for (var i = 0; i < _ticks.length; i++) {
      var p = (_ticks[i].amount - min) / span, px = width > 0 ? p * width : null;
      var c = { p: p, cls: 'rt', lab: _ticks[i].label };
      if (px != null) {
        var abs = left + px;
        if (abs < 14) c.cls += ' rt-l'; else if (width > 0 && px > width - 14) c.cls += ' rt-r';
        if (head >= 0 && px - _lw(c.lab) / 2 < lastEnd + 6) {
          c.cls += ' rt-m';
          var h0 = cells[head];
          h0.lab = _ticks[head].label + '~' + c.lab;
          if (h0.cls.indexOf('rt-l') < 0 && h0.cls.indexOf('rt-r') < 0) h0.cls += ' rt-l';   // 범위 라벨은 첫 눈금에서 오른쪽으로 펼친다
          lastEnd = Math.max(lastEnd, _end(h0, h0.lab));
        } else {
          head = i; c.px = px; lastEnd = _end(c, c.lab);
        }
      }
      cells.push(c);
    }
    var html = '';
    for (var j = 0; j < cells.length; j++) {
      html += '<span class="' + cells[j].cls + '" style="left:' + (cells[j].p * 100).toFixed(2) + '%" title="' + _ticks[j].label + ' ' +
        _ticks[j].amount + 'bb">' + (cells[j].cls.indexOf('rt-m') < 0 ? '<span class="rt-g">' + cells[j].lab + '</span>' : '') +
        '<span class="rt-o">' + _ticks[j].label + '</span></span>';
    }
    tk.innerHTML = '<div class="rt-in"' + inStyle + '>' + html + '</div>';
    _lastOn = null;
  }

  function _onSlider() {
    if (!_ctx || !_ticks.length) return;
    var st = _ctx.state, sl = _el('raise-slider');
    if (!st || !sl) return;
    var b = _base(st), min = _num(st.minRaise, b.X + b.bb), max = b.maxTo, span = max - min;
    if (!(span > 0)) return;
    var raw = min + (parseFloat(sl.value) || 0) / 100 * span;
    var z = _nearest(raw, _ticks, span);
    if (z >= 0 && z !== _zone) {
      var t = _ticks[z].amount;
      var inp = _el('raise-amount');
      if (inp && Math.abs(t - raw) > 1e-9) {
        inp.value = t.toFixed(1);
        try { if (typeof App !== 'undefined' && App && typeof App.syncRaiseFromInput === 'function') App.syncRaiseFromInput(); } catch (e) { /* noop */ }
      }
      try { if (_settings().vibrate && typeof A11y !== 'undefined' && A11y && typeof A11y.fx === 'function') A11y.fx('tap'); } catch (e) { /* noop */ }
    }
    _zone = z;
  }
  function _bind() {
    var sl = _el('raise-slider');
    if (!sl || sl === _bound || typeof sl.addEventListener !== 'function') return;
    sl.addEventListener('input', _onSlider);
    _bound = sl;   // 같은 요소에는 한 번만(요소가 바뀌면 새로 건다)
  }

  function onDecision(ctx) {
    if (!ctx || !_canRaise(ctx.state)) { clear(); return; }
    _style();
    var st = ctx.state;
    var same = _ctx && _ctx.state === st;
    _ctx = ctx;
    _allow = allowed(_flagsFor(ctx));
    _ticks = (_allow.be || _allow.ev || _allow.win) ? ticks(st) : [];
    _ticksDirty = true; _prepped = false;   // 눈금 배치와 모델 준비는 다음 프레임(슬라이더가 보일 때)
    var tk0 = _el('raise-ticks');
    if (tk0 && !_ticks.length) { tk0.innerHTML = ''; if (tk0.style) tk0.style.display = 'none'; _ticksDirty = false; }
    if (!same || _amt == null) {
      var b = _base(st), minR = _num(st.minRaise, b.X + b.bb);
      var amt = (ctx.ev && typeof ctx.ev.raiseHalfAmt === 'number') ? ctx.ev.raiseHalfAmt : Math.max(minR, b.P * 0.5);
      _amt = Math.min(b.maxTo, Math.max(minR, amt));
      _zone = _nearest(_amt, _ticks, b.maxTo - minR);
    }
    _lastHtml = null; _lastShow = null;
    _bind();
    _schedule();
  }

  function onAmount(amount) {
    if (typeof amount !== 'number' || !isFinite(amount)) return;
    _amt = amount;
    if (!_ctx) return;
    _schedule();
  }

  function clear() {
    _ctx = null; _allow = null; _ticks = []; _amt = null; _zone = -1; _ticksDirty = false; _prepped = true; _rafPending = false;
    var el = _el('raise-info'), tk = _el('raise-ticks');
    if (el) { el.innerHTML = ''; if (el.style) el.style.display = 'none'; }
    if (tk) { tk.innerHTML = ''; if (tk.style) tk.style.display = 'none'; if (typeof tk.removeAttribute === 'function') tk.removeAttribute('data-on'); }
    _lastHtml = ''; _lastShow = false; _lastOn = '';
    try { if (typeof WinChance !== 'undefined' && WinChance && typeof WinChance.clear === 'function') WinChance.clear(); } catch (e) { /* noop */ }
  }

  var api = { compute: compute, onDecision: onDecision, onAmount: onAmount, clear: clear, allowed: allowed, ticks: ticks, snap: snap,
    hooks: hooks, _stats: _stats, _html: _html, _heur: function(st, eq, R) { return _heur(st, _base(st), eq, R); }, SNAP: SNAP };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
