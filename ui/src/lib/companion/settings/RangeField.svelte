<script lang="ts">
  import { preferences, tr } from '../preferences.svelte';
  import './controls.css';
  let { id,label,value=$bindable(1),min,max,step=1,numberStep=step,disabled=false,scale='linear',unit='',onValueChange }: { id:string;label:string;value?:number;min:number;max:number;step?:number;numberStep?:number|'any';disabled?:boolean;scale?:'linear'|'log';unit?:string;onValueChange?:(value:number)=>void }=$props();
  const clamp=(number:number)=>Math.max(min,Math.min(max,Number.isFinite(number)?number:min));
  const position=$derived(scale==='log'?(Math.log(clamp(value))-Math.log(min))/(Math.log(max)-Math.log(min))*1000:clamp(value));
  const number=(number:number)=>new Intl.NumberFormat(preferences.language,{maximumFractionDigits:6}).format(number);
  const valueText=$derived(number(Number.isFinite(value)?value:min)+(unit?' '+unit:''));
  function commit(next:number){if(!Number.isFinite(next))return;value=next;onValueChange?.(next);}
  function move(event:Event){const input=event.currentTarget as HTMLInputElement;const raw=scale==='log'?Math.exp(Math.log(min)+Number(input.value)/1000*(Math.log(max)-Math.log(min))):Number(input.value);const precision=(String(step).split('.')[1]||'').length;const rounded=scale==='log'?Math.round(raw):Number((min+Math.round((raw-min)/step)*step).toFixed(precision));commit(clamp(rounded));}
</script>

<div class="range-field" data-scale={scale}>
  <div class="range-field-title"><label for={id}>{label}</label><input {id} type="number" value={value} {min} {max} step={numberStep} {disabled} required oninput={event=>commit(event.currentTarget.valueAsNumber)} aria-describedby={id+'-hint'} /></div>
  <input id={id+'-range'} type="range" min={scale==='log'?0:min} max={scale==='log'?1000:max} step={scale==='log'?1:step} value={position} {disabled} oninput={move} aria-label={tr('Curseur pour ','Slider for ')+label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Number.isFinite(value)?value:min} aria-valuetext={valueText} aria-describedby={id+'-hint'} />
  <div class="range-field-scale" aria-hidden="true"><span>{number(min)}{unit?' '+unit:''}</span><span>{number(max)}{unit?' '+unit:''}</span></div>
  <p class="range-field-hint" id={id+'-hint'}>{scale==='log'?tr('Échelle logarithmique : réglage fin pour les petites valeurs. La saisie numérique garde la valeur exacte.','Logarithmic scale: fine control at smaller values. Numeric entry preserves the exact value.'):tr('Déplace le curseur ou saisis une valeur précise.','Move the slider or enter a precise value.')}</p>
</div>
