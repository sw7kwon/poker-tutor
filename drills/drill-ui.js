// drills/drill-ui.js — 8차 WP6: '⚡ 드릴 훈련' 허브 + 20문항 세션 + 결과바 '⚡ 1문제' 퀵 모달
// DOM 접근은 함수 안에서만. keydown 리스너는 openHub/quickOne 첫 호출 시 1회 등록.
var DrillUI = (function() {
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var RED = { h: 1, d: 1 };
  var HOTKEY = { fold: 'F', call: 'C', raise: 'R' };
  var _bound = false;
  var _s = null;        // 진행 중 세션
  var _quick = null;    // 퀵 모달 상태 {el, q, t0, done}
  var _timer = null;

  function $(id) { return document.getElementById(id); }
  function _esc(s) { return String(s).replace(/[&<>"]/g, function(ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function _show(id, on) { var el = $(id); if (el) el.style.display = on ? '' : 'none'; }
  function _set(id, html) { var el = $(id); if (el) el.innerHTML = html; }

  function _cardsHTML(cards) {
    return cards.map(function(c) {
      return '<div class="card drill-card ' + (RED[c.suit] ? 'red' : 'black') + '">' +
        (c.rank === 'T' ? '10' : c.rank) + SUIT_SYM[c.suit] + '</div>';
    }).join('');
  }

  function _optLabel(q, o) {
    if (q.type === 'potodds') return q.labels[o];
    var gen = Drills.get('preflop');
    return gen && gen.actionLabel ? gen.actionLabel(q, o) : o;
  }

  function _choicesHTML(q, prefix) {
    return q.options.map(function(o, i) {
      var hk = (i + 1) + (HOTKEY[o] && q.type === 'preflop' ? '/' + HOTKEY[o] : '');
      return '<button class="drill-choice drill-' + _esc(o) + '" data-opt="' + _esc(o) + '" onclick="DrillUI.' + prefix + '(\'' + _esc(o) + '\')">' +
        '<span class="drill-key">' + hk + '</span>' + _esc(_optLabel(q, o)) + '</button>';
    }).join('');
  }

  function _spotLabel(q) {
    if (q.type !== 'preflop') return '팟의 ' + q.f + ' 크기 벳';
    if (q.kind === 'rfi') return q.pos + ' 오픈(앞 전원 폴드)';
    if (q.kind === 'vsRfi') return q.pos + ' vs ' + (q.opener || '상대') + ' 오픈';
    return q.pos + ' 오픈 후 3벳 맞음';
  }

  function _miniGrid(model, cell) {
    if (!model) return '';
    var html = '<div class="drill-mini">';
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var x = model.cells[r][c];
      var hit = cell && cell.r === r && cell.c === c;
      html += '<div class="mini-cell mini-' + x.action + (hit ? ' mini-hit' : '') + '" title="' + x.label + '">' + (hit ? x.label : '') + '</div>';
    }
    html += '</div><div class="drill-legend"><span class="lg lg-raise">레이즈</span><span class="lg lg-call">콜</span><span class="lg lg-fold">폴드</span></div>';
    return html;
  }

  // ── 키보드 ──────────────────────────────────────────
  function _onKey(e) {
    var k = (e.key || '').toLowerCase();
    if (_quick && !_quick.done) {
      if (_handleKey(k, _quick.q, quickAnswer)) { e.preventDefault(); e.stopImmediatePropagation(); }
      else if (k === 'escape') { closeQuick(); e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (_quick) { e.stopImmediatePropagation(); return; }
    var scr = $('screen-drill');
    if (!scr || !scr.classList.contains('active') || !_s) return;
    if (_s.waiting && (k === ' ' || k === 'enter')) { e.preventDefault(); _next(); return; }
    if (!_s.waiting && !_s.answered && _handleKey(k, _s.q, answer)) e.preventDefault();
  }

  function _handleKey(k, q, fn) {
    if (!q) return false;
    var idx = parseInt(k, 10);
    if (idx >= 1 && idx <= q.options.length) { fn(q.options[idx - 1]); return true; }
    if (q.type === 'preflop') {
      var map = { f: 'fold', c: 'call', r: 'raise' };
      if (map[k] && q.options.indexOf(map[k]) >= 0) { fn(map[k]); return true; }
    }
    return false;
  }

  function _bind() {
    if (_bound) return;
    _bound = true;
    try { window.addEventListener('keydown', _onKey, true); } catch (e) { /* noop */ }
  }

  // ── 허브 ────────────────────────────────────────────
  function openHub() {
    _bind();
    if (typeof App !== 'undefined' && App.showScreen) App.showScreen('screen-drill');
    _renderHub();
  }

  function _renderHub() {
    _s = null;
    clearTimeout(_timer);
    _show('drill-hub', true); _show('drill-stage', false); _show('drill-result', false);
    _set('drill-title', '⚡ 드릴 훈련'); _set('drill-progress', ''); _set('drill-streak', '');
    var due = Drills.dueCount('preflop');
    var td = Drills.today();
    var pf = Drills.stats('preflop'), po = Drills.stats('potodds');
    var acc = td.n ? Math.round(td.ok / td.n * 100) : 0;
    _set('drill-hub',
      '<div class="drill-intro">짧은 문제를 빠르게 반복해 <b>매 핸드 나오는 판단</b>을 몸에 익혀요. 틀린 문제는 10분 뒤, 맞힌 문제는 점점 긴 간격(1일, 3일, 7일…)으로 다시 나와요(간격반복).</div>' +
      '<button class="drill-tile" onclick="DrillUI.start(\'preflop\')"><div class="tile-title">🃏 프리플랍 레인지</div>' +
      '<div class="tile-sub">자리별로 참여할 패 목록(레인지)을 외워요. 복습 대기 <b>' + due + '</b>장</div>' +
      '<div class="tile-sub dim">누적 ' + pf.n + '문제 · 최고 연속 ' + pf.best + '</div></button>' +
      '<button class="drill-tile" onclick="DrillUI.start(\'potodds\')"><div class="tile-title">🧮 팟 오즈 암산</div>' +
      '<div class="tile-sub">상대 벳에 콜하려면 몇 번에 1번 이겨야 본전인지 빠르게 계산해요</div>' +
      '<div class="tile-sub dim">누적 ' + po.n + '문제 · 최고 연속 ' + po.best + '</div></button>' +
      '<div class="drill-today">오늘 푼 문제 <b>' + td.n + '</b>개 · 정답률 <b>' + acc + '%</b></div>');
  }

  // ── 세션 ────────────────────────────────────────────
  function start(type, opts) {
    _bind();
    var gen = Drills.get(type);
    if (!gen) return;
    if (typeof App !== 'undefined' && App.showScreen) App.showScreen('screen-drill');
    opts = opts || {};
    _s = { type: type, gen: gen, count: opts.count || 20, n: 0, results: [], pending: [], streak: 0,
      rnd: Drills.rng((Date.now() ^ 0x5bd1e995) >>> 0), q: null, answered: false, waiting: false, t0: 0 };
    _show('drill-hub', false); _show('drill-result', false); _show('drill-stage', true);
    _set('drill-title', gen.title);
    _next();
  }

  function _next() {
    if (!_s) return;
    clearTimeout(_timer);
    if (_s.n >= _s.count) { _showResult(); return; }
    var q = null;
    for (var i = 0; i < _s.pending.length; i++) {
      if (_s.pending[i].at <= _s.n) { q = _s.pending.splice(i, 1)[0].q; q.retry = true; break; }
    }
    if (!q) q = _s.gen.next(_s.rnd, {});
    if (!q) { _showResult(); return; }
    _s.q = q; _s.answered = false; _s.waiting = false; _s.t0 = Date.now();
    _set('drill-progress', (_s.n + 1) + '/' + _s.count);
    _set('drill-streak', _s.streak >= 2 ? '🔥 연속 ' + _s.streak : '');
    var tag = q.retry ? '<span class="drill-tag">다시 풀기</span>' : (q.review ? '<span class="drill-tag">복습</span>' : '');
    _set('drill-prompt', tag + _esc(q.prompt));
    _set('drill-cards', q.type === 'preflop' ? _cardsHTML(q.cards) :
      '<div class="drill-pot">팟 <b>' + q.P + 'bb</b> + 상대 벳 <b>' + q.B + 'bb</b></div>');
    _set('drill-choices', _choicesHTML(q, 'answer'));
    _set('drill-feedback', '');
  }

  function answer(opt) {
    if (!_s || !_s.q || _s.answered) return;
    var q = _s.q;
    _s.answered = true;
    var ms = Date.now() - _s.t0;
    var ok = opt === q.answer;
    Drills.record(q.type, q.key, ok, ms);
    _s.results.push({ ok: ok, ms: ms, spot: _spotLabel(q) });
    _s.n += 1;
    _s.streak = ok ? _s.streak + 1 : 0;
    var btns = document.querySelectorAll('#drill-choices .drill-choice');
    for (var i = 0; i < btns.length; i++) {
      var o = btns[i].getAttribute('data-opt');
      if (o === q.answer) btns[i].classList.add('is-answer');
      else if (o === opt) btns[i].classList.add('is-wrong');
      btns[i].disabled = true;
    }
    if (ok) {
      _set('drill-feedback', '<div class="fb-ok">✅ 정답!</div>');
      _timer = setTimeout(_next, 700);
      return;
    }
    var ex = _s.gen.explain(q);
    _s.pending.push({ at: _s.n + 3, q: q });
    _s.waiting = true;
    _set('drill-feedback', '<div class="fb-bad">❌ 정답: <b>' + _esc(_optLabel(q, q.answer)) + '</b></div>' +
      '<div class="fb-line">' + _esc(ex.line) + '</div>' + _miniGrid(ex.model, ex.cell) +
      '<button class="menu-btn drill-next" onclick="DrillUI.next()">다음 <span class="kb-hint">(Space)</span></button>');
  }

  function _showResult() {
    var r = _s.results;
    var ok = r.filter(function(x) { return x.ok; }).length;
    var avg = r.length ? (r.reduce(function(a, x) { return a + x.ms; }, 0) / r.length / 1000) : 0;
    var by = {};
    r.forEach(function(x) { var b = by[x.spot] || (by[x.spot] = { n: 0, ok: 0 }); b.n++; if (x.ok) b.ok++; });
    var rows = Object.keys(by).map(function(k) {
      return '<div class="res-row"><span>' + _esc(k) + '</span><span>' + by[k].ok + '/' + by[k].n + '</span></div>';
    }).join('');
    _show('drill-stage', false); _show('drill-result', true);
    _set('drill-progress', ''); _set('drill-streak', '');
    var type = _s.type;
    _set('drill-result',
      '<div class="res-head">' + ok + '/' + r.length + ' | 평균 응답 ' + avg.toFixed(1) + '초</div>' +
      '<div class="res-sub">스팟별 정답률</div>' + rows +
      '<div class="res-btns"><button class="menu-btn" onclick="DrillUI.start(\'' + type + '\')">같은 드릴 다시</button>' +
      '<button class="menu-btn secondary" onclick="DrillUI.hub()">허브</button>' +
      '<button class="menu-btn secondary" onclick="DrillUI.menu()">메뉴</button></div>');
    _s.done = true;
  }

  function exit() {
    var stage = $('drill-stage'), res = $('drill-result');
    var inSession = (stage && stage.style.display !== 'none') || (res && res.style.display !== 'none');
    if (inSession) { _renderHub(); return; }
    menu();
  }
  function menu() { _s = null; clearTimeout(_timer); if (typeof App !== 'undefined' && App.showMenu) App.showMenu(); }

  // ── 결과바 ⚡ 1문제 (게임 화면 위 떠 있는 패널, 결과바는 가리지 않음) ──
  function quickOne() {
    _bind();
    closeQuick();
    var gen = Drills.get('preflop');
    if (!gen) return;
    var q = gen.next(Drills.rng((Date.now() ^ 0x2545f491) >>> 0), { dueFirst: true });
    if (!q) return;
    var el = document.createElement('div');
    el.className = 'drill-quick';
    el.id = 'drill-quick';
    el.innerHTML = '<button class="drill-quick-close" onclick="DrillUI.closeQuick()" title="닫기">✕</button>' +
      '<div class="drill-quick-title">⚡ 1문제' + (q.review ? ' <span class="drill-tag">복습</span>' : '') + '</div>' +
      '<div class="drill-quick-prompt">' + _esc(q.prompt) + '</div>' +
      '<div class="drill-quick-cards">' + _cardsHTML(q.cards) + '</div>' +
      '<div class="drill-quick-choices">' + _choicesHTML(q, 'quickAnswer') + '</div>' +
      '<div class="drill-quick-fb"></div>';
    document.body.appendChild(el);
    _quick = { el: el, q: q, t0: Date.now(), done: false };
  }

  function quickAnswer(opt) {
    if (!_quick || _quick.done) return;
    var q = _quick.q;
    _quick.done = true;
    var ok = opt === q.answer;
    Drills.record('preflop', q.key, ok, Date.now() - _quick.t0);
    var fb = _quick.el.querySelector('.drill-quick-fb');
    var ex = Drills.get('preflop').explain(q);
    if (fb) fb.innerHTML = ok ? '<span class="fb-ok">✅ 정답! ' + _esc(_optLabel(q, q.answer)) + '</span>' :
      '<span class="fb-bad">❌ 정답은 ' + _esc(_optLabel(q, q.answer)) + '</span> <span class="fb-line">' + _esc(ex.line) + '</span>';
    var btns = _quick.el.querySelectorAll('.drill-choice');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
    var cur = _quick;
    setTimeout(function() { if (_quick === cur) closeQuick(); }, ok ? 1500 : 3000);
  }

  function closeQuick() {
    if (_quick && _quick.el && _quick.el.parentNode) _quick.el.parentNode.removeChild(_quick.el);
    _quick = null;
  }

  var api = { openHub: openHub, start: start, answer: answer, next: _next, exit: exit, hub: _renderHub, menu: menu,
    quickOne: quickOne, quickAnswer: quickAnswer, closeQuick: closeQuick };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
