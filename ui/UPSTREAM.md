# llama-ui companion adaptation

Upstream: https://github.com/ggml-org/llama.cpp/tree/0ae0e1976670fac25f4e0ed864df30021accc764/tools/ui

Pinned commit: `0ae0e1976670fac25f4e0ed864df30021accc764` (24 October 2026 study).
The dependency closure actually used by the prototype is retained from upstream src: global theme, logo, Button, Textarea, Card, utility types/classes and the user-message bubble. LICENSE.llama.cpp contains the upstream MIT license; retain its notice when distributing.

The companion entry is `src/companion.ts`, built with Vite/Svelte 5 instead of the upstream SvelteKit routes. It directly reuses llama-ui's Button, Textarea, Logo, and global Tailwind theme. `src/lib/companion/` adapts the sidebar, composer and message presentation to the companion's server-owned projects, conversations, file grants and ComfyUI jobs. Its user bubble follows upstream `ChatMessageUserBubble.svelte`; upstream stores and browser execution loops are intentionally not imported.

Only navigation, text drafts and an outstanding request reference are stored in the prototype's localStorage namespace, partitioned by server instance ID. Canonical chats and job state remain on the companion server. A failed network request is recovered by GET lookup, never automatic POST retry. Markdown is rendered passively; raw HTML, remote images, iframe/script and execution previews are omitted.

Build: `npm ci --prefix ui --ignore-scripts`, then `node scripts/build-llama-ui.mjs` from the application root. The emitted assets are in `public/llama-ui/`, with an absolute `/llama-ui/` asset base; the server may expose the entry at `/prototype/` or opt in at `/`.

The dependency lock describes the compiled companion entry. The complete upstream app, model manager, MCP client, browser tools and IndexedDB stores are not shipped; this prototype does not claim that all upstream pages are wired. No PWA service worker is installed by this entry. UserBubble adapts the upstream bubble to passive companion text. Card imports constants directly; Logo omits the inline style prop to respect the CSP.
