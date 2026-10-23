import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
const versionOnly = value => /^v?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(String(value)) ? String(value) : 'unknown';
const schemaCodes = new Set(['NATIVE_SCHEMA_OK','NATIVE_SCHEMA_MISMATCH','NO_REGISTERED_PROJECT']);
async function pythonCheck(command) {
  return new Promise(resolve => { let settled = false; const done = code => { if (!settled) { settled = true; resolve(code); } }; try { const child = spawn(command, ['--version'], { windowsHide: true, shell: false, stdio: 'ignore', timeout: 3000 }); child.on('error', () => done('PYTHON_UNAVAILABLE')); child.on('close', code => done(code === 0 ? 'PYTHON_OK' : 'PYTHON_UNAVAILABLE')); } catch { done('PYTHON_UNAVAILABLE'); } });
}
export async function runDiagnostics({ settings, nativeStore, fetchImpl = fetch, headers = () => ({}), version = '1.8.0', nodeVersion = process.version, checkPython = pythonCheck, checkCompanionTransport, now = () => performance.now() } = {}) {
  const checks = [], correlationId = randomUUID();
  async function check(name, work) { const start = now(); let result; try { result = await work(); } catch { result = { status: 'error', code: 'CHECK_FAILED' }; } checks.push({ name, status: result.status, code: result.code, durationMs: Math.max(0, Math.round(now() - start)), correlationId }); }
  await check('node', async () => ({ status: Number(String(nodeVersion).replace(/^v/,'').split('.')[0]) >= 24 ? 'ok' : 'error', code: Number(String(nodeVersion).replace(/^v/,'').split('.')[0]) >= 24 ? 'NODE_OK' : 'NODE_UNSUPPORTED' }));
  let payload;
  const llama = settings.inferenceProvider === 'llamacpp';
  const modelURL = llama ? settings.llamaUrl + '/v1/models' : settings.apiUrl + '/api/v1/models';
  await check('api-http-auth', async () => { try { const response = await fetchImpl(modelURL, { headers: headers(), signal: AbortSignal.timeout(7000), ...(llama ? { redirect: 'error' } : {}) }); if (!response.ok) { await response.body?.cancel(); return { status: 'error', code: response.status === 401 || response.status === 403 ? 'API_AUTH_REFUSED' : 'API_HTTP_ERROR' }; } payload = await response.json().catch(() => null); return { status: 'ok', code: 'API_HTTP_OK' }; } catch (e) { return { status: 'error', code: ['TimeoutError','AbortError'].includes(e.name) ? 'API_TIMEOUT' : 'API_UNREACHABLE' }; } });
  await check('models-schema', async () => { if (payload === undefined) return { status: 'unknown', code: 'MODELS_NOT_CHECKED' }; if (llama) { if (!Array.isArray(payload?.data) || payload.data.length > 1 || payload.data.some(m => typeof m?.id !== 'string' || !m.id.trim())) return { status: 'error', code: 'MODELS_SCHEMA_INVALID' }; return { status: 'unknown', code: 'TOOL_CAPABILITIES_UNKNOWN' }; } if (!payload || !Array.isArray(payload.models) || payload.models.some(m => !m || typeof m.key !== 'string' || typeof m.type !== 'string')) return { status: 'error', code: 'MODELS_SCHEMA_INVALID' }; const known = payload.models.filter(m => m.type === 'llm').every(m => typeof m.capabilities?.trained_for_tool_use === 'boolean'); return { status: known ? 'ok' : 'unknown', code: known ? 'MODELS_SCHEMA_OK' : 'TOOL_CAPABILITIES_UNKNOWN' }; });
  await check('native-schema', async () => { if (!nativeStore?.diagnosticSchema) return { status: 'unknown', code: 'NATIVE_NOT_CHECKED' }; try { const result = await nativeStore.diagnosticSchema(); return schemaCodes.has(result?.code) && ['ok','error','unknown'].includes(result.status) ? { status: result.status, code: result.code } : { status: 'unknown', code: 'NATIVE_NOT_CHECKED' }; } catch { return { status: 'error', code: 'NATIVE_UNAVAILABLE' }; } });
  await check('python-optional', async () => { const code = await checkPython(settings.python); return { status: code === 'PYTHON_OK' ? 'ok' : 'unknown', code: code === 'PYTHON_OK' ? code : 'PYTHON_UNAVAILABLE' }; });
  if (checkCompanionTransport) await check('companion-transport', async () => { const result = await checkCompanionTransport(); return ['COMPANION_HTTP_OK','COMPANION_HTTPS_OK','COMPANION_MTLS_OK'].includes(result?.code) ? {status:'ok',code:result.code} : {status:'unknown',code:'COMPANION_TRANSPORT_NOT_CONFIRMED'}; });
  // Constructed allowlist: never include settings, exceptions, API records or paths.
  return { version: versionOnly(version), nodeVersion: versionOnly(nodeVersion), checks };
}
