// sw.js — 괴산캠핑장협회 PWA Service Worker v1
const CACHE_NAME = 'gca-pwa-v1';

// 설치 — 즉시 활성화
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 활성화 — 옛 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// fetch 처리
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 외부 도메인 (Supabase API 등) — 패스
  if (url.origin !== location.origin) return;

  // POST 등 — 패스
  if (req.method !== 'GET') return;

  // HTML — 항상 네트워크 우선 (캐시는 fallback)
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req).then(res => {
        const cached = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, cached));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./')))
    );
    return;
  }

  // JS / CSS / 이미지 — 네트워크 우선, 캐시 fallback
  event.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200) {
        const cached = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, cached));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
