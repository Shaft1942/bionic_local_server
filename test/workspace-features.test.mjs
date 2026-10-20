import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { createWorkspaceFeatures } from '../lib/workspace-features.mjs';
import { createProjectFiles } from '../lib/project-files.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-workspace-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const folder = path.join(directory, 'project'), other = path.join(directory, 'other');
  await fs.mkdir(folder); await fs.mkdir(other);
  const registryPath = path.join(directory, 'registry.json');
  await fs.writeFile(registryPath, JSON.stringify({ projects: [['p1', { projectWorkingDirectoryPath: folder }], ['p2', { projectWorkingDirectoryPath: other }]] }));
  const projectFiles = createProjectFiles({ registryPath, backupDirectory: path.join(directory, 'backups') });
  let projects = [{ id: 'p1', name: 'Premier projet' }, { id: 'p2', name: 'Autre projet' }];
  const chat = { id: 'web-' + randomUUID(), projectId: 'p1', name: 'Conversation', messages: [
    { id: randomUUID(), role: 'user', text: 'Question', createdAt: 100 },
    { id: randomUUID(), role: 'assistant', text: '<script>alert("texte conservé")</script>\nRéponse', createdAt: 110, finishedAt: 200, outcome: 'completed', actions: [] },
  ] };
  const chats = [chat]; let reads = 0;
  const make = () => createWorkspaceFeatures({ directory: path.join(directory, 'workspace'), projectFiles, listProjects: async () => projects,
    listWebChats: async pid => chats.filter(item => item.projectId === pid),
    readConversation: async (pid, id) => { reads++; const result = chats.find(item => item.id === id && item.projectId === pid); if (!result) throw Object.assign(new Error('Missing'), { status: 404 }); return result; } });
  const api = make();
  const pinMessage = (extra = {}) => api.pinDeliverable({ projectId: 'p1', chatId: chat.id, messageId: chat.messages[1].id, kind: 'message', ...extra });
  async function writeAction(name = 'notes.html', content = '<h1>Projet</h1>') {
    await fs.writeFile(path.join(folder, name), content);
    const action = { id: randomUUID(), name: 'write_project_file', path: name, hash: digest(Buffer.from(content)), ok: true };
    chat.messages[1].actions.push(action);
    return action;
  }
  const pinFile = (action, extra = {}) => api.pinDeliverable({ projectId: 'p1', chatId: chat.id, messageId: chat.messages[1].id, actionId: action.id, kind: 'file', ...extra });
  return { directory, folder, api, make, chat, chats, pinMessage, writeAction, pinFile, removeProjects: () => { projects = []; }, reads: () => reads };
}

test('activity uses real assistant terminal metadata and stable ids, without inspecting project files', async t => {
  const f = await fixture(t), first = f.chat.messages[1];
  f.chat.messages.push({ id: randomUUID(), role: 'assistant', text: 'finished according to model', createdAt: 220, complete: true });
  const second = { id: randomUUID(), role: 'assistant', text: '', finishedAt: 300, outcome: 'error' };
  f.chat.messages.push(second);
  const result = await f.api.activity();
  assert.equal(result.truncated, false);
  assert.deepEqual(result.events.map(e => [e.id, e.outcome, e.finishedAt]), [[`${f.chat.id}:${second.id}`, 'error', 300], [`${f.chat.id}:${first.id}`, 'completed', 200]]);
  assert.equal(result.events[0].projectName, 'Premier projet');
  assert(!JSON.stringify(result).includes('according to model'));
  assert.deepEqual((await f.api.activity('p2')).events, []);
  await assert.rejects(f.api.activity('unknown'), { status: 404 });
  await assert.rejects(f.api.activity('../p1'), { status: 400 });
});

test('activity bounds events to the latest 100 and never includes native histories', async t => {
  const f = await fixture(t);
  f.chat.messages = Array.from({ length: 105 }, (_, i) => ({ id: randomUUID(), role: 'assistant', text: '', finishedAt: 1000 + i, outcome: ['completed', 'stopped', 'error', 'interrupted'][i % 4] }));
  f.chats.push({ id: 'native-chat', projectId: 'p1', name: 'Native', messages: [{ id: 'native-reply', role: 'assistant', finishedAt: 99999, outcome: 'completed' }] });
  const result = await f.api.activity('p1');
  assert(result.truncated); assert.equal(result.events.length, 100);
  assert.equal(result.events[0].finishedAt, 1104); assert.equal(result.events.at(-1).finishedAt, 1005);
  assert.equal(f.reads(), 1);
});

test('response copies survive reload, stay immutable, contain no bytes in list and download passively', async t => {
  const f = await fixture(t), original = f.chat.messages[1].text;
  const pin = await f.pinMessage({ title: '<b>Une note</b>' });
  f.chat.messages[1].text = 'Une autre réponse';
  const reloaded = f.make(), detail = await reloaded.getDeliverable('p1', pin.id);
  assert.equal(detail.title, '<b>Une note</b>'); assert.equal(detail.text, original);
  assert.equal(detail.sourceStatus, 'snapshot'); assert(!('bytes' in detail));
  const list = await reloaded.listDeliverables('p1');
  assert.equal(list.deliverables.length, 1); assert(!('text' in list.deliverables[0])); assert(!('bytes' in list.deliverables[0]));
  const download = await reloaded.downloadDeliverable('p1', pin.id);
  assert.equal(download.bytes.toString(), original); assert.equal(download.inline, false);
  assert.equal(download.mime, 'text/plain; charset=utf-8'); assert.match(download.name, /\.txt$/);
  assert(!/[<>\\/:"|?*]/.test(download.name));
});

test('duplicate pins are idempotent under concurrent requests and renames only change shelf title', async t => {
  const f = await fixture(t), original = f.chat.messages[1].text;
  const pins = await Promise.all(Array.from({ length: 8 }, () => f.pinMessage({ title: 'Note' })));
  assert.equal(new Set(pins.map(pin => pin.id)).size, 1);
  const renamed = await f.api.renameDeliverable({ projectId: 'p1', id: pins[0].id, title: 'Nouveau titre' });
  assert.equal(renamed.title, 'Nouveau titre'); assert.equal(f.chat.messages[1].text, original);
  assert.equal((await f.api.listDeliverables('p1')).deliverables.length, 1);
  for (const title of ['', '  ', 'x'.repeat(121), 'bad\r\nname', undefined]) await assert.rejects(f.api.renameDeliverable({ projectId: 'p1', id: pins[0].id, title }), { status: 400 });
});

test('project membership is enforced for every shelf access, including deleted projects', async t => {
  const f = await fixture(t), pin = await f.pinMessage();
  assert.deepEqual((await f.api.listDeliverables('p2')).deliverables, []);
  for (const method of ['getDeliverable', 'downloadDeliverable']) await assert.rejects(f.api[method]('p2', pin.id), { status: 404 });
  for (const method of ['renameDeliverable', 'removeDeliverable']) await assert.rejects(f.api[method]({ projectId: 'p2', id: pin.id, title: 'Titre' }), { status: 404 });
  await assert.rejects(f.pinMessage({ projectId: 'p2' }), { status: 404 });
  await assert.rejects(f.api.getDeliverable('p1', '../../outside'), { status: 400 });
  await assert.rejects(f.api.getDeliverable('p1', randomUUID()), { status: 404 });
  f.removeProjects();
  await assert.rejects(f.api.getDeliverable('p1', pin.id), { status: 404 });
  await assert.rejects(f.api.downloadDeliverable('p1', pin.id), { status: 404 });
  await assert.rejects(f.api.listDeliverables('p1'), { status: 404 });
});

test('only successful and unchanged write actions can supply file copies; snapshots survive source changes and deletion', async t => {
  const f = await fixture(t), action = await f.writeAction();
  const pin = await f.pinFile(action);
  assert.equal(pin.sourceStatus, 'unchanged');
  assert.equal((await f.api.downloadDeliverable('p1', pin.id)).mime, 'application/octet-stream');
  await fs.writeFile(path.join(f.folder, action.path), 'Changed on PC');
  assert.equal((await f.api.getDeliverable('p1', pin.id)).sourceStatus, 'changed');
  await assert.rejects(f.pinFile(action), { status: 409 });
  await fs.unlink(path.join(f.folder, action.path));
  const missing = await f.api.getDeliverable('p1', pin.id);
  assert.equal(missing.sourceStatus, 'missing'); assert.equal(missing.text, '<h1>Projet</h1>');
  assert.equal((await f.api.downloadDeliverable('p1', pin.id)).bytes.toString(), '<h1>Projet</h1>');
  await f.api.removeDeliverable({ projectId: 'p1', id: pin.id });
  await assert.rejects(f.api.getDeliverable('p1', pin.id), { status: 404 });
  assert.equal((await f.api.listDeliverables('p1')).deliverables.length, 0);
});

test('removing or renaming a copied file never modifies the project source', async t => {
  const f = await fixture(t), action = await f.writeAction('source.md', 'Preserve PC');
  const pin = await f.pinFile(action);
  await f.api.renameDeliverable({ projectId: 'p1', id: pin.id, title: 'Autre titre' });
  await f.api.removeDeliverable({ projectId: 'p1', id: pin.id });
  assert.equal(await fs.readFile(path.join(f.folder, 'source.md'), 'utf8'), 'Preserve PC');
});

test('failed, restored, read-only, forged actions and client supplied paths cannot be pinned', async t => {
  const f = await fixture(t), action = await f.writeAction();
  const cases = [{ ok: false }, { restored: true }, { name: 'read_project_file' }, { hash: 'bad' }, { path: '../registry.json' }, { path: '.env' }];
  const saved = { ...action };
  for (const update of cases) {
    Object.assign(action, saved, update);
    await assert.rejects(f.pinFile(action), e => [400, 403, 409].includes(e.status));
  }
  Object.assign(action, saved);
  await assert.rejects(f.pinFile({ id: randomUUID() }), { status: 409 });
  await assert.rejects(f.pinFile({ id: '../../private' }), { status: 400 });
  const pin = await f.pinMessage({ path: '../registry.json', bytes: 'forged' });
  assert.equal((await f.api.getDeliverable('p1', pin.id)).text, f.chat.messages[1].text);
});

test('native assistant text can be copied with stable identifiers and no native history writes', async t => {
  const f = await fixture(t);
  const native = { id: 'native-session-123', projectId: 'p1', source: 'bionic', readOnly: true, messages: [{ id: 'entry-123', role: 'assistant', text: 'Texte Bionic' }] };
  f.chats.push(native);
  const before = JSON.stringify(native);
  const pin = await f.api.pinDeliverable({ projectId: 'p1', chatId: native.id, messageId: 'entry-123', kind: 'message', title: 'Note Bionic' });
  assert.equal((await f.api.getDeliverable('p1', pin.id)).text, 'Texte Bionic');
  assert.equal(JSON.stringify(native), before);
});

test('incomplete responses and oversized texts are refused without silent truncation; previews state truncation', async t => {
  const f = await fixture(t), reply = f.chat.messages[1];
  f.chat.generation = { status: 'running', replyId: reply.id };
  await assert.rejects(f.pinMessage(), { status: 409 });
  f.chat.generation = { status: 'completed', replyId: reply.id };
  reply.text = 'é'.repeat(128001);
  await assert.rejects(f.pinMessage(), { status: 413 });
  reply.text = 'é'.repeat(128000);
  const pin = await f.pinMessage({ title: 'Grand texte' }), detail = await f.api.getDeliverable('p1', pin.id);
  assert.equal(detail.size, 256000); assert.equal(detail.text.length, 12000); assert.equal(detail.textTruncated, true);
  assert.equal((await f.api.downloadDeliverable('p1', pin.id)).bytes.toString(), reply.text);
});

test('damaged snapshot contents and metadata fail integrity checks after restart', async t => {
  const f = await fixture(t), pin = await f.pinMessage();
  const filename = path.join(f.directory, 'workspace', pin.id);
  await fs.writeFile(filename + '.bin', 'tampered');
  await assert.rejects(f.make().getDeliverable('p1', pin.id), { status: 409 });
  await assert.rejects(f.make().downloadDeliverable('p1', pin.id), { status: 409 });
  await assert.rejects(f.pinMessage(), { status: 409 });
  const metadata = JSON.parse(await fs.readFile(filename + '.json', 'utf8'));
  metadata.name = '../outside';
  await fs.writeFile(filename + '.json', JSON.stringify(metadata));
  await assert.rejects(f.make().listDeliverables('p1'), { status: 409 });
});

test('orphan and temporary private files from interrupted writes never appear as deliverables', async t => {
  const f = await fixture(t), storage = path.join(f.directory, 'workspace');
  await fs.mkdir(storage);
  await fs.writeFile(path.join(storage, randomUUID() + '.bin'), 'orphan');
  await fs.writeFile(path.join(storage, randomUUID() + '.json.tmp'), 'partial');
  assert.deepEqual((await f.make().listDeliverables('p1')).deliverables, []);
  const pin = await f.pinMessage({ title: 'Après interruption' });
  assert.equal((await f.make().getDeliverable('p1', pin.id)).text, f.chat.messages[1].text);
});
