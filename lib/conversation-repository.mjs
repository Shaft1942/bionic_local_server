import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

const CHAT = /^web-[a-f0-9-]{36}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });
const recordObject = value => value && typeof value === 'object' && !Array.isArray(value);
function validSummary(value) {
  if (!recordObject(value) || !CHAT.test(value.id) || typeof value.projectId !== 'string' || !/^[\w-]{1,128}$/.test(value.projectId) || typeof value.name !== 'string' || value.name.length > 2048 || !Array.isArray(value.queue) || !Array.isArray(value.requests) || !Array.isArray(value.activity)) return false;
  if (value.generation !== undefined && (!recordObject(value.generation) || typeof value.generation.status !== 'string')) return false;
  return value.queue.every(item => recordObject(item) && typeof item.requestId === 'string' && typeof item.status === 'string') &&
    value.requests.every(item => recordObject(item) && typeof item.requestId === 'string' && typeof item.status === 'string' && (item.message === undefined || typeof item.message === 'string')) &&
    value.activity.every(item => recordObject(item) && typeof item.id === 'string' && Number.isSafeInteger(item.finishedAt) && typeof item.outcome === 'string');
}
export function messageIds(messages) {
  const seen = new Set();
  return messages.map((message, index) => {
    if (typeof message.id === 'string' && message.id && !seen.has(message.id)) { seen.add(message.id); return message; }
    const base = 'legacy-' + index + '-' + createHash('sha256').update(JSON.stringify([message.role, message.createdAt, message.text])).digest('hex').slice(0, 16);
    let id = base, suffix = 0; while (seen.has(id)) id = base + '-' + ++suffix;
    seen.add(id); return { ...message, id };
  });
}
const summaryOf = chat => ({ id: chat.id, projectId: chat.projectId, name: chat.name, model: chat.model, updatedAt: chat.updatedAt, source: 'web', origin: chat.origin, generation: chat.generation, queue: (chat.queue || []).map(item => ({ requestId: item.requestId, status: item.status })), activity: (chat.messages || []).filter(item => item.role === 'assistant' && item.finishedAt && item.outcome).map(item => ({ id: item.id, finishedAt: item.finishedAt, outcome: item.outcome })), requests: [...(chat.queue || []).map(item => ({ requestId: item.requestId, status: item.status, message: item.message })), ...(chat.messages || []).filter(item => item.role === 'user' && item.requestId).map(item => ({ requestId: item.requestId, status: item.requestStatus || (chat.generation?.requestId === item.requestId ? chat.generation.status : 'completed') }))] });

/** Derived index only: authoritative chats remain compatible JSON and are never repaired here. */
export function createConversationRepository({ directory, fs, readChat, states, measurements, isPinned = () => false, maxCached = 64, maxCacheBytes = 32_000_000 }) {
  const filename = path.join(path.dirname(directory), 'chat-index.json');
  let index, loading, writes = Promise.resolve(), preserveBrokenIndex = false, dirty = false, mutation = 0, indexWriteFailed = false;
  async function load() {
    if (!loading) loading = (async () => {
      index = new Map();
      try {
        const info = await fs.lstat(filename);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 16_000_000) throw Error('index limit');
        const value = JSON.parse(await fs.readFile(filename, 'utf8'));
        if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 20_000) throw Error('index schema');
        for (const item of value.entries) {
          if (!recordObject(item) || !CHAT.test(item.id) || !Number.isFinite(item.mtimeMs) || !Number.isSafeInteger(item.size) || item.size < 0 || !validSummary(item.summary) || item.summary.id !== item.id || index.has(item.id)) throw Error('index entry');
          index.set(item.id, item);
        }
      } catch (error) { index.clear(); preserveBrokenIndex = error.code !== 'ENOENT'; }
    })();
    await loading;
  }
  function flush() {
    const next = writes.catch(() => {}).then(async () => {
      await load();
      if (!dirty || preserveBrokenIndex) return;
      const bytes = JSON.stringify({ version: 1, entries: [...index.values()] });
      const savedMutation = mutation;
      if (Buffer.byteLength(bytes) > 16_000_000) { indexWriteFailed = true; return; }
      const temporary = filename + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, filename);
        dirty = mutation !== savedMutation;
        indexWriteFailed = false;
      } catch { indexWriteFailed = true; }
      finally { await fs.unlink(temporary).catch(() => {}); }
    });
    writes = next;
    return next;
  }
  async function record(chat) {
    await load();
    const info = await fs.stat(path.join(directory, chat.id + '.json'));
    index.set(chat.id, { id: chat.id, size: info.size, mtimeMs: info.mtimeMs, summary: summaryOf(chat) });
    dirty = true; mutation++;
  }
  async function remove(id) { await load(); index.delete(id); dirty = true; mutation++; }
  async function scan() {
    await load();
    measurements.directoryScans++;
    const chats = [], warnings = [], found = new Set(); let invalid = 0;
    const names = (await fs.readdir(directory)).filter(name => CHAT.test(name.slice(0, -5)) && name.endsWith('.json'));
    if (names.length > 20_000) throw fail(503, 'La limite de 20 000 conversations est atteinte. Archive des conversations sur le PC.');
    for (const name of names) {
      const id = name.slice(0, -5); found.add(id);
      try {
        const info = await fs.lstat(path.join(directory, name));
        if (!info.isFile() || info.isSymbolicLink()) throw fail(422, 'Conversation illisible.');
        const known = index.get(id), live = states.get(id);
        if (live) { chats.push(summaryOf(live.chat)); measurements.summaryCacheHits = (measurements.summaryCacheHits || 0) + 1; }
        else if (known && known.mtimeMs === info.mtimeMs && known.size === info.size && known.summary.generation?.status !== 'running' && !known.summary.queue.some(item => item.status === 'queued')) { chats.push(structuredClone(known.summary)); measurements.summaryCacheHits = (measurements.summaryCacheHits || 0) + 1; }
        else {
          const chat = await readChat(id);
          chats.push(summaryOf(chat));
          await record(chat);
        }
      } catch (error) { if (error.code === 'ENOENT' || error.status === 404) continue; if (error.status === 422) { invalid++; index.delete(id); dirty = true; mutation++; continue; } throw error; }
      trim();
    }
    for (const id of index.keys()) if (!found.has(id)) { index.delete(id); dirty = true; mutation++; }
    if (invalid) warnings.push({ code: 'CHAT_UNREADABLE', count: invalid, message: 'Inventaire partiel : ' + invalid + ' conversation(s) illisible(s). Les fichiers sont conservés sur le PC.' });
    if (preserveBrokenIndex) warnings.push({ code: 'CHAT_INDEX_REBUILT', message: 'L’index illisible est conservé ; les résumés sont reconstruits en mémoire depuis les conversations.' });
    await flush();
    if (indexWriteFailed) warnings.push({ code: 'CHAT_INDEX_UNAVAILABLE', message: 'L’index reste en mémoire : son enregistrement est indisponible. Les conversations sont conservées.' });
    return { chats, warnings };
  }
  function trim() {
    let total = [...states.values()].reduce((sum, state) => sum + (state.serializedBytes || 0), 0);
    for (const [id, state] of states) {
      if (states.size <= maxCached && total <= maxCacheBytes) break;
      if (state.running || state.pendingWrites || state.readers || isPinned(id, state) || state.chat.queue?.some(item => item.status === 'queued')) continue;
      states.delete(id); total -= state.serializedBytes || 0;
      measurements.cacheEvictions = (measurements.cacheEvictions || 0) + 1;
    }
  }
  return { scan, record, remove, flush, trim, stats: () => ({ cachedConversations: states.size, maxCached, maxCacheBytes }) };
}

export function pageItems(items, { limit = 100, before, key = 'id' } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw fail(400, 'La taille de page doit être comprise entre 1 et 500.');
  let start = 0;
  if (before !== undefined && before !== null && before !== '') {
    if (typeof before !== 'string' || before.length > 300) throw fail(400, 'Curseur invalide.');
    const position = items.findIndex(item => String(item[key]) === before);
    if (position < 0) throw fail(409, 'Le contenu a changé. Recommence la lecture de l’historique.');
    start = position + 1;
  }
  const page = items.slice(start, start + limit), hasMore = start + page.length < items.length;
  return { items: page, hasMore, nextCursor: hasMore ? String(page.at(-1)[key]) : null, total: items.length };
}

export function pageMessages(messages, { limit = 100, before } = {}) {
  messages = messageIds(messages);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw fail(400, 'La taille de page doit être comprise entre 1 et 500.');
  let end = messages.length;
  if (before) {
    if (typeof before !== 'string' || before.length > 300) throw fail(400, 'Curseur invalide.');
    end = messages.findIndex(item => item.id === before);
    if (end < 0) throw fail(409, 'Le contenu a changé. Recommence la lecture de l’historique.');
  }
  const start = Math.max(0, end - limit), items = messages.slice(start, end);
  return { items, hasMore: start > 0, nextCursor: start > 0 ? items[0].id : null, total: messages.length };
}
