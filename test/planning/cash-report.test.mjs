import test from 'node:test';
import assert from 'node:assert/strict';
import { cashReport, emptyPlanner, project, setOccurrenceActual, occurrences, migrate } from '../../planning.js';

const today = '2026-11-18';
const series = (changes = {}) => ({ id: 'x', title: 'Ottobre', dueDate: '2026-10-20', recurrenceMonths: 0, amountCents: 10000,
  cashMode: 'same', cashDate: null, endDate: null, count: null, overrides: {}, ...changes });
const paid = (changes = {}) => series({ overrides: { '2026-10-20': { actual: { date: '2026-11-05', amountCents: 10001 } } }, ...changes });
const planner = (balanceDate = '2026-11-10', included = true) => ({ ...emptyPlanner(), ready: true, openingBalanceCents: 50000, balanceDate, sameDayActualsIncluded: included });
const report = (p, s) => cashReport(p, s, '2026-11-01', '2026-11-30', today);

test('Consuntivo: ottobre pagato novembre resta nel mese effettivo con saldo prima/dopo/stesso giorno', () => {
  for (const [date, included, applied] of [['2026-11-01', true, true], ['2026-11-10', true, false], ['2026-11-05', true, false], ['2026-11-05', false, true]]) {
    const p = planner(date, included), s = [paid()];
    const projection = project(p, s, today, '2026-12-31'), before = JSON.stringify(projection);
    const r = report(p, s);
    assert.equal(r.expenseActualCents, 10001); assert.equal(r.expenseForecastCents, 0);
    assert.equal(r.rows.length, 1); assert.equal(r.rows[0].date, '2026-11-05');
    assert.equal(projection.endingBalanceCents, 50000 - (applied ? 10001 : 0));
    assert.equal(projection.months[0].expensesCents, applied ? 10001 : 0);
    assert.equal(JSON.stringify(project(p, s, today, '2026-12-31')), before);
    assert.equal(cashReport(p, s, '2026-10-01', '2026-10-31', today).expenseActualCents, 0);
  }
});

test('Consuntivo: effettivi archivio e incassi senza saldo, centesimi senza doppioni', () => {
  const p = emptyPlanner();
  p.incomes = [paid({ id: 'in', title: 'Incasso', archived: true })];
  const r = report(p, [paid({ archived: true }), series({ id: 'forecast', dueDate: '2026-11-21', amountCents: 12345 })]);
  assert.equal(r.incomeActualCents, 10001); assert.equal(r.expenseActualCents, 10001);
  assert.equal(r.expenseForecastCents, 12345); assert.equal(r.incomeForecastCents, 0);
  assert.equal(r.rows.length, 3);
});

test('Consuntivo: correzione e annullamento aggiornano report e proiezione collegata', () => {
  const p = planner('2026-11-01'); let s = series({ dueDate: '2026-11-25' });
  s = setOccurrenceActual(s, s.dueDate, { date: '2026-11-05', amountCents: 12345 }, today);
  assert.equal(report(p, [s]).expenseActualCents, 12345); assert.equal(report(p, [s]).expenseForecastCents, 0);
  assert.equal(project(p, [s], today, '2026-12-31').endingBalanceCents, 37655);
  s = setOccurrenceActual(s, s.dueDate, { date: '2026-10-31', amountCents: 99 }, today);
  assert.equal(report(p, [s]).expenseActualCents, 0);
  assert.equal(cashReport(p, [s], '2026-10-01', '2026-10-31', today).expenseActualCents, 99);
  assert.equal(project(p, [s], today, '2026-12-31').endingBalanceCents, 50000);
  s = setOccurrenceActual(s, s.dueDate, null, today);
  assert.equal(report(p, [s]).expenseActualCents, 0); assert.equal(report(p, [s]).expenseForecastCents, 10000);
  assert.equal(project(p, [s], today, '2026-12-31').endingBalanceCents, 40000);
});

test('Consuntivo: scadenza oltre finestra e passaggio anno seguono actual.date', () => {
  const s = series({ dueDate: '2028-01-20', overrides: { '2028-01-20': { actual: { date: '2026-11-05', amountCents: 789 } } } });
  assert.equal(report(emptyPlanner(), [s]).expenseActualCents, 789);
  const annual = series({ dueDate: '2025-12-31', overrides: { '2025-12-31': { actual: { date: '2026-01-02', amountCents: 12001 } } } });
  assert.equal(cashReport(emptyPlanner(), [annual], '2026-01-01', '2026-01-31', today).expenseActualCents, 12001);
  assert.equal(cashReport(emptyPlanner(), [annual], '2025-12-01', '2025-12-31', today).expenseActualCents, 0);
});

test('Consuntivo: dati parziali legacy/importi/date non inventano movimenti zero', () => {
  const s = [series({ overrides: { '2026-10-20': { legacyCompleted: true } } }), series({ id: 'zero', dueDate: '2026-11-22', amountCents: 0 }), series({ id: 'unknown', cashMode: 'unknown' })];
  const before = JSON.stringify(s), r = report(emptyPlanner(), s);
  assert.equal(r.rows.length, 0); assert.equal(r.expenseActualCents, 0);
  assert.equal(r.unplacedLegacy, 1); assert.equal(r.missingAmount, 1); assert.equal(r.unknownDate, 1);
  assert.equal(JSON.stringify(s), before);
});

test('Consuntivo: previsioni aperte per cassa distinguono arretrati e proiezione', () => {
  const s = [series({ dueDate: '2026-10-20', cashMode: 'date', cashDate: '2026-11-10' }), series({ id: 'later', dueDate: '2026-11-21' })], p = planner();
  assert.equal(report(p, s).expenseForecastCents, 20000);
  const projection = project(p, s, today, '2026-11-30');
  assert.equal(projection.months[0].expensesCents, 10000); assert.equal(projection.rows.length, 1);
  assert.match(projection.warnings.join(' '), /arretrata/);
});

test('Termini legacy: import v2 conserva entrambi, generatore mantiene minimo e ID', () => {
  const original = series({ dueDate: '2026-11-20', recurrenceMonths: 1, endDate: '2027-03-20', count: 2 });
  const data = { schemaVersion: 2, deadlines: [original], planner: emptyPlanner() };
  const copy = migrate(data, today), generated = occurrences(copy.deadlines, '2027-12-31');
  assert.equal(copy.deadlines[0].endDate, '2027-03-20'); assert.equal(copy.deadlines[0].count, 2);
  assert.deepEqual(generated.map(o => o.id), ['x@2026-11-20', 'x@2026-12-20']);
  assert.deepEqual(copy.deadlines, data.deadlines);
});
