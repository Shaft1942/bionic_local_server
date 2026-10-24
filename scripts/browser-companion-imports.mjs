// Every route is intercepted. Synthetic files only; no server, engine or model is contacted.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'});
const origin='http://companion-imports.test',captures=process.env.BIONIC_BROWSER_CAPTURES;
if(captures)await fs.mkdir(captures,{recursive:true});
const results=[],hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=(name,text=name)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
function fixture(){
 const files=new Map([['notes.md',{rootId:'project',path:'notes.md',name:'notes.md',text:'Note initiale',size:13,hash:hash('Note initiale'),kind:'text',editable:true,attachable:true}]]),posts=[],gets=[];
 let holdName='',release=null,received=null;
 const json=(route,value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
 async function api(route){
  const req=route.request(),url=new URL(req.url()),name=url.pathname;
  if(!name.startsWith('/api/'))return false;
  if(req.method()==='GET')gets.push({name,projectId:url.searchParams.get('projectId')});else posts.push({name,filename:url.searchParams.get('name')});
  let value;
  if(name==='/api/ping')value={version:'2.6.0-beta.7',instanceId:'imports-fixture'};
  else if(name==='/api/projects')value={projects:[{id:'p1',name:'Projet synthétique',locallyOwned:true},{id:'p2',name:'Autre projet',locallyOwned:true}]};
  else if(name==='/api/sessions')value={sessions:[],total:0};
  else if(name==='/api/models')value={provider:'bionic',inferenceRevision:'fixture',models:[{id:'fixture',name:'Fixture',type:'llm',loaded:true,contextLength:4096}]};
  else if(name==='/api/inference/settings')value={provider:'bionic',revision:'fixture',editable:true};
  else if(name==='/api/inference/model-selection')value={busy:false};
  else if(name==='/api/comfy/settings')value={enabled:false,available:false,workflows:[]};
  else if(name==='/api/file-roots')value={roots:[{id:'project',name:'Projet',writable:url.searchParams.get('projectId')==='p1'}]};
  else if(name==='/api/files'){
   const folder=url.searchParams.get('path')||'';
   value={path:folder,entries:[...files.values()].filter(file=>(folder?file.path.startsWith(folder+'/'):!file.path.includes('/'))).map(({name,path,size})=>({name,path,size,directory:false}))};
  }else if(name==='/api/file'){
   value=files.get(url.searchParams.get('path'));if(!value){await json(route,{error:'Fichier synthétique absent'},404);return true;}
  }else if(name==='/api/file/upload'){
   const filename=url.searchParams.get('name');assert.equal(url.searchParams.get('projectId'),'p1');
   if(filename==='refused.txt'){await json(route,{error:'Refus synthétique avant effet'},403);return true;}
   const buffer=req.postDataBuffer(),stem=path.basename(filename,path.extname(filename)),extension=path.extname(filename);let actual=filename,index=2;
   while(files.has('Imports telephone/'+actual))actual=stem+' ('+(index++)+')'+extension;
   value={rootId:'project',path:'Imports telephone/'+actual,name:actual,size:buffer.length,hash:hash(buffer),kind:filename.endsWith('.bin')?'binary':'text',attachable:!filename.endsWith('.bin'),editable:!filename.endsWith('.bin'),text:buffer.toString()};files.set(value.path,value);
   if(filename===holdName){received?.();await new Promise(resolve=>release=resolve);}
   if(filename==='lost.txt'){await route.abort('failed');return true;}
   await json(route,value,201);return true;
  }else throw Error('Unexpected synthetic API '+name);
  await json(route,value);return true;
 }
 return{api,posts,gets,files,hold(name){holdName=name;return new Promise(resolve=>received=resolve);},release(){release?.();holdName='';}};
}
try{for(const width of [1280,320])for(const language of ['fr','en']){
 const context=await browser.newContext({viewport:{width,height:960},locale:language==='fr'?'fr-FR':'en-GB',reducedMotion:'reduce'}),page=await context.newPage(),state=fixture(),errors=[];
 page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());assert.equal(url.origin,origin,'All requests stay intercepted');if(await state.api(route))return;
  const filename=path.resolve(root,'public',url.pathname==='/prototype/'?'llama-ui/index.html':url.pathname.slice(1));assert(filename.startsWith(path.resolve(root,'public')+path.sep));
  await route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(filename)]||'text/html',body:await fs.readFile(filename)});
 });
 await page.addInitScript(language=>{localStorage.setItem('bionic:llama-preferences:imports-fixture',JSON.stringify({language,theme:'light',draftHours:24}));localStorage.setItem('bionic:llama-prototype:imports-fixture',JSON.stringify({projectId:'p1'}));},language);
 const tr=(fr,en)=>language==='fr'?fr:en,nav=()=>page.getByRole('navigation',{name:tr('Espace du projet','Project workspace'),exact:true});
 const closeNav=async()=>{const button=page.getByRole('button',{name:tr('Fermer la navigation','Close navigation'),exact:true});if(width<760&&await button.isVisible())await button.click();};
 const filesTab=async()=>{await nav().getByRole('button',{name:tr('Fichiers','Files'),exact:true}).click();await page.getByRole('button',{name:tr('Importer des fichiers','Import files'),exact:true}).waitFor();};
 const panel=()=>page.locator('.files-panel'),input=()=>panel().locator('input[type=file]');
 const upload=async(selected,attach=false)=>{const chooser=page.waitForEvent('filechooser');await panel().getByRole('button',{name:attach?tr('Importer puis joindre','Import and attach'):tr('Importer des fichiers','Import files'),exact:true}).click();await(await chooser).setFiles(selected);};
 const waitDone=()=>panel().getByRole('button',{name:tr('Relire les fichiers importés','Refresh imported files'),exact:true}).waitFor();
 const row=name=>panel().locator('.import-results li').filter({has:page.getByText(name,{exact:true})});
 try{
  await page.goto(origin+'/prototype/');await nav().waitFor();await closeNav();await page.getByRole('textbox',{name:tr('Message','Message'),exact:true}).fill('Brouillon chat conservé');await filesTab();
  await panel().getByRole('button',{name:tr('Ouvrir le fichier notes.md','Open file notes.md'),exact:true}).click();await panel().locator('#project-file-editor').fill('Brouillon fichier conservé');
  assert.equal(await input().getAttribute('multiple'),'');
  await upload([bytes('one.txt'),bytes('two.txt'),bytes('binary.bin')]);await waitDone();assert.equal(await panel().locator('[data-import-status=imported]').count(),3);assert.equal(await panel().locator('#project-file-editor').inputValue(),'Brouillon fichier conservé');
  assert.equal(await page.locator('.attachment-chips span').count(),0,'Plain import does not attach');
  await upload([bytes('refused.txt'),bytes('good-after-refusal.txt')]);await waitDone();assert.equal(await row('refused.txt').getAttribute('data-import-status'),'refused');assert.equal(state.files.has('Imports telephone/refused.txt'),false);assert.equal(state.files.has('Imports telephone/good-after-refusal.txt'),true);
  const beforeLost=state.posts.length;await upload([bytes('lost.txt'),bytes('never-sent.txt')]);await waitDone();assert.equal(state.posts.length,beforeLost+1);assert.equal(await row('lost.txt').getAttribute('data-import-status'),'uncertain');assert.equal(await row('never-sent.txt').getAttribute('data-import-status'),'not-sent');assert(state.files.has('Imports telephone/lost.txt'));
  await panel().getByRole('button',{name:tr('Relire les fichiers importés','Refresh imported files'),exact:true}).click();assert.equal(state.posts.length,beforeLost+1);await panel().getByRole('button',{name:tr('Ouvrir le fichier lost.txt','Open file lost.txt'),exact:true}).waitFor();
  await page.reload();await nav().waitFor();await closeNav();await filesTab();await row('lost.txt').waitFor();assert.equal(await row('lost.txt').getAttribute('data-import-status'),'uncertain');assert.equal(state.posts.length,beforeLost+1,'Reload never uploads');
  await panel().getByRole('button',{name:tr('Ouvrir le fichier notes.md','Open file notes.md'),exact:true}).click();assert.equal(await panel().locator('#project-file-editor').inputValue(),'Brouillon fichier conservé','File editor draft survives reloading and import recovery');
  // Refusing session storage occurs before any POST, with a visible exit from the form.
  await page.evaluate(()=>{window.__storageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('companion-imports:'))throw new DOMException('Synthetic storage refused','QuotaExceededError');return window.__storageSet.call(this,key,value);};});
  const beforeStorage=state.posts.length;await upload([bytes('storage-refused.txt')]);await waitDone();assert.equal(state.posts.length,beforeStorage);await page.evaluate(()=>Storage.prototype.setItem=window.__storageSet);
  // Stop the batch after the already accepted file; retain its server copy.
  const held=state.hold('held.txt');await upload([bytes('held.txt'),bytes('cancelled-before-send.txt')]);await held;await panel().getByRole('button',{name:tr('Arrêter après ce fichier','Stop after this file'),exact:true}).click();state.release();await waitDone();assert(state.files.has('Imports telephone/held.txt'));assert.equal(state.files.has('Imports telephone/cancelled-before-send.txt'),false);
  // Explicit attachment adds at most four files; a fifth import stays on the PC.
  await upload(Array.from({length:5},(_,i)=>bytes('attached-'+i+'.txt')),true);
  await page.waitForFunction(()=>document.querySelectorAll('.attachment-chips span').length===4);if(await page.locator('dialog[open]').count())await page.getByRole('button',{name:tr('Fermer la fenêtre','Close window'),exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Brouillon chat conservé');
  await filesTab();await waitDone();assert.match(await row('attached-4.txt').innerText(),language==='fr'?/limite de quatre/:/four-file limit/);assert(state.files.has('Imports telephone/attached-4.txt'));
  await panel().getByRole('button',{name:tr('Relire les fichiers importés','Refresh imported files'),exact:true}).click();await panel().getByRole('button',{name:tr('Ouvrir le fichier one.txt','Open file one.txt'),exact:true}).waitFor();
  // Two unsaved chats share an empty chat id but must never share a late attachment.
  await page.getByRole('button',{name:tr('Fermer la fenêtre','Close window'),exact:true}).click();
  const nextDraft=async()=>{const open=page.getByRole('button',{name:tr('Ouvrir la navigation','Open navigation'),exact:true});if(await open.isVisible())await open.click();await page.getByRole('button',{name:tr('Nouveau chat','New chat'),exact:true}).click();};
  await nextDraft();while(await page.locator('.attachment-chips button').count())await page.locator('.attachment-chips button').first().click();await filesTab();
  const draftSwitch=state.hold('switch-draft.txt'),beforeDraftSwitch=state.posts.length;
  await upload([bytes('switch-draft.txt'),bytes('not-sent-new-draft.txt')],true);await draftSwitch;
  await page.getByRole('button',{name:tr('Fermer la fenêtre','Close window'),exact:true}).click();await nextDraft();
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Brouillon B intact');state.release();await filesTab();await waitDone();
  assert.equal(await page.locator('.attachment-chips span').count(),0,'Late reply from unsaved chat A never attaches to unsaved chat B');
  assert.equal(state.posts.length,beforeDraftSwitch+1);assert(state.files.has('Imports telephone/switch-draft.txt'));assert(!state.files.has('Imports telephone/not-sent-new-draft.txt'));
  assert.match(await row('switch-draft.txt').innerText(),language==='fr'?/conversation a changé/:/conversation changed/);
  // A component unmounted by project navigation must not attach its late reply elsewhere.
  const changing=state.hold('switch-project.txt'),beforeSwitch=state.posts.length;await upload([bytes('switch-project.txt'),bytes('not-sent-other-project.txt')],true);await changing;
  await page.getByRole('button',{name:tr('Fermer la fenêtre','Close window'),exact:true}).click();const opener=page.getByRole('button',{name:tr('Ouvrir la navigation','Open navigation'),exact:true});if(await opener.isVisible())await opener.click();await page.locator('.project-list').getByRole('button',{name:'Autre projet',exact:true}).click();await closeNav();state.release();await page.waitForTimeout(60);await filesTab();
  assert.equal(await panel().getByRole('button',{name:tr('Importer des fichiers','Import files'),exact:true}).isDisabled(),true,'Read-only root disables importing');assert.equal(state.posts.length,beforeSwitch+1);assert.equal(state.files.has('Imports telephone/not-sent-other-project.txt'),false);assert.equal(await panel().locator('.import-results li').count(),0,'Previous project import receipts remain scoped');
  await page.getByRole('button',{name:tr('Fermer la fenêtre','Close window'),exact:true}).click();assert.equal(await page.locator('.attachment-chips span').count(),0,'No late attachment leaks into a different project');
  if(await opener.isVisible())await opener.click();await page.locator('.project-list').getByRole('button',{name:'Projet synthétique',exact:true}).click();await closeNav();await filesTab();await row('switch-project.txt').waitFor();assert.match(await row('switch-project.txt').innerText(),language==='fr'?/conversation a changé/:/conversation changed/);
  assert.equal(state.posts.filter(post=>post.name!=='/api/file/upload').length,0,'No chat, engine or unrelated mutation');assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(captures)await page.screenshot({path:path.join(captures,width+'-'+language+'-imports.png')});
  results.push({width,language,multiple:true,importOnly:true,perFileRefusal:true,lostReplyReadOnlyRecovery:true,reload:true,storageRefusedBeforeEffect:true,cancelKeepsImported:true,explicitAttachLimit:4,chatAndEditorDraftsPreserved:true,unsavedChatSwitchStopsAttachment:true,projectSwitchStopsBatchAndAttachment:true,readOnlyDisabled:true,uploadPosts:state.posts.length,errors:0});
 }catch(error){if(captures)await page.screenshot({path:path.join(captures,width+'-'+language+'-failure.png')});throw error;}finally{state.release();await context.close();}
}console.log(JSON.stringify({ok:true,syntheticOnly:true,results,limitations:['Legacy void onAttach reports requested, not confirmed; integrator should pass attachmentCount and boolean onAttach.','No upload idempotence receipt exists: uncertain status remains until user inspects server files.','Viewports are not a physical phone.']},null,2));}finally{await browser.close();}
