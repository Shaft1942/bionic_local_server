import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const fail = (status, message) => Object.assign(new Error(message), { status });
const MAX_OUTPUT = 24000;
// Keep runtime essentials, rather than trying to enumerate every credential name.
const RUNTIME_ENV = /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|USERPROFILE|HOME|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES(?:\(X86\))?|PROGRAMW6432|USERNAME|USERDOMAIN|OS|NUMBER_OF_PROCESSORS|NUMBEROFPROCESSORS|PROCESSOR_\w+|LANG|LC_\w+|TZ)$/i;

async function executable(name, cwd) {
  // An explicitly configured absolute interpreter is trusted configuration.
  if (path.isAbsolute(name)) return name;
  if (name.includes('/') || name.includes('\\')) throw fail(400, 'Le chemin de l’interpréteur doit être absolu.');
  const extensions = process.platform === 'win32' && !/\.(exe|com)$/i.test(name) ? ['.exe', '.com', ''] : [''];
  for (const entry of (process.env.PATH || '').split(path.delimiter)) {
    const directory = entry.replace(/^"(.*)"$/, '$1');
    if (!path.isAbsolute(directory) || path.resolve(directory).toLowerCase() === path.resolve(cwd).toLowerCase()) continue;
    for (const extension of extensions) {
      const filename = path.join(directory, name + extension);
      try { if ((await fs.stat(filename)).isFile()) return await fs.realpath(filename); }
      catch { /* Continue through the explicitly configured search path. */ }
    }
  }
  throw fail(503, 'L’interpréteur demandé est introuvable sur ce PC.');
}

export function createScriptTools({ files, projectId, privateDirectory, python = 'python', signal, requestApproval, onState = async () => {}, spawnImpl = spawn }) {
  let proposalCount = 0;

  async function run({ runtime, code, directory = '', timeoutSeconds = 30 }) {
    if (!['python', 'node', 'powershell'].includes(runtime) || typeof code !== 'string' || !code.trim() || code.length > 20000 || !Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 120) throw fail(400, 'Script invalide : Python, Node ou PowerShell, 20 000 caractères et 120 secondes maximum.');
    if (proposalCount >= 4) throw fail(409, 'Quatre propositions de script au maximum par demande, y compris les refus.');
    if (signal?.aborted) throw fail(409, 'Demande arrêtée.');
    const cwd = await files.executionDirectory(projectId, directory);
    // Reserve before awaiting approval: refusals and parallel calls count too.
    if (proposalCount >= 4) throw fail(409, 'Quatre propositions de script au maximum par demande, y compris les refus.');
    proposalCount++;
    const proposal = Object.freeze({ runtime, code, directory, cwd, timeoutSeconds, kind: 'script' });
    const decision = await requestApproval(proposal);
    if (!decision.approved) return { approved: false, status: decision.approval.status, executed: false };
    if (signal?.aborted) throw fail(409, 'Demande arrêtée après validation.');
    if (await files.executionDirectory(projectId, directory) !== cwd) throw fail(409, 'Le dossier du projet a changé depuis la validation.');

    const approval = { ...structuredClone(decision.approval), ...proposal, executionStatus: 'running' };
    await onState(structuredClone(approval));
    let folder, parent;
    try {
      await fs.mkdir(privateDirectory, { recursive: true });
      // Save the canonical parent BEFORE execution. An approved script can change
      // the filesystem; it must never redirect our later recursive cleanup.
      parent = await fs.realpath(privateDirectory);
      folder = await fs.mkdtemp(path.join(parent, 'run-'));
      const extension = { python: 'py', node: 'mjs', powershell: 'ps1' }[runtime];
      const filename = path.join(folder, 'script.' + extension);
      // Windows PowerShell 5.1 needs the encoding marker for accented UTF-8 code.
      const script = runtime === 'powershell' && process.platform === 'win32' && !code.startsWith('\uFEFF') ? '\uFEFF' + code : code;
      await fs.writeFile(filename, script, { flag: 'wx', mode: 0o600 });
      let command;
      try { command = runtime === 'node' ? process.execPath : runtime === 'python' ? await executable(python, cwd) : process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : await executable('pwsh', cwd); }
      catch (error) {
        if (error.status !== 503) throw error;
        approval.executionStatus = 'failed'; await onState(structuredClone(approval));
        return { approved: true, executed: false, status: 'unavailable', runtime, directory, stdout: '', stderr: '', exitCode: null, reason: 'unavailable', elapsedMs: 0, outputTruncated: false, approvalId: approval.id };
      }
      const args = runtime === 'node' ? [filename] : runtime === 'python' ? ['-u', filename] : ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', filename];
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => RUNTIME_ENV.test(key)));
      env.TEMP = folder; env.TMP = folder; env.PYTHONIOENCODING = 'utf-8';
      if (signal?.aborted) throw fail(409, 'Demande arrêtée avant exécution.');
      const result = await new Promise(resolve => {
        let child, bytes = 0, reason = null, ended = false, stopping = false, terminationTimer;
        const output = { stdout: [], stderr: [] }, started = Date.now();
        const finish = (exitCode, unavailable = false) => {
          if (ended) return;
          ended = true; clearTimeout(timer); clearTimeout(terminationTimer);
          signal?.removeEventListener('abort', abort);
          const stdout = Buffer.concat(output.stdout).toString('utf8');
          const stderr = Buffer.concat(output.stderr).toString('utf8');
          resolve({ approved: true, executed: !unavailable, status: unavailable ? 'unavailable' : reason || (exitCode === 0 ? 'completed' : 'failed'), runtime, directory, stdout, stderr, exitCode, reason: reason || (unavailable ? 'unavailable' : null), elapsedMs: Date.now() - started, outputTruncated: reason === 'output-limit', approvalId: approval.id });
        };
        const stop = why => {
          if (ended || stopping) return;
          stopping = true;
          reason ||= why;
          if (process.platform === 'win32' && child?.pid) {
            const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
            killer.on('error', () => child.kill());
            killer.on('close', code => { if (code && !ended) child.kill(); });
          } else child?.kill('SIGKILL');
          // A failed kill or inherited pipe must not hold the HTTP job forever.
          terminationTimer ??= setTimeout(() => { child?.stdout?.destroy(); child?.stderr?.destroy(); finish(null); }, 2000);
          terminationTimer.unref?.();
        };
        const abort = () => stop('cancelled');
        const timer = setTimeout(() => stop('timeout'), timeoutSeconds * 1000);
        try { child = spawnImpl(command, args, { cwd, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
        catch { finish(null, true); return; }
        const collect = (which, chunk) => {
          if (ended) return;
          const data = Buffer.from(chunk), available = Math.max(0, MAX_OUTPUT - bytes);
          bytes += data.length;
          if (available) output[which].push(data.subarray(0, available));
          if (bytes > MAX_OUTPUT) stop('output-limit');
        };
        child.stdout.on('data', chunk => collect('stdout', chunk));
        child.stderr.on('data', chunk => collect('stderr', chunk));
        child.on('error', () => finish(null, true));
        child.on('close', code => finish(code));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
      approval.executionStatus = result.exitCode === 0 && !result.reason ? 'completed' : 'failed';
      await onState(structuredClone(approval));
      return result;
    } catch (error) {
      approval.executionStatus = 'failed';
      await onState(structuredClone(approval));
      throw error;
    } finally {
      if (folder) {
        let resolved;
        try { resolved = await fs.realpath(folder); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (resolved) {
          if (resolved !== folder || path.dirname(resolved) !== parent) throw fail(500, 'Nettoyage du script refusé : le dossier temporaire a changé.');
          await fs.rm(resolved, { recursive: true, force: true });
        }
      }
    }
  }
  return { run };
}
