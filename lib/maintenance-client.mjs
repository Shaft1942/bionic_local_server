// Local operations only. HTTPS application traffic is never downgraded for probes.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
const failure = message => Object.assign(new Error(message), { code: 'MAINTENANCE_REFUSED' });
const validPort = value => Number.isInteger(value) && value > 0 && value <= 65535;
async function optionalJson(root, relative) {
  let cursor = path.resolve(root);
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    try { const stat = await fs.lstat(cursor); if (stat.isSymbolicLink()) throw failure('Lien interdit dans les fichiers de maintenance.'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  const stat = await fs.stat(cursor); if (!stat.isFile() || stat.size > 65536) throw failure('Fichier de maintenance invalide.');
  return JSON.parse(await fs.readFile(cursor, 'utf8'));
}
export async function readLocalControl({ root, port, allowOffline = false } = {}) {
  root = path.resolve(root);
  const config = await optionalJson(root, 'data/config.json');
  if (!config || typeof config.instanceId !== 'string' || !config.instanceId || typeof config.adminToken !== 'string' || !config.adminToken) throw failure('Identite locale absente. Demarre ce compagnon une premiere fois.');
  const metadata = await optionalJson(root, 'runtime/transport.json');
  if (metadata) {
    if (metadata.version !== 1 || metadata.instanceId !== config.instanceId || !validPort(metadata.appPort) || !validPort(metadata.adminPort) || !Number.isSafeInteger(metadata.pid) || metadata.pid < 1 || !['http', 'https', 'mtls'].includes(metadata.mode) || (metadata.mode === 'http' ? metadata.appProtocol !== 'http:' : metadata.appProtocol !== 'https:' || metadata.appPort === metadata.adminPort)) throw failure('Identite ou transport incoherent : aucune autre instance ne sera contactee.');
    return { config, metadata, base: `http://127.0.0.1:${metadata.adminPort}`, applicationUrl: `${metadata.appProtocol}//127.0.0.1:${metadata.appPort}` };
  }
  const state = !allowOffline && await optionalJson(root, 'data/security/state.json'), floor = !allowOffline && await optionalJson(root, 'data/security-floor.json');
  if ((state || floor) && !allowOffline) throw failure('Canal de maintenance absent. Demarre ce compagnon avant cette operation.');
  if (!validPort(port)) throw failure('Port de maintenance invalide.');
  return { config, metadata: { mode: 'http', appPort: port, adminPort: port, appProtocol: 'http:' }, base: `http://127.0.0.1:${port}`, applicationUrl: `http://127.0.0.1:${port}` };
}
async function jsonResponse(response) {
  const chunks = []; let size = 0;
  for await (const chunk of response.body || []) { size += chunk.length; if (size > 65536) { await response.body.cancel?.().catch(() => {}); throw failure('Reponse de maintenance trop grande.'); } chunks.push(Buffer.from(chunk)); }
  const bytes = Buffer.concat(chunks, size);
  let value; try { value = JSON.parse(bytes); } catch { throw failure('Reponse de maintenance invalide.'); }
  if (!response.ok) throw failure(typeof value.error === 'string' ? value.error : 'Action locale refusee.');
  return value;
}
export async function pingLocalControl(control, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(control.base + '/api/ping', { redirect: 'error', signal: AbortSignal.timeout(3000) });
  const value = await jsonResponse(response);
  if (value.app !== 'bionic-mobile-local' || value.instanceId !== control.config.instanceId) throw failure('Le port appartient a une autre instance. Aucune action effectuee.');
  return value;
}
export async function requestLocalAdmin(control, endpoint, body = {}, { fetchImpl = fetch } = {}) {
  if (!['/api/admin/stop', '/api/admin/revoke-sessions', '/api/admin/certificates/action'].includes(endpoint)) throw failure('Route de maintenance interdite.');
  await pingLocalControl(control, { fetchImpl });
  return jsonResponse(await fetchImpl(control.base + endpoint, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token: control.config.adminToken }), signal: AbortSignal.timeout(60000) }));
}
function portOpen(port, connectImpl) {
  return new Promise(resolve => { const socket = connectImpl({ host: '127.0.0.1', port }); const done = value => { socket.destroy(); resolve(value); }; socket.once('connect', () => done(true)); socket.once('error', error => done(error.code !== 'ECONNREFUSED')); socket.setTimeout(700, () => done(true)); });
}
export async function assertServerOffline({ root, port, connectImpl = net.connect } = {}) {
  try { await fs.lstat(path.join(root, 'runtime/update.lock')); throw failure('Une mise a jour est en cours ou doit etre verifiee. Aucun certificat modifie.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // A stale PID reused by another process is treated conservatively. Never kill it.
  const runtime = await optionalJson(root, 'runtime/server.json'), metadata = await optionalJson(root, 'runtime/transport.json');
  for (const value of [runtime, metadata]) if (Number.isSafeInteger(value?.pid) && value.pid > 0) {
    try { process.kill(value.pid, 0); throw failure('Serveur ou processus encore actif. Arrete ce compagnon avec Arreter.cmd avant de modifier son identite.'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  const ports = new Set([port, runtime?.port, metadata?.appPort, metadata?.adminPort].filter(validPort));
  for (const candidate of ports) if (await portOpen(candidate, connectImpl)) throw failure('Un port de cette installation est actif. Aucune cle ni identite modifiee.');
}

export async function diagnoseLocalTransport({ root, port } = {}) {
  try {
    const control = await readLocalControl({ root, port });
    await pingLocalControl(control);
    return { status: 'ok', code: ({ http:'COMPANION_HTTP_OK', https:'COMPANION_HTTPS_OK', mtls:'COMPANION_MTLS_OK' })[control.metadata.mode] };
  } catch { return { status: 'unknown', code: 'COMPANION_TRANSPORT_NOT_CONFIRMED' }; }
}
