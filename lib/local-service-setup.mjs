import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash, randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {launcherPath, validateLocalServiceProfiles} from './local-service-config.mjs';

const execute=promisify(execFile), ids=['bionic','comfyui'];
const fields=id=>id==='bionic'?['cliPath','apiInfoPath','appPath']:['pythonPath','entryPath','workingDirectory'];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,allowed)=>object(value)&&Object.keys(value).every(key=>allowed.includes(key));
const error=(code,status=400)=>Object.assign(new Error(code),{code,status});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rawProfile=(id,value)=>Object.fromEntries(fields(id).filter(key=>typeof value?.[key]==='string').map(key=>[key,value[key]]));
function localPath(value){if(typeof value!=='string'||!path.isAbsolute(value)||/^[\\/]{2}|[\0\r\n]/.test(value)||value.length>2048)throw error('setup-invalid-path');return path.resolve(value);}

export function createLocalServiceSetup({root,connections,platform=process.platform,homeDirectory=os.homedir(),discoveryRoots,chooseDirectory}={}){
  const filename=path.join(root,'config.launchers.local.json');
  let pending=false,selecting=false;
  const connection=()=>typeof connections==='function'?connections():connections||{};
  async function readDocument(){
    await launcherPath(root,{directory:true});
    try{
      await launcherPath(filename);
      const bytes=await fs.readFile(filename);if(bytes.length>32768)throw error('setup-invalid-config');
      const document=JSON.parse(bytes.toString('utf8'));
      if(!exact(document,['version','services'])||document.version!==1||!exact(document.services,ids))throw error('setup-invalid-config');
      return document;
    }catch(e){if(e.code==='ENOENT')return{version:1,services:{}};if(e.status)throw e;throw error('setup-invalid-config');}
  }
  async function snapshot(){const document=await readDocument();return{canConfigure:platform==='win32',revision:hash(document),services:ids.map(id=>({id,configured:document.services[id]?.enabled===true,profile:rawProfile(id,document.services[id])}))};}
  async function validate(id,profile){
    if(!ids.includes(id)||!exact(profile,fields(id)))throw error('setup-invalid-profile');
    for(const value of Object.values(profile))localPath(value);
    const document={version:1,services:{[id]:{...profile,enabled:true,type:id==='bionic'?'bionic-cli':'comfyui-python',exclusiveControl:true}}};
    const checked=await validateLocalServiceProfiles({document,connections:connection()});
    if(!checked[id])throw error('setup-invalid-profile');
    return document.services[id];
  }
  const standardRoots=id=>discoveryRoots?.filter(item=>item.serviceId===id).map(item=>item.directory)??(id==='bionic'
    ?[process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs','Bionic'),process.env.ProgramFiles&&path.join(process.env.ProgramFiles,'Bionic')].filter(Boolean)
    :[path.join(homeDirectory,'ComfyUI'),process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs','ComfyUI')].filter(Boolean));
  async function discover(input){
    if(platform!=='win32')throw error('setup-platform-unsupported',409);
    if(!exact(input,['serviceId','installationDirectory'])||!ids.includes(input.serviceId))throw error('setup-invalid-request');
    const id=input.serviceId,roots=input.installationDirectory?[localPath(input.installationDirectory)]:standardRoots(id);
    const candidates=[],seen=new Set();
    const offer=async profile=>{try{const valid=await validate(id,profile),key=hash(valid);if(!seen.has(key)){seen.add(key);const label=id==='bionic'?path.basename(path.dirname(profile.appPath)):path.basename(profile.workingDirectory)+' · '+path.relative(profile.workingDirectory,profile.pythonPath);candidates.push({id:key.slice(0,24),label,profile:rawProfile(id,valid)});}}catch{/* An installation is offered only when every selected source validates. */}};
    for(const directory of roots.slice(0,12)){
      try{await launcherPath(localPath(directory),{directory:true});}catch{continue;}
      if(id==='bionic'){
        await offer({appPath:path.join(directory,'Bionic.exe'),cliPath:path.join(homeDirectory,'.lmstudio','bin','lms.exe'),apiInfoPath:path.join(homeDirectory,'.lmstudio','apps','bionic','.internal','http-server.json')});
      }else{
        const entries=['','ComfyUI','ComfyUI/ComfyUI','resources/ComfyUI','ComfyUI-Installs/ComfyUI','ComfyUI-Installs/ComfyUI/ComfyUI'].map(relative=>path.join(directory,relative));
        for(const workingDirectory of entries){
          const pythons=[path.join(workingDirectory,'.venv','Scripts','python.exe'),path.join(directory,'.venv','Scripts','python.exe'),path.join(directory,'python_embeded','python.exe'),path.join(directory,'python_embedded','python.exe')];
          for(const pythonPath of [...new Set(pythons)])await offer({pythonPath,entryPath:path.join(workingDirectory,'main.py'),workingDirectory});
        }
      }
    }
    return{serviceId:id,candidates,reasonCode:candidates.length?null:'setup-no-installation'};
  }
  async function pick(input){
    if(!exact(input,['serviceId'])||!ids.includes(input.serviceId))throw error('setup-invalid-request');
    if(platform!=='win32')throw error('setup-platform-unsupported',409);
    if(selecting)throw error('setup-busy',409);
    selecting=true;
    try{
    let directory;
    if(chooseDirectory)directory=await chooseDirectory(input.serviceId);
    else{
      try{const result=await execute('powershell.exe',['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../scripts/select-local-service-installation.ps1',import.meta.url)),'-ServiceId',input.serviceId],{windowsHide:true,shell:false,timeout:120000,maxBuffer:8192});directory=result.stdout.trim();}
      catch{throw error('setup-picker-unavailable',409);}
    }
    if(!directory)return{serviceId:input.serviceId,cancelled:true,candidates:[]};
    return discover({serviceId:input.serviceId,installationDirectory:localPath(directory)});
    }finally{selecting=false;}
  }
  async function save(input){
    if(platform!=='win32')throw error('setup-platform-unsupported',409);
    if(!exact(input,['serviceId','expectedRevision','exclusiveControl','profile'])||!ids.includes(input.serviceId)||input.exclusiveControl!==true||typeof input.expectedRevision!=='string')throw error('setup-invalid-request');
    if(pending)throw error('setup-busy',409);
    pending=true;let temporary;
    try{
      const previous=await readDocument();if(hash(previous)!==input.expectedRevision)throw error('setup-stale-revision',409);
      const profile=await validate(input.serviceId,input.profile);
      const next={...previous,services:{...previous.services,[input.serviceId]:profile}};
      temporary=filename+'.'+randomUUID()+'.tmp';
      const handle=await fs.open(temporary,'wx',0o600);
      try{await handle.writeFile(JSON.stringify(next,null,2)+'\n');await handle.sync();}finally{await handle.close();}
      if(hash(await readDocument())!==input.expectedRevision)throw error('setup-stale-revision',409);
      // Repeat source validation immediately before the atomic replacement.
      await validate(input.serviceId,input.profile);
      await fs.rename(temporary,filename);temporary=undefined;
      return{saved:true,...await snapshot()};
    }finally{if(temporary)await fs.unlink(temporary).catch(()=>{});pending=false;}
  }
  return{snapshot,discover,pick,save};
}
