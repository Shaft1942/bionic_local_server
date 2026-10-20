import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createBionicStore } from '../lib/bionic-store.mjs';

const scratch = await mkdtemp(path.join(tmpdir(), 'bionic-store-test-'));
const root = path.join(scratch, 'native');
const project = path.join(root, 'projects', 'projectA');
const external = path.join(scratch, 'registered-external');
const unregistered = path.join(root, 'projects', 'unregistered');
const writers = [];

async function database(directory) {
  await mkdir(path.join(directory, '.internal'), { recursive: true });
  const db = new DatabaseSync(path.join(directory, '.internal', 'ng-sessions.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE sessions(session_id TEXT PRIMARY KEY, session_name TEXT, suggested_session_name TEXT,
      committed_head_entry_id TEXT, session_json TEXT NOT NULL, updated_timestamp INTEGER,
      parent_session_id TEXT, companion_session_as TEXT, is_transient INTEGER DEFAULT 0, is_temporary INTEGER DEFAULT 0);
    CREATE TABLE chat_entries(id TEXT PRIMARY KEY, previous_id TEXT, redirect_to_id TEXT, entry_json TEXT NOT NULL);`);
  writers.push(db);
  return db;
}
function addSession(db, id, head, config = {}, attributes = {}) {
  const { name = 'Fixture chat', parent = null, transient = 0, temporary = 0 } = attributes;
  db.prepare(`INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, name, null, head,
    JSON.stringify({ baseSystemPrompt: 'PRIVATE SYSTEM INSTRUCTION', modelSpecifier: { type: 'indexed', indexedModelIdentifier: 'fixture-model' }, ...config }),
    1000, parent, null, transient, temporary);
}
function addEntry(db, id, previous, data, redirect = null) {
  db.prepare('INSERT INTO chat_entries VALUES(?,?,?,?)').run(id, previous, redirect,
    JSON.stringify({ id, previousId: previous ?? undefined, ...data }));
}
function message(db, id, previous, role, text, extra = {}) {
  addEntry(db, id, previous, { type: 'message', createdTimestamp: 123,
    message: { role, parts: [{ type: 'text', text }, ...(extra.parts ?? [])] }, hidden: extra.hidden });
}
const defaultDb = await database(root);
const db = await database(project);
const externalDb = await database(external);
await database(unregistered);
await writeFile(path.join(project, 'project.json'), JSON.stringify({ name: 'Fixture project', projectType: 'code' }));
await writeFile(path.join(external, 'project.json'), JSON.stringify({ name: 'External fixture', projectType: 'regular' }));
await writeFile(path.join(root, '.internal', 'projects-registry.json'), JSON.stringify({ json: { version: 1, projects: [
  ['default', { path: root }], ['projectA', { path: project }], ['external', { path: external }],
] } }));
message(db, 'old-user', null, 'user', 'SUPERSEDED USER');
message(db, 'old-assistant', 'old-user', 'assistant', 'SUPERSEDED ANSWER');
message(db, 'new-user', null, 'user', 'Replacement question');
message(db, 'new-assistant', 'new-user', 'assistant', 'Replacement answer');
addEntry(db, 'redirect', 'old-assistant', { type: 'redirect', from: 'old-assistant', to: 'new-assistant' }, 'new-assistant');
message(db, 'later-user', 'redirect', 'user', 'Latest question', { parts: [{ type: 'image', fileName: 'PRIVATE FILE' }] });
message(db, 'hidden', 'later-user', 'assistant', 'HIDDEN ASSISTANT', { hidden: true });
message(db, 'tool', 'hidden', 'tool', 'PRIVATE TOOL RESULT');
message(db, 'latest-assistant', 'tool', 'assistant', 'Latest answer', { parts: [{ type: 'reasoning', text: 'PRIVATE REASONING' }, { type: 'toolCallRequest', parameters: { secret: 'PRIVATE TOOL PARAMETERS' } }] });
message(db, 'unused-branch', null, 'user', 'UNCOMMITTED BRANCH');
addSession(db, 'chatA', 'latest-assistant');
addSession(db, 'child', 'new-assistant', { subSessionType: 'task' }, { parent: 'chatA', transient: 1 });
addSession(db, 'archived', 'new-assistant', { isArchived: true });
addSession(db, 'temporary', null, {}, { temporary: 1 });
addSession(externalDb, 'external-chat', null);
const store = createBionicStore({ root });

async function fingerprint(directory) {
  const result = {};
  for (const name of await readdir(path.join(directory, '.internal'))) {
    if (!/\.sqlite(?:-wal)?$/.test(name)) continue;
    const bytes = await readFile(path.join(directory, '.internal', name));
    result[name] = createHash('sha256').update(bytes).digest('hex');
  }
  return result;
}

test('registered projects include default and external, never scanned folders', async () => {
  assert.deepEqual(await store.listProjects(), [
    { id: 'default', name: 'Sans projet', type: 'default', sessionsCount: 0 },
    { id: 'projectA', name: 'Fixture project', type: 'code', sessionsCount: 1 },
    { id: 'external', name: 'External fixture', type: 'regular', sessionsCount: 1 },
  ]);
});
test('sessions omit temporary, transient, sub-session and archived items by default', async () => {
  const sessions = await store.listSessions('projectA');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'chatA');
  assert.equal(sessions[0].model, 'fixture-model');
  assert.ok(!JSON.stringify(sessions).includes('PRIVATE SYSTEM'));
  assert.equal((await store.listSessions('projectA', { includeArchived: true, includeSubSessions: true })).length, 4);
});
test('deferred redirects replace the correct earlier branch without dropping later messages', async () => {
  const conversation = await store.getConversation('projectA', 'chatA');
  assert.deepEqual(conversation.messages.map(m => m.id), ['new-user', 'new-assistant', 'later-user', 'latest-assistant']);
  assert.equal(conversation.redirectsSeen, 1);
  assert.equal(conversation.truncated, false);
  assert.equal(conversation.readOnly, true);
  assert.equal(conversation.historyProjection, 'bionic-visible-context');
  const json = JSON.stringify(conversation);
  for (const secret of ['SUPERSEDED', 'UNCOMMITTED', 'HIDDEN', 'PRIVATE']) assert.ok(!json.includes(secret));
  assert.deepEqual(conversation.omitted, { reasoningParts: 1, toolMessages: 1, attachments: 1, hiddenMessages: 1 });
});
test('conversation limits keep recent messages and disclose truncation', async () => {
  const conversation = await store.getConversation('projectA', 'chatA', { maxMessages: 2 });
  assert.deepEqual(conversation.messages.map(m => m.id), ['later-user', 'latest-assistant']);
  assert.equal(conversation.truncated, true);
  assert.ok(conversation.truncationReasons.includes('message_limit'));
  const chars = await store.getConversation('projectA', 'chatA', { maxChars: 5 });
  assert.equal(chars.messages[0].text.length, 5);
  assert.equal(chars.messages[0].textTruncated, true);
});
test('IDs reject traversal and arbitrary project paths, sessions are project scoped', async () => {
  for (const id of ['../projectA', 'C:\\private', '', 'a/b', 'a%2fb']) {
    await assert.rejects(() => store.listSessions(id), { code: 'INVALID_ID', status: 400 });
  }
  await assert.rejects(() => store.listSessions('unregistered'), { code: 'PROJECT_NOT_FOUND', status: 404 });
  await assert.rejects(() => store.getConversation('external', 'chatA'), { code: 'SESSION_NOT_FOUND', status: 404 });
});
test('read-only connection reads live WAL and changes no database or WAL bytes', async () => {
  const before = await fingerprint(project);
  message(db, 'wal-message', 'new-assistant', 'user', 'WAL fixture');
  addSession(db, 'wal-session', 'wal-message');
  const committed = await fingerprint(project);
  assert.notDeepEqual(before, committed);
  const conversation = await store.getConversation('projectA', 'wal-session');
  assert.equal(conversation.messages.at(-1).text, 'WAL fixture');
  assert.deepEqual(await fingerprint(project), committed);
  const readOnly = new DatabaseSync(path.join(project, '.internal', 'ng-sessions.sqlite'), { readOnly: true });
  assert.throws(() => readOnly.exec("INSERT INTO chat_entries VALUES('bad',NULL,NULL,'{}')"), /readonly/i);
  readOnly.close();
});
test('snapshot fallback includes WAL, changes no source bytes and removes temporary copies', async () => {
  const before = await fingerprint(project);
  const temporaryBefore = (await readdir(tmpdir())).filter(name => name.startsWith('bionic-mobile-read-')).sort();
  const snapshotStore = createBionicStore({ root, snapshotOnly: true });
  const conversation = await snapshotStore.getConversation('projectA', 'wal-session');
  assert.equal(conversation.storageReadMode, 'snapshot-readonly');
  assert.equal(conversation.messages.at(-1).text, 'WAL fixture');
  assert.deepEqual(await fingerprint(project), before);
  assert.deepEqual((await readdir(tmpdir())).filter(name => name.startsWith('bionic-mobile-read-')).sort(), temporaryBefore);
});
test('cycles, missing links and malformed redirects are explicit', async () => {
  addEntry(db, 'cycle', 'cycle', { type: 'stateChange' });
  addSession(db, 'cycle-session', 'cycle');
  assert.ok((await store.getConversation('projectA', 'cycle-session')).truncationReasons.includes('cycle'));
  addSession(db, 'missing-session', 'absent');
  assert.ok((await store.getConversation('projectA', 'missing-session')).truncationReasons.includes('missing_entry'));
  addEntry(db, 'bad-redirect', null, { type: 'redirect', from: 'old-user', to: 'old-assistant' }, 'new-assistant');
  addSession(db, 'bad-session', 'bad-redirect');
  assert.ok((await store.getConversation('projectA', 'bad-session')).truncationReasons.includes('invalid_redirect'));
});

test('native attachment metadata becomes a readable reference without local paths', async () => {
  message(db, 'attachment-markup', null, 'user', '<user-attachment>\n<name>document.txt</name>\n<path>C:\\private\\document.txt</path>\n<identifier>SECRET_INTERNAL_ID</identifier>\n</user-attachment>\nExplique le document.');
  addSession(db, 'attachment-session', 'attachment-markup');
  const chat = await store.getConversation('projectA', 'attachment-session');
  assert.equal(chat.omitted.attachments, 1);
  assert(chat.messages[0].text.includes('document.txt'));
  assert(chat.messages[0].text.includes('Contenu non transmis'));
  assert(!chat.messages[0].text.includes('C:\\private'));
  assert(!chat.messages[0].text.includes('SECRET_INTERNAL_ID'));
});

test.after(async () => {
  for (const writer of writers) writer.close();
  assert.ok(path.resolve(scratch).startsWith(`${path.resolve(tmpdir())}${path.sep}`));
  assert.ok(path.basename(scratch).startsWith('bionic-store-test-'));
  await rm(scratch, { recursive: true, force: true });
});
