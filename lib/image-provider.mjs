const fail = message => Object.assign(new Error(message), { status: 409, code: 'image-provider-unsupported' });
const required = ['submit', 'get', 'owner', 'image', 'getSettings', 'lifecycleStatus', 'findForOwner', 'close'];
const optionalRoutes = new Set(['listGenerations', 'submitSeries', 'cancel', 'retry', 'validateRetry', 'resumeQueue', 'updateSettings', 'checkConnection', 'listLoras', 'discoverServers']);

/**
 * image-jobs-v1 is independent of inference. An explicit adapter owns durable jobs,
 * idempotency by project/chat/message/request, unknown outcomes and local image bytes.
 * submit(args, owner, signal, selection) never retries an ambiguous remote POST;
 * get/owner/findForOwner recover existing jobs without submitting; image returns bytes+mime.
 * getSettings synchronously returns {enabled,activeJobs}; lifecycleStatus returns
 * {active,uncertain}. Optional methods advertise capabilities, never compatibility
 * with a remote engine. Legacy HTTP routes are an outer compatibility adapter.
 */
export function createImageProviderBinding({ provider, legacyService }) {
  const service = provider?.service || legacyService;
  if (!service) throw fail('Fournisseur d’images absent.');
  let identity = { id: 'comfyui', label: 'ComfyUI', protocol: 'image-jobs-v1' };
  if (provider) {
    if (!provider.identity || !/^[a-z][a-z0-9-]{0,63}$/.test(provider.identity.id) || typeof provider.identity.label !== 'string' || !provider.identity.label.trim() || provider.identity.label.length > 120 || /[\x00-\x1f]/.test(provider.identity.label) || required.some(method => typeof service[method] !== 'function')) throw fail('Le fournisseur d’images ne respecte pas le contrat image-jobs-v1.');
    identity = { id: provider.identity.id, label: provider.identity.label, protocol: 'image-jobs-v1' };
  }
  const capabilities = Object.freeze({ singleImage: typeof service.submit === 'function', series: typeof service.submitSeries === 'function', history: typeof service.listGenerations === 'function', retry: typeof service.retry === 'function', cancelQueued: typeof service.cancel === 'function', recoveryByOwner: typeof service.findForOwner === 'function', localImageBytes: typeof service.image === 'function', lifecycle: typeof service.lifecycleStatus === 'function', workflowSelection: typeof service.resolveSelection === 'function' });
  const bound = provider ? new Proxy(service, { get(target, key) { const value = target[key]; if (typeof value === 'function') return value.bind(target); if (value === undefined && optionalRoutes.has(key)) return () => { throw fail('Cette fonction n’est pas proposée par le fournisseur d’images sélectionné.'); }; return value; } }) : service;
  return { service: bound, identity: Object.freeze(identity), capabilities, publicInfo: () => ({ identity: { ...identity }, capabilities: { ...capabilities }, legacyApiNamespace: '/api/comfy', toolNames: ['generate_comfy_image', 'generate_comfy_image_series'], historicalAlias: 'generate_krea2_image' }) };
}
