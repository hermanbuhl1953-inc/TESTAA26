const STORAGE_KEY = 'scadenzario.pwa.v1';
const CATALOG_URL = './assets/catalog/deadlines.json';
const BONUS_CATALOG_URL = './assets/catalog/benefits.json';
const BONUS_API_URL = './api/benefits';
const SOURCE_MONITORING_API_URL = './api/monitoring';
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
};
let catalog = [];
let catalogError = null;
let bonusCatalog = [];
let bonusCatalogError = null;
let bonusCatalogUpdatedAt = null;
let bonusCatalogMode = 'local';
let sourceMonitoring = null;
let sourceMonitoringError = null;
let currentView = 'home';
let selectedHomeDate = dateToIso(dateOnly(new Date()));
let selectedCalendarDate = dateToIso(dateOnly(new Date()));
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let filters = { category: 'all', status: 'active' };
let deferredInstallPrompt = null;
let toastTimer = null;
let serviceWorkerError = null;
let planner = {
  ready: false,
  openingBalanceCents: 0,
  reserveCents: 0,
  incomes: [],
};
let bonusSearch = {
  searched: false,
  region: '',
  municipality: '',
  iseeCents: null,
};

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
    schemaVersion: 1,
    profile: state.profile,
    deadlines: state.deadlines,
    notificationsEnabled: state.notificationsEnabled,
    notifiedKeys: state.notifiedKeys.slice(-500),
  }));
}

function commit(change, successMessage) {
  const previous = copyState();
  try {
    change();
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
  const saved = JSON.parse(raw);
  if (!saved || saved.schemaVersion !== 1 || !Array.isArray(saved.deadlines)) {
    throw new Error('I dati salvati non hanno un formato riconosciuto. Esporta prima di ripristinare.');
  }
  if (saved.profile !== null && !isValidProfile(saved.profile)) {
    throw new Error('Il profilo salvato non è valido.');
  }
  for (const deadline of saved.deadlines) validateDeadline(deadline);
  state.profile = saved.profile;
  state.deadlines = saved.deadlines;
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
  if (deadline.completed) return { text: 'Completata', className: '' };
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

function navButton(view, label, iconName) {
  return `<button class="nav-button${currentView === view ? ' active' : ''}" type="button" data-action="navigate" data-view="${view}">${icon(iconName)}<span>${label}</span></button>`;
}

function mobileNavButton(view, label, iconName) {
  return `<button class="mobile-nav-button${currentView === view ? ' active' : ''}" type="button" data-action="navigate" data-view="${view}">${icon(iconName)}<span>${label}</span></button>`;
}

function render() {
  if (!state.profile) {
    app.innerHTML = renderOnboarding();
    return;
  }

  const viewData = {
    home: renderHome(),
    calendar: renderCalendar(),
    catalog: renderCatalog(),
    profile: renderProfile(),
    planning: renderPlanning(),
    benefits: renderBenefits(),
  };
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">S</span><span>Scadenzario</span></div>
        <nav class="side-nav" aria-label="Navigazione principale">
          ${navButton('home', 'Panoramica', 'home')}
          ${navButton('calendar', 'Calendario', 'calendar')}
          ${navButton('catalog', 'Suggerimenti', 'catalog')}
          ${navButton('planning', 'Pianificazione', 'chart')}
          ${navButton('benefits', 'Bonus e agevolazioni', 'benefits')}
          ${navButton('profile', 'Impostazioni', 'profile')}
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
        <main class="content">${viewData[currentView] || viewData.home}</main>
      </div>
    </div>
    <nav class="mobile-bottom-nav" aria-label="Navigazione principale">
      ${mobileNavButton('home', 'Home', 'home')}
      ${mobileNavButton('planning', 'Piano', 'chart')}
      ${mobileNavButton('calendar', 'Calendario', 'calendar')}
      ${mobileNavButton('benefits', 'Bonus', 'benefits')}
      ${mobileNavButton('profile', 'Altro', 'profile')}
    </nav>`;
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

function renderHome() {
  const active = state.deadlines.filter((deadline) => !deadline.archived && !deadline.completed);
  const overdue = active.filter((deadline) => dayDifference(deadline.dueDate) < 0);
  const upcoming = sortDeadlines(active);
  const remainingForDay = selectedHomeDate === dateToIso(dateOnly(new Date()))
    ? upcoming
    : upcoming.filter((deadline) => deadline.dueDate === selectedHomeDate);
  const dateStrip = renderDateStrip();
  const categoryFilter = renderCategoryFilter();
  const statusFilter = renderStatusFilter();
  const filtered = sortDeadlines(state.deadlines.filter((deadline) => {
    if (filters.status === 'archived') return deadline.archived;
    if (deadline.archived) return false;
    if (filters.status === 'active' && deadline.completed) return false;
    if (filters.status === 'completed' && !deadline.completed) return false;
    return true;
  }).filter((deadline) => filters.category === 'all' || deadline.category === filters.category));
  const shown = filters.status === 'active'
    && filters.category === 'all'
    && selectedHomeDate !== dateToIso(dateOnly(new Date()))
    ? remainingForDay
    : filtered;
  const heading = selectedHomeDate === dateToIso(dateOnly(new Date()))
    ? 'Prossime scadenze'
    : `Scadenze del ${formatDate(selectedHomeDate, { day: 'numeric', month: 'long' })}`;
  const alertText = overdue.length === 0
    ? 'Nessuna scadenza è in ritardo'
    : `${overdue.length} ${overdue.length === 1 ? 'scadenza è in ritardo' : 'scadenze sono in ritardo'}`;

  return `
    <p class="greeting">${escapeHtml(new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()))}</p>
    <h1 class="page-title">Ciao ${escapeHtml(state.profile.name)},<br>tutto sotto controllo.</h1>
    ${renderCatalogWarning()}
    <section class="summary-row">
      <div class="summary-card">
        <p class="summary-label">Le tue prossime scadenze</p>
        <p class="summary-count">${active.length} da gestire</p>
        <div class="summary-foot"><span class="dot"></span>${escapeHtml(alertText)}</div>
      </div>
      <div class="stat-card">
        <span class="stat-card-label">${icon('bell')} Entro i prossimi 7 giorni</span>
        <strong>${active.filter((deadline) => {
          const days = dayDifference(deadline.dueDate);
          return days >= 0 && days <= 7;
        }).length} <small style="font-size:12px;font-weight:600">scadenze</small></strong>
      </div>
    </section>
    <div class="section-heading">
      <div><h2>${escapeHtml(new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date()))}</h2><p>Seleziona un giorno per filtrare l’elenco</p></div>
      <button class="text-button" type="button" data-action="navigate" data-view="calendar">Apri calendario →</button>
    </div>
    ${dateStrip}
    <div class="section-heading">
      <div><h2>${escapeHtml(heading)}</h2><p>${shown.length} ${shown.length === 1 ? 'elemento' : 'elementi'}</p></div>
      <div class="toolbar">
        ${categoryFilter}${statusFilter}
        <button class="button button-primary" type="button" data-action="new-deadline">${icon('plus')}<span>Nuova</span></button>
      </div>
    </div>
    ${renderDeadlineList(shown)}
    ${renderInstallBanner()}`;
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
    const hasEvent = state.deadlines.some((deadline) => !deadline.archived && !deadline.completed && deadline.dueDate === iso);
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
  const completeLabel = deadline.completed ? 'Riapri scadenza' : 'Segna come fatta';
  const actionButtons = deadline.archived ? '' : `
    <div class="card-actions">
      <button class="card-action" type="button" data-action="${completeAction}" data-id="${escapeHtml(deadline.id)}" aria-label="${completeLabel}" title="${completeLabel}">${icon('check')}</button>
      <button class="card-action" type="button" data-action="edit-deadline" data-id="${escapeHtml(deadline.id)}" aria-label="Modifica ${escapeHtml(deadline.title)}" title="Modifica">${icon('edit')}</button>
      <button class="card-action" type="button" data-action="archive-deadline" data-id="${escapeHtml(deadline.id)}" aria-label="Archivia ${escapeHtml(deadline.title)}" title="Archivia">${icon('archive')}</button>
    </div>`;
  return `<article class="${classes.join(' ')}">
    <span class="date-icon">${icon('calendar')}<small>${escapeHtml(new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(date))}</small></span>
    <div><p class="deadline-title">${escapeHtml(deadline.title)}</p><p class="deadline-meta">${escapeHtml(categoryName(deadline.category))}${escapeHtml(recurrence)}${deadline.notes ? ` · ${escapeHtml(deadline.notes)}` : ''}</p></div>
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
  const activeDeadlines = state.deadlines.filter((deadline) => !deadline.archived);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const iso = dateToIso(date);
    const events = sortDeadlines(activeDeadlines.filter((deadline) => deadline.dueDate === iso));
    const classes = ['calendar-day'];
    if (date.getMonth() !== month) classes.push('outside');
    if (iso === dateToIso(dateOnly(new Date()))) classes.push('today');
    if (iso === selectedCalendarDate) classes.push('selected');
    return `<button class="${classes.join(' ')}" type="button" data-action="select-calendar-date" data-date="${iso}" aria-label="${escapeHtml(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}${events.length ? `, ${events.length} scadenze` : ''}">
      <span class="calendar-day-number">${date.getDate()}</span>
      <span class="calendar-events">${events.slice(0, 2).map((event) => `<span class="calendar-event${dayDifference(event.dueDate) < 0 && !event.completed ? ' overdue' : ''}">${escapeHtml(event.title)}</span>`).join('')}${events.length > 2 ? `<span class="calendar-event more">+${events.length - 2} altre</span>` : ''}</span>
    </button>`;
  }).join('');
  const selectedDeadlines = sortDeadlines(activeDeadlines.filter((deadline) => deadline.dueDate === selectedCalendarDate));
  return `
    <p class="eyebrow">PIANIFICA</p><h1 class="page-title">Calendario</h1>
    <p class="page-description">Una vista mensile di tutte le scadenze attive. Seleziona un giorno per vedere i dettagli.</p>
    <div class="calendar-header">
      <h2 class="calendar-title">${escapeHtml(monthName)}</h2>
      <div class="calendar-controls">
        <button class="icon-button" type="button" data-action="calendar-month" data-offset="-1" aria-label="Mese precedente">${icon('left')}</button>
        <button class="icon-button" type="button" data-action="calendar-month" data-offset="1" aria-label="Mese successivo">${icon('right')}</button>
      </div>
    </div>
    <div class="calendar-grid" role="grid" aria-label="${escapeHtml(monthName)}">
      ${['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((day) => `<span class="calendar-weekday" role="columnheader">${day}</span>`).join('')}
      ${cells}
    </div>
    <div class="calendar-legend"><span class="legend-item"><i class="legend-dot"></i>Scadenza</span><span class="legend-item"><i class="legend-dot late"></i>Scaduta</span></div>
    <div class="section-heading"><div><h2>${escapeHtml(formatDate(selectedCalendarDate, { weekday: 'long', day: 'numeric', month: 'long' }))}</h2><p>${selectedDeadlines.length} ${selectedDeadlines.length === 1 ? 'scadenza' : 'scadenze'}</p></div><button class="button button-primary" type="button" data-action="new-deadline" data-date="${selectedCalendarDate}">${icon('plus')}Aggiungi</button></div>
    ${renderDeadlineList(selectedDeadlines)}`;
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
  const projection = planner.ready ? calculateProjection() : null;
  return `
    <p class="eyebrow">GESTIONE DEL BUDGET</p><h1 class="page-title">Pianificazione</h1>
    <p class="page-description">Imposta il saldo disponibile e le entrate ricorrenti per stimare l'andamento dei prossimi 12 mesi, usando le scadenze inserite.</p>
    <div class="notice">${icon('info')} Le cifre di questa sezione restano solo in memoria temporanea: non sono salvate, cifrate o incluse nei backup e si cancellano ricaricando la pagina.</div>
    <form id="planner-form" class="settings-card planner-form">
      <h3>Situazione iniziale</h3>
      <div class="field-row">
        <label class="field"><span>Saldo disponibile (€)</span><input name="openingBalance" inputmode="decimal" required placeholder="es. 2.500,00" value="${planner.ready ? escapeHtml(formatCentsForInput(planner.openingBalanceCents)) : ''}"></label>
        <label class="field"><span>Riserva minima da non usare (€)</span><input name="reserve" inputmode="decimal" required placeholder="es. 500,00" value="${planner.ready ? escapeHtml(formatCentsForInput(planner.reserveCents)) : ''}"></label>
      </div>
      <button class="button button-primary" type="submit">${planner.ready ? 'Aggiorna proiezione' : 'Calcola proiezione'}</button>
    </form>
    ${planner.ready ? `
      <section class="settings-card income-panel">
        <h3>Entrate ricorrenti</h3>
        <p>Inserisci importi netti e giorno di accredito. Le entrate passate nel mese corrente non vengono conteggiate una seconda volta.</p>
        ${planner.incomes.length
          ? `<ul class="income-list">${planner.incomes.map((income) => `<li><span><strong>${escapeHtml(income.name)}</strong><small>${formatAmount(income.amountCents)} · giorno ${income.payDay} del mese</small></span><button class="text-button" type="button" data-action="remove-income" data-id="${escapeHtml(income.id)}" aria-label="Rimuovi ${escapeHtml(income.name)}">Rimuovi</button></li>`).join('')}</ul>`
          : '<p class="planner-empty">Nessuna entrata ricorrente inserita: la proiezione considera solo le scadenze.</p>'}
        <form id="income-form" class="income-form">
          <label class="field"><span>Descrizione</span><input name="name" maxlength="60" required placeholder="es. Stipendio"></label>
          <label class="field"><span>Importo netto (€)</span><input name="amount" inputmode="decimal" required placeholder="es. 1.500,00"></label>
          <label class="field"><span>Giorno accredito</span><select name="payDay">${Array.from({ length: 28 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('')}</select></label>
          <button class="button button-quiet" type="submit">${icon('plus')}Aggiungi entrata</button>
        </form>
      </section>
      <section class="planning-results">
        <div class="planning-highlight">
          <span>Margine prudenziale stimato</span>
          <strong>${formatAmount(Math.max(0, projection.lowestBalanceCents - planner.reserveCents))}</strong>
          <small>Saldo minimo previsto meno la riserva impostata</small>
        </div>
        <div class="notice">${icon('info')} Stima indicativa basata solo su scadenze attive con importo e sulle entrate che hai inserito. Le scadenze arretrate sono conteggiate come uscite immediate. Non considera spese quotidiane, variazioni di importo o movimenti non registrati e non è consulenza finanziaria.</div>
        ${projection.unpriced.length || projection.skipped.length
          ? `<div class="notice warning">${icon('info')} ${projection.unpriced.length ? `Importo non inserito: ${projection.unpriced.map(escapeHtml).join(', ')}. ` : ''}${projection.skipped.length ? `Non proiettate per data troppo lontana o ricorrenza oltre il limite di calcolo: ${projection.skipped.map(escapeHtml).join(', ')}.` : ''}</div>`
          : ''}
        ${projection.lowestBalanceCents < planner.reserveCents
          ? `<div class="notice error">${icon('info')} In base ai dati inseriti, la proiezione scende sotto la riserva minima il ${formatDate(projection.lowestDate, { day: 'numeric', month: 'long', year: 'numeric' })}. Verifica le cifre: non è una previsione certa.</div>`
          : ''}
        <div class="section-heading"><div><h2>Proiezione mensile</h2><p>Saldo stimato a fine mese, in base ai movimenti registrati</p></div></div>
        <div class="projection-table-wrap"><table class="projection-table">
          <thead><tr><th>Mese</th><th>Entrate</th><th>Scadenze</th><th>Saldo previsto</th><th>Margine vs riserva</th></tr></thead>
          <tbody>${projection.months.map((month) => `<tr><th scope="row">${escapeHtml(month.label)}</th><td>${formatAmount(month.incomeCents)}</td><td>${formatAmount(month.expensesCents)}</td><td>${formatAmount(month.endingBalanceCents)}</td><td class="${month.endingBalanceCents < planner.reserveCents ? 'negative' : ''}">${formatAmount(month.endingBalanceCents - planner.reserveCents)}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>` : ''}
    ${renderInstallBanner()}`;
}

function calculateProjection() {
  const today = dateOnly(new Date());
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 12, 0);
  const endDate = dateToIso(lastDay);
  const events = [];
  const unpriced = new Set();
  const skipped = new Set();
  const todayIso = dateToIso(today);

  for (const deadline of state.deadlines) {
    if (deadline.archived || deadline.completed) continue;
    let dueDate = deadline.dueDate;
    if (dueDate < todayIso) {
      if (deadline.amountCents > 0) {
        events.push({
          date: todayIso,
          amountCents: -deadline.amountCents,
          label: `${deadline.title} (arretrata)`,
        });
      } else {
        unpriced.add(deadline.title);
      }
      if (deadline.recurrenceMonths === 0) continue;
      let iterations = 0;
      while (dueDate < todayIso && iterations < 1200) {
        dueDate = addMonthsClamped(dueDate, deadline.recurrenceMonths);
        iterations += 1;
      }
      if (dueDate < todayIso) {
        skipped.add(deadline.title);
        continue;
      }
    }
    if (dueDate < todayIso || dueDate > endDate) continue;
    if (!deadline.amountCents) unpriced.add(deadline.title);
    let occurrences = 0;
    while (dueDate <= endDate && occurrences < 13) {
      if (deadline.amountCents > 0) {
        events.push({
          date: dueDate,
          amountCents: -deadline.amountCents,
          label: deadline.title,
        });
      }
      if (!deadline.recurrenceMonths) break;
      dueDate = addMonthsClamped(dueDate, deadline.recurrenceMonths);
      occurrences += 1;
    }
    if (occurrences >= 13 && dueDate <= endDate) skipped.add(deadline.title);
  }

  for (const income of planner.incomes) {
    for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
      const month = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
      const incomeDate = dateToIso(new Date(month.getFullYear(), month.getMonth(), income.payDay));
      if (incomeDate >= dateToIso(today) && incomeDate <= endDate) {
        events.push({ date: incomeDate, amountCents: income.amountCents, label: income.name });
      }
    }
  }

  events.sort((left, right) => left.date.localeCompare(right.date));
  const months = [];
  let balance = planner.openingBalanceCents;
  let lowestBalanceCents = balance;
  let lowestDate = dateToIso(today);
  let eventIndex = 0;
  for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const monthKey = `${firstOfMonth.getFullYear()}-${String(firstOfMonth.getMonth() + 1).padStart(2, '0')}`;
    const monthEnd = dateToIso(new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0));
    let incomeCents = 0;
    let expensesCents = 0;
    while (eventIndex < events.length && events[eventIndex].date <= monthEnd) {
      const event = events[eventIndex];
      balance += event.amountCents;
      if (event.amountCents > 0) incomeCents += event.amountCents;
      else expensesCents -= event.amountCents;
      if (balance < lowestBalanceCents) {
        lowestBalanceCents = balance;
        lowestDate = event.date;
      }
      eventIndex += 1;
    }
    const monthDate = new Date(`${monthKey}-01T00:00:00`);
    months.push({
      label: new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(monthDate),
      incomeCents,
      expensesCents,
      endingBalanceCents: balance,
    });
  }
  return {
    months,
    lowestBalanceCents,
    lowestDate,
    unpriced: [...unpriced],
    skipped: [...skipped],
  };
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
    return `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a><span>${escapeHtml(label)} · ${escapeHtml(dateLabel)}</span>${changePreview}</li>`;
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

function renderBenefits() {
  const staleProgramCount = bonusSearch.searched
    ? bonusCatalog.filter((program) => !program.lastVerifiedAt
      || dayDifference(program.lastVerifiedAt) < 0
      || dayDifference(program.lastVerifiedAt) > 90).length
    : 0;
  const matchingPrograms = bonusSearch.searched && !bonusCatalogError
    ? bonusCatalog.filter((program) => {
      const today = dateToIso(dateOnly(new Date()));
      const daysSinceVerification = program.lastVerifiedAt ? dayDifference(program.lastVerifiedAt) : Number.POSITIVE_INFINITY;
      const regionMatches = program.scope === 'nazionale'
        || (program.region && program.region === bonusSearch.region);
      const municipalityMatches = program.scope !== 'comunale'
        || (program.municipality && program.municipality.trim().toLocaleLowerCase('it-IT')
          === bonusSearch.municipality.trim().toLocaleLowerCase('it-IT'));
      const iseeMatches = program.iseeMaxCents === null
        || (bonusSearch.iseeCents !== null && bonusSearch.iseeCents <= program.iseeMaxCents);
      const dateMatches = (!program.startsAt || program.startsAt <= today)
        && (!program.endsAt || program.endsAt >= today);
      return daysSinceVerification >= 0 && daysSinceVerification <= 90
        && regionMatches && municipalityMatches && iseeMatches && dateMatches;
    })
    : [];
  return `
    <p class="eyebrow">SUPPORTO ALLE FAMIGLIE</p><h1 class="page-title">Bonus e agevolazioni</h1>
    <p class="page-description">Indica il territorio e, se disponibile, l'ISEE per consultare le misure nazionali verificate e le opportunità locali raccolte. Se non inserisci l'ISEE, compariranno solo le misure senza una soglia ISEE dichiarata. Il risultato è un orientamento, non una verifica automatica dei requisiti.</p>
    <div class="notice warning">${icon('info')} L'ISEE da solo non determina il diritto a un beneficio: possono servire altri requisiti, domande entro scadenza e graduatorie. I risultati sono solo piste da verificare, non attestazioni di idoneità.</div>
    <form id="benefits-form" class="settings-card benefits-form">
      <h3>Parametri di ricerca</h3>
      <div class="field-row">
        <label class="field"><span>Regione</span><select name="region" required><option value="">Seleziona la regione</option>${ITALIAN_REGIONS.map((region) => `<option value="${escapeHtml(region)}" ${bonusSearch.region === region ? 'selected' : ''}>${escapeHtml(region)}</option>`).join('')}</select></label>
        <label class="field"><span>Comune</span><input name="municipality" maxlength="80" required placeholder="es. Bologna" value="${escapeHtml(bonusSearch.municipality)}"></label>
        <label class="field"><span>ISEE in euro (facoltativo, non viene salvato)</span><input name="isee" inputmode="decimal" placeholder="es. 15.000,00" value="${bonusSearch.iseeCents === null ? '' : escapeHtml(formatCentsForInput(bonusSearch.iseeCents))}"></label>
      </div>
      <button class="button button-primary" type="submit">Cerca agevolazioni</button>
      <p class="planner-empty">Se non hai un ISEE valido, lascia il campo vuoto: le misure con soglia ISEE non saranno mostrate. L'importo resta solo in memoria finché la pagina è aperta. Non caricare il documento ISEE.</p>
    </form>
    ${bonusCatalogError
      ? `<div class="notice error">${icon('info')} Catalogo non disponibile: ${escapeHtml(bonusCatalogError)}. Riprova quando il file dei dati è raggiungibile.</div>`
      : bonusCatalog.length === 0
        ? `<div class="empty-state"><span class="empty-icon">${icon('benefits')}</span><h3>Nessuna voce verificata nel catalogo</h3><p>Il catalogo integrato è attualmente vuoto: l'app non può verificare i bandi del tuo territorio. Questo non significa che non esistano agevolazioni. Il catalogo è un prototipo non esaustivo e richiede fonti ufficiali e aggiornamenti periodici.</p></div>`
        : `<p class="catalog-update">Catalogo non esaustivo · aggiornato ${bonusCatalogUpdatedAt ? escapeHtml(formatDate(bonusCatalogUpdatedAt, { day: 'numeric', month: 'long', year: 'numeric' })) : 'senza data dichiarata'}</p>`}
    ${staleProgramCount ? `<div class="notice warning">${icon('info')} ${staleProgramCount} ${staleProgramCount === 1 ? 'voce non è inclusa' : 'voci non sono incluse'} nei risultati perché la data di verifica è assente o supera 90 giorni.</div>` : ''}
    ${renderSourceMonitoring()}
    ${bonusSearch.searched && !bonusCatalogError && bonusCatalog.length > 0
      ? matchingPrograms.length
        ? `<section class="benefits-results"><h2>Possibili agevolazioni da approfondire</h2>${matchingPrograms.map((program) => `<article class="benefit-card"><h3>${escapeHtml(program.title)}</h3><p>${escapeHtml(program.description)}</p><p class="benefit-meta">${escapeHtml(program.scope)}${program.region ? ` · ${escapeHtml(program.region)}` : ''}${program.municipality ? ` · ${escapeHtml(program.municipality)}` : ''}${program.iseeMaxCents === null ? '' : ` · ISEE dichiarato fino a ${formatAmount(program.iseeMaxCents)}`}</p>${program.requirements.length ? `<p><strong>Requisiti ulteriori da verificare:</strong> ${program.requirements.map(escapeHtml).join('; ')}</p>` : ''}<p class="benefit-meta">Verificato il ${program.lastVerifiedAt ? escapeHtml(formatDate(program.lastVerifiedAt, { day: 'numeric', month: 'long', year: 'numeric' })) : 'data non indicata'}</p><a href="${escapeHtml(program.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(program.source.label)} — apri la scheda ufficiale</a></article>`).join('')}</section>`
        : `<div class="empty-state"><span class="empty-icon">${icon('benefits')}</span><h3>Nessuna corrispondenza nel catalogo</h3><p>Non sono state trovate voci attive che corrispondono ai parametri inseriti. Il catalogo non è esaustivo: controlla anche i siti istituzionali di INPS, Regione e Comune.</p></div>`
      : ''}
    ${renderInstallBanner()}`;
}

function openDeadlineForm(deadline = null, defaults = {}) {
  deadlineForm.reset();
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
  document.querySelector('#deadline-dialog-title').textContent = deadline ? 'Modifica scadenza' : 'Nuova scadenza';
  deadlineDialog.showModal();
  document.querySelector('#deadline-title').focus();
}

function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return dateOnly(result);
}

function formatCentsForInput(cents) {
  const euros = Math.floor(cents / 100);
  const remainder = String(cents % 100).padStart(2, '0');
  return `${euros},${remainder}`;
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
    amountCents,
    notes: document.querySelector('#deadline-notes').value.trim(),
    reminderDays,
    completed: existing?.completed ?? false,
    archived: false,
    catalogItemId: document.querySelector('#deadline-catalog-id').value || null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  validateDeadline(deadline);
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
  const deadline = state.deadlines.find((item) => item.id === id && !item.archived);
  if (!deadline) return;
  if (deadline.recurrenceMonths > 0) {
    const nextDueDate = addMonthsClamped(deadline.dueDate, deadline.recurrenceMonths);
    commit(() => {
      deadline.dueDate = nextDueDate;
      deadline.completed = false;
      deadline.updatedAt = localDateTime();
    }, `Completata. Prossima scadenza: ${formatDate(nextDueDate, { day: 'numeric', month: 'long', year: 'numeric' })}.`);
    return;
  }
  commit(() => {
    deadline.completed = true;
    deadline.updatedAt = localDateTime();
  }, 'Scadenza segnata come completata.');
}

function reopenDeadline(id) {
  const deadline = state.deadlines.find((item) => item.id === id && !item.archived);
  if (!deadline) return;
  commit(() => {
    deadline.completed = false;
    deadline.updatedAt = localDateTime();
  }, 'Scadenza riaperta.');
}

function archiveDeadline(id) {
  const deadline = state.deadlines.find((item) => item.id === id && !item.archived);
  if (!deadline) return;
  if (!window.confirm(`Archiviare “${deadline.title}”? Potrai recuperarla importando un backup precedente.`)) return;
  commit(() => {
    deadline.archived = true;
    deadline.updatedAt = localDateTime();
  }, 'Scadenza archiviata.');
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
    schemaVersion: 1,
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
  if (!backup || backup.app !== 'Scadenzario' || backup.schemaVersion !== 1) {
    throw new Error('Il file non è un backup Scadenzario supportato.');
  }
  if (!isValidProfile(backup.profile)) throw new Error('Il profilo nel backup non è valido.');
  if (!Array.isArray(backup.deadlines)) throw new Error('Il backup non contiene un elenco valido di scadenze.');
  const ids = new Set();
  backup.deadlines.forEach((deadline) => {
    validateDeadline(deadline);
    if (ids.has(deadline.id)) throw new Error(`Identificativo duplicato nel backup: ${deadline.id}`);
    ids.add(deadline.id);
  });
}

async function restoreBackup(file) {
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    validateBackup(backup);
    if (!window.confirm(`Il backup contiene ${backup.deadlines.length} scadenze. Sostituire tutti i dati attualmente presenti nel browser?`)) return;
    commit(() => {
      state.profile = backup.profile;
      state.deadlines = backup.deadlines;
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
  for (const deadline of state.deadlines) {
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
      break;
    case 'new-deadline':
      openDeadlineForm(null, button.dataset.date ? { dueDate: button.dataset.date } : {});
      break;
    case 'edit-deadline': {
      const deadline = state.deadlines.find((item) => item.id === id);
      if (deadline) openDeadlineForm(deadline);
      break;
    }
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
      render();
      break;
    case 'calendar-month':
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + Number(button.dataset.offset), 1);
      selectedCalendarDate = dateToIso(calendarMonth);
      render();
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
    case 'remove-income':
      planner.incomes = planner.incomes.filter((income) => income.id !== id);
      render();
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
  if (event.target.id === 'planner-form') {
    event.preventDefault();
    const formData = new FormData(event.target);
    const openingBalanceCents = parseAmountCents(String(formData.get('openingBalance') ?? ''));
    const reserveCents = parseAmountCents(String(formData.get('reserve') ?? ''));
    if (openingBalanceCents === null || reserveCents === null) {
      showToast('Inserisci importi validi e non negativi.', true);
      return;
    }
    planner.openingBalanceCents = openingBalanceCents;
    planner.reserveCents = reserveCents;
    planner.ready = true;
    render();
  }
  if (event.target.id === 'income-form') {
    event.preventDefault();
    const formData = new FormData(event.target);
    const name = String(formData.get('name') ?? '').trim();
    const amountCents = parseAmountCents(String(formData.get('amount') ?? ''));
    const payDay = Number(formData.get('payDay'));
    if (!name || name.length > 60 || amountCents === null || amountCents <= 0
      || !Number.isInteger(payDay) || payDay < 1 || payDay > 28) {
      showToast('Controlla descrizione, importo e giorno di accredito.', true);
      return;
    }
    planner.incomes.push({ id: makeId(), name, amountCents, payDay });
    render();
  }
  if (event.target.id === 'benefits-form') {
    event.preventDefault();
    const formData = new FormData(event.target);
    const region = String(formData.get('region') ?? '');
    const municipality = String(formData.get('municipality') ?? '').trim();
    const iseeInput = String(formData.get('isee') ?? '').trim();
    const iseeCents = iseeInput ? parseAmountCents(iseeInput) : null;
    if (!ITALIAN_REGIONS.includes(region) || !municipality || municipality.length > 80
      || (iseeInput && iseeCents === null)) {
      showToast('Inserisci una regione e un comune validi; se indichi l’ISEE, controlla il formato dell’importo.', true);
      return;
    }
    bonusSearch = { searched: true, region, municipality, iseeCents };
    currentView = 'benefits';
    render();
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

function validateMonitoringStatus(monitoring) {
  const allowedModes = ['github-actions', 'local-server', 'not-configured'];
  const allowedStatuses = ['baseline', 'changed', 'error', 'unchecked', 'unchanged'];
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
