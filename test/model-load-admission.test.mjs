import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, scryptSync } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { setTimeout as pause } from 'node:timers/promises';

const source=process.env.TEST_SOURCE?pathToFileURL(path.resolve(process.env.TEST_SOURCE)).href:new URL('../server.mjs',import.meta.url).href;
const {createCompanion}=await import(source);
const gate=()=>{let release;const promise=new Promise(resolve=>release=resolve);return{promise,release};};
async function until(predicate){for(let attempt=0;attempt<1000;attempt++){if(predicate())return;await pause(5);}assert.fail('Synthetic admission gate not reached');}
class Reply extends EventEmitter{
  constructor(){super();this.parts=[];this.headers={};this.statusCode=200;}
  setHeader(name,value){this.headers[name.toLowerCase()]=value;}
  writeHead(status,headers={}){this.statusCode=status;this.headersSent=true;for(const[name,value]of Object.entries(headers))this.setHeader(name,value);}
  write(value){this.parts.push(String(value));return true;}
  end(value){if(value)this.write(value);this.writableEnded=true;this.emit('finish');}
  json(){return JSON.parse(this.parts.join(''));}
}
async function fixture(t){
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'model-load-admission-'))),projects=gate(),catalogue=gate();
  await fs.mkdir(path.join(root,'data'));
  await fs.writeFile(path.join(root,'data','config.json'),JSON.stringify({instanceId:randomUUID(),salt:'synthetic-admission',passwordHash:scryptSync('synthetic-code','synthetic-admission',32).toString('hex'),adminToken:'synthetic-admission-admin'}));
  const state={holdProjects:false,projectReached:false,holdCatalogue:false,catalogueReached:false,modelReads:0,loads:0,loaded:false,images:[]};
  const images={
    getSettings:()=>({enabled:true,activeJobs:state.images.length,modelPolicy:'keep'}),lifecycleStatus:()=>({active:state.images.length,uncertain:0}),
    async submit(args,owner){const job={id:randomUUID(),status:'queued',prompt:args.prompt,owner};state.images.push(job);return{...job,owner:undefined};},
    get:id=>state.images.find(job=>job.id===id),owner:id=>state.images.find(job=>job.id===id)?.owner,findForOwner:()=>null,image:async()=>{throw Error('No image bytes in admission test');},close:async()=>{}
  };
  const fetchImpl=async(value,options={})=>{
    const url=new URL(value);assert.equal(url.origin,'http://127.0.0.1:19991');
    if(url.pathname==='/api/v1/models'){
      state.modelReads++;if(state.holdCatalogue){state.catalogueReached=true;await catalogue.promise;}
      return Response.json({models:[{key:'cold-model',type:'llm',loaded_instances:state.loaded?[{id:'loaded-cold',config:{context_length:4096}}]:[]}]});
    }
    assert.equal(url.pathname,'/api/v1/models/load');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{model:'cold-model',echo_load_config:true});
    const journal=JSON.parse(await fs.readFile(path.join(root,'data','inference-operations.json'),'utf8'));assert(journal.operations.some(item=>item.operation==='load'&&item.status==='pending'));
    state.loads++;state.loaded=true;return Response.json({status:'loaded',instance_id:'loaded-cold',load_config:{context_length:4096}});
  };
  const app=await createCompanion({root,settings:{port:8769,apiUrl:'http://127.0.0.1:19991',llamaUrl:'http://127.0.0.1:19992',inferenceProvider:'bionic',bionicRoot:root,registryPath:path.join(root,'no-native-registry.json'),extraRoots:[],python:'python',resourcePolicy:'independent'},inferenceEnvironment:{},fetchImpl,comfyService:images,enableUpdateScheduling:false,
    nativeStore:{async listProjects(){if(state.holdProjects){state.projectReached=true;await projects.promise;}return[{id:'project',name:'Synthetic admission'}];},listSessions:async()=>[]},
    localServiceSupervisor:{assertAdmission(){},activeCount:()=>0,protectedPaths:()=>[],snapshot:async()=>({services:[],disabled:true}),close:async()=>{}}
  });
  let cookie='';
  function raw(route,body,headers={}){const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);Object.assign(req,{method:body===undefined?'GET':'POST',url:route,headers:{host:'127.0.0.1:8769',...(cookie?{cookie}:{}),...headers},socket:{remoteAddress:'127.0.0.1'}});const res=new Reply();return{res,work:app.handle(req,res)};}
  async function request(route,body,headers){const operation=raw(route,body,headers);await operation.work;return operation.res;}
  cookie=(await request('/api/login',{code:'synthetic-code'})).headers['set-cookie'].split(';')[0];
  const current=(await request('/api/inference/settings')).json();
  const load=()=>raw('/api/models/load',{modelId:'cold-model',expectedInferenceRevision:current.revision,consent:true},{origin:'http://127.0.0.1:8769','x-local-service-csrf':current.csrfNonce});
  const image=()=>raw('/api/comfy/generate',{projectId:'project',requestId:randomUUID(),prompt:'Synthetic image'});
  t.after(async()=>{projects.release();catalogue.release();await app.close();assert.equal(path.dirname(root),await fs.realpath(os.tmpdir()));assert(path.basename(root).startsWith('model-load-admission-'));await fs.rm(root,{recursive:true,force:true});});
  return{app,state,projects,catalogue,load,image};
}

test('an image waiting in pre-admission refuses manual model loading before any upstream model HTTP',async t=>{
  const f=await fixture(t);f.state.holdProjects=true;const image=f.image();await until(()=>f.state.projectReached);
  const work=f.app.activeWork();assert.equal(work.requests,1);assert.equal(work.conversations,0);assert.equal(work.images,0);
  const load=f.load();await load.work;assert.equal(load.res.statusCode,409);assert.equal(f.state.modelReads,0);assert.equal(f.state.loads,0);
  f.projects.release();await image.work;assert.equal(image.res.statusCode,200);assert.equal(f.state.images.length,1);assert.equal(f.state.loads,0);assert.equal(f.app.activeWork().modelManagement,0);
});

test('manual loading waiting for its first catalogue blocks images even before a durable load intent exists',async t=>{
  const f=await fixture(t);f.state.holdCatalogue=true;const load=f.load();await until(()=>f.state.catalogueReached);
  assert.equal(f.state.loads,0);assert.equal(f.app.activeWork().modelManagement,1);
  const image=f.image();await image.work;assert.equal(image.res.statusCode,409);assert.equal(f.state.images.length,0);
  f.catalogue.release();await load.work;assert.equal(load.res.statusCode,200);assert.equal(f.state.loads,1);assert.equal(load.res.json().model.contextLength,4096);assert.equal(f.app.activeWork().modelManagement,0);
});
