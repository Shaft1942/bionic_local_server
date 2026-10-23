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

function coldFixture({ contextLength = 16384, listedContext = contextLength, reject = false, malformed = false, hold } = {}) {
  let loaded = [];
  const requests = [];
  const service = createModelService({ baseUrl: 'http://127.0.0.1:9999', fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/load')) {
      if (reject) return new Response('{}', { status: 400 });
      if (hold) await hold;
      loaded = [{ id: 'precise-instance', config: { context_length: listedContext } }];
      return Response.json(malformed ? {} : { status: 'loaded', instance_id: 'precise-instance', load_config: { context_length: contextLength } });
    }
    return Response.json({ models: [{ key: 'cold', type: 'llm', max_context_length: 262144, loaded_instances: loaded }] });
  } });
  return { service, requests };
}

test('unloaded models expose an unknown active context, never 4096 or the theoretical maximum', async () => {
  const { service, requests } = coldFixture();
  const [cold] = await service.list();
  assert.equal(cold.loaded, false);
  assert.equal(cold.contextLength, null);
  assert.equal(cold.maxContextLength, 262144);
  assert.equal(cold.inferenceId, null);
  assert.equal(requests.filter(request => request.options.method === 'POST').length, 0);
});

test('cold inference loads with Bionic defaults and budgets the confirmed instance, never the supported maximum', async () => {
  const { service, requests } = coldFixture({ contextLength: 16384, listedContext: 12288 });
  const model = await service.forInference('cold');
  assert.equal(model.contextLength, 12288);
  assert.equal(model.inferenceId, 'precise-instance');
  assert.equal(model.maxContextLength, 262144);
  const loads = requests.filter(request => request.options.method === 'POST');
  assert.equal(loads.length, 1);
  assert.deepEqual(JSON.parse(loads[0].options.body), { model: 'cold', echo_load_config: true });
  assert.equal((await service.forInference('cold')).contextLength, 12288);
  assert.equal(requests.filter(request => request.options.method === 'POST').length, 1);
});

test('an unknown loaded context is actionable instead of being reported as a full context', async () => {
  const { service } = coldFixture({ contextLength: null });
  await assert.rejects(service.forInference('cold'), error => error.status === 409 && /n’a pas confirmé/.test(error.message) && !/est plein/.test(error.message));
  await assert.rejects(service.forInference('cold'), { status: 409 });
});

test('load refusals and invalid confirmations never proceed as successful inference preparation', async () => {
  for (const options of [{ reject: true }, { malformed: true }]) {
    await assert.rejects(coldFixture(options).service.forInference('cold'), { status: 502 });
  }
});

test('concurrent requests share a cold load and a cancelled waiter never consumes its result', async () => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const { service, requests } = coldFixture({ hold });
  const controller = new AbortController();
  const first = service.forInference('cold', { signal: controller.signal });
  const second = service.forInference('cold');
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(first, { status: 409 });
  release();
  assert.equal((await second).contextLength, 16384);
  assert.equal(requests.filter(request => request.options.method === 'POST').length, 1);
});
