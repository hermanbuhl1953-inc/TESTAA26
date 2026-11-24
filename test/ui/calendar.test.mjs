import test from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../../planning.js';
import { harness, deadline, readyState, savedState } from './harness.mjs';

const selectCash = (h, date) => {
  h.click('navigate', null, { view: 'calendar' });
  h.click('calendar-mode', null, { mode: 'cash' });
  h.click('select-calendar-date', null, { date });
};
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); for (const child of Object.values(value)) freeze(child);
  }
  return value;
};

test('Calendario: uscite prima entrate, minimo prudenziale e dettaglio importi distinti', () => {
  const data = readyState([{ ...deadline, dueDate: '2026-11-20', amountCents: 60000 }]);
  data.planner.incomes = [{ ...deadline, id: 'in', name: 'Stipendio', dueDate: '2026-11-20', amountCents: 80000 }];
  const h = harness(data), radar = h.api.currentRadar();
  const day = h.api.getCalendarCashDays(radar.projection, radar.end, '2026-11-20', '2026-11-20').get('2026-11-20');
  assert.equal(day.openingBalanceCents, 50000);
  assert.equal(day.expenseForecastCents, 60000); assert.equal(day.incomeForecastCents, 80000);
  assert.equal(day.expenseActualCents, 0); assert.equal(day.incomeActualCents, 0);
  assert.equal(day.minimumBalanceCents, -10000); assert.equal(day.closingBalanceCents, 70000);
  assert.deepEqual(Array.from(day.movements, r => r.amountCents), [-60000, 80000]);
  selectCash(h, '2026-11-20'); const html = h.api.renderCalendar();
  assert.match(html, /calendar-day[^\"]*below-reserve[^\"]*below-zero/);
  assert.match(html, /Uscita prevista/); assert.match(html, /Entrata prevista/);
  assert.match(html, /Saldo a fine giornata<\/span><strong>700,00 €/);
  assert.match(html, /Minimo intragiornaliero prudenziale: <strong>-100,00 €/);
});

test('Calendario: effettivi sostituiscono previsioni alle proprie date senza raddoppio', () => {
  const data = readyState([{ ...deadline, dueDate: '2026-11-20', amountCents: 40000, overrides: { '2026-11-20': { actual: { date: '2026-11-17', amountCents: 45000 } } } }]);
  data.planner.incomes = [{ ...deadline, id: 'in', name: 'Incasso', dueDate: '2026-11-21', amountCents: 20000, overrides: { '2026-11-21': { actual: { date: '2026-11-17', amountCents: 25000 } } } }];
  const h = harness(data), radar = h.api.currentRadar();
  const days = h.api.getCalendarCashDays(radar.projection, radar.end, '2026-11-17', '2026-11-21');
  const day = days.get('2026-11-17');
  assert.equal(day.expenseActualCents, 45000); assert.equal(day.incomeActualCents, 25000);
  assert.equal(day.expenseForecastCents, 0); assert.equal(day.incomeForecastCents, 0);
  assert.equal(day.minimumBalanceCents, 5000); assert.equal(day.closingBalanceCents, 30000);
  assert.equal(days.get('2026-11-20').movements.length, 0);
  assert.equal(days.get('2026-11-21').movements.length, 0);
  selectCash(h, '2026-11-17');
  assert.match(h.api.renderCalendar(), /Pagamento effettivo/);
  assert.match(h.api.renderCalendar(), /Incasso effettivo/);
});

test('Calendario: inclusione tutti o nessuno degli effettivi nella data saldo resta coerente', () => {
  for (const included of [true, false]) {
    const data = readyState([{ ...deadline, overrides: { '2026-11-17': { actual: { date: '2026-11-01', amountCents: 10000 } } } }]);
    data.planner.sameDayActualsIncluded = included;
    const h = harness(data), radar = h.api.currentRadar();
    const day = h.api.getCalendarCashDays(radar.projection, radar.end, '2026-11-01', '2026-11-01').get('2026-11-01');
    // Il reporting mostra anche gli effettivi assorbiti; il saldo resta invariato.
    assert.equal(day.expenseActualCents, 10000);
    assert.equal(day.closingBalanceCents, included ? 50000 : 40000);
  }
});

test('Calendario: giorni senza movimenti riportano saldo precedente, non saldo iniziale', () => {
  const h = harness(readyState([{ ...deadline, dueDate: '2026-11-30' }])), radar = h.api.currentRadar();
  const day = h.api.getCalendarCashDays(radar.projection, radar.end, '2026-12-01', '2026-12-01').get('2026-12-01');
  assert.equal(day.openingBalanceCents, 40000); assert.equal(day.closingBalanceCents, 40000);
  assert.equal(day.minimumBalanceCents, 40000); assert.equal(day.movements.length, 0);
});

test('Calendario: limiti data saldo e orizzonte, null senza saldo e nessuno zero inventato', () => {
  const h = harness(readyState([])), radar = h.api.currentRadar();
  const days = h.api.getCalendarCashDays(radar.projection, radar.end, '2026-10-31', '2027-11-02');
  assert.equal(days.has('2026-10-31'), false); assert.equal(days.has('2026-11-01'), true);
  assert.equal(days.has(radar.end), true); assert.equal(days.has('2027-11-02'), false);
  assert.equal(h.api.getCalendarCashDays(radar.projection, radar.end, '2028-01-01', '2028-01-31').size, 0);
  const no = harness(savedState());
  assert.equal(no.api.getCalendarCashDays(null, radar.end, '2026-11-01', '2026-11-30'), null);
  selectCash(no, '2026-11-18');
  assert.match(no.api.renderCalendar(), /Imposta un saldo di riferimento valido/);
  assert.doesNotMatch(no.api.renderCalendar(), /Saldo a fine giornata/);
  selectCash(h, '2026-10-31');
  assert.match(h.api.renderCalendar(), /fuori dall’intervallo stimabile/);
});

test('Calendario: navigazione dicembre/gennaio e ritorno, mode e input ISO preservati', () => {
  const h = harness(readyState([])); selectCash(h, '2026-11-18');
  for (const [offset, date, label] of [['1', '2026-12-01', 'dicembre 2026'], ['1', '2027-01-01', 'gennaio 2027'], ['-1', '2026-12-01', 'dicembre 2026']]) {
    h.click('calendar-month', null, { offset });
    const html = h.api.renderCalendar();
    assert.match(html, new RegExp(`Calendario mensile · ${label}`));
    assert.match(html, new RegExp(`data-date="${date}" aria-pressed="true"`));
    assert.match(html, /data-mode="cash" aria-pressed="true"/);
    assert.equal((html.match(/data-action="select-calendar-date"/g) ?? []).length, 42);
    assert.match(html, /<details class="agenda-calendar" open>/);
  }
  h.click('calendar-mode', null, { mode: 'deadlines' });
  assert.match(h.api.renderCalendar(), /data-mode="deadlines" aria-pressed="true"/);
  assert.doesNotMatch(h.api.renderCalendar(), /class="calendar-cash-detail"/);
});

test('Calendario: mesi civili con bisestile e DST non saltano o duplicano giorni', () => {
  const data = readyState([]); data.planner.balanceDate = '2024-01-01';
  const h = harness(data);
  for (const [from, to, count] of [['2024-02-01', '2024-02-29', 29], ['2026-03-01', '2026-03-31', 31], ['2026-10-01', '2026-10-31', 31], ['2026-12-01', '2027-01-31', 62]]) {
    const days = h.api.getCalendarCashDays({ rows: [] }, '2027-11-01', from, to);
    assert.equal(days.size, count); assert.equal([...days.keys()][0], from); assert.equal([...days.keys()].at(-1), to);
    for (const day of days.values()) { assert.equal(day.closingBalanceCents, 50000); assert.equal(day.minimumBalanceCents, 50000); }
  }
});

test('Calendario: aggregati mensili coincidono col motore, incluso ultimo giorno parziale', () => {
  const data = readyState([{ ...deadline, dueDate: '2026-11-30', recurrenceMonths: 1, count: 12 }]);
  data.planner.incomes = [{ ...deadline, id: 'in', name: 'Entrata mensile', dueDate: '2026-11-28', recurrenceMonths: 1, amountCents: 30000, count: 12 }];
  const h = harness(data), projection = project(h.api.state.planner, h.api.state.deadlines, '2026-11-18', '2027-11-01');
  for (const month of projection.months) {
    const days = h.api.getCalendarCashDays(projection, '2027-11-01', month.month, month.until);
    assert.equal([...days.values()].at(-1).closingBalanceCents, month.endingBalanceCents);
    assert.equal([...days.values()].reduce((sum, d) => sum + d.incomeForecastCents + d.incomeActualCents, 0), month.incomeCents);
    assert.equal([...days.values()].reduce((sum, d) => sum + d.expenseForecastCents + d.expenseActualCents, 0), month.expensesCents);
    assert.equal(Math.min(...[...days.values()].map(d => d.minimumBalanceCents)), month.minimumCents);
  }
});

test('Calendario: dati mancanti e arretrati esclusi restano avvisi, nessuna modifica allo stato o alla proiezione', () => {
  const data = readyState([deadline, { ...deadline, id: 'unknown', dueDate: '2026-11-20', cashMode: 'unknown', amountCents: 0 }]);
  const h = harness(data), radar = h.api.currentRadar();
  const stateBefore = JSON.stringify(h.api.state), storageBefore = [...h.storage], projectionBefore = JSON.stringify(radar.projection);
  freeze(radar.projection); freeze(h.api.state);
  const days = h.api.getCalendarCashDays(radar.projection, radar.end, '2026-11-01', '2026-12-31');
  assert.equal([...days.values()].reduce((sum, d) => sum + d.movements.length, 0), 0);
  selectCash(h, '2026-11-20');
  assert.match(h.api.renderCalendar(), /avvisi del piano/);
  assert.equal(JSON.stringify(h.api.state), stateBefore); assert.deepEqual([...h.storage], storageBefore);
  assert.equal(JSON.stringify(radar.projection), projectionBefore);
});

test('Calendario: titoli ostili escaped in dettagli e attributi, filtri non cambiano saldi', () => {
  const payload = '<img src=x onerror="evil"> 2026-11-20';
  const h = harness(readyState([{ ...deadline, title: payload, dueDate: '2026-11-20' }]));
  selectCash(h, '2026-11-20');
  const before = h.api.currentRadar().projection.endingBalanceCents;
  const html = h.api.renderCalendar();
  assert.doesNotMatch(html, /<img src=x/); assert.match(html, /&lt;img src=x/);
  h.api.handleChange({ target: { matches: () => true, dataset: { filter: 'category' }, value: 'auto' } });
  assert.equal(h.api.currentRadar().projection.endingBalanceCents, before);
  assert.match(h.api.renderCalendar(), /Saldo a fine giornata<\/span><strong>400,00 €/);
});
