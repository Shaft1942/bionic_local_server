import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { createCompanion } from '../server.mjs';
import { startCertificateTransport } from '../lib/certificate-transport.mjs';
import { createCertificateWeb } from '../lib/certificate-web.mjs';

function request({ port, route = '/api/security/status', secure = false, ca, pfx, passphrase, method = 'GET', body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = (secure ? https : http).request({ hostname: '127.0.0.1', port, path: route, method, ca, pfx, passphrase, rejectUnauthorized: true, agent: false,
      headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers } }, res => {
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:res.statusCode,headers:res.headers,bytes,text:bytes.toString(),json(){return JSON.parse(this.text);}});});
    });
    req.setTimeout(5000,()=>req.destroy(Error('Isolated certificate web request timeout')));req.once('error',reject);req.end(payload);
  });
}
async function fixture(t, { proofPort = 0 } = {}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-cert-web-'));
  const app=await createCompanion({root,settings:{port:0,certificateProofPort:proofPort,apiUrl:'http://127.0.0.1:1235',bionicRoot:root,registryPath:path.join(root,'registry.json'),extraRoots:[],python:'python',comfyEnabled:false},fetchImpl:async()=>{throw Error('No live API permitted');},nativeStore:{listProjects:async()=>[],listSessions:async()=>[]},updateService:{start(){},stop(){},status:()=>({enabled:false})}});
  const transport=await startCertificateTransport({app,root,host:'127.0.0.1',port:0});
  t.after(async()=>{await app.close();await fs.rm(root,{recursive:true,force:true});});
  const code=/Code d’accès : (.+)/.exec(await fs.readFile(path.join(root,'ACCES-PRIVE.txt'),'utf8'))[1].trim();
  return {root,app,transport,code};
}
async function login(f, options={}) {
  const origin=`${options.secure?'https':'http'}://127.0.0.1:${f.transport.appPort}`;
  const result=await request({...options,port:f.transport.appPort,route:'/api/login',method:'POST',body:{code:f.code},headers:{Origin:origin}});assert.equal(result.status,200,result.text);
  const cookie=result.headers['set-cookie'][0].split(';')[0];
  const status=await request({...options,port:f.transport.appPort,headers:{Cookie:cookie}});assert.equal(status.status,200,status.text);
  const headers={Cookie:cookie,Origin:origin,'X-Bionic-CSRF':status.json().web.csrfToken};
  return {options,headers,status:status.json(),request:params=>request({...options,port:f.transport.appPort,headers,...params})};
}
async function prepareAndConfirm(f, session, mode, tlsOptions={}) {
  const prepared=await session.request({route:'/api/security/actions',method:'POST',body:{action:'prepare',mode,hosts:['127.0.0.1','localhost']}});assert.equal(prepared.status,200,prepared.text);
  const data=prepared.json();assert(!JSON.stringify(data).includes('?ticket='));assert.equal(data.proofRequest.url,'/api/security/proof');
  const publicCa=(await session.request({route:'/api/security/authority'})).bytes,ca=new X509Certificate(publicCa).toString();
  const bridge=await session.request({route:'/api/security/proof',method:'POST',body:new URLSearchParams({proofId:data.proofRequest.id,csrfToken:session.status.web.csrfToken}).toString(),headers:{Cookie:session.headers.Cookie,Origin:session.headers.Origin,'Content-Type':'application/x-www-form-urlencoded'}});assert.equal(bridge.status,200,bridge.text);
  const target=/action="([^"]+)"/.exec(bridge.text)[1],ticket=/name="ticket" value="([^"]+)"/.exec(bridge.text)[1],url=new URL(target);
  assert.equal(bridge.headers['content-security-policy'],`default-src 'none'; style-src 'unsafe-inline'; form-action ${url.origin}; frame-ancestors 'none'; base-uri 'none'`);
  assert(!target.includes(ticket));
  const proof=await request({port:Number(url.port),route:url.pathname,secure:true,ca,...tlsOptions,method:'POST',body:new URLSearchParams({ticket}).toString(),headers:{Origin:session.headers.Origin,'Sec-Fetch-Site':'cross-site','Content-Type':'application/x-www-form-urlencoded'}});assert.equal(proof.status,200,proof.text);
  assert.equal(f.app.certificateStore.state.mode,session.status.mode);
  const confirmed=await request({port:Number(url.port),route:'/__certificates/confirm',secure:true,ca,...tlsOptions,method:'POST',body:new URLSearchParams({ticket}).toString(),headers:{Origin:url.origin,'Content-Type':'application/x-www-form-urlencoded'}});assert.equal(confirmed.status,200,confirmed.text);
  return ca;
}

test('browser HTTP bootstrap, public CA and POST proof preserve access until real TLS confirmation', {timeout:90000}, async t=>{
  const f=await fixture(t),session=await login(f);
  assert.equal(session.status.mode,'http');assert.equal(session.status.web.canIssueDevice,false);
  assert.equal((await session.request({route:'/api/security/authority'})).status,404);
  assert.equal((await session.request({route:'/api/security/actions',method:'POST',body:{action:'issue-device',name:'Must refuse HTTP'}})).status,403);
  for(const header of [{...session.headers,'X-Bionic-CSRF':'é'.repeat(43)},{...session.headers,'X-Bionic-CSRF':''},{...session.headers,Origin:'http://foreign.invalid'},{Cookie:session.headers.Cookie}])assert.equal((await session.request({route:'/api/security/actions',method:'POST',headers:header,body:{action:'prepare',mode:'https',hosts:['127.0.0.1']}})).status,403);
  const ca=await prepareAndConfirm(f,session,'https');assert(new X509Certificate(ca).ca);assert.equal(f.app.certificateStore.state.mode,'https');
  assert.equal((await request({port:f.transport.appPort,secure:true,ca,headers:{Cookie:session.headers.Cookie}})).status,401);
  const secureSession=await login(f,{secure:true,ca});assert.equal(secureSession.status.web.canIssueDevice,true);
});

test('HTTPS PKCS12 export is encrypted, session-bound, one-use and never written to disk; mTLS browser access and renewals remain independent', {timeout:120000},async t=>{
  const f=await fixture(t),httpSession=await login(f),ca=await prepareAndConfirm(f,httpSession,'https');
  const session=await login(f,{secure:true,ca}),other=await login(f,{secure:true,ca});
  const issue=async(name,previousId)=>{const res=await session.request({route:'/api/security/actions',method:'POST',body:{action:'issue-device',name,previousId}});assert.equal(res.status,200,res.text);return res.json();};
  const deviceA=await issue('Téléphone A');assert.equal((await other.request({route:'/api/security/device-download',method:'POST',body:{exportId:deviceA.exportId}})).status,404);
  const downloadA=await session.request({route:'/api/security/device-download',method:'POST',body:{exportId:deviceA.exportId}});assert.equal(downloadA.status,200,downloadA.text);assert.equal(downloadA.headers['cache-control'],'no-store');assert.equal(downloadA.headers['content-type'],'application/pkcs12');
  assert.doesNotThrow(()=>tls.createSecureContext({pfx:downloadA.bytes,passphrase:deviceA.passphrase}));assert.throws(()=>tls.createSecureContext({pfx:downloadA.bytes,passphrase:'incorrect'}));
  assert.equal((await session.request({route:'/api/security/device-download',method:'POST',body:{exportId:deviceA.exportId}})).status,404);
  const deviceB=await issue('Tablette B'),downloadB=await session.request({route:'/api/security/device-download',method:'POST',body:{exportId:deviceB.exportId}});assert.equal(downloadB.status,200);
  const files=await fs.readdir(path.join(f.root,'data/security'));assert(!files.some(name=>/\.p12$|password|client.*\.key$/.test(name)));assert(!JSON.stringify(f.app.certificateStore.state).includes(deviceA.passphrase));
  await prepareAndConfirm(f,session,'mtls',{pfx:downloadA.bytes,passphrase:deviceA.passphrase});
  const a=await login(f,{secure:true,ca,pfx:downloadA.bytes,passphrase:deviceA.passphrase}),b=await login(f,{secure:true,ca,pfx:downloadB.bytes,passphrase:deviceB.passphrase});
  assert.equal(a.status.web.currentDeviceId,deviceA.device.id);
  assert.equal((await a.request({route:'/api/security/actions',method:'POST',body:{action:'revoke-device',id:deviceA.device.id,confirmName:deviceA.device.name}})).status,409);
  const renewed=await a.request({route:'/api/security/actions',method:'POST',body:{action:'issue-device',previousId:deviceA.device.id}});assert.equal(renewed.status,200,renewed.text);assert.equal(f.app.certificateStore.state.devices.find(d=>d.id===deviceA.device.id).revokedAt,null);
  const replacement=renewed.json();assert.equal(replacement.previousId,deviceA.device.id);
  const beforeLogout=await a.request({route:'/api/logout',method:'POST',body:{}});assert.equal(beforeLogout.status,200);
  const freshA=await login(f,{secure:true,ca,pfx:downloadA.bytes,passphrase:deviceA.passphrase});assert.equal((await freshA.request({route:'/api/security/device-download',method:'POST',body:{exportId:replacement.exportId}})).status,404);
  // No pending replacement is revoked implicitly while its import is unproven.
  assert.equal((await b.request({route:'/api/security/status'})).status,200);
});

test('fixed proof port collision refuses only the preparation, leaving HTTP access and personal bytes intact', {timeout:30000},async t=>{
  const occupied=http.createServer((_req,res)=>res.end('occupied fixture'));await new Promise(resolve=>occupied.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>occupied.close(resolve)));
  const proofPort=occupied.address().port,f=await fixture(t,{proofPort}),session=await login(f);
  const personal=path.join(f.root,'data/chats/preserved.txt');await fs.writeFile(personal,'PERSONAL_FIXTURE');
  const prepared=await session.request({route:'/api/security/actions',method:'POST',body:{action:'prepare',mode:'https',hosts:['127.0.0.1']}});assert.equal(prepared.status,409);assert.match(prepared.text,/port de vérification/);
  assert.equal(f.app.certificateStore.state.mode,'http');assert.equal((await session.request({})).status,200);assert.equal(await fs.readFile(personal,'utf8'),'PERSONAL_FIXTURE');
  assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'runtime/transport.json'),'utf8')).proofPort,proofPort);
});

test('expired downloads and stale Windows network markers are rejected without exposing secrets',async()=>{
  let now=1000;
  const state={mode:'https',epoch:'epoch',devices:[]},session={epoch:'epoch',expiry:999999};
  const store={state,publicStatus:()=>structuredClone(state),issueDevice:async()=>({device:{id:'device'},pfx:Buffer.from('ENCRYPTED_FIXTURE')}),revokeDevice:async()=>{},isDeviceAllowed:()=>true};
  const controller={appPort:8769,proofPort:8770,status:()=>structuredClone(state)};
  const service=createCertificateWeb({store,transport:()=>controller,platform:'win32',now:()=>now});
  const req={socket:{encrypted:true},headers:{host:'127.0.0.1:8769',origin:'https://127.0.0.1:8769'}};
  const status=await service.status(req,session);assert.equal(status.web.proofPortProvisioned,false);req.headers['x-bionic-csrf']=status.web.csrfToken;
  const issued=await service.action(req,session,{action:'issue-device',name:'fixture'});now+=300001;
  assert.throws(()=>service.downloadDevice(req,session,{exportId:issued.exportId}),error=>error.status===404);service.clear();
});

test('concurrent web revocations revalidate the requester inside transport serialization and retain an authorized device', {timeout:60000},async t=>{
  const f=await fixture(t),session=await login(f);await prepareAndConfirm(f,session,'https');
  const a=await f.app.certificateStore.issueDevice({name:'A',passphrase:'Synthetic-password-device-A'}),b=await f.app.certificateStore.issueDevice({name:'B',passphrase:'Synthetic-password-device-B'});
  await f.app.certificateStore.activateMtls();
  const outcomes=await Promise.allSettled([
    f.transport.action({action:'revoke-device',id:b.device.id,preserveWebAccess:true,requesterFingerprint:a.device.fingerprint}),
    f.transport.action({action:'revoke-device',id:a.device.id,preserveWebAccess:true,requesterFingerprint:b.device.fingerprint})
  ]);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(f.app.certificateStore.state.devices.filter(device=>f.app.certificateStore.isDeviceAllowed(device.fingerprint)).length,1);
});

test('Windows proof-port provisioning is reported only for this instance and the current network interface',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-cert-marker-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'runtime'));
  const marker={version:1,instanceId:'fixture',appPort:8769,proofPort:8770,provisionedAt:new Date().toISOString(),localAddress:'192.168.1.30',prefixLength:24,remoteSubnet:'192.168.1.0/24',interfaceAlias:'FixtureWifi',program:process.execPath};
  const store={state:{mode:'http',epoch:'epoch'},publicStatus:()=>({mode:'http',epoch:'epoch',devices:[]})};
  const controller={appPort:8769,proofPort:8770,status:store.publicStatus};
  let address='192.168.1.30';const service=createCertificateWeb({store,transport:()=>controller,root,instanceId:'fixture',platform:'win32',networkInterfaces:()=>({FixtureWifi:[{family:'IPv4',address,cidr:address+'/24'}]})});
  const req={socket:{},headers:{host:'127.0.0.1:8769'}},session={};
  await fs.writeFile(path.join(root,'runtime/certificate-network.json'),JSON.stringify(marker));assert.equal((await service.status(req,session)).web.proofPortProvisioned,true);
  address='192.168.1.31';assert.equal((await service.status(req,session)).web.proofPortProvisioned,false);
  address=marker.localAddress;await fs.writeFile(path.join(root,'runtime/certificate-network.json'),JSON.stringify({...marker,instanceId:'foreign'}));assert.equal((await service.status(req,session)).web.proofPortProvisioned,false);service.clear();
});
