import { normalizeReasoning } from './reasoning.mjs';
function failure(status, message) { return Object.assign(new Error(message), { status }); }
const positiveInteger = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const unknownContext = () => failure(409, 'Bionic n’a pas confirmé la taille du contexte chargé. Charge le modèle dans Bionic, vérifie son contexte, puis réessaie. Cette requête n’a pas été transmise au modèle.');

/** Uses only LM Studio/Bionic's documented REST model API. */
export function createModelService({ baseUrl, fetchImpl = fetch, headers = () => ({}) }) {
  const base = baseUrl.replace(/\/$/, '');
  const loading = new Map();
  async function list() {
    let response;
    try { response = await fetchImpl(base + '/api/v1/models', { headers: headers(), signal: AbortSignal.timeout(7000) }); }
    catch { throw failure(502, 'API Bionic injoignable. Vérifie son serveur local.'); }
    if (!response.ok) throw failure(502, 'Bionic refuse la liste des modèles. Vérifie son API locale.');
    const json = await response.json();
    if (!Array.isArray(json.models)) throw failure(502, 'La liste des modèles Bionic est illisible.');
    return json.models.map(model => {
      const instances = (model.loaded_instances || []).map(instance => ({ id: instance.id, contextLength: positiveInteger(instance.config?.context_length) }));
      const instance = instances.find(instance => instance.contextLength) || instances[0];
      return {
        id: model.key,
        name: model.display_name || model.key,
        type: model.type,
        reasoning: normalizeReasoning(model.capabilities?.reasoning),
        vision: model.capabilities?.vision === true,
        tools: model.capabilities?.trained_for_tool_use !== false,
        toolsCapability: typeof model.capabilities?.trained_for_tool_use === 'boolean' ? model.capabilities.trained_for_tool_use : 'unknown',
        loaded: !!instances.length,
        // The GGUF's supported maximum is not the context configured at load time.
        contextLength: instance?.contextLength || null,
        maxContextLength: positiveInteger(model.max_context_length),
        inferenceId: instance?.id || null,
        loadedInstances: instances,
      };
    });
  }
  function usable(model) {
    if (!model?.contextLength || !model.inferenceId) throw unknownContext();
    return model;
  }
  async function loadForInference(model) {
    let response;
    try {
      response = await fetchImpl(base + '/api/v1/models/load', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() },
        // Leave Bionic's saved load settings intact; never allocate the model's
        // theoretical maximum just to make the companion's estimate fit.
        body: JSON.stringify({ model: model.id, echo_load_config: true }), signal: AbortSignal.timeout(180000),
      });
    } catch { throw failure(502, 'Le chargement du modèle n’a pas pu être confirmé. Vérifie les modèles chargés dans Bionic puis réessaie.'); }
    if (!response.ok) throw failure(502, `Bionic refuse le chargement du modèle (HTTP ${response.status}). Charge-le dans Bionic puis réessaie.`);
    const result = await response.json().catch(() => null);
    if (result?.status !== 'loaded' || typeof result.instance_id !== 'string' || !result.instance_id.trim()) throw failure(502, 'La confirmation de chargement Bionic est inattendue. Actualise les modèles chargés.');
    const refreshed = (await list()).find(candidate => candidate.id === model.id);
    const instance = refreshed?.loadedInstances.find(instance => instance.id === result.instance_id);
    return usable({ ...(refreshed || model), loaded: true, inferenceId: result.instance_id, contextLength: instance?.contextLength || positiveInteger(result.load_config?.context_length) });
  }
  async function forInference(modelId, { signal } = {}) {
    if (signal?.aborted) throw failure(409, 'Demande arrêtée avant le chargement du modèle.');
    const model = (await list()).find(model => model.id === modelId && model.type === 'llm');
    if (!model) throw failure(400, 'Sélectionne un modèle local disponible.');
    if (model.loaded) return usable(model);
    // Concurrent conversations selecting the same cold model share its load.
    let pending = loading.get(modelId);
    if (!pending) {
      pending = loadForInference(model);
      loading.set(modelId, pending);
      pending.finally(() => { if (loading.get(modelId) === pending) loading.delete(modelId); }).catch(() => {});
    }
    const stopped = () => failure(409, 'Demande arrêtée pendant le chargement du modèle. Le chargement Bionic peut continuer ; aucun message n’a été transmis.');
    let abort;
    const cancelled = signal && new Promise((_, reject) => {
      abort = () => reject(stopped());
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    try { return await (cancelled ? Promise.race([pending, cancelled]) : pending); }
    finally { if (abort) signal.removeEventListener('abort', abort); }
  }
  async function unload(instanceId) {
    if (typeof instanceId !== 'string' || !instanceId.trim() || instanceId.length > 512) throw failure(400, 'Instance de modèle invalide.');
    const before = await list();
    if (!before.some(model => model.loadedInstances.some(instance => instance.id === instanceId))) throw failure(409, 'Cette instance n’est plus chargée. La liste a peut-être changé.');
    let response;
    try {
      response = await fetchImpl(base + '/api/v1/models/unload', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ instance_id: instanceId }), signal: AbortSignal.timeout(60000),
      });
    } catch { throw failure(502, 'Le déchargement n’a pas pu être confirmé. Actualise la liste.'); }
    if (!response.ok) throw failure(response.status === 409 ? 409 : 502, `Bionic refuse le déchargement (HTTP ${response.status}). Vérifie si une autre session utilise encore le modèle.`);
    const result = await response.json().catch(() => null);
    if (result?.instance_id !== instanceId) throw failure(502, 'La confirmation de déchargement Bionic est inattendue. Actualise la liste.');
    const after = await list();
    const stillLoaded = after.some(model => model.loadedInstances.some(instance => instance.id === instanceId));
    return { instanceId, unloaded: !stillLoaded, models: after };
  }
  return { list, forInference, unload };
}
