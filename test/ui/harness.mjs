// Integrazione senza browser: DOM minimo e storage in memoria, rete sempre disabilitata.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as planning from '../../planning.js';
import * as radar from '../../radar.js';

const source = (await readFile(process.env.SCADENZARIO_TEST_APP ?? new URL('../../app.js', import.meta.url), 'utf8')).replace(/^import .* from '\.\/planning.js';/m, 'const { SCHEMA_VERSION, emptyPlanner, migrate, occurrences, project, validateSeries, validatePlanner, setOccurrenceActual, shiftMonth, cashReport } = engine;').replace(/^import .* from '\.\/radar.js';/m, 'const { buildRadar, filterAgenda, planningEnd } = radarEngine;');
const key = 'scadenzario.pwa.v1';
export function harness(saved = null) {
  const nodes = new Map();
  const classes = () => ({ add() {}, remove() {}, toggle() {} });
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', textContent: '', innerHTML: '', dataset: {}, classList: classes(), setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; }, append() {}, remove() {}, click() {}, addEventListener() {}, reset() {}, querySelectorAll() { return []; }, focus() { this.focused = true; }, showModal() { this.open = true; }, close() { this.open = false; } });
    return nodes.get(selector);
  };
  const storage = new Map(saved ? [[key, JSON.stringify(saved)]] : []);
  let failStorage = false;
  let blob;
  const generationStats = { calls: 0, occurrences: 0 };
  const engine = { ...planning, occurrences(...args) {
    generationStats.calls += 1;
    const result = planning.occurrences(...args);
    generationStats.occurrences += result.length;
    return result;
  } };
  const context = vm.createContext({
    engine, radarEngine: radar,
    document: { querySelector: node, createElement: () => node(`created-${nodes.size}`), body: { append() {} }, addEventListener() {}, hidden: false },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem(k, v) { if (failStorage) throw new Error('quota esaurita'); storage.set(k, v); } },
    window: { addEventListener() {}, confirm() { return true; }, isSecureContext: false }, navigator: {},
    setTimeout() {}, clearTimeout() {}, setInterval() {}, console: { error() {} },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-18T12:00:00Z'])); } }, Intl,
    fetch: async () => { throw new Error('Rete disabilitata nel test'); },
    FormData: class { constructor(form) { this.data = form.values; } get(k) { return this.data[k] ?? null; } has(k) { return Object.hasOwn(this.data, k); } },
    Blob, URL: { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL() {} },
  });
  vm.runInContext(`${source}\nglobalThis.api = { state, persist, commit, handleSubmit, handleClick, openDeadlineForm, handleDeadlineSubmit, renderPlanning, renderCalendar, renderHome, renderRadar, renderMore, render, currentRadar, handleChange, exportBackup, restoreBackup, findOccurrence, nextSeriesCards, parseSignedCents, formatCentsForInput, formatDate, expectedDateLabel: typeof expectedDateLabel === 'function' ? expectedDateLabel : undefined, getCalendarCashDays, renderCalendarCashDetail, renderRadarItems };`, context);
  return { api: context.api, generationStats, resetGenerations() { generationStats.calls = 0; generationStats.occurrences = 0; }, evaluate: code => vm.runInContext(code, context), storage, node, failStorage() { failStorage = true; }, blob: () => blob,
    submit(id, values) { context.api.handleSubmit({ target: { id, values, dataset: {} }, preventDefault() {} }); },
    click(action, id, extra = {}) { context.api.handleClick({ target: { closest: () => ({ dataset: { action, id, ...extra } }) } }); } };
}
const profile = { name: 'Test', type: 'single' };
export const deadline = { id: 'x', title: 'Affitto', category: 'casa', dueDate: '2026-11-17', recurrenceMonths: 0, amountCents: 10000, reminderDays: [7], completed: false, archived: false, cashMode: 'same', cashDate: null, endDate: null, count: null, overrides: {} };
export const savedState = (deadlines = [deadline]) => ({ schemaVersion: 2, profile, deadlines, planner: planning.emptyPlanner(), notificationsEnabled: false, notifiedKeys: [] });
export const readyState = (deadlines = [deadline]) => {
  const data = savedState(deadlines);
  Object.assign(data.planner, { ready: true, openingBalanceCents: 50000, reserveCents: 10000, balanceDate: '2026-11-01', sameDayActualsIncluded: true });
  return data;
};
