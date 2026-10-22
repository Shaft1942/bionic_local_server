// Isolated UI proof: synthetic certificate metadata and HTTP routes, no live service.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const captures=process.env.BIONIC_SMOKE_SCREENSHOTS;
if(captures)await fs.mkdir(captures,{recursive:true});
const browser=await chromium.launch({headless:true});
const origin='http://bionic-certificates.test',results=[];
const fingerprint=Array(32).fill('AB').join(':');
const expiresAt=new Date(Date.now()+365*86400000).toISOString();
const bootstrap=`
  const state={authenticated:true,authEpoch:1,projectId:null,chat:null,viewKey:'synthetic',status:{models:[{id:'test',name:'Modèle de démonstration'}]}};
  document.getElementById('login').hidden=true;
  document.getElementById('app').hidden=false;
  const option=document.createElement('option');option.value='test';option.textContent='Modèle de démonstration';document.getElementById('model').append(option);
  createCompanionSettings({api:async(route,options)=>{const reply=await fetch(route,options);if(!reply.ok)throw Error('Indisponible');return reply.json();},getState:()=>state,node:(tag,className,text)=>{const el=document.createElement(tag);el.className=className;el.textContent=text;return el;}});
`;
try{
  for(const width of [1440,390]){
    let metadata={mode:'http',epoch:1,server:null,authority:null,devices:[]},unavailable=false;
    const errors=[],requests=[];
    const context=await browser.newContext({viewport:{width,height:1100}}),page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(6000);
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin)return route.abort();
      if(!url.pathname.startsWith('/api/')){
        const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
        if(!/^[\w.-]+$/.test(file))return route.abort();
        return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/svg+xml',body:file==='app.js'?bootstrap:await fs.readFile(path.join(root,'public',file))});
      }
      requests.push({path:url.pathname,method:request.method()});
      if(url.pathname==='/api/security/status'&&unavailable)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
      let data={};
      if(url.pathname==='/api/security/status')data=metadata;
      if(url.pathname==='/api/model-preferences')data={source:'auto',automatic:true,maxOutputTokens:8192,contextLength:16000,applyToAllSessions:false};
      if(url.pathname==='/api/comfy/settings')data={enabled:false,url:'http://127.0.0.1:8188',workflowId:'krea2_turbo',activeJobs:0,workflows:[{id:'krea2_turbo',label:'Krea 2 Turbo'}]};
      if(url.pathname==='/api/capabilities')data={items:[]};
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(origin);await page.locator('#settings-open-sidebar').click();
    await page.locator('#certificate-mode').getByText('HTTP',{exact:true}).waitFor();
    assert.match(await page.locator('#certificate-description').textContent(),/ne sont pas chiffrés/);
    const refresh=async()=>{await page.locator('#certificate-refresh').click();await page.locator('#certificate-refresh').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('certificate-refresh').disabled);};
    metadata={...metadata,mode:'https',server:{fingerprint,expiresAt,hosts:['127.0.0.1','bionic.local']},authority:{fingerprint,expiresAt}};
    await refresh();assert.equal(await page.locator('#certificate-mode').textContent(),'HTTPS');
    metadata={...metadata,mode:'mtls',devices:[{id:'demo',name:'Téléphone de démonstration',fingerprint,expiresAt,revokedAt:null},{id:'old',name:'Ancienne tablette de démonstration',fingerprint,expiresAt,revokedAt:'2026-01-02T12:00:00Z'}]};
    await refresh();assert.equal(await page.locator('#certificate-mode').textContent(),'HTTPS + certificat client');
    assert.equal(await page.locator('.certificate-device').count(),2);
    assert.match(await page.locator('#certificate-devices').textContent(),/Révoqué/);
    unavailable=true;await refresh();assert.equal(await page.locator('#certificate-error').isVisible(),true);assert.equal(await page.locator('#certificate-data').isVisible(),false);
    unavailable=false;metadata={...metadata,mode:'https',candidate:{mode:'mtls',url:'https://127.0.0.1:9999/proof?token=HIDDEN',expiresAt:new Date(Date.now()+3600000).toISOString()}};await refresh();
    assert.match(await page.locator('#certificate-pending').textContent(),/en attente de vérification/);
    assert.equal(await page.locator('body').getByText(/HIDDEN/).count(),0);
    await page.locator('.certificate-technical summary').click();
    assert.equal(await page.locator('#certificate-details').isVisible(),true);
    assert.equal(await page.locator('#certificate-data button,#certificate-data a,#certificate-data input,#certificate-data form').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator('.settings-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    if(captures)await page.screenshot({path:path.join(captures,width+'-certificates.png')});
    await page.locator('#certificate-refresh').press('Escape');
    assert.equal(await page.locator('#settings-view').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'settings-open-sidebar');
    await page.locator('#settings-open-sidebar').click();await page.locator('#certificate-mode').getByText('HTTPS',{exact:true}).waitFor();await page.locator('#settings-close').click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'settings-open-sidebar');
    assert.deepEqual(errors,[]);assert.ok(requests.filter(item=>item.path==='/api/security/status').every(item=>item.method==='GET'));
    results.push({width,passed:true,securityReads:requests.filter(item=>item.path==='/api/security/status').length});
    await context.close();
  }
  console.log(JSON.stringify({mode:'synthetic certificate UI',results,limitations:['Données de certificats fictives.','Navigateur de bureau avec viewport mobile simulé ; aucun appareil physique ni transport TLS validé par ce script.']},null,2));
}finally{await browser.close();}
