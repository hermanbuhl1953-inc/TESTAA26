// Integrazione senza browser: DOM minimo e storage in memoria, rete sempre disabilitata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as planning from '../../planning.js';
import * as radar from '../../radar.js';

const source = (await readFile(new URL('../../app.js', import.meta.url), 'utf8')).replace(/^import .* from '\.\/planning.js';/m, 'const { SCHEMA_VERSION, emptyPlanner, migrate, occurrences, project, validateSeries, validatePlanner, setOccurrenceActual, shiftMonth } = engine;').replace(/^import .* from '\.\/radar.js';/m, 'const { buildRadar, filterAgenda, planningEnd } = radarEngine;');
const key = 'scadenzario.pwa.v1';
function harness(saved = null) {
  const nodes = new Map();
  const classes = () => ({ add() {}, remove() {}, toggle() {} });
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', textContent: '', innerHTML: '', dataset: {}, classList: classes(), setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; }, append() {}, remove() {}, click() {}, addEventListener() {}, reset() {}, querySelectorAll() { return []; }, focus() { this.focused = true; }, showModal() { this.open = true; }, close() { this.open = false; } });
    return nodes.get(selector);
  };
  const storage = new Map(saved ? [[key, JSON.stringify(saved)]] : []);
  let failStorage = false;
  let blob;
  const context = vm.createContext({
    engine: planning, radarEngine: radar,
    document: { querySelector: node, createElement: () => node(`created-${nodes.size}`), body: { append() {} }, addEventListener() {}, hidden: false },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem(k, v) { if (failStorage) throw new Error('quota esaurita'); storage.set(k, v); } },
    window: { addEventListener() {}, confirm() { return true; }, isSecureContext: false }, navigator: {},
    setTimeout() {}, clearTimeout() {}, setInterval() {}, console: { error() {} },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-18T12:00:00Z'])); } }, Intl,
    fetch: async () => { throw new Error('Rete disabilitata nel test'); },
    FormData: class { constructor(form) { this.data = form.values; } get(k) { return this.data[k] ?? null; } has(k) { return Object.hasOwn(this.data, k); } },
    Blob, URL: { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL() {} },
  });
  vm.runInContext(`${source}\nglobalThis.api = { state, persist, commit, handleSubmit, handleClick, openDeadlineForm, handleDeadlineSubmit, renderPlanning, renderCalendar, renderHome, renderRadar, renderMore, render, currentRadar, handleChange, exportBackup, restoreBackup, findOccurrence, nextSeriesCards, parseSignedCents, formatCentsForInput };`, context);
  return { api: context.api, storage, node, failStorage() { failStorage = true; }, blob: () => blob,
    submit(id, values) { context.api.handleSubmit({ target: { id, values, dataset: {} }, preventDefault() {} }); },
    click(action, id, extra = {}) { context.api.handleClick({ target: { closest: () => ({ dataset: { action, id, ...extra } }) } }); } };
}
const profile = { name: 'Test', type: 'single' };
const deadline = { id: 'x', title: 'Affitto', category: 'casa', dueDate: '2026-11-17', recurrenceMonths: 0, amountCents: 10000, reminderDays: [7], completed: false, archived: false, cashMode: 'same', cashDate: null, endDate: null, count: null, overrides: {} };
const savedState = (deadlines = [deadline]) => ({ schemaVersion: 2, profile, deadlines, planner: planning.emptyPlanner(), notificationsEnabled: false, notifiedKeys: [] });
const readyState = (deadlines = [deadline]) => {
  const data = savedState(deadlines);
  Object.assign(data.planner, { ready: true, openingBalanceCents: 50000, reserveCents: 10000, balanceDate: '2026-11-01', sameDayActualsIncluded: true });
  return data;
};

test('Home: ordine sezioni e nessuna rassicurazione statica, massimo tre schede azione', () => {
  const data = readyState(Array.from({ length: 6 }, (_, i) => ({ ...deadline, id: `item-${i}` })));
  const h = harness(data), html = h.api.renderHome();
  const headings = ['Da gestire', 'Attendibilità del piano', 'Andamento previsto', 'Prossime scadenze'];
  for (let i = 1; i < headings.length; i++) assert.ok(html.indexOf(headings[i - 1]) < html.indexOf(headings[i]));
  assert.equal((html.match(/class="radar-card"/g) ?? []).length, 3);
  assert.equal((h.api.renderRadar().match(/class="radar-card"/g) ?? []).length, 6);
  assert.match(html, /Apri Radar/); assert.doesNotMatch(html, /tutto sotto controllo|Ciao /);
});
test('Home: manca saldo, nessuna falsa previsione numerica, CTA apre campo reale', () => {
  const h = harness(savedState());
  assert.match(h.api.renderHome(), /Imposta il punto di partenza del tuo piano/);
  assert.match(h.api.renderHome(), /Previsione non calcolabile/);
  h.click('configure-plan');
  assert.match(h.node('#app').innerHTML, /id="planner-form"/);
  assert.match(h.node('#app').innerHTML, /name="openingBalance"/);
  assert.equal(h.node('#planner-form input[name="openingBalance"]').focused, true);
});
test('Home: dati mancanti e arretrati vicini ai numeri, calcolo espandibile', () => {
  const h = harness(readyState());
  const html = h.api.renderHome();
  assert.match(html, /La previsione non racconta ancora tutto/);
  assert.ok(html.indexOf('Alcune uscite non sono incluse: il margine potrebbe risultare più alto del reale.') < html.indexOf('Prima sotto riserva'));
  assert.match(html, /<summary>Come viene calcolato\?/);
  assert.match(html, /tutti inclusi nel saldo/);
  assert.match(html, /uscite prima delle entrate/);
});
test('Home: dati presenti usa messaggio condizionale e non afferma completezza', () => {
  const h = harness(readyState([{ ...deadline, dueDate: '2026-12-01' }]));
  const html = h.api.renderHome();
  assert.match(html, /Previsione basata sui movimenti inseriti. Le spese non registrate non sono considerate./);
  assert.doesNotMatch(html, /La previsione non racconta ancora tutto/);
});
test('Home: prima futura della serie non nascosta da occorrenza arretrata', () => {
  const h = harness(readyState([{ ...deadline, dueDate: '2026-11-01', recurrenceMonths: 1, count: 3 }]));
  const list = h.api.renderHome().split('<h2>Prossime scadenze</h2>')[1];
  assert.match(list, /Scadenza: 1 dic 2026/);
});
test('Radar DOM: pagamento risolve e annullamento riapre senza cancellare serie', () => {
  const h = harness(readyState());
  assert.match(h.api.renderRadar(), /Registra pagamento/);
  h.click('record-deadline', 'x@2026-11-17');
  assert.ok(h.node('#movement-dialog').open);
  h.node('#movement-date').value = '2026-11-17'; h.node('#movement-amount').value = '100';
  h.api.handleSubmit({ target: { id: 'movement-form', dataset: h.node('#movement-form').dataset }, preventDefault() {} });
  assert.doesNotMatch(h.api.renderRadar(), /Registra pagamento/);
  assert.equal(h.api.state.deadlines.length, 1);
  h.click('reopen-deadline', 'x@2026-11-17');
  assert.match(h.api.renderRadar(), /Registra pagamento/);
});
test('Radar DOM: entrata con scadenza futura cassa passata, aggiorna previsione e non scadenza', () => {
  const data = readyState([]);
  data.planner.incomes = [{ ...deadline, id: 'income', title: undefined, name: 'Stipendio', dueDate: '2026-12-01', cashMode: 'date', cashDate: '2026-11-17' }];
  const h = harness(data);
  assert.match(h.api.renderRadar(), /Registra incasso/);
  h.click('edit-income', 'income@2026-12-01');
  h.node('#movement-date').value = '2026-11-25'; h.node('#movement-amount').value = '200';
  h.api.handleSubmit({ target: { id: 'movement-form', dataset: h.node('#movement-form').dataset }, preventDefault() {} });
  assert.doesNotMatch(h.api.renderRadar(), /Registra incasso/);
  assert.equal(h.api.state.planner.incomes[0].dueDate, '2026-12-01');
  assert.equal(h.api.findOccurrence('income@2026-12-01', true).cashDate, '2026-11-25');
  assert.match(h.api.renderPlanning(), /Data prevista di incasso: 25 nov 2026/);
});
test('Radar DOM: incasso risolve e annullamento riapre senza doppioni', () => {
  const data = readyState([]);
  data.planner.incomes = [{ ...deadline, id: 'income', name: 'Stipendio' }];
  const h = harness(data);
  h.click('actual-income', 'income@2026-11-17');
  h.node('#movement-date').value = '2026-11-17'; h.node('#movement-amount').value = '100';
  h.api.handleSubmit({ target: { id: 'movement-form', dataset: h.node('#movement-form').dataset }, preventDefault() {} });
  assert.doesNotMatch(h.api.renderRadar(), /Registra incasso/);
  h.click('undo-income', 'income@2026-11-17');
  assert.equal((h.api.renderRadar().match(/>Registra incasso</g) ?? []).length, 1);
});
test('Radar DOM: Completa dati apre occorrenza reale con identificativo stabile', () => {
  const h = harness(readyState([{ ...deadline, dueDate: '2026-12-01', cashMode: 'unknown' }]));
  const html = h.api.renderRadar();
  assert.match(html, /data-action="edit-deadline" data-id="x@2026-12-01">Completa dati/);
  h.click('edit-deadline', 'x@2026-12-01');
  assert.ok(h.node('#deadline-dialog').open);
  assert.equal(h.node('#deadline-date').value, '2026-12-01');
});
test('Routing: desktop e mobile hanno Home Agenda Planning Altro, aria-current e vero menu', () => {
  const h = harness(readyState());
  for (const view of ['home', 'calendar', 'planning', 'more']) {
    h.click('navigate', null, { view });
    const html = h.node('#app').innerHTML;
    const desktop = html.match(/<nav class="side-nav"[\s\S]*?<\/nav>/)[0];
    const mobile = html.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)[0];
    for (const nav of [desktop, mobile]) {
      assert.deepEqual([...nav.matchAll(/data-view="([^"]+)"/g)].map(m => m[1]), ['home', 'calendar', 'planning', 'more']);
      assert.match(nav, new RegExp(`data-view="${view}" aria-current="page"`));
    }
  }
  for (const view of ['benefits', 'catalog', 'profile']) assert.match(h.api.renderMore(), new RegExp(`data-view="${view}"`));
  h.click('navigate', null, { view: 'profile' });
  assert.match(h.node('#app').innerHTML, /export-backup/); assert.match(h.node('#app').innerHTML, /choose-backup/);
});
test('Routing: Radar da Home e risultato Planning sono viste concrete', () => {
  const h = harness(readyState());
  h.click('navigate', null, { view: 'radar' });
  assert.match(h.node('#app').innerHTML, /<h1 class="page-title">Radar<\/h1>/);
  h.click('planning-results');
  assert.match(h.node('#app').innerHTML, /id="planning-results" tabindex="-1"/);
  assert.match(h.node('#app').innerHTML, /Riepilogo mensile/);
  assert.equal(h.node('#planning-results').focused, true);
});
test('Agenda DOM: Oggi e categoria non includono scadenze future; giorno cambia titolo e selezione', () => {
  const h = harness(readyState([{ ...deadline, dueDate: '2026-11-18' }, { ...deadline, id: 'future', title: 'Futuro soltanto', dueDate: '2026-11-19' }, { ...deadline, id: 'other', category: 'auto', title: 'Auto soltanto', dueDate: '2026-11-18' }]));
  h.click('navigate', null, { view: 'calendar' });
  h.api.handleChange({ target: { matches: () => true, dataset: { filter: 'category' }, value: 'casa' } });
  let list = h.api.renderCalendar().split('</details><div class="section-heading">')[1];
  assert.match(list, /<h2>Oggi<\/h2>/); assert.match(list, /Affitto/); assert.doesNotMatch(list, /Futuro soltanto|Auto soltanto/);
  h.click('select-calendar-date', null, { date: '2026-11-19' });
  list = h.api.renderCalendar().split('</details><div class="section-heading">')[1];
  assert.match(list, /Giorno selezionato: 19 nov 2026/); assert.match(list, /Futuro soltanto/); assert.doesNotMatch(list, /Affitto/);
  h.click('agenda-period', null, { period: 'upcoming' });
  list = h.api.renderCalendar().split('</details><div class="section-heading">')[1];
  assert.match(list, /Prossime \(dopo oggi\)/); assert.doesNotMatch(list, /<h2>Oggi/);
});
test('Agenda DOM: vuoto contestuale e storico completate/archiviate ancora accessibili', () => {
  const h = harness(readyState([{ ...deadline, archived: true }]));
  assert.match(h.api.renderCalendar(), /Nessuna scadenza: Oggi/);
  h.click('agenda-period', null, { period: 'all' });
  h.api.handleChange({ target: { matches: () => true, dataset: { filter: 'status' }, value: 'archived' } });
  assert.match(h.api.renderCalendar(), /Riattiva serie/);
  h.click('restore-deadline', 'x');
  h.click('record-deadline', 'x@2026-11-17');
  h.node('#movement-date').value = '2026-11-17'; h.node('#movement-amount').value = '100';
  h.api.handleSubmit({ target: { id: 'movement-form', dataset: h.node('#movement-form').dataset }, preventDefault() {} });
  h.api.handleChange({ target: { matches: () => true, dataset: { filter: 'status' }, value: 'completed' } });
  assert.match(h.api.renderCalendar(), /Correggi effettivo/);
});
test('Agenda DOM: semantica semplice senza grid incompleta, bottoni giorno con labels', () => {
  const h = harness(readyState()); const html = h.api.renderCalendar();
  assert.doesNotMatch(html, /role="grid"|role="columnheader"/);
  assert.equal((html.match(/data-action="select-calendar-date"/g) ?? []).length, 42);
  assert.match(html, /data-action="select-calendar-date"[^>]+aria-pressed="(?:true|false)"[^>]+aria-label="[^"]+"/);
});
test('Calendario flussi: mostra entrate, uscite e minimo infragiornaliero sotto riserva', () => {
  const data = readyState([{ ...deadline, dueDate: '2026-11-20', amountCents: 40000 }]);
  data.planner.openingBalanceCents = 50000;
  data.planner.reserveCents = 15000;
  data.planner.incomes = [{
    ...deadline, id: 'salary', title: undefined, name: 'Stipendio',
    dueDate: '2026-11-20', amountCents: 30000, cashMode: 'same', cashDate: null,
  }];
  const h = harness(data);
  assert.equal(h.api.currentRadar().projection?.rows.length, 2);
  h.click('navigate', null, { view: 'calendar' });
  h.click('calendar-mode', null, { mode: 'cash' });
  assert.match(h.api.renderCalendar(), /<details class="agenda-calendar" open>/);
  h.click('select-calendar-date', null, { date: '2026-11-20' });
  const html = h.api.renderCalendar();
  assert.match(html, /Saldo a inizio giornata<\/span><strong>500,00 €/);
  assert.match(html, /Entrate · previste \/ incassate<\/span><strong>300,00 € \/ 0,00 €/);
  assert.match(html, /Uscite · previste \/ pagate<\/span><strong>400,00 € \/ 0,00 €/);
  assert.match(html, /Saldo a fine giornata<\/span><strong>400,00 €/);
  assert.match(html, /Minimo intragiornaliero prudenziale: <strong>100,00 €/);
  assert.match(html, /class="calendar-day[^"]*below-reserve/);
  assert.match(html, /Uscita prevista/);
  assert.match(html, /Entrata prevista/);
  h.click('calendar-mode', null, { mode: 'deadlines' });
  assert.match(h.api.renderCalendar(), /<details class="agenda-calendar" open>/);
});
test('Calendario flussi: effettivi sostituiscono le previsioni e dati non stimabili non mostrano zero', () => {
  const data = readyState([{
    ...deadline, dueDate: '2026-11-20', amountCents: 40000,
    overrides: { '2026-11-20': { actual: { date: '2026-11-17', amountCents: 45000 } } },
  }]);
  const h = harness(data);
  h.click('navigate', null, { view: 'calendar' });
  h.click('calendar-mode', null, { mode: 'cash' });
  h.click('select-calendar-date', null, { date: '2026-11-17' });
  let html = h.api.renderCalendar();
  assert.match(html, /Uscite · previste \/ pagate<\/span><strong>0,00 € \/ 450,00 €/);
  assert.match(html, /Pagamento effettivo/);
  assert.doesNotMatch(html, /400,00 € \/ 450,00 €/);

  const noBalance = harness(savedState());
  noBalance.click('navigate', null, { view: 'calendar' });
  noBalance.click('calendar-mode', null, { mode: 'cash' });
  html = noBalance.api.renderCalendar();
  assert.match(html, /Imposta un saldo di riferimento valido/);
  assert.doesNotMatch(html, /Saldo a fine giornata/);
});
test('Sicurezza DOM: titoli, categorie, note, id e date sono escaped nelle nuove viste', () => {
  const payload = '<img src=x onerror="globalThis.bad=1">';
  const h = harness(readyState([{ ...deadline, title: payload, notes: payload, id: 'x" onclick="evil', category: 'casa' }]));
  for (const html of [h.api.renderHome(), h.api.renderRadar(), h.api.renderCalendar(), h.api.renderPlanning()]) {
    assert.doesNotMatch(html, /<img src=x/); assert.doesNotMatch(html, /data-id="x" onclick=/);
  }
  assert.match(h.api.renderRadar(), /&lt;img src=x onerror=&quot;/);
  h.api.state.planner.balanceDate = '"><img src=x onerror="evil">';
  for (const html of [h.api.renderHome(), h.api.renderRadar(), h.api.renderPlanning()]) assert.doesNotMatch(html, /<img src=x/);
});
test('Home e Planning: nessuno zero inventato in caso di errore e dettagli calcolo disponibili', () => {
  const h = harness(readyState([]));
  h.api.state.planner.reserveCents = -1;
  assert.equal(h.api.currentRadar().projection, null);
  for (const html of [h.api.renderHome(), h.api.renderPlanning()]) {
    assert.match(html, /Previsione non calcolabile/);
    assert.match(html, /Come viene calcolato\?/);
    assert.doesNotMatch(html, /Riepilogo mensile/);
  }
});
test('Home e Planning: stesso motore e periodo effettivo, no selettori periodo decorativi', () => {
  const h = harness(readyState([{ ...deadline, dueDate: '2026-12-01' }]));
  const original = planning.project(h.api.state.planner, h.api.state.deadlines, '2026-11-18', '2027-11-01');
  assert.equal(h.api.currentRadar().projection.minimumCents, original.minimumCents);
  for (const html of [h.api.renderHome(), h.api.renderPlanning()]) {
    assert.match(html, /1 nov 2027/); assert.match(html, /400,00 €/);
  }
});
test('PWA: nuovo modulo incluso in shell, cache, build e allowlist con percorsi relativi', async () => {
  const [html, sw, server, build, app] = await Promise.all(['index.html', 'service-worker.js', 'server.mjs', 'scripts/build-pages.mjs', 'app.js'].map(file => readFile(new URL(`../../${file}`, import.meta.url), 'utf8')));
  assert.doesNotMatch(html, /id="app"[^>]*aria-live/);
  assert.match(sw, /scadenzario-shell-v12-home-refinement/);
  assert.match(sw, /'\.\/radar.js'/); assert.match(server, /'radar.js'/); assert.match(build, /'radar.js'/);
  assert.match(app, /from '\.\/radar.js'/);
  assert.doesNotMatch(app, /from '\/radar.js'/);
});
