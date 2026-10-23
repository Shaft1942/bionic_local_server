import { fileURLToPath } from 'node:url';
import { loadSettings } from '../lib/config.mjs';
import { readLocalControl, requestLocalAdmin } from '../lib/maintenance-client.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try {
  const settings=await loadSettings({root});
  const control=await readLocalControl({root,port:settings.port});
  const result=await requestLocalAdmin(control,'/api/admin/revoke-sessions');
  console.log(Number.isSafeInteger(result.revoked)?result.revoked+' session(s) déconnectée(s).':'Sessions déconnectées.');
  console.log('Les travaux continuent. Un appareil autorisé au niveau de sécurité actuel peut se reconnecter. Pour un code compromis, utilise la procédure de rotation du guide.');
}catch{console.error('Révocation non confirmée. Vérifie que le serveur de ce dossier est actif. Aucun code ni jeton affiché.');process.exitCode=1;}
