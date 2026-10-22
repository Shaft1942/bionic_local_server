import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createCompanion} from '../server.mjs';

test('chat tool call, saved image pointer and authenticated image routes integrate',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'comfy-chat-test-'));let submissions=0,job;
  const comfyService={async submit(args,owner){submissions++;job={id:randomUUID(),status:'queued',promptId:'test-prompt',prompt:args.prompt,seed:42,width:1024,height:1024,format:'square',owner};return {...job,owner:undefined};},get(id){assert.equal(id,job.id);return {...job,owner:undefined};},owner(){return job.owner;},async image(){return {bytes:Buffer.from('synthetic-bytes'),mime:'image/png'};},async close(){}};
  const nativeStore={listProjects:async()=>[{id:'p1',name:'Synthetic',sessionsCount:0}],listSessions:async()=>[]};
  const model={id:'synthetic',name:'Synthetic model',type:'llm',tools:true,contextLength:16000,reasoning:{allowedOptions:[]}};
  let rounds=0;
  const fetchImpl=async(url,options)=>{
    assert(String(url).endsWith('/v1/chat/completions'));
    const request=JSON.parse(options.body);assert(request.tools.some(tool=>tool.function.name==='generate_krea2_image'));
    assert.match(request.messages[0].content,/UNIQUEMENT/);
    const choices=rounds++===0?[{delta:{tool_calls:[{index:0,id:'call-image',type:'function',function:{name:'generate_krea2_image',arguments:'{"prompt":"A blue ceramic teapot","seed":42}'}}]},finish_reason:'tool_calls'}]:[{delta:{content:'La génération est lancée.'},finish_reason:'stop'}];
    return new Response('data: '+JSON.stringify({choices})+'\n\ndata: [DONE]\n\n');
  };
  const app=await createCompanion({root,nativeStore,comfyService,modelService:{list:async()=>[model]},fetchImpl,settings:{port:8769,apiUrl:'http://127.0.0.1:1235',bionicRoot:root,registryPath:path.join(root,'registry.json'),extraRoots:[],python:'python'}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
  t.after(async()=>{await app.close();assert(path.basename(root).startsWith('comfy-chat-test-'));await fs.rm(root,{recursive:true,force:true});});
  const request=(route,options={})=>fetch(base+route,options);
  assert.equal((await request('/api/comfy/generation?jobId=unknown')).status,401);
  const access=await fs.readFile(path.join(root,'ACCES-PRIVE.txt'),'utf8');const code=/Code d’accès : (.+)/.exec(access)[1].trim();
  const login=await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});const cookie=login.headers.get('set-cookie').split(';')[0];
  const response=await request('/api/chat',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({projectId:'p1',model:model.id,requestId:randomUUID(),text:'Génère une image de théière bleue.',imageAccess:true,fileProfile:'none'})});
  const events=(await response.text()).trim().split('\n').map(JSON.parse);assert(events.some(e=>e.type==='done'),JSON.stringify(events));assert.equal(submissions,1);assert.equal(rounds,2);
  const start=events.find(e=>e.type==='start'),params=new URLSearchParams({projectId:'p1',chatId:start.id,messageId:start.replyId,jobId:job.id});
  const chat=await (await request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:start.id}),{headers:{cookie}})).json();
  assert.equal(chat.messages.at(-1).imageGenerations[0].id,job.id);
  const progress=await (await request('/api/comfy/generation?'+params,{headers:{cookie}})).json();assert.equal(progress.status,'queued');
  params.set('messageId','other-message');assert.equal((await request('/api/comfy/image?'+params,{headers:{cookie}})).status,404);
  params.set('messageId',start.replyId);assert.equal((await request('/api/comfy/image?'+params)).status,401);
  const image=await request('/api/comfy/image?'+params,{headers:{cookie}});assert.equal(image.headers.get('content-type'),'image/png');assert.equal(await image.text(),'synthetic-bytes');
});
