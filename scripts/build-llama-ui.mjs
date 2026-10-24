import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const application = fileURLToPath(new URL('../', import.meta.url));
const ui = path.join(application, 'ui');
const { build } = await import(new URL('../ui/node_modules/vite/dist/node/index.js', import.meta.url));
const result = await build({ root: ui, configFile: path.join(ui, 'vite.config.ts') });
const packages = new Set(['tailwindcss', 'tw-animate-css']);
for (const output of Array.isArray(result) ? result : [result]) {
  for (const chunk of output.output || []) {
    if (chunk.type !== 'chunk') continue;
    for (const [id, module] of Object.entries(chunk.modules)) {
      if (!module.renderedLength) continue;
      const name = id.replaceAll('\\', '/').match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1];
      if (name) packages.add(name);
    }
  }
}
let notices = '# Third-party notices for the compiled companion llama-ui frontend\n\n';
notices += 'Generated from modules rendered by the Vite production build, plus shipped CSS packages.\n';
notices += 'llama.cpp UI source provenance and MIT license are provided separately in UPSTREAM.md and LICENSE.llama.cpp.\n\n';
for (const name of [...packages].sort()) {
  const directory = path.join(ui, 'node_modules', ...name.split('/'));
  const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  notices += `\n${'='.repeat(72)}\n${name} ${metadata.version}\nLicense: ${metadata.license || 'see license text'}\n`;
  const licenses = (await readdir(directory)).filter(filename => /^(?:licen[cs]e|copying|notice)(?:\.|$)/i.test(filename));
  if (!licenses.length) throw new Error(`Missing distribution license text for ${name}; review before distribution.`);
  for (const filename of licenses.sort()) notices += `\n--- ${filename} ---\n${await readFile(path.join(directory, filename), 'utf8')}\n`;
}
await writeFile(path.join(ui, 'THIRD_PARTY_NOTICES.txt'), notices);
const destination = path.join(application, 'public', 'llama-ui');
await mkdir(destination, { recursive: true });
// The HTML template can be checked out with CRLF on Windows. Keep the emitted
// source artifact deterministic and avoid doubled CRs from HTML transforms.
const index = path.join(destination, 'index.html');
await writeFile(index, (await readFile(index, 'utf8')).replace(/\r\n?/g, '\n'));
await writeFile(path.join(destination, 'LICENSE.llama.cpp'), await readFile(path.join(ui, 'LICENSE.llama.cpp')));
await writeFile(path.join(destination, 'UPSTREAM.md'), await readFile(path.join(ui, 'UPSTREAM.md')));
await writeFile(path.join(destination, 'THIRD_PARTY_NOTICES.txt'), notices);
console.log('llama-ui companion build: public/llama-ui');
