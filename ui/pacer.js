// ui/pacer.js (로컬 G2 PACE, 설계 원문 docs/NEXT2_DESIGN.md 4.2~4.5절, 계약 6.1절 5번)
// 빌런 액션 순차 공개. app.js _processVillainActions가 엔진 걸음 루프로 모은 프레임 [{ pre, action, post }]을
//   Pacer.run(frames, { frame(frame, i), done() }, ctx)로 넘기면 프레임마다 frame 훅(렌더와 말풍선)을 부르고 끝에 done을 부른다.
//   ctx = { practice, heroOut(히어로 폴드 뒤 빌런끼리, 모든 값 x0.5), next: 'hero' | 'street' | 'end'(끝난 뒤 이어질 일), speed(생략하면 설정) }
//   동기 조건(sync(ctx)): 게임 화면 DOM 없음(node, smoke), 속도 instant, 프레임 0개, 연습 재생이면 모두 즉시 동기로 끝낸다(예전 동작).
//   비동기면 setTimeout 체인. busy() 공개 중인가, finish() 남은 프레임을 즉시 처리하고 done 1회(빨리 감기),
//   cancel() 남은 프레임과 done을 버림(화면 이탈, 새 핸드). 공개 중 #action-bar에 .revealing, 테이블이나 액션바를 누르면 finish.
//   plan(frames, speed, ctx) → [{ i, delay }](순수, 4.3절 속도표). 배열의 tail 속성 = 마지막 프레임 뒤 done까지의 대기.
//     delay[0] = FIRST_MS(히어로 액션이나 보드 딜 뒤 첫 프레임), delay[i] = 앞 프레임이 머무는 시간(폴드 fold, 연속 폴드 foldRun, 그 밖 action).
//     tail = next가 'hero'면 0(바로 내 차례), 그 밖(스트리트 전환, 핸드 끝)은 street. 합이 cap을 넘으면 비례 축소.
//   speed() 현재 설정(A11y pace, 모르는 값은 normal), cycle() 느림 → 보통 → 빠름 → 즉시 순환 저장.
//   _setEnv({ hasDom, setTimeout, clearTimeout }) 테스트 주입(null이면 원래대로).
// HandLogUI(같은 파일): 액션 로그 줄 #hand-log. app.js의 HandLog 훅 5곳을 그대로 받아(track) 화면용 이벤트를 따로 쌓는다
//   (미션, 보스, 커리어처럼 HandLog가 기록하지 않는 판에서도 보인다). hold() 뒤 reveal(n)은 hold 시점 + n개까지만 보이고
//   reveal()은 전부. 폰은 도크 상단부 첫 줄(36px, MobileUI TOP), 누르면 하단 시트. 데스크톱은 테이블 왼쪽 위 패널(최근 4줄, 누르면 펼침).
// 규약: 로드 때 DOM, localStorage 접근 없음(전부 typeof 가드). 가운뎃점과 긴줄표 없음.
var Pacer = (function() {
  // ms. action 일반 액션, fold 폴드, foldRun 연속 폴드 2번째부터, street 스트리트 전환, cap 한 묶음(한 스트리트 빌런 연속 액션) 합 상한
  var SPEEDS = {
    slow:    { action: 800, fold: 450, foldRun: 300, street: 600, cap: 5000 },
    normal:  { action: 450, fold: 250, foldRun: 180, street: 350, cap: 3000 },
    fast:    { action: 220, fold: 120, foldRun: 90,  street: 150, cap: 1500 },
    instant: { action: 0,   fold: 0,   foldRun: 0,   street: 0,   cap: 0 }
  };
  var ORDER = ['slow', 'normal', 'fast', 'instant'];
  var LABEL = { slow: '느림', normal: '보통', fast: '빠름', instant: '즉시' };
  var FIRST_MS = 150;     // 히어로 액션 뒤 첫 프레임(내 말풍선이 먼저 보이게)
  var HERO_OUT = 0.5;     // 히어로가 폴드한 뒤 빌런끼리 진행은 모든 값 x0.5
  var TOAST_KEY = 'poker_pace_toast_seen';

  var _env = { hasDom: null, setTimeout: null, clearTimeout: null };
  var _job = null;        // 진행 중 공개 { frames, hooks, delays, tail, i, timer }
  var _tapBound = false;

  function _setT(fn, ms) { var f = _env.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null); return f ? f(fn, ms) : (fn(), null); }
  function _clearT(id) { var f = _env.clearTimeout || (typeof clearTimeout === 'function' ? clearTimeout : null); if (f && id != null) f(id); }
  function _setEnv(o) {
    if (!o) { _env = { hasDom: null, setTimeout: null, clearTimeout: null }; return _env; }
    Object.keys(o).forEach(function(k) { _env[k] = o[k]; });
    return _env;
  }
  // 실제 게임 화면이 있는가(node 러너와 smoke는 querySelector가 null)
  function _hasDom() {
    if (_env.hasDom != null) return !!_env.hasDom;
    try { return !!(typeof document !== 'undefined' && document && typeof document.querySelector === 'function' && document.querySelector('#screen-game .poker-table')); }
    catch (e) { return false; }
  }

  function speed() {
    var p = null;
    try { p = (typeof A11y !== 'undefined' && A11y && typeof A11y.load === 'function') ? A11y.load().pace : null; } catch (e) { p = null; }
    return ORDER.indexOf(p) >= 0 ? p : 'normal';
  }
  function label(spd) { return LABEL[spd] || LABEL.normal; }
  // 다음 속도로 저장하고 새 값을 돌려준다
  function cycle() {
    var nx = ORDER[(ORDER.indexOf(speed()) + 1) % ORDER.length];
    try { if (typeof A11y !== 'undefined' && A11y && typeof A11y.save === 'function') A11y.save({ pace: nx }); } catch (e) { /* noop */ }
    return nx;
  }

  function sync(ctx) {
    ctx = ctx || {};
    if (!_hasDom()) return true;
    if ((ctx.speed || speed()) === 'instant') return true;
    if (ctx.frames && ctx.frames.length === 0) return true;
    if (ctx.practice) return true;
    return false;
  }

  function _act(f) { return (f && f.action && f.action.action) || ''; }
  // 프레임 i가 화면에 머무는 시간(다음 프레임이나 done까지)
  function _stay(frames, i, sp) {
    if (_act(frames[i]) !== 'fold') return sp.action;
    return (i > 0 && _act(frames[i - 1]) === 'fold') ? sp.foldRun : sp.fold;
  }
  function plan(frames, spd, ctx) {
    frames = frames || [];
    ctx = ctx || {};
    var sp = SPEEDS[spd] || SPEEDS[speed()] || SPEEDS.normal;
    var k = ctx.heroOut ? HERO_OUT : 1;
    var out = [], tail = 0, sum = 0;
    if (sp.cap > 0 && frames.length) {
      for (var i = 0; i < frames.length; i++) out.push({ i: i, delay: (i === 0 ? FIRST_MS : _stay(frames, i - 1, sp)) * k });
      tail = ctx.next === 'hero' ? 0 : sp.street * k;
      out.forEach(function(p) { sum += p.delay; });
      sum += tail;
      var cap = sp.cap * k;
      if (sum > cap) {
        var r = cap / sum;
        out.forEach(function(p) { p.delay = p.delay * r; });
        tail = tail * r;
      }
      out.forEach(function(p) { p.delay = Math.round(p.delay); });
      tail = Math.round(tail);
    } else {
      for (var j = 0; j < frames.length; j++) out.push({ i: j, delay: 0 });
    }
    out.tail = tail;
    return out;
  }

  function _revealing(on) {
    if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return;
    var bar = document.getElementById('action-bar');
    if (bar && bar.classList) bar.classList.toggle('revealing', !!on);
    var sg = document.getElementById('screen-game');
    if (sg && sg.classList) sg.classList.toggle('pace-busy', !!on);
  }
  // 탭 좌표가 액션바 사각형 안인가. 공개 중 액션바는 ActionBar.render가 내 차례가 아닐 때 인라인 pointer-events: none을 두므로
  //   탭의 target이 액션바가 아니라 그 아래 #screen-game이 된다(실측). 좌표로 판정해야 "액션바를 누르면 빨리 감기"가 된다
  function _inActionBar(e) {
    if (!e || typeof e.clientX !== 'number' || typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return false;
    var bar = document.getElementById('action-bar');
    if (!bar || typeof bar.getBoundingClientRect !== 'function') return false;
    var r = bar.getBoundingClientRect();
    return !!(r && r.width > 0 && r.height > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
  }
  // 탭 1건 판정: 공개 중이고 테이블(.table-area)이나 액션바(요소 또는 좌표)면 finish. 로그 줄, 승률 칩, 토글, 도크는 제 할 일
  function _onTap(e) {
    if (!_job) return false;
    var t = e && e.target;
    if (!t || typeof t.closest !== 'function') return false;
    if (t.closest('#hand-log, #eq-chips, #equity-toggle, #m-dock')) return false;
    if (!t.closest('#screen-game .table-area, #action-bar') && !_inActionBar(e)) return false;
    finish();
    return true;
  }
  // 테이블이나 액션바 탭 = 빨리 감기. 한 번만 건다(캡처 단계, 아래 요소의 자기 일은 그대로 이어진다)
  function _bindTap() {
    if (_tapBound || typeof document === 'undefined' || !document || typeof document.addEventListener !== 'function') return;
    _tapBound = true;
    document.addEventListener('click', _onTap, true);
  }

  function _call(fn, a, b) {
    try { fn(a, b); } catch (e) { if (typeof console !== 'undefined' && console.error) console.error('[Pacer]', e); }
  }
  function _end() {
    var j = _job;
    if (!j) return;
    _clearT(j.timer);
    _job = null;
    _revealing(false);
    if (typeof j.hooks.done === 'function') j.hooks.done();
  }
  function _next() {
    var j = _job;
    if (!j) return;
    if (j.i >= j.frames.length) {
      if (j.tail > 0) j.timer = _setT(function() { if (_job === j) _end(); }, j.tail);
      else _end();
      return;
    }
    j.timer = _setT(function() {
      if (_job !== j) return;
      var i = j.i++;
      if (typeof j.hooks.frame === 'function') _call(j.hooks.frame, j.frames[i], i);
      _next();
    }, j.delays[j.i].delay);
  }

  function run(frames, hooks, ctx) {
    frames = frames || [];
    hooks = hooks || {};
    ctx = ctx || {};
    if (_job) finish();   // 앞 공개가 남았으면(정상 흐름에서는 없음) 먼저 끝낸다
    var spd = ctx.speed || speed();
    if (sync({ frames: frames, practice: ctx.practice, speed: spd })) {
      for (var i = 0; i < frames.length; i++) if (typeof hooks.frame === 'function') hooks.frame(frames[i], i);
      if (typeof hooks.done === 'function') hooks.done();
      return true;
    }
    var p = plan(frames, spd, ctx);
    _job = { frames: frames, hooks: hooks, delays: p, tail: p.tail || 0, i: 0, timer: null };
    _revealing(true);
    _bindTap();
    _next();
    return true;
  }
  function busy() { return !!_job; }
  function finish() {
    var j = _job;
    if (!j) return false;
    _clearT(j.timer);
    j.timer = null;
    while (j.i < j.frames.length && _job === j) {
      var i = j.i++;
      if (typeof j.hooks.frame === 'function') _call(j.hooks.frame, j.frames[i], i);
    }
    if (_job === j) _end();
    return true;
  }
  function cancel() {
    var j = _job;
    if (!j) return false;
    _clearT(j.timer);
    _job = null;
    _revealing(false);
    return true;
  }
  // 첫 순차 공개 안내를 띄울 차례인가(한 번만 true, 저장 키 poker_pace_toast_seen)
  function toastOnce() {
    var ls = null;
    try { ls = (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null; } catch (e) { ls = null; }
    if (!ls) return false;
    try { if (ls.getItem(TOAST_KEY)) return false; ls.setItem(TOAST_KEY, '1'); return true; } catch (e) { return false; }
  }

  var api = { SPEEDS: SPEEDS, ORDER: ORDER.slice(), LABEL: LABEL, FIRST_MS: FIRST_MS, HERO_OUT: HERO_OUT, TOAST_KEY: TOAST_KEY,
    speed: speed, label: label, cycle: cycle, sync: sync, plan: plan, run: run, busy: busy, finish: finish, cancel: cancel,
    toastOnce: toastOnce, _setEnv: _setEnv, _hasDom: _hasDom, _onTap: _onTap };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();

// 액션 로그 줄 #hand-log(설계 4.4절 2~4번). 데이터는 app.js의 HandLog 훅 인자를 그대로 받아 화면용으로 따로 쌓는다
var HandLogUI = (function() {
  var _ev = [], _pos = {}, _shown = 0, _base = null, _open = false, _el = null, _sheet = null;
  var LIGHT = { green: '🟢', yellow: '🟡', red: '🔴' };
  var TRACK = { begin: 1, villain: 1, hero: 1, street: 1, note: 1, end: 1 };

  function _r1(x) { return Math.round((Number(x) || 0) * 10) / 10; }
  function _cs(cards) { return (cards || []).map(function(c) { return c ? (typeof c === 'string' ? c : c.rank + c.suit) : ''; }); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; });
  }
  function _AT() { return (typeof ActionText !== 'undefined' && ActionText && typeof ActionText.line === 'function') ? ActionText : null; }
  function _color(h) { return (typeof Cards !== 'undefined' && Cards && typeof Cards.colorize === 'function') ? Cards.colorize(h) : h; }
  function _doc() { return (typeof document !== 'undefined' && document && typeof document.getElementById === 'function') ? document : null; }
  function _mobile() { try { return !!(typeof MobileUI !== 'undefined' && MobileUI && MobileUI.isMobile && MobileUI.isMobile()); } catch (e) { return false; } }

  // hold 중(공개 전)에 쌓이는 이벤트는 보이는 내용이 안 바뀌니 다시 그리지 않는다(결정 동기 블록 안에서 걸음 수만큼 innerHTML을 쓰지 않게)
  function _push(ev) {
    _ev.push(ev);
    if (_base == null) { _shown = _ev.length; render(); }
    return ev;
  }

  // app.js _hl(name, ...)과 같은 인자. 화면용 이벤트(ActionText.line 모양)를 쌓는다
  function track(name, a1, a2, a3) {
    if (!TRACK[name]) return null;
    if (name === 'begin') {
      var st = a1 && a1.state;
      _ev = []; _pos = {}; _shown = 0; _base = null;
      if (st && st.players) Object.keys(st.players).forEach(function(n) { var p = st.players[n]; if (p && p.pos) _pos[n] = p.pos; });
      if (st) return _push({ k: 's', st: 'preflop', board: [], pot: _r1(st.pot) });
      render();
      return null;
    }
    if (name === 'villain') {
      var v = a1 || {};
      return _push({ k: 'a', st: (a2 && a2.street) || null, n: v.name, act: v.action, amt: _r1(v.amount), lbl: v.label || null });
    }
    if (name === 'hero') {
      var o = a1 || {}, pre = o.pre || {}, post = o.post || {}, act = o.executed || o.intended || null;
      var had = (pre.playerBets && pre.playerBets.Hero) || 0, now = post.playerBets && post.playerBets.Hero, amt = 0;
      if (act === 'call') amt = now != null ? now - had : 0;
      else if (act === 'raise' || act === 'allin' || act === 'bet') amt = now != null ? now : (o.amount || 0);
      return _push({ k: 'a', st: pre.street || null, n: 'Hero', act: act, amt: _r1(amt), lbl: null, light: (o.grade && o.grade.light) || null });
    }
    if (name === 'street') {
      if (!a1) return null;
      return _push({ k: 's', st: a1.street || null, board: _cs(a1.board), pot: _r1(a1.pot) });
    }
    if (name === 'note') {
      var ev = { k: 'n', kind: String(a1 || '') };
      if (a2 && typeof a2 === 'object') Object.keys(a2).forEach(function(k) { if (k !== 'k' && k !== 'kind') ev[k] = a2[k]; });
      return _push(ev);
    }
    if (name === 'end') {
      var s = (a1 && a1.settled) || {}, r = (a1 && a1.result) || {};
      return _push({ k: 'e', winner: r.winner != null ? r.winner : null, payouts: s.payouts || {}, desc: r.handDescriptions || {}, showdown: !!r.showCards });
    }
    return null;
  }

  // 지금부터 쌓이는 이벤트는 reveal(n)이 풀 때까지 숨긴다(엔진은 먼저 끝났지만 화면 공개 전)
  function hold() { _base = _shown; return _base; }
  // reveal(n): hold 시점 + n개까지 보임. 인자 없으면 전부(hold 해제). 보이는 이벤트 수를 돌려준다
  function reveal(upTo) {
    if (upTo == null) { _base = null; _shown = _ev.length; }
    else _shown = Math.max(0, Math.min(_ev.length, (_base || 0) + upTo));
    render();
    return _shown;
  }
  function events() { return _ev.slice(0, _shown); }
  function pending() { return _ev.length - _shown; }   // 쌓였지만 아직 공개 안 된 이벤트 수
  function count() { var n = 0; for (var i = 0; i < _shown; i++) if (_ev[i].k === 'a') n++; return n; }

  function lineText(ev) { var AT = _AT(); return AT ? AT.line(ev, { pos: _pos }) : ''; }
  function rowHTML(ev) {
    var AT = _AT();
    if (!AT || !ev) return '';
    var txt = _color(_esc(lineText(ev)));
    if (ev.k === 's') return '<div class="hl-row hl-street">' + txt + '</div>';
    if (ev.k === 'e') return '<div class="hl-row hl-end">🏁 ' + txt + '</div>';
    if (ev.k === 'n') return '<div class="hl-row hl-note">' + txt + '</div>';
    var key = AT.actKey(ev);
    return '<div class="hl-row ' + (AT.cls(key) || '') + (ev.n === 'Hero' ? ' hl-hero' : '') + '"><span class="hl-ic" aria-hidden="true">' + AT.icon(key) + '</span>' +
      txt + (ev.light && LIGHT[ev.light] ? ' ' + LIGHT[ev.light] : '') + '</div>';
  }
  function listHTML() { return events().map(rowHTML).join(''); }
  // 접힌 줄: [횟수][마지막 공개 이벤트][⏩ 속도]. title이 참이면(데스크톱 패널, 아래 목록이 최근 줄을 보인다) 글은 제목만
  function lineHTML(title) {
    var ev = (!title && _shown > 0) ? _ev[_shown - 1] : null;
    var AT = _AT(), cls = '', ic = '';
    if (ev && ev.k === 'a' && AT) { var key = AT.actKey(ev); cls = AT.cls(key); ic = AT.icon(key); }
    var txt = ev ? _color(_esc(lineText(ev))) + (ev.light && LIGHT[ev.light] ? ' ' + LIGHT[ev.light] : '') : '이번 핸드 기록';
    var spd = Pacer.speed();
    return '<button type="button" class="hl-line" aria-expanded="' + (_open ? 'true' : 'false') + '" aria-label="이번 핸드 액션 기록 ' + (_open ? '접기' : '펼치기') + '">' +
      '<span class="hl-count" aria-hidden="true">' + count() + '</span>' +
      '<span class="hl-text ' + cls + '">' + (ic ? '<span class="hl-ic" aria-hidden="true">' + ic + '</span>' : '') + txt + '</span>' +
      '<span class="hl-arrow" aria-hidden="true">' + (_open ? '▴' : '▾') + '</span></button>' +
      '<button type="button" class="hl-speed" data-pace="' + spd + '" aria-label="상대 액션 속도 ' + Pacer.label(spd) + ', 누르면 바꿔요">⏩ ' + Pacer.label(spd) + '</button>';
  }

  // #hand-log를 만든다(없으면). 게임 화면 .table-area 안, 폰이면 MobileUI가 도크 상단부로 옮긴다
  function ensure() {
    var d = _doc();
    if (!d || !d.createElement || !Pacer._hasDom()) return null;
    var el = d.getElementById('hand-log');
    if (el && el.nodeType) { _el = el; return el; }
    var area = d.querySelector ? d.querySelector('#screen-game .table-area') : null;
    if (!area || !area.insertBefore) return null;
    el = d.createElement('div');
    el.id = 'hand-log';
    el.className = 'hand-log';
    el.setAttribute('role', 'log');
    el.setAttribute('aria-live', 'off');
    el.innerHTML = '<div class="hl-head"></div><div class="hl-list"></div>';
    area.insertBefore(el, area.firstChild);
    el.addEventListener('click', _onClick);
    _el = el;
    return el;
  }
  function _ensureSheet() {
    var d = _doc();
    if (!d || !d.body || !d.createElement) return null;
    if (_sheet && _sheet.parentNode) return _sheet;
    _sheet = d.getElementById('hand-log-sheet');
    if (_sheet) return _sheet;
    _sheet = d.createElement('div');
    _sheet.id = 'hand-log-sheet';
    _sheet.className = 'hl-sheet';
    _sheet.setAttribute('role', 'dialog');
    _sheet.setAttribute('aria-label', '이번 핸드 액션 기록');
    _sheet.innerHTML = '<button type="button" class="hl-sheet-handle" aria-label="기록 접기"><span class="hl-sheet-grip" aria-hidden="true"></span>' +
      '<span class="hl-sheet-title">이번 핸드 기록</span><span aria-hidden="true">▾</span></button><div class="hl-sheet-body"></div>';
    _sheet.style.display = 'none';
    d.body.appendChild(_sheet);
    _sheet.addEventListener('click', function(e) { if (e.target && e.target.closest && e.target.closest('.hl-sheet-handle')) toggle(false); });
    return _sheet;
  }

  function _onClick(e) {
    var t = e && e.target;
    if (!t || !t.closest) return;
    if (t.closest('.hl-speed')) { e.stopPropagation && e.stopPropagation(); speedTap(); return; }
    if (t.closest('.hl-line') || t.closest('.hl-list')) toggle();
  }
  function toggle(on) {
    _open = (on == null) ? !_open : !!on;
    render();
    return _open;
  }
  function speedTap() {
    var nx = Pacer.cycle();
    if (typeof App !== 'undefined' && App && typeof App.toast === 'function') { try { App.toast('진행 속도: ' + Pacer.label(nx)); } catch (e) { /* noop */ } }
    render();
    return nx;
  }

  // 그리기: 줄 + (데스크톱) 목록 + (폰, 펼침) 하단 시트. 게임 화면이 없으면(node) 아무 일 없음
  function render() {
    var el = _el && _el.parentNode ? _el : ensure();
    if (!el) return false;
    var head = el.querySelector ? el.querySelector('.hl-head') : null, list = el.querySelector ? el.querySelector('.hl-list') : null;
    var mob = _mobile();
    if (head) head.innerHTML = lineHTML(!mob);
    el.classList.toggle('hl-open', _open && !mob);
    if (list) {
      list.innerHTML = mob ? '' : listHTML();
      if (!mob) list.scrollTop = _open ? list.scrollTop : 1e6;   // 접힘은 최근 줄이 보이게 맨 아래
    }
    // 띵킹 피드(데스크톱 왼쪽 위)가 보이면 그 아래로
    var d = _doc(), feed = d && d.getElementById('thinking-feed');
    el.classList.toggle('has-feed', !mob && !!(feed && feed.style && feed.style.display !== 'none' && feed.innerHTML && feed.innerHTML.replace(/\s+/g, '')));
    _renderMirrors(d, mob);
    if (mob && _open) {
      var sh = _ensureSheet();
      if (sh) {
        sh.style.display = '';
        _placeSheet(sh);
        var b = sh.querySelector('.hl-sheet-body');
        if (b) { b.innerHTML = listHTML() || '<div class="hl-row hl-note">아직 기록이 없어요</div>'; b.scrollTop = 1e6; }
      }
    } else if (_sheet) _sheet.style.display = 'none';
    return true;
  }

  // (n2b) 같은 줄 사본(.hl-mirror): 폰 차트 시트(#gto-sheet)가 도크의 로그 줄과 속도 버튼을 덮으므로 시트 손잡이 아래에 같은 줄을 둔다
  //   (ui/gto-chart.js가 자리를 만든다). 누르면 원본과 같다(줄 = 기록 시트 펼치기, ⏩ = 속도 바꾸기). 데스크톱은 비운다
  function _renderMirrors(d, mob) {
    if (!d || typeof d.querySelectorAll !== 'function') return 0;
    var ms = d.querySelectorAll('.hl-mirror'), html = mob ? lineHTML(false) : '';
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (!m) continue;
      if (m.innerHTML !== html) m.innerHTML = html;
      if (!m.__hlBound && typeof m.addEventListener === 'function') { m.__hlBound = true; m.addEventListener('click', _onClick); }
    }
    return ms.length;
  }

  // 시트 아래끝 = 보이는 액션바(또는 결과바) 위끝. 액션바를 덮지 않는다(mobile-check n05)
  function _placeSheet(sh) {
    var d = _doc();
    if (!d || typeof window === 'undefined' || !window.innerHeight) return;
    var bar = null;
    ['action-bar', 'result-actions-bar'].forEach(function(id) {
      var b = d.getElementById(id);
      if (b && b.style && b.style.display !== 'none' && b.offsetHeight > 0) bar = b;
    });
    var top = bar && bar.getBoundingClientRect ? bar.getBoundingClientRect().top : window.innerHeight;
    sh.style.bottom = Math.max(0, Math.round(window.innerHeight - top)) + 'px';
    sh.style.maxHeight = Math.max(160, Math.round(top - 8)) + 'px';
  }

  function onNewHand() { _open = false; render(); }

  var api = { track: track, hold: hold, reveal: reveal, events: events, pending: pending, count: count, lineText: lineText, rowHTML: rowHTML, listHTML: listHTML,
    lineHTML: lineHTML, ensure: ensure, toggle: toggle, speedTap: speedTap, render: render, onNewHand: onNewHand, renderMirrors: _renderMirrors,
    _reset: function() { _ev = []; _pos = {}; _shown = 0; _base = null; _open = false; } };
  return api;
})();
