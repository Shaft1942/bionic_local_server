import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadLocalServiceProfiles, launcherCLIIdentity } from '../lib/local-service-config.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const entryPath = path.join(root, 'main.py');
  const apiInfoPath = path.join(root, 'api-info.json');
  await fs.writeFile(entryPath, '# synthetic'); await fs.writeFile(apiInfoPath, '{}');
  const config = { version: 1, services: {
    comfyui: { enabled: true, type: 'comfyui-python', pythonPath: process.execPath, entryPath, workingDirectory: root, exclusiveControl: true },
    bionic: { enabled: true, type: 'bionic-cli', cliPath: process.execPath, apiInfoPath, exclusiveControl: true },
  } };
  const write = value => fs.writeFile(path.join(root, 'config.launchers.local.json'), JSON.stringify(value));
  return { root, config, write, connections: { bionicUrl: 'http://127.0.0.1:1235', comfyUrl: 'http://127.0.0.1:8188' } };
}

test('launcher config is optional and invalid JSON does not fail application startup', async t => {
  const f = await fixture(t);
  assert.deepEqual(await loadLocalServiceProfiles(f), { bionic: null, comfyui: null, errors: {}, revision: 'disabled' });
  await fs.writeFile(path.join(f.root, 'config.launchers.local.json'), '{');
  assert.equal((await loadLocalServiceProfiles(f)).errors.config, 'INVALID_LAUNCHER_CONFIG');
});

test('fixed profile recipes derive ports and fingerprint; no arbitrary arguments', async t => {
  const f = await fixture(t); await f.write(f.config);
  const first = await loadLocalServiceProfiles(f);
  assert.deepEqual(first.errors, {});
  assert.equal(first.comfyui.port, 8188);
  assert.equal(first.bionic.port, 1235);
  assert.match(first.comfyui.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(first.comfyui.fingerprint, (await loadLocalServiceProfiles(f)).comfyui.fingerprint);
  await fs.appendFile(f.config.services.comfyui.entryPath, '\n# changed executable entry');
  assert.notEqual(first.comfyui.fingerprint, (await loadLocalServiceProfiles(f)).comfyui.fingerprint);
  f.config.services.comfyui.args = ['--arbitrary']; await f.write(f.config);
  const invalid = await loadLocalServiceProfiles(f);
  assert.equal(invalid.errors.comfyui, 'INVALID_PROFILE');
  assert.ok(invalid.bionic); assert.equal(invalid.comfyui, null);
});

test('shared control, nonloopback endpoints, missing paths and unknown schema fail closed', async t => {
  const f = await fixture(t); await f.write(f.config);
  assert.equal((await loadLocalServiceProfiles({ ...f, connections: { ...f.connections, comfyUrl: 'http://192.168.1.10:8188' } })).errors.comfyui, 'INVALID_CONNECTION');
  f.config.services.comfyui.exclusiveControl = false;
  f.config.services.bionic.cliPath = path.join(f.root, 'missing.exe'); await f.write(f.config);
  const invalid = await loadLocalServiceProfiles(f);
  assert.equal(invalid.errors.comfyui, 'INVALID_PROFILE'); assert.equal(invalid.errors.bionic, 'PROFILE_PATH_UNAVAILABLE');
  f.config.version = 2; await f.write(f.config);
  assert.equal((await loadLocalServiceProfiles(f)).errors.config, 'INVALID_LAUNCHER_CONFIG');
});

test('linked ancestor is rejected for managed executable/entry paths', async t => {
  const f = await fixture(t);
  const linked = path.join(f.root, 'linked');
  try { await fs.symlink(f.root, linked, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('Host denies creating links'); return; } throw error; }
  f.config.services.comfyui.entryPath = path.join(linked, 'main.py'); await f.write(f.config);
  assert.equal((await loadLocalServiceProfiles(f)).errors.comfyui, 'LINK_NOT_ALLOWED');
});

test('Bionic desktop bootstrap is optional and API metadata may not exist while closed', async t => {
  const f = await fixture(t);
  f.config.services.bionic.appPath = process.execPath;
  f.config.services.bionic.apiInfoPath = path.join(f.root, 'not-created-yet.json');
  await f.write(f.config);
  const loaded = await loadLocalServiceProfiles(f);
  assert.ok(loaded.bionic);
  assert.equal(loaded.bionic.appPath, await fs.realpath(process.execPath));
  assert.equal(loaded.bionic.fileIdentity.appPath.size, (await fs.stat(process.execPath)).size);
  f.config.services.bionic.apiInfoPath = path.join(f.root, 'missing-parent', 'file.json');
  await f.write(f.config);
  assert.equal((await loadLocalServiceProfiles(f)).errors.bionic, 'PROFILE_PATH_UNAVAILABLE');
});

test('Bionic CLI byte-identical recreation preserves its profile while changed executable bytes revoke it', async t => {
  const f = await fixture(t), cliPath = path.join(f.root, 'lms.exe');
  await fs.writeFile(cliPath, 'synthetic CLI content A'); f.config.services.bionic.cliPath = cliPath;
  await f.write(f.config);
  const first = await loadLocalServiceProfiles(f);
  assert.match(first.bionic.fileIdentity.cliPath.sha256, /^[a-f0-9]{64}$/);
  const replacement = path.join(f.root, 'replacement.exe');
  await fs.writeFile(replacement, 'synthetic CLI content A'); await fs.rename(replacement, cliPath);
  assert.equal((await loadLocalServiceProfiles(f)).bionic.fingerprint, first.bionic.fingerprint);
  const before = await fs.stat(cliPath);
  await fs.writeFile(cliPath, 'synthetic CLI content B'); await fs.utimes(cliPath, before.atime, before.mtime);
  assert.notEqual((await loadLocalServiceProfiles(f)).bionic.fingerprint, first.bionic.fingerprint);
});

test('CLI hashing rejects metadata drift during the bounded read and enforces its byte limit', async t => {
  const f = await fixture(t), cliPath = path.join(f.root, 'lms.exe');
  await fs.writeFile(cliPath, 'synthetic stable CLI');
  let closed = false;
  const unstableFS = { ...fs, async open(filename, flags) {
    const handle = await fs.open(filename, flags); let reads = 0;
    return { async stat() { const value = await handle.stat(); return ++reads === 2 ? { ...value, mtimeMs: value.mtimeMs + 1 } : value; },
      createReadStream: options => handle.createReadStream(options), async close() { closed = true; await handle.close(); } };
  } };
  await assert.rejects(launcherCLIIdentity(cliPath, { fs: unstableFS }), { code: 'CLI_IDENTITY_UNCONFIRMED' }); assert.equal(closed, true);
  await assert.rejects(launcherCLIIdentity(cliPath, { maxBytes: 2 }), { code: 'CLI_IDENTITY_UNCONFIRMED' });
});
