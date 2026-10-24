import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCompanion } from '../server.mjs';
import { loadSettings } from '../lib/config.mjs';

const aliases = ['/legacy','/legacy/','/prototype','/prototype/','/index.html','/llama-ui','/llama-ui/','/llama-ui/index.html'];
async function fixture(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'canae-entry-http-'))),directory=path.join(root,'public');
  const modern='<!doctype html><title>Canaé seule</title><script type="module" src="/llama-ui/assets/entry.js"></script>';
  const files={'index.html':'OLD_LEGACY_HTML','app.js':'OLD_LEGACY_JS','style.css':'OLD_LEGACY_CSS','locales/fr/app.js':'OLD_LEGACY_LOCALE','llama-ui/index.html':modern,'llama-ui/legacy.html':'OLD_NESTED_HTML','llama-ui/assets/legacy.html':'OLD_ASSET_HTML','llama-ui/theme.css':'OLD_AUXILIARY_STYLE','llama-ui/assets/entry.js':'export const canae=true;','llama-ui/assets/font.woff2':'synthetic-font','icon.svg':'<svg xmlns="http://www.w3.org/2000/svg"/>','manifest.webmanifest':'{"start_url":"/"}'};
  for(const[name,content]of Object.entries(files)){await fs.mkdir(path.dirname(path.join(directory,name)),{recursive:true});await fs.writeFile(path.join(directory,name),content);}
  const original=JSON.stringify({uiMode:'legacy',apiUrl:'http://127.0.0.1:19998',llamaUrl:'http://127.0.0.1:19997',comfyEnabled:false,bionicRoot:path.join(root,'native-disabled')});await fs.writeFile(path.join(root,'config.local.json'),original);
  const settings=await loadSettings({root,env:{BIONIC_MOBILE_UI_MODE:'legacy'}}),forbidden=async()=>{throw Error('No real services in entry fixture');};
  const app=await createCompanion({root,settings,nativeStore:{listProjects:async()=>[],listSessions:async()=>[],getConversation:forbidden},modelService:{list:async()=>[],forInference:forbidden},inferenceEnvironment:{},fetchImpl:forbidden,comfyFetchImpl:forbidden,enableUpdateScheduling:false});
  await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
  t.after(async()=>{await app.close();assert.equal(path.dirname(root),await fs.realpath(os.tmpdir()));assert(path.basename(root).startsWith('canae-entry-http-'));await fs.rm(root,{recursive:true,force:true});});
  return{root,app,modern,original,url:'http://127.0.0.1:'+app.server.address().port};
}

test('historical local and environment legacy settings expose only canonical Canaé for GET and HEAD',async t=>{
  const f=await fixture(t);assert.equal(f.app.settings.uiMode,'llama');
  for(const method of ['GET','HEAD']){
    const page=await fetch(f.url+'/',{method,redirect:'manual'});assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/^text\/html/);assert.equal(page.headers.get('cache-control'),'no-store');assert.equal(page.headers.get('referrer-policy'),'strict-origin');assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(await page.text(),method==='HEAD'?'':f.modern);
    for(const alias of aliases){const response=await fetch(f.url+alias+'?old=value',{method,redirect:'manual'});assert.equal(response.status,308,alias);assert.equal(response.headers.get('location'),'/');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await response.text(),'');}
  }
  assert.equal(await fs.readFile(path.join(f.root,'config.local.json'),'utf8'),f.original);
});

test('retained legacy files and unknown HTML stay inaccessible while current assets and API guards remain usable',async t=>{
  const f=await fixture(t);
  for(const route of ['/app.js','/style.css','/locales/fr/app.js','/legacy/index.html','/llama-ui/legacy.html','/llama-ui/assets/legacy.html','/llama-ui/theme.css','/unknown','/llama-ui/assets/missing.js','/llama-ui/%2e%2e%2fdata/config.json','/data/config.json'])for(const method of ['GET','HEAD']){const response=await fetch(f.url+route,{method,redirect:'manual'});assert.equal(response.status,404,method+' '+route);if(method==='HEAD')assert.equal(await response.text(),'');}
  for(const[route,type]of [['/llama-ui/assets/entry.js','text/javascript'],['/llama-ui/assets/font.woff2','font/woff2'],['/icon.svg','image/svg+xml'],['/manifest.webmanifest','application/manifest+json']]){const response=await fetch(f.url+route);assert.equal(response.status,200);assert(response.headers.get('content-type').startsWith(type));assert.equal(response.headers.get('cache-control'),'no-store');}
  assert.equal((await fetch(f.url+'/api/ping')).status,200);assert.equal((await fetch(f.url+'/api/projects')).status,401);assert.equal((await fetch(f.url+'/api/comfy/memory-module')).status,401);
  const code=/Code d’accès : (.+)/.exec(await fs.readFile(path.join(f.root,'ACCES-PRIVE.txt'),'utf8'))[1].trim();
  const refused=await fetch(f.url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://foreign.test'},body:JSON.stringify({code})});assert.equal(refused.status,403);
  const login=await fetch(f.url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:f.url},body:JSON.stringify({code})});assert.equal(login.status,200);const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
  assert.equal((await fetch(f.url+'/api/projects',{headers})).status,200);assert.equal((await fetch(f.url+'/api/security/status',{headers})).status,200);
  const download=await fetch(f.url+'/api/comfy/memory-module',{headers});assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment/);assert.match(await download.text(),/FreeMemoryAfterWorkflow/);
  const proof=await fetch(f.url+'/__certificates/not-a-proof',{redirect:'manual'});assert.equal(proof.status,404);
  assert.equal((await fetch(f.url+'/legacy/',{method:'POST',headers:{Origin:f.url}})).status,404,'redirect aliases never turn an unsupported mutation into GET');
});
