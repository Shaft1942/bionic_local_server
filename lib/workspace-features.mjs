import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PROJECT = /^[\w-]{1,128}$/;
const ID = /^[a-zA-Z0-9._-]{1,180}$/;
const HASH = /^[a-f0-9]{64}$/;
const OUTCOMES = new Set(['completed', 'stopped', 'error', 'interrupted']);
const FILE_ACTIONS = new Set(['write_project_file', 'replace_project_text']);
const MAX_PINS = 1000, MAX_STORAGE = 128_000_000, MAX_FILE = 2_000_000, MAX_MESSAGE = 256_000;
const fail = (status, message) => Object.assign(new Error(message), { status });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const timestamp = value => Number.isSafeInteger(value) && value > 0;
const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);

function identifier(value, pattern, message) {
  if (typeof value !== 'string' || !pattern.test(value)) throw fail(400, message);
  return value;
}
function titleFor(value, fallback = 'Livrable') {
  if (value === undefined) return String(fallback).replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 120) || 'Livrable';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\x00-\x1f\x7f]/.test(value)) throw fail(400, 'Le titre doit contenir entre 1 et 120 caractères, sans caractère de contrôle.');
  return value.trim();
}
function downloadName(value, text = false) {
  let name = String(value || 'livrable').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').replace(/[. ]+$/g, '').slice(0, 160);
  if (!name || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) name = 'livrable-' + (name || 'fichier');
  if (text && !/\.txt$/i.test(name)) name += '.txt';
  return name;
}
function preview(bytes) {
  try {
    let encoding = 'utf-8', offset = 0;
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) offset = 3;
    else if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = 'utf-16le'; offset = 2; }
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = 'utf-16be'; offset = 2; }
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset));
    if (text.includes('\0')) return {};
    return { text: text.slice(0, 12_000), textTruncated: text.length > 12_000 };
  } catch { return {}; }
}

/** Private immutable copies. The client supplies source ids, never a filesystem path. */
export function createWorkspaceFeatures({ directory, listProjects, listWebChats, readConversation, projectFiles, listActivity }) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new TypeError('An absolute private workspace directory is required.');
  let writes = Promise.resolve();
  function serialize(work) {
    const next = writes.catch(() => {}).then(work);
    writes = next;
    return next;
  }
  async function project(projectId) {
    identifier(projectId, PROJECT, 'Projet invalide.');
    const result = (await listProjects()).find(item => item.id === projectId);
    if (!result) throw fail(404, 'Projet Bionic introuvable.');
    return result;
  }
  async function privateRead(filename, maximum) {
    let handle;
    try {
      if ((await fs.lstat(filename)).isSymbolicLink()) throw fail(409, 'La copie du livrable est indisponible ou endommagée.');
      handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const info = await handle.stat();
      if (!info.isFile() || info.size > maximum) throw fail(409, 'La copie du livrable est indisponible ou endommagée.');
      const bytes = await handle.readFile();
      if (bytes.length > maximum) throw fail(409, 'La copie du livrable est indisponible ou endommagée.');
      return bytes;
    } finally { await handle?.close(); }
  }
  async function metadata(id) {
    identifier(id, UUID, 'Livrable invalide.');
    try {
      const entry = JSON.parse(await privateRead(path.join(directory, id + '.json'), 16_000));
      if (entry.id !== id || !matches(entry.projectId, PROJECT) || !['message', 'file'].includes(entry.kind) || !matches(entry.hash, HASH) ||
        !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > (entry.kind === 'message' ? MAX_MESSAGE : MAX_FILE) || !timestamp(entry.createdAt) ||
        typeof entry.title !== 'string' || titleFor(entry.title) !== entry.title || typeof entry.name !== 'string' || entry.name !== downloadName(entry.name) ||
        !entry.origin || !matches(entry.origin.chatId, ID) || !matches(entry.origin.messageId, ID) ||
        (entry.kind === 'file' && (entry.origin.rootId !== 'project' || !matches(entry.origin.actionId, UUID) || typeof entry.origin.path !== 'string' || entry.origin.path.length > 1600))) {
        throw fail(409, 'La fiche du livrable est endommagée.');
      }
      return entry;
    } catch (e) {
      if (e.status) throw e;
      if (e.code === 'ENOENT') throw fail(404, 'Livrable introuvable.');
      throw fail(409, 'La fiche du livrable est indisponible ou endommagée.');
    }
  }
  async function entries() {
    let names;
    try { names = await fs.readdir(directory); }
    catch (e) { if (e.code === 'ENOENT') return []; throw fail(503, 'L’étagère de livrables est indisponible.'); }
    const ids = names.filter(name => name.endsWith('.json') && UUID.test(name.slice(0, -5))).map(name => name.slice(0, -5));
    if (ids.length > MAX_PINS) throw fail(503, 'L’étagère dépasse sa limite de livrables.');
    const result = [];
    for (const id of ids) result.push(await metadata(id));
    return result;
  }
  async function entryFor(projectId, id) {
    await project(projectId);
    const entry = await metadata(id);
    if (entry.projectId !== projectId) throw fail(404, 'Livrable introuvable dans ce projet.');
    return entry;
  }
  async function snapshot(entry) {
    try {
      const bytes = await privateRead(path.join(directory, entry.id + '.bin'), MAX_FILE);
      if (bytes.length !== entry.size || hash(bytes) !== entry.hash) throw fail(409, 'La copie du livrable est endommagée.');
      return bytes;
    } catch (e) {
      if (e.status) throw e;
      throw fail(409, 'La copie du livrable est indisponible ou endommagée.');
    }
  }
  async function dto(entry) {
    let sourceStatus = 'snapshot';
    if (entry.kind === 'file') {
      try {
        const current = await projectFiles.download(entry.projectId, 'project', entry.origin.path, false);
        sourceStatus = hash(current.bytes) === entry.hash ? 'unchanged' : 'changed';
      } catch (e) { sourceStatus = e.status === 404 ? 'missing' : 'unavailable'; }
    }
    const { id, projectId, title, kind, name, size, createdAt, origin, hash: digest } = entry;
    return { id, projectId, title, kind, name, size, createdAt, origin, hash: digest, sourceStatus };
  }
  async function atomicMetadata(entry) {
    const temporary = path.join(directory, entry.id + '.' + randomUUID() + '.tmp');
    try { await fs.writeFile(temporary, JSON.stringify(entry), { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, path.join(directory, entry.id + '.json')); }
    finally { await fs.unlink(temporary).catch(() => {}); }
  }

  async function activity(projectId, page) {
    const projects = projectId === undefined || projectId === null ? await listProjects() : [await project(projectId)];
    const events = [];
    const indexed = listActivity ? await listActivity() : null;
    for (const current of projects) {
      for (const info of indexed || await listWebChats(current.id)) {
        if (info.projectId !== current.id || !/^web-[a-f0-9-]{36}$/i.test(info.id || '')) continue;
        const chat = indexed ? { ...info, messages: info.activity.map(item => ({ ...item, role: 'assistant' })) } : await readConversation(current.id, info.id);
        if (chat.projectId !== current.id) continue;
        for (const message of chat.messages || []) {
          if (message.role !== 'assistant' || !ID.test(message.id || '') || !OUTCOMES.has(message.outcome) || !timestamp(message.finishedAt)) continue;
          events.push({ id: chat.id + ':' + message.id, projectId: current.id, projectName: current.name, chatId: chat.id, chatName: chat.name, messageId: message.id, outcome: message.outcome, finishedAt: message.finishedAt });
        }
      }
    }
    events.sort((a, b) => b.finishedAt - a.finishedAt || a.id.localeCompare(b.id));
    if (page) {
      const { pageItems } = await import('./conversation-repository.mjs');
      const result = pageItems(events, page);
      return { events: result.items, truncated: result.hasMore, hasMore: result.hasMore, nextCursor: result.nextCursor, total: result.total };
    }
    return { events: events.slice(0, 100), truncated: events.length > 100 };
  }
  async function listDeliverables(projectId) {
    await project(projectId);
    await writes.catch(() => {});
    const records = (await entries()).filter(entry => entry.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    const deliverables = [];
    for (const entry of records) deliverables.push(await dto(entry));
    return { deliverables, limit: MAX_PINS };
  }
  async function pinDeliverable(input) {
    return serialize(async () => {
      const { projectId, chatId, messageId, actionId, kind } = input || {};
      await project(projectId);
      identifier(chatId, ID, 'Conversation invalide.'); identifier(messageId, ID, 'Message invalide.');
      if (kind !== 'message' && kind !== 'file') throw fail(400, 'Type de livrable invalide.');
      const chat = await readConversation(projectId, chatId);
      if (chat.projectId !== projectId) throw fail(404, 'Conversation introuvable dans ce projet.');
      const message = chat.messages?.find(item => item.id === messageId && item.role === 'assistant');
      if (!message) throw fail(404, 'Réponse introuvable.');
      let bytes, name;
      const origin = { chatId, chatName: String(chat.name || 'Conversation').slice(0, 200), messageId };
      if (kind === 'message') {
        if (typeof message.text !== 'string' || !message.text.trim()) throw fail(400, 'Cette réponse ne contient aucun texte à conserver.');
        if (chat.generation?.status === 'running' && (chat.generation.replyId === messageId || (!chat.generation.replyId && chat.messages.at(-1) === message))) throw fail(409, 'Attends la fin de cette réponse avant de la conserver.');
        bytes = Buffer.from(message.text, 'utf8');
        if (bytes.length > MAX_MESSAGE) throw fail(413, 'Cette réponse dépasse la limite de conservation de 256 Ko. Aucun texte n’a été tronqué.');
        name = downloadName(input.title ?? titleFor(undefined, message.text.split('\n')[0]), true);
      } else {
        identifier(actionId, UUID, 'Action de fichier invalide.');
        const action = message.actions?.find(item => item.id === actionId);
        if (!action?.ok || (action.projectId && action.projectId !== projectId) || !FILE_ACTIONS.has(action.name) || action.restored || !HASH.test(action.hash || '') || typeof action.path !== 'string') throw fail(409, 'Seule une création ou modification du projet courant, confirmée et encore actuelle, peut être conservée.');
        const file = await projectFiles.download(projectId, 'project', action.path, false);
        bytes = file.bytes;
        if (!Buffer.isBuffer(bytes) || bytes.length > MAX_FILE) throw fail(413, 'Ce fichier dépasse la limite de conservation de 2 Mo.');
        if (hash(bytes) !== action.hash) throw fail(409, 'Le fichier du PC a changé depuis cette action. Aucune copie obsolète n’a été épinglée.');
        Object.assign(origin, { actionId, path: action.path, rootId: 'project' });
        name = downloadName(file.name || path.posix.basename(action.path));
      }
      const title = titleFor(input.title, kind === 'message' ? message.text.split('\n')[0] : name);
      const records = await entries(), digest = hash(bytes);
      const existing = records.find(entry => entry.projectId === projectId && entry.kind === kind && entry.origin.chatId === chatId && entry.origin.messageId === messageId && entry.origin.actionId === origin.actionId && entry.hash === digest);
      if (existing) { await snapshot(existing); return dto(existing); }
      if (records.length >= MAX_PINS || records.reduce((sum, entry) => sum + entry.size, 0) + bytes.length > MAX_STORAGE) throw fail(413, 'L’étagère est pleine (1 000 livrables ou 128 Mo). Retire des copies avant d’en conserver d’autres.');
      const entry = { id: randomUUID(), projectId, title, kind, name, size: bytes.length, createdAt: Date.now(), origin, hash: digest };
      await fs.mkdir(directory, { recursive: true });
      const filename = path.join(directory, entry.id + '.bin'), temporary = filename + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, filename);
        await atomicMetadata(entry);
      } catch (e) { await fs.unlink(filename).catch(() => {}); throw e; }
      finally { await fs.unlink(temporary).catch(() => {}); }
      return dto(entry);
    });
  }
  async function getDeliverable(projectId, id) {
    await writes.catch(() => {});
    const entry = await entryFor(projectId, id), bytes = await snapshot(entry);
    return { ...await dto(entry), ...preview(bytes) };
  }
  async function downloadDeliverable(projectId, id) {
    await writes.catch(() => {});
    const entry = await entryFor(projectId, id);
    return { bytes: await snapshot(entry), name: entry.name, mime: entry.kind === 'message' ? 'text/plain; charset=utf-8' : 'application/octet-stream', inline: false };
  }
  async function renameDeliverable(input) {
    return serialize(async () => {
      const entry = await entryFor(input?.projectId, input?.id);
      if (input.title === undefined) throw fail(400, 'Le nouveau titre est requis.');
      entry.title = titleFor(input.title);
      await atomicMetadata(entry);
      return dto(entry);
    });
  }
  async function removeDeliverable(input) {
    return serialize(async () => {
      const entry = await entryFor(input?.projectId, input?.id);
      // Remove the visible record first: a crash may leave a harmless private orphan,
      // but can never leave a visible record whose copy was deliberately removed.
      await fs.unlink(path.join(directory, entry.id + '.json'));
      await fs.unlink(path.join(directory, entry.id + '.bin')).catch(e => { if (e.code !== 'ENOENT') throw e; });
      return { removed: true, id: entry.id };
    });
  }
  return Object.freeze({ activity, listDeliverables, pinDeliverable, getDeliverable, downloadDeliverable, renameDeliverable, removeDeliverable });
}
