<script lang="ts">
  import { tr, preferences } from './preferences.svelte';
  import { reasoningOptions, reasoningLabels, type ReasoningChoice } from './reasoning-options';
  let { capability, value = 'default', disabled = false, hasModel = true, onChange }: {
    capability: unknown; value?: ReasoningChoice; disabled?: boolean; hasModel?: boolean; onChange: (choice: ReasoningChoice) => void;
  } = $props();
  const catalogue = $derived(reasoningOptions(capability));
  const label = (option: keyof typeof reasoningLabels) => reasoningLabels[option][preferences.language === 'en' ? 1 : 0];
  const defaultLabel = $derived(catalogue.defaultOption ? tr('Par défaut', 'Default') + ' · ' + label(catalogue.defaultOption) : tr('Par défaut du modèle', 'Model default'));
  const help=$derived(!hasModel ? tr('Choisis un modèle pour connaître ses options.', 'Choose a model to see its options.') : !catalogue.options.length ? tr('Le modèle n’annonce aucun choix de réflexion reconnu.', 'The model reports no recognized reasoning choices.') : catalogue.unrecognized ? tr('Certaines options annoncées ne sont pas reconnues.', 'Some reported options are unrecognized.') : tr('Pour le prochain message.', 'For the next message.'));
</script>

<div class="reasoning-picker">
  <label class="control-label" for="chat-reasoning">{tr('Réflexion', 'Reasoning')}</label>
  <select id="chat-reasoning" {value} disabled={disabled || !hasModel || !catalogue.options.length} aria-describedby="chat-reasoning-help" title={tr('Réflexion','Reasoning')+': '+(value==='default'?defaultLabel:label(value))+' — '+help} onchange={event => onChange(event.currentTarget.value as ReasoningChoice)}>
    <option value="default">{defaultLabel}</option>
    {#each catalogue.options as option}<option value={option}>{label(option)}</option>{/each}
  </select>
  <p id="chat-reasoning-help" class:control-label={!!hasModel&&!!catalogue.options.length&&!catalogue.unrecognized}>{help}</p>
</div>

<style>
  .reasoning-picker{display:flex;flex-direction:column;min-width:0;position:relative;}
  .control-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}
  select{width:100%;max-width:100%;min-width:0;min-height:44px;background:transparent;color:var(--muted-foreground);border:0;border-radius:6px;padding:7px 20px 7px 6px;font-size:12px;text-overflow:ellipsis;}
  select:disabled{opacity:.65;}select:focus-visible{outline:2px solid var(--ring);outline-offset:2px;}
  p{font-size:11px;line-height:1.45;color:var(--muted-foreground);margin:0 6px 4px;overflow-wrap:anywhere;}
</style>
