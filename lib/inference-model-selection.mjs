import path from 'node:path';
import { promises as defaultFS } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const pending = state => ['accepted', 'starting', 'unknown'].includes(state);
const record = value => value && typeof value === 'object' && !Array.isArray(value);

/** One durable user intention joins an owned GGUF process and its inference connection.
 * Rereading can finish connection persistence, but can never launch or stop a process.
 */
export async function createInferenceModelSelection({ filename, fs = defaultFS, manager, inferenceSettings,
  assertIdle, prepareActivation, activate, readActiveModel } = {}) {
  let operations = [], active = false, serial = Promise.resolve();
  try {
    const info = await fs.lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 64000) throw Error('invalid');
    const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (!record(saved) || saved.version !== 1 || !Array.isArray(saved.operations) || saved.operations.length > 64 || saved.operations.some(item =>
      !record(item) || !/^[\w-]{8,100}$/.test(item.requestId) || !/^[a-f0-9]{64}$/.test(item.fingerprint) || !/^[a-f0-9]{64}$/.test(item.modelId) ||
      !['accepted', 'starting', 'unknown', 'succeeded', 'failed'].includes(item.state) || typeof item.endpoint !== 'string' ||
      typeof item.expectedInferenceRevision !== 'string' || typeof item.expectedRevision !== 'string') ||
      new Set(saved.operations.map(item => item.requestId)).size !== saved.operations.length ||
      saved.operations.slice(0, -1).some(item => pending(item.state))) throw Error('invalid');
    operations = saved.operations.map(item => ({ ...item, ...(pending(item.state) ? { state: 'unknown', code: 'inference-selection-restarted' } : {}) }));
  } catch (error) { if (error.code !== 'ENOENT') throw fail(503, 'inference-selection-unreadable', 'Le suivi du choix de modèle est illisible. Il reste conservé.'); }

  const latest = () => operations.at(-1) || null;
  function lifecycleStatus() { return { active, reconciliationRequired: operations.some(item => pending(item.state)) }; }
  async function persist() {
    const temporary = filename + '.' + randomUUID() + '.tmp';
    await fs.mkdir(path.dirname(filename), { recursive: true });
    try {
      try { const info = await fs.lstat(filename); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw Error('link'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await fs.writeFile(temporary, JSON.stringify({ version: 1, operations }), { flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, filename);
    } catch { throw fail(503, 'inference-selection-unknown', 'Le suivi du choix n’a pas pu être confirmé. Relis son état sans relancer le chargement.'); }
    finally { await fs.unlink(temporary).catch(() => {}); }
  }
  function publicOperation(operation) {
    if (!operation) return null;
    const { requestId, modelId, state, code, model } = operation;
    return { requestId, modelId, state, ...(code ? { code } : {}), ...(model ? { model } : {}) };
  }
  async function dto() {
    const llamaServer = await manager.snapshot();
    const inference = inferenceSettings.snapshot(), operation = latest();
    const confirmed = operation?.state === 'succeeded' && inference.provider === 'llamacpp' && inference.llamaUrl === operation.endpoint &&
      llamaServer.process.owned && llamaServer.process.state === 'running' && llamaServer.process.model?.id === operation.modelId;
    const activeModel = confirmed ? { ggufId: operation.modelId, alias: llamaServer.process.model.inferenceAlias,
      modelId: operation.model, endpoint: operation.endpoint, confirmed: true } : null;
    return { operation: publicOperation(latest()), profileRevision: llamaServer.profile.revision,
      inferenceRevision: inference.revision, inference, llamaServer,
      busy: active, reconciliationRequired: lifecycleStatus().reconciliationRequired,
      activeModel, modelId: activeModel?.modelId || null };
  }
  async function finish(operation, processState) {
    const current = inferenceSettings.snapshot();
    if (current.revision !== operation.expectedInferenceRevision && !(current.provider === 'llamacpp' && current.llamaUrl === operation.endpoint)) {
      operation.state = 'failed'; operation.code = 'inference-stale-revision'; await persist();
      throw fail(409, 'inference-stale-revision', 'Le moteur a changé. Le modèle chargé n’a pas remplacé cette connexion.');
    }
    // A process handle and the intended GGUF must both match before touching the connection.
    if (processState.profile.endpoint !== operation.endpoint || !processState.process.owned || processState.process.state !== 'running' || processState.process.model?.id !== operation.modelId) throw fail(409, 'inference-selection-unknown', 'Le modèle possédé n’est pas encore confirmé. Relis son état.');
    const prepared = await prepareActivation(operation.endpoint);
    const model = await readActiveModel(prepared, 'canae-' + operation.modelId.slice(0, 16));
    if (!model || model.loaded !== true || !Number.isInteger(model.contextLength) || model.contextLength <= 0) throw fail(409, 'inference-selection-unknown', 'Le modèle et son contexte ne sont pas encore confirmés. Aucun message transmis.');
    if (current.provider !== 'llamacpp' || current.llamaUrl !== operation.endpoint || current.hasLlamaToken) await activate(prepared, current.revision);
    operation.state = 'succeeded'; operation.model = model.id; delete operation.code;
    await persist();
  }
  async function snapshot({ reconcile = true } = {}) {
    const operation = latest();
    if (reconcile && !active && operation && pending(operation.state)) {
      active = true;
      try {
        await assertIdle();
        const status = await manager.snapshot();
        if (status.process.owned && status.process.state === 'running' && status.process.model?.id === operation.modelId) await finish(operation, status);
        else if (!status.process.owned && ['configured', 'stopped', 'failed'].includes(status.process.state)) { operation.state = 'failed'; operation.code = 'inference-selection-not-running'; await persist(); }
        else if (!status.process.owned) { operation.state = 'unknown'; operation.code = 'inference-selection-unowned'; await persist(); }
      } catch (error) {
        if (operation.state !== 'failed') { operation.state = 'unknown'; operation.code = error.code || 'inference-selection-unknown'; }
      } finally { active = false; }
    }
    return dto();
  }
  async function select(input) {
    if (!record(input) || Object.keys(input).some(key => !['modelId', 'requestId', 'expectedRevision', 'expectedInferenceRevision', 'consent'].includes(key)) ||
      !/^[a-f0-9]{64}$/.test(input.modelId) || !/^[\w-]{8,100}$/.test(input.requestId) ||
      typeof input.expectedRevision !== 'string' || typeof input.expectedInferenceRevision !== 'string' || input.consent !== true) throw fail(400, 'inference-selection-invalid', 'Un modèle et une confirmation explicite sont requis.');
    const fingerprint = createHash('sha256').update(JSON.stringify(Object.fromEntries(['modelId', 'requestId', 'expectedRevision', 'expectedInferenceRevision', 'consent'].map(key => [key, input[key]])))).digest('hex');
    const previous = operations.find(item => item.requestId === input.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw fail(409, 'inference-selection-conflict', 'Cet identifiant appartient à un autre choix.');
      // Do not replay an effect even after a companion restart or a lost response.
      await serial.catch(() => {});
      if (previous.state === 'failed') throw fail(409, previous.code || 'inference-selection-failed', 'Ce choix a échoué. Relis l’état avant une nouvelle confirmation.');
      return snapshot();
    }
    if (active || lifecycleStatus().reconciliationRequired) throw fail(409, 'inference-selection-active', 'Un choix de modèle attend sa fin ou sa vérification. Relis son état.');
    active = true;
    const work = (async () => {
      let operation;
      try {
        await assertIdle();
        const state = await manager.snapshot(), inference = inferenceSettings.snapshot();
        if (input.expectedRevision !== state.profile.revision) throw fail(409, 'llama-stale-revision', 'Le profil a changé. Relis son état.');
        if (input.expectedInferenceRevision !== inference.revision) throw fail(409, 'inference-stale-revision', 'Le moteur a changé. Relis son état.');
        if (state.operation?.state === 'unknown' || state.process.state === 'detected-unowned') throw fail(409, 'llama-not-owned', 'Ce serveur n’est pas possédé par ce compagnon. Aucun processus existant n’est arrêté.');
        // Validate connection settings and model identity before the first lifecycle effect.
        await prepareActivation(state.profile.endpoint);
        const catalogue = await manager.inventory();
        if (!catalogue.models.some(model => model.id === input.modelId && model.selectable)) throw fail(409, 'llama-model-unavailable', 'Ce GGUF n’est plus disponible dans la bibliothèque.');
        operation = { requestId: input.requestId, fingerprint, modelId: input.modelId, state: 'accepted', endpoint: state.profile.endpoint,
          expectedRevision: input.expectedRevision, expectedInferenceRevision: input.expectedInferenceRevision };
        operations = [...operations.slice(-63), operation];
        await persist();
        const same = state.process.owned && state.process.state === 'running' && state.process.model?.id === input.modelId;
        if (!same) {
          operation.state = 'starting'; await persist();
          await manager.action({ action: state.process.owned ? 'replace' : 'start', modelId: input.modelId, requestId: input.requestId, expectedRevision: input.expectedRevision, consent: true });
        }
        await finish(operation, await manager.snapshot());
        return dto();
      } catch (error) {
        if (operation) {
          const status = await manager.snapshot().catch(() => null);
          operation.state = status?.process.owned && status.process.model?.id === input.modelId ? 'unknown' : 'failed';
          operation.code = error.code || 'inference-selection-failed';
          await persist().catch(() => {});
        }
        throw error;
      } finally { active = false; }
    })();
    serial = work; return work;
  }
  return { select, snapshot, lifecycleStatus };
}
