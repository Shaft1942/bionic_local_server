// Real companion HTTP + browser; all models, process handles and data are synthetic.
// Build the UI separately. BIONIC_BROWSER_PUBLIC_DIRECTORY may point to an isolated build.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createPrototype,PROTOTYPE_CODE} from '../lib/llama-ui-prototype.mjs';
import {createCompanion} from '../server.mjs';
import {createLlamaServerLibrary} from '../lib/llama-server-library.mjs';
import {createLlamaServerSettings,createLlamaServerManager} from '../lib/llama-server-settings.mjs';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const publicDirectory=process.env.BIONIC_BROWSER_PUBLIC_DIRECTORY?path.resolve(process.env.BIONIC_BROWSER_PUBLIC_DIRECTORY):path.join(sourceRoot,'public');
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'});
const u64=value=>{const buffer=Buffer.alloc(8);buffer.writeBigUInt64LE(BigInt(value));return buffer;};
const u32=value=>{const buffer=Buffer.alloc(4);buffer.writeUInt32LE(value);return buffer;};
const string=value=>Buffer.concat([u64(Buffer.byteLength(value)),Buffer.from(value)]);
const gguf=Buffer.concat([Buffer.from('GGUF'),u32(3),u64(0),u64(2),string('general.architecture'),u32(8),string('qwen35'),string('general.name'),u32(8),string('Synthetic management GGUF')]);

async function fixture(){
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'canae-model-management-')));
  const bootstrap=await createPrototype({root,listen:false,modelDelayMs:1});
  const settings={...bootstrap.app.settings,port:0,comfyEnabled:true,comfyUrl:'http://127.0.0.1:19999',inferenceProvider:'llamacpp',apiUrl:'http://127.0.0.1:19998',llamaUrl:'http://127.0.0.1:1237'};
  await bootstrap.app.close();
  const directory=path.join(root,'models'),binaryPath=path.join(root,process.platform==='win32'?'llama-server.exe':'llama-server');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory,'synthetic.gguf'),gguf);
  await fs.writeFile(binaryPath,'Synthetic marker; never executed.');
  const library=createLlamaServerLibrary({defaultDirectory:directory}),profile=await createLlamaServerSettings({library,initial:{binaryPath}});
  const state={starts:0,stops:0,unloads:0,generations:0,imageFree:[],imageUnknown:false};
  const manager=createLlamaServerManager({settings:profile,processBackend:{
    occupied:async()=>false,
    launch:async()=>{state.starts++;throw Error('Launch forbidden in management navigation fixture');},
    inspect:async()=>({state:'stopped',owned:false,exitConfirmed:true}),
    stop:async()=>{state.stops++;throw Error('Stop forbidden in management navigation fixture');},close(){}
  },assertIdle:async()=>{},assertConnectorAvailable:async()=>{}});
  const inferenceFactory=config=>({
    modelService:{
      list:async()=>[{id:'synthetic-external',name:'External management GGUF',inferenceId:'external',type:'llm',loaded:true,contextLength:8192,loadedInstances:[{id:'synthetic-external',contextLength:8192}],modelManagement:false,reasoning:null}],
      forInference:async()=>{state.generations++;throw Error('Generation forbidden in management navigation fixture');},pendingCount:()=>0,
      unload:async()=>{state.unloads++;throw Error('Unload forbidden in management navigation fixture');}
    },
    modelTransport:{identity:{provider:config.provider,protocol:'chat-completions',endpoint:config.provider==='bionic'?config.apiUrl:config.llamaUrl},request:async()=>{state.generations++;throw Error('Generation forbidden in management navigation fixture');}}
  });
  const app=await createCompanion({root,publicDirectory,settings,inferenceFactory,llamaServerManager:manager,
    nativeStore:{listProjects:async()=>[],listSessions:async()=>[],getConversation:async()=>{throw Object.assign(Error('No native data in fixture'),{status:404});}},
    fetchImpl:async()=>{throw Error('External network forbidden in management fixture');},comfyFetchImpl:async(url,options={})=>{
      const target=new URL(url);assert.equal(target.origin,'http://127.0.0.1:19999','Only the saved synthetic ComfyUI endpoint is used');
      if(target.pathname==='/system_stats')return Response.json({system:{comfyui_version:'synthetic'}});
      if(target.pathname==='/queue')return Response.json({queue_running:[],queue_pending:[]});
      if(target.pathname==='/free'){
        assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{unload_models:true,free_memory:true});state.imageFree.push(target.href);
        if(state.imageUnknown)throw Error('Synthetic lost ComfyUI acknowledgement');
        return Response.json({});
      }
      throw Error('Forbidden synthetic ComfyUI route: '+target.pathname);
    },
    localServiceSupervisor:{activeCount:()=>0,assertAdmission(){},protectedPaths:()=>[],snapshot:async()=>({services:[],disabled:true}),close:async()=>{}},enableUpdateScheduling:false
  });
  await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
  return{root,app,manager,state,url:'http://127.0.0.1:'+app.server.address().port};
}

const labels={chat:'Choisir le moteur et le modèle',inference:'Connexions et serveurs d’inférence',gguf:'Charger ou remplacer un GGUF',images:'Serveur d’images · ComfyUI'};
const results=[];
try{for(const width of [1280,390]){
  const f=await fixture(),context=await browser.newContext({viewport:{width,height:900},locale:'fr-FR',reducedMotion:'reduce'}),page=await context.newPage();
  const errors=[],csp=[],posts=[],dialogs=[];
  let acceptClose=true;
  page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',entry=>{if(/violates the following|content.security.policy|refused to (?:execute|apply|load)/i.test(entry.text()))csp.push(entry.text());});
  page.on('dialog',dialog=>{dialogs.push(dialog.message());return acceptClose?dialog.accept():dialog.dismiss();});
  page.on('request',request=>{if(request.method()==='POST')posts.push(new URL(request.url()).pathname);});
  const menu=page.getByRole('region',{name:'Modèles chargés',exact:true}),workspace=page.locator('.workspace-dialog[open]');
  const openMenu=async()=>{
    const navigation=page.getByRole('button',{name:'Ouvrir la navigation',exact:true});
    if(await navigation.isVisible())await navigation.click();
    await page.getByRole('button',{name:'Modèles chargés',exact:true}).click();
    await menu.waitFor();
    await page.waitForFunction(()=>document.querySelector('#loaded-models-popover .loaded-content')?.getAttribute('aria-busy')==='false');
  };
  const focused=async selector=>{
    await page.waitForFunction(value=>document.activeElement===document.querySelector(value),selector);
    const target=page.locator(selector).first();
    assert.equal(await target.isVisible(),true,'Focus target must be visible');
    const box=await target.boundingBox();
    assert(box&&box.y>=0&&box.y<900&&box.x>=0&&box.x<width,'Focused management target must be inside the viewport');
  };
  const navigate=async(target,keyboard=false)=>{
    await openMenu();
    const action=menu.getByRole('button',{name:labels[target],exact:true});
    await action.waitFor();
    if(keyboard){await action.focus();await page.keyboard.press('Enter');}else await action.click();
    await menu.waitFor({state:'hidden'});
    await focused(target==='chat'?'#chat-engine':`#settings-${target}-section :is(h2,h3)`);
  };
  const close=async(keyboard=false)=>{
    if(keyboard)await page.keyboard.press('Escape');else await workspace.getByRole('button',{name:'Fermer la fenêtre',exact:true}).click();
    await workspace.waitFor({state:'hidden'});
    await focused('.loaded-trigger');
  };
  try{
    await page.goto(f.url);
    if(await page.locator('#access-code').isVisible()){await page.locator('#access-code').fill(PROTOTYPE_CODE);await page.getByRole('button',{name:'Se connecter',exact:true}).click();}
    const draft=page.getByRole('textbox',{name:'Message',exact:true});await draft.waitFor();
    const baselinePosts=posts.length;
    const draftValue='Brouillon synthétique conservé entre les écrans de gestion.';
    await draft.fill(draftValue);
    await openMenu();
    await menu.getByRole('heading',{name:'External management GGUF',exact:true}).waitFor();
    assert.equal(await menu.getByRole('button',{name:/^Décharger/}).count(),0,'An external server has no fabricated unload action');
    for(const label of Object.values(labels))assert.equal(await menu.getByRole('button',{name:label,exact:true}).isEnabled(),true);
    const box=await menu.boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width+1,'Management menu fits viewport');
    await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});await focused('.loaded-trigger');

    await navigate('chat',true);
    assert.equal(await draft.inputValue(),draftValue);
    await navigate('inference',true);
    const inferenceUrl=page.locator('#inference-llama-url');await inferenceUrl.waitFor();
    assert.equal(await inferenceUrl.isEnabled(),true,'Targeted inference settings expose a usable connection control');
    await inferenceUrl.fill('http://127.0.0.1:19991');
    await page.getByRole('navigation',{name:'Types de serveurs',exact:true}).getByRole('button',{name:'Génération d’images',exact:true}).click();
    const imageUrl=page.getByRole('textbox',{name:'Adresse de ComfyUI',exact:true});await imageUrl.waitFor();
    await imageUrl.fill('http://127.0.0.1:19992');
    await page.getByRole('navigation',{name:'Types de serveurs',exact:true}).getByRole('button',{name:'Moteurs d’inférence',exact:true}).click();
    assert.equal(await inferenceUrl.inputValue(),'http://127.0.0.1:19991','Changing sections preserves the inference draft');
    // A refused close must leave the management window and both drafts available.
    acceptClose=false;const beforeRefusal=dialogs.length;
    await Promise.all([page.waitForEvent('dialog'),page.keyboard.press('Escape')]);
    await page.waitForFunction(()=>document.querySelector('.workspace-dialog[open]')!==null);
    assert.equal(dialogs.length,beforeRefusal+1,'One dirty-close confirmation is presented');
    assert.equal(await inferenceUrl.inputValue(),'http://127.0.0.1:19991');
    acceptClose=true;await close();
    assert.equal(await draft.inputValue(),draftValue);

    await navigate('gguf');
    const ggufSelect=page.locator('#llama-library-model');await ggufSelect.waitFor();
    await page.waitForFunction(()=>document.querySelector('#llama-library-model')?.disabled===false);
    assert.equal(await ggufSelect.locator('option').count(),2,'A synthetic GGUF is available without loading it');
    assert.equal(await page.getByRole('button',{name:'Arrêter le processus possédé',exact:true}).isDisabled(),true,'No ownership is invented for the external engine');
    assert.equal(await inferenceUrl.inputValue(),'http://127.0.0.1:19991','Closing and reopening management preserves the inference draft');
    await close(true);

    await navigate('images',true);
    assert.equal(await imageUrl.inputValue(),'http://127.0.0.1:19992','Direct image navigation preserves its unsaved connection');
    assert.equal(await page.getByRole('button',{name:'Enregistrer les réglages images',exact:true}).isEnabled(),true,'Image settings expose an explicit usable save control');
    await close();
    assert.equal(await draft.inputValue(),draftValue);
    assert.deepEqual(posts.slice(baselinePosts),[],'Navigation, reopening, cancellation and draft edits never send a POST');
    assert.deepEqual(f.state,{starts:0,stops:0,unloads:0,generations:0,imageFree:[],imageUnknown:false});

    // Image unloading is a separate, explicit action against saved settings.
    await navigate('images');
    const memory=page.getByRole('region',{name:'Déchargement des modèles d’images',exact:true});
    const unloadImages=memory.getByRole('button',{name:'Décharger les modèles d’images',exact:true});
    const rereadImages=memory.getByRole('button',{name:'Relire la demande de déchargement',exact:true});
    const accepted=memory.getByRole('status').filter({hasText:'Demande acceptée par ComfyUI. La fin du déchargement et la mémoire libérée ne sont pas vérifiables par ce protocole.'});
    const unknown=memory.getByRole('status').filter({hasText:'Résultat du déchargement non confirmé. Relis le suivi ; aucune demande ne sera renvoyée automatiquement.'});
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Décharger les modèles d’images'&&!button.disabled));
    acceptClose=false;const beforeCancel=dialogs.length;await Promise.all([page.waitForEvent('dialog'),unloadImages.click()]);
    assert.equal(dialogs.length,beforeCancel+1);assert.match(dialogs.at(-1),/http:\/\/127\.0\.0\.1:19999/);assert.match(dialogs.at(-1),/reste démarré/);assert(!dialogs.at(-1).includes('19992'));
    assert.equal(f.state.imageFree.length,0);assert.deepEqual(posts.slice(baselinePosts),[],'Cancel unload sends no mutation');
    acceptClose=true;await unloadImages.click();await accepted.waitFor();
    assert.equal(f.state.imageFree.length,1);assert.equal(await imageUrl.inputValue(),'http://127.0.0.1:19992');
    await rereadImages.click();await accepted.waitFor();assert.equal(f.state.imageFree.length,1,'Status reads never repeat /free');

    await page.route('**/api/comfy/free',async route=>{
      if(route.request().method()!=='POST')return route.continue();
      const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');
    });
    const recovery=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname==='/api/comfy/free'&&new URL(response.url()).searchParams.has('requestId'));
    await unloadImages.click();await recovery;await accepted.waitFor();
    await page.unroute('**/api/comfy/free');
    assert.equal(f.state.imageFree.length,2,'A lost browser response is recovered by receipt without replay');
    await rereadImages.click();await accepted.waitFor();assert.equal(f.state.imageFree.length,2);

    f.state.imageUnknown=true;await unloadImages.click();await unknown.waitFor();
    assert.equal(f.state.imageFree.length,3);await rereadImages.click();await unknown.waitFor();
    assert.equal(f.state.imageFree.length,3,'Unknown ComfyUI acknowledgement is not retried by status reads');
    await close();await navigate('images');await unknown.waitFor();
    assert.equal(f.state.imageFree.length,3,'Reopening preserves the unknown receipt without replay');
    assert.equal(await imageUrl.inputValue(),'http://127.0.0.1:19992','Unloading and recovery preserve unsaved image settings');
    await page.route('**/api/comfy/free**',async route=>{
      if(route.request().method()!=='GET')return route.continue();
      const response=await route.fetch(),value=await response.json();
      assert(value.operation);await route.fulfill({response,json:{...value,operation:{...value.operation,url:'http://127.0.0.1:19998'}}});
    });
    await rereadImages.click();
    await memory.getByText('Cette demande concerne une connexion précédente.',{exact:false}).waitFor();
    await memory.getByText('http://127.0.0.1:19998',{exact:true}).waitFor();
    await memory.getByText('http://127.0.0.1:19999',{exact:true}).waitFor();
    assert.equal(f.state.imageFree.length,3,'Reading an old-endpoint receipt never unloads either server');
    await page.unroute('**/api/comfy/free**');
    await close();assert.equal(await draft.inputValue(),draftValue);
    assert.deepEqual(posts.slice(baselinePosts),['/api/comfy/free','/api/comfy/free','/api/comfy/free'],'Only three explicitly confirmed image unload requests were sent');
    assert.deepEqual(f.state,{starts:0,stops:0,unloads:0,generations:0,imageFree:Array(3).fill('http://127.0.0.1:19999/free'),imageUnknown:true});
    assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal viewport overflow');
    results.push({width,navigationTargets:4,keyboard:true,focus:true,dirtyCloseRefusal:true,inferenceDraftPreserved:true,imageDraftPreserved:true,chatDraftPreserved:true,navigationPostEffects:0,imageUnloadRequests:3,cancelUnload:true,savedEndpoint:true,lostResponseRecovery:true,unknownReceiptNoReplay:true,oldEndpointReceiptDistinct:true,errors:0,csp:0});
  }catch(error){console.error(JSON.stringify({width,publicDirectory,errors,csp,posts,dialogs,state:f.state}));throw error;}
  finally{
    await context.close();await f.app.close();f.manager.close();
    assert.equal(path.dirname(f.root),path.resolve(os.tmpdir()));assert(path.basename(f.root).startsWith('canae-model-management-'));
    await fs.rm(f.root,{recursive:true,force:true});
  }
}}finally{await browser.close();}
console.log(JSON.stringify({ok:true,realHTTP:true,synthetic:true,results,limitations:['No real engine, process, GPU or personal installation used.','Viewport coverage does not qualify a physical phone or screen reader.']},null,2));
