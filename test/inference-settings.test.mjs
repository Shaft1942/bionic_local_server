import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createInferenceSettings, checkInferenceConnection } from '../lib/inference-settings.mjs';

const initial = { provider: 'bionic', apiUrl: 'http://127.0.0.1:1235', llamaUrl: 'http://127.0.0.1:1236', bionicToken: 'BIONIC_TOKEN_ONLY', llamaToken: 'LLAMA_TOKEN_ONLY' };
async function fixture(t, injectedFS = fs) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inference-settings-test-')), filename = path.join(root, 'data', 'inference-settings.json');
  t.after(async () => { assert(path.basename(root).startsWith('inference-settings-test-')); await fs.rm(root, { recursive: true, force: true }); });
  return { root, filename, store: await createInferenceSettings({ filename, initial, fs: injectedFS, reservedPorts: [8769, 8770, 8188] }) };
}

test('inference whitelist preserves masked tokens, refuses remote origins and keeps credential audiences separate', async t => {
  const f = await fixture(t), snapshot = f.store.snapshot();
  assert.equal(snapshot.hasBionicToken, true); assert.equal(snapshot.hasLlamaToken, true); assert(!JSON.stringify(snapshot).includes(initial.bionicToken));
  assert.equal(f.store.propose({ provider: 'llamacpp', bionicToken: '', llamaToken: '' }).llamaToken, initial.llamaToken);
  for (const input of [{ provider: 'openai' }, { apiUrl: 'http://remote.invalid:1235' }, { llamaUrl: 'http://user:pass@127.0.0.1:1236' }, { apiUrl: 'http://127.0.0.1:1235/v1' }, { apiUrl: 'http://127.0.0.1:1235/?secret=1' }, { provider: 'llamacpp', llamaUrl: 'http://127.0.0.1:8769', clearLlamaToken: true }, { runtime: 'execute' }, { llamaToken: 'header\ninjection' }]) assert.throws(() => f.store.propose(input), { status: 400 });
  assert.throws(() => f.store.propose({ llamaUrl: 'http://127.0.0.1:1240' }), { code: 'inference-token-scope' });
  assert.equal(f.store.propose({ llamaUrl: 'http://127.0.0.1:1240', clearLlamaToken: true }).llamaToken, '');
  assert.equal(f.store.propose({ clearBionicToken: true }).llamaToken, initial.llamaToken);
  await assert.rejects(fs.stat(f.filename), { code: 'ENOENT' });
});

test('revision serialization accepts one racing save; web settings and explicit token removal survive restart over defaults', async t => {
  const f = await fixture(t), revision = f.store.snapshot().revision;
  const settled = await Promise.allSettled([f.store.save({ provider: 'llamacpp', clearBionicToken: true, expectedRevision: revision }), f.store.save({ provider: 'bionic', expectedRevision: revision })]);
  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 1); assert.equal(settled.find(result => result.status === 'rejected').reason.code, 'inference-stale-revision');
  const saved = f.store.snapshot(); assert.equal(saved.provider, 'llamacpp'); assert.equal(saved.hasBionicToken, false); assert.notEqual(saved.revision, revision);
  const restored = await createInferenceSettings({ filename: f.filename, initial: { ...initial, provider: 'bionic', bionicToken: 'NEW_ENV_DEFAULT' } });
  assert.deepEqual(restored.snapshot(), saved); assert.equal(restored.current().bionicToken, ''); assert.equal(restored.current().llamaToken, initial.llamaToken);
  await assert.rejects(restored.save({ provider: 'bionic', expectedRevision: revision }), { code: 'inference-stale-revision' });
});

test('failed atomic rename preserves previous persisted settings and revision; a later retry can succeed', async t => {
  let failRename = false;
  const injected = new Proxy(fs, { get(target, key) { return key === 'rename' ? async (...args) => { if (failRename) throw Object.assign(new Error('synthetic permission denial'), { code: 'EACCES' }); return target.rename(...args); } : target[key]; } });
  const f = await fixture(t, injected);
  await f.store.save({ provider: 'bionic', expectedRevision: f.store.snapshot().revision });
  const before = f.store.snapshot(), bytes = await fs.readFile(f.filename, 'utf8'); failRename = true;
  await assert.rejects(f.store.save({ provider: 'llamacpp', expectedRevision: before.revision }), { code: 'inference-save-failed' });
  assert.deepEqual(f.store.snapshot(), before); assert.equal(await fs.readFile(f.filename, 'utf8'), bytes); assert.deepEqual(await fs.readdir(path.dirname(f.filename)), ['inference-settings.json']);
  failRename = false; await f.store.save({ provider: 'llamacpp', expectedRevision: before.revision }); assert.equal(f.store.snapshot().provider, 'llamacpp');
});

test('explicit connection checks only read bounded model metadata with the selected token and never claim tool compatibility', async () => {
  const calls = [], config = { ...initial, provider: 'llamacpp' };
  const check = await checkInferenceConnection(config, { fetchImpl: async (url, options) => {
    calls.push({ url, options }); assert.equal(options.method, undefined); assert.equal(options.headers.Authorization, 'Bearer ' + initial.llamaToken); assert.equal(options.redirect, 'error');
    return url.endsWith('/v1/models') ? Response.json({ data: [{ id: initial.llamaToken, meta: {} }] }) : Response.json({ total_slots: 1, default_generation_settings: { n_ctx: 8192 } });
  } });
  assert.equal(check.ok, true); assert.equal(calls.length, 2); assert.equal(check.capabilities.tools, 'unknown'); assert.equal(check.models[0].contextLength, 8192); assert(!JSON.stringify(check).includes(initial.llamaToken)); assert.equal(check.models[0].name, '[masqué]');
  const huge = await checkInferenceConnection(config, { fetchImpl: async () => new Response('too much', { headers: { 'content-length': '2000001' } }) }); assert.equal(huge.ok, false);
  const timeout = await checkInferenceConnection(config, { timeoutMs: 10, fetchImpl: async (_url, options) => new Promise((_, reject) => { options.signal.addEventListener('abort', () => reject(new Error(initial.llamaToken)), { once: true }); }) });
  assert.equal(timeout.ok, false); assert(!JSON.stringify(timeout).includes(initial.llamaToken));
});
