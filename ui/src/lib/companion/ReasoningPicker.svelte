<script lang="ts">
  import { tr, preferences } from './preferences.svelte';
  import { reasoningOptions, reasoningLabels, type ReasoningChoice } from './reasoning-options';
  let { capability, value = 'default', disabled = false, hasModel = true, onChange }: {
    capability: unknown; value?: ReasoningChoice; disabled?: boolean; hasModel?: boolean; onChange: (choice: ReasoningChoice) => void;
  } = $props();
  const catalogue = $derived(reasoningOptions(capability));
  const label = (option: keyof typeof reasoningLabels) => reasoningLabels[option][preferences.language === 'en' ? 1 : 0];
  const defaultLabel = $derived(catalogue.defaultOption ? tr('Par défaut', 'Default') + ' · ' + label(catalogue.defaultOption) : tr('Par défaut du modèle', 'Model default'));
</script>

<div class="reasoning-picker">
  <label for="chat-reasoning">{tr('Réflexion', 'Reasoning')}</label>
  <select id="chat-reasoning" {value} disabled={disabled || !hasModel || !catalogue.options.length} aria-describedby="chat-reasoning-help" onchange={event => onChange(event.currentTarget.value as ReasoningChoice)}>
    <option value="default">{defaultLabel}</option>
    {#each catalogue.options as option}<option value={option}>{label(option)}</option>{/each}
  </select>
  <p id="chat-reasoning-help">{!hasModel ? tr('Choisis un modèle pour connaître ses options.', 'Choose a model to see its options.') : !catalogue.options.length ? tr('Le modèle n’annonce aucun choix de réflexion reconnu.', 'The model reports no recognized reasoning choices.') : catalogue.unrecognized ? tr('Certaines options annoncées ne sont pas reconnues.', 'Some reported options are unrecognized.') : tr('Pour le prochain message.', 'For the next message.')}</p>
</div>

<style>
  .reasoning-picker{display:flex;flex-direction:column;gap:4px;min-width:0;}
  label{font-size:11px;color:var(--muted-foreground);line-height:1.5;}
  select{width:100%;max-width:100%;min-width:0;min-height:44px;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:7px;padding:8px 25px 8px 10px;font-size:12px;}
  select:disabled{opacity:.65;}select:focus-visible{outline:2px solid var(--ring);outline-offset:2px;}
  p{font-size:11px;line-height:1.45;color:var(--muted-foreground);margin:0;overflow-wrap:anywhere;}
</style>
