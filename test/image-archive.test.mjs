import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {crc32} from 'node:zlib';
import {createImageArchive} from '../lib/image-archive.mjs';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function png(text='synthetic PNG fixture'){return Buffer.concat([signature,Buffer.from(text,'utf8')]);}
const image=(id='job-one',extra={})=>({id,buffer:png(String(id)),...extra});
function extract(archive){
  const end=archive.length-22;assert.equal(archive.readUInt32LE(end),0x06054b50);
  assert.equal(archive.readUInt16LE(end+4),0);assert.equal(archive.readUInt16LE(end+6),0);
  const count=archive.readUInt16LE(end+10),size=archive.readUInt32LE(end+12),start=archive.readUInt32LE(end+16);
  assert.equal(count,archive.readUInt16LE(end+8));assert.equal(start+size,end);assert.equal(archive.readUInt16LE(end+20),0);
  const files=new Map();let cursor=start;
  for(let index=0;index<count;index++){
    assert.equal(archive.readUInt32LE(cursor),0x02014b50);
    assert.equal(archive.readUInt16LE(cursor+8),0x0800);assert.equal(archive.readUInt16LE(cursor+10),0,'ZIP entries must be stored');
    const checksum=archive.readUInt32LE(cursor+16),length=archive.readUInt32LE(cursor+20),nameLength=archive.readUInt16LE(cursor+28),extraLength=archive.readUInt16LE(cursor+30),commentLength=archive.readUInt16LE(cursor+32),offset=archive.readUInt32LE(cursor+42);
    assert.equal(length,archive.readUInt32LE(cursor+24));
    const name=archive.toString('utf8',cursor+46,cursor+46+nameLength);
    assert(!files.has(name));assert(!name.includes('/')&&!name.includes('\\'));assert(!name.includes('..'));
    assert.equal(archive.readUInt32LE(offset),0x04034b50);assert.equal(archive.readUInt16LE(offset+6),0x0800);assert.equal(archive.readUInt16LE(offset+8),0);
    assert.equal(archive.readUInt32LE(offset+14),checksum);assert.equal(archive.readUInt32LE(offset+18),length);assert.equal(archive.readUInt32LE(offset+22),length);
    assert.equal(archive.toString('utf8',offset+30,offset+30+archive.readUInt16LE(offset+26)),name);
    const dataStart=offset+30+archive.readUInt16LE(offset+26)+archive.readUInt16LE(offset+28),bytes=archive.subarray(dataStart,dataStart+length);
    assert.equal(crc32(bytes),checksum);assert(dataStart+length<=start);files.set(name,bytes);
    cursor+=46+nameLength+extraLength+commentLength;
  }
  assert.equal(cursor,end);return files;
}

test('stored ZIP central directory extracts original PNG bytes with matching CRC and SHA-256 manifest',()=>{
  const images=[image(),image('job-two')],before=images.map(x=>Buffer.from(x.buffer));
  const zip=createImageArchive(images),files=extract(zip),manifest=JSON.parse(files.get('manifest.json').toString('utf8'));
  assert.equal(manifest.schemaVersion,1);assert.equal(files.size,3);
  assert.deepEqual([...files.keys()],['01-job-one.png','02-job-two.png','manifest.json']);
  for(const [index,source]of images.entries()){
    const record=manifest.images[index];assert.equal(record.id,source.id);assert.equal(record.sizeBytes,source.buffer.length);
    assert.deepEqual(files.get(record.filename),source.buffer);assert.deepEqual(source.buffer,before[index]);
    assert.equal(record.sha256,createHash('sha256').update(source.buffer).digest('hex'));
  }
  assert.deepEqual(createImageArchive(images),zip,'archive contents must not depend on local clock or locale');
});

test('manifest keeps Unicode metadata while omitting private and engine fields and reducing LoRA names to basenames',()=>{
  const prompt='Un vélo près d’un café ☕ — 日本語 et emoji 🚲\nLumière douce.';
  const source=image('job-unicode',{filename:'../../private/outside.png',metadata:{prompt,seed:4294967295,width:832,height:1216,workflowId:'krea2_turbo',workflowLabel:'Kréa 2 — 写真',createdAt:1792756800000,loras:[{name:'C:\\models\\privé\\éclat.safetensors',strength:0.7},{name:'/private/models/色彩.safetensors',strength:-0.2}],comfyUrl:'http://private-engine:8188',owner:{projectId:'private-project'},privatePath:'C:\\secret\\file',arbitrary:{token:'never export'}}});
  const files=extract(createImageArchive([source])),raw=files.get('manifest.json').toString('utf8'),record=JSON.parse(raw).images[0];
  assert.equal(record.prompt,prompt);assert.equal(record.workflowLabel,'Kréa 2 — 写真');assert.equal(record.seed,4294967295);
  assert.equal(record.createdAt,new Date(source.metadata.createdAt).toISOString());
  assert.deepEqual(record.loras,[{name:'éclat.safetensors',strength:0.7},{name:'色彩.safetensors',strength:-0.2}]);
  assert.equal(record.filename,'01-job-unicode.png');assert.equal(record.width,832);assert.equal(record.height,1216);
  for(const secret of ['private-engine','private-project','privatePath','never export','outside.png','C:','/private/','privé'])assert(!raw.includes(secret));
});

test('caller filenames never become archive paths and malformed or repeated job IDs are refused',()=>{
  for(const filename of ['../../escape.png','C:\\private\\image.png','/root/image.png','subfolder/image.png','image\u0000.png']){
    const files=extract(createImageArchive([image('safe-id',{filename})]));assert(files.has('01-safe-id.png'));assert.equal(files.size,2);
  }
  for(const id of ['../escape','/absolute','C:\\drive','nested/id','name.png','..','',null,'x'.repeat(101)])assert.throws(()=>createImageArchive([image(id)]),{status:400});
  assert.throws(()=>createImageArchive([image(),image()]),{status:400});
});

test('image count is bounded at twenty and entries are numbered in selection order',()=>{
  const images=Array.from({length:20},(_,index)=>image('job-'+index));
  const files=extract(createImageArchive(images));assert.equal(files.size,21);assert(files.has('20-job-19.png'));
  for(const input of [undefined,null,{},[],[...images,image('twenty-one')],[null]])assert.throws(()=>createImageArchive(input),{status:400});
});

test('invalid buffers and malformed exported metadata fail with a handled 400 status',()=>{
  for(const buffer of [null,'PNG',new Uint8Array(signature),Buffer.alloc(0),Buffer.from('not a PNG')])assert.throws(()=>createImageArchive([image('x',{buffer})]),{status:400});
  for(const metadata of [null,[],{prompt:4},{prompt:'x'.repeat(6001)},{seed:-1},{seed:2**32},{width:0},{height:1.5},{workflowId:'../private'},{createdAt:'yesterday'},{createdAt:Infinity},{loras:[{name:'../',strength:1}]},{loras:[{name:'style',strength:Infinity}]},{loras:Array(3).fill({name:'style',strength:1})}])assert.throws(()=>createImageArchive([image('x',{metadata})]),{status:400});
});

test('per-image and final ZIP limits refuse oversized input without allocating a large output',()=>{
  // A single reusable 32 MiB buffer exercises the aggregate bound, avoiding a
  // 128 MiB fixture allocation and preventing output creation before rejection.
  const buffer=Buffer.alloc(32*1024*1024+1);signature.copy(buffer);
  assert.throws(()=>createImageArchive([image('too-large',{buffer})]),{status:413});
  const atImageLimit=buffer.subarray(0,32*1024*1024);
  assert.throws(()=>createImageArchive(Array.from({length:4},(_,index)=>image('total-'+index,{buffer:atImageLimit}))),{status:413},'the final ZIP includes headers and its manifest in the 128 MiB cap');
  assert.equal(buffer.length,32*1024*1024+1);assert.deepEqual(buffer.subarray(0,8),signature);
});
