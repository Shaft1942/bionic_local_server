import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 ou plus récent est nécessaire.');
const files = ['server.mjs'];
for (const directory of ['lib', 'public', 'scripts', 'test']) {
  for (const entry of await readdir(path.join(root, directory))) if (/\.(?:mjs|js)$/.test(entry)) files.push(directory + '/' + entry);
}
for (const file of files) execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit', windowsHide: true });
console.log(`${files.length} fichiers JavaScript vérifiés.`);
