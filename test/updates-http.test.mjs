import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { createCompanion } from '../server.mjs';

class Response extends EventEmitter {
  constructor() { super(); this.parts=[]; this.headers={}; this.statusCode=200; }
  setHeader(name,value) { this.headers[name.toLowerCase()]=value; }
  writeHead(status,headers={}) { this.statusCode=status; this.headersSent=true; for(const [name,value]of Object.entries(headers))this.setHeader(name,value); }
  write(value) { this.parts.push(String(value)); }
  end(value) { if(value)this.write(value); this.writableEnded=true; if(!this.destroyed)this.emit('finish'); }
  json() { return JSON.parse(this.parts.join('')); }
}
async function fixture(t, overrides={}) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'bionic-update-http-'))),calls=[];
  let enabled=true,ignored=null,checking=false,restarts=0,cookie;
  const candidate={version:'1.10.0',url:'https://github.com/Shaft1942/bionic_local_server/releases/tag/v1.10.0',notes:'Synthetic'};
  const service={status:()=>({currentVersion:'1.9.0',enabled,checking,ignoredVersion:ignored,candidate:ignored?null:candidate}),start(){calls.push('start');},stop(){calls.push('stop');},async check(){calls.push('check');},async ignore(v){assert.equal(v,candidate.version);ignored=v;calls.push('ignore');},async setEnabled(v){enabled=v;calls.push('preferences');},async prepareInstall(version){calls.push('download');assert.equal(version,candidate.version);return{archive:Buffer.from('synthetic'),metadata:{version}};},...overrides.service};
  const installer={async prepareUpdate(){calls.push('prepare');return{version:candidate.version};},async launchUpdate(){calls.push('launch');},...overrides.installer};
  const app=await createCompanion({root,settings:{port:8769,apiUrl:'http://127.0.0.1:1235',bionicRoot:root,registryPath:path.join(root,'registry.json'),extraRoots:[],python:'python'},nativeStore:{listProjects:async()=>[],listSessions:async()=>[]},updateService:service,updateInstaller:installer,updatePlatform:'win32',enableUpdateScheduling:true,onUpdateRestart:()=>{restarts++;}});
  async function request(url,input,options={}) {
    const source=options.source||Readable.from(input===undefined?[]:[Buffer.from(JSON.stringify(input))]);
    Object.assign(source,{url,method:input===undefined&&!options.source?'GET':'POST',headers:{host:'127.0.0.1:8769',...(cookie?{cookie}:{}),...options.headers},socket:{remoteAddress:'127.0.0.1'}});
    const response=new Response(); if(options.disconnected)response.destroyed=true;
    await app.handle(source,response);return response;
  }
  t.after(async()=>{await app.close();assert.equal(path.dirname(root),await fs.realpath(os.tmpdir()));assert(path.basename(root).startsWith('bionic-update-http-'));await fs.rm(root,{recursive:true,force:true});});
  return{root,app,calls,request,get restarts(){return restarts;},async login(){const code=/Code d’accès : (.+)/.exec(await fs.readFile(path.join(root,'ACCES-PRIVE.txt'),'utf8'))[1].trim();cookie=(await request('/api/login',{code})).headers['set-cookie'].split(';')[0];}};
}

test('updates are authenticated, origin-checked and require explicit installation consent',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/updates')).statusCode,401);
  assert.equal((await f.request('/api/updates/install',{version:'1.10.0',confirm:true})).statusCode,401);
  await f.login();
  assert.equal((await f.request('/api/updates/install',{version:'1.10.0',confirm:true},{headers:{origin:'http://foreign.invalid'}})).statusCode,403);
  assert.equal((await f.request('/api/updates/install',{version:'1.10.0'})).statusCode,400);
  assert.deepEqual(f.calls,[]);
});

test('checking, refusing and disabling checks never prepare or install an archive',async t=>{
  const f=await fixture(t);await f.login();
  assert.equal((await f.request('/api/updates/check',{})).json().canInstall,true);
  assert.equal((await f.request('/api/updates/preferences',{enabled:false})).json().enabled,false);
  assert.equal((await f.request('/api/updates/ignore',{version:'1.10.0'})).json().candidate,null);
  assert.deepEqual(f.calls,['check','preferences','ignore']);
});

test('automatic checks start when the server starts listening and stop with it',async t=>{
  const f=await fixture(t);assert.deepEqual(f.calls,[]);f.app.server.emit('listening');assert.deepEqual(f.calls,['start']);await f.app.close();assert(f.calls.includes('stop'));
});

test('active work prevents installation before any download',async t=>{
  const f=await fixture(t);await f.login();
  f.app.chatStates.set('synthetic',{chat:{generation:{status:'running'}},writes:Promise.resolve()});
  assert.equal((await f.request('/api/updates/install',{version:'1.10.0',confirm:true})).statusCode,409);
  assert.deepEqual(f.calls,[]);
});

test('another accepted mutation prevents an update while its request body is arriving',async t=>{
  const f=await fixture(t);await f.login();let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const mutation=f.request('/api/conversation/rename',null,{source:Readable.from((async function*(){await gate;yield Buffer.from('{}');})())});
  await sleep(10);
  assert.equal((await f.request('/api/updates/install',{version:'1.10.0',confirm:true})).statusCode,409);
  release();await mutation;assert(!f.calls.includes('download'));
});

test('concurrent installation attempts launch one worker only',async t=>{
  let release,entered=false;const gate=new Promise(resolve=>{release=resolve;});
  const f=await fixture(t,{installer:{async prepareUpdate(){entered=true;await gate;return{};}}});await f.login();
  const first=f.request('/api/updates/install',{version:'1.10.0',confirm:true});
  while(!entered)await sleep(2);
  assert.equal((await f.request('/api/updates/install',{version:'1.10.0',confirm:true})).statusCode,409);
  release();assert.equal((await first).statusCode,202);
  assert.equal(f.calls.filter(x=>x==='download').length,1);assert.equal(f.calls.filter(x=>x==='launch').length,1);
  assert.equal((await f.request('/api/chat',{text:'should not start'})).statusCode,503);
  await sleep(190);assert.equal(f.restarts,1);
});

test('work appearing during preparation cancels installation before starting its worker',async t=>{
  let f;f=await fixture(t,{installer:{async prepareUpdate(){f.app.chatStates.set('synthetic',{chat:{queue:[{status:'queued'}]},writes:Promise.resolve()});return{};}}});await f.login();
  assert.equal((await f.request('/api/updates/install',{version:'1.10.0',confirm:true})).statusCode,409);
  assert(!f.calls.includes('launch'));assert.equal((await f.request('/api/updates')).json().installation.status,'error');
});

test('a disconnected phone cannot strand an accepted update in maintenance',async t=>{
  const f=await fixture(t);await f.login();
  const reply=await f.request('/api/updates/install',{version:'1.10.0',confirm:true},{disconnected:true});
  assert.equal(reply.statusCode,202);assert(f.calls.includes('launch'));await sleep(190);assert.equal(f.restarts,1);
});

test('a Git checkout remains readable but refuses automatic installation',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.root,'.git'));await f.login();
  const status=(await f.request('/api/updates')).json();assert.equal(status.canInstall,false);assert.match(status.unavailableReason,/Git/);
  assert.equal((await f.request('/api/updates/install',{version:'1.10.0',confirm:true})).statusCode,409);assert(!f.calls.includes('download'));
});
