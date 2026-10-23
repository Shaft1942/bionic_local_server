'use strict';

// A deliberately small, passive Markdown renderer. Source text is never HTML.
// Nesting and node budgets bound malformed/streamed input; the remainder stays text.
(() => {
  const MAX_DEPTH = 12, MAX_INLINE_DEPTH = 8, MAX_BLOCKS = 10000, MAX_INLINE_TOKENS = 20000;
  const element = (document, tag, className, text) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const textOf = lines => lines.map(line => line.raw).join('');
  function linesOf(text) {
    return [...text.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)].filter(match => match[0]).map(match => {
      const raw = match[0], ending = /(?:\r\n|\n|\r)$/.exec(raw)?.[0] || '';
      return { raw, text: ending ? raw.slice(0, -ending.length) : raw, ending };
    });
  }
  const stripped = (line, count) => ({ ...line, text: line.text.slice(count), raw: line.text.slice(count) + line.ending });
  const fenceOf = line => {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    return match && !(match[1][0] === '`' && match[2].includes('`')) ? { marker: match[1], info: match[2].trim() } : null;
  };
  const quoteOf = line => /^ {0,3}>[ \t]?/.exec(line);
  const headingOf = line => /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/.exec(line);
  const separator = line => /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
  const listOf = line => {
    const match = /^( *)([-+*]|\d{1,9}[.)])([ \t]+)(.*)$/.exec(line);
    return match ? { indent: match[1].length, ordered: /^\d/.test(match[2]), start: parseInt(match[2], 10), prefix: match[0].length - match[4].length } : null;
  };
  function safeLink(target) {
    if (!target || /[\u0000-\u0020\u007f]/.test(target)) return null;
    try { const url = new URL(target); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
  }
  function linkAt(text, start) {
    const labelEnd = text.indexOf(']', start + 1);
    if (labelEnd < 0) return { end: text.length };
    if (labelEnd - start > 2048 || text[labelEnd + 1] !== '(') return { end: labelEnd + 1 };
    let end = labelEnd + 2, depth = 1;
    for (; end < text.length && end - labelEnd <= 4096; end++) {
      if (text[end] === '\\') { end++; continue; }
      if (text[end] === '(') depth++;
      if (text[end] === ')' && --depth === 0) break;
      if (depth > 8 || text[end] === '\n') return { end: labelEnd + 1 };
    }
    if (depth || end >= text.length) return { end: labelEnd + 1 };
    const destination = /^\s*(?:<([^<>]+)>|(\S+?))(?:\s+["']([^\n]*?)["'])?\s*$/.exec(text.slice(labelEnd + 2, end));
    return { end: end + 1, label: text.slice(start + 1, labelEnd), href: destination && safeLink(destination[1] || destination[2]), title: destination?.[3] };
  }
  function inline(parent, text, state, depth = 0, allowLinks = true) {
    const { document } = state;
    if (depth >= MAX_INLINE_DEPTH) { parent.append(document.createTextNode(text)); return; }
    let i = 0, plain = 0;
    const missing = new Set();
    const flush = end => { if (end > plain) parent.append(document.createTextNode(text.slice(plain, end))); };
    while (i < text.length && state.inlineTokens < MAX_INLINE_TOKENS) {
      const char = text[i];
      if (char === '\\' && /[\\`*{}\[\]()#+\-.!_|>]/.test(text[i + 1] || '')) {
        flush(i); parent.append(document.createTextNode(text[i + 1])); i += 2; plain = i; state.inlineTokens++; continue;
      }
      if (char === '`') {
        let count = 1; while (text[i + count] === '`') count++;
        const marker = '`'.repeat(count), end = missing.has(marker) ? -1 : text.indexOf(marker, i + count);
        if (end >= 0) {
          flush(i); parent.append(element(document, 'code', '', text.slice(i + count, end)));
          i = end + count; plain = i; state.inlineTokens++; continue;
        }
        missing.add(marker); i += count; continue;
      }
      if (allowLinks && (char === '[' || char === '!' && text[i + 1] === '[')) {
        const image = char === '!', link = linkAt(text, i + (image ? 1 : 0));
        if (link.href && !image) {
          flush(i); const anchor = element(document, 'a'); anchor.href = link.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
          if (link.title) anchor.title = link.title;
          inline(anchor, link.label, state, depth + 1, false); parent.append(anchor); plain = link.end;
        }
        // Invalid/image syntax remains literal. Never fetch remote Markdown images.
        i = link.end; state.inlineTokens++; continue;
      }
      if (allowLinks && char === '<' && /^https?:\/\//i.test(text.slice(i + 1, i + 9))) {
        const end = text.indexOf('>', i + 1), href = end < 0 ? null : safeLink(text.slice(i + 1, end));
        if (end < 0) break;
        if (href) {
          flush(i); const anchor = element(document, 'a', '', text.slice(i + 1, end)); anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; parent.append(anchor);
          i = end + 1; plain = i; state.inlineTokens++; continue;
        }
      }
      if (char === '*' || char === '_') {
        const marker = text[i + 1] === char ? char + char : char;
        // Do not turn variable_names into emphasis.
        const eligible = char !== '_' || !/[\p{L}\p{N}]/u.test(text[i - 1] || '');
        const end = !eligible || missing.has(marker) ? -1 : text.indexOf(marker, i + marker.length);
        if (end > i + marker.length && !/\s/.test(text[i + marker.length]) && !/\s/.test(text[end - 1])) {
          flush(i); const node = element(document, marker.length === 2 ? 'strong' : 'em'); inline(node, text.slice(i + marker.length, end), state, depth + 1, allowLinks); parent.append(node);
          i = end + marker.length; plain = i; state.inlineTokens++; continue;
        }
        if (end < 0 && eligible) missing.add(marker);
        i += marker.length; continue;
      }
      i++;
    }
    flush(text.length);
  }
  function tableCells(text) {
    const cells = []; let cell = '', ticks = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\\' && i + 1 < text.length) { cell += char + text[++i]; continue; }
      if (char === '`') { let size = 1; while (text[i + size] === '`') size++; ticks = ticks === size ? 0 : ticks || size; cell += '`'.repeat(size); i += size - 1; continue; }
      if (char === '|' && !ticks) { cells.push(cell.trim()); cell = ''; } else cell += char;
    }
    cells.push(cell.trim());
    if (text.trimStart().startsWith('|')) cells.shift();
    if (text.trimEnd().endsWith('|') && cells.at(-1) === '') cells.pop();
    return cells;
  }
  function tableOf(lines, index) {
    if (!lines[index]?.text.includes('|') || !lines[index + 1] || lines[index].text.length > 16384 || lines[index + 1].text.length > 16384) return null;
    const headers = tableCells(lines[index].text), rules = tableCells(lines[index + 1].text);
    if (!headers.length || headers.length > 128 || headers.length !== rules.length || !rules.every(rule => /^:?-{3,}:?$/.test(rule))) return null;
    return { headers, align: rules.map(rule => rule.startsWith(':') && rule.endsWith(':') ? 'center' : rule.endsWith(':') ? 'right' : 'left') };
  }
  function codeBlock(parent, source, fence, complete, state) {
    const { document } = state, index = state.codeIndex++;
    const card = element(document, 'div', 'message-code'); card.dataset.codeIndex = String(index); card.dataset.complete = String(complete);
    const toolbar = element(document, 'div', 'message-code-toolbar');
    toolbar.append(element(document, 'span', 'message-code-kind', state.role === 'user' ? 'Code fourni' : state.role === 'assistant' ? 'Code proposé' : 'Code'));
    const language = fence.info.split(/\s/)[0].slice(0, 100);
    if (language) toolbar.append(element(document, 'span', 'message-code-language', language));
    if (!complete) toolbar.append(element(document, 'span', 'message-code-state', 'Bloc non fermé'));
    const copy = element(document, 'button', 'file-action message-code-copy', 'Copier le code'); copy.type = 'button'; copy.dataset.codeIndex = String(index);
    const status = element(document, 'p', 'message-code-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const pre = element(document, 'pre'), code = element(document, 'code', '', source); pre.append(code);
    let manual, copying = false, copyAttempt = 0;
    const closeManual = (focus = true) => { if (manual) { manual.remove(); manual = null; } if (focus) copy.focus({ preventScroll: true }); };
    const selectionSnapshot = () => {
      const selection = document.defaultView?.getSelection();
      return selection ? [selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset, selection.rangeCount] : [];
    };
    copy.addEventListener('click', async () => {
      if (copying) return;
      copying = true; const attempt = ++copyAttempt, focus = document.activeElement, selected = selectionSnapshot();
      // Keep the button focusable while Clipboard is pending. A late response must
      // not take over another message, control, or user selection.
      copy.setAttribute('aria-busy', 'true');
      const relevant = () => {
        if (!card.isConnected || attempt !== copyAttempt || document.activeElement !== focus) return false;
        const current = selectionSnapshot();
        return current.length === selected.length && current.every((value, index) => value === selected[index]);
      };
      try {
        if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
        await globalThis.navigator.clipboard.writeText(source);
        if (!relevant()) return;
        closeManual(false); status.textContent = 'Code copié.';
      } catch {
        if (!relevant()) return;
        status.textContent = 'Copie automatique indisponible. Sélectionne et copie ce code.';
        if (!manual) {
          manual = element(document, 'div', 'message-code-manual');
          // A textarea normalizes CRLF. Keep the raw source in a selectable text node.
          const field = element(document, 'pre', 'message-code-fallback', source); field.tabIndex = 0; field.setAttribute('role', 'textbox'); field.setAttribute('aria-readonly', 'true'); field.setAttribute('aria-multiline', 'true'); field.setAttribute('aria-label', 'Code à copier manuellement');
          const close = element(document, 'button', 'file-action message-code-fallback-close', 'Fermer la copie manuelle'); close.type = 'button'; close.addEventListener('click', () => closeManual());
          manual.append(field, close); manual.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeManual(); } }); card.append(manual);
        }
        const field = manual.querySelector('pre'); field.focus({ preventScroll: true });
        try { const range = document.createRange(), selection = document.defaultView?.getSelection(); range.selectNodeContents(field); selection?.removeAllRanges(); selection?.addRange(range); } catch { /* Manual keyboard selection remains available. */ }
      } finally { copying = false; if (copy.isConnected) copy.setAttribute('aria-busy', 'false'); }
    });
    toolbar.append(copy); card.append(toolbar, pre, status); parent.append(card);
  }
  function blocks(parent, lines, state, depth = 0) {
    const { document } = state;
    if (depth >= MAX_DEPTH) { parent.append(element(document, 'p', '', textOf(lines))); return; }
    let i = 0;
    const paragraph = text => { const p = element(document, 'p'); inline(p, text, state); parent.append(p); };
    while (i < lines.length) {
      if (state.blocks++ >= MAX_BLOCKS) { parent.append(element(document, 'p', 'message-text-fallback', textOf(lines.slice(i)))); return; }
      const line = lines[i].text;
      if (!line.trim()) { i++; continue; }
      const fence = fenceOf(line);
      if (fence) {
        let end = i + 1;
        const closing = new RegExp('^ {0,3}' + (fence.marker[0] === '`' ? '`' : '~') + '{' + fence.marker.length + ',}[ \\t]*$');
        while (end < lines.length && !closing.test(lines[end].text)) end++;
        codeBlock(parent, textOf(lines.slice(i + 1, end)), fence, end < lines.length, state); i = end < lines.length ? end + 1 : end; continue;
      }
      const heading = headingOf(line);
      if (heading) { const node = element(document, 'h' + Math.max(2, heading[1].length)); inline(node, heading[2], state); parent.append(node); i++; continue; }
      if (separator(line)) { parent.append(element(document, 'hr')); i++; continue; }
      if (quoteOf(line)) {
        const quoted = [];
        while (i < lines.length && quoteOf(lines[i].text)) { quoted.push(stripped(lines[i], quoteOf(lines[i].text)[0].length)); i++; }
        const quote = element(document, 'blockquote'); blocks(quote, quoted, state, depth + 1); parent.append(quote); continue;
      }
      const list = listOf(line);
      if (list && list.indent <= 3) {
        const node = element(document, list.ordered ? 'ol' : 'ul'); if (list.ordered && list.start !== 1) node.setAttribute('start', String(list.start));
        while (i < lines.length) {
          if (state.blocks >= MAX_BLOCKS) break;
          const item = listOf(lines[i].text);
          if (!item || item.indent !== list.indent || item.ordered !== list.ordered || separator(lines[i].text)) break;
          const itemLines = [stripped(lines[i++], item.prefix)];
          while (i < lines.length) {
            const next = listOf(lines[i].text), indent = /^ */.exec(lines[i].text)[0].length;
            if (next && next.indent <= list.indent || lines[i].text.trim() && indent <= list.indent) break;
            itemLines.push(stripped(lines[i], Math.min(indent, item.prefix))); i++;
          }
          const li = element(document, 'li'); blocks(li, itemLines, state, depth + 1); node.append(li);
        }
        parent.append(node); continue;
      }
      const table = tableOf(lines, i);
      if (table) {
        const wrap = element(document, 'div', 'message-table-wrap'); wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Tableau du message'); wrap.tabIndex = 0;
        const node = element(document, 'table'), head = element(document, 'thead'), row = element(document, 'tr'), body = element(document, 'tbody');
        table.headers.forEach((value, column) => { const cell = element(document, 'th', 'message-table-align-' + table.align[column]); cell.setAttribute('scope', 'col'); inline(cell, value, state); row.append(cell); }); state.blocks += table.headers.length; head.append(row); i += 2;
        while (i < lines.length && state.blocks + table.headers.length <= MAX_BLOCKS && lines[i].text.trim() && lines[i].text.includes('|')) {
          const values = tableCells(lines[i++].text), tr = element(document, 'tr');
          for (let column = 0; column < table.headers.length; column++) { const cell = element(document, 'td', 'message-table-align-' + table.align[column]); inline(cell, column === table.headers.length - 1 ? values.slice(column).join(' | ') : values[column] || '', state); tr.append(cell); } state.blocks += table.headers.length; body.append(tr);
        }
        node.append(head, body); wrap.append(node); parent.append(wrap); continue;
      }
      if (lines[i + 1] && /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[i + 1].text)) {
        const node = element(document, /^\s*=/.test(lines[i + 1].text) ? 'h2' : 'h3'); inline(node, line, state); parent.append(node); i += 2; continue;
      }
      const parts = [line]; i++;
      while (i < lines.length && lines[i].text.trim() && !fenceOf(lines[i].text) && !headingOf(lines[i].text) && !separator(lines[i].text) && !quoteOf(lines[i].text) && !(listOf(lines[i].text)?.indent <= 3) && !tableOf(lines, i)) { parts.push(lines[i++].text); }
      paragraph(parts.join('\n'));
    }
  }
  function render(container, text, { role = 'assistant' } = {}) {
    const document = container.ownerDocument || globalThis.document;
    container.replaceChildren();
    blocks(container, linesOf(typeof text === 'string' ? text : ''), { document, role, codeIndex: 0, blocks: 0, inlineTokens: 0 });
    return container;
  }
  globalThis.BionicMessageText = Object.freeze({ render });
})();
