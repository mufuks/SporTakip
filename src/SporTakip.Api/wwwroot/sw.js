const CACHE_NAME = 'sportakip-shell-v3.4.0';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/css/app.css?v=3.4.0',
  '/js/app.js?v=3.4.0',
  '/js/api.js?v=3.1.0',
  '/js/modules/state.js',
  '/js/modules/utils.js',
  '/js/modules/auth.js',
  '/js/modules/staff.js',
  '/js/modules/athlete.js',
  '/js/modules/workouts.js',
  '/js/modules/admin.js',
  '/js/modules/loader.js',
  '/views/athlete/home.html',
  '/views/athlete/sessions.html',
  '/views/athlete/workout.html',
  '/views/athlete/profile.html',
  '/views/staff/yoklama.html',
  '/views/staff/takvim.html',
  '/views/staff/dashboard.html',
  '/views/staff/uyeler.html',
  '/views/staff/kasa.html',
  '/views/staff/hakedisim.html',
  '/views/admin/superadmin.html',
  '/modals/workout-modals.html',
  '/modals/staff-modals.html',
  '/modals/member-modals.html',
  '/modals/session-modals.html',
  '/modals/admin-modals.html',
  '/modals/auth-modals.html',
  '/modals/athlete-modals.html',
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
        console.warn('[PWA SW] Precache partial warning:', err);
      });
    })
  );
});

// Activate: Purge old caches immediately & claim clients
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

// Fetch: Smart Strategy Dispatcher (App-Shell First for Instant Native App Speed)
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Dynamic API calls & Health/Ping: Network only (never cache)
  if (url.pathname.startsWith('/api/') || url.pathname === '/health' || url.pathname === '/ping') {
    return;
  }

  // 2. Navigation (Opening app / typing URL): Stale-While-Revalidate App Shell
  // Returns cached /index.html in ~5ms so the phone display never sees a white screen or spinner!
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html', { ignoreSearch: true }).then((cachedShell) => {
        // Revalidate in background to fetch latest version if online
        const networkFetch = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          }
          return networkResponse;
        }).catch(() => null);

        return cachedShell || networkFetch || caches.match('/index.html');
      })
    );
    return;
  }

  // 3. Static App Shell: Scripts (.js), Styles (.css), Views/Modals (.html), Icons/Images
  // Cache-First with Stale-While-Revalidate: Immediate 0ms local response + silent background refresh
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});
