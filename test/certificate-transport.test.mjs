import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { createCompanion } from '../server.mjs';
import { startCertificateTransport } from '../lib/certificate-transport.mjs';
import { createAuthority, issueClient, issueServer } from '../lib/certificate-pki.mjs';
import { resetLocalInstallation } from '../scripts/certificates.mjs';

const passphrase = 'Synthetic-Device-Password-28';
function request({ port, route = '/api/ping', secure = false, ca, pfx, cert, key, method = 'GET', body, headers = {}, servername, agent = false, session }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = (secure ? https : http).request({ hostname: '127.0.0.1', port, path: route, method, ca, pfx, cert, key, passphrase, servername, session, rejectUnauthorized: true, agent,
      headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers } }, res => {
      const socket = res.socket, tlsSession = socket.getSession?.(), reused = socket.isSessionReused?.();
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString(), socket, tlsSession, reused, json() { return JSON.parse(this.text); } }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('Synthetic request timeout'))); req.once('error', reject); req.end(payload);
  });
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-cert-transport-'));
  let app, transport;
  const options = { root, settings: { port: 0, apiUrl: 'http://127.0.0.1:1235', bionicRoot: root, registryPath: path.join(root, 'registry.json'), extraRoots: [], python: 'python', comfyEnabled: false },
    fetchImpl: async () => { throw Error('No live API calls permitted'); },
    nativeStore: { listProjects: async () => [], listSessions: async () => [] },
    updateService: { start() {}, stop() {}, status: () => ({ enabled: false }) },
  };
  const start = async () => { app = await createCompanion(options); transport = await startCertificateTransport({ app, root, host: '127.0.0.1', port: 0 }); };
  await start();
  t.after(async () => { await app?.close(); await fs.rm(root, { recursive: true, force: true }); });
  return {
    root, get app() { return app; }, get transport() { return transport; },
    async restart() { await app.close(); await start(); },
    async code() { return /Code d’accès : (.+)/.exec(await fs.readFile(path.join(root, 'ACCES-PRIVE.txt'), 'utf8'))[1].trim(); },
    async ca() { const state = app.certificateStore.state; return fs.readFile(path.join(app.certificateStore.directory, state.authority.certFile)); },
    async admin(action, extra = {}) { return request({ port: transport.adminPort, route: '/api/admin/certificates/action', method: 'POST', body: { token: app.config.adminToken, action, ...extra } }); },
    async prepare(mode, hosts = ['127.0.0.1', 'localhost']) { const response = await this.admin('prepare', { mode, hosts }); assert.equal(response.status, 200, response.text); return response.json(); },
    async confirm(prepared, device) {
      const proof = new URL(prepared.proofUrl), ca = await this.ca();
      const loaded = await request({ port: Number(proof.port), route: proof.pathname + proof.search, secure: true, ca, pfx: device, servername: proof.hostname === '127.0.0.1' ? undefined : proof.hostname, headers: { Host: proof.host } }); assert.equal(loaded.status, 200, loaded.text);
      const confirmed = await request({ port: Number(proof.port), route: proof.pathname, secure: true, ca, pfx: device, servername: proof.hostname === '127.0.0.1' ? undefined : proof.hostname, method: 'POST', body: new URLSearchParams({ ticket: proof.searchParams.get('ticket') }).toString(), headers: { Host: proof.host, Origin: proof.origin, 'Content-Type': 'application/x-www-form-urlencoded' } });
      assert.equal(confirmed.status, 200, confirmed.text);
    },
  };
}

test('real TLS: staged proof, HTTPS cookies, legacy closure, maintenance isolation and restart', { timeout: 90000 }, async t => {
  const f = await fixture(t);
  const original = await request({ port: f.transport.appPort, route: '/api/login', method: 'POST', body: { code: await f.code() } });
  assert.equal(original.status, 200); assert.doesNotMatch(original.headers['set-cookie'][0], /Secure/);
  const cookie = original.headers['set-cookie'][0].split(';')[0];
  assert.equal((await request({ port: f.transport.appPort, route: '/api/security/status' })).status, 401);
  const prepared = await f.prepare('https'), ca = await f.ca(), proof = new URL(prepared.proofUrl);
  assert.equal(f.app.certificateStore.state.mode, 'http');
  assert.equal((await request({ port: f.transport.appPort, route: '/api/security/status', headers: { Cookie: cookie } })).status, 200);
  assert.equal((await request({ port: Number(proof.port), secure: true, ca, route: '/api/login' })).status, 404);
  const pending = (await f.admin('status')).json(); assert.equal(pending.candidate.mode, 'https'); assert.ok(!JSON.stringify(pending).includes(proof.searchParams.get('ticket')));
  assert.equal((await request({ port: Number(proof.port), secure: true, ca, route: proof.pathname + '?ticket=invalid' })).status, 403);
  assert.equal((await request({ port: Number(proof.port), secure: true, ca, route: proof.pathname, method: 'POST', headers: { Origin: 'https://foreign.invalid' }, body: { ticket: proof.searchParams.get('ticket') } })).status, 403);
  await assert.rejects(request({ port: Number(proof.port), secure: true, ca, servername: 'wrong.invalid', route: proof.pathname + proof.search }), /altname|certificate/i);
  const foreign = await createAuthority({ name: 'Foreign synthetic installation' });
  await assert.rejects(request({ port: Number(proof.port), secure: true, ca: foreign.cert, route: proof.pathname + proof.search }), /certificate|issuer|self.signed/i);
  await f.confirm(prepared);
  assert.equal(f.app.certificateStore.state.mode, 'https');
  await assert.rejects(request({ port: f.transport.appPort }), /reset|hang up|socket|parse/i);
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca, route: '/api/security/status', headers: { Cookie: cookie } })).status, 401);
  const login = await request({ port: f.transport.appPort, secure: true, ca, route: '/api/login', method: 'POST', body: { code: await f.code() }, headers: { Origin: `https://127.0.0.1:${f.transport.appPort}` } });
  assert.equal(login.status, 200, login.text); assert.match(login.headers['set-cookie'][0], /; Secure/);
  const secureCookie = login.headers['set-cookie'][0].split(';')[0];
  const state = await request({ port: f.transport.appPort, secure: true, ca, route: '/api/security/status', headers: { Cookie: secureCookie } });
  assert.equal(state.status, 200); assert.equal(state.json().mode, 'https'); assert.ok(!state.text.includes('PRIVATE KEY'));
  assert.equal((await request({ port: f.transport.adminPort, route: '/' })).status, 404);
  assert.equal((await request({ port: f.transport.adminPort, route: '/api/login', method: 'POST', body: { code: await f.code() } })).status, 404);
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca, route: '/api/admin/certificates/action', method: 'POST', body: { token: f.app.config.adminToken, action: 'status' } })).status, 403);
  await f.restart();
  assert.equal(f.app.certificateStore.state.mode, 'https');
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca })).status, 200);
  assert.equal((await f.admin('prepare', { mode: 'http', hosts: ['127.0.0.1'] })).status, 400);
});

test('real mTLS: registered devices, unknown peers, cookie binding, targeted revocation and renewal', { timeout: 120000 }, async t => {
  const f = await fixture(t);
  await f.confirm(await f.prepare('https'));
  const { pfx: deviceA, device: identityA } = await f.app.certificateStore.issueDevice({ name: 'Synthetic A', passphrase });
  const { pfx: deviceB } = await f.app.certificateStore.issueDevice({ name: 'Synthetic B', passphrase });
  const prepared = await f.prepare('mtls'), ca = await f.ca(), proof = new URL(prepared.proofUrl);
  await assert.rejects(request({ port: Number(proof.port), secure: true, ca, route: proof.pathname + proof.search }), /certificate|alert|socket|reset|hang up/i);
  await f.confirm(prepared, deviceA);
  assert.equal(f.app.certificateStore.state.mode, 'mtls');
  await assert.rejects(request({ port: f.transport.appPort, secure: true, ca }), /certificate|alert|socket|reset|hang up/i);
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca, pfx: deviceA })).status, 200);
  const authority = await f.app.certificateStore.ensureAuthority();
  const unregistered = await issueClient({ authority, name: 'Not registered', passphrase });
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca, cert: unregistered.cert, key: unregistered.key })).status, 403);
  const alienCa = await createAuthority({ name: 'Another installation' });
  const alien = await issueClient({ authority: alienCa, name: 'Other device', passphrase });
  await assert.rejects(request({ port: f.transport.appPort, secure: true, ca, cert: alien.cert, key: alien.key }), /certificate|alert|socket|reset|hang up/i);
  const login = await request({ port: f.transport.appPort, secure: true, ca, pfx: deviceA, route: '/api/login', method: 'POST', body: { code: await f.code() } });
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca, pfx: deviceA, route: '/api/security/status', headers: { Cookie: cookie } })).status, 200);
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca, pfx: deviceB, route: '/api/security/status', headers: { Cookie: cookie } })).status, 401);
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1, ca, pfx: deviceA, passphrase }); t.after(() => agent.destroy());
  const held = await request({ port: f.transport.appPort, secure: true, ca, pfx: deviceA, agent });
  const closed = new Promise(resolve => held.socket.once('close', resolve));
  assert.equal((await f.admin('revoke-device', { id: identityA.id })).status, 200);
  await closed; assert.equal(held.socket.destroyed, true);
  const resumed = await request({ port: f.transport.appPort, secure: true, ca, pfx: deviceA, session: held.tlsSession });
  assert.equal(resumed.status, 403); assert.equal(resumed.reused, false);
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca, pfx: deviceA, route: '/api/login', method: 'POST', body: { code: await f.code() } })).status, 403);
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca, pfx: deviceB })).status, 200);
  const oldFingerprint = f.app.certificateStore.state.server.fingerprint;
  await f.confirm(await f.prepare('mtls', ['new-address.local', '127.0.0.1']), deviceB);
  assert.notEqual(f.app.certificateStore.state.server.fingerprint, oldFingerprint);
  assert.equal(f.app.certificateStore.state.mode, 'mtls');
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca, pfx: deviceB, servername: 'new-address.local', headers: { Host: `new-address.local:${f.transport.appPort}` } })).status, 200);
  assert.equal((await f.admin('prepare', { mode: 'https', hosts: ['127.0.0.1'] })).status, 400);
  await f.restart();
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca, pfx: deviceA })).status, 403);
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca, pfx: deviceB })).status, 200);
});

test('maintenance rejects secret operations over HTTP and missing/wrong tokens', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  for (const token of [undefined, 'incorrect']) assert.equal((await request({ port: f.transport.adminPort, route: '/api/admin/certificates/action', method: 'POST', body: { token, action: 'status' } })).status, 403);
  for (const action of ['issue-device', 'reset', 'downgrade']) assert.equal((await f.admin(action, { name: 'No export', passphrase })).status, 400);
  const result = await f.admin('status'); assert.equal(result.status, 200); assert.ok(!result.text.includes(passphrase));
});

test('closing while certificate preparation waits never opens a new listener afterwards', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  const original = f.app.certificateStore.prepareServer;
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  f.app.certificateStore.prepareServer = async input => { started(); await gate; return original(input); };
  const preparing = f.transport.action({ action: 'prepare', mode: 'https', hosts: ['127.0.0.1'] });
  const rejected = assert.rejects(preparing, /arrête/);
  await entered;
  const closing = f.transport.close(); release();
  await Promise.all([closing, rejected]);
  assert.equal(f.transport.appServer.listening, false);
  assert.equal(f.transport.adminPort, undefined);
  await assert.rejects(fs.readFile(path.join(f.root, 'runtime', 'transport.json')), { code: 'ENOENT' });
});

test('local reset rotates cookie namespace and HTTP remains usable with an old Secure cookie', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  await f.confirm(await f.prepare('https'));
  const before = await request({ port: f.transport.appPort, secure: true, ca: await f.ca(), route: '/api/login', method: 'POST', body: { code: await f.code() } });
  const oldCookie = before.headers['set-cookie'][0].split(';')[0]; assert.match(oldCookie, /^__Host-/);
  const oldEpoch = f.app.certificateStore.state.epoch, oldPort = f.transport.appPort;
  await f.app.close();
  await resetLocalInstallation({ root: f.root, port: oldPort });
  await f.restart();
  assert.equal(f.app.certificateStore.state.mode, 'http'); assert.notEqual(f.app.certificateStore.state.epoch, oldEpoch);
  const after = await request({ port: f.transport.appPort, route: '/api/login', method: 'POST', headers: { Cookie: oldCookie }, body: { code: await f.code() } });
  assert.equal(after.status, 200); const newCookie = after.headers['set-cookie'][0].split(';')[0];
  assert.notEqual(newCookie.split('=')[0], oldCookie.split('=')[0]); assert.doesNotMatch(after.headers['set-cookie'][0], /; Secure/);
  assert.equal((await request({ port: f.transport.appPort, route: '/api/security/status', headers: { Cookie: oldCookie + '; ' + newCookie } })).status, 200);
});

test('expired server stays HTTPS and can renew only through the local staged proof', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  await f.confirm(await f.prepare('https'));
  await f.app.close();
  const directory = path.join(f.root, 'data/security'), stateFile = path.join(directory, 'state.json');
  const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
  const authority = await createAuthority({ name: 'Synthetic expired certificate fixture', now: Date.now() - 10 * 86400000 });
  const server = await issueServer({ authority, hosts: ['127.0.0.1', 'localhost'], now: Date.now() - 5 * 86400000, days: 1 });
  for (const [type, identity] of [['authority', authority], ['server', server]]) {
    const metadata = { fingerprint: identity.fingerprint, notBefore: identity.notBefore, expiresAt: identity.expiresAt, keyFile: `${type}-${identity.fingerprint}.key`, certFile: `${type}-${identity.fingerprint}.crt`, ...(type === 'server' ? { hosts: ['127.0.0.1', 'localhost'] } : {}) };
    await fs.writeFile(path.join(directory, metadata.keyFile), identity.key); await fs.writeFile(path.join(directory, metadata.certFile), identity.cert); state[type] = metadata;
  }
  await fs.writeFile(stateFile, JSON.stringify(state));
  await f.restart();
  assert.equal(f.app.certificateStore.state.mode, 'https'); assert.equal((await f.admin('status')).status, 200);
  await assert.rejects(request({ port: f.transport.appPort, secure: true, ca: authority.cert }), /expired/i);
  await assert.rejects(request({ port: f.transport.appPort }), /reset|hang up|socket|parse/i);
  await f.confirm(await f.prepare('https'));
  assert.equal((await request({ port: f.transport.appPort, secure: true, ca: authority.cert })).status, 200);
});
