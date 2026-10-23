import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createConversationRepository, pageItems, pageMessages } from '../lib/conversation-repository.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-chat-repository-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'chats'); await fs.mkdir(directory);
  const states = new Map(), measurements = {}; let reads = 0;
  const readChat = async id => { reads++; const chat = JSON.parse(await fs.readFile(path.join(directory, id + '.json'), 'utf8')); states.set(id, { chat, serializedBytes: 200, writes: Promise.resolve() }); return chat; };
  const make = () => createConversationRepository({ directory, fs, readChat, states, measurements, maxCached: 2 });
  const ids = [];
  for (let i = 0; i < 5; i++) { const id = 'web-' + randomUUID(); ids.push(id); await fs.writeFile(path.join(directory, id + '.json'), JSON.stringify({ id, projectId: 'p', name: 'Fixture ' + i, messages: [{ role: 'user', id: 'u' + i, text: 'Never in summary', requestId: 'request-' + i }, { role: 'assistant', id: 'a' + i, text: 'Private text', outcome: 'completed', finishedAt: 10 + i }] })); }
  return { root, directory, states, measurements, ids, make, reads: () => reads };
}

test('persistent summaries and request identities avoid hydrating histories after restart', async t => {
  const f = await fixture(t), first = f.make();
  const snapshot = await first.scan();
  assert.equal(snapshot.chats.length, 5); assert.equal(f.reads(), 5);
  assert.equal(snapshot.chats[0].messages, undefined);
  assert.equal(snapshot.chats[0].requests.length, 1);
  assert(!JSON.stringify(snapshot).includes('Private text'));
  f.states.clear();
  const second = f.make(); await second.scan();
  assert.equal(f.reads(), 5);
  assert.equal(f.states.size, 0);
});

test('cache eviction bounds idle history and keeps pending/running state', async t => {
  const f = await fixture(t), api = f.make(); await api.scan();
  for (const id of f.ids) if (!f.states.has(id)) await fs.readFile(path.join(f.directory, id + '.json'), 'utf8').then(bytes => f.states.set(id, { chat: JSON.parse(bytes), serializedBytes: 200 }));
  f.states.get(f.ids[0]).running = true;
  f.states.get(f.ids[1]).pendingWrites = 1;
  api.trim();
  assert.equal(f.states.size, 2);
  assert(f.states.has(f.ids[0])); assert(f.states.has(f.ids[1]));
});

test('legacy messages have deterministic DTO identities for pagination without changing their source records', () => {
  const original = Array.from({ length: 101 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'Legacy ' + i }));
  const current = pageMessages(original, { limit: 100 });
  assert.equal(current.hasMore, true); assert.equal(typeof current.nextCursor, 'string');
  const older = pageMessages(original, { limit: 100, before: current.nextCursor });
  assert.equal(older.items.length, 1); assert.equal(older.hasMore, false);
  assert.equal(original[0].id, undefined);
  const duplicates = pageMessages([{ id: 'same', role: 'user', text: 'a' }, { id: 'same', role: 'assistant', text: 'b' }], { limit: 1 });
  assert.equal(duplicates.hasMore, true); assert.notEqual(duplicates.items[0].id, 'same');
  assert.equal(pageMessages([{ id: 'same', role: 'user', text: 'a' }, { id: 'same', role: 'assistant', text: 'b' }], { before: duplicates.nextCursor }).items[0].text, 'a');
});

test('broken derived index is preserved while summaries rebuild from authoritative JSON', async t => {
  const f = await fixture(t), filename = path.join(f.root, 'chat-index.json'), bytes = '{broken'; await fs.writeFile(filename, bytes);
  const snapshot = await f.make().scan();
  assert.equal(snapshot.chats.length, 5);
  assert(snapshot.warnings.some(item => item.code === 'CHAT_INDEX_REBUILT'));
  assert.equal(await fs.readFile(filename, 'utf8'), bytes);
});

test('valid JSON with malformed summary entries rebuilds without blocking authoritative conversations', async t => {
  const f = await fixture(t), filename = path.join(f.root, 'chat-index.json');
  const bytes = JSON.stringify({ version: 1, entries: [{ id: f.ids[0], size: 1, mtimeMs: 1, summary: { id: f.ids[0], projectId: 'p', name: 'Malformed', queue: [null], activity: [], requests: [] } }] });
  await fs.writeFile(filename, bytes);
  const snapshot = await f.make().scan();
  assert.equal(snapshot.chats.length, 5);
  assert(snapshot.warnings.some(item => item.code === 'CHAT_INDEX_REBUILT'));
  assert.equal(await fs.readFile(filename, 'utf8'), bytes);
});

test('cursor pagination detects stale cursors rather than skipping unseen history', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ id: String(i) }));
  const first = pageItems(items, { limit: 2 });
  assert.deepEqual(first.items.map(item => item.id), ['0', '1']);
  assert.deepEqual(pageItems(items, { limit: 2, before: first.nextCursor }).items.map(item => item.id), ['2', '3']);
  assert.throws(() => pageItems(items, { before: 'stale' }), { status: 409 });
});
