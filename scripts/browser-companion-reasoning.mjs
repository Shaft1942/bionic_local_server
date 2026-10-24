// All API and assets are intercepted. No real companion, engine, model or GPU.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), origin = 'http://companion-reasoning.test';
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href) : await import('playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const captures = process.env.BIONIC_BROWSER_CAPTURES;
if (captures) await fs.mkdir(captures, { recursive: true });
const instanceId = 'reasoning-fixture', projectId = 'reasoning-project', chatId = 'web-11111111-1111-4111-8111-111111111111';
function fixture() {
  let provider = 'bionic', revision = 1, mode = 'ok', failReads = false, modelBusy = false;
  let llamaUrl='http://127.0.0.1:19996',hasLlamaToken=false,profileRevision=1,profileFailure=false,localScenario=false,unloadedLocal=false;
  const posts = [], unknown = [];
  const binary = { id:'binary',name:'Modèle binaire',type:'llm',loaded:true,loadedInstances:[],reasoning:{kind:'toggle',allowedOptions:['off','on'],default:'on'} };
  const graded = { id:'graded',name:'Modèle gradué',type:'llm',loaded:true,loadedInstances:[],reasoning:{allowedOptions:['minimal','low','medium','high','xhigh','max'],default:'medium'} };
  const absent = { id:'unknown',name:'Options inconnues',type:'llm',loaded:true,loadedInstances:[],reasoning:null };
  const chat = { id:chatId,projectId,source:'web',name:'Chat de réflexion',model:'binary',reasoningByModel:{binary:'off',graded:'medium'},messages:[{id:'fixture-message',role:'assistant',text:'Réponse synthétique.',complete:true}] };
  const current = () => ({ provider,revision:'inference-'+revision,editable:true,busy:false,reconciliationRequired:false,apiUrl:'http://127.0.0.1:19995',llamaUrl,hasLlamaToken });
  const models = () => provider === 'bionic' ? [binary,graded,absent] : [{...binary,reasoning:{kind:'toggle',allowedOptions:['off','on'],default:null}}];
  const json = (route,value,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  async function api(route) {
    const req=route.request(), url=new URL(req.url()), name=url.pathname;
    if (!name.startsWith('/api/')) return false;
    const body=req.method()==='POST'?req.postDataJSON():null;
    if(body) posts.push({name,body,provider});
    if(name==='/api/ping') await json(route,{instanceId,version:'2.6.0-beta.8'});
    else if(name==='/api/projects') await json(route,{projects:[{id:projectId,name:'Projet synthétique',locallyOwned:true}]});
    else if(name==='/api/sessions') await json(route,{sessions:[{id:chatId,projectId,name:chat.name,source:'web'}],total:1});
    else if(name==='/api/conversation') await json(route,chat);
    else if(name==='/api/models') {
      if(mode==='race'){provider=provider==='bionic'?'llamacpp':'bionic';revision++;mode='ok';}
      await json(route,unloadedLocal?{error:'Synthetic profile is not loaded'}:{models:models(),provider:mode==='bad-meta'?'unrecognized':provider,inferenceRevision:current().revision},unloadedLocal?503:200);
    }
    else if(name==='/api/comfy/settings') await json(route,{enabled:false,available:false,workflows:[]});
    else if(name==='/api/inference/model-selection') await json(route,{busy:modelBusy,reconciliationRequired:modelBusy,editable:true,operation:modelBusy?{state:'unknown',modelId:'synthetic'}:null});
    else if(name==='/api/llama-server') await json(route,profileFailure?{error:'Synthetic profile unavailable'}:{profile:{endpoint:'http://127.0.0.1:19996',directory:'Fixture',revision:'profile-'+profileRevision},process:{owned:false,state:localScenario?'configured':'detected-unowned'},canControl:localScenario},profileFailure?503:200);
    else if(name==='/api/llama-server/models') await json(route,{models:localScenario?[{id:'a'.repeat(64),relativePath:'Fixture-local.gguf',name:'Fixture-local.gguf',selectable:true}]:[]});
    else if(name==='/api/inference/settings') {
      if(body) {
        assert.deepEqual(Object.keys(body).sort(),body.llamaUrl?['clearLlamaToken','expectedRevision','llamaUrl','provider']:['expectedRevision','provider']); assert.equal(body.expectedRevision,current().revision);
        if(body.llamaUrl){assert.equal(body.llamaUrl,'http://127.0.0.1:19996');assert.equal(body.clearLlamaToken,true);assert.equal(hasLlamaToken,true);}
        if(mode==='refuse') { await json(route,{error:'Refus synthétique avant effet'},409); return true; }
        provider=body.provider; revision++;
        if(body.llamaUrl){llamaUrl=body.llamaUrl;hasLlamaToken=false;unloadedLocal=true;}
        if(mode==='lost-read') failReads=true;
        if(mode==='lost'||mode==='lost-read') { await route.abort('failed'); return true; }
        await json(route,current());
      } else await json(route,failReads?{error:'Synthetic unavailable'}:current(),failReads?503:200);
    }
    else if(name==='/api/chat') {
      const selected=models().find(item=>item.id===body.model); assert(selected);
      assert(body.reasoning==='default'||selected.reasoning?.allowedOptions.includes(body.reasoning),'No stale or invented reasoning override reaches the server');
      // Explicit refusal keeps the next-message draft visible; no generation is executed.
      await json(route,{error:'Refus synthétique avant génération'},403);
    }
    else if(name==='/api/model-preferences') await json(route,{automatic:true,maxOutputTokens:8192,source:'model',contextLength:16384});
    else { unknown.push(name); await json(route,{error:'Unmocked route'},404); }
    return true;
  }
  return {api,posts,unknown,binary,graded,current,mode(value){mode=value;},restoreReads(){failReads=false;},modelBusy(value){modelBusy=value;},external(){provider='llamacpp';llamaUrl='http://127.0.0.1:19997';hasLlamaToken=true;localScenario=true;unloadedLocal=false;revision++;},profileFailure(value){profileFailure=value;},staleProfile(){profileRevision++;}};
}
const results=[];
try { for(const width of [1280,320]) for(const language of ['fr','en']) {
  const state=fixture(),context=await browser.newContext({viewport:{width,height:1000},locale:language==='fr'?'fr-FR':'en-US',hasTouch:width===320,reducedMotion:'reduce'});
  await context.addInitScript(({instanceId,projectId,chatId,language})=>{
    localStorage.setItem('bionic:llama-preferences:'+instanceId,JSON.stringify({language,theme:'light',draftHours:24}));
    localStorage.setItem('bionic:llama-prototype:'+instanceId,JSON.stringify({projectId,chatId,jobs:[]}));
  },{instanceId,projectId,chatId,language});
  const page=await context.newPage(),errors=[],csp=[];page.setDefaultTimeout(12000);
  page.on('pageerror',error=>errors.push(error.message)); page.on('console',message=>{if(/content.security.policy|violates the following/i.test(message.text()))csp.push(message.text());});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());assert.equal(url.origin,origin);
    if(await state.api(route))return;
    const file=path.resolve(root,'public',url.pathname==='/prototype/'?'llama-ui/index.html':url.pathname.slice(1));assert(file.startsWith(path.join(root,'public')+path.sep));
    const contentType=({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'text/html';
    await route.fulfill({contentType,body:await fs.readFile(file),headers:contentType==='text/html'?{'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'"}:{}});
  });
  const tr=(fr,en)=>language==='fr'?fr:en;
  const reasoning=()=>page.getByLabel(tr('Réflexion','Reasoning'),{exact:true});
  const model=()=>page.getByLabel(tr('Modèle','Model'),{exact:true});
  const engine=()=>page.getByLabel(tr('Moteur · tous les chats','Engine · all chats'),{exact:true});
  const button=(fr,en)=>page.getByRole('button',{name:tr(fr,en),exact:true});
  const prompt=()=>page.getByRole('textbox',{name:'Message',exact:true});
  const choice=async value=>{await model().selectOption(value);await page.waitForTimeout(20);};
  const sameValue=async(locator,value)=>page.waitForFunction(({id,value})=>document.getElementById(id)?.value===value,{id:await locator.getAttribute('id'),value});
  const reasonValue=async value=>sameValue(reasoning(),value);
  const shot=async name=>{if(captures)await page.screenshot({path:path.join(captures,`${width}-${language}-${name}.png`)});};
  const send=async expected=>{const count=state.posts.length;await prompt().fill('Intention conservée');await button('Envoyer','Send').click();await page.waitForFunction(({instanceId})=>JSON.parse(localStorage.getItem('bionic:llama-prototype:'+instanceId)).jobs.length===0,{instanceId});assert.equal(state.posts.length,count+1);assert.equal(state.posts.at(-1).name,'/api/chat');assert.equal(state.posts.at(-1).body.reasoning,expected);await page.waitForFunction(()=>document.querySelector('#prompt')?.value==='Intention conservée');};
  const apply=async provider=>{await engine().selectOption(provider);await button('Utiliser ce moteur','Use this engine').click();await page.waitForFunction(()=>!document.querySelector('#chat-engine')?.disabled);};
  try {
    await page.goto(origin+'/prototype/');await reasonValue('off');
    assert.deepEqual(await reasoning().locator('option').evaluateAll(items=>items.map(item=>item.value)),['default','off','on']);
    assert.match(await reasoning().locator('option[value=default]').innerText(),language==='fr'?/Activée/:/On/);
    await reasoning().selectOption('on');await prompt().fill('Brouillon et permissions conservés');await shot('binary');
    await choice('graded');await reasonValue('medium');assert.equal(await reasoning().locator('option[value=minimal]').innerText(),tr('Minimale','Minimal'));assert.equal(await reasoning().locator('option[value=max]').innerText(),tr('Maximale','Maximum'));await reasoning().selectOption('high');await shot('graded');
    await choice('binary');await reasonValue('on');assert.equal(state.posts.length,0,'Local choices issue no POST');
    await page.reload();await reasonValue('on');assert.equal(await prompt().inputValue(),'Brouillon et permissions conservés');
    await choice('graded');await reasonValue('high');await send('high');
    await choice('binary');await reasonValue('on');await send('on');
    await choice('unknown');await reasonValue('default');assert(await reasoning().isDisabled());assert.match(await page.locator('#chat-reasoning-help').innerText(),language==='fr'?/aucun choix/:/no recognized/);await shot('unknown');await send('default');
    state.binary.reasoning.allowedOptions=['off'];state.binary.reasoning.default='off';await page.reload();await reasoning().waitFor();await choice('binary');await reasonValue('default');await send('default');
    state.binary.reasoning.allowedOptions=['off','on'];state.binary.reasoning.default='on';state.graded.reasoning.allowedOptions.push('future');await page.reload();await reasonValue('on');
    await choice('graded');await reasonValue('high');assert.equal(await reasoning().locator('option[value=future]').count(),0);assert.match(await page.locator('#chat-reasoning-help').innerText(),language==='fr'?/ne sont pas reconnues/:/unrecognized/);
    const beforeEngine=state.posts.length;await engine().selectOption('llamacpp');assert.equal(state.posts.length,beforeEngine,'Choosing an engine is local until validation');
    state.mode('lost');await button('Utiliser ce moteur','Use this engine').click();await page.waitForFunction(()=>document.querySelector('#chat-engine')?.value==='llamacpp'&&!document.querySelector('#chat-engine')?.disabled);await reasonValue('off');
    assert.equal(state.posts.length,beforeEngine+1,'Lost mutation response is never resubmitted');await reasoning().selectOption('off');await send('off');
    state.mode('ok');await apply('bionic');await reasonValue('on');assert.equal(await prompt().inputValue(),'Intention conservée');
    state.mode('refuse');const beforeRefusal=state.posts.length;await apply('llamacpp');assert.equal(await engine().inputValue(),'bionic');assert.equal(state.posts.length,beforeRefusal+1);
    state.mode('lost-read');const beforeUnknown=state.posts.length;await engine().selectOption('llamacpp');await button('Utiliser ce moteur','Use this engine').click();await button('Relire le moteur','Reload engine').waitFor();
    assert(await model().isDisabled());assert(await reasoning().isDisabled());assert(await button('Envoyer','Send').isDisabled());await shot('engine-unconfirmed');
    state.restoreReads();state.modelBusy(true);await button('Relire le moteur','Reload engine').click();
    await page.waitForFunction(()=>document.querySelector('select[aria-label="Modèle"],select[aria-label="Model"]')?.value==='pending'&&document.querySelector('#chat-reasoning')?.disabled);
    assert(await reasoning().isDisabled(),'Reasoning is disabled while model selection is unresolved');
    state.modelBusy(false);await page.waitForFunction(()=>!document.querySelector('#chat-reasoning')?.disabled);
    assert.equal(state.posts.length,beforeUnknown+1,'Recovery after failed GET uses GET only');
    await page.reload();await reasonValue('off');assert.equal(await prompt().inputValue(),'Intention conservée');
    const beforeRace=state.posts.length;state.mode('race');await apply('bionic');await page.waitForFunction(()=>document.querySelector('#chat-engine')?.value==='llamacpp'&&!document.querySelector('#chat-engine')?.disabled);assert.equal(state.posts.length,beforeRace+1,'A concurrent engine revision is repaired with GET only');
    state.mode('bad-meta');await page.reload();const repair=button('Relire le moteur et les modèles','Reload engine and models');await repair.waitFor();assert(await button('Envoyer','Send').isDisabled());assert(await reasoning().isDisabled());const beforeRepair=state.posts.length;state.mode('ok');await repair.click();await reasonValue('off');assert.equal(state.posts.length,beforeRepair,'Explicit catalogue repair never mutates the engine');
    // Explicit external connection -> configured local profile; no implicit model/process action.
    state.external();state.profileFailure(true);await page.reload();await engine().waitFor();await page.waitForTimeout(60);assert.equal(await button('Utiliser les GGUF locaux','Use local GGUFs').count(),0,'Unknown local profile offers no action');
    state.profileFailure(false);await page.reload();const local=button('Utiliser les GGUF locaux','Use local GGUFs');await local.waitFor();
    const beforeLocal=state.posts.length;await local.click();const dialog=page.getByRole('dialog',{name:tr('Utiliser les GGUF locaux','Use local GGUFs'),exact:true});await dialog.waitFor();
    assert.match(await dialog.innerText(),language==='fr'?/jeton.*sera effacé/:/token.*removed/);assert.match(await dialog.innerText(),language==='fr'?/ni arrêté ni adopté/:/neither stopped nor adopted/);assert.equal(state.posts.length,beforeLocal);await shot('local-confirmation');
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert(await local.evaluate(e=>e===document.activeElement));assert.equal(state.posts.length,beforeLocal);
    await local.click();await dialog.waitFor();state.staleProfile();await dialog.getByRole('button',{name:tr('Connecter le profil local','Connect local profile'),exact:true}).click();await page.getByRole('alert').filter({hasText:tr('La connexion ou le profil a changé','The connection or profile changed')}).waitFor();assert.equal(state.posts.length,beforeLocal,'Stale local profile cannot mutate the connection');
    await local.click();await dialog.waitFor();state.mode('lost');await dialog.getByRole('button',{name:tr('Connecter le profil local','Connect local profile'),exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#chat-engine')?.disabled&&document.querySelector('[aria-label="Modèle"],[aria-label="Model"] optgroup option[value^="gguf:"]'));
    assert.equal(state.posts.length,beforeLocal+1,'Lost local connection response is never replayed');assert.equal(state.current().llamaUrl,'http://127.0.0.1:19996');assert.equal(state.current().hasLlamaToken,false);
    assert.equal(await model().inputValue(),'');assert(await button('Envoyer','Send').isDisabled());assert.equal(await prompt().inputValue(),'Intention conservée');assert.equal(await model().locator('option[value^="gguf:"]').count(),1,'Local GGUF remains accessible without a loaded model');assert.equal(state.posts.filter(item=>item.name==='/api/inference/select-model').length,0);
    await reasoning().focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');
    const size=await reasoning().boundingBox();assert(size.height>=44);if(width===320)await engine().tap();await page.keyboard.press('Escape');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);assert.deepEqual(state.unknown,[]);
    results.push({width,language,binary:true,graded:true,unknown:true,perModelDraftReload:true,chatPreference:true,staleChoiceSanitized:true,engineGlobalExplicit:true,lostPostNoReplay:true,failedReadRecovery:true,modelSelectionDisabled:true,noUnvalidatedPost:true,engineRevisionRaceRepaired:true,invalidCatalogueBlockedAndRecovered:true,localProfileExplicit:true,tokenWarningAndClear:true,staleProfileNoPost:true,unloadedLocalGgufAccessible:true,noImplicitModelPost:true,chatPosts:state.posts.filter(item=>item.name==='/api/chat').length,enginePosts:state.posts.filter(item=>item.name==='/api/inference/settings').length});
  } catch(error) { console.error(JSON.stringify({width,language,errors,unknown:state.unknown,posts:state.posts,text:(await page.locator('body').innerText()).slice(-3500)}));await shot('failure');throw error; }
  finally { await context.close(); }
} console.log(JSON.stringify({ok:true,syntheticOnly:true,results},null,2)); } finally { await browser.close(); }
