import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelService } from '../lib/model-service.mjs';

function fixture({ reject = false, reload = false } = {}) {
  let loaded = [{ id: 'instance-A', config: { context_length: 8192 } }, { id: 'instance-B', config: { context_length: 4096 } }];
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/unload')) {
      if (reject) return new Response('{}', { status: 409 });
      const id = JSON.parse(options.body).instance_id;
      if (!reload) loaded = loaded.filter(instance => instance.id !== id);
      return Response.json({ instance_id: id });
    }
    return Response.json({ models: [
      { key: 'model-key', display_name: 'Fixture model', type: 'llm', loaded_instances: loaded, max_context_length: 32768, capabilities: { reasoning: { allowed_options: ['off','on'], default:'on' } } },
      { key: 'embedding-key', type: 'embedding', loaded_instances: [{ id: 'embedding-instance', config: { context_length: 2048 } }] },
    ] });
  };
  return { service: createModelService({ baseUrl: 'http://127.0.0.1:9999', fetchImpl, headers: () => ({ Authorization: 'Bearer FIXTURE' }) }), requests };
}
test('lists every loaded instance, including embedding, without conflating file and instance identifiers', async () => {
  const { service } = fixture(); const all = await service.list();
  assert.equal(all.length, 2); assert.equal(all[0].contextLength, 8192);
  assert.deepEqual(all[0].loadedInstances.map(instance => instance.id), ['instance-A', 'instance-B']);
  assert.equal(all[1].type, 'embedding'); assert.equal(all[1].name, 'embedding-key');
  assert.deepEqual(all[0].reasoning, { allowedOptions:['off','on'], default:'on' });
});
test('unloads precisely the requested instance and preserves its sibling', async () => {
  const { service, requests } = fixture(); const result = await service.unload('instance-B');
  assert.equal(result.unloaded, true);
  assert.deepEqual(result.models[0].loadedInstances.map(instance => instance.id), ['instance-A']);
  const mutation = requests.filter(request => request.options.method === 'POST');
  assert.equal(mutation.length, 1); assert.deepEqual(JSON.parse(mutation[0].options.body), { instance_id: 'instance-B' });
  assert.equal(mutation[0].options.headers.Authorization, 'Bearer FIXTURE');
});
test('rejects unknown, unloaded or malformed ids before any mutation', async () => {
  const { service, requests } = fixture();
  await assert.rejects(service.unload('model-key'), { status: 409 });
  for (const id of ['', null, 'x'.repeat(513)]) await assert.rejects(service.unload(id), { status: 400 });
  assert.equal(requests.filter(request => request.options.method === 'POST').length, 0);
});
test('upstream refusal is not reported as success', async () => {
  const { service } = fixture({ reject: true }); await assert.rejects(service.unload('instance-A'), { status: 409 });
});
test('an instance reloaded by another client is reported honestly', async () => {
  const { service } = fixture({ reload: true }); assert.equal((await service.unload('instance-A')).unloaded, false);
});
test('network and schema errors remain actionable', async () => {
  const unavailable = createModelService({ baseUrl: 'http://127.0.0.1', fetchImpl: async () => { throw new Error('NETWORK'); } });
  await assert.rejects(unavailable.list(), { status: 502 });
  const invalid = createModelService({ baseUrl: 'http://127.0.0.1', fetchImpl: async () => Response.json({}) });
  await assert.rejects(invalid.list(), { status: 502 });
});
