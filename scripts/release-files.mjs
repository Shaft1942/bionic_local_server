import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const excluded = /(?:^|\/)(?:data|runtime|dist|node_modules|\.git|\.venv|__pycache__)(?:\/|$)|(?:^|\/)(?:config\.local\.json|ACCES-PRIVE\.txt|\.env(?:\..*)?|reseau-verification\.txt|verification.*\.json|store-verification.*\.json|apercu-.*)$|\.(?:log|sqlite(?:-wal|-shm)?|db|pem|key|pfx|p12|crt|cer|der|zip|bin)$/i;
const suspicious = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /"(?:adminToken|passwordHash)"\s*:\s*"[a-f0-9]{32,}"/i,
  /(?:[A-Z]:[\\/]+Users[\\/]+(?!Public(?:[\\/]|$)|Default(?:[\\/]|$))[^\s"'<>]+)/i
];
export function inspectContent(file, content) {
  if (suspicious.some(pattern => pattern.test(content))) throw new Error(`Contenu sensible potentiel dans ${file}. Export refusé ; aucun contenu affiché.`);
}
export async function collectReleaseFiles(root = repositoryRoot) {
  const manifest = JSON.parse(await readFile(path.join(root, 'release-manifest.json'), 'utf8'));
  if (!Array.isArray(manifest.files) || manifest.files.length < 10 || new Set(manifest.files).size !== manifest.files.length) throw new Error('Liste de distribution invalide.');
  const resolvedRoot = await realpath(root);
  const files = [];
  for (const relative of manifest.files) {
    if (typeof relative === 'string' && /(?:^|\/)config\.launchers\.local\.json$/i.test(relative)) throw new Error('Profil de lancement privé interdit dans la distribution.');
    if (typeof relative !== 'string' || relative.includes('\\') || /[:\x00-\x1f]/.test(relative) || path.posix.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..') || excluded.test(relative)) throw new Error('Chemin interdit dans la liste de distribution.');
    let filename = resolvedRoot;
    for (const part of relative.split('/')) { filename = path.join(filename, part); if ((await lstat(filename)).isSymbolicLink()) throw new Error(`Lien interdit dans la distribution : ${relative}`); }
    const resolved = await realpath(filename), inside = path.relative(resolvedRoot, resolved);
    if (path.isAbsolute(inside) || inside === '..' || inside.startsWith('..' + path.sep) || !(await lstat(filename)).isFile()) throw new Error('Chemin hors distribution.');
    const bytes = await readFile(filename);
    if (bytes.length > 2_000_000) throw new Error(`Fichier source trop volumineux : ${relative}`);
    if (bytes.includes(0)) throw new Error(`Fichier binaire non autorisé : ${relative}`);
    inspectContent(relative, bytes.toString('utf8'));
    files.push({ path: relative, bytes });
  }
  return files.sort((a,b) => a.path.localeCompare(b.path, 'en'));
}
