// theater/theater-ui.js (채우는 패키지: M4-P5)
// 속마음 극장 화면(설계서 5.6절, 3.3절 '한 편' 구성, 5.9절 6~8번, 계약 T2, T6, T7, T8은 theater/theater-core.js 머리 주석).
// screen-game을 재사용한다. 테이블은 Table.render(revealAll, spectator)로 그리고, 액션바와 게임 버튼은 CSS(th-on)로 숨긴 뒤
// 테이블 아래(액션바 자리)에 극장 영역 #th-root(자막 스트립, 패널, 극장 바)를 주입한다.
//   극장 바: ▶ 다음, ⏸(자동 재생 멈춤), 1x/2x, ↩. 패널: 시작 자막(계획 예고 1줄씩, 스크롤), 예측 칩, 결과, 끝 요약.
//   멈춤(event.decisive, 핸드당 4회까지): 그 좌석 강조(th-focus) + 화면 어둡게(th-stop) + 예측 칩 2줄
//     (액션 3개, 계획 4개 + 모르겠다) + 건너뛰기. 2탭(액션, 계획)이면 Theater.predict로 채점하고 공개한다.
//   공개: 말풍선은 활성 좌석 1곳(.th-bubble)만, 하단 자막 스트립은 최근 2줄(말, 속), #thinking-feed에 전 이력.
//   적중은 ✅, '오독!' 배지는 event.misread === true일 때만.
//   자동 재생 간격: 1x 0.6초, 2x 0.3초(스트리트 전환은 2배), A11y.reduced()면 0. 멈춤을 공개한 뒤에는 ▶ 다음을 기다린다.
//   끝: Highlight.pick(ep) 카드가 있으면 보여 주고(다음 편 또는 ↩), 편마다 Journey.recordTheater를 typeof 가드로 부른다.
//   세로 폰이면 MobileUI.openTab('think'). 극장 중 뒤로는 Nav.setBack('screen-game')으로 극장만 닫는다(nav.js 무수정).
//   계약 T8의 Nav.view('theater')는 쓰지 않는다: 기록에 'j/theater'를 쌓으면 그 위치로 되돌아올 때 JourneyUI.view('theater')가
//   준비 중 카드를 그리고, 새로고침은 어차피 홈으로 가므로 얻는 것이 없다. 게임 화면 기록 1칸 + setBack으로 충분하다.
// API(계약 T8)
//   open(): 빠른 줄 🎭. 1편을 보고 여정 홈(JourneyUI.open, 없으면 App.showMenu)으로 돌아간다.
//   start(opts{episodes: 편 수 | [spec 또는 seed], onDone(result|null), core?(T6 모양 주입), hideTypes?}) → bool.
//     열지 못하면(코어 없음, 첫 편 생성 실패) onDone(null)을 부르고 false. result = {episodes, predicted, hit, hitW, cards[]}.
//     hit = 액션을 맞힌 멈춤 수(theater-core predict의 tally와 같음, 계획 적중은 화면 표시만), hitW = 맞힌 멈춤의 w(1 - p(실제 액션)) 합.
//     끝까지 본 편만 센다.
//   showCard({card, onDone}) → bool: 명장면 카드 1장 창(오늘의 명장면 블록용). cardHTML(card) → string(순수). active() → bool.
//   next(), pick('action'|'plan', 값), skip(), togglePause(), toggleSpeed(), exit(): 화면 버튼과 같은 동작(키보드, 테스트).
//   delayMs(speed, reduced), chipsHTML(stop), stripHTML(lines), barHTML(model): 순수 문자열/수치(node 테스트).
// 로드 시 DOM, window 접근 없음(node 테스트 안전). 다른 모듈은 전부 typeof 가드. 테스트는 _setEnv, _setCore로 주입한다.
var TheaterUI = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var SPEED_MS = { 1: 600, 2: 300 };
  var MAX_STOPS = 4;
  var STORE = 'poker_theater_ui';
  // 예측 보기 키(theater-core actionKey: fold, check, call, raise, bet_s, bet_b)와 엔진 액션 이름. Theater.ACTION_KOR가 있으면 그쪽이 우선
  var ACT_KOR = { fold: '폴드', check: '체크', call: '콜', bet: '벳', raise: '레이즈', allin: '올인', '3bet': '3벳', bet_s: '작게 벳', bet_b: '크게 벳' };
  var ACT_HINT = { bet_s: '팟의 60%보다 작게', bet_b: '팟의 60% 이상' };   // theater-core actionKey 기준(추가 금액 vs 액션 전 팟의 60%)
  var ACT_SUB = { bet_s: '팟 60% 미만', bet_b: '팟 60% 이상' };            // 칩 안 작은 글자(같은 기준의 짧은 말)
  var STREET_KOR = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운' };
  // 부록 E 계획 이름(THEATER_PLANS가 없을 때의 표시용)
  var PLAN_KOR = { barrel3: '3배럴 블러프', trap_cr: '체크레이즈 함정', slowplay: '슬로플레이', bet_fold: '벳폴드',
    bluffcatch: '블러프캐치', value_max: '밸류 극대화', semi_push: '세미블러프 압박', pot_control: '팟컨트롤', give_up: '포기' };
  var GRADE_KOR = { strong: '강함', medium: '중간', weak: '약함', air: '아무것도 없음' };
  var SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var RED = { h: true, d: true };
  var CHAR_NOTE = '속마음은 이 캐릭터의 생각이고 정답이 아니에요';   // 설계서 8.2절 5번(캐릭터 읽기, 보라)
  var MISREAD = '<span class="th-misread" title="실제 카드와 다르게 읽었어요">오독!</span>';

  var _env = {};       // 테스트 주입 { mods, setTimeout, clearTimeout, now, reduced, dom, storage }
  var _core = null;    // _setCore 주입(T6 모양)
  var _r = null;       // 진행 중인 극장
  var _card = null;    // showCard 창 { onDone, unbind }
  var _keyBound = false;

  // ── 환경 ───────────────────────────────────────────────
  function _m(name) {
    if (_env.mods && Object.prototype.hasOwnProperty.call(_env.mods, name)) return _env.mods[name];
    var o = G ? G[name] : null;
    return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null;
  }
  function _fn(mod, f) { var o = _m(mod); return !!(o && typeof o[f] === 'function'); }
  function _call(mod, f) {
    var o = _m(mod);
    if (!o || typeof o[f] !== 'function') return undefined;
    try { return o[f].apply(o, Array.prototype.slice.call(arguments, 2)); }
    catch (e) { _warn(mod + '.' + f, e); return undefined; }
  }
  function _warn(where, e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('[TheaterUI] ' + where + ' 실패:', e && e.message ? e.message : e);
  }
  function _now() { return typeof _env.now === 'function' ? _env.now() : Date.now(); }
  function _later(fn, ms) {
    if (typeof _env.setTimeout === 'function') return _env.setTimeout(fn, ms);
    return (typeof setTimeout === 'function') ? setTimeout(fn, ms) : null;
  }
  function _cancel(id) {
    if (id == null) return;
    if (typeof _env.clearTimeout === 'function') { _env.clearTimeout(id); return; }
    if (typeof clearTimeout === 'function') clearTimeout(id);
  }
  function _reduced() {
    if (typeof _env.reduced === 'boolean') return _env.reduced;
    return !!_call('A11y', 'reduced');
  }
  function _doc() { return (typeof document !== 'undefined' && document) ? document : null; }
  // 실제 게임 화면이 있는 페이지인지(node 러너의 문서 스텁은 querySelector가 null이라 false)
  function _hasDom() {
    if (_env.dom === false) return false;
    var d = _doc();
    if (!d || typeof d.querySelector !== 'function' || typeof d.createElement !== 'function') return false;
    try { return !!d.querySelector('#screen-game .table-area'); } catch (e) { return false; }
  }
  function _el(id) { var d = _doc(); return d && typeof d.getElementById === 'function' ? d.getElementById(id) : null; }
  function _store() {
    if ('storage' in _env) return _env.storage;
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; }
  }
  function _loadSpeed() {
    var ls = _store();
    if (!ls) return 1;
    try { var v = JSON.parse(ls.getItem(STORE) || 'null'); return (v && v.speed === 2) ? 2 : 1; } catch (e) { return 1; }
  }
  function _saveSpeed(sp) {
    var ls = _store();
    if (!ls) return;
    try { ls.setItem(STORE, JSON.stringify({ speed: sp === 2 ? 2 : 1 })); } catch (e) { /* 저장 불가: 이번 화면에서만 */ }
  }

  // ── 순수 헬퍼 ──────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function _bb(v) { var n = _num(v, 0); return (Math.round(n * 10) / 10).toFixed(1) + 'bb'; }
  function _copy(o) { var r = {}; if (o && typeof o === 'object') for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }

  // 자동 재생 간격(ms). 설계서 3.3절과 수용 기준: 2x = 0.3초, 1x = 0.6초, 모션 줄이기면 0
  function delayMs(speed, reduced) { return reduced ? 0 : (speed === 2 ? SPEED_MS[2] : SPEED_MS[1]); }

  function planKor(key) {
    if (!key) return '';
    var P = _m('THEATER_PLANS');
    if (P && typeof P.length === 'number') {
      for (var i = 0; i < P.length; i++) {
        var p = P[i];
        if (p && p.key === key) return String(p.predictLabel || p.kor || PLAN_KOR[key] || key);
      }
    }
    return PLAN_KOR[key] || String(key);
  }
  function _actKey(a) { return (a && typeof a === 'object') ? String(a.action || a.key || '') : String(a == null ? '' : a); }
  // 예측 보기 키의 한국어 이름과 도움말(코어 표가 있으면 그것, 없으면 이 파일의 표). 영문 키를 화면에 내지 않는다
  function _actKor(k) {
    var T = _m('Theater'), t = T && T.ACTION_KOR && typeof T.ACTION_KOR === 'object' ? T.ACTION_KOR[k] : null;
    return t ? String(t) : (ACT_KOR[k] || String(k == null ? '' : k));
  }
  function _actHint(k) {
    var T = _m('Theater'), t = T && T.ACTION_HINT && typeof T.ACTION_HINT === 'object' ? T.ACTION_HINT[k] : null;
    return t ? String(t) : (ACT_HINT[k] || '');
  }
  function _actName(a) {
    if (a && typeof a === 'object' && a.label) return String(a.label);
    return _actKor(_actKey(a));
  }
  // 채점 결과에 쓰는 실제 액션: 예측 보기와 같은 말(ev.actionKey)이 엔진 액션 이름과 다르면 둘 다 보인다
  // 예: '크게 벳 (벳 5.0bb)', '레이즈 (올인 100.0bb)'. actionKey가 없으면 공개 라벨 그대로
  function actualLabel(ev) {
    var base = actionLabel(ev);
    var k = ev && ev.actionKey ? String(ev.actionKey) : '';
    if (!k) return base;
    var kl = _actKor(k), plain = ev.label ? String(ev.label) : (ACT_KOR[ev.action] || String(ev.action || ''));
    return (kl && kl !== k && kl !== plain) ? kl + ' (' + base + ')' : base;
  }
  // 공개 라벨: event.label이 있으면 그대로, 없으면 액션 이름 + 금액(폴드, 체크는 금액 없음)
  function actionLabel(ev) {
    if (!ev) return '';
    var base = ev.label ? String(ev.label) : (ACT_KOR[ev.action] || String(ev.action || ''));
    var amt = _num(ev.amount, 0);
    if (ev.action === 'fold' || ev.action === 'check' || amt <= 0 || /\d\s*bb/.test(base)) return base;   // Table.updateVillainActions와 같은 표기
    return base + ' ' + _bb(amt);
  }
  function _cardObj(c) {
    if (!c) return null;
    if (typeof c === 'string') return c.length >= 2 ? { rank: c.charAt(0), suit: c.charAt(1).toLowerCase() } : null;
    return (c.rank && c.suit) ? c : null;
  }
  function _cardText(c) { c = _cardObj(c); return c ? (c.rank === 'T' ? '10' : c.rank) + (SUIT[c.suit] || c.suit) : ''; }
  function _miniCards(list) {
    return (list || []).map(_cardObj).filter(Boolean).map(function(c) {
      return '<span class="card th-mini ' + (RED[c.suit] ? 'red' : 'black') + '" data-suit="' + _esc(c.suit) + '">' + _esc(_cardText(c)) + '</span>';
    }).join('');
  }
  function _thoughtText(ev) {
    var t = ev && ev.thought && ev.thought.text ? String(ev.thought.text) : '';
    return t.replace(/^\s*💭\s*[^:：]{1,24}[:：]\s*/, '').trim();   // '💭 이름: ' 접두 제거(T5)
  }
  function _kind(ev) {
    if (!ev) return null;
    if (ev.kind) return ev.kind;
    return ev.action ? 'action' : 'street';
  }

  // 멈춤 선택지: 액션 3개(없으면 콜 금액으로 기본값), 계획 4개(없으면 계획 줄 없음)
  function _options(ev) {
    var o = (ev && ev.options) || {};
    var acts = (o.actions || []).map(_actKey).filter(function(k) { return !!k; });
    var seen = {};
    acts = acts.filter(function(k) { if (seen[k]) return false; seen[k] = true; return true; }).slice(0, 3);
    if (!acts.length) {
      var toCall = _num(ev && ev.snap && ev.snap.toCall, 0);
      acts = toCall > 0 ? ['fold', 'call', 'raise'] : ['check', 'bet'];
    }
    var labels = {};
    (o.actions || []).forEach(function(a) { var k = _actKey(a); if (k && !labels[k]) labels[k] = _actName(a); });
    var plans = (o.plans || []).map(function(p) { return (p && typeof p === 'object') ? String(p.key || '') : String(p == null ? '' : p); })
      .filter(function(k) { return !!k; }).slice(0, 4);
    return { actions: acts, labels: labels, plans: plans };
  }

  function _sameAction(a, b) { return !!a && !!b && String(a) === String(b); }
  // Theater.predict가 없을 때(모의 코어)만 쓰는 채점. w는 pMax로 근사한다
  function _localPredict(ev, guess) {
    var w = (typeof ev.pMax === 'number' && isFinite(ev.pMax)) ? Math.max(0, Math.min(1, 1 - ev.pMax)) : 0.5;
    return { hitAction: _sameAction(guess.action, ev.action), hitPlan: !!guess.plan && guess.plan === ev.planKey, w: w };
  }

  // ── 순수 HTML ──────────────────────────────────────────
  // 예측 칩(2줄: 액션, 계획 + 모르겠다) + 건너뛰기. stop = { name, pos, toCall, pot, actions, labels, plans, guess }
  function chipsHTML(stop) {
    if (!stop) return '';
    var g = stop.guess || {};
    var ctx = [];
    if (_num(stop.toCall, 0) > 0) ctx.push('콜 ' + _bb(stop.toCall));
    if (stop.pot != null) ctx.push('팟 ' + _bb(stop.pot));
    var out = '<div class="th-stop" role="group" aria-label="예측">' +
      '<div class="th-q"><span class="th-q-t">⏸ <b>' + _esc(stop.name) + '</b>' + (stop.pos ? '(' + _esc(stop.pos) + ')' : '') +
      '의 다음 수는?' + (ctx.length ? ' <span class="th-ctx">' + _esc(ctx.join(', ')) + '</span>' : '') + '</span>' +
      '<button type="button" class="th-skip" data-th="skip">건너뛰기</button></div>';
    out += '<div class="th-row th-row-act" role="group" aria-label="액션 예측"><span class="th-row-t">액션</span><div class="th-chips">' +
      (stop.actions || []).map(function(k, i) {
        var on = g.action === k;
        var name = (stop.labels && stop.labels[k]) || _actKor(k), hint = _actHint(k);
        // 작게 벳과 크게 벳은 경계(팟의 60%)를 칩 안 작은 글자로(초보가 사이즈 기준을 몰라 찍지 않게, 좁은 폰에서도 줄이 늘지 않게)
        var sub = hint ? (ACT_SUB[k] || hint) : '';
        return '<button type="button" class="th-chip' + (on ? ' on' : '') + '" data-th="act" data-v="' + _esc(k) + '" aria-pressed="' + (on ? 'true' : 'false') +
          '"' + (hint ? ' title="' + _esc(hint) + '"' : '') + '>' + _esc(name) + (sub ? '<small class="th-chip-sub">' + _esc(sub) + '</small>' : '') + '</button>';
      }).join('') + '</div></div>';
    if (stop.plans && stop.plans.length) {
      out += '<div class="th-row th-row-plan" role="group" aria-label="계획 예측"><span class="th-row-t">계획</span><div class="th-chips">' +
        stop.plans.map(function(k) {
          var on = g.plan === k;
          return '<button type="button" class="th-chip' + (on ? ' on' : '') + '" data-th="plan" data-v="' + _esc(k) + '" aria-pressed="' + (on ? 'true' : 'false') +
            '">' + _esc(planKor(k)) + '</button>';
        }).join('') +
        '<button type="button" class="th-chip th-chip-idk' + (g.plan === null ? ' on' : '') + '" data-th="plan" data-v="" aria-pressed="' + (g.plan === null ? 'true' : 'false') + '">모르겠다</button>' +
        '</div></div>';
    }
    return out + '</div>';
  }

  // 하단 자막 스트립: 최근 2줄(말, 속)
  function stripHTML(lines) {
    var ls = (lines || []).slice(-2);
    if (!ls.length) return '<div class="th-strip is-empty" aria-live="polite"><div class="th-line th-hintline">계획 예고를 읽고 ▶ 시작을 눌러요</div></div>';
    return '<div class="th-strip" aria-live="polite">' + ls.map(function(l) {
      return '<div class="th-line th-k-' + _esc(l.kind) + '">' + (l.stripHtml || l.html) + '</div>';
    }).join('') + '</div>';
  }

  function _nextLabel(md) {
    if (md.cardPending) return '🎬 명장면';
    if (md.mode === 'intro') return '▶ 시작';
    if (md.mode === 'stop') return '예측해 보세요';
    if (md.mode === 'end') return md.more ? '▶ 다음 편' : '✔ 마치기';
    return '▶ 다음';
  }
  // 극장 바: ▶ 다음, ⏸, 1x/2x, ↩
  function barHTML(md) {
    md = md || {};
    var stop = md.mode === 'stop';
    return '<div class="th-bar" role="toolbar" aria-label="극장 조작">' +
      '<button type="button" class="th-btn th-next' + (md.hold || md.mode === 'intro' || md.mode === 'end' ? ' is-call' : '') + '" data-th="next"' +
      (stop ? ' disabled aria-disabled="true"' : '') + '>' + _nextLabel(md) + '</button>' +
      '<button type="button" class="th-btn th-pause" data-th="pause" aria-pressed="' + (md.paused ? 'true' : 'false') + '" aria-label="' +
      (md.paused ? '자동 재생 다시 켜기' : '자동 재생 멈추기') + '">' + (md.paused ? '⏵' : '⏸') + '</button>' +
      '<button type="button" class="th-btn th-speed" data-th="speed" aria-label="재생 속도 ' + (md.speed === 2 ? '2배' : '1배') + ', 누르면 바꿔요">' +
      (md.speed === 2 ? '2x' : '1x') + '</button>' +
      '<button type="button" class="th-btn th-exit" data-th="exit" aria-label="극장 나가기">↩</button></div>';
  }

  function _verdictHTML(v) {
    if (!v) return '';
    var rows = [];
    if (v.skipped) {
      rows.push('<div class="th-v">건너뛰었어요. 실제는 <b>' + _esc(v.actual) + '</b>' + (v.plan ? ', 계획은 <b>' + _esc(v.plan) + '</b>' : '') + '</div>');
    } else {
      rows.push('<div class="th-v ' + (v.hitAction ? 'is-hit' : 'is-miss') + '">' + (v.hitAction ? '✅ 액션 적중: ' : '❌ 액션: 내 예측 ' + _esc(v.myAction) + ', 실제 ') +
        '<b>' + _esc(v.actual) + '</b></div>');
      if (v.hasPlans) {
        if (v.myPlan == null) rows.push('<div class="th-v">계획: 모르겠다' + (v.plan ? ', 실제는 <b>' + _esc(v.plan) + '</b>' : '') + '</div>');
        else rows.push('<div class="th-v ' + (v.hitPlan ? 'is-hit' : 'is-miss') + '">' + (v.hitPlan ? '✅ 계획 적중: ' : '❌ 계획: 내 예측 ' + _esc(v.myPlan) + ', 실제 ') +
          '<b>' + _esc(v.plan || '계획 없음') + '</b></div>');
      }
    }
    rows.push('<div class="th-sub">▶ 다음을 누르면 이어서 봐요</div>');
    return '<div class="th-verdict" role="status">' + rows.join('') + '</div>';
  }

  function _endHTML(md) {
    var t = md.tally || { pred: 0, hit: 0 };
    var out = '<div class="th-end" role="status"><div class="th-end-t">🏁 ' + (md.total > 1 ? (md.idx + 1) + '편 끝' : '이번 편 끝') + '</div>' +
      '<div class="th-end-d">예측 ' + t.pred + '번, 적중 ' + t.hit + '번' + (md.xp ? ', +' + _esc(md.xp) + ' XP' : '') + '</div>';
    if (md.card) out += '<div class="th-end-d">🎬 명장면 카드가 나왔어요' + (md.saved ? ', 모은 카드는 여정 홈의 오늘의 명장면에 나와요' : '') + '</div>';
    else if (md.threshold != null) out += '<div class="th-end-d th-sub">이번 핸드는 명장면 기준(드라마 ' + _esc(md.threshold) + '점)에 못 미쳐 카드가 없어요</div>';
    return out + '</div>';
  }

  function _introHTML(lines) {
    var ls = (lines || []).filter(function(l) { return l.kind === 'intro'; });
    return '<div class="th-intro"><div class="th-intro-t">🎭 계획 예고</div><div class="th-intro-list">' +
      (ls.length ? ls.map(function(l) { return '<div class="th-intro-l">' + l.html + '</div>'; }).join('') : '<div class="th-intro-l th-sub">예고 없이 시작해요</div>') +
      '</div><div class="th-note">💜 ' + CHAR_NOTE + '</div></div>';
  }

  function panelHTML(md) {
    if (!md) return '';
    if (md.mode === 'intro') return _introHTML(md.lines);
    if (md.mode === 'stop') return chipsHTML(md.stop);
    if (md.mode === 'end') return _endHTML(md);
    if (md.verdict) return _verdictHTML(md.verdict);
    return '<div class="th-hint th-sub">' + (md.paused ? '⏸ 멈춤, ▶ 다음으로 한 수씩 봐요' : '자동 재생 중, 결정적인 순간에 멈춰요') + '</div>';
  }

  // 명장면 카드(순수, T7 card 모양): 제목 = 속마음 한 줄, 보드, 팟, 에쿼티 막대, 계획, 출연
  function cardHTML(card) {
    if (!card || typeof card !== 'object') return '';
    var board = (card.board || []).map(_cardObj).filter(Boolean);
    var eq = (card.eq || []).filter(function(x) { return x && x.name != null && isFinite(Number(x.eq)); });
    // 보드 3장 이상은 남은 카드 전부 열거(엔진 계산), 프리플랍은 무작위 모의 실험(theater/highlight.js, 계약 T7)이라 근사
    var eqLabel = board.length >= 3 ? '엔진 계산' : '참고, 엔진 모의 실험 근사';
    var plans = card.plan && typeof card.plan === 'object' ? Object.keys(card.plan) : [];
    var out = '<div class="th-card" role="group" aria-label="명장면 카드">' +
      '<div class="th-card-top"><span class="th-card-badge">🎬 명장면</span>' +
      (card.score != null ? '<span class="th-card-score">드라마 ' + _esc(Math.round(_num(card.score, 0))) + '점</span>' : '') + '</div>' +
      '<div class="th-card-title">“' + _esc(card.title || '이름 없는 장면') + '”</div>' +
      '<div class="th-card-board" aria-label="보드">' + (board.length ? _miniCards(board) : '<span class="th-sub">보드가 깔리기 전(프리플랍) 장면이에요</span>') + '</div>' +
      (card.pot != null ? '<div class="th-card-pot">팟 ' + _bb(card.pot) + '</div>' : '');
    if (eq.length) {
      out += '<div class="th-card-eq"><div class="th-card-eq-t">에쿼티 <span class="th-sub">(' + eqLabel + ')</span></div>' +
        eq.map(function(x) {
          var v = Number(x.eq), pct = v <= 1 ? v * 100 : v;
          pct = Math.max(0, Math.min(100, pct));
          var txt = (Math.round(pct * 10) / 10) + '%';
          return '<div class="th-eq-row"><span class="th-eq-n">' + _esc(x.name) + '</span><span class="th-eq-bar" aria-hidden="true"><span class="th-eq-fill" style="width:' +
            pct.toFixed(1) + '%"></span></span><span class="th-eq-v">' + txt + '</span></div>';
        }).join('') + '</div>';
    }
    if (plans.length) {
      out += '<div class="th-card-plans">' + plans.map(function(n) {
        return '<span class="th-card-plan"><b>' + _esc(n) + '</b> ' + _esc(planKor(card.plan[n])) + '</span>';
      }).join('') + '</div>';
    }
    if (card.cast && card.cast.length) out += '<div class="th-card-cast th-sub">출연: ' + _esc(card.cast.map(function(c) { return (c && typeof c === 'object') ? c.name : c; }).join(', ')) + '</div>';
    return out + '<div class="th-card-note th-sub">💜 ' + CHAR_NOTE + '</div></div>';
  }

  // ── 진행 상태 ──────────────────────────────────────────
  function _coreOf(opts) {
    var c = (opts && opts.core) || _core || _m('Theater');
    return (c && typeof c.newEpisode === 'function' && typeof c.step === 'function') ? c : null;
  }
  function _specs(opts) {
    var e = opts && opts.episodes, list = [];
    if (e && typeof e === 'object' && typeof e.length === 'number') {
      for (var i = 0; i < e.length && list.length < 5; i++) {
        var x = e[i];
        if (typeof x === 'number' && isFinite(x)) list.push({ seed: x });
        else if (x && typeof x === 'object') list.push(_copy(x));
      }
    } else if (e && typeof e === 'object') {
      list.push(_copy(e));
    } else {
      var n = Math.max(1, Math.min(5, Math.floor(_num(e, 1)) || 1));
      for (var j = 0; j < n; j++) list.push({});
    }
    if (opts && opts.hideTypes) list.forEach(function(s) { if (s.hideTypes == null) s.hideTypes = true; });
    return list;
  }

  function _push(r, kind, html, o) {
    o = o || {};
    r.lines.push({ kind: kind, html: html, stripHtml: o.stripHtml || null, strip: o.strip !== false, feed: o.feed !== false, name: o.name || null });
  }
  function _stripLines(r) { return r.lines.filter(function(l) { return l.strip; }); }

  function _beginEpisode(r, i) {
    var ep = null;
    try { ep = r.core.newEpisode(_copy(r.specs[i])); } catch (e) { _warn('newEpisode', e); ep = null; }
    if (!ep || !ep.state) return false;
    _cancel(r.timer); r.timer = null;
    r.idx = i; r.ep = ep; r.mode = 'intro'; r.lines = []; r.fed = 0; r.stop = null; r.stops = 0;
    r.bubble = null; r.focus = null; r.hold = false; r.verdict = null; r.card = null; r.cardSeen = false; r.saved = false; r.xp = 0;
    r.tally = { pred: 0, hit: 0, hitW: 0 };
    _push(r, 'sys', '🎬 ' + (r.specs.length > 1 ? (i + 1) + '/' + r.specs.length + '편, ' : '') +
      '6명의 카드가 모두 보여요. 결정적인 순간에만 멈춰서 물어볼게요.', { strip: false });
    (ep.intro || []).forEach(function(x) {
      if (x && x.text) _push(r, 'intro', '📜 <b>' + _esc(x.name) + '</b> ' + _esc(x.text), { strip: false, name: x.name });
    });
    _push(r, 'note', '💜 ' + CHAR_NOTE, { strip: false });
    return true;
  }

  function _isStop(r, ev) { return _kind(ev) === 'action' && !!ev.decisive && !!ev.name && r.stops < MAX_STOPS; }

  function _step() {
    var r = _r;
    if (!r || r.mode === 'end' || r.mode === 'stop') return;
    _cancel(r.timer); r.timer = null;
    r.mode = 'play'; r.hold = false; r.verdict = null;
    var ev = null;
    try { ev = r.core.step(r.ep); } catch (e) { _warn('step', e); ev = null; }
    if (_r !== r) return;
    if (!ev) { _endEpisode(r); _render(); return; }
    if (_isStop(r, ev)) { _enterStop(r, ev); _render(); return; }
    _reveal(r, ev, null, null);
    if (r.ep.done || _kind(ev) === 'showdown') { _endEpisode(r); _render(); return; }
    _render();
    _schedule(r, ev);
  }

  function _schedule(r, ev) {
    if (!r || _r !== r || r.paused || r.mode !== 'play' || r.hold) return;
    var ms = delayMs(r.speed, _reduced());
    if (ms && ev && _kind(ev) === 'street') ms *= 2;
    r.timer = _later(function() { if (_r === r) { r.timer = null; _step(); } }, ms);
  }

  function _enterStop(r, ev) {
    var o = _options(ev);
    var before = ev.before || r.ep.state || {};
    var p = before.players && before.players[ev.name];
    r.mode = 'stop'; r.stops++;
    r.stop = { ev: ev, guess: {}, actions: o.actions, labels: o.labels, plans: o.plans, name: ev.name, pos: p ? p.pos : null,
      toCall: ev.snap ? ev.snap.toCall : null, pot: ev.snap && ev.snap.potBefore != null ? ev.snap.potBefore : (before.pot != null ? before.pot : null) };
    r.focus = ev.name; r.bubble = null;   // 멈춤 중에는 강조만(말풍선이 그 좌석의 스택과 벳을 가리지 않게)
  }

  function _reveal(r, ev, res, guess) {
    var kind = _kind(ev);
    if (kind === 'action') {
      var name = ev.name || '';
      // 계획 변경은 이 액션을 고르기 전에 일어난다(극장 AI가 바꾼 계획으로 움직임) → 말 줄보다 앞에 둬서 스트립이 '말, 속' 2줄로 남게
      // 극장 AI가 준 자막(계획 변경: A → B (사유))이 있으면 그것을, 없으면 새 계획 이름만
      if (ev.switched) _push(r, 'sys', '🔀 <b>' + _esc(name) + '</b> ' + (typeof ev.caption === 'string' && ev.caption ? _esc(ev.caption) : '계획 변경: ' + _esc(planKor(ev.switched))), { name: name });
      var fsText = typeof ev.foreshadow === 'string' ? ev.foreshadow : (ev.foreshadow && ev.foreshadow.text ? String(ev.foreshadow.text) : '');
      if (fsText) _push(r, 'fore', '📜 <b>' + _esc(name) + '</b> ' + _esc(fsText), { name: name });
      var label = actionLabel(ev);
      var marks = '';
      if (res) {
        marks = ' <span class="th-mark ' + (res.hitAction ? 'is-hit' : 'is-miss') + '">' + (res.hitAction ? '✅ 액션' : '❌ 액션') + '</span>';
        if (guess && guess.plan) marks += ' <span class="th-mark ' + (res.hitPlan ? 'is-hit' : 'is-miss') + '">' + (res.hitPlan ? '✅ 계획' : '❌ 계획') + '</span>';
      }
      _push(r, 'say', '🗣 <b>' + _esc(name) + '</b> ' + _esc(label) + marks, { name: name });
      var tt = _thoughtText(ev), mis = ev.misread === true, hasRead = !!(ev.read && ev.read.text);
      // 오독은 읽은 사람(read.reader)이 이 액션을 한 사람의 손을 잘못 본 것이다. 배지는 읽기 줄에만 붙이고(행동한 사람의 속마음에 붙이면
      // 그 사람이 틀린 것처럼 보인다), 오독이면 읽기 줄을 스트립에도 올린다(말 줄은 말풍선과 피드에 남는다)
      if (tt) _push(r, 'think', '💭 ' + _esc(tt) + (mis && !hasRead ? ' ' + MISREAD : ''), { name: name });
      if (hasRead) {
        var rd = ev.read;
        _push(r, 'read', '🔍 ' + _esc(rd.reader || name) + '의 읽기: ' + _esc(rd.text) +
          (rd.grade && GRADE_KOR[rd.grade] ? ' <span class="th-sub">(' + GRADE_KOR[rd.grade] + ')</span>' : '') + (mis ? ' ' + MISREAD : ''),
          { strip: mis, name: rd.reader || name });
      }
      r.bubble = { name: name, label: label, text: tt };
      r.focus = null;
      return;
    }
    if (kind === 'street') {
      var st = (ev.street && STREET_KOR[ev.street]) || '다음 카드';
      var board = (r.ep.state && r.ep.state.board) || [];
      _push(r, 'street', '🃏 <b>' + _esc(st) + '</b> ' + _esc(board.map(_cardText).join(' ')));
      var fs = ev.foreshadow;
      if (fs && typeof fs === 'object' && typeof fs.length === 'number') {
        fs.forEach(function(x) { if (x && x.text) _push(r, 'fore', '📜 <b>' + _esc(x.name) + '</b> ' + _esc(x.text), { name: x.name }); });
      } else if (typeof fs === 'string' && fs) _push(r, 'fore', '📜 ' + _esc(fs));
      r.bubble = null; r.focus = null;
      return;
    }
    if (kind === 'showdown') {
      _showdownLines(r, ev);
      r.bubble = null; r.focus = null;
    }
  }

  function _showdownLines(r, ev) {
    var res = r.ep.result || ev.result || {};
    var winners = (res.winners || []).map(function(w) { return (w && typeof w === 'object') ? w.name : w; }).filter(function(x) { return x != null; });
    var hands = res.hands || {};
    var pot = res.pot != null ? res.pot : (r.ep.state ? r.ep.state.pot : null);
    // 모두 폴드해서 이긴 핸드는 족보로 이긴 것이 아니라서 족보를 붙이지 않는다(쇼다운에서만)
    var desc = res.showdown !== false && winners.length === 1 && hands[winners[0]] && hands[winners[0]].desc ? '(' + hands[winners[0]].desc + ')' : '';
    var who = winners.length ? winners.map(_esc).join(', ') + (winners.length > 1 ? ' 나눠 가짐' : ' 승리' + _esc(desc)) : '결과';
    var tail = pot != null ? ', 팟 ' + _bb(pot) : '';
    if (res.showdown === false) _push(r, 'end', '🏁 <b>' + who + '</b>' + tail + ' (다른 사람 모두 폴드)');
    else _push(r, 'end', '🏁 쇼다운: <b>' + who + '</b>' + tail);
    // 좌석별 손 이름. 폴드한 사람은 끝까지 갔다면의 족보라 '(폴드)'를 붙여 승부한 손과 구분한다
    Object.keys(hands).forEach(function(n) {
      if (hands[n] && hands[n].desc) _push(r, 'sd', '  ' + _esc(n) + (hands[n].folded ? '(폴드)' : '') + ': ' + _esc(hands[n].desc), { strip: false });
    });
  }

  function _endEpisode(r) {
    if (!r || r.mode === 'end') return;
    _cancel(r.timer); r.timer = null;
    r.mode = 'end'; r.stop = null; r.focus = null; r.hold = false; r.verdict = null; r.bubble = null;
    var ep = r.ep, card = null;
    var H = _m('Highlight');
    if (ep && ep.done && H && typeof H.pick === 'function') {
      try { card = H.pick(ep) || null; } catch (e) { _warn('Highlight.pick', e); card = null; }
    }
    r.threshold = (H && typeof H.THRESHOLD === 'number') ? H.THRESHOLD : null;
    var t = r.tally;
    var rec = _call('Journey', 'recordTheater', { seed: ep ? ep.seed : null, predicted: t.pred, hit: t.hit, hitW: t.hitW, card: card }, _now());
    if (rec && typeof rec === 'object') {
      r.xp = _num(rec.xp, 0);
      if (rec.card && typeof rec.card === 'object') { card = rec.card; r.saved = true; }
    }
    r.res.episodes++; r.res.predicted += t.pred; r.res.hit += t.hit; r.res.hitW += t.hitW;
    if (card) r.res.cards.push(card);
    r.card = card;
    if (!(ep && ep.done) && !r.lines.some(function(l) { return l.kind === 'end'; })) _push(r, 'end', '🏁 이번 편 끝');
    _push(r, 'sys', '📊 이번 편: 예측 ' + t.pred + '번, 적중 ' + t.hit + '번' + (r.xp ? ', +' + r.xp + ' XP' : ''), { strip: false });   // 스트립 대신 끝 요약 패널
    if (card && !r.paused) {
      var ms = delayMs(r.speed, _reduced()) * 3;
      r.timer = _later(function() { if (_r === r && r.mode === 'end' && !r.cardSeen) { r.timer = null; _openEpCard(r); } }, ms);
    }
  }

  function _resolve(r, skipped) {
    var s = r.stop, ev = s.ev, res = null, guess = null;
    var actual = actualLabel(ev), plan = ev.planKey ? planKor(ev.planKey) : '';
    if (!skipped) {
      guess = { action: s.guess.action, plan: s.guess.plan == null ? null : s.guess.plan };
      var tb = (r.ep.tally && typeof r.ep.tally.pred === 'number') ? r.ep.tally.pred : null;
      if (typeof r.core.predict === 'function') {
        try { res = r.core.predict(r.ep, ev, guess); } catch (e) { _warn('predict', e); res = null; }
      }
      if (!res || typeof res !== 'object') res = _localPredict(ev, guess);
      var w = Math.max(0, Math.min(1, _num(res.w, 0)));
      var hit = !!res.hitAction;   // 적중 집계(XP, 적중률)는 액션 기준(theater-core predict의 tally와 같다). 계획 적중은 화면 표시만
      var et = r.ep.tally;
      if (tb !== null && et && _num(et.pred, 0) > tb) {
        r.tally = { pred: _num(et.pred, 0), hit: _num(et.hit, 0), hitW: _num(et.hitW, 0) };   // 코어가 센 값을 그대로
      } else {
        r.tally.pred++;
        if (hit) { r.tally.hit++; r.tally.hitW += w; }
      }
      r.verdict = { hitAction: !!res.hitAction, hitPlan: !!res.hitPlan, hasPlans: s.plans.length > 0,
        myAction: (s.labels && s.labels[guess.action]) || _actKor(guess.action),
        myPlan: guess.plan ? planKor(guess.plan) : null, actual: actual, plan: plan };
      if (res.hitAction || res.hitPlan) _call('A11y', 'fx', 'ok');
    } else {
      r.verdict = { skipped: true, actual: actual, plan: plan };
    }
    r.stop = null; r.focus = null; r.mode = 'play';
    _reveal(r, ev, res, guess);
    if (r.ep.done || _kind(ev) === 'showdown') { _endEpisode(r); _render(); return; }
    r.hold = true;   // 공개를 읽을 시간: ▶ 다음을 누를 때까지
    _render();
  }

  // ── 조작 ───────────────────────────────────────────────
  function next() {
    var r = _r;
    if (!r) return false;
    if (r.cardOpen) { _cardAdvance(r); return true; }
    if (r.mode === 'intro' || r.mode === 'play') { _step(); return true; }
    if (r.mode === 'end') {
      if (r.card && !r.cardSeen) { _cancel(r.timer); r.timer = null; _openEpCard(r); return true; }
      _nextEpisode(r);
      return true;
    }
    return false;   // 멈춤 중에는 칩으로만 진행
  }
  function pick(kind, val) {
    var r = _r;
    if (!r || r.mode !== 'stop' || !r.stop) return false;
    var s = r.stop;
    if (kind === 'action') {
      if (s.actions.indexOf(val) < 0) return false;
      s.guess.action = val;
    } else if (kind === 'plan') {
      if (val === '' || val == null) val = null;
      if (val !== null && s.plans.indexOf(val) < 0) return false;
      if (!s.plans.length) return false;
      s.guess.plan = val;
    } else return false;
    if (s.guess.action !== undefined && (!s.plans.length || s.guess.plan !== undefined)) _resolve(r, false);
    else _render();
    return true;
  }
  function skip() {
    var r = _r;
    if (!r || r.mode !== 'stop' || !r.stop) return false;
    _resolve(r, true);
    return true;
  }
  function togglePause() {
    var r = _r;
    if (!r) return false;
    r.paused = !r.paused;
    if (r.paused) { if (r.mode === 'play') { _cancel(r.timer); r.timer = null; } }
    else if (r.mode === 'play' && !r.hold && r.timer == null) _schedule(r, null);
    _render();
    return r.paused;
  }
  function toggleSpeed() {
    var r = _r;
    if (!r) return 1;
    r.speed = r.speed === 2 ? 1 : 2;
    _saveSpeed(r.speed);
    if (r.mode === 'play' && r.timer != null) { _cancel(r.timer); r.timer = null; _schedule(r, null); }
    _render();
    return r.speed;
  }
  function exit() { if (!_r) return false; _finish('exit'); return true; }

  function _nextEpisode(r) {
    _closeEpCard(r);
    if (r.idx + 1 < r.specs.length && _beginEpisode(r, r.idx + 1)) {
      if (r.dom) { var f = _el('thinking-feed'); if (f) f.innerHTML = ''; }
      _render();
      return;
    }
    _finish('done');
  }

  // ── 열기, 닫기 ─────────────────────────────────────────
  function _goHome() {
    if (_fn('JourneyUI', 'open')) { _call('JourneyUI', 'open'); return; }
    if (_fn('App', 'showMenu')) { _call('App', 'showMenu'); return; }
    _call('App', 'showScreen', 'screen-menu');
  }

  function open() {
    return start({ episodes: 1, onDone: function(res) {
      if (res === null) _call('JourneyUI', 'toast', '극장을 준비하고 있어요');
      _goHome();
    } });
  }

  function start(opts) {
    opts = opts || {};
    var onDone = typeof opts.onDone === 'function' ? opts.onDone : null;
    if (_r) _finish('replaced');
    var core = _coreOf(opts), specs = _specs(opts);
    var r = { core: core, opts: opts, onDone: onDone, specs: specs, idx: -1, ep: null, mode: 'idle', paused: false, speed: _loadSpeed(),
      timer: null, hold: false, lines: [], fed: 0, stop: null, stops: 0, bubble: null, focus: null, verdict: null, tally: null,
      res: { episodes: 0, predicted: 0, hit: 0, hitW: 0, cards: [] }, card: null, cardSeen: false, cardOpen: false, saved: false, xp: 0,
      threshold: null, dom: false, unbind: [], saved0: null, root: null };
    if (!core || !specs.length || !_beginEpisode(r, 0)) {
      if (onDone) { try { onDone(null); } catch (e) { _warn('onDone', e); } }
      return false;
    }
    _r = r;
    _mount(r);
    _render();
    return true;
  }

  function _mount(r) {
    r.dom = _hasDom();
    if (_fn('App', 'showScreen')) _call('App', 'showScreen', 'screen-game');
    else if (r.dom) _showGameScreen();
    if (r.dom) {
      var d = _doc(), sc = _el('screen-game');
      if (sc) { sc.classList.add('th-on'); sc.scrollTop = 0; }
      var f = _el('thinking-feed');
      if (f) {
        r.saved0 = { html: f.innerHTML, display: f.style.display };
        f.innerHTML = ''; f.style.display = 'block'; f.classList.add('th-feed');
        f.setAttribute('aria-label', '속마음 피드, 이번 핸드 전체');
      }
      var root = d.createElement('div');
      root.id = 'th-root';
      root.className = 'th-root';
      root.setAttribute('role', 'region');
      root.setAttribute('aria-label', '속마음 극장');
      var bar = _el('action-bar');
      if (sc && bar && bar.parentNode === sc) sc.insertBefore(root, bar);
      else if (sc) sc.appendChild(root);
      root.addEventListener('click', _onClick);
      r.root = root;
      if (!_keyBound && typeof d.addEventListener === 'function') { d.addEventListener('keydown', _onKey); _keyBound = true; }
    }
    if (_fn('Nav', 'setBack')) {
      var un = _call('Nav', 'setBack', 'screen-game', function() {
        if (_r !== r) return false;
        _finish('back');
        return true;
      });
      if (typeof un === 'function') r.unbind.push(un);
    }
    if (_fn('MobileUI', 'openTab') && (!_fn('MobileUI', 'isMobile') || _call('MobileUI', 'isMobile'))) _call('MobileUI', 'openTab', 'think');
  }

  function _showGameScreen() {
    var d = _doc();
    if (!d) return;
    var list = d.querySelectorAll('.screen');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('active');
    var g = _el('screen-game');
    if (g) g.classList.add('active');
  }

  function _unmount(r) {
    r.unbind.forEach(function(f) { try { f(); } catch (e) { /* 무시 */ } });
    r.unbind = [];
    _cancel(r.timer); r.timer = null;
    _closeEpCard(r);
    if (r.dom) {
      var sc = _el('screen-game');
      if (sc) { sc.classList.remove('th-on'); sc.classList.remove('th-stop'); }
      if (r.root && r.root.parentNode) r.root.parentNode.removeChild(r.root);
      r.root = null;
      _clearBubble();
      _seatMarks(null, null, null);
      var f = _el('thinking-feed');
      if (f) {
        f.classList.remove('th-feed');
        f.removeAttribute('aria-label');
        if (r.saved0) { f.innerHTML = r.saved0.html; f.style.display = r.saved0.display; }
      }
    }
    if (_fn('MobileUI', 'openTab')) _call('MobileUI', 'openTab', null);
  }

  function _finish(reason) {
    var r = _r;
    if (!r) return;
    _r = null;
    _unmount(r);
    var res = { episodes: r.res.episodes, predicted: r.res.predicted, hit: r.res.hit, hitW: Math.round(r.res.hitW * 1000) / 1000, cards: r.res.cards.slice() };
    if (reason === 'replaced') return;
    if (r.onDone) { try { r.onDone(res); } catch (e) { _warn('onDone', e); } }
    else _goHome();
    // onDone이 화면을 바꾸지 않았으면 여정 홈으로(게임 화면에 극장 잔상이 남지 않게)
    if (r.dom && !_r && _activeScreen() === 'screen-game') _goHome();
  }

  function _activeScreen() {
    var d = _doc();
    if (!d || typeof d.querySelector !== 'function') return null;
    var el = d.querySelector('.screen.active');
    return el && el.id ? el.id : null;
  }

  function active() { return !!_r; }

  // ── 그리기(DOM) ────────────────────────────────────────
  function _model() {
    var r = _r;
    if (!r) return null;
    var s = r.stop;
    return {
      mode: r.mode, idx: r.idx, total: r.specs.length, more: r.idx + 1 < r.specs.length, paused: r.paused, speed: r.speed,
      delay: delayMs(r.speed, _reduced()), hold: r.hold, focus: r.focus, bubble: r.bubble ? _copy(r.bubble) : null,
      strip: _stripLines(r).slice(-2).map(function(l) { return { kind: l.kind, html: l.stripHtml || l.html }; }),
      feed: r.lines.filter(function(l) { return l.feed; }).map(function(l) { return { kind: l.kind, html: l.html }; }),
      lines: r.lines.slice(),
      stop: s ? { name: s.name, pos: s.pos, toCall: s.toCall, pot: s.pot, actions: s.actions.slice(), labels: _copy(s.labels), plans: s.plans.slice(), guess: _copy(s.guess) } : null,
      stops: r.stops, verdict: r.verdict, tally: _copy(r.tally), result: _copy(r.res), card: r.card, cardPending: r.mode === 'end' && !!r.card && !r.cardSeen,
      cardOpen: r.cardOpen, saved: r.saved, xp: r.xp, threshold: r.threshold, seed: r.ep ? r.ep.seed : null, dom: r.dom
    };
  }

  function _viewState(r) {
    var st = (r.mode === 'stop' && r.stop && r.stop.ev && r.stop.ev.before) ? r.stop.ev.before : (r.ep && r.ep.state);
    if (!st) return null;
    var v = _copy(st);
    v.revealAll = true;
    v.spectator = true;
    if (v.hideTypes == null) v.hideTypes = !!(r.specs[r.idx] && r.specs[r.idx].hideTypes);
    return v;
  }

  function _render() {
    var r = _r;
    if (!r || !r.dom) return;
    var md = _model();
    var view = _viewState(r);
    if (view && _fn('Table', 'render')) {
      _call('Table', 'render', view);
      var hi = _el('hand-info');
      if (hi) hi.textContent = '🎭 속마음 극장' + (r.specs.length > 1 ? ' ' + (r.idx + 1) + '/' + r.specs.length + '편' : '');
    }
    var sc = _el('screen-game');
    if (sc) sc.classList.toggle('th-stop', r.mode === 'stop');
    _seatMarks(view, r.focus, r.bubble ? r.bubble.name : null);
    if (r.root) {
      var keep = _focusKey();
      r.root.setAttribute('data-mode', r.mode);
      r.root.innerHTML = stripHTML(md.strip) + '<div class="th-panel' + (r.mode === 'play' && !r.verdict ? ' is-quiet' : '') + '">' + panelHTML(md) + '</div>' + barHTML(md);
      _restoreFocus(r.root, keep);
    }
    _renderFeed(r);
    _clearBubble();
    if (r.bubble && view) _showBubble(view, r.bubble, r.mode === 'stop');
  }

  function _focusKey() {
    var d = _doc(), a = d && d.activeElement;
    if (!a || !a.getAttribute || !a.closest || !a.closest('#th-root')) return null;
    return { th: a.getAttribute('data-th'), v: a.getAttribute('data-v') };
  }
  function _restoreFocus(root, k) {
    if (!k || !k.th || !root.querySelectorAll) return;
    var list = root.querySelectorAll('[data-th]');
    var fallback = null;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.disabled) continue;
      if (b.getAttribute('data-th') === k.th && (k.v == null || b.getAttribute('data-v') === k.v)) { try { b.focus(); } catch (e) { /* 무시 */ } return; }
      if (!fallback && (b.getAttribute('data-th') === 'act' || b.getAttribute('data-th') === 'plan' || b.getAttribute('data-th') === 'next')) fallback = b;
    }
    if (fallback) { try { fallback.focus(); } catch (e) { /* 무시 */ } }
  }

  function _renderFeed(r) {
    var f = _el('thinking-feed');
    if (!f) return;
    var feed = r.lines.filter(function(l) { return l.feed; });
    if (r.fed > feed.length) { f.innerHTML = ''; r.fed = 0; }
    var d = _doc();
    for (var i = r.fed; i < feed.length; i++) {
      var line = d.createElement('div');
      line.className = 'thinking-line th-fl th-fl-' + feed[i].kind;
      line.innerHTML = feed[i].html;
      f.appendChild(line);
    }
    r.fed = feed.length;
    f.scrollTop = f.scrollHeight;
    // 세로 폰에서는 도크 본문이 스크롤 상자(피드 자체는 높이 제한 없음)라 그쪽도 맨 아래로
    var body = f.closest ? f.closest('.m-dock-body') : null;
    if (body) body.scrollTop = body.scrollHeight;
  }

  function _seatEl(view, name) {
    var p = view && view.players && view.players[name];
    return p ? _el('seat-' + p.pos) : null;
  }
  function _seatMarks(view, focus, act) {
    var d = _doc();
    if (!d || typeof d.querySelectorAll !== 'function') return;
    var list = d.querySelectorAll('#screen-game .seat');
    for (var i = 0; i < list.length; i++) { list[i].classList.remove('th-focus'); list[i].classList.remove('th-act'); }
    if (!view) return;
    var f = focus ? _seatEl(view, focus) : null;
    if (f) f.classList.add('th-focus');
    var a = act && act !== focus ? _seatEl(view, act) : null;
    if (a) a.classList.add('th-act');
  }

  function _clearBubble() {
    var d = _doc();
    if (!d || typeof d.querySelectorAll !== 'function') return;
    var list = d.querySelectorAll('.th-bubble');
    for (var i = 0; i < list.length; i++) if (list[i].parentNode) list[i].parentNode.removeChild(list[i]);
  }
  // 활성 좌석 1곳만 말풍선. 후보 자리를 차례로 놓아 보고 다른 좌석, 팟, 보드 카드와 안 겹치는 첫 자리를 쓴다.
  //   넓은 화면: 테이블 안쪽(위쪽 좌석은 아래, 아래쪽 좌석은 위) → 그 좌석의 이름 줄 위에 덮기
  //   좁은 세로 폰(테이블 영역 600px 이하): 이름 줄 위에 덮기만(카드는 보이게, 속마음 전문은 자막 스트립)
  // 좌우는 테이블 영역 안으로 맞춘다
  function _showBubble(view, b, thinking) {
    var seat = _seatEl(view, b.name);
    var area = seat && seat.closest ? seat.closest('.table-area') : null;
    var table = seat && seat.closest ? seat.closest('.poker-table') : null;
    if (!seat || !area || !table || !seat.getBoundingClientRect) return;
    var d = _doc();
    var el = d.createElement('div');
    el.className = 'th-bubble' + (thinking ? ' is-thinking' : '');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<b>' + _esc(b.name) + ' ' + _esc(b.label) + '</b>' + (b.text ? '<span>💭 ' + _esc(b.text) + '</span>' : '');
    var sr = seat.getBoundingClientRect(), ar = area.getBoundingClientRect(), tr = table.getBoundingClientRect();
    area.appendChild(el);
    var avoid = _avoidRects(seat);
    var kinds = ar.width <= 600 ? ['cover'] : ['inward', 'cover'];
    for (var i = 0; i < kinds.length; i++) {
      var pl = _placeBubble(el, kinds[i], sr, ar, tr);
      if (i === kinds.length - 1 || !_hitsAny(pl, avoid)) break;
    }
  }
  function _placeBubble(el, kind, sr, ar, tr) {
    el.classList.remove('is-cover'); el.classList.remove('is-below'); el.classList.remove('is-above');
    el.style.maxWidth = '';
    if (kind === 'cover') { el.classList.add('is-cover'); el.style.maxWidth = Math.round(sr.width + 16) + 'px'; }   // 옆 좌석까지 넘지 않게
    var bw = el.offsetWidth || 160, bh = el.offsetHeight || 40;
    var left = sr.left - ar.left + sr.width / 2 - bw / 2, top;
    if (kind === 'cover') {
      // 옆쪽 좌석은 바깥쪽(화면 가장자리 쪽)으로 넓혀 가운데 좌석과 팟을 비켜 간다
      var dx = (sr.left + sr.width / 2) - (tr.left + tr.width / 2);
      if (dx < -tr.width * 0.15) left = sr.right - ar.left + 4 - bw;
      else if (dx > tr.width * 0.15) left = sr.left - ar.left - 4;
      top = sr.top - ar.top - 2;
    } else {
      var below = (sr.top + sr.height / 2) < (tr.top + tr.height / 2);
      top = below ? (sr.bottom - ar.top + 4) : (sr.top - ar.top - bh - 4);
      el.classList.add(below ? 'is-below' : 'is-above');
    }
    left = Math.max(4, Math.min(ar.width - bw - 4, left));
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
    return { x: ar.left + left, y: ar.top + top, r: ar.left + left + bw, b: ar.top + top + bh };
  }
  // 말풍선이 피할 것: 말하는 좌석을 뺀 좌석들, 팟 표시, 보드 카드, 피드(데스크톱은 테이블 왼쪽 위에 떠 있다)
  function _avoidRects(seat) {
    var d = _doc(), out = [];
    if (!d || typeof d.querySelectorAll !== 'function') return out;
    var list = d.querySelectorAll('#screen-game .seat, #screen-game .pot-display-wrap, #board-cards .card, #screen-game #thinking-feed');
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e === seat || !e.getBoundingClientRect) continue;
      if (e.classList && e.classList.contains('seat') && !String(e.innerHTML || '').replace(/\s+/g, '')) continue;
      var q = e.getBoundingClientRect();
      if (q.width > 0 && q.height > 0) out.push({ x: q.left, y: q.top, r: q.right, b: q.bottom });
    }
    return out;
  }
  function _hitsAny(a, list) {
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5) return true;
    }
    return false;
  }

  // ── 명장면 카드 창 ─────────────────────────────────────
  function _overlay(html, onClick) {
    var d = _doc();
    if (!d || !d.body || typeof d.createElement !== 'function') return null;
    var ov = d.createElement('div');
    ov.className = 'th-card-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', '명장면 카드');
    ov.innerHTML = html;
    ov.addEventListener('click', onClick);
    d.body.appendChild(ov);
    var first = ov.querySelector ? ov.querySelector('[data-th]') : null;
    if (first) { try { first.focus(); } catch (e) { /* 무시 */ } }
    return ov;
  }
  function _openEpCard(r) {
    if (!r || !r.card || r.cardOpen) return;
    r.cardSeen = true;
    if (!r.dom) { r.cardOpen = true; return; }
    var more = r.idx + 1 < r.specs.length;
    var acts = more
      ? '<button type="button" class="th-btn th-next is-call" data-th="card-next">▶ 다음 편</button><button type="button" class="th-btn" data-th="card-exit" aria-label="극장 나가기">↩ 그만 보기</button>'
      : '<button type="button" class="th-btn th-next is-call" data-th="card-next">✔ 마치기</button>';
    var ov = _overlay('<div class="th-card-box">' + cardHTML(r.card) +
      (r.saved ? '<div class="th-card-saved th-sub">🗂 카드를 모았어요. 여정 홈의 오늘의 명장면에 나와요</div>' : '') +
      '<div class="th-card-acts">' + acts + '</div></div>', function(e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-th]') : null;
        if (!t) return;
        var a = t.getAttribute('data-th');
        if (a === 'card-next') next();
        else if (a === 'card-exit') exit();
      });
    r.cardOpen = true;
    r.cardEl = ov;
    _render();
  }
  function _closeEpCard(r) {
    if (!r) return;
    if (r.cardEl && r.cardEl.parentNode) r.cardEl.parentNode.removeChild(r.cardEl);
    r.cardEl = null;
    r.cardOpen = false;
  }
  function _cardAdvance(r) { _closeEpCard(r); _nextEpisode(r); }

  // 오늘의 명장면 블록 등에서 카드 1장 보기. 닫으면 onDone()
  function showCard(o) {
    o = o || {};
    var card = o.card, done = typeof o.onDone === 'function' ? o.onDone : null;
    if (!card || typeof card !== 'object') { if (done) { try { done(); } catch (e) { _warn('onDone', e); } } return false; }
    _closeCard();
    var c = { onDone: done, el: null, unbind: null };
    _card = c;
    var d0 = _doc();
    var canDom = _env.dom !== false && !!(d0 && d0.body && typeof d0.querySelector === 'function' && d0.querySelector('body'));
    if (canDom) {
      c.el = _overlay('<div class="th-card-box">' + cardHTML(card) +
        '<div class="th-card-acts"><button type="button" class="th-btn th-next is-call" data-th="card-close">닫기</button></div></div>', function(e) {
          var t = e.target && e.target.closest ? e.target.closest('[data-th]') : null;
          if (t && t.getAttribute('data-th') === 'card-close') _closeCard(true);
        });
      var d = _doc();
      if (!_keyBound && d && typeof d.addEventListener === 'function') { d.addEventListener('keydown', _onKey); _keyBound = true; }
    }
    if (_fn('Nav', 'setBack')) {
      var un = _call('Nav', 'setBack', '*', function() { if (_card !== c) return false; _closeCard(true); return true; });
      if (typeof un === 'function') c.unbind = un;
    }
    return true;
  }
  function _closeCard(fire) {
    var c = _card;
    if (!c) return;
    _card = null;
    if (c.unbind) { try { c.unbind(); } catch (e) { /* 무시 */ } }
    if (c.el && c.el.parentNode) c.el.parentNode.removeChild(c.el);
    if (fire && c.onDone) { try { c.onDone(); } catch (e) { _warn('onDone', e); } }
  }

  // ── 입력 ───────────────────────────────────────────────
  function _onClick(e) {
    var t = e && e.target && e.target.closest ? e.target.closest('[data-th]') : null;
    if (!t || t.disabled) return;
    var a = t.getAttribute('data-th'), v = t.getAttribute('data-v');
    if (a === 'next') next();
    else if (a === 'pause') togglePause();
    else if (a === 'speed') toggleSpeed();
    else if (a === 'exit') exit();
    else if (a === 'act') pick('action', v);
    else if (a === 'plan') pick('plan', v === '' ? null : v);
    else if (a === 'skip') skip();
  }

  // 데스크톱 키보드: Enter/Space 다음, Esc 나가기, 멈춤 중 숫자 1~3 액션 → 1~5 계획(5 = 모르겠다), 0 건너뛰기, P 멈춤
  function _onKey(e) {
    if (!e) return;
    if (_card && e.key === 'Escape') { e.preventDefault(); _closeCard(true); return; }
    var r = _r;
    if (!r || _activeScreen() !== 'screen-game') return;
    var tg = e.target, tag = tg && tg.tagName ? String(tg.tagName).toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); exit(); return; }
    if (r.mode === 'stop' && r.stop) {
      var s = r.stop, n = parseInt(k, 10);
      if (k === '0') { e.preventDefault(); skip(); return; }
      if (n >= 1 && n <= 9) {
        if (s.guess.action === undefined && n <= s.actions.length) { e.preventDefault(); pick('action', s.actions[n - 1]); }
        else if (s.guess.action !== undefined && s.plans.length && n <= s.plans.length + 1) { e.preventDefault(); pick('plan', n <= s.plans.length ? s.plans[n - 1] : null); }
      }
      return;
    }
    if ((k === 'Enter' || k === ' ') && tag !== 'BUTTON') { e.preventDefault(); next(); return; }
    if (k === 'p' || k === 'P') { togglePause(); }
  }

  // ── 테스트 전용 ────────────────────────────────────────
  function _setEnv(env) { _env = env || {}; }
  function _setCore(c) { _core = c || null; }
  function _reset() {
    if (_r) { var r = _r; _r = null; try { _unmount(r); } catch (e) { /* 무시 */ } }
    if (_card) {
      var c = _card; _card = null;
      if (c.unbind) { try { c.unbind(); } catch (e) { /* 무시 */ } }
      if (c.el && c.el.parentNode) c.el.parentNode.removeChild(c.el);
    }
    _env = {}; _core = null;
  }

  var api = {
    open: open, start: start, showCard: showCard, cardHTML: cardHTML, active: active,
    next: next, pick: pick, skip: skip, togglePause: togglePause, toggleSpeed: toggleSpeed, exit: exit,
    delayMs: delayMs, chipsHTML: chipsHTML, stripHTML: stripHTML, barHTML: barHTML, panelHTML: panelHTML,
    actionLabel: actionLabel, planKor: planKor,
    SPEED_MS: SPEED_MS, MAX_STOPS: MAX_STOPS, CHAR_NOTE: CHAR_NOTE,
    _model: _model, _setEnv: _setEnv, _setCore: _setCore, _reset: _reset, _cardOpen: function() { return !!_card; }
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
