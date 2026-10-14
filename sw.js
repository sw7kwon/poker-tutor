// sw.js — 포커 튜터 서비스워커 (템플릿)
// tools/build-dist.js가 배포본을 만들 때 아래 VERSION·PRECACHE 줄의 마커를 치환한다
// (마커는 파일 전체에서 각각 정확히 1번만 나와야 하므로 주석에 그대로 적지 말 것).
//   VERSION 줄의 따옴표 마커  → 빌드 버전 문자열
//   PRECACHE 줄의 주석+[] 마커 → 런타임 파일 목록 JSON 배열
// 개발 저장소 그대로(치환 전) 서빙되면 VERSION='dev', PRECACHE=[] → 캐시 없이 네트워크 그대로 통과(무해).
// 전략: 설치 때 전체 파일을 한 번에 받아 두고(cache-first), 새 버전은 기다렸다가
//       사용자가 "새로고침"을 누를 때만 교체(skipWaiting은 메시지로만).
var VERSION = '308136c-202610141548';
if (VERSION.indexOf('__PWA') === 0) VERSION = 'dev';
var PRECACHE = ["ai/villain-profiles.js","ai/villain-tracker.js","ai/villain.js","app.js","build-info.json","css/animations.css","css/cards.css","css/history.css","css/hud.css","css/main.css","css/mobile-screens.css","css/mobile.css","css/pwa.css","css/table.css","css/thinking.css","css/touch.css","curriculum/quiz.js","curriculum/session.js","data/curriculum.js","data/equity-preflop.js","drills/drill-core.js","drills/drill-ui.js","drills/math-drill.js","drills/preflop-drill.js","engine/coach.js","engine/deck.js","engine/equity.js","engine/ev.js","engine/game-state.js","engine/gto.js","engine/hand-eval.js","engine/postflop-guide.js","engine/postflop-tables.js","engine/range.js","engine/thinking.js","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","index.html","manifest.webmanifest","pwa.js","storage.js","ui/action-bar.js","ui/animator.js","ui/backup-ui.js","ui/coach-ui.js","ui/gto-chart.js","ui/history.js","ui/hud.js","ui/mobile-ui.js","ui/table.js","ui/thinking-ui.js","ui/touch.js"];
var PREFIX = 'poker-tutor-';
var CACHE = PREFIX + VERSION;

self.addEventListener('install', function(event) {
  if (!PRECACHE.length) return;
  event.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // GitHub Pages의 HTTP 캐시(max-age=600)를 건너뛰고 서버에서 새로 받는다
      return cache.addAll(PRECACHE.map(function(u) { return new Request(u, { cache: 'reload' }); }));
    })
  );
  // skipWaiting은 하지 않는다 — 진행 중인 게임을 끊지 않도록 사용자가 토스트에서 고른다
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k.indexOf(PREFIX) === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (!PRECACHE.length || req.method !== 'GET') return;
  var scope = self.registration.scope;
  if (req.url.indexOf(scope) !== 0) return; // 같은 출처라도 다른 앱 경로(예: 같은 github.io의 다른 저장소)는 건드리지 않음
  var path = req.url.slice(scope.length).split(/[?#]/)[0];
  // 시작 주소(./)와 index.html 내비게이션은 캐시된 index.html로 → 오프라인에서도 앱이 열린다
  var key = (req.mode === 'navigate' && (path === '' || path === 'index.html')) ? './index.html' : req;
  event.respondWith(
    caches.open(CACHE).then(function(cache) {
      return cache.match(key, { ignoreSearch: true });
    }).then(function(hit) {
      return hit || fetch(req);
    })
  );
});
