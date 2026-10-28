// ui/table.js
var Table = (function() {
  var POSITIONS = ['UTG','HJ','CO','BTN','SB','BB'];
  var SUIT_SYM = { s:'♠', h:'♥', d:'♦', c:'♣' };
  var RED = { h:true, d:true };
  function _hasCards() { return typeof Cards !== 'undefined' && Cards && typeof Cards.html === 'function'; }

  var _bubbleKey = null;   // 같은 핸드·스트리트면 render 후에도 말풍선(.seat-action) 보존
  var _boardKey = null;    // 같은 핸드에서 이미 그린 보드 장수(재렌더 시 deal 애니메이션 생략)
  var _boardDrawn = 0;

  function render(state) {
    if (!state) return;
    document.getElementById('pot-amount').textContent = state.pot.toFixed(1);
    var hiEl = document.getElementById('hand-info');
    if (hiEl) hiEl.innerHTML = handInfoText(state, { short: _shortInfo() });
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
    // 보드 카드: 공용 헬퍼(ui/cards.js, R8) 마크업. 새로 깔린 장만 deal-anim(Animator.dealBoard가 찾는다)
    boardEl.innerHTML = (state.board||[]).map(function(c, i) {
      return _cardFace(c, i >= _boardDrawn ? 'deal-anim' : '');
    }).join('');
    _boardDrawn = Math.max(_boardDrawn, (state.board||[]).length);
    var seated = _seatPlayers(state);
    var slots = seatSlots(seated);
    var maxStack = tableMaxStack(state, seated);
    POSITIONS.forEach(function(pos) {
      var seatEl = document.getElementById('seat-' + pos);
      if (!seatEl) return;
      var player = Object.values(seated).find(function(p){ return p.pos===pos; });
      if (!player) { seatEl.innerHTML=''; seatEl.className='seat seat-'+pos.toLowerCase(); seatEl.setAttribute('data-slot', slots[pos]); if (seatEl.style) seatEl.style.outline = ''; return; }
      var name = player.name;
      var isFolded = !!(state.folded&&state.folded[name]);
      var isHero = player.isHero;
      var isWinner = isWinnerSeat(state, name);
      seatEl.className = 'seat seat-'+pos.toLowerCase() + (isHero?' hero':'') + (isFolded?' folded':'') + (isWinner?' winner':'') + (isActing(state, name)?' active-turn':'');
      seatEl.setAttribute('data-slot', slots[pos]);
      // 승자 좌석 금색 테두리(outline은 배치에 영향 없음). 다음 그리기에서 지운다
      if (seatEl.style) seatEl.style.outline = isWinner ? '2px solid #ffd700' : '';
      var cardsHtml = seatCardsHTML(state, name);
      var bet = state.playerBets&&state.playerBets[name]||0;
      var stack = (state.stacks&&state.stacks[name])||0;
      var bar = stackBar(stack, maxStack);
      var winB = winnerBadgeHTML(state, name, slots[pos], _portraitLayout()), winInTag = winB.indexOf('<span') === 0;
      seatEl.innerHTML =
        (winInTag ? '' : winB)+
        '<div class="seat-name">'+name+((isHero || state.hideTypes)?'':' <small style="color:#8b949e">('+player.type+')</small>')+'</div>'+
        (isHero ? '' : _hudHTML(name, !!state.hideTypes))+
        seatTagHTML(state, name, pos, winInTag ? winB : '')+
        seatStackHTML(stack)+seatDeltaHTML(state, name)+
        (bet>0?'<div class="seat-bet">'+bet.toFixed(1)+'bb</div>':'')+
        '<div class="seat-cards">'+cardsHtml+'</div>'+
        seatEqHTML(state, name)+
        '<div class="seat-stack-bar"><div class="seat-stack-fill" style="height:'+bar.pct+'%;background:'+bar.color+'"></div></div>';
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

  // 카드 앞면 1장: 공용 헬퍼 Cards.html(무늬 이름 aria-label, data-suit 4색). 헬퍼가 없으면 예전 마크업
  function _cardFace(c, extra) {
    if (_hasCards()) { var h = Cards.html(c, { cls: extra || '' }); if (h) return h; }
    return _legacyFace(c, extra);
  }
  function _legacyFace(c, extra) {
    return '<div class="card ' + (extra ? extra + ' ' : '') + (RED[c.suit] ? 'red' : 'black') + '" data-suit="' + c.suit + '">' +
      (c.rank === 'T' ? '10' : c.rank) + SUIT_SYM[c.suit] + '</div>';
  }

  // ── 스택 막대, 손익 배지, 승자 배지(R2, 순수 함수) ──
  // 막대 분모: 앉은 사람 최대 스택과 100bb 중 큰 값(이월 스택이 100을 넘어도 비교가 된다). 색 기준은 bb 절대값 40/20(stackTier와 같음, n2-G1)
  function tableMaxStack(state, seated) {
    var mx = 100, st = (state && state.stacks) || {};
    Object.keys(seated || (state && state.players) || {}).forEach(function(k) {
      var v = Number(st[k]);
      if (isFinite(v) && v > mx) mx = v;
    });
    return mx;
  }
  function stackBar(stack, maxStack) {
    var s = Number(stack); if (!isFinite(s)) s = 0;
    var m = Number(maxStack); if (!(m >= 100)) m = 100;
    var pct = Math.min(100, Math.max(0, s / m * 100));
    var tier = stackTier(s);
    return { pct: pct.toFixed(0), color: tier === 'ok' ? '#3d9e4a' : tier === 'warn' ? '#e3b341' : '#f85149' };
  }

  // ── 좌석 가독성(n2-G1, 설계 docs/NEXT2_DESIGN.md 3.2절, 순수 함수) ──
  // 스택 색 등급: 40bb 이상 ok(금색), 20 이상 40 미만 warn(앰버), 20 미만 short(빨강 점선). 숫자 아님은 0으로
  function stackTier(bb) {
    var v = Number(bb); if (!isFinite(v)) v = 0;
    return v >= 40 ? 'ok' : v >= 20 ? 'warn' : 'short';
  }
  // 스택 숫자: 소수 1자리 + 작은 bb('63.5<small>bb</small>'). 숫자 아님과 음수는 0.0
  function fmtStack(v) {
    var n = Number(v); if (!isFinite(n) || n < 0) n = 0;
    return round1(n).toFixed(1) + '<small>bb</small>';
  }
  function seatStackHTML(v) {
    var n = Number(v); if (!isFinite(n) || n < 0) n = 0;
    var exact = String(Math.round(n * 100) / 100);
    return '<div class="seat-stack tier-' + stackTier(n) + '" title="스택 ' + exact + 'bb">' + fmtStack(n) + '</div>';
  }
  // 딜러 버튼과 블라인드 마커: BTN → D, SB → 0.5, BB → 1. 헤즈업(앉은 사람 2명)은 BTN(없으면 SB)이 딜러이자 스몰 블라인드.
  // 금액 글자는 bb 단위라 늘 0.5와 1(토너먼트 칩 단위는 커리어 띠가 보인다)
  function seatMarkHTML(state, name) {
    var p = state && state.players && name != null ? state.players[name] : null;
    if (!p || !p.pos) return '';
    var seated = _seatPlayers(state), list = Object.keys(seated).map(function(k) { return seated[k]; });
    var hasPos = function(ps) { return list.some(function(q) { return q && q.pos === ps; }); };
    var hu = list.length === 2;
    var dealer = hasPos('BTN') ? 'BTN' : (hu && hasPos('SB') ? 'SB' : null);
    var sb = hasPos('SB') ? 'SB' : (hu && hasPos('BTN') ? 'BTN' : null);
    var out = '';
    if (p.pos === dealer) out += '<span class="seat-mark mark-d" title="딜러 버튼">D</span>';
    if (p.pos === sb) out += '<span class="seat-mark mark-sb" title="스몰 블라인드 0.5bb">0.5</span>';
    if (p.pos === 'BB') out += '<span class="seat-mark mark-bb" title="빅 블라인드 1bb">1</span>';
    return out;
  }
  // 좌석 왼쪽 위 바깥 묶음: 포지션 알약 + 마커(좌석 흐름 밖, css/table.css .seat-tag). extra = 같은 줄 끝에 붙일 것(정산 뒤 승자 배지, n2b)
  function seatTagHTML(state, name, pos, extra) {
    return '<div class="seat-tag"><span class="seat-pos">' + pos + '</span>' + seatMarkHTML(state, name) + (extra || '') + '</div>';
  }
  // 행동 좌석: 상태 사본의 acting(이름)이 그 좌석이면 true(설계 6.2절 1번)
  function isActing(state, name) { return !!(state && name != null && state.acting != null && state.acting === name); }
  // 핸드 정보 줄(#hand-info): '핸드 #7'(short면 '#7') + GTO 회차 ' 2/3회차' + 세션 손익(히어로가 앉고 buyin이 있을 때).
  // 손익은 seatDelta와 같은 계산, |값| 0.5bb 미만은 '±0.0bb'
  function handInfoText(state, opts) {
    if (!state) return '';
    var s = ((opts && opts.short) ? '#' : '핸드 #') + (state.handNum || 1);
    if (state.round) s += ' ' + state.round + '/3회차';
    var hero = state.players && state.players.Hero;
    if (hero && !state.spectator) {
      var d = seatDelta(state, 'Hero');
      if (d != null) {
        var cls = Math.abs(d) < 0.5 ? 'flat' : d > 0 ? 'up' : 'down';
        var txt = cls === 'flat' ? '±0.0bb' : cls === 'up' ? '▲+' + _fmt1(d) + 'bb' : '▼-' + _fmt1(d) + 'bb';
        s += ', 세션 <b class="pnl ' + cls + '">' + txt + '</b>';
      }
    }
    return s;
  }
  // 좁은 폰(360 이하)은 '#7'로 줄인다(CSS 미디어가 아니라 MobileUI와 창 폭으로 판단, 설계 2.3절 1번)
  // (n2-verify) 창 폭은 resize 때만 다시 읽는다: render 첫머리에서 window.innerWidth를 읽으면 앞 그리기의 DOM 변경 때문에
  // 강제 레이아웃이 한 번 더 생겨 render가 3.6ms → 17ms(412x915 4배 스로틀)로 느려지고 결정 동기 블록 p90이 20 → 70ms가 됐다
  var _vwCache = 0, _vwBound = false;
  function _viewportW() {
    if (typeof window === 'undefined' || !window) return 0;
    if (!_vwBound && typeof window.addEventListener === 'function') {
      _vwBound = true;
      window.addEventListener('resize', function() { _vwCache = 0; });
      window.addEventListener('orientationchange', function() { _vwCache = 0; });
    }
    if (!_vwCache) _vwCache = Number(window.innerWidth) || 0;
    return _vwCache;
  }
  function _shortInfo() {
    try { var w = _viewportW(); return w > 0 && w <= 360 && _portraitLayout(); } catch (e) { return false; }
  }
  // (n2b) 0.1bb 반올림 하나: 세션 손익(seatDelta, 핸드 정보 줄과 좌석 배지), 스택 글자(fmtStack), 승자 배지, 리바이 토스트와
  // 세션 요약 리바이 합(App)이 같이 쓴다. 부호 그대로 Math.round(x 10)이라 스택 62.75는 62.8, 손익 -37.25는 -37.2(합이 100으로 맞는다)
  function round1(v) { var n = Number(v); return isFinite(n) ? Math.round(n * 10) / 10 : 0; }
  // 크기만 소수 첫째 자리 글자(부호는 부르는 쪽이 붙인다). 손익과 같은 쪽 부호로 넘겨야 같은 반올림이 된다(리바이 +add는 -add로)
  function _fmt1(v) { return Math.abs(round1(v)).toFixed(1); }
  // 세션 손익: state.buyin = { 이름: 세션 동안 사들인 칩(시작 100 + 리바이) }가 있을 때만(App이 채운다).
  // 핸드 중에는 이번 핸드에 넣은 칩(totalContrib)을 더해 핸드 시작 기준으로, 정산 뒤(state.payouts 있음)는 스택 그대로 센다
  function seatDelta(state, name) {
    if (!state || !state.buyin || name == null) return null;
    var base = Number(state.buyin[name]);
    if (state.buyin[name] == null || !isFinite(base)) return null;
    var stack = Number(state.stacks && state.stacks[name]) || 0;
    var contrib = state.payouts ? 0 : (Number(state.totalContrib && state.totalContrib[name]) || 0);
    return round1(stack + contrib - base);
  }
  // 손익 배지(|손익| 0.5bb 이상): 색 + 화살표 + 숫자. '▲+2.5' 초록, '▼-18' 빨강(10bb 이상은 정수로 짧게, 정확한 값은 title).
  // 좌석 안 독립 요소(flex 0 0 auto): 폰 좌석은 스택 줄 옆에 들어가고 자리가 모자라면 다음 줄로, 데스크톱은 스택 아래 줄
  function seatDeltaHTML(state, name) {
    var d = seatDelta(state, name);
    if (d == null || Math.abs(d) < 0.5) return '';
    var up = d > 0, a = Math.abs(d);
    var shown = a >= 10 ? String(Math.round(a)) : _fmt1(d);
    return '<div class="seat-delta ' + (up ? 'up' : 'down') + '" title="이번 세션 손익 ' + (up ? '+' : '-') + _fmt1(d) + 'bb"' +
      ' aria-label="이번 세션 손익 ' + (up ? '+' : '-') + _fmt1(d) + 'bb"' +
      ' style="flex:0 0 auto;white-space:nowrap;font-weight:700;font-size:.9em;line-height:1.25;color:' + (up ? '#3fb950' : '#ff7b72') + '">' +
      (up ? '▲+' : '▼-') + shown + '</div>';
  }
  // 승자: state.payouts = { 이름: 이번 핸드 순이익 bb }(App이 정산 뒤 그리기 사본에 넣는다)에서 0보다 큰 사람
  function isWinnerSeat(state, name) {
    if (!state || name == null) return false;
    var p = state.payouts;
    if (!p || typeof p !== 'object') return false;
    var any = Object.keys(p).some(function(k) { return Number(p[k]) > 0.005; });
    if (any) return Number(p[name]) > 0.005;
    return state.winner === name;
  }
  // 폰 세로 배치(css/mobile.css data-slot 타원 배치)인지. MobileUI가 없으면(node, 초기화 전) false
  function _portraitLayout() {
    try { return typeof MobileUI !== 'undefined' && !!MobileUI && typeof MobileUI.isMobile === 'function' && !!MobileUI.isMobile(); } catch (e) { return false; }
  }
  // 승자 배지 '🏆 +12.5bb'. 좌석 테두리 가운데에 띄우면 같은 모서리의 포지션 묶음(BTN, D, 0.5)을 가린다(n2b). 그래서
  //   1. 묶음과 같은 모서리면(데스크톱 전부, 폰 히어로 slot 0, 폰 위쪽 줄 slot 2, 3, 4는 묶음과 배지 모두 아래) 묶음 줄 끝에 붙인다
  //      → '<span class="seat-win" ...>'(render가 seatTagHTML의 extra로 넣는다). 승률 칩 줄에 가려지지 않고 마커와 겹치지 않는다.
  //   2. 폰 옆 아래 좌석(slot 1, 5)은 묶음이 아래 모서리라 배지는 예전처럼 위 테두리 가운데 → '<div class="seat-win" ...>'(좌석 첫 자식).
  //      slot 1 묶음 줄은 오른쪽 기준이라 배지를 붙이면 왼쪽 히어로 좌석 쪽으로 길어진다
  function winnerBadgeHTML(state, name, slot, portrait) {
    if (!isWinnerSeat(state, name)) return '';
    var v = Number(state.payouts && state.payouts[name]);
    var amt = (isFinite(v) && v > 0.005) ? ' +' + _fmt1(v) + 'bb' : '';
    var look = 'white-space:nowrap;background:#ffd700;color:#1a1300;font-weight:800;font-size:.74rem;' +
      'border-radius:999px;box-shadow:0 0 10px rgba(255,215,0,.6);pointer-events:none">🏆' + amt;
    if (!!portrait && (slot === 1 || slot === 5)) {
      return '<div class="seat-win" aria-label="이번 핸드 승리' + amt + '" style="position:absolute;left:50%;top:0;transform:translate(-50%,-78%);' +
        'z-index:6;line-height:1.2;padding:1px 7px;' + look + '</div>';
    }
    return '<span class="seat-win" aria-label="이번 핸드 승리' + amt + '" style="display:inline-flex;align-items:center;box-sizing:border-box;height:20px;' +
      'margin-left:2px;line-height:1;padding:0 7px;' + look + '</span>';
  }
  // 정산 화면이 자리 잡은 뒤(App이 결과 패널을 띄운 다음 부른다) 승자 배지를 다시 맞춘다. 결과 패널이 나오면 테이블이 위로 밀려
  // 데스크톱 위쪽 줄 좌석의 배지가 문서 맨 위 밖으로 잘리고(스크롤로도 못 봄), 아래 중앙 좌석 배지는 보드 카드를 가릴 수 있다.
  // 그런 배지만 좌석 안쪽 이름 아래 줄로 내린다(잘린 좌석은 보이는 첫 줄까지, 좌석 높이 안에서). 폰에서 스크롤로 가려진 것은 그대로.
  // → 옮긴 배지 수. DOM이 없거나(node) 배지가 없으면 0
  function _ovArea(a, b) {
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  }
  function fitWinnerBadges() {
    var moved = 0;
    try {
      if (typeof document === 'undefined' || !document || typeof document.querySelectorAll !== 'function') return 0;
      var badges = document.querySelectorAll('.seat-win');
      if (!badges || !badges.length) return 0;
      var sy = (typeof window !== 'undefined' && window && Number(window.scrollY)) || 0;
      var avoid = [document.getElementById('board-cards'), document.querySelector('.pot-display-wrap')]
        .filter(function(e) { return e && typeof e.getBoundingClientRect === 'function'; })
        .map(function(e) { return e.getBoundingClientRect(); });
      Array.prototype.forEach.call(badges, function(bd) {
        // 배지는 포지션 묶음(.seat-tag) 안에 있다(n2b). 옮길 때는 좌석으로 꺼내 이름 아래에 띄운다
        var seat = (typeof bd.closest === 'function' && bd.closest('.seat')) || bd.parentElement;
        if (!seat || typeof bd.getBoundingClientRect !== 'function' || typeof seat.getBoundingClientRect !== 'function') return;
        var r = bd.getBoundingClientRect();
        var clipped = r.top + sy < 0;
        var covers = avoid.some(function(a) { return _ovArea(r, a) > 40; });
        if (!clipped && !covers) return;
        var sr = seat.getBoundingClientRect();
        var nameEl = seat.querySelector ? seat.querySelector('.seat-name') : null;
        var y = nameEl && typeof nameEl.getBoundingClientRect === 'function' ? nameEl.getBoundingClientRect().bottom - sr.top : 0;
        if (sr.top + sy + y < 2) y = 2 - (sr.top + sy);
        y = Math.max(0, Math.min(y, sr.height - r.height));
        if (bd.parentElement !== seat && typeof seat.appendChild === 'function') seat.appendChild(bd);
        bd.style.position = 'absolute';
        bd.style.left = '50%';
        bd.style.zIndex = '6';
        bd.style.top = Math.round(y) + 'px';
        bd.style.bottom = 'auto';
        bd.style.transform = 'translate(-50%,0)';
        moved++;
      });
    } catch (e) { return moved; }
    return moved;
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
    // 히어로 카드는 예전 마크업 그대로(tests/j-theater-ui.test.js가 정확한 문자열을 고정. 단언을 바꾸면 Cards.html(c, {hero:true})로)
    if (p.isHero) return hole.map(function(c) { return _legacyFace(c, 'hero-card'); }).join('');
    if (state.revealAll) return hole.map(function(c) { return _cardFace(c, 'face-up'); }).join('');
    if (state.folded && state.folded[name]) return '';
    return '<div class="card back"></div><div class="card back"></div>';
  }

  // 좌석 승률 배지(순수 함수). state.seatEq = { 이름: 0..1 } 가 있을 때만 '승률 NN%' 1줄, 아니면 빈 문자열.
  // 히어로 '내 승률' 칩(App.toggleEq)과 전원 올인 런아웃, 극장 공개 때 App이 채운다. 일반 플레이 중 빌런 값은 넣지 않는다.
  function seatEqHTML(state, name) {
    if (!state || !state.seatEq || name == null) return '';
    var v = state.seatEq[name];
    if (v == null || typeof v !== 'number' || isNaN(v)) return '';
    return '<div class="seat-eq">승률 ' + Math.round(v * 100) + '%</div>';
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

  // ── 말풍선 액션 유형(n2-G1): data-act와 아이콘, 색은 css/table.css가 data-act로. ActionText(ui/action-text.js)가 없으면 아래 표 ──
  var ACT_KEYS = { fold: 1, check: 1, call: 1, bet: 1, raise: 1, '3bet': 1, '4bet': 1, allin: 1 };
  var ACT_ICON = { fold: '✕', check: '✓', call: '●', bet: '▲', raise: '▲', '3bet': '▲', '4bet': '▲', allin: '⚡' };
  var LABEL_KEY = { '3벳': '3bet', '4벳': '4bet', '올인': 'allin' };
  function _hasAT(fn) { return typeof ActionText !== 'undefined' && !!ActionText && typeof ActionText[fn] === 'function'; }
  // 표시용 액션 키(라벨 3벳, 4벳, 올인 우선. 폴드, 체크, 콜은 그대로) → fold|check|call|bet|raise|3bet|4bet|allin 또는 ''
  function actKey(va) {
    if (!va) return '';
    if (_hasAT('actKey')) { try { var k = ActionText.actKey(va); if (k) return k; } catch (e) { /* 아래 */ } }
    var a = String(va.action == null ? (va.act == null ? '' : va.act) : va.action);
    if (!ACT_KEYS[a]) return '';
    var lb = va.label != null ? va.label : va.lbl;
    if (lb && LABEL_KEY[lb] && a !== 'fold' && a !== 'check' && a !== 'call') return LABEL_KEY[lb];
    return a;
  }
  function actIcon(key) {
    if (_hasAT('icon')) { try { var i = ActionText.icon(key); if (i) return i; } catch (e) { /* 아래 */ } }
    return ACT_ICON[key] || '';
  }
  function _atCls(key) {
    if (_hasAT('cls')) { try { return ActionText.cls(key) || ''; } catch (e) { return ''; } }
    return '';
  }
  // 말풍선 금액: 소수 1자리, 정수면 소수점 없이(2.5, 3, 97.5. ActionText.fmt와 같은 규칙, 좁은 좌석에서 한 줄에 들게)
  function _amt(v) {
    if (_hasAT('fmt')) { try { return ActionText.fmt(v); } catch (e) { /* 아래 */ } }
    var n = Math.round((Number(v) || 0) * 10) / 10;
    return (n % 1 === 0) ? String(n) : n.toFixed(1);
  }
  // 말풍선 첫 줄: 아이콘 + 액션과 금액(굵게). 아이콘은 읽기 프로그램에 읽히지 않게 aria-hidden
  function bubbleMainHTML(key, text) {
    var ic = actIcon(key);
    return '<b class="act-main">' + (ic ? '<i class="act-ic" aria-hidden="true">' + ic + '</i>' : '') + text + '</b>';
  }

  function updateVillainActions(actions) {
    actions.forEach(function(va) {
      document.querySelectorAll('.seat').forEach(function(el) {
        var nameEl = el.querySelector('.seat-name');
        if (nameEl && nameEl.textContent.trim().startsWith(va.name)) {
          var old = el.querySelector('.seat-action');
          if (old) old.remove();
          var label = va.label || ACTION_LABEL[va.action] || va.action;
          var amt = (va.amount && va.amount > 0 && va.action !== 'fold' && va.action !== 'check')
            ? ' ' + _amt(va.amount) + 'bb' : '';
          var key = actKey(va);
          var div = document.createElement('div');
          div.className = 'seat-action fadein' + (_atCls(key) ? ' ' + _atCls(key) : '');
          if (key && div.setAttribute) div.setAttribute('data-act', key);
          div.innerHTML = bubbleMainHTML(key, label + amt)
            + (va.phrase ? '<br><span class="act-say">' + va.phrase + '</span>' : '');
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
      cardsEl.innerHTML = cards.map(function(c) { return _cardFace(c, 'fadein'); }).join('');
    });
  }

  // (n2b) 판정 토스트(#coach-toast, 화면 위 22%)와 앱 토스트(#app-toast, 14%)가 폰에서 팟 금액과 보드를 가린다(상대 공개 첫 1~2초에
  // 팟이 바뀌는 게 안 보임). 순수 판정: t = 토스트 사각형, avoid = 가리면 안 되는 팟과 보드, barTop = 아래 막는 선(액션바나 결과바 위 끝),
  // opts.keep = 옮긴 자리에서도 가리면 안 되는 것(액션 로그 줄), opts.below = 팟 아래 줄(핸드 정보) 아래 끝.
  // → 새 top(px) 또는 null(겹치지 않으면 그대로). 1순위 액션바 바로 위(공개 중 액션바는 흐리고 눌리지 않는다), 2순위 팟과 보드 아래
  function toastSpot(t, avoid, barTop, opts) {
    if (!t || !(t.bottom > t.top)) return null;
    opts = opts || {};
    avoid = (avoid || []).filter(Boolean);
    var keep = (opts.keep || []).filter(Boolean), h = t.bottom - t.top;
    function hit(a, b) { return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; }
    if (!avoid.some(function(a) { return hit(t, a); })) return null;
    var all = avoid.concat(keep), lim = Number(barTop);
    function ok(top) {
      var c = { top: top, bottom: top + h, left: t.left, right: t.right };
      return top >= 0 && (!isFinite(lim) || c.bottom <= lim) && !all.some(function(a) { return hit(c, a); });
    }
    // 액션바는 공개가 끝나 내 차례가 오면 슬라이더 줄만큼(폰 실측 28px) 위로 커진다. 그만큼 더 띄워 커진 바와도 겹치지 않게
    if (isFinite(lim)) { var above = Math.round(lim - 8 - 28 - h); if (ok(above)) return above; }
    var low = Math.max.apply(null, avoid.map(function(a) { return a.bottom; }).concat([Number(opts.below) || 0]));
    var under = Math.round(low + 6);
    return ok(under) ? under : null;
  }
  // 게임 화면(리플레이 화면 제외)에서 토스트를 팟과 보드 밖으로. 레이아웃 읽기는 다음 프레임 직전(rAF, 그리기 전이라 깜빡임 없음)으로 미뤄
  // 결정 동기 블록에 강제 레이아웃을 더하지 않는다. → 미뤘으면 true
  function placeToast(el) {
    if (!el || typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return false;
    var run = function() {
      try {
        if (!el.parentNode || typeof el.getBoundingClientRect !== 'function') return;
        var sg = document.getElementById('screen-game');
        if (!sg || !sg.classList || !sg.classList.contains('active') || sg.classList.contains('omni-replay')) return;
        var rect = function(e) {
          if (!e || typeof e.getBoundingClientRect !== 'function') return null;
          var r = e.getBoundingClientRect();
          return (r.width > 0.5 && r.height > 0.5) ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
        };
        var bar = null;
        // (n4 G1) 하단 바 후보는 공통 상수(NextBar.BARS: 액션바, 다음 바, 결과바). 다음 바가 빠지면 토스트가 다음 바 글을 덮었다(412x915, 360 실측)
        ((typeof NextBar !== 'undefined' && NextBar && Array.isArray(NextBar.BARS)) ? NextBar.BARS : ['action-bar', 'result-actions-bar']).forEach(function(id) {
          var b = document.getElementById(id);
          if (b && b.style && b.style.display !== 'none' && b.offsetHeight > 0) bar = b;
        });
        var vh = (typeof window !== 'undefined' && window && Number(window.innerHeight)) || 0;
        var barTop = bar ? bar.getBoundingClientRect().top : (vh || Infinity);
        // (n3) 탭 진행 알약(#pace-pill, 액션바 바로 위)이 보이면 그 위를 아래 막는 선으로(알약 글자를 덮지 않게).
        //   +28은 toastSpot이 액션바가 커질 몫으로 빼는 값을 되돌린다(알약은 내 차례가 오면 사라진다).
        //   알약 자리는 Pacer가 같은 rAF 차례에 맞추므로 지금 사각형 대신 규칙(보이는 바 위 8px, 바가 없으면 화면 아래 8px)으로 셈한다
        var pill = rect(document.getElementById('pace-pill'));
        if (pill) {
          var pillTop = (bar ? barTop : (vh || pill.bottom + 8)) - 8 - (pill.bottom - pill.top);
          if (pillTop + 28 < barTop) barTop = pillTop + 28;
        }
        // 팟과 보드가 다른 판(폰 차트 시트, 완전 분석 시트)에 덮여 안 보이면 피할 까닭이 없다(가운데 점이 그 요소 안인지로 판단)
        var shown = function(e) {
          var r = rect(e);
          if (!r || typeof document.elementFromPoint !== 'function') return r;
          var h = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
          return (h && (h === e || (typeof e.contains === 'function' && e.contains(h)))) ? r : null;
        };
        var info = rect(document.getElementById('hand-info'));
        var top = toastSpot(rect(el), [shown(document.querySelector('.pot-display-wrap')), shown(document.getElementById('board-cards'))], barTop,
          { keep: [rect(document.getElementById('hand-log')), rect(document.getElementById('gto-toast')), rect(document.getElementById('gto-commentary')),
            rect(document.getElementById(el.id === 'coach-toast' ? 'app-toast' : 'coach-toast'))], below: info ? info.bottom : 0 });
        if (top != null) {
          if (el.dataset && !el.dataset.top0) el.dataset.top0 = el.style.top || '';   // 원래 자리(22%, 14%), replaceToasts가 되돌릴 때 쓴다
          el.style.top = top + 'px';
        }
      } catch (e) { /* 자리 옮기기 실패는 토스트를 그대로 둔다 */ }
    };
    var raf = (typeof window !== 'undefined' && window && typeof window.requestAnimationFrame === 'function') ? window.requestAnimationFrame : null;
    if (raf) { raf(run); return true; }
    run();
    return false;
  }
  // (n2b-verify) 핸드가 끝나 액션바가 결과바와 총평으로 바뀌면, 공개 중 액션바 위로 옮겨 둔 토스트가 '▶ 다음 핸드'와 총평을 덮었다(412x915 7/7핸드).
  // 원래 자리로 되돌린 뒤 결과 화면 기준(결과바 위 끝, 총평 패널 보호)으로 다시 고른다. → 다시 고른 토스트 수
  function replaceToasts() {
    if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return 0;
    var n = 0;
    ['coach-toast', 'app-toast'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el || !el.style) return;
      if (el.dataset && el.dataset.top0) el.style.top = el.dataset.top0;
      placeToast(el); n++;
    });
    return n;
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
      ? ' ' + _amt(amount) + 'bb' : '';
    var phrases = HERO_PHRASES[action] || [];
    var phrase = phrases[Math.floor(Math.random() * phrases.length)] || '';
    var dot = (light && LIGHT_COLOR[light])
      ? '<span class="hero-light-dot" style="background:' + LIGHT_COLOR[light] + '"></span>' : '';
    var key = actKey({ action: action });
    var div = document.createElement('div');
    div.className = 'seat-action fadein' + (_atCls(key) ? ' ' + _atCls(key) : '');
    if (key && div.setAttribute) div.setAttribute('data-act', key);
    div.innerHTML = dot + bubbleMainHTML(key, label + amt)
      + (phrase ? '<br><span class="act-say">' + phrase + '</span>' : '');
    seatEl.appendChild(div);
  }

  var api = { render, updateVillainActions, renderShowdown, showHeroAction, seatSlots, seatCardsHTML, seatEqHTML, _hudHTML,
    tableMaxStack, stackBar, seatDelta, seatDeltaHTML, isWinnerSeat, winnerBadgeHTML, fitWinnerBadges, toastSpot, placeToast, replaceToasts, round1, fmt1: _fmt1,
    stackTier, fmtStack, seatStackHTML, seatMarkHTML, seatTagHTML, isActing, handInfoText, actKey, actIcon, bubbleMainHTML };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
