// Generato da build-shell: cache sigillata, mai aggiornata asset per asset.
const RELEASE = __SHELL_RELEASE__;
const CACHE_NAME = `scadenzario-shell-v15-${RELEASE.id}`;
const marker = new URL('./.shell-complete', self.registration.scope).href;
const absolute = path => new URL(path, self.registration.scope).href;
const critical = new Set(RELEASE.files.map(file => absolute(file.path)));
async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Nessuna cache attiva è modificata durante fetch o verifica.
    const responses = await Promise.all(RELEASE.files.map(async file => {
      const response = await fetch(new Request(absolute(file.path), { cache: 'no-store', credentials: 'same-origin' }));
      if (!response.ok || response.type === 'opaque' || await digest(await response.clone().arrayBuffer()) !== file.sha256) throw new Error(`Shell incompleta o non coerente: ${file.path}`);
      return [absolute(file.path), response];
    }));
    const existed = await caches.has(CACHE_NAME);
    const cache = await caches.open(CACHE_NAME);
    try {
      await Promise.all(responses.map(([url, response]) => cache.put(url, response)));
      await cache.put(marker, new Response(RELEASE.id));
    } catch (error) {
      if (!existed) await caches.delete(CACHE_NAME);
      throw error;
    }
    // Il worker attende il consenso del client o la chiusura delle vecchie schede.
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_SHELL') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (await (await cache.match(marker))?.text() !== RELEASE.id) throw new Error('Shell non sigillata.');
    // Le cache precedenti restano disponibili per le schede legacy ancora aperte.
    await self.clients.claim();
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) client.postMessage({ type: 'SCADENZARIO_SHELL_READY', shell: RELEASE.shell });
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(absolute('./index.html'))).then(response => response || Promise.reject(new Error('Shell offline incompleta.'))));
  } else if (critical.has(url.href)) {
    event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(url.href)).then(response => response || Promise.reject(new Error('Asset della shell non disponibile.'))));
  } else {
    // Dati non appartenenti alla shell: nessuna sostituzione della cache sigillata.
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  }
});
