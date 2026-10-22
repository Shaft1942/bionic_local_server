import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createComfySettings, localComfyURL, validateComfySettings } from './comfy-settings.mjs';
export { localComfyURL } from './comfy-settings.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });
const UUID = /^[a-f0-9-]{36}$/i;
const ACTIVE = new Set(['queued', 'running']);
const FORMATS = { square: [1024, 1024], portrait: [832, 1216], landscape: [1216, 832] };
const PNG = Buffer.from([137,80,78,71,13,10,26,10]);
const MAX_IMAGE = 32 * 1024 * 1024;

const PROFILE_DEFINITIONS = [
  { id:'krea2_turbo',label:'Krea 2 Turbo',file:'krea2-turbo.api.json',sampler:'3',positive:'6',latent:'5',output:'9',prefix:'Krea2',defaultFormat:'square',expected:{'3':'KSampler','5':'EmptyLatentImage','6':'CLIPTextEncode','8':'VAEDecode','9':'SaveImage','10':'UNETLoader','11':'CLIPLoader','12':'VAELoader','13':'ConditioningZeroOut'} },
  { id:'hassaku_illustrious',label:'Hassaku XL Illustrious v34',file:'hassaku-illustrious.api.json',sampler:'56',positive:'6',negative:'7',latent:'5',output:'19',prefix:'Hassaku',defaultFormat:'portrait',expected:{'53':'CheckpointLoaderSimple','6':'CLIPTextEncode','7':'CLIPTextEncode','5':'EmptyLatentImage','56':'KSampler','17':'VAEDecode','19':'SaveImage'} }
];

function validateGraph(graph, info) {
  const errors = [], models = [];
  for (const [id, node] of Object.entries(graph)) {
    const definition = info[node.class_type];
    if (!definition) { errors.push(`Nœud absent : ${node.class_type}.`); continue; }
    const required = definition.input?.required ?? {}, fields = { ...required, ...definition.input?.optional };
    for (const name of Object.keys(required)) if (!Object.hasOwn(node.inputs, name)) errors.push(`${node.class_type}.${name} : entrée requise absente.`);
    for (const [name, value] of Object.entries(node.inputs)) {
      const spec = fields[name];
      if (!spec) { errors.push(`${node.class_type}.${name} : entrée absente du serveur.`); continue; }
      if (Array.isArray(value)) {
        const upstream = graph[value[0]], output = upstream && info[upstream.class_type]?.output?.[value[1]];
        if (!upstream || !Number.isInteger(value[1]) || output === undefined) errors.push(`${node.class_type}.${name} : lien de sortie absent.`);
        else if (typeof spec[0] === 'string' && spec[0] !== '*' && spec[0] !== output) errors.push(`${node.class_type}.${name} : type de lien incompatible.`);
      } else if (Array.isArray(spec[0]) && !spec[0].includes(value)) errors.push(`${node.class_type}.${name} : valeur indisponible (${String(value)}).`);
      if (['unet_name','clip_name','vae_name','ckpt_name'].includes(name)) models.push({ node:node.class_type,input:name,name:value,available:Array.isArray(spec[0]) && spec[0].includes(value) });
    }
  }
  return { compatible:errors.length === 0, errors, models };
}

/** Bundled workflows only; each job keeps its endpoint and output contract. */
export async function createComfyImages({ directory, url, enabled = false, workflowId = 'krea2_turbo', settingsFile = path.join(directory,'..','comfy-settings.json'), fetchImpl = globalThis.fetch, workflowFile, pollMs = 2000, deadlineMs = 1800000 } = {}) {
  const jobs = new Map(), locks = new Map(), timers = new Map(), refreshing = new Map(), profiles = new Map();
  const settingsStore = await createComfySettings({ file:settingsFile,enabled,url,workflowId });
  let settingsMutation = Promise.resolve(), preparing = 0;
  let closed = false;
  await fs.mkdir(directory, { recursive: true });
  for (const definition of PROFILE_DEFINITIONS) {
    const file = definition.id === 'krea2_turbo' && workflowFile ? workflowFile : fileURLToPath(new URL('../workflows/'+definition.file, import.meta.url));
    const raw = await fs.readFile(file), graph = JSON.parse(raw);
    if (Object.keys(graph).length !== Object.keys(definition.expected).length || Object.entries(definition.expected).some(([id,kind]) => graph[id]?.class_type !== kind) || (definition.id === 'krea2_turbo' && graph['11'].inputs.type !== 'krea2')) throw new Error(`Workflow local invalide : ${definition.id}.`);
    profiles.set(definition.id, { ...definition,graph,hash:createHash('sha256').update(raw).digest('hex') });
  }
  const activeJobs = () => preparing + [...jobs.values()].filter(job => ACTIVE.has(job.status) || job.status === 'submitting').length;
  const getSettings = () => ({ ...settingsStore.get(),workflows:[...profiles.values()].map(profile => ({id:profile.id,label:profile.label,defaultFormat:profile.defaultFormat,negativePrompt:!!profile.negative})),activeJobs:activeJobs(),experimentalDeferred:'La chaîne Hassaku vers Krea 2 reste expérimentale : qualité et fidélité non validées sur le GPU. Les deux workflows séparés sont disponibles.' });
  const persist = async job => { const filename = path.join(directory,job.id+'.json'); await fs.writeFile(filename+'.tmp',JSON.stringify(job)); await fs.rename(filename+'.tmp',filename); };
  const publicJob = job => ({ id:job.id, status:job.status, promptId:job.promptId, prompt:job.prompt, seed:job.seed, format:job.format, width:job.width, height:job.height, workflowId:job.workflowId,workflowLabel:profiles.get(job.workflowId)?.label,comfyUrl:job.comfyUrl,createdAt:job.createdAt, updatedAt:job.updatedAt, ...(job.error?{error:job.error}:{}), ...(job.image?{image:{width:job.image.width,height:job.image.height,sha256:job.image.sha256,size:job.image.size}}:{}) });
  const changed = async (job, patch) => { Object.assign(job,patch,{updatedAt:Date.now()}); await persist(job); return publicJob(job); };
  async function request(route, options = {}, base = settingsStore.get().url) {
    const response = await fetchImpl(localComfyURL(base)+route,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});
    if (!response.ok) {
      let detail=''; try { const body=await response.json(); detail=typeof body.error?.message==='string'?body.error.message.slice(0,300):typeof body.error==='string'?body.error.slice(0,300):''; } catch {}
      throw fail(502,'ComfyUI a refusé la demande (HTTP '+response.status+').'+(detail?' '+detail:''));
    }
    return response;
  }
  async function imageBytes(response) {
    if (Number(response.headers?.get('content-length')) > MAX_IMAGE) { await response.body?.cancel(); throw fail(502,'Image ComfyUI trop volumineuse.'); }
    const parts=[]; let length=0;
    for await (const chunk of response.body) { length+=chunk.length; if(length>MAX_IMAGE)throw fail(502,'Image ComfyUI trop volumineuse.');parts.push(Buffer.from(chunk)); }
    const bytes=Buffer.concat(parts);
    if(bytes.length<24||!bytes.subarray(0,8).equals(PNG)||bytes.toString('ascii',12,16)!=='IHDR')throw fail(502,'La sortie ComfyUI n’est pas une image PNG valide.');
    return bytes;
  }
  function schedule(job) {
    if (closed || timers.has(job.id) || !ACTIVE.has(job.status)) return;
    const timer=setTimeout(()=>{timers.delete(job.id); refresh(job.id).catch(()=>{});},pollMs);
    timer.unref(); timers.set(job.id,timer);
  }
  async function doRefresh(job) {
    if(!ACTIVE.has(job.status))return publicJob(job);
    try {
      const history=await (await request('/history/'+encodeURIComponent(job.promptId),{},job.comfyUrl)).json(), entry=history[job.promptId];
      if(entry?.status?.status_str==='error'||entry?.status?.messages?.some(([type])=>['execution_error','execution_interrupted'].includes(type))) {
        const event=entry.status.messages?.find(([type])=>['execution_error','execution_interrupted'].includes(type));
        const detail=event?.[1]?.exception_message;
        return await changed(job,{status:'failed',error:'La génération ComfyUI a échoué.'+(typeof detail==='string'?' '+detail.slice(0,400):'')});
      }
      if(entry?.status?.completed===true) {
        const descriptor=entry.outputs?.[job.outputNodeId]?.images?.find(item=>item.type==='output');
        if(!descriptor||typeof descriptor.filename!=='string'||typeof descriptor.subfolder!=='string')return await changed(job,{status:'failed',error:'ComfyUI a terminé sans image sauvegardée.'});
        const response=await request('/view?'+new URLSearchParams({filename:descriptor.filename,subfolder:descriptor.subfolder,type:'output'}),{},job.comfyUrl);
        const bytes=await imageBytes(response), width=bytes.readUInt32BE(16), height=bytes.readUInt32BE(20);
        if(width!==job.width||height!==job.height)throw fail(502,'Les dimensions de l’image ComfyUI sont inattendues.');
        await fs.writeFile(path.join(directory,job.id+'.png'),bytes);
        return await changed(job,{status:'succeeded',error:null,image:{width,height,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}});
      }
      const queue=await (await request('/queue',{},job.comfyUrl)).json();
      const running=queue.queue_running?.some(item=>item[1]===job.promptId), pending=queue.queue_pending?.some(item=>item[1]===job.promptId);
      if(Date.now()-job.createdAt>deadlineMs)return await changed(job,{status:'unknown',error:'Délai de suivi dépassé. Vérifie l’historique ComfyUI avant toute nouvelle demande.'});
      const status=running?'running':pending?'queued':job.status;
      if(status!==job.status||job.error)await changed(job,{status,error:null});
    } catch(error) {
      if(Date.now()-job.createdAt>deadlineMs)await changed(job,{status:'unknown',error:'Suivi ComfyUI interrompu. Aucune génération n’a été relancée.'});
      else if(job.error!=='ComfyUI momentanément inaccessible ; suivi conservé.')await changed(job,{error:'ComfyUI momentanément inaccessible ; suivi conservé.'});
    } finally { schedule(job); }
    return publicJob(job);
  }
  function refresh(id) {
    const job=jobs.get(id); if(!job)throw fail(404,'Génération introuvable.');
    if(refreshing.has(id))return refreshing.get(id);
    const task=doRefresh(job).finally(()=>refreshing.delete(id));refreshing.set(id,task);return task;
  }
  for(const name of await fs.readdir(directory))if(/^[a-f0-9-]{36}\.json$/i.test(name)){
    const job=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
    if(!UUID.test(job.id)||name!==job.id+'.json'||!job.owner)continue;
    // V1 jobs were Krea 2 only. Pin them during migration, even when disabled.
    job.comfyUrl=localComfyURL(job.comfyUrl ?? settingsStore.get().url);
    job.workflowId=job.workflowId ?? 'krea2_turbo';
    job.outputNodeId=job.outputNodeId ?? '9';
    if(job.status==='submitting')await changed(job,{status:'unknown',error:'Soumission interrompue par le redémarrage. Vérifie ComfyUI ; aucun nouvel envoi automatique.'});
    // A finished V1 job is upgraded in memory only: keep its original file intact.
    else if(ACTIVE.has(job.status))await persist(job);
    jobs.set(job.id,job);schedule(job);
  }
  async function submit(args, owner, signal) {
    if(!args||typeof args.prompt!=='string'||!args.prompt.trim()||args.prompt.length>6000||Object.keys(args).some(k=>!['prompt','seed','format','workflowId','negativePrompt'].includes(k)))throw fail(400,'Prompt image invalide (1 à 6 000 caractères).');
    if(args.negativePrompt!==undefined && (typeof args.negativePrompt!=='string'||args.negativePrompt.length>6000))throw fail(400,'Prompt négatif invalide (6 000 caractères maximum).');
    const seed=args.seed??randomInt(4294967296);
    if((args.format!==undefined&&!Object.hasOwn(FORMATS,args.format))||!Number.isSafeInteger(seed)||seed<0||seed>4294967295)throw fail(400,'Format ou seed image invalide.');
    if(args.workflowId!==undefined&&!profiles.has(args.workflowId))throw fail(400,'Workflow ComfyUI inconnu.');
    if(!owner?.chatId||!owner.messageId||!owner.projectId||!owner.requestId)throw fail(400,'Conversation de génération invalide.');
    const key=owner.chatId+':'+owner.messageId;
    if(locks.has(key))return locks.get(key);
    const work=(async()=>{
      const prior=[...jobs.values()].find(job=>job.owner.chatId===owner.chatId&&job.owner.messageId===owner.messageId);
      if(prior)return publicJob(prior); // At most one GPU submission per assistant turn, including retries.
      await settingsMutation;
      if(closed)throw fail(503,'Le service d’images est fermé.');
      const settings=settingsStore.get();
      if(!settings.enabled)throw fail(409,'ComfyUI est désactivé. Active-le dans les paramètres du compagnon.');
      const profile=profiles.get(args.workflowId??settings.workflowId),format=args.format??profile.defaultFormat;
      if(args.negativePrompt && !profile.negative)throw fail(400,'Ce workflow ne propose pas de prompt négatif.');
      if(signal?.aborted)throw fail(409,'Demande arrêtée avant la génération.');
      if(activeJobs()>=4)throw fail(409,'Quatre images sont déjà en attente. Attends leur fin.');
      const [width,height]=FORMATS[format], id=randomUUID(), graph=structuredClone(profile.graph);
      graph[profile.positive].inputs.text=args.prompt.trim();graph[profile.sampler].inputs.seed=seed;
      if(profile.negative && args.negativePrompt!==undefined)graph[profile.negative].inputs.text=args.negativePrompt.trim();
      Object.assign(graph[profile.latent].inputs,{width,height,batch_size:1});graph[profile.output].inputs.filename_prefix='Bionic/'+profile.prefix+'/'+id;
      const job={id,owner:structuredClone(owner),prompt:args.prompt.trim(),...(profile.negative?{negativePrompt:graph[profile.negative].inputs.text}:{}),seed,format,width,height,workflowHash:profile.hash,workflowId:profile.id,comfyUrl:settings.url,outputNodeId:profile.output,status:'submitting',createdAt:Date.now(),updatedAt:Date.now()};
      preparing++;
      try { await persist(job);jobs.set(id,job); } finally { preparing--; }
      try {
        const result=await (await request('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:id})},job.comfyUrl)).json();
        if(typeof result.prompt_id!=='string'||!result.prompt_id)throw new Error('Missing prompt_id');
        await changed(job,{status:'queued',promptId:result.prompt_id});schedule(job);
      } catch(error) {
        await changed(job,{status:error.status?'failed':'unknown',error:error.status?error.message:'Résultat de soumission inconnu. Vérifie ComfyUI ; aucun nouvel envoi automatique.'});
      }
      return publicJob(job);
    })().finally(()=>locks.delete(key));
    locks.set(key,work);return work;
  }
  return {
    submit,
    getSettings,
    updateSettings(patch) {
      const operation=settingsMutation.then(async()=>{
        const previous=settingsStore.get(),next=validateComfySettings(patch,previous);
        const changed=['enabled','url','workflowId'].some(key=>next[key]!==previous[key]);
        if(changed&&activeJobs())throw fail(409,'Attends la fin des générations avant de modifier la configuration ComfyUI.');
        if(closed)throw fail(503,'Le service d’images est fermé.');
        await settingsStore.update(next);
        return getSettings();
      });
      settingsMutation=operation.catch(()=>{});
      return operation;
    },
    async checkConnection(proposal = {}) {
      if(!proposal||typeof proposal!=='object'||Array.isArray(proposal)||Object.keys(proposal).some(key=>!['url','workflowId'].includes(key)))throw fail(400,'Test ComfyUI invalide.');
      const settings=validateComfySettings(proposal,settingsStore.get()),checkedAt=Date.now();
      try {
        const responses=await Promise.all([request('/system_stats',{},settings.url),request('/object_info',{},settings.url),request('/queue',{},settings.url)]);
        const [stats,info,queue]=await Promise.all(responses.map(response=>response.json()));
        if(!stats.system||!info||Array.isArray(info)||typeof info!=='object'||!Array.isArray(queue.queue_running)||!Array.isArray(queue.queue_pending))throw new Error('Unexpected ComfyUI response');
        const workflows=[...profiles.values()].map(profile=>({id:profile.id,label:profile.label,...validateGraph(profile.graph,info)}));
        return {ok:workflows.find(profile=>profile.id===settings.workflowId).compatible,url:settings.url,workflowId:settings.workflowId,checkedAt,reachable:true,system:{comfyuiVersion:stats.system.comfyui_version??null,os:stats.system.os??null,deviceNames:(stats.devices??[]).map(device=>device.name)},queue:{running:queue.queue_running.length,pending:queue.queue_pending.length},workflows};
      } catch(error) {
        return {ok:false,url:settings.url,workflowId:settings.workflowId,checkedAt,reachable:false,error:error.status?error.message:'ComfyUI inaccessible ou réponse inattendue. Vérifie l’adresse et son serveur.',workflows:[]};
      }
    },
    get(id){if(!UUID.test(String(id))||!jobs.has(id))throw fail(404,'Génération introuvable.');return publicJob(jobs.get(id));},
    owner(id){if(!jobs.has(id))throw fail(404,'Génération introuvable.');return structuredClone(jobs.get(id).owner);},
    async image(id){const job=jobs.get(id);if(!job||job.status!=='succeeded')throw fail(404,'Image pas encore disponible.');const bytes=await fs.readFile(path.join(directory,job.id+'.png'));if(createHash('sha256').update(bytes).digest('hex')!==job.image.sha256)throw fail(409,'Copie de l’image endommagée.');return {bytes,mime:'image/png'};},
    refresh,
    async close(){closed=true;for(const timer of timers.values())clearTimeout(timer);timers.clear();await Promise.allSettled([settingsMutation,...locks.values(),...refreshing.values()]);}
  };
}
