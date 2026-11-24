// DOM minimo con veri listener e propagazione lungo i parent; non è un browser.
export function createDOM({ parseButtons = false, fullShell = false } = {}) {
  const nodes = new Map();
  let created = 0;
  class Node {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.dataset = {}; this.value = ''; this.textContent = ''; this._html = ''; this.children = []; this.parentNode = null; this.listeners = new Map();
      const classes = new Set(); this.classList = { add: x => classes.add(x), remove: x => classes.delete(x), toggle(x, force) { if (force ?? !classes.has(x)) classes.add(x); else classes.delete(x); }, contains: x => classes.has(x) };
    }
    addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(callback); }
    dispatchEvent(event) {
      const path = []; for (let current = this; current; current = current.parentNode) path.push(current);
      Object.defineProperty(event, 'target', { value: this, configurable: true });
      Object.defineProperty(event, 'composedPath', { value: () => path.slice(), configurable: true });
      for (const current of path) {
        Object.defineProperty(event, 'currentTarget', { value: current, configurable: true });
        for (const callback of [...(current.listeners.get(event.type) ?? [])]) callback.call(current, event);
        if (!event.bubbles) break;
      }
      return !event.defaultPrevented;
    }
    append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); if (this === document.head && child.tagName === 'STYLE') nodes.set('shell-style', child); } }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; }
    setAttribute(key, value) { this[key] = value; if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value; }
    removeAttribute(key) { delete this[key]; }
    matches(selector) {
      if (selector === '[data-action]') return this.dataset.action !== undefined;
      if (selector === '[data-close-dialog]') return Object.hasOwn(this.dataset, 'closeDialog');
      if (selector === '[data-filter]') return this.dataset.filter !== undefined;
      const action = selector.match(/^\[data-action="([^"]+)"\]$/); if (action) return this.dataset.action === action[1];
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      return this.tagName === selector.toUpperCase();
    }
    closest(selector) { for (let current = this; current; current = current.parentNode) if (current.matches?.(selector)) return current; return null; }
    contains(child) { for (let current = child; current; current = current.parentNode) if (current === this) return true; return false; }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    querySelectorAll(selector) {
      if (selector.includes('input[name="reminder"]')) return this.elements.filter(field => field.name === 'reminder' && (!selector.includes(':checked') || field.checked));
      if (selector === 'input, select, textarea') return this.descendants().filter(n => ['INPUT', 'SELECT', 'TEXTAREA'].includes(n.tagName));
      return this.descendants().filter(n => n.matches(selector));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    get elements() { return this.testElements ?? this.descendants().filter(n => ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(n.tagName)); }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      this._html = value;
      if (!parseButtons) return;
      for (const old of this.children.filter(n => n.parsedButton)) old.remove();
      for (const match of value.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
        const button = new Node('button'); button.parsedButton = true;
        for (const attribute of match[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) button.setAttribute(attribute[1], attribute[2] ?? '');
        button.textContent = match[2].replace(/<[^>]*>/g, ''); this.append(button);
      }
    }
    focus() { this.focused = true; document.activeElement = this; }
    click() { return this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); }
    showModal() { this.open = true; }
    close() { if (!this.open) return; this.open = false; this.dispatchEvent(new Event('close')); }
    reset() {}
  }
  const document = new Node('document'); document.hidden = false;
  document.body = new Node('body'); document.append(document.body);
  if (fullShell) { document.head = new Node('head'); document.append(document.head); document.documentElement = { dataset: {} }; }
  const node = selector => {
    if (nodes.has(selector)) return nodes.get(selector);
    const id = selector.replace(/^#/, '');
    const tag = id.endsWith('-dialog') ? 'dialog' : id.endsWith('-form') ? 'form' : id === 'app' ? 'div' : /(?:notes)$/.test(id) ? 'textarea' : 'input';
    const item = new Node(tag, id); nodes.set(selector, item);
    const group = id.match(/^(deadline|movement|profile|income|planner|onboarding)-/u)?.[1];
    let parent = document.body;
    if (tag === 'form') parent = ['deadline', 'movement', 'profile'].includes(group) ? node(`#${group}-dialog`) : node('#app');
    else if (group && tag !== 'dialog') parent = node(`#${group}-form`);
    parent.append(item); return item;
  };
  document.querySelector = node;
  document.querySelectorAll = selector => selector === 'form' ? [...nodes.values()].filter(n => n.tagName === 'FORM') : [];
  document.createElement = tag => { const item = new Node(tag); nodes.set(`created-${created++}`, item); return item; };
  return { document, node, nodes, Event };
}
