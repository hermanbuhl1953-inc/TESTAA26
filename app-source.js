import { SCHEMA_VERSION, emptyPlanner, migrate, occurrences, project, validateSeries, validatePlanner, setOccurrenceActual, shiftMonth, cashReport, updateSeries, setOccurrenceCancelled, getOccurrence } from './planning.js';
import { buildRadar, filterAgenda, planningEnd } from './radar.js';

// The legacy shell bootstrap replaces the body, not head metadata.
function syncThemeColorMetadata() {
  if (!document.head) return;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.remove());
  for (const [scheme, content] of [['light', '#f6f5f1'], ['dark', '#0d1620']]) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.media = `(prefers-color-scheme: ${scheme})`;
    meta.content = content;
    document.head.append(meta);
  }
}
syncThemeColorMetadata();

const STORAGE_KEY = 'scadenzario.pwa.v3';
const LEGACY_STORAGE_KEY = 'scadenzario.pwa.v1';
const STORAGE_LOCK = 'scadenzario.pwa.v3.writer';
let storageBaseline = null;
let storageRevision = 0;
let insideStorageLock = 0;
let storageBlocked = false;
let conflictDraft = null;
let updateRegistration = null;
let reloadApproved = false;
const CLIENT_SHELL = typeof SHELL_ID === 'string' ? SHELL_ID : 'source-test';
const todayIso = () => dateToIso(dateOnly(new Date()));
let editingOccurrence = null;
let editingSeries = null;
let uiEpoch = 0;
let archiveEpoch = 0;
let importSession = 0;
let notificationRequest = 0;
const dialogSessions = { deadline: 0, movement: 0, profile: 0 };
const pendingForms = new Set();
const viewOccurrences = (end = shiftMonth(todayIso(), 12), from = '1900-01-01') => occurrences(state.deadlines, end, from);
function findOccurrence(id, income = false) {
  const split = id.lastIndexOf('@');
  if (split < 0) return null;
  const series = (income ? state.planner.incomes : state.deadlines).find(s => s.id === id.slice(0, split));
  if (!series) return null;
  return getOccurrence(series, id.slice(split + 1));
}
function nextSeriesCards() {
  return state.deadlines.flatMap(s => {
    const horizon = shiftMonth(todayIso(), 12);
    const items = occurrences([s], s.dueDate > horizon ? s.dueDate : horizon);
    const history = items.filter(o => o.completed);
    const next = items.find(o => !o.completed && !o.cancelled);
    return [...history, ...(next ? [next] : [])];
  });
}
const CATALOG_URL = './assets/catalog/deadlines.json';
const BONUS_CATALOG_URL = './assets/catalog/benefits.json';
const BONUS_API_URL = './api/benefits';
const SOURCE_MONITORING_API_URL = './api/monitoring';
const STAGING_API_URL = './api/staging';
const PROFILE_LABELS = {
  single: 'Single',
  coppia: 'Coppia',
  famiglia: 'Famiglia',
  anziano: 'Anziano o cura',
  professionista: 'Professionista',
};
const CATEGORY_LABELS = {
  auto: 'Auto e trasporti',
  casa: 'Casa',
  fisco: 'Fisco',
  documenti: 'Documenti',
  salute: 'Salute',
  famiglia: 'Famiglia',
  banca: 'Banca e rate',
  assicurazioni: 'Assicurazioni',
  abbonamenti: 'Abbonamenti',
  lavoro: 'Lavoro',
  altro: 'Altro',
};
const ITALIAN_REGIONS = [
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia-Romagna',
  'Friuli-Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino-Alto Adige',
  'Umbria',
  "Valle d'Aosta",
  'Veneto',
];
const state = {
  profile: null,
  deadlines: [],
  notificationsEnabled: false,
  notifiedKeys: [],
  planner: emptyPlanner(),
  migrationNotice: '',
};
let catalog = [];
let catalogError = null;
let bonusCatalog = [];
let bonusCatalogError = null;
let bonusCatalogUpdatedAt = null;
let bonusCatalogMode = 'local';
let sourceMonitoring = null;
let sourceMonitoringError = null;
let stagingEntries = null;
let stagingError = null;
let stagingBusyId = null;
let currentView = 'home';
let selectedHomeDate = dateToIso(dateOnly(new Date()));
let selectedCalendarDate = dateToIso(dateOnly(new Date()));
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarMode = 'deadlines';
let calendarOpen = false;
let filters = { category: 'all', status: 'active' };
let agendaPeriod = 'today';
let deferredInstallPrompt = null;
let toastTimer = null;
let serviceWorkerError = null;
const app = document.querySelector('#app');
const deadlineDialog = document.querySelector('#deadline-dialog');
const profileDialog = document.querySelector('#profile-dialog');
const deadlineForm = document.querySelector('#deadline-form');
const backupFileInput = document.querySelector('#backup-file');
const toastElement = document.createElement('div');
toastElement.className = 'toast';
toastElement.setAttribute('role', 'status');
toastElement.setAttribute('aria-live', 'polite');
document.body.append(toastElement);
const storageNotice = document.createElement('section');
storageNotice.className = 'storage-status notice';
storageNotice.hidden = true;
storageNotice.setAttribute('role', 'alert');
document.body.append(storageNotice);
const updateNotice = document.createElement('section');
updateNotice.className = 'update-status notice';
updateNotice.hidden = true;
updateNotice.setAttribute('role', 'status');
document.body.append(updateNotice);

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateToIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const date = typeof value === 'string' ? parseIsoDate(value) : value;
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return 'Data non valida';
  return new Intl.DateTimeFormat('it-IT', options).format(date);
}

function expectedDateLabel(income = false, amountCents = 0) {
  return income ? 'Data prevista di incasso' : amountCents > 0 ? 'Data prevista di pagamento' : 'Data prevista';
}

function dayDifference(dateString) {
  const target = parseIsoDate(dateString);
  if (!target) return Number.NaN;
  const today = dateOnly(new Date());
  return Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
    - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
}

function addMonthsClamped(dateString, months) {
  const date = parseIsoDate(dateString);
  if (!date) throw new Error('La data della scadenza non è valida.');
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  return dateToIso(new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    Math.min(date.getDate(), lastDay),
  ));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function icon(name) {
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1V10Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    catalog: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 6h13M8 10h8m-8 4h6"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    edit: '<path d="m16 4 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>',
    archive: '<path d="M4 7h16v13H4zM3 4h18v3H3zM10 11h4"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 20h16"/>',
    calendarPlus: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m9 4v5m-2.5-2.5h5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
    chart: '<path d="M3 3v18h18M8 16v-4m5 4V7m5 9v-7"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    benefits: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
}

function showToast(message, isError = false) {
  toastElement.textContent = message;
  toastElement.classList.toggle('error', isError);
  toastElement.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastElement.classList.remove('visible'), 3200);
}

function copyState() {
  return JSON.parse(JSON.stringify(state));
}

function storagePayload() {
  return { schemaVersion: SCHEMA_VERSION, profile: state.profile, deadlines: state.deadlines,
    planner: state.planner, migrationNotice: state.migrationNotice,
    notificationsEnabled: state.notificationsEnabled, notifiedKeys: state.notifiedKeys.slice(-500) };
}
function showStorageProblem(message, conflict = false) {
  storageBlocked = true;
  storageNotice.hidden = false;
  storageNotice.innerHTML = `<strong>${escapeHtml(message)}</strong><p>Le modifiche non salvate restano nella scheda. Prima di ricaricare puoi esportare una copia da confrontare: non è un’unione automatica dei dati.</p><button class="text-button" type="button" data-action="export-conflict">Esporta copia locale</button><button class="text-button" type="button" data-action="reload-storage">Ricarica dati aggiornati</button>`;
  for (const selector of ['#deadline-error', '#movement-error', '#profile-error']) {
    const node = document.querySelector(selector);
    if (node) { node.textContent = message; node.classList.add('visible'); }
  }
  if (conflict) showToast(message, true);
}
function withStorageLock(action) {
  if (!navigator.locks?.request) {
    showStorageProblem('Salvataggi bloccati: questo browser non offre il blocco sicuro tra schede. Usa un browser aggiornato in HTTPS o localhost.');
    return false;
  }
  try {
    const result = navigator.locks.request(STORAGE_LOCK, { mode: 'exclusive' }, () => {
      insideStorageLock += 1;
      try { return action(); } finally { insideStorageLock -= 1; }
    });
    return result?.then ? result.catch(error => { showStorageProblem(`Salvataggio bloccato: ${error.message}`); return false; }) : result;
  } catch (error) { showStorageProblem(`Salvataggio bloccato: ${error.message}`); return false; }
}
// Soltanto dentro il Web Lock: confronto dell'intero valore più revisione.
function persist() {
  if (!insideStorageLock) throw new Error('Scrittura senza blocco esclusivo non consentita.');
  if (storageBlocked || localStorage.getItem(STORAGE_KEY) !== storageBaseline) throw new Error('Dati aggiornati in un’altra scheda. Ricarica prima di salvare.');
  const revision = storageRevision + 1;
  if (!Number.isSafeInteger(revision)) throw new Error('Revisione dati oltre il limite.');
  const raw = JSON.stringify({ ...storagePayload(), storageRevision: revision });
  localStorage.setItem(STORAGE_KEY, raw);
  storageBaseline = raw;
  storageRevision = revision;
}
function afterSave(result, success, failure = () => {}) {
  const done = saved => { if (saved) success(); else failure(); return saved; };
  return result?.then ? result.then(done) : done(result);
}
function mutableCopy(value) {
  if (Array.isArray(value)) return value.map(mutableCopy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mutableCopy(item)]));
  return value;
}
function immutable(value) {
  const freeze = object => { if (object && typeof object === 'object') { Object.values(object).forEach(freeze); Object.freeze(object); } return object; };
  return freeze(mutableCopy(value));
}
function formFields(form) {
  return [...(form?.elements ?? form?.querySelectorAll?.('input, select, textarea') ?? [])]
    .filter(field => field.type !== 'file')
    .map(field => [field.id ?? '', field.name ?? '', field.value ?? '', field.checked === true, field.disabled === true]);
}
function presentation() {
  return { epoch: uiEpoch, view: currentView, sessions: JSON.stringify(dialogSessions),
    open: ['deadline', 'movement', 'profile'].map(name => document.querySelector(`#${name}-dialog`)?.open === true),
    fields: JSON.stringify([...(document.querySelectorAll?.('form') ?? [])].map(form => [form.id, formFields(form)])) };
}
function samePresentation(before) { return JSON.stringify(before) === JSON.stringify(presentation()); }
function beginFormSave(name) {
  const modal = Object.hasOwn(dialogSessions, name);
  const session = modal ? dialogSessions[name] : uiEpoch;
  const key = `${name}:${session}`;
  if (pendingForms.has(key)) { showToast('Salvataggio già in attesa. La bozza resta modificabile: salva di nuovo al termine per inviare altre modifiche.', true); return null; }
  const context = { name, modal, session, key, fields: JSON.stringify(formFields(document.querySelector(`#${name}-form`))) };
  pendingForms.add(key);
  return context;
}
function currentForm(context) {
  return (context.modal ? dialogSessions[context.name] === context.session && document.querySelector(`#${context.name}-dialog`).open : uiEpoch === context.session)
    && JSON.stringify(formFields(document.querySelector(`#${context.name}-form`))) === context.fields;
}
function finishFormSave(context, result, success = () => {}, failure = () => {}) {
  return afterSave(result, () => {
    pendingForms.delete(context.key);
    if (currentForm(context)) success();
    else if (context.modal) showToast('Salvataggio precedente completato. La bozza attualmente aperta non è stata modificata.');
  }, () => {
    pendingForms.delete(context.key);
    if (currentForm(context)) failure();
  });
}
function rejectedDraft(change, before) {
  const current = copyState();
  try { Object.assign(state, mutableCopy(before)); change(); conflictDraft = copyState(); }
  finally { Object.assign(state, current); }
}
function commit(change, successMessage, reminders = true, captureDraft = true, options = {}) {
  const ui = presentation(), requestedArchive = archiveEpoch, requestedState = copyState();
  let changed = false;
  const result = withStorageLock(() => {
    const previous = copyState();
    try {
      if (requestedArchive !== archiveEpoch) {
        if (captureDraft) rejectedDraft(change, requestedState);
        showStorageProblem('L’archivio è stato sostituito mentre il salvataggio era in attesa. La modifica precedente non è stata applicata: esporta la copia locale e ricarica.', true);
        return false;
      }
      if (options.guard && !options.guard()) {
        showToast(options.refusal ?? 'Operazione superata da modifiche più recenti: nessun dato è stato sostituito.', true);
        return false;
      }
      if (storageBlocked || localStorage.getItem(STORAGE_KEY) !== storageBaseline) {
        if (captureDraft) rejectedDraft(change, requestedState);
        showStorageProblem('Un’altra scheda ha salvato dati più recenti. Questo salvataggio è bloccato; nessun dato condiviso è stato sostituito.', true);
        return false;
      }
      change();
      validatePlanner(state.planner, todayIso());
      state.deadlines.forEach(validateDeadline);
      if (state.planner.ready) project(state.planner, state.deadlines, todayIso(), shiftMonth(todayIso().slice(0, 8) + '01', 12));
      changed = options.replaceArchive === true || JSON.stringify(state) !== JSON.stringify(previous) || storageBaseline === null;
      if (changed) persist();
      if (options.replaceArchive) archiveEpoch += 1;
      return true;
    } catch (error) {
      Object.assign(state, previous);
      const message = `Operazione non riuscita: ${error.message}`;
      showToast(message, true);
      if (samePresentation(ui)) for (const selector of ['#deadline-error', '#movement-error', '#profile-error']) {
        const node = document.querySelector(selector);
        if (node) { node.textContent = message; node.classList.add('visible'); }
      }
      return false;
    }
  });
  return afterSave(result, () => {
    if (!changed) return;
    // Effetti UI dopo il lock: mai ricreare o chiudere una bozza più recente.
    const redraw = reminders && samePresentation(ui);
    if (redraw) {
      if (options.replaceArchive) for (const name of Object.keys(dialogSessions)) {
        dialogSessions[name] += 1;
        const dialog = document.querySelector(`#${name}-dialog`);
        if (dialog.open) dialog.close();
      }
      if (options.navigate) currentView = options.navigate;
      render();
    }
    if (successMessage) showToast(reminders && !redraw ? `${successMessage} Bozza corrente conservata: aggiorna la vista quando hai terminato.` : successMessage);
    if (reminders) checkReminders();
  });
}
function loadSavedState() {
  const current = localStorage.getItem(STORAGE_KEY);
  storageBaseline = current;
  const raw = current === null ? localStorage.getItem(LEGACY_STORAGE_KEY) : current;
  if (raw === null) return;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Archivio dati non valido; nessun ripiego sui dati precedenti.');
  if (current !== null && Number.isSafeInteger(parsed.storageRevision) && parsed.storageRevision > 0) storageRevision = parsed.storageRevision;
  if (current !== null && (parsed.schemaVersion !== SCHEMA_VERSION || !Number.isSafeInteger(parsed.storageRevision) || parsed.storageRevision < 1)) throw new Error('Archivio v3 o revisione non validi. Nessun ripiego automatico sui vecchi dati.');
  const saved = migrate(parsed, todayIso());
  if (saved.profile !== null && !isValidProfile(saved.profile)) throw new Error('Il profilo salvato non è valido.');
  saved.deadlines.forEach(validateDeadline);
  state.profile = saved.profile;
  state.deadlines = saved.deadlines;
  state.planner = saved.planner;
  state.migrationNotice = saved.migrationNotice || '';
  state.notificationsEnabled = saved.notificationsEnabled === true;
  state.notifiedKeys = Array.isArray(saved.notifiedKeys) ? saved.notifiedKeys.filter(key => typeof key === 'string').slice(-500) : [];
  storageBaseline = current;
  storageRevision = current === null ? 0 : parsed.storageRevision;
  if (current === null) {
    // La vecchia chiave rimane intatta. Un altro migratore può averci preceduti.
    const migration = immutable(copyState());
    withStorageLock(() => {
      if (localStorage.getItem(STORAGE_KEY) !== null) {
        showStorageProblem('Un’altra scheda ha già creato l’archivio nuovo. Ricarica: i suoi dati non sono stati sovrascritti.');
        return false;
      }
      try { Object.assign(state, mutableCopy(migration)); persist(); return true; }
      catch (error) { showStorageProblem(`Migrazione non salvata: ${error.message}. I dati precedenti sono intatti.`); return false; }
    });
  }
}
function exportConflictDraft() {
  const draft = conflictDraft ?? copyState();
  const unsavedForms = [...(document.querySelectorAll?.('form') ?? [])].map(form => ({ id: form.id, fields: [...(form.elements ?? [])].filter(field => ['INPUT', 'SELECT', 'TEXTAREA'].includes(field.tagName) && field.type !== 'file').map(field => ({ id: field.id, name: field.name, type: field.type, value: field.value, checked: field.checked === true })) }));
  const data = { ...draft, app: 'Scadenzario', schemaVersion: SCHEMA_VERSION, conflictDraft: true, sourceRevision: storageRevision, unsavedForms, exportedAt: localDateTime() };
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  anchor.href = url; anchor.download = `scadenzario-copia-locale-${todayIso()}.json`;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function isValidProfile(profile) {
  return profile
    && typeof profile.name === 'string'
    && profile.name.trim().length > 0
    && Object.hasOwn(PROFILE_LABELS, profile.type);
}

function validateDeadline(deadline) {
  validateSeries(deadline);
  if (!deadline || typeof deadline !== 'object') throw new Error('Scadenza non valida nel backup.');
  if (typeof deadline.id !== 'string' || !deadline.id) throw new Error('Scadenza senza identificativo valido.');
  if (typeof deadline.title !== 'string' || !deadline.title.trim()) throw new Error('Scadenza senza titolo.');
  if (!Object.hasOwn(CATEGORY_LABELS, deadline.category)) throw new Error('Categoria di scadenza sconosciuta.');
  if (!parseIsoDate(deadline.dueDate)) throw new Error('Data di scadenza non valida.');
  if (!Number.isInteger(deadline.recurrenceMonths) || deadline.recurrenceMonths < 0) {
    throw new Error('Ricorrenza non valida.');
  }
  if (!Number.isInteger(deadline.amountCents) || deadline.amountCents < 0) {
    throw new Error('Importo non valido.');
  }
  if (!Array.isArray(deadline.reminderDays)
    || deadline.reminderDays.some((days) => !Number.isInteger(days) || days < 0)) {
    throw new Error('Promemoria non validi.');
  }
  if (Object.values(deadline.snapshots ?? {}).some(o => o.category !== undefined && !Object.hasOwn(CATEGORY_LABELS, o.category))) throw new Error('Categoria istantanea sconosciuta.');
  if (Object.values(deadline.overrides).some(o => o.category !== undefined && !Object.hasOwn(CATEGORY_LABELS, o.category))) throw new Error('Categoria occorrenza sconosciuta.');
  if (Object.values(deadline.overrides).some(o => o.actual && o.actual.date > todayIso())) throw new Error('Un pagamento effettivo non può avere data futura.');
  if (typeof deadline.completed !== 'boolean' || typeof deadline.archived !== 'boolean') {
    throw new Error('Stato della scadenza non valido.');
  }
}

function makeId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localDateTime() {
  return new Date().toISOString();
}

function profileInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function categoryName(category) {
  return CATEGORY_LABELS[category] || 'Altro';
}

function recurrenceLabel(months) {
  if (!months) return 'Una tantum';
  return months === 12 ? 'Ogni anno' : `Ogni ${months} ${months === 1 ? 'mese' : 'mesi'}`;
}

function formatAmount(cents) {
  const absoluteCents = Math.abs(cents);
  const euros = Math.floor(absoluteCents / 100);
  const euroText = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centsText = String(absoluteCents % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${euroText},${centsText} €`;
}

function deadlineStatus(deadline) {
  if (deadline.cancelled) return { text: 'Annullata · recuperabile', className: '' };
  if (deadline.completed) return { text: deadline.actual ? 'Pagata' : deadline.done ? 'Fatta, senza movimento' : 'Completata (storico)', className: '' };
  const days = dayDifference(deadline.dueDate);
  if (days < 0) return { text: `Scaduta da ${Math.abs(days)} ${Math.abs(days) === 1 ? 'giorno' : 'giorni'}`, className: 'overdue' };
  if (days === 0) return { text: 'Scade oggi', className: 'urgent' };
  if (days <= 7) return { text: `Tra ${days} ${days === 1 ? 'giorno' : 'giorni'}`, className: 'urgent' };
  return { text: formatDate(deadline.dueDate, { day: 'numeric', month: 'short', year: 'numeric' }), className: '' };
}

function sortDeadlines(deadlines) {
  return [...deadlines].sort((a, b) => a.dueDate.localeCompare(b.dueDate)
    || a.title.localeCompare(b.title, 'it'));
}

function navIsCurrent(view) {
  return currentView === view || view === 'more' && ['catalog', 'benefits', 'profile'].includes(currentView) || view === 'home' && currentView === 'radar';
}

function navButton(view, label, iconName) {
  return `<button class="nav-button${navIsCurrent(view) ? ' active' : ''}" type="button" data-action="navigate" data-view="${view}"${navIsCurrent(view) ? ' aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></button>`;
}

function mobileNavButton(view, label, iconName) {
  return `<button class="mobile-nav-button${navIsCurrent(view) ? ' active' : ''}" type="button" data-action="navigate" data-view="${view}"${navIsCurrent(view) ? ' aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></button>`;
}

function render() {
  uiEpoch += 1;
  const focused = document.activeElement;
  const focusData = focused && app.contains?.(focused) ? { id: focused.id, ...focused.dataset } : null;
  if (!state.profile) {
    app.innerHTML = renderOnboarding();
    return;
  }

  const views = { home: renderHome, calendar: renderCalendar, catalog: renderCatalog, profile: renderProfile, planning: renderPlanning, benefits: renderBenefits, more: renderMore, radar: renderRadar };
  let content;
  try { content = (views[currentView] || renderHome)(); }
  catch (error) { content = `<h1 class="page-title">Vista non calcolabile</h1><div class="notice error">${escapeHtml(error.message)}. Nessun dato è stato eliminato.</div><button class="button button-primary" type="button" data-action="navigate" data-view="profile">Apri impostazioni e backup</button>`; }
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">S</span><span>Scadenzario</span></div>
        <nav class="side-nav" aria-label="Navigazione principale">
          ${navButton('home', 'Home', 'home')}
          ${navButton('calendar', 'Agenda', 'calendar')}
          ${navButton('planning', 'Planning', 'chart')}
          ${navButton('more', 'Altro', 'more')}
        </nav>
        <div class="sidebar-bottom">
          <div class="sidebar-note">I tuoi dati restano su questo dispositivo. Nessun account o sincronizzazione.</div>
        </div>
      </aside>
      <div class="main-column">
        <header class="topbar">
          <div class="brand mobile-brand"><span class="brand-mark" aria-hidden="true">S</span><span>Scadenzario</span></div>
          <time class="topbar-label" datetime="${todayIso()}">${escapeHtml(formatDate(todayIso(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</time>
          <div class="topbar-actions">
            <button class="button button-primary topbar-create" type="button" data-action="new-deadline">${icon('plus')}Nuova scadenza</button>
            <button class="profile-button" type="button" data-action="open-profile-dialog" aria-label="Modifica profilo di ${escapeHtml(state.profile.name)}">
              <span class="avatar">${escapeHtml(profileInitials(state.profile.name))}</span>
              <span>${escapeHtml(state.profile.name)}</span>
            </button>
          </div>
        </header>
        <main class="content" id="main-content" tabindex="-1">${content}</main>
      </div>
    </div>
    <button class="button button-primary mobile-create" type="button" data-action="new-deadline" aria-label="Nuova scadenza">${icon('plus')}</button>
    <nav class="mobile-bottom-nav" aria-label="Navigazione principale">
      ${mobileNavButton('home', 'Home', 'home')}
      ${mobileNavButton('calendar', 'Agenda', 'calendar')}
      ${mobileNavButton('planning', 'Planning', 'chart')}
      ${mobileNavButton('more', 'Altro', 'more')}
    </nav>`;
  if (focusData) {
    const replacement = [...app.querySelectorAll('button, input, select, textarea')].find(element =>
      focusData.id && element.id === focusData.id || focusData.action && element.dataset.action === focusData.action && ['id', 'view', 'period', 'date', 'offset'].every(key => element.dataset[key] === focusData[key]) || focusData.filter && element.dataset.filter === focusData.filter);
    (replacement ?? document.querySelector('#main-content'))?.focus({ preventScroll: true });
  }
}

function renderOnboarding() {
  return `
    <main class="onboarding">
      <section class="onboarding-hero">
        <div class="brand"><span class="brand-mark">S</span><span>Scadenzario</span></div>
        <div class="hero-copy">
          <h1>Le tue scadenze,<br>in ordine.</h1>
          <p>Un promemoria semplice per gli impegni quotidiani, costruito intorno alle tue esigenze.</p>
        </div>
        <p class="hero-foot">Un prototipo locale. Nessun account richiesto.</p>
      </section>
      <section class="onboarding-form-side">
        <div class="onboarding-card">
          <p class="eyebrow">COMINCIAMO</p>
          <h2>Crea il tuo profilo</h2>
          <p>Ci serve solo per personalizzare la tua esperienza. Potrai cambiarlo in seguito.</p>
          <form id="onboarding-form" class="onboarding-fields">
            <label class="field"><span>Come ti chiami?</span><input name="name" maxlength="50" autocomplete="given-name" required placeholder="Il tuo nome"></label>
            <label class="field"><span>Quale profilo ti descrive meglio?</span>
              <select name="type" required>
                ${Object.entries(PROFILE_LABELS).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}
              </select>
            </label>
            <div class="local-notice">${icon('lock')}<span>I dati e il profilo vengono salvati solo nel browser di questo dispositivo. Non inserire informazioni sanitarie o documenti riservati in questa versione dimostrativa.</span></div>
            <label class="checkline"><input type="checkbox" name="acknowledge" required><span>Ho capito che i dati restano in questo browser e che questa versione non è cifrata né sincronizzata.</span></label>
            <button class="button button-primary" type="submit">Entra in Scadenzario ${icon('right')}</button>
          </form>
        </div>
      </section>
    </main>`;
}

function currentRadar() { return buildRadar(state.planner, state.deadlines, todayIso()); }

function renderMore() {
  return `<p class="eyebrow">STRUMENTI LOCALI</p><h1 class="page-title">Altro</h1><div class="more-menu">
    ${[['benefits', 'Opportunità', 'Bonus e agevolazioni: consulta il catalogo esistente, senza entrate automatiche.'], ['catalog', 'Suggerimenti', 'Modelli di scadenza da verificare e personalizzare.'], ['profile', 'Impostazioni / Profilo e Backup', 'Profilo locale, esportazione e ripristino JSON, installazione e promemoria.']].map(([view, label, detail]) => `<section class="settings-card"><h2>${label}</h2><p>${detail}</p><button class="button button-quiet" type="button" data-action="navigate" data-view="${view}">Apri ${label}</button></section>`).join('')}</div>`;
}

function renderCalculation(radar) {
  const p = state.planner;
  return `<details class="calculation-details"><summary>Come viene calcolato?</summary>
    <p>Saldo di riferimento: ${p.ready ? escapeHtml(formatAmount(p.openingBalanceCents)) : 'non impostato'}; data: ${p.balanceDate ? escapeHtml(formatDate(p.balanceDate)) : 'non impostata'}. Orizzonte fino al ${escapeHtml(formatDate(radar.end))} incluso, uguale in Home e Planning.</p>
    <ul><li>Effettivi prima del saldo già assorbiti; dopo il saldo applicati, anche se precedenti a oggi. Stessa data: ${p.sameDayActualsIncluded === true ? 'tutti inclusi nel saldo' : p.sameDayActualsIncluded === false ? 'nessuno incluso: applicati al saldo' : 'scelta tutti/nessuno ancora da completare'}. Nessuna selezione parziale.</li>
    <li>La previsione usa la cassa, non la scadenza legale. Effettivi sostituiscono le previsioni; entrate previste non sono ancora incassate. Archiviate escluse dalle previsioni, effettivi conservati.</li>
    <li>Casse sconosciute e previsioni arretrate escluse, mai spostate a oggi. Importi mancanti non sono stimati. Completamenti storici non riconciliati segnalati.</li>
    <li>Nello stesso giorno, senza orari: uscite prima delle entrate. Minimo prudenziale, non estratto conto. Nessuna stima delle spese non inserite e nessun incasso o pagamento automatico.</li></ul></details>`;
}

function renderReliability(radar) {
  const p = state.planner;
  const warnings = radar.projection?.warnings ?? [];
  const incomplete = !radar.projection || warnings.length > 0 || Boolean(state.migrationNotice);
  const excluded = radar.items.some(i => i.type === 'expense-overdue' && i.cashDate && i.cashDate < todayIso());
  return `<section class="plan-panel" aria-labelledby="reliability-title"><h2 id="reliability-title">Attendibilità del piano</h2>
    <p class="plan-state">${!p.ready ? 'Imposta il punto di partenza del tuo piano.' : incomplete ? 'La previsione non racconta ancora tutto.' : 'Previsione basata sui movimenti inseriti. Le spese non registrate non sono considerate.'}</p>
    ${p.ready ? `<p>Saldo di riferimento <strong class="money">${formatAmount(p.openingBalanceCents)}</strong> al ${escapeHtml(formatDate(p.balanceDate))} · Riserva <strong class="money">${formatAmount(p.reserveCents)}</strong>.</p>` : ''}
    <p>Effettivi nella data saldo: ${p.sameDayActualsIncluded === true ? 'tutti già inclusi' : p.sameDayActualsIncluded === false ? 'nessuno incluso; applicati' : 'scelta mancante'}. Periodo: ${p.ready ? escapeHtml(formatDate(p.balanceDate)) : 'saldo da impostare'} → ${escapeHtml(formatDate(radar.end))}.</p>
    ${excluded ? '<p class="inline-warning">Alcune uscite non sono incluse: il margine potrebbe risultare più alto del reale.</p>' : ''}
    ${radar.error ? `<p class="inline-warning">Previsione non calcolabile: ${escapeHtml(radar.error)}</p>` : ''}
    ${state.migrationNotice ? `<p class="inline-warning">${escapeHtml(state.migrationNotice)}</p>` : ''}
    ${warnings.length ? `<details class="inline-warning"><summary>${warnings.length} problemi nei dati: verifica inclusioni ed esclusioni</summary><ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></details>` : !radar.projection ? '<p>Completa saldo, data e scelta sugli effettivi. Anche senza saldo, Radar mantiene visibili gli arretrati e i dati mancanti.</p>' : ''}
    <button class="button button-quiet" type="button" data-action="configure-plan">${p.ready ? 'Verifica saldo e dati' : 'Imposta saldo'}</button>
    ${renderCalculation(radar)}</section>`;
}

function renderTrend(radar) {
  const p = radar.projection;
  return `<section class="plan-panel" aria-labelledby="trend-title"><h2 id="trend-title">Andamento previsto</h2><p>Stesso motore del Planning · fino al ${escapeHtml(formatDate(radar.end))} incluso.</p>
    ${!p ? '<p>Previsione non calcolabile: completa o correggi i dati del piano. Nessun valore stimato viene sostituito con zero.</p>' : `
    ${p.warnings.length || state.migrationNotice ? '<p class="inline-warning">La previsione non racconta ancora tutto. Dati esclusi o da verificare: i risultati possono sovrastimare il margine.</p>' : '<p>Previsione basata sui movimenti inseriti. Le spese non registrate non sono considerate.</p>'}
    ${radar.items.some(i => i.type === 'expense-overdue' && i.cashDate && i.cashDate < todayIso()) ? '<p class="inline-warning">Alcune uscite non sono incluse: il margine potrebbe risultare più alto del reale.</p>' : ''}
    <dl class="trend-metrics"><div><dt>Prima sotto riserva</dt><dd>${p.firstCriticalDate ? escapeHtml(formatDate(p.firstCriticalDate)) : 'Non rilevata nei movimenti noti'}${state.planner.reserveCents === 0 ? ' (riserva 0,00 €)' : ''}</dd></div>
    <div><dt>Prima sotto zero</dt><dd>${p.firstBelowZero ? escapeHtml(formatDate(p.firstBelowZero)) : 'Non rilevata nei movimenti noti'}</dd></div>
    <div><dt>Minimo dal saldo di riferimento</dt><dd class="money">${formatAmount(p.minimumCents)}<small>Il ${escapeHtml(formatDate(p.minimumDate))}</small></dd></div>
    <div><dt>Margine rispetto alla riserva</dt><dd class="money">${formatAmount(p.marginCents)}</dd></div></dl>`}
    <button class="button button-quiet" type="button" data-action="planning-results">Apri Planning</button></section>`;
}

function radarExpectedDateLabel(item, expenseSeriesById) {
  if (item.income) return expectedDateLabel(true);
  const split = typeof item.occurrenceId === 'string' ? item.occurrenceId.lastIndexOf('@') : -1;
  const series = split < 0 ? null : expenseSeriesById.get(item.occurrenceId.slice(0, split));
  const amountCents = series ? series.overrides[item.occurrenceId.slice(split + 1)]?.amountCents ?? series.amountCents : 0;
  return expectedDateLabel(false, amountCents);
}

function renderRadarItems(items, home = false) {
  if (!items.length) return '<p class="empty-context">Nessuna azione rilevata dalle regole sui dati inseriti. Non è una verifica di spese o entrate non registrate.</p>';
  const expenseSeriesById = new Map(state.deadlines.map(series => [series.id, series]));
  const incomeSeriesById = home ? new Map(state.planner.incomes.map(series => [series.id, series])) : null;
  const homeMeta = item => {
    if (!home) return '';
    const labels = {
      critical: ['Margine da verificare', 'urgent'], configuration: ['Piano da impostare', 'urgent'],
      calculation: ['Dati da verificare', 'urgent'], 'expense-overdue': ['Uscita da verificare', 'overdue'],
      'income-overdue': ['Incasso atteso', 'urgent'], 'expense-missing': ['Dati mancanti', 'urgent'],
      'income-missing': ['Dati mancanti', 'urgent'],
    };
    const [label, status] = labels[item.type] ?? ['Da verificare', 'urgent'];
    const split = typeof item.occurrenceId === 'string' ? item.occurrenceId.lastIndexOf('@') : -1;
    const series = split < 0 ? null : (item.income ? incomeSeriesById : expenseSeriesById).get(item.occurrenceId.slice(0, split));
    const key = split < 0 ? null : item.occurrenceId.slice(split + 1);
    const amount = series ? series.overrides[key]?.amountCents ?? series.snapshots?.[key]?.amountCents ?? series.amountCents : null;
    return `<div class="priority-meta"><span class="status-pill ${status}">${label}</span>${Number.isSafeInteger(amount) && amount > 0 ? `<strong class="money">${escapeHtml(formatAmount(amount))}</strong>` : ''}</div>`;
  };
  return `<ol class="radar-list">${items.map(item => `<li class="radar-card"><article>${homeMeta(item)}<p class="eyebrow">${item.severity === 0 ? 'PRIORITÀ PIANO' : item.severity === 1 ? 'DA VERIFICARE' : 'DATI DA COMPLETARE'}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>
    ${item.occurrenceId && item.dueDate ? `<p class="radar-dates">Scadenza: ${escapeHtml(formatDate(item.dueDate))} · ${radarExpectedDateLabel(item, expenseSeriesById)}: ${item.cashDate ? escapeHtml(formatDate(item.cashDate)) : 'non nota'}</p>` : ''}
    ${item.type === 'critical' ? `<p>Prima sotto riserva: ${item.firstCriticalDate ? escapeHtml(formatDate(item.firstCriticalDate)) : 'non rilevata'}; prima sotto zero: ${item.firstBelowZero ? escapeHtml(formatDate(item.firstBelowZero)) : 'non rilevata'}.</p><details><summary>Perché questa segnalazione?</summary><p>Saldo iniziale ${formatAmount(state.planner.openingBalanceCents)} al ${escapeHtml(formatDate(state.planner.balanceDate))}; riserva ${formatAmount(state.planner.reserveCents)}. Movimenti applicati fino alla prima criticità/sottozero (incluse tutte le operazioni della giornata, uscite prima delle entrate):</p><ul>${item.movements.map(r => `<li>${escapeHtml(formatDate(r.date))} · ${escapeHtml(r.label)} · ${formatAmount(r.amountCents)} → saldo ${formatAmount(r.balanceCents)}</li>`).join('') || '<li>Criticità già presente nel saldo iniziale.</li>'}</ul></details>` : ''}
    <div class="radar-actions"><button class="button button-primary" type="button" data-action="${item.action}"${item.occurrenceId ? ` data-id="${escapeHtml(item.occurrenceId)}"` : ''}${item.view ? ` data-view="${item.view}"` : ''}>${item.actionLabel}</button>
    ${item.editAction ? `<button class="text-button" type="button" data-action="${item.editAction}" data-id="${escapeHtml(item.occurrenceId)}">Aggiorna previsione / modifica singola</button>` : ''}</div></article></li>`).join('')}</ol>`;
}

function renderRadar() {
  const radar = currentRadar();
  return `<p class="eyebrow">REGOLE SPIEGABILI · SOLO DATI LOCALI</p><h1 class="page-title">Radar</h1><p class="page-description">${radar.items.length} segnalazioni, ordinate per gravità e data. Occorrenze considerate dall’ancora delle serie fino al ${escapeHtml(formatDate(radar.end))}, incluse eccezioni e casse anticipate riconosciute dal motore. Nessun troncamento dell’elenco; limite motore 100.000 passi per serie, con errore visibile.</p>${renderRadarItems(radar.items)}${renderCalculation(radar)}`;
}

// Presentation only: coordinates use every applied engine row, not monthly averages.
// A step on the same civil day retains outflows-before-inflows and the true low.
function forecastGeometry(radar) {
  const p = radar.projection;
  if (!p) return null;
  const civilDay = iso => {
    const date = parseIsoDate(iso);
    return date ? Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000 : NaN;
  };
  const firstDay = civilDay(state.planner.balanceDate), lastDay = civilDay(radar.end);
  let low = Math.min(0, state.planner.openingBalanceCents, state.planner.reserveCents);
  let high = Math.max(0, state.planner.openingBalanceCents, state.planner.reserveCents);
  for (const row of p.rows) { low = Math.min(low, row.balanceCents); high = Math.max(high, row.balanceCents); }
  // Scaled ratios avoid losing integer-cent extrema or overflowing a spread call.
  const span = high - low || 1;
  const x = date => 24 + (civilDay(date) - firstDay) / Math.max(1, lastDay - firstDay) * 672;
  const y = cents => 24 + (high - cents) / span * 184;
  const coordinate = value => value.toFixed(2);
  let path = `M ${coordinate(x(state.planner.balanceDate))} ${coordinate(y(state.planner.openingBalanceCents))}`;
  for (const row of p.rows) path += ` H ${coordinate(x(row.date))} V ${coordinate(y(row.balanceCents))}`;
  path += ` H ${coordinate(x(radar.end))}`;
  return { path, minimumX: coordinate(x(p.minimumDate)), minimumY: coordinate(y(p.minimumCents)), reserveY: coordinate(y(state.planner.reserveCents)), zeroY: coordinate(y(0)), endingX: coordinate(x(radar.end)) };
}

function renderForecastChart(radar, compact = false) {
  const g = forecastGeometry(radar);
  if (!g) return '';
  const p = radar.projection, suffix = compact ? 'summary' : 'full';
  return `<svg class="forecast-chart${compact ? ' forecast-sparkline' : ''}" viewBox="0 0 720 232" role="img" aria-labelledby="forecast-title-${suffix} forecast-desc-${suffix}">
    <title id="forecast-title-${suffix}">Saldo del piano dal riferimento al termine della previsione</title>
    <desc id="forecast-desc-${suffix}">Dal ${escapeHtml(formatDate(state.planner.balanceDate))} al ${escapeHtml(formatDate(radar.end))}. Minimo prudenziale ${escapeHtml(formatAmount(p.minimumCents))} il ${escapeHtml(formatDate(p.minimumDate))}. Riserva ${escapeHtml(formatAmount(state.planner.reserveCents))}. Uscite prima delle entrate nello stesso giorno. La linea include ogni movimento applicato, anche precedente a oggi; non è un saldo bancario.</desc>
    <path class="forecast-zero" d="M 24 ${g.zeroY} H ${g.endingX}" />
    <path class="forecast-reserve" d="M 24 ${g.reserveY} H ${g.endingX}" />
    <path class="forecast-line" d="${g.path}" />
    <circle class="forecast-minimum" cx="${g.minimumX}" cy="${g.minimumY}" r="5"><title>Minimo: ${escapeHtml(formatAmount(p.minimumCents))} · ${escapeHtml(formatDate(p.minimumDate))}</title></circle>
  </svg>`;
}

function renderHomeSummary(radar) {
  const p = radar.projection;
  return `<section class="home-summary" aria-labelledby="summary-title"><p id="summary-title">Minimo dal saldo di riferimento</p>
    ${p ? `<strong class="summary-value money">${escapeHtml(formatAmount(p.minimumCents))}</strong><p>Il ${escapeHtml(formatDate(p.minimumDate))} · ${p.marginCents < 0 ? 'sotto la riserva' : 'pari o sopra la riserva'}</p>
    ${renderForecastChart(radar, true)}
    <div class="summary-facts"><p>Saldo di riferimento<strong class="money">${escapeHtml(formatAmount(state.planner.openingBalanceCents))}</strong><small>Al ${escapeHtml(formatDate(state.planner.balanceDate))}</small></p><p>Riserva impostata<strong class="money">${escapeHtml(formatAmount(state.planner.reserveCents))}</strong><small>Non è un saldo bancario</small></p></div>
    <p class="summary-caution">${p.warnings.length || state.migrationNotice ? 'Dati esclusi o da verificare: il margine può essere sovrastimato.' : 'Solo movimenti inseriti; spese non registrate escluse.'}</p>` : '<p class="summary-value">Completa il tuo piano</p><p>Nessun saldo stimato: imposta o verifica saldo, data e trattamento degli effettivi.</p><button class="button button-quiet" type="button" data-action="configure-plan">Verifica dati del piano</button>'}
    </section>`;
}

function renderHomeTrend(radar) {
  const p = radar.projection;
  return `<section class="plan-panel home-trend" aria-labelledby="trend-title"><h2 id="trend-title">Andamento previsto</h2>
    <p>Dal saldo di riferimento al ${escapeHtml(formatDate(radar.end))} incluso. Stesso motore del Planning.</p>
    ${radar.items.some(i => i.type === 'expense-overdue' && i.cashDate && i.cashDate < todayIso()) ? '<p class="inline-warning">Alcune uscite non sono incluse: il margine potrebbe risultare più alto del reale.</p>' : ''}
    ${p ? `<div class="home-minimum"><span>Minimo dal saldo di riferimento</span><strong class="money">${escapeHtml(formatAmount(p.minimumCents))}</strong><span>Il ${escapeHtml(formatDate(p.minimumDate))}</span></div>
    ${renderForecastChart(radar)}
    <div class="forecast-range"><time datetime="${escapeHtml(state.planner.balanceDate)}">${escapeHtml(formatDate(state.planner.balanceDate))}</time><time datetime="${escapeHtml(radar.end)}">${escapeHtml(formatDate(radar.end))}</time></div>
    <ul class="forecast-legend"><li><i class="legend-line" aria-hidden="true"></i>Saldo del piano</li><li><i class="legend-reserve" aria-hidden="true"></i>Riserva · ${escapeHtml(formatAmount(state.planner.reserveCents))}</li><li><i class="legend-zero" aria-hidden="true"></i>Zero</li></ul>
    <p class="field-help">Linea a gradini: ogni movimento applicato, uscite prima delle entrate della stessa giornata. Include gli effettivi dal saldo di riferimento, anche precedenti a oggi. Non è un estratto conto.</p>
    ${p.warnings.length || state.migrationNotice ? '<p class="inline-warning">La previsione non racconta ancora tutto. Dati esclusi o da verificare: i risultati possono sovrastimare il margine.</p>' : '<p class="field-help">Previsione basata sui movimenti inseriti. Le spese non registrate non sono considerate.</p>'}
    <dl class="trend-metrics"><div><dt>Prima sotto riserva</dt><dd>${p.firstCriticalDate ? escapeHtml(formatDate(p.firstCriticalDate)) : 'Non rilevata nei movimenti noti'}</dd></div><div><dt>Prima sotto zero</dt><dd>${p.firstBelowZero ? escapeHtml(formatDate(p.firstBelowZero)) : 'Non rilevata nei movimenti noti'}</dd></div><div><dt>Margine rispetto alla riserva</dt><dd class="money">${escapeHtml(formatAmount(p.marginCents))}</dd></div></dl>
    <details class="forecast-values"><summary>Valori mensili del grafico</summary><p>Riepiloghi del motore dal mese corrente al termine dell’orizzonte; il minimo complessivo sopra comprende anche il periodo dal saldo di riferimento a oggi.</p><div class="forecast-table-wrap" tabindex="0" role="region" aria-label="Valori mensili, tabella scorrevole"><table class="forecast-table"><caption>Saldo e minimo prudenziale per periodo</caption><thead><tr><th scope="col">Periodo fino al</th><th scope="col">Saldo finale</th><th scope="col">Minimo</th></tr></thead><tbody>${p.months.map(month => `<tr><th scope="row">${escapeHtml(formatDate(month.until))}</th><td class="money">${escapeHtml(formatAmount(month.endingBalanceCents))}</td><td class="money">${escapeHtml(formatAmount(month.minimumCents))}</td></tr>`).join('')}</tbody></table></div></details>` : '<p class="empty-context">Previsione non calcolabile: completa o correggi i dati del piano. Nessun valore stimato viene sostituito con zero.</p>'}
    <button class="button button-quiet" type="button" data-action="planning-results">Apri Planning</button></section>`;
}

function renderHomeUpcoming(upcoming) {
  return `<ul class="home-upcoming-list">${upcoming.map(deadline => {
    const status = deadlineStatus(deadline), date = parseIsoDate(deadline.dueDate);
    return `<li><details class="home-upcoming-row"><summary>
      ${date ? `<time class="date-icon" datetime="${escapeHtml(deadline.dueDate)}" aria-label="Scadenza: ${escapeHtml(formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' }))}"><span class="date-day">${escapeHtml(formatDate(date, { day: 'numeric' }))}</span><small>${escapeHtml(formatDate(date, { month: 'short' }).toLocaleUpperCase('it-IT'))}</small></time>` : '<span>Data non valida</span>'}
      <span class="upcoming-copy"><strong>${escapeHtml(deadline.title)}</strong><small>${escapeHtml(categoryName(deadline.category))}</small><small>Scadenza: ${escapeHtml(formatDate(deadline.dueDate))} · ${expectedDateLabel(false, deadline.amountCents)}: ${deadline.cashDate ? escapeHtml(formatDate(deadline.cashDate)) : 'non nota'}</small></span>
      <span class="status-pill ${['urgent', 'overdue'].includes(status.className) ? status.className : ''}">${escapeHtml(status.text)}</span>
      ${deadline.amountCents > 0 ? `<strong class="money upcoming-amount">${escapeHtml(formatAmount(deadline.amountCents))}</strong>` : '<span class="upcoming-amount">Importo non indicato</span>'}
      <span class="upcoming-manage">Gestisci ${icon('right')}</span>
    </summary><div class="upcoming-details">${renderDeadlineCard(deadline)}</div></details></li>`;
  }).join('')}</ul>`;
}

function renderHome() {
  const radar = currentRadar();
  let upcoming = [], listError = null;
  try { upcoming = sortDeadlines(state.deadlines.flatMap(series => {
    if (series.archived) return [];
    const end = series.dueDate > radar.end ? series.dueDate : radar.end;
    return sortDeadlines(occurrences([series], end).filter(o => !o.completed && !o.cancelled && o.dueDate >= todayIso())).slice(0, 1);
  })); }
  catch (error) { listError = error.message; }
  return `<div class="home-page"><div class="home-heading"><p class="eyebrow">SCADENZARIO · ${escapeHtml(formatDate(todayIso(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p><h1 class="page-title">Il tuo piano, in chiaro.</h1><p class="page-description">Solo i dati che hai inserito, nessuna stima nascosta.</p></div>
    ${renderHomeSummary(radar)}
    <section class="home-priorities" aria-labelledby="priorities-title"><div class="section-heading"><div><h2 id="priorities-title">Da gestire</h2><p>${radar.items.length} segnalazioni · al massimo 3 qui, elenco completo nel Radar</p></div><button class="text-button" type="button" data-action="navigate" data-view="radar">Apri Radar · ${radar.items.length} ${icon('right')}</button></div>${renderRadarItems(radar.items.slice(0, 3), true)}</section>
    <div class="home-plan-grid">${renderHomeTrend(radar)}${renderReliability(radar)}</div>
    <section class="plan-panel home-upcoming"><div class="section-heading"><div><h2>Prossime scadenze</h2><p>Prima occorrenza aperta per serie, da oggi; tutte le occorrenze e lo storico in Agenda. Espandi una riga per gestirla.</p></div><button class="text-button" type="button" data-action="navigate" data-view="calendar">Vai all’Agenda ${icon('right')}</button></div>
    ${listError ? `<p class="inline-warning">Elenco non calcolabile: ${escapeHtml(listError)}</p>` : upcoming.length ? renderHomeUpcoming(upcoming) : '<p class="empty-context">Nessuna prossima scadenza nei dati inseriti. Controlla gli arretrati nel Radar o aggiungi una scadenza.</p>'}
    <button class="button button-quiet" type="button" data-action="new-deadline">Nuova scadenza</button></section>${renderInstallBanner()}</div>`;
}

function renderDateStrip() {
  const today = dateOnly(new Date());
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const todayIso = dateToIso(today);
  const cells = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = dateToIso(date);
    const hasEvent = viewOccurrences(iso, iso).some((deadline) => !deadline.archived && !deadline.completed && !deadline.cancelled && deadline.dueDate === iso);
    return `<button class="date-cell${iso === selectedHomeDate ? ' selected' : ''}${hasEvent ? ' has-event' : ''}" type="button" data-action="select-home-date" data-date="${iso}" aria-pressed="${iso === selectedHomeDate}">
      <span class="day">${escapeHtml(new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(date))}</span>
      <span class="number">${date.getDate()}</span><i class="dot"></i>
    </button>`;
  }).join('');
  return `<div class="date-strip" aria-label="Giorni di questa settimana">${cells}</div>`;
}

function renderCategoryFilter() {
  return `<select class="select-control" aria-label="Filtra per categoria" data-filter="category">
    <option value="all"${filters.category === 'all' ? ' selected' : ''}>Tutte le categorie</option>
    ${Object.entries(CATEGORY_LABELS).map(([key, label]) => `<option value="${key}"${filters.category === key ? ' selected' : ''}>${label}</option>`).join('')}
  </select>`;
}

function renderStatusFilter() {
  const options = [['active', 'Da fare'], ['all', 'Tutte'], ['completed', 'Completate'], ['archived', 'Archiviate'], ['cancelled', 'Annullate (recuperabili)']];
  return `<select class="select-control" aria-label="Filtra per stato" data-filter="status">${options.map(([key, label]) => `<option value="${key}"${filters.status === key ? ' selected' : ''}>${label}</option>`).join('')}</select>`;
}

function renderDeadlineList(deadlines) {
  if (deadlines.length === 0) {
    const isFiltered = filters.category !== 'all'
      || (filters.status !== 'active' && filters.status !== 'all')
      || selectedHomeDate !== dateToIso(dateOnly(new Date()));
    return `<div class="empty-state"><span class="empty-icon">${icon('calendar')}</span>
      <h3>${isFiltered ? 'Nessuna scadenza in questa selezione' : 'Nessuna scadenza ancora'}</h3>
      <p>${isFiltered ? 'Prova a cambiare giorno o filtri, oppure aggiungi una nuova scadenza.' : 'Aggiungi la prima scadenza oppure scegli un suggerimento dal catalogo.'}</p>
      <button class="button button-primary" type="button" data-action="new-deadline">${icon('plus')}Aggiungi scadenza</button>
    </div>`;
  }
  return `<div class="deadline-list">${deadlines.map(renderDeadlineCard).join('')}</div>`;
}

function renderDeadlineCard(deadline) {
  const status = deadlineStatus(deadline);
  const statusClass = ['urgent', 'overdue'].includes(status.className) ? status.className : '';
  const date = parseIsoDate(deadline.dueDate);
  const recurrence = deadline.recurrenceMonths ? ` · ${recurrenceLabel(deadline.recurrenceMonths)}` : '';
  const amount = deadline.amountCents > 0 ? formatAmount(deadline.amountCents) : '';
  const classes = ['deadline-card'];
  if (status.className === 'urgent') classes.push('urgent');
  if (status.className === 'overdue') classes.push('overdue');
  if (deadline.completed) classes.push('completed');
  const completeAction = deadline.completed ? 'reopen-deadline' : 'complete-deadline';
  const completeLabel = deadline.completed ? 'Annulla completamento e riapri' : deadline.amountCents ? 'Registra pagamento effettivo' : 'Completa promemoria senza movimento';
  const actionButtons = deadline.cancelled ? `<button class="text-button" type="button" data-action="restore-occurrence" data-id="${escapeHtml(deadline.id)}">Ripristina singola</button>` : deadline.archived ? `<button class="text-button" type="button" data-action="restore-deadline" data-id="${escapeHtml(deadline.seriesId)}">Riattiva serie</button>` : `
    <div class="card-actions">
      ${!deadline.amountCents && !deadline.completed ? `<button class="text-button" type="button" data-action="record-deadline" data-id="${escapeHtml(deadline.id)}">Registra pagamento</button>` : ''}
      <button class="card-action" type="button" data-action="${completeAction}" data-id="${escapeHtml(deadline.id)}" aria-label="${completeLabel}" title="${completeLabel}">${icon('check')}</button>
      ${deadline.completed && !deadline.done ? `<button class="text-button" type="button" data-action="complete-deadline" data-id="${escapeHtml(deadline.id)}">Correggi effettivo</button>` : ''}
      <button class="card-action" type="button" data-action="edit-deadline" data-id="${escapeHtml(deadline.id)}" aria-label="Modifica singola ${escapeHtml(deadline.title)}" title="Modifica singola">${icon('edit')}</button>
      <button class="text-button" type="button" data-action="edit-series" data-id="${escapeHtml(deadline.seriesId)}">Modifica serie</button>
      ${!deadline.completed ? `<button class="text-button" type="button" data-action="cancel-occurrence" data-id="${escapeHtml(deadline.id)}">Annulla singola</button>` : ''}
      <button class="card-action" type="button" data-action="archive-deadline" data-id="${escapeHtml(deadline.id)}" aria-label="Archivia intera serie ${escapeHtml(deadline.title)}" title="Archivia intera serie">${icon('archive')}</button>
    </div>`;
  return `<article class="${classes.join(' ')}">
    ${date ? `<time class="date-icon" datetime="${escapeHtml(deadline.dueDate)}" aria-label="Scadenza: ${escapeHtml(formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' }))}"><span class="date-day">${escapeHtml(formatDate(date, { day: 'numeric' }))}</span><small>${escapeHtml(formatDate(date, { month: 'short' }).toLocaleUpperCase('it-IT'))}</small></time>` : `<span class="date-icon date-icon-invalid">${escapeHtml(formatDate(deadline.dueDate))}</span>`}
    <div><p class="deadline-title">${escapeHtml(deadline.title)}</p><p class="deadline-meta">${escapeHtml(categoryName(deadline.category))}${escapeHtml(recurrence)}${deadline.notes ? ` · ${escapeHtml(deadline.notes)}` : ''} · Scadenza: ${escapeHtml(formatDate(deadline.dueDate))} · ${expectedDateLabel(false, deadline.amountCents)}: ${deadline.cashDate ? escapeHtml(formatDate(deadline.cashDate)) : 'non nota'}${deadline.actual ? ` · Pagato ${escapeHtml(formatAmount(deadline.actual.amountCents))} il ${escapeHtml(formatDate(deadline.actual.date))}` : deadline.legacyCompleted ? ' · Storico: data/importo effettivi sconosciuti' : ''}</p></div>
    <div class="deadline-right">${amount ? `<span class="deadline-amount">${escapeHtml(amount)}</span>` : ''}<span class="status-pill ${statusClass}">${escapeHtml(status.text)}</span>${actionButtons}</div>
  </article>`;
}

function renderCatalogWarning() {
  if (!catalogError) return '';
  return `<div class="notice error">Il catalogo non è stato caricato: ${escapeHtml(catalogError)}. Le scadenze manuali restano disponibili; avvia l’app tramite un server locale (per esempio Live Server) per caricare il JSON.</div>`;
}

function renderInstallBanner() {
  if (!deferredInstallPrompt) return '';
  return `<div class="install-banner"><p>Puoi aggiungere Scadenzario alla schermata Home e riaprirlo come un’app.</p><button class="button button-quiet" type="button" data-action="install-app">Installa app</button></div>`;
}

function getCalendarCashDays(projection, projectionEnd, fromDate, toDate) {
  const actuals = cashReport(state.planner, state.deadlines, fromDate, toDate, todayIso()).rows.filter(r => r.actual);
  if (!projection && !actuals.length) return null;
  const days = new Map();
  const makeDay = (balance = null) => ({ openingBalanceCents: balance, closingBalanceCents: balance, minimumBalanceCents: balance,
    incomeForecastCents: 0, incomeActualCents: 0, expenseForecastCents: 0, expenseActualCents: 0, movements: [] });
  if (projection && state.planner.ready) {
    const firstDate = fromDate > state.planner.balanceDate ? fromDate : state.planner.balanceDate;
    const lastDate = toDate < projectionEnd ? toDate : projectionEnd;
    const rows = projection.rows;
    let rowIndex = 0, balance = state.planner.openingBalanceCents;
    while (rowIndex < rows.length && rows[rowIndex].date < firstDate) balance = rows[rowIndex++].balanceCents;
    for (let date = firstDate; date <= lastDate; date = dateToIso(addDays(parseIsoDate(date), 1))) {
      const day = makeDay(balance);
      while (rowIndex < rows.length && rows[rowIndex].date === date) {
        const row = rows[rowIndex++];
        balance = row.balanceCents;
        day.minimumBalanceCents = Math.min(day.minimumBalanceCents, balance);
        if (!row.actual && row.amountCents !== 0) {
          day[row.amountCents > 0 ? 'incomeForecastCents' : 'expenseForecastCents'] += Math.abs(row.amountCents);
          day.movements.push(row);
        }
      }
      day.closingBalanceCents = balance;
      days.set(date, day);
    }
  }
  // Gli effettivi assorbiti sono visibili, ma non vengono applicati una seconda volta.
  for (const row of actuals) {
    if (!days.has(row.date)) days.set(row.date, makeDay());
    const day = days.get(row.date);
    day[row.amountCents > 0 ? 'incomeActualCents' : 'expenseActualCents'] += Math.abs(row.amountCents);
    day.movements.push(row);
  }
  for (const day of days.values()) day.movements.sort((a, b) => a.amountCents - b.amountCents);
  return days;
}

function renderCalendarCashDetail(day, projection, projectionEnd, date) {
  if (!projection && !day) {
    return `<section class="calendar-cash-detail"><h3>Flussi di cassa · ${escapeHtml(formatDate(date))}</h3>
      <p class="notice">Imposta un saldo di riferimento valido in <button class="text-button" type="button" data-action="configure-plan">Planning</button> per visualizzare i saldi giornalieri. Nessun saldo viene inventato.</p></section>`;
  }
  if (!day) {
    return `<section class="calendar-cash-detail"><h3>Flussi di cassa · ${escapeHtml(formatDate(date))}</h3>
      <p class="empty-context">Questa data è fuori dall’intervallo stimabile (${escapeHtml(formatDate(state.planner.balanceDate))} – ${escapeHtml(formatDate(projectionEnd))}). Non viene mostrato un saldo ipotetico.</p></section>`;
  }
  const hasBalance = day.closingBalanceCents !== null;
  const belowReserve = hasBalance && day.minimumBalanceCents < state.planner.reserveCents;
  const belowZero = hasBalance && day.minimumBalanceCents < 0;
  return `<section class="calendar-cash-detail" aria-labelledby="calendar-cash-title">
    <h3 id="calendar-cash-title">Flussi di cassa · ${escapeHtml(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</h3>
    <div class="cash-day-summary">
      ${hasBalance ? `<div><span>Saldo a inizio giornata</span><strong>${escapeHtml(formatAmount(day.openingBalanceCents))}</strong></div>` : ''}
      <div><span>Entrate · previste / incassate</span><strong>${escapeHtml(formatAmount(day.incomeForecastCents))} / ${escapeHtml(formatAmount(day.incomeActualCents))}</strong></div>
      <div><span>Uscite · previste / pagate</span><strong>${escapeHtml(formatAmount(day.expenseForecastCents))} / ${escapeHtml(formatAmount(day.expenseActualCents))}</strong></div>
      ${hasBalance ? `<div class="${belowReserve ? 'below-reserve' : ''}"><span>Saldo a fine giornata</span><strong>${escapeHtml(formatAmount(day.closingBalanceCents))}</strong></div>` : ''}
    </div>
    ${hasBalance ? `<p class="cash-day-minimum${belowReserve ? ' below-reserve' : ''}">Minimo intragiornaliero prudenziale: <strong>${escapeHtml(formatAmount(day.minimumBalanceCents))}</strong>${belowReserve ? ` · sotto la riserva di ${escapeHtml(formatAmount(state.planner.reserveCents))}${belowZero ? ' e sotto zero' : ''}` : ''}.</p>` : `<p class="notice">Effettivi registrati; saldo storico non stimabile, fuori dall’intervallo stimabile. ${projection ? 'Prima del saldo di riferimento non si ricostruisce un saldo storico.' : 'Imposta un saldo di riferimento valido in Planning per i saldi futuri.'}</p>`}
    ${day.movements.length ? `<ul class="cash-movement-list">${day.movements.map((movement) => {
      const income = movement.amountCents > 0;
      const kind = income ? movement.actual ? 'Incasso effettivo' : 'Entrata prevista' : movement.actual ? 'Pagamento effettivo' : 'Uscita prevista';
      return `<li><span><strong>${escapeHtml(movement.label.replace(/ \(\d{4}-\d{2}-\d{2}\)$/, ''))}</strong><small>${kind}</small></span><strong class="${income ? 'cash-income' : 'cash-expense'}">${income ? '+' : ''}${escapeHtml(formatAmount(movement.amountCents))}</strong></li>`;
    }).join('')}</ul>` : '<p class="empty-context">Nessun movimento con data di cassa prevista o effettiva in questo giorno.</p>'}
  </section>`;
}

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(calendarMonth);
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - ((firstDay.getDay() + 6) % 7));
  const gridEnd = dateToIso(addDays(gridStart, 41));
  const end = gridEnd > planningEnd(todayIso()) ? gridEnd : planningEnd(todayIso());
  const all = viewOccurrences(end);
  const activeDeadlines = filterAgenda(all, { ...filters, period: 'all' }, todayIso());
  const cashRadar = calendarMode === 'cash' ? currentRadar() : null;
  const projection = cashRadar?.projection ?? null;
  let cashDays = null, cashError = null;
  if (calendarMode === 'cash') {
    try { cashDays = getCalendarCashDays(projection, cashRadar.end, dateToIso(gridStart), gridEnd); }
    catch (error) { cashError = error.message; }
  }
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const iso = dateToIso(date);
    const events = sortDeadlines(activeDeadlines.filter((deadline) => deadline.dueDate === iso));
    const cashDay = cashDays?.get(iso);
    const classes = ['calendar-day'];
    if (date.getMonth() !== month) classes.push('outside');
    if (iso === dateToIso(dateOnly(new Date()))) classes.push('today');
    if (iso === selectedCalendarDate) classes.push('selected');
    if (calendarMode === 'cash' && cashDay && cashDay.minimumBalanceCents !== null && cashDay.minimumBalanceCents < state.planner.reserveCents) classes.push('below-reserve');
    if (calendarMode === 'cash' && cashDay && cashDay.minimumBalanceCents !== null && cashDay.minimumBalanceCents < 0) classes.push('below-zero');
    if (calendarMode === 'cash' && (!cashDay || cashDay.closingBalanceCents === null)) classes.push('cash-unavailable');
    const dailyNetCents = cashDay
      ? cashDay.incomeForecastCents + cashDay.incomeActualCents - cashDay.expenseForecastCents - cashDay.expenseActualCents
      : 0;
    const cashLabel = cashDay
      ? `, flusso netto ${formatAmount(dailyNetCents)}${cashDay.closingBalanceCents === null ? ', saldo non disponibile per questa data' : `, saldo finale ${formatAmount(cashDay.closingBalanceCents)}, minimo intragiornaliero ${formatAmount(cashDay.minimumBalanceCents)}${cashDay.minimumBalanceCents < state.planner.reserveCents ? ', sotto riserva' : ''}`}`
      : calendarMode === 'cash' ? ', saldo non disponibile per questa data' : '';
    const cashMarkup = calendarMode === 'cash'
      ? cashDay
        ? `<span class="calendar-cash-net">${escapeHtml(dailyNetCents >= 0 ? '+' : '')}${escapeHtml(formatAmount(dailyNetCents))}</span>${cashDay.closingBalanceCents === null ? '<span class="calendar-cash-balance">Non stimabile</span>' : `<span class="calendar-cash-balance" title="Saldo finale stimato: ${escapeHtml(formatAmount(cashDay.closingBalanceCents))}">${escapeHtml(formatAmount(cashDay.closingBalanceCents))}</span>`}`
        : '<span class="calendar-cash-balance">Non stimabile</span>'
      : `<span class="calendar-events">${events.slice(0, 2).map((event) => `<span class="calendar-event${dayDifference(event.dueDate) < 0 && !event.completed ? ' overdue' : ''}">${escapeHtml(event.title)}</span>`).join('')}${events.length > 2 ? `<span class="calendar-event more">+${events.length - 2} altre</span>` : ''}</span>`;
    return `<button class="${classes.join(' ')}" type="button" data-action="select-calendar-date" data-date="${iso}" aria-pressed="${iso === selectedCalendarDate}" aria-label="${escapeHtml(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}${calendarMode === 'cash' ? cashLabel : events.length ? `, ${events.length} scadenze` : ''}">
      <span class="calendar-day-number">${date.getDate()}</span>
      ${cashMarkup}
    </button>`;
  }).join('');
  const selectedDeadlines = filterAgenda(all, { ...filters, period: agendaPeriod, date: selectedCalendarDate }, todayIso());
  const selectedCashDay = cashDays?.get(selectedCalendarDate);
  const selection = { today: 'Oggi', upcoming: 'Prossime (dopo oggi)', overdue: 'Arretrati', all: 'Tutte le date / storico', day: `Giorno selezionato: ${formatDate(selectedCalendarDate)}` }[agendaPeriod];
  return `
    <p class="eyebrow">PIANIFICA</p><h1 class="page-title">Agenda</h1>
    <p class="page-description">Scadenze legali e storico. Il Calendario è una vista alternativa: selezionare un giorno attiva esplicitamente il filtro Giorno selezionato.</p>
    <div class="agenda-filters" aria-label="Filtri Agenda"><div class="period-filters" aria-label="Periodo esclusivo">
      ${[['today', 'Oggi'], ['upcoming', 'Prossime'], ['overdue', 'Arretrati'], ['all', 'Tutte / storico']].map(([period, label]) => `<button class="button ${agendaPeriod === period ? 'button-primary' : 'button-quiet'}" type="button" data-action="agenda-period" data-period="${period}" aria-pressed="${agendaPeriod === period}">${label}</button>`).join('')}</div>
      <div class="toolbar">${renderCategoryFilter()}${renderStatusFilter()}</div></div>
    <p class="page-description">Elenco fino al ${escapeHtml(formatDate(end))}, senza troncamento. Per date successive usa il mese del calendario. Completate e archiviate: scegli stato e Tutte / storico.</p>
    <details class="agenda-calendar"${calendarOpen || agendaPeriod === 'day' ? ' open' : ''}><summary>Calendario mensile · ${escapeHtml(monthName)}</summary>
    <div class="calendar-modes" role="group" aria-label="Vista del calendario">
      <button class="button ${calendarMode === 'deadlines' ? 'button-primary' : 'button-quiet'}" type="button" data-action="calendar-mode" data-mode="deadlines" aria-pressed="${calendarMode === 'deadlines'}">Scadenze</button>
      <button class="button ${calendarMode === 'cash' ? 'button-primary' : 'button-quiet'}" type="button" data-action="calendar-mode" data-mode="cash" aria-pressed="${calendarMode === 'cash'}">Flussi di cassa</button>
    </div>
    ${calendarMode === 'cash' ? `<p class="calendar-cash-explanation">Effettivi per data di cassa, anche prima del saldo; in quei giorni il saldo non è stimabile. Gli effettivi già assorbiti sono visibili ma non scalati di nuovo. Il flusso netto può quindi differire dalla variazione del saldo. Le previsioni giornaliere sono solo quelle applicate alla proiezione; gli arretrati aperti restano nel riepilogo mensile. Usa solo movimenti con importo e data di cassa; le uscite vengono applicate prima delle entrate nello stesso giorno. La previsione non include spese non registrate.${projection?.warnings.length ? ` <strong>${projection.warnings.length} avvisi del piano:</strong> alcuni dati mancanti o arretrati possono rendere il saldo incompleto.` : ''}</p>` : ''}
    <div class="calendar-header">
      <h2 class="calendar-title">${escapeHtml(monthName)}</h2>
      <div class="calendar-controls">
        <button class="icon-button" type="button" data-action="calendar-month" data-offset="-1" aria-label="Mese precedente">${icon('left')}</button>
        <button class="icon-button" type="button" data-action="calendar-month" data-offset="1" aria-label="Mese successivo">${icon('right')}</button>
      </div>
    </div>
    <div class="calendar-grid" aria-label="${escapeHtml(monthName)}">
      ${['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((day) => `<span class="calendar-weekday">${day}</span>`).join('')}
      ${cells}
    </div>
    <div class="calendar-legend">${calendarMode === 'cash' ? '<span class="legend-item"><i class="legend-dot"></i>Saldo stimato sopra riserva</span><span class="legend-item"><i class="legend-dot late"></i>Minimo sotto riserva</span>' : '<span class="legend-item"><i class="legend-dot"></i>Scadenza</span><span class="legend-item"><i class="legend-dot late"></i>Scaduta</span>'}</div>
    </details>${calendarMode === 'cash' ? renderCashMonth(dateToIso(calendarMonth)) + (cashError ? `<p class="notice error">Flussi non calcolabili: ${escapeHtml(cashError)}. Nessun importo o saldo viene inventato.</p>` : renderCalendarCashDetail(selectedCashDay, projection, cashRadar.end, selectedCalendarDate)) : ''}<div class="section-heading"><div><h2>${calendarMode === 'cash' ? `Scadenze · ${escapeHtml(selection)}` : escapeHtml(selection)}</h2><p>${selectedDeadlines.length} ${selectedDeadlines.length === 1 ? 'scadenza' : 'scadenze'}</p></div><button class="button button-primary" type="button" data-action="new-deadline" data-date="${selectedCalendarDate}">${icon('plus')}Aggiungi</button></div>
    ${selectedDeadlines.length ? renderDeadlineList(selectedDeadlines) : `<p class="empty-context">Nessuna scadenza: ${escapeHtml(selection)} con categoria e stato selezionati. Cambia periodo o filtri per consultare lo storico.</p>`}`;
}

function renderCatalog() {
  const filtered = catalog.filter((item) => item.profili.includes(state.profile.type));
  return `
    <p class="eyebrow">ISPIRAZIONE</p><h1 class="page-title">Suggerimenti per te</h1>
    <p class="page-description">Idee di scadenze associate al tuo profilo. Le proposte non vengono aggiunte automaticamente: scegli e conferma ogni elemento.</p>
    ${renderCatalogWarning()}
    ${filtered.length === 0
      ? `<div class="empty-state" style="margin-top:20px"><span class="empty-icon">${icon('catalog')}</span><h3>Catalogo non disponibile</h3><p>Avvia Scadenzario tramite Live Server o ricarica la pagina per riprovare il caricamento.</p><button class="button button-quiet" type="button" data-action="reload-catalog">Ricarica catalogo</button></div>`
      : `<div class="catalog-list">${filtered.map((item) => `
        <article class="catalog-item">
          <div><h3>${escapeHtml(item.titolo)}</h3><p>${escapeHtml(categoryName(item.categoria))} · ${escapeHtml(recurrenceLabel(item.mesi))}<br>${escapeHtml(item.nota)}</p></div>
          <button class="button button-quiet" type="button" data-action="use-catalog-item" data-id="${escapeHtml(item.id)}">${icon('plus')}Aggiungi</button>
        </article>`).join('')}</div>`}
    ${renderInstallBanner()}`;
}

function renderProfile() {
  const notificationSupported = 'Notification' in window && window.isSecureContext;
  const notificationsStatus = !notificationSupported
    ? 'Le notifiche del browser richiedono un’origine sicura (HTTPS oppure localhost).'
    : Notification.permission === 'denied'
      ? 'Permesso negato dal browser. Modificalo nelle impostazioni del sito.'
      : 'Il promemoria si attiva quando Scadenzario è aperto; non è garantito a scheda chiusa.';
  return `
    <p class="eyebrow">PERSONALIZZA</p><h1 class="page-title">Il tuo spazio</h1>
    <p class="page-description">Gestisci il profilo e i dati salvati in questo browser.</p>
    <section class="profile-panel">
      <article class="settings-card">
        <h3>Profilo</h3><p>${escapeHtml(state.profile.name)} · ${escapeHtml(PROFILE_LABELS[state.profile.type])}</p>
        <button class="button button-quiet" type="button" data-action="open-profile-dialog">${icon('edit')}Modifica profilo</button>
      </article>
      <article class="settings-card">
        <div class="switch-row"><div><h3>Promemoria browser</h3><p>${escapeHtml(notificationsStatus)}</p></div>
          <label class="switch" aria-label="Attiva promemoria browser"><input id="notification-switch" type="checkbox" ${state.notificationsEnabled ? 'checked' : ''}><span class="switch-track"></span></label>
        </div>
      </article>
      <article class="settings-card">
        <h3>Backup dei dati</h3><p>Esporta una copia JSON o ripristina un backup. Il ripristino sostituisce le scadenze presenti. L’archivio v3 è separato: quello precedente resta conservato. Chiudi o ricarica tutte le vecchie schede; le loro modifiche successive non sono unite automaticamente ai dati nuovi.</p>
        <div class="toolbar" style="margin-top:13px">
          <button class="button button-quiet" type="button" data-action="export-backup">${icon('download')}Esporta</button>
          <button class="button button-quiet" type="button" data-action="choose-backup">${icon('upload')}Ripristina</button>
        </div>
      </article>
      <article class="settings-card">
        <h3>Installazione</h3><p>Usa il menu di condivisione o le opzioni del browser per aggiungere questa app alla schermata Home.</p>
        ${deferredInstallPrompt ? `<button class="button button-quiet" type="button" data-action="install-app">Installa app</button>` : ''}
      </article>
    </section>
    <div class="notice">${icon('info')} I dati vengono conservati soltanto nel localStorage del browser: non sono cifrati né sincronizzati. Evita informazioni sanitarie o documenti riservati. Se cancelli i dati del browser, potresti perdere le scadenze: esporta regolarmente un backup.</div>
    ${serviceWorkerError ? `<div class="notice error">Cache offline non disponibile: ${escapeHtml(serviceWorkerError)}</div>` : ''}
    ${renderInstallBanner()}`;
}

function renderPlanning() {
  const planner = state.planner;
  const radar = currentRadar();
  const end = radar.end;
  const projection = radar.projection;
  let incomeItems = [], incomeError = null;
  try { incomeItems = planner.incomes.flatMap(s => occurrences([s], s.dueDate > end ? s.dueDate : end)).filter(o => !o.cancelled); }
  catch (error) { incomeError = error.message; }
  return `
    <p class="eyebrow">FLUSSI DI CASSA</p><h1 class="page-title">Pianificazione</h1>
    <p class="page-description">Saldo, riserva ed entrate sono salvati su questo browser e inclusi nel backup JSON. Nessuna sincronizzazione o cifratura.</p>
    ${state.migrationNotice ? `<div class="notice">${escapeHtml(state.migrationNotice)}</div>` : ''}
    ${renderReliability(radar)}
    ${renderSeriesManagement()}
    <form id="planner-form" class="settings-card planner-form">
      <h3>Saldo di riferimento</h3>
      <div class="field-row">
        <label class="field"><span>Saldo disponibile (€; anche negativo)</span><input name="openingBalance" inputmode="decimal" required value="${planner.ready ? escapeHtml(formatCentsForInput(planner.openingBalanceCents)) : ''}"></label>
        <label class="field"><span>Riserva minima (€)</span><input name="reserve" inputmode="decimal" required value="${escapeHtml(formatCentsForInput(planner.reserveCents))}"></label>
        <label class="field"><span>Data del saldo</span><input name="balanceDate" type="date" max="${todayIso()}" required value="${escapeHtml(planner.balanceDate ?? todayIso())}"></label>
        <label class="field"><span>Effettivi della stessa data del saldo</span><select name="sameDay" required><option value="">Scegli esplicitamente</option><option value="included"${planner.sameDayActualsIncluded === true ? ' selected' : ''}>Tutti già inclusi nel saldo</option><option value="excluded"${planner.sameDayActualsIncluded === false ? ' selected' : ''}>Nessuno incluso: applicali</option></select></label>
      </div>
      <p class="page-description">Prima della data: effettivi assorbiti. Dopo: applicati anche se già passati rispetto a oggi. Per una giornata inclusa solo in parte, scegli un saldo di riferimento di un altro giorno. Ogni nuovo saldo richiede riconciliazione dei movimenti.</p>
      <button class="button button-primary" type="submit">Salva saldo e riserva</button>
    </form>
    <section class="settings-card income-panel">
      <h2>Entrate previste</h2><p>Non sono incassi automatici. Le previsioni arretrate restano da verificare. Il catalogo bonus non alimenta il planning.</p>
      <form id="income-form" class="planner-form">
        <div class="field-row">
          <label class="field"><span>Descrizione</span><input name="name" maxlength="60" required></label>
          <label class="field"><span>Importo netto (€)</span><input name="amount" inputmode="decimal" required></label>
          <label class="field"><span>Prima data prevista di incasso</span><input name="date" type="date" required></label>
          <label class="field"><span>Ricorrenza</span><select id="income-recurrence" name="months"><option value="0">Una tantum</option><option value="1">Mensile</option><option value="3">Trimestrale</option><option value="12">Annuale</option></select></label>
          <label class="field"><span>Termine ricorrenza</span><select id="income-end-mode" name="endMode"><option value="none">Senza termine</option><option value="date">Fino a una data</option><option value="count">Dopo N occorrenze</option></select></label>
          <label class="field" id="income-end-field" hidden><span>Ultima data inclusa</span><input id="income-end" name="endDate" type="date" disabled></label>
          <label class="field" id="income-count-field" hidden><span>Numero totale occorrenze (max 1200)</span><input id="income-count" name="count" type="number" min="1" max="1200" disabled></label>
        </div>${recurrenceFields('income')}<button class="button button-quiet" type="submit">Aggiungi previsione</button>
      </form>
      ${incomeError ? `<p class="inline-warning">Entrate non calcolabili: ${escapeHtml(incomeError)}</p>` : ''}
      <ul class="income-list">${incomeItems.map(o => `<li><span><strong>${escapeHtml(o.name)}</strong><small>Scadenza: ${escapeHtml(formatDate(o.dueDate))} · Data prevista di incasso: ${o.cashDate ? escapeHtml(formatDate(o.cashDate)) : 'non nota'} · ${formatAmount(o.amountCents)}${o.archived ? ' · Serie archiviata' : ''} · ${o.actual ? `Incassato ${formatAmount(o.actual.amountCents)} il ${escapeHtml(formatDate(o.actual.date))}` : 'Previsto, non incassato'}</small></span><div class="toolbar"><button class="text-button" type="button" data-action="actual-income" data-id="${escapeHtml(o.id)}">${o.actual ? 'Correggi incasso' : 'Registra incasso'}</button>${o.actual ? `<button class="text-button" type="button" data-action="undo-income" data-id="${escapeHtml(o.id)}">Annulla incasso</button>` : `<button class="text-button" type="button" data-action="edit-income" data-id="${escapeHtml(o.id)}">Modifica singola</button>`}${!o.completed ? `<button class="text-button" type="button" data-action="cancel-income-occurrence" data-id="${escapeHtml(o.id)}">Annulla singola</button>` : ''}<button class="text-button" type="button" data-action="edit-income-series" data-id="${escapeHtml(o.seriesId)}">Modifica serie</button><button class="text-button" type="button" data-action="${o.archived ? 'restore-income' : 'remove-income'}" data-id="${escapeHtml(o.seriesId)}">${o.archived ? 'Riattiva serie archiviata' : 'Archivia serie'}</button></div></li>`).join('')}</ul>
    </section>
    ${renderCashMonth(todayIso())}
    <div id="planning-results" tabindex="-1">${renderTrend(radar)}</div>
    ${projection ? `<section class="planning-results">
      <p>Saldo finale previsto: <strong class="money">${formatAmount(projection.endingBalanceCents)}</strong> · Deficit massimo sotto zero: <strong class="money">${formatAmount(projection.deficitCents)}</strong>.</p>
      <div class="notice">Stima parziale fino al ${escapeHtml(formatDate(end, { day: 'numeric', month: 'long', year: 'numeric' }))}. Nessun arretrato viene spostato automaticamente a oggi. Senza orari, uscite prima delle entrate dello stesso giorno (prudenziale). I dati mancanti possono peggiorare il risultato; non include spese quotidiane o non registrate. Non è consulenza finanziaria.</div>
      ${projection.warnings.length ? `<details class="notice error"><summary>${projection.warnings.length} dati mancanti o movimenti da riconciliare (stima incompleta)</summary><ul>${projection.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></details>` : ''}
      <div class="projection-table-wrap"><table class="projection-table"><caption>Riepilogo mensile dei soli movimenti applicati alla proiezione (non consuntivo); effettivi assorbiti nel saldo esclusi. Ultimo mese eventualmente parziale</caption><thead><tr><th scope="col">Mese</th><th scope="col">Entrate applicate al saldo</th><th scope="col">Uscite applicate al saldo</th><th scope="col">Saldo finale</th><th scope="col">Minimo inframensile</th></tr></thead><tbody>${projection.months.map(m => `<tr><th scope="row">${escapeHtml(formatDate(m.month, { month: 'long', year: 'numeric' }))}</th><td>${formatAmount(m.incomeCents)}</td><td>${formatAmount(m.expensesCents)}</td><td>${formatAmount(m.endingBalanceCents)}</td><td class="${m.minimumCents < planner.reserveCents ? 'negative' : ''}">${formatAmount(m.minimumCents)}</td></tr>`).join('')}</tbody></table></div>
      <div class="projection-table-wrap"><table class="projection-table"><caption>Movimenti applicati: gli effettivi sostituiscono la previsione collegata</caption><thead><tr><th scope="col">Data</th><th scope="col">Movimento</th><th scope="col">Tipo</th><th scope="col">Importo</th><th scope="col">Saldo</th></tr></thead><tbody>${projection.rows.map(r => `<tr><th scope="row">${escapeHtml(formatDate(r.date))}</th><td>${escapeHtml(r.label)}</td><td>${r.actual ? 'Effettivo' : 'Previsione'}</td><td>${formatAmount(r.amountCents)}</td><td class="${r.balanceCents < planner.reserveCents ? 'negative' : ''}">${formatAmount(r.balanceCents)}</td></tr>`).join('')}</tbody></table></div>
    </section>` : ''}`;
}

function renderSourceMonitoring() {
  if (bonusCatalogMode !== 'backend' && bonusCatalogMode !== 'scheduled') {
    const monitorStatus = sourceMonitoring?.updateMode === 'not-configured'
      ? 'Il monitoraggio pianificato non è ancora configurato per questa copia. '
      : sourceMonitoringError
        ? `Il backend non è disponibile (${escapeHtml(sourceMonitoringError)}). `
        : '';
    return `<div class="notice warning">${icon('info')} ${monitorStatus}È in uso il catalogo statico: avvia <code>node server.mjs</code> per controllare le fonti in locale.</div>`;
  }
  if (sourceMonitoringError) {
    return `<div class="notice error">${icon('info')} Il catalogo è online, ma lo stato del monitoraggio non è disponibile: ${escapeHtml(sourceMonitoringError)}.</div>`;
  }
  if (!sourceMonitoring) return '';

  const isScheduledSnapshot = bonusCatalogMode === 'scheduled';
  const checkedAt = sourceMonitoring.lastRunAt
    ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(sourceMonitoring.lastRunAt))
    : 'in attesa del primo controllo';
  const sourceRows = sourceMonitoring.sources.map((source) => {
    const statusLabels = {
      baseline: 'prima verifica completata',
      changed: 'variazione da rivedere',
      error: `errore: ${source.lastError || 'controllo non riuscito'}`,
      'error-ai': `errore estrazione AI: ${source.lastError || 'revisione manuale necessaria'}`,
      unchecked: 'non ancora controllata',
      unchanged: 'nessuna variazione rilevata',
    };
    const label = statusLabels[source.status] ?? 'stato non riconosciuto';
    const dateLabel = source.lastCheckedAt
      ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(source.lastCheckedAt))
      : 'mai';
    const changePreview = source.pendingReview && source.lastChange?.excerpt
      ? `<small>Anteprima da verificare: ${escapeHtml(source.lastChange.excerpt)}</small>`
      : '';
    const pdfStatus = source.pdfError
      ? `<small>PDF non analizzato: ${escapeHtml(source.pdfError)}</small>`
      : source.lastPdfAnalyzed?.analyzedAt
        ? `<small>Ultimo PDF letto: ${escapeHtml(new Intl.DateTimeFormat('it-IT', { dateStyle: 'short' }).format(new Date(source.lastPdfAnalyzed.analyzedAt)))}</small>`
        : '';
    return `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a><span>${escapeHtml(label)} · ${escapeHtml(dateLabel)}</span>${changePreview}${pdfStatus}</li>`;
  }).join('');
  return `
    <section class="source-monitoring" aria-labelledby="source-monitoring-title">
      <h3 id="source-monitoring-title">Controllo delle fonti ufficiali${isScheduledSnapshot ? ' — GitHub Actions' : ''}</h3>
      <p>${isScheduledSnapshot ? 'Ultimo controllo pubblicato' : 'Ultimo controllo'}: ${escapeHtml(checkedAt)} · ${sourceMonitoring.pendingReviewCount} variazioni in revisione.</p>
      <p>Copertura pilota: vengono controllate solo le fonti elencate, non tutti i bandi di ogni Regione o Comune italiano.</p>
      <p>Il servizio rileva cambiamenti alle pagine; non aggiorna automaticamente requisiti o agevolazioni. Ogni variazione deve essere verificata prima di modificare il catalogo.</p>
      <ul>${sourceRows}</ul>
    </section>`;
}

function renderStagingReview() {
  if (bonusCatalogMode !== 'backend') {
    return `<section class="staging-panel"><div class="notice warning">${icon('info')} Revisione staging disponibile solo con il backend locale: avvia <code>node server.mjs</code>. La copia statica non può approvare o scartare proposte.</div></section>`;
  }
  if (stagingError) {
    return `<section class="staging-panel"><div class="notice error">${icon('info')} Coda di revisione non disponibile: ${escapeHtml(stagingError)}.</div><button class="button button-quiet" type="button" data-action="reload-staging">Riprova</button></section>`;
  }
  if (stagingEntries === null) {
    return `<section class="staging-panel"><p class="planner-empty">Caricamento delle proposte in revisione…</p></section>`;
  }
  const cards = stagingEntries.map((entry) => {
    const proposal = entry.pendingProposal;
    const region = entry.region ? ` · ${escapeHtml(entry.region)}` : '';
    const municipality = entry.municipality ? ` · ${escapeHtml(entry.municipality)}` : '';
    const scope = `${escapeHtml(entry.scope)}${region}${municipality}`;
    const changedAt = entry.lastCheckedAt
      ? formatDate(entry.lastCheckedAt.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })
      : 'data non disponibile';
    const sourceLink = typeof entry.sourceUrl === 'string' && entry.sourceUrl.startsWith('https://')
      ? `<a href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(entry.sourceLabel)} — apri la fonte ufficiale</a>`
      : '';
    const proposalContent = proposal && typeof proposal === 'object'
      ? `<div class="staging-proposal">
          <h4>${escapeHtml(proposal.title)}</h4>
          <p>${escapeHtml(proposal.description)}</p>
          <p class="benefit-meta">${scope}${proposal.iseeMaxCents === null ? '' : ` · ISEE max ${escapeHtml(formatAmount(proposal.iseeMaxCents))}`}</p>
          ${proposal.requirements?.length ? `<p><strong>Requisiti estratti:</strong> ${proposal.requirements.map(escapeHtml).join('; ')}</p>` : ''}
          ${proposal.startsAt || proposal.endsAt ? `<p class="benefit-meta">Periodo: ${proposal.startsAt ? escapeHtml(formatDate(proposal.startsAt, { day: 'numeric', month: 'short', year: 'numeric' })) : 'non indicato'} – ${proposal.endsAt ? escapeHtml(formatDate(proposal.endsAt, { day: 'numeric', month: 'short', year: 'numeric' })) : 'non indicato'}</p>` : ''}
        </div>`
      : `<p class="staging-manual-note">È stata rilevata una modifica, ma non è disponibile una bozza AI. Verifica la pagina originale prima di decidere.</p>`;
    const status = entry.aiError
      ? `Bozza non disponibile: ${escapeHtml(entry.aiError)}`
      : proposal ? 'Bozza AI: da verificare' : 'Revisione manuale';
    const isBusy = stagingBusyId === entry.sourceId;
    return `<article class="benefit-card staging-card">
      <div class="staging-card-heading"><div><span class="staging-badge">${escapeHtml(status)}</span><h3>${escapeHtml(proposal?.title || entry.sourceLabel)}</h3></div><span class="benefit-meta">Controllato il ${escapeHtml(changedAt)}</span></div>
      ${proposalContent}
      ${entry.lastChange?.excerpt ? `<p class="staging-excerpt"><strong>Variazione rilevata:</strong> ${escapeHtml(entry.lastChange.excerpt)}</p>` : ''}
      ${sourceLink}
      <div class="staging-actions">
        ${proposal ? `<button class="button button-primary" type="button" data-action="approve-staging" data-source-id="${escapeHtml(entry.sourceId)}" ${isBusy ? 'disabled' : ''}>Approva e pubblica nel catalogo</button>` : ''}
        <button class="button button-quiet" type="button" data-action="discard-staging" data-source-id="${escapeHtml(entry.sourceId)}" ${isBusy ? 'disabled' : ''}>Scarta</button>
      </div>
    </article>`;
  }).join('');
  return `<section class="staging-panel" aria-labelledby="staging-title">
    <div class="section-heading"><div><h2 id="staging-title">Proposte da revisionare</h2><p>${stagingEntries.length} ${stagingEntries.length === 1 ? 'elemento in' : 'elementi in'} staging</p></div><button class="button button-quiet" type="button" data-action="reload-staging" ${stagingBusyId ? 'disabled' : ''}>Aggiorna</button></div>
    <div class="notice warning staging-warning">${icon('info')} <strong>Dati di staging, non verificati.</strong> Controlla la fonte ufficiale e requisiti, importi e scadenze. Approvando confermi la revisione e inserisci la voce nel catalogo; lo scarto rimuove l’elemento dalla coda.</div>
    ${stagingEntries.length ? `<div class="staging-list">${cards}</div>` : '<div class="empty-state"><span class="empty-icon">✓</span><h3>Nessuna proposta in attesa</h3><p>Le nuove variazioni rilevate compariranno qui per la revisione.</p></div>'}
  </section>`;
}

function renderBenefits() {
  const staleProgramCount = bonusCatalog.filter((program) => program.scope === 'nazionale'
      && (!program.lastVerifiedAt
      || -dayDifference(program.lastVerifiedAt) < 0
      || -dayDifference(program.lastVerifiedAt) > 90)).length;
  const matchingPrograms = !bonusCatalogError
    ? bonusCatalog.filter((program) => {
      const today = dateToIso(dateOnly(new Date()));
      const daysSinceVerification = program.lastVerifiedAt ? -dayDifference(program.lastVerifiedAt) : Number.POSITIVE_INFINITY;
      if (program.scope !== 'nazionale') return false;
      const dateMatches = (!program.startsAt || program.startsAt <= today)
        && (!program.endsAt || program.endsAt >= today);
      return daysSinceVerification >= 0 && daysSinceVerification <= 90
        && dateMatches;
    })
    : [];
  return `
    <p class="eyebrow">SUPPORTO ALLE FAMIGLIE</p><h1 class="page-title">Bonus e agevolazioni</h1>
    <p class="page-description">Consulta le misure nazionali per persone e famiglie verificate nelle fonti ufficiali. Requisiti ISEE, importi e scadenze dipendono dalla singola misura: controllali nella scheda prima di presentare domanda.</p>
    <div class="notice warning">${icon('info')} Elenco informativo, non verifica l’idoneità e non copre tutte le agevolazioni. Non inserire qui dati o documenti ISEE.</div>
    ${bonusCatalogError
      ? `<div class="notice error">${icon('info')} Catalogo non disponibile: ${escapeHtml(bonusCatalogError)}. Riprova quando il file dei dati è raggiungibile.</div>`
      : bonusCatalog.length === 0
        ? `<div class="empty-state"><span class="empty-icon">${icon('benefits')}</span><h3>Nessuna misura nazionale verificata nel catalogo</h3><p>Il catalogo è parziale e non esaustivo: l'assenza di una misura qui non significa che non esistano altre agevolazioni. Ogni voce richiede fonti ufficiali e aggiornamenti periodici.</p></div>`
        : `<p class="catalog-update">Catalogo non esaustivo · aggiornato ${bonusCatalogUpdatedAt ? escapeHtml(formatDate(bonusCatalogUpdatedAt, { day: 'numeric', month: 'long', year: 'numeric' })) : 'senza data dichiarata'}</p>`}
    ${staleProgramCount ? `<div class="notice warning">${icon('info')} ${staleProgramCount} ${staleProgramCount === 1 ? 'voce non è inclusa' : 'voci non sono incluse'} nei risultati perché la data di verifica è assente o supera 90 giorni.</div>` : ''}
    ${!bonusCatalogError && bonusCatalog.length > 0
      ? matchingPrograms.length
        ? `<section class="benefits-results"><h2>Misure nazionali da approfondire</h2>${matchingPrograms.map((program) => `<article class="benefit-card"><h3>${escapeHtml(program.title)}</h3><p>${escapeHtml(program.description)}</p><p class="benefit-meta">${escapeHtml(program.scope)}${program.region ? ` · ${escapeHtml(program.region)}` : ''}${program.municipality ? ` · ${escapeHtml(program.municipality)}` : ''}</p>${program.requirements.length ? `<p><strong>Requisiti da verificare:</strong> ${program.requirements.map(escapeHtml).join('; ')}</p>` : ''}<p class="benefit-meta">Scheda verificata il ${program.lastVerifiedAt ? escapeHtml(formatDate(program.lastVerifiedAt, { day: 'numeric', month: 'long', year: 'numeric' })) : 'data non indicata'}</p><a href="${escapeHtml(program.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(program.source.label)} — apri la fonte ufficiale</a></article>`).join('')}</section>`
        : `<div class="empty-state"><span class="empty-icon">${icon('benefits')}</span><h3>Nessuna corrispondenza nel catalogo</h3><p>Non sono state trovate misure nazionali attive che corrispondono ai criteri selezionati. Il catalogo è parziale e non esaustivo.</p></div>`
      : ''}
    ${renderInstallBanner()}`;
}

const MONTH_NAMES = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const WEEKDAY_NAMES = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
function recurrenceFields(prefix) {
  return `<fieldset class="recurrence-fields" id="${prefix}-pattern-fields" hidden><legend>Regola e mesi esclusi</legend>
    <div class="field-row"><label class="field"><span>Quando ripetere</span><select id="${prefix}-rule-kind" disabled><option value="day">Giorno fisso del mese</option><option value="weekday">Giorno della settimana nel mese</option></select></label>
    <label class="field" id="${prefix}-day-field"><span>Giorno del mese (1–31; vuoto = giorno della data iniziale)</span><input id="${prefix}-day" type="number" min="1" max="31" step="1" disabled></label>
    <div class="field-row" id="${prefix}-weekday-fields" hidden><label class="field"><span>Posizione nel mese</span><select id="${prefix}-ordinal" disabled><option value="1">Primo</option><option value="2">Secondo</option><option value="3">Terzo</option><option value="4">Quarto</option><option value="5">Quinto (se presente)</option><option value="-1">Ultimo</option></select></label>
    <label class="field"><span>Giorno della settimana</span><select id="${prefix}-weekday" disabled>${WEEKDAY_NAMES.map((name, day) => `<option value="${day}"${day === 3 ? ' selected' : ''}>${name}</option>`).join('')}</select></label></div></div>
    <fieldset class="excluded-months"><legend>Mesi da saltare (facoltativo)</legend><div class="month-options">${MONTH_NAMES.map((name, i) => `<label><input id="${prefix}-exclude-${i + 1}" type="checkbox" disabled> ${name}</label>`).join('')}</div></fieldset>
    <p class="field-help">Esempio: giorno 20 senza gennaio e dicembre, oppure primo mercoledì. Mai prima della data iniziale. Il giorno 31 si adatta ai mesi corti; i mesi esclusi e i quinti giorni assenti non contano nel totale. La data finale è inclusa. Con «Altra data», la cassa è ancorata al mese iniziale e avanza per mesi anche quando il primo mese viene saltato.</p></fieldset>`;
}
function syncRecurrenceFields(prefix, locked = false) {
  const active = Number(document.querySelector(`#${prefix}-recurrence`).value) > 0 && !locked;
  document.querySelector(`#${prefix}-pattern-fields`).hidden = !active;
  document.querySelector(`#${prefix}-rule-kind`).disabled = !active;
  const weekday = active && document.querySelector(`#${prefix}-rule-kind`).value === 'weekday';
  document.querySelector(`#${prefix}-weekday-fields`).hidden = !weekday;
  document.querySelector(`#${prefix}-day-field`).hidden = weekday;
  document.querySelector(`#${prefix}-day`).disabled = !active || weekday;
  for (const suffix of ['ordinal', 'weekday']) document.querySelector(`#${prefix}-${suffix}`).disabled = !weekday;
  for (let m = 1; m <= 12; m += 1) document.querySelector(`#${prefix}-exclude-${m}`).disabled = !active;
}
function readRecurrence(prefix, dueDate, months) {
  if (!months) return { monthlyRule: null, excludedMonths: [] };
  const kind = document.querySelector(`#${prefix}-rule-kind`).value || 'day';
  return { monthlyRule: kind === 'day' ? { kind, day: Number(document.querySelector(`#${prefix}-day`).value || dueDate.slice(8)) } : { kind, ordinal: Number(document.querySelector(`#${prefix}-ordinal`).value || 1), weekday: Number(document.querySelector(`#${prefix}-weekday`).value || 0) },
    excludedMonths: MONTH_NAMES.flatMap((_, i) => document.querySelector(`#${prefix}-exclude-${i + 1}`).checked ? [i + 1] : []) };
}
function seriesRuleLabel(s) {
  const rule = s.monthlyRule;
  const when = rule?.kind === 'weekday' ? `${({ 1: 'primo', 2: 'secondo', 3: 'terzo', 4: 'quarto', 5: 'quinto', '-1': 'ultimo' })[rule.ordinal]} ${WEEKDAY_NAMES[rule.weekday]}` : `giorno ${rule?.day ?? Number(s.dueDate.slice(8))} (adattato ai mesi corti)`;
  return `${recurrenceLabel(s.recurrenceMonths)}${s.recurrenceMonths ? ` · ${when}` : ''}${s.excludedMonths?.length ? ` · esclusi: ${s.excludedMonths.map(m => MONTH_NAMES[m - 1]).join(', ')}` : ''}${s.endDate ? ` · fino al ${formatDate(s.endDate)}` : ''}${s.count ? ` · ${s.count} occorrenze` : ''}`;
}
function renderSeriesManagement() {
  const groups = [[state.deadlines, false], [state.planner.incomes, true]];
  const cancelled = groups.flatMap(([list, income]) => list.flatMap(s => Object.entries(s.overrides).filter(([, o]) => o.cancelled).map(([key]) => ({ o: getOccurrence(s, key), income }))));
  return `<details class="settings-card series-management"><summary>Gestisci serie e annullate (${cancelled.length})</summary>
    <p>Modifica singola dalle schede. Modifica serie qui: effettivi ed eccezioni già registrate rimangono invariati, anche nei mesi esclusi dalla nuova regola. Nel loro mese non viene creata una seconda rata. L’archiviazione sospende tutta la serie, non cancella lo storico.</p>
    ${groups.map(([list, income]) => `<h3>${income ? 'Serie di entrate' : 'Serie di scadenze'}</h3><ul class="series-list">${list.map(s => `<li><span><strong>${escapeHtml(s.title ?? s.name)}</strong><small>${escapeHtml(seriesRuleLabel(s))}${s.archived ? ' · Archiviata' : ''}</small></span><button class="text-button" type="button" data-action="${income ? 'edit-income-series' : 'edit-series'}" data-id="${escapeHtml(s.id)}">Modifica serie</button></li>`).join('') || '<li>Nessuna serie.</li>'}</ul>`).join('')}
    <h3>Occorrenze annullate · recuperabili</h3><p>Non incidono sulle previsioni e non inviano promemoria. Il ripristino riattiva la stessa identità e le sue eccezioni, senza allungare la serie. Nessun pagamento viene eliminato.</p>
    <ul class="series-list">${cancelled.map(({ o, income }) => `<li><span><strong>${escapeHtml(o.title ?? o.name)}</strong><small>${income ? 'Entrata' : 'Scadenza'} · ${escapeHtml(formatDate(o.dueDate))}</small></span><button class="text-button" type="button" data-action="${income ? 'restore-income-occurrence' : 'restore-occurrence'}" data-id="${escapeHtml(o.id)}">Ripristina singola</button></li>`).join('') || '<li>Nessuna occorrenza annullata.</li>'}</ul></details>`;
}
function toggleOccurrenceCancellation(id, income, cancelled) {
  const o = findOccurrence(id, income);
  if (!o) return;
  if (cancelled && o.completed) { showToast('Occorrenza già completata: non puoi annullarla o nascondere lo storico.', true); return; }
  if (!window.confirm(cancelled ? 'Annullare solo questa occorrenza? Non sarà prevista né notificata. Puoi recuperarla in Planning → Gestisci serie e annullate. Il termine della serie non cambia.' : 'Ripristinare questa occorrenza con le sue eccezioni e la stessa identità?')) return;
  const target = immutable({ income, seriesId: o.seriesId, key: o.key, cancelled });
  return commit(() => {
    const list = target.income ? state.planner.incomes : state.deadlines;
    const index = list.findIndex(s => s.id === target.seriesId);
    list[index] = setOccurrenceCancelled(list[index], target.key, target.cancelled);
  }, cancelled ? 'Singola occorrenza annullata, recuperabile in Planning.' : 'Singola occorrenza ripristinata.');
}
function syncCashField(prefix, actual = false) {
  const date = document.querySelector(prefix === 'movement' ? '#movement-date' : '#deadline-cash-date');
  const visible = actual || document.querySelector(`#${prefix}-cash-mode`).value === 'date';
  document.querySelector(`#${prefix}-cash-field`).hidden = !visible;
  date.hidden = !visible;
  date.disabled = !visible;
  date.required = visible;
}

function syncEndFields(prefix, locked = false) {
  const mode = document.querySelector(`#${prefix}-end-mode`).value;
  for (const [suffix, visible] of [['end', mode === 'date' || mode === 'legacy'], ['count', mode === 'count' || mode === 'legacy']]) {
    const input = document.querySelector(`#${prefix}-${suffix}`);
    document.querySelector(`#${prefix}-${suffix}-field`).hidden = !visible;
    input.disabled = locked || mode === 'legacy' || !visible;
    input.required = !locked && mode !== 'legacy' && visible;
  }
}

function exclusiveTerms(mode, endDate, count) {
  // I chiamanti DOM inviano sempre la scelta; fallback per invii precedenti senza selettore.
  mode ||= endDate ? 'date' : count ? 'count' : 'none';
  return { endDate: mode === 'date' ? endDate || '' : null, count: mode === 'count' ? Number(count) : null };
}

function renderCashMonth(month) {
  const from = month.slice(0, 8) + '01';
  const until = dateToIso(new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0));
  try {
    const report = cashReport(state.planner, state.deadlines, from, until, todayIso());
    return `<section class="settings-card cash-month-report"><h2>Consuntivo registrato · ${escapeHtml(formatDate(from, { month: 'long', year: 'numeric' }))}</h2>
      <div class="cash-day-summary"><div><span>Pagato nel mese</span><strong>${formatAmount(report.expenseActualCents)}</strong></div><div><span>Incassato nel mese</span><strong>${formatAmount(report.incomeActualCents)}</strong></div><div><span>Pagamenti previsti</span><strong>${formatAmount(report.expenseForecastCents)}</strong></div><div><span>Incassi previsti</span><strong>${formatAmount(report.incomeForecastCents)}</strong></div></div>
      <p class="page-description">Effettivi per data di pagamento/incasso, anche prima del saldo e per serie archiviate; mai sommati alla previsione collegata. Previsioni aperte per data di cassa, anche arretrate: non sono movimenti applicati al saldo. Solo dati registrati; nessuna ricostruzione dello storico mancante. ${state.planner.ready ? 'Il saldo usa solo i movimenti non già assorbiti.' : 'Saldi non disponibili: imposta un saldo di riferimento valido in Planning.'} Per altri mesi usa Agenda → Calendario → Flussi di cassa.</p>
      ${report.unplacedLegacy || report.missingAmount || report.unknownDate ? `<p class="notice">Dati parziali: ${report.unplacedLegacy} completamenti storici senza data/importo non attribuibili a un mese; ${report.unknownDate} previsioni senza data non attribuibili; ${report.missingAmount} importi mancanti nel periodo. Non ricostruiti né trattati come pagamenti a zero.</p>` : ''}</section>`;
  } catch (error) { return `<p class="notice error">Consuntivo non disponibile: ${escapeHtml(error.message)}</p>`; }
}

function openDeadlineForm(deadline = null, defaults = {}, seriesEdit = false, income = false) {
  dialogSessions.deadline += 1;
  editingSeries = seriesEdit ? { id: deadline.id, income } : null;
  editingOccurrence = seriesEdit ? null : deadline;
  const single = Boolean(editingOccurrence);
  deadlineForm.reset();
  for (const selector of ['#deadline-recurrence', '#deadline-end-mode', '#deadline-end', '#deadline-count']) document.querySelector(selector).disabled = single;
  document.querySelector('#occurrence-edit-note').hidden = !single;
  document.querySelector('#series-edit-note').hidden = !seriesEdit;
  for (const id of ['deadline-category-field', 'deadline-notes-field', 'deadline-reminder-fields']) document.querySelector(`#${id}`).hidden = income;
  document.querySelector('#deadline-date-label').textContent = single ? 'Data di scadenza (solo questa)' : 'Data iniziale (mai prima di)';
  document.querySelector('#deadline-rule-fields').innerHTML = recurrenceFields('deadline');
  document.querySelector('#series-end-fields').hidden = single;
  document.querySelector('#deadline-cash-mode').value = deadline?.cashMode ?? 'unknown';
  document.querySelector('#deadline-cash-date').value = deadline?.cashDate ?? '';
  document.querySelector('#deadline-cash-date').dataset.draftChosen = String(deadline?.cashMode === 'date');
  syncCashField('deadline');
  document.querySelector('#deadline-end').value = deadline?.endDate ?? '';
  document.querySelector('#deadline-count').value = deadline?.count ?? '';
  document.querySelector('#deadline-end-mode').value = deadline?.endDate && deadline?.count ? 'legacy' : deadline?.endDate ? 'date' : deadline?.count ? 'count' : 'none';
  document.querySelector('#legacy-end-note').hidden = !(deadline?.endDate && deadline?.count);
  syncEndFields('deadline', single);
  document.querySelector('#deadline-error').classList.remove('visible');
  document.querySelector('#deadline-error').textContent = '';
  document.querySelector('#deadline-id').value = deadline?.id ?? '';
  document.querySelector('#deadline-catalog-id').value = deadline?.catalogItemId ?? defaults.catalogItemId ?? '';
  document.querySelector('#deadline-title').maxLength = income ? 60 : 100;
  document.querySelector('#deadline-title').value = (income ? deadline?.name : deadline?.title) ?? defaults.title ?? '';
  document.querySelector('#deadline-category').value = deadline?.category ?? defaults.category ?? 'altro';
  document.querySelector('#deadline-date').value = deadline?.dueDate ?? defaults.dueDate ?? dateToIso(addDays(dateOnly(new Date()), 7));
  document.querySelector('#deadline-recurrence').value = String(deadline?.recurrenceMonths ?? defaults.recurrenceMonths ?? 0);
  document.querySelector('#deadline-rule-kind').value = deadline?.monthlyRule?.kind ?? 'day';
  document.querySelector('#deadline-day').value = String(deadline?.monthlyRule?.day ?? '');
  document.querySelector('#deadline-ordinal').value = String(deadline?.monthlyRule?.ordinal ?? 1);
  document.querySelector('#deadline-weekday').value = String(deadline?.monthlyRule?.weekday ?? 3);
  for (let m = 1; m <= 12; m += 1) document.querySelector(`#deadline-exclude-${m}`).checked = (deadline?.excludedMonths ?? []).includes(m);
  syncRecurrenceFields('deadline', single);
  document.querySelector('#deadline-amount').value = deadline?.amountCents
    ? formatCentsForInput(deadline.amountCents)
    : '';
  document.querySelector('#deadline-notes').value = deadline?.notes ?? defaults.notes ?? '';
  const reminderDays = deadline?.reminderDays ?? defaults.reminderDays ?? [7, 1];
  deadlineForm.querySelectorAll('input[name="reminder"]').forEach((input) => {
    input.checked = reminderDays.includes(Number(input.value));
  });
  document.querySelector('#deadline-dialog-title').textContent = seriesEdit ? income ? 'Modifica serie di entrate' : 'Modifica intera serie' : deadline ? 'Modifica singola occorrenza' : 'Nuova scadenza';
  deadlineDialog.showModal();
  document.querySelector('#deadline-title').focus();
}

function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return dateOnly(result);
}

function formatCentsForInput(cents) {
  const euros = Math.floor(Math.abs(cents) / 100);
  const remainder = String(Math.abs(cents) % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${euros},${remainder}`;
}

function parseSignedCents(value) {
  const text = value.trim();
  const cents = parseAmountCents(text.startsWith('-') ? text.slice(1) : text);
  return cents === null ? null : text.startsWith('-') ? -cents : cents;
}

function parseAmountCents(input) {
  const value = input.trim().replace(/[€\s]/g, '');
  if (!value) return 0;
  const commaParts = value.split(',');
  if (commaParts.length > 2) return null;
  const wholePart = commaParts[0];
  const fraction = commaParts.length === 2 ? commaParts[1] : '';
  const dotGroups = wholePart.split('.');
  let wholeDigits = wholePart;
  if (dotGroups.length > 1) {
    const validThousands = /^\d{1,3}$/.test(dotGroups[0])
      && dotGroups.slice(1).every((part) => /^\d{3}$/.test(part));
    const validDecimal = commaParts.length === 1
      && dotGroups.length === 2
      && /^\d+$/.test(dotGroups[0])
      && /^\d{1,2}$/.test(dotGroups[1]);
    if (validDecimal) {
      const cents = Number(dotGroups[0]) * 100 + Number(dotGroups[1].padEnd(2, '0'));
      return Number.isSafeInteger(cents) ? cents : null;
    }
    if (!validThousands) return null;
    wholeDigits = dotGroups.join('');
  }
  if (!/^\d+$/.test(wholeDigits)) return null;
  if (fraction && !/^\d{1,2}$/.test(fraction)) return null;
  if (commaParts.length === 2 && !fraction) return null;
  const cents = Number(wholeDigits) * 100 + Number(fraction.padEnd(2, '0') || 0);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

function handleDeadlineSubmit(event) {
  event.preventDefault();
  const amountInput = document.querySelector('#deadline-amount').value;
  const amountCents = parseAmountCents(amountInput);
  const dueDate = document.querySelector('#deadline-date').value;
  const title = document.querySelector('#deadline-title').value.trim();
  const errorElement = document.querySelector('#deadline-error');
  let error = '';

  if (!title) error = 'Inserisci un titolo.';
  else if (!parseIsoDate(dueDate)) error = 'Seleziona una data di scadenza valida.';
  else if (amountCents === null) error = 'Importo non valido. Usa ad esempio 125,50 oppure 1.234,50.';
  if (error) {
    errorElement.textContent = error;
    errorElement.classList.add('visible');
    return;
  }

  const cashMode = document.querySelector('#deadline-cash-mode').value;
  const cashDate = cashMode === 'date' ? document.querySelector('#deadline-cash-date').value || null : null;
  if (cashMode === 'date' && !parseIsoDate(cashDate)) {
    errorElement.textContent = 'Indica la data di cassa prevista.';
    errorElement.classList.add('visible');
    return;
  }
  const details = immutable({ dueDate, cashMode, cashDate, amountCents, title,
    category: document.querySelector('#deadline-category').value,
    notes: document.querySelector('#deadline-notes').value.trim(),
    reminderDays: [...deadlineForm.querySelectorAll('input[name="reminder"]:checked')].map(input => Number(input.value)) });
  if (editingOccurrence) {
    const target = immutable({ seriesId: editingOccurrence.seriesId, key: editingOccurrence.key });
    const session = beginFormSave('deadline'); if (!session) return;
    const saved = commit(() => {
      const series = state.deadlines.find(s => s.id === target.seriesId);
      if (!series) throw new Error('La serie da modificare non è più disponibile.');
      series.overrides[target.key] = { ...series.overrides[target.key], ...mutableCopy(details) };
      if (details.amountCents > 0) series.overrides[target.key].done = false;
    }, 'Singola occorrenza aggiornata. Le successive mantengono l’ancora originale.');
    return finishFormSave(session, saved, () => deadlineDialog.close());
  }
  if (editingSeries) {
    const target = immutable(editingSeries);
    const old = (target.income ? state.planner.incomes : state.deadlines).find(s => s.id === target.id);
    const months = Number(document.querySelector('#deadline-recurrence').value);
    const mode = document.querySelector('#deadline-end-mode').value;
    const terms = mode === 'legacy' ? { endDate: old.endDate, count: old.count } : exclusiveTerms(mode, document.querySelector('#deadline-end').value, document.querySelector('#deadline-count').value);
    const changes = { dueDate, amountCents, cashMode, cashDate, recurrenceMonths: months, ...terms,
      ...readRecurrence('deadline', dueDate, months), updatedAt: localDateTime() };
    if (target.income) changes.name = title;
    else Object.assign(changes, { title, category: details.category, notes: details.notes, reminderDays: details.reminderDays });
    const payload = immutable(changes);
    const session = beginFormSave('deadline'); if (!session) return;
    const saved = commit(() => {
      const list = target.income ? state.planner.incomes : state.deadlines;
      const index = list.findIndex(s => s.id === target.id);
      if (index < 0) throw new Error('La serie da modificare non è più disponibile.');
      if (target.income && (payload.amountCents <= 0 || payload.name.length > 60)) throw new Error('Le entrate richiedono un importo positivo e una descrizione entro 60 caratteri.');
      list[index] = updateSeries(list[index], mutableCopy(payload));
    }, 'Serie aggiornata. Effettivi, eccezioni e mesi protetti conservati.');
    return finishFormSave(session, saved, () => deadlineDialog.close(), () => {
      if (!storageBlocked) errorElement.textContent = 'Serie non salvata. Controlla regola, termine e spazio del browser. I dati precedenti sono conservati.';
      errorElement.classList.add('visible');
    });
  }
  const now = localDateTime();
  const reminderDays = [...deadlineForm.querySelectorAll('input[name="reminder"]:checked')]
    .map((input) => Number(input.value))
    .sort((a, b) => b - a);
  const deadline = {
    id: makeId(),
    title,
    category: document.querySelector('#deadline-category').value,
    dueDate,
    recurrenceMonths: Number(document.querySelector('#deadline-recurrence').value),
    ...readRecurrence('deadline', dueDate, Number(document.querySelector('#deadline-recurrence').value)),
    cashMode,
    cashDate,
    ...exclusiveTerms(document.querySelector('#deadline-end-mode').value, document.querySelector('#deadline-end').value, document.querySelector('#deadline-count').value),
    overrides: {},
    amountCents,
    notes: document.querySelector('#deadline-notes').value.trim(),
    reminderDays,
    completed: false,
    archived: false,
    catalogItemId: document.querySelector('#deadline-catalog-id').value || null,
    createdAt: now,
    updatedAt: now,
  };
  try { validateDeadline(deadline); } catch (error) {
    errorElement.textContent = error.message;
    errorElement.classList.add('visible');
    return;
  }
  const payload = immutable(deadline);
  const session = beginFormSave('deadline'); if (!session) return;
  const saved = commit(() => {
    state.deadlines.push(mutableCopy(payload));
  }, 'Scadenza salvata.');
  return finishFormSave(session, saved, () => deadlineDialog.close());
}

function renderFatalError(error) {
  app.innerHTML = `<main class="onboarding"><section class="onboarding-hero"><div class="brand"><span class="brand-mark">S</span><span>Scadenzario</span></div><div class="hero-copy"><h1>Non riesco ad aprire i dati.</h1><p>${escapeHtml(error.message)}</p></div><p class="hero-foot">I dati originali non sono stati modificati.</p></section><section class="onboarding-form-side"><div class="onboarding-card"><h2>Ripristina da backup</h2><p>Se il formato dei dati salvati è danneggiato, non verrà cancellato automaticamente. Seleziona un backup precedente per ripristinarlo.</p><button class="button button-primary" type="button" data-action="choose-backup">Scegli backup JSON</button></div></section></main>`;
}

function completeDeadline(id) {
  const o = findOccurrence(id);
  if (!o || o.cancelled) return;
  if (o.amountCents || o.actual || o.legacyCompleted) { openMovement(id); return; }
  if (!window.confirm('Completare soltanto il promemoria, senza registrare un pagamento? Se esiste una spesa, annulla e usa il pulsante «Registra pagamento» oppure inserisci prima l’importo.')) return;
  const target = immutable({ seriesId: o.seriesId, key: o.key });
  return commit(() => {
    const s = state.deadlines.find(s => s.id === target.seriesId);
    s.overrides[target.key] = { ...s.overrides[target.key], done: true };
  }, 'Promemoria completato senza movimento di cassa.');
}
function reopenDeadline(id) { undoActual(id); }
function openMovement(id, income = false, forecast = false) {
  dialogSessions.movement += 1;
  const o = findOccurrence(id, income);
  if (!o || o.cancelled) return;
  const form = document.querySelector('#movement-form');
  form.dataset.id = id;
  form.dataset.income = String(income);
  form.dataset.forecast = String(forecast);
  form.reset();
  document.querySelector('#movement-title').textContent = forecast ? 'Modifica singola previsione' : income ? 'Incasso effettivo totale' : 'Pagamento effettivo totale';
  document.querySelector('#movement-description').textContent = `${o.title ?? o.name} · Occorrenza ${formatDate(o.key)}. ${forecast ? 'Le successive restano invariate.' : 'Sostituisce la previsione collegata, non crea un secondo movimento. Correggi qui data e importo; annulla dall’elenco per riaprire.'}`;
  if (o.endDate && o.count) document.querySelector('#movement-description').textContent += ' Modalità legacy: entrambi i termini restano invariati; vale la regola precedente più restrittiva.';
  document.querySelector('#movement-date-label').textContent = forecast ? expectedDateLabel(income, o.amountCents) : 'Data effettiva (obbligatoria, non futura)';
  const date = document.querySelector('#movement-date');
  document.querySelector('#movement-cash-mode').value = o.cashMode;
  document.querySelector('#movement-cash-mode-field').hidden = !forecast;
  date.value = forecast ? o.cashMode === 'date' ? o.cashDate ?? '' : '' : o.actual?.date ?? '';
  syncCashField('movement', !forecast);
  if (forecast) date.removeAttribute('max'); else date.max = todayIso();
  document.querySelector('#movement-amount').value = formatCentsForInput(o.actual?.amountCents ?? o.amountCents);
  document.querySelector('#movement-error').classList.remove('visible');
  document.querySelector('#movement-dialog').showModal();
  document.querySelector('#movement-amount').focus();
}
function handleMovementSubmit(event) {
  event.preventDefault();
  const { id, income, forecast } = event.target.dataset;
  const isIncome = income === 'true';
  const o = findOccurrence(id, isIncome);
  const cashMode = forecast === 'true' ? document.querySelector('#movement-cash-mode').value : 'date';
  const date = cashMode === 'date' ? document.querySelector('#movement-date').value : null;
  const amountCents = parseAmountCents(document.querySelector('#movement-amount').value);
  const error = document.querySelector('#movement-error');
  if (!o || o.cancelled || !['same', 'date', 'unknown'].includes(cashMode) || cashMode === 'date' && !parseIsoDate(date) || forecast !== 'true' && date > todayIso() || amountCents === null || amountCents <= 0) {
    error.textContent = 'Inserisci una data valida (non futura per un effettivo) e un importo totale positivo.';
    error.classList.add('visible');
    return;
  }
  const target = immutable({ income: isIncome, seriesId: o.seriesId, key: o.key, forecast: forecast === 'true' });
  const payload = immutable({ cashMode, date, amountCents });
  const session = beginFormSave('movement'); if (!session) return;
  const saved = commit(() => {
    const list = target.income ? state.planner.incomes : state.deadlines;
    const index = list.findIndex(s => s.id === target.seriesId);
    if (index < 0) throw new Error('L’occorrenza da modificare non è più disponibile.');
    if (target.forecast) list[index].overrides[target.key] = { ...list[index].overrides[target.key], cashMode: payload.cashMode, cashDate: payload.date, amountCents: payload.amountCents };
    else list[index] = setOccurrenceActual(list[index], target.key, { date: payload.date, amountCents: payload.amountCents }, todayIso());
  }, target.forecast ? 'Previsione aggiornata.' : 'Effettivo salvato. Verifica la riconciliazione con il saldo di riferimento.');
  return finishFormSave(session, saved, () => document.querySelector('#movement-dialog').close());
}
function undoActual(id, income = false) {
  const o = findOccurrence(id, income);
  if (!o || !window.confirm('Annullare l’effettivo e riaprire questa occorrenza? La previsione torna attiva; verifica anche il saldo di riferimento.')) return;
  const target = immutable({ income, seriesId: o.seriesId, key: o.key });
  return commit(() => {
    const list = target.income ? state.planner.incomes : state.deadlines;
    const index = list.findIndex(s => s.id === target.seriesId);
    list[index] = setOccurrenceActual(list[index], target.key, null, todayIso());
  }, 'Effettivo annullato, occorrenza riaperta.');
}
function archiveDeadline(id) {
  const o = findOccurrence(id);
  if (!o || !window.confirm(`Archiviare l’intera serie “${o.title}”? Gli effettivi restano nel calcolo e nello storico.`)) return;
  const seriesId = o.seriesId;
  return commit(() => {
    state.deadlines.find(s => s.id === seriesId).archived = true;
  }, 'Serie archiviata, storico conservato.');
}

function openCatalogItem(id) {
  const item = catalog.find((entry) => entry.id === id);
  if (!item) {
    showToast('Suggerimento non trovato nel catalogo.', true);
    return;
  }
  openDeadlineForm(null, {
    title: item.titolo,
    category: item.categoria,
    dueDate: dateToIso(addDays(dateOnly(new Date()), item.giorni_suggeriti)),
    recurrenceMonths: item.mesi,
    reminderDays: item.promemoria,
    notes: item.nota,
    catalogItemId: item.id,
  });
}

function editProfile() {
  dialogSessions.profile += 1;
  document.querySelector('#profile-error').textContent = '';
  document.querySelector('#profile-error').classList.remove('visible');
  document.querySelector('#profile-name').value = state.profile.name;
  document.querySelector('#profile-type').value = state.profile.type;
  profileDialog.showModal();
}

function exportBackup() {
  const backup = {
    app: 'Scadenzario',
    schemaVersion: SCHEMA_VERSION,
    planner: state.planner,
    migrationNotice: state.migrationNotice,
    exportedAt: localDateTime(),
    profile: state.profile,
    deadlines: state.deadlines,
    notificationsEnabled: state.notificationsEnabled,
    notifiedKeys: state.notifiedKeys,
  };
  const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `scadenzario-backup-${dateToIso(dateOnly(new Date()))}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Backup JSON esportato.');
}

function validateBackup(backup) {
  if (backup?.conflictDraft === true) throw new Error('Questa è una copia di conflitto: confrontala con il backup aggiornato. Non può sostituire automaticamente l’archivio.');
  if (!backup || backup.app !== 'Scadenzario' || ![1, 2, SCHEMA_VERSION].includes(backup.schemaVersion)) {
    throw new Error('Il file non è un backup Scadenzario supportato.');
  }
  if (!isValidProfile(backup.profile)) throw new Error('Il profilo nel backup non è valido.');
  if (!Array.isArray(backup.deadlines)) throw new Error('Il backup non contiene un elenco valido di scadenze.');
  validatePlanner(backup.planner, todayIso());
  const ids = new Set();
  backup.deadlines.forEach((deadline) => {
    validateDeadline(deadline);
    if (ids.has(deadline.id)) throw new Error(`Identificativo duplicato nel backup: ${deadline.id}`);
    ids.add(deadline.id);
  });
}

async function restoreBackup(file) {
  const session = ++importSession, expected = storageBaseline;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Backup oltre il limite di 5 MB.');
    const text = await file.text();
    if (session !== importSession) return;
    if (storageBaseline !== expected) throw new Error('I dati sono cambiati durante la lettura del backup. Riapri il file e verifica i dati aggiornati.');
    const parsed = JSON.parse(text);
    if (parsed.app !== 'Scadenzario') throw new Error('Non è un backup Scadenzario.');
    const backup = migrate(parsed, todayIso());
    validateBackup(backup);
    const ui = presentation();
    if (!window.confirm(`Il backup contiene ${backup.deadlines.length} scadenze. Sostituire tutti i dati attualmente presenti nel browser? Le bozze aperte saranno chiuse: esportale prima se servono.`)) return;
    const payload = immutable({ profile: backup.profile, deadlines: backup.deadlines, planner: backup.planner,
      migrationNotice: backup.migrationNotice || '', notificationsEnabled: backup.notificationsEnabled === true,
      notifiedKeys: Array.isArray(backup.notifiedKeys) ? backup.notifiedKeys.filter(key => typeof key === 'string').slice(-500) : [] });
    await commit(() => { Object.assign(state, mutableCopy(payload)); }, 'Backup ripristinato.', true, true, {
      guard: () => session === importSession && storageBaseline === expected && samePresentation(ui),
      refusal: 'Importazione superata da un’altra operazione o da una nuova bozza: nessun dato è stato sostituito. Riapri il backup se vuoi riprovare.',
      replaceArchive: true, navigate: 'home',
    });
  } catch (error) {
    if (session === importSession) showToast(`Backup non importato: ${error.message}`, true);
  } finally {
    if (session === importSession) backupFileInput.value = '';
  }
}

async function enableNotifications() {
  const session = ++notificationRequest, requestedArchive = archiveEpoch;
  if (!('Notification' in window) || !window.isSecureContext) {
    showToast('Notifiche non disponibili qui. Usa localhost o HTTPS.', true);
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (session !== notificationRequest || archiveEpoch !== requestedArchive) return;
    const enabled = permission === 'granted';
    await commit(() => { state.notificationsEnabled = enabled; }, enabled ? 'Promemoria browser attivati.' : null, true, true, { guard: () => session === notificationRequest && archiveEpoch === requestedArchive });
    if (!enabled && session === notificationRequest) showToast(permission === 'denied' ? 'Permesso negato. Puoi cambiarlo nelle impostazioni del browser.' : 'Permesso notifiche non concesso.', permission === 'denied');
  } catch (error) { if (session === notificationRequest) showToast(`Impossibile attivare i promemoria: ${error.message}`, true); }
}
function disableNotifications() {
  const session = ++notificationRequest;
  return commit(() => { state.notificationsEnabled = false; }, 'Promemoria browser disattivati.', true, true, { guard: () => session === notificationRequest });
}

function checkReminders() {
  if (!state.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  return commit(() => {
    if (!state.notificationsEnabled) return;
    const today = todayIso(), nextKeys = [];
    for (const deadline of viewOccurrences(shiftMonth(today, 2), today)) {
      if (deadline.archived || deadline.completed || deadline.cancelled) continue;
      const daysRemaining = dayDifference(deadline.dueDate);
      if (!deadline.reminderDays.includes(daysRemaining)) continue;
      const key = `${deadline.id}:${deadline.dueDate}:${daysRemaining}`;
      if (state.notifiedKeys.includes(key)) continue;
      try {
        const notification = new Notification(`Scadenzario · ${deadline.title}`, { body: daysRemaining === 0 ? 'La scadenza è oggi.' : `La scadenza è tra ${daysRemaining} ${daysRemaining === 1 ? 'giorno' : 'giorni'}.`, icon: './icons/icon.svg', tag: key });
        notification.onclick = () => { window.focus(); notification.close(); };
        nextKeys.push(key);
      } catch (error) { console.error('Notifica browser non inviata:', error); }
    }
    if (nextKeys.length) state.notifiedKeys = [...state.notifiedKeys, ...nextKeys].slice(-500);
  }, null, false, false);
}
function showUpdateReady(registration = updateRegistration) {
  updateRegistration = registration;
  updateNotice.hidden = false;
  updateNotice.innerHTML = '<strong>Aggiornamento completo pronto.</strong><p>Prima salva o esporta le modifiche aperte. Ricaricare sostituisce la schermata, non i dati.</p><button class="text-button" type="button" data-action="apply-shell-update">Ricarica versione aggiornata</button>';
}
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadApproved) window.location.reload(); else showUpdateReady();
  });
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'SCADENZARIO_SHELL_READY' && event.data.shell !== CLIENT_SHELL) showUpdateReady();
  });
  navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).then(registration => {
    updateRegistration = registration;
    if (registration.waiting) showUpdateReady(registration);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateReady(registration); });
    });
  }).catch(error => {
    console.error('Registrazione del service worker non riuscita:', error);
    serviceWorkerError = error.message;
    showToast('Aggiornamento offline non pronto. La schermata corrente resta disponibile; nessun dato è stato sostituito.', true);
  });
}

function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;

  switch (action) {
    case 'export-conflict':
      exportConflictDraft();
      break;
    case 'reload-storage':
      if (window.confirm('Ricaricare i dati più recenti? Le modifiche non salvate nei campi andranno perse: esporta prima una copia locale se serve.')) window.location.reload();
      break;
    case 'apply-shell-update':
      if (window.confirm('Hai salvato o esportato le modifiche aperte? Ricaricare chiude i moduli non salvati.')) {
        reloadApproved = true;
        if (updateRegistration?.waiting) updateRegistration.waiting.postMessage({ type: 'ACTIVATE_SHELL' });
        else window.location.reload();
      }
      break;
    case 'navigate':
      currentView = button.dataset.view;
      render();
      document.querySelector('#main-content')?.focus();
      break;
    case 'configure-plan':
    case 'planning-results':
      currentView = 'planning';
      render();
      document.querySelector(action === 'configure-plan' ? '#planner-form input[name="openingBalance"]' : '#planning-results')?.focus();
      break;
    case 'agenda-period':
      agendaPeriod = button.dataset.period;
      render();
      document.querySelector(`[data-action="agenda-period"][data-period="${agendaPeriod}"]`)?.focus();
      showToast('Filtro Agenda aggiornato.');
      break;
    case 'calendar-mode':
      calendarMode = button.dataset.mode === 'cash' ? 'cash' : 'deadlines';
      calendarOpen = true;
      render();
      document.querySelector(`[data-action="calendar-mode"][data-mode="${calendarMode}"]`)?.focus();
      break;
    case 'new-deadline':
      openDeadlineForm(null, button.dataset.date ? { dueDate: button.dataset.date } : {});
      break;
    case 'edit-deadline': {
      const deadline = findOccurrence(id);
      if (deadline) openDeadlineForm(deadline);
      break;
    }
    case 'edit-series':
    case 'edit-income-series': {
      const income = action === 'edit-income-series';
      const series = (income ? state.planner.incomes : state.deadlines).find(s => s.id === id);
      if (series) openDeadlineForm(series, {}, true, income);
      break;
    }
    case 'cancel-occurrence':
    case 'cancel-income-occurrence':
    case 'restore-occurrence':
    case 'restore-income-occurrence':
      toggleOccurrenceCancellation(id, action.includes('income'), action.startsWith('cancel-'));
      break;
    case 'record-deadline':
      openMovement(id);
      break;
    case 'complete-deadline':
      completeDeadline(id);
      break;
    case 'reopen-deadline':
      reopenDeadline(id);
      break;
    case 'archive-deadline':
      archiveDeadline(id);
      break;
    case 'open-profile-dialog':
      editProfile();
      break;
    case 'select-home-date':
      selectedHomeDate = button.dataset.date;
      render();
      break;
    case 'select-calendar-date':
      selectedCalendarDate = button.dataset.date;
      agendaPeriod = 'day';
      calendarOpen = true;
      render();
      document.querySelector(`[data-action="select-calendar-date"][data-date="${selectedCalendarDate}"]`)?.focus();
      showToast(`Giorno selezionato: ${formatDate(selectedCalendarDate)}.`);
      break;
    case 'calendar-month':
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + Number(button.dataset.offset), 1);
      selectedCalendarDate = dateToIso(calendarMonth);
      agendaPeriod = 'day';
      calendarOpen = true;
      render();
      document.querySelector(`[data-action="calendar-month"][data-offset="${Number(button.dataset.offset)}"]`)?.focus();
      break;
    case 'use-catalog-item':
      openCatalogItem(id);
      break;
    case 'export-backup':
      exportBackup();
      break;
    case 'choose-backup':
      backupFileInput.click();
      break;
    case 'reload-catalog':
      loadCatalog();
      break;
    case 'reload-staging':
      loadStaging();
      break;
    case 'approve-staging':
      resolveStagingEntry(button.dataset.sourceId, 'approve');
      break;
    case 'discard-staging':
      resolveStagingEntry(button.dataset.sourceId, 'discard');
      break;
    case 'restore-deadline':
      commit(() => { state.deadlines.find(s => s.id === id).archived = false; }, 'Serie riattivata.');
      break;
    case 'actual-income':
      openMovement(id, true);
      break;
    case 'undo-income':
      undoActual(id, true);
      break;
    case 'edit-income':
      openMovement(id, true, true);
      break;
    case 'restore-income':
      commit(() => { state.planner.incomes.find(s => s.id === id).archived = false; }, 'Entrata riattivata.');
      break;
    case 'remove-income':
      if (window.confirm('Archiviare questa serie di entrate? Gli incassi già registrati restano nel calcolo e nel backup.')) commit(() => {
        state.planner.incomes.find(income => income.id === id).archived = true;
      }, 'Serie archiviata, storico conservato.');
      break;
    case 'install-app':
      installApp();
      break;
    default:
      break;
  }
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  render();
}

function handleChange(event) {
  if (event.target.id === 'deadline-cash-mode') {
    const date = document.querySelector('#deadline-cash-date');
    if (event.target.value === 'date' && date.dataset.draftChosen !== 'true') {
      date.value = '';
      date.dataset.draftChosen = 'true';
    }
    syncCashField('deadline');
  }
  if (event.target.id === 'movement-cash-mode') syncCashField('movement', document.querySelector('#movement-form').dataset.forecast !== 'true');
  if (event.target.id === 'deadline-end-mode') syncEndFields('deadline', Boolean(editingOccurrence));
  if (event.target.id === 'income-end-mode') syncEndFields('income');
  for (const prefix of ['deadline', 'income']) {
    if ([`${prefix}-recurrence`, `${prefix}-rule-kind`].includes(event.target.id)) syncRecurrenceFields(prefix, prefix === 'deadline' && Boolean(editingOccurrence));
  }
  if (event.target.matches('[data-filter]')) {
    filters[event.target.dataset.filter] = event.target.value;
    render();
    document.querySelector(`[data-filter="${event.target.dataset.filter}"]`)?.focus();
    showToast('Filtri Agenda aggiornati.');
  }
  if (event.target.id === 'notification-switch') {
    if (event.target.checked) enableNotifications();
    else disableNotifications();
  }
}

function handleSubmit(event) {
  if (event.target.id === 'onboarding-form') {
    event.preventDefault();
    const formData = new FormData(event.target);
    const name = String(formData.get('name') ?? '').trim();
    const type = String(formData.get('type') ?? '');
    if (!name || !Object.hasOwn(PROFILE_LABELS, type) || !formData.has('acknowledge')) return;
    const payload = immutable({ name, type, createdAt: localDateTime() });
    const session = beginFormSave('onboarding'); if (!session) return;
    return finishFormSave(session, commit(() => { state.profile = mutableCopy(payload); }, 'Profilo creato. Ora puoi aggiungere la prima scadenza.', true, true, { navigate: 'home' }));
  }
  if (event.target.id === 'deadline-form') return handleDeadlineSubmit(event);
  if (event.target.id === 'movement-form') return handleMovementSubmit(event);
  if (event.target.id === 'planner-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    const openingBalanceCents = parseSignedCents(String(data.get('openingBalance') ?? ''));
    const reserveCents = parseAmountCents(String(data.get('reserve') ?? ''));
    const balanceDate = String(data.get('balanceDate'));
    const sameDay = String(data.get('sameDay'));
    if (openingBalanceCents === null || reserveCents === null || !parseIsoDate(balanceDate) || balanceDate > todayIso() || !['included', 'excluded'].includes(sameDay)) {
      showToast('Controlla importi, data non futura e inclusione degli effettivi del giorno.', true);
      return;
    }
    if (state.planner.ready && !window.confirm('Nuovo saldo: riconcilia tutti gli effettivi. Quelli precedenti alla data saranno assorbiti, quelli successivi applicati; per lo stesso giorno vale la scelta esplicita. Confermi di aver verificato per evitare omissioni o doppi conteggi?')) return;
    const payload = immutable({ openingBalanceCents, reserveCents, balanceDate, sameDayActualsIncluded: sameDay === 'included', ready: true });
    const session = beginFormSave('planner'); if (!session) return;
    return finishFormSave(session, commit(() => { Object.assign(state.planner, mutableCopy(payload)); }, 'Saldo e riserva salvati.'));
  }
  if (event.target.id === 'income-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get('name') ?? '').trim();
    const amountCents = parseAmountCents(String(data.get('amount') ?? ''));
    if (!name || name.length > 60 || amountCents === null || amountCents <= 0) {
      showToast('Controlla descrizione e importo positivo.', true);
      return;
    }
    const income = { id: makeId(), name, amountCents, dueDate: String(data.get('date')), cashMode: 'same', cashDate: null,
      recurrenceMonths: Number(data.get('months')), ...readRecurrence('income', String(data.get('date')), Number(data.get('months'))), ...exclusiveTerms(data.get('endMode'), data.get('endDate'), data.get('count')), overrides: {}, archived: false };
    const payload = immutable(income);
    const session = beginFormSave('income'); if (!session) return;
    return finishFormSave(session, commit(() => { const entry = mutableCopy(payload); validateSeries(entry); state.planner.incomes.push(entry); }, 'Entrata prevista salvata (non ancora incassata).'));
  }
  if (event.target.id === 'profile-form') {
    event.preventDefault();
    const name = document.querySelector('#profile-name').value.trim();
    const type = document.querySelector('#profile-type').value;
    if (!name || !Object.hasOwn(PROFILE_LABELS, type)) return;
    const payload = immutable({ name, type });
    const session = beginFormSave('profile'); if (!session) return;
    const saved = commit(() => { state.profile = { ...state.profile, ...mutableCopy(payload) }; }, 'Profilo aggiornato.');
    return finishFormSave(session, saved, () => profileDialog.close());
  }
}

async function loadCatalog() {
  try {
    const response = await fetch(CATALOG_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`risposta HTTP ${response.status}`);
    const loadedCatalog = await response.json();
    if (!Array.isArray(loadedCatalog)) throw new Error('il file deve contenere un elenco JSON');
    const seenIds = new Set();
    for (const item of loadedCatalog) {
      if (!item || typeof item.id !== 'string' || seenIds.has(item.id)
        || typeof item.titolo !== 'string' || !Object.hasOwn(CATEGORY_LABELS, item.categoria)
        || !Number.isInteger(item.mesi) || !Array.isArray(item.profili)
        || !Array.isArray(item.promemoria) || !Number.isInteger(item.giorni_suggeriti)) {
        throw new Error('una o più voci non rispettano lo schema del catalogo');
      }
      seenIds.add(item.id);
    }
    catalog = loadedCatalog;
    catalogError = null;
  } catch (error) {
    catalogError = error.message;
    console.error('Caricamento catalogo non riuscito:', error);
  }
  render();
}

async function loadBonusCatalog() {
  try {
    let response;
    try {
      response = await fetch(BONUS_API_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`risposta HTTP ${response.status}`);
      bonusCatalogMode = 'backend';
    } catch (error) {
      response = await fetch(BONUS_CATALOG_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`API backend non disponibile (${error.message}) e catalogo locale non raggiungibile (HTTP ${response.status})`);
      bonusCatalogMode = 'local';
      sourceMonitoring = null;
      sourceMonitoringError = error.message;
      console.warn('Backend agevolazioni non disponibile; uso il catalogo statico:', error);
    }
    const loadedCatalog = await response.json();
    if (!loadedCatalog || loadedCatalog.schemaVersion !== 1
      || !Array.isArray(loadedCatalog.programs)
      || (loadedCatalog.updatedAt !== null && !parseIsoDate(loadedCatalog.updatedAt))) {
      throw new Error('il file non rispetta lo schema del catalogo agevolazioni');
    }
    const seenIds = new Set();
    for (const program of loadedCatalog.programs) {
      const sourceUrl = program?.source?.url;
      let isHttpsSource = false;
      try {
        isHttpsSource = new URL(sourceUrl).protocol === 'https:';
      } catch {
        isHttpsSource = false;
      }
      if (!program || typeof program.id !== 'string' || seenIds.has(program.id)
        || typeof program.title !== 'string' || !program.title.trim()
        || typeof program.description !== 'string'
        || !['nazionale', 'regionale', 'comunale'].includes(program.scope)
        || (program.scope !== 'nazionale' && !ITALIAN_REGIONS.includes(program.region))
        || (program.scope === 'comunale' && (typeof program.municipality !== 'string' || !program.municipality.trim()))
        || (program.iseeMaxCents !== null && (!Number.isSafeInteger(program.iseeMaxCents) || program.iseeMaxCents < 0))
        || !Array.isArray(program.requirements)
        || program.requirements.some((requirement) => typeof requirement !== 'string')
        || typeof program.source?.label !== 'string' || !isHttpsSource
        || (program.lastVerifiedAt !== null && !parseIsoDate(program.lastVerifiedAt))
        || (program.startsAt !== null && !parseIsoDate(program.startsAt))
        || (program.endsAt !== null && !parseIsoDate(program.endsAt))) {
        throw new Error('una o più voci non rispettano lo schema del catalogo agevolazioni');
      }
      seenIds.add(program.id);
    }
    bonusCatalog = loadedCatalog.programs;
    bonusCatalogUpdatedAt = loadedCatalog.updatedAt;
    bonusCatalogError = null;
    if (bonusCatalogMode === 'backend') {
      try {
        const monitoringResponse = await fetch(SOURCE_MONITORING_API_URL, { cache: 'no-store' });
        if (!monitoringResponse.ok) throw new Error(`risposta HTTP ${monitoringResponse.status}`);
        const monitoring = await monitoringResponse.json();
        validateMonitoringStatus(monitoring);
        sourceMonitoring = monitoring;
        sourceMonitoringError = null;
      } catch (error) {
        sourceMonitoring = null;
        sourceMonitoringError = error.message;
        console.error('Caricamento stato fonti non riuscito:', error);
      }
    } else {
      try {
        const monitoringResponse = await fetch('./assets/catalog/source-monitoring.json', { cache: 'no-cache' });
        if (!monitoringResponse.ok) throw new Error(`risposta HTTP ${monitoringResponse.status}`);
        const monitoring = await monitoringResponse.json();
        validateMonitoringStatus(monitoring);
        sourceMonitoring = monitoring;
        if (monitoring.updateMode === 'github-actions' && monitoring.lastRunAt) {
          bonusCatalogMode = 'scheduled';
          sourceMonitoringError = null;
        } else {
          sourceMonitoringError = null;
        }
      } catch (error) {
        sourceMonitoring = null;
        sourceMonitoringError = `stato fonti statico non disponibile (${error.message})`;
        console.warn('Stato del monitoraggio statico non disponibile:', error);
      }
    }
  } catch (error) {
    bonusCatalogError = error.message;
    console.error('Caricamento catalogo agevolazioni non riuscito:', error);
  }
  render();
}

async function loadStaging({ renderAfter = true } = {}) {
  if (bonusCatalogMode !== 'backend') {
    stagingEntries = [];
    stagingError = null;
    if (renderAfter) render();
    return;
  }
  try {
    const response = await fetch(STAGING_API_URL, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `risposta HTTP ${response.status}`);
    if (!payload || !Array.isArray(payload.items)
      || payload.items.some((entry) => !entry || typeof entry.sourceId !== 'string'
        || typeof entry.sourceLabel !== 'string' || typeof entry.sourceUrl !== 'string'
        || (entry.pendingProposal !== null && (typeof entry.pendingProposal !== 'object'
          || Array.isArray(entry.pendingProposal))))) {
      throw new Error('risposta staging non valida');
    }
    stagingEntries = payload.items;
    stagingError = null;
  } catch (error) {
    stagingEntries = null;
    stagingError = error.message;
    console.error('Caricamento coda staging non riuscito:', error);
  }
  if (renderAfter) render();
}

async function resolveStagingEntry(sourceId, action) {
  if (!sourceId || stagingBusyId) return;
  const entry = stagingEntries?.find((item) => item.sourceId === sourceId);
  if (!entry) {
    showToast('La proposta non è più disponibile. Aggiorna la coda.', true);
    await loadStaging();
    return;
  }
  if (action === 'approve' && !entry.pendingProposal) return;
  const confirmation = action === 'approve'
    ? `Hai verificato sulla fonte ufficiale requisiti, importi e scadenze di “${entry.pendingProposal.title}” e vuoi pubblicarla nel catalogo?`
    : `Scartare la variazione di “${entry.sourceLabel}” dalla coda di revisione?`;
  if (!window.confirm(confirmation)) return;

  stagingBusyId = sourceId;
  render();
  try {
    const endpoint = action === 'approve' ? 'approve' : 'discard';
    const response = await fetch(`${STAGING_API_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceId }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `risposta HTTP ${response.status}`);
    showToast(action === 'approve'
      ? 'Proposta approvata e aggiunta al catalogo.'
      : 'Variazione rimossa dalla coda.');
    await loadBonusCatalog();
  } catch (error) {
    stagingError = error.message;
    showToast(`Revisione non riuscita: ${error.message}`, true);
    await loadStaging();
  } finally {
    stagingBusyId = null;
    render();
  }
}

function validateMonitoringStatus(monitoring) {
  const allowedModes = ['github-actions', 'local-server', 'not-configured'];
  const allowedStatuses = ['baseline', 'changed', 'error', 'error-ai', 'unchecked', 'unchanged'];
  if (!monitoring || monitoring.schemaVersion !== 1
    || !allowedModes.includes(monitoring.updateMode)
    || (monitoring.lastRunAt !== null
      && (typeof monitoring.lastRunAt !== 'string' || Number.isNaN(Date.parse(monitoring.lastRunAt))))
    || !Array.isArray(monitoring.sources)
    || !Number.isInteger(monitoring.pendingReviewCount)
    || monitoring.sources.some((source) => !source || typeof source.id !== 'string'
      || typeof source.label !== 'string' || typeof source.url !== 'string'
      || !source.url.startsWith('https://') || !allowedStatuses.includes(source.status)
      || typeof source.pendingReview !== 'boolean')) {
    throw new Error('risposta monitoraggio non valida');
  }
}

document.addEventListener('click', handleClick);
document.addEventListener('change', handleChange);
document.addEventListener('submit', handleSubmit);
document.addEventListener('click', (event) => {
  const closeButton = event.target.closest('[data-close-dialog]');
  if (!closeButton) return;
  closeButton.closest('dialog')?.close();
});
for (const dialog of [deadlineDialog, profileDialog, document.querySelector('#movement-dialog')]) {
  dialog.addEventListener('close', () => {
    if (!dialog.open) {
      const name = dialog === deadlineDialog ? 'deadline' : dialog === profileDialog ? 'profile' : 'movement';
      dialogSessions[name] += 1;
    }
    if (document.activeElement === document.body) document.querySelector('#main-content')?.focus();
  });
}
backupFileInput.addEventListener('change', () => {
  const [file] = backupFileInput.files;
  if (file) restoreBackup(file);
});
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  render();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  showToast('Scadenzario è stato installato.');
  render();
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try {
    if (localStorage.getItem(STORAGE_KEY) !== storageBaseline) showStorageProblem('I dati sono cambiati in un’altra scheda. Salvataggi bloccati: conserva le modifiche locali e ricarica.', true);
  } catch (error) { showStorageProblem(`Archivio non leggibile: ${error.message}`); }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkReminders();
});
setInterval(checkReminders, 60_000);

try {
  loadSavedState();
  render();
  loadCatalog();
  loadBonusCatalog();
  registerServiceWorker();
  checkReminders();
} catch (error) {
  renderFatalError(error);
}
