// Explicit development probe against an already running local model and ComfyUI.
// Opt in with --generate; runs in an isolated companion, never native histories.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createCompanion} from '../server.mjs';
import {createModelService} from '../lib/model-service.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.join(repo,'work','live-v2-'+Date.now());
await fs.mkdir(root,{recursive:true});
const upstream=[];const modelService=createModelService({baseUrl:'http://127.0.0.1:1235'}),models=await modelService.list(),model=models.find(m=>m.type==='llm'&&m.loaded);
if(!model)throw Error('Charge un modèle dans Bionic avant ce test.');
const app=await createCompanion({root,modelService,nativeStore:{listProjects:async()=>[{id:'v2-check',name:'Validation isolée V2',sessionsCount:0}],listSessions:async()=>[]},settings:{port:8769,apiUrl:'http://127.0.0.1:1235',bionicRoot:root,registryPath:path.join(root,'registry.json'),extraRoots:[],python:'python',comfyEnabled:true,comfyUrl:'http://127.0.0.1:8188',comfyWorkflowId:'krea2_turbo'},fetchImpl:async(url,options)=>{
  if(String(url).endsWith('/v1/chat/completions')){const body=JSON.parse(options.body);upstream.push({maxTokens:body.max_tokens,messageCount:body.messages.length,tools:(body.tools||[]).map(t=>t.function.name)});}
  return fetch(url,options);
}});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
const proof={date:new Date().toISOString(),model:model.id,contextLength:model.contextLength,isolated:true,upstream};
const output=path.join(root,'proof.json');let cookie='';
async function request(route,input){const r=await fetch(base+route,{method:input?'POST':'GET',headers:{cookie,'Content-Type':'application/json'},...(input?{body:JSON.stringify(input)}:{})});if(!r.ok)throw Error(route+' HTTP '+r.status+' '+await r.text());return r;}
async function send(text,extra={}){const r=await request('/api/chat',{requestId:randomUUID(),projectId:'v2-check',model:model.id,text,fileProfile:'none',reasoning:'off',...extra});const events=(await r.text()).trim().split('\n').map(JSON.parse);const error=events.find(e=>e.type==='error');if(error)throw Error(error.message);return events;}
try{
  const code=/Code d’accès : (.+)/.exec(await fs.readFile(path.join(root,'ACCES-PRIVE.txt'),'utf8'))[1].trim();
  const login=await request('/api/login',{code});cookie=login.headers.get('set-cookie').split(';')[0];
  const check=await (await request('/api/comfy/check',{url:'http://127.0.0.1:8188',workflowId:'krea2_turbo'})).json();assert(check.ok);proof.comfyCheck={ok:check.ok,url:check.url,workflows:check.workflows};
  const first=await send('Réponds exactement : V2 prête.');assert.equal(upstream[0].maxTokens,8192);const start=first.find(e=>e.type==='start');proof.auto={maxTokens:upstream[0].maxTokens,done:first.find(e=>e.type==='done'),text:first.filter(e=>e.type==='delta').map(e=>e.text).join('')};
  const second=await send('Réponds exactement : préférence locale vérifiée.',{sessionId:start.id,outputPreferences:{maxOutputTokens:512,applyToAllSessions:false}});assert.equal(upstream.at(-1).maxTokens,512);proof.manual={maxTokens:512,text:second.filter(e=>e.type==='delta').map(e=>e.text).join('')};
  if(process.argv.includes('--generate')){
    console.log('Génération réelle demandée via le modèle déjà chargé.');
    const events=await send('Génère une seule image avec ComfyUI : une tasse en céramique verte sur une table de bois clair, éclairée par une fenêtre. Format carré, seed 43. Lance le rendu puis indique simplement qu’il est soumis.',{imageAccess:true});
    const action=events.filter(e=>e.type==='action').map(e=>e.action).find(a=>a.imageGeneration);assert(action,'Le modèle doit appeler l’outil image.');assert(action.ok,action.message);const imageStart=events.find(e=>e.type==='start'),job=action.imageGeneration;
    proof.image={jobId:job.id,promptId:job.promptId,tool:action.name,status:job.status};await fs.writeFile(output,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof.image));
    const params=new URLSearchParams({projectId:'v2-check',chatId:imageStart.id,messageId:imageStart.replyId,jobId:job.id});const deadline=Date.now()+600000;let last='';
    while(Date.now()<deadline){const latest=await (await request('/api/comfy/generation?'+params)).json();proof.image={...proof.image,...latest};if(latest.status!==last){console.log('ComfyUI : '+latest.status);last=latest.status;}
      if(latest.status==='succeeded'){const bytes=Buffer.from(await(await request('/api/comfy/image?'+params)).arrayBuffer());assert(bytes.length>24);const file=path.join(root,'v2-image.png');await fs.writeFile(file,bytes);proof.image.file=file;break;}
      if(['failed','unknown'].includes(latest.status))throw Error(latest.error||latest.status);await new Promise(resolve=>setTimeout(resolve,2000));
    }
    assert.equal(proof.image.status,'succeeded','Rendu non terminé : ne pas soumettre à nouveau.');
  }
  proof.success=true;await fs.writeFile(output,JSON.stringify(proof,null,2));console.log(JSON.stringify({success:true,proof:output,image:proof.image?.file,requests:upstream.length}));
}catch(error){proof.error=error.message;await fs.writeFile(output,JSON.stringify(proof,null,2));throw error;}
finally{await app.close();}
