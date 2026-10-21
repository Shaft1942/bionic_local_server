'use strict';
const $ = id => document.getElementById(id);
const composerFiles = $('composer-files'), composerFilesToggle = $('files-menu-toggle');
const mobileComposer = matchMedia('(max-width:760px)');
const conversationMove = { busy: false, action: null, revision: 0 };
function closeComposerFiles(restoreFocus = false) {
  if (!composerFiles.open) return;
  composerFiles.open = false;
  if (restoreFocus) composerFilesToggle.focus({ preventScroll: true });
}
function syncComposerFilesLayout() {
  const focusInside = composerFiles.contains(document.activeElement);
  composerFiles.open = false;
  if (focusInside) composerFilesToggle.focus({ preventScroll: true });
}
syncComposerFilesLayout();
mobileComposer.addEventListener('change', syncComposerFilesLayout);
composerFiles.addEventListener('keydown', event => {
  if (event.key === 'Escape' && composerFiles.open) { event.preventDefault(); closeComposerFiles(true); }
});
composerFiles.addEventListener('focusout', event => {
  if (event.relatedTarget && !composerFiles.contains(event.relatedTarget)) closeComposerFiles();
});
document.addEventListener('pointerdown', event => {
  if (!composerFiles.contains(event.target)) closeComposerFiles();
  for (const details of document.querySelectorAll('.message.user .message-extras[open]')) if (!details.contains(event.target)) details.open = false;
});
const icons = {
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  back: '<path d="m14 5-7 7 7 7"/>', send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  logout: '<path d="M9 4H5v16h4M9 12h12m-4-4 4 4-4 4"/>', eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  models: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  folder: '<path d="M3 7V5h6l2 2h10v12H3Z"/>',
  file: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h4M9 12h6m-6 4h6"/>',
  up: '<path d="m5 15 7-7 7 7"/>',
  attach: '<path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  activity: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7M12 7v5l3 2"/>'
};
function icon(name) { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('aria-hidden', 'true'); el.innerHTML = icons[name]; return el; }
for (const [id, name] of [['refresh', 'refresh'], ['search-icon', 'search'], ['back', 'back'], ['send', 'send'], ['info-button', 'info'], ['logout', 'logout'], ['reveal', 'eye']]) $(id).append(icon(name));
for (const [id, name] of [['models-open-thread','models'], ['models-close','close'], ['models-refresh','refresh']]) $(id).append(icon(name));
$('info-close').append(icon('close'));
$('models-open-sidebar').prepend(icon('models'));
$('conversation-options-toggle').append(icon('more'));
$('new-chat').append(icon('plus'), document.createTextNode('Nouveau chat web'));
const state = { projects: [], sessions: [], projectId: null, chat: null, sending: false, loading: false, uploading: false, status: null, viewSeq: 0, projectSeq: 0, authenticated: false, authEpoch: 0, viewKey: null, draftReasoning: {}, draftFileProfile: null, draftFileAccess: null, draftWebAccess:null, draftWebApproval:null, draftScriptAccess:null, sessionsPartial:false, sessionWarnings:[] };
const textDraftStore = createMessageDraftStore({ storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value), removeItem: key => localStorage.removeItem(key) } });
const chats = new Map(), drafts = readDrafts(), jobs = readJobs();
let recoveryTimer, recoveryBusy = false, renderTimer;
const observedGenerations = new Map(), announcedEvents = new Set();
let sessionSignature = '', searchAnnouncementTimer, importWithAttachment = false, draftStorageWarning = false;
function setText(el, text) { if (el.textContent !== text) el.textContent = text; }
function announce(message, key = message) {
  if (!message || announcedEvents.has(key)) return;
  announcedEvents.add(key); if (announcedEvents.size > 200) announcedEvents.delete(announcedEvents.values().next().value);
  setText($('event-status'), message);
}
function observeGeneration(chat, projectId) {
  if (!chat?.id) return;
  const key = chatKey(projectId, chat.id), previous = observedGenerations.get(key), generation = chat.generation || {};
  if (generation.awaitingApproval && (!previous?.awaitingApproval || previous.replyId !== generation.replyId)) announce('Une demande attend ton accord dans « ' + chat.name + ' ».', 'approval:' + key + ':' + generation.replyId);
  if (previous?.status === 'running' && generation.status && generation.status !== 'running') announce('La réponse de « ' + chat.name + ' » est ' + (generation.status === 'done' || generation.status === 'completed' ? 'terminée.' : 'arrêtée ou en erreur.'), 'finished:' + key + ':' + (generation.replyId || previous.replyId));
  observedGenerations.set(key, { status:generation.status, replyId:generation.replyId, awaitingApproval:!!generation.awaitingApproval });
}
function fileProfile(source, fallback = 'write') {
  const value = source?.fileProfile ?? source?.filePermission;
  return ['none','read','write'].includes(value) ? value : typeof source?.fileAccess === 'boolean' ? source.fileAccess ? 'write' : 'none' : fallback;
}
function currentFileProfile() { return unassignedProject() ? 'none' : $('agent-files').value; }
function draftFailure() {
  setText($('draft-status'), 'Conservation locale indisponible. Le texte courant reste affiché : télécharge ce brouillon avant de fermer.');
  if (!draftStorageWarning) { toast('Brouillon non conservé : utilise « Télécharger ce brouillon » dans les options.'); draftStorageWarning = true; }
}
function downloadMessageDraft() {
  const url = URL.createObjectURL(new Blob([$('prompt').value], { type:'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'brouillon-message.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readJobs() {
  try {
    const saved = JSON.parse(localStorage.getItem('bm_pending_replies') || 'null') || [JSON.parse(localStorage.getItem('bm_pending_reply') || 'null')];
    return new Map((Array.isArray(saved) ? saved : []).filter(job => job && typeof job.projectId === 'string' && /^[a-zA-Z0-9-]{16,100}$/.test(job.requestId || '')).slice(0, 100).map(job => [job.requestId, { ...job, status: job.status || 'reconnecting' }]));
  } catch { return new Map(); }
}
function rememberJobs() {
  try {
    localStorage.removeItem('bm_pending_reply');
    const saved = [...jobs.values()].map(({ requestId, projectId, id, createdAt, status, viewKey }) => ({ requestId, projectId, id, createdAt, status, viewKey }));
    if (saved.length) localStorage.setItem('bm_pending_replies', JSON.stringify(saved)); else localStorage.removeItem('bm_pending_replies');
  } catch {}
}
function readDrafts() {
  try { const saved = JSON.parse(sessionStorage.getItem('bm_drafts') || '[]'); return new Map(Array.isArray(saved) ? saved.slice(-100) : []); } catch { return new Map(); }
}
function applyDraftRevocation() { for(const [key,draft]of drafts)drafts.set(key,{...draft,text:'',failed:[]});$('prompt').value='';$('draft-duration').value='0';setText($('draft-status'),'Textes effacés depuis un autre onglet. Conservation durable désactivée.'); }
function rememberDrafts() {
  try { if(textDraftStore.synchronize())applyDraftRevocation(); } catch { draftFailure(); }
  try { sessionStorage.setItem('bm_drafts', JSON.stringify([...drafts.entries()].slice(-100))); } catch { draftFailure(); }
  try { if(textDraftStore.save(drafts)?.revoked){applyDraftRevocation();sessionStorage.setItem('bm_drafts',JSON.stringify([...drafts.entries()].slice(-100)));} } catch { draftFailure(); }
}
function chatKey(projectId, id) { return projectId + '|' + (id || 'new'); }
function currentJobs() { return [...jobs.values()].filter(job => job.projectId === state.projectId && (job.id ? job.id === state.chat?.id : job.viewKey === state.viewKey)); }
function anyGeneration() { return jobs.size > 0 || state.sessions.some(chat => chat.generation?.status === 'running' || chat.queue?.some(item => item.status === 'queued')); }
function draftForView() { return drafts.get(state.viewKey) || {}; }
function saveDraft() {
  if (!state.viewKey) return;
  drafts.set(state.viewKey, { ...draftForView(), text: $('prompt').value, model: $('model').value, reasoning: { ...state.draftReasoning }, fileProfile:currentFileProfile(), fileAccess:currentFileProfile()==='write', webAccess:$('agent-web').checked, webApproval:$('agent-web-approval').checked, scriptAccess:$('agent-scripts').checked, attachments: fileBrowser.snapshot(), uploadStatus: $('upload-status').hidden ? '' : $('upload-status').textContent });
  rememberDrafts();
}
function restoreDraft(key) {
  state.viewKey = key;
  rememberView();
  const draft = draftForView();
  state.draftReasoning = { ...draft.reasoning }; state.draftFileAccess = draft.fileAccess ?? null;
  state.draftFileProfile = ['none','read','write'].includes(draft.fileProfile) ? draft.fileProfile : typeof draft.fileAccess === 'boolean' ? fileProfile(draft) : null;
  state.draftWebAccess=draft.webAccess??null;state.draftWebApproval=draft.webApproval??null;state.draftScriptAccess=draft.scriptAccess??null;
  $('prompt').value = draft.text || ''; fileBrowser.restore(draft.attachments || []);
  $('upload-status').textContent = draft.uploadStatus || ''; $('upload-status').hidden = !draft.uploadStatus;
  $('model').value = (state.status?.models || []).some(model => model.id === draft.model) ? draft.model : modelForChat();
}
function rememberView() { try { sessionStorage.setItem('bm_view', JSON.stringify({ projectId: state.projectId, key: state.viewKey })); } catch {} }
function rememberChat() { if (state.chat?.id) { try { localStorage.setItem('bm_chat_' + state.projectId, state.chat.id); } catch {} } }
const EFFORT_LABELS = { off: 'Désactivé', on: 'Activé', low: 'Faible', medium: 'Moyen', high: 'Élevé', xhigh: 'Très élevé' };
const modelPanel = { models: [], loading: false, unloading: null, generationActive: false };
const fileBrowser = createProjectFileBrowser({ api, node, icon, toast, getProject: () => state.projects.find(project => project.id === state.projectId), isBusy: () => state.loading || state.uploading || conversationMove.busy, onChange: saveDraft, onAttach: () => { $('app').classList.add('thread-open'); renderChat(); $('prompt').focus(); } });
const workspace = createWorkspace({ api, node, icon, toast, getState: () => state, openTarget: async (projectId, chatId, messageId) => {
  if (state.uploading) throw new Error('Attends la fin de l’import avant d’ouvrir cette conversation.');
  if (conversationMove.busy) throw new Error('Attends la fin de la modification de cette conversation.');
  if (!state.projects.some(project => project.id === projectId)) throw new Error('Le projet de cette réponse n’est plus disponible. Actualise les projets.');
  saveDraft();
  if (state.projectId !== projectId) {
    ++state.viewSeq; state.projectId = projectId; $('project').value = projectId; state.chat = null; state.loading = false;
    restoreDraft(chatKey(projectId)); await loadSessions();
  }
  await openChat(chatId);
  return state.projectId === projectId && state.chat?.id === chatId && !![...$('messages').querySelectorAll('.message')].find(el => el.dataset.messageId === messageId);
} });
$('upload-file').prepend(icon('upload'));
let toastTimeout;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('toast').hidden = true, 4500); }
function error(message) { $('message-error').textContent = message || ''; $('message-error').hidden = !message; }
function unassignedProject() { return !!state.projects.find(project => project.id === state.projectId)?.isUnassigned; }
function closeConversationOptions(focus = false) {
  $('conversation-options').hidden = true; $('conversation-options-toggle').setAttribute('aria-expanded', 'false');
  if (focus) $('conversation-options-toggle').focus();
}
function closeInfo(focus = false) {
  $('info').hidden = true; $('info-button').setAttribute('aria-expanded', 'false');
  if (focus) $('conversation-options-toggle').focus();
}
function updateConversationOptions() {
  const select = $('move-project'), key = chatKey(state.projectId, state.chat?.id), signature = JSON.stringify(state.projects.map(project => [project.id, project.name]));
  if (select.dataset.projects !== signature || select.dataset.chat !== key) {
    const previous = select.dataset.chat === key ? select.value : state.projectId;
    select.replaceChildren(...state.projects.map(project => new Option(project.name, project.id)));
    select.value = state.projects.some(project => project.id === previous) ? previous : state.projectId;
    select.dataset.projects = signature; select.dataset.chat = key;
  }
  const active = state.sending || state.chat?.queue?.some(item => item.status === 'queued');
  select.disabled = conversationMove.busy || state.loading || state.uploading || !state.chat?.id || !!active;
  $('move-conversation').disabled = select.disabled || select.value === state.projectId;
  $('move-conversation').textContent = conversationMove.action === 'move' ? 'Déplacement…' : 'Déplacer';
  $('move-help').textContent = active ? 'Attends la fin de la réponse et de sa file pour déplacer ce chat.' : !state.chat?.id ? 'Envoie un premier message pour enregistrer la conversation avant de la déplacer.' : 'Le classement concerne le compagnon. Les fichiers et les livrables restent dans leur projet ; les fichiers du brouillon seront à joindre à nouveau. Les modifications seront désactivées après le déplacement.';
  const name = $('conversation-name'), original = state.chat?.name || '';
  if (name.dataset.chat !== key || name.value === name.dataset.originalName) {
    name.value = original; name.dataset.chat = key; name.dataset.originalName = original;
  }
  name.disabled = select.disabled;
  $('rename-conversation').disabled = select.disabled || !name.value.trim() || name.value.trim() === original;
  $('rename-conversation').textContent = conversationMove.action === 'rename' ? 'Renommage…' : 'Renommer';
  $('rename-help').hidden = state.chat?.source !== 'bionic';
  $('rename-help').textContent = 'Le nom change uniquement dans le compagnon. L’original Bionic est conservé.';
  $('delete-conversation').disabled = select.disabled;
  $('delete-conversation').textContent = conversationMove.action === 'delete' ? 'Suppression…' : state.chat?.source === 'bionic' ? 'Supprimer du compagnon' : 'Supprimer la conversation';
}
async function moveCurrentConversation(event) {
  event.preventDefault(); if ($('move-conversation').disabled) return;
  saveDraft(); const epoch = state.authEpoch, oldProject = state.projectId, id = state.chat.id, oldKey = state.viewKey, draft = structuredClone(draftForView()), target = $('move-project').value;
  conversationMove.busy = true; conversationMove.action = 'move'; ++conversationMove.revision; $('move-error').hidden = true; setSending();
  let committed = false;
  try {
    const { conversation } = await api('/api/conversation/move', { method: 'POST', body: JSON.stringify({ projectId: oldProject, id, targetProjectId: target }) });
    if (epoch !== state.authEpoch || !state.authenticated) return;
    committed = true;
    const newKey = chatKey(conversation.projectId, conversation.id);
    drafts.delete(oldKey); drafts.set(newKey, { ...draft, attachments: [], uploadStatus: '', fileAccess: false, fileProfile:'none', scriptAccess: false }); rememberDrafts(); chats.delete(oldKey);
    try { if (localStorage.getItem('bm_chat_' + oldProject) === id) localStorage.removeItem('bm_chat_' + oldProject); localStorage.setItem('bm_project', conversation.projectId); } catch {}
    ++state.viewSeq; ++state.projectSeq; state.projectId = conversation.projectId; $('project').value = state.projectId; $('search').value = '';
    state.chat = conversation; state.loading = false; restoreDraft(newKey); cacheChat(conversation, state.projectId); rememberChat();
    await loadSessions(); if (epoch !== state.authEpoch || !state.authenticated) return;
    renderChat(); closeConversationOptions(); workspace.refreshActivity();
    toast('Conversation déplacée vers « ' + (state.projects.find(project => project.id === state.projectId)?.name || 'Sans projet') + ' ».' + (draft.attachments?.length ? ' Rejoins les fichiers du brouillon depuis ce projet.' : ''));
    $('prompt').focus();
  } catch (error) {
    if (epoch !== state.authEpoch || !state.authenticated) return;
    $('move-error').textContent = committed ? 'Le déplacement est enregistré. Actualise les conversations pour terminer la navigation.' : error.status === 404 && /Action inconnue/.test(error.message) ? 'Relance le serveur avec Relancer.cmd sur le PC pour activer les déplacements.' : error.message;
    $('move-error').hidden = false;
  } finally { conversationMove.busy = false; conversationMove.action = null; setSending(); scheduleRecovery(); if (committed && epoch === state.authEpoch && state.authenticated) $('prompt').focus(); }
}
function conversationActionError(action, failure) {
  const target = $(action + '-error');
  target.textContent = failure.status === 404 && /Action inconnue/.test(failure.message) ? 'Relance le serveur avec Relancer.cmd sur le PC pour activer cette action.' : failure.message;
  target.hidden = false;
  if ($('conversation-options').hidden && state.authenticated) toast(target.textContent);
}
async function renameCurrentConversation(event) {
  event.preventDefault(); if ($('rename-conversation').disabled) return;
  saveDraft(); const epoch = state.authEpoch, projectId = state.projectId, id = state.chat.id, name = $('conversation-name').value.trim();
  conversationMove.busy = true; conversationMove.action = 'rename'; ++conversationMove.revision; $('rename-error').hidden = true; setSending();
  let committed = false;
  try {
    const { conversation } = await api('/api/conversation/rename', { method: 'POST', body: JSON.stringify({ projectId, id, name }) });
    if (epoch !== state.authEpoch || !state.authenticated) return;
    committed = true;
    state.chat = conversation; cacheChat(conversation, projectId); rememberChat();
    $('conversation-name').value = conversation.name; $('conversation-name').dataset.originalName = conversation.name;
    renderChat(); closeConversationOptions(); toast('Conversation renommée.');
    $('prompt').focus();
  } catch (failure) { if (epoch === state.authEpoch && state.authenticated) conversationActionError('rename', failure); }
  finally { conversationMove.busy = false; conversationMove.action = null; setSending(); scheduleRecovery(); if (committed && epoch === state.authEpoch && state.authenticated) $('prompt').focus(); }
}
async function deleteCurrentConversation() {
  if ($('delete-conversation').disabled) return;
  const epoch = state.authEpoch, projectId = state.projectId, id = state.chat.id, key = state.viewKey, native = state.chat.source === 'bionic';
  const confirmation = native ? 'Supprimer « ' + state.chat.name + ' » du compagnon ?\n\nCe chat sera masqué ici. L’original Bionic, les fichiers du projet et les livrables seront conservés.' : 'Supprimer définitivement la conversation « ' + state.chat.name + ' » ?\n\nSes messages et son brouillon seront supprimés du compagnon. Les fichiers du projet et les livrables seront conservés.';
  if (!window.confirm(confirmation)) return;
  saveDraft(); conversationMove.busy = true; conversationMove.action = 'delete'; ++conversationMove.revision; $('delete-error').hidden = true; setSending();
  let committed = false;
  try {
    await api('/api/conversation/delete', { method: 'POST', body: JSON.stringify({ projectId, id }) });
    if (epoch !== state.authEpoch || !state.authenticated) return;
    committed = true;
    chats.delete(chatKey(projectId, id)); drafts.delete(key); rememberDrafts();
    for (const [requestId, job] of jobs) if (job.projectId === projectId && (job.id === id || job.viewKey === key)) jobs.delete(requestId);
    rememberJobs();
    try { if (localStorage.getItem('bm_chat_' + projectId) === id) localStorage.removeItem('bm_chat_' + projectId); } catch {}
    ++state.viewSeq; ++state.projectSeq; state.sessions = state.sessions.filter(chat => chat.id !== id); state.chat = null; state.loading = false;
    restoreDraft(chatKey(projectId)); renderChat(); closeConversationOptions(); error(''); workspace.refreshActivity();
    toast(native ? 'Conversation supprimée du compagnon. L’original reste dans Bionic.' : 'Conversation supprimée.');
    $('prompt').focus();
    try { await loadSessions(); } catch { if (epoch === state.authEpoch && state.authenticated) toast('Conversation supprimée. Actualise la liste après reconnexion au PC.'); }
  } catch (failure) { if (epoch === state.authEpoch && state.authenticated) conversationActionError('delete', failure); }
  finally { conversationMove.busy = false; conversationMove.action = null; setSending(); scheduleRecovery(); if (committed && epoch === state.authEpoch && state.authenticated) $('prompt').focus(); }
}
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
async function api(route, options = {}) {
  const r = await fetch(route, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const j = await r.json().catch(() => ({ error: 'Réponse du serveur illisible.' }));
  if (r.status === 401) hidePrivateViews();
  if (!r.ok) throw Object.assign(new Error(j.error || `Le serveur ne répond pas (HTTP ${r.status}).`), { status: r.status });
  return j;
}
function shortDate(time) { if (!time) return ''; return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(time)); }
function modelForChat() {
  const current = state.chat?.model;
  const list = state.status?.models || [];
  return list.find(m => m.id === current)?.id || list.find(m => m.id === $('model').value)?.id || list.find(m => m.loaded)?.id || list[0]?.id || '';
}
function setModels() {
  const previous = $('model').value;
  $('model').replaceChildren();
  const list = state.status?.models || [];
  if (!list.length) $('model').append(new Option('Aucun modèle local disponible', ''));
  for (const m of list) $('model').append(new Option(`${m.loaded ? 'Chargé · ' : ''}${m.name}${m.vision ? ' · Vision' : ''}`, m.id));
  $('model').value = list.find(m => m.id === draftForView().model)?.id || list.find(m => m.id === previous)?.id || list.find(m => m.id === state.chat?.model)?.id || list.find(m => m.loaded)?.id || list[0]?.id || '';
  setEffort();
  setSending(state.sending);
}
function setEffort() {
  const model = (state.status?.models || []).find(item => item.id === $('model').value);
  const capability = model?.reasoning;
  const choices = capability?.allowedOptions || [];
  const stored = state.draftReasoning[model?.id] ?? state.chat?.reasoningByModel?.[model?.id] ?? 'default';
  const valid = stored === 'default' || choices.includes(stored);
  $('effort').replaceChildren(new Option(capability?.default ? `Par défaut (${EFFORT_LABELS[capability.default]})` : 'Par défaut', 'default'));
  for (const choice of choices) $('effort').append(new Option(EFFORT_LABELS[choice] || choice, choice));
  $('effort').value = valid ? stored : 'default';
  $('effort').disabled = !choices.length || state.loading || !!modelPanel.unloading;
  const binary = choices.length && choices.every(choice => choice === 'on' || choice === 'off');
  setText($('effort-help'), !valid ? 'Le niveau précédemment choisi n’est plus disponible. Le réglage par défaut sera utilisé.' : !choices.length ? 'Ce modèle ne propose pas de réglage d’effort par l’API.' : binary ? 'Ce modèle permet d’activer ou de désactiver le raisonnement, sans niveaux intermédiaires.' : 'Niveau de raisonnement appliqué au prochain message.');
}
async function checkStatus() {
  state.status = await api('/api/status');
  $('status').textContent = state.status.ok ? 'Bionic connecté' : 'API Bionic indisponible';
  $('status').className = 'status ' + (state.status.ok ? 'online' : 'offline');
  if (!state.status.ok) error(state.status.apiError);
  setModels();
}
function modelError(message) { $('models-error').textContent = message || ''; $('models-error').hidden = !message; }
function renderLoadedModels() {
  const instances = modelPanel.models.flatMap(model => model.loadedInstances.map(instance => ({ ...instance, model })));
  const locked = modelPanel.loading || !!modelPanel.unloading;
  $('models-refresh').disabled = locked;
  $('models-summary').textContent = modelPanel.loading ? 'Actualisation…' : `${instances.length} instance${instances.length > 1 ? 's' : ''} en mémoire`;
  $('models-list').setAttribute('aria-busy', String(locked));
  $('models-list').replaceChildren();
  if (!instances.length && !modelPanel.loading) $('models-list').append(node('p', 'models-empty', 'Aucun modèle n’est actuellement chargé. Le modèle choisi sera chargé à la demande lors d’un envoi.'));
  for (const instance of instances) {
    const row = node('section', 'loaded-model');
    const details = node('div', 'loaded-model-details');
    details.append(node('h3', '', instance.model.name));
    const type = instance.model.type === 'embedding' ? 'Indexation de documents' : instance.model.type === 'decision' ? 'Modèle de décision' : 'Conversation';
    let detail = type + (instance.contextLength ? ` · Contexte : ${new Intl.NumberFormat('fr-FR').format(instance.contextLength)} tokens` : '');
    details.append(node('p', 'loaded-model-meta', detail));
    if (instance.model.loadedInstances.length > 1) details.append(node('p', 'loaded-model-id', instance.id));
    const button = node('button', 'unload-button', modelPanel.unloading === instance.id ? 'Déchargement…' : 'Décharger');
    button.type = 'button'; button.disabled = locked || anyGeneration() || modelPanel.generationActive;
    button.setAttribute('aria-label', 'Décharger ' + instance.model.name + (instance.model.loadedInstances.length > 1 ? ' — ' + instance.id : ''));
    button.addEventListener('click', () => unloadModel(instance.id));
    row.append(details, button); $('models-list').append(row);
  }
  if ((anyGeneration() || modelPanel.generationActive) && !modelPanel.unloading) $('models-summary').textContent += ' · Une réponse est en cours. Le déchargement sera disponible après sa fin.';
}
async function refreshLoadedModels() {
  if (modelPanel.unloading || modelPanel.loading) return;
  modelPanel.loading = true; modelError(''); renderLoadedModels();
  try {
    const response = await api('/api/models'); modelPanel.models = response.models;
    modelPanel.generationActive = response.generationActive;
    state.status = { ...state.status, models: response.models.filter(model => model.type === 'llm'), ok: true, apiError: null };
    setModels();
  } catch (e) { modelError(e.status === 404 ? 'Redémarre le serveur avec Relancer.cmd sur le PC pour activer la gestion des modèles.' : e.message); }
  finally { modelPanel.loading = false; renderLoadedModels(); }
}
function openModels() { if (!$('models-dialog').open) $('models-dialog').showModal(); refreshLoadedModels(); }
async function unloadModel(instanceId) {
  if (modelPanel.unloading || modelPanel.loading || anyGeneration() || modelPanel.generationActive) return;
  modelPanel.unloading = instanceId; modelError(''); renderLoadedModels(); setSending(state.sending);
  try {
    const result = await api('/api/models/unload', { method: 'POST', body: JSON.stringify({ instanceId }) });
    modelPanel.models = result.models;
    state.status = { ...state.status, models: result.models.filter(model => model.type === 'llm') };
    setModels();
    if (result.unloaded) toast('Modèle déchargé de la mémoire.');
    else modelError('L’instance est de nouveau chargée. Une autre session peut l’avoir rechargée.');
  } catch (e) { modelError(e.message); }
  finally { modelPanel.unloading = null; renderLoadedModels(); setSending(state.sending); }
}
async function loadProjects() {
  const epoch = state.authEpoch, revision = conversationMove.revision;
  const j = await api('/api/projects');
  if (epoch !== state.authEpoch || revision !== conversationMove.revision || !state.authenticated) return;
  state.projects = j.projects;
  const previous = state.projectId || localStorage.getItem('bm_project');
  state.projectId = j.projects.some(p => p.id === previous) ? previous : j.projects[0]?.id;
  $('project').replaceChildren();
  for (const p of j.projects) $('project').append(new Option(p.name, p.id));
  if (state.projectId) { $('project').value = state.projectId; await loadSessions(); }
  else $('sessions').replaceChildren(node('p', 'list-empty', 'Aucun projet Bionic trouvé. Crée un projet dans Bionic puis actualise.'));
  setSending(false);
}
async function loadSessions() {
  const seq = ++state.projectSeq, epoch = state.authEpoch, revision = conversationMove.revision, pid = state.projectId;
  sessionSignature = ''; $('sessions').replaceChildren(node('p', 'loading-label', 'Chargement des conversations…'));
  if (!pid) return;
  const j = await api('/api/sessions?projectId=' + encodeURIComponent(pid));
  if (seq !== state.projectSeq || epoch !== state.authEpoch || revision !== conversationMove.revision || pid !== state.projectId || !state.authenticated) return;
  state.sessions = j.sessions; state.sessionsPartial = !!j.partial; state.sessionWarnings=j.warnings||[]; renderSessions(); localStorage.setItem('bm_project', pid);
}
function renderSessions() {
  const search = $('search').value.toLocaleLowerCase('fr');
  const pending = [...jobs.values()].filter(job => job.projectId === state.projectId && !job.id).map(job => ({ id: 'pending:' + job.requestId, name: job.chat?.name || 'Envoi au PC…', source: 'web', generation: { status: 'running' }, pending: job }));
  const filtered = [...pending, ...state.sessions].filter(s => s.name.toLocaleLowerCase('fr').includes(search));
  setText($('session-count'), String(filtered.length));
  const signature = JSON.stringify({ search, project:state.projectId, current:state.chat?.id, uploading:state.uploading, partial:state.sessionsPartial, warnings:state.sessionWarnings, rows:filtered.map(x=>[x.id,x.name,x.updatedAt,x.source,x.origin,x.generation,x.queueCount]), jobs:[...jobs.values()].map(x=>[x.requestId,x.projectId,x.id,x.status]) });
  if (signature === sessionSignature) return;
  sessionSignature = signature;
  const focused = document.activeElement?.closest('.session'), focusedId = focused?.dataset.sessionId, focusedIndex = focused ? [...$('sessions').querySelectorAll('.session')].indexOf(focused) : -1;
  $('sessions').replaceChildren();
  if (state.sessionsPartial) $('sessions').append(node('p','partial-warning',(state.sessionWarnings.map(w=>w.message).join(' ')||'Inventaire partiel : au moins une conversation est illisible sur le PC. Les autres restent accessibles.')));
  if (!filtered.length) { if(focusedId)$('search').focus();document.title='Bionic · compagnon local';$('sessions').append(node('p', 'list-empty', search ? 'Aucune conversation pour cette recherche.' : 'Aucune conversation dans ce projet. Commence un nouveau chat web.')); return; }
  for (const s of filtered) {
    observeGeneration(s, state.projectId);
    const button = node('button', 'session'); button.dataset.sessionId = s.id; button.type = 'button'; button.disabled = state.uploading;
    button.setAttribute('aria-current', String(s.pending ? state.viewKey === s.pending.viewKey : state.chat?.id === s.id));
    button.append(node('span', 'session-name', s.name));
    const active = [...jobs.values()].filter(job => job.projectId === state.projectId && job.id === s.id);
    const queued = Math.max(s.queueCount || s.queue?.filter(item => item.status === 'queued').length || 0, active.filter(job => job.status === 'queued').length);
    const running = s.generation?.status === 'running' || active.some(job => job.status !== 'queued');
    const label = s.generation?.awaitingApproval ? 'À valider' + (queued ? ' · '+queued+' en attente' : '') : running ? 'Réponse en cours' + (queued ? ` · ${queued} en attente` : '') : queued ? `${queued} en attente` : s.source === 'web' ? (s.origin?.kind==='fork' ? 'Branche' : s.origin ? 'Suite web' : 'Chat web') : 'Bionic';
    button.classList.toggle('session-active', running || queued > 0);
    const meta = node('span', 'session-meta'); meta.append(node('span', s.source === 'web' ? 'web-label' : '', label), node('span', '', shortDate(s.updatedAt)));
    button.append(meta); button.addEventListener('click', () => {
      if (s.pending) {
        saveDraft(); ++state.viewSeq; state.loading = false; state.chat = s.pending.chat || { name: s.name, source: 'web', messages: [] };
        restoreDraft(s.pending.viewKey); $('app').classList.add('thread-open'); renderChat();
      } else openChat(s.id).then(()=>{if(s.generation?.awaitingApproval)focusReply(s.generation.replyId);}).catch(e => error(e.message));
    }); $('sessions').append(button);
  }
  const waiting = state.sessions.filter(x=>x.generation?.awaitingApproval).length; document.title = (waiting ? waiting+' à valider · ' : '')+'Bionic · compagnon local';
  if (focusedId) { const buttons=[...$('sessions').querySelectorAll('.session')]; (buttons.find(x=>x.dataset.sessionId===focusedId)||buttons[Math.min(focusedIndex,buttons.length-1)]||$('search')).focus({preventScroll:true}); }
}
function inlineText(el, text) {
  // Only our own DOM nodes are created. Source messages never become HTML.
  const rx = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
  let end = 0;
  for (const match of text.matchAll(rx)) {
    el.append(document.createTextNode(text.slice(end, match.index)));
    const token = match[0];
    if (token[0] === '`') el.append(node('code', '', token.slice(1, -1)));
    else if (token.startsWith('**')) el.append(node('strong', '', token.slice(2, -2)));
    else { const link = /^\[([^\]]+)\]\((.+)\)$/.exec(token); const a = node('a', '', link[1]); a.href = link[2]; a.target = '_blank'; a.rel = 'noopener noreferrer'; el.append(a); }
    end = match.index + token.length;
  }
  el.append(document.createTextNode(text.slice(end)));
}
function renderText(container, text) {
  container.replaceChildren();
  const chunks = text.split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g);
  for (const chunk of chunks) {
    if (!chunk) continue;
    if (chunk.startsWith('```')) { const pre = node('pre'); pre.append(node('code', '', chunk.slice(chunk.indexOf('\n') + 1).replace(/```$/, '').trimEnd())); container.append(pre); continue; }
    for (const paragraph of chunk.split(/\n\s*\n/)) {
      if (!paragraph.trim()) continue;
      const heading = /^(#{1,4})\s+(.+)$/.exec(paragraph.trim());
      if (heading) { const h = node(heading[1].length <= 2 ? 'h2' : 'h3'); inlineText(h, heading[2]); container.append(h); }
      else if (paragraph.split('\n').every(line => /^\s*[-*]\s/.test(line))) { const list = node('ul'); for (const line of paragraph.split('\n')) { const li = node('li'); inlineText(li, line.replace(/^\s*[-*]\s+/, '')); list.append(li); } container.append(list); }
      else { const p = node('p'); inlineText(p, paragraph); container.append(p); }
    }
  }
}
function addFileAction(article, action, message) {
  const foreignProject = action.projectId && action.projectId !== state.projectId;
  let log = article.querySelector('.actions-log');
  if (!log) { log = node('details', 'actions-log'); log.append(node('summary', '', 'Actions sur les fichiers'), node('div', 'action-rows')); article.append(log); }
  const row = node('div', 'action-row' + (action.ok ? '' : ' action-failed'));
  row.append(node('strong', '', action.ok || action.name==='run_project_script' ? action.message : 'Action en erreur'), node('span', '', (action.path||'')+(action.destination?' vers '+action.destination:'')));
  for(const source of action.webResults || (action.url?[{title:action.url,url:action.url}]:[])){
    try{const url=new URL(source.url);if(!['https:','http:'].includes(url.protocol))continue;const link=node('a','tool-source',action.name==='read_web_page'?'Page source · '+url.host:source.title||source.url);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';row.append(link);}catch{}
  }
  if(action.outbound){const sent=node('details','outbound-receipt');sent.append(node('summary','','Données envoyées au web'),node('p','','Hôte : '+(action.outbound.host||'moteur configuré')),node('pre','',JSON.stringify(action.outbound,null,2)));row.append(sent);}
  if(action.stdout||action.stderr){const output=node('details','tool-output');output.append(node('summary','','Sortie du script'),node('pre','',(action.stdout||'')+(action.stderr?'\n'+action.stderr:'')));row.append(output);}
  if(!foreignProject&&action.ok&&action.trashId){const restore=node('button','file-action restore-action',action.restored?'Fichier restauré':'Restaurer le fichier');restore.type='button';restore.disabled=state.sending||!!action.restored;if(action.restored)restore.dataset.restored='true';restore.addEventListener('click',async()=>{restore.disabled=true;try{await api('/api/file/restore-trash',{method:'POST',body:JSON.stringify({projectId:state.projectId,chatId:state.chat.id,actionId:action.id})});action.restored=true;restore.textContent='Fichier restauré';restore.dataset.restored='true';}catch(e){error(e.message);restore.disabled=false;}});row.append(restore);}
  if (!action.ok) row.append(node('p', '', action.executed ? 'Ce script a été exécuté : des changements peuvent déjà avoir été enregistrés sur le PC.' : action.message));
  if (action.ok && /^(?:replace_project_text|write_project_file)$/.test(action.name)) log.open = true;
  if (foreignProject) row.append(node('span', 'action-origin', 'Action du projet d’origine ; ses fichiers sont restés dans ce projet.'));
  if (!foreignProject && action.ok && /^(?:replace_project_text|write_project_file)$/.test(action.name) && message) {
    const pin = workspace.pinControl(message, state.chat, action); if (pin) row.append(pin);
  }
  if (!foreignProject && action.backupId && action.hash && message) {
    const compare=node('button','file-action','Comparer la modification'); compare.type='button';compare.addEventListener('click',async()=>{compare.disabled=true;try{const result=await api('/api/files/action-diff',{method:'POST',body:JSON.stringify({projectId:state.projectId,sessionId:state.chat.id,messageId:message.id,actionId:action.id})});const view=node('details','passive-diff');view.open=true;view.append(node('summary','',result.label||'Comparaison vérifiée'));if(result.status!=='comparable')view.append(node('p','','Version ultérieure : ce fichier ne prouve plus les changements exacts de cette action. Aucun diff historique présenté.'));else{const before=result.before.text.split(/\r?\n/),after=result.after.text.split(/\r?\n/),lines=[];const maximum=Math.min(2000,Math.max(before.length,after.length));for(let i=0;i<maximum;i++){if(before[i]===after[i])lines.push('  '+(before[i]??''));else{if(before[i]!==undefined)lines.push('− '+before[i]);if(after[i]!==undefined)lines.push('+ '+after[i]);}}view.append(node('p','','Comparaison des lignes à la même position (− avant, + après). Aucun changement appliqué.'),node('pre','',lines.join('\n')));if(maximum<Math.max(before.length,after.length))view.append(node('p','','Aperçu limité aux 2 000 premières lignes.'));}row.querySelector('.passive-diff')?.remove();row.append(view);}catch(e){error(e.message);}finally{compare.disabled=false;}});row.append(compare);
  }
  if (!foreignProject && action.backupId && action.hash) {
    const restore = node('button', 'file-action restore-action', action.restored ? 'Version précédente rétablie' : 'Rétablir la version précédente'); restore.type = 'button';
    if (action.restored) restore.dataset.restored = 'true';
    restore.disabled = state.sending || state.loading || state.uploading || !!action.restored;
    restore.addEventListener('click', async () => {
      restore.disabled = true;
      try {
        await api('/api/file/restore', { method: 'POST', body: JSON.stringify({ projectId: state.projectId, rootId: 'project', path: action.path, hash: action.hash, backupId: action.backupId, chatId: state.chat?.id, actionId: action.id }) });
        action.restored = true; restore.dataset.restored = 'true'; restore.textContent = 'Version précédente rétablie'; toast('La version précédente a été rétablie sur le PC.');
      } catch (e) { error(e.message); restore.disabled = false; }
    });
    row.append(restore);
  }
  log.querySelector('.action-rows').append(row);
  log.querySelector('summary').textContent = 'Actions de l’agent · ' + log.querySelectorAll('.action-row').length;
}
function addToolApproval(article,approval,chat) {
  const web=approval.kind==='web', panel=node('section','tool-approval');panel.dataset.approvalId=approval.id;
  panel.append(node('h3','',web?'Envoi web à valider':'Script à valider'));
  if(web){const preview=node(approval.status==='pending'?'div':'details','web-approval-preview');if(approval.status!=='pending')preview.append(node('summary','','Afficher la requête exacte'));preview.append(node('pre','',JSON.stringify({tool:approval.tool,...approval.parameters},null,2)));panel.append(node('p','tool-approval-meta','Hôte : '+approval.host),preview,node('p','tool-approval-scope','Ton accord concerne uniquement cette requête exacte. Les recherches suivantes demanderont un nouvel accord. Ce réglage ne limite pas le réseau d’un script approuvé.'));}
  else panel.append(node('p','tool-approval-meta',(approval.runtime||'Script')+' · '+(approval.cwd||approval.directory||'Dossier du projet')),node('pre','',approval.code||''),node('p','tool-approval-scope','Ce script s’exécute avec les droits de ton compte sur le PC. Il peut agir au-delà du dossier du projet ; ses modifications ne sont pas toutes annulables.'));
  const labels={pending:'En attente de ton accord.',approved:'Autorisé.',denied:web?'Refusé : aucun envoi web effectué.':'Refusé : aucun script exécuté.',expired:web?'Validation expirée : aucun envoi web effectué.':'Validation expirée : aucun script exécuté.',cancelled:'Validation annulée.'};
  panel.append(node('p','tool-approval-status',approval.executionStatus==='interrupted'?'Exécution interrompue : vérifie les fichiers.':approval.executionStatus||labels[approval.status]||approval.status));
  if(approval.status==='pending'&&Date.now()<approval.expiresAt){const controls=node('div','workspace-actions');for(const [decision,label]of [['approve',web?'Autoriser cet envoi':'Exécuter ce script'],['deny','Refuser']]){const button=node('button',decision==='approve'?'file-save':'file-action',label);button.type='button';button.dataset.workspaceFocus='approval:'+approval.id+':'+decision;button.addEventListener('click',async()=>{controls.querySelectorAll('button').forEach(x=>x.disabled=true);try{const result=await api('/api/tool-approval',{method:'POST',body:JSON.stringify({id:approval.id,projectId:chat.projectId,chatId:chat.id,decision})});approval.status=result.status;await recoverReplies();renderChat();}catch(e){error(e.message);controls.querySelectorAll('button').forEach(x=>x.disabled=false);}});controls.append(button);}panel.append(controls);}
  article.append(panel);
}

function groupMessageExtras(article, message, role) {
  const auxiliary = [...article.children].filter(child => child.matches('.actions-log,.message-fork,.message-metrics,.context-receipt,.pin-control,.message-effort'));
  const failed = (message.actions || []).some(action => action.ok === false);
  const grouped = auxiliary.filter(child => {
    if (!failed || !child.matches('.actions-log') || !child.querySelector('.action-rows')) return true;
    child.classList.add('action-warning');
    child.querySelector('summary').textContent = 'Action de l’agent en erreur · ' + (message.actions || []).filter(action => action.ok === false).length;
    return false;
  });
  if (!grouped.length) return;
  const details = node('details', 'message-extras'); details.dataset.disclosureKey = 'message-extras';
  const summary = node('summary'); summary.dataset.workspaceFocus = 'message-extras:' + (message.id || message.localRequestId || message.requestId || '');
  if (message.role === 'user') { summary.append(icon('more'), node('span','sr-only','Actions de ce message')); summary.title = 'Actions de ce message'; }
  else summary.append(document.createTextNode('Détails et actions'));
  const content = node('div','message-extras-content');
  for (const child of grouped) { if (!child.dataset.disclosureKey) child.dataset.disclosureKey = child.classList[0]; content.append(child); }
  details.append(summary, content);
  details.addEventListener('keydown', event => { if (event.key === 'Escape' && details.open) { event.preventDefault(); details.open = false; summary.focus({preventScroll:true}); } });
  if (message.role === 'user') details.addEventListener('focusout', event => { if (event.relatedTarget && !details.contains(event.relatedTarget)) details.open = false; });
  if (message.role === 'user') role.append(details); else article.append(details);
}
function addMessage(message) {
  const article = node('article', 'message ' + message.role);
  if (message.id) { article.dataset.messageId = message.id; article.tabIndex = -1; }
  if (message.requestId || message.localRequestId) article.dataset.requestId = message.requestId || message.localRequestId;
  article.dataset.messageKey = (message.requestId || message.localRequestId) ? (message.requestId || message.localRequestId) + '-' + message.role : message.id || '';
  const role = node('div', 'message-role', message.role === 'user' ? 'Toi' : 'Assistant');
  if (message.fromBionic) role.append(node('span', 'origin-tag', 'historique Bionic'));
  else if(message.fromFork)role.append(node('span','origin-tag','copié du fil source'));
  const content = node('div', 'message-body'); renderText(content, message.text || '');
  article.append(role, content);
  if (message.attachments?.length) {
    const files = node('div', 'message-attachments');
    for (const file of message.attachments) {
      const details = node('details'); details.append(node('summary', '', file.name + (file.excerpt ? ' · extrait joint' : ' · fichier joint')));
      if (file.kind === 'image') { const image = node('img', 'message-image'); image.alt = file.name; image.loading = 'lazy'; image.src = '/api/attachment-image?' + new URLSearchParams({ hash: file.hash, mime: file.mime }); details.append(image); }
      else details.append(node('pre', '', file.text));
      files.append(details);
    }
    article.append(files);
  }
  for (const intent of message.mutationIntents || []) if (intent.status === 'uncertain' || intent.status === 'pending') {
    const warning=node('div','mutation-warning'); warning.append(node('strong','','Opération à vérifier'),node('p','',intent.tool+(intent.path?' · '+intent.path:'')),node('p','',intent.message||'Le résultat de cette opération n’est pas confirmé. Aucun succès n’est déduit et aucune action ne sera rejouée.'));
    for(const copy of intent.backupCandidates||[]) { const a=node('a','file-action','Télécharger une copie antérieure vérifiée');a.href='/api/files/backup/download?'+new URLSearchParams({projectId:state.projectId,backupId:copy.id});a.download='';warning.append(a); }
    article.append(warning);
  }
  for (const action of message.actions || []) addFileAction(article, action, message);
  for(const approval of message.approvals||[])addToolApproval(article,approval,state.chat);
  if(message.historicalActions?.length){const history=node('details','actions-log');history.append(node('summary','','Actions dans la conversation source · '+message.historicalActions.length));for(const action of message.historicalActions)history.append(node('p','message-footer',(action.message||action.name||'Action')+(action.path?' · '+action.path:'')));article.append(history);}
  if(message.id&&!(message.role==='assistant'&&(message.complete===false||state.chat?.generation?.status==='running'&&state.chat.generation.replyId===message.id))){const fork=node('button','message-fork','Créer une branche depuis ici');fork.type='button';fork.addEventListener('click',()=>forkChat(message.id));article.append(fork);}
  const footer = [];
  if (message.reasoning && EFFORT_LABELS[message.reasoning]) article.append(node('p', 'message-footer message-effort', 'Effort : ' + EFFORT_LABELS[message.reasoning].toLocaleLowerCase('fr')));
  if (message.interrupted || message.limited) footer.push(message.interrupted ? 'Réponse interrompue.' : 'Limite de réponse atteinte. Tu peux demander de continuer.');
  if (footer.length) article.append(node('p', 'message-footer', footer.join(' · ')));
  if (message.metrics && message.role === 'assistant') {
    const m = message.metrics;
    const number = value => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value);
    const rate = Number.isFinite(m.tokensPerSecond) && m.tokensPerSecond > 0;
    const summary = [];
    if (rate) summary.push((m.rateSource === 'observed' ? '≈ ' : '') + number(m.tokensPerSecond) + ' tokens/s');
    if (Number.isSafeInteger(m.outputTokens)) summary.push(number(m.outputTokens) + ' tokens générés');
    if (summary.length) {
      const details = node('details', 'message-metrics');
      details.append(node('summary', '', summary.join(' · ')));
      const explanations = [];
      if (rate) explanations.push(m.rateSource === 'observed' ? 'Débit approché sur le flux reçu, hors attente initiale. Il inclut le raisonnement transmis.' : 'Débit de génération communiqué par Bionic.');
      if (Number.isFinite(m.firstFragmentSeconds)) explanations.push('Premier fragment reçu après ' + number(m.firstFragmentSeconds) + ' s.');
      if (Number.isFinite(m.responseSeconds)) explanations.push('Durée totale : ' + number(m.responseSeconds) + ' s.');
      if (Number.isSafeInteger(m.inputTokens)) explanations.push((m.generationPhases > 1 ? 'Tokens traités en entrée : ' : 'Contexte transmis : ') + number(m.inputTokens) + ' tokens.');
      if (m.generationPhases > 1) explanations.push(m.generationPhases + ' étapes de génération, avec les appels d’outils.');
      if (m.reasoningTokens > 0) explanations.push('Dont raisonnement : ' + number(m.reasoningTokens) + ' tokens générés.');
      if (!rate) explanations.push('Débit indisponible pour cette réponse.');
      details.append(node('p', '', explanations.join(' '))); article.append(details);
    }
  }
  if (message.role === 'assistant') {
    article.append(workspace.contextControl(message));
    const running = state.chat?.generation?.status === 'running' && (state.chat.generation.replyId === message.id || (message.requestId || message.localRequestId) === state.chat.generation.requestId);
    if (!running && message.text) { const pin = workspace.pinControl(message, state.chat); if (pin) article.append(pin); }
  }
  groupMessageExtras(article, message, role);
  $('messages').append(article); return content;
}
function scrollBottom() { $('messages').scrollTop = $('messages').scrollHeight; }
function renderQueue(chat) {
  const queue = [...(chat?.queue || []).filter(item => ['queued', 'interrupted', 'error'].includes(item.status)), ...(draftForView().failed || [])];
  for (const job of currentJobs()) {
    if (job.payload && !chat?.messages?.some(message => message.requestId === job.requestId) && !queue.some(item => item.requestId === job.requestId)) queue.push({ ...job.payload, status: job.status === 'submitting' ? 'submitting' : 'queued' });
  }
  for (const item of queue) {
    const article = node('article', 'message queued-message');
    const interrupted = item.status === 'interrupted' || item.status === 'error', submitting = item.status === 'submitting';
    article.append(node('div', 'message-role', interrupted ? 'Message non exécuté · à reprendre' : submitting ? 'Envoi au PC…' : 'Message en attente'));
    const content = node('div', 'message-body'); renderText(content, item.text || ''); article.append(content);
    if (item.attachments?.length) article.append(node('p', 'message-footer', item.attachments.length + ' fichier' + (item.attachments.length > 1 ? 's joints' : ' joint')));
    const actions = node('div', 'queue-actions');
    if (interrupted) {
      const reuse = node('button', 'file-action', 'Reprendre dans le brouillon'); reuse.type = 'button';
      reuse.addEventListener('click', () => {
        if ($('prompt').value.trim() || fileBrowser.snapshot().length) return toast('Ton brouillon contient déjà un message. Envoie-le ou efface-le avant de reprendre celui-ci.');
        $('prompt').value = item.text || ''; $('model').value = item.model || $('model').value;
        const sameProject = !item.projectId || item.projectId === state.projectId;
        state.draftReasoning[$('model').value] = item.reasoning || 'default'; state.draftFileProfile = sameProject && !unassignedProject() ? fileProfile(item,'none') : 'none'; $('agent-files').value = state.draftFileProfile; state.draftWebApproval = item.webApproval === true; $('agent-web-approval').checked = state.draftWebApproval;
        state.draftWebAccess = item.webAccess === true; state.draftScriptAccess = sameProject && !unassignedProject() && item.scriptAccess === true;
        $('agent-web').checked = state.draftWebAccess; $('agent-scripts').checked = state.draftScriptAccess;
        const references = sameProject ? item.attachmentReferences || item.attachments || [] : [];
        if (!sameProject && item.attachments?.length) toast('Le texte est repris. Rejoins ses fichiers depuis le projet courant.');
        fileBrowser.restore(references.map(reference => ({ ...reference, name: item.attachments?.find(file => file.path === reference.path && file.rootId === reference.rootId)?.name || reference.name })));
        saveDraft(); setEffort(); $('prompt').focus();
        if (item.local) { const draft = draftForView(); draft.failed = (draft.failed || []).filter(failed => failed.requestId !== item.requestId); rememberDrafts(); renderChat(); }
      }); actions.append(reuse);
    } else if (!submitting) {
      const remove = node('button', 'file-action', 'Retirer de la file'); remove.type = 'button';
      const target = { projectId: state.projectId, id: chat?.id, requestId: item.requestId };
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { await api('/api/cancel', { method: 'POST', body: JSON.stringify(target) }); await recoverReplies(); }
        catch (e) { toast(e.message); remove.disabled = false; }
      }); actions.append(remove);
    }
    article.append(actions); $('messages').append(article);
  }
}
function renderChat() {
  const chat = state.chat, project = state.projects.find(p => p.id === state.projectId);
  const expanded = new Set();
  for (const article of $('messages').querySelectorAll('.message[data-message-key]')) article.querySelectorAll('details').forEach((detail, index) => { if (detail.open) expanded.add(article.dataset.messageKey + ':' + (detail.dataset.disclosureKey || index)); });
  const focus = document.activeElement?.dataset.workspaceFocus;
  const selection = focus && typeof document.activeElement.selectionStart === 'number' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  $('agent-files').value = unassignedProject() ? 'none' : state.draftFileProfile ?? fileProfile(chat);
  $('agent-web-approval').checked = state.draftWebApproval ?? chat?.webApproval ?? false;
  $('agent-web').checked = state.draftWebAccess ?? chat?.webAccess ?? false;
  $('agent-scripts').checked = unassignedProject() ? false : state.draftScriptAccess ?? chat?.scriptAccess ?? false;
  $('thread-title').textContent = chat?.name || 'Nouveau chat web';
  $('thread-subtitle').textContent = (project?.name || 'Projet') + (chat?.source === 'bionic' ? ' · historique Bionic' : ' · conversation web');
  $('banner').hidden = false;
  let banner = chat?.source === 'bionic' ? 'Cet historique est lu depuis Bionic. Ton prochain message créera une suite web, conservée ici.' : chat?.origin?.kind==='fork' ? 'Branche indépendante de « '+chat.origin.name+' ». Aucun outil ni message n’a été rejoué.' : chat?.origin ? 'Suite web de « ' + chat.origin.name + ' ». Les nouveaux messages ne sont pas synchronisés vers Bionic.' : 'Ce chat est conservé dans le compagnon web sur ce PC.';
  if (chat?.truncated || chat?.importedTruncated) banner += ' Historique long : seule la partie récente est disponible.';
  if (chat?.omitted?.attachments) banner += ' Les pièces jointes ne sont pas affichées.';
  if (chat?.model && !(state.status?.models || []).some(m => m.id === chat.model)) banner += ' Le modèle d’origine n’est pas disponible sous le même nom dans l’API : vérifie le modèle sélectionné avant d’envoyer.';
  $('banner').replaceChildren(document.createTextNode(banner));
  if(chat?.origin){$('banner').append(node('span','',' Fichiers du projet partagés. '));const source=node('button','source-link','Voir la conversation source');source.type='button';source.addEventListener('click',()=>visitSource(chat.origin,source));$('banner').append(source);}
  $('messages').replaceChildren();
  if (chat?.messages?.length) for (const m of chat.messages) {
    const body = addMessage(m);
    if (m.role === 'assistant' && !m.text && chat.generation?.status === 'running' && (m.requestId === chat.generation.requestId || m.localRequestId === chat.generation.requestId)) body.textContent = 'Le modèle prépare sa réponse sur le PC…';
  }
  else { const empty = node('div', 'welcome'); empty.append(node('h2', '', 'Commence une nouvelle idée.'), node('p', '', 'Le modèle local répondra à partir de tes messages et des fichiers que tu choisis de joindre.')); $('messages').append(empty); }
  renderQueue(chat);
  for (const article of $('messages').querySelectorAll('.message[data-message-key]')) article.querySelectorAll('details').forEach((detail, index) => { if (expanded.has(article.dataset.messageKey + ':' + (detail.dataset.disclosureKey || index))) detail.open = true; });
  if (focus) { const input = [...$('messages').querySelectorAll('[data-workspace-focus]')].find(el => el.dataset.workspaceFocus === focus); if (input) { input.focus({ preventScroll: true }); if (selection) input.setSelectionRange(...selection); } }
  const selectedModel = draftForView().model;
  $('model').value = (state.status?.models || []).some(model => model.id === selectedModel) ? selectedModel : modelForChat();
  setEffort(); scrollBottom(); renderSessions();
  setSending();
}
async function openChat(id) {
  if (state.uploading || conversationMove.busy) return;
  closeConversationOptions();
  saveDraft();
  const seq = ++state.viewSeq, pid = state.projectId;
  state.loading = true; state.chat = chats.get(chatKey(pid, id)) || null; restoreDraft(chatKey(pid, id)); setSending();
  error(''); $('app').classList.add('thread-open');
  $('thread-title').textContent = 'Ouverture de la conversation…';
  $('messages').replaceChildren(node('p', 'loading-label', 'Ouverture de la conversation…'));
  try {
    const chat = await api(`/api/conversation?projectId=${encodeURIComponent(pid)}&id=${encodeURIComponent(id)}`);
    if (seq !== state.viewSeq || pid !== state.projectId) return;
    cacheChat(chat, pid); state.chat = chat; adoptJobs(chat, pid); rememberChat(); renderChat();
  } catch (e) { if (seq === state.viewSeq) { renderChat(); throw e; } }
  finally {
    if (seq === state.viewSeq) {
      state.loading = false; setSending(); scheduleRecovery();
    }
  }
}
function setSending() {
  const active = currentJobs(), unresolved = active.some(job => !job.id);
  const running = state.chat?.generation?.status === 'running' || active.some(job => job.status !== 'queued');
  state.sending = active.length > 0 || running;
  const locked = state.loading || state.uploading || conversationMove.busy || !!modelPanel.unloading;
  $('send').hidden = false; $('stop').hidden = !running || !state.chat?.id;
  $('prompt').disabled = locked;
  $('send').disabled = locked || unresolved || !state.projectId || !state.status?.ok || !state.status?.models?.length;
  $('send').setAttribute('aria-label', state.sending ? 'Ajouter à la file' : 'Envoyer le message');
  $('send').title = state.sending ? 'Ajouter à la file' : 'Envoyer le message';
  $('send').classList.toggle('queue-send', state.sending);
  $('send-label').textContent = state.sending ? 'Ajouter à la file' : '';
  for (const id of ['project', 'new-chat', 'refresh']) $(id).disabled = state.uploading || conversationMove.busy;
  $('model').disabled = locked;
  for (const id of ['files-open-sidebar', 'attach-file', 'upload-file','upload-attach-file']) $(id).disabled = locked || !state.projectId || unassignedProject();
  $('agent-files').disabled = locked || unassignedProject();
  $('fork-chat').disabled = locked || !state.chat?.id;
  $('agent-web').disabled = locked; $('agent-scripts').disabled = locked || unassignedProject();
  $('agent-web-approval').disabled = locked || !$('agent-web').checked;
  $('files-permission-state').textContent = ({none:'Outils fichiers désactivés',read:'Fichiers en lecture',write:'Fichiers modifiables'}[currentFileProfile()]) + ($('agent-web').checked ? ' · Web' : '') + ($('agent-scripts').checked ? ' · Scripts' : '');
  $('logout').disabled = state.uploading || conversationMove.busy;
  document.querySelectorAll('.restore-action').forEach(button => button.disabled = locked || state.sending || button.dataset.restored === 'true');
  $('effort').disabled = locked || !(state.status?.models || []).find(model => model.id === $('model').value)?.reasoning?.allowedOptions.length;
  document.querySelectorAll('.session').forEach(b => b.disabled = state.uploading || conversationMove.busy);
  const queued = Math.max(state.chat?.queue?.filter(item => item.status === 'queued').length || 0, active.filter(job => job.status === 'queued').length);
  $('composer-activity').hidden = !state.sending;
  const activityText = state.chat?.generation?.awaitingApproval ? 'Un outil attend ta validation dans ce chat. Tu peux continuer à écrire.' : unresolved ? 'Envoi au PC… Tu peux préparer ton prochain message.' : (running ? 'Réponse en cours sur le PC.' : '') + (queued ? ` ${queued} message${queued > 1 ? 's' : ''} en attente.` : '') + ' Tu peux écrire ou ouvrir un autre chat.';
  setText($('composer-activity'), activityText);
  $('composer-note').textContent = state.sending ? 'Les messages de ce chat seront traités dans l’ordre. Les réponses continuent si tu quittes le navigateur.' : unassignedProject() ? 'Sans projet : les outils de fichiers sont désactivés.' : currentFileProfile()==='write' ? 'Prochain envoi : lecture ciblée et modifications directes autorisées, avec sauvegardes.' : currentFileProfile()==='read' ? 'Prochain envoi : outils fichiers en lecture seule.' : 'Prochain envoi : outils fichiers désactivés.';
  if($('agent-scripts').checked) $('composer-note').textContent += ' Un script validé peut modifier le PC, y compris hors projet.';
  if($('agent-web').checked) $('composer-note').textContent += ' Les recherches et URL quittent le PC.';
  updateConversationOptions();
  fileBrowser.refresh();
}
function scheduleRecovery() {
  clearTimeout(recoveryTimer);
  if (state.authenticated) recoveryTimer = setTimeout(recoverReplies, jobs.size ? 1500 : 6000);
}
function cacheChat(chat, projectId) {
  observeGeneration(chat, projectId);
  chats.set(chatKey(projectId, chat.id), chat);
  if (projectId === state.projectId) {
    const summary = { ...chat, messages: undefined };
    const index = state.sessions.findIndex(session => session.id === chat.id);
    if (index >= 0) state.sessions[index] = summary; else state.sessions.unshift(summary);
  }
}
function adoptJobs(chat, projectId) {
  const requestId = chat.generation?.requestId || (chat.generation?.status === 'running' ? chat.messages?.findLast(message => message.requestId)?.requestId : null);
  if (requestId && chat.generation?.status === 'running' && !jobs.has(requestId)) jobs.set(requestId, { requestId, projectId, id: chat.id, createdAt: chat.generation.startedAt || Date.now(), status: 'running' });
  for (const item of chat.queue || []) if (item.status === 'queued' && !jobs.has(item.requestId)) jobs.set(item.requestId, { requestId: item.requestId, projectId, id: chat.id, createdAt: item.queuedAt || Date.now(), status: 'queued' });
  rememberJobs();
}
function showChatUpdate(chat, projectId) {
  cacheChat(chat, projectId);
  if (!state.authenticated || projectId !== state.projectId || state.chat?.id !== chat.id || state.loading) { renderSessions(); return; }
  const nearBottom = $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 160;
  const oldScroll = $('messages').scrollTop;
  state.chat = chat; renderChat(); if (!nearBottom) $('messages').scrollTop = oldScroll;
}
async function recoverReplies() {
  if (recoveryBusy || !state.authenticated || conversationMove.busy) return;
  clearTimeout(recoveryTimer);
  if (document.visibilityState === 'hidden') { scheduleRecovery(); return; }
  recoveryBusy = true;
  const epoch = state.authEpoch, revision = conversationMove.revision;
  try {
    const pending = [...jobs.values()];
    const snapshots = new Map();
    await Promise.all(pending.map(async job => {
      try {
        const receipt = await api('/api/chat-request?' + new URLSearchParams({ projectId: job.projectId, requestId: job.requestId }));
        if (epoch !== state.authEpoch || revision !== conversationMove.revision || !state.authenticated) return;
        if (receipt.id) bindJob(job, receipt.id);
        job.status = receipt.status || job.status;
        if (job.id) snapshots.set(chatKey(job.projectId, job.id), { projectId: job.projectId, id: job.id });
        if (!['queued', 'running', 'starting', 'preparing', 'submitting', 'reconnecting'].includes(job.status)) {
          jobs.delete(job.requestId);
          if (receipt.message && job.projectId === state.projectId && job.id === state.chat?.id) error(receipt.message);
        }
      } catch (e) {
        if (epoch !== state.authEpoch || revision !== conversationMove.revision) return;
        if (e.status === 404 && Date.now() - job.createdAt > 15000) {
          jobs.delete(job.requestId);
          if (job.projectId === state.projectId && (job.id === state.chat?.id || job.viewKey === state.viewKey)) error('Le PC n’a pas confirmé cet envoi. Vérifie la conversation avant de le renvoyer.');
        } else if (e.status !== 401 && job.projectId === state.projectId && job.id === state.chat?.id) error('Reconnexion au PC… Les messages ne sont pas renvoyés.');
      }
    }));
    if (epoch !== state.authEpoch || revision !== conversationMove.revision || !state.authenticated) return;
    for (const session of state.sessions) if (session.generation?.status === 'running' || session.queue?.some(item => item.status === 'queued')) snapshots.set(chatKey(state.projectId, session.id), { projectId: state.projectId, id: session.id });
    await Promise.all([...snapshots.values()].map(async target => {
      try {
        const chat = await api('/api/conversation?' + new URLSearchParams(target));
        if (epoch !== state.authEpoch || revision !== conversationMove.revision || !state.authenticated) return;
        adoptJobs(chat, target.projectId); showChatUpdate(chat, target.projectId);
      } catch (e) { if (revision === conversationMove.revision && e.status !== 401 && target.projectId === state.projectId && target.id === state.chat?.id) error(e.message); }
    }));
    if (!pending.length && !snapshots.size && !state.loading) {
      const projectId = state.projectId;
      const response = await api('/api/sessions?projectId=' + encodeURIComponent(projectId));
      if (epoch === state.authEpoch && revision === conversationMove.revision && projectId === state.projectId) { state.sessions = response.sessions; state.sessionsPartial=!!response.partial; state.sessionWarnings=response.warnings||[]; renderSessions(); }
    }
    rememberJobs();
  } catch (e) { if (e.status !== 401 && state.authenticated) $('status').textContent = 'Reconnexion au PC…';
  } finally {
    recoveryBusy = false; if (state.authenticated) { setSending(); renderSessions(); workspace.refreshActivity(); scheduleRecovery(); }
  }
}
function resumeReply() {
  if (document.visibilityState !== 'hidden' && state.authenticated) recoverReplies();
}
function bindJob(job, id, name) {
  if (!id) return;
  const oldKey = job.viewKey, newKey = chatKey(job.projectId, id);
  job.id = id;
  if (oldKey && oldKey !== newKey) {
    if (state.viewKey === oldKey) saveDraft();
    if (drafts.has(oldKey)) { drafts.set(newKey, drafts.get(oldKey)); drafts.delete(oldKey); rememberDrafts(); }
    if (state.viewKey === oldKey) {
      state.viewKey = newKey;
      rememberView();
      if (state.chat) { state.chat.id = id; state.chat.name = name || state.chat.name; cacheChat(state.chat, job.projectId); }
      rememberChat();
    }
  }
  job.viewKey = newKey; rememberJobs();
}
function localChatForJob(job) {
  return chats.get(chatKey(job.projectId, job.id)) || job.chat;
}
function redrawJob(job, full = false) {
  if (!state.authenticated || job.projectId !== state.projectId || (job.id ? state.chat?.id !== job.id : state.viewKey !== job.viewKey)) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    if (!state.authenticated || job.projectId !== state.projectId || (job.id ? state.chat?.id !== job.id : state.viewKey !== job.viewKey)) return;
    const chat = localChatForJob(job); if (!chat) return;
    const article = [...$('messages').querySelectorAll('.message.assistant')].find(message => message.dataset.requestId === job.requestId);
    if (full || !article) { showChatUpdate(chat, job.projectId); return; }
    const reply = replyForJob(chat, job.requestId), body = article.querySelector('.message-body');
    if (!reply || !body) return;
    const nearBottom = $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 160;
    renderText(body, reply.text || 'Le modèle prépare sa réponse sur le PC…'); if (nearBottom) scrollBottom();
  }, 40);
}
async function send(event) {
  event.preventDefault();
  const text = $('prompt').value.trim(); if (!text || state.loading || state.uploading || $('send').disabled) return;
  saveDraft();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const requestId = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  error(''); const data = { requestId, projectId: state.projectId, sessionId: state.chat?.id || null, model: $('model').value, reasoning: $('effort').value, fileAccess: currentFileProfile()!=='none', fileProfile:currentFileProfile(), webApproval:$('agent-web-approval').checked, webAccess:$('agent-web').checked, scriptAccess:$('agent-scripts').checked, text, attachments: fileBrowser.references() };
  const originalDraft = draftForView(), oldKey = state.viewKey;
  const viewKey = data.sessionId ? oldKey : chatKey(data.projectId, 'pending:' + requestId);
  const chat = state.chat || { projectId: data.projectId, name: text.slice(0, 70), source: 'web', messages: [], model: data.model };
  const job = { requestId, projectId: data.projectId, id: data.sessionId, viewKey, createdAt: Date.now(), status: 'submitting', payload: data, chat, controller: new AbortController(), epoch: state.authEpoch };
  jobs.set(requestId, job); rememberJobs();
  drafts.set(oldKey, { ...originalDraft, text: '', attachments: [], uploadStatus: '' });
  if (oldKey !== viewKey) drafts.set(viewKey, { ...originalDraft, text: '', attachments: [], uploadStatus: '' });
  state.chat = chat; restoreDraft(viewKey); rememberDrafts();
  $('app').classList.add('thread-open');
  renderChat(); scheduleRecovery();
  let rejected = false, replyText = '';
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: job.controller.signal });
    if (!r.ok) {
      const j = await r.json(); rejected = r.status !== 409 || !/déjà.*reçu/i.test(j.error || '');
      if (rejected) jobs.delete(requestId);
      if (r.status === 401) hidePrivateViews();
      throw new Error(j.error || 'Le modèle ne peut pas répondre.');
    }
    const reader = r.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const e = JSON.parse(line);
        if (job.epoch !== state.authEpoch || !state.authenticated) return;
        if (e.contextReceipt) { const reply = replyForJob(localChatForJob(job), requestId); if (reply) reply.contextReceipt = e.contextReceipt; }
        if (e.type === 'start' || e.type === 'queued') {
          bindJob(job, e.id, e.name); job.status = e.type === 'queued' ? 'queued' : 'running';
          const current = localChatForJob(job);
          current.id = e.id; current.name = e.name || current.name; current.source = 'web'; current.model = data.model;
          current.reasoningByModel = { ...current.reasoningByModel, [data.model]: e.reasoning || data.reasoning }; current.fileAccess = e.fileAccess ?? data.fileAccess; current.fileProfile = e.fileProfile ?? data.fileProfile; current.webApproval=e.webApproval??data.webApproval;
          current.webAccess=e.webAccess??data.webAccess;current.scriptAccess=e.scriptAccess??data.scriptAccess;
          if (e.type === 'start') {
            current.messages ||= [];
            if (!current.messages.some(message => message.requestId === requestId)) current.messages.push({ role: 'user', id: e.contextReceipt?.current?.messageId, text, requestId });
            const existingReply = replyForJob(current, requestId);
            if (existingReply) { existingReply.id ||= e.replyId; existingReply.contextReceipt = e.contextReceipt || existingReply.contextReceipt; }
            else current.messages.push({ role: 'assistant', id: e.replyId, text: '', localRequestId: requestId, contextReceipt: e.contextReceipt });
            current.generation = { status: 'running', requestId, replyId: e.replyId };
          }
          cacheChat(current, job.projectId); redrawJob(job, true); rememberJobs(); setSending();
        } else if (e.type === 'delta') {
          replyText += e.text;
          const current = localChatForJob(job), reply = replyForJob(current, requestId);
          if (reply && replyText.length >= (reply.text || '').length) reply.text = replyText;
          redrawJob(job);
        } else if(e.type==='approval'){
          const current=localChatForJob(job),reply=replyForJob(current,requestId);if(reply){reply.approvals ||= [];const index=reply.approvals.findIndex(item=>item.id===e.approval.id);if(index<0)reply.approvals.push(e.approval);else reply.approvals[index]=e.approval;if(current.generation)current.generation.awaitingApproval=e.approval.status==='pending';}redrawJob(job,true);
        } else if (e.type === 'action') {
          const reply = replyForJob(localChatForJob(job), requestId);
          if (reply) { reply.actions ||= []; if (!reply.actions.some(action => action.id === e.action.id)) reply.actions.push(e.action); if (e.contextReceipt) reply.contextReceipt = e.contextReceipt; }
          redrawJob(job, true);
        } else if (e.type === 'context') {
          const reply = replyForJob(localChatForJob(job), requestId); if (reply && e.contextReceipt) reply.contextReceipt = e.contextReceipt;
          redrawJob(job, true);
        } else if (e.type === 'error') { if (jobIsVisible(job)) error(e.message); }
        else if (e.type === 'done' && e.limited && jobIsVisible(job)) toast('Limite de réponse atteinte. Tu peux demander de continuer.');
      }
    }
  } catch (e) {
    if (job.epoch !== state.authEpoch || !state.authenticated) return;
    if (rejected) {
      if (jobIsVisible(job)) { error(e.message); saveDraft(); }
      const key = job.id ? chatKey(job.projectId, job.id) : job.viewKey, current = drafts.get(key) || {};
      if (!current.text && !current.attachments?.length) { drafts.set(key, originalDraft); if (jobIsVisible(job)) restoreDraft(key); }
      else drafts.set(key, { ...current, failed: [...(current.failed || []), { ...data, attachments: originalDraft.attachments, status: 'error', local: true }] });
      if (jobIsVisible(job)) renderChat();
      rememberDrafts();
    } else if (document.visibilityState !== 'hidden' && jobIsVisible(job)) error('Reconnexion au PC… Vérification de la réception du message, sans le renvoyer.');
  } finally {
    job.controller = null; rememberJobs();
    if (job.epoch === state.authEpoch && state.authenticated) { setSending(); await recoverReplies(); scheduleRecovery(); }
  }
}
function replyForJob(chat, requestId) {
  if (!chat?.messages) return;
  const index = chat.messages.findIndex(message => message.requestId === requestId);
  return chat.messages.find((message, at) => message.role === 'assistant' && (message.localRequestId === requestId || (index >= 0 && at === index + 1)));
}
function jobIsVisible(job) { return state.authenticated && job.projectId === state.projectId && (job.id ? job.id === state.chat?.id : job.viewKey === state.viewKey); }
function newChat(focus = true) {
  if (state.uploading || conversationMove.busy) return; closeConversationOptions(); saveDraft(); ++state.viewSeq; state.loading = false; state.chat = null;
  restoreDraft(chatKey(state.projectId)); $('app').classList.add('thread-open'); renderChat(); error('');
  if (focus) $('prompt').focus();
}
async function start() {
  await checkStatus(); state.authenticated = true; ++state.authEpoch; $('login').hidden = true; $('app').hidden = false;
  workspace.activate();
  try { const info=await api('/api/ping'), saved=textDraftStore.activate(info.instanceId); $('draft-duration').value=String(saved.duration); for(const [key,value]of saved.entries){if(!drafts.get(key)?.text)drafts.set(key,{...drafts.get(key),text:value.text});} } catch { draftFailure(); }
  await loadProjects();
  let view;
  try { view = JSON.parse(sessionStorage.getItem('bm_view') || 'null'); } catch {}
  const savedKey = view?.projectId === state.projectId ? view.key : null;
  const last = savedKey?.startsWith(state.projectId + '|') ? savedKey.slice(state.projectId.length + 1) : localStorage.getItem('bm_chat_' + state.projectId);
  if (last && state.sessions.some(chat => chat.id === last)) await openChat(last);
  else {
    const pending = [...jobs.values()].find(job => !job.id && job.viewKey === savedKey);
    state.chat = pending ? { name: 'Envoi au PC…', source: 'web', messages: [] } : null;
    restoreDraft(pending ? savedKey : chatKey(state.projectId)); renderChat();
  }
  await recoverReplies(); scheduleRecovery();
}
function hidePrivateViews() {
  try { textDraftStore.clear(); } catch { toast('Impossible d’effacer la copie locale du brouillon. Efface les données de ce site dans le navigateur.'); } $('draft-duration').value='0'; sessionSignature=''; observedGenerations.clear(); announcedEvents.clear();
  closeInfo();
  closeConversationOptions();
  closeComposerFiles();
  state.authenticated = false; ++state.authEpoch; ++state.viewSeq; ++state.projectSeq; clearTimeout(recoveryTimer); clearTimeout(renderTimer);
  for (const job of jobs.values()) job.controller?.abort();
  $('models-dialog').close(); $('files-view').hidden = true; $('app').hidden = true; $('login').hidden = false;
  workspace.reset();
  $('messages').replaceChildren(); $('sessions').replaceChildren(); $('prompt').value = ''; $('attachments').replaceChildren(); $('upload-status').textContent = '';
  $('file-editor').value = ''; $('file-image').removeAttribute('src'); $('file-list').replaceChildren();
  state.chat = null; state.viewKey = null; state.sessions = []; chats.clear(); drafts.clear(); rememberDrafts();
  try { sessionStorage.removeItem('bm_view'); } catch {}
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-error').textContent = ''; $('login-button').disabled = true;
  try { await api('/api/login', { method: 'POST', body: JSON.stringify({ code: $('code').value.trim() }) }); $('code').value = ''; await start(); }
  catch (e) { $('login-error').textContent = e.message; }
  finally { $('login-button').disabled = false; }
});
$('reveal').addEventListener('click', () => { const show = $('code').type === 'password'; $('code').type = show ? 'text' : 'password'; $('reveal').setAttribute('aria-pressed', String(show)); $('reveal').setAttribute('aria-label', show ? 'Masquer le code' : 'Afficher le code'); });
$('project').addEventListener('change', async () => {
  if (state.uploading || conversationMove.busy) return; closeConversationOptions(); saveDraft(); state.projectId = $('project').value; state.chat = null; state.loading = false;
  ++state.viewSeq; $('search').value = ''; restoreDraft(chatKey(state.projectId)); renderChat(); error('');
  try { await loadSessions(); renderSessions(); scheduleRecovery(); } catch (e) { error(e.message); }
});
$('agent-files').addEventListener('change', () => { state.draftFileProfile = currentFileProfile(); saveDraft(); setSending(); });
for(const [id,key] of [['agent-web','draftWebAccess'],['agent-web-approval','draftWebApproval'],['agent-scripts','draftScriptAccess']])$(id).addEventListener('change',()=>{state[key]=$(id).checked;saveDraft();setSending();});
$('attach-file').addEventListener('click', () => closeComposerFiles());
$('fork-chat').addEventListener('click',()=>forkChat());
function choosePhoneImport(attach) { if (!state.loading&&!state.uploading&&state.projectId) { importWithAttachment=attach; closeComposerFiles(true); const free=4-fileBrowser.snapshot().length;setText($('import-help'),'Destination : Imports telephone/. '+(attach?'Les '+Math.max(0,free)+' premières places disponibles seront jointes (formats exploitables). Aucun envoi au modèle.':'Aucune pièce jointe ne sera ajoutée.'));$('phone-files').click(); } }
$('upload-file').addEventListener('click',()=>choosePhoneImport(false));$('upload-attach-file').addEventListener('click',()=>choosePhoneImport(true));
$('phone-files').addEventListener('change', async () => {
  const selected = [...$('phone-files').files]; $('phone-files').value = '';
  if (!selected.length || state.loading || state.uploading || !state.projectId) return;
  if (selected.length > 10) return error('Choisis au maximum dix fichiers par import.');
  const projectId = state.projectId; state.uploading = true; setSending(false); error('');
  $('upload-status').hidden = false;
  let imported = 0, attached = 0; const failures = [];
  try {
    for (const file of selected) {
      $('upload-status').textContent = 'Import dans le projet : ' + file.name + '…';
      if (file.size > 20000000) { failures.push(file.name + ' dépasse 20 Mo.'); continue; }
      try {
        const result = await api('/api/file/upload?' + new URLSearchParams({ projectId, name: file.name }), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
        imported++; if (importWithAttachment && fileBrowser.addImported(result)) attached++;
      } catch (e) { failures.push(file.name + ' : ' + e.message); if (e.status === 401) break; }
    }
    $('upload-status').textContent = `${imported} fichier${imported > 1 ? 's' : ''} enregistré${imported > 1 ? 's' : ''} dans « Imports telephone » · ${attached} joint${attached > 1 ? 's' : ''} au prochain message.`;
    if (failures.length) error(failures.join(' '));
    if (imported) { $('app').classList.add('thread-open'); renderChat(); }
  } finally { state.uploading = false; saveDraft(); setSending(); }
});
$('model').addEventListener('change', () => { saveDraft(); setEffort(); });
$('effort').addEventListener('change', () => { state.draftReasoning[$('model').value] = $('effort').value; saveDraft(); });
$('prompt').addEventListener('input', saveDraft);
$('search').addEventListener('input', ()=>{renderSessions();clearTimeout(searchAnnouncementTimer);searchAnnouncementTimer=setTimeout(()=>announce($('session-count').textContent+' conversation(s) trouvée(s).','search:'+state.projectId+':'+$('search').value+':'+$('session-count').textContent),300);});
$('new-chat').addEventListener('click', () => newChat());
$('back').addEventListener('click', () => { $('app').classList.remove('thread-open'); $('project').focus(); });
$('refresh').addEventListener('click', async () => { if (state.uploading || conversationMove.busy) return; const epoch = state.authEpoch, revision = conversationMove.revision; saveDraft(); $('refresh').disabled = true; try { error(''); await Promise.all([checkStatus(), loadProjects()]); if (epoch !== state.authEpoch || revision !== conversationMove.revision || !state.authenticated) return; if (state.chat?.id) await openChat(state.chat.id); if (epoch === state.authEpoch && state.authenticated) toast('Projets et conversations actualisés.'); } catch (e) { if (epoch === state.authEpoch && state.authenticated) { error(e.message); toast(e.message); } } finally { $('refresh').disabled = state.uploading || conversationMove.busy; } });
$('logout').addEventListener('click', async () => {
  if (state.uploading || conversationMove.busy) return;
  hidePrivateViews(); $('code').focus();
  try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
});
$('conversation-options-toggle').addEventListener('click', () => { const show = $('conversation-options').hidden; $('conversation-options').hidden = !show; $('conversation-options-toggle').setAttribute('aria-expanded', String(show)); if (show) { for (const action of ['rename', 'move', 'delete']) $(action + '-error').hidden = true; updateConversationOptions(); ($('conversation-name').disabled ? $('info-button') : $('conversation-name')).focus(); } });
$('conversation-options').addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeConversationOptions(true); } });
document.addEventListener('pointerdown', event => { if (!$('conversation-options').contains(event.target) && !$('conversation-options-toggle').contains(event.target)) closeConversationOptions(); });
$('move-project').addEventListener('change', updateConversationOptions);
$('move-conversation-form').addEventListener('submit', moveCurrentConversation);
$('conversation-name').addEventListener('input', updateConversationOptions);
$('rename-conversation-form').addEventListener('submit', renameCurrentConversation);
$('delete-conversation').addEventListener('click', deleteCurrentConversation);
$('info-button').addEventListener('click', () => {
  const show = $('info').hidden; closeConversationOptions();
  if (!show) return closeInfo(true);
  $('info').hidden = false; $('info-button').setAttribute('aria-expanded', 'true');
  $('info-body').scrollTop = 0; $('info-close').focus({ preventScroll: true });
});
$('info-close').addEventListener('click', () => closeInfo(true));
$('info').addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeInfo(true); } });
$('composer').addEventListener('submit', send);
$('prompt').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('composer').requestSubmit(); } });
$('stop').addEventListener('click', async () => {
  const target = { id: state.chat?.id, projectId: state.projectId };
  if (!target.id) return;
  try {
    await api('/api/cancel', { method: 'POST', body: JSON.stringify(target) }); await recoverReplies();
  } catch { error('Impossible de joindre le PC pour arrêter la réponse. Réessaie après reconnexion.'); }
});
document.addEventListener('visibilitychange', resumeReply);
window.addEventListener('pageshow', resumeReply);
window.addEventListener('online', resumeReply);
window.addEventListener('pagehide', saveDraft);
window.addEventListener('storage', event=>{if(textDraftStore.handlesStorageKey(event.key)){try{if(textDraftStore.synchronize()){applyDraftRevocation();rememberDrafts();if(state.authenticated)renderChat();}}catch{draftFailure();}}});
$('models-open-sidebar').addEventListener('click', openModels);
$('models-open-thread').addEventListener('click', openModels);
$('models-refresh').addEventListener('click', refreshLoadedModels);
$('models-close').addEventListener('click', () => $('models-dialog').close());

function focusReply(id) { const target=[...$('messages').querySelectorAll('.message')].find(x=>x.dataset.messageId===id);if(target){target.scrollIntoView({block:'center'});target.focus({preventScroll:true});}else toast('Le message ciblé n’est plus disponible dans la partie affichée.'); }
async function visitSource(origin,button) { const previous={projectId:state.projectId,chat:state.chat,key:state.viewKey};const projectId=origin.projectId||state.projectId;button.disabled=true;try{if(!state.projects.some(p=>p.id===projectId))throw Error();const source=await api('/api/conversation?'+new URLSearchParams({projectId,id:origin.id}));saveDraft();state.projectId=projectId;$('project').value=projectId;state.chat=source;restoreDraft(chatKey(projectId,source.id));await loadSessions();renderChat();if(origin.messageId)focusReply(origin.messageId);}catch{state.projectId=previous.projectId;$('project').value=previous.projectId;state.chat=previous.chat;restoreDraft(previous.key);renderChat();toast('Source indisponible : déplacée, supprimée ou hors historique affiché. La branche reste consultable.');}finally{button.disabled=false;}}
$('draft-duration').addEventListener('change',()=>{saveDraft();try{textDraftStore.setDuration($('draft-duration').value,drafts);setText($('draft-status'),textDraftStore.duration?'Messages non envoyés conservés sur cet appareil pour la durée choisie.':'Messages conservés uniquement dans cet onglet.');}catch{draftFailure();}});
$('draft-download').addEventListener('click',downloadMessageDraft);
$('draft-clear').addEventListener('click',()=>{try{textDraftStore.clear();for(const [key,draft]of drafts)drafts.set(key,{...draft,text:'',failed:[]});$('prompt').value='';$('draft-duration').value='0';rememberDrafts();renderChat();setText($('draft-status'),'Textes des brouillons effacés.');}catch{draftFailure();}});
$('diagnostics-open').addEventListener('click',async()=>{const button=$('diagnostics-open'),panel=$('diagnostics-result');button.disabled=true;panel.hidden=false;panel.textContent='Vérification…';try{const result=await api('/api/diagnostics');panel.replaceChildren(node('p','','Diagnostic volontaire, sans message ni modèle exécuté.'),node('pre','',JSON.stringify(result,null,2)));const download=node('button','file-action','Télécharger le diagnostic');download.type='button';download.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='diagnostic-bionic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});panel.append(download);}catch(e){panel.textContent=e.message;}finally{button.disabled=false;}});

start().catch(e => { if (!/Connecte-toi/.test(e.message)) $('login-error').textContent = e.message; });

let forking=false;
async function forkChat(messageId) {
  if(forking||!state.chat?.id)return;
  const source={projectId:state.projectId,chatId:state.chat.id},sequence=state.viewSeq;
  saveDraft();closeComposerFiles();forking=true;
  document.querySelectorAll('#fork-chat,.message-fork').forEach(button=>button.disabled=true);
  try{
    const fork=await api('/api/conversation/fork',{method:'POST',body:JSON.stringify({...source,...(messageId?{messageId}:{})})});
    if(state.projectId===source.projectId&&state.viewSeq===sequence){await loadSessions();await openChat(fork.id);$('prompt').focus();}
    toast('Branche indépendante créée. Aucun message envoyé automatiquement.');
  }catch(e){error(e.message);}finally{forking=false;document.querySelectorAll('.message-fork').forEach(button=>button.disabled=false);setSending();}
}
