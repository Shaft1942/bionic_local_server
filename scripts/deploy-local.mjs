// Explicit Windows upgrade using the application's tested transactional updater.
// node scripts/deploy-local.mjs --target <folder> [--source-check <known-source>] [--enable-comfy]
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {prepareUpdate,launchUpdate,validateUpdateMetadata,inspectUpdateArchive} from '../lib/update-installer.mjs';
import {collectReleaseFiles} from './release-files.mjs';
const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
if(!option('--target')||!path.isAbsolute(option('--target')))throw Error('Indique --target avec le dossier absolu autorisé.');
const repo=fileURLToPath(new URL('../',import.meta.url)),target=await fs.realpath(option('--target'));
if(target===await fs.realpath(repo))throw Error('La cible doit être distincte du dépôt.');
const relation=path.relative(target,await fs.realpath(repo));if(!relation.startsWith('..')&&!path.isAbsolute(relation))throw Error('La cible ne peut pas contenir le dépôt et sa sauvegarde.');
const pkg=JSON.parse(await fs.readFile(path.join(target,'package.json'))),runtime=JSON.parse(await fs.readFile(path.join(target,'runtime/server.json'))),config=JSON.parse(await fs.readFile(path.join(target,'data/config.json')));
assert.equal(path.resolve(runtime.root),target);assert.equal(runtime.instanceId,config.instanceId);
assert(Number.isInteger(runtime.port)&&runtime.port>0&&runtime.port<65536);assert(Number.isInteger(runtime.pid)&&runtime.pid>0);assert(path.isAbsolute(runtime.node));
const base='http://127.0.0.1:'+runtime.port,ping=await(await fetch(base+'/api/ping',{signal:AbortSignal.timeout(7000)})).json();assert.equal(ping.version,pkg.version);assert.equal(ping.instanceId,config.instanceId);
const metadata=JSON.parse(await fs.readFile(path.join(repo,'dist/update-manifest.json'))),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
validateUpdateMetadata(metadata,{currentVersion:pkg.version});
const archive=await fs.readFile(path.join(repo,'dist',metadata.archive)),incoming=inspectUpdateArchive(archive,metadata),currentSources=await collectReleaseFiles(repo);
assert.equal(currentSources.length,incoming.size,'Archive périmée : reconstruire la distribution.');
for(const file of currentSources)assert(incoming.get(file.path)?.equals(file.bytes),'Archive périmée : '+file.path+' ; relancer npm run release.');
async function optional(filename){try{return await fs.readFile(filename);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function idle(){
  for(const file of await fs.readdir(path.join(target,'data/chats'))){if(!file.endsWith('.json'))continue;const chat=JSON.parse(await fs.readFile(path.join(target,'data/chats',file)));if(chat.generation?.status==='running'||chat.queue?.some(x=>x.status==='queued'))throw Error('Une réponse est active : attendre avant mise à jour.');}
  for(const file of await fs.readdir(path.join(target,'data/comfy-generations')).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(!file.endsWith('.json'))continue;const job=JSON.parse(await fs.readFile(path.join(target,'data/comfy-generations',file)));if(['submitting','queued','running'].includes(job.status))throw Error('Une image est active : attendre avant mise à jour.');}
}
async function noLinks(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Lien symbolique : sauvegarde manuelle requise.');if(entry.isDirectory())await noLinks(path.join(folder,entry.name));}}
await idle();await noLinks(target);
const baselineFile=path.join(target,'runtime/update-baseline.json'),oldBaseline=await optional(baselineFile),baseline=oldBaseline?JSON.parse(oldBaseline):null;
let repairedBaseline,verifiedSourceCount=0,lineEndingDifferences=0;
if(baseline&&baseline.version!==pkg.version){
  if(!option('--source-check'))throw Error('Référence de mise à jour périmée. Fournir une source connue avec --source-check pour vérification, ou mettre à jour manuellement.');
  const source=await fs.realpath(option('--source-check'));assert.notEqual(source,target);const files=await collectReleaseFiles(source),sourcePkg=JSON.parse(files.find(f=>f.path==='package.json').bytes);
  assert.equal(sourcePkg.version,pkg.version);const activeManifest=JSON.parse(await fs.readFile(path.join(target,'release-manifest.json')));assert.deepEqual([...activeManifest.files].sort(),files.map(f=>f.path).sort());
  const activeHashes={};for(const file of files){const bytes=await fs.readFile(path.join(target,file.path));if(!bytes.equals(file.bytes)){assert.equal(bytes.toString('utf8').replaceAll('\r\n','\n'),file.bytes.toString('utf8').replaceAll('\r\n','\n'),'La source active diffère de la référence : '+file.path);lineEndingDifferences++;}activeHashes[file.path]=hash(bytes);}
  verifiedSourceCount=files.length;repairedBaseline={schemaVersion:1,version:pkg.version,files:activeHashes};
}
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backup=path.join(repo,'work/private-backups',stamp+'-before-'+metadata.version);
await fs.mkdir(path.dirname(backup),{recursive:true});await fs.cp(target,backup,{recursive:true,errorOnExist:true,force:false});
const protectedFiles=['data/config.json','config.local.json',...(await fs.readdir(path.join(target,'data/chats'))).filter(f=>f.endsWith('.json')).map(f=>'data/chats/'+f)];
const protectedHashes=new Map();for(const file of protectedFiles){const bytes=await optional(path.join(target,file));protectedHashes.set(file,bytes?hash(bytes):null);}
let launched=false,plan;
const proof={date:new Date().toISOString(),target,from:pkg.version,to:metadata.version,backup,instanceId:config.instanceId,port:runtime.port,baselineReconciled:!!repairedBaseline,verifiedSourceCount,lineEndingDifferences};
try{
  if(repairedBaseline)await fs.writeFile(baselineFile,JSON.stringify(repairedBaseline));
  plan=await prepareUpdate({root:target,archive,metadata,currentVersion:pkg.version,instanceId:config.instanceId,port:runtime.port,nodePath:runtime.node,parentPid:runtime.pid});
  await idle();await launchUpdate(plan);launched=true;
  const stop=await fetch(base+'/api/admin/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:config.adminToken}),signal:AbortSignal.timeout(7000)});assert(stop.ok);
  const deadline=Date.now()+90000;let state;
  while(Date.now()<deadline){const bytes=await optional(path.join(plan.jobRoot,'status.json'));if(bytes){state=JSON.parse(bytes);if(['completed','cancelled','rolled-back','rollback-failed'].includes(state.state))break;}await new Promise(resolve=>setTimeout(resolve,500));}
  assert.equal(state?.state,'completed','La mise à jour n’est pas terminée : consulter runtime/update-jobs avant toute relance.');proof.jobId=plan.jobId;proof.pid=state.pid;
  const live=await(await fetch(base+'/api/ping')).json(),liveRuntime=JSON.parse(await fs.readFile(path.join(target,'runtime/server.json')));assert.equal(live.version,metadata.version);assert.equal(live.instanceId,config.instanceId);assert.equal(liveRuntime.pid,state.pid);
  for(const [file,expected]of protectedHashes){const bytes=await optional(path.join(target,file));assert.equal(bytes?hash(bytes):null,expected,'Fichier privé modifié : '+file);}proof.conversationsAndAuthUnchanged=true;
  if(args.includes('--enable-comfy')){
    const code=/Code d’accès : (.+)/.exec(await fs.readFile(path.join(target,'ACCES-PRIVE.txt'),'utf8'))[1].trim();
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});assert(login.ok);const cookie=login.headers.get('set-cookie').split(';')[0];
    const saved=await fetch(base+'/api/comfy/settings',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({enabled:true,url:'http://127.0.0.1:8188',workflowId:'krea2_turbo'})});assert(saved.ok);proof.comfy=await saved.json();proof.authorizedConfigurationChange='ComfyUI activé, URL locale, profil Krea2 Turbo';
  }
  proof.success=true;
}catch(error){proof.error=error.message;if(!launched&&repairedBaseline&&oldBaseline)await fs.writeFile(baselineFile,oldBaseline);throw error;}
finally{await fs.writeFile(path.join(backup,'deployment-proof.json'),JSON.stringify(proof,null,2));await fs.writeFile(path.join(repo,'work/deployment-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));}
