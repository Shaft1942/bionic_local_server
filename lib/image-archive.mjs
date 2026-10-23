import {createHash} from 'node:crypto';
import {crc32} from 'node:zlib';

const MAX_IMAGES=20,MAX_IMAGE_BYTES=32*1024*1024,MAX_ARCHIVE_BYTES=128*1024*1024;
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
const failure=(status,message)=>Object.assign(new Error(message),{status});
const invalid=message=>{throw failure(400,message);};
const tooLarge=()=>{throw failure(413,'L’archive dépasse la limite de 128 Mio.');};

function metadata(value){
  if(value===undefined)return{};
  if(!value||typeof value!=='object'||Array.isArray(value))invalid('Métadonnées image invalides.');
  const result={};
  for(const [key,limit]of [['prompt',6000],['workflowId',100],['workflowLabel',200]]){
    if(value[key]===undefined)continue;
    if(typeof value[key]!=='string'||value[key].length>limit)invalid('Métadonnées image invalides.');
    if(key==='workflowId'&&!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(value[key]))invalid('Identifiant de workflow invalide.');
    result[key]=value[key];
  }
  if(value.seed!==undefined){
    if(!Number.isSafeInteger(value.seed)||value.seed<0||value.seed>4294967295)invalid('Seed image invalide.');
    result.seed=value.seed;
  }
  for(const key of ['width','height'])if(value[key]!==undefined){
    if(!Number.isSafeInteger(value[key])||value[key]<=0||value[key]>65535)invalid('Dimensions image invalides.');
    result[key]=value[key];
  }
  if(value.createdAt!==undefined){
    if(!Number.isSafeInteger(value.createdAt)||value.createdAt<0||value.createdAt>8640000000000000)invalid('Date image invalide.');
    result.createdAt=new Date(value.createdAt).toISOString();
  }
  if(value.loras!==undefined){
    if(!Array.isArray(value.loras)||value.loras.length>2)invalid('Liste LoRA invalide.');
    result.loras=value.loras.map(lora=>{
      if(!lora||typeof lora!=='object'||typeof lora.name!=='string'||lora.name.length>512||/[\x00-\x1f]/.test(lora.name)||typeof lora.strength!=='number'||!Number.isFinite(lora.strength)||lora.strength< -2||lora.strength>20)invalid('LoRA invalide.');
      // Model catalog paths are not export paths. Retain the useful filename only.
      const name=lora.name.split(/[\\/]/).at(-1);
      if(!name||name==='.'||name==='..'||name.includes(':'))invalid('Nom LoRA invalide.');
      return{name,strength:lora.strength};
    });
  }
  return result;
}

/**
 * Build a bounded, stored ZIP from already owned and SHA-verified PNG buffers.
 * Filenames are generated from index and job ID; supplied filename is ignored.
 * The UTF-8 manifest exports only whitelisted generation metadata, not owners,
 * engine addresses, source paths, or arbitrary fields from a persisted job.
 * No filesystem access, compression, dependencies, or model calls are involved.
 */
export function createImageArchive(images){
  if(!Array.isArray(images)||images.length<1||images.length>MAX_IMAGES)invalid('Choisis de 1 à 20 images pour l’archive.');
  const ids=new Set(),entries=[],records=[];
  let minimumSize=22+30+46+2*Buffer.byteLength('manifest.json');
  for(let index=0;index<images.length;index++){
    const image=images[index];
    if(!image||typeof image!=='object'||typeof image.id!=='string'||!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(image.id)||ids.has(image.id))invalid('Identifiant image invalide ou répété.');
    ids.add(image.id);
    if(!Buffer.isBuffer(image.buffer)||image.buffer.length<PNG.length||!image.buffer.subarray(0,PNG.length).equals(PNG))invalid('Une image PNG valide est requise.');
    if(image.buffer.length>MAX_IMAGE_BYTES)throw failure(413,'Une image dépasse la limite de 32 Mio.');
    const filename=String(index+1).padStart(2,'0')+'-'+image.id+'.png';
    minimumSize+=30+46+2*Buffer.byteLength(filename)+image.buffer.length;
    if(minimumSize>MAX_ARCHIVE_BYTES)tooLarge();
    const record={id:image.id,filename,sizeBytes:image.buffer.length,...metadata(image.metadata)};
    entries.push({filename,bytes:image.buffer});records.push(record);
  }
  // Hash after cheap size checks so a rejected selection is never copied or
  // hashed as a large archive. Buffer contents themselves remain unchanged.
  for(let index=0;index<entries.length;index++)records[index].sha256=createHash('sha256').update(entries[index].bytes).digest('hex');
  const manifest=Buffer.from(JSON.stringify({schemaVersion:1,images:records},null,2)+'\n','utf8');
  if(minimumSize+manifest.length>MAX_ARCHIVE_BYTES)tooLarge();
  entries.push({filename:'manifest.json',bytes:manifest});
  const local=[],central=[];let offset=0;
  for(const {filename,bytes}of entries){
    const name=Buffer.from(filename,'utf8'),checksum=crc32(bytes);
    const header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x0800,6);header.writeUInt16LE(33,12);
    header.writeUInt32LE(checksum,14);header.writeUInt32LE(bytes.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
    local.push(header,name,bytes);
    const directoryEntry=Buffer.alloc(46);
    directoryEntry.writeUInt32LE(0x02014b50);directoryEntry.writeUInt16LE(20,4);directoryEntry.writeUInt16LE(20,6);directoryEntry.writeUInt16LE(0x0800,8);directoryEntry.writeUInt16LE(33,14);
    directoryEntry.writeUInt32LE(checksum,16);directoryEntry.writeUInt32LE(bytes.length,20);directoryEntry.writeUInt32LE(bytes.length,24);directoryEntry.writeUInt16LE(name.length,28);directoryEntry.writeUInt32LE(offset,42);
    central.push(directoryEntry,name);offset+=header.length+name.length+bytes.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end],offset+directory.length+end.length);
}
