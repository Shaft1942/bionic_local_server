import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrototype } from '../lib/llama-ui-prototype.mjs';

const args = process.argv.slice(2), values = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--port', '--root', '--llama-url', '--model-delay-ms', '--image-delay-ms', '--image-outcome', '--certificate-transport', '--proof-port'].includes(args[i]) || !args[i + 1]) throw new Error('Arguments: --port N --root ABSOLUTE_DIRECTORY --llama-url LOCAL_ORIGIN --model-delay-ms N --image-delay-ms N --image-outcome success|unknown --certificate-transport true|false --proof-port N');
  values[args[i]] = args[i + 1];
}
const root = values['--root'] || fileURLToPath(new URL('../../fixture-instance/', import.meta.url));
if (values['--certificate-transport'] && !['true', 'false'].includes(values['--certificate-transport'])) throw new Error('--certificate-transport requires true or false.');
const fixture = await createPrototype({ root: path.resolve(root), port: Number(values['--port'] || 8878), llamaUrl: values['--llama-url'], modelDelayMs: Number(values['--model-delay-ms'] || 3000), imageDelayMs: Number(values['--image-delay-ms'] || 3500), imageOutcome: values['--image-outcome'] || 'success', certificateTransport: values['--certificate-transport'] === 'true', proofPort: Number(values['--proof-port'] || 0) });
console.log(JSON.stringify({ url: fixture.baseUrl, prototype: true, syntheticProjects: true, syntheticComfyUI: true, inference: values['--llama-url'] ? 'explicit-local-llama-server' : 'synthetic', code: fixture.code }));
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, async () => { if (stopping) return; stopping = true; await fixture.app.close(); });
