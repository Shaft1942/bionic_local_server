import { execFileSync } from 'node:child_process';
import { collectReleaseFiles, repositoryRoot } from './release-files.mjs';
const files = await collectReleaseFiles();
// If Git is available, a tracked private or unlisted file is also a publication failure.
let tracked;
try { tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore','pipe','ignore'], windowsHide: true }).split('\0').filter(Boolean); }
catch { /* A downloaded ZIP works without Git. */ }
if (tracked) {
  const allowed = new Set(files.map(file => file.path));
  const unexpected = tracked.filter(file => !allowed.has(file));
  if (unexpected.length) throw new Error(`${unexpected.length} fichier(s) suivi(s) par Git hors de la liste de distribution. Publication refusée.`);
}
console.log(`Export contrôlé : ${files.length} sources autorisées, sans données d’installation.`);
