import { inferenceCapabilities } from './inference-settings.mjs';
import { AUTO_MAX_OUTPUT_TOKENS } from './model-preferences.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const publicId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1024
  && !/[\x00-\x1f\x7f]/.test(value) && !/^(?:[\\/]|[a-z]:[\\/]|[a-z][a-z0-9+.-]*:\/\/)/i.test(value);
const support = (value, reason = 'model-capability-unknown') => ({
  state: value === true ? 'supported' : value === false ? 'unsupported' : 'unknown',
  reasonCode: value === true ? null : value === false ? 'not-supported' : reason,
});
const unavailableParameter = () => ({ support: { state: 'unsupported', reasonCode: 'parameter-not-forwarded' } });
const effortChoices = new Set(['off', 'on', 'low', 'medium', 'high', 'xhigh']);

function describeModel(model, provider) {
  const known = provider === 'bionic' || provider === 'llamacpp';
  const reasoningOptions = provider === 'bionic' && Array.isArray(model.reasoning?.allowedOptions)
    ? [...new Set(model.reasoning.allowedOptions.filter(value => effortChoices.has(value)))] : [];
  const tools = support(known ? model.tools : null);
  const vision = support(provider === 'llamacpp' ? false : provider === 'bionic' ? model.vision : null);
  const reasoningEffort = provider === 'llamacpp' ? support(false)
    : reasoningOptions.length ? support(true) : support(null);
  const maxOutputTokens = { support: support(known), min: 1, max: 5_000_000, automatic: AUTO_MAX_OUTPUT_TOKENS, contextBound: true };
  return {
    id: model.id,
    loaded: typeof model.loaded === 'boolean' ? model.loaded : null,
    contextLength: positive(model.contextLength) ? model.contextLength : null,
    support: { tools, vision, reasoningEffort },
    parameters: {
      maxOutputTokens,
      reasoningEffort: { support: reasoningEffort, options: reasoningOptions },
      // createModelTransport.request forwards none of these sampling controls.
      temperature: unavailableParameter(), topP: unavailableParameter(), topK: unavailableParameter(),
      seed: unavailableParameter(), repeatPenalty: unavailableParameter(),
    },
  };
}

/** Pure, allowlisted projection. It grants no permission and invokes no service. */
export function describeCompanionCapabilities({ inference, models, catalogueReason = null, imageProvider, imageSettings, secrets = [] } = {}) {
  const tokens = Array.isArray(secrets) ? secrets.filter(value => typeof value === 'string' && value.length) : [];
  const containsSecret = value => typeof value === 'string' && tokens.some(token => value.includes(token));
  const provider = ['bionic', 'llamacpp'].includes(inference?.provider) ? inference.provider : 'unknown';
  const knownProvider = provider !== 'unknown';
  const intrinsic = knownProvider ? inferenceCapabilities(provider) : null;
  // Providers may echo credentials in a public id; reject that catalogue rather
  // than returning a redacted id that a client could accidentally send back.
  const validCatalogue = Array.isArray(models) && models.length <= 4096
    && models.every(model => record(model) && publicId(model.id) && !containsSecret(model.id) && typeof model.type === 'string')
    && new Set(models.map(model => model.id)).size === models.length;
  const reasonCode = ['catalogue-unavailable', 'inference-changed'].includes(catalogueReason) ? catalogueReason
    : !validCatalogue ? 'catalogue-invalid' : !knownProvider ? 'provider-unknown' : null;
  const caps = record(imageProvider?.capabilities) ? imageProvider.capabilities : {};
  const providerId = /^[a-z][a-z0-9-]{0,63}$/.test(imageProvider?.identity?.id || '') && !containsSecret(imageProvider.identity.id) ? imageProvider.identity.id : 'unknown';
  const enabled = typeof imageSettings?.enabled === 'boolean' ? imageSettings.enabled : null;
  const imageSupport = Object.fromEntries(['singleImage', 'batch', 'series', 'history', 'retry', 'cancelQueued', 'recoveryByOwner', 'localImageBytes', 'lifecycle', 'workflowSelection']
    .map(key => [key, support(caps[key], 'image-capability-unknown')]));
  return {
    schemaVersion: 1,
    inference: {
      provider,
      revision: typeof inference?.revision === 'string' && /^[\w-]{1,100}$/.test(inference.revision) ? inference.revision : null,
      support: { chat: support(knownProvider ? true : null, 'provider-unknown'), modelManagement: support(intrinsic?.modelManagement, 'provider-unknown') },
      // "observed" confirms a catalogue read, never generation readiness or GPU state.
      catalogue: { state: reasonCode ? 'unknown' : 'observed', reasonCode },
      models: reasonCode ? [] : models.filter(model => model.type === 'llm').map(model => describeModel(model, provider)),
    },
    images: {
      providerId, support: imageSupport, enabled,
      reachability: { state: 'unknown', reasonCode: 'not-probed' },
      availability: enabled === false ? { state: 'blocked', reasonCode: 'image-disabled' }
        : { state: 'unknown', reasonCode: enabled === null ? 'image-settings-unknown' : 'not-probed' },
      // sendDirectImage/sendChat enforce 1..5; a provider without submitBatch only supports one.
      parameters: { imageCount: { support: imageSupport.singleImage, min: 1, max: caps.batch === true ? 5 : caps.batch === false ? 1 : null } },
    },
    permissions: {
      fileAccess: { state: 'request-scoped', reasonCode: 'file-profile-required' },
      webAccess: { state: 'request-scoped', reasonCode: 'web-access-required' },
      scriptAccess: { state: 'request-scoped', reasonCode: 'exact-code-approval-required' },
      imageAccess: { state: 'request-scoped', reasonCode: 'image-access-required' },
    },
  };
}
