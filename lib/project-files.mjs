import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEXT = new Set('txt md markdown json jsonl csv tsv yaml yml toml ini cfg conf log xml html htm svg css scss js mjs cjs ts tsx jsx py ps1 psm1 cmd bat sh sql r c h cpp hpp java rs go rb php vue svelte tex bib'.split(' '));
const DOCUMENT = new Set(['pdf', 'docx', 'xlsx']);
const IMAGE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const HIDDEN = /^(?:\.(?:internal|git|svn|hg|aws|ssh|azure|codex|env(?:\..*)?|bionic-mobile-.*)|node_modules|__pycache__|\.venv|credentials|secrets?)(?:$|\.)/i;
const SECRET = /(?:^id_(?:rsa|ed25519)$|\.(?:pem|key|pfx|p12|sqlite(?:-wal|-shm)?|db|lnk)$)/i;
const RESERVED = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
const MAX_TEXT = 1_000_000, MAX_DOCUMENT = 20_000_000, MAX_DOWNLOAD = 64_000_000;
const error = (status, message) => Object.assign(new Error(message), { status });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (parent, child) => { const r = path.relative(parent, child); return r === '' || (!path.isAbsolute(r) && r !== '..' && !r.startsWith('..' + path.sep)); };
function relativePath(value, allowEmpty = true) {
  if (typeof value !== 'string' || value.length > 1600 || /[\x00-\x1f\\:]/.test(value) || path.posix.isAbsolute(value)) throw error(400, 'Chemin de fichier invalide.');
  if (value === '' && allowEmpty) return '';
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /[<>"|?*]/.test(part) || RESERVED.test(part) || HIDDEN.test(part) || SECRET.test(part))) throw error(403, 'Ce fichier ne peut pas être ouvert dans le compagnon.');
  return parts.join('/');
}
function decode(bytes) {
  let encoding = 'utf-8', bom = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bom = 3;
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = 'utf-16le'; bom = 2; }
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = 'utf-16be'; bom = 2; }
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(bom));
    if (text.includes('\0')) return null;
    return { text, encoding, bom, newline: text.includes('\r\n') ? 'crlf' : 'lf' };
  } catch { return null; }
}
function encode(text, original) {
  text = text.replace(/\r\n?/g, '\n');
  if (original.newline === 'crlf') text = text.replace(/\n/g, '\r\n');
  let bytes = Buffer.from(text, original.encoding === 'utf-8' ? 'utf8' : 'utf16le');
  if (original.encoding === 'utf-16be') bytes.swap16();
  if (original.bom) bytes = Buffer.concat([Buffer.from(original.encoding === 'utf-8' ? [0xef, 0xbb, 0xbf] : original.encoding === 'utf-16be' ? [0xfe, 0xff] : [0xff, 0xfe]), bytes]);
  return bytes;
}

export function createProjectFiles({ registryPath = path.join(os.homedir(), '.lmstudio/apps/bionic/.internal/projects-registry.json'), backupDirectory, imageDirectory, extraRoots = [], python = process.env.BIONIC_MOBILE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3') } = {}) {
  const locks = new Set();
  async function roots(projectId) {
    if (typeof projectId !== 'string' || !/^[\w-]{1,128}$/.test(projectId)) throw error(400, 'Projet invalide.');
    let registry;
    try { registry = JSON.parse(await fs.readFile(registryPath, 'utf8')); } catch { throw error(503, 'Le registre des projets Bionic est indisponible.'); }
    const descriptor = (registry.json?.projects ?? registry.projects)?.find(pair => pair[0] === projectId)?.[1];
    if (!descriptor) throw error(404, 'Projet Bionic introuvable.');
    const definitions = [];
    if (typeof descriptor.projectWorkingDirectoryPath === 'string') definitions.push({ id: 'project', name: 'Dossier du projet', path: descriptor.projectWorkingDirectoryPath, writable: true });
    for (const [index, link] of (descriptor.fileLinks || []).entries()) if (link.kind === 'directory' && path.isAbsolute(link.path || '')) definitions.push({ id: 'linked-' + index, name: 'Dossier lié · ' + path.basename(link.path), path: link.path, writable: link.access === 'write' || link.access === 'readwrite' });
    definitions.push(...extraRoots);
    const result = [];
    for (const root of definitions) {
      if (!path.isAbsolute(root.path)) continue;
      try {
        const directory = await fs.realpath(root.path);
        if (!(await fs.stat(directory)).isDirectory() || result.some(item => item.directory === directory)) continue;
        result.push({ ...root, directory });
      } catch { /* An unavailable registered folder is simply omitted. */ }
    }
    return result;
  }
  async function locate(projectId, rootId, relative, file = false) {
    const root = (await roots(projectId)).find(item => item.id === rootId);
    if (!root) throw error(404, 'Dossier indisponible dans ce projet. Actualise la liste.');
    const clean = relativePath(relative, !file);
    let filename = root.directory;
    try {
      for (const part of clean.split('/').filter(Boolean)) {
        filename = path.join(filename, part);
        if ((await fs.lstat(filename)).isSymbolicLink()) throw error(403, 'Les raccourcis et liens de dossiers ne sont pas ouverts.');
      }
      const resolved = await fs.realpath(filename);
      if (!within(root.directory, resolved)) throw error(403, 'Ce chemin sort du dossier du projet.');
      relativePath(path.relative(root.directory, resolved).split(path.sep).join('/'), !file);
      const info = await fs.stat(resolved);
      if (file ? !info.isFile() : !info.isDirectory()) throw error(400, file ? 'Ce chemin ne désigne pas un fichier.' : 'Ce chemin ne désigne pas un dossier.');
      return { root, relative: clean, filename: resolved, info };
    } catch (e) {
      if (e.status) throw e;
      throw error(e.code === 'ENOENT' ? 404 : 403, 'Fichier ou dossier inaccessible. Actualise la liste.');
    }
  }
  async function bytesFor(located, maximum) {
    if (located.info.size > maximum) throw error(413, 'Ce fichier est trop volumineux pour cette opération.');
    let handle;
    try {
      handle = await fs.open(located.filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const info = await handle.stat();
      if (!info.isFile() || info.size > maximum || info.ino !== located.info.ino || info.dev !== located.info.dev) throw error(409, 'Le fichier a changé. Rouvre-le avant de continuer.');
      const bytes = await handle.readFile();
      if (bytes.length > maximum || !within(located.root.directory, await fs.realpath(located.filename))) throw error(409, 'Le fichier a changé. Rouvre-le avant de continuer.');
      return bytes;
    } finally { await handle?.close(); }
  }
  async function list(projectId, rootId, relative = '') {
    const located = await locate(projectId, rootId, relative);
    const entries = [];
    const directory = await fs.opendir(located.filename);
    for await (const entry of directory) {
      if (HIDDEN.test(entry.name) || SECRET.test(entry.name) || entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) continue;
      if (entries.length >= 1000) throw error(413, 'Ce dossier contient trop de fichiers. Ouvre un sous-dossier moins volumineux depuis le PC.');
      entries.push({ name: entry.name, path: [relative, entry.name].filter(Boolean).join('/'), directory: entry.isDirectory() });
    }
    entries.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, 'fr', { numeric: true }));
    return { rootId, path: relative, writable: located.root.writable, entries };
  }
  async function extract(bytes, extension) {
    const script = fileURLToPath(new URL('./document-extract.py', import.meta.url));
    return await new Promise((resolve, reject) => {
      const process = spawn(python, [script, extension], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      const chunks = []; let size = 0, settled = false;
      const finish = (e, value) => { if (settled) return; settled = true; clearTimeout(timer); e ? reject(e) : resolve(value); };
      const timer = setTimeout(() => { process.kill(); finish(error(422, 'L’extraction du document est trop longue. Télécharge-le pour le consulter.')); }, 20000);
      process.on('error', () => finish(error(503, 'La lecture de ce format nécessite le runtime Python du PC. Le téléchargement reste disponible.')));
      process.stdout.on('data', chunk => { size += chunk.length; if (size > 2_000_000) { process.kill(); finish(error(413, 'Le texte extrait est trop volumineux.')); } else chunks.push(chunk); });
      process.stdin.on('error', () => {});
      process.on('close', code => { if (code !== 0) return finish(error(422, 'Ce document ne peut pas être extrait : format invalide, chiffré ou sans texte lisible. Télécharge-le pour le consulter.')); try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { finish(error(422, 'Le texte de ce document est illisible.')); } });
      process.stdin.end(bytes);
    });
  }
  async function read(projectId, rootId, relative) {
    const located = await locate(projectId, rootId, relative, true);
    const extension = path.extname(relative).slice(1).toLowerCase();
    const result = { rootId, path: relative, name: path.basename(relative), size: located.info.size, editable: false, attachable: false, kind: IMAGE[extension] ? 'image' : 'binary' };
    if (TEXT.has(extension) || !extension) {
      const bytes = await bytesFor(located, MAX_TEXT), decoded = decode(bytes);
      if (decoded) Object.assign(result, { kind: 'text', text: decoded.text.replace(/\r\n?/g, '\n'), hash: hash(bytes), editable: located.root.writable && located.info.nlink === 1, attachable: true, encoding: decoded.encoding });
    } else if (IMAGE[extension] && extension !== 'gif' && located.info.size <= 6_000_000) {
      const bytes = await bytesFor(located, 6_000_000);
      Object.assign(result, { hash: hash(bytes), attachable: true, mime: IMAGE[extension] });
    } else if (DOCUMENT.has(extension)) {
      const bytes = await bytesFor(located, MAX_DOCUMENT);
      try { const document = await extract(bytes, extension); Object.assign(result, { kind: 'document', text: document.text, truncated: document.truncated, hash: hash(bytes), attachable: !!document.text.trim() }); }
      catch (e) { result.notice = e.status ? e.message : 'Extraction indisponible. Le téléchargement reste disponible.'; }
    }
    return result;
  }
  async function download(projectId, rootId, relative, inline) {
    const located = await locate(projectId, rootId, relative, true);
    const bytes = await bytesFor(located, MAX_DOWNLOAD);
    const mime = inline ? IMAGE[path.extname(relative).slice(1).toLowerCase()] : undefined;
    return { bytes, name: path.basename(relative), mime: mime || 'application/octet-stream', inline: !!mime };
  }
  async function write(projectId, rootId, relative, expectedHash, text, restoreId) {
    const located = await locate(projectId, rootId, relative, true);
    if (!located.root.writable) throw error(403, 'Ce dossier lié est en lecture seule dans Bionic.');
    if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)) throw error(400, 'Version du fichier manquante. Rouvre-le avant d’enregistrer.');
    const key = located.filename.toLowerCase();
    if (locks.has(key)) throw error(409, 'Un enregistrement est déjà en cours. Réessaie.');
    locks.add(key); let temporary;
    try {
      const old = await bytesFor(located, MAX_TEXT), decoded = decode(old);
      if (!(TEXT.has(path.extname(relative).slice(1).toLowerCase()) || !path.extname(relative)) || !decoded || located.info.nlink !== 1) throw error(415, 'Seuls les fichiers texte peuvent être modifiés dans cet éditeur.');
      if (hash(old) !== expectedHash) throw error(409, 'Le fichier a été modifié sur le PC depuis son ouverture. Tes changements restent dans l’éditeur. Télécharge-les, puis rouvre la version du PC.');
      let next;
      if (restoreId) {
        if (typeof restoreId !== 'string' || !/^[a-f0-9-]{36}$/.test(restoreId)) throw error(400, 'Copie de sauvegarde invalide.');
        const metadata = JSON.parse(await fs.readFile(path.join(backupDirectory, restoreId + '.json'), 'utf8'));
        if (metadata.projectId !== projectId || metadata.rootId !== rootId || metadata.path !== relative) throw error(403, 'Cette copie appartient à un autre fichier.');
        next = await fs.readFile(path.join(backupDirectory, restoreId + '.bin'));
        if (hash(next) !== metadata.hash || !decode(next)) throw error(409, 'La copie de sauvegarde est endommagée.');
      } else {
        if (typeof text !== 'string' || text.includes('\0')) throw error(400, 'Contenu texte invalide.');
        next = encode(text, decoded);
      }
      if (next.length > MAX_TEXT) throw error(413, 'Le fichier dépasse la limite d’édition de 1 Mo.');
      if (!backupDirectory) throw error(503, 'Le dossier de sauvegarde est indisponible.');
      await fs.mkdir(backupDirectory, { recursive: true });
      const backupId = randomUUID();
      await fs.writeFile(path.join(backupDirectory, backupId + '.bin'), old, { flag: 'wx', mode: 0o600 });
      await fs.writeFile(path.join(backupDirectory, backupId + '.json'), JSON.stringify({ projectId, rootId, path: relative, hash: expectedHash, savedAt: Date.now() }), { flag: 'wx', mode: 0o600 });
      temporary = path.join(path.dirname(located.filename), '.bionic-mobile-' + randomUUID() + '.tmp');
      await fs.writeFile(temporary, next, { flag: 'wx', mode: located.info.mode });
      const fresh = await locate(projectId, rootId, relative, true);
      if (fresh.filename !== located.filename || hash(await bytesFor(fresh, MAX_TEXT)) !== expectedHash) throw error(409, 'Le fichier vient de changer sur le PC. Aucun remplacement effectué. Rouvre-le avant d’enregistrer.');
      await fs.rename(temporary, located.filename); temporary = null;
      return { ...await read(projectId, rootId, relative), backupId, saved: true };
    } catch (e) {
      if (e.status) throw e;
      throw error(409, 'Enregistrement impossible. Vérifie que le fichier est accessible et qu’un autre logiciel ne le bloque pas. Tes changements restent dans l’éditeur.');
    } finally { locks.delete(key); if (temporary) await fs.unlink(temporary).catch(() => {}); }
  }
  async function create(projectId, rootId, relative, bytes) {
    relative = relativePath(relative, false);
    if (!Buffer.isBuffer(bytes) || bytes.length > MAX_DOCUMENT) throw error(413, 'Le fichier dépasse la limite de 20 Mo.');
    const parts = relative.split('/'), name = parts.pop();
    let parent = await locate(projectId, rootId, '');
    if (!parent.root.writable) throw error(403, 'Ce dossier est en lecture seule.');
    let current = '';
    for (const part of parts) {
      current = [current, part].filter(Boolean).join('/');
      try { await fs.mkdir(path.join(parent.filename, part)); } catch (e) { if (e.code !== 'EEXIST') throw error(403, 'Le dossier de destination ne peut pas être créé.'); }
      parent = await locate(projectId, rootId, current);
    }
    const filename = path.join(parent.filename, name);
    let handle, completed = false;
    try {
      handle = await fs.open(filename, 'wx', 0o600);
      await handle.writeFile(bytes); await handle.sync(); completed = true;
    } catch (e) {
      if (e.code === 'EEXIST') throw error(409, 'Un fichier porte déjà ce nom. Aucun remplacement effectué.');
      throw error(403, 'Le fichier ne peut pas être créé dans ce dossier.');
    } finally {
      if (handle) { await handle.close(); if (!completed) await fs.unlink(filename).catch(() => {}); }
    }
    return { rootId, path: relative, name, size: bytes.length, hash: hash(bytes), created: true };
  }
  async function importFile(projectId, name, bytes) {
    if (typeof name !== 'string' || name.length > 180 || name.includes('/') || name.includes('\\')) throw error(400, 'Nom de fichier invalide.');
    relativePath(name, false);
    const extension = path.extname(name), stem = name.slice(0, name.length - extension.length);
    for (let attempt = 0; attempt < 1000; attempt++) {
      const candidate = stem + (attempt ? ` (${attempt + 1})` : '') + extension;
      try {
        const result = await create(projectId, 'project', 'Imports telephone/' + candidate, bytes);
        const file = await read(projectId, 'project', result.path).catch(() => ({ ...result, attachable: false }));
        return { ...result, kind: file.kind, attachable: file.attachable, truncated: file.truncated, notice: file.notice };
      } catch (e) { if (e.status !== 409) throw e; }
    }
    throw error(409, 'Trop de fichiers portent déjà ce nom. Renomme le fichier avant de l’importer.');
  }
  async function attachments(projectId, references = [], { allowImages = false } = {}) {
    if (!Array.isArray(references) || references.length > 4) throw error(400, 'Joins au maximum quatre fichiers à un message.');
    const result = []; let total = 0;
    for (const reference of references) {
      if (!reference || typeof reference !== 'object') throw error(400, 'Pièce jointe invalide.');
      const file = await read(projectId, reference.rootId, reference.path);
      if (!file.attachable) throw error(415, 'Ce format ne peut pas être joint au modèle. Choisis un fichier texte, PDF, DOCX ou XLSX contenant du texte.');
      if (reference.hash !== file.hash) throw error(409, 'Un fichier joint a changé sur le PC. Retire-le puis joins sa nouvelle version.');
      if (file.kind === 'image') {
        if (!allowImages) throw error(400, 'Cette pièce jointe est une image. Choisis un modèle marqué Vision pour l’analyser ; elle reste enregistrée dans le projet.');
        if (!imageDirectory) throw error(503, 'Le stockage des images jointes est indisponible.');
        const downloaded = await download(projectId, reference.rootId, reference.path, true);
        if (hash(downloaded.bytes) !== file.hash) throw error(409, 'L’image a changé pendant son envoi. Joins-la de nouveau.');
        await fs.mkdir(imageDirectory, { recursive: true });
        await fs.writeFile(path.join(imageDirectory, file.hash + '.bin'), downloaded.bytes, { flag: 'wx', mode: 0o600 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
        result.push({ rootId: file.rootId, path: file.path, name: file.name, hash: file.hash, kind: 'image', mime: file.mime });
        continue;
      }
      let text = file.text, excerpt = false;
      if (reference.selection) {
        const { start, end } = reference.selection;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length) throw error(400, 'Extrait de fichier invalide.');
        text = text.slice(start, end); excerpt = true;
      } else if (file.truncated) throw error(413, 'Ce document est partiellement extrait. Sélectionne le passage à joindre dans son aperçu.');
      total += text.length;
      if (total > 160_000) throw error(413, 'Les fichiers joints sont trop longs. Sélectionne un extrait dans l’éditeur ou joins moins de fichiers.');
      result.push({ rootId: file.rootId, path: file.path, name: file.name, hash: file.hash, text, excerpt });
    }
    return result;
  }
  async function imageBytes(attachment) {
    if (!imageDirectory || !/^[a-f0-9]{64}$/.test(attachment.hash) || !Object.values(IMAGE).includes(attachment.mime)) throw error(400, 'Image jointe invalide.');
    const bytes = await fs.readFile(path.join(imageDirectory, attachment.hash + '.bin'));
    if (bytes.length > 6_000_000 || hash(bytes) !== attachment.hash) throw error(409, 'La copie de l’image jointe est illisible.');
    return { bytes, mime: attachment.mime };
  }
  async function imageData(attachment) { const { bytes, mime } = await imageBytes(attachment); return `data:${mime};base64,${bytes.toString('base64')}`; }
  return { roots: async projectId => (await roots(projectId)).map(({ directory, ...root }) => root), list, read, download, write, create, importFile, attachments, imageData, imageBytes };
}
