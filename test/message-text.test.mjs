import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../public/message-text.js', import.meta.url), 'utf8');

// Observe DOM output and events, without a browser, network or private instance.
function fixture({ clipboard = async () => {} } = {}) {
  let selected = '';
  const select = (node, start = 0, end = node.textContent.length) => { selected = node.textContent.slice(start, end); Object.assign(selection, { anchorNode: node, focusNode: node, anchorOffset: start, focusOffset: end, rangeCount: 1 }); };
  const selection = { anchorNode: null, focusNode: null, anchorOffset: 0, focusOffset: 0, rangeCount: 0,
    removeAllRanges() { selected = ''; Object.assign(this, { anchorNode: null, focusNode: null, anchorOffset: 0, focusOffset: 0, rangeCount: 0 }); }, addRange(range) { select(range.node); } };
  const document = { activeElement: null, createElement: tag => new Node(tag), createTextNode: text => new Node('#text', text), createRange: () => ({ selectNodeContents(node) { this.node = node; } }), defaultView: { getSelection: () => selection } };
  class Node {
    constructor(tag, text = '') { this.tag = tag; this.ownText = text; this.children = []; this.dataset = {}; this.attributes = {}; this.events = {}; this.ownerDocument = document; }
    get isConnected() { return this.connectedRoot === true || this.parent?.isConnected === true; }
    get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
    set textContent(text) { this.ownText = String(text); for (const child of this.children) child.parent = null; this.children = []; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren(...children) { this.ownText = ''; for (const child of this.children) child.parent = null; this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, callback) { this.events[name] = callback; }
    focus() { document.activeElement = this; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    querySelector(tag) { return descendants(this).find(node => node.tag === tag) || null; }
  }
  const copied = [], context = vm.createContext({ document, URL, navigator: clipboard ? { clipboard: { writeText: async value => { copied.push(value); return clipboard(value); } } } : {} });
  vm.runInContext(source, context);
  const container = document.createElement('div'); container.connectedRoot = true;
  return { document, container, copied, select, get selected() { return selected; }, render: (text, role = 'assistant') => context.BionicMessageText.render(container, text, { role }) };
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const tags = (node, tag) => descendants(node).filter(child => child.tag === tag);
const byClass = (node, name) => descendants(node).filter(child => child.className?.split(' ').includes(name));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('common Markdown becomes passive semantic DOM with nested lists and tables', () => {
  const f = fixture();
  f.render('# Titre\n\nUn **mot fort** et *accentué*, `code_inline` et [source](https://example.test/path?q=1).\n\n3. Premier\n   - Enfant\n     1. Petit-enfant\n4. Deuxième\n\n> Citation **utile**\n>\n> Autre paragraphe\n\n---\n\n| Nom | Valeur |\n| :--- | ---: |\n| A | **2** |\n| B | `x|y` |');
  assert.equal(tags(f.container, 'h2')[0].textContent, 'Titre');
  assert(tags(f.container, 'strong').some(node => node.textContent === 'mot fort'));
  assert.equal(tags(f.container, 'em')[0].textContent, 'accentué');
  assert.equal(tags(f.container, 'a')[0].href, 'https://example.test/path?q=1');
  const ordered = tags(f.container, 'ol'); assert.equal(ordered[0].attributes.start, '3');
  assert.equal(tags(ordered[0], 'li').length, 4); assert.equal(tags(ordered[0], 'ul').length, 1); assert.equal(ordered.length, 2);
  assert.equal(tags(f.container, 'blockquote').length, 1); assert.equal(tags(f.container, 'hr').length, 1);
  const table = tags(f.container, 'table')[0]; assert(table); assert.equal(tags(table, 'th').length, 2); assert.equal(tags(table, 'td').length, 4);
  assert.equal(tags(table, 'td')[3].textContent, 'x|y'); assert.equal(tags(table, 'th')[1].className, 'message-table-align-right');
  assert.equal(byClass(f.container, 'message-table-wrap')[0].attributes['aria-label'], 'Tableau du message');
});

test('hostile HTML, image and URL syntax never create active DOM or unsafe links', () => {
  const f = fixture();
  const text = '<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n[run](javascript:alert(3)) [encoded](java&#115;cript:alert(4)) [data](data:text/html,hi) ![remote](https://example.test/image.png)\n\n[ok](HTTPS://example.test/yes "titre")';
  f.render(text);
  for (const tag of ['script', 'img', 'iframe', 'object', 'svg', 'style']) assert.equal(tags(f.container, tag).length, 0);
  const links = tags(f.container, 'a'); assert.equal(links.length, 1); assert.equal(links[0].href, 'https://example.test/yes'); assert.equal(links[0].rel, 'noopener noreferrer');
  assert(f.container.textContent.includes('<script>alert(1)</script>')); assert(f.container.textContent.includes('[run](javascript:alert(3))'));
  assert(f.container.textContent.includes('![remote](https://example.test/image.png)'));
});

test('fenced code preserves exact CRLF, spaces, blank lines and the final line ending', async () => {
  const f = fixture(), code = '  const x = "<img onerror=x>";  \r\n\r\n\treturn x;\r\n';
  f.render('Avant\r\n\r\n```javascript\r\n' + code + '```\r\nAprès', 'user');
  const card = byClass(f.container, 'message-code')[0]; assert.equal(card.dataset.complete, 'true'); assert.equal(card.dataset.codeIndex, '0');
  assert.equal(tags(card, 'pre')[0].textContent, code); assert.equal(byClass(card, 'message-code-kind')[0].textContent, 'Code fourni');
  assert.equal(byClass(card, 'message-code-language')[0].textContent, 'javascript');
  await byClass(card, 'message-code-copy')[0].events.click(); assert.deepEqual(f.copied, [code]);
  assert.equal(byClass(card, 'message-code-status')[0].textContent, 'Code copié.'); assert.equal(byClass(card, 'message-code-status')[0].attributes.role, 'status');
  assert.equal(tags(f.container, 'img').length, 0); assert(f.container.textContent.endsWith('Après'));
});

test('unclosed and partial closing fences remain copyable without invented completion', async () => {
  const f = fixture(), code = 'if (ready) {\n  work();  \n``'; f.render('```js\n' + code);
  const card = byClass(f.container, 'message-code')[0]; assert.equal(card.dataset.complete, 'false');
  assert.equal(tags(card, 'code')[0].textContent, code); assert.equal(byClass(card, 'message-code-kind')[0].textContent, 'Code proposé');
  assert.equal(byClass(card, 'message-code-state')[0].textContent, 'Bloc non fermé');
  await byClass(card, 'message-code-copy')[0].events.click(); assert.deepEqual(f.copied, [code]);
  f.render('~~~text\nexact\n~~~~\n\n```\n\n```');
  assert.deepEqual(byClass(f.container, 'message-code').map(node => tags(node, 'code')[0].textContent), ['exact\n', '\n']);
});

test('clipboard refusal exposes manual copy, Escape and direct close restore the button focus', async () => {
  const f = fixture({ clipboard: async () => { throw Error('Denied'); } }), code = '  keep spaces  \r\n'; f.render('```txt\r\n' + code + '```');
  const card = byClass(f.container, 'message-code')[0], copy = byClass(card, 'message-code-copy')[0];
  await copy.events.click();
  const manual = byClass(card, 'message-code-manual')[0], field = byClass(manual, 'message-code-fallback')[0];
  assert.equal(field.textContent, code); assert.equal(field.attributes['aria-readonly'], 'true'); assert.equal(f.document.activeElement, field); assert.equal(f.selected, code);
  assert.match(byClass(card, 'message-code-status')[0].textContent, /indisponible/); assert.equal(copy.attributes['aria-busy'], 'false');
  let prevented = false; manual.events.keydown({ key: 'Escape', preventDefault() { prevented = true; } }); assert(prevented); assert.equal(byClass(card, 'message-code-manual').length, 0); assert.equal(f.document.activeElement, copy);
  await copy.events.click(); byClass(card, 'message-code-fallback-close')[0].events.click(); assert.equal(f.document.activeElement, copy); assert.equal(byClass(card, 'message-code-manual').length, 0);
});

test('missing Clipboard API offers the same manual fallback without claiming success', async () => {
  const f = fixture({ clipboard: null }); f.render('```\ncode\n```'); await byClass(f.container, 'message-code-copy')[0].events.click();
  assert.equal(f.copied.length, 0); assert.equal(byClass(f.container, 'message-code-fallback').length, 1); assert(!f.container.textContent.includes('Code copié.'));
});

test('success after a denied attempt removes the manual fallback and keeps exact source', async () => {
  let refuse = true; const f = fixture({ clipboard: async () => { if (refuse) throw Error('Denied'); } }); f.render('```\nx  \n```');
  const button = byClass(f.container, 'message-code-copy')[0]; await button.events.click(); assert.equal(byClass(f.container, 'message-code-manual').length, 1);
  refuse = false; button.focus(); await button.events.click(); assert.equal(byClass(f.container, 'message-code-manual').length, 0); assert.equal(byClass(f.container, 'message-code-status')[0].textContent, 'Code copié.'); assert.deepEqual(f.copied, ['x  \n', 'x  \n']);
});

test('late clipboard resolution or refusal after rerender cannot change the new view or its selection', async () => {
  for (const succeeds of [true, false]) {
    const pending = deferred(), f = fixture({ clipboard: () => pending.promise }); f.render('```\nold code\n```');
    const oldCard = byClass(f.container, 'message-code')[0], copy = byClass(oldCard, 'message-code-copy')[0]; copy.focus(); const completion = copy.events.click();
    f.render('New conversation text'); const current = tags(f.container, 'p')[0]; current.focus(); f.select(current, 4, 16); const selected = f.selected;
    assert.equal(oldCard.isConnected, false);
    if (succeeds) pending.resolve(); else pending.reject(Error('Late refusal'));
    await completion;
    assert.equal(f.container.textContent, 'New conversation text'); assert.equal(byClass(oldCard, 'message-code-manual').length, 0);
    assert.equal(byClass(oldCard, 'message-code-status')[0].textContent, ''); assert.equal(f.document.activeElement, current); assert.equal(f.selected, selected);
  }
});

test('late clipboard resolution or refusal respects a newly focused control in the same view', async () => {
  for (const succeeds of [true, false]) {
    const pending = deferred(), f = fixture({ clipboard: () => pending.promise }); f.render('Read here\n\n```\ncode\n```');
    const copy = byClass(f.container, 'message-code-copy')[0]; copy.focus(); const completion = copy.events.click();
    const control = f.document.createElement('button'); control.textContent = 'Different action'; f.container.append(control); control.focus();
    if (succeeds) pending.resolve(); else pending.reject(Error('Late refusal'));
    await completion;
    assert.equal(f.document.activeElement, control); assert.equal(byClass(f.container, 'message-code-manual').length, 0);
    assert.equal(byClass(f.container, 'message-code-status')[0].textContent, ''); assert.equal(copy.attributes['aria-busy'], 'false');
  }
});

test('late clipboard resolution or refusal cannot clear a newer selection even when focus did not change', async () => {
  for (const succeeds of [true, false]) {
    const pending = deferred(), f = fixture({ clipboard: () => pending.promise }); f.render('Select new words here\n\n```\ncode\n```');
    const copy = byClass(f.container, 'message-code-copy')[0]; copy.focus(); const completion = copy.events.click();
    f.select(tags(f.container, 'p')[0], 7, 16); const selected = f.selected;
    if (succeeds) pending.resolve(); else pending.reject(Error('Late refusal'));
    await completion;
    assert.equal(f.selected, selected); assert.equal(f.document.activeElement, copy); assert.equal(byClass(f.container, 'message-code-manual').length, 0);
    assert.equal(byClass(f.container, 'message-code-status')[0].textContent, '');
  }
});

test('one pending copy keeps keyboard focus and a current refusal still opens exact manual copy', async () => {
  const pending = deferred(), f = fixture({ clipboard: () => pending.promise }); f.render('```\ncode  \n```');
  const copy = byClass(f.container, 'message-code-copy')[0]; copy.focus(); const completion = copy.events.click(); await copy.events.click();
  assert.equal(f.copied.length, 1); assert.equal(f.document.activeElement, copy); assert.equal(copy.attributes['aria-busy'], 'true');
  pending.reject(Error('Current refusal')); await completion;
  const field = byClass(f.container, 'message-code-fallback')[0]; assert(field); assert.equal(f.document.activeElement, field); assert.equal(f.selected, 'code  \n'); assert.equal(copy.attributes['aria-busy'], 'false');
});

test('each streaming snapshot is finite, replaces old output and preserves open code source', () => {
  const f = fixture(), snapshots = ['[', '[lien](', '[lien](https://example.test)', '**mot', '**mot**\n\n```py\n  x = 1 ', '**mot**\n\n```py\n  x = 1 \n```'];
  for (const text of snapshots) { assert.equal(f.render(text), f.container); assert(descendants(f.container).length < 25); }
  assert.equal(byClass(f.container, 'message-code').length, 1); assert.equal(tags(byClass(f.container, 'message-code')[0], 'code')[0].textContent, '  x = 1 \n');
  f.render('Final'); assert.equal(f.container.textContent, 'Final'); assert.equal(byClass(f.container, 'message-code').length, 0);
});

test('malformed nesting is bounded and its remaining text stays visible', () => {
  const f = fixture(); f.render('> '.repeat(1000) + 'fin');
  assert(tags(f.container, 'blockquote').length <= 12); assert(f.container.textContent.endsWith('fin')); assert(f.container.textContent.includes('>'));
  f.render('['.repeat(30000) + 'tail'); assert.equal(f.container.textContent, '['.repeat(30000) + 'tail');
  const angles = '<https://'.repeat(30000) + 'tail'; f.render(angles); assert.equal(f.container.textContent, angles);
});

test('oversized table and list structures stop creating nodes without hiding the remainder', () => {
  const f = fixture(), headers = Array.from({ length: 130 }, (_, index) => 'h' + index).join(' | ');
  f.render(headers + '\n' + Array(130).fill('---').join(' | ') + '\ntail');
  assert.equal(tags(f.container, 'table').length, 0); assert(f.container.textContent.endsWith('tail'));
  f.render(Array.from({ length: 10050 }, (_, index) => '- row ' + index).join('\n'));
  assert(tags(f.container, 'li').length <= 10000); assert(f.container.textContent.endsWith('- row 10049'));
  const table = 'h | v\n--- | ---\n' + Array.from({ length: 6000 }, (_, index) => index + ' | value').join('\n'); f.render(table);
  assert(tags(f.container, 'td').length < 10000); assert(f.container.textContent.endsWith('5999 | value'));
});
