import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createCompanion } from '../server.mjs';
import { createComfyImages } from '../lib/comfy-images.mjs';
import { createGpuScheduler } from '../lib/gpu-scheduler.mjs';

class HttpResponse extends EventEmitter {
  constructor() { super(); this.headers = {}; this.parts = []; this.statusCode = 200; }
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; Object.entries(headers).forEach(([key, value]) => this.setHeader(key, value)); }
  write(value) { this.parts.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value))); }
  end(value) { if (value) this.write(value); this.writableEnded = true; this.emit('finish'); }
  json() { return JSON.parse(Buffer.concat(this.parts).toString()); }
}

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-launcher-images-')));
  const posts = [], completed = new Set(), modelCalls = [];
  const fetchImages = async (url, options = {}) => {
    if (url.endsWith('/prompt')) {
      const id = 'synthetic-' + posts.length; posts.push({ id, body: JSON.parse(options.body) });
      return Response.json({ prompt_id: id });
    }
    if (url.endsWith('/queue')) return Response.json({ queue_running: posts.filter(p => !completed.has(p.id)).map(p => [0, p.id]), queue_pending: [] });
    if (url.includes('/history/')) {
      const id = url.split('/').at(-1);
      return Response.json(completed.has(id) ? { [id]: { status: { status_str: 'success', completed: true }, outputs: { '9': { images: [{ filename: id + '.png', subfolder: '', type: 'output' }] } } } } : {});
    }
    if (url.includes('/view?')) {
      const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
      png.write('IHDR', 12); png.writeUInt32BE(1024, 16); png.writeUInt32BE(1024, 20);
      return new Response(png);
    }
    throw Error('Unexpected synthetic image transport: ' + url);
  };
  const imageService = await createComfyImages({ directory: path.join(root, 'data', 'comfy-generations'), enabled: true, fetchImpl: fetchImages, pollMs: 10 });
  let forceUncertain = false, pending = false, effect = 0, reserve, release, cookie, nonce;
  const service = { ...imageService, lifecycleStatus: () => forceUncertain ? { active: 0, uncertain: 1 } : imageService.lifecycleStatus() };
  const supervisor = {
    snapshot: async () => ({ services: [{ id: 'comfyui', revision: 'synthetic-revision' }] }),
    activeCount: () => Number(pending),
    assertAdmission() { if (pending) throw Object.assign(Error('Synthetic server operation active'), { status: 409, code: 'operation-active' }); },
    async action(id, input) {
      release = reserve({ id, action: input.action }); pending = true; effect++;
      return { id: 'synthetic-operation', status: 'accepted' };
    },
    async operation() { return { id: 'synthetic-operation', status: pending ? 'running' : 'succeeded' }; },
    async close() { pending = false; release?.(); }
  };
  const gpu = createGpuScheduler();
  const app = await createCompanion({ root, comfyService: service, gpuScheduler: gpu,
    nativeStore: { listProjects: async () => [{ id: 'p1', name: 'Synthetic project' }], listSessions: async () => [] },
    modelService: { list: async () => [], forInference: async () => { throw Error('No model call allowed in fixture'); }, unload: async id => { modelCalls.push(id); return { unloaded: true }; } },
    fetchImpl: async () => { throw Error('No external transport allowed in fixture'); },
    settings: { port: 8769, apiUrl: 'http://127.0.0.1:1235', bionicRoot: root, registryPath: path.join(root, 'registry.json'), extraRoots: [], python: 'python', comfyEnabled: true },
    localServiceSupervisorFactory: options => { reserve = options.reserve; return supervisor; }
  });
  async function request(url, input, { source, headers = {} } = {}) {
    const req = source || Readable.from(input === undefined ? [] : [Buffer.from(JSON.stringify(input))]);
    Object.assign(req, { url, method: input === undefined && !source ? 'GET' : 'POST', headers: { host: '127.0.0.1:8769', ...(cookie ? { cookie } : {}), ...headers }, socket: { remoteAddress: '127.0.0.1' } });
    const res = new HttpResponse(); await app.handle(req, res); return res;
  }
  const code = /Code d.acc.s : (.+)/.exec(await fs.readFile(path.join(root, 'ACCES-PRIVE.txt'), 'utf8'))[1].trim();
  cookie = (await request('/api/login', { code })).headers['set-cookie'].split(';')[0];
  nonce = (await request('/api/local-services')).json().csrfNonce;
  t.after(async () => {
    await app.close(); assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
    assert(path.basename(root).startsWith('bionic-launcher-images-')); await fs.rm(root, { recursive: true, force: true });
  });
  const headers = { origin: 'http://127.0.0.1:8769', 'x-local-service-csrf': nonce };
  const action = () => request('/api/local-services/comfyui/actions', { action: 'restart', expectedRevision: 'synthetic-revision', idempotencyKey: randomUUID() }, { headers });
  const chat = { id: 'web-' + randomUUID(), projectId: 'p1', name: 'Synthetic images', messages: [{ id: randomUUID(), role: 'assistant', text: 'Synthetic images', imageGenerations: [] }] };
  const owner = { projectId: 'p1', chatId: chat.id, messageId: chat.messages[0].id, requestId: randomUUID() };
  await app.persistChat(chat);
  const images = async () => {
    const jobs = await imageService.submitSeries({ images: [{ prompt: 'Synthetic red bicycle', seed: 11 }, { prompt: 'Synthetic blue sailboat', seed: 12 }] }, owner);
    chat.messages[0].imageGenerations = jobs; await app.persistChat(chat); return jobs;
  };
  const input = job => ({ ...owner, jobId: job.id });
  const finish = async job => { completed.add(imageService.get(job.id).promptId); await imageService.refresh(job.id); assert.equal(imageService.get(job.id).status, 'succeeded'); };
  return { app, gpu, service: imageService, request, action, images, input, finish, owner, posts, modelCalls,
    get effects() { return effect; }, forcePending(value) { pending = value; }, forceUncertain(value) { forceUncertain = value; },
    endOperation() { pending = false; release?.(); release = undefined; }
  };
}

test('real local image queue and uncertain lifecycle each refuse a server operation without effects', async t => {
  const f = await fixture(t), jobs = await f.images();
  assert.equal(jobs[1].queuedLocally, true); assert.equal(f.posts.length, 1);
  assert.equal((await f.action()).statusCode, 409); assert.equal(f.effects, 0);
  await f.service.cancel(jobs[1].id); await f.finish(jobs[0]);
  assert.equal(f.service.getSettings().activeJobs, 0);
  f.forceUncertain(true);
  assert.equal((await f.action()).statusCode, 409); assert.equal(f.effects, 0);
  f.forceUncertain(false);
  assert.equal((await f.action()).statusCode, 202); assert.equal(f.effects, 1);
});

test('GPU active and waiting leases refuse maintenance independently of persisted image jobs', async t => {
  const f = await fixture(t);
  const releaseModel = await f.gpu.acquireModel();
  const imageLease = f.gpu.acquireImages({ policy: 'alternate' });
  assert.equal(f.gpu.snapshot().activeModels, 1); assert.equal(f.gpu.snapshot().queuedImages, 1);
  assert.equal((await f.action()).statusCode, 409); assert.equal(f.effects, 0);
  releaseModel(); const releaseImage = await imageLease;
  const modelLease = f.gpu.acquireModel();
  assert.equal(f.gpu.snapshot().activeImages, 1); assert.equal(f.gpu.snapshot().queuedModels, 1);
  assert.equal((await f.action()).statusCode, 409); assert.equal(f.effects, 0);
  releaseImage(); (await modelLease)();
  assert.equal((await f.action()).statusCode, 202); assert.equal(f.effects, 1);
});

test('server operation refuses fresh image entry points before reading request bodies', async t => {
  const f = await fixture(t); assert.equal((await f.action()).statusCode, 202);
  for (const route of ['/api/comfy/generation/retry', '/api/comfy/queue/resume', '/api/comfy/settings', '/api/comfy/generate', '/api/chat', '/api/models/unload']) {
    let read = false;
    const source = Readable.from((async function* () { read = true; yield Buffer.from('{}'); })());
    const response = await f.request(route, {}, { source });
    assert.equal(response.statusCode, 409, route); assert.equal(read, false, route + ' must reject before body read');
  }
  assert.equal(f.posts.length, 0); assert.equal(f.modelCalls.length, 0); assert.equal(f.effects, 1);
});

test('operation appearing while receiving image admission body is checked again before effect', async t => {
  const f = await fixture(t);
  for (const route of ['/api/comfy/generation/retry', '/api/comfy/queue/resume', '/api/comfy/settings', '/api/comfy/generate', '/api/chat', '/api/models/unload']) {
    const source = Readable.from((async function* () { f.forcePending(true); yield Buffer.from('{}'); })());
    const response = await f.request(route, {}, { source });
    assert.equal(response.statusCode, 409, route); f.forcePending(false);
  }
  assert.equal(f.posts.length, 0); assert.equal(f.modelCalls.length, 0); assert.equal(f.effects, 0);
  assert.equal((await f.action()).statusCode, 202);
});

test('model unloading rechecks maintenance after asynchronous GPU admission and releases its lease', async t => {
  const f = await fixture(t), acquire = f.gpu.acquireModel;
  f.gpu.acquireModel = async options => {
    const release = await acquire(options); f.forcePending(true); return release;
  };
  assert.equal((await f.request('/api/models/unload', { instanceId: 'synthetic-model' })).statusCode, 409);
  assert.equal(f.modelCalls.length, 0); assert.equal(f.gpu.snapshot().activeModels, 0);
  f.forcePending(false); assert.equal((await f.action()).statusCode, 202);
});

test('pending body prevents server reservation and finishes without leaving a maintenance barrier', async t => {
  const f = await fixture(t); let bodyStarted, finishBody;
  const started = new Promise(resolve => { bodyStarted = resolve; });
  const gate = new Promise(resolve => { finishBody = resolve; });
  const source = Readable.from((async function* () { bodyStarted(); await gate; yield Buffer.from('{}'); })());
  const pending = f.request('/api/comfy/queue/resume', {}, { source });
  await started;
  assert.equal((await f.action()).statusCode, 409); assert.equal(f.effects, 0);
  finishBody(); assert.equal((await pending).statusCode, 200);
  assert.equal((await f.action()).statusCode, 202); assert.equal(f.effects, 1);
});

test('local cancellation and passive image recovery remain available without duplicating a retry', async t => {
  const f = await fixture(t), jobs = await f.images();
  // A recovered operation can coexist with retained queued metadata. Cancelling
  // that local entry never interrupts or mutates the external image engine.
  f.forcePending(true);
  assert.equal((await f.request('/api/comfy/generation/cancel', f.input(jobs[1]))).statusCode, 200);
  assert.equal(f.posts.length, 1); f.forcePending(false); await f.finish(jobs[0]);
  const retry = { ...f.input(jobs[0]), seedMode: 'new', requestId: randomUUID() };
  const first = await f.request('/api/comfy/generation/retry', retry); assert.equal(first.statusCode, 200);
  const result = first.json(); assert.equal(f.posts.length, 2); await f.finish(result.job);
  assert.equal((await f.action()).statusCode, 202);
  assert.equal((await f.request('/api/comfy/generation/retry', retry)).statusCode, 409); assert.equal(f.posts.length, 2);
  const status = await f.request('/api/comfy/generation?' + new URLSearchParams({ ...f.owner, messageId: result.messageId, jobId: result.job.id }));
  assert.equal(status.statusCode, 200); assert.equal(status.json().id, result.job.id); assert.equal(f.posts.length, 2);
  f.endOperation();
  const repeated = await f.request('/api/comfy/generation/retry', retry); assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.json().job.id, result.job.id); assert.equal(f.posts.length, 2);
});
