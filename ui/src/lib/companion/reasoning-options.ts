/** The catalogue owns the available choices. Default never adds an override. */
export const reasoningLabels = {
  off: ['Désactivée', 'Off'], on: ['Activée', 'On'], minimal: ['Minimale', 'Minimal'], low: ['Faible', 'Low'],
  medium: ['Moyenne', 'Medium'], high: ['Élevée', 'High'], xhigh: ['Très élevée', 'Extra high'], max: ['Maximale', 'Maximum']
} as const;
export type ReasoningOption = keyof typeof reasoningLabels;
export type ReasoningChoice = 'default' | ReasoningOption;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const known = (value: unknown): value is ReasoningOption => typeof value === 'string' && Object.hasOwn(reasoningLabels, value);
export function reasoningOptions(value: unknown): { options: ReasoningOption[]; defaultOption: ReasoningOption | null; unrecognized: boolean } {
  if (!record(value) || !Array.isArray(value.allowedOptions)) return { options: [], defaultOption: null, unrecognized: false };
  const options = [...new Set(value.allowedOptions.filter(known))];
  return { options, defaultOption: known(value.default) && options.includes(value.default) ? value.default : null, unrecognized: value.allowedOptions.some(item => !known(item)) };
}
export function resolveReasoning(capability: unknown, value: unknown): ReasoningChoice {
  return known(value) && reasoningOptions(capability).options.includes(value) ? value : 'default';
}
export function reasoningChoiceKey(provider: unknown, model: string): string {
  return JSON.stringify([typeof provider === 'string' ? provider : 'unknown', model]);
}
export function restoreReasoningChoices(value: unknown): Record<string, ReasoningChoice> {
  if (!record(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 1000).filter(([key, choice]) => key.length <= 2048 && (choice === 'default' || known(choice)))) as Record<string, ReasoningChoice>;
}
