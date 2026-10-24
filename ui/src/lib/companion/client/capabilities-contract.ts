/** Read-only projection of GET /api/companion-capabilities, schema 1.
 * The server owns support and permissions. Unknown enum values never grant support.
 */
export type CapabilityState = 'supported' | 'unsupported' | 'unknown' | 'observed' | 'blocked' | 'request-scoped';
export type Capability = { state: CapabilityState; reasonCode: string | null };
export type ModelCapabilities = {
  id: string; loaded: boolean | null; contextLength: number | null;
  support: Record<'tools' | 'vision' | 'reasoningEffort', Capability>;
  parameters: Record<'maxOutputTokens' | 'reasoningEffort' | 'temperature' | 'topP' | 'topK' | 'seed' | 'repeatPenalty', Capability>;
};
export type CompanionCapabilities = {
  schemaVersion: 1;
  inference: { provider: 'bionic' | 'llamacpp' | 'unknown'; support: Record<'chat' | 'modelManagement', Capability>; catalogue: Capability; models: ModelCapabilities[] };
  images: { providerId: 'comfyui' | 'unknown'; enabled: boolean | null; support: Record<'singleImage' | 'batch' | 'series' | 'history' | 'retry' | 'cancelQueued', Capability>; reachability: Capability; availability: Capability };
  permissions: Record<'fileAccess' | 'webAccess' | 'scriptAccess' | 'imageAccess', Capability>;
};
function invalid(): never { throw new Error('Invalid companion capabilities'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function capability(value: unknown, allowed: readonly CapabilityState[] = ['supported', 'unsupported', 'unknown']): Capability {
  const item = record(value);
  if (typeof item.state !== 'string' || !(item.reasonCode === null || typeof item.reasonCode === 'string' && /^[a-z][a-z0-9-]{0,99}$/.test(item.reasonCode))) return invalid();
  const known = allowed.includes(item.state as CapabilityState);
  return { state: known ? item.state as CapabilityState : 'unknown', reasonCode: known ? item.reasonCode as string | null : 'unrecognized-state' };
}
function group<K extends string>(value: unknown, keys: readonly K[], allowed?: readonly CapabilityState[]): Record<K, Capability> {
  const item = record(value);
  return Object.fromEntries(keys.map(key => [key, capability(item[key], allowed)])) as Record<K, Capability>;
}
export function parseCompanionCapabilities(value: unknown): CompanionCapabilities {
  const data = record(value);
  if (data.schemaVersion !== 1) return invalid();
  const inference = record(data.inference), images = record(data.images);
  if (!Array.isArray(inference.models) || inference.models.length > 4096 || typeof inference.provider !== 'string' || typeof images.providerId !== 'string') return invalid();
  if (!(images.enabled === null || typeof images.enabled === 'boolean')) return invalid();
  const models = inference.models.map((value): ModelCapabilities => {
    const model = record(value), parameters = record(model.parameters);
    if (typeof model.id !== 'string' || !model.id.trim() || model.id.length > 1024 || /[\x00-\x1f\x7f]/.test(model.id)) return invalid();
    if (!(model.loaded === null || typeof model.loaded === 'boolean') || !(model.contextLength === null || Number.isSafeInteger(model.contextLength) && Number(model.contextLength) > 0)) return invalid();
    const parameterKeys = ['maxOutputTokens', 'reasoningEffort', 'temperature', 'topP', 'topK', 'seed', 'repeatPenalty'] as const;
    return { id: model.id, loaded: model.loaded as boolean | null, contextLength: model.contextLength as number | null,
      support: group(model.support, ['tools', 'vision', 'reasoningEffort']),
      parameters: Object.fromEntries(parameterKeys.map(key => [key, capability(record(parameters[key]).support)])) as ModelCapabilities['parameters'] };
  });
  if (new Set(models.map(model => model.id)).size !== models.length) return invalid();
  return { schemaVersion: 1,
    inference: { provider: inference.provider === 'bionic' || inference.provider === 'llamacpp' ? inference.provider : 'unknown', support: group(inference.support, ['chat', 'modelManagement']), catalogue: capability(inference.catalogue, ['observed', 'unknown']), models },
    images: { providerId: images.providerId === 'comfyui' ? 'comfyui' : 'unknown', enabled: images.enabled as boolean | null,
      support: group(images.support, ['singleImage', 'batch', 'series', 'history', 'retry', 'cancelQueued']), reachability: capability(images.reachability, ['unknown']), availability: capability(images.availability, ['blocked', 'unknown']) },
    permissions: group(data.permissions, ['fileAccess', 'webAccess', 'scriptAccess', 'imageAccess'], ['request-scoped', 'unknown']) };
}
