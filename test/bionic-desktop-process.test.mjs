import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { createBionicDesktopProcess } from '../lib/bionic-desktop-process.mjs';

const identity={pid:4321,createdAt:'638000000000000000',executable:'C:\\fixture\\Bionic.exe'};
test('native helper receives fixed encoded script and data, never a shell command from receipt text',async()=>{
  const calls=[],special={...identity,executable:'C:\\fixture\\$(not-a-command) Bionic.exe'};
  const helper=createBionicDesktopProcess({platform:'win32',execFileImpl:async(file,args,options)=>{
    calls.push({file,args,options});const intent=JSON.parse(Buffer.from(options.env.CANAE_DESKTOP_INTENT,'base64'));
    assert.equal(intent.executable,special.executable);assert.equal(intent.pid,4321);assert.equal(options.shell,false);assert.equal(options.windowsHide,true);
    assert.deepEqual(args.slice(0,3),['-NoProfile','-NonInteractive','-EncodedCommand']);
    assert(!Buffer.from(args[3],'base64').toString('utf16le').includes(special.executable));
    return{stdout:JSON.stringify({state:intent.action==='stop'?'stopped':'running',createdAt:identity.createdAt,executable:special.executable,effectAttempted:intent.action==='stop'})};
  }});
  assert.deepEqual(await helper.capture({pid:4321,executable:special.executable}),special);
  assert.deepEqual(await helper.inspect(special),{state:'running'});assert.deepEqual(await helper.stop(special),{state:'stopped'});assert.equal(calls.length,3);
});
test('invalid identity, absent authority and unsupported platform refuse before native execution',async()=>{
  let calls=0;const execFileImpl=async()=>{calls++;throw Error('Must not run');};
  const helper=createBionicDesktopProcess({platform:'win32',execFileImpl});
  for(const changed of [{...identity,pid:0},{...identity,pid:2**32},{...identity,createdAt:'not-a-native-time'},{...identity,executable:'relative.exe'},{...identity,executable:'C:\\bad\npath'}])await assert.rejects(helper.stop(changed),{code:'desktop_identity_unconfirmed',effectAttempted:false});
  await assert.rejects(createBionicDesktopProcess({platform:'linux',execFileImpl}).stop(identity),{effectAttempted:false});assert.equal(calls,0);
});
test('native identity mismatch is a no-effect refusal; loss of termination receipt remains uncertain',async()=>{
  const mismatch=createBionicDesktopProcess({platform:'win32',execFileImpl:async()=>({stdout:'{"state":"identity_changed","effectAttempted":false}'})});
  await assert.rejects(mismatch.stop(identity),{code:'desktop_identity_changed',effectAttempted:false});
  let calls=0;const lost=createBionicDesktopProcess({platform:'win32',execFileImpl:async()=>{calls++;throw Error('Lost native response');}});
  await assert.rejects(lost.stop(identity),{code:'desktop_status_unconfirmed',effectAttempted:true});assert.equal(calls,1);
  const busy=createBionicDesktopProcess({platform:'win32',execFileImpl:async()=>({stdout:'{"state":"connections_active","effectAttempted":false}'})});
  await assert.rejects(busy.stop(identity,{apiPort:1235}),{code:'desktop_connections_active',effectAttempted:false});
  const malformed=createBionicDesktopProcess({platform:'win32',execFileImpl:async()=>({stdout:'null'})});
  await assert.rejects(malformed.stop(identity),{code:'desktop_status_unconfirmed',effectAttempted:true});
});
test('native identity and exit confirmation operate only on a harmless Node child owned by this test',{skip:process.platform!=='win32',timeout:60000},async()=>{
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
  try{
    await once(child,'spawn');const exited=once(child,'exit');
    const helper=createBionicDesktopProcess();const own=await helper.capture({pid:child.pid,executable:process.execPath});
    assert.match(own.createdAt,/^\d+$/);assert.equal((await helper.inspect(own)).state,'running');
    await assert.rejects(helper.stop({...own,createdAt:String(BigInt(own.createdAt)+1n)}),{code:'desktop_identity_changed',effectAttempted:false});
    assert.equal((await helper.inspect(own)).state,'running');
    const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const apiPort=server.address().port;
    try{await assert.rejects(helper.stop(own,{apiPort}),{code:'desktop_connections_active',effectAttempted:false});assert.equal((await helper.inspect(own)).state,'running');}
    finally{await new Promise(resolve=>server.close(resolve));}
    assert.equal((await helper.stop(own,{apiPort})).state,'stopped');await exited;
    assert.equal((await helper.inspect(own)).state,'stopped');
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();}
});
