import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createLocalServiceAdapters as createAdapters } from '../lib/local-service-adapters.mjs';
const identity = { pid: 4321, createdAt: 'synthetic-start-time', executable: 'C:/fixture/Bionic.exe', configIdentity: { mtimeMs: 1, ino: 2 } };
const createLocalServiceAdapters = options => createAdapters({ inspectController: async () => structuredClone(identity), ...options });

const profile = { id: 'bionic', port: 1235, url: 'http://fixture.invalid:1235', fingerprint: 'fixture', cliPath: 'C:/fixture/lms.exe', apiInfoPath: 'C:/fixture/http-server.json', exclusiveControl: true };
const receipt = { profileFingerprint: 'fixture', apiPort: 1235, controllerIdentity: identity };
const json = data => ({ ok: true, json: async () => data });

test('Bionic identity is checked again after awaiting CLI status before stop', async () => {
  let replaced = false, stops = 0;
  const adapters = createLocalServiceAdapters({ platform: 'win32', inspectController: async () => ({ ...identity, createdAt: replaced ? 'replaced-during-status' : identity.createdAt }), execFileImpl: async (file, args) => { if (args[1] === 'status') replaced = true; if (args[1] === 'stop') stops++; return { stdout: JSON.stringify({ running: true, port: 1235 }) }; } });
  await assert.rejects(adapters.stop(profile, receipt), { code: 'identity_unconfirmed' });
  assert.equal(stops, 0);
});

test('Bionic CLI uses exact override and fixed start recipe without model commands', async () => {
  let running = false; const calls = [];
  const adapters = createLocalServiceAdapters({ platform: 'win32', fetchImpl: async () => json({ models: [] }), execFileImpl: async (file, args, options) => { calls.push({ file, args, options }); if (args[1] === 'start') running = true; return { stdout: JSON.stringify({ running, port: 1235 }) }; } });
  assert.deepEqual(await adapters.start(profile), { version: 1, id: 'bionic', profileFingerprint: 'fixture', apiPort: 1235, controllerIdentity: identity });
  assert.deepEqual(calls[1].args, ['server', 'start', '--port', '1235', '--bind', '127.0.0.1']);
  assert.equal(calls[1].options.env.LMS_API_SERVER_INFO_PATH, profile.apiInfoPath);
  assert.equal(calls[1].options.shell, false);
});

test('native generation metadata or PID creation changes revoke Bionic ownership before any stop', async () => {
  for (const changed of [{ ...identity, createdAt: 'reused-pid' }, { ...identity, configIdentity: { mtimeMs: 2, ino: 2 } }]) {
    let calls = 0;
    const adapters = createLocalServiceAdapters({ platform: 'win32', inspectController: async () => changed, execFileImpl: async () => { calls++; return { stdout: '{"running":true,"port":1235}' }; }, fetchImpl: async () => json({ models: [] }) });
    assert.equal((await adapters.observe(profile, receipt)).process.state, 'unknown');
    const before = calls;
    await assert.rejects(adapters.stop(profile, receipt), { code: 'identity_unconfirmed' });
    assert.equal(calls, before);
  }
});

test('Comfy readiness on a third party listener persists the owned receipt as uncertain', async () => {
  const owned = Object.freeze({ pid: 9001, profileFingerprint: 'comfy', id: 'comfyui' });
  const adapters = createLocalServiceAdapters({ processBackend: { launch: async () => owned }, fetchImpl: async url => json(url.endsWith('/queue') ? { queue_running: [], queue_pending: [] } : { system: {} }), inspectController: async () => ({ pid: 9999, createdAt: 'other', executable: 'C:/fixture/python.exe' }) });
  await assert.rejects(adapters.start({ id: 'comfyui', fingerprint: 'comfy', port: 8188, url: 'http://fixture.invalid', exclusiveControl: true }), error => error.code === 'identity_unconfirmed' && error.receipt === owned);
});

test('Comfy adapter preserves certified prelaunch failure and keeps generic launch uncertainty', async () => {
  for (const effectAttempted of [false, true, undefined]) {
    const adapters = createLocalServiceAdapters({ processBackend: { launch: async () => { throw Object.assign(new Error('fixture launch'), { effectAttempted }); } } });
    await assert.rejects(adapters.start({ id: 'comfyui' }), error => error.effectAttempted === (effectAttempted !== false));
  }
});

test('Comfy readiness binds the authenticated helper PID when a venv redirects its image', async () => {
  const owned = { pid: 9001, profileFingerprint: 'comfy', id: 'comfyui' };
  const adapters = createLocalServiceAdapters({ processBackend: { launch: async () => owned }, fetchImpl: async url => json(url.endsWith('/queue') ? { queue_running: [], queue_pending: [] } : { system: {} }), inspectController: async () => ({ pid: 9001, createdAt: 'owned-start', executable: 'C:/fixture/base/python.exe' }) });
  const result = await adapters.start({ id: 'comfyui', fingerprint: 'comfy', pythonPath: 'C:/fixture/venv/Scripts/python.exe', port: 8188, url: 'http://fixture.invalid', exclusiveControl: true });
  assert.equal(result.controllerIdentity.pid, owned.pid);
  assert.equal(result.controllerIdentity.executable, 'C:/fixture/base/python.exe');
});

test('Bionic stop rejects mismatched identity without sending stop', async () => {
  const calls = [];
  const adapters = createLocalServiceAdapters({ platform: 'win32', execFileImpl: async (file, args) => { calls.push(args); return { stdout: '{"running":true,"port":9999}' }; } });
  await assert.rejects(adapters.stop(profile, receipt), { code: 'identity_unconfirmed' });
  assert.deepEqual(calls, [['server', 'status', '--json']]);
});

test('Bionic stop confirms exact API termination without desktop kill', async () => {
  let running = true; const calls = [];
  const adapters = createLocalServiceAdapters({ platform: 'win32', fetchImpl: async () => { throw new Error('offline'); }, execFileImpl: async (file, args) => { calls.push(args); if (args[1] === 'stop') running = false; return { stdout: JSON.stringify({ running, port: 1235 }) }; } });
  await adapters.stop(profile, receipt);
  assert.deepEqual(calls.map(args => args[1]), ['status', 'stop', 'status']);
});

test('missing exact CLI selector refuses any invocation', async () => {
  let calls = 0; const adapters = createLocalServiceAdapters({ platform: 'win32', execFileImpl: async () => { calls++; } });
  await assert.rejects(adapters.start({ ...profile, apiInfoPath: undefined }), { code: 'controller_unavailable' }); assert.equal(calls, 0);
});

test('Comfy busy queue is observable and process identity remains separate from API', async () => {
  const adapters = createLocalServiceAdapters({ processBackend: { inspect: async () => ({ state: 'unknown' }) }, fetchImpl: async url => json(url.endsWith('/queue') ? { queue_running: [1], queue_pending: [] } : { system: {} }) });
  const state = await adapters.observe({ id: 'comfyui', url: 'http://fixture.invalid', exclusiveControl: true }, { id: 'fixture' });
  assert.equal(state.activity.state, 'busy'); assert.equal(state.process.state, 'unknown'); assert.equal(state.api.state, 'ready');
});

test('Comfy stop requires owned fingerprint and confirmed wrapper termination', async () => {
  let stops = 0;
  const adapters = createLocalServiceAdapters({ processBackend: { inspect: async () => ({ state: 'running' }), requestStop: async () => { stops++; }, waitForExit: async () => ({ state: 'unknown' }) } });
  const p = { id: 'comfyui', fingerprint: 'fixture' };
  await assert.rejects(adapters.stop(p, { profileFingerprint: 'different' }), { code: 'identity_unconfirmed' });
  assert.equal(stops, 0);
  await assert.rejects(adapters.stop(p, { profileFingerprint: 'fixture' }), { code: 'termination_unconfirmed' }); assert.equal(stops, 1);
});

test('cold Bionic bootstraps only exact desktop recipe then enables API, forwarding private headers', async () => {
  let launched = false, running = false, spawnCount = 0; const requests = [];
  const adapters = createLocalServiceAdapters({ platform: 'win32', pollMs: 1, bionicHeaders: () => ({ Authorization: 'Bearer synthetic-fixture' }), fetchImpl: async (url, options) => { requests.push(options); return json({ models: [] }); }, spawnImpl(file, args, options) {
    spawnCount++; assert.equal(file, 'C:/fixture/Bionic.exe'); assert.deepEqual(args, []); assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
    launched = true; const child = new EventEmitter(); child.unref = () => {}; return child;
  }, execFileImpl: async (file, args) => { if (!launched) return { stdout: '{"running":false}' }; if (args[1] === 'start') running = true; return { stdout: JSON.stringify({ running, port: 1235 }) }; } });
  const result = await adapters.start({ ...profile, appPath: 'C:/fixture/Bionic.exe' });
  assert.equal(result.apiPort, 1235); assert.equal(spawnCount, 1); assert.equal(requests[0].headers.Authorization, 'Bearer synthetic-fixture');
});

test('closed Bionic without a desktop recipe refuses instead of implicit CLI discovery', async () => {
  let launches = 0;
  const adapters = createLocalServiceAdapters({ platform: 'win32', spawnImpl: () => { launches++; }, execFileImpl: async () => ({ stdout: '{"running":false}' }) });
  await assert.rejects(adapters.start(profile), { code: 'desktop_start_required', effectAttempted: false }); assert.equal(launches, 0);
});

test('Bionic persisted and legacy-expired receipts restore only after complete continuity checks', async () => {
  for (const ownershipExpired of [undefined, true]) {
    const adapters = createLocalServiceAdapters({ platform: 'win32', fetchImpl: async () => json({ models: [] }), execFileImpl: async () => ({ stdout: '{"running":true,"port":1235}' }) });
    assert.equal((await adapters.observe(profile, { ...receipt, ownershipExpired })).process.state, 'running');
  }
  for (const changed of [
    { ...identity, pid: 4322 }, { ...identity, createdAt: 'new-instance' }, { ...identity, executable: 'C:/foreign/Bionic.exe' },
    { ...identity, configIdentity: { mtimeMs: 9, ino: 2 } }, null,
  ]) {
    let stops = 0;
    const adapters = createLocalServiceAdapters({ platform: 'win32', inspectController: async () => changed, fetchImpl: async () => json({ models: [] }), execFileImpl: async (file, args) => { if (args[1] === 'stop') stops++; return { stdout: '{"running":true,"port":1235}' }; } });
    assert.equal((await adapters.observe(profile, receipt)).process.state, 'unknown');
    await assert.rejects(adapters.stop(profile, receipt), { code: 'identity_unconfirmed', effectAttempted: false }); assert.equal(stops, 0);
  }
});

test('Bionic continuity rejects profile, port, exclusivity, incomplete receipt and inaccessible inspector', async () => {
  const adapters = createLocalServiceAdapters({ platform: 'win32', fetchImpl: async () => json({ models: [] }), execFileImpl: async () => ({ stdout: '{"running":true,"port":1235}' }) });
  for (const invalid of [ { ...receipt, profileFingerprint: 'other-path-or-CLI' }, { ...receipt, apiPort: 1236 }, { ...receipt, controllerIdentity: undefined } ]) {
    assert.equal((await adapters.observe(profile, invalid)).process.state, 'unknown');
  }
  assert.equal((await adapters.observe({ ...profile, exclusiveControl: false }, receipt)).process.state, 'unknown');
  const inaccessible = createLocalServiceAdapters({ platform: 'win32', inspectController: async () => { throw new Error('access denied'); }, fetchImpl: async () => json({ models: [] }), execFileImpl: async () => ({ stdout: '{"running":true,"port":1235}' }) });
  assert.equal((await inaccessible.observe(profile, receipt)).process.state, 'unknown');
});

test('Bionic failures after Desktop spawn or CLI mutation remain explicitly uncertain', async () => {
  const afterCli = createLocalServiceAdapters({ platform: 'win32', execFileImpl: async (file, args) => { if (args[1] === 'start') throw new Error('transport lost'); return { stdout: '{"running":false,"port":1235}' }; } });
  await assert.rejects(afterCli.start(profile), { code: 'controller_unavailable', effectAttempted: true });
  const afterSpawn = createLocalServiceAdapters({ platform: 'win32', spawnImpl: () => { throw new Error('spawn outcome uncertain'); }, execFileImpl: async () => ({ stdout: '{"running":false}' }) });
  await assert.rejects(afterSpawn.start({ ...profile, appPath: 'C:/fixture/Bionic.exe' }), { effectAttempted: true });
  const afterStop = createLocalServiceAdapters({ platform: 'win32', execFileImpl: async (file, args) => { if (args[1] === 'stop') throw new Error('transport lost'); return { stdout: '{"running":true,"port":1235}' }; } });
  await assert.rejects(afterStop.stop(profile, receipt), { code: 'controller_unavailable', effectAttempted: true });
});

test('cold auto-started API requires listener ownership of the exact spawned desktop', async () => {
  for (const ownsApi of [false, true]) {
    let launched = false, starts = 0;
    const adapters = createLocalServiceAdapters({ platform: 'win32', pollMs: 1, fetchImpl: async () => json({ models: [] }), inspectDesktop: async ({ pid }) => pid === 4321 && ownsApi,
      spawnImpl() { launched = true; const child = new EventEmitter(); child.pid = 4321; child.unref = () => {}; return child; },
      execFileImpl: async (file, args) => { if (args[1] === 'start') starts++; return { stdout: JSON.stringify(launched ? { running: true, port: 1235 } : { running: false }) }; },
    });
    if (ownsApi) assert.equal((await adapters.start({ ...profile, appPath: 'C:/fixture/Bionic.exe' })).desktopPid, 4321);
    else await assert.rejects(adapters.start({ ...profile, appPath: 'C:/fixture/Bionic.exe' }), { code: 'identity_unconfirmed' });
    assert.equal(starts, 0);
  }
});
