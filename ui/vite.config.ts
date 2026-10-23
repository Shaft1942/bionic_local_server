import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/llama-ui/',
  plugins: [svelte({ configFile: false, preprocess: vitePreprocess({ script: true }) }), tailwindcss()],
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
  publicDir: false,
  build: { outDir: '../public/llama-ui', emptyOutDir: true, cssCodeSplit: true, sourcemap: false }
});
