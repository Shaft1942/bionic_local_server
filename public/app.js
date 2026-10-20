'use strict';
const $ = id => document.getElementById(id);
const icons = {
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
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>'
};
function icon(name) { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('aria-hidden', 'true'); el.innerHTML = icons[name]; return el; }
for (const [id, name] of [['refresh', 'refresh'], ['search-icon', 'search'], ['back', 'back'], ['send', 'send'], ['info-button', 'info'], ['logout', 'logout'], ['reveal', 'eye']]) $(id).append(icon(name));
for (const [id, name] of [['models-open-thread','models'], ['models-close','close'], ['models-refresh','refresh']]) $(id).append(icon(name));
$('models-open-sidebar').prepend(icon('models'));
$('new-chat').append(icon('plus'), document.createTextNode('Nouveau chat web'));
const state = { projects: [], sessions: [], projectId: null, chat: null, sending: false, loading: false, uploading: false, status: null, streamId: null, viewSeq: 0, projectSeq: 0, controller: null, draftReasoning: {}, draftFileAccess: null };
let pendingReply = readPendingReply(), recoveryTimer, recoveryBusy = false;
function readPendingReply() {
  try {
    const saved = JSON.parse(localStorage.getItem('bm_pending_reply'));
    return saved && typeof saved.projectId === 'string' && /^[a-zA-Z0-9-]{16,100}$/.test(saved.requestId || '') ? saved : null;
  } catch { return null; }
}
function rememberReply(pending) {
  pendingReply = pending;
  try { if (pending) localStorage.setItem('bm_pending_reply', JSON.stringify(pending)); else localStorage.removeItem('bm_pending_reply'); } catch {}
}
function rememberChat() { if (state.chat?.id) localStorage.setItem('bm_chat_' + state.projectId, state.chat.id); }
const EFFORT_LABELS = { off: 'Désactivé', on: 'Activé', low: 'Faible', medium: 'Moyen', high: 'Élevé', xhigh: 'Très élevé' };
const modelPanel = { models: [], loading: false, unloading: null, generationActive: false };
const fileBrowser = createProjectFileBrowser({ api, node, icon, toast, getProject: () => state.projects.find(project => project.id === state.projectId), isBusy: () => state.sending || state.loading || state.uploading, onAttach: () => { $('app').classList.add('thread-open'); renderChat(); $('prompt').focus(); } });
$('upload-file').prepend(icon('upload'));
let toastTimeout;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('toast').hidden = true, 4500); }
function error(message) { $('message-error').textContent = message || ''; $('message-error').hidden = !message; }
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
async function api(route, options = {}) {
  const r = await fetch(route, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const j = await r.json().catch(() => ({ error: 'Réponse du serveur illisible.' }));
  if (r.status === 401) { $('login').hidden = false; $('app').hidden = true; $('files-view').hidden = true; }
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
  $('model').value = list.find(m => m.id === previous)?.id || list.find(m => m.id === state.chat?.model)?.id || list.find(m => m.loaded)?.id || list[0]?.id || '';
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
  $('effort').disabled = !choices.length || state.sending || state.loading || !!modelPanel.unloading;
  const binary = choices.length && choices.every(choice => choice === 'on' || choice === 'off');
  $('effort-help').textContent = !valid ? 'Le niveau précédemment choisi n’est plus disponible. Le réglage par défaut sera utilisé.' : !choices.length ? 'Ce modèle ne propose pas de réglage d’effort par l’API.' : binary ? 'Ce modèle permet d’activer ou de désactiver le raisonnement, sans niveaux intermédiaires.' : 'Niveau de raisonnement appliqué au prochain message.';
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
    button.type = 'button'; button.disabled = locked || state.sending || modelPanel.generationActive;
    button.setAttribute('aria-label', 'Décharger ' + instance.model.name + (instance.model.loadedInstances.length > 1 ? ' — ' + instance.id : ''));
    button.addEventListener('click', () => unloadModel(instance.id));
    row.append(details, button); $('models-list').append(row);
  }
  if ((state.sending || modelPanel.generationActive) && !modelPanel.unloading) $('models-summary').textContent += ' · Une réponse est en cours. Le déchargement sera disponible après sa fin.';
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
  if (modelPanel.unloading || modelPanel.loading || state.sending || modelPanel.generationActive) return;
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
  const j = await api('/api/projects'); state.projects = j.projects;
  const previous = state.projectId || localStorage.getItem('bm_project');
  state.projectId = j.projects.some(p => p.id === previous) ? previous : j.projects[0]?.id;
  $('project').replaceChildren();
  for (const p of j.projects) $('project').append(new Option(p.name, p.id));
  if (state.projectId) { $('project').value = state.projectId; await loadSessions(); }
  else $('sessions').replaceChildren(node('p', 'list-empty', 'Aucun projet Bionic trouvé. Crée un projet dans Bionic puis actualise.'));
  setSending(false);
}
async function loadSessions() {
  const seq = ++state.projectSeq, pid = state.projectId;
  $('sessions').replaceChildren(node('p', 'loading-label', 'Chargement des conversations…'));
  if (!pid) return;
  const j = await api('/api/sessions?projectId=' + encodeURIComponent(pid));
  if (seq !== state.projectSeq) return;
  state.sessions = j.sessions; renderSessions(); localStorage.setItem('bm_project', pid);
}
function renderSessions() {
  const search = $('search').value.toLocaleLowerCase('fr');
  const filtered = state.sessions.filter(s => s.name.toLocaleLowerCase('fr').includes(search));
  $('session-count').textContent = String(filtered.length);
  $('sessions').replaceChildren();
  if (!filtered.length) { $('sessions').append(node('p', 'list-empty', search ? 'Aucune conversation pour cette recherche.' : 'Aucune conversation dans ce projet. Commence un nouveau chat web.')); return; }
  for (const s of filtered) {
    const button = node('button', 'session'); button.type = 'button'; button.disabled = state.sending;
    button.setAttribute('aria-current', String(state.chat?.id === s.id));
    button.append(node('span', 'session-name', s.name));
    const meta = node('span', 'session-meta'); meta.append(node('span', s.source === 'web' ? 'web-label' : '', s.generation?.status === 'running' ? 'Réponse en cours sur le PC' : s.source === 'web' ? (s.origin ? 'Suite web' : 'Chat web') : 'Bionic'), node('span', '', shortDate(s.updatedAt)));
    button.append(meta); button.addEventListener('click', () => openChat(s.id).catch(e => error(e.message))); $('sessions').append(button);
  }
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
function addFileAction(article, action) {
  let log = article.querySelector('.actions-log');
  if (!log) { log = node('details', 'actions-log'); log.append(node('summary', '', 'Actions sur les fichiers'), node('div', 'action-rows')); article.append(log); }
  const row = node('div', 'action-row' + (action.ok ? '' : ' action-failed'));
  row.append(node('strong', '', action.ok ? action.message : 'Action non réalisée'), node('span', '', action.path));
  if (!action.ok) row.append(node('p', '', action.message));
  if (action.ok && /^(?:replace_project_text|write_project_file)$/.test(action.name)) log.open = true;
  if (action.backupId && action.hash) {
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
  log.querySelector('summary').textContent = 'Actions sur les fichiers · ' + log.querySelectorAll('.action-row').length;
}
function addMessage(message) {
  const article = node('article', 'message ' + message.role);
  const role = node('div', 'message-role', message.role === 'user' ? 'Toi' : 'Assistant');
  if (message.fromBionic) role.append(node('span', 'origin-tag', 'historique Bionic'));
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
  for (const action of message.actions || []) addFileAction(article, action);
  const footer = [];
  if (message.reasoning && EFFORT_LABELS[message.reasoning]) footer.push('Effort : ' + EFFORT_LABELS[message.reasoning].toLocaleLowerCase('fr'));
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
  $('messages').append(article); return content;
}
function scrollBottom() { $('messages').scrollTop = $('messages').scrollHeight; }
function renderChat() {
  const chat = state.chat, project = state.projects.find(p => p.id === state.projectId);
  $('agent-files').checked = state.draftFileAccess ?? chat?.fileAccess ?? true;
  $('thread-title').textContent = chat?.name || 'Nouveau chat web';
  $('thread-subtitle').textContent = (project?.name || 'Projet') + (chat?.source === 'bionic' ? ' · historique Bionic' : ' · conversation web');
  $('banner').hidden = false;
  let banner = chat?.source === 'bionic' ? 'Cet historique est lu depuis Bionic. Ton prochain message créera une suite web, conservée ici.' : chat?.origin ? 'Suite web de « ' + chat.origin.name + ' ». Les nouveaux messages ne sont pas synchronisés vers Bionic.' : 'Ce chat est conservé dans le compagnon web sur ce PC.';
  if (chat?.truncated || chat?.importedTruncated) banner += ' Historique long : seule la partie récente est disponible.';
  if (chat?.omitted?.attachments) banner += ' Les pièces jointes ne sont pas affichées.';
  if (chat?.model && !(state.status?.models || []).some(m => m.id === chat.model)) banner += ' Le modèle d’origine n’est pas disponible sous le même nom dans l’API : vérifie le modèle sélectionné avant d’envoyer.';
  $('banner').textContent = banner;
  $('messages').replaceChildren();
  if (chat?.messages?.length) for (const m of chat.messages) addMessage(m);
  else { const empty = node('div', 'welcome'); empty.append(node('h2', '', 'Commence une nouvelle idée.'), node('p', '', 'Le modèle local répondra à partir de tes messages et des fichiers que tu choisis de joindre.')); $('messages').append(empty); }
  $('model').value = modelForChat(); setEffort(); scrollBottom(); renderSessions();
  if (chat?.generation?.status === 'running') {
    const body = $('messages').lastElementChild?.querySelector('.message-body');
    if (body && !body.textContent) body.textContent = 'Le modèle prépare sa réponse sur le PC…';
  }
}
async function openChat(id) {
  if (state.sending || state.uploading) return;
  const seq = ++state.viewSeq, pid = state.projectId;
  state.loading = true; state.chat = null; state.draftReasoning = {}; state.draftFileAccess = null; setSending(false);
  fileBrowser.clear();
  $('upload-status').hidden = true;
  error(''); $('app').classList.add('thread-open');
  $('thread-title').textContent = 'Ouverture de la conversation…';
  $('messages').replaceChildren(node('p', 'loading-label', 'Ouverture de la conversation…'));
  try {
    const chat = await api(`/api/conversation?projectId=${encodeURIComponent(pid)}&id=${encodeURIComponent(id)}`);
    if (seq !== state.viewSeq || pid !== state.projectId) return;
    state.chat = chat; rememberChat(); renderChat();
  } catch (e) { if (seq === state.viewSeq) renderChat(); throw e; }
  finally {
    if (seq === state.viewSeq) {
      state.loading = false; setSending(false);
      if (state.chat?.generation?.status === 'running') {
        const requestId = state.chat.messages.findLast(message => message.requestId)?.requestId;
        if (requestId) { rememberReply({ requestId, projectId: pid, id, createdAt: Date.now() }); await recoverReply(); }
      }
    }
  }
}
function setSending(sending) {
  state.sending = sending;
  const locked = sending || state.loading || state.uploading || !!modelPanel.unloading;
  $('send').hidden = sending; $('stop').hidden = !sending;
  $('prompt').disabled = locked;
  $('send').disabled = locked || !state.projectId || !state.status?.ok || !state.status?.models?.length;
  for (const id of ['project', 'model', 'new-chat', 'refresh']) $(id).disabled = locked;
  for (const id of ['files-open-sidebar', 'attach-file', 'upload-file']) $(id).disabled = locked || !state.projectId;
  $('agent-files').disabled = locked;
  $('logout').disabled = state.uploading;
  document.querySelectorAll('.restore-action').forEach(button => button.disabled = locked || button.dataset.restored === 'true');
  $('effort').disabled = locked || !(state.status?.models || []).find(model => model.id === $('model').value)?.reasoning?.allowedOptions.length;
  document.querySelectorAll('.session').forEach(b => b.disabled = locked);
  $('composer-note').textContent = sending ? 'La réponse continue sur le PC si tu quittes le navigateur. Elle sera retrouvée à ton retour.' : $('agent-files').checked ? 'Lecture ciblée des fichiers utiles. Une copie précède chaque remplacement.' : 'Le modèle reçoit les messages et les fichiers joints, sans modifier le projet.';
  fileBrowser.refresh();
}
function scheduleRecovery() {
  clearTimeout(recoveryTimer);
  if (pendingReply) recoveryTimer = setTimeout(recoverReply, 2000);
}
async function recoverReply() {
  if (recoveryBusy || state.controller || !pendingReply || $('app').hidden) return;
  clearTimeout(recoveryTimer);
  if (document.visibilityState === 'hidden') { scheduleRecovery(); return; }
  recoveryBusy = true;
  const pending = pendingReply;
  setSending(true);
  try {
    if (!pending.id) {
      const receipt = await api('/api/chat-request?' + new URLSearchParams({ projectId: pending.projectId, requestId: pending.requestId }));
      if (receipt.id) { pending.id = receipt.id; rememberReply(pending); }
      else if (receipt.status === 'error') { rememberReply(null); error(receipt.message); return; }
      else { $('composer-note').textContent = 'Demande reçue sur le PC. Préparation de la réponse…'; return; }
    }
    const chat = await api('/api/conversation?' + new URLSearchParams({ projectId: pending.projectId, id: pending.id }));
    if (pending !== pendingReply) return;
    const nearBottom = $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 160;
    const oldScroll = $('messages').scrollTop;
    state.chat = chat; state.streamId = chat.id; rememberChat();
    fileBrowser.clear(); $('upload-status').hidden = true;
    $('prompt').value = '';
    renderChat(); $('app').classList.add('thread-open');
    if (!nearBottom) $('messages').scrollTop = oldScroll;
    error('');
    if (chat.generation?.status !== 'running') {
      rememberReply(null); state.streamId = null;
      if (chat.generation?.message) error(chat.generation.message);
      await loadSessions();
    }
  } catch (e) {
    if (e.status === 404 && Date.now() - pending.createdAt > 15000) {
      rememberReply(null); error('Le PC n’a pas confirmé cet envoi. Vérifie les conversations avant de le renvoyer.');
    } else if (e.status !== 401) error('Reconnexion au PC… Le prompt ne sera pas renvoyé. La réponse sera récupérée dès le retour de la connexion.');
  } finally {
    recoveryBusy = false; state.loading = false;
    setSending(!!pendingReply);
    scheduleRecovery();
  }
}
function resumeReply() {
  if (document.visibilityState === 'hidden' || $('app').hidden) return;
  if (state.controller) state.controller.abort();
  else recoverReply();
}
async function send(event) {
  event.preventDefault();
  const text = $('prompt').value.trim(); if (!text || state.sending || state.loading || state.uploading || $('send').disabled) return;
  ++state.viewSeq;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const requestId = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  error(''); const data = { requestId, projectId: state.projectId, sessionId: state.chat?.id || null, model: $('model').value, reasoning: $('effort').value, fileAccess: $('agent-files').checked, text, attachments: fileBrowser.references() };
  rememberReply({ requestId, projectId: state.projectId, id: null, createdAt: Date.now() });
  $('app').classList.add('thread-open');
  if (!$('messages').querySelector('.message')) $('messages').replaceChildren();
  const user = { role: 'user', text }; addMessage(user);
  const waiting = node('p', 'waiting', 'Connexion au modèle…'); $('messages').append(waiting); scrollBottom();
  $('prompt').value = ''; setSending(true); state.controller = new AbortController();
  let accepted = false, rejected = false, replyNode, replyText = '';
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: state.controller.signal });
    if (!r.ok) {
      const j = await r.json(); rejected = r.status !== 409;
      if (rejected) rememberReply(null);
      if (r.status === 401) { $('login').hidden = false; $('app').hidden = true; }
      throw new Error(j.error || 'Le modèle ne peut pas répondre.');
    }
    const reader = r.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const e = JSON.parse(line);
        if (e.type === 'start') {
          fileBrowser.clear();
          $('upload-status').hidden = true;
          accepted = true; state.streamId = e.id; waiting.remove();
          rememberReply({ ...pendingReply, id: e.id });
          state.chat = { id: e.id, projectId: state.projectId, name: e.name, source: 'web', model: data.model, reasoningByModel: { [data.model]: e.reasoning }, fileAccess: e.fileAccess };
          rememberChat();
          $('thread-title').textContent = e.name; $('thread-subtitle').textContent = 'Suite web · conservée sur ce PC';
          $('banner').hidden = false; $('banner').textContent = 'Conversation web. Les nouveaux messages restent ici et ne sont pas synchronisés vers Bionic.' + (e.contextOmitted ? ' Seule la fin de l’historique a été transmise au modèle.' : '');
          replyNode = addMessage({ role: 'assistant', text: '' }); replyNode.textContent = 'Le modèle prépare sa réponse…';
        } else if (e.type === 'delta') {
          const nearBottom = $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 160;
          replyText += e.text; replyNode.textContent = replyText; if (nearBottom) scrollBottom();
        } else if (e.type === 'action-start') { if (!replyText) replyNode.textContent = 'Le modèle travaille sur les fichiers du projet…'; }
        else if (e.type === 'action') { addFileAction(replyNode.closest('article'), e.action); scrollBottom(); }
        else if (e.type === 'error') error(e.message);
        else if (e.type === 'done' && e.limited) toast('Limite de réponse atteinte. Tu peux demander de continuer.');
      }
    }
    if (replyNode) renderText(replyNode, replyText);
  } catch (e) {
    if (rejected) error(e.message);
    else if (document.visibilityState !== 'hidden') error('Reconnexion au PC… Récupération de la réponse en cours.');
    if (!accepted) $('prompt').value = text;
  } finally {
    waiting.remove(); state.controller = null;
    if (pendingReply) await recoverReply();
    else { state.streamId = null; renderChat(); setSending(false); }
  }
}
function newChat(focus = true) {
  if (state.sending || state.uploading) return; ++state.viewSeq; state.chat = null; state.draftReasoning = {}; state.draftFileAccess = null;
  fileBrowser.clear(); $('app').classList.add('thread-open'); renderChat(); error('');
  $('upload-status').hidden = true;
  if (focus) $('prompt').focus();
}
async function start() {
  await checkStatus(); $('login').hidden = true; $('app').hidden = false;
  if (pendingReply) state.projectId = pendingReply.projectId;
  await loadProjects();
  if (pendingReply && state.projects.some(project => project.id === pendingReply.projectId)) {
    $('app').classList.add('thread-open'); await recoverReply();
  } else {
    if (pendingReply) rememberReply(null);
    const last = localStorage.getItem('bm_chat_' + state.projectId);
    if (last && state.sessions.some(chat => chat.id === last)) await openChat(last);
  }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-error').textContent = ''; $('login-button').disabled = true;
  try { await api('/api/login', { method: 'POST', body: JSON.stringify({ code: $('code').value.trim() }) }); $('code').value = ''; await start(); }
  catch (e) { $('login-error').textContent = e.message; }
  finally { $('login-button').disabled = false; }
});
$('reveal').addEventListener('click', () => { const show = $('code').type === 'password'; $('code').type = show ? 'text' : 'password'; $('reveal').setAttribute('aria-pressed', String(show)); $('reveal').setAttribute('aria-label', show ? 'Masquer le code' : 'Afficher le code'); });
$('project').addEventListener('change', async () => { if (state.sending || state.uploading) return; fileBrowser.clear(); $('upload-status').hidden = true; state.projectId = $('project').value; state.chat = null; state.draftReasoning = {}; state.draftFileAccess = null; ++state.viewSeq; $('search').value = ''; try { await loadSessions(); renderChat(); } catch (e) { error(e.message); } });
$('agent-files').addEventListener('change', () => { state.draftFileAccess = $('agent-files').checked; setSending(state.sending); });
$('upload-file').addEventListener('click', () => { if (!state.sending && !state.uploading && state.projectId) $('phone-files').click(); });
$('phone-files').addEventListener('change', async () => {
  const selected = [...$('phone-files').files]; $('phone-files').value = '';
  if (!selected.length || state.sending || state.uploading || !state.projectId) return;
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
        imported++; if (fileBrowser.addImported(result)) attached++;
      } catch (e) { failures.push(file.name + ' : ' + e.message); if (e.status === 401) break; }
    }
    $('upload-status').textContent = `${imported} fichier${imported > 1 ? 's' : ''} enregistré${imported > 1 ? 's' : ''} dans « Imports telephone » · ${attached} joint${attached > 1 ? 's' : ''} au prochain message.`;
    if (failures.length) error(failures.join(' '));
    if (imported) { $('app').classList.add('thread-open'); renderChat(); }
  } finally { state.uploading = false; setSending(false); }
});
$('model').addEventListener('change', setEffort);
$('effort').addEventListener('change', () => { state.draftReasoning[$('model').value] = $('effort').value; });
$('search').addEventListener('input', renderSessions);
$('new-chat').addEventListener('click', () => newChat());
$('back').addEventListener('click', () => { $('app').classList.remove('thread-open'); $('project').focus(); });
$('refresh').addEventListener('click', async () => { if (state.sending) return; $('refresh').disabled = true; try { error(''); await Promise.all([checkStatus(), loadProjects()]); if (state.chat) await openChat(state.chat.id); toast('Projets et conversations actualisés.'); } catch (e) { error(e.message); toast(e.message); } finally { $('refresh').disabled = false; } });
$('logout').addEventListener('click', async () => { if (state.sending) { toast('Arrête d’abord la génération en cours.'); return; } try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {} $('app').hidden = true; $('login').hidden = false; $('code').focus(); });
$('info-button').addEventListener('click', () => { const show = $('info').hidden; $('info').hidden = !show; $('info-button').setAttribute('aria-expanded', String(show)); });
$('composer').addEventListener('submit', send);
$('prompt').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('composer').requestSubmit(); } });
$('stop').addEventListener('click', async () => {
  try {
    await api('/api/cancel', { method: 'POST', body: JSON.stringify({ id: state.streamId || pendingReply?.id, requestId: pendingReply?.requestId }) });
    if (state.controller) state.controller.abort(); else recoverReply();
  } catch { error('Impossible de joindre le PC pour arrêter la réponse. Réessaie après reconnexion.'); }
});
document.addEventListener('visibilitychange', resumeReply);
window.addEventListener('pageshow', resumeReply);
window.addEventListener('online', resumeReply);
$('models-open-sidebar').addEventListener('click', openModels);
$('models-open-thread').addEventListener('click', openModels);
$('models-refresh').addEventListener('click', refreshLoadedModels);
$('models-close').addEventListener('click', () => $('models-dialog').close());
start().catch(e => { if (!/Connecte-toi/.test(e.message)) $('login-error').textContent = e.message; });
