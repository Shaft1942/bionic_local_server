// Chat transport adapter. Management remains optional in model-service.mjs.
export function createModelTransport({ baseUrl, fetchImpl = fetch, headers = () => ({}), provider = 'bionic' }) {
  if (!['bionic', 'llamacpp'].includes(provider)) throw new Error('Moteur de conversation inconnu.');
  const label = provider === 'llamacpp' ? 'llama.cpp' : 'Bionic';
  const identity = Object.freeze({ provider, protocol: 'chat-completions', endpoint: baseUrl });
  return {
    identity,
    async request({ model, messages, tools = [], toolChoice = 'auto', maxTokens, reasoning = {}, signal }) {
      if (provider === 'llamacpp' && Object.keys(reasoning).length) throw Object.assign(new Error('Le réglage d’effort llama.cpp n’est pas qualifié pour ce connecteur.'), { status: 400 });
      const response = await fetchImpl(baseUrl + '/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, signal, ...(provider === 'llamacpp' ? { redirect: 'error' } : {}),
        body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true }, max_tokens: maxTokens,
          ...(tools.length ? { tools, tool_choice: toolChoice, parallel_tool_calls: false } : {}), ...reasoning })
      });
      if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error(`${label} ne peut pas répondre (HTTP ${response.status}). Vérifie le modèle, son contexte et les appels d’outils dans ${label}.`), { status: 502 }); }
      return response;
    }
  };
}
