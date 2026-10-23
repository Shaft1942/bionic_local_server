import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createCompanion } from '../server.mjs';
import { createComfyImages } from '../lib/comfy-images.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'comfy-actions-http-'));
  const posts = [], completed = new Set();
  const comfyFetch = async (url, options = {}) => {
    if (url.endsWith('/prompt')) { const id = 'fixture-' + posts.length; posts.push({ id, body: JSON.parse(options.body) }); return Response.json({ prompt_id: id }); }
    if (url.endsWith('/queue')) return Response.json({ queue_running: posts.filter(p => !completed.has(p.id)).map(p => [0, p.id]), queue_pending: [] });
    if (url.includes('/history/')) { const id = url.split('/').at(-1); return Response.json(completed.has(id) ? { [id]: { status: { status_str: 'success', completed: true }, outputs: { '9': { images: [{ filename: id + '.png', subfolder: '', type: 'output' }] } } } } : {}); }
    if (url.includes('/view?')) { const png = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.write('IHDR',12); png.writeUInt32BE(1024,16); png.writeUInt32BE(1024,20); return new Response(png); }
    throw Error('Unexpected fixture route ' + url);
  };
  const service = await createComfyImages({ directory: path.join(root, 'data', 'comfy-generations'), enabled: true, fetchImpl: comfyFetch, pollMs: 10 });
  const app = await createCompanion({ root, comfyService: service, nativeStore: { listProjects: async () => [{ id: 'p1', name: 'Fixture' }, { id: 'p2', name: 'Other fixture' }], listSessions: async () => [] }, modelService: { list: async () => [], forInference: async () => { throw Error('No model inference in HTTP fixture'); } }, settings: { port: 0, apiUrl: 'http://127.0.0.1:1235', bionicRoot: root, registryPath: path.join(root, 'registry.json'), extraRoots: [], python: 'python', comfyEnabled: true } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert(path.basename(root).startsWith('comfy-actions-http-')); await fs.rm(root, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const code = /Code d.acc.s : (.+)/.exec(await fs.readFile(path.join(root, 'ACCES-PRIVE.txt'), 'utf8'))[1].trim();
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const request = (route, body, headers = { cookie }) => fetch(base + route, { headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  const chat = { id: 'web-' + randomUUID(), projectId: 'p1', name: 'Image fixture', messages: [{ id: randomUUID(), role: 'assistant', text: 'Fixture images', imageGenerations: [] }] };
  await app.persistChat(chat);
  const owner = { projectId: 'p1', chatId: chat.id, messageId: chat.messages[0].id, requestId: randomUUID() };
  const jobs = await service.submitSeries({ images: [{ prompt: 'A red bicycle', seed: 111 }, { prompt: 'A blue sailboat', seed: 112 }] }, owner);
  chat.messages[0].imageGenerations = jobs; await app.persistChat(chat);
  const input = job => ({ ...owner, jobId: job.id });
  const finish = async job => { completed.add(service.get(job.id).promptId); await service.refresh(job.id); assert.equal(service.get(job.id).status, 'succeeded'); };
  return { app, service, request, jobs, owner, input, posts, finish, chat };
}

test('image actions authenticate, validate owners and cancel only the selected local image', async t => {
  const f = await fixture(t), pending = f.input(f.jobs[1]);
  assert.equal((await f.request('/api/comfy/generation/cancel', pending, {})).status, 401);
  assert.equal((await f.request('/api/comfy/generation/cancel', pending, { cookie: '', origin: 'https://attacker.example' })).status, 403);
  for (const change of [{ projectId: 'p2' }, { messageId: randomUUID() }, { jobId: randomUUID() }]) assert.equal((await f.request('/api/comfy/generation/cancel', { ...pending, ...change })).status, 404);
  assert.equal((await f.request('/api/comfy/generation/cancel', null)).status, 400);
  assert.equal((await f.request('/api/comfy/generation/cancel', f.input(f.jobs[0]))).status, 409);
  for (let index = 0; index < 2; index++) { const res = await f.request('/api/comfy/generation/cancel', pending); assert.equal(res.status, 200); assert.equal((await res.json()).status, 'cancelled'); }
  await f.finish(f.jobs[0]); assert.equal(f.posts.length, 1);
  const chat = await (await f.request('/api/conversation?' + new URLSearchParams({ projectId: 'p1', id: f.chat.id }))).json();
  assert.equal(chat.messages[0].imageGenerations[1].status, 'cancelled');
});

test('retry has a durable separate message, one submission on duplicate request, and unchanged source', async t => {
  const f = await fixture(t); await f.service.cancel(f.jobs[1].id); await f.finish(f.jobs[0]);
  const input = { ...f.input(f.jobs[0]), seedMode: 'new', requestId: randomUUID() };
  const first = await f.request('/api/comfy/generation/retry', input); assert.equal(first.status, 200); const result = await first.json();
  assert.notEqual(result.job.id, f.jobs[0].id); assert.notEqual(result.messageId, f.owner.messageId); assert.equal(result.job.retryOf, f.jobs[0].id); assert.notEqual(result.job.seed, f.jobs[0].seed);
  assert.equal(result.job.prompt, f.jobs[0].prompt); assert.equal(result.job.memoryCleanup, f.jobs[0].memoryCleanup);
  const repeated = await f.request('/api/comfy/generation/retry', input); assert.equal(repeated.status, 200); assert.equal((await repeated.json()).job.id, result.job.id); assert.equal(f.posts.length, 2);
  assert.equal(f.service.get(f.jobs[0].id).status, 'succeeded');
  assert.equal((await f.request('/api/comfy/generation/retry', { ...input, seedMode: 'same' })).status, 409);
  assert.equal((await f.request('/api/comfy/generation/retry', { ...input, jobId: f.jobs[1].id })).status, 409);
  assert.equal((await f.request('/api/comfy/generation/retry', { ...f.input(result.job), messageId: result.messageId, requestId: randomUUID(), seedMode: 'same' })).status, 409);
});

test('project gallery and ZIP authorize every image and preserve copied PNG bytes', async t => {
  const f = await fixture(t); await f.service.cancel(f.jobs[1].id); await f.finish(f.jobs[0]);
  assert.equal((await f.request('/api/comfy/generations?projectId=p1', undefined, {})).status, 401);
  const gallery = await (await f.request('/api/comfy/generations?projectId=p1')).json();
  assert.equal(gallery.total, 1); assert.equal(gallery.images[0].id, f.jobs[0].id); assert.equal(gallery.images[0].owner.messageId, f.owner.messageId); assert.equal(gallery.nextCursor, null);
  assert.equal((await f.request('/api/comfy/generations?projectId=missing')).status, 404);
  assert.equal((await f.request('/api/comfy/generations?projectId=p1&cursor=bad')).status, 400);
  const params = new URLSearchParams({ projectId: 'p1', jobId: f.jobs[0].id });
  const image = await f.request('/api/comfy/generation-image?' + params); assert.equal(image.status, 200);
  const bytes = Buffer.from(await image.arrayBuffer()); assert.deepEqual(bytes, (await f.service.image(f.jobs[0].id)).bytes);
  const zip = await f.request('/api/comfy/images.zip?' + params); assert.equal(zip.status, 200); assert.equal(zip.headers.get('content-type'), 'application/zip'); assert.equal(zip.headers.get('cache-control'), 'no-store');
  const archive = Buffer.from(await zip.arrayBuffer()); assert.equal(archive.readUInt32LE(0), 0x04034b50); assert(archive.includes(bytes)); assert(archive.includes(Buffer.from('manifest.json')));
  for (const route of ['/api/comfy/generation-image?', '/api/comfy/images.zip?']) {
    assert.equal((await f.request(route + new URLSearchParams({ projectId: 'p2', jobId: f.jobs[0].id }))).status, 404);
    assert.equal((await f.request(route + new URLSearchParams({ projectId: 'p1', jobId: f.jobs[1].id }))).status, 404);
  }
  params.append('jobId', f.jobs[1].id); assert.equal((await f.request('/api/comfy/images.zip?' + params)).status, 404);
  params.set('jobId', f.jobs[0].id); params.append('jobId', f.jobs[0].id); assert.equal((await f.request('/api/comfy/images.zip?' + params)).status, 400);
  // A retained generated asset is still available when its source conversation was deleted.
  const deleted = await f.request('/api/conversation/delete', { projectId: 'p1', id: f.chat.id }); assert.equal(deleted.status, 200);
  assert.equal((await f.request('/api/comfy/generation-image?' + new URLSearchParams({ projectId: 'p1', jobId: f.jobs[0].id }))).status, 200);
});
