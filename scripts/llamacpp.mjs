import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { prepareLlamaLaunch } from '../lib/llamacpp-launch.mjs';

const { values } = parseArgs({ options: {
  server: { type: 'string' }, model: { type: 'string' }, port: { type: 'string', default: '1236' },
  context: { type: 'string', default: '4096' }, 'gpu-layers': { type: 'string', default: '0' }, start: { type: 'boolean', default: false },
} });
const plan = await prepareLlamaLaunch({ server: values.server, model: values.model, port: Number(values.port), context: Number(values.context), gpuLayers: Number(values['gpu-layers']) });
if (!values.start) {
  console.log(JSON.stringify({ ...plan, started: false, note: 'Préparation seulement. --start lance le serveur ; GPU désactivé par défaut. L’en-tête GGUF ne qualifie pas son architecture.' }, null, 2));
} else {
  // Reject an occupied endpoint; never replace or stop the process using it.
  await new Promise((resolve, reject) => {
    const probe = net.createServer(); probe.once('error', reject);
    probe.listen(plan.port, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve()));
  });
  // Ambient llama options must not inject downloads, listeners or GPU settings.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^LLAMA_/i.test(key)));
  const child = spawn(plan.executable, plan.args, { shell: false, windowsHide: true, stdio: 'inherit', env });
  child.once('error', () => { console.error('Impossible de lancer llama-server. Vérifie sa distribution et ses bibliothèques.'); process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code ?? 1; });
}
