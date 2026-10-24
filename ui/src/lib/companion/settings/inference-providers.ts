// Display capabilities for implemented connectors. Adding a provider also requires
// its backend adapter; an entry here does not enable an unsupported connector.
export const inferenceProviders = [
  { id: 'bionic', name: 'Bionic / LM Studio', urlInputId: 'inference-bionic-url', library: 'catalogue', launch: 'local-service' },
  { id: 'llamacpp', name: 'llama-server', urlInputId: 'inference-llama-url', library: 'gguf', launch: 'owned-process' }
] as const;
