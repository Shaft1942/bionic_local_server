import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launcherPath, launcherFileIdentity } from './local-service-config.mjs';

const hostScript = fileURLToPath(new URL('../scripts/local-service-host.py', import.meta.url));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const unknown = reasonCode => ({ state: 'unknown', reasonCode });
async function readRecord(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'));
}

export function createLocalServiceProcess({ root, spawnImpl = spawn, fetchImpl = fetch, pollMs = 50 } = {}) {
  const owned = new Map();
  let closed = false;
  const validReceipt = receipt => receipt?.version === 1 && receipt.id === 'comfyui' && /^[0-9a-f-]{36}$/.test(receipt.operationId) && /^[0-9a-f]{64}$/.test(receipt.token) && Number.isInteger(receipt.controlPort) && receipt.controlPort > 0 && receipt.controlPort <= 65535 && Number.isInteger(receipt.pid) && receipt.pid > 0 && Number.isInteger(receipt.parentPid) && receipt.parentPid > 0 && typeof receipt.profileFingerprint === 'string' && receipt.profileFingerprint.length > 0;
  const sameIdentity = (left, right) => ['pid', 'parentPid', 'operationId', 'profileFingerprint', 'controlPort'].every(key => left[key] === right[key]);
  const anchored = (receipt, child) => receipt.pid === child.pid || receipt.parentPid === child.pid;
  async function control(receipt, action) {
    if (!validReceipt(receipt)) return unknown('INVALID_PROCESS_RECEIPT');
    const tracked = owned.get(receipt.operationId);
    if (tracked && tracked.token !== receipt.token) return unknown('PROCESS_IDENTITY_MISMATCH');
    if (tracked?.receipt && !sameIdentity(tracked.receipt, receipt)) return unknown('PROCESS_IDENTITY_MISMATCH');
    if (tracked?.exited) return tracked.scope === 'same-process' && !tracked.error ? { state: 'stopped', exitCode: tracked.exitCode } : unknown('PROCESS_SCOPE_UNKNOWN');
    if (action === 'stop') {
      const before = await control(receipt, 'inspect');
      if (!['running', 'stopping'].includes(before.state)) return before;
    }
    try {
      const response = await fetchImpl(`http://127.0.0.1:${receipt.controlPort}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${receipt.token}` }, redirect: 'error', signal: AbortSignal.timeout(2000) });
      if (!response.ok) return unknown('PROCESS_CONTROL_REFUSED');
      const record = await response.json();
      if (record.operationId !== receipt.operationId || record.pid !== receipt.pid || record.parentPid !== receipt.parentPid || record.profileFingerprint !== receipt.profileFingerprint) return unknown('PROCESS_IDENTITY_MISMATCH');
      if (tracked) tracked.scope = record.scope;
      if (record.scope !== 'same-process') return unknown('PROCESS_SCOPE_UNKNOWN');
      if (!['running', 'stopping'].includes(record.state)) return unknown('PROCESS_EXIT_UNCONFIRMED');
      return { state: record.state, pid: record.pid };
    } catch { return unknown('PROCESS_CONTROL_UNAVAILABLE'); }
  }
  async function launch(profile) {
    let effectAttempted = false;
    try {
    if (closed) throw new Error('PROCESS_BACKEND_CLOSED');
    if (profile?.id !== 'comfyui' || profile.type !== 'comfyui-python' || profile.exclusiveControl !== true || !Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) throw new Error('UNSUPPORTED_PROCESS_PROFILE');
    // Recheck local paths at launch, not just during configuration loading.
    const [pythonPath, entryPath, workingDirectory] = await Promise.all([launcherPath(profile.pythonPath), launcherPath(profile.entryPath), launcherPath(profile.workingDirectory, { directory: true })]);
    if (path.basename(entryPath).toLowerCase() !== 'main.py' || path.dirname(entryPath) !== workingDirectory) throw new Error('INVALID_COMFY_ENTRY');
    if (profile.fileIdentity) {
      const identity = { pythonPath: await launcherFileIdentity(pythonPath), entryPath: await launcherFileIdentity(entryPath) };
      if (JSON.stringify(identity) !== JSON.stringify(profile.fileIdentity)) throw new Error('PROCESS_PROFILE_CHANGED');
    }
    const runtime = path.join(root, 'runtime');
    await fs.mkdir(runtime, { recursive: true });
    await launcherPath(runtime, { directory: true });
    const directory = path.join(runtime, 'local-service-hosts');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await launcherPath(directory, { directory: true });
    const operationId = randomUUID();
    const token = randomBytes(32).toString('hex');
    const receiptPath = path.join(directory, `${operationId}.json`);
    const env = {};
    for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'CUDA_PATH']) if (process.env[key] !== undefined) env[key] = process.env[key];
    env.PYTHONUNBUFFERED = '1';
    effectAttempted = true;
    const child = spawnImpl(pythonPath, ['-u', hostScript], { cwd: workingDirectory, windowsHide: true, detached: true, shell: false, env, stdio: ['pipe', 'ignore', 'ignore'] });
    const tracked = { child, token, exited: false, scope: 'unknown' };
    owned.set(operationId, tracked);
    child.once('exit', async code => {
      tracked.scope = 'unknown';
      try {
        const final = await readRecord(receiptPath);
        if (validReceipt(final) && final.token === token && final.operationId === operationId && final.profileFingerprint === profile.fingerprint && anchored(final, child) && (!tracked.receipt || sameIdentity(tracked.receipt, final)) && final.state === 'main-exited') tracked.scope = final.scope;
      } catch { /* Missing terminal record never establishes whole-scope exit. */ }
      tracked.exitCode = code; tracked.exited = true;
    });
    child.once('error', () => { tracked.exited = true; tracked.error = true; });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ operationId, token, entryPath, workingDirectory, port: profile.port, profileFingerprint: profile.fingerprint, receiptPath }) + '\n');
    child.unref();
    const deadline = Date.now() + Math.min(30000, Math.max(500, profile.startTimeoutMs ?? 15000));
    while (Date.now() < deadline) {
      if (tracked.exited) throw new Error('PROCESS_START_FAILED');
      try {
        const receipt = await readRecord(receiptPath);
        if (validReceipt(receipt) && receipt.operationId === operationId && receipt.token === token && anchored(receipt, child) && receipt.profileFingerprint === profile.fingerprint) {
          tracked.receipt = receipt;
          const status = await control(receipt, 'inspect');
          if (status.state === 'running') return Object.freeze(receipt);
          if (status.reasonCode === 'PROCESS_SCOPE_UNKNOWN') return Object.freeze(receipt);
        }
      } catch { /* Atomic receipt may still be pending. */ }
      await pause(pollMs);
    }
    // Never kill a possibly live engine just because receipt/readiness timed out.
    throw Object.assign(new Error('PROCESS_START_UNCONFIRMED'), { operationId });
    } catch (error) { error.effectAttempted = effectAttempted; throw error; }
  }
  async function waitForExit(receipt, { timeoutMs = 15000 } = {}) {
    const deadline = Date.now() + Math.min(120000, Math.max(0, timeoutMs));
    let result;
    do { result = await control(receipt, 'inspect'); if (result.state === 'stopped') return result; await pause(pollMs); } while (Date.now() < deadline);
    return unknown('PROCESS_EXIT_UNCONFIRMED');
  }
  return {
    launch,
    inspect: receipt => control(receipt, 'inspect'),
    requestStop: receipt => control(receipt, 'stop'),
    waitForExit,
    // Detaching the companion releases no ownership by PID and emits no stop.
    close() { closed = true; for (const { child } of owned.values()) child.unref(); },
  };
}
