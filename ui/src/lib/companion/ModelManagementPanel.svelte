<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr } from './preferences.svelte';
  import { readEngineCatalogue } from './engine-catalogue';
  import ServicesSettings from './settings/ServicesSettings.svelte';
  import LlamaServerSettings from './settings/LlamaServerSettings.svelte';
  import ImageModelManagement from './ImageModelManagement.svelte';
  import { post, message, type Request } from './settings/types';
  import './settings/settings.css';

  export type ManagedModel = { provider:'bionic'|'llamacpp'; modelId:string; inferenceRevision:string };
  type LoadIntent = { id:string; name:string; revision:string; endpoint:string; state:'loading'|'unknown'|'failed'|'loaded' };
  let { request, active=true, disabled=false, refreshRevision=0, onBusyChange, onChanged, onModelSelected, onOpenImages }: { request:Request; active?:boolean; disabled?:boolean;refreshRevision?:number;onBusyChange?:(value:boolean)=>void; onChanged?:()=>void|Promise<void>; onModelSelected?:(target:ManagedModel)=>void|Promise<void>;onOpenImages?:()=>void|Promise<void> }=$props();
  let section=$state<'models'|'bionic'|'llama'|'images'>('models'),visited=$state(['models']);
  let services=$state<any[]>([]),comfy=$state<any>(null);
  let connection=$state<any>(null),catalogue=$state<any[]>([]),profile=$state<any>(null),valid=$state(false),reading=$state(false),busy=$state(false),choice=$state('');
  let failure=$state(''),notice=$state(''),intent=$state<LoadIntent|null>(null),mounted=false,sequence=0,wasActive=false;
  let seenRevision=-1;
  const sameLoadScope=$derived(connection?.provider==='bionic'&&connection.revision===intent?.revision&&connection.apiUrl===intent?.endpoint);
  const uncertain=$derived(intent?.state==='unknown'&&sameLoadScope);
  const locked=$derived(disabled||reading||busy||uncertain||connection?.busy||connection?.reconciliationRequired);
  const modelRows=$derived(catalogue.filter(item=>item.type==='llm'));
  const ownedRunning=$derived(profile?.process?.owned===true&&profile.process.state==='running');
  const localConnected=$derived(connection?.provider==='llamacpp'&&connection.llamaUrl===profile?.profile?.endpoint);
  const labels={available:()=>tr('Disponible','Available'),loading:()=>tr('Chargement…','Loading…'),loaded:()=>tr('Chargé','Loaded'),unknown:()=>tr('Inconnu · à vérifier','Unknown · needs review'),failed:()=>tr('Erreur','Error')};
  $effect(()=>{onBusyChange?.(busy||uncertain);});
  function rowState(item:any):keyof typeof labels{const target=intent;if(!valid)return'unknown';if(target&&target.id===item.id&&sameLoadScope&&target.state!=='loaded')return target.state;return item.loaded||item.loadedInstances?.length?'loaded':'available';}
  function show(next:typeof section){section=next;if(!visited.includes(next))visited=[...visited,next];if(next==='models')void rereadAll();}
  async function refresh(clearFailure=true){
    const ticket=++sequence;reading=true;if(clearFailure){failure='';notice='';}
    const [engines,server,serviceStates,images]=await Promise.allSettled([readEngineCatalogue(route=>request(route)),request('/api/llama-server'),request('/api/local-services'),request('/api/comfy/settings')]);
    if(!mounted||ticket!==sequence)return false;
    if(server.status==='fulfilled')profile=server.value;else profile=null;
    services=serviceStates.status==='fulfilled'?serviceStates.value.services||[]:[];comfy=images.status==='fulfilled'?images.value:null;
    valid=false;
    if(engines.status==='fulfilled'){
      const result=engines.value,previous=connection;connection=result.inference;if(!previous||previous.revision!==connection.revision||previous.provider!==connection.provider||!choice)choice=connection.provider;
      if(result.kind==='ready'){
        if(result.inference.busy||result.inference.reconciliationRequired){try{const current=await request('/api/inference/settings');if(current.provider===result.inference.provider&&current.revision===result.inference.revision)connection=current;}catch{}}
        if(!mounted||ticket!==sequence)return false;
        catalogue=result.models;valid=true;
        if(intent&&sameLoadScope&&intent.state==='unknown'&&!connection.busy&&!connection.reconciliationRequired){
          const observed=catalogue.find(item=>item.id===intent?.id);
          intent={...intent,state:observed&&(observed.loaded||observed.loadedInstances?.length)?'loaded':'failed'};
          if(intent.state==='loaded')failure='';
          notice=intent.state==='loaded'?tr('État observé : ce modèle est chargé. Aucun second chargement envoyé.','Observed state: this model is loaded. No second load was sent.'):tr('État observé : le modèle n’est pas chargé. Aucun chargement renvoyé.','Observed state: the model is not loaded. No load was resubmitted.');
        }
      }else{catalogue=[];if(result.kind==='unavailable')failure=connection.provider==='llamacpp'&&profile&&!profile.process?.owned&&['configured','stopped'].includes(profile.process?.state)?'':message(result.failure);else failure=tr('Le moteur et le catalogue ne sont pas confirmés ensemble.','Engine and catalogue are not confirmed together.');}
    }else{catalogue=[];connection=null;failure=message(engines.reason);}
    reading=false;return valid;
  }
  async function changed(){await onChanged?.();}
  async function rereadAll(){await refresh();await changed();}
  async function selectModel(modelId:string){if(!valid||locked||!connection)return;await onModelSelected?.({provider:connection.provider,modelId,inferenceRevision:connection.revision});}
  async function loadModel(item:any){
    if(locked||!valid||connection?.provider!=='bionic'||item.loaded||item.loadedInstances?.length)return;
    const target={id:item.id,name:item.name||item.id,revision:connection.revision,endpoint:connection.apiUrl};
    if(!confirm(tr('Charger ce modèle dans Bionic avec ses réglages enregistrés ?\n','Load this model in Bionic using its saved settings?\n')+target.name))return;
    busy=true;failure='';notice='';
    try{
      const current=await request('/api/inference/settings');
      if(current.provider!=='bionic'||current.revision!==target.revision||current.apiUrl!==target.endpoint||current.busy||current.reconciliationRequired||typeof current.csrfNonce!=='string'||!current.csrfNonce)throw Error(tr('Le moteur ou ses droits ont changé. Actualise avant de confirmer à nouveau.','Engine or permissions changed. Refresh before confirming again.'));
      intent={...target,state:'loading'};
      try{await post(request,'/api/models/load',{modelId:target.id,expectedInferenceRevision:target.revision,consent:true},{'X-Local-Service-CSRF':current.csrfNonce});intent={...target,state:'unknown'};}
      catch(error:any){intent={...target,state:!error.status||error.status>=500||error.status===408?'unknown':'failed'};failure=message(error);}
      await refresh(false);
      if(intent?.state==='loaded')notice=tr('Le modèle est chargé. Utilise-le dans le chat quand tu le souhaites.','The model is loaded. Use it in the chat when you are ready.');
      else if(intent?.state==='unknown')notice=tr('Résultat non confirmé. Relis le catalogue ; aucun second chargement automatique.','Result unconfirmed. Refresh the catalogue; there is no automatic second load.');
    }catch(error){failure=message(error);}
    finally{busy=false;await changed();}
  }
  async function applyEngine(){
    if(locked||!connection||choice===connection.provider||!['bionic','llamacpp'].includes(choice))return;
    const target={provider:choice,revision:connection.revision};
    if(!confirm(tr('Appliquer ce moteur à tous les chats ? Aucun modèle ne sera chargé automatiquement.','Apply this engine to all chats? No model will be loaded automatically.')))return;
    busy=true;failure='';notice='';
    try{
      const current=await request('/api/inference/settings');
      if(current.revision!==target.revision||current.editable!==true||current.busy||current.reconciliationRequired)throw Error(tr('La connexion a changé. Relis son état avant de confirmer.','The connection changed. Refresh its status before confirming.'));
      try{await post(request,'/api/inference/settings',{provider:target.provider,expectedRevision:target.revision});}catch(error){failure=message(error);}
      await refresh(false);notice=tr('Connexion relue. Aucun changement renvoyé automatiquement.','Connection refreshed. No change was automatically resubmitted.');
    }catch(error){failure=message(error);}finally{busy=false;await changed();}
  }
  async function connectLocal(){
    if(locked||!ownedRunning||localConnected)return;
    const target={revision:connection?.revision,profileRevision:profile.profile.revision,endpoint:profile.profile.endpoint};
    const warning=connection?.hasLlamaToken?tr(' Le jeton de la connexion externe sera effacé.',' The external connection token will be cleared.'):'';
    if(!confirm(tr('Utiliser le processus llama-server possédé dans tous les chats ?','Use the owned llama-server process in all chats?')+warning))return;
    busy=true;failure='';notice='';
    try{
      const [current,server]=await Promise.all([request('/api/inference/settings'),request('/api/llama-server')]);
      if(current.revision!==target.revision||current.editable!==true||current.busy||current.reconciliationRequired||server.profile.revision!==target.profileRevision||server.profile.endpoint!==target.endpoint||server.process.owned!==true||server.process.state!=='running')throw Error(tr('Le profil ou la connexion a changé. Relis son état.','The profile or connection changed. Refresh its status.'));
      try{await post(request,'/api/inference/settings',{provider:'llamacpp',llamaUrl:target.endpoint,expectedRevision:current.revision,...(current.hasLlamaToken?{clearLlamaToken:true}:{})});}catch(error){failure=message(error);}
      await refresh(false);
      notice=tr('Connexion relue. Aucun processus externe n’a été adopté ou arrêté.','Connection refreshed. No external process was adopted or stopped.');
    }catch(error){failure=message(error);}finally{busy=false;await changed();}
  }
  async function serviceChanged(){await refresh();await changed();}
  $effect(()=>{if(mounted&&active&&!wasActive){wasActive=true;void refresh();}else if(!active)wasActive=false;});
  $effect(()=>{const revision=refreshRevision;if(mounted&&revision!==seenRevision){seenRevision=revision;void refresh();}});
  onMount(()=>{mounted=true;wasActive=active;seenRevision=refreshRevision;void refresh();return()=>{mounted=false;sequence++;};});
</script>

<section class="model-management" aria-label={tr('Pilotage des moteurs et modèles','Engine and model controls')}>
  <nav class="management-tabs" aria-label={tr('Pilotage des modèles','Model controls')}>
    <button type="button" aria-current={section==='models'?'page':undefined} onclick={()=>show('models')}>{tr('Modèles','Models')}</button>
    <button type="button" aria-current={section==='bionic'?'page':undefined} onclick={()=>show('bionic')}>{tr('Serveur Bionic','Bionic server')}</button>
    <button type="button" aria-current={section==='llama'?'page':undefined} onclick={()=>show('llama')}>{tr('Serveur llama.cpp','llama.cpp server')}</button>
    <button type="button" aria-current={section==='images'?'page':undefined} onclick={()=>show('images')}>{tr('Serveur d’images','Image server')}</button>
  </nav>
  <div class="engine-observations" aria-label={tr('États observés des moteurs','Observed engine states')}>
    <p>Bionic · {services.find(item=>item.id==='bionic')?.api?.state==='ready'?tr('API disponible','API available'):services.find(item=>item.id==='bionic')?.api?.state==='unreachable'?tr('API indisponible','API unavailable'):tr('État API inconnu','API state unknown')}</p>
    <p>llama.cpp · {connection?.provider==='llamacpp'&&valid&&catalogue.length?tr('Modèle chargé observé','Loaded model observed'):ownedRunning?tr('Profil possédé démarré','Owned profile running'):profile?.process?.state==='detected-unowned'?tr('Serveur externe détecté','External server detected'):profile?.process?tr('Profil local arrêté ou à vérifier','Local profile stopped or needs review'):tr('État inconnu','Unknown state')}</p>
    <p>ComfyUI · {comfy?.available||services.find(item=>item.id==='comfyui')?.api?.state==='ready'?tr('API disponible','API available'):comfy?.enabled===false?tr('Connexion désactivée · API non vérifiée','Connection disabled · API not checked'):comfy?tr('API indisponible','API unavailable'):tr('État inconnu','Unknown state')}</p>
  </div>
  <div hidden={section!=='models'}>
    <div class="management-current"><span>{tr('Moteur actif','Active engine')} · {connection?.provider==='bionic'?'Bionic':connection?.provider==='llamacpp'?'llama.cpp':tr('Inconnu','Unknown')}</span><Button type="button" variant="ghost" size="sm" onclick={rereadAll} disabled={reading||busy}>{tr('Relire les états','Refresh status')}</Button></div>
    {#if connection}<label class="setting-field">{tr('Moteur pour tous les chats','Engine for all chats')}<select aria-label={tr('Moteur pour tous les chats','Engine for all chats')} bind:value={choice} disabled={locked||connection.editable!==true}><option value="bionic">Bionic</option><option value="llamacpp">llama.cpp</option></select></label>{#if choice!==connection.provider}<Button type="button" disabled={locked} onclick={applyEngine}>{tr('Appliquer le moteur','Apply engine')}</Button>{/if}{/if}
    {#if reading}<p role="status">{tr('Lecture du moteur et des modèles…','Reading engine and models…')}</p>{/if}
    {#if connection?.provider==='bionic'}
      {#if !reading&&!valid}<p class="model-observation">{tr('Catalogue Bionic inconnu. Démarre son serveur ou vérifie la connexion ; une liste indisponible ne signifie pas qu’aucun modèle n’est installé.','Bionic catalogue unknown. Start its server or check the connection; an unavailable list does not mean no models are installed.')}</p><Button type="button" variant="outline" onclick={()=>show('bionic')}>{tr('Démarrer ou vérifier Bionic','Start or check Bionic')}</Button>{/if}
      {#each modelRows as item (item.id)}<div class="management-model" data-model-id={item.id}><div><strong>{item.name||item.id}</strong><p role="status">{labels[rowState(item)]()}</p></div>{#if rowState(item)==='loaded'}{#if onModelSelected}<Button type="button" variant="outline" size="sm" disabled={locked} onclick={()=>selectModel(item.id)} aria-label={tr('Utiliser dans le chat ','Use in chat ')+(item.name||item.id)}>{tr('Utiliser','Use')}</Button>{/if}{:else}<Button type="button" variant="outline" size="sm" disabled={locked||rowState(item)==='loading'||rowState(item)==='unknown'} onclick={()=>loadModel(item)} aria-label={tr('Charger ','Load ')+(item.name||item.id)}>{rowState(item)==='loading'?tr('Chargement…','Loading…'):tr('Charger','Load')}</Button>{/if}</div>{/each}
      {#if !reading&&valid&&!modelRows.length}<p>{tr('Bionic ne fournit aucun modèle de conversation dans son catalogue. Vérifie sa bibliothèque.','Bionic reports no conversation models in its catalogue. Check its library.')}</p>{/if}
    {:else if connection?.provider==='llamacpp'}<p class="model-observation">{tr('Choisis et charge un GGUF dans Serveur llama.cpp. Seuls les processus possédés par Canaé peuvent être arrêtés ou remplacés ici.','Choose and load a GGUF under llama.cpp server. Only Canaé-owned processes can be stopped or replaced here.')}</p><Button type="button" variant="outline" onclick={()=>show('llama')}>{tr('Charger ou piloter un GGUF','Load or control a GGUF')}</Button>{/if}
    {#if intent?.state==='unknown'&&!modelRows.some(item=>item.id===intent?.id)}<p class="model-observation" role="status">{intent.name} · {tr('Inconnu · relis les états avant toute autre demande. Aucun nouvel envoi automatique.','Unknown · refresh status before another request. No automatic resubmission.')}</p>{/if}
  </div>
  {#if visited.includes('bionic')}<fieldset class="management-service" hidden={section!=='bionic'} {disabled}><ServicesSettings {request} scope="bionic" active={active&&section==='bionic'} /></fieldset>{/if}
  {#if visited.includes('llama')}<fieldset class="management-service" hidden={section!=='llama'} {disabled}><LlamaServerSettings {request} active={active&&section==='llama'} onInferenceChange={serviceChanged} idPrefix="model-management-" /><Button type="button" variant="outline" disabled={locked||!ownedRunning||localConnected} onclick={connectLocal}>{localConnected?tr('Profil utilisé dans le chat','Profile used in chat'):tr('Utiliser ce profil dans le chat','Use this profile in chat')}</Button></fieldset>{/if}
  {#if visited.includes('images')}<fieldset class="management-service" hidden={section!=='images'} {disabled}><ServicesSettings {request} scope="comfyui" active={active&&section==='images'} /><ImageModelManagement {request} {onOpenImages} onChanged={serviceChanged} /></fieldset>{/if}
  {#if failure}<p class="management-error" role="alert">{failure}</p>{/if}{#if notice}<p class="model-observation" role="status">{notice}</p>{/if}
</section>

<style>
  .model-management{padding:12px 0;border-bottom:1px solid var(--border);}
  .management-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;}
  .management-tabs button{min-height:44px;padding:8px 10px;border-radius:6px;font-size:12px;}
  .management-tabs button:hover,.management-tabs button[aria-current=page]{background:var(--muted);}
  .management-tabs button:focus-visible{outline:2px solid var(--ring);outline-offset:2px;}
  .management-current{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;}
  .engine-observations{margin:0 0 12px;color:var(--muted-foreground);font-size:11px;line-height:1.5;}.engine-observations p{margin:3px 0;overflow-wrap:anywhere;}
  .management-model{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);}
  .management-model>div{min-width:0;}.management-model strong{font-size:12px;overflow-wrap:anywhere;}.management-model p{margin:3px 0 0;color:var(--muted-foreground);font-size:11px;}
  .model-observation{font-size:12px;line-height:1.55;overflow-wrap:anywhere;color:var(--muted-foreground);}
  .management-error{font-size:12px;line-height:1.55;overflow-wrap:anywhere;color:var(--destructive);}
  .management-service{font-size:12px;line-height:1.55;border:0;padding:0;margin:0;min-width:0;}.management-service :global(h3){font-size:13px;}.management-service :global(h4){font-size:12px;}.management-service :global(button){min-height:44px;max-width:100%;white-space:normal;}
  [hidden]{display:none;}
</style>
