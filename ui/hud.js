// ui/hud.js
// R7(G2 DOCK): 코칭 패널 순서(승률 -> 판정 상세 -> 숫자 보기 EV 표 -> 용어)와 접기 버튼, 판정 상세는 추천(✅) 줄 먼저,
//   코칭 문구(coaching-text)는 판정 상세와 겹치면 숨김, 무늬 기호는 Cards.colorize(4색 글자).
// R3 배선: update -> RaiseInfo.onDecision(ctx), clear -> RaiseInfo.clear()(둘 다 typeof 가드, 예외는 삼킴)
var HUD = (function() {
  // 접기 상태(세션 메모리, 결정과 핸드를 넘어 유지): EV 표는 폰에서만 접힘이 기본(데스크톱은 CSS가 늘 펼침), 용어는 늘 접힘이 기본
  var _fold = { ev: false, gl: false };

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function _cz(html) {
    return (typeof Cards !== 'undefined' && Cards && typeof Cards.colorize === 'function') ? Cards.colorize(html) : html;
  }
  // 판정 상세 줄 순서: 추천(✅) -> 승률(📊) -> 팁(💡) -> 상황(📍) -> 기준(📐) -> 그 밖(같은 무리는 원래 순서)
  var BX_ORDER = [['✅', 0], ['📊', 1], ['💡', 2], ['📍', 3], ['📐', 4]];
  function _rank(l) {
    var s = String(l);
    for (var i = 0; i < BX_ORDER.length; i++) if (s.indexOf(BX_ORDER[i][0]) === 0) return BX_ORDER[i][1];
    return 5;
  }
  function orderLines(lines) {
    return (lines || []).map(function(l, i) { return { l: l, i: i, r: _rank(l) }; })
      .sort(function(a, b) { return a.r - b.r || a.i - b.i; }).map(function(x) { return x.l; });
  }

  // 접기 버튼 2개(숫자 보기, 용어)를 패널에 한 번만 끼운다(index.html 마크업은 그대로). node 러너의 가짜 DOM에서는 아무 일도 없음
  function _ensureFolds() {
    if (typeof document === 'undefined' || !document.createElement) return;
    var ov = document.getElementById('equity-overlay');
    if (!ov || !ov.classList || typeof ov.querySelector !== 'function' || ov.getAttribute('data-folds') === '1') return;
    var tbl = document.getElementById('ev-table');
    var gl = ov.querySelector('.beginner-glossary');
    if (!tbl || !tbl.parentNode || !gl || !gl.parentNode) return;
    ov.setAttribute('data-folds', '1');
    var evBtn = document.createElement('button');
    evBtn.type = 'button'; evBtn.id = 'ev-fold'; evBtn.className = 'hud-fold';
    evBtn.setAttribute('aria-controls', 'ev-table');
    evBtn.onclick = function() { toggleFold('ev'); };
    tbl.parentNode.insertBefore(evBtn, tbl);
    var glBtn = document.createElement('button');
    glBtn.type = 'button'; glBtn.id = 'gl-fold'; glBtn.className = 'hud-fold';
    glBtn.onclick = function() { toggleFold('gl'); };
    gl.parentNode.insertBefore(glBtn, gl);
    _syncFolds();
  }
  function _syncFolds() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    var ov = document.getElementById('equity-overlay');
    if (ov && ov.classList) { ov.classList.toggle('ev-open', !!_fold.ev); ov.classList.toggle('gl-open', !!_fold.gl); }
    var e = document.getElementById('ev-fold'), g = document.getElementById('gl-fold');
    if (e && e.setAttribute) { e.textContent = foldLabel('ev', _fold.ev); e.setAttribute('aria-expanded', _fold.ev ? 'true' : 'false'); }
    if (g && g.setAttribute) { g.textContent = foldLabel('gl', _fold.gl); g.setAttribute('aria-expanded', _fold.gl ? 'true' : 'false'); }
  }
  function foldLabel(key, open) {
    return (key === 'ev' ? '🔢 숫자 보기(EV 표)' : '📖 용어 풀이') + (open ? ' ▴' : ' ▸');
  }
  // key 'ev'|'gl', force 생략이면 뒤집기. 바뀐 상태(true = 펼침)를 돌려준다
  function toggleFold(key, force) {
    if (key !== 'ev' && key !== 'gl') return null;
    _fold[key] = (force === undefined) ? !_fold[key] : !!force;
    _syncFolds();
    return _fold[key];
  }
  function folds() { return { ev: !!_fold.ev, gl: !!_fold.gl }; }

  // R3 슬라이더 읽기 배선(3.1절): 결정 시작 컨텍스트. 보스, 미션, 측정 회차(GTO 미러 3회차) 같은 가림 재료를 함께 넘긴다
  function decisionCtx(equity, ev, state, round, view) {
    var boss = false, mission = false;
    try { boss = !!(typeof Boss !== 'undefined' && Boss && typeof Boss.active === 'function' && Boss.active()); } catch (e) { boss = false; }
    try {
      var ss = (typeof Journey !== 'undefined' && Journey && typeof Journey.session === 'function') ? Journey.session() : null;
      if (ss && (ss.kind === 'boss' || ss.kind === 'mission')) mission = true;
      if (ss && ss.kind === 'boss') boss = true;
    } catch (e) {}
    return { state: state, eq: equity, ev: ev, view: view || null, boss: boss, mission: mission,
      gtoRound: round || 0, graded: round === 3, hideTypes: !!(state && state.hideTypes) };
  }
  function _raiseInfo(fn, arg) {
    if (typeof RaiseInfo === 'undefined' || !RaiseInfo || typeof RaiseInfo[fn] !== 'function') return;
    try { RaiseInfo[fn](arg); } catch (e) {}
  }

  // view(8차 WP3, CoachUI.beforeDecision 결과): {level, hide, hideEquity, hidePotOdds}
  // view 없으면 가림 없이 표시(기존 동작)
  function update(equity, ev, state, round, view) {
    if (typeof EV === 'undefined') return;
    var hide = !!(view && view.hide);
    var hideEq = !!(view && view.hideEquity);
    var toCall = state ? Math.max(0, (state.currentBet || 0) - ((state.playerBets && state.playerBets['Hero']) || 0)) : 0;
    var post = !!(state && state.street && state.street !== 'preflop');
    if (hideEq) {
      document.getElementById('equity-fill').style.width = '0%';
      document.getElementById('equity-value').textContent = '?';
    } else {
      var pct = (equity * 100).toFixed(1);
      document.getElementById('equity-fill').style.width = pct + '%';
      document.getElementById('equity-value').textContent = pct + '%';
    }
    var th = (typeof document.querySelector === 'function') ? document.querySelector('#ev-table th:nth-child(2)') : null;
    if (th) th.textContent = '추정 EV(bb)';
    var tbody = document.getElementById('ev-rows');
    if (hide) {
      tbody.innerHTML = '<tr><td colspan="2">🙈 결정 후 공개 <span class="kb-hint">(H: 정답 보기)</span></td></tr>';
    } else if (ev.bestSource === 'chart' && ev.verdict) {
      // 프리플랍 차트 판정: EV 근사 숫자와 차트 ★가 모순되지 않도록 숫자를 숨김
      tbody.innerHTML = '<tr class="best"><td colspan="2">📋 레인지 차트 기준 ★ ' + ev.verdict.label + '</td></tr>' +
        '<tr><td colspan="2">프리플랍 EV 근사는 참고용이라 숨겨요</td></tr>';
    } else {
      var betWord = (post && toCall === 0) ? '벳' : '레이즈';
      var rows = [
        { label: '폴드', key: 'fold', val: ev.fold },
        { label: toCall === 0 ? '체크' : '콜', key: 'call', val: ev.call },
        { label: betWord + ' ' + _amt(ev.raiseHalfAmt) + 'bb', key: 'raise_half', val: ev.raise_half },
        { label: betWord + ' ' + _amt(ev.raisePotAmt) + 'bb', key: 'raise_pot', val: ev.raise_pot },
        { label: '올인', key: 'allin', val: ev.allin }
      ];
      tbody.innerHTML = rows.filter(function(r) {
        return typeof r.val === 'number' && !isNaN(r.val);
      }).map(function(r) {
        var isBest = r.key === ev.bestAction;
        var cls = isBest ? 'best' : (r.val < 0 ? 'negative' : '');
        return '<tr class="' + cls + '"><td>' + r.label + (isBest ? ' ★' : '') + '</td>' +
          '<td>' + (r.val >= 0 ? '+' : '') + r.val.toFixed(2) + '</td></tr>';
      }).join('');
      // M5-COACH 리뷰: 벳 직면 ★는 코치 판정(다음 1장, 리버는 상대 벳 레인지 기준)이고 EV 숫자는 HUD 승률로 센 추정이라
      //   콜/폴드가 엇갈리면(★ 폴드인데 콜 EV가 플러스, ★ 콜인데 콜 EV가 마이너스) 왜 다른지 한 줄
      var Vh = ev.verdict, cev = ev.call;
      var flip = typeof cev === 'number' && (ev.bestAction === 'fold' ? cev > 0 : cev < 0);
      if (ev.bestSource === 'potodds' && Vh && (Vh.basis === 'next' || Vh.basis === 'river') && flip) {
        tbody.innerHTML += '<tr><td colspan="2">★는 ' + (Vh.basis === 'next' ? '다음 1장' : '상대 벳 레인지') +
          ' 기준 판정(참고), 숫자는 HUD 승률로 센 추정</td></tr>';
      }
    }
    var bxLines = null;
    if (EV.buildBeginnerExplain) {
      bxLines = (EV.buildBeginnerExplain(state, ev, equity) || []).filter(function(l) {
        var s = String(l);
        if (hide && (s.indexOf('✅') === 0 || s.indexOf('💡') === 0)) return false;
        if (hideEq && (s.indexOf('📊') === 0 || s.indexOf('📐') === 0)) return false;
        return true;
      });
    }
    // 코칭 문구는 판정 상세의 추천(✅) 줄이 같은 판정과 이유를 이미 말하면 숨김(중복 제거, R7)
    var ctEl = document.getElementById('coaching-text');
    var dup = !!(bxLines && bxLines.some(function(l) { return String(l).indexOf('✅') === 0; }));
    var ct = (hide || dup) ? '' : EV.buildCoaching(state, ev, equity);
    ctEl.innerHTML = _cz(_esc(ct));
    if (ctEl.style) ctEl.style.display = ct ? '' : 'none';
    var gtoEl = document.getElementById('gto-hint');
    if (!hide && round === 2) {
      gtoEl.textContent = '👁 GTO: ' + _actionLabel(ev.bestAction);
      gtoEl.style.display = 'block';
    } else {
      gtoEl.style.display = 'none';
    }
    var bxBody = document.getElementById('beginner-explain-body');
    if (bxBody && bxLines) {
      // 엔진 문구는 <b> 강조를 담은 HTML 그대로(예전과 같음), 무늬 기호만 4색으로
      bxBody.innerHTML = orderLines(bxLines).map(function(l) {
        var s = String(l);
        return '<div class="bx-line' + (s.indexOf('✅') === 0 ? ' bx-rec' : '') + '">' + _cz(s) + '</div>';
      }).join('');
    }
    _ensureFolds();
    _raiseInfo('onDecision', decisionCtx(equity, ev, state, round, view));
  }

  function _amt(v) {
    return (typeof v === 'number' && !isNaN(v)) ? (Math.round(v * 10) / 10) : '';
  }

  // #last-verdict, #coach-reminder는 CoachUI 소유 — 여기서 지우지 않음
  function clear() {
    document.getElementById('equity-fill').style.width = '0%';
    document.getElementById('equity-value').textContent = '—';
    document.getElementById('ev-rows').innerHTML = '';
    var ctEl = document.getElementById('coaching-text');
    ctEl.textContent = '';
    if (ctEl.style) ctEl.style.display = 'none';
    document.getElementById('gto-hint').style.display = 'none';
    var bxBody = document.getElementById('beginner-explain-body');
    if (bxBody) bxBody.innerHTML = '';
    _raiseInfo('clear');
  }

  // 연습 모드 추이 표시 (T5에서 실제 attempts 데이터 연결) — attempts: [{n, delta, text?, light?}]
  // M4-P9: text(손 총평과 같은 표기, 고정 벌점은 '큰 실수 1')와 light가 있으면 그걸 쓴다. 없으면 예전 Δ bb 표기.
  var TREND_ICON = { green: '🟢', yellow: '🟡', red: '🔴' };
  function updatePracticeTrend(attempts) {
    var el = document.getElementById('practice-trend');
    if (!el) return;
    if (!attempts || attempts.length === 0) {
      el.style.display = 'none';
      return;
    }
    var parts = attempts.map(function(a) {
      var light = TREND_ICON[a.light] || (a.delta >= -0.3 ? '🟢' : a.delta >= -1.5 ? '🟡' : '🔴');
      var txt = typeof a.text === 'string' && a.text ? a.text : (a.delta >= 0 ? '+' : '') + a.delta.toFixed(2) + 'bb';
      return a.n + '회 ' + txt + ' ' + light;
    });
    el.textContent = '🔁 연습 추이: ' + parts.join(' → ');
    el.style.display = 'block';
  }

  function _actionLabel(key) {
    return { fold:'폴드', call:'콜', raise_half:'레이즈½팟', raise_pot:'레이즈팟', allin:'올인' }[key] || key;
  }

  var api = { update: update, clear: clear, updatePracticeTrend: updatePracticeTrend,
    orderLines: orderLines, decisionCtx: decisionCtx, toggleFold: toggleFold, folds: folds, foldLabel: foldLabel };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
