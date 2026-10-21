import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProjectFiles} from '../lib/project-files.mjs';
import {createAgentTools,toolsFor} from '../lib/agent-tools.mjs';
const base=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-mobile-expanded-tools-'));
const project=path.join(base,'project');await fs.mkdir(project);
const registry=path.join(base,'registry.json');await fs.writeFile(registry,JSON.stringify({projects:[['p1',{projectWorkingDirectoryPath:project}],['p2',{projectWorkingDirectoryPath:path.join(base,'other')}]]}));await fs.mkdir(path.join(base,'other'));
const files=createProjectFiles({registryPath:registry,backupDirectory:path.join(base,'backups')});
const call=(name,args)=>({id:'test-call',function:{name,arguments:JSON.stringify(args)}});
const agent=options=>createAgentTools({files,projectId:'p1',fileAccess:true,privateDirectory:path.join(base,'runs'),...options});

test('a blocked search is not sent or approved repeatedly in one turn; direct reading remains available',async()=>{
  let searches=0,approvals=0,reads=0;
  const webService={describeSearch:()=>({url:'https://lite.duckduckgo.com/lite/?q=test',host:'lite.duckduckgo.com'}),search:async()=>{searches++;throw Object.assign(new Error('Recherche bloquée, aucun résultat obtenu.'),{status:502,searchBlocked:true});},read:async url=>{reads++;return {url,title:'Source',text:'Public source'};}};
  const a=agent({webAccess:true,webApproval:true,webService,requestApproval:async()=>{approvals++;return {approved:true};}});
  assert.equal((await a.execute(call('search_web',{query:'test'}))).action.ok,false);
  assert.equal((await a.execute(call('search_web',{query:'other words'}))).action.ok,false);
  assert.equal(searches,1);assert.equal(approvals,1);
  assert.equal((await a.execute(call('read_web_page',{url:'https://example.com/'}))).action.ok,true);
  assert.equal(reads,1);assert.equal(approvals,2);
  const next=agent({webAccess:true,webService});await next.execute(call('search_web',{query:'test'}));assert.equal(searches,2);
});

test('the agent requests a separate fallback approval and records the real successful provider',async()=>{
  const proposals=[];
  const destination={url:'https://api.search.brave.com/res/v1/web/search?q=test&count=5',host:'api.search.brave.com',provider:'Brave'};
  const webService={describeSearch:()=>({url:'https://lite.duckduckgo.com/lite/?q=test',host:'lite.duckduckgo.com',provider:'DuckDuckGo'}),search:async(query,options)=>{
    assert.equal(options.allowRedirects,false);assert.equal(await options.approveFallback(destination),true);
    return {query,provider:'Brave',fallbackFrom:'DuckDuckGo',searchDestination:destination,results:[{url:'https://example.com/',title:'Source'}]};
  }};
  const a=agent({webAccess:true,webApproval:true,webService,requestApproval:async proposal=>{proposals.push(proposal);return {approved:true,approval:{id:String(proposals.length)}};}});
  const {action}=await a.execute(call('search_web',{query:'test'}));
  assert.equal(action.ok,true);assert.equal(proposals.length,2);assert.equal(proposals[0].host,'lite.duckduckgo.com');assert.equal(proposals[1].host,'api.search.brave.com');assert.equal(action.outbound.provider,'Brave');assert.equal(action.approvalId,'2');assert.match(action.message,/secours Brave/);
});
test('file inspection, copy, move, trash and restoration preserve bytes and refuse overwrites',async()=>{
  await fs.writeFile(path.join(project,'source.txt'),'Exact original bytes.');const a=agent();
  assert(!(await a.execute(call('move_project_file',{path:'source.txt',destination:'moved.txt'}))).action.ok);
  assert((await a.execute(call('inspect_project_file',{path:'source.txt'}))).action.ok);
  assert((await a.execute(call('copy_project_file',{path:'source.txt',destination:'copies/copy.txt'}))).action.ok);
  assert(!(await a.execute(call('copy_project_file',{path:'source.txt',destination:'copies/copy.txt'}))).action.ok);
  assert((await a.execute(call('move_project_file',{path:'source.txt',destination:'moved.txt'}))).action.ok);
  await assert.rejects(fs.stat(path.join(project,'source.txt')),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(project,'moved.txt'),'utf8'),'Exact original bytes.');
  await a.execute(call('inspect_project_file',{path:'moved.txt'}));const removed=await a.execute(call('trash_project_file',{path:'moved.txt'}));
  assert(removed.action.ok&&removed.action.trashId);await assert.rejects(fs.stat(path.join(project,'moved.txt')),{code:'ENOENT'});
  await assert.rejects(files.restoreTrashed('p2',removed.action.trashId),{status:403});
  await files.restoreTrashed('p1',removed.action.trashId);assert.equal(await fs.readFile(path.join(project,'moved.txt'),'utf8'),'Exact original bytes.');
  await assert.rejects(files.restoreTrashed('p1',removed.action.trashId),{status:409});
});
test('stale inspections, path escape, hidden names and folder deletion cannot change files',async()=>{
  await fs.writeFile(path.join(project,'stale.txt'),'before');const a=agent();await a.execute(call('inspect_project_file',{path:'stale.txt'}));await fs.writeFile(path.join(project,'stale.txt'),'new PC content');
  assert(!(await a.execute(call('trash_project_file',{path:'stale.txt'}))).action.ok);
  assert(!(await a.execute(call('move_project_file',{path:'stale.txt',destination:'after.txt'}))).action.ok);
  for(const value of ['../outside','.env','C:/outside','folder/../outside'])assert(!(await a.execute(call('create_project_directory',{path:value}))).action.ok);
  assert((await a.execute(call('create_project_directory',{path:'drafts/nested'}))).action.ok);
  assert(!(await a.execute(call('inspect_project_file',{path:'drafts'}))).action.ok);
  assert.equal(await fs.readFile(path.join(project,'stale.txt'),'utf8'),'new PC content');
});
test('targeted search returns bounded excerpts and supplies current versions for exact replacement',async()=>{
  await fs.writeFile(path.join(project,'search.md'),'before\nA chosen NEEDLE passage.\nafter');await fs.writeFile(path.join(project,'.env'),'NEEDLE private');
  const a=agent();let result=await a.execute(call('search_project_files',{path:'',query:'search.md',mode:'name'}));assert.equal(result.result.matches[0].path,'search.md');assert(!result.reads?.length);
  result=await a.execute(call('search_project_files',{path:'',query:'NEEDLE',mode:'text'}));assert(result.action.ok);assert.equal(result.reads.length,1);assert(result.reads[0].text.includes('NEEDLE'));assert(result.reads[0].hash);assert(!JSON.stringify(result.result).includes('private'));
  assert((await a.execute(call('replace_project_text',{path:'search.md',old_text:'NEEDLE',new_text:'TARGET'}))).action.ok);
});
test('web and script tools are separately gated, and denied scripts do not spawn',async()=>{
  let webCalls=0,approvals=0,spawned=0;
  const options={webService:{search:async query=>{webCalls++;return {query,results:[{title:'Source',url:'https://example.org'}]};}},requestApproval:async()=>{approvals++;return {approved:false,approval:{status:'denied'}};},spawnImpl:()=>{spawned++;throw Error('Must not spawn');}};
  const locked=agent({...options,fileAccess:false});assert(!(await locked.execute(call('search_web',{query:'test'}))).action.ok);assert(!(await locked.execute(call('run_project_script',{runtime:'node',code:'console.log(1)'}))).action.ok);
  const enabled=agent({...options,fileAccess:false,webAccess:true,scriptAccess:true});const web=await enabled.execute(call('search_web',{query:'public information'}));assert(web.action.ok&&web.external.kind==='search');
  const script=await enabled.execute(call('run_project_script',{runtime:'node',code:'console.log(1)'}));assert.equal(script.result.executed,false);assert.equal(spawned,0);assert.equal(approvals,1);assert.equal(webCalls,1);
  assert.equal(toolsFor({webAccess:true}).length,2);assert(!toolsFor({scriptAccess:true}).some(tool=>tool.function.name==='write_project_file'));
});
test('text search skips oversized files before reading and bounds total scanned characters',async()=>{
  await fs.mkdir(path.join(project,'budget'));
  await fs.writeFile(path.join(project,'budget','large.txt'),'NEEDLE'+ 'x'.repeat(120000));
  for(let index=0;index<4;index++)await fs.writeFile(path.join(project,'budget',index+'.txt'),'x'.repeat(70000)+'NEEDLE');
  const result=await agent().execute(call('search_project_files',{path:'budget',query:'NEEDLE',mode:'text'}));
  assert(result.action.ok);assert(result.result.skippedLarge>=1);assert(result.result.charactersScanned<=200000);assert(result.result.truncated);
  assert(!result.result.matches.some(match=>match.path.endsWith('large.txt')));
});
test('serialized web results never exceed the per-request context budget',async()=>{
  const a=agent({webAccess:true,webService:{read:async()=>({url:'https://example.org',title:'Source',start:0,text:'a'.repeat(6000)})}});
  let total=0,success=0;for(let index=0;index<8;index++){
    const result=await a.execute(call('read_web_page',{url:'https://example.org',length:6000}));
    if(result.action.ok){total+=JSON.stringify(result.result).length;success++;}
  }
  assert(success>=2);assert(total<=18000);
});
test('invalid web configuration cannot break unrelated file-only requests',async()=>{
  const previous=process.env.BIONIC_SEARCH_URL;process.env.BIONIC_SEARCH_URL='not a URL';
  try{const a=agent();const result=await a.execute(call('inspect_project_file',{path:'search.md'}));assert(result.action.ok);const web=await agent({webAccess:true}).execute(call('search_web',{query:'test'}));assert(!web.action.ok);}
  finally{if(previous===undefined)delete process.env.BIONIC_SEARCH_URL;else process.env.BIONIC_SEARCH_URL=previous;}
});
test.after(async()=>{const resolved=await fs.realpath(base);assert.equal(path.dirname(resolved),await fs.realpath(os.tmpdir()));assert(path.basename(resolved).startsWith('bionic-mobile-expanded-tools-'));await fs.rm(resolved,{recursive:true,force:true});});
