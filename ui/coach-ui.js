// ui/coach-ui.js — 인게임 코칭 UI (8차 WP3)
// 결정 전: 정답 가림 + 자기점검(L1) / 예측 카드(L2) / 실전(L3)
// 결정 직후: #last-verdict 판정 스트립 + 신호등 토스트, 반복 실수 경고, 레벨 자동 페이드
// M3-P4b: snapshot()/restore(s)(보스 코칭 고정 뒤 복원), 고정 벌점은 bb 대신 '(큰 실수)/(작은 실수)', 림퍼 뒤 체크리스트
// M4-P9: 림퍼 2명 이상 체크리스트(한 칸 좁은 표), 결정 기록 손해 표기 decLoss/lossTally/lossTallyText/lossTallyLight(결과 패널과 리뷰 공용)
// M5-COACH: 벳 직면 설명 줄(explainLines)이 판정 근거(다음 1장, 축소 레인지)와 HUD 승률 차이를 밝힌다. 체크리스트 ②는 다음 1장 기준.
// 로드 시 DOM 접근 금지 — 초기화는 window load 이벤트에서만
var CoachUI = (function() {
  var KEY = 'poker_coach';
  var KOR = { fold: '폴드', check: '체크', call: '콜', raise: '레이즈', allin: '올인' };
  var ICON = { green: '🟢', yellow: '🟡', red: '🔴' };
  var BEHIND = { UTG: 5, HJ: 4, CO: 3, BTN: 2, SB: 1, BB: 0 };
  var EQ_LABELS = ['0~25%', '25~50%', '50~75%', '75~100%'];
  var DAY_MS = 24 * 3600 * 1000;

  var _st = null;          // 저장 상태 {v, level, auto, recent, patterns}
  var _ctx = null;         // 마지막 beforeDecision ctx
  var _view = null;        // 마지막 view
  var _handCtx = {};       // 마지막 onNewHand ctx
  var _awaiting = false;   // 히어로 결정 대기 중
  var _hintUsed = false;
  var _firstDecision = true;
  var _goal = '';
  var _pred = { po: null, eq: null };   // 예측 응답(선택값)
  var _predOpts = { po: null, eq: null }; // 예측 보기
  var _predAns = { po: null, eq: null };  // 정답 (po: 정수 %, eq: 0~1)
  var _keyBound = false;
  var _toastTimer = null;

  // ── 저장 ──
  function _defaults() { return { v: 1, level: 1, auto: true, recent: [], patterns: {} }; }
  function _load() {
    if (_st) return _st;
    var s = null;
    try {
      var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(KEY) : null;
      if (raw) s = JSON.parse(raw);
    } catch (e) { s = null; }
    var d = _defaults();
    if (!s || typeof s !== 'object') s = d;
    if (typeof s.level !== 'number' || s.level < 0 || s.level > 3) s.level = d.level;
    if (typeof s.auto !== 'boolean') s.auto = d.auto;
    if (!Array.isArray(s.recent)) s.recent = [];
    if (!s.patterns || typeof s.patterns !== 'object') s.patterns = {};
    s.v = 1;
    _st = s;
    return s;
  }
  var _unsaved = false;   // 마지막 저장이 실패함(저장소 없음, 용량 초과): 메모리 상태만 최신이라 _reload로 버리지 않는다(M7 DATA-01)
  function _save() {
    _unsaved = true;
    try { if (typeof localStorage !== 'undefined') { localStorage.setItem(KEY, JSON.stringify(_st)); _unsaved = false; } } catch (e) {}
  }

  // ── 순수 함수 ──
  function viewFor(level, ctx) {
    ctx = ctx || {};
    var lv = (typeof level === 'number') ? level : parseInt(level, 10);
    if (isNaN(lv)) lv = 1;
    if (ctx.gtoMode) {
      var forced = { 1: 1, 2: 0, 3: 3 }[ctx.gtoRound];
      if (forced != null) lv = forced;
    }
    lv = Math.max(0, Math.min(3, lv));
    return { level: lv, hide: lv >= 1, hideEquity: lv >= 2, hidePotOdds: lv >= 2, quiet: lv >= 3 };
  }

  function nextLevel(level, recent) {
    recent = recent || [];
    var i, n;
    if (recent.length >= 15 && level < 3) {
      var last15 = recent.slice(-15);
      for (n = 0, i = 0; i < last15.length; i++) if (last15[i] === 'g') n++;
      if (n / 15 >= 0.8) return { level: level + 1, changed: true, dir: 'up' };
    }
    if (level > 0) {
      var last10 = recent.slice(-10);
      for (n = 0, i = 0; i < last10.length; i++) if (last10[i] === 'r') n++;
      if (n >= 4) return { level: level - 1, changed: true, dir: 'down' };
    }
    return { level: level, changed: false, dir: null };
  }

  function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function potOddsChoices(potOdds, seed) {
    var ans = _clamp(Math.round((potOdds || 0) * 100 / 5) * 5, 5, 60);
    var out = [ans];
    [ans - 10, ans + 10, ans + 20].forEach(function(c0) {
      var c = _clamp(c0, 5, 60);
      for (var k = 0; k < 30; k++) {
        var d = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 5;
        var cc = c + d;
        if (cc >= 5 && cc <= 60 && out.indexOf(cc) === -1) { out.push(cc); return; }
      }
    });
    // LCG 셔플 (같은 seed → 같은 순서)
    var s = (Math.abs(seed | 0) % 2147483647) || 1;
    function rnd() { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function eqBucket(eq) {
    return _clamp(Math.floor((eq || 0) * 4), 0, 3);
  }

  function _toCall(state) {
    if (!state) return 0;
    var hb = (state.playerBets && state.playerBets.Hero) || 0;
    return Math.max(0, (state.currentBet || 0) - hb);
  }

  function checklist(state, heroPos) {
    state = state || {};
    var pos = heroPos || (state.players && state.players.Hero && state.players.Hero.pos) || 'BTN';
    var toCall = _toCall(state);
    var bb = state.bigBlind || 1;
    if (state.street === 'preflop') {
      var opened = (state.currentBet || 0) > bb + 1e-9;
      var limpers = 0;
      if (!opened && typeof Gto !== 'undefined' && Gto.limperCount) {
        try { limpers = Gto.limperCount(state) || 0; } catch (e) { limpers = 0; }
      }
      if (!opened && limpers > 0) {
        if (toCall <= 0) {
          return [
            '① 림퍼만 있으면 BB는 공짜로 체크할 수 있어요',
            '② 아주 강한 패면 레이즈로 아이솔(오픈 사이즈 + 림퍼당 1bb)',
            '③ 폴드할 이유는 없어요 (콜할 돈이 0)'
          ];
        }
        // 아이솔 기준 표(M4-P9): 림퍼 1명 = 내 자리 RFI 표, 2명 이상 = 한 칸 좁은 자리 표(Gto.isoPos)
        var isoAt = pos;
        if (typeof Gto !== 'undefined' && Gto.isoPos) {
          try { isoAt = Gto.isoPos(pos, limpers) || pos; } catch (e) { isoAt = pos; }
        }
        return [
          '① 앞에 림퍼 ' + limpers + '명: 레이즈(아이솔) 아니면 폴드',
          isoAt !== pos
            ? '② 림퍼가 2명 이상이면 여럿이 따라오기 쉬워 한 칸 좁게: 이 패가 ' + isoAt + ' 오픈 레인지 안인가?'
            : '② 이 패가 내 자리(' + pos + ') 오픈 레인지 안인가?',
          '③ 아이솔 사이즈 = 오픈 사이즈 + 림퍼당 1bb, 콜로 따라 들어가지 않기'
        ];
      }
      if (!opened) {
        if (toCall <= 0) {
          return [
            '① 아무도 레이즈 안 했으면 BB는 공짜로 체크',
            '② 이 패는 상위 몇 %일까? 아주 강하면 레이즈도 좋아요',
            '③ 폴드할 이유는 없어요 (콜할 돈이 0)'
          ];
        }
        var n = BEHIND[pos] != null ? BEHIND[pos] : 1;
        return [
          '① 내 자리(' + pos + ') 뒤에 ' + n + '명이 남아 있어요. 뒤에 사람이 많을수록 강한 패만 오픈',
          '② 이 패는 상위 몇 %일까?',
          '③ 레이즈 아니면 폴드, 콜로만 들어가지 않기'
        ];
      }
      return [
        '① 오픈한 사람의 자리는? 앞자리 오픈일수록 강해요',
        '② 3벳할 만큼, 콜할 만큼 강한가?',
        '③ 블라인드라면 이미 낸 칩이 있어 조금 넓게 방어'
      ];
    }
    if (toCall > 0) {
      // 리버는 더 올 카드가 없어 '다음 1장'과 아웃츠 셈이 없다(코치도 상대 벳 레인지 기준으로 판정)
      var river = state.street === 'river' || (state.board && state.board.length >= 5);
      return [
        '① 필요 승률 = 콜 ÷ (팟+콜) = ?',
        river ? '② 상대가 벳할 만한 패와 비교한 내 승률이 그보다 높은가? (리버는 더 올 카드 없음)'
          : '② 다음 1장 기준 내 승률이 그보다 높은가? (아웃츠×2, ×4는 올인일 때만)',
        '③ 상대의 큰 벳은 대개 강한 패 신호'
      ];
    }
    return [
      '① 내가 프리플랍에 레이즈한 쪽인가? (그렇다면 c-벳 고려)',
      '② 내 패가 보드에서 탑페어 이상인가?',
      '③ 드로우가 많은 보드면 크게, 마른 보드면 작게'
    ];
  }

  // M5-COACH: 벳 직면 판정 근거(V.basis)가 다음 1장('next')이나 축소 레인지('river')면 그 이름으로 승률을 말하고,
  //   HUD 승률(V.eq, 리버까지 MC)과 숫자가 다를 때 왜 다른지 한 줄, 상대 레인지를 지웠으면 몇 콤보에서 몇 콤보로 줄었는지 한 줄.
  //   왜 다른지: 플랍은 HUD가 2장(턴, 리버)을 다 본 값, 턴과 리버는 HUD도 같은 카드까지라 레인지를 줄이기 전 값(리뷰 수정).
  //   'allin'(플랍 올인 콜)은 HUD 승률 그대로 판정하고 왜 끝까지 보는지 한 줄.
  function explainLines(V) {
    if (!V) return [];
    if (V.toCall > 0 && V.source !== 'chart') {
      var po = Math.round((V.potOdds || 0) * 100);
      var based = V.basis === 'next' || V.basis === 'river', allin = V.basis === 'allin';
      var eqU = ((based || allin) && typeof V.eqUsed === 'number') ? V.eqUsed : V.eq;
      var eq = Math.round((eqU || 0) * 100);
      var name = allin ? '리버까지 본 승률' : !based ? '내 승률' : V.basis === 'next' ? '다음 1장 기준 승률' : '상대 벳 레인지 기준 승률';
      var lines = [
        '필요 승률 ' + po + '% = 10번 중 ' + (po / 10).toFixed(1) + '번 이겨야 본전',
        name + ' ' + eq + '% = 10번 중 ' + (eq / 10).toFixed(1) + '번' + ((based || allin) ? '(참고)' : '')
      ];
      if (allin) lines.push('올인이라 더 벳이 없어 남은 카드 2장을 다 봐요(아웃츠×4)');
      if (based) {
        var hud = Math.round((V.eq || 0) * 100);
        if (hud !== eq) {
          var cut = !!(V.range && V.range.removed > 0);
          lines.push(V.basis === 'next' && V.street !== 'turn'
            ? 'HUD 승률 ' + hud + '%는 리버까지 본 값이에요'
            : cut ? 'HUD 승률 ' + hud + '%는 상대 레인지를 줄이기 전 값이에요'
            : 'HUD 승률 ' + hud + '%는 어림 계산이라 조금 달라요');
        }
        if (V.range && V.range.removed > 0) {
          lines.push('상대가 벳했으니 안 맞은 패 중 약한 절반은 뺐어요(' + V.range.before + ' → ' + V.range.after + '콤보)');
        }
      }
      return lines;
    }
    return V.why ? [String(V.why)] : [];
  }

  function _actionKor(action, V) {
    if (action === 'raise' && V && V.toCall === 0 && V.street && V.street !== 'preflop') return '벳';
    return KOR[action] || '';
  }

  // 손해 표기: EV로 계산한 delta는 bb 숫자, 고정 벌점(G.estimated, 차트와 가이드 판정 등)은 숫자 대신 크기 라벨만
  // (설계서 8.2절 6번: 고정 벌점은 실제 bb 손실이 아니므로 '(큰 실수)/(작은 실수)')
  function lossLabel(G) {
    G = G || {};
    var delta = (typeof G.delta === 'number' && !isNaN(G.delta)) ? G.delta : 0;
    if (!(delta < 0)) return '';
    if (G.estimated) return G.light === 'red' ? '(큰 실수)' : '(작은 실수)';
    return '(' + delta.toFixed(1) + 'bb)';
  }

  // ── 결정 기록의 손해 표기(M4-P9, 순수): 게임 결과 패널(app.js 손 총평, 세션 요약)과 핸드 리뷰(history.js)가 함께 쓴다 ──
  // 결정 기록 d = { actualEV, bestEV, light, estimated }(app.js heroAction이 남긴다). Δ = actualEV - bestEV.
  // 고정 벌점(d.estimated)은 lossLabel과 같은 '(큰 실수)/(작은 실수)', bb 숫자는 EV 계산값에만. estimated가 없는 옛 기록은 EV 값으로 본다.
  function _decDelta(d) { return ((d && d.actualEV) || 0) - ((d && d.bestEV) || 0); }
  // { delta, est(고정 벌점 여부), label('(큰 실수)'|'(작은 실수)'|'', 고정 벌점이 아니면 늘 '') }
  function decLoss(d) {
    var delta = _decDelta(d), est = !!(d && d.estimated);
    return { delta: delta, est: est, label: est ? lossLabel({ light: d.light, delta: delta, estimated: true }) : '' };
  }
  // 결정 묶음 집계: ev = 고정 벌점이 아닌 결정의 Δ 합(bb), big/small = 손해가 난 고정 벌점 결정 수(빨강 = 큰 실수), n = 결정 수
  function lossTally(decisions) {
    var t = { ev: 0, big: 0, small: 0, n: 0 };
    (decisions || []).forEach(function(d) {
      var L = decLoss(d);
      t.n++;
      if (!L.est) t.ev += L.delta;
      else if (L.label === '(큰 실수)') t.big++;
      else if (L.label) t.small++;
    });
    return t;
  }
  // 합계 문구: EV 합은 bb 숫자(digits 자리, prefix는 'Δ' 등 앞 글자), 고정 벌점은 '큰 실수 N, 작은 실수 M'.
  // 고정 벌점이 있고 EV 합이 0이면 bb 숫자를 뺀다. 고정 벌점이 없으면 예전 표기('+0.00bb', '-1.20bb')와 같다.
  function lossTallyText(t, digits, prefix) {
    t = t || { ev: 0, big: 0, small: 0 };
    digits = digits == null ? 2 : digits;
    var ev = t.ev || 0, parts = [];
    if (!(t.big || t.small) || Math.abs(ev) >= 0.5 * Math.pow(10, -digits)) {
      parts.push((prefix || '') + (ev >= 0 ? '+' : '') + ev.toFixed(digits) + 'bb');
    }
    if (t.big) parts.push('큰 실수 ' + t.big);
    if (t.small) parts.push('작은 실수 ' + t.small);
    return parts.join(', ');
  }
  // 합계 신호등: 큰 실수가 있거나 EV 합 < -1.5 → red, 작은 실수가 있거나 EV 합 < -0.3 → yellow, 그 외 green(예전 임계 그대로)
  function lossTallyLight(t) {
    t = t || {};
    var ev = t.ev || 0;
    if (t.big || ev < -1.5) return 'red';
    if (t.small || ev < -0.3) return 'yellow';
    return 'green';
  }

  function verdictText(G, V, action) {
    G = G || {}; V = V || {};
    var light = ICON[G.light] ? G.light : 'yellow';
    var loss = lossLabel(G);
    var line1 = ICON[light] + ' ' + (G.title || '') + ' | 당신: ' + _actionKor(action, V) +
      ' / 추천: ' + (V.label || '') + (loss ? ' ' + loss : '');
    return { cls: 'lv-' + light, line1: line1, line2: G.why ? String(G.why) : '' };
  }

  // ── DOM 헬퍼 ──
  function _el(id) {
    return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById(id) : null;
  }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function _hideEl(id) {
    var el = _el(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  }
  function _curLevel() {
    _load();
    return viewFor(_st.level, _handCtx).level;
  }
  function _updateToggleLabel() {
    var btn = _el('equity-toggle');
    if (btn) btn.textContent = '📊 코칭 L' + _curLevel();
  }
  function _syncSelect() {
    var sel = _el('coach-level-select');
    if (sel) sel.value = _st.auto ? 'auto' : String(_st.level);
  }

  function _toast(msg, ms) {
    if (typeof document === 'undefined' || !document.body) return;
    var old = _el('coach-toast');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var t = document.createElement('div');
    t.id = 'coach-toast';
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:22%;left:50%;transform:translateX(-50%);background:rgba(20,20,30,0.95);' +
      'color:#e6edf3;border:1px solid #8b949e;border-radius:8px;padding:8px 18px;z-index:510;font-size:0.95rem;' +
      'pointer-events:none;white-space:pre-line;text-align:center;max-width:80vw';
    document.body.appendChild(t);
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 2000);
  }

  // ── 초기화 ──
  function _init() {
    _load();
    _syncSelect();
    _updateToggleLabel();
    if (!_keyBound && typeof document !== 'undefined' && document.addEventListener) {
      _keyBound = true;
      document.addEventListener('keydown', function(e) {
        var tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        var scr = _el('screen-game');
        if (!scr || !scr.classList.contains('active')) return;
        if (handleKey(e.key)) e.preventDefault();
      });
    }
  }

  // ── 훅 ──
  function onNewHand(ctx) {
    _load();
    _handCtx = ctx || {};
    _ctx = null; _view = null;
    _awaiting = false;
    _hintUsed = false;
    _firstDecision = true;
    _hideEl('last-verdict');
    _hideEl('coach-pre');
    _hideEl('coach-reminder');
    _updateToggleLabel();
  }

  function _pickReminder(ctx) {
    if (typeof Coach === 'undefined' || !Coach.PATTERNS) return null;
    var now = Date.now();
    var best = null, bestN = 0;
    Object.keys(_st.patterns).forEach(function(tag) {
      var p = _st.patterns[tag], P = Coach.PATTERNS[tag];
      if (!p || !P) return;
      var inSession = p.sid != null && p.sid === ctx.sessionId && (p.sessionCount || 0) >= 2;
      var lastTs = (p.last && p.last.length) ? Date.parse(p.last[p.last.length - 1]) : NaN;
      var recent = (p.total || 0) >= 3 && !isNaN(lastTs) && (now - lastTs) <= 7 * DAY_MS;
      if (!inSession && !recent) return;
      var hit = false;
      try { hit = !!(P.spotTest && P.spotTest(ctx.state)); } catch (e) { hit = false; }
      if (!hit) return;
      var n = inSession ? p.sessionCount : p.total;
      if (n > bestN) { bestN = n; best = { tag: tag, n: n, P: P }; }
    });
    return best;
  }

  function _renderReminder(ctx) {
    var el = _el('coach-reminder');
    if (!el) return;
    var lines = [];
    if (_firstDecision) {
      var g = currentGoal();
      if (g) lines.push('🎯 이번 핸드 목표: ' + g);
    }
    var r = _pickReminder(ctx);
    if (r) lines.push('🧠 주의: 최근 「' + r.P.label + '」 ' + r.n + '회 | ' + r.P.rule);
    if (!lines.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.innerHTML = lines.map(function(l) { return '<div>' + _esc(l) + '</div>'; }).join('');
    el.style.display = '';
  }

  function _hintBtnHTML() {
    if (_hintUsed) return '<div class="cp-hint-used">💡 정답을 펼쳤어요 (이번 결정은 보조 사용으로 기록)</div>';
    return '<button class="cp-hint" onclick="CoachUI.showHint()">💡 정답 보기 <span class="kb-hint">(H)</span></button>';
  }

  function _renderPre() {
    var el = _el('coach-pre');
    if (!el) return;
    var ctx = _ctx || {}, view = _view || viewFor(1, {});
    if (!_awaiting || view.level === 0) { el.style.display = 'none'; el.innerHTML = ''; return; }
    var html = '';
    if (view.level === 1) {
      html += '<div class="cp-title">🤔 먼저 스스로 판단해 보세요</div><ol class="cp-check">' +
        checklist(ctx.state, ctx.heroPos).map(function(l) { return '<li>' + _esc(l) + '</li>'; }).join('') + '</ol>';
    } else if (view.level === 2) {
      html += '<div class="cp-title">🔮 먼저 예측해 보세요 (선택<span class="kb-hint">, 숫자키 1~4</span>)</div>';
      var qn = 1;
      if (_predOpts.po) {
        html += '<div class="cp-q"><div class="cp-qt">Q' + (qn++) + '. 콜에 필요한 최소 승률(팟 오즈)은?</div><div class="cp-grid">' +
          _predOpts.po.map(function(v, i) {
            return '<button class="cp-opt' + (_pred.po === v ? ' sel' : '') + '" onclick="CoachUI._pick(\'po\',' + i + ')">' + (i + 1) + ') ' + v + '%</button>';
          }).join('') + '</div></div>';
      }
      html += '<div class="cp-q"><div class="cp-qt">Q' + qn + '. 내 승률은?</div><div class="cp-grid">' +
        EQ_LABELS.map(function(lab, i) {
          return '<button class="cp-opt' + (_pred.eq === i ? ' sel' : '') + '" onclick="CoachUI._pick(\'eq\',' + i + ')">' + (i + 1) + ') ' + lab + '</button>';
        }).join('') + '</div></div>';
    } else {
      html += '<div class="cp-title">🎲 실전 모드: 보조 없이 결정해요</div>';
    }
    html += _hintBtnHTML();
    el.innerHTML = html;
    el.style.display = '';
  }

  function beforeDecision(ctx) {
    _load();
    ctx = ctx || {};
    _ctx = ctx;
    _hintUsed = false;
    _awaiting = true;
    var view = viewFor(_st.level, ctx);
    _view = view;
    // 예측 카드 준비 (L2)
    _pred = { po: null, eq: null };
    _predOpts = { po: null, eq: null };
    _predAns = { po: null, eq: null };
    var st = ctx.state || {};
    var toCall = _toCall(st);
    if (toCall > 0) {
      // Coach.verdict는 팟 오즈 판정(source=potodds)일 때만 potOdds를 채우고 차트/가이드 판정은 0 → 직접 계산
      var po = (ctx.verdict && ctx.verdict.potOdds > 0) ? ctx.verdict.potOdds
        : toCall / ((st.pot || 0) + toCall);
      _predAns.po = Math.round(po * 100);
      var seed = (st.seed || 1) + ((st.decisions || []).length + 1) * 7919;
      _predOpts.po = potOddsChoices(po, seed);
    }
    _predAns.eq = (typeof ctx.eq === 'number') ? ctx.eq : null;
    _predOpts.eq = [0, 1, 2, 3];
    _renderReminder(ctx);
    _renderPre();
    _firstDecision = false;
    return view;
  }

  function _pick(q, idx) {
    if (!_awaiting || !_predOpts[q]) return;
    _pred[q] = _predOpts[q][idx];
    if (_pred[q] == null) return;
    _renderPre();
  }

  function showHint() {
    if (!_ctx || !_awaiting) return;
    _hintUsed = true;
    var c = _ctx;
    var open = { level: 0, hide: false, hideEquity: false, hidePotOdds: false };
    if (typeof HUD !== 'undefined' && HUD.update && c.ev) HUD.update(c.eq, c.ev, c.state, c.gtoMode ? c.gtoRound : 0, open);
    if (typeof ActionBar !== 'undefined' && ActionBar.render) ActionBar.render(c.state, c.ev, { hide: false });
    if (c.gtoMode && c.state && c.state.street === 'preflop' && typeof GtoChart !== 'undefined' && GtoChart.update) {
      GtoChart.update(c.state, c.heroPos, true);
    }
    var toCall = _toCall(c.state);
    var pctEl = _el('pot-odds-pct'), ring = _el('pot-odds-ring');
    if (toCall > 0 && pctEl) {
      var pct = toCall / (((c.state && c.state.pot) || 0) + toCall) * 100;
      pctEl.textContent = pct.toFixed(0) + '%';
      if (ring && ring.style && ring.style.setProperty) {
        ring.style.setProperty('--ring-pct', pct.toFixed(0) + '%');
        ring.style.setProperty('--ring-color', pct < 25 ? '#52b75e' : pct < 40 ? '#e3b341' : '#f85149');
        ring.title = '팟 오즈 ' + pct.toFixed(0) + '% = 콜에 필요한 최소 승률';
      }
    }
    _renderPre();
  }

  function _predLines() {
    var out = [];
    if (_pred.po != null && _predAns.po != null) {
      var okPo = Math.abs(_pred.po - _predAns.po) <= 5;
      out.push('팟 오즈: 예측 ' + _pred.po + '% → 정답 ' + _predAns.po + '% ' + (okPo ? '✅' : '❌') + '(±5%p 이내)');
    }
    if (_pred.eq != null && _predAns.eq != null) {
      var okEq = eqBucket(_predAns.eq) === _pred.eq;
      out.push('내 승률: 예측 ' + EQ_LABELS[_pred.eq] + ' → 정답 ' + Math.round(_predAns.eq * 100) + '% ' + (okEq ? '✅' : '❌'));
    }
    return out;
  }

  function afterDecision(ctx) {
    _load();
    ctx = ctx || {};
    _awaiting = false;
    _hideEl('coach-pre');
    if (ctx.dec && typeof ctx.dec === 'object') ctx.dec.hintUsed = _hintUsed;
    var G = ctx.grade, V = ctx.verdict;
    if (!G || !V) return;
    var view = ctx.view || _view || viewFor(_st.level, ctx);
    var vt = verdictText(G, V, ctx.action);
    var el = _el('last-verdict');
    if (el) {
      var html;
      if (view.quiet && G.light === 'green') {
        html = '<div class="lv-line1">🟢</div>';
      } else {
        html = '<div class="lv-line1">' + _esc(vt.line1) + '</div>';
        if (vt.line2) html += '<div class="lv-line2">' + _esc(vt.line2) + '</div>';
        if (view.level >= 1) {
          explainLines(V).forEach(function(l) {
            if (vt.line2.indexOf(l) === -1) html += '<div class="lv-extra">' + _esc(l) + '</div>';
          });
        }
        _predLines().forEach(function(l) { html += '<div class="lv-pred">' + _esc(l) + '</div>'; });
      }
      el.className = 'last-verdict ' + vt.cls;
      el.innerHTML = html;
      el.style.display = '';
    }
    // 토스트 메시지 모음 (단일 요소에 여러 줄)
    var msgs = [], ms = 0;
    var icon = ICON[G.light] || '🟡';
    if (G.light === 'yellow') { msgs.push(icon + ' ' + (G.title || '')); ms = 2600; }
    else if (G.light === 'red') { msgs.push(icon + ' ' + (G.title || '')); ms = 3500; }
    else if (view.level <= 1) { msgs.push(icon + ' ' + (G.title || '')); ms = 1400; }
    // 반복 실수 집계
    var counted = !ctx.practice && !(ctx.gtoMode && ctx.gtoRound === 2);
    if (counted && G.pattern) {
      var p = _st.patterns[G.pattern] || { total: 0, last: [], sid: null, sessionCount: 0 };
      p.total = (p.total || 0) + 1;
      p.last = (p.last || []).concat([new Date().toISOString()]).slice(-5);
      if (p.sid !== ctx.sessionId) { p.sid = ctx.sessionId; p.sessionCount = 1; }
      else p.sessionCount = (p.sessionCount || 0) + 1;
      _st.patterns[G.pattern] = p;
      if (p.sessionCount === 2) {
        var P = (typeof Coach !== 'undefined' && Coach.PATTERNS) ? Coach.PATTERNS[G.pattern] : null;
        if (P) { msgs.push('⚠ 같은 실수 2번째: ' + P.label + ' | 규칙: ' + P.rule); ms = Math.max(ms, 3500); }
      }
    }
    // 레벨 자동 조정
    if (_st.auto && !ctx.practice && !ctx.gtoMode) {
      _st.recent = (_st.recent || []).concat([_hintUsed ? 'y' : String(G.light || 'y').charAt(0)]).slice(-20);
      var nl = nextLevel(_st.level, _st.recent);
      if (nl.changed) {
        var from = _st.level;
        _st.level = nl.level;
        _st.recent = [];
        msgs.push(nl.dir === 'up'
          ? '🎓 보조바퀴 한 단계 해제! (L' + from + '→L' + nl.level + ')'
          : '🧭 잠깐 보조바퀴를 다시 달게요 (L' + from + '→L' + nl.level + ')');
        ms = Math.max(ms, 3000);
        _updateToggleLabel();
        _syncSelect();
      }
    }
    _save();
    if (msgs.length) _toast(msgs.join('\n'), ms || 2000);
  }

  function onHandEnd(ctx) {
    _load();
    ctx = ctx || {};
    _awaiting = false;
    _hideEl('coach-pre');
    var hc = {}, sc = {};
    (ctx.decisions || []).forEach(function(d) {
      if (d && d.pattern) hc[d.pattern] = (hc[d.pattern] || 0) + 1;
    });
    Object.keys(_st.patterns).forEach(function(tag) {
      var p = _st.patterns[tag];
      if (p && ctx.sessionId != null && p.sid === ctx.sessionId) sc[tag] = p.sessionCount || 0;
    });
    _goal = (typeof Coach !== 'undefined' && Coach.goalFor) ? (Coach.goalFor(hc, sc) || '') : '';
  }

  function currentGoal() { return _goal || ''; }

  function handleKey(key) {
    if (!_awaiting || !_view) return false;
    if (key >= '1' && key <= '4' && key.length === 1 && _view.level === 2) {
      var idx = parseInt(key, 10) - 1;
      if (_predOpts.po && _pred.po == null) { _pick('po', idx); return true; }
      if (_predOpts.eq && _pred.eq == null) { _pick('eq', idx); return true; }
      return false;
    }
    if ((key === 'h' || key === 'H') && _view.hide) {
      showHint();
      return true;
    }
    return false;
  }

  function setLevel(value) {
    _load();
    if (value === 'auto') {
      _st.auto = true;
    } else {
      var n = parseInt(value, 10);
      if (!isNaN(n) && n >= 0 && n <= 3) {
        _st.auto = false;
        _st.level = n;
        _st.recent = [];
      }
    }
    _save();
    _updateToggleLabel();
  }

  // 보스처럼 코칭 레벨을 잠시 고정했다가 되돌릴 때(설계서 2.5절, 7.3절 9번):
  // setLevel(n)은 auto 이력(recent)을 지우고 setLevel('auto')는 level을 되돌리지 못하므로
  // snapshot()으로 {auto, level, recent}를 떠 두고 끝나면 restore(s)로 그대로 돌린다(try/finally 권장).
  function snapshot() {
    _load();
    return { auto: !!_st.auto, level: _st.level, recent: (_st.recent || []).slice() };
  }

  function restore(s) {
    if (!s || typeof s !== 'object') return false;
    var lv = (typeof s.level === 'number') ? s.level : parseInt(s.level, 10);
    if (isNaN(lv) || lv < 0 || lv > 3 || lv !== Math.floor(lv)) return false;
    _load();
    _st.level = lv;
    if (typeof s.auto === 'boolean') _st.auto = s.auto;
    _st.recent = Array.isArray(s.recent)
      ? s.recent.filter(function(x) { return x === 'g' || x === 'y' || x === 'r'; }).slice(-20) : [];
    _save();
    _updateToggleLabel();
    _syncSelect();
    return true;
  }

  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('load', _init);

  // M7 DATA-01: 다른 창이 poker_coach를 저장했을 수 있다(같은 출처 창은 localStorage 공유). 이미 읽어 둔 상태는 저장소에서 다시 읽어
  // 오래된 메모리 상태가 다른 창의 레벨과 반복 실수 기록을 덮어쓰지 않게 한다. _st는 null로 두지 않는다(여러 곳이 바로 참조).
  // 진행 중인 결정/힌트 상태(_awaiting, _hintUsed, _ctx)는 메모리 그대로 둔다.
  function _reload() { if (_st && !_unsaved) { _st = null; _load(); _syncSelect(); } }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', function(e) { if (!e || e.key === null || e.key === undefined || e.key === KEY) _reload(); });
    window.addEventListener('pageshow', function(e) { if (e && e.persisted) _reload(); });
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'visible') _reload(); });
  }

  var api = {
    viewFor: viewFor, nextLevel: nextLevel, potOddsChoices: potOddsChoices, eqBucket: eqBucket,
    checklist: checklist, explainLines: explainLines, verdictText: verdictText, lossLabel: lossLabel,
    decLoss: decLoss, lossTally: lossTally, lossTallyText: lossTallyText, lossTallyLight: lossTallyLight,
    onNewHand: onNewHand, beforeDecision: beforeDecision, afterDecision: afterDecision,
    onHandEnd: onHandEnd, currentGoal: currentGoal, showHint: showHint, setLevel: setLevel,
    snapshot: snapshot, restore: restore,
    handleKey: handleKey, _pick: _pick, _reload: _reload
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
