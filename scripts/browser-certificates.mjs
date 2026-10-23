// Isolated UI proof: synthetic certificate metadata and HTTP routes, no live service.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const captures=process.env.BIONIC_SMOKE_SCREENSHOTS;
if(captures)await fs.mkdir(captures,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BIONIC_BROWSER_CHANNEL?{channel:process.env.BIONIC_BROWSER_CHANNEL}:{})});
// HTTPS is intercepted too: private-download UI is exercised in a secure
// browser context. No TLS server or system trust import is used.
const origin='https://bionic-certificates.test',results=[];
const fingerprint=Array(32).fill('AB').join(':');
const expiresAt=new Date(Date.now()+365*86400000).toISOString();
const bootstrap=`
  const state={authenticated:true,authEpoch:1,projectId:null,chat:null,viewKey:'synthetic',status:{models:[{id:'test',name:'Modèle de démonstration'}]}};
  document.getElementById('login').hidden=true;
  document.getElementById('app').hidden=false;
  const option=document.createElement('option');option.value='test';option.textContent='Modèle de démonstration';document.getElementById('model').append(option);
  createCompanionSettings({api:async(route,options)=>{const reply=await fetch(route,options);if(!reply.ok)throw Error('Indisponible');return reply.json();},getState:()=>state,node:(tag,className,text)=>{const el=document.createElement(tag);el.className=className;el.textContent=text;return el;}});
`;
async function openConnection(page){
  await page.locator('#settings-open-sidebar').click();
  const destination=page.locator('#settings-nav [data-settings-page="connection"]');
  if(!await destination.isVisible())await page.locator('#settings-back').click();
  await destination.click();
  await page.locator('#settings-page-connection').waitFor({state:'visible'});
}
try{
  for(const width of [1440,390]){
    const web={csrfToken:'N'.repeat(43),canConfigure:true,canIssueDevice:false,currentDeviceId:null,suggestedHosts:['127.0.0.1','bionic.local'],proofPort:8770,proofPortProvisioned:true};
    let metadata={mode:'http',epoch:1,server:null,authority:null,devices:[],web},unavailable=false;
    const errors=[],requests=[];
    const context=await browser.newContext({locale:'fr-FR',viewport:{width,height:1100}}),page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(6000);
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin)return route.abort();
      if(!url.pathname.startsWith('/api/')){
        const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
        const catalog=/^locales\/(?:fr|en)\/(?:ui|app|settings|components|local-services)\.js$/.test(file);
        if(!/^[\w.-]+$/.test(file)&&!catalog)return route.abort();
        return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/svg+xml',body:file==='app.js'?bootstrap:await fs.readFile(path.join(root,'public',file))});
      }
      requests.push({path:url.pathname,method:request.method()});
      if(url.pathname==='/api/security/status'&&unavailable)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
      let data={};
      if(url.pathname==='/api/security/actions'){
        const input=request.postDataJSON();
        assert.equal(request.headers()['x-bionic-csrf'],web.csrfToken);
        if(input.action==='prepare'){
          metadata={...metadata,authority:{fingerprint,expiresAt},candidate:{mode:input.mode,url:'https://127.0.0.1:8770',expiresAt:new Date(Date.now()+600000).toISOString()},web:{...web,proofRequest:{url:'/api/security/proof',id:'synthetic-proof'}}};
          return route.fulfill({contentType:'application/json',body:JSON.stringify({status:metadata,proofRequest:metadata.web.proofRequest})});
        }
        if(input.action==='issue-device')return route.fulfill({contentType:'application/json',body:JSON.stringify({device:{id:'synthetic-device'},exportId:'synthetic-export',passphrase:'Synthetic-only-password-123',expiresAt:new Date(Date.now()+300000).toISOString()})});
      }
      if(url.pathname==='/api/security/device-download')return route.fulfill({contentType:'application/pkcs12',body:Buffer.from('SYNTHETIC_PRIVATE_DOWNLOAD_FIXTURE')});
      if(url.pathname==='/api/security/status')data=metadata;
      if(url.pathname==='/api/model-preferences')data={source:'auto',automatic:true,maxOutputTokens:8192,contextLength:16000,applyToAllSessions:false};
      if(url.pathname==='/api/comfy/settings')data={enabled:false,url:'http://127.0.0.1:8188',workflowId:'krea2_turbo',activeJobs:0,workflows:[{id:'krea2_turbo',label:'Krea 2 Turbo'}]};
      if(url.pathname==='/api/capabilities')data={items:[]};
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(origin);await openConnection(page);
    await page.locator('#certificate-mode').getByText('HTTP',{exact:true}).waitFor();
    assert.match(await page.locator('#certificate-description').textContent(),/ne sont pas chiffrés/);
    const guide=page.locator('#certificate-install-guide'),beforeGuide=requests.filter(request=>request.method!=='GET').length;
    await guide.locator('summary').focus();await guide.locator('summary').press('Enter');
    assert.equal(await guide.evaluate(element=>element.open),true,'system guide opens with the keyboard');
    assert.equal(requests.filter(request=>request.method!=='GET').length,beforeGuide,'reading the guide does not trigger a security action');
    assert.equal(await page.locator('.settings-body').evaluate(element=>element.scrollWidth<=element.clientWidth),true,'expanded guide fits the settings page');
    await guide.locator('summary').press('Enter');assert.equal(await guide.evaluate(element=>element.open),false);
    await page.locator('#certificate-prepare').click();await page.locator('#certificate-proof-form').waitFor({state:'visible'});
    assert.equal(await page.locator('#certificate-proof-form').getAttribute('action'),'/api/security/proof');
    assert.equal(await page.locator('#certificate-proof-id').inputValue(),'synthetic-proof');
    assert.equal(await page.locator('#certificate-device-form').isVisible(),false);
    if(captures)await page.screenshot({path:path.join(captures,width+'-prepare.png')});
    const refresh=async()=>{await page.locator('#certificate-refresh').click();await page.locator('#certificate-refresh').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('certificate-refresh').disabled);};
    metadata={...metadata,mode:'https',candidate:null,server:{fingerprint,expiresAt,hosts:['127.0.0.1','bionic.local']},authority:{fingerprint,expiresAt},web:{...web,canIssueDevice:true}};
    await refresh();assert.equal(await page.locator('#certificate-mode').textContent(),'HTTPS');
    await page.locator('#certificate-device-name').fill('Téléphone de démonstration');await page.locator('#certificate-issue').click();
    await page.locator('#certificate-export-password').getByText('Synthetic-only-password-123',{exact:true}).waitFor();
    const download=page.waitForEvent('download').catch(async error=>{console.error(JSON.stringify({errors,requests,actionError:await page.locator('#certificate-action-error').textContent()}));throw error;});await page.locator('#certificate-download').click();assert.equal((await download).suggestedFilename(),'bionic-appareil.p12');
    assert.equal(await page.locator('#certificate-download').isVisible(),false);
    metadata={...metadata,mode:'mtls',devices:[{id:'demo',name:'Téléphone de démonstration',fingerprint,expiresAt,revokedAt:null},{id:'old',name:'Ancienne tablette de démonstration',fingerprint,expiresAt,revokedAt:'2026-01-02T12:00:00Z'}]};
    await refresh();assert.equal(await page.locator('#certificate-mode').textContent(),'HTTPS + certificat client');
    assert.equal(await page.locator('.certificate-device').count(),2);
    assert.match(await page.locator('#certificate-devices').textContent(),/Révoqué/);
    unavailable=true;await refresh();assert.equal(await page.locator('#certificate-error').isVisible(),true);assert.equal(await page.locator('#certificate-data').isVisible(),false);
    assert.equal(await guide.isVisible(),true,'local guide remains available when security status fails');
    unavailable=false;metadata={...metadata,mode:'https',candidate:{mode:'mtls',url:'https://127.0.0.1:9999/proof?token=HIDDEN',expiresAt:new Date(Date.now()+3600000).toISOString()}};await refresh();
    assert.match(await page.locator('#certificate-pending').textContent(),/en attente de vérification/);
    assert.equal(await page.locator('body').getByText(/HIDDEN/).count(),0);
    await page.getByText('Détails des certificats',{exact:true}).click();
    assert.equal(await page.locator('#certificate-details').isVisible(),true);
    assert.equal(await page.locator('#certificate-controls').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator('.settings-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    if(captures)await page.screenshot({path:path.join(captures,width+'-certificates.png')});
    await page.locator('#certificate-refresh').press('Escape');
    assert.equal(await page.locator('#settings-view').isVisible(),false);
    assert.equal(await page.locator('#certificate-export-password').textContent(),'');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'settings-open-sidebar');
    await openConnection(page);await page.locator('#certificate-mode').getByText('HTTPS',{exact:true}).waitFor();await page.locator('#settings-close').click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'settings-open-sidebar');
    assert.deepEqual(errors,[]);assert.ok(requests.filter(item=>item.path==='/api/security/status').every(item=>item.method==='GET'));
    results.push({width,passed:true,securityReads:requests.filter(item=>item.path==='/api/security/status').length});
    await context.close();
  }
  console.log(JSON.stringify({mode:'synthetic certificate UI',results,limitations:['Données de certificats fictives.','Navigateur de bureau avec viewport mobile simulé ; aucun appareil physique ni transport TLS validé par ce script.']},null,2));
}finally{await browser.close();}
