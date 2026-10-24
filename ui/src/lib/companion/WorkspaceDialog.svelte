<script lang="ts">
  import type { Snippet } from 'svelte';
  import { X } from '@lucide/svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr } from './preferences.svelte';
  let { open, title, onClose, navigation, children }: { open:boolean; title:string; onClose:()=>void; navigation:Snippet; children:Snippet } = $props();
  let dialog=$state<HTMLDialogElement>();
  let backdropPointer:number|null=null;
  function outside(event:PointerEvent){if(!dialog)return false;const box=dialog.getBoundingClientRect();return event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom;}
  function pointerDown(event:PointerEvent){backdropPointer=event.button===0&&outside(event)?event.pointerId:null;}
  function pointerUp(event:PointerEvent){const close=backdropPointer===event.pointerId&&outside(event);backdropPointer=null;if(close)onClose();}
  $effect(()=>{if(!dialog)return;if(open&&!dialog.open)dialog.showModal();else if(!open&&dialog.open)dialog.close();});
</script>

<dialog bind:this={dialog} aria-label={title} class="workspace-dialog" onpointerdown={pointerDown} onpointerup={pointerUp} onpointercancel={()=>backdropPointer=null} oncancel={event=>{event.preventDefault();onClose();}} onclose={()=>{if(open)onClose();}}>
  <header class="workspace-dialog-header">{@render navigation()}<Button variant="ghost" size="icon" aria-label={tr('Fermer la fenêtre','Close window')} onclick={onClose}><X /></Button></header>
  <div class="workspace-dialog-content">{@render children()}</div>
</dialog>

<style>
  .workspace-dialog { width:min(1180px,calc(100vw - 48px)); height:min(850px,90dvh); max-width:none; max-height:none; margin:auto; padding:0; border:1px solid var(--border); border-radius:16px; color:var(--foreground); background:var(--background); box-shadow:0 22px 90px #0003; overflow:hidden; }
  .workspace-dialog[open] { display:flex; flex-direction:column; }
  .workspace-dialog::backdrop { background:#0005; }
  .workspace-dialog-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 16px; border-bottom:1px solid var(--border); flex-shrink:0; }
  .workspace-dialog-content { display:flex; flex-direction:column; flex:1; min-height:0; min-width:0; overflow:hidden; }
  @media(max-width:650px) { .workspace-dialog { width:calc(100vw - 16px); height:calc(100dvh - 32px); border-radius:12px; }.workspace-dialog-header { padding:8px; gap:4px; } }
  @media(prefers-reduced-motion:no-preference) { .workspace-dialog[open] { animation:appear 140ms ease-out; }@keyframes appear { from { opacity:0;transform:translateY(5px); }to { opacity:1;transform:translateY(0); } } }
</style>
