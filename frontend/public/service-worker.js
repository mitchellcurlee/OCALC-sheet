/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'poledata-v1';
const STATIC_CACHE = 'poledata-static-v1';
const API_CACHE = 'poledata-api-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// API routes to cache for offline use
const CACHEABLE_API_ROUTES = [
  '/api/poles/options',
  '/api/jobs',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== API_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static assets - network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // For navigation requests, return index.html
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Handle API requests - network first with cache fallback
async function handleApiRequest(request) {
  const url = new URL(request.url);
  
  try {
    const response = await fetch(request);
    
    // Cache successful GET responses for specific routes
    if (response.ok && isCacheableRoute(url.pathname)) {
      const responseClone = response.clone();
      const cache = await caches.open(API_CACHE);
      await cache.put(request, responseClone);
    }
    
    return response;
  } catch (error) {
    // Offline - try to return cached response
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Add header to indicate this is a cached response
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-From-Cache', 'true');
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers
      });
    }
    
    // Return offline error for API calls
    return new Response(
      JSON.stringify({ 
        error: 'offline', 
        message: 'You are offline. This request has been queued.' 
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

function isCacheableRoute(pathname) {
  return CACHEABLE_API_ROUTES.some(route => pathname.startsWith(route));
}

// Handle background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-changes') {
    event.waitUntil(syncPendingChanges());
  }
});

async function syncPendingChanges() {
  // This will be handled by the frontend's sync service
  // The service worker just triggers the sync
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_REQUESTED' });
  });
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CACHE_API_RESPONSE') {
    const { url, response } = event.data;
    caches.open(API_CACHE).then((cache) => {
      cache.put(url, new Response(JSON.stringify(response)));
    });
  }
});

// Push notification support (for future use)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'New update available',
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: data.tag || 'poledata-notification'
    };
    event.waitUntil(
      self.registration.showNotification(data.title || 'Pole Data Sheet', options)
    );
  }
});
