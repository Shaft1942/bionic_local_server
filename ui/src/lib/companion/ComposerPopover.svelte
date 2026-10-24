<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  let { id, menu, label, title = label, trigger, children }: { id:string; menu:'files'|'tools'; label:string; title?:string; trigger:Snippet; children:Snippet } = $props();
  let panel=$state<HTMLDivElement>(),button=$state<HTMLButtonElement>(),expanded=$state(false);
  let invalidTarget:HTMLElement|null=null;
  function position(){
    if(!panel?.matches(':popover-open')||!button)return;
    const target=button.getBoundingClientRect(),writing=button.closest('form')?.querySelector('textarea')?.getBoundingClientRect(),anchor=writing?.top??target.top;
    panel.style.maxHeight=Math.max(120,Math.min(480,innerHeight*.64,anchor-16))+'px';
    const box=panel.getBoundingClientRect();
    panel.style.left=Math.max(8,Math.min(target.left,innerWidth-box.width-8))+'px';
    panel.style.top=Math.max(8,Math.min(anchor-box.height-6,innerHeight-box.height-8))+'px';
  }
  function toggle(event:ToggleEvent){
    expanded=event.newState==='open';
    if(expanded){position();(invalidTarget||panel?.querySelector<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled)'))?.focus({preventScroll:true});invalidTarget=null;}
  }
  function revealInvalid(event:Event){
    if(!(event.target instanceof HTMLElement)||!panel)return;
    invalidTarget=event.target;
    if(!panel.matches(':popover-open'))panel.showPopover();
    position();invalidTarget.focus({preventScroll:true});
  }
  function keyboard(event:KeyboardEvent){if(event.key==='Escape'&&panel?.matches(':popover-open')){event.preventDefault();close(true);}}
  export function close(returnFocus=false){if(panel?.matches(':popover-open'))panel.hidePopover();if(returnFocus)button?.focus({preventScroll:true});}
  onMount(()=>{const observer=new ResizeObserver(position);if(panel)observer.observe(panel);return()=>observer.disconnect();});
</script>

<svelte:window onresize={position} onscroll={position} onkeydown={keyboard} />
<button bind:this={button} id={id+'-trigger'} type="button" class="composer-menu-trigger" data-composer-menu={menu} popovertarget={id} aria-label={label} {title} aria-controls={id} aria-expanded={expanded}>{@render trigger()}</button>
<div bind:this={panel} {id} popover="auto" role="dialog" aria-label={label} class="composer-popover" ontoggle={toggle} oninvalidcapture={revealInvalid}>{@render children()}</div>

<style>
  .composer-menu-trigger{display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px;width:44px;height:44px;min-width:44px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--muted-foreground);cursor:pointer;}
  .composer-menu-trigger:hover,.composer-menu-trigger[aria-expanded=true]{background:var(--muted);color:var(--foreground);}.composer-menu-trigger:focus-visible{outline:2px solid var(--ring);outline-offset:2px;}
  .composer-menu-trigger :global(svg){width:17px;height:17px;}
  .composer-popover{position:fixed;inset:auto;margin:0;width:min(360px,calc(100vw - 16px));max-height:min(64dvh,480px);overflow:auto;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--background);color:var(--foreground);font-size:13px;line-height:1.5;}
  .composer-popover :global(h3){font-size:14px;font-weight:600;margin:0 0 12px;}.composer-popover :global(label){font-size:12px;}.composer-popover :global(select){width:100%;min-height:44px;min-width:0;max-width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;background:var(--background);color:var(--foreground);font:inherit;}
  .composer-popover :global(input[type=checkbox]){flex-shrink:0;}.composer-popover :global(input:focus-visible),.composer-popover :global(select:focus-visible){outline:2px solid var(--ring);outline-offset:2px;}.composer-popover :global(.quiet){font-size:11px;line-height:1.5;}
</style>
