import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createLlamaCppModelService } from '../lib/llamacpp-model-service.mjs';
import { createModelTransport } from '../lib/model-transport.mjs';
import { consumeModelStream } from '../lib/file-agent.mjs';
import { createGpuScheduler } from '../lib/gpu-scheduler.mjs';
import { prepareLlamaLaunch } from '../lib/llamacpp-launch.mjs';
import { loadSettings } from '../lib/config.mjs';
import { runDiagnostics } from '../lib/diagnostics.mjs';

const endpoint = 'http://127.0.0.1:1236';
function fixture(overrides = {}) {
  const state = { catalog: { data: [{ id: 'shared-alias', meta: { n_ctx_train: 131072 } }] }, props: { total_slots: 1, default_generation_settings: { n_ctx: 4096 }, is_sleeping: false, build_info: 'b123-fixture' }, ...overrides };
  const requests = [];
  const service = createLlamaCppModelService({ baseUrl: endpoint, headers: () => ({ Authorization: 'Bearer SYNTHETIC' }), fetchImpl: async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.method, undefined); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer SYNTHETIC');
    assert(url === endpoint + '/v1/models' || url === endpoint + '/props');
    return Response.json(url.endsWith('/props') ? state.props : state.catalog);
  } });
  return { state, requests, service };
}
async function directory(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'llamacpp-fixture-')));
  t.after(async () => { assert.equal(path.dirname(root), await fs.realpath(os.tmpdir())); assert(path.basename(root).startsWith('llamacpp-fixture-')); await fs.rm(root, { recursive: true, force: true }); });
  return root;
}

test('llama catalog uses loaded slot context, keeps capability unknown and separates model identity', async () => {
  const { service } = fixture(); const [model] = await service.list();
  assert.match(model.id, /^llamacpp:[a-f0-9]{64}$/); assert.notEqual(model.id, model.inferenceId);
  assert.equal(model.contextLength, 4096); assert.equal(model.maxContextLength, 131072);
  assert.equal(model.tools, 'unknown'); assert.equal(model.reasoning, null); assert.equal(model.vision, false);
  assert.equal(model.modelManagement, false); assert.equal((await service.forInference(model.id)).inferenceId, 'shared-alias');
  const other = createLlamaCppModelService({ baseUrl: 'http://127.0.0.1:1237', fetchImpl: async url => Response.json(url.endsWith('/props') ? { total_slots: 1 } : { data: [{ id: 'shared-alias' }] }) });
  assert.notEqual((await other.list())[0].id, model.id);
});

test('missing loaded context, cold or sleeping models never trigger automatic load', async () => {
  for (const override of [{ props: { total_slots: 1 } }, { catalog: { data: [{ id: 'shared-alias', meta: null }] } }, { props: { total_slots: 1, default_generation_settings: { n_ctx: 4096 }, is_sleeping: true } }]) {
    const { service } = fixture(override); const [model] = await service.list();
    await assert.rejects(service.forInference(model.id), { status: 409 });
  }
  await assert.rejects(fixture().service.forInference('foreign-model'), { status: 400 });
});

test('unload is unavailable and an unload image policy fails before acquiring a render lease', async () => {
  const { service, requests } = fixture();
  await assert.rejects(service.unload('any'), { status: 409 }); assert.equal(requests.length, 0);
  const scheduler = createGpuScheduler({ modelService: service });
  await assert.rejects(scheduler.acquireImages({ policy: 'unload' }), { status: 409 });
  assert.equal(scheduler.snapshot().activeImages, 0); scheduler.close();
});

test('invalid, router and HTTP responses are refused without a fallback engine', async () => {
  for (const catalog of [{}, { data: [null] }, { data: [{ id: 'a' }, { id: 'b' }] }]) await assert.rejects(fixture({ catalog }).service.list(), { status: 502 });
  for (const fetchImpl of [async () => { throw Error('offline'); }, async () => new Response('private error', { status: 401 }), async () => new Response('bad json')]) {
    await assert.rejects(createLlamaCppModelService({ baseUrl: endpoint, fetchImpl }).list(), { status: 502 });
  }
  const { service, requests } = fixture(); const controller = new AbortController(); controller.abort();
  await assert.rejects(service.forInference('any', { signal: controller.signal })); assert.equal(requests.length, 0);
});

test('transport streams fragmented structured tools, sends alias and propagates cancellation', async () => {
  let captured;
  const controller = new AbortController();
  const adapter = createModelTransport({ baseUrl: endpoint, provider: 'llamacpp', headers: () => ({ Authorization: 'Bearer LLAMA_FIXTURE' }), fetchImpl: async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    const packets = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'search_web', arguments: '{"query":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"fixture"}' } }] }, finish_reason: 'tool_calls' }] },
    ].map(packet => 'data: ' + JSON.stringify(packet) + '\n\n').join('') + 'data: [DONE]\n\n';
    return new Response(new ReadableStream({ start(c) { const bytes = Buffer.from(packets); for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.subarray(i, i + 7)); c.close(); } }));
  } });
  const response = await adapter.request({ model: 'shared-alias', messages: [], tools: [{ type: 'function', function: { name: 'search_web' } }], maxTokens: 100, signal: controller.signal });
  const result = await consumeModelStream(response.body, { onContent() {}, signal: controller.signal });
  assert.equal(result.calls[0].function.name, 'search_web'); assert.deepEqual(JSON.parse(result.calls[0].function.arguments), { query: 'fixture' });
  assert.equal(captured.url, endpoint + '/v1/chat/completions'); assert.equal(captured.body.model, 'shared-alias');
  assert.equal(captured.body.max_tokens, 100); assert.equal(captured.body.parallel_tool_calls, false);
  assert.equal(captured.options.signal, controller.signal); assert.equal(captured.options.redirect, 'error');
  assert.equal(captured.body.reasoning_effort, undefined); assert.equal(adapter.identity.provider, 'llamacpp');
  await assert.rejects(adapter.request({ reasoning: { reasoning_effort: 'medium' } }), { status: 400 });
  const cancelled = createModelTransport({ baseUrl: endpoint, provider: 'llamacpp', fetchImpl: async (url, { signal }) => { signal.throwIfAborted(); } });
  controller.abort(); await assert.rejects(cancelled.request({ signal: controller.signal }));
});

test('llama settings are opt-in, local, distinct from existing services and have environment overrides', async t => {
  const root = await directory(t);
  assert.equal((await loadSettings({ root, env: {} })).inferenceProvider, 'bionic');
  await fs.writeFile(path.join(root, 'config.local.json'), JSON.stringify({ inferenceProvider: 'llamacpp', llamaUrl: endpoint }));
  assert.equal((await loadSettings({ root, env: {} })).llamaUrl, endpoint);
  assert.equal((await loadSettings({ root, env: { BIONIC_MOBILE_INFERENCE_PROVIDER: 'bionic' } })).inferenceProvider, 'bionic');
  for (const llamaUrl of ['http://192.168.1.2:1236', 'http://user:pass@localhost:1236', 'http://localhost:1236/v1', 'http://localhost:1235', 'http://localhost:8769', 'http://localhost:8770', 'http://localhost:8188']) await assert.rejects(loadSettings({ root, env: { BIONIC_LLAMA_URL: llamaUrl } }), /Configuration invalide/);
  await assert.rejects(loadSettings({ root, env: { BIONIC_MOBILE_INFERENCE_PROVIDER: 'auto' } }), /Configuration invalide/);
});

test('launch preparation reads only an existing GGUF, defaults to CPU and never executes without --start', async t => {
  const root = await directory(t), model = path.join(root, 'existing model.gguf'), server = path.join(root, 'server.exe');
  await fs.writeFile(model, 'GGUFsynthetic'); await fs.writeFile(server, 'not an executable');
  const before = await fs.readFile(model), plan = await prepareLlamaLaunch({ server, model });
  assert.equal(plan.gpuLayers, 0); assert(plan.args.includes(model)); assert(!plan.args.includes('--hf-repo'));
  const output = JSON.parse(execFileSync(process.execPath, ['scripts/llamacpp.mjs', '--server', server, '--model', model], { cwd: new URL('../', import.meta.url), encoding: 'utf8', windowsHide: true }));
  assert.equal(output.started, false); assert.deepEqual(await fs.readFile(model), before);
  await assert.rejects(prepareLlamaLaunch({ server, model, port: 1235 }));
  await assert.rejects(prepareLlamaLaunch({ server, model, context: 0 }));
  await fs.writeFile(model, 'not-GGUF'); await assert.rejects(prepareLlamaLaunch({ server, model }), /En-tête/);
});

test('diagnostics probe llama catalog without Bionic calls or exporting model records', async () => {
  const result = await runDiagnostics({ settings: { inferenceProvider: 'llamacpp', llamaUrl: endpoint }, checkPython: async () => 'PYTHON_UNAVAILABLE', fetchImpl: async (url, options) => {
    assert.equal(url, endpoint + '/v1/models'); assert.equal(options.redirect, 'error');
    return Response.json({ data: [{ id: 'PRIVATE_FIXTURE_NAME' }] });
  } });
  assert(result.checks.some(check => check.code === 'TOOL_CAPABILITIES_UNKNOWN'));
  assert(!JSON.stringify(result).includes('PRIVATE_FIXTURE_NAME'));
});
