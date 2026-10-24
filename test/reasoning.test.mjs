import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReasoning, reasoningRequest, llamaThinkingCapability, llamaReasoningPayload } from '../lib/reasoning.mjs';
import { createLlamaCppModelService } from '../lib/llamacpp-model-service.mjs';
import { createModelTransport } from '../lib/model-transport.mjs';

const toggleTemplate = '{%- set enable_thinking = enable_thinking | default(false) -%}\n{%- if enable_thinking -%}<think>{%- else -%}direct{%- endif -%}';

test('binary capability remains binary and does not invent graded effort', () => {
  assert.deepEqual(normalizeReasoning({ allowed_options: ['off', 'on', 'on', 'invented'], default: 'on' }), { allowedOptions: ['off', 'on'], default: 'on' });
  assert.equal(normalizeReasoning(undefined), null);
  assert.equal(normalizeReasoning({ allowed_options: [] }), null);
});
test('default settings omit the request override, including legacy chats', () => {
  for (const choice of [undefined, null, 'default']) assert.deepEqual(reasoningRequest({}, choice), { choice: null, payload: {} });
});
test('binary choices use the installed Bionic Chat Completions adapter aliases', () => {
  const model = { reasoning: { allowedOptions: ['off', 'on'] } };
  assert.deepEqual(reasoningRequest(model, 'off'), { choice: 'off', payload: { reasoning_effort: 'none' } });
  assert.deepEqual(reasoningRequest(model, 'on'), { choice: 'on', payload: { reasoning_effort: 'medium' } });
  for (const choice of ['low', 'medium', 'high', true, 'xhigh']) assert.throws(() => reasoningRequest(model, choice), { status: 400 });
});
test('graded models preserve exactly the supported effort without falling back silently', () => {
  const model = { reasoning: { allowedOptions: ['low', 'medium', 'high'] } };
  for (const choice of model.reasoning.allowedOptions) assert.deepEqual(reasoningRequest(model, choice).payload, { reasoning_effort: choice });
  assert.throws(() => reasoningRequest(model, 'off'), { status: 400 });
  assert.throws(() => reasoningRequest({}, 'on'), { status: 400 });
});

test('additional native Bionic levels are kept only when explicitly announced', () => {
  const normalized = normalizeReasoning({ allowed_options: ['minimal', 'max', 'arbitrary'], default: 'max' });
  assert.deepEqual(normalized, { allowedOptions: ['minimal', 'max'], default: 'max' });
  for (const choice of normalized.allowedOptions) assert.deepEqual(reasoningRequest({ reasoning: normalized }, choice).payload, { reasoning_effort: choice });
  assert.throws(() => reasoningRequest({ reasoning: normalizeReasoning({ allowed_options: ['low'] }) }, 'max'), { status: 400 });
});

test('llama detects external boolean branches including a self-default and whitespace control', () => {
  for (const template of [toggleTemplate, '{% if enable_thinking %}yes{% endif %}', '{% if not enable_thinking %}no{% endif %}',
    '{% if (enable_thinking is defined) and (enable_thinking is false) %}no{% endif %}',
    '{% if enable_thinking == True %}yes{% endif %}',
    '{# ignored enable_thinking #}\n{% raw %}{% set enable_thinking = false %}{% endraw %}' + toggleTemplate,
    '{% if messages %}{% if enable_thinking and messages|length %}conditional{% endif %}{% if enable_thinking %}yes{% endif %}{% endif %}',
    '{% if false %}dead{% elif enable_thinking %}yes{% endif %}']) {
    assert.deepEqual(llamaThinkingCapability({ chat_template: template, chat_template_caps: { supports_reasoning_effort: false } }), {
      kind: 'toggle', allowedOptions: ['off', 'on'], default: null, transport: 'chat-template-enable-thinking', evidenceSource: 'props-template-control',
    });
  }
});

test('llama ignores strings, comments, tags, levels flags and ambiguous or overwritten controls', () => {
  const unknown = [undefined, '', '<think>reasoning</think>', '{# {% if enable_thinking %}yes{% endif %} #}',
    '{{ "enable_thinking" }}', '{{ "{% if enable_thinking %}yes{% endif %}" }}',
    '{% set description = "enable_thinking" %}', '{% raw %}{% if enable_thinking %}yes{% endif %}{% endraw %}',
    '{% if enable_thinking is defined %}not a value test{% endif %}',
    '{% set enable_thinking = false %}{% if enable_thinking %}never{% endif %}',
    '{% set enable_thinking = true %}{% if enable_thinking %}always{% endif %}',
    '{% if flag %}{% set enable_thinking = enable_thinking | default(false) %}{% endif %}{% if enable_thinking %}ambiguous{% endif %}',
    '{% if false %}{% if enable_thinking %}dead branch{% endif %}{% endif %}',
    '{% if (false) %}{% if enable_thinking %}dead branch{% endif %}{% endif %}',
    '{% if true %}always{% elif enable_thinking %}unreachable{% endif %}',
    '{% if false %}dead{% elif true %}always{% elif enable_thinking %}unreachable{% endif %}',
    '{% if true %}always{% else %}{% if enable_thinking %}unreachable{% endif %}{% endif %}',
    '{% macro unused() %}{% if enable_thinking %}not called{% endif %}{% endmacro %}',
    '{% for enable_thinking in values %}{% if enable_thinking %}shadowed{% endif %}{% endfor %}',
    '{% if enable_thinking %}yes{% endif %}{% set enable_thinking = false %}',
    '{% if ns.enable_thinking %}not an external kwarg{% endif %}',
    '{% if enable_thinking() %}function{% endif %}', '{% if enable_thinking or true %}always{% endif %}',
    '{{ enable_thinking }}', '{% if enable_thinking %}unclosed', '{% raw %}unclosed', '{# unclosed', '{{ "unclosed }}',
    '{% if (enable_thinking %}bad parentheses{% endif %}', '{% if enable_thinking) %}bad parentheses{% endif %}',
    'x'.repeat(262145), 42];
  for (const template of unknown) assert.equal(llamaThinkingCapability({ chat_template: template, chat_template_caps: { supports_reasoning_effort: true } }), null, String(template).slice(0, 120));
});

test('Gemma-style tool capture scopes do not hide an external thinking control', () => {
  const template = `{%- macro format_message(message) -%}
    {%- for content in message['content'] -%}{%- if content['type'] == 'text' -%}{{ content['text'] }}{%- endif -%}{%- endfor -%}
  {%- endmacro -%}
  {%- set rendered_tools -%}{%- for tool in tools -%}{{ tool }}{%- endfor -%}{%- endset -%}
  {%- set enable_thinking = enable_thinking | default(false) -%}
  {%- if enable_thinking or tools or (messages and messages[0]['role'] in ['system', 'developer']) -%}
    {%- if enable_thinking -%}thinking header{%- endif -%}{{ rendered_tools }}
  {%- endif -%}
  {%- for message in messages -%}
    {%- if message['role'] == 'assistant' -%}{{ format_message(message) }}
    {%- elif ns.prev_message_type == 'tool_response' and enable_thinking -%}thinking continuation{%- endif -%}
  {%- endfor -%}`;
  assert.deepEqual(llamaThinkingCapability({ chat_template: template }).allowedOptions, ['off', 'on']);
  const shadowed = '{% set enable_thinking %}captured constant{% endset %}{% if enable_thinking %}always true{% endif %}';
  assert.equal(llamaThinkingCapability({ chat_template: shadowed }), null);
  assert.equal(llamaThinkingCapability({ chat_template: '{% set unused %}unclosed' + toggleTemplate }), null);
});

test('toggle conversion never invents effort and default always omits override', () => {
  const model = { reasoning: llamaThinkingCapability({ chat_template: toggleTemplate }), capabilityEvidence: { provider: 'llamacpp' } };
  assert.deepEqual(reasoningRequest(model, 'off'), { choice: 'off', payload: { chat_template_kwargs: { enable_thinking: false } } });
  assert.deepEqual(reasoningRequest(model, 'on'), { choice: 'on', payload: { chat_template_kwargs: { enable_thinking: true } } });
  for (const choice of [undefined, null, 'default']) assert.deepEqual(reasoningRequest(model, choice), { choice: null, payload: {} });
  for (const choice of ['low', 'medium', 'high', 'max', true, {}, []]) assert.throws(() => reasoningRequest(model, choice), { status: 400 });
  assert.throws(() => reasoningRequest(null, 'on'), { status: 400 });
  assert.throws(() => reasoningRequest({ capabilityEvidence: { provider: 'llamacpp' }, reasoning: { allowedOptions: ['high'] } }, 'high'), { status: 400 });
});

test('llama payload allowlist rejects smuggling and malformed values', () => {
  for (const payload of [null, [], true, 'on', { reasoning_effort: 'medium' }, { model: 'foreign' }, { chat_template_kwargs: {} },
    { chat_template_kwargs: { enable_thinking: 'false' } }, { chat_template_kwargs: { enable_thinking: false, token: 'synthetic' } },
    { chat_template_kwargs: { enable_thinking: true }, max_tokens: 10 }]) assert.throws(() => llamaReasoningPayload(payload), { status: 400 });
  const original = { chat_template_kwargs: { enable_thinking: false } }, projected = llamaReasoningPayload(original);
  projected.chat_template_kwargs.enable_thinking = true; assert.equal(original.chat_template_kwargs.enable_thinking, false);
});

function engineFixture() {
  const state = { alias: 'synthetic-toggle', template: toggleTemplate, context: 4096, sleeping: false, calls: [], onProps: () => {} };
  const fetchImpl = async (url, options = {}) => {
    const route = new URL(url).pathname;
    state.calls.push({ route, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (route === '/v1/models') return Response.json({ data: [{ id: state.alias, meta: { n_ctx_train: 8192 } }] });
    if (route === '/props') { state.onProps(); return Response.json({ total_slots: 1, default_generation_settings: { n_ctx: state.context }, is_sleeping: state.sleeping,
      chat_template: state.template, chat_template_caps: { supports_reasoning_effort: false } }); }
    assert.equal(route, '/v1/chat/completions'); assert.equal(options.method, 'POST');
    return new Response('data: [DONE]\n\n');
  };
  const options = { baseUrl: 'http://127.0.0.1:19983', fetchImpl };
  return { state, service: createLlamaCppModelService(options), transport: createModelTransport({ ...options, provider: 'llamacpp' }) };
}

test('adapter to transport revalidates native toggle and transmits exactly true/false; default adds no catalogue read', async () => {
  const f = engineFixture(), [selected] = await f.service.list();
  for (const choice of ['off', 'on']) {
    f.state.calls.length = 0;
    await f.transport.request({ model: selected.inferenceId, messages: [], maxTokens: 72, reasoning: reasoningRequest(selected, choice).payload });
    assert.deepEqual(f.state.calls.map(call => [call.method, call.route]), [['GET', '/v1/models'], ['GET', '/props'], ['POST', '/v1/chat/completions']]);
    const sent = f.state.calls.at(-1).body;
    assert.deepEqual(sent.chat_template_kwargs, { enable_thinking: choice === 'on' });
    assert.equal(sent.reasoning_effort, undefined); assert.equal(sent.max_tokens, 72); assert.equal(sent.model, selected.inferenceId);
  }
  f.state.calls.length = 0;
  await f.transport.request({ model: selected.inferenceId, messages: [], reasoning: reasoningRequest(selected, 'default').payload });
  assert.equal(f.state.calls.length, 1); assert.equal(f.state.calls[0].method, 'POST');
  assert.equal(f.state.calls[0].body.chat_template_kwargs, undefined); assert.equal(f.state.calls[0].body.reasoning_effort, undefined);
});

test('invalid payloads are refused before any network request, and obsolete catalogue evidence prevents generation POST', async () => {
  const f = engineFixture();
  for (const reasoning of [{ reasoning_effort: 'low' }, { chat_template_kwargs: { enable_thinking: 1 } }, null]) await assert.rejects(f.transport.request({ model: f.state.alias, reasoning }), { status: 400 });
  assert.deepEqual(f.state.calls, []);
  for (const change of [state => { state.template = '{% set enable_thinking = false %}{% if enable_thinking %}forced{% endif %}'; },
    state => { state.alias = 'another-model'; }, state => { state.context = null; }, state => { state.sleeping = true; }]) {
    const f = engineFixture(), [selected] = await f.service.list(), accepted = reasoningRequest(selected, 'on');
    change(f.state); f.state.calls.length = 0;
    await assert.rejects(f.transport.request({ model: selected.inferenceId, messages: [], reasoning: accepted.payload }), error => [400, 409].includes(error.status));
    assert(f.state.calls.every(call => call.method === 'GET'), 'refusal happens before the generation POST');
  }
});

test('cancellation after capability refresh refuses before POST and Bionic keeps its existing transport shape', async () => {
  const f = engineFixture(), [selected] = await f.service.list(), controller = new AbortController();
  f.state.onProps = () => controller.abort(); f.state.calls.length = 0;
  await assert.rejects(f.transport.request({ model: selected.inferenceId, messages: [], reasoning: reasoningRequest(selected, 'off').payload, signal: controller.signal }), { name: 'AbortError' });
  assert(f.state.calls.every(call => call.method === 'GET'));
  const calls = [], transport = createModelTransport({ baseUrl: 'http://127.0.0.1:19982', fetchImpl: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return new Response(''); } });
  await transport.request({ model: 'synthetic-bionic', messages: [], reasoning: reasoningRequest({ reasoning: { allowedOptions: ['off', 'on'] } }, 'on').payload });
  assert.equal(calls.length, 1); assert.equal(calls[0].body.reasoning_effort, 'medium'); assert.equal(calls[0].body.chat_template_kwargs, undefined);
});
