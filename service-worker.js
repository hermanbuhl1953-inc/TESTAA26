// Generato da build-shell: cache sigillata, mai aggiornata asset per asset.
const RELEASE = {
  "shell": "134c5bcbf87f01ae127d",
  "runtime": "./assets/shell/runtime-8f54c4eda5aa07cd20a1.js",
  "files": [
    {
      "path": "./index.html",
      "sha256": "abb06a079d5cb1d5ca8c809c5e7749e998593d2657dc8df1e0665b4212b71d7a"
    },
    {
      "path": "./app.js",
      "sha256": "8f54c4eda5aa07cd20a156775effe4db826b9c2a94d6dd5499e9e46416045fd2"
    },
    {
      "path": "./assets/shell/runtime-8f54c4eda5aa07cd20a1.js",
      "sha256": "8f54c4eda5aa07cd20a156775effe4db826b9c2a94d6dd5499e9e46416045fd2"
    },
    {
      "path": "./styles.css",
      "sha256": "3fd1f8e114427b72e8630c61f772fa688ace2120fdbe8b75f04f10b3d4861c9e"
    },
    {
      "path": "./planning.js",
      "sha256": "2f304f5c75bf1a28c2e831488200fd1134ae150bb146b8532e53eac42a27b542"
    },
    {
      "path": "./radar.js",
      "sha256": "82d6cbfa5263cfb88bb113cf09595058f0703cef1fae3196ce68acf9a2f3f139"
    },
    {
      "path": "./manifest.webmanifest",
      "sha256": "04e0037f9042cd94565bd4706a2912cf627c45f49eaf034ef8d158890d18ffec"
    },
    {
      "path": "./assets/catalog/deadlines.json",
      "sha256": "833a2cb3a2d31151b80adb225967fbc47fc70ddd7207892e539789371d3ee9e3"
    },
    {
      "path": "./assets/catalog/benefits.json",
      "sha256": "d564141a081d1d971a558022754862e9a80ff7355aa6d8b810deb1a887be916d"
    },
    {
      "path": "./assets/catalog/source-monitoring.json",
      "sha256": "65636bf11cfe3a72d06c0eaeb03154778478c823d7a67e24a6bf34516c49946a"
    },
    {
      "path": "./icons/icon.svg",
      "sha256": "1e618834b872e94a94a2de8ace0c90330fa548d3642fde5e0662bb8064eecd2a"
    },
    {
      "path": "./icons/icon-192.png",
      "sha256": "6f27ef33cacda4a4d219d6b8455bd235459ecb893aad798a9c6bcb70bcdc69e9"
    },
    {
      "path": "./icons/icon-512.png",
      "sha256": "30998c80710334d4df0b51cc8f707ccbb638d9bf5a65ca87477414978fcf2b9a"
    }
  ],
  "id": "c1699f5bf474698bfc90"
};
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
