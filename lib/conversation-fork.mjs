import { randomUUID } from 'node:crypto';

const ID = /^[a-zA-Z0-9._-]{1,180}$/;
const PROJECT = /^[a-zA-Z0-9_-]{1,128}$/;
const ACTIVE = new Set(['running', 'starting', 'preparing', 'submitting', 'reconnecting', 'queued']);
const TERMINAL = new Set(['completed', 'stopped', 'error', 'interrupted']);
const fail = (status, message) => Object.assign(new Error(message), { status });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && ID.test(value);
const scalar = value => typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));

function sourceLabel(source) {
  return typeof source.name === 'string' && source.name.trim() ? source.name.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 160) : 'Conversation';
}

function nameFor(value, source) {
  if (value === undefined) return sourceLabel(source).slice(0, 147) + ' · branche';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 160 || /[\x00-\x1f\x7f]/.test(value)) {
    throw fail(400, 'Le nom de la branche doit contenir de 1 à 160 caractères, sans caractère de contrôle.');
  }
  return value.trim();
}

function historicalAction(action, source, message, index) {
  // This lives outside `actions`: a copied journal must never authorize restore,
  // pinning a file, a new approval, or another execution in the new conversation.
  const copy = { historical: true };
  for (const key of ['name', 'message', 'path', 'ok', 'createdAt', 'finishedAt', 'restored', 'runtime', 'stdout', 'stderr', 'exitCode', 'url']) {
    if (scalar(action[key])) copy[key] = action[key];
  }
  if (Array.isArray(action.webResults)) copy.webResults = structuredClone(action.webResults);
  if (typeof action.hash === 'string') copy.sourceHash = action.hash;
  else if (typeof action.sourceHash === 'string') copy.sourceHash = action.sourceHash;
  const prior = object(action.origin) && validId(action.origin.chatId) ? action.origin : null;
  copy.origin = {
    chatId: prior?.chatId || source.id,
    messageId: validId(prior?.messageId) ? prior.messageId : validId(message.id) ? message.id : null,
    actionId: validId(prior?.actionId) ? prior.actionId : validId(action.id) ? action.id : null,
    source: ['bionic', 'web'].includes(prior?.source) ? prior.source : source.source === 'bionic' ? 'bionic' : 'web',
    index: Number.isSafeInteger(prior?.index) ? prior.index : index,
  };
  return copy;
}

function assertBoundary(source, message, index) {
  if (message.role !== 'assistant') return;
  const generation = source.generation;
  const referencedReply = generation?.replyId ? source.messages.find(entry => entry.id === generation.replyId) :
    generation?.requestId ? source.messages.findLast(entry => entry.role === 'assistant' && (entry.requestId === generation.requestId || entry.localRequestId === generation.requestId)) : null;
  const isActiveReply = ACTIVE.has(generation?.status) && (referencedReply ? referencedReply === message : index === source.messages.length - 1);
  if (isActiveReply || ACTIVE.has(message.status) || ACTIVE.has(message.requestStatus) || message.complete === false ||
      (typeof message.text !== 'string' || !message.text.trim()) && !TERMINAL.has(message.outcome)) {
    throw fail(409, 'Attends la fin de cette réponse, ou crée la branche à partir d’un message précédent.');
  }
}

/**
 * Make a detached web snapshot without reading files, replaying tools, or writing
 * to the source. UUID/time creation are the only nondeterministic operations.
 * Authentication and project membership must be checked by the calling route.
 */
export function forkConversation(input = {}) {
  if (!object(input)) throw fail(400, 'Demande de branche invalide.');
  const { source, messageId, name } = input;
  if (!object(source) || !validId(source.id) || typeof source.projectId !== 'string' || !PROJECT.test(source.projectId) || !Array.isArray(source.messages)) {
    throw fail(400, 'Conversation source invalide.');
  }
  if (!source.messages.length) throw fail(400, 'Cette conversation ne contient aucun message à copier.');
  if (messageId !== undefined && !validId(messageId)) throw fail(400, 'Message de départ invalide.');
  const boundary = messageId === undefined ? source.messages.length - 1 : source.messages.findIndex(message => message?.id === messageId);
  if (boundary < 0) throw fail(404, 'Le message de départ est introuvable dans cette conversation.');
  const selected = source.messages.slice(0, boundary + 1);
  if (selected.some(message => !object(message) || !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string')) {
    throw fail(400, 'L’historique source contient un message invalide.');
  }
  const sourceIds = selected.map(message => message.id).filter(validId);
  if (new Set(sourceIds).size !== sourceIds.length) throw fail(400, 'L’historique source contient des identifiants de message en double.');
  assertBoundary(source, selected.at(-1), boundary);
  const createdAt = Date.now(), ids = selected.map(() => randomUUID());
  const remap = new Map(selected.flatMap((message, index) => validId(message.id) ? [[message.id, ids[index]]] : []));
  const originSource = source.source === 'bionic' ? 'bionic' : 'web';
  const messages = selected.map((message, index) => {
    // Deliberately use an allowlist: requests, approvals, restore credentials,
    // pending calls and future runtime fields are not inherited accidentally.
    const copy = { id: ids[index], role: message.role, text: message.text, fromFork: true };
    for (const key of ['createdAt', 'textTruncated', 'reasoning', 'interrupted', 'limited', 'complete', 'fromBionic']) {
      if (scalar(message[key])) copy[key] = message[key];
    }
    if (originSource === 'bionic') copy.fromBionic = true;
    if (Array.isArray(message.attachments)) copy.attachments = structuredClone(message.attachments);
    if (object(message.metrics)) copy.metrics = structuredClone(message.metrics);
    copy.origin = {
      chatId: source.id, messageId: validId(message.id) ? message.id : null,
      messageIndex: index, source: originSource,
      ...(TERMINAL.has(message.outcome) ? { outcome: message.outcome } : {}),
      ...(Number.isSafeInteger(message.finishedAt) ? { finishedAt: message.finishedAt } : {}),
    };
    if (object(message.contextReceipt)) {
      copy.contextReceipt = structuredClone(message.contextReceipt);
      copy.contextReceipt.historical = true;
      copy.contextReceipt.origin = { chatId: source.id, messageId: copy.origin.messageId, source: originSource };
      for (const entry of copy.contextReceipt.history?.messages || []) if (remap.has(entry.id)) entry.id = remap.get(entry.id);
      if (remap.has(copy.contextReceipt.current?.messageId)) copy.contextReceipt.current.messageId = remap.get(copy.contextReceipt.current.messageId);
      for (const entry of copy.contextReceipt.attachments || []) if (remap.has(entry.messageId)) entry.messageId = remap.get(entry.messageId);
    }
    const actions = [...(Array.isArray(message.historicalActions) ? message.historicalActions : []), ...(Array.isArray(message.actions) ? message.actions : [])].filter(object);
    if (actions.length) copy.historicalActions = actions.map((action, actionIndex) => historicalAction(action, source, message, actionIndex));
    return copy;
  });
  return {
    id: 'web-' + randomUUID(), projectId: source.projectId,
    name: nameFor(name, source), source: 'web', readOnly: false,
    ...(typeof source.model === 'string' ? { model: source.model } : {}),
    ...(object(source.reasoningByModel) ? { reasoningByModel: structuredClone(source.reasoningByModel) } : {}),
    fileAccess: originSource === 'web' && source.fileAccess === true, webAccess: false, scriptAccess: false,
    origin: { kind: 'fork', id: source.id, name: sourceLabel(source), source: originSource, messageId: validId(selected.at(-1).id) ? selected.at(-1).id : null, messageIndex: boundary },
    messages, queue: [], createdAt, updatedAt: createdAt,
    importedTruncated: !!(source.importedTruncated || source.truncated),
    ...(object(source.omitted) ? { omitted: structuredClone(source.omitted) } : {}),
  };
}
