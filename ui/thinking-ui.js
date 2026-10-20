// ui/thinking-ui.js, 8차 WP8(여정 M4-P4 개편): 띵킹 프로세스 모드 UI(속마음 피드, 히어로 3단계 칩, 리플레이, 속마음 맞히기)
// app.js 훅: onNewHand / onVillainAction(state, name, action, amount, snap) / onHeroTurn / onHeroAction / onHandEnd (모두 typeof 가드)
//
// M4-P4(설계서 4.7절 9번, 6.1절 settings, 6.2절 6번, 7.3절 8번, 계약 T5는 theater/theater-core.js 머리 주석):
//   공개 방식 poker_thinking_mode.reveal: 'after'(결정 후 공개, 기본) | 'live'(실시간) | 'end'(핸드 끝 리플레이에서만).
//     값이 없거나 모르는 값이면 'after'다. 'live'와 'end'는 예전 동작 그대로다.
//   'after': 결정 전에는 빌런 속마음을 피드와 말풍선 어디에도 내지 않고 _log에만 쌓는다. 히어로가 액션하면 그때까지 쌓인 것을
//     한 묶음(피드 1칸)으로 공개하고 말풍선은 1곳만 띄운다. 히어로가 폴드한 뒤에는 바로 보이고, 핸드가 끝나면 남은 것을 한꺼번에 공개한다.
//     검증에 걸린 레이즈(민레이즈 미달 등)는 결정이 아니라서 공개하지 않는다(앱이 토스트를 띄우고 계속 기다린다).
//     관전 상태(state.spectator, 계약 T1)는 지킬 결정이 없어 바로 보인다.
//   속마음 맞히기(fun M8): 'after'이고 poker_journey_settings.guessInGame(기본 true)일 때 핸드당 최대 1번,
//     포스트플랍에서 빌런 벳을 직면했거나(그 벳의 속마음) 코치 판정이 비자명(V.marginal)일 때만 묻는다.
//     프리플랍은 묻지 않는다(프리플랍 빌런 액션은 손 등급으로 거의 정해져 자명하다, 설계서 3.3절 시뮬).
//     같은 시드 핸드를 다시 칠 때(연습, GTO 미러 2~3회차)는 묻지 않는다(답을 이미 봤다).
//     보기 = Thinking intent 어휘 중 그 액션으로 나올 수 있는 것(벳/레이즈: 밸류, 블러프, 세미블러프(리버는 뺀다) /
//     콜: 함정, 팟 오즈 콜 / 체크: 함정, 팟컨트롤, 포기) + 확신도(확신/애매). 실제 의도가 보기 밖이면 묻지 않는다(보기로 답이 새지 않게).
//     공개 때 채점: JStats.record('intent', {ok, w}), w = 맞히면 1 - 1/보기 수(찍어서 맞힐 몫을 뺀 가중), 틀리면 0.
//     확신했는데 틀리면 Drills.record('intent', '<유형>|<스트리트>|<의도>', false)로 box 0에 넣는다. 단 'intent'를 복습에서 낼
//     경로(PuzzleUI가 낼 수 있는 Puzzles 'intent' 등록 또는 DrillUI 유형)가 있고 키 정책이 'srs'일 때만이다(_intentReviewable).
//     경로가 없으면 낼 수 없는 box 0 항목이 오늘의 5분 복습 상한을 먼저 차지해 다른 복습을 밀어낸다.
//     결과에는 '캐릭터 읽기(정답 아님)' 라벨(설계서 8.2절 5번, 보라).
//   토글: 띵킹 토글 상자 안 체크박스(이 파일이 DOM으로 넣는다, index.html과 SettingsView는 그대로)와 맞히기 카드의 '묻지 않기'.
//     저장은 A11y.save({guessInGame}) 병합(없으면 같은 키에 직접 병합).
//   기존 'live' 사용자에게는 첫 히어로 차례에 1회 안내 카드(6.2절 6번, 그 핸드 동안 유지). 보여 준 뒤 poker_thinking_mode.noticeAfter = true.
//   말풍선: 'after'에서는 공개 때 1곳만 띄우고, 맞히기를 물을 때와 새 핸드에서는 남은 말풍선을 치운다(지난 속마음이 답처럼 보이지 않게).
//   configure({feedLines, pinBubble}): 피드 줄 수(기본 4)와 말풍선 고정(기본 3.2초 뒤 사라짐). 다른 화면(극장 등)용 옵션.
//   css/thinking.css는 이 패키지 소유가 아니라서 맞히기 카드의 최소 스타일만 <style id="thinking-ui-style">로 1번 넣는다.
// 규약: 로드 시 DOM 접근은 init(DOMContentLoaded 뒤)뿐이고 다른 모듈(Thinking, JStats, Drills, A11y, GameState)은 typeof 가드.
var ThinkingUI = (function() {
  var KEY = 'poker_thinking_mode';
  var SKEY = 'poker_journey_settings';
  var STYLE_ID = 'thinking-ui-style';
  var MODES = ['after', 'live', 'end'];
  var AGGRO = { bet: 1, raise: 1, '3bet': 1, allin: 1 };
  var ACT_KOR = { fold: '폴드', call: '콜', check: '체크', raise: '레이즈', '3bet': '3벳', allin: '올인', bet: '벳' };
  var GUESS_SETS = { aggro: ['value', 'bluff', 'semibluff'], call: ['trap', 'call-odds'], check: ['trap', 'pot-control', 'give-up'] };
  var INTENT_FALLBACK = { value: '밸류', bluff: '블러프', semibluff: '세미블러프', 'pot-control': '팟컨트롤',
    'call-odds': '팟 오즈 콜', 'give-up': '포기', trap: '함정' };
  var CONF_KOR = { sure: '확신', unsure: '애매' };
  var READ_LABEL = '캐릭터 읽기(정답 아님)';
  var SEEN_MAX = 200;
  // 팟 오즈 붙여 쓴 표기(8.4절 4번) → 띄어 쓰기. 소스가 용어 린트에 걸리지 않게 \u 이스케이프
  var POT_ODDS_TIGHT = /\uD31F\uC624\uC988/g;
  var CSS = [
    '#thinking-panel .thinking-guess, #thinking-panel .thinking-notice { margin: 0 0 6px; padding: 6px 8px; border-left: 3px solid #a371f7;',
    '  border-radius: 6px; background: rgba(163,113,247,0.10); }',
    '#thinking-panel .thinking-guess-title { color: #e6edf3; margin-bottom: 2px; }',
    // 세로 폰 도크에서 '내 속마음 정리'를 접으면(mobile.css #thinking-panel.m-collapsed .thinking-row) 맞히기와 안내 칩까지 숨는다.
    // 접기는 3단계 칩만 접는 것이라 이 두 카드의 줄은 계속 보인다(선택자가 더 구체적이라 이긴다)
    '#thinking-panel.m-collapsed .thinking-guess .thinking-row, #thinking-panel.m-collapsed .thinking-notice .thinking-row { display: flex; }',
    '.thinking-read { display: inline-block; color: #d2a8ff; font-size: .72rem; border: 1px solid rgba(210,168,255,0.5);',
    '  border-radius: 8px; padding: 0 5px; white-space: nowrap; }',
    '.thinking-guess-sub { color: #8b949e; font-size: .74rem; margin-right: 2px; }',
    '#thinking-panel .thinking-chip.thinking-guess-off { background: transparent; color: #8b949e; }',
    '.thinking-guess-res { color: #d2a8ff; }',
    '#thinking-guess-wrap { margin-top: 6px; font-size: .82rem; color: #8b949e; }'
  ].join('\n');

  var _cfg = { on: false, reveal: 'after', noticeAfter: false };
  var _view = { feedLines: 4, pinBubble: false };
  var _log = [];          // 핸드 단위 로그 [{type:'villain'|'guess'|'hero', street, ...}]
  var _pro = null;        // 현재 히어로 결정의 프로 생각
  var _choice = {};       // 현재 히어로 칩 선택
  var _stats = { matched: 0, total: 0 };   // 세션 누적 단계 일치
  var _gstats = { n: 0, ok: 0 };           // 세션 누적 속마음 맞히기
  var _hand = _freshHand(null);
  var _seen = [];         // 이 화면 세션에서 이미 친 시드(같은 시드 재생은 맞히기 없음)
  var _pinned = null;     // 고정 말풍선
  var _bubbleEls = [];    // 떠 있는 말풍선(3.2초 뒤 스스로 사라짐)
  var _styled = false;

  function _freshHand(seed) {
    return { seed: seed, replay: false, asked: false, guess: null, heroDone: false, notice: false, result: null };
  }

  function _esc(s) {
    return String(s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function _el(id) {
    return (typeof document !== 'undefined' && document && document.getElementById) ? document.getElementById(id) : null;
  }
  function _ls() { try { return (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null; } catch (e) { return null; } }
  function _readJSON(k) {
    var ls = _ls();
    if (!ls) return null;
    try { var v = JSON.parse(ls.getItem(k) || 'null'); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null; } catch (e) { return null; }
  }
  function _r2(x) { return Math.round(x * 100) / 100; }
  function _clear(el) {
    if (!el) return;
    el.innerHTML = '';
    while (el.children && el.children.length) el.removeChild(el.children[0]);
  }

  // ── 설정 ──
  function normalizeReveal(v) { return MODES.indexOf(v) >= 0 ? v : 'after'; }

  function _load() {
    var v = _readJSON(KEY);
    _cfg.on = !!(v && v.on);
    _cfg.reveal = normalizeReveal(v && v.reveal);
    _cfg.noticeAfter = !!(v && v.noticeAfter);
  }
  function _save() {
    var ls = _ls();
    if (!ls) return;
    var o = { on: _cfg.on, reveal: _cfg.reveal };
    if (_cfg.noticeAfter) o.noticeAfter = true;
    try { ls.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  function guessEnabled() {
    var s = _readJSON(SKEY);
    return !(s && s.guessInGame === false);
  }
  function setGuessInGame(on) {
    on = !!on;
    var done = false;
    if (typeof A11y !== 'undefined' && A11y && typeof A11y.save === 'function') {
      try { A11y.save({ guessInGame: on }); done = true; } catch (e) { done = false; }
    }
    if (!done) {
      var s = _readJSON(SKEY) || { v: 1 };
      s.guessInGame = on;
      var ls = _ls();
      if (ls) { try { ls.setItem(SKEY, JSON.stringify(s)); } catch (e) {} }
    }
    _syncOpts();
    return on;
  }

  function setReveal(mode) {
    _cfg.reveal = normalizeReveal(mode);
    _cfg.noticeAfter = true;
    _save();
    var sel = _el('thinking-reveal');
    if (sel) sel.value = _cfg.reveal;
    _syncOpts();
    return _cfg.reveal;
  }
  function revealMode() { return _cfg.reveal; }

  function configure(o) {
    o = o || {};
    if (o.feedLines != null) {
      var n = Math.floor(Number(o.feedLines));
      if (isFinite(n)) _view.feedLines = Math.max(1, Math.min(50, n));
    }
    if (o.pinBubble != null) {
      _view.pinBubble = !!o.pinBubble;
      if (!_view.pinBubble) _unpin();
    }
    return { feedLines: _view.feedLines, pinBubble: _view.pinBubble };
  }

  // 빌런 선택 화면 토글 바인딩
  function init() {
    _load();
    var cb = _el('thinking-toggle');
    var sel = _el('thinking-reveal');
    if (cb) {
      cb.checked = _cfg.on;
      cb.onchange = function() { _cfg.on = cb.checked; _save(); _syncOpts(); };
    }
    if (sel) {
      sel.value = _cfg.reveal;
      // 고른 값을 그대로 저장한다('after' 포함). 직접 고른 사람에게는 안내 카드가 필요 없다
      sel.onchange = function() { _cfg.reveal = normalizeReveal(sel.value); _cfg.noticeAfter = true; _save(); _syncOpts(); };
    }
    _mountGuessToggle();
    _syncOpts();
  }
  // 띵킹 토글 상자 안(공개 방식 줄 아래)에 맞히기 체크박스 1개
  function _mountGuessToggle() {
    if (typeof document === 'undefined' || !document.createElement || _el('thinking-guess-toggle')) return;
    var wrap = _el('thinking-reveal-wrap');
    var box = wrap && wrap.parentNode;
    if (!box || !box.insertBefore) return;
    var div = document.createElement('div');
    div.id = 'thinking-guess-wrap';
    var label = document.createElement('label');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'thinking-guess-toggle';
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' 🔮 속마음 맞히기(결정 후 공개에서 핸드당 최대 1번)'));
    div.appendChild(label);
    box.insertBefore(div, wrap.nextSibling || null);
    _ensureStyle();
  }
  function _syncOpts() {
    var box = _el('thinking-reveal-wrap');
    if (box && box.style) box.style.opacity = _cfg.on ? '1' : '0.45';
    var sel = _el('thinking-reveal');
    if (sel) sel.disabled = !_cfg.on;
    var gOn = _cfg.on && _cfg.reveal === 'after';
    var gw = _el('thinking-guess-wrap');
    if (gw && gw.style) gw.style.opacity = gOn ? '1' : '0.45';
    var gc = _el('thinking-guess-toggle');
    if (gc) {
      gc.checked = guessEnabled();
      gc.disabled = !gOn;
      gc.onchange = function() { setGuessInGame(gc.checked); };
    }
  }
  function _ensureStyle() {
    if (_styled || typeof document === 'undefined' || !document.createElement) return;
    _styled = true;
    if (_el(STYLE_ID)) return;
    var head = document.head;
    if (!head || !head.appendChild) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    head.appendChild(st);
  }

  function isOn() { return _cfg.on && typeof Thinking !== 'undefined'; }

  // ── 피드 (테이블 좌상단, 최근 feedLines칸, 공개 묶음은 1칸) ──
  function _feed(html, cls) {
    var f = _el('thinking-feed');
    if (!f || typeof document === 'undefined') return;
    f.style.display = 'block';
    var line = document.createElement('div');
    line.className = 'thinking-line' + (cls ? ' ' + cls : '');
    line.innerHTML = html;
    f.appendChild(line);
    while (f.children.length > _view.feedLines) f.removeChild(f.children[0]);
    f.scrollTop = f.scrollHeight;
  }

  // 좌석 근처 말풍선 (3초 페이드, pinBubble이면 다음 말풍선까지 고정), 좌석 innerHTML 재렌더와 무관하게 table-area 위에 띄움
  function _bubble(state, name, text) {
    var p = state && state.players && state.players[name];
    var seat = p && _el('seat-' + p.pos);
    var area = seat && seat.closest ? seat.closest('.table-area') : null;
    if (!seat || !area || !seat.getBoundingClientRect) return;
    var sr = seat.getBoundingClientRect(), ar = area.getBoundingClientRect();
    var b = document.createElement('div');
    b.className = 'thinking-bubble';
    b.textContent = String(text).replace(/^💭 [^:]+: /, '💭 ');
    // 좁은 화면(세로 폰)에서는 폭을 줄이고 좌우 끝을 넘지 않게 클램프, 데스크톱은 220px 그대로
    var bw = Math.min(220, ar.width - 8);
    if (bw < 220) b.style.width = bw + 'px';
    b.style.left = Math.max(4, Math.min(ar.width - bw - 4, sr.left - ar.left + sr.width / 2 - bw / 2)) + 'px';
    b.style.top = Math.max(4, sr.top - ar.top - 46) + 'px';
    if (_view.pinBubble) {
      _unpin();
      b.style.animation = 'none';
      area.appendChild(b);
      _pinned = b;
      return;
    }
    area.appendChild(b);
    _bubbleEls.push(b);
    setTimeout(function() {
      if (b.parentNode) b.parentNode.removeChild(b);
      var i = _bubbleEls.indexOf(b);
      if (i >= 0) _bubbleEls.splice(i, 1);
    }, 3200);
  }
  function _unpin() {
    if (_pinned && _pinned.parentNode) _pinned.parentNode.removeChild(_pinned);
    _pinned = null;
  }
  // 남아 있는 말풍선을 모두 치운다(새 핸드, 결정 뒤 공개 직전, 맞히기 질문 때: 지난 속마음이 답처럼 보이지 않게)
  function _clearBubbles() {
    _bubbleEls.forEach(function(b) { if (b.parentNode) b.parentNode.removeChild(b); });
    _bubbleEls = [];
    _unpin();
  }

  // 빌런 속마음 1건 표시(피드 + 말풍선)
  function _show(e, state) {
    e.shown = true;
    _feed(_esc(e.text), 'thinking-villain');
    _bubble(state, e.name, e.text);
  }

  function _intentLabel(k) {
    var m = (typeof Thinking !== 'undefined' && Thinking && Thinking.INTENT_KOR) ? Thinking.INTENT_KOR : null;
    var s = (m && m[k]) || INTENT_FALLBACK[k] || String(k);
    return s.replace(POT_ODDS_TIGHT, '팟 오즈');
  }

  // ── 맞히기 판정(순수) ──
  // 그 액션으로 나올 수 있는 의도 보기(실제 값과 무관하게 액션과 스트리트로만 정한다)
  function guessOptions(action, street) {
    var kind = AGGRO[action] ? 'aggro' : action === 'call' ? 'call' : action === 'check' ? 'check' : null;
    var base = kind ? GUESS_SETS[kind].slice() : [];
    if (street === 'river') base = base.filter(function(k) { return k !== 'semibluff'; });   // 리버는 다음 카드가 없다
    return base;
  }
  // guessSpot(state, log, V) → null | { entry, reason:'bet'|'marginal', options }
  //   log의 아직 안 보인(shown false) 빌런 항목 중 이번 스트리트 것만 본다. 프리플랍(보드 3장 미만)은 null.
  function guessSpot(state, log, V) {
    if (!state || !state.board || state.board.length < 3 || state.street === 'preflop') return null;
    var street = state.street;
    var cur = (log || []).filter(function(e) {
      return e && e.type === 'villain' && !e.shown && e.street === street && e.action !== 'fold';
    });
    if (!cur.length) return null;
    var toCall = _toCall(state);
    var lr = state.lastRaiser;
    var entry = null, reason = null, i;
    if (toCall > 0 && lr && lr !== 'Hero') {
      for (i = cur.length - 1; i >= 0; i--) {
        if (cur[i].name === lr && AGGRO[cur[i].action]) { entry = cur[i]; reason = 'bet'; break; }
      }
    }
    if (!entry && V && V.marginal) { entry = cur[cur.length - 1]; reason = 'marginal'; }
    if (!entry || !entry.intent) return null;
    var options = guessOptions(entry.action, street);
    if (options.indexOf(entry.intent) < 0) return null;
    return { entry: entry, reason: reason, options: options };
  }

  function _maybeAsk(state, V) {
    if (_cfg.reveal !== 'after' || _hand.asked || _hand.replay || !guessEnabled()) return null;
    var spot = guessSpot(state, _log, V);
    if (!spot) return null;
    var e = spot.entry;
    _hand.asked = true;
    _clearBubbles();
    _hand.guess = { name: e.name, street: e.street, action: e.action, actual: e.intent, vtype: e.vtype || null,
      options: spot.options, reason: spot.reason, entry: e, pick: null, conf: null, done: false };
    return _hand.guess;
  }

  // 확신 오답을 box 0에 넣어도 복습에서 낼 수 있는가. 오늘의 5분 복습은 Puzzles 등록 유형(PuzzleUI.can 통과)이나
  // DrillUI 유형(Drills.get)만 내고 나머지는 버린다(today-ui.js _reviewPlan). 그런데 Today.orderReview는 box 0을 먼저 상한까지
  // 채우므로, 낼 수 없는 'intent' box 0 항목이 쌓이면 복습 칸을 영구히 차지해 진짜 복습(preflop, potodds 등)을 밀어낸다.
  // 그래서 'intent'를 내는 경로(M6 gen-read 등록 또는 DrillUI 유형)가 있고 키 정책이 'srs'일 때만 넣는다.
  function _intentReviewable() {
    if (typeof Drills === 'undefined' || !Drills || typeof Drills.record !== 'function') return false;
    try {
      if (typeof Drills.policyOf === 'function' && Drills.policyOf('intent') === 'once') return false;
      if (typeof Drills.get === 'function' && Drills.get('intent')) return true;
      return typeof Puzzles !== 'undefined' && !!Puzzles && typeof Puzzles.has === 'function' && !!Puzzles.has('intent') &&
        typeof PuzzleUI !== 'undefined' && !!PuzzleUI && typeof PuzzleUI.can === 'function' && !!PuzzleUI.can('intent');
    } catch (e) { return false; }
  }

  // 공개 때 채점과 기록. 고르지 않았으면 null(기록 없음)
  function _gradeGuess(g) {
    if (!g || g.done) return null;
    g.done = true;
    if (!g.pick) return null;
    var ok = g.pick === g.actual;
    var conf = g.conf === 'sure' ? 'sure' : 'unsure';
    var w = ok ? _r2(1 - 1 / Math.max(1, g.options.length)) : 0;
    _gstats.n++; if (ok) _gstats.ok++;
    if (typeof JStats !== 'undefined' && JStats && typeof JStats.record === 'function') {
      try { JStats.record('intent', { ok: ok, w: w }); } catch (e) {}
    }
    var srsKey = null;
    if (conf === 'sure' && !ok) {
      srsKey = (g.vtype || 'unknown') + '|' + g.street + '|' + g.actual;
      if (_intentReviewable()) {
        try { Drills.record('intent', srsKey, false); } catch (e) {}
      }
    }
    return { name: g.name, street: g.street, action: g.action, pick: g.pick, conf: conf, actual: g.actual, ok: ok, w: w,
      options: g.options.slice(), text: g.entry ? g.entry.text : '', entry: g.entry, srsKey: srsKey };
  }

  function _resultLine(r) {
    return '🔮 맞히기 ' + (r.ok ? '✅' : '❌') + ': 내 답 ' + _esc(_intentLabel(r.pick)) + '(' + CONF_KOR[r.conf] + '), ' +
      _esc(r.name) + '의 생각 ' + _esc(_intentLabel(r.actual)) + ' <span class="thinking-read">' + READ_LABEL + '</span>';
  }

  // 결정 전까지 쌓인 빌런 속마음을 피드 1칸으로 공개(+ 맞히기 결과). 반환 = 공개한 빌런 항목 수
  function _revealPending(state, why, res) {
    var pend = _log.filter(function(e) { return e.type === 'villain' && !e.shown; });
    if (!pend.length && !res) return 0;
    var html = '<div class="thinking-sys">' + (why === 'end' ? '🔓 핸드 끝, 남은 상대 속마음' : '🔓 내 결정 뒤 공개, 상대 속마음') + '</div>';
    pend.forEach(function(e) {
      e.shown = true;
      html += '<div class="thinking-villain">' + _esc(e.text) + '</div>';
    });
    if (res) html += '<div class="thinking-guess-res">' + _resultLine(res) + '</div>';
    _feed(html, 'thinking-reveal');
    if (why !== 'end' && state) {
      var b = res && res.entry ? res.entry : null, i;
      for (i = pend.length - 1; !b && i >= 0; i--) if (AGGRO[pend[i].action]) b = pend[i];
      if (!b && pend.length) b = pend[pend.length - 1];
      _clearBubbles();
      if (b) _bubble(state, b.name, b.text);
    }
    return pend.length;
  }

  // 검증에 걸릴 레이즈인가(GameState.applyHeroAction과 같은 검사, app.js _normalizeHeroAction과 같은 올인 변환)
  function _invalidRaise(state, action, amount) {
    if (action !== 'raise' && action !== 'allin') return false;
    if (typeof GameState === 'undefined' || !GameState || typeof GameState.applyHeroAction !== 'function') return false;
    var heroBet = (state.playerBets && state.playerBets.Hero) || 0;
    var maxTo = heroBet + ((state.stacks && state.stacks.Hero) || 0);
    var act = action, amt;
    if (action === 'allin') amt = maxTo;
    else {
      amt = amount;
      if (amt == null) { var el = _el('raise-amount'); amt = parseFloat(el && el.value) || 0; }
      amt = Number(amt) || 0;
      if (amt >= maxTo - 0.01) act = 'allin';
    }
    try { var r = GameState.applyHeroAction(state, act, amt); return !!(r && r.actionError); } catch (e) { return false; }
  }

  // 히어로가 지금 내야 할 콜 금액(상태가 없으면 1로 보아 폴드를 결정 끝으로 친다)
  function _toCall(state) {
    if (!state) return 1;
    return Math.max(0, (state.currentBet || 0) - ((state.playerBets && state.playerBets.Hero) || 0));
  }

  function _snapOpts(a) {
    if (!a || typeof a !== 'object' || typeof a.potBefore !== 'number') return undefined;
    return { snapshot: { potBefore: a.potBefore, currentBetBefore: a.currentBetBefore, haveBefore: a.haveBefore } };
  }

  // ── 훅 ──
  function onNewHand(state) {
    var seed = state && state.seed != null ? state.seed : null;
    _log = []; _pro = null; _choice = {};
    _hand = _freshHand(seed);
    if (seed != null) {
      if (_seen.indexOf(seed) >= 0) _hand.replay = true;
      else { _seen.push(seed); if (_seen.length > SEEN_MAX) _seen.shift(); }
    }
    _clearBubbles();
    _hidePanel();
    var gc = _el('gto-commentary');
    if (gc && gc.style) gc.style.flexWrap = '';
    var f = _el('thinking-feed');
    if (f) {
      _clear(f);
      f.style.display = isOn() ? 'block' : 'none';
      if (isOn()) _feed('🎙 핸드 #' + _esc(state && state.handNum || '') + ' 띵킹 중계 시작' +
        (_cfg.reveal === 'end' ? ' (상대 속마음은 핸드 끝나고 공개)' : _cfg.reveal === 'after' ? ' (상대 속마음은 내 결정 뒤 공개)' : ''), 'thinking-sys');
    }
  }

  function onVillainAction(state, name, action, amount, snap) {
    if (!isOn() || !state) return;
    var t;
    try { t = Thinking.villainThought(state, name, action, amount, _snapOpts(snap)); } catch (e) { return; }
    if (!t || !t.text) return;
    var p = state.players && state.players[name];
    var e = { type: 'villain', street: t.street || state.street, name: name, action: action, amount: amount,
      text: t.text, intent: t.intent, vtype: p ? p.type : null, shown: false };
    _log.push(e);
    // 관전 상태(state.spectator, 계약 T1)에는 지킬 히어로 결정이 없으므로 'after'도 바로 보인다
    if (_cfg.reveal === 'live' || (_cfg.reveal === 'after' && (_hand.heroDone || state.spectator))) _show(e, state);
  }

  function onHeroTurn(state, heroPos, eq, ev) {
    if (!isOn() || !state) return;
    var toCall = _toCall(state);
    try { _pro = Thinking.proThought(state, heroPos, eq, toCall, state.pot); } catch (e) { _pro = null; }
    _choice = {};
    _hand.result = null;
    if (_cfg.reveal === 'live' && !_cfg.noticeAfter) { _hand.notice = true; _cfg.noticeAfter = true; _save(); }
    var asked = _maybeAsk(state, ev && ev.verdict);
    _renderPanel();
    if (asked || _hand.notice) _surface();
  }

  function onHeroAction(state, action, amount) {
    if (!isOn()) return;
    if (state && _invalidRaise(state, action, amount)) return;   // 결정이 아님: 앱이 토스트 후 계속 기다린다
    var res = _gradeGuess(_hand.guess);
    if (_cfg.reveal === 'after') _revealPending(state, 'hero', res);
    if (res) _log.push({ type: 'guess', street: res.street, name: res.name, pick: res.pick, conf: res.conf, actual: res.actual, ok: res.ok });
    if (_pro) {
      var entry = { type: 'hero', street: _pro.street || (state && state.street), action: action, pro: _pro, choice: null, grade: null };
      if (Object.keys(_choice).length > 0) {
        var g = Thinking.gradeHeroThought(_choice, _pro);
        _stats.matched += g.matched; _stats.total += g.total;
        // 여정 통계(대시보드 띵킹 추세, 배지 'think-10' = 프로와 같은 판단 누적 10번). M6 통합 검증에서 연결
        if (g.total > 0 && typeof JStats !== 'undefined' && JStats && typeof JStats.record === 'function') {
          try { JStats.record('think', { m: g.matched, t: g.total }); } catch (e) {}
        }
        entry.choice = _choice; entry.grade = g;
        var marks = g.steps.map(function(s) { return (s.match ? '✅' : '❌') + s.title.slice(0, 1); }).join(' ');
        _feed('🧠 나의 속마음 vs 프로: ' + marks + '<br><span class="thinking-sub">' + _esc(g.feedback) + '</span>', 'thinking-hero');
      }
      _log.push(entry);
    }
    // 진짜 폴드만 결정 끝이다. 콜 금액이 0일 때 누른 폴드는 앱이 체크로 바꾸고(app.js _normalizeHeroAction) 핸드가 계속되므로
    // 여기서 heroDone을 세우면 다음 결정 전 빌런 속마음이 바로 보인다
    if (action === 'fold' && _toCall(state) > 0) _hand.heroDone = true;
    _pro = null; _choice = {};
    _hand.result = res;
    if (res || _hand.notice) _renderPanel(); else _hidePanel();   // 안내 카드는 그 핸드 동안 유지(버튼이나 핸드 끝에 닫힘)
  }

  function onHandEnd(state, result) {
    if (!isOn()) return;
    if (_hand.guess) _hand.guess.done = true;
    _hand.notice = false;
    _pro = null;
    if (_cfg.reveal === 'after') _revealPending(state, 'end', null);
    if (_hand.result) _renderPanel(); else _hidePanel();
    var panel = _el('gto-commentary');
    if (panel) { panel.style.flexWrap = 'wrap'; renderReplay(panel); panel.style.display = 'flex'; }
  }

  // ── 맞히기 조작(카드 칩 → 이 함수들, 테스트도 직접 부른다) ──
  function pickGuess(key) {
    var g = _hand.guess;
    if (!g || g.done || g.options.indexOf(key) < 0) return null;
    g.pick = g.pick === key ? null : key;
    _renderPanel();
    return g.pick;
  }
  function pickConf(c) {
    var g = _hand.guess;
    if (!g || g.done || !CONF_KOR[c]) return null;
    g.conf = g.conf === c ? null : c;
    _renderPanel();
    return g.conf;
  }
  // '묻지 않기': 이번 카드를 닫고 guessInGame을 끈다
  function skipGuess() {
    var g = _hand.guess;
    if (g) g.done = true;
    _hand.guess = null;
    setGuessInGame(false);
    _feed('🔮 속마음 맞히기를 껐어요. 빌런 선택 화면의 띵킹 상자에서 다시 켤 수 있어요.', 'thinking-sys');
    _renderPanel();
  }

  // ── 히어로 패널(안내 카드, 맞히기 카드, 3단계 칩) ──
  function _chip(act, key, label, on, extra) {
    return '<button type="button" class="thinking-chip' + (extra ? ' ' + extra : '') + (on ? ' on' : '') +
      '" data-act="' + act + '"' + (key ? ' data-key="' + _esc(key) + '"' : '') + '>' + _esc(label) + '</button>';
  }
  function _noticeHTML() {
    return '<div class="thinking-notice"><div>💡 바뀐 점: 이제 기본은 \'결정 후 공개\'예요. 상대 속마음이 내 결정 뒤에 열리고, ' +
      '핸드당 한 번 속마음 맞히기가 나와요.</div><div class="thinking-row">' +
      _chip('to-after', null, '결정 후 공개로 바꾸기', false) + _chip('keep-live', null, '지금처럼 실시간', false) + '</div></div>';
  }
  function _guessHTML(g) {
    return '<div class="thinking-guess"><div class="thinking-guess-title">🔮 <b>' + _esc(g.name) + '</b>의 ' +
      _esc(ACT_KOR[g.action] || g.action) + ', 속마음은? <span class="thinking-read">' + READ_LABEL + '</span></div>' +
      '<div class="thinking-row thinking-guess-row">' +
      g.options.map(function(k) { return _chip('pick', k, _intentLabel(k), g.pick === k); }).join('') + '</div>' +
      '<div class="thinking-row thinking-guess-row"><span class="thinking-guess-sub">확신도</span>' +
      _chip('conf', 'sure', CONF_KOR.sure, g.conf === 'sure') + _chip('conf', 'unsure', CONF_KOR.unsure, g.conf === 'unsure') +
      _chip('guess-off', null, '묻지 않기', false, 'thinking-guess-off') + '</div></div>';
  }
  function _resultHTML(r) {
    return '<div class="thinking-guess thinking-guess-done"><div class="thinking-guess-res">' + _resultLine(r) + '</div>' +
      (r.text ? '<div class="thinking-sub">' + _esc(r.text) + '</div>' : '') + '</div>';
  }
  function _stepsHTML() {
    var o = Thinking.heroThoughtOptions(_pro && _pro.street);
    var html = '<div class="thinking-panel-title">🧠 내 속마음 정리 (선택사항, 건너뛰어도 액션 가능)</div>';
    o.steps.forEach(function(step) {
      html += '<div class="thinking-row"><span class="thinking-step">' + o.titles[step] + '</span>' +
        o.options[step].map(function(opt) {
          return '<button type="button" class="thinking-chip' + (_choice[step] === opt.key ? ' on' : '') +
            '" data-step="' + step + '" data-key="' + opt.key + '">' + _esc(opt.label) + '</button>';
        }).join('') + '</div>';
    });
    return html;
  }
  function _renderPanel() {
    var p = _el('thinking-panel');
    if (!p) return;
    var html = '';
    if (_hand.notice) html += _noticeHTML();
    if (_hand.result) html += _resultHTML(_hand.result);
    if (_hand.guess && !_hand.guess.done) html += _guessHTML(_hand.guess);
    if (_pro && typeof Thinking !== 'undefined' && Thinking.heroThoughtOptions) html += _stepsHTML();
    if (!html) { _hidePanel(); return; }
    _ensureStyle();
    p.innerHTML = html;
    p.style.display = 'block';
    p.onclick = _onPanelClick;
  }
  // 칩 클릭 위임(다시 그려도 바인딩 유지)
  function _onPanelClick(e) {
    var t = e && e.target;
    if (!t || !t.closest) return;
    var b = t.closest('[data-act]');
    if (b) { _act(b.getAttribute('data-act'), b.getAttribute('data-key')); return; }
    var c = t.closest('[data-step]');
    if (c) {
      var s = c.getAttribute('data-step'), k = c.getAttribute('data-key');
      if (_choice[s] === k) delete _choice[s]; else _choice[s] = k;
      _renderPanel();
    }
  }
  function _act(act, key) {
    if (act === 'pick') pickGuess(key);
    else if (act === 'conf') pickConf(key);
    else if (act === 'guess-off') skipGuess();
    else if (act === 'to-after' || act === 'keep-live') {
      if (act === 'to-after') setReveal('after');
      _hand.notice = false;
      _renderPanel();
    }
  }
  // 세로 폰 도크 상단은 내부 스크롤이고 MobileUI.onHeroTurn이 맨 위로 되돌린다. 그 뒤(타이머 0)에 맞히기나 안내 카드가
  // 상단 영역 밖이면 그 카드가 보이게 상단만 스크롤한다(화면 전체는 움직이지 않음). 데스크톱은 도크가 없어 아무 일 없음
  function _surface() {
    if (typeof setTimeout !== 'function') return;
    setTimeout(function() {
      var p = _el('thinking-panel');
      var card = p && p.querySelector ? p.querySelector('.thinking-notice, .thinking-guess') : null;
      var top = p && p.closest ? p.closest('.m-dock-top') : null;
      if (!card || !top || !card.getBoundingClientRect || !top.getBoundingClientRect) return;
      var cr = card.getBoundingClientRect(), tr = top.getBoundingClientRect();
      // 최소 이동: 카드 아래가 잘리면 카드 끝이 보일 만큼(카드 위를 넘지 않게), 위가 잘리면 카드 위로
      if (cr.top < tr.top) top.scrollTop += cr.top - tr.top - 4;
      else if (cr.bottom > tr.bottom) top.scrollTop += Math.min(cr.bottom - tr.bottom + 4, cr.top - tr.top - 4);
    }, 0);
  }
  function _hidePanel() {
    var p = _el('thinking-panel');
    if (p) { p.style.display = 'none'; p.innerHTML = ''; }
  }

  // ── 리플레이 (핸드 종료: 빌런 속마음 전부 공개 + 맞히기 + 히어로 선택 + 프로 생각) ──
  function renderReplay(container) {
    if (!container || typeof Thinking === 'undefined') return;
    var rate = _stats.total > 0 ? Math.round(_stats.matched / _stats.total * 100) + '% (' + _stats.matched + '/' + _stats.total + ' 단계)' : '아직 기록 없음';
    var html = '<details class="thinking-replay"><summary>🎙 띵킹 프로세스 리플레이 (눌러서 펼치기)</summary><div class="thinking-replay-body">' +
      '<div class="thinking-rate">세션 띵킹 일치율: ' + rate + '</div>';
    if (_gstats.n > 0) {
      html += '<div class="thinking-rate">세션 속마음 맞히기: ' + _gstats.ok + '/' + _gstats.n +
        ' <span class="thinking-read">' + READ_LABEL + '</span></div>';
    }
    var cur = null;
    if (_log.length === 0) html += '<div class="thinking-r-line">기록된 속마음이 없습니다.</div>';
    _log.forEach(function(e) {
      if (e.street !== cur) {
        cur = e.street;
        html += '<div class="thinking-r-street">' + _esc(Thinking.STREET_KOR[cur] || cur) + '</div>';
      }
      if (e.type === 'villain') {
        html += '<div class="thinking-r-line thinking-villain">' + _esc(e.text) + '</div>';
      } else if (e.type === 'guess') {
        html += '<div class="thinking-r-line thinking-guess-res">' + _resultLine(e) + '</div>';
      } else {
        var mine = e.grade
          ? e.grade.steps.map(function(s) { return (s.match ? '✅ ' : '❌ ') + s.title + ' ' + s.chosen; }).join(', ')
          : '(선택 안 함)';
        html += '<div class="thinking-r-line thinking-hero">🙋 나: ' + _esc(ACT_KOR[e.action] || e.action) + ' / ' + _esc(mine) + '</div>' +
          '<div class="thinking-r-line thinking-pro">🎓 프로: ' + _esc(e.pro.range) + ' / ' + _esc(e.pro.hand) + ' / ' + _esc(e.pro.plan) + '</div>';
      }
    });
    html += '</div></details>';
    if (container.insertAdjacentHTML) container.insertAdjacentHTML('beforeend', html);
    else container.innerHTML = (container.innerHTML || '') + html;
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return {
    init: init, isOn: isOn, onNewHand: onNewHand, onVillainAction: onVillainAction, onHeroTurn: onHeroTurn,
    onHeroAction: onHeroAction, onHandEnd: onHandEnd, renderReplay: renderReplay,
    revealMode: revealMode, setReveal: setReveal, normalizeReveal: normalizeReveal,
    guessEnabled: guessEnabled, setGuessInGame: setGuessInGame, configure: configure,
    guessSpot: guessSpot, guessOptions: guessOptions, pickGuess: pickGuess, pickConf: pickConf, skipGuess: skipGuess,
    READ_LABEL: READ_LABEL,
    _getLog: function() { return _log; }, _getStats: function() { return _stats; },
    _getGuessStats: function() { return _gstats; }, _getHand: function() { return _hand; },
    _resetSession: function() { _stats = { matched: 0, total: 0 }; _gstats = { n: 0, ok: 0 }; _seen = []; }
  };
})();
