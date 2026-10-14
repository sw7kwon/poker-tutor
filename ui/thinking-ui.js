// ui/thinking-ui.js — WP8: 띵킹 프로세스 모드 UI (속마음 피드, 히어로 3단계 칩, 리플레이)
// app.js 훅: onNewHand / onVillainAction / onHeroTurn / onHeroAction / onHandEnd (모두 typeof 가드)
var ThinkingUI = (function() {
  var KEY = 'poker_thinking_mode';
  var _cfg = { on: false, reveal: 'live' };   // reveal: 'live'(실시간 공개) | 'end'(핸드 끝나고 공개)
  var _log = [];          // 핸드 단위 로그 [{type:'villain'|'hero', street, ...}]
  var _pro = null;        // 현재 히어로 결정의 프로 생각
  var _choice = {};       // 현재 히어로 칩 선택
  var _stats = { matched: 0, total: 0 };  // 세션 누적 단계 일치

  function _esc(s) {
    return String(s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function _el(id) { return document.getElementById(id); }

  function _load() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && typeof v === 'object') { _cfg.on = !!v.on; _cfg.reveal = v.reveal === 'end' ? 'end' : 'live'; }
    } catch (e) {}
  }
  function _save() { try { localStorage.setItem(KEY, JSON.stringify(_cfg)); } catch (e) {} }

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
      sel.onchange = function() { _cfg.reveal = sel.value === 'end' ? 'end' : 'live'; _save(); };
    }
    _syncOpts();
  }
  function _syncOpts() {
    var box = _el('thinking-reveal-wrap');
    if (box) box.style.opacity = _cfg.on ? '1' : '0.45';
    var sel = _el('thinking-reveal');
    if (sel) sel.disabled = !_cfg.on;
  }

  function isOn() { return _cfg.on && typeof Thinking !== 'undefined'; }

  // ── 피드 (테이블 좌상단, 최근 4줄) ──
  function _feed(html, cls) {
    var f = _el('thinking-feed');
    if (!f) return;
    f.style.display = 'block';
    var line = document.createElement('div');
    line.className = 'thinking-line' + (cls ? ' ' + cls : '');
    line.innerHTML = html;
    f.appendChild(line);
    while (f.children.length > 4) f.removeChild(f.firstChild);
    f.scrollTop = f.scrollHeight;
  }

  // 좌석 근처 말풍선 (3초 페이드) — 좌석 innerHTML 재렌더와 무관하게 table-area 위에 띄움
  function _bubble(state, name, text) {
    var p = state.players && state.players[name];
    var seat = p && _el('seat-' + p.pos);
    var area = seat && seat.closest ? seat.closest('.table-area') : null;
    if (!seat || !area || !seat.getBoundingClientRect) return;
    var sr = seat.getBoundingClientRect(), ar = area.getBoundingClientRect();
    var b = document.createElement('div');
    b.className = 'thinking-bubble';
    b.textContent = text.replace(/^💭 [^:]+: /, '💭 ');
    // 좁은 화면(세로 폰)에서는 폭을 줄이고 좌우 끝을 넘지 않게 클램프 — 데스크톱은 220px 그대로
    var bw = Math.min(220, ar.width - 8);
    if (bw < 220) b.style.width = bw + 'px';
    b.style.left = Math.max(4, Math.min(ar.width - bw - 4, sr.left - ar.left + sr.width / 2 - bw / 2)) + 'px';
    b.style.top = Math.max(4, sr.top - ar.top - 46) + 'px';
    area.appendChild(b);
    setTimeout(function() { if (b.parentNode) b.parentNode.removeChild(b); }, 3200);
  }

  // ── 훅 ──
  function onNewHand(state) {
    _log = []; _pro = null; _choice = {};
    _hidePanel();
    var gc = _el('gto-commentary');
    if (gc && gc.style) gc.style.flexWrap = '';
    var f = _el('thinking-feed');
    if (f) {
      f.innerHTML = '';
      f.style.display = isOn() ? 'block' : 'none';
      if (isOn()) _feed('🎙 핸드 #' + _esc(state && state.handNum || '') + ' 띵킹 중계 시작' +
        (_cfg.reveal === 'end' ? ' (상대 속마음은 핸드 끝나고 공개)' : ''), 'thinking-sys');
    }
  }

  function onVillainAction(state, name, action, amount) {
    if (!isOn() || !state) return;
    var t;
    try { t = Thinking.villainThought(state, name, action, amount); } catch (e) { return; }
    _log.push({ type: 'villain', street: t.street, name: name, action: action, text: t.text, intent: t.intent });
    if (_cfg.reveal === 'live') {
      _feed(_esc(t.text), 'thinking-villain');
      _bubble(state, name, t.text);
    }
  }

  function onHeroTurn(state, heroPos, eq, ev) {
    if (!isOn() || !state) return;
    var toCall = Math.max(0, (state.currentBet || 0) - ((state.playerBets && state.playerBets.Hero) || 0));
    try { _pro = Thinking.proThought(state, heroPos, eq, toCall, state.pot); } catch (e) { _pro = null; return; }
    _choice = {};
    _renderPanel();
  }

  function onHeroAction(state, action) {
    if (!isOn() || !_pro) return;
    var entry = { type: 'hero', street: _pro.street || (state && state.street), action: action, pro: _pro, choice: null, grade: null };
    var picked = Object.keys(_choice).length > 0;
    if (picked) {
      var g = Thinking.gradeHeroThought(_choice, _pro);
      _stats.matched += g.matched; _stats.total += g.total;
      entry.choice = _choice; entry.grade = g;
      var marks = g.steps.map(function(s) { return (s.match ? '✅' : '❌') + s.title.slice(0, 1); }).join(' ');
      _feed('🧠 나의 속마음 vs 프로: ' + marks + '<br><span class="thinking-sub">' + _esc(g.feedback) + '</span>', 'thinking-hero');
    }
    _log.push(entry);
    _pro = null; _choice = {};
    _hidePanel();
  }

  function onHandEnd(state, result) {
    if (!isOn()) return;
    _hidePanel();
    var panel = _el('gto-commentary');
    if (panel) { panel.style.flexWrap = 'wrap'; renderReplay(panel); panel.style.display = 'flex'; }
  }

  // ── 히어로 3단계 칩 패널 ──
  function _renderPanel() {
    var p = _el('thinking-panel');
    if (!p) return;
    var o = Thinking.heroThoughtOptions();
    var html = '<div class="thinking-panel-title">🧠 내 속마음 정리 (선택사항, 건너뛰어도 액션 가능)</div>';
    o.steps.forEach(function(step) {
      html += '<div class="thinking-row"><span class="thinking-step">' + o.titles[step] + '</span>' +
        o.options[step].map(function(opt) {
          return '<button type="button" class="thinking-chip' + (_choice[step] === opt.key ? ' on' : '') +
            '" data-step="' + step + '" data-key="' + opt.key + '">' + _esc(opt.label) + '</button>';
        }).join('') + '</div>';
    });
    p.innerHTML = html;
    p.style.display = 'block';
    var chips = p.querySelectorAll('.thinking-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].onclick = function() {
        var s = this.getAttribute('data-step'), k = this.getAttribute('data-key');
        if (_choice[s] === k) delete _choice[s]; else _choice[s] = k;
        _renderPanel();
      };
    }
  }
  function _hidePanel() {
    var p = _el('thinking-panel');
    if (p) { p.style.display = 'none'; p.innerHTML = ''; }
  }

  // ── 리플레이 (핸드 종료: 빌런 속마음 전부 공개 + 히어로 선택 + 프로 생각) ──
  function renderReplay(container) {
    if (!container || typeof Thinking === 'undefined') return;
    var rate = _stats.total > 0 ? Math.round(_stats.matched / _stats.total * 100) + '% (' + _stats.matched + '/' + _stats.total + ' 단계)' : '아직 기록 없음';
    var html = '<details class="thinking-replay"><summary>🎙 띵킹 프로세스 리플레이 (눌러서 펼치기)</summary><div class="thinking-replay-body">' +
      '<div class="thinking-rate">세션 띵킹 일치율: ' + rate + '</div>';
    var cur = null;
    if (_log.length === 0) html += '<div class="thinking-r-line">기록된 속마음이 없습니다.</div>';
    _log.forEach(function(e) {
      if (e.street !== cur) {
        cur = e.street;
        html += '<div class="thinking-r-street">' + _esc(Thinking.STREET_KOR[cur] || cur) + '</div>';
      }
      if (e.type === 'villain') {
        html += '<div class="thinking-r-line thinking-villain">' + _esc(e.text) + '</div>';
      } else {
        var mine = e.grade
          ? e.grade.steps.map(function(s) { return (s.match ? '✅ ' : '❌ ') + s.title + ' ' + s.chosen; }).join(', ')
          : '(선택 안 함)';
        var AK = { fold: '폴드', call: '콜', check: '체크', raise: '레이즈', allin: '올인', bet: '벳' };
        html += '<div class="thinking-r-line thinking-hero">🙋 나: ' + _esc(AK[e.action] || e.action) + ' / ' + _esc(mine) + '</div>' +
          '<div class="thinking-r-line thinking-pro">🎓 프로: ' + _esc(e.pro.range) + ' / ' + _esc(e.pro.hand) + ' / ' + _esc(e.pro.plan) + '</div>';
      }
    });
    html += '</div></details>';
    container.insertAdjacentHTML('beforeend', html);
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return {
    init: init, isOn: isOn, onNewHand: onNewHand, onVillainAction: onVillainAction, onHeroTurn: onHeroTurn,
    onHeroAction: onHeroAction, onHandEnd: onHandEnd, renderReplay: renderReplay,
    _getLog: function() { return _log; }, _getStats: function() { return _stats; }
  };
})();
