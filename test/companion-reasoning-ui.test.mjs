import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasoningOptions, resolveReasoning, reasoningChoiceKey, restoreReasoningChoices } from '../ui/src/lib/companion/reasoning-options.ts';
import { readEngineCatalogue } from '../ui/src/lib/companion/engine-catalogue.ts';

test('only declared known options are offered, including binary model defaults', () => {
  assert.deepEqual(reasoningOptions({ kind: 'toggle', allowedOptions: ['off','on','on'], default: 'on' }), { options: ['off','on'], defaultOption: 'on', unrecognized: false });
  assert.deepEqual(reasoningOptions({ allowedOptions: ['low','medium','high'], default: 'low' }).options, ['low','medium','high']);
  assert.deepEqual(reasoningOptions({ allowedOptions: ['minimal','max'], default: 'max' }).options, ['minimal','max']);
  assert.deepEqual(reasoningOptions({ allowedOptions: ['on','future','high',null], default: 'low' }), { options: ['on','high'], defaultOption: null, unrecognized: true });
});
test('engine catalogue repair pairs revisions using GET only and stops after two mismatches', async () => {
  const first={provider:'llamacpp',revision:'rev-2'},latest={provider:'bionic',revision:'rev-3'},routes=[];
  const result=await readEngineCatalogue(async route=>{routes.push(route);return route.endsWith('/settings')?latest:{models:[{id:'bionic-model'}],provider:latest.provider,inferenceRevision:latest.revision};},first);
  assert.equal(result.kind,'ready');assert.deepEqual(result.inference,latest);
  assert.deepEqual(routes,['/api/models','/api/inference/settings','/api/models']);
  const mismatch=await readEngineCatalogue(async route=>route.endsWith('/settings')?first:{models:[{id:'wrong-model'}],provider:'bionic',inferenceRevision:'foreign'},first);
  assert.equal(mismatch.kind,'unconfirmed');
  const missing=await readEngineCatalogue(async route=>route.endsWith('/settings')?first:{models:[{id:'without-provenance'}]},first);
  assert.equal(missing.kind,'unconfirmed');
});
test('unloaded local profile keeps its latest engine connection but supplies no sendable catalogue',async()=>{
  const current={provider:'llamacpp',revision:'local-rev',llamaUrl:'http://127.0.0.1:1238'};
  const result=await readEngineCatalogue(async route=>{if(route==='/api/models')throw Error('Not running');return current;},current);
  assert.equal(result.kind,'unavailable');assert.deepEqual(result.inference,current);assert(!Object.hasOwn(result,'models'));
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
