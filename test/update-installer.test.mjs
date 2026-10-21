import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { crc32, deflateRawSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { prepareUpdate, launchUpdate, inspectUpdateArchive, validateUpdateMetadata, applyPreparedUpdate } from '../lib/update-installer.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const packageFile = version => JSON.stringify({ name: 'bionic-mobile-local', version });
const sourceFiles = (version, extra = {}) => {
  const files = { 'package.json': packageFile(version), 'server.mjs': '// synthetic ' + version, 'lib/source.mjs': '// source ' + version, ...extra };
  files['release-manifest.json'] = JSON.stringify({ files: [...Object.keys(files), 'release-manifest.json'] });
  return files;
};
function zip(files, version = '1.10.0', options = {}) {
  const local = [], central = []; let offset = 0;
  for (const [relative, content] of Object.entries(files)) {
    const bytes = Buffer.from(content), name = Buffer.from(`bionic-mobile-v${version}/${relative}`), compressed = options.deflate ? deflateRawSync(bytes) : bytes, method = options.deflate ? 8 : 0;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(method, 8); header.writeUInt32LE(crc32(bytes), 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const index = Buffer.alloc(46); index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20, 4); index.writeUInt16LE(20, 6); index.writeUInt16LE(0x800, 8); index.writeUInt16LE(method, 10); index.writeUInt32LE(crc32(bytes), 16); index.writeUInt32LE(compressed.length, 20); index.writeUInt32LE(bytes.length, 24); index.writeUInt16LE(name.length, 28); index.writeUInt32LE(offset, 42);
    if (options.symlink === relative) index.writeUInt32LE(0xa1ff0000, 38);
    central.push(index, name); offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const metadata = archive => ({ schemaVersion: 1, version: '1.10.0', minInstalledVersion: '1.9.0', nodeMajorMin: 24, nodeMajorMax: null, platforms: ['win32'], archive: 'bionic-mobile-v1.10.0.zip', sha256: sha(archive) });
async function fixture(t, files = sourceFiles('1.9.0')) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-update-test-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert(path.basename(root).startsWith('bionic-update-test-')); await fs.rm(root, { recursive: true, force: true }); });
  for (const [name, content] of Object.entries(files)) { await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }); await fs.writeFile(path.join(root, name), content); }
  await fs.mkdir(path.join(root, 'data')); await fs.writeFile(path.join(root, 'data/private.json'), 'PRIVATE_CANARY');
  await fs.writeFile(path.join(root, 'config.local.json'), '{"port":12345}'); await fs.writeFile(path.join(root, 'ACCES-PRIVE.txt'), 'SECRET_CANARY');
  await fs.writeFile(path.join(root, 'user-note.txt'), 'CUSTOM_CANARY');
  return root;
}
async function plan(t, { oldFiles, newFiles = sourceFiles('1.10.0'), ...options } = {}) {
  const root = await fixture(t, oldFiles), archive = zip(newFiles);
  return prepareUpdate({ root, archive, metadata: metadata(archive), currentVersion: '1.9.0', instanceId: 'synthetic-instance', port: 12345, platform: 'win32', ...options });
}
async function assertPrivate(root) {
  assert.equal(await fs.readFile(path.join(root, 'data/private.json'), 'utf8'), 'PRIVATE_CANARY');
  assert.equal(await fs.readFile(path.join(root, 'config.local.json'), 'utf8'), '{"port":12345}');
  assert.equal(await fs.readFile(path.join(root, 'ACCES-PRIVE.txt'), 'utf8'), 'SECRET_CANARY');
  assert.equal(await fs.readFile(path.join(root, 'user-note.txt'), 'utf8'), 'CUSTOM_CANARY');
}

test('ZIP: STORE and DEFLATE produce the exact public inventory and bytes', () => {
  const files = sourceFiles('1.10.0');
  for (const deflate of [false, true]) {
    const archive = zip(files, '1.10.0', { deflate }), extracted = inspectUpdateArchive(archive, metadata(archive));
    assert.deepEqual([...extracted.keys()], Object.keys(files)); for (const [name, content] of Object.entries(files)) assert.equal(extracted.get(name).toString(), content);
  }
});

test('ZIP: reject traversal, NTFS paths, personal files, case duplicates, symlinks and inventory lies', () => {
  for (const forbidden of ['../escape.mjs', 'C:/escape.mjs', 'lib\\escape.mjs', 'lib/a:ads', 'lib/CON.txt', 'data/private.json', 'runtime/pid.json', '.git/config', 'config.local.json', 'ACCES-PRIVE.txt', 'lib/a.', 'server.MJS', 'projects/private.txt']) {
    const archive = zip(sourceFiles('1.10.0', { [forbidden]: 'attack' }));
    assert.throws(() => inspectUpdateArchive(archive, metadata(archive)), /interdit|dupliqué/i, forbidden);
  }
  const files = sourceFiles('1.10.0');
  const linked = zip(files, '1.10.0', { symlink: 'server.mjs' }); assert.throws(() => inspectUpdateArchive(linked, metadata(linked)), /interdit/);
  const wrong = zip({ ...files, 'release-manifest.json': JSON.stringify({ files: ['server.mjs', 'package.json', 'release-manifest.json'] }) }); assert.throws(() => inspectUpdateArchive(wrong, metadata(wrong)), /Inventaire/);
  const wrongVersion = zip({ ...files, 'package.json': packageFile('1.9.0') }); assert.throws(() => inspectUpdateArchive(wrongVersion, metadata(wrongVersion)), /version/);
});

test('ZIP: reject corrupted payload, mismatched local headers, unsupported flags and trailing records', () => {
  const good = zip(sourceFiles('1.10.0'));
  const damaged = Buffer.from(good); damaged[80] ^= 1;
  assert.throws(() => inspectUpdateArchive(damaged, metadata(good)), /Empreinte/);
  assert.throws(() => inspectUpdateArchive(damaged, metadata(damaged)), /Intégrité|incohérents|ZIP/);
  const localLie = Buffer.from(good); localLie.writeUInt32LE(0, 14); assert.throws(() => inspectUpdateArchive(localLie, metadata(localLie)), /incohérents/);
  const encrypted = Buffer.from(good); encrypted.writeUInt16LE(0x801, encrypted.readUInt32LE(encrypted.length - 6) + 8); assert.throws(() => inspectUpdateArchive(encrypted, metadata(encrypted)), /interdit/);
  const extra = Buffer.concat([good, Buffer.from('TAIL')]); assert.throws(() => inspectUpdateArchive(extra, metadata(extra)), /ZIP/);
});

test('compatibility: latest may skip versions, but cannot cross installed/Node/platform boundaries', () => {
  const archive = zip(sourceFiles('1.10.0')), manifest = metadata(archive);
  assert.doesNotThrow(() => validateUpdateMetadata(manifest, { currentVersion: '1.9.0', platform: 'win32', nodeMajor: 24 }));
  for (const options of [{ currentVersion: '1.8.0' }, { currentVersion: '1.10.0' }, { currentVersion: '1.11.0' }, { nodeMajor: 23 }, { platform: 'linux' }]) assert.throws(() => validateUpdateMetadata(manifest, { currentVersion: '1.9.0', platform: 'win32', nodeMajor: 24, ...options }));
  assert.throws(() => validateUpdateMetadata({ ...manifest, nodeMajorMax: 24 }, { currentVersion: '1.9.0', platform: 'win32', nodeMajor: 25 }), /Node/);
});

test('prepare and install preserve all private/custom files and keep an exact source backup', async t => {
  const prepared = await plan(t, { oldFiles: sourceFiles('1.9.0', { 'docs/obsolete.md': 'LOCAL OLD SOURCE' }), newFiles: sourceFiles('1.10.0', { 'docs/new.md': 'NEW SOURCE' }) });
  assert.equal(prepared.baselineVerified, false); assert.equal(prepared.warnings.length, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(prepared.root, 'package.json'))).version, '1.9.0');
  const restarts = [];
  await applyPreparedUpdate(prepared, { restart: async (_plan, version) => { restarts.push(version); return { pid: 321 }; } });
  assert.deepEqual(restarts, ['1.10.0']);
  assert.equal(JSON.parse(await fs.readFile(path.join(prepared.root, 'package.json'))).version, '1.10.0');
  assert.equal(await fs.readFile(path.join(prepared.jobRoot, 'backup/package.json'), 'utf8'), packageFile('1.9.0'));
  assert.equal(await fs.readFile(path.join(prepared.root, 'docs/obsolete.md'), 'utf8'), 'LOCAL OLD SOURCE');
  assert.equal(await fs.readFile(path.join(prepared.root, 'docs/new.md'), 'utf8'), 'NEW SOURCE');
  assert.equal(JSON.parse(await fs.readFile(path.join(prepared.jobRoot, 'status.json'))).state, 'completed');
  assert.equal(JSON.parse(await fs.readFile(path.join(prepared.root, 'runtime/update-baseline.json'))).version, '1.10.0');
  await assertPrivate(prepared.root);
});

test('an apply failure restores original source bytes and removes only newly installed files', async t => {
  const prepared = await plan(t, { newFiles: sourceFiles('1.10.0', { 'new/file.txt': 'NEW' }) });
  const restarts = [];
  await assert.rejects(applyPreparedUpdate(prepared, { afterOperation: (_operation, count) => { if (count === prepared.operations.length) throw new Error('synthetic write failure'); }, restart: async (_plan, version) => { restarts.push(version); } }), /synthetic/);
  assert.deepEqual(restarts, ['1.9.0']);
  for (const [name, content] of Object.entries(sourceFiles('1.9.0'))) assert.equal(await fs.readFile(path.join(prepared.root, name), 'utf8'), content);
  await assert.rejects(fs.access(path.join(prepared.root, 'new/file.txt')), { code: 'ENOENT' });
  assert.equal(JSON.parse(await fs.readFile(path.join(prepared.jobRoot, 'status.json'))).state, 'rolled-back');
  await assertPrivate(prepared.root);
});

test('a failed new server health check triggers rollback and restarts the old release', async t => {
  const prepared = await plan(t), restarts = [];
  await assert.rejects(applyPreparedUpdate(prepared, { restart: async (_plan, version) => { restarts.push(version); if (version === '1.10.0') throw new Error('health failed'); } }), /health failed/);
  assert.deepEqual(restarts, ['1.10.0', '1.9.0']);
  assert.equal(JSON.parse(await fs.readFile(path.join(prepared.root, 'package.json'))).version, '1.9.0');
  assert.equal(JSON.parse(await fs.readFile(path.join(prepared.jobRoot, 'status.json'))).recovered, true);
  await assertPrivate(prepared.root);
});

test('the updater refuses Git checkouts, outside-distribution collisions, changed sources and altered staging', async t => {
  const root = await fixture(t), archive = zip(sourceFiles('1.10.0'));
  const args = { root, archive, metadata: metadata(archive), currentVersion: '1.9.0', instanceId: 'synthetic-instance', port: 12345, platform: 'win32' };
  await fs.mkdir(path.join(root, '.git')); await assert.rejects(prepareUpdate(args), /dépôt Git/); await fs.rm(path.join(root, '.git'), { recursive: true });
  const collision = zip(sourceFiles('1.10.0', { 'user-note.txt': 'OVERWRITE' })); await assert.rejects(prepareUpdate({ ...args, archive: collision, metadata: metadata(collision) }), /extérieur/);
  const prepared = await prepareUpdate(args); await fs.writeFile(path.join(root, 'server.mjs'), 'USER EDIT');
  await assert.rejects(applyPreparedUpdate(prepared, { restart: async () => assert.fail('must not restart') }), /changé/);
  assert.equal(await fs.readFile(path.join(root, 'server.mjs'), 'utf8'), 'USER EDIT');
  const altered = await plan(t); await fs.writeFile(path.join(altered.jobRoot, 'staged/server.mjs'), 'TAMPERED');
  await assert.rejects(applyPreparedUpdate(altered), /préparée modifiée/);
});

test('an established baseline refuses modified or missing release sources before preparing', async t => {
  const root = await fixture(t), old = sourceFiles('1.9.0'); await fs.mkdir(path.join(root, 'runtime'));
  await fs.writeFile(path.join(root, 'runtime/update-baseline.json'), JSON.stringify({ version: '1.9.0', files: Object.fromEntries(Object.entries(old).map(([name, content]) => [name, sha(Buffer.from(content))])) }));
  const archive = zip(sourceFiles('1.10.0')), args = { root, archive, metadata: metadata(archive), currentVersion: '1.9.0', instanceId: 'synthetic-instance', port: 12345, platform: 'win32' };
  assert.equal((await prepareUpdate(args)).baselineVerified, true);
  await fs.writeFile(path.join(root, 'server.mjs'), 'USER EDIT'); await assert.rejects(prepareUpdate(args), /modifiées/);
  await fs.writeFile(path.join(root, 'server.mjs'), old['server.mjs']); await fs.unlink(path.join(root, 'lib/source.mjs')); await assert.rejects(prepareUpdate(args), /modifiées/);
});

test('existing links/junctions are refused for source parents and private runtime', async t => {
  const root = await fixture(t), outside = await fixture(t), archive = zip(sourceFiles('1.10.0'));
  await fs.rm(path.join(root, 'lib'), { recursive: true });
  try { await fs.symlink(outside, path.join(root, 'lib'), process.platform === 'win32' ? 'junction' : 'dir'); } catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('directory links unavailable'); return; } throw error; }
  const args = { root, archive, metadata: metadata(archive), currentVersion: '1.9.0', instanceId: 'synthetic-instance', port: 12345, platform: 'win32' };
  await assert.rejects(prepareUpdate(args), /Lien/);
  await fs.unlink(path.join(root, 'lib')); await fs.mkdir(path.join(root, 'lib')); await fs.writeFile(path.join(root, 'lib/source.mjs'), '// source 1.9.0');
  await fs.symlink(outside, path.join(root, 'runtime'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepareUpdate(args), /Lien/);
  assert.equal(JSON.parse(await fs.readFile(path.join(outside, 'package.json'))).version, '1.9.0');
});

test('the detached standalone worker waits for its exact parent and verifies its restarted instance', { timeout: 30000 }, async t => {
  const listening = net.createServer(); await new Promise(resolve => listening.listen(0, '127.0.0.1', resolve)); const port = listening.address().port; await new Promise(resolve => listening.close(resolve));
  const parent = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  let restartedPid, workerPid, prepared;
  async function waitGone(pid) { if (!pid) return; for (let i=0;i<100;i++) { try { process.kill(pid,0); } catch (error) { if(error.code==='ESRCH')return; } await pause(30); } }
  t.after(async () => {
    try { parent.kill(); } catch {} await waitGone(parent.pid);
    if (!restartedPid && prepared) { try { restartedPid=JSON.parse(await fs.readFile(path.join(prepared.root,'runtime/server.json'),'utf8')).pid; } catch {} }
    if (restartedPid) { try { process.kill(restartedPid); } catch {} await waitGone(restartedPid); }
    if (workerPid) { try { process.kill(workerPid); } catch {} await waitGone(workerPid); }
    await pause(100);
  });
  const server = "import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; const root=process.cwd(),version=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url))).version; const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'bionic-mobile-local',version,instanceId:'synthetic-instance'}))});server.listen(Number(process.env.BIONIC_MOBILE_PORT),'127.0.0.1',()=>{fs.mkdirSync('runtime',{recursive:true});fs.writeFileSync(path.join('runtime','server.json'),JSON.stringify({pid:process.pid,root,instanceId:'synthetic-instance'}));});";
  prepared = await plan(t, { oldFiles: sourceFiles('1.9.0', { 'server.mjs': server }), newFiles: sourceFiles('1.10.0', { 'server.mjs': server }), parentPid: parent.pid, port });
  const launched = await launchUpdate(prepared); assert.equal(launched.jobId, prepared.jobId); assert.notEqual(launched.pid, process.pid);
  workerPid = launched.pid;
  await pause(350); assert.equal(JSON.parse(await fs.readFile(path.join(prepared.root, 'package.json'))).version, '1.9.0');
  parent.kill();
  let state;
  for (let attempt = 0; attempt < 100; attempt++) { state = JSON.parse(await fs.readFile(path.join(prepared.jobRoot, 'status.json'))); if (['completed', 'rolled-back', 'rollback-failed', 'cancelled'].includes(state.state)) break; await pause(150); }
  restartedPid = state.pid;
  assert.equal(state.state, 'completed', JSON.stringify(state)); assert(restartedPid);
  const response = await fetch(`http://127.0.0.1:${port}/api/ping`); assert.deepEqual(await response.json(), { app: 'bionic-mobile-local', version: '1.10.0', instanceId: 'synthetic-instance' });
  await assertPrivate(prepared.root);
});
