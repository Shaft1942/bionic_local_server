import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createProjectFiles } from '../lib/project-files.mjs';
import { createFileAgent, consumeModelStream } from '../lib/file-agent.mjs';
const base=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-mobile-agent-test-'));
const folder=path.join(base,'project');await fs.mkdir(folder);await fs.writeFile(path.join(folder,'notes.md'),'Hello world.\n');
await fs.writeFile(path.join(folder,'workflow.json'),'{"width":512}');await fs.writeFile(path.join(folder,'large.txt'),'A'.repeat(30)+'unique line'+'B'.repeat(30));
const registryPath=path.join(base,'registry.json');await fs.writeFile(registryPath,JSON.stringify({projects:[['p1',{projectWorkingDirectoryPath:folder}]]}));
const files=createProjectFiles({registryPath,backupDirectory:path.join(base,'backups'),imageDirectory:path.join(base,'images'),extraRoots:[]});
const agent=()=>createFileAgent({files,projectId:'p1',readLimit:40});
const call=(name,args)=>({id:'call-test',function:{name,arguments:JSON.stringify(args)}});

test('model must read a current file before modification; successful edits have backups',async()=>{
  const a=agent();let r=await a.execute(call('replace_project_text',{path:'notes.md',old_text:'world',new_text:'phone'}));assert(!r.action.ok);
  assert((await a.execute(call('read_project_file',{path:'notes.md'}))).action.ok);
  r=await a.execute(call('replace_project_text',{path:'notes.md',old_text:'world',new_text:'phone'}));assert(r.action.ok&&r.action.backupId);assert.equal(await fs.readFile(path.join(folder,'notes.md'),'utf8'),'Hello phone.\n');
  await files.write('p1','project','notes.md',r.action.hash,undefined,r.action.backupId);assert.equal(await fs.readFile(path.join(folder,'notes.md'),'utf8'),'Hello world.\n');
});
test('external edits invalidate model read authority',async()=>{
  const a=agent();await a.execute(call('read_project_file',{path:'notes.md'}));await fs.writeFile(path.join(folder,'notes.md'),'Changed on PC.');
  const r=await a.execute(call('write_project_file',{path:'notes.md',content:'lost update'}));assert(!r.action.ok);assert.equal(await fs.readFile(path.join(folder,'notes.md'),'utf8'),'Changed on PC.');
});
test('large unread tails and invalid JSON are never overwritten',async()=>{
  const a=agent();await a.execute(call('read_project_file',{path:'large.txt'}));let r=await a.execute(call('write_project_file',{path:'large.txt',content:'truncate'}));assert(!r.action.ok);
  await a.execute(call('read_project_file',{path:'workflow.json'}));r=await a.execute(call('replace_project_text',{path:'workflow.json',old_text:'512',new_text:'broken'}));assert(!r.action.ok);assert.equal(await fs.readFile(path.join(folder,'workflow.json'),'utf8'),'{"width":512}');
});
test('tools create nested text files but cannot traverse, execute, or write hidden files',async()=>{
  const a=agent();assert((await a.execute(call('write_project_file',{path:'drafts/new.md',content:'New local text.'}))).action.ok);
  for(const [name,args] of [['write_project_file',{path:'../escape.txt',content:'x'}],['write_project_file',{path:'.env',content:'x'}],['run_command',{path:'notes.md',command:'anything'}]])assert(!(await a.execute(call(name,args))).action.ok);
});
test('cancelled turns cannot perform file actions',async()=>{
  const controller=new AbortController();const a=createFileAgent({files,projectId:'p1',signal:controller.signal});controller.abort();assert(!(await a.execute(call('write_project_file',{path:'cancelled.md',content:'x'}))).action.ok);await assert.rejects(fs.stat(path.join(folder,'cancelled.md')),{code:'ENOENT'});
});
test('an exact user-provided replacement reads the current file and preserves unrelated content',async()=>{
 await fs.writeFile(path.join(folder,'literal.txt'),'Bonjour\nOther PC content.');const a=createFileAgent({files,projectId:'p1',userPrompt:'Remplace Bonjour par Salut.'});
 const r=await a.execute(call('replace_project_text',{path:'literal.txt',old_text:'Bonjour',new_text:'Salut'}));assert(r.action.ok&&r.action.backupId);assert.equal(await fs.readFile(path.join(folder,'literal.txt'),'utf8'),'Salut\nOther PC content.');
});
test('attached snapshots authorize full edits only while their hash remains current',async()=>{
 const file=await files.read('p1','project','literal.txt');const a=createFileAgent({files,projectId:'p1',initialReads:[{...file,rootId:'project',excerpt:false}]});
 const r=await a.execute(call('write_project_file',{path:'literal.txt',content:'Updated attached file.'}));assert(r.action.ok);
 const stale=createFileAgent({files,projectId:'p1',initialReads:[{...file,rootId:'project',excerpt:false}]});assert(!(await stale.execute(call('write_project_file',{path:'literal.txt',content:'Stale content.'}))).action.ok);
});
test('imports are placed in the project and duplicate names do not overwrite',async()=>{
  const first=await files.importFile('p1','phone.txt',Buffer.from('first'));const second=await files.importFile('p1','phone.txt',Buffer.from('second'));
  assert.equal(first.path,'Imports telephone/phone.txt');assert.equal(second.path,'Imports telephone/phone (2).txt');assert.equal(await fs.readFile(path.join(folder,first.path),'utf8'),'first');
  await assert.rejects(files.importFile('p1','../escape.txt',Buffer.from('x')),{status:400});
  await assert.rejects(files.create('p1','project','notes.md',Buffer.from('no overwrite')),{status:409});
});
test('image attachments require vision and retain immutable snapshot bytes',async()=>{
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64');
  const image=await files.importFile('p1','photo.png',bytes);assert(image.attachable);
  const reference={rootId:'project',path:image.path,hash:image.hash};
  await assert.rejects(files.attachments('p1',[reference]),{status:400});
  const [snapshot]=await files.attachments('p1',[reference],{allowImages:true});await fs.writeFile(path.join(folder,image.path),'changed');
  assert.deepEqual((await files.imageBytes(snapshot)).bytes,bytes);
});
test('stream parsing reassembles multiple indexed tool fragments and final usage',async()=>{
  const packets=[{choices:[{delta:{tool_calls:[{index:1,id:'call2',function:{name:'read_project_file',arguments:'{"pa'}},{index:0,id:'call1',function:{name:'list_project_files',arguments:'{"path":""}'}}]}}]},{choices:[{delta:{tool_calls:[{index:1,function:{arguments:'th":"notes.md"}'}}]},finish_reason:'tool_calls'}]},{choices:[],usage:{completion_tokens:20}}];
  const body=new ReadableStream({start(c){for(const p of packets)c.enqueue(Buffer.from('data: '+JSON.stringify(p)+'\n\n'));c.enqueue(Buffer.from('data: [DONE]'));c.close()}});
  const r=await consumeModelStream(body,{onContent:()=>{}});assert.equal(r.calls[0].id,'call1');assert.deepEqual(JSON.parse(r.calls[1].function.arguments),{path:'notes.md'});
});

test('targeted reads find a passage without returning the whole file or repeated excerpts',async()=>{
 await fs.writeFile(path.join(folder,'target.txt'),'A'.repeat(4000)+'NEEDLE useful passage'+'B'.repeat(4000));
 const a=createFileAgent({files,projectId:'p1'});
 const first=await a.execute(call('read_project_file',{path:'target.txt',query:'NEEDLE',length:500}));
 assert(first.action.ok);assert(first.result.text.includes('NEEDLE'));assert.equal(first.result.text.length,500);assert.equal(first.result.start,3750);
 const again=await a.execute(call('read_project_file',{path:'target.txt',query:'NEEDLE',length:500}));assert(!again.action.ok);assert(!again.result.text);
 assert(!(await a.execute(call('read_project_file',{path:'target.txt',query:'absent'}))).action.ok);
});

test('successful reads return exact receipt metadata without adding fields to the model result',async()=>{
 const a=agent(),before=await files.read('p1','project','target.txt');
 const r=await a.execute(call('read_project_file',{path:'target.txt',start:12,length:20}));
 assert.deepEqual(r.read,{path:'target.txt',hash:before.hash,start:12,text:r.result.text,totalCharacters:before.text.length,truncated:!!before.truncated});
 assert.equal(r.read.text,before.text.slice(12,32));
 assert(!('hash' in r.result));
 const failed=await a.execute(call('read_project_file',{path:'missing.md'}));assert.equal(failed.action.ok,false);assert(!failed.read);
 const listing=await a.execute(call('list_project_files',{path:''}));assert(!listing.read);
});

test('new file text has a total per-turn budget, and listings never contain file contents',async()=>{
 const a=createFileAgent({files,projectId:'p1',readBudget:80,readLimit:50});
 const listing=await a.execute(call('list_project_files',{path:''}));assert(listing.action.ok);assert(!JSON.stringify(listing.result).includes('Hello world'));
 assert(!(await a.execute(call('list_project_files',{path:''}))).action.ok);
 let result=await a.execute(call('read_project_file',{path:'target.txt'}));assert.equal(result.result.text.length,50);
 result=await a.execute(call('read_project_file',{path:'target.txt',start:50}));assert.equal(result.result.text.length,30);assert.equal(result.result.remainingReadCharacters,0);
 assert(!(await a.execute(call('read_project_file',{path:'target.txt',start:80}))).action.ok);
 const fresh=createFileAgent({files,projectId:'p1',readBudget:80,readLimit:50});assert((await fresh.execute(call('read_project_file',{path:'target.txt'}))).action.ok);
});

 test.after(async()=>{ const safeRoot=path.resolve(base), safeTemp=path.resolve(os.tmpdir())+path.sep; assert(safeRoot.startsWith(safeTemp)&&path.basename(safeRoot).startsWith('bionic-mobile-')); await fs.rm(safeRoot,{recursive:true,force:true}); });
