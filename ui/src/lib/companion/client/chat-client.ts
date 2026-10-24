import { ApiError, post, query, request, sendStream, terminal } from '../api.js';
import { ContractError, object, parseReceipt, restoreJobs } from './contracts.js';
import type { ChatEvent, ChatPayload, Job, RequestReceipt } from './contracts.js';

type Transport = {
  lookup: (job: Job) => Promise<unknown>;
  send: (payload: ChatPayload, signal: AbortSignal, receive: (event: ChatEvent) => void) => Promise<void>;
  cancel: (job: Job) => Promise<unknown>;
};
type Observer = {
  changed: (jobs: Job[], streamingIds: string[]) => void;
  receipt: (job: Job, receipt: RequestReceipt, settled: boolean) => Promise<void>;
  failure: (failure: unknown, job: Job) => void;
};
export type SendResult = { kind: 'finished' } | { kind: 'rejected' | 'uncertain'; failure: unknown };
const transport: Transport = {
  lookup: job => request(query('/api/chat-request', { projectId: job.projectId, requestId: job.requestId })),
  send: sendStream,
  cancel: job => post('/api/cancel', { projectId: job.projectId, id: job.id, requestId: job.requestId })
};

/** Application request lifecycle, independent of Svelte, storage and the selected conversation. */
export function createChatClient(observer: Observer, io: Transport = transport) {
  let jobs: Job[] = [], recovering = false;
  const controllers = new Map<string, AbortController>(), texts = new Map<string, string>(), sent = new Set<string>();
  const publish = () => observer.changed(jobs.map(job => ({ ...job })), [...controllers.keys()]);
  const update = (id: string, patch: Partial<Job>) => { jobs = jobs.map(job => job.requestId === id ? { ...job, ...patch } : job); publish(); };
  const remove = (id: string) => { jobs = jobs.filter(job => job.requestId !== id); publish(); };
  async function lookup(job: Job) { return parseReceipt(await io.lookup({ ...job }), job.projectId); }
  return {
    restore(value: unknown) { jobs = restoreJobs(value); for (const job of jobs) sent.add(job.requestId); publish(); },
    track(job: Job) { if (!jobs.some(item => item.requestId === job.requestId)) { jobs = [...jobs, { ...job }]; publish(); } },
    remove,
    remember(value: unknown, projectId: string) {
      if (!object(value) || typeof value.id !== 'string') return;
      const candidates = [value.generation, ...(Array.isArray(value.queue) ? value.queue : [])];
      for (const active of candidates) {
        const [job] = restoreJobs([{ ...(object(active) ? active : {}), projectId, id: value.id }]);
        if (job && !terminal(job.status)) this.track(job);
      }
    },
    text(requestId: string): string | undefined { return texts.get(requestId); },
    async send(payload: ChatPayload, receive: (event: ChatEvent, previous: Job) => void): Promise<SendResult> {
      const job = jobs.find(item => item.requestId === payload.requestId);
      if (!job || sent.has(job.requestId)) throw new Error('Request must be tracked once before sending.');
      sent.add(job.requestId);
      const controller = new AbortController(); controllers.set(job.requestId, controller); texts.set(job.requestId, ''); publish();
      try {
        await io.send(payload, controller.signal, event => {
          if (event.requestId !== undefined && event.requestId !== job.requestId) throw new ContractError();
          const current = jobs.find(item => item.requestId === job.requestId);
          if (!current) return;
          // A native conversation can become a web continuation at admission.
          // Once bound, later events must keep that conversation identity.
          if (event.type !== 'start' && event.type !== 'queued' && event.id && current.id && event.id !== current.id) throw new ContractError();
          if (event.type === 'delta') texts.set(job.requestId, (texts.get(job.requestId) || '') + event.text);
          if (event.type === 'start' || event.type === 'queued') update(job.requestId, { id: event.id, status: event.type === 'queued' ? 'queued' : 'running', phase: event.phase });
          receive(event, { ...current });
        });
        return { kind: 'finished' };
      } catch (failure) {
        let rejected = failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && ![408, 409].includes(failure.status);
        if (failure instanceof ApiError && failure.status === 409) {
          try { const receipt = await lookup(job); update(job.requestId, { id: receipt.id || job.id, status: receipt.status }); }
          catch (check) { if (check instanceof ApiError && check.status === 404) rejected = true; }
        }
        if (rejected) remove(job.requestId); else update(job.requestId, { disconnected: true });
        return { kind: rejected ? 'rejected' : 'uncertain', failure };
      } finally { controllers.delete(job.requestId); texts.delete(job.requestId); publish(); }
    },
    async recover(includeStreaming = false) {
      if (recovering) return; recovering = true;
      try {
        for (const target of [...jobs]) {
          if (!includeStreaming && controllers.has(target.requestId)) continue;
          try {
            const receipt = await lookup(target);
            if (!jobs.some(item => item.requestId === target.requestId)) continue;
            update(target.requestId, { id: receipt.id || target.id, status: receipt.status, phase: receipt.phase, disconnected: false });
            const settled = terminal(receipt.status) && !controllers.has(target.requestId);
            // A canonical snapshot must be applied successfully before dropping the recovery handle.
            await observer.receipt({ ...target }, receipt, settled);
            if (settled) remove(target.requestId);
          } catch (failure) { update(target.requestId, { disconnected: true }); observer.failure(failure, { ...target }); }
        }
      } finally { recovering = false; }
    },
    async cancel(job: Job) { if (job.id) await io.cancel({ ...job }); },
    detach(requestId: string) { update(requestId, { disconnected: true }); controllers.get(requestId)?.abort(); },
    disconnect() { for (const controller of controllers.values()) controller.abort(); }
  };
}
