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

class Reply extends EventEmitter {
  constructor() { super(); this.parts = []; this.headers = {}; this.statusCode = 200; }
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }
  write(value) { this.parts.push(String(value)); return true; }
  end(value) { if (value) this.write(value); this.writableEnded = true; this.emit('finish'); }
  text() { return this.parts.join(''); }
  json() { return JSON.parse(this.text()); }
}
async function fixture(t, options = {}) {
  const { testImageProviderIdentity, ...applicationOptions } = options;
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'inference-http-test-')));
  await fs.mkdir(path.join(root, 'data'));
  await fs.writeFile(path.join(root, 'data', 'config.json'), JSON.stringify({ instanceId: randomUUID(), salt: 'synthetic', passwordHash: scryptSync('synthetic-code', 'synthetic', 32).toString('hex'), adminToken: 'synthetic-admin' }));
  await fs.writeFile(path.join(root, 'registry.json'), JSON.stringify({ projects: [['p1', { projectWorkingDirectoryPath: root }]] }));
  const state = { calls: [], submissions: [], imageStatus: null, hold: false, release: null, renameGate: null, failRename: false, connections: null, loaded: true, failModelMutation: null, catalogueGate: null, catalogueReadReached: false };
  const settings = { port: 8769, apiUrl: 'http://127.0.0.1:1235', llamaUrl: 'http://127.0.0.1:1236', inferenceProvider: 'bionic', bionicRoot: root, registryPath: path.join(root, 'registry.json'), extraRoots: [], python: 'python', comfyUrl: 'http://127.0.0.1:19999', resourcePolicy: 'independent' };
  const comfy = { async submit(args, owner, _signal, selection) { const job = { modelPolicy: selection?.modelPolicy, id: randomUUID(), status: 'queued', owner, prompt: args.prompt, seed: 42, width: 1024, height: 1024 }; state.submissions.push(job); return { ...job, owner: undefined }; }, get(id) { const job = state.submissions.find(job => job.id === id); return { ...job, owner: undefined }; }, owner(id) { return state.submissions.find(job => job.id === id).owner; }, findForOwner(owner) { return state.submissions.find(job => Object.keys(owner).every(key => owner[key] === job.owner[key])); }, async image() { return { bytes: Buffer.from('synthetic-image-data'), mime: 'image/png' }; }, getSettings() { return { enabled: true, activeJobs: 0, modelPolicy:state.modelPolicy||'keep' }; }, resolveSelection(workflowId) { return {workflowId:workflowId||'krea2_turbo',modelPolicy:state.modelPolicy||'keep'}; }, lifecycleStatus() { return { active: 0, uncertain: state.imageStatus === 'unknown' ? 1 : 0 }; }, async close() {} };
  const fetchImpl = async (url, request = {}) => {
    state.calls.push({ url, request }); const target = new URL(url);
    assert(['http://127.0.0.1:1235', 'http://127.0.0.1:1236'].includes(target.origin));
    if (target.pathname === '/api/v1/models') { state.catalogueReadReached = true; if (state.catalogueGate) await state.catalogueGate; return Response.json({ models: [{ key: 'shared-alias', display_name: 'Synthetic Bionic', type: 'llm', loaded_instances: state.loaded ? [{ id: 'bionic-loaded', config: { context_length: 8192 } }] : [], capabilities: { trained_for_tool_use: true } }] }); }
    if (['/api/v1/models/unload', '/api/v1/models/load'].includes(target.pathname)) {
      const operation = target.pathname.split('/').at(-1), journal = JSON.parse(await fs.readFile(path.join(root, 'data', 'inference-operations.json'), 'utf8'));
      assert(journal.operations.some(item => item.operation === operation && item.status === 'pending'), 'intent must be durable before model mutation HTTP'); assert(!JSON.stringify(journal).includes('BIONIC_FIXTURE'));
      if (operation === 'load' && state.modelLoadGate) { state.modelLoadReached = true; await state.modelLoadGate; }
      state.loaded = operation === 'load'; if (state.failModelMutation === operation) throw new Error('Synthetic lost model mutation response');
      return Response.json(operation === 'load' ? { status: 'loaded', instance_id: 'bionic-loaded', load_config: { context_length: 8192 } } : { instance_id: 'bionic-loaded' });
    }
    if (target.pathname === '/v1/models') return Response.json({ data: [{ id: 'shared-alias', meta: { n_ctx_train: 8192 } }] });
    if (target.pathname === '/props') return Response.json({ total_slots: 1, default_generation_settings: { n_ctx: 8192 } });
    assert.equal(target.pathname, '/v1/chat/completions'); assert.equal(request.method, 'POST');
    const body = JSON.parse(request.body), image = body.messages.findLast(message => message.role === 'user').content.includes('IMAGE_TOOL');
    if (state.hold) await new Promise(resolve => { state.release = resolve; });
    const event = image ? { choices: [{ delta: { tool_calls: [{ index: 0, id: randomUUID(), type: 'function', function: { name: 'generate_comfy_image', arguments: '{"prompt":"A synthetic blue teapot","seed":42}' } }] }, finish_reason: 'tool_calls' }] } : { choices: [{ delta: { content: 'Réponse synthétique finale.' }, finish_reason: 'stop' }] };
    return new Response('data: ' + JSON.stringify(event) + '\n\ndata: [DONE]\n\n');
  };
  const injectedFS = new Proxy(fs, { get(target, key) { if (key === 'rename') return async (from, to) => { if (to === path.join(root, 'data', 'inference-settings.json')) { if (state.failRename) throw Object.assign(new Error('fixture denied rename'), { code: 'EACCES' }); if (state.renameGate) await state.renameGate; } return fs.rename(from, to); }; return target[key]; } });
  let app, cookie;
  const start = async () => { app = await createCompanion({ root, fs: injectedFS, settings, nativeStore: { listProjects: async () => [{ id: 'p1', name: 'Synthetic' }], listSessions: async () => [] }, comfyService: comfy, ...(testImageProviderIdentity ? { imageProvider: { identity: testImageProviderIdentity, service: comfy } } : {}), fetchImpl, inferenceEnvironment: { BIONIC_API_TOKEN: 'BIONIC_FIXTURE', BIONIC_LLAMA_API_TOKEN: 'LLAMA_FIXTURE' }, localServiceSetup: { async snapshot() { return { canConfigure: false, services: [] }; } }, localServiceSupervisorFactory: async opts => { state.connections = opts.connections; return { activeCount: () => 0, assertAdmission() {}, protectedPaths: () => [], async close() {} }; }, ...applicationOptions }); };
  await start();
  const raw = (route, body, extra = {}) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method: body === undefined ? 'GET' : 'POST', url: route, headers: { host: '127.0.0.1:8769', ...(cookie ? { cookie } : {}), ...extra.headers }, socket: { remoteAddress: '127.0.0.1' } });
    const res = new Reply(); return { req, res, work: app.handle(req, res) };
  };
  const request = async (route, body, extra) => { const pending = raw(route, body, extra); await pending.work; return pending.res; };
  const login = async () => { cookie = (await request('/api/login', { code: 'synthetic-code' })).headers['set-cookie'].split(';')[0]; };
  t.after(async () => { state.release?.(); await app.close(); assert(path.basename(root).startsWith('inference-http-test-')); await fs.rm(root, { recursive: true, force: true }); });
  await login();
  return { state, root, raw, request, get app() { return app; }, async restart() { await app.close(); await start(); await login(); } };
}
const snapshot = async f => (await f.request('/api/inference/settings')).json();
const input = provider => ({ provider, apiUrl: 'http://127.0.0.1:1235', llamaUrl: 'http://127.0.0.1:1236' });
async function save(f, provider, extra = {}) { return f.request('/api/inference/settings', { ...input(provider), expectedRevision: (await snapshot(f)).revision, ...extra }); }
async function model(f) { return (await f.request('/api/models')).json().models[0]; }
async function until(predicate) { for (let n = 0; n < 150; n++) { if (await predicate()) return; await wait(5); } assert.fail('fixture condition timed out'); }

test('loaded-model unload binds the menu revision to its connection and keeps legacy callers compatible', async t => {
  const f = await fixture(t), first = await snapshot(f), catalogue = (await f.request('/api/models')).json();
  assert.equal(catalogue.provider, first.provider); assert.equal(catalogue.inferenceRevision, first.revision);
  assert.equal((await save(f, 'bionic')).statusCode, 200);
  const before = f.state.calls.length;
  const stale = await f.request('/api/models/unload', { instanceId: 'bionic-loaded', expectedInferenceRevision: first.revision });
  assert.equal(stale.statusCode, 409); assert.equal(stale.json().code, 'inference-stale-revision'); assert.equal(f.state.calls.length, before); assert.equal(f.state.loaded, true);
  const malformed = await f.request('/api/models/unload', { instanceId: 'bionic-loaded', expectedInferenceRevision: { unexpected: true } }); assert.equal(malformed.statusCode, 400); assert.equal(f.state.calls.length, before);
  const current = await snapshot(f), unloaded = await f.request('/api/models/unload', { instanceId: 'bionic-loaded', expectedInferenceRevision: current.revision });
  assert.equal(unloaded.statusCode, 200, unloaded.text()); assert.equal(unloaded.json().unloaded, true);
  f.state.loaded = true;
  const legacy = await f.request('/api/models/unload', { instanceId: 'bionic-loaded' }); assert.equal(legacy.statusCode, 200, legacy.text()); assert.equal(legacy.json().unloaded, true);
});

test('a catalogue read that overlaps a connection change retains the original identity', async t => {
  const f = await fixture(t), first = await snapshot(f); let release;
  f.state.catalogueGate = new Promise(resolve => { release = resolve; });
  const pending = f.raw('/api/models'); await until(() => f.state.catalogueReadReached);
  try {
    assert.equal((await save(f, 'llamacpp')).statusCode, 200);
  } finally { release(); }
  await pending.work; f.state.catalogueGate = null;
  const old = pending.res.json(); assert.equal(old.provider, 'bionic'); assert.equal(old.inferenceRevision, first.revision); assert.equal(old.models[0].id, 'shared-alias');
  const current = (await f.request('/api/models')).json(); assert.equal(current.provider, 'llamacpp'); assert.equal(current.inferenceRevision, (await snapshot(f)).revision); assert.notEqual(current.inferenceRevision, old.inferenceRevision);
  assert.equal(f.state.calls.filter(call => call.request.method === 'POST').length, 0);
});

test('waiting for the model reservation prevents another tab from changing the unload connection', async t => {
  const f = await fixture(t), first = await snapshot(f); let release, reached = false;
  const gate = new Promise(resolve => { release = resolve; }), acquire = f.app.gpuScheduler.acquireModel;
  f.app.gpuScheduler.acquireModel = async (...args) => { reached = true; await gate; return acquire(...args); };
  const pending = f.raw('/api/models/unload', { instanceId: 'bionic-loaded', expectedInferenceRevision: first.revision });
  await until(() => reached);
  try {
    assert.equal((await save(f, 'llamacpp')).statusCode, 409); assert.equal((await snapshot(f)).revision, first.revision); assert.equal(f.state.loaded, true);
  } finally { release(); }
  await pending.work; assert.equal(pending.res.statusCode, 200, pending.res.text()); assert.equal(pending.res.json().unloaded, true);
  assert.equal(f.state.calls.filter(call => new URL(call.url).pathname === '/api/v1/models/unload').length, 1);
});

test('web inference selection persists and applies one provider; tokens and model identities never cross engines', async t => {
  const f = await fixture(t), first = await snapshot(f);
  assert.equal(first.editable, true); assert.equal(first.busy, false); assert(!JSON.stringify(first).includes('BIONIC_FIXTURE'));
  const checked = (await f.request('/api/inference/check', input('llamacpp'))).json(); assert.equal(checked.ok, true); assert.equal(checked.capabilities.tools, 'unknown'); assert.equal((await snapshot(f)).revision, first.revision);
  assert.equal(f.state.calls.length, 2); assert(f.state.calls.every(call => call.request.headers.Authorization === 'Bearer LLAMA_FIXTURE'));
  const before = await model(f); assert.equal(before.id, 'shared-alias');
  const switched = await save(f, 'llamacpp'); assert.equal(switched.statusCode, 200, switched.text()); assert.equal(switched.json().applied, true);
  const after = await model(f); assert(after.id.startsWith('llamacpp:')); assert.notEqual(after.id, before.id); assert.equal(f.state.connections().bionicUrl, 'http://127.0.0.1:1235');
  const sent = await f.request('/api/chat', { projectId: 'p1', model: after.id, requestId: randomUUID(), text: 'Question synthétique', fileProfile: 'none' });
  assert.equal(sent.statusCode, 200, sent.text()); const started = sent.text().trim().split('\n').map(JSON.parse).find(event => event.type === 'start');
  assert.equal((await f.app.readWeb(started.id)).messages.at(-1).provider.provider, 'llamacpp');
  await f.restart(); assert.equal((await snapshot(f)).provider, 'llamacpp'); assert.equal((await snapshot(f)).source, 'web');
  const restored = await model(f); assert.equal(restored.id, after.id);
  assert.equal((await f.request('/api/inference/settings', { ...input('bionic'), expectedRevision: first.revision })).statusCode, 409);
  assert.equal((await save(f, 'bionic')).statusCode, 200); assert.equal((await model(f)).id, before.id);
  for (const call of f.state.calls) assert.equal(call.request.headers.Authorization, new URL(call.url).port === '1235' ? 'Bearer BIONIC_FIXTURE' : 'Bearer LLAMA_FIXTURE');
});

test('running and queued requests block switching until completion; unknown images refuse application before persistence', async t => {
  const f = await fixture(t), selected = await model(f); f.state.hold = true;
  const active = f.raw('/api/chat', { projectId: 'p1', model: selected.id, requestId: randomUUID(), text: 'Question lente', fileProfile: 'none' });
  await until(() => !!f.state.release);
  const accepted = [...f.app.chatStates.values()][0].chat, revision = (await snapshot(f)).revision;
  const queued = await f.request('/api/chat', { projectId: 'p1', sessionId: accepted.id, model: selected.id, requestId: randomUUID(), text: 'Question suivante', fileProfile: 'none' }); assert.equal(queued.statusCode, 200);
  assert.equal((await save(f, 'llamacpp')).statusCode, 409); assert.equal((await snapshot(f)).revision, revision);
  f.state.hold = false; f.state.release(); await active.work;
  await until(() => f.app.activeWork().requests === 0);
  f.state.imageStatus = 'unknown'; assert.equal((await save(f, 'llamacpp')).statusCode, 409); assert.equal((await snapshot(f)).provider, 'bionic');
  f.state.imageStatus = null; assert.equal((await save(f, 'llamacpp')).statusCode, 200);
});

test('failed persistence rolls back runtime and client disconnect during save recovers by GET without reapplying', async t => {
  const f = await fixture(t), before = await snapshot(f); f.state.failRename = true;
  assert.equal((await save(f, 'llamacpp')).statusCode, 500); assert.equal((await snapshot(f)).revision, before.revision); assert.equal((await model(f)).id, 'shared-alias');
  f.state.failRename = false; let release; f.state.renameGate = new Promise(resolve => { release = resolve; });
  const pending = f.raw('/api/inference/settings', { ...input('llamacpp'), expectedRevision: before.revision });
  await until(() => f.app.activeWork().requests === 0 && f.app.lifecycle.status().tasks > 0);
  pending.res.destroyed = true; pending.res.emit('close'); release(); await pending.work; f.state.renameGate = null;
  const recovered = await snapshot(f); assert.equal(recovered.provider, 'llamacpp'); assert.notEqual(recovered.revision, before.revision);
  assert.equal((await f.request('/api/inference/settings', { ...input('llamacpp'), expectedRevision: before.revision })).statusCode, 409);
  await f.restart(); assert.equal((await snapshot(f)).revision, recovered.revision);
});

test('the same image tool is exposed and executed once through each inference provider', async t => {
  const f = await fixture(t, { testImageProviderIdentity: { id: 'synthetic-image-adapter', label: 'Contrat image synthétique' } });
  for (const provider of ['bionic', 'llamacpp']) {
    if (provider === 'llamacpp') assert.equal((await save(f, provider)).statusCode, 200);
    const selected = await model(f), requestId = randomUUID(), startIndex = f.state.calls.length;
    const response = await f.request('/api/chat', { projectId: 'p1', model: selected.id, requestId, text: 'IMAGE_TOOL', imageAccess: true, fileProfile: 'none' }); assert.equal(response.statusCode, 200, response.text());
    const calls = f.state.calls.slice(startIndex).filter(call => new URL(call.url).pathname === '/v1/chat/completions'); assert.equal(calls.length, 1);
    const payload = JSON.parse(calls[0].request.body); assert(payload.tools.some(tool => tool.function.name === 'generate_comfy_image'));
    const job = f.state.submissions.at(-1); assert.equal(job.owner.requestId, requestId);
    const chat = await f.app.readWeb(job.owner.chatId); assert.equal(chat.messages.at(-1).provider.provider, provider); assert.equal(chat.messages.at(-1).imageGenerations.length, 1);
    const descriptor = (await f.request('/api/image-provider')).json(); assert.equal(descriptor.identity.id, 'synthetic-image-adapter'); assert.equal(descriptor.capabilities.singleImage, true); assert.equal(descriptor.capabilities.series, false); assert.equal(descriptor.legacyApiNamespace, '/api/comfy');
    const params = new URLSearchParams({ projectId: 'p1', chatId: chat.id, messageId: job.owner.messageId, jobId: job.id });
    assert.equal((await f.request('/api/comfy/image?' + params)).text(), 'synthetic-image-data');
    params.set('messageId', 'wrong-message'); assert.equal((await f.request('/api/comfy/image?' + params)).statusCode, 404);
  }
  assert.equal(f.state.submissions.length, 2);
});

test('authentication, origin, whitelist and injected fixture gates prevent side effects', async t => {
  const f = await fixture(t), initial = await snapshot(f);
  assert.equal((await f.request('/api/inference/settings', { ...input('llamacpp'), expectedRevision: initial.revision }, { headers: { origin: 'http://foreign.invalid' } })).statusCode, 403);
  assert.equal((await f.request('/api/inference/settings', { ...input('llamacpp'), expectedRevision: initial.revision, command: 'unsafe' })).statusCode, 400);
  assert.equal((await f.request('/api/inference/check', { ...input('llamacpp'), llamaUrl: 'http://remote.invalid:1236' })).statusCode, 400);
  assert.equal((await snapshot(f)).revision, initial.revision);
  await f.request('/api/logout', {}); assert.equal((await f.request('/api/inference/settings')).statusCode, 401);
  const fixed = await fixture(t, { modelService: { list: async () => [] } });
  assert.equal((await snapshot(fixed)).editable, false); assert.equal((await fixed.request('/api/inference/check', input('llamacpp'))).statusCode, 403); assert.equal((await save(fixed, 'llamacpp')).statusCode, 403); assert.equal(fixed.state.calls.length, 0);
});

test('an explicit synthetic runtime factory supports switching while fixed injected services stay isolated', async t => {
  const built = [];
  const f = await fixture(t, { modelService: { list: async () => { throw new Error('Fixed service must not override an explicit runtime factory'); } }, inferenceFactory: config => {
    built.push(config.provider);
    return { modelService: { list: async () => [{ id: config.provider + ':factory', name: config.provider, type: 'llm', loaded: true, contextLength: 8192 }], pendingCount: () => 0 }, modelTransport: { identity: { provider: config.provider, endpoint: config.provider === 'llamacpp' ? config.llamaUrl : config.apiUrl }, async request() { throw new Error('No generation expected in factory settings test'); } } };
  } });
  assert.equal((await snapshot(f)).editable, true); assert.equal((await model(f)).id, 'bionic:factory');
  assert.equal((await save(f, 'llamacpp')).statusCode, 200); assert.equal((await model(f)).id, 'llamacpp:factory');
  assert.deepEqual(built, ['bionic', 'llamacpp']); assert.equal(f.state.calls.length, 0);
});

test('private inference settings and temporary credential files cannot be read through project file APIs', async t => {
  const f = await fixture(t); assert.equal((await save(f, 'bionic')).statusCode, 200);
  await fs.writeFile(path.join(f.root, 'data', 'inference-settings.json.synthetic.tmp'), 'PRIVATE_SYNTHETIC_TOKEN');
  for (const file of ['data/inference-settings.json', 'data/inference-settings.json.synthetic.tmp']) {
    const parameters = new URLSearchParams({ projectId: 'p1', rootId: 'project', path: file });
    assert.equal((await f.request('/api/file?' + parameters)).statusCode, 403); assert.equal((await f.request('/api/file/download?' + parameters)).statusCode, 403);
  }
});

for (const operation of ['load', 'unload']) test(`ambiguous ${operation} survives restart and requires catalogue reconciliation without repeating the mutation`, async t => {
  const f = await fixture(t); f.state.failModelMutation = operation;
  if (operation === 'unload') {
    assert.equal((await f.request('/api/models/unload', { instanceId: 'bionic-loaded' })).statusCode, 502);
  } else {
    f.state.loaded = false;
    const response = await f.request('/api/chat', { projectId: 'p1', model: 'shared-alias', text: 'Cold model with a lost load response', fileProfile: 'none', requestId: randomUUID() });
    assert.match(response.text(), /chargement.*confirm/);
  }
  const before = await snapshot(f); assert.equal(before.reconciliationRequired, true); assert.equal(before.busy, true);
  assert.equal((await save(f, 'llamacpp')).statusCode, 409);
  const mutations = () => f.state.calls.filter(call => new URL(call.url).pathname === '/api/v1/models/' + operation).length;
  assert.equal(mutations(), 1);
  await f.restart(); assert.equal((await snapshot(f)).reconciliationRequired, true); assert.equal((await save(f, 'llamacpp')).statusCode, 409);
  const catalogue = await f.request('/api/models'); assert.equal(catalogue.statusCode, 200); assert.equal(catalogue.json().reconciliationRequired, false);
  assert.equal((await snapshot(f)).reconciliationRequired, false); assert.equal(mutations(), 1);
  assert.equal((await save(f, 'llamacpp')).statusCode, 200); assert.equal(mutations(), 1);
});

const manualLoad = async (f, input = {}, extra = {}) => {
  const current = await snapshot(f);
  return f.request('/api/models/load', {modelId:'shared-alias',expectedInferenceRevision:current.revision,consent:true,...input}, {headers:{origin:'http://127.0.0.1:8769','x-local-service-csrf':current.csrfNonce,...extra}});
};
const loadCalls = f => f.state.calls.filter(call=>new URL(call.url).pathname==='/api/v1/models/load');

test('manual Bionic load refuses missing consent, forged session scope and stale connection before any load', async t=>{
  const f=await fixture(t);f.state.loaded=false;
  assert.equal((await manualLoad(f,{consent:false})).statusCode,400);
  assert.equal((await manualLoad(f,{}, {'x-local-service-csrf':'wrong'})).statusCode,403);
  assert.equal((await manualLoad(f,{}, {origin:'http://foreign.invalid'})).statusCode,403);
  assert.equal((await manualLoad(f,{}, {cookie:''})).statusCode,401);
  assert.equal((await manualLoad(f,{expectedInferenceRevision:'stale-revision'})).statusCode,409);
  assert.equal((await manualLoad(f,{modelId:''})).statusCode,400);
  assert.equal(loadCalls(f).length,0);
});

test('manual Bionic load confirms the stored context and duplicate explicit requests do not load twice',async t=>{
  const f=await fixture(t);f.state.loaded=false;const response=await manualLoad(f);assert.equal(response.statusCode,200,response.text());
  const result=response.json();assert.equal(result.loaded,true);assert.equal(result.provider,'bionic');assert.equal(result.model.id,'shared-alias');assert.equal(result.model.contextLength,8192);assert(result.models[0].loaded);assert.equal(result.inferenceRevision,(await snapshot(f)).revision);
  assert.equal((await manualLoad(f)).statusCode,200);assert.equal(loadCalls(f).length,1);assert.deepEqual(JSON.parse(loadCalls(f)[0].request.body),{model:'shared-alias',echo_load_config:true});
});

test('manual Bionic load preserves a lost result through restart and reconciles by catalogue without replay',async t=>{
  const f=await fixture(t);f.state.loaded=false;f.state.failModelMutation='load';assert.equal((await manualLoad(f)).statusCode,502);assert.equal(loadCalls(f).length,1);
  assert.equal((await manualLoad(f)).statusCode,409);assert.equal(loadCalls(f).length,1);await f.restart();assert.equal((await manualLoad(f)).statusCode,409);
  const catalogue=(await f.request('/api/models')).json();assert.equal(catalogue.models[0].loaded,true);assert.equal((await manualLoad(f)).statusCode,200);assert.equal(loadCalls(f).length,1);
});

test('manual Bionic load holds the model barrier while waiting and releases it after confirmation',async t=>{
  const f=await fixture(t);f.state.loaded=false;let release;f.state.modelLoadGate=new Promise(resolve=>release=resolve);
  const current=await snapshot(f),pending=f.raw('/api/models/load',{modelId:'shared-alias',expectedInferenceRevision:current.revision,consent:true},{headers:{origin:'http://127.0.0.1:8769','x-local-service-csrf':current.csrfNonce}});
  await until(()=>f.state.modelLoadReached);
  try{assert.equal((await save(f,'llamacpp')).statusCode,409);assert.equal((await manualLoad(f)).statusCode,409);assert.equal((await f.request('/api/chat',{projectId:'p1',model:'shared-alias',requestId:randomUUID(),text:'Must wait',fileProfile:'none'})).statusCode,409);assert.equal((await f.request('/api/comfy/generate',{projectId:'p1',prompt:'Must wait'})).statusCode,409);assert.equal(f.state.submissions.length,0);}finally{release();}
  await pending.work;assert.equal(pending.res.statusCode,200,pending.res.text());assert.equal((await f.request('/api/models')).json().unloading,false);assert.equal((await save(f,'llamacpp')).statusCode,200);
  const refused=await manualLoad(f);assert.equal(refused.statusCode,409);assert.equal(loadCalls(f).length,1);
});

test('llama explicit image unload is refused before catalogue inference request registration or image effects',async t=>{
  const f=await fixture(t);await save(f,'llamacpp');const selected=await model(f),before=f.state.calls.length,requestId=randomUUID();
  const refused=await f.request('/api/chat',{projectId:'p1',model:selected.id,requestId,text:'IMAGE_TOOL',imageAccess:true,imageModelPolicy:'unload',fileProfile:'none'});
  assert.equal(refused.statusCode,409,refused.text());assert.equal(refused.json().code,'image-memory-policy-unsupported');assert.equal(f.state.calls.length,before);assert.equal(f.state.submissions.length,0);assert.equal((await f.request('/api/sessions?projectId=p1')).json().sessions.length,0);
  const accepted=await f.request('/api/chat',{projectId:'p1',model:selected.id,requestId,text:'IMAGE_TOOL',imageAccess:true,imageModelPolicy:'alternate',fileProfile:'none'});assert.equal(accepted.statusCode,200,accepted.text());assert.equal(f.state.submissions.length,1);assert.equal(f.state.submissions[0].modelPolicy,'alternate');
});

test('llama global unload default becomes visible alternate for chat and direct images without changing settings',async t=>{
  const f=await fixture(t);await save(f,'llamacpp');f.state.modelPolicy='unload';const selected=await model(f),capabilities=(await snapshot(f)).imageMemoryPolicy;
  assert.equal(capabilities.defaultPolicy,'unload');assert.equal(capabilities.effectiveDefaultPolicy,'alternate');assert.equal(capabilities.unloadSupported,false);assert.equal(capabilities.defaultAdjusted,true);assert.deepEqual(capabilities.supportedPolicies,['keep','alternate']);
  const chat=await f.request('/api/chat',{projectId:'p1',model:selected.id,requestId:randomUUID(),text:'IMAGE_TOOL',imageAccess:true,fileProfile:'none'});assert.equal(chat.statusCode,200,chat.text());assert.equal(f.state.submissions[0].modelPolicy,'alternate');
  const direct=await f.request('/api/comfy/generate',{projectId:'p1',requestId:randomUUID(),prompt:'Synthetic direct image',workflowId:'krea2_turbo'});assert.equal(direct.statusCode,200,direct.text());assert.equal(f.state.submissions.at(-1).modelPolicy,'alternate');assert.equal(f.state.modelPolicy,'unload');assert(!f.state.calls.some(call=>new URL(call.url).pathname==='/api/v1/models/unload'));
  const imageSettings=(await f.request('/api/comfy/settings')).json();assert.equal(imageSettings.modelPolicy,'unload');assert.equal(imageSettings.imageMemoryPolicy.effectiveDefaultPolicy,'alternate');
});
