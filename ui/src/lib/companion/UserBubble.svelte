<!-- Adapted from llama-ui 0ae0e197 ChatMessageUserBubble: server-owned companion
     messages, passive text, external CSS only. Bubble geometry and Card retained. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import Markdown from './Markdown.svelte';
  import { tr } from './preferences.svelte';
  let { content, actions }: { content: string; actions?: Snippet } = $props();
  const isMultiline = $derived(content.includes('\n') || content.length > 95);
</script>
{#if content.trim() || actions}
  <Card
    class="chat-message-user-bubble max-w-[80%] gap-0 overflow-y-auto rounded-[1.125rem] border-none bg-primary/5 px-3.75 py-1.5 text-foreground backdrop-blur-md data-multiline:py-2.5 dark:bg-primary/15"
    data-multiline={isMultiline ? '' : undefined}
  >{#if actions}<div class="message-header message-header-user" role="group" aria-label={tr('Actions du message','Message actions')}>{@render actions()}</div>{/if}<Markdown {content} /></Card>
{/if}
<style>
  :global(.chat-message-user-bubble) { overflow-wrap: anywhere; word-break: break-word; }
  .message-header { display: grid; grid-template-columns: minmax(0, 1fr) 44px 44px; column-gap: 2px; row-gap: 4px; align-items: center; min-width: 0; margin-bottom: 2px; }
</style>
