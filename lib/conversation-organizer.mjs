import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const UNASSIGNED_PROJECT = 'companion-unassigned';
const ID = /^[\w-]{1,128}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });
function identifier(value) { if (typeof value !== 'string' || !ID.test(value)) throw fail(400, 'Identifiant de conversation ou de projet invalide.'); return value; }

/** Local placement only: native conversations are always read through the read-only store. */
export function createConversationOrganizer({ filename, store, hasLocalUnassigned = async () => false }) {
  if (!path.isAbsolute(filename)) throw new TypeError('An absolute private filename is required.');
  let loaded, writes = Promise.resolve();
  async function locations() {
    if (!loaded) loaded = (async () => {
      try {
        const info = await fs.lstat(filename);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 4_000_000) throw new Error('invalid file');
        const value = JSON.parse(await fs.readFile(filename, 'utf8'));
        if (value.version !== 1 || !Array.isArray(value.native) || value.native.length > 10_000) throw new Error('invalid schema');
        const seen = new Set(), targets = new Set();
        for (const item of value.native) {
          identifier(item.id); identifier(item.sourceProjectId); identifier(item.projectId);
          const key = item.sourceProjectId + ':' + item.id;
          const target = item.projectId + ':' + item.id;
          if (seen.has(key) || targets.has(target) || !Number.isSafeInteger(item.movedAt) || item.movedAt <= 0) throw new Error('invalid entry');
          seen.add(key); targets.add(target);
        }
        return value.native;
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw fail(503, 'Le classement des conversations est illisible. Restaure sa sauvegarde avant de le modifier.');
      }
    })();
    return loaded;
  }
  async function listProjects() {
    const projects = (await store.listProjects()).map(project => ({ ...project, isUnassigned: project.type === 'default' }));
    const nativeDefault = projects.find(project => project.isUnassigned);
    const preserveLocal = nativeDefault && ((await locations()).some(entry => entry.projectId === UNASSIGNED_PROJECT) || await hasLocalUnassigned());
    if (!nativeDefault || preserveLocal) {
      if (projects.some(project => project.id === UNASSIGNED_PROJECT)) throw fail(503, 'Un projet utilise l’identifiant réservé à Sans projet.');
      if (nativeDefault) nativeDefault.name += ' · Bionic';
      projects.push({ id: UNASSIGNED_PROJECT, name: 'Sans projet', type: 'default', isUnassigned: true, localOnly: true, sessionsCount: 0 });
    }
    return projects;
  }
  function project(projects, id) {
    identifier(id);
    const result = projects.find(item => item.id === id);
    if (!result) throw fail(404, 'Projet introuvable. Actualise la liste.');
    return result;
  }
  async function sessionList(projectId, projects, entries) {
    const current = project(projects, projectId);
    const own = current.localOnly ? [] : await store.listSessions(projectId);
    const result = own.filter(item => !entries.some(entry => entry.sourceProjectId === projectId && entry.id === item.id && entry.projectId !== projectId))
      .map(item => ({ ...item, projectId, nativeProjectId: projectId }));
    const sources = new Map();
    for (const entry of entries.filter(item => item.projectId === projectId && item.sourceProjectId !== projectId)) {
      if (!projects.some(item => item.id === entry.sourceProjectId)) continue;
      if (!sources.has(entry.sourceProjectId)) sources.set(entry.sourceProjectId, await store.listSessions(entry.sourceProjectId));
      const item = sources.get(entry.sourceProjectId).find(item => item.id === entry.id);
      if (item) result.push({ ...item, projectId, nativeProjectId: entry.sourceProjectId });
    }
    return result;
  }
  async function listSessions(projectId) {
    await writes.catch(() => {});
    return sessionList(projectId, await listProjects(), await locations());
  }
  async function getConversation(projectId, id) {
    identifier(id); await writes.catch(() => {});
    const entries = await locations();
    const item = (await sessionList(projectId, await listProjects(), entries)).find(item => item.id === id);
    if (!item) throw fail(404, 'Conversation introuvable dans ce projet.');
    const relocated = entries.some(entry => entry.sourceProjectId === item.nativeProjectId && entry.id === id);
    return { ...await store.getConversation(item.nativeProjectId, id), projectId, nativeProjectId: item.nativeProjectId, ...(relocated ? { fileAccess: false } : {}) };
  }
  async function save(entries) {
    if (entries.length > 10_000) throw fail(409, 'La limite de classement des conversations est atteinte.');
    const serialized = JSON.stringify({ version: 1, native: entries });
    if (Buffer.byteLength(serialized) > 4_000_000) throw fail(409, 'Le classement dépasse sa limite de taille.');
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      try { if ((await fs.lstat(filename)).isSymbolicLink()) throw fail(503, 'Le fichier de classement ne doit pas être un lien.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await fs.writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, filename);
      loaded = Promise.resolve(entries);
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }
  function moveNative({ projectId, id, targetProjectId }) {
    const next = writes.catch(() => {}).then(async () => {
      identifier(id);
      const projects = await listProjects(), entries = await locations();
      project(projects, projectId); project(projects, targetProjectId);
      const source = (await sessionList(projectId, projects, entries)).find(item => item.id === id);
      if (!source) throw fail(404, 'Conversation introuvable dans ce projet.');
      if (targetProjectId !== projectId && (await sessionList(targetProjectId, projects, entries)).some(item => item.id === id)) throw fail(409, 'Une conversation portant cet identifiant existe déjà dans le projet cible.');
      const original = await store.getConversation(source.nativeProjectId, id);
      if (targetProjectId !== projectId) {
        const updated = entries.filter(entry => entry.sourceProjectId !== source.nativeProjectId || entry.id !== id);
        updated.push({ id, sourceProjectId: source.nativeProjectId, projectId: targetProjectId, movedAt: Date.now() });
        await save(updated);
      }
      return { ...original, projectId: targetProjectId, nativeProjectId: source.nativeProjectId, fileAccess: false };
    });
    writes = next;
    return next;
  }
  return { listProjects, listSessions, getConversation, moveNative };
}
