// Real browser and companion HTTP, owned projects and synthetic model/web services.
// The only executed script is the constant fixture code below, writing in its temporary project.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPrototype, PROTOTYPE_CODE, PROTOTYPE_PROJECT } from '../lib/llama-ui-prototype.mjs';
import { createCompanion } from '../server.mjs';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'});
const captures=process.env.BIONIC_BROWSER_CAPTURES||process.env.BIONIC_SMOKE_SCREENSHOTS;
if(captures)await fs.mkdir(captures,{recursive:true});
const results=[],digest=value=>createHash('sha256').update(value).digest('hex');
const model={id:'synthetic-advanced',name:'Modèle synthétique avancé',type:'llm',tools:true,vision:false,loaded:true,contextLength:32768,loadedInstances:[{id:'synthetic-advanced',contextLength:32768}],reasoning:{allowedOptions:[]}};
const scriptCode="import fs from 'node:fs/promises'; await fs.appendFile('approved-once.txt','one execution\\n'); console.log('advanced fixture');";

async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'llama-advanced-fixture-'));
  const bootstrap=await createPrototype({root,listen:false,modelDelayMs:1});
  const settings={...bootstrap.app.settings,port:0,comfyEnabled:false};
  await bootstrap.app.close();
  const stats={modelCalls:0,webCalls:0};
  const transport={identity:{provider:'bionic',protocol:'chat-completions',endpoint:'http://127.0.0.1:19998'},async request({messages,tools=[]}){
    stats.modelCalls++;
    const last=messages.findLast(message=>message.role==='user')?.content||'',hasResults=messages.some(message=>message.role==='tool');
    let tool;
    if(!hasResults&&typeof last==='string'&&last.includes('SCRIPT_'))tool={name:'run_project_script',arguments:JSON.stringify({runtime:'node',code:scriptCode,timeoutSeconds:5})};
    if(!hasResults&&typeof last==='string'&&last.includes('WEB_APPROVE'))tool={name:'read_web_page',arguments:JSON.stringify({url:'https://example.org/fixture',length:1000})};
    if(tool)assert(tools.some(item=>item.function.name===tool.name),'Fixture requires the selected permission');
    const event=tool?{choices:[{delta:{tool_calls:[{index:0,id:randomUUID(),type:'function',function:tool}]},finish_reason:'tool_calls'}]}:{choices:[{delta:{content:'Réponse synthétique avancée terminée.'},finish_reason:'stop'}]};
    return new Response('data: '+JSON.stringify(event)+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  }};
  const supervisor={assertAdmission(){},activeCount:()=>0,protectedPaths:()=>[],async snapshot(){return{services:[],disabled:true};},async close(){}};
  const app=await createCompanion({root,publicDirectory:process.env.BIONIC_BROWSER_PUBLIC_DIR||path.join(sourceRoot,'public'),settings,nativeStore:{listProjects:async()=>[],listSessions:async()=>[],getConversation:async()=>{throw Object.assign(Error('Synthetic history missing'),{status:404});}},modelService:{list:async()=>[model],forInference:async()=>model,pendingCount:()=>0},modelTransport:transport,fetchImpl:async()=>{throw Error('Unexpected network call blocked by advanced fixture');},webService:{async read(url){assert.equal(url,'https://example.org/fixture');stats.webCalls++;return{url,title:'Page synthétique',text:'Contenu web synthétique',start:0,next:25,truncated:false};}},localServiceSupervisor:supervisor,enableUpdateScheduling:false});
  await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
  return{app,root,files:bootstrap.files,stats,url:'http://127.0.0.1:'+app.server.address().port};
}
async function sidebar(page){if(await page.locator('dialog[open]').count())await page.getByRole('button',{name:'Fermer la fenêtre',exact:true}).click();const opener=page.getByRole('button',{name:'Ouvrir la navigation',exact:true});if(await opener.isVisible())await opener.click();}
async function closeSidebar(page,width){if(width<760){const button=page.getByRole('button',{name:'Fermer la navigation',exact:true});if(await button.isVisible())await button.click();}}
async function topTab(page,name){await page.getByRole('navigation',{name:'Espace du projet',exact:true}).getByRole('button',{name,exact:true}).click();}
async function shot(page,name){if(captures)await page.screenshot({path:path.join(captures,name),fullPage:false});}
async function openTools(page){const panel=page.locator('#chat-tools-options');if(!await panel.evaluate(element=>element.matches(':popover-open')))await page.locator('[data-composer-menu="tools"]').click();await panel.waitFor({state:'visible'});}
async function until(action,label){for(let i=0;i<100;i++){const value=await action();if(value)return value;await new Promise(resolve=>setTimeout(resolve,50));}assert.fail(label);}
async function dropReply(page,pattern,status){let done,failed;const completed=new Promise((resolve,reject)=>{done=resolve;failed=reject;});await page.route(pattern,async route=>{try{const response=await route.fetch();assert.equal(response.status(),status);await route.abort('failed');done();}catch(error){failed(error);}});return async()=>{await completed;await page.unroute(pattern);};}

try{
  for(const width of [1280,390]){
    const f=await fixture(),context=await browser.newContext({locale:'fr-FR',viewport:{width,height:900}}),page=await context.newPage();
    const errors=[],posts=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')posts.push({path:new URL(request.url()).pathname,body:request.postData()});});
    const api=async(route,body)=>{const response=body===undefined?await context.request.get(f.url+route):await context.request.post(f.url+route,{data:body});const result=await response.json();assert(response.ok(),route+': '+response.status()+' '+JSON.stringify(result));return result;};
    const count=route=>posts.filter(item=>item.path===route).length;
    try{
      await page.goto(f.url);await page.locator('#access-code').fill(PROTOTYPE_CODE);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.getByRole('navigation',{name:'Espace du projet',exact:true}).waitFor();
      const original=await api('/api/file?'+new URLSearchParams({projectId:PROTOTYPE_PROJECT,rootId:'project',path:'notes.md'}));
      const saved=await api('/api/file/save',{projectId:PROTOTYPE_PROJECT,rootId:'project',path:'notes.md',hash:original.hash,text:'Version après action synthétique\n'});
      const action={id:randomUUID(),name:'write_project_file',message:'Fichier synthétique modifié',projectId:PROTOTYPE_PROJECT,path:'notes.md',hash:saved.hash,backupId:saved.backupId,ok:true};
      const id='web-'+randomUUID(),messageId=randomUUID(),chat={id,projectId:PROTOTYPE_PROJECT,name:'Conversation avancée',source:'web',readOnly:false,model:model.id,messages:[{id:randomUUID(),role:'user',text:'Question synthétique',createdAt:Date.now()-1000},{id:messageId,role:'assistant',text:'Réponse synthétique avancée à conserver.',actions:[action],complete:true,outcome:'completed',createdAt:Date.now()-500,finishedAt:Date.now()}],queue:[],createdAt:Date.now()-1000,updatedAt:Date.now(),generation:{status:'completed'}};
      await f.app.persistChat(chat);
      const trashId=randomUUID(),trashBytes=Buffer.from('Fichier retiré synthétique\n');
      // The project-files backup location is derived from the same explicit root as the server.
      const actualBackup=path.dirname(path.join(f.root,'data','file-backups',trashId+'.json'));
      await fs.mkdir(actualBackup,{recursive:true});await fs.writeFile(path.join(actualBackup,trashId+'.bin'),trashBytes);await fs.writeFile(path.join(actualBackup,trashId+'.json'),JSON.stringify({projectId:PROTOTYPE_PROJECT,rootId:'project',path:'removed.txt',hash:digest(trashBytes),kind:'trash',savedAt:Date.now()}));
      await page.reload();await sidebar(page);await page.locator('.chat-list').getByRole('button',{name:/Conversation avancée/}).click();await closeSidebar(page,width);
      await page.getByLabel('Actions de la conversation',{exact:true}).click();await page.getByRole('button',{name:'Renommer',exact:true}).click();await page.getByRole('textbox',{name:'Nom de la conversation',exact:true}).fill('Conversation renommée');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
      assert.equal((await api('/api/conversation?'+new URLSearchParams({projectId:PROTOTYPE_PROJECT,id}))).name,'Conversation renommée');
      const forksBefore=(await api('/api/sessions?projectId='+PROTOTYPE_PROJECT)).sessions.length;
      const forkDropped=await dropReply(page,'**/api/conversation/fork',201);
      await page.getByRole('button',{name:'Créer une branche depuis ce message',exact:true}).last().click();await forkDropped();await page.getByRole('button',{name:'Vérifier la modification',exact:true}).waitFor();await page.getByRole('button',{name:'Vérifier la modification',exact:true}).click();
      await page.getByRole('button',{name:'Voir la conversation d’origine',exact:true}).waitFor();assert.equal(count('/api/conversation/fork'),1);
      const forkList=(await api('/api/sessions?projectId='+PROTOTYPE_PROJECT)).sessions;assert.equal(forkList.length,forksBefore+1);const fork=forkList.find(item=>item.origin?.id===id);const copied=await api('/api/conversation?'+new URLSearchParams({projectId:PROTOTYPE_PROJECT,id:fork.id}));assert.equal(copied.messages.at(-1).actions,undefined);assert(copied.messages.at(-1).historicalActions?.length);assert.equal(copied.messages.at(-1).approvals,undefined);
      await topTab(page,'Activité');await page.getByRole('navigation',{name:'Rubriques de l’espace',exact:true}).getByRole('button',{name:'Actions et versions',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Rétablir la version précédente',exact:true}).count(),0,'fork journal cannot restore files');
      await topTab(page,'Chat');await page.getByRole('button',{name:'Voir la conversation d’origine',exact:true}).click();await page.getByRole('article',{name:'Réponse du modèle',exact:true}).getByText('Réponse synthétique avancée à conserver.',{exact:true}).waitFor();
      await topTab(page,'Activité');const workspaceNav=page.getByRole('navigation',{name:'Rubriques de l’espace',exact:true});await workspaceNav.getByRole('button',{name:'Livrables',exact:true}).click();await page.getByRole('textbox',{name:'Titre de la copie (facultatif)',exact:true}).fill('Copie immuable');await page.getByRole('button',{name:'Conserver la réponse',exact:true}).click();await page.locator('.entry').filter({hasText:'Copie immuable'}).getByRole('button',{name:'Ouvrir la copie',exact:true}).click();
      await page.getByRole('region',{name:'Détail du livrable',exact:true}).waitFor();const copies=(await api('/api/deliverables?projectId='+PROTOTYPE_PROJECT)).deliverables;assert.equal(copies.length,1);const downloaded=await context.request.get(f.url+'/api/deliverable/download?'+new URLSearchParams({projectId:PROTOTYPE_PROJECT,id:copies[0].id}));assert.equal(await downloaded.text(),'Réponse synthétique avancée à conserver.');
      await workspaceNav.getByRole('button',{name:'Actions et versions',exact:true}).click();await page.getByRole('button',{name:'Comparer les versions',exact:true}).click();await page.locator('.version-comparison').getByText('Version après action synthétique',{exact:false}).waitFor();
      await page.getByRole('button',{name:'Conserver le fichier',exact:true}).click();
      const fileCopy=(await api('/api/deliverables?projectId='+PROTOTYPE_PROJECT)).deliverables.find(item=>item.kind==='file');assert(fileCopy);assert.equal(fileCopy.hash,saved.hash);
      await page.locator('.entry').filter({hasText:'Copie de fichier'}).getByRole('button',{name:'Ouvrir la copie',exact:true}).click();await page.getByRole('textbox',{name:'Titre du livrable',exact:true}).fill('Version figée notes');await page.getByRole('button',{name:'Renommer la copie',exact:true}).click();await until(async()=>(await api('/api/deliverable?'+new URLSearchParams({projectId:PROTOTYPE_PROJECT,id:fileCopy.id}))).title==='Version figée notes','copy rename was not observed');
      page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Retirer la copie',exact:true}).click();await until(async()=>(await api('/api/deliverables?projectId='+PROTOTYPE_PROJECT)).deliverables.length===1,'copy removal was not observed');assert.equal(await fs.readFile(path.join(f.files,'notes.md'),'utf8'),saved.text,'removing a saved copy must retain the project file');
      await workspaceNav.getByRole('button',{name:'Actions et versions',exact:true}).click();
      await api('/api/file/save',{projectId:PROTOTYPE_PROJECT,rootId:'project',path:'notes.md',hash:saved.hash,text:'Version concurrente protégée\n'});
      await page.getByRole('button',{name:'Rétablir la version précédente',exact:true}).click();await page.getByRole('alert').filter({hasText:/changé|version/i}).waitFor();assert.equal(await fs.readFile(path.join(f.files,'notes.md'),'utf8'),'Version concurrente protégée\n');
      const concurrent=await api('/api/file?'+new URLSearchParams({projectId:PROTOTYPE_PROJECT,rootId:'project',path:'notes.md'}));await api('/api/file/save',{projectId:PROTOTYPE_PROJECT,rootId:'project',path:'notes.md',hash:concurrent.hash,text:saved.text});
      const restorePosts=count('/api/file/restore'),restoreDropped=await dropReply(page,'**/api/file/restore',200);await page.getByRole('button',{name:'Rétablir la version précédente',exact:true}).click();await restoreDropped();await page.getByRole('button',{name:'Vérifier l’action',exact:true}).waitFor();await page.getByRole('button',{name:'Vérifier l’action',exact:true}).click();await page.getByRole('button',{name:'Fichier rétabli',exact:true}).waitFor();assert.equal(count('/api/file/restore'),restorePosts+1,'recovery must not POST a second restore');assert.equal(await fs.readFile(path.join(f.files,'notes.md'),'utf8'),original.text);
      await workspaceNav.getByRole('button',{name:'Corbeille',exact:true}).click();await page.getByRole('button',{name:'Restaurer le fichier',exact:true}).click();await until(async()=>await fs.readFile(path.join(f.files,'removed.txt'),'utf8').catch(()=>null),'trash restoration not observed');assert.equal(await fs.readFile(path.join(f.files,'removed.txt'),'utf8'),trashBytes.toString());
      const collision=await context.request.post(f.url+'/api/files/trash/restore',{data:{projectId:PROTOTYPE_PROJECT,backupId:trashId}});assert.equal(collision.status(),409,'trash restore must refuse an occupied destination');
      if(width===1280){
        await sidebar(page);await page.getByRole('button',{name:'Nouveau chat',exact:true}).click();await closeSidebar(page,width);
        await openTools(page);await page.getByRole('checkbox',{name:'Scripts avec approbation',exact:true}).check();await page.getByRole('textbox',{name:'Message',exact:true}).fill('SCRIPT_DENY');await page.getByRole('button',{name:'Envoyer',exact:true}).click();const script=page.getByRole('region',{name:'Validation du script',exact:true}).last();await script.getByText(scriptCode,{exact:true}).waitFor();await script.getByRole('button',{name:'Refuser',exact:true}).click();await script.getByText('Refusé',{exact:true}).first().waitFor();assert.equal(await fs.access(path.join(f.files,'approved-once.txt')).then(()=>true,()=>false),false);
        await until(async()=>!(await api('/api/runtime-status')).work.requests,'denied script request did not settle');await page.getByRole('textbox',{name:'Message',exact:true}).fill('SCRIPT_APPROVE');await page.getByRole('button',{name:'Envoyer',exact:true}).click();const second=page.getByRole('region',{name:'Validation du script',exact:true}).last();await second.getByRole('button',{name:'Exécuter ce code',exact:true}).waitFor();
        const beforeDecision=count('/api/tool-approval'),decisionDropped=await dropReply(page,'**/api/tool-approval',200);await second.getByRole('button',{name:'Exécuter ce code',exact:true}).click();await decisionDropped();await until(async()=>await fs.readFile(path.join(f.files,'approved-once.txt'),'utf8').catch(()=>null),'approved fixture script did not execute');await second.getByRole('button',{name:'Vérifier la décision',exact:true}).click();assert.equal(count('/api/tool-approval'),beforeDecision+1);await page.reload();assert.equal(await fs.readFile(path.join(f.files,'approved-once.txt'),'utf8'),'one execution\n');assert.equal(count('/api/tool-approval'),beforeDecision+1);
        await until(async()=>!(await api('/api/runtime-status')).work.requests,'approved script request did not settle');await sidebar(page);await page.getByRole('button',{name:'Nouveau chat',exact:true}).click();await openTools(page);await page.getByRole('checkbox',{name:'Recherche web',exact:true}).check();await page.getByRole('checkbox',{name:'Accord pour chaque appel web',exact:true}).check();await page.getByRole('textbox',{name:'Message',exact:true}).fill('WEB_APPROVE');await page.getByRole('button',{name:'Envoyer',exact:true}).click();const web=page.getByRole('region',{name:'Validation de la requête Internet',exact:true});await web.getByText(/example\.org/).first().waitFor();assert.equal(f.stats.webCalls,0);await web.getByRole('button',{name:'Autoriser cette requête',exact:true}).click();await until(()=>f.stats.webCalls===1,'synthetic approved web call missing');
      }
      await sidebar(page);await page.locator('.chat-list').getByRole('button',{name:fork.name,exact:true}).click();await closeSidebar(page,width);await page.getByLabel('Actions de la conversation',{exact:true}).click();await page.getByRole('button',{name:'Déplacer vers un projet',exact:true}).click();await page.getByRole('combobox',{name:'Projet de destination',exact:true}).selectOption('prototype-other');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await until(async()=>(await api('/api/sessions?projectId=prototype-other')).sessions.some(item=>item.id===fork.id),'conversation move was not observed');
      await page.getByLabel('Actions de la conversation',{exact:true}).click();await page.getByRole('button',{name:'Supprimer la conversation',exact:true}).click();await page.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();await until(async()=>!(await api('/api/sessions?projectId=prototype-other')).sessions.some(item=>item.id===fork.id),'conversation deletion was not observed');assert.equal(await fs.readFile(path.join(f.files,'notes.md'),'utf8'),original.text,'deleting a conversation must retain project files');
      await sidebar(page);await page.locator('.project-list').getByRole('button',{name:'Atelier de démonstration',exact:true}).click();await closeSidebar(page,width);await topTab(page,'Activité');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'advanced layout overflow '+width);await shot(page,width+'-advanced-workspace.png');
      const ping=await api('/api/ping');await page.evaluate(instance=>localStorage.setItem('bionic:llama-preferences:'+instance,JSON.stringify({theme:'system',language:'en',draftHours:24})),ping.instanceId);await page.reload();await page.getByRole('navigation',{name:'Project workspace',exact:true}).getByRole('button',{name:'Activity',exact:true}).click();await page.getByRole('navigation',{name:'Workspace sections',exact:true}).getByRole('button',{name:'Saved outputs',exact:true}).click();await page.getByRole('button',{name:'Open copy',exact:true}).waitFor();assert.deepEqual(errors,[],'uncaught advanced browser errors');
      results.push({width,rename:true,move:true,deleteRetainsFiles:true,forkLostResponseRecovered:true,forkPostCount:count('/api/conversation/fork'),historicalActionsPassive:true,immutableResponseCopy:true,fileCopyRenameRemove:true,hashConflictRefused:true,fileRestoreLostResponseRecovered:true,trashRestore:true,trashCollisionRefused:true,scriptDenyAndApprove:width===1280,webApproval:width===1280,localeSwitch:true,pageErrors:errors.length});
    }catch(error){await shot(page,width+'-advanced-failure.png').catch(()=>{});console.error(JSON.stringify({width,pageErrors:errors,posts:posts.map(item=>item.path)}));throw error;}
    finally{await context.close();await f.app.close();const resolved=path.resolve(f.root);assert(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('llama-advanced-fixture-'));await fs.rm(resolved,{recursive:true,force:true});}
  }
  console.log(JSON.stringify({mode:'real-browser-real-companion-synthetic-model-and-web',results,limitations:['No active installation, model, GPU or real web service contacted.','Desktop/mobile are browser viewports, not a physical phone.','The approved constant Node script runs only in the owned temporary project.']},null,2));
}finally{await browser.close();}
