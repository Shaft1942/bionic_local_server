import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const componentSource=await fs.readFile(new URL('../public/comfy-images.js',import.meta.url),'utf8');
const source = (await Promise.all(['i18n.js', 'locales/fr/components.js', 'locales/en/components.js'].map(file => fs.readFile(new URL('../public/'+file, import.meta.url), 'utf8')))).join('\n') + '\n' + componentSource;
function fixture(intercept=()=>undefined){
  const state={authenticated:true,authEpoch:1,chat:{id:'web-test',projectId:'test-project',messages:[]}};let redrawn=0,requests=[];
  function node(tag,className='',text=''){return {tag,className,text,children:[],events:{},append(...children){this.children.push(...children);},setAttribute(name,value){this[name]=value;},addEventListener(name,fn){this.events[name]=fn;},dataset:{}};}
  const context=vm.createContext({URLSearchParams,document:{hidden:false,addEventListener(){}},window:{addEventListener(){}},setInterval(){}});
  vm.runInContext(source,context);
  const calls=[];let serial=0;
  const view=context.createImageGenerationView({node,getState:()=>state,redraw:()=>redrawn++,newRequestId:()=> '11111111-1111-4111-8111-'+String(++serial).padStart(12,'0'),api:async(url,options)=>{requests.push(url);calls.push({url,body:options?.body?JSON.parse(options.body):undefined});const result=intercept(url,options);if(result!==undefined)return result;return {...state.chat.messages[0].imageGenerations[0],status:'succeeded',image:{width:1024,height:1024}};}});
  return {state,view,get redrawn(){return redrawn;},requests,calls};
}
const descendants=node=>[node,...(node.children||[]).flatMap(descendants)];
const job={id:'test-job',status:'queued',width:1024,height:1024,seed:42,prompt:'A blue teapot <not HTML>'};
test('pending card becomes an inline image with authenticated relative source, alt and download',async()=>{
  const f=fixture(),message={id:'test-message',imageGenerations:[{...job}]};f.state.chat.messages.push(message);
  const pending=f.view.card(message.imageGenerations[0],f.state.chat,message);assert.equal(pending.children.some(n=>n.tag==='img'),false);
  await f.view.poll();assert.equal(f.redrawn,1);assert.match(f.requests[0],/^\/api\/comfy\/generation\?/);
  const card=f.view.card(message.imageGenerations[0],f.state.chat,message),image=card.children.find(n=>n.tag==='img'),download=descendants(card).find(n=>n.tag==='a');
  assert(image);assert.equal(image.alt,job.prompt);assert.equal(image.width,1024);assert.match(image.src,/^\/api\/comfy\/image\?/);assert.match(image.src,/messageId=test-message/);assert(!image.src.includes('8188'));assert.match(download.href,/download=1/);assert(download.download.endsWith('.png'));
  image.events.error();assert.match(card.children[0].textContent,/indisponible/);
});
test('offline or terminal states do not trigger another request or fabricate an image',async()=>{
  const f=fixture();f.state.chat.messages.push({id:'reply',imageGenerations:[{...job,status:'unknown',error:'Submission uncertain'}]});
  await f.view.poll();assert.equal(f.requests.length,0);
  const card=f.view.card(f.state.chat.messages[0].imageGenerations[0],f.state.chat,{id:'reply'});assert.equal(card.children.some(n=>n.tag==='img'),false);
  f.state.authenticated=false;f.state.chat.messages[0].imageGenerations[0].status='queued';await f.view.poll();assert.equal(f.requests.length,0);
});

test('resource waiting is visible and continues polling without resubmitting an image',async()=>{
  const f=fixture();f.state.chat.messages.push({id:'waiting-message',imageGenerations:[{...job,status:'waiting-resource'}]});
  const card=f.view.card(f.state.chat.messages[0].imageGenerations[0],f.state.chat,f.state.chat.messages[0]);
  assert.match(card.children[0].text,/attente.*ressource/);
  await f.view.poll();assert.equal(f.requests.length,1);assert.match(f.requests[0],/^\/api\/comfy\/generation\?/);assert.equal(f.redrawn,1);
});

test('series cards identify their image and queue position without exposing another conversation',()=>{
  const f=fixture(),message={id:'series-message'};
  const queued=f.view.card({...job,seriesId:'series-a',seriesIndex:2,seriesTotal:3,queuePosition:4},f.state.chat,message);
  assert.match(queued.children[0].text,/Série · image 2\/3/);assert.match(queued.children[0].text,/file commune.*Position 4/);
  const running=f.view.card({...job,status:'running',seriesIndex:2,seriesTotal:3,queuePosition:4},f.state.chat,message);
  assert.match(running.children[0].text,/génère/);assert.doesNotMatch(running.children[0].text,/Position/);
  const terminal=f.view.card({...job,status:'succeeded',seriesIndex:3,seriesTotal:3,queuePosition:1,image:{}},f.state.chat,message);
  assert.match(terminal.children[0].text,/image 3\/3 · Image générée/);assert.doesNotMatch(terminal.children[0].text,/Position/);
  const invalid=f.view.card({...job,seriesIndex:99,seriesTotal:3,queuePosition:-1},f.state.chat,message);
  assert.doesNotMatch(invalid.children[0].text,/Série|Position/);
});

test('cards show measured ComfyUI duration and the policy frozen for their own image',()=>{
  const f=fixture(),message={id:'reply'};
  const card=f.view.card({...job,status:'succeeded',image:{},modelPolicy:'alternate',executionDurationMs:43580},f.state.chat,message);
  assert.match(card.children.find(child=>child.tag==='figcaption').text,/ComfyUI : 43,6 s/);
  assert.match(card.children.find(child=>child.text.startsWith('Mode de cette demande')).text,/le texte attend pendant chaque rendu/);
  for(const executionDurationMs of [undefined,-1,Infinity]){
    const missing=f.view.card({...job,executionDurationMs},f.state.chat,message);
    assert.doesNotMatch(missing.children.find(child=>child.tag==='figcaption').text,/ComfyUI :/);
  }
});

test('series cards support two to five images and still read historical series of three',()=>{
  const f=fixture(),message={id:'reply'};
  for(const total of [2,3,4,5]){
    const card=f.view.card({...job,seriesIndex:total,seriesTotal:total},f.state.chat,message);
    assert.match(card.children[0].text,new RegExp('Série · image '+total+'/'+total));
  }
  for(const [seriesIndex,seriesTotal] of [[1,1],[6,6],[3,2],[0,4]]){
    const card=f.view.card({...job,seriesIndex,seriesTotal},f.state.chat,message);assert.doesNotMatch(card.children[0].text,/Série · image/);
  }
});

test('cancellation is offered only for locally queued jobs with no ComfyUI prompt',async()=>{
  const f=fixture(route=>route==='/api/comfy/generation/cancel'?{...job,status:'cancelled',queuedLocally:false}:undefined),message={id:'reply'};
  for(const extra of [{status:'running',queuedLocally:true},{queuedLocally:false},{queuedLocally:true,promptId:'submitted'}, {status:'unknown',queuedLocally:true}]){
    assert.equal(descendants(f.view.card({...job,...extra},f.state.chat,message)).some(node=>node.text==='Annuler cette image'),false);
  }
  const pending={...job,queuedLocally:true};const card=f.view.card(pending,f.state.chat,message),cancel=descendants(card).find(node=>node.text==='Annuler cette image');assert(cancel);
  await cancel.events.click();assert.equal(f.calls[0].url,'/api/comfy/generation/cancel');assert.equal(f.calls[0].body.jobId,job.id);assert.equal(pending.status,'cancelled');
});

test('retry keeps a stable request id after an uncertain response and never mutates its source image',async()=>{
  let failures=1;const f=fixture(route=>route==='/api/comfy/generation/retry'?(failures-- >0?Promise.reject(Error('Connection uncertain')):{job:{...job,id:'new-job',status:'queued'},chatId:'web-test',messageId:'new-message'}):undefined),message={id:'reply'},source={...job,status:'failed'};
  for(const status of ['queued','running','unknown'])assert.equal(descendants(f.view.card({...job,status},f.state.chat,message)).some(node=>node.text==='Relancer · même seed'),false);
  const card=f.view.card(source,f.state.chat,message),retry=descendants(card).find(node=>node.text==='Relancer · même seed');await retry.events.click();await retry.events.click();
  assert.equal(f.calls[0].body.requestId,f.calls[1].body.requestId);assert.equal(f.calls[1].body.seedMode,'same');assert.equal(source.status,'failed');assert.equal(source.id,job.id);
  await retry.events.click();assert.notEqual(f.calls[2].body.requestId,f.calls[1].body.requestId);
});

test('series ZIP contains only available images and gallery selection rejects a twenty-first item',()=>{
  const f=fixture(),message={id:'reply'},ready={...job,status:'succeeded',image:{},seriesId:'series-a',seriesTotal:3,seriesIndex:1};
  const group=f.view.gallery([ready,{...ready,id:'second',seriesIndex:2},{...ready,id:'third',seriesIndex:3,status:'queued',image:null}],f.state.chat,message);
  const zip=descendants(group).find(node=>node.tag==='a'&&node.text.includes('ZIP'));const params=new URL(zip.href,'http://test').searchParams;assert.deepEqual(params.getAll('jobId'),[job.id,'second']);
  const all=Array.from({length:21},(_,i)=>({...ready,id:'image-'+i})),gallery=f.view.gallery(all,null,null,{projectOnly:true,projectId:'test-project'}),inputs=descendants(gallery).filter(node=>node.tag==='input');
  for(const input of inputs){input.checked=true;input.events.change();}assert.equal(inputs[20].checked,false);
  const selectedZip=descendants(gallery).find(node=>node.tag==='a'&&node.text.includes('ZIP'));assert.equal(new URL(selectedZip.href,'http://test').searchParams.getAll('jobId').length,20);
  assert.equal(descendants(gallery).some(node=>node.text==='Relancer · même seed'),false);
});

test('tracking failure displays uncertainty and recovers on next poll',async()=>{
  let offline=true;const f=fixture(()=>{if(offline)throw Error('Offline');});
  const message={id:'test-message',imageGenerations:[{...job,status:'running'}]};f.state.chat.messages.push(message);
  await f.view.poll();assert.equal(message.imageGenerations[0].trackingUnavailable,true);
  assert.doesNotMatch(f.view.card(message.imageGenerations[0],f.state.chat,message).children[0].text,/génère ton image/);
  offline=false;await f.view.poll();assert.equal(message.imageGenerations[0].status,'succeeded');assert.equal(message.imageGenerations[0].trackingUnavailable,undefined);
});
