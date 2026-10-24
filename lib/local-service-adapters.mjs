import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { launcherCLIIdentity } from './local-service-config.mjs';

const execute = promisify(execFile);
const fail = (code) => Object.assign(new Error(code), { code, status: 409 });
const cleanEnv = () => Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PATH', 'PATHEXT'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
// Only this call scope knows whether it crossed a mutating boundary. An
// untyped downstream failure after that boundary remains uncertain.
async function effectScope(callback) {
  let attempted = false;
  try { return await callback((value = true) => { attempted = value; }); }
  catch (error) { error.effectAttempted = attempted; throw error; }
}

/** Fixed server recipes. No model operations, shell, arbitrary arguments, or desktop kill. */
export function createLocalServiceAdapters({ fetchImpl = fetch, processBackend, execFileImpl = execute, spawnImpl = spawn, inspectDesktop, inspectController, inspectPort, readCliIdentity = launcherCLIIdentity, bionicHeaders = () => ({}), platform = process.platform, pollMs = 100, now = Date.now } = {}) {
  async function assertCliIdentity(profile) {
    const expected = profile.fileIdentity?.cliPath;
    if (!expected || !/^[a-f0-9]{64}$/.test(expected.sha256) || !Number.isSafeInteger(expected.size)) throw fail('identity_unconfirmed');
    try { if (JSON.stringify(await readCliIdentity(profile.cliPath)) !== JSON.stringify(expected)) throw fail('identity_unconfirmed'); }
    catch { throw fail('identity_unconfirmed'); }
  }
  async function listenerState(profile) {
    if (inspectPort) { try { const state = await inspectPort(profile.port); return ['absent', 'present'].includes(state) ? state : 'unknown'; } catch { return 'unknown'; } }
    if (platform !== 'win32' || !Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) return 'unknown';
    try {
      const script = `$ErrorActionPreference='Stop'; $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq ${profile.port} }); if($listeners.Count -eq 0){[Console]::Out.Write('absent')}else{[Console]::Out.Write('present')}`;
      const result = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, shell: false, timeout: 7000, maxBuffer: 4096, env: cleanEnv() });
      return ['absent', 'present'].includes(result.stdout.trim()) ? result.stdout.trim() : 'unknown';
    } catch { return 'unknown'; }
  }
  async function controllerIdentity(profile, expectedPid) {
    try {
      let identity;
      if (inspectController) identity = await inspectController({ profile, pid: expectedPid });
      else {
        if (platform !== 'win32' || !Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) return null;
        const script = `$owners=@(Get-NetTCPConnection -State Listen -LocalPort ${profile.port} -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique); if($owners.Count -ne 1){exit 1}; $p=Get-Process -Id $owners[0] -ErrorAction Stop; @{pid=$p.Id;createdAt=$p.StartTime.ToUniversalTime().Ticks.ToString();executable=$p.Path}|ConvertTo-Json -Compress`;
        const result = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, shell: false, timeout: 7000, maxBuffer: 4096, env: cleanEnv() });
        identity = JSON.parse(result.stdout);
        if (profile.id === 'bionic') {
          const metadata = await stat(join(dirname(profile.apiInfoPath), 'http-server-config.json'));
          identity.configIdentity = { mtimeMs: metadata.mtimeMs, ctimeMs: metadata.ctimeMs, ino: metadata.ino, dev: metadata.dev, size: metadata.size };
        }
      }
      if (!identity || !Number.isSafeInteger(identity.pid) || identity.pid < 1 || typeof identity.createdAt !== 'string' || !identity.createdAt || typeof identity.executable !== 'string' || !identity.executable) return null;
      if (expectedPid && identity.pid !== expectedPid) return null;
      if (profile.id === 'bionic' && (!identity.configIdentity || (profile.appPath && identity.executable.toLowerCase() !== profile.appPath.toLowerCase()))) return null;
      // A Windows venv redirector launches the actual interpreter in a child.
      // Its authenticated helper receipt anchors expectedPid; retain the real
      // listener image/time instead of comparing it to the redirector path.
      if (profile.id === 'comfyui' && !expectedPid) return null;
      return { pid: identity.pid, createdAt: identity.createdAt, executable: identity.executable, ...(profile.id === 'bionic' ? { configIdentity: identity.configIdentity } : {}) };
    } catch { return null; }
  }
  async function ownsController(profile, receipt) {
    if (!receipt?.controllerIdentity || profile.exclusiveControl !== true || receipt.profileFingerprint !== profile.fingerprint || receipt.apiPort !== profile.port) return false;
    const observed = await controllerIdentity(profile, receipt.controllerIdentity.pid);
    return observed !== null && JSON.stringify(observed) === JSON.stringify(receipt.controllerIdentity);
  }
  async function desktopOwnsApi(profile, pid) {
    if (!Number.isSafeInteger(pid) || pid < 1) return false;
    if (inspectDesktop) return inspectDesktop({ profile, pid });
    try {
      const script = `$p=Get-Process -Id ${pid} -ErrorAction Stop; $owners=@(Get-NetTCPConnection -State Listen -LocalPort ${profile.port} -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique); if($owners.Count -eq 1 -and $owners[0] -eq ${pid}) { $p.Path }`;
      const result = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, shell: false, timeout: 7000, maxBuffer: 4096, env: cleanEnv() });
      return result.stdout.trim().toLowerCase() === profile.appPath.toLowerCase();
    } catch { return false; }
  }
  async function json(url, headers) {
    const response = await fetchImpl(url, { headers, redirect: 'error', signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw fail('api_unavailable');
    return response.json();
  }
  async function cli(profile, verb, markEffect) {
    if (platform !== 'win32' || !profile.cliPath || !profile.apiInfoPath) throw fail('controller_unavailable');
    await assertCliIdentity(profile);
    const args = verb === 'start' ? ['server', 'start', '--port', String(profile.port), '--bind', '127.0.0.1'] : ['server', verb, ...(verb === 'status' ? ['--json'] : [])];
    try {
      if (verb === 'start' || verb === 'stop') markEffect?.();
      const result = await execFileImpl(profile.cliPath, args, { windowsHide: true, shell: false, timeout: 10000, maxBuffer: 16384, env: { ...cleanEnv(), LMS_API_SERVER_INFO_PATH: profile.apiInfoPath } });
      return verb === 'status' ? JSON.parse(result.stdout) : null;
    } catch { throw fail('controller_unavailable'); }
  }
  async function observe(profile, receipt) {
    let api = { state: 'unavailable', observedAt: now() }, model = { state: 'unknown' }, activity = { state: 'unknown', observedAt: now() };
    let processState = receipt ? 'unknown' : 'external';
    if (profile.id === 'comfyui' && receipt) {
      try { processState = (await processBackend.inspect(receipt)).state; } catch { /* uncertainty is retained */ }
    }
    try {
      if (profile.id === 'bionic') {
        const data = await json(profile.url.replace(/\/$/, '') + '/api/v1/models', bionicHeaders());
        if (!Array.isArray(data.models)) throw fail('api_invalid');
        api.state = 'ready';
        const loadedCount = data.models.reduce((count, model) => count + (Array.isArray(model.loaded_instances) ? model.loaded_instances.length : 0), 0);
        model = { state: loadedCount ? 'loaded' : 'unloaded', count: loadedCount };
        // This is the declared dedicated-client scope, never a universal activity lock.
        activity.state = profile.exclusiveControl ? 'idle' : 'unknown';
        if (receipt) {
          const status = await cli(profile, 'status');
          processState = status.running === true && status.port === profile.port && await ownsController(profile, receipt) ? 'running' : 'unknown';
        }
      } else {
        const data = await json(profile.url.replace(/\/$/, '') + '/system_stats');
        if (!data || typeof data !== 'object' || !data.system) throw fail('api_invalid');
        api.state = 'ready';
        const queue = await json(profile.url.replace(/\/$/, '') + '/queue');
        if (!Array.isArray(queue.queue_running) || !Array.isArray(queue.queue_pending)) throw fail('activity_unknown');
        activity.count = queue.queue_running.length + queue.queue_pending.length;
        activity.state = activity.count ? 'busy' : profile.exclusiveControl ? 'idle' : 'unknown';
      }
    } catch { /* no API response does not prove process termination */ }
    if (profile.id === 'bionic' && receipt && api.state !== 'ready') {
      try {
        const status = await cli(profile, 'status');
        if (status.running === false && status.port === profile.port && await listenerState(profile) === 'absent') processState = 'stopped';
      } catch { /* Neither a failed CLI nor a missing HTTP response proves stop. */ }
    }
    return { api, model, activity, process: { state: processState } };
  }
  async function waitApi(profile, desired) {
    const deadline = now() + (profile.startTimeoutMs || 15000);
    do {
      const state = await observe(profile);
      if ((state.api.state === 'ready') === desired) return;
      await new Promise(resolve => setTimeout(resolve, pollMs));
    } while (now() < deadline);
    throw fail('availability_unconfirmed');
  }
  return {
    observe,
    async start(profile) {
      return effectScope(async markEffect => {
      if (profile.id === 'bionic') {
        if (platform !== 'win32' || !profile.cliPath || !profile.apiInfoPath) throw fail('controller_unavailable');
        let desktopPid;
        let before;
        try { before = await cli(profile, 'status'); } catch (error) { if (error.code === 'identity_unconfirmed') throw error; before = null; }
        if (!before || (before.running === false && before.port === undefined)) {
          if (!profile.appPath) throw fail('desktop_start_required');
          await assertCliIdentity(profile);
          markEffect();
          const child = spawnImpl(profile.appPath, [], { detached: true, stdio: 'ignore', shell: false, windowsHide: true, env: cleanEnv() });
          desktopPid = child.pid;
          let spawnError = false;
          child.once('error', () => { spawnError = true; });
          child.unref();
          const deadline = Date.now() + (profile.startTimeoutMs || 15000);
          do {
            if (spawnError) throw fail('desktop_start_unconfirmed');
            await new Promise(resolve => setTimeout(resolve, pollMs));
            try { before = await cli(profile, 'status'); } catch (error) { if (error.code === 'identity_unconfirmed') throw error; before = null; }
            if (before?.port === profile.port) break;
          } while (Date.now() < deadline);
          if (!before || before.port !== profile.port) throw fail('desktop_start_unconfirmed');
        }
        if (before.port !== undefined && before.port !== profile.port) throw fail('identity_unconfirmed');
        // Desktop may auto-enable its API. Adoption requires the actual spawned
        // process to own the listening socket and match the approved executable.
        if (before.running === true) {
          if (!desktopPid || !await desktopOwnsApi(profile, desktopPid)) throw fail('identity_unconfirmed');
        } else if (before.running === false) { await cli(profile, 'start', markEffect); }
        else throw fail('identity_unconfirmed');
        const status = await cli(profile, 'status');
        if (status.running !== true || status.port !== profile.port) throw fail('identity_unconfirmed');
        await waitApi(profile, true);
        const identity = await controllerIdentity(profile, desktopPid);
        if (!identity) throw fail('identity_unconfirmed');
        return { version: 1, id: 'bionic', profileFingerprint: profile.fingerprint, apiPort: profile.port, controllerIdentity: identity, ...(desktopPid ? { desktopPid } : {}) };
      }
      markEffect();
      let receipt;
      try { receipt = await processBackend.launch(profile); }
      catch (error) { if (error.effectAttempted === false) markEffect(false); throw error; }
      try {
        await waitApi(profile, true);
        const identity = await controllerIdentity(profile, receipt.pid);
        if (!identity) throw fail('identity_unconfirmed');
        receipt = { ...receipt, controllerIdentity: identity };
      }
      catch (error) { error.receipt = receipt; throw error; }
      return receipt;
      });
    },
    async stop(profile, receipt) {
      return effectScope(async markEffect => {
      if (!receipt || receipt.profileFingerprint !== profile.fingerprint) throw fail('identity_unconfirmed');
      if (profile.id === 'bionic') {
        if (!await ownsController(profile, receipt)) throw fail('identity_unconfirmed');
        if (receipt.desktopPid && !await desktopOwnsApi(profile, receipt.desktopPid)) throw fail('identity_unconfirmed');
        const status = await cli(profile, 'status');
        if (status.running !== true || status.port !== profile.port || receipt.apiPort !== profile.port) throw fail('identity_unconfirmed');
        if (!await ownsController(profile, receipt)) throw fail('identity_unconfirmed');
        await cli(profile, 'stop', markEffect);
        const after = await cli(profile, 'status');
        if (after.running !== false || (after.port !== undefined && after.port !== profile.port)) throw fail('termination_unconfirmed');
        await waitApi(profile, false);
      } else {
        if ((await processBackend.inspect(receipt)).state !== 'running') throw fail('identity_unconfirmed');
        markEffect(); await processBackend.requestStop(receipt);
        if ((await processBackend.waitForExit(receipt, { timeoutMs: profile.stopTimeoutMs || 15000 })).state !== 'stopped') throw fail('termination_unconfirmed');
      }
      });
    },
    close: () => processBackend?.close?.(),
  };
}
