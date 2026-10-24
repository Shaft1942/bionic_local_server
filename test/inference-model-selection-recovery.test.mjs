import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createLlamaServerManager } from '../lib/llama-server-settings.mjs';
import { createInferenceModelSelection } from '../lib/inference-model-selection.mjs';

function memoryFS() {
  const files = new Map();
  return {
    async lstat(filename) { if (!files.has(filename)) throw Object.assign(Error('Absent synthetic file'), { code: 'ENOENT' }); return { isFile: () => true, isSymbolicLink: () => false, nlink: 1, size: files.get(filename).length }; },
    async mkdir() {}, async readFile(filename) { return files.get(filename); },
    async writeFile(filename, bytes) { files.set(filename, bytes); },
    async rename(from, to) { files.set(to, files.get(from)); files.delete(from); },
    async unlink(filename) { files.delete(filename); }
  };
}

async function fixture({ assertIdle = async () => {} } = {}) {
  const model = { id: 'a'.repeat(64), name: 'Synthetic GGUF', filename: '/synthetic/a.gguf', fileIdentity: { ino: 1 } };
  const profile = { revision: 'synthetic-profile', directory: '/synthetic', binaryPath: '/synthetic/llama-server', port: 1248, contextSize: 1024, gpuLayers: 0, endpoint: 'http://127.0.0.1:1248' };
  const state = { alive: false, ready: true, stopUnknown: false, foreign: false, activations: 0, effects: [] };
  const manager = createLlamaServerManager({ settings: {
    snapshot: () => ({ ...profile }), validateBinary: async filename => ({ filename, identity: { ino: 1 } }),
    library: { resolveModel: async () => ({ ...model }), inventory: async () => ({ models: [{ ...model, selectable: true }] }) }
  }, processBackend: {
    occupied: async () => state.foreign || state.alive,
    launch: async () => { state.effects.push('launch'); state.alive = true; return {}; },
    inspect: async () => state.alive ? { owned: true, state: state.ready ? 'running' : 'starting' } : { owned: false, state: 'stopped', exitConfirmed: true },
    stop: async () => { state.effects.push('stop'); if (state.stopUnknown) throw Object.assign(Error('Synthetic ambiguous stop'), { code: 'llama-stop-unknown' }); state.alive = false; }
  }, assertIdle, assertConnectorAvailable: async () => {}, startTimeoutMs: 2, pollMs: 1 });
  const inference = { revision: 'synthetic-inference', provider: 'bionic', llamaUrl: 'http://127.0.0.1:1236', hasLlamaToken: false };
  const selection = await createInferenceModelSelection({ filename: path.resolve('/synthetic/selection.json'), fs: memoryFS(), manager,
    inferenceSettings: { snapshot: () => ({ ...inference }) }, assertIdle: async () => {}, prepareActivation: async () => ({}),
    activate: async () => { state.activations++; Object.assign(inference, { provider: 'llamacpp', llamaUrl: profile.endpoint }); },
    readActiveModel: async () => ({ id: 'llamacpp:synthetic', loaded: true, contextLength: 1024 })
  });
  const choose = requestId => ({ modelId: model.id, requestId, expectedRevision: profile.revision, expectedInferenceRevision: inference.revision, consent: true });
  const action = (kind, requestId) => ({ action: kind, modelId: model.id, requestId, expectedRevision: profile.revision, consent: true });
  return { state, manager, selection, inference, choose, action };
}

test('selection never activates the old same-GGUF child while its replacement stop is ambiguous', async () => {
  const f = await fixture(); await f.manager.action(f.action('start', 'selection-old-start'));
  f.state.ready = false; f.state.stopUnknown = true;
  await assert.rejects(f.selection.select(f.choose('selection-stop-unknown')), { code: 'llama-stop-unknown' });
  f.state.ready = true;
  const pending = await f.selection.snapshot();
  assert.equal(pending.llamaServer.operation.state, 'unknown');
  assert.equal(pending.llamaServer.operation.phase, 'stopping');
  assert.equal(pending.operation.state, 'unknown');
  assert.equal(pending.reconciliationRequired, true);
  assert.equal(pending.activeModel, null);
  assert.equal(pending.inference.provider, 'bionic');
  assert.equal(f.state.activations, 0);
  assert.deepEqual(f.state.effects, ['launch', 'stop']);
  f.state.alive = false;
  const settled = await f.selection.snapshot();
  assert.equal(settled.operation.state, 'failed');
  assert.equal(settled.reconciliationRequired, false);
  assert.equal(f.state.activations, 0);
  f.state.stopUnknown = false;
  const recovered = await f.selection.select(f.choose('selection-explicit-recovery'));
  assert.equal(recovered.operation.state, 'succeeded');
  assert.equal(recovered.activeModel.confirmed, true);
  assert.equal(f.state.activations, 1);
  assert.deepEqual(f.state.effects, ['launch', 'stop', 'launch']);
});

test('an earlier successful selection does not claim an active model during an ambiguous owned stop', async () => {
  const f = await fixture();
  const first = await f.selection.select(f.choose('selection-initial-success'));
  assert.equal(first.activeModel.confirmed, true);
  f.state.stopUnknown = true;
  await assert.rejects(f.manager.action(f.action('stop', 'selection-direct-stop')), { code: 'llama-stop-unknown' });
  const pending = await f.selection.snapshot();
  assert.equal(pending.llamaServer.operation.state, 'unknown');
  assert.equal(pending.activeModel, null);
  assert.equal(pending.modelId, null);
  assert.equal(f.state.activations, 1);
  assert.deepEqual(f.state.effects, ['launch', 'stop']);
});

test('a correlated failed start releases selection even if a foreign listener takes the former port', async () => {
  const f = await fixture(); f.state.ready = false;
  await assert.rejects(f.selection.select(f.choose('selection-unknown-start')), { code: 'llama-start-unknown' });
  f.state.alive = false; f.state.foreign = true;
  // An independent manager GET can settle its operation before selection rereads.
  assert.equal((await f.manager.snapshot()).operation.state, 'failed');
  const status = await f.selection.snapshot();
  assert.equal(status.llamaServer.process.state, 'detected-unowned');
  assert.equal(status.operation.state, 'failed');
  assert.equal(status.operation.code, 'llama-port-still-occupied');
  assert.equal(status.reconciliationRequired, false);
  assert.equal(status.inference.provider, 'bionic');
  assert.equal(f.state.activations, 0);
  assert.deepEqual(f.state.effects, ['launch']);
});

test('a correlated refusal before replacement stop cannot activate the old same-GGUF child on reread', async () => {
  let deny = false, checks = 0;
  const f = await fixture({ assertIdle: async () => {
    if (deny && ++checks === 2) throw Object.assign(Error('Synthetic new work'), { status: 409, code: 'llama-work-active' });
  } });
  await f.manager.action(f.action('start', 'selection-old-child'));
  f.state.ready = false; deny = true;
  await assert.rejects(f.selection.select(f.choose('selection-refused-replace')), { code: 'llama-work-active' });
  f.state.ready = true;
  const status = await f.selection.snapshot();
  assert.equal(status.llamaServer.operation.state, 'failed');
  assert.equal(status.llamaServer.process.state, 'running');
  assert.equal(status.operation.state, 'failed');
  assert.equal(status.reconciliationRequired, false);
  assert.equal(status.inference.provider, 'bionic');
  assert.equal(f.state.activations, 0);
  assert.deepEqual(f.state.effects, ['launch']);
});
