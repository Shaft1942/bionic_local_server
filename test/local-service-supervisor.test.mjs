import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalServiceSupervisor } from '../lib/local-service-supervisor.mjs';

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'launcher-supervisor-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let ready = false, starts = 0, stops = 0, reserved = 0;
  const profiles = { revision: 'fixture', errors: {}, bionic: { id: 'bionic', type: 'bionic-cli', url: 'http://fixture.invalid', fingerprint: 'fixture-profile', exclusiveControl: true } };
  const adapters = {
    async observe(profile, receipt) { return { process: { state: receipt ? 'running' : 'external' }, api: { state: ready ? 'ready' : 'unavailable', observedAt: 1 }, model: { state: 'unknown' }, activity: { state: ready ? 'idle' : 'unknown', observedAt: 1 } }; },
    async start() { starts++; ready = true; return { profileFingerprint: 'fixture-profile', apiPort: 1235 }; },
    async stop() { stops++; ready = false; },
    ...options.adapters,
  };
  const supervisor = await createLocalServiceSupervisor({ root, profilesLoader: async () => profiles, reserve() { reserved++; return () => reserved--; }, ...options, adapters });
  t.after(() => supervisor.close());
  return { root, supervisor, profiles, counts: () => ({ starts, stops, reserved }), setReady: value => { ready = value; } };
}
const intent = (revision, key = '12345678-1234-1234-1234-123456789abc', action = 'start') => ({ action, expectedRevision: revision, idempotencyKey: key });
async function revision(supervisor) { return (await supervisor.snapshot()).services[0].revision; }
async function done(supervisor, id) { for (let n = 0; n < 100; n++) { const op = await supervisor.operation(id); if (!['accepted', 'running'].includes(op.status)) return op; await new Promise(r => setTimeout(r, 5)); } throw new Error('fixture timeout'); }

test('durable accepted intention deduplicates concurrent and stale retries before spawning', async t => {
  const f = await fixture(t);
  const request = intent(await revision(f.supervisor));
  const [a, b] = await Promise.all([f.supervisor.action('bionic', request), f.supervisor.action('bionic', request)]);
  assert.equal(a.id, b.id);
  const persisted = JSON.parse(await readFile(join(f.root, 'runtime/local-services/operations.json')));
  assert.equal(persisted.operations.length, 1);
  assert.equal((await done(f.supervisor, a.id)).status, 'succeeded');
  assert.equal((await f.supervisor.action('bionic', request)).id, a.id);
  assert.deepEqual(f.counts(), { starts: 1, stops: 0, reserved: 0 });
});

test('idempotency collision rejects different effect even when revision is stale', async t => {
  const f = await fixture(t); const request = intent(await revision(f.supervisor));
  const op = await f.supervisor.action('bionic', request); await done(f.supervisor, op.id);
  await assert.rejects(f.supervisor.action('bionic', { ...request, action: 'stop' }), { code: 'idempotency_collision' });
  await assert.rejects(f.supervisor.action('bionic', { ...request, expectedRevision: 'another-intention' }), { code: 'idempotency_collision' });
});

test('external ready API cannot be adopted or stopped', async t => {
  const f = await fixture(t); f.setReady(true);
  const state = (await f.supervisor.snapshot()).services[0];
  assert.equal(state.actions.stop.reasonCode, 'external_service');
  await assert.rejects(f.supervisor.action('bionic', intent(state.revision, undefined, 'stop')), { code: 'external_service' });
  assert.equal(f.counts().stops, 0);
});

test('restart performs confirmed stop before one new launch', async t => {
  const f = await fixture(t);
  const start = await f.supervisor.action('bionic', intent(await revision(f.supervisor))); await done(f.supervisor, start.id);
  const restart = await f.supervisor.action('bionic', intent(await revision(f.supervisor), '22345678-1234-1234-1234-123456789abc', 'restart'));
  assert.equal((await done(f.supervisor, restart.id)).status, 'succeeded');
  assert.deepEqual(f.counts(), { starts: 2, stops: 1, reserved: 0 });
});

test('uncertain side effect blocks new generation and retry, without leaking adapter error', async t => {
  const f = await fixture(t, { adapters: { async start() { throw new Error('private path and stdout'); } } });
  const op = await f.supervisor.action('bionic', intent(await revision(f.supervisor)));
  const outcome = await done(f.supervisor, op.id);
  assert.equal(outcome.status, 'unknown'); assert.equal(outcome.resultCode, 'effect_unconfirmed');
  assert.throws(() => f.supervisor.assertAdmission(), { code: 'local_service_maintenance' });
  assert.equal(f.supervisor.activeCount(), 1);
  assert.equal(JSON.stringify(await f.supervisor.snapshot()).includes('private path'), false);
});

test('crash recovery converts accepted/running into unknown and never replays', async t => {
  const root = await mkdtemp(join(tmpdir(), 'launcher-recovery-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'runtime/local-services'), { recursive: true });
  await writeFile(join(root, 'runtime/local-services/operations.json'), JSON.stringify({ version: 1, receipts: {}, operations: [{ id: 'operation-1', idempotencyKey: '12345678-1234-1234', serviceId: 'bionic', action: 'start', status: 'running' }] }));
  let starts = 0;
  const supervisor = await createLocalServiceSupervisor({ root, profilesLoader: async () => ({ revision: 'none', errors: {} }), adapters: { start() { starts++; } } });
  t.after(() => supervisor.close());
  assert.equal((await supervisor.operation('operation-1')).status, 'unknown'); assert.equal(starts, 0);
  assert.throws(() => supervisor.assertAdmission());
});

test('invalid requests and stale revisions have no reserved effect', async t => {
  const f = await fixture(t);
  await assert.rejects(f.supervisor.action('bionic', { ...intent('stale'), command: 'bad' }), { status: 400 });
  await assert.rejects(f.supervisor.action('bionic', intent('stale')), { code: 'stale_revision' });
  assert.deepEqual(f.counts(), { starts: 0, stops: 0, reserved: 0 });
});

test('reservation rejects before journal and process creation', async t => {
  const f = await fixture(t, { reserve() { throw Object.assign(new Error('busy'), { code: 'resource_busy' }); } });
  await assert.rejects(f.supervisor.action('bionic', intent(await revision(f.supervisor))), { code: 'resource_busy' });
  assert.equal(f.counts().starts, 0);
});

test('changed profile is revalidated before accepted effect', async t => {
  const f = await fixture(t); const request = intent(await revision(f.supervisor));
  f.profiles.revision = 'changed';
  await assert.rejects(f.supervisor.action('bionic', request), { code: 'stale_revision' });
  assert.equal(f.counts().starts, 0);
});

test('changed executable fingerprint invalidates first start even when raw configuration is identical', async t => {
  const f = await fixture(t); const request = intent(await revision(f.supervisor));
  f.profiles.bionic = { ...f.profiles.bionic, fingerprint: 'executable-replaced' };
  await assert.rejects(f.supervisor.action('bionic', request), { code: 'stale_revision' });
  assert.equal(f.counts().starts, 0);
});

test('protected paths reflect current valid launch profiles without entering DTOs', async t => {
  const f = await fixture(t);
  f.profiles.comfyui = { id: 'comfyui', pythonPath: 'E:/fixture/env/python.exe', workingDirectory: 'E:/fixture/comfy', fingerprint: 'comfy' };
  f.profiles.bionic = { ...f.profiles.bionic, appPath: 'E:/fixture/app/Bionic.exe', cliPath: 'E:/fixture/cli/lms.exe', apiInfoPath: 'E:/fixture/native/http-server.json' };
  const paths = f.supervisor.protectedPaths(); assert.equal(paths.length, 5); assert.ok(paths.some(value => value.endsWith('native')));
  assert.equal(JSON.stringify(await f.supervisor.snapshot()).includes('E:/fixture/'), false);
});

test('Bionic successful receipt keeps control after adapter revalidates it across companion restart', async t => {
  const f = await fixture(t);
  const start = await f.supervisor.action('bionic', intent(await revision(f.supervisor))); await done(f.supervisor, start.id); await f.supervisor.close();
  const restarted = await createLocalServiceSupervisor({ root: f.root, profilesLoader: async () => f.profiles, adapters: { observe: async () => ({ process: { state: 'running' }, api: { state: 'ready' }, model: { state: 'unknown' }, activity: { state: 'idle' } }) } });
  t.after(() => restarted.close());
  const service = (await restarted.snapshot()).services[0];
  assert.equal(service.process.state, 'running'); assert.equal(service.actions.stop.allowed, true); assert.equal(service.actions.restart.allowed, true); assert.equal(service.actions.start.allowed, false);
});

test('proven pre-effect failure is terminal and releases admission across restart', async t => {
  const f = await fixture(t, { adapters: { async start() { throw Object.assign(new Error('synthetic refusal'), { code: 'desktop_start_required', effectAttempted: false }); } } });
  const op = await f.supervisor.action('bionic', intent(await revision(f.supervisor)));
  assert.equal((await done(f.supervisor, op.id)).status, 'failed');
  assert.doesNotThrow(() => f.supervisor.assertAdmission()); assert.equal(f.supervisor.activeCount(), 0); assert.equal(f.counts().reserved, 0);
  await f.supervisor.close();
  const restarted = await createLocalServiceSupervisor({ root: f.root, profilesLoader: async () => f.profiles, adapters: { observe: async () => ({ process: { state: 'external' }, api: { state: 'unavailable' }, model: {}, activity: {} }) } });
  t.after(() => restarted.close());
  assert.equal((await restarted.operation(op.id)).status, 'failed'); assert.doesNotThrow(() => restarted.assertAdmission());
});

test('upgrade only clears the legacy refusal proven before Desktop spawn', async t => {
  for (const resultCode of ['desktop_start_required', 'desktop_start_unconfirmed', 'identity_unconfirmed', 'interrupted']) {
    const root = await mkdtemp(join(tmpdir(), 'launcher-legacy-')); t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, 'runtime/local-services'), { recursive: true });
    await writeFile(join(root, 'runtime/local-services/operations.json'), JSON.stringify({ version: 1, receipts: {}, operations: [{ id: 'legacy', serviceId: 'bionic', action: 'start', status: 'unknown', phase: 'reconcile', resultCode }] }));
    const supervisor = await createLocalServiceSupervisor({ root, profilesLoader: async () => ({ errors: {} }), adapters: {} }); t.after(() => supervisor.close());
    assert.equal((await supervisor.operation('legacy')).status, resultCode === 'desktop_start_required' ? 'failed' : 'unknown');
    if (resultCode === 'desktop_start_required') assert.doesNotThrow(() => supervisor.assertAdmission()); else assert.throws(() => supervisor.assertAdmission());
  }
});

test('restart with confirmed stop and refused new start releases admission without restoring old receipt', async t => {
  let calls = 0;
  const f = await fixture(t, { adapters: { async start() { if (++calls === 1) return { profileFingerprint: 'fixture-profile', apiPort: 1235 }; throw Object.assign(new Error('no recipe'), { code: 'desktop_start_required', effectAttempted: false }); } } });
  const first = await f.supervisor.action('bionic', intent(await revision(f.supervisor))); await done(f.supervisor, first.id);
  f.setReady(true);
  const op = await f.supervisor.action('bionic', intent(await revision(f.supervisor), '22345678-1234-1234-1234-123456789abc', 'restart'));
  assert.equal((await done(f.supervisor, op.id)).status, 'failed'); assert.doesNotThrow(() => f.supervisor.assertAdmission());
  const journal = JSON.parse(await readFile(join(f.root, 'runtime/local-services/operations.json'))); assert.equal(journal.receipts.bionic, undefined); assert.equal(f.counts().stops, 1);
});

test('Bionic reload reconciles an interrupted completed start only with its correlated receipt', async t => {
  const f = await fixture(t); const op = await f.supervisor.action('bionic', intent(await revision(f.supervisor))); await done(f.supervisor, op.id); await f.supervisor.close();
  const filename = join(f.root, 'runtime/local-services/operations.json');
  const journal = JSON.parse(await readFile(filename)); journal.operations[0].status = 'running'; journal.receipts.bionic.ownershipExpired = true;
  await writeFile(filename, JSON.stringify(journal));
  const adapters = { observe: async () => ({ process: { state: 'running' }, api: { state: 'ready' }, model: {}, activity: { state: 'idle' } }) };
  const restarted = await createLocalServiceSupervisor({ root: f.root, profilesLoader: async () => f.profiles, adapters }); t.after(() => restarted.close());
  assert.equal((await restarted.operation(op.id)).status, 'unknown'); await restarted.reload();
  assert.equal((await restarted.operation(op.id)).status, 'succeeded'); assert.doesNotThrow(() => restarted.assertAdmission());
  await restarted.close();
  delete journal.receipts.bionic.supervisorOperationId; await writeFile(filename, JSON.stringify(journal));
  const unrelated = await createLocalServiceSupervisor({ root: f.root, profilesLoader: async () => f.profiles, adapters }); t.after(() => unrelated.close());
  await unrelated.reload(); assert.equal((await unrelated.operation(op.id)).status, 'unknown'); assert.throws(() => unrelated.assertAdmission());
});

test('activity changing after confirmation prevents stop and restart launch', async t => {
  let checks = 0, busy = false;
  const f = await fixture(t, { adapters: { async observe(profile, receipt) { checks++; return { process: { state: receipt ? 'running' : 'external' }, api: { state: receipt ? 'ready' : 'unavailable' }, model: { state: 'unknown' }, activity: { state: busy && checks > 1 ? 'busy' : 'idle' } }; } } });
  const start = await f.supervisor.action('bionic', intent(await revision(f.supervisor))); await done(f.supervisor, start.id);
  const nextRevision = await revision(f.supervisor); checks = 0;
  const op = await f.supervisor.action('bionic', intent(nextRevision, '22345678-1234-1234-1234-123456789abc', 'restart'));
  busy = true;
  assert.equal((await done(f.supervisor, op.id)).status, 'failed');
  assert.deepEqual(f.counts(), { starts: 1, stops: 0, reserved: 0 });
});

for (const [action, correlated] of [['restart', true], ['start', false], ['restart', false]]) test(`Comfy ${action} recovery ${correlated ? 'confirms its new receipt' : 'rejects an unrelated receipt'} without replay`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'launcher-comfy-recovery-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'runtime/local-services'), { recursive: true });
  const id = 'interrupted-comfy-operation';
  await writeFile(join(root, 'runtime/local-services/operations.json'), JSON.stringify({ version: 1,
    receipts: { comfyui: { profileFingerprint: 'comfy-profile', supervisorOperationId: correlated ? id : 'earlier-operation' } },
    operations: [{ id, serviceId: 'comfyui', action, status: 'running' }],
  }));
  let effects = 0;
  const supervisor = await createLocalServiceSupervisor({ root, profilesLoader: async () => ({ errors: {}, comfyui: { id: 'comfyui', fingerprint: 'comfy-profile' } }), adapters: {
    observe: async () => ({ process: { state: 'running' }, api: { state: 'ready' }, activity: { state: 'idle' }, model: {} }),
    start: async () => { effects++; }, stop: async () => { effects++; },
  } }); t.after(() => supervisor.close());
  assert.equal((await supervisor.operation(id)).status, 'unknown');
  await supervisor.reload();
  assert.equal((await supervisor.operation(id)).status, correlated ? 'succeeded' : 'unknown');
  assert.equal(supervisor.activeCount(), correlated ? 0 : 1);
  assert.equal(effects, 0);
  if (correlated) assert.doesNotThrow(() => supervisor.assertAdmission());
  else assert.throws(() => supervisor.assertAdmission(), { code: 'local_service_maintenance' });
});

test('Comfy timed-out adapter start retains its correlated owned receipt and reload confirms late API readiness', async t => {
  const root = await mkdtemp(join(tmpdir(), 'launcher-comfy-late-api-')); t.after(() => rm(root, { recursive: true, force: true }));
  const profile = { id: 'comfyui', type: 'comfyui-python', fingerprint: 'late-comfy-profile', exclusiveControl: true, port: 8188, url: 'http://fixture.invalid:8188', startTimeoutMs: 1 };
  const receipt = Object.freeze({ version: 1, id: 'comfyui', pid: 9001, profileFingerprint: profile.fingerprint, operationId: '12345678-1234-1234-1234-123456789abc', token: 'f'.repeat(64) });
  let ready = false, launches = 0;
  const supervisor = await createLocalServiceSupervisor({ root, platform: 'win32', profilesLoader: async () => ({ revision: 'late-comfy', errors: {}, comfyui: profile }),
    processBackend: { async launch() { launches++; return receipt; }, async inspect(value) { assert.equal(value.token, receipt.token); assert.equal(value.operationId, receipt.operationId); return { state: 'running' }; } },
    inspectController: async () => ({ pid: receipt.pid, createdAt: 'synthetic-owned-start', executable: 'C:/fixture/python.exe' }),
    fetchImpl: async url => { if (!ready) throw Error('Synthetic API is still importing'); return Response.json(url.endsWith('/queue') ? { queue_running: [], queue_pending: [] } : { system: { comfyui_version: 'synthetic' } }); },
  }); t.after(() => supervisor.close());
  const state = (await supervisor.snapshot()).services.find(service => service.id === 'comfyui');
  const operation = await supervisor.action('comfyui', intent(state.revision));
  const timedOut = await done(supervisor, operation.id);
  assert.equal(timedOut.status, 'unknown'); assert.equal(timedOut.resultCode, 'availability_unconfirmed');
  assert.throws(() => supervisor.assertAdmission(), { code: 'local_service_maintenance' });
  ready = true;
  await supervisor.reload();
  assert.equal((await supervisor.operation(operation.id)).status, 'succeeded');
  assert.doesNotThrow(() => supervisor.assertAdmission()); assert.equal(launches, 1);
});
