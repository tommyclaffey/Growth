/* Growth's service worker -- the "installable" half of the PWA (Oct 4).

   ⚠️ The classic PWA failure is a cache that keeps serving yesterday's app
   after a deploy. So: NETWORK FIRST for pages, always -- the cache is only
   what you get when there is no network at all. Built assets are hashed by
   Vite (index-AbC123.js), so caching them by URL can never serve a stale one.
   Nothing under /api is ever cached: it is live data, or it is nothing. */
const CACHE = 'growth-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icons/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return;

  /* Pages: network first, the cached shell when offline. */
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put('./', copy));
      return res;
    }).catch(() => caches.match('./')));
    return;
  }

  /* Hashed assets and icons: cache first, filled as they are used. */
  if (/\/assets\/|\/icons\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
