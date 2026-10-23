import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createComfyImages } from '../lib/comfy-images.mjs';
import { createComfySettings } from '../lib/comfy-settings.mjs';

const owner={projectId:'p',chatId:'chat',messageId:'reply',requestId:'request'};
const schema = {
  UNETLoader:{input:{required:{unet_name:[['krea2_turbo_fp8_scaled.safetensors']],weight_dtype:[['default']]}},output:['MODEL']},
  CLIPLoader:{input:{required:{clip_name:[['qwen3vl_4b_fp8_scaled.safetensors']],type:[['krea2']],device:[['default']]}},output:['CLIP']},
  VAELoader:{input:{required:{vae_name:[['qwen_image_vae.safetensors']]}},output:['VAE']},
  CheckpointLoaderSimple:{input:{required:{ckpt_name:[['hassakuXLIllustrious_v34.safetensors']]}},output:['MODEL','CLIP','VAE']},
  CLIPTextEncode:{input:{required:{text:['STRING'],clip:['CLIP']}},output:['CONDITIONING']},
  ConditioningZeroOut:{input:{required:{conditioning:['CONDITIONING']}},output:['CONDITIONING']},
  EmptyLatentImage:{input:{required:{width:['INT'],height:['INT'],batch_size:['INT']}},output:['LATENT']},
  KSampler:{input:{required:{model:['MODEL'],positive:['CONDITIONING'],negative:['CONDITIONING'],latent_image:['LATENT'],seed:['INT'],steps:['INT'],cfg:['FLOAT'],sampler_name:[['euler','euler_ancestral']],scheduler:[['simple','normal']],denoise:['FLOAT']}},output:['LATENT']},
  VAEDecode:{input:{required:{samples:['LATENT'],vae:['VAE']}},output:['IMAGE']},
  SaveImage:{input:{required:{images:['IMAGE'],filename_prefix:['STRING']}},output:['IMAGE']},
  FreeMemoryAfterWorkflow:{input:{required:{},optional:{trigger:['*']}},output:[],output_node:true}
};
async function fixture(t,options={}) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'comfy-settings-test-'));
  const settingsFile=path.join(directory,'settings.json');
  let service=await createComfyImages({directory,settingsFile,pollMs:100000,...options});
  t.after(async()=>{await service.close();assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('comfy-settings-test-'));await fs.rm(directory,{recursive:true,force:true});});
  return {directory,settingsFile,get service(){return service;},async restart(overrides={}){await service.close();service=await createComfyImages({directory,settingsFile,pollMs:100000,...options,...overrides});return service;}};
}
test('new installations are disabled, validated settings persist and disabled service never submits',async t=>{
  let calls=0;
  const f=await fixture(t,{fetchImpl:async()=>{calls++;throw Error('Should not contact ComfyUI');}});
  assert.equal(f.service.getSettings().enabled,false);
  await assert.rejects(f.service.submit({prompt:'A teapot'},owner),{status:409});
  assert.equal(calls,0);
  await f.service.updateSettings({enabled:true,url:'http://192.168.1.197:8188',workflowId:'hassaku_illustrious'});
  await f.restart();
  assert.equal(f.service.getSettings().enabled,true);
  assert.equal(f.service.getSettings().url,'http://192.168.1.197:8188');
  assert.equal(f.service.getSettings().workflowId,'hassaku_illustrious');
  for(const patch of [{url:'http://example.com:8188'},{url:'http://169.254.169.254'},{workflowId:'imported'},{enabled:'yes'},{workflow:{arbitrary:true}}]) await assert.rejects(f.service.updateSettings(patch),{status:400});
  assert.equal(f.service.getSettings().workflowId,'hassaku_illustrious');
});
test('concurrent settings patches serialize, preserve independent fields and recover after rejection',async t=>{
  const f=await fixture(t);
  const store=await createComfySettings({file:f.settingsFile});
  const [first,second,third]=await Promise.all([
    store.update({enabled:true}),
    store.update({url:'http://192.168.1.197:8188'}),
    store.update({workflowId:'hassaku_illustrious'})
  ]);
  assert.equal(first.enabled,true);assert.equal(second.url,'http://192.168.1.197:8188');
  assert.equal(third.enabled,true);assert.equal(third.url,second.url);assert.equal(third.workflowId,'hassaku_illustrious');
  await assert.rejects(store.update({enabled:'invalid'}),{status:400});
  await store.update({enabled:false});
  const saved=JSON.parse(await fs.readFile(f.settingsFile,'utf8'));
  assert.equal(saved.enabled,false);assert.equal(saved.url,third.url);assert.equal(saved.workflowId,third.workflowId);
  assert.deepEqual((await fs.readdir(f.directory)).filter(name=>name.endsWith('.tmp')),[]);
});
test('configuration update and submission cannot interleave across the settings write',async t=>{
  const calls=[];
  const f=await fixture(t,{enabled:true,fetchImpl:async url=>{calls.push(url);return Response.json({prompt_id:'serialized-job'});}});
  const [settings,job]=await Promise.all([
    f.service.updateSettings({url:'http://192.168.1.197:8188',workflowId:'hassaku_illustrious'}),
    f.service.submit({prompt:'An adult botanist'},owner)
  ]);
  assert.equal(settings.url,'http://192.168.1.197:8188');
  assert.equal(job.comfyUrl,settings.url);assert.equal(job.workflowId,'hassaku_illustrious');
  assert.equal(calls.length,1);assert(calls[0].startsWith(settings.url));
  await assert.rejects(f.service.updateSettings({enabled:false}),{status:409});
});
test('simultaneous submissions reserve all four slots before asynchronous persistence',async t=>{
  let posts=0;
  const f=await fixture(t,{enabled:true,fetchImpl:async()=>{posts++;return Response.json({prompt_id:'pending-'+posts});}});
  const results=await Promise.allSettled(Array.from({length:8},(_,index)=>f.service.submit({prompt:'A teapot '+index},{...owner,messageId:'reply-'+index})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,4);
  assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.status===409).length,4);
  assert.equal(posts,4);assert.equal(f.service.getSettings().activeJobs,4);
});
test('connection test reads actual HTTP endpoints, checks both exact models and never sends prompt',async t=>{
  const routes=[],info=structuredClone(schema);
  const server=http.createServer((req,res)=>{
    routes.push({url:req.url,method:req.method});
    res.setHeader('Content-Type','application/json');
    const body=req.url==='/system_stats'?{system:{comfyui_version:'synthetic-test'},devices:[{name:'synthetic GPU'}]}:req.url==='/queue'?{queue_running:[],queue_pending:[]}:req.url==='/object_info'?info:null;
    res.writeHead(body?200:404);res.end(JSON.stringify(body));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const url='http://127.0.0.1:'+server.address().port;
  const f=await fixture(t);
  await f.service.updateSettings({memoryCleanup:true});
  let result=await f.service.checkConnection({url});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.memoryCleanup.available,true);assert.equal(result.memoryCleanup.afterWorkflow,true);
  assert.equal(result.memoryCleanup.packagePath,'comfyui/custom_nodes/free_memory_after_workflow.py');
  assert.equal(result.workflows.length,2);assert(result.workflows.every(profile=>profile.compatible));
  assert.equal(f.service.getSettings().enabled,false);assert.equal(f.service.getSettings().url,'http://127.0.0.1:8188');
  assert.deepEqual(routes.map(route=>route.method),['GET','GET','GET']);
  info.SaveImage.output=[];
  result=await f.service.checkConnection({url});
  assert.equal(result.ok,false);assert(result.workflows.every(profile=>!profile.compatible));
  assert(result.workflows.every(profile=>profile.errors.some(error=>/FreeMemoryAfterWorkflow\.trigger : lien de sortie absent/.test(error))));
  info.SaveImage.output=['IMAGE'];
  info.CheckpointLoaderSimple.input.required.ckpt_name=[['another-model.safetensors']];
  result=await f.service.checkConnection({url,workflowId:'hassaku_illustrious'});
  assert.equal(result.ok,false);assert.equal(result.reachable,true);assert.match(result.workflows.find(profile=>profile.id==='hassaku_illustrious').errors.join(' '),/hassakuXLIllustrious_v34/);
  assert(result.workflows.find(profile=>profile.id==='krea2_turbo').compatible);
  info.FreeMemoryAfterWorkflow.output_node=false;
  result=await f.service.checkConnection({url,workflowId:'krea2_turbo'});
  assert.equal(result.ok,false);assert.equal(result.memoryCleanup.available,false);
  assert.match(result.workflows.find(profile=>profile.id==='krea2_turbo').errors.join(' '),/comfyui\/custom_nodes\/free_memory_after_workflow\.py/);
  delete info.FreeMemoryAfterWorkflow;
  result=await f.service.checkConnection({url,workflowId:'krea2_turbo'});
  assert.equal(result.reachable,true);assert.equal(result.memoryCleanup.available,false);
  assert.match(result.workflows.find(profile=>profile.id==='krea2_turbo').errors.join(' '),/Nœud absent : FreeMemoryAfterWorkflow/);
  assert(routes.every(route=>route.url!=='/prompt'));
});
test('Hassaku retains the saved recipe and blocks disruptive configuration until terminal history',async t=>{
  const calls=[],graphs=[];
  const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(832,16);bytes.writeUInt32BE(1216,20);
  const fetchImpl=async(url,options={})=>{
    calls.push(url);
    if(url.endsWith('/prompt')){graphs.push(JSON.parse(options.body).prompt);return Response.json({prompt_id:'hassaku-test'});}
    if(url.includes('/history/'))return Response.json({'hassaku-test':{status:{completed:true},outputs:{'19':{images:[{filename:'image.png',subfolder:'Bionic',type:'output'}]}}}});
    if(url.includes('/view?'))return new Response(bytes);
    throw Error('Unexpected route');
  };
  const f=await fixture(t,{enabled:true,workflowId:'hassaku_illustrious',fetchImpl});
  let job=await f.service.submit({prompt:'An adult botanist',negativePrompt:'blur',seed:42},owner);
  assert.equal(job.workflowId,'hassaku_illustrious');assert.equal(job.width,832);assert.equal(job.height,1216);
  assert.equal(graphs[0]['53'].inputs.ckpt_name,'hassakuXLIllustrious_v34.safetensors');
  assert.equal(graphs[0]['56'].inputs.steps,25);assert.equal(graphs[0]['56'].inputs.cfg,6);assert.equal(graphs[0]['56'].inputs.sampler_name,'euler_ancestral');assert.equal(graphs[0]['56'].inputs.scheduler,'normal');
  assert.equal(graphs[0]['7'].inputs.text,'blur');
  for(const patch of [{enabled:false},{url:'http://192.168.1.2:8188'},{workflowId:'krea2_turbo'}])await assert.rejects(f.service.updateSettings(patch),{status:409});
  job=await f.service.refresh(job.id);assert.equal(job.status,'succeeded');
  await f.service.updateSettings({enabled:false,url:'http://192.168.1.2:8188',workflowId:'krea2_turbo'});
  await f.restart();
  assert.equal(f.service.getSettings().enabled,false);assert.equal(f.service.get(job.id).workflowId,'hassaku_illustrious');
  assert.equal((await f.service.image(job.id)).bytes.length,24);
  assert.equal((await f.service.submit({prompt:'A retry'},owner)).id,job.id);
  await assert.rejects(f.service.submit({prompt:'A new request'},{...owner,messageId:'other'}),{status:409});
  assert(calls.every(url=>url.startsWith('http://127.0.0.1:8188/')));
});
test('queued jobs use their persisted endpoint after restart while settings are disabled elsewhere',async t=>{
  const calls=[];
  const f=await fixture(t,{enabled:true,fetchImpl:async(url)=>{calls.push(url);return url.endsWith('/prompt')?Response.json({prompt_id:'pending-test'}):url.includes('/history/')?Response.json({}):Response.json({queue_running:[],queue_pending:[[1,'pending-test']]});}});
  const job=await f.service.submit({prompt:'A teapot'},owner);
  await fs.writeFile(f.settingsFile,JSON.stringify({version:1,enabled:false,url:'http://192.168.1.2:8188',workflowId:'hassaku_illustrious'}));
  await f.restart();await f.service.refresh(job.id);
  assert.equal(f.service.get(job.id).status,'queued');
  assert.equal(f.service.getSettings().enabled,false);
  assert(calls.every(url=>url.startsWith('http://127.0.0.1:8188/')));
  const persisted=JSON.parse(await fs.readFile(path.join(f.directory,job.id+'.json'),'utf8'));
  assert.equal(persisted.comfyUrl,'http://127.0.0.1:8188');assert.equal(persisted.outputNodeId,'9');assert.equal(persisted.workflowId,'krea2_turbo');
});

// All new setup scenarios use an injected transport, never an active instance.
function setupTransport(info, calls) {
  return async (url, options={}) => {
    const route=new URL(url).pathname;calls.push({url,route,options});
    if(route==='/system_stats')return Response.json({system:{comfyui_version:'synthetic'}});
    if(route==='/object_info')return Response.json(info);
    if(route==='/queue')return Response.json({queue_running:[],queue_pending:[]});
    if(route==='/prompt')return Response.json({prompt_id:'setup-prompt'});
    if(route.startsWith('/history/'))return Response.json({'setup-prompt':{status:{status_str:'error',messages:[['execution_interrupted',{}]]}}});
    throw Error('Unexpected route '+route);
  };
}

test('fresh settings skip cleanup; missing module and standard SaveImage never block either workflow',async t=>{
  const info=structuredClone(schema),calls=[];delete info.FreeMemoryAfterWorkflow;info.SaveImage.output=[];
  const f=await fixture(t,{enabled:true,fetchImpl:setupTransport(info,calls)});
  assert.equal(f.service.getSettings().memoryCleanup,false);
  for(const workflowId of ['krea2_turbo','hassaku_illustrious']){
    const checked=await f.service.checkConnection({workflowId});
    assert.equal(checked.ok,true);assert.equal(checked.memoryCleanup.available,false);
    assert(checked.workflows.every(w=>w.compatible));
    const job=await f.service.submit({prompt:'Synthetic image',workflowId},{...owner,messageId:workflowId});
    assert.equal(job.memoryCleanup,false);
    const post=calls.filter(c=>c.route==='/prompt').at(-1);
    assert.equal(JSON.parse(post.options.body).prompt['99'],undefined);
    await f.service.refresh(job.id);
  }
  await f.restart();assert.equal(f.service.getSettings().memoryCleanup,false);
  assert(!calls.some(c=>c.route==='/free'||c.route==='/interrupt'));
});

test('cleanup is pinned with the selection; enabled mode retains the node and explains missing support',async t=>{
  const info=structuredClone(schema),calls=[];delete info.FreeMemoryAfterWorkflow;
  const f=await fixture(t,{enabled:true,fetchImpl:setupTransport(info,calls)});
  const selection=f.service.resolveSelection();assert.equal(selection.memoryCleanup,false);
  await f.service.updateSettings({memoryCleanup:true});
  const checked=await f.service.checkConnection();assert.equal(checked.ok,false);
  assert.match(checked.workflows[0].errors.join(' '),/FreeMemoryAfterWorkflow/);
  const job=await f.service.submit({prompt:'Pinned without cleanup'},owner,undefined,selection);
  assert.equal(job.memoryCleanup,false);assert(!JSON.parse(calls.find(c=>c.route==='/prompt').options.body).prompt['99']);
  await f.service.refresh(job.id);
  const next=await f.service.submit({prompt:'With cleanup'},{...owner,messageId:'other'});
  assert.equal(next.memoryCleanup,true);
  assert.equal(JSON.parse(calls.filter(c=>c.route==='/prompt').at(-1).options.body).prompt['99'].class_type,'FreeMemoryAfterWorkflow');
  await assert.rejects(f.service.updateSettings({memoryCleanup:false}),{status:409});
});

test('diagnostic lists missing model files and their folders even if a loader is absent',async t=>{
  const info=structuredClone(schema),calls=[];delete info.CLIPLoader;
  info.VAELoader.input.required.vae_name=[[]];
  const f=await fixture(t,{fetchImpl:setupTransport(info,calls)});
  const checked=await f.service.checkConnection();assert.equal(checked.reachable,true);assert.equal(checked.ok,false);
  const models=checked.workflows[0].models;
  assert(models.some(m=>!m.available&&m.name==='qwen3vl_4b_fp8_scaled.safetensors'&&m.folder==='models/text_encoders'));
  assert(models.some(m=>!m.available&&m.name==='qwen_image_vae.safetensors'&&m.folder==='models/vae'));
  assert(calls.every(c=>!c.options.method));
});

test('v1 and v2 settings preserve previous cleanup, v3 explicitly disabled survives restart',async t=>{
  const f=await fixture(t);
  for(const version of [1,2]){
    await fs.writeFile(f.settingsFile,JSON.stringify({version,enabled:true,url:'http://127.0.0.1:8188',workflowId:'krea2_turbo'}));
    await f.restart();assert.equal(f.service.getSettings().memoryCleanup,true);
    await f.service.updateSettings({memoryCleanup:false});
    assert.equal(JSON.parse(await fs.readFile(f.settingsFile)).version,3);
    await f.restart();assert.equal(f.service.getSettings().memoryCleanup,false);
  }
  for(const memoryCleanup of ['false',1,null])await assert.rejects(f.service.updateSettings({memoryCleanup}),{status:400});
});

test('server discovery probes only the submitted private address and two local ports; never mutates',async t=>{
  const calls=[];
  const f=await fixture(t,{fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.startsWith('http://127.0.0.1:8188'))throw Error('Offline');
    return Response.json({system:{comfyui_version:'synthetic'}});
  }});
  const before=f.service.getSettings();
  const result=await f.service.discoverServers({url:'http://192.168.10.5:9000'});
  assert.deepEqual(result.servers.map(s=>s.url),['http://192.168.10.5:9000','http://127.0.0.1:8000']);
  assert.equal(calls.length,3);assert(calls.every(c=>new URL(c.url).pathname==='/system_stats'&&!c.options.method));
  assert.deepEqual(f.service.getSettings(),before);
  for(const url of ['http://example.com','http://169.254.169.254','http://127.0.0.1:8000/private'])await assert.rejects(f.service.discoverServers({url}),{status:400});
  assert.equal(calls.length,3);
  const none=await fixture(t,{fetchImpl:async()=>Response.json({system:{os:'unrelated service'}})});
  assert.deepEqual((await none.service.discoverServers()).servers,[]);
});
