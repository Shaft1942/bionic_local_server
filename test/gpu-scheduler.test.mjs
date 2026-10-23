import test from 'node:test';
import assert from 'node:assert/strict';
import { createGpuScheduler } from '../lib/gpu-scheduler.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(t, overrides = {}) {
  const operations = [];
  const modelService = {
    list: async () => { operations.push('list'); return []; },
    unload: async id => { operations.push(`unload:${id}`); return { unloaded: true }; },
    ...overrides,
  };
  const scheduler = createGpuScheduler({ modelService });
  t.after(() => scheduler.close());
  return { scheduler, operations };
}

test('keep groups serialize images while allowing concurrent model predictions', async t => {
  const { scheduler, operations } = fixture(t);
  const releaseFirstModel = await scheduler.acquireModel();
  const releaseFirstImages = await scheduler.acquireImages({ policy: 'keep' });
  let secondImagesStarted = false;
  const nextImages = scheduler.acquireImages({ policy: 'keep' }).then(release => { secondImagesStarted = true; return release; });
  const releaseSecondModel = await scheduler.acquireModel();
  assert.deepEqual(scheduler.snapshot(), { activeModels: 2, activeImages: 1, imagePolicy: 'keep', queuedModels: 0, queuedImages: 1, closed: false });
  assert.equal(secondImagesStarted, false);
  assert.deepEqual(operations, []);
  releaseFirstImages();
  const releaseSecondImages = await nextImages;
  assert.equal(secondImagesStarted, true);
  releaseSecondImages(); releaseSecondModel(); releaseFirstModel();
  assert.equal(scheduler.snapshot().activeModels, 0);
  assert.equal(scheduler.snapshot().activeImages, 0);
});

test('unload waits for existing predictions and unloads all LLM instances once before the group', async t => {
  const { scheduler, operations } = fixture(t, {
    list: async () => {
      operations.push('list');
      return [
        { type: 'llm', loaded: true, loadedInstances: [{ id: 'qwen-a' }, { id: 'qwen-b' }] },
        { type: 'llm', loaded: true, loadedInstances: [{ id: 'other' }, { id: 'qwen-a' }] },
        { type: 'llm', loaded: false, loadedInstances: [] },
        { type: 'embedding', loaded: true, loadedInstances: [{ id: 'embedding' }] },
      ];
    },
  });
  const releasePrediction = await scheduler.acquireModel();
  let imageStarted = false;
  const image = scheduler.acquireImages({ policy: 'unload' }).then(release => { imageStarted = true; return release; });
  let laterPredictionStarted = false;
  const laterPrediction = scheduler.acquireModel().then(release => { laterPredictionStarted = true; return release; });
  await tick();
  assert.equal(imageStarted, false); assert.equal(laterPredictionStarted, false);
  assert.deepEqual(operations, []);
  releasePrediction();
  const releaseImages = await image;
  assert.deepEqual(operations, ['list', 'unload:qwen-a', 'unload:qwen-b', 'unload:other']);
  assert.equal(laterPredictionStarted, false);
  // One lease covers every image in a group; no further unload is needed.
  await tick(); assert.equal(laterPredictionStarted, false);
  releaseImages();
  (await laterPrediction)();
});

test('image groups are admitted in FIFO order across keep and unload policies', async t => {
  const { scheduler } = fixture(t);
  const order = [];
  const first = await scheduler.acquireImages({ policy: 'keep' });
  const second = scheduler.acquireImages({ policy: 'unload' }).then(release => { order.push('second'); return release; });
  const third = scheduler.acquireImages({ policy: 'keep' }).then(release => { order.push('third'); return release; });
  const fourth = scheduler.acquireImages({ policy: 'unload' }).then(release => { order.push('fourth'); return release; });
  assert.equal(scheduler.snapshot().queuedImages, 3);
  first(); (await second)(); (await third)(); (await fourth)();
  assert.deepEqual(order, ['second', 'third', 'fourth']);
});

test('models arriving between unload groups run before the later group without starving it', async t => {
  const { scheduler } = fixture(t);
  const releaseFirst = await scheduler.acquireImages({ policy: 'unload' });
  const events = [];
  const middle = scheduler.acquireModel().then(release => { events.push('model-middle'); return release; });
  const second = scheduler.acquireImages({ policy: 'unload' }).then(release => { events.push('image-second'); return release; });
  const last = scheduler.acquireModel().then(release => { events.push('model-last'); return release; });
  releaseFirst();
  const releaseMiddle = await middle;
  await tick(); assert.deepEqual(events, ['model-middle']);
  releaseMiddle();
  const releaseSecond = await second;
  await tick(); assert.deepEqual(events, ['model-middle', 'image-second']);
  releaseSecond(); (await last)();
  assert.deepEqual(events, ['model-middle', 'image-second', 'model-last']);
});

test('cancelling a queued unload removes the barrier without unloading a model', async t => {
  const { scheduler, operations } = fixture(t);
  const releaseImages = await scheduler.acquireImages({ policy: 'keep' });
  const controller = new AbortController();
  const pending = scheduler.acquireImages({ policy: 'unload', signal: controller.signal });
  const rejected = assert.rejects(pending, { status: 409 });
  const model = scheduler.acquireModel();
  assert.equal(scheduler.snapshot().queuedModels, 1);
  controller.abort();
  await rejected;
  (await model)();
  assert.equal(scheduler.snapshot().queuedImages, 0);
  assert.deepEqual(operations, []);
  releaseImages();
});

test('a cancelled model request is never admitted after the active unload group', async t => {
  const { scheduler } = fixture(t);
  const releaseImages = await scheduler.acquireImages({ policy: 'unload' });
  const controller = new AbortController();
  const pending = scheduler.acquireModel({ signal: controller.signal });
  const rejected = assert.rejects(pending, { status: 409 });
  controller.abort(); await rejected;
  releaseImages();
  assert.equal(scheduler.snapshot().activeModels, 0);
  assert.equal(scheduler.snapshot().queuedModels, 0);
});

test('cancellation during an unload waits for its outcome and never unloads the next instance', async t => {
  const finishing = deferred();
  const operations = [];
  const { scheduler } = fixture(t, {
    list: async () => [{ type: 'llm', loaded: true, loadedInstances: [{ id: 'first' }, { id: 'second' }] }],
    unload: async id => { operations.push(id); await finishing.promise; return { unloaded: true }; },
  });
  const controller = new AbortController();
  const pending = scheduler.acquireImages({ policy: 'unload', signal: controller.signal });
  const rejected = assert.rejects(pending, { status: 409 });
  let admitted = false;
  const model = scheduler.acquireModel().then(release => { admitted = true; return release; });
  await tick();
  controller.abort(); await tick();
  assert.deepEqual(operations, ['first']);
  assert.equal(admitted, false);
  finishing.resolve();
  await rejected;
  (await model)();
  assert.deepEqual(operations, ['first']);
});

test('cancellation during discovery prevents every unload mutation', async t => {
  const listing = deferred();
  const { scheduler, operations } = fixture(t, { list: async () => listing.promise });
  const controller = new AbortController();
  const rejected = assert.rejects(scheduler.acquireImages({ policy: 'unload', signal: controller.signal }), { status: 409 });
  await tick(); controller.abort();
  listing.resolve([{ type: 'llm', loadedInstances: [{ id: 'fixture' }] }]);
  await rejected;
  assert.deepEqual(operations, []);
  (await scheduler.acquireModel())();
});

test('manual model management can share the model lease and wait until image ownership ends', async t => {
  const { scheduler } = fixture(t);
  const releaseImages = await scheduler.acquireImages({ policy: 'unload' });
  const events = [];
  const manualUnload = (async () => {
    const release = await scheduler.acquireModel();
    try { events.push('explicit-unload'); }
    finally { release(); }
  })();
  await tick(); assert.deepEqual(events, []);
  releaseImages(); await manualUnload;
  assert.deepEqual(events, ['explicit-unload']);
  assert.equal(scheduler.snapshot().activeModels, 0);
});

test('a failed unload is not retried and releases the model and image queues', async t => {
  let calls = 0;
  const { scheduler } = fixture(t, {
    list: async () => [{ type: 'llm', loadedInstances: [{ id: 'fixture' }] }],
    unload: async () => { calls++; throw Object.assign(new Error('Uncertain mutation'), { status: 502 }); },
  });
  const failed = scheduler.acquireImages({ policy: 'unload' });
  const rejected = assert.rejects(failed, /Uncertain mutation/);
  const nextImage = scheduler.acquireImages({ policy: 'keep' });
  const nextModel = scheduler.acquireModel();
  await rejected;
  (await nextImage)(); (await nextModel)();
  assert.equal(calls, 1);
  assert.equal(scheduler.snapshot().activeImages, 0);
});

test('an unconfirmed unload prevents rendering rather than claiming memory was released', async t => {
  const { scheduler } = fixture(t, {
    list: async () => [{ type: 'llm', loadedInstances: [{ id: 'fixture' }] }],
    unload: async () => ({ unloaded: false }),
  });
  await assert.rejects(scheduler.acquireImages({ policy: 'unload' }), error => error.status === 502 && /Aucun rendu/.test(error.message));
  (await scheduler.acquireModel())();
  assert.equal(scheduler.snapshot().activeImages, 0);
});

test('list failures release the exclusive reservation before subsequent work', async t => {
  const { scheduler } = fixture(t, { list: async () => { throw new Error('List refused'); } });
  await assert.rejects(scheduler.acquireImages({ policy: 'unload' }), /List refused/);
  (await scheduler.acquireImages({ policy: 'keep' }))();
  (await scheduler.acquireModel())();
});

test('unknown loaded instances fail closed before the first unload mutation', async t => {
  const { scheduler, operations } = fixture(t, { list: async () => [
    { type: 'llm', loaded: true, loadedInstances: [{ id: 'valid' }] },
    { type: 'llm', loaded: true, loadedInstances: [] },
  ] });
  await assert.rejects(scheduler.acquireImages({ policy: 'unload' }), { status: 502 });
  assert.deepEqual(operations, []);
});

test('already cancelled requests and invalid policies have no side effects', async t => {
  const { scheduler, operations } = fixture(t);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(scheduler.acquireModel({ signal: controller.signal }), { status: 409 });
  await assert.rejects(scheduler.acquireImages({ policy: 'unload', signal: controller.signal }), { status: 409 });
  await assert.rejects(scheduler.acquireImages({ policy: 'something-else' }), { status: 400 });
  assert.deepEqual(operations, []);
  assert.equal(scheduler.snapshot().activeModels, 0);
  assert.equal(scheduler.snapshot().activeImages, 0);
});

test('releasing or cancelling an acquired lease cannot release another owner', async t => {
  const { scheduler } = fixture(t);
  const controller = new AbortController();
  const first = await scheduler.acquireImages({ policy: 'unload', signal: controller.signal });
  controller.abort();
  assert.equal(scheduler.snapshot().activeImages, 1);
  first();
  const second = await scheduler.acquireImages({ policy: 'keep' });
  first();
  assert.equal(scheduler.snapshot().activeImages, 1);
  second(); second();
  const releaseModel = await scheduler.acquireModel(); releaseModel(); releaseModel();
  assert.equal(scheduler.snapshot().activeModels, 0);
});

test('close rejects queued and future requests while active leases remain owned', async t => {
  const { scheduler } = fixture(t);
  const active = await scheduler.acquireImages({ policy: 'unload' });
  const modelRejected = assert.rejects(scheduler.acquireModel(), { status: 503 });
  const imageRejected = assert.rejects(scheduler.acquireImages(), { status: 503 });
  scheduler.close();
  await Promise.all([modelRejected, imageRejected]);
  await assert.rejects(scheduler.acquireModel(), { status: 503 });
  await assert.rejects(scheduler.acquireImages(), { status: 503 });
  assert.equal(scheduler.snapshot().activeImages, 1);
  active();
  assert.deepEqual(scheduler.snapshot(), { activeModels: 0, activeImages: 0, imagePolicy: null, queuedModels: 0, queuedImages: 0, closed: true });
});

test('closing during preparation waits for an in-flight unload and stops the group', async t => {
  const finishing = deferred();
  const { scheduler } = fixture(t, {
    list: async () => [{ type: 'llm', loadedInstances: [{ id: 'fixture' }] }],
    unload: async () => { await finishing.promise; return { unloaded: true }; },
  });
  const rejected = assert.rejects(scheduler.acquireImages({ policy: 'unload' }), { status: 503 });
  await tick(); scheduler.close();
  assert.equal(scheduler.snapshot().activeImages, 1);
  finishing.resolve(); await rejected;
  assert.equal(scheduler.snapshot().activeImages, 0);
});

test('unload requires a model service but keep works without one', async () => {
  const scheduler = createGpuScheduler();
  await assert.rejects(scheduler.acquireImages({ policy: 'unload' }), { status: 503 });
  (await scheduler.acquireImages({ policy: 'keep' }))();
  scheduler.close();
});
