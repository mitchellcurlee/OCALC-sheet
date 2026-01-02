const CACHE_NAME = 'pole-data-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => console.log('Cache install failed:', err))
  );
  self.skipWaiting();
});

// Fetch event - NEVER cache API calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip caching for API calls - always go to network
  if (url.pathname.startsWith('/api') || 
      url.hostname !== self.location.hostname ||
      event.request.method !== 'GET') {
    // For API calls, just pass through to network
    return;
  }
  
  // For static assets, try network first, then cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful GET requests for same origin
        if (response.ok && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseClone);
            });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Activate and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
