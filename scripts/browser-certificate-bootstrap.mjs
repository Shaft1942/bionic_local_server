// Isolated live browser proof. A process-scoped SPKI pin trusts only this
// fixture server key; no operating-system certificate store is modified.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, X509Certificate } from 'node:crypto';
import assert from 'node:assert/strict';
import { createCompanion } from '../server.mjs';
import { startCertificateTransport } from '../lib/certificate-transport.mjs';

const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-browser-tls-'));
let app,browser;
try{
  await fs.cp(fileURLToPath(new URL('../public',import.meta.url)),path.join(root,'public'),{recursive:true});
  app=await createCompanion({root,settings:{port:0,certificateProofPort:0,apiUrl:'http://127.0.0.1:1235',bionicRoot:root,registryPath:path.join(root,'registry.json'),extraRoots:[],python:'python',comfyEnabled:false},nativeStore:{listProjects:async()=>[],listSessions:async()=>[]},modelService:{list:async()=>[{id:'fixture',name:'Fixture',type:'llm',contextLength:16000}]},updateService:{start(){},stop(){},status:()=>({enabled:false})}});
  const transport=await startCertificateTransport({app,root,host:'127.0.0.1',port:0});
  const origin=`http://127.0.0.1:${transport.appPort}`,code=/Code d’accès : (.+)/.exec(await fs.readFile(path.join(root,'ACCES-PRIVE.txt'),'utf8'))[1].trim();
  const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({code})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0],cookieSplit=cookie.indexOf('='),headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'};
  const status=await (await fetch(origin+'/api/security/status',{headers})).json();
  const preparation=await fetch(origin+'/api/security/actions',{method:'POST',headers:{...headers,'X-Bionic-CSRF':status.web.csrfToken},body:JSON.stringify({action:'prepare',mode:'https',hosts:['127.0.0.1','localhost']})});assert.equal(preparation.status,200);const prepared=await preparation.json();
  const certificate=new X509Certificate(await fs.readFile(path.join(app.certificateStore.directory,app.certificateStore.state.candidate.certFile)));
  const pin=createHash('sha256').update(certificate.publicKey.export({type:'spki',format:'der'})).digest('base64');
  browser=await chromium.launch({headless:true,args:['--ignore-certificate-errors-spki-list='+pin]});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addCookies([{url:origin,name:cookie.slice(0,cookieSplit),value:cookie.slice(cookieSplit+1),httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage(),requests=[],errors=[],headerReads=[];
  context.on('request',request=>{if(['/api/security/proof','/__certificates/start','/__certificates/confirm'].includes(new URL(request.url()).pathname))headerReads.push((async()=>{const headers=await request.allHeaders();requests.push({path:new URL(request.url()).pathname,method:request.method(),origin:headers.origin,site:headers['sec-fetch-site'],urlHasSecret:new URL(request.url()).search.length>0});})());});
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(8000);
  await page.goto(origin+'/?settings=security');await page.locator('#certificate-proof').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.activeElement.id),'certificate-title');
  const popupPromise=page.waitForEvent('popup');await page.locator('#certificate-proof').click();const popup=await popupPromise;popup.setDefaultTimeout(8000);
  try{await popup.getByRole('button',{name:'Ouvrir la vérification sécurisée'}).waitFor();}catch(error){console.error(JSON.stringify({requests,pageText:await popup.locator('body').innerText()}));throw error;}
  await popup.getByRole('button',{name:'Ouvrir la vérification sécurisée'}).click();
  await popup.getByRole('button',{name:'Confirmer et activer HTTPS',exact:true}).waitFor();
  assert.equal(app.certificateStore.state.mode,'http');
  await popup.getByRole('button',{name:'Confirmer et activer HTTPS',exact:true}).click();await popup.getByRole('heading',{name:'Accès sécurisé activé'}).waitFor();
  assert.equal(app.certificateStore.state.mode,'https');
  await Promise.all(headerReads);
  assert.deepEqual(errors,[]);assert(requests.every(request=>!request.urlHasSecret));
  const bootstrap=requests.find(request=>request.path==='/__certificates/start');assert.equal(bootstrap.origin,origin);assert.equal(bootstrap.site,'cross-site');
  assert(requests.some(request=>request.path==='/__certificates/confirm'&&request.origin===prepared.candidateUrl));
  console.log(JSON.stringify({mode:'live isolated Chromium HTTP → TLS POST bootstrap',viewport:390,requests,trust:'Only this fixture SPKI is pinned inside the test browser process. Native Node TLS chain validation is covered separately. No system trust import or physical mobile test.'},null,2));
}finally{await browser?.close();await app?.close();await fs.rm(root,{recursive:true,force:true});}
