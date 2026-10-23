import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../public/comfy-images.js',import.meta.url),'utf8');
function fixture(){
  const state={authenticated:true,authEpoch:1,chat:{id:'web-test',projectId:'test-project',messages:[]}};let redrawn=0,requests=[];
  function node(tag,className='',text=''){return {tag,className,text,children:[],events:{},append(...children){this.children.push(...children);},setAttribute(name,value){this[name]=value;},addEventListener(name,fn){this.events[name]=fn;},dataset:{}};}
  const context=vm.createContext({URLSearchParams,document:{hidden:false,addEventListener(){}},window:{addEventListener(){}},setInterval(){}});
  vm.runInContext(source,context);
  const view=context.createImageGenerationView({node,getState:()=>state,redraw:()=>redrawn++,api:async url=>{requests.push(url);return {...state.chat.messages[0].imageGenerations[0],status:'succeeded',image:{width:1024,height:1024}};}});
  return {state,view,get redrawn(){return redrawn;},requests};
}
const job={id:'test-job',status:'queued',width:1024,height:1024,seed:42,prompt:'A blue teapot <not HTML>'};
test('pending card becomes an inline image with authenticated relative source, alt and download',async()=>{
  const f=fixture(),message={id:'test-message',imageGenerations:[{...job}]};f.state.chat.messages.push(message);
  const pending=f.view.card(message.imageGenerations[0],f.state.chat,message);assert.equal(pending.children.some(n=>n.tag==='img'),false);
  await f.view.poll();assert.equal(f.redrawn,1);assert.match(f.requests[0],/^\/api\/comfy\/generation\?/);
  const card=f.view.card(message.imageGenerations[0],f.state.chat,message),image=card.children.find(n=>n.tag==='img'),download=card.children.find(n=>n.tag==='a');
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
