import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { harness, deadline, readyState, savedState } from './harness.mjs';
import { cashReport, project } from '../../planning.js';

const change = (h, id, value) => {
  h.node(`#${id}`).value = value;
  h.api.handleChange({ target: { id, value, matches: () => false } });
};
const submitDeadline = h => h.api.handleDeadlineSubmit({ preventDefault() {} });
const submitMovement = h => h.api.handleSubmit({ target: { id: 'movement-form', dataset: h.node('#movement-form').dataset }, preventDefault() {} });
const paid = { ...deadline, dueDate: '2026-10-20', overrides: { '2026-10-20': { actual: { date: '2026-11-05', amountCents: 12345 } } } };
const report = h => cashReport(h.api.state.planner, h.api.state.deadlines, '2026-11-01', '2026-11-30', '2026-11-18');

test('Form: nuova/modifica focalizza titolo, non data, date ISO non mutate al salvataggio', () => {
  const h = harness(readyState([paid]));
  h.api.openDeadlineForm();
  assert.equal(h.node('#deadline-title').focused, true); assert.notEqual(h.node('#deadline-date').focused, true);
  h.api.openDeadlineForm(h.api.findOccurrence('x@2026-10-20'));
  assert.equal(h.node('#deadline-title').focused, true); assert.notEqual(h.node('#deadline-date').focused, true);
  h.node('#deadline-title').value = 'Titolo corretto'; h.node('#deadline-amount').value = '140,19'; submitDeadline(h);
  const s = h.api.state.deadlines[0];
  assert.equal(s.dueDate, '2026-10-20'); assert.equal(s.overrides['2026-10-20'].dueDate, '2026-10-20');
  assert.equal(s.overrides['2026-10-20'].cashDate, null);
  assert.equal(s.overrides['2026-10-20'].actual.date, '2026-11-05');
  assert.equal(s.overrides['2026-10-20'].actual.amountCents, 12345);
  assert.equal(report(h).expenseActualCents, 12345);
  h.api.openDeadlineForm(h.api.findOccurrence('x@2026-10-20'));
  change(h, 'deadline-cash-mode', 'date');
  assert.equal(h.node('#deadline-cash-date').value, '');
});

test('Form cassa: hidden/disabled/required, data vuota nuova e null salvato per same/unknown', () => {
  for (const mode of ['same', 'unknown']) {
    const h = harness(savedState([])); h.api.openDeadlineForm();
    assert.equal(h.node('#deadline-cash-field').hidden, true); assert.equal(h.node('#deadline-cash-date').value, '');
    change(h, 'deadline-cash-mode', 'date');
    assert.equal(h.node('#deadline-cash-field').hidden, false); assert.equal(h.node('#deadline-cash-date').disabled, false); assert.equal(h.node('#deadline-cash-date').required, true);
    assert.equal(h.node('#deadline-cash-date').value, ''); assert.notEqual(h.node('#deadline-cash-date').focused, true);
    h.node('#deadline-title').value = 'Nuova'; h.node('#deadline-amount').value = '10'; submitDeadline(h);
    assert.equal(h.api.state.deadlines.length, 0);
    h.node('#deadline-cash-date').value = '2026-12-01'; change(h, 'deadline-cash-mode', mode);
    assert.equal(h.node('#deadline-cash-field').hidden, true); assert.equal(h.node('#deadline-cash-date').disabled, true); assert.equal(h.node('#deadline-cash-date').required, false);
    submitDeadline(h); assert.equal(h.api.state.deadlines[0].cashMode, mode); assert.equal(h.api.state.deadlines[0].cashDate, null);
  }
});

test('Form cassa: modifica singola mantiene data diversa e storico, senza toccare ancora', () => {
  const s = { ...paid, cashMode: 'date', cashDate: '2026-10-21', recurrenceMonths: 1, count: 3 };
  const h = harness(readyState([s])); h.api.openDeadlineForm(h.api.findOccurrence('x@2026-10-20'));
  assert.equal(h.node('#deadline-cash-date').value, '2026-10-21'); assert.equal(h.node('#deadline-cash-date').required, true);
  h.node('#deadline-title').value = 'Altro'; submitDeadline(h);
  assert.equal(h.api.state.deadlines[0].cashDate, '2026-10-21');
  assert.equal(h.api.state.deadlines[0].overrides['2026-10-20'].cashDate, '2026-10-21');
  assert.equal(h.api.findOccurrence('x@2026-11-20').cashDate, '2026-11-21');
});

test('Modale incasso/previsione: focus importo, modi cassa coerenti e actual sempre obbligatorio', () => {
  const data = readyState([]); data.planner.incomes = [{ ...deadline, id: 'in', name: 'Entrata', dueDate: '2026-11-22' }];
  const h = harness(data); h.click('edit-income', 'in@2026-11-22');
  assert.equal(h.node('#movement-amount').focused, true); assert.notEqual(h.node('#movement-date').focused, true);
  assert.equal(h.node('#movement-cash-field').hidden, true); assert.equal(h.node('#movement-date').required, false);
  h.node('#movement-amount').value = '121,21'; submitMovement(h);
  assert.equal(h.api.state.planner.incomes[0].overrides['2026-11-22'].cashMode, 'same');
  assert.equal(h.api.state.planner.incomes[0].overrides['2026-11-22'].cashDate, null);
  h.click('edit-income', 'in@2026-11-22'); change(h, 'movement-cash-mode', 'date');
  assert.equal(h.node('#movement-date').value, ''); assert.equal(h.node('#movement-date').required, true);
  h.node('#movement-date').value = '2026-11-25'; submitMovement(h);
  h.click('edit-income', 'in@2026-11-22'); h.node('#movement-amount').value = '140'; submitMovement(h);
  assert.equal(h.api.state.planner.incomes[0].overrides['2026-11-22'].cashDate, '2026-11-25');
  h.click('edit-income', 'in@2026-11-22'); change(h, 'movement-cash-mode', 'unknown'); submitMovement(h);
  assert.equal(h.api.state.planner.incomes[0].overrides['2026-11-22'].cashDate, null);
  h.click('actual-income', 'in@2026-11-22'); assert.equal(h.node('#movement-cash-field').hidden, false);
  assert.equal(h.node('#movement-date').disabled, false); assert.equal(h.node('#movement-date').required, true);
  assert.equal(h.node('#movement-date').value, ''); assert.equal(h.node('#movement-date').max, '2026-11-18');
  h.node('#movement-date').value = '2026-11-05'; submitMovement(h);
  assert.equal(report(h).incomeActualCents, 14000); assert.equal(report(h).incomeForecastCents, 0);
  h.click('actual-income', 'in@2026-11-22'); h.node('#movement-amount').value = '141,01'; submitMovement(h);
  assert.equal(h.api.state.planner.incomes[0].overrides['2026-11-22'].actual.date, '2026-11-05');
  assert.equal(report(h).incomeActualCents, 14101);
});

test('Calendario: effettivi prima saldo visibili, saldo null; saldi e minimi successivi immutati', () => {
  const data = readyState([paid, { ...deadline, id: 'future', dueDate: '2026-11-20', amountCents: 60000 }]);
  data.planner.balanceDate = '2026-11-10';
  const h = harness(data), r = h.api.currentRadar(), before = JSON.stringify(r.projection);
  const days = h.api.getCalendarCashDays(r.projection, r.end, '2026-11-01', '2026-11-30');
  const old = days.get('2026-11-05'), future = days.get('2026-11-20');
  assert.equal(old.expenseActualCents, 12345); assert.equal(old.closingBalanceCents, null); assert.equal(old.minimumBalanceCents, null); assert.equal(old.openingBalanceCents, null);
  assert.equal(future.closingBalanceCents, -10000); assert.equal(future.minimumBalanceCents, -10000);
  const html = h.api.renderCalendarCashDetail(old, r.projection, r.end, '2026-11-05');
  assert.match(html, /Pagamento effettivo/); assert.match(html, /123,45/); assert.match(html, /saldo storico non stimabile/);
  assert.doesNotMatch(html, /Saldo a fine giornata|Minimo intragiornaliero prudenziale/);
  assert.equal(JSON.stringify(r.projection), before);
});

test('Consuntivo UI: accessibile anche senza saldo e nel mese passato dal calendario', () => {
  const h = harness(savedState([paid]));
  assert.match(h.api.renderPlanning(), /Pagato nel mese<\/span><strong>123,45/);
  assert.match(h.api.renderPlanning(), /Saldi non disponibili/);
  const day = h.api.getCalendarCashDays(null, '2027-11-01', '2026-11-01', '2026-11-30').get('2026-11-05');
  assert.equal(day.closingBalanceCents, null); assert.equal(day.expenseActualCents, 12345);
  const old = { ...deadline, dueDate: '2025-12-15', overrides: { '2025-12-15': { actual: { date: '2026-01-02', amountCents: 999 } } } };
  const historical = harness(savedState([old])); historical.click('calendar-mode', null, { mode: 'cash' });
  for (let i = 0; i < 10; i++) historical.click('calendar-month', null, { offset: '-1' });
  const html = historical.api.renderCalendar(); assert.match(html, /Consuntivo registrato · gennaio 2026/); assert.match(html, /Pagato nel mese<\/span><strong>9,99/);
  historical.click('select-calendar-date', null, { date: '2026-01-02' });
  assert.match(historical.api.renderCalendar(), /Pagamento effettivo/);
});

test('Consuntivo UI: correzione/annullamento, archivio e proiezione coerenti', () => {
  const h = harness(readyState([paid]));
  h.click('complete-deadline', 'x@2026-10-20'); h.node('#movement-date').value = '2026-11-06'; h.node('#movement-amount').value = '140,21'; submitMovement(h);
  assert.equal(report(h).expenseActualCents, 14021);
  assert.equal(h.api.currentRadar().projection.endingBalanceCents, 35979);
  h.click('archive-deadline', 'x@2026-10-20'); assert.equal(h.api.state.deadlines[0].archived, true); assert.equal(report(h).expenseActualCents, 14021);
  h.click('reopen-deadline', 'x@2026-10-20'); assert.equal(report(h).expenseActualCents, 0);
  assert.equal(h.api.currentRadar().projection.endingBalanceCents, 50000);
  assert.equal(h.api.state.deadlines[0].dueDate, '2026-10-20');
});

test('Termini esclusivi: nuove scadenze cancellano solo limite non scelto, inclusa nessuna fine', () => {
  for (const mode of ['none', 'date', 'count']) {
    const h = harness(savedState([])); h.api.openDeadlineForm();
    h.node('#deadline-title').value = 'Serie'; h.node('#deadline-recurrence').value = '1';
    change(h, 'deadline-end-mode', mode);
    assert.equal(h.node('#deadline-end').disabled, mode !== 'date'); assert.equal(h.node('#deadline-count').disabled, mode !== 'count');
    assert.equal(h.node('#deadline-end').required, mode === 'date'); assert.equal(h.node('#deadline-count').required, mode === 'count');
    h.node('#deadline-end').value = '2027-04-25'; h.node('#deadline-count').value = '3'; submitDeadline(h);
    const s = h.api.state.deadlines[0]; assert.equal(s.endDate, mode === 'date' ? '2027-04-25' : null); assert.equal(s.count, mode === 'count' ? 3 : null);
    assert.equal(Object.hasOwn(s, 'endMode'), false);
  }
});

test('Termini esclusivi: nuove entrate e campi condizionali, legacy singola non azzera origine', () => {
  for (const mode of ['none', 'date', 'count']) {
    const h = harness(savedState([])); change(h, 'income-end-mode', mode);
    assert.equal(h.node('#income-end').disabled, mode !== 'date'); assert.equal(h.node('#income-count').disabled, mode !== 'count');
    h.submit('income-form', { name: 'Entrata', amount: '5', date: '2026-11-20', months: '1', endMode: mode, endDate: '2027-01-20', count: '2' });
    const s = h.api.state.planner.incomes[0]; assert.equal(s.endDate, mode === 'date' ? '2027-01-20' : null); assert.equal(s.count, mode === 'count' ? 2 : null);
  }
  const legacy = { ...deadline, dueDate: '2026-11-20', recurrenceMonths: 1, endDate: '2027-04-20', count: 2 };
  const h = harness(readyState([legacy])); h.api.openDeadlineForm(h.api.findOccurrence('x@2026-11-20'));
  assert.equal(h.node('#deadline-end-mode').value, 'legacy'); assert.equal(h.node('#legacy-end-note').hidden, false);
  for (const id of ['deadline-recurrence', 'deadline-end-mode', 'deadline-end', 'deadline-count']) assert.equal(h.node(`#${id}`).disabled, true);
  h.node('#deadline-title').value = 'Solo prima'; submitDeadline(h);
  assert.equal(h.api.state.deadlines[0].endDate, legacy.endDate); assert.equal(h.api.state.deadlines[0].count, 2);
  assert.equal(h.api.findOccurrence('x@2027-01-20'), null);
});

test('Termini e cassa: campi scelti obbligatori, draft esplicito conservato senza salvare valori nascosti', () => {
  for (const mode of ['date', 'count']) {
    const h = harness(savedState([])); h.api.openDeadlineForm();
    h.node('#deadline-title').value = 'Non valida'; change(h, 'deadline-end-mode', mode); submitDeadline(h);
    assert.equal(h.api.state.deadlines.length, 0);
  }
  const h = harness(savedState([])); h.api.openDeadlineForm(); change(h, 'deadline-cash-mode', 'date');
  h.node('#deadline-cash-date').value = '2026-12-15'; change(h, 'deadline-cash-mode', 'unknown'); change(h, 'deadline-cash-mode', 'date');
  assert.equal(h.node('#deadline-cash-date').value, '2026-12-15');
  h.node('#deadline-title').value = 'Esplicita'; submitDeadline(h);
  assert.equal(h.api.state.deadlines[0].cashDate, '2026-12-15');
});

test('Consuntivo storico: titoli escaped, legacy parziale segnalato e data scadenza distinta', () => {
  const title = '<img src=x onerror=evil>';
  const legacy = { ...deadline, id: 'legacy', overrides: { '2026-11-17': { legacyCompleted: true } } };
  const h = harness(savedState([{ ...paid, archived: true, title }, legacy]));
  const reportHtml = h.api.renderPlanning(); assert.match(reportHtml, /Dati parziali/);
  assert.match(reportHtml, /1 completamenti storici senza data/);
  h.click('calendar-mode', null, { mode: 'cash' }); h.click('select-calendar-date', null, { date: '2026-11-05' });
  const cash = h.api.renderCalendar(); assert.match(cash, /&lt;img src=x/); assert.doesNotMatch(cash, /<img src=x/);
  assert.match(cash, /Pagamento effettivo/); assert.match(cash, /saldo non disponibile per questa data/);
  const days = h.api.getCalendarCashDays(null, '2027-11-01', '2026-10-01', '2026-11-30');
  assert.equal(days.has('2026-10-20'), false); assert.equal(days.get('2026-11-05').expenseActualCents, 12345);
});

test('Calendario: importi mancanti senza movimento a zero, errori espliciti senza saldo inventato', () => {
  const h = harness(readyState([{ ...deadline, dueDate: '2026-11-20', amountCents: 0 }]));
  const r = h.api.currentRadar(), day = h.api.getCalendarCashDays(r.projection, r.end, '2026-11-20', '2026-11-20').get('2026-11-20');
  assert.equal(day.movements.length, 0); assert.equal(day.closingBalanceCents, 50000);
  h.api.state.deadlines[0].amountCents = -1;
  h.click('calendar-mode', null, { mode: 'cash' });
  const html = h.api.renderCalendar(); assert.match(html, /Flussi non calcolabili/); assert.match(html, /Consuntivo non disponibile/);
  assert.doesNotMatch(html, /Saldo a fine giornata|Pagato nel mese/);
});

test('UI sorgente: autofocus non date, nessun showPicker e label accessibili, ISO preservato', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../../app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /showPicker\s*\(/); assert.match(html, /<input autofocus id="deadline-title"/);
  assert.match(html, /id="movement-amount"[^>]*autofocus/);
  assert.match(html, /<label[^>]*id="deadline-cash-field"[^>]*hidden><span>[^<]+<\/span><input id="deadline-cash-date" type="date" disabled/);
  assert.doesNotMatch(html, /type="date"[^>]*autofocus/);
  const h = harness(readyState([{ ...deadline, dueDate: '2026-11-20' }]));
  const before = JSON.stringify(h.api.state), projection = project(h.api.state.planner, h.api.state.deadlines, '2026-11-18', '2027-11-01');
  h.api.renderPlanning(); h.api.renderCalendar(); assert.equal(JSON.stringify(h.api.state), before);
  assert.equal(h.api.currentRadar().projection.endingBalanceCents, projection.endingBalanceCents);
});
