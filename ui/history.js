// ui/history.js — 핸드 리뷰 화면 (세션 사이드바 + 스트리트별 복기)
var HistoryUI = (function() {
  var _returnTo = 'menu'; // 'menu' | 'game'
  var _groups = [];
  var _selGi = null; // 선택된 그룹(세션) 인덱스
  var _selHi = null; // 선택된 핸드 인덱스

  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var RED_SUIT = { h: true, d: true };
  var STREET_KOR = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
  var ACTION_KOR = { fold: '폴드', call: '콜', check: '체크', raise: '레이즈', allin: '올인', '3bet': '3벳', bet: '벳', raise_half: '레이즈(½팟)', raise_pot: '레이즈(팟)' };
  var VERDICT_KOR = { fold: '폴드', check: '체크', call: '콜', raise: '레이즈' };
  var LIGHT_ICON = { green: '🟢', yellow: '🟡', red: '🔴' };

  function _esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _resultHTML(result, baseCls) {
    if (result === 'fold') return '<span class="' + (baseCls ? baseCls + ' ' : '') + 'hh-fold">폴드</span>';
    if (result === 'win') return '<span class="' + (baseCls ? baseCls + ' ' : '') + 'hh-win">승</span>';
    return '<span class="' + (baseCls ? baseCls + ' ' : '') + 'hh-loss">패</span>';
  }
  var MODE_KOR = { 'headsup-tag': '헤즈업 TAG', 'sixmax': '6인 풀링', 'mixed': 'Mixed 은닉', 'gto-mirror': 'GTO 미러' };

  // ── DOM 렌더 ──

  function open(from) {
    _returnTo = (from === 'game') ? 'game' : 'menu';
    _groups = Storage.groupSessions(Storage.getHandHistory());
    _selGi = null;
    _selHi = null;
    var backBtn = document.getElementById('history-back-btn');
    if (backBtn) backBtn.textContent = (_returnTo === 'game') ? '↩ 게임으로 돌아가기' : '↩ 메뉴로';
    _setDetailOpen(false);
    _renderSidebar();
    _renderDetailPlaceholder();
    _renderMistakes();
    App.showScreen('screen-history');
  }

  // 세로 폰 2단계(목록 → 상세) 표시 상태. 클래스는 항상 토글하지만 의미는 css/mobile-screens.css의
  // 세로 폰 미디어쿼리 안에만 있음 → 데스크톱(사이드바+상세 나란히)은 무영향.
  function _setDetailOpen(on) {
    if (typeof document === 'undefined') return;
    var body = document.querySelector('#screen-history .history-body');
    if (body) body.classList.toggle('detail-open', !!on);
  }

  // 세로 폰 상세의 "↩ 목록" — 목록으로 돌아가며 보던 핸드를 화면 가운데로
  function showList() {
    _setDetailOpen(false);
    _renderSidebar();
    if (typeof document === 'undefined') return;
    var sel = document.querySelector('#history-sidebar .history-hand-item.selected');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'center' });
  }

  // ── 실수 로그(Storage.getMistakes) 최초 소비처 — 07-19 2차 패스, 07-20 7차 확장 ──
  // 기존에는 addMistake로 쌓이기만 하고 어디서도 읽지 않던 죽은 데이터였음.
  // 게임 실수(EV 손실)와 퀴즈 오답은 스키마가 달라 분기 렌더 — 퀴즈를 게임 스키마로 그리면 "undefined" 깨짐.
  var STREET_ICON = { preflop: '🃏', flop: '🂡', turn: '🂢', river: '🂣' };
  var _recentMistakes = []; // 🔁 연습 버튼 라우팅용 (렌더 순서와 동일)

  function _renderMistakes() {
    var el = document.getElementById('history-mistakes');
    if (!el) return;
    var mistakes = Storage.getMistakes();
    if (!mistakes.length) { el.innerHTML = ''; return; }
    _recentMistakes = mistakes.slice(-10).reverse();
    el.innerHTML = '<div class="hm-title">⚠ 최근 실수 — 게임 EV 손실·퀴즈 오답 (최근 ' + _recentMistakes.length + '건)</div>' +
      '<div class="hm-list">' + _recentMistakes.map(function(m, i) { return _mistakeRowHTML(m, i); }).join('') + '</div>';
  }

  function _mistakeRowHTML(m, idx) {
    // 퀴즈 오답 스키마: { subtype, situation, myAnswer, correct }
    if (m.situation != null || m.subtype != null) {
      var q = (m.situation || '').length > 60 ? m.situation.slice(0, 60) + '…' : (m.situation || '');
      return '<div class="hm-row hm-quiz" title="' + _fmtDate(m.date) + '">' +
        '<span class="hm-street">📝 퀴즈' + (m.subtype ? '(' + m.subtype + ')' : '') + '</span>' +
        '<span class="hm-action">' + q + '</span>' +
        '<span class="hm-delta">오답</span>' +
      '</div>';
    }
    var actLabel = ACTION_KOR[m.action] || m.action;
    var bestLabel = (m.verdict && VERDICT_KOR[m.verdict]) || ACTION_KOR[m.bestAction] || m.bestAction || '?';
    var icon = (m.light && LIGHT_ICON[m.light]) ? LIGHT_ICON[m.light] + ' ' : '';
    var cardsPart = (m.heroCards && m.heroCards.length)
      ? '<span class="hm-cards">' + _cardsHTML(m.heroCards) + (m.heroPos ? ' ' + _esc(m.heroPos) : '') + '</span> '
      : '';
    var whyHtml = m.why ? '<div class="hm-why">' + _esc(m.why) + '</div>' : '';
    var streetLabel = STREET_KOR[m.street] || m.street;
    var practiceBtn = (m.seed != null && idx != null)
      ? '<button class="hm-practice-btn" onclick="HistoryUI.practiceMistake(' + idx + ')">🔁 연습</button>'
      : '';
    return '<div class="hm-row" title="' + _fmtDate(m.date) + '">' +
      '<span class="hm-street">' + (STREET_ICON[m.street] || '') + ' ' + streetLabel + '</span>' +
      '<span class="hm-action">' + icon + cardsPart + actLabel + ' → 추천: ' + bestLabel + '</span>' +
      '<span class="hm-delta">' + (m.delta != null ? m.delta.toFixed(2) : '?') + 'bb</span>' +
      practiceBtn +
    '</div>' + whyHtml;
  }

  // 실수 패널 🔁 연습 — 실수 당시 seed/포지션/모드로 같은 핸드 반복 연습 진입
  function practiceMistake(idx) {
    var m = _recentMistakes[idx];
    if (!m || m.seed == null) return;
    if (App.startPractice) App.startPractice({ seed: m.seed, heroPos: m.heroPos, mode: m.mode });
  }

  function selectSession(gi) {
    if (_selGi === gi) {
      _selGi = null;
    } else {
      _selGi = gi;
    }
    _selHi = null;
    _setDetailOpen(false);
    _renderSidebar();
    _renderDetailPlaceholder();
  }

  function selectHand(gi, hi) {
    _selGi = gi;
    _selHi = hi;
    // 세로 폰 목록 단계(상세 숨김)에서 열 때는 맨 위부터 — 안 그러면 이전 핸드에서 내린 스크롤 위치가 남아
    // 헤더와 "↩ 목록"이 화면 위로 밀린 채 열림. 데스크톱은 상세가 늘 보이므로(숨김 아님) 이 분기를 타지 않음.
    var det = (typeof document !== 'undefined') ? document.getElementById('history-detail') : null;
    var wasHidden = !!(det && typeof getComputedStyle === 'function' && getComputedStyle(det).display === 'none');
    _renderSidebar();
    _renderDetail(gi, hi);
    var g = _groups[gi];
    _setDetailOpen(!!(g && g.hands[hi]));
    if (wasHidden) det.scrollTop = 0;
  }

  function back() {
    if (_returnTo === 'game') {
      App.showScreen('screen-game');
    } else {
      App.showMenu();
    }
  }

  function practice(gi, hi) {
    var g = _groups[gi];
    var record = g && g.hands[hi];
    if (!record) return;
    if (App.startPractice) App.startPractice(record);
  }

  function _renderSidebar() {
    var el = document.getElementById('history-sidebar');
    if (!el) return;
    if (!_groups.length) {
      el.innerHTML = '<div class="history-empty">저장된 핸드가 없습니다</div>';
      return;
    }
    el.innerHTML = _groups.map(function(g, gi) {
      var label = g.label || (MODE_KOR[g.mode] || g.mode || '세션');
      var expanded = (_selGi === gi);
      var handsHtml = '';
      if (expanded) {
        handsHtml = g.hands.map(function(h, hi) {
          var resHtml = _resultHTML(h.result);
          var selCls = (_selGi === gi && _selHi === hi) ? ' selected' : '';
          return '<div class="history-hand-item' + selCls + '" onclick="HistoryUI.selectHand(' + gi + ',' + hi + ')">' +
            '<span class="hh-cards">' + _cardsHTML(h.heroCards) + '</span>' +
            '<span class="hh-pot">' + (h.pot != null ? h.pot.toFixed(1) + 'bb' : '') + '</span>' +
            resHtml +
          '</div>';
        }).join('');
      }
      return '<div class="history-session-group">' +
        '<div class="history-session-header' + (expanded ? ' expanded' : '') + '" onclick="HistoryUI.selectSession(' + gi + ')">' +
          '<span class="hs-label">' + label + '</span>' +
          '<span class="hs-meta">' + _fmtDate(g.date) + ' · ' + g.count + '개</span>' +
        '</div>' +
        '<div class="history-hand-list" style="display:' + (expanded ? 'block' : 'none') + '">' + handsHtml + '</div>' +
      '</div>';
    }).join('');
  }

  function _renderDetailPlaceholder() {
    var el = document.getElementById('history-detail');
    if (!el) return;
    el.innerHTML = '<div class="history-empty">' +
      (_groups.length ? '왼쪽에서 핸드를 선택하세요' : '저장된 핸드가 없습니다') +
    '</div>';
  }

  function _renderDetail(gi, hi) {
    var el = document.getElementById('history-detail');
    if (!el) return;
    var g = _groups[gi];
    var record = g && g.hands[hi];
    if (!record) { _renderDetailPlaceholder(); return; }

    var headerHtml = '<div class="history-detail-header">' +
      '<span class="hdh-cards">' + _cardsHTML(record.heroCards) + '</span>' +
      (record.heroPos ? '<span class="hdh-pos">' + record.heroPos + '</span>' : '') +
      '<span class="hdh-mode">' + (MODE_KOR[record.mode] || record.mode || '') + '</span>' +
      '<span class="hdh-date">' + _fmtDate(record.date) + '</span>' +
      _resultHTML(record.result, 'hdh-result') +
      '<span class="hdh-pot">팟 ' + (record.pot != null ? record.pot.toFixed(1) + 'bb' : '-') + '</span>' +
    '</div>';

    var segs = buildStreetSegments(record);
    var streetsHtml = segs.map(function(seg) {
      var boardHtml = seg.board.length ? _cardsHTML(seg.board) : '<span class="hist-dim">-</span>';
      var decHtml = seg.decisions.length
        ? seg.decisions.map(function(d) {
            var light = lightFor(d);
            var actLabel = ACTION_KOR[d.action] || d.action;
            var deltaLabel = (light.icon === '⚪') ? light.label : (light.label + 'bb');
            return '<div class="history-decision-row">' + light.icon + ' ' + actLabel +
              ' <span class="hist-dim">(' + deltaLabel + ')</span></div>' +
              (d.why ? '<div class="hm-why">' + _esc(d.why) + '</div>' : '');
          }).join('')
        : '<div class="history-decision-row hist-dim">히어로 결정 없음</div>';
      return '<div class="history-street-block">' +
        '<div class="hsb-title">' + (STREET_KOR[seg.street] || seg.street) + '</div>' +
        '<div class="hsb-board">' + boardHtml + '</div>' +
        decHtml +
      '</div>';
    }).join('');

    var totalLight = _totalLight(record.decisions);
    var summaryHtml = '<div class="history-summary">' +
      '<div class="hs-total">' + totalLight.icon + ' 총 편차 ' + totalLight.label + '</div>' +
      '<div class="hs-comment">' + summaryComment(record) + '</div>' +
    '</div>';

    var practiceBtn = (record.seed != null)
      ? '<button class="menu-btn history-practice-btn" onclick="HistoryUI.practice(' + gi + ',' + hi + ')">🔁 이 핸드 연습</button>'
      : '';

    // 세로 폰 전용 "↩ 목록" (데스크톱은 css/mobile-screens.css 전역 규칙으로 숨김)
    var listBackBtn = '<button class="menu-btn secondary history-list-back" onclick="HistoryUI.showList()">↩ 목록</button>';

    el.innerHTML = listBackBtn + headerHtml + '<div class="history-streets">' + streetsHtml + '</div>' + summaryHtml + practiceBtn;
  }

  // ── 카드/날짜 렌더 헬퍼 ──

  function _cardHTML(str) {
    var rank = str[0], suit = str[1];
    var disp = rank === 'T' ? '10' : rank;
    var cls = RED_SUIT[suit] ? 'hist-red' : 'hist-black';
    return '<span class="hist-card ' + cls + '">' + disp + (SUIT_SYM[suit] || '') + '</span>';
  }

  function _cardsHTML(arr) {
    return (arr || []).map(_cardHTML).join(' ');
  }

  function _fmtDate(date) {
    return (date || '').slice(5, 16).replace('T', ' ');
  }

  // ── 총 편차 신호등 (스트리트 개별 lightFor와 별개 — 결정 0건은 '평가 없음', 완전 0 델타는 초록) ──

  function _totalLight(decisions) {
    decisions = decisions || [];
    if (decisions.length === 0) return { icon: '⚪', label: '평가 없음' };
    var total = decisions.reduce(function(s, d) { return s + ((d.actualEV || 0) - (d.bestEV || 0)); }, 0);
    var icon = total >= -0.3 ? '🟢' : total >= -1.5 ? '🟡' : '🔴';
    return { icon: icon, label: 'Δ' + (total >= 0 ? '+' : '') + total.toFixed(2) + 'bb' };
  }

  // ── 순수 함수 (node 테스트 대상 — DOM/localStorage 접근 금지) ──

  function buildStreetSegments(record) {
    var board = record.board || [];
    var decisions = record.decisions || [];
    var defs = [
      { street: 'preflop', need: 0 },
      { street: 'flop', need: 3 },
      { street: 'turn', need: 4 },
      { street: 'river', need: 5 }
    ];
    var segs = [];
    defs.forEach(function(d) {
      if (board.length >= d.need) {
        segs.push({
          street: d.street,
          board: board.slice(0, d.need),
          decisions: decisions.filter(function(dec) { return dec.street === d.street; })
        });
      }
    });
    return segs;
  }

  function lightFor(dec) {
    var actualEV = dec.actualEV, bestEV = dec.bestEV;
    // 코치 판정(dec.light)이 있으면 그 신호등이 우선
    if (dec.light && LIGHT_ICON[dec.light]) {
      var d0 = (actualEV || 0) - (bestEV || 0);
      return { icon: LIGHT_ICON[dec.light], label: 'Δ' + (d0 >= 0 ? '+' : '') + d0.toFixed(2) };
    }
    if (actualEV === 0 && bestEV === 0) return { icon: '⚪', label: '평가 없음' };
    var delta = actualEV - bestEV;
    var icon = delta >= -0.3 ? '🟢' : delta >= -1.5 ? '🟡' : '🔴';
    return { icon: icon, label: 'Δ' + (delta >= 0 ? '+' : '') + delta.toFixed(2) };
  }

  function summaryComment(record) {
    var decisions = record.decisions || [];
    var won = record.result === 'win';
    var folded = record.result === 'fold';
    if (decisions.length === 0) {
      return folded ? '폴드한 핸드입니다. 결정 없이 종료됐어요.' : won ? '결정 없이 팟을 가져간 핸드입니다.' : '결정 없이 종료된 핸드입니다.';
    }
    var totalDelta = decisions.reduce(function(s, d) { return s + ((d.actualEV || 0) - (d.bestEV || 0)); }, 0);
    var perf = totalDelta >= -0.3 ? 'GTO에 가까운 훌륭한 플레이였습니다.' :
               totalDelta >= -1.5 ? '작은 마진의 EV 손실이 있었던 플레이입니다.' :
               '큰 EV 손실이 있었던 플레이 — 복기가 필요합니다.';
    return (folded ? '폴드한 핸드입니다. ' : won ? '팟을 가져간 핸드입니다. ' : '팟을 내준 핸드입니다. ') + perf;
  }

  var api = {
    open: open,
    selectSession: selectSession,
    selectHand: selectHand,
    showList: showList,
    back: back,
    practice: practice,
    practiceMistake: practiceMistake,
    buildStreetSegments: buildStreetSegments,
    lightFor: lightFor,
    summaryComment: summaryComment,
    mistakeRowHTML: _mistakeRowHTML
  };

  if (typeof module !== 'undefined') {
    module.exports = {
      buildStreetSegments: buildStreetSegments,
      lightFor: lightFor,
      summaryComment: summaryComment,
      mistakeRowHTML: _mistakeRowHTML
    };
  }

  return api;
})();
