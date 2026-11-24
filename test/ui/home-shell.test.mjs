import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { harness, deadline, readyState, savedState } from './harness.mjs';

const root = new URL('../../', import.meta.url);
const css = await readFile(new URL('styles.css', root), 'utf8');
const source = await readFile(new URL('app-source.js', root), 'utf8');
const geometry = h => JSON.parse(h.evaluate('JSON.stringify(forecastGeometry(currentRadar()))'));
const future = (overrides = {}) => ({ ...deadline, dueDate: '2026-12-01', ...overrides });
const income = (overrides = {}) => ({ ...future(), id: 'salary', name: 'Stipendio', ...overrides });

// Tests below inspect VM/DOM declarations and geometry, NOT rendered browser layout.
function rules(text, env) {
  const found = [];
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  for (let cursor = 0; cursor < text.length;) {
    const open = text.indexOf('{', cursor);
    if (open < 0) break;
    let close = open + 1, depth = 1;
    while (depth) {
      assert.ok(close < text.length, 'Balanced CSS');
      if (text[close] === '{') depth++;
      if (text[close] === '}') depth--;
      close++;
    }
    const selector = text.slice(cursor, open).trim(), body = text.slice(open + 1, close - 1);
    if (selector.startsWith('@media')) {
      const maximum = selector.match(/max-width:\s*(\d+)px/), minimum = selector.match(/min-width:\s*(\d+)px/);
      if ((!maximum || env.width <= +maximum[1]) && (!minimum || env.width >= +minimum[1]) && (!selector.includes('prefers-color-scheme: dark') || env.dark) && (!selector.includes('prefers-reduced-motion: reduce') || env.reduced)) found.push(...rules(body, env));
    } else {
      const declarations = body.split(';').filter(v => v.trim()).map(v => {
        const colon = v.indexOf(':'); assert.ok(colon > 0, v);
        return [v.slice(0, colon).trim(), v.slice(colon + 1).trim()];
      });
      for (const item of selector.split(',')) found.push({ selector: item.trim(), declarations });
    }
    cursor = close;
  }
  return found;
}
const specificity = s => (s.match(/#/g) ?? []).length * 100 + (s.match(/\.|:(?!:)|\[/g) ?? []).length * 10 + (s.match(/(?:^|\s|\+)(?:[a-z][\w-]*)/g) ?? []).length;
function style(env, selectors) {
  const values = {}, weight = {};
  for (const rule of rules(css, env)) if ([':root', ...selectors].includes(rule.selector)) {
    for (const [key, value] of rule.declarations) if (specificity(rule.selector) >= (weight[key] ?? -1)) {
      weight[key] = specificity(rule.selector); values[key] = value;
    }
  }
  const resolve = v => v.replace(/var\((--[\w-]+)\)/g, (_, key) => { assert.ok(values[key], key); return resolve(values[key]); });
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, resolve(value)]));
}

test('C: all routes retain four-item navigation, active state, profile and create actions', () => {
  const h = harness(readyState([]));
  for (const [view, parent] of [['home', 'home'], ['radar', 'home'], ['calendar', 'calendar'], ['planning', 'planning'], ['more', 'more'], ['profile', 'more'], ['catalog', 'more'], ['benefits', 'more']]) {
    h.click('navigate', undefined, { view });
    const html = h.node('#app').innerHTML;
    const navs = [...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)].map(m => m[1]);
    assert.equal(navs.length, 2);
    for (const nav of navs) {
      assert.equal((nav.match(/data-action="navigate"/g) ?? []).length, 4);
      assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1);
      assert.match(nav, new RegExp(`data-view="${parent}" aria-current="page"`));
      for (const label of ['Home', 'Agenda', 'Planning', 'Altro']) assert.ok(nav.includes(`>${label}</span>`));
    }
    assert.match(html, /class="brand mobile-brand"/);
    assert.match(html, /class="button button-primary topbar-create"[^>]*data-action="new-deadline"/);
    assert.match(html, /class="button button-primary mobile-create"[^>]*data-action="new-deadline" aria-label="Nuova scadenza"/);
    assert.match(html, /data-action="open-profile-dialog" aria-label="Modifica profilo di Test"/);
  }
});

test('C: create/profile/navigation controls use existing handlers without data mutation', () => {
  const h = harness(readyState([]));
  const state = JSON.stringify(h.api.state), storage = [...h.storage];
  h.click('new-deadline'); assert.equal(h.node('#deadline-dialog').open, true);
  h.node('#deadline-dialog').close();
  h.click('open-profile-dialog'); assert.equal(h.node('#profile-dialog').open, true);
  for (const view of ['calendar', 'planning', 'more', 'home']) h.click('navigate', undefined, { view });
  assert.equal(JSON.stringify(h.api.state), state); assert.deepEqual([...h.storage], storage);
});

test('C: local date/profile content is escaped and onboarding has no authenticated shell', () => {
  const data = readyState([]); data.profile.name = '<img src=x> & "';
  const h = harness(data); h.api.render();
  const html = h.node('#app').innerHTML;
  assert.match(html, /<time class="topbar-label" datetime="2026-11-18">mercoledì 18 novembre 2026<\/time>/);
  assert.match(html, /aria-label="Modifica profilo di &lt;img src=x&gt; &amp; &quot;"/);
  assert.doesNotMatch(html, /<img src=x/);
  const empty = harness(); empty.api.render();
  assert.match(empty.node('#app').innerHTML, /Crea il tuo profilo/);
  assert.doesNotMatch(empty.node('#app').innerHTML, /mobile-bottom-nav|mobile-create|topbar-create/);
});

test('D: graph uses the engine rows in the exact order and retains same-day trough', () => {
  const data = readyState([future({ amountCents: 60000 })]);
  data.planner.incomes = [income({ amountCents: 80000 })];
  const h = harness(data), radar = h.api.currentRadar(), p = radar.projection, g = geometry(h);
  assert.deepEqual(p.rows.map(r => r.balanceCents), [-10000, 70000]);
  assert.equal(p.minimumCents, -10000); assert.equal(p.minimumDate, '2026-12-01');
  const vertices = [...g.path.matchAll(/H ([\d.-]+) V ([\d.-]+)/g)];
  assert.equal(vertices.length, p.rows.length);
  assert.equal(vertices[0][1], vertices[1][1], 'No invented time-of-day');
  assert.ok(+vertices[0][2] > +vertices[1][2], 'Outflow low precedes inflow');
  assert.equal(g.minimumX, vertices[0][1]); assert.equal(g.minimumY, vertices[0][2]);
  const html = h.api.renderHome();
  assert.match(html, /Minimo prudenziale -100,00 € il 1 dic 2026/);
  assert.match(html, /Prima sotto riserva<\/dt><dd>1 dic 2026/);
  assert.match(html, /Prima sotto zero<\/dt><dd>1 dic 2026/);
  assert.doesNotMatch(g.path, /NaN|Infinity/);
});

test('D: every forecast row is plotted; no averaging, monthly downsampling or curve smoothing', () => {
  const data = readyState([future({ id: 'a', recurrenceMonths: 1, count: 12 }), future({ id: 'b', dueDate: '2026-12-15', amountCents: 20000, recurrenceMonths: 1, count: 10 })]);
  data.planner.incomes = [income({ amountCents: 40000, recurrenceMonths: 1 })];
  const h = harness(data), p = h.api.currentRadar().projection, g = geometry(h);
  assert.equal((g.path.match(/ V /g) ?? []).length, p.rows.length);
  assert.doesNotMatch(g.path, /[CQST]/);
  for (const value of [g.minimumX, g.minimumY, g.reserveY, g.zeroY]) assert.ok(Number.isFinite(+value));
});

test('D: historical low after reference remains visible and is not called a future/bank balance', () => {
  const data = readyState([{ ...deadline, overrides: { '2026-11-17': { actual: { date: '2026-11-10', amountCents: 60000 } } } }]);
  data.planner.incomes = [income({ dueDate: '2026-11-18', amountCents: 90000 })];
  const h = harness(data), p = h.api.currentRadar().projection, g = geometry(h), html = h.api.renderHome();
  assert.equal(p.minimumDate, '2026-11-10'); assert.equal(p.minimumCents, -10000);
  assert.equal(g.minimumX, g.path.match(/ H ([\d.]+) V/)[1]);
  assert.match(html, /Minimo dal saldo di riferimento/); assert.match(html, /-100,00 €/);
  assert.match(html, /anche precedenti a oggi/); assert.match(html, /Non è un saldo bancario/);
  assert.doesNotMatch(html, /Saldo oggi|Prossimi 12 mesi|3 su 4|controlli superati/);
});

test('D: actual before reference is absorbed once, and reference-date actual follows all/none', () => {
  const data = readyState([{ ...deadline, overrides: { '2026-11-17': { actual: { date: '2026-10-31', amountCents: 99900 } } } }]);
  let h = harness(data); assert.equal(h.api.currentRadar().projection.rows.length, 0);
  assert.equal((geometry(h).path.match(/ V /g) ?? []).length, 0);
  data.deadlines[0].overrides['2026-11-17'].actual.date = '2026-11-01';
  h = harness(data); assert.equal(h.api.currentRadar().projection.rows.length, 0);
  data.planner.sameDayActualsIncluded = false;
  h = harness(data); assert.equal(h.api.currentRadar().projection.rows.length, 1);
  assert.equal(h.api.currentRadar().projection.minimumCents, -49900);
  assert.equal((geometry(h).path.match(/ V /g) ?? []).length, 1);
});

test('D: unknown/late/archived/cancelled/completed forecasts do not become chart events', () => {
  const h = harness(readyState([
    future({ id: 'unknown', cashMode: 'unknown' }), { ...deadline, id: 'late' },
    future({ id: 'archived', archived: true }), future({ id: 'cancelled', overrides: { '2026-12-01': { cancelled: true } } }),
    future({ id: 'done', amountCents: 0, overrides: { '2026-12-01': { done: true } } }), future({ id: 'included' }),
  ]));
  const p = h.api.currentRadar().projection;
  assert.equal(p.rows.length, 1); assert.ok(p.warnings.length >= 2);
  assert.equal((geometry(h).path.match(/ V /g) ?? []).length, 1);
  assert.match(h.api.renderHome(), /Alcune uscite non sono incluse: il margine potrebbe risultare più alto del reale/);
  assert.match(h.api.renderHome(), /problemi nei dati/);
});

test('D: no projection means no zero chart, no made-up minimum and visible recovery actions', () => {
  for (const data of [savedState(), { ...readyState(), planner: { ...readyState().planner, sameDayActualsIncluded: null } }]) {
    const h = harness(data), html = h.api.renderHome();
    assert.equal(geometry(h), null);
    assert.doesNotMatch(html, /<svg class="forecast-chart|class="home-minimum"|class="summary-value money"/);
    assert.match(html, /Previsione non calcolabile/); assert.match(html, /data-action="configure-plan"/);
    assert.match(html, /Nessun saldo stimato/);
  }
});

test('D: zero balance/reserve, negative opening and no-events charts have finite real values', () => {
  for (const [openingBalanceCents, reserveCents] of [[0, 0], [-15000, 0], [50000, 0], [50000, 90000]]) {
    const data = readyState([]); Object.assign(data.planner, { openingBalanceCents, reserveCents });
    const h = harness(data), g = geometry(h), html = h.api.renderHome();
    assert.equal(h.api.currentRadar().projection.minimumCents, openingBalanceCents);
    assert.doesNotMatch(g.path, /NaN|Infinity/); assert.ok(Number.isFinite(+g.minimumY));
    assert.match(html, /forecast-reserve/); assert.match(html, /forecast-zero/);
    assert.equal(g.reserveY === g.zeroY, reserveCents === 0);
  }
});

test('D: monthly alternative keeps all engine periods including thirteenth partial month', () => {
  const h = harness(readyState([future({ recurrenceMonths: 1 })]));
  const p = h.api.currentRadar().projection, html = h.api.renderHome();
  assert.equal(p.months.length, 13);
  const table = html.match(/<table class="forecast-table">([\s\S]*?)<\/table>/)[1];
  assert.equal((table.match(/<th scope="row">/g) ?? []).length, p.months.length);
  for (const month of p.months) assert.ok(table.includes(h.api.formatDate(month.until)));
  assert.match(table, /1 nov 2027/); assert.match(html, /Saldo e minimo prudenziale per periodo/);
});

test('D: chart has distinct accessible names, minimum explanation and no whole-app live region', () => {
  const h = harness(readyState([])), html = h.api.renderHome();
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, names] of html.matchAll(/aria-labelledby="([^"]+)"/g)) for (const name of names.split(' ')) assert.ok(ids.includes(name), name);
  for (const suffix of ['summary', 'full']) {
    assert.match(html, new RegExp(`role="img" aria-labelledby="forecast-title-${suffix} forecast-desc-${suffix}"`));
    assert.match(html, new RegExp(`<desc id="forecast-desc-${suffix}">[\\s\\S]*?Uscite prima delle entrate`));
  }
  assert.doesNotMatch(html, /aria-live=/);
});

test('D: Home priority count is capped, full Radar remains complete and original actions persist', () => {
  const h = harness(readyState(Array.from({ length: 6 }, (_, i) => ({ ...deadline, id: `late-${i}` }))));
  const items = h.api.currentRadar().items, home = h.api.renderHome();
  assert.equal((home.match(/class="radar-card"/g) ?? []).length, 3);
  assert.equal((h.api.renderRadar().match(/class="radar-card"/g) ?? []).length, items.length);
  for (const item of items.slice(0, 3)) {
    assert.ok(home.includes(item.description)); assert.ok(home.includes(`data-id="${item.occurrenceId}"`));
    assert.ok(home.includes(`data-action="${item.action}"`));
  }
  assert.match(home, /class="priority-meta"/); assert.match(home, /Uscita da verificare/);
});

test('D: priority amounts respect original occurrence override, zero and @ in IDs without regeneration', () => {
  const data = readyState([{ ...deadline, id: 'series@x', amountCents: 90000, overrides: { '2026-11-17': { amountCents: 12345 } } }]);
  data.planner.incomes = [income({ id: 'income@x', dueDate: '2026-11-16', amountCents: 34567 })];
  const h = harness(data), items = h.api.currentRadar().items;
  h.resetGenerations();
  const html = h.evaluate(`renderRadarItems(${JSON.stringify(items)}, true)`);
  assert.match(html, /123,45 €/); assert.match(html, /345,67 €/); assert.doesNotMatch(html, /900,00 €/);
  assert.equal(h.generationStats.calls, 0);
  h.evaluate('state.deadlines[0].overrides["2026-11-17"].amountCents = 0');
  const zero = h.evaluate(`renderRadarItems(${JSON.stringify(items.filter(i => !i.income))}, true)`);
  assert.doesNotMatch(zero, /class="money"/);
});

test('D: compact upcoming preserves one future open expense per series, metadata and native actions', () => {
  const data = readyState([
    future({ id: 'monthly', recurrenceMonths: 1 }), future({ id: 'once', dueDate: '2026-12-15' }),
    future({ id: 'archived', archived: true }), future({ id: 'cancelled', overrides: { '2026-12-01': { cancelled: true } } }),
    future({ id: 'done', amountCents: 0, overrides: { '2026-12-01': { done: true } } }),
  ]);
  data.planner.incomes = [income()];
  const h = harness(data), html = h.api.renderHome(), upcoming = html.slice(html.indexOf('class="plan-panel home-upcoming"'));
  assert.equal((upcoming.match(/<details class="home-upcoming-row">/g) ?? []).length, 2);
  assert.match(upcoming, /Scadenza: 1 dic 2026 · Data prevista di pagamento: 1 dic 2026/);
  for (const id of ['monthly@2026-12-01', 'once@2026-12-15']) for (const action of ['edit-deadline', 'complete-deadline', 'archive-deadline', 'cancel-occurrence']) assert.ok(upcoming.includes(`data-action="${action}" data-id="${id}"`));
  assert.match(upcoming, /data-action="edit-series" data-id="monthly"/);
  assert.doesNotMatch(upcoming, /salary@|archived@|cancelled@|done@|monthly@2027/);
  assert.match(upcoming, /Gestisci/); assert.match(upcoming, /Vai all’Agenda/);
});

test('D: all new presentation escapes user strings and does not mutate state, storage or backup', async () => {
  const data = readyState([future({ title: '<img src=x onerror="evil">', notes: '<script>evil</script>' })]);
  const h = harness(data), before = JSON.stringify(h.api.state), storage = [...h.storage];
  for (let i = 0; i < 3; i++) {
    const html = h.api.renderHome();
    assert.doesNotMatch(html, /<img|<script>evil/); assert.match(html, /&lt;img/);
  }
  assert.equal(JSON.stringify(h.api.state), before); assert.deepEqual([...h.storage], storage);
  h.api.exportBackup();
  const backup = JSON.parse(await h.blob().text());
  assert.equal(backup.schemaVersion, 3); assert.equal(backup.deadlines[0].title, data.deadlines[0].title);
  assert.equal(backup.planner.balanceDate, data.planner.balanceDate);
});

test('D: graph geometry and dates are identical across DST time zones', () => {
  const module = new URL('./harness.mjs', import.meta.url).href;
  const script = `import { harness, readyState, deadline } from ${JSON.stringify(module)}; const h = harness(readyState([{...deadline,dueDate:'2026-11-18'}])); console.log(h.evaluate('JSON.stringify(forecastGeometry(currentRadar()))'));`;
  const outputs = ['UTC', 'Europe/Rome', 'America/New_York'].map(TZ => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); return r.stdout;
  });
  assert.equal(outputs[0], outputs[1]); assert.equal(outputs[1], outputs[2]);
});

test('C+D: no new dependency/network/theme/storage hooks or native picker invocation', () => {
  const presentation = source.slice(source.indexOf('// Presentation only: coordinates'), source.indexOf('function renderDateStrip'));
  assert.doesNotMatch(presentation, /localStorage|sessionStorage|fetch\(|setItem\(|persist\(|commit\(|showPicker\(|addEventListener\(/);
  const layer = css.slice(css.indexOf('/* Phases C + D'));
  assert.doesNotMatch(layer, /https?:|@import|url\(|#[a-f\d]{3,8}\b/);
  for (const rule of rules(layer, { width: 320, dark: false })) if (/^(?:html|body|\.app-shell|\.layout|\.content|\.home-page|\.home-plan-grid)$/.test(rule.selector)) {
    for (const [name, value] of rule.declarations) if (['overflow', 'overflow-x'].includes(name)) assert.notEqual(value, 'hidden');
  }
});

for (const width of [320, 375, 768, 1024, 1025, 1280]) for (const dark of [false, true]) {
  test(`C+D: declared shell/Home safeguards ${width}px ${dark ? 'dark' : 'light'} (not viewport QA)`, () => {
    const env = { width, dark }, mobile = width <= 760, desktop = width >= 1025;
    const tokens = style(env, []), layout = style(env, ['.layout']), grid = style(env, ['.home-plan-grid']);
    assert.equal(tokens['--sidebar-size'], width <= 1024 ? '200px' : '248px');
    assert.equal(tokens['--topbar-size'], '72px'); assert.equal(tokens['--content-max'], '1120px');
    assert.equal(style(env, ['.topbar'])['min-block-size'], '72px');
    assert.equal(grid['grid-template-columns'], desktop ? 'minmax(0, 2fr) minmax(0, 1fr)' : 'minmax(0, 1fr)');
    assert.equal(style(env, ['.home-summary']).display, mobile ? 'block' : 'none');
    assert.equal(style(env, ['.mobile-create']).display, mobile ? 'inline-flex' : 'none');
    assert.equal(style(env, ['.mobile-bottom-nav']).display, mobile ? 'grid' : 'none');
    assert.equal(style(env, ['.home-priorities .radar-card', '.home-page .home-priorities .radar-card']).padding, '20px');
    if (mobile) {
      assert.equal(layout.display, 'block');
      const fab = style(env, ['.mobile-create']), nav = style(env, ['.mobile-bottom-nav']), content = style(env, ['.content']);
      assert.equal(fab['inline-size'], '56px'); assert.equal(fab['block-size'], '56px');
      assert.match(fab['inset-block-end'], /76px.*16px.*safe-area-inset-bottom/);
      assert.match(nav['padding-block'], /safe-area-inset-bottom/);
      assert.match(nav['grid-template-columns'], /repeat\(4,/);
      assert.match(content.padding, /76px.*56px.*48px.*safe-area-inset-bottom/);
      assert.equal(style(env, ['.mobile-nav-button'])['min-block-size'], '60px');
      assert.equal(style(env, ['.home-summary'])['--focus'], tokens['--focus-inverse']);
      assert.equal(style(env, ['.forecast-line', '.home-summary .forecast-line']).stroke, tokens['--inverse-ink']);
      assert.equal(style(env, ['.home-summary']).background, tokens['--brand-panel']);
    } else assert.match(layout['grid-template-columns'], /minmax\(0, 1fr\)/);
    assert.equal(style(env, ['.forecast-line']).stroke, tokens['--navy']);
    assert.equal(style(env, ['.forecast-reserve']).stroke, tokens['--reserve']);
    assert.equal(style(env, ['.forecast-zero']).stroke, tokens['--control-border']);
    assert.equal(style(env, ['.forecast-reserve'])['stroke-dasharray'], '6 5');
    assert.equal(style(env, ['.forecast-zero'])['stroke-dasharray'], '2 4');
    assert.equal(style(env, ['.forecast-table-wrap'])['overflow-x'], 'auto');
  });
}

test('D: priority amount reflects protected snapshot, not a later series amount', () => {
  const data = readyState([{ ...deadline, amountCents: 99000, overrides: { '2026-11-17': { notes: 'Eccezione protetta' } }, snapshots: { '2026-11-17': { title: 'Rata protetta', dueDate: '2026-11-17', cashMode: 'same', cashDate: '2026-11-17', amountCents: 42000 } } }]);
  const h = harness(data), html = h.api.renderHome();
  assert.match(html, /Rata protetta/); assert.match(html, /420,00 €/); assert.doesNotMatch(html, /990,00 €/);
  const before = JSON.stringify(h.api.state);
  h.api.renderRadar(); assert.equal(JSON.stringify(h.api.state), before);
});

test('D: chart uses expected cash date, not legal due date, with integer-cent low', () => {
  const h = harness(readyState([future({ amountCents: 49999, cashMode: 'date', cashDate: '2026-12-08' })]));
  const p = h.api.currentRadar().projection, g = geometry(h);
  assert.equal(p.rows.length, 1); assert.equal(p.rows[0].date, '2026-12-08');
  assert.equal(p.minimumDate, '2026-12-08'); assert.equal(p.minimumCents, 1);
  assert.equal(g.minimumX, g.path.match(/ H ([\d.]+) V/)[1]);
  const html = h.api.renderHome();
  assert.match(html, /Minimo prudenziale 0,01 € il 8 dic 2026/);
  assert.match(html, /Scadenza: 1 dic 2026 · Data prevista di pagamento: 8 dic 2026/);
});
