const CACHE_NAME = 'saip-pwa-v1';
const ASSETS_TO_CACHE = [
  '/mobile',
  '/manifest.json',
  '/icons/icon.svg'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network-first strategy for API and HTML, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip cross-origin requests
  if (url.origin !== location.origin && !url.origin.includes('localhost') && !url.origin.includes('saip')) {
    return;
  }
  
  // For API requests, strictly network-only
  if (url.pathname.startsWith('/api') || url.port === '8000') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse && (url.pathname.includes('/_next/static') || url.pathname.includes('/icons/'))) {
        return cachedResponse;
      }
      
      return fetch(event.request).then((response) => {
        // Cache successful GET responses for next static assets
        if (event.request.method === 'GET' && response.ok && url.pathname.includes('/_next/static')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Fallback for offline mode navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/mobile');
        }
        return new Response('Offline content not available', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
