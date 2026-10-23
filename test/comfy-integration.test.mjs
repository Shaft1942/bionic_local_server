import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
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
  const events=(await response.text()).trim().split('\n').map(JSON.parse);assert(events.some(e=>e.type==='done'),JSON.stringify(events));assert.equal(submissions,1);assert.equal(rounds,1);
  assert.match(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),/L’image apparaîtra automatiquement ici/);
  const start=events.find(e=>e.type==='start'),params=new URLSearchParams({projectId:'p1',chatId:start.id,messageId:start.replyId,jobId:job.id});
  const chat=await (await request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:start.id}),{headers:{cookie}})).json();
  assert.equal(chat.messages.at(-1).imageGenerations[0].id,job.id);
  assert.equal(chat.messages.at(-1).completionSource,'image-status');
  const progress=await (await request('/api/comfy/generation?'+params,{headers:{cookie}})).json();assert.equal(progress.status,'queued');
  params.set('messageId','other-message');assert.equal((await request('/api/comfy/image?'+params,{headers:{cookie}})).status,404);
  params.set('messageId',start.replyId);assert.equal((await request('/api/comfy/image?'+params)).status,401);
  const image=await request('/api/comfy/image?'+params,{headers:{cookie}});assert.equal(image.headers.get('content-type'),'image/png');assert.equal(await image.text(),'synthetic-bytes');
});

async function imageTurnFixture(t,{status='queued',mixed=false,validationError=false,holdSubmission=false,tool='generate_comfy_image',preface=''}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'comfy-turn-test-'));
  const state={rounds:0,submissions:0,job:null,followupStatuses:[]};
  const model={id:'synthetic',name:'Synthetic model',type:'llm',tools:true,contextLength:16000,reasoning:{allowedOptions:[]}};
  const comfyService={
    async submit(args,owner){
      state.submissions++;
      if(validationError)throw Object.assign(new Error('Synthetic validation refusal'),{status:400});
      if(holdSubmission)await new Promise(resolve=>{state.releaseSubmission=resolve;});
      state.job={id:randomUUID(),status,promptId:'synthetic-prompt',prompt:args.prompt,seed:42,width:1024,height:1024,format:'square',owner};
      return {...state.job,owner:undefined};
    },
    get(){return {...state.job,owner:undefined};},owner(){return state.job.owner;},async close(){},
  };
  const fetchImpl=async url=>{
    assert(String(url).endsWith('/v1/chat/completions'));
    const round=state.rounds++;
    if(round)state.followupStatuses.push(state.job?.status??'no-job');
    const calls=[{index:0,id:'call-image',type:'function',function:{name:tool,arguments:'{"prompt":"A blue ceramic teapot","seed":42}'}}];
    if(mixed)calls.push({index:1,id:'call-search',type:'function',function:{name:'search_web',arguments:'{"query":"synthetic query"}'}});
    const choices=round===0?[{delta:{content:preface,tool_calls:calls},finish_reason:'tool_calls'}]:[{delta:{content:'Synthèse finale synthétique.'},finish_reason:'stop'}];
    return new Response('data: '+JSON.stringify({choices})+'\n\ndata: [DONE]\n\n');
  };
  const app=await createCompanion({root,nativeStore:{listProjects:async()=>[{id:'p1',name:'Synthetic',sessionsCount:0}],listSessions:async()=>[]},comfyService,modelService:{list:async()=>[model]},fetchImpl,webService:{search:async query=>({query,results:[]})},settings:{port:8769,apiUrl:'http://127.0.0.1:1235',bionicRoot:root,registryPath:path.join(root,'registry.json'),extraRoots:[],python:'python',resourcePolicy:'independent'}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  t.after(async()=>{state.releaseSubmission?.();await app.close();assert(path.basename(root).startsWith('comfy-turn-test-'));await fs.rm(root,{recursive:true,force:true});});
  const code=/Code d’accès : (.+)/.exec(await fs.readFile(path.join(root,'ACCES-PRIVE.txt'),'utf8'))[1].trim();
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
  const cookie=login.headers.get('set-cookie').split(';')[0],requestId=randomUUID();
  const request=(route,body)=>fetch(base+route,{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {state,requestId,request,app,async send(){const response=await request('/api/chat',{projectId:'p1',model:model.id,requestId,text:'Génère une théière bleue.',imageAccess:true,fileProfile:'none',webAccess:mixed});return (await response.text()).trim().split('\n').map(JSON.parse);}};
}

for(const [status,pattern]of [['waiting-resource',/attend une ressource/],['queued',/apparaîtra automatiquement/],['running',/apparaîtra automatiquement/],['submitting',/en cours d’envoi/],['succeeded',/disponible/],['failed',/a échoué/],['unknown',/incertain/],['stopped',/arrêtée avant sa soumission/]]) {
  test(`image-only ${status} ends without another inference or submission`,async t=>{
    const f=await imageTurnFixture(t,{status,preface:'Je prépare ton image.'});
    const events=await f.send(),text=events.filter(event=>event.type==='delta').map(event=>event.text).join('');
    assert(events.some(event=>event.type==='done'));assert(!events.some(event=>event.type==='error'));
    assert.equal(f.state.rounds,1);assert.equal(f.state.submissions,1);assert.match(text,pattern);assert(text.startsWith('Je prépare ton image.\n\n'));
    if(status==='queued'||status==='running'||status==='submitting')assert(!text.includes('est disponible'));
  });
}

test('image validation refusal without a job keeps the model error explanation',async t=>{
  const f=await imageTurnFixture(t,{validationError:true});const events=await f.send();
  assert(events.some(event=>event.type==='done'));assert.equal(f.state.rounds,2);assert.equal(f.state.submissions,1);assert.deepEqual(f.state.followupStatuses,['no-job']);
  assert.match(events.filter(event=>event.type==='delta').map(event=>event.text).join(''),/Synthèse finale/);
});

async function until(condition){const deadline=Date.now()+3000;while(!condition()){assert(Date.now()<deadline,'fixture did not reach expected state');await wait(10);}}
test('mixed tools defer their model summary until the image is terminal',async t=>{
  const f=await imageTurnFixture(t,{mixed:true}),pending=f.send();
  await until(()=>f.state.job);await wait(350);assert.equal(f.state.rounds,1);
  f.state.job.status='succeeded';const events=await pending;
  assert(events.some(event=>event.type==='done'));assert.equal(f.state.rounds,2);assert.deepEqual(f.state.followupStatuses,['succeeded']);assert.equal(f.state.submissions,1);
});
test('mixed tools keep waiting-resource active even in the independent resource profile',async t=>{
  const f=await imageTurnFixture(t,{mixed:true,status:'waiting-resource'}),pending=f.send();
  await until(()=>f.state.job);await wait(350);assert.equal(f.state.rounds,1);
  assert.deepEqual(f.app.coordinator.status().active,{text:0,image:0},'The mixed-batch wait must not own a text reservation.');
  f.state.job.status='running';await wait(300);assert.equal(f.state.rounds,1);
  f.state.job.status='succeeded';const events=await pending;assert(events.some(event=>event.type==='done'));assert.equal(f.state.rounds,2);assert.deepEqual(f.state.followupStatuses,['succeeded']);
});
test('an uncertain image in a mixed batch never resumes inference',async t=>{
  const f=await imageTurnFixture(t,{mixed:true}),pending=f.send();
  await until(()=>f.state.job);f.state.job.status='unknown';const events=await pending;
  assert(events.some(event=>event.type==='done'));assert.equal(f.state.rounds,1);assert.equal(f.state.submissions,1);
  assert.match(events.filter(event=>event.type==='delta').map(event=>event.text).join(''),/incertain/);
});
test('Stop interrupts the mixed-batch wait without cancelling ComfyUI or starting inference',async t=>{
  const f=await imageTurnFixture(t,{mixed:true}),pending=f.send();
  await until(()=>f.state.job);await wait(100);
  assert.equal((await f.request('/api/cancel',{projectId:'p1',requestId:f.requestId})).status,200);
  const events=await pending;assert(events.some(event=>event.type==='error'));assert.equal(f.state.rounds,1);assert.equal(f.state.job.status,'queued');
});
test('Stop during image submission preserves its job without reporting a completed turn',async t=>{
  const f=await imageTurnFixture(t,{holdSubmission:true}),pending=f.send();
  await until(()=>f.state.releaseSubmission);
  await f.request('/api/cancel',{projectId:'p1',requestId:f.requestId});f.state.releaseSubmission();
  const events=await pending;assert(events.some(event=>event.type==='error'));assert(!events.some(event=>event.type==='done'));assert.equal(f.state.rounds,1);assert.equal(f.state.job.status,'queued');
});
