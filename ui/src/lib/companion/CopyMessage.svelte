<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { Copy, Check, X } from '@lucide/svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr } from './preferences.svelte';
  import { copyMessageText } from './message-clipboard';

  let { text, role = 'assistant', disabled = false }: { text: string; role?: 'user'|'assistant'; disabled?: boolean } = $props();
  let busy = $state(false), copyState = $state<'idle'|'copied'|'refused'>('idle'), manual = $state(false), manualText = $state('');
  let manualField = $state<HTMLDivElement>(), button = $state<HTMLButtonElement|null>(null);
  let timer: ReturnType<typeof setTimeout>|undefined, controller: AbortController|undefined, revision = 0, alive = true;
  const label = $derived(role === 'user' ? tr('Copier votre message', 'Copy your message') : tr('Copier la réponse', 'Copy the response'));
  const notice = $derived(copyState === 'copied' ? tr('Message copié', 'Message copied') : copyState === 'refused' ? tr('Copie non autorisée. Vous pouvez sélectionner le texte ci-dessous.', 'Copy was not allowed. You can select the text below.') : '');
  $effect(() => { text; role; revision++; controller?.abort(); clearTimeout(timer); busy = false; copyState = 'idle'; manual = false; manualText = ''; });
  onDestroy(() => { alive = false; revision++; controller?.abort(); clearTimeout(timer); });
  async function copy() {
    if (busy || disabled || !text.length) return;
    const source = text, current = revision;
    controller = new AbortController(); busy = true; copyState = 'idle'; manual = false; clearTimeout(timer);
    try {
      await copyMessageText(source, { signal: controller.signal });
      if (!alive || current !== revision) return;
      copyState = 'copied'; timer = setTimeout(() => { copyState = 'idle'; }, 2500);
    } catch (error) {
      if (!alive || current !== revision || (error as Error)?.name === 'AbortError') return;
      copyState = 'refused'; manualText = source; manual = true;
    } finally { if (alive && current === revision) busy = false; }
  }
  async function selectText() {
    await tick(); if (!manualField) return;
    manualField.focus({ preventScroll: true }); const selection = document.getSelection(), range = document.createRange();
    range.selectNodeContents(manualField); selection?.removeAllRanges(); selection?.addRange(range);
  }
  function closeManual() { manual = false; copyState = 'idle'; button?.focus({ preventScroll: true }); }
</script>

<div class="message-copy" data-copy-state={copyState}>
  <Button variant="ghost" size="sm" class="message-copy-button" bind:ref={button} disabled={disabled || busy || !text.length} onclick={()=>void copy()} aria-label={label} title={label} aria-busy={busy}>
    {#if copyState === 'copied'}<Check size={16} aria-hidden="true" />{:else}<Copy size={16} aria-hidden="true" />{/if}
    <span>{copyState === 'copied' ? tr('Copié', 'Copied') : tr('Copier', 'Copy')}</span>
  </Button>
  <span class="message-copy-status" role="status" aria-live="polite" aria-atomic="true">{notice}</span>
  {#if manual}
    <div class="message-copy-manual">
      <div class="message-copy-manual-tools"><Button variant="ghost" size="sm" onclick={()=>void selectText()}>{tr('Sélectionner le texte', 'Select text')}</Button><Button variant="ghost" size="sm" onclick={closeManual} aria-label={tr('Fermer la sélection du message', 'Close message selection')}><X size={16} aria-hidden="true" /></Button></div>
      <div class="message-copy-source" bind:this={manualField} tabindex="0" role="textbox" aria-readonly="true" aria-multiline="true" aria-label={tr('Texte du message à copier', 'Message text to copy')}>{manualText}</div>
    </div>
  {/if}
</div>

<style>
  .message-copy { display: flex; align-items: center; flex-wrap: wrap; gap: .25rem .5rem; min-width: 0; }
  .message-copy :global(.message-copy-button) { min-height: 2.75rem; color: var(--foreground); }
  .message-copy-status { font-size: .8125rem; color: var(--foreground); }
  .message-copy-status:empty { display: none; }
  .message-copy-manual { flex: 1 0 100%; min-width: 0; }
  .message-copy-manual-tools { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
  .message-copy-source { max-height: 16rem; overflow: auto; margin: .25rem 0; padding: .75rem; border: 1px solid var(--border); border-radius: .5rem; font-family: inherit; font-size: .875rem; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
  .message-copy-source:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
</style>
