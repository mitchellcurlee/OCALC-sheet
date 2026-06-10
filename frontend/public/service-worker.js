/* eslint-disable no-restricted-globals */

// Service Worker v2 - Simplified to avoid caching issues
// Only caches static assets, NEVER caches API responses

const STATIC_CACHE = 'poledata-static-v2';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event - cache static assets and clear old caches
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Clear ALL old caches first
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => caches.delete(name))
      );
      // Then cache static assets
      const cache = await caches.open(STATIC_CACHE);
      console.log('[SW v2] Caching static assets');
      await cache.addAll(STATIC_ASSETS);
    })()
  );
  self.skipWaiting();
});

// Activate event - claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clear any remaining old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      );
      // Take control of all clients
      await self.clients.claim();
      console.log('[SW v2] Activated and claimed clients');
    })()
  );
});

// Fetch event - ALWAYS go to network for API, cache fallback for static only
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // NEVER intercept API requests - let them go directly to network
  if (url.pathname.startsWith('/api/')) {
    return; // Don't call event.respondWith, let browser handle normally
  }

  // For static assets: network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Handle background sync (simplified)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-changes') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_REQUESTED' });
        });
      })
    );
  }
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
