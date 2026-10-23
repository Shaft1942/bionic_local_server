import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { loadLocalServiceProfiles } from './local-service-config.mjs';
import { createLocalServiceProcess } from './local-service-process.mjs';
import { createLocalServiceAdapters } from './local-service-adapters.mjs';

const ids = ['bionic', 'comfyui'];
const active = op => ['accepted', 'running'].includes(op.status);
const failure = (code, status = 409) => Object.assign(new Error(code), { code, status });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
const publicOperation = op => op ? Object.fromEntries(['id', 'serviceId', 'idempotencyKey', 'action', 'status', 'phase', 'startedAt', 'resultCode'].filter(k => op[k] !== undefined).map(k => [k, op[k]])) : undefined;

/** Durable intentions precede effects. Recovered uncertainty is never replayed. */
export async function createLocalServiceSupervisor({ root, connections = () => ({}), fetchImpl, platform = process.platform, reserve = () => () => {}, processBackend, adapters: suppliedAdapters, profilesLoader = loadLocalServiceProfiles, execFileImpl, spawnImpl, inspectDesktop, inspectController, bionicHeaders, now = Date.now } = {}) {
  const directory = join(root, 'runtime', 'local-services');
  const journalPath = join(directory, 'operations.json');
  await mkdir(directory, { recursive: true });
  let journal = { version: 1, operations: [], receipts: {} }, profiles, closed = false;
  const running = new Map();
  let mutation = Promise.resolve();
  const serial = fn => { const next = mutation.then(fn, fn); mutation = next.catch(() => {}); return next; };
  async function persist() {
    const temporary = journalPath + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(journal), { mode: 0o600, flush: true });
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, journalPath); break; }
      catch (error) {
        if (attempt >= 7 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
  }
  try {
    const stored = JSON.parse(await readFile(journalPath, 'utf8'));
    if (stored.version !== 1 || !Array.isArray(stored.operations) || !stored.receipts || stored.operations.length > 1000) throw failure('journal_invalid');
    journal = stored;
    if (journal.receipts.bionic) journal.receipts.bionic.ownershipExpired = true;
    for (const op of journal.operations) if (active(op)) { op.status = 'unknown'; op.phase = 'reconcile'; op.resultCode = 'interrupted'; }
    await persist();
  } catch (error) { if (error.code !== 'ENOENT') throw failure('journal_unavailable', 503); }
  const backend = processBackend || (suppliedAdapters ? undefined : createLocalServiceProcess({ root, fetchImpl }));
  const adapters = suppliedAdapters || createLocalServiceAdapters({ fetchImpl, processBackend: backend, execFileImpl, spawnImpl, inspectDesktop, inspectController, bionicHeaders, platform, now });
  async function reload() {
    if (running.size) throw failure('operation_active');
    profiles = await profilesLoader({ root, connections: typeof connections === 'function' ? connections() : connections });
    // Only the authenticated wrapper can restore process ownership after a crash.
    // Bionic API status has no generation identity, so it cannot clear uncertainty.
    await serial(async () => {
      let changed = false;
      for (const op of journal.operations.filter(item => item.status === 'unknown' && item.serviceId === 'comfyui')) {
        const profile = profiles.comfyui, receipt = journal.receipts.comfyui;
        if (!profile || !receipt || receipt.profileFingerprint !== profile.fingerprint) continue;
        const observed = await adapters.observe(profile, receipt);
        if (op.action === 'start' && observed.process.state === 'running' && observed.api.state === 'ready') {
          op.status = 'succeeded'; op.phase = 'complete'; op.resultCode = 'confirmed'; changed = true;
        } else if (observed.process.state === 'stopped') {
          op.status = op.action === 'stop' ? 'succeeded' : 'failed'; op.phase = 'complete'; op.resultCode = op.action === 'stop' ? 'confirmed' : 'process_stopped';
          delete journal.receipts.comfyui; changed = true;
        }
      }
      if (changed) await persist();
    });
    return snapshot();
  }
  const lastOperation = id => [...journal.operations].reverse().find(op => op.serviceId === id);
  const uncertain = id => journal.operations.some(op => op.serviceId === id && op.status === 'unknown');
  function profileFor(id) {
    if (profiles[id]) return profiles[id];
    const urls = typeof connections === 'function' ? connections() : connections;
    return { id, url: urls[id === 'bionic' ? 'bionicUrl' : 'comfyUrl'], exclusiveControl: false };
  }
  async function service(id) {
    const profile = profileFor(id), receipt = journal.receipts[id];
    let observation = { process: { state: receipt ? 'unknown' : 'external' }, api: { state: 'unknown', observedAt: now() }, model: { state: 'unknown' }, activity: { state: 'unknown', observedAt: now() } };
    if (profile.url) { try { observation = await adapters.observe(profile, receipt); } catch { /* safe unknown DTO */ } }
    if (receipt?.ownershipExpired) observation.process = { state: 'unknown' };
    const configured = !!profiles[id], invalidReason = profiles.errors?.[id] || profiles.errors?.config, invalid = !!invalidReason;
    const status = invalid ? 'invalid' : configured ? 'valid' : 'unconfigured';
    const latest = lastOperation(id);
    const current = active(latest || {}) || uncertain(id);
    const revision = digest([profiles.revision, profile.fingerprint, id, receipt?.profileFingerprint, receipt?.operationId, observation.process.state, observation.api.state, observation.activity.state, latest?.id, latest?.status]);
    const actions = {};
    for (const action of ['start', 'stop', 'restart']) {
      let reasonCode;
      if (!configured || invalid) reasonCode = invalid ? 'configuration_invalid' : 'setup_required';
      else if (platform !== 'win32' && !suppliedAdapters) reasonCode = 'platform_unsupported';
      else if (current) reasonCode = uncertain(id) ? 'reconciliation_required' : 'operation_active';
      else if (!profile.exclusiveControl) reasonCode = 'exclusive_control_required';
      else if (action === 'start' && (observation.api.state === 'ready' || (receipt && observation.process.state !== 'stopped'))) reasonCode = 'already_running';
      else if (action !== 'start' && !receipt) reasonCode = 'external_service';
      else if (action !== 'start' && receipt.profileFingerprint !== profile.fingerprint) reasonCode = 'identity_changed';
      else if (action !== 'start' && observation.process.state !== 'running') reasonCode = 'identity_unconfirmed';
      else if (action !== 'start' && observation.activity.state !== 'idle') reasonCode = observation.activity.state === 'busy' ? 'service_busy' : 'activity_unknown';
      actions[action] = { allowed: !reasonCode, ...(reasonCode ? { reasonCode } : {}) };
    }
    return { id, revision, configuration: { status, ...(invalid ? { reasonCode: invalidReason } : {}) }, controlMode: configured ? profile.type === 'bionic-cli' ? 'bionic-cli' : 'owned-process' : 'observe-only', ...observation, actions, ...(latest ? { operation: publicOperation(latest) } : {}) };
  }
  async function snapshot() { return { services: await Promise.all(ids.map(service)) }; }
  async function run(op, profile, release) {
    try {
      await serial(async () => { op.status = 'running'; op.phase = op.action === 'start' ? 'starting' : 'checking'; await persist(); });
      if (op.action !== 'start') {
        const observation = await adapters.observe(profile, journal.receipts[op.serviceId]);
        if (observation.activity.state !== 'idle' || observation.process.state !== 'running') throw failure('activity_or_identity_changed');
        op.phase = 'stopping'; await serial(persist);
        await adapters.stop(profile, journal.receipts[op.serviceId]);
        await serial(async () => { delete journal.receipts[op.serviceId]; op.phase = 'stopped'; await persist(); });
      }
      if (op.action !== 'stop') {
        op.phase = 'starting'; await serial(persist);
        const receipt = await adapters.start(profile);
        await serial(async () => { journal.receipts[op.serviceId] = receipt; await persist(); });
      }
      await serial(async () => { op.status = 'succeeded'; op.phase = 'complete'; op.resultCode = 'confirmed'; await persist(); });
    } catch (error) {
      await serial(async () => {
        if (error.receipt) journal.receipts[op.serviceId] = error.receipt;
        op.status = op.phase === 'checking' ? 'failed' : 'unknown';
        op.resultCode = error.code && /^[a-z_]+$/.test(error.code) ? error.code : 'effect_unconfirmed';
        op.phase = op.status === 'unknown' ? 'reconcile' : 'complete';
        await persist();
      }).catch(() => { op.status = 'unknown'; op.phase = 'reconcile'; });
    } finally { running.delete(op.id); release(); }
  }
  async function action(id, request) {
    if (!ids.includes(id) || !request || !['start', 'stop', 'restart'].includes(request.action) || typeof request.expectedRevision !== 'string' || typeof request.idempotencyKey !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(request.idempotencyKey) || Object.keys(request).some(k => !['action', 'expectedRevision', 'idempotencyKey'].includes(k))) throw failure('invalid_request', 400);
    return serial(async () => {
      const existing = journal.operations.find(op => op.idempotencyKey === request.idempotencyKey);
      const requestFingerprint = digest([id, request.action, request.expectedRevision]);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) throw failure('idempotency_collision');
        return publicOperation(existing);
      }
      if (closed) throw failure('supervisor_closed', 503);
      if (journal.operations.length >= 1000) throw failure('journal_full', 503);
      profiles = await profilesLoader({ root, connections: typeof connections === 'function' ? connections() : connections });
      const state = await service(id);
      if (state.revision !== request.expectedRevision) throw failure('stale_revision');
      if (!state.actions[request.action].allowed) throw failure(state.actions[request.action].reasonCode);
      if (running.size || journal.operations.some(op => op.status === 'unknown')) throw failure('operation_active');
      const release = reserve({ id, action: request.action });
      if (typeof release !== 'function') throw failure('reservation_invalid');
      const op = { id: randomUUID(), serviceId: id, idempotencyKey: request.idempotencyKey, requestFingerprint, action: request.action, status: 'accepted', phase: 'reserved', startedAt: now() };
      journal.operations.push(op);
      try { await persist(); }
      catch { journal.operations.pop(); release(); throw failure('journal_unavailable', 503); }
      // Start outside the journal mutex: callers receive the persisted receipt first.
      const reservedProfile = profiles[id];
      const task = new Promise(resolve => setImmediate(resolve)).then(() => run(op, reservedProfile, release));
      running.set(op.id, task);
      return publicOperation(op);
    });
  }
  profiles = await profilesLoader({ root, connections: typeof connections === 'function' ? connections() : connections });
  return {
    snapshot, reload, action,
    protectedPaths() {
      const paths = [];
      const comfy = profiles.comfyui, bionic = profiles.bionic;
      if (comfy) paths.push(comfy.workingDirectory, comfy.pythonPath && dirname(comfy.pythonPath));
      if (bionic) paths.push(...[bionic.appPath, bionic.cliPath, bionic.apiInfoPath].filter(Boolean).map(value => dirname(value)));
      return [...new Set(paths.filter(Boolean))];
    },
    async operation(key) { const op = journal.operations.find(item => item.id === key || item.idempotencyKey === key); if (!op) throw failure('operation_not_found', 404); if (!active(op) && running.has(op.id)) await running.get(op.id); return publicOperation(op); },
    activeCount: () => running.size + journal.operations.filter(op => op.status === 'unknown' && !running.has(op.id)).length,
    assertAdmission() { if (running.size || journal.operations.some(op => op.status === 'unknown')) throw failure('local_service_maintenance'); },
    async close() { closed = true; await Promise.allSettled([...running.values()]); await adapters.close?.(); },
  };
}
