<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Cpu, RefreshCw, X } from '@lucide/svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr } from './preferences.svelte';
  import { post, message, uuid, type Request } from './settings/types';

  let { request, models, inference, onModelsChange, disabled=false }: {
    request:Request;models:any[];inference:any;onModelsChange?:()=>void|Promise<void>;disabled?:boolean;
  }=$props();
  let panel:HTMLDivElement,trigger:HTMLButtonElement;
  let open=$state(false),loading=$state(false),busy=$state(''),failure=$state(''),notice=$state('');
  let catalogue=$state<any>(null),connection=$state<any>(null),profile=$state<any>(null),uncertain=$state<any>(null),profileReadValid=$state(false);
  let sequence=0,mounted=false;
  const instances=$derived((catalogue?.provider==='bionic'?catalogue.models||[]:[]).flatMap((model:any)=>(model.loadedInstances||[]).map((instance:any)=>({...instance,model}))));
  const owned=$derived(profile?.process?.owned===true);
  const connected=$derived(connection?.provider==='llamacpp'&&connection.llamaUrl===profile?.profile?.endpoint);
  const external=$derived(catalogue?.provider==='llamacpp'&&!(owned&&connected)?catalogue.models||[]:[]);
  const count=$derived(catalogue?instances.length+Number(owned)+external.length:models.reduce((total:number,model:any)=>total+(model.loadedInstances?.length||0),0));
  const scopeCurrent=$derived(!!catalogue&&catalogue.inferenceRevision===connection?.revision&&catalogue.provider===connection?.provider);
  const unknownStop=$derived(profile?.operation?.action==='stop'&&profile.operation.state==='unknown');
  const locked=$derived(disabled||loading||!!busy||!!uncertain||unknownStop||catalogue?.generationActive||catalogue?.unloading||catalogue?.reconciliationRequired);
  const modelType=(type:string)=>type==='embedding'?tr('Embeddings','Embedding'):type==='decision'?tr('Décision','Decision'):tr('Conversation','Conversation');

  function position(){
    if(!open||!panel||!trigger)return;
    const rect=trigger.getBoundingClientRect(),gap=10,padding=12;
    panel.style.left=Math.max(padding,Math.min(rect.left,innerWidth-panel.offsetWidth-padding))+'px';
    panel.style.top=Math.max(padding,Math.min(rect.top-panel.offsetHeight-gap,innerHeight-panel.offsetHeight-padding))+'px';
  }
  function settleUnknown(){
    if(!uncertain)return;
    if(uncertain.kind==='bionic'&&scopeCurrent&&!catalogue.unloading&&!catalogue.reconciliationRequired){
      if(catalogue.provider!==uncertain.provider||catalogue.inferenceRevision!==uncertain.revision||connection.apiUrl!==uncertain.endpoint){
        notice=tr('Le moteur a changé. Le résultat du déchargement sur le moteur précédent reste à vérifier ; aucun nouvel envoi automatique.','The engine changed. The previous engine’s unload result still needs review; there is no automatic resubmission.');failure='';uncertain=null;return;
      }
      const present=instances.some((item:any)=>item.id===uncertain.instanceId);
      notice=present?tr('Cette instance est toujours chargée. Aucun déchargement renvoyé automatiquement.','This instance is still loaded. No unload was automatically resubmitted.'):tr('État retrouvé : cette instance est déchargée. Aucun second envoi.','Recovered status: this instance is unloaded. No second request was sent.');
      failure='';uncertain=null;
    }else if(uncertain.kind==='llama'&&profileReadValid&&!profile.lifecycle?.active&&profile.operation?.state!=='unknown'){
      if(profile.operation?.requestId!==uncertain.requestId||profile.profile.revision!==uncertain.revision){
        notice=tr('Une autre opération du serveur est maintenant affichée. Le résultat de l’arrêt précédent reste à vérifier ; aucun nouvel arrêt envoyé.','Another server operation is now displayed. The previous stop result still needs review; no new stop was sent.');failure='';uncertain=null;return;
      }
      if(!profile.process.owned&&['configured','stopped'].includes(profile.process.state)&&profile.operation?.state==='succeeded'){
        notice=tr('État retrouvé : le processus possédé est arrêté. Aucun second envoi.','Recovered status: the owned process is stopped. No second request was sent.');failure='';uncertain=null;
      }else if(profile.process.state==='detected-unowned'||profile.operation?.state==='failed'){
        notice=tr('Le suivi ne confirme pas un arrêt disponible sur ce port. Un serveur externe reste hors du contrôle de Canaé ; aucun nouvel arrêt envoyé.','Tracking does not confirm a completed stop on this port. An external server remains outside Canaé’s control; no new stop was sent.');failure='';uncertain=null;
      }
    }
  }
  async function refresh(clearFailure=true){
    const ticket=++sequence;loading=true;if(clearFailure)failure='';
    const results=await Promise.allSettled([request('/api/models'),request('/api/inference/settings'),request('/api/llama-server')]);
    if(!mounted||ticket!==sequence)return;
    const [listed,current,server]=results;
    if(current.status==='fulfilled')connection=current.value;
    profileReadValid=server.status==='fulfilled';if(server.status==='fulfilled')profile=server.value;
    if(listed.status==='fulfilled')catalogue=listed.value;
    else if(current.status==='fulfilled'&&server.status==='fulfilled'&&current.value.provider==='llamacpp'&&current.value.llamaUrl===server.value.profile.endpoint&&!server.value.process.owned&&['configured','stopped','failed'].includes(server.value.process.state)){
      // A stopped owned endpoint has no catalogue. Its process snapshot remains authoritative.
      catalogue={models:[],provider:current.value.provider,inferenceRevision:current.value.revision,generationActive:false,unloading:false,reconciliationRequired:false};
    }else{catalogue=null;failure=message(listed.reason);}
    if(current.status==='rejected')failure=message(current.reason);
    if(server.status==='rejected')failure=message(server.reason);
    settleUnknown();loading=false;await tick();position();
  }
  async function unload(instance:any){
    if(locked||!scopeCurrent||instance.model.modelManagement===false)return;
    if(!confirm(tr('Décharger cette instance de modèle : ','Unload this model instance: ')+instance.model.name+'\n'+instance.id+'\n\n'+tr('Les conversations qui l’utilisent devront recharger leur modèle.','Conversations using it will need to reload their model.')))return;
    const target={kind:'bionic',instanceId:instance.id,provider:catalogue.provider,revision:catalogue.inferenceRevision,endpoint:connection.apiUrl};
    busy=instance.id;failure='';notice='';
    try{
      await post(request,'/api/models/unload',{instanceId:instance.id,expectedInferenceRevision:catalogue.inferenceRevision});
      uncertain=target;
      await refresh(false);
      notice=!scopeCurrent||catalogue.inferenceRevision!==target.revision||catalogue.provider!==target.provider||connection.apiUrl!==target.endpoint?tr('Le moteur a changé après la demande. Le résultat sur le moteur précédent reste distinct de l’état affiché. Aucun nouvel envoi automatique.','The engine changed after the request. The previous engine’s result is separate from the displayed status. There is no automatic resubmission.'):!instances.some((item:any)=>item.id===instance.id)?tr('Instance déchargée.','Instance unloaded.'):tr('État relu : cette instance est encore chargée. Aucun nouvel envoi automatique.','Status refreshed: this instance is still loaded. No automatic retry.');
    }catch(error:any){
      failure=message(error);
      if(!error.status||error.status>=500||error.status===408)uncertain=target;
      await refresh(false);
      if(!notice)notice=tr('État relu. Aucun déchargement renvoyé automatiquement.','Status refreshed. No unload was automatically resubmitted.');
    }finally{
      busy='';await changed();await tick();position();
    }
  }
  async function stopOwned(){
    if(locked||!owned||!profileReadValid||!profile?.canControl)return;
    if(!confirm(tr('Décharger le GGUF en arrêtant uniquement le processus llama-server possédé par Canaé ?','Unload the GGUF by stopping only the llama-server process owned by Canaé?')))return;
    const target={kind:'llama',revision:profile.profile.revision,nonce:profile.csrfNonce,requestId:'loaded-'+uuid()};busy='llama';failure='';notice='';
    try{
      await post(request,'/api/llama-server/action',{action:'stop',requestId:target.requestId,expectedRevision:target.revision,consent:true},{'X-Local-Service-CSRF':target.nonce});
      uncertain=target;
      await refresh(false);notice=profileReadValid&&profile.operation?.requestId===target.requestId&&profile.operation?.state==='succeeded'&&!profile.process.owned&&['configured','stopped'].includes(profile.process.state)?tr('GGUF déchargé : le processus possédé est arrêté.','GGUF unloaded: the owned process is stopped.'):tr('État du processus à vérifier. Aucun nouvel arrêt automatique.','Process status needs review. No automatic second stop.');
    }catch(error:any){
      failure=message(error);if(!error.status||error.status>=500||error.status===408)uncertain=target;
      await refresh(false);if(profileReadValid&&profile.operation?.state==='unknown')uncertain=target;
      if(!notice)notice=tr('État relu. Aucun arrêt renvoyé automatiquement.','Status refreshed. No stop was automatically resubmitted.');
    }finally{busy='';await changed();await tick();position();}
  }
  async function changed(){try{await onModelsChange?.();}catch(error){if(!failure)failure=message(error);}}
  function toggled(event:ToggleEvent){open=event.newState==='open';if(open){void tick().then(position);void refresh();}}
  onMount(()=>{mounted=true;addEventListener('resize',position);return()=>{mounted=false;sequence++;removeEventListener('resize',position);};});
</script>

<button class="loaded-trigger" bind:this={trigger} type="button" popovertarget="loaded-models-popover" aria-label={tr('Modèles chargés','Loaded models')} title={tr('Modèles chargés','Loaded models')} aria-expanded={open}>
  <Cpu aria-hidden="true" />{#if count}<span class="loaded-count" aria-hidden="true">{count}</span>{/if}
</button>
<div bind:this={panel} id="loaded-models-popover" class="loaded-popover" popover="auto" ontoggle={toggled} role="region" aria-labelledby="loaded-models-title">
  <header><h2 id="loaded-models-title">{tr('Modèles chargés','Loaded models')}</h2><div class="menu-actions"><Button type="button" variant="ghost" size="icon" aria-label={tr('Actualiser les modèles chargés','Refresh loaded models')} onclick={()=>refresh()} disabled={loading||!!busy}><RefreshCw /></Button><Button type="button" variant="ghost" size="icon" aria-label={tr('Fermer les modèles chargés','Close loaded models')} onclick={()=>panel.hidePopover()}><X /></Button></div></header>
  <div class="loaded-content" aria-busy={loading||!!busy}>
    <p class="menu-description">{tr('Modèles du moteur actif et processus llama-server possédé.','Models from the active engine and the owned llama-server process.')}</p>
    {#if loading}<p role="status">{tr('Lecture des instances…','Reading instances…')}</p>{/if}
    {#each instances as instance (instance.id)}
      <section class="loaded-row" aria-label={instance.model.name+' · '+instance.id}>
        <div class="loaded-details"><h3>{instance.model.name}</h3><p>Bionic · {modelType(instance.model.type)}{instance.contextLength?' · '+tr('contexte','context')+' '+instance.contextLength.toLocaleString():''}</p>{#if instance.model.loadedInstances.length>1}<p class="instance-id">{instance.id}</p>{/if}</div>
        <Button type="button" variant="outline" size="sm" aria-label={tr('Décharger ','Unload ')+instance.model.name+' · '+instance.id} disabled={locked||!scopeCurrent||instance.model.modelManagement===false} onclick={()=>unload(instance)}>{busy===instance.id?tr('Déchargement…','Unloading…'):tr('Décharger','Unload')}</Button>
      </section>
    {/each}
    {#if owned}
      <section class="loaded-row" aria-label={tr('Processus llama-server possédé','Owned llama-server process')}><div class="loaded-details"><h3>{profile.process.model?.name||'llama-server'}</h3><p>llama-server · {tr('Processus possédé par Canaé','Process owned by Canaé')}</p><p>{profile.process.state==='running'?tr('Chargé','Loaded'):tr('État à vérifier','Status needs review')}</p></div><Button type="button" variant="outline" size="sm" aria-label={tr('Décharger le GGUF possédé','Unload owned GGUF')} disabled={locked||!profileReadValid||!profile.canControl} onclick={stopOwned}>{busy==='llama'?tr('Arrêt…','Stopping…'):tr('Décharger','Unload')}</Button></section>
    {/if}
    {#each external as model (model.id)}
      <section class="loaded-row"><div class="loaded-details"><h3>{model.name||model.id}</h3><p>llama-server · {tr('Serveur externe','External server')}</p><p>{tr('Déchargement indisponible pour ce serveur direct. Arrête-le depuis son application.','Unloading is unavailable for this direct server. Stop it from its own application.')}</p></div></section>
    {/each}
    {#if !loading&&catalogue&&!instances.length&&!owned&&!external.length}<p class="empty-models">{tr('Aucun modèle chargé détecté.','No loaded model detected.')}</p>{/if}
    {#if catalogue&&(catalogue.generationActive||catalogue.unloading||disabled)}<p class="menu-feedback">{tr('Une opération est active. Le déchargement sera disponible après sa fin.','An operation is active. Unloading becomes available when it finishes.')}</p>{/if}
    {#if catalogue&&!scopeCurrent}<p class="menu-feedback">{tr('Le moteur a changé pendant la lecture. Actualise les modèles avant de décharger une instance.','The engine changed while reading. Refresh models before unloading an instance.')}</p>{/if}
    {#if uncertain}<p class="menu-feedback">{tr('Résultat non confirmé. Actualise l’état ; aucun nouvel envoi automatique.','Result unconfirmed. Refresh status; there is no automatic resubmission.')}</p>{/if}
    {#if failure}<p class="menu-error" role="alert">{failure}</p>{/if}{#if notice}<p class="menu-feedback" role="status">{notice}</p>{/if}
  </div>
</div>

<style>
  .loaded-trigger{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:36px;min-height:36px;padding:8px;border-radius:8px;color:var(--muted-foreground);flex-shrink:0;}
  .loaded-trigger:hover,.loaded-trigger[aria-expanded=true]{background:var(--muted);color:var(--foreground);}
  .loaded-trigger :global(svg){width:17px;height:17px;}
  .loaded-count{font-size:10px;font-variant-numeric:tabular-nums;}
  .loaded-trigger:focus-visible{outline:2px solid var(--ring);outline-offset:2px;}
  .loaded-popover{position:fixed;inset:auto;margin:0;padding:0;width:min(410px,calc(100vw - 24px));max-height:min(65dvh,560px);overflow:auto;border:1px solid var(--border);border-radius:12px;background:var(--background);color:var(--foreground);}
  header{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 9px;background:var(--background);border-bottom:1px solid var(--border);}
  h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.2px;}
  .menu-actions{display:flex;gap:2px;}
  .menu-actions :global(svg){width:15px;height:15px;}
  .loaded-content{padding:0 14px 14px;font-size:12px;line-height:1.55;}
  .menu-description{color:var(--muted-foreground);margin:12px 0;}
  .loaded-row{display:flex;gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid var(--border);}
  .loaded-details{min-width:0;flex:1;}
  h3{margin:0 0 4px;font-size:13px;font-weight:550;line-height:1.45;overflow-wrap:anywhere;}
  .loaded-details p{margin:3px 0;color:var(--muted-foreground);font-size:11px;overflow-wrap:anywhere;}
  .instance-id{font-variant-numeric:tabular-nums;}
  .menu-feedback,.menu-error{margin:12px 0 0;padding:9px 10px;border-radius:8px;overflow-wrap:anywhere;background:var(--muted);}
  .menu-error{color:var(--destructive);}
  .empty-models{color:var(--muted-foreground);margin:18px 0;}
  @media(max-width:450px){.loaded-row{align-items:flex-start;}.loaded-row :global(button){flex-shrink:0;}}
</style>
