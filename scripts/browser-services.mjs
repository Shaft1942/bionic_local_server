// Synthetic settings harness: no engine, model or personal server is contacted.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,...(process.env.BIONIC_BROWSER_CHANNEL?{channel:process.env.BIONIC_BROWSER_CHANNEL}:{})});
const origin='http://services.test',captures=process.env.BIONIC_SMOKE_SCREENSHOTS;
if(captures)await fs.mkdir(captures,{recursive:true});
const mount=`const node=(tag,className='',text='')=>{const target=document.createElement(tag);target.className=className;target.textContent=text;return target;};
const fixtureState={authenticated:true,authEpoch:1,viewKey:'synthetic-new',status:{models:[]},projects:[]};
const api=async(route,options={})=>{const r=await fetch(route,{...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await r.json();if(!r.ok)throw Object.assign(Error('Synthetic API refusal'),{status:r.status,code:data.code});return data;};
window.settingsFixture=createCompanionSettings({api,node,getState:()=>fixtureState});document.getElementById('login').hidden=true;document.getElementById('app').hidden=false;`;
const service=(id,extra={})=>({id,revision:'synthetic-1',configuration:{status:'valid'},controlMode:'owned-process',process:{state:'running'},api:{state:'ready',observedAt:'2026-10-23T14:30:00Z'},model:{state:'unknown'},activity:{state:'idle',observedAt:'2026-10-23T14:30:00Z'},actions:{start:{allowed:false,reasonCode:'already_running'},stop:{allowed:true},restart:{allowed:true}},...extra});
const results=[];
try{for(const [width,height]of [[375,812],[812,375],[1280,900]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',locale:'fr-FR'}),page=await context.newPage(),errors=[],writes=[];let reads=0,lostResponse=false,operation=null;
  let services=[service('bionic',{configuration:{status:'unconfigured'},controlMode:'observe-only',process:{state:'external'},activity:{state:'unknown'},actions:{start:{allowed:false,reasonCode:'setup_required'},stop:{allowed:false,reasonCode:'setup_required'},restart:{allowed:false,reasonCode:'setup_required'}}}),service('comfyui')];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());if(url.origin!==origin){errors.push('Unexpected outbound request');return route.abort();}
    if(url.pathname==='/services-fixture.js')return route.fulfill({contentType:'text/javascript',body:mount});
    if(url.pathname.startsWith('/api/')){
      let data={};
      if(url.pathname==='/api/local-services'){reads++;data={services,csrfNonce:'synthetic-csrf'};}
      else if(url.pathname.endsWith('/actions')){const input=request.postDataJSON();assert.equal(request.headers()['x-local-service-csrf'],'synthetic-csrf');writes.push(input);operation={id:'synthetic-operation',idempotencyKey:input.idempotencyKey,action:input.action,status:'running',phase:'checking',startedAt:new Date().toISOString()};services[1]={...services[1],revision:'synthetic-2',operation,actions:{start:{allowed:false,reasonCode:'operation_active'},stop:{allowed:false,reasonCode:'operation_active'},restart:{allowed:false,reasonCode:'operation_active'}}};if(lostResponse)return route.abort();data=operation;}
      else if(url.pathname.startsWith('/api/local-service-operations/'))data=operation||{};
      else if(url.pathname==='/api/model-preferences')data={source:'auto',automatic:true,maxOutputTokens:8192};
      else if(url.pathname==='/api/comfy/settings')data={enabled:false,url:'http://127.0.0.1:8188',workflowId:'synthetic',activeJobs:0,workflows:[{id:'synthetic',label:'Synthetic workflow'}],loraProfiles:{synthetic:[]}};
      else if(url.pathname==='/api/comfy/loras')data={loras:[]};
      else if(url.pathname==='/api/capabilities')data={items:[]};
      else if(url.pathname==='/api/updates')data={currentVersion:'2.5.0-beta.2',canInstall:false,installation:{status:'idle'}};
      else if(url.pathname==='/api/security/status')data={mode:'http',web:{}};
      else if(url.pathname==='/api/local-services/configuration/reload')data={services};
      else{errors.push('Missing synthetic route '+url.pathname);return route.fulfill({status:500,body:'{}'});}
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    }
    const relative=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!/^(?:locales\/(?:fr|en)\/[a-z-]+\.js|[a-z0-9.-]+)$/i.test(relative))return route.abort();
    let body=await fs.readFile(path.join(root,'public',relative));if(relative==='index.html')body=body.toString().replace('<script src="/app.js" defer></script>','<script src="/services-fixture.js" defer></script>');
    return route.fulfill({contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.html')?'text/html':'application/json',body});
  });
  try{
    await page.goto(origin);await page.locator('#settings-open-sidebar').click();await page.locator('#settings-search').fill('redémarrer');await page.locator('.settings-search-result').getByText('Serveurs sur le PC',{exact:true}).click();await page.locator('#launcher-comfyui-stop').waitFor();
    assert.equal(await page.locator('#launcher-bionic-start').isVisible(),false);assert.equal(await page.locator('#launcher-comfyui-stop').isEnabled(),true);
    await page.locator('#launcher-comfyui-stop').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'launcher-comfyui-confirm-title');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Annuler');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'launcher-comfyui-stop');assert.equal(await page.locator('#settings-view').isVisible(),true);assert.equal(writes.length,0);
    await page.locator('#launcher-comfyui-restart').click();await page.evaluate(()=>BionicI18n.setLanguage('en'));assert.equal(await page.evaluate(()=>document.activeElement.id),'launcher-comfyui-confirm-title');assert.equal(await page.locator('#launcher-comfyui-confirm-title').textContent(),'Restart ComfyUI?');if(captures)await page.screenshot({path:path.join(captures,width+'-services-confirm-en.png')});
    await page.keyboard.press('Escape');await page.evaluate(()=>BionicI18n.setLanguage('fr'));
    await page.locator('#launcher-comfyui-stop').click();services[1]={...services[1],revision:'activity-changed',activity:{state:'busy',count:1},actions:{start:{allowed:false},stop:{allowed:false,reasonCode:'service_busy'},restart:{allowed:false,reasonCode:'service_busy'}}};await page.getByRole('button',{name:'Vérifier l’état',exact:true}).last().click();await page.waitForFunction(()=>document.getElementById('launcher-comfyui').textContent.includes('travail actif'));assert.equal(await page.getByRole('button',{name:'Confirmer l’arrêt de ComfyUI',exact:true}).isDisabled(),true);assert.equal(writes.length,0);await page.keyboard.press('Escape');
    services[1]=service('comfyui');await page.getByRole('button',{name:'Vérifier l’état',exact:true}).last().click();await page.locator('#launcher-comfyui-restart').click();lostResponse=true;await page.getByRole('button',{name:'Confirmer le redémarrage de ComfyUI',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.local-service-operation:not([hidden])')?.textContent.includes('Vérification des travaux'));assert.equal(writes.length,1);
    await page.locator('#settings-close').click();const afterClose=reads;await page.waitForTimeout(2700);assert.equal(reads,afterClose,'polling stops outside settings');await page.evaluate(()=>settingsFixture.openService('comfyui'));assert.equal(writes.length,1,'reopening never resubmits');await page.locator('#launcher-comfyui-title').waitFor();
    await page.evaluate(()=>{document.documentElement.style.fontSize='20px';});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow with enlarged text');if(captures)await page.screenshot({path:path.join(captures,width+'-services-follow-up-fr.png')});assert.deepEqual(errors,[]);results.push({width,height,commands:writes.length,requests:reads,status:'passed'});
  }finally{await context.close();}
}}finally{await browser.close();}
console.log(JSON.stringify({synthetic:true,results},null,2));
