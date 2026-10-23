'use strict';
const appT = (key, params) => globalThis.BionicI18n.t(key, params);
const appNumber = (value, options) => globalThis.BionicI18n.number(value, options);
const appLabelBindings = new Map();
function setAppLabel(id, key, params) {
  const value = appT(key, typeof params === 'function' ? params() : params);
  setText($(id), value); appLabelBindings.set(id, { key, params, value });
}
const $ = id => document.getElementById(id);
const composerFiles = $('composer-files'), composerFilesToggle = $('files-menu-toggle');
const mobileComposer = matchMedia('(max-width:760px)');
const conversationMove = { busy: false, action: null, revision: 0 };
const projectManagement = { busy: false, preview: null, revision: 0 };
let connectionRefreshing = false;
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
// A dismissal is a complete click outside, never the end of a selection/drag
// that began inside. Native dialog backdrop events target the dialog itself.
function installOutsideDismissals(root = document) {
  let startedOutside = [];
  function outside(surface, event) {
    if (surface.matches('dialog')) {
      const rect = surface.getBoundingClientRect();
      return event.target === surface && (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom);
    }
    if (surface.contains(event.target)) return false;
    return surface.id !== 'conversation-options' || !root.getElementById('conversation-options-toggle').contains(event.target);
  }
  function surfaces() {
    return [...root.querySelectorAll('dialog[open], #composer-files[open], #conversation-options:not([hidden]), .message.user .message-extras[open]')];
  }
  root.addEventListener('pointerdown', event => {
    startedOutside = event.isPrimary !== false && event.button === 0 ? surfaces().filter(surface => outside(surface, event)) : [];
  }, true);
  root.addEventListener('pointercancel', () => { startedOutside = []; }, true);
  root.addEventListener('click', event => {
    const candidates = startedOutside; startedOutside = [];
    for (const surface of candidates) {
      if (!surface.isConnected || !surfaces().includes(surface) || !outside(surface, event)) continue;
      const hadFocus = surface.contains(root.activeElement);
      if (surface.matches('dialog')) surface.close();
      else if (surface.id === 'conversation-options') {
        surface.hidden = true;
        const opener = root.getElementById('conversation-options-toggle');
        opener.setAttribute('aria-expanded', 'false');
        if (hadFocus) opener.focus({ preventScroll: true });
      } else {
        surface.open = false;
        if (hadFocus) surface.querySelector('summary')?.focus({ preventScroll: true });
      }
    }
  }, true);
  window.addEventListener('blur', () => { startedOutside = []; });
}
installOutsideDismissals();
const icons = {
  settings: '<path d="M10 3h4l.5 2 2 1 2-.5 2 3L19 10v4l1.5 1.5-2 3-2-.5-2 1-.5 2h-4l-.5-2-2-1-2 .5-2-3L5 14v-4L3.5 8.5l2-3 2 .5 2-1Z"/><circle cx="12" cy="12" r="3"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m12-10v2a5 5 0 0 1-5 5H6"/>',
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
for (const [id, name] of [['refresh', 'refresh'], ['search-icon', 'search'], ['back', 'back'], ['send', 'send'], ['info-button', 'info'], ['reveal', 'eye']]) $(id).append(icon(name));
for (const [id, name] of [['settings-open-sidebar','settings'], ['models-close','close'], ['models-refresh','refresh']]) $(id).append(icon(name));
$('models-open-sidebar').prepend(icon('models'));
$('conversation-options-toggle').append(icon('more'));
const newChatLabel = document.createTextNode(appT('app.newChat'));
$('new-chat').append(icon('plus'), newChatLabel);
const state = { projects: [], sessions: [], projectId: null, chat: null, sending: false, loading: false, uploading: false, status: null, viewSeq: 0, projectSeq: 0, authenticated: false, authEpoch: 0, viewKey: null, draftReasoning: {}, draftFileProfile: null, draftFileAccess: null, draftWebAccess:null, draftWebApproval:null, draftScriptAccess:null, draftImageAccess:null, draftImageWorkflowId:null, draftImageCount:null, draftImageModelPolicy:null, sessionsPartial:false, sessionWarnings:[] };
const companionSettings = createCompanionSettings({api,getState:()=>state,node,onChange:()=>setSending(),onPageChange:page=>page==='maintenance'?updatesPanel.refresh():undefined,onNavigate:target=>{
  $('app').classList.add('thread-open');
  if(target==='tools'||target==='image') { composerFiles.open=true; const control=$(target==='image'?'agent-images':'agent-files'); (control.disabled?composerFilesToggle:control).focus({preventScroll:true}); composerFiles.scrollIntoView({block:'nearest'}); }
  else { const control=$('model'); (control.disabled?$('prompt'):control).focus({preventScroll:true}); control.scrollIntoView({block:'nearest'}); }
}});
const textDraftStore = createMessageDraftStore({ storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value), removeItem: key => localStorage.removeItem(key) } });
const chats = new Map(), drafts = readDrafts(), jobs = readJobs();
const projectTree = createProjectTree({
  container: $('sessions'), node, icon,
  getView: () => ({ authenticated: state.authenticated, authEpoch: state.authEpoch, revision: conversationMove.revision, projectId: state.projectId, currentId: state.chat?.id, viewKey: state.viewKey, search: $('search').value, disabled: state.uploading || conversationMove.busy, pending: [...jobs.values()].filter(job => !job.id).map(job => ({ projectId: job.projectId, id: 'pending:' + job.requestId, name: job.chat?.name || appT('app.sendingPc'), source: 'web', generation: { status: 'running' }, pending: job })), jobs: [...jobs.values()].map(job => [job.requestId, job.projectId, job.id, job.status, job.phase]) }),
  fetchSessions: projectId => api('/api/sessions?projectId=' + encodeURIComponent(projectId)),
  renderSession: renderSessionRow,
  onSelectProject: projectId => selectProject(projectId).catch(e => error(e.message)),
  onCount: (count, unloaded, searching) => { setText($('session-count'), appNumber(count)); $('session-count').dataset.count = String(count); $('session-count').setAttribute('aria-label', appT('app.sessionsCount', { count, unloaded: unloaded ? appT('app.projectsUnloaded', { count: unloaded }) : '', search: searching ? appT('app.searchMatching') : '' })); }
});
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
  if (generation.awaitingApproval && (!previous?.awaitingApproval || previous.replyId !== generation.replyId)) announce(appT('app.approvalAnnounce', { name: chat.name }), 'approval:' + key + ':' + generation.replyId);
  if (previous?.status === 'running' && generation.status && generation.status !== 'running') announce(appT('app.finishedAnnounce', { name: chat.name, status: appT(generation.status === 'done' || generation.status === 'completed' ? 'app.finishedStatus' : 'app.stoppedStatus') }), 'finished:' + key + ':' + (generation.replyId || previous.replyId));
  observedGenerations.set(key, { status:generation.status, replyId:generation.replyId, awaitingApproval:!!generation.awaitingApproval });
}
function fileProfile(source, fallback = 'write') {
  const value = source?.fileProfile ?? source?.filePermission;
  return ['none','read','write'].includes(value) ? value : typeof source?.fileAccess === 'boolean' ? source.fileAccess ? 'write' : 'none' : fallback;
}
function currentFileProfile() { return unassignedProject() ? 'none' : $('agent-files').value; }
function draftFailure() {
  setAppLabel('draft-status', 'app.draftUnavailable');
  if (!draftStorageWarning) { toast(appT('app.draftNotSaved')); draftStorageWarning = true; }
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
    const saved = [...jobs.values()].map(({ requestId, projectId, id, createdAt, status, viewKey, phase }) => ({ requestId, projectId, id, createdAt, status, viewKey, ...(phase==='waiting-model'?{phase}:{} ) }));
    if (saved.length) localStorage.setItem('bm_pending_replies', JSON.stringify(saved)); else localStorage.removeItem('bm_pending_replies');
  } catch {}
}
function readDrafts() {
  try { const saved = JSON.parse(sessionStorage.getItem('bm_drafts') || '[]'); return new Map(Array.isArray(saved) ? saved.slice(-100) : []); } catch { return new Map(); }
}
function applyDraftRevocation() { for(const [key,draft]of drafts)drafts.set(key,{...draft,text:'',failed:[]});$('prompt').value='';$('draft-duration').value='0';setAppLabel('draft-status', 'app.draftRevoked'); }
function rememberDrafts() {
  try { if(textDraftStore.synchronize())applyDraftRevocation(); } catch { draftFailure(); }
  try { sessionStorage.setItem('bm_drafts', JSON.stringify([...drafts.entries()].slice(-100))); } catch { draftFailure(); }
  try { if(textDraftStore.save(drafts)?.revoked){applyDraftRevocation();sessionStorage.setItem('bm_drafts',JSON.stringify([...drafts.entries()].slice(-100)));} } catch { draftFailure(); }
}
function chatKey(projectId, id) { return projectId + '|' + (id || 'new'); }
function normalizedImageCount(value) { const amount=Number(value); return Number.isSafeInteger(amount)&&amount>=1&&amount<=5?amount:1; }
function currentJobs() { return [...jobs.values()].filter(job => job.projectId === state.projectId && (job.id ? job.id === state.chat?.id : job.viewKey === state.viewKey)); }
function anyGeneration() { return jobs.size > 0 || state.sessions.some(chat => chat.generation?.status === 'running' || chat.queue?.some(item => item.status === 'queued')); }
function draftForView() { return drafts.get(state.viewKey) || {}; }
function saveDraft() {
  if (!state.viewKey) return;
  drafts.set(state.viewKey, { ...draftForView(), text: $('prompt').value, model: $('model').value, reasoning: { ...state.draftReasoning }, fileProfile:currentFileProfile(), fileAccess:currentFileProfile()==='write', webAccess:$('agent-web').checked, webApproval:$('agent-web-approval').checked, scriptAccess:$('agent-scripts').checked, imageAccess:$('agent-images').checked, imageWorkflowId:$('image-workflow').value, imageCount:normalizedImageCount($('image-count').value), imageModelPolicy:$('image-model-policy').value, attachments: fileBrowser.snapshot(), uploadStatus: $('upload-status').hidden ? '' : $('upload-status').textContent });
  rememberDrafts();
}
function restoreDraft(key) {
  state.viewKey = key;
  rememberView();
  const draft = draftForView();
  state.draftReasoning = { ...draft.reasoning }; state.draftFileAccess = draft.fileAccess ?? null;
  state.draftFileProfile = ['none','read','write'].includes(draft.fileProfile) ? draft.fileProfile : typeof draft.fileAccess === 'boolean' ? fileProfile(draft) : null;
  state.draftWebAccess=draft.webAccess??null;state.draftWebApproval=draft.webApproval??null;state.draftScriptAccess=draft.scriptAccess??null;state.draftImageAccess=draft.imageAccess??null;state.draftImageWorkflowId=draft.imageWorkflowId??null;state.draftImageCount=draft.imageCount??null;state.draftImageModelPolicy=draft.imageModelPolicy??null;
  $('prompt').value = draft.text || ''; fileBrowser.restore(draft.attachments || []);
  $('upload-status').textContent = draft.uploadStatus || ''; $('upload-status').hidden = !draft.uploadStatus;
  $('model').value = (state.status?.models || []).some(model => model.id === draft.model) ? draft.model : modelForChat();
}
function rememberView() { try { sessionStorage.setItem('bm_view', JSON.stringify({ projectId: state.projectId, key: state.viewKey })); } catch {} }
function rememberChat() { if (state.chat?.id) { try { localStorage.setItem('bm_chat_' + state.projectId, state.chat.id); } catch {} } }
const imageGenerationView = createImageGenerationView({api,node,getState:()=>state,redraw:()=>renderChat(),onRetry:async(result,owner)=>{
  const epoch=state.authEpoch,key=chatKey(owner.projectId,result.chatId);
  let target=chats.get(key)||(state.projectId===owner.projectId&&state.chat?.id===result.chatId?state.chat:null);
  if(!target||!result.message)target=await api('/api/conversation?'+new URLSearchParams({projectId:owner.projectId,id:result.chatId}));
  else{target.messages||=[];const index=target.messages.findIndex(message=>message.id===result.messageId);if(index<0)target.messages.push(result.message);else target.messages[index]=result.message;}
  if(epoch===state.authEpoch&&state.authenticated)showChatUpdate(target,owner.projectId);
}});
const EFFORT_LABEL_KEYS = { off: 'app.effortOff', on: 'app.effortOn', low: 'app.effortLow', medium: 'app.effortMedium', high: 'app.effortHigh', xhigh: 'app.effortXhigh' };
function effortLabel(value) { return EFFORT_LABEL_KEYS[value] ? appT(EFFORT_LABEL_KEYS[value]) : value; }
const modelPanel = { models: [], loading: false, unloading: null, generationActive: false };
const fileBrowser = createProjectFileBrowser({ api, node, icon, toast, getProject: () => state.projects.find(project => project.id === state.projectId), isBusy: () => state.loading || state.uploading || conversationMove.busy, onChange: saveDraft, onAttach: () => { $('app').classList.add('thread-open'); renderChat(); $('prompt').focus(); } });
const workspace = createWorkspace({ api, node, icon, toast, getState: () => state, imageGallery:(images,projectId)=>imageGenerationView.gallery(images,null,null,{projectId,projectOnly:true,readonly:true}), openTarget: async (projectId, chatId, messageId) => {
  if (state.uploading) throw new Error(appT('app.waitImport'));
  if (conversationMove.busy) throw new Error(appT('app.waitConversationChange'));
  if (!state.projects.some(project => project.id === projectId)) throw new Error(appT('app.replyProjectUnavailable'));
  saveDraft();
  if (state.projectId !== projectId) {
    ++state.viewSeq; state.projectId = projectId; $('project').value = projectId; state.chat = null; state.loading = false;
    restoreDraft(chatKey(projectId)); await loadSessions();
  }
  await openChat(chatId);
  return state.projectId === projectId && state.chat?.id === chatId && !![...$('messages').querySelectorAll('.message')].find(el => el.dataset.messageId === messageId);
} });
const updateRecoveryKey = 'bm_update_recovery';
let updateRecoveryTimer;
function expireUpdateDrafts() {
  clearTimeout(updateRecoveryTimer);
  try {
    const saved = JSON.parse(sessionStorage.getItem(updateRecoveryKey) || 'null');
    if (!saved) return;
    const remaining = 1800000 - (Date.now() - saved.savedAt);
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 1860000) sessionStorage.removeItem(updateRecoveryKey);
    else updateRecoveryTimer = setTimeout(() => { try { sessionStorage.removeItem(updateRecoveryKey); } catch {} }, remaining);
  } catch { try { sessionStorage.removeItem(updateRecoveryKey); } catch {} }
}
expireUpdateDrafts();
function rememberUpdateDrafts(instanceId) {
  saveDraft();
  const saved = JSON.stringify({ instanceId, savedAt: Date.now(), entries: [...drafts.entries()].slice(-100), view: sessionStorage.getItem('bm_view') });
  if (saved.length > 2_000_000) throw new Error(appT('app.draftsTooLarge'));
  sessionStorage.setItem(updateRecoveryKey, saved);
  expireUpdateDrafts();
}
function recoverUpdateDrafts(instanceId) {
  const serialized = sessionStorage.getItem(updateRecoveryKey);
  if (!serialized) return;
  const saved = JSON.parse(serialized);
  sessionStorage.removeItem(updateRecoveryKey);
  if (saved.instanceId !== instanceId || !Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt > 1800000 || saved.savedAt > Date.now() + 60000 || !Array.isArray(saved.entries)) return;
  for (const entry of saved.entries.slice(-100)) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || entry[0].length > 300 || !entry[1] || typeof entry[1] !== 'object' || typeof entry[1].text !== 'string' || entry[1].text.length > 16000) continue;
    const current = drafts.get(entry[0]);
    if (!current?.text && !current?.attachments?.length) drafts.set(entry[0], entry[1]);
  }
  if (typeof saved.view === 'string' && saved.view.length < 1000) sessionStorage.setItem('bm_view', saved.view);
  rememberDrafts();
}
const updatesPanel = initUpdates({ api, isAuthenticated: () => state.authenticated, toast,
  openSettings: opener => companionSettings.openPage({currentTarget:opener},'maintenance','updates-title'),
  beforeInstall: async () => {
    if (companionSettings.hasUnsaved()) throw new Error(appT('app.saveSettingsBeforeInstall'));
    if (state.uploading || conversationMove.busy || fileBrowser.isWorking() || fileBrowser.hasUnsavedChanges()) throw new Error(appT('app.saveFilesBeforeInstall'));
    const info = await api('/api/ping');
    rememberUpdateDrafts(info.instanceId);
    return true;
  },
  beforeReload: info => {
    if (companionSettings.hasUnsaved()) throw new Error(appT('app.saveSettingsBeforeReload'));
    if (fileBrowser.hasUnsavedChanges()) throw new Error(appT('app.saveFileBeforeReload'));
    const saved = JSON.parse(sessionStorage.getItem(updateRecoveryKey) || 'null');
    if (saved?.instanceId && saved.instanceId !== info?.instanceId) throw new Error(appT('app.instanceChanged'));
    if (saved?.instanceId) rememberUpdateDrafts(saved.instanceId);
  }
});
$('upload-file').prepend(icon('upload'));
let toastTimeout;
function toast(message) { appLabelBindings.delete('toast'); $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('toast').hidden = true, 4500); }
function toastLabel(key, params) { toast(appT(key, params)); setAppLabel('toast', key, params); }
function error(message) { appLabelBindings.delete('message-error'); $('message-error').textContent = message || ''; $('message-error').hidden = !message; }
function errorLabel(key, params) { error(appT(key, params)); setAppLabel('message-error', key, params); }
function unassignedProject() { return !!state.projects.find(project => project.id === state.projectId)?.isUnassigned; }
function closeConversationOptions(focus = false) {
  $('conversation-options').hidden = true; $('conversation-options-toggle').setAttribute('aria-expanded', 'false');
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
  $('move-conversation').textContent = conversationMove.action === 'move' ? appT('app.moving') : appT('app.move');
  $('move-help').textContent = active ? appT('app.moveWaitGeneration') : !state.chat?.id ? appT('app.moveSaveFirst') : appT('app.moveHelp');
  const name = $('conversation-name'), original = state.chat?.name || '';
  if (name.dataset.chat !== key || name.value === name.dataset.originalName) {
    name.value = original; name.dataset.chat = key; name.dataset.originalName = original;
  }
  name.disabled = select.disabled;
  $('rename-conversation').disabled = select.disabled || !name.value.trim() || name.value.trim() === original;
  $('rename-conversation').textContent = conversationMove.action === 'rename' ? appT('app.renaming') : appT('app.rename');
  $('rename-help').hidden = state.chat?.source !== 'bionic';
  $('rename-help').textContent = appT('app.renameHelp');
  $('delete-conversation').disabled = select.disabled;
  $('delete-conversation').textContent = conversationMove.action === 'delete' ? appT('app.deleting') : state.chat?.source === 'bionic' ? appT('app.deleteFromCompanion') : appT('app.deleteConversation');
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
    toast(appT('app.conversationMoved', { project: state.projects.find(project => project.id === state.projectId)?.name || appT('app.unassigned'), attachments: draft.attachments?.length ? appT('app.reattachDraft') : '' }));
    $('prompt').focus();
  } catch (error) {
    if (epoch !== state.authEpoch || !state.authenticated) return;
    $('move-error').textContent = committed ? appT('app.moveRecorded') : error.status === 404 && /Action inconnue/.test(error.message) ? appT('app.restartForMoves') : error.message;
    $('move-error').hidden = false;
  } finally { conversationMove.busy = false; conversationMove.action = null; setSending(); scheduleRecovery(); if (committed && epoch === state.authEpoch && state.authenticated) $('prompt').focus(); }
}
function conversationActionError(action, failure) {
  const target = $(action + '-error');
  target.textContent = failure.status === 404 && /Action inconnue/.test(failure.message) ? appT('app.restartForAction') : failure.message;
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
    renderChat(); closeConversationOptions(); toast(appT('app.renamed'));
    $('prompt').focus();
  } catch (failure) { if (epoch === state.authEpoch && state.authenticated) conversationActionError('rename', failure); }
  finally { conversationMove.busy = false; conversationMove.action = null; setSending(); scheduleRecovery(); if (committed && epoch === state.authEpoch && state.authenticated) $('prompt').focus(); }
}
async function deleteCurrentConversation() {
  if ($('delete-conversation').disabled) return;
  const epoch = state.authEpoch, projectId = state.projectId, id = state.chat.id, key = state.viewKey, native = state.chat.source === 'bionic';
  const confirmation = native ? appT('app.deleteNativeConfirm', { name: state.chat.name }) : appT('app.deleteWebConfirm', { name: state.chat.name });
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
    toast(native ? appT('app.nativeRemoved') : appT('app.conversationDeleted'));
    $('prompt').focus();
    try { await loadSessions(); } catch { if (epoch === state.authEpoch && state.authenticated) toast(appT('app.deletedRefresh')); }
  } catch (failure) { if (epoch === state.authEpoch && state.authenticated) conversationActionError('delete', failure); }
  finally { conversationMove.busy = false; conversationMove.action = null; setSending(); scheduleRecovery(); if (committed && epoch === state.authEpoch && state.authenticated) $('prompt').focus(); }
}
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
async function api(route, options = {}) {
  const epoch = state.authEpoch;
  const r = await fetch(route, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const j = await r.json().catch(() => ({ error: appT('app.invalidServerResponse') }));
  if (route === '/api/updates/install' && !r.ok) { try { sessionStorage.removeItem(updateRecoveryKey); } catch {} }
  if (r.status === 401 && !updatesPanel.isRestarting()) hidePrivateViews();
  if (!r.ok) throw Object.assign(new Error(j.error || appT('app.httpError', { status: r.status })), { status: r.status, code: j.code });
  if (route === '/api/comfy/settings' && epoch === state.authEpoch && state.authenticated) {
    $('comfy-storage-warning').hidden = j.degraded !== true;
    if (j.degraded === true) setAppLabel('comfy-storage-warning', 'app.beta24.imageStorageDegraded');
    else { $('comfy-storage-warning').textContent = ''; appLabelBindings.delete('comfy-storage-warning'); }
  }
  return j;
}
function shortDate(time) { if (!time) return ''; return globalThis.BionicI18n.date(time, { day: 'numeric', month: 'short' }); }
function modelForChat() {
  const current = state.chat?.model;
  const list = state.status?.models || [];
  return list.find(m => m.id === current)?.id || list.find(m => m.id === $('model').value)?.id || list.find(m => m.loaded)?.id || list[0]?.id || '';
}
function setModels() {
  const previous = $('model').value;
  $('model').replaceChildren();
  const list = state.status?.models || [];
  if (!list.length) $('model').append(new Option(appT('app.noLocalModels'), ''));
  for (const m of list) $('model').append(new Option(appT('app.modelOption', { loaded: m.loaded ? appT('app.loadedPrefix') : '', name: m.name, vision: m.vision ? appT('app.visionSuffix') : '', tools: m.toolsCapability === 'unknown' || m.tools === null ? appT('app.beta24.toolsUnconfirmedSuffix') : '' }), m.id));
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
  $('effort').replaceChildren(new Option(capability?.default ? appT('app.effortDefaultWithValue', { value: effortLabel(capability.default) }) : appT('app.effortDefault'), 'default'));
  for (const choice of choices) $('effort').append(new Option(effortLabel(choice), choice));
  $('effort').value = valid ? stored : 'default';
  $('effort').disabled = !choices.length || state.loading || !!modelPanel.unloading;
  const binary = choices.length && choices.every(choice => choice === 'on' || choice === 'off');
  setText($('effort-help'), !valid ? appT('app.effortUnavailable') : !choices.length ? appT('app.effortUnsupported') : binary ? appT('app.effortBinary') : appT('app.effortHelp'));
  const unknownTools = model?.toolsCapability === 'unknown' || model?.tools === null;
  $('model-tools-help').hidden = !unknownTools;
  if (unknownTools) setAppLabel('model-tools-help', 'app.beta24.toolsUnconfirmedHelp');
  else { $('model-tools-help').textContent = ''; appLabelBindings.delete('model-tools-help'); }
}
async function checkStatus() {
  state.status = await api('/api/status');
  setAppLabel('status', state.status.ok ? 'app.connected' : 'app.apiUnavailable');
  $('status').className = 'status ' + (state.status.ok ? 'online' : 'offline');
  if (!state.status.ok) error(state.status.apiError);
  setModels();
}
function modelError(message) { $('models-error').textContent = message || ''; $('models-error').hidden = !message; }
function renderLoadedModels() {
  const instances = modelPanel.models.flatMap(model => model.loadedInstances.map(instance => ({ ...instance, model })));
  const locked = modelPanel.loading || !!modelPanel.unloading;
  $('models-refresh').disabled = locked;
  $('models-summary').textContent = modelPanel.loading ? appT('app.refreshing') : appT('app.instancesInMemory', { count: instances.length });
  $('models-list').setAttribute('aria-busy', String(locked));
  $('models-list').replaceChildren();
  if (!instances.length && !modelPanel.loading) $('models-list').append(node('p', 'models-empty', appT('app.noLoadedModel')));
  for (const instance of instances) {
    const row = node('section', 'loaded-model');
    const details = node('div', 'loaded-model-details');
    details.append(node('h3', '', instance.model.name));
    const type = instance.model.type === 'embedding' ? appT('app.modelEmbedding') : instance.model.type === 'decision' ? appT('app.modelDecision') : appT('app.modelConversation');
    let detail = type + (instance.contextLength ? appT('app.modelContext', { count: appNumber(instance.contextLength) }) : '');
    details.append(node('p', 'loaded-model-meta', detail));
    if (instance.model.loadedInstances.length > 1) details.append(node('p', 'loaded-model-id', instance.id));
    const button = node('button', 'unload-button', modelPanel.unloading === instance.id ? appT('app.unloading') : appT('app.unload'));
    button.type = 'button'; button.disabled = locked || anyGeneration() || modelPanel.generationActive;
    button.setAttribute('aria-label', appT('app.unloadNamed', { name: instance.model.name, instance: instance.model.loadedInstances.length > 1 ? ' — ' + instance.id : '' }));
    button.addEventListener('click', () => unloadModel(instance.id));
    row.append(details, button); $('models-list').append(row);
  }
  if ((anyGeneration() || modelPanel.generationActive) && !modelPanel.unloading) $('models-summary').textContent += appT('app.unloadAfterResponse');
}
async function refreshLoadedModels() {
  if (modelPanel.unloading || modelPanel.loading) return;
  modelPanel.loading = true; modelError(''); renderLoadedModels();
  try {
    const response = await api('/api/models'); modelPanel.models = response.models;
    modelPanel.generationActive = response.generationActive;
    state.status = { ...state.status, models: response.models.filter(model => model.type === 'llm'), ok: true, apiError: null };
    setModels();
  } catch (e) { modelError(e.status === 404 ? appT('app.restartForModels') : e.message); }
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
    if (result.unloaded) toast(appT('app.modelUnloaded'));
    else modelError(appT('app.modelReloaded'));
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
  projectTree.setProjects(j.projects);
  if (state.projectId) { $('project').value = state.projectId; await loadSessions(); }
  else $('sessions').replaceChildren(node('p', 'list-empty', appT('app.beta24.noProject')));
  setSending(false);
}
async function loadSessions() {
  const seq = ++state.projectSeq, epoch = state.authEpoch, revision = conversationMove.revision, pid = state.projectId;
  if (!pid) return;
  projectTree.setLoading(pid);
  let j;
  try { j = await api('/api/sessions?projectId=' + encodeURIComponent(pid)); }
  catch (e) { if (seq === state.projectSeq && epoch === state.authEpoch && pid === state.projectId && state.authenticated) projectTree.setError(pid, e.message); throw e; }
  if (seq !== state.projectSeq || epoch !== state.authEpoch || revision !== conversationMove.revision || pid !== state.projectId || !state.authenticated) return;
  state.sessions = j.sessions; state.sessionsPartial = !!j.partial; state.sessionWarnings=j.warnings||[]; renderSessions(); localStorage.setItem('bm_project', pid);
}
function renderSessions() {
  if (!state.authenticated) return;
  if (state.projectId) projectTree.setSessions(state.projectId, { sessions: state.sessions, partial: state.sessionsPartial, warnings: state.sessionWarnings });
  projectTree.render();
  const waiting = state.sessions.filter(x=>x.generation?.awaitingApproval).length; document.title = appT('app.documentTitle', { waiting: waiting ? appT('app.approvalsPending', { count: waiting }) : '' });
}
function renderSessionRow(s, projectId) {
    observeGeneration(s, projectId);
    const button = node('button', 'session'); button.dataset.sessionId = s.id; button.type = 'button'; button.disabled = state.uploading;
    button.setAttribute('aria-current', String(projectId === state.projectId && (s.pending ? state.viewKey === s.pending.viewKey : state.chat?.id === s.id)));
    button.append(node('span', 'session-name', s.name));
    const active = [...jobs.values()].filter(job => job.projectId === projectId && job.id === s.id);
    const queued = Math.max(s.queueCount || s.queue?.filter(item => item.status === 'queued').length || 0, active.filter(job => job.status === 'queued').length);
    const running = s.generation?.status === 'running' || active.some(job => job.status !== 'queued');
    const waitingResource = ['waiting-model','waiting-resource','waiting-image-resource'].includes(s.generation?.phase)||active.some(job=>job.phase==='waiting-model');
    const label = s.generation?.awaitingApproval ? appT('app.sessionApproval', { queued: queued ? ' · ' + appT('app.queuedCount', { count: queued }) : '' }) : running ? appT(s.generation?.phase === 'waiting-image' ? 'app.beta24.sessionWaitingImage' : waitingResource ? 'app.beta24.sessionWaiting' : 'app.sessionRunning', { queued: queued ? ' · ' + appT('app.queuedCount', { count: queued }) : '' }) : queued ? appT('app.queuedCount', { count: queued }) : s.source === 'web' ? (s.origin?.kind==='fork' ? appT('app.branch') : s.origin ? appT('app.webContinuation') : appT('app.webChat')) : 'Bionic';
    button.classList.toggle('session-active', running || queued > 0);
    const meta = node('span', 'session-meta'); meta.append(node('span', s.source === 'web' ? 'web-label' : '', label), node('span', '', shortDate(s.updatedAt)));
    button.append(meta); button.addEventListener('click', async () => {
      if (state.uploading || conversationMove.busy) return;
      try {
      if (state.projectId !== projectId) {
        const epoch = state.authEpoch;
        const selected = await selectProject(projectId);
        if (!selected || !state.authenticated || epoch !== state.authEpoch || state.projectId !== projectId) return;
      }
      if (s.pending) {
        saveDraft(); ++state.viewSeq; state.loading = false; state.chat = s.pending.chat || { name: s.name, source: 'web', messages: [] };
        restoreDraft(s.pending.viewKey); $('app').classList.add('thread-open'); renderChat();
      } else { await openChat(s.id); if (state.projectId === projectId && state.chat?.id === s.id && s.generation?.awaitingApproval) focusReply(s.generation.replyId); }
      } catch (e) { error(e.message); }
    });
    return button;
}
async function selectProject(projectId, { clearSearch = false } = {}) {
  if (state.uploading || conversationMove.busy || !state.authenticated) return false;
  if (!state.projects.some(project => project.id === projectId)) throw new Error(appT('app.projectUnavailable'));
  projectTree.activate(projectId);
  if (projectId === state.projectId) { projectTree.render(); return true; }
  closeConversationOptions(); saveDraft();
  state.projectId = projectId; $('project').value = projectId; state.chat = null; state.loading = false;
  state.sessions = []; state.sessionsPartial = false; state.sessionWarnings = [];
  const seq = ++state.viewSeq, epoch = state.authEpoch;
  if (clearSearch) $('search').value = '';
  restoreDraft(chatKey(projectId)); renderChat(); error('');
  await loadSessions();
  if (seq !== state.viewSeq || epoch !== state.authEpoch || !state.authenticated || projectId !== state.projectId) return false;
  renderSessions(); scheduleRecovery();
  return true;
}
const renderedMessageText = new WeakMap(), pendingMessageText = new Map(), responseModels = new Map(), capabilityNotices = new Map();
let readingView = null, followingReply = true;
function readingInteraction(container) {
  const active = document.activeElement;
  if (container.contains(active) && active.matches('button,input,textarea,select,summary,a,[contenteditable="true"],[role="textbox"]')) return true;
  const selected = window.getSelection();
  return !!selected && !selected.isCollapsed && (container.contains(selected.anchorNode) || container.contains(selected.focusNode));
}
function renderText(container, text) {
  if (renderedMessageText.get(container) === text) { pendingMessageText.delete(container); return; }
  // Keep the actual selected/focused DOM alive until reading or copying ends.
  if (container.isConnected && readingInteraction(container)) { pendingMessageText.set(container, text); return; }
  pendingMessageText.delete(container);
  BionicMessageText.render(container, text, { role: container.dataset.messageRole });
  renderedMessageText.set(container, text);
}
function flushMessageText() {
  const follow = followingReply && !readingInteraction($('messages'));
  for (const [container, text] of pendingMessageText) {
    if (!container.isConnected) pendingMessageText.delete(container);
    else if (!readingInteraction(container)) renderText(container, text);
  }
  if (follow) scrollBottom(); else updateReplyFollow();
}
function nearReplyBottom() {
  const messages = $('messages');
  return messages.clientHeight ? messages.scrollHeight - messages.scrollTop - messages.clientHeight < 64 : followingReply;
}
function updateReplyFollow() {
  const waiting = [...pendingMessageText.keys()].some(container => container.isConnected);
  $('reply-follow-bar').hidden = !state.authenticated || nearReplyBottom() && !waiting || !$('messages').querySelector('.message');
}
function responseModelKey(message) { return JSON.stringify([state.projectId, message.requestId || message.localRequestId || '']); }
function addBudgetWarning(article, message) {
  const warning = node('section', 'message-truncated');
  warning.append(node('strong', '', appT('app.responseTruncated')), node('p', '', appT('app.truncatedHelp')));
  if (message.outputBudget) warning.append(node('p', 'message-budget', appT('app.outputBudget', { count: appNumber(message.outputBudget.maxOutputTokens) })));
  const model = responseModels.get(responseModelKey(message));
  const available = model && state.status?.models?.some(item => item.id === model);
  if (!available) warning.append(node('p', 'message-budget-target', (model ? appT('app.responseModelUnavailable') : appT('app.responseModelUnknown')) + appT('app.chooseNextModel')));
  const button = node('button', 'file-action message-budget-open', appT('app.setOutputLimit')); button.type = 'button';
  button.dataset.workspaceFocus = 'budget:' + (message.id || message.localRequestId || message.requestId || '');
  button.addEventListener('click', event => companionSettings.openOutput(event, available ? model : null));
  warning.append(button); article.append(warning);
}
function addFileAction(article, action, message) {
  const foreignProject = action.projectId && action.projectId !== state.projectId;
  let log = article.querySelector('.actions-log');
  if (!log) { log = node('details', 'actions-log'); log.dataset.disclosureKey = 'actions'; log.append(node('summary', '', appT('app.fileActions')), node('div', 'action-rows')); article.append(log); }
  const row = node('div', 'action-row' + (action.ok ? '' : ' action-failed'));
  if (action.id) row.dataset.actionId = action.id;
  row.append(node('strong', '', action.ok || action.name==='run_project_script' ? action.message : appT('app.actionFailed')), node('span', '', action.destination ? appT('app.fileDestination', { path: action.path || '', destination: action.destination }) : action.path || ''));
  for(const source of action.webResults || (action.url?[{title:action.url,url:action.url}]:[])){
    try{const url=new URL(source.url);if(!['https:','http:'].includes(url.protocol))continue;const link=node('a','tool-source',action.name==='read_web_page'?appT('app.sourcePage', { host: url.host }):source.title||source.url);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';row.append(link);}catch{}
  }
  if(action.outbound){const sent=node('details','outbound-receipt');sent.dataset.disclosureKey='outbound:'+action.id;sent.append(node('summary','',appT('app.outboundData')),node('p','',appT('app.host', { host: action.outbound.host || appT('app.configuredEngine') })),node('pre','',JSON.stringify(action.outbound,null,2)));row.append(sent);}
  if(action.stdout||action.stderr){const output=node('details','tool-output');output.dataset.disclosureKey='output:'+action.id;output.append(node('summary','',appT('app.scriptOutput')),node('pre','',(action.stdout||'')+(action.stderr?'\n'+action.stderr:'')));row.append(output);}
  if(!foreignProject&&action.ok&&action.trashId){const restore=node('button','file-action restore-action',action.restored?appT('app.fileRestored'):appT('app.restoreFile'));restore.type='button';restore.disabled=state.sending||!!action.restored;if(action.restored)restore.dataset.restored='true';restore.addEventListener('click',async()=>{restore.disabled=true;try{await api('/api/file/restore-trash',{method:'POST',body:JSON.stringify({projectId:state.projectId,chatId:state.chat.id,actionId:action.id})});action.restored=true;restore.textContent=appT('app.fileRestored');restore.dataset.restored='true';}catch(e){error(e.message);restore.disabled=false;}});row.append(restore);}
  if (!action.ok) row.append(node('p', '', action.executed ? appT('app.scriptExecutedWarning') : action.message));
  if (action.ok && /^(?:replace_project_text|write_project_file)$/.test(action.name)) log.open = true;
  if (foreignProject) row.append(node('span', 'action-origin', appT('app.foreignAction')));
  if (!foreignProject && action.ok && /^(?:replace_project_text|write_project_file)$/.test(action.name) && message) {
    const pin = workspace.pinControl(message, state.chat, action); if (pin) row.append(pin);
  }
  if (!foreignProject && action.backupId && action.hash && message) {
    const compare=node('button','file-action',appT('app.compareChange')); compare.type='button';compare.addEventListener('click',async()=>{compare.disabled=true;try{const result=await api('/api/files/action-diff',{method:'POST',body:JSON.stringify({projectId:state.projectId,sessionId:state.chat.id,messageId:message.id,actionId:action.id})});const view=node('details','passive-diff');view.open=true;view.append(node('summary','',result.label||appT('app.verifiedComparison')));if(result.status!=='comparable')view.append(node('p','',appT('app.laterVersionDiff')));else{const before=result.before.text.split(/\r?\n/),after=result.after.text.split(/\r?\n/),lines=[];const maximum=Math.min(2000,Math.max(before.length,after.length));for(let i=0;i<maximum;i++){if(before[i]===after[i])lines.push('  '+(before[i]??''));else{if(before[i]!==undefined)lines.push('− '+before[i]);if(after[i]!==undefined)lines.push('+ '+after[i]);}}view.append(node('p','',appT('app.lineComparison')),node('pre','',lines.join('\n')));if(maximum<Math.max(before.length,after.length))view.append(node('p','',appT('app.diffPreviewLimit')));}row.querySelector('.passive-diff')?.remove();row.append(view);}catch(e){error(e.message);}finally{compare.disabled=false;}});row.append(compare);
  }
  if (!foreignProject && action.backupId && action.hash) {
    const restore = node('button', 'file-action restore-action', action.restored ? appT('app.previousVersionRestored') : appT('app.restorePreviousVersion')); restore.type = 'button';
    if (action.restored) restore.dataset.restored = 'true';
    restore.disabled = state.sending || state.loading || state.uploading || !!action.restored;
    restore.addEventListener('click', async () => {
      restore.disabled = true;
      try {
        await api('/api/file/restore', { method: 'POST', body: JSON.stringify({ projectId: state.projectId, rootId: 'project', path: action.path, hash: action.hash, backupId: action.backupId, chatId: state.chat?.id, actionId: action.id }) });
        action.restored = true; restore.dataset.restored = 'true'; restore.textContent = appT('app.previousVersionRestored'); toast(appT('app.previousVersionRestoredPc'));
      } catch (e) { error(e.message); restore.disabled = false; }
    });
    row.append(restore);
  }
  log.querySelector('.action-rows').append(row);
  log.querySelector('summary').textContent = appT('app.activityCount', { count: log.querySelectorAll('.action-row').length });
}
function addToolApproval(article,approval,chat) {
  const web=approval.kind==='web', panel=node('section','tool-approval');panel.dataset.approvalId=approval.id;
  panel.append(node('h3','',web?appT('app.webApprovalTitle'):appT('app.scriptApprovalTitle')));
  if(web){const preview=node(approval.status==='pending'?'div':'details','web-approval-preview');if(approval.status!=='pending')preview.append(node('summary','',appT('app.showExactRequest')));preview.append(node('pre','',JSON.stringify({tool:approval.tool,...approval.parameters},null,2)));panel.append(node('p','tool-approval-meta',appT('app.host', { host: approval.host })),preview,node('p','tool-approval-scope',appT('app.webApprovalScope')));}
  else panel.append(node('p','tool-approval-meta',(approval.runtime||appT('app.script'))+' · '+(approval.cwd||approval.directory||appT('app.projectFolder'))),node('pre','',approval.code||''),node('p','tool-approval-scope',appT('app.scriptApprovalScope')));
  const labels={pending:appT('app.approvalPending'),approved:appT('app.approvalGranted'),denied:web?appT('app.webDenied'):appT('app.scriptDenied'),expired:web?appT('app.webApprovalExpired'):appT('app.scriptApprovalExpired'),cancelled:appT('app.approvalCancelled')};
  panel.append(node('p','tool-approval-status',approval.executionStatus==='interrupted'?appT('app.executionInterrupted'):approval.executionStatus||labels[approval.status]||approval.status));
  if(approval.status==='pending'&&Date.now()<approval.expiresAt){const controls=node('div','workspace-actions');for(const [decision,label]of [['approve',web?appT('app.approveWeb'):appT('app.approveScript')],['deny',appT('app.deny')]]){const button=node('button',decision==='approve'?'file-save':'file-action',label);button.type='button';button.dataset.workspaceFocus='approval:'+approval.id+':'+decision;button.addEventListener('click',async()=>{controls.querySelectorAll('button').forEach(x=>x.disabled=true);try{const result=await api('/api/tool-approval',{method:'POST',body:JSON.stringify({id:approval.id,projectId:chat.projectId,chatId:chat.id,decision})});approval.status=result.status;await recoverReplies();renderChat();}catch(e){error(e.message);controls.querySelectorAll('button').forEach(x=>x.disabled=false);}});controls.append(button);}panel.append(controls);}
  article.append(panel);
}

function messageCopyControl(label) {
  const copy=BionicMessageText.copyControl(()=>copy.closest('.message')?.querySelector('.message-body'),()=>renderedMessageText.get(copy.closest('.message')?.querySelector('.message-body'))||'',{label});
  return copy;
}
function groupMessageExtras(article, message, role) {
  const auxiliary = [...article.children].filter(child => child.matches('.actions-log,.message-metrics,.context-receipt,.pin-control,.message-effort,.message-budget:not(.message-budget-adjusted)'));
  const failed = (message.actions || []).some(action => action.ok === false);
  const grouped = auxiliary.filter(child => {
    if (!failed || !child.matches('.actions-log') || !child.querySelector('.action-rows')) return true;
    child.classList.add('action-warning');
    child.open = true;
    child.querySelector('summary').textContent = appT('app.failedActions', { count: (message.actions || []).filter(action => action.ok === false).length });
    return false;
  });
  if (!grouped.length) return;
  const details = node('details', 'message-extras'); details.dataset.disclosureKey = 'message-extras';
  const summary = node('summary'); summary.dataset.workspaceFocus = 'message-extras:' + (message.id || message.localRequestId || message.requestId || '');
  if (message.role === 'user') { summary.append(icon('more'), node('span','sr-only',appT('app.messageActions'))); summary.title = appT('app.messageActions'); }
  else {
    summary.append(node('span','message-extras-label',appT('app.turnDetails')));
    if(message.metrics){
      const m=message.metrics,format=value=>appNumber(value,{maximumFractionDigits:1});
      const hasTotal=Number.isFinite(m.totalSeconds)&&m.totalSeconds>=0,total=hasTotal?m.totalSeconds:m.responseSeconds;
      const duration=Number.isFinite(total)&&total>=0?format(total)+' s':'— s';
      const tokens=Number.isSafeInteger(m.outputTokens)&&m.outputTokens>=0?format(m.outputTokens)+' tokens':'— tokens';
      const rate=Number.isFinite(m.tokensPerSecond)&&m.tokensPerSecond>0?(m.rateSource==='observed'?'≈ ':'')+format(m.tokensPerSecond)+' tok/s':'— tok/s';
      const measures=node('span','message-turn-measures'),time=node('span','message-turn-duration',duration),throughput=node('span','message-turn-throughput',tokens+' · '+rate);
      time.title=appT(hasTotal?'app.beta25.totalTitle':'app.beta25.turnTitle')+(duration.startsWith('—')?appT('app.unavailableSuffix'):'');
      throughput.title=appT('app.throughputTitle', { estimated: m.rateSource === 'observed' ? appT('app.estimatedSuffix') : '' });
      measures.append(time);
      if(Number.isFinite(m.queueSeconds)&&m.queueSeconds>0){const wait=node('span','message-turn-wait',appT('app.beta25.waitMetric',{seconds:format(m.queueSeconds)}));wait.title=appT('app.beta25.waitTitle');measures.append(wait);}
      measures.append(throughput);summary.append(measures);
    }
  }
  const content = node('div','message-extras-content');
  for (const child of grouped) { if (!child.dataset.disclosureKey) child.dataset.disclosureKey = child.classList[0]; content.append(child); }
  details.append(summary, content);
  details.addEventListener('keydown', event => { if (event.key === 'Escape' && details.open) { event.preventDefault(); details.open = false; summary.focus({preventScroll:true}); } });
  if (message.role === 'user') details.addEventListener('focusout', event => { if (event.relatedTarget && !details.contains(event.relatedTarget)) details.open = false; });
  if (message.role === 'user') role.querySelector('.message-actions').append(details); else article.append(details);
}
function addMessage(message, parent = $('messages'), renderBody = true) {
  const article = node('article', 'message ' + message.role);
  if (message.id) { article.dataset.messageId = message.id; article.tabIndex = -1; }
  if (message.requestId || message.localRequestId) article.dataset.requestId = message.requestId || message.localRequestId;
  article.dataset.messageKey = (message.requestId || message.localRequestId) ? (message.requestId || message.localRequestId) + '-' + message.role : message.id || '';
  const role = node('div', 'message-role', message.role === 'user' ? appT('app.roleUser') : appT('app.roleAssistant'));
  if (message.fromBionic) role.append(node('span', 'origin-tag', appT('app.bionicHistory')));
  else if(message.fromFork)role.append(node('span','origin-tag',appT('app.copiedFromSource')));
  const actions = node('div', 'message-actions'); role.append(actions);
  const content = node('div', 'message-body'); content.dataset.messageRole = message.role;
  if (renderBody) renderText(content, message.text || '');
  article.append(role, content);
  const storedCapabilityNotice = capabilityNotices.get(JSON.stringify([state.projectId, message.requestId || message.localRequestId]));
  const capabilityNotice = storedCapabilityNotice?.key ? appT(storedCapabilityNotice.key) : message.capabilityNotice || storedCapabilityNotice?.message;
  if (message.role === 'assistant' && capabilityNotice) article.append(node('p', 'message-capability-notice', capabilityNotice));
  if (message.text && (message.role==='user'||message.role==='assistant')) {
    const copy=messageCopyControl(message.role==='user'?appT('app.copyPrompt'):appT('app.copyResponse'));copy.dataset.workspaceFocus='message-copy:'+article.dataset.messageKey;actions.append(copy);
  }
  if (message.attachments?.length) {
    const files = node('div', 'message-attachments');
    for (const file of message.attachments) {
      const details = node('details'); details.append(node('summary', '', file.name + (file.excerpt ? appT('app.attachmentExcerptSuffix') : appT('app.attachmentFileSuffix'))));
      if (file.kind === 'image') { const image = node('img', 'message-image'); image.alt = file.name; image.loading = 'lazy'; image.src = '/api/attachment-image?' + new URLSearchParams({ hash: file.hash, mime: file.mime }); details.append(image); }
      else details.append(node('pre', '', file.text));
      files.append(details);
    }
    article.append(files);
  }
  for (const intent of message.mutationIntents || []) if (intent.status === 'uncertain' || intent.status === 'pending') {
    const warning=node('div','mutation-warning'); warning.append(node('strong','',appT('app.operationUncertain')),node('p','',intent.tool+(intent.path?' · '+intent.path:'')),node('p','',intent.message||appT('app.operationUncertainHelp')));
    for(const copy of intent.backupCandidates||[]) { const a=node('a','file-action',appT('app.downloadVerifiedBackup'));a.href='/api/files/backup/download?'+new URLSearchParams({projectId:state.projectId,backupId:copy.id});a.download='';warning.append(a); }
    article.append(warning);
  }
  if(message.imageGenerations?.length)article.append(imageGenerationView.gallery(message.imageGenerations,state.chat,message));
  for (const action of message.actions || []) addFileAction(article, action, message);
  for(const approval of message.approvals||[])addToolApproval(article,approval,state.chat);
  if(message.historicalActions?.length){const history=node('details','actions-log');history.append(node('summary','',appT('app.historicalActionCount', { count: appNumber(message.historicalActions.length) })));for(const action of message.historicalActions)history.append(node('p','message-footer',(action.message||action.name||appT('app.action'))+(action.path?' · '+action.path:'')));article.append(history);}
  if(message.id&&!(message.role==='assistant'&&(message.complete===false||state.chat?.generation?.status==='running'&&state.chat.generation.replyId===message.id))){const fork=node('button','message-copy-icon message-fork');fork.type='button';fork.title=appT('app.branchFromHere');fork.setAttribute('aria-label',fork.title);fork.dataset.workspaceFocus='message-fork:'+article.dataset.messageKey;fork.append(icon('branch'));fork.addEventListener('click',()=>forkChat(message.id));actions.append(fork);}
  const footer = [];
  if (message.reasoning && EFFORT_LABEL_KEYS[message.reasoning]) article.append(node('p', 'message-footer message-effort', appT('app.effortValue', { value: effortLabel(message.reasoning) })));
  if (message.truncated) addBudgetWarning(article, message);
  if (message.outputBudget && !message.truncated) { const b=message.outputBudget; article.append(node('p','message-budget'+(b.adjusted?' message-budget-adjusted':''),appT('app.outputBudgetAdjusted', { count: appNumber(b.maxOutputTokens), adjusted: b.adjusted ? appT('app.budgetAdjustedSuffix') : '' }))); }
  if (message.interrupted || message.limited&&!message.truncated) footer.push(message.interrupted ? appT('app.responseInterrupted') : appT('app.actionLimitHelp'));
  if (footer.length) article.append(node('p', 'message-footer', footer.join(' · ')));
  if (message.metrics && message.role === 'assistant') {
    const m = message.metrics;
    const number = value => appNumber(value, { maximumFractionDigits: 1 });
    const rate = Number.isFinite(m.tokensPerSecond) && m.tokensPerSecond > 0;
    const summary = [];
    if (rate) summary.push(appT('app.throughput', { approximate: m.rateSource === 'observed' ? '≈ ' : '', rate: number(m.tokensPerSecond) }));
    if (Number.isSafeInteger(m.outputTokens)) summary.push(appT('app.generatedTokens', { count: number(m.outputTokens) }));
    if (summary.length || Number.isFinite(m.totalSeconds) || Number.isFinite(m.queueSeconds) || Number.isFinite(m.responseSeconds)) {
      const details = node('details', 'message-metrics');
      details.append(node('summary', '', summary.join(' · ') || appT('app.turnMetrics')));
      const explanations = [];
      if (rate) explanations.push(m.rateSource === 'observed' ? appT('app.observedRateHelp') : appT('app.bionicRateHelp'));
      if (Number.isFinite(m.firstFragmentSeconds)) explanations.push(appT('app.firstFragment', { seconds: number(m.firstFragmentSeconds) }));
      if (Number.isFinite(m.totalSeconds)&&m.totalSeconds>=0) explanations.push(appT('app.beta25.totalDetail',{seconds:number(m.totalSeconds)}));
      if (Number.isFinite(m.queueSeconds)&&m.queueSeconds>0) explanations.push(appT('app.beta25.waitDetail',{seconds:number(m.queueSeconds)}));
      if (Number.isFinite(m.responseSeconds)&&m.responseSeconds>=0) explanations.push(appT('app.beta25.turnDetail',{seconds:number(m.responseSeconds)}));
      if (Number.isSafeInteger(m.inputTokens)) explanations.push(appT('app.inputTokens', { label: appT(m.generationPhases > 1 ? 'app.inputTokensLabel' : 'app.contextTokensLabel'), count: number(m.inputTokens) }));
      if (m.generationPhases > 1) explanations.push(appT('app.generationPhases', { count: m.generationPhases }));
      if (m.reasoningTokens > 0) explanations.push(appT('app.reasoningTokens', { count: number(m.reasoningTokens) }));
      if (!rate) explanations.push(appT('app.rateUnavailable'));
      details.append(node('p', '', explanations.join(' '))); article.append(details);
    }
  }
  if (message.role === 'assistant') {
    article.append(workspace.contextControl(message));
    const running = state.chat?.generation?.status === 'running' && (state.chat.generation.replyId === message.id || (message.requestId || message.localRequestId) === state.chat.generation.requestId);
    if (!running && message.text) { const pin = workspace.pinControl(message, state.chat); if (pin) article.append(pin); }
  }
  groupMessageExtras(article, message, role);
  parent.append(article); return content;
}
function scrollBottom() { $('messages').scrollTop = $('messages').scrollHeight; followingReply = true; updateReplyFollow(); }
function renderQueue(chat, parent = $('messages')) {
  const queue = [...(chat?.queue || []).filter(item => ['queued', 'interrupted', 'error'].includes(item.status)), ...(draftForView().failed || [])];
  for (const job of currentJobs()) {
    if (job.payload && !chat?.messages?.some(message => message.requestId === job.requestId) && !queue.some(item => item.requestId === job.requestId)) queue.push({ ...job.payload, phase:job.phase, status: job.status === 'submitting' ? 'submitting' : 'queued' });
  }
  for (const item of queue) {
    const article = node('article', 'message queued-message');
    article.dataset.messageKey = 'queue:' + item.requestId;
    const interrupted = item.status === 'interrupted' || item.status === 'error', submitting = item.status === 'submitting';
    const role=node('div', 'message-role', interrupted ? appT('app.queueInterrupted') : submitting ? appT('app.sendingPc') : appT(item.phase==='waiting-model'?'app.beta25.waitingGpu':'app.queueWaiting'));article.append(role);
    const content = node('div', 'message-body'); content.dataset.messageRole = 'user'; renderText(content, item.text || ''); article.append(content);
    if(item.text){const copy=messageCopyControl(appT('app.copyPrompt'));copy.dataset.workspaceFocus='message-copy:'+article.dataset.messageKey;const actions=node('div','message-actions');actions.append(copy);role.append(actions);}
    if (item.attachments?.length) article.append(node('p', 'message-footer', appT('app.attachedFiles', { count: item.attachments.length })));
    const actions = node('div', 'queue-actions');
    if (interrupted) {
      const reuse = node('button', 'file-action', appT('app.resumeDraft')); reuse.type = 'button';
      reuse.addEventListener('click', () => {
        if ($('prompt').value.trim() || fileBrowser.snapshot().length) return toast(appT('app.draftAlreadyFilled'));
        $('prompt').value = item.text || ''; $('model').value = item.model || $('model').value;
        const sameProject = !item.projectId || item.projectId === state.projectId;
        state.draftReasoning[$('model').value] = item.reasoning || 'default'; state.draftFileProfile = sameProject && !unassignedProject() ? fileProfile(item,'none') : 'none'; $('agent-files').value = state.draftFileProfile; state.draftWebApproval = item.webApproval === true; $('agent-web-approval').checked = state.draftWebApproval;
        state.draftWebAccess = item.webAccess === true; state.draftScriptAccess = sameProject && !unassignedProject() && item.scriptAccess === true;
        $('agent-web').checked = state.draftWebAccess; $('agent-scripts').checked = state.draftScriptAccess;
        state.draftImageAccess = item.imageAccess === true;
        state.draftImageCount = normalizedImageCount(item.imageCount);
        state.draftImageModelPolicy = item.imageModelPolicy??'';
        state.draftImageWorkflowId = item.imageSelection?.workflowId ?? item.imageWorkflowId ?? null;
        $('agent-images').checked = state.draftImageAccess;
        companionSettings.imagePermission();
        const references = sameProject ? item.attachmentReferences || item.attachments || [] : [];
        if (!sameProject && item.attachments?.length) toast(appT('app.reattachResumed'));
        fileBrowser.restore(references.map(reference => ({ ...reference, name: item.attachments?.find(file => file.path === reference.path && file.rootId === reference.rootId)?.name || reference.name })));
        saveDraft(); setEffort(); $('prompt').focus();
        if (item.local) { const draft = draftForView(); draft.failed = (draft.failed || []).filter(failed => failed.requestId !== item.requestId); rememberDrafts(); renderChat(); }
      }); actions.append(reuse);
    } else if (!submitting) {
      const remove = node('button', 'file-action', appT('app.removeFromQueue')); remove.type = 'button';
      const target = { projectId: state.projectId, id: chat?.id, requestId: item.requestId };
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { await api('/api/cancel', { method: 'POST', body: JSON.stringify(target) }); await recoverReplies(); }
        catch (e) { toast(e.message); remove.disabled = false; }
      }); actions.append(remove);
    }
    article.append(actions); parent.append(article);
  }
}
function messageDisclosures(article) {
  const counts = new Map();
  return [...article.querySelectorAll('details')].map(detail => {
    const base = detail.dataset.disclosureKey || detail.className || 'details';
    const index = counts.get(base) || 0; counts.set(base, index + 1);
    return { detail, key: base + ':' + index };
  });
}
function captureMessageSelection() {
  const selected = window.getSelection();
  if (!selected || selected.isCollapsed || !selected.rangeCount) return null;
  function point(target, offset) {
    const element = target.nodeType === 1 ? target : target.parentElement;
    const article = element?.closest('.message[data-message-key]');
    if (!article || !$('messages').contains(article)) return null;
    const scope = element.closest('[data-action-id],[data-approval-id],[data-image-job-id],details[data-disclosure-key],.message-body') || article;
    const kind = scope.dataset.actionId ? 'actionId' : scope.dataset.approvalId ? 'approvalId' : scope.dataset.imageJobId ? 'imageJobId' : scope.dataset.disclosureKey ? 'disclosureKey' : scope.classList.contains('message-body') ? 'body' : 'article';
    const candidate = element.closest('pre,code,p,li,td,th,summary,h2,h3');
    const leaf = candidate && scope.contains(candidate) ? candidate : scope;
    const range = document.createRange(); range.setStart(leaf, 0); range.setEnd(target, offset);
    return { messageKey: article.dataset.messageKey, kind, id: scope.dataset[kind], tag: leaf.tagName, index: leaf === scope ? -1 : [...scope.querySelectorAll(leaf.tagName)].indexOf(leaf), text: leaf.textContent, offset: range.toString().length };
  }
  const anchor = point(selected.anchorNode, selected.anchorOffset), focus = point(selected.focusNode, selected.focusOffset);
  return anchor && focus ? { anchor, focus, text: selected.toString() } : null;
}
function restoreMessageSelection(saved) {
  if (!saved) return;
  const selected = window.getSelection();
  if (!selected || selected.toString() === saved.text && !selected.isCollapsed) return;
  function point(record) {
    const article = [...$('messages').querySelectorAll('.message[data-message-key]')].find(item => item.dataset.messageKey === record.messageKey);
    if (!article) return null;
    const selectors = { actionId: '[data-action-id]', approvalId: '[data-approval-id]', imageJobId: '[data-image-job-id]', disclosureKey: '[data-disclosure-key]', body: '.message-body' };
    const scope = record.kind === 'article' ? article : [...article.querySelectorAll(selectors[record.kind])].find(item => !record.id || item.dataset[record.kind] === record.id);
    if (!scope) return null;
    const leaf = record.index === -1 ? scope : scope.querySelectorAll(record.tag)[record.index];
    if (!leaf || !leaf.textContent.startsWith(record.text)) return null;
    const walker = document.createTreeWalker(leaf, 4); let offset = record.offset, target = walker.nextNode(), last;
    while (target) { if (offset <= target.length) return [target, offset]; offset -= target.length; last = target; target = walker.nextNode(); }
    return last ? [last, last.length] : [leaf, 0];
  }
  const anchor = point(saved.anchor), focus = point(saved.focus);
  if (anchor && focus) selected.setBaseAndExtent(...anchor, ...focus);
}
function keepChildOrder(parent, children) {
  let cursor = parent.firstChild;
  for (const child of children) {
    if (child === cursor) cursor = cursor.nextSibling;
    else parent.insertBefore(child, cursor);
  }
  while (cursor) { const next = cursor.nextSibling; cursor.remove(); cursor = next; }
}
function reconcileMessage(previous, next, text) {
  const available = new Map();
  const partKey = part => part.dataset.approvalId || part.dataset.imageJobId || part.className || part.tagName;
  for (const part of previous.children) {
    const key = partKey(part); if (!available.has(key)) available.set(key, []); available.get(key).push(part);
  }
  const children = [...next.children].map(part => {
    const old = available.get(partKey(part))?.shift();
    if (old?.classList.contains('message-body')) { old.dataset.messageRole = part.dataset.messageRole; renderText(old, text); return old; }
    return old?.isEqualNode(part) ? old : part;
  });
  previous.className = next.className;
  for (const [name, value] of Object.entries(next.dataset)) previous.dataset[name] = value;
  if (next.hasAttribute('tabindex')) previous.tabIndex = next.tabIndex;
  keepChildOrder(previous, children);
  return previous;
}
function renderChat({ preserveComposer = false } = {}) {
  const chat = state.chat, project = state.projects.find(p => p.id === state.projectId);
  const view = JSON.stringify([state.projectId, state.viewKey]), sameView = readingView === view;
  const oldScroll = $('messages').scrollTop;
  const textSelection = sameView ? captureMessageSelection() : null;
  const follow = !sameView || followingReply && nearReplyBottom() && !readingInteraction($('messages'));
  readingView = view;
  const previous = new Map(sameView ? [...$('messages').querySelectorAll(':scope > .message[data-message-key]')].map(article => [article.dataset.messageKey, article]) : []);
  const disclosureState = new Map();
  for (const article of previous.values()) for (const {detail, key} of messageDisclosures(article)) disclosureState.set(article.dataset.messageKey + ':' + key, detail.open);
  const focus = document.activeElement?.dataset.workspaceFocus;
  const focusedDisclosure = document.activeElement?.tagName === 'SUMMARY' ? document.activeElement.closest('details[data-disclosure-key]') : null;
  const disclosureFocus = focusedDisclosure ? { key: focusedDisclosure.dataset.disclosureKey, messageKey: focusedDisclosure.closest('.message')?.dataset.messageKey } : null;
  const selection = focus && typeof document.activeElement.selectionStart === 'number' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  if (!preserveComposer) {
  $('agent-files').value = unassignedProject() ? 'none' : state.draftFileProfile ?? fileProfile(chat);
  $('agent-web-approval').checked = state.draftWebApproval ?? chat?.webApproval ?? false;
  $('agent-web').checked = state.draftWebAccess ?? chat?.webAccess ?? true;
  $('agent-scripts').checked = unassignedProject() ? false : state.draftScriptAccess ?? chat?.scriptAccess ?? false;
  $('agent-images').checked = state.draftImageAccess ?? chat?.imageAccess ?? companionSettings.imageDefaultEnabled();
  }
  $('thread-title').textContent = chat?.name || appT('app.newChat');
  $('thread-subtitle').textContent = (project?.name || appT('app.projectFallback')) + (chat?.source === 'bionic' ? appT('app.historySubtitle') : appT('app.webSubtitle'));
  $('banner').hidden = false;
  let banner = chat?.source === 'bionic' ? appT('app.nativeBanner') : chat?.origin?.kind==='fork' ? appT('app.forkBanner', { name: chat.origin.name }) : chat?.origin ? appT('app.continuationBanner', { name: chat.origin.name }) : appT('app.webBanner');
  if (chat?.truncated || chat?.importedTruncated) banner += appT('app.longHistorySuffix');
  if (chat?.omitted?.attachments) banner += appT('app.hiddenAttachmentsSuffix');
  if (chat?.model && !(state.status?.models || []).some(m => m.id === chat.model)) banner += appT('app.originalModelMissingSuffix');
  $('banner').replaceChildren(document.createTextNode(banner));
  if(chat?.origin){$('banner').append(node('span','',appT('app.sharedFilesSuffix')));const source=node('button','source-link',appT('app.viewSource'));source.type='button';source.addEventListener('click',()=>visitSource(chat.origin,source));$('banner').append(source);}
  const nextMessages = document.createDocumentFragment(), displayText = new Map();
  if (chat?.messages?.length) for (const m of chat.messages) {
    const body = addMessage(m, nextMessages, false);
    const text = m.role === 'assistant' && !m.text && chat.generation?.status === 'running' && (m.requestId === chat.generation.requestId || m.localRequestId === chat.generation.requestId) ? appT('app.modelPreparing') : m.text || '';
    displayText.set(body.parentElement.dataset.messageKey, text);
  }
  else { const empty = node('div', 'welcome'); empty.append(node('h2', '', appT('app.welcomeTitle')), node('p', '', appT('app.welcomeHelp'))); nextMessages.append(empty); }
  renderQueue(chat, nextMessages);
  const nextArticles = [...nextMessages.children].map(article => {
    for (const {detail, key} of messageDisclosures(article)) {
      const identity = article.dataset.messageKey + ':' + key;
      if (disclosureState.has(identity)) detail.open = disclosureState.get(identity);
    }
    const text = displayText.get(article.dataset.messageKey);
    const old = previous.get(article.dataset.messageKey);
    if (old) return reconcileMessage(old, article, text ?? renderedMessageText.get(article.querySelector('.message-body')) ?? '');
    if (text !== undefined) renderText(article.querySelector('.message-body'), text);
    return article;
  });
  keepChildOrder($('messages'), nextArticles);
  for (const container of pendingMessageText.keys()) if (!container.isConnected) pendingMessageText.delete(container);
  const semanticSummary = disclosureFocus && [...$('messages').querySelectorAll('details[data-disclosure-key]')].find(detail => detail.dataset.disclosureKey === disclosureFocus.key && detail.closest('.message')?.dataset.messageKey === disclosureFocus.messageKey)?.querySelector('summary');
  if (semanticSummary) semanticSummary.focus({ preventScroll: true });
  else if (focus) { const input = [...$('messages').querySelectorAll('[data-workspace-focus]')].find(el => el.dataset.workspaceFocus === focus); if (input) { input.focus({ preventScroll: true }); if (selection) input.setSelectionRange(...selection); } }
  restoreMessageSelection(textSelection);
  const selectedModel = preserveComposer ? $('model').value : draftForView().model;
  $('model').value = (state.status?.models || []).some(model => model.id === selectedModel) ? selectedModel : modelForChat();
  setEffort();
  updateHistoryControls();
  if (follow) scrollBottom(); else { $('messages').scrollTop = sameView ? oldScroll : 0; followingReply = false; updateReplyFollow(); }
  renderSessions();
  setSending();
}
async function openChat(id) {
  if (state.uploading || conversationMove.busy) return;
  const sameTarget = state.chat?.id === id && state.chat?.projectId === state.projectId;
  if (!sameTarget) readingView = null;
  closeConversationOptions();
  saveDraft();
  const seq = ++state.viewSeq, pid = state.projectId;
  state.loading = true; state.chat = chats.get(chatKey(pid, id)) || null; restoreDraft(chatKey(pid, id)); setSending();
  error(''); $('app').classList.add('thread-open');
  $('thread-title').textContent = appT('app.openingConversation');
  if (!sameTarget) $('messages').replaceChildren(node('p', 'loading-label', appT('app.openingConversation')));
  try {
    const chat = await fetchConversationPage(pid, id);
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
  $('send').setAttribute('aria-label', state.sending ? appT('app.addToQueue') : appT('app.sendMessage'));
  $('send').title = state.sending ? appT('app.addToQueue') : appT('app.sendMessage');
  $('send').classList.toggle('queue-send', state.sending);
  $('send-label').textContent = state.sending ? appT('app.addToQueue') : '';
  for (const id of ['project', 'new-chat']) $(id).disabled = state.uploading || conversationMove.busy;
  $('refresh').disabled = connectionRefreshing || state.uploading || conversationMove.busy;
  syncProjectManagement();
  $('generate-image-direct').disabled = locked || unresolved || !state.projectId || !companionSettings.enabled();
  $('model').disabled = locked;
  for (const id of ['files-open-sidebar', 'attach-file', 'upload-file','upload-attach-file']) $(id).disabled = locked || !state.projectId || unassignedProject();
  $('agent-files').disabled = locked || unassignedProject();
  $('fork-chat').disabled = locked || !state.chat?.id;
  $('agent-images').checked=state.draftImageAccess??state.chat?.imageAccess??companionSettings.imageDefaultEnabled();
  $('agent-images').disabled = locked || !companionSettings.enabled(); $('agent-web').disabled = locked; $('agent-scripts').disabled = locked || unassignedProject();
  companionSettings.imagePermission();
  $('image-workflow').disabled = locked || !companionSettings.enabled();
  $('image-count').disabled = locked || !companionSettings.enabled() || !$('agent-images').checked;
  $('image-model-policy').disabled = locked || !companionSettings.enabled() || !$('agent-images').checked;
  $('agent-web-approval').disabled = locked || !$('agent-web').checked;
  $('files-permission-state').textContent = ({none:appT('app.filesDisabled'),read:appT('app.filesRead'),write:appT('app.filesWrite')}[currentFileProfile()]) + ($('agent-web').checked ? appT('app.webToolsSuffix') : '') + ($('agent-scripts').checked ? appT('app.scriptToolsSuffix') : '') + (companionSettings.enabled()&&$('agent-images').checked ? appT('app.beta25.imageSuffix',{count:normalizedImageCount($('image-count').value)}) : '');
  $('logout').disabled = state.uploading || conversationMove.busy;
  document.querySelectorAll('.restore-action').forEach(button => button.disabled = locked || state.sending || button.dataset.restored === 'true');
  $('effort').disabled = locked || !(state.status?.models || []).find(model => model.id === $('model').value)?.reasoning?.allowedOptions.length;
  document.querySelectorAll('.session,.project-toggle,.project-select,.project-more').forEach(b => b.disabled = state.uploading || conversationMove.busy);
  const queued = Math.max(state.chat?.queue?.filter(item => item.status === 'queued').length || 0, active.filter(job => job.status === 'queued').length);
  $('composer-activity').hidden = !state.sending;
  const activityText = state.chat?.generation?.awaitingApproval ? appT('app.approvalActivity') : unresolved ? appT('app.sendingActivity') : (running ? appT('app.runningActivity') : '') + (queued ? appT('app.queuedActivity', { count: queued }) : '') + appT('app.keepWritingSuffix');
  setText($('composer-activity'), state.chat?.generation?.phase === 'waiting-image' ? appT('app.beta24.waitingImageHelp') : ['waiting-model','waiting-resource','waiting-image-resource'].includes(state.chat?.generation?.phase) ? appT('app.beta24.waitingResourceHelp') : activityText);
  $('composer-note').textContent = state.sending ? appT('app.queueComposerHelp') : unassignedProject() ? appT('app.unassignedComposerHelp') : currentFileProfile()==='write' ? appT('app.writeComposerHelp') : currentFileProfile()==='read' ? appT('app.readComposerHelp') : appT('app.noneComposerHelp');
  if(companionSettings.enabled()&&$('agent-images').checked) $('composer-note').textContent += appT('app.beta25.imageComposerHelp',{count:normalizedImageCount($('image-count').value)});
  if($('agent-scripts').checked) $('composer-note').textContent += appT('app.scriptComposerHelp');
  if($('agent-web').checked) $('composer-note').textContent += appT('app.webComposerHelp');
  updateConversationOptions();
  fileBrowser.refresh();
}
function syncProjectManagement() {
  const project = state.projects.find(item => item.id === state.projectId);
  const locked = projectManagement.busy || state.loading || state.uploading || conversationMove.busy;
  for (const id of ['local-project-create', 'project-adoption-preview', 'project-adoption-confirm', 'project-adoption-cancel']) $(id).disabled = locked;
  $('local-project-name').disabled = locked;
  $('project-adoption').hidden = !project || !!project.isUnassigned || !!project.locallyOwned || !!project.localOnly;
  if (projectManagement.preview && projectManagement.preview.id !== state.projectId) clearProjectAdoption();
}
function clearProjectAdoption() {
  projectManagement.preview = null; ++projectManagement.revision;
  $('project-adoption-form').hidden = true; $('project-adoption-roots').replaceChildren();
}
function projectManagementMessage(id, text = '') { appLabelBindings.delete(id); $(id).textContent = text; $(id).hidden = !text; }
function projectManagementLabel(id, key, params) { $(id).hidden = false; setAppLabel(id, key, params); }
async function createLocalProject(event) {
  event.preventDefault(); if (projectManagement.busy || $('local-project-create').disabled) return;
  const name = $('local-project-name').value.trim(); if (!name) return;
  const epoch = state.authEpoch; projectManagement.busy = true; setSending();
  projectManagementMessage('local-project-error'); projectManagementLabel('local-project-status', 'app.beta24.creatingProject');
  try {
    const { project } = await api('/api/local-projects', { method: 'POST', body: JSON.stringify({ name }) });
    if (epoch !== state.authEpoch || !state.authenticated) return;
    await loadProjects(); await selectProject(project.id);
    if (epoch !== state.authEpoch || !state.authenticated) return;
    $('local-project-name').value = ''; $('project-management').open = false;
    toastLabel('app.beta24.projectCreated'); $('project').focus();
  } catch (failure) { if (epoch === state.authEpoch && state.authenticated) projectManagementMessage('local-project-error', failure.message); }
  finally { projectManagement.busy = false; if (epoch === state.authEpoch && state.authenticated) { projectManagementMessage('local-project-status'); setSending(); } }
}
async function previewProjectAdoption() {
  if ($('project-adoption-preview').disabled) return;
  clearProjectAdoption(); const revision = projectManagement.revision, epoch = state.authEpoch, projectId = state.projectId;
  projectManagement.busy = true; setSending(); projectManagementMessage('local-project-error'); projectManagementLabel('local-project-status', 'app.beta24.readingRoots');
  try {
    const preview = await api('/api/local-projects/adoption?' + new URLSearchParams({ projectId }));
    if (revision !== projectManagement.revision || epoch !== state.authEpoch || projectId !== state.projectId || !state.authenticated) return;
    projectManagement.preview = preview;
    setAppLabel('project-adoption-title', 'app.beta24.adoptTitle', { name: preview.name });
    if (preview.notice === 'Choisis les dossiers et leurs droits. Les historiques Bionic restent en lecture seule.') setAppLabel('project-adoption-notice', 'app.beta24.adoptionNotice');
    else { appLabelBindings.delete('project-adoption-notice'); $('project-adoption-notice').textContent = preview.notice; }
    for (const root of preview.roots) {
      const row = node('fieldset', 'project-adoption-root'), legend = node('legend', '', root.name), includeLabel = node('label'), include = node('input');
      include.type = 'checkbox'; include.dataset.rootId = root.id; includeLabel.append(include, globalThis.BionicI18n.bindText(node('span'), 'app.beta24.allowRootRead'));
      const writeLabel = node('label'), write = node('input'); write.type = 'checkbox'; write.dataset.writeFor = root.id; write.disabled = true;
      include.addEventListener('change', () => { write.disabled = !include.checked || !root.writable; if (write.disabled) write.checked = false; });
      writeLabel.append(write, globalThis.BionicI18n.bindText(node('span'), root.writable ? 'app.beta24.allowRootWrite' : 'app.beta24.rootWriteDenied'));
      row.append(legend, node('p', 'project-root-path', root.path), includeLabel, writeLabel); $('project-adoption-roots').append(row);
    }
    if (!preview.roots.length) $('project-adoption-roots').append(globalThis.BionicI18n.bindText(node('p'), 'app.beta24.noSharedRoot'));
    $('project-adoption-form').hidden = false; $('project-adoption-title').focus({ preventScroll: true });
  } catch (failure) { if (revision === projectManagement.revision && epoch === state.authEpoch && state.authenticated) projectManagementMessage('local-project-error', failure.message); }
  finally { projectManagement.busy = false; if (epoch === state.authEpoch && state.authenticated) { projectManagementMessage('local-project-status'); setSending(); } }
}
async function adoptProject(event) {
  event.preventDefault(); const preview = projectManagement.preview;
  if (!preview || $('project-adoption-confirm').disabled || preview.id !== state.projectId) return;
  const roots = [...$('project-adoption-roots').querySelectorAll('input[data-root-id]')].filter(input => input.checked).map(input => {
    const write = [...$('project-adoption-roots').querySelectorAll('input[data-write-for]')].find(control => control.dataset.writeFor === input.dataset.rootId);
    return { id: input.dataset.rootId, writable: !!write?.checked && !write.disabled };
  });
  const epoch = state.authEpoch; projectManagement.busy = true; setSending(); projectManagementMessage('local-project-error');
  try {
    await api('/api/local-projects/adopt', { method: 'POST', body: JSON.stringify({ projectId: preview.id, fingerprint: preview.fingerprint, roots }) });
    if (epoch !== state.authEpoch || !state.authenticated) return;
    clearProjectAdoption(); await loadProjects(); $('project-management').open = false;
    toastLabel('app.beta24.projectAdopted'); $('project').focus();
  } catch (failure) { if (epoch === state.authEpoch && state.authenticated) projectManagementMessage('local-project-error', failure.message); }
  finally { projectManagement.busy = false; if (epoch === state.authEpoch && state.authenticated) setSending(); }
}
function scheduleRecovery() {
  clearTimeout(recoveryTimer);
  if (state.authenticated) recoveryTimer = setTimeout(recoverReplies, jobs.size ? 1500 : 6000);
}
function mergeConversationPage(previous, incoming, older = false) {
  if (!previous || previous.id !== incoming.id || previous.projectId !== incoming.projectId || !incoming.pagination) return incoming;
  const currentMessages = previous.messages || [], received = incoming.messages || [];
  if (older) {
    const existingIds = new Set(currentMessages.map(message => message.id));
    return { ...incoming, ...previous, messages: [...received.filter(message => !existingIds.has(message.id)), ...currentMessages], pagination: { ...incoming.pagination, total: Math.max(incoming.pagination.total || 0, previous.pagination?.total || 0) } };
  }
  const positions = new Map(currentMessages.map((message, index) => [message.id, index]));
  const overlap = received.findIndex(message => positions.has(message.id));
  if (overlap < 0) return { ...incoming, historyWindowReset: currentMessages.length > 0 && received.length > 0 };
  const prefix = currentMessages.slice(0, positions.get(received[overlap].id));
  return { ...incoming, messages: [...prefix, ...received], pagination: prefix.length ? { ...incoming.pagination, hasMore: previous.pagination?.hasMore === true, nextCursor: previous.pagination?.nextCursor || null } : incoming.pagination };
}
async function fetchConversationPage(projectId, id) {
  const incoming = await api('/api/conversation?' + new URLSearchParams({ projectId, id, limit: '100' }));
  return mergeConversationPage(chats.get(chatKey(projectId, id)), incoming);
}
const historyPagesLoading = new Set();
function updateHistoryControls() {
  const chat = state.chat, page = chat?.pagination, busy = historyPagesLoading.has(chatKey(state.projectId, chat?.id));
  $('history-controls').hidden = !page;
  $('history-load').hidden = !page?.hasMore;
  $('history-load').disabled = busy || state.loading;
  setText($('history-load'), busy ? appT('app.beta24.loadingMessages') : appT('app.beta24.loadPreviousMessages'));
  setText($('history-count'), page ? (chat.historyWindowReset ? appT('app.beta24.historyReset') : '') + appT('app.beta24.historyCount', { shown: appNumber(chat.messages.length), count: page.total }) : '');
}
async function loadOlderMessages() {
  const chat = state.chat, projectId = state.projectId, epoch = state.authEpoch, seq = state.viewSeq;
  if (!chat?.pagination?.hasMore || !chat.pagination.nextCursor || $('history-load').disabled) return;
  const key = chatKey(projectId, chat.id), container = $('messages'), viewport = container.getBoundingClientRect();
  const anchor = [...container.querySelectorAll(':scope > .message')].find(message => message.getBoundingClientRect().bottom > viewport.top);
  const anchorId = anchor?.dataset.messageId, offset = anchor?.getBoundingClientRect().top;
  let loaded = false;
  historyPagesLoading.add(key); updateHistoryControls();
  try {
    const page = await api('/api/conversation?' + new URLSearchParams({ projectId, id: chat.id, limit: '100', before: chat.pagination.nextCursor }));
    if (epoch !== state.authEpoch || !state.authenticated) return;
    const merged = mergeConversationPage(chats.get(key) || chat, page, true); cacheChat(merged, projectId);
    if (seq !== state.viewSeq || state.projectId !== projectId || state.chat?.id !== chat.id) return;
    state.chat = merged; followingReply = false; renderChat();
    const restoredAnchor = [...container.querySelectorAll(':scope > .message')].find(message => message.dataset.messageId === anchorId);
    if (restoredAnchor && offset !== undefined) container.scrollTop += restoredAnchor.getBoundingClientRect().top - offset;
    announce(appT('app.beta24.previousMessagesLoaded', { count: merged.messages.length }), 'history:' + key + ':' + merged.messages[0]?.id);
    loaded = true;
  } catch (failure) { if (epoch === state.authEpoch && seq === state.viewSeq && state.chat?.id === chat.id) error(failure.message); }
  finally {
    historyPagesLoading.delete(key);
    if (epoch === state.authEpoch && state.authenticated) {
      updateHistoryControls();
      if (loaded && seq === state.viewSeq && state.chat?.id === chat.id && (document.activeElement === document.body || document.activeElement === $('history-load'))) (state.chat.pagination.hasMore ? $('history-load') : $('history-count')).focus({ preventScroll: true });
    }
  }
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
  if (requestId && chat.generation?.status === 'running') {
    if(!jobs.has(requestId))jobs.set(requestId, { requestId, projectId, id: chat.id, createdAt: chat.generation.startedAt || Date.now(), status: 'running',phase:chat.generation.phase });
    else if(chat.generation.phase)jobs.get(requestId).phase=chat.generation.phase;
  }
  for (const item of chat.queue || []) if (item.status === 'queued' && !jobs.has(item.requestId)) jobs.set(item.requestId, { requestId: item.requestId, projectId, id: chat.id, createdAt: item.queuedAt || Date.now(), status: 'queued' });
  rememberJobs();
}
function showChatUpdate(chat, projectId) {
  cacheChat(chat, projectId);
  if (!state.authenticated || projectId !== state.projectId || state.chat?.id !== chat.id || state.loading) { renderSessions(); return; }
  state.chat = chat; renderChat();
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
        job.status = receipt.status || job.status;if(receipt.phase)job.phase=receipt.phase;
        if (job.id) snapshots.set(chatKey(job.projectId, job.id), { projectId: job.projectId, id: job.id });
        if (!['queued', 'running', 'starting', 'preparing', 'submitting', 'reconnecting'].includes(job.status)) {
          jobs.delete(job.requestId);
          if (receipt.message && job.projectId === state.projectId && job.id === state.chat?.id) error(receipt.message);
        }
      } catch (e) {
        if (epoch !== state.authEpoch || revision !== conversationMove.revision) return;
        if (e.status === 404 && Date.now() - job.createdAt > 15000) {
          jobs.delete(job.requestId);
          if (job.projectId === state.projectId && (job.id === state.chat?.id || job.viewKey === state.viewKey)) error(appT('app.sendUnconfirmed'));
        } else if (e.status !== 401 && job.projectId === state.projectId && job.id === state.chat?.id) error(appT('app.reconnectNoResend'));
      }
    }));
    if (epoch !== state.authEpoch || revision !== conversationMove.revision || !state.authenticated) return;
    for (const session of state.sessions) if (session.generation?.status === 'running' || session.queue?.some(item => item.status === 'queued')) snapshots.set(chatKey(state.projectId, session.id), { projectId: state.projectId, id: session.id });
    await Promise.all([...snapshots.values()].map(async target => {
      try {
        const chat = await fetchConversationPage(target.projectId, target.id);
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
  } catch (e) { if (e.status !== 401 && state.authenticated) setAppLabel('status', 'app.reconnecting');
  } finally {
    recoveryBusy = false; if (state.authenticated) { setSending(); renderSessions(); workspace.refreshActivity(); scheduleRecovery(); }
  }
}
function resumeReply() {
  if (document.visibilityState !== 'hidden' && state.authenticated) recoverReplies();
}
function bindJob(job, id, name) {
  if (!id) return;
  if(job.payload)companionSettings.accepted(job.payload,job.preferenceViewKey||job.viewKey);
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
    const follow = followingReply && nearReplyBottom() && !readingInteraction($('messages'));
    renderText(body, reply.text || appT('app.modelPreparing'));
    if (follow) scrollBottom(); else updateReplyFollow();
  }, 40);
}
async function generateDirectImage() {
  if ($('generate-image-direct').disabled) return;
  const prompt = $('prompt').value.trim();
  if (!prompt || prompt.length > 6000) {
    errorLabel('app.beta24.imagePromptRequired');
    closeComposerFiles(); $('prompt').focus(); return;
  }
  saveDraft(); error('');
  // getRandomValues also works on the local HTTP bootstrap origin.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  const requestId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-'), epoch = state.authEpoch, projectId = state.projectId;
  const originalKey = state.viewKey, originalDraft = { ...draftForView() }, originalChat = state.chat;
  const sessionId = state.chat?.source === 'web' ? state.chat.id : null;
  const viewKey = sessionId ? originalKey : chatKey(projectId, 'pending:' + requestId);
  const job = { requestId, projectId, id: sessionId, viewKey, createdAt: Date.now(), status: 'submitting' };
  const payload = { requestId, projectId, sessionId, prompt, workflowId: $('image-workflow').value };
  jobs.set(requestId, job); rememberJobs();
  drafts.set(originalKey, { ...originalDraft, text: '' });
  drafts.set(viewKey, { ...originalDraft, text: '' });
  if (!sessionId) state.chat = { projectId, name: prompt.slice(0, 70), source: 'web', messages: [] };
  restoreDraft(viewKey); rememberDrafts(); closeComposerFiles(); renderChat(); $('prompt').focus(); scheduleRecovery();
  let accepted = false;
  try {
    const result = await api('/api/comfy/generate', { method: 'POST', body: JSON.stringify(payload) });
    if (epoch !== state.authEpoch || !state.authenticated) return;
    accepted = true; bindJob(job, result.id); jobs.delete(requestId); rememberJobs();
    if (state.projectId === projectId && state.viewKey === job.viewKey) await openChat(result.id);
    await loadSessions();
    toastLabel('app.beta24.imageSubmitted');
  } catch (failure) {
    if (epoch !== state.authEpoch || !state.authenticated) return;
    if (!accepted && failure.status >= 400 && failure.status < 500 && failure.status !== 409) {
      jobs.delete(requestId); rememberJobs();
      const current = drafts.get(viewKey) || {};
      // Preserve a newer message typed while the PC answered.
      const restored = { ...current, text: current.text || originalDraft.text };
      drafts.set(viewKey, restored);
      if (state.viewKey === viewKey) {
        if (!sessionId) { state.chat = originalChat; drafts.set(originalKey, restored); drafts.delete(viewKey); restoreDraft(originalKey); renderChat(); }
        else restoreDraft(viewKey);
      }
      rememberDrafts();
      error(failure.message);
    } else errorLabel('app.beta24.imageDisplayUnconfirmed');
  } finally {
    if (epoch === state.authEpoch && state.authenticated) { setSending(); renderSessions(); scheduleRecovery(); }
  }
}
async function send(event) {
  event.preventDefault();
  const text = $('prompt').value.trim(); if (!text || state.loading || state.uploading || $('send').disabled) return;
  saveDraft();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const requestId = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  error(''); const data = companionSettings.decorate({ requestId, projectId: state.projectId, sessionId: state.chat?.id || null, model: $('model').value, reasoning: $('effort').value, fileAccess: currentFileProfile()!=='none', fileProfile:currentFileProfile(), webApproval:$('agent-web-approval').checked, webAccess:$('agent-web').checked, scriptAccess:$('agent-scripts').checked, imageAccess:companionSettings.enabled()&&$('agent-images').checked, text, attachments: fileBrowser.references() });
  responseModels.set(JSON.stringify([data.projectId, requestId]), data.model);
  if (responseModels.size > 100) responseModels.delete(responseModels.keys().next().value);
  const originalDraft = draftForView(), oldKey = state.viewKey;
  const viewKey = data.sessionId ? oldKey : chatKey(data.projectId, 'pending:' + requestId);
  const chat = state.chat || { projectId: data.projectId, name: text.slice(0, 70), source: 'web', messages: [], model: data.model };
  const job = { requestId, projectId: data.projectId, id: data.sessionId, viewKey, preferenceViewKey:oldKey, createdAt: Date.now(), status: 'submitting', payload: data, chat, controller: new AbortController(), epoch: state.authEpoch };
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
      throw new Error(j.error || appT('app.modelCannotReply'));
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
          bindJob(job, e.id, e.name); job.status = e.type === 'queued' ? 'queued' : 'running';job.phase=e.phase||(e.type==='start'?'model':undefined);
          const current = localChatForJob(job);
          current.id = e.id; current.name = e.name || current.name; current.source = 'web'; current.model = data.model;
          current.reasoningByModel = { ...current.reasoningByModel, [data.model]: e.reasoning || data.reasoning }; current.fileAccess = e.fileAccess ?? data.fileAccess; current.fileProfile = e.fileProfile ?? data.fileProfile; current.webApproval=e.webApproval??data.webApproval;
          current.imageCount=e.imageCount??data.imageCount;current.imageModelPolicy=Object.hasOwn(e,'imageModelPolicy')?e.imageModelPolicy:data.imageModelPolicy??null;current.imageWorkflowId=e.imageWorkflowId??data.imageWorkflowId;current.imageAccess=e.imageAccess??data.imageAccess;current.webAccess=e.webAccess??data.webAccess;current.scriptAccess=e.scriptAccess??data.scriptAccess;
          if (e.type === 'start') {
            current.messages ||= [];
            if (!current.messages.some(message => message.requestId === requestId)) current.messages.push({ role: 'user', id: e.contextReceipt?.current?.messageId, text, requestId });
            const existingReply = replyForJob(current, requestId);
            if (existingReply) { existingReply.id ||= e.replyId; existingReply.contextReceipt = e.contextReceipt || existingReply.contextReceipt; }
            else current.messages.push({ role: 'assistant', id: e.replyId, text: '', localRequestId: requestId, contextReceipt: e.contextReceipt });
            current.generation = { status: 'running', requestId, replyId: e.replyId,phase:e.phase||'model' };
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
          if (reply) { reply.actions ||= []; if (!reply.actions.some(action => action.id === e.action.id)) reply.actions.push(e.action); for(const image of e.action.imageGenerations||(e.action.imageGeneration?[e.action.imageGeneration]:[])){reply.imageGenerations||=[];const existing=reply.imageGenerations.find(job=>job.id===image.id);if(existing)Object.assign(existing,image);else reply.imageGenerations.push(image);} if (e.contextReceipt) reply.contextReceipt = e.contextReceipt; }
          redrawJob(job, true);
        } else if (e.type === 'context') {
          const reply = replyForJob(localChatForJob(job), requestId); if (reply && e.contextReceipt) reply.contextReceipt = e.contextReceipt;
          redrawJob(job, true);
        } else if (e.type === 'capability') {
          const noticeKey = e.tools === 'unknown' && e.trial === true ? 'app.beta24.toolsTrialNotice' : null;
          capabilityNotices.set(JSON.stringify([job.projectId, requestId]), noticeKey ? { key: noticeKey } : { message: e.message });
          if (capabilityNotices.size > 100) capabilityNotices.delete(capabilityNotices.keys().next().value);
          const current = localChatForJob(job), reply = replyForJob(current, requestId);
          if (reply) reply.capabilityNotice = noticeKey ? '' : e.message;
          if (jobIsVisible(job)) announce(noticeKey ? appT(noticeKey) : e.message, 'capability:' + requestId);
          redrawJob(job, true);
        } else if (e.type === 'error') { if (jobIsVisible(job)) error(e.message); }
        else if (e.type === 'done') { const reply=replyForJob(localChatForJob(job),requestId);if(reply)Object.assign(reply,{truncated:e.truncated,finishReason:e.finishReason,outputBudget:e.outputBudget,limited:e.limited,metrics:e.metrics??reply.metrics});job.phase=undefined;if(e.limited&&!e.truncated&&jobIsVisible(job))toast(appT('app.actionLimit'));redrawJob(job,true); }
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
    } else if (document.visibilityState !== 'hidden' && jobIsVisible(job)) error(appT('app.reconnectChecking'));
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
  await checkStatus(); state.authenticated = true; ++state.authEpoch; $('login').hidden = true;
  await companionSettings.refresh();
  workspace.activate(); updatesPanel.activate();
  try { const info=await api('/api/ping'), saved=textDraftStore.activate(info.instanceId); $('draft-duration').value=String(saved.duration); for(const [key,value]of saved.entries){if(!drafts.get(key)?.text)drafts.set(key,{...drafts.get(key),text:value.text});} recoverUpdateDrafts(info.instanceId); } catch { draftFailure(); }
  await loadProjects();
  let view;
  try { view = JSON.parse(sessionStorage.getItem('bm_view') || 'null'); } catch {}
  const savedKey = view?.projectId === state.projectId ? view.key : null;
  const last = savedKey?.startsWith(state.projectId + '|') ? savedKey.slice(state.projectId.length + 1) : localStorage.getItem('bm_chat_' + state.projectId);
  if (last && state.sessions.some(chat => chat.id === last)) await openChat(last);
  else {
    const pending = [...jobs.values()].find(job => !job.id && job.viewKey === savedKey);
    state.chat = pending ? { name: appT('app.sendingPc'), source: 'web', messages: [] } : null;
    restoreDraft(pending ? savedKey : chatKey(state.projectId)); renderChat();
  }
  $('app').hidden = false;
  await recoverReplies(); scheduleRecovery();
  if(new URLSearchParams(location.search).get('settings')==='security'){
    await companionSettings.openSecurity();
    const url=new URL(location.href);url.searchParams.delete('settings');history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }
}
function hidePrivateViews() {
  historyPagesLoading.clear(); $('history-controls').hidden = true; $('comfy-storage-warning').hidden = true;
  clearProjectAdoption(); $('project-management').open = false; $('local-project-name').value = '';
  projectManagementMessage('local-project-status'); projectManagementMessage('local-project-error');
  pendingMessageText.clear(); responseModels.clear(); capabilityNotices.clear(); appLabelBindings.clear(); readingView = null; followingReply = true;
  $('reply-follow-bar').hidden = true;
  companionSettings.reset();
  ++diagnosticsRevision; $('diagnostics-result').replaceChildren(); $('diagnostics-result').hidden = true; $('diagnostics-open').disabled = false;
  updatesPanel.stop();
  try { textDraftStore.clear(); } catch { toast(appT('app.draftClearFailed')); } $('draft-duration').value='0'; sessionSignature=''; observedGenerations.clear(); announcedEvents.clear();
  closeConversationOptions();
  closeComposerFiles();
  state.authenticated = false; ++state.authEpoch; ++state.viewSeq; ++state.projectSeq; clearTimeout(recoveryTimer); clearTimeout(renderTimer);
  projectTree.reset();
  for (const job of jobs.values()) job.controller?.abort();
  $('models-dialog').close(); $('files-view').hidden = true; $('app').hidden = true; $('login').hidden = false;
  workspace.reset();imageGenerationView.reset();
  $('messages').replaceChildren(); $('sessions').replaceChildren(); $('prompt').value = ''; $('attachments').replaceChildren(); $('upload-status').textContent = '';
  $('file-editor').value = ''; $('file-image').removeAttribute('src'); $('file-list').replaceChildren();
  state.chat = null; state.viewKey = null; state.draftImageCount=null;state.draftImageModelPolicy=null;state.sessions = []; chats.clear(); drafts.clear(); rememberDrafts();
  state.projects = []; $('project').replaceChildren();
  try { sessionStorage.removeItem('bm_view'); } catch {}
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-error').textContent = ''; $('login-button').disabled = true;
  try { await api('/api/login', { method: 'POST', body: JSON.stringify({ code: $('code').value.trim() }) }); $('code').value = ''; await start(); }
  catch (e) { $('login-error').textContent = e.message; }
  finally { $('login-button').disabled = false; }
});
$('reveal').addEventListener('click', () => { const show = $('code').type === 'password'; $('code').type = show ? 'text' : 'password'; $('reveal').setAttribute('aria-pressed', String(show)); $('reveal').setAttribute('aria-label', show ? appT('app.hideCode') : appT('app.showCode')); });
$('project').addEventListener('change', async () => {
  try { await selectProject($('project').value, { clearSearch: true }); } catch (e) { error(e.message); }
});
$('agent-files').addEventListener('change', () => { state.draftFileProfile = currentFileProfile(); saveDraft(); setSending(); });
for(const type of ['input','change'])$('image-count').addEventListener(type,()=>{state.draftImageCount=normalizedImageCount($('image-count').value);saveDraft();setSending();});
$('image-model-policy').addEventListener('change',()=>{state.draftImageModelPolicy=$('image-model-policy').value;saveDraft();setSending();});
$('image-workflow').addEventListener('change',()=>{state.draftImageWorkflowId=$('image-workflow').value;saveDraft();companionSettings.imagePermission();});
for(const [id,key] of [['agent-web','draftWebAccess'],['agent-web-approval','draftWebApproval'],['agent-scripts','draftScriptAccess'],['agent-images','draftImageAccess']])$(id).addEventListener('change',()=>{state[key]=$(id).checked;saveDraft();setSending();});
$('attach-file').addEventListener('click', () => closeComposerFiles());
$('fork-chat').addEventListener('click',()=>forkChat());
function choosePhoneImport(attach) { if (!state.loading&&!state.uploading&&state.projectId) { importWithAttachment=attach; closeComposerFiles(true); const free=4-fileBrowser.snapshot().length;setAppLabel('import-help', 'app.importHelp', () => ({ attachments: attach ? appT('app.importAttachHelp', { count: Math.max(0, free) }) : appT('app.importWithoutAttachment') }));$('phone-files').click(); } }
$('upload-file').addEventListener('click',()=>choosePhoneImport(false));$('upload-attach-file').addEventListener('click',()=>choosePhoneImport(true));
$('phone-files').addEventListener('change', async () => {
  const selected = [...$('phone-files').files]; $('phone-files').value = '';
  if (!selected.length || state.loading || state.uploading || !state.projectId) return;
  if (selected.length > 10) return error(appT('app.importLimit'));
  const projectId = state.projectId; state.uploading = true; setSending(false); error('');
  $('upload-status').hidden = false;
  let imported = 0, attached = 0; const failures = [];
  try {
    for (const file of selected) {
      setAppLabel('upload-status', 'app.importingFile', { name: file.name });
      if (file.size > 20000000) { failures.push(appT('app.fileTooLarge', { name: file.name })); continue; }
      try {
        const result = await api('/api/file/upload?' + new URLSearchParams({ projectId, name: file.name }), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
        imported++; if (importWithAttachment && fileBrowser.addImported(result)) attached++;
      } catch (e) { failures.push(file.name + ' : ' + e.message); if (e.status === 401) break; }
    }
    setAppLabel('upload-status', 'app.importResult', () => ({ count: imported, attached: appT('app.attachedCount', { count: attached }) }));
    if (failures.length) error(failures.join(' '));
    if (imported) { $('app').classList.add('thread-open'); renderChat(); }
  } finally { state.uploading = false; saveDraft(); setSending(); }
});
$('model').addEventListener('change', () => { saveDraft(); setEffort(); });
$('effort').addEventListener('change', () => { state.draftReasoning[$('model').value] = $('effort').value; saveDraft(); });
$('prompt').addEventListener('input', saveDraft);
$('search').addEventListener('input', ()=>{renderSessions();clearTimeout(searchAnnouncementTimer);searchAnnouncementTimer=setTimeout(()=>announce(appT('app.searchResultCount', { count: Number($('session-count').dataset.count || 0) }),'search:'+state.projectId+':'+$('search').value+':'+$('session-count').textContent),300);});
$('new-chat').addEventListener('click', () => newChat());
$('back').addEventListener('click', () => { $('app').classList.remove('thread-open'); $('project').focus(); });
async function refreshConnection() { if (connectionRefreshing || state.uploading || conversationMove.busy) return; connectionRefreshing = true; $('refresh').disabled = true; $('refresh').setAttribute('aria-busy','true'); const epoch = state.authEpoch, revision = conversationMove.revision; saveDraft(); try { error(''); await Promise.all([checkStatus(), loadProjects()]); if (epoch !== state.authEpoch || revision !== conversationMove.revision || !state.authenticated) return; if (state.chat?.id) await openChat(state.chat.id); if (epoch === state.authEpoch && state.authenticated) toastLabel('app.beta24.connectionRefreshed'); } catch (e) { if (epoch === state.authEpoch && state.authenticated) { error(e.message); toast(e.message); } } finally { connectionRefreshing = false; $('refresh').disabled = state.uploading || conversationMove.busy; $('refresh').setAttribute('aria-busy','false'); } }
$('refresh').addEventListener('click', refreshConnection);
$('logout').addEventListener('click', async () => {
  if (state.uploading || conversationMove.busy) return;
  if (companionSettings.hasUnsaved()) { toast(appT('app.saveSettingsBeforeLogout')); return; }
  try { sessionStorage.removeItem(updateRecoveryKey); } catch {}
  hidePrivateViews(); $('code').focus();
  try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
});
$('conversation-options-toggle').addEventListener('click', () => { const show = $('conversation-options').hidden; $('conversation-options').hidden = !show; $('conversation-options-toggle').setAttribute('aria-expanded', String(show)); if (show) { for (const action of ['rename', 'move', 'delete']) $(action + '-error').hidden = true; updateConversationOptions(); ($('conversation-name').disabled ? $('info-button') : $('conversation-name')).focus(); } });
$('conversation-options').addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeConversationOptions(true); } });
$('move-project').addEventListener('change', updateConversationOptions);
$('move-conversation-form').addEventListener('submit', moveCurrentConversation);
$('conversation-name').addEventListener('input', updateConversationOptions);
$('rename-conversation-form').addEventListener('submit', renameCurrentConversation);
$('delete-conversation').addEventListener('click', deleteCurrentConversation);
$('info-button').addEventListener('click', () => {
  closeConversationOptions();
  companionSettings.openPage({currentTarget:$('conversation-options-toggle')},'help','settings-heading-help');
});
$('composer').addEventListener('submit', send);
$('generate-image-direct').addEventListener('click', generateDirectImage);
$('history-load').addEventListener('click', loadOlderMessages);
$('local-project-form').addEventListener('submit', createLocalProject);
$('project-adoption-preview').addEventListener('click', previewProjectAdoption);
$('project-adoption-form').addEventListener('submit', adoptProject);
$('project-adoption-cancel').addEventListener('click', () => { clearProjectAdoption(); $('project-adoption-preview').focus(); });
let messageFlushTimer;
function scheduleMessageTextFlush() {
  if (!pendingMessageText.size) return;
  clearTimeout(messageFlushTimer); messageFlushTimer = setTimeout(flushMessageText, 0);
}
document.addEventListener('selectionchange', scheduleMessageTextFlush);
$('messages').addEventListener('focusout', scheduleMessageTextFlush);
$('messages').addEventListener('scroll', () => { followingReply = nearReplyBottom(); updateReplyFollow(); }, { passive: true });
$('reply-follow').addEventListener('click', () => {
  window.getSelection()?.removeAllRanges();
  $('messages').focus({ preventScroll: true }); flushMessageText(); scrollBottom();
  const last = $('messages').querySelector('.message.assistant:last-of-type');
  if (last) last.focus({ preventScroll: true });
});
$('prompt').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('composer').requestSubmit(); } });
$('stop').addEventListener('click', async () => {
  const target = { id: state.chat?.id, projectId: state.projectId };
  if (!target.id) return;
  try {
    await api('/api/cancel', { method: 'POST', body: JSON.stringify(target) }); await recoverReplies();
  } catch { error(appT('app.stopFailed')); }
});
document.addEventListener('visibilitychange', resumeReply);
window.addEventListener('pageshow', resumeReply);
window.addEventListener('online', resumeReply);
window.addEventListener('pagehide', saveDraft);
window.addEventListener('storage', event=>{if(textDraftStore.handlesStorageKey(event.key)){try{if(textDraftStore.synchronize()){applyDraftRevocation();rememberDrafts();if(state.authenticated)renderChat();}}catch{draftFailure();}}});
$('models-open-sidebar').addEventListener('click', openModels);
$('settings-models-loaded').addEventListener('click', openModels);
$('draft-settings-open').addEventListener('click',event=>companionSettings.openPage(event,'reading','draft-duration'));
$('diagnostics-shortcut').addEventListener('click',event=>companionSettings.openPage(event,'maintenance','diagnostics-open'));
$('models-refresh').addEventListener('click', refreshLoadedModels);
$('models-close').addEventListener('click', () => $('models-dialog').close());

function focusReply(id) { const target=[...$('messages').querySelectorAll('.message')].find(x=>x.dataset.messageId===id);if(target){target.scrollIntoView({block:'center'});target.focus({preventScroll:true});}else toast(appT('app.messageUnavailable')); }
async function visitSource(origin,button) { const previous={projectId:state.projectId,chat:state.chat,key:state.viewKey};const projectId=origin.projectId||state.projectId;button.disabled=true;try{if(!state.projects.some(p=>p.id===projectId))throw Error();const source=await api('/api/conversation?'+new URLSearchParams({projectId,id:origin.id}));saveDraft();state.projectId=projectId;$('project').value=projectId;state.chat=source;restoreDraft(chatKey(projectId,source.id));await loadSessions();renderChat();if(origin.messageId)focusReply(origin.messageId);}catch{state.projectId=previous.projectId;$('project').value=previous.projectId;state.chat=previous.chat;restoreDraft(previous.key);renderChat();toast(appT('app.sourceUnavailable'));}finally{button.disabled=false;}}
$('draft-duration').addEventListener('change',()=>{saveDraft();try{textDraftStore.setDuration($('draft-duration').value,drafts);setAppLabel('draft-status', textDraftStore.duration ? 'app.draftRetained' : 'app.draftTabOnly');}catch{draftFailure();}});
$('draft-download').addEventListener('click',downloadMessageDraft);
$('draft-clear').addEventListener('click',()=>{try{textDraftStore.clear();for(const [key,draft]of drafts)drafts.set(key,{...draft,text:'',failed:[]});$('prompt').value='';$('draft-duration').value='0';rememberDrafts();renderChat();setAppLabel('draft-status', 'app.draftsCleared');}catch{draftFailure();}});
let diagnosticsRevision=0;
$('diagnostics-open').addEventListener('click',async()=>{
  const button=$('diagnostics-open'),panel=$('diagnostics-result'),ticket=++diagnosticsRevision,epoch=state.authEpoch,revision=companionSettings.revision();
  const current=()=>ticket===diagnosticsRevision&&epoch===state.authEpoch&&state.authenticated&&companionSettings.isCurrent(revision);
  button.disabled=true;panel.hidden=false;panel.textContent=appT('app.checking');
  try{
    const result=await api('/api/diagnostics');if(!current())return;
    panel.replaceChildren(node('p','',appT('app.diagnosticsHelp')),node('pre','',JSON.stringify(result,null,2)));
    const download=node('button','file-action',appT('app.downloadDiagnostic'));download.type='button';
    download.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='diagnostic-bionic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});panel.append(download);
  }catch(e){if(current())panel.textContent=e.message;}
  finally{if(ticket===diagnosticsRevision){button.disabled=false;if(!current()){panel.replaceChildren();panel.hidden=true;}}}
});

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
    toast(appT('app.branchCreated'));
  }catch(e){error(e.message);}finally{forking=false;document.querySelectorAll('.message-fork').forEach(button=>button.disabled=false);setSending();}
}

// Language changes belong to the interface. Requests, drafts, attachments and message bodies
// retain their original values; renderChat reconciles their DOM instead of replacing it.
globalThis.BionicI18n.onChange(() => {
  for (const [id, binding] of appLabelBindings) {
    if ($(id).textContent === binding.value) setAppLabel(id, binding.key, binding.params);
  }
  newChatLabel.nodeValue = appT('app.newChat');
  $('reveal').setAttribute('aria-label', appT($('code').type === 'password' ? 'app.showCode' : 'app.hideCode'));
  if (!state.authenticated) return;
  const model = $('model').value, effort = $('effort').value;
  setModels();
  if ([...$('model').options].some(option => option.value === model)) $('model').value = model;
  setEffort();
  if ([...$('effort').options].some(option => option.value === effort)) $('effort').value = effort;
  if (state.loading) {
    setText($('thread-title'), appT('app.openingConversation'));
    const loading = $('messages').querySelector('.loading-label');
    if (loading) setText(loading, appT('app.openingConversation'));
    renderSessions(); setSending();
  } else renderChat({ preserveComposer: true });
  if ($('models-dialog').open) renderLoadedModels();
  if ([...$('effort').options].some(option => option.value === effort)) $('effort').value = effort;
});
