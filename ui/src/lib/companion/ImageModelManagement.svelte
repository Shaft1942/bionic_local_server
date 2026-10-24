<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr } from './preferences.svelte';
  import { post,message,uuid,type Request } from './settings/types';
  let {request,onOpenImages,onChanged}:{request:Request;onOpenImages?:()=>void|Promise<void>;onChanged?:()=>void|Promise<void>}=$props();
  let settings=$state<any>(null),memory=$state<any>(null),workflow=$state(''),busy=$state(false),reading=$state(false),failure=$state('');
  let requestId='',storageKey='',mounted=false,sequence=0;
  async function refresh(){
    const ticket=++sequence;reading=true;
    const result=await Promise.allSettled([request('/api/comfy/settings'),request('/api/comfy/free'+(requestId?'?'+new URLSearchParams({requestId}):''))]);
    if(!mounted||ticket!==sequence)return;
    if(result[0].status==='fulfilled'){const next=result[0].value;if(!settings||workflow===settings.workflowId)workflow=next.workflowId;settings=next;}else failure=message(result[0].reason);
    if(result[1].status==='fulfilled'){memory=result[1].value;if(memory.operation?.state==='accepted'){requestId='';if(storageKey)try{sessionStorage.removeItem(storageKey);}catch{}}}else{memory=null;failure=message(result[1].reason);}
    reading=false;
  }
  async function saveWorkflow(){if(busy||reading||!workflow)return;busy=true;failure='';try{await post(request,'/api/comfy/settings',{workflowId:workflow});await refresh();await onChanged?.();}catch(error){failure=message(error);await refresh();}finally{busy=false;}}
  async function unload(){
    if(busy||reading)return;await refresh();if(!memory?.canUnload)return;
    const target={revision:memory.revision,url:memory.url,nonce:memory.csrfNonce};
    if(!confirm(tr('Demander à ComfyUI de décharger ses modèles ? Le serveur reste démarré.\n','Ask ComfyUI to unload its models? The server stays running.\n')+target.url))return;
    busy=true;failure='';requestId=uuid();
    try{
      if(storageKey)sessionStorage.setItem(storageKey,requestId);
      memory={...memory,operation:{state:'requesting',requestId,url:target.url,verified:false}};
      try{await post(request,'/api/comfy/free',{requestId,expectedRevision:target.revision,consent:true},{'X-Local-Service-CSRF':target.nonce});}catch(error){failure=message(error);}
      await refresh();
      if(!memory?.operation)memory={...memory,operation:{state:'unknown',requestId,url:target.url,verified:false}};
      await onChanged?.();
    }catch(error){failure=message(error);}finally{busy=false;}
  }
  onMount(()=>{mounted=true;void(async()=>{try{const ping=await request('/api/ping');storageKey='canae:comfy-free:pending:'+ping.instanceId;requestId=sessionStorage.getItem(storageKey)||'';}catch{}await refresh();})();return()=>{mounted=false;sequence++;};});
</script>

<section class="image-model-controls" aria-label={tr('Modèles d’images','Image models')}>
  <h3>{tr('Modèles d’images','Image models')}</h3>
  <p>{tr('ComfyUI charge ses modèles pendant un workflow. Choisis un workflow puis lance un rendu dans l’Atelier images ; aucune image n’est générée en arrière-plan ici.','ComfyUI loads its models during a workflow. Choose a workflow, then render in the image studio; no image is generated in the background here.')}</p>
  <p role="status">API · {reading?tr('Lecture…','Reading…'):settings?.enabled===false?tr('Connexion désactivée · état non vérifié','Connection disabled · status not checked'):settings?.available?tr('Disponible','Available'):settings?tr('Indisponible','Unavailable'):tr('Inconnue','Unknown')}</p>
  {#if settings}<label class="setting-field">{tr('Workflow enregistré','Saved workflow')}<select aria-label={tr('Workflow enregistré','Saved workflow')} bind:value={workflow} disabled={busy||reading}>{#each settings.workflows||[] as item}<option value={item.id}>{item.label||item.name||item.id}</option>{/each}</select></label><div class="settings-actions"><Button type="button" variant="outline" disabled={busy||reading||workflow===settings.workflowId} onclick={saveWorkflow}>{tr('Enregistrer le workflow','Save workflow')}</Button>{#if onOpenImages}<Button type="button" disabled={busy||reading||!settings.enabled||!settings.available} onclick={()=>void onOpenImages?.()}>{tr('Ouvrir l’Atelier images','Open image studio')}</Button>{/if}</div>{/if}
  <div class="settings-actions"><Button type="button" variant="outline" disabled={busy||reading||!memory?.canUnload} onclick={unload}>{tr('Décharger les modèles d’images','Unload image models')}</Button><Button type="button" variant="ghost" disabled={busy||reading} onclick={refresh}>{tr('Relire les modèles d’images','Refresh image models')}</Button></div>
  {#if memory?.operation?.state==='accepted'}<p role="status">{tr('Demande acceptée. La fin du déchargement et la mémoire libérée ne sont pas confirmées par ce protocole.','Request accepted. Completion of unloading and released memory are not confirmed by this protocol.')}</p>{:else if memory?.operation?.state==='requesting'}<p role="status">{tr('Demande de déchargement en cours…','Unload request in progress…')}</p>{:else if memory?.operation}<p role="status">{tr('Résultat inconnu. Relis l’état ; aucune demande ne sera renvoyée automatiquement.','Result unknown. Refresh status; no request will be automatically resubmitted.')}</p>{/if}
  {#if memory?.reason&&!memory.canUnload}<p>{memory.reason}</p>{/if}{#if failure}<p role="alert" class="failure">{failure}</p>{/if}
  {#if memory?.operation?.url}<p>{tr('Serveur de cette demande : ','Server for this request: ')+memory.operation.url}</p>{/if}
</section>
<style>
  h3{font-size:13px;}p{font-size:12px;line-height:1.55;overflow-wrap:anywhere;color:var(--muted-foreground);}.failure{color:var(--destructive);}
</style>
