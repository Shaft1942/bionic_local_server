import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { createLlamaServerLibrary, validateLlamaServerBinary } from './llama-server-library.mjs';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields = ['directory', 'binaryPath', 'port', 'contextSize', 'gpuLayers', 'modelId'];
export async function createLlamaServerSettings({ filename, initial = {}, library = createLlamaServerLibrary(), reservedPorts = [], validateBinary = validateLlamaServerBinary } = {}) {
  const reserved = new Set([1235, 1236, 1237, 8769, 8774, 8188, 8780, ...reservedPorts]);
  function propose(input, previous) {
    if (!record(input) || Object.keys(input).some(key => ![...fields, 'expectedRevision'].includes(key))) throw fail(400, 'llama-settings-invalid', 'Réglages llama-server invalides.');
    const next = Object.fromEntries(fields.map(key => [key, input[key] ?? previous[key]]));
    next.directory = library.directoryPath(next.directory);
    if (typeof next.binaryPath !== 'string' || !path.isAbsolute(next.binaryPath) || !/^llama-server(?:\.exe)?$/i.test(path.basename(next.binaryPath)) || /[\x00-\x1f]/.test(next.binaryPath)) throw fail(400, 'llama-binary-invalid', 'Choisis le binaire llama-server installé sur le PC.');
    for (const [key, min, max] of [['port', 1024, 65535], ['contextSize', 512, 131072], ['gpuLayers', 0, 256]]) if (!Number.isInteger(next[key]) || next[key] < min || next[key] > max) throw fail(400, 'llama-settings-range', 'Port, contexte ou nombre de couches invalide.');
    if (reserved.has(next.port)) throw fail(400, 'llama-port-reserved', 'Choisis un port distinct des services existants, notamment 1237.');
    if (typeof next.modelId !== 'string' || next.modelId !== '' && !/^[0-9a-f]{64}$/.test(next.modelId)) throw fail(400, 'llama-model-id', 'Choix du modèle invalide.');
    return next;
  }
  let state = { version: 1, revision: randomUUID(), ...propose({ directory: library.defaultDirectory, binaryPath: process.platform === 'win32' ? 'E:/AI/llama.cpp/b11840/llama-server.exe' : '/usr/local/bin/llama-server', port: 1238, contextSize: 8192, gpuLayers: 0, modelId: '', ...initial }, {}) }, pending = Promise.resolve();
  if (filename) try { const info = await fs.lstat(filename); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 16384) throw Error('invalid'); const saved = JSON.parse(await fs.readFile(filename, 'utf8')); if (!record(saved) || saved.version !== 1 || typeof saved.revision !== 'string' || !/^[\w-]{1,100}$/.test(saved.revision) || Object.keys(saved).some(key => !['version', 'revision', ...fields].includes(key))) throw Error('invalid'); state = { version: 1, revision: saved.revision, ...propose(Object.fromEntries(fields.map(key => [key, saved[key]])), state) }; } catch (error) { if (error.code !== 'ENOENT') throw fail(503, 'llama-settings-unreadable', 'Le profil llama-server est illisible et reste conservé.'); }
  const snapshot = () => ({ ...state, endpoint: 'http://127.0.0.1:' + state.port, reservedPorts: [...reserved] });
  async function save(input) {
    const work = pending.catch(() => {}).then(async () => {
      if (input?.expectedRevision !== state.revision) throw fail(409, 'llama-stale-revision', 'Le profil a changé. Relis son état avant de l’enregistrer.');
      const next = { version: 1, revision: randomUUID(), ...propose(input, state) };
      await validateBinary(next.binaryPath); await library.inventory(next.directory);
      if (next.modelId) await library.resolveModel({ directory: next.directory, modelId: next.modelId });
      if (filename) {
        const temporary = filename + '.' + randomUUID() + '.tmp';
        await fs.mkdir(path.dirname(filename), { recursive: true });
        try { try { const info = await fs.lstat(filename); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw Error('link'); } catch (error) { if (error.code !== 'ENOENT') throw error; } await fs.writeFile(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, filename); } catch { throw fail(500, 'llama-settings-save-failed', 'Le profil n’a pas été enregistré.'); } finally { await fs.unlink(temporary).catch(() => {}); }
      }
      state = next; return snapshot();
    }); pending = work; return work;
  }
  return { snapshot, save, library, validateBinary };
}

/** Direct-child ownership only. Never adopt an external listener or kill by PID. */
export function createLlamaServerProcess({ spawnImpl = spawn, fetchImpl = fetch, connectImpl = net.connect, pollMs = 100 } = {}) {
  const owned = new Set();
  async function occupied(port) {
    return new Promise(resolve => { const socket = connectImpl({ host: '127.0.0.1', port }); let settled = false; const finish = value => { if (settled) return; settled = true; socket.destroy(); resolve(value); }; socket.once('connect', () => finish(true)); socket.once('error', error => finish(error.code !== 'ECONNREFUSED')); socket.setTimeout(500, () => finish(true)); });
  }
  async function launch(profile) {
    if (await occupied(profile.port)) throw fail(409, 'llama-external-listener', 'Ce port est occupé. Aucun processus existant ne sera adopté ou arrêté.');
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'CUDA_PATH'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
    const child = spawnImpl(profile.binaryPath, ['--model', profile.modelPath, '--alias', profile.alias, '--host', '127.0.0.1', '--port', String(profile.port), '--ctx-size', String(profile.contextSize), '--n-gpu-layers', String(profile.gpuLayers), '--parallel', '1'], { cwd: path.dirname(profile.binaryPath), shell: false, windowsHide: true, detached: false, stdio: 'ignore', env });
    const handle = { child, profile, exited: false, error: false }; owned.add(handle);
    child.once('exit', code => { handle.exited = true; handle.exitCode = code; }); child.once('error', () => { handle.exited = true; handle.error = true; }); child.unref();
    return handle;
  }
  async function inspect(handle) {
    if (!owned.has(handle)) return { state: 'unknown', owned: false };
    if (handle.exited) return { state: handle.error || handle.exitCode ? 'failed' : 'stopped', owned: false, exitConfirmed: true };
    try { const response = await fetchImpl('http://127.0.0.1:' + handle.profile.port + '/v1/models', { redirect: 'error', signal: AbortSignal.timeout(1000) }); if (Number(response.headers?.get('content-length')) > 65536) { await response.body?.cancel(); throw Error('large'); } const chunks = []; let size = 0; for await (const chunk of response.body || []) { size += chunk.length; if (size > 65536) throw Error('large'); chunks.push(Buffer.from(chunk)); } const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (response.ok && value.data?.some(item => item.id === handle.profile.alias) && !handle.exited) return { state: 'running', owned: true, pid: handle.child.pid }; } catch { /* Loading or incompatible model: retain ownership and permit explicit stop. */ }
    return { state: 'starting', owned: true, pid: handle.child.pid };
  }
  async function stop(handle) {
    if (!owned.has(handle)) throw fail(409, 'llama-not-owned', 'Ce processus n’est pas possédé par ce compagnon.');
    if (!handle.exited && !handle.child.kill('SIGTERM')) throw fail(409, 'llama-stop-unknown', 'L’arrêt n’est pas confirmé. Relis l’état sans renvoyer automatiquement l’action.');
    const deadline = Date.now() + 15000;
    while (!handle.exited && Date.now() < deadline) await wait(pollMs);
    if (!handle.exited) throw fail(409, 'llama-stop-unknown', 'L’arrêt n’est pas confirmé.');
    if (await occupied(handle.profile.port)) throw fail(409, 'llama-port-still-occupied', 'Le processus possédé est arrêté, mais le port reste occupé.');
    return { state: 'stopped', owned: false, exitConfirmed: true };
  }
  return { launch, inspect, stop, occupied, close() { for (const handle of owned) handle.child.unref(); } };
}

export function createLlamaServerManager({ settings, library = settings.library, processBackend = createLlamaServerProcess(), assertIdle, assertConnectorAvailable, onStarted, startTimeoutMs = 30000, pollMs = 100 } = {}) {
  let handle = null, runningModel = null, operation = null, mutation = Promise.resolve(), closed = false, inFlight = 0;
  const operations = new Map();
  async function guard(action) {
    if (closed || typeof assertIdle !== 'function' || typeof assertConnectorAvailable !== 'function') throw fail(409, 'llama-control-unavailable', 'La supervision locale est indisponible.');
    await assertIdle(action); await assertConnectorAvailable(action);
  }
  async function snapshot() {
    const profile = settings.snapshot(), observedHandle = handle, observedOperation = operation;
    let processState = handle ? await processBackend.inspect(handle) : { state: await processBackend.occupied(profile.port) ? 'detected-unowned' : 'configured', owned: false };
    if (handle !== observedHandle || operation !== observedOperation) return snapshot();
    if (operation?.state === 'unknown' && processState.exitConfirmed === true) {
      // A confirmed child exit settles an ambiguous lifecycle effect on reread.
      // A replacement interrupted during stop has not launched its target. This
      // GET never resumes replacement, signals a child or adopts a new listener.
      const occupied = await processBackend.occupied(profile.port);
      if (handle !== observedHandle || operation !== observedOperation || operation.state !== 'unknown') return snapshot();
      handle = null; runningModel = null;
      operation.state = !occupied && operation.action === 'stop' ? 'succeeded' : 'failed';
      if (occupied) operation.code = 'llama-port-still-occupied';
      else if (operation.action === 'stop') delete operation.code;
      else operation.code = operation.phase === 'stopping' ? 'llama-replacement-stopped' : 'llama-start-failed';
      processState = { state: occupied ? 'detected-unowned' : 'configured', owned: false, exitConfirmed: true };
    }
    if (processState.owned && processState.state === 'running' && operation?.state === 'unknown' && operation.phase === 'starting' && runningModel?.id === operation.modelId) {
      operation.state = 'succeeded'; delete operation.code;
    }
    return { profile, process: { ...processState, model: runningModel ? { id: runningModel.id, name: runningModel.name, inferenceAlias: 'canae-' + runningModel.id.slice(0, 16) } : null }, operation: operation ? { ...operation } : null, lifecycle: lifecycleStatus(), canControl: typeof assertIdle === 'function' && typeof assertConnectorAvailable === 'function' && !closed, noAutomaticStart: true, sameFilesAsBionic: true, compatibilityGuaranteed: false };
  }
  function lifecycleStatus() { return { active: inFlight > 0, activeCount: inFlight, reconciliationRequired: operation?.state === 'unknown', operation: operation ? { ...operation } : null }; }
  async function save(input, { canConfigureLocal = false } = {}) {
    const current = settings.snapshot();
    if (!canConfigureLocal && ['directory', 'binaryPath', 'port'].some(key => input?.[key] !== undefined && input[key] !== current[key])) throw fail(403, 'llama-local-configuration-only', 'Le dossier, le binaire et le port se configurent uniquement depuis le PC serveur.');
    inFlight++;
    const work = mutation.catch(() => {}).then(async () => { await guard('configure'); if (handle && (await processBackend.inspect(handle)).owned) throw fail(409, 'llama-running', 'Arrête explicitement le processus possédé avant de modifier son profil.'); if (await processBackend.occupied(settings.snapshot().port)) throw fail(409, 'llama-external-listener', 'Un processus non possédé occupe ce profil. Il ne sera pas modifié.'); const result = await settings.save(input); return { ...(await snapshot()), profile: result }; }).finally(() => { inFlight--; }); mutation = work; return work;
  }
  async function action(input) {
    if (!record(input) || Object.keys(input).some(key => !['action', 'requestId', 'expectedRevision', 'modelId', 'consent'].includes(key)) || !['start', 'stop', 'replace'].includes(input.action) || typeof input.requestId !== 'string' || !/^[\w-]{8,100}$/.test(input.requestId) || input.consent !== true) throw fail(400, 'llama-action-invalid', 'Une action explicite et son consentement sont requis.');
    const fingerprint = hash(Object.fromEntries(['action', 'requestId', 'expectedRevision', 'modelId', 'consent'].map(key => [key, input[key]]))), existing = operations.get(input.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw fail(409, 'llama-request-conflict', 'Cet identifiant appartient à une autre action.');
      try { await existing.promise; }
      catch (error) {
        // Reread can confirm a previously ambiguous result. An idempotent retry
        // returns that confirmation without replaying the original process effect.
        const status = await snapshot();
        if (existing.operation?.state === 'succeeded') return status;
        throw error;
      }
      return snapshot();
    }
    const entry = { fingerprint, promise: null }; inFlight++;
    const work = mutation.catch(() => {}).then(async () => {
      await guard(input.action); const profile = settings.snapshot();
      if (input.expectedRevision !== profile.revision) throw fail(409, 'llama-stale-revision', 'Le profil a changé. Relis son état.');
      const state = handle ? await processBackend.inspect(handle) : null;
      if (input.action === 'stop' && !state?.owned) throw fail(409, 'llama-not-owned', 'Aucun processus possédé à arrêter. Les autres serveurs restent hors contrôle.');
      if (input.action === 'start' && state?.owned) throw fail(409, 'llama-already-running', 'Ce processus est déjà démarré.');
      if (input.action === 'replace' && !state?.owned) throw fail(409, 'llama-not-owned', 'Le remplacement exige un processus possédé.');
      let model, binary;
      if (input.action !== 'stop') { model = await library.resolveModel({ directory: profile.directory, modelId: input.modelId || profile.modelId }); binary = await settings.validateBinary(profile.binaryPath); }
      operation = { requestId: input.requestId, action: input.action, state: 'accepted', startedAt: Date.now(), modelId: model?.id || runningModel?.id || null };
      entry.operation = operation;
      try {
        // All replacement validation precedes the first stop. New work is checked
        // again immediately before each lifecycle effect by the injected guards.
        if (input.action !== 'start') { await guard(input.action); operation.state = 'stopping'; operation.phase = 'stopping'; await processBackend.stop(handle); handle = null; runningModel = null; }
        if (input.action !== 'stop') {
          await guard(input.action); if (await processBackend.occupied(profile.port)) throw fail(409, 'llama-external-listener', 'Le port est occupé. Aucun processus étranger n’est arrêté.');
          const rechecked = await settings.validateBinary(profile.binaryPath); if (JSON.stringify(rechecked.identity) !== JSON.stringify(binary.identity)) throw fail(409, 'llama-binary-changed', 'Le binaire a changé. Relis le profil.');
          const checkedModel = await library.resolveModel({ directory: profile.directory, modelId: model.id }); if (JSON.stringify(checkedModel.fileIdentity) !== JSON.stringify(model.fileIdentity)) throw fail(409, 'llama-model-changed', 'Le modèle a changé. Actualise le catalogue.');
          operation.state = 'starting'; operation.phase = 'starting'; handle = await processBackend.launch({ binaryPath: binary.filename, modelPath: model.filename, alias: 'canae-' + model.id.slice(0, 16), port: profile.port, contextSize: profile.contextSize, gpuLayers: profile.gpuLayers }); runningModel = model;
          const deadline = Date.now() + startTimeoutMs;
          while (Date.now() < deadline) { const status = await processBackend.inspect(handle); if (status.state === 'running') { await onStarted?.({ endpoint: profile.endpoint, modelId: model.id }); operation.state = 'succeeded'; return snapshot(); } if (status.exitConfirmed) throw fail(409, 'llama-start-failed', 'Le processus s’est arrêté. La compatibilité ou la mémoire disponible doit être vérifiée.'); await wait(pollMs); }
          throw fail(409, 'llama-start-unknown', 'Le démarrage n’est pas encore confirmé. Relis l’état ; aucune relance automatique.');
        }
        operation.state = 'succeeded'; return snapshot();
      } catch (error) {
        const observed = handle ? await processBackend.inspect(handle) : null;
        // A lost stop acknowledgement can arrive after the child has exited.
        // Preserve the uncertain intention so snapshot can reconcile the exact
        // child and port without another signal or a replacement launch.
        operation.state = operation.phase && handle && (observed.owned || operation.phase === 'stopping' && observed.exitConfirmed === true) ? 'unknown' : 'failed';
        operation.code = typeof error.code === 'string' ? error.code : 'llama-lifecycle-failed'; throw error;
      }
    }).finally(() => { inFlight--; });
    entry.promise = work; operations.set(input.requestId, entry); if (operations.size > 100) operations.delete(operations.keys().next().value); mutation = work; return work;
  }
  async function handleRequest({ method, pathname, query = new URLSearchParams(), body, canConfigureLocal = false } = {}) {
    if (method === 'GET' && pathname === '/api/llama-server') return { status: 200, body: { ...(await snapshot()), canConfigureLocal } };
    if (method === 'GET' && pathname === '/api/llama-server/models') return { status: 200, body: await library.inventory(query.get('directory') || settings.snapshot().directory) };
    if (method === 'POST' && pathname === '/api/llama-server/settings') return { status: 200, body: await save(body, { canConfigureLocal }) };
    if (method === 'POST' && pathname === '/api/llama-server/action') return { status: 200, body: await action(body) };
    return null;
  }
  return { snapshot, inventory: directory => library.inventory(directory || settings.snapshot().directory), save, action, handle: handleRequest, activeCount: () => inFlight, lifecycleStatus, close() { closed = true; processBackend.close?.(); } };
}
