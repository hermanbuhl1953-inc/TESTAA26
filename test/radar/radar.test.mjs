import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadar, filterAgenda, planningEnd } from '../../radar.js';
import { emptyPlanner, project, setOccurrenceActual, occurrences } from '../../planning.js';

const today = '2026-11-18';
const series = (changes = {}) => ({ id: 'expense', title: 'Affitto', dueDate: today, amountCents: 10000, recurrenceMonths: 0, cashMode: 'same', cashDate: null, count: null, endDate: null, overrides: {}, category: 'casa', archived: false, ...changes });
const planner = (changes = {}) => ({ ...emptyPlanner(), ready: true, openingBalanceCents: 100000, reserveCents: 10000, balanceDate: '2026-11-01', sameDayActualsIncluded: true, ...changes });
const type = (radar, name) => radar.items.filter(item => item.type === name);

test('Radar puro: configurazione mancante resta azione reale senza valori zero fittizi', () => {
  const result = buildRadar(emptyPlanner(), [], today);
  assert.equal(result.projection, null);
  assert.equal(type(result, 'configuration').length, 1);
  assert.equal(result.items[0].action, 'configure-plan');
  assert.match(result.items[0].description, /Saldo.*Data.*tutti o nessuno/);
});
test('Radar: configurazione incompleta non nasconde arretrati o dati mancanti', () => {
  const result = buildRadar(emptyPlanner(), [series({ dueDate: '2026-11-01', cashMode: 'unknown', amountCents: 0 })], today);
  assert.equal(type(result, 'configuration').length, 1);
  assert.equal(type(result, 'expense-overdue').length, 1);
  assert.equal(type(result, 'expense-missing').length, 1);
});
test('Radar: scelta stessa data e data futura impediscono il calcolo', () => {
  for (const changes of [{ sameDayActualsIncluded: null }, { balanceDate: '2026-11-19' }]) {
    const result = buildRadar(planner(changes), [], today);
    assert.equal(result.projection, null); assert.equal(type(result, 'configuration').length, 1);
  }
});
test('Radar: identità occorrenza, non tutta la serie passata come arretrata', () => {
  const s = series({ dueDate: '2026-09-01', recurrenceMonths: 1, count: 3, overrides: { '2026-09-01': { actual: { date: '2026-09-01', amountCents: 10000 } }, '2026-10-01': { legacyCompleted: true } } });
  const result = buildRadar(planner(), [s], today);
  assert.deepEqual(type(result, 'expense-overdue').map(i => i.occurrenceId), ['expense@2026-11-01']);
});
test('Radar: archiviate e promemoria completati non sono arretrati', () => {
  const archived = series({ dueDate: '2026-10-01', archived: true });
  const done = series({ id: 'done', dueDate: '2026-10-01', amountCents: 0, overrides: { '2026-10-01': { done: true } } });
  assert.equal(buildRadar(planner(), [archived, done], today).items.length, 0);
});
test('Radar: cassa già passata con scadenza futura, anche oltre orizzonte', () => {
  const s = series({ dueDate: '2028-01-10', cashMode: 'date', cashDate: '2026-11-01' });
  const result = buildRadar(planner(), [s], today);
  assert.equal(type(result, 'expense-overdue')[0].dueDate, '2028-01-10');
  assert.equal(type(result, 'expense-overdue')[0].cashDate, '2026-11-01');
  assert.ok(result.projection.warnings.some(w => /arretrata/.test(w)));
});
test('Radar: scadenza passata con cassa futura resta aperta ma viene proiettata solo in cassa', () => {
  const result = buildRadar(planner(), [series({ dueDate: '2026-11-01', cashMode: 'date', cashDate: '2026-11-25' })], today);
  assert.equal(type(result, 'expense-overdue').length, 1);
  assert.equal(result.projection.rows[0].date, '2026-11-25');
});
test('Radar: dati sconosciuti non significano assenza di anomalie', () => {
  const result = buildRadar(planner(), [series({ dueDate: '2026-12-01', cashMode: 'unknown' })], today);
  assert.equal(type(result, 'expense-missing').length, 1);
  assert.ok(result.projection.warnings.some(w => /sconosciuta/.test(w)));
  assert.equal(result.items[0].action, 'edit-deadline');
});
test('Radar: entrata attesa non incassata usa cassa, non scadenza', () => {
  const income = series({ id: 'income', name: 'Stipendio', dueDate: '2027-01-01', cashMode: 'date', cashDate: '2026-11-17' });
  const result = buildRadar(planner({ incomes: [income] }), [], today);
  assert.equal(type(result, 'income-overdue').length, 1);
  assert.equal(result.items[0].action, 'actual-income');
  assert.equal(result.projection.rows.length, 0);
});
test('Radar: entrata con cassa sconosciuta segnala mancanza senza falso arretrato da scadenza', () => {
  const income = series({ id: 'income', name: 'Entrata', dueDate: '2026-11-01', cashMode: 'unknown' });
  const result = buildRadar(planner({ incomes: [income] }), [], today);
  assert.equal(type(result, 'income-overdue').length, 0);
  assert.equal(type(result, 'income-missing').length, 1);
});
test('Radar: pagamento risolve e annullamento riapre la stessa occorrenza', () => {
  const s = series({ dueDate: '2026-11-01' });
  const paid = setOccurrenceActual(s, s.dueDate, { date: '2026-11-17', amountCents: 10000 }, today);
  assert.equal(type(buildRadar(planner(), [paid], today), 'expense-overdue').length, 0);
  const reopened = setOccurrenceActual(paid, s.dueDate, null, today);
  assert.equal(type(buildRadar(planner(), [reopened], today), 'expense-overdue')[0].occurrenceId, 'expense@2026-11-01');
});
test('Radar: incasso risolve e annullamento riapre previsione', () => {
  const s = series({ id: 'income', name: 'Stipendio', dueDate: '2026-11-01' });
  const paid = setOccurrenceActual(s, s.dueDate, { date: '2026-11-17', amountCents: 10000 }, today);
  assert.equal(type(buildRadar(planner({ incomes: [paid] }), [], today), 'income-overdue').length, 0);
  assert.equal(type(buildRadar(planner({ incomes: [setOccurrenceActual(paid, s.dueDate, null, today)] }), [], today), 'income-overdue').length, 1);
});
test('Radar: chiavi e ordine deterministici, nessun duplicato, nessuna mutazione', () => {
  const input = [series({ id: 'z', dueDate: '2026-11-04' }), series({ id: 'a', dueDate: '2026-11-02' }), series({ id: 'missing', cashMode: 'unknown' })];
  const p = planner(); const before = JSON.stringify([p, input]);
  const result = buildRadar(p, input, today);
  assert.deepEqual(result.items.map(i => i.id), buildRadar(p, [...input].reverse(), today).items.map(i => i.id));
  assert.equal(new Set(result.items.map(i => i.id)).size, result.items.length);
  assert.equal(JSON.stringify([p, input]), before);
  assert.deepEqual(result.items.map(i => i.type), ['expense-overdue', 'expense-overdue', 'expense-missing']);
});
test('Radar: prima sotto riserva, prima sottozero e minimo hanno date distinte', () => {
  const expenses = [series({ id: 'first', dueDate: '2026-11-19', amountCents: 85000 }), series({ id: 'zero', dueDate: '2026-11-20', amountCents: 20000 }), series({ id: 'min', dueDate: '2026-11-21', amountCents: 1000 })];
  const result = buildRadar(planner({ reserveCents: 20000 }), expenses, today);
  const critical = type(result, 'critical');
  assert.equal(critical.length, 1);
  assert.equal(result.projection.firstCriticalDate, '2026-11-19');
  assert.equal(result.projection.firstBelowZero, '2026-11-20');
  assert.equal(result.projection.minimumDate, '2026-11-21');
  assert.deepEqual(critical[0].movements.map(m => m.date), ['2026-11-19', '2026-11-20']);
  assert.match(critical[0].description, /non attribuita a un singolo pagamento/);
});
test('Radar: riserva zero e saldo zero non producono criticità falsa', () => {
  const result = buildRadar(planner({ reserveCents: 0, openingBalanceCents: 0 }), [], today);
  assert.equal(type(result, 'critical').length, 0);
  assert.equal(result.projection.firstCriticalDate, null);
  assert.equal(result.projection.firstBelowZero, null);
});
test('Radar: saldo già negativo parte dalla data di riferimento, anche senza movimenti', () => {
  const result = buildRadar(planner({ openingBalanceCents: -1 }), [], today);
  assert.equal(result.projection.firstBelowZero, '2026-11-01');
  assert.equal(type(result, 'critical')[0].movements.length, 0);
});
test('Radar: riusa motore, centesimi e orizzonte esatti del Planning', () => {
  const p = planner(), expenses = [series()];
  const result = buildRadar(p, expenses, today);
  assert.equal(planningEnd(today), '2027-11-01');
  const original = project(p, expenses, today, result.end);
  for (const key of Object.keys(original)) assert.deepEqual(result.projection[key], original[key]);
});
test('Radar: errore non diventa proiezione zero o lista silenziosamente completa', () => {
  const result = buildRadar(planner({ reserveCents: -1 }), [series()], today);
  assert.equal(result.projection, null); assert.match(result.error, /Planning non valido/);
  assert.equal(type(result, 'calculation').length, 1);
});
test('Radar: elenco oltre tre completo senza troncare serie ricorrenti', () => {
  const s = series({ dueDate: '2025-11-01', recurrenceMonths: 1, count: 24 });
  const result = buildRadar(planner(), [s], today);
  assert.equal(type(result, 'expense-overdue').length, 13);
});
test('Agenda: Oggi non include il futuro, categoria e stato si combinano col giorno', () => {
  const data = occurrences([series(), series({ id: 'future', dueDate: '2026-11-19' }), series({ id: 'other', category: 'auto' })], '2026-12-01');
  assert.deepEqual(filterAgenda(data, { period: 'today', category: 'casa' }, today).map(o => o.seriesId), ['expense']);
  assert.deepEqual(filterAgenda(data, { period: 'day', date: '2026-11-19', category: 'casa' }, today).map(o => o.seriesId), ['future']);
  assert.equal(filterAgenda(data, { period: 'day', date: '2026-11-19', category: 'auto' }, today).length, 0);
});
test('Agenda: Prossime esclude oggi e arretrati, lo storico resta accessibile', () => {
  const data = occurrences([series(), series({ id: 'future', dueDate: '2026-11-19' }), series({ id: 'paid', dueDate: '2026-10-01', overrides: { '2026-10-01': { actual: { date: '2026-10-01', amountCents: 10 } } } }), series({ id: 'archive', dueDate: '2026-10-01', archived: true })], '2026-12-01');
  assert.deepEqual(filterAgenda(data, { period: 'upcoming' }, today).map(o => o.seriesId), ['future']);
  assert.deepEqual(filterAgenda(data, { period: 'all', status: 'completed' }, today).map(o => o.seriesId), ['paid']);
  assert.deepEqual(filterAgenda(data, { period: 'all', status: 'archived' }, today).map(o => o.seriesId), ['archive']);
});
test('Agenda: Arretrati non ribattezza come scaduti pagamenti completati o archiviati', () => {
  const data = occurrences([series({ dueDate: '2026-11-01' }), series({ id: 'paid', dueDate: '2026-11-01', overrides: { '2026-11-01': { actual: { date: '2026-11-01', amountCents: 10 } } } }), series({ id: 'archived', dueDate: '2026-11-01', archived: true })], '2026-12-01');
  assert.deepEqual(filterAgenda(data, { period: 'overdue', status: 'all' }, today).map(o => o.seriesId), ['expense']);
  assert.equal(filterAgenda(data, { period: 'overdue', status: 'completed' }, today).length, 0);
  assert.equal(filterAgenda(data, { period: 'overdue', status: 'archived' }, today).length, 0);
});
