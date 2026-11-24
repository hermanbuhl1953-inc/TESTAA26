import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, deadline, readyState } from './harness.mjs';
const key = 'scadenzario.pwa.v3';
const settle = () => new Promise(resolve => setImmediate(resolve));
function gate() {
  const queue = [];
  return { request(name, options, action) { return new Promise((resolve, reject) => queue.push({ action, resolve, reject })); },
    get count() { return queue.length; }, async next() { const job = queue.shift(); assert.ok(job, 'lock in attesa'); try { job.resolve(job.action()); } catch (error) { job.reject(error); } await settle(); } };
}
function sample() {
  const a = { ...deadline, id: 'a', title: 'Serie A', dueDate: '2026-11-20', recurrenceMonths: 1, count: 4, notes: 'Nota iniziale A', reminderDays: [7], amountCents: 10000 };
  const b = { ...a, id: 'b', title: 'Serie B', dueDate: '2026-11-25', notes: 'Nota iniziale B', reminderDays: [1], amountCents: 30000 };
  const data = readyState([a, b]);
  data.planner.incomes = [a, b].map(({ title, ...s }) => ({ ...s, name: `Entrata ${s.id}` }));
  return data;
}
async function setup(data = sample(), options = {}) {
  const seed = harness(data); await settle();
  const locks = gate(), h = harness(null, { ...options, storage: new Map(seed.storage), locks }); await settle();
  return { h, locks };
}
const list = (h, income) => income ? h.api.state.planner.incomes : h.api.state.deadlines;
const submit = h => h.api.handleDeadlineSubmit({ preventDefault() {} });
const movement = h => h.api.handleSubmit({ target: h.node('#movement-form'), preventDefault() {} });
function reminder(h) { const input = h.node('#deadline-reminder-7'); input.name = 'reminder'; input.value = '7'; input.checked = true; }
function changedSeries(h) {
  h.node('#deadline-title').value = 'A salvata'; h.node('#deadline-amount').value = '200'; h.node('#deadline-date').value = '2026-11-21';
  h.node('#deadline-category').value = 'salute'; h.node('#deadline-notes').value = 'Note catturate A';
  h.node('#deadline-cash-mode').value = 'date'; h.node('#deadline-cash-date').value = '2026-11-23';
  h.node('#deadline-recurrence').value = '1'; h.node('#deadline-rule-kind').value = 'weekday'; h.node('#deadline-ordinal').value = '1'; h.node('#deadline-weekday').value = '3';
  h.node('#deadline-exclude-12').checked = true; h.node('#deadline-end-mode').value = 'count'; h.node('#deadline-count').value = '5'; reminder(h);
}
for (const [incomeA, incomeB] of [[false, false], [true, true], [false, true], [true, false]]) test(`lock trattenuto: serie ${incomeA ? 'entrata' : 'scadenza'} A non riscrive ${incomeB ? 'entrata' : 'scadenza'} B né chiude la sua bozza`, async () => {
  const { h, locks } = await setup(); const beforeB = JSON.stringify(list(h, incomeB)[1]);
  h.click(incomeA ? 'edit-income-series' : 'edit-series', 'a'); changedSeries(h); const saved = submit(h); assert.equal(locks.count, 1);
  h.node('#deadline-dialog').close(); h.click(incomeB ? 'edit-income-series' : 'edit-series', 'b');
  h.node('#deadline-title').value = 'Bozza B aperta'; h.node('#deadline-amount').value = '777'; h.node('#deadline-notes').value = 'Bozza B da conservare'; h.node('#deadline-reminder-7').checked = false;
  const epoch = h.evaluate('uiEpoch'); await locks.next(); assert.equal(await saved, true);
  const a = list(h, incomeA)[0];
  assert.equal(a[incomeA ? 'name' : 'title'], 'A salvata'); assert.equal(a.amountCents, 20000); assert.equal(a.dueDate, '2026-11-21');
  assert.equal(a.cashDate, '2026-11-23'); assert.equal(a.count, 5); assert.deepEqual([...a.excludedMonths], [12]);
  assert.equal(a.monthlyRule.weekday, 3); assert.equal(a.monthlyRule.ordinal, 1);
  if (!incomeA) { assert.equal(a.category, 'salute'); assert.equal(a.notes, 'Note catturate A'); assert.deepEqual([...a.reminderDays], [7]); }
  assert.equal(JSON.stringify(list(h, incomeB)[1]), beforeB); assert.equal(h.node('#deadline-dialog').open, true);
  assert.equal(h.node('#deadline-title').value, 'Bozza B aperta'); assert.equal(h.node('#deadline-amount').value, '777'); assert.equal(h.node('#deadline-notes').value, 'Bozza B da conservare');
  assert.equal(h.evaluate('uiEpoch'), epoch); assert.equal(h.evaluate('editingSeries.id'), 'b');
});

test('singola scadenza: target, categoria/note/promemoria catturati prima del lock', async () => {
  const { h, locks } = await setup(); h.click('edit-deadline', 'a@2026-11-20');
  h.node('#deadline-title').value = 'Singola A'; h.node('#deadline-category').value = 'salute'; h.node('#deadline-notes').value = 'Nota A'; reminder(h);
  h.node('#deadline-amount').value = '200'; h.node('#deadline-date').value = '2026-11-22'; const saved = submit(h);
  h.node('#deadline-dialog').close(); h.click('edit-deadline', 'b@2026-11-25'); h.node('#deadline-title').value = 'Bozza B'; h.node('#deadline-category').value = 'auto'; h.node('#deadline-notes').value = 'Nota B'; h.node('#deadline-reminder-7').checked = false;
  await locks.next(); assert.equal(await saved, true);
  const a = h.api.findOccurrence('a@2026-11-20'); assert.equal(a.title, 'Singola A'); assert.equal(a.category, 'salute'); assert.equal(a.notes, 'Nota A'); assert.equal(a.amountCents, 20000); assert.equal(a.dueDate, '2026-11-22'); assert.deepEqual([...a.reminderDays], [7]);
  assert.equal(h.api.state.deadlines[1].overrides['2026-11-25'], undefined); assert.equal(h.node('#deadline-dialog').open, true); assert.equal(h.node('#deadline-title').value, 'Bozza B');
});
test('stessa sessione: input modificati in attesa non vengono chiusi; reinvio duplicato bloccato senza disabilitare campi', async () => {
  const { h, locks } = await setup(); h.click('edit-series', 'a'); h.node('#deadline-amount').value = '200'; const first = submit(h);
  h.node('#deadline-amount').value = '300'; assert.equal(submit(h), undefined); assert.equal(locks.count, 1);
  await locks.next(); assert.equal(await first, true); assert.equal(h.api.state.deadlines[0].amountCents, 20000);
  assert.equal(h.node('#deadline-dialog').open, true); assert.equal(h.node('#deadline-amount').value, '300'); assert.notEqual(h.node('#deadline-amount').disabled, true);
  const second = submit(h); await locks.next(); assert.equal(await second, true); assert.equal(h.api.state.deadlines[0].amountCents, 30000); assert.equal(h.node('#deadline-dialog').open, false);
});
test('nuova scadenza A in attesa e nuova bozza B: salva solo A, non chiude B', async () => {
  const { h, locks } = await setup(); h.api.openDeadlineForm(); h.node('#deadline-title').value = 'Nuova A'; h.node('#deadline-amount').value = '200'; h.node('#deadline-date').value = '2026-11-20'; const saved = submit(h);
  h.node('#deadline-dialog').close(); h.api.openDeadlineForm(); h.node('#deadline-title').value = 'Nuova B non inviata'; h.node('#deadline-amount').value = '800';
  await locks.next(); assert.equal(await saved, true); assert.ok(h.api.state.deadlines.some(s => s.title === 'Nuova A' && s.amountCents === 20000)); assert.ok(!h.api.state.deadlines.some(s => s.title.includes('non inviata')));
  assert.equal(h.node('#deadline-dialog').open, true); assert.equal(h.node('#deadline-title').value, 'Nuova B non inviata');
});
for (const forecast of [false, true]) test(`movimento ${forecast ? 'previsione entrata' : 'pagamento'} A non cambia destinatario/modo quando viene aperto B`, async () => {
  const { h, locks } = await setup(); h.click(forecast ? 'edit-income' : 'record-deadline', 'a@2026-11-20');
  h.node('#movement-amount').value = '200'; h.node('#movement-cash-mode').value = 'date'; h.node('#movement-date').value = forecast ? '2026-11-23' : '2026-11-18'; const saved = movement(h);
  h.node('#movement-dialog').close(); h.click(forecast ? 'record-deadline' : 'actual-income', 'b@2026-11-25'); h.node('#movement-amount').value = '900'; h.node('#movement-date').value = '2026-11-17';
  await locks.next(); assert.equal(await saved, true);
  const a = list(h, forecast)[0].overrides['2026-11-20'];
  if (forecast) { assert.equal(a.amountCents, 20000); assert.equal(a.cashMode, 'date'); assert.equal(a.cashDate, '2026-11-23'); assert.equal(a.actual, undefined); }
  else { assert.equal(a.actual.amountCents, 20000); assert.equal(a.actual.date, '2026-11-18'); }
  assert.equal(list(h, !forecast)[1].overrides['2026-11-25'], undefined); assert.equal(h.node('#movement-dialog').open, true); assert.equal(h.node('#movement-amount').value, '900');
});
test('profilo riaperto: salva payload A ma non chiude o modifica bozza B', async () => {
  const { h, locks } = await setup(); h.click('open-profile-dialog'); h.node('#profile-name').value = 'Nome A'; h.node('#profile-type').value = 'single'; const saved = h.submit('profile-form', {});
  h.node('#profile-dialog').close(); h.click('open-profile-dialog'); h.node('#profile-name').value = 'Nome B in bozza'; await locks.next(); assert.equal(await saved, true);
  assert.equal(h.api.state.profile.name, 'Nome A'); assert.equal(h.node('#profile-dialog').open, true); assert.equal(h.node('#profile-name').value, 'Nome B in bozza');
});
test('errore storage del salvataggio A non riempie gli errori della nuova finestra B', async () => {
  const { h, locks } = await setup(); const original = h.storage.get(key);
  h.click('edit-series', 'a'); h.node('#deadline-amount').value = '200'; const saved = submit(h);
  h.node('#deadline-dialog').close(); h.click('edit-income-series', 'b'); h.node('#deadline-title').value = 'Bozza B'; h.failStorage(); await locks.next(); assert.equal(await saved, false);
  assert.equal(h.storage.get(key), original); assert.equal(h.node('#deadline-title').value, 'Bozza B'); assert.equal(h.node('#deadline-error').textContent, ''); assert.equal(h.node('#deadline-dialog').open, true);
});
test('nuova entrata: payload completo catturato, la bozza inline successiva non è ricreata al completamento', async () => {
  const { h, locks } = await setup(); h.click('navigate', null, { view: 'planning' });
  const field = h.node('#income-name'); field.value = 'Entrata A'; field.name = 'name';
  h.node('#income-recurrence').value = '1'; h.node('#income-rule-kind').value = 'day'; h.node('#income-day').value = '20'; h.node('#income-exclude-12').checked = true;
  const values = { name: 'Entrata A', amount: '200', date: '2026-11-20', months: '1', endMode: 'count', count: '3' }; const saved = h.submit('income-form', values);
  field.value = 'Entrata B da conservare'; values.name = 'Mutazione tardiva'; values.amount = '999'; h.node('#income-day').value = '25'; h.node('#income-exclude-12').checked = false;
  const epoch = h.evaluate('uiEpoch'); await locks.next(); assert.equal(await saved, true);
  const entry = h.api.state.planner.incomes.at(-1); assert.equal(entry.name, 'Entrata A'); assert.equal(entry.amountCents, 20000); assert.equal(entry.monthlyRule.day, 20); assert.deepEqual([...entry.excludedMonths], [12]);
  assert.equal(field.value, 'Entrata B da conservare'); assert.equal(h.evaluate('uiEpoch'), epoch);
});
test('saldo: cattura valori, conserva entrate e non ricrea moduli editati durante attesa', async () => {
  const { h, locks } = await setup(); h.click('navigate', null, { view: 'planning' });
  const field = h.node('#planner-opening'); field.name = 'openingBalance'; field.value = '1000';
  const values = { openingBalance: '1000', reserve: '100', balanceDate: '2026-11-10', sameDay: 'excluded' }; const saved = h.submit('planner-form', values);
  values.openingBalance = '2000'; values.balanceDate = '2026-11-01'; field.value = '2000'; const epoch = h.evaluate('uiEpoch'); await locks.next(); assert.equal(await saved, true);
  assert.equal(h.api.state.planner.openingBalanceCents, 100000); assert.equal(h.api.state.planner.balanceDate, '2026-11-10'); assert.equal(h.api.state.planner.sameDayActualsIncluded, false); assert.equal(h.api.state.planner.incomes.length, 2);
  assert.equal(field.value, '2000'); assert.equal(h.evaluate('uiEpoch'), epoch);
});
test('annullamento e archiviazione mantengono il bersaglio anche se cambia la finestra aperta', async () => {
  const { h, locks } = await setup(); h.click('cancel-occurrence', 'a@2026-11-20'); h.click('edit-income-series', 'b'); h.node('#deadline-title').value = 'Bozza B'; await locks.next();
  assert.equal(h.api.findOccurrence('a@2026-11-20').cancelled, true); assert.equal(h.api.state.planner.incomes[1].overrides['2026-11-25'], undefined); assert.equal(h.node('#deadline-title').value, 'Bozza B'); assert.equal(h.node('#deadline-dialog').open, true);
  h.click('archive-deadline', 'b@2026-11-25'); h.node('#deadline-title').value = 'Bozza B ancora aperta'; await locks.next(); assert.equal(h.api.state.deadlines[1].archived, true); assert.equal(h.node('#deadline-title').value, 'Bozza B ancora aperta');
});
function backup(title, amount = 70000) { const data = sample(); data.deadlines[0].title = title; data.deadlines[0].amountCents = amount; return JSON.stringify({ ...data, app: 'Scadenzario', schemaVersion: 3 }); }
const file = text => ({ size: text.length, text: async () => text });
test('due import confermati in coda: solo il più recente può sostituire l’archivio', async () => {
  const { h, locks } = await setup(); const a = h.api.restoreBackup(file(backup('Import A'))); await settle(); const b = h.api.restoreBackup(file(backup('Import B'))); await settle();
  assert.equal(locks.count, 2); await locks.next(); assert.equal(h.api.state.deadlines[0].title, 'Serie A'); await locks.next(); await Promise.all([a, b]); assert.equal(h.api.state.deadlines[0].title, 'Import B');
});
test('file letto in ordine inverso: la lettura vecchia non sostituisce import recente né pulisce il nuovo input', async () => {
  const { h, locks } = await setup(); let resolveA;
  const a = h.api.restoreBackup({ size: 1000, text: () => new Promise(resolve => { resolveA = resolve; }) });
  const b = h.api.restoreBackup(file(backup('Import B'))); await settle(); await locks.next(); await b;
  h.node('#backup-file').value = 'selezione successiva'; resolveA(backup('Import A')); await a;
  assert.equal(h.api.state.deadlines[0].title, 'Import B'); assert.equal(h.node('#backup-file').value, 'selezione successiva'); assert.equal(locks.count, 0);
});
test('import in attesa non sostituisce dati se viene aperta una nuova bozza', async () => {
  const { h, locks } = await setup(); const original = h.storage.get(key); const importing = h.api.restoreBackup(file(backup('Non applicare'))); await settle();
  h.click('edit-series', 'b'); h.node('#deadline-title').value = 'Bozza recente B'; await locks.next(); await importing;
  assert.equal(h.storage.get(key), original); assert.equal(h.node('#deadline-dialog').open, true); assert.equal(h.node('#deadline-title').value, 'Bozza recente B');
});
test('import: un salvataggio avvenuto durante lettura o attesa non viene sovrascritto', async () => {
  const { h, locks } = await setup(); let finishRead;
  const importing = h.api.restoreBackup({ size: 1000, text: () => new Promise(resolve => { finishRead = resolve; }) });
  const changed = h.api.commit(() => { h.api.state.profile.name = 'Modifica recente'; }, ''); await locks.next(); await changed;
  finishRead(backup('Non applicare')); await importing; assert.equal(h.api.state.profile.name, 'Modifica recente'); assert.equal(h.api.state.deadlines[0].title, 'Serie A'); assert.equal(locks.count, 0);
});
test('comando vecchio in coda dopo import non viene applicato al nuovo archivio con gli stessi ID', async () => {
  const { h, locks } = await setup(); h.click('edit-series', 'a'); const importing = h.api.restoreBackup(file(backup('Archivio nuovo', 70000))); await settle();
  const oldSave = submit(h); assert.equal(locks.count, 2); await locks.next(); await importing; assert.equal(h.api.state.deadlines[0].title, 'Archivio nuovo');
  await locks.next(); assert.equal(await oldSave, false); assert.equal(h.api.state.deadlines[0].title, 'Archivio nuovo'); assert.equal(h.api.state.deadlines[0].amountCents, 70000);
  assert.equal(h.evaluate('conflictDraft.deadlines[0].title'), 'Serie A'); assert.equal(h.evaluate('storageBlocked'), true);
});
test('risposta permesso notifiche vecchia non riattiva le notifiche dopo disattivazione', async () => {
  let resolvePermission; const { h, locks } = await setup(sample(), { notifications: true, requestPermission: () => new Promise(resolve => { resolvePermission = resolve; }) });
  h.evaluate('window.isSecureContext = true;'); const enabling = h.api.enableNotifications(); const disabling = h.api.disableNotifications(); await locks.next(); await disabling;
  resolvePermission('granted'); await enabling; assert.equal(h.api.state.notificationsEnabled, false); assert.equal(locks.count, 0);
});
test('promemoria in attesa usa lo stato attuale protetto dal lock, non notifica dopo disattivazione', async () => {
  const data = sample(); data.notificationsEnabled = true; data.deadlines[0].dueDate = '2026-11-19'; data.deadlines[0].reminderDays = [1];
  const { h, locks } = await setup(data); h.evaluate('window.Notification = Notification;'); const disabling = h.api.disableNotifications(); const checking = h.api.checkReminders();
  await locks.next(); await disabling; const value = h.storage.get(key); await locks.next(); await checking;
  assert.equal(h.notifications.length, 0); assert.equal(h.storage.get(key), value); assert.equal(h.api.state.notificationsEnabled, false);
});

test('snapshot immutabile non trasforma un count malformato in null/senza termine', async () => {
  const { h, locks } = await setup(); const before = h.storage.get(key); h.click('edit-series', 'a');
  h.node('#deadline-end-mode').value = 'count'; h.node('#deadline-count').value = 'non numerico'; const saved = submit(h);
  await locks.next(); assert.equal(await saved, false); assert.equal(h.storage.get(key), before); assert.equal(h.api.state.deadlines[0].count, 4); assert.equal(h.node('#deadline-dialog').open, true);
});

test('riapertura della stessa serie con campi identici: il token distingue comunque la nuova sessione', async () => {
  const { h, locks } = await setup(); h.click('edit-series', 'a'); changedSeries(h); const saved = submit(h);
  h.node('#deadline-dialog').close(); h.click('edit-series', 'a'); changedSeries(h);
  await locks.next(); assert.equal(await saved, true); assert.equal(h.api.state.deadlines[0].amountCents, 20000);
  assert.equal(h.node('#deadline-dialog').open, true); assert.equal(h.node('#deadline-title').value, 'A salvata');
});
