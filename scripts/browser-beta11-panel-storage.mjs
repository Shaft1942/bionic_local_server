// Old /prototype/ assets then new / assets in the same tab; every API is intercepted.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),oldPublic=process.env.BIONIC_BROWSER_LEGACY_PUBLIC_DIR||path.join(root,'public'),nextPublic=process.env.BIONIC_BROWSER_PUBLIC_DIR||oldPublic;
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'}),results=[];
const origin='http://panel-storage.test',instanceId='route-fixture',pid='project-a',cid='web-11111111-1111-4111-8111-111111111111',imageChat='web-22222222-2222-4222-8222-222222222222';
const fileText='  Brouillon fichier 中文 🌿\n\nDernière ligne.  \n',imageText='  Prompt image exact 中文 🌿\n\nLumière douce.  ',negative='  Éviter les défauts — été.  ';
const key=(identity,route,kind,scope)=>`companion-prototype:${identity}:${route}:${kind}:${scope}`;
const fileScope=pid+':project:notes.md';
async function setup(context,language,publicState){
  const reads=[],posts=[],errors=[];
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  const job={id:'image-job',status:'running',prompt:'Image suivie',seed:42,format:'square',workflowId:'workflow-a'};
  const chat={id:cid,projectId:pid,source:'web',name:'Chat de stockage',model:'fixture',messages:[{id:'user',role:'user',text:'Texte synthétique.'},{id:'reply',role:'assistant',text:'Réponse synthétique.',complete:true}]};
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);
    if(req.method()!=='GET'){posts.push(url.pathname);throw Error('No POST is permitted during storage restoration');}
    if(url.pathname.startsWith('/api/')){
      reads.push({path:url.pathname,pid:url.searchParams.get('projectId'),requestId:url.searchParams.get('requestId')});let value;
      if(url.pathname==='/api/ping')value={instanceId,version:'2.6.0-beta.11'};
      else if(url.pathname==='/api/projects')value={projects:[{id:pid,name:'Projet A',locallyOwned:true},{id:'project-b',name:'Projet B',locallyOwned:true},{id:'companion-unassigned',name:'Sans projet',isUnassigned:true}]};
      else if(url.pathname==='/api/inference/settings')value={provider:'bionic',revision:'fixture',editable:true};
      else if(url.pathname==='/api/models')value={provider:'bionic',inferenceRevision:'fixture',models:[{id:'fixture',name:'Fixture',type:'llm',loaded:true}]};
      else if(url.pathname==='/api/comfy/settings')value={enabled:true,available:true,workflowId:'workflow-a',workflows:[{id:'workflow-a',label:'Workflow A'},{id:'workflow-b',label:'Workflow B',negativePrompt:true}]};
      else if(url.pathname==='/api/sessions')value={sessions:url.searchParams.get('projectId')===pid?[chat]:[],total:url.searchParams.get('projectId')===pid?1:0};
      else if(url.pathname==='/api/conversation')value=url.searchParams.get('id')===imageChat?{id:imageChat,projectId:pid,messages:[{id:'image-message',role:'assistant',requestId:'pending-image',imageGenerations:[job]}]}:chat;
      else if(url.pathname==='/api/file-roots')value={roots:[{id:'project',name:'Projet',writable:true}]};
      else if(url.pathname==='/api/files')value={path:'',entries:[{name:'notes.md',path:'notes.md',directory:false}]};
      else if(url.pathname==='/api/file')value={rootId:'project',path:'notes.md',name:'notes.md',text:'Texte serveur.',hash:'f'.repeat(64),editable:true,attachable:true,size:14};
      else if(url.pathname==='/api/comfy/generations')value={images:[],total:0,nextCursor:null};
      else if(url.pathname==='/api/chat-request')value={id:imageChat,projectId:pid,status:'running'};
      else if(url.pathname==='/api/comfy/generation')value=job;
      else throw Error('Unexpected synthetic API '+url.pathname);
      return route.fulfill({json:value});
    }
    const filename=path.resolve(publicState.current,url.pathname==='/'||url.pathname==='/prototype/'?'llama-ui/index.html':url.pathname.slice(1));assert(filename.startsWith(path.resolve(publicState.current)+path.sep));
    await route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(filename)]||'text/html',body:await fs.readFile(filename)});
  });
  await context.addInitScript(({instanceId,pid,cid,language})=>{const key='bionic:llama-prototype:'+instanceId;if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({projectId:pid,chatId:cid,jobs:[]}));localStorage.setItem('bionic:llama-preferences:'+instanceId,JSON.stringify({language}));},{instanceId,pid,cid,language});
  return{page,reads,posts,errors};
}
try{for(const width of [1280,320])for(const language of ['fr','en']){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),publicState={current:oldPublic},{page,reads,posts,errors}=await setup(context,language,publicState),tr=(fr,en)=>language==='fr'?fr:en;
  const tab=async(fr,en)=>{await page.getByRole('navigation',{name:tr('Espace du projet','Project workspace'),exact:true}).getByRole('button',{name:tr(fr,en),exact:true}).click();};
  const openFile=async()=>{await tab('Fichiers','Files');await page.getByRole('button',{name:tr('Ouvrir le fichier notes.md','Open file notes.md'),exact:true}).click();return page.locator('#project-file-editor');};
  try{
    await context.addInitScript(({instanceId,pid})=>{const k=`companion-prototype:${instanceId}:/prototype/:image-tracking:${pid}`;if(!localStorage.getItem(k))localStorage.setItem(k,JSON.stringify([{requestId:'pending-image',kind:'direct'}]));},{instanceId,pid});
    await page.goto(origin+'/prototype/');await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();const close=page.getByRole('button',{name:tr('Fermer la navigation','Close navigation'),exact:true});if(width<760&&await close.isVisible())await close.click();
    await(await openFile()).fill(fileText);await tab('Images','Images');await page.locator('#image-workflow').selectOption('workflow-b');await page.locator('#image-prompt').fill(imageText);await page.locator('#image-negative').fill(negative);await page.locator('#image-seed').fill('00042');await page.locator('#image-format').selectOption('portrait');await page.getByRole('spinbutton',{name:tr('Nombre d’images','Image count'),exact:true}).fill('3');await page.locator('.request-id[title="pending-image"]').waitFor();
    const before=await page.evaluate(({instanceId,pid,scope})=>({file:sessionStorage.getItem(`companion-prototype:${instanceId}:/prototype/:file:${scope}`),image:sessionStorage.getItem(`companion-prototype:${instanceId}:/prototype/:image-draft:${pid}`),tracking:localStorage.getItem(`companion-prototype:${instanceId}:/prototype/:image-tracking:${pid}`)}),{instanceId,pid,scope:fileScope});assert.equal(JSON.parse(before.file).text,fileText);assert.equal(JSON.parse(before.image).prompt,imageText);assert(reads.some(read=>read.path==='/api/chat-request'&&read.requestId==='pending-image'));
    await page.evaluate(({instanceId,pid})=>{sessionStorage.setItem(`companion-prototype:other-instance:/prototype/:image-draft:${pid}`,'other instance');sessionStorage.setItem(`companion-prototype:${instanceId}:/prototype/:image-draft:project-b`,'other project');},{instanceId,pid});
    publicState.current=nextPublic;const priorReads=reads.length;await page.goto(origin+'/');await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();if(width<760&&await close.isVisible())await close.click();assert.equal(await(await openFile()).inputValue(),fileText);await tab('Images','Images');await page.locator('#image-prompt').waitFor();assert.equal(await page.locator('#image-prompt').inputValue(),imageText);assert.equal(await page.locator('#image-negative').inputValue(),negative);assert.equal(await page.locator('#image-seed').inputValue(),'00042');assert.equal(await page.locator('#image-format').inputValue(),'portrait');assert.equal(await page.getByRole('spinbutton',{name:tr('Nombre d’images','Image count'),exact:true}).inputValue(),'3');await page.locator('.request-id[title="pending-image"]').waitFor();assert(reads.slice(priorReads).some(read=>['/api/chat-request','/api/comfy/generation'].includes(read.path)&&read.pid===pid));
    const after=await page.evaluate(({instanceId,pid,scope})=>({file:sessionStorage.getItem(`companion-prototype:${instanceId}:/:file:${scope}`),image:sessionStorage.getItem(`companion-prototype:${instanceId}:/:image-draft:${pid}`),tracking:localStorage.getItem(`companion-prototype:${instanceId}:/:image-tracking:${pid}`),oldFile:sessionStorage.getItem(`companion-prototype:${instanceId}:/prototype/:file:${scope}`),oldImage:sessionStorage.getItem(`companion-prototype:${instanceId}:/prototype/:image-draft:${pid}`),other:sessionStorage.getItem(`companion-prototype:other-instance:/prototype/:image-draft:${pid}`),otherProject:sessionStorage.getItem(`companion-prototype:${instanceId}:/prototype/:image-draft:project-b`),foreignCanonical:sessionStorage.getItem(`companion-prototype:${instanceId}:/:image-draft:project-b`)}),{instanceId,pid,scope:fileScope});assert.equal(after.file,before.file);assert.equal(after.image,before.image);assert.equal(after.oldFile,before.file);assert.equal(after.oldImage,before.image);assert(JSON.parse(after.tracking).some(track=>track.requestId==='pending-image'));assert.equal(after.other,'other instance');assert.equal(after.otherProject,'other project');assert.equal(after.foreignCanonical,null);
    const editor=await openFile();await editor.fill('Texte serveur.');await page.reload();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();assert.equal(await(await openFile()).inputValue(),'Texte serveur.','A cleared canonical file draft never reappears from its historical alias');
    await page.evaluate(({instanceId,pid,scope})=>addEventListener('pagehide',()=>{sessionStorage.setItem(`companion-prototype:${instanceId}:/:file:${scope}`,JSON.stringify({text:'  Brouillon canonique 中文.  ',original:'Texte serveur.',hash:'f'.repeat(64)}));sessionStorage.setItem(`companion-prototype:${instanceId}:/:image-draft:${pid}`,JSON.stringify({prompt:'  Image canonique 中文.  ',seed:'007',format:'landscape',workflowId:'workflow-a',negativePrompt:'',imageCount:2}));},{once:true}),{instanceId,pid,scope:fileScope});await page.reload();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();assert.equal(await(await openFile()).inputValue(),'  Brouillon canonique 中文.  ');await tab('Images','Images');assert.equal(await page.locator('#image-prompt').inputValue(),'  Image canonique 中文.  ');assert.equal(await page.locator('#image-seed').inputValue(),'007');assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),key(instanceId,'/prototype/','file',fileScope)),before.file);assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
    results.push({width,language,oldToNewRoute:true,exactFileDraft:true,exactImageDraft:true,trackingRestoredGetOnly:true,aliasesPreserved:true,canonicalDraftPriority:true,instanceAndProjectIsolation:true,clearedDraftNotResurrected:true,generationPosts:0});
  }finally{await context.close();}
}console.log(JSON.stringify({ok:true,syntheticOnly:true,results},null,2));}finally{await browser.close();}
