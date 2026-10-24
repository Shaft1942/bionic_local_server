<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr } from './preferences.svelte';
  import { post, type Request } from './settings/types';
  type EngineState = { provider: 'bionic'|'llamacpp'; revision: string; editable?: boolean; busy?: boolean; reconciliationRequired?: boolean; [key: string]: unknown };
  let { request, inference, disabled = false, onBusyChange, onInferenceChange, beforeChange }: {
    request: Request; inference: EngineState | null; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
    onInferenceChange: (current: EngineState) => void | Promise<void>; beforeChange: () => void;
  } = $props();
  let choice = $state(''), busy = $state(false), uncertain = $state(false), failure = $state(''), notice = $state('');
  let seenRevision = '', live = true;
  $effect(() => { const revision = inference?.revision; if (revision && revision !== seenRevision) untrack(() => { seenRevision = revision; choice = inference?.provider || ''; }); });
  const editable = $derived(inference?.editable === true && !inference.busy && !inference.reconciliationRequired && typeof inference.revision === 'string');
  onMount(() => { live = true; return () => { live = false; onBusyChange?.(false); }; });
  async function read() {
    const value: unknown = await request('/api/inference/settings', { signal: AbortSignal.timeout(15000) });
    if (!value || typeof value !== 'object' || !('provider' in value) || !['bionic','llamacpp'].includes(String(value.provider)) || !('revision' in value) || typeof value.revision !== 'string' || !value.revision) throw Error('Invalid inference state');
    if (!live) return;
    const current = value as EngineState;
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
    let failed = false;
    try { await post(request, '/api/inference/settings', { provider, expectedRevision }); }
    catch { failed = true; }
    try {
      await read();
      if (live) notice = failed ? tr('État du serveur relu après une réponse non confirmée. Aucun changement renvoyé.', 'Server state refreshed after an unconfirmed response. No change was resubmitted.') : tr('Moteur actif actualisé pour tous les chats. Aucun modèle chargé automatiquement.', 'Active engine updated for all chats. No model was loaded automatically.');
    } catch { if (live) { uncertain = true; failure = tr('État du moteur non confirmé. Relis son état avant de continuer.', 'Engine state unconfirmed. Reload its state before continuing.'); } }
    finally { if (live) { busy = false; onBusyChange?.(uncertain); } }
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
  {#if uncertain}<Button type="button" variant="outline" onclick={reread} disabled={busy}>{tr('Relire le moteur', 'Reload engine')}</Button>{/if}
  {#if failure}<p role="alert">{failure}</p>{/if}{#if notice}<p role="status">{notice}</p>{/if}
</div>

<style>
  .engine-picker{display:flex;flex-direction:column;gap:4px;min-width:0;}
  label{font-size:11px;color:var(--muted-foreground);line-height:1.5;}
  select{width:100%;max-width:100%;min-width:0;min-height:44px;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:7px;padding:8px 25px 8px 10px;font-size:12px;}
  select:disabled{opacity:.65;}select:focus-visible{outline:2px solid var(--ring);outline-offset:2px;}
  p{font-size:11px;line-height:1.45;color:var(--muted-foreground);margin:0;overflow-wrap:anywhere;}
  p[role=alert]{color:var(--foreground);font-weight:500;}
</style>
