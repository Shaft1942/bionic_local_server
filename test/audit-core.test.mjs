import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createCompanion } from '../server.mjs';
import { createInferenceGate } from '../lib/inference-gate.mjs';
import { receiveBody } from '../lib/request-body.mjs';
import { runDiagnostics } from '../lib/diagnostics.mjs';
const sha = x=>createHash('sha256').update(x).digest('hex');
export class Response extends EventEmitter { constructor(){super();this.headers={};this.parts=[];this.statusCode=200;}setHeader(k,v){this.headers[k.toLowerCase()]=v;}writeHead(s,h={}){this.statusCode=s;this.headersSent=true;for(const[k,v]of Object.entries(h))this.setHeader(k,v);}write(x){this.parts.push(String(x));}end(x){if(x)this.parts.push(String(x));this.writableEnded=true;this.emit('finish');}text(){return this.parts.join('');}json(){return JSON.parse(this.text());} }
function incoming(url,{method='GET',body,headers={},remoteAddress='127.0.0.1'}={}) { const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{method,url,headers:{host:'127.0.0.1:8769',...headers},socket:{remoteAddress}});return req; }
const nativeStore={listProjects:async()=>[{id:'p1',name:'Synthetic',sessionsCount:0},{id:'p2',name:'Other',sessionsCount:0}],listSessions:async()=>[],getConversation:async()=>{throw Object.assign(Error(),{status:404});},diagnosticSchema:async()=>({status:'ok',code:'NATIVE_SCHEMA_OK'})};
async function fixture(t,opts={}) {
 const { expectedCloseError, ...companionOptions } = opts;
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'bionic-audit-core-'))),project=path.join(root,'project');await fs.mkdir(project);await fs.writeFile(path.join(root,'registry.json'),JSON.stringify({projects:[['p1',{projectWorkingDirectoryPath:project}],['p2',{projectWorkingDirectoryPath:project}]]}));
 const settings={port:8769,apiUrl:'http://127.0.0.1:1235',bionicRoot:root,registryPath:path.join(root,'registry.json'),extraRoots:[],python:'python',maxConcurrentInferences:0,requestTimeoutMs:180000};
 const app=await createCompanion({root,settings,nativeStore,...companionOptions});
 t.after(async()=>{if(expectedCloseError)await assert.rejects(app.close(),{code:expectedCloseError});else await app.close();const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved),await fs.realpath(os.tmpdir()));assert(path.basename(root).startsWith('bionic-audit-core-'));await fs.rm(root,{recursive:true,force:true});});
 async function request(url,options={}){const response=new Response();await app.handle(incoming(url,options),response);return response;}
 const access=await fs.readFile(path.join(root,'ACCES-PRIVE.txt'),'utf8'),code=/Code d’accès : (.+)/.exec(access)[1].trim();
 const login=await request('/api/login',{method:'POST',body:{code}}),cookie=login.headers['set-cookie'].split(';')[0];
 return {root,project,app,settings,code,cookie,request:(url,options={})=>request(url,{...options,headers:{cookie,...options.headers}}),anonymous:request};
}
test('one damaged chat and invalid schema keep healthy lists/activity accessible without rewriting bytes',async t=>{
 const f=await fixture(t),healthy={id:'web-'+randomUUID(),projectId:'p1',name:'Healthy',updatedAt:1,messages:[]};await f.app.persistChat(healthy);
 const bad='web-'+randomUUID(),schema='web-'+randomUUID(),badName='web-'+randomUUID();const file=id=>path.join(f.root,'data/chats',id+'.json');await fs.writeFile(file(bad),' { truncated');await fs.writeFile(file(schema),JSON.stringify({id:schema,projectId:'p1',messages:{}}));await fs.writeFile(file(badName),JSON.stringify({id:badName,projectId:'p1',name:null,messages:[]}));const before=[sha(await fs.readFile(file(bad))),sha(await fs.readFile(file(schema)))];
 for(const pid of ['p1','p2']){const r=await f.request('/api/sessions?projectId='+pid);assert.equal(r.statusCode,200);assert.equal(r.json().partial,true);assert.equal(r.json().warnings[0].count,3);if(pid==='p1')assert(r.json().sessions.some(x=>x.id===healthy.id));}
 const scans=f.app.measurements.directoryScans;const activity=await f.request('/api/activity');assert.equal(activity.statusCode,200);assert(activity.json().partial);assert.equal(f.app.measurements.directoryScans-scans,1,'one shared scan for the activity cycle');
 assert.equal((await f.request('/api/conversation?projectId=p1&id='+bad)).statusCode,422);assert.equal((await f.request('/api/conversation?projectId=p1&id='+healthy.id)).statusCode,200);assert.deepEqual([sha(await fs.readFile(file(bad))),sha(await fs.readFile(file(schema)))],before);
});
test('global directory permission failure remains an explicit error, not a complete empty listing',async t=>{
 const f=await fixture(t,{fs:{...fs,readdir:async p=>{if(String(p).endsWith(path.join('data','chats')))throw Object.assign(Error(),{code:'EACCES'});return fs.readdir(p);}}});
 const r=await f.request('/api/sessions?projectId=p1');assert.equal(r.statusCode,500);assert(r.json().error);assert.equal(r.json().sessions,undefined);
});
test('image resolution occurs only after historical selection',async t=>{
 let images=0;const f=await fixture(t,{projectFiles:{imageData:async file=>{images++;if(file.hash==='missing')throw Error('missing');return 'data:image/png;base64,AA==';}}});
 const chat={messages:[{role:'user',text:'x'.repeat(6000),attachments:[{kind:'image',name:'old.png',hash:'missing'}]}]};
 const result=await f.app.conversationModelContext(chat,'Hi',4096,[],true,false,randomUUID());assert.equal(images,0);assert.equal(result.receipt.history.selectedCount,0);
 await f.app.conversationModelContext({messages:[{role:'user',text:'image',attachments:[{kind:'image',name:'current.png',hash:'ok'}]}]},'Hi',4096,[],true,false,randomUUID());assert.equal(images,1);
});
test('optional FIFO gate limits predictions and cancellation removes only its waiter',async()=>{
 for(const limit of [1,2]){const gate=createInferenceGate(limit),releases=[];for(let i=0;i<limit;i++)releases.push(await gate.acquire());const cancelled=new AbortController(),cancel=gate.acquire(cancelled.signal);const next=gate.acquire();cancelled.abort();await assert.rejects(cancel,{status:409});assert.equal(gate.snapshot().active,limit);assert.equal(gate.snapshot().waiting,1);releases.shift()();const last=await next;assert.equal(gate.snapshot().waiting,0);last();releases.forEach(r=>r());assert.equal(gate.snapshot().active,0);}
 const unlimited=createInferenceGate();const releases=await Promise.all([unlimited.acquire(),unlimited.acquire(),unlimited.acquire()]);assert.equal(unlimited.snapshot().active,3);releases.forEach(r=>r());
});
test('receiving a slow unfinished body expires without being a response-stream timeout',async()=>{
 const req=new Readable({read(){}});const pending=receiveBody(req,{timeoutMs:15});const keepAlive=setTimeout(()=>{},60);await assert.rejects(pending,{status:408});req.destroy();clearTimeout(keepAlive);
 const bytes=await receiveBody(Readable.from([Buffer.alloc(20_000_000)]),{limit:20_000_000,timeoutMs:30000});assert.equal(bytes.length,20_000_000);await assert.rejects(receiveBody(Readable.from([Buffer.alloc(5)]),{limit:4}),{status:413});
});
test('global session revocation is loopback/token guarded and old cookies cannot return',async t=>{
 const f=await fixture(t);const second=await f.anonymous('/api/login',{method:'POST',body:{code:f.code}});const cookie2=second.headers['set-cookie'].split(';')[0];
 for(const opt of [{remoteAddress:'192.168.2.2',body:{token:f.app.config.adminToken}},{body:{token:'wrong'}}])assert.equal((await f.anonymous('/api/admin/revoke-sessions',{method:'POST',...opt})).statusCode,403);
 const r=await f.anonymous('/api/admin/revoke-sessions',{method:'POST',body:{token:f.app.config.adminToken}});assert.equal(r.json().revoked,2);assert(r.json().canReconnectWithCode);
 assert.equal((await f.request('/api/projects')).statusCode,401);assert.equal((await f.anonymous('/api/projects',{headers:{cookie:cookie2}})).statusCode,401);assert.equal((await f.anonymous('/api/login',{method:'POST',body:{code:f.code}})).statusCode,200);
});
test('diagnostics whitelist differentiates API/auth/schema failures without exporting private canaries',async()=>{
 const canary='PRIVATE_CANARY_'+randomUUID(),settings={apiUrl:'http://127.0.0.1:1235',python:canary,bionicRoot:canary};
 for(const [response,expected] of [[{ok:false,status:401},'API_AUTH_REFUSED'],[{ok:true,json:async()=>({models:null})},'MODELS_SCHEMA_INVALID'],[{ok:true,json:async()=>({models:[{key:canary,type:'llm',display_name:canary}]})},'TOOL_CAPABILITIES_UNKNOWN']]){const result=await runDiagnostics({settings,nativeStore:{diagnosticSchema:async()=>({status:'error',code:'NATIVE_SCHEMA_MISMATCH',private:canary})},fetchImpl:async()=>response,checkPython:async()=>{throw Error(canary);}});assert(result.checks.some(c=>c.code===expected));assert(result.checks.some(c=>c.code==='NATIVE_SCHEMA_MISMATCH'));assert(!JSON.stringify(result).includes(canary));assert.equal(result.checks.length,5);}
 const timeout=await runDiagnostics({settings,fetchImpl:async()=>{throw Object.assign(Error(canary),{name:'TimeoutError'});},checkPython:async()=> 'PYTHON_UNAVAILABLE'});assert(timeout.checks.some(c=>c.code==='API_TIMEOUT'));
});
test('factory creates isolated instances without automatic listening',async t=>{
 const a=await fixture(t),b=await fixture(t);assert.notEqual(a.app.config.instanceId,b.app.config.instanceId);assert.equal(a.app.server.listening,false);assert.equal(b.app.server.listening,false);assert.notEqual(a.app.chatStates,b.app.chatStates);
});
test('mutation pending before write survives a final checkpoint failure as uncertain, never replayed',async t=>{
 let failCheckpoint=false;
 const injected={...fs,writeFile:async(p,data,...args)=>{if(failCheckpoint&&String(p).includes(path.join('data','chats'))&&typeof data==='string'&&data.includes('"backupId"'))throw Object.assign(Error('synthetic checkpoint failure'),{code:'EACCES'});return fs.writeFile(p,data,...args);}};
 const fetchImpl=async(url,options)=>{if(String(url).endsWith('/api/v1/models'))return {ok:true,json:async()=>({models:[{key:'synthetic',type:'llm',loaded_instances:[{id:'x',config:{context_length:16000}}]}]})};const body=JSON.parse(options.body),count=body.messages.filter(x=>x.role==='tool').length;const delta=count===0?{tool_calls:[{index:0,id:'read',function:{name:'read_project_file',arguments:JSON.stringify({path:'note.md'})}}]}:{tool_calls:[{index:0,id:'write',function:{name:'replace_project_text',arguments:JSON.stringify({path:'note.md',old_text:'before',new_text:'after'})}}]};if(count)failCheckpoint=true;return {ok:true,body:new ReadableStream({start(c){c.enqueue(Buffer.from('data: '+JSON.stringify({choices:[{delta,finish_reason:'tool_calls'}]})+'\n\ndata: [DONE]\n\n'));c.close();}})};};
 const f=await fixture(t,{fs:injected,fetchImpl,expectedCloseError:'EACCES'});await fs.writeFile(path.join(f.project,'note.md'),'before');await f.request('/api/chat',{method:'POST',body:{projectId:'p1',text:'edit',model:'synthetic',fileProfile:'write'}});assert.equal(await fs.readFile(path.join(f.project,'note.md'),'utf8'),'after');
 const names=(await fs.readdir(path.join(f.root,'data/chats'))).filter(x=>x.endsWith('.json'));const id=names[0].slice(0,-5);failCheckpoint=false;
 const recovered=await createCompanion({root:f.root,settings:f.settings,nativeStore});t.after(()=>recovered.close());const chat=await recovered.readWeb(id);const intent=chat.messages.at(-1).mutationIntents[0];assert.equal(intent.status,'uncertain');assert.equal(chat.messages.at(-1).actions.some(x=>x.backupId),false);assert.equal(chat.generation.status,'interrupted');
 const {createProjectFiles}=await import('../lib/project-files.mjs');const files=createProjectFiles({registryPath:f.settings.registryPath,backupDirectory:path.join(f.root,'data/file-backups')});const candidates=await files.listMutationBackups('p1',{path:'note.md',since:intent.createdAt-5000});assert.equal(candidates.length,1);assert.equal((await files.downloadBackup('p1',candidates[0].id)).bytes.toString(),'before');
 await fs.writeFile(path.join(f.project,'note.md'),'external edit');assert.equal((await recovered.readWeb(id)).messages.at(-1).mutationIntents[0].status,'uncertain');assert.equal(await fs.readFile(path.join(f.project,'note.md'),'utf8'),'external edit');
});
