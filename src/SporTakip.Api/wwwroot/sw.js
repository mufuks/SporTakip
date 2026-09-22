const CACHE_NAME = 'sportakip-shell-v2.7.5';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/css/app.css?v=2.7.5',
  '/js/app.js?v=2.7.5',
  '/js/api.js',
  '/images/compound-brand-icon.png?v=2.7.5',
  '/images/default-avatar.png?v=2.7.5',
  '/images/compound-watermark.png',
  '/images/tiger1.png',
  '/images/tiger1_badge.png',
  '/images/tiger1_white.png',
  '/images/tiger2.png',
  '/images/tiger2_badge.png',
  '/images/tiger2_white.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: Pre-cache static app shell and activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[PWA SW] Precache partial error:', err);
      });
    })
  );
});

// Activate: Purge ALL old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[PWA SW] Clearing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Smart Strategy Dispatcher
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Dynamic API calls: Network only (never cache)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Navigation & HTML: Network-first, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 3. Scripts and Styles: Network-first to prevent stale code bugs, fallback to cache
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // 4. Images & Static media: Cache-first with network fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {});
    })
  );
});
