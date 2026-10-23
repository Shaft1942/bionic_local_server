import * as filesystem from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const exact = (value, fields) => object(value) && Object.keys(value).every(key => fields.includes(key));

// Reject links at every component, including a linked parent directory.
export async function launcherPath(value, { directory = false, fs = filesystem } = {}) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\0\r\n]/.test(value)) fail('INVALID_PATH');
  const resolved = path.resolve(value);
  let current = path.parse(resolved).root;
  for (const component of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) fail('LINK_NOT_ALLOWED');
  }
  const stat = await fs.stat(resolved);
  if (directory ? !stat.isDirectory() : !stat.isFile()) fail('INVALID_PATH_TYPE');
  return fs.realpath(resolved);
}

function endpoint(value) {
  let url;
  try { url = new URL(value); } catch { fail('INVALID_CONNECTION'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') fail('INVALID_CONNECTION');
  return { url: url.origin, port: Number(url.port || 80) };
}

export async function launcherFileIdentity(filename, { fs = filesystem } = {}) {
  const stat = await fs.stat(filename);
  return { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, ino: stat.ino, dev: stat.dev };
}

async function apiInfoPath(value, fs) {
  try { return await launcherPath(value, { fs }); }
  catch (error) {
    if (error.code !== 'ENOENT' || typeof value !== 'string' || !path.isAbsolute(value) || /[\0\r\n]/.test(value)) throw error;
    const parent = await launcherPath(path.dirname(value), { directory: true, fs });
    return path.join(parent, path.basename(value));
  }
}

export async function loadLocalServiceProfiles({ root, connections = {}, fs = filesystem } = {}) {
  const result = { bionic: null, comfyui: null, errors: {}, revision: 'disabled' };
  let local;
  try {
    const filename = path.join(root, 'config.launchers.local.json');
    await launcherPath(filename, { fs });
    local = JSON.parse(await fs.readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') result.errors.config = error.code === 'LINK_NOT_ALLOWED' ? error.code : 'INVALID_LAUNCHER_CONFIG';
    return result;
  }
  if (!exact(local, ['version', 'services']) || local.version !== 1 || !exact(local.services, ['bionic', 'comfyui'])) {
    result.errors.config = 'INVALID_LAUNCHER_CONFIG'; return result;
  }
  result.revision = createHash('sha256').update(JSON.stringify(local)).digest('hex');
  for (const id of ['bionic', 'comfyui']) {
    const raw = local.services[id];
    if (raw === undefined) continue;
    try {
      const fields = id === 'bionic' ? ['enabled', 'type', 'cliPath', 'apiInfoPath', 'appPath', 'exclusiveControl'] : ['enabled', 'type', 'pythonPath', 'entryPath', 'workingDirectory', 'exclusiveControl'];
      if (!exact(raw, fields) || typeof raw.enabled !== 'boolean') fail('INVALID_PROFILE');
      if (!raw.enabled) continue;
      if (raw.exclusiveControl !== true || raw.type !== (id === 'bionic' ? 'bionic-cli' : 'comfyui-python')) fail('INVALID_PROFILE');
      const connection = endpoint(id === 'bionic' ? connections.bionicUrl ?? connections.apiUrl : connections.comfyUrl);
      const profile = { id, type: raw.type, enabled: true, exclusiveControl: true, ...connection, startTimeoutMs: 15000, stopTimeoutMs: 15000 };
      if (id === 'bionic') {
        profile.cliPath = await launcherPath(raw.cliPath, { fs });
        profile.apiInfoPath = await apiInfoPath(raw.apiInfoPath, fs);
        profile.fileIdentity = { cliPath: await launcherFileIdentity(profile.cliPath, { fs }) };
        if (raw.appPath !== undefined) {
          profile.appPath = await launcherPath(raw.appPath, { fs });
          profile.fileIdentity.appPath = await launcherFileIdentity(profile.appPath, { fs });
        }
      } else {
        profile.pythonPath = await launcherPath(raw.pythonPath, { fs });
        profile.entryPath = await launcherPath(raw.entryPath, { fs });
        profile.workingDirectory = await launcherPath(raw.workingDirectory, { directory: true, fs });
        if (path.basename(profile.entryPath).toLowerCase() !== 'main.py' || path.dirname(profile.entryPath) !== profile.workingDirectory) fail('INVALID_COMFY_ENTRY');
        profile.fileIdentity = { pythonPath: await launcherFileIdentity(profile.pythonPath, { fs }), entryPath: await launcherFileIdentity(profile.entryPath, { fs }) };
      }
      profile.fingerprint = createHash('sha256').update(JSON.stringify(profile)).digest('hex');
      result[id] = Object.freeze(profile);
    } catch (error) {
      result.errors[id] = ['INVALID_PROFILE', 'INVALID_CONNECTION', 'INVALID_COMFY_ENTRY', 'LINK_NOT_ALLOWED', 'INVALID_PATH_TYPE', 'INVALID_PATH'].includes(error.code) ? error.code : 'PROFILE_PATH_UNAVAILABLE';
    }
  }
  return result;
}
