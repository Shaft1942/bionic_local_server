import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const dismissalSource = source.slice(source.indexOf('function installOutsideDismissals('), source.indexOf('\ninstallOutsideDismissals();'));
function fixture(kind = 'dialog') {
  const listeners = {}, opener = { focus() { document.activeElement = this; }, setAttribute(name, value) { this[name] = value; }, contains(target) { return target === this; } };
  const inside = {}, outside = {};
  const surface = { id: kind === 'options' ? 'conversation-options' : 'composer-files', isConnected: true, open: true, hidden: false,
    contains(target) { return target === this || target === inside; },
    matches(selector) { return selector === 'dialog' && kind === 'dialog'; },
    getBoundingClientRect() { return { left: 10, top: 10, right: 110, bottom: 110 }; },
    close() { this.open = false; document.activeElement = opener; }, querySelector() { return opener; } };
  const document = { activeElement: inside, getElementById() { return opener; }, querySelectorAll() { return (kind === 'options' ? !surface.hidden : surface.open) ? [surface] : []; }, addEventListener(type, listener) { listeners[type] = listener; } };
  const context = vm.createContext({ document, window: { addEventListener(type, listener) { listeners[type] = listener; } } });
  vm.runInContext(dismissalSource + '\ninstallOutsideDismissals();', context);
  const fire = (type, target, x = 5, y = 5) => listeners[type]({ target, button: 0, isPrimary: true, clientX: x, clientY: y });
  return { document, surface, inside, outside, opener, fire };
}

test('dialog only closes after a whole backdrop click and restores focus', () => {
  const f = fixture();
  f.fire('pointerdown', f.surface, 20, 20); f.fire('click', f.surface, 20, 20);
  assert.equal(f.surface.open, true, 'dialog padding is interior');
  f.fire('pointerdown', f.inside, 20, 20); f.fire('click', f.surface);
  assert.equal(f.surface.open, true, 'drag from interior is preserved');
  f.fire('pointerdown', f.surface); f.fire('click', f.inside, 20, 20);
  assert.equal(f.surface.open, true, 'drag ending inside is preserved');
  f.fire('pointerdown', f.surface); f.fire('pointercancel', f.surface); f.fire('click', f.surface);
  assert.equal(f.surface.open, true, 'cancelled gesture cannot dismiss');
  f.fire('pointerdown', f.surface); f.fire('click', f.surface);
  assert.equal(f.surface.open, false); assert.equal(f.document.activeElement, f.opener);
});

for (const kind of ['tools', 'options']) test(kind + ' outside click preserves the chosen focus or returns it to its opener', () => {
  const f = fixture(kind);
  f.fire('pointerdown', f.inside); f.fire('click', f.outside);
  assert.equal(f.surface.open, true); assert.equal(f.surface.hidden, false);
  f.fire('pointerdown', f.outside); f.fire('click', f.outside);
  assert.equal(kind === 'options' ? f.surface.hidden : !f.surface.open, true);
  assert.equal(f.document.activeElement, f.opener);
  const next = fixture(kind); next.document.activeElement = next.outside;
  next.fire('pointerdown', next.outside); next.fire('click', next.outside);
  assert.equal(next.document.activeElement, next.outside);
});

const mergeContext = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function mergeConversationPage('), source.indexOf('\nasync function fetchConversationPage(')), mergeContext);
const message = id => ({ id: String(id), role: 'assistant', text: 'Version ' + id });
const chat = (start, end, hasMore = start > 0) => ({ id: 'chat', projectId: 'project', messages: Array.from({ length: end - start }, (_, index) => message(start + index)), pagination: { total: end, hasMore, nextCursor: hasMore ? String(start) : null } });
test('new recent pages preserve the loaded prefix and update current message versions', () => {
  const previous = chat(50, 250), incoming = chat(152, 252);
  incoming.messages[0].text = 'Updated current content';
  const merged = mergeContext.mergeConversationPage(previous, incoming);
  assert.equal(merged.messages.length, 202); assert.equal(merged.messages[0].id, '50'); assert.equal(merged.messages.at(-1).id, '251');
  assert.equal(merged.messages[102].text, 'Updated current content'); assert.equal(merged.pagination.total, 252); assert.equal(merged.pagination.nextCursor, '50');
});
test('older pages are deduplicated without replacing newer message state or losing complete history on refresh', () => {
  const previous = chat(100, 250), incoming = chat(0, 110, false);
  previous.messages[0].text = 'Fresh version';
  const merged = mergeContext.mergeConversationPage(previous, incoming, true);
  assert.equal(merged.messages.length, 250); assert.equal(merged.messages[100].text, 'Fresh version'); assert.equal(merged.pagination.hasMore, false);
  const latest = mergeContext.mergeConversationPage(merged, chat(150, 250));
  assert.equal(latest.messages.length, 250); assert.equal(latest.pagination.hasMore, false);
});
test('a disconnected recent window is explicit instead of silently presenting a gap as complete history', () => {
  const result = mergeContext.mergeConversationPage(chat(0, 100, false), chat(250, 350));
  assert.equal(result.messages.length, 100); assert.equal(result.historyWindowReset, true); assert.equal(result.pagination.hasMore, true);
});
