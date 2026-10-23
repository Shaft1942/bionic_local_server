import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { localComfyURL, COMFY_WORKFLOW_IDS } from './comfy-settings.mjs';

const invalid = field => new Error(`Configuration invalide : ${field}. Consulte config.example.json et docs/configuration.md.`);
export async function loadSettings({ root, env = process.env, home = os.homedir(), platform = process.platform } = {}) {
  let local = {};
  try { local = JSON.parse(await readFile(path.join(root, 'config.local.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw invalid('config.local.json'); }
  if (!local || typeof local !== 'object' || Array.isArray(local)) throw invalid('config.local.json');
  const fields = new Set(['port', 'certificateProofPort', 'apiUrl', 'inferenceProvider', 'llamaUrl', 'uiMode', 'bionicRoot', 'python', 'extraRoots', 'maxConcurrentInferences', 'resourcePolicy', 'shutdownTimeoutMs', 'requestTimeoutMs', 'comfyUrl', 'comfyEnabled', 'comfyWorkflowId']);
  if (Object.keys(local).some(field => !fields.has(field))) throw invalid('champ inconnu');
  const port = Number(env.BIONIC_MOBILE_PORT ?? local.port ?? 8769);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw invalid('port');
  const certificateProofPort = Number(env.BIONIC_MOBILE_CERTIFICATE_PROOF_PORT ?? local.certificateProofPort ?? (port < 65535 ? port + 1 : port - 1));
  if (!Number.isInteger(certificateProofPort) || certificateProofPort < 1 || certificateProofPort > 65535 || certificateProofPort === port) throw invalid('certificateProofPort (port distinct entre 1 et 65535)');
  let api;
  try { api = new URL(env.BIONIC_API_URL ?? local.apiUrl ?? 'http://127.0.0.1:1235'); } catch { throw invalid('apiUrl'); }
  if (api.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname) || api.username || api.password || api.search || api.hash || !['', '/'].includes(api.pathname)) throw invalid('apiUrl (HTTP en boucle locale, sans /v1)');
  const inferenceProvider = env.BIONIC_MOBILE_INFERENCE_PROVIDER ?? local.inferenceProvider ?? 'bionic';
  if (!['bionic', 'llamacpp'].includes(inferenceProvider)) throw invalid('inferenceProvider');
  const uiMode = env.BIONIC_MOBILE_UI_MODE ?? local.uiMode ?? 'legacy';
  if (!['legacy', 'llama'].includes(uiMode)) throw invalid('uiMode');
  let llama;
  try { llama = new URL(env.BIONIC_LLAMA_URL ?? local.llamaUrl ?? 'http://127.0.0.1:1236'); } catch { throw invalid('llamaUrl'); }
  if (llama.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(llama.hostname) || llama.username || llama.password || llama.search || llama.hash || !['', '/'].includes(llama.pathname)) throw invalid('llamaUrl (HTTP en boucle locale, sans /v1)');
  if (inferenceProvider === 'llamacpp' && (llama.port || '80') === (api.port || '80')) throw invalid('llamaUrl (port distinct de Bionic)');
  const bionicRoot = env.BIONIC_MOBILE_BIONIC_ROOT || local.bionicRoot || path.join(home, '.lmstudio', 'apps', 'bionic');
  if (typeof bionicRoot !== 'string' || !path.isAbsolute(bionicRoot)) throw invalid('bionicRoot');
  let extraRoots = local.extraRoots ?? [];
  if (env.BIONIC_MOBILE_EXTRA_ROOTS !== undefined) { try { extraRoots = JSON.parse(env.BIONIC_MOBILE_EXTRA_ROOTS); } catch { throw invalid('BIONIC_MOBILE_EXTRA_ROOTS'); } }
  if (!Array.isArray(extraRoots) || extraRoots.length > 20) throw invalid('extraRoots');
  const ids = new Set(['project']);
  extraRoots = extraRoots.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[\w-]{1,64}$/.test(item.id) || item.id.startsWith('linked-') || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100 || typeof item.path !== 'string' || !path.isAbsolute(item.path) || (item.writable !== undefined && typeof item.writable !== 'boolean')) throw invalid('extraRoots');
    ids.add(item.id);
    return { id: item.id, name: item.name.trim(), path: item.path, writable: item.writable === true };
  });
  const python = env.BIONIC_MOBILE_PYTHON || local.python || (platform === 'win32' ? 'python' : 'python3');
  if (typeof python !== 'string' || python.includes('\0')) throw invalid('python');
  const registryPath = env.BIONIC_MOBILE_PROJECT_REGISTRY || path.join(bionicRoot, '.internal', 'projects-registry.json');
  if (!path.isAbsolute(registryPath)) throw invalid('BIONIC_MOBILE_PROJECT_REGISTRY');
  const maxConcurrentInferences = Number(env.BIONIC_MOBILE_MAX_INFERENCES ?? local.maxConcurrentInferences ?? 0);
  if (!Number.isSafeInteger(maxConcurrentInferences) || maxConcurrentInferences < 0 || maxConcurrentInferences > 32) throw invalid('maxConcurrentInferences');
  const resourcePolicy = env.BIONIC_MOBILE_RESOURCE_POLICY ?? local.resourcePolicy ?? 'exclusive';
  if (!['exclusive', 'independent'].includes(resourcePolicy)) throw invalid('resourcePolicy');
  const shutdownTimeoutMs = Number(env.BIONIC_MOBILE_SHUTDOWN_TIMEOUT_MS ?? local.shutdownTimeoutMs ?? 15000);
  if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 100 || shutdownTimeoutMs > 120000) throw invalid('shutdownTimeoutMs');
  const requestTimeoutMs = Number(env.BIONIC_MOBILE_REQUEST_TIMEOUT_MS ?? local.requestTimeoutMs ?? 180000);
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 30000 || requestTimeoutMs > 1800000) throw invalid('requestTimeoutMs');
  const comfyUrl = localComfyURL(env.BIONIC_COMFY_URL ?? local.comfyUrl ?? 'http://127.0.0.1:8188');
  let comfyEnabled = local.comfyEnabled ?? true;
  if (env.BIONIC_COMFY_ENABLED !== undefined) {
    if (!['true','false','1','0'].includes(env.BIONIC_COMFY_ENABLED)) throw invalid('BIONIC_COMFY_ENABLED');
    comfyEnabled = ['true','1'].includes(env.BIONIC_COMFY_ENABLED);
  }
  if (typeof comfyEnabled !== 'boolean') throw invalid('comfyEnabled');
  const comfyWorkflowId = env.BIONIC_COMFY_WORKFLOW_ID ?? local.comfyWorkflowId ?? 'krea2_turbo';
  if (!COMFY_WORKFLOW_IDS.includes(comfyWorkflowId)) throw invalid('comfyWorkflowId');
  if (inferenceProvider === 'llamacpp' && [port, certificateProofPort, Number(new URL(comfyUrl).port || 80)].includes(Number(llama.port || 80))) throw invalid('llamaUrl (port distinct du compagnon et de ComfyUI)');
  return Object.freeze({ comfyUrl, comfyEnabled, comfyWorkflowId, port, certificateProofPort, apiUrl: api.origin, inferenceProvider, llamaUrl: llama.origin, uiMode, bionicRoot: path.resolve(bionicRoot), registryPath, extraRoots, python, maxConcurrentInferences, resourcePolicy, shutdownTimeoutMs, requestTimeoutMs });
}
