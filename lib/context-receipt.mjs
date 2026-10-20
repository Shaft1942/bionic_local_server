// Receipts describe the already selected snapshots. They never open project files.
const preview = text => String(text || '').slice(0, 240);
export const TOOL_RECEIPT_LIMIT = 12000;

export function createContextReceipt({ chat, candidates, selected, prompt, messageId, attachments, vision, fileAccess }) {
  const files = [];
  const describeAttachments = (message, index, current = false) => {
    for (const [attachmentIndex, file] of (message.attachments || []).entries()) {
      const image = file.kind === 'image';
      files.push({
        messageId: message.id || null, messageIndex: index, index: attachmentIndex,
        source: current ? 'current' : 'history', name: file.name, rootId: file.rootId,
        path: file.path, hash: file.hash, kind: file.kind || 'text', excerpt: !!file.excerpt,
        characters: image ? 0 : String(file.text || '').length,
        eligible: !image || !!vision, transmitted: false,
        ...(image && !vision ? { reason: 'vision-disabled' } : {}),
        ...(!image ? { preview: preview(file.text) } : {})
      });
    }
  };
  for (const candidate of selected) describeAttachments(candidate.source, candidate.index);
  describeAttachments({ id: messageId, attachments }, chat.messages.length, true);
  return {
    version: 1, createdAt: Date.now(), initialTransmitted: false,
    history: {
      availableCount: candidates.length, selectedCount: selected.length,
      omittedCount: candidates.length - selected.length,
      importedTruncated: !!chat.importedTruncated,
      messages: selected.map(({ source, index }) => ({
        id: source.id || null, index, role: source.role,
        preview: preview(source.text), characters: source.text.length
      }))
    },
    current: { messageId, characters: prompt.length }, attachments: files,
    toolsEnabled: !!fileAccess, vision: !!vision,
    toolReads: [], toolReadCharacters: 0, toolReadLimit: TOOL_RECEIPT_LIMIT, external: [], externalCharacters: 0
  };
}

export function addToolRead(receipt, action, read) {
  if (!action.ok || !read || typeof read.text !== 'string') return;
  const remaining = Math.max(0, TOOL_RECEIPT_LIMIT - receipt.toolReadCharacters);
  const text = read.text.slice(0, remaining);
  receipt.toolReads.push({
    actionId: action.id, path: read.path, hash: read.hash,
    start: read.start, length: read.text.length, totalCharacters: read.totalCharacters,
    text, transmitted: false,
    ...(text.length < read.text.length || read.truncated ? { truncated: true } : {})
  });
  receipt.toolReadCharacters += text.length;
}

export function markContextTransmitted(receipt) {
  receipt.initialTransmitted = true;
  for (const attachment of receipt.attachments) attachment.transmitted = attachment.eligible;
  for (const read of receipt.toolReads) read.transmitted = true;
  for (const item of receipt.external || []) item.transmitted = true;
}

export function addExternalContext(receipt,action,entry) {
  if(!entry)return;
  const remaining=Math.max(0,12000-(receipt.externalCharacters||0));
  const text=entry.text.slice(0,remaining);receipt.external ||= [];
  receipt.external.push({...entry,text,actionId:action.id,transmitted:false,truncated:text.length<entry.text.length});
  receipt.externalCharacters=(receipt.externalCharacters||0)+text.length;
}
