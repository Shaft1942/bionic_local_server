<script lang="ts">
  import { formatMessageStats } from './message-stats.mjs';

  let { message, language = 'fr', running = false }: {
    message: { role?: string; metrics?: unknown; outcome?: string; interrupted?: boolean; directImage?: boolean };
    language?: 'fr' | 'en'; running?: boolean;
  } = $props();
  let disclosure = $state<HTMLDetailsElement>();
  let summaryElement = $state<HTMLElement>();
  const stats = $derived(formatMessageStats(message, { language, running }));
  function closeOnEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && disclosure?.open) {
      event.preventDefault(); disclosure.open = false; summaryElement?.focus();
    }
  }
</script>

{#if stats}
  <details class="message-stats" data-message-stats data-state={stats.state} aria-label={stats.accessibleTitle} bind:this={disclosure}>
    <summary bind:this={summaryElement} onkeydown={closeOnEscape}>
      <span class="stats-label">{stats.title}</span>
      {#if stats.hasMetrics}
        <span class="stats-summary">{#each stats.summary as item (item.key)}<span title={item.label} aria-label={item.label + ' : ' + item.value}>{item.value}</span>{/each}</span>
        {#if stats.partial}<span class="partial-label">{stats.partialLabel}</span>{/if}
      {:else}<span class="stats-unavailable">{stats.stateDescription}</span>{/if}
    </summary>
    <div class="stats-body">
      {#if stats.hasMetrics}<dl>{#each stats.details as item (item.key)}<div><dt>{item.label}</dt><dd>{item.value}</dd></div>{/each}</dl>{/if}
      {#if stats.hasMetrics}<p>{stats.rateNote}</p>{/if}
      <p>{stats.hasMetrics ? stats.note : stats.stateDescription}</p>
    </div>
  </details>
{/if}

<style>
  .message-stats{margin:12px 0 4px;color:var(--muted-foreground);font-size:12px;line-height:1.6;max-width:100%;font-variant-numeric:tabular-nums;}
  summary{cursor:pointer;min-height:36px;padding:6px 0;overflow-wrap:anywhere;}
  summary::marker{color:currentColor;font-size:.85em;}
  summary:hover .stats-label{text-decoration:underline;text-underline-offset:3px;}
  summary:focus-visible{outline:2px solid var(--ring);outline-offset:4px;border-radius:3px;}
  .stats-label{font-weight:500;color:var(--foreground);margin-right:12px;}
  .stats-summary{display:inline-flex;flex-wrap:wrap;gap:0 12px;}
  .stats-summary span{white-space:nowrap;}
  .partial-label{display:inline-block;margin-left:12px;color:var(--foreground);}
  .stats-unavailable{overflow-wrap:anywhere;}
  .stats-body{padding:6px 0 10px;max-width:68ch;}
  dl{margin:0;color:var(--foreground);}
  dl div{display:grid;grid-template-columns:minmax(0,1fr) max-content;gap:8px 20px;padding:3px 0;align-items:baseline;}
  dt{margin:0;overflow-wrap:anywhere;}
  dd{margin:0;text-align:right;}
  p{margin:8px 0 0;}
  @media(max-width:759px){summary{min-height:44px;padding:10px 0;}.stats-label{margin-right:8px;}.stats-summary{gap:0 10px;}.stats-body{font-size:12px;}dl div{column-gap:12px;}}
</style>
