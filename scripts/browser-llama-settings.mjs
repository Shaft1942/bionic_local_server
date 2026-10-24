// All API data and effects are synthetic. This never contacts an engine, GPU or PC service.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'});
const origin='http://llama-settings.test',captures=process.env.BIONIC_SMOKE_SCREENSHOTS;
if(captures)await fs.mkdir(captures,{recursive:true});
const results=[];
function fixture(){
  const writes=[],reads=[];let dropSave=false,revision=1;
  let inference={provider:'bionic',apiUrl:'http://127.0.0.1:1234',llamaUrl:'http://127.0.0.1:1236',revision:'inference-1',editable:true,busy:false,hasBionicToken:false,hasLlamaToken:false,capabilities:{modelManagement:true}};
  let globalLimit=8192,sessionLimit=2000;
  const resolveOutput=()=>({model:'fixture-model',automatic:false,maxOutputTokens:sessionLimit??globalLimit,source:sessionLimit!==null?'session':'model',sessionConfigured:sessionLimit!==null,contextLength:16384,applyToAllSessions:sessionLimit===null});
  let output=resolveOutput();
  let comfy={enabled:false,url:'http://127.0.0.1:8188',workflowId:'workflow-a',memoryCleanup:false,modelPolicy:'keep',activeJobs:0,workflows:[{id:'workflow-a',label:'Workflow A synthétique'},{id:'workflow-b',label:'Workflow B synthétique'}],loraProfiles:{'workflow-a':[{name:'fixture/lora-a.safetensors',strength:3.5}],'workflow-b':[]}};
  const devices=[{id:'current-device',name:'Appareil courant',fingerprint:'FIXTURE-PUBLIC-CURRENT',expiresAt:'2030-01-01T00:00:00Z'},{id:'other-device',name:'Autre appareil',fingerprint:'FIXTURE-PUBLIC-OTHER',expiresAt:'2030-01-01T00:00:00Z'}];
  let security={mode:'https',server:{hosts:['llama-settings.test'],fingerprint:'FIXTURE-PUBLIC-SERVER',expiresAt:'2030-01-01T00:00:00Z'},authority:{fingerprint:'FIXTURE-PUBLIC-AUTHORITY'},devices,web:{canConfigure:true,canIssueDevice:true,currentDeviceId:'current-device',suggestedHosts:['llama-settings.test'],csrfToken:'fixture-certificate-csrf',proofPortProvisioned:true}};
  let updates={currentVersion:'2.6.0-beta.2',installedChannel:'beta',channel:'stable',enabled:true,canInstall:true,candidate:{version:'2.6.1-beta.1',notes:'Fixture only. No real installation.'},installation:{status:'idle'},lastCheckedAt:Date.now()};
  let services=['bionic','comfyui'].map(id=>({id,revision:'service-1',configuration:{status:'valid',profileLabel:'Profil synthétique'},controlMode:'owned-process',process:{state:'running'},api:{state:'ready'},activity:{state:'idle'},model:{state:'unknown'},actions:{start:{allowed:false},stop:{allowed:true},restart:{allowed:true}}}));
  let setup={canConfigure:true,revision:'setup-1',services:[{id:'bionic',profile:{appPath:'C:\\Fixture\\Bionic.exe',cliPath:'C:\\Fixture\\cli.exe'}},{id:'comfyui',profile:{workingDirectory:'C:\\Fixture\\ComfyUI',pythonPath:'C:\\Fixture\\python.exe',entryPath:'C:\\Fixture\\main.py'}}]};
  async function api(route){
    const req=route.request(),url=new URL(req.url()),pathname=url.pathname,method=req.method();
    if(!pathname.startsWith('/api/'))return false;
    const body=method==='POST'?req.postDataJSON():null;
    if(method==='POST')writes.push({pathname,body,headers:req.headers()});else reads.push(pathname);
    let data={};
    if(pathname==='/api/ping')data={app:'bionic-mobile-local',version:updates.currentVersion,instanceId:'settings-fixture-260-beta2'};
    else if(pathname==='/api/projects')data={projects:[{id:'settings-project',name:'Projet synthétique',locallyOwned:true}]};
    else if(pathname==='/api/sessions')data={sessions:[{id:'web-22222222-2222-4222-8222-222222222222',projectId:'settings-project',source:'web',name:'Chat de plafond synthétique'}]};
    else if(pathname==='/api/conversation')data={id:'web-22222222-2222-4222-8222-222222222222',projectId:'settings-project',source:'web',model:'fixture-model',name:'Chat de plafond synthétique',messages:[{id:'fixture-message',role:'assistant',text:'Session synthétique.',complete:true}],generation:{status:'completed'}};
    else if(pathname==='/api/models')data={models:[{id:'fixture-model',name:'Modèle synthétique',type:'llm',loaded:true,contextLength:16384,tools:true,vision:false,loadedInstances:[],reasoning:null},{id:'fixture-embedding',name:'Embedding synthétique',type:'embedding',loaded:true,contextLength:4096,loadedInstances:[]}]};
    else if(pathname==='/api/inference/settings'){
      if(method==='POST'){
        assert.equal(body.expectedRevision,inference.revision);Object.assign(inference,{provider:body.provider,apiUrl:body.apiUrl,llamaUrl:body.llamaUrl,revision:'inference-'+(++revision)});
        if(dropSave){dropSave=false;await route.abort('connectionreset');return true;}
      }data={...inference,applied:method==='POST'};
    }
    else if(pathname==='/api/inference/check')data={ok:true,provider:body.provider,endpoint:body.provider==='llamacpp'?body.llamaUrl:body.apiUrl,models:[{id:'fixture-model',name:'Modèle synthétique',contextLength:16384}],capabilities:{noGeneration:true}};
    else if(pathname==='/api/model-preferences'){if(method==='POST'){if(body.applyToAllSessions){globalLimit=body.maxOutputTokens??8192;if(body.id)sessionLimit=null;}else sessionLimit=body.maxOutputTokens??8192;output=resolveOutput();}data=output;}
    else if(pathname==='/api/comfy/settings'){if(method==='POST')comfy={...comfy,...body};data=comfy;}
    else if(pathname==='/api/comfy/loras')data={loras:['fixture/lora-a.safetensors','fixture/lora-b.safetensors']};
    else if(pathname==='/api/comfy/check')data={ok:true,reachable:true,url:body.url,memoryCleanup:{compatible:true},workflows:[{id:body.workflowId,models:[{name:'fixture.safetensors',available:true}],errors:[]}]};
    else if(pathname==='/api/comfy/discover')data={servers:[{url:'http://127.0.0.1:8188'}]};
    else if(pathname==='/api/comfy/generations')data={images:[],total:0,nextCursor:null};
    else if(pathname==='/api/comfy/generate'){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Refus synthétique avant génération.'})});return true;}
    else if(pathname==='/api/local-services')data={services,csrfNonce:'fixture-service-csrf'};
    else if(pathname==='/api/local-service-setup') {assert.equal(req.headers()['x-local-service-csrf'],'fixture-service-csrf');data=setup;}
    else if(pathname.startsWith('/api/local-service-setup/')){
      assert.equal(req.headers()['x-local-service-csrf'],'fixture-service-csrf');
      if(pathname.endsWith('/save')){assert.equal(body.exclusiveControl,true);assert.equal(body.expectedRevision,setup.revision);setup={...setup,revision:'setup-2'};data=setup;}
      else data={candidates:[{label:'Installation synthétique',profile:setup.services.find(item=>item.id===body.serviceId).profile}]};
    }
    else if(/^\/api\/local-services\/[^/]+\/actions$/.test(pathname)){
      assert.equal(req.headers()['x-local-service-csrf'],'fixture-service-csrf');assert.equal(body.expectedRevision,'service-1');assert.match(body.idempotencyKey,/^[a-f0-9-]{36}$/);
      const id=pathname.split('/')[3],operation={id:body.idempotencyKey,status:'succeeded',phase:'completed',action:body.action};services=services.map(item=>item.id===id?{...item,operation}:item);data={operation};
    }
    else if(pathname==='/api/local-services/configuration/reload')data={services,csrfNonce:'fixture-service-csrf'};
    else if(pathname==='/api/security/status')data=security;
    else if(pathname==='/api/security/actions'){
      assert.equal(req.headers()['x-bionic-csrf'],'fixture-certificate-csrf');
      if(body.action==='issue-device')data={exportId:'fixture-export',passphrase:'FAKE-PASSWORD-FOR-TEST-ONLY',expiresAt:new Date(Date.now()+60000).toISOString()};
      else if(body.action==='revoke-device'){assert.equal(body.confirmName,'Autre appareil');security={...security,devices:security.devices.map(item=>item.id===body.id?{...item,revokedAt:new Date().toISOString()}:item)};data=security;}
      else if(body.action==='prepare'){security={...security,candidate:{mode:body.mode,expiresAt:new Date(Date.now()+60000).toISOString()},web:{...security.web,proofRequest:{id:'fixture-proof'}}};data={status:security};}
      else {security={...security,candidate:null};data=security;}
    }
    else if(pathname==='/api/updates')data=updates;
    else if(pathname==='/api/updates/preferences'){updates={...updates,...body};data=updates;}
    else if(pathname==='/api/updates/check')data=updates;
    else if(pathname==='/api/updates/ignore'){updates={...updates,ignoredVersion:body.version};data=updates;}
    else if(pathname==='/api/updates/install'){assert.equal(body.confirm,true);updates={...updates,currentVersion:body.version,candidate:null};data={accepted:true};}
    else if(pathname==='/api/diagnostics')data={ok:true,checks:[{name:'Fixture only',ok:true}]};
    else return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'Fixture route unavailable'})}).then(()=>true);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});return true;
  }
  return {api,writes,reads,get inference(){return inference;},get comfy(){return comfy;},get output(){return output;},get updates(){return updates;},drop(){dropSave=true;},busy(value){inference.busy=value;}};
}
try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},locale:'fr-FR',reducedMotion:'reduce'}),page=await context.newPage(),state=fixture(),errors=[],csp=[];
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(/violates the following|content.security.policy|refused to (?:execute|apply|load)/i.test(message.text()))csp.push(message.text());});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());assert.equal(url.origin,origin,'No external network request');if(await state.api(route))return;
    let relative=url.pathname==='/prototype/'?'llama-ui/index.html':url.pathname.replace(/^\//,'');
    const file=path.resolve(root,'public',relative);assert.ok(file.startsWith(path.resolve(root,'public')+path.sep));
    const contentType=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';
    await route.fulfill({contentType,body:await fs.readFile(file),headers:contentType==='text/html'?{'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'"}:{}});
  });
  const category=name=>page.getByRole('navigation',{name:'Catégories des paramètres'}).getByRole('button',{name,exact:true});
  const content=()=>page.locator('.settings-content > .settings-page:visible');
  try{
    await page.addInitScript(()=>localStorage.setItem('bionic:llama-prototype:settings-fixture-260-beta2',JSON.stringify({projectId:'settings-project',chatId:'web-22222222-2222-4222-8222-222222222222',jobs:[]})));
    await page.goto(origin+'/prototype/');
    await page.getByRole('navigation',{name:'Espace du projet',exact:true}).getByRole('button',{name:'Paramètres',exact:true}).click();
    await content().getByLabel('Modèle à régler').waitFor();assert.equal(await content().getByLabel('Modèle à régler').getByRole('option',{name:'Embedding synthétique',exact:false}).count(),0,'Embedding models cannot be configured as conversation models');
    await content().getByLabel('Moteur de conversation').selectOption('llamacpp');
    await content().getByLabel('Adresse de llama-server').fill('http://127.0.0.1:1237');
    await content().getByRole('button',{name:'Tester la connexion',exact:true}).click();await content().getByText('Connexion disponible',{exact:true}).waitFor();
    await content().getByRole('button',{name:'Enregistrer la connexion',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.settings-content')?.textContent.includes('Connexion enregistrée et appliquée'));
    assert.equal(state.inference.provider,'llamacpp');assert.equal(state.inference.llamaUrl,'http://127.0.0.1:1237');
    state.drop();await content().getByLabel('Adresse de llama-server').fill('http://127.0.0.1:1238');await content().getByRole('button',{name:'Enregistrer la connexion',exact:true}).click();
    await content().getByText('État serveur relu. Aucun enregistrement n’a été renvoyé automatiquement.',{exact:true}).waitFor();assert.equal(state.writes.filter(item=>item.pathname==='/api/inference/settings').length,2);assert.equal(state.inference.llamaUrl,'http://127.0.0.1:1238');
    await content().getByLabel('Plafond automatique').uncheck();await content().getByLabel('Maximum de tokens en sortie').fill('4096');await content().getByLabel('Appliquer à toutes les conversations de ce modèle').check();await content().getByRole('button',{name:'Enregistrer le plafond',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.settings-content')?.textContent.includes('Plafond de réponse enregistré'));assert.equal(state.output.maxOutputTokens,4096);assert.equal(state.output.sessionConfigured,false,'Saving a model preference clears the current session override');assert.equal(state.writes.find(item=>item.pathname==='/api/model-preferences').body.id,'web-22222222-2222-4222-8222-222222222222');
    if(captures){await page.locator('.settings-content').evaluate(element=>element.scrollTo(0,0));await page.screenshot({path:path.join(captures,`${width}-native-conversation.png`)});}
    await category('Images et ComfyUI').click();await content().getByLabel('Activer ComfyUI').check();assert.equal(await content().getByLabel('Force 1',{exact:true}).inputValue(),'3.5');await content().getByRole('button',{name:'Enregistrer les réglages images',exact:true}).click();await content().getByText('Réglages ComfyUI enregistrés.',{exact:true}).waitFor();assert.equal(state.comfy.loraProfiles['workflow-a'][0].strength,3.5,'An accepted LoRA strength above 2 is preserved');await content().getByRole('button',{name:'Actualiser le catalogue LoRA',exact:true}).click();await content().getByLabel('LoRA 1',{exact:true}).selectOption('fixture/lora-a.safetensors');await content().getByLabel('Force 1',{exact:true}).fill('0.75');await content().getByRole('button',{name:'Enregistrer les réglages images',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.settings-content')?.textContent.includes('Réglages ComfyUI enregistrés'));assert.equal(state.comfy.loraProfiles['workflow-a'][0].strength,0.75);assert.equal(state.comfy.enabled,true);
    await content().getByRole('button',{name:'Tester le profil',exact:true}).click();await content().getByText('Profil compatible. Aucun travail image lancé.',{exact:true}).waitFor();
    await category('Serveurs du PC').click();const service=content().getByRole('region',{name:'ComfyUI',exact:true});await service.getByRole('button',{name:'Arrêter ComfyUI',exact:true}).click();await content().getByRole('group',{name:'Confirmer l’action du serveur'}).getByRole('button',{name:'Confirmer',exact:true}).click();await content().getByText('Opération acceptée. Le suivi continue sur le serveur.',{exact:true}).waitFor();assert.equal(state.writes.filter(item=>item.pathname==='/api/local-services/comfyui/actions').length,1);
    await service.getByText('Profil de lancement et détails',{exact:true}).click();await service.getByRole('button',{name:'Détecter une installation',exact:true}).click();await service.getByText('Vérifie le profil proposé avant de l’enregistrer.',{exact:true}).count();await service.getByLabel('Confier au compagnon le contrôle exclusif de ce lancement.').check();await service.getByRole('button',{name:'Enregistrer le profil',exact:true}).click();await content().getByText('Profil enregistré.',{exact:true}).waitFor();
    await category('Connexion sécurisée').click();await content().getByLabel('Nom du nouvel appareil').fill('Appareil synthétique');await content().getByRole('button',{name:'Créer un certificat appareil',exact:true}).click();await content().getByRole('group',{name:'Confirmer la modification de sécurité'}).getByRole('button',{name:'Confirmer',exact:true}).click();await content().getByLabel('Mot de passe du certificat').waitFor();assert.equal(await content().getByLabel('Mot de passe du certificat').inputValue(),'FAKE-PASSWORD-FOR-TEST-ONLY');assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('FAKE-PASSWORD-FOR-TEST-ONLY')),false);await content().getByRole('button',{name:'Masquer ces informations',exact:true}).click();
    await content().getByRole('button',{name:'Révoquer cet appareil',exact:true}).click();await content().getByRole('group',{name:'Confirmer la modification de sécurité'}).getByRole('button',{name:'Confirmer',exact:true}).click();await content().getByText('Révoqué',{exact:false}).waitFor();
    await category('Mises à jour et diagnostic').click();await content().getByLabel('Canal de mise à jour').selectOption('beta');await page.waitForFunction(()=>document.querySelector('.settings-content')?.textContent.includes('Le canal bêta propose'));assert.equal(state.updates.channel,'beta');await content().getByRole('button',{name:'Lancer le diagnostic',exact:true}).click();await content().getByLabel('Résultats du diagnostic').waitFor();
    await content().getByRole('button',{name:'Installer cette version',exact:true}).click();await content().getByRole('button',{name:'Confirmer l’installation',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.settings-content')?.textContent.includes('Installation acceptée'));assert.equal(state.writes.filter(item=>item.pathname==='/api/updates/install').length,1);
    await category('Apparence et brouillons').click();await content().getByLabel('Thème',{exact:true}).selectOption('dark');await content().getByLabel('Conserver les brouillons').selectOption('1');await content().getByLabel('Langue de l’interface').selectOption('en');await content().getByRole('heading',{name:'Appearance and drafts',exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.locator('html').evaluate(element=>element.classList.contains('dark')),true);await content().getByLabel('Interface language').selectOption('fr');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No document overflow');assert.equal(state.writes.filter(item=>item.pathname==='/api/chat'||item.pathname==='/api/comfy/generate').length,0,'Settings do not generate');
    await page.getByRole('navigation',{name:'Espace du projet',exact:true}).getByRole('button',{name:'Images',exact:true}).click();
    await page.getByLabel('Description de l’image',{exact:true}).fill('Refus synthétique, aucune image réelle.');
    await page.getByRole('button',{name:'Générer une image',exact:true}).click();
    await page.getByText('Demande refusée. Aucun travail image reçu.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Générer une image',exact:true}).isEnabled(),true,'Deterministic refusal releases the form');
    assert.equal(state.writes.filter(item=>item.pathname==='/api/comfy/generate').length,1);
    await page.reload();await page.getByRole('navigation',{name:'Espace du projet',exact:true}).getByRole('button',{name:'Images',exact:true}).click();
    await page.getByLabel('Description de l’image',{exact:true}).waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent?.trim()==='Générer une image'&&!button.disabled));
    assert.equal(await page.getByRole('button',{name:'Générer une image',exact:true}).isEnabled(),true,'Terminal refusal survives reload');
    await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes('image-tracking'))throw new DOMException('Fixture storage refused','QuotaExceededError');return original.call(this,key,value);};});
    await page.getByRole('button',{name:'Générer une image',exact:true}).click();
    await page.getByText('Aucun envoi effectué. Autorise le stockage local pour conserver le suivi avant de générer.',{exact:true}).waitFor();
    assert.equal(state.writes.filter(item=>item.pathname==='/api/comfy/generate').length,1,'Storage refusal occurs before POST');
    assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);results.push({width,engineSave:2,singleServiceEffect:true,securityCsrf:true,imageSettings:true,maintenance:true,language:true,imageRejectionRecovered:true,storageRefusedBeforePost:true,errors:0,csp:0});
  }finally{await context.close();}
}}finally{await browser.close();}
console.log(JSON.stringify({ok:true,synthetic:true,results},null,2));
