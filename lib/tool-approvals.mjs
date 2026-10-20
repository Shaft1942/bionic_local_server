import { randomUUID } from 'node:crypto';

const fail = (status, message) => Object.assign(new Error(message), { status });

export function createToolApprovals({ ttl = 600000 } = {}) {
  if (!Number.isSafeInteger(ttl) || ttl < 1) throw fail(400, 'Durée de validation invalide.');
  const pending = new Map();

  async function request({ projectId, chatId, proposal, signal, onChange = async () => {} }) {
    if (signal?.aborted) throw fail(409, 'Demande arrêtée avant validation.');
    const createdAt = Date.now();
    // Neither observers nor the caller can change the code awaiting approval.
    const approval = { ...structuredClone(proposal), id: randomUUID(), projectId, chatId, status: 'pending', createdAt, expiresAt: createdAt + ttl };
    let resolveDecision, rejectDecision, checkpoint = Promise.resolve();
    const decision = new Promise((resolve, reject) => { resolveDecision = resolve; rejectDecision = reject; });
    decision.catch(() => {});
    const notify = () => {
      const snapshot = structuredClone(approval);
      checkpoint = checkpoint.then(() => onChange(snapshot));
      return checkpoint;
    };
    const release = () => {
      clearTimeout(timer);
      pending.delete(approval.id);
      signal?.removeEventListener('abort', abort);
    };
    const settle = async status => {
      if (approval.status !== 'pending') throw fail(409, 'Cette demande a déjà été traitée.');
      approval.status = status;
      approval.decidedAt = Date.now();
      release();
      try {
        await notify();
        resolveDecision({ approved: status === 'approved', approval: structuredClone(approval) });
      } catch (error) { rejectDecision(error); throw error; }
    };
    const abort = () => { settle('cancelled').catch(() => {}); };
    const timer = setTimeout(() => { settle('expired').catch(() => {}); }, ttl);
    timer.unref?.();
    pending.set(approval.id, { approval, settle });
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await notify();
      if (signal?.aborted && approval.status === 'pending') await settle('cancelled');
      return await decision;
    } catch (error) { release(); rejectDecision(error); throw error; }
  }

  async function decide({ id, projectId, chatId, decision }) {
    if (!['approve', 'deny'].includes(decision)) throw fail(400, 'Choix de validation invalide.');
    const record = pending.get(id);
    if (!record || record.approval.projectId !== projectId || record.approval.chatId !== chatId) throw fail(404, 'Validation active introuvable dans cette conversation.');
    if (Date.now() >= record.approval.expiresAt) {
      await record.settle('expired');
      throw fail(409, 'Cette demande de validation a expiré.');
    }
    await record.settle(decision === 'approve' ? 'approved' : 'denied');
    return { id, status: record.approval.status };
  }
  return { request, decide };
}
