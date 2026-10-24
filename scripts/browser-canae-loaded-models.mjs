// Real HTTP companion and browser. Synthetic models and process handles only.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createPrototype,PROTOTYPE_CODE} from '../lib/llama-ui-prototype.mjs';
import {createCompanion} from '../server.mjs';
import {createLlamaServerLibrary} from '../lib/llama-server-library.mjs';
import {createLlamaServerSettings,createLlamaServerManager} from '../lib/llama-server-settings.mjs';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'});
const captures=process.env.BIONIC_BROWSER_CAPTURES||process.env.BIONIC_SMOKE_SCREENSHOTS;
if(captures)await fs.mkdir(captures,{recursive:true});
const u64=value=>{const buffer=Buffer.alloc(8);buffer.writeBigUInt64LE(BigInt(value));return buffer;};
const u32=value=>{const buffer=Buffer.alloc(4);buffer.writeUInt32LE(value);return buffer;};
const string=value=>Buffer.concat([u64(Buffer.byteLength(value)),Buffer.from(value)]);
const gguf=Buffer.concat([Buffer.from('GGUF'),u32(3),u64(0),u64(2),string('general.architecture'),u32(8),string('qwen35'),string('general.name'),u32(8),string('Synthetic GGUF')]);

async function fixture(mode){
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'canae-loaded-models-')));
  const bootstrap=await createPrototype({root,listen:false,modelDelayMs:1});
  const settings={...bootstrap.app.settings,port:0,comfyEnabled:false,inferenceProvider:mode==='bionic'?'bionic':'llamacpp',apiUrl:'http://127.0.0.1:19998',llamaUrl:mode==='external'?'http://127.0.0.1:1237':'http://127.0.0.1:1238'};await bootstrap.app.close();
  const directory=path.join(root,'models'),binaryPath=path.join(root,process.platform==='win32'?'llama-server.exe':'llama-server');
  await fs.mkdir(directory);await fs.writeFile(path.join(directory,'synthetic.gguf'),gguf);await fs.writeFile(binaryPath,'Never executed. Synthetic binary marker.');
  const library=createLlamaServerLibrary({defaultDirectory:directory}),profile=await createLlamaServerSettings({library,initial:{binaryPath}}),model=(await library.inventory()).models[0];
  const state={running:null,busy:false,stopUnknown:false,unloads:[],starts:0,stops:0};
  const initial=[{id:'chat-model',name:'Synthetic chat',type:'llm',loadedInstances:[{id:'chat-a',contextLength:8192},{id:'chat-b',contextLength:4096}]},{id:'embedding-model',name:'Synthetic embedding',type:'embedding',loadedInstances:[{id:'embedding-a',contextLength:2048}]},{id:'decision-model',name:'Synthetic decision',type:'decision',loadedInstances:[{id:'decision-a',contextLength:1024}]}];
  const bionic=structuredClone(initial),backend={
    async occupied(){return !!state.running?.alive;},
    async launch(value){state.starts++;state.running={alive:true,value};return state.running;},
    async inspect(handle){return handle.alive?{state:'running',owned:true}:{state:'stopped',owned:false,exitConfirmed:true};},
    async stop(handle){state.stops++;if(state.stopUnknown)throw Object.assign(Error('Arrêt synthétique non confirmé.'),{status:409,code:'llama-stop-unknown'});handle.alive=false;},close(){}
  };
  const manager=createLlamaServerManager({settings:profile,processBackend:backend,assertIdle:async()=>{if(state.busy)throw Object.assign(Error('Travail synthétique actif.'),{status:409});},assertConnectorAvailable:async()=>{}});
  const start=()=>manager.action({action:'start',requestId:randomUUID(),expectedRevision:profile.snapshot().revision,modelId:model.id,consent:true});
  if(mode==='owned')await start();
  const inferenceFactory=config=>{
    const list=async()=>{
      if(config.provider==='bionic')return config.apiUrl==='http://127.0.0.1:19998'?structuredClone(bionic).map(item=>({...item,loaded:!!item.loadedInstances.length,modelManagement:true,reasoning:null})):[];
      if(mode==='owned'&&!state.running?.alive)throw Object.assign(Error('Synthetic owned endpoint is stopped.'),{status:502});
      return [{id:'synthetic-llama',name:mode==='owned'?state.running.value.alias:'External direct GGUF',inferenceId:mode==='owned'?state.running.value.alias:'external',type:'llm',loaded:true,contextLength:8192,loadedInstances:[{id:'synthetic-llama',contextLength:8192}],modelManagement:false,reasoning:null}];
    };
    return {modelService:{list,forInference:async()=>{throw Error('Generation forbidden in loaded models fixture');},pendingCount:()=>0,async unload(instanceId){if(state.busy)throw Object.assign(Error('Travail synthétique actif.'),{status:409});state.unloads.push(instanceId);for(const item of bionic)item.loadedInstances=item.loadedInstances.filter(instance=>instance.id!==instanceId);return {unloaded:true,models:await list()};}},modelTransport:{identity:{provider:config.provider,protocol:'chat-completions',endpoint:config.provider==='bionic'?config.apiUrl:config.llamaUrl},request:async()=>{throw Error('Generation forbidden in loaded models fixture');}}};
  };
  const app=await createCompanion({root,publicDirectory:path.join(sourceRoot,'public'),settings,inferenceFactory,llamaServerManager:manager,nativeStore:{listProjects:async()=>[],listSessions:async()=>[],getConversation:async()=>{throw Object.assign(Error('No native data in fixture'),{status:404});}},fetchImpl:async()=>{throw Error('External network forbidden in loaded models fixture');},comfyFetchImpl:async()=>{throw Error('External image service forbidden in loaded models fixture');},localServiceSupervisor:{activeCount:()=>0,assertAdmission(){if(state.busy)throw Object.assign(Error('Travail synthétique actif.'),{status:409});},protectedPaths:()=>[],snapshot:async()=>({services:[],disabled:true}),close:async()=>{}},enableUpdateScheduling:false});
  await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
  return {root,app,state,start,manager,url:'http://127.0.0.1:'+app.server.address().port};
}
const results=[];
try{for(const width of [1280,390])for(const mode of ['bionic','owned','external']){
  const f=await fixture(mode),context=await browser.newContext({viewport:{width,height:900},locale:'fr-FR',reducedMotion:'reduce'}),page=await context.newPage(),errors=[],csp=[],posts=[];
  let confirmAction=true;
  page.setDefaultTimeout(15000);page.on('dialog',dialog=>confirmAction?dialog.accept():dialog.dismiss());page.on('pageerror',error=>errors.push(error.message));page.on('console',entry=>{if(/violates the following|content.security.policy|refused to (?:execute|apply|load)/i.test(entry.text()))csp.push(entry.text());});page.on('request',request=>{if(request.method()==='POST')posts.push({path:new URL(request.url()).pathname,body:request.postDataJSON()});});
  const menu=page.getByRole('region',{name:'Modèles chargés',exact:true});
  const open=async()=>{const nav=page.getByRole('button',{name:'Ouvrir la navigation',exact:true});if(await nav.isVisible())await nav.click();await page.getByRole('button',{name:'Modèles chargés',exact:true}).click();await menu.waitFor();await page.waitForFunction(()=>document.querySelector('#loaded-models-popover .loaded-content')?.getAttribute('aria-busy')==='false');};
  const login=async()=>{await page.goto(f.url);if(await page.locator('#access-code').isVisible()){await page.locator('#access-code').fill(PROTOTYPE_CODE);await page.getByRole('button',{name:'Se connecter',exact:true}).click();}await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();};
  const refresh=async()=>{await menu.getByRole('button',{name:'Actualiser les modèles chargés',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#loaded-models-popover .loaded-content')?.getAttribute('aria-busy')==='false');};
  const shot=async name=>{if(captures)await page.screenshot({path:path.join(captures,`${width}-${mode}-${name}.png`)});};
  try{
    await login();const asset=await page.locator('script[type=module][src]').getAttribute('src'),cssAsset=await page.locator('link[rel=stylesheet]').getAttribute('href');const draft=page.getByRole('textbox',{name:'Message',exact:true});await draft.fill('Brouillon synthétique conservé après déchargement.');await open();
    const box=await menu.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width+1);await shot('menu');
    await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Modèles chargés');await open();
    await page.mouse.click(width-5,5);await menu.waitFor({state:'hidden'});await open();
    if(mode==='bionic'){
      await menu.getByRole('heading',{name:'Synthetic embedding',exact:true}).waitFor();await menu.getByRole('heading',{name:'Synthetic decision',exact:true}).waitFor();assert.equal(await menu.getByRole('heading',{name:'Synthetic chat',exact:true}).count(),2);
      const embedding=menu.getByRole('button',{name:'Décharger Synthetic embedding · embedding-a',exact:true});confirmAction=false;await embedding.click();assert.equal(f.state.unloads.length,0);confirmAction=true;
      f.state.busy=true;await embedding.click();await menu.getByRole('alert').filter({hasText:'Travail synthétique actif.'}).waitFor();assert.equal(f.state.unloads.length,0);f.state.busy=false;
      await page.route('**/api/models/unload',async route=>{const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');});await embedding.click();await menu.getByRole('status').filter({hasText:'État retrouvé : cette instance est déchargée.'}).waitFor();await page.unroute('**/api/models/unload');assert.deepEqual(f.state.unloads,['embedding-a']);assert.equal(await embedding.count(),0);
      await page.reload();await open();assert.deepEqual(f.state.unloads,['embedding-a']);assert.equal(await menu.getByRole('heading',{name:'Synthetic embedding',exact:true}).count(),0);
      await page.route('**/api/models',async route=>{const response=await route.fetch(),data=await response.json();await route.fulfill({response,json:{...data,inferenceRevision:'stale-fixture-revision'}});});await refresh();assert.equal(await menu.getByRole('button',{name:'Décharger Synthetic chat · chat-a',exact:true}).isDisabled(),true);assert.deepEqual(f.state.unloads,['embedding-a']);await page.unroute('**/api/models');await refresh();
      await page.route('**/api/models/unload',async route=>{const response=await route.fetch();assert.equal(response.status(),200);const current=await(await context.request.get(f.url+'/api/inference/settings')).json();const switched=await context.request.post(f.url+'/api/inference/settings',{data:{provider:'bionic',apiUrl:'http://127.0.0.1:19996',expectedRevision:current.revision}});assert.equal(switched.status(),200);await route.abort('failed');});
      await menu.getByRole('button',{name:'Décharger Synthetic decision · decision-a',exact:true}).click();await menu.getByRole('status').filter({hasText:'Le moteur a changé. Le résultat du déchargement sur le moteur précédent reste à vérifier'}).waitFor();await page.unroute('**/api/models/unload');assert.deepEqual(f.state.unloads,['embedding-a','decision-a']);assert.equal(await menu.getByText('État retrouvé : cette instance est déchargée. Aucun second envoi.',{exact:true}).count(),0);
    }else if(mode==='owned'){
      const stop=menu.getByRole('button',{name:'Décharger le GGUF possédé',exact:true});await stop.waitFor();
      await page.route('**/api/llama-server/action',async route=>{const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');});await stop.click();await menu.getByRole('status').filter({hasText:'État retrouvé : le processus possédé est arrêté.'}).waitFor();await page.unroute('**/api/llama-server/action');assert.equal(f.state.stops,1);assert.equal(await stop.count(),0);assert.equal(await page.getByRole('alert').count(),0,'A stopped owned endpoint is an expected empty catalogue');
      await f.start();await page.reload();await open();f.state.stopUnknown=true;await stop.click();await menu.getByRole('alert').filter({hasText:'Arrêt synthétique non confirmé.'}).waitFor();assert.equal(await stop.isDisabled(),true);assert.equal(f.state.stops,2);f.state.running.alive=false;f.state.stopUnknown=false;await refresh();await menu.getByRole('status').filter({hasText:'État retrouvé : le processus possédé est arrêté.'}).waitFor();assert.equal(f.state.stops,2);
      await f.start();await page.reload();await open();let rejectReads=false;await page.route('**/api/llama-server',async route=>{if(rejectReads)await route.fulfill({status:503,json:{error:'Lecture synthétique indisponible.'}});else await route.continue();});await page.route('**/api/llama-server/action',async route=>{const response=await route.fetch();rejectReads=true;await route.fulfill({response});});await stop.click();await menu.getByRole('status').filter({hasText:'État du processus à vérifier.'}).waitFor();assert.equal(await menu.getByText('GGUF déchargé : le processus possédé est arrêté.',{exact:true}).count(),0);assert.equal(f.state.stops,3);rejectReads=false;await page.unroute('**/api/llama-server/action');await page.unroute('**/api/llama-server');await refresh();await menu.getByRole('status').filter({hasText:'État retrouvé : le processus possédé est arrêté.'}).waitFor();assert.equal(f.state.stops,3);
    }else{
      await menu.getByRole('heading',{name:'External direct GGUF',exact:true}).waitFor();await menu.getByText('Déchargement indisponible pour ce serveur direct. Arrête-le depuis son application.',{exact:true}).waitFor();assert.equal(await menu.getByRole('button',{name:/^Décharger/}).count(),0);assert.equal(f.state.stops,0);assert.equal(f.state.starts,0);
    }
    await shot('verified');await page.keyboard.press('Escape');assert.equal(await draft.inputValue(),'Brouillon synthétique conservé après déchargement.');
    const ping=await(await context.request.get(f.url+'/api/ping')).json();await page.evaluate(id=>localStorage.setItem('bionic:llama-preferences:'+id,JSON.stringify({language:'en',theme:'system',draftHours:24})),ping.instanceId);await page.reload();const nav=page.getByRole('button',{name:'Open navigation',exact:true});if(await nav.isVisible())await nav.click();await page.getByRole('button',{name:'Loaded models',exact:true}).click();await page.getByRole('region',{name:'Loaded models',exact:true}).waitFor();
    const unloadPosts=posts.filter(item=>item.path==='/api/models/unload'),stopPosts=posts.filter(item=>item.path==='/api/llama-server/action');
    assert.equal(unloadPosts.length,mode==='bionic'?3:0,'Two explicit unloads plus one refused busy request; never an automatic retry');assert.equal(stopPosts.length,mode==='owned'?3:0,'Exactly three explicit stops; GET recovery never repeats the POST');assert(stopPosts.every(item=>item.body.action==='stop'&&item.body.consent===true));assert(unloadPosts.every(item=>typeof item.body.expectedInferenceRevision==='string'));
    assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);results.push({width,mode,asset,cssAsset,lightDismiss:true,escapeAndFocus:true,draftPreserved:true,locale:true,unloads:f.state.unloads.length,ownedStops:f.state.stops,unloadPosts:unloadPosts.length,stopPosts:stopPosts.length,noImplicitLaunch:true,errors:errors.length,csp:csp.length});
  }catch(error){await shot('failure').catch(()=>{});console.error(JSON.stringify({width,mode,errors,csp,posts:posts.map(item=>item.path),unloads:f.state.unloads,stops:f.state.stops}));throw error;}
  finally{await context.close();await f.app.close();f.manager.close();assert.equal(path.dirname(f.root),path.resolve(os.tmpdir()));assert(path.basename(f.root).startsWith('canae-loaded-models-'));await fs.rm(f.root,{recursive:true,force:true});}
}}finally{await browser.close();}
console.log(JSON.stringify({ok:true,realHTTP:true,syntheticModelsAndProcesses:true,results,limitations:['No actual inference engine, GPU or personal installation used.','Viewports do not qualify physical phones.']},null,2));
