import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { forkConversation } from '../lib/conversation-fork.mjs';
import { createWorkspaceFeatures } from '../lib/workspace-features.mjs';

function source() {
  return {
    id: 'web-11111111-1111-4111-8111-111111111111', projectId: 'project-1', name: 'Essai', source: 'web',
    model: 'local-model', reasoningByModel: { 'local-model': 'medium' }, fileAccess: true, webAccess: true, scriptAccess: true,
    generation: { status: 'completed', requestId: 'request-1', replyId: 'answer-1' }, queue: [{ status: 'queued', text: 'Do not replay' }],
    approvals: [{ id: 'top-approval', status: 'pending' }], adminToken: 'must not copy',
    messages: [
      { id: 'question-1', role: 'user', text: 'Question', requestId: 'request-1', requestStatus: 'completed', attachments: [
        { kind: 'text', name: 'notes.md', rootId: 'project', path: 'notes.md', hash: 'a'.repeat(64), text: 'Exact captured bytes', excerpt: true },
        { kind: 'image', name: 'photo.png', hash: 'b'.repeat(64), mime: 'image/png' },
      ] },
      { id: 'answer-1', role: 'assistant', text: 'Réponse', complete: true, createdAt: 123, finishedAt: 456, outcome: 'completed', requestId: 'request-1',
        metrics: { inputTokens: 42 }, approvals: [{ id: 'approval-1', status: 'pending', code: 'do not execute' }],
        actions: [{ id: 'action-1', name: 'write_project_file', ok: true, path: 'notes.md', hash: 'c'.repeat(64), backupId: 'backup-secret', trashId: 'trash-secret', approvalId: 'approval-1', message: 'Fichier modifié', code: 'do not execute' }],
        contextReceipt: { initialTransmitted: true, permissions: { fileAccess: true }, current: { messageId: 'question-1' }, history: { messages: [{ id: 'question-1', preview: 'Question' }] }, attachments: [{ messageId: 'question-1', hash: 'a'.repeat(64) }], toolReads: [{ actionId: 'action-1', text: 'Read exact excerpt', hash: 'a'.repeat(64) }] },
      },
      { id: 'question-2', role: 'user', text: 'Ensuite', requestId: 'request-2', requestStatus: 'running' },
      { id: 'answer-2', role: 'assistant', text: 'Suite', outcome: 'completed', finishedAt: 789 },
    ],
  };
}

test('a full fork creates fresh ids, explicit origin and an independent writable web conversation', () => {
  const original = source(), before = structuredClone(original), fork = forkConversation({ source: original });
  assert.match(fork.id, /^web-[a-f0-9-]{36}$/);
  assert.notEqual(fork.id, original.id); assert.equal(fork.projectId, original.projectId);
  assert.equal(fork.source, 'web'); assert.equal(fork.readOnly, false); assert.equal(fork.name, 'Essai · branche');
  assert.deepEqual(fork.origin, { kind: 'fork', id: original.id, name: 'Essai', source: 'web', messageId: 'answer-2', messageIndex: 3 });
  assert.equal(new Set(fork.messages.map(message => message.id)).size, 4);
  assert.ok(fork.messages.every((message, index) => message.id !== original.messages[index].id && message.fromFork));
  assert.deepEqual(fork.messages.map(message => message.text), original.messages.map(message => message.text));
  assert.deepEqual(original, before);
});

test('a chosen boundary is inclusive and a user message can start a new alternative answer', () => {
  const original = source(), answerFork = forkConversation({ source: original, messageId: 'answer-1', name: 'Autre direction' });
  assert.equal(answerFork.messages.length, 2); assert.equal(answerFork.name, 'Autre direction');
  assert.equal(answerFork.origin.messageId, 'answer-1');
  const questionFork = forkConversation({ source: original, messageId: 'question-1' });
  assert.equal(questionFork.messages.length, 1); assert.equal(questionFork.messages[0].role, 'user');
});

test('attachments, receipts, metrics and model settings are deep independent snapshots', () => {
  const original = source(), fork = forkConversation({ source: original, messageId: 'answer-1' });
  assert.deepEqual(fork.messages[0].attachments, original.messages[0].attachments);
  assert.equal(fork.messages[0].attachments[0].text, 'Exact captured bytes');
  assert.equal(fork.messages[0].attachments[1].hash, 'b'.repeat(64));
  const receipt = fork.messages[1].contextReceipt;
  assert.equal(receipt.current.messageId, fork.messages[0].id);
  assert.equal(receipt.history.messages[0].id, fork.messages[0].id);
  assert.equal(receipt.attachments[0].messageId, fork.messages[0].id);
  assert.equal(receipt.toolReads[0].text, original.messages[1].contextReceipt.toolReads[0].text);
  assert.equal(receipt.initialTransmitted, true); assert.equal(receipt.historical, true);
  assert.deepEqual(receipt.origin, { chatId: original.id, messageId: 'answer-1', source: 'web' });
  fork.messages[0].attachments[0].text = 'Changed in fork'; receipt.toolReads[0].text = 'Changed';
  fork.messages[1].metrics.inputTokens = 0; fork.reasoningByModel['local-model'] = 'off';
  assert.equal(original.messages[0].attachments[0].text, 'Exact captured bytes');
  assert.equal(original.messages[1].contextReceipt.toolReads[0].text, 'Read exact excerpt');
  assert.equal(original.messages[1].metrics.inputTokens, 42); assert.equal(original.reasoningByModel['local-model'], 'medium');
  original.messages[0].attachments[1].hash = 'modified'; assert.equal(fork.messages[0].attachments[1].hash, 'b'.repeat(64));
});

test('no request, queue, script/web permission, approval, restore or file pin authority is inherited', () => {
  const fork = forkConversation({ source: source(), messageId: 'answer-1' }), reply = fork.messages[1];
  assert.deepEqual(fork.queue, []); assert.equal(fork.generation, undefined); assert.equal(fork.approvals, undefined); assert.equal(fork.adminToken, undefined);
  assert.equal(fork.fileAccess, true);
  for (const permission of ['webAccess', 'scriptAccess']) assert.equal(fork[permission], false);
  for (const message of fork.messages) {
    for (const field of ['requestId', 'localRequestId', 'requestStatus', 'approvals', 'actions']) assert.equal(message[field], undefined, field);
  }
  const action = reply.historicalActions[0];
  assert.equal(action.historical, true); assert.equal(action.ok, true); assert.equal(action.name, 'write_project_file');
  assert.equal(action.origin.chatId, source().id); assert.equal(action.origin.actionId, 'action-1');
  for (const field of ['id', 'hash', 'backupId', 'trashId', 'approvalId', 'code']) assert.equal(action[field], undefined, field);
  assert.equal(action.sourceHash, 'c'.repeat(64));
});

test('a copied successful file journal cannot authorize a new deliverable or access the source file', async () => {
  const original = source(); original.messages[1].actions[0].id = '11111111-1111-4111-8111-111111111111';
  const fork = forkConversation({ source: original, messageId: 'answer-1' });
  let downloads = 0;
  const workspace = createWorkspaceFeatures({
    directory: path.join(os.tmpdir(), 'fork-pins-must-not-be-written'),
    listProjects: async () => [{ id: 'project-1' }], listWebChats: async () => [fork], readConversation: async () => fork,
    projectFiles: { download: async () => { downloads++; throw new Error('Copied action must not read a file'); } },
  });
  await assert.rejects(workspace.pinDeliverable({ projectId: 'project-1', chatId: fork.id, messageId: fork.messages[1].id, kind: 'file', actionId: original.messages[1].actions[0].id }), { status: 409 });
  assert.equal(downloads, 0);
});

test('file access is a strictly explicit web preference; native history cannot grant it', () => {
  for (const sourceType of ['web', 'bionic']) for (const fileAccess of [undefined, false, true, 'true', 1]) {
    const original = source(); original.source = sourceType; original.fileAccess = fileAccess;
    const fork = forkConversation({ source: original });
    assert.equal(fork.fileAccess, sourceType === 'web' && fileAccess === true);
    assert.equal(fork.webAccess, false); assert.equal(fork.scriptAccess, false);
  }
});

test('copying old completions does not create fresh activity events', () => {
  const fork = forkConversation({ source: source(), messageId: 'answer-1' });
  assert.equal(fork.messages[1].finishedAt, undefined); assert.equal(fork.messages[1].outcome, undefined);
  assert.equal(fork.messages[1].origin.finishedAt, 456); assert.equal(fork.messages[1].origin.outcome, 'completed');
});

test('a source running later can still fork a completed earlier boundary without replaying its queue', () => {
  const original = source(); original.generation = { status: 'running', requestId: 'request-2', replyId: 'answer-2' };
  original.messages[3].requestId = 'request-2'; original.messages[3].complete = false;
  const fork = forkConversation({ source: original, messageId: 'answer-1' });
  assert.equal(fork.messages.length, 2); assert.deepEqual(fork.queue, []);
  assert.throws(() => forkConversation({ source: original }), { status: 409 });
  assert.throws(() => forkConversation({ source: original, messageId: 'answer-2' }), { status: 409 });
  assert.equal(forkConversation({ source: original, messageId: 'question-2' }).messages.length, 3);
});

test('active assistant detection handles legacy reply ids and incomplete or blank responses', () => {
  for (const generation of [{ status: 'running' }, { status: 'running', requestId: 'request-2' }]) {
    const original = source(); original.generation = generation; original.messages[3].requestId = 'request-2';
    assert.throws(() => forkConversation({ source: original }), { status: 409 });
  }
  for (const generation of [{ status: 'running', requestId: 'unknown-request' }, { status: 'running', replyId: 'missing-reply' }]) {
    const original = source(); original.generation = generation;
    assert.throws(() => forkConversation({ source: original }), { status: 409 });
    assert.equal(forkConversation({ source: original, messageId: 'answer-1' }).messages.length, 2);
  }
  for (const extra of [{ complete: false }, { status: 'running' }, { text: '', outcome: undefined }]) {
    const original = source(); Object.assign(original.messages[3], extra);
    assert.throws(() => forkConversation({ source: original }), { status: 409 });
  }
});

test('terminal interrupted, stopped and failed responses can be copied as settled history', () => {
  for (const status of ['interrupted', 'stopped', 'error']) {
    const original = source(); original.generation = { status, replyId: 'answer-2' };
    original.messages[3].outcome = status; original.messages[3].interrupted = true;
    const fork = forkConversation({ source: original });
    assert.equal(fork.messages.at(-1).origin.outcome, status); assert.equal(fork.messages.at(-1).interrupted, true);
  }
});

test('native read-only history becomes an independent web branch without importing native authority', () => {
  const original = { id: 'native-session', projectId: 'project-1', name: 'Bionic', source: 'bionic', readOnly: true, headId: 'head', storageReadMode: 'native-readonly', truncated: true, omitted: { attachments: 2 }, messages: [{ id: 'native-message', role: 'assistant', text: 'Visible native answer' }] };
  const before = structuredClone(original), fork = forkConversation({ source: original });
  assert.equal(fork.source, 'web'); assert.equal(fork.readOnly, false); assert.equal(fork.importedTruncated, true);
  assert.equal(fork.origin.source, 'bionic'); assert.equal(fork.messages[0].fromBionic, true);
  assert.equal(fork.headId, undefined); assert.equal(fork.storageReadMode, undefined);
  fork.omitted.attachments = 0; assert.deepEqual(original, before);
});

test('forking a fork preserves the original journal provenance and never revives authority', () => {
  const first = forkConversation({ source: source(), messageId: 'answer-1' });
  const second = forkConversation({ source: first });
  assert.equal(second.origin.id, first.id); assert.equal(second.messages[1].origin.chatId, first.id);
  assert.deepEqual(second.messages[1].historicalActions[0].origin, first.messages[1].historicalActions[0].origin);
  assert.equal(second.messages[1].historicalActions[0].sourceHash, 'c'.repeat(64));
  assert.equal(second.messages[1].actions, undefined); assert.equal(second.messages[1].approvals, undefined);
  second.messages[1].historicalActions[0].message = 'Changed';
  assert.equal(first.messages[1].historicalActions[0].message, 'Fichier modifié');
});

test('legacy messages without ids still get independent ids and positional provenance', () => {
  const original = source(); delete original.messages[0].id;
  const fork = forkConversation({ source: original, messageId: 'answer-1' });
  assert.match(fork.messages[0].id, /^[a-f0-9-]{36}$/); assert.equal(fork.messages[0].origin.messageId, null);
  assert.equal(fork.messages[0].origin.messageIndex, 0);
});

test('invalid sources, duplicate ids, missing boundaries and invalid branch names fail clearly', () => {
  for (const input of [null, [], 'invalid']) assert.throws(() => forkConversation(input), { status: 400 });
  for (const bad of [undefined, null, [], {}, { ...source(), id: '../other' }, { ...source(), projectId: '../project' }, { ...source(), messages: [] }]) {
    assert.throws(() => forkConversation({ source: bad }), { status: 400 });
  }
  assert.throws(() => forkConversation({ source: source(), messageId: 'missing' }), { status: 404 });
  for (const messageId of [null, '', '../file', 1]) assert.throws(() => forkConversation({ source: source(), messageId }), { status: 400 });
  for (const name of [null, '', ' ', 'x'.repeat(161), 'bad\nname']) assert.throws(() => forkConversation({ source: source(), name }), { status: 400 });
  const duplicate = source(); duplicate.messages[2].id = duplicate.messages[0].id;
  assert.throws(() => forkConversation({ source: duplicate }), { status: 400 });
});
