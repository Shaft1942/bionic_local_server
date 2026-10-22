import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import tls from 'node:tls';
import { once } from 'node:events';
import { X509Certificate, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createAuthority, issueServer, issueClient, normalizeCertificateHosts } from '../lib/certificate-pki.mjs';

const root = path.resolve('work/test-pki');
const execFileAsync = promisify(execFile);
async function request(port, options={}) {
  return new Promise((resolve,reject) => {
    const req = https.get({host:'127.0.0.1',port,servername:'localhost',agent:false,...options},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
    req.on('error',reject); req.setTimeout(5000,()=>req.destroy(new Error('TLS test timeout')));
  });
}
async function listening(options, handler) {
  const server = https.createServer(options,handler || ((_req,res)=>res.end('ok')));
  server.on('tlsClientError',()=>{});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  return {port:server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}

test('vendored crypto bundle matches pinned public provenance', async () => {
  const provenance = JSON.parse(await fs.readFile('vendor/certificate-crypto.provenance.json','utf8'));
  assert.equal(createHash('sha256').update(await fs.readFile('vendor/certificate-crypto.mjs')).digest('hex'),provenance.sha256);
  assert.equal(provenance.patches.length,1);
  assert.equal(provenance.patches[0].id,'windows-pbes2-salt-128');
});

test('CA, server SAN and client EKU work through native TLS validation', async () => {
  const authority = await createAuthority({name:'Isolated TLS test CA'});
  const foreign = await createAuthority({name:'Foreign installation'});
  assert.notEqual(authority.fingerprint,foreign.fingerprint);
  const server = await issueServer({authority,hosts:['localhost','127.0.0.1','::1']});
  const client = await issueClient({authority,name:'Phone test',passphrase:'Temporary test password 123'});
  const foreignClient = await issueClient({authority:foreign,name:'Foreign phone',passphrase:'Temporary test password 456'});
  const now = new Date();
  const oldAuthority = await createAuthority({name:'Old dates test CA',now:new Date(now.getTime()-10*86400000)});
  const expiredServer = await issueServer({authority:oldAuthority,hosts:['localhost'],now:new Date(now.getTime()-5*86400000),days:1});
  const oldClient = await issueClient({authority:oldAuthority,name:'Expired phone',passphrase:'Temporary test password 789',now:new Date(now.getTime()-5*86400000),days:1});
  const currentOldClient = await issueClient({authority:oldAuthority,name:'Valid phone under old CA',passphrase:'Temporary test password 789'});
  const futureClient = await issueClient({authority:oldAuthority,name:'Future phone',passphrase:'Temporary test password 789',now:new Date(now.getTime()+30*60000),days:1});
  const serverCert = new X509Certificate(server.cert), clientCert = new X509Certificate(client.cert);
  assert.equal(serverCert.checkHost('localhost'),'localhost');
  assert.equal(serverCert.checkIP('127.0.0.1'),'127.0.0.1');
  assert.deepEqual(serverCert.keyUsage,['1.3.6.1.5.5.7.3.1']);
  assert.deepEqual(clientCert.keyUsage,['1.3.6.1.5.5.7.3.2']);
  assert.equal(new X509Certificate(authority.cert).ca,true);
  const httpsServer = await listening(server);
  try {
    assert.equal(await request(httpsServer.port,{ca:authority.cert}),200);
    assert.equal(await request(httpsServer.port,{ca:authority.cert,servername:undefined}),200,'IP SAN verified');
    await assert.rejects(request(httpsServer.port,{ca:foreign.cert}));
    await assert.rejects(request(httpsServer.port,{ca:authority.cert,servername:'wrong.local'}),/altnames|hostname/i);
  } finally { await httpsServer.close(); }
  const expired = await listening(expiredServer);
  try { await assert.rejects(request(expired.port,{ca:oldAuthority.cert}),/expired/i); }
  finally { await expired.close(); }
  const mtls = await listening({...server,ca:authority.cert,requestCert:true,rejectUnauthorized:true});
  try {
    assert.equal(await request(mtls.port,{ca:authority.cert,pfx:client.pfx,passphrase:'Temporary test password 123'}),200);
    await assert.rejects(request(mtls.port,{ca:authority.cert}));
    await assert.rejects(request(mtls.port,{ca:authority.cert,key:foreignClient.key,cert:foreignClient.cert}));
    await assert.rejects(request(mtls.port,{ca:authority.cert,...server}),/certificate|socket|alert/i,'serverAuth leaf cannot serve as clientAuth');
  } finally { await mtls.close(); }
  const currentOldServer = await issueServer({authority:oldAuthority,hosts:['localhost']});
  const datedMtls = await listening({...currentOldServer,ca:oldAuthority.cert,requestCert:true,rejectUnauthorized:true});
  try {
    assert.equal(await request(datedMtls.port,{ca:oldAuthority.cert,key:currentOldClient.key,cert:currentOldClient.cert}),200);
    await assert.rejects(request(datedMtls.port,{ca:oldAuthority.cert,key:oldClient.key,cert:oldClient.cert}),'expired client rejected under its own trusted CA');
    await assert.rejects(request(datedMtls.port,{ca:oldAuthority.cert,key:futureClient.key,cert:futureClient.cert}),'not-yet-valid client rejected under its own trusted CA');
  } finally { await datedMtls.close(); }
  assert.throws(()=>tls.createSecureContext({pfx:client.pfx,passphrase:'Wrong password'}));
  assert.doesNotThrow(()=>tls.createSecureContext({pfx:client.pfx,passphrase:'Temporary test password 123'}));
});

test('PKCS12 imports independently using Windows .NET ephemeral certificate collection', {skip:process.platform !== 'win32'}, async () => {
  await fs.mkdir(root,{recursive:true});
  const dir = await fs.mkdtemp(path.join(root,'dotnet-'));
  const passphrase = 'Temporary interoperability password 123';
  try {
    const authority = await createAuthority({name:'Temporary Windows import authority'});
    const client = await issueClient({authority,name:'Temporary Windows client',passphrase});
    await fs.writeFile(path.join(dir,'client.p12'),client.pfx,{mode:0o600});
    const script = `param([string]$Directory)\n$ErrorActionPreference='Stop'\n$c=[System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()\n$c.Import((Join-Path $Directory 'client.p12'),'${passphrase}',[System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)\nif($c.Count -ne 2 -or @($c | Where-Object HasPrivateKey).Count -ne 1){throw 'Invalid imported identities'}\n$d=[System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()\n$bad=$false\ntry{$d.Import((Join-Path $Directory 'client.p12'),'Incorrect password',[System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)}catch{$bad=$true}\nif(-not $bad){throw 'Wrong password accepted'}\nWrite-Output 'PKCS12 import: 2 certs, 1 private key; wrong password refused.'\n`;
    await fs.writeFile(path.join(dir,'verify.ps1'),script);
    const {stdout} = await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(dir,'verify.ps1'),'-Directory',dir],{windowsHide:true});
    assert.match(stdout,/2 certs, 1 private key/);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('certificate inputs reject URLs, wildcard names, weak passwords and excessive duration', async () => {
  assert.deepEqual(normalizeCertificateHosts(['LOCALHOST','127.0.0.1','localhost']),['localhost','127.0.0.1']);
  for (const host of ['https://localhost','localhost:8769','*.local','x\n.local','/tmp']) assert.throws(()=>normalizeCertificateHosts([host]));
  const authority = await createAuthority({name:'Input test CA'});
  await assert.rejects(issueServer({authority,hosts:['localhost'],days:398}));
  await assert.rejects(issueClient({authority,name:'Phone',passphrase:'short'}));
  await assert.rejects(issueClient({authority,name:'Phone',passphrase:'Mot-de-passe-é123'}));
});
