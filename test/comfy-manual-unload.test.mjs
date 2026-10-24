import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createComfyImages } from '../lib/comfy-images.mjs';
import { createCompanion } from '../server.mjs';

class HttpResponse extends EventEmitter {
  constructor() { super(); this.headers = {}; this.parts = []; this.statusCode = 200; }
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; Object.entries(headers).forEach(([key, value]) => this.setHeader(key, value)); }
  write(value) { this.parts.push(String(value)); }
  end(value) { if (value) this.write(value); this.writableEnded = true; this.emit('finish'); }
  json() { return JSON.parse(this.parts.join('')); }
}

async function fixture(t, { http = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'comfy-manual-unload-'));
  const directory = path.join(root, 'data', 'comfy-generations');
  const calls = [], state = { queue: { queue_running: [], queue_pending: [] }, mode: 'accepted', supervisorBusy: false, imageJobs: 0, freeGate: null };
  const fetchImpl = async (target, options = {}) => {
    const url = new URL(target); assert.equal(url.origin, 'http://127.0.0.1:19991');
    calls.push({ route: url.pathname, method: options.method || 'GET', body: options.body && JSON.parse(options.body) });
    if (url.pathname === '/queue') {
      if (state.queueGate) { state.queueEntered(); await state.queueGate; }
      return Response.json(state.queue);
    }
    assert.equal(url.pathname, '/free', 'only fake queue and free transports are permitted');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { unload_models: true, free_memory: true });
    if (state.onFree) await state.onFree();
    if (state.freeGate) { state.freeEntered(); await state.freeGate; }
    if (state.mode === 'lost') throw new Error('Synthetic lost response after send');
    return new Response('', { status: state.mode === 'http-error' ? 503 : 200 });
  };
  let service, app, cookie = '', nonce = '';
  async function openService() {
    service = await createComfyImages({ directory, enabled: true, url: 'http://127.0.0.1:19991', fetchImpl });
    return service;
  }
  await openService();
  if (http) {
    const getSettings = service.getSettings;
    service.getSettings = () => ({ ...getSettings(), activeJobs: state.imageJobs || getSettings().activeJobs });
    app = await createCompanion({ root, comfyService: service, enableUpdateScheduling: false,
      localServiceSupervisor: { snapshot: async () => ({ services: [] }), activeCount: () => Number(state.supervisorBusy), assertAdmission() { if (state.supervisorBusy) throw Object.assign(new Error('Synthetic service busy'), { status: 409 }); }, close: async () => {} },
      modelService: { list: async () => [], pendingCount: () => 0 },
      nativeStore: { listProjects: async () => [], listSessions: async () => [] },
      fetchImpl: async () => { throw new Error('Unexpected model transport'); },
      settings: { port: 8769, apiUrl: 'http://127.0.0.1:1235', bionicRoot: root, registryPath: path.join(root, 'registry.json'), extraRoots: [], python: 'python' },
    });
  }
  t.after(async () => {
    if (app) await app.close(); else await service.close();
    assert.equal(path.dirname(await fs.realpath(root)), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('comfy-manual-unload-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  async function request(url, { body, headers = {}, stream, method = body === undefined && !stream ? 'GET' : 'POST', authenticated = true } = {}) {
    const req = stream || Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url, method, headers: { host: '127.0.0.1:8769', ...(authenticated && cookie ? { cookie } : {}), ...headers }, socket: { remoteAddress: '127.0.0.1' } });
    const res = new HttpResponse(); await app.handle(req, res); return res;
  }
  return { root, directory, calls, state, request, app, get service() { return service; }, openService,
    headers: () => ({ origin: 'http://127.0.0.1:8769', 'x-local-service-csrf': nonce }),
    input: () => ({ requestId: randomUUID(), expectedRevision: service.manualUnloadStatus().revision, consent: true }),
    async login() {
      const code = /Code d’accès : (.+)/.exec(await fs.readFile(path.join(root, 'ACCES-PRIVE.txt'), 'utf8'))[1].trim();
      cookie = (await request('/api/login', { body: { code } })).headers['set-cookie'].split(';')[0];
      nonce = (await request('/api/comfy/free')).json().csrfNonce;
    },
  };
}

test('manual Comfy unload is authenticated, exact-origin and nonce protected with no refused effects', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/comfy/free')).statusCode, 401);
  assert.equal((await f.request('/api/comfy/free', { body: f.input() })).statusCode, 401);
  await f.login();
  assert.deepEqual(f.calls, [], 'status is a local read, not a probe or a send');
  for (const headers of [{}, { origin: 'http://foreign.invalid', 'x-local-service-csrf': f.headers()['x-local-service-csrf'] }, { ...f.headers(), 'x-local-service-csrf': 'wrong' }, { ...f.headers(), 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await f.request('/api/comfy/free', { body: f.input(), headers })).statusCode, 403);
  }
  assert.deepEqual(f.calls, []);
});

test('accepted means acknowledged flags only; duplicate POST, GET and reopening never resend', async t => {
  const f = await fixture(t); await f.login();
  const input = f.input();
  const response = await f.request('/api/comfy/free', { body: input, headers: f.headers() });
  assert.equal(response.statusCode, 200);
  const result = response.json();
  assert.equal(result.operation.state, 'accepted'); assert.equal(result.operation.verified, false);
  assert.equal(result.operation.url, 'http://127.0.0.1:19991'); assert.equal(result.canUnload, true);
  assert.equal(response.headers['cache-control'], 'no-store');
  for (let index = 0; index < 2; index++) {
    assert.equal((await f.request('/api/comfy/free?requestId=' + input.requestId)).json().operation.state, 'accepted');
    assert.equal((await f.request('/api/comfy/free', { body: input, headers: f.headers() })).json().operation.state, 'accepted');
  }
  assert.deepEqual(f.calls.map(call => call.route), ['/queue', '/free']);
  assert.equal((await f.request('/api/comfy/free?requestId=' + randomUUID())).json().operation, null, 'a missing intention must not inherit the last accepted receipt');
});

test('refuses stale settings, URL injection, missing consent, busy or unreadable external queue before /free', async t => {
  const f = await fixture(t); await f.login();
  const stale = f.input(); await f.service.updateSettings({ memoryCleanup: true });
  assert.equal((await f.request('/api/comfy/free', { body: stale, headers: f.headers() })).statusCode, 409);
  for (const body of [{ ...f.input(), url: 'http://127.0.0.1:8188' }, { ...f.input(), consent: false }, { ...f.input(), requestId: '../escape' }]) {
    assert.equal((await f.request('/api/comfy/free', { body, headers: f.headers() })).statusCode, 400);
  }
  assert.deepEqual(f.calls, []);
  for (const queue of [{ queue_running: [[0, 'another-user']], queue_pending: [] }, { queue_running: [], queue_pending: [[0, 'another-user']] }, {}]) {
    f.state.queue = queue;
    const response = await f.request('/api/comfy/free', { body: f.input(), headers: f.headers() });
    assert.equal(response.statusCode, Object.keys(queue).length ? 409 : 502);
  }
  assert.equal(f.calls.filter(call => call.route === '/free').length, 0);
});

test('local image and supervisor work refuse before even probing ComfyUI', async t => {
  const f = await fixture(t); await f.login();
  for (const field of ['imageJobs', 'supervisorBusy']) {
    f.state[field] = 1;
    assert.equal((await f.request('/api/comfy/free')).json().canUnload, false);
    assert.equal((await f.request('/api/comfy/free', { body: f.input(), headers: f.headers() })).statusCode, 409);
    f.state[field] = 0;
  }
  assert.deepEqual(f.calls, []);
  const releaseModel = await f.app.gpuScheduler.acquireModel();
  try {
    assert.equal((await f.request('/api/comfy/free')).json().canUnload, false);
    assert.equal((await f.request('/api/comfy/free', { body: f.input(), headers: f.headers() })).statusCode, 409);
    assert.deepEqual(f.calls, [], 'a reserved inference phase blocks unload before transport');
  } finally { releaseModel(); }
});

test('shared admission barrier blocks chat, settings and model mutations throughout queue check and send', async t => {
  const f = await fixture(t); await f.login();
  let releaseQueue, queueEntered;
  f.state.queueGate = new Promise(resolve => { releaseQueue = resolve; });
  const entered = new Promise(resolve => { queueEntered = resolve; }); f.state.queueEntered = queueEntered;
  const input = f.input(), action = f.request('/api/comfy/free', { body: input, headers: f.headers() });
  await entered;
  for (const [route, body] of [['/api/chat', {}], ['/api/comfy/settings', { enabled: false }], ['/api/models/unload', { instanceId: 'synthetic' }]]) {
    assert.equal((await f.request(route, { body })).statusCode, 409);
  }
  assert.equal((await f.request('/api/comfy/free')).json().canUnload, false);
  releaseQueue(); assert.equal((await action).statusCode, 200);
  assert.equal((await f.request('/api/comfy/free')).json().canUnload, true, 'the barrier is released after completion');
  assert.deepEqual(f.calls.map(call => call.route), ['/queue', '/free']);
});

test('slow request body rechecks admission before reservation or transport', async t => {
  const f = await fixture(t); await f.login();
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
  const stream = Readable.from((async function* () { entered(); await gate; yield Buffer.from(JSON.stringify(f.input())); })());
  const action = f.request('/api/comfy/free', { stream, headers: f.headers() });
  await started; f.state.supervisorBusy = true; release();
  assert.equal((await action).statusCode, 409); assert.deepEqual(f.calls, []);
});

for (const mode of ['lost', 'http-error']) test(mode + ' after /free stays unknown across read/replay/restart without double send', async t => {
  const f = await fixture(t, { http: false }); f.state.mode = mode;
  const input = f.input(), first = await f.service.manualUnload(input);
  assert.equal(first.operation.state, 'unknown'); assert.equal(first.operation.verified, false);
  assert.equal((await f.service.manualUnload(input)).operation.state, 'unknown');
  assert.equal(f.service.manualUnloadStatus(input.requestId).operation.state, 'unknown');
  await f.service.close(); await f.openService();
  assert.equal(f.service.manualUnloadStatus(input.requestId).operation.state, 'unknown');
  assert.equal((await f.service.manualUnload(input)).operation.state, 'unknown');
  assert.deepEqual(f.calls.map(call => call.route), ['/queue', '/free']);
});

test('interrupted requesting receipt becomes unknown on restart; explicit fresh intention remains possible', async t => {
  const f = await fixture(t, { http: false });
  const input = f.input(), now = Date.now();
  await fs.writeFile(path.join(f.directory, 'manual-unloads', input.requestId + '.json'), JSON.stringify({ requestId: input.requestId, revision: input.expectedRevision, url: 'http://127.0.0.1:19991', state: 'requesting', requestedAt: now, updatedAt: now }));
  await f.service.close(); await f.openService();
  assert.equal(f.service.manualUnloadStatus(input.requestId).operation.state, 'unknown');
  assert.equal((await f.service.manualUnload(input)).operation.state, 'unknown');
  assert.deepEqual(f.calls, []);
  assert.equal((await f.service.manualUnload(f.input())).operation.state, 'accepted');
  assert.deepEqual(f.calls.map(call => call.route), ['/queue', '/free']);
});

test('linked journal directory and linked ancestor refuse before read, receipt creation or /free', async t => {
  const f = await fixture(t, { http: false });
  await f.service.close();
  const target = path.join(f.root, 'other-owned-directory'); await fs.mkdir(target);
  const journal = path.join(f.directory, 'manual-unloads');
  await fs.rmdir(journal); await fs.symlink(target, journal, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.openService(), error => error.status === 503);
  assert.deepEqual(await fs.readdir(target), []);
  const parentLink = path.join(f.root, 'linked-parent');
  await fs.symlink(target, parentLink, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(createComfyImages({ directory: path.join(parentLink, 'images'), enabled: true }), error => error.status === 503);
  assert.deepEqual(await fs.readdir(target), []); assert.deepEqual(f.calls, []);
});

test('journal directory replaced after startup refuses before queue or /free', async t => {
  const f = await fixture(t, { http: false });
  const target = path.join(f.root, 'other-owned-directory'); await fs.mkdir(target);
  const journal = path.join(f.directory, 'manual-unloads');
  await fs.rename(journal, journal + '-original');
  await fs.symlink(target, journal, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.service.manualUnload(f.input()), error => error.status === 503);
  assert.deepEqual(await fs.readdir(target), []); assert.deepEqual(f.calls, []);
});

test('hardlinked retained receipt is never accepted or replayed after restart', async t => {
  const f = await fixture(t, { http: false });
  const input = f.input(); await f.service.manualUnload(input); await f.service.close();
  const receipt = path.join(f.directory, 'manual-unloads', input.requestId + '.json');
  const linked = path.join(f.root, 'another-owned-receipt.json'); await fs.link(receipt, linked);
  const original = await fs.readFile(linked, 'utf8'); await f.openService();
  const status = f.service.manualUnloadStatus(input.requestId);
  assert.equal(status.operation, null); assert.equal(status.canUnload, false);
  await assert.rejects(f.service.manualUnload(input), error => error.status === 409);
  assert.equal(await fs.readFile(linked, 'utf8'), original);
  assert.equal(f.calls.filter(call => call.route === '/free').length, 1);
});

test('predictable old temporary hardlink remains untouched; completion uses an exclusive unique temporary file', async t => {
  const f = await fixture(t, { http: false });
  const input = f.input(), protectedFile = path.join(f.root, 'protected-owned-file.txt');
  await fs.writeFile(protectedFile, 'unchanged synthetic bytes');
  const oldTemporary = path.join(f.directory, 'manual-unloads', input.requestId + '.json.tmp');
  await fs.link(protectedFile, oldTemporary);
  assert.equal((await f.service.manualUnload(input)).operation.state, 'accepted');
  assert.equal(await fs.readFile(protectedFile, 'utf8'), 'unchanged synthetic bytes');
  assert.equal(await fs.readFile(oldTemporary, 'utf8'), 'unchanged synthetic bytes');
});

test('receipt destination replaced by hardlink during send stays unknown without modifying its target', async t => {
  const f = await fixture(t, { http: false });
  const input = f.input(), protectedFile = path.join(f.root, 'protected-owned-file.txt');
  await fs.writeFile(protectedFile, 'unchanged synthetic bytes');
  f.state.onFree = async () => {
    const filename = path.join(f.directory, 'manual-unloads', input.requestId + '.json');
    await fs.unlink(filename); await fs.link(protectedFile, filename);
  };
  assert.equal((await f.service.manualUnload(input)).operation.state, 'unknown');
  assert.equal(await fs.readFile(protectedFile, 'utf8'), 'unchanged synthetic bytes');
  assert.equal((await f.service.manualUnload(input)).operation.state, 'unknown');
  assert.equal(f.calls.filter(call => call.route === '/free').length, 1);
});
