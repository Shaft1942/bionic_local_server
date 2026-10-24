// Assembly check: real App -> manager -> App callbacks, fully intercepted HTTP.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),publicRoot=path.resolve(process.env.BIONIC_BROWSER_PUBLIC_DIR||path.join(root,'public'));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'}),results=[];
const origin='http://manager-chat.test',pid='companion-unassigned',workflowId='hassaku_illustrious';
const draft='  Brouillon chat préservé — 中文 🌿\n\nDernière ligne.  \n',imageDraft='  Brouillon image préservé — été 🌿  ';
try{for(const language of ['fr','en']){
  const instanceId='manager-chat-'+language,context=await browser.newContext({viewport:{width:390,height:1000},hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage(),reads=[],posts=[],errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const t=(fr,en)=>language==='fr'?fr:en,button=(fr,en,scope=page)=>scope.getByRole('button',{name:t(fr,en),exact:true});
  const models=['a','b'].map(id=>({id:'bionic-'+id,name:'Bionic '+id.toUpperCase(),type:'llm',loaded:true,loadedInstances:[{id:'instance-'+id,contextLength:4096}],inferenceId:'instance-'+id,contextLength:4096}));
  await context.addInitScript(({instanceId,language,pid,workflowId,imageDraft})=>{localStorage.setItem('bionic:llama-preferences:'+instanceId,JSON.stringify({language}));sessionStorage.setItem(`companion-prototype:${instanceId}:/:image-draft:${pid}`,JSON.stringify({prompt:imageDraft,seed:'0007',format:'portrait',workflowId,negativePrompt:'  Éviter les défauts.  ',imageCount:2}));},{instanceId,language,pid,workflowId,imageDraft});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin,'No external endpoint is contacted');
    if(req.method()!=='GET'){posts.push({path:url.pathname,body:req.postDataJSON()});return route.fulfill({status:405,json:{error:'Assembly navigation must not mutate or generate'}});}
    if(url.pathname.startsWith('/api/')){
      reads.push({path:url.pathname,projectId:url.searchParams.get('projectId')});let value;
      if(url.pathname==='/api/ping')value={instanceId,version:'2.6.0-beta.11'};
      else if(url.pathname==='/api/projects')value={projects:[{id:pid,name:'Sans projet',isUnassigned:true},{id:'p1',name:'Projet synthétique',locallyOwned:true}]};
      else if(url.pathname==='/api/sessions')value={sessions:[],total:0};
      else if(url.pathname==='/api/inference/settings')value={provider:'bionic',revision:'engine-1',editable:true,busy:false,reconciliationRequired:false,apiUrl:'http://127.0.0.1:19995',llamaUrl:'http://127.0.0.1:19996',hasLlamaToken:false};
      else if(url.pathname==='/api/models')value={provider:'bionic',inferenceRevision:'engine-1',models,generationActive:false,unloading:false,reconciliationRequired:false,csrfNonce:'fixture-nonce'};
      else if(url.pathname==='/api/llama-server')value={profile:{revision:'profile-1',directory:'Fixture',endpoint:'http://127.0.0.1:19996'},process:{state:'configured',owned:false},canControl:false,canConfigureLocal:false,csrfNonce:'fixture-nonce'};
      else if(url.pathname==='/api/local-services')value={services:[],csrfNonce:'fixture-nonce'};
      else if(url.pathname==='/api/local-service-setup')value={canConfigure:false,revision:'setup-1',services:[]};
      else if(url.pathname==='/api/comfy/settings')value={enabled:true,available:true,url:'http://127.0.0.1:19998',workflowId,modelPolicy:'keep',workflows:[{id:'krea2_turbo',label:'Krea 2 synthétique'},{id:workflowId,label:'Hassaku synthétique',negativePrompt:true}]};
      else if(url.pathname==='/api/comfy/free')value={url:'http://127.0.0.1:19998',revision:'memory-1',canUnload:false,reason:'External synthetic API',csrfNonce:'fixture-nonce',operation:null};
      else if(url.pathname==='/api/comfy/generations'){assert.equal(url.searchParams.get('projectId'),pid);value={images:[],total:0,nextCursor:null};}
      else throw Error('Unexpected API '+url.pathname);
      return route.fulfill({json:value});
    }
    const filename=path.resolve(publicRoot,url.pathname==='/'?'llama-ui/index.html':url.pathname.slice(1));assert(filename.startsWith(publicRoot+path.sep));
    return route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(filename)]||'text/html',body:await fs.readFile(filename)});
  });
  try{
    await page.goto(origin+'/');await page.locator('.companion-shell').waitFor();const prompt=page.locator('#prompt'),model=page.getByRole('combobox',{name:t('Modèle','Model'),exact:true});await prompt.fill(draft);assert.equal(await model.inputValue(),'bionic-a');
    const navigation=button('Ouvrir la navigation','Open navigation');if(await navigation.isVisible())await navigation.click();const trigger=button('Modèles chargés','Loaded models');await trigger.click();
    const menu=page.getByRole('region',{name:t('Modèles chargés','Loaded models'),exact:true}),manager=menu.getByRole('region',{name:t('Pilotage des moteurs et modèles','Engine and model controls'),exact:true});
    const use=button('Utiliser dans le chat Bionic B','Use in chat Bionic B',manager);await use.waitFor();const settingsBefore=reads.filter(read=>read.path==='/api/inference/settings').length,modelsBefore=reads.filter(read=>read.path==='/api/models').length;await use.click();
    await page.waitForFunction(()=>document.querySelector('select[aria-label="Modèle"],select[aria-label="Model"]')?.value==='bionic-b'&&!document.querySelector('#loaded-models-popover')?.matches(':popover-open'));
    assert(reads.filter(read=>read.path==='/api/inference/settings').length>settingsBefore,'App revalidates the connection before selecting');assert(reads.filter(read=>read.path==='/api/models').length>modelsBefore,'App revalidates catalogue provenance');assert.equal(await page.locator('#chat-engine').inputValue(),'bionic');assert.equal(await prompt.inputValue(),draft);assert.deepEqual(posts,[],'Using an already loaded model needs no load, unload, settings or chat POST');
    await trigger.click();await button('Serveur d’images','Image server',manager).click();const savedWorkflow=manager.getByRole('combobox',{name:t('Workflow enregistré','Saved workflow'),exact:true});await savedWorkflow.waitFor();await page.waitForFunction(id=>document.querySelector('.image-model-controls select')?.value===id,workflowId);assert.equal(await savedWorkflow.inputValue(),workflowId);
    await button('Ouvrir l’Atelier images','Open image studio',manager).click();await page.waitForFunction(()=>!document.querySelector('#loaded-models-popover')?.matches(':popover-open'));
    const dialog=page.locator('.workspace-dialog[open]');await dialog.getByRole('heading',{name:t('Atelier images','Image workspace'),exact:true}).waitFor();assert.match(await button('Images','Images',dialog).getAttribute('class'),/active/);assert.equal(await dialog.locator('#image-workflow').inputValue(),workflowId);assert.equal(await dialog.locator('#image-prompt').inputValue(),imageDraft);assert.equal(await dialog.locator('#image-seed').inputValue(),'0007');assert.equal(await dialog.locator('#image-format').inputValue(),'portrait');assert.equal(await dialog.getByRole('spinbutton',{name:t('Nombre d’images','Image count'),exact:true}).inputValue(),'2');assert.equal(await prompt.inputValue(),draft);assert.equal(await page.locator('select[aria-label="Modèle"],select[aria-label="Model"]').inputValue(),'bionic-b');assert.deepEqual(posts,[],'Opening the image studio never renders, frees models or saves a workflow');assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    results.push({width:390,language,loadedBionicSelectedInComposer:true,catalogueRevalidated:true,managerClosed:true,chatDraftExact:true,imageStudioOpened:true,workflowAndImageDraftPreserved:true,generationPosts:0,allPosts:0});
  }catch(error){console.error(JSON.stringify({language,posts,errors,reads,text:(await page.locator('body').innerText()).slice(-3000)}));throw error;}finally{await context.close();}
}console.log(JSON.stringify({ok:true,syntheticHTTP:true,results},null,2));}finally{await browser.close();}
