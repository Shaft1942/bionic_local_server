import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import tls from 'node:tls';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash, scryptSync } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { readLocalControl, pingLocalControl, requestLocalAdmin, assertServerOffline, diagnoseLocalTransport } from '../lib/maintenance-client.mjs';
import { issueLocalDevice, resetLocalInstallation } from '../scripts/certificates.mjs';
import { openCertificateStore } from '../lib/certificate-store.mjs';
import { prepareUpdate, applyPreparedUpdate, launchUpdate } from '../lib/update-installer.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-cert-operations-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert(path.basename(root).startsWith('bionic-cert-operations-')); await fs.rm(root, { recursive: true, force: true }); });
  await fs.mkdir(path.join(root, 'data')); await fs.mkdir(path.join(root, 'runtime'));
  await fs.writeFile(path.join(root, 'data/config.json'), JSON.stringify({ instanceId: 'fixture-instance', adminToken: 'fixture-token-only', salt: 'fixture-salt', passwordHash: 'fixture-old-hash' }));
  return root;
}
async function listener(t, handler) {
  const server = http.createServer(handler); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return server.address().port;
}
const json = (res, value) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
const metadata = (port, mode = 'mtls') => ({ version: 1, instanceId: 'fixture-instance', mode, appPort: port === 65535 ? 65534 : port + 1, adminPort: port, appProtocol: mode === 'http' ? 'http:' : 'https:', pid: process.pid });

test('maintenance validates identity and probes the separate loopback port in all three modes', async t => {
  const root = await fixture(t); let posts = 0;
  const port = await listener(t, async (req, res) => {
    if (req.url === '/api/ping') return json(res, { app: 'bionic-mobile-local', instanceId: 'fixture-instance' });
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks)); assert.equal(body.token, 'fixture-token-only'); posts++; return json(res, { ok: true });
  });
  for (const mode of ['http', 'https', 'mtls']) {
    await fs.writeFile(path.join(root, 'runtime/transport.json'), JSON.stringify(metadata(port, mode)));
    const control = await readLocalControl({ root, port: 1 });
    assert.equal(control.base, `http://127.0.0.1:${port}`);
    assert.equal((await pingLocalControl(control)).instanceId, 'fixture-instance');
    assert.deepEqual(await requestLocalAdmin(control, '/api/admin/certificates/action', { action: 'status' }), { ok: true });
    assert.deepEqual(await diagnoseLocalTransport({ root, port: 1 }), { status: 'ok', code: `COMPANION_${mode.toUpperCase()}_OK` });
  }
  assert.equal(posts, 3);
  await fs.writeFile(path.join(root, 'runtime/transport.json'), JSON.stringify({ ...metadata(port), instanceId: 'foreign' }));
  await assert.rejects(readLocalControl({ root, port }), /incoherent/);
});

test('maintenance sends no token to a foreign responder and follows no redirect', async t => {
  const root = await fixture(t); let posts = 0, redirectTarget = 0;
  const foreignPort = await listener(t, (req, res) => { if (req.method === 'POST') posts++; json(res, { app: 'bionic-mobile-local', instanceId: 'foreign' }); });
  await fs.writeFile(path.join(root, 'runtime/transport.json'), JSON.stringify(metadata(foreignPort)));
  await assert.rejects(requestLocalAdmin(await readLocalControl({ root, port: 1 }), '/api/admin/stop'), /autre instance/); assert.equal(posts, 0);
  const targetPort = await listener(t, (req, res) => { redirectTarget++; res.end(); });
  const port = await listener(t, (req, res) => { if (req.url === '/api/ping') return json(res, { app: 'bionic-mobile-local', instanceId: 'fixture-instance' }); res.writeHead(302, { location: `http://127.0.0.1:${targetPort}/stolen` }); res.end(); });
  await fs.writeFile(path.join(root, 'runtime/transport.json'), JSON.stringify(metadata(port)));
  await assert.rejects(requestLocalAdmin(await readLocalControl({ root, port }), '/api/admin/stop'));
  assert.equal(redirectTarget, 0);
});

test('legacy HTTP fallback exists only before certificate identity; secured probes never downgrade', async t => {
  const root = await fixture(t);
  assert.equal((await readLocalControl({ root, port: 12345 })).base, 'http://127.0.0.1:12345');
  await fs.writeFile(path.join(root, 'data/security-floor.json'), '{"mode":"https"}');
  await assert.rejects(readLocalControl({ root, port: 12345 }), /maintenance absent/);
  assert.equal((await diagnoseLocalTransport({ root, port: 12345 })).code, 'COMPANION_TRANSPORT_NOT_CONFIRMED');
});

test('offline key creation refuses an active installation before any PKI write', async t => {
  const root = await fixture(t); const port = await listener(t, (req, res) => res.end());
  await assert.rejects(issueLocalDevice({ root, port, name: 'fixture' }), /port.*actif/);
  await assert.rejects(fs.access(path.join(root, 'data/security/state.json')));
  await assert.rejects(assertServerOffline({ root, port }), /actif/);
});

test('offline enrollment exports encrypted PKCS12 locally; renewal revokes only its predecessor', async t => {
  const root = await fixture(t);
  // Port 1 is probed only on loopback; a listener there makes this test fail closed.
  const first = await issueLocalDevice({ root, port: 1, name: 'Telephone A' });
  const second = await issueLocalDevice({ root, port: 1, name: 'Tablette B' });
  const renewed = await issueLocalDevice({ root, port: 1, previousId: first.device.id });
  const store = await openCertificateStore(path.join(root, 'data'));
  assert.equal(store.isDeviceAllowed(first.device.fingerprint), false);
  assert.equal(store.isDeviceAllowed(second.device.fingerprint), true);
  assert.equal(store.isDeviceAllowed(renewed.device.fingerprint), true);
  assert.equal(renewed.device.name, 'Telephone A');
  const pfx = await fs.readFile(renewed.pfxFile), passphrase = (await fs.readFile(renewed.passwordFile, 'utf8')).trim();
  assert.doesNotThrow(() => tls.createSecureContext({ pfx, passphrase }));
  assert.throws(() => tls.createSecureContext({ pfx, passphrase: 'incorrect' }));
  assert(!JSON.stringify(renewed).includes(passphrase));
});

test('explicit offline recovery replaces a corrupt identity and access but preserves conversation and file bytes', async t => {
  const root = await fixture(t); const privateFiles = ['data/chats/conversation.json','data/files/document.txt','data/comfy-generations/fixture.json','data/project-files/example.txt'];
  for (const relative of privateFiles) { await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true }); await fs.writeFile(path.join(root, relative), 'PRESERVE_' + relative); }
  await fs.mkdir(path.join(root, 'data/security')); await fs.writeFile(path.join(root, 'data/security/state.json'), 'CORRUPT_FIXTURE'); await fs.writeFile(path.join(root, 'data/security-floor.json'), 'CORRUPT_FIXTURE');
  const before = new Map(await Promise.all(privateFiles.map(async relative => [relative, sha(await fs.readFile(path.join(root, relative)))])));
  const result = await resetLocalInstallation({ root, port: 1 }); assert.equal(result.mode, 'http');
  for (const [relative, digest] of before) assert.equal(sha(await fs.readFile(path.join(root, relative))), digest);
  const config = JSON.parse(await fs.readFile(path.join(root, 'data/config.json'), 'utf8'));
  assert.notEqual(config.adminToken, 'fixture-token-only'); assert.notEqual(config.passwordHash, 'fixture-old-hash'); assert.equal(config.instanceId, 'fixture-instance');
  const access = await fs.readFile(result.accessFile, 'utf8'); const code = /Code d’accès : (.+)/.exec(access)?.[1].trim(); assert(code);
  assert.equal(scryptSync(code, config.salt, 32).toString('hex'), config.passwordHash);
  assert.equal((await openCertificateStore(path.join(root, 'data'))).state.mode, 'http');
});

function sources(version, withCapability, server = '// fixture public server') {
  const files = { 'package.json': JSON.stringify({ name: 'bionic-mobile-local', version }), 'server.mjs': server };
  if (withCapability) files['lib/certificate-transport.mjs'] = 'export const CERTIFICATE_TRANSPORT_CAPABILITY = 1;';
  files['release-manifest.json'] = JSON.stringify({ files: [...Object.keys(files), 'release-manifest.json'] }); return files;
}
function zip(files) {
  const local = [], central = []; let offset = 0;
  for (const [relative, text] of Object.entries(files)) {
    const bytes = Buffer.from(text), name = Buffer.from('bionic-mobile-v2.1.0/' + relative), crc = crc32(bytes);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt16LE(0x800,6); header.writeUInt32LE(crc,14); header.writeUInt32LE(bytes.length,18); header.writeUInt32LE(bytes.length,22); header.writeUInt16LE(name.length,26); local.push(header,name,bytes);
    const index = Buffer.alloc(46); index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20,4); index.writeUInt16LE(20,6); index.writeUInt16LE(0x800,8); index.writeUInt32LE(crc,16); index.writeUInt32LE(bytes.length,20); index.writeUInt32LE(bytes.length,24); index.writeUInt16LE(name.length,28); index.writeUInt32LE(offset,42); central.push(index,name); offset += 30 + name.length + bytes.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
test('updates refuse code without certificate capability and preserve identity during supported source update', async t => {
  const root = await fixture(t);
  for (const [relative,text] of Object.entries(sources('2.0.0',true))) { await fs.mkdir(path.dirname(path.join(root,relative)),{recursive:true});await fs.writeFile(path.join(root,relative),text); }
  const floorFile=path.join(root,'data/security-floor.json');await fs.writeFile(floorFile,'SECURITY_FLOOR_FIXTURE');
  const stateFile=path.join(root,'data/security/state.json');await fs.mkdir(path.dirname(stateFile));await fs.writeFile(stateFile,'PRIVATE_SECURITY_STATE_CANARY');
  const metadata=archive=>({schemaVersion:1,version:'2.1.0',minInstalledVersion:'2.0.0',nodeMajorMin:24,nodeMajorMax:null,platforms:['win32'],archive:'bionic-mobile-v2.1.0.zip',sha256:sha(archive)});
  const options={root,currentVersion:'2.0.0',instanceId:'fixture-instance',port:12345,platform:'win32'};
  const incompatible=zip(sources('2.1.0',false));await assert.rejects(prepareUpdate({...options,archive:incompatible,metadata:metadata(incompatible)}),/identite/);
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'package.json'))).version,'2.0.0');
  const archive=zip(sources('2.1.0',true)),plan=await prepareUpdate({...options,archive,metadata:metadata(archive)});
  await applyPreparedUpdate(plan,{restart:async()=>({pid:123})});
  assert.equal(await fs.readFile(floorFile,'utf8'),'SECURITY_FLOOR_FIXTURE');assert.equal(await fs.readFile(stateFile,'utf8'),'PRIVATE_SECURITY_STATE_CANARY');
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'package.json'))).version,'2.1.0');
});

const execute = promisify(execFile), repository = fileURLToPath(new URL('../', import.meta.url));
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
async function powershell(source) {
  const code = "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; " + source;
  return (await execute('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')], {windowsHide:true,timeout:15000,encoding:'utf8'})).stdout.trim();
}
test('Windows launchers use validated metadata and stop the same instance over maintenance in all modes', {skip:process.platform!=='win32'}, async t => {
  for (const mode of ['http','https','mtls']) {
    const root=await fixture(t);
    for(const name of ['Bionic-mobile-commun.ps1','Arreter.ps1'])await fs.copyFile(path.join(repository,name),path.join(root,name));
    const app=http.createServer((req,res)=>res.end());await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const appPort=app.address().port;
    t.after(()=>new Promise(resolve=>{app.closeAllConnections();app.close(resolve);}));
    let stopped=false;
    const adminPort=await listener(t,async(req,res)=>{
      if(req.url==='/api/ping')return json(res,{app:'bionic-mobile-local',instanceId:'fixture-instance'});
      assert.equal(req.url,'/api/admin/stop');const chunks=[];for await(const chunk of req)chunks.push(chunk);assert.equal(JSON.parse(Buffer.concat(chunks)).token,'fixture-token-only');stopped=true;json(res,{ok:true});app.close();
      // Close only this fake fixture's listener after its response was delivered.
      const fixtureServer=req.socket.server; res.once('finish',()=>fixtureServer.close());
    });
    await fs.writeFile(path.join(root,'runtime/server.json'),JSON.stringify({root,instanceId:'fixture-instance',port:appPort,pid:process.pid}));
    await fs.writeFile(path.join(root,'runtime/transport.json'),JSON.stringify({...metadata(adminPort,mode),appPort}));
    const helper='. '+quote(path.join(root,'Bionic-mobile-commun.ps1'))+'; ';
    assert.equal(await powershell(helper+'Get-BionicApplicationUrl -Root '+quote(root)),(mode==='http'?'http:':'https:')+'//127.0.0.1:'+appPort);
    // The stop script waits for its maintenance listener to close. A fake stop
    // callback closes this exact server, never an OS process.
    const output=await powershell('& '+quote(path.join(root,'Arreter.ps1')));
    assert(stopped);assert.match(output,/Serveur arrete/);
  }
});

test('temporary certificate firewall lease registers expiry first and removes only its generated rule (mocked Windows commands)', {skip:process.platform!=='win32'}, async () => {
  const source = `
. ${quote(path.join(repository,'Certificats-reseau-commun.ps1'))}
$script:calls=New-Object 'Collections.Generic.List[string]'; $script:reads=0
function Get-BionicCertificatePreparation { param($Root) $script:reads++; if($script:reads -gt 1){return $null}; return [pscustomobject]@{Port=43210;ExpiresAt=[DateTimeOffset]::UtcNow.AddMinutes(1);InstanceId='fixture';Runtime=@{}} }
function Get-BionicCertificateScope { return [pscustomobject]@{Node='fixture-node';Address='192.168.1.2';Subnet='192.168.1.0/24';Interface='Fixture'} }
function Get-BionicFirewallName { return 'BionicMobileLocal-1234567890ABCDEF' }
function New-ScheduledTaskAction { param($Execute,$Argument) $script:cleanup=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String(($Argument -split ' ')[-1])); return @{} }
function New-ScheduledTaskTrigger { param([switch]$Once,$At) return @{} }
function New-ScheduledTaskPrincipal { param($UserId,$LogonType,$RunLevel) if($UserId -ne 'SYSTEM'){throw 'principal'}; return @{} }
function New-ScheduledTaskSettingsSet { return @{} }
function Register-ScheduledTask { param($TaskName,$Action,$Trigger,$Principal,$Settings,$Description,$ErrorAction) $script:calls.Add('expiry');$script:task=$TaskName }
function New-NetFirewallRule { param($Name,$DisplayName,$Description,$Direction,$Action,$Protocol,$LocalPort,$Program,$LocalAddress,$RemoteAddress,$InterfaceAlias,$Profile,$ErrorAction) if($LocalPort -ne 43210 -or $RemoteAddress -ne '192.168.1.0/24' -or $Profile -ne 'Private' -or $Program -ne 'fixture-node'){throw 'scope'};$script:rule=$Name;$script:calls.Add('open') }
function Start-Sleep { }
function Get-NetFirewallRule { param($Name,$ErrorAction) if($Name -cne $script:rule){throw 'other rule'};return @{Name=$Name} }
function Remove-NetFirewallRule { param([Parameter(ValueFromPipeline=$true)]$InputObject) process {$script:calls.Add('remove')} }
function Unregister-ScheduledTask { param($TaskName,[switch]$Confirm,$ErrorAction) if($TaskName -cne $script:task){throw 'other task'};$script:calls.Add('unregister') }
Invoke-BionicCertificateFirewallLease -Root 'C:/fixture-only'
if(-not $script:cleanup.Contains($script:rule) -or -not $script:cleanup.Contains($script:task)){throw 'cleanup names'}
$script:calls | ConvertTo-Json -Compress
`;
  assert.deepEqual(JSON.parse(await powershell(source)),['expiry','open','remove','unregister']);
});

test('certificate firewall preparation rejects stale or insecure candidates without changing Windows (mocked probes)', {skip:process.platform!=='win32'}, async () => {
  const source=`
. ${quote(path.join(repository,'Certificats-reseau-commun.ps1'))}
function Get-BionicRuntime { return [pscustomobject]@{port=43210} }
function Assert-BionicRuntimeIdentity { return [pscustomobject]@{instanceId='fixture';adminToken='fixture-only'} }
function Get-BionicMaintenanceBase { return 'http://127.0.0.1:43211' }
function Invoke-RestMethod { return [pscustomobject]@{candidate=[pscustomobject]@{url=$script:url;expiresAt=$script:expires}} }
$script:url='https://192.168.1.2:43212';$script:expires=[DateTimeOffset]::UtcNow.AddMinutes(1).ToString('o')
$prepared=Get-BionicCertificatePreparation 'C:/fixture-only';if($prepared.Port -ne 43212 -or $prepared.InstanceId -cne 'fixture'){throw 'identity'}
$script:url='http://192.168.1.2:43212';try{$null=Get-BionicCertificatePreparation 'C:/fixture-only';throw 'accepted'}catch{if($_.Exception.Message -eq 'accepted'){throw}}
$script:url='https://192.168.1.2:43212';$script:expires=[DateTimeOffset]::UtcNow.AddMinutes(20).ToString('o');try{$null=Get-BionicCertificatePreparation 'C:/fixture-only';throw 'accepted'}catch{if($_.Exception.Message -eq 'accepted'){throw}}
'OK'
`;
  assert.equal(await powershell(source),'OK');
});

test('offline operations fail closed on permission/network errors and an update lock', async t => {
  const root=await fixture(t);
  const fakeConnect=code=>()=>{const socket=new EventEmitter();socket.destroy=()=>{};socket.setTimeout=()=>{};queueMicrotask(()=>socket.emit('error',{code}));return socket;};
  for(const code of ['EACCES','EPERM','ENETUNREACH'])await assert.rejects(assertServerOffline({root,port:43210,connectImpl:fakeConnect(code)}),/actif/);
  await assert.doesNotReject(assertServerOffline({root,port:43210,connectImpl:fakeConnect('ECONNREFUSED')}));
  await fs.writeFile(path.join(root,'runtime/update.lock'),'fixture-only');
  await assert.rejects(assertServerOffline({root,port:43210,connectImpl:fakeConnect('ECONNREFUSED')}),/mise a jour/);
  await assert.rejects(issueLocalDevice({root,port:43210,name:'Must not issue'}),/mise a jour/);
  await assert.rejects(fs.access(path.join(root,'data/security')));
});

// This application is deliberately a stub. Native TLS, separate dynamic
// maintenance, detached worker, public source replacement and probes are real.
const tlsWorkerServer = `
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import https from 'node:https';
const root=process.cwd(),version=JSON.parse(fs.readFileSync('package.json')).version,config=JSON.parse(fs.readFileSync('data/config.json')),state=JSON.parse(fs.readFileSync('data/security/state.json'));
const read=name=>fs.readFileSync(path.join('data/security',name));
const identity={app:'bionic-mobile-local',instanceId:config.instanceId,version};
const respond=(res,value)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
const app=https.createServer({key:read(state.server.keyFile),cert:read(state.server.certFile),ca:read(state.authority.certFile),requestCert:state.mode==='mtls',rejectUnauthorized:state.mode==='mtls',minVersion:'TLSv1.2'},(req,res)=>respond(res,{...identity,fixtureApplication:'stub'}));
app.on('tlsClientError',()=>{});
const admin=http.createServer(async(req,res)=>{
 if(req.url==='/api/ping')return respond(res,identity);
 if(req.url==='/api/admin/stop'&&req.method==='POST'){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);if(JSON.parse(Buffer.concat(chunks)).token!==config.adminToken){res.writeHead(403);return res.end();}
  res.once('finish',()=>{app.closeAllConnections();app.close();admin.closeAllConnections();admin.close(()=>process.exit(0));});return respond(res,{ok:true});
 }
 res.writeHead(404);res.end();
});
app.listen(Number(process.env.BIONIC_MOBILE_PORT),'127.0.0.1',()=>admin.listen(0,'127.0.0.1',()=>{
 const appPort=app.address().port,adminPort=admin.address().port;
 fs.writeFileSync('runtime/server.json',JSON.stringify({root,pid:process.pid,instanceId:config.instanceId,port:appPort}));
 fs.writeFileSync('runtime/transport.json',JSON.stringify({version:1,instanceId:config.instanceId,mode:state.mode,appPort,adminPort,appProtocol:'https:',pid:process.pid}));
}));
`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function tlsFixtureRequest(port, options) {
  return new Promise((resolve,reject)=>{
    const request=https.get({hostname:'127.0.0.1',port,path:'/',agent:false,...options},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{try{resolve({status:response.statusCode,value:JSON.parse(Buffer.concat(chunks))});}catch(error){reject(error);}});response.on('error',reject);});
    request.setTimeout(3000,()=>request.destroy(Error('Fixture TLS timeout')));request.on('error',reject);
  });
}
const weakerWorkerServer=tlsWorkerServer.replace(/const app=https\.createServer[^\n]+/,"const app=http.createServer((req,res)=>respond(res,{...identity,fixtureApplication:'stub'}));").replace("mode:state.mode","mode:'http'").replace("appProtocol:'https:'","appProtocol:'http:'");
for(const scenario of [{mode:'https'},{mode:'mtls'},{mode:'mtls',regression:true}])test(scenario.regression?'detached update worker refuses a reported HTTP downgrade and recovers the old mTLS fixture':'detached update worker confirms '+scenario.mode+' via separate dynamic maintenance and preserves its PKI', {timeout:30000},async t=>{
  const {mode,regression}=scenario;
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-cert-worker-'));let parent,restartedPid,workerPid;
  t.after(async()=>{
    parent?.kill();
    if(restartedPid){try{process.kill(restartedPid);}catch(error){if(error.code!=='ESRCH')throw error;}}
    if(workerPid){try{process.kill(workerPid);}catch(error){if(error.code!=='ESRCH')throw error;}}
    if(parent&&!parent.exitCode)await Promise.race([new Promise(resolve=>parent.once('exit',resolve)),pause(500)]);
    await pause(150);assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('bionic-cert-worker-'));await fs.rm(root,{recursive:true,force:true});
  });
  await fs.mkdir(path.join(root,'data'));await fs.mkdir(path.join(root,'runtime'));
  await fs.writeFile(path.join(root,'data/config.json'),JSON.stringify({instanceId:'fixture-instance',adminToken:'fixture-token-only'}));
  for(const [relative,text]of Object.entries(sources('2.0.0',true,tlsWorkerServer))){await fs.mkdir(path.dirname(path.join(root,relative)),{recursive:true});await fs.writeFile(path.join(root,relative),text);}
  const store=await openCertificateStore(path.join(root,'data'));
  await store.prepareServer({hosts:['127.0.0.1','localhost']});await store.confirmServer({fingerprint:store.state.candidate.fingerprint});
  const passphrase='Fixture-only-password-2026',device=await store.issueDevice({name:'Fixture device',passphrase});if(mode==='mtls')await store.activateMtls();
  const ca=await fs.readFile(path.join(store.directory,store.state.authority.certFile));
  const identityFiles=['data/security-floor.json',...(await fs.readdir(store.directory)).map(name=>'data/security/'+name)],before=new Map(await Promise.all(identityFiles.map(async relative=>[relative,sha(await fs.readFile(path.join(root,relative)))])));
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  parent=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});assert(parent.pid);
  const archive=zip(sources('2.1.0',true,regression?weakerWorkerServer:tlsWorkerServer)),metadata={schemaVersion:1,version:'2.1.0',minInstalledVersion:'2.0.0',nodeMajorMin:24,nodeMajorMax:null,platforms:['win32'],archive:'bionic-mobile-v2.1.0.zip',sha256:sha(archive)};
  const plan=await prepareUpdate({root,archive,metadata,currentVersion:'2.0.0',instanceId:'fixture-instance',port,parentPid:parent.pid,platform:'win32'});
  workerPid=(await launchUpdate(plan)).pid;parent.kill();
  let status;const deadline=Date.now()+20000;
  while(Date.now()<deadline){status=JSON.parse(await fs.readFile(path.join(plan.jobRoot,'status.json'),'utf8'));if(['completed','rolled-back','rollback-failed','cancelled'].includes(status.state))break;await pause(100);}
  // Retain the exact fixture PID for cleanup even if the assertion fails.
  try{restartedPid=JSON.parse(await fs.readFile(path.join(root,'runtime/server.json'),'utf8')).pid;}catch{}
  assert.equal(status.state,regression?'rolled-back':'completed',JSON.stringify(status));if(regression)assert.equal(status.recovered,true);else assert.equal(restartedPid,status.pid);
  const expectedVersion=regression?'2.0.0':'2.1.0';assert.equal(JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,expectedVersion);
  const control=await readLocalControl({root,port});assert.equal(control.metadata.mode,mode);assert.notEqual(control.metadata.adminPort,port);assert.equal((await pingLocalControl(control)).version,expectedVersion);
  const tlsResult=await tlsFixtureRequest(port,{ca,...(mode==='mtls'?{pfx:device.pfx,passphrase}:{})});assert.equal(tlsResult.status,200);assert.equal(tlsResult.value.version,expectedVersion);assert.equal(tlsResult.value.fixtureApplication,'stub');
  if(mode==='mtls')await assert.rejects(tlsFixtureRequest(port,{ca}));
  for(const [relative,digest]of before)assert.equal(sha(await fs.readFile(path.join(root,relative))),digest,'PKI/floor changed during fixture update');
  await requestLocalAdmin(control,'/api/admin/stop');
  for(let i=0;i<30;i++){try{process.kill(restartedPid,0);}catch(error){if(error.code==='ESRCH'){restartedPid=null;break;}throw error;}await pause(50);}
});
