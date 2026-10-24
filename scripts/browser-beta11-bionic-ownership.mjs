// Chromium + intercepted HTTP only; Desktop/API ownership and stops are synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),publicRoot=path.resolve(process.env.BIONIC_BROWSER_PUBLIC_DIR||path.join(root,'public'));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'}),results=[];
const origin='http://beta11-bionic-ownership.test',nonce='synthetic-ownership-nonce';
try{for(const language of ['fr','en']){
  const width=390,instanceId='bionic-ownership-'+language,t=(fr,en)=>language==='fr'?fr:en;
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage(),posts=[],errors=[];
  const state={ownership:'desktop-and-api',desktop:'running',api:true,recovery:false,allowStop:true,revision:1,desktopStops:0,apiStops:0,operation:null};
  const service=()=>({id:'bionic',revision:'service-'+state.revision,controlMode:state.ownership==='external'?'observe-only':'bionic-cli',configuration:{status:'configured'},process:{state:state.desktop==='stopped'?'stopped':'running',ownership:state.ownership,desktopState:state.desktop,recoveryStop:state.recovery},api:{state:state.api?'ready':'unreachable'},activity:{state:'idle'},model:{state:'unloaded'},actions:{start:{allowed:false},stop:{allowed:state.allowStop&&state.ownership!=='external'&&state.ownership!=='unknown'&&(state.api||state.recovery)},restart:{allowed:false}},operation:state.operation});
  await page.addInitScript(({instanceId,language})=>localStorage.setItem('bionic:llama-preferences:'+instanceId,JSON.stringify({language})),{instanceId,language});
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);let value;
    if(url.pathname.startsWith('/api/')){
      const body=req.method()==='POST'?req.postDataJSON():null;
      if(url.pathname==='/api/ping')value={instanceId,version:'2.6.0-beta.11'};
      else if(url.pathname==='/api/projects')value={projects:[{id:'p1',name:'Projet synthétique'}]};
      else if(url.pathname==='/api/sessions')value={sessions:[],total:0};
      else if(url.pathname==='/api/inference/settings')value={provider:'bionic',revision:'engine-1',editable:true,apiUrl:'http://127.0.0.1:19995',llamaUrl:'http://127.0.0.1:19996',csrfNonce:nonce};
      else if(url.pathname==='/api/models')value={provider:'bionic',inferenceRevision:'engine-1',models:[]};
      else if(url.pathname==='/api/llama-server')value={profile:{endpoint:'http://127.0.0.1:19996',directory:'Fixture',revision:'profile-1'},process:{owned:false,state:'configured'},canControl:false};
      else if(url.pathname==='/api/comfy/settings')value={enabled:false,available:false,workflows:[]};
      else if(url.pathname==='/api/local-services')value={services:[service()],csrfNonce:nonce};
      else if(url.pathname==='/api/local-service-setup')value={canConfigure:false,revision:'setup-1',services:[]};
      else if(url.pathname.startsWith('/api/local-service-operations/'))return route.fulfill({status:404,json:{error:'Acceptance remains unknown in this synthetic fixture'}});
      else if(url.pathname==='/api/local-services/bionic/actions'){
        assert.equal(req.headers().origin,origin);assert.equal(req.headers()['x-local-service-csrf'],nonce);assert.equal(body.action,'stop');assert.equal(body.expectedRevision,service().revision);assert.equal(service().actions.stop.allowed,true);assert.match(body.idempotencyKey,/^[a-f0-9-]{36}$/i);assert(!posts.some(item=>item.idempotencyKey===body.idempotencyKey),'Each explicit stop uses a fresh intention id');posts.push(body);
        state.revision++;
        if(posts.length===1){state.api=false;state.apiStops++;state.recovery=true;state.operation={id:body.idempotencyKey,status:'unknown',phase:'desktop-still-running'};return route.abort('connectionfailed');}
        if(state.ownership==='desktop-and-api'){assert.equal(state.recovery,true);state.desktop='stopped';state.desktopStops++;state.recovery=false;}else{assert.equal(state.ownership,'api-only');state.api=false;state.apiStops++;assert.equal(state.desktop,'external');}
        state.operation={id:body.idempotencyKey,status:'succeeded',phase:'done'};value={operation:state.operation};
      }else throw Error('Unexpected synthetic API '+req.method()+' '+url.pathname);
      assert(!body||url.pathname==='/api/local-services/bionic/actions','Reads and reloads never send a stop');return route.fulfill({json:value});
    }
    const filename=path.resolve(publicRoot,url.pathname==='/'?'llama-ui/index.html':url.pathname.slice(1));assert(filename.startsWith(publicRoot+path.sep));return route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(filename)]||'text/html',body:await fs.readFile(filename)});
  });
  const button=(fr,en,scope=page)=>scope.getByRole('button',{name:t(fr,en),exact:true});
  try{
    await page.goto(origin+'/');await page.locator('.companion-shell').waitFor();const nav=button('Ouvrir la navigation','Open navigation');if(await nav.isVisible())await nav.click();await button('Modèles chargés','Loaded models').click();
    const menu=page.getByRole('region',{name:t('Modèles chargés','Loaded models'),exact:true}),manager=menu.getByRole('region',{name:t('Pilotage des moteurs et modèles','Engine and model controls'),exact:true});await button('Serveur Bionic','Bionic server',manager).click();
    const region=manager.getByRole('region',{name:'Bionic',exact:true});await region.locator('[data-service-ownership="desktop-and-api"]').waitFor();assert.equal(await region.locator('[data-desktop-state="running"]').innerText(),t('En cours','Running'));
    await button('Arrêter Bionic','Stop Bionic',manager).click();const confirm=manager.getByRole('group',{name:t('Confirmer l’action du serveur','Confirm server action'),exact:true});assert.match(await confirm.innerText(),language==='fr'?/arrête l’API et ferme l’application Bionic démarrée par Canaé/:/stops the API and closes the Bionic application started by Canaé/);assert.equal(posts.length,0);await button('Confirmer','Confirm',confirm).click();
    await button('Vérifier le suivi','Check tracking',manager).waitFor();await region.getByText('unreachable',{exact:true}).waitFor();await region.locator('[data-desktop-state="running"]').waitFor();assert.equal(state.api,false);assert.equal(state.desktopStops,0);assert.equal(posts.length,1);
    state.allowStop=false;state.revision++;await button('Vérifier le suivi','Check tracking',manager).click();await region.getByText('unreachable',{exact:true}).waitFor();assert.equal(posts.length,1,'GET recovery does not replay a stop');await page.waitForFunction(label=>[...document.querySelectorAll('.service-section button')].find(item=>item.textContent.trim()===label)?.disabled,t('Arrêter Bionic','Stop Bionic'));assert(await button('Arrêter Bionic','Stop Bionic',manager).isDisabled(),'Recovery never bypasses the server action refusal');state.allowStop=true;state.revision++;await button('Vérifier le suivi','Check tracking',manager).click();await button('Arrêter Bionic','Stop Bionic',manager).click({trial:true});assert(await button('Arrêter Bionic','Stop Bionic',manager).isEnabled(),'The explicitly permitted recovery stop is not blocked by old local pending tracking');
    await button('Arrêter Bionic','Stop Bionic',manager).click();assert.match(await confirm.innerText(),language==='fr'?/nouvelle demande explicite ferme l’application Bionic/:/new explicit request closes the Bionic application/);await button('Annuler','Cancel',confirm).click();assert.equal(posts.length,1);await button('Arrêter Bionic','Stop Bionic',manager).click();await button('Confirmer','Confirm',confirm).click();await button('Actualiser les états','Refresh status',manager).click();await region.locator('[data-desktop-state="stopped"]').waitFor();assert.equal(posts.length,2);assert.notEqual(posts[0].idempotencyKey,posts[1].idempotencyKey);assert.equal(state.desktopStops,1);
    state.ownership='api-only';state.desktop='external';state.api=true;state.revision++;await button('Actualiser les états','Refresh status',manager).click();await region.locator('[data-service-ownership="api-only"]').waitFor();await button('Arrêter Bionic','Stop Bionic',manager).click();assert.match(await confirm.innerText(),language==='fr'?/uniquement l’API.*externe n’est pas fermée/:/only the API.*does not close the external/s);await button('Confirmer','Confirm',confirm).click();await button('Actualiser les états','Refresh status',manager).click();await region.locator('[data-desktop-state="external"]').waitFor();assert.equal(state.desktopStops,1);assert.equal(state.api,false);
    state.ownership='external';state.desktop='external';state.api=true;state.revision++;await button('Actualiser les états','Refresh status',manager).click();await region.locator('[data-service-ownership="external"]').waitFor();assert(await button('Arrêter Bionic','Stop Bionic',manager).isDisabled());assert.equal(posts.length,3);
    state.ownership=undefined;state.desktop=undefined;state.allowStop=false;state.revision++;await button('Actualiser les états','Refresh status',manager).click();await region.locator('[data-desktop-state="unknown"]').waitFor();assert.equal(await region.locator('[data-service-ownership="unknown"]').innerText(),t('Propriété inconnue','Ownership unknown'));assert.equal(await region.locator('[data-desktop-state="unknown"]').innerText(),t('Inconnu','Unknown'));assert.equal(posts.length,3);assert.deepEqual(errors,[]);
    results.push({width,language,desktopAndApiCopy:true,unknownStopReadWithoutReplay:true,recoveryPermissionRespected:true,explicitRecoveryStopWithFreshId:true,cancelBeforeEffect:true,apiOnlyDoesNotCloseDesktop:true,externalStopDisabled:true,unknownOwnershipHonest:true,posts:posts.length,desktopStops:state.desktopStops,noNativeProcess:true});
  }catch(error){console.error(JSON.stringify({language,state,posts,errors}));throw error;}finally{await context.close();}
}console.log(JSON.stringify({ok:true,syntheticHTTP:true,results},null,2));}finally{await browser.close();}
