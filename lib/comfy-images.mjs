import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createComfySettings, localComfyURL, validateComfySettings } from './comfy-settings.mjs';
import { applyLoras, normalizeLoraProfiles } from './comfy-loras.mjs';
export { localComfyURL } from './comfy-settings.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });
const UUID = /^[a-f0-9-]{36}$/i;
const ACTIVE = new Set(['queued', 'running']);
const FORMATS = { square: [1024, 1024], portrait: [832, 1216], landscape: [1216, 832] };
const PNG = Buffer.from([137,80,78,71,13,10,26,10]);
const MAX_IMAGE = 32 * 1024 * 1024;
const MEMORY_NODE = 'FreeMemoryAfterWorkflow';

function executionDuration(entry) {
  const messages = entry?.status?.messages;
  if (!Array.isArray(messages)) return null;
  const start = messages.find(([type]) => type === 'execution_start')?.[1]?.timestamp;
  const end = messages.find(([type]) => ['execution_success', 'execution_error', 'execution_interrupted'].includes(type))?.[1]?.timestamp;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && end >= start ? end - start : null;
}

const PROFILE_DEFINITIONS = [
  { id:'krea2_turbo',label:'Krea 2 Turbo',file:'krea2-turbo.api.json',sampler:'3',positive:'6',latent:'5',output:'9',prefix:'Krea2',defaultFormat:'square',expected:{'99':'FreeMemoryAfterWorkflow','3':'KSampler','5':'EmptyLatentImage','6':'CLIPTextEncode','8':'VAEDecode','9':'SaveImage','10':'UNETLoader','11':'CLIPLoader','12':'VAELoader','13':'ConditioningZeroOut'} },
  { id:'hassaku_illustrious',label:'Hassaku XL Illustrious v34',file:'hassaku-illustrious.api.json',sampler:'56',positive:'6',negative:'7',latent:'5',output:'19',prefix:'Hassaku',defaultFormat:'portrait',expected:{'99':'FreeMemoryAfterWorkflow','53':'CheckpointLoaderSimple','6':'CLIPTextEncode','7':'CLIPTextEncode','5':'EmptyLatentImage','56':'KSampler','17':'VAEDecode','19':'SaveImage'} }
];

function configuredGraph(profile, memoryCleanup) {
  const graph = structuredClone(profile.graph);
  if (!memoryCleanup) delete graph['99'];
  return graph;
}

function validateGraph(graph, info) {
  const errors = [], models = [];
  for (const [id, node] of Object.entries(graph)) {
    const definition = info[node.class_type];
    for (const [name, value] of Object.entries(node.inputs)) {
      if (['unet_name','clip_name','vae_name','ckpt_name'].includes(name)) {
        const choices = definition?.input?.required?.[name]?.[0];
        const folder = {unet_name:'diffusion_models',clip_name:'text_encoders',vae_name:'vae',ckpt_name:'checkpoints'}[name];
        models.push({node:node.class_type,input:name,name:value,folder:'models/'+folder,available:Array.isArray(choices) && choices.includes(value)});
      }
    }
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
    }
  }
  if (Object.values(graph).some(node => node.class_type === MEMORY_NODE) && info[MEMORY_NODE]?.output_node !== true) {
    errors.push('Nettoyage mémoire indisponible : installe comfyui/custom_nodes/free_memory_after_workflow.py sur le serveur ComfyUI, puis redémarre ce serveur après ses travaux.');
  }
  return { compatible:errors.length === 0, errors, models };
}

/** Bundled workflows only; each job keeps its endpoint and output contract. */
export async function createComfyImages({ directory, url, enabled = false, workflowId = 'krea2_turbo', memoryCleanup = false, settingsFile = path.join(directory,'..','comfy-settings.json'), fetchImpl = globalThis.fetch, workflowFile, pollMs = 2000, deadlineMs = 1800000, coordinator } = {}) {
  const jobs = new Map(), locks = new Map(), timers = new Map(), refreshing = new Map(), profiles = new Map();
  const incidents = [], resourceLeases = new Map(), deferredRelease = new Set(), stopController = new AbortController();
  const settingsStore = await createComfySettings({ file:settingsFile,enabled,url,workflowId,memoryCleanup });
  let settingsMutation = Promise.resolve(), preparing = 0;
  let closed = false;
  await fs.mkdir(directory, { recursive: true });
  for (const definition of PROFILE_DEFINITIONS) {
    const file = definition.id === 'krea2_turbo' && workflowFile ? workflowFile : fileURLToPath(new URL('../workflows/'+definition.file, import.meta.url));
    const raw = await fs.readFile(file), graph = JSON.parse(raw);
    if (Object.keys(graph).length !== Object.keys(definition.expected).length || Object.entries(definition.expected).some(([id,kind]) => graph[id]?.class_type !== kind) || (definition.id === 'krea2_turbo' && graph['11'].inputs.type !== 'krea2')) throw new Error(`Workflow local invalide : ${definition.id}.`);
    profiles.set(definition.id, { ...definition,graph,hash:createHash('sha256').update(raw).digest('hex') });
  }
  const activeJobs = () => preparing + Math.max(resourceLeases.size,[...jobs.values()].filter(job => ACTIVE.has(job.status) || ['submitting','waiting-resource'].includes(job.status)).length);
  const getSettings = () => ({ ...settingsStore.get(),workflows:[...profiles.values()].map(profile => ({id:profile.id,label:profile.label,defaultFormat:profile.defaultFormat,negativePrompt:!!profile.negative})),activeJobs:activeJobs(),degraded:incidents.length>0,jobIncidents:structuredClone(incidents),experimentalDeferred:'La chaîne Hassaku vers Krea 2 reste expérimentale : qualité et fidélité non validées sur le GPU. Les deux workflows séparés sont disponibles.' });
  const persist = async job => { const filename = path.join(directory,job.id+'.json'); await fs.writeFile(filename+'.tmp',JSON.stringify(job)); await fs.rename(filename+'.tmp',filename); };
  const publicJob = job => ({ id:job.id, status:job.status, promptId:job.promptId, prompt:job.prompt, seed:job.seed, format:job.format, width:job.width, height:job.height, workflowId:job.workflowId,workflowLabel:job.workflowLabel??profiles.get(job.workflowId)?.label,loras:job.loras??[],memoryCleanup:job.memoryCleanup===true,...(job.memoryCleanupRecovery?{memoryCleanupRecovery:structuredClone(job.memoryCleanupRecovery)}:{}),...(Number.isSafeInteger(job.executionDurationMs)?{executionDurationMs:job.executionDurationMs}:{}),comfyUrl:job.comfyUrl,createdAt:job.createdAt, updatedAt:job.updatedAt, ...(job.error?{error:job.error}:{}), ...(job.image?{image:{width:job.image.width,height:job.image.height,sha256:job.image.sha256,size:job.image.size}}:{}) });
  const releaseJob = job => { resourceLeases.get(job.id)?.();resourceLeases.delete(job.id); };
  const changed = async (job, patch) => { Object.assign(job,patch,{updatedAt:Date.now()}); await persist(job); if(!deferredRelease.has(job.id)&&!ACTIVE.has(job.status)&&!['submitting','waiting-resource'].includes(job.status))releaseJob(job); return publicJob(job); };
  async function request(route, options = {}, base = settingsStore.get().url, timeoutMs = 20000) {
    const signals=[AbortSignal.timeout(timeoutMs),stopController.signal,...(options.signal?[options.signal]:[])];
    const response = await fetchImpl(localComfyURL(base)+route,{...options,redirect:'error',signal:AbortSignal.any(signals)});
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
  async function recoverFailedWorkflow(job) {
    // A terminal failure can occur before SaveImage and the cleanup output node.
    // Only new jobs opt in. Persist before HTTP, so a restart never repeats /free.
    if (job.memoryCleanupOnFailure !== true || job.memoryCleanupRecovery) return;
    await changed(job,{memoryCleanupRecovery:{state:'checking',checkedAt:Date.now()}});
    try {
      const queue=await (await request('/queue',{},job.comfyUrl)).json();
      if (!Array.isArray(queue.queue_running) || !Array.isArray(queue.queue_pending)) throw new Error('Unexpected queue');
      if (queue.queue_running.length || queue.queue_pending.length) {
        await changed(job,{memoryCleanupRecovery:{state:'skipped_busy',checkedAt:Date.now()}});
        return;
      }
      await changed(job,{memoryCleanupRecovery:{state:'requesting',requestedAt:Date.now()}});
      // /free only sets worker flags. Even if a new job races this check, ComfyUI
      // processes the flags after that prompt; this never calls /interrupt.
      await request('/free',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({unload_models:true,free_memory:true})},job.comfyUrl);
      await changed(job,{memoryCleanupRecovery:{state:'requested',requestedAt:job.memoryCleanupRecovery.requestedAt}});
    } catch(error) {
      await changed(job,{memoryCleanupRecovery:{state:error.status?'failed':'unknown',checkedAt:Date.now()}});
    }
  }
  async function doRefresh(job) {
    if(!ACTIVE.has(job.status))return publicJob(job);
    try {
      const history=await (await request('/history/'+encodeURIComponent(job.promptId),{},job.comfyUrl)).json(), entry=history[job.promptId];
      if(entry?.status?.status_str==='error'||entry?.status?.messages?.some(([type])=>['execution_error','execution_interrupted'].includes(type))) {
        const event=entry.status.messages?.find(([type])=>['execution_error','execution_interrupted'].includes(type));
        const detail=event?.[1]?.exception_message;
        deferredRelease.add(job.id);
        try {
          await changed(job,{status:'failed',executionDurationMs:executionDuration(entry),error:'La génération ComfyUI a échoué.'+(typeof detail==='string'?' '+detail.slice(0,400):'')});
          await recoverFailedWorkflow(job);
        } finally { deferredRelease.delete(job.id);releaseJob(job); }
        return publicJob(job);
      }
      if(entry?.status?.completed===true) {
        const descriptor=entry.outputs?.[job.outputNodeId]?.images?.find(item=>item.type==='output');
        if(!descriptor||typeof descriptor.filename!=='string'||typeof descriptor.subfolder!=='string')return await changed(job,{status:'failed',error:'ComfyUI a terminé sans image sauvegardée.'});
        const response=await request('/view?'+new URLSearchParams({filename:descriptor.filename,subfolder:descriptor.subfolder,type:'output'}),{},job.comfyUrl);
        const bytes=await imageBytes(response), width=bytes.readUInt32BE(16), height=bytes.readUInt32BE(20);
        if(width!==job.width||height!==job.height)throw fail(502,'Les dimensions de l’image ComfyUI sont inattendues.');
        await fs.writeFile(path.join(directory,job.id+'.png'),bytes);
        return await changed(job,{status:'succeeded',executionDurationMs:executionDuration(entry),error:null,image:{width,height,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}});
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
    let job;
    try {
      const info=await fs.lstat(path.join(directory,name));
      if(!info.isFile()||info.isSymbolicLink()||info.size>262144)throw new Error('Invalid job file');
      job=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
      if(!job || !UUID.test(job.id)||name!==job.id+'.json'||!job.owner||['projectId','chatId','messageId','requestId'].some(key=>typeof job.owner[key]!=='string'||!job.owner[key]) || !['waiting-resource','submitting','queued','running','succeeded','failed','unknown','stopped'].includes(job.status) || typeof job.prompt!=='string' || !Number.isSafeInteger(job.width)||!Number.isSafeInteger(job.height)||job.width<=0||job.height<=0 || !Number.isSafeInteger(job.createdAt))throw new Error('Invalid job');
      job.comfyUrl=localComfyURL(job.comfyUrl ?? settingsStore.get().url);
      if(ACTIVE.has(job.status)&&typeof job.promptId!=='string')throw new Error('Invalid prompt identity');
      if(job.status==='succeeded'&&(!job.image||!/^[a-f0-9]{64}$/.test(job.image.sha256)))throw new Error('Invalid image receipt');
    } catch {
      incidents.push({id:name.slice(0,-5),code:'unreadable-job',message:'Suivi image illisible. Ses octets sont conservés ; aucun envoi n’a été rejoué.'});
      continue;
    }
    // V1 jobs were Krea 2 only. Pin them during migration, even when disabled.
    job.workflowId=job.workflowId ?? 'krea2_turbo';
    job.outputNodeId=job.outputNodeId ?? '9';
    if(job.status==='submitting')await changed(job,{status:'unknown',error:'Soumission interrompue par le redémarrage. Vérifie ComfyUI ; aucun nouvel envoi automatique.'});
    else if(job.status==='waiting-resource')await changed(job,{status:'stopped',error:'Attente interrompue par le redémarrage. Cette image n’a pas été envoyée.'});
    // A finished V1 job is upgraded in memory only: keep its original file intact.
    else if(ACTIVE.has(job.status))await persist(job);
    if(ACTIVE.has(job.status)&&coordinator)resourceLeases.set(job.id,coordinator.restoreImage());
    jobs.set(job.id,job);schedule(job);
  }
  function resolveSelection(workflowId) {
    const settings=settingsStore.get(),id=workflowId??settings.workflowId;
    if(!profiles.has(id))throw fail(400,'Modèle d’image inconnu.');
    return {workflowId:id,memoryCleanup:settings.memoryCleanup,loras:structuredClone(settings.loraProfiles[id])};
  }
  async function loraCatalog(proposal = {}) {
    if(!proposal||typeof proposal!=='object'||Array.isArray(proposal)||Object.keys(proposal).some(key=>key!=='url'))throw fail(400,'Demande de liste LoRA invalide.');
    const url=localComfyURL(proposal.url??settingsStore.get().url);
    const info=await (await request('/object_info',{},url)).json();
    const loaders={};
    for(const kind of ['LoraLoader','LoraLoaderModelOnly']){
      const choices=info[kind]?.input?.required?.lora_name?.[0];
      loaders[kind]=Array.isArray(choices)?choices.filter(name=>typeof name==='string'):[];
    }
    return {url,loras:[...new Set(Object.values(loaders).flat())].sort(),loaders,checkedAt:Date.now()};
  }
  async function submit(args, owner, signal, selection) {
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
      const chosen=selection??resolveSelection(args.workflowId);
      if(selection&&args.workflowId!==undefined&&args.workflowId!==selection.workflowId)throw fail(400,'Le modèle d’image est fixé par le choix de l’utilisateur.');
      const profile=profiles.get(chosen.workflowId);
      if(!profile)throw fail(400,'Modèle d’image inconnu.');
      const configured=normalizeLoraProfiles({[profile.id]:chosen.loras??[]})[profile.id];
      const format=args.format??profile.defaultFormat;
      if(args.negativePrompt && !profile.negative)throw fail(400,'Ce workflow ne propose pas de prompt négatif.');
      if(signal?.aborted)throw fail(409,'Demande arrêtée avant la génération.');
      if(activeJobs()>=4)throw fail(409,'Quatre images sont déjà en attente. Attends leur fin.');
      const cleanup = chosen.memoryCleanup ?? settings.memoryCleanup;
      if (typeof cleanup !== 'boolean') throw fail(400,'Nettoyage mémoire invalide.');
      const [width,height]=FORMATS[format], id=randomUUID(), graph=configuredGraph(profile,cleanup);
      graph[profile.positive].inputs.text=args.prompt.trim();graph[profile.sampler].inputs.seed=seed;
      if(profile.negative && args.negativePrompt!==undefined)graph[profile.negative].inputs.text=args.negativePrompt.trim();
      Object.assign(graph[profile.latent].inputs,{width,height,batch_size:1});graph[profile.output].inputs.filename_prefix='Bionic/'+profile.prefix+'/'+id;
      const loras=applyLoras(graph,profile,configured);
      preparing++;
      try {
        if(loras.length){
          const catalog=await loraCatalog({url:settings.url});
          const loader=profile.id==='krea2_turbo'?'LoraLoaderModelOnly':'LoraLoader';
          for(const lora of loras)if(!catalog.loaders[loader].includes(lora.name))throw fail(400,'LoRA absent de ComfyUI : '+lora.name+'. Actualise la liste dans les paramètres.');
        }
      } finally { preparing--; }
      const job={id,owner:structuredClone(owner),prompt:args.prompt.trim(),...(profile.negative?{negativePrompt:graph[profile.negative].inputs.text}:{}),seed,format,width,height,workflowHash:profile.hash,workflowId:profile.id,workflowLabel:profile.label,loras,memoryCleanup:cleanup,memoryCleanupOnFailure:cleanup,comfyUrl:settings.url,outputNodeId:profile.output,status:'waiting-resource',createdAt:Date.now(),updatedAt:Date.now()};
      preparing++;
      try { await persist(job);jobs.set(id,job); } finally { preparing--; }
      try {
        const admissionSignal=signal?AbortSignal.any([signal,stopController.signal]):stopController.signal;
        try {
          if(coordinator)resourceLeases.set(id,await coordinator.acquire('image',admissionSignal));
          if(admissionSignal.aborted)throw fail(409,'Demande arrêtée avant la génération.');
        } catch(error) { await changed(job,{status:'stopped',error:'Attente arrêtée ; cette image n’a pas été envoyée.'});return publicJob(job); }
        await changed(job,{status:'submitting'});
        const result=await (await request('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:id}),signal:admissionSignal},job.comfyUrl)).json();
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
    resolveSelection,
    listLoras:loraCatalog,
    async discoverServers(proposal = {}) {
      if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal) || Object.keys(proposal).some(key=>key!=='url')) throw fail(400,'Recherche ComfyUI invalide.');
      const urls=[...new Set([localComfyURL(proposal.url ?? settingsStore.get().url),'http://127.0.0.1:8188','http://127.0.0.1:8000'])];
      const servers=await Promise.all(urls.map(async url=>{
        try {
          const stats=await (await request('/system_stats',{},url,1800)).json();
          if (!stats.system || typeof stats.system.comfyui_version !== 'string') return null;
          return {url,version:stats.system.comfyui_version};
        } catch { return null; }
      }));
      return {servers:servers.filter(Boolean),tested:urls};
    },
    getSettings,
    updateSettings(patch) {
      const operation=settingsMutation.then(async()=>{
        const previous=settingsStore.get(),next=validateComfySettings(patch,previous);
        const changed=['enabled','url','workflowId','memoryCleanup'].some(key=>next[key]!==previous[key])||JSON.stringify(next.loraProfiles)!==JSON.stringify(previous.loraProfiles);
        if(changed&&activeJobs())throw fail(409,'Attends la fin des générations avant de modifier la configuration ComfyUI.');
        if(closed)throw fail(503,'Le service d’images est fermé.');
        await settingsStore.update(next);
        return getSettings();
      });
      settingsMutation=operation.catch(()=>{});
      return operation;
    },
    async checkConnection(proposal = {}) {
      if(!proposal||typeof proposal!=='object'||Array.isArray(proposal)||Object.keys(proposal).some(key=>!['url','workflowId','loraProfiles','memoryCleanup'].includes(key)))throw fail(400,'Test ComfyUI invalide.');
      const settings=validateComfySettings(proposal,settingsStore.get()),checkedAt=Date.now();
      try {
        const responses=await Promise.all([request('/system_stats',{},settings.url),request('/object_info',{},settings.url),request('/queue',{},settings.url)]);
        const [stats,info,queue]=await Promise.all(responses.map(response=>response.json()));
        if(!stats.system||!info||Array.isArray(info)||typeof info!=='object'||!Array.isArray(queue.queue_running)||!Array.isArray(queue.queue_pending))throw new Error('Unexpected ComfyUI response');
        const workflows=[...profiles.values()].map(profile=>{const graph=configuredGraph(profile,settings.memoryCleanup);const loras=applyLoras(graph,profile,settings.loraProfiles[profile.id]);return {id:profile.id,label:profile.label,loras,...validateGraph(graph,info)};});
        return {ok:workflows.find(profile=>profile.id===settings.workflowId).compatible,url:settings.url,workflowId:settings.workflowId,checkedAt,reachable:true,memoryCleanup:{enabled:settings.memoryCleanup,node:MEMORY_NODE,available:info[MEMORY_NODE]?.output_node===true,packagePath:'comfyui/custom_nodes/free_memory_after_workflow.py',afterWorkflow:true,compatible:info[MEMORY_NODE]?.output_node===true && info.SaveImage?.output?.[0]==='IMAGE'},system:{comfyuiVersion:stats.system.comfyui_version??null,os:stats.system.os??null,deviceNames:(stats.devices??[]).map(device=>device.name)},queue:{running:queue.queue_running.length,pending:queue.queue_pending.length},workflows};
      } catch(error) {
        return {ok:false,url:settings.url,workflowId:settings.workflowId,checkedAt,reachable:false,error:error.status?error.message:'ComfyUI inaccessible ou réponse inattendue. Vérifie l’adresse et son serveur.',workflows:[]};
      }
    },
    get(id){if(!UUID.test(String(id))||!jobs.has(id))throw fail(404,'Génération introuvable.');return publicJob(jobs.get(id));},
    findForOwner(owner){const job=[...jobs.values()].find(job=>['projectId','chatId','messageId','requestId'].every(key=>job.owner[key]===owner?.[key]));return job?publicJob(job):null;},
    owner(id){if(!jobs.has(id))throw fail(404,'Génération introuvable.');return structuredClone(jobs.get(id).owner);},
    async image(id){const job=jobs.get(id);if(!job||job.status!=='succeeded')throw fail(404,'Image pas encore disponible.');const bytes=await fs.readFile(path.join(directory,job.id+'.png'));if(createHash('sha256').update(bytes).digest('hex')!==job.image.sha256)throw fail(409,'Copie de l’image endommagée.');return {bytes,mime:'image/png'};},
    refresh,
    async close(){closed=true;stopController.abort();for(const timer of timers.values())clearTimeout(timer);timers.clear();const settled=await Promise.allSettled([settingsMutation,...locks.values(),...refreshing.values()]);for(const release of resourceLeases.values())release();resourceLeases.clear();const rejected=settled.find(result=>result.status==='rejected');if(rejected)throw rejected.reason;}
  };
}
