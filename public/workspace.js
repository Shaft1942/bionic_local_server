'use strict';
function createWorkspace({ api, node, icon, toast, getState, openTarget }) {
  const $ = id => document.getElementById(id);
  const data = { mode: 'activity', projectId: '', events: [], deliverables: [], detail: null, sequence: 0, epoch: 0, active: false, polling: false, readKey: '', since: Date.now(), read: new Map(), pinTitles: new Map(), pins: new Map(), opener: null };
  const visible = () => !$('workspace-view').hidden;
  const date = value => { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed) : 'Date indisponible'; };
  const eventId = item => item.id || item.eventId;
  const isUnread = item => { const finishedAt = new Date(item.finishedAt).getTime(); return Number.isFinite(finishedAt) && finishedAt >= data.since && !data.read.has(eventId(item)); };
  function fail(message) { $('workspace-error').textContent = message || ''; $('workspace-error').hidden = !message; }
  function button(text, action, className = 'file-action') { const el = node('button', className, text); el.type = 'button'; el.addEventListener('click', action); return el; }
  function persistRead() {
    const entries = [...data.read.entries()].slice(-500);
    data.read = new Map(entries);
    try { if (data.readKey) localStorage.setItem(data.readKey, JSON.stringify({ since: data.since, read: entries })); } catch {}
  }
  function updateBadge() {
    const count = data.events.filter(isUnread).length;
    $('activity-count').hidden = count === 0; $('activity-count').textContent = String(count);
    $('activity-open-sidebar').setAttribute('aria-label', 'Depuis votre départ' + (count ? ` · ${count} réponse${count > 1 ? 's' : ''} non consultée${count > 1 ? 's' : ''}` : ''));
    $('activity-open-thread').setAttribute('aria-label', 'Depuis votre départ' + (count ? ` · ${count} non consultée${count > 1 ? 's' : ''}` : ''));
    $('activity-open-thread').classList.toggle('has-unread', count > 0);
  }
  function markRead(item) { data.read.delete(eventId(item)); data.read.set(eventId(item), Date.now()); persistRead(); updateBadge(); }
  function projectOptions() {
    const projects = getState().projects || [], select = $('workspace-project');
    select.replaceChildren();
    if (data.mode === 'activity') select.append(new Option('Tous les projets', ''));
    for (const project of projects) select.append(new Option(project.name, project.id));
    if (!projects.some(project => project.id === data.projectId) && (data.projectId || data.mode !== 'activity')) data.projectId = getState().projectId || projects[0]?.id || '';
    select.value = data.projectId;
  }
  function setMode(mode) {
    data.mode = mode; data.detail = null; $('workspace-detail').hidden = true;
    if (mode === 'deliverables' && !data.projectId) data.projectId = getState().projectId || '';
    $('workspace-title').textContent = mode === 'activity' ? 'Depuis votre départ' : 'Livrables';
    $('workspace-description').textContent = mode === 'activity' ? 'Réponses terminées ou interrompues sur ce PC. Le suivi des non consultées est propre à cet appareil.' : 'Des copies figées, conservées dans ce projet. Les fichiers d’origine restent indépendants.';
    $('workspace-activity').setAttribute('aria-pressed', String(mode === 'activity'));
    $('workspace-deliverables').setAttribute('aria-pressed', String(mode === 'deliverables'));
    projectOptions(); loadPanel();
  }
  function open(mode, opener) {
    if (!getState().authenticated) return;
    data.opener = opener || document.activeElement;
    data.returnView = { key: getState().viewKey, scrollTop: $('messages').scrollTop };
    $('app').hidden = true; $('workspace-view').hidden = false;
    data.projectId = mode === 'activity' ? '' : getState().projectId || '';
    setMode(mode); $('workspace-close').focus();
  }
  function close() {
    ++data.sequence; $('workspace-view').hidden = true;
    if (getState().authenticated) { $('app').hidden = false; if (getState().viewKey === data.returnView?.key) $('messages').scrollTop = data.returnView.scrollTop; if (data.opener?.isConnected && data.opener.getClientRects().length) data.opener.focus({ preventScroll: true }); }
  }
  function empty(title, text) { const el = node('div', 'workspace-empty'); el.append(node('h2', '', title), node('p', '', text)); return el; }
  async function visit(item, unreadEvent = false) {
    fail(''); const epoch = data.epoch;
    try {
      const found = await openTarget(item.projectId, item.chatId, item.messageId);
      if (epoch !== data.epoch || !data.active) return;
      if (!found) throw new Error('Ce message n’est plus disponible dans l’historique affiché. La réponse reste non consultée.');
      if (unreadEvent) markRead(item);
      close();
      const target = [...document.querySelectorAll('#messages .message')].find(el => el.dataset.messageId === item.messageId);
      target?.scrollIntoView({ block: 'center' }); target?.focus({ preventScroll: true });
    } catch (e) { if (epoch === data.epoch && data.active) fail(e.message); }
  }
  function renderActivity() {
    const list = $('workspace-list'), layout = document.querySelector('.workspace-layout');
    const focused = document.activeElement?.closest('.activity-item');
    const focusedId = focused?.dataset.eventId, focusedIndex = focused ? [...focused.querySelectorAll('button')].indexOf(document.activeElement) : -1;
    const anchor = [...list.querySelectorAll('.activity-item')].find(el => el.getBoundingClientRect().bottom > layout.getBoundingClientRect().top);
    const anchorId = anchor?.dataset.eventId, anchorTop = anchor?.getBoundingClientRect().top;
    list.replaceChildren();
    const events = data.events.filter(item => !data.projectId || item.projectId === data.projectId);
    if (!events.length) { list.append(empty('Aucune réponse à retrouver.', 'Les réponses terminées, en erreur ou interrompues apparaîtront ici. Tu peux continuer un autre chat pendant leur exécution.')); return; }
    const outcomes = { completed: 'Réponse terminée', done: 'Réponse terminée', stopped: 'Réponse arrêtée', error: 'Réponse en erreur', interrupted: 'Interruption constatée' };
    let lastProject;
    const groups = new Map(); for (const item of events) { if (!groups.has(item.projectId)) groups.set(item.projectId, []); groups.get(item.projectId).push(item); }
    for (const item of [...groups.values()].flat()) {
      if (lastProject !== item.projectId) { list.append(node('h2', 'workspace-project-heading', item.projectName || 'Projet')); lastProject = item.projectId; }
      const article = node('article', 'activity-item' + (isUnread(item) ? ' unread' : ''));
      article.dataset.eventId = eventId(item);
      const title = node('h3', '', item.chatName || 'Conversation');
      article.append(title, node('p', 'workspace-meta', `${outcomes[item.outcome] || 'Exécution terminée'} · ${date(item.finishedAt)}`));
      if (item.outcome === 'interrupted') article.append(node('p', 'workspace-meta', 'Date du constat après redémarrage ; l’heure d’arrêt du PC est inconnue.'));
      const label = node('p', 'activity-read-state', isUnread(item) ? 'Non consultée sur cet appareil' : 'Consultée ou antérieure à ce suivi'); article.append(label);
      const actions = node('div', 'workspace-actions');
      const consult = button('Consulter la réponse', async () => { consult.disabled = true; await visit(item, true); consult.disabled = false; });
      actions.append(consult);
      if (isUnread(item)) {
        const read = button('Marquer comme consultée', () => { markRead(item); article.classList.remove('unread'); label.textContent = 'Consultée sur cet appareil'; read.remove(); }); actions.append(read);
      }
      article.append(actions); list.append(article);
    }
    if (anchorId) { const replacement = [...list.querySelectorAll('.activity-item')].find(el => el.dataset.eventId === anchorId); if (replacement) layout.scrollTop += replacement.getBoundingClientRect().top - anchorTop; }
    if (focusedId && focusedIndex >= 0) { const replacement = [...list.querySelectorAll('.activity-item')].find(el => el.dataset.eventId === focusedId); replacement?.querySelectorAll('button')[focusedIndex]?.focus({ preventScroll: true }); }
  }
  function renderDeliverables() {
    const list = $('workspace-list'); list.replaceChildren();
    if (!data.deliverables.length) { list.append(empty('Garde les résultats utiles à portée de main.', 'Dans une réponse terminée, choisis « Conserver comme livrable ». Après une écriture de fichier, choisis « Conserver ce fichier ». Tu retrouveras ici une copie indépendante de la source.')); return; }
    for (const item of data.deliverables) {
      const article = node('article', 'deliverable-item'); article.dataset.deliverableId = item.id;
      article.append(node('h2', '', item.title), node('p', 'workspace-meta', (item.kind === 'file' ? 'Fichier' : 'Réponse') + ' · copie figée · ' + date(item.createdAt)), node('p', 'workspace-origin', item.origin?.chatName || 'Conversation d’origine'));
      const actions = node('div', 'workspace-actions'); const show = button('Ouvrir la copie', () => loadDetail(item.id)); actions.append(show);
      article.append(actions); list.append(article);
    }
  }
  async function loadPanel() {
    const sequence = ++data.sequence, epoch = data.epoch, mode = data.mode, projectId = data.projectId;
    fail(''); $('workspace-status').textContent = mode === 'activity' ? 'Chargement des dernières réponses…' : 'Chargement des livrables…';
    $('workspace-list').setAttribute('aria-busy', 'true'); $('workspace-list').replaceChildren();
    try {
      if (mode === 'activity') {
        const result = await api('/api/activity'); if (sequence !== data.sequence || epoch !== data.epoch) return;
        data.events = result.events || []; updateBadge(); renderActivity();
        $('workspace-status').textContent = result.truncated ? 'Les 100 événements les plus récents sont affichés. Ouvrir cet espace ne marque aucune réponse comme consultée.' : 'Ouvrir cet espace ne marque aucune réponse comme consultée.';
      } else {
        if (!projectId) { $('workspace-list').append(empty('Aucun projet disponible.', 'Crée un projet dans Bionic puis actualise les projets.')); $('workspace-status').textContent = ''; return; }
        const result = await api('/api/deliverables?' + new URLSearchParams({ projectId })); if (sequence !== data.sequence || epoch !== data.epoch) return;
        data.deliverables = result.deliverables || []; renderDeliverables();
        $('workspace-status').textContent = `${data.deliverables.length} livrable${data.deliverables.length > 1 ? 's' : ''} conservé${data.deliverables.length > 1 ? 's' : ''} dans ce projet.`;
      }
    } catch (e) { if (sequence === data.sequence && epoch === data.epoch) { fail(e.message); $('workspace-status').textContent = 'Réessaie avec « Actualiser cet espace ».'; } }
    finally { if (sequence === data.sequence) $('workspace-list').removeAttribute('aria-busy'); }
  }
  async function loadDetail(id) {
    const sequence = ++data.sequence, epoch = data.epoch, projectId = data.projectId;
    fail(''); $('workspace-detail').hidden = false; $('workspace-detail').replaceChildren(node('p', '', 'Ouverture de la copie conservée…'));
    try {
      const item = await api('/api/deliverable?' + new URLSearchParams({ projectId, id }));
      if (sequence !== data.sequence || epoch !== data.epoch) return;
      data.detail = item; renderDetail(item, projectId); $('workspace-detail').scrollIntoView({ block: 'start' });
    } catch (e) { if (sequence === data.sequence && epoch === data.epoch) { fail(e.message); $('workspace-detail').replaceChildren(node('p', '', 'Cette copie ne peut pas être ouverte. Réessaie depuis la liste.')); } }
  }
  function renderDetail(item, projectId) {
    const detail = $('workspace-detail'); detail.replaceChildren();
    const heading = node('h2', '', item.title); heading.tabIndex = -1; detail.append(heading);
    const statuses = { snapshot: 'Copie figée de la réponse.', unchanged: 'Le fichier du PC correspond encore à cette copie.', changed: 'Le fichier du PC a changé depuis cette copie. La copie conservée reste inchangée.', missing: 'Le fichier d’origine est absent du PC. La copie conservée reste disponible.', unavailable: 'L’état du fichier d’origine ne peut pas être vérifié. La copie conservée reste disponible.' };
    detail.append(node('p', 'deliverable-source-status', statuses[item.sourceStatus] || statuses.unavailable));
    if (item.origin?.path) detail.append(node('p', 'workspace-origin', 'Source sur le PC : ' + item.origin.path));
    detail.append(node('p', 'workspace-meta', 'Conservé le ' + date(item.createdAt) + ' · ' + new Intl.NumberFormat('fr-FR').format(item.size) + ' octets'));
    const actions = node('div', 'workspace-actions');
    const download = node('a', 'file-action', 'Télécharger la copie'); download.href = '/api/deliverable/download?' + new URLSearchParams({ projectId, id: item.id }); download.download = item.name || 'livrable.txt'; actions.append(download);
    if (item.origin?.chatId) actions.append(button('Ouvrir la conversation d’origine', () => visit({ projectId, chatId: item.origin.chatId, messageId: item.origin.messageId })));
    if (item.kind === 'file' && item.origin?.path && item.sourceStatus !== 'missing' && item.sourceStatus !== 'unavailable') {
      const source = node('a', 'file-action', 'Télécharger le fichier actuel du PC'); source.href = '/api/file/download?' + new URLSearchParams({ projectId, rootId: item.origin.rootId || 'project', path: item.origin.path }); source.download = item.name; actions.append(source);
    }
    detail.append(actions);
    if (typeof item.text === 'string') {
      detail.append(node('h3', '', 'Contenu de la copie'), node('pre', 'deliverable-text', item.text));
      if (item.textTruncated) detail.append(node('p', 'workspace-meta', 'Aperçu partiel. Télécharge la copie pour obtenir le fichier complet.'));
    } else detail.append(node('p', '', 'Ce format se consulte en téléchargeant la copie. Aucun contenu actif n’est exécuté dans cet espace.'));
    const form = node('form', 'deliverable-rename'); const inputId = 'deliverable-title'; const label = node('label', '', 'Titre du livrable'); label.htmlFor = inputId;
    const input = node('input'); input.id = inputId; input.value = item.title; input.maxLength = 120; input.required = true;
    const save = node('button', 'file-action', 'Renommer le livrable'); save.type = 'submit'; form.append(label, input, save);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (save.disabled) return; if (!input.value.trim()) return input.reportValidity(); save.disabled = true; fail('');
      try { const renamed = await api('/api/deliverable/rename', { method: 'POST', body: JSON.stringify({ projectId, id: item.id, title: input.value.trim() }) }); if (!visible() || data.projectId !== projectId || data.detail?.id !== item.id) return; item.title = renamed.title; heading.textContent = renamed.title; const listed = data.deliverables.find(row => row.id === item.id); if (listed) listed.title = renamed.title; renderDeliverables(); toast('Titre du livrable enregistré.'); }
      catch (e) { fail(e.message); } finally { save.disabled = false; }
    }); detail.append(form);
    const remove = button('Retirer de l’étagère', async () => {
      remove.disabled = true; fail('');
      try { await api('/api/deliverable/remove', { method: 'POST', body: JSON.stringify({ projectId, id: item.id }) }); if (!visible() || data.projectId !== projectId || data.detail?.id !== item.id) return; data.deliverables = data.deliverables.filter(row => row.id !== item.id); data.detail = null; detail.hidden = true; renderDeliverables(); toast('Copie retirée de l’étagère. La source est conservée.'); $('workspace-deliverables').focus(); }
      catch (e) { fail(e.message); remove.disabled = false; }
    }); detail.append(node('p', 'workspace-meta', 'Renommer ou retirer ce livrable ne modifie ni la réponse ni le fichier d’origine.'), remove); heading.focus({ preventScroll: true });
  }
  function pinControl(message, chat, action) {
    const kind = action ? 'file' : 'message', projectId = getState().projectId;
    if (!message.id || !chat?.id || !projectId) return null;
    const key = [projectId, chat.id, message.id, action?.id || 'message'].join('|');
    const pinState = data.pins.get(key) || { busy: false, saved: false, message: '' }; data.pins.set(key, pinState);
    if (data.pins.size > 100) { const oldKey = [...data.pins.keys()].find(id => !data.pins.get(id).busy); if (oldKey && oldKey !== key) data.pins.delete(oldKey); }
    const details = node('details', 'pin-control'); details.dataset.disclosureKey = 'pin:' + key;
    const summary = node('summary', '', action ? 'Conserver ce fichier' : 'Conserver comme livrable'); summary.dataset.workspaceFocus = 'pin-summary:' + key; details.append(summary);
    const form = node('form', 'pin-form'), label = node('label', '', 'Titre dans les livrables'), input = node('input');
    const title = action ? (action.path || '').split(/[\\/]/).pop() : (message.text || '').split('\n').find(line => line.trim())?.replace(/^#+\s*/, '') || 'Réponse conservée';
    input.value = data.pinTitles.get(key) ?? title.slice(0, 120); input.maxLength = 120; input.required = true; input.dataset.workspaceFocus = key;
    label.append(input); input.addEventListener('input', () => { data.pinTitles.set(key, input.value); if (data.pinTitles.size > 100) data.pinTitles.delete(data.pinTitles.keys().next().value); });
    const save = node('button', 'file-action', pinState.saved ? 'Copie conservée' : 'Conserver la copie figée'); save.type = 'submit'; save.disabled = pinState.busy || pinState.saved; const status = node('p', 'pin-status', pinState.message); status.setAttribute('role', 'status');
    form.append(label, save, status); details.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (pinState.busy || pinState.saved) return; if (!input.value.trim()) return input.reportValidity(); pinState.busy = true; save.disabled = true; pinState.message = status.textContent = 'Conservation de la copie…';
      const epoch = data.epoch;
      try { await api('/api/deliverables', { method: 'POST', body: JSON.stringify({ projectId, chatId: chat.id, messageId: message.id, ...(action ? { actionId: action.id } : {}), title: input.value.trim(), kind }) }); if (epoch !== data.epoch) return; pinState.saved = true; pinState.message = status.textContent = 'Copie conservée dans les livrables du projet.'; toast('Copie conservée dans les livrables du projet.'); save.textContent = 'Copie conservée'; }
      catch (e) { if (epoch === data.epoch) { pinState.message = status.textContent = e.message; save.disabled = false; } }
      finally { pinState.busy = false; }
    }); return details;
  }
  function contextControl(message) {
    const receipt = message.contextReceipt, details = node('details', 'context-receipt'); details.dataset.disclosureKey = 'context';
    const summary = node('summary', '', 'Contexte utilisé'); summary.dataset.workspaceFocus = 'context-summary:' + (message.id || message.localRequestId); details.append(summary);
    if (!receipt || receipt.version !== 1) { details.append(node('p', '', 'Relevé indisponible pour cette réponse. Les anciens échanges ne permettent pas de reconstituer les fichiers réellement transmis.')); return details; }
    details.append(node('p', '', 'Ce relevé décrit les messages et les pièces jointes sélectionnés, ainsi que les lectures effectuées par les outils. Il ne décrit pas le raisonnement du modèle.'));
    if(receipt.historical)details.append(node('p','','Relevé historique copié du fil source. Ces outils n’ont pas été rejoués dans cette branche.'));
    details.append(node('p', '', 'Les consignes du compagnon et les outils autorisés s’ajoutent à ces éléments.'));
    details.append(node('p', '', receipt.initialTransmitted ? 'L’envoi initial a été accepté par le serveur du modèle. Cela ne garantit pas que le modèle a pris en compte chaque élément.' : 'Envoi initial préparé ; transmission non confirmée à ce stade.'));
    const history = receipt.history || {}, messages = history.messages || [];
    details.append(node('h3', '', receipt.initialTransmitted ? 'Messages transmis dans la requête acceptée' : 'Messages sélectionnés pour l’envoi'), node('p', '', `${history.selectedCount ?? messages.length} message${(history.selectedCount ?? messages.length) > 1 ? 's' : ''} d’historique + le message actuel.`));
    if (history.omittedCount) details.append(node('p', '', `${history.omittedCount} message${history.omittedCount > 1 ? 's' : ''} d’historique écarté${history.omittedCount > 1 ? 's' : ''} de cet envoi.`));
    if (history.importedTruncated) details.append(node('p', '', 'L’historique importé depuis Bionic était déjà partiel.'));
    const historyList = node('ul', 'context-history');
    for (const entry of messages) {
      const row = node('li'); row.append(node('p', '', (entry.role === 'assistant' ? 'Assistant' : 'Toi') + ' · ' + (entry.preview || 'Message sans aperçu')));
      if (entry.id) { const jump = button('Voir ce message', () => jumpTo(entry.id)); row.append(jump); } historyList.append(row);
    }
    if (messages.length) details.append(historyList);
    if (receipt.current?.messageId) details.append(button('Voir le message actuel', () => jumpTo(receipt.current.messageId)));
    const attachments = receipt.attachments || []; details.append(node('h3', '', `Pièces jointes · ${attachments.length}`));
    if (!attachments.length) details.append(node('p', '', 'Aucune pièce jointe dans cet envoi.'));
    for (const file of attachments) {
      const entry = node('details', 'context-file'); entry.dataset.disclosureKey = 'attachment:' + file.messageId + ':' + file.index;
      entry.append(node('summary', '', (file.name || file.path || 'Pièce jointe') + ' · ' + (file.transmitted ? file.kind === 'image' ? 'image transmise' : file.excerpt ? 'extrait transmis' : 'texte transmis' : file.reason === 'vision-disabled' ? 'image non transmise · modèle sans vision' : 'transmission non confirmée')));
      if (file.path) entry.append(node('p', '', 'Source : ' + file.path + (file.rootId ? ' · dossier ' + file.rootId : '')));
      if (file.reason) entry.append(node('p', '', file.reason === 'vision-disabled' ? 'Cette image n’a pas été incluse dans l’envoi : le modèle sélectionné ne prend pas en charge la vision.' : file.reason));
      if (Number.isFinite(file.characters)) entry.append(node('p', '', `${file.characters} caractères${file.excerpt ? ' · extrait sélectionné' : ''}.`));
      if (file.preview) entry.append(node('pre', '', file.preview));
      if (file.hash) entry.append(node('p', 'context-hash', 'Empreinte de la copie jointe : ' + file.hash));
      if (file.messageId) entry.append(button('Voir le message avec cette pièce jointe', () => jumpTo(file.messageId))); details.append(entry);
    }
    const reads = receipt.toolReads || []; details.append(node('h3', '', `Lectures par les outils · ${reads.length}`));
    details.append(node('p', '', receipt.toolsEnabled ? 'Les outils autorisés étaient disponibles. Les extraits ci-dessous ont été renvoyés au modèle ; une recherche peut avoir inspecté d’autres fichiers sans en transmettre le contenu.' : 'Les outils n’étaient pas disponibles pour cette réponse.'));
    for (const read of reads) {
      const entry = node('details', 'context-file'); entry.dataset.disclosureKey = 'read:' + read.actionId;
      entry.append(node('summary', '', (read.path || 'Fichier') + ' · ' + (read.transmitted ? 'résultat transmis' : 'lu sur le PC · transmission non confirmée')));
      if (Number.isFinite(read.start) && Number.isFinite(read.length)) entry.append(node('p', '', `Caractères ${read.start + 1} à ${read.start + read.length}${Number.isFinite(read.totalCharacters) ? ' sur ' + read.totalCharacters : ''}.`));
      if (typeof read.text === 'string') entry.append(node('pre', '', read.text));
      if (read.truncated) entry.append(node('p', '', 'Lecture partielle. Le modèle n’a pas reçu tout le fichier lors de cet appel.'));
      if (read.hash) entry.append(node('p', 'context-hash', 'Empreinte du fichier au moment de la lecture : ' + read.hash)); details.append(entry);
    }
    if(receipt.external?.length){details.append(node('h3','','Web et sorties de scripts'));for(const output of receipt.external){const entry=node('details','context-file');entry.dataset.disclosureKey='external:'+output.actionId;entry.append(node('summary','',(output.kind==='search'?'Recherche web':output.kind==='web'?'Page web':'Sortie de script')+' · '+(output.transmitted?'résultat transmis':'transmission non confirmée')),node('p','',output.url||output.query||output.title||''),node('pre','',output.text||''));if(output.truncated)entry.append(node('p','','L’aperçu du reçu est borné ; le résultat transmis peut être plus long.'));details.append(entry);}}
    details.querySelectorAll('button,.context-file>summary').forEach((el, index) => el.dataset.workspaceFocus = 'context:' + (message.id || message.localRequestId) + ':' + index);
    return details;
  }
  function jumpTo(id) { const target = [...$('messages').querySelectorAll('.message')].find(el => el.dataset.messageId === id); if (!target) return toast('Ce message n’est pas présent dans la partie affichée de l’historique.'); target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); }
  async function refreshActivity() {
    if (!data.active || data.polling || Date.now() - (data.lastPoll || 0) < 4000) return;
    data.polling = true; data.lastPoll = Date.now(); const epoch = data.epoch;
    try { const result = await api('/api/activity'); if (epoch !== data.epoch || !data.active) return; const before = JSON.stringify(data.events); data.events = result.events || []; updateBadge(); if (visible() && data.mode === 'activity' && before !== JSON.stringify(data.events)) renderActivity(); }
    catch {} finally { data.polling = false; }
  }
  async function activate() {
    const epoch = ++data.epoch; data.active = true; data.since = Date.now(); data.lastPoll = 0;
    try {
      const info = await api('/api/ping'); if (epoch !== data.epoch || !data.active) return;
      data.readKey = 'bm_activity_read_v1_' + (String(info.instanceId || 'local').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80));
      try { const saved = JSON.parse(localStorage.getItem(data.readKey) || 'null'); if (Number.isFinite(saved?.since) && saved.since > 0) data.since = saved.since; data.read = new Map((Array.isArray(saved?.read) ? saved.read : []).filter(row => Array.isArray(row) && typeof row[0] === 'string' && row[0].length <= 250 && Number.isFinite(row[1])).slice(-500)); } catch { data.read = new Map(); }
      persistRead(); updateBadge(); await refreshActivity();
    } catch {}
  }
  function reset() { ++data.epoch; ++data.sequence; data.active = false; data.events = []; data.deliverables = []; data.detail = null; data.read = new Map(); data.readKey = ''; data.pinTitles.clear(); data.pins.clear(); $('workspace-view').hidden = true; $('workspace-list').replaceChildren(); $('workspace-detail').replaceChildren(); $('workspace-project').replaceChildren(); $('workspace-status').textContent = ''; fail(''); updateBadge(); }
  $('workspace-close').append(icon('back')); $('workspace-refresh').append(icon('refresh')); $('activity-open-thread').append(icon('activity'));
  $('activity-open-sidebar').addEventListener('click', event => open('activity', event.currentTarget));
  $('activity-open-thread').addEventListener('click', event => open('activity', event.currentTarget));
  $('deliverables-open-sidebar').addEventListener('click', event => open('deliverables', event.currentTarget));
  $('workspace-close').addEventListener('click', close);
  $('workspace-activity').addEventListener('click', () => setMode('activity'));
  $('workspace-deliverables').addEventListener('click', () => setMode('deliverables'));
  $('workspace-project').addEventListener('change', () => { data.projectId = $('workspace-project').value; data.detail = null; $('workspace-detail').hidden = true; loadPanel(); });
  $('workspace-refresh').addEventListener('click', () => { data.detail = null; $('workspace-detail').hidden = true; loadPanel(); });
  return { activate, reset, refreshActivity, contextControl, pinControl };
}
