import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { createScriptTools } from '../lib/script-tools.mjs';
import { createToolApprovals } from '../lib/tool-approvals.mjs';

const workspace = os.tmpdir();
await fs.mkdir(workspace, { recursive: true });
const base = await fs.mkdtemp(path.join(workspace, 'script-tools-test-'));
let sequence = 0;
async function fixture(extra = {}) {
  const directory = path.join(base, String(++sequence)), project = path.join(directory, 'project'), privateDirectory = path.join(directory, 'private');
  await fs.mkdir(project, { recursive: true });
  const calls = [];
  const files = { executionDirectory: async (id, relative) => { assert.equal(id, 'p1'); assert.equal(relative, ''); return project; } };
  const options = { files, projectId: 'p1', privateDirectory, requestApproval: async proposal => ({ approved: true, approval: { ...proposal, id: 'synthetic-approval', status: 'approved' } }), spawnImpl: (command, args, options) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => { queueMicrotask(() => child.emit('close', null)); return true; };
    calls.push({ command, args, options, child });
    queueMicrotask(() => child.emit('close', 0)); return child;
  }, ...extra };
  return { project, privateDirectory, calls, options, tools: createScriptTools(options) };
}
function heldApproval(approvals, signal) {
  let observed;
  const ready = new Promise(resolve => { observed = resolve; });
  return { ready, requestApproval: proposal => approvals.request({ projectId: 'p1', chatId: 'c1', proposal, signal, onChange: value => { if (value.status === 'pending') observed(value); } }) };
}
const input = { runtime: 'node', code: 'console.log("synthetic")' };

test('no process is started or script written while approval is pending, denied, expired or cancelled', async () => {
  for (const kind of ['deny', 'expire', 'abort']) {
    const controller = new AbortController(), approvals = createToolApprovals({ ttl: kind === 'expire' ? 20 : 1000 }), held = heldApproval(approvals, controller.signal);
    const f = await fixture({ requestApproval: held.requestApproval, signal: controller.signal });
    const result = f.tools.run(input), proposal = await held.ready;
    assert.equal(f.calls.length, 0);
    await assert.rejects(fs.stat(f.privateDirectory), { code: 'ENOENT' });
    if (kind === 'abort') controller.abort();
    else if (kind === 'expire') await delay(40);
    else await approvals.decide({ id: proposal.id, projectId: 'p1', chatId: 'c1', decision: 'deny' });
    assert.equal((await result).executed, false);
    assert.equal(f.calls.length, 0);
  }
});

test('four rejected proposals exhaust the per-turn limit, including concurrent requests', async () => {
  let requested = 0;
  const f = await fixture({ requestApproval: async () => { requested++; return { approved: false, approval: { status: 'denied' } }; } });
  const results = await Promise.allSettled(Array.from({ length: 7 }, () => f.tools.run(input)));
  assert.equal(requested, 4); assert.equal(results.filter(item => item.status === 'fulfilled').length, 4);
  assert.equal(results.filter(item => item.status === 'rejected' && item.reason.status === 409).length, 3);
  assert.equal(f.calls.length, 0);
});

test('exact reviewed code, cwd and runtime survive caller and observer mutations', async () => {
  const approvals = createToolApprovals(), held = heldApproval(approvals), f = await fixture({ requestApproval: held.requestApproval });
  const mutable = { ...input }, result = f.tools.run(mutable), proposal = await held.ready;
  mutable.code = 'changed after request'; proposal.code = 'changed observer object'; proposal.runtime = 'python';
  await assert.rejects(approvals.decide({ id: proposal.id, projectId: 'p2', chatId: 'c1', decision: 'approve' }), { status: 404 });
  assert.equal(f.calls.length, 0);
  await approvals.decide({ id: proposal.id, projectId: 'p1', chatId: 'c1', decision: 'approve' });
  assert.equal((await result).executed, true);
  assert.equal(f.calls[0].command, process.execPath);
  assert.equal(f.calls[0].options.cwd, f.project);
  assert.equal(f.calls[0].options.windowsHide, true);
  assert.equal(f.calls[0].options.shell, false);
  assert.equal(await fs.readdir(f.privateDirectory).then(list => list.length), 0);
});

test('spawn receives exact approved bytes and a minimal environment without credentials or runtime injection', async () => {
  const values = { TEST_CREDENTIAL: 'synthetic', AWS_ACCESS_KEY_ID: 'synthetic', ARBITRARY_KEY: 'synthetic', HTTP_PROXY: 'synthetic', NODE_OPTIONS: '--eval=bad', PYTHONPATH: 'synthetic', OPENAI_API_KEY: 'synthetic', AUTH: 'synthetic' };
  const prior = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  let reviewed, bytes, environment;
  const f = await fixture({ requestApproval: async proposal => { reviewed = proposal.code; return { approved: true, approval: { id: 'exact', status: 'approved' } }; }, spawnImpl: (command, args, options) => {
    environment = options.env;
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    fs.readFile(args[0], 'utf8').then(value => { bytes = value; child.emit('close', 0); }, error => child.emit('error', error)); return child;
  } });
  try {
    const code = '/* accentué, exact \r\n */\nconsole.log("test")';
    assert.equal((await f.tools.run({ runtime: 'node', code })).exitCode, 0);
    assert.equal(bytes, code); assert.equal(bytes, reviewed);
    for (const key of Object.keys(values)) assert.equal(environment[key], undefined, key);
    assert.equal(environment.PYTHONIOENCODING, 'utf-8'); assert(environment.TEMP.startsWith(f.privateDirectory));
  } finally { for (const [key, value] of Object.entries(prior)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('a real synthetic Node script runs only after approval in the temporary project', async () => {
  const approvals = createToolApprovals(), held = heldApproval(approvals);
  const f = await fixture({ requestApproval: held.requestApproval, spawnImpl: undefined });
  const code = 'import fs from "node:fs/promises"; await fs.writeFile("approved.txt", "approved synthetic output", {flag:"wx"}); process.stdout.write("synthetic-ok");';
  const result = f.tools.run({ runtime: 'node', code }), proposal = await held.ready;
  await assert.rejects(fs.stat(path.join(f.project, 'approved.txt')), { code: 'ENOENT' });
  await approvals.decide({ id: proposal.id, projectId: 'p1', chatId: 'c1', decision: 'approve' });
  const completed = await result;
  assert.equal(completed.exitCode, 0); assert.equal(completed.stdout, 'synthetic-ok');
  assert.equal(await fs.readFile(path.join(f.project, 'approved.txt'), 'utf8'), 'approved synthetic output');
  assert.deepEqual(await fs.readdir(f.privateDirectory), []);
});

test('timeout, running cancellation and combined output are bounded', async () => {
  for (const kind of ['timeout', 'cancelled', 'output-limit']) {
    const controller = new AbortController(); let killed = 0;
    const f = await fixture({ signal: controller.signal, spawnImpl: () => {
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.kill = () => { killed++; queueMicrotask(() => child.emit('close', null)); return true; };
      if (kind === 'cancelled') setImmediate(() => controller.abort());
      if (kind === 'output-limit') setImmediate(() => { child.stdout.write('a'.repeat(15000)); child.stderr.write('b'.repeat(15000)); });
      return child;
    } });
    const result = await f.tools.run({ ...input, timeoutSeconds: 1 });
    assert.equal(result.reason, kind); assert.equal(killed, 1);
    assert(result.stdout.length + result.stderr.length <= 24000);
    assert.equal(result.outputTruncated, kind === 'output-limit');
  }
});

test('unavailable runtimes fail without exposing process environment or command details', async () => {
  const f = await fixture({ spawnImpl: () => { throw new Error('sensitive command internals'); } });
  const result = await f.tools.run(input);
  assert.equal(result.executed, false); assert.equal(result.reason, 'unavailable');
  assert.equal(result.stdout + result.stderr, '');
});

test('missing interpreter lookup or asynchronous spawn failure never claims execution', async () => {
  const prior = process.env.PATH;
  process.env.PATH = '';
  try {
    const missing = await fixture();
    const result = await missing.tools.run({ runtime: 'python', code: '# never executed' });
    assert.equal(result.executed, false); assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'unavailable');
    assert.equal(missing.calls.length, 0); assert.deepEqual(await fs.readdir(missing.privateDirectory), []);
  } finally { if (prior === undefined) delete process.env.PATH; else process.env.PATH = prior; }
  const failed = await fixture({ spawnImpl: () => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    queueMicrotask(() => child.emit('error', Object.assign(new Error('missing synthetic interpreter'), { code: 'ENOENT' })));
    return child;
  } });
  const result = await failed.tools.run(input);
  assert.equal(result.executed, false); assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'unavailable');
});

test('Python and PowerShell use separate arguments and never an interpolated command shell', async () => {
  for (const runtime of ['python', 'powershell']) {
    let call, reviewedCode;
    const code = '# script synthétique : été';
    const f = await fixture({ python: 'C:/synthetic folder/python.exe', onState: approval => { if (approval.executionStatus === 'running') reviewedCode = approval.code; }, spawnImpl: (command, args, options) => {
      call = { command, args, options };
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      fs.readFile(args.at(-1)).then(bytes => { call.bytes = bytes; child.emit('close', 0); }, error => child.emit('error', error));
      return child;
    } });
    const result = await f.tools.run({ runtime, code });
    assert.equal(reviewedCode, code);
    const bom = runtime === 'powershell' && process.platform === 'win32';
    if (bom) assert.deepEqual(call.bytes.subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]));
    assert.equal(call.bytes.subarray(bom ? 3 : 0).toString('utf8'), code);
    assert.equal(result.exitCode, 0); assert.equal(call.options.shell, false); assert.equal(call.options.windowsHide, true);
    if (runtime === 'python') {
      assert.equal(call.command, 'C:/synthetic folder/python.exe');
      assert.equal(call.args[0], '-u'); assert(call.args[1].endsWith('script.py'));
    } else {
      assert(path.isAbsolute(call.command)); assert(call.command.endsWith(process.platform === 'win32' ? 'powershell.exe' : 'pwsh'));
      assert.deepEqual(call.args.slice(0, 6), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', call.args[5]]);
      assert(call.args[5].endsWith('script.ps1'));
    }
  }
});

test('Python lookup uses an absolute PATH interpreter and excludes the project current directory', async () => {
  const f = await fixture(), trusted = path.join(base, 'trusted-runtime');
  await fs.mkdir(trusted);
  const filename = process.platform === 'win32' ? 'python.exe' : 'python';
  await fs.writeFile(path.join(f.project, filename), 'project executable must never be selected');
  await fs.writeFile(path.join(trusted, filename), 'synthetic, never executed');
  const prior = process.env.PATH;
  process.env.PATH = [f.project, '', '.', trusted].join(path.delimiter);
  try {
    await f.tools.run({ runtime: 'python', code: '# synthetic' });
    assert.equal(f.calls[0].command, await fs.realpath(path.join(trusted, filename)));
  } finally { if (prior === undefined) delete process.env.PATH; else process.env.PATH = prior; }
});

test('abort after approval while the checkpoint saves cannot race into spawn', async () => {
  const controller = new AbortController();
  const f = await fixture({ signal: controller.signal, onState: value => { if (value.executionStatus === 'running') controller.abort(); } });
  await assert.rejects(f.tools.run(input), { status: 409 }); assert.equal(f.calls.length, 0);
});

test('changed project directory after approval is rejected without spawn', async () => {
  const f = await fixture(); let reads = 0;
  f.options.files.executionDirectory = async () => ++reads === 1 ? f.project : path.dirname(f.project);
  await assert.rejects(f.tools.run(input), { status: 409 }); assert.equal(f.calls.length, 0);
});

test('cleanup accepts an already-removed private run folder', async () => {
  const f = await fixture({ spawnImpl: (command, args) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const target = path.dirname(args[0]);
    assert.equal(path.dirname(target), path.join(base, String(sequence), 'private'));
    fs.rm(target, { recursive: true }).then(() => child.emit('close', 0), error => child.emit('error', error)); return child;
  } });
  assert.equal((await f.tools.run(input)).exitCode, 0);
});

test('replaced cleanup parent cannot redirect recursive deletion into another tree', async t => {
  const f = await fixture(), moved = f.privateDirectory + '-moved', outside = path.join(path.dirname(f.privateDirectory), 'outside');
  await fs.mkdir(outside);
  const probe = path.join(path.dirname(f.privateDirectory), 'junction-probe');
  try { await fs.symlink(outside, probe, process.platform === 'win32' ? 'junction' : 'dir'); await fs.unlink(probe); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('Directory links are unavailable in this Windows environment.'); throw error; }
  f.options.spawnImpl = undefined;
  const tools = createScriptTools({ ...f.options, spawnImpl: (command, args) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const runName = path.basename(path.dirname(args[0]));
    (async () => {
      await fs.mkdir(path.join(outside, runName)); await fs.writeFile(path.join(outside, runName, 'keep.txt'), 'must survive');
      await fs.rename(f.privateDirectory, moved);
      await fs.symlink(outside, f.privateDirectory, process.platform === 'win32' ? 'junction' : 'dir');
      child.emit('close', 0);
    })().catch(error => child.emit('error', error));
    return child;
  } });
  await assert.rejects(tools.run(input), { status: 500 });
  const names = await fs.readdir(outside);
  assert.equal(await fs.readFile(path.join(outside, names[0], 'keep.txt'), 'utf8'), 'must survive');
  await fs.unlink(f.privateDirectory);
});

test('invalid runtimes, excessive code and timeouts are rejected before proposing execution', async () => {
  let requested = 0;
  const f = await fixture({ requestApproval: () => { requested++; } });
  for (const value of [{ ...input, runtime: 'shell' }, { ...input, code: ' ' }, { ...input, code: 'x'.repeat(20001) }, { ...input, timeoutSeconds: 121 }, { ...input, timeoutSeconds: 0 }, { ...input, timeoutSeconds: 1.5 }]) await assert.rejects(f.tools.run(value), { status: 400 });
  assert.equal(requested, 0); assert.equal(f.calls.length, 0);
});

test.after(async () => {
  const resolved = await fs.realpath(base);
  assert.equal(path.dirname(resolved), await fs.realpath(workspace));
  assert(path.basename(resolved).startsWith('script-tools-test-'));
  await fs.rm(resolved, { recursive: true, force: true });
});
