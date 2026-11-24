import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { SCHEMA_VERSION, emptyPlanner, validateSeries, occurrences, updateSeries, getOccurrence, setOccurrenceActual, setOccurrenceCancelled, migrate, project, cashReport } from '../../planning.js';
import { buildRadar, filterAgenda } from '../../radar.js';

const today = '2026-11-18';
const series = (extra = {}) => ({ id: 'r@1', title: 'Rata', dueDate: '2026-01-20', recurrenceMonths: 1, amountCents: 10001, cashMode: 'same', cashDate: null, endDate: null, count: null, overrides: {}, archived: false, completed: false, category: 'casa', reminderDays: [7], ...extra });
const planner = (extra = {}) => ({ ...emptyPlanner(), ready: true, openingBalanceCents: 100000, reserveCents: 0, balanceDate: '2026-11-10', sameDayActualsIncluded: true, ...extra });
const dates = (s, end = '2027-04-30') => occurrences([s], end).map(o => o.key);
const report = (s, p = planner()) => cashReport(p, [s], '2026-11-01', '2026-11-30', today);

test('giorno 20: gennaio e dicembre esclusi non consumano count; until resta inclusivo', () => {
  const s = series({ monthlyRule: { kind: 'day', day: 20 }, excludedMonths: [1, 12], count: 11 });
  validateSeries(s);
  assert.equal(dates(s).length, 11);
  assert.equal(dates(s)[0], '2026-02-20');
  assert.equal(dates(s).at(-1), '2027-02-20');
  assert.equal(dates({ ...s, endDate: '2026-11-20' }).length, 10);
  assert.equal(dates({ ...s, endDate: '2026-11-19' }).at(-1), '2026-10-20');
});
test('giorno 31 e bisestili: clamp senza deriva, escluse le mensilità selezionate', () => {
  const s = series({ dueDate: '2024-01-31', monthlyRule: { kind: 'day', day: 31 }, excludedMonths: [3], count: 4 });
  assert.deepEqual(dates(s, '2024-06-30'), ['2024-01-31', '2024-02-29', '2024-04-30', '2024-05-31']);
  assert.deepEqual(dates({ ...s, dueDate: '2025-01-31', count: 3 }, '2025-05-31'), ['2025-01-31', '2025-02-28', '2025-04-30']);
});
test('primo mercoledì: confine anno, mesi esclusi, limite e data iniziale', () => {
  const s = series({ dueDate: '2026-11-01', monthlyRule: { kind: 'weekday', ordinal: 1, weekday: 3 }, excludedMonths: [12, 1], count: 3 });
  assert.deepEqual(dates(s), ['2026-11-04', '2027-02-03', '2027-03-03']);
  assert.deepEqual(dates({ ...s, dueDate: '2026-11-05', count: 1 }), ['2027-02-03']);
  assert.deepEqual(dates({ ...s, endDate: '2027-02-03' }), ['2026-11-04', '2027-02-03']);
});
test('ultimo e quinto giorno settimanale, domenica zero, febbraio bisestile', () => {
  const s = series({ dueDate: '2024-02-01', monthlyRule: { kind: 'weekday', ordinal: -1, weekday: 4 }, count: 2 });
  assert.deepEqual(dates(s, '2024-03-31'), ['2024-02-29', '2024-03-28']);
  assert.deepEqual(dates({ ...s, monthlyRule: { kind: 'weekday', ordinal: 5, weekday: 4 } }, '2024-06-30'), ['2024-02-29', '2024-05-30']);
  assert.deepEqual(dates({ ...s, monthlyRule: { kind: 'weekday', ordinal: 1, weekday: 0 }, count: 1 }, '2024-03-31'), ['2024-02-04']);
});
test('legacy: doppi limiti e nessuna regola nuova mantengono date e numero', () => {
  const old = series({ dueDate: '2026-01-31', endDate: '2026-04-30', count: 2 });
  assert.deepEqual(dates(old), ['2026-01-31', '2026-02-28']);
  const next = updateSeries(old, { title: 'Nuovo titolo' });
  assert.equal(next.endDate, old.endDate); assert.equal(next.count, 2);
  assert.deepEqual(dates(next), dates(old));
  assert.throws(() => updateSeries(next, { count: 4 }), /solo termine/);
  assert.equal(updateSeries(next, { endDate: null, count: 4 }).count, 4);
});
test('regole dopo effettivi ed eccezioni: snapshot conserva identità e non ricrea rate nello stesso mese', () => {
  let s = series({ dueDate: '2026-10-20', count: 5, cashMode: 'date', cashDate: '2026-10-22', overrides: {
    '2026-11-20': { actual: { date: '2026-11-05', amountCents: 9876 } },
    '2026-12-20': { title: 'Eccezione', dueDate: '2026-12-22', cashMode: 'unknown', amountCents: 7777 },
  } });
  const previous = JSON.stringify(s);
  const paid = getOccurrence(s, '2026-11-20');
  s = updateSeries(s, { title: 'Aggiornata', amountCents: 20000, dueDate: '2026-10-01', monthlyRule: { kind: 'weekday', ordinal: 1, weekday: 3 }, excludedMonths: [12] });
  assert.equal(s.id, 'r@1'); assert.equal(getOccurrence(s, '2026-11-20').id, paid.id);
  for (const key of ['title', 'amountCents', 'dueDate', 'cashDate', 'actual']) assert.deepEqual(getOccurrence(s, '2026-11-20')[key], paid[key]);
  assert.equal(getOccurrence(s, '2026-11-04'), null);
  assert.equal(getOccurrence(s, '2026-12-20').amountCents, 7777);
  assert.equal(getOccurrence(s, '2026-12-20').dueDate, '2026-12-22');
  assert.equal(getOccurrence(s, '2026-12-20').cashDate, null);
  assert.equal(getOccurrence(s, '2027-01-06').amountCents, 20000);
  assert.deepEqual(s.overrides, JSON.parse(previous).overrides);
  const again = updateSeries(s, { dueDate: '2027-01-31', monthlyRule: { kind: 'day', day: 31 }, count: 1 });
  assert.deepEqual(getOccurrence(again, '2026-11-20').actual, paid.actual);
  assert.equal(getOccurrence(again, '2026-11-20').dueDate, '2026-11-20');
  assert.equal(report(again).expenseActualCents, 9876);
  assert.equal(report(again).rows.filter(o => o.actual).length, 1);
  assert.equal(project(planner(), [again], today, '2026-11-30').rows.length, 0);
  const applied = project(planner({ balanceDate: '2026-11-01' }), [again], today, '2026-11-30');
  assert.equal(applied.rows.length, 1); assert.equal(applied.endingBalanceCents, 90124);
});
test('incassi e annullamenti storici rimangono conservati dopo spostamento ancora e riduzione termini', () => {
  let s = series({ name: 'Stipendio', dueDate: '2026-11-20', count: 3 });
  s = setOccurrenceActual(s, s.dueDate, { date: '2026-11-05', amountCents: 12345 }, today);
  s = setOccurrenceCancelled(s, '2026-12-20', true);
  s = updateSeries(s, { dueDate: '2027-03-01', monthlyRule: { kind: 'day', day: 1 }, amountCents: 30000, count: 1 });
  const p = planner({ incomes: [s] });
  const r = cashReport(p, [], '2026-11-01', '2026-11-30', today);
  assert.equal(r.incomeActualCents, 12345); assert.equal(r.incomeForecastCents, 0);
  assert.equal(getOccurrence(s, '2026-12-20').cancelled, true);
  s = setOccurrenceCancelled(s, '2026-12-20', false);
  assert.equal(getOccurrence(s, '2026-12-20').amountCents, 10001);
  assert.equal(getOccurrence(s, '2026-12-20').id, 'r@1@2026-12-20');
});
test('cancellazione singola è tombstone: nessuna rata aggiunta, ripristino identico con override', () => {
  const s = series({ dueDate: '2026-11-20', count: 2, overrides: { '2026-11-20': { cashMode: 'date', cashDate: '2026-11-25', amountCents: 12501 } } });
  const cancelled = setOccurrenceCancelled(s, '2026-11-20', true);
  assert.deepEqual(dates(cancelled), ['2026-11-20', '2026-12-20']);
  assert.equal(getOccurrence(cancelled, '2027-01-20'), null);
  assert.equal(report(cancelled).expenseForecastCents, 0);
  assert.equal(project(planner(), [cancelled], today, '2026-11-30').rows.length, 0);
  assert.equal(buildRadar(planner(), [cancelled], today).items.filter(i => i.occurrenceId === 'r@1@2026-11-20').length, 0);
  assert.equal(filterAgenda(occurrences([cancelled], '2026-11-30'), { period: 'all' }, today).length, 0);
  assert.equal(filterAgenda(occurrences([cancelled], '2026-11-30'), { period: 'all', status: 'cancelled' }, today).length, 1);
  assert.throws(() => setOccurrenceActual(cancelled, '2026-11-20', { date: today, amountCents: 1 }, today), /Ripristina/);
  const restored = setOccurrenceCancelled(cancelled, '2026-11-20', false);
  assert.equal(report(restored).expenseForecastCents, 12501);
  assert.equal(getOccurrence(restored, '2026-11-20').cashDate, '2026-11-25');
  assert.deepEqual(s.overrides['2026-11-20'], { cashMode: 'date', cashDate: '2026-11-25', amountCents: 12501 });
});
test('pagata/incassata, completata legacy e promemoria fatto non possono essere nascosti', () => {
  for (const o of [{ actual: { date: today, amountCents: 100 } }, { legacyCompleted: true }, { done: true, amountCents: 0 }]) {
    const s = series({ dueDate: '2026-11-20', count: 1, overrides: { '2026-11-20': o } });
    assert.throws(() => setOccurrenceCancelled(s, '2026-11-20', true), /completata/);
    assert.throws(() => validateSeries({ ...s, overrides: { '2026-11-20': { ...o, cancelled: true } } }), /completata/);
  }
});
test('snapshot preserva done a importo zero anche quando il nuovo importo serie è positivo', () => {
  const old = series({ dueDate: '2026-11-20', amountCents: 0, overrides: { '2026-11-20': { done: true } } });
  const next = updateSeries(old, { amountCents: 5000 });
  assert.equal(getOccurrence(next, '2026-11-20').amountCents, 0);
  assert.equal(getOccurrence(next, '2026-11-20').completed, true);
});
test('backup: migrazione esplicita v1/v2 e roundtrip v3 con snapshot e tombstone', () => {
  let s = setOccurrenceCancelled(series({ count: 3 }), '2026-02-20', true);
  s = updateSeries(s, { monthlyRule: { kind: 'weekday', ordinal: 1, weekday: 3 }, excludedMonths: [1, 12] });
  const data = { schemaVersion: SCHEMA_VERSION, planner: planner({ incomes: [s] }), deadlines: [s] };
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(data)), today), data);
  const legacy = { schemaVersion: 2, planner: planner(), deadlines: [series({ endDate: '2026-12-20', count: 2 })] };
  const before = JSON.stringify(legacy), migrated = migrate(legacy, today);
  assert.equal(migrated.schemaVersion, 3); assert.deepEqual(migrated.deadlines, legacy.deadlines); assert.equal(JSON.stringify(legacy), before);
  assert.equal(migrate({ schemaVersion: 1, deadlines: [series()] }, today).schemaVersion, 3);
});
test('import: nuovi campi corrotti, XSS strutturale e snapshot orfani rifiutati senza mutare input', () => {
  const bad = [
    { monthlyRule: { kind: 'day', day: 0 } }, { monthlyRule: { kind: 'day', day: 32 } }, { monthlyRule: { kind: 'day', day: 1, script: '<img>' } },
    { monthlyRule: { kind: 'weekday', ordinal: 0, weekday: 3 } }, { monthlyRule: { kind: 'weekday', ordinal: 1, weekday: 7 } },
    { monthlyRule: { kind: 'weekday', ordinal: '1', weekday: 3 } }, { monthlyRule: '<img src=x onerror=1>' },
    { excludedMonths: [1, 1] }, { excludedMonths: [0] }, { excludedMonths: ['12'] }, { excludedMonths: Array.from({ length: 12 }, (_, i) => i + 1) },
    { recurrenceMonths: 12, excludedMonths: [1] }, { excludedMonths: { 1: true } }, { snapshots: [] }, { snapshots: { '2026-01-20': {} } },
    { overrides: { '2026-01-20': { cancelled: 'true' } } },
  ];
  const frozen = updateSeries(series({ overrides: { '2026-01-20': { amountCents: 100 } } }), { amountCents: 200 });
  for (const patch of [{ actual: {} }, { amountCents: 1.1 }, { cashDate: '<svg onload=1>' }, { reminderDays: ['7'] }, { notes: {} }, { dueDate: '2026-02-30' }]) bad.push({ ...frozen, snapshots: { '2026-01-20': { ...frozen.snapshots['2026-01-20'], ...patch } } });
  for (const extra of bad) {
    const data = { schemaVersion: 3, planner: emptyPlanner(), deadlines: [series(extra)] }, before = JSON.stringify(data);
    assert.throws(() => migrate(data, today), JSON.stringify(extra));
    assert.equal(JSON.stringify(data), before);
  }
});
test('fusi orari: primo mercoledì e mese escluso sono date civili invarianti', () => {
  const s = series({ dueDate: '2024-01-01', monthlyRule: { kind: 'weekday', ordinal: 1, weekday: 3 }, excludedMonths: [3], count: 4 });
  const code = `import {occurrences} from './planning.js'; console.log(JSON.stringify(occurrences([${JSON.stringify(s)}],'2024-06-30').map(o=>o.key)));`;
  const results = ['UTC', 'Europe/Rome', 'America/New_York'].map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('../..', import.meta.url), env: { ...process.env, TZ }, encoding: 'utf8' }));
  assert.equal(new Set(results).size, 1);
});
