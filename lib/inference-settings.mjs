import { promises as defaultFS } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createModelService } from './model-service.mjs';
import { createLlamaCppModelService } from './llamacpp-model-service.mjs';
import { createModelTransport } from './model-transport.mjs';

const fail = (status, message, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const fields = ['provider', 'apiUrl', 'llamaUrl', 'bionicToken', 'llamaToken', 'clearBionicToken', 'clearLlamaToken', 'expectedRevision'];
export function inferenceCapabilities(provider) {
  return { provider, modelManagement: provider === 'bionic', tools: provider === 'bionic' ? 'reported-per-model' : 'unknown', vision: provider === 'bionic' ? 'reported-per-model' : false, reasoning: provider === 'bionic' ? 'reported-per-model' : false, context: provider === 'bionic' ? 'reported-per-model' : 'props-required', noGeneration: true };
}
function origin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw fail(400, 'Adresse ' + name + ' invalide.', 'inference-invalid-url'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw fail(400, 'Utilise une adresse HTTP en boucle locale, sans chemin ni identifiant.', 'inference-invalid-url');
  return url.origin;
}
function validate(input, previous, reservedPorts) {
  if (!record(input) || Object.keys(input).some(key => !fields.includes(key))) throw fail(400, 'Réglage du moteur invalide.', 'inference-invalid-settings');
  const next = { provider: input.provider ?? previous.provider, apiUrl: origin(input.apiUrl ?? previous.apiUrl, 'Bionic'), llamaUrl: origin(input.llamaUrl ?? previous.llamaUrl, 'llama.cpp'), bionicToken: previous.bionicToken || '', llamaToken: previous.llamaToken || '' };
  if (!['bionic', 'llamacpp'].includes(next.provider)) throw fail(400, 'Moteur inconnu.', 'inference-invalid-provider');
  const apiPort = Number(new URL(next.apiUrl).port || 80), llamaPort = Number(new URL(next.llamaUrl).port || 80);
  if (next.provider === 'llamacpp' && (apiPort === llamaPort || reservedPorts.includes(llamaPort))) throw fail(400, 'Le port llama.cpp doit être distinct de Bionic, du compagnon et de ComfyUI.', 'inference-invalid-port');
  for (const [name, clear, endpoint] of [['bionicToken', 'clearBionicToken', 'apiUrl'], ['llamaToken', 'clearLlamaToken', 'llamaUrl']]) {
    if (input[clear] !== undefined && typeof input[clear] !== 'boolean') throw fail(400, 'Choix du jeton invalide.', 'inference-invalid-token');
    if (input[name] !== undefined && (typeof input[name] !== 'string' || input[name].length > 4096 || /[\x00-\x20\x7f]/.test(input[name]))) throw fail(400, 'Le jeton contient des caractères interdits.', 'inference-invalid-token');
    if (input[clear] && input[name]) throw fail(400, 'Choisis un nouveau jeton ou son effacement.', 'inference-invalid-token');
    if (next[endpoint] !== previous[endpoint] && previous[name] && !input[clear] && !input[name]) throw fail(400, 'L’adresse change : remplace ou efface explicitement son jeton.', 'inference-token-scope');
    if (input[clear]) next[name] = '';
    else if (input[name]) next[name] = input[name];
    if (next[name].length > 4096 || /[\x00-\x20\x7f]/.test(next[name])) throw fail(400, 'Remplace ou efface le jeton existant avant d’enregistrer.', 'inference-invalid-token');
  }
  return next;
}

/** Private server-side settings. Never expose current() outside trusted composition code. */
export async function createInferenceSettings({ filename, initial, fs = defaultFS, reservedPorts = [] }) {
  const fallback = { provider: initial.provider || 'bionic', apiUrl: initial.apiUrl || 'http://127.0.0.1:1235', llamaUrl: initial.llamaUrl || 'http://127.0.0.1:1236', bionicToken: initial.bionicToken || '', llamaToken: initial.llamaToken || '' };
  // Validate only when used: injected historic fixtures may intentionally share test ports.
  let state = { version: 1, revision: randomUUID(), ...fallback }, persisted = false, pending = Promise.resolve();
  try {
    const info = await fs.lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 20000) throw new Error('invalid settings');
    const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (!record(saved) || saved.version !== 1 || typeof saved.revision !== 'string' || !/^[\w-]{1,100}$/.test(saved.revision) || Object.keys(saved).some(key => !['version', 'revision', 'provider', 'apiUrl', 'llamaUrl', 'bionicToken', 'llamaToken'].includes(key))) throw new Error('invalid settings');
    if (['provider', 'apiUrl', 'llamaUrl', 'bionicToken', 'llamaToken'].some(key => typeof saved[key] !== 'string')) throw new Error('invalid settings');
    state = { version: 1, revision: saved.revision, ...validate(savedConfig(saved), { ...fallback, apiUrl: saved.apiUrl, llamaUrl: saved.llamaUrl, bionicToken: '', llamaToken: '' }, reservedPorts) }; persisted = true;
  } catch (error) { if (error.code !== 'ENOENT') throw fail(503, 'Les réglages privés du moteur sont illisibles. Ils sont conservés.', 'inference-settings-unreadable'); }
  function savedConfig(saved) { return Object.fromEntries(['provider', 'apiUrl', 'llamaUrl', 'bionicToken', 'llamaToken'].map(key => [key, saved[key]])); }
  function current() { const { version, revision, ...config } = state; return { ...config }; }
  function snapshot() { return { provider: state.provider, apiUrl: state.apiUrl, llamaUrl: state.llamaUrl, revision: state.revision, hasBionicToken: !!state.bionicToken, hasLlamaToken: !!state.llamaToken, source: persisted ? 'web' : 'initial', capabilities: inferenceCapabilities(state.provider) }; }
  function propose(input) { return validate(input, current(), reservedPorts); }
  async function save(input) {
    const work = pending.catch(() => {}).then(async () => {
      if (typeof input?.expectedRevision !== 'string' || input.expectedRevision !== state.revision) throw fail(409, 'Les réglages ont changé. Relis leur état avant d’enregistrer.', 'inference-stale-revision');
      const next = { version: 1, revision: randomUUID(), ...propose(input) }, temporary = filename + '.' + randomUUID() + '.tmp';
      await fs.mkdir(path.dirname(filename), { recursive: true });
      try {
        try { if ((await fs.lstat(filename)).isSymbolicLink()) throw fail(503, 'Le fichier des réglages ne doit pas être un lien.', 'inference-settings-unreadable'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await fs.writeFile(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, filename);
        state = next; persisted = true;
        return snapshot();
      } catch (error) { if (error.status) throw error; throw fail(500, 'Les réglages n’ont pas été enregistrés. Le moteur précédent reste actif.', 'inference-save-failed'); }
      finally { await fs.unlink(temporary).catch(() => {}); }
    });
    pending = work; return work;
  }
  return { current, snapshot, propose, save };
}

export function createInferenceRuntime(config, fetchImpl = fetch, { onMutationState } = {}) {
  const endpoint = config.provider === 'llamacpp' ? config.llamaUrl : config.apiUrl;
  const token = config.provider === 'llamacpp' ? config.llamaToken : config.bionicToken;
  const headers = () => token ? { Authorization: 'Bearer ' + token } : {};
  return { modelService: (config.provider === 'llamacpp' ? createLlamaCppModelService : createModelService)({ baseUrl: endpoint, headers, fetchImpl, onMutationState }), modelTransport: createModelTransport({ baseUrl: endpoint, provider: config.provider, headers, fetchImpl }) };
}

export async function checkInferenceConnection(config, { fetchImpl = fetch, timeoutMs = 7500 } = {}) {
  const deadline = AbortSignal.timeout(timeoutMs), endpoint = config.provider === 'llamacpp' ? config.llamaUrl : config.apiUrl, checkedAt = Date.now();
  const capabilities = inferenceCapabilities(config.provider);
  try {
    const boundedFetch = async (url, options = {}) => {
      const target = new URL(url);
      if (target.origin !== endpoint || !['/api/v1/models', '/v1/models', '/props'].includes(target.pathname)) throw new Error('Unexpected check endpoint');
      const response = await fetchImpl(url, { ...options, redirect: 'error', signal: options.signal ? AbortSignal.any([deadline, options.signal]) : deadline });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Check refused'); }
      if (Number(response.headers?.get('content-length')) > 2_000_000) { await response.body?.cancel(); throw new Error('Check too large'); }
      let length = 0; const chunks = [];
      for await (const chunk of response.body) { deadline.throwIfAborted(); length += chunk.length; if (length > 2_000_000) throw new Error('Check too large'); chunks.push(Buffer.from(chunk)); }
      return Response.json(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    };
    const runtime = createInferenceRuntime(config, boundedFetch), list = await runtime.modelService.list();
    const models = list.filter(model => model.type === 'llm').slice(0, 200).map(model => ({ id: model.id, name: model.name, type: model.type, loaded: model.loaded, contextLength: model.contextLength, toolsCapability: model.toolsCapability ?? 'unknown', vision: model.vision === true, reasoningOptions: model.reasoning?.allowedOptions || [] }));
    const tokens = [config.bionicToken, config.llamaToken].filter(Boolean);
    const redact = value => typeof value === 'string' ? tokens.reduce((text, token) => text.split(token).join('[masqué]'), value) : Array.isArray(value) ? value.map(redact) : record(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)])) : value;
    return redact({ ok: true, provider: config.provider, endpoint, checkedAt, models, capabilities });
  } catch { return { ok: false, provider: config.provider, endpoint, checkedAt, models: [], capabilities, error: 'Connexion non confirmée. Vérifie le serveur local, l’adresse et son authentification. Aucun modèle chargé ni message envoyé.' }; }
}
