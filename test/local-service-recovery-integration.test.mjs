import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createLocalServiceSupervisor } from '../lib/local-service-supervisor.mjs';

const profile = { id: 'bionic', type: 'bionic-cli', fingerprint: 'synthetic-profile', exclusiveControl: true, url: 'http://synthetic.invalid:1235', port: 1235, cliPath: 'C:/synthetic/lms.exe', apiInfoPath: 'C:/synthetic/http-server.json' };
const intent = (revision, suffix, action = 'start') => ({ expectedRevision: revision, idempotencyKey: 'independent-recovery-' + suffix, action });
async function terminal(supervisor, id) {
  for (let n = 0; n < 100; n++) {
    const op = await supervisor.operation(id);
    if (!['accepted', 'running'].includes(op.status)) return op;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Synthetic operation did not complete');
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'bionic-independent-recovery-'));
  let apiReady = false, mutationCount = 0, controllerTime = 'synthetic-controller-original';
  const instances = [];
  const options = {
    root, platform: 'win32', profilesLoader: async () => ({ bionic: profile, errors: {}, revision: 'synthetic-config' }),
    inspectController: async () => ({ pid: 12345, createdAt: controllerTime, executable: 'C:/synthetic/Bionic.exe', configIdentity: { mtimeMs: 1, ctimeMs: 1, ino: 2, dev: 1, size: 10 } }),
    execFileImpl: async (filename, args) => {
      assert.equal(filename, profile.cliPath);
      if (args[1] !== 'status') { mutationCount++; apiReady = args[1] === 'start'; }
      return { stdout: JSON.stringify({ running: apiReady, port: 1235 }) };
    },
    fetchImpl: async url => {
      assert.equal(url, 'http://synthetic.invalid:1235/api/v1/models');
      if (!apiReady) throw new Error('Synthetic API unavailable');
      return { ok: true, json: async () => ({ models: [] }) };
    },
    processBackend: { close: async () => {} },
  };
  t.after(async () => {
    await Promise.allSettled(instances.map(instance => instance.close()));
    assert.equal(dirname(root), tmpdir());
    assert.ok(basename(root).startsWith('bionic-independent-recovery-'));
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    async open() { const supervisor = await createLocalServiceSupervisor(options); instances.push(supervisor); return supervisor; },
    get mutationCount() { return mutationCount; },
    replaceController() { controllerTime = 'synthetic-controller-replaced'; },
  };
}

test('real adapter restores strong Bionic continuity across companion restart and rejects a replaced controller', async t => {
  const f = await fixture(t);
  const first = await f.open();
  const start = await first.action('bionic', intent((await first.snapshot()).services[0].revision, 'start'));
  assert.equal((await terminal(first, start.id)).status, 'succeeded');
  assert.equal(f.mutationCount, 1);
  await first.close();
  // A stable 2.5.0 journal may already carry this former forced-expiry flag.
  const journalPath = join(f.root, 'runtime/local-services/operations.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  journal.receipts.bionic.ownershipExpired = true;
  await writeFile(journalPath, JSON.stringify(journal));
  const resumed = await f.open();
  let state = (await resumed.snapshot()).services[0];
  assert.equal(state.process.state, 'running');
  assert.equal(state.actions.stop.allowed, true);
  assert.equal(state.actions.restart.allowed, true);
  assert.equal(f.mutationCount, 1, 'observing a recovered receipt must have no mutating effect');
  const frozenRevision = state.revision;
  f.replaceController();
  await assert.rejects(resumed.action('bionic', intent(frozenRevision, 'stop-replaced', 'stop')), { code: 'stale_revision' });
  state = (await resumed.snapshot()).services[0];
  assert.equal(state.process.state, 'unknown');
  assert.equal(state.actions.stop.allowed, false);
  await assert.rejects(resumed.action('bionic', intent(state.revision, 'stop-foreign-current', 'stop')), { code: 'identity_unconfirmed' });
  assert.equal(f.mutationCount, 1, 'a foreign controller must never receive stop');
});

test('real adapter pre-effect refusal is terminal across companion restart without a global admission lock', async t => {
  const f = await fixture(t);
  // Use the same actual adapter recipe, but a closed Desktop has no known port.
  const original = await f.open();
  await original.close();
  const root = f.root;
  let effects = 0;
  const supervisor = await createLocalServiceSupervisor({ root, platform: 'win32', profilesLoader: async () => ({ bionic: profile, errors: {}, revision: 'synthetic-config' }), processBackend: {},
    execFileImpl: async (filename, args) => { if (args[1] !== 'status') effects++; return { stdout: '{"running":false}' }; },
    fetchImpl: async () => { throw new Error('Synthetic API unavailable'); },
  });
  t.after(() => supervisor.close());
  const op = await supervisor.action('bionic', intent((await supervisor.snapshot()).services[0].revision, 'no-desktop'));
  const result = await terminal(supervisor, op.id);
  assert.equal(result.status, 'failed');
  assert.equal(result.resultCode, 'desktop_start_required');
  assert.equal(effects, 0);
  assert.doesNotThrow(() => supervisor.assertAdmission());
  await supervisor.close();
  const resumed = await f.open();
  assert.equal((await resumed.operation(op.id)).status, 'failed');
  assert.doesNotThrow(() => resumed.assertAdmission());
});
