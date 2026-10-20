import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createToolApprovals } from '../lib/tool-approvals.mjs';

function pending(approvals, options = {}) {
  let first;
  const ready = new Promise(resolve => { first = resolve; });
  const states = [];
  const result = approvals.request({ projectId: 'p1', chatId: 'c1', proposal: { runtime: 'node', code: 'console.log("original")' }, ...options, onChange: async value => { states.push(structuredClone(value)); first(value); await options.onChange?.(value); } });
  return { ready, result, states };
}

test('approval is bound to its exact project and conversation and is single-use', async () => {
  const approvals = createToolApprovals(), request = pending(approvals), proposal = await request.ready;
  for (const [projectId, chatId] of [['p2', 'c1'], ['p1', 'c2']]) await assert.rejects(approvals.decide({ id: proposal.id, projectId, chatId, decision: 'approve' }), { status: 404 });
  await assert.rejects(approvals.decide({ id: proposal.id, projectId: 'p1', chatId: 'c1', decision: 'sometimes' }), { status: 400 });
  assert.equal(request.states.length, 1);
  const decisions = await Promise.allSettled([1, 2].map(() => approvals.decide({ id: proposal.id, projectId: 'p1', chatId: 'c1', decision: 'approve' })));
  assert.equal(decisions.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(decisions.filter(item => item.status === 'rejected').length, 1);
  const result = await request.result;
  assert.equal(result.approved, true);
  assert.deepEqual(request.states.map(value => value.status), ['pending', 'approved']);
  await assert.rejects(approvals.decide({ id: proposal.id, projectId: 'p1', chatId: 'c1', decision: 'deny' }), { status: 404 });
});

test('denial and expiration return terminal non-authorizing decisions', async () => {
  const approvals = createToolApprovals(), denied = pending(approvals), proposal = await denied.ready;
  await approvals.decide({ id: proposal.id, projectId: 'p1', chatId: 'c1', decision: 'deny' });
  assert.deepEqual([ (await denied.result).approved, (await denied.result).approval.status ], [false, 'denied']);
  const expiring = createToolApprovals({ ttl: 15 }), expired = pending(expiring), old = await expired.ready;
  await delay(30);
  assert.deepEqual([ (await expired.result).approved, (await expired.result).approval.status ], [false, 'expired']);
  await assert.rejects(expiring.decide({ id: old.id, projectId: 'p1', chatId: 'c1', decision: 'approve' }), { status: 404 });
});

test('abort before or during approval never grants permission', async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(createToolApprovals().request({ projectId: 'p1', chatId: 'c1', proposal: {}, signal: before.signal }), { status: 409 });
  const approvals = createToolApprovals(), controller = new AbortController();
  const request = pending(approvals, { signal: controller.signal }), proposal = await request.ready;
  controller.abort();
  assert.equal((await request.result).approval.status, 'cancelled');
  await assert.rejects(approvals.decide({ id: proposal.id, projectId: 'p1', chatId: 'c1', decision: 'approve' }), { status: 404 });
});

test('caller and observer mutations cannot rewrite the proposed code or its authorization', async () => {
  const approvals = createToolApprovals(), proposal = { code: 'exact original', nested: { unchanged: true } };
  const request = pending(approvals, { proposal, onChange: value => { value.code = 'observer mutation'; value.nested.unchanged = false; value.status = 'approved'; } });
  proposal.code = 'caller mutation'; proposal.nested.unchanged = false;
  const displayed = await request.ready, original = request.states[0];
  await approvals.decide({ id: displayed.id, projectId: 'p1', chatId: 'c1', decision: 'approve' });
  const result = await request.result;
  assert.equal(original.code, 'exact original');
  assert.equal(result.approval.code, 'exact original');
  assert.equal(result.approval.nested.unchanged, true);
  assert.equal(result.approval.status, 'approved');
});

test('abort while the pending checkpoint is saving preserves ordered terminal state', async () => {
  let release;
  const saved = new Promise(resolve => { release = resolve; });
  const controller = new AbortController(), approvals = createToolApprovals();
  const request = pending(approvals, { signal: controller.signal, onChange: async value => { if (value.status === 'pending') await saved; } });
  await request.ready; controller.abort(); release();
  assert.equal((await request.result).approval.status, 'cancelled');
  assert.deepEqual(request.states.map(value => value.status), ['pending', 'cancelled']);
});

test('failed checkpoint removes the pending permission instead of granting it', async () => {
  const approvals = createToolApprovals();
  let observed;
  await assert.rejects(approvals.request({ projectId: 'p1', chatId: 'c1', proposal: {}, onChange: value => { observed = value; throw new Error('save failed'); } }), /save failed/);
  await assert.rejects(approvals.decide({ id: observed.id, projectId: 'p1', chatId: 'c1', decision: 'approve' }), { status: 404 });
  assert.throws(() => createToolApprovals({ ttl: 0 }), { status: 400 });
});
