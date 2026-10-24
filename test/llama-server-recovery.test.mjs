import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlamaServerManager } from '../lib/llama-server-settings.mjs';

// Entirely synthetic profile, binary identity and process handle. No file or
// listener is opened and no model or executable is read.
function fixture({ assertIdle = async () => {} } = {}) {
  const profile = { revision: 'synthetic-profile', directory: '/synthetic/models', binaryPath: '/synthetic/llama-server', port: 1248, contextSize: 1024, gpuLayers: 0, endpoint: 'http://127.0.0.1:1248' };
  const models = ['a', 'b'].map(letter => ({ id: letter.repeat(64), name: letter, filename: '/synthetic/' + letter + '.gguf', fileIdentity: { size: 1, ino: letter } }));
  const state = { alive: false, ready: true, stopUnknown: false, foreign: false, effects: [] };
  const backend = {
    async occupied() { return state.foreign || state.alive; },
    async launch(value) { state.effects.push(['launch', value.alias]); state.alive = true; return { profile: value }; },
    async inspect() { return state.alive ? { state: state.ready ? 'running' : 'starting', owned: true } : { state: 'failed', owned: false, exitConfirmed: true }; },
    async stop() { state.effects.push(['stop']); if (state.stopUnknown) throw Object.assign(Error('Synthetic delayed exit'), { code: 'llama-stop-unknown', status: 409 }); state.alive = false; },
    close() {}
  };
  const settings = { snapshot: () => ({ ...profile }), validateBinary: async filename => ({ filename, identity: { ino: 1 } }), library: {
    async resolveModel({ modelId }) { const model = models.find(value => value.id === modelId); if (!model) throw Error('Synthetic missing model'); return { ...model }; }
  } };
  const manager = createLlamaServerManager({ settings, processBackend: backend, assertIdle, assertConnectorAvailable: async () => {}, startTimeoutMs: 2, pollMs: 1 });
  const action = (kind, requestId, modelId = models[0].id) => ({ action: kind, requestId, expectedRevision: profile.revision, modelId, consent: true });
  return { state, models, manager, action };
}

test('an unknown start whose child later exits settles on GET and a fresh explicit start recovers', async () => {
  const f = fixture(); f.state.ready = false;
  await assert.rejects(f.manager.action(f.action('start', 'unknown-start-1')), { code: 'llama-start-unknown' });
  f.state.alive = false;
  const status = await f.manager.snapshot();
  assert.equal(status.operation.state, 'failed');
  assert.equal(status.operation.code, 'llama-start-failed');
  assert.equal(status.lifecycle.reconciliationRequired, false);
  assert.equal(status.process.model, null);
  assert.equal(f.state.effects.length, 1);
  f.state.ready = true;
  const next = await f.manager.action(f.action('start', 'unknown-start-2'));
  assert.equal(next.process.state, 'running');
  assert.equal(f.state.effects.length, 2);
});

test('an ambiguous replacement stop never reports success from the old running model, even for the same GGUF', async () => {
  const f = fixture();
  await f.manager.action(f.action('start', 'replacement-initial'));
  f.state.stopUnknown = true;
  await assert.rejects(f.manager.action(f.action('replace', 'replacement-unknown')), { code: 'llama-stop-unknown' });
  const pending = await f.manager.snapshot();
  assert.equal(pending.operation.state, 'unknown');
  assert.equal(pending.lifecycle.reconciliationRequired, true);
  assert.deepEqual(f.state.effects.map(value => value[0]), ['launch', 'stop']);
  f.state.alive = false;
  const settled = await f.manager.snapshot();
  assert.equal(settled.operation.state, 'failed');
  assert.equal(settled.operation.code, 'llama-replacement-stopped');
  assert.equal(settled.lifecycle.reconciliationRequired, false);
  assert.equal(settled.process.model, null);
  assert.deepEqual(f.state.effects.map(value => value[0]), ['launch', 'stop']);
  f.state.stopUnknown = false;
  await f.manager.action(f.action('start', 'replacement-recovery', f.models[1].id));
  assert.deepEqual(f.state.effects.map(value => value[0]), ['launch', 'stop', 'launch']);
});

test('late start success clears the error and retry returns confirmed status without another process effect', async () => {
  const f = fixture(), input = f.action('start', 'late-start-success'); f.state.ready = false;
  await assert.rejects(f.manager.action(input), { code: 'llama-start-unknown' });
  f.state.ready = true;
  const status = await f.manager.snapshot();
  assert.equal(status.operation.state, 'succeeded');
  assert.equal(status.operation.code, undefined);
  const retried = await f.manager.action(input);
  assert.equal(retried.operation.state, 'succeeded');
  assert.equal(f.state.effects.length, 1);
});

test('an idempotency key identifies the same semantic action regardless of JSON property order', async () => {
  const f = fixture(), input = f.action('start', 'same-semantic-action');
  await f.manager.action(input);
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  assert.equal((await f.manager.action(reordered)).operation.state, 'succeeded');
  assert.equal(f.state.effects.length, 1);
  await assert.rejects(f.manager.action({ ...input, modelId: f.models[1].id }), { code: 'llama-request-conflict' });
});

test('a guard refusal immediately before replacement stop preserves the old child and releases admission', async () => {
  let deny = false, checks = 0;
  const f = fixture({ assertIdle: async () => {
    if (deny && ++checks === 2) throw Object.assign(Error('Synthetic new work'), { status: 409, code: 'llama-work-active' });
  } });
  await f.manager.action(f.action('start', 'guard-initial-model'));
  deny = true;
  await assert.rejects(f.manager.action(f.action('replace', 'guard-refused-replace', f.models[1].id)), { code: 'llama-work-active' });
  const status = await f.manager.snapshot();
  assert.equal(status.operation.state, 'failed');
  assert.equal(status.lifecycle.reconciliationRequired, false);
  assert.equal(status.process.state, 'running');
  assert.equal(status.process.model.id, f.models[0].id);
  assert.equal(f.state.effects.length, 1);
  deny = false;
  await f.manager.action(f.action('stop', 'guard-recovery-stop'));
  assert.deepEqual(f.state.effects.map(value => value[0]), ['launch', 'stop']);
});
