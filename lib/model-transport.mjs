// Chat transport adapter. Management remains optional in model-service.mjs.
export function createModelTransport({ baseUrl, fetchImpl = fetch, headers = () => ({}) }) {
  const identity = Object.freeze({ provider: 'bionic', protocol: 'chat-completions', endpoint: baseUrl });
  return {
    identity,
    async request({ model, messages, tools = [], toolChoice = 'auto', maxTokens, reasoning = {}, signal }) {
      const response = await fetchImpl(baseUrl + '/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, signal,
        body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true }, max_tokens: maxTokens,
          ...(tools.length ? { tools, tool_choice: toolChoice, parallel_tool_calls: false } : {}), ...reasoning })
      });
      if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error(`Bionic ne peut pas répondre (HTTP ${response.status}). Vérifie le modèle, son contexte et les appels d’outils dans Bionic.`), { status: 502 }); }
      return response;
    }
  };
}
