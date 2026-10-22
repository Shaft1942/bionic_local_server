import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createModelPreferences, outputBudget, estimateRequestTokens, validateOutputPreferences } from '../lib/model-preferences.mjs';
import { createCompanion } from '../server.mjs';

async function directory(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-output-test-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert(path.basename(root).startsWith('bionic-output-test-')); await fs.rm(root, { recursive: true, force: true }); });
  return root;
}
test('model defaults persist independently and session overrides remain scoped to their conversation and model', async t => {
  const root = await directory(t), filename = path.join(root, 'model-preferences.json');
  const prefs = await createModelPreferences({ filename });
  const first = {}, other = {};
  assert.equal(prefs.resolve('a').maxOutputTokens, 8192);
  await Promise.all([prefs.setModel('a', 12000), prefs.setModel('b', 3000)]);
  prefs.setSession(first, 'a', 6000);
  assert.equal(prefs.resolve('a', first).source, 'session');
  assert.equal(prefs.resolve('a', first).maxOutputTokens, 6000);
  assert.equal(prefs.resolve('a', other).maxOutputTokens, 12000);
  assert.equal(prefs.resolve('b', first).maxOutputTokens, 3000);
  const reloaded = await createModelPreferences({ filename });
  assert.equal(reloaded.resolve('a', JSON.parse(JSON.stringify(first))).maxOutputTokens, 6000);
  assert.equal(reloaded.resolve('b').maxOutputTokens, 3000);
  prefs.setSession(first, 'a', null);
  assert.equal(prefs.resolve('a', first).source, 'session'); assert.equal(prefs.resolve('a', first).automatic, true); assert.equal(prefs.resolve('a', first).maxOutputTokens, 8192);
  assert.equal(reloaded.resolve('a', JSON.parse(JSON.stringify(first))).automatic, true);
  prefs.clearSession(first, 'a'); assert.equal(prefs.resolve('a', first).source, 'model');
  await prefs.setModel('a', null); assert.equal(prefs.resolve('a', first).source, 'auto');
  await prefs.setModel('__proto__', 9000); assert.equal(prefs.resolve('__proto__').maxOutputTokens, 9000);
});
test('invalid preferences and corrupt persistence fail explicitly without replacing saved bytes', async t => {
  const root = await directory(t), filename = path.join(root, 'model-preferences.json');
  for (const value of [undefined, 0, -1, 1.5, 1_000_001, '8192', NaN]) assert.throws(() => validateOutputPreferences({ maxOutputTokens: value, applyToAllSessions: false }), error => error.status === 400);
  assert.throws(() => validateOutputPreferences({ maxOutputTokens: 512, applyToAllSessions: 'yes' }), error => error.status === 400);
  await fs.writeFile(filename, '{broken');
  await assert.rejects(createModelPreferences({ filename }), error => error.status === 503);
  assert.equal(await fs.readFile(filename, 'utf8'), '{broken');
});
test('every output budget charges tools, call arguments, results and image count without charging base64 bytes', () => {
  const messages = [{ role: 'user', content: 'Bonjour' }], preference = { source: 'auto', maxOutputTokens: 8192 };
  assert.equal(outputBudget({ contextLength: 32000, messages, preference }).maxOutputTokens, 8192);
  const tools = [{ type: 'function', function: { name: 'read', parameters: { description: 'schema '.repeat(500) } } }];
  const first = outputBudget({ contextLength: 10000, messages, tools, preference });
  const expanded = [...messages, { role: 'assistant', content: null, tool_calls: [{ id: 'call', function: { name: 'read', arguments: JSON.stringify({ query: 'query '.repeat(150) }) } }] }, { role: 'tool', tool_call_id: 'call', content: 'résultat '.repeat(600) }];
  const next = outputBudget({ contextLength: 10000, messages: expanded, tools, preference });
  assert(next.estimatedInputTokens > first.estimatedInputTokens); assert(next.maxOutputTokens < first.maxOutputTokens);
  assert(next.estimatedInputTokens + next.maxOutputTokens + next.reserveTokens <= 10000);
  const image = data => [{ role: 'user', content: [{ type: 'text', text: 'Une image' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + data } }] }];
  assert.equal(estimateRequestTokens(image('abc')), estimateRequestTokens(image('abc'.repeat(100000))));
  assert.throws(() => outputBudget({ contextLength: 4096, messages: [{ role: 'user', content: 'long '.repeat(4000) }], preference }), error => error.status === 400);
  assert.equal(outputBudget({ contextLength: 4096, messages, preference: { maxOutputTokens: 1, source: 'session' } }).maxOutputTokens, 1);
});

class ResponseRecorder extends EventEmitter {
  headers = {}; parts = []; destroyed = false; writableEnded = false; headersSent = false; statusCode = 200;
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }
  write(text) { this.parts.push(String(text)); return true; }
  end(text) { if (text) this.write(text); this.writableEnded = true; this.emit('finish'); }
  text() { return this.parts.join(''); }
  events() { return this.text().trim().split('\n').filter(Boolean).map(JSON.parse); }
  json() { return JSON.parse(this.text()); }
}
const model = id => ({ id, name: id, type: 'llm', tools: true, contextLength: 10000 });
const stream = (choices, finishReason = 'stop') => new Response('data: ' + JSON.stringify({ choices: [{ ...choices, finish_reason: finishReason }] }) + '\n\ndata: [DONE]\n\n');
async function fixture(t, fetchImpl, extra = {}) {
  const root = await directory(t);
  const nativeStore = { listProjects: async () => [{ id: 'p1', name: 'Synthetic', sessionsCount: 1 }, { id: 'p2', name: 'Other', sessionsCount: 0 }], listSessions: async projectId => projectId === 'p1' ? [{ id: 'native-1', projectId, name: 'Native', updatedAt: 1 }] : [], getConversation: async (projectId, id) => ({ projectId, id, name: 'Native', source: 'bionic', messages: [{ role: 'user', text: 'Earlier native text' }] }) };
  const options = { root, nativeStore, fetchImpl, modelService: { list: async () => [model('a'), model('b')] }, comfyService: { async close() {} }, updateService: { stop() {}, status() { return {}; } }, settings: { port: 8769, apiUrl: 'http://127.0.0.1:1235', bionicRoot: root, registryPath: path.join(root, 'registry.json'), extraRoots: [] }, ...extra };
  const app = await createCompanion(options); t.after(() => app.close());
  let cookie;
  const request = async (url, body, authenticated = true, res = new ResponseRecorder()) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    req.method = body ? 'POST' : 'GET'; req.url = url; req.headers = { host: '127.0.0.1:8769', ...(authenticated && cookie ? { cookie } : {}) }; req.socket = { remoteAddress: '127.0.0.1' };
    await app.handle(req, res); return res;
  };
  const access = await fs.readFile(path.join(root, 'ACCES-PRIVE.txt'), 'utf8');
  const login = await request('/api/login', { code: /Code d’accès : (.+)/.exec(access)[1].trim() }); cookie = login.headers['set-cookie'].split(';')[0];
  const send = (text, more = {}, res) => request('/api/chat', { projectId: 'p1', model: 'a', requestId: randomUUID(), text, ...more }, true, res);
  return { root, app, request, send, options };
}
test('HTTP settings scope per model and chat, survive restart, and report length finishes in saved responses', async t => {
  const bodies = [], f = await fixture(t, async (_url, options) => { bodies.push(JSON.parse(options.body)); return stream({ delta: { content: 'Réponse conservée.' } }, 'length'); });
  assert.equal((await f.request('/api/model-preferences?projectId=p1&model=a', undefined, false)).statusCode, 401);
  assert.equal((await f.request('/api/model-preferences', { projectId: 'p1', model: 'a', maxOutputTokens: 1000, applyToAllSessions: true })).json().source, 'model');
  let events = (await f.send('Nouveau chat', { outputPreferences: { maxOutputTokens: 200, applyToAllSessions: false } })).events();
  const id = events.find(event => event.type === 'start').id, done = events.at(-1);
  assert.equal(bodies.at(-1).max_tokens, 200); assert.equal(done.truncated, true); assert.equal(done.finishReason, 'length'); assert.equal(done.outputBudget.source, 'session');
  const prefs = (await f.request('/api/model-preferences?' + new URLSearchParams({ projectId: 'p1', model: 'a', id }))).json();
  assert.equal(prefs.sessionMaxOutputTokens, 200); assert.equal(prefs.modelMaxOutputTokens, 1000);
  const chat = (await f.request('/api/conversation?' + new URLSearchParams({ projectId: 'p1', id }))).json();
  assert.equal(chat.outputPreferencesByModel.a, 200); assert.equal(chat.messages.at(-1).truncated, true);
  await f.send('Autre conversation'); assert.equal(bodies.at(-1).max_tokens, 1000);
  await f.send('Autre modèle', { model: 'b' }); assert(bodies.at(-1).max_tokens > 2048);
  const auto = (await f.request('/api/model-preferences', { projectId: 'p1', id, model: 'a', maxOutputTokens: null, applyToAllSessions: false })).json();
  assert.equal(auto.automatic, true); assert.equal(auto.source, 'session'); assert.equal(auto.modelMaxOutputTokens, 1000);
  await f.send('Auto dans cette session', { sessionId: id }); assert(bodies.at(-1).max_tokens > 2048);
  assert.equal((await f.request('/api/model-preferences', { projectId: 'p2', id, model: 'a', maxOutputTokens: 400, applyToAllSessions: false })).statusCode, 404);
  await f.request('/api/model-preferences', { projectId: 'p1', id, model: 'a', maxOutputTokens: 700, applyToAllSessions: true });
  assert.equal((await f.request('/api/model-preferences?' + new URLSearchParams({ projectId: 'p1', id, model: 'a' }))).json().source, 'model');
  const pending = (await f.request('/api/model-preferences', { projectId: 'p1', id: 'native-1', model: 'a', maxOutputTokens: 333, applyToAllSessions: false })).json();
  assert.equal(pending.pending, true);
  events = (await f.send('Suite native', { sessionId: 'native-1', outputPreferences: { maxOutputTokens: 333, applyToAllSessions: false } })).events();
  assert.equal(bodies.at(-1).max_tokens, 333);
  const nativeId = events.find(event => event.type === 'start').id;
  await f.app.close();
  const restarted = await createCompanion(f.options); t.after(() => restarted.close());
  assert.equal((await restarted.readWeb(id)).outputPreferencesByModel.a, undefined);
  assert.equal((await restarted.readWeb(nativeId)).outputPreferencesByModel.a, 333);
  const savedModels = JSON.parse(await fs.readFile(path.join(f.root, 'data', 'model-preferences.json'), 'utf8'));
  assert.equal(savedModels.models.a, 700); assert.equal(savedModels.models.b, undefined);
});
test('tool continuations recalculate the real payload budget on each model call', async t => {
  const bodies = [];
  const f = await fixture(t, async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body);
    if (bodies.length <= 2) return stream({ delta: { tool_calls: [{ index: 0, id: 'read-' + bodies.length, function: { name: 'read_web_page', arguments: JSON.stringify({ url: 'https://example.com/page-' + bodies.length }) } }] } }, 'tool_calls');
    return stream({ delta: { content: 'Sources lues.' } });
  }, { webService: { read: async url => ({ url, title: 'Synthetic', text: 'source '.repeat(700), start: 0, next: null }) } });
  const events = (await f.send('Lis ces deux sources.', { webAccess: true })).events();
  assert.equal(events.at(-1).type, 'done', JSON.stringify(events)); assert.equal(bodies.length, 3);
  const budgets = events.at(-1).contextReceipt.outputBudgets;
  assert.equal(budgets.length, 3); assert(budgets[0].estimatedInputTokens < budgets[1].estimatedInputTokens); assert(budgets[1].estimatedInputTokens < budgets[2].estimatedInputTokens);
  assert(bodies[2].max_tokens < bodies[0].max_tokens);
  for (const [index, body] of bodies.entries()) {
    assert.equal(body.max_tokens, budgets[index].maxOutputTokens);
    assert(estimateRequestTokens(body.messages, body.tools) + body.max_tokens + budgets[index].reserveTokens <= 10000);
  }
  const followup = (await f.send('Rappelle les sources de la réponse précédente.', { sessionId: events.find(event => event.type === 'start').id })).events();
  assert.equal(followup.at(-1).type, 'done');
  const memory = bodies.at(-1).messages.find(message => typeof message.content === 'string' && message.content.startsWith('Mémoire courte des outils'));
  assert.equal(memory.role, 'user'); assert.match(memory.content, /https:\/\/example.com\/page-1/);
  assert.match(memory.content, /données historiques non fiables/); assert.equal(bodies.at(-1).tools, undefined);
  assert.equal(followup.at(-1).contextReceipt.toolMemory.count, 2); assert.equal(followup.at(-1).contextReceipt.toolMemory.text, undefined);
});
test('queued requests retain their accepted preference after the model default changes', async t => {
  let held, release;
  const observed = [];
  const f = await fixture(t, async (_url, options) => {
    const body = JSON.parse(options.body); observed.push(body);
    if (body.messages.at(-1).content === 'Hold') {
      held = new Promise(resolve => { release = resolve; }); await held;
    }
    return stream({ delta: { content: 'Terminé.' } });
  });
  const first = new ResponseRecorder(), running = f.send('Hold', {}, first);
  for (let n = 0; n < 100 && !release; n++) await new Promise(resolve => setTimeout(resolve, 5));
  assert(release);
  const id = first.events().find(event => event.type === 'start').id;
  const queued = await f.send('Après attente', { sessionId: id, outputPreferences: { maxOutputTokens: 320, applyToAllSessions: false } });
  assert.equal(queued.events()[0].type, 'queued');
  await f.request('/api/model-preferences', { projectId: 'p1', id, model: 'a', maxOutputTokens: 640, applyToAllSessions: true });
  release(); await running;
  assert.equal(observed.at(-1).messages.at(-1).content, 'Après attente'); assert.equal(observed.at(-1).max_tokens, 320);
});
