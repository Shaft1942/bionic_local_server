/** Contracts for request tracking only. Other companion APIs remain outside this boundary. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export const statuses = ['starting', 'queued', 'running', 'done', 'complete', 'completed', 'error', 'failed', 'stopped', 'cancelled', 'interrupted', 'deleted'] as const;
export type RequestStatus = typeof statuses[number];
export type Job = { requestId: string; projectId: string; id?: string; draftNonce?: string; status: RequestStatus; phase?: string; disconnected?: boolean };
export type RequestReceipt = { id?: string | null; projectId?: string; status: RequestStatus; phase?: string; message?: string };
export type ChatPayload = { requestId: string; projectId: string; text: string; sessionId: string | null; model: string; [key: string]: unknown };
type EventFields = {
  id?: string; requestId?: string; replyId?: string; name?: string; phase?: string;
  model?: string; provider?: JsonObject; outputBudget?: JsonObject; contextReceipt?: JsonObject;
  metrics?: JsonObject; finishedAt?: number; outcome?: string; limited?: boolean; truncated?: boolean; finishReason?: string | null;
};
export type ChatEvent = EventFields & (
  { type: 'start'; id: string; replyId: string } | { type: 'queued'; id: string } |
  { type: 'delta'; text: string } | { type: 'action'; action: JsonObject } |
  { type: 'approval'; approval: JsonObject & { id: string } } |
  { type: 'error' | 'capability'; message: string } | { type: 'done' | 'context' | 'action-start' }
);
export class ContractError extends Error {
  constructor() { super('Réponse de suivi invalide. Vérifie la demande sur le serveur.'); this.name = 'ContractError'; }
}
export function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
const string = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const status = (value: unknown): value is RequestStatus => statuses.some(item => item === value);
const requestId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{16,100}$/.test(value);
function json(value: unknown, depth = 0): value is Json {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => json(item, depth + 1));
  return object(value) && Object.values(value).every(item => json(item, depth + 1));
}
export function parseEvent(value: unknown): ChatEvent {
  if (!object(value) || !json(value)) throw new ContractError();
  for (const key of ['id', 'requestId', 'replyId', 'name', 'phase', 'model', 'outcome']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw new ContractError();
  }
  if (value.finishReason !== undefined && value.finishReason !== null && typeof value.finishReason !== 'string') throw new ContractError();
  for (const key of ['provider', 'outputBudget', 'contextReceipt', 'metrics']) {
    if (value[key] !== undefined && !object(value[key])) throw new ContractError();
  }
  if (value.finishedAt !== undefined && (typeof value.finishedAt !== 'number' || !Number.isFinite(value.finishedAt))) throw new ContractError();
  for (const key of ['limited', 'truncated']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new ContractError();
  switch (value.type) {
    case 'start': if (!string(value.id) || !string(value.replyId)) throw new ContractError(); break;
    case 'queued': if (!string(value.id)) throw new ContractError(); break;
    case 'delta': if (typeof value.text !== 'string') throw new ContractError(); break;
    case 'action': if (!object(value.action)) throw new ContractError(); break;
    case 'approval': if (!object(value.approval) || !string(value.approval.id)) throw new ContractError(); break;
    case 'error': case 'capability': if (typeof value.message !== 'string') throw new ContractError(); break;
    case 'done': case 'context': case 'action-start': break;
    default: throw new ContractError();
  }
  return value as ChatEvent;
}
export function parseReceipt(value: unknown, projectId: string): RequestReceipt {
  if (!object(value) || !status(value.status) || value.projectId !== undefined && value.projectId !== projectId) throw new ContractError();
  if (value.id !== undefined && value.id !== null && !string(value.id)) throw new ContractError();
  for (const key of ['phase', 'message']) if (value[key] !== undefined && typeof value[key] !== 'string') throw new ContractError();
  return { id: value.id as string | null | undefined, projectId, status: value.status, phase: value.phase as string | undefined, message: value.message as string | undefined };
}
/** Local storage is untrusted; omit invalid entries and deduplicate before they can lock a composer. */
export function restoreJobs(value: unknown): Job[] {
  if (!Array.isArray(value)) return [];
  const result: Job[] = [];
  for (const item of value) {
    if (!object(item) || !requestId(item.requestId) || !string(item.projectId) || !status(item.status)) continue;
    if (item.id !== undefined && !string(item.id) || item.draftNonce !== undefined && !string(item.draftNonce) || item.phase !== undefined && typeof item.phase !== 'string' || item.disconnected !== undefined && typeof item.disconnected !== 'boolean') continue;
    if (!result.some(known => known.requestId === item.requestId)) result.push({ requestId: item.requestId, projectId: item.projectId, status: item.status, ...(item.id ? { id: item.id as string } : {}), ...(item.draftNonce ? { draftNonce: item.draftNonce as string } : {}), ...(item.phase ? { phase: item.phase as string } : {}), disconnected: true });
  }
  return result;
}
