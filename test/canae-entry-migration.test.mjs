import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { migrate25, fixtureCode, oldMarker } from './fixtures/canae-entry.mjs';

test('2.5 update preserves historical settings and identity, then the installed runtime serves only Canaé across restart', { timeout: 60000 }, async t => {
  const f=await migrate25();t.after(()=>f.close());
  assert.equal(f.app.settings.uiMode,'llama');assert.equal(f.app.settings.port,31234);
  const page=await fetch(f.baseUrl+'/');assert.equal(page.status,200);const html=await page.text();assert.match(html,/Canaé/);assert.doesNotMatch(html,new RegExp(oldMarker));
  assert.equal(page.headers.get('cache-control'),'no-store');assert.equal(page.headers.get('referrer-policy'),'strict-origin');
  for(const asset of [...html.matchAll(/(?:src|href)="(\/llama-ui\/assets\/[^"?#]+)"/g)].map(match=>match[1])){
    const response=await fetch(f.baseUrl+asset);assert.equal(response.status,200);const received=Buffer.from(await response.arrayBuffer());assert.deepEqual(received,await fs.readFile(path.join(f.root,'public',asset.slice(1))));
  }
  assert.equal((await fetch(f.baseUrl+'/public/retained-legacy.html')).status,404);assert.equal((await fetch(f.baseUrl+'/retained-legacy.html')).status,404);assert.equal((await fetch(f.baseUrl+'/app.js')).status,404);
  for(const route of ['/legacy','/legacy/','/prototype/','/llama-ui/index.html'])for(const method of ['GET','HEAD']){const response=await fetch(f.baseUrl+route+'?old=discarded',{method,redirect:'manual'});assert.equal(response.status,308);assert.equal(response.headers.get('location'),'/');assert.equal(await response.text(),'');}
  assert.equal((await fetch(f.baseUrl+'/api/projects')).status,401);
  async function login(){const response=await fetch(f.baseUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:f.baseUrl},body:JSON.stringify({code:fixtureCode})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
  const cookie=await login(),query=new URLSearchParams({projectId:'companion-unassigned',id:f.chatId});
  const conversation=await(await fetch(f.baseUrl+'/api/conversation?'+query,{headers:{Cookie:cookie}})).json();assert.equal(conversation.name,'Conversation synthétique 2.5');assert.equal(conversation.messages[1].text,'Ancienne réponse synthétique.');
  await f.assertPrivate();await f.restart();await f.assertPrivate();
  const ping=await(await fetch(f.baseUrl+'/api/ping')).json();assert.equal(ping.version,f.version);assert.equal(ping.instanceId,f.instanceId);
  assert.match(await(await fetch(f.baseUrl+'/')).text(),/Canaé/);assert.equal((await fetch(f.baseUrl+'/api/projects',{headers:{Cookie:cookie}})).status,401,'Sessions stay scoped to their running process');
  assert.equal((await fetch(f.baseUrl+'/api/projects',{headers:{Cookie:await login()}})).status,200);await f.assertPrivate();
});
