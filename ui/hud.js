// ui/hud.js
var HUD = (function() {
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
    }
    document.getElementById('coaching-text').textContent = hide ? '' : EV.buildCoaching(state, ev, equity);
    var gtoEl = document.getElementById('gto-hint');
    if (!hide && round === 2) {
      gtoEl.textContent = '👁 GTO: ' + _actionLabel(ev.bestAction);
      gtoEl.style.display = 'block';
    } else {
      gtoEl.style.display = 'none';
    }
    var bxBody = document.getElementById('beginner-explain-body');
    if (bxBody && EV.buildBeginnerExplain) {
      var bxLines = EV.buildBeginnerExplain(state, ev, equity) || [];
      bxLines = bxLines.filter(function(l) {
        var s = String(l);
        if (hide && (s.indexOf('✅') === 0 || s.indexOf('💡') === 0)) return false;
        if (hideEq && (s.indexOf('📊') === 0 || s.indexOf('📐') === 0)) return false;
        return true;
      });
      bxBody.innerHTML = bxLines.map(function(l) {
        return '<div class="bx-line">' + l + '</div>';
      }).join('');
    }
  }

  function _amt(v) {
    return (typeof v === 'number' && !isNaN(v)) ? (Math.round(v * 10) / 10) : '';
  }

  // #last-verdict, #coach-reminder는 CoachUI 소유 — 여기서 지우지 않음
  function clear() {
    document.getElementById('equity-fill').style.width = '0%';
    document.getElementById('equity-value').textContent = '—';
    document.getElementById('ev-rows').innerHTML = '';
    document.getElementById('coaching-text').textContent = '';
    document.getElementById('gto-hint').style.display = 'none';
    var bxBody = document.getElementById('beginner-explain-body');
    if (bxBody) bxBody.innerHTML = '';
  }

  // 연습 모드 추이 표시 (T5에서 실제 attempts 데이터 연결) — attempts: [{n, delta}]
  function updatePracticeTrend(attempts) {
    var el = document.getElementById('practice-trend');
    if (!el) return;
    if (!attempts || attempts.length === 0) {
      el.style.display = 'none';
      return;
    }
    var parts = attempts.map(function(a) {
      var light = a.delta >= -0.3 ? '🟢' : a.delta >= -1.5 ? '🟡' : '🔴';
      return a.n + '회 ' + (a.delta >= 0 ? '+' : '') + a.delta.toFixed(2) + 'bb ' + light;
    });
    el.textContent = '🔁 연습 추이: ' + parts.join(' → ');
    el.style.display = 'block';
  }

  function _actionLabel(key) {
    return { fold:'폴드', call:'콜', raise_half:'레이즈½팟', raise_pot:'레이즈팟', allin:'올인' }[key] || key;
  }

  if (typeof module !== 'undefined') module.exports = { update, clear, updatePracticeTrend };
  return { update, clear, updatePracticeTrend };
})();
