<script lang="ts">
  import Button from '$lib/components/ui/button/button.svelte';
  import { Download } from '@lucide/svelte';
  import { tr } from './preferences.svelte';
  let { text, compact=false }: { text: string; compact?:boolean } = $props();
  let failure = $state('');
  function download() {
    failure = '';
    let url: string | undefined;
    const link = document.createElement('a');
    try {
      url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      link.href = url; link.download = 'brouillon-message.txt';
      document.body.append(link); link.click();
    } catch {
      failure = tr('Téléchargement indisponible. Sélectionne le brouillon pour le copier.', 'Download unavailable. Select the draft to copy it.');
    } finally {
      link.remove();
      if (url) { const downloaded = url; setTimeout(() => URL.revokeObjectURL(downloaded), 1000); }
    }
  }
</script>

<div class="draft-download" class:compact>
  <Button type="button" variant="ghost" size="sm" aria-label={tr('Télécharger le brouillon', 'Download draft')} title={tr('Télécharger le brouillon', 'Download draft')} disabled={!text.length} onclick={download}>
    <Download size={15} aria-hidden="true" />{#if !compact}{tr('Télécharger le brouillon', 'Download draft')}{/if}
  </Button>
  {#if failure}<p role="alert">{failure}</p>{/if}
</div>

<style>
  .draft-download { min-width: 0; margin-block-start: .5rem; }
  .draft-download :global(button) { min-height: 2.75rem; white-space: normal; color: var(--muted-foreground); }
  .draft-download p { font-size: .875rem; overflow-wrap: anywhere; }
  .draft-download.compact{margin:0;flex:0 0 44px;}.compact :global(button){width:44px;height:44px;min-width:44px;padding:0;}.compact p{position:absolute;left:0;right:0;bottom:100%;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--background);color:var(--foreground);z-index:20;}
</style>
