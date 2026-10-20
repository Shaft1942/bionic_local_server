import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createCompanion } from '../server.mjs';
const results=[];
for(const count of [10,100,1000]){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'bionic-benchmark-')));
 const settings={port:8769,apiUrl:'http://127.0.0.1:1235',bionicRoot:root,registryPath:path.join(root,'synthetic-registry.json'),extraRoots:[],python:'python'};
 const nativeStore={listProjects:async()=>[{id:'p1',name:'Fictif 1'},{id:'p2',name:'Fictif 2'}],listSessions:async()=>[],getConversation:async()=>{throw Error('no native content');}};
 let app;
 try {
  app=await createCompanion({root,settings,nativeStore});await app.close();
  for(let i=0;i<count;i++){const id='web-'+randomUUID();await fs.writeFile(path.join(root,'data/chats',id+'.json'),JSON.stringify({id,projectId:i%2?'p1':'p2',name:'Fixture '+i,updatedAt:i,messages:Array.from({length:4},(_,j)=>({id:randomUUID(),role:j%2?'assistant':'user',text:'Données synthétiques. '.repeat(10)}))}));}
  for(const mode of ['per-project-control','shared-cycle']){
   app=await createCompanion({root,settings,nativeStore});
   for(const phase of ['cold','warm']){
    const before={...app.measurements},start=performance.now();const run=async()=>{await app.webChats('p1');await app.webChats('p2');};
    if(mode==='shared-cycle')await app.withScanCycle(run);else await run();
    results.push({chats:count,mode,phase,durationMs:Number((performance.now()-start).toFixed(2)),directoryScans:app.measurements.directoryScans-before.directoryScans,diskReads:app.measurements.chatDiskReads-before.chatDiskReads,deserializations:app.measurements.deserializations-before.deserializations,heapUsedBytes:process.memoryUsage().heapUsed});
   }
   await app.close();
  }
 }finally{await app?.close();const resolved=await fs.realpath(root);if(path.dirname(resolved)!==await fs.realpath(os.tmpdir())||!path.basename(resolved).startsWith('bionic-benchmark-'))throw Error('Temporary scope mismatch');await fs.rm(resolved,{recursive:true,force:true});}
}
console.log(JSON.stringify({reference:'Motif de parcours par projet du commit 5e92da3, simulé avec la même lecture de chats que le nouveau cycle partagé. Ce n’est pas un benchmark complet de l’ancienne application.',results,limits:['Aucun modèle ni fichier personnel.','Mémoire du processus mesurée sans isolation/GC forcé : ne pas en déduire une économie mémoire.','Un seul passage par taille : durées indicatives sur ces fixtures, aucune promesse de latence utilisateur.','Cache existant conservé, aucun index, éviction ou pagination ajoutés.']},null,2));
