export type Request = (route: string, options?: RequestInit) => Promise<any>;
export const post = (request: Request, route: string, value: unknown, headers: Record<string,string> = {}) => request(route, { method: 'POST', headers, body: JSON.stringify(value), signal: AbortSignal.timeout(60000) });
export function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export const message = (error: any) => error?.message || 'Connexion indisponible / Connection unavailable';
