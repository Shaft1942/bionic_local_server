type ClipboardContext = {
  navigator?: Pick<Navigator, 'clipboard'>;
  document?: Document;
  signal?: AbortSignal;
};

const stopped = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Copy cancelled', 'AbortError'); };

/** Copy the source string, including Markdown and whitespace, never rendered HTML. */
export async function copyMessageText(text: string, context: ClipboardContext = {}): Promise<{ method: 'clipboard'|'legacy' }> {
  if (typeof text !== 'string') throw new TypeError('A message string is required');
  const navigator = context.navigator ?? globalThis.navigator, document = context.document ?? globalThis.document;
  stopped(context.signal);
  if (typeof navigator?.clipboard?.writeText === 'function') {
    try { await navigator.clipboard.writeText(text); stopped(context.signal); return { method: 'clipboard' }; }
    catch { stopped(context.signal); /* HTTP LAN and denied modern clipboard use the synchronous browser path. */ }
  }
  if (!document?.body || typeof document.execCommand !== 'function') throw Object.assign(new Error('Copy was not confirmed'), { code: 'clipboard-unavailable' });
  stopped(context.signal);
  const active = document.activeElement as HTMLElement & { selectionStart?: number|null; selectionEnd?: number|null; selectionDirection?: 'forward'|'backward'|'none'|null; setSelectionRange?:(start:number,end:number,direction?:'forward'|'backward'|'none')=>void };
  const inputSelection = active && typeof active.selectionStart === 'number' ? { start: active.selectionStart, end: active.selectionEnd ?? active.selectionStart, direction: active.selectionDirection ?? 'none' } : null;
  const selection = document.getSelection(), ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const field = document.createElement('textarea');
  field.value = text; field.readOnly = true; field.tabIndex = -1; field.setAttribute('aria-hidden', 'true');
  // Property assignment works with the app's strict style CSP; no inline markup.
  Object.assign(field.style, { position: 'fixed', insetInlineStart: '-10000px', top: '0', width: '1px', height: '1px', opacity: '0', fontSize: '16px' });
  let written = false;
  const provideExactText = (event: ClipboardEvent) => {
    try { if (event.clipboardData) { event.clipboardData.setData('text/plain', text); event.preventDefault(); written = true; } }
    catch { written = false; }
  };
  document.addEventListener('copy', provideExactText);
  document.body.append(field);
  try {
    field.focus({ preventScroll: true }); field.select();
    const accepted = document.execCommand('copy') === true;
    if (!accepted || !written) throw Object.assign(new Error('Copy was not confirmed'), { code: 'clipboard-unavailable' });
    return { method: 'legacy' };
  } finally {
    document.removeEventListener('copy', provideExactText); field.remove();
    if (active?.isConnected) { active.focus({ preventScroll: true }); if (inputSelection) active.setSelectionRange?.(inputSelection.start, inputSelection.end, inputSelection.direction); }
    if (selection) { selection.removeAllRanges(); for (const range of ranges) try { selection.addRange(range); } catch { /* A streamed message may replace its text nodes. */ } }
  }
}
