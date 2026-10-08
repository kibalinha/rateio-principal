const CACHE_NAME = 'shoprateio-v3-live';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/tailwind.min.js',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

// Install: pre-cache local assets safely without breaking if one is pending
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Pré-carregamento do cache pulado para:', url, err);
          })
        )
      );
    })
  );
});

// Activate: clean up old caches (v1, v2, etc.) and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: NETWORK FIRST for pages and navigation, bypass for Supabase APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass cache completely for Supabase, WebSocket, and non-GET requests
  if (
    url.hostname.includes('supabase.co') ||
    event.request.method !== 'GET' ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return;
  }

  // Navigation / HTML / App root: NETWORK FIRST
  if (event.request.mode === 'navigate' || event.request.destination === 'document' || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((res) => res || caches.match('/'));
        })
    );
    return;
  }

  // For other GET requests (scripts, styles, icons): Network First with Cache Fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
