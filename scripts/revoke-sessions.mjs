import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { loadSettings } from '../lib/config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try {
  const settings=await loadSettings({root}),config=JSON.parse(await readFile(path.join(root,'data/config.json'),'utf8'));
  const base='http://127.0.0.1:'+settings.port;
  const ping=await fetch(base+'/api/ping',{signal:AbortSignal.timeout(3000)});
  const identity=await ping.json();
  if(!ping.ok||identity.app!=='bionic-mobile-local'||identity.instanceId!==config.instanceId||typeof config.adminToken!=='string')throw Error();
  const response=await fetch(base+'/api/admin/revoke-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:config.adminToken}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error();const result=await response.json();
  console.log(Number.isSafeInteger(result.revoked)?result.revoked+' session(s) déconnectée(s).':'Sessions déconnectées.');
  console.log('Les travaux continuent. Un appareil connaissant le code peut se reconnecter. Pour un code compromis, suis la procédure de rotation du guide.');
}catch{console.error('Révocation non confirmée. Vérifie que le serveur de ce dossier est actif. Aucun code ni jeton affiché.');process.exitCode=1;}
