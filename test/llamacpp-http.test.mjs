import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scryptSync } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createCompanion } from '../server.mjs';

class Reply extends EventEmitter {
  constructor() { super(); this.parts = []; this.headers = {}; this.statusCode = 200; }
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [k, v] of Object.entries(headers)) this.setHeader(k, v); }
  write(value) { this.parts.push(String(value)); return true; }
  end(value) { if (value) this.write(value); this.writableEnded = true; this.emit('finish'); }
  text() { return this.parts.join(''); }
  json() { return JSON.parse(this.text()); }
}

test('companion routes use llama for tools and text without Bionic/Comfy calls or Bionic token', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'llamacpp-http-')));
  const oldToken = process.env.BIONIC_API_TOKEN;
  process.env.BIONIC_API_TOKEN = 'BIONIC_PRIVATE_FIXTURE';
  let app, cookie, connections, toolExecutions = 0;
  const calls = [];
  t.after(async () => {
    await app?.close();
    if (oldToken === undefined) delete process.env.BIONIC_API_TOKEN; else process.env.BIONIC_API_TOKEN = oldToken;
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir())); assert(path.basename(root).startsWith('llamacpp-http-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  // Known synthetic authentication, created before boot; no credential discovery.
  await fs.mkdir(path.join(root, 'data'));
  await fs.writeFile(path.join(root, 'data/config.json'), JSON.stringify({ instanceId: 'llama-fixture', salt: 'fixture-salt', passwordHash: scryptSync('fixture-code-only', 'fixture-salt', 32).toString('hex'), adminToken: 'fixture-admin-only' }));
  const settings = { port: 8769, apiUrl: 'http://127.0.0.1:1235', inferenceProvider: 'llamacpp', llamaUrl: 'http://127.0.0.1:1236', bionicRoot: root, extraRoots: [], python: 'python', comfyUrl: 'http://127.0.0.1:8188', comfyEnabled: false };
  app = await createCompanion({ root, settings,
    nativeStore: { listProjects: async () => { throw Error('Bionic unavailable'); }, listSessions: async () => [], getConversation: async () => { throw Error('No native conversation'); } },
    localServiceSupervisorFactory: async options => { connections = options.connections; return { activeCount: () => 0, assertAdmission() {}, close: async () => {} }; },
    webService: { search: async query => { toolExecutions++; return { query, results: [{ title: 'Synthetic', url: 'https://example.invalid/', snippet: 'SYNTHETIC_TOOL_RESULT' }] }; } },
    fetchImpl: async (url, options = {}) => {
      assert(String(url).startsWith(settings.llamaUrl + '/'), 'Unexpected engine contact: ' + url);
      assert.equal(options.headers?.Authorization, undefined, 'Bionic token leaked');
      calls.push({ url, options });
      if (url.endsWith('/v1/models')) return Response.json({ data: [{ id: 'fixture-alias', meta: { n_ctx_train: 131072 } }] });
      if (url.endsWith('/props')) return Response.json({ total_slots: 1, default_generation_settings: { n_ctx: 8192 }, is_sleeping: false });
      assert(url.endsWith('/v1/chat/completions'));
      const body = JSON.parse(options.body); assert.equal(body.model, 'fixture-alias'); assert.equal(body.reasoning_effort, undefined);
      const returnedTool = body.messages.find(message => message.role === 'tool');
      if (returnedTool) assert.match(returnedTool.content, /SYNTHETIC_TOOL_RESULT/);
      const event = returnedTool
        ? { choices: [{ delta: { content: 'Réponse synthétique llama.cpp' }, finish_reason: 'stop' }] }
        : { choices: [{ delta: { tool_calls: [{ index: 0, id: 'search-1', type: 'function', function: { name: 'search_web', arguments: '{"query":"fixture"}' } }] }, finish_reason: 'tool_calls' }] };
      return new Response('data: ' + JSON.stringify(event) + '\n\ndata: [DONE]\n\n');
    },
  });
  async function request(url, body) {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url, method: body === undefined ? 'GET' : 'POST', headers: { host: '127.0.0.1:8769', ...(cookie ? { cookie } : {}) }, socket: { remoteAddress: '127.0.0.1' } });
    const res = new Reply(); await app.handle(req, res); return res;
  }
  cookie = (await request('/api/login', { code: 'fixture-code-only' })).headers['set-cookie'].split(';')[0];
  const created = await request('/api/local-projects', { name: 'Projet synthétique' });
  assert.equal(created.statusCode, 201, created.text());
  const project = created.json().project;
  const model = (await request('/api/models')).json().models[0];
  assert.equal(model.contextLength, 8192); assert.equal(model.toolsCapability, 'unknown');
  assert.equal(connections().bionicUrl, settings.apiUrl); assert.equal(connections().comfyUrl, settings.comfyUrl);
  const beforeUnload = calls.length;
  assert.equal((await request('/api/models/unload', { instanceId: model.id })).statusCode, 409);
  assert.equal(calls.length, beforeUnload);
  const result = await request('/api/chat', { projectId: project.id, model: model.id, text: 'Recherche synthétique', webAccess: true, fileAccess: false });
  assert.equal(result.statusCode, 200, result.text());
  const records = result.text().trim().split('\n').map(JSON.parse);
  const started = records.find(record => record.type === 'start'); assert(started, result.text());
  const chat = await app.readWeb(started.id);
  const answer = chat.messages.find(message => message.role === 'assistant');
  assert.equal(answer.text, 'Réponse synthétique llama.cpp'); assert.equal(answer.provider.provider, 'llamacpp');
  assert.equal(answer.actions[0].ok, true); assert.equal(toolExecutions, 1);
  assert.equal(calls.filter(call => call.url.endsWith('/v1/chat/completions')).length, 2);
});
