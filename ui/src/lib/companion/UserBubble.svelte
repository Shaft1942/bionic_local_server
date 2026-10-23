<!-- Adapted from llama-ui 0ae0e197 ChatMessageUserBubble: server-owned companion
     messages, passive text, external CSS only. Bubble geometry and Card retained. -->
<script lang="ts">
  import Card from '$lib/components/ui/card/card.svelte';
  let { content }: { content: string } = $props();
  const isMultiline = $derived(content.includes('\n') || content.length > 95);
</script>
{#if content.trim()}
  <Card
    class="chat-message-user-bubble max-w-[80%] overflow-y-auto rounded-[1.125rem] border-none bg-primary/5 px-3.75 py-1.5 text-foreground backdrop-blur-md data-multiline:py-2.5 dark:bg-primary/15"
    data-multiline={isMultiline ? '' : undefined}
  ><span class="text-md whitespace-pre-wrap">{content}</span></Card>
{/if}
<style>
  :global(.chat-message-user-bubble) { overflow-wrap: anywhere; word-break: break-word; }
</style>
