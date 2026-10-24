import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, scryptSync } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import { createCompanion } from '../server.mjs';
import { createLlamaServerLibrary } from '../lib/llama-server-library.mjs';
import { createLlamaServerSettings } from '../lib/llama-server-settings.mjs';

class Reply extends EventEmitter {
  constructor() { super(); this.parts = []; this.headers = {}; this.statusCode = 200; }
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }
  write(value) { this.parts.push(String(value)); return true; }
  end(value) { if (value) this.write(value); this.writableEnded = true; this.emit('finish'); }
  text() { return this.parts.join(''); }
  json() { return JSON.parse(this.text()); }
}
const u64 = value => { const out = Buffer.alloc(8); out.writeBigUInt64LE(BigInt(value)); return out; };
const u32 = value => { const out = Buffer.alloc(4); out.writeUInt32LE(value); return out; };
const string = value => Buffer.concat([u64(Buffer.byteLength(value)), Buffer.from(value)]);
function gguf(name) { return Buffer.concat([Buffer.from('GGUF'), u32(3), u64(0), u64(2), string('general.architecture'), u32(8), string('qwen35'), string('general.name'), u32(8), string(name)]); }
async function until(predicate) { for (let n = 0; n < 200; n++) { if (await predicate()) return; await wait(5); } assert.fail('Synthetic fixture condition timed out'); }

async function fixture(t, options = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'canae-model-selection-')));
  await fs.mkdir(path.join(root, 'data')); await fs.mkdir(path.join(root, 'models'));
  await fs.writeFile(path.join(root, 'data', 'config.json'), JSON.stringify({ instanceId: randomUUID(), salt: 'synthetic', passwordHash: scryptSync('synthetic-code', 'synthetic', 32).toString('hex'), adminToken: 'synthetic-admin' }));
  const binaryPath = path.join(root, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
  await fs.writeFile(binaryPath, 'Synthetic binary, never executed');
  await fs.writeFile(path.join(root, 'models', 'qwen.gguf'), gguf('Synthetic Qwen 9B'));
  await fs.writeFile(path.join(root, 'models', 'gemma.gguf'), gguf('Synthetic Gemma E4B'));
  const library = createLlamaServerLibrary({ defaultDirectory: path.join(root, 'models') });
  const profile = await createLlamaServerSettings({ library, initial: { binaryPath } });
  const models = (await library.inventory()).models;
  const state = { effects: [], calls: [], ready: true, running: null, bionicLoaded: false, bionicPresent: false, externalPresent: false, foreignOwnedPort: false,
    failStart: false, failRename: false, renameGate: null, renameReached: false, holdChat: false, releaseChat: null, uncertainImages: false, missingContext: false };
  const backend = {
    async occupied(port) { return port === 1235 ? state.bionicPresent : port === 1236 ? state.externalPresent : port === 1238 ? state.foreignOwnedPort || !!state.running?.alive : false; },
    async launch(value) {
      const journal = JSON.parse(await fs.readFile(path.join(root, 'data', 'inference-model-selection.json'), 'utf8'));
      assert.equal(journal.operations.at(-1).state, 'starting'); assert(!JSON.stringify(journal).includes('TOKEN'));
      state.effects.push(['launch', value]);
      state.running = { alive: !state.failStart, profile: value };
      return state.running;
    },
    async inspect(handle) { return handle.alive ? { owned: true, state: state.ready ? 'running' : 'starting' } : { owned: false, state: 'failed', exitConfirmed: true }; },
    async stop(handle) { state.effects.push(['stop']); assert.equal(handle, state.running); handle.alive = false; },
    close() {}
  };
  const settings = { port: 8769, apiUrl: 'http://127.0.0.1:1235', llamaUrl: 'http://127.0.0.1:1236', inferenceProvider: 'bionic', bionicRoot: root, registryPath: path.join(root, 'registry.json'), extraRoots: [], python: 'python', comfyUrl: 'http://127.0.0.1:19999', resourcePolicy: 'independent' };
  const fetchImpl = async (url, request = {}) => {
    const target = new URL(url); state.calls.push({ url, request });
    assert(['1235', '1236', '1238'].includes(target.port), 'No network outside synthetic inference endpoints');
    if (target.port === '1235') {
      assert.equal(request.headers.Authorization, 'Bearer BIONIC_TOKEN');
      assert.equal(target.pathname, '/api/v1/models');
      return Response.json({ models: [{ key: 'bionic-model', display_name: 'Synthetic Bionic', type: 'llm', loaded_instances: state.bionicLoaded ? [{ id: 'bionic-instance', config: { context_length: 8192 } }] : [] }] });
    }
    if (target.port === '1236') return Response.json(target.pathname === '/v1/models' ? { data: [{ id: 'external-unowned', meta: { n_ctx_train: 8192 } }] } : { total_slots: 1, default_generation_settings: { n_ctx: 8192 } });
    assert.equal(request.headers.Authorization, undefined, 'External llama token must not cross to owned endpoint');
    if (target.pathname === '/v1/models') return Response.json({ data: state.running?.alive && state.ready ? [{ id: state.running.profile.alias, meta: { n_ctx_train: 8192 } }] : [] });
    if (target.pathname === '/props') return Response.json({ total_slots: 1, default_generation_settings: { n_ctx: state.missingContext ? null : state.running.profile.contextSize } });
    assert.equal(target.pathname, '/v1/chat/completions');
    if (state.holdChat) await new Promise(resolve => { state.releaseChat = resolve; });
    return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Synthetic response' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  };
  const injectedFS = new Proxy(fs, { get(target, key) { if (key === 'rename') return async (from, to) => {
    if (to === path.join(root, 'data', 'inference-settings.json')) { state.renameReached = true; if (state.failRename) throw Object.assign(Error('synthetic denied rename'), { code: 'EACCES' }); if (state.renameGate) await state.renameGate; }
    return fs.rename(from, to);
  }; return target[key]; } });
  let app, cookie;
  const start = async () => { app = await createCompanion({ root, fs: injectedFS, settings, fetchImpl,
    inferenceEnvironment: { BIONIC_API_TOKEN: 'BIONIC_TOKEN', BIONIC_LLAMA_API_TOKEN: 'EXTERNAL_LLAMA_TOKEN' },
    nativeStore: { listProjects: async () => [{ id: 'p1', name: 'Synthetic project' }], listSessions: async () => [] },
    comfyService: { getSettings: () => ({ enabled: false, activeJobs: 0 }), lifecycleStatus: () => ({ uncertain: Number(state.uncertainImages) }), async close() {} },
    localServiceSupervisor: { activeCount: () => 0, assertAdmission() {}, protectedPaths: () => [], async close() {} },
    localServiceSetup: { async snapshot() { return { canConfigure: false, services: [] }; } },
    llamaServerLibrary: library, llamaServerSettings: profile, llamaServerProcess: backend,
    llamaServerOptions: { startTimeoutMs: 10, pollMs: 1 }, ...options }); };
  await start();
  const raw = (route, body, headers = {}) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method: body === undefined ? 'GET' : 'POST', url: route, headers: { host: '127.0.0.1:8769', ...(cookie ? { cookie } : {}), ...headers }, socket: { remoteAddress: '127.0.0.1' } });
    const res = new Reply(); return { req, res, work: app.handle(req, res) };
  };
  const request = async (route, body, headers) => { const result = raw(route, body, headers); await result.work; return result.res; };
  const login = async () => { cookie = (await request('/api/login', { code: 'synthetic-code' })).headers['set-cookie'].split(';')[0]; };
  await login();
  const snapshot = async () => (await request('/api/inference/model-selection')).json();
  const input = async (modelId = models[0].id) => { const status = await snapshot(); return { modelId, requestId: randomUUID(), expectedRevision: status.profileRevision, expectedInferenceRevision: status.inferenceRevision, consent: true }; };
  const headers = async () => ({ origin: 'http://127.0.0.1:8769', 'x-local-service-csrf': (await snapshot()).csrfNonce });
  const select = async value => request('/api/inference/select-model', value || await input(), await headers());
  t.after(async () => { state.releaseChat?.(); await app.close(); assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert(path.basename(root).startsWith('canae-model-selection-')); await fs.rm(root, { recursive: true, force: true }); });
  return { root, state, models, input, snapshot, headers, raw, request, select, get app() { return app; }, async restart() { await app.close(); await start(); await login(); } };
}

test('composer GGUF selection starts once, switches owned endpoint and clears only the external llama token', async t => {
  const f = await fixture(t), choice = await f.input();
  const result = await f.select(choice); assert.equal(result.statusCode, 200, result.text());
  const selected = result.json(); assert.equal(selected.operation.state, 'succeeded'); assert.equal(selected.inference.provider, 'llamacpp'); assert.equal(selected.inference.llamaUrl, 'http://127.0.0.1:1238');
  assert.equal(selected.inference.hasLlamaToken, false); assert.equal(selected.inference.hasBionicToken, true); assert(selected.modelId.startsWith('llamacpp:'));
  assert.equal(selected.activeModel.ggufId, choice.modelId); assert.equal(selected.activeModel.confirmed, true);
  assert.equal(selected.llamaServer.process.model.inferenceAlias, 'canae-' + choice.modelId.slice(0, 16));
  const catalogue = (await f.request('/api/models')).json().models; assert.equal(catalogue[0].id, selected.modelId); assert.equal(catalogue[0].loaded, true);
  assert.equal((await f.select(choice)).statusCode, 200); assert.equal(f.state.effects.length, 1);
  const send = await f.request('/api/chat', { projectId: 'p1', model: selected.modelId, requestId: randomUUID(), text: 'Synthetic question', fileProfile: 'none' }); assert.equal(send.statusCode, 200, send.text()); assert.match(send.text(), /Synthetic response/);
  const back = await f.request('/api/inference/settings', { provider: 'bionic', expectedRevision: selected.inference.revision }); assert.equal(back.statusCode, 200, back.text());
  assert.equal((await f.request('/api/models')).json().models[0].id, 'bionic-model');
  assert.equal((await f.snapshot()).activeModel, null); assert.equal((await f.snapshot()).modelId, null);
});

test('replacement validates revisions and identity before stopping, and same-model selection avoids restart', async t => {
  const f = await fixture(t); assert.equal((await f.select()).statusCode, 200);
  assert.equal((await f.select(await f.input(f.models[0].id))).statusCode, 200); assert.equal(f.state.effects.length, 1);
  const stale = { ...await f.input(f.models[1].id), expectedInferenceRevision: 'stale' };
  assert.equal((await f.select(stale)).statusCode, 409); assert.equal(f.state.effects.length, 1);
  assert.equal((await f.select(await f.input('0'.repeat(64)))).statusCode, 409); assert.equal(f.state.effects.length, 1);
  const replaced = await f.select(await f.input(f.models[1].id)); assert.equal(replaced.statusCode, 200, replaced.text());
  assert.deepEqual(f.state.effects.map(item => item[0]), ['launch', 'stop', 'launch']);
  assert.equal(replaced.json().llamaServer.process.model.id, f.models[1].id);
});

test('external llama and loaded Bionic are refused before any owned effect', async t => {
  const f = await fixture(t); f.state.externalPresent = true;
  const foreign = await f.select(); assert.equal(foreign.statusCode, 409); assert.equal(foreign.json().code, 'llama-other-engine-loaded'); assert.equal(f.state.effects.length, 0);
  assert.equal((await f.snapshot()).inference.provider, 'bionic');
  f.state.externalPresent = false; f.state.bionicPresent = true; f.state.bionicLoaded = true;
  assert.equal((await f.select()).json().code, 'llama-other-engine-loaded'); assert.equal(f.state.effects.length, 0);
  f.state.bionicLoaded = false; assert.equal((await f.select()).statusCode, 200); assert.equal(f.state.effects.length, 1);
});

test('confirmation, nonce, origin, whitelist and unknown images refuse without launch', async t => {
  const f = await fixture(t), choice = await f.input();
  assert.equal((await f.request('/api/inference/select-model', choice, { origin: 'http://127.0.0.1:8769', 'x-local-service-csrf': 'wrong' })).statusCode, 403);
  assert.equal((await f.request('/api/inference/select-model', choice, { ...await f.headers(), origin: 'http://foreign.invalid' })).statusCode, 403);
  assert.equal((await f.select({ ...choice, consent: false })).statusCode, 400);
  assert.equal((await f.select({ ...choice, command: 'untrusted' })).statusCode, 400);
  f.state.uncertainImages = true; assert.equal((await f.select()).statusCode, 409); assert.equal(f.state.effects.length, 0);
  f.state.uncertainImages = false; await f.request('/api/logout', {}); assert.equal((await f.request('/api/inference/model-selection')).statusCode, 401);
});

test('failed start preserves previous inference connection and a fresh explicit choice can recover', async t => {
  const f = await fixture(t); f.state.failStart = true;
  const failed = await f.select(); assert.equal(failed.statusCode, 409); assert.equal((await f.snapshot()).operation.state, 'failed'); assert.equal((await f.snapshot()).inference.provider, 'bionic');
  f.state.failStart = false; assert.equal((await f.select()).statusCode, 200); assert.equal(f.state.effects.length, 2);
});

test('running and queued conversation requests block GGUF replacement and completion releases the barrier', async t => {
  const f = await fixture(t), selected = (await f.select()).json(); f.state.holdChat = true;
  const active = f.raw('/api/chat', { projectId: 'p1', model: selected.modelId, requestId: randomUUID(), text: 'Slow synthetic question', fileProfile: 'none' });
  await until(() => !!f.state.releaseChat);
  const chat = [...f.app.chatStates.values()][0].chat;
  const queued = await f.request('/api/chat', { projectId: 'p1', sessionId: chat.id, model: selected.modelId, requestId: randomUUID(), text: 'Next synthetic question', fileProfile: 'none' }); assert.equal(queued.statusCode, 200, queued.text());
  assert.equal((await f.select(await f.input(f.models[1].id))).json().code, 'inference-selection-busy'); assert.equal(f.state.effects.length, 1);
  f.state.holdChat = false; f.state.releaseChat(); await active.work; await until(() => f.app.activeWork().requests === 0);
  assert.equal((await f.select(await f.input(f.models[1].id))).statusCode, 200); assert.equal(f.state.effects.length, 3);
});

test('the owned process alone cannot activate inference until its context is confirmed', async t => {
  const f = await fixture(t); f.state.missingContext = true;
  const first = await f.select(); assert.equal(first.statusCode, 409); assert.equal(first.json().code, 'inference-selection-unknown');
  assert.equal((await f.snapshot()).inference.provider, 'bionic'); assert.equal(f.state.effects.length, 1);
  f.state.missingContext = false; assert.equal((await f.snapshot()).operation.state, 'succeeded'); assert.equal(f.state.effects.length, 1);
});

test('unknown start recovers through GET without replay; explicit stop also releases the selection lock', async t => {
  const f = await fixture(t); f.state.ready = false;
  const first = await f.select(); assert.equal(first.statusCode, 409); assert.equal(first.json().code, 'llama-start-unknown');
  assert.equal((await f.snapshot()).operation.state, 'unknown'); assert.equal((await f.snapshot()).inference.provider, 'bionic'); assert.equal(f.state.effects.length, 1);
  f.state.ready = true; const recovered = await f.snapshot(); assert.equal(recovered.operation.state, 'succeeded'); assert.equal(recovered.inference.provider, 'llamacpp'); assert.equal(f.state.effects.length, 1);
  f.state.ready = false; const next = await f.select(await f.input(f.models[1].id)); assert.equal(next.statusCode, 409);
  const status = (await f.request('/api/llama-server')).json();
  const stopped = await f.request('/api/llama-server/action', { action: 'stop', requestId: randomUUID(), expectedRevision: status.profile.revision, consent: true }, { origin: 'http://127.0.0.1:8769', 'x-local-service-csrf': status.csrfNonce });
  assert.equal(stopped.statusCode, 200, stopped.text()); assert.equal((await f.snapshot()).operation.state, 'failed'); assert.equal((await f.snapshot()).reconciliationRequired, false);
  f.state.ready = true; assert.equal((await f.select()).statusCode, 200);
});

test('activation persistence failure retains previous engine and GET retries persistence without restarting', async t => {
  const f = await fixture(t); f.state.failRename = true;
  const first = await f.select(); assert.equal(first.statusCode, 500); assert.equal((await f.snapshot()).inference.provider, 'bionic'); assert.equal((await f.snapshot()).operation.state, 'unknown'); assert.equal(f.state.effects.length, 1);
  f.state.failRename = false; const recovered = await f.snapshot(); assert.equal(recovered.operation.state, 'succeeded'); assert.equal(recovered.inference.provider, 'llamacpp'); assert.equal(f.state.effects.length, 1);
});

test('lost client response during activation is recovered by GET and idempotence survives restart', async t => {
  const f = await fixture(t), choice = await f.input(); let release; f.state.renameGate = new Promise(resolve => { release = resolve; });
  const pending = f.raw('/api/inference/select-model', choice, await f.headers());
  await until(() => f.state.renameReached);
  const during = await f.snapshot(); assert.equal(during.busy, true); assert.equal(during.operation.state, 'starting');
  assert.equal((await f.select({ ...choice, requestId: randomUUID() })).statusCode, 409);
  assert.equal((await f.request('/api/inference/settings', { provider: 'bionic', expectedRevision: during.inferenceRevision })).statusCode, 409);
  pending.res.destroyed = true; pending.res.emit('close');
  release(); await pending.work; f.state.renameGate = null;
  const status = await f.snapshot(); assert.equal(status.operation.state, 'succeeded'); assert.equal(status.inference.provider, 'llamacpp'); assert.equal(f.state.effects.length, 1);
  await f.restart(); const reloaded = await f.snapshot(); assert.equal(reloaded.operation.state, 'succeeded'); assert.equal(reloaded.llamaServer.process.state, 'detected-unowned');
  assert.equal((await f.select(choice)).statusCode, 200); assert.equal(f.state.effects.length, 1);
  assert.equal((await f.select({ ...choice, modelId: f.models[1].id })).statusCode, 409); assert.equal(f.state.effects.length, 1);
});

test('restart during unknown start never adopts a process and recovery after external stop permits a new choice', async t => {
  const f = await fixture(t); f.state.ready = false; const choice = await f.input();
  assert.equal((await f.select(choice)).statusCode, 409); await f.restart();
  const reloaded = await f.snapshot(); assert.equal(reloaded.operation.state, 'unknown'); assert.equal(reloaded.operation.code, 'inference-selection-unowned'); assert.equal(reloaded.inference.provider, 'bionic'); assert.equal(f.state.effects.length, 1);
  assert.equal((await f.select()).statusCode, 409); assert.equal(f.state.effects.length, 1);
  // The external operator confirms the orphaned listener has stopped; the app does not kill it.
  f.state.running.alive = false; assert.equal((await f.snapshot()).operation.state, 'failed');
  f.state.ready = true; assert.equal((await f.select()).statusCode, 200); assert.equal(f.state.effects.length, 2);
});
