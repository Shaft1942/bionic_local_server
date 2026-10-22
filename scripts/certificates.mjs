// Interactive local PC wizard. No private key or passphrase uses HTTP.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, scryptSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { loadSettings } from '../lib/config.mjs';
import { openCertificateStore, writePrivateFile, protectPrivatePath } from '../lib/certificate-store.mjs';
import { readLocalControl, requestLocalAdmin, assertServerOffline } from '../lib/maintenance-client.mjs';
const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
function localAddresses() {
  return [...new Set(['127.0.0.1','localhost',...Object.entries(os.networkInterfaces()).filter(([name]) => !/vEthernet|WSL|Docker|VirtualBox|VMware/i.test(name)).flatMap(([, addresses]) => addresses || []).filter(a => a.family === 'IPv4' && !a.internal && /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(a.address)).map(a => a.address)])];
}
async function noLinks(filename) {
  const parsed = path.parse(path.resolve(filename)); let cursor = parsed.root;
  for (const part of path.resolve(filename).slice(parsed.root.length).split(path.sep)) {
    if (!part) continue; cursor = path.join(cursor, part);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw Error('Lien interdit dans les fichiers de securite.'); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
  }
}
export async function issueLocalDevice({ root = defaultRoot, port, name, previousId } = {}) {
  await assertServerOffline({ root, port });
  await readLocalControl({ root, port, allowOffline: true });
  await noLinks(path.join(root, 'runtime/certificate-exports'));
  const store = await openCertificateStore(path.join(root, 'data'), { allowExpired: true });
  if (previousId) { const previous = store.state.devices.find(device => device.id === previousId); if (!previous) throw Error('Ancien appareil inconnu.'); if (!name) name = previous.name; }
  const passphrase = randomBytes(18).toString('base64url');
  const issued = await store.issueDevice({ name, passphrase });
  const directory = path.join(root, 'runtime/certificate-exports', issued.device.id);
  const pfxFile = path.join(directory, 'appareil.p12'), passwordFile = path.join(directory, 'mot-de-passe.txt');
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await protectPrivatePath(path.dirname(directory), { directory: true });
    await writePrivateFile(pfxFile, issued.pfx);
    await writePrivateFile(passwordFile, passphrase + '\r\n');
  } catch (error) { await store.revokeDevice(issued.device.id); throw error; }
  if (previousId) await store.revokeDevice(previousId);
  return { device: issued.device, pfxFile, passwordFile };
}
export async function resetLocalInstallation({ root = defaultRoot, port } = {}) {
  await assertServerOffline({ root, port });
  for (const relative of ['data/config.json','ACCES-PRIVE.txt','runtime','runtime/certificate-exports']) await noLinks(path.join(root, relative));
  const control = await readLocalControl({ root, port, allowOffline: true });
  const salt = randomBytes(16).toString('hex'), accessCode = randomBytes(12).toString('base64url');
  const config = { ...control.config, salt, passwordHash: scryptSync(accessCode, salt, 32).toString('hex'), adminToken: randomBytes(32).toString('hex') };
  // Rotate access first. If the reset then fails, old credentials remain invalid.
  await writePrivateFile(path.join(root, 'data/config.json'), JSON.stringify(config, null, 2) + '\n');
  await writePrivateFile(path.join(root, 'ACCES-PRIVE.txt'), `BIONIC MOBILE - ACCES PERSONNEL\r\n\r\nSur le telephone, connecte au Wi-Fi de la maison :\r\n${localAddresses().filter(host => host !== 'localhost').map(host => `http://${host}:${port}`).join('\r\n')}\r\n\r\nCode d’accès : ${accessCode}\r\n\r\nSur ce PC : http://127.0.0.1:${port}\r\n\r\nAcces reinitialises localement. Niveau HTTP initial. Les anciens certificats et codes ne sont plus valables.\r\n`);
  const { resetCertificateStoreLocal } = await import('../lib/certificate-store.mjs');
  if (typeof resetCertificateStoreLocal !== 'function') throw Error('Outil de recuperation locale indisponible. Aucun retour HTTP effectue.');
  await resetCertificateStoreLocal(path.join(root, 'data'));
  const exportsDirectory = path.resolve(root, 'runtime/certificate-exports');
  if (!exportsDirectory.startsWith(path.resolve(root) + path.sep)) throw Error('Chemin export invalide.');
  await fs.rm(exportsDirectory, { recursive: true, force: true });
  for (const relative of ['runtime/transport.json','runtime/server.json']) await fs.rm(path.join(root, relative), { force: true });
  return { mode: 'http', conversationsAndFilesPreserved: true, accessFile: path.join(root, 'ACCES-PRIVE.txt') };
}
async function liveAction(root, port, action, options = {}) {
  return requestLocalAdmin(await readLocalControl({ root, port }), '/api/admin/certificates/action', { action, ...options });
}
async function showPreparation(root, port, mode, hosts) {
  const result = await liveAction(root, port, 'prepare', { mode, hosts });
  console.log('Preparation ouverte. Le niveau actuel reste actif jusqu’a la preuve HTTPS.');
  console.log('Autorite publique a importer : ' + result.caFile);
  console.log('Empreinte SHA-256 de l’autorite publique : ' + result.caFingerprint);
  console.log('Empreinte SHA-256 du certificat serveur candidat : ' + result.serverFingerprint);
  console.log('1. Transfere uniquement l’autorite publique par un canal fiable depuis ce PC.');
  console.log('2. Active sa confiance TLS dans le systeme de l’appareil. Ne contourne aucun avertissement navigateur.');
  if (mode === 'mtls') console.log('3. Importe aussi le .p12 propre a cet appareil, avec son mot de passe, puis selectionne-le dans le navigateur.');
  console.log('Si le pare-feu bloque le telephone, lance localement Autoriser-preparation-certificats.cmd et accepte Windows : autorisation temporaire limitee a cette preuve.');
  console.log('Ouvre ensuite depuis l’appareil cette preuve HTTPS : ' + result.proofUrl);
  if (result.localProofUrl) console.log('Alternative de verification sur ce PC : ' + result.localProofUrl);
  console.log('La confirmation dans cette page verrouille le niveau cible. Verifie ensuite Etat dans cet outil.');
  console.log('Expiration de la preparation : ' + result.expiresAt);
  return result;
}
export async function certificateMain(args = process.argv.slice(2), root = defaultRoot) {
  const settings = await loadSettings({ root }); const port = settings.port;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let command = args[0];
    if (!command) {
      console.log('Certificats Bionic - gestion locale sur le PC serveur');
      console.log('1 Etat | 2 Preparer HTTPS | 3 Creer un certificat appareil (serveur arrete) | 4 Preparer mTLS | 5 Retirer un appareil | 6 Renouveler serveur/adresse | 7 Annuler preparation | 8 Reinitialiser les acces (serveur arrete) | 9 Renouveler un appareil (serveur arrete) | 0 Quitter');
      command = ({'1':'status','2':'https','3':'issue-device','4':'mtls','5':'revoke-device','6':'renew-server','7':'cancel-preparation','8':'reset-local','9':'renew-device','0':'quit'})[(await prompt.question('Choix : ')).trim()];
    }
    if (command === 'quit') return;
    if (command === 'status') {
      try { console.log(JSON.stringify(await liveAction(root, port, 'status'), null, 2)); }
      catch {
        await assertServerOffline({ root, port });
        const store = await openCertificateStore(path.join(root, 'data'), { allowExpired: true });
        console.log('Serveur arrete. Etat persistant :'); console.log(JSON.stringify(store.publicStatus(), null, 2));
      }
    } else if (command === 'issue-device' || command === 'renew-device') {
      const previousId = command === 'renew-device' ? (args[1] || (await prompt.question('Identifiant de l’appareil a renouveler : ')).trim()) : undefined;
      const name = command === 'renew-device' ? undefined : (args.slice(1).join(' ').trim() || (await prompt.question('Nom de l’appareil : ')).trim());
      const result = await issueLocalDevice({ root, port, name, previousId });
      console.log('Archive privee propre a cet appareil : ' + result.pfxFile);
      console.log('Mot de passe uniquement dans ce fichier local protege : ' + result.passwordFile);
      console.log('Transfere l’archive par un canal fiable. Communique son mot de passe separement. Efface les copies de transfert apres import.');
      console.log('Tu peux relancer Demarrer.cmd. Identifiant appareil : ' + result.device.id);
    } else if (['https','mtls','renew-server'].includes(command)) {
      let mode = command;
      if (command === 'renew-server') {
        const result = await liveAction(root, port, 'status'); mode = result.status?.mode || result.mode;
        if (!['https','mtls'].includes(mode)) throw Error('Active d’abord HTTPS.');
      }
      const defaultHosts = localAddresses();
      const text = args.slice(1).join(' ') || await prompt.question('Noms/IP separes par virgules [' + defaultHosts.join(', ') + '] : ');
      const hosts = text.trim() ? text.split(/[,\s]+/).filter(Boolean) : defaultHosts;
      await showPreparation(root, port, mode, hosts);
    } else if (command === 'revoke-device') {
      const id = args[1] || (await prompt.question('Identifiant ou empreinte de l’appareil (voir Etat) : ')).trim();
      console.log(JSON.stringify(await liveAction(root, port, 'revoke-device', { id }), null, 2));
    } else if (command === 'cancel-preparation') {
      await liveAction(root, port, command); console.log('Preparation annulee ; niveau confirme conserve.');
    } else if (command === 'reset-local') {
      console.log('Cette action supprime la confiance et les certificats de tous les appareils, change le code et remet HTTP. Conversations et fichiers conserves.');
      if ((await prompt.question('Saisis REINITIALISER pour confirmer sur ce PC : ')).trim() !== 'REINITIALISER') { console.log('Aucun changement.'); return; }
      const result = await resetLocalInstallation({ root, port }); console.log('Acces reinitialises. Nouveau code : ouvrir localement ' + result.accessFile + '. Relance Demarrer.cmd.');
    } else throw Error('Commande inconnue. Utilise Certificats.cmd pour le parcours guide.');
  } finally { prompt.close(); }
}
const samePath = (a, b) => process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  try { await certificateMain(); }
  catch (error) { console.error(error.code === 'SECURITY_LOCKED' ? error.message : (error.message || 'Operation locale non confirmee.')); process.exitCode = 1; }
}
