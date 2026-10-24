import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasoningOptions, resolveReasoning, reasoningChoiceKey, restoreReasoningChoices } from '../ui/src/lib/companion/reasoning-options.ts';

test('only declared known options are offered, including binary model defaults', () => {
  assert.deepEqual(reasoningOptions({ kind: 'toggle', allowedOptions: ['off','on','on'], default: 'on' }), { options: ['off','on'], defaultOption: 'on', unrecognized: false });
  assert.deepEqual(reasoningOptions({ allowedOptions: ['low','medium','high'], default: 'low' }).options, ['low','medium','high']);
  assert.deepEqual(reasoningOptions({ allowedOptions: ['minimal','max'], default: 'max' }).options, ['minimal','max']);
  assert.deepEqual(reasoningOptions({ allowedOptions: ['on','future','high',null], default: 'low' }), { options: ['on','high'], defaultOption: null, unrecognized: true });
});
test('unknown capabilities never inherit an old override or invent binary/graded support', () => {
  for (const value of [null,undefined,{},[],{ allowedOptions: [] },{allowedOptions:['future']},{allowedOptions:'on'}]) {
    assert.equal(resolveReasoning(value, 'on'), 'default');
    assert.deepEqual(reasoningOptions(value).options, []);
  }
  const binary = { allowedOptions: ['off','on'] };
  assert.equal(resolveReasoning(binary, 'high'), 'default');
  assert.equal(resolveReasoning(binary, 'on'), 'on');
  assert.equal(resolveReasoning(binary, 'default'), 'default');
  assert.equal(resolveReasoning({allowedOptions:['high']},'on'),'default');
});
test('per-model and per-engine draft choices round trip without accepting invalid stored types', () => {
  const first = reasoningChoiceKey('bionic','model-a'), second = reasoningChoiceKey('bionic','model-b'), other = reasoningChoiceKey('llamacpp','model-a');
  const saved = JSON.parse(JSON.stringify({ [first]: 'on', [second]: 'high', [other]: 'off', bad: [], future: 'invented' }));
  assert.deepEqual(restoreReasoningChoices(saved), { [first]:'on', [second]:'high', [other]:'off' });
  assert.notEqual(first, other); assert.notEqual(first, second);
  assert.deepEqual(restoreReasoningChoices(null), {});
  assert.equal(resolveReasoning({allowedOptions:['off']},restoreReasoningChoices(saved)[first]),'default');
});
