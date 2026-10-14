// ui/action-bar.js
var ActionBar = (function() {
  var BTN_IDS = ['btn-fold', 'btn-call', 'btn-raise'];

  function _clearGlow() {
    BTN_IDS.forEach(function(id) {
      var el = document.getElementById(id); if (el) el.style.boxShadow = '';
    });
  }

  // view(8차 WP3): view.hide면 금색 테두리(정답 노출)를 숨김
  function render(state, ev, view) {
    var bar = document.getElementById('action-bar');
    if (!state || !state.waitingForHero) {
      bar.style.opacity = '0.4'; bar.style.pointerEvents = 'none';
      _clearGlow();
      return;
    }
    bar.style.opacity = '1'; bar.style.pointerEvents = '';
    var heroBet = (state.playerBets && state.playerBets['Hero']) || 0;
    var toCall = Math.max(0, state.currentBet - heroBet);
    document.getElementById('btn-call').textContent = toCall === 0 ? '체크' : '콜 ' + toCall.toFixed(1) + 'bb';
    var foldBtn = document.getElementById('btn-fold');
    if (foldBtn) foldBtn.title = toCall === 0 ? '체크가 공짜예요. 폴드할 이유가 없어요' : '';
    var heroStack = (state.stacks && state.stacks['Hero']) || 0;
    var maxTo = heroBet + heroStack;   // raise-to 상한(올인 총액)
    var minR = state.minRaise || (state.currentBet + (state.bigBlind || 1));
    // 기본 레이즈 금액 = 표준 사이즈(ev.raiseHalfAmt), 없으면 팟 절반
    var amt = (ev && ev.raiseHalfAmt) ? ev.raiseHalfAmt : Math.max(minR, (state.pot || 0) * 0.5);
    amt = Math.min(maxTo, Math.max(minR, amt));
    document.getElementById('raise-amount').value = amt.toFixed(1);
    var slider = document.getElementById('raise-slider');
    if (slider) slider.value = maxTo > minR ? ((amt - minR) / (maxTo - minR) * 100) : 0;
    var pct = maxTo > 0 ? (amt / maxTo * 100).toFixed(0) : 0;
    document.getElementById('raise-stack-pct').textContent = '스택의 ' + pct + '%';
    var raiseBtn = document.getElementById('btn-raise');
    var isBet = toCall === 0 && state.street !== 'preflop';
    raiseBtn.textContent = isBet ? '벳' : '레이즈';
    raiseBtn.title = isBet ? '아무도 안 걸었을 때 처음 거는 건 벳, 남이 건 걸 올리는 건 레이즈' : '';
    var canRaise = heroStack > toCall;
    raiseBtn.disabled = !canRaise;
    raiseBtn.style.opacity = canRaise ? '' : '0.4';
    _clearGlow();
    if (ev && !(view && view.hide)) {
      var best = ev.bestAction;
      if (best === 'fold') document.getElementById('btn-fold').style.boxShadow = '0 0 0 2px gold';
      else if (best === 'call') document.getElementById('btn-call').style.boxShadow = '0 0 0 2px gold';
      else document.getElementById('btn-raise').style.boxShadow = '0 0 0 2px gold';
    }
  }

  if (typeof module !== 'undefined') module.exports = { render };
  return { render };
})();
