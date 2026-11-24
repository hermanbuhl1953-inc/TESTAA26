import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { harness, readyState } from './harness.mjs';
const root = new URL('../../', import.meta.url), origin = 'https://example.test', scope = origin + '/sub/';
const read = name => readFile(new URL(name, root), 'utf8');
const [legacyWorker, worker, bundle, index, releaseText] = await Promise.all([
  read('test/ui/fixtures/service-worker-v13.js'), read('service-worker.js'), read('app.js'), read('index.html'), read('assets/shell/release.json'),
]);
const release = JSON.parse(releaseText), url = path => new URL(path, scope).href;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function cacheStorage() {
  const stores = new Map();
  const key = req => typeof req === 'string' ? req : req.url;
  const cache = entries => ({
    async put(req, response) { entries.set(key(req), response.clone()); },
    async match(req) { return entries.get(key(req))?.clone(); },
  });
  return { stores, async has(name) { return stores.has(name); }, async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) { if (!stores.has(name)) stores.set(name, new Map()); return cache(stores.get(name)); },
    async match(req) { for (const entries of stores.values()) if (entries.has(key(req))) return entries.get(key(req)).clone(); },
  };
}
function workerVM(source, caches, fetch, clients = []) {
  const handlers = {}, status = { skip: 0, claim: 0 };
  const self = { location: { origin }, registration: { scope }, addEventListener(type, handler) { handlers[type] = handler; },
    async skipWaiting() { status.skip += 1; }, clients: { async claim() { status.claim += 1; }, async matchAll() { return clients; } } };
  vm.runInNewContext(source, { self, caches, fetch, URL, Request, Response, crypto: webcrypto, console });
  return { handlers, status,
    lifecycle(type, extra = {}) { let promise; handlers[type]({ ...extra, waitUntil(value) { promise = value; } }); return promise; },
    request(path, mode = 'cors') { let promise; handlers.fetch({ request: { method: 'GET', url: url(path), mode }, respondWith(value) { promise = value; } }); return promise; },
  };
}
const releaseFetch = async req => {
  const path = new URL(req.url).pathname.replace('/sub/', '');
  return new Response(await readFile(new URL(path, root)));
};

test('probe worker BASE: app nuova da rete, planning vecchio offline, runtime collega e funziona', async () => {
  const caches = cacheStorage(), cache = await caches.open('scadenzario-shell-v13-cash-report');
  const oldPlanning = await read('test/ui/fixtures/planning-v2.js');
  assert.doesNotMatch(oldPlanning, /export function getOccurrence/);
  await cache.put(url('./app.js'), new Response('/* app legacy */')); await cache.put(url('./planning.js'), new Response(oldPlanning));
  let offline = false;
  const base = workerVM(legacyWorker, caches, async req => {
    if (!offline && req.url === url('./app.js')) return new Response(bundle);
    throw new Error('connection lost');
  });
  const loadedApp = await (await base.request('./app.js')).text(), loadedPlanning = await (await base.request('./planning.js')).text();
  assert.equal(loadedApp, bundle); assert.equal(loadedPlanning, oldPlanning); assert.doesNotMatch(loadedApp, /^import |^export /m);
  const h = harness(readyState(), { source: loadedApp, fullShell: true });
  assert.equal(h.api.state.deadlines.length, 1); assert.match(h.evaluate('document.body.innerHTML'), /id="series-edit-note"/);
  assert.match(h.node('shell-style').textContent, /\.recurrence-fields/);
  offline = true;
  const reopen = harness(null, { storage: h.storage, source: await (await base.request('./app.js')).text(), fullShell: true });
  assert.equal(reopen.api.state.deadlines.length, 1); assert.equal(reopen.evaluate('SHELL_ID'), release.shell);
});
test('prima navigazione con worker BASE: index nuova e tutte le dipendenze offline non rompono la UI', async () => {
  const caches = cacheStorage(), old = await caches.open('scadenzario-shell-v13-cash-report');
  await old.put(url('./index.html'), new Response('<html>vecchia shell</html>'));
  const base = workerVM(legacyWorker, caches, async req => { if (req.url === url('./index.html')) return new Response(index); throw new Error('offline'); });
  const loaded = await (await base.request('./index.html', 'navigate')).text();
  assert.doesNotMatch(loaded, /<script src=|<link rel="stylesheet"/);
  const inline = loaded.match(/<script type="module" data-scadenzario-runtime="[^"]+">([\s\S]*?)<\/script>/)?.[1]; assert.ok(inline);
  const h = harness(readyState(), { source: inline, fullShell: true }); assert.equal(h.api.state.deadlines.length, 1);
  const offline = workerVM(legacyWorker, caches, async () => { throw new Error('offline'); });
  assert.equal(await (await offline.request('./index.html', 'navigate')).text(), index);
});
test('release: runtime versionato identico ad app compatibilità, tutti gli hash verificabili', async () => {
  assert.equal(await read(release.runtime), bundle); assert.ok(release.runtime.includes(sha(bundle).slice(0, 20)));
  for (const file of release.files) assert.equal(sha(await readFile(new URL(file.path, root))), file.sha256, file.path);
  assert.match(index, new RegExp(`data-scadenzario-runtime="${release.shell}"`));
});
test('install atomica: errore di rete non modifica cache precedente e non attiva worker nuovo', async () => {
  const caches = cacheStorage(), old = await caches.open('scadenzario-shell-v13-cash-report'); await old.put(url('./app.js'), new Response('OLD'));
  const sw = workerVM(worker, caches, req => req.url.endsWith('styles.css') ? Promise.reject(new Error('rete interrotta')) : releaseFetch(req));
  await assert.rejects(sw.lifecycle('install'), /rete interrotta/); assert.equal(await (await old.match(url('./app.js'))).text(), 'OLD');
  assert.equal(sw.status.skip, 0); assert.equal(sw.status.claim, 0); assert.equal(caches.stores.size, 1);
});
test('install atomica: asset 200 ma vecchio/hash diverso rifiutato, nessuna shell mista', async () => {
  const caches = cacheStorage(), old = await caches.open('scadenzario-shell-v13-cash-report'); await old.put(url('./planning.js'), new Response('PLANNING OLD'));
  const sw = workerVM(worker, caches, req => req.url.endsWith('planning.js') ? Promise.resolve(new Response('PLANNING OLD')) : releaseFetch(req));
  await assert.rejects(sw.lifecycle('install'), /non coerente/); assert.equal(caches.stores.size, 1);
  assert.equal(await (await old.match(url('./planning.js'))).text(), 'PLANNING OLD');
});
test('worker nuovo: cache sigillata, consenso prima di skipWaiting, vecchie cache/client conservati', async () => {
  const caches = cacheStorage(), old = await caches.open('scadenzario-shell-v13-cash-report'); await old.put(url('./index.html'), new Response('LEGACY'));
  const messages = [], clients = [{ postMessage(value) { messages.push(value); } }];
  const sw = workerVM(worker, caches, releaseFetch, clients); await sw.lifecycle('install');
  assert.equal(sw.status.skip, 0); await sw.lifecycle('message', { data: { type: 'ACTIVATE_SHELL' } }); assert.equal(sw.status.skip, 1);
  await sw.lifecycle('activate'); assert.equal(sw.status.claim, 1); assert.equal(messages[0].type, 'SCADENZARIO_SHELL_READY');
  assert.equal(await (await old.match(url('./index.html'))).text(), 'LEGACY');
  const offline = workerVM(worker, caches, async () => { throw new Error('offline'); });
  assert.equal(await (await offline.request('./qualsiasi-pagina', 'navigate')).text(), index);
  assert.equal(await (await offline.request(release.runtime)).text(), bundle);
  assert.equal(await (await offline.request('./app.js')).text(), bundle);
});
test('worker attivo non aggiorna singoli asset da rete e API rimangono fuori dalla cache shell', async () => {
  const caches = cacheStorage(), installed = workerVM(worker, caches, releaseFetch); await installed.lifecycle('install');
  let network = 0; const active = workerVM(worker, caches, async () => { network += 1; return new Response('OTHER RELEASE'); });
  assert.equal(await (await active.request('./app.js')).text(), bundle); assert.equal(network, 0);
  assert.equal(active.request('./api/benefits'), undefined); assert.equal(network, 0);
});
test('activate senza sigillo rifiutata, non reclama i client', async () => {
  const sw = workerVM(worker, cacheStorage(), releaseFetch); await assert.rejects(sw.lifecycle('activate'), /non sigillata/); assert.equal(sw.status.claim, 0);
});
test('coordinamento client: nessun reload senza consenso, poi attivazione e un reload esplicito', async () => {
  const listeners = new Map(), sent = [], registration = { waiting: { postMessage(message) { sent.push(message); } }, addEventListener() {} };
  const navigator = { locks: { request(name, options, action) { return action(); } }, serviceWorker: {
    controller: {}, addEventListener(type, cb) { listeners.set(type, cb); }, async register() { return registration; },
  } };
  const h = harness(readyState(), { navigator }); h.evaluate('window.isSecureContext = true;'); h.api.registerServiceWorker(); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.reloadCount(), 0); assert.match(h.evaluate('updateNotice.innerHTML'), /salva o esporta/);
  listeners.get('controllerchange')(); assert.equal(h.reloadCount(), 0);
  h.click('apply-shell-update'); assert.equal(sent[0].type, 'ACTIVATE_SHELL'); assert.equal(h.reloadCount(), 0);
  listeners.get('controllerchange')(); assert.equal(h.reloadCount(), 1);
});

test('quota cache durante install: acquisizione parziale rimossa, legacy ancora disponibile', async () => {
  const caches = cacheStorage(), old = await caches.open('scadenzario-shell-v13-cash-report');
  await old.put(url('./app.js'), new Response('OLD'));
  const originalOpen = caches.open.bind(caches);
  caches.open = async name => {
    const cache = await originalOpen(name);
    if (name.startsWith('scadenzario-shell-v15-')) cache.put = async () => { throw new Error('quota cache'); };
    return cache;
  };
  const sw = workerVM(worker, caches, releaseFetch); await assert.rejects(sw.lifecycle('install'), /quota cache/);
  assert.equal(caches.stores.size, 1); assert.equal(await (await old.match(url('./app.js'))).text(), 'OLD'); assert.equal(sw.status.skip, 0);
});
