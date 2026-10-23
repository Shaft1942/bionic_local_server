import { promises as defaultFS } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const ID = /^[\w-]{1,128}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function identifier(value) { if (typeof value !== 'string' || !ID.test(value) || value === 'companion-unassigned') throw fail(400, 'Identifiant de projet invalide.'); return value; }
function name(value) { if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\x00-\x1f\x7f]/.test(value)) throw fail(400, 'Saisis un nom de projet de 1 à 120 caractères sur une ligne.'); return value.trim(); }

/** The companion owns adopted identities and explicit folder grants; native history stays read-only. */
export function createLocalProjects({ filename, nativeStore, nativeRoots, fallbackProjects = async () => [], fs = defaultFS }) {
  if (!path.isAbsolute(filename)) throw new TypeError('An absolute local project registry is required.');
  let loaded, writes = Promise.resolve(), nativeUnavailable = false;
  async function records() {
    if (!loaded) loaded = (async () => {
      try {
        const info = await fs.lstat(filename);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 4_000_000) throw Error('invalid registry');
        const data = JSON.parse(await fs.readFile(filename, 'utf8'));
        if (data.version !== 1 || !Array.isArray(data.projects) || data.projects.length > 1000) throw Error('invalid registry');
        const seen = new Set();
        for (const entry of data.projects) {
          identifier(entry.id); name(entry.name);
          if (seen.has(entry.id) || !Array.isArray(entry.roots) || entry.roots.length > 100 || !['local', 'bionic'].includes(entry.provenance) || !Number.isSafeInteger(entry.createdAt)) throw Error('invalid project');
          seen.add(entry.id);
          const roots = new Set();
          for (const root of entry.roots) {
            if (!root || !ID.test(root.id) || roots.has(root.id) || typeof root.path !== 'string' || !path.isAbsolute(root.path) || typeof root.name !== 'string' || typeof root.writable !== 'boolean' || root.pinned !== true) throw Error('invalid grant');
            roots.add(root.id);
          }
        }
        return data.projects;
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw fail(503, 'Le registre local des projets est illisible. Les octets sont conservés ; restaure une sauvegarde avant toute modification.');
      }
    })();
    return loaded;
  }
  async function save(projects) {
    const bytes = JSON.stringify({ version: 1, projects });
    if (projects.length > 1000 || Buffer.byteLength(bytes) > 4_000_000) throw fail(409, 'Le registre local des projets a atteint sa limite.');
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      try { if ((await fs.lstat(filename)).isSymbolicLink()) throw fail(503, 'Le registre local ne doit pas être un lien.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, filename);
      loaded = Promise.resolve(projects);
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }
  function mutate(work) { const next = writes.catch(() => {}).then(work); writes = next; return next; }
  const dto = entry => ({ id: entry.id, name: entry.name, type: 'project', localOnly: true, locallyOwned: true, ...(entry.provenance === 'bionic' ? { nativeProjectId: entry.id } : {}), provenance: entry.provenance, sessionsCount: 0 });
  async function nativeProjects() {
    try { const projects = await nativeStore.listProjects(); nativeUnavailable = false; return projects; }
    catch { nativeUnavailable = true; return []; }
  }
  async function listProjects() {
    await writes.catch(() => {});
    const own = await records(), native = await nativeProjects(), merged = new Map(native.map(entry => [entry.id, entry]));
    for (const entry of await fallbackProjects()) if (entry && ID.test(entry.id) && entry.id !== 'companion-unassigned' && !merged.has(entry.id)) merged.set(entry.id, { id: entry.id, name: typeof entry.name === 'string' ? entry.name.slice(0, 120) : 'Projet local', type: 'project', localOnly: true, recovered: true, sessionsCount: 0 });
    for (const entry of own) merged.set(entry.id, dto(entry));
    return [...merged.values()];
  }
  async function create(input) {
    const title = name(input?.name);
    return mutate(async () => {
      const projects = await records(), entry = { id: 'local-' + randomUUID(), name: title, roots: [], provenance: 'local', createdAt: Date.now() };
      await save([...projects, entry]);
      return dto(entry);
    });
  }
  async function previewAdoption(projectId) {
    identifier(projectId);
    if ((await records()).some(entry => entry.id === projectId)) throw fail(409, 'Ce projet est déjà géré localement.');
    const project = (await nativeProjects()).find(entry => entry.id === projectId);
    if (!project) throw fail(nativeUnavailable ? 503 : 404, 'Le projet Bionic doit être disponible pour préparer son adoption.');
    const roots = (await nativeRoots(projectId)).map(root => ({ id: root.id, name: root.name, path: root.directory, writable: root.writable === true }));
    const snapshot = { id: project.id, name: name(project.name), roots };
    return { ...snapshot, fingerprint: digest(snapshot), notice: 'Choisis les dossiers et leurs droits. Les historiques Bionic restent en lecture seule.' };
  }
  async function adopt(input) {
    if (!input || !Array.isArray(input.roots) || input.roots.length > 100 || typeof input.fingerprint !== 'string') throw fail(400, 'Confirme les dossiers affichés dans l’aperçu.');
    return mutate(async () => {
      const preview = await previewAdoption(input.projectId);
      if (input.fingerprint !== preview.fingerprint) throw fail(409, 'Les dossiers ou droits ont changé. Recommence l’aperçu.');
      const roots = [], seen = new Set();
      for (const selected of input.roots) {
        const candidate = preview.roots.find(root => root.id === selected?.id);
        if (!candidate || seen.has(candidate.id) || typeof selected.writable !== 'boolean' || (selected.writable && !candidate.writable)) throw fail(403, 'Ces droits ne figurent pas dans l’aperçu du projet.');
        seen.add(candidate.id);
        roots.push({ ...candidate, writable: selected.writable, pinned: true });
      }
      const entry = { id: preview.id, name: preview.name, provenance: 'bionic', createdAt: Date.now(), roots };
      await save([...(await records()), entry]);
      return dto(entry);
    });
  }
  async function rootsFor(projectId) {
    const entry = (await records()).find(entry => entry.id === projectId);
    return entry ? structuredClone(entry.roots) : null;
  }
  async function listSessions(projectId) {
    const own = (await records()).find(entry => entry.id === projectId);
    if (own?.provenance === 'local') return [];
    try { return await nativeStore.listSessions(projectId); }
    catch (error) {
      const localKnown = own || (await fallbackProjects()).some(entry => entry.id === projectId);
      if (!localKnown) throw error;
      nativeUnavailable = true;
      return [];
    }
  }
  return { listProjects, listSessions, getConversation: (...args) => nativeStore.getConversation(...args), create, previewAdoption, adopt, rootsFor, flush: () => writes, status: () => ({ nativeUnavailable }) };
}
