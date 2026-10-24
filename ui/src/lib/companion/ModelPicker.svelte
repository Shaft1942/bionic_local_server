<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import WorkspaceDialog from './WorkspaceDialog.svelte';
  import { tr } from './preferences.svelte';
  import { post, message, uuid, type Request } from './settings/types';

  let { request, models, inference, model = $bindable(''), disabled = false, onSelected, onInferenceChange, onBusyChange, onFailure }: {
    request: Request; models: any[]; inference: any; model?: string; disabled?: boolean;
    onSelected?: () => void; onInferenceChange?: () => void | Promise<void>; onBusyChange?: (busy: boolean) => void; onFailure?: (failure: string) => void;
  } = $props();
  let profile = $state<any>(null), catalogue = $state<any>(null), selectionState = $state<any>(null);
  let choice = $state(''), loading = $state(false), submitting = $state(false), reconciling = $state(false), mounted = $state(false), targetName = $state(''), pollTick = $state(0), readFailures = $state(0);
  let refreshSequence = 0;
  type Proposal = { id:string; name:string; profileRevision:string; inferenceRevision:string; tokenNotice:boolean };
  let proposal=$state<Proposal|null>(null), picker=$state<HTMLSelectElement>();
  const llama = $derived(inference?.provider === 'llamacpp');
  const pending = $derived(selectionState?.operation && ['accepted', 'starting', 'unknown'].includes(selectionState.operation.state));
  const transitionBusy = $derived(llama && (submitting || reconciling || selectionState?.busy === true || selectionState?.reconciliationRequired === true));
  const uncertain = $derived(selectionState?.reconciliationRequired === true && !selectionState?.busy && !submitting);
  const endpoint = (value: string) => { try { return new URL(value).origin; } catch { return ''; } };
  const profileConnected = $derived(!!profile && endpoint(inference?.llamaUrl) === endpoint(profile.profile.endpoint));
  const unownedProfile = $derived(profile?.process?.state === 'detected-unowned');
  const externalNotice=()=>tr('Le port du profil local est occupé par un serveur externe. Arrête-le depuis son lanceur ou choisis un autre port dans Serveurs du PC. Aucun serveur externe ne sera arrêté par ce choix.','The local profile port is occupied by an external server. Stop it from its launcher or choose another port under PC servers. This selection will not stop an external server.');
  const fileName = (item: any) => item?.relativePath?.split(/[\\/]/).at(-1) || item?.name || '';
  const operationFile = $derived(catalogue?.models?.find((item: any) => item.id === selectionState?.operation?.modelId));
  const pendingName = $derived(targetName || fileName(operationFile));
  const displayName = (item: any) => {
    if (profileConnected && profile?.process?.owned && item.inferenceId === profile.process.model?.inferenceAlias) {
      const file = catalogue?.models?.find((candidate: any) => candidate.id === profile.process.model.id);
      return fileName(file) || profile.process.model.name;
    }
    return item.name || item.id;
  };
  $effect(() => { onBusyChange?.(transitionBusy); });
  $effect(() => { choice = llama && (submitting || reconciling || pending) ? 'pending' : model; });
  $effect(() => {
    const current = inference;
    if (mounted && current?.provider === 'llamacpp') untrack(() => { void refresh(); });
  });
  $effect(() => {
    const tick = pollTick;
    if (!mounted || !llama || submitting || reconciling || !pending) return;
    const timer = setTimeout(() => { void reconcile(); }, readFailures ? 5000 : 1800);
    return () => clearTimeout(timer);
  });
  onMount(() => {
    mounted = true;
    const resume = () => { if (!document.hidden && llama && !submitting && !reconciling && pending) void reconcile(); };
    document.addEventListener('visibilitychange', resume); window.addEventListener('focus', resume);
    return () => { mounted = false; refreshSequence++; document.removeEventListener('visibilitychange', resume); window.removeEventListener('focus', resume); onBusyChange?.(false); };
  });

  async function refresh() {
    const sequence = ++refreshSequence;
    loading = true;
    try {
      const [state, server] = await Promise.all([request('/api/inference/model-selection'), request('/api/llama-server')]);
      const files = await request('/api/llama-server/models?' + new URLSearchParams({ directory: server.profile.directory }));
      if (!mounted || sequence !== refreshSequence) return;
      profile = server; catalogue = files; selectionState = state;
      if(server.process?.state==='detected-unowned')onFailure?.(externalNotice());
      return true;
    } catch (error) { if (mounted && sequence === refreshSequence) onFailure?.(message(error)); }
    finally { if (mounted && sequence === refreshSequence) loading = false; }
    return false;
  }
  async function reconcile() {
    if (reconciling) return;
    reconciling = true;
    try {
      const state = await request('/api/inference/model-selection');
      if (!mounted) return;
      selectionState = state; readFailures = 0;
      if (!state.busy && !state.reconciliationRequired) { await refresh(); await onInferenceChange?.(); targetName = ''; if (state.activeModel) onFailure?.(''); }
    } catch (error) { if (mounted) { readFailures++; onFailure?.(message(error)); } }
    finally { reconciling = false; if (mounted) pollTick++; }
  }
  async function choose(event: Event) {
    // The native change listener runs before Svelte's bind:value listener.
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (!llama || !value.startsWith('gguf:')) { model = value; onSelected?.(); return; }
    const chosen = catalogue?.models?.find((item: any) => 'gguf:' + item.id === value);
    queueMicrotask(() => { choice = model; });
    if (disabled || transitionBusy || loading || !chosen?.selectable || !profile?.canControl || unownedProfile || selectionState?.editable === false) return;
    proposal={id:chosen.id,name:fileName(chosen),profileRevision:selectionState.profileRevision,inferenceRevision:selectionState.inferenceRevision,tokenNotice:inference?.hasLlamaToken===true};
  }
  async function closeProposal(){proposal=null;await tick();picker?.focus();}
  async function confirmProposal(){
    if(!proposal||submitting)return;
    if(disabled||!llama){await closeProposal();return;}
    const target=proposal;proposal=null;
    // Re-read before any effect: the profile, engine or ownership may have changed
    // while the user was reviewing the confirmation.
    submitting = true; targetName = target.name; onFailure?.('');
    try {
      if(!await refresh())return;
      const chosen=catalogue?.models?.find((item:any)=>item.id===target.id);
      if(!mounted||!llama||!chosen?.selectable||!profile?.canControl||unownedProfile||selectionState?.editable===false||selectionState?.busy||selectionState?.reconciliationRequired||target.profileRevision!==selectionState?.profileRevision||target.inferenceRevision!==selectionState?.inferenceRevision){
        onFailure?.(unownedProfile?externalNotice():tr('Le modèle, le profil ou le moteur a changé. Relis le choix avant de confirmer à nouveau.','The model, profile or engine changed. Review the selection before confirming again.'));return;
      }
      selectionState = await post(request, '/api/inference/select-model', {
        modelId: target.id, requestId: 'composer-' + uuid(), expectedRevision: target.profileRevision,
        expectedInferenceRevision: target.inferenceRevision, consent: true
      }, { 'X-Local-Service-CSRF': selectionState.csrfNonce || profile.csrfNonce });
      await refresh(); await onInferenceChange?.();
    } catch (error) {
      onFailure?.(message(error)); await refresh(); await onInferenceChange?.();
      if (selectionState?.activeModel?.ggufId === target.id) onFailure?.('');
    } finally { submitting = false; if (!pending) targetName = ''; choice = pending ? 'pending' : model;await tick();picker?.focus(); }
  }
</script>

{#if llama}
  <select bind:this={picker} aria-label={tr('Modèle', 'Model')} bind:value={choice} onchange={choose} disabled={disabled || transitionBusy || loading} title={unownedProfile?externalNotice():models.find(item => item.id === model) ? displayName(models.find(item => item.id === model)) : undefined}>
    {#if submitting || reconciling || pending}<option value="pending" disabled>{uncertain ? tr('À vérifier', 'Needs review') : tr('Chargement…', 'Loading…')}{pendingName ? ' · ' + pendingName : ''}</option>{/if}
    {#if !models.length}<option value="">{loading ? tr('Lecture des modèles…', 'Reading models…') : tr('Aucun modèle chargé', 'No model loaded')}</option>{/if}
    {#if models.length}<optgroup label={tr('Modèle chargé', 'Loaded model')}>{#each models as item}<option value={item.id}>{displayName(item)}</option>{/each}</optgroup>{/if}
    {#if catalogue?.models?.length}<optgroup label={tr('Fichiers GGUF', 'GGUF files')}>{#each catalogue.models as item}<option value={'gguf:' + item.id} disabled={!item.selectable || !profile?.canControl || unownedProfile || selectionState?.editable === false}>{fileName(item)}{!item.selectable ? ' · ' + tr('non pris en charge', 'unsupported') : ''}</option>{/each}</optgroup>{/if}
  </select>
{:else}
  <select aria-label={tr('Modèle', 'Model')} bind:value={model} disabled={disabled} onchange={onSelected}>{#each models as item}<option value={item.id}>{item.name || item.id}{item.loaded ? ' · ' + tr('chargé', 'loaded') : ''}</option>{/each}{#if !models.length}<option value="">{tr('Aucun modèle disponible', 'No model available')}</option>{/if}</select>
{/if}

<WorkspaceDialog open={!!proposal} title={tr('Charger le modèle GGUF','Load GGUF model')} onClose={closeProposal}>
  {#snippet navigation()}<h2 class="model-confirm-title">{tr('Charger le modèle GGUF','Load GGUF model')}</h2>{/snippet}
  <div class="model-confirm">
    <p>{tr('Utiliser ce fichier pour les prochains messages :','Use this file for subsequent messages:')}</p><p class="model-confirm-file">{proposal?.name}</p>
    <p>{tr('Le processus possédé en cours sera remplacé. Les serveurs externes restent sous ton contrôle.','The current owned process will be replaced. External servers remain under your control.')}</p>
    {#if proposal?.tokenNotice}<p>{tr('La connexion passera au profil local ; le jeton du llama-server externe sera effacé.','The connection will switch to the local profile; the external llama-server token will be cleared.')}</p>{/if}
    <div class="model-confirm-actions"><Button type="button" variant="outline" onclick={closeProposal}>{tr('Annuler','Cancel')}</Button><Button type="button" onclick={confirmProposal} disabled={submitting}>{tr('Charger et utiliser','Load and use')}</Button></div>
  </div>
</WorkspaceDialog>

<style>
  :global(.workspace-dialog:has(.model-confirm)){width:min(560px,calc(100vw - 32px));height:auto;max-height:90dvh;}
  .model-confirm-title{font-size:16px;font-weight:600;}
  .model-confirm{padding:20px;overflow:auto;font-size:14px;line-height:1.6;}
  .model-confirm p{margin:0 0 16px;}
  .model-confirm-file{font-weight:600;overflow-wrap:anywhere;}
  .model-confirm-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:12px;margin-top:24px;}
</style>
