import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { harness, deadline, readyState, savedState } from './harness.mjs';

// These are structural/DOM tests, not a browser layout certification.
test('Home compatta: griglia adattiva locale, colonna mobile e nessun clipping imposto', async () => {
  const css = await readFile(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.home-priorities \.radar-list \{ grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 260px\), 1fr\)\)/);
  assert.match(css, /\.home-priorities \.radar-list \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.home-priorities \.radar-card \{ min-width: 0; padding: 14px/);
  for (const rule of css.matchAll(/([^{}]*home-priorities[^{}]*)\{([^{}]*)\}/g)) {
    assert.doesNotMatch(rule[2], /(?:^|;)\s*(?:max-)?height\s*:|overflow\s*:\s*hidden|line-clamp|display\s*:\s*none/);
  }
  assert.match(css, /\.button, \.select-control \{ min-height: 44px/);
  assert.match(css, /:focus-visible \{ outline: 3px solid var\(--focus\)/);
  assert.match(css, /--page-warm: #f6f5f1/);
  assert.match(css, /--ink: #0f2740/);
});

test('Home: ordine e tre priorità, Radar completo e avvisi non ridotti a rassicurazione', () => {
  const h = harness(readyState(Array.from({ length: 6 }, (_, i) => ({ ...deadline, id: `row-${i}` }))));
  const html = h.api.renderHome();
  const headings = ['Saldo minimo previsto', 'Da gestire', 'Prossime scadenze'];
  for (let i = 1; i < headings.length; i++) assert.ok(html.indexOf(headings[i - 1]) < html.indexOf(headings[i]));
  assert.equal((html.match(/class="radar-card"/g) ?? []).length, 3);
  assert.equal((h.api.renderRadar().match(/class="radar-card"/g) ?? []).length, 6);
  assert.match(html, /Apri Radar/);
  assert.match(html, /Alcune uscite non sono incluse: il margine potrebbe risultare più alto del reale/);
  const planning = h.api.renderPlanning();
  assert.match(planning, /problemi nei dati/);
  assert.match(planning, /Come viene calcolato/);
  assert.match(harness(savedState()).api.renderHome(), /Imposta il saldo per vedere la previsione/);
});

test('Date UI civili: anno, bisestili, date impossibili e oggetti non validi senza eccezioni', () => {
  const h = harness(readyState());
  assert.equal(h.api.formatDate('2028-02-29'), '29 feb 2028');
  for (const value of [null, undefined, {}, [], 0, true, '2026-02-29', '2026-04-31', '2026-13-01', '<img src=x>']) {
    assert.equal(h.api.formatDate(value), 'Data non valida');
  }
  assert.equal(h.evaluate('formatDate(new Date(NaN))'), 'Data non valida');
  assert.equal(h.evaluate('formatDate(new Date(2026, 10, 18))'), '18 nov 2026');
});

test('Date UI identiche in UTC, Roma e New York nelle transizioni DST', () => {
  const module = new URL('./harness.mjs', import.meta.url).href;
  const script = `import { harness, readyState } from ${JSON.stringify(module)}; const h = harness(readyState()); console.log(JSON.stringify(['2026-03-29','2026-10-25','2026-11-01'].map(d => h.api.formatDate(d))));`;
  const outputs = ['UTC', 'Europe/Rome', 'America/New_York'].map(TZ => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  });
  assert.equal(outputs[0], outputs[1]); assert.equal(outputs[1], outputs[2]);
  assert.deepEqual(JSON.parse(outputs[0]), ['29 mar 2026', '25 ott 2026', '1 nov 2026']);
});

test('Microcopy: pagamento, incasso e promemoria neutro; testo utente mai riscritto', () => {
  const title = 'Documento 2026-12-01 <img src=x onerror=1>';
  const data = readyState([{ ...deadline, dueDate: '2026-12-01', title }, { ...deadline, id: 'memo', title: 'Promemoria', dueDate: '2026-12-02', amountCents: 0 }]);
  data.planner.incomes = [{ ...deadline, id: 'salary', name: 'Stipendio', dueDate: '2026-12-03' }];
  const h = harness(data);
  const html = h.api.renderHome();
  assert.match(html, /Scadenza: 1 dic 2026 · Data prevista di pagamento: 1 dic 2026/);
  assert.match(html, /Scadenza: 2 dic 2026 · Data prevista: 2 dic 2026/);
  assert.match(html, /Documento 2026-12-01 &lt;img/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(h.api.renderPlanning(), /Data prevista di incasso: 3 dic 2026/);
  assert.equal(h.api.state.deadlines[0].title, title);
  assert.equal(h.api.expectedDateLabel(true, 0), 'Data prevista di incasso');
  assert.equal(h.api.expectedDateLabel(false, 0), 'Data prevista');
});

test('Radar: date localizzate e label neutra dei promemoria senza cambiare descrizioni', () => {
  const data = readyState([{ ...deadline, id: 'memo', amountCents: 0 }]);
  const h = harness(data);
  const items = h.api.currentRadar().items;
  const html = h.api.renderRadar();
  assert.match(html, /Scadenza: 17 nov 2026 · Data prevista: 17 nov 2026/);
  for (const item of items) assert.ok(html.includes(item.description));
});

test('Rendering non muta stato, storage, chiavi ISO né valori input date', async () => {
  const h = harness(readyState());
  const before = JSON.stringify(h.api.state), storage = [...h.storage];
  h.api.renderHome(); h.api.renderRadar(); h.api.renderPlanning(); h.api.renderCalendar();
  assert.equal(JSON.stringify(h.api.state), before);
  assert.deepEqual([...h.storage], storage);
  assert.match(h.api.renderPlanning(), /name="balanceDate" type="date"[^>]*value="2026-11-01"/);
  h.click('edit-deadline', 'x@2026-11-17');
  assert.equal(h.node('#deadline-date').value, '2026-11-17');
  assert.equal(h.node('#deadline-cash-date').value, '2026-11-17');
  h.api.exportBackup();
  const backup = JSON.parse(await h.blob().text());
  assert.equal(backup.schemaVersion, 3);
  assert.equal(backup.planner.balanceDate, '2026-11-01');
  assert.equal(backup.deadlines[0].dueDate, '2026-11-17');
  const input = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(input, /id="deadline-cash-date" type="date"/);
  assert.match(input, /Data prevista di pagamento o del promemoria/);
});

test('Regressione prestazioni Radar: 1200 aperte senza lookup o rigenerazioni per segnalazione', () => {
  const h = harness(readyState([{ ...deadline, id: 'rent@monthly', dueDate: '1926-11-17', recurrenceMonths: 1, count: 1200 }]));
  const items = h.api.currentRadar().items;
  assert.equal(items.length, 1200);
  h.evaluate('globalThis.lookupCalls = 0; const originalLookup = findOccurrence; findOccurrence = (...args) => { globalThis.lookupCalls++; return originalLookup(...args); }; globalThis.seriesMapCalls = 0; const originalSeriesMap = state.deadlines.map; state.deadlines.map = function(...args) { globalThis.seriesMapCalls++; return originalSeriesMap.apply(this, args); };');
  h.resetGenerations();
  const before = JSON.stringify(h.api.state), storage = [...h.storage];
  const html = h.api.renderRadarItems(items);
  // Una scheda per serie; tutte le 1200 occorrenze restano elencate nel dettaglio, senza troncamenti.
  assert.equal((html.match(/class="radar-card"/g) ?? []).length, 1);
  assert.equal((html.match(/Data prevista di pagamento:/g) ?? []).length, 1200);
  assert.equal((html.match(/<li><span>Scadenza:/g) ?? []).length, 1200);
  assert.equal(h.evaluate('lookupCalls'), 0, 'Il renderer non deve cercare ogni occorrenza');
  assert.equal(h.evaluate('seriesMapCalls'), 1, 'Una sola indicizzazione delle serie per rendering');
  assert.deepEqual(h.generationStats, { calls: 0, occurrences: 0 }, 'Le etichette non devono rigenerare serie');
  assert.equal(JSON.stringify(h.api.state), before); assert.deepEqual([...h.storage], storage);
});

test('Etichette Radar: importi singoli, override zero, identificativi con @ e fallback neutro', () => {
  const data = readyState([
    { ...deadline, id: 'payment@series', dueDate: '2026-10-17', recurrenceMonths: 1, count: 2, overrides: { '2026-10-17': { amountCents: 0 } } },
    { ...deadline, id: 'memo', amountCents: 0, overrides: { '2026-11-17': { amountCents: 20000 } } },
  ]);
  data.planner.incomes = [{ ...deadline, id: 'income', name: 'Incasso' }];
  const h = harness(data), items = h.api.currentRadar().items;
  h.resetGenerations();
  for (const [id, label] of [
    ['payment@series@2026-10-17', 'Data prevista'],
    ['payment@series@2026-11-17', 'Data prevista di pagamento'],
    ['memo@2026-11-17', 'Data prevista di pagamento'],
    ['income@2026-11-17', 'Data prevista di incasso'],
  ]) {
    const item = items.find(i => i.occurrenceId === id);
    assert.ok(item, id);
    assert.match(h.api.renderRadarItems([item]), new RegExp(` · ${label}:`));
  }
  const unknown = { ...items.find(i => !i.income), occurrenceId: 'absent@2026-11-17' };
  assert.match(h.api.renderRadarItems([unknown]), / · Data prevista:/);
  const noKey = { ...unknown, occurrenceId: 'absent' };
  assert.match(h.api.renderRadarItems([noKey]), / · Data prevista:/);
  assert.deepEqual(h.generationStats, { calls: 0, occurrences: 0 });
});

test('Rendering viste: Home, Agenda, Radar e Planning non aggiungono generazioni per etichette', () => {
  const h = harness(readyState([{ ...deadline, dueDate: '1926-11-17', recurrenceMonths: 1, count: 1200 }]));
  h.evaluate('globalThis.lookupCalls = 0; findOccurrence = () => { globalThis.lookupCalls++; throw new Error("Lookup vietato nel rendering"); };');
  for (const [render, calls, generated] of [
    ['renderHome', 1, 1200], ['renderCalendar', 1, 1200], ['renderRadar', 0, 0], ['renderPlanning', 0, 0],
  ]) {
    h.resetGenerations();
    const html = h.api[render]();
    assert.ok(html.length > 0);
    assert.deepEqual(h.generationStats, { calls, occurrences: generated }, render);
  }
  assert.equal(h.evaluate('lookupCalls'), 0);
});
