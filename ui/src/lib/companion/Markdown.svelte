<script lang="ts">
  import { mount, unmount } from 'svelte';
  import CopyMessage from './CopyMessage.svelte';
  import { unified } from 'unified';
  import remarkParse from 'remark-parse';
  import remarkGfm from 'remark-gfm';
  import remarkRehype from 'remark-rehype';
  import rehypeStringify from 'rehype-stringify';
  import DOMPurify from 'dompurify';
  import hljs from 'highlight.js/lib/common';
  import 'highlight.js/styles/github.css';
  let { content = '' }: { content?: string } = $props();
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify);
  const html = $derived.by(() => {
    const safe = DOMPurify.sanitize(String(processor.processSync(content)), {
      ALLOWED_TAGS: ['p','br','strong','em','del','blockquote','ul','ol','li','pre','code','h1','h2','h3','h4','h5','h6','a','table','thead','tbody','tr','th','td','hr'],
      ALLOWED_ATTR: ['href','title','class'], ALLOW_DATA_ATTR: false
    });
    const container = document.createElement('div'); container.innerHTML = safe;
    for (const link of container.querySelectorAll('a')) {
      const href = link.getAttribute('href') || '';
      if (!/^(https?:|mailto:|\/api\/file\/download\?)/i.test(href)) link.removeAttribute('href');
      else { link.setAttribute('target','_blank'); link.setAttribute('rel','noopener noreferrer'); }
    }
    for (const code of container.querySelectorAll('pre code')) {
      const language = code.className.match(/language-([\w-]+)/)?.[1];
      if (language && hljs.getLanguage(language)) code.innerHTML = hljs.highlight(code.textContent || '', { language }).value;
    }
    return container.innerHTML;
  });

  // Add controls after sanitization. The Markdown can never supply component props or events.
  function codeControls(node: HTMLDivElement, _html: string) {
    let cleanups: (() => void)[] = [];
    function render() {
      for (const cleanup of cleanups) cleanup();
      cleanups = [];
      for (const pre of node.querySelectorAll('pre')) {
        const code = pre.querySelector('code');
        if (!code) continue;
        const host = document.createElement('div');
        host.className = 'code-copy-toolbar';
        pre.before(host);
        const component = mount(CopyMessage, { target: host, props: { text: code.textContent || '', role: 'code' } });
        cleanups.push(() => { void unmount(component); host.remove(); });
      }
    }
    render();
    return { update: render, destroy: () => { for (const cleanup of cleanups) cleanup(); } };
  }
</script>

<div class="companion-markdown" use:codeControls={html}>{@html html}</div>

<style>
  .companion-markdown :global(.code-copy-toolbar) { margin-block-start: .75rem; min-width: 0; }
  .companion-markdown :global(.code-copy-toolbar + pre) { margin-block-start: .25rem; }
</style>
