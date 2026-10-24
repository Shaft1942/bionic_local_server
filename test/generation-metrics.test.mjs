import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationMetrics, summarizeGenerationPhases } from '../lib/generation-metrics.mjs';

test('observed rate excludes initial wait and final usage delivery delay', () => {
  let time = 0; const metrics = createGenerationMetrics(() => time);
  time = 5000; metrics.observe({ choices: [{ delta: { reasoning_content: 'Think' } }] });
  time = 7000; metrics.observe({ choices: [{ delta: { content: 'Answer' }, finish_reason: 'stop' }] });
  time = 9000; metrics.observe({ usage: { prompt_tokens: 120, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 30 } } });
  assert.deepEqual(metrics.finish(), { inputTokens: 120, outputTokens: 50, reasoningTokens: 30, tokensPerSecond: 25, rateSource: 'observed', firstFragmentSeconds: 5, responseSeconds: 7 });
});
test('never guesses token counts from text or packets', () => {
  let time = 0; const metrics = createGenerationMetrics(() => time);
  time = 100; metrics.observe({ choices: [{ delta: { content: 'A long response is not a token count.' } }] });
  time = 1100; metrics.observe({ choices: [{ finish_reason: 'stop' }] });
  assert.equal(metrics.finish().tokensPerSecond, undefined);
});
test('suppresses buffered bursts and unobserved reasoning', () => {
  for (const [duration, reasoningTokens] of [[10, 0], [1000, 25]]) {
    let time = 0; const metrics = createGenerationMetrics(() => time);
    metrics.observe({ choices: [{ delta: { content: 'Answer' } }] });
    time = duration; metrics.observe({ choices: [{ finish_reason: 'stop' }], usage: { completion_tokens: 50, completion_tokens_details: { reasoning_tokens: reasoningTokens } } });
    assert.equal(metrics.finish().tokensPerSecond, undefined);
    assert.equal(metrics.finish().outputTokens, 50);
  }
});
test('accepts finite native speed and rejects malformed numbers', () => {
  const metrics = createGenerationMetrics(() => 0);
  metrics.observe({ stats: { tokens_per_second: 12.5 }, usage: { prompt_tokens: -1, completion_tokens: '40' } });
  metrics.observe({ stats: { tokens_per_second: Infinity }, usage: { prompt_tokens: NaN } });
  assert.equal(metrics.finish().tokensPerSecond, 12.5);
  assert.equal(metrics.finish().rateSource, 'bionic');
  assert.equal(metrics.finish().outputTokens, undefined);
});

test('partial multi-phase usage remains unknown instead of silently adding zero', () => {
  const totals = summarizeGenerationPhases([
    { inputTokens: 20, outputTokens: 10, responseSeconds: 2 },
    { inputTokens: undefined, outputTokens: undefined, responseSeconds: 1 }
  ], { responseSeconds: 4, totalSeconds: 6, queueSeconds: 2, partial: true });
  assert.equal(totals.inputTokens, undefined);
  assert.equal(totals.outputTokens, undefined);
  assert.equal(totals.tokensPerSecond, undefined);
  assert.equal(totals.generationPhases, 2);
  assert.equal(totals.partial, true);
  assert.equal(totals.totalSeconds, 6);
});

test('one completed phase retains the reported rate and multi-phase totals require complete counts', () => {
  const phase = { inputTokens: 20, outputTokens: 10, tokensPerSecond: 5, rateSource: 'bionic' };
  assert.equal(summarizeGenerationPhases([phase], { totalSeconds: 3, queueSeconds: 1 }).tokensPerSecond, 5);
  const totals = summarizeGenerationPhases([phase, { inputTokens: 35, outputTokens: 0 }], { responseSeconds: 4, totalSeconds: 5, queueSeconds: 1 });
  assert.equal(totals.inputTokens, 55);
  assert.equal(totals.outputTokens, 10);
  assert.equal(totals.reasoningTokens, undefined);
  assert.equal(totals.partial, undefined);
});
