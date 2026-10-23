import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalProjects } from '../lib/local-projects.mjs';
import { createProjectFiles } from '../lib/project-files.mjs';
import { createConversationOrganizer } from '../lib/conversation-organizer.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-local-projects-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const folder = await fs.realpath(root), filename = path.join(folder, 'local-projects.json');
  let offline = false;
  const nativeStore = { listProjects: async () => { if (offline) throw Error('native unavailable'); return [{ id: 'native-p', name: 'Projet source' }]; }, listSessions: async () => { if (offline) throw Error('native unavailable'); return [{ id: 'native-chat', projectId: 'native-p' }]; }, getConversation: async () => ({ projectId: 'native-p' }) };
  const definitions = [{ id: 'project', name: 'Dossier du projet', directory: folder, writable: true }, { id: 'linked-0', name: 'Lecture seule', directory: folder, writable: false }];
  const make = () => createLocalProjects({ filename, nativeStore, nativeRoots: async () => definitions, fallbackProjects: async () => [{ id: 'old-project', name: 'Conversation conservée' }] });
  return { folder, filename, definitions, make, api: make(), offline: value => { offline = value; } };
}

test('local project authority and recovered conversation identities survive an absent native source', async t => {
  const f = await fixture(t), local = await f.api.create({ name: '  Mon projet  ' });
  f.offline(true);
  const projects = await f.make().listProjects();
  assert(projects.some(item => item.id === local.id && item.name === 'Mon projet'));
  assert(projects.some(item => item.id === 'old-project' && item.recovered));
  assert.deepEqual(await f.api.rootsFor(local.id), []);
  assert.deepEqual(await f.api.listSessions('old-project'), []);
  assert.equal(f.api.status().nativeUnavailable, true);
});

test('adoption pins reviewed roots, preserves identity/history, refuses elevated rights and stale previews', async t => {
  const f = await fixture(t), preview = await f.api.previewAdoption('native-p');
  await assert.rejects(f.api.adopt({ projectId: 'native-p', fingerprint: preview.fingerprint, roots: [{ id: 'linked-0', writable: true }] }), { status: 403 });
  f.definitions[0].writable = false;
  await assert.rejects(f.api.adopt({ projectId: 'native-p', fingerprint: preview.fingerprint, roots: [] }), { status: 409 });
  const current = await f.api.previewAdoption('native-p');
  const project = await f.api.adopt({ projectId: 'native-p', fingerprint: current.fingerprint, roots: [{ id: 'project', writable: false }] });
  assert.equal(project.id, 'native-p');
  const organizer = createConversationOrganizer({ filename: path.join(f.folder, 'locations.json'), store: f.api });
  assert.equal((await organizer.listSessions('native-p'))[0].id, 'native-chat');
  f.offline(true);
  assert.equal((await f.make().listProjects()).find(item => item.id === 'native-p').locallyOwned, true);
  const roots = await f.make().rootsFor('native-p');
  assert.deepEqual(roots.map(item => [item.path, item.writable, item.pinned]), [[f.folder, false, true]]);
  const files = createProjectFiles({ rootsProvider: f.api.rootsFor, registryPath: path.join(f.folder, 'missing-registry.json'), extraRoots: [{ id: 'unsafe-extra', path: f.folder, writable: true }] });
  assert.deepEqual((await files.roots('native-p')).map(item => [item.id, item.writable]), [['project', false]]);
});

test('an unreadable local registry fails closed and retains its original bytes', async t => {
  const f = await fixture(t), bytes = '{incomplete';
  await fs.writeFile(f.filename, bytes);
  await assert.rejects(f.make().create({ name: 'Cannot overwrite' }), { status: 503 });
  assert.equal(await fs.readFile(f.filename, 'utf8'), bytes);
});

test('concurrent adoption accepts an identity exactly once and requires a valid preview', async t => {
  const f = await fixture(t), preview = await f.api.previewAdoption('native-p');
  const results = await Promise.allSettled([1, 2].map(() => f.api.adopt({ projectId: 'native-p', fingerprint: preview.fingerprint, roots: [] })));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(JSON.parse(await fs.readFile(f.filename, 'utf8')).projects.length, 1);
  await assert.rejects(f.api.previewAdoption('../unsafe'), { status: 400 });
});
