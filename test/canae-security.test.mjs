import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { createPrototype } from '../lib/llama-ui-prototype.mjs';
import { createCertificateWeb } from '../lib/certificate-web.mjs';
import { startCertificateTransport } from '../lib/certificate-transport.mjs';

function request(base, route, { body, headers = {}, ...options } = {}) {
  const url = new URL(route, base), payload = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(url, { ...options, agent: false, method: payload === null ? 'GET' : 'POST', headers: { ...(payload === null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }), ...headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => { const bytes = Buffer.concat(chunks); resolve({ status: res.statusCode, headers: res.headers, bytes, text: bytes.toString(), json() { return JSON.parse(this.text); } }); });
    });
    req.setTimeout(8000, () => req.destroy(Error('Isolated security request timeout'))); req.once('error', reject); req.end(payload);
  });
}
async function login(f, options = {}) {
  const authenticated = await request(f.baseUrl, '/api/login', { ...options, body: { code: f.code }, headers: { Origin: f.baseUrl } });
  assert.equal(authenticated.status, 200, authenticated.text);
  const cookie = authenticated.headers['set-cookie'][0].split(';')[0];
  const status = await request(f.baseUrl, '/api/security/status', { ...options, headers: { Cookie: cookie } }); assert.equal(status.status, 200, status.text);
  const headers = { Cookie: cookie, Origin: f.baseUrl, 'X-Bionic-CSRF': status.json().web.csrfToken };
  return { status: status.json(), cookie, options, request: (route, params = {}) => request(f.baseUrl, route, { ...options, headers, ...params }) };
}
async function confirm(f, session, mode, tlsOptions = {}) {
  const response = await session.request('/api/security/actions', { body: { action: 'prepare', mode, hosts: ['127.0.0.1', 'localhost'], candidatePort: 0 } });
  assert.equal(response.status, 200, response.text); const prepared = response.json();
  assert.equal(prepared.status.candidate.fingerprint, prepared.serverFingerprint);
  assert.deepEqual(prepared.status.candidate.hosts, ['127.0.0.1', 'localhost']);
  assert.equal(prepared.status.candidate.port, Number(new URL(prepared.candidateUrl).port));
  assert(!JSON.stringify(prepared).includes('?ticket='));
  const authority = await session.request('/api/security/authority'); assert.equal(authority.status, 200);
  const ca = new X509Certificate(authority.bytes).toString(); assert(new X509Certificate(ca).ca);
  const second = await login(f, session.options);
  assert.equal(second.status.web.proofRequest, null);
  const body = new URLSearchParams({ proofId: prepared.proofRequest.id, csrfToken: second.status.web.csrfToken }).toString();
  assert.equal((await second.request('/api/security/proof', { body, headers: { Cookie: second.cookie, Origin: f.baseUrl, 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 409);
  const bridge = await session.request('/api/security/proof', { body: new URLSearchParams({ proofId: prepared.proofRequest.id, csrfToken: session.status.web.csrfToken }).toString(), headers: { Cookie: session.cookie, Origin: f.baseUrl, 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(bridge.status, 200, bridge.text);
  const target = /action="([^"]+)"/.exec(bridge.text)[1], ticket = /name="ticket" value="([^"]+)"/.exec(bridge.text)[1];
  assert.equal(new URL(target).search, '');
  const opened = await request(target, '/__certificates/start', { ca, ...tlsOptions, body: new URLSearchParams({ ticket }).toString(), headers: { Origin: f.baseUrl, 'Content-Type': 'application/x-www-form-urlencoded' } }); assert.equal(opened.status, 200, opened.text);
  assert.equal(f.app.certificateStore.state.mode, session.status.mode);
  const activated = await request(target, '/__certificates/confirm', { ca, ...tlsOptions, body: new URLSearchParams({ ticket }).toString(), headers: { Origin: new URL(target).origin, 'Content-Type': 'application/x-www-form-urlencoded' } }); assert.equal(activated.status, 200, activated.text);
  return ca;
}

test('prototype requires a real opt-in transport, preserving read-only truth without it', { timeout: 30000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canae-readonly-'));
  const f = await createPrototype({ root, port: 0 });
  t.after(async () => { await f.app.close(); await fs.rm(root, { recursive: true, force: true }); });
  const session = await login(f);
  assert.equal(session.status.web.canConfigure, false); assert.equal(session.status.web.canIssueDevice, false);
  const document = await request(f.baseUrl, '/'); assert.equal(document.status, 200);
  assert.equal(document.headers['referrer-policy'], 'strict-origin', 'The canonical page keeps the same-origin certificate proof');
  for (const route of ['/prototype/', '/llama-ui/index.html']) {
    const redirect = await request(f.baseUrl, route); assert.equal(redirect.status, 308);assert.equal(redirect.headers.location,'/');
  }
  assert.equal((await session.request('/api/security/actions', { body: { action: 'prepare', mode: 'https', hosts: ['127.0.0.1'] } })).status, 503);
  assert.equal(f.stats.externalCalls, 0);
});

test('isolated transport can explicitly suppress update scheduling', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canae-no-updates-'));
  const f = await createPrototype({ root, port: 0, listen: false });
  t.after(async () => { await f.app.close(); await fs.rm(root, { recursive: true, force: true }); });
  let starts = 0; f.app.updater.start = () => { starts++; };
  await startCertificateTransport({ app: f.app, root, host: '127.0.0.1', port: 0, proofPort: 0, startUpdates: false });
  assert.equal(starts, 0); assert.equal(f.app.certificateStore.state.mode, 'http');
});

test('Windows network marker qualifies the actual candidate port, never a different configured port', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canae-proof-marker-'));
  t.after(() => fs.rm(root, { recursive: true, force: true })); await fs.mkdir(path.join(root, 'runtime'));
  const state = { mode: 'http', epoch: 'fixture', devices: [], candidate: null };
  const store = { state, publicStatus: () => structuredClone(state) }, controller = { appPort: 8774, proofPort: 8775, status: store.publicStatus };
  const web = createCertificateWeb({ store, transport: () => controller, root, instanceId: 'fixture', platform: 'win32', networkInterfaces: () => ({ Fixture: [{ family: 'IPv4', address: '192.168.50.5', cidr: '192.168.50.5/24' }] }) });
  t.after(() => web.clear());
  await fs.writeFile(path.join(root, 'runtime/certificate-network.json'), JSON.stringify({ version: 1, instanceId: 'fixture', appPort: 8774, proofPort: 8775, provisionedAt: new Date().toISOString(), program: process.execPath, interfaceAlias: 'Fixture', localAddress: '192.168.50.5', prefixLength: 24, remoteSubnet: '192.168.50.0/24' }));
  const req = { socket: {}, headers: { host: '127.0.0.1:8774' } }, session = {};
  assert.equal((await web.status(req, session)).web.proofPortProvisioned, true);
  state.candidate = { port: 8870 };
  const status = await web.status(req, session); assert.equal(status.web.proofPort, 8870); assert.equal(status.web.proofPortProvisioned, false);
});

test('Canaé real transport: collision recovery, web proof, one-use device export, mTLS and restart without downgrade', { timeout: 120000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canae-security-'));
  const occupied = http.createServer((_req, res) => res.end('Synthetic occupied port'));
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  let f = await createPrototype({ root, port: 0, certificateTransport: true, proofPort: occupied.address().port });
  t.after(async () => { await f?.app.close(); await new Promise(resolve => occupied.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  const initial = await login(f); assert.equal(initial.status.web.canConfigure, true); assert.equal(initial.status.web.canIssueDevice, false);
  assert.equal(initial.status.mode, 'http'); assert.equal(f.app.certificateStore.state.authority, null);
  assert.equal((await initial.request('/api/security/actions', { body: { action: 'issue-device', name: 'HTTP must refuse' } })).status, 403);
  assert.equal((await initial.request('/api/security/actions', { body: { action: 'prepare', mode: 'https', hosts: ['127.0.0.1'] } })).status, 409);
  assert.equal((await initial.request('/api/security/status')).json().mode, 'http');
  assert.equal((await request('http://127.0.0.1:' + f.transport.adminPort, '/')).status, 404);
  for (const candidatePort of [-1, 65536, '443', 1.5]) assert.equal((await initial.request('/api/security/actions', { body: { action: 'prepare', mode: 'https', hosts: ['127.0.0.1'], candidatePort } })).status, 400);
  const pending = await initial.request('/api/security/actions', { body: { action: 'prepare', mode: 'https', hosts: ['127.0.0.1'], candidatePort: 0 } }); assert.equal(pending.status, 200, pending.text);
  assert.equal((await initial.request('/api/security/actions', { body: { action: 'cancel-preparation' } })).status, 200);
  assert.equal((await initial.request('/api/security/status')).json().candidate, null);
  const httpBase = f.baseUrl, ca = await confirm(f, initial, 'https');
  assert.equal(f.app.certificateStore.state.mode, 'https');
  await assert.rejects(request(httpBase, '/api/ping'), /reset|hang up|socket|parse/i);
  assert.equal((await request(f.baseUrl, '/api/security/status', { ca, headers: { Cookie: initial.cookie } })).status, 401);
  const secure = await login(f, { ca }); assert.equal(secure.status.web.canIssueDevice, true);
  const issue = await secure.request('/api/security/actions', { body: { action: 'issue-device', name: 'Synthetic browser' } }); assert.equal(issue.status, 200, issue.text); const issued = issue.json();
  const second = await login(f, { ca }); assert.equal((await second.request('/api/security/device-download', { body: { exportId: issued.exportId } })).status, 404);
  const downloaded = await secure.request('/api/security/device-download', { body: { exportId: issued.exportId } }); assert.equal(downloaded.status, 200);
  assert.doesNotThrow(() => tls.createSecureContext({ pfx: downloaded.bytes, passphrase: issued.passphrase }));
  assert.equal((await secure.request('/api/security/device-download', { body: { exportId: issued.exportId } })).status, 404);
  const renewed = await secure.request('/api/security/actions', { body: { action: 'issue-device', previousId: issued.device.id } }); assert.equal(renewed.status, 200, renewed.text);
  assert.equal(f.app.certificateStore.state.devices.find(item => item.id === issued.device.id).revokedAt, null);
  const tlsOptions = { ca, pfx: downloaded.bytes, passphrase: issued.passphrase };
  await confirm(f, secure, 'mtls', tlsOptions);
  await assert.rejects(request(f.baseUrl, '/api/ping', { ca }), /certificate|alert|socket|reset|hang up/i);
  const client = await login(f, tlsOptions); assert.equal(client.status.web.currentDeviceId, issued.device.id);
  assert.equal((await client.request('/api/security/actions', { body: { action: 'revoke-device', id: issued.device.id, confirmName: issued.device.name } })).status, 409);
  assert.equal((await client.request('/api/security/actions', { body: { action: 'revoke-device', id: renewed.json().device.id, confirmName: issued.device.name } })).status, 200);
  assert.equal((await client.request('/api/security/actions', { body: { action: 'prepare', mode: 'https', hosts: ['127.0.0.1'], candidatePort: 0 } })).status, 400);
  const publicState = JSON.stringify((await client.request('/api/security/status')).json()); assert(!publicState.includes(issued.passphrase)); assert(!publicState.includes('PRIVATE KEY'));
  assert(!(await fs.readdir(path.join(root, 'data/security'))).some(name => name.endsWith('.p12')));
  await f.app.close(); f = await createPrototype({ root, port: 0, certificateTransport: true });
  assert.equal(f.app.certificateStore.state.mode, 'mtls'); assert.equal((await login(f, tlsOptions)).status.mode, 'mtls');
  assert.equal(f.stats.externalCalls, 0);
});
