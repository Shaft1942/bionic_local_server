const fail = message => Object.assign(new Error(message), { status:400 });
export const LORA_PROFILES = ['krea2_turbo','hassaku_illustrious'];

export function normalizeLoraProfiles(value = {}, previous = {}) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!LORA_PROFILES.includes(key)))throw fail('Profils de LoRA invalides.');
  const result={};
  for(const id of LORA_PROFILES){
    const slots=value[id]??previous[id]??[];
    if(!Array.isArray(slots)||slots.length>2)throw fail('Deux LoRA maximum par modèle.');
    const names=new Set();
    result[id]=slots.map(slot=>{
      if(!slot||typeof slot!=='object'||Array.isArray(slot)||Object.keys(slot).some(key=>!['name','strength'].includes(key)))throw fail('Emplacement de LoRA invalide.');
      const name=slot.name??'',strength=slot.strength??1;
      if(typeof name!=='string'||name.length>512||/[\x00-\x1f:]/.test(name)||/^[\\/]/.test(name)||name.split(/[\\/]/).some(part=>part==='..')||typeof strength!=='number'||!Number.isFinite(strength)||strength < -2||strength > 2)throw fail('LoRA invalide : nom relatif et force entre −2 et 2 attendus.');
      if(name&&names.has(name))throw fail('Choisis deux LoRA différents pour ce modèle.');
      if(name)names.add(name);
      return {name,strength};
    });
  }
  return result;
}

/** Keep the checkpoint VAE untouched; Krea LoRA never changes the text encoder. */
export function applyLoras(graph, profile, slots) {
  const active=normalizeLoraProfiles({[profile.id]:slots})[profile.id].filter(slot=>slot.name&&slot.strength!==0);
  let model=structuredClone(graph[profile.sampler].inputs.model);
  let clip=structuredClone(graph[profile.positive].inputs.clip);
  for(const [index,slot]of active.entries()){
    const id=String(201+index);if(graph[id])throw fail('Identifiant du nœud LoRA déjà utilisé.');
    const krea=profile.id==='krea2_turbo';
    graph[id]={class_type:krea?'LoraLoaderModelOnly':'LoraLoader',inputs:{model,...(!krea?{clip}:{}),lora_name:slot.name,strength_model:slot.strength,...(!krea?{strength_clip:slot.strength}:{})},_meta:{title:'LoRA '+(index+1)+' — '+slot.name}};
    model=[id,0];if(!krea)clip=[id,1];
  }
  if(active.length){
    graph[profile.sampler].inputs.model=model;
    if(profile.id==='hassaku_illustrious'){
      graph[profile.positive].inputs.clip=clip;
      if(profile.negative)graph[profile.negative].inputs.clip=clip;
    }
  }
  return active;
}
