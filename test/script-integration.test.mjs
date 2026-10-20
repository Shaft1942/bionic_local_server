import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createCompanion } from '../server.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const workspace = os.tmpdir();

class Response extends EventEmitter {
  constructor() { super(); this.headers = {}; this.parts = []; this.statusCode = 200; this.destroyed = false; this.writableEnded = false; this.headersSent = false; }
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }
  write(value) { this.parts.push(String(value)); return true; }
  end(value) { if (value) this.parts.push(String(value)); this.writableEnded = true; this.emit('finish'); }
  text() { return this.parts.join(''); }
  records() { return this.text().trim().split('\n').filter(Boolean).map(JSON.parse); }
}

function req(route, { method = 'GET', body, headers = {} } = {}) {
  const request = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  request.method = method; request.url = route;
  request.headers = { host: '127.0.0.1:8769', ...headers };
  request.socket = { remoteAddress: '127.0.0.1' };
  return request;
}

async function until(read, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { const value = await read(); if (value) return value; await sleep(10); }
  throw new Error(message);
}

test('script approval routes integrate with persisted conversation jobs without opening an HTTP port', async t => {
  await fs.mkdir(workspace, { recursive: true });
  const root = await fs.realpath(await fs.mkdtemp(path.join(workspace, 'script-integration-')));
  const project = path.join(root, 'project'), secondProject = path.join(root, 'other-project');
  const trackedEnv = ['TEMP', 'TMP', 'BIONIC_MOBILE_PROJECT_REGISTRY', 'BIONIC_MOBILE_EXTRA_ROOTS', 'BIONIC_MOBILE_PORT', 'BIONIC_API_URL'];
  const previousEnv = Object.fromEntries(trackedEnv.map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch, modules = [], jobs = new Set(), upstream = [];
  const codeFor = name => `import fs from 'node:fs/promises'; await fs.appendFile(${JSON.stringify(name + '.txt')}, 'one execution\\n'); process.stdout.write(${JSON.stringify('stdout-' + name)});`;
  let cookie;

  try {
    await fs.mkdir(project); await fs.mkdir(secondProject);
    await fs.writeFile(path.join(root, 'registry.json'), JSON.stringify({ projects: [['p1', { projectWorkingDirectoryPath: project }], ['p2', { projectWorkingDirectoryPath: secondProject }]] }));
    process.env.TEMP = root; process.env.TMP = root;
    process.env.BIONIC_MOBILE_PROJECT_REGISTRY = path.join(root, 'registry.json');
    process.env.BIONIC_MOBILE_EXTRA_ROOTS = '[]'; process.env.BIONIC_MOBILE_PORT = '8769'; process.env.BIONIC_API_URL = 'http://127.0.0.1:1235';
    const nativeStore = { listProjects: async () => [{ id: 'p1', name: 'Synthetic project', sessionsCount: 0 }, { id: 'p2', name: 'Other synthetic project', sessionsCount: 0 }], listSessions: async () => [], getConversation: async () => { throw Object.assign(new Error('Missing synthetic conversation'), { status: 404 }); } };

    globalThis.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/api/v1/models')) return { ok: true, status: 200, json: async () => ({ models: [{ type: 'llm', key: 'synthetic', loaded_instances: [{ id: 'loaded-synthetic', config: { context_length: 16384 } }], capabilities: { trained_for_tool_use: true } }] }) };
      assert(String(url).endsWith('/v1/chat/completions'), 'No real network or unexpected endpoint is permitted.');
      if (options.signal?.aborted) throw Object.assign(new Error('Stopped synthetic stream'), { name: 'AbortError' });
      const body = JSON.parse(options.body); upstream.push(structuredClone(body));
      const name = body.messages.findLast(message => message.role === 'user')?.content;
      assert(['approved', 'denied', 'cancelled', 'restart', 'management-pending', 'before-move', 'after-move'].includes(name));
      const completed = body.messages.some(message => message.role === 'tool');
      const event = completed ? { choices: [{ delta: { content: 'Synthetic final answer.' }, finish_reason: 'stop' }] } : { choices: [{ delta: { tool_calls: [{ index: 0, id: 'synthetic-script-' + name, function: { name: 'run_project_script', arguments: JSON.stringify({ runtime: 'node', code: codeFor(name), timeoutSeconds: 5 }) } }] }, finish_reason: 'tool_calls' }] };
      return { ok: true, status: 200, body: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('data: ' + JSON.stringify(event) + '\n\ndata: [DONE]\n\n')); controller.close(); } }) };
    };

    const load = async () => {
      const module = await createCompanion({ root, nativeStore, fetchImpl: globalThis.fetch });
      modules.push(module); assert.equal(module.server.listening, false); return module;
    };
    const first = await load('first');
    const request = async (module, route, options) => { const response = new Response(); await module.handle(req(route, options), response); return response; };
    const access = await fs.readFile(path.join(root, 'ACCES-PRIVE.txt'), 'utf8');
    const code = /Code d’accès : (.+)/.exec(access)[1].trim();
    const login = async module => {
      const response = await request(module, '/api/login', { method: 'POST', body: { code } });
      assert.equal(response.statusCode, 200); return response.headers['set-cookie'].split(';')[0];
    };
    cookie = await login(first);
    const decide = (module, approval, decision, options = {}) => request(module, '/api/tool-approval', { method: 'POST', headers: { cookie, ...options.headers }, body: { id: approval.id, projectId: approval.projectId || 'p1', chatId: approval.chatId, decision, ...options.body } });
    const readStored = async id => JSON.parse(await fs.readFile(path.join(root, 'data', 'chats', id + '.json'), 'utf8'));
    const start = async (name, { projectId = 'p1', sessionId, fileAccess = false } = {}) => {
      const response = new Response();
      const job = first.handle(req('/api/chat', { method: 'POST', headers: { cookie }, body: { projectId, sessionId, model: 'synthetic', text: name, requestId: randomUUID(), fileAccess, scriptAccess: true } }), response);
      jobs.add(job); job.finally(() => jobs.delete(job)).catch(() => {});
      const event = await until(() => response.records().find(item => item.type === 'approval' && item.approval.status === 'pending'), 'A pending script approval was not emitted: ' + response.text());
      const begin = response.records().find(item => item.type === 'start');
      const expectedDirectory = projectId === 'p2' ? secondProject : project;
      assert(begin?.id); assert.equal(event.approval.code, codeFor(name)); assert.equal(event.approval.runtime, 'node'); assert.equal(event.approval.cwd, expectedDirectory);
      await assert.rejects(fs.stat(path.join(expectedDirectory, name + '.txt')), { code: 'ENOENT' });
      assert.equal((await readStored(begin.id)).generation.awaitingApproval, true);
      return { response, job, id: begin.id, approval: event.approval };
    };

    await t.test('login, origin and project checks reject approval without starting a script', async () => {
      const pending = await start('approved');
      const input = { id: pending.approval.id, projectId: 'p1', chatId: pending.id, decision: 'approve' };
      let response = await request(first, '/api/tool-approval', { method: 'POST', body: input });
      assert.equal(response.statusCode, 401);
      response = await decide(first, pending.approval, 'approve', { headers: { origin: 'https://untrusted.example' } });
      assert.equal(response.statusCode, 403);
      response = await decide(first, pending.approval, 'approve', { body: { projectId: 'p2' } });
      assert.equal(response.statusCode, 404);
      await assert.rejects(fs.stat(path.join(project, 'approved.txt')), { code: 'ENOENT' });
      assert.equal((await readStored(pending.id)).messages.at(-1).approvals[0].status, 'pending');

      const changedPayload = { body: { runtime: 'python', code: 'throw new Error("this unapproved replacement must not run")' } };
      const decisions = await Promise.all([decide(first, pending.approval, 'approve', changedPayload), decide(first, pending.approval, 'approve', changedPayload)]);
      assert.deepEqual(decisions.map(value => value.statusCode).sort(), [200, 404]);
      await pending.job;
      assert.equal(pending.response.records().at(-1).type, 'done');
      assert.equal(await fs.readFile(path.join(project, 'approved.txt'), 'utf8'), 'one execution\n');
      const stored = await readStored(pending.id), reply = stored.messages.at(-1);
      assert.equal(reply.approvals.length, 1); assert.equal(reply.approvals[0].code, codeFor('approved'));
      assert.equal(reply.approvals[0].status, 'approved'); assert.equal(reply.approvals[0].executionStatus, 'completed');
      assert.equal(reply.actions.length, 1); assert.equal(reply.actions[0].ok, true); assert.equal(reply.actions[0].stdout, 'stdout-approved');
      assert.equal(reply.actions[0].approvalId, pending.approval.id);
      const external = reply.contextReceipt.external.find(item => item.kind === 'script');
      assert(external); assert.equal(external.transmitted, true); assert.equal(JSON.parse(external.text).stdout, 'stdout-approved');
      const actionEvent = pending.response.records().find(item => item.type === 'action');
      assert.equal(actionEvent.contextReceipt.external.find(item => item.kind === 'script').transmitted, false);
      assert(pending.response.records().some(item => item.type === 'context' && item.contextReceipt.external.some(entry => entry.kind === 'script' && entry.transmitted)));
      assert.equal(reply.contextReceipt.permissions.scriptAccess, true);
      assert.equal(reply.text, 'Synthetic final answer.');
      const resultBody = upstream.find(body => body.messages.some(message => message.role === 'tool' && message.content.includes('stdout-approved')));
      assert(resultBody, 'The confirmed script result must be sent back to the model.');
      assert.deepEqual(await fs.readdir(path.join(root, 'data', 'tool-runs')), []);
    });

    await t.test('refusal persists without executing or writing the proposed file', async () => {
      const pending = await start('denied');
      const response = await decide(first, pending.approval, 'deny'); assert.equal(response.statusCode, 200);
      await pending.job;
      await assert.rejects(fs.stat(path.join(project, 'denied.txt')), { code: 'ENOENT' });
      const reply = (await readStored(pending.id)).messages.at(-1);
      assert.equal(reply.approvals[0].status, 'denied'); assert.equal(reply.actions[0].ok, false);
      const result = JSON.parse(reply.contextReceipt.external.find(item => item.kind === 'script').text);
      assert.equal(result.executed, false); assert.equal(result.status, 'denied');
      assert.equal(pending.response.records().at(-1).type, 'done');
    });

    await t.test('move, rename and deletion are blocked while the script is awaiting approval', async () => {
      const pending = await start('management-pending');
      const before = await readStored(pending.id);
      for (const action of ['move', 'rename', 'delete']) {
        const response = await request(first, '/api/conversation/' + action, { method: 'POST', headers: { cookie }, body: { projectId: 'p1', id: pending.id, targetProjectId: 'p2', name: 'Must not be applied' } });
        assert.equal(response.statusCode, 409, action + ' must wait until the pending script is decided');
        await assert.rejects(fs.stat(path.join(project, 'management-pending.txt')), { code: 'ENOENT' });
        await assert.rejects(fs.stat(path.join(secondProject, 'management-pending.txt')), { code: 'ENOENT' });
      }
      const unchanged = await readStored(pending.id);
      assert.equal(unchanged.projectId, 'p1'); assert.equal(unchanged.name, before.name);
      assert.equal(unchanged.messages.at(-1).approvals[0].status, 'pending');
      assert.equal((await decide(first, pending.approval, 'deny')).statusCode, 200);
      await pending.job;
      assert.equal(pending.response.records().at(-1).type, 'done');
      assert.equal((await readStored(pending.id)).messages.at(-1).approvals[0].status, 'denied');
      await assert.rejects(fs.stat(path.join(project, 'management-pending.txt')), { code: 'ENOENT' });
    });

    await t.test('moving a completed script conversation resets file and script permissions and later actions use the target project', async () => {
      const original = await start('before-move', { fileAccess: true });
      assert.equal((await decide(first, original.approval, 'approve')).statusCode, 200);
      await original.job;
      const before = await readStored(original.id);
      assert.equal(before.fileAccess, true); assert.equal(before.scriptAccess, true);
      assert.equal(await fs.readFile(path.join(project, 'before-move.txt'), 'utf8'), 'one execution\n');
      let response = await request(first, '/api/conversation/move', { method: 'POST', headers: { cookie }, body: { projectId: 'p1', id: original.id, targetProjectId: 'p2' } });
      assert.equal(response.statusCode, 200);
      const moved = JSON.parse(response.text()).conversation;
      assert.equal(moved.id, original.id); assert.equal(moved.projectId, 'p2');
      assert.equal(moved.fileAccess, false); assert.equal(moved.scriptAccess, false);
      assert.equal(moved.messages.at(-1).actions[0].projectId, 'p1');
      assert.equal(moved.messages.at(-1).approvals[0].projectId, 'p1');
      assert.equal(moved.messages.at(-1).approvals[0].cwd, project);
      assert.equal(moved.messages.at(-1).approvals[0].status, 'approved');
      const persisted = await readStored(original.id);
      assert.equal(persisted.fileAccess, false); assert.equal(persisted.scriptAccess, false);
      await assert.rejects(fs.stat(path.join(secondProject, 'before-move.txt')), { code: 'ENOENT' });
      response = await request(first, '/api/conversation?projectId=p1&id=' + original.id, { headers: { cookie } });
      assert.equal(response.statusCode, 404);

      // Re-enabling execution on the next message still requires a fresh approval.
      const followup = await start('after-move', { projectId: 'p2', sessionId: original.id, fileAccess: true });
      assert.equal(followup.approval.projectId, 'p2'); assert.equal(followup.approval.cwd, secondProject);
      assert.notEqual(followup.approval.id, original.approval.id);
      await assert.rejects(fs.stat(path.join(project, 'after-move.txt')), { code: 'ENOENT' });
      assert.equal((await decide(first, followup.approval, 'approve')).statusCode, 200);
      await followup.job;
      const completed = await readStored(original.id);
      assert.equal(completed.messages.at(-1).actions[0].projectId, 'p2');
      assert.equal(completed.messages.at(-1).actions[0].stdout, 'stdout-after-move');
      assert.equal(completed.messages.at(-1).approvals[0].projectId, 'p2');
      assert.equal(await fs.readFile(path.join(secondProject, 'after-move.txt'), 'utf8'), 'one execution\n');
      await assert.rejects(fs.stat(path.join(project, 'after-move.txt')), { code: 'ENOENT' });
      assert.equal(await fs.readFile(path.join(project, 'before-move.txt'), 'utf8'), 'one execution\n');
      assert.equal(followup.response.records().at(-1).type, 'done');
    });

    await t.test('cancelling a conversation while awaiting approval revokes it and completes the job', async () => {
      const pending = await start('cancelled');
      const response = await request(first, '/api/cancel', { method: 'POST', headers: { cookie }, body: { projectId: 'p1', id: pending.id } });
      assert.equal(response.statusCode, 200); await pending.job;
      const stored = await readStored(pending.id);
      assert.equal(stored.generation.status, 'stopped'); assert.equal(stored.messages.at(-1).approvals[0].status, 'cancelled');
      assert.equal(pending.response.records().at(-1).outcome, 'stopped');
      assert.equal((await decide(first, pending.approval, 'approve')).statusCode, 404);
      await assert.rejects(fs.stat(path.join(project, 'cancelled.txt')), { code: 'ENOENT' });
    });

    await t.test('restart recovery expires the persisted approval and cannot execute its old identifier', async () => {
      const pending = await start('restart');
      const beforeRestart = await readStored(pending.id);
      // Stop the first in-memory job, then restore its pending on-disk checkpoint.
      // A new module instance has fresh approval/session maps, as after a restart.
      await request(first, '/api/cancel', { method: 'POST', headers: { cookie }, body: { projectId: 'p1', id: pending.id } });
      await pending.job;
      await fs.writeFile(path.join(root, 'data', 'chats', pending.id + '.json'), JSON.stringify(beforeRestart));
      const restarted = await load('restart'); cookie = await login(restarted);
      let response = await request(restarted, '/api/conversation?projectId=p1&id=' + pending.id, { headers: { cookie } });
      assert.equal(response.statusCode, 200);
      const recovered = JSON.parse(response.text());
      assert.equal(recovered.generation.status, 'interrupted'); assert.equal(recovered.messages.at(-1).approvals[0].status, 'expired');
      response = await decide(restarted, pending.approval, 'approve'); assert.equal(response.statusCode, 404);
      assert.equal((await readStored(pending.id)).messages.at(-1).approvals[0].status, 'expired');
      await assert.rejects(fs.stat(path.join(project, 'restart.txt')), { code: 'ENOENT' });
    });
  } finally {
    for (const module of modules) await module.close();
    await Promise.allSettled([...jobs]);
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    const resolved = await fs.realpath(root);
    assert.equal(path.dirname(resolved), await fs.realpath(workspace)); assert(path.basename(resolved).startsWith('script-integration-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
