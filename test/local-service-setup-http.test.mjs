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
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-setup-http-')));
  let cookie, nonce, busy = false, controlled = false;
  const calls = [];
  const setupSnapshot = { canConfigure: true, revision: 'synthetic-revision', services: [{ id: 'bionic', profile: { cliPath: 'C:/synthetic/lms.exe' } }] };
  const localServiceSetup = {
    async snapshot() { calls.push('snapshot'); return structuredClone(setupSnapshot); },
    async discover(input) { calls.push('discover'); return { serviceId: input.serviceId, candidates: [] }; },
    async pick(input) { calls.push('pick'); return { serviceId: input.serviceId, cancelled: true, candidates: [] }; },
    async save(input) { calls.push('save'); return { saved: true, ...structuredClone(setupSnapshot) }; },
  };
  const supervisor = {
    snapshot: async () => ({ services: [{ id: 'bionic', configuration: { status: 'valid' }, process: { state: controlled ? 'running' : 'stopped' } }] }),
    reload: async () => { calls.push('reload'); return supervisor.snapshot(); },
    activeCount: () => Number(busy),
    assertAdmission() { if (busy) throw Object.assign(new Error('Synthetic operation active'), { status: 409, code: 'operation_active' }); },
    close: async () => {},
  };
  const app = await createCompanion({ root, localServiceSetup, localServiceSupervisor: supervisor, localServicePlatform: 'win32', enableUpdateScheduling: false,
    settings: { port: 8769, apiUrl: 'http://127.0.0.1:1235', bionicRoot: root, registryPath: path.join(root, 'registry.json'), extraRoots: [], python: 'python' },
    nativeStore: { listProjects: async () => [], listSessions: async () => [] },
    fetchImpl: async () => { throw new Error('Unexpected transport'); },
  });
  async function request(url, { body, headers = {}, remoteAddress = '127.0.0.1', stream, method = body === undefined && !stream ? 'GET' : 'POST', authenticated = true } = {}) {
    const req = stream || Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url, method, headers: { host: '127.0.0.1:8769', ...(authenticated && cookie ? { cookie } : {}), ...headers }, socket: { remoteAddress } });
    const res = new Response(); await app.handle(req, res); return res;
  }
  t.after(async () => { await app.close(); assert.equal(path.dirname(root), await fs.realpath(os.tmpdir())); assert.ok(path.basename(root).startsWith('bionic-setup-http-')); await fs.rm(root, { recursive: true, force: true }); });
  return { app, calls, request, setup: localServiceSetup, setBusy: value => { busy = value; }, setControlled: value => { controlled = value; },
    get headers() { return { origin: 'http://127.0.0.1:8769', 'x-local-service-csrf': nonce }; },
    async login() { const code = /Code d’accès : (.+)/.exec(await fs.readFile(path.join(root, 'ACCES-PRIVE.txt'), 'utf8'))[1].trim(); cookie = (await request('/api/login', { body: { code } })).headers['set-cookie'].split(';')[0]; nonce = (await request('/api/local-services')).json().csrfNonce; },
  };
}

test('setup paths require authentication, a nonce and loopback socket; proxy headers never confer local access', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/local-service-setup')).statusCode, 401);
  await f.login();
  assert.equal((await f.request('/api/local-service-setup')).statusCode, 403);
  assert.equal((await f.request('/api/local-service-setup', { headers: { ...f.headers, origin: 'http://foreign.invalid' } })).statusCode, 403);
  const phone = await f.request('/api/local-service-setup', { remoteAddress: '192.168.1.44', headers: { ...f.headers, 'x-forwarded-for': '127.0.0.1' } });
  assert.equal(phone.statusCode, 200);
  assert.equal(phone.json().canConfigure, false);
  assert.deepEqual(phone.json().services, []);
  assert.equal(JSON.stringify(phone.json()).includes('synthetic/lms'), false);
  assert.deepEqual(f.calls, []);
  const pc = await f.request('/api/local-service-setup', { remoteAddress: '::ffff:127.0.0.1', headers: f.headers });
  assert.equal(pc.statusCode, 200); assert.equal(pc.headers['cache-control'], 'no-store'); assert.equal(pc.json().canConfigure, true);
  assert.deepEqual(f.calls, ['snapshot']);
});

test('all setup effects require exact Origin, nonce and loopback; only explicit picker POST opens the picker', async t => {
  const f = await fixture(t); await f.login();
  for (const operation of ['discover', 'pick', 'save']) {
    const route = '/api/local-service-setup/' + operation;
    for (const input of [
      { headers: { 'x-local-service-csrf': f.headers['x-local-service-csrf'] } },
      { headers: { ...f.headers, 'x-local-service-csrf': 'wrong' } },
      { headers: f.headers, remoteAddress: '192.168.1.44' },
      { headers: { ...f.headers, origin: 'http://foreign.invalid' } },
      { headers: { ...f.headers, 'sec-fetch-site': 'cross-site' } },
    ]) assert.equal((await f.request(route, { body: { serviceId: 'bionic' }, ...input })).statusCode, 403);
  }
  assert.deepEqual(f.calls, []);
  assert.equal((await f.request('/api/local-service-setup/pick', { headers: f.headers })).statusCode, 403);
  assert.equal((await f.request('/api/local-service-setup/pick', { body: { serviceId: 'bionic' }, headers: f.headers })).statusCode, 200);
  assert.deepEqual(f.calls, ['pick']);
});

test('setup save rechecks admission after a slow body and cannot rewrite a currently controlled service', async t => {
  const f = await fixture(t); await f.login();
  let received, release;
  const started = new Promise(resolve => { received = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const stream = Readable.from((async function* () { received(); await gate; yield Buffer.from(JSON.stringify({ serviceId: 'bionic' })); })());
  const request = f.request('/api/local-service-setup/save', { stream, headers: f.headers });
  await started; f.setBusy(true); release();
  assert.equal((await request).statusCode, 409);
  assert.deepEqual(f.calls, []);
  f.setBusy(false); f.setControlled(true);
  const refused = await f.request('/api/local-service-setup/save', { body: { serviceId: 'bionic' }, headers: f.headers });
  assert.equal(refused.statusCode, 409); assert.equal(refused.json().code, 'setup-service-running'); assert.deepEqual(f.calls, []);
});

test('setup save holds the shared admission barrier until validation and reload finish, then releases it', async t => {
  const f = await fixture(t); await f.login();
  f.setup.save = async () => {
    f.calls.push('save');
    const competing = await f.request('/api/chat', { body: {} });
    assert.equal(competing.statusCode, 409);
    return { saved: true };
  };
  const saved = await f.request('/api/local-service-setup/save', { body: { serviceId: 'bionic' }, headers: f.headers });
  assert.equal(saved.statusCode, 200); assert.deepEqual(f.calls, ['save', 'reload']);
  const after = await f.request('/api/chat', { body: {} });
  assert.notEqual(after.statusCode, 409, 'the setup reservation must release after completion');
});
