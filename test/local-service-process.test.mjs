import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createLocalServiceProcess } from '../lib/local-service-process.mjs';

let python;
if (process.env.BIONIC_LIFECYCLE_REAL_PYTHON === '1') {
  try { python = execFileSync('python', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim(); } catch { /* Optional local runtime. */ }
}
const pythonSkip = python ? false : 'Set BIONIC_LIFECYCLE_REAL_PYTHON=1 with Python and unrestricted fixture loopback';

async function fixture(t, source) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-process-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }));
  const entryPath = path.join(root, 'main.py');
  await fs.writeFile(entryPath, source ?? 'import time\nwhile True: time.sleep(0.05)\n');
  return { root, profile: { id: 'comfyui', type: 'comfyui-python', exclusiveControl: true, pythonPath: python, entryPath, workingDirectory: root, port: 29876, fingerprint: 'synthetic-fixture', startTimeoutMs: 5000 } };
}

test('invalid receipts never make network calls or signal a PID', async () => {
  const backend = createLocalServiceProcess({ root: os.tmpdir(), fetchImpl() { throw new Error('unexpected transport'); } });
  assert.equal((await backend.requestStop({ pid: process.pid })).reasonCode, 'INVALID_PROCESS_RECEIPT');
  await assert.rejects(backend.launch({ id: 'bionic' }), { message: 'UNSUPPORTED_PROCESS_PROFILE', effectAttempted: false });
});

test('Comfy validation failures certify no spawn, while a spawn boundary failure stays uncertain', async t => {
  const f = await fixture(t); let spawned = 0;
  f.profile.pythonPath = process.execPath;
  const backend = createLocalServiceProcess({ root: f.root, spawnImpl() { spawned++; throw new Error('synthetic spawn failure'); } });
  await assert.rejects(backend.launch({ ...f.profile, entryPath: path.join(f.root, 'missing.py') }), { code: 'ENOENT', effectAttempted: false });
  await assert.rejects(backend.launch({ ...f.profile, fileIdentity: { replaced: true } }), { message: 'PROCESS_PROFILE_CHANGED', effectAttempted: false });
  assert.equal(spawned, 0);
  await assert.rejects(backend.launch(f.profile), { message: 'synthetic spawn failure', effectAttempted: true }); assert.equal(spawned, 1);
  backend.close(); await assert.rejects(backend.launch(f.profile), { message: 'PROCESS_BACKEND_CLOSED', effectAttempted: false });
});

test('authenticated control never accepts a different operation or PID and reports lost scope', async () => {
  const receipt = { version: 1, id: 'comfyui', operationId: '12345678-1234-1234-1234-123456789abc', token: 'f'.repeat(64), controlPort: 12123, pid: 34567, parentPid: 12345, profileFingerprint: 'fixture' };
  let record = { ...receipt, state: 'running', scope: 'same-process' };
  let calls = 0;
  const backend = createLocalServiceProcess({ root: os.tmpdir(), fetchImpl: async (url, options) => {
    calls++; assert.match(url, /^http:\/\/127\.0\.0\.1:12123\/(inspect|stop)$/);
    assert.equal(options.headers.Authorization, `Bearer ${receipt.token}`);
    return { ok: true, json: async () => record };
  } });
  assert.equal((await backend.inspect(receipt)).state, 'running');
  record = { ...record, pid: 1 };
  assert.equal((await backend.requestStop(receipt)).reasonCode, 'PROCESS_IDENTITY_MISMATCH');
  record = { ...record, pid: receipt.pid, scope: 'unknown-descendants' };
  assert.equal((await backend.inspect(receipt)).reasonCode, 'PROCESS_SCOPE_UNKNOWN');
  assert.equal(calls, 3);
  backend.close();
});

test('a lost or rejected control channel remains unknown, including after restart', async () => {
  const receipt = { version: 1, id: 'comfyui', operationId: '12345678-1234-1234-1234-123456789abc', token: 'f'.repeat(64), controlPort: 12123, pid: 34567, parentPid: 12345, profileFingerprint: 'fixture' };
  const rejected = createLocalServiceProcess({ root: os.tmpdir(), fetchImpl: async () => ({ ok: false }) });
  assert.equal((await rejected.inspect(receipt)).reasonCode, 'PROCESS_CONTROL_REFUSED');
  const unavailable = createLocalServiceProcess({ root: os.tmpdir(), fetchImpl: async () => { throw new Error('fixture closed'); } });
  assert.equal((await unavailable.requestStop(receipt)).reasonCode, 'PROCESS_CONTROL_UNAVAILABLE');
  assert.equal((await unavailable.waitForExit(receipt, { timeoutMs: 0 })).reasonCode, 'PROCESS_EXIT_UNCONFIRMED');
});

async function redirectorFixture(t, { parentPid = 7788 } = {}) {
  const f = await fixture(t);
  f.profile.pythonPath = process.execPath;
  f.profile.startTimeoutMs = 500;
  let published;
  let response;
  const requests = [];
  const child = Object.assign(new EventEmitter(), { pid: 7788, unref() {} });
  child.stdin = new EventEmitter();
  child.stdin.end = text => {
    const initial = JSON.parse(text);
    published = { version: 1, id: 'comfyui', operationId: initial.operationId, token: initial.token, controlPort: 12123, pid: 9001, parentPid, profileFingerprint: initial.profileFingerprint, state: 'running', scope: 'same-process', receiptPath: initial.receiptPath };
    response = { ...published };
    fs.writeFile(initial.receiptPath, JSON.stringify(published), { mode: 0o600 }).catch(error => child.emit('error', error));
  };
  const backend = createLocalServiceProcess({ root: f.root, pollMs: 5, spawnImpl(executable, args, options) {
    assert.equal(options.shell, false);
    assert.deepEqual(options.stdio, ['pipe', 'ignore', 'ignore']);
    assert.ok(!args.some(arg => /^[a-f0-9]{64}$/.test(arg)), 'token never appears in argv');
    return child;
  }, fetchImpl: async (url, options) => {
    requests.push(url);
    assert.equal(options.headers.Authorization, `Bearer ${published.token}`);
    return { ok: true, json: async () => response };
  } });
  return { ...f, backend, child, requests, published: () => published, response: value => { response = value; } };
}

test('a Windows Python redirector anchors a distinct interpreter PID through its direct parent', async t => {
  const f = await redirectorFixture(t);
  const receipt = await f.backend.launch(f.profile);
  assert.equal(receipt.pid, 9001);
  assert.equal(receipt.parentPid, f.child.pid);
  assert.equal((await f.backend.inspect(receipt)).state, 'running');
  assert.equal((await f.backend.requestStop({ ...receipt, parentPid: 7 })).reasonCode, 'PROCESS_IDENTITY_MISMATCH');
  assert.ok(!f.requests.some(url => url.endsWith('/stop')));
  f.response({ ...receipt, parentPid: 7 });
  assert.equal((await f.backend.requestStop(receipt)).reasonCode, 'PROCESS_IDENTITY_MISMATCH');
  assert.ok(!f.requests.some(url => url.endsWith('/stop')), 'inconsistent authenticated parent never receives stop');
  f.response({ ...receipt });
  await fs.writeFile(receipt.receiptPath, JSON.stringify({ ...receipt, state: 'main-exited' }));
  f.child.emit('exit', 0);
  assert.equal((await f.backend.waitForExit(receipt, { timeoutMs: 1000 })).state, 'stopped');
  f.backend.close();
});

test('a receipt with neither direct PID nor matching redirector parent is never adopted', async t => {
  const f = await redirectorFixture(t, { parentPid: 7 });
  await assert.rejects(f.backend.launch(f.profile), /PROCESS_START_UNCONFIRMED/);
  assert.deepEqual(f.requests, []);
  f.backend.close();
});

test('Python fixed host survives EOF and backend close, rejects forged token, stops through KeyboardInterrupt', { skip: pythonSkip }, async t => {
  const f = await fixture(t);
  const backend = createLocalServiceProcess({ root: f.root });
  const receipt = await backend.launch(f.profile);
  t.after(async () => { await backend.requestStop(receipt); await backend.waitForExit(receipt, { timeoutMs: 3000 }); backend.close(); });
  assert.equal((await backend.inspect(receipt)).state, 'running');
  assert.equal((await backend.requestStop({ ...receipt, token: 'a'.repeat(64) })).reasonCode, 'PROCESS_IDENTITY_MISMATCH');
  backend.close();
  const resumed = createLocalServiceProcess({ root: f.root });
  assert.equal((await resumed.inspect(receipt)).state, 'running');
  assert.equal((await resumed.requestStop({ ...receipt, token: 'a'.repeat(64) })).reasonCode, 'PROCESS_CONTROL_REFUSED');
  assert.equal((await resumed.requestStop(receipt)).state, 'stopping');
  assert.equal((await backend.waitForExit(receipt, { timeoutMs: 5000 })).state, 'stopped');
  assert.equal((await resumed.inspect(receipt)).state, 'unknown');
  assert.equal((await resumed.inspect(receipt)).reasonCode, 'PROCESS_CONTROL_UNAVAILABLE');
  resumed.close();
});

test('timeout does not force an uncooperative Python main', { skip: pythonSkip }, async t => {
  const f = await fixture(t, 'import time\ntry:\n while True: time.sleep(0.05)\nexcept KeyboardInterrupt:\n time.sleep(0.5)\n');
  const backend = createLocalServiceProcess({ root: f.root });
  const receipt = await backend.launch(f.profile);
  await backend.requestStop(receipt);
  assert.equal((await backend.waitForExit(receipt, { timeoutMs: 20 })).reasonCode, 'PROCESS_EXIT_UNCONFIRMED');
  assert.equal((await backend.waitForExit(receipt, { timeoutMs: 5000 })).state, 'stopped');
  backend.close();
});

test('a Python descendant makes scope unknown and stop is refused without interrupt', { skip: pythonSkip }, async t => {
  const f = await fixture(t, 'import subprocess,sys,time\np=subprocess.Popen([sys.executable,"-c","import time; time.sleep(0.3)"])\ntry:\n p.wait()\n time.sleep(0.4)\nexcept KeyboardInterrupt:\n open("unexpected-stop","w").write("interrupted")\n');
  const backend = createLocalServiceProcess({ root: f.root });
  const receipt = await backend.launch(f.profile);
  let result;
  for (let n = 0; n < 30; n++) {
    result = await backend.inspect(receipt);
    if (result.reasonCode === 'PROCESS_SCOPE_UNKNOWN') break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(result.reasonCode, 'PROCESS_SCOPE_UNKNOWN');
  assert.equal((await backend.requestStop(receipt)).reasonCode, 'PROCESS_SCOPE_UNKNOWN');
  const terminal = await backend.waitForExit(receipt, { timeoutMs: 2000 });
  assert.equal(terminal.state, process.platform === 'win32' ? 'stopped' : 'unknown');
  await assert.rejects(fs.stat(path.join(f.root, 'unexpected-stop')), { code: 'ENOENT' });
  backend.close();
});

test('a thread spawning after main finalization permanently revokes terminal scope', { skip: pythonSkip }, async t => {
  const f = await fixture(t, 'import threading,time,subprocess,sys\ndef late():\n time.sleep(0.9)\n subprocess.Popen([sys.executable,"-c","import time,pathlib;time.sleep(0.8);pathlib.Path(\'late-child-finished\').write_text(\'ok\')"])\nthreading.Thread(target=late,daemon=False).start()\ntime.sleep(0.2)\n');
  const backend = createLocalServiceProcess({ root: f.root });
  const receipt = await backend.launch(f.profile);
  assert.equal((await backend.waitForExit(receipt, { timeoutMs: 2200 })).state, 'unknown');
  const terminal = JSON.parse(await fs.readFile(receipt.receiptPath, 'utf8'));
  assert.equal(terminal.state, 'main-exited');
  assert.equal(terminal.scope, 'unknown-descendants');
  assert.equal(await fs.readFile(path.join(f.root, 'late-child-finished'), 'utf8'), 'ok');
  backend.close();
});

test('a real isolated Windows venv redirector preserves the authenticated parent anchor', { skip: process.platform !== 'win32' ? 'Windows redirector only' : pythonSkip }, async t => {
  const f = await fixture(t);
  const venv = path.join(f.root, 'venv');
  execFileSync(python, ['-m', 'venv', '--without-pip', venv], { windowsHide: true, stdio: 'ignore', timeout: 20000 });
  f.profile.pythonPath = path.join(venv, 'Scripts', 'python.exe');
  let launchedPid;
  const backend = createLocalServiceProcess({ root: f.root, spawnImpl(executable, args, options) {
    const child = spawn(executable, args, options);
    launchedPid = child.pid;
    return child;
  } });
  const receipt = await backend.launch(f.profile);
  t.after(async () => { await backend.requestStop(receipt); await backend.waitForExit(receipt, { timeoutMs: 5000 }); backend.close(); });
  assert.notEqual(receipt.pid, launchedPid, 'venv redirector starts the interpreter as a direct child');
  assert.equal(receipt.parentPid, launchedPid);
  assert.equal(receipt.profileFingerprint, f.profile.fingerprint);
  assert.equal((await backend.inspect(receipt)).state, 'running');
  assert.equal((await backend.requestStop(receipt)).state, 'stopping');
  assert.equal((await backend.waitForExit(receipt, { timeoutMs: 5000 })).state, 'stopped');
});
