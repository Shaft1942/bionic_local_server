import { ContractError, object, parseEvent } from './client/contracts.js';
import type { ChatEvent, ChatPayload } from './client/contracts.js';
/** Same-origin companion transport. Inference and tools never run in this browser. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function request(route: string, options: RequestInit = {}): Promise<any> {
  if (!route.startsWith('/api/')) throw new Error('Route compagnon invalide.');
  const headers = new Headers(options.headers);
  if (typeof options.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(route, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, result.error || `Le compagnon répond HTTP ${response.status}.`);
  return result;
}

export const post = (route: string, value: unknown) => request(route, { method: 'POST', body: JSON.stringify(value) });
export const query = (route: string, values: Record<string, string>) => route + '?' + new URLSearchParams(values);
export const terminal = (status: string) => ['done', 'complete', 'completed', 'error', 'failed', 'stopped', 'cancelled', 'interrupted', 'deleted'].includes(status);

export function newRequestId(): string {
  // crypto.randomUUID requires a secure context; getRandomValues also works on a LAN HTTP URL.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function sendStream(payload: ChatPayload, signal: AbortSignal, onEvent: (event: ChatEvent) => void): Promise<void> {
  const response = await fetch('/api/chat', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal
  });
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => ({}));
    throw new ApiError(response.status, object(result) && typeof result.error === 'string' ? result.error : `Envoi HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error('Le flux est indisponible. Vérifie la demande sur le serveur.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (line: string) => {
    if (line.length > 1048576) throw new ContractError();
    if (line.trim()) {
      let value: unknown;
      try { value = JSON.parse(line); } catch { throw new ContractError(); }
      onEvent(parseEvent(value));
    }
  };
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) consume(line);
      if (buffer.length > 1048576) throw new ContractError();
    }
    buffer += decoder.decode(); consume(buffer);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
