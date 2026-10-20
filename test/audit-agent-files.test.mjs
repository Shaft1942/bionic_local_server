import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createProjectFiles} from '../lib/project-files.mjs';
import {createAgentTools,toolsFor} from '../lib/agent-tools.mjs';
import {createToolApprovals} from '../lib/tool-approvals.mjs';
import {forkConversation} from '../lib/conversation-fork.mjs';

async function fixture(t) {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-audit-modules-'));
  const project=path.join(base,'p1'),other=path.join(base,'p2'),backups=path.join(base,'backups');
  await fs.mkdir(project);await fs.mkdir(other);
  const registryPath=path.join(base,'registry.json');
  await fs.writeFile(registryPath,JSON.stringify({projects:[['p1',{projectWorkingDirectoryPath:project}],['p2',{projectWorkingDirectoryPath:other}]]}));
  const files=createProjectFiles({registryPath,backupDirectory:backups});
  t.after(async()=>{assert.equal(path.dirname(path.resolve(base)),path.resolve(os.tmpdir()));assert(path.basename(base).startsWith('bionic-audit-modules-'));await fs.rm(base,{recursive:true,force:true});});
  return {base,project,other,backups,files};
}
const call=(name,args)=>({function:{name,arguments:JSON.stringify(args)}});

test('explicit read profile overrides legacy write and refuses all forged mutations',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.project,'note.txt'),'original');
  const a=createAgentTools({files:f.files,projectId:'p1',fileAccess:true,fileProfile:'read'});
  assert((await a.execute(call('read_project_file',{path:'note.txt'}))).action.ok);
  for(const [name,args] of [
    ['write_project_file',{path:'note.txt',content:'changed'}],['replace_project_text',{path:'note.txt',old_text:'original',new_text:'changed'}],
    ['create_project_directory',{path:'new'}],['copy_project_file',{path:'note.txt',destination:'copy.txt'}],
    ['move_project_file',{path:'note.txt',destination:'moved.txt'}],['trash_project_file',{path:'note.txt'}]
  ])assert.equal((await a.execute(call(name,args))).action.ok,false,name);
  assert.equal(await fs.readFile(path.join(f.project,'note.txt'),'utf8'),'original');
  assert.deepEqual((await fs.readdir(f.project)),['note.txt']);
  assert.equal(toolsFor({fileAccess:true,fileProfile:'none'}).length,0);
  assert.equal(toolsFor({fileAccess:false}).length,0);
  assert(toolsFor({fileAccess:true}).some(item=>item.function.name==='write_project_file'));
  assert.throws(()=>toolsFor({fileProfile:'typo',fileAccess:true}));
});

test('reinforced web refusal never invokes the provider or creates external context',async()=>{
  let calls=0;const a=createAgentTools({files:{},projectId:'p1',webAccess:true,webApproval:true,webService:{search:async query=>{calls++;return {query,results:[]};}},requestApproval:async proposal=>({approved:false,approval:{...proposal,status:'denied'}})});
  const result=await a.execute(call('search_web',{query:'SYNTHETIC_PRIVATE_CANARY'}));
  assert.equal(calls,0);assert.equal(result.action.ok,false);assert(!result.external);
});

test('web decisions use immutable exact arguments; later calls need separate approval',async()=>{
  const decisions=createToolApprovals();let current,provider=[];
  const requestApproval=proposal=>decisions.request({projectId:'p1',chatId:'chat1',proposal,onChange:approval=>{current=approval;}});
  const service={read:async(url,options)=>{provider.push({url,options});return {url,title:'Synthetic',text:'text',start:0};}};
  const a=createAgentTools({files:{},projectId:'p1',webAccess:true,webApproval:true,webService:service,requestApproval});
  const wait=async()=>{for(let i=0;i<50&&!current;i++)await new Promise(resolve=>setImmediate(resolve));assert(current);};
  let pending=a.execute(call('read_web_page',{url:'https://example.org/?q=exact&x=2',query:'passage',start:4,length:40}));await wait();
  assert.equal(current.kind,'web');assert.equal(current.url,'https://example.org/?q=exact&x=2');assert.equal(provider.length,0);
  current.parameters.url='https://changed.invalid/';
  await decisions.decide({id:current.id,projectId:'p1',chatId:'chat1',decision:'approve',url:'https://changed.invalid/'});
  assert((await pending).action.ok);assert.equal(provider[0].url,'https://example.org/?q=exact&x=2');assert.equal(provider[0].options.allowRedirects,false);
  const first=current.id;current=null;pending=a.execute(call('read_web_page',{url:'https://example.org/?q=later'}));await wait();assert.notEqual(first,current.id);assert.equal(provider.length,1);
  await decisions.decide({id:current.id,projectId:'p1',chatId:'chat1',decision:'deny'});assert(!(await pending).action.ok);assert.equal(provider.length,1);
});

test('web expiration and cancellation after approval do not call a provider',async()=>{
  let calls=0;
  const service={search:async query=>{calls++;return {query,results:[]};}};
  const approvals=createToolApprovals({ttl:5});const keepAlive=setTimeout(()=>{},100);
  try {const a=createAgentTools({files:{},projectId:'p1',webAccess:true,webApproval:true,webService:service,requestApproval:proposal=>approvals.request({projectId:'p1',chatId:'c1',proposal})});assert(!(await a.execute(call('search_web',{query:'expire'}))).action.ok);}
  finally{clearTimeout(keepAlive);}
  const controller=new AbortController();const b=createAgentTools({files:{},projectId:'p1',webAccess:true,webApproval:true,signal:controller.signal,webService:service,requestApproval:async proposal=>{controller.abort();return {approved:true,approval:{...proposal,id:randomUUID()}};}});
  assert(!(await b.execute(call('search_web',{query:'cancel'}))).action.ok);assert.equal(calls,0);
});

test('trash inventory, passive download and exclusive restore are independent of a chat',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.project,'removed.txt'),'exact bytes');
  const version=await f.files.inspect('p1','project','removed.txt');const removed=await f.files.manipulate('p1','project','removed.txt',version.hash,{remove:true});
  assert.equal(typeof f.files.listTrash,'function');assert.equal(typeof f.files.downloadTrash,'function');
  const listing=await f.files.listTrash('p1');const item=listing.items.find(item=>item.id===removed.trashId);assert(item);assert.equal(item.status,'available');
  assert(!JSON.stringify(listing).includes(f.backups));assert.equal((await f.files.listTrash('p2')).items.length,0);
  await assert.rejects(f.files.downloadTrash('p2',removed.trashId),{status:403});
  assert.equal((await f.files.downloadTrash('p1',removed.trashId)).bytes.toString(),'exact bytes');
  await f.files.restoreTrashed('p1',removed.trashId);assert.equal(await fs.readFile(path.join(f.project,'removed.txt'),'utf8'),'exact bytes');
  await assert.rejects(f.files.restoreTrashed('p1',removed.trashId),{status:409});
});

test('trash invalid metadata or damaged bytes are explicit and never restored',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.project,'removed.txt'),'original bytes');const v=await f.files.inspect('p1','project','removed.txt');const removed=await f.files.manipulate('p1','project','removed.txt',v.hash,{remove:true});
  await fs.writeFile(path.join(f.backups,removed.trashId+'.bin'),'truncated');
  assert.equal(typeof f.files.listTrash,'function');const listing=await f.files.listTrash('p1');assert.equal(listing.items.find(x=>x.id===removed.trashId).status,'damaged');
  await assert.rejects(f.files.restoreTrashed('p1',removed.trashId),{status:409});
  await fs.writeFile(path.join(f.backups,randomUUID()+'.json'),'{invalid');
  assert((await f.files.listTrash('p1')).warnings.length>0);
});

test('bounded backup comparison uses exact hashes and refuses historical attribution after later edit',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.project,'note.md'),'Avant é\r\n');const before=await f.files.read('p1','project','note.md');const saved=await f.files.write('p1','project','note.md',before.hash,'Après 😀\n');
  assert.equal(typeof f.files.compareBackup,'function');const compared=await f.files.compareBackup('p1','project','note.md',saved.backupId,saved.hash);
  assert.equal(compared.status,'comparable');assert.equal(compared.before.text,'Avant é\r\n');assert.equal(compared.after.hash,saved.hash);assert.equal(compared.after.text,'Après 😀\r\n');
  await fs.writeFile(path.join(f.project,'note.md'),'Later edit');const later=await f.files.compareBackup('p1','project','note.md',saved.backupId,saved.hash);assert.equal(later.status,'changed');assert(!later.after);
  await assert.rejects(f.files.compareBackup('p2','project','note.md',saved.backupId,saved.hash),{status:403});
});

test('fork inherits an explicit read profile but no active tool or approval authority',()=>{
  const source={id:'web-'+randomUUID(),projectId:'p1',source:'web',name:'Source',fileAccess:true,fileProfile:'read',webAccess:true,webApproval:true,scriptAccess:true,messages:[{id:'m1',role:'assistant',text:'Done',actions:[{id:randomUUID(),name:'trash_project_file',ok:true,trashId:randomUUID()}],approvals:[{id:randomUUID(),kind:'web',status:'pending'}]}]};
  const fork=forkConversation({source});assert.equal(fork.fileProfile,'read');assert.equal(fork.webAccess,false);assert.equal(fork.scriptAccess,false);assert(!fork.messages[0].actions);assert(!fork.messages[0].approvals);
});
