<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { RefreshCw, Settings2 } from '@lucide/svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr } from './preferences.svelte';
  import { post, message, uuid, type Request } from './settings/types';

  let { request, models, inference, model = $bindable(''), disabled = false, onSelected, onInferenceChange, onConfigure, onBusyChange }: {
    request: Request; models: any[]; inference: any; model?: string; disabled?: boolean;
    onSelected?: () => void; onInferenceChange?: () => void | Promise<void>; onConfigure?: () => void; onBusyChange?: (busy: boolean) => void;
  } = $props();
  let profile = $state<any>(null), catalogue = $state<any>(null), selectionState = $state<any>(null);
  let selected = $state(''), loading = $state(false), submitting = $state(false), failure = $state(''), notice = $state(''), mounted = $state(false);
  let refreshSequence = 0;
  const llama = $derived(inference?.provider === 'llamacpp');
  const chosen = $derived(catalogue?.models?.find((item: any) => item.id === selected));
  const active = $derived(models.find(item => item.id === model) || models.find(item => item.loaded));
  const transitionBusy = $derived(submitting || selectionState?.busy === true || selectionState?.reconciliationRequired === true);
  const endpoint = (value: string) => { try { return new URL(value).origin; } catch { return ''; } };
  const profileConnected = $derived(!!profile && endpoint(inference?.llamaUrl) === endpoint(profile.profile.endpoint));
  const selectedIsActive = $derived(profileConnected && profile?.process?.state === 'running' && profile?.process?.model?.id === selected && !!active?.loaded);
  const externalActive = $derived(!!active?.loaded && (!profileConnected || profile?.process?.owned !== true));
  const pending = $derived(selectionState?.operation && ['accepted', 'starting', 'unknown'].includes(selectionState.operation.state));
  const uncertain = $derived(selectionState?.reconciliationRequired === true && !selectionState?.busy && !submitting);
  const displayName = (item: any) => profileConnected && profile?.process?.owned && item.inferenceId === profile.process.model?.inferenceAlias ? profile.process.model.name : item.name || item.id;
  $effect(() => { onBusyChange?.(transitionBusy); });
  $effect(() => {
    const current = inference;
    if (mounted && current?.provider === 'llamacpp') untrack(() => { void refresh(); });
  });
  $effect(() => {
    if (!mounted || !llama || submitting || !pending) return;
    const timer = setTimeout(() => { void reconcile(); }, 2200);
    return () => clearTimeout(timer);
  });
  onMount(() => { mounted = true; return () => { mounted = false; refreshSequence++; onBusyChange?.(false); }; });

  async function refresh() {
    const sequence = ++refreshSequence;
    loading = true;
    try {
      const [state, server] = await Promise.all([request('/api/inference/model-selection'), request('/api/llama-server')]);
      const files = await request('/api/llama-server/models?' + new URLSearchParams({ directory: server.profile.directory }));
      if (!mounted || sequence !== refreshSequence) return;
      profile = server; catalogue = files; selectionState = state;
      if (!files.models?.some((item: any) => item.id === selected)) selected = server.process?.model?.id || server.profile.modelId || '';
    } catch (error) { if (mounted && sequence === refreshSequence) failure = message(error); }
    finally { if (mounted && sequence === refreshSequence) loading = false; }
  }
  async function reconcile() {
    try {
      const state = await request('/api/inference/model-selection');
      if (!mounted) return;
      selectionState = state;
      if (!state.busy && !state.reconciliationRequired) {
        await refresh(); await onInferenceChange?.();
        if (state.activeModel?.ggufId === selected) { failure = ''; notice = tr('État retrouvé : le GGUF est actif. Aucun second chargement envoyé.', 'Recovered status: the GGUF is active. No second load was submitted.'); }
      }
    } catch (error) { if (mounted) failure = message(error); }
  }
  async function loadSelected() {
    if (disabled || transitionBusy || !chosen?.selectable || !profile || !selectionState) return;
    const target = { id: chosen.id, name: chosen.name };
    const tokenNotice = inference?.hasLlamaToken ? '\n\n' + tr('La connexion passera au profil local ; le jeton du llama-server externe sera effacé.', 'The connection will switch to the local profile; the external llama-server token will be cleared.') : '';
    if (!confirm(tr('Charger ce GGUF et l’utiliser pour les prochains messages : ', 'Load this GGUF and use it for subsequent messages: ') + target.name + '\n\n' + tr('Le modèle possédé en cours sera remplacé. Les serveurs externes restent sous ton contrôle.', 'The current owned model will be replaced. External servers remain under your control.') + tokenNotice)) return;
    submitting = true; failure = ''; notice = '';
    try {
      const result = await post(request, '/api/inference/select-model', {
        modelId: target.id, requestId: 'composer-' + uuid(), expectedRevision: selectionState.profileRevision,
        expectedInferenceRevision: selectionState.inferenceRevision, consent: true
      }, { 'X-Local-Service-CSRF': selectionState.csrfNonce || profile.csrfNonce });
      selectionState = result;
      await refresh(); await onInferenceChange?.();
      if (result.operation?.state === 'succeeded') notice = tr('GGUF actif pour les prochains messages.', 'GGUF active for subsequent messages.');
      else notice = tr('Action suivie sur le serveur. Son état sera relu sans renvoyer le chargement.', 'The server is tracking this action. Its status will be refreshed without resubmitting the load.');
    } catch (error) {
      failure = message(error);
      await refresh(); await onInferenceChange?.();
      const recovered = selectionState?.activeModel?.ggufId === target.id;
      if (recovered) failure = '';
      notice = recovered
        ? tr('État retrouvé : le GGUF est actif. Aucun second chargement envoyé.', 'Recovered status: the GGUF is active. No second load was submitted.')
        : tr('État relu. Aucun chargement renvoyé automatiquement ; actualise ou consulte les paramètres du moteur.', 'Status refreshed. No load was automatically resubmitted; refresh or review engine settings.');
    } finally { submitting = false; }
  }
</script>

<div class:llama class="model-picker">
  {#if llama}
    <div class="gguf-row">
      <label class="gguf-field"><span>GGUF</span><select aria-label={tr('Fichier GGUF', 'GGUF file')} bind:value={selected} disabled={disabled || transitionBusy || loading} onchange={() => { failure = ''; notice = ''; }}>
        <option value="">{loading ? tr('Lecture des GGUF…', 'Reading GGUF files…') : tr('Choisir un fichier GGUF', 'Choose a GGUF file')}</option>
        {#each catalogue?.models || [] as item}<option value={item.id} disabled={!item.selectable}>{item.name}{!item.selectable ? ' · ' + tr('non pris en charge', 'unsupported') : ''}</option>{/each}
      </select></label>
      <Button type="button" variant="outline" size="sm" onclick={loadSelected} disabled={disabled || transitionBusy || loading || !chosen?.selectable || !profile?.canControl || selectionState?.editable === false || selectedIsActive}>{uncertain ? tr('À vérifier', 'Needs review') : submitting || pending ? tr('Chargement…', 'Loading…') : selectedIsActive ? tr('GGUF actif', 'GGUF active') : tr('Charger le GGUF', 'Load GGUF')}</Button>
      <Button type="button" variant="ghost" size="icon" aria-label={tr('Actualiser les modèles du champ de message', 'Refresh message field models')} onclick={async () => { failure = ''; await refresh(); await onInferenceChange?.(); }} disabled={loading || submitting}><RefreshCw /></Button>
      {#if onConfigure}<Button type="button" variant="ghost" size="icon" aria-label={tr('Configurer le moteur d’inférence', 'Configure inference engine')} onclick={onConfigure}><Settings2 /></Button>{/if}
    </div>
    <div class="active-row"><span>{tr('Actif :', 'Active:')}</span><select aria-label={tr('Modèle', 'Model')} bind:value={model} disabled={disabled || transitionBusy} onchange={onSelected}>{#each models as item}<option value={item.id}>{displayName(item)}{item.loaded ? ' · ' + tr('chargé', 'loaded') : ''}</option>{/each}{#if !models.length}<option value="">{tr('Aucun modèle disponible', 'No model available')}</option>{/if}</select></div>
    {#if externalActive}<p class="picker-hint">{tr('Le modèle actif dépend d’un serveur externe. Arrête-le avant de charger un GGUF géré par Canaé.', 'The active model uses an external server. Stop it before loading a GGUF managed by Canaé.')}</p>{/if}
    {#if chosen && !selectedIsActive}<p class="picker-hint chosen-file">{chosen.relativePath}</p>{/if}
    {#if uncertain}<p class="picker-hint" role="status">{tr('Le chargement reste à vérifier. Actualise son état ou ouvre les paramètres du moteur ; aucun chargement ne sera relancé automatiquement.', 'The load needs review. Refresh its status or open engine settings; loading will not be restarted automatically.')}</p>{:else if pending}<p class="picker-hint" role="status">{tr('Le chargement est suivi après déconnexion. La relecture de son état ne le relance pas.', 'Loading remains tracked after disconnection. Refreshing its status does not restart it.')}</p>{/if}
    {#if selectionState?.editable === false}<p class="picker-hint">{tr('Cette connexion est fixée par son lanceur. Le changement de GGUF est indisponible ici.', 'This connection is fixed by its launcher. GGUF switching is unavailable here.')}</p>{/if}
    {#if failure}<p class="picker-error" role="alert">{failure}</p>{/if}
    {#if notice}<p class="picker-hint" role="status">{notice}</p>{/if}
  {:else}
    <select aria-label={tr('Modèle', 'Model')} bind:value={model} disabled={disabled} onchange={onSelected}>{#each models as item}<option value={item.id}>{item.name || item.id}{item.loaded ? ' · ' + tr('chargé', 'loaded') : ''}</option>{/each}{#if !models.length}<option value="">{tr('Aucun modèle disponible', 'No model available')}</option>{/if}</select>
  {/if}
</div>

<style>
  .model-picker { min-width: 0; max-width: 100%; }
  .model-picker.llama { width: 100%; }
  .gguf-row, .gguf-field, .active-row { display: flex; align-items: center; min-width: 0; gap: 6px; }
  .gguf-row { flex-wrap: wrap; }
  .gguf-field { flex: 1 1 210px; }
  .gguf-field > span, .active-row > span { flex-shrink: 0; font-size: 12px; color: var(--muted-foreground); }
  select { max-width: 100%; min-width: 0; background: transparent; color: var(--foreground); border: 0; border-radius: 6px; padding: 6px; font-size: 12px; text-overflow: ellipsis; }
  .gguf-field select { width: 100%; border: 1px solid var(--border); }
  select:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .active-row { margin-top: 4px; }
  .active-row select { flex: 1; }
  .picker-hint, .picker-error { margin: 4px 0 0; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .picker-hint { color: var(--muted-foreground); }
  .picker-error { color: var(--destructive); }
  .chosen-file { max-height: 3em; overflow: auto; }
  @media (max-width: 600px) { .gguf-field { flex-basis: 100%; } }
</style>
