// All APIs and effects are synthetic. No engine, model, GPU or PC service is contacted.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'});
const origin='http://canae-settings.test',captures=process.env.BIONIC_BROWSER_CAPTURES||process.env.BIONIC_SMOKE_SCREENSHOTS;
if(captures)await fs.mkdir(captures,{recursive:true});

function fixture(){
  const writes=[],reads=[];let revision=1,dropSave=false;
  let inference={provider:'bionic',apiUrl:'http://127.0.0.1:19998',llamaUrl:'http://127.0.0.1:1238',revision:'inference-1',editable:true,busy:false,hasBionicToken:false,hasLlamaToken:false};
  let output={model:'fixture-model',automatic:false,maxOutputTokens:8192,source:'model',contextLength:16384,applyToAllSessions:true};
  let comfy={enabled:true,available:true,url:'http://127.0.0.1:19999',workflowId:'fixture-workflow',memoryCleanup:false,modelPolicy:'keep',workflows:[{id:'fixture-workflow',label:'Workflow synthétique'}],loraProfiles:{'fixture-workflow':[{name:'fixture/lora.safetensors',strength:3.5}]}};
  let profile={revision:'profile-1',directory:'C:/Synthetic/Models',binaryPath:'C:/Synthetic/llama-server.exe',port:1238,contextSize:8192,gpuLayers:0,modelId:'fixture-gguf',endpoint:'http://127.0.0.1:1238'};
  const services=['bionic','comfyui'].map(id=>({id,revision:'service-1',configuration:{status:'valid',profileLabel:'Profil synthétique'},controlMode:'owned-process',process:{state:'running'},api:{state:'ready'},activity:{state:'idle'},model:{state:'unknown'},actions:{start:{allowed:false},stop:{allowed:true},restart:{allowed:true}}}));
  const setup={canConfigure:true,revision:'setup-1',services:[{id:'bionic',profile:{appPath:'C:/Synthetic/Bionic.exe',cliPath:'C:/Synthetic/cli.exe'}},{id:'comfyui',profile:{workingDirectory:'C:/Synthetic/ComfyUI',pythonPath:'C:/Synthetic/python.exe',entryPath:'C:/Synthetic/main.py'}}]};
  const llama=()=>({profile,canConfigureLocal:true,canControl:true,csrfNonce:'synthetic-local-service-csrf',process:{state:'stopped',owned:false}});
  async function api(route){
    const req=route.request(),url=new URL(req.url()),pathname=url.pathname,method=req.method();
    if(!pathname.startsWith('/api/'))return false;
    const body=method==='POST'?req.postDataJSON():null;
    if(method==='POST')writes.push({pathname,body});else reads.push(pathname);
    let data;
    if(pathname==='/api/ping')data={app:'bionic-mobile-local',version:'2.6.0-beta.4',instanceId:'canae-engine-settings-fixture'};
    else if(pathname==='/api/projects')data={projects:[{id:'settings-project',name:'Projet synthétique',locallyOwned:true}]};
    else if(pathname==='/api/sessions')data={sessions:[]};
    else if(pathname==='/api/models')data={models:[{id:'fixture-model',name:'Modèle synthétique',type:'llm',loaded:false,contextLength:16384,tools:true,loadedInstances:[],reasoning:null}]};
    else if(pathname==='/api/inference/settings'){
      if(method==='POST'){
        assert.equal(body.expectedRevision,inference.revision);inference={...inference,provider:body.provider,apiUrl:body.apiUrl,llamaUrl:body.llamaUrl,hasBionicToken:!!body.bionicToken,hasLlamaToken:!!body.llamaToken,revision:'inference-'+(++revision)};
        if(dropSave){dropSave=false;await route.abort('connectionreset');return true;}
      }data=inference;
    }
    else if(pathname==='/api/inference/check')data={ok:true,endpoint:body.provider==='llamacpp'?body.llamaUrl:body.apiUrl,models:[{id:'fixture-model',name:'Modèle synthétique',contextLength:16384}]};
    else if(pathname==='/api/model-preferences'){if(method==='POST')output={...output,automatic:body.maxOutputTokens===null,maxOutputTokens:body.maxOutputTokens,applyToAllSessions:body.applyToAllSessions};data=output;}
    else if(pathname==='/api/comfy/settings'){if(method==='POST')comfy={...comfy,...body};data=comfy;}
    else if(pathname==='/api/comfy/generations')data={images:[],total:0,nextCursor:null};
    else if(pathname==='/api/image-provider')data={identity:{provider:'comfyui'}};
    else if(pathname==='/api/local-services')data={services,csrfNonce:'synthetic-local-service-csrf'};
    else if(pathname==='/api/local-service-setup')data=setup;
    else if(pathname==='/api/llama-server')data=llama();
    else if(pathname==='/api/llama-server/models')data={directory:profile.directory,models:[{id:'fixture-gguf',name:'Synthetic GGUF',selectable:true,relativePath:'fixture.gguf',architecture:'synthetic',size:4096}],excludedProjectors:1,truncated:false};
    else if(pathname==='/api/llama-server/settings'){assert.equal(body.expectedRevision,profile.revision);profile={...profile,...body,revision:'profile-2'};data=llama();}
    else return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'Synthetic fixture route unavailable'})}).then(()=>true);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});return true;
  }
  return {api,writes,reads,drop(){dropSave=true;},get inference(){return inference;},get output(){return output;}};
}

const results=[];
try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},locale:'fr-FR',reducedMotion:'reduce'}),page=await context.newPage(),state=fixture(),errors=[],csp=[];
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('console',entry=>{if(/violates the following|content.security.policy|refused to (?:execute|apply|load)/i.test(entry.text()))csp.push(entry.text());});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());assert.equal(url.origin,origin,'No external network request');if(await state.api(route))return;
    const relative=url.pathname==='/prototype/'?'llama-ui/index.html':url.pathname.replace(/^\//,''),file=path.resolve(root,'public',relative);
    assert.ok(file.startsWith(path.resolve(root,'public')+path.sep));
    const contentType=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html';
    await route.fulfill({contentType,body:await fs.readFile(file),headers:contentType==='text/html'?{'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'"}:{}});
  });
  const category=name=>page.getByRole('navigation',{name:'Catégories des paramètres',exact:true}).getByRole('button',{name,exact:true});
  const section=name=>page.getByRole('navigation',{name:'Types de serveurs',exact:true}).getByRole('button',{name,exact:true});
  const shot=async name=>{if(captures)await page.screenshot({path:path.join(captures,`${width}-${name}.png`)});};
  try{
    await page.goto(origin+'/prototype/');
    await page.getByRole('navigation',{name:'Espace du projet',exact:true}).getByRole('button',{name:'Paramètres',exact:true}).click();
    await page.getByLabel('Modèle à régler',{exact:true}).waitFor();assert.equal(await page.getByLabel('Adresse de l’API Bionic',{exact:true}).count(),0);
    const budget=page.getByRole('spinbutton',{name:'Maximum de tokens en sortie',exact:true});await budget.fill('4321');
    await category('Serveurs du PC').click();await page.getByLabel('Moteur actif').waitFor();
    assert.deepEqual(await page.getByLabel('Moteur actif').locator('option').allTextContents(),['Bionic / LM Studio','llama-server']);
    await page.getByRole('heading',{name:'Lancement de Bionic',exact:true}).waitFor();await page.getByRole('heading',{name:'Bibliothèque et lancement de llama-server',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Adresse de ComfyUI',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Arrêter ComfyUI',exact:true}).isVisible().catch(()=>false),false);
    const address=page.getByLabel('Adresse de l’API Bionic',{exact:true});await address.fill('http://127.0.0.1:19997');
    await page.getByText('Authentification · Bionic / LM Studio',{exact:true}).click();const token=page.getByLabel('Nouveau jeton Bionic',{exact:true});await token.fill('SYNTHETIC-TOKEN-NOT-A-CREDENTIAL');
    const bionic=page.getByRole('region',{name:'Bionic',exact:true});await bionic.getByText('Profil de lancement et détails',{exact:true}).click();const launchPath=bionic.getByLabel('Application Bionic',{exact:true});await launchPath.fill('C:/Synthetic/Bionic-draft.exe');
    const contextSize=page.getByRole('spinbutton',{name:'Contexte demandé au lancement',exact:true});await contextSize.fill('6144');
    await section('Génération d’images').click();await page.getByLabel('Adresse de ComfyUI',{exact:true}).waitFor();await page.getByRole('heading',{name:'Lancement de ComfyUI',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Arrêter Bionic',exact:true}).isVisible().catch(()=>false),false);
    const imageAddress=page.getByLabel('Adresse de ComfyUI',{exact:true});await imageAddress.fill('http://127.0.0.1:19996');assert.equal(await page.getByRole('spinbutton',{name:'Force 1',exact:true}).inputValue(),'3.5');await shot('servers-images');
    await category('Conversation').click();assert.equal(await budget.inputValue(),'4321','Conversation limit draft survives server navigation');
    await category('Serveurs du PC').click();assert.equal(await imageAddress.inputValue(),'http://127.0.0.1:19996','Image settings draft survives category navigation');
    await section('Moteurs d’inférence').click();assert.equal(await address.inputValue(),'http://127.0.0.1:19997');assert.equal(await token.inputValue(),'SYNTHETIC-TOKEN-NOT-A-CREDENTIAL');assert.equal(await launchPath.inputValue(),'C:/Synthetic/Bionic-draft.exe');assert.equal(await contextSize.inputValue(),'6144');
    assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('SYNTHETIC-TOKEN-NOT-A-CREDENTIAL')||JSON.stringify(sessionStorage).includes('SYNTHETIC-TOKEN-NOT-A-CREDENTIAL')),false,'Token draft stays in component memory');
    await page.getByLabel('Moteur actif').selectOption('llamacpp');await page.getByRole('button',{name:'Tester la connexion',exact:true}).click();await page.getByText('Connexion disponible',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Enregistrer la connexion',exact:true}).click();await page.getByText('Connexion enregistrée et appliquée. Les modèles ne sont pas chargés automatiquement.',{exact:true}).waitFor();
    assert.equal(state.inference.provider,'llamacpp');assert.equal(state.inference.apiUrl,'http://127.0.0.1:19997');assert.equal(state.inference.hasBionicToken,true);assert.equal(await token.inputValue(),'');
    state.drop();await page.getByLabel('Adresse de llama-server',{exact:true}).fill('http://127.0.0.1:1239');await page.getByRole('button',{name:'Enregistrer la connexion',exact:true}).click();
    await page.getByText('État serveur relu. Aucun enregistrement n’a été renvoyé automatiquement.',{exact:true}).waitFor();assert.equal(state.writes.filter(item=>item.pathname==='/api/inference/settings').length,2);assert.equal(state.inference.llamaUrl,'http://127.0.0.1:1239');
    await page.locator('.settings-content').evaluate(element=>element.scrollTo(0,0));await shot('servers-inference');
    await category('Apparence et brouillons').click();await page.getByLabel('Langue de l’interface',{exact:true}).selectOption('en');
    await page.getByRole('navigation',{name:'Settings categories',exact:true}).getByRole('button',{name:'PC servers',exact:true}).click();await page.getByRole('heading',{name:'PC servers',exact:true}).waitFor();
    await page.getByRole('navigation',{name:'Server types',exact:true}).getByRole('button',{name:'Image generation',exact:true}).click();await page.getByLabel('ComfyUI address',{exact:true}).waitFor();assert.equal(await page.getByLabel('ComfyUI address',{exact:true}).inputValue(),'http://127.0.0.1:19996');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
    assert.equal(state.writes.filter(item=>/\/api\/(?:chat|llama-server\/action|local-services\/[^/]+\/actions|comfy\/generate)$/.test(item.pathname)).length,0,'Settings navigation does not launch any effect');
    results.push({width,conversationSeparated:true,serversGrouped:true,onlyImplementedProviders:true,imageProviderIndependent:true,allDraftsRetained:true,tokenOnlyInMemory:true,saveLostReplyNotReplayed:true,localeSwitch:true,errors:errors.length,csp:csp.length});
  }catch(error){await shot('settings-failure').catch(()=>{});console.error(JSON.stringify({width,errors,csp,writes:state.writes.map(item=>item.pathname)}));throw error;}
  finally{await context.close();}
}}finally{await browser.close();}
console.log(JSON.stringify({ok:true,synthetic:true,results},null,2));
