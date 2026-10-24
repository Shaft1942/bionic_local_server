const policies = ['keep', 'unload', 'alternate'];
const invalid = () => Object.assign(new Error('Politique mémoire image invalide.'), { status: 400, code: 'image-memory-policy-invalid' });
const unsupportedReason = 'Ce connecteur ne peut pas décharger le modèle texte par API. Choisis « Alterner » pour sérialiser les travaux locaux en conservant le modèle, ou « Garder chargé ». Aucune libération de mémoire GPU n’est confirmée.';

/** Pure connector contract, not a measurement of models or GPU memory. */
export function imageMemoryPolicyCapabilities({ provider, modelService, defaultPolicy = 'keep' } = {}) {
  if (!policies.includes(defaultPolicy)) throw invalid();
  const selected = provider ?? modelService?.capabilities?.provider;
  // A possessed llama-server has a separate explicit lifecycle controller. Its
  // direct model API still cannot unload/reload for a workflow automatically.
  const unloadSupported = selected !== 'llamacpp' && modelService?.capabilities?.unload !== false
    && (selected === 'bionic' || modelService?.capabilities?.unload === true);
  const defaultAdjusted = defaultPolicy === 'unload' && !unloadSupported;
  return {
    supportedPolicies: unloadSupported ? [...policies] : ['keep', 'alternate'],
    unloadSupported, defaultPolicy,
    effectiveDefaultPolicy: defaultAdjusted ? 'alternate' : defaultPolicy,
    defaultAdjusted,
    reasonCode: unloadSupported ? null : 'image-memory-unload-unsupported',
    reason: unloadSupported ? null : unsupportedReason,
  };
}

/** Resolve at admission before catalogue loading, chat persistence or prompts. */
export function resolveImageMemoryPolicy({ provider, modelService, requestedPolicy = null, defaultPolicy = 'keep' } = {}) {
  if (requestedPolicy !== null && !policies.includes(requestedPolicy)) throw invalid();
  const capabilities = imageMemoryPolicyCapabilities({ provider, modelService, defaultPolicy });
  if (requestedPolicy === 'unload' && !capabilities.unloadSupported) {
    throw Object.assign(new Error(unsupportedReason), { status: 409, code: 'image-memory-policy-unsupported' });
  }
  const adjusted = requestedPolicy === null && capabilities.defaultAdjusted;
  return {
    requestedPolicy, defaultPolicy,
    effectivePolicy: requestedPolicy ?? capabilities.effectiveDefaultPolicy,
    adjusted,
    reasonCode: adjusted ? 'image-memory-policy-default-adjusted' : null,
    reason: adjusted ? 'Le réglage global « Décharger » est appliqué en mode « Alterner » pour ce connecteur. Les travaux locaux sont sérialisés ; le modèle texte reste chargé et aucune libération GPU n’est confirmée.' : null,
    unloadSupported: capabilities.unloadSupported,
    supportedPolicies: capabilities.supportedPolicies,
  };
}
