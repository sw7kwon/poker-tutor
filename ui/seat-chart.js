// ui/seat-chart.js (n4 G3 SEAT+GRAPH, 설계 docs/NEXT4_DESIGN.md 4절, 결정 64)
// 좌석 누름 = 그 사람의 좌석 시트. 펠트 누름은 탭 진행 1걸음 그대로(Pacer EXCLUDE에 좌석 상자가 들어 있다).
//   좌석 상자 바깥 8px까지 좌석으로 센다(css/svg-charts.css의 .seat::before 히트 영역). 첫 1회 토스트 "좌석을 누르면 그 사람 차트, 진행은 아래 ▶ 버튼이에요".
//   완전 분석 세션(App.omni())과 기록 리플레이(OmniUI.active()), 극장(th-on)은 양보한다(OmniUI가 좌석 패널을 연다). 승급 시험 중에는 토스트만.
// 두 갈래(같은 내용): 📋 차트 칩이 켜져 있으면 차트 시트(#gto-sheet, GtoChart.seatView 재사용, OppChart.pinSeat로 따라가기를 멈춘다),
//   꺼져 있으면 이 모듈의 좌석 시트 #seat-sheet(한 번 보기, 설정은 바꾸지 않는다, 닫으면 끝). 둘 다 관점 칩 6개(OppChart.perspHTML)로 다른 좌석으로 옮긴다.
// 대상(target, 순수, 4.2절): 프리플랍은 그 좌석 차례(wait) | 이번 핸드 마지막 공개된 결정(last, 폴드 포함) | 아직 차례 전(ahead, 지금 기준 참고) | 내 자리(hero),
//   포스트플랍은 post(프리플랍 범위 + 블록 2 보드 위 범위 강도 분포 + 블록 3 지금 벳 앞에서) | hero-post(블록 2는 주 상대 WinChance.target 기준, 블록 3은 내 팟 오즈).
// 수학(engine/range-stats.js RangeStats): 분포 = Equity.liveCombos(그 사람 프리플랍 범위, 데드 = 보드 + 내 카드) + Villain._handStrength + PostflopGuide.hasDraw.
//   상대 실제 카드(state.holeCards)는 절대 읽지 않는다. 내 카드는 state.heroCards만. 필요 승률, MDF, 손익분기는 RangeStats.odds.
// 화면에 보이는 상태: Pacer 대기 상태(w.state) > 공개 중이면 OppChart.curState()(마지막 공개 프레임 뒤) > App.liveState()(엔진이 이미 정한 미래 행동이 새지 않게).
// 다시 그리기(4.6절 2번, 늘 rAF): (a) 그 좌석 차례가 옴, (b) 그 좌석의 행동이 공개됨, (c) 보드가 바뀜, (d) 그 좌석이 마주한 벳(콜 금액, 팟)이 바뀜. 서명 _sig가 같으면 손대지 않는다.
// 분포 계산은 첫 그리기 뒤 rAF에서 1회(그동안 "계산 중"), RangeStats가 (범위, 보드, 데드)로 캐시한다.
// API: init(), open(name) → 열었으면 true, close(), target(state, name, ctx), blocksHTML(state, name, stats), isOpen(), _setEnv(o), _state(), _released()(OppChart 알림)
// 규약: 로드 때 DOM 접근 없음(전부 typeof 가드). 가운뎃점과 긴줄표 없음. 문구 해요체.
var SeatChart = (function() {
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var STREET_KOR = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운' };
  var TIP_KEY = 'poker_seat_tip_seen';   // 기기 키(백업 제외)
  var SEG_KEYS = ['nut', 'strong', 'medium', 'weakPair', 'draw', 'air'];
  var _env = {};        // 테스트 주입: { sync(rAF 대신 바로), chart(차트 칩 켬 강제 true/false), state(보이는 상태), wait, phone, toast(fn) }
  var _open = null;     // { name, mode: 'gto' | 'own', sig, pending }
  var _sheet = null;    // 자체 좌석 시트 { root, head, title, ctx, close, body }
  var _paintQ = false, _paints = 0, _opens = 0, _inited = false, _computed = {};

  // ── 모듈 가드 ──
  function _GC() { return (typeof GtoChart !== 'undefined' && GtoChart) ? GtoChart : null; }
  function _OC() { return (typeof OppChart !== 'undefined' && OppChart) ? OppChart : null; }
  function _P() { return (typeof Pacer !== 'undefined' && Pacer) ? Pacer : null; }
  function _RS() { return (typeof RangeStats !== 'undefined' && RangeStats && !RangeStats.STUB) ? RangeStats : null; }
  function _SV() { return (typeof SvgCharts !== 'undefined' && SvgCharts && !SvgCharts.STUB) ? SvgCharts : null; }
  function _doc() { return (typeof document !== 'undefined' && document) ? document : null; }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; });
  }
  function _fmt(v) { var n = Math.round((Number(v) || 0) * 10) / 10; return n.toFixed(1); }
  function _pct(x) { return Math.round(x * 100); }
  function _ga(pos) { return pos === 'BTN' ? '이' : '가'; }
  function _eun(pos) { return pos === 'BTN' ? '은' : '는'; }
  function _bossOn() { try { return !!(typeof Boss !== 'undefined' && Boss && typeof Boss.active === 'function' && Boss.active()); } catch (e) { return false; } }
  function _omniOn() {
    try { if (typeof App !== 'undefined' && App && typeof App.omni === 'function' && App.omni()) return true; } catch (e) { /* noop */ }
    try { if (typeof OmniUI !== 'undefined' && OmniUI && typeof OmniUI.active === 'function' && OmniUI.active()) return true; } catch (e) { /* noop */ }
    return false;
  }
  function _chartOn() {
    if (typeof _env.chart === 'boolean') return _env.chart;
    var GC = _GC();
    try { return !!(GC && typeof GC.wanted === 'function' && GC.wanted()); } catch (e) { return false; }
  }
  function _phone() {
    if (typeof _env.phone === 'boolean') return _env.phone;
    try { return typeof window !== 'undefined' && !!window.matchMedia && !!window.matchMedia('(max-width: 600px), (orientation: portrait) and (max-width: 760px)').matches; } catch (e) { return false; }
  }
  function _phase() { try { return (typeof App !== 'undefined' && App && typeof App.phase === 'function') ? App.phase() : null; } catch (e) { return null; } }
  function _waiting() {
    if (_env.wait !== undefined) return _env.wait;
    var P = _P();
    try { return (P && typeof P.waiting === 'function') ? P.waiting() : null; } catch (e) { return null; }
  }
  // 지금 화면에 보이는 상태(엔진 _state는 공개 중 이미 최종이라 그대로 쓰면 아직 안 보인 행동이 샌다)
  function _display() {
    if (_env.state !== undefined) return _env.state;
    var w = _waiting();
    if (w && w.state) return w.state;
    var P = _P(), OC = _OC(), busy = false;
    try { busy = !!(P && typeof P.busy === 'function' && P.busy()); } catch (e) { busy = false; }
    if (busy && OC && typeof OC.curState === 'function') { var c = OC.curState(); if (c) return c; }
    try { return (typeof App !== 'undefined' && App && typeof App.liveState === 'function') ? App.liveState() : null; } catch (e) { return null; }
  }
  function _toast(msg, ms) {
    if (typeof _env.toast === 'function') { _env.toast(msg); return; }
    var d = _doc();
    if (!d || !d.body || !d.createElement) return;
    var old = d.getElementById ? d.getElementById('seat-toast') : null;
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var t = d.createElement('div');
    t.id = 'seat-toast';
    t.className = 'seat-toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    // 자리: 보이는 하단 바 바로 위(시트 머리줄과 좌석 칩을 가리지 않게). 바가 없으면 css 기본(아래에서 180px)
    try { var bt = _barTop(); if (bt.ih && bt.top < bt.ih) t.style.bottom = Math.round(bt.ih - bt.top + 12) + 'px'; } catch (e) { /* noop */ }
    d.body.appendChild(t);
    if (typeof setTimeout === 'function') setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 3200);
  }
  function _tipOnce() {
    var ls = null;
    try { ls = (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null; } catch (e) { ls = null; }
    try { if (ls && ls.getItem(TIP_KEY)) return false; } catch (e) { return false; }
    try { if (ls) ls.setItem(TIP_KEY, '1'); } catch (e) { /* noop */ }
    _toast('좌석을 누르면 그 사람 차트예요. 진행은 아래 ▶ 버튼이에요', 4200);
    return true;
  }

  // ── 대상(순수) ──
  // ctx = { waitSeat(Pacer 대기 좌석 이름), last(그 좌석의 마지막 공개된 프리플랍 기록 { act } | null), foldStreet(공개된 폴드 스트리트 | null) }
  //   → { name, pos, hero, kind('wait' | 'last' | 'ahead' | 'hero' | 'post' | 'hero-post'), street, folded, foldStreet } | null
  function target(state, name, ctx) {
    if (!state || !state.players || !name || !state.players[name]) return null;
    ctx = ctx || {};
    var pos = state.players[name].pos, hero = name === 'Hero';
    var street = state.street === 'showdown' ? 'river' : (state.street || 'preflop');
    var fs = ctx.foldStreet || null, kind;
    if (street === 'preflop') {
      if (hero) kind = 'hero';
      else if (ctx.waitSeat === name) kind = 'wait';
      else if (ctx.last) kind = 'last';
      else kind = 'ahead';
    } else kind = hero ? 'hero-post' : 'post';
    return { name: name, pos: pos, hero: hero, kind: kind, street: street, folded: !!fs, foldStreet: fs };
  }
  function _ctxOf(name, w) {
    var OC = _OC();
    return { waitSeat: w && w.seat ? w.seat : null, last: (OC && OC.lastShownPreflop) ? OC.lastShownPreflop(name) : null, foldStreet: (OC && OC.foldStreet) ? OC.foldStreet(name) : null };
  }

  // ── 블록 2, 3 재료 ──
  // 그 사람(또는 내 자리면 주 상대)의 범위와 공개 카드만 쓴다. 내 카드 = state.heroCards(상대 카드는 읽지 않는다)
  function _focusOf(state, name) {
    if (name !== 'Hero') return name;
    try { if (typeof WinChance !== 'undefined' && WinChance && typeof WinChance.target === 'function') return WinChance.target(state) || null; } catch (e) { /* noop */ }
    return null;
  }
  function _dead(state) {
    var out = [];
    (state.board || []).forEach(function(c) { if (c) out.push(c); });
    (state.heroCards || []).forEach(function(c) { if (c) out.push(c); });
    return out;
  }
  // stats = { focus, focusPos, pf(OppChart.pfOf), strength(RangeStats.strength | undefined = 계산 전 | null = 못 함), odds(RangeStats.odds), marker({ key, text } | null) }
  function _stats(state, name, compute) {
    var OC = _OC(), RS = _RS();
    var focus = _focusOf(state, name);
    var fpos = focus && state.players && state.players[focus] ? state.players[focus].pos : null;
    var pf = (focus && OC && OC.pfOf) ? OC.pfOf(focus) : null;
    var out = { focus: focus, focusPos: fpos, pf: pf, strength: undefined, odds: RS ? RS.odds(state, name) : null, marker: null };
    if (!RS) { out.strength = null; return out; }
    var labels = (pf && !pf.fold && !pf.random) ? pf.labels : null;
    var key = _skey(labels, state);
    if (compute || _computed[key]) { out.strength = RS.strength(labels, state.board, state.heroCards || []); _mark(key); }
    out.skey = key;
    return out;
  }
  // 한 번 계산한 (범위, 보드, 내 카드) 키(다음 그리기는 바로 그린다). 세션이 길어도 커지지 않게 64개에서 비운다
  var _computedN = 0;
  function _mark(key) { if (_computed[key]) return; if (++_computedN > 64) { _computed = {}; _computedN = 1; } _computed[key] = 1; }
  function _cs(cs) { return (cs || []).map(function(c) { return c ? c.rank + c.suit : ''; }).join(''); }
  function _skey(labels, state) { return (labels ? labels.length + ':' + labels.join(',') : '*') + '|' + _cs(state.board) + '|' + _cs(state.heroCards); }

  // 블록 HTML(순수): 블록 2(보드 위 범위 강도 분포), 블록 3(지금 벳 앞에서). 프리플랍이면 ''
  function blocksHTML(state, name, stats) {
    if (!state || !state.players || !state.players[name]) return '';
    var street = state.street === 'showdown' ? 'river' : state.street;
    if (!street || street === 'preflop') return '';
    stats = stats || {};
    var pos = state.players[name].pos, hero = name === 'Hero';
    var out = '<div class="sc-blocks">';
    out += _block2(state, name, pos, hero, stats);
    out += _block3(state, name, pos, hero, stats.odds);
    out += '</div>';
    return out;
  }
  function _block2(state, name, pos, hero, stats) {
    var pf = stats.pf, fpos = stats.focusPos || pos, sv = _SV();
    if (hero && !stats.focus) return '<section class="sc-blk sc-blk-range"><div class="sc-blk-h"><span aria-hidden="true">📊</span> 상대 범위가 보드에서 얼마나 강한가</div><div class="sc-blk-line sc-dim">남은 상대가 없어요</div></section>';
    var who = hero ? '주 상대 ' + fpos : fpos;
    var head = '<div class="sc-blk-h"><span aria-hidden="true">📊</span> ' + _esc(who) + ' 범위가 보드에서 얼마나 강한가</div>';
    if (pf && pf.fold) return '<section class="sc-blk sc-blk-range">' + head + '<div class="sc-blk-line sc-dim">' + _esc(fpos) + _ga(fpos) + ' 프리플랍에 폴드해서 범위가 없어요</div></section>';
    var rangeName = (!pf || pf.random) ? '랜덤 손(이 앱 차트에 칸이 없는 행동이라 참고)' : _esc(fpos) + ' ' + _esc(pf.word || '') + ' 범위 ' + pf.kinds + '종';
    var st = stats.strength;
    if (st === undefined) return '<section class="sc-blk sc-blk-range" aria-busy="true">' + head + '<div class="sc-blk-sub">' + rangeName + '</div><div class="sc-blk-line sc-dim">분포를 계산 중이에요</div></section>';
    if (!st || !st.n) return '<section class="sc-blk sc-blk-range">' + head + '<div class="sc-blk-line sc-dim">분포를 계산할 수 없어요</div></section>';
    var RS = _RS(), names = (RS && RS.NAMES) || {};
    var segs = SEG_KEYS.map(function(k) { return { key: k, label: names[k] || k, pct: st.pct[k] }; });
    var mk = null;
    if (stats.marker && stats.marker.key) {
      var at = 0;
      for (var i = 0; i < SEG_KEYS.length; i++) { if (SEG_KEYS[i] === stats.marker.key) { at += st.pct[SEG_KEYS[i]] / 2; break; } at += st.pct[SEG_KEYS[i]]; }
      mk = { pct: at, text: stats.marker.text || '실제 손' };
    }
    var bar = sv ? sv.stackBar(segs, { marker: mk, title: who + ' 범위 강도 분포' }) : '';
    var made = st.pct.nut + st.pct.strong + st.pct.medium;
    var chip = '<span class="sc-chip' + (st.random ? ' sc-chip-ref' : '') + '">' + (st.random ? '참고' : '엔진 계산') + '</span>';
    var line = '범위 ' + st.n + '콤보 가운데 중간 이상 ' + made + '%, 약한 페어 ' + st.pct.weakPair + '%, 드로우 ' + st.pct.draw + '%, 빈손 ' + st.pct.air + '%';
    var tip = st.pct.air >= 60 ? '<div class="sc-blk-tip">상대 범위의 ' + st.pct.air + '%가 빈손이에요. 빈손이 많으면 벳이 잘 통해요 <span class="sc-chip sc-chip-ref">참고</span></div>' : '';
    var desc = '<div class="sc-blk-desc">' + SEG_KEYS.filter(function(k) { return k !== 'air'; }).map(function(k) { return (names[k] || k) + ' = ' + ((RS && RS.DESC && RS.DESC[k]) || ''); }).join(', ') + '</div>';
    return '<section class="sc-blk sc-blk-range" aria-label="' + _esc(who) + ' 범위 강도 분포">' + head +
      '<div class="sc-blk-sub">' + rangeName + ', 살아 있는 ' + st.n + '콤보(보드와 내 카드 제외) ' + chip + '</div>' + bar +
      '<div class="sc-blk-line">' + line + '</div>' + tip + desc + '</section>';
  }
  function _block3(state, name, pos, hero, o) {
    if (!o) return '';
    var who = hero ? '나' : pos;
    var s = '<section class="sc-blk sc-blk-odds" aria-label="지금 벳 앞에서">' +
      '<div class="sc-blk-h"><span aria-hidden="true">🎯</span> 지금 벳 앞에서(' + _esc(who) + ')</div>' +
      '<div class="sc-blk-line">팟(상대 벳 포함) ' + _fmt(o.pot) + 'bb, 콜 ' + _fmt(o.toCall) + 'bb → 필요 승률 <b>' + _pct(o.need) + '%</b> <span class="sc-chip">엔진 계산</span></div>' +
      '<div class="sc-blk-why">필요 승률 = 콜 ÷ (팟 + 콜). 이보다 자주 이기면 콜이 이득이에요(이 콜이 마지막 돈일 때)</div>';
    if (o.mdf != null) {
      var bettor = state.lastRaiser && state.players[state.lastRaiser] ? (state.lastRaiser === 'Hero' ? '나' : state.players[state.lastRaiser].pos) : '벳한 사람';
      s += '<div class="sc-blk-line">이 벳에는 ' + (hero ? '내' : _esc(pos) + '의') + ' 범위 가운데 <b>' + _pct(o.mdf) + '%</b> 이상을 지켜야 해요(MDF) <span class="sc-chip sc-chip-ref">참고</span></div>' +
        '<div class="sc-blk-line">벳한 ' + _esc(bettor) + (bettor === '나' ? '는' : _eun(bettor)) + ' 상대가 <b>' + _pct(o.breakEven) + '%</b> 넘게 접으면 빈손으로 벳해도 손해가 아니에요(손익분기 폴드율) <span class="sc-chip sc-chip-ref">참고</span></div>' +
        '<div class="sc-blk-why">MDF와 손익분기는 서로 균형 잡힌 상대를 가정한 값이에요. 블러프를 안 하는 상대라면 더 많이 접어도 돼요</div>';
    } else if (o.multi) {
      s += '<div class="sc-blk-why">벳한 사람 말고 남은 사람이 둘 이상이라 MDF는 보이지 않아요(MDF와 손익분기는 1대1 식이에요. 여럿이면 벳한 쪽은 모두 접어야 이기고, 한 사람이 혼자 그만큼 지킬 필요도 없어요)</div>';
    }
    return s + '</section>';
  }

  // ── 그리기 ──
  function _later() {
    if (_env.sync) { _paint(); return; }
    var raf = (typeof window !== 'undefined' && window && typeof window.requestAnimationFrame === 'function') ? window.requestAnimationFrame : null;
    if (!raf) { _paint(); return; }
    if (_paintQ) return;
    _paintQ = true;
    raf(function() { _paintQ = false; try { _paint(); } catch (e) { if (typeof console !== 'undefined' && console.error) console.error('[SeatChart]', e); } });
  }
  // 다시 그릴지 가르는 서명(4.6절 2번 네 조건 + 대상 종류): 좌석 차례, 그 좌석 마지막 공개 기록, 보드 장수, 마주한 콜과 팟
  function _sig(st, name, w) {
    var OC = _OC(), ls = (OC && OC.lastShown) ? OC.lastShown(name) : null;
    var RS = _RS(), o = RS ? RS.odds(st, name) : null;
    var t = target(st, name, _ctxOf(name, w));
    return [t ? t.kind : '-', (w && w.seat === name) ? 'w' : '', ls ? ls.seq : -1, (st.board || []).length, o ? _fmt(o.toCall) + '/' + _fmt(o.pot) : ''].join('|');
  }
  // 그리기(rAF 안). force = 서명이 같아도 그린다(처음 열 때, 좌석 바꿈, 분포 계산 뒤), first = 처음 열 때(접힌 차트 시트를 편다)
  function _paint(force, first) {
    if (!_open) return false;
    var st = _display(), w = _waiting(), name = _open.name;
    if (!st || !st.players || !st.players[name]) { close(); return false; }
    var sig = _sig(st, name, w);
    if (!force && sig === _open.sig && !_open.pending) return false;
    _open.sig = sig;
    var OC = _OC(), GC = _GC();
    if (!OC || !GC) return false;
    var hero = name === 'Hero', street = st.street === 'showdown' ? 'river' : st.street;
    var post = street && street !== 'preflop';
    var stats = post ? _stats(st, name, !!_env.sync) : null;
    var sit = OC.seatSit(name, st, w);
    _paints++;
    if (_open.mode === 'gto') {
      // 차트 칩이 켜져 있으면 차트 시트를 쓴다. 내 자리 프리플랍은 GtoChart의 내 차트(결정 전 가림 규칙 그대로)
      OC.pinSeat(name);
      var hasMe = hero && !post && typeof GC.hasHero === 'function' && GC.hasHero(OC._state && OC._state().hand ? OC._state().hand.key : undefined);
      if (hasMe) { OC.pinSeat(null); GC.seatView(null, { persp: OC.perspHTML() }); }
      else if (sit) {
        sit.extra = post ? blocksHTML(st, name, stats) : '';
        sit.persp = OC.perspHTML();
        GC.seatView(sit);
      } else { _paints--; return false; }
      // 처음 열 때만 접힌 시트를 편다(사용자가 ✕ 닫기로 접은 뒤의 다시 그리기는 접힌 채로 둔다)
      if (first) { try { if (typeof GC._state === 'function' && GC._state().peek && typeof GC._setPeek === 'function') GC._setPeek(false); } catch (e) { /* noop */ } }
    } else {
      OC.pinSeat(null);
      _ownRender(st, name, sit, post ? blocksHTML(st, name, stats) : '');
    }
    // 포스트플랍은 블록(범위 분포, 팟 오즈)이 이 시트의 주인공이라 처음 그릴 때(좌석과 스트리트마다 1번) 본문을 블록까지 내린다
    if (post && _open.scrolled !== name + '|' + street) { _open.scrolled = name + '|' + street; _scrollToBlocks(); }
    // 분포는 다음 프레임에 1회 계산하고 다시 그린다(같은 범위, 보드, 데드는 캐시)
    _open.pending = false;
    if (post && stats && stats.strength === undefined) {
      _open.pending = true;
      _open.sig = null;
      _schedCompute(stats.skey);
    }
    return true;
  }
  // 차트 시트는 새 내용이면 다음 프레임에 본문을 맨 위로 올리므로 그 뒤(두 프레임 뒤)에 내린다
  function _scrollToBlocks() {
    var raf = (typeof window !== 'undefined' && window && typeof window.requestAnimationFrame === 'function') ? window.requestAnimationFrame : null;
    if (!raf || _env.sync) return;
    raf(function() { raf(function() {
      try {
        var d = _doc(), mode = _open && _open.mode;
        var body = d && d.querySelector ? d.querySelector(mode === 'own' ? '#seat-sheet .seat-sheet-body' : '#gto-sheet .gto-sheet-body') : null;
        var blk = body && body.querySelector ? body.querySelector('.sc-blocks') : null;
        if (!body || !blk || !(body.scrollHeight > body.clientHeight)) return;
        body.scrollTop = Math.max(0, blk.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 52);
      } catch (e) { /* noop */ }
    }); });
  }
  function _schedCompute(key) {
    var raf = (typeof window !== 'undefined' && window && typeof window.requestAnimationFrame === 'function') ? window.requestAnimationFrame : null;
    var run = function() {
      if (!_open) return;
      var st = _display();
      if (!st || !st.players || !st.players[_open.name]) return;
      _stats(st, _open.name, true);
      _mark(key);
      _paint(true);
    };
    if (_env.sync || !raf) { run(); return; }
    raf(function() { try { run(); } catch (e) { if (typeof console !== 'undefined' && console.error) console.error('[SeatChart]', e); } });
  }

  // ── 자체 좌석 시트(차트 칩이 꺼져 있을 때) ──
  function _ensureSheet() {
    var d = _doc();
    if (!d || !d.createElement) return null;
    if (_sheet && _sheet.root && _sheet.root.parentNode) return _sheet;
    var root = d.createElement('div');
    root.id = 'seat-sheet';
    root.className = 'seat-sheet gto-big';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '좌석 차트');
    // 머리줄 = 손잡이(그립, 제목, 상황, 누르거나 아래로 끌면 닫기) + 닫기 버튼(형제, 손잡이 끌기의 포인터 캡처와 섞이지 않게)
    var head = d.createElement('div');
    head.className = 'sheet-head seat-sheet-head';
    var grab = d.createElement('div');
    grab.className = 'seat-sheet-handle';
    grab.innerHTML = '<span class="seat-sheet-grip" aria-hidden="true"></span><span class="sheet-title seat-sheet-title"></span><span class="seat-sheet-ctx"></span>';
    head.appendChild(grab);
    var close = d.createElement('button');
    close.type = 'button';
    close.className = 'sheet-close seat-sheet-close';
    close.setAttribute('aria-label', '좌석 차트 닫기');
    close.innerHTML = '<span aria-hidden="true">✕</span><span class="sheet-close-t">닫기</span>';
    head.appendChild(close);
    var body = d.createElement('div');
    body.className = 'seat-sheet-body';
    root.appendChild(head);
    root.appendChild(body);
    var parent = (d.getElementById && d.getElementById('screen-game')) || d.body;
    if (parent && parent.appendChild) parent.appendChild(root);
    close.addEventListener('click', function(e) { if (e && e.stopPropagation) e.stopPropagation(); closeSheet(); });
    root.addEventListener('click', _onSheetClick);
    _sheet = { root: root, head: head, grab: grab, title: grab.querySelector ? grab.querySelector('.seat-sheet-title') : null, ctx: grab.querySelector ? grab.querySelector('.seat-sheet-ctx') : null, close: close, body: body };
    if (typeof SheetGesture !== 'undefined' && SheetGesture && typeof SheetGesture.bind === 'function') {
      try { SheetGesture.bind(root, grab, { isPeek: function() { return false; }, onClose: function() { closeSheet(); }, onTap: function() { closeSheet(); } }); } catch (e) { /* noop */ }
    }
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', function() { if (_open && _open.mode === 'own') _place(); });
    return _sheet;
  }
  function closeSheet() { close(); }
  function _barTop() {
    var d = _doc(), ih = (typeof window !== 'undefined' && window.innerHeight) || 0, top = ih;
    var ids = (typeof NextBar !== 'undefined' && NextBar && Array.isArray(NextBar.BARS)) ? NextBar.BARS : ['action-bar', 'result-actions-bar'];
    ids.forEach(function(id) {
      var b = d && d.getElementById ? d.getElementById(id) : null;
      if (!b || !b.getBoundingClientRect || (b.style && b.style.display === 'none') || !(b.offsetHeight > 0)) return;
      var r = b.getBoundingClientRect();
      if (r.height > 0 && r.top < top && r.top > ih * 0.4) top = r.top;
    });
    return { ih: ih, top: top };
  }
  function _place() {
    if (!_sheet || !_sheet.root || !_sheet.root.style || typeof window === 'undefined') return;
    // 폰: 화면 폭 시트(위 끝은 승률 칩 줄 아래 56px). 데스크톱: 차트 패널 자리(왼쪽, 위 끝은 액션 로그 패널 아래 144px)
    var b = _barTop(), bottom = Math.max(0, Math.round(b.ih - b.top)), top = _phone() ? 56 : 144;
    _sheet.root.style.bottom = (bottom + (_phone() ? 0 : 8)) + 'px';
    _sheet.root.style.maxHeight = Math.max(240, b.ih - bottom - top) + 'px';
  }
  function _ownRender(st, name, sit, extra) {
    var sh = _ensureSheet(), GC = _GC(), OC = _OC();
    if (!sh || !GC) return false;
    var pos = st.players[name].pos, hero = name === 'Hero';
    var html = '';
    if (sit) {
      // 내 손 칸은 포스트플랍만(프리플랍은 결정 전 가림 규칙을 우회하지 않게 손 칸 없이)
      var heroCards = (hero && st.street !== 'preflop') ? (sit.cards || null) : null;
      html = GC.chartHTML(sit, heroCards, { opp: sit.opp || null, extra: extra, street: sit.street, seatLabel: sit.opp ? null : sit.label, flash: false,
        ana: { raiser: sit.raiser || null } });   // (n4-merge) 분석 보기 상대 범위 = 그 자리가 맞은 3벳, 4벳의 자리(차트 시트 seatView와 같은 재료)
    } else html = '<div class="sc-dim seat-sheet-empty">이 자리의 차트 자료가 없어요</div>';
    var persp = OC && OC.perspHTML ? OC.perspHTML(name) : '';   // 눌린 칩 = 이 시트의 좌석(자체 시트는 OppChart 핀이 없다)
    // 위치 비교 띠(같은 상황 다른 자리)는 좌석 칩과 겹쳐 좌석 시트에서는 뺀다
    html = html.replace(/<div class="gto-pos-strip">[\s\S]*?<\/div><\/div>/, '');
    // 자리 잡기(하단 바 위치 읽기)는 새 내용을 쓰기 전에 한다. 쓴 뒤에 읽으면 격자 169칸 강제 레이아웃이 결정 동기 블록 안에서 일어난다(4배 스로틀 실측 110ms)
    sh.root.classList.toggle('is-phone', _phone());
    _big(!_phone());
    _place();
    var full = (persp ? '<div class="gto-persp">' + persp + '</div>' : '') + html;
    if (sh._html !== full) { sh.body.innerHTML = full; sh._html = full; }
    var ttl = hero ? '📋 내 차트(' + pos + ')' : '👀 ' + pos + ' 차트';
    if (sh.title && sh.title.textContent !== ttl) sh.title.textContent = ttl;
    // 머리줄 상황 글: 상대는 상대 차트 짧은 글, 내 자리는 프리플랍 상황(오픈, 오픈 대응 등) 또는 지금 스트리트
    var ctx = '';
    if (sit && sit.opp) ctx = String(sit.opp.short || '');
    else if (sit) ctx = (sit.street && sit.street !== 'preflop') ? '지금은 ' + (STREET_KOR[sit.street] || sit.street) + ', 프리플랍 참고' : ((OC && OC.sitText) ? OC.sitText(sit) : '');
    if (sh.ctx && sh.ctx.textContent !== ctx) sh.ctx.textContent = ctx;
    sh.root.setAttribute('aria-label', pos + ' 좌석 차트');
    sh.close.setAttribute('aria-label', pos + ' 좌석 차트 닫기');
    sh.root.classList.toggle('is-opp', !hero);
    sh.root.classList.toggle('gto-dim', !!(sit && sit.street && sit.street !== 'preflop'));
    sh.root.style.display = '';
    sh._model = sit ? GC.situationModel(sit) : null;
    if (typeof GC.syncViews === 'function') { try { GC.syncViews(sh.root); } catch (e) { /* noop */ } }
    return true;
  }
  function _onSheetClick(e) {
    var t = e && e.target;
    if (!t || !t.closest) return;
    var GC = _GC(), OC = _OC(), el;
    if ((el = t.closest('.gv-chip'))) { if (GC && GC.onViewChip) GC.onViewChip(el); if (_open) { _open.sig = null; _later(); } return; }
    if ((el = t.closest('[data-oc]'))) {
      var v = el.getAttribute('data-oc');
      if (v === 'me') open('Hero');
      else if (v && v.charAt(0) === '@' && OC && OC.nameAtPos) { var nm = OC.nameAtPos(v.slice(1)); if (nm) open(nm); }
      return;
    }
    if (t.closest('.gto-bubble-close')) { _closeBubble(); return; }
    if ((el = t.closest('.gto-cell'))) { _bubble(el); return; }
    if (t.closest('.gto-lab-btn')) {
      var m = _sheet && _sheet._model;
      if (m && typeof JourneyUI !== 'undefined' && JourneyUI && typeof JourneyUI.view === 'function') { try { close(); JourneyUI.view('rangeLab', { pos: m.pos, facing: m.facing, opener: m.opener, limpers: m.limpers || 0 }); } catch (x) { /* noop */ } }
      return;
    }
    if (!t.closest('.gto-bubble')) _closeBubble();
  }
  function _closeBubble() {
    var b = _sheet && _sheet.body && _sheet.body.querySelector ? _sheet.body.querySelector('.gto-bubble') : null;
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }
  function _bubble(cellEl) {
    var GC = _GC(), m = _sheet && _sheet._model, d = _doc();
    if (!GC || !m || !d || typeof GC._bubbleHTML !== 'function') return;
    var r = +cellEl.getAttribute('data-r'), c = +cellEl.getAttribute('data-c');
    var old = _sheet.body.querySelector('.gto-bubble');
    var same = old && old.getAttribute('data-rc') === r + ',' + c;
    _closeBubble();
    if (same) return;
    var wrap = d.createElement('div');
    // (n4-merge) 분석 보기 격자면 G2의 위험도 문장 말풍선(차트 시트와 같은 경로, GtoChart._gaFromGrid)
    var ga = (typeof GC._gaFromGrid === 'function') ? GC._gaFromGrid(cellEl.parentNode) : null;
    wrap.innerHTML = GC._bubbleHTML(m, r, c, ga);
    var b = wrap.firstChild;
    if (!b) return;
    b.setAttribute('data-rc', r + ',' + c);
    _sheet.body.appendChild(b);
    try {
      var host = _sheet.body, hr = host.getBoundingClientRect(), cr = cellEl.getBoundingClientRect();
      var bw = b.offsetWidth || 240, bh = b.offsetHeight || 120, hostW = host.clientWidth || 0;
      var top = cr.top - hr.top + (host.scrollTop || 0), left = cr.left - hr.left;
      var x = Math.max(4, Math.min(left + cr.width / 2 - bw / 2, hostW - bw - 4));
      var y = (r < 7) ? top + cr.height + 6 : top - bh - 6;
      if (y < 0) y = top + cr.height + 6;
      b.style.left = x + 'px'; b.style.top = y + 'px';
    } catch (x) { /* noop */ }
  }

  // ── 열기, 닫기 ──
  function open(name) {
    if (!name) return false;
    if (_bossOn()) { _toast('승급 시험 중에는 차트를 볼 수 없어요'); return false; }
    if (_omniOn()) return false;
    var st = _display();
    if (!st || !st.players || !st.players[name] || st.spectator) return false;
    var chart = _chartOn();
    // 내 차례에 내 차트는 📋 차트 칩으로 본다(차트를 보고 한 결정은 힌트로 기록된다, 좌석 시트로 우회하지 않게)
    if (name === 'Hero' && !chart && _phase() === 'hero') { _toast('내 차례에 내 차트는 위 📋 차트 칩으로 볼 수 있어요(힌트로 기록돼요)'); return false; }
    var prev = _open;
    _open = { name: name, mode: chart ? 'gto' : 'own', sig: null, pending: false };
    if (prev && prev.mode === 'own' && _open.mode === 'gto') _hideOwn();
    _opens++;
    _tipOnce();
    _paint(true, true);
    return true;
  }
  function _hideOwn() { if (_sheet && _sheet.root && _sheet.root.style) _sheet.root.style.display = 'none'; _closeBubble(); _big(false); }
  // 하단 바 위 끝(자체 시트 자리)은 바가 바뀌거나(내 차례, 다음 바, 결과바) 화면 크기가 바뀔 때만 다시 읽는다
  // 데스크톱: 차트 패널처럼 테이블을 오른쪽으로 비켜 세운다(html.chart-big, css/chart.css). 차트 패널이 떠 있으면 그대로 둔다
  var _bigMine = false;
  function _big(on) {
    var d = _doc(), de = d && d.documentElement;
    if (!de || !de.classList) return;
    if (on) { if (!de.classList.contains('chart-big')) { de.classList.add('chart-big'); _bigMine = true; } return; }
    if (!_bigMine) return;
    _bigMine = false;
    var gc = d.getElementById ? d.getElementById('gto-chart') : null;
    if (!(gc && gc.style && gc.style.display !== 'none' && gc.classList && gc.classList.contains('big'))) de.classList.remove('chart-big');
  }
  function close() {
    if (!_open) { _hideOwn(); return false; }
    var was = _open;
    _open = null;
    var OC = _OC();
    if (was.mode === 'own') _hideOwn();
    else if (OC && OC.pinned && OC.pinned() && OC._release) OC._release();
    return true;
  }
  // OppChart가 핀을 풀었다(차트 시트가 접혔거나 내 차트 칩). 좌석 시트 상태만 정리한다
  function _released() { if (_open && _open.mode === 'gto') _open = null; }
  function isOpen() { return _open ? _open.name : null; }

  // ── 이벤트 ──
  function _onEvent() { if (_open) _later(); }
  function _onChart(kind, data) {
    if (!_open) return;
    if (kind === 'hero' || kind === 'hide') { var m = _open.mode; _open = null; if (m === 'own') _hideOwn(); return; }
    if (kind === 'refresh') { close(); }
  }
  function _onPhase(e) {
    var p = e && e.detail ? e.detail.phase : null;
    if (p === 'none') { close(); return; }
    _onEvent();
  }
  // 좌석 누름(document 위임, 펠트 누름은 Pacer가 걸음으로 쓴다)
  function _onDocClick(e) {
    var t = e && e.target;
    if (!t || typeof t.closest !== 'function') return false;
    var seat = t.closest('#screen-game .poker-table .seat');
    if (!seat || !seat.id || seat.id.indexOf('seat-') !== 0) return false;
    var d = _doc(), sc = d && d.getElementById ? d.getElementById('screen-game') : null;
    if (sc && sc.classList && (sc.classList.contains('th-on') || sc.classList.contains('omni-replay') || sc.classList.contains('omni-replaying'))) return false;
    if (_omniOn()) return false;   // 완전 분석은 OmniUI가 좌석 패널을 연다
    var pos = seat.id.slice(5).toUpperCase(), st = _display();
    if (POS6.indexOf(pos) < 0 || !st || !st.players) return false;
    var name = null;
    Object.keys(st.players).forEach(function(n) { if (st.players[n] && st.players[n].pos === pos) name = n; });
    if (!name) return false;
    if (typeof TouchUI !== 'undefined' && TouchUI && typeof TouchUI.hideTip === 'function') { try { TouchUI.hideTip(); } catch (x) { /* noop */ } }
    if (_open && _open.name === name && _open.mode === 'own' && _sheet && _sheet.root.style.display !== 'none') { close(); return true; }   // 같은 좌석 다시 누름 = 닫기
    return open(name);
  }
  function init() {
    if (_inited) return false;
    var d = _doc();
    if (!d || typeof d.addEventListener !== 'function') return false;
    _inited = true;
    d.addEventListener('click', _onDocClick);
    d.addEventListener('pace:wait', function() { try { _onEvent(); } catch (x) { /* noop */ } });
    d.addEventListener('hand:phase', function(e) { try { _onPhase(e); } catch (x) { /* noop */ } });
    var OC = _OC(), GC = _GC();
    if (OC && typeof OC.onShown === 'function') OC.onShown(function() { _onEvent(); });
    if (GC && typeof GC.on === 'function') GC.on(_onChart);
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('keydown', function(e) { if (e && e.key === 'Escape' && _open && _open.mode === 'own') close(); });
    }
    return true;
  }
  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') init();

  function _setEnv(o) { if (!o) { _env = {}; return _env; } Object.keys(o).forEach(function(k) { _env[k] = o[k]; }); return _env; }
  function _state() { return { open: _open ? { name: _open.name, mode: _open.mode, pending: !!_open.pending } : null, paints: _paints, opens: _opens, sheet: !!(_sheet && _sheet.root && _sheet.root.style && _sheet.root.style.display !== 'none') }; }
  function _reset() { _open = null; _paintQ = false; _paints = 0; _opens = 0; _computed = {}; _computedN = 0; _hideOwn(); }

  return { STUB: false, TIP_KEY: TIP_KEY, init: init, open: open, close: close, target: target, blocksHTML: blocksHTML, isOpen: isOpen,
    _setEnv: _setEnv, _state: _state, _reset: _reset, _released: _released, _onDocClick: _onDocClick, _paint: _paint, _sig: _sig, _stats: _stats, _display: _display, _onChart: _onChart };
})();
