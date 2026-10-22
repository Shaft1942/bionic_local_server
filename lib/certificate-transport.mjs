import http from 'node:http';
import https from 'node:https';
import { constants, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { receiveBody } from './request-body.mjs';

export const CERTIFICATE_TRANSPORT_CAPABILITY = 1;
const modes = { http: 0, https: 1, mtls: 2 };
const fail = (status, message) => Object.assign(new Error(message), { status });
const loopback = ip => /^(?:127\.|::1$|::ffff:127\.)/.test(ip || '');
const local = ip => loopback(ip) || /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(String(ip || '').replace(/^::ffff:/, ''));
const normalized = value => String(value || '').replaceAll(':', '').toLowerCase();
const advertisedHost = hosts => hosts.find(host => !['127.0.0.1', 'localhost', '::1'].includes(host)) || hosts[0];
const hostUrl = host => host.includes(':') ? '[' + host + ']' : host;
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function clientFingerprint(socket) { return normalized(socket?.getPeerCertificate?.()?.fingerprint256); }
export function requireCertificateTransport(req, store) {
  if (req.companionMaintenance === true) return;
  const state = store.state;
  if (state.mode !== 'http' && !req.socket.encrypted) throw fail(403, 'Une connexion HTTPS est obligatoire.');
  if (state.mode !== 'http' && [state.authority, state.server].some(item => !item || Date.parse(item.expiresAt) <= Date.now() || Date.parse(item.notBefore) > Date.now())) throw fail(503, 'Le certificat serveur doit être renouvelé depuis Certificats.cmd sur le PC.');
  if (state.mode === 'mtls' && (!req.socket.authorized || !store.isDeviceAllowed(clientFingerprint(req.socket)))) throw fail(403, 'Un certificat client autorisé est obligatoire.');
}
function reply(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = error => { server.off('listening', onListen); reject(error); };
    const onListen = () => { server.off('error', onError); resolve(server.address().port); };
    server.once('error', onError); server.once('listening', onListen); server.listen(port, host);
  });
}
async function shut(server) {
  if (!server?.listening) return;
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}

/** Only called by the local production entry point or isolated TLS tests. */
export async function startCertificateTransport({ app, root, host = '0.0.0.0', port = app.settings.port, proofPort = app.settings.certificateProofPort ?? (app.settings.port ? (app.settings.port < 65535 ? app.settings.port + 1 : app.settings.port - 1) : 0), adminPort = 0, now = () => Date.now() }) {
  const store = app.certificateStore;
  let network, maintenance, candidate, preparation, closing = false, closePromise, mutation = Promise.resolve();
  const sockets = new Map();
  const runtimeFile = path.join(root, 'runtime', 'transport.json');
  const serial = work => { const result = mutation.then(() => { if (closing) throw fail(503, 'Le serveur s’arrête.'); return work(); }); mutation = result.catch(() => {}); return result; };
  const tlsOptions = async (isCandidate, mode) => ({
    ...await store.tlsOptions({ candidate: isCandidate, mode }),
    minVersion: 'TLSv1.2', sessionTimeout: 1, secureOptions: constants.SSL_OP_NO_TICKET,
  });
  function track(server) {
    server.requestTimeout = app.settings.requestTimeoutMs || 180000; server.headersTimeout = 15000;
    server.on('connection', socket => { sockets.set(socket, null); socket.once('close', () => sockets.delete(socket)); });
    server.on('secureConnection', socket => {
      sockets.set(socket, clientFingerprint(socket)); socket.once('close', () => sockets.delete(socket));
      const expiries = [Date.parse(socket.getPeerCertificate()?.valid_to), Date.parse(socket.getCertificate()?.valid_to), Date.parse(store.state.authority?.expiresAt)].filter(Number.isFinite);
      const expires = expiries.length ? Math.min(...expiries) : NaN;
      if (Number.isFinite(expires)) {
        const timer = setTimeout(() => socket.destroy(), Math.min(2_147_483_647, Math.max(1, expires - now()))); timer.unref(); socket.once('close', () => clearTimeout(timer));
      }
    });
    // No cached session can bypass a changed registry/revocation decision.
    server.on('resumeSession', (_id, callback) => callback(null, null));
    server.on('tlsClientError', () => {});
    server.on('error', () => {});
    return server;
  }
  async function startNetwork() {
    const options = store.state.mode === 'http' ? null : await tlsOptions(false, store.state.mode);
    if (closing) throw fail(503, 'Le serveur s’arrête.');
    network = track(options ? https.createServer(options, app.handle) : http.createServer(app.handle));
    port = await listen(network, port, host);
  }
  async function metadata() {
    const value = { version: 1, instanceId: app.config.instanceId, mode: store.state.mode, appPort: port, proofPort, adminPort: maintenance.address().port, appProtocol: store.state.mode === 'http' ? 'http:' : 'https:', pid: process.pid };
    await fs.mkdir(path.dirname(runtimeFile), { recursive: true });
    const temporary = runtimeFile + '.' + randomBytes(8).toString('hex') + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 }); await fs.rename(temporary, runtimeFile);
    await app.refreshSecurityAddresses?.();
    return value;
  }
  async function cancelPreparation() {
    const old = candidate; candidate = undefined; preparation = undefined;
    await shut(old);
  }
  async function prepare({ mode, hosts, candidatePort = proofPort, proofOrigin }) {
    if (!['https', 'mtls'].includes(mode) || modes[mode] < modes[store.state.mode]) throw fail(400, 'Le niveau demandé ne peut pas diminuer.');
    if (!Number.isInteger(candidatePort) || candidatePort < 0 || candidatePort > 65535 || candidatePort === port && candidatePort !== 0) throw fail(400, 'Port de préparation invalide.');
    if (!Array.isArray(hosts) || !hosts.length || hosts.length > 20) throw fail(400, 'Indique les adresses du certificat serveur.');
    if (mode === 'mtls' && !store.state.devices.some(device => store.isDeviceAllowed(device.fingerprint))) throw fail(409, 'Crée et installe d’abord un certificat appareil depuis Certificats.cmd sur le PC.');
    await cancelPreparation();
    await store.prepareServer({ hosts });
    if (closing) throw fail(503, 'Le serveur s’arrête.');
    hosts = store.state.candidate.hosts;
    const ticket = randomBytes(32).toString('base64url');
    preparation = { mode, ticket, expiresAt: new Date(now() + 10 * 60_000).toISOString(), hosts: [...hosts], fingerprint: store.state.candidate.fingerprint, proofOrigin };
    candidate = track(https.createServer(await tlsOptions(true, mode), proof));
    try { preparation.port = await listen(candidate, candidatePort, host); }
    catch (error) { await cancelPreparation(); if (['EADDRINUSE', 'EACCES', 'EPERM'].includes(error.code)) throw fail(409, 'Le port de vérification HTTPS ' + candidatePort + ' n’est pas disponible. Le niveau actuel et les données sont conservés. Configure un autre port sur le PC serveur puis réessaie.'); throw error; }
    const candidateUrl = `https://${hostUrl(advertisedHost(hosts))}:${preparation.port}`;
    preparation.url = candidateUrl;
    const expiry = setTimeout(() => { serial(cancelPreparation).catch(() => {}); }, 10 * 60_000); expiry.unref(); candidate.once('close', () => clearTimeout(expiry));
    return { status: status(), candidateUrl, serverFingerprint: preparation.fingerprint, proofUrl: candidateUrl + '/__certificates/confirm?ticket=' + ticket, localProofUrl: `https://${hostUrl(hosts.includes('127.0.0.1') ? '127.0.0.1' : advertisedHost(hosts))}:${preparation.port}/__certificates/confirm?ticket=${ticket}`, expiresAt: preparation.expiresAt, caFile: path.join(store.directory, store.state.authority.certFile), caFingerprint: store.state.authority.fingerprint };
  }
  async function proof(req, res) {
    try {
      if (!preparation || Date.parse(preparation.expiresAt) <= now() || !local(req.socket.remoteAddress)) throw fail(403, 'Cette préparation a expiré. Relance-la depuis le PC.');
      if (!req.socket.encrypted || preparation.mode === 'mtls' && (!req.socket.authorized || !store.isDeviceAllowed(clientFingerprint(req.socket)))) throw fail(403, 'Certificat appareil refusé.');
      const base = 'https://' + req.headers.host, url = new URL(req.url, base);
      if (!preparation.hosts.includes(url.hostname.replace(/^\[|\]$/g, '')) || !['/__certificates/confirm', '/__certificates/start'].includes(url.pathname)) throw fail(404, 'Page introuvable.');
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'strict-origin'); res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      if (req.method === 'GET' && url.pathname === '/__certificates/confirm' || req.method === 'POST' && url.pathname === '/__certificates/start') {
        let ticket;
        if (req.method === 'POST') {
          // HTTP → HTTPS is schemefully cross-site. The exact initiating origin
          // and an unguessable body token authorize only this preparation page.
          if (!preparation.proofOrigin || req.headers.origin !== preparation.proofOrigin) throw fail(403, 'Origine de vérification refusée. Reprends depuis les paramètres de ce compagnon.');
          const input = await receiveBody(req, { limit: 2048, timeoutMs: 15000 });
          ticket = new URLSearchParams(input.toString('utf8')).get('ticket');
        } else ticket = url.searchParams.get('ticket');
        if (!safeEqual(ticket, preparation.ticket)) throw fail(403, 'Lien de confirmation invalide.');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Confirmer la connexion sécurisée</title><style>body{font:17px system-ui;max-width:40rem;margin:8vh auto;padding:24px;line-height:1.6}button{font:inherit;padding:12px 18px;cursor:pointer}code{overflow-wrap:anywhere}button:focus-visible{outline:3px solid #1976d2;outline-offset:4px}</style><main><h1>Vérifier avant d’activer</h1><p>Cette connexion utilise ${preparation.mode === 'mtls' ? 'HTTPS et votre certificat client' : 'HTTPS'}. Comparez l’empreinte avec celle affichée sur le PC et vérifiez que le navigateur ne signale aucune erreur de certificat. Ne confirmez pas après avoir ignoré un avertissement.</p><p>Empreinte du serveur candidat (à comparer à celle affichée sur le PC) : <code>${escape(preparation.fingerprint)}</code></p><p>Empreinte de l’autorité installée : <code>${escape(store.state.authority.fingerprint)}</code></p><p>La confirmation ferme l’ancien accès réseau. Les conversations et les fichiers sont conservés.</p><form method="post" action="/__certificates/confirm"><input type="hidden" name="ticket" value="${escape(preparation.ticket)}"><button type="submit">Confirmer et activer ${preparation.mode === 'mtls' ? 'le certificat client obligatoire' : 'HTTPS'}</button></form></main></html>`);
        return;
      }
      if (req.method !== 'POST' || url.pathname !== '/__certificates/confirm' || req.headers.origin !== base || req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Origine de confirmation refusée.');
      const input = await receiveBody(req, { limit: 2048, timeoutMs: 15000 });
      const ticket = new URLSearchParams(input.toString('utf8')).get('ticket');
      if (!safeEqual(ticket, preparation.ticket)) throw fail(403, 'Lien de confirmation invalide.');
      const selected = { ...preparation }; preparation.ticket = '';
      await serial(async () => {
        if (!preparation || selected.fingerprint !== preparation.fingerprint || Date.parse(selected.expiresAt) <= now()) throw fail(403, 'La préparation a expiré. Relance-la depuis le PC.');
        if (selected.mode === 'mtls' && (!req.socket.authorized || !store.isDeviceAllowed(clientFingerprint(req.socket)))) throw fail(403, 'Ce certificat appareil n’est plus autorisé.');
        await store.confirmServer({ fingerprint: selected.fingerprint });
        if (selected.mode === 'mtls') await store.activateMtls();
        app.clearSecuritySessions();
        // Stop every previous application connection before binding the new level.
        await shut(network);
        await startNetwork();
        await metadata();
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const destination = 'https://' + hostUrl(advertisedHost(selected.hosts)) + ':' + port;
      res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Accès sécurisé activé</title><main><h1>Accès sécurisé activé</h1><p>Reconnectez-vous avec votre code d’accès.</p><p><a href="${escape(destination)}">Ouvrir le compagnon sécurisé</a></p></main></html>`);
      res.once('finish', () => { serial(cancelPreparation).catch(() => {}); });
    } catch (error) { reply(res, error.status || 500, { error: error.status ? error.message : 'Activation impossible. Le niveau confirmé est conservé ; consulte Certificats.cmd sur le PC.' }); }
  }
  function status() {
    const value = store.publicStatus();
    return { ...value, candidate: preparation ? { mode: preparation.mode, url: preparation.url, expiresAt: preparation.expiresAt } : null };
  }
  async function action(input) {
    if (input.action === 'status') return status();
    if (input.action === 'prepare' || input.action === 'renew-server') return serial(() => prepare({ ...input, mode: input.mode || (store.state.mode === 'mtls' ? 'mtls' : 'https') }));
    if (input.action === 'cancel-preparation') return serial(async () => { await cancelPreparation(); return status(); });
    if (input.action === 'revoke-device') return serial(async () => {
      if (input.preserveWebAccess && store.state.mode === 'mtls') {
        const state = store.state, device = state.devices.find(item => item.id === input.id);
        if (!store.isDeviceAllowed(input.requesterFingerprint)) throw fail(403, 'Le certificat de cette connexion n’est plus autorisé. Reconnecte-toi depuis un appareil actif.');
        if (!device) throw fail(404, 'Appareil inconnu.');
        if (device.fingerprint === input.requesterFingerprint) throw fail(409, 'Ce certificat protège la connexion actuelle. Utilise un autre appareil autorisé.');
        if (store.isDeviceAllowed(device.fingerprint) && state.devices.filter(item => store.isDeviceAllowed(item.fingerprint)).length <= 1) throw fail(409, 'Garde au moins un appareil autorisé.');
      }
      await store.revokeDevice(input.id);
      for (const [socket, fingerprint] of sockets) if (fingerprint && !store.isDeviceAllowed(fingerprint)) socket.destroy();
      return status();
    });
    throw fail(400, 'Cette opération nécessite Certificats.cmd sur le PC, serveur arrêté.');
  }
  try {
    maintenance = track(http.createServer((req, res) => {
      if (!loopback(req.socket.remoteAddress)) return reply(res, 403, { error: 'Administration locale uniquement.' });
      const route = String(req.url || '').split('?')[0];
      if (!['/api/ping', '/api/admin/stop', '/api/admin/revoke-sessions', '/api/admin/certificates/action'].includes(route)) return reply(res, 404, { error: 'Page introuvable.' });
      req.companionMaintenance = true; return app.handle(req, res);
    }));
    await listen(maintenance, adminPort, '127.0.0.1');
    app.attachCertificateTransport({ action, status, close });
    await startNetwork();
    await metadata();
    app.updater.start();
  } catch (error) { await close(); throw error; }
  async function close() {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      await mutation;
      await cancelPreparation();
      for (const socket of sockets.keys()) socket.destroy();
      await Promise.all([shut(network), shut(maintenance)]);
      await fs.unlink(runtimeFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
    })();
    return closePromise;
  }
  return { action, status, close, get appServer() { return network; }, get adminPort() { return maintenance.address()?.port; }, get appPort() { return port; }, get proofPort() { return proofPort; } };
}
