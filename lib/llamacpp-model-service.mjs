import { createHash } from 'node:crypto';

const failure = (status, message) => Object.assign(new Error(message), { status });
const positive = value => Number.isSafeInteger(value) && value > 0 ? value : null;

/** Read-only adapter for a direct, single-model llama-server (not its router). */
export function createLlamaCppModelService({ baseUrl, fetchImpl = fetch, headers = () => ({}) }) {
  const base = baseUrl.replace(/\/$/, '');
  async function read(route, signal) {
    let response;
    try {
      response = await fetchImpl(base + route, { headers: headers(), redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(7000)]) : AbortSignal.timeout(7000) });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw failure(502, 'llama.cpp est injoignable. Vérifie le serveur local et llamaUrl.');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw failure(502, `llama.cpp refuse la lecture du catalogue ou du contexte (HTTP ${response.status}).`);
    }
    try { return await response.json(); }
    catch { throw failure(502, 'La réponse de llama.cpp est illisible.'); }
  }
  async function list({ signal } = {}) {
    const catalog = await read('/v1/models', signal);
    if (!Array.isArray(catalog?.data) || catalog.data.length > 1 || catalog.data.some(model => typeof model?.id !== 'string' || !model.id.trim() || model.id.length > 1024 || model.id.includes('\0'))) {
      throw failure(502, 'Un serveur llama.cpp direct avec un seul modèle est requis.');
    }
    if (!catalog.data.length) return [];
    const props = await read('/props', signal);
    if (!props || !positive(props.total_slots)) throw failure(502, 'Les propriétés du serveur llama.cpp direct sont illisibles.');
    const contextLength = positive(props.default_generation_settings?.n_ctx);
    return catalog.data.map(model => {
      // Keep identical aliases across engines from sharing preferences/effort.
      const id = 'llamacpp:' + createHash('sha256').update(JSON.stringify([base, model.id])).digest('hex');
      const loaded = model.meta != null && props.is_sleeping !== true;
      return {
        id, name: model.id, type: 'llm', inferenceId: model.id,
        loaded, contextLength, maxContextLength: positive(model.meta?.n_ctx_train),
        loadedInstances: loaded ? [{ id, contextLength }] : [],
        reasoning: null, vision: false, tools: 'unknown', toolsCapability: 'unknown',
        modelManagement: false,
        capabilityEvidence: { provider: 'llamacpp', providerVersion: typeof props.build_info === 'string' && /^[\w.()+ -]{1,120}$/.test(props.build_info) ? props.build_info : 'unknown', model: id, endpoint: base, source: 'model-api-and-props', checkedAt: Date.now() },
      };
    });
  }
  async function forInference(modelId, { signal } = {}) {
    signal?.throwIfAborted();
    const model = (await list({ signal })).find(model => model.id === modelId);
    signal?.throwIfAborted();
    if (!model) throw failure(400, 'Sélectionne un modèle llama.cpp disponible.');
    if (!model.loaded || !model.contextLength) throw failure(409, 'llama.cpp doit avoir un modèle chargé et un contexte confirmé par /props. Aucun message transmis ; aucun chargement automatique demandé.');
    return model;
  }
  async function unload() {
    throw failure(409, 'Le déchargement est indisponible pour ce connecteur llama.cpp direct. Aucun modèle arrêté ; aucun rendu lancé avec la politique « décharger ».');
  }
  return { list, forInference, unload, pendingCount: () => 0 };
}
