import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createComfyImages, localComfyURL } from '../lib/comfy-images.mjs';
import { toolsFor, createAgentTools } from '../lib/agent-tools.mjs';

const owner={projectId:'p1',chatId:'web-test',messageId:'reply',requestId:'request-test'};
async function fixture(t,mode='success'){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'comfy-images-test-'));
  let posts=0,graphs=[];
  const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(1024,16);bytes.writeUInt32BE(1024,20);
  const fetchImpl=async(url,options={})=>{
    assert(url.startsWith('http://127.0.0.1:8188/'));assert.equal(options.redirect,'error');
    if(url.endsWith('/prompt')){posts++;graphs.push(JSON.parse(options.body));if(mode==='ambiguous')throw Error('Network dropped after submission');if(mode==='refused')return Response.json({error:{message:'Missing model'}},{status:400});return Response.json({prompt_id:'synthetic-prompt'});}
    if(url.includes('/history/'))return Response.json({'synthetic-prompt':mode==='failed'?{status:{status_str:'error',completed:false,messages:[['execution_error',{exception_message:'Synthetic GPU failure'}]]}}:{status:{status_str:'success',completed:true},outputs:{'9':{images:[{filename:'synthetic.png',subfolder:'Bionic',type:'output'}]}}}});
    if(url.includes('/view?'))return new Response(mode==='bad-image'?Buffer.from('not a PNG'):bytes);
    throw Error('Unexpected route '+url);
  };
  const settingsFile=path.join(directory,'settings.json');
  let service=await createComfyImages({directory,settingsFile,enabled:true,fetchImpl,pollMs:100000});
  t.after(async()=>{await service.close();assert(path.basename(directory).startsWith('comfy-images-test-'));await fs.rm(directory,{recursive:true,force:true});});
  return {directory,fetchImpl,get service(){return service;},get posts(){return posts;},graphs,async restart(){await service.close();service=await createComfyImages({directory,settingsFile,enabled:true,fetchImpl,pollMs:100000});return service;}};
}
test('ComfyURL stays local or private and independent image permission is required',async()=>{
  assert.equal(localComfyURL(),'http://127.0.0.1:8188');
  for(const url of ['http://192.168.1.197:8188','http://10.1.2.3:8188','http://172.16.0.1:8188','http://[::1]:8188'])assert.equal(localComfyURL(url),url);
  for(const url of ['http://example.org','http://8.8.8.8:8188','http://172.32.0.1:8188','http://169.254.169.254','https://127.0.0.1:8188','http://user:password@localhost:8188','http://localhost:8188/path','http://localhost:8188/?q=x'])assert.throws(()=>localComfyURL(url));
  assert.equal(toolsFor({}).length,0);assert.equal(toolsFor({imageAccess:true})[0].function.name,'generate_krea2_image');
  let submitted=0;
  const locked=createAgentTools({fileAccess:false,comfyService:{submit:async()=>{submitted++;}}});
  const result=await locked.execute({function:{name:'generate_krea2_image',arguments:'{"prompt":"test"}'}});
  assert.equal(result.action.ok,false);assert.equal(submitted,0);
});
test('one turn submits once, survives restart, and stores image bytes only after terminal success',async t=>{
  const f=await fixture(t);
  const jobs=await Promise.all([f.service.submit({prompt:'A blue teapot',seed:42},owner),f.service.submit({prompt:'A blue teapot',seed:42},owner)]);
  assert.equal(f.posts,1);assert.equal(jobs[0].id,jobs[1].id);assert.equal(jobs[0].status,'queued');
  const graph=f.graphs[0].prompt;assert.equal(graph['6'].inputs.text,'A blue teapot');assert.equal(graph['3'].inputs.seed,42);assert.equal(graph['11'].inputs.type,'krea2');assert.equal(graph['5'].inputs.batch_size,1);
  await assert.rejects(f.service.image(jobs[0].id),{status:404});
  await f.restart();const again=await f.service.submit({prompt:'A different prompt'},owner);assert.equal(again.id,jobs[0].id);assert.equal(f.posts,1);
  const complete=await f.service.refresh(again.id);assert.equal(complete.status,'succeeded');assert.equal(complete.image.width,1024);assert.equal((await f.service.image(again.id)).bytes.length,24);
  await fs.writeFile(path.join(f.directory,again.id+'.png'),'changed');await assert.rejects(f.service.image(again.id),{status:409});
});
test('unknown submission is persisted and never retried automatically',async t=>{
  const f=await fixture(t,'ambiguous');let job=await f.service.submit({prompt:'A teapot'},owner);assert.equal(job.status,'unknown');
  await f.restart();job=await f.service.submit({prompt:'A teapot'},owner);assert.equal(job.status,'unknown');assert.equal(f.posts,1);
});
test('validation rejects excessive parameters before any GPU request',async t=>{
  const f=await fixture(t);
  for(const args of [{prompt:''},{prompt:'x',seed:-1},{prompt:'x',seed:2**32},{prompt:'x',format:'__proto__'},{prompt:'x',url:'http://example.org'},{prompt:'x'.repeat(6001)}])await assert.rejects(f.service.submit(args,owner),{status:400});
  assert.equal(f.posts,0);
});
test('server rejection and execution failure never produce success images',async t=>{
  const f=await fixture(t,'refused');const refused=await f.service.submit({prompt:'A teapot'},owner);assert.equal(refused.status,'failed');assert.match(refused.error,/Missing model/);
  const failed=await fixture(t,'failed');const job=await failed.service.submit({prompt:'A teapot'},owner);assert.equal((await failed.service.refresh(job.id)).status,'failed');await assert.rejects(failed.service.image(job.id),{status:404});
});

for(const mode of ['missing','race'])test('queue disappearance '+mode+' cannot preserve false running',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'comfy-observation-test-'));
  let phase='pending',posts=0,reads=0;
  const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(1024,16);bytes.writeUInt32BE(1024,20);
  const service=await createComfyImages({directory,settingsFile:path.join(directory,'settings.json'),enabled:true,pollMs:100000,fetchImpl:async(url)=>{
    if(url.endsWith('/prompt')){posts++;return Response.json({prompt_id:'observed'});}
    if(url.includes('/history/')){reads++;return Response.json(phase==='missing'&&mode==='race'&&reads>1?{observed:{status:{completed:true},outputs:{'9':{images:[{filename:'test.png',subfolder:'',type:'output'}]}}}}:{});}
    if(url.endsWith('/queue'))return Response.json({queue_running:phase==='running'?[[0,'observed']]:[],queue_pending:phase==='pending'?[[0,'observed']]:[]});
    if(url.includes('/view?'))return new Response(bytes);
    throw Error('Unexpected route');
  }});
  t.after(async()=>{await service.close();assert(path.basename(directory).startsWith('comfy-observation-test-'));await fs.rm(directory,{recursive:true,force:true});});
  const job=await service.submit({prompt:'A blue teapot',format:'square'},owner);
  assert.equal((await service.refresh(job.id)).status,'queued');phase='running';assert.equal((await service.refresh(job.id)).status,'running');
  phase='missing';reads=0;assert.equal((await service.refresh(job.id)).status,mode==='race'?'succeeded':'unknown');assert.equal(posts,1);
  if(mode==='missing')assert.equal(service.getSettings().queuePaused,true);
});
