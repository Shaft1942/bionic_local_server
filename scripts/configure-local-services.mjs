import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { loadSettings } from '../lib/config.mjs';
import { loadLocalServiceProfiles } from '../lib/local-service-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const settings = await loadSettings({ root });
const filename = path.join(root, 'config.launchers.local.json');
let comfyUrl = settings.comfyUrl;
try { const saved = JSON.parse(await fs.readFile(path.join(root, 'data', 'comfy-settings.json'), 'utf8')); if (typeof saved.url === 'string') comfyUrl = saved.url; } catch (error) { if (error.code !== 'ENOENT') throw new Error('Le réglage ComfyUI ne peut pas être confirmé.'); }
const inspect = () => loadLocalServiceProfiles({ root, connections: { bionicUrl: settings.apiUrl, comfyUrl } });
if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Seule l’option --check est acceptée.');
if (process.argv.includes('--check')) {
  const result = await inspect();
  console.log(JSON.stringify({ configured: ['bionic', 'comfyui'].filter(id => result[id]), errors: result.errors }));
  if (Object.keys(result.errors).length) process.exitCode = 1;
} else {
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Préparation locale du lanceur. Aucun moteur ne sera démarré ou arrêté.');
    console.log('Le contrôle suppose un usage dédié au compagnon. Des clients externes peuvent contourner cette convention.');
    console.log('Bionic : Arrêter coupe son API, pas son application desktop. ComfyUI : seule une instance Python lancée ici sera contrôlée.');
    const id = (await input.question('Moteur à préparer : bionic ou comfyui ? ')).trim();
    if (!['bionic', 'comfyui'].includes(id)) throw new Error('Moteur inconnu.');
    const confirmation = (await input.question('Réserver le contrôle de cette API au compagnon ? Écris OUI : ')).trim();
    if (confirmation !== 'OUI') throw new Error('Aucun profil enregistré.');
    const askPath = async label => (await input.question(label + ' : ')).trim().replace(/^"|"$/g, '');
    const profile = id === 'bionic'
      ? { enabled: true, type: 'bionic-cli', exclusiveControl: true, cliPath: await askPath('Chemin absolu de lms.exe'), apiInfoPath: await askPath('Chemin exact du fichier de contrôle Bionic http-server.json (son contenu reste privé)'), appPath: await askPath('Chemin absolu de Bionic.exe (pour le démarrage à froid)') }
      : { enabled: true, type: 'comfyui-python', exclusiveControl: true, pythonPath: await askPath('Chemin absolu du Python de ComfyUI'), entryPath: await askPath('Chemin absolu de main.py'), workingDirectory: await askPath('Dossier absolu contenant main.py') };
    let previous;
    try { previous = await fs.readFile(filename); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const next = previous ? JSON.parse(previous.toString('utf8')) : { version: 1, services: {} };
    if (next.version !== 1 || !next.services || typeof next.services !== 'object') throw new Error('Ancien profil invalide ; corrige-le localement.');
    next.services[id] = profile;
    const temporary = filename + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
    await fs.rename(temporary, filename);
    const checked = await inspect();
    if (checked.errors.config || checked.errors[id]) {
      if (previous) await fs.writeFile(filename, previous, { mode: 0o600 });
      else await fs.unlink(filename);
      throw new Error('Profil refusé : ' + (checked.errors[id] || checked.errors.config));
    }
    console.log('Profil enregistré. Dans Paramètres > Serveurs sur le PC, relis la configuration. Aucun serveur n’a été lancé.');
  } finally { input.close(); }
}
