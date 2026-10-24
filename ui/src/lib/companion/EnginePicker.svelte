<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import WorkspaceDialog from './WorkspaceDialog.svelte';
  import { tr } from './preferences.svelte';
  import { post, type Request } from './settings/types';
  type EngineState = { provider: 'bionic'|'llamacpp'; revision: string; llamaUrl?: string; hasLlamaToken?: boolean; editable?: boolean; busy?: boolean; reconciliationRequired?: boolean; [key: string]: unknown };
  type LocalProfile = { endpoint: string; revision: string };
  let { request, inference, disabled = false, onBusyChange, onInferenceChange, beforeChange }: {
    request: Request; inference: EngineState | null; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
    onInferenceChange: (current: EngineState) => void | Promise<void>; beforeChange: () => void;
  } = $props();
  let choice = $state(''), busy = $state(false), uncertain = $state(false), failure = $state(''), notice = $state('');
  let localProfile=$state<LocalProfile|null>(null),localProposal=$state<{current:EngineState;profile:LocalProfile}|null>(null),localTrigger=$state<HTMLButtonElement>();
  let seenRevision = '', live = true, profileSequence=0;
  $effect(() => { const revision = inference?.revision; if (revision && revision !== seenRevision) untrack(() => { seenRevision = revision; choice = inference?.provider || ''; }); });
  $effect(()=>{const provider=inference?.provider,revision=inference?.revision;if(provider==='llamacpp'&&revision)untrack(()=>{void refreshProfile();});else localProfile=null;});
  const editable = $derived(inference?.editable === true && !inference.busy && !inference.reconciliationRequired && typeof inference.revision === 'string');
  const canUseLocal=$derived(inference?.provider==='llamacpp'&&!!localProfile&&inference.llamaUrl!==localProfile.endpoint);
  onMount(() => { live = true; return () => { live = false;profileSequence++; onBusyChange?.(false); }; });
  async function currentState():Promise<EngineState> {
    const value: unknown = await request('/api/inference/settings', { signal: AbortSignal.timeout(15000) });
    if (!value || typeof value !== 'object' || !('provider' in value) || !['bionic','llamacpp'].includes(String(value.provider)) || !('revision' in value) || typeof value.revision !== 'string' || !value.revision) throw Error('Invalid inference state');
    return value as EngineState;
  }
  async function profileState():Promise<LocalProfile>{
    const value=await request('/api/llama-server',{signal:AbortSignal.timeout(15000)}),profile=value?.profile;
    if(typeof profile?.endpoint!=='string'||typeof profile.revision!=='string'||!profile.revision)throw Error('Invalid local profile');
    const url=new URL(profile.endpoint);
    if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Invalid local endpoint');
    return{endpoint:url.origin,revision:profile.revision};
  }
  async function refreshProfile(){const sequence=++profileSequence;try{const value=await profileState();if(live&&sequence===profileSequence)localProfile=value;}catch{if(live&&sequence===profileSequence)localProfile=null;}}
  async function read() {
    const current=await currentState();
    if(!live)return;
    choice = current.provider;
    await onInferenceChange(current);
    if (live) uncertain = false;
  }
  async function reread() {
    if (busy) return; busy = true; onBusyChange?.(true); failure = ''; notice = '';
    try { await read(); if (live) notice = tr('Moteur relu. Aucun changement renvoyé.', 'Engine refreshed. No change was resubmitted.'); }
    catch { if (live) { uncertain = true; failure = tr('État du moteur non confirmé. Relis son état avant de continuer.', 'Engine state unconfirmed. Reload its state before continuing.'); } }
    finally { if (live) { busy = false; onBusyChange?.(uncertain); } }
  }
  async function apply() {
    if (busy || uncertain || disabled || !editable || !['bionic','llamacpp'].includes(choice) || choice === inference?.provider) return;
    const provider = choice, expectedRevision = inference!.revision;
    beforeChange(); busy = true; onBusyChange?.(true); failure = ''; notice = '';
    try{await change({provider,expectedRevision});}
    finally { if (live) { busy = false; onBusyChange?.(uncertain); } }
  }
  async function change(payload:Record<string,unknown>){
    let failed = false;
    try { await post(request, '/api/inference/settings', payload); }
    catch { failed = true; }
    try {
      await read();
      if (live) notice = failed ? tr('État du serveur relu après une réponse non confirmée. Aucun changement renvoyé.', 'Server state refreshed after an unconfirmed response. No change was resubmitted.') : tr('Moteur actif actualisé pour tous les chats. Aucun modèle chargé automatiquement.', 'Active engine updated for all chats. No model was loaded automatically.');
    } catch { if (live) { uncertain = true; failure = tr('État du moteur non confirmé. Relis son état avant de continuer.', 'Engine state unconfirmed. Reload its state before continuing.'); } }
  }
  async function proposeLocal(){
    if(disabled||busy||uncertain||!editable||!canUseLocal)return;
    busy=true;onBusyChange?.(true);failure='';notice='';
    try{
      const[current,profile]=await Promise.all([currentState(),profileState()]);
      if(!live)return;
      localProfile=profile;
      if(current.provider!=='llamacpp'||current.editable!==true||current.busy||current.reconciliationRequired||typeof current.hasLlamaToken!=='boolean'||current.llamaUrl===profile.endpoint)throw Error('Local connection unavailable');
      localProposal={current,profile};
    }catch{if(live){localProfile=null;failure=tr('Profil local non confirmé. Relis les réglages avant de changer la connexion.','Local profile unconfirmed. Reload settings before changing the connection.');}}
    finally{if(live){busy=false;onBusyChange?.(false);}}
  }
  async function closeLocal(){localProposal=null;await tick();if(live){if(localTrigger?.isConnected)localTrigger.focus();else document.getElementById('chat-engine')?.focus();}}
  async function confirmLocal(){
    if(!localProposal||disabled||busy||uncertain)return;
    const target=localProposal;localProposal=null;busy=true;onBusyChange?.(true);failure='';notice='';
    try{
      const[current,profile]=await Promise.all([currentState(),profileState()]);
      if(!live)return;
      if(current.provider!=='llamacpp'||current.editable!==true||current.busy||current.reconciliationRequired||current.revision!==target.current.revision||profile.revision!==target.profile.revision||profile.endpoint!==target.profile.endpoint){
        failure=tr('La connexion ou le profil a changé. Relis le choix avant de confirmer à nouveau.','The connection or profile changed. Review the choice before confirming again.');await onInferenceChange(current);return;
      }
      beforeChange();
      await change({provider:'llamacpp',llamaUrl:profile.endpoint,expectedRevision:current.revision,...(current.hasLlamaToken?{clearLlamaToken:true}:{})});
    }catch{if(live){localProfile=null;failure=tr('Profil local non confirmé. Aucun changement envoyé.','Local profile unconfirmed. No change was sent.');}}
    finally{if(live){busy=false;onBusyChange?.(uncertain);await tick();document.getElementById('chat-engine')?.focus();}}
  }
</script>

<div class="engine-picker">
  <label for="chat-engine">{tr('Moteur · tous les chats', 'Engine · all chats')}</label>
  <select id="chat-engine" bind:value={choice} disabled={disabled || busy || uncertain || !editable} aria-describedby="chat-engine-help">
    {#if !inference || !['bionic','llamacpp'].includes(inference.provider)}<option value="">{tr('Moteur non confirmé', 'Engine unconfirmed')}</option>{/if}
    <option value="bionic">Bionic</option><option value="llamacpp">llama.cpp</option>
  </select>
  <p id="chat-engine-help">{busy ? tr('Lecture de l’état du serveur…', 'Reading server state…') : !editable ? tr('Changement indisponible. Vérifie les réglages et les demandes en cours.', 'Change unavailable. Check settings and active requests.') : tr('Utilise la connexion déjà configurée sur le PC.', 'Uses the connection already configured on the PC.')}</p>
  {#if choice && choice !== inference?.provider && !uncertain}<Button type="button" variant="outline" disabled={disabled || busy || !editable} onclick={apply}>{tr('Utiliser ce moteur', 'Use this engine')}</Button>{/if}
  {#if canUseLocal}<button bind:this={localTrigger} type="button" class="local-profile-action" disabled={disabled||busy||uncertain||!editable} onclick={proposeLocal}>{tr('Utiliser les GGUF locaux','Use local GGUFs')}</button>{/if}
  {#if uncertain}<Button type="button" variant="outline" onclick={reread} disabled={busy}>{tr('Relire le moteur', 'Reload engine')}</Button>{/if}
  {#if failure}<p role="alert">{failure}</p>{/if}{#if notice}<p role="status">{notice}</p>{/if}
</div>

<WorkspaceDialog open={!!localProposal} title={tr('Utiliser les GGUF locaux','Use local GGUFs')} onClose={closeLocal}>
  {#snippet navigation()}<h2 class="local-title">{tr('Utiliser les GGUF locaux','Use local GGUFs')}</h2>{/snippet}
  <div class="local-confirm">
    <p>{tr('Connecter le compagnon au profil llama-server configuré sur ce PC :','Connect the companion to the llama-server profile configured on this PC:')}</p><p class="local-endpoint">{localProposal?.profile.endpoint}</p>
    <p>{tr('Le serveur externe actuel reste en place : il n’est ni arrêté ni adopté. Ce changement concerne tous les chats.','The current external server stays in place: it is neither stopped nor adopted. This change applies to all chats.')}</p>
    {#if localProposal?.current.hasLlamaToken}<p>{tr('Le jeton de la connexion llama-server externe sera effacé du compagnon.','The external llama-server connection token will be removed from the companion.')}</p>{/if}
    <p>{tr('Aucun processus ni modèle ne sera lancé ici. Choisis ensuite un fichier GGUF et confirme son chargement dans Modèle.','No process or model will start here. Then choose a GGUF file under Model and confirm its loading.')}</p>
    <div class="local-actions"><Button type="button" variant="outline" onclick={closeLocal}>{tr('Annuler','Cancel')}</Button><Button type="button" onclick={confirmLocal} disabled={busy}>{tr('Connecter le profil local','Connect local profile')}</Button></div>
  </div>
</WorkspaceDialog>

<style>
  .engine-picker{display:flex;flex-direction:column;gap:4px;min-width:0;}
  label{font-size:11px;color:var(--muted-foreground);line-height:1.5;}
  select{width:100%;max-width:100%;min-width:0;min-height:44px;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:7px;padding:8px 25px 8px 10px;font-size:12px;}
  select:disabled{opacity:.65;}select:focus-visible{outline:2px solid var(--ring);outline-offset:2px;}
  p{font-size:11px;line-height:1.45;color:var(--muted-foreground);margin:0;overflow-wrap:anywhere;}
  p[role=alert]{color:var(--foreground);font-weight:500;}
  .local-profile-action{text-align:left;min-height:44px;text-decoration:underline;text-underline-offset:3px;font-size:12px;}.local-profile-action:disabled{opacity:.55;}.local-profile-action:focus-visible{outline:2px solid var(--ring);outline-offset:2px;}
  :global(.workspace-dialog[open]:has(.local-confirm)){width:min(560px,calc(100vw - 32px));height:fit-content;max-height:90dvh;}
  :global(.workspace-dialog[open]:has(.local-confirm) .workspace-dialog-content){flex:0 1 auto;}
  .local-title{font-size:16px;font-weight:600;}.local-confirm{padding:20px;overflow:auto;font-size:14px;line-height:1.6;}.local-confirm p{font:inherit;line-height:inherit;color:var(--foreground);margin:0 0 16px;}.local-endpoint{font-weight:600;overflow-wrap:anywhere;}.local-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:12px;margin-top:24px;}
</style>
