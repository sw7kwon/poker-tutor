// ui/action-bar.js
// R7(G2 DOCK, 설계 6절 4번): 레이즈 프리셋 라벨을 상황별로 바꾼다(오픈 '2.5x 3x 올인', 3벳 '3x 4x 올인', 4벳 '2.3x 2.6x 올인',
//   포스트플랍 벳 '1/3 1/2 3/4 팟 올인', 벳 직면 레이즈 '1/2 3/4 팟 올인'). 크기 규칙은 engine/ev.js 표준 사이즈와 같다.
//   프리셋을 누르면 금액칸에 넣고 App.syncRaiseFromInput()으로 슬라이더, 스택 %, 슬라이더 읽기(RaiseInfo.onAmount)를 맞춘다.
var ActionBar = (function() {
  var BTN_IDS = ['btn-fold', 'btn-call', 'btn-raise'];
  var _presets = [];   // 지금 그려 둔 프리셋 [{ label, amount, title, key }]
  var _sig = '';       // 같은 프리셋이면 DOM을 다시 쓰지 않음

  function _r1(v) { return Math.round(v * 10) / 10; }

  // 순수: 상황별 프리셋 목록. state = 게임 상태(currentBet, playerBets, stacks, pot, bigBlind, minRaise, street, streetBetCount, players)
  // → { kind:'open'|'3bet'|'4bet'|'5bet'|'bet'|'raise', list:[{ label, amount(raise-to), title, key }] }(올인은 늘 마지막)
  function presetsFor(state) {
    state = state || {};
    var bb = state.bigBlind || 1;
    var X = state.currentBet || 0;
    var h = (state.playerBets && state.playerBets.Hero) || 0;
    var stack = (state.stacks && state.stacks.Hero) || 0;
    var toCall = Math.max(0, X - h);
    var maxTo = _r1(h + stack);
    var minR = state.minRaise || (X + bb);
    var pot = state.pot || 0;
    var pre = state.street === 'preflop';
    var sbc = state.streetBetCount || 0;
    var pos = (state.players && state.players.Hero && state.players.Hero.pos) || '';
    var kind, raw = [];
    if (pre && sbc === 0) {
      kind = 'open';
      var lim = (X === bb) ? Math.max(0, Math.round((pot - 1.5 * bb) / bb)) : 0;
      var mults = pos === 'SB' ? [3, 3.5] : [2.5, 3];
      mults.forEach(function(m) {
        raw.push({ label: m + 'x', amount: (m + lim) * bb, key: 'x' + m,
          title: (lim > 0 ? '아이솔 ' : '오픈 ') + _r1((m + lim) * bb) + 'bb(빅블라인드의 ' + m + '배' + (lim > 0 ? ' + 림퍼 ' + lim + '명 x 1bb' : '') + ')' });
      });
    } else if (pre && sbc <= 2) {
      kind = sbc === 1 ? '3bet' : '4bet';
      (sbc === 1 ? [3, 4] : [2.3, 2.6]).forEach(function(m) {
        raw.push({ label: m + 'x', amount: X * m, key: 'x' + m,
          title: (sbc === 1 ? '3벳 ' : '4벳 ') + _r1(X * m) + 'bb(상대 레이즈 ' + _r1(X) + 'bb의 ' + m + '배' +
            (sbc === 1 ? ', 보통 뒤 자리 3배, 블라인드 4배' : '') + ')' });
      });
    } else if (pre) {
      kind = '5bet';
      // ev.js 표준 사이즈와 같게(4벳 이상도 2.3배, raiseHalfAmt)
      raw.push({ label: '2.3x', amount: X * 2.3, key: 'x2.3', title: '상대 레이즈 ' + _r1(X) + 'bb의 2.3배' });
    } else if (toCall === 0) {
      kind = 'bet';
      [['1/3', 1 / 3], ['1/2', 0.5], ['3/4', 0.75], ['팟', 1]].forEach(function(p) {
        raw.push({ label: p[0], amount: pot * p[1], key: 'p' + p[0], title: '팟 ' + _r1(pot) + 'bb의 ' + p[0] + ' 벳 = ' + _r1(pot * p[1]) + 'bb' });
      });
    } else {
      kind = 'raise';
      [['1/2', 0.5], ['3/4', 0.75], ['팟', 1]].forEach(function(p) {
        var amt = X + p[1] * (pot + toCall);
        raw.push({ label: p[0], amount: amt, key: 'p' + p[0], title: '콜한 뒤 팟의 ' + p[0] + '만큼 더 올리기 = ' + _r1(amt) + 'bb까지' });
      });
    }
    var list = [], seen = {};
    raw.forEach(function(p) {
      var a = _r1(Math.min(maxTo, Math.max(minR, p.amount)));
      if (!(a < maxTo) || seen[a]) return;   // 올인과 같거나 넘는 크기, 같은 금액은 뺌
      seen[a] = true;
      list.push({ label: p.label, amount: a, title: p.title, key: p.key });
    });
    list.push({ label: '올인', amount: maxTo, title: '남은 칩 전부 ' + maxTo + 'bb', key: 'allin' });
    return { kind: kind, list: list };
  }

  function _renderPresets(state) {
    if (typeof document === 'undefined' || !document.querySelector) return;
    var box = document.querySelector('.raise-presets');
    if (!box) return;
    var P = presetsFor(state);
    var sig = P.kind + '|' + P.list.map(function(p) { return p.label + ':' + p.amount; }).join(',');
    _presets = P.list;
    if (sig === _sig && box.getAttribute && box.getAttribute('data-kind') === P.kind) return;
    _sig = sig;
    if (box.setAttribute) box.setAttribute('data-kind', P.kind);
    box.innerHTML = P.list.map(function(p, i) {
      return '<button type="button" data-preset="' + p.key + '" onclick="ActionBar.preset(' + i + ')" title="' + p.title + '"' +
        ' aria-label="' + p.title + '">' + p.label + '</button>';
    }).join('');
  }

  // 프리셋 i 누름: 금액칸 → App.syncRaiseFromInput(민레이즈~올인 클램프, 슬라이더, 스택 %, RaiseInfo.onAmount)
  function preset(i) {
    var p = _presets[i];
    if (!p || typeof document === 'undefined') return null;
    var input = document.getElementById('raise-amount');
    if (input) input.value = p.amount.toFixed(1);
    if (typeof App !== 'undefined' && App && typeof App.syncRaiseFromInput === 'function') App.syncRaiseFromInput();
    var box = document.querySelector ? document.querySelector('.raise-presets') : null;
    var btns = (box && box.querySelectorAll) ? box.querySelectorAll('button') : [];
    for (var k = 0; k < btns.length; k++) btns[k].classList.toggle('on', k === i);
    return p.amount;
  }

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
    if (ev) _renderPresets(state);
    _clearGlow();
    if (ev && !(view && view.hide)) {
      var best = ev.bestAction;
      if (best === 'fold') document.getElementById('btn-fold').style.boxShadow = '0 0 0 2px gold';
      else if (best === 'call') document.getElementById('btn-call').style.boxShadow = '0 0 0 2px gold';
      else document.getElementById('btn-raise').style.boxShadow = '0 0 0 2px gold';
    }
  }

  var api = { render: render, presetsFor: presetsFor, preset: preset };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
