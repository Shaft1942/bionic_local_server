import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Bundler-style .js imports resolve to TS sources only inside this boundary.
const source = new URL('../ui/src/lib/companion/', import.meta.url).href;
const hook = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(source) && specifier.startsWith('.') && specifier.endsWith('.js')) return next(specifier.slice(0, -3) + '.ts', context);
  return next(specifier, context);
} });
const { createChatClient } = await import('../ui/src/lib/companion/client/chat-client.ts');
const { parseEvent, parseReceipt, restoreJobs, ContractError } = await import('../ui/src/lib/companion/client/contracts.ts');
const { sendStream, ApiError, terminal } = await import('../ui/src/lib/companion/api.ts');
test.after(() => hook.deregister());
const job = { requestId: 'synthetic-request-0001', projectId: 'synthetic-project', draftNonce: 'draft-1', status: 'starting' };
const payload = { requestId: job.requestId, projectId: job.projectId, model: 'synthetic-model', sessionId: null, text: 'Texte synthétique' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('the first admission can create a web continuation but later admissions cannot replace its identity', async () => {
  for (const first of ['start', 'queued']) {
    const events = [];
    const { client, state } = fixture({ send: async (_payload, _signal, receive) => {
      receive({ type: first, id: 'web-A', ...(first === 'start' ? { replyId: 'reply-A' } : {}) });
      receive({ type: 'start', id: 'web-B', replyId: 'reply-B' });
    } });
    client.track({ ...job, id: 'native-original' });
    assert.equal((await client.send({ ...payload, sessionId: 'native-original' }, event => events.push(event))).kind, 'uncertain');
    assert.equal(events.length, 1); assert.equal(state.jobs[0].id, 'web-A');
  }
});

test('a successful terminal receipt without canonical id preserves tracking until a valid GET recovers it', async () => {
  for (const terminalStatus of ['done', 'complete', 'completed']) {
    for (const id of [undefined, null, '']) assert.throws(() => parseReceipt({ status: terminalStatus, id }, job.projectId), ContractError);
  }
  for (const status of ['starting', 'error', 'deleted']) assert.doesNotThrow(() => parseReceipt({ status, id: null }, job.projectId));
  let valid = false;
  const { client, state } = fixture({ lookup: async () => valid ? { status: 'completed', id: 'web-restored' } : { status: 'completed' } });
  client.restore([job]); await client.recover();
  assert.equal(state.jobs.length, 1); assert.equal(state.receipts.length, 0); assert.equal(state.failures.length, 1);
  valid = true; await client.recover();
  assert.equal(state.jobs.length, 0); assert.equal(state.receipts.length, 1); assert.equal(state.sends, 0);
});
function fixture(overrides = {}, observers = {}) {
  const state = { jobs: [], streams: [], changes: [], receipts: [], failures: [], sends: 0, cancels: 0, reads: 0 };
  const client = createChatClient({
    changed(jobs, streams) { state.jobs = jobs; state.streams = streams; state.changes.push(structuredClone({ jobs, streams })); },
    async receipt(...args) { state.receipts.push(args); await observers.receipt?.(...args); },
    failure(failure) { state.failures.push(failure); }
  }, {
    async lookup(target) { state.reads++; return overrides.lookup ? overrides.lookup(target) : { projectId: job.projectId, id: 'chat-1', status: 'completed' }; },
    async send(...args) { state.sends++; return overrides.send?.(...args); },
    async cancel(...args) { state.cancels++; return overrides.cancel?.(...args); }
  });
  return { client, state };
}

test('runtime boundary rejects malformed events, metadata and foreign receipts', () => {
  for (const value of [null, [], {}, { type: 'future-event' }, { type: 'delta', text: {} }, { type: 'start', id: 'chat' }, { type: 'approval', approval: [] }, { type: 'action', action: 'bad' }, { type: 'done', metrics: [] }, { type: 'done', finishedAt: 'today' }, { type: 'done', truncated: 'yes' }, { type: 'done', id: null }]) assert.throws(() => parseEvent(value), ContractError);
  for (const value of [{ status: {} }, { status: 'arbitrary' }, { status: 'running', id: {} }, { status: 'running', projectId: 'foreign' }, { status: 'running', phase: [] }]) assert.throws(() => parseReceipt(value, job.projectId), ContractError);
  const event = { type: 'done', metrics: { inputTokens: 10, outputTokens: 3 }, finishReason: null, contextReceipt: { files: [] } };
  assert.deepEqual(parseEvent(event), event);
});
test('restoration validates and deduplicates jobs without trusting arbitrary browser fields', () => {
  const valid = { ...job, id: 'chat-1' };
  assert.deepEqual(restoreJobs([valid, valid, { ...valid, requestId: 'bad' }, { ...valid, status: [] }, { ...valid, id: {} }, { ...valid, phase: 4 }]), [{ ...valid, disconnected: true }]);
  assert.deepEqual(restoreJobs({ jobs: [valid] }), []);
  assert.equal(terminal('deleted'), true);
});
test('success publishes live text, scoped job and immutable observable snapshots', async () => {
  const f = fixture({ send: async (_payload, _signal, receive) => {
    receive(parseEvent({ type: 'start', id: 'chat-1', replyId: 'reply-1', requestId: job.requestId }));
    receive(parseEvent({ type: 'delta', text: 'été 🌿' }));
    assert.equal(f.client.text(job.requestId), 'été 🌿');
    assert.equal(f.state.jobs[0].status, 'running');
  } });
  f.client.track(job); const original = f.state.jobs[0];
  assert.deepEqual(await f.client.send(payload, () => {}), { kind: 'finished' });
  assert.equal(original.status, 'starting'); assert.deepEqual(f.state.streams, []);
  await f.client.recover(); assert.equal(f.state.sends, 1); assert.equal(f.state.jobs.length, 0); assert.equal(f.state.receipts[0][2], true);
});
test('lost POST response reconciles via GET; restored client cannot replay it', async () => {
  const f = fixture({ send: async () => { throw Error('Lost response'); } }); f.client.track(job);
  assert.equal((await f.client.send(payload, () => {})).kind, 'uncertain');
  const saved = structuredClone(f.state.jobs);
  await assert.rejects(f.client.send(payload, () => {})); assert.equal(f.state.sends, 1);
  const reloaded = fixture(); reloaded.client.restore(saved); await reloaded.client.recover();
  assert.equal(reloaded.state.jobs.length, 0); assert.equal(reloaded.state.sends, 0); assert.equal(reloaded.state.reads, 1);
});
for (const code of [400, 401, 403, 422]) test(`HTTP ${code} refusal removes tracking; no hidden resend`, async () => {
  const f = fixture({ send: async () => { throw new ApiError(code, 'Synthetic refusal'); } }); f.client.track(job);
  assert.equal((await f.client.send(payload, () => {})).kind, 'rejected'); await f.client.recover();
  assert.equal(f.state.jobs.length, 0); assert.equal(f.state.reads, 0); assert.equal(f.state.sends, 1);
});
for (const found of [true, false]) test(`conflict resolves acceptance before draft restoration: found=${found}`, async () => {
  const f = fixture({ send: async () => { throw new ApiError(409, 'Conflict'); }, lookup: async () => { if (!found) throw new ApiError(404, 'Missing'); return { status: 'running', id: 'chat-1' }; } }); f.client.track(job);
  assert.equal((await f.client.send(payload, () => {})).kind, found ? 'uncertain' : 'rejected');
  assert.equal(f.state.jobs.length, found ? 1 : 0); assert.equal(f.state.sends, 1);
});
test('terminal receipt while reader is active retains its final delta; concurrent polls coalesce', async () => {
  const tail = deferred(), started = deferred(), read = deferred(); let lookups = 0;
  const f = fixture({
    send: async (_payload, _signal, receive) => { receive(parseEvent({ type: 'start', id: 'chat-1', replyId: 'reply-1' })); started.resolve(); await tail.promise; receive(parseEvent({ type: 'delta', text: 'Last delta' })); },
    lookup: async () => { lookups++; await read.promise; return { status: 'completed', id: 'chat-1' }; }
  });
  f.client.track(job); const sending = f.client.send(payload, () => {}); await started.promise;
  await f.client.recover(); assert.equal(lookups, 0);
  const recovering = f.client.recover(true); await f.client.recover(true); read.resolve(); await recovering;
  assert.equal(lookups, 1); assert.equal(f.state.jobs.length, 1); assert.equal(f.state.receipts[0][2], false);
  tail.resolve(); await sending; await f.client.recover(); assert.equal(f.state.jobs.length, 0); assert.equal(f.state.sends, 1);
});
test('failed canonical snapshot keeps the recovery handle until a successful reread', async () => {
  let fail = true;
  const f = fixture({}, { receipt: async () => { if (fail) throw Error('Synthetic snapshot failure'); } }); f.client.restore([{ ...job, id: 'chat-1' }]);
  await f.client.recover(); assert.equal(f.state.jobs.length, 1); assert.equal(f.state.jobs[0].disconnected, true);
  fail = false; await f.client.recover(); assert.equal(f.state.jobs.length, 0); assert.equal(f.state.sends, 0);
});
test('malformed receipt cannot retire a pending job; corrected GET restores it', async () => {
  let bad = true;
  const f = fixture({ lookup: async () => bad ? { status: 'completed', id: {} } : { status: 'completed', id: 'chat-1' } }); f.client.restore([job]);
  await f.client.recover(); assert.equal(f.state.failures[0] instanceof ContractError, true); assert.equal(f.state.jobs.length, 1);
  bad = false; await f.client.recover(); assert.equal(f.state.jobs.length, 0); assert.equal(f.state.sends, 0);
});
test('foreign stream request cannot mutate the tracked conversation', async () => {
  const f = fixture({ send: async (_payload, _signal, receive) => receive(parseEvent({ type: 'queued', requestId: 'foreign-request-0001', id: 'chat-foreign' })) }); f.client.track(job);
  const result = await f.client.send(payload, () => assert.fail('No foreign event reaches presentation'));
  assert.equal(result.kind, 'uncertain'); assert.equal(f.state.jobs[0].id, undefined);
});
test('admission can bind a native conversation to its web continuation; later foreign identities fail', async () => {
  const previous = [];
  const f = fixture({ send: async (_payload, _signal, receive) => {
    receive(parseEvent({ type: 'start', id: 'web-continuation', replyId: 'reply-1', requestId: job.requestId }));
    assert.equal(f.state.jobs[0].id, 'web-continuation');
    receive(parseEvent({ type: 'done', id: 'foreign-conversation' }));
  } });
  f.client.track({ ...job, id: 'native-conversation' });
  const result = await f.client.send({ ...payload, sessionId: 'native-conversation' }, (event, prior) => previous.push(prior));
  assert.equal(previous[0].id, 'native-conversation'); assert.equal(result.kind, 'uncertain'); assert.equal(result.failure instanceof ContractError, true);
});
test('detach only aborts reader; ambiguous cancel is never retried by recovery', async () => {
  const started = deferred();
  const f = fixture({ send: async (_payload, signal) => { started.resolve(); await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); }, cancel: async () => { throw Error('Lost cancellation response'); } });
  f.client.track({ ...job, id: 'chat-1' }); const sending = f.client.send(payload, () => {}); await started.promise;
  f.client.detach(job.requestId); assert.equal((await sending).kind, 'uncertain'); assert.equal(f.state.cancels, 0);
  await assert.rejects(f.client.cancel(f.state.jobs[0])); await f.client.recover();
  assert.equal(f.state.jobs.length, 0); assert.equal(f.state.cancels, 1); assert.equal(f.state.sends, 1);
});
test('NDJSON transport handles split UTF8, final line and releases malformed readers', async t => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  const bytes = new TextEncoder().encode('\n{"type":"delta","text":"été 🌿"}\n{"type":"done"}');
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }));
  const events = []; await sendStream(payload, new AbortController().signal, event => events.push(event));
  assert.deepEqual(events, [{ type: 'delta', text: 'été 🌿' }, { type: 'done' }]);
  for (const body of ['{"type":"delta","text":7}\n', 'not json\n', 'x'.repeat(1048577)]) {
    let cancelled = false;
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); }, cancel() { cancelled = true; } }));
    await assert.rejects(sendStream(payload, new AbortController().signal, () => assert.fail('Invalid event must not be emitted')), ContractError);
    assert.equal(cancelled, true);
  }
});
