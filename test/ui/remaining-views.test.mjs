import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { harness, deadline, readyState, savedState } from './harness.mjs';
const root = new URL('../../', import.meta.url);
const [css, source, index] = await Promise.all(['styles.css', 'app-source.js', 'index.html'].map(f => readFile(new URL(f, root), 'utf8')));
const body = index.slice(index.indexOf('<body>'));
const dated = (overrides = {}) => ({ ...deadline, dueDate: '2026-11-18', ...overrides });
const filter = (h, name, value) => h.api.handleChange({ target: { matches: () => true, dataset: { filter: name }, value } });
const income = (overrides = {}) => ({ ...dated(), id: 'salary', name: 'Entrata test', ...overrides });
const rowsOf = (html, tableIndex) => [...html.matchAll(/<table class="projection-table">([\s\S]*?)<\/table>/g)][tableIndex][1];

// Declaration/cascade safeguards, not browser rendering or a viewport simulator.
function rules(text, env) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, ''); const found = [];
  for (let cursor = 0; cursor < text.length;) {
    const open = text.indexOf('{', cursor); if (open < 0) break;
    let close = open + 1, depth = 1;
    while (depth) { assert.ok(close < text.length); if (text[close] === '{') depth++; if (text[close] === '}') depth--; close++; }
    const selector = text.slice(cursor, open).trim(), contents = text.slice(open + 1, close - 1);
    if (selector.startsWith('@media')) {
      const max = selector.match(/max-width:\s*(\d+)px/), min = selector.match(/min-width:\s*(\d+)px/);
      if ((!max || env.width <= +max[1]) && (!min || env.width >= +min[1]) && (!selector.includes('prefers-color-scheme: dark') || env.dark) && (!selector.includes('prefers-reduced-motion: reduce') || env.reduced)) found.push(...rules(contents, env));
    } else {
      const declarations = contents.split(';').filter(s => s.trim()).map(s => { const i = s.indexOf(':'); assert.ok(i > 0); return [s.slice(0, i).trim(), s.slice(i + 1).trim()]; });
      for (const item of selector.split(',')) found.push({ selector: item.trim(), declarations });
    }
    cursor = close;
  }
  return found;
}
const weight = s => (s.match(/#/g) ?? []).length * 100 + (s.match(/\.|:(?!:)|\[/g) ?? []).length * 10 + (s.match(/(?:^|\s|\+)(?:[a-z][\w-]*)/g) ?? []).length;
function style(env, selectors) {
  const values = {}, weights = {};
  for (const rule of rules(css, env)) if ([':root', ...selectors].includes(rule.selector)) for (const [key, value] of rule.declarations) if (weight(rule.selector) >= (weights[key] ?? -1)) { values[key] = value; weights[key] = weight(rule.selector); }
  const resolve = s => s.replace(/var\((--[\w-]+)\)/g, (_, key) => { assert.ok(values[key], key); return resolve(values[key]); });
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, resolve(v)]));
}

test('E: filters retain exclusive periods and full civil-date calendar controls', () => {
  const h = harness(readyState([dated(), dated({ id: 'later', title: 'Domani', dueDate: '2026-11-19' })]));
  let html = h.api.renderCalendar();
  assert.match(html, /class="agenda-page"/); assert.match(html, /role="group" aria-label="Periodo esclusivo"/);
  assert.match(html, /role="group" aria-label="Categoria e stato"/);
  assert.equal((html.match(/data-action="select-calendar-date"/g) ?? []).length, 42);
  assert.match(html, /data-date="2026-11-18" aria-pressed="true" aria-label="mercoledì 18 novembre 2026, 1 scadenze"/);
  for (const period of ['today', 'upcoming', 'overdue', 'all']) {
    h.click('agenda-period', null, { period }); html = h.api.renderCalendar();
    assert.match(html, new RegExp(`data-period="${period}" aria-pressed="true"`));
    assert.equal((html.match(/data-action="agenda-period"[^>]*aria-pressed="true"/g) ?? []).length, 1);
  }
});

test('E: calendar has a named keyboard-scrolling region, without false ARIA grid roles', () => {
  const html = harness(readyState()).api.renderCalendar();
  assert.match(html, /class="calendar-grid-scroll" tabindex="0" role="region" aria-label="Calendario mensile scorrevole" aria-describedby="calendar-scroll-help"/);
  assert.match(html, /id="calendar-scroll-help"/); assert.doesNotMatch(html, /role="grid"|role="gridcell"/);
  for (const direction of ['precedente', 'successivo']) assert.ok(html.includes(`aria-label="Mese ${direction}"`));
});

test('E: period/category/status filter selections retain hidden history and recoverable cancellation', () => {
  const h = harness(readyState([
    dated({ id: 'today', title: 'Casa oggi' }), dated({ id: 'auto', title: 'Auto oggi', category: 'auto' }),
    dated({ id: 'future', title: 'Casa futura', dueDate: '2026-12-01' }), dated({ id: 'arch', title: 'Archiviata', archived: true }),
    dated({ id: 'cancel', title: 'Annullata', overrides: { '2026-11-18': { cancelled: true } } }),
  ]));
  filter(h, 'category', 'casa');
  let list = h.api.renderCalendar().split('</details><div class="section-heading">')[1];
  assert.match(list, /Casa oggi/); assert.doesNotMatch(list, /Casa futura|Auto oggi|Archiviata|Annullata/);
  h.click('agenda-period', null, { period: 'all' }); filter(h, 'status', 'cancelled');
  list = h.api.renderCalendar().split('</details><div class="section-heading">')[1];
  assert.match(list, /Annullata/); assert.match(list, /data-action="restore-occurrence" data-id="cancel@2026-11-18"/);
  filter(h, 'status', 'archived');
  assert.match(h.api.renderCalendar(), /data-action="restore-deadline" data-id="arch"/);
});

test('E: expected/actual cash detail still distinguishes intraday minimum from closing balance', () => {
  const data = readyState([dated({ amountCents: 60000 })]); data.planner.incomes = [income({ amountCents: 80000 })];
  const h = harness(data); h.click('calendar-mode', null, { mode: 'cash' }); h.click('select-calendar-date', null, { date: '2026-11-18' });
  const html = h.api.renderCalendar();
  assert.match(html, /class="calendar-day[^\"]*below-reserve[^\"]*below-zero/);
  assert.match(html, /minimo intragiornaliero -100,00 €, sotto riserva/);
  assert.match(html, /Saldo a fine giornata<\/span><strong>700,00 €/);
  assert.match(html, /Minimo intragiornaliero prudenziale: <strong>-100,00 €/);
  assert.match(html, /Uscita prevista/); assert.match(html, /Entrata prevista/);
});

test('E: cash-only historic actuals never invent a past balance or double-apply to reference', () => {
  const data = readyState([{ ...deadline, overrides: { '2026-11-17': { actual: { date: '2026-10-31', amountCents: 12000 } } } }]);
  const h = harness(data); h.click('calendar-mode', null, { mode: 'cash' }); h.click('select-calendar-date', null, { date: '2026-10-31' });
  const html = h.api.renderCalendar();
  assert.match(html, /Pagamento effettivo/); assert.match(html, /saldo storico non stimabile/);
  assert.equal(h.api.currentRadar().projection.endingBalanceCents, 50000);
});

test('F: full Radar retains engine order and count; severity totals use existing classifications', () => {
  const h = harness(readyState(Array.from({ length: 12 }, (_, i) => ({ ...deadline, id: `late-${i}` }))));
  const items = h.api.currentRadar().items, html = h.api.renderRadar();
  assert.match(html, /class="radar-page"/); assert.match(html, /class="radar-overview"/);
  assert.equal((html.match(/class="radar-card"/g) ?? []).length, items.length);
  let position = -1;
  for (const item of items) { const next = html.indexOf(`data-id="${item.occurrenceId}"`, position + 1); assert.ok(next > position); position = next; }
  const overview = html.match(/<dl class="radar-overview"[\s\S]*?<\/dl>/)[0];
  assert.deepEqual([...overview.matchAll(/<dd>(\d+)<\/dd>/g)].map(m => +m[1]), [0, 1, 2].map(severity => items.filter(item => item.severity === severity).length));
  assert.doesNotMatch(html, /controlli superati|tutto sotto controllo/);
});

test('F: full Radar displays snapshot/override amounts while all actions retain occurrence identities', () => {
  const data = readyState([{ ...deadline, id: 'series@one', amountCents: 99000, overrides: { '2026-11-17': { notes: 'Eccezione protetta' } }, snapshots: { '2026-11-17': { title: 'Rata protetta', dueDate: '2026-11-17', cashDate: '2026-11-17', cashMode: 'same', amountCents: 42000 } } }]);
  const h = harness(data), html = h.api.renderRadar();
  assert.match(html, /420,00 €/); assert.doesNotMatch(html, /990,00 €/);
  assert.match(html, /data-action="record-deadline" data-id="series@one@2026-11-17"/);
  assert.match(html, /data-action="edit-deadline" data-id="series@one@2026-11-17"/);
});

test('F: full Radar decoration does not regenerate per item or truncate long lists', () => {
  const h = harness(readyState([{ ...deadline, dueDate: '1926-11-17', recurrenceMonths: 1, count: 1200 }]));
  h.resetGenerations();
  const html = h.api.renderRadar();
  assert.equal((html.match(/class="radar-card"/g) ?? []).length, 1);
  assert.equal((html.match(/<li><span>Scadenza:/g) ?? []).length, 1200, 'ogni occorrenza resta raggiungibile');
  assert.equal(h.generationStats.calls, 0);
});

test('F: Planning reuses exact Home projection geometry, including same-day low', () => {
  const data = readyState([dated({ amountCents: 60000 })]); data.planner.incomes = [income({ amountCents: 80000 })];
  const h = harness(data), html = h.api.renderPlanning(), home = h.api.renderHome();
  assert.match(html, /class="planning-page"/); assert.match(html, /class="planning-inputs"/);
  const path = t => t.match(/class="forecast-line" d="([^"]+)"/)[1];
  assert.equal(path(html), path(home));
  assert.equal((path(html).match(/ V /g) ?? []).length, h.api.currentRadar().projection.rows.length);
  assert.match(html, /Minimo dal saldo di riferimento/); assert.match(html, /-100,00 €/);
  assert.match(html, /uscite prima delle entrate dello stesso giorno/);
});

test('F: Planning tables keep every engine period and event, with keyboard-scrolling regions', () => {
  const data = readyState([dated({ recurrenceMonths: 1, count: 12 })]); data.planner.incomes = [income({ amountCents: 30000, recurrenceMonths: 1 })];
  const h = harness(data), p = h.api.currentRadar().projection, html = h.api.renderPlanning();
  assert.equal((rowsOf(html, 0).match(/<th scope="row">/g) ?? []).length, p.months.length);
  assert.equal((rowsOf(html, 1).match(/<th scope="row">/g) ?? []).length, p.rows.length);
  for (const name of ['Riepilogo mensile', 'Movimenti applicati']) assert.match(html, new RegExp(`class="projection-table-wrap" tabindex="0" role="region" aria-label="${name}, tabella scorrevole"`));
  assert.equal(p.months.length, 13); assert.match(html, /Ultimo mese eventualmente parziale/);
  assert.match(html, /Non è consulenza finanziaria/);
});

test('F: Planning with missing configuration shows no substitute chart or fake zero balance', () => {
  const h = harness(savedState()), html = h.api.renderPlanning();
  assert.match(html, /Imposta il punto di partenza/); assert.match(html, /id="planner-form"/);
  assert.doesNotMatch(html, /class="forecast-chart|Saldo finale previsto:|class="projection-table"/);
  h.click('configure-plan'); assert.equal(h.node('#planner-form input[name="openingBalance"]').focused, true);
  h.click('planning-results'); assert.equal(h.node('#planning-results').focused, true);
});

test('F: new chart keeps historical minima distinct from current balance and future-only forecasts', () => {
  const data = readyState([{ ...deadline, overrides: { '2026-11-17': { actual: { date: '2026-11-10', amountCents: 60000 } } } }]);
  data.planner.incomes = [income({ amountCents: 90000 })];
  const h = harness(data), html = h.api.renderPlanning();
  assert.equal(h.api.currentRadar().projection.minimumDate, '2026-11-10');
  assert.match(html, /Minimo prudenziale -100,00 € il 10 nov 2026/);
  assert.match(html, /Dal saldo di riferimento, anche precedente a oggi/);
  assert.doesNotMatch(html, /Saldo oggi|Prossimi 12 mesi|controlli superati/);
});

test('F: cancelled series and occurrences retain management, restore and actual-edit controls', () => {
  const data = readyState([dated({ overrides: { '2026-11-18': { cancelled: true } } })]);
  data.planner.incomes = [income({ overrides: { '2026-11-18': { actual: { date: '2026-11-17', amountCents: 10000 } } } })];
  const h = harness(data), html = h.api.renderPlanning();
  for (const action of ['restore-occurrence', 'edit-series', 'actual-income', 'undo-income', 'edit-income-series', 'remove-income']) assert.ok(html.includes(`data-action="${action}"`), action);
  assert.match(html, /data-id="x@2026-11-18"/); assert.match(html, /data-id="salary@2026-11-18"/);
  assert.match(html, /Occorrenze annullate · recuperabili/);
});

test('G: More cards keep tools, original destinations and local descriptions', () => {
  const h = harness(readyState([])), html = h.api.renderMore();
  assert.match(html, /class="more-page"/);
  assert.equal((html.match(/class="settings-card tool-card"/g) ?? []).length, 3);
  for (const view of ['benefits', 'catalog', 'profile']) assert.match(html, new RegExp(`data-action="navigate" data-view="${view}"`));
  assert.match(html, /senza entrate automatiche/); assert.match(html, /esportazione e ripristino JSON/);
  assert.equal((html.match(/class="tool-icon" aria-hidden="true"/g) ?? []).length, 3);
});

test('G: Profile keeps exact backup/privacy warnings, permission and install behavior', () => {
  const h = harness(readyState([])); h.click('navigate', null, { view: 'profile' });
  const html = h.node('#app').innerHTML;
  assert.match(html, /class="profile-page"/); assert.match(html, /class="settings-card backup-card"/);
  for (const action of ['export-backup', 'choose-backup', 'open-profile-dialog']) assert.ok(html.includes(`data-action="${action}"`));
  assert.match(html, /id="notification-switch"/);
  assert.match(html, /non sono cifrati né sincronizzati/); assert.match(html, /Il ripristino sostituisce le scadenze presenti/);
  assert.match(html, /le loro modifiche successive non sono unite automaticamente ai dati nuovi/);
  assert.doesNotMatch(html, /data-action="install-app"/);
});

test('G: profile and titles are escaped in every new view; rendering/export preserve data', async () => {
  const data = readyState([dated({ title: '<img src=x onerror="bad">', notes: '<script>bad</script>' })]); data.profile.name = '<img src=x>';
  const h = harness(data), state = JSON.stringify(h.api.state), storage = [...h.storage];
  for (const view of ['calendar', 'planning', 'radar', 'more', 'profile', 'catalog', 'benefits']) {
    h.click('navigate', null, { view });
    assert.doesNotMatch(h.node('#app').innerHTML, /<img src=x|<script>bad/);
  }
  assert.equal(JSON.stringify(h.api.state), state); assert.deepEqual([...h.storage], storage);
  h.click('export-backup'); const exported = JSON.parse(await h.blob().text());
  assert.equal(exported.schemaVersion, 3); assert.equal(exported.deadlines[0].title, data.deadlines[0].title);
});

test('G: catalog remains explicit opt-in and escapes item titles, notes and identifiers', () => {
  const h = harness(readyState([]));
  h.evaluate(`catalog = [{id:'template',profili:['single'],titolo:'<img src=x>',categoria:'casa',mesi:12,nota:'<script>bad</script>'}]; catalogError=null;`);
  const html = h.evaluate('renderCatalog()');
  assert.match(html, /class="catalog-page"/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img|<script>bad/);
  assert.match(html, /data-action="use-catalog-item" data-id="template"/);
  assert.equal(h.api.state.deadlines.length, 0);
  h.click('use-catalog-item', 'template');
  assert.equal(h.node('#deadline-dialog').open, true); assert.equal(h.api.state.deadlines.length, 0);
});

test('G: benefits filtering stays national, active, recently verified and informational only', () => {
  const h = harness(readyState([]));
  const base = { id: 'valid', title: 'MISURA_TEST_VALIDA', description: '<img src=x>', scope: 'nazionale', requirements: [], source: { url: '#fonte-test', label: 'Fonte di test' }, lastVerifiedAt: '2026-11-18', startsAt: null, endsAt: null };
  const programs = [base, { ...base, id: 'old', title: 'MISURA_TEST_VECCHIA', lastVerifiedAt: '2025-01-01' }, { ...base, id: 'local', title: 'MISURA_TEST_REGIONALE', scope: 'regionale' }, { ...base, id: 'expired', title: 'MISURA_TEST_SCADUTA', endsAt: '2026-01-01' }];
  h.evaluate(`bonusCatalog=${JSON.stringify(programs)};bonusCatalogError=null;`);
  const html = h.evaluate('renderBenefits()');
  assert.match(html, /class="benefits-page"/); assert.match(html, /MISURA_TEST_VALIDA/);
  assert.doesNotMatch(html, /MISURA_TEST_VECCHIA|MISURA_TEST_REGIONALE|MISURA_TEST_SCADUTA|<img src=x/);
  assert.match(html, /non verifica l’idoneità/); assert.match(html, /Non inserire qui dati o documenti ISEE/);
  assert.doesNotMatch(html, /data-action="(?:new-deadline|approve-staging|actual-income)"/);
});

test('G: native dialogs keep all IDs, help connections, alert errors and explicit close/save buttons', () => {
  for (const [id, title, description] of [['deadline-dialog', 'deadline-dialog-title', 'deadline-dialog-help'], ['profile-dialog', 'profile-dialog-title', 'profile-dialog-help'], ['movement-dialog', 'movement-title', 'movement-description']]) {
    const dialog = body.match(new RegExp(`<dialog id="${id}"([\\s\\S]*?)<\\/dialog>`))[0];
    assert.ok(dialog.includes(`aria-labelledby="${title}" aria-describedby="${description}"`));
    assert.ok(dialog.includes(`id="${description}"`));
    assert.match(dialog, /data-close-dialog aria-label="Chiudi"/); assert.match(dialog, /type="button" data-close-dialog>Annulla/);
    assert.match(dialog, /type="submit"/); assert.match(dialog, /class="form-error"[^>]*role="alert"/);
    assert.doesNotMatch(dialog, /role="alertdialog"|aria-modal="false"/);
  }
  assert.match(body, /<h3 class="dialog-section-title">Scadenza e ricorrenza/);
  assert.match(body, /Scadenza e data prevista di cassa sono distinte/);
  assert.match(body, /id="deadline-cash-field" hidden/); assert.match(body, /id="deadline-cash-date" type="date" disabled/);
  assert.match(body, /id="deadline-end-mode"/); assert.match(body, /id="deadline-count-field" hidden/);
});

test('G: error/help/control content is not hidden by new presentation hooks or picker calls', () => {
  const layer = css.slice(css.indexOf('/* Phases E + F + G'));
  assert.doesNotMatch(layer, /\.form-error[^{}]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(layer, /dialog[^{}]*\{[^}]*display:\s*(?:grid|flex)/);
  assert.doesNotMatch(source, /showPicker\(/);
  assert.doesNotMatch(layer, /https?:|@import|url\(/);
  assert.match(layer, /\.dialog-form input, \.dialog-form select, \.dialog-form textarea \{ scroll-margin-block: 100px/);
});

for (const width of [320, 375, 768, 1024, 1280]) for (const dark of [false, true]) {
  test(`E+F+G: static ${width}px ${dark ? 'dark' : 'light'} remaining-view safeguards (not rendered QA)`, () => {
    const env = { width, dark }, mobile = width <= 760, tokens = style(env, []);
    const scroll = style(env, ['.calendar-grid-scroll']), grid = style(env, ['.calendar-grid']), day = style(env, ['.calendar-day']);
    assert.equal(scroll['overflow-x'], 'auto'); assert.equal(scroll['max-inline-size'], '100%');
    assert.equal(grid['min-inline-size'], '344px'); assert.equal(day['min-inline-size'], '44px');
    assert.equal(day['min-block-size'], mobile ? '64px' : '76px');
    assert.equal(style(env, ['.calendar-day.below-zero'])['border-style'], 'double');
    assert.equal(style(env, ['.period-filters .button']).flex, mobile ? '1 1 120px' : '1 1 120px');
    assert.equal(style(env, ['.radar-overview'])['grid-template-columns'], mobile ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))');
    assert.equal(style(env, ['.more-menu'])['grid-template-columns'], width <= 1024 ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))');
    assert.equal(style(env, ['.profile-page .profile-panel'])['grid-template-columns'], width <= 1024 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))');
    for (const selector of ['.field input', '.field select', '.field textarea']) assert.equal(style(env, [selector])['font-size'], '16px');
    for (const selector of ['.dialog-heading', '.dialog-actions']) {
      const value = style(env, [selector]); assert.equal(value.position, 'sticky'); assert.equal(value.background, tokens['--surface']);
    }
    assert.equal(style(env, ['.dialog-actions'])['inset-block-end'], '0');
    assert.equal(style(env, ['.dialog-form > .form-error'])['scroll-margin-block'], '100px');
    if (mobile) {
      const dialog = style(env, ['.dialog']); assert.equal(dialog['inset-block'], 'auto 0'); assert.equal(dialog['max-block-size'], 'calc(100dvh - 12px)');
      assert.match(style(env, ['.dialog-form']).padding, /safe-area-inset-bottom/);
      assert.match(style(env, ['.toast'])['inset-block-end'], /76px.*56px.*safe-area-inset-bottom/);
      assert.equal(style(env, ['.planning-page .planner-form .field-row'])['grid-template-columns'], 'minmax(0, 1fr)');
      assert.equal(style(env, ['.catalog-page .catalog-item'])['grid-template-columns'], 'minmax(0, 1fr)');
    }
    for (const rule of rules(css.slice(css.indexOf('/* Phases E + F + G')), env)) if (/^(?:html|body|\.layout|\.content|\.agenda-page|\.planning-page|\.radar-page)$/.test(rule.selector)) for (const [name, value] of rule.declarations) if (['overflow', 'overflow-x'].includes(name)) assert.notEqual(value, 'hidden');
  });
}
