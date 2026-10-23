import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { createComfyImages } from '../lib/comfy-images.mjs';
import { createGpuScheduler } from '../lib/gpu-scheduler.mjs';

const owner = { projectId: 'synthetic-project', chatId: 'synthetic-chat', messageId: 'synthetic-reply', requestId: 'synthetic-request' };
const subjects = prefix => ({ images: [
  { prompt: prefix + ' red bicycle by a stone wall', seed: 201, format: 'square' },
  { prompt: prefix + ' wooden sailboat at sunrise', seed: 202, format: 'portrait' },
  { prompt: prefix + ' yellow tram beside a park', seed: 203, format: 'landscape' },
] });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function until(condition, label) {
  const deadline = Date.now() + 3000;
  while (!condition()) { assert(Date.now() < deadline, label); await wait(5); }
}
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label)), 1500); })]);
  } finally { clearTimeout(timer); }
}
function recoveredJob(status = 'running') {
  return {
    id: randomUUID(), owner: { ...owner }, promptId: 'synthetic-recovered-prompt',
    status, prompt: 'Synthetic recovered image', seed: 123, format: 'square', width: 1024, height: 1024,
    workflowId: 'krea2_turbo', outputNodeId: '9', comfyUrl: 'http://127.0.0.1:8188',
    modelPolicy: 'unload', memoryCleanup: false, createdAt: Date.now(), updatedAt: Date.now(),
  };
}
async function fixture(t, { recovered, attachAfterCreation = false, holdFirstPost = false, existingModelLease = false, deadlineMs } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'comfy-recovery-test-'));
  const posts = [], modelCalls = [], completed = new Set(), remote = new Map();
  let loaded = true;
  const firstPost = deferred();
  const scheduler = createGpuScheduler({ modelService: {
    async list() { modelCalls.push('list'); return [{ type: 'llm', loaded, loadedInstances: loaded ? [{ id: 'synthetic-qwen-instance' }] : [] }]; },
    async unload(id) { modelCalls.push('unload:' + id); loaded = false; return { unloaded: true }; },
  } });
  const priorLease = existingModelLease ? await scheduler.acquireModel() : null;
  if (recovered) {
    await fs.writeFile(path.join(directory, recovered.id + '.json'), JSON.stringify(recovered));
    remote.set(recovered.promptId, { width: recovered.width, height: recovered.height });
  }
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'http://127.0.0.1:8188', 'all requests use the synthetic transport');
    assert.equal(options.redirect, 'error');
    if (parsed.pathname === '/prompt') {
      const graph = JSON.parse(options.body).prompt;
      const id = 'synthetic-new-' + (posts.length + 1);
      posts.push({ id, graph });
      remote.set(id, { width: graph['5'].inputs.width, height: graph['5'].inputs.height });
      if (holdFirstPost && posts.length === 1) {
        await firstPost.promise;
        throw Error('Synthetic connection lost after acceptance');
      }
      return Response.json({ prompt_id: id });
    }
    if (parsed.pathname === '/queue') {
      return Response.json({ queue_running: [...remote.keys()].filter(id => !completed.has(id)).map(id => [0, id]), queue_pending: [] });
    }
    if (parsed.pathname.startsWith('/history/')) {
      const id = decodeURIComponent(parsed.pathname.slice('/history/'.length));
      if (!completed.has(id)) return Response.json({});
      assert(remote.has(id));
      return Response.json({ [id]: { status: { completed: true, status_str: 'success' }, outputs: { '9': { images: [{ type: 'output', filename: id + '.png', subfolder: 'Synthetic' }] } } } });
    }
    if (parsed.pathname === '/view') {
      const id = parsed.searchParams.get('filename')?.replace(/\.png$/, '');
      const dimensions = remote.get(id); assert(dimensions);
      const png = Buffer.alloc(24);
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
      png.write('IHDR', 12); png.writeUInt32BE(dimensions.width, 16); png.writeUInt32BE(dimensions.height, 20);
      return new Response(png);
    }
    throw Error('Unexpected synthetic route ' + parsed.pathname);
  };
  const service = await createComfyImages({
    directory, settingsFile: path.join(directory, 'settings.json'), enabled: true, fetchImpl, pollMs: 10,
    ...(attachAfterCreation ? {} : { gpuScheduler: scheduler }),
    ...(deadlineMs === undefined ? {} : { deadlineMs }),
  });
  if (attachAfterCreation) service.setGpuScheduler(scheduler);
  t.after(async () => {
    firstPost.resolve();
    priorLease?.();
    await bounded(service.close(), 'synthetic recovery service must close');
    scheduler.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith('comfy-recovery-test-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return {
    service, scheduler, posts, modelCalls, completed, priorLease, releaseAmbiguousPost: firstPost.resolve,
    async finish(job) {
      await until(() => service.get(job.id).promptId, 'queued synthetic image must be submitted');
      completed.add(service.get(job.id).promptId);
      await service.refresh(job.id);
      await until(() => service.get(job.id).status === 'succeeded', 'synthetic image must be copied');
    },
  };
}

test('explicit queue recovery refuses a busy engine, then closes uncertainty and resumes pending groups without replay', async t => {
  const f = await fixture(t, { holdFirstPost: true });
  const selection = { ...f.service.resolveSelection('krea2_turbo'), modelPolicy: 'unload' };
  const firstPromise = f.service.submitSeries(subjects('First'), owner, undefined, selection);
  await until(() => f.posts.length === 1, 'first graph must reach the synthetic engine');
  const nextOwner = { ...owner, chatId: 'another-chat', messageId: 'another-reply' };
  const next = await f.service.submitSeries(subjects('Next'), nextOwner, undefined, selection);
  assert(next.every(job => job.queuedLocally && !job.promptId));
  f.releaseAmbiguousPost();
  const first = await firstPromise;
  await until(() => f.service.getSettings().queuePaused, 'unknown submission must pause the shared queue');
  await assert.rejects(f.service.resumeQueue(), { status: 409 });
  assert.equal(f.service.get(first[0].id).status, 'unknown');
  assert.equal(f.posts.length, 1);
  assert.equal(f.scheduler.snapshot().activeImages, 1, 'unload ownership must remain until the remote queue is idle');
  f.completed.add(f.posts[0].id);
  const resumed = await f.service.resumeQueue();
  assert.equal(resumed.queuePaused, false);
  assert(first.every(job => f.service.get(job.id).status === 'failed'));
  for (const job of next) await f.finish(job);
  assert.equal(f.posts.length, 4, 'only the already accepted ambiguous graph and three new images were sent');
  assert.deepEqual(f.posts.slice(1).map(post => post.graph['6'].inputs.text), subjects('Next').images.map(image => image.prompt));
  const repeated = await f.service.submitSeries(subjects('Ignored retry'), owner, undefined, selection);
  assert.deepEqual(repeated.map(job => job.id), first.map(job => job.id));
  assert.equal(f.posts.length, 4, 'recovery must never replay the original reply');
  await until(() => f.scheduler.snapshot().activeImages === 0, 'finished groups must release ownership');
});

for (const attachAfterCreation of [false, true]) {
  test(`recovered unload image blocks model admission until its terminal output (${attachAfterCreation ? 'late scheduler injection' : 'initial scheduler injection'})`, async t => {
    const old = recoveredJob();
    const f = await fixture(t, { recovered: old, attachAfterCreation });
    // Reattaching the same scheduler must not create a second recovery lease.
    f.service.setGpuScheduler(f.scheduler);
    let admitted = false;
    const model = f.scheduler.acquireModel().then(release => { admitted = true; return release; });
    await until(() => f.modelCalls.some(call => call.startsWith('unload:')), 'recovery must unload the synthetic model');
    await wait(20);
    assert.equal(admitted, false);
    assert.equal(f.scheduler.snapshot().imagePolicy, 'unload');
    assert.equal(f.posts.length, 0, 'the recovered prompt must only be monitored');
    await f.finish(old);
    const release = await bounded(model, 'model admission must resume after recovered image completion');
    assert.equal(admitted, true); release();
    assert.deepEqual(f.modelCalls, ['list', 'unload:synthetic-qwen-instance']);
    assert.equal(f.posts.length, 0);
  });
}

test('closing during active image recovery releases its writer and stops polling without replay', async t => {
  const old = recoveredJob();
  const f = await fixture(t, { recovered: old });
  await until(() => f.modelCalls.includes('unload:synthetic-qwen-instance'), 'recovery lease must be active');
  let admitted = false;
  const model = f.scheduler.acquireModel().then(release => { admitted = true; return release; });
  await wait(20); assert.equal(admitted, false);
  await bounded(f.service.close(), 'closing recovery must not wait for the remote renderer');
  const release = await bounded(model, 'closing the image service must release its GPU writer'); release();
  assert.equal(f.service.get(old.id).status, 'running', 'shutdown must not claim that the remote render stopped');
  assert.equal(f.scheduler.snapshot().activeImages, 0);
  assert.equal(f.scheduler.snapshot().activeModels, 0);
  assert.equal(f.posts.length, 0);
});

test('an unknown recovered submission preserves exclusivity until explicit idle verification and is never replayed', async t => {
  const old = recoveredJob('unknown');
  const f = await fixture(t, { recovered: old });
  await until(() => f.modelCalls.includes('unload:synthetic-qwen-instance'), 'unknown recovery must reserve exclusive image access');
  assert.equal(f.service.getSettings().queuePaused, true);
  let admitted = false;
  const model = f.scheduler.acquireModel().then(release => { admitted = true; return release; });
  await assert.rejects(f.service.resumeQueue(), { status: 409 });
  assert.equal(admitted, false);
  assert.equal(f.service.get(old.id).status, 'unknown');
  assert.equal(f.posts.length, 0);
  f.completed.add(old.promptId);
  await f.service.resumeQueue();
  assert.equal(f.service.getSettings().queuePaused, false);
  assert.equal(f.service.get(old.id).status, 'failed');
  const release = await bounded(model, 'explicit recovery must release old image ownership after idle verification'); release();
  assert.equal(f.posts.length, 0);
  assert.equal(f.scheduler.snapshot().activeImages, 0);
});

test('closing while recovery waits for an existing model cancels the writer before any unload', async t => {
  const old = recoveredJob();
  const f = await fixture(t, { recovered: old, existingModelLease: true });
  assert.equal(f.scheduler.snapshot().queuedImages, 1);
  await bounded(f.service.close(), 'a queued recovery lease must be cancellable on close');
  assert.deepEqual(f.modelCalls, []);
  assert.equal(f.scheduler.snapshot().queuedImages, 0);
  assert.equal(f.scheduler.snapshot().activeModels, 1);
  f.priorLease();
  assert.equal(f.scheduler.snapshot().activeModels, 0);
  assert.equal(f.posts.length, 0);
});

test('a recovered running image exceeding its monitoring deadline pauses new images and retains model protection', async t => {
  const old = recoveredJob();
  old.createdAt = old.updatedAt = Date.now() - 10000;
  const f = await fixture(t, { recovered: old, deadlineMs: 1000 });
  await until(() => f.service.get(old.id).status === 'unknown', 'recovered image must reach the monitoring deadline');
  assert.equal(f.service.getSettings().queuePaused, true);
  await assert.rejects(f.service.submitSeries(subjects('Blocked'), { ...owner, messageId: 'blocked-reply' }), { status: 409 });
  await assert.rejects(f.service.resumeQueue(), { status: 409 });
  let admitted = false;
  const model = f.scheduler.acquireModel().then(release => { admitted = true; return release; });
  await wait(20);
  assert.equal(admitted, false, 'an uncertain recovered render may still be using the GPU');
  assert.equal(f.posts.length, 0);
  f.completed.add(old.promptId);
  await f.service.resumeQueue();
  const release = await bounded(model, 'verified idle recovery must eventually release the model'); release();
  assert.equal(f.service.get(old.id).status, 'failed');
  assert.equal(f.service.getSettings().queuePaused, false);
  assert.equal(f.posts.length, 0, 'neither the old image nor the refused series may be submitted');
});
