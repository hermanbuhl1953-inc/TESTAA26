import { SCHEMA_VERSION, emptyPlanner, migrate, occurrences, project, validateSeries, validatePlanner, setOccurrenceActual, shiftMonth } from './planning.js';
import { buildRadar, filterAgenda, planningEnd } from './radar.js';

const STORAGE_KEY = 'scadenzario.pwa.v1';
const todayIso = () => dateToIso(dateOnly(new Date()));
let editingOccurrence = null;
const viewOccurrences = (end = shiftMonth(todayIso(), 12), from = '1900-01-01') => occurrences(state.deadlines, end, from);
function findOccurrence(id, income = false) {
  const split = id.lastIndexOf('@');
  if (split < 0) return null;
  const series = (income ? state.planner.incomes : state.deadlines).find(s => s.id === id.slice(0, split));
  if (!series) return null;
  return occurrences([series], id.slice(split + 1)).find(o => o.id === id) ?? null;
}
function nextSeriesCards() {
  return state.deadlines.flatMap(s => {
    const horizon = shiftMonth(todayIso(), 12);
    const items = occurrences([s], s.dueDate > horizon ? s.dueDate : horizon);
    const history = items.filter(o => o.completed);
    const next = items.find(o => !o.completed);
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

function formatDate(value, options = { day: 'numeric', month: 'short' }) {
  const date = typeof value === 'string' ? parseIsoDate(value) : value;
  if (!date) return 'Data non valida';
  return new Intl.DateTimeFormat('it-IT', options).format(date);
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

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    profile: state.profile,
    deadlines: state.deadlines,
    planner: state.planner,
    migrationNotice: state.migrationNotice,
    notificationsEnabled: state.notificationsEnabled,
    notifiedKeys: state.notifiedKeys.slice(-500),
  }));
}

function commit(change, successMessage) {
  const previous = copyState();
  try {
    change();
    validatePlanner(state.planner, todayIso());
    state.deadlines.forEach(validateDeadline);
    if (state.planner.ready) project(state.planner, state.deadlines, todayIso(), shiftMonth(todayIso().slice(0, 8) + '01', 12));
    persist();
    render();
    if (successMessage) showToast(successMessage);
    checkReminders();
    return true;
  } catch (error) {
    Object.assign(state, previous);
    render();
    showToast(`Operazione non riuscita: ${error.message}`, true);
    return false;
  }
}

function loadSavedState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return;
  const saved = migrate(JSON.parse(raw), todayIso());
  if (saved.profile !== null && !isValidProfile(saved.profile)) {
    throw new Error('Il profilo salvato non è valido.');
  }
  for (const deadline of saved.deadlines) validateDeadline(deadline);
  state.profile = saved.profile;
  state.deadlines = saved.deadlines;
  state.planner = saved.planner;
  state.migrationNotice = saved.migrationNotice || '';
  state.notificationsEnabled = saved.notificationsEnabled === true;
  state.notifiedKeys = Array.isArray(saved.notifiedKeys)
    ? saved.notifiedKeys.filter((key) => typeof key === 'string').slice(-500)
    : [];
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
          ${navButton('more', 'Altro', 'profile')}
        </nav>
        <div class="sidebar-bottom">
          <div class="sidebar-note">I tuoi dati restano su questo dispositivo. Nessun account o sincronizzazione.</div>
        </div>
      </aside>
      <div class="main-column">
        <header class="topbar">
          <span class="topbar-label">Il tuo spazio personale</span>
          <div class="topbar-actions">
            <button class="profile-button" type="button" data-action="open-profile-dialog" aria-label="Modifica profilo">
              <span class="avatar">${escapeHtml(profileInitials(state.profile.name))}</span>
              <span>${escapeHtml(state.profile.name)}</span>
            </button>
          </div>
        </header>
        <main class="content" id="main-content" tabindex="-1">${content}</main>
      </div>
    </div>
    <nav class="mobile-bottom-nav" aria-label="Navigazione principale">
      ${mobileNavButton('home', 'Home', 'home')}
      ${mobileNavButton('calendar', 'Agenda', 'calendar')}
      ${mobileNavButton('planning', 'Planning', 'chart')}
      ${mobileNavButton('more', 'Altro', 'profile')}
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
    <p>Saldo di riferimento: ${p.ready ? escapeHtml(formatAmount(p.openingBalanceCents)) : 'non impostato'}; data: ${p.balanceDate ? escapeHtml(p.balanceDate) : 'non impostata'}. Orizzonte fino al ${escapeHtml(radar.end)} incluso, uguale in Home e Planning.</p>
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
    ${p.ready ? `<p>Saldo di riferimento <strong class="money">${formatAmount(p.openingBalanceCents)}</strong> al ${escapeHtml(p.balanceDate)} · Riserva <strong class="money">${formatAmount(p.reserveCents)}</strong>.</p>` : ''}
    <p>Effettivi nella data saldo: ${p.sameDayActualsIncluded === true ? 'tutti già inclusi' : p.sameDayActualsIncluded === false ? 'nessuno incluso; applicati' : 'scelta mancante'}. Periodo: ${p.ready ? escapeHtml(p.balanceDate) : 'saldo da impostare'} → ${escapeHtml(radar.end)}.</p>
    ${excluded ? '<p class="inline-warning">Alcune uscite non sono incluse: il margine potrebbe risultare più alto del reale.</p>' : ''}
    ${radar.error ? `<p class="inline-warning">Previsione non calcolabile: ${escapeHtml(radar.error)}</p>` : ''}
    ${state.migrationNotice ? `<p class="inline-warning">${escapeHtml(state.migrationNotice)}</p>` : ''}
    ${warnings.length ? `<details class="inline-warning"><summary>${warnings.length} problemi nei dati: verifica inclusioni ed esclusioni</summary><ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></details>` : !radar.projection ? '<p>Completa saldo, data e scelta sugli effettivi. Anche senza saldo, Radar mantiene visibili gli arretrati e i dati mancanti.</p>' : ''}
    <button class="button button-quiet" type="button" data-action="configure-plan">${p.ready ? 'Verifica saldo e dati' : 'Imposta saldo'}</button>
    ${renderCalculation(radar)}</section>`;
}

function renderTrend(radar) {
  const p = radar.projection;
  return `<section class="plan-panel" aria-labelledby="trend-title"><h2 id="trend-title">Andamento previsto</h2><p>Stesso motore del Planning · fino al ${escapeHtml(radar.end)} incluso.</p>
    ${!p ? '<p>Previsione non calcolabile: completa o correggi i dati del piano. Nessun valore stimato viene sostituito con zero.</p>' : `
    ${p.warnings.length || state.migrationNotice ? '<p class="inline-warning">La previsione non racconta ancora tutto. Dati esclusi o da verificare: i risultati possono sovrastimare il margine.</p>' : '<p>Previsione basata sui movimenti inseriti. Le spese non registrate non sono considerate.</p>'}
    ${radar.items.some(i => i.type === 'expense-overdue' && i.cashDate && i.cashDate < todayIso()) ? '<p class="inline-warning">Alcune uscite non sono incluse: il margine potrebbe risultare più alto del reale.</p>' : ''}
    <dl class="trend-metrics"><div><dt>Prima sotto riserva</dt><dd>${p.firstCriticalDate ? escapeHtml(p.firstCriticalDate) : 'Non rilevata nei movimenti noti'}${state.planner.reserveCents === 0 ? ' (riserva 0,00 €)' : ''}</dd></div>
    <div><dt>Prima sotto zero</dt><dd>${p.firstBelowZero ? escapeHtml(p.firstBelowZero) : 'Non rilevata nei movimenti noti'}</dd></div>
    <div><dt>Minimo dal saldo di riferimento</dt><dd class="money">${formatAmount(p.minimumCents)}<small>Il ${escapeHtml(p.minimumDate)}</small></dd></div>
    <div><dt>Margine rispetto alla riserva</dt><dd class="money">${formatAmount(p.marginCents)}</dd></div></dl>`}
    <button class="button button-quiet" type="button" data-action="planning-results">Apri Planning</button></section>`;
}

function renderRadarItems(items) {
  if (!items.length) return '<p class="empty-context">Nessuna azione rilevata dalle regole sui dati inseriti. Non è una verifica di spese o entrate non registrate.</p>';
  return `<ol class="radar-list">${items.map(item => `<li class="radar-card"><article><p class="eyebrow">${item.severity === 0 ? 'PRIORITÀ PIANO' : item.severity === 1 ? 'DA VERIFICARE' : 'DATI DA COMPLETARE'}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>
    ${item.occurrenceId && item.dueDate ? `<p class="radar-dates">Scadenza: ${escapeHtml(item.dueDate)} · Cassa prevista: ${item.cashDate ? escapeHtml(item.cashDate) : 'non nota'}</p>` : ''}
    ${item.type === 'critical' ? `<p>Prima sotto riserva: ${escapeHtml(item.firstCriticalDate ?? 'non rilevata')}; prima sotto zero: ${escapeHtml(item.firstBelowZero ?? 'non rilevata')}.</p><details><summary>Perché questa segnalazione?</summary><p>Saldo iniziale ${formatAmount(state.planner.openingBalanceCents)} al ${escapeHtml(state.planner.balanceDate)}; riserva ${formatAmount(state.planner.reserveCents)}. Movimenti applicati fino alla prima criticità/sottozero (incluse tutte le operazioni della giornata, uscite prima delle entrate):</p><ul>${item.movements.map(r => `<li>${escapeHtml(r.date)} · ${escapeHtml(r.label)} · ${formatAmount(r.amountCents)} → saldo ${formatAmount(r.balanceCents)}</li>`).join('') || '<li>Criticità già presente nel saldo iniziale.</li>'}</ul></details>` : ''}
    <div class="radar-actions"><button class="button button-primary" type="button" data-action="${item.action}"${item.occurrenceId ? ` data-id="${escapeHtml(item.occurrenceId)}"` : ''}${item.view ? ` data-view="${item.view}"` : ''}>${item.actionLabel}</button>
    ${item.editAction ? `<button class="text-button" type="button" data-action="${item.editAction}" data-id="${escapeHtml(item.occurrenceId)}">Aggiorna previsione / modifica singola</button>` : ''}</div></article></li>`).join('')}</ol>`;
}

function renderRadar() {
  const radar = currentRadar();
  return `<p class="eyebrow">REGOLE SPIEGABILI · SOLO DATI LOCALI</p><h1 class="page-title">Radar</h1><p class="page-description">${radar.items.length} segnalazioni, ordinate per gravità e data. Occorrenze considerate dall’ancora delle serie fino al ${escapeHtml(radar.end)}, incluse eccezioni e casse anticipate riconosciute dal motore. Nessun troncamento dell’elenco; limite motore 100.000 passi per serie, con errore visibile.</p>${renderRadarItems(radar.items)}${renderCalculation(radar)}`;
}

function renderHome() {
  const radar = currentRadar();
  let upcoming = [], listError = null;
  try { upcoming = sortDeadlines(state.deadlines.flatMap(series => {
    if (series.archived) return [];
    const end = series.dueDate > radar.end ? series.dueDate : radar.end;
    return sortDeadlines(occurrences([series], end).filter(o => !o.completed && o.dueDate >= todayIso())).slice(0, 1);
  })); }
  catch (error) { listError = error.message; }
  return `<p class="eyebrow">SCADENZARIO · ${escapeHtml(todayIso())}</p><h1 class="page-title">Il tuo piano, in chiaro.</h1>
    <section class="plan-panel home-priorities" aria-labelledby="priorities-title"><div class="section-heading"><div><h2 id="priorities-title">Da gestire</h2><p>${radar.items.length} segnalazioni · al massimo 3 qui, elenco completo nel Radar</p></div><button class="button button-quiet" type="button" data-action="navigate" data-view="radar">Apri Radar</button></div>${renderRadarItems(radar.items.slice(0, 3))}</section>
    ${renderReliability(radar)}${renderTrend(radar)}
    <section class="plan-panel"><div class="section-heading"><div><h2>Prossime scadenze</h2><p>Prima occorrenza aperta per serie, da oggi; tutte le occorrenze e lo storico in Agenda.</p></div><button class="button button-primary" type="button" data-action="new-deadline">Nuova scadenza</button></div>
    ${listError ? `<p class="inline-warning">Elenco non calcolabile: ${escapeHtml(listError)}</p>` : upcoming.length ? renderDeadlineList(upcoming) : '<p class="empty-context">Nessuna prossima scadenza nei dati inseriti. Controlla gli arretrati nel Radar o aggiungi una scadenza.</p>'}
    <button class="text-button" type="button" data-action="navigate" data-view="calendar">Apri Agenda e calendario</button></section>${renderInstallBanner()}`;
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
    const hasEvent = viewOccurrences(iso, iso).some((deadline) => !deadline.archived && !deadline.completed && deadline.dueDate === iso);
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
  const options = [['active', 'Da fare'], ['all', 'Tutte'], ['completed', 'Completate'], ['archived', 'Archiviate']];
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
  const date = parseIsoDate(deadline.dueDate);
  const recurrence = deadline.recurrenceMonths ? ` · ${recurrenceLabel(deadline.recurrenceMonths)}` : '';
  const amount = deadline.amountCents > 0 ? formatAmount(deadline.amountCents) : '';
  const classes = ['deadline-card'];
  if (status.className === 'urgent') classes.push('urgent');
  if (status.className === 'overdue') classes.push('overdue');
  if (deadline.completed) classes.push('completed');
  const completeAction = deadline.completed ? 'reopen-deadline' : 'complete-deadline';
  const completeLabel = deadline.completed ? 'Annulla completamento e riapri' : deadline.amountCents ? 'Registra pagamento effettivo' : 'Completa promemoria senza movimento';
  const actionButtons = deadline.archived ? `<button class="text-button" type="button" data-action="restore-deadline" data-id="${escapeHtml(deadline.seriesId)}">Riattiva serie</button>` : `
    <div class="card-actions">
      ${!deadline.amountCents && !deadline.completed ? `<button class="text-button" type="button" data-action="record-deadline" data-id="${escapeHtml(deadline.id)}">Registra pagamento</button>` : ''}
      <button class="card-action" type="button" data-action="${completeAction}" data-id="${escapeHtml(deadline.id)}" aria-label="${completeLabel}" title="${completeLabel}">${icon('check')}</button>
      ${deadline.completed && !deadline.done ? `<button class="text-button" type="button" data-action="complete-deadline" data-id="${escapeHtml(deadline.id)}">Correggi effettivo</button>` : ''}
      <button class="card-action" type="button" data-action="edit-deadline" data-id="${escapeHtml(deadline.id)}" aria-label="Modifica ${escapeHtml(deadline.title)}" title="Modifica">${icon('edit')}</button>
      <button class="card-action" type="button" data-action="archive-deadline" data-id="${escapeHtml(deadline.id)}" aria-label="Archivia intera serie ${escapeHtml(deadline.title)}" title="Archivia intera serie">${icon('archive')}</button>
    </div>`;
  return `<article class="${classes.join(' ')}">
    <span class="date-icon">${icon('calendar')}<small>${escapeHtml(new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(date))}</small></span>
    <div><p class="deadline-title">${escapeHtml(deadline.title)}</p><p class="deadline-meta">${escapeHtml(categoryName(deadline.category))}${escapeHtml(recurrence)}${deadline.notes ? ` · ${escapeHtml(deadline.notes)}` : ''} · Scadenza: ${escapeHtml(deadline.dueDate)} · Cassa prevista: ${deadline.cashDate ? escapeHtml(formatDate(deadline.cashDate)) : 'non nota'}${deadline.actual ? ` · Pagato ${escapeHtml(formatAmount(deadline.actual.amountCents))} il ${escapeHtml(formatDate(deadline.actual.date))}` : deadline.legacyCompleted ? ' · Storico: data/importo effettivi sconosciuti' : ''}</p></div>
    <div class="deadline-right">${amount ? `<span class="deadline-amount">${escapeHtml(amount)}</span>` : ''}<span class="status-pill ${status.className}">${escapeHtml(status.text)}</span>${actionButtons}</div>
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
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const iso = dateToIso(date);
    const events = sortDeadlines(activeDeadlines.filter((deadline) => deadline.dueDate === iso));
    const classes = ['calendar-day'];
    if (date.getMonth() !== month) classes.push('outside');
    if (iso === dateToIso(dateOnly(new Date()))) classes.push('today');
    if (iso === selectedCalendarDate) classes.push('selected');
    return `<button class="${classes.join(' ')}" type="button" data-action="select-calendar-date" data-date="${iso}" aria-pressed="${iso === selectedCalendarDate}" aria-label="${escapeHtml(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}${events.length ? `, ${events.length} scadenze` : ''}">
      <span class="calendar-day-number">${date.getDate()}</span>
      <span class="calendar-events">${events.slice(0, 2).map((event) => `<span class="calendar-event${dayDifference(event.dueDate) < 0 && !event.completed ? ' overdue' : ''}">${escapeHtml(event.title)}</span>`).join('')}${events.length > 2 ? `<span class="calendar-event more">+${events.length - 2} altre</span>` : ''}</span>
    </button>`;
  }).join('');
  const selectedDeadlines = filterAgenda(all, { ...filters, period: agendaPeriod, date: selectedCalendarDate }, todayIso());
  const selection = { today: 'Oggi', upcoming: 'Prossime (dopo oggi)', overdue: 'Arretrati', all: 'Tutte le date / storico', day: `Giorno selezionato: ${selectedCalendarDate}` }[agendaPeriod];
  return `
    <p class="eyebrow">PIANIFICA</p><h1 class="page-title">Agenda</h1>
    <p class="page-description">Scadenze legali e storico. Il Calendario è una vista alternativa: selezionare un giorno attiva esplicitamente il filtro Giorno selezionato.</p>
    <div class="agenda-filters" aria-label="Filtri Agenda"><div class="period-filters" aria-label="Periodo esclusivo">
      ${[['today', 'Oggi'], ['upcoming', 'Prossime'], ['overdue', 'Arretrati'], ['all', 'Tutte / storico']].map(([period, label]) => `<button class="button ${agendaPeriod === period ? 'button-primary' : 'button-quiet'}" type="button" data-action="agenda-period" data-period="${period}" aria-pressed="${agendaPeriod === period}">${label}</button>`).join('')}</div>
      <div class="toolbar">${renderCategoryFilter()}${renderStatusFilter()}</div></div>
    <p class="page-description">Elenco fino al ${escapeHtml(end)}, senza troncamento. Per date successive usa il mese del calendario. Completate e archiviate: scegli stato e Tutte / storico.</p>
    <details class="agenda-calendar"${agendaPeriod === 'day' ? ' open' : ''}><summary>Calendario mensile · ${escapeHtml(monthName)}</summary>
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
    <div class="calendar-legend"><span class="legend-item"><i class="legend-dot"></i>Scadenza</span><span class="legend-item"><i class="legend-dot late"></i>Scaduta</span></div>
    </details><div class="section-heading"><div><h2>${escapeHtml(selection)}</h2><p>${selectedDeadlines.length} ${selectedDeadlines.length === 1 ? 'scadenza' : 'scadenze'}</p></div><button class="button button-primary" type="button" data-action="new-deadline" data-date="${selectedCalendarDate}">${icon('plus')}Aggiungi</button></div>
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
        <h3>Backup dei dati</h3><p>Esporta una copia JSON o ripristina un backup. Il ripristino sostituisce le scadenze presenti.</p>
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
  try { incomeItems = planner.incomes.flatMap(s => occurrences([s], s.dueDate > end ? s.dueDate : end)); }
  catch (error) { incomeError = error.message; }
  return `
    <p class="eyebrow">FLUSSI DI CASSA</p><h1 class="page-title">Pianificazione</h1>
    <p class="page-description">Saldo, riserva ed entrate sono salvati su questo browser e inclusi nel backup JSON. Nessuna sincronizzazione o cifratura.</p>
    ${state.migrationNotice ? `<div class="notice">${escapeHtml(state.migrationNotice)}</div>` : ''}
    ${renderReliability(radar)}
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
          <label class="field"><span>Prima data prevista di cassa</span><input name="date" type="date" required></label>
          <label class="field"><span>Ricorrenza</span><select name="months"><option value="0">Una tantum</option><option value="1">Mensile</option><option value="3">Trimestrale</option><option value="12">Annuale</option></select></label>
          <label class="field"><span>Termine per data (facoltativo)</span><input name="endDate" type="date"></label>
          <label class="field"><span>Numero occorrenze (facoltativo)</span><input name="count" type="number" min="1" max="1200"></label>
        </div><button class="button button-quiet" type="submit">Aggiungi previsione</button>
      </form>
      ${incomeError ? `<p class="inline-warning">Entrate non calcolabili: ${escapeHtml(incomeError)}</p>` : ''}
      <ul class="income-list">${incomeItems.map(o => `<li><span><strong>${escapeHtml(o.name)}</strong><small>Scadenza: ${escapeHtml(o.dueDate)} · Cassa prevista: ${o.cashDate ? escapeHtml(o.cashDate) : 'non nota'} · ${formatAmount(o.amountCents)}${o.archived ? ' · Serie archiviata' : ''} · ${o.actual ? `Incassato ${formatAmount(o.actual.amountCents)} il ${escapeHtml(formatDate(o.actual.date))}` : 'Previsto, non incassato'}</small></span><div class="toolbar"><button class="text-button" type="button" data-action="actual-income" data-id="${escapeHtml(o.id)}">${o.actual ? 'Correggi incasso' : 'Registra incasso'}</button>${o.actual ? `<button class="text-button" type="button" data-action="undo-income" data-id="${escapeHtml(o.id)}">Annulla incasso</button>` : `<button class="text-button" type="button" data-action="edit-income" data-id="${escapeHtml(o.id)}">Modifica singola</button>`}<button class="text-button" type="button" data-action="${o.archived ? 'restore-income' : 'remove-income'}" data-id="${escapeHtml(o.seriesId)}">${o.archived ? 'Riattiva serie archiviata' : 'Archivia serie'}</button></div></li>`).join('')}</ul>
    </section>
    <div id="planning-results" tabindex="-1">${renderTrend(radar)}</div>
    ${projection ? `<section class="planning-results">
      <p>Saldo finale previsto: <strong class="money">${formatAmount(projection.endingBalanceCents)}</strong> · Deficit massimo sotto zero: <strong class="money">${formatAmount(projection.deficitCents)}</strong>.</p>
      <div class="notice">Stima parziale fino al ${escapeHtml(formatDate(end, { day: 'numeric', month: 'long', year: 'numeric' }))}. Nessun arretrato viene spostato automaticamente a oggi. Senza orari, uscite prima delle entrate dello stesso giorno (prudenziale). I dati mancanti possono peggiorare il risultato; non include spese quotidiane o non registrate. Non è consulenza finanziaria.</div>
      ${projection.warnings.length ? `<details class="notice error"><summary>${projection.warnings.length} dati mancanti o movimenti da riconciliare (stima incompleta)</summary><ul>${projection.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></details>` : ''}
      <div class="projection-table-wrap"><table class="projection-table"><caption>Riepilogo mensile dal mese corrente alla data finale indicata; gli effettivi precedenti al mese sono già applicati al saldo iniziale</caption><thead><tr><th scope="col">Mese</th><th scope="col">Entrate</th><th scope="col">Uscite</th><th scope="col">Saldo finale</th><th scope="col">Minimo inframensile</th></tr></thead><tbody>${projection.months.map(m => `<tr><th scope="row">${escapeHtml(formatDate(m.month, { month: 'long', year: 'numeric' }))}</th><td>${formatAmount(m.incomeCents)}</td><td>${formatAmount(m.expensesCents)}</td><td>${formatAmount(m.endingBalanceCents)}</td><td class="${m.minimumCents < planner.reserveCents ? 'negative' : ''}">${formatAmount(m.minimumCents)}</td></tr>`).join('')}</tbody></table></div>
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

function openDeadlineForm(deadline = null, defaults = {}) {
  editingOccurrence = deadline;
  deadlineForm.reset();
  for (const selector of ['#deadline-recurrence', '#deadline-end', '#deadline-count']) document.querySelector(selector).disabled = Boolean(deadline);
  document.querySelector('#occurrence-edit-note').hidden = !deadline;
  document.querySelector('#series-end-fields').hidden = Boolean(deadline);
  document.querySelector('#deadline-cash-mode').value = deadline?.cashMode ?? 'unknown';
  document.querySelector('#deadline-cash-date').value = deadline?.cashDate ?? '';
  document.querySelector('#deadline-end').value = deadline?.endDate ?? '';
  document.querySelector('#deadline-count').value = deadline?.count ?? '';
  document.querySelector('#deadline-error').classList.remove('visible');
  document.querySelector('#deadline-error').textContent = '';
  document.querySelector('#deadline-id').value = deadline?.id ?? '';
  document.querySelector('#deadline-catalog-id').value = deadline?.catalogItemId ?? defaults.catalogItemId ?? '';
  document.querySelector('#deadline-title').value = deadline?.title ?? defaults.title ?? '';
  document.querySelector('#deadline-category').value = deadline?.category ?? defaults.category ?? 'altro';
  document.querySelector('#deadline-date').value = deadline?.dueDate ?? defaults.dueDate ?? dateToIso(addDays(dateOnly(new Date()), 7));
  document.querySelector('#deadline-recurrence').value = String(deadline?.recurrenceMonths ?? defaults.recurrenceMonths ?? 0);
  document.querySelector('#deadline-amount').value = deadline?.amountCents
    ? formatCentsForInput(deadline.amountCents)
    : '';
  document.querySelector('#deadline-notes').value = deadline?.notes ?? defaults.notes ?? '';
  const reminderDays = deadline?.reminderDays ?? defaults.reminderDays ?? [7, 1];
  deadlineForm.querySelectorAll('input[name="reminder"]').forEach((input) => {
    input.checked = reminderDays.includes(Number(input.value));
  });
  document.querySelector('#deadline-dialog-title').textContent = deadline ? 'Modifica singola occorrenza' : 'Nuova scadenza';
  deadlineDialog.showModal();
  document.querySelector(deadline ? '#deadline-date' : '#deadline-title').focus();
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
  const cashDate = document.querySelector('#deadline-cash-date').value || null;
  if (cashMode === 'date' && !parseIsoDate(cashDate)) {
    errorElement.textContent = 'Indica la data di cassa prevista.';
    errorElement.classList.add('visible');
    return;
  }
  if (editingOccurrence) {
    const occurrence = editingOccurrence;
    const saved = commit(() => {
      const series = state.deadlines.find(s => s.id === occurrence.seriesId);
      series.overrides[occurrence.key] = { ...series.overrides[occurrence.key], dueDate, cashMode, cashDate, amountCents,
        title, category: document.querySelector('#deadline-category').value,
        notes: document.querySelector('#deadline-notes').value.trim(),
        reminderDays: [...deadlineForm.querySelectorAll('input[name="reminder"]:checked')].map(input => Number(input.value)) };
      if (amountCents > 0) series.overrides[occurrence.key].done = false;
    }, 'Singola occorrenza aggiornata. Le successive mantengono l’ancora originale.');
    if (saved) deadlineDialog.close();
    return;
  }
  const existingId = document.querySelector('#deadline-id').value;
  const existing = existingId ? state.deadlines.find((item) => item.id === existingId) : null;
  const now = localDateTime();
  const reminderDays = [...deadlineForm.querySelectorAll('input[name="reminder"]:checked')]
    .map((input) => Number(input.value))
    .sort((a, b) => b - a);
  const deadline = {
    id: existing?.id ?? makeId(),
    title,
    category: document.querySelector('#deadline-category').value,
    dueDate,
    recurrenceMonths: Number(document.querySelector('#deadline-recurrence').value),
    cashMode,
    cashDate,
    endDate: document.querySelector('#deadline-end').value || null,
    count: document.querySelector('#deadline-count').value ? Number(document.querySelector('#deadline-count').value) : null,
    overrides: {},
    amountCents,
    notes: document.querySelector('#deadline-notes').value.trim(),
    reminderDays,
    completed: existing?.completed ?? false,
    archived: false,
    catalogItemId: document.querySelector('#deadline-catalog-id').value || null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  try { validateDeadline(deadline); } catch (error) {
    errorElement.textContent = error.message;
    errorElement.classList.add('visible');
    return;
  }
  const saved = commit(() => {
    const index = state.deadlines.findIndex((item) => item.id === deadline.id);
    if (index >= 0) state.deadlines[index] = deadline;
    else state.deadlines.push(deadline);
  }, existing ? 'Scadenza aggiornata.' : 'Scadenza salvata.');
  if (saved) deadlineDialog.close();
}

function renderFatalError(error) {
  app.innerHTML = `<main class="onboarding"><section class="onboarding-hero"><div class="brand"><span class="brand-mark">S</span><span>Scadenzario</span></div><div class="hero-copy"><h1>Non riesco ad aprire i dati.</h1><p>${escapeHtml(error.message)}</p></div><p class="hero-foot">I dati originali non sono stati modificati.</p></section><section class="onboarding-form-side"><div class="onboarding-card"><h2>Ripristina da backup</h2><p>Se il formato dei dati salvati è danneggiato, non verrà cancellato automaticamente. Seleziona un backup precedente per ripristinarlo.</p><button class="button button-primary" type="button" data-action="choose-backup">Scegli backup JSON</button></div></section></main>`;
}

function completeDeadline(id) {
  const o = findOccurrence(id);
  if (!o) return;
  if (o.amountCents || o.actual || o.legacyCompleted) { openMovement(id); return; }
  if (!window.confirm('Completare soltanto il promemoria, senza registrare un pagamento? Se esiste una spesa, annulla e usa il pulsante «Registra pagamento» oppure inserisci prima l’importo.')) return;
  commit(() => {
    const s = state.deadlines.find(s => s.id === o.seriesId);
    s.overrides[o.key] = { ...s.overrides[o.key], done: true };
  }, 'Promemoria completato senza movimento di cassa.');
}
function reopenDeadline(id) { undoActual(id); }
function openMovement(id, income = false, forecast = false) {
  const o = findOccurrence(id, income);
  if (!o) return;
  const form = document.querySelector('#movement-form');
  form.dataset.id = id;
  form.dataset.income = String(income);
  form.dataset.forecast = String(forecast);
  form.reset();
  document.querySelector('#movement-title').textContent = forecast ? 'Modifica singola previsione' : income ? 'Incasso effettivo totale' : 'Pagamento effettivo totale';
  document.querySelector('#movement-description').textContent = `${o.title ?? o.name} · Occorrenza ${o.key}. ${forecast ? 'Le successive restano invariate.' : 'Sostituisce la previsione collegata, non crea un secondo movimento. Correggi qui data e importo; annulla dall’elenco per riaprire.'}`;
  document.querySelector('#movement-date-label').textContent = forecast ? 'Nuova data prevista di cassa' : 'Data effettiva (obbligatoria, non futura)';
  const date = document.querySelector('#movement-date');
  date.value = forecast ? o.cashDate ?? '' : o.actual?.date ?? '';
  if (forecast) date.removeAttribute('max'); else date.max = todayIso();
  document.querySelector('#movement-amount').value = formatCentsForInput(o.actual?.amountCents ?? o.amountCents);
  document.querySelector('#movement-error').classList.remove('visible');
  document.querySelector('#movement-dialog').showModal();
  date.focus();
}
function handleMovementSubmit(event) {
  event.preventDefault();
  const { id, income, forecast } = event.target.dataset;
  const isIncome = income === 'true';
  const o = findOccurrence(id, isIncome);
  const date = document.querySelector('#movement-date').value;
  const amountCents = parseAmountCents(document.querySelector('#movement-amount').value);
  const error = document.querySelector('#movement-error');
  if (!o || !parseIsoDate(date) || forecast !== 'true' && date > todayIso() || amountCents === null || amountCents <= 0) {
    error.textContent = 'Inserisci una data valida (non futura per un effettivo) e un importo totale positivo.';
    error.classList.add('visible');
    return;
  }
  const saved = commit(() => {
    const list = isIncome ? state.planner.incomes : state.deadlines;
    const index = list.findIndex(s => s.id === o.seriesId);
    if (forecast === 'true') {
      list[index].overrides[o.key] = { ...list[index].overrides[o.key], cashMode: 'date', cashDate: date, amountCents };
    } else list[index] = setOccurrenceActual(list[index], o.key, { date, amountCents }, todayIso());
  }, forecast === 'true' ? 'Previsione aggiornata.' : 'Effettivo salvato. Verifica la riconciliazione con il saldo di riferimento.');
  if (saved) document.querySelector('#movement-dialog').close();
}
function undoActual(id, income = false) {
  const o = findOccurrence(id, income);
  if (!o || !window.confirm('Annullare l’effettivo e riaprire questa occorrenza? La previsione torna attiva; verifica anche il saldo di riferimento.')) return;
  commit(() => {
    const list = income ? state.planner.incomes : state.deadlines;
    const index = list.findIndex(s => s.id === o.seriesId);
    list[index] = setOccurrenceActual(list[index], o.key, null, todayIso());
  }, 'Effettivo annullato, occorrenza riaperta.');
}
function archiveDeadline(id) {
  const o = findOccurrence(id);
  if (!o || !window.confirm(`Archiviare l’intera serie “${o.title}”? Gli effettivi restano nel calcolo e nello storico.`)) return;
  commit(() => {
    state.deadlines.find(s => s.id === o.seriesId).archived = true;
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
  if (!backup || backup.app !== 'Scadenzario' || ![1, SCHEMA_VERSION].includes(backup.schemaVersion)) {
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
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Backup oltre il limite di 5 MB.');
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (parsed.app !== 'Scadenzario') throw new Error('Non è un backup Scadenzario.');
    const backup = migrate(parsed, todayIso());
    validateBackup(backup);
    if (!window.confirm(`Il backup contiene ${backup.deadlines.length} scadenze. Sostituire tutti i dati attualmente presenti nel browser?`)) return;
    commit(() => {
      state.profile = backup.profile;
      state.deadlines = backup.deadlines;
      state.planner = backup.planner;
      state.migrationNotice = backup.migrationNotice || '';
      state.notificationsEnabled = backup.notificationsEnabled === true;
      state.notifiedKeys = Array.isArray(backup.notifiedKeys)
        ? backup.notifiedKeys.filter((key) => typeof key === 'string').slice(-500)
        : [];
      currentView = 'home';
    }, 'Backup ripristinato.');
  } catch (error) {
    showToast(`Backup non importato: ${error.message}`, true);
  } finally {
    backupFileInput.value = '';
  }
}

async function enableNotifications() {
  if (!('Notification' in window) || !window.isSecureContext) {
    showToast('Notifiche non disponibili qui. Usa localhost o HTTPS.', true);
    render();
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      commit(() => { state.notificationsEnabled = false; }, null);
      showToast(permission === 'denied'
        ? 'Permesso negato. Puoi cambiarlo nelle impostazioni del browser.'
        : 'Permesso notifiche non concesso.', permission === 'denied');
      return;
    }
    commit(() => { state.notificationsEnabled = true; }, 'Promemoria browser attivati.');
  } catch (error) {
    showToast(`Impossibile attivare i promemoria: ${error.message}`, true);
  }
}

function disableNotifications() {
  commit(() => { state.notificationsEnabled = false; }, 'Promemoria browser disattivati.');
}

function checkReminders() {
  if (!state.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const today = dateToIso(dateOnly(new Date()));
  const nextKeys = [];
  for (const deadline of viewOccurrences(shiftMonth(today, 2), today)) {
    if (deadline.archived || deadline.completed) continue;
    const daysRemaining = dayDifference(deadline.dueDate);
    if (!deadline.reminderDays.includes(daysRemaining)) continue;
    const key = `${deadline.id}:${deadline.dueDate}:${daysRemaining}`;
    nextKeys.push(key);
    if (state.notifiedKeys.includes(key)) continue;
    try {
      const notification = new Notification(`Scadenzario · ${deadline.title}`, {
        body: daysRemaining === 0
          ? 'La scadenza è oggi.'
          : `La scadenza è tra ${daysRemaining} ${daysRemaining === 1 ? 'giorno' : 'giorni'}.`,
        icon: './icons/icon.svg',
        tag: key,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.error('Notifica browser non inviata:', error);
    }
  }
  if (nextKeys.some((key) => !state.notifiedKeys.includes(key))) {
    state.notifiedKeys = [...state.notifiedKeys, ...nextKeys].slice(-500);
    try {
      persist();
    } catch (error) {
      showToast(`Notifica mostrata, ma stato non salvato: ${error.message}`, true);
    }
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.error('Registrazione del service worker non riuscita:', error);
    serviceWorkerError = error.message;
    if (state.profile) render();
  });
}

function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;

  switch (action) {
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
    case 'new-deadline':
      openDeadlineForm(null, button.dataset.date ? { dueDate: button.dataset.date } : {});
      break;
    case 'edit-deadline': {
      const deadline = findOccurrence(id);
      if (deadline) openDeadlineForm(deadline);
      break;
    }
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
      render();
      document.querySelector(`[data-action="select-calendar-date"][data-date="${selectedCalendarDate}"]`)?.focus();
      showToast(`Giorno selezionato: ${selectedCalendarDate}.`);
      break;
    case 'calendar-month':
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + Number(button.dataset.offset), 1);
      selectedCalendarDate = dateToIso(calendarMonth);
      agendaPeriod = 'day';
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
    commit(() => {
      state.profile = { name, type, createdAt: localDateTime() };
      currentView = 'home';
    }, 'Profilo creato. Ora puoi aggiungere la prima scadenza.');
  }
  if (event.target.id === 'deadline-form') handleDeadlineSubmit(event);
  if (event.target.id === 'movement-form') handleMovementSubmit(event);
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
    commit(() => {
      Object.assign(state.planner, { openingBalanceCents, reserveCents, balanceDate, sameDayActualsIncluded: sameDay === 'included', ready: true });
    }, 'Saldo e riserva salvati.');
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
      recurrenceMonths: Number(data.get('months')), endDate: String(data.get('endDate') || '') || null,
      count: data.get('count') ? Number(data.get('count')) : null, overrides: {}, archived: false };
    commit(() => { validateSeries(income); state.planner.incomes.push(income); }, 'Entrata prevista salvata (non ancora incassata).');
  }
  if (event.target.id === 'profile-form') {
    event.preventDefault();
    const name = document.querySelector('#profile-name').value.trim();
    const type = document.querySelector('#profile-type').value;
    if (!name || !Object.hasOwn(PROFILE_LABELS, type)) return;
    const saved = commit(() => {
      state.profile = { ...state.profile, name, type };
    }, 'Profilo aggiornato.');
    if (saved) profileDialog.close();
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

app.addEventListener('click', handleClick);
app.addEventListener('change', handleChange);
document.addEventListener('submit', handleSubmit);
document.addEventListener('click', (event) => {
  const closeButton = event.target.closest('[data-close-dialog]');
  if (!closeButton) return;
  closeButton.closest('dialog')?.close();
});
for (const dialog of [deadlineDialog, profileDialog, document.querySelector('#movement-dialog')]) {
  dialog.addEventListener('close', () => {
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
