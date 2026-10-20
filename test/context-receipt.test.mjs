import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextReceipt, addToolRead, markContextTransmitted } from '../lib/context-receipt.mjs';

const source = { id: 'history-1', role: 'user', text: 'Question précédente', attachments: [{ name: 'notes.md', path: 'notes.md', rootId: 'project', hash: 'snapshot-hash', text: 'Ancienne version figée.', excerpt: true }] };
const candidate = { source, index: 2 };
const fixture = overrides => createContextReceipt({ chat: { messages: [{}, {}, source], importedTruncated: true }, candidates: [{ source: { id: 'omitted' }, index: 0 }, candidate], selected: [candidate], prompt: 'Suite', messageId: 'current', attachments: [], vision: false, fileAccess: false, ...overrides });

test('context receipt describes only selected history and existing immutable attachment snapshots', () => {
  const receipt = fixture();
  assert.deepEqual(receipt.history, { availableCount: 2, selectedCount: 1, omittedCount: 1, importedTruncated: true, messages: [{ id: source.id, index: 2, role: 'user', preview: source.text, characters: source.text.length }] });
  assert.equal(receipt.attachments[0].hash, 'snapshot-hash');
  assert.equal(receipt.attachments[0].preview, source.attachments[0].text);
  assert.equal(receipt.attachments[0].messageId, source.id);
  assert.equal(receipt.attachments[0].characters, source.attachments[0].text.length);
  assert.equal(receipt.attachments[0].excerpt, true);
  assert.equal(receipt.initialTransmitted, false);
  assert.deepEqual(receipt.toolReads, []);
  assert.equal(receipt.toolsEnabled, false);
});

test('images omitted for lack of vision are explicitly distinguished from transmitted text', () => {
  const receipt = fixture({ attachments: [{ name: 'photo.png', kind: 'image', hash: 'image-hash' }, { name: 'text.md', text: 'Text only' }] });
  assert.equal(receipt.attachments[1].transmitted, false);
  assert.equal(receipt.attachments[1].reason, 'vision-disabled');
  assert.equal(receipt.attachments[1].characters, 0);
  assert.equal(receipt.attachments[2].eligible, true);
  assert.equal(receipt.attachments[2].transmitted, false);
  assert.equal(receipt.attachments[2].source, 'current');
  markContextTransmitted(receipt);
  assert.equal(receipt.attachments[1].transmitted, false);
  assert.equal(receipt.attachments[2].transmitted, true);
});

test('tool read receipts reuse exact successful output, distinguish dispatch and cap persistent excerpts', () => {
  const receipt = fixture();
  addToolRead(receipt, { ok: false, id: 'failed' }, { text: 'Never delivered' });
  assert.equal(receipt.toolReads.length, 0);
  const read = { path: 'notes.md', hash: 'h1', start: 7, text: 'Exact passage', totalCharacters: 100 };
  addToolRead(receipt, { ok: true, id: 'read-1' }, read);
  assert.deepEqual(receipt.toolReads[0], { actionId: 'read-1', ...read, length: read.text.length, transmitted: false });
  markContextTransmitted(receipt);
  assert.equal(receipt.initialTransmitted, true);
  assert.equal(receipt.toolReads[0].transmitted, true);
  addToolRead(receipt, { ok: true, id: 'read-2' }, { ...read, text: 'X'.repeat(13000) });
  assert.equal(receipt.toolReadCharacters, 12000);
  assert.equal(receipt.toolReads[1].length, 13000);
  assert.equal(receipt.toolReads[1].truncated, true);
  assert.equal(receipt.toolReads[1].transmitted, false);
  assert.equal(receipt.toolReads.reduce((size, item) => size + item.text.length, 0), 12000);
});

test('receipt previews are bounded and do not duplicate full message or attachment content', () => {
  const long = 'P'.repeat(3000);
  const receipt = fixture({ prompt: long, selected: [{ source: { role: 'user', text: long }, index: 0 }], attachments: [{ name: 'big.txt', text: long }] });
  assert.equal(receipt.history.messages[0].preview.length, 240);
  assert.equal(receipt.attachments[0].preview.length, 240);
  assert.equal(receipt.current.characters, long.length);
  assert(!JSON.stringify(receipt).includes(long));
});
