// This file is copied into a private update job and runs without relative imports.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { crc32, inflateRawSync } from 'node:zlib';
import { spawn } from 'node:child_process';

const MAX_ARCHIVE = 32 * 1024 * 1024, MAX_FILE = 2 * 1024 * 1024, MAX_ENTRIES = 2000;
const protectedPath = /(?:^|\/)(?:data|runtime|dist|node_modules|\.git|\.venv|__pycache__|projects)(?:\/|$)|(?:^|\/)(?:config\.local\.json|ACCES-PRIVE\.txt|\.env(?:\..*)?|reseau-verification\.txt|diagnostic-bionic\.json|verification.*\.json|store-verification.*\.json|apercu-.*)$|\.(?:log|sqlite(?:-wal|-shm)?|db|pem|key|pfx|p12|crt|cer|der|zip|bin)$/i;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => Object.assign(new Error(message), { code: 'UPDATE_REFUSED', status: 409 });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);

function version(value) {
  // Keep this standalone worker's parser aligned with lib/update-version.mjs.
  const match = typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.([1-9]\d*))?$/.exec(value);
  if (!match || match[0] !== value) throw fail('Version de mise à jour invalide.');
  const numbers = match.slice(1).map(part => part === undefined ? null : Number(part));
  if (numbers.some(number => number !== null && !Number.isSafeInteger(number))) throw fail('Version invalide.');
  return numbers;
}
function compare(a, b) {
  const x = version(a), y = version(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  if (x[3] === y[3]) return 0;
  if (x[3] === null) return 1;
  if (y[3] === null) return -1;
  return x[3] < y[3] ? -1 : 1;
}
function sourcePath(value) {
  if (typeof value !== 'string' || value.length > 240 || !/^[A-Za-z0-9._/-]+$/.test(value) || protectedPath.test(value) || value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw fail('Chemin de source interdit dans la mise à jour.');
  return value;
}
function inventory(value) {
  if (!plain(value) || !Array.isArray(value.files) || value.files.length < 3 || value.files.length > MAX_ENTRIES) throw fail('Manifeste de distribution invalide.');
  const names = new Set();
  for (const name of value.files) { sourcePath(name); const key = name.toLowerCase(); if (names.has(key)) throw fail('Chemin dupliqué dans la distribution.'); names.add(key); }
  for (const name of names) { const parts = name.split('/'); for (let i = 1; i < parts.length; i++) if (names.has(parts.slice(0, i).join('/'))) throw fail('Collision de fichiers et dossiers dans la distribution.'); }
  for (const required of ['package.json', 'server.mjs', 'release-manifest.json']) if (!names.has(required)) throw fail('Source requise absente de la distribution.');
  return value.files;
}
export function validateUpdateMetadata(metadata, { currentVersion, platform = process.platform, nodeMajor = Number(process.versions.node.split('.')[0]) } = {}) {
  if (!plain(metadata) || metadata.schemaVersion !== 1 || !digest(metadata.sha256) || typeof metadata.archive !== 'string' || metadata.archive !== `bionic-mobile-v${metadata.version}.zip` || !Number.isInteger(metadata.nodeMajorMin) || metadata.nodeMajorMin < 24 || (metadata.nodeMajorMax !== null && (!Number.isInteger(metadata.nodeMajorMax) || metadata.nodeMajorMax < metadata.nodeMajorMin)) || !Array.isArray(metadata.platforms) || !metadata.platforms.length || metadata.platforms.length > 10 || metadata.platforms.some(value => typeof value !== 'string' || !/^[a-z0-9_-]{1,20}$/.test(value))) throw fail('Métadonnées de mise à jour invalides.');
  const target = version(metadata.version), channel = target[3] === null ? 'stable' : 'beta';
  if ((metadata.channel !== undefined && metadata.channel !== channel) || (channel === 'beta' && metadata.channel !== 'beta')) throw fail('Canal de mise à jour incohérent.');
  version(metadata.minInstalledVersion);
  if (metadata.maxInstalledVersion != null) version(metadata.maxInstalledVersion);
  if (metadata.maxInstalledVersion != null && compare(metadata.minInstalledVersion, metadata.maxInstalledVersion) > 0) throw fail('Bornes de compatibilité incohérentes.');
  if (platform !== 'win32' || !metadata.platforms.includes(platform)) throw fail('Installation automatique disponible sous Windows uniquement. Utilise la mise à jour manuelle.');
  if (nodeMajor < metadata.nodeMajorMin || (metadata.nodeMajorMax !== null && nodeMajor > metadata.nodeMajorMax)) throw fail('Cette version nécessite une autre version de Node.js.');
  if (compare(currentVersion, metadata.version) >= 0 || compare(currentVersion, metadata.minInstalledVersion) < 0 || (metadata.maxInstalledVersion != null && compare(currentVersion, metadata.maxInstalledVersion) > 0)) throw fail('Cette mise à jour ne convient pas à la version installée.');
  return metadata;
}

// Accept the bounded, non-encrypted STORE/DEFLATE subset used by our releases.
export function inspectUpdateArchive(archive, metadata) {
  if (!Buffer.isBuffer(archive) || archive.length < 22 || archive.length > MAX_ARCHIVE || hash(archive) !== String(metadata.sha256).toLowerCase()) throw fail('Empreinte de l’archive incorrecte.');
  const end = archive.length - 22;
  if (archive.readUInt32LE(end) !== 0x06054b50 || archive.readUInt16LE(end + 20) || archive.readUInt32LE(end + 4) || archive.readUInt16LE(end + 8) !== archive.readUInt16LE(end + 10)) throw fail('Archive ZIP non prise en charge.');
  const count = archive.readUInt16LE(end + 10), directorySize = archive.readUInt32LE(end + 12), directoryStart = archive.readUInt32LE(end + 16);
  if (!count || count > MAX_ENTRIES || directoryStart + directorySize !== end) throw fail('Répertoire ZIP invalide.');
  let cursor = directoryStart, localEnd = 0, total = 0;
  const files = new Map(), prefix = `bionic-mobile-v${metadata.version}/`, decoder = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || archive.readUInt32LE(cursor) !== 0x02014b50) throw fail('Entrée ZIP invalide.');
    const flags = archive.readUInt16LE(cursor + 8), method = archive.readUInt16LE(cursor + 10), crc = archive.readUInt32LE(cursor + 16), compressed = archive.readUInt32LE(cursor + 20), size = archive.readUInt32LE(cursor + 24), nameLength = archive.readUInt16LE(cursor + 28), extraLength = archive.readUInt16LE(cursor + 30), commentLength = archive.readUInt16LE(cursor + 32), offset = archive.readUInt32LE(cursor + 42), mode = archive.readUInt32LE(cursor + 38) >>> 16;
    if (archive.readUInt16LE(cursor + 6) > 20 || ![0, 0x800].includes(flags) || ![0, 8].includes(method) || size > MAX_FILE || compressed > MAX_ARCHIVE || archive.readUInt16LE(cursor + 34) || (mode && (mode & 0xf000) !== 0x8000) || cursor + 46 + nameLength + extraLength + commentLength > end) throw fail('Type ou taille d’entrée ZIP interdit.');
    let name; try { name = decoder.decode(archive.subarray(cursor + 46, cursor + 46 + nameLength)); } catch { throw fail('Nom ZIP invalide.'); }
    if (!name.startsWith(prefix)) throw fail('Racine ZIP inattendue.');
    const relative = sourcePath(name.slice(prefix.length)), key = relative.toLowerCase();
    if ([...files.keys()].some(existing => existing.toLowerCase() === key)) throw fail('Chemin ZIP dupliqué.');
    if (offset !== localEnd || offset + 30 > directoryStart || archive.readUInt32LE(offset) !== 0x04034b50 || archive.readUInt16LE(offset + 4) > 20 || archive.readUInt16LE(offset + 6) !== flags || archive.readUInt16LE(offset + 8) !== method || archive.readUInt32LE(offset + 14) !== crc || archive.readUInt32LE(offset + 18) !== compressed || archive.readUInt32LE(offset + 22) !== size || archive.readUInt16LE(offset + 26) !== nameLength) throw fail('En-têtes ZIP incohérents.');
    const localNameEnd = offset + 30 + nameLength, dataStart = localNameEnd + archive.readUInt16LE(offset + 28), dataEnd = dataStart + compressed;
    if (dataEnd > directoryStart || !archive.subarray(offset + 30, localNameEnd).equals(archive.subarray(cursor + 46, cursor + 46 + nameLength))) throw fail('Entrée ZIP hors limites.');
    let bytes;
    try { bytes = method === 0 ? Buffer.from(archive.subarray(dataStart, dataEnd)) : inflateRawSync(archive.subarray(dataStart, dataEnd), { maxOutputLength: Math.max(1, size) }); } catch { throw fail('Contenu ZIP invalide.'); }
    if (bytes.length !== size || crc32(bytes) !== crc || bytes.includes(0)) throw fail('Intégrité de fichier ZIP incorrecte.');
    total += bytes.length; if (total > MAX_ARCHIVE) throw fail('Distribution trop volumineuse.');
    files.set(relative, bytes); localEnd = dataEnd; cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end || localEnd !== directoryStart) throw fail('Données ZIP supplémentaires interdites.');
  let names, pkg;
  try { names = inventory(JSON.parse(files.get('release-manifest.json')?.toString('utf8'))); pkg = JSON.parse(files.get('package.json')?.toString('utf8')); } catch (error) { if (error.code === 'UPDATE_REFUSED') throw error; throw fail('Sources de distribution invalides.'); }
  if (pkg.version !== metadata.version || pkg.name !== 'bionic-mobile-local' || names.length !== files.size || names.some(name => !files.has(name))) throw fail('Inventaire ou version de distribution incohérent.');
  return files;
}

// A secured identity is installation state, never part of an update archive.
// Refuse older code before touching sources, even if its metadata calls it newer.
const certificateModule = 'lib/certificate-transport.mjs';
const certificateCapability = /export\s+const\s+CERTIFICATE_TRANSPORT_CAPABILITY\s*=\s*1\s*;/;
async function hasCertificateIdentity(root) {
  return !!(await optionalStat(await safePath(root, 'data/security/state.json', { file: true })) || await optionalStat(await safePath(root, 'data/security-floor.json', { file: true })));
}
async function requireCertificateCapability(root, incoming) {
  if (await hasCertificateIdentity(root)) {
    const module = incoming?.get(certificateModule);
    if (!module || !certificateCapability.test(module.toString('utf8'))) throw fail('Cette version ne prend pas en charge l’identite et le niveau de securite existants. Mise a jour refusee.');
  }
}

async function optionalStat(filename) { try { return await fs.lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
// Inspect every parent, including parents of the installation itself (junctions too).
async function safePath(root, relative = '', { missing = true, file = false } = {}) {
  const destination = path.resolve(root, relative), parsed = path.parse(destination);
  let cursor = parsed.root;
  for (const part of destination.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part); const stat = await optionalStat(cursor);
    if (!stat) { if (!missing) throw fail('Fichier requis absent.'); continue; }
    if (stat.isSymbolicLink() || (cursor !== destination && !stat.isDirectory())) throw fail('Lien ou parent de source interdit.');
    if (cursor === destination && (file ? !stat.isFile() : !stat.isDirectory())) throw fail('Type de fichier inattendu.');
  }
  return destination;
}
async function readSource(root, relative) {
  const filename = await safePath(root, sourcePath(relative), { file: true });
  const stat = await optionalStat(filename); if (!stat) return null;
  if (stat.size > MAX_FILE) throw fail('Source locale trop volumineuse.');
  return fs.readFile(filename);
}
async function writeJson(filename, value) { await safePath(path.dirname(filename), path.basename(filename), { file: true }); await atomicCopy(Buffer.from(JSON.stringify(value, null, 2) + '\n'), filename); }
async function replaceTemporary(temporary, destination) {
  // Windows readers and scanners may briefly deny replacement. Retrying the
  // same rename keeps the destination intact; persistent denials still fail.
  const delays = [25, 50, 100, 200, 250, 250, 250, 250, 250, 250];
  let retry = 0;
  while (true) {
    try { await fs.rename(temporary, destination); return; }
    catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || retry === delays.length) throw error;
      await sleep(delays[retry++]);
      await safePath(path.dirname(destination), path.basename(destination), { file: true });
    }
  }
}
async function atomicCopy(bytes, destination) {
  await safePath(path.dirname(destination), path.basename(destination), { file: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + '.update-' + randomUUID();
  try { await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 }); await replaceTemporary(temporary, destination); }
  finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
async function restoreSourceOperation(plan, operation) {
  const matchesPrevious = async () => {
    const bytes = await readSource(plan.root, operation.path);
    return (bytes ? hash(bytes) : null) === operation.oldHash;
  };
  // An attempted rename may have failed without changing the destination.
  if (await matchesPrevious()) return;
  const destination = await safePath(plan.root, operation.path, { file: true });
  try {
    if (operation.oldHash) await atomicCopy(await fs.readFile(path.join(plan.jobRoot, 'backup', operation.path)), destination);
    else await fs.rm(destination, { force: true });
  } catch (error) {
    if (await matchesPrevious().catch(() => false)) return;
    throw error;
  }
  if (!await matchesPrevious()) throw fail('La restauration des sources n’a pas été confirmée.');
}

export async function prepareUpdate({ root, archiveBuffer, archive = archiveBuffer, metadata, currentVersion, instanceId, port, nodePath = process.execPath, parentPid = process.pid, platform = process.platform, nodeMajor } = {}) {
  validateUpdateMetadata(metadata, { currentVersion, platform, nodeMajor });
  root = path.resolve(root); await safePath(root, '', { missing: false });
  if (await optionalStat(path.join(root, '.git'))) throw fail('Ce dossier est un dépôt Git. Mets-le à jour avec Git ou utilise une installation extraite du ZIP.');
  if (typeof instanceId !== 'string' || !/^[\w-]{1,100}$/.test(instanceId) || !Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(parentPid) || parentPid < 1 || typeof nodePath !== 'string' || !path.isAbsolute(nodePath)) throw fail('Paramètres de redémarrage invalides.');
  const incoming = inspectUpdateArchive(archive, metadata);
  await requireCertificateCapability(root, incoming);
  const pkg = JSON.parse((await readSource(root, 'package.json'))?.toString('utf8') || '{}');
  if (pkg.version !== currentVersion || pkg.name !== 'bionic-mobile-local') throw fail('Version locale inattendue.');
  const oldNames = inventory(JSON.parse((await readSource(root, 'release-manifest.json'))?.toString('utf8') || '{}'));
  const oldSet = new Set(oldNames.map(name => name.toLowerCase())), previous = new Map();
  for (const name of oldNames) previous.set(name, await readSource(root, name));
  for (const name of incoming.keys()) {
    const existing = await readSource(root, name);
    if (existing && !oldSet.has(name.toLowerCase())) throw fail('Un fichier local extérieur à la distribution serait écrasé.');
    if ([...previous.keys()].some(old => old.toLowerCase() === name.toLowerCase() && old !== name)) throw fail('Changement de casse de source non pris en charge.');
  }
  await safePath(root, 'runtime'); await fs.mkdir(path.join(root, 'runtime'), { recursive: true, mode: 0o700 });
  const baselinePath = await safePath(root, 'runtime/update-baseline.json', { file: true });
  let baseline = null;
  try { baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw fail('Référence des sources invalide ; mise à jour manuelle nécessaire.'); }
  if (baseline) {
    if (baseline.version !== currentVersion || !plain(baseline.files) || Object.keys(baseline.files).length !== previous.size || [...previous].some(([name, bytes]) => !bytes || !digest(baseline.files[name]) || hash(bytes) !== baseline.files[name])) throw fail('Des sources locales ont été modifiées. Conserve-les et effectue une mise à jour manuelle.');
  }
  await safePath(root, 'runtime/update-jobs'); await fs.mkdir(path.join(root, 'runtime/update-jobs'), { recursive: true, mode: 0o700 });
  const jobId = randomUUID(), jobRoot = path.join(root, 'runtime/update-jobs', jobId);
  await fs.mkdir(jobRoot, { mode: 0o700 });
  const operations = [];
  // Without a known baseline, retain obsolete files rather than deleting custom work.
  const names = new Set([...incoming.keys(), ...(baseline ? oldNames : [])]);
  for (const name of names) {
    const old = previous.get(name) ?? null, next = incoming.get(name) ?? null;
    if (old && next && hash(old) === hash(next)) continue;
    if (!old && !next) continue;
    if (old) { const destination = path.join(jobRoot, 'backup', name); await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, old, { flag: 'wx', mode: 0o600 }); }
    if (next) { const destination = path.join(jobRoot, 'staged', name); await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, next, { flag: 'wx', mode: 0o600 }); }
    operations.push({ path: name, oldHash: old ? hash(old) : null, newHash: next ? hash(next) : null });
  }
  const worker = path.join(jobRoot, 'worker.mjs');
  await fs.copyFile(fileURLToPath(import.meta.url), worker, 1);
  const plan = { schemaVersion: 1, jobId, root, jobRoot, worker, planFile: path.join(jobRoot, 'plan.json'), parentPid, nodePath, port, instanceId, currentVersion, version: metadata.version, metadata, operations, oldBaseline: baseline, baselineVerified: !!baseline, warnings: baseline ? [] : ['Première mise à jour : les modifications locales des sources ne peuvent pas être identifiées. Une sauvegarde exacte est conservée ; les fichiers personnels et les anciennes sources non remplacées sont préservés.'], incomingHashes: Object.fromEntries([...incoming].map(([name, bytes]) => [name, hash(bytes)])), workerHash: hash(await fs.readFile(worker)) };
  await writeJson(plan.planFile, plan);
  await writeJson(path.join(jobRoot, 'status.json'), { state: 'prepared', version: plan.version, warnings: plan.warnings, updatedAt: new Date().toISOString() });
  return plan;
}

async function validatePlan(plan) {
  if (!plain(plan) || plan.schemaVersion !== 1 || !/^[a-f0-9-]{36}$/.test(plan.jobId) || !path.isAbsolute(plan.root) || plan.jobRoot !== path.join(plan.root, 'runtime/update-jobs', plan.jobId) || plan.planFile !== path.join(plan.jobRoot, 'plan.json') || plan.worker !== path.join(plan.jobRoot, 'worker.mjs') || !Array.isArray(plan.operations) || plan.operations.length > MAX_ENTRIES || !plain(plan.incomingHashes) || !Number.isInteger(plan.parentPid) || plan.parentPid < 1 || typeof plan.nodePath !== 'string' || !path.isAbsolute(plan.nodePath) || !Number.isInteger(plan.port) || plan.port < 1 || plan.port > 65535 || typeof plan.instanceId !== 'string' || !/^[\w-]{1,100}$/.test(plan.instanceId)) throw fail('Plan d’installation invalide.');
  version(plan.version); version(plan.currentVersion);
  await safePath(plan.root, '', { missing: false });
  if (await optionalStat(path.join(plan.root, '.git'))) throw fail('Installation interdite dans un dépôt Git.');
  await safePath(plan.jobRoot, '', { missing: false });
  const seen = new Set();
  for (const operation of plan.operations) {
    sourcePath(operation.path); const key = operation.path.toLowerCase();
    if (seen.has(key) || (!digest(operation.oldHash) && operation.oldHash !== null) || (!digest(operation.newHash) && operation.newHash !== null) || (!operation.oldHash && !operation.newHash)) throw fail('Opération de mise à jour invalide.');
    seen.add(key);
    for (const [directory, expected] of [['backup', operation.oldHash], ['staged', operation.newHash]]) if (expected) {
      const filename = await safePath(plan.jobRoot, `${directory}/${operation.path}`, { missing: false, file: true });
      if (hash(await fs.readFile(filename)) !== expected) throw fail('Source préparée modifiée ; mise à jour annulée.');
    }
  }
  for (const [name, value] of Object.entries(plan.incomingHashes)) { sourcePath(name); if (!digest(value)) throw fail('Référence de distribution invalide.'); }
  if (await hasCertificateIdentity(plan.root)) {
    const operation = plan.operations.find(item => item.path === certificateModule);
    const bytes = operation?.newHash ? await fs.readFile(await safePath(plan.jobRoot, 'staged/' + certificateModule, { missing: false, file: true })) : await readSource(plan.root, certificateModule);
    if (!plan.incomingHashes[certificateModule] || !bytes || !certificateCapability.test(bytes.toString('utf8'))) throw fail('La mise a jour supprimerait le support des certificats. Installation refusee.');
  }

}

export async function launchUpdate(plan) {
  await validatePlan(plan);
  if (hash(await fs.readFile(await safePath(plan.jobRoot, 'worker.mjs', { missing: false, file: true }))) !== plan.workerHash) throw fail('Programme d’installation préparé modifié.');
  const child = spawn(plan.nodePath, [plan.worker, '--apply-plan', plan.planFile], { cwd: plan.jobRoot, detached: true, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(fail('Le programme d’installation ne répond pas. Le serveur reste actif.')), 10000);
      const cleanup = () => { clearTimeout(timer); child.off('error', onError); child.off('exit', onExit); child.off('message', onMessage); };
      const onError = error => { cleanup(); reject(error); }, onExit = () => { cleanup(); reject(fail('Le programme d’installation s’est arrêté avant confirmation.')); }, onMessage = message => { if (message?.ready === plan.jobId) { cleanup(); resolve(); } };
      child.on('error', onError); child.on('exit', onExit); child.on('message', onMessage);
    });
  } catch (error) { child.kill(); throw error; }
  child.disconnect(); child.unref();
  return { pid: child.pid, jobId: plan.jobId };
}

async function certificateFloorMode(root) {
  const filename = await safePath(root, 'data/security-floor.json', { file: true });
  if (!await optionalStat(filename)) {
    if (await hasCertificateIdentity(root)) throw fail('Plancher de securite absent. Aucun redemarrage moins protege autorise.');
    return null;
  }
  let floor; try { floor = JSON.parse(await fs.readFile(filename, 'utf8')); } catch { throw fail('Plancher de securite invalide. Redemarrage refuse.'); }
  if (floor.version !== 1 || !['http','https','mtls'].includes(floor.mode) || typeof floor.epoch !== 'string' || !floor.epoch) throw fail('Plancher de securite invalide. Redemarrage refuse.');
  return floor.mode;
}
async function restartServer(plan, expectedVersion) {
  const requiredMode = await certificateFloorMode(plan.root);
  if (await hasCertificateIdentity(plan.root)) await requireCertificateCapability(plan.root, new Map([[certificateModule, await readSource(plan.root, certificateModule)]]));
  const logPath = await safePath(plan.root, 'runtime/update-restart.log', { file: true });
  const log = await fs.open(logPath, 'a', 0o600);
  let child, spawnError;
  try { child = spawn(plan.nodePath, [path.join(plan.root, 'server.mjs')], { cwd: plan.root, env: { ...process.env, BIONIC_MOBILE_PORT: String(plan.port) }, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd] }); child.once('error', error => { spawnError = error; }); }
  finally { await log.close(); }
  let exited = false; child.once('exit', () => { exited = true; });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnError || exited) break;
    let modeViolation = false;
    try {
      let maintenancePort = plan.port;
      const transportFile = await safePath(plan.root, 'runtime/transport.json', { file: true });
      if (await optionalStat(transportFile)) {
        const transport = JSON.parse(await fs.readFile(transportFile, 'utf8'));
        if (transport.version !== 1 || transport.instanceId !== plan.instanceId || transport.pid !== child.pid || !Number.isInteger(transport.adminPort) || transport.adminPort < 1 || transport.adminPort > 65535 || transport.appPort !== plan.port || !['http','https','mtls'].includes(transport.mode) || (transport.mode === 'http' ? transport.appProtocol !== 'http:' : transport.appProtocol !== 'https:' || transport.adminPort === transport.appPort)) throw fail('Transport du serveur redemarre incoherent.');
        if (requiredMode && transport.mode !== requiredMode) { modeViolation = true; throw fail('Le serveur redemarre annonce un niveau different du plancher confirme.'); }
        maintenancePort = transport.adminPort;
      } else if (await hasCertificateIdentity(plan.root)) throw fail('Canal de maintenance du serveur securise absent.');
      const response = await fetch(`http://127.0.0.1:${maintenancePort}/api/ping`, { signal: AbortSignal.timeout(700), redirect: 'error' });
      const value = await response.json();
      const runtime = JSON.parse(await fs.readFile(await safePath(plan.root, 'runtime/server.json', { missing: false, file: true }), 'utf8'));
      if (response.ok && value.app === 'bionic-mobile-local' && value.version === expectedVersion && value.instanceId === plan.instanceId && runtime.pid === child.pid && runtime.instanceId === plan.instanceId && path.resolve(runtime.root) === plan.root && !exited) { child.unref(); return { pid: child.pid, stop: async () => { if (!exited) { child.kill(); await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(3000)]); } } }; }
    } catch { if (modeViolation) break; }
    await sleep(250);
  }
  // Only stop the child created here. Never discover or kill a process by its port.
  if (!exited) { child.kill(); await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(3000)]); }
  throw fail('Le redémarrage de cette installation n’a pas été confirmé.');
}

export async function applyPreparedUpdate(plan, { restart = restartServer, afterOperation } = {}) {
  await validatePlan(plan);
  const lockPath = await safePath(plan.root, 'runtime/update.lock', { file: true });
  let lock;
  try { lock = await fs.open(lockPath, 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') throw fail('Une autre installation est déjà en cours.'); throw error; }
  const status = value => writeJson(path.join(plan.jobRoot, 'status.json'), { ...value, jobId: plan.jobId, version: plan.version, updatedAt: new Date().toISOString() });
  const touched = [];
  let restarted = null, baselineWritten = false;
  try {
    const pkg = JSON.parse((await readSource(plan.root, 'package.json'))?.toString('utf8') || '{}');
    if (pkg.version !== plan.currentVersion) throw fail('La version locale a changé depuis la préparation.');
    for (const operation of plan.operations) { const bytes = await readSource(plan.root, operation.path); if ((bytes ? hash(bytes) : null) !== operation.oldHash) throw fail('Une source locale a changé depuis la préparation.'); }
    for (const [name, expected] of Object.entries(plan.incomingHashes)) {
      if (!plan.operations.some(operation => operation.path === name)) { const bytes = await readSource(plan.root, name); if (!bytes || hash(bytes) !== expected) throw fail('Une source locale inchangée a été modifiée.'); }
    }
    await status({ state: 'applying' });
    for (const operation of plan.operations) {
      const destination = await safePath(plan.root, operation.path, { file: true });
      touched.push(operation);
      await writeJson(path.join(plan.jobRoot, 'journal.json'), { state: 'applying', touched: touched.map(item => item.path) });
      if (operation.newHash) await atomicCopy(await fs.readFile(path.join(plan.jobRoot, 'staged', operation.path)), destination);
      else await fs.unlink(destination);
      await afterOperation?.(operation, touched.length);
    }
    await status({ state: 'restarting' });
    restarted = await restart(plan, plan.version);
    await safePath(plan.root, 'runtime/update-baseline.json', { file: true });
    baselineWritten = true;
    await atomicCopy(Buffer.from(JSON.stringify({ schemaVersion: 1, version: plan.version, files: plan.incomingHashes }) + '\n'), path.join(plan.root, 'runtime/update-baseline.json'));
    await writeJson(path.join(plan.jobRoot, 'journal.json'), { state: 'completed', touched: touched.map(item => item.path) });
    await status({ state: 'completed', pid: restarted?.pid || null });
    return { state: 'completed', jobId: plan.jobId };
  } catch (error) {
    const rollbackErrors = [];
    await restarted?.stop?.();
    for (const operation of touched.reverse()) {
      try { await restoreSourceOperation(plan, operation); }
      catch { rollbackErrors.push(operation.path); }
    }
    if (baselineWritten) {
      try { const destination = await safePath(plan.root, 'runtime/update-baseline.json', { file: true }); if (plan.oldBaseline) await atomicCopy(Buffer.from(JSON.stringify(plan.oldBaseline) + '\n'), destination); else await fs.rm(destination, { force: true }); }
      catch { rollbackErrors.push('runtime/update-baseline.json'); }
    }
    let recovered = false;
    if (touched.length && !rollbackErrors.length) { try { await restart(plan, plan.currentVersion); recovered = true; } catch {} }
    await status({ state: touched.length ? (rollbackErrors.length ? 'rollback-failed' : 'rolled-back') : 'cancelled', recovered, error: error.code === 'UPDATE_REFUSED' ? error.message : 'Installation interrompue ; consulte la sauvegarde des sources.', rollbackErrors });
    if (rollbackErrors.length) throw fail('Retour arrière incomplet. Sauvegarde des sources conservée dans runtime/update-jobs.');
    throw error;
  } finally { await lock.close(); await fs.rm(lockPath, { force: true }); }
}

async function workerMain(planFile) {
  const plan = JSON.parse(await fs.readFile(planFile, 'utf8'));
  if (path.resolve(planFile) !== plan.planFile || path.resolve(process.argv[1]) !== plan.worker) throw fail('Emplacement du programme d’installation invalide.');
  await validatePlan(plan);
  process.send?.({ ready: plan.jobId });
  const deadline = Date.now() + 60000;
  while (true) {
    let alive = true; try { process.kill(plan.parentPid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
    if (!alive) break;
    if (Date.now() > deadline) { await writeJson(path.join(plan.jobRoot, 'status.json'), { state: 'cancelled', version: plan.version, error: 'Le serveur précédent est encore actif ; aucun fichier remplacé.' }); return; }
    await sleep(200);
  }
  await applyPreparedUpdate(plan);
}

if (process.argv[2] === '--apply-plan' && process.argv[3] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await workerMain(process.argv[3]); } catch { process.exitCode = 1; }
}
