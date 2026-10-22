import { promises as defaultFS } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const AUTO_MAX_OUTPUT_TOKENS = 8192;
export const CONTEXT_RESERVE_TOKENS = 256;
const MAX_MANUAL_TOKENS = 5_000_000;
const fail = (status, message) => Object.assign(new Error(message), { status });
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

export function validateModelId(model) {
  if (typeof model !== 'string' || !model.trim() || model.length > 1024 || model.includes('\0')) throw fail(400, 'Modèle invalide pour le plafond de réponse.');
  return model;
}
export function validateMaxOutputTokens(value) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 1 || value > MAX_MANUAL_TOKENS)) throw fail(400, 'Le plafond de réponse doit être un entier de 1 à 5 000 000 tokens, ou automatique.');
  return value;
}
export function validateOutputPreferences(value) {
  if (!record(value) || typeof value.applyToAllSessions !== 'boolean' || !own(value, 'maxOutputTokens')) throw fail(400, 'Préférence de réponse invalide.');
  return { maxOutputTokens: validateMaxOutputTokens(value.maxOutputTokens), applyToAllSessions: value.applyToAllSessions };
}

/** Private companion settings only; this store never opens native Bionic sessions. */
export async function createModelPreferences({ filename, fs = defaultFS }) {
  let models = Object.create(null), writes = Promise.resolve();
  try {
    const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (saved?.version !== 1 || !record(saved.models)) throw new Error('Invalid format');
    for (const [model, value] of Object.entries(saved.models)) {
      validateModelId(model); validateMaxOutputTokens(value);
      if (value !== null) models[model] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw fail(503, 'Les préférences des modèles sont illisibles. Le fichier privé est conservé ; vérifie data/model-preferences.json sur le PC.');
  }
  function modelValue(model) { validateModelId(model); return own(models, model) ? models[model] : null; }
  function resolve(model, chat) {
    const modelMaxOutputTokens = modelValue(model);
    const stored = chat?.outputPreferencesByModel;
    const sessionConfigured = own(stored, model);
    const sessionMaxOutputTokens = sessionConfigured ? stored[model] : null;
    validateMaxOutputTokens(sessionMaxOutputTokens);
    const source = sessionConfigured ? 'session' : modelMaxOutputTokens !== null ? 'model' : 'auto';
    const automatic = sessionConfigured ? sessionMaxOutputTokens === null : modelMaxOutputTokens === null;
    return { model, autoMaxOutputTokens: AUTO_MAX_OUTPUT_TOKENS, modelMaxOutputTokens, sessionMaxOutputTokens, sessionConfigured, maxOutputTokens: sessionConfigured ? sessionMaxOutputTokens ?? AUTO_MAX_OUTPUT_TOKENS : modelMaxOutputTokens ?? AUTO_MAX_OUTPUT_TOKENS, automatic, source, applyToAllSessions: source === 'model' };
  }
  async function setModel(model, value) {
    validateModelId(model); validateMaxOutputTokens(value);
    const write = writes.catch(() => {}).then(async () => {
      const next = Object.assign(Object.create(null), models);
      if (value === null) delete next[model]; else next[model] = value;
      await fs.mkdir(path.dirname(filename), { recursive: true });
      const temp = filename + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temp, JSON.stringify({ version: 1, models: next }, null, 2), { mode: 0o600, flag: 'wx' });
        await fs.rename(temp, filename);
        models = next;
      } finally { await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    });
    writes = write; await write;
  }
  function setSession(chat, model, value) {
    validateModelId(model); validateMaxOutputTokens(value);
    const next = Object.assign(Object.create(null), chat.outputPreferencesByModel);
    next[model] = value;
    chat.outputPreferencesByModel = next;
  }
  function clearSession(chat, model) {
    validateModelId(model);
    const next = Object.assign(Object.create(null), chat.outputPreferencesByModel);
    delete next[model]; chat.outputPreferencesByModel = next;
  }
  return { resolve, setModel, setSession, clearSession };
}

// A conservative byte estimate, not a tokenizer. Image payloads are charged as
// images: base64 byte length is unrelated to the model's vision token count.
function textTokens(value) { return Math.ceil(Buffer.byteLength(String(value || ''), 'utf8') / 3); }
function contentTokens(content) {
  if (typeof content === 'string') return textTokens(content);
  if (!Array.isArray(content)) return 0;
  return content.reduce((sum, part) => sum + (part.type === 'text' ? textTokens(part.text) : part.type === 'image_url' ? 1024 : textTokens(JSON.stringify(part))), 0);
}
export function estimateRequestTokens(messages, tools = []) {
  let tokens = 8;
  for (const message of messages) {
    tokens += 8 + textTokens(message.role) + contentTokens(message.content);
    for (const key of ['name', 'tool_call_id', 'tool_calls']) if (message[key] !== undefined) tokens += textTokens(typeof message[key] === 'string' ? message[key] : JSON.stringify(message[key]));
  }
  if (tools.length) tokens += 16 + textTokens(JSON.stringify(tools));
  return tokens;
}
export function outputBudget({ contextLength = 4096, messages, tools = [], preference }) {
  const limit = Number.isSafeInteger(contextLength) && contextLength > 0 ? contextLength : 4096;
  const requested = preference?.maxOutputTokens ?? AUTO_MAX_OUTPUT_TOKENS;
  validateMaxOutputTokens(requested);
  const estimatedInputTokens = estimateRequestTokens(messages, tools);
  const available = limit - estimatedInputTokens - CONTEXT_RESERVE_TOKENS;
  if (available < Math.min(requested, 64)) throw fail(400, 'Le contexte du modèle est plein (messages, images et schémas d’outils inclus). Les actions déjà réalisées sont conservées. Charge un contexte plus grand, réduis les outils ou commence une nouvelle conversation.');
  const maxOutputTokens = Math.min(requested, available);
  return { requestedMaxOutputTokens: requested, maxOutputTokens, source: preference?.source || 'auto', contextLength: limit, estimatedInputTokens, reserveTokens: CONTEXT_RESERVE_TOKENS, adjusted: maxOutputTokens < requested, estimate: true };
}
