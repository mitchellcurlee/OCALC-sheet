/* eslint-disable no-restricted-globals */

// Service Worker v3 - Full offline support
// - Static assets: network first, cache fallback (navigation falls back to cached shell)
// - Map tiles (ArcGIS): cache first (offline maps)
// - API GET: network first, cache fallback (offline viewing)
// - Writes are never intercepted (the app queues them in IndexedDB)

const STATIC_CACHE = 'poledata-static-v3';
const TILE_CACHE = 'poledata-tiles-v1';
const API_CACHE = 'poledata-api-v1';
const CURRENT_CACHES = [STATIC_CACHE, TILE_CACHE, API_CACHE];

const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(STATIC_ASSETS);
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
      console.log('[SW v3] Activated');
    })()
  );
});

// Cache-first for map tiles (opaque cross-origin responses allowed)
async function tileCacheFirst(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response('', { status: 503, statusText: 'Offline - tile not cached' });
  }
}

// Network-first for API GETs, cache fallback for offline viewing
async function apiNetworkFirst(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    return new Response(JSON.stringify({ detail: 'Offline and not cached' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Network-first for static, cache fallback (+ shell fallback for navigations)
async function staticNetworkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('/');
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Map tiles (satellite + transportation reference)
  if (url.hostname.includes('arcgisonline.com')) {
    event.respondWith(tileCacheFirst(request));
    return;
  }

  // API GETs (never cache auth endpoints)
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/api/auth/')) return;
    event.respondWith(apiNetworkFirst(request));
    return;
  }

  // Same-origin static assets / navigations
  if (url.origin === self.location.origin) {
    event.respondWith(staticNetworkFirst(request));
  }
});
