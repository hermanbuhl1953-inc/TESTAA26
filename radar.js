import { occurrences, project, shiftMonth, validDate } from './planning.js';

export const planningEnd = today => shiftMonth(`${today.slice(0, 8)}01`, 12);

// The projection remains owned by planning.js; Radar only explains derived state.
export function buildRadar(planner, deadlines, today, end = planningEnd(today)) {
  const items = new Map();
  const add = item => items.set(`${item.type}:${item.occurrenceId ?? 'plan'}`, { ...item, id: `${item.type}:${item.occurrenceId ?? 'plan'}` });
  let projection = null;
  let error = null;
  const configuration = [];
  if (!planner.ready) configuration.push('Saldo di riferimento non impostato.');
  if (!validDate(planner.balanceDate) || planner.balanceDate > today) configuration.push('Data del saldo assente o non valida.');
  if (typeof planner.sameDayActualsIncluded !== 'boolean') configuration.push('Scegli tutti o nessuno per gli effettivi della data saldo.');
  if (configuration.length) add({ type: 'configuration', severity: 0, date: '', title: 'Imposta il punto di partenza del tuo piano.', description: configuration.join(' '), action: 'configure-plan', actionLabel: 'Imposta saldo' });
  for (const [series, income] of [[deadlines, false], [planner.incomes, true]]) {
    for (const s of series) {
      let list;
      try { list = occurrences([s], end); }
      catch (cause) {
        error = cause.message;
        add({ type: 'calculation', occurrenceId: `${income ? 'income' : 'expense'}:${s.id}`, severity: 0, date: '', title: 'Occorrenze non calcolabili', description: `${s.title ?? s.name}: ${cause.message} Nessuna lista parziale è considerata completa.`, action: 'navigate', view: 'planning', actionLabel: 'Apri Planning' });
        continue;
      }
      for (const o of list) {
        if (o.archived || o.completed) continue;
        const common = { occurrenceId: o.id, income, date: o.cashDate ?? o.dueDate, title: o.title ?? o.name, dueDate: o.dueDate, cashDate: o.cashDate };
        const overdue = income ? o.cashDate && o.cashDate < today : o.dueDate < today || o.cashDate && o.cashDate < today;
        if (overdue) add({ ...common, type: income ? 'income-overdue' : 'expense-overdue', severity: 1,
          description: income ? 'La data di cassa attesa è passata senza un incasso registrato. La previsione è esclusa dal piano.' : 'Occorrenza ancora aperta: scadenza o cassa prevista già passata. Una cassa arretrata è esclusa dal piano; la scadenza legale non viene spostata.',
          action: income ? 'actual-income' : 'record-deadline', actionLabel: income ? 'Registra incasso' : 'Registra pagamento',
          editAction: income ? 'edit-income' : 'edit-deadline' });
        if (!o.cashDate || !o.amountCents) add({ ...common, type: income ? 'income-missing' : 'expense-missing', severity: 2,
          description: `${!o.cashDate ? 'Data di cassa sconosciuta. ' : ''}${!o.amountCents ? 'Importo non indicato (o promemoria senza importo): verifica se deve incidere sul piano.' : ''}`,
          action: income ? 'edit-income' : 'edit-deadline', actionLabel: 'Completa dati' });
      }
    }
  }
  if (!configuration.length && !error) {
    try {
      projection = project(planner, deadlines, today, end);
      const firstBelowZero = planner.openingBalanceCents < 0 ? planner.balanceDate : projection.rows.find(row => row.balanceCents < 0)?.date ?? null;
      projection = { ...projection, firstBelowZero };
      if (projection.firstCriticalDate || firstBelowZero) {
        const until = firstBelowZero ?? projection.firstCriticalDate;
        add({ type: 'critical', severity: 0, date: projection.firstCriticalDate ?? firstBelowZero,
          title: 'Margine del piano da verificare',
          description: 'Criticità aggregata del saldo e dei movimenti applicati, non attribuita a un singolo pagamento. Verifica anche i dati esclusi o mancanti.',
          firstCriticalDate: projection.firstCriticalDate, firstBelowZero,
          movements: projection.rows.filter(row => row.date <= until),
          action: 'planning-results', actionLabel: 'Verifica in Planning' });
      }
    } catch (cause) { error = cause.message; }
  }
  if (error) add({ type: 'calculation', severity: 0, date: '', title: 'Previsione non calcolabile', description: error, action: 'configure-plan', actionLabel: 'Verifica dati del piano' });
  return { end, projection, error, items: [...items.values()].sort((a, b) => a.severity - b.severity || a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) };
}

export function filterAgenda(items, { period = 'today', category = 'all', status = 'active', date }, today) {
  return items.filter(o => {
    if (status === 'archived' ? !o.archived : o.archived) return false;
    if (status === 'active' && o.completed || status === 'completed' && !o.completed) return false;
    if (category !== 'all' && o.category !== category) return false;
    return period === 'all' || (period === 'day' ? o.dueDate === date : period === 'today' ? o.dueDate === today : period === 'overdue' ? o.dueDate < today && !o.completed && !o.archived : o.dueDate > today);
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
}
