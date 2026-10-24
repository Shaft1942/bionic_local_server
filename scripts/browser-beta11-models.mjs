// Real Chromium, fully intercepted HTTP: no real model, process, ComfyUI or GPU.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const sourceRoot=fileURLToPath(new URL('../',import.meta.url)),publicRoot=path.resolve(process.env.BIONIC_BROWSER_PUBLIC_DIR||path.join(sourceRoot,'public'));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'}),results=[];
const origin='http://beta11-models.test',nonce='fixture-control-nonce';
try{for(const width of [1280,390,320])for(const language of ['fr','en']){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<760,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],posts=[];
  const t=(fr,en)=>language==='fr'?fr:en,instanceId='beta11-models-'+width+'-'+language;
  const state={provider:'bionic',revision:1,bionic:false,comfy:false,loaded:false,catalogueUnavailable:false,llama:'configured',llamaOwned:false,gguf:'gguf-a',free:null};
  const current=()=>({provider:state.provider,revision:'engine-'+state.revision,editable:true,busy:false,reconciliationRequired:false,apiUrl:'http://127.0.0.1:19995',llamaUrl:'http://127.0.0.1:19997',hasLlamaToken:false,csrfNonce:nonce});
  const model=()=>({id:'bionic-cold',name:'Modèle froid synthétique',type:'llm',loaded:state.loaded,inferenceId:state.loaded?'instance-cold':null,contextLength:4096,loadedInstances:state.loaded?[{id:'instance-cold',contextLength:4096}]:[],reasoning:{allowedOptions:['off','on']}});
  const profile=()=>({profile:{revision:'profile-1',directory:'Fixture',binaryPath:'Fixture/llama-server.exe',endpoint:'http://127.0.0.1:19996',port:19996,contextSize:4096,gpuLayers:0,modelId:'gguf-a'},process:{state:state.llama,owned:state.llamaOwned,...(state.llamaOwned?{model:{id:state.gguf,name:state.gguf+'.gguf',inferenceAlias:'owned-alias'}}:{})},canControl:true,canConfigureLocal:false,csrfNonce:nonce,lifecycle:{active:false,reconciliationRequired:false}});
  const services=()=>['bionic','comfyui'].map(id=>{const running=id==='bionic'?state.bionic:state.comfy;return{id,revision:id+'-'+Number(running),configuration:{status:'configured'},controlMode:'owned-process',process:{state:running?'running':'stopped'},api:{state:running?'ready':'unreachable'},activity:{state:'idle'},model:{state:state.loaded&&id==='bionic'?'loaded':'unloaded'},actions:{start:{allowed:!running},stop:{allowed:running},restart:{allowed:running}}};});
  const imageSettings=()=>({enabled:true,available:state.comfy,url:'http://127.0.0.1:19998',workflowId:'krea2_turbo',modelPolicy:'keep',workflows:[{id:'krea2_turbo',label:'Krea 2 synthétique'},{id:'hassaku_illustrious',label:'Hassaku synthétique'}]});
  let releaseLoad,enteredLoad;const loadGate=new Promise(resolve=>releaseLoad=resolve),loadEntered=new Promise(resolve=>enteredLoad=resolve);
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());page.setDefaultTimeout(12000);
  await page.addInitScript(({instanceId,language})=>{localStorage.setItem('bionic:llama-preferences:'+instanceId,JSON.stringify({language}));},{instanceId,language});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);let value;
    if(url.pathname.startsWith('/api/')){
      const body=req.method()==='POST'?req.postDataJSON():null;if(body)posts.push({path:url.pathname,body});
      if(url.pathname==='/api/ping')value={instanceId,version:'2.6.0-beta.11'};
      else if(url.pathname==='/api/projects')value={projects:[{id:'p1',name:'Projet synthétique'}]};
      else if(url.pathname==='/api/sessions')value={sessions:[],total:0};
      else if(url.pathname==='/api/inference/settings'){
        if(body){assert.equal(body.expectedRevision,current().revision);state.provider=body.provider;state.revision++;}value=current();
      }
      else if(url.pathname==='/api/models'){
        if(state.provider==='bionic'&&(!state.bionic||state.catalogueUnavailable))return route.fulfill({status:503,json:{error:'API Bionic synthétique arrêtée ou lecture momentanément indisponible.'}});
        value={models:state.provider==='bionic'?[model()]:[{id:'external-model',name:'GGUF externe synthétique',type:'llm',loaded:true,loadedInstances:[],contextLength:4096}],provider:state.provider,inferenceRevision:current().revision,generationActive:false,unloading:false,reconciliationRequired:false,csrfNonce:nonce};
      }
      else if(url.pathname==='/api/models/load'){
        assert.equal(req.headers()['x-local-service-csrf'],nonce);assert.deepEqual(body,{modelId:'bionic-cold',expectedInferenceRevision:current().revision,consent:true});enteredLoad();await loadGate;state.loaded=true;state.catalogueUnavailable=true;return route.abort('connectionfailed');
      }
      else if(url.pathname==='/api/models/unload'){assert.deepEqual(body,{instanceId:'instance-cold',expectedInferenceRevision:current().revision});state.loaded=false;value={instanceId:'instance-cold',unloaded:true};}
      else if(url.pathname==='/api/local-services')value={services:services(),csrfNonce:nonce};
      else if(url.pathname==='/api/local-service-setup')value={canConfigure:false,revision:'setup',services:[]};
      else if(/^\/api\/local-services\/(bionic|comfyui)\/actions$/.test(url.pathname)){
        assert.equal(req.headers()['x-local-service-csrf'],nonce);const id=url.pathname.split('/')[3],before=services().find(item=>item.id===id);assert.equal(body.expectedRevision,before.revision);assert.equal(before.actions[body.action].allowed,true);if(id==='bionic')state.bionic=body.action!=='stop';else state.comfy=body.action!=='stop';value={operation:{id:body.idempotencyKey,status:'succeeded',phase:'done'}};
      }
      else if(url.pathname.startsWith('/api/local-service-operations/'))value={operation:{id:url.pathname.split('/').at(-1),status:'succeeded',phase:'done'}};
      else if(url.pathname==='/api/llama-server')value=profile();
      else if(url.pathname==='/api/llama-server/models')value={models:['gguf-a','gguf-b'].map(id=>({id,name:id+'.gguf',relativePath:id+'.gguf',size:1024,selectable:true})),excludedProjectors:0};
      else if(url.pathname==='/api/llama-server/action'){
        assert.equal(req.headers()['x-local-service-csrf'],nonce);assert.equal(body.expectedRevision,'profile-1');assert.equal(body.consent,true);if(body.action==='start'){assert.equal(body.modelId,'gguf-b');state.gguf=body.modelId;state.llama='running';state.llamaOwned=true;}else{assert.equal(body.action,'stop');assert.equal(state.llamaOwned,true);state.llama='stopped';state.llamaOwned=false;}value=profile();
      }
      else if(url.pathname==='/api/inference/model-selection')value={editable:true,busy:false,reconciliationRequired:false,inference:current(),inferenceRevision:current().revision,profileRevision:'profile-1',csrfNonce:nonce};
      else if(url.pathname==='/api/comfy/settings')value=imageSettings();
      else if(url.pathname==='/api/comfy/free'){
        if(body){assert.equal(req.headers()['x-local-service-csrf'],nonce);assert.equal(body.expectedRevision,'memory-1');assert.equal(body.consent,true);state.free={requestId:body.requestId,state:'accepted',verified:false};return route.abort('connectionfailed');}value={url:imageSettings().url,revision:'memory-1',canUnload:state.comfy,reason:state.comfy?'':'Serveur arrêté',csrfNonce:nonce,operation:state.free};
      }
      else throw Error('Unexpected synthetic API '+req.method()+' '+url.pathname);
      return route.fulfill({json:value});
    }
    const filename=path.resolve(publicRoot,url.pathname==='/'?'llama-ui/index.html':url.pathname.slice(1));assert(filename.startsWith(publicRoot+path.sep));
    return route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(filename)]||'text/html',body:await fs.readFile(filename)});
  });
  const button=(fr,en,scope=page)=>scope.getByRole('button',{name:t(fr,en),exact:true});
  try{
    await page.goto(origin+'/');await page.locator('.companion-shell').waitFor();const nav=button('Ouvrir la navigation','Open navigation');if(await nav.isVisible())await nav.click();await button('Modèles chargés','Loaded models').click();
    const menu=page.getByRole('region',{name:t('Modèles chargés','Loaded models'),exact:true}),manager=menu.getByRole('region',{name:t('Pilotage des moteurs et modèles','Engine and model controls'),exact:true});
    await manager.getByText(t('Catalogue Bionic inconnu. Démarre son serveur ou vérifie la connexion ; une liste indisponible ne signifie pas qu’aucun modèle n’est installé.','Bionic catalogue unknown. Start its server or check the connection; an unavailable list does not mean no models are installed.'),{exact:true}).waitFor();
    assert(await page.locator('.global-notice.error').isVisible(),'The initial unavailable catalogue is reported in the chat');
    await button('Démarrer ou vérifier Bionic','Start or check Bionic',manager).click();
    await button('Démarrer Bionic','Start Bionic',manager).click();assert.equal(posts.length,0,'Reviewing an action never starts a server');await button('Confirmer','Confirm',manager).click();
    await button('Actualiser les états','Refresh status',manager).click();await button('Arrêter Bionic','Stop Bionic',manager).click({trial:true});assert.equal(await button('Arrêter Bionic','Stop Bionic',manager).isEnabled(),true);
    await button('Modèles','Models',manager).click();const row=manager.locator('[data-model-id="bionic-cold"]');await row.getByText(t('Disponible','Available'),{exact:true}).waitFor();
    const load=button('Charger Modèle froid synthétique','Load Modèle froid synthétique',row);await load.click();await loadEntered;await row.getByText(t('Chargement…','Loading…'),{exact:true}).first().waitFor();assert(await load.isDisabled());releaseLoad();
    await manager.getByText(t('Modèle froid synthétique · Inconnu · relis les états avant toute autre demande. Aucun nouvel envoi automatique.','Modèle froid synthétique · Unknown · refresh status before another request. No automatic resubmission.'),{exact:true}).waitFor();state.catalogueUnavailable=false;await button('Relire les états','Refresh status',manager).click();await row.getByText(t('Chargé','Loaded'),{exact:true}).waitFor();assert.equal(posts.filter(item=>item.path==='/api/models/load').length,1,'Lost load and failed GET are recovered by GET only');
    await page.waitForFunction(()=>!document.querySelector('.global-notice.error'));
    await menu.getByRole('button',{name:t('Décharger ','Unload ')+'Modèle froid synthétique · instance-cold',exact:true}).click();await row.getByText(t('Disponible','Available'),{exact:true}).waitFor();
    await button('Serveur Bionic','Bionic server',manager).click();await button('Actualiser les états','Refresh status',manager).click();await button('Arrêter Bionic','Stop Bionic',manager).click();await button('Confirmer','Confirm',manager).click();assert.equal(state.bionic,false);
    await button('Serveur llama.cpp','llama.cpp server',manager).click();await manager.locator('#model-management-llama-library-model').selectOption('gguf-b');await manager.getByRole('checkbox',{name:t('Les autres modèles sont déchargés ; j’autorise ce lancement ou ce remplacement.','Other models are unloaded; I authorize this start or replacement.'),exact:true}).check();
    await button('Démarrer le profil','Start profile',manager).click();await manager.getByText('gguf-b.gguf',{exact:true}).first().waitFor();assert.equal(state.llamaOwned,true);await button('Arrêter le processus possédé','Stop owned process',manager).click();assert.equal(state.llamaOwned,false);
    state.llama='detected-unowned';await button('Actualiser l’état','Refresh status',manager).click();assert.equal(await button('Arrêter le processus possédé','Stop owned process',manager).isDisabled(),true);assert.equal(await button('Démarrer le profil','Start profile',manager).isDisabled(),true);
    await button('Modèles','Models',manager).click();await manager.getByLabel(t('Moteur pour tous les chats','Engine for all chats'),{exact:true}).selectOption('llamacpp');await button('Appliquer le moteur','Apply engine',manager).click();await menu.getByRole('heading',{name:'GGUF externe synthétique',exact:true}).waitFor();assert.equal(posts.filter(item=>item.path==='/api/llama-server/action').length,2,'External processes are never stopped or adopted');
    await button('Serveur d’images','Image server',manager).click();await button('Démarrer ComfyUI','Start ComfyUI',manager).click();await button('Confirmer','Confirm',manager).click();await button('Actualiser les états','Refresh status',manager).click();await button('Relire les modèles d’images','Refresh image models',manager).click();await button('Décharger les modèles d’images','Unload image models',manager).click();await manager.getByText(t('Demande acceptée. La fin du déchargement et la mémoire libérée ne sont pas confirmées par ce protocole.','Request accepted. Completion of unloading and released memory are not confirmed by this protocol.'),{exact:true}).waitFor();await button('Relire les modèles d’images','Refresh image models',manager).click();assert.equal(posts.filter(item=>item.path==='/api/comfy/free').length,1);
    await button('Arrêter ComfyUI','Stop ComfyUI',manager).click();await button('Confirmer','Confirm',manager).click();assert.equal(state.comfy,false);
    assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    results.push({width,language,unavailableCatalogueActionable:true,bionicOwnedStartStop:true,loadStateVisible:true,lostLoadRecoveredWithoutReplay:true,unload:true,ggufChosenAndOwnedCycle:true,externalProtectedAndUsable:true,comfyOwnedCycle:true,imageFreeAcceptedNotVerified:true,posts:posts.length,noRealServices:true});
  }catch(error){console.error(JSON.stringify({width,language,state,posts:posts.map(item=>item.path),errors,controls:(await page.locator('.model-management').innerText()).slice(-3500)}));throw error;}finally{releaseLoad();await context.close();}
}console.log(JSON.stringify({ok:true,syntheticHTTP:true,results},null,2));}finally{await browser.close();}
