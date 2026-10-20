// ui/table.js
var Table = (function() {
  var POSITIONS = ['UTG','HJ','CO','BTN','SB','BB'];
  var SUIT_SYM = { s:'♠', h:'♥', d:'♦', c:'♣' };
  var RED = { h:true, d:true };

  var _bubbleKey = null;   // 같은 핸드·스트리트면 render 후에도 말풍선(.seat-action) 보존
  var _boardKey = null;    // 같은 핸드에서 이미 그린 보드 장수(재렌더 시 deal 애니메이션 생략)
  var _boardDrawn = 0;

  function render(state) {
    if (!state) return;
    document.getElementById('pot-amount').textContent = state.pot.toFixed(1);
    document.getElementById('hand-info').textContent = 'Hand #' + (state.handNum||1) + (state.round ? '  Round ' + state.round + '/3' : '');
    var handKey = state.seed + '#' + state.handNum;
    var bKey = handKey + '#' + state.street;
    var keptBubbles = {};
    if (bKey === _bubbleKey) {
      POSITIONS.forEach(function(pos) {
        var el = document.getElementById('seat-' + pos);
        var b = el && el.querySelector('.seat-action');
        if (b) keptBubbles[pos] = b;
      });
    }
    _bubbleKey = bKey;
    if (handKey !== _boardKey) { _boardKey = handKey; _boardDrawn = 0; }
    var boardEl = document.getElementById('board-cards');
    boardEl.innerHTML = '';
    (state.board||[]).forEach(function(c, i) {
      var el = document.createElement('div');
      el.className = 'card ' + (i >= _boardDrawn ? 'deal-anim ' : '') + (RED[c.suit] ? 'red' : 'black');
      el.setAttribute('data-suit', c.suit);   // 4색 덱(a11y.css html.four-color)
      el.textContent = (c.rank==='T'?'10':c.rank) + SUIT_SYM[c.suit];
      boardEl.appendChild(el);
    });
    _boardDrawn = Math.max(_boardDrawn, (state.board||[]).length);
    var seated = _seatPlayers(state);
    var slots = seatSlots(seated);
    POSITIONS.forEach(function(pos) {
      var seatEl = document.getElementById('seat-' + pos);
      if (!seatEl) return;
      var player = Object.values(seated).find(function(p){ return p.pos===pos; });
      if (!player) { seatEl.innerHTML=''; seatEl.className='seat seat-'+pos.toLowerCase(); seatEl.setAttribute('data-slot', slots[pos]); return; }
      var name = player.name;
      var isFolded = !!(state.folded&&state.folded[name]);
      var isHero = player.isHero;
      seatEl.className = 'seat seat-'+pos.toLowerCase() + (isHero?' hero':'') + (isFolded?' folded':'');
      seatEl.setAttribute('data-slot', slots[pos]);
      var cardsHtml = seatCardsHTML(state, name);
      var bet = state.playerBets&&state.playerBets[name]||0;
      var stack = (state.stacks&&state.stacks[name])||0;
      var stackPct = Math.min(100, Math.max(0, stack)).toFixed(0);
      var barColor = stack > 60 ? '#3d9e4a' : stack > 30 ? '#e3b341' : '#f85149';
      seatEl.innerHTML =
        '<div class="seat-name">'+name+((isHero || state.hideTypes)?'':' <small style="color:#8b949e">('+player.type+')</small>')+'</div>'+
        (isHero ? '' : _hudHTML(name, !!state.hideTypes))+
        '<div class="seat-pos">'+pos+'</div>'+
        '<div class="seat-stack">'+stack.toFixed(1)+'bb</div>'+
        (bet>0?'<div class="seat-bet">'+bet.toFixed(1)+'bb</div>':'')+
        '<div class="seat-cards">'+cardsHtml+'</div>'+
        '<div class="seat-stack-bar"><div class="seat-stack-fill" style="height:'+stackPct+'%;background:'+barColor+'"></div></div>';
      if (keptBubbles[pos]) seatEl.appendChild(keptBubbles[pos]);
    });
  }

  // 앉아 있는 사람(관전 state.spectator면 히어로 제외, M4 계약 T2). 순수
  function _seatPlayers(state) {
    var all = (state && state.players) || {};
    if (!state || !state.spectator) return all;
    var out = {};
    Object.keys(all).forEach(function(k) { if (all[k] && !all[k].isHero) out[k] = all[k]; });
    return out;
  }

  function _cardFace(c, extra) {
    return '<div class="card ' + (extra ? extra + ' ' : '') + (RED[c.suit] ? 'red' : 'black') + '" data-suit="' + c.suit + '">' +
      (c.rank === 'T' ? '10' : c.rank) + SUIT_SYM[c.suit] + '</div>';
  }

  // 좌석 카드 칸 HTML(순수 함수, node 테스트용, M4 계약 T2).
  // 히어로는 앞면(hero-card), state.revealAll(극장 전 카드 공개)이면 빌런도 앞면(폴드한 손도 보임),
  // 그 밖에는 살아 있는 빌런만 뒷면 2장. 관전(state.spectator)이면 히어로 좌석이 없으므로 빈 문자열.
  function seatCardsHTML(state, name) {
    if (!state || name == null) return '';
    var p = state.players && state.players[name];
    if (!p || (state.spectator && p.isHero)) return '';
    var hole = state.holeCards && state.holeCards[name];
    if (!hole || hole.length !== 2 || !hole[0] || !hole[1]) return '';
    if (p.isHero) return hole.map(function(c) { return _cardFace(c, 'hero-card'); }).join('');
    if (state.revealAll) return hole.map(function(c) { return _cardFace(c, 'face-up'); }).join('');
    if (state.folded && state.folded[name]) return '';
    return '<div class="card back"></div><div class="card back"></div>';
  }

  // 세로 폰 배치용 좌석 슬롯(표시 계층만, 데스크톱 CSS는 참조 안 함): 히어로=0(하단 중앙), 이후 시계방향 1~5
  // 헤즈업은 빌런을 3(상단 중앙)에 고정하고 빈 좌석에 남은 번호를 줘 0~5가 겹치지 않게 함
  function seatSlots(players) {
    var list = Object.values(players || {});
    var hero = list.find(function(p) { return p.isHero; });
    var heroIdx = hero ? POSITIONS.indexOf(hero.pos) : -1;
    if (heroIdx < 0) heroIdx = POSITIONS.indexOf('BTN');
    var out = {};
    if (list.length === 2) {
      var spare = [1, 2, 4, 5];
      // 관전 헤즈업(히어로 없음, 극장 미니시즌 마지막 두 명): BTN(없으면 앞 포지션)을 아래 가운데 0, 다른 사람을 3에 둔다
      // (둘 다 3이면 세로 폰에서 두 좌석이 겹친다, M6-MINI)
      var low = hero || list.find(function(q) { return q.pos === 'BTN'; }) ||
        list.slice().sort(function(a, b) { return POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos); })[0];
      POSITIONS.forEach(function(pos) {
        var p = list.find(function(q) { return q.pos === pos; });
        out[pos] = p ? (p === low ? 0 : 3) : spare.shift();
      });
      return out;
    }
    POSITIONS.forEach(function(pos, i) { out[pos] = (i - heroIdx + 6) % 6; });
    return out;
  }

  // 빌런 좌석 성향 HUD (VillainTracker 있을 때만). hideTypes(유형 가림)면 style 칩은 빼고 숫자만
  function _hudHTML(name, hideTypes) {
    if (typeof VillainTracker === 'undefined' || !VillainTracker.hudText) return '';
    var t = VillainTracker.hudText(name);
    if (!t) return '';
    var title = String(t.title || '').replace(/"/g, '&quot;');
    return '<div class="seat-hud" title="' + title + '">' + t.short +
      (t.style && !hideTypes ? ' <span class="seat-style-chip">' + t.style + '</span>' : '') + '</div>';
  }

  var ACTION_LABEL = { fold:'폴드', call:'콜', check:'체크', raise:'레이즈', allin:'올인', '3bet':'3벳', bet:'벳' };

  function updateVillainActions(actions) {
    actions.forEach(function(va) {
      document.querySelectorAll('.seat').forEach(function(el) {
        var nameEl = el.querySelector('.seat-name');
        if (nameEl && nameEl.textContent.trim().startsWith(va.name)) {
          var old = el.querySelector('.seat-action');
          if (old) old.remove();
          var label = va.label || ACTION_LABEL[va.action] || va.action;
          var amt = (va.amount && va.amount > 0 && va.action !== 'fold' && va.action !== 'check')
            ? ' ' + Number(va.amount).toFixed(1) + 'bb' : '';
          var div = document.createElement('div');
          div.className = 'seat-action fadein';
          div.innerHTML = '<b style="color:#fff">' + label + amt + '</b>'
            + (va.phrase ? '<br><span style="color:#8b949e">' + va.phrase + '</span>' : '');
          el.appendChild(div);
        }
      });
    });
  }

  function renderShowdown(result) {
    if (!result || !result.showCards) return;
    var state = result.newState;
    if (!state) return;
    var holeCards = state.holeCards || {};
    var folded = state.folded || {};
    document.querySelectorAll('.seat:not(.hero)').forEach(function(seatEl) {
      if (seatEl.classList.contains('folded')) return;
      var nameEl = seatEl.querySelector('.seat-name');
      if (!nameEl) return;
      var playerName = nameEl.textContent.trim().split(/\s+/)[0];
      if (folded[playerName]) return;
      var cards = holeCards[playerName];
      if (!cards || cards.length !== 2) return;
      var cardsEl = seatEl.querySelector('.seat-cards');
      if (!cardsEl) return;
      cardsEl.innerHTML = cards.map(function(c) {
        return '<div class="card fadein ' + (RED[c.suit] ? 'red' : 'black') + '" data-suit="' + c.suit + '">' +
          (c.rank === 'T' ? '10' : c.rank) + SUIT_SYM[c.suit] + '</div>';
      }).join('');
    });
  }

  var HERO_PHRASES = {
    fold:  ['그냥 접는다.', '이번엔 패스.', '폴드.'],
    call:  ['받지 뭐.', '콜.', '한 번 보자.'],
    check: ['체크.', '한번 봐봐.'],
    raise: ['올린다.', '레이즈.', '압박해보자.'],
    allin: ['올인.', '다 간다!']
  };

  var LIGHT_COLOR = { green:'#52b75e', yellow:'#e3b341', red:'#f85149' };

  function showHeroAction(action, amount, light) {
    // 히어로 실제 착석 시트 (포지션 로테이션 대응 — 기존 seat-BTN 하드코딩 수정)
    var seatEl = document.querySelector('.seat.hero') || document.getElementById('seat-BTN');
    if (!seatEl) return;
    var old = seatEl.querySelector('.seat-action');
    if (old) old.remove();
    var HERO_LABEL = { fold:'폴드', call:'콜', check:'체크', raise:'레이즈', allin:'올인' };
    var label = HERO_LABEL[action] || action;
    var amt = (action === 'raise' || action === 'allin') && amount > 0
      ? ' ' + Number(amount).toFixed(1) + 'bb' : '';
    var phrases = HERO_PHRASES[action] || [];
    var phrase = phrases[Math.floor(Math.random() * phrases.length)] || '';
    var dot = (light && LIGHT_COLOR[light])
      ? '<span class="hero-light-dot" style="background:' + LIGHT_COLOR[light] + '"></span>' : '';
    var div = document.createElement('div');
    div.className = 'seat-action fadein';
    div.innerHTML = dot + '<b style="color:#fff">' + label + amt + '</b>'
      + (phrase ? '<br><span style="color:#8b949e;font-size:0.7rem">' + phrase + '</span>' : '');
    seatEl.appendChild(div);
  }

  if (typeof module !== 'undefined') module.exports = { render, updateVillainActions, renderShowdown, showHeroAction, seatSlots, seatCardsHTML, _hudHTML };
  return { render, updateVillainActions, renderShowdown, showHeroAction, seatSlots, seatCardsHTML, _hudHTML };
})();
