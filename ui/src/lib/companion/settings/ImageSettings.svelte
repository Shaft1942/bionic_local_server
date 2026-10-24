<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr } from '../preferences.svelte';
  import { post,message,uuid,type Request } from './types';
  import RangeField from './RangeField.svelte';
  let { request,onDirtyChange }:{request:Request;onDirtyChange?:(dirty:boolean)=>void}=$props();
  let data=$state<any>(null),enabled=$state(false),url=$state(''),workflowId=$state(''),memoryCleanup=$state(false),modelPolicy=$state('keep');
  let loraProfiles=$state<Record<string,{name:string;strength:number}[]>>({}),loras=$state<string[]>([]),busy=$state(false),failure=$state(''),notice=$state(''),check=$state<any>(null),servers=$state<any[]>([]);
  let baseline=$state('');
  let memoryState=$state<any>(null),memoryBusy=$state(false),memoryReading=$state(false),memoryFailure=$state('');
  let memoryRequestId='',memorySequence=0;
  const memoryPendingKey='canae:comfy-free:pending';
  const slots=$derived(loraProfiles[workflowId]||[]);
  function accept(value:any){data=value;enabled=value.enabled;url=value.url;workflowId=value.workflowId;memoryCleanup=value.memoryCleanup===true;modelPolicy=value.modelPolicy||'keep';loraProfiles=Object.fromEntries((value.workflows||[]).map((item:any)=>[item.id,[0,1].map(index=>({...value.loraProfiles?.[item.id]?.[index]||{name:'',strength:1}}))]));baseline=JSON.stringify(input());}
  const input=()=>({enabled,url:url.trim(),workflowId,memoryCleanup,modelPolicy,loraProfiles:structuredClone($state.snapshot(loraProfiles))});
  $effect(()=>{onDirtyChange?.(!!baseline&&baseline!==JSON.stringify(input()));});
  async function load(){try{accept(await request('/api/comfy/settings'));}catch(error){failure=message(error);}}
  async function run(action:string){if(busy)return;busy=true;failure='';notice='';try{
    if(action==='save'){accept(await post(request,'/api/comfy/settings',input()));notice=tr('Réglages ComfyUI enregistrés.','ComfyUI settings saved.');}
    else if(action==='check'){check=await post(request,'/api/comfy/check',input());notice=check.ok?tr('Profil compatible. Aucun travail image lancé.','Profile compatible. No image job started.'):tr('Vérifie les éléments signalés.','Check the reported items.');}
    else if(action==='loras'){const result=await post(request,'/api/comfy/loras',{url:url.trim()});loras=result.loras||[];notice=tr('Catalogue LoRA actualisé.','LoRA catalogue refreshed.');}
    else if(action==='discover'){servers=(await post(request,'/api/comfy/discover',{url:url.trim()})).servers||[];}
    else if(action==='resume'){await post(request,'/api/comfy/queue/resume',{});await load();}
  }catch(error){failure=message(error);if(action==='save'||action==='resume'){try{data=await request('/api/comfy/settings');notice=tr('État serveur relu. Le formulaire reste disponible ; aucun renvoi automatique.','Server state refreshed. Your form remains available; no automatic retry.');}catch{}}}finally{busy=false;}}
  function setSlot(index:number,patch:Partial<{name:string;strength:number}>){const next=[...(loraProfiles[workflowId]||[{name:'',strength:1},{name:'',strength:1}])];next[index]={...next[index],...patch};loraProfiles={...loraProfiles,[workflowId]:next};}
  async function readMemory(){
    const sequence=++memorySequence;memoryReading=true;memoryFailure='';
    try{
      const value=await request('/api/comfy/free'+(memoryRequestId?'?'+new URLSearchParams({requestId:memoryRequestId}):''));
      if(sequence!==memorySequence)return;
      memoryState=value;
      if(value.operation?.state==='accepted'){memoryRequestId='';try{sessionStorage.removeItem(memoryPendingKey);}catch{}}
      return value;
    }catch(error){if(sequence===memorySequence)memoryFailure=message(error);}
    finally{if(sequence===memorySequence)memoryReading=false;}
  }
  async function unloadImageModels(){
    if(memoryBusy||memoryReading)return;
    const current=await readMemory();if(!current?.canUnload)return;
    if(!confirm(tr('Décharger les modèles d’images du serveur enregistré : ','Unload image models from the saved server: ')+current.url+'\n\n'+tr('Le serveur ComfyUI reste démarré. Sa file doit être vide. Le protocole confirme la réception de la demande, sans certifier la fin du déchargement.','The ComfyUI server stays running. Its queue must be empty. The protocol acknowledges the request without certifying that unloading has finished.')))return;
    memoryBusy=true;memoryFailure='';memoryRequestId=uuid();
    const requestId=memoryRequestId;let actionFailure='';
    memoryState={...current,operation:{requestId,url:current.url,state:'requesting',verified:false}};
    try{sessionStorage.setItem(memoryPendingKey,memoryRequestId);}catch{}
    try{
      memoryState=await post(request,'/api/comfy/free',{requestId:memoryRequestId,expectedRevision:current.revision,consent:true},{'X-Local-Service-CSRF':current.csrfNonce});
    }catch(error){actionFailure=message(error);}
    finally{await readMemory();if(actionFailure&&!(memoryState?.operation?.requestId===requestId&&memoryState.operation.state==='accepted'))memoryFailure=actionFailure;memoryBusy=false;}
  }
  onMount(()=>{void load();try{memoryRequestId=sessionStorage.getItem(memoryPendingKey)||'';}catch{}void readMemory();return()=>{memorySequence++;};});
</script>
<h2>{tr('Fournisseur images','Image provider')}</h2><p class="settings-description">{tr('ComfyUI fournit les images indépendamment du moteur de conversation actif. Les mêmes workflows et LoRA restent disponibles avec Bionic et llama.cpp.','ComfyUI provides images independently of the active conversation engine. The same workflows and LoRAs remain available with Bionic and llama.cpp.')}</p>
<section aria-label={tr('Déchargement des modèles d’images','Image model unloading')}>
<h3>{tr('Modèles d’images en mémoire','Image models in memory')}</h3>
<p class="settings-description">{tr('Cette commande vise l’adresse enregistrée, indépendamment des modifications du formulaire. Elle décharge les modèles ComfyUI sans arrêter son serveur.','This command targets the saved address independently of form edits. It unloads ComfyUI models without stopping the server.')}</p>
{#if memoryState}<p class="settings-description">{tr('Serveur enregistré : ','Saved server: ')}<span class="memory-endpoint">{memoryState.url}</span></p>{/if}
<div class="settings-actions"><Button type="button" variant="outline" onclick={unloadImageModels} disabled={memoryBusy||memoryReading||!memoryState?.canUnload}>{memoryBusy?tr('Demande en cours…','Request in progress…'):tr('Décharger les modèles d’images','Unload image models')}</Button><Button type="button" variant="ghost" onclick={readMemory} disabled={memoryBusy||memoryReading}>{tr('Relire la demande de déchargement','Refresh unload request')}</Button></div>
{#if memoryReading}<p role="status">{tr('Lecture du suivi…','Reading request status…')}</p>{/if}
{#if memoryState?.reason&&!memoryState.canUnload}<p class="settings-feedback">{memoryState.reason}</p>{/if}
{#if memoryState?.operation?.url}<p class="settings-description">{tr('Demande adressée à : ','Request sent to: ')}<span class="memory-endpoint">{memoryState.operation.url}</span>{#if memoryState.operation.url!==memoryState.url}<br />{tr('Cette demande concerne une connexion précédente.','This request concerns a previous connection.')}{/if}</p>{/if}
{#if memoryState?.operation?.state==='accepted'}<p class="settings-feedback" role="status">{tr('Demande acceptée par ComfyUI. La fin du déchargement et la mémoire libérée ne sont pas vérifiables par ce protocole.','Request accepted by ComfyUI. Completion of unloading and released memory cannot be verified with this protocol.')}</p>
{:else if memoryState?.operation}<p class="settings-feedback" role="status">{tr('Résultat du déchargement non confirmé. Relis le suivi ; aucune demande ne sera renvoyée automatiquement.','Unload result unconfirmed. Refresh status; no request will be automatically resubmitted.')}</p>{/if}
{#if memoryFailure}<p class="settings-error" role="alert">{memoryFailure}</p>{/if}
</section>
{#if !data}<p role="status">{tr('Chargement…','Loading…')}</p>{:else}
<form onsubmit={event=>{event.preventDefault();void run('save');}}>
<label class="setting-check"><input type="checkbox" bind:checked={enabled} disabled={busy} />{tr('Activer ComfyUI','Enable ComfyUI')}</label>
<label class="setting-field">{tr('Adresse de ComfyUI','ComfyUI address')}<input type="url" bind:value={url} required disabled={busy} /></label><div class="settings-actions"><Button variant="outline" onclick={()=>run('discover')} disabled={busy}>{tr('Rechercher les serveurs','Find servers')}</Button><Button variant="outline" onclick={()=>run('check')} disabled={busy}>{tr('Tester le profil','Test profile')}</Button></div>
{#each servers as server}<Button variant="ghost" onclick={()=>{url=server.url;check=null;}}>{server.url}</Button>{/each}
<label class="setting-field">{tr('Workflow par défaut','Default workflow')}<select bind:value={workflowId} disabled={busy}>{#each data.workflows||[] as workflow}<option value={workflow.id}>{workflow.label}</option>{/each}</select></label>
<h3>LoRA</h3><p class="settings-description">{tr('Deux emplacements propres au workflow sélectionné. Une force nulle désactive ce LoRA.','Two slots for the selected workflow. A zero strength disables that LoRA.')}</p><Button variant="outline" onclick={()=>run('loras')} disabled={busy}>{tr('Actualiser le catalogue LoRA','Refresh LoRA catalogue')}</Button>
{#each [0,1] as index}<div class="settings-grid"><div class="setting-field"><label for={'settings-lora-'+index}>LoRA {index+1}</label><select id={'settings-lora-'+index} aria-label={'LoRA '+(index+1)} value={slots[index]?.name||''} onchange={event=>setSlot(index,{name:event.currentTarget.value})} disabled={busy}><option value="">{tr('Aucun','None')}</option>{#each [...new Set([...loras,...(slots[index]?.name?[slots[index].name]:[])])] as name}<option value={name}>{name}</option>{/each}</select></div><RangeField id={'settings-lora-strength-'+index} label={tr('Force','Strength')+' '+(index+1)} min={-2} max={20} step={0.05} numberStep="any" value={slots[index]?.strength??1} onValueChange={strength=>setSlot(index,{strength})} disabled={busy}/></div>{/each}
<h3>{tr('Mémoire et disponibilité','Memory and availability')}</h3><label class="setting-check"><input type="checkbox" bind:checked={memoryCleanup} disabled={busy} />{tr('Libérer les modèles ComfyUI après chaque workflow','Free ComfyUI models after each workflow')}</label><p class="settings-description">{tr('Nécessite le nœud compagnon installé et compatible. Le test du profil vérifie sa présence.','Requires the compatible companion node to be installed. The profile test checks its availability.')}</p><a class="inline-link" href="/api/comfy/memory-module" download>{tr('Télécharger le module mémoire','Download memory module')}</a>
<label class="setting-field">{tr('Modèle texte pendant une série d’images','Text model during an image batch')}<select bind:value={modelPolicy} disabled={busy}><option value="keep">{tr('Conserver chargé','Keep loaded')}</option><option value="unload">{tr('Décharger pour les images','Unload for images')}</option><option value="alternate">{tr('Alterner texte et images','Alternate text and images')}</option></select></label>
{#if data.queuePaused}<div class="settings-feedback">{tr('La file image est en pause après reprise du serveur.','The image queue is paused after server recovery.')}<Button variant="outline" onclick={()=>run('resume')} disabled={busy}>{tr('Reprendre la file image','Resume image queue')}</Button></div>{/if}
<div class="settings-actions"><Button type="submit" disabled={busy}>{tr('Enregistrer les réglages images','Save image settings')}</Button><Button variant="ghost" onclick={load} disabled={busy}>{tr('Annuler les modifications','Discard changes')}</Button></div></form>
{/if}
{#if check}<div class="settings-feedback"><strong>{check.reachable?tr('Serveur joignable','Server reachable'):tr('Serveur indisponible','Server unavailable')}</strong>{#if check.error}<p>{check.error}</p>{/if}{#each check.workflows?.filter((item:any)=>item.id===workflowId)||[] as workflow}<ul>{#each workflow.models||[] as model}<li>{model.available?tr('Présent','Available'):tr('Manquant','Missing')} · {model.name}</li>{/each}{#each workflow.errors||[] as item}<li>{item}</li>{/each}</ul>{/each}<p>{tr('Module mémoire compatible','Compatible memory module')} : {check.memoryCleanup?.compatible?tr('oui','yes'):tr('non','no')}</p></div>{/if}
{#if failure}<p class="settings-error" role="alert">{failure}</p>{/if}{#if notice}<p class="settings-feedback" role="status">{notice}</p>{/if}

<style>.memory-endpoint{overflow-wrap:anywhere;}</style>
