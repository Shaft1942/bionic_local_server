import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createCompanion } from '../server.mjs';
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'bionic-mobile-server-test-')));
const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const fileRoot=path.join(root,'project-files');await fs.mkdir(fileRoot,{recursive:true});await fs.writeFile(path.join(fileRoot,'notes.md'),'Synthetic project file.');
const otherFileRoot=path.join(root,'other-project-files');await fs.mkdir(otherFileRoot);
// Each independent scenario needs a fresh single-link file, not an earlier inode.
async function resetAgentFixture(){const file=path.join(fileRoot,'agent.md');await fs.rm(file,{force:true});await fs.writeFile(file,'before',{flag:'wx'});}
await fs.writeFile(path.join(root,'files-registry.json'),JSON.stringify({projects:[['p1',{projectWorkingDirectoryPath:fileRoot}],['p2',{projectWorkingDirectoryPath:otherFileRoot}]]}));
process.env.BIONIC_MOBILE_PROJECT_REGISTRY=path.join(root,'files-registry.json');process.env.BIONIC_MOBILE_EXTRA_ROOTS='[]';
await fs.writeFile(path.join(root,'fixture-store.mjs'),`export function createBionicStore(){return {listProjects:async()=>[{id:'p1',name:'Synthetic',sessionsCount:1},{id:'p2',name:'Other synthetic',sessionsCount:0}],listSessions:async id=>{if(id==='p2')return [];if(id!=='p1')throw Object.assign(new Error('Invalid'),{status:400});return [{id:'native-1',projectId:'p1',name:'Synthetic native',updatedAt:1}]},getConversation:async(projectId,id)=>{if(projectId!=='p1'||id!=='native-1')throw Object.assign(new Error('Missing'),{status:404});return {id,projectId,name:'Synthetic native',source:'bionic',messages:[{id:'m0',role:'user',text:'Synthetic historical text'}]}}}};`);
const upstream=[], upstreamBodies=[];let upstreamCount=0;let preStarted=false,preAborted=false,releasePre,releaseAgent;let fixtureLoaded=true,unloadCount=0,lastUpstreamBody;
globalThis.fetch=async(url,opt={})=>{
 if(String(url).endsWith('/api/v1/models'))return {ok:true,json:async()=>({models:[{type:'llm',key:'synthetic',loaded_instances:fixtureLoaded?[{id:'loaded-synthetic',config:{context_length:4096}}]:[],capabilities:{vision:true,reasoning:{allowed_options:['off','on'],default:'on'}}}]})};
 if(String(url).endsWith('/api/v1/models/unload')){unloadCount++;fixtureLoaded=false;return {ok:true,json:async()=>({instance_id:'loaded-synthetic'})};}
 if(String(url).endsWith('/api/v1/models/load')){fixtureLoaded=true;return {ok:true,json:async()=>({status:'loaded',instance_id:'loaded-synthetic',load_config:{context_length:4096}})};}
 upstreamCount++;lastUpstreamBody=JSON.parse(opt.body);upstreamBodies.push(structuredClone(lastUpstreamBody));const lastContent=lastUpstreamBody.messages.at(-1).content;const text=typeof lastContent==='string'?lastContent:lastContent.filter(p=>p.type==='text').map(p=>p.text).join('\n');
 const original=lastUpstreamBody.messages.findLast(m=>m.role==='user')?.content;
 if(typeof original==='string'&&original.startsWith('HTTP_FAIL_INITIAL'))return {ok:false,status:503,body:{cancel:async()=>{}}};
 if(original==='AGENT_READ_FAIL'||original==='AGENT_READ_NO_RESUME'){
  const count=lastUpstreamBody.messages.filter(m=>m.role==='tool').length;
  if(count&&original==='AGENT_READ_NO_RESUME')return {ok:false,status:503,body:{cancel:async()=>{}}};
  const event=count?{choices:[{delta:{content:'Lecture terminée.'},finish_reason:'stop'}]}:{choices:[{delta:{tool_calls:[{index:0,id:'targeted-read',function:{name:'read_project_file',arguments:JSON.stringify({path:original==='AGENT_READ_FAIL'?'missing.md':'agent.md'})}}]},finish_reason:'tool_calls'}]};
  return {ok:true,status:200,body:new ReadableStream({start(c){c.enqueue(Buffer.from('data: '+JSON.stringify(event)+'\n\ndata: [DONE]\n\n'));c.close()}})};
 }
 if(original==='AGENT_TRASH'){
  const count=lastUpstreamBody.messages.filter(m=>m.role==='tool').length;
  const fn={name:count===0?'inspect_project_file':'trash_project_file',arguments:JSON.stringify({path:'trash.txt'})};
  const event=count<2?{choices:[{delta:{tool_calls:[{index:0,id:'trash-'+count,function:fn}]},finish_reason:'tool_calls'}]}:{choices:[{delta:{content:'Fichier mis à la corbeille.'},finish_reason:'stop'}]};
  return {ok:true,status:200,body:new ReadableStream({start(c){c.enqueue(Buffer.from('data: '+JSON.stringify(event)+'\n\ndata: [DONE]\n\n'));c.close()}})};
 }
 if(original==='AGENT_EDIT'||original==='UNSOLICITED_TOOL'||original==='AGENT_DETACHED'){
  const count=lastUpstreamBody.messages.filter(m=>m.role==='tool').length;
  if(original==='AGENT_DETACHED'&&count===0)await new Promise(resolve=>{releaseAgent=resolve});
  const fn=count===0?{name:'read_project_file',arguments:JSON.stringify({path:'agent.md'})}:{name:'replace_project_text',arguments:JSON.stringify({path:'agent.md',old_text:'before',new_text:'after'})};
  const event=count<2?{choices:[{delta:{tool_calls:[{index:0,id:'test-'+count,function:fn}]},finish_reason:'tool_calls'}]}:{choices:[{delta:{content:'Fichier modifié.'},finish_reason:'stop'}]};
  const body=new ReadableStream({start(c){c.enqueue(Buffer.from('data: '+JSON.stringify(event)+'\n\ndata: '+JSON.stringify({choices:[],usage:{prompt_tokens:100,completion_tokens:20}})+'\n\ndata: [DONE]\n\n'));c.close()}});return {ok:true,status:200,body};
 }
 if(text==='PREHEADER') {preStarted=true;await new Promise(resolve=>{releasePre=resolve;opt.signal.addEventListener('abort',()=>{preAborted=true;resolve()},{once:true})});if(opt.signal.aborted)throw Object.assign(new Error('Abort'),{name:'AbortError'});}
 const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'Synthetic reply'}}]})+'\n\n'));if(text.startsWith('HOLD')){upstream.push(c);opt.signal.addEventListener('abort',()=>{try{c.error(Object.assign(new Error('Abort'),{name:'AbortError'}))}catch{}},{once:true});}else{if(text.startsWith('NORMAL')||text==='PREHEADER'){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{finish_reason:'stop'}]})+'\n\n'));c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[],usage:{prompt_tokens:123,completion_tokens:45}})+'\n\ndata: [DONE]\n\n'));}c.close();}}});
 return {ok:true,status:200,body};
};
const {createBionicStore:createFixtureStore}=await import(pathToFileURL(path.join(root,'fixture-store.mjs')));
const app=await createCompanion({root,nativeStore:createFixtureStore(),fetchImpl:globalThis.fetch});
const {handle,server}=app;
class Res extends EventEmitter {constructor(){super();this.headers={};this.parts=[];this.destroyed=false;this.writableEnded=false;this.headersSent=false;this.statusCode=200}setHeader(k,v){this.headers[k.toLowerCase()]=v}writeHead(s,h={}){this.statusCode=s;this.headersSent=true;for(const[k,v]of Object.entries(h))this.setHeader(k,v)}write(s){this.parts.push(String(s));return true}end(s){if(s)this.parts.push(String(s));this.writableEnded=true;this.emit('finish')}text(){return this.parts.join('')}records(){return this.text().trim().split('\n').filter(Boolean).map(JSON.parse)}}
let cookie;function req(route,{method='GET',body,raw,headers={}}={}){const r=Readable.from(raw?[raw]:body?[Buffer.from(JSON.stringify(body))]:[]);r.method=method;r.url=route;r.headers={host:'127.0.0.1:8769',...headers};r.socket={remoteAddress:'127.0.0.1'};return r}
async function request(route,opt){const res=new Res();await handle(req(route,opt),res);return res}
const data=(text,sessionId=null)=>({projectId:'p1',sessionId,model:'synthetic',text});const send=(text,id=null)=>request('/api/chat',{method:'POST',headers:{cookie},body:data(text,id)});
function finishHold(controller){controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'));controller.close()}
function activeRequestStatus(res){return JSON.parse(res.text()).status}
async function waitForCondition(condition,timeoutMs=5000){const deadline=performance.now()+timeoutMs;do{if(await condition())return true;await sleep(25)}while(performance.now()<deadline);return false}
const findings=[];
const runId=randomUUID(),backgroundRequestId=runId+'-checkpoint';
try {
 await fs.mkdir(path.join(root,'public'),{recursive:true});
 const messageAsset=await fs.readFile(path.join(sourceRoot,'public/message-text.js'),'utf8');
 await fs.writeFile(path.join(root,'public/message-text.js'),messageAsset);
 let r=await request('/message-text.js');findings.push({test:'conversation renderer is served through the explicit static asset allowlist with JavaScript MIME',pass:r.statusCode===200&&r.parts.map(String).join('')===messageAsset&&/^text\/javascript/.test(r.headers['Content-Type']||r.headers['content-type']||'')});
 r=await request('/unlisted-reading.js');findings.push({test:'new conversation renderer does not expose arbitrary static paths',pass:r.statusCode===404});
 r=await request('/api/projects');findings.push({test:'unauthenticated API blocked',pass:r.statusCode===401,status:r.statusCode});
 r=await request('/api/conversation/move',{method:'POST',body:{projectId:'p1',id:'native-1',targetProjectId:'p2'}});findings.push({test:'conversation move requires authentication',pass:r.statusCode===401});
 for(const action of ['rename','delete']){r=await request('/api/conversation/'+action,{method:'POST',body:{projectId:'p1',id:'native-1',name:'Forbidden'}});findings.push({test:'conversation '+action+' requires authentication',pass:r.statusCode===401})}
 r=await request('/api/file?projectId=p1&rootId=project&path=notes.md');findings.push({test:'file contents require login',pass:r.statusCode===401});
 r=await request('/api/file/upload?projectId=p1&name=no.txt',{method:'POST',raw:Buffer.from('x')});findings.push({test:'phone upload requires login',pass:r.statusCode===401});
 r=await request('/api/conversation/fork',{method:'POST',body:{projectId:'p1',chatId:'native-1'}});findings.push({test:'conversation forks require login',pass:r.statusCode===401});
 for(const route of ['/api/activity','/api/deliverables?projectId=p1','/api/deliverable?projectId=p1&id=x','/api/deliverable/download?projectId=p1&id=x']){r=await request(route);findings.push({test:'workspace API requires login: '+route,pass:r.statusCode===401})}
 r=await request('/api/models/unload',{method:'POST',body:{instanceId:'loaded-synthetic'}});findings.push({test:'unauthenticated unload blocked',pass:r.statusCode===401&&unloadCount===0});
 const access=await fs.readFile(path.join(root,'ACCES-PRIVE.txt'),'utf8');const code=/Code d’accès : (.+)/.exec(access)[1].trim();
 r=await request('/api/login',{method:'POST',body:{code}});cookie=r.headers['set-cookie'].split(';')[0];findings.push({test:'access code login',pass:r.statusCode===200});
 r=await request('/api/projects',{headers:{cookie,host:'attacker.example:8769'}});findings.push({test:'unrecognized Host blocked',pass:r.statusCode===403,status:r.statusCode});
 r=await request('/api/chat',{method:'POST',headers:{cookie,origin:'https://attacker.example'},body:data('NORMAL')});findings.push({test:'cross-origin mutation blocked',pass:r.statusCode===403,status:r.statusCode});
 r=await request('/api/file/save',{method:'POST',headers:{cookie,origin:'https://attacker.example'},body:{}});findings.push({test:'cross-origin file writes blocked',pass:r.statusCode===403});
 r=await request('/api/file/upload?projectId=p1&name=no.txt',{method:'POST',headers:{cookie,origin:'https://attacker.example'},raw:Buffer.from('x')});findings.push({test:'cross-origin phone upload blocked',pass:r.statusCode===403});
 for(const route of ['/api/deliverables','/api/deliverable/rename','/api/deliverable/remove']){r=await request(route,{method:'POST',headers:{cookie,origin:'https://attacker.example'},body:{projectId:'p1'}});findings.push({test:'cross-origin workspace mutation blocked: '+route,pass:r.statusCode===403})}
 r=await request('/api/file/upload?projectId=p1&name=phone.txt',{method:'POST',headers:{cookie},raw:Buffer.from('Imported from phone.')});const imported=JSON.parse(r.text());findings.push({test:'raw phone bytes are stored inside the project',pass:r.statusCode===201&&await fs.readFile(path.join(fileRoot,imported.path),'utf8')==='Imported from phone.'});
 r=await request('/api/file/upload?projectId=p1&name=phone.txt',{method:'POST',headers:{cookie},raw:Buffer.from('second')});findings.push({test:'duplicate phone filename gets a distinct project path',pass:r.statusCode===201&&JSON.parse(r.text()).path!==imported.path});
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('HTTP_FAIL_INITIAL'),attachments:[{rootId:'project',path:imported.path,hash:imported.hash}]}});const rejectedReceipt=r.records().at(-1).contextReceipt;
 findings.push({test:'an initial upstream rejection never claims confirmed attachment transmission',pass:r.records().at(-1).type==='error'&&rejectedReceipt.initialTransmitted===false&&rejectedReceipt.attachments[0].eligible===true&&rejectedReceipt.attachments[0].transmitted===false&&rejectedReceipt.attachments[0].preview==='Imported from phone.'});
 await resetAgentFixture();r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('AGENT_EDIT'),fileAccess:true}});const agentRecords=r.records();
 findings.push({test:'streamed model tools read, save and resume generation with persisted action log',pass:agentRecords.at(-1).type==='done'&&agentRecords.filter(e=>e.type==='action').length===2&&agentRecords.some(e=>e.action?.backupId)&&await fs.readFile(path.join(fileRoot,'agent.md'),'utf8')==='after'});
 const changedAction=agentRecords.find(e=>e.action?.backupId).action,agentChatId=agentRecords.find(e=>e.type==='start').id;
 const agentReceipt=JSON.parse(await fs.readFile(path.join(root,'data/chats',agentChatId+'.json'),'utf8')).messages.at(-1).contextReceipt;
 findings.push({test:'tool context persists exact successful excerpt and hash after project modification',pass:agentReceipt.toolReads.length===1&&agentReceipt.toolReads[0].text==='before'&&agentReceipt.toolReads[0].start===0&&agentReceipt.toolReads[0].length===6&&agentReceipt.toolReads[0].transmitted===true&&/^[a-f0-9]{64}$/.test(agentReceipt.toolReads[0].hash)&&agentReceipt.toolsEnabled});
 findings.push({test:'start, action and context events expose the same auditable receipt without changing model tool output',pass:agentRecords.find(e=>e.type==='start').replyId&&agentRecords.find(e=>e.type==='start').contextReceipt.toolReads.length===0&&agentRecords.find(e=>e.type==='action').contextReceipt.toolReads[0].transmitted===false&&agentRecords.some(e=>e.type==='context'&&e.contextReceipt.toolReads[0]?.transmitted===true)&&!upstreamBodies.find(body=>body.messages.some(m=>m.role==='tool'))?.messages.find(m=>m.role==='tool').content.includes('totalReadReceipt')});
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('AGENT_READ_FAIL'),fileAccess:true}});
 findings.push({test:'failed file reads remain visible as errors without pretending that content was used',pass:r.records().at(-1).type==='done'&&r.records().find(event=>event.type==='action').action.ok===false&&r.records().at(-1).contextReceipt.toolReads.length===0});
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('AGENT_READ_NO_RESUME'),fileAccess:true}});
 findings.push({test:'a successful read followed by an upstream error preserves its excerpt without claiming confirmed retransmission',pass:r.records().at(-1).type==='error'&&r.records().at(-1).contextReceipt.initialTransmitted&&r.records().at(-1).contextReceipt.toolReads[0].text==='after'&&r.records().at(-1).contextReceipt.toolReads[0].transmitted===false});
 r=await request('/api/file/restore',{method:'POST',headers:{cookie},body:{projectId:'p1',rootId:'project',path:changedAction.path,hash:changedAction.hash,backupId:changedAction.backupId,chatId:agentChatId,actionId:changedAction.id}});const restoredChat=JSON.parse(await fs.readFile(path.join(root,'data/chats',agentChatId+'.json'),'utf8'));
 findings.push({test:'chat restore persists its completed state and restores the earlier bytes',pass:r.statusCode===200&&restoredChat.messages.at(-1).actions.some(a=>a.id===changedAction.id&&a.restored)&&await fs.readFile(path.join(fileRoot,'agent.md'),'utf8')==='before'});
 await resetAgentFixture();r=await send('UNSOLICITED_TOOL');findings.push({test:'file tools disabled means no tool execution despite unsolicited calls',pass:r.records().some(e=>e.type==='error')&&await fs.readFile(path.join(fileRoot,'agent.md'),'utf8')==='before'});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64');r=await request('/api/file/upload?projectId=p1&name=photo.png',{method:'POST',headers:{cookie},raw:png});const photo=JSON.parse(r.text());
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL image'),attachments:[{rootId:'project',path:photo.path,hash:photo.hash}]}});findings.push({test:'imported image is sent as an immutable data URL to a vision model',pass:r.records().at(-1).type==='done'&&Array.isArray(lastUpstreamBody.messages.at(-1).content)&&lastUpstreamBody.messages.at(-1).content.some(p=>p.image_url?.url.startsWith('data:image/png;base64,'))});
 r=await request('/data/config.json',{headers:{cookie}});findings.push({test:'config not statically exposed',pass:r.statusCode===404,status:r.statusCode});
 r=await request('/api/conversation?projectId=p1&id=../../config',{headers:{cookie}});findings.push({test:'conversation traversal rejected',pass:r.statusCode>=400,status:r.statusCode});
 r=await request('/api/file?projectId=p1&rootId=project&path=../data/config.json',{headers:{cookie}});findings.push({test:'file traversal rejected',pass:r.statusCode===403});
 r=await request('/api/file?projectId=p1&rootId=project&path=notes.md',{headers:{cookie}});const beforeFile=JSON.parse(r.text());
 r=await request('/api/file/save',{method:'POST',headers:{cookie},body:{projectId:'p1',rootId:'project',path:'notes.md',hash:beforeFile.hash,text:'Saved synthetic file.'}});const savedFile=JSON.parse(r.text());
 findings.push({test:'authenticated file write creates a versioned copy on disk',pass:r.statusCode===200&&savedFile.backupId&&await fs.readFile(path.join(fileRoot,'notes.md'),'utf8')==='Saved synthetic file.'});
 r=await request('/api/file/save',{method:'POST',headers:{cookie},body:{projectId:'p1',rootId:'project',path:'notes.md',hash:beforeFile.hash,text:'Stale write'}});findings.push({test:'stale HTTP write rejected',pass:r.statusCode===409});
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL'),attachments:[{rootId:'project',path:'notes.md',hash:savedFile.hash}]}});const attachedChatId=r.records().find(e=>e.type==='start')?.id;const attachedChat=JSON.parse(await fs.readFile(path.join(root,'data/chats',attachedChatId+'.json'),'utf8'));
 findings.push({test:'model receives only verified file content and chat persists a snapshot',pass:r.records().at(-1).type==='done'&&lastUpstreamBody.messages.at(-1).content.includes('Saved synthetic file.')&&attachedChat.messages[0].attachments[0].text==='Saved synthetic file.'});
 await fs.writeFile(path.join(fileRoot,'notes.md'),'Changed later on PC.');r=await send('NORMAL',attachedChatId);
 findings.push({test:'follow-up uses saved file snapshot rather than silently rereading the disk',pass:lastUpstreamBody.messages.some(m=>m.content.includes('Saved synthetic file.'))&&!lastUpstreamBody.messages.some(m=>m.content.includes('Changed later on PC.'))});
 const followupReceipt=r.records().at(-1).contextReceipt;
 findings.push({test:'receipt attachment references use selected historical snapshots rather than current PC bytes',pass:followupReceipt.attachments[0].source==='history'&&followupReceipt.attachments[0].hash===savedFile.hash&&followupReceipt.attachments[0].preview==='Saved synthetic file.'&&followupReceipt.history.messages.length===2&&followupReceipt.initialTransmitted===true&&followupReceipt.toolReads.length===0});
 await fs.writeFile(path.join(fileRoot,'large.txt'),'x'.repeat(30000));r=await request('/api/file?projectId=p1&rootId=project&path=large.txt',{headers:{cookie}});const largeFile=JSON.parse(r.text()),beforeLargeAttach=upstreamCount;
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL'),attachments:[{rootId:'project',path:'large.txt',hash:largeFile.hash}]}});findings.push({test:'attachments exceeding model context are rejected without silent truncation',pass:r.statusCode===400&&upstreamCount===beforeLargeAttach});
 const beforeStaleAttach=upstreamCount;r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL'),attachments:[{rootId:'project',path:'notes.md',hash:beforeFile.hash}]}});findings.push({test:'changed attachment refused before inference',pass:r.statusCode===409&&upstreamCount===beforeStaleAttach});
 r=await send('NORMAL','native-1');findings.push({test:'normal stream done',pass:r.records().at(-1)?.type==='done'});
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL targeted context'),fileAccess:true}});
 findings.push({test:'enabling file tools does not preload project text, and the model is directed to read selectively',pass:r.records().at(-1)?.type==='done'&&!JSON.stringify(lastUpstreamBody.messages).includes('Changed later on PC.')&&lastUpstreamBody.messages[0].content.includes('Lecture ciblée')&&!r.records().some(e=>e.type==='action')});
 findings.push({test:'tools enabled without tool calls has an empty accurate read receipt',pass:r.records().at(-1).contextReceipt.toolsEnabled&&r.records().at(-1).contextReceipt.toolReads.length===0&&r.records().at(-1).contextReceipt.attachments.length===0});
 findings.push({test:'default effort leaves native default untouched',pass:!('reasoning_effort' in lastUpstreamBody)});
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL'),reasoning:'off'}});const effortChatId=r.records().find(e=>e.type==='start')?.id;
 const savedEffort=JSON.parse(await fs.readFile(path.join(root,'data/chats',effortChatId+'.json'),'utf8'));
 findings.push({test:'off is sent as none and remembered per conversation and response',pass:lastUpstreamBody.reasoning_effort==='none'&&savedEffort.reasoningByModel.synthetic==='off'&&savedEffort.messages.at(-1).reasoning==='off'});
 findings.push({test:'the streamed model identity belongs to this saved reply after later conversation model changes',pass:savedEffort.messages.at(-1).model==='synthetic'&&r.records().find(event=>event.type==='start').model===savedEffort.messages.at(-1).model});
 findings.push({test:'final usage after finish is requested, persisted and returned without fake speed',pass:lastUpstreamBody.stream_options?.include_usage===true&&savedEffort.messages.at(-1).metrics.outputTokens===45&&savedEffort.messages.at(-1).metrics.inputTokens===123&&r.records().at(-1).metrics.outputTokens===45&&!savedEffort.messages.at(-1).metrics.tokensPerSecond});
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL',effortChatId),reasoning:'on'}});
 findings.push({test:'on is sent as medium to binary model',pass:lastUpstreamBody.reasoning_effort==='medium'&&r.records().at(-1)?.type==='done'});
 const callsBeforeInvalid=upstreamCount;r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL'),reasoning:'high'}});
 findings.push({test:'unsupported graded effort rejected before inference',pass:r.statusCode===400&&upstreamCount===callsBeforeInvalid});
 r=await send('TRUNCATED','native-1');findings.push({test:'unexpected EOF flagged',pass:r.records().some(x=>x.type==='error'),events:r.records().map(x=>x.type)});
 const preId=runId+'-preheader';
 const preRes=new Res();const preJob=handle(req('/api/chat',{method:'POST',headers:{cookie},body:{...data('PREHEADER'),requestId:preId}}),preRes);for(let i=0;i<50&&!preStarted;i++)await sleep(10);preRes.destroyed=true;preRes.emit('close');await sleep(20);
 r=await request('/api/chat-request?projectId=p1&requestId='+preId,{headers:{cookie}});const receipt=JSON.parse(r.text());
 findings.push({test:'disconnect before model headers keeps the accepted request discoverable and running',pass:!preAborted&&receipt.id&&receipt.status==='running'});
 const preCalls=upstreamCount;r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('PREHEADER'),requestId:preId}});
 findings.push({test:'same request cannot be generated twice after an uncertain phone connection',pass:r.statusCode===409&&upstreamCount===preCalls});
 releasePre();await preJob;r=await request('/api/conversation?projectId=p1&id='+receipt.id,{headers:{cookie}});const resumed=JSON.parse(r.text());
 findings.push({test:'a detached reply completes on disk and can be recovered without resending',pass:resumed.generation.status==='completed'&&resumed.messages.at(-1).complete&&resumed.messages.at(-1).text==='Synthetic reply'});
 r=await request('/api/chat-request?projectId=another&requestId='+preId,{headers:{cookie}});findings.push({test:'request recovery is scoped to its project',pass:r.statusCode===404});
 await resetAgentFixture();const agentRes=new Res();const agentJob=handle(req('/api/chat',{method:'POST',headers:{cookie},body:{...data('AGENT_DETACHED'),fileAccess:true,requestId:runId+'-agent'}}),agentRes);
 for(let i=0;i<50&&!releaseAgent;i++)await sleep(10);agentRes.destroyed=true;agentRes.emit('close');releaseAgent();await agentJob;
 const detachedAgentId=agentRes.records().find(e=>e.type==='start').id;r=await request('/api/conversation?projectId=p1&id='+detachedAgentId,{headers:{cookie}});const detachedAgent=JSON.parse(r.text());
 findings.push({test:'file actions and their backup journal also continue after the phone closes',pass:detachedAgent.generation.status==='completed'&&detachedAgent.messages.at(-1).actions.some(a=>a.backupId)&&await fs.readFile(path.join(fileRoot,'agent.md'),'utf8')==='after'});
 // Fail one periodic checkpoint atomically, as can happen when Windows briefly
 // holds the destination open. No further token or Stop may make the retry dirty.
 const originalCheckpointRename=fs.rename;
 let lastCheckpoint,checkpointSaved=false,checkpointWriteAttempts=0;
 fs.rename=async(from,to)=>{if(path.dirname(to)===path.join(root,'data/chats')){const checkpoint=JSON.parse(await fs.readFile(from,'utf8'));if(checkpoint.generation?.requestId===backgroundRequestId&&checkpoint.generation.status==='running'&&checkpoint.messages.at(-1).text==='Synthetic reply'&&++checkpointWriteAttempts===1)throw Object.assign(new Error('Synthetic transient checkpoint lock'),{code:'EBUSY'});}return originalCheckpointRename(from,to)};
 const backgroundRes=new Res();const backgroundJob=handle(req('/api/chat',{method:'POST',headers:{cookie},body:{...data('HOLD'),requestId:backgroundRequestId}}),backgroundRes);
 let backgroundId;
 try{
  assert(await waitForCondition(()=>backgroundRes.records().some(e=>e.type==='delta')),'The synthetic response must start before disconnecting the browser');
  backgroundId=backgroundRes.records().find(e=>e.type==='start').id;backgroundRes.destroyed=true;backgroundRes.emit('close');
  checkpointSaved=await waitForCondition(async()=>{const checkpoint=lastCheckpoint=JSON.parse(await fs.readFile(path.join(root,'data/chats',backgroundId+'.json'),'utf8'));return checkpointWriteAttempts>=2&&checkpoint.messages.at(-1).text==='Synthetic reply'&&checkpoint.generation.status==='running'&&checkpoint.generation.requestId===backgroundRequestId;});
 }
 finally{fs.rename=originalCheckpointRename}
 findings.push({test:'partial reply is checkpointed while the browser is disconnected',pass:checkpointSaved&&checkpointWriteAttempts>=2,...(!checkpointSaved?{diagnostic:{checkpointWriteAttempts,savedText:lastCheckpoint?.messages.at(-1).text,generation:lastCheckpoint?.generation,liveText:app.chatStates.get(backgroundId)?.chat.messages.at(-1).text,metrics:JSON.parse((await request('/api/runtime-status',{headers:{cookie}})).text()).checkpoints,upstreamControllers:upstream.length}}:{})});
 r=await request('/api/cancel',{method:'POST',headers:{cookie},body:{requestId:backgroundRequestId}});await backgroundJob;
 r=await request('/api/conversation?projectId=p1&id='+backgroundId,{headers:{cookie}});const stopped=JSON.parse(r.text());
 findings.push({test:'explicit Stop still cancels a detached job and preserves partial text',pass:stopped.generation.status==='stopped'&&stopped.messages.at(-1).interrupted&&stopped.messages.at(-1).text==='Synthetic reply'});upstream.splice(0);
 const stoppedMetrics=stopped.messages.at(-1).metrics;
 findings.push({test:'Stop persists elapsed and queue metrics without inventing tokens absent from the interrupted stream',pass:stoppedMetrics?.partial===true&&stoppedMetrics.totalSeconds>=stoppedMetrics.queueSeconds&&stoppedMetrics.responseSeconds>=0&&stoppedMetrics.outputTokens===undefined&&stoppedMetrics.tokensPerSecond===undefined});
 const orphanId='web-11111111-1111-4111-8111-111111111111';await fs.writeFile(path.join(root,'data/chats',orphanId+'.json'),JSON.stringify({id:orphanId,projectId:'p1',name:'Interrupted synthetic chat',generation:{status:'running',requestId:runId+'-orphan-active'},queue:[{requestId:runId+'-orphan-queued',text:'Never auto replay',status:'queued'}],messages:[{role:'user',text:'Previous request',requestId:runId+'-orphan-active',requestStatus:'running'},{role:'assistant',text:'saved fragment'}]}));r=await request('/api/conversation?projectId=p1&id='+orphanId,{headers:{cookie}});
 findings.push({test:'server restart does not leave an orphaned job presented as running forever',pass:JSON.parse(r.text()).generation.status==='interrupted'&&JSON.parse(r.text()).messages.at(-1).interrupted&&JSON.parse(r.text()).queue[0].status==='interrupted'});
 r=await request('/api/chat-request?projectId=p1&requestId='+runId+'-orphan-queued',{headers:{cookie}});
 findings.push({test:'a queued request recovered after server restart remains interrupted and is never replayed',pass:JSON.parse(r.text()).status==='interrupted'&&!upstreamBodies.some(body=>body.messages.at(-1).content==='Never auto replay')});
 const holdRes=new Res();const holdJob=handle(req('/api/chat',{method:'POST',headers:{cookie},body:{...data('HOLD FIFO','native-1'),requestId:runId+'-fifo'}}),holdRes);
 for(let i=0;i<50&&!holdRes.records().some(e=>e.type==='start');i++)await sleep(10);const id=holdRes.records().find(e=>e.type==='start')?.id,n=upstreamCount;
 for(const action of ['rename','delete']){r=await request('/api/conversation/'+action,{method:'POST',headers:{cookie},body:{projectId:'p1',id:'native-1',name:'Busy native'}});findings.push({test:'native '+action+' is blocked while its companion continuation is running',pass:r.statusCode===409})}
 const queuedOne=runId+'-queued-1',queuedCancel=runId+'-queued-cancel',queuedSnapshot=runId+'-queued-snapshot',queuedTool=runId+'-queued-tool';
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL queued first',id),requestId:queuedOne,reasoning:'off'}});
 const queuedReceipt=r.records().at(-1);
 findings.push({test:'a second message is acknowledged and queued without another model call',pass:r.statusCode===200&&queuedReceipt.type==='queued'&&queuedReceipt.id===id&&queuedReceipt.requestId===queuedOne&&queuedReceipt.position===1&&upstreamCount===n});
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL should never execute',id),requestId:queuedCancel}});
 r=await request('/api/file?projectId=p1&rootId=project&path=notes.md',{headers:{cookie}});const queuedFile=JSON.parse(r.text());
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL queued snapshot',id),requestId:queuedSnapshot,attachments:[{rootId:'project',path:'notes.md',hash:queuedFile.hash,selection:{start:0,end:7,discarded:true},discarded:true}],reasoning:'on'}});
 await resetAgentFixture();
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('AGENT_EDIT',id),requestId:queuedTool,fileAccess:true}});
 findings.push({test:'a queued file action does not edit the project before its turn starts',pass:r.records().at(-1).type==='queued'&&await fs.readFile(path.join(fileRoot,'agent.md'),'utf8')==='before'});
 const onDiskQueue=JSON.parse(await fs.readFile(path.join(root,'data/chats',id+'.json'),'utf8'));
 findings.push({test:'queued requests and frozen file bytes persist separately from current turn history',pass:onDiskQueue.queue.length===4&&onDiskQueue.queue[2].attachments[0].text==='Changed'&&!onDiskQueue.messages.some(message=>message.text.includes('queued first'))&&!JSON.stringify(upstreamBodies[n-1]).includes('queued first')});
 findings.push({test:'queued turns have no invented context receipt before actual execution',pass:onDiskQueue.queue.every(item=>!item.contextReceipt)&&!onDiskQueue.messages.some(message=>message.requestId===queuedSnapshot)});
 findings.push({test:'queued excerpt recovery retains only validated canonical file references and selection bounds',pass:JSON.stringify(onDiskQueue.queue[2].attachmentReferences)===JSON.stringify([{rootId:'project',path:'notes.md',hash:queuedFile.hash,selection:{start:0,end:7}}])});
 const duplicateCount=upstreamCount;r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL duplicate',id),requestId:queuedOne}});
 findings.push({test:'retrying a queued request cannot duplicate its later model call or tools',pass:r.statusCode===409&&upstreamCount===duplicateCount});
 r=await request('/api/chat-request?projectId=p1&requestId='+queuedSnapshot,{headers:{cookie}});
 findings.push({test:'queued receipt exposes its conversation and live position',pass:JSON.parse(r.text()).status==='queued'&&JSON.parse(r.text()).id===id&&JSON.parse(r.text()).position===3});
 r=await request('/api/cancel',{method:'POST',headers:{cookie},body:{id,projectId:'p1',requestId:queuedCancel}});
 r=await request('/api/chat-request?projectId=p1&requestId='+queuedCancel,{headers:{cookie}});
 findings.push({test:'removing one queued message keeps the active reply and remaining FIFO queue',pass:JSON.parse(r.text()).status==='stopped'&&upstreamCount===duplicateCount&&activeRequestStatus(await request('/api/chat-request?projectId=p1&requestId='+runId+'-fifo',{headers:{cookie}}))==='running'});
 await fs.writeFile(path.join(fileRoot,'notes.md'),'Edited while waiting.');
 const other=await send('NORMAL another chat');const otherId=other.records().find(e=>e.type==='start')?.id;
 findings.push({test:'a new conversation in the same project answers while another conversation is running',pass:other.records().at(-1).type==='done'&&otherId&&otherId!==id});
 const secondHoldRes=new Res();const secondHoldJob=handle(req('/api/chat',{method:'POST',headers:{cookie},body:{...data('HOLD independent new'),requestId:runId+'-independent'}}),secondHoldRes);
 for(let i=0;i<50&&!secondHoldRes.records().some(e=>e.type==='delta');i++)await sleep(10);
 findings.push({test:'two new conversations have independent active generations without a project-wide new lock',pass:secondHoldRes.records().some(e=>e.type==='delta')&&secondHoldRes.records().find(e=>e.type==='start').id!==id});
 const fifoController=upstream.shift();finishHold(fifoController);await holdJob;
 const executed=upstreamBodies.filter(body=>typeof body.messages.at(-1).content==='string'&&body.messages.at(-1).content.includes('NORMAL queued'));
 const firstTurn=executed.find(body=>body.messages.at(-1).content==='NORMAL queued first'),snapshotTurn=executed.find(body=>body.messages.at(-1).content.startsWith('NORMAL queued snapshot'));
 findings.push({test:'queued messages run once in order with completed prior history and their captured effort',pass:executed.length===2&&executed[0]===firstTurn&&executed[1]===snapshotTurn&&firstTurn.reasoning_effort==='none'&&snapshotTurn.reasoning_effort==='medium'&&snapshotTurn.messages.some(message=>message.role==='user'&&message.content==='NORMAL queued first')&&snapshotTurn.messages.some(message=>message.role==='assistant'&&message.content==='Synthetic reply')&&!upstreamBodies.some(body=>body.messages.at(-1).content==='NORMAL should never execute')});
 r=await request('/api/conversation?projectId=p1&id='+id,{headers:{cookie}});const toolTurn=JSON.parse(r.text()).messages.find(message=>message.requestId===queuedTool&&message.role==='assistant');
 findings.push({test:'a queued file-enabled turn executes tools only once with its own captured permission',pass:toolTurn.actions.length===2&&toolTurn.actions.some(action=>action.backupId)&&await fs.readFile(path.join(fileRoot,'agent.md'),'utf8')==='after'});
 findings.push({test:'a queued attachment uses accepted bytes despite later PC changes',pass:snapshotTurn.messages.at(-1).content.includes('\"contenu\":\"Changed\"')&&!snapshotTurn.messages.at(-1).content.includes('Edited while waiting.')});
 r=await request('/api/chat-request?projectId=p1&requestId='+queuedOne,{headers:{cookie}});const firstCompleted=JSON.parse(r.text());
 r=await request('/api/conversation?projectId=p1&id='+id,{headers:{cookie}});const drained=JSON.parse(r.text());
 findings.push({test:'finished queued requests remain discoverable and only the canceled entry remains unexecuted',pass:firstCompleted.status==='completed'&&drained.generation.status==='completed'&&drained.queue.every(item=>item.status==='stopped')&&drained.messages.filter(message=>message.requestId===queuedOne&&message.role==='user').length===1});
 const snapshotReply=drained.messages.find(message=>message.requestId===queuedSnapshot&&message.role==='assistant'),priorReply=drained.messages.find(message=>message.requestId===queuedOne&&message.role==='assistant');
 findings.push({test:'queued receipt is built at execution and includes the previous completed response',pass:snapshotReply.contextReceipt.history.messages.some(message=>message.id===priorReply.id)&&snapshotReply.contextReceipt.attachments.some(file=>file.source==='current'&&file.hash===queuedFile.hash&&file.preview==='Changed'&&file.excerpt)&&snapshotReply.finishedAt>=priorReply.finishedAt&&snapshotReply.outcome==='completed'&&drained.generation.finishedAt>=snapshotReply.finishedAt});
 // A slow cold read must not replace a chat already started by another request.
 const coldId='web-22222222-2222-4222-8222-222222222222',coldPath=path.join(root,'data/chats',coldId+'.json');
 await fs.writeFile(coldPath,JSON.stringify({id:coldId,projectId:'p1',name:'Cold concurrent',messages:[],queue:[],updatedAt:1}));
 const originalReadFile=fs.readFile;let releaseCold,coldWaiting=false,delayColdOnce=true;
 fs.readFile=async(...args)=>{const value=await originalReadFile(...args);if(args[0]===coldPath&&delayColdOnce){delayColdOnce=false;coldWaiting=true;await new Promise(resolve=>{releaseCold=resolve})}return value};
 const coldRead=request('/api/conversation?projectId=p1&id='+coldId,{headers:{cookie}});
 for(let i=0;i<50&&!coldWaiting;i++)await sleep(10);
 const coldRes=new Res(),coldRequest=runId+'-cold';const coldJob=handle(req('/api/chat',{method:'POST',headers:{cookie},body:{...data('HOLD cold read',coldId),requestId:coldRequest}}),coldRes);
 for(let i=0;i<50&&!coldRes.records().some(e=>e.type==='delta');i++)await sleep(10);
 releaseCold();await coldRead;fs.readFile=originalReadFile;
 const beforeColdQueue=upstreamCount,coldQueued=runId+'-cold-queued';r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL after canceled active',coldId),requestId:coldQueued}});
 findings.push({test:'a concurrent cold snapshot read cannot replace the running state or lose its write chain',pass:r.records().at(-1).type==='queued'&&upstreamCount===beforeColdQueue});
 r=await request('/api/cancel',{method:'POST',headers:{cookie},body:{id:coldId,projectId:'p1',requestId:coldRequest}});await coldJob;
 r=await request('/api/chat-request?projectId=p1&requestId='+coldQueued,{headers:{cookie}});const afterActiveStop=JSON.parse(r.text());
 r=await request('/api/chat-request?projectId=p1&requestId='+runId+'-independent',{headers:{cookie}});
 findings.push({test:'stopping one active request interrupts its dependent queue and leaves another chat running',pass:afterActiveStop.status==='interrupted'&&!upstreamBodies.some(body=>body.messages.at(-1).content==='NORMAL after canceled active')&&JSON.parse(r.text()).status==='running'});
 const errorRes=new Res(),errorRequest=runId+'-error-active',errorQueued=runId+'-error-queued';
 const errorJob=handle(req('/api/chat',{method:'POST',headers:{cookie},body:{...data('HOLD invalid EOF'),requestId:errorRequest}}),errorRes);
 for(let i=0;i<50&&!errorRes.records().some(e=>e.type==='delta');i++)await sleep(10);
 const errorId=errorRes.records().find(e=>e.type==='start').id;
 await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL must not run after error',errorId),requestId:errorQueued,fileAccess:true}});
 upstream.pop().close();await errorJob;
 r=await request('/api/chat-request?projectId=p1&requestId='+errorQueued,{headers:{cookie}});
 const errorDisk=JSON.parse(await fs.readFile(path.join(root,'data/chats',errorId+'.json'),'utf8'));
 findings.push({test:'an upstream response error persists its dependent queue as interrupted without executing later tools',pass:JSON.parse(r.text()).status==='interrupted'&&errorDisk.queue[0].status==='interrupted'&&!upstreamBodies.some(body=>body.messages.at(-1).content==='NORMAL must not run after error')});
 const errorMetrics=errorDisk.messages.at(-1).metrics,errorEvent=errorRes.records().findLast(event=>event.type==='error');
 findings.push({test:'stream failure returns the same measured partial statistics that survive conversation reload',pass:errorMetrics?.partial===true&&errorMetrics.totalSeconds>=errorMetrics.queueSeconds&&errorMetrics.responseSeconds>=0&&JSON.stringify(errorEvent.metrics)===JSON.stringify(errorMetrics)&&errorMetrics.outputTokens===undefined});
 findings.push({test:'failed and stopped responses preserve terminal outcome and a real completion time',pass:errorDisk.messages.at(-1).outcome==='error'&&Number.isSafeInteger(errorDisk.messages.at(-1).finishedAt)&&errorDisk.generation.finishedAt===errorDisk.messages.at(-1).finishedAt&&JSON.parse(await fs.readFile(coldPath,'utf8')).messages.find(message=>message.requestId===coldRequest&&message.role==='assistant').outcome==='stopped'});
 const orphanRecovered=JSON.parse(await fs.readFile(path.join(root,'data/chats',orphanId+'.json'),'utf8'));
 findings.push({test:'restart recovery dates the interruption and preserves its context if available',pass:orphanRecovered.messages.at(-1).outcome==='interrupted'&&Number.isSafeInteger(orphanRecovered.messages.at(-1).finishedAt)&&orphanRecovered.generation.finishedAt===orphanRecovered.messages.at(-1).finishedAt});
 const legacyId='web-33333333-3333-4333-8333-333333333333';
 await fs.writeFile(path.join(root,'data/chats',legacyId+'.json'),JSON.stringify({id:legacyId,projectId:'p1',name:'Legacy',messages:[{id:'legacy-user',role:'user',text:'Old question'},{id:'legacy-answer',role:'assistant',text:'Old answer',complete:true}],updatedAt:1,generation:{status:'completed'}}));
 r=await request('/api/conversation?projectId=p1&id='+legacyId,{headers:{cookie}});const legacy=JSON.parse(r.text());
 findings.push({test:'reading an old completed answer invents neither receipt nor activity timestamp',pass:!legacy.messages.at(-1).contextReceipt&&!legacy.messages.at(-1).finishedAt&&!legacy.messages.at(-1).outcome});
 const budgetId='web-44444444-4444-4444-8444-444444444444',budgetMessages=Array.from({length:12},(_,index)=>({id:'budget-'+index,role:index%2?'assistant':'user',text:'Message '+index+' '+String(index).repeat(800)}));
 await fs.writeFile(path.join(root,'data/chats',budgetId+'.json'),JSON.stringify({id:budgetId,projectId:'p1',name:'Limited history',messages:budgetMessages,updatedAt:1,importedTruncated:true}));
 r=await send('NORMAL budget receipt',budgetId);const budgetReceipt=r.records().at(-1).contextReceipt;
 findings.push({test:'receipt omissions and selected history exactly match the actual bounded model payload',pass:budgetReceipt.history.availableCount===12&&budgetReceipt.history.omittedCount===12-budgetReceipt.history.selectedCount&&budgetReceipt.history.omittedCount>0&&budgetReceipt.history.importedTruncated&&JSON.stringify(budgetReceipt.history.messages.map(message=>budgetMessages[message.index].text))===JSON.stringify(lastUpstreamBody.messages.slice(1,-1).map(message=>message.content))});
 r=await request('/api/activity?projectId=p1',{headers:{cookie}});const activity=JSON.parse(r.text());
 findings.push({test:'activity route returns actual terminal outcomes and excludes undated legacy answers',pass:r.statusCode===200&&activity.events.some(event=>event.chatId===errorId&&event.outcome==='error')&&activity.events.some(event=>event.chatId===orphanId&&event.outcome==='interrupted')&&!activity.events.some(event=>event.chatId===legacyId)});
 r=await request('/api/deliverables',{method:'POST',headers:{cookie},body:{projectId:'p1',chatId:agentChatId,messageId:restoredChat.messages.at(-1).id,kind:'message',title:'Saved answer'}});const pinned=JSON.parse(r.text());
 findings.push({test:'authenticated deliverable pin route saves a completed answer snapshot',pass:r.statusCode===201&&pinned.origin?.chatId===agentChatId&&pinned.title==='Saved answer'});
 r=await request('/api/deliverable/download?projectId=p1&id='+pinned.id,{headers:{cookie}});
 findings.push({test:'deliverable downloads are passive attachments with the original saved answer',pass:r.statusCode===200&&r.headers['content-disposition'].startsWith('attachment;')&&r.text()==='Fichier modifié.'&&r.headers['x-content-type-options']==='nosniff'});
 r=await request('/api/deliverable?projectId=another-project&id='+pinned.id,{headers:{cookie}});findings.push({test:'deliverable route denies access through a different project',pass:r.statusCode===404});
 r=await request('/api/deliverable/rename',{method:'POST',headers:{cookie},body:{projectId:'p1',id:pinned.id,title:'Renamed answer'}});findings.push({test:'deliverable rename route changes its local title',pass:r.statusCode===200&&JSON.parse(r.text()).title==='Renamed answer'});
 r=await request('/api/deliverable/remove',{method:'POST',headers:{cookie},body:{projectId:'p1',id:pinned.id}});findings.push({test:'deliverable remove route removes only its saved entry',pass:r.statusCode===200&&JSON.parse(r.text()).removed===true&&await fs.readFile(path.join(fileRoot,'agent.md'),'utf8')==='after'});
 const forkInput={projectId:'p1',chatId:agentChatId};
 r=await request('/api/conversation/fork',{method:'POST',headers:{cookie,origin:'https://untrusted.example'},body:forkInput});findings.push({test:'fork mutations reject an unrelated Origin',pass:r.statusCode===403});
 const sourcePath=path.join(root,'data/chats',agentChatId+'.json'),sourceBeforeFork=await fs.readFile(sourcePath,'utf8');
 r=await request('/api/conversation/fork',{method:'POST',headers:{cookie},body:forkInput});const forkResult=JSON.parse(r.text());
 const forked=JSON.parse(await fs.readFile(path.join(root,'data/chats',forkResult.id+'.json'),'utf8'));
 findings.push({test:'full fork persists a detached snapshot and preserves the source bytes',pass:r.statusCode===201&&forked.messages.length===restoredChat.messages.length&&await fs.readFile(sourcePath,'utf8')===sourceBeforeFork&&forked.origin.kind==='fork'&&!forked.generation&&!forked.queue.length});
 findings.push({test:'forked tool journals have no live action, approval or restoration authority',pass:forked.messages.every(message=>!message.actions&&!message.approvals&&!message.requestId&&!message.finishedAt&&!message.outcome)&&forked.messages.at(-1).historicalActions?.length>0&&!forked.webAccess&&!forked.scriptAccess});
 r=await request('/api/conversation/fork',{method:'POST',headers:{cookie},body:{...forkInput,messageId:restoredChat.messages[0].id}});const boundaryFork=JSON.parse(await fs.readFile(path.join(root,'data/chats',JSON.parse(r.text()).id+'.json'),'utf8'));
 findings.push({test:'fork route copies through the selected message inclusively with new ids',pass:r.statusCode===201&&boundaryFork.messages.length===1&&boundaryFork.messages[0].text===restoredChat.messages[0].text&&boundaryFork.messages[0].id!==restoredChat.messages[0].id});
 r=await request('/api/conversation/fork',{method:'POST',headers:{cookie},body:{...forkInput,projectId:'another-project'}});findings.push({test:'fork route cannot read another project through a chat id',pass:r.statusCode===404});
 r=await request('/api/conversation/fork',{method:'POST',headers:{cookie},body:{projectId:'p1',chatId:'native-1'}});const nativeFork=JSON.parse(await fs.readFile(path.join(root,'data/chats',JSON.parse(r.text()).id+'.json'),'utf8'));
 findings.push({test:'native Bionic history can be forked without inherited write permission',pass:r.statusCode===201&&nativeFork.origin.source==='bionic'&&nativeFork.messages[0].fromBionic&&!nativeFork.fileAccess});
 const activeForkId=secondHoldRes.records().find(e=>e.type==='start').id;
 r=await request('/api/conversation/fork',{method:'POST',headers:{cookie},body:{projectId:'p1',chatId:activeForkId}});findings.push({test:'forking an in-progress answer is refused',pass:r.statusCode===409});
 const activeForkChat=JSON.parse(await fs.readFile(path.join(root,'data/chats',activeForkId+'.json'),'utf8'));
 r=await request('/api/conversation/fork',{method:'POST',headers:{cookie},body:{projectId:'p1',chatId:activeForkId,messageId:activeForkChat.messages[0].id}});findings.push({test:'an earlier message can be forked while the source answer keeps running',pass:r.statusCode===201&&JSON.parse(await fs.readFile(path.join(root,'data/chats',activeForkId+'.json'),'utf8')).generation.status==='running'});
 r=await request('/api/activity?projectId=p1',{headers:{cookie}});findings.push({test:'copied fork messages do not create new completion notifications',pass:!JSON.parse(r.text()).events.some(event=>event.chatId===forkResult.id)});
 // The queue limit counts only waiting entries, and canceling one frees a slot.
 const limitChatId=secondHoldRes.records().find(e=>e.type==='start').id,limitIds=[];
 r=await request('/api/conversation/move',{method:'POST',headers:{cookie},body:{projectId:'p1',id:limitChatId,targetProjectId:'p2'}});findings.push({test:'a running conversation cannot move between project scopes',pass:r.statusCode===409});
 for(const action of ['rename','delete']){r=await request('/api/conversation/'+action,{method:'POST',headers:{cookie},body:{projectId:'p1',id:limitChatId,name:'Busy edit'}});findings.push({test:'a running conversation cannot '+action+' while a response is active',pass:r.statusCode===409})}
 for(let i=0;i<10;i++){const requestId=runId+'-limit-'+i;limitIds.push(requestId);r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL limit '+i,limitChatId),requestId}});assert.equal(r.records().at(-1).type,'queued')}
 const beforeLimit=upstreamCount;r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL over limit',limitChatId),requestId:runId+'-over-limit'}});
 findings.push({test:'one conversation accepts at most ten waiting messages without disturbing other active chats',pass:r.statusCode===409&&upstreamCount===beforeLimit});
 for(const requestId of limitIds)await request('/api/cancel',{method:'POST',headers:{cookie},body:{id:limitChatId,projectId:'p1',requestId}});
 r=await request('/api/models/unload',{method:'POST',headers:{cookie},body:{instanceId:'loaded-synthetic'}});findings.push({test:'unload blocked while a reply is running',pass:r.statusCode===409&&unloadCount===0});
 finishHold(upstream.shift());for(const c of upstream.splice(0))try{c.close()}catch{}await secondHoldJob;
 r=await request('/api/models/unload',{method:'POST',headers:{cookie},body:{instanceId:'loaded-synthetic'}});findings.push({test:'authenticated exact-instance unload succeeds after reply',pass:r.statusCode===200&&JSON.parse(r.text()).unloaded===true&&unloadCount===1});
 r=await request('/api/models/unload',{method:'POST',headers:{cookie},body:{instanceId:'loaded-synthetic'}});findings.push({test:'unload stale instance rejected without repeated mutation',pass:r.statusCode===409&&unloadCount===1});
 const moveInput={projectId:'p1',id:'native-1',targetProjectId:'p2'};
 r=await request('/api/conversation/move',{method:'POST',headers:{cookie},body:null});findings.push({test:'malformed move payload is rejected without changing conversation placement',pass:r.statusCode===400});
 r=await request('/api/conversation/move',{method:'POST',headers:{cookie,origin:'https://attacker.example'},body:moveInput});findings.push({test:'cross-origin conversation moves are blocked',pass:r.statusCode===403});
 r=await request('/api/conversation/move',{method:'POST',headers:{cookie},body:moveInput});const movedNative=JSON.parse(r.text()).conversation;
 const oldNativeList=JSON.parse((await request('/api/sessions?projectId=p1',{headers:{cookie}})).text()).sessions;
 const newNativeList=JSON.parse((await request('/api/sessions?projectId=p2',{headers:{cookie}})).text()).sessions;
 findings.push({test:'native move changes only companion placement and preserves original store identity',pass:r.statusCode===200&&movedNative.nativeProjectId==='p1'&&movedNative.projectId==='p2'&&movedNative.messages[0].text==='Synthetic historical text'&&!oldNativeList.some(s=>s.id==='native-1')&&newNativeList.some(s=>s.id==='native-1')});
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL relocated native','native-1'),projectId:'p2'}});findings.push({test:'replying to a relocated native conversation imports its real original history',pass:r.statusCode===200&&lastUpstreamBody.messages.some(message=>message.content==='Synthetic historical text')});
 await resetAgentFixture();r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('AGENT_EDIT'),fileAccess:true}});const moveWebId=r.records().find(e=>e.type==='start').id;
 const beforeMove=JSON.parse((await request('/api/conversation?projectId=p1&id='+moveWebId,{headers:{cookie}})).text());const oldAction=beforeMove.messages.at(-1).actions.find(action=>action.backupId);
 await fs.writeFile(path.join(otherFileRoot,'agent.md'),'after');
 r=await request('/api/deliverables',{method:'POST',headers:{cookie},body:{projectId:'p1',chatId:moveWebId,messageId:beforeMove.messages.at(-1).id,kind:'message'}});const retainedPin=JSON.parse(r.text());
 r=await request('/api/conversation/move',{method:'POST',headers:{cookie},body:{projectId:'p1',id:moveWebId,targetProjectId:'p2'}});const movedWeb=JSON.parse(r.text()).conversation;
 findings.push({test:'web move preserves ids and messages, resets file authorization and records old action scopes',pass:r.statusCode===200&&movedWeb.id===moveWebId&&movedWeb.projectId==='p2'&&movedWeb.fileAccess===false&&JSON.stringify(movedWeb.messages)===JSON.stringify(beforeMove.messages)&&movedWeb.messages.at(-1).actions.every(action=>action.projectId==='p1')});
 r=await request('/api/conversation?projectId=p1&id='+moveWebId,{headers:{cookie}});findings.push({test:'a moved web conversation is no longer readable through its former project',pass:r.statusCode===404});
 r=await request('/api/deliverables',{method:'POST',headers:{cookie},body:{projectId:'p2',chatId:moveWebId,messageId:movedWeb.messages.at(-1).id,actionId:oldAction.id,kind:'file'}});findings.push({test:'old file actions cannot pin a same-named target-project file after a move',pass:r.statusCode===409});
 r=await request('/api/file/restore',{method:'POST',headers:{cookie},body:{projectId:'p2',rootId:'project',path:oldAction.path,hash:oldAction.hash,backupId:oldAction.backupId,chatId:moveWebId,actionId:oldAction.id}});findings.push({test:'old file actions cannot restore files across a moved conversation scope',pass:r.statusCode===409&&await fs.readFile(path.join(fileRoot,'agent.md'),'utf8')==='after'&&await fs.readFile(path.join(otherFileRoot,'agent.md'),'utf8')==='after'});
 r=await request('/api/deliverable/download?projectId=p1&id='+retainedPin.id,{headers:{cookie}});findings.push({test:'existing deliverable copies remain downloadable in their original project after a conversation moves',pass:r.statusCode===200&&r.text()==='Fichier modifié.'});
 r=await request('/api/conversation/move',{method:'POST',headers:{cookie},body:{projectId:'p2',id:moveWebId,targetProjectId:null}});const unassigned=JSON.parse(r.text()).conversation.projectId;
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL without project',moveWebId),projectId:unassigned,fileAccess:true,scriptAccess:true}});findings.push({test:'unassigned conversations accept replies without exposing file or script tools even when requested',pass:r.statusCode===200&&!lastUpstreamBody.tools&&r.records().at(-1).contextReceipt.toolsEnabled===false&&r.records().at(-1).contextReceipt.permissions.scriptAccess===false});
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL public information',moveWebId),projectId:unassigned,fileAccess:true,scriptAccess:true,webAccess:true}});
 findings.push({test:'unassigned conversations can enable public web independently of file and script permissions',pass:r.statusCode===200&&JSON.stringify(lastUpstreamBody.tools.map(tool=>tool.function.name))===JSON.stringify(['search_web','read_web_page'])&&r.records().at(-1).contextReceipt.permissions.webAccess===true});
 r=await request('/api/conversation/fork',{method:'POST',headers:{cookie},body:{projectId:unassigned,chatId:moveWebId}});const unassignedFork=JSON.parse(await fs.readFile(path.join(root,'data/chats',JSON.parse(r.text()).id+'.json'),'utf8'));
 findings.push({test:'a moved chat can fork inside unassigned without reviving former project permissions',pass:r.statusCode===201&&unassignedFork.projectId===unassigned&&!unassignedFork.fileAccess&&!unassignedFork.scriptAccess&&!unassignedFork.webAccess&&unassignedFork.messages.every(message=>!message.actions&&!message.approvals)});
 const concurrentId=(await send('NORMAL concurrently relocated')).records().find(e=>e.type==='start').id;
 const moves=await Promise.all(['p2',null].map(targetProjectId=>request('/api/conversation/move',{method:'POST',headers:{cookie},body:{projectId:'p1',id:concurrentId,targetProjectId}})));
 findings.push({test:'concurrent web moves serialize and a stale source cannot reassign the conversation twice',pass:moves.filter(response=>response.statusCode===200).length===1&&moves.filter(response=>response.statusCode===404).length===1});
 for(const action of ['rename','delete']){
  r=await request('/api/conversation/'+action,{method:'POST',headers:{cookie,origin:'https://attacker.example'},body:{projectId:'p2',id:'native-1',name:'Forbidden'}});findings.push({test:'cross-origin conversation '+action+' is blocked',pass:r.statusCode===403});
  r=await request('/api/conversation/'+action,{method:'POST',headers:{cookie},body:{projectId:'p1',id:'../native-1',name:'Forbidden'}});findings.push({test:'conversation '+action+' rejects unsafe identifiers',pass:r.statusCode===400});
 }
 const originalNativeStore=await fs.readFile(path.join(root,'fixture-store.mjs'),'utf8');
 r=await request('/api/conversation/rename',{method:'POST',headers:{cookie},body:{projectId:'p2',id:'native-1',name:'  Mon historique natif  '}});const alias=JSON.parse(r.text()).conversation;
 const aliasList=JSON.parse((await request('/api/sessions?projectId=p2',{headers:{cookie}})).text()).sessions;
 findings.push({test:'native rename exposes the local alias in lists and reads while preserving original history identity',pass:r.statusCode===200&&alias.name==='Mon historique natif'&&alias.nativeProjectId==='p1'&&alias.messages[0].text==='Synthetic historical text'&&aliasList.some(item=>item.id==='native-1'&&item.name===alias.name)});
 r=await request('/api/conversation/fork',{method:'POST',headers:{cookie},body:{projectId:'p2',chatId:'native-1'}});const relocatedFork=JSON.parse(await fs.readFile(path.join(root,'data/chats',JSON.parse(r.text()).id+'.json'),'utf8'));
 findings.push({test:'forking a renamed native history preserves its alias and both displayed and native project origins',pass:r.statusCode===201&&relocatedFork.name==='Mon historique natif · branche'&&relocatedFork.origin.projectId==='p2'&&relocatedFork.origin.nativeProjectId==='p1'&&relocatedFork.messages[0].text==='Synthetic historical text'&&!relocatedFork.fileAccess});
 r=await request('/api/conversation/delete',{method:'POST',headers:{cookie},body:{projectId:'p1',id:'native-1'}});findings.push({test:'a stale native project cannot delete the relocated conversation',pass:r.statusCode===404});
 r=await request('/api/conversation/delete',{method:'POST',headers:{cookie},body:{projectId:'p2',id:'native-1'}});const nativeDeleted=JSON.parse(r.text());
 const hiddenNative=await request('/api/conversation?projectId=p2&id=native-1',{headers:{cookie}});
 const hiddenList=JSON.parse((await request('/api/sessions?projectId=p2',{headers:{cookie}})).text()).sessions;
 const beforeHiddenReply=upstreamCount;const hiddenReply=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL hidden history','native-1'),projectId:'p2'}});
 findings.push({test:'native delete persists a companion-only hide and blocks future replies without touching Bionic source bytes',pass:r.statusCode===200&&nativeDeleted.localOnly===true&&hiddenNative.statusCode===404&&!hiddenList.some(item=>item.id==='native-1')&&hiddenReply.statusCode===404&&upstreamCount===beforeHiddenReply&&await fs.readFile(path.join(root,'fixture-store.mjs'),'utf8')===originalNativeStore&&JSON.parse(await fs.readFile(path.join(root,'data','conversation-locations.json'),'utf8')).native.find(item=>item.id==='native-1').deletedAt>0});
 await resetAgentFixture();
 const managedRequest=runId+'-managed';r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('AGENT_EDIT'),requestId:managedRequest,fileAccess:true}});const managedId=r.records().find(event=>event.type==='start').id;
 const managedBefore=JSON.parse((await request('/api/conversation?projectId=p1&id='+managedId,{headers:{cookie}})).text());
 for(const name of ['', '   ', 'a'.repeat(121), 'Deux\nlignes', 2]){r=await request('/api/conversation/rename',{method:'POST',headers:{cookie},body:{projectId:'p1',id:managedId,name}});assert.equal(r.statusCode,400)}
 findings.push({test:'web rename rejects empty long multiline and non-text names',pass:true});
 r=await request('/api/conversation/rename',{method:'POST',headers:{cookie},body:{projectId:'p1',id:managedId,name:'  Conversation renommée  '}});const managedRenamed=JSON.parse(r.text()).conversation;
 findings.push({test:'web rename persists its name without changing messages file permissions or origin metadata',pass:r.statusCode===200&&managedRenamed.name==='Conversation renommée'&&managedRenamed.fileAccess===managedBefore.fileAccess&&JSON.stringify(managedRenamed.messages)===JSON.stringify(managedBefore.messages)&&JSON.parse(await fs.readFile(path.join(root,'data','chats',managedId+'.json'),'utf8')).name===managedRenamed.name});
 r=await request('/api/conversation/rename',{method:'POST',headers:{cookie},body:{projectId:'p2',id:managedId,name:'Wrong project'}});findings.push({test:'web rename verifies the current project scope',pass:r.statusCode===404});
 r=await request('/api/conversation/delete',{method:'POST',headers:{cookie},body:{projectId:'p2',id:managedId}});findings.push({test:'web delete verifies the current project scope',pass:r.statusCode===404});
 r=await request('/api/deliverables',{method:'POST',headers:{cookie},body:{projectId:'p1',chatId:managedId,messageId:managedRenamed.messages.at(-1).id,kind:'message'}});const managedPin=JSON.parse(r.text());
 const restoreAction=managedRenamed.messages.at(-1).actions.find(action=>action.backupId);
 const actualRename=fs.rename;let reachedRestore,releaseRestore;
 const restoreReached=new Promise(resolve=>{reachedRestore=resolve}),restoreReleased=new Promise(resolve=>{releaseRestore=resolve});
 fs.rename=async(from,to)=>{if(to===path.join(fileRoot,'agent.md')){reachedRestore();await restoreReleased}return actualRename(from,to)};
 let restoreResponse,renameResponse,deleteResponse,renameDone=false,deleteDone=false;
 try{
  const restoreJob=request('/api/file/restore',{method:'POST',headers:{cookie},body:{projectId:'p1',rootId:'project',path:restoreAction.path,hash:restoreAction.hash,backupId:restoreAction.backupId,chatId:managedId,actionId:restoreAction.id}});
  await Promise.race([restoreReached,sleep(3000).then(()=>{throw new Error('Restore did not reach atomic save')})]);
  const renameJob=request('/api/conversation/rename',{method:'POST',headers:{cookie},body:{projectId:'p1',id:managedId,name:'Après restauration'}}).then(value=>{renameDone=true;return value});
  await sleep(10);
  const deleteJob=request('/api/conversation/delete',{method:'POST',headers:{cookie},body:{projectId:'p1',id:managedId}}).then(value=>{deleteDone=true;return value});
  await sleep(20);findings.push({test:'conversation rename and delete wait for an already accepted file restoration',pass:!renameDone&&!deleteDone});
  releaseRestore();[restoreResponse,renameResponse,deleteResponse]=await Promise.all([restoreJob,renameJob,deleteJob]);
 }finally{releaseRestore();fs.rename=actualRename}
 findings.push({test:'file restoration finishes before rename and deletion without stale snapshot resurrection',pass:restoreResponse.statusCode===200&&renameResponse.statusCode===200&&JSON.parse(renameResponse.text()).conversation.name==='Après restauration'&&JSON.parse(renameResponse.text()).conversation.messages.at(-1).actions.find(action=>action.id===restoreAction.id).restored===true&&deleteResponse.statusCode===200&&JSON.parse(deleteResponse.text()).deleted===true});
 const deletedPath=path.join(root,'data','chats',managedId+'.json');let deletedFileExists=true;try{await fs.stat(deletedPath)}catch(error){if(error.code==='ENOENT')deletedFileExists=false;else throw error}
 r=await request('/api/conversation?projectId=p1&id='+managedId,{headers:{cookie}});const deletedRead=r.statusCode;
 const deletedList=JSON.parse((await request('/api/sessions?projectId=p1',{headers:{cookie}})).text()).sessions;
 r=await request('/api/chat-request?projectId=p1&requestId='+managedRequest,{headers:{cookie}});
 findings.push({test:'web deletion removes only its JSON cache list entry and request receipt',pass:!deletedFileExists&&deletedRead===404&&!deletedList.some(item=>item.id===managedId)&&r.statusCode===404});
 r=await request('/api/deliverable/download?projectId=p1&id='+managedPin.id,{headers:{cookie}});
 const retainedOther=await request('/api/conversation?projectId='+unassigned+'&id='+moveWebId,{headers:{cookie}});
 findings.push({test:'web deletion preserves pinned deliverable copies project files backups and other conversations',pass:r.statusCode===200&&r.text()==='Fichier modifié.'&&retainedOther.statusCode===200&&await fs.readFile(path.join(fileRoot,'agent.md'),'utf8')==='before'&&await fs.readFile(path.join(otherFileRoot,'agent.md'),'utf8')==='after'&&(await fs.readdir(path.join(root,'data','file-backups'))).length>0});
 const beforeDeletedRetry=upstreamCount;
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL deleted retry',managedId),requestId:runId+'-deleted-retry'}});
 const deletedSend=r.statusCode;r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('NORMAL duplicate deleted request'),requestId:managedRequest}});
 findings.push({test:'neither a stale chat send nor a retry of its deleted request can resurrect that conversation',pass:deletedSend===404&&r.statusCode===409&&upstreamCount===beforeDeletedRetry});
 const raceId=(await send('NORMAL deletion race')).records().find(event=>event.type==='start').id;
 const deletionRace=await Promise.all([request('/api/conversation/delete',{method:'POST',headers:{cookie},body:{projectId:'p1',id:raceId}}),request('/api/conversation/rename',{method:'POST',headers:{cookie},body:{projectId:'p1',id:raceId,name:'Too late'}}),send('NORMAL deleted race send',raceId)]);
 findings.push({test:'concurrent web deletion serializes with rename and message acceptance without resurrecting the file',pass:deletionRace[0].statusCode===200&&deletionRace[1].statusCode===404&&deletionRace[2].statusCode===404&&(await request('/api/conversation?projectId=p1&id='+raceId,{headers:{cookie}})).statusCode===404});
 // The new recoverable-trash route shares the same management lock as edits.
 const trashPath=path.join(fileRoot,'trash.txt');await fs.writeFile(trashPath,'Recover these exact bytes.');
 r=await request('/api/chat',{method:'POST',headers:{cookie},body:{...data('AGENT_TRASH'),fileAccess:true}});const trashChatId=r.records().find(record=>record.type==='start').id,trashAction=r.records().find(record=>record.action?.trashId).action;
 await assert.rejects(fs.stat(trashPath),{code:'ENOENT'});
 findings.push({test:'trash actions retain the project that produced the recoverable backup',pass:trashAction.ok&&trashAction.projectId==='p1'});
 await request('/api/conversation/move',{method:'POST',headers:{cookie},body:{projectId:'p1',id:trashChatId,targetProjectId:'p2'}});
 r=await request('/api/file/restore-trash',{method:'POST',headers:{cookie},body:{projectId:'p2',chatId:trashChatId,actionId:trashAction.id}});
 findings.push({test:'a moved trash journal cannot restore into another project',pass:r.statusCode===409});await assert.rejects(fs.stat(trashPath),{code:'ENOENT'});
 await request('/api/conversation/move',{method:'POST',headers:{cookie},body:{projectId:'p2',id:trashChatId,targetProjectId:'p1'}});
 const originalOpen=fs.open;let releaseTrash,reachedTrash,trashRenameDone=false,trashDeleteDone=false;
 const trashReached=new Promise(resolve=>{reachedTrash=resolve}),trashReleased=new Promise(resolve=>{releaseTrash=resolve});
 fs.open=async(...args)=>{if(args[0]===trashPath&&args[1]==='wx'){reachedTrash();await trashReleased}return originalOpen(...args)};
 let restoredTrash,renamedTrash,deletedTrash;
 try{
  const restoreJob=request('/api/file/restore-trash',{method:'POST',headers:{cookie},body:{projectId:'p1',chatId:trashChatId,actionId:trashAction.id}});
  await Promise.race([trashReached,sleep(3000).then(()=>{throw new Error('Trash restoration did not reach exclusive creation')})]);
  const renameJob=request('/api/conversation/rename',{method:'POST',headers:{cookie},body:{projectId:'p1',id:trashChatId,name:'Restored trash'}}).then(value=>{trashRenameDone=true;return value});await sleep(10);
  const deleteJob=request('/api/conversation/delete',{method:'POST',headers:{cookie},body:{projectId:'p1',id:trashChatId}}).then(value=>{trashDeleteDone=true;return value});await sleep(20);
  findings.push({test:'rename and deletion wait for an accepted trash restoration',pass:!trashRenameDone&&!trashDeleteDone});releaseTrash();
  [restoredTrash,renamedTrash,deletedTrash]=await Promise.all([restoreJob,renameJob,deleteJob]);
 }finally{releaseTrash();fs.open=originalOpen}
 findings.push({test:'trash restoration persists its result before rename and deletion without resurrecting the chat',pass:restoredTrash.statusCode===200&&renamedTrash.statusCode===200&&JSON.parse(renamedTrash.text()).conversation.messages.at(-1).actions.find(action=>action.id===trashAction.id).restored&&deletedTrash.statusCode===200&&(await request('/api/conversation?projectId=p1&id='+trashChatId,{headers:{cookie}})).statusCode===404&&await fs.readFile(trashPath,'utf8')==='Recover these exact bytes.'});
 r=await request('/api/file/restore-trash',{method:'POST',headers:{cookie},body:{projectId:'p1',chatId:trashChatId,actionId:trashAction.id}});findings.push({test:'an old trash restore request cannot recreate a deleted conversation',pass:r.statusCode===404});
 for(const finding of findings)test(finding.test,()=>assert.equal(finding.pass,true,JSON.stringify(finding)));
 if(findings.some(f=>!f.pass))throw new Error('Server regression detected');
}finally{for(const c of upstream)try{c.close()}catch{}await app.close();const resolved=await fs.realpath(root);assert(path.dirname(resolved)===await fs.realpath(os.tmpdir())&&path.basename(resolved).startsWith('bionic-mobile-server-test-'));await fs.rm(resolved,{recursive:true,force:true});}
