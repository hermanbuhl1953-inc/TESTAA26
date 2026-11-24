// Motore puro: date civili ISO, importi interi in centesimi, nessun accesso al browser.
export const SCHEMA_VERSION = 3;
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return y >= 1900 && y <= 9998 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}
function daysInMonth(y, m) { return [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
export function shiftMonth(anchor, offset) {
  if (!validDate(anchor) || !Number.isInteger(offset)) throw new Error('Data o intervallo non valido.');
  const [y, m, d] = anchor.split('-').map(Number);
  const total = y * 12 + m - 1 + offset;
  const year = Math.floor(total / 12), month = total % 12 + 1;
  const result = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, daysInMonth(year, month))).padStart(2, '0')}`;
  if (!validDate(result)) throw new Error('Data oltre il limite 1900–9998.');
  return result;
}
export function emptyPlanner() { return { ready: false, openingBalanceCents: 0, reserveCents: 0, balanceDate: null, sameDayActualsIncluded: null, incomes: [] }; }
function money(n, signed = false) { return Number.isSafeInteger(n) && Math.abs(n) <= 1000000000000 && (signed || n >= 0); }
function assert(ok, message) { if (!ok) throw new Error(message); }
export function validateSeries(s) {
  assert(s && typeof s.id === 'string' && s.id.length > 0 && s.id.length <= 150 && typeof (s.title ?? s.name) === 'string' && (s.title ?? s.name).trim().length > 0, 'Serie priva di identificativo o titolo.');
  assert(validDate(s.dueDate) && Number.isInteger(s.recurrenceMonths) && s.recurrenceMonths >= 0 && s.recurrenceMonths <= 120, 'Data o ricorrenza non valida.');
  assert(money(s.amountCents), 'Importo non valido o oltre il limite.');
  assert(['same', 'date', 'unknown'].includes(s.cashMode), 'Specifica la data di cassa.');
  assert(s.cashMode !== 'date' || validDate(s.cashDate), 'Data di cassa non valida.');
  assert(s.endDate === null || validDate(s.endDate) && s.endDate >= s.dueDate, 'Termine per data non valido.');
  assert(s.count === null || Number.isInteger(s.count) && s.count >= 1 && s.count <= 1200, 'Numero occorrenze: da 1 a 1200.');
  validateRule(s);
  assert(s.overrides && typeof s.overrides === 'object' && !Array.isArray(s.overrides), 'Eccezioni non valide.');
  assert(s.snapshots === undefined || s.snapshots && typeof s.snapshots === 'object' && !Array.isArray(s.snapshots), 'Istantanee non valide.');
  for (const [key, snapshot] of Object.entries(s.snapshots ?? {})) {
    assert(validDate(key) && Object.hasOwn(s.overrides, key), 'Istantanea senza eccezione collegata.');
    validateSnapshot(snapshot);
  }
  const overrideKeys = Object.keys(s.overrides);
  const lastKey = overrideKeys.filter(validDate).sort().at(-1);
  const scheduledKeys = new Set(lastKey ? [...scheduled(s, lastKey)].map(o => o.key) : []);
  for (const [key, o] of Object.entries(s.overrides)) {
    assert(validDate(key) && (Object.hasOwn(s.snapshots ?? {}, key) || scheduledKeys.has(key)), 'Identificativo occorrenza non valido.');
    assert(o && typeof o === 'object' && !Array.isArray(o), 'Eccezione non valida.');
    assert(Object.keys(o).every(k => ['amountCents', 'dueDate', 'cashMode', 'cashDate', 'legacyCompleted', 'actual', 'done', 'title', 'category', 'notes', 'reminderDays', 'cancelled'].includes(k)), 'Campo eccezione non supportato.');
    assert(o.title === undefined || typeof o.title === 'string' && o.title.trim().length > 0 && o.title.length <= 100, 'Titolo occorrenza non valido.');
    assert(o.category === undefined || typeof o.category === 'string', 'Categoria occorrenza non valida.');
    assert(o.notes === undefined || typeof o.notes === 'string' && o.notes.length <= 500, 'Note occorrenza non valide.');
    assert(o.reminderDays === undefined || Array.isArray(o.reminderDays) && o.reminderDays.every(d => Number.isInteger(d) && d >= 0 && d <= 365), 'Promemoria occorrenza non validi.');
    assert(o.amountCents === undefined || money(o.amountCents), 'Importo occorrenza non valido.');
    assert(o.dueDate === undefined || validDate(o.dueDate), 'Scadenza occorrenza non valida.');
    assert(o.cashMode === undefined || ['same', 'date', 'unknown'].includes(o.cashMode), 'Modalità cassa non valida.');
    assert(o.cashDate === undefined || o.cashDate === null || validDate(o.cashDate), 'Data cassa occorrenza non valida.');
    assert(o.cashMode !== 'date' || validDate(o.cashDate), 'Indica la data di cassa della singola occorrenza.');
    assert(o.legacyCompleted === undefined || typeof o.legacyCompleted === 'boolean', 'Stato storico non valido.');
    assert(o.done === undefined || typeof o.done === 'boolean' && (!o.done || (o.amountCents ?? s.snapshots?.[key]?.amountCents ?? s.amountCents) === 0 && !o.actual), 'Solo promemoria senza importo possono essere completati senza movimento.');
    assert(o.cancelled === undefined || typeof o.cancelled === 'boolean', 'Annullamento non valido.');
    assert(!o.cancelled || !o.actual && !o.legacyCompleted && !o.done, 'Non puoi annullare una occorrenza già completata: lo storico resta visibile.');
    if (o.actual != null) assert(o.actual && typeof o.actual === 'object' && !Array.isArray(o.actual) && Object.keys(o.actual).every(k => ['date', 'amountCents'].includes(k)) && validDate(o.actual.date) && money(o.actual.amountCents) && o.actual.amountCents > 0, 'Effettivo: data e importo positivo richiesti.');
  }
}
function validateRule(s) {
  const rule = s.monthlyRule;
  assert(rule === undefined || rule === null || rule && typeof rule === 'object' && !Array.isArray(rule), 'Regola mensile non valida.');
  if (rule != null) {
    assert(s.recurrenceMonths > 0, 'La regola richiede una ricorrenza.');
    if (rule.kind === 'day') assert(Object.keys(rule).length === 2 && Number.isInteger(rule.day) && rule.day >= 1 && rule.day <= 31, 'Giorno fisso: da 1 a 31.');
    else assert(rule.kind === 'weekday' && Object.keys(rule).length === 3 && Number.isInteger(rule.ordinal) && [-1, 1, 2, 3, 4, 5].includes(rule.ordinal) && Number.isInteger(rule.weekday) && rule.weekday >= 0 && rule.weekday <= 6, 'Giorno della settimana o posizione non valido.');
  }
  const excluded = s.excludedMonths;
  assert(excluded === undefined || Array.isArray(excluded) && excluded.length < 12 && excluded.every(m => Number.isInteger(m) && m >= 1 && m <= 12) && new Set(excluded).size === excluded.length, 'Mesi esclusi: scegli mesi distinti da 1 a 12, non tutti.');
  assert(!excluded?.length || s.recurrenceMonths > 0, 'I mesi esclusi richiedono una ricorrenza.');
  assert(!excluded?.length || Array.from({ length: 12 }, (_, i) => (Number(s.dueDate.slice(5, 7)) - 1 + i * s.recurrenceMonths) % 12 + 1).some(m => !excluded.includes(m)), 'I mesi esclusi eliminano tutte le ricorrenze della serie.');
}
const snapshotFields = ['title', 'name', 'category', 'notes', 'reminderDays', 'amountCents', 'dueDate', 'cashMode', 'cashDate'];
function validateSnapshot(o) {
  assert(o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every(k => snapshotFields.includes(k)), 'Campo istantanea non supportato.');
  assert(validDate(o.dueDate) && money(o.amountCents) && ['same', 'date', 'unknown'].includes(o.cashMode), 'Istantanea non valida.');
  assert(o.cashDate === null || validDate(o.cashDate), 'Data cassa istantanea non valida.');
  assert(o.cashMode !== 'date' || validDate(o.cashDate), 'Data cassa istantanea obbligatoria.');
  assert(o.cashMode !== 'same' || o.cashDate === o.dueDate, 'Cassa istantanea incoerente.');
  assert(o.cashMode !== 'unknown' || o.cashDate === null, 'Cassa sconosciuta incoerente.');
  assert(typeof (o.title ?? o.name) === 'string' && (o.title ?? o.name).trim().length > 0, 'Titolo istantanea richiesto.');
  for (const field of ['title', 'name', 'category', 'notes']) assert(o[field] === undefined || typeof o[field] === 'string' && o[field].length <= (field === 'notes' ? 500 : 100), 'Testo istantanea non valido.');
  assert(o.reminderDays === undefined || Array.isArray(o.reminderDays) && o.reminderDays.every(d => Number.isInteger(d) && d >= 0 && d <= 365), 'Promemoria istantanea non validi.');
}
function monthOffset(anchor, key) {
  return (Number(key.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 + Number(key.slice(5, 7)) - Number(anchor.slice(5, 7));
}
function ruleDate(s, month, offset) {
  const rule = s.monthlyRule;
  if (!rule) return shiftMonth(s.dueDate, offset);
  const [year, number] = month.split('-').map(Number), last = daysInMonth(year, number);
  let day;
  if (rule.kind === 'day') day = Math.min(rule.day, last);
  else if (rule.ordinal === -1) day = last - (new Date(Date.UTC(year, number - 1, last)).getUTCDay() - rule.weekday + 7) % 7;
  else day = 1 + (rule.weekday - new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 7) % 7 + (rule.ordinal - 1) * 7;
  return day > last ? null : `${month.slice(0, 8)}${String(day).padStart(2, '0')}`;
}
// Il conteggio precede i tombstone: un annullamento non allunga la serie.
// Mesi esclusi e quinti giorni assenti, invece, non consumano il limite.
function* scheduled(s, until, includeCash = false) {
  const protectedMonths = new Set(Object.keys(s.snapshots ?? {}).map(key => key.slice(0, 7)));
  let count = 0;
  for (let step = 0; ; step += 1) {
    if (s.count !== null && count >= s.count) break;
    const offset = step * s.recurrenceMonths;
    const year = Number(s.dueDate.slice(0, 4)) + Math.floor((Number(s.dueDate.slice(5, 7)) - 1 + offset) / 12);
    if (year > 9998) break;
    const month = shiftMonth(s.dueDate.slice(0, 8) + '01', offset);
    const cash = includeCash && s.cashMode === 'date' ? shiftCashDate(s.cashDate, offset) : null;
    if (month.slice(0, 7) > until.slice(0, 7) && (!cash || cash > until)) break;
    if (s.endDate && month > s.endDate) break;
    const key = s.recurrenceMonths ? ruleDate(s, month, offset) : s.dueDate;
    if (key && key >= s.dueDate && (!s.endDate || key <= s.endDate) && !(s.excludedMonths ?? []).includes(Number(month.slice(5, 7)))) {
      count += 1;
      // Una data nuova nello stesso mese non deve ricreare la rata già protetta.
      if ((!protectedMonths.has(key.slice(0, 7)) || Object.hasOwn(s.snapshots, key)) && (key <= until || cash && cash <= until)) yield { key, offset };
    }
    if (!s.recurrenceMonths) break;
    assert(step < 100000, 'Serie oltre il limite di calcolo.');
  }
}
function isOccurrenceDate(s, key) {
  if (!validDate(key)) return false;
  if (Object.hasOwn(s.snapshots ?? {}, key)) return true;
  return [...scheduled(s, key)].some(o => o.key === key);
}
export function occurrences(series, endDate, fromDate = '1900-01-01') {
  assert(validDate(endDate) && validDate(fromDate), 'Intervallo non valido.');
  const result = [];
  for (const s of series) {
    const items = new Map();
    for (const { key, offset } of scheduled(s, endDate, true)) {
      if (key >= fromDate || s.overrides[key]) items.set(key, materialize(s, key, offset));
    }
    for (const key of Object.keys(s.overrides)) {
      if (items.has(key)) continue;
      const o = materialize(s, key, monthOffset(s.dueDate, key));
      if (o.actual || o.dueDate <= endDate || o.cashDate && o.cashDate <= endDate) items.set(key, o);
    }
    result.push(...[...items.values()].sort((a, b) => a.key.localeCompare(b.key)));
  }
  return result;
}
// Le eccezioni sono congelate prima di cambiare regola: nessuna riassegnazione
// di pagamenti o spostamenti alle nuove date generate.
export function updateSeries(series, changes) {
  validateSeries(series);
  assert(changes && Object.keys(changes).every(k => ['title', 'name', 'category', 'notes', 'reminderDays', 'amountCents', 'dueDate', 'cashMode', 'cashDate', 'recurrenceMonths', 'endDate', 'count', 'monthlyRule', 'excludedMonths', 'updatedAt'].includes(k)), 'Modifica serie non supportata.');
  const snapshots = { ...series.snapshots };
  for (const key of Object.keys(series.overrides)) {
    if (snapshots[key]) continue;
    const occurrence = materialize(series, key, monthOffset(series.dueDate, key));
    snapshots[key] = Object.fromEntries(snapshotFields.filter(k => occurrence[k] !== undefined).map(k => [k, occurrence[k]]));
  }
  const next = { ...series, ...changes, overrides: { ...series.overrides }, snapshots };
  assert(!(next.endDate && next.count) || series.endDate === next.endDate && series.count === next.count, 'Scegli un solo termine per la nuova regola.');
  validateSeries(next);
  return next;
}
export function getOccurrence(series, key) {
  return isOccurrenceDate(series, key) ? materialize(series, key, monthOffset(series.dueDate, key)) : null;
}
export function setOccurrenceCancelled(series, key, cancelled) {
  assert(typeof cancelled === 'boolean' && isOccurrenceDate(series, key), 'Occorrenza o annullamento non valido.');
  const o = materialize(series, key, monthOffset(series.dueDate, key));
  assert(!cancelled || !o.completed, 'Occorrenza già completata: non può essere annullata o nascosta.');
  const next = { ...series, overrides: { ...series.overrides, [key]: { ...series.overrides[key], cancelled } } };
  validateSeries(next);
  return next;
}
function shiftCashDate(anchor, offset) {
  const [year, month] = anchor.split('-').map(Number);
  if (year + Math.floor((month - 1 + offset) / 12) > 9998) return null;
  return shiftMonth(anchor, offset);
}
function materialize(s, key, offset) {
  const base = s.snapshots?.[key] ?? s;
  const o = s.overrides[key] || {};
  const dueDate = o.dueDate ?? (s.snapshots?.[key] ? base.dueDate : key), cashMode = o.cashMode ?? base.cashMode;
  const cashDate = cashMode === 'same' ? dueDate : cashMode === 'date' ? (o.cashDate ?? (s.snapshots?.[key] ? base.cashDate : shiftCashDate(s.cashDate, offset))) : null;
  return { ...s, ...base, ...o, seriesId: s.id, key, id: `${s.id}@${key}`, dueDate, cashDate, actual: o.actual ?? null, cancelled: o.cancelled === true, completed: Boolean(o.actual || o.legacyCompleted || o.done), amountCents: o.amountCents ?? base.amountCents };
}
export function validatePlanner(p, today) {
  assert(p && typeof p.ready === 'boolean' && money(p.openingBalanceCents, true) && money(p.reserveCents) && Array.isArray(p.incomes), 'Planning non valido.');
  assert(p.balanceDate === null || validDate(p.balanceDate), 'Data del saldo non valida: usa null o una data civile ISO.');
  if (p.ready) assert(validDate(p.balanceDate) && p.balanceDate <= today && typeof p.sameDayActualsIncluded === 'boolean', 'Saldo: data non futura e inclusione effettivi del giorno obbligatorie.');
  const ids = new Set();
  for (const s of p.incomes) { validateSeries(s); assert(Object.values(s.overrides).every(o => !o.actual || o.actual.date <= today), 'Incasso effettivo futuro non ammesso.'); assert(!ids.has(s.id), 'Entrata duplicata.'); ids.add(s.id); }
}
export function migrate(raw, today) {
  assert(raw && [1, 2, SCHEMA_VERSION].includes(raw.schemaVersion) && Array.isArray(raw.deadlines), 'Versione dati non supportata.');
  const data = JSON.parse(JSON.stringify(raw));
  if (data.schemaVersion === 1) {
    data.planner = emptyPlanner();
    data.deadlines = data.deadlines.map(s => ({ ...s, cashMode: 'unknown', cashDate: null, endDate: null, count: null, overrides: s.completed ? { [s.dueDate]: { legacyCompleted: true } } : {}, completed: false }));
    data.migrationNotice = 'Dati precedenti migrati: date di cassa non note; completamenti storici senza data/importo effettivi. Le ricorrenze già avanzate dalla vecchia app non sono ricostruibili: verifica ancora e storico.';
  }
  data.schemaVersion = SCHEMA_VERSION;
  validatePlanner(data.planner, today);
  const ids = new Set();
  for (const s of data.deadlines) { validateSeries(s); assert(Object.values(s.overrides).every(o => !o.actual || o.actual.date <= today), 'Pagamento effettivo futuro non ammesso.'); assert(!ids.has(s.id), 'Scadenza duplicata.'); ids.add(s.id); }
  return data;
}
export function project(planner, deadlines, today, endDate) {
  validatePlanner(planner, today);
  deadlines.forEach(validateSeries);
  assert(validDate(today) && validDate(endDate) && endDate >= today, 'Orizzonte di proiezione non valido.');
  assert(planner.ready, 'Imposta prima il saldo.');
  const warnings = [], events = [];
  const all = [...occurrences(deadlines, endDate).map(o => ({ ...o, sign: -1 })), ...occurrences(planner.incomes, endDate).map(o => ({ ...o, sign: 1 }))];
  for (const o of all) {
    const label = `${o.title ?? o.name} (${o.key})`;
    if (o.actual) {
      assert(o.actual.date <= today, 'Un effettivo non può avere data futura.');
      if (o.actual.date > endDate) continue;
      if (o.actual.date > planner.balanceDate || o.actual.date === planner.balanceDate && !planner.sameDayActualsIncluded) events.push({ date: o.actual.date, amountCents: o.sign * o.actual.amountCents, label, actual: true });
      continue;
    }
    if (o.done || o.cancelled) continue;
    if (o.legacyCompleted) { warnings.push(`${label}: completamento storico senza data/importo effettivi; riconciliare.`); continue; }
    if (o.archived) continue;
    if (!o.amountCents) warnings.push(`${label}: importo mancante.`);
    if (!o.cashDate) { warnings.push(`${label}: data di cassa sconosciuta.`); continue; }
    if (o.cashDate < today) { warnings.push(`${label}: previsione arretrata non saldata, esclusa; riprogramma la cassa o registra l’effettivo.`); continue; }
    if (o.cashDate <= endDate) events.push({ date: o.cashDate, amountCents: o.sign * o.amountCents, label, actual: false });
  }
  // Senza orari: uscite prima delle entrate dello stesso giorno, stima prudenziale.
  events.sort((a, b) => a.date.localeCompare(b.date) || a.amountCents - b.amountCents);
  let balance = planner.openingBalanceCents, minimum = balance, minimumDate = planner.balanceDate;
  let firstCriticalDate = balance < planner.reserveCents ? planner.balanceDate : null;
  const rows = [];
  for (const event of events) {
    balance += event.amountCents;
    assert(Number.isSafeInteger(balance), 'Totale oltre la precisione disponibile.');
    rows.push({ ...event, balanceCents: balance });
    if (balance < minimum) { minimum = balance; minimumDate = event.date; }
    if (!firstCriticalDate && balance < planner.reserveCents) firstCriticalDate = event.date;
  }
  const months = [];
  let monthBalance = planner.openingBalanceCents, rowIndex = 0;
  for (let month = today.slice(0, 8) + '01'; month <= endDate; month = shiftMonth(month, 1)) {
    while (rowIndex < rows.length && rows[rowIndex].date < month) monthBalance = rows[rowIndex++].balanceCents;
    const [year, number] = month.split('-').map(Number);
    const last = `${month.slice(0, 8)}${daysInMonth(year, number)}`;
    const until = last < endDate ? last : endDate;
    let incomeCents = 0, expensesCents = 0, minimumCents = monthBalance;
    while (rowIndex < rows.length && rows[rowIndex].date <= until) {
      const row = rows[rowIndex++];
      if (row.amountCents > 0) incomeCents += row.amountCents; else expensesCents -= row.amountCents;
      monthBalance = row.balanceCents;
      minimumCents = Math.min(minimumCents, monthBalance);
    }
    months.push({ month, until, incomeCents, expensesCents, endingBalanceCents: monthBalance, minimumCents });
    if (until === endDate) break;
  }
  return { rows, months, warnings, endingBalanceCents: balance, minimumCents: minimum, minimumDate, firstCriticalDate, marginCents: minimum - planner.reserveCents, deficitCents: Math.max(0, -minimum) };
}
// Reporting per data di cassa: non ricostruisce saldi e non modifica la proiezione.
export function cashReport(planner, deadlines, fromDate, toDate, today) {
  validatePlanner(planner, today);
  deadlines.forEach(validateSeries);
  assert(validDate(fromDate) && validDate(toDate) && fromDate <= toDate && validDate(today), 'Intervallo report non valido.');
  const rows = [];
  let unplacedLegacy = 0, missingAmount = 0, unknownDate = 0;
  const all = [...occurrences(deadlines, toDate).map(o => ({ ...o, sign: -1 })), ...occurrences(planner.incomes, toDate).map(o => ({ ...o, sign: 1 }))];
  for (const o of all) {
    if (o.actual) assert(o.actual.date <= today, 'Un effettivo non può avere data futura.');
    if (!o.actual && o.legacyCompleted) { unplacedLegacy += 1; continue; }
    if (!o.actual && (o.done || o.archived || o.cancelled)) continue;
    const date = o.actual ? o.actual.date : o.cashDate;
    if (!date) { unknownDate += 1; continue; }
    if (date < fromDate || date > toDate) continue;
    const amount = o.actual ? o.actual.amountCents : o.amountCents;
    if (!amount) { missingAmount += 1; continue; }
    rows.push({ id: o.id, date, label: `${o.title ?? o.name} (${o.key})`, amountCents: o.sign * amount, actual: Boolean(o.actual) });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.amountCents - b.amountCents);
  const totals = { incomeActualCents: 0, expenseActualCents: 0, incomeForecastCents: 0, expenseForecastCents: 0 };
  for (const row of rows) {
    const field = `${row.amountCents > 0 ? 'income' : 'expense'}${row.actual ? 'Actual' : 'Forecast'}Cents`;
    totals[field] += Math.abs(row.amountCents);
    assert(Number.isSafeInteger(totals[field]), 'Totale oltre la precisione disponibile.');
  }
  return { ...totals, rows, unplacedLegacy, missingAmount, unknownDate };
}
export function setOccurrenceActual(series, key, actual, today) {
  assert(isOccurrenceDate(series, key), 'Occorrenza non trovata.');
  assert(!series.overrides[key]?.cancelled, 'Ripristina prima la occorrenza annullata.');
  assert(actual === null || validDate(actual.date) && actual.date <= today && money(actual.amountCents) && actual.amountCents > 0, 'Effettivo: data non futura e importo positivo obbligatori.');
  const next = { ...series, overrides: { ...series.overrides, [key]: { ...series.overrides[key], actual, legacyCompleted: false, done: false } } };
  validateSeries(next);
  return next;
}
