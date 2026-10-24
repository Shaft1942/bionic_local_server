import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scryptSync } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createCompanion } from '../server.mjs';
import { describeCompanionCapabilities } from '../lib/companion-capabilities.mjs';

const model = (extra = {}) => ({ id: 'synthetic-model', type: 'llm', loaded: true, contextLength: 4096, tools: true, vision: true,
  reasoning: { allowedOptions: ['off', 'high', 'unsafe', 'high'] }, ...extra });
const describe = (extra = {}) => describeCompanionCapabilities({ inference: { provider: 'bionic', revision: 'synthetic-revision' }, models: [model()], ...extra });

test('projection separates provider support, model evidence, parameters and request permissions', () => {
  const source = model(), dto = describe({ models: [source] }), selected = dto.inference.models[0];
  assert.equal(dto.schemaVersion, 1);
  assert.equal(dto.inference.catalogue.state, 'observed');
  assert.equal(dto.inference.support.modelManagement.state, 'supported');
  assert.equal(selected.support.tools.state, 'supported');
  assert.deepEqual(selected.parameters.reasoningEffort.options, ['off', 'high']);
  assert.equal(selected.parameters.maxOutputTokens.automatic, 8192);
  assert.equal(selected.parameters.maxOutputTokens.contextBound, true);
  for (const key of ['temperature', 'topP', 'topK', 'seed', 'repeatPenalty']) {
    assert.deepEqual(selected.parameters[key].support, { state: 'unsupported', reasonCode: 'parameter-not-forwarded' });
  }
  assert.equal(dto.permissions.scriptAccess.state, 'request-scoped');
  assert.equal(dto.permissions.scriptAccess.reasonCode, 'exact-code-approval-required');
  selected.parameters.reasoningEffort.options.push('medium');
  assert.deepEqual(source.reasoning.allowedOptions, ['off', 'high', 'unsafe', 'high'], 'projection never mutates the source');
});

test('llama.cpp does not inherit Bionic management, reasoning or vision; unknown tools remain unknown', () => {
  const dto = describe({ inference: { provider: 'llamacpp' }, models: [model({ tools: 'unknown' })] });
  assert.equal(dto.inference.support.modelManagement.state, 'unsupported');
  const selected = dto.inference.models[0];
  assert.equal(selected.support.tools.state, 'unknown');
  assert.equal(selected.support.vision.state, 'unsupported');
  assert.equal(selected.support.reasoningEffort.state, 'unsupported');
  assert.deepEqual(selected.parameters.reasoningEffort.options, []);
  assert.equal(selected.parameters.maxOutputTokens.support.state, 'supported');
  const uncertain = describe({ models: [model({ tools: undefined, vision: 'true', contextLength: -2, loaded: 'true', reasoning: {} })] }).inference.models[0];
  assert.equal(uncertain.support.tools.state, 'unknown');
  assert.equal(uncertain.support.vision.state, 'unknown');
  assert.equal(uncertain.support.reasoningEffort.state, 'unknown');
  assert.equal(uncertain.loaded, null); assert.equal(uncertain.contextLength, null);
});

test('malformed, duplicated or excessive catalogues fail closed without arbitrary metadata or secret echoes', () => {
  for (const models of [null, {}, [null], [model({ id: 'bad\nmodel' })], [model({ id: 'Z:/synthetic/private.gguf' })], [model({ id: 'http://engine.invalid' })], [model({ type: null })], [model(), model()], Array(4097).fill(model())]) {
    const dto = describe({ models }); assert.equal(dto.inference.catalogue.reasonCode, 'catalogue-invalid'); assert.deepEqual(dto.inference.models, []);
  }
  const secret = 'synthetic-credential-marker';
  const dto = describe({ models: [model({ id: 'model-' + secret, token: secret })], secrets: [secret], catalogueReason: secret,
    imageSettings: { enabled: true, token: secret, url: 'http://private.example', jobIncidents: [secret] } });
  assert.equal(dto.inference.catalogue.reasonCode, 'catalogue-invalid'); assert(!JSON.stringify(dto).includes(secret));
  const projected = describe({ models: [model({ name: secret, capabilityEvidence: { endpoint: secret }, nested: secret })], secrets: [secret] });
  assert(!JSON.stringify(projected).includes(secret)); assert(!JSON.stringify(projected).includes('capabilityEvidence'));
  assert.equal(describe({ inference: { provider: 'future' } }).inference.support.chat.state, 'unknown');
});

test('ComfyUI configuration never claims reachability; missing optional methods reduce supported image counts', () => {
  for (const enabled of [true, false, undefined, 'true']) {
    const dto = describe({ imageSettings: { enabled }, imageProvider: { identity: { id: 'comfyui' }, capabilities: { singleImage: true, batch: false, series: false } } });
    assert.equal(dto.images.reachability.state, 'unknown');
    assert.equal(dto.images.availability.state, enabled === false ? 'blocked' : 'unknown');
    assert.equal(dto.images.enabled, typeof enabled === 'boolean' ? enabled : null);
    assert.equal(dto.images.parameters.imageCount.max, 1); assert.equal(dto.images.support.series.state, 'unsupported');
  }
  assert.equal(describe({ imageProvider: { capabilities: { batch: true } } }).images.parameters.imageCount.max, 5);
  assert.equal(describe().images.parameters.imageCount.max, null);
});

class Reply extends EventEmitter {
  constructor() { super(); this.parts = []; this.headers = {}; this.statusCode = 200; }
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }
  write(value) { this.parts.push(String(value)); return true; }
  end(value) { if (value) this.write(value); this.writableEnded = true; this.emit('finish'); }
  json() { return JSON.parse(this.parts.join('')); }
}

async function fixture(t, provider = 'bionic', options = {}) {
  const { testInferenceOperation = false, ...applicationOptions } = options;
  const fixtureDirectory = path.resolve(import.meta.dirname, '../work/companion-capabilities-tests');
  await fs.mkdir(fixtureDirectory, { recursive: true });
  const root = await fs.realpath(await fs.mkdtemp(path.join(fixtureDirectory, 'fixture-')));
  const state = { calls: [], writes: [], fsErrors: [], imageReads: 0, forbidden: [], enabled: true, failCatalogue: false, hold: null, reached: false };
  await fs.mkdir(path.join(root, 'data'));
  await fs.writeFile(path.join(root, 'data', 'config.json'), JSON.stringify({ instanceId: 'synthetic-instance', salt: 'synthetic', passwordHash: scryptSync('synthetic-code', 'synthetic', 32).toString('hex'), adminToken: 'synthetic-admin' }));
  if (testInferenceOperation) await fs.writeFile(path.join(root, 'data', 'inference-operations.json'), JSON.stringify({ version: 1, operations: [{ id: 'synthetic-mutation', operation: 'unload', status: 'unknown', provider: 'bionic' }] }));
  const forbidden = name => () => { state.forbidden.push(name); throw new Error('Forbidden fixture effect'); };
  const imageService = { submit: forbidden('submit'), get: forbidden('get'), owner: forbidden('owner'), image: forbidden('image'), findForOwner: forbidden('findForOwner'),
    available: forbidden('image-probe'), getSettings() { state.imageReads++; return { enabled: state.enabled, activeJobs: 0, url: 'http://private.invalid', token: 'synthetic-private-image-data' }; }, lifecycleStatus: () => ({ active: 0, uncertain: 0 }), close: async () => {} };
  const writes = new Set(['writeFile', 'appendFile', 'rename', 'unlink', 'rm', 'mkdir']);
  const instrumentedFS = new Proxy(fs, { get(target, key) { return writes.has(key) ? async (...args) => { state.writes.push(key); try { return await target[key](...args); } catch (error) { state.fsErrors.push({ operation: key, code: error.code }); throw error; } } : target[key]; } });
  const fetchImpl = async (url, request = {}) => {
    const route = new URL(url).pathname; state.calls.push({ route, method: request.method || 'GET' });
    if (request.method && request.method !== 'GET') return forbidden('engine-mutation')();
    if (state.failCatalogue) throw new Error('synthetic-provider-error-with-credential');
    if (route === '/api/v1/models') {
      state.reached = true; if (state.hold) await state.hold;
      return Response.json({ models: [{ key: 'synthetic-model', type: 'llm', display_name: 'synthetic-private-image-data', loaded_instances: [{ id: 'loaded-model', config: { context_length: 4096 } }], capabilities: { vision: true, trained_for_tool_use: false, reasoning: { allowed_options: ['off', 'high'] } } }] });
    }
    if (route === '/v1/models') return Response.json({ data: [{ id: 'synthetic-model', meta: { n_ctx_train: 8192 } }] });
    if (route === '/props') return Response.json({ total_slots: 1, default_generation_settings: { n_ctx: 2048 } });
    return forbidden('unexpected-route')();
  };
  const app = await createCompanion({ root, fs: instrumentedFS, settings: { port: 19981, apiUrl: 'http://127.0.0.1:19982', llamaUrl: 'http://127.0.0.1:19983', inferenceProvider: provider,
    comfyUrl: 'http://127.0.0.1:19984', bionicRoot: root, extraRoots: [] },
    fetchImpl, inferenceEnvironment: { BIONIC_API_TOKEN: 'synthetic-bionic-token', BIONIC_LLAMA_API_TOKEN: 'synthetic-llama-token' },
    nativeStore: { listProjects: forbidden('native-projects'), listSessions: forbidden('native-sessions') }, comfyService: imageService,
    localServiceSupervisor: { activeCount: () => 0, assertAdmission() {}, protectedPaths: () => [], close: async () => {} }, localServiceSetup: {}, ...applicationOptions });
  t.after(async () => { await app.close(); assert(path.basename(root).startsWith('fixture-')); assert.equal(path.dirname(root), await fs.realpath(fixtureDirectory)); await fs.rm(root, { recursive: true, force: true }); });
  let cookie;
  const request = async (route, body, extra = {}) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method: body === undefined ? 'GET' : 'POST', url: route,
      headers: { host: '127.0.0.1:19981', ...(cookie ? { cookie } : {}), ...extra.headers }, socket: { remoteAddress: '127.0.0.1', ...extra.socket } });
    const res = new Reply(); await app.handle(req, res); return res;
  };
  const login = async () => { const res = await request('/api/login', { code: 'synthetic-code' }); assert.equal(res.statusCode, 200); cookie = res.headers['set-cookie'].split(';')[0]; };
  return { state, root, request, login, app };
}

test('HTTP authentication, host, LAN and unsupported requests refuse before catalogue reads or effects', async t => {
  const f = await fixture(t); f.state.writes.length = 0;
  assert.equal((await f.request('/api/companion-capabilities')).statusCode, 401);
  await f.login();
  assert.equal((await f.request('/api/companion-capabilities', undefined, { headers: { host: 'foreign.invalid' } })).statusCode, 403);
  assert.equal((await f.request('/api/companion-capabilities', undefined, { socket: { remoteAddress: '203.0.113.4' } })).statusCode, 403);
  assert.equal((await f.request('/api/companion-capabilities?imageAccess=true')).statusCode, 400);
  assert.equal((await f.request('/api/companion-capabilities', {})).statusCode, 404);
  assert.equal((await f.request('/api/companion-capabilities', {}, { headers: { origin: 'http://foreign.invalid' } })).statusCode, 403);
  assert.deepEqual(f.state.calls, []); assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.forbidden, []);
});

test('HTTP observes each real adapter catalogue without generation, writes, image probes or private metadata', async t => {
  for (const provider of ['bionic', 'llamacpp']) {
    const f = await fixture(t, provider); await f.login(); f.state.writes.length = 0;
    const response = await f.request('/api/companion-capabilities'); assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    const dto = response.json(), selected = dto.inference.models[0];
    assert.equal(dto.inference.provider, provider); assert.equal(dto.inference.catalogue.state, 'observed');
    assert.equal(selected.contextLength, provider === 'bionic' ? 4096 : 2048);
    assert.equal(selected.support.tools.state, provider === 'bionic' ? 'unsupported' : 'unknown');
    assert.equal(dto.inference.support.modelManagement.state, provider === 'bionic' ? 'supported' : 'unsupported');
    assert.equal(selected.support.reasoningEffort.state, provider === 'bionic' ? 'supported' : 'unsupported');
    assert.equal(dto.images.availability.state, 'unknown');
    for (const value of ['synthetic-bionic-token', 'synthetic-llama-token', 'synthetic-private-image-data', 'private.invalid', '19982', '19983', 'capabilityEvidence']) assert(!JSON.stringify(dto).includes(value));
    assert.deepEqual(f.state.calls.map(call => call.route), provider === 'bionic' ? ['/api/v1/models'] : ['/v1/models', '/props']);
    assert(f.state.calls.every(call => call.method === 'GET')); assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.forbidden, []);
    const legacy = (await f.request('/api/capabilities')).json(); assert(Array.isArray(legacy.items)); assert.equal(typeof legacy.version, 'string');
    const imageInfo = (await f.request('/api/image-provider')).json(); assert.equal(imageInfo.identity.id, 'comfyui');
  }
});

test('catalogue refusal is unknown, preserves no raw error, and a later GET recovers without replay', async t => {
  const f = await fixture(t); await f.login(); f.state.writes.length = 0; f.state.failCatalogue = true; f.state.enabled = false;
  const failed = (await f.request('/api/companion-capabilities')).json();
  assert.equal(failed.inference.catalogue.reasonCode, 'catalogue-unavailable'); assert.deepEqual(failed.inference.models, []);
  assert.equal(failed.images.availability.reasonCode, 'image-disabled'); assert(!JSON.stringify(failed).includes('synthetic-provider-error'));
  f.state.failCatalogue = false; f.state.enabled = true;
  assert.equal((await f.request('/api/companion-capabilities')).json().inference.catalogue.state, 'observed');
  assert.equal(f.state.calls.length, 2); assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.forbidden, []);
});

test('malformed injected catalogue is represented as unknown, and never serialized', async t => {
  const f = await fixture(t, 'bionic', { modelService: { list: async () => ({ secret: 'synthetic-invalid-catalogue-secret' }) } }); await f.login();
  const dto = (await f.request('/api/companion-capabilities')).json();
  assert.equal(dto.inference.catalogue.reasonCode, 'catalogue-invalid'); assert.deepEqual(dto.inference.models, []);
  assert(!JSON.stringify(dto).includes('synthetic-invalid-catalogue-secret')); assert.deepEqual(f.state.calls, []);
});

test('reading capabilities never reconciles an uncertain model mutation or rewrites its durable intent', async t => {
  const f = await fixture(t, 'bionic', { testInferenceOperation: true }); await f.login(); f.state.writes.length = 0;
  const journal = path.join(f.root, 'data', 'inference-operations.json'), before = await fs.readFile(journal);
  assert.equal((await f.request('/api/inference/settings')).json().reconciliationRequired, true);
  assert.equal((await f.request('/api/companion-capabilities')).json().inference.catalogue.state, 'observed');
  assert.equal((await f.request('/api/inference/settings')).json().reconciliationRequired, true);
  assert.deepEqual(await fs.readFile(journal), before); assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.forbidden, []);
});

test('a catalogue overlapping an inference switch never assigns old model observations to the new revision', async t => {
  const f = await fixture(t); await f.login();
  const initial = (await f.request('/api/inference/settings')).json();
  let release;
  f.state.hold = new Promise(resolve => { release = resolve; });
  const pending = f.request('/api/companion-capabilities');
  for (let attempts = 0; attempts < 100 && !f.state.reached; attempts++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.state.reached, true);
  try {
    const switched = await f.request('/api/inference/settings', { provider: 'llamacpp', expectedRevision: initial.revision });
    assert.equal(switched.statusCode, 200, JSON.stringify({ response: switched.json(), fsErrors: f.state.fsErrors }));
  } finally { release(); }
  const stale = (await pending).json();
  assert.equal(stale.inference.provider, 'bionic'); assert.equal(stale.inference.revision, initial.revision);
  assert.equal(stale.inference.catalogue.reasonCode, 'inference-changed'); assert.deepEqual(stale.inference.models, []);
  f.state.hold = null;
  const current = (await f.request('/api/companion-capabilities')).json(); assert.equal(current.inference.provider, 'llamacpp');
  assert.notEqual(current.inference.revision, initial.revision); assert.equal(current.inference.catalogue.state, 'observed');
  assert.deepEqual(f.state.forbidden, []);
});
