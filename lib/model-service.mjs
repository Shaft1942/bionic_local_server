import { normalizeReasoning } from './reasoning.mjs';
function failure(status, message) { return Object.assign(new Error(message), { status }); }

/** Uses only LM Studio/Bionic's documented REST model API. */
export function createModelService({ baseUrl, fetchImpl = fetch, headers = () => ({}) }) {
  const base = baseUrl.replace(/\/$/, '');
  async function list() {
    let response;
    try { response = await fetchImpl(base + '/api/v1/models', { headers: headers(), signal: AbortSignal.timeout(7000) }); }
    catch { throw failure(502, 'API Bionic injoignable. Vérifie son serveur local.'); }
    if (!response.ok) throw failure(502, 'Bionic refuse la liste des modèles. Vérifie son API locale.');
    const json = await response.json();
    if (!Array.isArray(json.models)) throw failure(502, 'La liste des modèles Bionic est illisible.');
    return json.models.map(model => ({
      id: model.key,
      name: model.display_name || model.key,
      type: model.type,
      reasoning: normalizeReasoning(model.capabilities?.reasoning),
      vision: model.capabilities?.vision === true,
      tools: model.capabilities?.trained_for_tool_use !== false,
      toolsCapability: typeof model.capabilities?.trained_for_tool_use === 'boolean' ? model.capabilities.trained_for_tool_use : 'unknown',
      loaded: !!model.loaded_instances?.length,
      contextLength: model.loaded_instances?.[0]?.config?.context_length || Math.min(model.max_context_length || 4096, 4096),
      loadedInstances: (model.loaded_instances || []).map(instance => ({ id: instance.id, contextLength: instance.config?.context_length || null })),
    }));
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
  return { list, unload };
}
