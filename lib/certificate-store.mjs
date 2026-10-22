import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, X509Certificate, createPrivateKey } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createAuthority, issueServer, issueClient, normalizeCertificateHosts } from './certificate-pki.mjs';
const execFileAsync = promisify(execFile);
const RANK = { http: 0, https: 1, mtls: 2 };
const FP = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const normalize = value => String(value || '').replaceAll(':', '').toLowerCase();
const clone = value => structuredClone(value);
const locked = message => Object.assign(new Error(`Sécurité verrouillée : ${message} Récupération locale sur le PC requise.`), {code:'SECURITY_LOCKED'});
let windowsSid;
export async function protectPrivatePath(filename, {directory = false} = {}) {
  if (process.platform !== 'win32') { await fs.chmod(filename, directory ? 0o700 : 0o600); return; }
  if (!windowsSid) {
    const {stdout} = await execFileAsync('whoami.exe', ['/user','/fo','csv','/nh'], {windowsHide:true});
    windowsSid = stdout.match(/S-1-5-(?:\d+-)*\d+/)?.[0];
    if (!windowsSid) throw locked('Impossible de déterminer le compte Windows.');
  }
  const inheritance = directory ? '(OI)(CI)' : '';
  // No shell: filename and SID are passed as individual arguments.
  await execFileAsync('icacls.exe', [filename, '/reset', '/q'], {windowsHide:true});
  await execFileAsync('icacls.exe', [filename, '/inheritance:r', '/grant:r', `*${windowsSid}:${inheritance}F`, `*S-1-5-18:${inheritance}F`, '/q'], {windowsHide:true});
}
export async function writePrivateFile(filename, bytes) {
  const directory = path.dirname(path.resolve(filename));
  await rejectLinkedAncestors(directory);
  if (await exists(filename)) await rejectLink(filename);
  await fs.mkdir(directory, {recursive:true,mode:0o700});
  await protectPrivatePath(directory, {directory:true});
  const temporary = path.join(directory, `.${path.basename(filename)}.${randomUUID()}.tmp`);
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await protectPrivatePath(temporary);
    // Windows AV/indexing can briefly keep a destination handle open. Retry
    // atomic rename only; never unlink the durable destination as a fallback.
    for (let attempt=0; ; attempt++) {
      try { await fs.rename(temporary,filename); break; }
      catch(e) { if(process.platform !== 'win32' || !['EPERM','EACCES','EBUSY'].includes(e.code) || attempt >= 6) throw e; await delay(25*(attempt+1)); }
    }
  } finally { await fs.rm(temporary, {force:true}); }
}
async function exists(file) { try { await fs.lstat(file); return true; } catch(e) { if(e.code === 'ENOENT') return false; throw e; } }
async function rejectLink(file) { const stat = await fs.lstat(file); if(stat.isSymbolicLink()) throw locked('Lien symbolique interdit dans le stockage de sécurité.'); }
async function rejectLinkedAncestors(file) {
  let current = path.resolve(file);
  while (true) {
    if (await exists(current)) await rejectLink(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function freshState() { return {version:1,mode:'http',epoch:randomUUID(),authority:null,server:null,candidate:null,devices:[]}; }
// Explicit offline recovery entry point: deliberately does not load the old
// state, which may be corrupt, incomplete, or expired. The CLI enforces offline
// use and rotates the password/session identity before restarting the server.
export async function resetCertificateStoreLocal(dataDir) {
  const resolved = path.resolve(dataDir);
  const directory = path.join(resolved,'security');
  const floorFile = path.join(resolved,'security-floor.json');
  await rejectLinkedAncestors(resolved);
  if (await exists(directory)) await rejectLink(directory);
  if (await exists(floorFile)) await rejectLink(floorFile);
  await fs.rm(directory,{recursive:true,force:true});
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const next = freshState();
  await writePrivateFile(floorFile,JSON.stringify({version:1,epoch:next.epoch,mode:next.mode},null,2)+'\n');
  await writePrivateFile(path.join(directory,'state.json'),JSON.stringify(next,null,2)+'\n');
  return openCertificateStore(resolved);
}
function validateState(state) {
  if (!state || state.version !== 1 || typeof state.mode !== 'string' || !Object.hasOwn(RANK,state.mode) || typeof state.epoch !== 'string' || !UUID.test(state.epoch) || !Array.isArray(state.devices) || state.devices.length > 1000) throw locked('État de sécurité invalide.');
  for (const [type, item] of [['authority',state.authority],['server',state.server],['candidate',state.candidate]]) {
    if (!item) continue;
    if (typeof item.fingerprint !== 'string' || !FP.test(item.fingerprint) || typeof item.notBefore !== 'string' || !Number.isFinite(Date.parse(item.notBefore)) || typeof item.expiresAt !== 'string' || !Number.isFinite(Date.parse(item.expiresAt)) || item.keyFile !== `${type}-${item.fingerprint}.key` || item.certFile !== `${type}-${item.fingerprint}.crt`) throw locked('Identité de certificat invalide.');
    if (type !== 'authority' && JSON.stringify(normalizeCertificateHosts(item.hosts)) !== JSON.stringify(item.hosts)) throw locked('Adresses de certificat invalides.');
  }
  if (state.mode !== 'http' && (!state.authority || !state.server)) throw locked('Certificats actifs manquants.');
  const ids = new Set(), fingerprints = new Set();
  for (const d of state.devices) {
    if (typeof d.id !== 'string' || !UUID.test(d.id) || typeof d.fingerprint !== 'string' || !FP.test(d.fingerprint) || typeof d.name !== 'string' || typeof d.notBefore !== 'string' || !Number.isFinite(Date.parse(d.notBefore)) || typeof d.expiresAt !== 'string' || !Number.isFinite(Date.parse(d.expiresAt)) || (d.revokedAt !== null && (typeof d.revokedAt !== 'string' || !Number.isFinite(Date.parse(d.revokedAt)))) || ids.has(d.id) || fingerprints.has(d.fingerprint)) throw locked('Registre des appareils invalide.');
    ids.add(d.id); fingerprints.add(d.fingerprint);
  }
}
export async function openCertificateStore(dataDir, {allowExpired = false} = {}) {
  const directory = path.join(path.resolve(dataDir), 'security');
  const stateFile = path.join(directory, 'state.json');
  const floorFile = path.join(path.resolve(dataDir), 'security-floor.json');
  let state;
  let chain = Promise.resolve();
  const serialize = operation => {
    const next = chain.then(operation);
    chain = next.catch(() => {});
    return next;
  };
  const writeState = async next => {
    validateState(next);
    // Raise the durable floor first. A crash between these two atomic writes
    // fails closed on restart rather than restoring a weaker transport.
    await writePrivateFile(floorFile, JSON.stringify({version:1,epoch:next.epoch,mode:next.mode},null,2)+'\n');
    await writePrivateFile(stateFile, JSON.stringify(next,null,2)+'\n');
    state = next;
  };
  const pair = async metadata => {
    if (!metadata) throw locked('Certificat demandé absent.');
    const keyPath = path.join(directory,metadata.keyFile), certPath = path.join(directory,metadata.certFile);
    await rejectLink(keyPath); await rejectLink(certPath);
    const [key,cert] = await Promise.all([fs.readFile(keyPath,'utf8'),fs.readFile(certPath,'utf8')]);
    const x = new X509Certificate(cert);
    if (normalize(x.fingerprint256) !== metadata.fingerprint || !x.checkPrivateKey(createPrivateKey(key)) || new Date(x.validTo).toISOString() !== metadata.expiresAt || new Date(x.validFrom).toISOString() !== metadata.notBefore) throw locked('Clé ou certificat incohérent.');
    return {key,cert};
  };
  const persistPair = async (type, issued, extra = {}) => {
    const metadata = {fingerprint:issued.fingerprint,notBefore:issued.notBefore,expiresAt:issued.expiresAt,keyFile:`${type}-${issued.fingerprint}.key`,certFile:`${type}-${issued.fingerprint}.crt`,...extra};
    await writePrivateFile(path.join(directory,metadata.keyFile),issued.key);
    await writePrivateFile(path.join(directory,metadata.certFile),issued.cert);
    return metadata;
  };
  try {
    const floorExists = await exists(floorFile), directoryExists = await exists(directory);
    await rejectLinkedAncestors(directory);
    if (!floorExists && !directoryExists) { state = freshState(); }
    else {
      if (!floorExists || !directoryExists || !await exists(stateFile)) throw locked('Stockage de sécurité incomplet.');
      await rejectLink(directory); await rejectLink(floorFile); await rejectLink(stateFile);
      state = JSON.parse(await fs.readFile(stateFile,'utf8')); validateState(state);
      const floor = JSON.parse(await fs.readFile(floorFile,'utf8'));
      if (floor.version !== 1 || floor.epoch !== state.epoch || floor.mode !== state.mode) throw locked('Plancher de sécurité incohérent.');
      await protectPrivatePath(directory,{directory:true});
      let authority;
      for (const type of ['authority','server','candidate']) {
        if (!state[type]) continue;
        const p = await pair(state[type]);
        const x = new X509Certificate(p.cert);
        if (type === 'authority') {
          if (!x.ca || !x.verify(x.publicKey)) throw locked('Autorité invalide.');
          authority = x;
        } else {
          if (x.ca || !authority || !x.verify(authority.publicKey) || !x.keyUsage?.includes('1.3.6.1.5.5.7.3.1') || x.keyUsage.includes('1.3.6.1.5.5.7.3.2')) throw locked('Certificat serveur invalide.');
          for (const host of state[type].hosts) if (!(x.checkHost(host) || x.checkIP(host))) throw locked('SAN incohérent.');
        }
        if ((type === 'authority' || type === 'server') && state.mode !== 'http' && ((!allowExpired && Date.parse(x.validTo) <= Date.now()) || Date.parse(x.validFrom) > Date.now())) throw locked('Certificat actif expiré ou pas encore valide.');
        await protectPrivatePath(path.join(directory,state[type].keyFile));
      }
    }
  } catch(e) { if(e.code === 'SECURITY_LOCKED') throw e; throw locked('Stockage absent, corrompu ou inaccessible.'); }
  const publicStatus = () => ({ version:1,mode:state.mode,epoch:state.epoch,authority:state.authority ? {fingerprint:state.authority.fingerprint,notBefore:state.authority.notBefore,expiresAt:state.authority.expiresAt} : null,server:state.server ? {fingerprint:state.server.fingerprint,notBefore:state.server.notBefore,expiresAt:state.server.expiresAt,hosts:[...state.server.hosts]} : null,candidate:state.candidate ? {fingerprint:state.candidate.fingerprint,notBefore:state.candidate.notBefore,expiresAt:state.candidate.expiresAt,hosts:[...state.candidate.hosts]} : null,devices:state.devices.map(({id,name,fingerprint,serialNumber,createdAt,notBefore,expiresAt,revokedAt})=>({id,name,fingerprint,serialNumber,createdAt,notBefore,expiresAt,revokedAt})) });
  const ensureAuthority = async () => {
    if (state.authority) return pair(state.authority);
    const issued = await createAuthority({name:`Bionic ${state.epoch}`});
    const metadata = await persistPair('authority',issued);
    await writeState({...state,authority:metadata});
    return {key:issued.key,cert:issued.cert};
  };
  const store = {
    directory,
    get state() { return clone(state); },
    publicStatus,
    ensureAuthority: () => serialize(ensureAuthority),
    prepareServer: ({hosts}) => serialize(async () => {
      hosts = normalizeCertificateHosts(hosts);
      const authority = await ensureAuthority();
      const issued = await issueServer({authority,hosts});
      const metadata = await persistPair('candidate',issued,{hosts});
      await writeState({...state,candidate:metadata});
      return publicStatus().candidate;
    }),
    confirmServer: (options) => serialize(async () => {
      const fingerprint = normalize(typeof options === 'string' ? options : options?.fingerprint);
      if (!state.candidate || fingerprint !== state.candidate.fingerprint) throw new Error('Certificat candidat inconnu.');
      const issued = await pair(state.candidate);
      const server = await persistPair('server',{...issued,...state.candidate},{hosts:state.candidate.hosts});
      await writeState({...state,server,candidate:null,mode:state.mode === 'mtls' ? 'mtls' : 'https'});
      return publicStatus();
    }),
    activateMtls: () => serialize(async () => {
      if (!state.server || state.mode === 'http') throw new Error('Confirmer HTTPS avant le mTLS.');
      if (!state.devices.some(d => !d.revokedAt && Date.parse(d.notBefore) <= Date.now() && Date.parse(d.expiresAt) > Date.now())) throw new Error('Aucun appareil valide enrôlé.');
      await writeState({...state,mode:'mtls'}); return publicStatus();
    }),
    issueDevice: ({name,passphrase,days}) => serialize(async () => {
      const authority = await ensureAuthority();
      const issued = await issueClient({authority,name,passphrase,days});
      const device = {id:randomUUID(),name:String(name).trim(),fingerprint:issued.fingerprint,serialNumber:issued.serialNumber,createdAt:new Date().toISOString(),notBefore:issued.notBefore,expiresAt:issued.expiresAt,revokedAt:null};
      await writeState({...state,devices:[...state.devices,device]});
      // The key only lives inside the encrypted archive returned to local export.
      return {device:clone(device),pfx:issued.pfx};
    }),
    revokeDevice: id => serialize(async () => {
      const d = state.devices.find(device => device.id === id || device.fingerprint === normalize(id));
      if (!d) throw new Error('Appareil inconnu.');
      const devices = state.devices.map(device => device.id === d.id ? {...device,revokedAt:device.revokedAt || new Date().toISOString()} : device);
      await writeState({...state,devices}); return publicStatus();
    }),
    isDeviceAllowed: fingerprint => state.devices.some(d => d.fingerprint === normalize(fingerprint) && !d.revokedAt && Date.parse(d.notBefore) <= Date.now() && Date.parse(d.expiresAt) > Date.now()),
    tlsOptions: async ({candidate=false,mode=state.mode} = {}) => {
      if (!['https','mtls'].includes(mode)) throw new Error('Niveau TLS invalide.');
      const selected = candidate ? (state.candidate || state.server) : state.server;
      const [server,authority] = await Promise.all([pair(selected),pair(state.authority)]);
      return {...server,ca:authority.cert,minVersion:'TLSv1.2',requestCert:mode === 'mtls',rejectUnauthorized:mode === 'mtls',sessionTimeout:1};
    },
    resetLocal: () => serialize(async () => {
      // Caller must enforce local, offline use. No network route calls this.
      const reset = await resetCertificateStoreLocal(dataDir);
      state = reset.state;
      return publicStatus();
    }),
  };
  return store;
}
