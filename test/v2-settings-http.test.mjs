import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createCompanion } from '../server.mjs';

// Real HTTP route handlers and real ComfyUI settings persistence. The request
// and upstream services are injected; no listening socket, GPU or model runs.
class ResponseRecorder extends EventEmitter {
  headers = {}; parts = []; destroyed = false; writableEnded = false; headersSent = false; statusCode = 200;
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }
  write(text) { this.parts.push(Buffer.isBuffer(text) ? text.toString('utf8') : String(text)); return true; }
  end(text) { if (text) this.write(text); this.writableEnded = true; this.emit('finish'); }
  text() { return this.parts.join(''); }
  json() { return JSON.parse(this.text()); }
}
const schema = {
  UNETLoader: { input: { required: { unet_name: [['krea2_turbo_fp8_scaled.safetensors']], weight_dtype: [['default']] } }, output: ['MODEL'] },
  CLIPLoader: { input: { required: { clip_name: [['qwen3vl_4b_fp8_scaled.safetensors']], type: [['krea2']], device: [['default']] } }, output: ['CLIP'] },
  VAELoader: { input: { required: { vae_name: [['qwen_image_vae.safetensors']] } }, output: ['VAE'] },
  CheckpointLoaderSimple: { input: { required: { ckpt_name: [['hassakuXLIllustrious_v34.safetensors']] } }, output: ['MODEL', 'CLIP', 'VAE'] },
  CLIPTextEncode: { input: { required: { text: ['STRING'], clip: ['CLIP'] } }, output: ['CONDITIONING'] },
  ConditioningZeroOut: { input: { required: { conditioning: ['CONDITIONING'] } }, output: ['CONDITIONING'] },
  EmptyLatentImage: { input: { required: { width: ['INT'], height: ['INT'], batch_size: ['INT'] } }, output: ['LATENT'] },
  KSampler: { input: { required: { model: ['MODEL'], positive: ['CONDITIONING'], negative: ['CONDITIONING'], latent_image: ['LATENT'], seed: ['INT'], steps: ['INT'], cfg: ['FLOAT'], sampler_name: [['euler', 'euler_ancestral']], scheduler: [['simple', 'normal']], denoise: ['FLOAT'] } }, output: ['LATENT'] },
  VAEDecode: { input: { required: { samples: ['LATENT'], vae: ['VAE'] } }, output: ['IMAGE'] },
  SaveImage: { input: { required: { images: ['IMAGE'], filename_prefix: ['STRING'] } }, output: ['IMAGE'] },
  FreeMemoryAfterWorkflow: { input: { required: {}, optional: { trigger:['*'] } }, output:[], output_node:true }
};
async function fixture(t) {
  const parent = path.resolve(fileURLToPath(new URL('../work/v2-http-fixtures/', import.meta.url)));
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'case-'));
  const requests = [], info = structuredClone(schema);
  let modelCalls = 0, cookie, app;
  const options = {
    root,
    settings: { port: 8769, apiUrl: 'http://127.0.0.1:1235', bionicRoot: root, registryPath: path.join(root, 'registry.json'), extraRoots: [], comfyEnabled: false, comfyUrl: 'http://127.0.0.1:8188', comfyWorkflowId: 'krea2_turbo' },
    nativeStore: { listProjects: async () => [{ id: 'p1', name: 'Synthetic', sessionsCount: 0 }], listSessions: async () => [], getConversation: async () => { throw Error('No native conversation should be opened'); } },
    modelService: { list: async () => [{ id: 'synthetic-model', name: 'Synthetic', type: 'llm', tools: true, contextLength: 32000 }] },
    fetchImpl: async () => { modelCalls++; throw Error('No model inference is authorized by a settings test'); },
    comfyFetchImpl: async (url, options = {}) => {
      const route = new URL(url).pathname;
      requests.push({ url, route, method: options.method || 'GET' });
      if (route === '/system_stats') return Response.json({ system: { comfyui_version: 'synthetic' }, devices: [{ name: 'synthetic device' }] });
      if (route === '/queue') return Response.json({ queue_running: [], queue_pending: [] });
      if (route === '/object_info') return Response.json(info);
      throw Error('A settings test must never submit or fetch a generated image');
    },
    updateService: { stop() {}, status() { return {}; } }
  };
  app = await createCompanion(options);
  t.after(async () => {
    await app.close();
    // This recursive deletion is confined to the fixture just created here.
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert(path.basename(root).startsWith('case-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  async function request(url, { body, authenticated = true, origin, method = body === undefined ? 'GET' : 'POST' } = {}) {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.method = method; req.url = url;
    req.headers = { host: '127.0.0.1:8769', ...(authenticated && cookie ? { cookie } : {}), ...(origin ? { origin } : {}) };
    req.socket = { remoteAddress: '127.0.0.1' };
    const res = new ResponseRecorder(); await app.handle(req, res); return res;
  }
  async function login() {
    const access = await fs.readFile(path.join(root, 'ACCES-PRIVE.txt'), 'utf8');
    const code = /Code d’accès : (.+)/.exec(access)[1].trim();
    const response = await request('/api/login', { body: { code }, authenticated: false });
    assert.equal(response.statusCode, 200);
    cookie = response.headers['set-cookie'].split(';')[0];
  }
  await login();
  return { root, requests, info, request, get modelCalls() { return modelCalls; }, async restart() { await app.close(); app = await createCompanion(options); cookie = undefined; await login(); } };
}

test('V2 settings and capabilities require authentication and mutations reject foreign origins', async t => {
  const f = await fixture(t);
  for (const [url, body] of [
    ['/api/comfy/settings', undefined], ['/api/comfy/settings', { enabled: true }],
    ['/api/comfy/check', {}], ['/api/comfy/loras', {}], ['/api/capabilities', undefined]
  ]) assert.equal((await f.request(url, { body, authenticated: false })).statusCode, 401, url);
  for (const url of ['/api/comfy/settings', '/api/comfy/check', '/api/comfy/loras']) assert.equal((await f.request(url, { body: { enabled: true }, origin: 'https://foreign.example' })).statusCode, 403, url);
  assert.equal((await f.request('/api/comfy/settings')).json().enabled, false);
  assert.equal(f.requests.length, 0); assert.equal(f.modelCalls, 0);
});

test('ComfyUI settings HTTP routes persist selected endpoint and workflow while rejecting malformed patches', async t => {
  const f = await fixture(t);
  let response = await f.request('/api/comfy/settings');
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().enabled, false);
  assert.deepEqual(response.json().workflows.map(item => item.id).sort(), ['hassaku_illustrious', 'krea2_turbo']);
  response = await f.request('/api/comfy/settings', { body: { enabled: true, url: 'http://192.168.1.197:8188', workflowId: 'hassaku_illustrious' } });
  assert.equal(response.statusCode, 200, response.text());
  assert.equal(response.json().enabled, true);
  await f.restart();
  const persisted = (await f.request('/api/comfy/settings')).json();
  assert.equal(persisted.url, 'http://192.168.1.197:8188');
  assert.equal(persisted.workflowId, 'hassaku_illustrious');
  assert.equal(persisted.enabled, true);
  for (const body of [{ enabled: 'true' }, { url: 'https://public.example' }, { workflowId: 'arbitrary' }, { graph: { code: 'arbitrary' } }]) assert.equal((await f.request('/api/comfy/settings', { body })).statusCode, 400);
  assert.deepEqual((await f.request('/api/comfy/settings')).json(), persisted);
  const bytes = await fs.readFile(path.join(f.root, 'data', 'comfy-settings.json'), 'utf8');
  assert.equal(JSON.parse(bytes).workflowId, 'hassaku_illustrious');
  assert.equal(f.requests.length, 0); assert.equal(f.modelCalls, 0);
});

test('ComfyUI connection HTTP check is read-only, validates models and never submits a prompt', async t => {
  const f = await fixture(t), previous = (await f.request('/api/comfy/settings')).json();
  let response = await f.request('/api/comfy/check', { body: { url: 'http://192.168.1.197:8188', workflowId: 'krea2_turbo' } });
  assert.equal(response.statusCode, 200, response.text());
  assert.equal(response.json().ok, true, response.text());
  assert.equal(response.json().reachable, true);
  assert(response.json().workflows.every(profile => profile.compatible));
  assert.deepEqual(f.requests.map(item => item.route).sort(), ['/object_info', '/queue', '/system_stats']);
  assert(f.requests.every(item => item.method === 'GET'));
  assert.deepEqual((await f.request('/api/comfy/settings')).json(), previous);
  f.info.CheckpointLoaderSimple.input.required.ckpt_name = [['missing-model.safetensors']];
  response = await f.request('/api/comfy/check', { body: { workflowId: 'hassaku_illustrious' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, false);
  assert.equal(response.json().reachable, true);
  assert(response.json().workflows.find(profile => profile.id === 'krea2_turbo').compatible);
  assert(f.requests.every(item => item.route !== '/prompt' && item.method === 'GET'));
  assert.equal(f.modelCalls, 0);
});

test('disabled image access is rejected before inference and capabilities expose companion limits', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/chat', { body: { projectId: 'p1', model: 'synthetic-model', requestId: randomUUID(), text: 'Génère une image.', imageAccess: true, fileProfile: 'none' } });
  assert.equal(response.statusCode, 409, response.text());
  assert.match(response.json().error, /ComfyUI est désactivé/);
  assert.equal(f.modelCalls, 0); assert.equal(f.requests.length, 0);
  assert.equal((await fs.readdir(path.join(f.root, 'data', 'chats'))).length, 0);
  const catalogue = (await f.request('/api/capabilities')).json();
  assert.equal(typeof catalogue.version, 'string');
  assert(catalogue.items.some(item => item.name === 'ComfyUI' && /facultative/.test(item.description)));
  assert(catalogue.items.some(item => item.name === 'Bionic Desktop' && /ne sont pas hérités/.test(item.description)));
  assert(catalogue.items.some(item => item.name === 'Scripts sur le PC' && /Validation/.test(item.description)));
  const status = (await f.request('/api/status')).json();
  assert.equal(status.capabilities.nativeAgentTools, false);
  assert.equal(status.capabilities.nativeSessions, 'read-only');
});
