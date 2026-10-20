const count = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

// Count tokens from Bionic, never from characters or SSE packet counts.
export function createGenerationMetrics(now = () => performance.now()) {
  const started = now();
  let firstFragment, finished, sawReasoning = false;
  let inputTokens, outputTokens, reasoningTokens, engineRate;
  return {
    observe(event) {
      const delta = event.choices?.[0]?.delta;
      const reasoning = delta?.reasoning_content || delta?.reasoning;
      if (typeof reasoning === 'string' && reasoning.length) sawReasoning = true;
      if (firstFragment === undefined && ((typeof delta?.content === 'string' && delta.content.length) || (typeof reasoning === 'string' && reasoning.length))) firstFragment = now();
      if (event.choices?.[0]?.finish_reason && finished === undefined) finished = now();
      if (event.usage) {
        inputTokens = count(event.usage.prompt_tokens) ?? inputTokens;
        outputTokens = count(event.usage.completion_tokens) ?? outputTokens;
        reasoningTokens = count(event.usage.completion_tokens_details?.reasoning_tokens) ?? reasoningTokens;
      }
      engineRate = positive(event.stats?.tokens_per_second) ?? engineRate;
    },
    finish() {
      const ended = finished ?? now();
      const generationSeconds = firstFragment === undefined ? 0 : (ended - firstFragment) / 1000;
      // A short/buffered stream or hidden reasoning cannot yield a useful rate.
      const observedRate = generationSeconds >= 0.25 && outputTokens >= 2 && (!reasoningTokens || sawReasoning)
        ? outputTokens / generationSeconds : undefined;
      return {
        inputTokens, outputTokens, reasoningTokens,
        tokensPerSecond: engineRate ?? observedRate,
        rateSource: engineRate ? 'bionic' : observedRate ? 'observed' : undefined,
        firstFragmentSeconds: firstFragment === undefined ? undefined : Math.max(0, (firstFragment - started) / 1000),
        responseSeconds: Math.max(0, (ended - started) / 1000)
      };
    }
  };
}
