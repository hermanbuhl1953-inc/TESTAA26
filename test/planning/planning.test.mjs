import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { emptyPlanner, validDate, shiftMonth, validateSeries, validatePlanner, occurrences, migrate, project, setOccurrenceActual } from '../../planning.js';

const today = '2026-11-18';
const series = (extra = {}) => ({ id: 'bolletta', title: 'Bolletta', dueDate: '2026-01-31', recurrenceMonths: 1, amountCents: 10000, cashMode: 'same', cashDate: null, endDate: null, count: null, overrides: {}, archived: false, completed: false, category: 'casa', reminderDays: [7, 1], ...extra });
const balance = (extra = {}) => ({ ...emptyPlanner(), ready: true, openingBalanceCents: 100000, reserveCents: 20000, balanceDate: '2026-11-01', sameDayActualsIncluded: true, ...extra });
const once = (date, amount, extra = {}) => series({ dueDate: date, recurrenceMonths: 0, amountCents: amount, ...extra });
const calc = (p, expenses = [], end = '2027-11-01') => project(p, expenses, today, end);

test('date civili: validazione rigorosa e anni bisestili', () => {
  assert.ok(validDate('2024-02-29'));
  for (const d of ['2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-1-01', '1899-01-01', '', null]) assert.equal(validDate(d), false);
});
test('planning non pronto ammette soltanto null o una data civile valida come riferimento', () => {
  for (const balanceDate of [null, '2026-11-01', '2024-02-29', '2027-01-01']) {
    assert.doesNotThrow(() => validatePlanner({ ...emptyPlanner(), balanceDate }, today));
  }
});
test('data saldo invalida viene rifiutata sia con planning pronto sia non pronto', () => {
  const invalid = ['', undefined, 0, false, {}, [], '2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '1899-12-31', '\"><img src=x onerror="globalThis.__planningXss=1">'];
  for (const ready of [false, true]) {
    for (const balanceDate of invalid) assert.throws(() => validatePlanner(balance({ ready, balanceDate }), today), /data|saldo/i);
  }
});
test('planning pronto richiede una data saldo valorizzata e non futura', () => {
  assert.doesNotThrow(() => validatePlanner(balance({ balanceDate: today }), today));
  for (const balanceDate of [null, '2026-11-19']) assert.throws(() => validatePlanner(balance({ balanceDate }), today));
});
test('migrazione backup v2 rifiuta la data saldo malevola prima di cambiare i dati', () => {
  for (const ready of [false, true]) {
    const data = { schemaVersion: 2, planner: balance({ ready, balanceDate: '\"><img src=x onerror="globalThis.__planningXss=1">' }), deadlines: [] };
    const original = JSON.stringify(data);
    assert.throws(() => migrate(data, today), /data|saldo/i);
    assert.equal(JSON.stringify(data), original);
  }
});
test('31 mensile resta ancorato: febbraio 28, marzo 31, aprile 30', () => {
  assert.deepEqual(occurrences([series()], '2026-04-30').map(o => o.dueDate), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});
test('29 febbraio annuale recupera il 29 nel prossimo anno bisestile', () => {
  const dates = occurrences([series({ dueDate: '2024-02-29', recurrenceMonths: 12 })], '2028-02-29').map(o => o.key);
  assert.equal(dates[1], '2025-02-28'); assert.equal(dates[4], '2028-02-29');
});
test('fine mese 30 originale non viene convertito arbitrariamente in ultimo giorno', () => {
  assert.equal(shiftMonth('2026-01-30', 2), '2026-03-30');
});
test('termine per data inclusivo', () => {
  assert.deepEqual(occurrences([series({ endDate: '2026-03-31' })], '2027-01-01').map(o => o.key), ['2026-01-31', '2026-02-28', '2026-03-31']);
});
test('termine numero include la prima e usa il limite più restrittivo', () => {
  assert.equal(occurrences([series({ count: 2 })], '2028-01-01').length, 2);
  assert.equal(occurrences([series({ count: 4, endDate: '2026-02-28' })], '2028-01-01').length, 2);
});
test('una tantum non viene ripetuta', () => assert.equal(occurrences([once('2026-11-20', 1)], '2028-12-31').length, 1));
test('ricorrenza con 1200 occorrenze mantiene ultimo identificativo', () => {
  const items = occurrences([series({ dueDate: '1900-01-31', count: 1200 })], '2026-12-31');
  assert.equal(items.length, 1200); assert.equal(items.at(-1).key, '1999-12-31');
});
test('singola occorrenza mantiene identificativo e successive invariate', () => {
  const s = series({ overrides: { '2026-02-28': { dueDate: '2026-03-02', cashMode: 'date', cashDate: '2026-03-05', amountCents: 9000 } } });
  validateSeries(s);
  const items = occurrences([s], '2026-03-31');
  assert.equal(items[1].id, 'bolletta@2026-02-28'); assert.equal(items[1].cashDate, '2026-03-05'); assert.equal(items[2].dueDate, '2026-03-31'); assert.equal(items[2].amountCents, 10000);
});
test('cassa distinta conserva ancora propria senza drift', () => {
  const items = occurrences([series({ cashMode: 'date', cashDate: '2026-02-28' })], '2026-03-31');
  assert.equal(items[1].cashDate, '2026-03-28'); assert.equal(items[2].cashDate, '2026-04-28');
});
test('effettivo totale sostituisce previsione, non somma una seconda spesa', () => {
  const s = setOccurrenceActual(once('2026-11-20', 10000), '2026-11-20', { date: '2026-11-15', amountCents: 8500 }, today);
  const p = calc(balance(), [s]); assert.equal(p.rows.length, 1); assert.equal(p.endingBalanceCents, 91500);
});
test('correzione effettivo cambia importo e data senza mutare serie originale', () => {
  const original = once('2026-11-20', 10000);
  const paid = setOccurrenceActual(original, original.dueDate, { date: '2026-11-15', amountCents: 8500 }, today);
  const fixed = setOccurrenceActual(paid, original.dueDate, { date: '2026-11-16', amountCents: 9000 }, today);
  assert.equal(calc(balance(), [fixed]).endingBalanceCents, 91000); assert.deepEqual(original.overrides, {}); assert.equal(calc(balance(), [fixed]).rows[0].date, '2026-11-16');
});
test('annullamento riattiva la previsione, senza perdere ancora', () => {
  const s = once('2026-11-20', 10000);
  const paid = setOccurrenceActual(s, s.dueDate, { date: '2026-11-15', amountCents: 8500 }, today);
  const undo = setOccurrenceActual(paid, s.dueDate, null, today);
  assert.equal(calc(balance(), [undo]).endingBalanceCents, 90000); assert.equal(occurrences([undo], '2026-11-30')[0].completed, false);
});
test('effettivi precedenti al saldo assorbiti', () => {
  const s = setOccurrenceActual(once('2026-11-20', 10000), '2026-11-20', { date: '2026-10-30', amountCents: 10000 }, today);
  assert.equal(calc(balance(), [s]).endingBalanceCents, 100000);
});
test('effettivi stesso giorno saldo richiedono inclusione esplicita', () => {
  const s = setOccurrenceActual(once('2026-11-20', 10000), '2026-11-20', { date: '2026-11-01', amountCents: 10000 }, today);
  assert.equal(calc(balance(), [s]).endingBalanceCents, 100000);
  assert.equal(calc(balance({ sameDayActualsIncluded: false }), [s]).endingBalanceCents, 90000);
  assert.throws(() => validatePlanner(balance({ sameDayActualsIncluded: null }), today));
});
test('effettivo dopo saldo ma prima di oggi viene applicato', () => {
  const s = setOccurrenceActual(once('2026-11-20', 10000), '2026-11-20', { date: '2026-11-05', amountCents: 10000 }, today);
  assert.equal(calc(balance(), [s]).rows[0].date, '2026-11-05');
});
test('saldo negativo ammesso; saldo futuro vietato', () => {
  assert.equal(calc(balance({ openingBalanceCents: -3000 })).deficitCents, 3000);
  assert.throws(() => calc(balance({ balanceDate: '2026-11-19' })));
});
test('effettivi futuri, nulli o negativi rifiutati', () => {
  const s = once('2026-11-20', 10000);
  for (const a of [{ date: '2026-11-19', amountCents: 1 }, { date: today, amountCents: -1 }, { date: '', amountCents: 1 }, { date: today, amountCents: 0 }]) assert.throws(() => setOccurrenceActual(s, s.dueDate, a, today));
});
test('arretrati non sono spostati o pagati oggi', () => {
  const p = calc(balance(), [once('2026-11-10', 10000)]);
  assert.equal(p.rows.length, 0); assert.equal(p.endingBalanceCents, 100000); assert.match(p.warnings.join(), /arretrata/);
});
test('arretrato riprogrammato esplicitamente entra nella nuova data cassa', () => {
  const p = calc(balance(), [once('2026-10-10', 10000, { cashMode: 'date', cashDate: '2026-11-22' })]);
  assert.equal(p.rows[0].date, '2026-11-22'); assert.equal(p.endingBalanceCents, 90000);
});
test('date sconosciute e importo mancante sono segnalati senza certezza falsa', () => {
  const p = calc(balance(), [once('2026-11-20', 0, { cashMode: 'unknown' })]);
  assert.match(p.warnings.join(), /importo mancante/); assert.match(p.warnings.join(), /cassa sconosciuta/); assert.equal(p.rows.length, 0);
});
test('minimo inframensile, prima criticità e deficit sono distinti', () => {
  const p = calc(balance({ openingBalanceCents: 30000, reserveCents: 20000, incomes: [once('2026-11-29', 100000, { id: 'stipendio', name: 'Stipendio' })] }), [once('2026-11-19', 15000), once('2026-11-25', 20000, { id: 'rata' })]);
  assert.equal(p.firstCriticalDate, '2026-11-19'); assert.equal(p.minimumDate, '2026-11-25'); assert.equal(p.minimumCents, -5000); assert.equal(p.deficitCents, 5000); assert.equal(p.marginCents, -25000); assert.equal(p.endingBalanceCents, 95000);
  assert.equal(p.months[0].minimumCents, -5000); assert.equal(p.months[0].endingBalanceCents, 95000); assert.equal(p.months[0].incomeCents, 100000); assert.equal(p.months[0].expensesCents, 35000);
});
test('uscite prima entrate stesso giorno: stima prudenziale', () => {
  const p = calc(balance({ openingBalanceCents: 10000, reserveCents: 0, incomes: [once('2026-11-20', 20000)] }), [once('2026-11-20', 20000)]);
  assert.equal(p.minimumCents, -10000); assert.equal(p.endingBalanceCents, 10000);
});
test('entrata prevista non diventa incasso, incasso sostituisce previsione', () => {
  const s = once('2026-11-21', 100000, { id: 'stipendio', name: 'Stipendio' });
  assert.equal(calc(balance({ incomes: [s] })).rows[0].actual, false);
  const paid = setOccurrenceActual(s, s.dueDate, { date: '2026-11-17', amountCents: 95000 }, today);
  const p = calc(balance({ incomes: [paid] })); assert.equal(p.rows.length, 1); assert.equal(p.endingBalanceCents, 195000); assert.equal(p.rows[0].actual, true);
});
test('entrata arretrata non viene considerata incassata', () => {
  const p = calc(balance({ incomes: [once('2026-11-10', 100000)] })); assert.equal(p.endingBalanceCents, 100000); assert.ok(p.warnings.length);
});
test('effettivo anticipato di scadenza oltre orizzonte comunque applicato', () => {
  const s = setOccurrenceActual(once('2028-01-01', 10000), '2028-01-01', { date: today, amountCents: 9000 }, today);
  assert.equal(calc(balance(), [s]).endingBalanceCents, 91000);
});
test('cassa anticipata rispetto a scadenza oltre orizzonte comunque proiettata', () => {
  const s = once('2028-01-01', 10000, { cashMode: 'date', cashDate: '2026-12-20' });
  assert.equal(calc(balance(), [s]).endingBalanceCents, 90000);
});
test('archiviazione esclude previsioni ma conserva effettivi', () => {
  const s = once('2026-11-20', 10000, { archived: true });
  assert.equal(calc(balance(), [s]).endingBalanceCents, 100000);
  const paid = setOccurrenceActual(s, s.dueDate, { date: today, amountCents: 9000 }, today);
  assert.equal(calc(balance(), [paid]).endingBalanceCents, 91000);
});
test('migrazione v1 preserva titolo, ancora osservata e completamenti senza inventare effettivi', () => {
  const old = { schemaVersion: 1, deadlines: [{ ...series(), completed: true }] };
  delete old.deadlines[0].cashMode; delete old.deadlines[0].overrides;
  const next = migrate(old, today);
  assert.equal(next.schemaVersion, 2); assert.equal(next.deadlines[0].dueDate, old.deadlines[0].dueDate); assert.equal(next.deadlines[0].cashMode, 'unknown'); assert.equal(next.planner.ready, false);
  const first = occurrences(next.deadlines, '2026-02-28')[0]; assert.ok(first.legacyCompleted); assert.equal(first.actual, null); assert.ok(next.migrationNotice); assert.equal(old.schemaVersion, 1);
});
test('backup v2 roundtrip conserva saldo, entrate, termini, eccezioni ed effettivi', () => {
  const s = setOccurrenceActual(series({ count: 12 }), '2026-02-28', { date: '2026-02-27', amountCents: 9900 }, today);
  const data = { schemaVersion: 2, planner: balance({ incomes: [once('2026-12-01', 100000)] }), deadlines: [s] };
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(data)), today), data);
});
test('migrazione rifiuta versioni future, duplicati e storico corrotto', () => {
  assert.throws(() => migrate({ schemaVersion: 3, deadlines: [] }, today));
  assert.throws(() => migrate({ schemaVersion: 2, planner: emptyPlanner(), deadlines: [series(), series()] }, today));
  assert.throws(() => validateSeries(series({ overrides: { '2026-02-27': { actual: null } } })));
  assert.throws(() => validateSeries(series({ overrides: { '2026-02-28': { archived: true } } })));
});
test('termini, limiti monetari, ricorrenze e date corrotte rifiutati', () => {
  for (const extra of [{ recurrenceMonths: -1 }, { recurrenceMonths: 1.5 }, { amountCents: 1.5 }, { amountCents: 1e15 }, { count: 0 }, { count: 1201 }, { endDate: '2025-01-01' }, { cashMode: 'date', cashDate: null }]) assert.throws(() => validateSeries(series(extra)));
});
test('effettivi futuri importati sono rifiutati prima di persistere', () => {
  const s = once('2026-11-20', 10, { overrides: { '2026-11-20': { actual: { date: '2026-11-19', amountCents: 10 } } } });
  assert.throws(() => migrate({ schemaVersion: 2, planner: emptyPlanner(), deadlines: [s] }, today));
});
test('date e proiezione identiche in fusi UTC, Roma e New York (DST)', () => {
  const code = `import {shiftMonth,occurrences} from './planning.js';const s=${JSON.stringify(series({ dueDate: '2026-01-31', count: 5 }))};console.log(JSON.stringify(occurrences([s],'2026-05-31').map(o=>[o.key,o.cashDate])));`;
  const outputs = ['UTC', 'Europe/Rome', 'America/New_York'].map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('../..', import.meta.url), env: { ...process.env, TZ }, encoding: 'utf8' }));
  assert.equal(new Set(outputs).size, 1);
});
