// pwa.js — 서비스워커 등록, 새 버전 토스트, 저장소 보존 요청 (A-4c 소유)
// file:// 더블클릭 실행이나 비보안(http://사설IP) 환경에서는 아무것도 등록하지 않는다 → 기존 실행 방식 그대로.
// 공개 API(window.PWA): version, build, standalone, sw, persisted, updateReady, checkUpdate(), applyUpdate()
var PWA = (function() {
  var api = {
    version: 'dev',      // 배포본이면 build-info.json의 version
    build: null,         // build-info.json 내용(배포본만)
    standalone: false,   // 홈 화면 앱으로 실행 중인지
    sw: false,           // 서비스워커 등록 여부
    persisted: null,     // 브라우저 저장소 보존(persist) 상태: true/false, 알 수 없으면 null
    updateReady: false,  // 새 버전이 받아져 대기 중인지
    checkUpdate: function() { return Promise.resolve(false); },
    applyUpdate: function() {}
  };
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof navigator === 'undefined') return api;

  api.standalone = _isStandalone();
  _initPersist();

  var canSW = typeof location !== 'undefined' && location.protocol !== 'file:' &&
    window.isSecureContext === true && 'serviceWorker' in navigator;
  if (!canSW) return api;

  var _reg = null, _waiting = null, _accepted = false, _reloading = false, _dismissed = false, _observer = null;

  api.checkUpdate = function() {
    if (!_reg) return Promise.resolve(false);
    return _reg.update().then(function() { return api.updateReady; }, function() { return api.updateReady; });
  };
  api.applyUpdate = function() {
    _accepted = true;
    // 다른 창에서 이미 새 버전이 활성화됐으면(더 이상 대기 상태가 아님) controllerchange가 다시 오지 않으므로 바로 새로고침
    if (_waiting && _waiting.state === 'installed') _waiting.postMessage({ type: 'SKIP_WAITING' });
    else _reload();
  };

  if (document.readyState === 'complete') _register();
  else window.addEventListener('load', _register);
  return api;

  function _isStandalone() {
    try {
      if (window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches ||
          window.matchMedia('(display-mode: fullscreen)').matches)) return true;
    } catch (e) { /* 무시 */ }
    return navigator.standalone === true;
  }

  function _initPersist() {
    var st = navigator.storage;
    if (!st || typeof st.persisted !== 'function') return;
    st.persisted().then(function(v) {
      api.persisted = !!v;
      // 홈 화면 앱이면 저장소 정리(축출) 대상에서 빼 달라고 요청 → 기록이 지워질 위험을 줄인다
      if (!v && api.standalone && typeof st.persist === 'function') {
        return st.persist().then(function(p) { api.persisted = !!p; });
      }
    }).catch(function() { /* 무시 */ });
  }

  function _register() {
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (_accepted) _reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function(reg) {
      _reg = reg;
      api.sw = true;
      if (reg.waiting && navigator.serviceWorker.controller) _onWaiting(reg.waiting);
      reg.addEventListener('updatefound', function() {
        var w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', function() {
          if (w.state === 'installed' && navigator.serviceWorker.controller) _onWaiting(reg.waiting || w);
        });
      });
    }).catch(function() { /* 등록 실패 = 일반 웹페이지로 동작 */ });
    // 설치형 앱은 새로 여는 일이 드물어서, 앱으로 돌아올 때마다 새 버전을 확인한다
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') api.checkUpdate();
    });
    _loadBuildInfo();
  }

  function _loadBuildInfo() {
    if (typeof fetch !== 'function') return;
    fetch('build-info.json', { cache: 'no-store' }).then(function(r) {
      return r.ok ? r.json() : null;
    }).then(function(info) {
      if (!info || typeof info.version !== 'string') return;
      api.version = info.version;
      api.build = info;
      try { window.dispatchEvent(new CustomEvent('pwa:version', { detail: info })); } catch (e) { /* 무시 */ }
    }).catch(function() { /* 개발 저장소 서빙 등 build-info 없음 = 'dev' 유지 */ });
  }

  function _onWaiting(worker) {
    if (worker !== _waiting) _dismissed = false; // [나중에] 뒤에 더 새로운 버전이 또 받아지면 다시 알린다
    _waiting = worker;
    api.updateReady = true;
    _showToast();
  }

  function _reload() {
    if (_reloading) return;
    _reloading = true;
    location.reload();
  }

  function _gameActive() {
    var g = document.getElementById('screen-game');
    return !!(g && g.classList.contains('active'));
  }

  function _showToast() {
    if (_dismissed) return;
    if (document.getElementById('pwa-update-toast')) { _syncToast(); return; }
    _injectStyle();
    var box = document.createElement('div');
    box.id = 'pwa-update-toast';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.innerHTML =
      '<div class="pwa-toast-text"><b>🔄 새 버전이 있어요</b><span>새로고침해도 기록은 그대로예요</span></div>' +
      '<button type="button" class="pwa-toast-btn pwa-toast-go">새로고침</button>' +
      '<button type="button" class="pwa-toast-btn pwa-toast-later">나중에</button>';
    box.querySelector('.pwa-toast-go').addEventListener('click', function(e) {
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = '적용 중…';
      api.applyUpdate();
    });
    box.querySelector('.pwa-toast-later').addEventListener('click', function() {
      _dismissed = true;
      if (box.parentNode) box.parentNode.removeChild(box);
    });
    document.body.appendChild(box);
    _watchGame();
    _syncToast();
  }

  // 핸드 진행 중(게임 화면)에는 숨겨 두고, 게임 화면을 벗어나면(메뉴 복귀 등) 다시 보여 준다.
  // 메뉴에서 토스트가 뜬 채로 게임에 들어가도 테이블 위를 가리지 않는다.
  function _syncToast() {
    var box = document.getElementById('pwa-update-toast');
    if (box) box.style.display = _gameActive() ? 'none' : '';
  }

  function _watchGame() {
    if (_observer || typeof MutationObserver === 'undefined') return;
    var g = document.getElementById('screen-game');
    if (!g) return;
    _observer = new MutationObserver(_syncToast);
    _observer.observe(g, { attributes: true, attributeFilter: ['class'] });
  }

  function _injectStyle() {
    if (document.getElementById('pwa-toast-style')) return;
    var st = document.createElement('style');
    st.id = 'pwa-toast-style';
    st.textContent =
      '#pwa-update-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 10px);transform:translateX(-50%);' +
      'z-index:900;width:min(calc(100vw - 24px),440px);display:flex;align-items:center;gap:8px;padding:10px 12px;' +
      'background:#161b22;color:#e6edf3;border:1px solid #d4af37;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.55);' +
      'font-family:inherit;animation:pwaToastIn .25s ease-out}' +
      '#pwa-update-toast .pwa-toast-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;line-height:1.35;word-break:keep-all}' +
      '#pwa-update-toast .pwa-toast-text b{font-size:.95rem}' +
      '#pwa-update-toast .pwa-toast-text span{font-size:.78rem;color:#8b949e}' +
      '#pwa-update-toast .pwa-toast-btn{flex:none;min-height:44px;padding:0 12px;border-radius:8px;font:inherit;font-size:.88rem;' +
      'font-weight:600;cursor:pointer;white-space:nowrap}' +
      '#pwa-update-toast .pwa-toast-go{background:#d4af37;color:#0a0e14;border:1px solid #d4af37}' +
      '#pwa-update-toast .pwa-toast-later{background:transparent;color:#8b949e;border:1px solid #30363d}' +
      '#pwa-update-toast .pwa-toast-btn:disabled{opacity:.7;cursor:default}' +
      '@keyframes pwaToastIn{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}' +
      '@media (max-width:360px){#pwa-update-toast{gap:6px;padding:8px 10px}#pwa-update-toast .pwa-toast-text b{font-size:.88rem}' +
      '#pwa-update-toast .pwa-toast-btn{padding:0 9px;font-size:.82rem}}' +
      '@media (prefers-reduced-motion:reduce){#pwa-update-toast{animation:none}}';
    document.head.appendChild(st);
  }
})();
