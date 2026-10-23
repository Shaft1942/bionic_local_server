import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, scryptSync } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { setTimeout as wait } from 'node:timers/promises';
import { createCompanion } from '../server.mjs';
import { createComfyImages } from './comfy-images.mjs';
import { createModelTransport } from './model-transport.mjs';
import { createLlamaCppModelService } from './llamacpp-model-service.mjs';

export const PROTOTYPE_CODE = 'prototype-260';
export const PROTOTYPE_PROJECT = 'prototype-project';
export const PROTOTYPE_MODEL = 'synthetic-prototype';
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const fail = message => Object.assign(new Error(message), { status: 403 });
async function writeOnce(filename, contents) {
  try { await fs.writeFile(filename, contents, { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
}

// A valid, deliberately synthetic PNG; no image engine or model is contacted.
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function pngChunk(kind, bytes) { const name = Buffer.from(kind); const chunk = Buffer.alloc(bytes.length + 12); chunk.writeUInt32BE(bytes.length); name.copy(chunk, 4); bytes.copy(chunk, 8); chunk.writeUInt32BE(crc32(Buffer.concat([name, bytes])), chunk.length - 4); return chunk; }
function syntheticPng(width, height) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = y * (width * 3 + 1) + 1 + x * 3; pixels[i] = 25 + Math.floor(120 * x / width); pixels[i + 1] = 80 + Math.floor(90 * y / height); pixels[i + 2] = 160; }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0))]);
}

export async function createPrototype({ root, port = 8878, publicDirectory = path.join(sourceRoot, 'public'), modelDelayMs = 3000, imageDelayMs = 3500, imageOutcome = 'success', llamaUrl, listen = true } = {}) {
  if (!root || !path.isAbsolute(root)) throw new Error('An explicit absolute fixture root is required.');
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid fixture port.');
  if (!['success', 'unknown'].includes(imageOutcome)) throw new Error('Invalid synthetic image outcome.');
  const marker = path.join(root, '.llama-ui-prototype');
  await fs.mkdir(root, { recursive: true });
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('A fixture directory cannot be a symlink.');
  const contents = await fs.readdir(root);
  if (contents.length && !contents.includes('.llama-ui-prototype')) throw new Error('Refusing to initialize a non-fixture directory.');
  await writeOnce(marker, 'isolated-llama-ui-prototype-v1\n');
  if (await fs.readFile(marker, 'utf8') !== 'isolated-llama-ui-prototype-v1\n') throw new Error('Invalid fixture marker.');
  const data = path.join(root, 'data'), files = path.join(root, 'project-files'), reference = path.join(root, 'reference-files');
  for (const folder of [data, files, reference]) await fs.mkdir(folder, { recursive: true });
  await writeOnce(path.join(files, 'notes.md'), '# Projet de démonstration\n\nCette note synthétique peut être jointe au chat.\n');
  await writeOnce(path.join(files, 'agent.md'), 'before');
  await writeOnce(path.join(reference, 'reference.md'), 'Référence synthétique en lecture seule.');
  const salt = 'llama-ui-synthetic-fixture-salt';
  await writeOnce(path.join(data, 'config.json'), JSON.stringify({ instanceId: randomUUID(), salt, passwordHash: scryptSync(PROTOTYPE_CODE, salt, 32).toString('hex'), adminToken: randomUUID() }));
  await writeOnce(path.join(data, 'local-projects.json'), JSON.stringify({ version: 1, projects: [{ id: PROTOTYPE_PROJECT, name: 'Atelier de démonstration', provenance: 'local', createdAt: Date.now(), roots: [{ id: 'project', name: 'Fichiers de démonstration', path: files, writable: true, pinned: true }, { id: 'reference', name: 'Références en lecture', path: reference, writable: false, pinned: true }] }, { id: 'prototype-other', name: 'Second projet', provenance: 'local', createdAt: Date.now(), roots: [] }] }));
  await writeOnce(path.join(root, 'registry-fixture.json'), JSON.stringify({ projects: [] }));
  const engineFile = path.join(root, 'synthetic-engine.json');
  let persisted = { prompts: [] }; try { persisted = JSON.parse(await fs.readFile(engineFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const stats = { modelCalls: 0, promptPosts: 0, toolCalls: [], externalCalls: 0 };
  const prompts = new Map(persisted.prompts.map(job => [job.id, job]));
  const info = {};
  for (const filename of ['krea2-turbo.api.json', 'hassaku-illustrious.api.json']) {
    const graph = JSON.parse(await fs.readFile(path.join(sourceRoot, 'workflows', filename), 'utf8'));
    for (const node of Object.values(graph)) {
      const definition = info[node.class_type] ||= { input: { required: {} }, output: Array(12).fill('*'), output_node: true };
      for (const [name, value] of Object.entries(node.inputs)) definition.input.required[name] = [['unet_name', 'clip_name', 'vae_name', 'ckpt_name'].includes(name) ? [value] : '*'];
    }
  }
  const json = value => Response.json(value);
  const comfyFetch = async (value, options = {}) => {
    const url = new URL(value);
    if (url.origin !== 'http://127.0.0.1:19999') throw new Error('Fixture blocks non-synthetic ComfyUI endpoints.');
    if (url.pathname === '/object_info') return json(info);
    if (url.pathname === '/system_stats') return json({ system: { comfyui_version: 'synthetic-prototype', os: 'fixture' }, devices: [{ name: 'Simulation, aucun GPU' }] });
    if (url.pathname === '/prompt' && options.method === 'POST') {
      stats.promptPosts++;
      const body = JSON.parse(options.body), graph = body.prompt;
      const latent = Object.values(graph).find(node => node.class_type === 'EmptyLatentImage');
      const id = randomUUID(), job = { id, at: Date.now(), width: latent.inputs.width, height: latent.inputs.height, unknown: imageOutcome === 'unknown' };
      prompts.set(id, job); await fs.writeFile(engineFile, JSON.stringify({ prompts: [...prompts.values()] }));
      if (job.unknown) throw new Error('Synthetic lost submission response.');
      return json({ prompt_id: id });
    }
    if (url.pathname === '/queue') return json({ queue_running: [...prompts.values()].filter(job => !job.unknown && Date.now() - job.at < imageDelayMs).map(job => [0, job.id]), queue_pending: [] });
    if (url.pathname.startsWith('/history/')) {
      const id = url.pathname.split('/').pop(), job = prompts.get(id);
      if (!job || job.unknown || Date.now() - job.at < imageDelayMs) return json({});
      const image = { images: [{ filename: id + '.png', subfolder: '', type: 'output' }] };
      return json({ [id]: { status: { completed: true, status_str: 'success', messages: [['execution_start', { timestamp: job.at }], ['execution_success', { timestamp: job.at + imageDelayMs }]] }, outputs: { '9': image, '19': image } } });
    }
    if (url.pathname === '/view') { const job = prompts.get(url.searchParams.get('filename')?.replace(/\.png$/, '')); if (!job) return new Response('', { status: 404 }); return new Response(syntheticPng(job.width, job.height), { headers: { 'Content-Type': 'image/png' } }); }
    throw new Error('Unexpected synthetic ComfyUI route: ' + url.pathname);
  };
  const model = { id: PROTOTYPE_MODEL, name: 'Simulation isolée · réponse lente', type: 'llm', tools: true, vision: false, loaded: true, contextLength: 32768, loadedInstances: [{ id: PROTOTYPE_MODEL, contextLength: 32768 }], reasoning: { allowedOptions: [] } };
  const syntheticFetch = async (url, options) => {
    if (String(url) !== 'http://127.0.0.1:19998/v1/chat/completions') throw new Error('Unexpected synthetic inference endpoint.');
    stats.modelCalls++;
    const body = JSON.parse(options.body), lastUser = body.messages.findLast(message => message.role === 'user')?.content;
    const prompt = typeof lastUser === 'string' ? lastUser : '';
    const toolResults = body.messages.filter(message => message.role === 'tool').length;
    const has = name => body.tools?.some(tool => tool.function.name === name);
    let tool;
    if (prompt.includes('MODIFIE_FIXTURE') && toolResults < 2) {
      const name = toolResults ? 'replace_project_text' : 'read_project_file';
      if (has(name)) tool = { name, arguments: JSON.stringify(toolResults ? { path: 'agent.md', old_text: 'before', new_text: 'after' } : { path: 'agent.md' }) };
    } else if (prompt.includes('IMAGE_FIXTURE') && !toolResults && has('generate_comfy_image')) tool = { name: 'generate_comfy_image', arguments: JSON.stringify({ prompt: 'A blue synthetic gradient', seed: 42, format: 'square' }) };
    if (tool) stats.toolCalls.push(tool.name);
    const text = toolResults ? 'Le fichier synthétique a été traité. Les droits et versions restent contrôlés par le compagnon.' : 'Cette réponse de démonstration continue sur le serveur après la déconnexion. Les projets, fichiers et images utilisent les API du compagnon. Retrouvez ce message en rouvrant la conversation.';
    const parts = tool ? [{ choices: [{ delta: { tool_calls: [{ index: 0, id: randomUUID(), type: 'function', function: tool }] }, finish_reason: 'tool_calls' }] }] : text.match(/.{1,24}/gs).map(part => ({ choices: [{ delta: { content: part } }] }));
    return new Response(new ReadableStream({ async start(controller) {
      try {
        for (const part of parts) { await wait(Math.max(1, Math.floor(modelDelayMs / parts.length)), undefined, { signal: options.signal }); controller.enqueue(Buffer.from('data: ' + JSON.stringify(part) + '\n\n')); }
        if (!tool) controller.enqueue(Buffer.from('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n'));
        controller.enqueue(Buffer.from('data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 80, completion_tokens: 40 } }) + '\n\ndata: [DONE]\n\n')); controller.close();
      } catch (error) { controller.error(error); }
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const comfyService = await createComfyImages({ directory: path.join(data, 'comfy-generations'), url: 'http://127.0.0.1:19999', enabled: true, fetchImpl: comfyFetch, pollMs: 80 });
  let realFetch;
  if (llamaUrl) {
    const url = new URL(llamaUrl);
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Only an explicit local llama-server origin is accepted.');
    llamaUrl = url.origin;
    realFetch = async (value, options) => { const target = new URL(value); if (target.origin !== llamaUrl || !['/v1/models', '/props', '/v1/chat/completions'].includes(target.pathname)) throw new Error('Fixture blocks unexpected real engine calls.'); stats.externalCalls++; if (target.pathname === '/v1/chat/completions') stats.modelCalls++; return fetch(value, options); };
  }
  const supervisor = { assertAdmission() {}, activeCount: () => 0, protectedPaths: () => [], async snapshot() { return { services: [], disabled: true }; }, async action() { throw fail('Les lanceurs sont désactivés dans le prototype.'); }, async reload() { return this.snapshot(); }, async operation() { throw fail('Aucune opération du prototype.'); }, async close() {} };
  // Do not inherit API tokens from the developer's personal environment.
  const inferenceFetch = realFetch || syntheticFetch;
  const modelService = llamaUrl ? createLlamaCppModelService({ baseUrl: llamaUrl, fetchImpl: inferenceFetch, headers: () => ({}) }) : { list: async () => [model], forInference: async () => model, pendingCount: () => 0 };
  const modelTransport = createModelTransport({ baseUrl: llamaUrl || 'http://127.0.0.1:19998', provider: llamaUrl ? 'llamacpp' : 'bionic', fetchImpl: inferenceFetch, headers: () => ({}) });
  let app;
  try {
    app = await createCompanion({ root, publicDirectory, prototypeInfo: { syntheticComfyUI: true, syntheticProjects: true, realInference: !!llamaUrl }, settings: { port, uiMode: 'llama', inferenceProvider: llamaUrl ? 'llamacpp' : 'bionic', llamaUrl, apiUrl: 'http://127.0.0.1:19998', bionicRoot: path.join(root, 'native-disabled'), registryPath: path.join(root, 'registry-fixture.json'), extraRoots: [], python: 'python', comfyEnabled: true, comfyUrl: 'http://127.0.0.1:19999', resourcePolicy: 'independent' }, nativeStore: { listProjects: async () => [], listSessions: async () => [], getConversation: async () => { throw Object.assign(new Error('No native history in this fixture.'), { status: 404 }); } }, modelService, modelTransport, fetchImpl: inferenceFetch, comfyService, localServiceSupervisor: supervisor, enableUpdateScheduling: false });
    if (listen) await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(port, '127.0.0.1', resolve); });
    return { app, root, files, stats, code: PROTOTYPE_CODE, baseUrl: listen ? 'http://127.0.0.1:' + app.server.address().port : null };
  } catch (error) { await app?.close(); await comfyService.close(); throw error; }
}
