import path from 'node:path';
import { open, stat } from 'node:fs/promises';

/** Prepare an explicit local launch; never copies, converts or downloads weights. */
export async function prepareLlamaLaunch({ server, model, port = 1236, context = 4096, gpuLayers = 0 } = {}) {
  if (typeof server !== 'string' || !path.isAbsolute(server) || typeof model !== 'string' || !path.isAbsolute(model) || !/\.gguf$/i.test(model)) throw new Error('Indique les chemins absolus du serveur et du fichier GGUF.');
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || [1234, 1235, 8188, 8769, 8770].includes(port)) throw new Error('Choisis un port distinct des ports usuels Bionic, ComfyUI et compagnon, entre 1024 et 65535.');
  if (!Number.isSafeInteger(context) || context < 512 || context > 131072 || !Number.isSafeInteger(gpuLayers) || gpuLayers < 0 || gpuLayers > 1000) throw new Error('Contexte ou nombre de couches GPU invalide.');
  if (!(await stat(server)).isFile() || !(await stat(model)).isFile()) throw new Error('Serveur et modèle doivent être des fichiers existants.');
  const handle = await open(model, 'r');
  try {
    const magic = Buffer.alloc(4);
    const { bytesRead } = await handle.read(magic, 0, 4, 0);
    if (bytesRead !== 4 || magic.toString('ascii') !== 'GGUF') throw new Error('En-tête GGUF absent. Aucune conversion automatique.');
  } finally { await handle.close(); }
  return {
    executable: server,
    args: ['--model', model, '--alias', 'companion-llama', '--host', '127.0.0.1', '--port', String(port), '--ctx-size', String(context), '--parallel', '1', '--gpu-layers', String(gpuLayers), '--jinja'],
    gpuLayers, port,
  };
}
