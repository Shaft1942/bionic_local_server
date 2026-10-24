export type MessageImage = {
  id: string; status?: string; prompt?: string; error?: string; updatedAt?: number;
  workflowId?: string; workflowLabel?: string; width?: number; height?: number; seed?: number;
  seriesIndex?: number; seriesTotal?: number; queuePosition?: number;
  image?: { width?: number; height?: number; [key: string]: unknown };
  [key: string]: unknown;
};

const pending = new Set(['waiting-resource', 'submitting', 'queued', 'running']);
const terminal = new Set(['succeeded', 'failed', 'error', 'unknown', 'cancelled', 'canceled', 'stopped']);
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const valid = (value: unknown): value is MessageImage => record(value) && typeof value.id === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value.id);

/** Merge tool receipts and persisted jobs by identity without regressing a newer result. */
export function mergeMessageImages(...groups: unknown[]): MessageImage[] {
  const result = new Map<string, MessageImage>();
  for (const group of groups) for (const next of Array.isArray(group) ? group : []) {
    if (!valid(next)) continue;
    const previous = result.get(next.id);
    if (!previous) { result.set(next.id, { ...next }); continue; }
    const older = typeof previous.updatedAt === 'number' && typeof next.updatedAt === 'number' && next.updatedAt < previous.updatedAt;
    const regressed = terminal.has(previous.status || '') && pending.has(next.status || '') && !(typeof next.updatedAt === 'number' && typeof previous.updatedAt === 'number' && next.updatedAt > previous.updatedAt);
    result.set(next.id, older || regressed ? { ...next, ...previous } : { ...previous, ...next });
  }
  return [...result.values()];
}

/** Persisted imageGenerations are authoritative; actions also arrive during streaming. */
export function collectMessageImages(message: unknown): MessageImage[] {
  if (!record(message)) return [];
  const receipts: unknown[] = [];
  for (const action of Array.isArray(message.actions) ? message.actions : []) {
    if (!record(action)) continue;
    receipts.push(action.imageGenerations, action.imageGeneration ? [action.imageGeneration] : []);
  }
  return mergeMessageImages(...receipts, message.imageGenerations);
}

export const messageImagePending = (image: MessageImage) => pending.has(image.status || '') || image.status === 'succeeded' && !image.image;
export const messageImageReady = (image: MessageImage) => image.status === 'succeeded' && !!image.image;

/** Only the companion's owner-checked route is used, never a URL supplied by a model. */
export function messageImageRoute(owner: { projectId: string; chatId: string; messageId: string }, jobId: string, operation: 'image' | 'generation' = 'image', download = false): string {
  return '/api/comfy/' + operation + '?' + new URLSearchParams({ projectId: owner.projectId, chatId: owner.chatId, messageId: owner.messageId, jobId, ...(download ? { download: '1' } : {}) });
}
