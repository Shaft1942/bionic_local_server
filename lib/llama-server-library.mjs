import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const privatePart = value => value.startsWith('.') || /^(?:data|runtime|private|secrets|credentials|certificates|logs|node_modules|blobs)$/i.test(value);
const projector = value => /(?:mmproj|projector|projection|vision-encoder|clip-vision)/i.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const identity = info => ({ dev: info.dev, ino: info.ino, size: info.size, mtimeMs: info.mtimeMs });
const sameIdentity = (left, right) => JSON.stringify(identity(left)) === JSON.stringify(identity(right));
function within(root, filename) { const relative = path.relative(root, filename); return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); }
async function noLinks(filename, directory = false) {
  const absolute = path.resolve(filename), parsed = path.parse(absolute); let cursor = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) { cursor = path.join(cursor, part); const info = await fs.lstat(cursor); if (info.isSymbolicLink()) throw fail(400, 'llama-library-link', 'Les liens ne sont pas autorisés dans la bibliothèque.'); }
  const info = await fs.lstat(absolute);
  if (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) throw fail(400, 'llama-library-file', 'Le chemin doit désigner un fichier ou dossier local ordinaire.');
  return info;
}

/** GGUF v2/v3 metadata only: at most 64 KiB, never tensor payloads. */
export function readGGUFHeader(bytes) {
  const result = { valid: false, version: null, architecture: '', name: '', metadataIncomplete: false };
  if (bytes.length < 24 || bytes.subarray(0, 4).toString() !== 'GGUF') return result;
  result.version = bytes.readUInt32LE(4);
  if (![2, 3].includes(result.version)) return result;
  const count = bytes.readBigUInt64LE(16); if (count > 100000n) return result;
  result.valid = true; let offset = 24;
  const need = size => { if (!Number.isSafeInteger(size) || size < 0 || offset + size > bytes.length) throw Error('bounded'); };
  const u32 = () => { need(4); const value = bytes.readUInt32LE(offset); offset += 4; return value; };
  const u64 = () => { need(8); const value = bytes.readBigUInt64LE(offset); offset += 8; if (value > 1000000n) throw Error('bounded'); return Number(value); };
  const string = () => { const length = u64(); need(length); const value = bytes.subarray(offset, offset + length).toString('utf8'); offset += length; return value; };
  function value(type, depth = 0) {
    if (depth > 1) throw Error('bounded');
    if (type === 8) return string();
    if (type === 9) { const itemType = u32(), length = u64(); if (length > 4096) throw Error('bounded'); for (let index = 0; index < length; index++) value(itemType, depth + 1); return null; }
    const size = ({ 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 })[type];
    if (!size) throw Error('type'); need(size); offset += size; return null;
  }
  try {
    for (let index = 0; index < Math.min(Number(count), 1024); index++) {
      const key = string(), item = value(u32());
      if (typeof item === 'string' && item.length <= 300) {
        if (key === 'general.architecture') result.architecture = item;
        if (key === 'general.name') result.name = item;
        if (key === 'general.type' && /projector|clip|vision/i.test(item)) result.projector = true;
      }
      if (result.architecture && result.name) break;
    }
    if (count > 1024n) result.metadataIncomplete = true;
  } catch { result.metadataIncomplete = true; }
  if (/^(?:clip|vision|projector|siglip)$/i.test(result.architecture)) result.projector = true;
  return result;
}

// Read exact metadata fields, not a prefix that might already contain tensors
// in a small GGUF. Lengths may advance the cursor without reading their values.
export async function readGGUFMetadata(handle, limit = 65536) {
  let offset = 0;
  async function bytes(length) { if (!Number.isSafeInteger(length) || length < 0 || offset + length > limit) throw Error('bounded'); const buffer = Buffer.alloc(length); const value = await handle.read(buffer, 0, length, offset); if (value.bytesRead !== length) throw Error('truncated'); offset += length; return buffer; }
  let header;
  try { header = await bytes(24); } catch { return readGGUFHeader(Buffer.alloc(0)); }
  const result = readGGUFHeader(header);
  if (!result.valid) return result;
  result.metadataIncomplete = false;
  const count = header.readBigUInt64LE(16);
  const u32 = async () => (await bytes(4)).readUInt32LE();
  const u64 = async () => { const value = (await bytes(8)).readBigUInt64LE(); if (value > 1000000n) throw Error('bounded'); return Number(value); };
  const skip = length => { if (offset + length > limit) throw Error('bounded'); offset += length; };
  async function string(read = false) { const length = await u64(); if (!read || length > 1000) { skip(length); return ''; } return (await bytes(length)).toString('utf8'); }
  async function value(type, wanted, depth = 0) {
    if (depth > 1) throw Error('bounded');
    if (type === 8) return string(wanted);
    if (type === 9) { const itemType = await u32(), length = await u64(); if (length > 4096) throw Error('bounded'); for (let index = 0; index < length; index++) await value(itemType, false, depth + 1); return ''; }
    const length = ({ 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 })[type]; if (!length) throw Error('type'); skip(length); return '';
  }
  try {
    for (let index = 0; index < Math.min(Number(count), 1024); index++) {
      const key = await string(true), item = await value(await u32(), ['general.architecture', 'general.name', 'general.type'].includes(key));
      if (key === 'general.architecture') result.architecture = item;
      if (key === 'general.name') result.name = item;
      if (key === 'general.type' && /projector|clip|vision/i.test(item)) result.projector = true;
      if (result.architecture && result.name) break;
    }
    if (count > 1024n) result.metadataIncomplete = true;
  } catch { result.metadataIncomplete = true; }
  if (/^(?:clip|vision|projector|siglip)$/i.test(result.architecture)) result.projector = true;
  return result;
}

/** Allowed roots are PC configuration, never supplied by an untrusted request. */
export function createLlamaServerLibrary({ defaultDirectory = process.platform === 'win32' ? 'E:/AI/Models' : path.join(os.homedir(), 'Models'), allowedDirectories = [defaultDirectory], maxEntries = 2000, maxModels = 200, maxDepth = 5, headerBytes = 65536 } = {}) {
  headerBytes = Math.min(65536, Math.max(24, headerBytes));
  const allowed = allowedDirectories.map(value => path.resolve(value));
  function directoryPath(value = defaultDirectory) {
    if (typeof value !== 'string' || value.length > 1000 || /[\x00-\x1f]/.test(value) || !path.isAbsolute(value)) throw fail(400, 'llama-library-directory', 'Choisis un dossier absolu autorisé sur le PC.');
    const directory = path.resolve(value);
    if (!allowed.some(root => within(root, directory)) || path.relative(allowed.find(root => within(root, directory)), directory).split(path.sep).some(privatePart)) throw fail(403, 'llama-library-outside', 'Ce dossier ne fait pas partie de la bibliothèque autorisée sur le PC.');
    return directory;
  }
  async function inventory(value = defaultDirectory) {
    const directory = directoryPath(value); await noLinks(directory, true);
    const models = []; let entries = 0, excludedProjectors = 0, excludedLinks = 0, truncated = false;
    async function walk(current, depth) {
      if (depth > maxDepth) { truncated = true; return; }
      const iterator = await fs.opendir(current);
      for await (const item of iterator) {
        if (++entries > maxEntries || models.length >= maxModels) { truncated = true; break; }
        if (privatePart(item.name)) continue;
        if (item.isSymbolicLink()) { excludedLinks++; continue; }
        const filename = path.join(current, item.name), relativePath = path.relative(directory, filename).split(path.sep).join('/');
        try {
          if (item.isDirectory()) { await noLinks(filename, true); await walk(filename, depth + 1); }
          else if (item.isFile() && /\.gguf$/i.test(item.name)) {
            if (projector(item.name)) { excludedProjectors++; continue; }
            const before = await noLinks(filename), handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)); let metadata;
            try { const opened = await handle.stat(); if (!sameIdentity(before, opened)) throw Error('changed'); metadata = await readGGUFMetadata(handle, Math.min(headerBytes, opened.size)); if (!sameIdentity(before, await handle.stat())) throw Error('changed'); } finally { await handle.close(); }
            if (metadata.projector) { excludedProjectors++; continue; }
            const splitPart = /-\d{5}-of-\d{5}\.gguf$/i.test(item.name);
            models.push({ id: hash(relativePath), name: item.name.replace(/\.gguf$/i, ''), metadataName: metadata.name, relativePath, size: before.size, architecture: metadata.architecture, ggufVersion: metadata.version, metadataIncomplete: metadata.metadataIncomplete, compatibility: metadata.valid && !splitPart ? 'unverified' : 'unsupported', selectable: metadata.valid && !splitPart, reason: !metadata.valid ? 'gguf-header-unsupported' : splitPart ? 'split-model-not-supported' : 'runtime-compatibility-unverified', fileIdentity: identity(before) });
          }
        } catch { /* A disappearing, unreadable or linked entry cannot become a launch target. */ }
        if (entries > maxEntries || models.length >= maxModels) { truncated = true; break; }
      }
    }
    await walk(directory, 0); models.sort((left, right) => left.name.localeCompare(right.name));
    return { directory, allowedDirectories: [...allowed], models, entries, excludedProjectors, excludedLinks, truncated, maxEntries, maxModels, maxDepth, maxHeaderBytes: headerBytes, noWeightsRead: true, compatibilityGuaranteed: false };
  }
  async function resolveModel({ directory = defaultDirectory, modelId }) {
    if (typeof modelId !== 'string' || !/^[0-9a-f]{64}$/.test(modelId)) throw fail(400, 'llama-model-id', 'Choisis un modèle dans le catalogue.');
    const catalogue = await inventory(directory), model = catalogue.models.find(item => item.id === modelId);
    if (!model || !model.selectable) throw fail(409, 'llama-model-unavailable', 'Ce GGUF est absent, incomplet ou non pris en charge par ce profil.');
    const filename = path.resolve(catalogue.directory, ...model.relativePath.split('/'));
    if (!within(catalogue.directory, filename)) throw fail(403, 'llama-library-outside', 'Modèle hors bibliothèque.');
    const info = await noLinks(filename);
    if (JSON.stringify(identity(info)) !== JSON.stringify(model.fileIdentity)) throw fail(409, 'llama-model-changed', 'Le modèle a changé. Actualise le catalogue.');
    return { ...model, filename };
  }
  return { inventory, resolveModel, directoryPath, defaultDirectory, allowedDirectories: [...allowed] };
}

export async function validateLlamaServerBinary(filename) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename) || !/^llama-server(?:\.exe)?$/i.test(path.basename(filename)) || /[\x00-\x1f]/.test(filename)) throw fail(400, 'llama-binary-invalid', 'Choisis le binaire llama-server installé sur le PC.');
  const absolute = path.resolve(filename), info = await noLinks(absolute);
  return { filename: absolute, identity: identity(info) };
}
