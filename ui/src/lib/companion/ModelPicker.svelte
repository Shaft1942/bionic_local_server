<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { tr } from './preferences.svelte';
  import { post, message, uuid, type Request } from './settings/types';

  let { request, models, inference, model = $bindable(''), disabled = false, onSelected, onInferenceChange, onBusyChange, onFailure }: {
    request: Request; models: any[]; inference: any; model?: string; disabled?: boolean;
    onSelected?: () => void; onInferenceChange?: () => void | Promise<void>; onBusyChange?: (busy: boolean) => void; onFailure?: (failure: string) => void;
  } = $props();
  let profile = $state<any>(null), catalogue = $state<any>(null), selectionState = $state<any>(null);
  let choice = $state(''), loading = $state(false), submitting = $state(false), reconciling = $state(false), mounted = $state(false), targetName = $state(''), pollTick = $state(0), readFailures = $state(0);
  let refreshSequence = 0;
  const llama = $derived(inference?.provider === 'llamacpp');
  const pending = $derived(selectionState?.operation && ['accepted', 'starting', 'unknown'].includes(selectionState.operation.state));
  const transitionBusy = $derived(llama && (submitting || reconciling || selectionState?.busy === true || selectionState?.reconciliationRequired === true));
  const uncertain = $derived(selectionState?.reconciliationRequired === true && !selectionState?.busy && !submitting);
  const endpoint = (value: string) => { try { return new URL(value).origin; } catch { return ''; } };
  const profileConnected = $derived(!!profile && endpoint(inference?.llamaUrl) === endpoint(profile.profile.endpoint));
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
    } catch (error) { if (mounted && sequence === refreshSequence) onFailure?.(message(error)); }
    finally { if (mounted && sequence === refreshSequence) loading = false; }
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
    if (disabled || transitionBusy || !chosen?.selectable || !profile?.canControl || selectionState?.editable === false) { queueMicrotask(() => { choice = model; }); return; }
    const target = { id: chosen.id, name: fileName(chosen) };
    const tokenNotice = inference?.hasLlamaToken ? '\n\n' + tr('La connexion passera au profil local ; le jeton du llama-server externe sera effacé.', 'The connection will switch to the local profile; the external llama-server token will be cleared.') : '';
    if (!confirm(tr('Charger ce GGUF et l’utiliser pour les prochains messages : ', 'Load this GGUF and use it for subsequent messages: ') + target.name + '\n\n' + tr('Le modèle possédé en cours sera remplacé. Les serveurs externes restent sous ton contrôle.', 'The current owned model will be replaced. External servers remain under your control.') + tokenNotice)) { queueMicrotask(() => { choice = model; }); return; }
    submitting = true; targetName = target.name; onFailure?.('');
    try {
      selectionState = await post(request, '/api/inference/select-model', {
        modelId: target.id, requestId: 'composer-' + uuid(), expectedRevision: selectionState.profileRevision,
        expectedInferenceRevision: selectionState.inferenceRevision, consent: true
      }, { 'X-Local-Service-CSRF': selectionState.csrfNonce || profile.csrfNonce });
      await refresh(); await onInferenceChange?.();
    } catch (error) {
      onFailure?.(message(error)); await refresh(); await onInferenceChange?.();
      if (selectionState?.activeModel?.ggufId === target.id) onFailure?.('');
    } finally { submitting = false; if (!pending) targetName = ''; choice = pending ? 'pending' : model; }
  }
</script>

{#if llama}
  <select aria-label={tr('Modèle', 'Model')} bind:value={choice} onchange={choose} disabled={disabled || transitionBusy} title={models.find(item => item.id === model) ? displayName(models.find(item => item.id === model)) : undefined}>
    {#if submitting || reconciling || pending}<option value="pending" disabled>{uncertain ? tr('À vérifier', 'Needs review') : tr('Chargement…', 'Loading…')}{pendingName ? ' · ' + pendingName : ''}</option>{/if}
    {#if !models.length}<option value="">{loading ? tr('Lecture des modèles…', 'Reading models…') : tr('Aucun modèle chargé', 'No model loaded')}</option>{/if}
    {#if models.length}<optgroup label={tr('Modèle chargé', 'Loaded model')}>{#each models as item}<option value={item.id}>{displayName(item)}</option>{/each}</optgroup>{/if}
    {#if catalogue?.models?.length}<optgroup label={tr('Fichiers GGUF', 'GGUF files')}>{#each catalogue.models as item}<option value={'gguf:' + item.id} disabled={!item.selectable || !profile?.canControl || selectionState?.editable === false}>{fileName(item)}{!item.selectable ? ' · ' + tr('non pris en charge', 'unsupported') : ''}</option>{/each}</optgroup>{/if}
  </select>
{:else}
  <select aria-label={tr('Modèle', 'Model')} bind:value={model} disabled={disabled} onchange={onSelected}>{#each models as item}<option value={item.id}>{item.name || item.id}{item.loaded ? ' · ' + tr('chargé', 'loaded') : ''}</option>{/each}{#if !models.length}<option value="">{tr('Aucun modèle disponible', 'No model available')}</option>{/if}</select>
{/if}
