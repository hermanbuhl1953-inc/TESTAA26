import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { harness, readyState } from './harness.mjs';

const root = new URL('../../', import.meta.url);
const [css, source, index] = await Promise.all(['styles.css', 'app-source.js', 'index.html'].map(name => readFile(new URL(name, root), 'utf8')));

// Static declaration/cascade checks, not a browser CSS engine or viewport QA.
function rules(text, environment) {
  const result = [];
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  for (let cursor = 0; cursor < text.length;) {
    const open = text.indexOf('{', cursor);
    if (open < 0) break;
    let close = open + 1, depth = 1;
    for (; depth; close++) {
      if (text[close] === '{') depth++;
      if (text[close] === '}') depth--;
      assert.ok(close < text.length, 'Balanced CSS braces');
    }
    const selector = text.slice(cursor, open).trim(), body = text.slice(open + 1, close - 1);
    if (selector.startsWith('@media')) {
      const width = selector.match(/max-width:\s*(\d+)px/);
      const active = (!width || environment.width <= Number(width[1])) &&
        (!selector.includes('prefers-color-scheme: dark') || environment.dark) &&
        (!selector.includes('prefers-reduced-motion: reduce') || environment.reduced);
      if (active) result.push(...rules(body, environment));
    } else {
      const declarations = body.split(';').map(line => line.trim()).filter(Boolean).map(line => {
        const colon = line.indexOf(':');
        assert.ok(colon > 0, line);
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
      });
      for (const item of selector.split(',')) result.push({ selector: item.trim(), declarations });
    }
    cursor = close;
  }
  return result;
}
const specificity = selector => (selector.match(/#/g) ?? []).length * 100 + (selector.match(/\.|:(?!:)|\[/g) ?? []).length * 10 + (selector.match(/(?:^|\s|\+)(?:[a-z][\w-]*)/g) ?? []).length;
function cascade(environment, selectors, inherited = {}) {
  const chosen = {}, values = { ...inherited };
  for (const rule of rules(css, environment)) {
    if (!selectors.includes(rule.selector)) continue;
    const weight = specificity(rule.selector);
    for (const [name, value] of rule.declarations) {
      if (weight < (chosen[name] ?? -1)) continue;
      chosen[name] = weight; values[name] = value;
    }
  }
  return values;
}
function resolve(value, values, seen = new Set()) {
  return value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    assert.ok(!seen.has(name), `Circular token ${name}`);
    assert.ok(values[name], `Unknown token ${name}`);
    return resolve(values[name], values, new Set([...seen, name]));
  });
}
function luminance(hex) {
  assert.match(hex, /^#[a-f0-9]{6}$/i);
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb.reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
}
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
};
const env = dark => ({ dark, width: 1280, reduced: false });
const tokens = environment => cascade(environment, [':root']);

for (const dark of [false, true]) {
  const mode = dark ? 'dark' : 'light', environment = env(dark), values = tokens(environment);
  const color = name => resolve(`var(${name})`, values);
  test(`${mode}: palette, native controls, type and tokenized paint`, () => {
    assert.equal(values['color-scheme'], mode);
    assert.equal(values['font-size'], '15px');
    assert.equal(values['font-family'], "system-ui, 'Segoe UI Variable Text', 'Segoe UI', sans-serif");
    assert.equal(values['--page-warm'], dark ? '#0d1620' : '#f6f5f1');
    assert.equal(values['--surface'], dark ? '#15212d' : '#ffffff');
    assert.equal(values['--font-h1'], '34px'); assert.equal(values['--font-h2'], '19px');
    const mobile = tokens({ ...environment, width: 375 });
    assert.equal(mobile['--font-h1'], '28px'); assert.equal(mobile['--font-h2'], '18px');
    for (const rule of rules(css, environment)) for (const [name, value] of rule.declarations) {
      if (name.startsWith('--')) { resolve(value, values); continue; }
      assert.doesNotMatch(value, /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i, `${rule.selector}: ${name}`);
      if (name === 'font-size') assert.ok(parseFloat(resolve(value, values)) >= 12, rule.selector);
    }
  });
  test(`${mode}: semantic card and primary shadows retain both layers`, () => {
    const card = resolve('var(--shadow-card)', values);
    const primary = resolve('var(--shadow-primary)', values);
    assert.equal(card, dark
      ? '0 1px 2px rgba(0,0,0,.25), 0 8px 24px -14px rgba(0,0,0,.60)'
      : '0 1px 2px rgba(15,39,64,.04), 0 8px 24px -14px rgba(15,39,64,.18)');
    assert.equal(primary, dark
      ? '0 1px 2px rgba(0,0,0,.35), 0 6px 14px -6px rgba(0,0,0,.70)'
      : '0 1px 2px rgba(10,37,64,.25), 0 6px 14px -6px rgba(10,37,64,.45)');
    for (const shadow of [card, primary]) assert.equal(shadow.replace(/rgba\([^)]*\)/g, 'color').split(',').length, 2);
    assert.equal(values['--shadow-card'], '0 1px 2px var(--shadow-card-contact-color), 0 8px 24px -14px var(--shadow-card-ambient-color)');
    assert.equal(values['--shadow-primary'], '0 1px 2px var(--shadow-primary-contact-color), 0 6px 14px -6px var(--shadow-primary-ambient-color)');
  });
  test(`${mode}: text pairs >=4.5, focus/control boundaries >=3 (not a full AA certification)`, () => {
    const pairs = [
      ['--ink', '--page-warm'], ['--ink', '--surface'], ['--ink', '--soft'], ['--ink', '--nav-surface'],
      ['--text-muted', '--surface'], ['--text-muted', '--page-warm'], ['--text-muted', '--soft'], ['--text-muted', '--info-bg'], ['--text-muted', '--nav-surface'],
      ['--info-ink', '--info-bg'], ['--warning-ink', '--warning-bg'], ['--error-ink', '--error-bg'], ['--success-ink', '--success-bg'],
      ['--on-primary', '--navy'], ['--on-primary', '--navy-dark'], ['--navy', '--surface'], ['--navy', '--info-bg'], ['--navy', '--warning-bg'],
      ['--inverse-ink', '--brand-panel'], ['--inverse-muted', '--brand-panel'], ['--inverse-ink', '--toast-error'], ['--reserve', '--surface'],
      ['--placeholder', '--surface'], ['--link', '--surface'], ['--link', '--page-warm'],
    ];
    for (const [fg, bg] of pairs) assert.ok(contrast(color(fg), color(bg)) >= 4.5, `${mode} ${fg}/${bg}: ${contrast(color(fg), color(bg)).toFixed(2)}`);
    for (const bg of ['--surface', '--page-warm', '--info-bg']) {
      assert.ok(contrast(color('--focus'), color(bg)) >= 3, `${mode} focus/${bg}`);
      assert.ok(contrast(color('--control-border'), color(bg)) >= 3, `${mode} boundary/${bg}`);
    }
    assert.ok(contrast(color('--focus-inverse'), color('--brand-panel')) >= 3);
  });
  test(`${mode}: contextual cascade for panels, selection, notices, monitoring and cash`, () => {
    const contexts = [
      [['.summary-card'], '--inverse-ink', '--brand-panel'],
      [['.planning-highlight'], '--inverse-ink', '--brand-panel'],
      [['.onboarding-hero'], '--inverse-ink', '--brand-panel'],
      [['.button', '.button-primary'], '--on-primary', '--navy'],
      [['.button', '.button-primary', '.button-primary:hover'], '--on-primary', '--navy-dark'],
      [['.date-cell', '.date-cell.selected'], '--on-primary', '--navy'],
      [['.notice'], '--warning-ink', '--warning-bg'],
      [['.notice', '.notice.warning'], '--warning-ink', '--warning-bg'],
      [['.notice', '.notice.error'], '--error-ink', '--error-bg'],
      [['.staging-badge'], '--warning-ink', '--warning-bg'],
      [['.calendar-event', '.calendar-event.overdue'], '--error-ink', '--error-bg'],
      [['.cash-day-minimum', '.cash-day-minimum.below-reserve'], '--warning-ink', '--warning-bg'],
      [['.calendar-day', '.calendar-day.below-reserve'], '--warning-ink', '--warning-bg'],
      [['.calendar-day', '.calendar-day.below-reserve', '.calendar-day.below-zero'], '--error-ink', '--error-bg'],
    ];
    for (const [selectors, fg, bg] of contexts) {
      const style = cascade(environment, selectors, values);
      assert.equal(resolve(style.color, style), color(fg), selectors.join(', '));
      assert.equal(resolve(style.background, style), color(bg), selectors.join(', '));
      assert.ok(contrast(resolve(style.color, style), resolve(style.background, style)) >= 4.5);
    }
    for (const selector of ['.source-monitoring li small', '.deadline-card.urgent .date-icon']) {
      const style = cascade(environment, [selector], values);
      assert.equal(resolve(style.color, style), color('--warning-ink'));
    }
    const field = cascade(environment, ['.field input', '.field input:focus-visible', ':focus-visible'], values);
    assert.equal(resolve(field.outline, field), `3px solid ${color('--focus')}`);
    assert.equal(field['border-color'], 'var(--control-border)');
    const panel = cascade(environment, ['.summary-card'], values);
    const focus = cascade(environment, [':focus-visible'], panel);
    assert.equal(resolve(focus.outline, focus), `3px solid ${color('--focus-inverse')}`);
  });
}

test('focus, reduced motion and scoped tabular numerals', () => {
  assert.match(css, /\.switch input:focus-visible \+ \.switch-track \{ outline: 3px solid var\(--focus\)/);
  const reduced = cascade({ ...env(false), reduced: true }, ['*']);
  assert.equal(reduced['transition-duration'], '.01ms !important');
  assert.equal(reduced['animation-duration'], '.01ms !important');
  assert.equal(reduced['animation-iteration-count'], '1 !important');
  for (const selector of ['.money', '.deadline-amount', '.calendar-day-number', '.radar-dates']) {
    const style = cascade(env(false), [selector], tokens(env(false)));
    assert.equal(style['font-variant-numeric'], 'tabular-nums'); assert.equal(style['font-weight'], '700');
  }
  assert.equal(cascade(env(false), ['body'], tokens(env(false)))['font-variant-numeric'], undefined);
});

test('source metadata and legacy-head upgrade are media-aware, idempotent and presentation-only', () => {
  const head = index.slice(0, index.indexOf('</head>')).replace(/<style[\s\S]*?<\/style>/g, '');
  for (const [mode, color] of [['light', '#f6f5f1'], ['dark', '#0d1620']]) {
    assert.ok(head.includes(`<meta name="theme-color" content="${color}" media="(prefers-color-scheme: ${mode})">`));
  }
  assert.equal((head.match(/<meta name="theme-color"/g) ?? []).length, 2);
  const presentation = source.slice(source.indexOf('// The legacy shell'), source.indexOf('const STORAGE_KEY'));
  assert.doesNotMatch(presentation, /localStorage|sessionStorage|matchMedia|addEventListener|state\.|navigator\./);
  const unrelated = { name: 'description', content: 'keep' }, metas = [{ name: 'theme-color', content: '#0a2540' }, unrelated];
  const document = {
    head: { append(meta) { metas.push(meta); } },
    createElement(tag) { assert.equal(tag, 'meta'); return {}; },
    querySelectorAll(selector) {
      assert.equal(selector, 'meta[name="theme-color"]');
      return metas.filter(meta => meta.name === 'theme-color').map(meta => ({ remove() { metas.splice(metas.indexOf(meta), 1); } }));
    },
  };
  const context = vm.createContext({ document });
  vm.runInContext(presentation, context); vm.runInContext('syncThemeColorMetadata()', context);
  assert.equal(metas.length, 3); assert.equal(metas[0], unrelated);
  assert.deepEqual(metas.slice(1).map(meta => [meta.name, meta.media, meta.content]), [
    ['theme-color', '(prefers-color-scheme: light)', '#f6f5f1'], ['theme-color', '(prefers-color-scheme: dark)', '#0d1620'],
  ]);
  vm.runInNewContext(presentation, { document: {} });
});

test('theme presentation preserves state, keys and backups across renders', async () => {
  const h = harness(readyState());
  const before = JSON.stringify(h.api.state), storage = [...h.storage];
  for (const render of ['renderHome', 'renderCalendar', 'renderRadar', 'renderPlanning', 'renderMore']) h.api[render]();
  assert.equal(JSON.stringify(h.api.state), before); assert.deepEqual([...h.storage], storage);
  h.api.exportBackup();
  assert.equal(JSON.parse(await h.blob().text()).schemaVersion, 3);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage)\.[^\n]*(?:theme|colorScheme)|(?:setItem|getItem)\(['"](?:theme|color-scheme)/i);
});
