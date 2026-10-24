import test from 'node:test';
import assert from 'node:assert/strict';
import { copyMessageText } from '../ui/src/lib/companion/message-clipboard.ts';

const source = '  **Texte exact**\r\n\r\n```js\nconst café = "été 🌿";\n```\n';

function fallback({ accepted = true, emit = true, deny = false } = {}) {
  let handler, active, restored, removed = false, written;
  const original = { isConnected: true, selectionStart: 2, selectionEnd: 5, selectionDirection: 'backward', focus() { active = original; }, setSelectionRange(...value) { restored = value; } };
  active = original;
  const document = { get activeElement() { return active; }, body: { append() {} }, getSelection: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, focus() { active = this; }, select() {}, remove() { removed = true; } }),
    addEventListener(type, fn) { assert.equal(type, 'copy'); handler = fn; }, removeEventListener(type, fn) { assert.equal(fn, handler); handler = undefined; },
    execCommand(command) { assert.equal(command, 'copy'); if (emit) handler({ clipboardData: { setData(type, text) { assert.equal(type, 'text/plain'); if (deny) throw Error('Denied'); written = text; } }, preventDefault() {} }); return accepted; },
  };
  return { document, prove() { return { written, removed, restored, originalFocused: active === original, listenerRemoved: !handler }; } };
}

test('modern clipboard receives the exact source and reports only resolved writes', async () => {
  let actual;
  assert.deepEqual(await copyMessageText(source, { navigator: { clipboard: { async writeText(value) { actual = value; } } } }), { method: 'clipboard' });
  assert.equal(actual, source);
});

test('HTTP or denied modern clipboard uses a confirmed exact text/plain copy event and restores focus/selection', async () => {
  const f = fallback();
  const result = await copyMessageText(source, { navigator: { clipboard: { async writeText() { throw Error('Denied'); } } }, document: f.document });
  assert.deepEqual(result, { method: 'legacy' });
  assert.deepEqual(f.prove(), { written: source, removed: true, restored: [2, 5, 'backward'], originalFocused: true, listenerRemoved: true });
});

for (const options of [{ accepted: false }, { emit: false }, { deny: true }]) test(`fallback never claims success after browser refusal ${JSON.stringify(options)}`, async () => {
  const f = fallback(options);
  await assert.rejects(copyMessageText(source, { navigator: {}, document: f.document }), { code: 'clipboard-unavailable' });
  assert.equal(f.prove().removed, true); assert.equal(f.prove().originalFocused, true); assert.equal(f.prove().listenerRemoved, true);
});

test('an obsolete asynchronous write never falls back after component cancellation', async () => {
  const controller = new AbortController(); let rejectWrite, fallbackCalls = 0;
  const pending = copyMessageText(source, { signal: controller.signal, navigator: { clipboard: { writeText: () => new Promise((resolve, reject) => { rejectWrite = reject; }) } }, document: { get body() { fallbackCalls++; throw Error('Unexpected fallback'); } } });
  controller.abort(); rejectWrite(Error('Denied after unmount'));
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(fallbackCalls, 0);
});

test('missing clipboard capabilities fail honestly without coercing a missing message', async () => {
  await assert.rejects(copyMessageText(source, { navigator: {}, document: {} }), { code: 'clipboard-unavailable' });
  await assert.rejects(copyMessageText(null, { navigator: {} }), TypeError);
});
