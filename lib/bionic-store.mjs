import { DatabaseSync } from 'node:sqlite';
import { readFile, realpath, stat, copyFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const LIMITS = Object.freeze({ maxMessages: 400, maxChars: 800_000, maxEntries: 20_000, maxSessions: 2_000 });

export class BionicStoreError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.name = 'BionicStoreError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status) { throw new BionicStoreError(code, message, status); }
function validId(value) {
  if (typeof value !== 'string' || !ID.test(value)) fail('INVALID_ID', 'Identifiant invalide.', 400);
  return value;
}
function parseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}
function label(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.slice(0, 512) : fallback;
}
function timestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function modelOf(config) {
  const value = config?.modelSpecifier?.indexedModelIdentifier;
  return typeof value === 'string' && value.length <= 512 && !path.isAbsolute(value) ? value : null;
}
function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function clamp(value, fallback, maximum) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

/** Read-only adapter. It never migrates, repairs, or writes native Bionic data. */
export function createBionicStore(options = {}) {
  const root = path.resolve(options.root ?? path.join(os.homedir(), '.lmstudio', 'apps', 'bionic'));
  const limits = {
    maxMessages: clamp(options.maxMessages, LIMITS.maxMessages, 2_000),
    maxChars: clamp(options.maxChars, LIMITS.maxChars, 2_000_000),
    maxEntries: clamp(options.maxEntries, LIMITS.maxEntries, 50_000),
    maxSessions: LIMITS.maxSessions,
  };

  async function registeredProjects() {
    try {
      const file = path.join(root, '.internal', 'projects-registry.json');
      const raw = await readFile(file, 'utf8');
      if (Buffer.byteLength(raw) > 4_000_000) throw new Error('registry limit');
      const parsed = JSON.parse(raw);
      const pairs = parsed.json?.projects ?? parsed.projects;
      if (!Array.isArray(pairs) || pairs.length > 1_000) throw new Error('registry schema');
      const projects = new Map();
      for (const pair of pairs) {
        if (!Array.isArray(pair) || pair.length !== 2) continue;
        const [id, descriptor] = pair;
        if (typeof id !== 'string' || !ID.test(id) || !descriptor || typeof descriptor.path !== 'string' || !path.isAbsolute(descriptor.path)) continue;
        projects.set(id, { id, registeredPath: path.resolve(descriptor.path) });
      }
      return projects;
    } catch (error) {
      if (error instanceof BionicStoreError) throw error;
      fail('STORE_UNAVAILABLE', 'Le registre des projets Bionic est indisponible.');
    }
  }

  async function projectFor(id, projects) {
    validId(id);
    const project = (projects ?? await registeredProjects()).get(id);
    if (!project) fail('PROJECT_NOT_FOUND', 'Projet Bionic introuvable.', 404);
    try {
      const directory = await realpath(project.registeredPath);
      if (!(await stat(directory)).isDirectory()) throw new Error('not directory');
      return { ...project, directory };
    } catch {
      fail('PROJECT_UNAVAILABLE', 'Ce projet Bionic est temporairement indisponible.');
    }
  }

  async function safeFile(project, relative) {
    const filename = await realpath(path.join(project.directory, relative));
    if (!within(project.directory, filename)) fail('UNSAFE_PROJECT_FILE', 'Ce fichier Bionic ne peut pas être lu.');
    return filename;
  }

  function readDatabase(filename, callback, readMode) {
    let database;
    try {
      database = new DatabaseSync(filename, { readOnly: true, enableForeignKeyConstraints: false, allowExtension: false });
      database.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000; PRAGMA trusted_schema=OFF; BEGIN;');
      return callback(database, readMode);
    } finally {
      if (database) {
        try { database.exec('ROLLBACK'); } catch { /* An unopened transaction needs no rollback. */ }
        database.close();
      }
    }
  }

  async function snapshotDatabase(filename, callback) {
    // A WAL database may need shared-memory access even with SQLITE_OPEN_READONLY.
    // Sandboxes sometimes deny that. Copy only DB + WAL; let SQLite reconstruct
    // shared memory in our own temporary directory. Never checkpoint the source.
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'bionic-mobile-read-'));
    const destination = path.join(temporary, 'sessions.sqlite');
    const fingerprint = async file => {
      try {
        const info = await stat(file, { bigint: true });
        return `${info.ino}:${info.size}:${info.mtimeNs}`;
      } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    };
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const before = [await fingerprint(filename), await fingerprint(`${filename}-wal`)];
        await copyFile(filename, destination);
        if (before[1]) await copyFile(`${filename}-wal`, `${destination}-wal`);
        else await rm(`${destination}-wal`, { force: true });
        const after = [await fingerprint(filename), await fingerprint(`${filename}-wal`)];
        if (before[0] === after[0] && before[1] === after[1]) {
          return readDatabase(destination, callback, 'snapshot-readonly');
        }
      }
      fail('STORE_BUSY', 'Bionic est en train de mettre à jour cette conversation. Réessayez.');
    } finally {
      // Resolve and verify our explicitly owned temporary directory before deletion.
      const resolved = await realpath(temporary);
      const tempRoot = await realpath(os.tmpdir());
      if (within(tempRoot, resolved) && path.basename(resolved).startsWith('bionic-mobile-read-')) {
        await rm(resolved, { recursive: true, force: true });
      }
    }
  }

  async function withDatabase(project, callback) {
    try {
      const filename = await safeFile(project, path.join('.internal', 'ng-sessions.sqlite'));
      // Validate sibling WAL paths too; a symlink must not widen the registry grant.
      try {
        if (!within(project.directory, await realpath(`${filename}-wal`))) {
          fail('UNSAFE_PROJECT_FILE', 'Ce fichier Bionic ne peut pas être lu.');
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (options.snapshotOnly) return await snapshotDatabase(filename, callback);
      try { return readDatabase(filename, callback, 'native-readonly'); }
      catch (error) {
        if (error instanceof BionicStoreError) throw error;
        if (![5, 8, 14].includes(error.errcode & 255)) throw error;
        return await snapshotDatabase(filename, callback);
      }
    } catch (error) {
      if (error instanceof BionicStoreError) throw error;
      fail('STORE_UNAVAILABLE', 'Les conversations Bionic sont temporairement indisponibles.');
    }
  }

  function sessionRows(database) {
    const rows = database.prepare(`SELECT session_id, session_name, suggested_session_name,
      committed_head_entry_id, session_json, updated_timestamp, parent_session_id,
      companion_session_as, is_transient, is_temporary FROM sessions
      ORDER BY updated_timestamp DESC, session_id LIMIT ?`).all(limits.maxSessions + 1);
    if (rows.length > limits.maxSessions) fail('SESSION_LIMIT', 'Ce projet contient trop de sessions pour cette vue.');
    return rows;
  }

  function isVisibleSession(row, config, query = {}) {
    if (!query.includeSubSessions && (row.parent_session_id || row.companion_session_as || row.is_transient || row.is_temporary || config?.subSessionType)) return false;
    if (!query.includeArchived && config?.isArchived === true) return false;
    return true;
  }

  function normalSession(row, projectId) {
    const config = parseJson(row.session_json) ?? {};
    const result = {
      id: row.session_id,
      name: label(row.session_name, label(row.suggested_session_name, 'Conversation sans titre')),
      updatedAt: timestamp(row.updated_timestamp),
      model: modelOf(config),
      projectId,
    };
    if (row.parent_session_id) result.parentId = row.parent_session_id;
    return result;
  }

  async function listProjects() {
    const projects = await registeredProjects();
    const result = [];
    for (const id of projects.keys()) {
      const project = await projectFor(id, projects);
      let metadata = {};
      try { metadata = parseJson(await readFile(await safeFile(project, 'project.json'), 'utf8')) ?? {}; }
      catch (error) { if (error instanceof BionicStoreError) throw error; }
      const isDefault = project.directory.toLowerCase() === (await realpath(root)).toLowerCase();
      const sessionsCount = await withDatabase(project, db => sessionRows(db).filter(row => isVisibleSession(row, parseJson(row.session_json))).length);
      result.push({
        id, name: label(metadata.name, isDefault ? 'Sans projet' : 'Projet Bionic'),
        type: label(metadata.projectType, isDefault ? 'default' : 'regular'), sessionsCount,
      });
    }
    return result;
  }

  async function listSessions(projectId, query = {}) {
    const project = await projectFor(projectId);
    return withDatabase(project, db => sessionRows(db)
      .filter(row => isVisibleSession(row, parseJson(row.session_json), query))
      .map(row => normalSession(row, project.id)));
  }

  async function getConversation(projectId, sessionId, query = {}) {
    validId(sessionId);
    const project = await projectFor(projectId);
    const maxMessages = clamp(query.maxMessages, limits.maxMessages, limits.maxMessages);
    const maxChars = clamp(query.maxChars, limits.maxChars, limits.maxChars);
    return withDatabase(project, (db, storageReadMode) => {
      const row = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
      if (!row) fail('SESSION_NOT_FOUND', 'Conversation Bionic introuvable.', 404);
      const statement = db.prepare('SELECT id, previous_id, redirect_to_id, entry_json FROM chat_entries WHERE id = ?');
      const pendingRedirects = new Map();
      const visited = new Set();
      const reasons = new Set();
      const messages = [];
      const omitted = { reasoningParts: 0, toolMessages: 0, attachments: 0, hiddenMessages: 0 };
      let current = row.committed_head_entry_id;
      let chars = 0;
      let redirectsSeen = 0;
      while (current) {
        if (visited.size >= limits.maxEntries) { reasons.add('entry_limit'); break; }
        if (visited.has(current)) { reasons.add('cycle'); break; }
        visited.add(current);
        const entryRow = statement.get(current);
        if (!entryRow) { reasons.add('missing_entry'); break; }
        const entry = parseJson(entryRow.entry_json);
        if (!entry || entry.id !== entryRow.id || (entry.previousId ?? null) !== (entryRow.previous_id ?? null)) {
          reasons.add('invalid_entry'); break;
        }
        // Native visible-context semantics: a redirect schedules a jump at its
        // earlier `from` entry. Jumping immediately to redirect_to_id is wrong.
        if (pendingRedirects.has(entry.id)) {
          const redirect = pendingRedirects.get(entry.id);
          pendingRedirects.delete(entry.id);
          current = redirect.to;
          continue;
        }
        if (entry.type === 'redirect') {
          redirectsSeen += 1;
          if ((entry.to ?? null) !== (entryRow.redirect_to_id ?? null) || typeof entry.from !== 'string') {
            reasons.add('invalid_redirect'); break;
          }
          if (!pendingRedirects.has(entry.from)) pendingRedirects.set(entry.from, { to: entry.to ?? null });
          current = entryRow.previous_id;
          continue;
        }
        current = entryRow.previous_id;
        if (entry.type !== 'message') continue;
        if (entry.hidden === true) { omitted.hiddenMessages += 1; continue; }
        const message = entry.message;
        if (!message || !Array.isArray(message.parts)) continue;
        if (message.role === 'tool') { omitted.toolMessages += 1; continue; }
        if (message.role !== 'user' && message.role !== 'assistant') continue;
        const textParts = [];
        for (const part of message.parts) {
          if (part?.type === 'text' && typeof part.text === 'string') textParts.push(part.text);
          else if (part?.type === 'reasoning') omitted.reasoningParts += 1;
          else if (part?.type === 'image' || part?.type === 'fileAttachment') omitted.attachments += 1;
        }
        let text = textParts.join('\n');
        text = text.replace(/<user-attachment\b[^>]*>[\s\S]*?<\/user-attachment>/gi, block => {
          omitted.attachments += 1;
          const name = /<name>([\s\S]*?)<\/name>/i.exec(block)?.[1]?.trim().slice(0, 200);
          return name ? `[Pièce jointe dans Bionic : ${name}. Contenu non transmis.]` : '[Pièce jointe dans Bionic. Contenu non transmis.]';
        });
        if (!text.trim()) continue;
        if (messages.length >= maxMessages) { reasons.add('message_limit'); break; }
        const remaining = maxChars - chars;
        if (remaining <= 0) { reasons.add('character_limit'); break; }
        const normalized = { id: entry.id, role: message.role, text, createdAt: timestamp(entry.createdTimestamp) };
        if (text.length > remaining) {
          normalized.text = text.slice(-remaining);
          normalized.textTruncated = true;
          reasons.add('character_limit');
        }
        chars += normalized.text.length;
        messages.push(normalized);
        if (normalized.textTruncated) break;
      }
      if (!current && pendingRedirects.size) reasons.add('redirect_source_missing');
      return {
        ...normalSession(row, project.id), messages: messages.reverse(), source: 'bionic', readOnly: true,
        headId: row.committed_head_entry_id ?? null, historyProjection: 'bionic-visible-context',
        storageReadMode,
        redirectsSeen, truncated: reasons.size > 0, truncationReasons: [...reasons], omitted,
      };
    });
  }

  return Object.freeze({ listProjects, listSessions, getConversation });
}

const defaultStore = createBionicStore();
export const listProjects = (...args) => defaultStore.listProjects(...args);
export const listSessions = (...args) => defaultStore.listSessions(...args);
export const getConversation = (...args) => defaultStore.getConversation(...args);
