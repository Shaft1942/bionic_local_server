import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { createPrototype, PROTOTYPE_CODE, PROTOTYPE_PROJECT, PROTOTYPE_MODEL } from '../lib/llama-ui-prototype.mjs';

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-prototype-test-'));
  const publicDirectory = path.join(root, 'assets');
  await fs.writeFile(path.join(root, '.llama-ui-prototype'), 'isolated-llama-ui-prototype-v1\n');
  await fs.mkdir(path.join(publicDirectory, 'llama-ui', 'assets'), { recursive: true });
  await fs.writeFile(path.join(publicDirectory, 'index.html'), 'legacy-interface');
  await fs.writeFile(path.join(publicDirectory, 'llama-ui', 'index.html'), '<script src="/llama-ui/assets/app.js"></script>');
  await fs.writeFile(path.join(publicDirectory, 'llama-ui', 'assets', 'app.js'), 'export const prototype = true;');
  await fs.writeFile(path.join(publicDirectory, 'llama-ui', 'assets', 'font.woff2'), 'synthetic-font');
  let current = await createPrototype({ root, port: 0, publicDirectory, modelDelayMs: 500, imageDelayMs: 500, ...options });
  t.after(async () => { await current.app.close(); assert(path.basename(root).startsWith('llama-prototype-test-')); await fs.rm(root, { recursive: true, force: true }); });
  async function connect() {
    const response = await fetch(current.baseUrl + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: PROTOTYPE_CODE }) });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  let cookie = await connect();
  const request = (route, body, extra = {}) => fetch(current.baseUrl + route, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), ...extra, headers: { cookie, 'Content-Type': 'application/json', ...extra.headers } });
  return { get current() { return current; }, root, request, async restart() { await current.app.close(); current = await createPrototype({ root, port: 0, publicDirectory, modelDelayMs: 500, imageDelayMs: 500, ...options }); cookie = await connect(); } };
}
async function until(read, accept, message) { for (let i = 0; i < 150; i++) { const value = await read(); if (accept(value)) return value; await wait(25); } assert.fail(message); }
const chatInput = text => ({ projectId: PROTOTYPE_PROJECT, model: PROTOTYPE_MODEL, requestId: randomUUID(), text, fileProfile: 'none' });
const receiptRoute = input => '/api/chat-request?' + new URLSearchParams({ projectId: input.projectId, requestId: input.requestId });

test('prototype serves optional bundle, legacy page and only bounded static assets with existing CSP', async t => {
  const f = await fixture(t);
  for (const route of ['/', '/prototype/', '/prototype']) { const response = await f.request(route); assert.equal(response.status, 200); assert.match(await response.text(), /app.js/); assert.match(response.headers.get('content-security-policy'), /script-src 'self'/); }
  const legacy = await f.request('/legacy/'); assert.equal(await legacy.text(), 'legacy-interface');
  const js = await f.request('/llama-ui/assets/app.js'); assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
  const font = await f.request('/llama-ui/assets/font.woff2'); assert.equal(font.headers.get('content-type'), 'font/woff2');
  for (const route of ['/llama-ui/%2e%2e%2fdata/config.json', '/llama-ui/assets%5capp.js', '/llama-ui/.hidden.js', '/llama-ui/assets/missing.js', '/llama-ui/assets/private.key']) assert.equal((await f.request(route)).status, 404, route);
  assert.equal((await fetch(f.current.baseUrl + '/api/projects')).status, 401);
});

test('prototype disables installation discovery, native picker and launcher configuration even for authenticated localhost', async t => {
  const f = await fixture(t);
  const services = await (await f.request('/api/local-services')).json();
  const headers = { origin: f.current.baseUrl, 'x-local-service-csrf': services.csrfNonce };
  const setup = await (await f.request('/api/local-service-setup', undefined, { headers })).json();
  assert.equal(setup.canConfigure, false); assert.equal(setup.reasonCode, 'prototype-setup-disabled'); assert.deepEqual(setup.services, []);
  for (const operation of ['discover', 'pick', 'save']) {
    const response = await f.request('/api/local-service-setup/' + operation, { serviceId: 'bionic' }, { headers });
    assert.equal(response.status, 403); assert.equal((await response.json()).code, 'prototype-setup-disabled');
  }
  await assert.rejects(fs.stat(path.join(f.root, 'config.launchers.local.json')), { code: 'ENOENT' });
  assert.equal(f.current.stats.externalCalls, 0); assert.equal(f.current.stats.modelCalls, 0); assert.equal(f.current.stats.promptPosts, 0);
});

test('disconnect during a real HTTP stream recovers request and final chat with a single model invocation', async t => {
  const f = await fixture(t, { modelDelayMs: 900 }), input = chatInput('Vérifie la reprise après déconnexion.');
  const controller = new AbortController(), response = await f.request('/api/chat', input, { signal: controller.signal });
  const reader = response.body.getReader(); const first = await reader.read(); assert.equal(first.done, false); controller.abort();
  await reader.cancel().catch(() => {});
  const receipt = await until(async () => (await f.request(receiptRoute(input))).json(), value => value.status === 'completed', 'detached request did not complete');
  assert.equal(f.current.stats.modelCalls, 1);
  const conversation = await (await f.request('/api/conversation?' + new URLSearchParams({ projectId: input.projectId, id: receipt.id }))).json();
  assert.match(conversation.messages.at(-1).text, /après la déconnexion/); assert.equal(conversation.messages.length, 2);
  await (await f.request('/api/chat', input)).text(); assert.equal(f.current.stats.modelCalls, 1);
  await f.restart();
  const recovered = await (await f.request(receiptRoute(input))).json(); assert.equal(recovered.status, 'completed'); assert.equal(recovered.id, receipt.id);
  await (await f.request('/api/chat', input)).text(); assert.equal(f.current.stats.modelCalls, 0);
});

test('server file permissions, optimistic hash and tool execution survive a client disconnect without replay', async t => {
  const f = await fixture(t), route = '/api/file?' + new URLSearchParams({ projectId: PROTOTYPE_PROJECT, rootId: 'project', path: 'notes.md' });
  const file = await (await f.request(route)).json(); assert.match(file.hash, /^[a-f0-9]{64}$/);
  const edit = { projectId: PROTOTYPE_PROJECT, rootId: 'project', path: 'notes.md', hash: file.hash, text: 'Version synthétique suivante.' };
  assert.equal((await f.request('/api/file/save', edit)).status, 200); assert.equal((await f.request('/api/file/save', edit)).status, 409);
  const readonly = await (await f.request('/api/file?' + new URLSearchParams({ projectId: PROTOTYPE_PROJECT, rootId: 'reference', path: 'reference.md' }))).json();
  assert.equal((await f.request('/api/file/save', { ...edit, rootId: 'reference', path: 'reference.md', hash: readonly.hash })).status, 403);
  assert.equal((await f.request('/api/file?' + new URLSearchParams({ projectId: PROTOTYPE_PROJECT, rootId: 'project', path: '../reference-files/reference.md' }))).status, 403);
  const input = { ...chatInput('MODIFIE_FIXTURE'), fileProfile: 'write' }, controller = new AbortController();
  const response = await f.request('/api/chat', input, { signal: controller.signal }); await response.body.getReader().read(); controller.abort();
  const receipt = await until(async () => (await f.request(receiptRoute(input))).json(), value => value.status === 'completed', 'detached tool request did not complete');
  assert.equal(await fs.readFile(path.join(f.current.files, 'agent.md'), 'utf8'), 'after');
  assert.deepEqual(f.current.stats.toolCalls, ['read_project_file', 'replace_project_text']);
  const chat = await (await f.request('/api/conversation?' + new URLSearchParams({ projectId: input.projectId, id: receipt.id }))).json();
  assert.equal(chat.messages.at(-1).actions.filter(action => action.name === 'replace_project_text' && action.ok).length, 1);
  const calls = f.current.stats.modelCalls; await (await f.request('/api/chat', input)).text(); assert.equal(f.current.stats.modelCalls, calls);
  assert.equal(await fs.readFile(path.join(f.current.files, 'agent.md'), 'utf8'), 'after');
});

test('ComfyUI fixture persists owned image and recovers browser/server reload without a second prompt POST', async t => {
  const f = await fixture(t), input = { projectId: PROTOTYPE_PROJECT, requestId: randomUUID(), prompt: 'A synthetic blue gradient', seed: 42, workflowId: 'krea2_turbo', format: 'square' };
  const response = await f.request('/api/comfy/generate', input), accepted = await response.json(); assert.equal(response.status, 200, JSON.stringify(accepted));
  assert.equal(f.current.stats.promptPosts, 1);
  const params = new URLSearchParams({ projectId: PROTOTYPE_PROJECT, chatId: accepted.id, messageId: accepted.messageId, jobId: accepted.generation.id });
  const job = await until(async () => (await f.request('/api/comfy/generation?' + params)).json(), value => value.status === 'succeeded', 'synthetic image did not finish');
  assert.equal(job.image.width, 1024);
  const image = await f.request('/api/comfy/image?' + params), bytes = Buffer.from(await image.arrayBuffer());
  assert.equal(image.headers.get('content-type'), 'image/png'); assert.equal(createHash('sha256').update(bytes).digest('hex'), job.image.sha256);
  params.set('messageId', 'other'); assert.equal((await f.request('/api/comfy/image?' + params)).status, 404); params.set('messageId', accepted.messageId);
  await f.restart();
  assert.equal((await (await f.request('/api/comfy/generation?' + params)).json()).status, 'succeeded');
  assert.equal((await f.request('/api/comfy/generate', input)).status, 200); assert.equal(f.current.stats.promptPosts, 0);
});

test('a lost ComfyUI submission response remains unknown after restart and is never resubmitted', async t => {
  const f = await fixture(t, { imageOutcome: 'unknown' }), input = { projectId: PROTOTYPE_PROJECT, requestId: randomUUID(), prompt: 'Synthetic uncertain image', seed: 7 };
  const accepted = await (await f.request('/api/comfy/generate', input)).json(); assert.equal(accepted.generation.status, 'unknown'); assert.equal(f.current.stats.promptPosts, 1);
  await f.restart();
  const duplicate = await (await f.request('/api/comfy/generate', input)).json(); assert.equal(duplicate.generation.status, 'unknown'); assert.equal(f.current.stats.promptPosts, 0);
  assert.equal((await f.request('/api/comfy/generations?' + new URLSearchParams({ projectId: PROTOTYPE_PROJECT, includeAll: 'true' }))).status, 200);
});

for (const imageCount of [2, 5]) test(`direct image batch of ${imageCount} survives replay and restart without duplicate submission`, async t => {
  const f = await fixture(t), input = { projectId: PROTOTYPE_PROJECT, requestId: randomUUID(), prompt: 'A synthetic blue gradient', seed: 42, imageCount };
  const response = await f.request('/api/comfy/generate', input), accepted = await response.json();
  assert.equal(response.status, 200, JSON.stringify(accepted));
  assert.equal(accepted.generations.length, imageCount);
  assert.equal(accepted.generation.id, accepted.generations[0].id);
  assert.equal(new Set(accepted.generations.map(job => job.seed)).size, imageCount);
  const again = await (await f.request('/api/comfy/generate', input)).json();
  assert.deepEqual(again.generations.map(job => job.id), accepted.generations.map(job => job.id));
  await f.restart();
  const recovered = await (await f.request('/api/comfy/generate', input)).json();
  assert.deepEqual(recovered.generations.map(job => job.id), accepted.generations.map(job => job.id));
  assert.equal(f.current.stats.promptPosts, 0);
  const chat = await (await f.request('/api/conversation?' + new URLSearchParams({projectId:input.projectId,id:accepted.id}))).json();
  assert.equal(chat.imageCount, imageCount);
  assert.equal(chat.messages.at(-1).imageGenerations.length, imageCount);
});

test('invalid direct image counts are refused before creating a request or submitting a prompt', async t => {
  const f = await fixture(t);
  for (const imageCount of [0, 6, 1.5, '2', null]) {
    const response = await f.request('/api/comfy/generate', {projectId:PROTOTYPE_PROJECT,requestId:randomUUID(),prompt:'Synthetic refusal',imageCount});
    assert.equal(response.status,400);
  }
  assert.equal(f.current.stats.promptPosts,0);
});
