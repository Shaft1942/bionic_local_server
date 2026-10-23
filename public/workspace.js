'use strict';
function createWorkspace({ api, node, icon, toast, getState, openTarget, imageGallery }) {
  const $ = id => document.getElementById(id);
  const data = { mode: 'activity', projectId: '', events: [], deliverables: [], detail: null, sequence: 0, epoch: 0, active: false, polling: false, readKey: '', since: Date.now(), read: new Map(), pinTitles: new Map(), pins: new Map(), opener: null,category:'copies',images:[],imageTotal:0,nextCursor:null,loadingImages:false };
  const visible = () => !$('workspace-view').hidden;
  const date = value => { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? BionicI18n.date(parsed, { dateStyle: 'medium', timeStyle: 'short' }) : BionicI18n.t('components.workspace.dateUnavailable'); };
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
    $('activity-count').hidden = count === 0; $('activity-count').textContent = BionicI18n.number(count);
    $('activity-open-sidebar').setAttribute('aria-label', BionicI18n.t('components.workspace.activity') + (count ? BionicI18n.t('components.workspace.unreadCount', { count }) : ''));
    $('activity-open-thread').setAttribute('aria-label', BionicI18n.t('components.workspace.activity') + (count ? BionicI18n.t('components.workspace.unreadShort', { count }) : ''));
    $('activity-open-thread').classList.toggle('has-unread', count > 0);
  }
  function markRead(item) { data.read.delete(eventId(item)); data.read.set(eventId(item), Date.now()); persistRead(); updateBadge(); }
  function projectOptions() {
    const projects = getState().projects || [], select = $('workspace-project');
    select.replaceChildren();
    if (data.mode === 'activity') select.append(new Option(BionicI18n.t('components.workspace.allProjects'), ''));
    for (const project of projects) select.append(new Option(project.name, project.id));
    if (!projects.some(project => project.id === data.projectId) && (data.projectId || data.mode !== 'activity')) data.projectId = getState().projectId || projects[0]?.id || '';
    select.value = data.projectId;
  }
  function setMode(mode) {
    data.mode = mode; data.detail = null; $('workspace-detail').hidden = true;
    if (mode === 'deliverables' && !data.projectId) data.projectId = getState().projectId || '';
    $('workspace-title').textContent = mode === 'activity' ? BionicI18n.t('components.workspace.activity') : BionicI18n.t('components.workspace.deliverables');
    $('workspace-description').textContent = mode === 'activity' ? BionicI18n.t('components.workspace.activityDescription') : BionicI18n.t('components.workspace.deliverablesDescription');
    $('workspace-activity').setAttribute('aria-pressed', String(mode === 'activity'));
    $('workspace-deliverables').setAttribute('aria-pressed', String(mode === 'deliverables'));
    $('workspace-deliverable-categories').hidden=mode!=='deliverables';
    $('workspace-copies').setAttribute('aria-pressed',String(data.category==='copies'));$('workspace-generations').setAttribute('aria-pressed',String(data.category==='generations'));
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
      if (!found) throw new Error(BionicI18n.t('components.workspace.messageUnavailable'));
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
    if (!events.length) { list.append(empty(BionicI18n.t('components.workspace.activityEmpty'), BionicI18n.t('components.workspace.activityEmptyHelp'))); return; }
    const outcomes = { completed: BionicI18n.t('components.workspace.completed'), done: BionicI18n.t('components.workspace.completed'), stopped: BionicI18n.t('components.workspace.stopped'), error: BionicI18n.t('components.workspace.error'), interrupted: BionicI18n.t('components.workspace.interrupted') };
    let lastProject;
    const groups = new Map(); for (const item of events) { if (!groups.has(item.projectId)) groups.set(item.projectId, []); groups.get(item.projectId).push(item); }
    for (const item of [...groups.values()].flat()) {
      if (lastProject !== item.projectId) { list.append(node('h2', 'workspace-project-heading', item.projectName || BionicI18n.t('components.workspace.project'))); lastProject = item.projectId; }
      const article = node('article', 'activity-item' + (isUnread(item) ? ' unread' : ''));
      article.dataset.eventId = eventId(item);
      const title = node('h3', '', item.chatName || BionicI18n.t('components.workspace.conversation'));
      article.append(title, node('p', 'workspace-meta', `${outcomes[item.outcome] || BionicI18n.t('components.workspace.runFinished')} · ${date(item.finishedAt)}`));
      if (item.outcome === 'interrupted') article.append(node('p', 'workspace-meta', BionicI18n.t('components.workspace.interruptedHelp')));
      const label = node('p', 'activity-read-state', isUnread(item) ? BionicI18n.t('components.workspace.unread') : BionicI18n.t('components.workspace.readOrEarlier')); article.append(label);
      const actions = node('div', 'workspace-actions');
      const consult = button(BionicI18n.t('components.workspace.consult'), async () => { consult.disabled = true; await visit(item, true); consult.disabled = false; });
      actions.append(consult);
      if (isUnread(item)) {
        const read = button(BionicI18n.t('components.workspace.markRead'), () => { markRead(item); article.classList.remove('unread'); label.textContent = BionicI18n.t('components.workspace.read'); read.remove(); }); actions.append(read);
      }
      article.append(actions); list.append(article);
    }
    if (anchorId) { const replacement = [...list.querySelectorAll('.activity-item')].find(el => el.dataset.eventId === anchorId); if (replacement) layout.scrollTop += replacement.getBoundingClientRect().top - anchorTop; }
    if (focusedId && focusedIndex >= 0) { const replacement = [...list.querySelectorAll('.activity-item')].find(el => el.dataset.eventId === focusedId); replacement?.querySelectorAll('button')[focusedIndex]?.focus({ preventScroll: true }); }
  }
  function renderDeliverables() {
    const list = $('workspace-list'); list.replaceChildren();
    if (!data.deliverables.length) { list.append(empty(BionicI18n.t('components.workspace.deliverablesEmpty'), BionicI18n.t('components.workspace.deliverablesEmptyHelp'))); return; }
    for (const item of data.deliverables) {
      const article = node('article', 'deliverable-item'); article.dataset.deliverableId = item.id;
      article.append(node('h2', '', item.title), node('p', 'workspace-meta', BionicI18n.t('components.workspace.copyMeta', { kind: item.kind === 'file' ? BionicI18n.t('components.workspace.file') : BionicI18n.t('components.workspace.response'), date: date(item.createdAt) })), node('p', 'workspace-origin', item.origin?.chatName || BionicI18n.t('components.workspace.originChat')));
      const actions = node('div', 'workspace-actions'); const show = button(BionicI18n.t('components.workspace.openCopy'), () => loadDetail(item.id)); actions.append(show);
      article.append(actions); list.append(article);
    }
  }
  function renderGenerations(){
    const list=$('workspace-list');list.replaceChildren();
    if(!data.images.length)list.append(empty(BionicI18n.t("components.beta25.ccedc92b90"),'Les images réussies de toutes les conversations du projet apparaîtront automatiquement ici.'));
    else if(imageGallery)list.append(imageGallery(data.images,data.projectId));
    if(data.nextCursor){const more=button('Charger la suite',()=>loadMoreGenerations());more.id='workspace-images-more';more.disabled=data.loadingImages;list.append(more);}
  }
  async function loadMoreGenerations(){
    if(data.loadingImages||!data.nextCursor)return;
    const sequence=++data.sequence,epoch=data.epoch,projectId=data.projectId,cursor=data.nextCursor;
    data.loadingImages=true;const button=$('workspace-images-more');if(button)button.disabled=true;fail('');
    try{const result=await api('/api/comfy/generations?'+new URLSearchParams({projectId,cursor}));if(sequence!==data.sequence||epoch!==data.epoch||data.category!=='generations')return;const known=new Set(data.images.map(image=>image.id));data.images.push(...(result.images||[]).filter(image=>!known.has(image.id)));data.nextCursor=result.nextCursor||null;data.imageTotal=result.total??data.imageTotal;renderGenerations();$('workspace-status').textContent=BionicI18n.t('components.beta25.projectCount',{count:data.images.length,total:data.imageTotal});}
    catch(error){if(sequence===data.sequence&&epoch===data.epoch)fail(error.message);}
    finally{if(sequence===data.sequence){data.loadingImages=false;const more=$('workspace-images-more');if(more)more.disabled=false;}}
  }
  async function loadPanel() {
    const sequence = ++data.sequence, epoch = data.epoch, mode = data.mode, projectId = data.projectId;
    fail(''); $('workspace-status').textContent = mode === 'activity' ? BionicI18n.t('components.workspace.loadingActivity') : BionicI18n.t('components.workspace.loadingDeliverables');
    $('workspace-list').setAttribute('aria-busy', 'true'); $('workspace-list').replaceChildren();
    try {
      if (mode === 'activity') {
        const result = await api('/api/activity'); if (sequence !== data.sequence || epoch !== data.epoch) return;
        data.events = result.events || []; updateBadge(); renderActivity();
        if(result.partial)fail((result.warnings||[]).map(x=>x.message).join(' ')||BionicI18n.t('components.workspace.partialActivity'));
        $('workspace-status').textContent = result.truncated ? BionicI18n.t('components.workspace.recentLimit') : BionicI18n.t('components.workspace.doesNotMarkRead');
      } else {
        if (!projectId) { $('workspace-list').append(empty(BionicI18n.t('components.workspace.noProject'), BionicI18n.t('components.workspace.createProject'))); $('workspace-status').textContent = ''; return; }
        if(data.category==='generations'){
          const result=await api('/api/comfy/generations?'+new URLSearchParams({projectId}));if(sequence!==data.sequence||epoch!==data.epoch)return;
          data.images=result.images||[];data.imageTotal=result.total??data.images.length;data.nextCursor=result.nextCursor||null;data.loadingImages=false;renderGenerations();
          $('workspace-description').textContent=BionicI18n.t("components.beta25.e85bdb2adc");
          $('workspace-status').textContent=BionicI18n.t('components.beta25.projectCount',{count:data.images.length,total:data.imageTotal});return;
        }
        $('workspace-description').textContent=BionicI18n.t("components.beta25.fb4cdc516c");
        const result = await api('/api/deliverables?' + new URLSearchParams({ projectId })); if (sequence !== data.sequence || epoch !== data.epoch) return;
        data.deliverables = result.deliverables || []; renderDeliverables();
        $('workspace-status').textContent = BionicI18n.t('components.workspace.deliverableCount', { count: data.deliverables.length });
      }
    } catch (e) { if (sequence === data.sequence && epoch === data.epoch) { fail(e.message); $('workspace-status').textContent = BionicI18n.t('components.workspace.refreshHelp'); } }
    finally { if (sequence === data.sequence) $('workspace-list').removeAttribute('aria-busy'); }
  }
  async function loadDetail(id) {
    const sequence = ++data.sequence, epoch = data.epoch, projectId = data.projectId;
    fail(''); $('workspace-detail').hidden = false; $('workspace-detail').replaceChildren(node('p', '', BionicI18n.t('components.workspace.openingCopy')));
    try {
      const item = await api('/api/deliverable?' + new URLSearchParams({ projectId, id }));
      if (sequence !== data.sequence || epoch !== data.epoch) return;
      data.detail = item; renderDetail(item, projectId); $('workspace-detail').scrollIntoView({ block: 'start' });
    } catch (e) { if (sequence === data.sequence && epoch === data.epoch) { fail(e.message); $('workspace-detail').replaceChildren(node('p', '', BionicI18n.t('components.workspace.openCopyFailed'))); } }
  }
  function renderDetail(item, projectId) {
    const detail = $('workspace-detail'); detail.replaceChildren();
    const heading = node('h2', '', item.title); heading.tabIndex = -1; detail.append(heading);
    const statuses = { snapshot: BionicI18n.t('components.workspace.snapshot'), unchanged: BionicI18n.t('components.workspace.unchanged'), changed: BionicI18n.t('components.workspace.changed'), missing: BionicI18n.t('components.workspace.missing'), unavailable: BionicI18n.t('components.workspace.sourceUnavailable') };
    detail.append(node('p', 'deliverable-source-status', statuses[item.sourceStatus] || statuses.unavailable));
    if (item.origin?.path) detail.append(node('p', 'workspace-origin', BionicI18n.t('components.workspace.sourcePath', { path: item.origin.path })));
    detail.append(node('p', 'workspace-meta', BionicI18n.t('components.workspace.savedMeta', { date: date(item.createdAt), size: BionicI18n.number(item.size) })));
    const actions = node('div', 'workspace-actions');
    const download = node('a', 'file-action', BionicI18n.t('components.workspace.downloadCopy')); download.href = '/api/deliverable/download?' + new URLSearchParams({ projectId, id: item.id }); download.download = item.name || 'livrable.txt'; actions.append(download);
    if (item.origin?.chatId) actions.append(button(BionicI18n.t('components.workspace.openOrigin'), () => visit({ projectId, chatId: item.origin.chatId, messageId: item.origin.messageId })));
    if (item.kind === 'file' && item.origin?.path && item.sourceStatus !== 'missing' && item.sourceStatus !== 'unavailable') {
      const source = node('a', 'file-action', BionicI18n.t('components.workspace.downloadCurrent')); source.href = '/api/file/download?' + new URLSearchParams({ projectId, rootId: item.origin.rootId || 'project', path: item.origin.path }); source.download = item.name; actions.append(source);
    }
    detail.append(actions);
    if (typeof item.text === 'string') {
      detail.append(node('h3', '', BionicI18n.t('components.workspace.copyContent')), node('pre', 'deliverable-text', item.text));
      if (item.textTruncated) detail.append(node('p', 'workspace-meta', BionicI18n.t('components.workspace.partialCopy')));
    } else detail.append(node('p', '', BionicI18n.t('components.workspace.downloadFormat')));
    const form = node('form', 'deliverable-rename'); const inputId = 'deliverable-title'; const label = node('label', '', BionicI18n.t('components.workspace.deliverableTitle')); label.htmlFor = inputId;
    const input = node('input'); input.id = inputId; input.value = item.title; input.maxLength = 120; input.required = true;
    const save = node('button', 'file-action', BionicI18n.t('components.workspace.rename')); save.type = 'submit'; form.append(label, input, save);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (save.disabled) return; if (!input.value.trim()) return input.reportValidity(); save.disabled = true; fail('');
      try { const renamed = await api('/api/deliverable/rename', { method: 'POST', body: JSON.stringify({ projectId, id: item.id, title: input.value.trim() }) }); if (!visible() || data.projectId !== projectId || data.detail?.id !== item.id) return; item.title = renamed.title; heading.textContent = renamed.title; const listed = data.deliverables.find(row => row.id === item.id); if (listed) listed.title = renamed.title; renderDeliverables(); toast(BionicI18n.t('components.workspace.renamed')); }
      catch (e) { fail(e.message); } finally { save.disabled = false; }
    }); detail.append(form);
    const remove = button(BionicI18n.t('components.workspace.remove'), async () => {
      remove.disabled = true; fail('');
      try { await api('/api/deliverable/remove', { method: 'POST', body: JSON.stringify({ projectId, id: item.id }) }); if (!visible() || data.projectId !== projectId || data.detail?.id !== item.id) return; data.deliverables = data.deliverables.filter(row => row.id !== item.id); data.detail = null; detail.hidden = true; renderDeliverables(); toast(BionicI18n.t('components.workspace.removed')); $('workspace-deliverables').focus(); }
      catch (e) { fail(e.message); remove.disabled = false; }
    }); detail.append(node('p', 'workspace-meta', BionicI18n.t('components.workspace.sourceUnaffected')), remove); heading.focus({ preventScroll: true });
  }
  function pinControl(message, chat, action) {
    const kind = action ? 'file' : 'message', projectId = getState().projectId;
    if (!message.id || !chat?.id || !projectId) return null;
    if (action?.projectId && action.projectId !== projectId) return null;
    const key = [projectId, chat.id, message.id, action?.id || 'message'].join('|');
    const pinState = data.pins.get(key) || { busy: false, saved: false, message: '' }; data.pins.set(key, pinState);
    if (data.pins.size > 100) { const oldKey = [...data.pins.keys()].find(id => !data.pins.get(id).busy); if (oldKey && oldKey !== key) data.pins.delete(oldKey); }
    const details = node('details', 'pin-control'); details.dataset.disclosureKey = 'pin:' + key;
    const summary = node('summary', '', action ? BionicI18n.t('components.workspace.saveFile') : BionicI18n.t('components.workspace.saveDeliverable')); summary.dataset.workspaceFocus = 'pin-summary:' + key; details.append(summary);
    const form = node('form', 'pin-form'), label = node('label', '', BionicI18n.t('components.workspace.shelfTitle')), input = node('input');
    const title = action ? (action.path || '').split(/[\\/]/).pop() : (message.text || '').split('\n').find(line => line.trim())?.replace(/^#+\s*/, '') || BionicI18n.t('components.workspace.savedResponse');
    input.value = data.pinTitles.get(key) ?? title.slice(0, 120); input.maxLength = 120; input.required = true; input.dataset.workspaceFocus = key;
    label.append(input); input.addEventListener('input', () => { data.pinTitles.set(key, input.value); if (data.pinTitles.size > 100) data.pinTitles.delete(data.pinTitles.keys().next().value); });
    const save = node('button', 'file-action', pinState.saved ? BionicI18n.t('components.workspace.copySaved') : BionicI18n.t('components.workspace.saveSnapshot')); save.type = 'submit'; save.disabled = pinState.busy || pinState.saved; const status = node('p', 'pin-status', pinState.saved ? BionicI18n.t('components.workspace.copySavedInProject') : pinState.busy ? BionicI18n.t('components.workspace.savingCopy') : pinState.message); status.setAttribute('role', 'status');
    form.append(label, save, status); details.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (pinState.busy || pinState.saved) return; if (!input.value.trim()) return input.reportValidity(); pinState.busy = true; save.disabled = true; pinState.message = status.textContent = BionicI18n.t('components.workspace.savingCopy');
      const epoch = data.epoch;
      try { await api('/api/deliverables', { method: 'POST', body: JSON.stringify({ projectId, chatId: chat.id, messageId: message.id, ...(action ? { actionId: action.id } : {}), title: input.value.trim(), kind }) }); if (epoch !== data.epoch) return; pinState.saved = true; pinState.message = status.textContent = BionicI18n.t('components.workspace.copySavedInProject'); toast(BionicI18n.t('components.workspace.copySavedInProject')); save.textContent = BionicI18n.t('components.workspace.copySaved'); }
      catch (e) { if (epoch === data.epoch) { pinState.message = status.textContent = e.message; save.disabled = false; } }
      finally { pinState.busy = false; }
    }); return details;
  }
  function contextControl(message) {
    const receipt = message.contextReceipt, details = node('details', 'context-receipt'); details.dataset.disclosureKey = 'context';
    const summary = node('summary', '', BionicI18n.t('components.workspace.context')); summary.dataset.workspaceFocus = 'context-summary:' + (message.id || message.localRequestId); details.append(summary);
    if (!receipt || receipt.version !== 1) { details.append(node('p', '', BionicI18n.t('components.workspace.receiptUnavailable'))); return details; }
    details.append(node('p', '', BionicI18n.t('components.workspace.receiptHelp')));
    if(receipt.historical)details.append(node('p','',BionicI18n.t('components.workspace.historicalReceipt')));
    details.append(node('p', '', BionicI18n.t('components.workspace.instructionsAdded')));
    details.append(node('p', '', receipt.initialTransmitted ? BionicI18n.t('components.workspace.transmitted') : BionicI18n.t('components.workspace.notConfirmed')));
    const history = receipt.history || {}, messages = history.messages || [];
    details.append(node('h3', '', receipt.initialTransmitted ? BionicI18n.t('components.workspace.messagesSent') : BionicI18n.t('components.workspace.messagesSelected')), node('p', '', BionicI18n.t('components.workspace.historyCount', { count: history.selectedCount ?? messages.length })));
    if (history.omittedCount) details.append(node('p', '', BionicI18n.t('components.workspace.omittedCount', { count: history.omittedCount })));
    if (history.importedTruncated) details.append(node('p', '', BionicI18n.t('components.workspace.importedPartial')));
    const historyList = node('ul', 'context-history');
    for (const entry of messages) {
      const row = node('li'); row.append(node('p', '', (entry.role === 'assistant' ? BionicI18n.t('components.workspace.assistant') : BionicI18n.t('components.workspace.you')) + ' · ' + (entry.preview || BionicI18n.t('components.workspace.noPreview'))));
      if (entry.id) { const jump = button(BionicI18n.t('components.workspace.viewMessage'), () => jumpTo(entry.id)); row.append(jump); } historyList.append(row);
    }
    if (messages.length) details.append(historyList);
    if (receipt.current?.messageId) details.append(button(BionicI18n.t('components.workspace.viewCurrent'), () => jumpTo(receipt.current.messageId)));
    const attachments = receipt.attachments || []; details.append(node('h3', '', BionicI18n.t('components.workspace.attachments', { count: BionicI18n.number(attachments.length) })));
    if (!attachments.length) details.append(node('p', '', BionicI18n.t('components.workspace.noAttachment')));
    for (const file of attachments) {
      const entry = node('details', 'context-file'); entry.dataset.disclosureKey = 'attachment:' + file.messageId + ':' + file.index;
      entry.append(node('summary', '', (file.name || file.path || BionicI18n.t('components.workspace.attachment')) + ' · ' + (file.transmitted ? file.kind === 'image' ? BionicI18n.t('components.workspace.imageSent') : file.excerpt ? BionicI18n.t('components.workspace.excerptSent') : BionicI18n.t('components.workspace.textSent') : file.reason === 'vision-disabled' ? BionicI18n.t('components.workspace.visionDisabled') : BionicI18n.t('components.workspace.transmissionUnconfirmed'))));
      if (file.path) entry.append(node('p', '', BionicI18n.t('components.workspace.attachmentSource', { path: file.path, folder: file.rootId ? BionicI18n.t('components.workspace.sourceFolder', { name: file.rootId }) : '' })));
      if (file.projectId && file.projectId !== getState().projectId) entry.append(node('p', '', BionicI18n.t('components.workspace.attachmentProject', { name: getState().projects.find(project => project.id === file.projectId)?.name || BionicI18n.t('components.workspace.originUnavailable') })));
      if (file.reason) entry.append(node('p', '', file.reason === 'vision-disabled' ? BionicI18n.t('components.workspace.visionDisabledHelp') : file.reason));
      if (Number.isFinite(file.characters)) entry.append(node('p', '', BionicI18n.t(file.excerpt ? 'components.workspace.excerptCharacters' : 'components.workspace.characters', { count: file.characters })));
      if (file.preview) entry.append(node('pre', '', file.preview));
      if (file.hash) entry.append(node('p', 'context-hash', BionicI18n.t('components.workspace.attachmentHash', { hash: file.hash })));
      if (file.messageId) entry.append(button(BionicI18n.t('components.workspace.viewAttachmentMessage'), () => jumpTo(file.messageId))); details.append(entry);
    }
    const reads = receipt.toolReads || []; details.append(node('h3', '', BionicI18n.t('components.workspace.toolReads', { count: BionicI18n.number(reads.length) })));
    details.append(node('p', '', receipt.toolsEnabled ? BionicI18n.t('components.workspace.toolsEnabled') : BionicI18n.t('components.workspace.toolsDisabled')));
    for (const read of reads) {
      const entry = node('details', 'context-file'); entry.dataset.disclosureKey = 'read:' + read.actionId;
      entry.append(node('summary', '', (read.path || BionicI18n.t('components.workspace.file')) + ' · ' + (read.transmitted ? BionicI18n.t('components.workspace.resultSent') : BionicI18n.t('components.workspace.readUnconfirmed'))));
      if (Number.isFinite(read.start) && Number.isFinite(read.length)) entry.append(node('p', '', BionicI18n.t(Number.isFinite(read.totalCharacters) ? 'components.workspace.characterRangeTotal' : 'components.workspace.characterRange', { start: BionicI18n.number(read.start + 1), end: BionicI18n.number(read.start + read.length), total: BionicI18n.number(read.totalCharacters) })));
      if (typeof read.text === 'string') entry.append(node('pre', '', read.text));
      if (read.truncated) entry.append(node('p', '', BionicI18n.t('components.workspace.partialRead')));
      if (read.hash) entry.append(node('p', 'context-hash', BionicI18n.t('components.workspace.readHash', { hash: read.hash }))); details.append(entry);
    }
    if(receipt.permissions){const permissions=receipt.permissions;const profile=permissions.fileProfile|| (permissions.fileAccess?'write':'none');details.append(node('h3','',BionicI18n.t('components.workspace.permissions')),node('p','', BionicI18n.t('components.workspace.permissionsSummary', { files: ({none:BionicI18n.t('components.workspace.noTools'),read:BionicI18n.t('components.workspace.readOnly'),write:BionicI18n.t('components.workspace.write')}[profile]||BionicI18n.t('components.workspace.unknown')), web: permissions.webAccess?(permissions.webApproval?BionicI18n.t('components.workspace.webApproval'):BionicI18n.t('components.workspace.webQuick')):BionicI18n.t('components.workspace.disabled'), scripts: permissions.scriptAccess?BionicI18n.t('components.workspace.scriptsPermission'):BionicI18n.t('components.workspace.scriptsDisabled') })));}
    if(receipt.external?.length){details.append(node('h3','',BionicI18n.t('components.workspace.external')));for(const output of receipt.external){const entry=node('details','context-file');entry.dataset.disclosureKey='external:'+output.actionId;entry.append(node('summary','',(output.kind==='search'?BionicI18n.t('components.workspace.webSearch'):output.kind==='web'?BionicI18n.t('components.workspace.webPage'):BionicI18n.t('components.workspace.scriptOutput'))+' · '+(output.transmitted?BionicI18n.t('components.workspace.resultSent'):BionicI18n.t('components.workspace.transmissionUnconfirmed'))),node('p','',output.url||output.query||output.title||''),node('pre','',output.text||''));if(output.truncated)entry.append(node('p','',BionicI18n.t('components.workspace.previewLimited')));details.append(entry);}}
    details.querySelectorAll('button,.context-file>summary').forEach((el, index) => el.dataset.workspaceFocus = 'context:' + (message.id || message.localRequestId) + ':' + index);
    return details;
  }
  function jumpTo(id) { const target = [...$('messages').querySelectorAll('.message')].find(el => el.dataset.messageId === id); if (!target) return toast(BionicI18n.t('components.workspace.messageNotDisplayed')); target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); }
  async function refreshActivity() {
    if (!data.active || data.polling || Date.now() - (data.lastPoll || 0) < 4000) return;
    data.polling = true; data.lastPoll = Date.now(); const epoch = data.epoch;
    try { const result = await api('/api/activity'); if (epoch !== data.epoch || !data.active) return; const before = JSON.stringify(data.events);if(visible()&&data.mode==='activity')fail(result.partial?(result.warnings||[]).map(x=>x.message).join(' ')||BionicI18n.t('components.workspace.partialActivity'):''); data.events = result.events || []; updateBadge(); if (visible() && data.mode === 'activity' && before !== JSON.stringify(data.events)) renderActivity(); }
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
  function reset() { ++data.epoch; ++data.sequence; data.active = false; data.events = []; data.deliverables = []; data.images=[];data.imageTotal=0;data.nextCursor=null;data.loadingImages=false;data.category='copies';data.detail = null; data.read = new Map(); data.readKey = ''; data.pinTitles.clear(); data.pins.clear(); $('workspace-view').hidden = true; $('workspace-list').replaceChildren(); $('workspace-detail').replaceChildren(); $('workspace-project').replaceChildren(); $('workspace-status').textContent = ''; fail(''); updateBadge(); }
  $('workspace-close').append(icon('back')); $('workspace-refresh').append(icon('refresh')); $('activity-open-thread').append(icon('activity'));
  $('activity-open-sidebar').addEventListener('click', event => open('activity', event.currentTarget));
  $('activity-open-thread').addEventListener('click', event => open('activity', event.currentTarget));
  $('deliverables-open-sidebar').addEventListener('click', event => open('deliverables', event.currentTarget));
  $('workspace-close').addEventListener('click', close);
  $('workspace-activity').addEventListener('click', () => setMode('activity'));
  $('workspace-deliverables').addEventListener('click', () => setMode('deliverables'));
  $('workspace-copies').addEventListener('click',()=>{data.category='copies';setMode('deliverables');});
  $('workspace-generations').addEventListener('click',()=>{data.category='generations';setMode('deliverables');});
  $('workspace-project').addEventListener('change', () => { data.projectId = $('workspace-project').value; data.detail = null; $('workspace-detail').hidden = true; loadPanel(); });
  $('workspace-refresh').addEventListener('click', () => { data.detail = null; $('workspace-detail').hidden = true; loadPanel(); });
  BionicI18n.onChange(() => {
    updateBadge();
    if (!visible()) return;
    $('workspace-title').textContent = BionicI18n.t(data.mode === 'activity' ? 'components.workspace.activity' : 'components.workspace.deliverables');
    $('workspace-description').textContent = BionicI18n.t(data.mode === 'activity' ? 'components.workspace.activityDescription' : 'components.workspace.deliverablesDescription');
    projectOptions();
    if (data.mode === 'activity') renderActivity();
    else {
      if(data.category==='generations'){renderGenerations();$('workspace-description').textContent=BionicI18n.t('components.beta25.e85bdb2adc');$('workspace-status').textContent=BionicI18n.t('components.beta25.projectCount',{count:data.images.length,total:data.imageTotal});return;}
      renderDeliverables();
      $('workspace-status').textContent = BionicI18n.t('components.workspace.deliverableCount', { count: data.deliverables.length });
      if (data.detail) {
        const input = $('deliverable-title'), draft = input?.value;
        const selection = input ? [input.selectionStart, input.selectionEnd] : null;
        const focused = document.activeElement, hadFocus = $('workspace-detail').contains(focused);
        renderDetail(data.detail, data.projectId);
        if (typeof draft === 'string' && $('deliverable-title')) {
          $('deliverable-title').value = draft;
          if (selection) $('deliverable-title').setSelectionRange(...selection);
          if (focused === input) $('deliverable-title').focus({ preventScroll: true });
        }
        if (!hadFocus && focused?.isConnected) focused.focus({ preventScroll: true });
      }
    }
  });
  return { activate, reset, refreshActivity, contextControl, pinControl };
}
