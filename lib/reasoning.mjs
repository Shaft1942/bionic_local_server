const SUPPORTED = new Set(['off', 'on', 'low', 'medium', 'high', 'xhigh']);

export function normalizeReasoning(capability) {
  if (!capability || !Array.isArray(capability.allowed_options)) return null;
  const allowedOptions = [...new Set(capability.allowed_options.filter(value => SUPPORTED.has(value)))];
  if (!allowedOptions.length) return null;
  return { allowedOptions, default: allowedOptions.includes(capability.default) ? capability.default : null };
}

export function reasoningRequest(model, choice) {
  if (choice === undefined || choice === null || choice === 'default') return { choice: null, payload: {} };
  if (typeof choice !== 'string' || !model.reasoning?.allowedOptions.includes(choice)) {
    throw Object.assign(new Error('Ce niveau d’effort n’est pas disponible pour le modèle choisi. Actualise la liste et sélectionne un niveau proposé.'), { status: 400 });
  }
  // Bionic's installed OpenAI adapter maps none -> off and medium -> on for
  // binary models. Only a model's advertised native choices reach this mapping.
  const effort = choice === 'off' ? 'none' : choice === 'on' ? 'medium' : choice;
  return { choice, payload: { reasoning_effort: effort } };
}
