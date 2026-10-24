<script lang="ts">
  import { Files, ChevronRight } from '@lucide/svelte';
  import { tr } from './preferences.svelte';
  let { attachments }: { attachments: unknown[] } = $props();
  const entries = $derived(attachments.filter((value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)));
  function imageSource(file: Record<string, unknown>): string | undefined {
    return file.kind === 'image' && typeof file.hash === 'string' && /^[a-f0-9]{64}$/.test(file.hash) && typeof file.mime === 'string' && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mime)
      ? '/api/attachment-image?' + new URLSearchParams({ hash: file.hash, mime: file.mime }) : undefined;
  }
</script>

<div class="message-attachments">
  {#each entries as file}
    <details>
      <summary><ChevronRight class="attachment-chevron" size={15} aria-hidden="true" /><Files size={15} aria-hidden="true" /><span>{typeof file.name === 'string' ? file.name : typeof file.path === 'string' ? file.path : tr('Pièce jointe', 'Attachment')}{file.excerpt ? tr(' · extrait', ' · excerpt') : ''}</span></summary>
      {#if imageSource(file)}
        <img src={imageSource(file)} alt={typeof file.name === 'string' ? file.name : tr('Image jointe', 'Attached image')} loading="lazy" />
      {:else if typeof file.text === 'string'}
        <pre>{file.text}</pre>
      {:else}
        <p>{tr('Aperçu indisponible pour cette pièce jointe.', 'Preview unavailable for this attachment.')}</p>
      {/if}
    </details>
  {/each}
</div>

<style>
  .message-attachments { margin-block: .75rem; min-width: 0; }
  details { margin-block: .5rem; min-width: 0; }
  summary { display: flex; align-items: center; gap: .5rem; padding-block: .5rem; min-height: 2.75rem; cursor: pointer; font-size: .875rem; }
  summary :global(svg) { flex-shrink: 0; }
  details[open] > summary :global(.attachment-chevron) { transform: rotate(90deg); }
  summary span { overflow-wrap: anywhere; }
  summary:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  pre { max-height: 18rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: .75rem; border: 1px solid var(--border); border-radius: .5rem; font-size: .875rem; }
  img { display: block; max-width: 100%; max-height: 28rem; object-fit: contain; }
  p { color: var(--muted-foreground); font-size: .875rem; }
</style>
