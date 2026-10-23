import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createCompanion } from '../server.mjs';

class Response extends EventEmitter {
  constructor() { super(); this.headers = {}; this.parts = []; this.statusCode = 200; }
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; Object.entries(headers).forEach(([key, value]) => this.setHeader(key, value)); }
  write(value) { this.parts.push(String(value)); }
  end(value) { if (value) this.write(value); this.writableEnded = true; this.emit('finish'); }
  json() { return JSON.parse(this.parts.join('')); }
}
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-local-services-http-')));
  let cookie, effect = 0, release, pending = false, nonce;
  const supervisor = {
    snapshot: async () => ({ services: [{ id: 'bionic', revision: 'instance-1', configuration: { status: 'valid' } }] }),
    reload: async () => { effect++; return supervisor.snapshot(); },
    activeCount: () => Number(pending),
    assertAdmission() { if (pending) throw Object.assign(new Error('busy'), { status: 409, code: 'operation_active' }); },
    async action(id, input) { release = reserve({ id, action: input.action }); effect++; pending = true; return { id: 'op-1', status: 'accepted' }; },
    operation: async () => ({ id: 'op-1', status: pending ? 'running' : 'succeeded' }),
    close: async () => { pending = false; release?.(); }
  };
  let reserve;
  const app = await createCompanion({ root, settings: { port: 8769, apiUrl: 'http://127.0.0.1:1235', bionicRoot: root, registryPath: path.join(root, 'registry.json'), extraRoots: [], python: 'python' }, nativeStore: { listProjects: async () => [], listSessions: async () => [] }, fetchImpl: async () => { throw new Error('Unexpected transport'); }, localServiceSupervisorFactory: options => { reserve = options.reserve; return supervisor; } });
  const request = async (url, input, headers = {}) => {
    const req = Readable.from(input === undefined ? [] : [Buffer.from(JSON.stringify(input))]);
    Object.assign(req, { url, method: input === undefined ? 'GET' : 'POST', headers: { host: '127.0.0.1:8769', ...(cookie ? { cookie } : {}), ...headers }, socket: { remoteAddress: '127.0.0.1' } });
    const res = new Response(); await app.handle(req, res); return res;
  };
  t.after(async () => { await app.close(); assert.equal(path.dirname(root), await fs.realpath(os.tmpdir())); assert(path.basename(root).startsWith('bionic-local-services-http-')); await fs.rm(root, { recursive: true, force: true }); });
  return { app, request, get effects() { return effect; }, get headers() { return { origin: 'http://127.0.0.1:8769', 'x-local-service-csrf': nonce }; }, async login() { const code = /Code d’accès : (.+)/.exec(await fs.readFile(path.join(root, 'ACCES-PRIVE.txt'), 'utf8'))[1].trim(); cookie = (await request('/api/login', { code })).headers['set-cookie'].split(';')[0]; nonce = (await request('/api/local-services')).json().csrfNonce; } };
}

test('service routes require a session, exact Origin and a session nonce; GET has no process effect', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/local-services')).statusCode, 401);
  await f.login();
  const input = { action: 'start', expectedRevision: 'instance-1', idempotencyKey: 'fixture-key' };
  assert.equal((await f.request('/api/local-services/bionic/actions', input)).statusCode, 403);
  assert.equal((await f.request('/api/local-services/bionic/actions', input, { ...f.headers, origin: 'http://foreign.invalid' })).statusCode, 403);
  assert.equal((await f.request('/api/local-services/bionic/actions', input, { ...f.headers, 'x-local-service-csrf': 'wrong' })).statusCode, 403);
  const status = await f.request('/api/local-services');
  assert.equal(status.headers['cache-control'], 'no-store'); assert.equal(f.effects, 0);
  assert.equal((await f.request('/api/local-services/bionic/actions', input, f.headers)).statusCode, 202);
  assert.equal(f.effects, 1);
});

test('accepted operation blocks new generation/model work and is included in maintenance activity', async t => {
  const f = await fixture(t); await f.login();
  assert.equal((await f.request('/api/local-services/bionic/actions', { action: 'restart', expectedRevision: 'instance-1', idempotencyKey: 'fixture-key' }, f.headers)).statusCode, 202);
  assert.equal(f.app.activeWork().localServices, 1);
  assert.equal((await f.request('/api/chat', {})).statusCode, 409);
  assert.equal((await f.request('/api/models/unload', { instanceId: 'anything' })).statusCode, 409);
  assert.equal((await f.request('/api/comfy/settings', {})).statusCode, 409);
  assert.equal((await f.request('/api/security/actions', {})).statusCode, 409);
  assert.equal((await f.request('/api/local-services/configuration/reload', {}, f.headers)).statusCode, 409);
  assert.equal((await f.request('/api/local-service-operations/fixture-key')).json().status, 'running');
});

test('reload accepts no profile values from the browser and known active work refuses reservation', async t => {
  const f = await fixture(t); await f.login();
  assert.equal((await f.request('/api/local-services/configuration/reload', { cliPath: 'ignored' }, f.headers)).statusCode, 400);
  assert.equal(f.effects, 0);
  const release = await f.app.coordinator.acquire('text');
  // Existing model admission is not represented by a file/profile value.
  f.app.chatStates.set('fixture', { chat: { queue: [{ status: 'queued' }] } });
  assert.equal((await f.request('/api/local-services/bionic/actions', { action: 'stop' }, f.headers)).statusCode, 409);
  f.app.chatStates.delete('fixture'); release();
  assert.equal(f.effects, 0);
});
