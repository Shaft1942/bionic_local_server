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
  await assert.rejects(lost.stop(identity),{code:'desktop_helper_failed',effectAttempted:true});assert.equal(calls,1);
  const busy=createBionicDesktopProcess({platform:'win32',execFileImpl:async()=>({stdout:'{"state":"connections_active","effectAttempted":false}'})});
  await assert.rejects(busy.stop(identity,{apiPort:1235}),{code:'desktop_connections_active',effectAttempted:false});
  const malformed=createBionicDesktopProcess({platform:'win32',execFileImpl:async()=>({stdout:'null'})});
  await assert.rejects(malformed.stop(identity),{code:'desktop_status_unconfirmed',effectAttempted:true});
});
test('cold helper budget is bounded independently from native exit wait and never repeats a call',async()=>{
  const calls=[];
  const helper=createBionicDesktopProcess({platform:'win32',execFileImpl:async(_file,_args,options)=>{
    const intent=JSON.parse(Buffer.from(options.env.CANAE_DESKTOP_INTENT,'base64'));calls.push({budget:options.timeout,intent});
    return{stdout:JSON.stringify({state:intent.action==='stop'?'stopped':'running',createdAt:identity.createdAt,executable:identity.executable})};
  }});
  await helper.capture(identity);await helper.inspect(identity);await helper.stop(identity,{timeoutMs:35000});await helper.stop(identity,{timeoutMs:1});
  assert.deepEqual(calls.map(value=>value.budget),[65000,65000,90000,60100]);
  assert.deepEqual(calls.map(value=>value.intent.timeout),[0,0,30000,100]);
  assert.deepEqual(calls.map(value=>value.intent.action),['capture','inspect','stop','stop']);
});
test('command timeout and other failures have distinct sanitized diagnostics without automatic retry',async()=>{
  for(const [error,code] of [
    [{code:'ETIMEDOUT'},'desktop_helper_timeout'],
    [{code:null,killed:true,signal:'SIGTERM'},'desktop_helper_timeout'],
    [{code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',killed:true,signal:'SIGTERM'},'desktop_helper_failed'],
    [{code:1,killed:false},'desktop_helper_failed'],
  ])for(const action of ['capture','inspect','stop']){
    let calls=0;const helper=createBionicDesktopProcess({platform:'win32',execFileImpl:async()=>{calls++;throw Object.assign(Error('private executable path and output'),error,{stdout:'private stdout',stderr:'private stderr',cmd:'private command'});}});
    await assert.rejects(helper[action](identity),failure=>{
      assert.equal(failure.code,code);assert.equal(failure.effectAttempted,action==='stop');assert.equal(failure.message,code);
      for(const key of ['stdout','stderr','cmd','cause'])assert.equal(failure[key],undefined);return true;
    });assert.equal(calls,1);
  }
});
test('native identity and exit confirmation operate only on a harmless Node child owned by this test',{skip:process.platform!=='win32',timeout:180000},async()=>{
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
