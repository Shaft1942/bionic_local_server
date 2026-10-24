import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createLlamaServerLibrary, readGGUFMetadata, validateLlamaServerBinary } from '../lib/llama-server-library.mjs';
import { createLlamaServerSettings, createLlamaServerManager, createLlamaServerProcess } from '../lib/llama-server-settings.mjs';

const u64 = value => { const out = Buffer.alloc(8); out.writeBigUInt64LE(BigInt(value)); return out; };
const u32 = value => { const out = Buffer.alloc(4); out.writeUInt32LE(value); return out; };
const string = value => Buffer.concat([u64(Buffer.byteLength(value)), Buffer.from(value)]);
function gguf(architecture = 'qwen35', name = 'Synthetic Qwen 9B') { const items = [['general.architecture', architecture], ['general.name', name]]; return Buffer.concat([Buffer.from('GGUF'), u32(3), u64(0), u64(items.length), ...items.flatMap(([key, value]) => [string(key), u32(8), string(value)])]); }
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canae-llama-library-'));
  t.after(() => { const resolved = path.resolve(root); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('canae-llama-library-')); return fs.rm(resolved, { recursive: true, force: true }); });
  const directory = path.join(root, 'models'), binaryPath = path.join(root, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
  await fs.mkdir(directory); await fs.writeFile(binaryPath, 'synthetic binary, never executed');
  await fs.writeFile(path.join(directory, 'qwen.gguf'), gguf()); await fs.writeFile(path.join(directory, 'gemma.gguf'), gguf('gemma4', 'Synthetic Gemma E4B'));
  const library = createLlamaServerLibrary({ defaultDirectory: directory });
  const settings = await createLlamaServerSettings({ filename: path.join(root, 'owned-settings.json'), library, initial: { binaryPath } });
  return { root, directory, binaryPath, library, settings };
}
function fakeBackend({ ready = true, foreign = false } = {}) {
  const calls = []; let live = null;
  return { calls, async occupied() { return foreign || !!live?.alive; }, async launch(profile) { calls.push(['launch', profile]); live = { alive: true, profile }; return live; }, async inspect(handle) { return handle.alive ? { state: ready ? 'running' : 'starting', owned: true } : { state: 'stopped', owned: false, exitConfirmed: true }; }, async stop(handle) { calls.push(['stop']); handle.alive = false; return { state: 'stopped', exitConfirmed: true }; }, setReady(value) { ready = value; }, close() {} };
}
const action = (profile, kind, requestId, modelId) => ({ action: kind, expectedRevision: profile.revision, requestId, modelId, consent: true });

test('inventory shares files, excludes projector/private paths and signals unsupported GGUF', async t => {
  const { directory, library } = await fixture(t);
  await fs.mkdir(path.join(directory, 'private')); await fs.writeFile(path.join(directory, 'private', 'secret.gguf'), gguf());
  await fs.writeFile(path.join(directory, 'mmproj-qwen.gguf'), gguf()); await fs.writeFile(path.join(directory, 'encoder.gguf'), gguf('clip'));
  await fs.writeFile(path.join(directory, 'invalid.gguf'), 'broken'); await fs.writeFile(path.join(directory, 'split-00001-of-00002.gguf'), gguf());
  const value = await library.inventory();
  assert.equal(value.models.length, 4); assert.equal(value.excludedProjectors, 2); assert.equal(value.noWeightsRead, true);
  assert.equal(value.models.find(item => item.relativePath === 'invalid.gguf').compatibility, 'unsupported');
  assert.equal(value.models.find(item => item.relativePath.startsWith('split-')).selectable, false);
  assert.ok(value.models.filter(item => item.selectable).every(item => item.compatibility === 'unverified'));
  await assert.rejects(library.inventory(path.dirname(directory)), { status: 403 });
  await assert.rejects(library.resolveModel({ directory, modelId: '../qwen.gguf' }), { status: 400 });
});
test('metadata reader never reads tensor payload and stops at its byte budget', async () => {
  const metadata = gguf(), file = Buffer.concat([metadata, Buffer.alloc(1000000, 42)]), reads = [];
  const handle = { async read(buffer, start, length, position) { reads.push([position, length]); const count = file.copy(buffer, start, position, position + length); return { bytesRead: count }; } };
  const value = await readGGUFMetadata(handle, 65536);
  assert.equal(value.architecture, 'qwen35'); assert.ok(reads.every(([position, length]) => position + length <= metadata.length));
  reads.length = 0; const bounded = await readGGUFMetadata(handle, 32); assert.equal(bounded.metadataIncomplete, true); assert.ok(reads.every(([position, length]) => position + length <= 32));
});
test('bounded inventory and no link adoption', async t => {
  const { directory, root } = await fixture(t), library = createLlamaServerLibrary({ defaultDirectory: directory, maxModels: 1 });
  assert.equal((await library.inventory()).truncated, true);
  const outside = path.join(root, 'outside'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'foreign.gguf'), gguf());
  try { await fs.symlink(outside, path.join(directory, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); } catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return t.diagnostic('Link creation unavailable; other bounds verified.'); throw error; }
  const result = await createLlamaServerLibrary({ defaultDirectory: directory }).inventory(); assert.equal(result.excludedLinks, 1); assert.equal(result.models.length, 2);
});
test('profile persists atomically, revision conflicts preserve previous values, port1237 forbidden', async t => {
  const { root, library, settings, binaryPath } = await fixture(t), model = (await library.inventory()).models[0];
  const old = settings.snapshot();
  await assert.rejects(settings.save({ expectedRevision: old.revision, port: 1237 }), { code: 'llama-port-reserved' });
  const next = await settings.save({ expectedRevision: old.revision, modelId: model.id, contextSize: 4096 });
  await assert.rejects(settings.save({ expectedRevision: old.revision, contextSize: 8192 }), { status: 409 });
  const restored = await createLlamaServerSettings({ filename: path.join(root, 'owned-settings.json'), library, initial: { binaryPath } }); assert.equal(restored.snapshot().revision, next.revision); assert.equal(restored.snapshot().modelId, model.id);
  await assert.rejects(validateLlamaServerBinary(path.join(root, 'cmd.exe')), { status: 400 });
});
test('idle and connector guards refuse before any process effect; no implicit lifecycle', async t => {
  const { settings, library } = await fixture(t), model = (await library.inventory()).models[0], backend = fakeBackend();
  const manager = createLlamaServerManager({ settings, processBackend: backend, assertIdle: async () => { throw Object.assign(Error('busy'), { status: 409 }); }, assertConnectorAvailable: async () => {} });
  assert.equal((await manager.snapshot()).process.state, 'configured'); assert.equal(backend.calls.length, 0);
  await assert.rejects(manager.action(action(settings.snapshot(), 'start', 'request-busy', model.id)), { status: 409 }); assert.equal(backend.calls.length, 0); assert.equal(manager.activeCount(), 0);
  const guarded = createLlamaServerManager({ settings, processBackend: backend, assertIdle: async () => {}, assertConnectorAvailable: async () => { throw Object.assign(Error('other model'), { status: 409 }); } });
  await assert.rejects(guarded.action(action(settings.snapshot(), 'start', 'request-other', model.id))); assert.equal(backend.calls.length, 0);
});
test('start, GET recovery, duplicate request and explicit replacement/stop have exact effects', async t => {
  const { settings, library } = await fixture(t), models = (await library.inventory()).models, backend = fakeBackend();
  const manager = createLlamaServerManager({ settings, processBackend: backend, assertIdle: async () => {}, assertConnectorAvailable: async () => {} });
  const start = action(settings.snapshot(), 'start', 'request-start', models[0].id);
  const started = await manager.action(start); assert.equal(started.process.state, 'running'); assert.equal((await manager.snapshot()).operation.requestId, 'request-start');
  await manager.action(start); assert.equal(backend.calls.length, 1);
  await assert.rejects(manager.action({ ...start, modelId: models[1].id }), { code: 'llama-request-conflict' });
  await manager.action(action(settings.snapshot(), 'replace', 'request-replace', models[1].id)); assert.deepEqual(backend.calls.map(item => item[0]), ['launch', 'stop', 'launch']);
  await manager.action(action(settings.snapshot(), 'stop', 'request-stop')); assert.equal((await manager.snapshot()).process.state, 'configured');
});
test('unknown loading survives browser reread without POST; explicit stop remains possible', async t => {
  const { settings, library } = await fixture(t), model = (await library.inventory()).models[0], backend = fakeBackend({ ready: false });
  const manager = createLlamaServerManager({ settings, processBackend: backend, startTimeoutMs: 2, pollMs: 1, assertIdle: async () => {}, assertConnectorAvailable: async () => {} });
  await assert.rejects(manager.action(action(settings.snapshot(), 'start', 'request-unknown', model.id)), { code: 'llama-start-unknown' });
  assert.equal((await manager.snapshot()).operation.state, 'unknown'); assert.equal(backend.calls.length, 1);
  backend.setReady(true); assert.equal((await manager.snapshot()).operation.state, 'succeeded'); assert.equal(backend.calls.length, 1);
  await manager.action(action(settings.snapshot(), 'stop', 'request-stop-unknown')); assert.equal(backend.calls.length, 2);
});
test('external listener stays unowned; local-only profile changes and replacement validation precede stop', async t => {
  const { settings, library } = await fixture(t), model = (await library.inventory()).models[0], foreign = fakeBackend({ foreign: true });
  const manager = createLlamaServerManager({ settings, processBackend: foreign, assertIdle: async () => {}, assertConnectorAvailable: async () => {} });
  assert.equal((await manager.snapshot()).process.state, 'detected-unowned');
  await assert.rejects(manager.action(action(settings.snapshot(), 'stop', 'request-foreign-stop')), { code: 'llama-not-owned' });
  await assert.rejects(manager.action(action(settings.snapshot(), 'start', 'request-foreign-start', model.id)), { code: 'llama-external-listener' }); assert.equal(foreign.calls.length, 0);
  await assert.rejects(manager.save({ expectedRevision: settings.snapshot().revision, port: 1240 }), { status: 403 });
  const backend = fakeBackend(), owned = createLlamaServerManager({ settings, processBackend: backend, assertIdle: async () => {}, assertConnectorAvailable: async () => {} });
  await owned.action(action(settings.snapshot(), 'start', 'request-valid-start', model.id));
  await assert.rejects(owned.action(action(settings.snapshot(), 'replace', 'request-invalid-replace', '0'.repeat(64))), { status: 409 }); assert.equal(backend.calls.length, 1);
});
test('direct process backend uses fixed arguments and child handle only, never actual binary', async () => {
  const calls = [], child = new EventEmitter(); child.pid = 123456; child.unref = () => {}; child.kill = signal => { calls.push(['kill', signal]); queueMicrotask(() => child.emit('exit', 0)); return true; };
  const connectImpl = () => { const socket = new EventEmitter(); socket.destroy = () => {}; socket.setTimeout = () => {}; queueMicrotask(() => socket.emit('error', { code: 'ECONNREFUSED' })); return socket; };
  const backend = createLlamaServerProcess({ spawnImpl: (...args) => { calls.push(['spawn', ...args]); return child; }, connectImpl, fetchImpl: async () => Response.json({ data: [{ id: 'fixture-model' }] }), pollMs: 1 });
  const handle = await backend.launch({ binaryPath: path.resolve('llama-server.exe'), modelPath: path.resolve('shared.gguf'), alias: 'fixture-model', port: 1248, contextSize: 4096, gpuLayers: 0 });
  assert.equal((await backend.inspect(handle)).state, 'running'); assert.equal(calls[0][3].shell, false); assert.equal(calls[0][3].windowsHide, true); assert.ok(calls[0][2].includes('127.0.0.1')); assert.ok(calls[0][2].includes(path.resolve('shared.gguf')));
  await backend.stop(handle); assert.deepEqual(calls[1], ['kill', 'SIGTERM']);
  await assert.rejects(backend.stop({ child }), { code: 'llama-not-owned' });
});
