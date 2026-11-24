import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, readyState } from './harness.mjs';
const key = 'scadenzario.pwa.v3';
const settle = () => new Promise(resolve => setImmediate(resolve));
function clickNested(h, button) {
  const span = h.document.createElement('span'); button.append(span);
  const event = new h.Event('click', { bubbles: true, cancelable: true });
  span.dispatchEvent(event); return event.composedPath();
}
function conflict(h) {
  const newer = JSON.parse(h.storage.get(key)); newer.storageRevision += 1; h.storage.set(key, JSON.stringify(newer));
  assert.equal(h.api.commit(() => { h.api.state.profile.name = 'Copia locale'; }, ''), false);
  return h.evaluate('storageNotice');
}

test('export locale: click reale span→button→notice→body→document raggiunge il listener una volta', async () => {
  const h = harness(readyState(), { bubblingDOM: true }); await settle(); const notice = conflict(h);
  assert.equal(notice.parentNode, h.document.body); assert.equal(h.node('#app').contains(notice), false);
  const button = notice.querySelector('[data-action="export-conflict"]'); assert.ok(button);
  const before = h.blobCount(), path = clickNested(h, button);
  assert.deepEqual(path.map(n => n.tagName), ['SPAN', 'BUTTON', 'SECTION', 'BODY', 'DOCUMENT']); assert.equal(h.blobCount(), before + 1);
  assert.equal(JSON.parse(await h.blob().text()).profile.name, 'Copia locale');
  assert.equal(h.node('#app').listeners.get('click'), undefined);
});
test('ricarica dati: pulsante esterno ad app passa dal document e produce un solo reload', async () => {
  const h = harness(readyState(), { bubblingDOM: true }); await settle(); const notice = conflict(h);
  const path = clickNested(h, notice.querySelector('[data-action="reload-storage"]'));
  assert.equal(path.at(-1), h.document); assert.equal(h.reloadCount(), 1); assert.equal(h.blobCount(), 0);
});
test('ricarica versione: click propagato invia un solo consenso al worker, reload solo dopo controllerchange', async () => {
  const listeners = new Map(), sent = [];
  const navigator = { locks: { request(name, options, action) { return action(); } }, serviceWorker: { controller: {}, addEventListener(type, fn) { listeners.set(type, fn); }, async register() { return { waiting: { postMessage(message) { sent.push(message); } }, addEventListener() {} }; } } };
  const h = harness(readyState(), { bubblingDOM: true, navigator }); await settle(); h.evaluate('window.isSecureContext = true;'); h.api.registerServiceWorker(); await settle();
  const notice = h.evaluate('updateNotice'); assert.equal(h.node('#app').contains(notice), false);
  const path = clickNested(h, notice.querySelector('[data-action="apply-shell-update"]'));
  assert.deepEqual(path.map(n => n.tagName), ['SPAN', 'BUTTON', 'SECTION', 'BODY', 'DOCUMENT']); assert.equal(sent.length, 1); assert.equal(sent[0].type, 'ACTIVATE_SHELL'); assert.equal(h.reloadCount(), 0);
  listeners.get('controllerchange')(); assert.equal(h.reloadCount(), 1);
});
test('azioni dentro app non raddoppiano dopo la delegazione comune', async () => {
  const h = harness(readyState(), { bubblingDOM: true }); await settle(); h.evaluate("currentView = 'profile'; render();");
  const button = h.node('#app').querySelector('[data-action="export-backup"]'); assert.ok(button);
  const before = h.blobCount(), path = clickNested(h, button); assert.equal(h.blobCount(), before + 1);
  assert.equal(path.includes(h.node('#app')), true); assert.equal(path.at(-1), h.document); assert.equal(JSON.parse(await h.blob().text()).app, 'Scadenzario');
});
test('chiusura dialogo esterno ad app rimane singola e separata dalle azioni', async () => {
  const h = harness(readyState(), { bubblingDOM: true }); await settle(); h.api.openDeadlineForm();
  const dialog = h.node('#deadline-dialog'), button = h.document.createElement('button'); button.setAttribute('data-close-dialog', ''); dialog.append(button);
  let closed = 0; dialog.addEventListener('close', () => { closed += 1; }); const path = clickNested(h, button);
  assert.equal(path.includes(dialog), true); assert.equal(dialog.open, false); assert.equal(closed, 1); assert.equal(h.blobCount(), 0);
});
test('change reale dei controlli nel dialogo fuori app abilita regola e giorno settimanale', async () => {
  const h = harness(readyState(), { bubblingDOM: true }); await settle(); h.api.openDeadlineForm();
  const recurrence = h.node('#deadline-recurrence'); recurrence.value = '1'; const changed = new h.Event('change', { bubbles: true }); recurrence.dispatchEvent(changed);
  assert.equal(changed.composedPath().includes(h.node('#deadline-dialog')), true); assert.equal(changed.composedPath().at(-1), h.document); assert.equal(h.node('#deadline-pattern-fields').hidden, false);
  const kind = h.node('#deadline-rule-kind'); kind.value = 'weekday'; kind.dispatchEvent(new h.Event('change', { bubbles: true }));
  assert.equal(h.node('#deadline-weekday-fields').hidden, false); assert.equal(h.node('#deadline-ordinal').disabled, false); assert.equal(h.node('#deadline-day').disabled, true);
});
