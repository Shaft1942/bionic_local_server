import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const fail = (status, message) => Object.assign(new Error(message), { status });
export const COMFY_WORKFLOW_IDS = Object.freeze(['krea2_turbo', 'hassaku_illustrious']);

/** Literal private addresses avoid DNS rebinding and accidental public services. */
export function localComfyURL(value = 'http://127.0.0.1:8188') {
  let url;
  try { url = new URL(value); } catch { throw fail(400, 'Adresse ComfyUI invalide.'); }
  const host = url.hostname, octets = host.split('.').map(Number);
  const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(host) && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
  const privateHost = ['localhost', '[::1]'].includes(host) || (ipv4 && (
    octets[0] === 127 || octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  ));
  if (url.protocol !== 'http:' || !privateHost || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw fail(400, 'ComfyUI doit utiliser une adresse HTTP locale ou IPv4 de réseau privé, sans identifiants ni chemin.');
  }
  return url.origin;
}

export function validateComfySettings(value, previous = { enabled: false, url: 'http://127.0.0.1:8188', workflowId: 'krea2_turbo' }) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['enabled', 'url', 'workflowId'].includes(key))) throw fail(400, 'Paramètres ComfyUI invalides.');
  const settings = { ...previous, ...value };
  if (typeof settings.enabled !== 'boolean') throw fail(400, 'Activation ComfyUI invalide.');
  settings.url = localComfyURL(settings.url);
  if (!COMFY_WORKFLOW_IDS.includes(settings.workflowId)) throw fail(400, 'Workflow ComfyUI inconnu.');
  return { enabled: settings.enabled, url: settings.url, workflowId: settings.workflowId };
}

export async function createComfySettings({ file, enabled = false, url, workflowId = 'krea2_turbo' }) {
  let writes = Promise.resolve();
  let settings = { ...validateComfySettings({ enabled, url: url ?? 'http://127.0.0.1:8188', workflowId }), updatedAt: null };
  try {
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    if (saved.version !== 1) throw fail(400, 'Version des paramètres ComfyUI non reconnue.');
    settings = { ...validateComfySettings({ enabled: saved.enabled, url: saved.url, workflowId: saved.workflowId }), updatedAt: saved.updatedAt ?? null };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return {
    get() { return { ...settings }; },
    update(patch) {
      const operation = writes.then(async () => {
        const next = { ...validateComfySettings(patch, settings), updatedAt: Date.now() };
        await fs.mkdir(path.dirname(file), { recursive: true });
        const temporary = file + '.' + randomUUID() + '.tmp';
        try {
          await fs.writeFile(temporary, JSON.stringify({ version: 1, ...next }, null, 2));
          await fs.rename(temporary, file);
          settings = next;
          return { ...settings };
        } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      });
      writes = operation.catch(() => {});
      return operation;
    }
  };
}
