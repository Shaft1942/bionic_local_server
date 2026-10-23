import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createCompanion } from '../server.mjs';

class Response extends EventEmitter {
  constructor() { super(); this.parts = []; this.headers = {}; this.statusCode = 200; }
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.headers[key.toLowerCase()] = value; }
  write(value) { this.parts.push(String(value)); return true; }
  end(value) { if (value) this.write(value); this.writableEnded = true; this.emit('finish'); }
  json() { return JSON.parse(this.parts.join('')); }
}
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-local-http-')));
  let offline = false, cookie, app;
  const settings = { port: 8769, apiUrl: 'http://127.0.0.1:1235', bionicRoot: root, registryPath: path.join(root, 'registry.json'), extraRoots: [], python: 'python' };
  const nativeStore = { listProjects: async () => { if (offline) throw Error('source absent'); return [{ id: 'p', name: 'Projet natif' }]; }, listSessions: async () => { if (offline) throw Error('source absent'); return []; }, getConversation: async () => { throw Error('native read must not be called'); } };
  const start = async () => { app = await createCompanion({ root, settings, nativeStore, maxCachedConversations: 2 }); return app; };
  await start();
  async function request(url, input, headers = {}) {
    const req = Readable.from(input === undefined ? [] : [Buffer.from(JSON.stringify(input))]);
    Object.assign(req, { url, method: input === undefined ? 'GET' : 'POST', headers: { host: '127.0.0.1:8769', ...(cookie ? { cookie } : {}), ...headers }, socket: { remoteAddress: '127.0.0.1' } });
    const res = new Response(); await app.handle(req, res); return res;
  }
  const login = async () => { const code = /Code d’accès : (.+)/.exec(await fs.readFile(path.join(root, 'ACCES-PRIVE.txt'), 'utf8'))[1].trim(); cookie = (await request('/api/login', { code })).headers['set-cookie'].split(';')[0]; };
  t.after(async () => { await app.close(); assert.equal(path.dirname(root), await fs.realpath(os.tmpdir())); assert(path.basename(root).startsWith('bionic-local-http-')); await fs.rm(root, { recursive: true, force: true }); });
  return { root, request, login, get app() { return app; }, offline: () => { offline = true; }, restart: async () => { await app.close(); await start(); cookie = undefined; await login(); } };
}

test('local project routes enforce authentication and origins; local chat stays readable with native catalog absent', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/local-projects', { name: 'No auth' })).statusCode, 401);
  await f.login();
  assert.equal((await f.request('/api/local-projects', { name: 'Bad origin' }, { origin: 'http://foreign.invalid' })).statusCode, 403);
  const created = await f.request('/api/local-projects', { name: 'Projet autonome' });
  assert.equal(created.statusCode, 201);
  const project = created.json().project;
  const id = 'web-' + randomUUID(), chat = { id, projectId: project.id, name: 'Historique local', messages: [{ id: 'm1', role: 'user', text: 'Synthetic only' }] };
  await f.app.persistChat(chat);
  f.offline();
  const result = await f.request('/api/conversation?' + new URLSearchParams({ projectId: project.id, id }));
  assert.equal(result.statusCode, 200); assert.equal(result.json().messages[0].text, 'Synthetic only');
  const projects = (await f.request('/api/projects')).json();
  assert(projects.projects.some(item => item.id === project.id)); assert.equal(projects.nativeUnavailable, true);
  await f.restart();
  assert.equal((await f.request('/api/conversation?' + new URLSearchParams({ projectId: project.id, id }))).statusCode, 200);
});

test('indexed sessions bound idle cache and paginate history with stable message cursors', async t => {
  const f = await fixture(t); await f.login();
  const ids = [];
  for (let i = 0; i < 6; i++) {
    const id = 'web-' + randomUUID(); ids.push(id);
    await f.app.persistChat({ id, projectId: 'p', name: 'Chat ' + i, updatedAt: i, messages: Array.from({ length: 7 }, (_, j) => ({ id: 'm' + j, role: j % 2 ? 'assistant' : 'user', text: 'Fixture ' + j })) });
  }
  const first = (await f.request('/api/sessions?projectId=p&limit=2')).json();
  assert.equal(first.sessions.length, 2); assert.equal(first.hasMore, true);
  const second = (await f.request('/api/sessions?' + new URLSearchParams({ projectId: 'p', limit: '2', cursor: first.nextCursor }))).json();
  assert.equal(second.sessions.length, 2); assert.notEqual(second.sessions[0].id, first.sessions[0].id);
  assert(f.app.chatStates.size <= 2);
  let releaseCycle, began;
  const held = new Promise(resolve => { releaseCycle = resolve; }), started = new Promise(resolve => { began = resolve; });
  const longCycle = f.app.withScanCycle(async () => { const chat = await f.app.readWeb(ids[0]); began(); await held; assert.equal(f.app.chatStates.get(ids[0]).chat, chat); });
  await started;
  try { await f.app.withScanCycle(() => f.app.webChats('p')); assert(f.app.chatStates.size <= 2); assert(f.app.chatStates.has(ids[0])); }
  finally { releaseCycle(); await longCycle; }
  const chat = (await f.request('/api/conversation?' + new URLSearchParams({ projectId: 'p', id: ids[0], limit: '3' }))).json();
  assert.deepEqual(chat.messages.map(item => item.id), ['m4', 'm5', 'm6']);
  const older = (await f.request('/api/conversation?' + new URLSearchParams({ projectId: 'p', id: ids[0], limit: '3', before: chat.pagination.nextCursor }))).json();
  assert.deepEqual(older.messages.map(item => item.id), ['m1', 'm2', 'm3']);
  assert.equal((await f.request('/api/conversation?' + new URLSearchParams({ projectId: 'p', id: ids[0], limit: '0' }))).statusCode, 400);
});

test('interface localization assets use the closed HTTP allowlist with JavaScript MIME', async t => {
  const f = await fixture(t), directory = path.join(f.root, 'public');
  await fs.mkdir(path.join(directory, 'locales', 'en'), { recursive: true });
  await fs.writeFile(path.join(directory, 'i18n.js'), 'globalThis.syntheticLanguage = true;');
  await fs.writeFile(path.join(directory, 'locales', 'en', 'app.js'), '// Synthetic English catalog');
  for (const asset of ['/i18n.js', '/locales/en/app.js']) {
    const result = await f.request(asset);
    assert.equal(result.statusCode, 200);
    assert.match(result.headers['content-type'], /^text\/javascript/);
  }
  assert.equal((await f.request('/locales/unlisted/app.js')).statusCode, 404);
  assert.equal((await f.request('/locales/en/../../private.js')).statusCode, 404);
});
