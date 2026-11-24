import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { harness, deadline, readyState } from './harness.mjs';

const root = new URL('../../', import.meta.url);
const [css, source, index] = await Promise.all(['styles.css', 'app-source.js', 'index.html'].map(name => readFile(new URL(name, root), 'utf8')));
const body = index.match(/<body>([\s\S]*?)<\/body>/)[1];

// Declaration/cascade and width-budget checks only: no browser layout is simulated.
function rules(text, env) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const result = [];
  for (let cursor = 0; cursor < text.length;) {
    const open = text.indexOf('{', cursor);
    if (open < 0) break;
    let close = open + 1, depth = 1;
    for (; depth; close++) {
      if (text[close] === '{') depth++;
      if (text[close] === '}') depth--;
      assert.ok(close <= text.length, 'Balanced CSS');
    }
    const selector = text.slice(cursor, open).trim(), content = text.slice(open + 1, close - 1);
    if (selector.startsWith('@media')) {
      const width = selector.match(/max-width:\s*(\d+)px/);
      if ((!width || env.width <= Number(width[1])) && (!selector.includes('prefers-color-scheme: dark') || env.dark) && (!selector.includes('prefers-reduced-motion: reduce') || env.reduced)) result.push(...rules(content, env));
    } else {
      const declarations = Object.fromEntries(content.split(';').filter(part => part.trim()).map(part => {
        const colon = part.indexOf(':');
        assert.ok(colon > 0);
        return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
      }));
      for (const item of selector.split(',')) result.push({ selector: item.trim(), declarations });
    }
    cursor = close;
  }
  return result;
}
const weight = selector => (selector.match(/#/g) ?? []).length * 100 + (selector.match(/\.|:(?!:)|\[/g) ?? []).length * 10 + (selector.match(/(?:^|\s|\+)(?:[a-z][\w-]*)/g) ?? []).length;
function style(env, selectors) {
  const values = {}, weights = {};
  for (const rule of rules(css, env)) {
    if (![':root', ...selectors].includes(rule.selector)) continue;
    for (const [name, value] of Object.entries(rule.declarations)) {
      if (weight(rule.selector) < (weights[name] ?? -1)) continue;
      values[name] = value; weights[name] = weight(rule.selector);
    }
  }
  const resolve = value => value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    assert.ok(values[name], name);
    return resolve(values[name]);
  });
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, resolve(value)]));
}
const card = (h, value) => h.evaluate(`renderDeadlineCard(${JSON.stringify({ ...deadline, seriesId: 'x', ...value })})`);

test('B: civil time tile, full due/cash/actual dates and occurrence identity are preserved', () => {
  const h = harness(readyState());
  const value = { id: 'x@2026-10-17', dueDate: '2026-11-20', cashDate: '2026-11-21', actual: { date: '2026-11-17', amountCents: 12000 }, completed: true };
  const html = card(h, value);
  assert.match(html, /<time class="date-icon" datetime="2026-11-20" aria-label="Scadenza: 20 novembre 2026"><span class="date-day">20<\/span><small>NOV<\/small><\/time>/);
  assert.match(html, /Scadenza: 20 nov 2026 · Data prevista di pagamento: 21 nov 2026 · Pagato 120,00 € il 17 nov 2026/);
  assert.match(html, /data-id="x@2026-10-17"/);
  assert.match(html, /status-pill ">Pagata<\/span>/);
  assert.doesNotMatch(html.match(/<time[\s\S]*?<\/time>/)[0], /<svg/);
});

test('B: invalid civil dates never become a fake date tile', () => {
  const h = harness(readyState());
  for (const dueDate of [null, undefined, '2026-02-29', '2026-04-31', '2026-13-01', '<img src=x onerror="evil">']) {
    const html = card(h, { dueDate });
    assert.match(html, /<span class="date-icon date-icon-invalid">Data non valida<\/span>/);
    assert.doesNotMatch(html, /<time|<img src=x|>1<\/span>/);
  }
  assert.match(card(h, { dueDate: '2028-02-29' }), /datetime="2028-02-29"[^>]*29 febbraio 2028[^>]*><span class="date-day">29/);
});

test('B: date tile stays identical across DST in UTC, Rome and New York', () => {
  const module = new URL('./harness.mjs', import.meta.url).href;
  const script = `import { harness, readyState } from ${JSON.stringify(module)}; const h = harness(readyState()); console.log(JSON.stringify(['2026-03-29','2026-10-25','2026-11-01'].map(d => h.evaluate('renderDeadlineCard({...state.deadlines[0],dueDate:'+JSON.stringify(d)+'})').match(/<time[\\s\\S]*?<\\/time>/)[0])));`;
  const outputs = ['UTC', 'Europe/Rome', 'America/New_York'].map(TZ => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout;
  });
  assert.equal(outputs[0], outputs[1]); assert.equal(outputs[1], outputs[2]);
});

test('B: existing status labels persist and badge classes are allowlisted and text escaped', () => {
  const h = harness(readyState());
  for (const [value, label] of [
    [{ dueDate: '2026-11-18' }, 'Scade oggi'],
    [{ dueDate: '2026-11-19' }, 'Tra 1 giorno'],
    [{ dueDate: '2026-11-17' }, 'Scaduta da 1 giorno'],
    [{ dueDate: '2026-12-01' }, '1 dic 2026'],
    [{ cancelled: true }, 'Annullata · recuperabile'],
    [{ completed: true, done: true }, 'Fatta, senza movimento'],
    [{ completed: true }, 'Completata (storico)'],
  ]) assert.ok(card(h, value).includes(`>${label}</span>`), label);
  h.evaluate('deadlineStatus = () => ({className: \'urgent" onclick="evil\', text: \'<img src=x onerror="evil">\'});');
  const html = card(h, { title: '<svg onload="evil">', id: 'x" onclick="evil' });
  assert.match(html, /class="status-pill ">&lt;img/);
  assert.doesNotMatch(html, /<img|<svg onload|class="status-pill urgent|data-id="x" onclick=/);
  assert.match(css, /\.status-pill::before, \.staging-badge::before\s*\{\s*content: "";/);
  assert.match(source, /class="staging-badge">\$\{escapeHtml\(status\)\}/);
  const badgeRule = css.slice(css.indexOf('/* Phase B')).match(/\.status-pill, \.staging-badge\s*\{([^}]+)\}/)[1];
  assert.match(badgeRule, /gap: var\(--space-2\);/);
  assert.match(badgeRule, /padding: var\(--space-1\) var\(--space-2\);/);
  assert.match(badgeRule, /border-radius: var\(--radius-pill\);/);
  for (const dark of [false, true]) {
    const env = { width: 375, dark };
    assert.equal(style(env, [])['--radius-pill'], '999px');
    for (const selector of ['.status-pill', '.staging-badge']) {
      const badge = style(env, [selector]), dot = style(env, [`${selector}::before`]);
      assert.equal(badge.padding, '4px 8px'); assert.equal(badge.gap, '8px');
      assert.equal(badge['border-radius'], '999px'); assert.equal(badge['white-space'], 'normal');
      assert.equal(dot['inline-size'], '6px'); assert.equal(dot['block-size'], '6px');
      assert.equal(dot.flex, '0 0 6px'); assert.equal(dot.content, '""');
    }
  }
});

test('B: initial skeleton is decorative, static and announced only by targeted status', () => {
  const loading = body.slice(body.indexOf('<div class="loading-screen">'), body.indexOf('<dialog'));
  assert.match(loading, /<p role="status">Avvio di Scadenzario…<\/p>/);
  assert.match(loading, /class="loading-skeleton" aria-hidden="true"/);
  assert.equal((loading.match(/class="skeleton-card"/g) ?? []).length, 2);
  assert.doesNotMatch(loading, /€|Pagata|Scade oggi|data-action=|aria-live=|<button/);
  assert.doesNotMatch(body, /id="app"[^>]*aria-live/);
  assert.doesNotMatch(css.slice(css.indexOf('/* Phase B')), /@keyframes|animation:\s*(?!none\b)\S/);
  const reduced = style({ width: 375, dark: false, reduced: true }, ['.loading-skeleton']);
  assert.equal(reduced.animation, 'none');
});

test('B: fatal error still escapes message, preserves original data notice and backup action', () => {
  const h = harness(readyState());
  const before = JSON.stringify(h.api.state), storage = [...h.storage];
  h.evaluate('renderFatalError(new Error("<img src=x>"))');
  const html = h.node('#app').innerHTML;
  assert.match(html, /Non riesco ad aprire i dati/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /I dati originali non sono stati modificati/);
  assert.match(html, /data-action="choose-backup">Scegli backup JSON/);
  assert.doesNotMatch(html, /loading-skeleton|<img/);
  assert.equal(JSON.stringify(h.api.state), before); assert.deepEqual([...h.storage], storage);
});

test('B: existing empty states and CTA semantics remain unchanged', () => {
  const h = harness(readyState([]));
  const home = h.api.renderHome(), agenda = h.api.renderCalendar();
  assert.match(home, /Nessuna prossima scadenza nei dati inseriti\. Controlla gli arretrati nel Radar o aggiungi una scadenza/);
  assert.match(home, /data-action="new-deadline">Nuova scadenza/);
  assert.match(agenda, /Nessuna scadenza: Oggi con categoria e stato selezionati/);
  assert.match(h.evaluate('renderDeadlineList([])'), /data-action="new-deadline"[^>]*>[\s\S]*?Aggiungi scadenza/);
  assert.match(h.evaluate('renderCatalog()'), /data-action="reload-catalog">Ricarica catalogo/);
  assert.doesNotMatch(h.evaluate('renderBenefits()'), /data-action="new-/);
});

test('B: icon-only buttons preserve accessible names in rendered views and dialogs', () => {
  const h = harness(readyState([{ ...deadline, dueDate: '2026-11-18' }]));
  let checked = 0;
  for (const html of [body, ...['renderHome', 'renderCalendar', 'renderRadar', 'renderPlanning', 'renderMore'].map(name => h.api[name]())]) {
    for (const [, attributes, content] of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      if (!/class="(?:icon-button|card-action)"/.test(attributes)) continue;
      assert.match(attributes, /aria-label="[^"]+"/);
      checked++;
      assert.doesNotMatch(content, /<img|https?:/);
    }
  }
  assert.ok(checked >= 8);
  assert.match(source, /stroke-width="1\.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"/);
});

test('B: button states retain primary shadow, disabled affordance and visible focus', () => {
  for (const dark of [false, true]) {
    const env = { width: 1280, dark };
    const primary = style(env, ['.button', '.button-primary', '.button:hover', '.button-primary:hover']);
    assert.equal(primary['box-shadow'], style(env, [])['--shadow-primary']);
    assert.equal(primary.color, style(env, [])['--on-primary']);
    const active = style(env, ['.button', '.button-primary', '.button-primary:active']);
    assert.equal(active['box-shadow'], 'none');
    for (const selector of ['.button', '.text-button', '.card-action', '.icon-button']) {
      const disabled = style(env, [selector, `${selector}:disabled`]);
      assert.equal(disabled.cursor, 'not-allowed'); assert.equal(disabled['box-shadow'], 'none'); assert.equal(disabled.opacity, '1');
      assert.equal(style(env, [selector, `${selector}:focus-visible`]).outline, `3px solid ${style(env, [])['--focus']}`);
    }
    assert.equal(style(env, ['.button', '.button-quiet'])['border-color'], style(env, [])['--control-border']);
  }
});

test('B: controls are touch-sized; disabled, readonly, invalid and help/error treatments are semantic', () => {
  for (const dark of [false, true]) {
    const env = { width: 375, dark }, tokens = style(env, []);
    for (const selector of ['.field input', '.field select', '.field textarea']) {
      assert.equal(style(env, [selector])['min-block-size'], '44px');
      assert.equal(style(env, [selector, `${selector}:disabled`]).background, tokens['--soft']);
      assert.equal(style(env, [selector, `${selector}:disabled`]).color, tokens['--text-muted']);
    }
    assert.equal(style(env, ['.field input[readonly]'])['border-style'], 'dashed');
    assert.equal(style(env, ['.field [aria-invalid="true"]'])['border-color'], tokens['--error-border']);
    assert.equal(style(env, ['.form-error']).background, tokens['--error-bg']);
    assert.equal(style(env, ['.form-error']).color, tokens['--error-ink']);
    assert.equal(style(env, ['.reminder-options label'])['min-block-size'], '44px');
    assert.equal(style(env, ['.checkline'])['min-block-size'], '44px');
  }
});

for (const width of [320, 375, 768, 1024, 1280]) for (const dark of [false, true]) {
  test(`B: static ${width}px ${dark ? 'dark' : 'light'} card/date width safeguards (not viewport QA)`, () => {
    const env = { width, dark }, mobile = width <= 760, tokens = style(env, []);
    for (const selector of ['.plan-panel', '.settings-card', '.stat-card', '.deadline-card', '.catalog-item', '.benefit-card', '.source-monitoring', '.radar-card', '.calendar-cash-detail', '.agenda-calendar', '.empty-state']) {
      const value = style(env, [selector]);
      assert.equal(value['border-radius'], '20px');
      assert.equal(value['box-shadow'], tokens['--shadow-card']);
      assert.equal(value.background, tokens['--surface']);
      assert.equal(value.border, `1px solid ${tokens['--line']}`);
      assert.ok(['20px', '24px'].includes(value.padding), `${selector} padding`);
    }
    assert.equal(style(env, ['.radar-card', '.home-priorities .radar-card']).padding, '14px');
    const tile = style(env, ['.date-icon']);
    assert.equal(tile['inline-size'], mobile ? '46px' : '52px'); assert.equal(tile['block-size'], tile['inline-size']);
    assert.equal(tile['border-radius'], '14px');
    assert.equal(style(env, ['.date-day'])['font-weight'], '700');
    assert.equal(style(env, ['.date-icon small'])['text-transform'], 'uppercase');
    assert.equal(style(env, ['.button'])['min-height'], '44px');
    assert.equal(style(env, ['.card-action'])['min-width'], '44px');
    assert.equal(style(env, ['.icon-button'])['min-height'], '44px');
    assert.match(style(env, ['.deadline-card'])['grid-template-columns'], /minmax\(0, 1fr\)/);
    assert.equal(style(env, ['.deadline-amount'])['white-space'], 'normal');
    if (mobile) {
      const content = width - 32, panel = content - 42, deadlineInner = panel - 42, text = deadlineInner - 46 - 9;
      assert.ok(text >= 100, 'Minimum mobile text budget after existing content gutters and nested card padding');
    }
    for (const rule of rules(css, env)) if (/^(?:html|body|\.app-shell|\.layout|\.content)$/.test(rule.selector)) assert.notEqual(rule.declarations.overflow, 'hidden');
  });
}
