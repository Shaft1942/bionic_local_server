import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, randomUUID, scryptSync } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { collectReleaseFiles } from '../../scripts/release-files.mjs';
import { prepareUpdate, applyPreparedUpdate } from '../../lib/update-installer.mjs';

export const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
export const fixtureCode = 'synthetic-entry-code';
export const oldMarker = 'SYNTHETIC_LEGACY_2_5_HTML';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** STORE archive built from the real candidate's closed public inventory. */
function archiveOf(files, version) {
  const local = [], central = []; let offset = 0;
  for (const { path: relative, bytes } of files) {
    const name = Buffer.from(`bionic-mobile-v${version}/${relative}`), checksum = crc32(bytes), header = Buffer.alloc(30), entry = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt32LE(checksum, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt32LE(checksum, 16); entry.writeUInt32LE(bytes.length, 20); entry.writeUInt32LE(bytes.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    local.push(header, name, bytes); central.push(entry, name); offset += header.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

export async function removeFixture(root, prefix) {
  assert.equal(path.dirname(root), await fs.realpath(os.tmpdir())); assert(path.basename(root).startsWith(prefix));
  await fs.rm(root, { recursive: true, force: true });
}

/** Start only the installed factory, injecting stores/transports that cannot use a real engine. */
export async function startInstalled(root, { env = {}, publicDirectory } = {}) {
  const module = await import(pathToFileURL(path.join(root, 'server.mjs')).href + '?entry=' + randomUUID());
  const { loadSettings } = await import(pathToFileURL(path.join(root, 'lib/config.mjs')).href);
  const settings = await loadSettings({ root, env, home: path.join(root, 'synthetic-home') });
  const forbidden = async () => { throw Error('No external service or native history in entry fixture.'); };
  const app = await module.createCompanion({ root, settings, publicDirectory, inferenceEnvironment: {}, enableUpdateScheduling: false,
    nativeStore: { listProjects: async () => [], listSessions: async () => [], getConversation: forbidden },
    modelService: { list: async () => [], pendingCount: () => 0, forInference: forbidden }, fetchImpl: forbidden, comfyFetchImpl: forbidden,
    localServiceSupervisor: { assertAdmission() {}, activeCount: () => 0, protectedPaths: () => [], snapshot: async () => ({ services: [], disabled: true }), close: async () => {} }
  });
  try { await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); }); }
  catch (error) { await app.close(); throw error; }
  const baseUrl = 'http://127.0.0.1:' + app.server.address().port;
  return { app, baseUrl, settings, close: () => app.close() };
}

/** A 2.5-shaped extracted installation, updated with the real candidate sources. */
export async function migrate25({ env = { BIONIC_MOBILE_UI_MODE: 'legacy' }, candidateRoot = sourceRoot } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'canae-entry-update25-')));
  let running;
  try {
    const instanceId = randomUUID(), chatId = 'web-' + randomUUID(), salt = 'synthetic-entry-migration-salt';
    const auth = JSON.stringify({ instanceId, salt, passwordHash: scryptSync(fixtureCode, salt, 32).toString('hex'), adminToken: 'synthetic-entry-admin' });
    const local = JSON.stringify({ uiMode: 'legacy', port: 31234, apiUrl: 'http://127.0.0.1:19998', llamaUrl: 'http://127.0.0.1:19997', comfyUrl: 'http://127.0.0.1:19999', comfyEnabled: false, bionicRoot: path.join(root, 'native-disabled') });
    const chat = JSON.stringify({ id: chatId, projectId: 'companion-unassigned', name: 'Conversation synthétique 2.5', updatedAt: 10, messages: [{ id: 'old-user', role: 'user', text: 'Ancienne question synthétique.' }, { id: 'old-reply', role: 'assistant', text: 'Ancienne réponse synthétique.', complete: true }] });
    const privateFiles = new Map([['config.local.json', local], ['data/config.json', auth], ['data/chats/' + chatId + '.json', chat], ['ACCES-PRIVE.txt', 'SYNTHETIC_ACCESS_NOTE'], ['user-note.txt', 'SYNTHETIC_LOCAL_NOTE']]);
    const oldFiles = { 'package.json': JSON.stringify({ name: 'bionic-mobile-local', version: '2.5.0', type: 'module' }), 'server.mjs': '// synthetic pre-update 2.5 runtime', 'public/index.html': '<!doctype html><title>' + oldMarker + '</title>', 'public/app.js': '// retained legacy source' };
    oldFiles['release-manifest.json'] = JSON.stringify({ files: [...Object.keys(oldFiles), 'release-manifest.json'] });
    for (const [name, bytes] of [...Object.entries(oldFiles), ...privateFiles]) { await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }); await fs.writeFile(path.join(root, name), bytes); }
    await fs.writeFile(path.join(root, 'public', 'retained-legacy.html'), oldMarker);
    const files = await collectReleaseFiles(candidateRoot), version = JSON.parse(files.find(file => file.path === 'package.json').bytes.toString()).version, archive = archiveOf(files, version);
    const metadata = { schemaVersion: 1, version, channel: version.includes('-beta.') ? 'beta' : 'stable', minInstalledVersion: '2.5.0', nodeMajorMin: 24, nodeMajorMax: null, platforms: ['win32'], archive: `bionic-mobile-v${version}.zip`, sha256: sha(archive) };
    const plan = await prepareUpdate({ root, archive, metadata, currentVersion: '2.5.0', instanceId, port: 31234, platform: 'win32' });
    assert.equal(plan.baselineVerified, false);
    const applied = await applyPreparedUpdate(plan, { restart: async (_plan, expectedVersion) => {
      assert.equal(expectedVersion, version); running = await startInstalled(root, { env });
      const ping = await (await fetch(running.baseUrl + '/api/ping')).json(); assert.equal(ping.version, version); assert.equal(ping.instanceId, instanceId);
      const response = await fetch(running.baseUrl + '/'); assert.equal(response.status, 200); assert.match(await response.text(), /Canaé/);
      return { pid: process.pid, stop: () => running.close() };
    } });
    assert.equal(applied.state, 'completed');
    const assertPrivate = async () => { for (const [name, value] of privateFiles) assert.equal(await fs.readFile(path.join(root, name), 'utf8'), value, name); };
    await assertPrivate(); assert.equal(await fs.readFile(path.join(root, 'public', 'retained-legacy.html'), 'utf8'), oldMarker);
    return { get app() { return running.app; }, get baseUrl() { return running.baseUrl; }, root, instanceId, chatId, version, assertPrivate, archiveHash: metadata.sha256,
      restart: async () => { await running.close(); running = await startInstalled(root, { env }); },
      close: async () => { await running?.close(); await removeFixture(root, 'canae-entry-update25-'); } };
  } catch (error) { await running?.close(); await removeFixture(root, 'canae-entry-update25-'); throw error; }
}
