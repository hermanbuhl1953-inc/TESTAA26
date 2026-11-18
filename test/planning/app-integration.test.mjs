// Integrazione senza browser: DOM minimo e storage in memoria, rete sempre disabilitata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as planning from '../../planning.js';

const source = (await readFile(new URL('../../app.js', import.meta.url), 'utf8')).replace(/^import .* from '\.\/planning.js';/m, 'const { SCHEMA_VERSION, emptyPlanner, migrate, occurrences, project, validateSeries, validatePlanner, setOccurrenceActual, shiftMonth } = engine;');
const key = 'scadenzario.pwa.v1';
function harness(saved = null) {
  const nodes = new Map();
  const classes = () => ({ add() {}, remove() {}, toggle() {} });
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', textContent: '', innerHTML: '', dataset: {}, classList: classes(), setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; }, append() {}, remove() {}, click() {}, addEventListener() {}, reset() {}, querySelectorAll() { return []; }, focus() {}, showModal() { this.open = true; }, close() { this.open = false; } });
    return nodes.get(selector);
  };
  const storage = new Map(saved ? [[key, JSON.stringify(saved)]] : []);
  let failStorage = false;
  let blob;
  const context = vm.createContext({
    engine: planning,
    document: { querySelector: node, createElement: () => node(`created-${nodes.size}`), body: { append() {} }, addEventListener() {}, hidden: false },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem(k, v) { if (failStorage) throw new Error('quota esaurita'); storage.set(k, v); } },
    window: { addEventListener() {}, confirm() { return true; }, isSecureContext: false }, navigator: {},
    setTimeout() {}, clearTimeout() {}, setInterval() {}, console: { error() {} },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-18T12:00:00Z'])); } }, Intl,
    fetch: async () => { throw new Error('Rete disabilitata nel test'); },
    FormData: class { constructor(form) { this.data = form.values; } get(k) { return this.data[k] ?? null; } has(k) { return Object.hasOwn(this.data, k); } },
    Blob, URL: { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL() {} },
  });
  vm.runInContext(`${source}\nglobalThis.api = { state, persist, commit, handleSubmit, handleClick, openDeadlineForm, handleDeadlineSubmit, renderPlanning, renderCalendar, exportBackup, restoreBackup, findOccurrence, nextSeriesCards, parseSignedCents, formatCentsForInput };`, context);
  return { api: context.api, storage, node, failStorage() { failStorage = true; }, blob: () => blob,
    submit(id, values) { context.api.handleSubmit({ target: { id, values, dataset: {} }, preventDefault() {} }); },
    click(action, id) { context.api.handleClick({ target: { closest: () => ({ dataset: { action, id } }) } }); } };
}
const profile = { name: 'Test', type: 'single' };
const deadline = { id: 'x', title: 'Test <img onerror=1>', category: 'casa', dueDate: '2026-11-30', recurrenceMonths: 1, amountCents: 10000, reminderDays: [7], completed: false, archived: false, cashMode: 'same', cashDate: null, endDate: null, count: 3, overrides: {} };
const state = () => ({ schemaVersion: 2, profile, deadlines: [deadline], planner: planning.emptyPlanner(), notificationsEnabled: false, notifiedKeys: [] });
const saveBalance = h => h.submit('planner-form', { openingBalance: '1.234,50', reserve: '200', balanceDate: '2026-11-01', sameDay: 'included' });

test('integrazione: saldo e riserva salvati, ricaricamento conserva importi e scelte', () => {
  const h = harness(state()); saveBalance(h);
  const saved = JSON.parse(h.storage.get(key));
  assert.equal(saved.schemaVersion, 2); assert.equal(saved.planner.openingBalanceCents, 123450); assert.equal(saved.planner.reserveCents, 20000);
  const reload = harness(saved); assert.equal(reload.api.state.planner.balanceDate, '2026-11-01'); assert.equal(reload.api.state.planner.sameDayActualsIncluded, true);
  assert.match(reload.api.renderPlanning(), /Minimo inframensile/);
});
test('integrazione: saldo negativo e formattazione coerenti', () => {
  const h = harness(state()); assert.equal(h.api.parseSignedCents('-12,50'), -1250); assert.equal(h.api.formatCentsForInput(-1250), '-12,50');
});
test('integrazione: scelta inclusione o data futura mancanti non salvano saldo', () => {
  const h = harness(state());
  h.submit('planner-form', { openingBalance: '100', reserve: '0', balanceDate: '2026-11-01', sameDay: '' }); assert.equal(h.api.state.planner.ready, false);
  h.submit('planner-form', { openingBalance: '100', reserve: '0', balanceDate: '2026-11-19', sameDay: 'excluded' }); assert.equal(h.api.state.planner.ready, false);
});
test('integrazione: entrata persistita senza incasso automatico e senza saldo impostato', () => {
  const h = harness(state());
  h.submit('income-form', { name: 'Stipendio', amount: '1500', date: '2026-11-30', months: '1', count: '3' });
  const saved = JSON.parse(h.storage.get(key)); assert.equal(saved.planner.incomes.length, 1); assert.equal(saved.planner.incomes[0].count, 3); assert.deepEqual(saved.planner.incomes[0].overrides, {});
});
test('integrazione: effettivo dialogo collegato a previsione, correzione e annullamento', () => {
  const h = harness(state()); saveBalance(h);
  h.click('complete-deadline', 'x@2026-11-30');
  assert.equal(h.node('#movement-date').value, '');
  h.node('#movement-date').value = '2026-11-17'; h.node('#movement-amount').value = '95,20';
  h.api.handleSubmit({ target: { id: 'movement-form', dataset: h.node('#movement-form').dataset }, preventDefault() {} });
  assert.equal(h.api.state.deadlines[0].overrides['2026-11-30'].actual.amountCents, 9520); assert.equal(h.api.state.deadlines[0].dueDate, '2026-11-30');
  h.click('complete-deadline', 'x@2026-11-30'); h.node('#movement-amount').value = '99';
  h.api.handleSubmit({ target: { id: 'movement-form', dataset: h.node('#movement-form').dataset }, preventDefault() {} });
  assert.equal(h.api.state.deadlines[0].overrides['2026-11-30'].actual.amountCents, 9900);
  h.click('reopen-deadline', 'x@2026-11-30'); assert.equal(h.api.state.deadlines[0].overrides['2026-11-30'].actual, null);
});
test('integrazione: modifica singola non cambia ancora, successiva o storico effettivo', () => {
  const h = harness(state());
  h.click('edit-deadline', 'x@2026-11-30');
  h.node('#deadline-date').value = '2026-12-02'; h.node('#deadline-title').value = deadline.title;
  h.node('#deadline-amount').value = '90'; h.node('#deadline-cash-mode').value = 'date'; h.node('#deadline-cash-date').value = '2026-12-03';
  h.api.handleDeadlineSubmit({ preventDefault() {} });
  const s = h.api.state.deadlines[0];
  assert.equal(s.dueDate, '2026-11-30'); assert.equal(s.overrides['2026-11-30'].dueDate, '2026-12-02'); assert.equal(s.amountCents, 10000);
  assert.equal(h.api.findOccurrence('x@2026-12-30').dueDate, '2026-12-30');
});
test('integrazione: quota storage causa rollback di saldo ed entrate', () => {
  const h = harness(state()); h.failStorage(); saveBalance(h); assert.equal(h.api.state.planner.ready, false); assert.equal(h.storage.get(key), JSON.stringify(state()));
  h.submit('income-form', { name: 'Entrata', amount: '10', date: '2026-12-01', months: '0' }); assert.equal(h.api.state.planner.incomes.length, 0);
});
test('integrazione: esportazione e ripristino JSON comprendono planning ed effettivi', async () => {
  const h = harness(state()); saveBalance(h);
  h.api.exportBackup(); const backup = JSON.parse(await h.blob().text()); assert.equal(backup.app, 'Scadenzario'); assert.equal(backup.planner.openingBalanceCents, 123450);
  const dest = harness(state()); await dest.api.restoreBackup({ size: 2000, text: async () => JSON.stringify(backup) });
  assert.equal(dest.api.state.planner.openingBalanceCents, 123450); assert.equal(JSON.parse(dest.storage.get(key)).schemaVersion, 2);
});
test('integrazione: backup v1 migrato senza inventare cassa o effettivi', async () => {
  const h = harness(state()); const old = { app: 'Scadenzario', schemaVersion: 1, profile, deadlines: [{ ...deadline, completed: true }] };
  await h.api.restoreBackup({ size: 1000, text: async () => JSON.stringify(old) });
  assert.equal(h.api.state.deadlines[0].cashMode, 'unknown'); assert.equal(h.api.state.deadlines[0].overrides['2026-11-30'].legacyCompleted, true); assert.equal(h.api.state.planner.ready, false);
});
test('integrazione: backup invalido non sovrascrive dati', async () => {
  const h = harness(state()); await h.api.restoreBackup({ size: 1000, text: async () => '{"app":"Scadenzario","schemaVersion":99}' }); assert.equal(h.storage.get(key), JSON.stringify(state()));
});
test('sicurezza: backup v2 con data saldo malevola non viene ripristinato o persistito', async () => {
  const payload = '\"><img src=x onerror="globalThis.__planningXss=1">';
  for (const ready of [false, true]) {
    const h = harness(state());
    const previousStorage = h.storage.get(key);
    const previousState = JSON.stringify(h.api.state);
    const backup = { ...state(), app: 'Scadenzario' };
    Object.assign(backup.planner, { ready, balanceDate: payload, sameDayActualsIncluded: true });
    await h.api.restoreBackup({ size: 2000, text: async () => JSON.stringify(backup) });
    assert.equal(h.storage.get(key), previousStorage);
    assert.equal(JSON.stringify(h.api.state), previousState);
    assert.ok(!h.api.renderPlanning().includes('<img src=x'));
  }
});
test('sicurezza: rendering data saldo applica escaping anche senza validazione preventiva', () => {
  const h = harness(state());
  h.api.state.planner.balanceDate = '\"><img src=x onerror="globalThis.__planningXss=1">';
  const html = h.api.renderPlanning();
  const input = html.match(/<input name="balanceDate"[^>]*>/)?.[0];
  assert.ok(input);
  assert.ok(input.includes('value="&quot;&gt;&lt;img src=x onerror=&quot;globalThis.__planningXss=1&quot;&gt;"'));
  assert.ok(!html.includes('<img src=x'));
});
test('sicurezza: dati locali preesistenti con data saldo malevola sono rifiutati senza modificarli', () => {
  const saved = state();
  saved.planner.balanceDate = '\"><img src=x onerror="globalThis.__planningXss=1">';
  const h = harness(saved);
  assert.equal(h.storage.get(key), JSON.stringify(saved));
  assert.match(h.node('#app').innerHTML, /Non riesco ad aprire i dati/);
  assert.ok(!h.node('#app').innerHTML.includes('<img src=x'));
});
test('integrazione: output HTML effettua escaping e calendario usa occorrenze', () => {
  const h = harness(state()); saveBalance(h);
  assert.ok(!h.api.renderPlanning().includes('<img onerror=1>')); assert.match(h.api.renderPlanning(), /&lt;img onerror=1&gt;/);
  assert.equal(h.api.findOccurrence('x@2026-12-30').key, '2026-12-30'); assert.match(h.api.renderCalendar(), /Calendario/);
});
test('integrazione: promemoria senza importo si completa e riapre senza inventare pagamenti', () => {
  const saved = state(); saved.deadlines[0] = { ...deadline, amountCents: 0 };
  const h = harness(saved); h.click('complete-deadline', 'x@2026-11-30');
  assert.equal(h.api.state.deadlines[0].overrides['2026-11-30'].done, true);
  assert.equal(h.api.findOccurrence('x@2026-11-30').actual, null);
  h.click('reopen-deadline', 'x@2026-11-30'); assert.equal(h.api.findOccurrence('x@2026-11-30').completed, false);
});
test('integrazione: shell, build statica e server includono il modulo finanziario', async () => {
  const [html, sw, server, build] = await Promise.all(['index.html', 'service-worker.js', 'server.mjs', 'scripts/build-pages.mjs'].map(file => readFile(new URL(`../../${file}`, import.meta.url), 'utf8')));
  assert.match(html, /src="\.\/app.js" type="module"/);
  assert.match(sw, /'\.\/planning.js'/); assert.match(sw, /scadenzario-shell-v9-planning-fix/);
  assert.match(server, /'planning.js'/); assert.match(build, /'planning.js'/);
});
test('integrazione: home conserva scadenza oltre orizzonte e archivio si riattiva', () => {
  const saved = state(); saved.deadlines[0] = { ...deadline, dueDate: '2028-12-31', recurrenceMonths: 0 };
  const h = harness(saved); assert.equal(h.api.nextSeriesCards().length, 1);
  h.click('archive-deadline', 'x@2028-12-31'); assert.ok(h.api.state.deadlines[0].archived);
  h.click('restore-deadline', 'x'); assert.equal(h.api.state.deadlines[0].archived, false);
});
