import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMessageStats } from '../ui/src/lib/companion/message-stats.mjs';

const reply = (metrics, extra = {}) => ({ role: 'assistant', metrics, ...extra });
const row = (stats, key) => stats.details.find(item => item.key === key);

test('stats retain reported counts, total, queue and provider rate across persisted message reload', () => {
  const message = reply({ inputTokens: 1200, outputTokens: 40, totalSeconds: 5, queueSeconds: 2, responseSeconds: 3, firstFragmentSeconds: .25, tokensPerSecond: 12.5, rateSource: 'bionic', reasoningTokens: 0 });
  const stats = formatMessageStats(message);
  assert.deepEqual(formatMessageStats(JSON.parse(JSON.stringify(message))), stats);
  assert.equal(row(stats, 'total').value, '5 s'); assert.equal(row(stats, 'queue').value, '2 s');
  assert.equal(row(stats, 'output').value, '40'); assert.equal(row(stats, 'reasoning').value, '0');
  assert.equal(row(stats, 'rate').value, '12,5 tok/s'); assert.equal(stats.summary.find(item => item.key === 'duration').value, '5 s');
  assert.equal(stats.summary.find(item => item.key === 'queue').value, 'Attente 2 s');
});

test('a missing rate is never invented from tokens, response length, total time or timestamps', () => {
  const stats = formatMessageStats(reply({ outputTokens: 100, totalSeconds: 10, responseSeconds: 5 }, { text: 'Synthetic text '.repeat(500), createdAt: 0, finishedAt: 10000 }));
  assert.equal(row(stats, 'rate').value, 'Non transmis');
  assert.equal(stats.summary.find(item => item.key === 'rate').value, '— tok/s');
});

test('reported observed rates stay approximate and formatting follows the UI language for both inference engines', () => {
  const metrics = { inputTokens: 1234, outputTokens: 1000, tokensPerSecond: 7.25, rateSource: 'observed', responseSeconds: 10.125 };
  const bionic = formatMessageStats(reply(metrics, { provider: { provider: 'bionic' } }), { language: 'en' });
  const llama = formatMessageStats(reply(metrics, { provider: { provider: 'llamacpp' } }), { language: 'en' });
  assert.deepEqual(bionic, llama); assert.equal(row(llama, 'rate').value, '≈ 7.3 tok/s');
  assert.equal(row(llama, 'input').value, '1,234'); assert.equal(row(llama, 'response').value, '10.125 s');
});

test('absence and invalid values remain unknown while legitimate zero measurements remain zero', () => {
  const invalid = formatMessageStats(reply({ outputTokens: '120', inputTokens: -1, reasoningTokens: NaN, totalSeconds: Infinity, queueSeconds: -1, responseSeconds: null, tokensPerSecond: 0, generationPhases: 1.5 }));
  assert.equal(invalid.hasMetrics, false); assert.equal(invalid.state, 'unavailable');
  assert(invalid.details.every(item => item.value === 'Non transmis'));
  const zero = formatMessageStats(reply({ outputTokens: 0, inputTokens: 0, totalSeconds: 0, queueSeconds: 0 }));
  assert.equal(row(zero, 'output').value, '0'); assert.equal(row(zero, 'total').value, '0 s'); assert.equal(row(zero, 'queue').value, '0 s');
  assert(!zero.summary.some(item => item.key === 'queue'));
});

test('stop and error expose partial measurements without supplying missing token counts', () => {
  for (const extra of [{ outcome: 'stopped' }, { outcome: 'error' }, { interrupted: true }]) {
    const stats = formatMessageStats(reply({ partial: true, totalSeconds: 1.5, queueSeconds: 0 }, extra));
    assert.equal(stats.partial, true); assert.equal(stats.state, 'partial');
    assert.equal(row(stats, 'output').value, 'Non transmis'); assert.equal(row(stats, 'rate').value, 'Non transmis');
    assert.equal(row(stats, 'total').value, '1,5 s');
  }
});

test('live replies wait for measurements and do not invent a ticking duration or throughput', () => {
  const stats = formatMessageStats(reply(undefined), { running: true });
  assert.equal(stats.state, 'running'); assert.equal(stats.hasMetrics, false); assert.equal(stats.summary.length, 0);
  assert.match(stats.stateDescription, /fin de réponse/);
  assert.equal(formatMessageStats(reply(undefined, { outcome: 'stopped' })).state, 'partial');
});

test('multiple model calls preserve missing aggregate counters and never create aggregate speed', () => {
  const stats = formatMessageStats(reply({ generationPhases: 3, inputTokens: 240, responseSeconds: 6, totalSeconds: 8, queueSeconds: 2 }));
  assert.equal(row(stats, 'phases').value, '3'); assert.match(row(stats, 'input').label, /cumulés/);
  assert.equal(row(stats, 'output').value, 'Non transmis'); assert.equal(row(stats, 'rate').value, 'Non transmis');
});

test('response duration fallback remains explicitly outside queue, and non-inference messages are omitted', () => {
  const stats = formatMessageStats(reply({ responseSeconds: 3.5 }));
  assert.match(stats.summary.find(item => item.key === 'duration').label, /hors attente/);
  assert.equal(row(stats, 'total').value, 'Non transmis');
  assert.equal(formatMessageStats({ role: 'user', metrics: { outputTokens: 3 } }), null);
  assert.equal(formatMessageStats(reply(undefined, { directImage: true })), null);
  assert.equal(formatMessageStats(null), null);
});
