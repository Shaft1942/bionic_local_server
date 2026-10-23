// Browser enrollment: private material only crosses authenticated HTTPS.
// Export bytes are short-lived, session-bound and never persisted by this module.
import { randomBytes, randomUUID, timingSafeEqual, X509Certificate } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { clientFingerprint } from './certificate-transport.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });
const sameToken = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a) && /^[A-Za-z0-9_-]{43}$/.test(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const EXPORT_LIFETIME = 5 * 60_000;

export function createCertificateWeb({ store, transport, suggestedHosts = [], root, instanceId, platform = process.platform, networkInterfaces = os.networkInterfaces, now = () => Date.now() }) {
  const exports = new Map(), issuanceTimes = new Map();
  let issuing = false, generation = 0, pendingProof;
  function forget(id) {
    const entry = exports.get(id); if (!entry) return;
    clearTimeout(entry.timer); entry.bytes.fill(0); exports.delete(id);
  }
  function prune() {
    for (const [id, entry] of exports) if (entry.expiresAt <= now() || entry.session.expiry <= now() || entry.epoch !== store.state.epoch) forget(id);
    for (const [session, times] of issuanceTimes) { const recent = times.filter(time => now() - time < 60_000); if (recent.length && session.expiry > now()) issuanceTimes.set(session, recent); else issuanceTimes.delete(session); }
  }
  function csrf(session) { return session.certificateCsrf ||= randomBytes(32).toString('base64url'); }
  function authorize(req, session, bodyToken) {
    const origin = `${req.socket.encrypted ? 'https:' : 'http:'}//${req.headers.host}`;
    if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site' || !sameToken(req.headers['x-bionic-csrf'] || bodyToken, session.certificateCsrf)) throw fail(403, 'Action refusée. Actualise les paramètres et réessaie depuis ce compagnon.');
    return origin;
  }
  function secure(req) {
    if (!req.socket.encrypted || store.state.mode === 'http') throw fail(403, 'Active et vérifie HTTPS avant de créer ou gérer un certificat appareil.');
  }
  async function status(req, session) {
    const state = transport()?.status() || store.publicStatus();
    const fingerprint = clientFingerprint(req.socket);
    const currentDeviceId = state.mode === 'mtls' ? state.devices.find(device => device.fingerprint === fingerprint)?.id || null : null;
    let proofPortProvisioned = platform !== 'win32';
    if (platform === 'win32' && root) {
      try {
        const filename = path.join(root, 'runtime/certificate-network.json'), stat = await fs.lstat(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw Error('Invalid network marker');
        const marker = JSON.parse(await fs.readFile(filename, 'utf8'));
        const currentInterface = typeof marker.interfaceAlias === 'string' ? networkInterfaces()[marker.interfaceAlias] : null;
        const activeScope = typeof marker.localAddress === 'string' && Number.isInteger(marker.prefixLength) && marker.prefixLength >= 16 && marker.prefixLength <= 30 && typeof marker.remoteSubnet === 'string' && typeof marker.program === 'string' && path.resolve(marker.program).toLowerCase() === path.resolve(process.execPath).toLowerCase() && Array.isArray(currentInterface) && currentInterface.some(address => address.family === 'IPv4' && address.address === marker.localAddress && address.cidr === marker.localAddress + '/' + marker.prefixLength);
        proofPortProvisioned = !!activeScope && marker.version === 1 && marker.instanceId === instanceId && marker.appPort === transport()?.appPort && marker.proofPort === transport()?.proofPort && Number.isFinite(Date.parse(marker.provisionedAt));
      } catch { proofPortProvisioned = false; }
    }
    const proofRequest = pendingProof && pendingProof.session === session && pendingProof.epoch === store.state.epoch && pendingProof.expiresAt > now() && state.candidate ? { url: '/api/security/proof', id: pendingProof.id } : null;
    return { ...state, web: { csrfToken: csrf(session), canConfigure: !!transport(), canIssueDevice: !!req.socket.encrypted && state.mode !== 'http', currentDeviceId, suggestedHosts: [...new Set([new URL(`${req.socket.encrypted ? 'https:' : 'http:'}//${req.headers.host}`).hostname.replace(/^\[|\]$/g, ''), ...suggestedHosts])], proofPort: transport()?.proofPort || null, proofPortProvisioned, proofRequest, exportLifetimeSeconds: EXPORT_LIFETIME / 1000 } };
  }
  async function action(req, session, input) {
    const origin = authorize(req, session), controller = transport();
    if (!controller) throw fail(503, 'La gestion des connexions n’est pas disponible. Redémarre ce compagnon avec son lanceur habituel.');
    if (input.action === 'prepare') {
      if (input.mode !== 'https' && input.mode !== 'mtls') throw fail(400, 'Choisis HTTPS ou HTTPS avec certificat client.');
      if (input.mode === 'mtls') secure(req);
      const result = await controller.action({ action: 'prepare', mode: input.mode, hosts: input.hosts, proofOrigin: origin });
      const ticket = new URL(result.proofUrl).searchParams.get('ticket');
      const proofId = randomUUID();
      pendingProof = { id: proofId, session, epoch: store.state.epoch, ticket, url: result.candidateUrl + '/__certificates/start', expiresAt: Date.parse(result.expiresAt) };
      return { status: await status(req, session), candidateUrl: result.candidateUrl, serverFingerprint: result.serverFingerprint, caFingerprint: result.caFingerprint, expiresAt: result.expiresAt, proofRequest: { url: '/api/security/proof', id: proofId } };
    }
    if (input.action === 'cancel-preparation') { pendingProof = null; await controller.action({ action: input.action }); return status(req, session); }
    if (input.action === 'revoke-device') {
      secure(req);
      const state = store.state, device = state.devices.find(device => device.id === input.id);
      if (!device) throw fail(404, 'Cet appareil n’est plus enregistré. Actualise la liste.');
      if (input.confirmName !== device.name) throw fail(400, 'Confirme le retrait de cet appareil avant de continuer.');
      if (state.mode === 'mtls' && clientFingerprint(req.socket) === device.fingerprint) throw fail(409, 'Ce certificat protège ta connexion actuelle. Retire-le depuis un autre appareil autorisé après avoir vérifié son accès.');
      if (state.mode === 'mtls' && state.devices.filter(item => store.isDeviceAllowed(item.fingerprint)).length <= 1 && store.isDeviceAllowed(device.fingerprint)) throw fail(409, 'Garde au moins un appareil autorisé. Ajoute et vérifie son remplaçant avant ce retrait.');
      await controller.action({ action: input.action, id: device.id, preserveWebAccess: true, requesterFingerprint: clientFingerprint(req.socket) });
      return status(req, session);
    }
    if (input.action !== 'issue-device') throw fail(400, 'Action de certificat inconnue.');
    secure(req); prune();
    if (issuing) throw fail(409, 'Un certificat est déjà en cours de création. Attends sa fin.');
    const recent = issuanceTimes.get(session) || [];
    if (recent.length >= 4 || exports.size >= 20) throw fail(429, 'Plusieurs certificats viennent d’être préparés. Termine les téléchargements ou réessaie dans une minute.');
    const previous = input.previousId ? store.state.devices.find(device => device.id === input.previousId && !device.revokedAt) : null;
    if (input.previousId && !previous) throw fail(404, 'Le certificat à renouveler n’est plus actif. Actualise la liste.');
    const name = previous ? previous.name : input.name;
    const passphrase = randomBytes(18).toString('base64url');
    const startedGeneration = generation;
    issuing = true;
    try {
      const issued = await store.issueDevice({ name, passphrase });
      // Invalidating the initiating session during RSA creation cancels export.
      if (startedGeneration !== generation || session.expiry <= now() || session.epoch !== store.state.epoch) { await store.revokeDevice(issued.device.id); throw fail(409, 'La connexion a changé pendant la création. Reconnecte-toi et recommence.'); }
      const id = randomUUID(), expiresAt = now() + EXPORT_LIFETIME;
      const entry = { bytes: issued.pfx, session, epoch: store.state.epoch, fingerprint: clientFingerprint(req.socket), expiresAt, timer: null };
      entry.timer = setTimeout(() => forget(id), EXPORT_LIFETIME); entry.timer.unref(); exports.set(id, entry);
      issuanceTimes.set(session, [...recent, now()]);
      return { device: issued.device, exportId: id, passphrase, expiresAt: new Date(expiresAt).toISOString(), previousId: previous?.id || null };
    } catch (error) {
      if (error.status || error.code === 'SECURITY_LOCKED') throw error;
      throw fail(400, 'Le certificat n’a pas pu être créé. Utilise un nom de 1 à 80 caractères puis réessaie.');
    } finally { issuing = false; }
  }
  function downloadDevice(req, session, input) {
    authorize(req, session); secure(req); prune();
    const entry = exports.get(input.exportId);
    if (!entry || entry.session !== session || entry.epoch !== store.state.epoch || entry.fingerprint !== clientFingerprint(req.socket)) throw fail(404, 'Ce téléchargement a expiré ou a déjà été utilisé. Crée un nouveau certificat si nécessaire.');
    exports.delete(input.exportId); clearTimeout(entry.timer);
    return { bytes: entry.bytes, filename: 'bionic-appareil.p12', contentType: 'application/pkcs12' };
  }
  function startProof(req, session, input) {
    authorize(req, session, input.csrfToken);
    if (!pendingProof || pendingProof.id !== input.proofId || pendingProof.session !== session || pendingProof.epoch !== store.state.epoch || pendingProof.expiresAt <= now() || !transport()?.status().candidate) throw fail(409, 'Cette préparation n’est plus disponible. Recommence depuis les paramètres.');
    return { url: pendingProof.url, ticket: pendingProof.ticket };
  }
  async function authorityCertificate() {
    if (!store.state.authority) throw fail(404, 'Prépare HTTPS pour créer l’autorité de cette installation.');
    return { bytes: new X509Certificate(await store.authorityCertificate()).raw, filename: 'bionic-autorite.crt', contentType: 'application/x-x509-ca-cert' };
  }
  function releaseSession(session) {
    session.expiry = 0; issuanceTimes.delete(session);
    if (pendingProof?.session === session) pendingProof = null;
    for (const [id, entry] of exports) if (entry.session === session) forget(id);
  }
  function clear() { ++generation; pendingProof = null; for (const id of exports.keys()) forget(id); issuanceTimes.clear(); }
  return { status, action, downloadDevice, startProof, authorityCertificate, releaseSession, clear, get busy() { return issuing; } };
}
