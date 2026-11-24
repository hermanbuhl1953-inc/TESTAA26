import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { harness, deadline, savedState, readyState } from './harness.mjs';
import { cashReport, occurrences, getOccurrence } from '../../planning.js';
const key = 'scadenzario.pwa.v3';
const recurring = (extra = {}) => ({ ...deadline, dueDate: '2026-11-20', recurrenceMonths: 1, count: 4, ...extra });
const change = (h, id, value) => {
  h.node(`#${id}`).value = value;
  h.api.handleChange({ target: { id, value, matches: () => false } });
};
const save = h => h.api.handleDeadlineSubmit({ preventDefault() {} });
const report = h => cashReport(h.api.state.planner, h.api.state.deadlines, '2026-11-01', '2026-11-30', '2026-11-18');
const keys = h => occurrences(h.api.state.deadlines, '2027-06-30').map(o => o.key);

test('UI nuova serie: giorno fisso e mesi esclusi, count non consumato e dati persistiti', () => {
  const h = harness(savedState([])); h.api.openDeadlineForm();
  h.node('#deadline-title').value = 'Rata'; h.node('#deadline-date').value = '2026-11-20';
  change(h, 'deadline-recurrence', '1');
  assert.equal(h.node('#deadline-pattern-fields').hidden, false); assert.equal(h.node('#deadline-rule-kind').disabled, false);
  h.node('#deadline-exclude-1').checked = true; h.node('#deadline-exclude-12').checked = true;
  change(h, 'deadline-end-mode', 'count'); h.node('#deadline-count').value = '3'; save(h);
  assert.deepEqual([...keys(h)], ['2026-11-20', '2027-02-20', '2027-03-20']);
  const stored = JSON.parse(h.storage.get(key));
  assert.equal(stored.schemaVersion, 3); assert.deepEqual(stored.deadlines[0].excludedMonths, [1, 12]);
  const reload = harness(stored); assert.deepEqual(keys(reload), keys(h));
  assert.match(reload.api.renderPlanning(), /esclusi: Gennaio, Dicembre/);
});
test('UI regola primo mercoledì, visibilità campi, until inclusivo e singola disabilitata', () => {
  const h = harness(savedState([])); h.api.openDeadlineForm();
  h.node('#deadline-title').value = 'Appuntamento'; h.node('#deadline-date').value = '2026-11-01';
  change(h, 'deadline-recurrence', '1'); change(h, 'deadline-rule-kind', 'weekday');
  assert.equal(h.node('#deadline-weekday-fields').hidden, false); assert.equal(h.node('#deadline-ordinal').disabled, false);
  assert.equal(h.node('#deadline-day').disabled, true);
  change(h, 'deadline-ordinal', '1'); change(h, 'deadline-weekday', '3');
  change(h, 'deadline-end-mode', 'date'); h.node('#deadline-end').value = '2027-01-06'; save(h);
  assert.deepEqual([...keys(h)], ['2026-11-04', '2026-12-02', '2027-01-06']);
  const id = h.api.state.deadlines[0].id;
  h.click('edit-deadline', `${id}@2026-12-02`);
  assert.equal(h.node('#deadline-pattern-fields').hidden, true); assert.equal(h.node('#deadline-recurrence').disabled, true);
  h.node('#deadline-date').value = '2026-12-03'; h.node('#deadline-title').value = 'Solo questa'; save(h);
  assert.equal(h.api.findOccurrence(`${id}@2026-12-02`).dueDate, '2026-12-03');
  assert.equal(h.api.findOccurrence(`${id}@2027-01-06`).dueDate, '2027-01-06');
});
test('UI giorno esplicito 31, bisestile, regola invariata durante modifica titolo', () => {
  const h = harness(savedState([])); h.api.openDeadlineForm(); h.node('#deadline-title').value = 'Fine mese';
  h.node('#deadline-date').value = '2024-01-01'; change(h, 'deadline-recurrence', '1'); h.node('#deadline-day').value = '31';
  change(h, 'deadline-end-mode', 'count'); h.node('#deadline-count').value = '3'; save(h);
  assert.deepEqual([...keys(h)], ['2024-01-31', '2024-02-29', '2024-03-31']);
  h.click('edit-series', h.api.state.deadlines[0].id); assert.equal(h.node('#deadline-day').value, '31');
  h.node('#deadline-title').value = 'Titolo diverso'; save(h);
  assert.deepEqual([...keys(h)], ['2024-01-31', '2024-02-29', '2024-03-31']);
});
test('UI modifica intera serie protegge pagamenti/eccezioni, non cambia singoli né report', () => {
  const s = recurring({ dueDate: '2026-10-20', overrides: { '2026-10-20': { actual: { date: '2026-11-05', amountCents: 12345 } }, '2026-12-20': { dueDate: '2026-12-23', amountCents: 9500 } } });
  const data = readyState([s]); data.planner.balanceDate = '2026-11-10';
  const h = harness(data); h.click('edit-series', 'x');
  assert.equal(h.node('#deadline-dialog-title').textContent, 'Modifica intera serie');
  assert.equal(h.node('#series-edit-note').hidden, false); assert.equal(h.node('#deadline-recurrence').disabled, false);
  h.node('#deadline-date').value = '2026-10-01'; h.node('#deadline-title').value = 'Nuova regola'; h.node('#deadline-amount').value = '200';
  change(h, 'deadline-rule-kind', 'weekday'); change(h, 'deadline-weekday', '3'); h.node('#deadline-exclude-12').checked = true; save(h);
  assert.equal(h.api.findOccurrence('x@2026-10-20').dueDate, '2026-10-20');
  assert.equal(h.api.findOccurrence('x@2026-10-07'), null);
  assert.equal(h.api.findOccurrence('x@2026-12-20').dueDate, '2026-12-23');
  assert.equal(h.api.findOccurrence('x@2026-11-04').amountCents, 20000);
  assert.equal(report(h).expenseActualCents, 12345); assert.equal(report(h).rows.filter(o => o.actual).length, 1);
  assert.equal(h.api.currentRadar().projection.rows.filter(o => o.actual).length, 0);
  const reload = harness(JSON.parse(h.storage.get(key)));
  assert.equal(reload.api.findOccurrence('x@2026-10-20').actual.amountCents, 12345);
});
test('UI legacy duale: modifica serie non azzera termini; scelta esplicita li rende esclusivi', () => {
  const s = recurring({ endDate: '2027-03-20', count: 2 }); const h = harness(savedState([s]));
  h.click('edit-series', 'x'); assert.equal(h.node('#deadline-end-mode').value, 'legacy');
  assert.equal(h.node('#deadline-end').disabled, true); assert.equal(h.node('#deadline-count').disabled, true);
  h.node('#deadline-title').value = 'Conserva'; save(h);
  assert.equal(h.api.state.deadlines[0].endDate, s.endDate); assert.equal(h.api.state.deadlines[0].count, 2);
  h.click('edit-series', 'x'); change(h, 'deadline-end-mode', 'count'); h.node('#deadline-count').value = '3'; save(h);
  assert.equal(h.api.state.deadlines[0].endDate, null); assert.equal(h.api.state.deadlines[0].count, 3);
});
test('UI annulla/ripristina: esclude report, proiezione e Radar, non aggiunge rata finale', () => {
  const s = recurring({ cashMode: 'unknown', count: 2, overrides: { '2026-11-20': { title: 'Personalizzata', amountCents: 14000 } } });
  const h = harness(readyState([s])); assert.ok(h.api.currentRadar().items.some(i => i.occurrenceId === 'x@2026-11-20'));
  h.click('cancel-occurrence', 'x@2026-11-20');
  assert.equal(h.api.findOccurrence('x@2026-11-20').cancelled, true);
  assert.ok(!h.api.currentRadar().items.some(i => i.occurrenceId === 'x@2026-11-20'));
  assert.equal(h.api.findOccurrence('x@2027-01-20'), null);
  assert.doesNotMatch(h.api.renderHome(), /Personalizzata/);
  assert.ok(h.api.nextSeriesCards().every(o => !o.cancelled));
  assert.match(h.api.renderPlanning(), /Occorrenze annullate · recuperabili/); assert.match(h.api.renderPlanning(), /data-action="restore-occurrence"/);
  const reload = harness(JSON.parse(h.storage.get(key))); reload.click('restore-occurrence', 'x@2026-11-20');
  assert.equal(reload.api.findOccurrence('x@2026-11-20').title, 'Personalizzata');
  assert.equal(reload.api.findOccurrence('x@2026-11-20').amountCents, 14000);
  assert.ok(reload.api.currentRadar().items.some(i => i.occurrenceId === 'x@2026-11-20'));
  const financial = harness(readyState([recurring({ count: 1 })]));
  assert.equal(report(financial).expenseForecastCents, 10000); financial.click('cancel-occurrence', 'x@2026-11-20');
  assert.equal(report(financial).expenseForecastCents, 0); assert.equal(financial.api.currentRadar().projection.rows.length, 0);
  financial.click('restore-occurrence', 'x@2026-11-20'); assert.equal(report(financial).expenseForecastCents, 10000);
});
test('UI cancellazione pagata o incassata vietata, nessuna modifica contabile', () => {
  const paid = recurring({ overrides: { '2026-11-20': { actual: { date: '2026-11-05', amountCents: 12345 } } } });
  const data = readyState([paid]); data.planner.incomes = [{ ...paid, id: 'in', name: 'Entrata' }];
  const h = harness(data), before = JSON.stringify(h.api.state);
  h.click('cancel-occurrence', 'x@2026-11-20'); h.click('cancel-income-occurrence', 'in@2026-11-20');
  assert.equal(JSON.stringify(h.api.state), before); assert.equal(report(h).expenseActualCents, 12345); assert.equal(report(h).incomeActualCents, 12345);
});
test('UI promemoria: tombstone non notifica, ripristino riabilita una sola notifica', () => {
  const s = recurring({ dueDate: '2026-11-19', reminderDays: [1], overrides: { '2026-11-19': { cancelled: true } } });
  const data = savedState([s]); data.notificationsEnabled = true;
  const h = harness(data, { notifications: true }); assert.equal(h.notifications.length, 0);
  h.click('restore-occurrence', 'x@2026-11-19'); assert.equal(h.notifications.length, 1);
  h.api.checkReminders(); assert.equal(h.notifications.length, 1);
  h.click('cancel-occurrence', 'x@2026-11-19'); h.api.checkReminders(); assert.equal(h.notifications.length, 1);
});
test('UI nuove entrate: primo mercoledì con mesi esclusi, modifica serie conserva incasso', () => {
  const h = harness(readyState([])); change(h, 'income-recurrence', '1'); change(h, 'income-rule-kind', 'weekday');
  change(h, 'income-ordinal', '1'); change(h, 'income-weekday', '3'); h.node('#income-exclude-12').checked = true;
  h.submit('income-form', { name: 'Entrata', amount: '100', date: '2026-11-01', months: '1', endMode: 'count', count: '3' });
  const income = h.api.state.planner.incomes[0]; assert.deepEqual(occurrences([income], '2027-04-01').map(o => o.key), ['2026-11-04', '2027-01-06', '2027-02-03']);
  h.click('actual-income', `${income.id}@2026-11-04`); h.node('#movement-amount').value = '99,99'; h.node('#movement-date').value = '2026-11-05';
  h.api.handleSubmit({ target: { id: 'movement-form', dataset: h.node('#movement-form').dataset }, preventDefault() {} });
  h.click('edit-income-series', income.id); assert.equal(h.node('#deadline-category-field').hidden, true);
  h.node('#deadline-date').value = '2026-11-01'; change(h, 'deadline-rule-kind', 'day'); h.node('#deadline-day').value = '20'; h.node('#deadline-amount').value = '200'; save(h);
  assert.equal(report(h).incomeActualCents, 9999); assert.equal(report(h).incomeForecastCents, 0);
  const next = h.api.state.planner.incomes[0]; assert.equal(getOccurrence(next, '2026-11-04').actual.amountCents, 9999);
  assert.equal(getOccurrence(next, '2026-11-20'), null); assert.equal(getOccurrence(next, '2027-01-20').amountCents, 20000);
  h.click('cancel-income-occurrence', `${income.id}@2027-01-20`); assert.equal(getOccurrence(h.api.state.planner.incomes[0], '2027-01-20').cancelled, true);
  h.click('restore-income-occurrence', `${income.id}@2027-01-20`); assert.equal(getOccurrence(h.api.state.planner.incomes[0], '2027-01-20').cancelled, false);
});
test('UI storage rollback: modifica serie, annullamento e ripristino non persistono parzialmente', () => {
  for (const cancelled of [false, true]) {
    const s = recurring({ overrides: { '2026-11-20': { cancelled } } }); const h = harness(readyState([s]));
    const before = JSON.stringify(h.api.state), storage = h.storage.get(key); h.failStorage();
    h.click(cancelled ? 'restore-occurrence' : 'cancel-occurrence', 'x@2026-11-20');
    assert.equal(JSON.stringify(h.api.state), before); assert.equal(h.storage.get(key), storage);
    h.click('edit-series', 'x'); h.node('#deadline-title').value = 'Non salvato'; h.node('#deadline-date').value = '2026-11-01'; change(h, 'deadline-rule-kind', 'weekday'); save(h);
    assert.equal(JSON.stringify(h.api.state), before); assert.equal(h.storage.get(key), storage); assert.equal(h.node('#deadline-dialog').open, true);
  }
});
test('UI backup v3: roundtrip snapshot/tombstone, riapertura e rollback import', async () => {
  const h = harness(savedState([recurring()])); h.click('cancel-occurrence', 'x@2026-11-20');
  h.click('edit-series', 'x'); h.node('#deadline-date').value = '2026-11-01'; change(h, 'deadline-rule-kind', 'weekday'); save(h);
  h.api.exportBackup(); const text = await h.blob().text(), exported = JSON.parse(text); assert.equal(exported.schemaVersion, 3);
  const restored = harness(savedState([])); await restored.api.restoreBackup({ size: text.length, text: async () => text });
  assert.equal(restored.api.findOccurrence('x@2026-11-20').cancelled, true);
  assert.equal(JSON.stringify(restored.api.state.deadlines), JSON.stringify(h.api.state.deadlines));
  const blocked = harness(savedState([])); const previous = JSON.stringify(blocked.api.state), storage = blocked.storage.get(key); blocked.failStorage();
  await blocked.api.restoreBackup({ size: text.length, text: async () => text });
  assert.equal(JSON.stringify(blocked.api.state), previous); assert.equal(blocked.storage.get(key), storage);
});
test('UI backup: rigetto nuovi campi invalidi e XSS senza mutare storage', async () => {
  for (const patch of [{ monthlyRule: { kind: 'weekday', ordinal: 1, weekday: '<img>' } }, { excludedMonths: [13] }, { snapshots: { '2026-11-20': { title: 'x', dueDate: '<img>' } } }, { overrides: { '2026-11-20': { cancelled: 'true' } } }]) {
    const h = harness(savedState([])), previous = JSON.stringify(h.api.state), storage = h.storage.get(key);
    const backup = { ...savedState([recurring(patch)]), app: 'Scadenzario', schemaVersion: 3 };
    await h.api.restoreBackup({ size: 2000, text: async () => JSON.stringify(backup) });
    assert.equal(JSON.stringify(h.api.state), previous); assert.equal(h.storage.get(key), storage);
  }
  const h = harness(savedState([recurring({ title: '<img src=x onerror=1>' })]));
  h.click('cancel-occurrence', 'x@2026-11-20'); h.click('edit-series', 'x'); h.node('#deadline-title').value = 'Nuova'; save(h);
  const html = h.api.renderPlanning(); assert.match(html, /&lt;img src=x/); assert.doesNotMatch(html, /<img src=x/);
});
test('UI nuovi input malformati non salvano, ricorrenza disattivata non salva campi nascosti', () => {
  const h = harness(savedState([])); h.api.openDeadlineForm(); h.node('#deadline-title').value = 'Non valida';
  change(h, 'deadline-recurrence', '1'); for (let m = 1; m <= 12; m++) h.node(`#deadline-exclude-${m}`).checked = true;
  save(h); assert.equal(h.api.state.deadlines.length, 0);
  change(h, 'deadline-recurrence', '0'); save(h); assert.equal(h.api.state.deadlines.length, 1);
  assert.equal(h.api.state.deadlines[0].monthlyRule, null); assert.equal(h.api.state.deadlines[0].excludedMonths.length, 0);
});
test('UI sorgente: accessibilità, campi nativi, niente picker automatici e niente dipendenze', async () => {
  const [html, app, css] = await Promise.all(['index.html', 'app.js', 'styles.css'].map(n => readFile(new URL(`../../${n}`, import.meta.url), 'utf8')));
  assert.match(html, /id="series-edit-note"/); assert.match(html, /aria-labelledby="deadline-dialog-title"/);
  assert.match(app, /<legend>Mesi da saltare/); assert.match(app, /<span>Giorno della settimana<\/span><select/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/); assert.doesNotMatch(app, /showPicker\s*\(/);
});
