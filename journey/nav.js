// journey/nav.js (채우는 패키지: M1-P5)
// 뒤로 버튼(Android 시스템 뒤로, 브라우저 뒤로)과 hash 라우팅. URL은 hash만 쓴다(#screen-game, #j/node/s1-01).
// path를 바꾸지 않으므로 GitHub Pages 새로고침 404가 없고, sw.js는 ''와 index.html만 index로 매핑하면 된다.
//
// 모델
//   브라우저 기록 0번 = "종료 보초"(init 때 replaceState), 1번 = 홈, 그 위로 화면/뷰가 쌓인다.
//   논리 스택 _stack[i] 가 브라우저 기록 i+1번에 대응하고, 평소에는 _idx === _stack.length 이다.
//   popstate = 사용자가 뒤로를 한 번 눌렀다는 신호. 맨 위 화면의 "나가기" 동작(그 화면 ↩ 버튼과 같은 함수)을
//   실행하고, 그 동작이 부른 showScreen(Nav.onShow)/Nav.view가 새 위치를 정한다.
//   앱 안 버튼으로 조상 화면에 돌아오면(예: ↩ 메뉴로) 브라우저 기록도 history.go(-n)으로 조용히 되감아
//   기록이 무한히 쌓이지 않게 한다(되감는 동안의 기록 조작은 큐에 모았다가 도착 후 적용).
//   뒤로 순서: 떠 있는 창(백업 창, ⚡ 1문제 패널, setBack('*')) 닫기 → 화면별 나가기 → 홈이면 홈 위 하위 화면(오늘의 5분 셸)의 ↩
//   → 그것도 없으면 종료 안내.
//   홈에서 뒤로: 보초(0번)에 내려앉으면 "한 번 더 누르면 종료" 토스트를 띄우고 2초 동안 보초에 머문다.
//   그 안에 한 번 더 누르면 더 돌아갈 기록이 없으므로 OS가 앱을 닫는다. 2초가 지나면 홈 기록을 다시 쌓는다.
//   새로고침(앱 업데이트, Android 복원) 뒤에는 지금 항목의 state.i로 예전 보초를 찾아 홈(1번)까지 되감는다(보초는 늘 하나).
// 로드 시에는 window.addEventListener('load') 외에 아무것도 건드리지 않는다(node 테스트 러너 안전).
var Nav = (function() {
  var TAG = 'pt-nav';
  var EXIT_MS = 2000;       // 두 번 눌러 종료 창, 게임 나가기 확인 창
  var SILENT_MS = 700;      // 되감기 popstate가 안 오면 이 시간 뒤 도착한 것으로 본다
  var GO = ['today', 'rush', 'game'];
  var EXIT_MSG = '뒤로 버튼을 한 번 더 누르면 앱이 닫혀요';
  var GAME_MSG = '뒤로 버튼을 한 번 더 누르면 게임에서 나가요';

  var _env = {};            // 테스트 주입(_setEnv). 비어 있으면 브라우저 전역을 쓴다
  var _inited = false, _binds = 0;
  var _stack = [];          // [{ k: 키, p: 뷰 파라미터 }], 키 = 화면 id 또는 'j/이름/파라미터'
  var _idx = 0;             // 현재 브라우저 기록 번호(0 = 보초)
  var _silent = null;       // 진행 중인 조용한 되감기 { to, timer }
  var _queue = [];          // 되감기 중에 들어온 이동
  var _resting = false;     // 홈에서 뒤로 뒤 보초에 머무는 중(종료 대기)
  var _rearmTimer = null, _toastTimer = null;
  var _lastBackAt = 0, _gameBackAt = 0;
  var _popping = false, _navCount = 0;
  var _handlers = [];       // [{ prefix, fn }] 나중 등록이 먼저
  var _pending = null;      // init 전에 보인 화면
  var _start = null, _startCaptured = false;

  // ── 환경(전역 또는 주입) ─────────────────────────────
  function _hist() {
    if ('history' in _env) return _env.history;
    return (typeof history !== 'undefined' && history) ? history : null;
  }
  function _loc() {
    if ('location' in _env) return _env.location;
    return (typeof location !== 'undefined' && location) ? location : null;
  }
  function _win() {
    if ('window' in _env) return _env.window;
    return (typeof window !== 'undefined' && window) ? window : null;
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

  // 다른 모듈 호출은 전부 여기로(typeof 가드). 테스트는 _env.act로 바꿔 끼운다.
  function _g(name) {
    if (_env.mods && Object.prototype.hasOwnProperty.call(_env.mods, name)) return _env.mods[name];   // 테스트 주입
    // 전역 IIFE 모듈 조회(브라우저와 node vm 모두 전역 var)
    switch (name) {
      case 'App': return (typeof App !== 'undefined' && App) ? App : null;
      case 'JourneyUI': return (typeof JourneyUI !== 'undefined' && JourneyUI) ? JourneyUI : null;
      case 'Journey': return (typeof Journey !== 'undefined' && Journey) ? Journey : null;
      case 'DrillUI': return (typeof DrillUI !== 'undefined' && DrillUI) ? DrillUI : null;
      case 'HistoryUI': return (typeof HistoryUI !== 'undefined' && HistoryUI) ? HistoryUI : null;
      case 'BackupUI': return (typeof BackupUI !== 'undefined' && BackupUI) ? BackupUI : null;
    }
    return null;
  }
  function _call(mod, fn) {
    var m = _g(mod);
    if (!m || typeof m[fn] !== 'function') return false;
    m[fn].apply(m, Array.prototype.slice.call(arguments, 2));
    return true;
  }
  function _doc() {
    if ('document' in _env) return _env.document;
    return (typeof document !== 'undefined' && document) ? document : null;
  }
  var DEFAULT_ACT = {
    showScreen: function(id) { return _call('App', 'showScreen', id); },
    showMenu: function() { return _call('App', 'showMenu'); },
    journeyOpen: function() { return _call('JourneyUI', 'open'); },
    journeyView: function(name, p) { return _call('JourneyUI', 'view', name, p); },
    closeSheet: function() { return _call('JourneyUI', 'closeSheet'); },
    journeyActive: function() {
      var J = _g('Journey');
      try { return !!(J && typeof J.active === 'function' && J.active()); } catch (e) { return false; }
    },
    drillExit: function() { return _call('DrillUI', 'exit'); },
    historyBack: function() { return _call('HistoryUI', 'back'); },
    // 세로 폰 핸드 리뷰 2단계(목록 → 상세)에서 상세가 열려 "↩ 목록" 버튼이 보이는지
    historyDetailOpen: function() {
      var d = _doc();
      if (!d || typeof d.querySelector !== 'function') return false;
      var b = d.querySelector('#screen-history .history-body.detail-open .history-list-back');
      if (!b || typeof b.getBoundingClientRect !== 'function') return false;
      var r = b.getBoundingClientRect();
      return !!(r && r.height > 0 && r.width > 0);
    },
    historyList: function() { return _call('HistoryUI', 'showList'); },
    // 홈 화면(루트) 안에 기록 없이 그려진 하위 화면(예: 오늘의 5분 셸)이면 그 화면의 ↩ 버튼을 누른다.
    // 표시: data-nav-back 속성 또는 여정 하위 화면의 .j-back. 보이는 버튼만
    rootBack: function() {
      var d = _doc();
      if (!d || typeof d.querySelector !== 'function') return false;
      var scr = d.querySelector('.screen.active');
      if (!scr || typeof scr.querySelector !== 'function') return false;
      var b = scr.querySelector('[data-nav-back]') || scr.querySelector('.j-back');
      if (!b || typeof b.click !== 'function' || typeof b.getBoundingClientRect !== 'function') return false;
      var r = b.getBoundingClientRect();
      if (!r || r.width <= 0 || r.height <= 0) return false;
      b.click();
      return true;
    },
    // 화면 위에 떠 있는 창을 먼저 닫는다(백업 창, 게임 결과바의 ⚡ 1문제 패널). 둘 다 body에 붙어 화면이 바뀌어도 남는다
    overlayClose: function() {
      var B = _g('BackupUI');
      try {
        if (B && typeof B.isOpen === 'function' && B.isOpen() && typeof B.close === 'function') { B.close(); return true; }
      } catch (e) { /* 무시 */ }
      var d = _doc();
      var q = (d && typeof d.getElementById === 'function') ? d.getElementById('drill-quick') : null;
      if (q && q.parentNode && _call('DrillUI', 'closeQuick')) return true;
      return false;
    },
    active: function() {
      var d = _doc();
      if (!d || typeof d.querySelector !== 'function') return null;
      var el = d.querySelector('.screen.active');
      return (el && el.id) ? el.id : null;
    },
    toast: function(msg, ms) {
      // 게임 화면은 하단이 결정 버튼(엄지 영역)이라 여정 토스트(하단) 대신 위쪽 정보 영역에 자체 토스트를 띄운다
      var onTop = _act('active') === 'screen-game';
      if (!onTop && _call('JourneyUI', 'toast', msg, ms)) return true;
      var d = _doc();
      if (!d || typeof d.createElement !== 'function' || !d.body) return false;
      var el = (typeof d.getElementById === 'function') ? d.getElementById('nav-toast') : null;
      if (!el || !el.parentNode) {
        el = d.createElement('div');
        el.id = 'nav-toast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.style.cssText = 'position:fixed;left:0;right:0;margin:0 auto;width:max-content;max-width:calc(100vw - 32px);' +
          'box-sizing:border-box;padding:10px 16px;border-radius:20px;background:rgba(22,27,34,.96);color:#e6edf3;' +
          'border:1px solid #30363d;font-size:0.95rem;line-height:1.4;text-align:center;word-break:keep-all;' +
          'z-index:10000;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.45)';
        d.body.appendChild(el);
      }
      el.style.top = onTop ? '12px' : 'auto';
      el.style.bottom = onTop ? 'auto' : '24px';
      if (onTop) el.style.top = 'calc(env(safe-area-inset-top, 0px) + 12px)';           // env 미지원이면 무시되고 px 유지
      else el.style.bottom = 'calc(env(safe-area-inset-bottom, 0px) + 24px)';
      el.textContent = msg;
      el.style.display = 'block';
      _cancel(_toastTimer);
      _toastTimer = _later(function() { _toastTimer = null; el.style.display = 'none'; }, ms || EXIT_MS);
      return true;
    }
  };
  function _act(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    var a = _env.act && _env.act[name];
    var f = (typeof a === 'function') ? a : DEFAULT_ACT[name];
    try { return f ? f.apply(null, args) : undefined; } catch (e) { return false; }
  }

  // ── 순수 함수 ───────────────────────────────────────
  function _dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function _enc(s) { return encodeURIComponent(String(s)); }

  // '#screen-game' → { screen: 'screen-game', view: null, params: null }
  // '#j/node/s1-01' → { screen: 'screen-journey', view: 'node', params: 's1-01' }
  function parse(hash) {
    var h = String(hash == null ? '' : hash);
    if (h.charAt(0) === '#') h = h.slice(1);
    var out = { screen: null, view: null, params: null };
    if (!h) return out;
    if (h.indexOf('j/') === 0) {
      var parts = h.slice(2).split('/');
      var v = _dec(parts.shift() || '');
      if (!v) return out;
      var p = parts.length ? _dec(parts.join('/')) : '';
      out.screen = 'screen-journey'; out.view = v; out.params = p === '' ? null : p;
      return out;
    }
    var s = _dec(h);
    if (/^screen-[A-Za-z0-9_-]+$/.test(s)) out.screen = s;
    return out;
  }

  function shouldPush(prev, next) { return !!next && prev !== next; }

  // 홈에서 뒤로: 2초 안에 두 번째면 'exit', 아니면 'toast'
  function exitDecision(lastBackAt, now) {
    if (typeof lastBackAt !== 'number' || !lastBackAt) return 'toast';
    var dt = now - lastBackAt;
    return (dt >= 0 && dt <= EXIT_MS) ? 'exit' : 'toast';
  }

  function _goOf(search) {
    var m = /[?&]go=([^&#]*)/.exec(String(search == null ? '' : search));
    if (!m) return null;
    var v = _dec(m[1].replace(/\+/g, ' ')).toLowerCase();
    return GO.indexOf(v) >= 0 ? v : null;
  }
  // 바로가기(manifest shortcuts) 진입 값. 인자가 없으면 시작 때 잡아 둔 값(init이 주소에서 go를 지운 뒤에도 유지)
  function startParam(search) {
    if (search === undefined) {
      if (_startCaptured) return _start;
      var loc = _loc();
      search = (loc && typeof loc.search === 'string') ? loc.search : '';
    }
    return _goOf(search);
  }
  function _stripGo(search) {
    var s = String(search || '').replace(/^\?/, '');
    if (!s) return '';
    var kept = s.split('&').filter(function(kv) { return kv && kv.split('=')[0] !== 'go'; });
    return kept.length ? '?' + kept.join('&') : '';
  }

  // ── 기록 조작 ───────────────────────────────────────
  function _top() { return _stack.length ? _stack[_stack.length - 1] : null; }
  function _isView(k) { return String(k).indexOf('j/') === 0; }
  function _cloneable(p) {
    if (p == null) return true;
    var t = typeof p;
    if (t === 'string' || t === 'number' || t === 'boolean') return true;
    if (t !== 'object') return false;
    try { JSON.stringify(p); return true; } catch (e) { return false; }
  }
  function _stateOf(e, i, extra) {
    var view = _isView(e.k) ? parse('#' + e.k) : null;
    var st = { nav: TAG, i: i, k: e.k, s: view ? 'screen-journey' : e.k, v: view ? view.view : null };
    if (e.p != null && _cloneable(e.p)) st.p = e.p;
    if (extra) for (var x in extra) st[x] = extra[x];
    return st;
  }
  function _raw(kind, st, url, fallbackUrl) {
    var h = _hist();
    if (!h || typeof h[kind] !== 'function') return false;
    try { h[kind](st, '', url); return true; } catch (e) { /* 아래에서 다시 */ }
    var lite = {};
    for (var x in st) if (x !== 'p') lite[x] = st[x];
    try { h[kind](lite, '', fallbackUrl || url); return true; } catch (e2) { return false; }
  }
  function _canGo() { var h = _hist(); return !!(h && typeof h.go === 'function'); }

  // 브라우저 기록을 논리 스택에 맞춘다(유일한 수렴 지점)
  function _sync() {
    if (!_inited || _silent) return;
    var d = _stack.length;
    if (!d) return;
    if (_idx === 0 && _resting && d === 1) return;              // 종료 대기 중에는 보초에 머문다
    if (_idx < d) {
      _resting = false; _cancelRearm();
      while (_idx < d) {
        var e = _stack[_idx];
        _idx++;
        _raw('pushState', _stateOf(e, _idx), '#' + e.k);
      }
      return;
    }
    var top = _stack[d - 1];
    if (_idx > d && _canGo()) { _traverse(d); return; }
    _raw('replaceState', _stateOf(top, _idx), '#' + top.k);
  }
  // 조용한 이동(사용자 뒤로가 아님). popstate가 오면 _silentDone
  function _traverse(target) {
    if (target === _idx) { _sync(); return; }                  // history.go(0)은 새로고침이므로 절대 부르지 않는다
    var h = _hist();
    if (!h || typeof h.go !== 'function') return;
    var delta = target - _idx;
    _silent = { to: target, timer: null };
    _silent.timer = _later(_silentDone, SILENT_MS);
    try { h.go(delta); } catch (e) { _silentDone(); }
  }
  function _silentDone() {
    if (!_silent) return;
    var s = _silent;
    _silent = null;
    _cancel(s.timer);
    _idx = s.to;
    var q = _queue;
    _queue = [];
    for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) { /* 무시 */ } }
    _sync();
  }
  function _cancelRearm() { if (_rearmTimer != null) { _cancel(_rearmTimer); _rearmTimer = null; } }
  function _rearm() {
    _rearmTimer = null;
    if (!_resting) return;
    _resting = false;
    _sync();
  }

  // 논리 이동: 같은 키면 replace, 스택 안의 조상이면 그 위를 걷어내고 되감기, 새 키면 push
  function _nav(key, p) {
    if (key == null || key === '') return;
    key = String(key);
    if (_popping) _navCount++;
    if (!_inited) { _pending = { k: key, p: p === undefined ? null : p }; return; }
    if (_silent) { _queue.push(function() { _nav(key, p); }); return; }
    var d = _stack.length, top = _stack[d - 1];
    if (!shouldPush(top && top.k, key)) {
      if (p !== undefined) top.p = p;
      if (_resting) return;
      _sync();
      return;
    }
    if (_resting) { _lastBackAt = 0; _resting = false; }
    for (var j = d - 2; j >= 0; j--) {
      if (_stack[j].k === key) {
        _stack.length = j + 1;
        if (p !== undefined) _stack[j].p = p;
        _sync();
        return;
      }
    }
    _stack.push({ k: key, p: p === undefined ? null : p });
    _sync();
  }

  // ── 뒤로 동작 ───────────────────────────────────────
  // 부모(현재 맨 위)를 다시 보여 준다
  function _restoreTop() {
    var t = _top();
    if (!t) return false;
    if (_isView(t.k)) {
      var pr = parse('#' + t.k);
      if (_act('journeyView', pr.view, t.p != null ? t.p : pr.params)) return true;
      return !!_act('journeyOpen');
    }
    if (t.k === 'screen-journey' && _act('journeyOpen')) return true;
    return !!_act('showScreen', t.k);
  }
  // "↩ 메뉴로"류 화면: 홈에서 바로 왔고 여정 세션 중이 아니면 홈, 그 밖에는 화면 버튼과 같은 App.showMenu
  // (여정 진행 중이면 app.js의 showMenu 분기가 진행 중 블록으로 돌려보낸다)
  function _up() {
    var parent = _top();
    if (!_act('journeyActive') && parent && _stack.length === 1 && parent.k !== 'screen-menu') return _restoreTop();
    if (_act('showMenu')) return true;
    return _restoreTop();
  }
  var BUILTIN = {
    'screen-drill': function() { return _act('drillExit') ? true : false; },       // 세션 중이면 허브, 허브면 메뉴
    'screen-history': function() {
      if (_act('historyDetailOpen')) { _act('historyList'); return 'stay'; }          // 세로 폰 상세 → 목록
      return _act('historyBack') ? true : false;
    },
    'screen-game': function() {
      var now = _now();
      if (exitDecision(_gameBackAt, now) === 'toast') {                                // 실수로 쓸어 넘겨도 핸드를 잃지 않게
        _gameBackAt = now;
        _act('toast', GAME_MSG, EXIT_MS);
        return 'stay';
      }
      _gameBackAt = 0;
      if (_act('journeyActive') && _act('showMenu')) return true;
      return _restoreTop();
    },
    'screen-session-summary': _up,
    'screen-villain-select': _up,
    'screen-curriculum': _up,
    'screen-scenario': _up,
    'j/node': function() { return _act('closeSheet') ? 'done' : false; }
  };
  function _matches(prefix, key) {
    return prefix === '*' || key === prefix || key.indexOf(prefix + '/') === 0;
  }
  function _runHandlers(key, param, global) {
    for (var i = _handlers.length - 1; i >= 0; i--) {
      var h = _handlers[i];
      if ((h.prefix === '*') !== !!global || !_matches(h.prefix, key)) continue;
      var r;
      try { r = h.fn(key, param, _top() ? _top().k : null); } catch (e) { r = false; }
      if (r !== false) return { r: r };
    }
    return null;
  }
  function _runBack(e) {
    var hit = _runHandlers(e.k, e.p, false);
    if (hit) return hit.r;
    var b = BUILTIN[e.k];
    if (!b && _isView(e.k)) b = BUILTIN['j/' + parse('#' + e.k).view];
    if (b) { var r = b(e); if (r !== false) return r; }
    return _restoreTop() ? 'nav' : null;
  }
  // 떠 있는 창이 있으면 그것만 닫는다(모든 깊이, 홈 포함)
  function _closeOverlay() {
    var top = _top();
    if (top && _runHandlers(top.k, top.p, true)) return true;
    return !!_act('overlayClose');
  }
  function _homeBack() {
    var now = _now();
    _cancelRearm();
    if (exitDecision(_lastBackAt, now) === 'exit') {
      // 재무장 뒤 2초 안에 다시 홈에서 뒤로: 보초에서 한 칸 더(브라우저 탭이면 이전 페이지, 설치 앱이면 다음 뒤로가 OS 종료)
      _lastBackAt = 0;
      _resting = true;
      if (_idx > 0) { _traverse(0); return; }
      var h = _hist();
      if (h && typeof h.back === 'function') { try { h.back(); } catch (e) { /* 무시 */ } }
      return;
    }
    _lastBackAt = now;
    _act('toast', EXIT_MSG, EXIT_MS);
    _resting = true;
    if (_idx > 0) _traverse(0);                                   // 보초까지 내려가야 다음 뒤로가 OS 종료
    _rearmTimer = _later(_rearm, EXIT_MS);
  }

  function onPop(state) {
    if (!_inited) return;
    var landed = (state && state.nav === TAG && typeof state.i === 'number' && state.i >= 0) ? state.i : 0;
    if (_silent) { _silent.to = landed; _silentDone(); return; }
    if (landed === _idx) { _sync(); return; }                    // 움직임 없음(늦게 온 되감기 신호 등)
    if (landed > _idx) { var was = _idx; _idx = landed; _traverse(was); return; }   // 앞으로 가기는 되돌린다
    _idx = landed;
    if (_resting && _stack.length === 1) { _sync(); return; }
    if (_closeOverlay()) { _sync(); return; }
    if (_stack.length <= 1) {
      if (_act('rootBack')) { _sync(); return; }                 // 홈 위에 그려진 하위 화면 → 그 화면의 ↩
      _homeBack();
      return;
    }
    var popped = _stack.pop();
    if (_idx !== _stack.length) _sync();                          // 브라우저가 기록을 건너뛰었으면 먼저 복구
    _popping = true; _navCount = 0;
    var r;
    try { r = _runBack(popped); } catch (e) { r = null; }
    _popping = false;
    var stay = (r === 'stay') ||
      (r !== 'done' && _navCount === 0 && !_isView(popped.k) && _act('active') === popped.k);
    if (stay) {
      // 같은 화면 안의 뒤로(드릴 세션 → 허브 등)를 처리했거나 이동이 일어나지 않았다 → 그 화면 기록을 되살린다
      var t = _top();
      if (!t || t.k !== popped.k) _stack.push(popped);
    }
    _sync();
  }
  function _onPopEvent(ev) { onPop(ev ? ev.state : null); }

  // ── 공개 API ────────────────────────────────────────
  function _homeKey(opts) {
    if (opts && opts.root) return String(opts.root);
    if (_env.root) return String(_env.root);
    var J = _g('JourneyUI');
    if (J && typeof J.open === 'function') return 'screen-journey';   // M1-P3 이후 시작 화면
    return _act('active') || 'screen-journey';                          // 그 전에는 HTML의 시작 화면(screen-menu)
  }
  function init(opts) {
    var h = _hist();
    if (!h || typeof h.pushState !== 'function' || typeof h.replaceState !== 'function') return false;
    if (_inited) return true;
    _inited = true;
    var w = _win();
    if (w && typeof w.addEventListener === 'function') { w.addEventListener('popstate', _onPopEvent); _binds++; }
    try { if ('scrollRestoration' in h) h.scrollRestoration = 'manual'; } catch (e) { /* 무시 */ }
    var loc = _loc();
    var search = (loc && typeof loc.search === 'string') ? loc.search : '';
    _start = _goOf(search); _startCaptured = true;
    var root = _homeKey(opts);
    var cur = _pending; _pending = null;
    if (!cur) { var a = _act('active'); if (a && a !== root) cur = { k: a, p: null }; }
    _stack = [{ k: root, p: null }];
    _idx = 0; _resting = false; _silent = null; _queue = [];
    // 새로고침(앱 업데이트, Android 복원)이면 지금 항목이 이미 Nav 기록이다. 그 아래 예전 보초(0번)와 홈(1번)을
    // 그대로 다시 쓴다. 지금 항목을 새 보초로 바꾸면 보초가 둘이 되어 홈에서 뒤로 2회로 종료되지 않는다
    var prev = null;
    try { prev = h.state; } catch (e) { prev = null; }
    var at = (prev && prev.nav === TAG && typeof prev.i === 'number' && prev.i >= 1 && prev.i === Math.floor(prev.i) &&
      _canGo() && typeof h.length === 'number' && prev.i < h.length) ? prev.i : 0;
    if (at) {
      _idx = at;                                                  // 아래 _sync가 홈(1번)까지 조용히 되감는다
      if (_start && loc && typeof loc.pathname === 'string') _raw('replaceState', prev, loc.pathname + _stripGo(search) + (loc.hash || ''));
    } else {
      var url = '#' + root;
      // 바로가기 ?go= 는 시작 때 한 번만 쓰고 주소에서 지운다(새로고침해도 다시 실행되지 않게). path는 그대로
      if (_start && loc && typeof loc.pathname === 'string') url = loc.pathname + _stripGo(search) + '#' + root;
      _raw('replaceState', _stateOf(_stack[0], 0, { root: true }), url, '#' + root);
    }
    if (cur && cur.k !== root) _stack.push(cur);
    _sync();
    return true;
  }
  function onShow(screenId) { if (screenId) _nav(String(screenId)); }
  function _paramStr(params) {
    if (params == null) return '';
    var t = typeof params;
    if (t === 'string' || t === 'number' || t === 'boolean') return String(params);
    if (t === 'object' && params.id != null) return String(params.id);
    return '';
  }
  function view(name, params) {
    if (name == null || name === '') return;
    var ps = _paramStr(params);
    _nav('j/' + _enc(name) + (ps ? '/' + _enc(ps) : ''), params === undefined ? null : params);
  }
  // 화면 안의 ↩ 버튼용: 시스템 뒤로와 똑같이 한 단계 위로
  function back() {
    var h = _hist();
    if (_inited && _stack.length > 1 && !_silent && h && typeof h.back === 'function') {
      try { h.back(); return; } catch (e) { /* 아래 폴백 */ }
    }
    if (_act('journeyOpen')) return;
    _act('showMenu');
  }
  // 뷰를 화면 안 버튼으로 닫았을 때(예: 노드 시트 ✕) 기록에서도 조용히 걷어낸다(popstate 처리 없음).
  // name을 주면 맨 위 뷰 이름이 같을 때만. 뒤로 처리 도중(시스템 뒤로가 이미 걷어냄)에는 아무것도 안 한다
  function closeView(name) {
    if (!_inited || _popping) return;
    if (_silent) { _queue.push(function() { closeView(name); }); return; }
    var t = _top();
    if (!t || !_isView(t.k) || _stack.length <= 1) return;
    if (name != null && name !== '' && parse('#' + t.k).view !== String(name)) return;
    _stack.pop();
    _sync();
  }
  // 뒤로 동작 등록(나중 패키지: 레슨 플레이어, 극장 등). prefix는 키 그대로('screen-game') 또는 뷰('j/lesson'),
  // '*'는 떠 있는 창(모든 깊이, 홈 포함). fn(key, params, parentKey)가 false면 다음 처리로 넘긴다,
  // 'stay'면 같은 화면에 머문다. 안에서 Nav.back()을 부르지 말 것. 반환값 = 등록 해제 함수
  function setBack(prefix, fn) {
    if (!prefix || typeof fn !== 'function') return function() {};
    var h = { prefix: String(prefix), fn: fn };
    _handlers.push(h);
    return function() { var i = _handlers.indexOf(h); if (i >= 0) _handlers.splice(i, 1); };
  }
  function current() { var t = _top(); return t ? t.k : (_pending ? _pending.k : null); }

  // ── 테스트 전용 ─────────────────────────────────────
  function _reset() {
    var w = _win();
    if (_inited && w && typeof w.removeEventListener === 'function') w.removeEventListener('popstate', _onPopEvent);
    if (_silent) _cancel(_silent.timer);
    _cancelRearm();
    _cancel(_toastTimer); _toastTimer = null;
    _inited = false; _binds = 0; _stack = []; _idx = 0; _silent = null; _queue = []; _resting = false;
    _lastBackAt = 0; _gameBackAt = 0; _popping = false; _navCount = 0; _handlers = []; _pending = null;
    _start = null; _startCaptured = false; _env = {};
  }
  function _setEnv(env) { _env = env || {}; }
  function _state() {
    return { inited: _inited, binds: _binds, idx: _idx, resting: _resting, silent: !!_silent, queue: _queue.length,
      stack: _stack.map(function(e) { return e.k; }) };
  }

  var api = {
    TAG: TAG, EXIT_MS: EXIT_MS, GO: GO.slice(), EXIT_MSG: EXIT_MSG, GAME_MSG: GAME_MSG,
    init: init, onShow: onShow, view: view, back: back, parse: parse, shouldPush: shouldPush,
    exitDecision: exitDecision, startParam: startParam, onPop: onPop,
    closeView: closeView, setBack: setBack, current: current,
    _reset: _reset, _setEnv: _setEnv, _state: _state
  };
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('load', function() { init(); });
  }
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
