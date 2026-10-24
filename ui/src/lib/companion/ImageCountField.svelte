<script lang="ts">
  import { tr } from './preferences.svelte';
  let { id, value = $bindable(1), disabled = false, onValueChange }: { id: string; value?: number; disabled?: boolean; onValueChange?: (value: number) => void } = $props();
  let numberText = $state<string | null>(null);
  const valueText = $derived(tr(value === 1 ? '1 image' : `${value} images`, value === 1 ? '1 image' : `${value} images`));
  $effect(() => { value; numberText = null; });
  function commit(next: number) {
    if (!Number.isInteger(next) || next < 1 || next > 5) return;
    value = next; onValueChange?.(next);
  }
  function type(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    numberText = input.value;
    if (input.validity.valid) commit(input.valueAsNumber);
  }
</script>

<div class="image-count-field">
  <div class="image-count-title"><label for={id}>{tr('Nombre d’images', 'Image count')}</label><output for={id+' '+id+'-range'}>{valueText}</output></div>
  <div class="image-count-inputs">
    <input id={id+'-range'} type="range" min="1" max="5" step="1" {value} {disabled} aria-label={tr('Curseur pour Nombre d’images', 'Slider for Image count')} aria-valuetext={valueText} aria-describedby={id+'-hint'} oninput={event => { numberText = null; commit(event.currentTarget.valueAsNumber); }} />
    <input {id} type="number" min="1" max="5" step="1" value={numberText ?? value} {disabled} required aria-label={tr('Nombre d’images', 'Image count')} aria-describedby={id+'-hint'} oninput={type} />
  </div>
  <p id={id+'-hint'}>{tr('1 à 5 images par demande.', '1 to 5 images per request.')}</p>
</div>

<style>
  .image-count-field{display:flex;flex-direction:column;gap:6px;min-width:0;color:var(--foreground);font-size:12px;}
  .image-count-title,.image-count-inputs{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;}
  .image-count-title label{font-weight:500;}
  output{color:var(--muted-foreground);white-space:nowrap;font-variant-numeric:tabular-nums;}
  .image-count-inputs input[type=range]{appearance:auto;-webkit-appearance:auto;accent-color:var(--primary);border:0;border-radius:0;box-shadow:none;background:transparent;min-width:0;width:100%;height:36px;padding:0;margin:0;cursor:pointer;}
  .image-count-inputs input[type=number]{flex:0 0 64px;width:64px;min-width:0;padding:7px 8px;border:1px solid var(--border);border-radius:6px;background:var(--background);color:inherit;font:inherit;font-variant-numeric:tabular-nums;}
  input:focus-visible{outline:2px solid var(--ring);outline-offset:3px;}
  input:disabled{opacity:.5;cursor:default;}
  p{font-size:11px;line-height:1.5;color:var(--muted-foreground);margin:0;}
  @media(max-width:759px){.image-count-inputs input[type=range],.image-count-inputs input[type=number]{min-height:44px;}.image-count-inputs input[type=number]{font-size:16px;}}
</style>
