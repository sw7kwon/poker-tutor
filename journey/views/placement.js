// journey/views/placement.js (채우는 패키지: M1-P7)
// 배치 고사 화면(PlacementView, 설계서 2.6절, 9절 M1-P7): #screen-journey > #journey-root 안 서브뷰.
// 10문항 순차(손 라벨과 포지션 텍스트 + 선택 버튼, 진행 n/10) → 결과 카드(정답 수, 추천 단계, "이 단계로 시작 / S1부터").
// ↩ 종료와 결과 카드에서 나가기는 결과 미반영. 문항 중에 나가면 처음부터 다시 볼 수 있고, 결과 카드까지 봤으면
// 답안이 남아(Placement.savePending) 다시 열 때 같은 결과 카드로 돌아간다(재응시 없음). 결과 반영은 choose()의 Placement.apply 한 곳.
// 문항 중에는 정답을 알려 주지 않고(실력 확인) 결과 카드에서 문항별 정답과 한 줄 해설을 보여 준다.
// 로드 시 DOM 접근 없음. document, window, location은 전부 함수 안 typeof 가드.
var PlacementView = (function() {
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var RED = { h: 1, d: 1 };
  var KOR = { fold: '폴드', call: '콜', raise: '레이즈' };
  var GROUP_TAG = { rfi: '오픈', vs: '상대 오픈, 3벳 대응', potodds: '팟 오즈' };
  var GROUP_ROW = { rfi: '오픈 레인지', vs: '상대 오픈과 3벳 대응', potodds: '팟 오즈' };
  var CHART_LABEL = '이 앱의 차트 기준(입문용, 표준보다 UTG/HJ/CO가 2~8%p 타이트, SB RFI 32.1%와 vs3bet 표도 타이트)';
  var STYLE_ID = 'pv-style';
  var WRAP_ID = 'pv-wrap';
  var _s = null;          // { set, answers, idx, phase:'q'|'result', result, opts, navActive }
  var _bound = false;
  var _opening = false;
  var _styled = false;

  // ── 공통 ─────────────────────────────────────────
  function _hasDom() { return typeof document !== 'undefined' && document && typeof document.getElementById === 'function'; }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function _skipId() { return (typeof Placement !== 'undefined' && Placement.SKIP) || '?'; }
  function _num1(x) { var v = Math.round(x * 10) / 10; return (v % 1 === 0) ? String(v) : v.toFixed(1); }
  function _hashIsPlacement() {
    try { return typeof location !== 'undefined' && String(location.hash || '').indexOf('#j/placement') === 0; }
    catch (e) { return false; }
  }
  function _toast(msg, ms) {
    if (typeof JourneyUI !== 'undefined' && JourneyUI && typeof JourneyUI.toast === 'function') {
      try { JourneyUI.toast(msg, ms || 2600); } catch (e) { /* noop */ }
    }
  }

  // 팟 오즈 표기 규약(8.4절): "팟(상대 벳 포함) X bb, 콜 Y bb", 필요 승률 = Y/(X+Y)
  function _pot(q) {
    var Y = (typeof q.toCall === 'number') ? q.toCall : q.B;
    var X = (typeof q.potTotal === 'number') ? q.potTotal : (q.P + q.B);
    return { X: X, Y: Y, pct: Math.round(Y / (X + Y) * 100) };
  }

  function _optLabel(q, o) {
    if (o === _skipId()) return '모르겠어요';
    if (q.type === 'potodds') return (q.labels && q.labels[o]) || o;
    if (typeof PreflopDrill !== 'undefined' && PreflopDrill.actionLabel) return PreflopDrill.actionLabel(q, o);
    return KOR[o] || o;
  }

  function _spotLabel(q) {
    if (q.type === 'potodds') { var p = _pot(q); return '팟 ' + _num1(p.X) + 'bb, 콜 ' + _num1(p.Y) + 'bb'; }
    if (q.kind === 'rfi') return q.pos + ' 오픈(앞 전원 폴드) ' + q.hand;
    if (q.kind === 'vsRfi') return q.pos + ' vs ' + (q.opener || '상대') + ' 오픈 ' + q.hand;
    return q.pos + ' 오픈 후 3벳 ' + q.hand;
  }

  // 'A9s' → '같은 무늬', 'KJo' → '다른 무늬', '77' → '페어'
  function _handHint(hand) {
    if (!hand) return '';
    if (hand.length === 2) return '페어';
    return hand[2] === 's' ? '같은 무늬' : '다른 무늬';
  }

  function _cardsHTML(cards) {
    return (cards || []).map(function(c) {
      return '<div class="card drill-card ' + (RED[c.suit] ? 'red' : 'black') + '" data-suit="' + _esc(c.suit) + '">' +
        (c.rank === 'T' ? '10' : _esc(c.rank)) + (SUIT_SYM[c.suit] || '') + '</div>';
    }).join('');
  }

  // ── 스타일(이 뷰 전용, 1회 주입) ──────────────────────
  var CSS = [
    '.pv-wrap{position:fixed;inset:0;z-index:30;overflow-y:auto;overscroll-behavior:contain;background:#0a0e14;display:flex;justify-content:center;align-items:flex-start;}',
    '.pv-box{width:100%;max-width:520px;min-height:100%;padding:12px 16px calc(24px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:12px;}',
    /* 폴리시(VIS-08): 공통 상단 바(.top-bar, css/main.css)와 같은 모양. 왼쪽 44px 원형 ↩(.j-back), 금색 제목 */
    '.pv-top{display:flex;align-items:center;gap:10px;font-weight:700;min-height:44px;}',
    '.pv-title{flex:1;min-width:0;font-size:1.15rem;color:var(--gold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.pv-prog{color:var(--text-dim);font-size:.9rem;font-variant-numeric:tabular-nums;}',
    '.pv-top .pv-exit{flex:0 0 auto;width:44px;height:44px;padding:0;margin:0;border-radius:50%;cursor:pointer;background:var(--btn-neutral,#21262d);color:var(--text);border:1px solid var(--hud-border);font:inherit;font-size:1.1rem;}',
    '.pv-bar{height:6px;border-radius:3px;background:var(--hud-border);overflow:hidden;}',
    '.pv-bar i{display:block;height:100%;background:var(--gold);}',
    '.pv-sub{color:var(--text-dim);font-size:.85rem;line-height:1.5;word-break:keep-all;}',
    '.pv-stage{display:flex;flex-direction:column;gap:12px;}',
    '.pv-q{display:flex;flex-direction:column;gap:12px;background:var(--hud-bg);border:1px solid var(--hud-border);border-radius:12px;padding:14px;}',
    '.pv-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.75rem;}',
    '.pv-chip{display:inline-block;border-radius:4px;padding:2px 7px;font-weight:600;}',
    '.pv-chip-chart{background:rgba(88,166,255,.15);color:var(--blue);border:1px solid var(--blue);}',
    '.pv-chip-exact{background:rgba(63,185,80,.15);color:var(--green);border:1px solid var(--green);}',
    '.pv-group{color:var(--text-dim);}',
    '.pv-prompt{font-size:1.05rem;font-weight:600;line-height:1.5;word-break:keep-all;}',
    '.pv-hand{display:flex;align-items:center;justify-content:center;gap:14px;}',
    '.pv-cards{display:flex;gap:8px;}',
    '.pv-hand-label{font-size:1.3rem;font-weight:800;color:var(--gold);line-height:1.2;text-align:center;}',
    '.pv-hand-label small{display:block;font-size:.75rem;font-weight:400;color:var(--text-dim);}',
    '.pv-pot{font-size:1.1rem;text-align:center;padding:12px;background:var(--felt);border-radius:10px;line-height:1.5;word-break:keep-all;}',
    '.pv-ask{font-size:.95rem;color:var(--text);text-align:center;}',
    '.pv-choices{display:flex;flex-wrap:wrap;gap:8px;}',
    '.pv-choices .drill-choice{flex:1 1 120px;min-height:52px;}',
    '.pv-skip{flex:1 1 100%;min-height:44px;border-radius:8px;border:1px dashed var(--hud-border);background:transparent;color:var(--text-dim);font:inherit;cursor:pointer;}',
    '.pv-score{font-size:1.4rem;font-weight:800;text-align:center;}',
    '.pv-score b{color:var(--gold);font-size:2rem;}',
    '.pv-rows{display:flex;flex-direction:column;}',
    '.pv-row{display:flex;justify-content:space-between;gap:8px;font-size:.92rem;border-bottom:1px solid var(--hud-border);padding:8px 0;}',
    '.pv-rec{background:var(--hud-bg);border:1px solid var(--gold);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:6px;}',
    '.pv-rec-head{font-size:1.05rem;font-weight:700;line-height:1.5;word-break:keep-all;}',
    '.pv-rec-head b{color:var(--gold);}',
    '.pv-badge{display:inline-block;margin-left:6px;font-size:.78rem;border:1px solid var(--gold);color:var(--gold);border-radius:10px;padding:1px 8px;vertical-align:middle;}',
    '.pv-why,.pv-note,.pv-label{color:var(--text-dim);font-size:.82rem;line-height:1.5;word-break:keep-all;}',
    '.pv-btns{display:flex;flex-direction:column;gap:8px;}',
    '.pv-btns .menu-btn{width:100%;min-height:48px;padding:10px 12px;margin:0;}',
    '.pv-review summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600;}',
    '.pv-item{display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--hud-border);font-size:.88rem;line-height:1.45;word-break:keep-all;}',
    '.pv-mark{flex:0 0 auto;font-weight:800;}',
    '.pv-ok .pv-mark{color:var(--green);}',
    '.pv-bad .pv-mark{color:var(--red);}',
    '.pv-item-sub{display:block;color:var(--text-dim);font-size:.8rem;}',
    '@media (max-width: 600px), (orientation: portrait) and (max-width: 760px){',
    '.pv-box{padding:8px 16px calc(20px + env(safe-area-inset-bottom,0px));}',
    '.pv-stage{flex:1;}',
    '.pv-choices{margin-top:auto;}',
    '}'
  ].join('\n');

  function _ensureStyle() {
    if (_styled || !_hasDom()) return;
    try {
      var old = document.getElementById(STYLE_ID);
      if (old && old.tagName === 'STYLE') { _styled = true; return; }
      var st = document.createElement('style');
      st.id = STYLE_ID;
      st.setAttribute('id', STYLE_ID);
      st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
      _styled = true;
    } catch (e) { /* noop */ }
  }

  function _host(opts) {
    if (!_hasDom()) return null;
    var root = (opts && opts.root) || document.getElementById('journey-root') || document.getElementById('screen-journey');
    return root || document.body || null;
  }

  function _wrapEl() {
    if (!_hasDom()) return null;
    var el = document.getElementById(WRAP_ID);
    return (el && el.className && String(el.className).indexOf('pv-wrap') >= 0) ? el : null;
  }

  function _mount() {
    var host = _host(_s && _s.opts);
    if (!host) return null;
    var el = _wrapEl();
    if (!el) {
      el = document.createElement('div');
      el.id = WRAP_ID;
      el.setAttribute('id', WRAP_ID);
      el.className = 'pv-wrap';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', '실력 확인');
      host.appendChild(el);
    }
    return el;
  }

  function _unmount() {
    var el = _wrapEl();
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ── 렌더 ─────────────────────────────────────────
  function _topHTML(title, prog) {
    // VIS-08: ↩를 왼쪽 원형(.j-back)으로. 로직 무변경, 마크업 순서만
    return '<div class="pv-top top-bar">' +
      '<button class="j-back pv-exit" onclick="PlacementView.exit()" aria-label="그만두기(결과 미반영)">↩</button>' +
      '<span class="pv-title">' + title + '</span>' +
      (prog ? '<span class="pv-prog" aria-live="polite">' + prog + '</span>' : '') + '</div>';
  }

  function _qHTML() {
    var items = _s.set.items, idx = _s.idx, total = items.length;
    var it = items[idx], q = it.q;
    var pct = Math.round(idx / total * 100);
    var head = _topHTML('🧭 실력 확인', (idx + 1) + '/' + total) +
      '<div class="pv-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
      (idx === 0 ? '<div class="pv-sub">결과로 시작 단계를 추천해요. 모르면 찍지 말고 "모르겠어요"를 눌러요.</div>' : '');
    var chip = q.type === 'potodds' ? '<span class="pv-chip pv-chip-exact">엔진 계산</span>' : '<span class="pv-chip pv-chip-chart">이 앱 차트 기준</span>';
    var body;
    if (q.type === 'potodds') {
      var p = _pot(q);
      body = '<div class="pv-pot">팟 <b>' + _num1(p.X) + 'bb</b>(상대 벳 ' + _num1(p.Y) + 'bb 포함), 콜 <b>' + _num1(p.Y) + 'bb</b></div>' +
        '<div class="pv-ask">콜하면 몇 번에 1번 이겨야 본전일까요?</div>';
    } else {
      body = '<div class="pv-prompt">' + _esc(q.prompt) + '</div>' +
        '<div class="pv-hand"><div class="pv-cards">' + _cardsHTML(q.cards) + '</div>' +
        '<div class="pv-hand-label">' + _esc(q.hand) + '<small>' + _handHint(q.hand) + '</small></div></div>' +
        '<div class="pv-ask">이 손으로 어떻게 할까요?</div>';
    }
    var opts = q.options.map(function(o, i) {
      return '<button class="drill-choice drill-' + _esc(o) + '" data-opt="' + _esc(o) + '" onclick="PlacementView.answer(\'' + _esc(o) + '\')">' +
        '<span class="drill-key">' + (i + 1) + '</span>' + _esc(_optLabel(q, o)) + '</button>';
    }).join('');
    opts += '<button class="pv-skip" data-opt="' + _esc(_skipId()) + '" onclick="PlacementView.answer(\'' + _esc(_skipId()) + '\')">' +
      '<span class="drill-key">' + (q.options.length + 1) + '</span>모르겠어요</button>';
    return '<div class="pv-box">' + head +
      '<div class="pv-stage"><div class="pv-q"><div class="pv-tags">' + chip + '<span class="pv-group">' + _esc(GROUP_TAG[it.group] || '') + '</span></div>' +
      body + '</div><div class="pv-choices">' + opts + '</div></div></div>';
  }

  function _groupTotals(items) {
    var n = { rfi: 0, vs: 0, potodds: 0 };
    items.forEach(function(it) { if (n.hasOwnProperty(it.group)) n[it.group]++; });
    return n;
  }

  function _stageName(n) {
    var info = (typeof Placement !== 'undefined' && Placement.stageInfo) ? Placement.stageInfo(n) : null;
    return { name: (info && info.name) || ('S' + n), title: (info && info.title) || '' };
  }

  function _skipCount(stage) {
    if (stage <= 1 || typeof Placement === 'undefined' || !Placement.skipList) return 0;
    return Placement.skipList(stage).length;
  }

  function _reviewHTML() {
    var items = _s.set.items;
    var rows = items.map(function(it, idx) {
      var q = it.q, mine = _s.answers[idx];
      var ok = mine != null && String(mine) === String(q.answer);
      var right = _optLabel(q, q.answer);
      var my = mine == null ? '없음' : _optLabel(q, String(mine));
      var sub = '';
      if (!ok) {
        if (q.type === 'potodds') {
          var p = _pot(q);
          sub = '필요 승률 = 콜 ÷ (팟+콜) = ' + _num1(p.Y) + ' ÷ (' + _num1(p.X) + '+' + _num1(p.Y) + ') = ' + p.pct + '%';
        } else if (typeof PreflopDrill !== 'undefined' && PreflopDrill.explain) {
          try { sub = PreflopDrill.explain(q).line || ''; } catch (e) { sub = ''; }
        }
      }
      return '<div class="pv-item ' + (ok ? 'pv-ok' : 'pv-bad') + '"><span class="pv-mark">' + (ok ? '✓ 맞음' : '✗ 틀림') + '</span><span>' +
        (idx + 1) + '. ' + _esc(_spotLabel(q)) + ': 정답 <b>' + _esc(right) + '</b>' + (ok ? '' : ', 내 답 ' + _esc(my)) +
        (sub ? '<span class="pv-item-sub">' + _esc(sub) + '</span>' : '') + '</span></div>';
    }).join('');
    return '<details class="pv-review"><summary>문항별 정답 보기</summary>' + rows + '</details>';
  }

  function _resultHTML() {
    var r = _s.result, items = _s.set.items;
    var tot = _groupTotals(items);
    var rec = r.stage, nm = _stageName(rec);
    var rows = ['rfi', 'vs', 'potodds'].map(function(g) {
      return '<div class="pv-row"><span>' + GROUP_ROW[g] + '</span><span>' + r.byGroup[g] + '/' + tot[g] + '</span></div>';
    }).join('');
    var skipN = _skipCount(rec);
    var why;
    if (rec <= 1) why = '족보와 말하는 순서부터 차근차근 시작해요. 프리플랍과 팟 오즈는 S2에서 그림으로 배워요.';
    else why = (rec === 2 ? 'S1' : 'S1~S' + (rec - 1)) + ' 노드' + (skipN ? ' ' + skipN + '개' : '') +
      '를 통과(건너뜀)로 표시해요. 건너뛴 노드도 언제든 다시 볼 수 있어요.';
    var btns = rec > 1 ?
      '<button class="menu-btn pv-go" onclick="PlacementView.choose(\'placed\')">S' + rec + ' ' + _esc(nm.name) + '부터 시작</button>' +
      '<button class="menu-btn secondary pv-s1" onclick="PlacementView.choose(\'s1\')">S1부터 차근차근</button>' :
      '<button class="menu-btn pv-go" onclick="PlacementView.choose(\'placed\')">S1 ' + _esc(_stageName(1).name) + '부터 시작</button>';
    return '<div class="pv-box">' + _topHTML('🧭 실력 확인 결과', '') +
      '<div class="pv-score"><b>' + r.correct + '</b>/' + items.length + ' 정답</div>' +
      '<div class="pv-rows">' + rows + '</div>' +
      '<div class="pv-rec"><div class="pv-rec-head">추천 시작 단계 <b>S' + rec + ' ' + _esc(nm.name) + '</b>' +
      (nm.title ? '<span class="pv-badge">' + _esc(nm.title) + '</span>' : '') + '</div>' +
      '<div class="pv-why">' + why + '</div></div>' +
      '<div class="pv-btns">' + btns + '</div>' +
      '<div class="pv-note">실력 확인은 한 번만 봐요. 나중에 더 위로 가고 싶으면 승급 시험(보스)으로 건너뛸 수 있어요. 고르지 않고 ↩로 나가도 이 결과는 남아 있어서, 다시 열면 여기서 이어서 골라요.</div>' +
      _reviewHTML() +
      '<div class="pv-label">기준: 정답 4개 이하 S1, 5~7개 S2, 8개 이상이면서 상대 오픈과 3벳 대응 2개 이상 S3.</div>' +
      '<div class="pv-label">프리플랍 정답은 ' + CHART_LABEL + '. 팟 오즈는 엔진 계산.</div>' +
      '</div>';
  }

  function _render() {
    if (!_s) return;
    if (!_s.navActive && _hashIsPlacement()) _s.navActive = true;   // Nav가 기록을 늦게 넣은 경우(조용한 되감기 뒤)
    _ensureStyle();
    var el = _mount();
    if (!el) return;
    el.innerHTML = _s.phase === 'result' ? _resultHTML() : _qHTML();
    try { if (el.scrollTop) el.scrollTop = 0; } catch (e) { /* noop */ }
  }

  // ── 입력(데스크톱 키보드: 숫자, Enter, Esc) ─────────────
  function _visible() {
    if (!_s || !_hasDom()) return false;
    var scr = document.getElementById('screen-journey');
    return !!(_wrapEl() && scr && scr.classList && scr.classList.contains('active'));
  }

  function _onKey(e) {
    if (!_visible()) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var k = String(e.key || '').toLowerCase();
    var handled = false;
    if (k === 'escape') { exit(); handled = true; }
    else if (_s.phase === 'q') {
      var q = _s.set.items[_s.idx].q;
      var n = parseInt(k, 10);
      if (n >= 1 && n <= q.options.length) { answer(q.options[n - 1]); handled = true; }
      else if (n === q.options.length + 1) { answer(_skipId()); handled = true; }
    } else if (_s.phase === 'result' && k === 'enter') {
      var tg = e.target && e.target.tagName;
      if (tg !== 'BUTTON' && tg !== 'SUMMARY') { choose('placed'); handled = true; }
    }
    if (handled) { if (e.preventDefault) e.preventDefault(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
  }

  // 안드로이드 뒤로(popstate)로 '#j/placement'를 벗어나면 세션을 버린다(결과 미반영). 화면 전환은 Nav/JourneyUI 몫
  function _onPop() {
    if (_s && _s.navActive && !_hashIsPlacement()) { _s = null; _unmount(); }
  }

  function _bind() {
    if (_bound || typeof window === 'undefined' || !window || typeof window.addEventListener !== 'function') return;
    _bound = true;
    try { window.addEventListener('keydown', _onKey, true); window.addEventListener('popstate', _onPop); } catch (e) { /* noop */ }
  }

  // ── 흐름 ─────────────────────────────────────────
  // open(opts?) → boolean. opts: { seed, root(마운트 위치), nav(false면 '#j/placement' push 안 함), onDone(summary), onExit() }
  function open(opts) {
    if (_opening) return true;               // Nav/JourneyUI 위임이 다시 open을 부르는 재진입 방지
    if (typeof Placement === 'undefined' || !Placement.build) return false;
    if (Placement.isDone && Placement.isDone()) {
      _toast('실력 확인은 한 번만 봐요. 더 높은 단계는 보스 시험으로 건너뛸 수 있어요.');
      return false;
    }
    opts = (opts && typeof opts === 'object') ? opts : {};
    // 결과 카드까지 보고 고르지 않고 나갔으면 같은 시드, 같은 답안의 결과 카드로 돌아간다(재응시 없음)
    var pend = (typeof Placement.pending === 'function') ? Placement.pending() : null;
    var set = Placement.build(pend ? pend.seed : (typeof opts.seed === 'number' ? opts.seed : Placement.DEFAULT_SEED));
    if (!set || !set.items || !set.items.length) return false;
    if (pend) pend = Placement.pending(set);
    _opening = true;
    try {
      _s = { set: set, answers: [], idx: 0, phase: 'q', result: null, opts: opts, navActive: false, t0: Date.now() };
      if (pend) {
        _s.answers = pend.answers.slice(0, set.items.length);
        _s.idx = set.items.length;
        _s.result = Placement.grade(set.items, _s.answers);
        _s.phase = 'result';
      }
      _bind();
      // 여정 화면이 이미 보이면 showScreen을 다시 부르지 않는다. JourneyUI.view가 막 넣은 '#j/placement' 기록을
      // Nav.onShow('screen-journey')가 되감아(popstate) 방금 연 배치 고사를 스스로 닫는 문제를 막는다.
      var scr = _hasDom() ? document.getElementById('screen-journey') : null;
      var shown = !!(scr && scr.classList && typeof scr.classList.contains === 'function' && scr.classList.contains('active'));
      if (scr && !shown && typeof App !== 'undefined' && App && typeof App.showScreen === 'function') {
        try { App.showScreen('screen-journey'); } catch (e) { /* noop */ }
      }
      _render();
      if (opts.nav !== false && !_hashIsPlacement() && typeof Nav !== 'undefined' && Nav && typeof Nav.view === 'function') {
        try { Nav.view('placement', ''); } catch (e) { /* noop */ }
      }
      if (_s) _s.navActive = _hashIsPlacement();
    } finally { _opening = false; }
    return true;
  }

  // JourneyUI.view('placement', params)가 render(root, params)로 위임해도 같은 화면
  function render(root, params) {
    if (!_s) return open(Object.assign({}, params || {}, root ? { root: root } : {}));
    if (root) _s.opts.root = root;
    _render();
    return true;
  }

  // answer(id) → boolean. id = 보기 id(preflop 'fold'|'call'|'raise', potodds '0'~'3') 또는 '?'(모르겠어요)
  function answer(id) {
    if (!_s || _s.phase !== 'q') return false;
    var it = _s.set.items[_s.idx];
    if (!it) return false;
    id = String(id);
    if (id !== _skipId() && it.q.options.indexOf(id) < 0) return false;
    _s.answers[_s.idx] = id;
    _s.idx += 1;
    if (_s.idx >= _s.set.items.length) finish();
    else _render();
    return true;
  }

  // finish() → grade 결과. 남은 문항은 오답 처리
  function finish() {
    if (!_s) return null;
    _s.result = Placement.grade(_s.set.items, _s.answers);
    _s.phase = 'result';
    if (typeof Placement.savePending === 'function') {
      try { Placement.savePending(_s.set, _s.answers, Date.now()); } catch (e) { /* noop */ }
    }
    _render();
    return _s.result;
  }

  // '#j/placement' 기록을 조용히 걷어낸다(Nav.closeView가 있을 때만). Nav.back은 popstate로 홈을 한 번 더 그려
  // 오늘의 5분 흐름을 끊을 수 있어 쓰지 않는다. 없으면 기록은 남고 다음 뒤로가 홈을 다시 그린다.
  function _dropNav(navActive) {
    if (!navActive || !_hashIsPlacement()) return;
    if (typeof Nav !== 'undefined' && Nav && typeof Nav.closeView === 'function') {
      try { Nav.closeView(); } catch (e) { /* noop */ }
    }
  }

  function _leave(kind, summary, msg) {
    var opts = (_s && _s.opts) || {};
    var navActive = !!(_s && _s.navActive);
    _s = null;
    _unmount();
    if (kind === 'done' && typeof opts.onDone === 'function') { opts.onDone(summary); return; }
    if (kind === 'exit' && typeof opts.onExit === 'function') { opts.onExit(); return; }
    _dropNav(navActive);
    // 오늘의 5분 블록에서 왔으면: 어댑터가 대기 블록을 걸어 뒀으면(TodayUI.hasPending) JourneyUI.open → resume이
    // 결과를 반영하고, 대기 블록 없이 진행 중이면 onBlockDone으로 직접 알린다(done 필드 포함)
    var todayPending = typeof TodayUI !== 'undefined' && TodayUI && typeof TodayUI.hasPending === 'function' && TodayUI.hasPending();
    if (kind === 'done' && !todayPending && typeof TodayUI !== 'undefined' && TodayUI && typeof TodayUI.onBlockDone === 'function' &&
        typeof Journey !== 'undefined' && Journey && typeof Journey.active === 'function' && Journey.active()) {
      TodayUI.onBlockDone(summary);
      if (msg) _toast(msg);
      return;
    }
    if (typeof JourneyUI !== 'undefined' && JourneyUI && typeof JourneyUI.open === 'function') {
      JourneyUI.open();
      if (msg) _toast(msg);
      return;
    }
    if (typeof App !== 'undefined' && App && typeof App.showMenu === 'function') App.showMenu();
  }

  // choose('placed' | 's1') → apply 결과 | false. 결과 반영은 여기 한 곳
  function choose(which) {
    if (!_s || _s.phase !== 'result' || !_s.result) return false;
    var r = _s.result;
    var stage = which === 's1' ? 1 : r.stage;
    var out;
    try { out = Placement.apply({ correct: r.correct, byGroup: r.byGroup, stage: stage, recommended: r.stage }, Date.now()); }
    catch (e) { out = false; }   // 중간 실패 뒤 다시 적용하면 이미 통과한 노드는 건너뛰고 이어서 처리된다
    if (out === false) {
      _toast('기록을 저장하지 못했어요. 이미 실력 확인을 봤거나 여정 기록을 쓸 수 없는 상태예요.');
      _leave('exit');
      return false;
    }
    var nm = _stageName(out.stage);
    var minutes = Math.round((Date.now() - (_s.t0 || Date.now())) / 6000) / 10;
    var summary = { block: 'learn', kind: 'placement', done: true, applied: true, stage: out.stage, recommended: r.stage,
      correct: r.correct, total: _s.set.items.length, skippedNodes: out.skippedNodes.length, minutes: minutes,
      line: '실력 확인 끝! S' + out.stage + '부터 시작해요' };
    _leave('done', summary, 'S' + out.stage + ' ' + nm.name + '부터 시작해요.');
    return out;
  }

  // ↩: 결과 미반영으로 나가기(문항 중이든 결과 카드든, 결과 카드의 답안은 남는다)
  function exit() {
    if (!_s) return false;
    _leave('exit');
    return true;
  }

  // 테스트와 디버그용 스냅샷(복사본)
  function state() {
    if (!_s) return null;
    return { phase: _s.phase, idx: _s.idx, total: _s.set.items.length, answers: _s.answers.slice(),
      result: _s.result ? JSON.parse(JSON.stringify(_s.result)) : null,
      current: _s.phase === 'q' ? _s.set.items[_s.idx] : null };
  }

  var api = { open: open, render: render, answer: answer, finish: finish, choose: choose, exit: exit, state: state };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
