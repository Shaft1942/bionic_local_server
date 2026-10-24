<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr } from '../preferences.svelte';
  import { post, message, type Request } from './types';
  import RangeField from './RangeField.svelte';
  import { inferenceProviders } from './inference-providers';
  let { request, projectId, chatId = '', modelId = '', onInferenceChange, onDirtyChange,active=true,scope='conversation' }: { request:Request;projectId:string;chatId?:string;modelId?:string;onInferenceChange?:()=>void;onDirtyChange?:(dirty:boolean)=>void;active?:boolean;scope?:'conversation'|'engines' } = $props();
  let data=$state<any>(null),catalogue=$state<any[]>([]),provider=$state('bionic'),apiUrl=$state(''),llamaUrl=$state('');
  let bionicToken=$state(''),llamaToken=$state(''),clearBionicToken=$state(false),clearLlamaToken=$state(false);
  let busy=$state(false),loading=$state(true),failure=$state(''),notice=$state(''),check=$state<any>(null);
  let selected=$state(''),output=$state<any>(null),automatic=$state(true),tokens=$state(8192),all=$state(true);
  let mounted=$state(false),outputSequence=0,lastScope='',wasActive=false;
  const editable=$derived(data?.editable===true&&!data?.busy&&!busy);
  const dirty=$derived(!!data&&(provider!==data.provider||apiUrl!==(data.apiUrl||'')||llamaUrl!==(data.llamaUrl||'')||!!bionicToken||!!llamaToken||clearBionicToken||clearLlamaToken)||!!output&&(automatic!==output.automatic||!automatic&&Number(tokens)!==output.maxOutputTokens||all!==(!chatId||output.applyToAllSessions===true)));
  $effect(()=>{onDirtyChange?.(dirty);});
  const payload=()=>({provider,apiUrl:apiUrl.trim(),llamaUrl:llamaUrl.trim(),...(bionicToken?{bionicToken}:{}),...(llamaToken?{llamaToken}:{}),...(clearBionicToken?{clearBionicToken:true}:{}),...(clearLlamaToken?{clearLlamaToken:true}:{})});
  async function load(keepDraft=false){
    loading=true;
    try{const value=await request('/api/inference/settings');data=value;if(!keepDraft){provider=value.provider;apiUrl=value.apiUrl||'';llamaUrl=value.llamaUrl||'';}const models=await request('/api/models');catalogue=(models.models||[]).filter((item:any)=>item.type==='llm');if(value.reconciliationRequired)data=await request('/api/inference/settings');if(!selected||!catalogue.some(item=>item.id===selected))selected=catalogue.some(item=>item.id===modelId)?modelId:catalogue[0]?.id||'';if(selected)await loadOutput();}
    catch(error){failure=message(error);}finally{loading=false;}
  }
  async function test(){busy=true;failure='';notice='';check=null;try{check=await post(request,'/api/inference/check',payload());}catch(error){failure=message(error);}finally{busy=false;}}
  async function save(){if(!editable)return;busy=true;failure='';notice='';try{data=await post(request,'/api/inference/settings',{...payload(),expectedRevision:data.revision});bionicToken='';llamaToken='';clearBionicToken=false;clearLlamaToken=false;notice=tr('Connexion enregistrée et appliquée. Les modèles ne sont pas chargés automatiquement.','Connection saved and applied. Models are not loaded automatically.');await load();onInferenceChange?.();}catch(error){failure=message(error);await load(true);notice=tr('État serveur relu. Aucun enregistrement n’a été renvoyé automatiquement.','Server state refreshed. The save was not automatically submitted again.');}finally{busy=false;}}
  async function loadOutput(){const sequence=++outputSequence,scope={model:selected,projectId,chatId};output=null;try{const value=await request('/api/model-preferences?'+new URLSearchParams({model:scope.model,projectId:scope.projectId,...(scope.chatId?{id:scope.chatId}:{})}));if(sequence!==outputSequence||scope.projectId!==projectId||scope.chatId!==chatId||scope.model!==selected)return;output=value;automatic=value.automatic===true;tokens=value.maxOutputTokens||8192;all=!scope.chatId||value.applyToAllSessions===true;}catch(error){if(sequence===outputSequence)failure=message(error);}}
  async function saveOutput(){busy=true;failure='';try{await post(request,'/api/model-preferences',{model:selected,projectId,...(chatId?{id:chatId}:{}),maxOutputTokens:automatic?null:Number(tokens),applyToAllSessions:all});await loadOutput();notice=tr('Plafond de réponse enregistré.','Response limit saved.');onInferenceChange?.();}catch(error){failure=message(error);await loadOutput();}finally{busy=false;}}
  async function unload(instanceId:string){if(!confirm(tr('Décharger cette instance de modèle ?','Unload this model instance?')))return;busy=true;failure='';try{await post(request,'/api/models/unload',{instanceId});await load();onInferenceChange?.();}catch(error){failure=message(error);await load(true);}finally{busy=false;}}
  $effect(()=>{const scope=projectId+'|'+chatId+'|'+modelId;if(mounted&&scope!==lastScope){lastScope=scope;if(modelId&&catalogue.some(item=>item.id===modelId))selected=modelId;if(selected)void loadOutput();}});
  $effect(()=>{if(mounted&&active&&!wasActive){wasActive=true;void request('/api/inference/settings').then(value=>data=value).catch(error=>failure=message(error));}else if(!active)wasActive=false;});
  onMount(()=>{void load().then(()=>{lastScope=projectId+'|'+chatId+'|'+modelId;wasActive=active;mounted=true;});return()=>{mounted=false;++outputSequence;};});
</script>

{#if scope==='engines'}
<h3>{tr('Moteurs d’inférence','Inference engines')}</h3><p class="settings-description">{tr('Choisis le moteur actif et prépare les connexions de chaque serveur. Un seul moteur de conversation est utilisé à la fois ; les projets, fichiers et outils restent disponibles avec chacun.','Choose the active engine and configure each server connection. Only one conversation engine is used at a time; projects, files and tools remain available with each engine.')}</p>
{#if loading&&!data}<p role="status">{tr('Chargement de la connexion…','Loading connection…')}</p>{/if}
{#if data}
  <form oninput={()=>check=null} onsubmit={event=>{event.preventDefault();void save();}}>
    <label class="setting-field" for="inference-provider">{tr('Moteur actif','Active engine')}<select id="inference-provider" bind:value={provider} disabled={!editable}>{#each inferenceProviders as engine}<option value={engine.id}>{engine.name}</option>{/each}</select></label>
    {#each inferenceProviders as engine}
      <section aria-label={engine.name}>
        <h4>{engine.name}</h4>
        <label class="setting-field" for={engine.urlInputId}>{engine.id==='bionic'?tr('Adresse de l’API Bionic','Bionic API address'):tr('Adresse de llama-server','llama-server address')}<input id={engine.urlInputId} type="url" value={engine.id==='bionic'?apiUrl:llamaUrl} oninput={event=>{if(engine.id==='bionic')apiUrl=event.currentTarget.value;else llamaUrl=event.currentTarget.value;}} disabled={!editable} placeholder={engine.id==='bionic'?'http://127.0.0.1:1234':'http://127.0.0.1:1238'} /></label>
        <details><summary>{tr('Authentification','Authentication')} · {engine.name}</summary><p class="settings-description">{tr('Le jeton enregistré n’est jamais affiché. Laisse le champ vide pour le conserver ; change ou efface le jeton lorsque l’adresse change.','The saved token is never displayed. Leave this field empty to keep it; replace or clear the token when changing the address.')}</p>
          {#if engine.id==='bionic'}
            <label class="setting-field">{tr('Nouveau jeton Bionic','New Bionic token')}<input type="password" autocomplete="new-password" bind:value={bionicToken} disabled={!editable} placeholder={data.hasBionicToken?tr('Jeton enregistré','Token saved'):tr('Aucun jeton','No token')} /></label><label class="setting-check"><input type="checkbox" bind:checked={clearBionicToken} disabled={!editable} />{tr('Effacer le jeton Bionic enregistré','Clear saved Bionic token')}</label>
          {:else}
            <label class="setting-field">{tr('Nouveau jeton llama.cpp','New llama.cpp token')}<input type="password" autocomplete="new-password" bind:value={llamaToken} disabled={!editable} placeholder={data.hasLlamaToken?tr('Jeton enregistré','Token saved'):tr('Aucun jeton','No token')} /></label><label class="setting-check"><input type="checkbox" bind:checked={clearLlamaToken} disabled={!editable} />{tr('Effacer le jeton llama.cpp enregistré','Clear saved llama.cpp token')}</label>
          {/if}
        </details>
      </section>
    {/each}
    {#if !data.editable}<p class="settings-feedback">{tr('Cette instance expose la connexion en lecture seule.','This instance exposes its connection as read only.')}</p>{:else if data.busy}<p class="settings-feedback">{tr('Une tâche est active. Le changement de moteur sera disponible après sa fin.','A task is active. Engine switching becomes available when it finishes.')}</p>{/if}
    {#if data.reconciliationRequired}<p class="settings-feedback">{tr('Une opération modèle reste non confirmée. Actualise le catalogue pour vérifier son état ; aucun chargement ni déchargement ne sera renvoyé.','A model operation remains unconfirmed. Refresh the catalogue to check its state; no load or unload is resubmitted.')}</p>{/if}
    <div class="settings-actions"><Button type="button" variant="outline" onclick={test} disabled={busy||data.editable===false}>{tr('Tester la connexion','Test connection')}</Button><Button type="submit" disabled={!editable}>{tr('Enregistrer la connexion','Save connection')}</Button><Button variant="ghost" onclick={()=>load()} disabled={busy}>{tr('Actualiser les modèles','Refresh models')}</Button></div>
  </form>
{/if}
{#if check}<div class="settings-feedback" role="status"><strong>{check.ok?tr('Connexion disponible','Connection available'):tr('Connexion à vérifier','Connection needs attention')}</strong><p>{check.endpoint}</p>{#if check.error}<p>{check.error}</p>{/if}<p>{check.models?.length||0} {tr('modèle(s) annoncé(s), sans génération ni chargement.','model(s) reported, without generation or loading.')}</p>{#each check.models||[] as item}<p>{item.name||item.id} · {tr('contexte','context')} {item.contextLength||tr('inconnu','unknown')}</p>{/each}</div>{/if}
{#if data?.provider==='bionic'}<h3>{tr('Instances chargées','Loaded instances')}</h3>{#each catalogue.filter(item=>item.loadedInstances?.length) as item}{#each item.loadedInstances as instance}<div class="setting-row"><span>{item.name||item.id}</span><Button variant="outline" onclick={()=>unload(instance.id)} disabled={busy}>{tr('Décharger','Unload')}</Button></div>{/each}{/each}{/if}
{:else}
<h2>{tr('Conversation','Conversation')}</h2><p class="settings-description">{tr('Règle la longueur des réponses pour le modèle et les conversations choisis. Le moteur et les connexions se configurent dans Serveurs du PC.','Set response length for the selected model and conversations. Configure the engine and connections under PC servers.')}</p>
<h3>{tr('Modèle et longueur de réponse','Model and response length')}</h3>
<label class="setting-field">{tr('Modèle à régler','Model to configure')}<select bind:value={selected} onchange={loadOutput} disabled={busy||!catalogue.length}>{#each catalogue as item}<option value={item.id}>{item.name||item.id}{item.loaded?' · '+tr('chargé','loaded'):''}</option>{/each}</select></label>
{#if output}<dl class="settings-dl"><dt>{tr('Contexte chargé','Loaded context')}</dt><dd>{output.contextLength||tr('Non confirmé','Not confirmed')}</dd><dt>{tr('Origine du plafond','Limit source')}</dt><dd>{output.source}</dd></dl>
<form onsubmit={event=>{event.preventDefault();void saveOutput();}}><label class="setting-check"><input type="checkbox" bind:checked={automatic} disabled={busy} />{tr('Plafond automatique','Automatic response limit')}</label>{#if !automatic}<RangeField id="output-max-tokens" label={tr('Maximum de tokens en sortie','Maximum output tokens')} bind:value={tokens} min={1} max={5000000} step={1} scale="log" unit="tokens" disabled={busy}/>{/if}<label class="setting-check"><input type="checkbox" bind:checked={all} disabled={busy||!chatId} />{tr('Appliquer à toutes les conversations de ce modèle','Apply to all conversations using this model')}</label><Button type="submit" disabled={busy}>{tr('Enregistrer le plafond','Save response limit')}</Button></form>{/if}
{/if}
{#if failure}<p role="alert" class="settings-error">{failure}</p>{/if}{#if notice}<p role="status" class="settings-feedback">{notice}</p>{/if}
