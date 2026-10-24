// Schema 1 fixture, aligned with ARC-01. No engine addresses or credentials.
export function capabilitiesFixture(provider = 'bionic') {
  const yes = () => ({ state: 'supported', reasonCode: null });
  const unknown = reasonCode => ({ state: 'unknown', reasonCode });
  const parameter = () => ({ support: { state: 'unsupported', reasonCode: 'parameter-not-forwarded' } });
  return {
    schemaVersion: 1,
    inference: { provider, revision: 'fixture-1', support: { chat: yes(), modelManagement: provider === 'llamacpp' ? { state: 'unsupported', reasonCode: 'not-supported' } : yes() }, catalogue: { state: 'observed', reasonCode: null }, models: [{
      id: 'fixture-model', loaded: true, contextLength: 8192,
      support: { tools: unknown('model-capability-unknown'), vision: provider === 'llamacpp' ? { state: 'unsupported', reasonCode: 'not-supported' } : yes(), reasoningEffort: unknown('model-capability-unknown') },
      parameters: { maxOutputTokens: { support: yes(), min: 1, max: 5000000 }, reasoningEffort: { support: unknown('model-capability-unknown'), options: [] }, temperature: parameter(), topP: parameter(), topK: parameter(), seed: parameter(), repeatPenalty: parameter() }
    }] },
    images: { providerId: 'comfyui', enabled: true, support: Object.fromEntries(['singleImage','batch','series','history','retry','cancelQueued'].map(key => [key, yes()])), reachability: unknown('not-probed'), availability: unknown('not-probed'), parameters: { imageCount: { support: yes(), min: 1, max: 5 } } },
    permissions: Object.fromEntries(Object.entries({ fileAccess: 'file-profile-required', webAccess: 'web-access-required', scriptAccess: 'exact-code-approval-required', imageAccess: 'image-access-required' }).map(([key, reasonCode]) => [key, { state: 'request-scoped', reasonCode }]))
  };
}
