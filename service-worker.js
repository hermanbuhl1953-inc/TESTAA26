const CACHE_NAME = 'scadenzario-shell-v7';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './assets/catalog/deadlines.json',
  './assets/catalog/benefits.json',
  './assets/catalog/source-monitoring.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('scadenzario-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(fetch(event.request).then((response) => {
    if (!response.ok) return response;
    return caches.open(CACHE_NAME)
      .then((cache) => cache.put(event.request, response.clone()).then(() => response, () => response), () => response);
  }, () => caches.match(event.request).then((cached) => {
    if (cached) return cached;
    if (event.request.mode === 'navigate') return caches.match('./index.html');
    throw new Error(`Risorsa non disponibile offline: ${requestUrl.pathname}`);
  })));
});
