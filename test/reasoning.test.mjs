import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReasoning, reasoningRequest } from '../lib/reasoning.mjs';

test('binary capability remains binary and does not invent graded effort', () => {
  assert.deepEqual(normalizeReasoning({ allowed_options: ['off', 'on', 'on', 'invented'], default: 'on' }), { allowedOptions: ['off', 'on'], default: 'on' });
  assert.equal(normalizeReasoning(undefined), null);
  assert.equal(normalizeReasoning({ allowed_options: [] }), null);
});
test('default settings omit the request override, including legacy chats', () => {
  for (const choice of [undefined, null, 'default']) assert.deepEqual(reasoningRequest({}, choice), { choice: null, payload: {} });
});
test('binary choices use the installed Bionic Chat Completions adapter aliases', () => {
  const model = { reasoning: { allowedOptions: ['off', 'on'] } };
  assert.deepEqual(reasoningRequest(model, 'off'), { choice: 'off', payload: { reasoning_effort: 'none' } });
  assert.deepEqual(reasoningRequest(model, 'on'), { choice: 'on', payload: { reasoning_effort: 'medium' } });
  for (const choice of ['low', 'medium', 'high', true, 'xhigh']) assert.throws(() => reasoningRequest(model, choice), { status: 400 });
});
test('graded models preserve exactly the supported effort without falling back silently', () => {
  const model = { reasoning: { allowedOptions: ['low', 'medium', 'high'] } };
  for (const choice of model.reasoning.allowedOptions) assert.deepEqual(reasoningRequest(model, choice).payload, { reasoning_effort: choice });
  assert.throws(() => reasoningRequest(model, 'off'), { status: 400 });
  assert.throws(() => reasoningRequest({}, 'on'), { status: 400 });
});
