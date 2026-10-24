// Chat transport adapter. Management remains optional in model-service.mjs.
import { createLlamaCppModelService } from './llamacpp-model-service.mjs';
import { llamaReasoningPayload, reasoningRequest } from './reasoning.mjs';
export function createModelTransport({ baseUrl, fetchImpl = fetch, headers = () => ({}), provider = 'bionic' }) {
  if (!['bionic', 'llamacpp'].includes(provider)) throw new Error('Moteur de conversation inconnu.');
  const label = provider === 'llamacpp' ? 'llama.cpp' : 'Bionic';
  const identity = Object.freeze({ provider, protocol: 'chat-completions', endpoint: baseUrl });
  return {
    identity,
    async request({ model, messages, tools = [], toolChoice = 'auto', maxTokens, reasoning = {}, signal }) {
      if (provider === 'llamacpp') {
        reasoning = llamaReasoningPayload(reasoning);
        if (Object.keys(reasoning).length) {
          // Queued turns keep their accepted payload. Recheck the native control
          // against the active alias immediately before any generation POST.
          const models = await createLlamaCppModelService({ baseUrl, fetchImpl, headers }).list({ signal });
          const active = models.find(entry => entry.inferenceId === model);
          if (!active?.loaded || !active.contextLength) throw Object.assign(new Error('Le modèle llama.cpp a changé ou son état chargé n’est plus confirmé. Actualise les modèles.'), { status: 409, code: 'reasoning-model-changed' });
          reasoningRequest(active, reasoning.chat_template_kwargs.enable_thinking ? 'on' : 'off');
          signal?.throwIfAborted();
        }
      }
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
