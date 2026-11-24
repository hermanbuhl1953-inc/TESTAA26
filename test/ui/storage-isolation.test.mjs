import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { harness, readyState, deadline } from './harness.mjs';
const current = 'scadenzario.pwa.v3', legacy = 'scadenzario.pwa.v1';
const initial = () => readyState([{ ...deadline, dueDate: '2026-11-20', recurrenceMonths: 1, count: 3 }]);
const sourceV2 = await readFile(new URL('./fixtures/legacy-persist-v2.js', import.meta.url), 'utf8');
function legacyTab(storage) {
  const context = vm.createContext({ state: JSON.parse(storage.get(legacy)), SCHEMA_VERSION: 2, STORAGE_KEY: legacy,
    localStorage: { setItem: (key, value) => storage.set(key, value) } });
  vm.runInContext(sourceV2 + '\nglobalThis.saveProfile = name => { state.profile = { ...state.profile, name, type: "single" }; persist(); };', context);
  return context;
}
function mutex() {
  let tail = Promise.resolve();
  return { request(name, options, action) { const result = tail.then(action); tail = result.catch(() => {}); return result; }, flush: () => tail };
}
const pay = h => {
  h.click('record-deadline', 'x@2026-11-20'); h.node('#movement-amount').value = '123,45'; h.node('#movement-date').value = '2026-11-18';
  h.api.handleSubmit({ target: { id: 'movement-form', dataset: h.node('#movement-form').dataset }, preventDefault() {} });
};

test('archivio: migrazione una tantum conserva v2 byte per byte e reload usa la revisione v3', () => {
  const old = JSON.stringify(initial()), storage = new Map([[legacy, old]]), h = harness(null, { storage });
  assert.equal(storage.get(legacy), old); assert.equal(JSON.parse(storage.get(current)).storageRevision, 1);
  pay(h); const saved = storage.get(current); assert.equal(JSON.parse(saved).storageRevision, 2);
  const reload = harness(null, { storage }); assert.equal(reload.api.findOccurrence('x@2026-11-20').actual.amountCents, 12345);
  assert.equal(reload.evaluate('storageRevision'), 2); assert.equal(storage.get(current), saved); assert.equal(storage.get(legacy), old);
});
test('probe due VM: writer v2 modifica profilo dopo pagamento v3 senza cancellare actual/regole/snapshot', () => {
  const storage = new Map([[legacy, JSON.stringify(initial())]]), old = legacyTab(storage), fresh = harness(null, { storage });
  pay(fresh); fresh.click('cancel-occurrence', 'x@2026-12-20'); fresh.click('edit-series', 'x');
  fresh.node('#deadline-date').value = '2026-11-01'; fresh.node('#deadline-rule-kind').value = 'weekday'; fresh.node('#deadline-ordinal').value = '1'; fresh.node('#deadline-weekday').value = '3';
  fresh.api.handleDeadlineSubmit({ preventDefault() {} });
  const protectedData = storage.get(current); old.saveProfile('Profilo della vecchia scheda');
  assert.equal(JSON.parse(storage.get(legacy)).schemaVersion, 2); assert.equal(JSON.parse(storage.get(legacy)).deadlines[0].overrides['2026-11-20'], undefined);
  assert.equal(storage.get(current), protectedData);
  const reload = harness(null, { storage });
  assert.equal(reload.api.findOccurrence('x@2026-11-20').actual.amountCents, 12345);
  assert.equal(reload.api.findOccurrence('x@2026-12-20').cancelled, true);
  assert.equal(reload.api.state.deadlines[0].monthlyRule.kind, 'weekday'); assert.ok(reload.api.state.deadlines[0].snapshots['2026-11-20']);
  assert.equal(reload.api.state.profile.name, 'Test');
});
test('migrazione v1 e preesistente schema3 nella chiave legacy, senza ricostruire pagamenti', () => {
  const v1 = { ...initial(), schemaVersion: 1 }; const storage = new Map([[legacy, JSON.stringify(v1)]]);
  const h = harness(null, { storage }); assert.equal(h.api.state.planner.ready, false); assert.equal(JSON.parse(storage.get(current)).schemaVersion, 3);
  assert.equal(storage.get(legacy), JSON.stringify(v1));
  const previousCandidate = JSON.parse(storage.get(current)); delete previousCandidate.storageRevision;
  const migrated = new Map([[legacy, JSON.stringify(previousCandidate)]]); harness(null, { storage: migrated });
  assert.equal(JSON.parse(migrated.get(current)).storageRevision, 1); assert.equal(migrated.get(legacy), JSON.stringify(previousCandidate));
});
test('v3 corrotta presente: errore esplicito, mai fallback v2 o sovrascrittura automatica', () => {
  for (const corrupt of ['{', 'null', JSON.stringify({ ...initial(), schemaVersion: 3 }), JSON.stringify({ ...initial(), schemaVersion: 3, storageRevision: '1' }), JSON.stringify({ ...initial(), schemaVersion: 3, storageRevision: 1, planner: {} })]) {
    const old = JSON.stringify(initial()), storage = new Map([[legacy, old], [current, corrupt]]), h = harness(null, { storage });
    assert.match(h.node('#app').innerHTML, /Non riesco ad aprire i dati/); assert.equal(h.api.state.deadlines.length, 0);
    assert.equal(storage.get(current), corrupt); assert.equal(storage.get(legacy), old);
  }
});
test('v3 corrotta: ripristino soltanto da backup valido e confermato, v2 intatta', async () => {
  const old = JSON.stringify(initial()), storage = new Map([[legacy, old], [current, '{']]), h = harness(null, { storage });
  const backup = { ...initial(), app: 'Scadenzario', schemaVersion: 3 };
  await h.api.restoreBackup({ size: 2000, text: async () => JSON.stringify(backup) });
  assert.equal(JSON.parse(storage.get(current)).storageRevision, 1); assert.equal(h.api.state.deadlines.length, 1); assert.equal(storage.get(legacy), old);
});
test('due migratori concorrenti: uno crea v3, il secondo non la sovrascrive', async () => {
  const storage = new Map([[legacy, JSON.stringify(initial())]]), locks = mutex();
  const first = harness(null, { storage, locks }), second = harness(null, { storage, locks });
  await locks.flush(); const value = storage.get(current);
  assert.equal(JSON.parse(value).storageRevision, 1); assert.equal(first.evaluate('storageBlocked'), false); assert.equal(second.evaluate('storageBlocked'), true);
  assert.match(second.evaluate('storageNotice.textContent + storageNotice.innerHTML'), /già creato/);
  assert.equal(storage.get(current), value);
});
test('concorrenza reale asincrona: due commit in coda, uno solo salva e lo stale conserva draft', async () => {
  const storage = new Map([[legacy, JSON.stringify(initial())]]); harness(null, { storage }); const locks = mutex();
  const a = harness(null, { storage, locks }), b = harness(null, { storage, locks });
  const result = await Promise.all([
    a.api.commit(() => { a.api.state.profile.name = 'Prima modifica'; }, ''),
    b.api.commit(() => { b.api.state.profile.name = 'Seconda modifica locale'; }, ''),
  ]);
  assert.deepEqual(result, [true, false]); assert.equal(JSON.parse(storage.get(current)).profile.name, 'Prima modifica');
  assert.equal(JSON.parse(storage.get(current)).storageRevision, 2); assert.equal(b.api.state.profile.name, 'Test');
  assert.equal(b.evaluate('conflictDraft.profile.name'), 'Seconda modifica locale');
  b.click('export-conflict'); const draft = JSON.parse(await b.blob().text()); assert.equal(draft.conflictDraft, true); assert.equal(draft.profile.name, 'Seconda modifica locale');
});
test('scheda stale: form profilo resta aperto, input conservato e avviso italiano persistente', async () => {
  const storage = new Map([[legacy, JSON.stringify(initial())]]); harness(null, { storage }); const locks = mutex();
  const a = harness(null, { storage, locks }), b = harness(null, { storage, locks });
  await a.api.commit(() => { a.api.state.profile.name = 'Aggiornata'; }, '');
  b.node('#profile-dialog').showModal(); b.node('#profile-name').value = 'Draft nel campo'; b.node('#profile-type').value = 'single'; b.submit('profile-form', {});
  await locks.flush(); await Promise.resolve();
  assert.equal(b.node('#profile-dialog').open, true); assert.equal(b.node('#profile-name').value, 'Draft nel campo'); assert.match(b.node('#profile-error').textContent, /altra scheda|altra|recenti/);
  assert.equal(JSON.parse(storage.get(current)).profile.name, 'Aggiornata');
});
test('storage event blocca subito, persino se il nuovo dato è corrotto o rimosso', () => {
  const fresh = harness(initial()); fresh.storageEvent('evento in ritardo'); assert.equal(fresh.evaluate('storageBlocked'), false);
  for (const updated of ['{', null]) {
    const storage = new Map([[legacy, JSON.stringify(initial())]]), h = harness(null, { storage });
    if (updated === null) storage.delete(current); else storage.set(current, updated);
    h.storageEvent(updated); const previous = h.api.state.profile.name;
    assert.equal(h.api.commit(() => { h.api.state.profile.name = 'Non salvata'; }, ''), false);
    assert.equal(storage.get(current), updated ?? undefined); assert.equal(h.api.state.profile.name, previous); assert.equal(h.evaluate('storageBlocked'), true);
  }
});
test('promemoria stale: né persist fuori lock né notifiche o revisioni fantasma', () => {
  const data = initial(); data.deadlines[0].dueDate = '2026-11-19'; data.deadlines[0].reminderDays = [1];
  const storage = new Map([[legacy, JSON.stringify(data)]]), a = harness(null, { storage }), b = harness(null, { storage });
  a.api.commit(() => { a.api.state.profile.name = 'Nuova'; }, ''); const value = storage.get(current);
  b.evaluate('window.Notification = Notification; state.notificationsEnabled = true;'); b.api.checkReminders();
  assert.equal(storage.get(current), value); assert.equal(b.notifications.length, 0); assert.equal(b.api.state.notifiedKeys.length, 0);
  assert.throws(() => b.api.persist(), /blocco esclusivo/);
});
test('promemoria nel lock: nessuna revisione o render per polling senza nuovi avvisi', () => {
  const data = initial(); data.deadlines[0].dueDate = '2026-11-19'; data.deadlines[0].reminderDays = [1]; data.notificationsEnabled = true;
  const h = harness(data, { notifications: true }); assert.equal(h.notifications.length, 1);
  const value = h.storage.get(current), html = h.node('#app').innerHTML; h.api.checkReminders();
  assert.equal(h.storage.get(current), value); assert.equal(h.node('#app').innerHTML, html); assert.equal(h.notifications.length, 1);
});
test('rollback quota durante migrazione e commit asincrono: nessuna chiave legacy alterata', async () => {
  const data = JSON.stringify(initial()), storage = new Map([[legacy, data]]), failed = harness(null, { storage, failStorage: true });
  assert.equal(storage.has(current), false); assert.equal(storage.get(legacy), data); assert.equal(failed.evaluate('storageBlocked'), true);
  const locks = mutex(), h = harness(null, { storage, locks }); await locks.flush(); const value = storage.get(current);
  h.failStorage(); const original = JSON.stringify(h.api.state);
  assert.equal(await h.api.commit(() => { h.api.state.profile.name = 'Non persistita'; }, ''), false);
  assert.equal(JSON.stringify(h.api.state), original); assert.equal(storage.get(current), value); assert.equal(storage.get(legacy), data);
});
test('assenza Web Locks: lettura/export disponibili, scritture rifiutate senza fallback racy', () => {
  const storage = new Map([[legacy, JSON.stringify(initial())]]); harness(null, { storage }); const value = storage.get(current);
  const h = harness(null, { storage, noLocks: true });
  assert.equal(h.api.commit(() => { h.api.state.profile.name = 'Non salvata'; }, ''), false);
  assert.equal(storage.get(current), value); assert.match(h.evaluate('storageNotice.innerHTML'), /browser aggiornato/);
  h.api.exportBackup(); assert.ok(h.blob());
});

test('copia conflitto include campi ancora digitati e non si importa come backup sostitutivo', async () => {
  const h = harness(initial());
  h.evaluate(`document.querySelectorAll = () => [{id:'income-form',elements:[{tagName:'INPUT',id:'draft-amount',name:'amount',type:'text',value:'123,45'}]}];`);
  h.click('export-conflict'); const text = await h.blob().text(), draft = JSON.parse(text);
  assert.equal(draft.unsavedForms[0].fields[0].value, '123,45');
  const storage = h.storage.get(current); await h.api.restoreBackup({ size: text.length, text: async () => text });
  assert.equal(h.storage.get(current), storage);
});
