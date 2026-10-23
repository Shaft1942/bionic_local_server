<script lang="ts">
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
</script>

<div class="companion-markdown">{@html html}</div>
