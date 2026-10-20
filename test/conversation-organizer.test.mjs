import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createConversationOrganizer, UNASSIGNED_PROJECT } from '../lib/conversation-organizer.mjs';

async function fixture(t, withDefault = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-organizer-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filename = path.join(root, 'locations.json');
  const projects = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, ...(withDefault ? [{ id: 'native-default', name: 'Sans projet', type: 'default' }] : [])];
  const sessions = [{ id: 'native-1', projectId: 'a', name: 'Premier fil' }, { id: 'native-2', projectId: 'b', name: 'Second fil' }];
  const reads = [];
  const store = { listProjects: async () => structuredClone(projects), listSessions: async id => structuredClone(sessions.filter(item => item.projectId === id)), getConversation: async (projectId, id) => { reads.push({ projectId, id }); const item = sessions.find(item => item.projectId === projectId && item.id === id); if (!item) throw Object.assign(new Error('Missing'), { status: 404 }); return { ...item, source: 'bionic', messages: [{ id: 'm1', role: 'user', text: 'Texte natif intact.' }] }; } };
  const make = () => createConversationOrganizer({ filename, store });
  return { filename, sessions, projects, reads, make, api: make() };
}
test('unassigned is available without a native default and does not duplicate a native default', async t => {
  const f = await fixture(t), g = await fixture(t, true);
  assert.equal((await f.api.listProjects()).filter(item => item.isUnassigned).length, 1);
  assert.equal((await f.api.listProjects()).at(-1).id, UNASSIGNED_PROJECT);
  assert.equal((await g.api.listProjects()).filter(item => item.isUnassigned).length, 1);
  assert.equal((await g.api.listProjects()).at(-1).id, 'native-default');
});
test('native placement changes the companion list, retains the source store and survives restart', async t => {
  const f = await fixture(t), snapshot = structuredClone(f.sessions);
  const moved = await f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: 'b' });
  assert.equal(moved.projectId, 'b'); assert.equal(moved.fileAccess, false);
  assert.deepEqual(await f.api.listSessions('a'), []);
  assert.deepEqual((await f.api.listSessions('b')).map(item => item.id), ['native-2', 'native-1']);
  const reopened = await f.make().getConversation('b', 'native-1');
  assert.equal(reopened.messages[0].text, 'Texte natif intact.'); assert.equal(reopened.nativeProjectId, 'a');
  assert.deepEqual(f.sessions, snapshot); assert(f.reads.every(item => item.projectId === 'a'));
  await assert.rejects(f.api.getConversation('a', 'native-1'), { status: 404 });
});
test('native conversations move through unassigned and return to their original project', async t => {
  const f = await fixture(t);
  await f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: UNASSIGNED_PROJECT });
  assert.equal((await f.api.listSessions(UNASSIGNED_PROJECT))[0].id, 'native-1');
  await f.api.moveNative({ projectId: UNASSIGNED_PROJECT, id: 'native-1', targetProjectId: 'a' });
  assert.equal((await f.api.listSessions('a'))[0].id, 'native-1');
  assert.equal(JSON.parse(await fs.readFile(f.filename, 'utf8')).native[0].projectId, 'a');
  assert.equal((await f.make().getConversation('a', 'native-1')).fileAccess, false);
});
test('invalid targets, stale sources and duplicate destination ids cannot alter placement', async t => {
  const f = await fixture(t);
  await assert.rejects(f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: '../b' }), { status: 400 });
  await assert.rejects(f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: 'missing' }), { status: 404 });
  f.sessions.push({ id: 'native-1', projectId: 'b', name: 'Collision' });
  await assert.rejects(f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: 'b' }), { status: 409 });
  f.sessions.pop();
  await f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: 'b' });
  await assert.rejects(f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: UNASSIGNED_PROJECT }), { status: 404 });
  assert.equal((await f.api.listSessions('b')).filter(item => item.id === 'native-1').length, 1);
});
test('concurrent native moves serialize and a stale source cannot win twice', async t => {
  const f = await fixture(t);
  const results = await Promise.allSettled(['b', UNASSIGNED_PROJECT].map(targetProjectId => f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId })));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter(item => item.status === 'rejected' && item.reason.status === 404).length, 1);
  assert.equal(JSON.parse(await fs.readFile(f.filename, 'utf8')).native.length, 1);
});
test('corrupt placement data fails closed without replacing its bytes', async t => {
  const f = await fixture(t), corrupt = '{broken'; await fs.writeFile(f.filename, corrupt);
  await assert.rejects(f.api.listSessions('a'), { status: 503 });
  await assert.rejects(f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: 'b' }), { status: 503 });
  assert.equal(await fs.readFile(f.filename, 'utf8'), corrupt);
});
test('a later native default cannot hide preexisting local unassigned conversations', async t => {
  const f = await fixture(t);
  await f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: UNASSIGNED_PROJECT });
  f.projects.push({ id: 'later-default', name: 'Sans projet', type: 'default' });
  assert((await f.api.listProjects()).some(project => project.id === UNASSIGNED_PROJECT));
  assert.equal((await f.api.getConversation(UNASSIGNED_PROJECT, 'native-1')).messages[0].text, 'Texte natif intact.');
  const webOnly = createConversationOrganizer({ filename: path.join(path.dirname(f.filename), 'other.json'), store: { listProjects: async () => f.projects }, hasLocalUnassigned: async () => true });
  assert.deepEqual((await webOnly.listProjects()).filter(project => project.isUnassigned).map(project => project.name), ['Sans projet · Bionic', 'Sans projet']);
});
test('native renaming is a persistent local alias that follows moves without changing history or authority', async t => {
  const f = await fixture(t), snapshot = structuredClone(f.sessions);
  const renamed = await f.api.renameNative({ projectId: 'a', id: 'native-1', name: '  Mon nouveau nom  ' });
  assert.equal(renamed.name, 'Mon nouveau nom'); assert.equal(renamed.fileAccess, undefined);
  assert.equal((await f.api.listSessions('a'))[0].name, 'Mon nouveau nom');
  assert.equal((await f.make().getConversation('a', 'native-1')).name, 'Mon nouveau nom');
  const moved = await f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: 'b' });
  assert.equal(moved.name, 'Mon nouveau nom'); assert.equal(moved.fileAccess, false);
  assert.equal((await f.make().getConversation('b', 'native-1')).name, 'Mon nouveau nom');
  assert.equal(moved.messages[0].text, 'Texte natif intact.');
  assert.deepEqual(f.sessions, snapshot);
});
test('native deletion hides only the selected original identity and survives restart without deleting source history', async t => {
  const f = await fixture(t);
  f.sessions.push({ id: 'native-1', projectId: 'b', name: 'Autre identité' });
  const snapshot = structuredClone(f.sessions);
  const removed = await f.api.deleteNative({ projectId: 'a', id: 'native-1' });
  assert.deepEqual(removed, { deleted: true, id: 'native-1', projectId: 'a', source: 'bionic', localOnly: true });
  assert.deepEqual(await f.api.listSessions('a'), []);
  assert.equal((await f.make().listSessions('b')).find(item => item.id === 'native-1').name, 'Autre identité');
  await assert.rejects(f.make().getConversation('a', 'native-1'), { status: 404 });
  await assert.rejects(f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: UNASSIGNED_PROJECT }), { status: 404 });
  await assert.rejects(f.api.renameNative({ projectId: 'a', id: 'native-1', name: 'Revenir' }), { status: 404 });
  assert.deepEqual(f.sessions, snapshot);
});
test('a hidden native conversation does not reappear when another source uses its former target id', async t => {
  const f = await fixture(t);
  await f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: 'b' });
  await f.api.deleteNative({ projectId: 'b', id: 'native-1' });
  f.projects.push({ id: 'c', name: 'C' }); f.sessions.push({ id: 'native-1', projectId: 'c', name: 'Autre source' });
  await f.api.moveNative({ projectId: 'c', id: 'native-1', targetProjectId: 'b' });
  assert.equal((await f.make().getConversation('b', 'native-1')).nativeProjectId, 'c');
  assert.deepEqual(await f.api.listSessions('a'), []);
});
test('invalid rename names and stale scope edits cannot overwrite persistent aliases', async t => {
  const f = await fixture(t);
  for (const name of ['', '   ', 'a'.repeat(121), 'Deux\nlignes', 'Deux\u2028lignes', 'Invisible\u0000', 12]) await assert.rejects(async () => f.api.renameNative({ projectId: 'a', id: 'native-1', name }), { status: 400 });
  await f.api.renameNative({ projectId: 'a', id: 'native-1', name: 'Nom valide' });
  await f.api.moveNative({ projectId: 'a', id: 'native-1', targetProjectId: 'b' });
  const bytes = await fs.readFile(f.filename, 'utf8');
  await assert.rejects(f.api.renameNative({ projectId: 'a', id: 'native-1', name: 'Périmé' }), { status: 404 });
  await assert.rejects(f.api.deleteNative({ projectId: 'a', id: 'native-1' }), { status: 404 });
  assert.equal(await fs.readFile(f.filename, 'utf8'), bytes);
});
test('a concurrent delete wins before a later native rename and cannot be undone by it', async t => {
  const f = await fixture(t);
  const results = await Promise.allSettled([f.api.deleteNative({ projectId: 'a', id: 'native-1' }), f.api.renameNative({ projectId: 'a', id: 'native-1', name: 'Ancienne vue' })]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].reason.status, 404);
  assert.deepEqual(await f.make().listSessions('a'), []);
});
