import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { createComfyImages } from '../lib/comfy-images.mjs';
import { createComfySettings } from '../lib/comfy-settings.mjs';
import { createGpuScheduler } from '../lib/gpu-scheduler.mjs';

const owner = { projectId: 'fixture-project', chatId: 'fixture-chat', messageId: 'fixture-reply', requestId: 'fixture-request' };
const images = prefix => ({ images: [
  { prompt: prefix + ' a red bicycle', seed: 101, format: 'square' },
  { prompt: prefix + ' a wooden sailboat', seed: 102, format: 'portrait' },
  { prompt: prefix + ' a yellow tram', seed: 103, format: 'landscape' },
] });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function until(condition, label = 'expected synthetic state') {
  const deadline = Date.now() + 3000;
  while (!condition()) { assert(Date.now() < deadline, label); await wait(5); }
}
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label)), 1500); })]); }
  finally { clearTimeout(timer); }
}
function oldJob(policy, index) {
  return { id: randomUUID(), owner: { ...owner, messageId: 'old-' + index }, promptId: 'old-prompt-' + index, status: 'running',
    prompt: 'Recovered fixture ' + index, seed: index, format: 'square', width: 1024, height: 1024, workflowId: 'krea2_turbo',
    outputNodeId: '9', comfyUrl: 'http://127.0.0.1:8188', modelPolicy: policy, memoryCleanup: false, createdAt: Date.now(), updatedAt: Date.now() };
}
async function fixture(t, { recoveredPolicies = [], holdFirstPost = false, memoryCleanup = true } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'comfy-alternate-test-'));
  const settingsFile = path.join(directory, 'settings.json');
  const posts = [], calls = [], admissions = [], remote = new Map(), completed = new Set(), failed = new Set();
  const firstPost = deferred();
  const old = recoveredPolicies.map(oldJob);
  let loaded = true;
  const scheduler = createGpuScheduler({ modelService: {
    async list() { calls.push('list'); return [{ type: 'llm', loaded, loadedInstances: loaded ? [{ id: 'fixture-model' }] : [] }]; },
    async unload(id) { calls.push('unload:' + id); loaded = false; return { unloaded: true }; },
  } });
  const gpuScheduler = { ...scheduler, acquireImages(options) { admissions.push(options.policy); return scheduler.acquireImages(options); } };
  for (const job of old) {
    remote.set(job.promptId, { width: job.width, height: job.height });
    await fs.writeFile(path.join(directory, job.id + '.json'), JSON.stringify(job));
  }
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'http://127.0.0.1:8188');
    assert.equal(options.redirect, 'error');
    if (parsed.pathname === '/prompt') {
      const graph = JSON.parse(options.body).prompt, id = 'fixture-prompt-' + (posts.length + 1);
      assert.equal([...remote.keys()].filter(key => !completed.has(key)).length, 0, 'image computations must not overlap');
      if (scheduler.snapshot().imagePolicy === 'alternate') assert.equal(scheduler.snapshot().activeModels, 0, 'alternate must not overlap an admitted prediction');
      posts.push({ id, graph }); remote.set(id, { width: graph['5'].inputs.width, height: graph['5'].inputs.height });
      if (holdFirstPost && posts.length === 1) { await firstPost.promise; throw Error('Synthetic uncertain acceptance'); }
      return Response.json({ prompt_id: id });
    }
    if (parsed.pathname === '/queue') return Response.json({ queue_running: [...remote.keys()].filter(key => !completed.has(key)).map(key => [0, key]), queue_pending: [] });
    if (parsed.pathname.startsWith('/history/')) {
      const id = decodeURIComponent(parsed.pathname.slice('/history/'.length));
      if (!completed.has(id)) return Response.json({});
      if (failed.has(id)) return Response.json({ [id]: { status: { status_str: 'error', messages: [['execution_error', { exception_message: 'Synthetic failure' }]] } } });
      return Response.json({ [id]: { status: { completed: true, status_str: 'success' }, outputs: { '9': { images: [{ filename: id + '.png', subfolder: 'Synthetic', type: 'output' }] } } } });
    }
    if (parsed.pathname === '/view') {
      const dimensions = remote.get(parsed.searchParams.get('filename')?.replace(/\.png$/, '')); assert(dimensions);
      const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.write('IHDR', 12);
      png.writeUInt32BE(dimensions.width, 16); png.writeUInt32BE(dimensions.height, 20); return new Response(png);
    }
    if (parsed.pathname === '/free') return Response.json({});
    throw Error('Unexpected synthetic route ' + parsed.pathname);
  };
  const create = () => createComfyImages({ directory, settingsFile, enabled: true, memoryCleanup, fetchImpl, gpuScheduler, pollMs: 10 });
  let service = await create();
  t.after(async () => {
    firstPost.resolve();
    await bounded(service.close(), 'synthetic alternate service must close'); scheduler.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir())); assert(path.basename(directory).startsWith('comfy-alternate-test-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return {
    directory, settingsFile, scheduler, posts, calls, admissions, completed, old, releaseFirstPost: firstPost.resolve,
    get service() { return service; },
    selection(policy = 'alternate') { return { ...service.resolveSelection('krea2_turbo'), modelPolicy: policy }; },
    async finish(job, { error = false } = {}) {
      await until(() => service.get(job.id).promptId, 'image must have been submitted');
      const id = service.get(job.id).promptId; completed.add(id); if (error) failed.add(id);
      await service.refresh(job.id);
      await until(() => service.get(job.id).status === (error ? 'failed' : 'succeeded'), 'image must reach its terminal state');
    },
    async restart() { await bounded(service.close(), 'service must close before restart'); service = await create(); },
  };
}

test('alternate lets complete text predictions run between images while two image groups keep FIFO order', async t => {
  const f = await fixture(t);
  const frozen = f.selection();
  const first = await f.service.submitSeries(images('First'), owner, undefined, frozen);
  frozen.modelPolicy = 'keep';
  const nextOwner = { ...owner, chatId: 'another-chat', messageId: 'another-reply' };
  const next = await f.service.submitSeries(images('Second'), nextOwner, undefined, f.selection());
  assert(first.every(job => job.modelPolicy === 'alternate'));
  assert(next.every(job => job.queuedLocally));
  let textStarted = false;
  const text = f.scheduler.acquireModel().then(release => { textStarted = true; return release; });
  await wait(20); assert.equal(textStarted, false); assert.equal(f.posts.length, 1);
  await f.finish(first[0]);
  const releaseText = await bounded(text, 'text must run after the first image');
  await until(() => f.scheduler.snapshot().queuedImages === 1, 'second image must reserve its place behind the text');
  await wait(20); assert.equal(f.posts.length, 1, 'an admitted stream must be allowed to finish completely');
  let laterStarted = false;
  const later = f.scheduler.acquireModel().then(release => { laterStarted = true; return release; });
  releaseText();
  await until(() => f.posts.length === 2, 'second image must advance before later text');
  assert.equal(laterStarted, false);
  await f.finish(first[1]);
  const releaseLater = await bounded(later, 'later conversation must get its next turn');
  await wait(20); assert.equal(f.posts.length, 2);
  releaseLater();
  for (const job of [first[2], ...next]) await f.finish(job);
  await until(() => f.scheduler.snapshot().activeImages === 0, 'finished series must release their final lease');
  assert.deepEqual(f.posts.map(post => post.graph['6'].inputs.text), [...images('First').images, ...images('Second').images].map(image => image.prompt));
  assert.deepEqual(f.posts.map(post => post.graph['3'].inputs.seed), [101, 102, 103, 101, 102, 103]);
  assert(f.posts.every(post => Object.hasOwn(post.graph, '99')), 'existing cleanup after each image must be preserved');
  assert.deepEqual(f.admissions, Array(6).fill('alternate'));
  assert.deepEqual(f.calls, []);
  for (const job of first) assert.deepEqual(f.service.owner(job.id), owner);
  for (const job of next) assert.deepEqual(f.service.owner(job.id), nextOwner);
});

test('cancelling waiting text does not cancel a durable series and a later stream failure releases the next image', async t => {
  const f = await fixture(t), controller = new AbortController();
  const first = await f.service.submitSeries(images('Durable'), owner, controller.signal, f.selection());
  const stopped = new AbortController();
  const rejected = assert.rejects(f.scheduler.acquireModel({ signal: stopped.signal }), { status: 409 });
  stopped.abort(); await rejected;
  controller.abort();
  const brokenText = (async () => {
    const release = await f.scheduler.acquireModel();
    try { throw Error('Synthetic inference stream failure'); }
    finally { release(); }
  })();
  const failed = assert.rejects(brokenText, /Synthetic inference stream failure/);
  await f.finish(first[0]); await failed;
  await f.finish(first[1]); await f.finish(first[2]);
  assert.equal(f.posts.length, 3); assert.deepEqual(f.calls, []);
});

test('uncertain alternate submission keeps exclusive ownership until verified idle and resumes later groups without replay', async t => {
  const f = await fixture(t, { holdFirstPost: true });
  const firstPromise = f.service.submitSeries(images('Uncertain'), owner, undefined, f.selection());
  await until(() => f.posts.length === 1);
  const next = await f.service.submitSeries(images('Next'), { ...owner, messageId: 'next-reply' }, undefined, f.selection());
  f.releaseFirstPost();
  const first = await firstPromise;
  await until(() => f.service.getSettings().queuePaused);
  let admitted = false;
  const text = f.scheduler.acquireModel().then(release => { admitted = true; return release; });
  await assert.rejects(f.service.resumeQueue(), { status: 409 });
  await wait(20); assert.equal(admitted, false); assert.equal(f.posts.length, 1);
  f.completed.add(f.posts[0].id);
  await f.service.resumeQueue();
  const release = await bounded(text, 'idle verification must release the uncertain image lease');
  assert(first.every(job => f.service.get(job.id).status === 'failed'));
  assert.equal(f.posts.length, 1); release();
  for (const job of next) await f.finish(job);
  assert.equal(f.posts.length, 4); assert.deepEqual(f.calls, []);
});

test('restarting an alternate series recovers exclusivity without replaying local images or unloading a model', async t => {
  const f = await fixture(t);
  const first = await f.service.submitSeries(images('Recovered'), owner, undefined, f.selection());
  await f.restart();
  assert(first.slice(1).every(job => f.service.get(job.id).status === 'failed'));
  let admitted = false;
  const text = f.scheduler.acquireModel().then(release => { admitted = true; return release; });
  await wait(20); assert.equal(admitted, false);
  await f.finish(first[0]);
  (await bounded(text, 'recovered image must release exclusive access'))();
  const repeated = await f.service.submitSeries(images('Ignored'), owner, undefined, f.selection());
  assert.deepEqual(repeated.map(job => job.id), first.map(job => job.id));
  assert.equal(f.posts.length, 1); assert.deepEqual(f.calls, []);
  assert.deepEqual(f.admissions, ['alternate', 'alternate']);
});

for (const policies of [['keep', 'alternate'], ['alternate', 'unload']]) {
  test('recovery chooses the strongest stored policy for ' + policies.join(' + '), async t => {
    const f = await fixture(t, { recoveredPolicies: policies });
    const expected = policies.includes('unload') ? 'unload' : 'alternate';
    await until(() => f.scheduler.snapshot().imagePolicy === expected);
    const text = f.scheduler.acquireModel();
    for (const job of f.old) await f.finish(job);
    (await bounded(text, 'recovered policy must eventually release model admission'))();
    assert.deepEqual(f.admissions, [expected]);
    assert.deepEqual(f.calls, expected === 'unload' ? ['list', 'unload:fixture-model'] : []);
    assert.equal(f.posts.length, 0);
  });
}

test('closing alternate while the next image waits for text cancels admission without releasing the text owner', async t => {
  const f = await fixture(t);
  const first = await f.service.submitSeries(images('Closing'), owner, undefined, f.selection());
  const text = f.scheduler.acquireModel();
  await f.finish(first[0]);
  const releaseText = await bounded(text, 'text must receive its boundary turn');
  await until(() => f.scheduler.snapshot().queuedImages === 1);
  await bounded(f.service.close(), 'closing must cancel the waiting per-image lease');
  assert.equal(f.scheduler.snapshot().queuedImages, 0);
  assert.equal(f.scheduler.snapshot().activeModels, 1);
  assert.equal(f.posts.length, 1);
  releaseText(); assert.equal(f.scheduler.snapshot().activeModels, 0);
});

test('alternate settings persist in version 4 while older policies keep their stored meaning', async t => {
  const f = await fixture(t);
  assert.equal(f.service.getSettings().modelPolicy, 'keep');
  await f.service.updateSettings({ modelPolicy: 'alternate' });
  assert.equal(f.service.resolveSelection('krea2_turbo').modelPolicy, 'alternate');
  const saved = JSON.parse(await fs.readFile(f.settingsFile, 'utf8'));
  assert.equal(saved.version, 4); assert.equal(saved.modelPolicy, 'alternate');
  const restored = await createComfySettings({ file: f.settingsFile });
  assert.equal(restored.get().modelPolicy, 'alternate');
  for (const policy of ['keep', 'unload']) {
    await f.service.updateSettings({ modelPolicy: policy });
    const previous = await createComfySettings({ file: f.settingsFile });
    assert.equal(previous.get().modelPolicy, policy);
  }
});
