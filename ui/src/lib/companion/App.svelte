<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ArrowUp, Plus, Search, Folder, MessageSquare, PanelLeftClose, PanelLeftOpen, Files, Image, Sun, Moon, Square, RefreshCw, Unplug, X, LogOut } from '@lucide/svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import Logo from '$lib/components/app/misc/Logo.svelte';
  import UserBubble from './UserBubble.svelte';
  import Markdown from './Markdown.svelte';
  import FilesPanel from './FilesPanel.svelte';
  import ImagesPanel from './ImagesPanel.svelte';
  import { ApiError, newRequestId, post, query, request, sendStream, terminal } from './api';

  type Pending = { requestId: string; projectId: string; id?: string; status: string; phase?: string };
  let authenticated = $state(false), ready = $state(false), error = $state(''), notice = $state('');
  let code = $state(''), loginBusy = $state(false);
  let projects = $state<any[]>([]), sessions = $state<any[]>([]), models = $state<any[]>([]);
  let projectId = $state(''), chat = $state<any>(null), model = $state(''), reasoning = $state('default');
  let prompt = $state(''), attachments = $state<any[]>([]), fileProfile = $state('read');
  let pending = $state<Pending | null>(null), streaming = $state(false), disconnected = $state(false);
  let tab = $state<'chat' | 'files' | 'images'>('chat'), sidebarOpen = $state(true), search = $state('');
  let projectForm = $state(false), projectName = $state(''), creatingProject = $state(false);
  let instanceId = $state(''), prototypeInfo = $state<any>(null);
  let dark = $state(false), draftKey = '', storageKey = '', drafts: Record<string,string> = {};
  let controller: AbortController | null = null, recoveryBusy = false, viewSequence = 0;
  let messageList = $state<HTMLDivElement>(), composer = $state<HTMLTextAreaElement | null>(null);
  let followReply = true;
  const currentProject = $derived(projects.find(item => item.id === projectId));
  const selectedModel = $derived(models.find(item => item.id === model));
  const visibleSessions = $derived(sessions.filter(item => (item.name || '').toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const currentPending = $derived(pending?.projectId === projectId && (!pending.id || pending.id === chat?.id));
  const statusLabel = $derived(disconnected ? 'Connexion perdue · suivi sur le serveur' : pending?.status === 'queued' ? 'Dans la file d’attente' : pending?.status === 'starting' ? 'Préparation sur le serveur' : pending ? 'Réponse en cours' : notice);

  function storage() {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({ projectId, chatId: chat?.id || '', drafts, pending, dark }));
  }
  function saveDraft() { if (draftKey) drafts[draftKey] = prompt; storage(); }
  function switchDraft() {
    draftKey = projectId + ':' + (chat?.id || 'new');
    prompt = drafts[draftKey] || ''; attachments = [];
  }
  function report(failure: any) {
    error = failure?.message || 'Le compagnon est indisponible.';
    if (failure?.status === 401) { authenticated = false; chat = null; projects = []; sessions = []; }
  }
  async function scrollReply() {
    await tick(); if (followReply && messageList) messageList.scrollTop = messageList.scrollHeight;
  }
  async function refreshSessions() {
    if (!projectId) return;
    const target = projectId, result = await request(query('/api/sessions', { projectId: target }));
    if (target === projectId) sessions = result.sessions || [];
  }
  async function loadConversation(pid: string, id: string, sequence = viewSequence) {
    const result = await request(query('/api/conversation', { projectId: pid, id }));
    if (projectId === pid && sequence === viewSequence && (!chat?.id || chat.id === id)) {
      chat = result;
      if (result.model && models.some(item => item.id === result.model)) model = result.model;
      storage(); await scrollReply();
    }
    return result;
  }
  async function openSession(id: string) {
    saveDraft(); const sequence = ++viewSequence;
    chat = { id, messages: [] }; error = ''; notice = ''; tab = 'chat'; followReply = true;
    switchDraft(); if (innerWidth < 760) sidebarOpen = false;
    try {
      const loaded = await loadConversation(projectId, id, sequence);
      if (sequence !== viewSequence) return;
      const active = loaded.generation;
      if (!pending && active?.requestId && !terminal(active.status)) {
        pending = { requestId: active.requestId, projectId, id, status: active.status }; storage();
      }
      await recover();
    } catch (failure) { report(failure); }
  }
  async function chooseProject(id: string) {
    saveDraft(); ++viewSequence; projectId = id; chat = null; sessions = []; error = ''; notice = ''; tab = 'chat';
    fileProfile = projects.find(item => item.id === id)?.isUnassigned ? 'none' : 'read'; switchDraft(); storage();
    try { await refreshSessions(); } catch (failure) { report(failure); }
  }
  async function newChat() {
    saveDraft(); ++viewSequence; chat = null; tab = 'chat'; notice = ''; error = ''; switchDraft(); storage();
    if (innerWidth < 760) sidebarOpen = false;
    await tick(); composer?.focus();
  }
  async function createProject(event: SubmitEvent) {
    event.preventDefault(); if (!projectName.trim() || creatingProject) return;
    creatingProject = true;
    try {
      const result = await post('/api/local-projects', { name: projectName.trim() });
      projects = [...projects, result.project]; projectForm = false; projectName = '';
      await chooseProject(result.project.id);
    } catch (failure) { report(failure); } finally { creatingProject = false; }
  }
  async function start() {
    const ping = await request('/api/ping');
    instanceId = ping.instanceId; prototypeInfo = ping.prototypeInfo || null;
    storageKey = 'bionic:llama-prototype:' + ping.instanceId;
    let saved: any = {};
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { notice = 'La restauration locale est indisponible.'; }
    drafts = saved.drafts && typeof saved.drafts === 'object' ? saved.drafts : {};
    pending = saved.pending?.requestId && saved.pending?.projectId ? saved.pending : null;
    dark = typeof saved.dark === 'boolean' ? saved.dark : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
    const result = await request('/api/projects'); projects = result.projects || []; authenticated = true;
    try {
      const catalogue = await request('/api/models'); models = catalogue.models || [];
      model = models.find(item => /qwen.*9b|gemma.*e4b/i.test(item.name + item.id))?.id || models.find(item => item.loaded)?.id || models[0]?.id || '';
    } catch (failure) { report(failure); }
    projectId = projects.some(item => item.id === saved.projectId) ? saved.projectId : projects[0]?.id || '';
    fileProfile = currentProject?.isUnassigned ? 'none' : 'read';
    if (projectId) {
      await refreshSessions();
      if (saved.chatId) { chat = { id: saved.chatId, messages: [] }; try { await loadConversation(projectId, saved.chatId); } catch (failure) { chat = null; report(failure); } }
      switchDraft(); await recover();
    }
    ready = true;
  }
  async function login(event: SubmitEvent) {
    event.preventDefault(); if (loginBusy) return; loginBusy = true; error = '';
    try { await post('/api/login', { code }); code = ''; await start(); }
    catch (failure) { report(failure); } finally { ready = true; loginBusy = false; }
  }
  async function logout() {
    try { saveDraft(); await post('/api/logout', {}); controller?.abort(); authenticated = false; chat = null; projects = []; sessions = []; }
    catch (failure) { report(failure); }
  }
  function attach(file: any) {
    if (attachments.length >= 4) { error = 'Tu peux joindre jusqu’à quatre fichiers.'; return; }
    if (!attachments.some(item => item.rootId === file.rootId && item.path === file.path)) attachments = [...attachments, file];
    tab = 'chat'; notice = 'Fichier joint au prochain message.';
  }
  function onStream(event: any, text: string, requestId: string) {
    if (!pending || pending.requestId !== requestId) return;
    if (event.type === 'start' || event.type === 'queued') {
      pending = { ...pending, id: event.id, status: event.type === 'queued' ? 'queued' : 'running', phase: event.phase };
      if (projectId === pending.projectId && (!chat?.id || chat.id === event.id)) {
        chat = { ...(chat || {}), id: event.id, name: event.name || text.slice(0, 70), messages: chat?.messages || [] };
        if (event.type === 'start' && !chat.messages.some((item: any) => item.requestId === requestId)) {
          chat.messages.push({ id: requestId + ':user', role: 'user', text, requestId });
          chat.messages.push({ id: event.replyId, role: 'assistant', text: '', requestId, actions: [] });
        }
        drafts[draftKey] = ''; prompt = ''; draftKey = projectId + ':' + event.id; drafts[draftKey] = ''; attachments = [];
      }
      storage(); void refreshSessions();
    }
    if (event.type === 'delta' && chat?.id === pending.id) {
      const reply = chat.messages.find((item: any) => item.role === 'assistant' && item.requestId === requestId);
      if (reply) reply.text += event.text || '';
    }
    if (event.type === 'action' && chat?.id === pending.id) {
      const reply = chat.messages.find((item: any) => item.role === 'assistant' && item.requestId === requestId);
      if (reply) reply.actions = [...(reply.actions || []), event.action];
    }
    if (event.type === 'error') error = event.message;
    if (event.type === 'capability' && event.message) notice = event.message;
    void scrollReply();
  }
  async function send(event?: Event) {
    event?.preventDefault(); if (!prompt.trim() || !model || !projectId || pending) return;
    error = ''; notice = ''; disconnected = false; followReply = true;
    const text = prompt.trim(), requestId = newRequestId();
    const job: Pending = { requestId, projectId, ...(chat?.id ? { id: chat.id } : {}), status: 'starting' };
    const payload = {
      requestId, projectId, sessionId: chat?.id || null, model, reasoning,
      fileAccess: fileProfile !== 'none', fileProfile, webAccess: false, scriptAccess: false, imageAccess: false,
      text, attachments: attachments.map(({ name, ...reference }) => reference)
    };
    pending = job;
    // Persist the identity before POST. A storage failure must not create an untrackable request.
    try { saveDraft(); } catch { pending = null; error = 'Le navigateur ne peut pas enregistrer le suivi. Autorise le stockage local avant l’envoi.'; return; }
    streaming = true; controller = new AbortController();
    try { await sendStream(payload, controller.signal, event => onStream(event, text, requestId)); }
    catch (failure: any) {
      const rejected = failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && ![408, 409].includes(failure.status);
      if (rejected) { pending = null; storage(); disconnected = false; }
      else disconnected = true;
      error = failure instanceof ApiError ? failure.message : 'Le flux est interrompu. Le serveur continue ; vérification de la demande.';
      if (failure?.status === 401) report(failure);
    } finally { controller = null; streaming = false; if (authenticated) await recover(); }
  }
  async function recover() {
    if (!authenticated || !pending || recoveryBusy || streaming) return;
    recoveryBusy = true;
    const target = { ...pending }, sequence = viewSequence;
    try {
      const result = await request(query('/api/chat-request', { projectId: target.projectId, requestId: target.requestId }));
      if (pending?.requestId !== target.requestId) return;
      pending = { ...pending, id: result.id || pending.id, status: result.status, phase: result.phase };
      if (result.id && projectId === target.projectId && (!chat?.id || chat.id === result.id)) await loadConversation(target.projectId, result.id, sequence);
      storage();
      if (terminal(result.status)) {
        notice = result.status === 'completed' ? 'Réponse retrouvée sur le serveur.' : result.message || 'La demande est terminée.';
        pending = null; disconnected = false; storage(); await refreshSessions();
      } else disconnected = false;
    } catch (failure: any) {
      disconnected = true;
      if (failure?.status === 404) error = 'Envoi non retrouvé sur le serveur. Aucun message n’a été renvoyé. Réessaie la vérification avant de poursuivre.';
      else report(failure);
    } finally { recoveryBusy = false; }
  }
  async function stop() {
    if (!pending?.id) return;
    try { await post('/api/cancel', { projectId: pending.projectId, id: pending.id, requestId: pending.requestId }); notice = 'Arrêt demandé au serveur.'; await recover(); }
    catch (failure) { report(failure); }
  }
  function detach() { disconnected = true; controller?.abort(); }
  async function visitPending() {
    if (!pending) return;
    if (projectId !== pending.projectId) await chooseProject(pending.projectId);
    if (pending?.id) await openSession(pending.id); else await recover();
  }
  function theme() { dark = !dark; document.documentElement.classList.toggle('dark', dark); storage(); }
  function changeTab(next: 'chat' | 'files' | 'images') {
    tab = next;
    if (next === 'chat') void refreshSessions().catch(report);
  }
  onMount(() => {
    sidebarOpen = innerWidth >= 760;
    start().catch(failure => { if (failure.status !== 401) report(failure); ready = true; });
    const timer = setInterval(() => { if (!document.hidden) void recover(); }, 1800);
    const resume = () => { if (!document.hidden) void recover(); };
    addEventListener('online', resume); addEventListener('pageshow', resume); document.addEventListener('visibilitychange', resume);
    addEventListener('pagehide', saveDraft);
    return () => { clearInterval(timer); removeEventListener('online', resume); removeEventListener('pageshow', resume); removeEventListener('pagehide', saveDraft); document.removeEventListener('visibilitychange', resume); controller?.abort(); };
  });
</script>

{#if !authenticated}
  <main class="login-page">
    <div class="login-card">
      <Logo class="welcome-logo" />
      <h1>Bionic Compagnon</h1>
      <p>Ton espace local, avec l’interface llama-ui.</p>
      {#if ready}
        <form onsubmit={login}>
          <label for="access-code">Code d’accès du prototype</label>
          <input id="access-code" type="password" bind:value={code} required autocomplete="current-password" />
          <Button type="submit" disabled={loginBusy}>{loginBusy ? 'Connexion…' : 'Se connecter'}</Button>
        </form>
      {:else}<p role="status">Connexion au compagnon…</p>{/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <small>Prototype 2.6.0-beta.1</small>
    </div>
  </main>
{:else}
  <div class="companion-shell" class:sidebar-hidden={!sidebarOpen}>
    {#if sidebarOpen}
      <aside class="navigation" aria-label="Navigation">
        <div class="brand-row"><a href="/prototype/" class="brand"><Logo class="brand-logo" /><span>Bionic <span class="subtle">llama-ui</span></span></a><Button variant="ghost" size="icon" aria-label="Fermer la navigation" onclick={() => sidebarOpen = false}><PanelLeftClose /></Button></div>
        <Button variant="outline" class="new-chat" onclick={newChat}><Plus /> Nouveau chat</Button>
        <label class="search-field"><Search /><input aria-label="Rechercher un chat" bind:value={search} placeholder="Rechercher un chat" /></label>
        <div class="section-label"><span>Projets</span><Button variant="ghost" size="icon" aria-label="Créer un projet" onclick={() => projectForm = !projectForm}><Plus /></Button></div>
        {#if projectForm}<form class="project-form" onsubmit={createProject}><input aria-label="Nom du projet" bind:value={projectName} placeholder="Nom du projet" maxlength="120" required /><Button type="submit" size="sm" disabled={creatingProject}>Créer</Button></form>{/if}
        <div class="project-list">
          {#each projects as project (project.id)}<button class:active={project.id === projectId} onclick={() => chooseProject(project.id)}><Folder /><span>{project.name}</span></button>{/each}
        </div>
        <div class="section-label"><span>Conversations</span><span class="subtle">{sessions.length}</span></div>
        <nav class="chat-list" aria-label="Conversations">
          {#each visibleSessions as session (session.id)}<button class:active={session.id === chat?.id} onclick={() => openSession(session.id)}><MessageSquare /><span>{session.name || 'Conversation'}</span>{#if session.generation?.status === 'running'}<span class="running-dot" aria-label="En cours"></span>{/if}</button>{/each}
          {#if !visibleSessions.length}<p class="quiet">{search ? 'Aucun chat trouvé.' : 'Tes conversations apparaîtront ici.'}</p>{/if}
        </nav>
        <div class="navigation-footer"><span class="version">2.6.0-beta.1 · prototype isolé</span><a class="legacy-link" href="/legacy/">Interface complète et paramètres</a><div><Button variant="ghost" size="icon" aria-label={dark ? 'Thème clair' : 'Thème sombre'} onclick={theme}>{#if dark}<Sun />{:else}<Moon />{/if}</Button><Button variant="ghost" size="icon" aria-label="Se déconnecter" onclick={logout}><LogOut /></Button></div></div>
      </aside>
    {/if}
    <main class="workspace">
      <header class="workspace-header">
        <div class="workspace-title">{#if !sidebarOpen}<Button variant="ghost" size="icon" aria-label="Ouvrir la navigation" onclick={() => sidebarOpen = true}><PanelLeftOpen /></Button>{/if}<span>{chat?.name || currentProject?.name || 'Nouveau chat'}</span></div>
        <nav class="workspace-tabs" aria-label="Espace du projet"><button aria-label="Chat" class:active={tab === 'chat'} onclick={() => changeTab('chat')}><MessageSquare /><span>Chat</span></button><button aria-label="Fichiers" class:active={tab === 'files'} onclick={() => changeTab('files')}><Files /><span>Fichiers</span></button><button aria-label="Images" class:active={tab === 'images'} onclick={() => changeTab('images')}><Image /><span>Images</span></button></nav>
      </header>
      {#if prototypeInfo?.syntheticComfyUI || prototypeInfo?.syntheticProjects}<div class="global-notice status fixture-notice">Démonstration isolée · {prototypeInfo.realInference ? 'modèle réel' : 'modèle simulé'} · {prototypeInfo.syntheticComfyUI ? 'ComfyUI simulé' : 'ComfyUI réel'} · projets de test</div>{/if}
      {#if error}<div class="global-notice error" role="alert"><span>{error}</span><button aria-label="Masquer l’erreur" onclick={() => error = ''}><X /></button></div>{/if}
      {#if pending || notice}<div class="global-notice status" role="status"><span>{statusLabel}</span><div>{#if pending}<Button variant="ghost" size="sm" onclick={recover}><RefreshCw /> Vérifier</Button>{#if !currentPending}<Button variant="ghost" size="sm" onclick={visitPending}>Voir la demande</Button>{/if}{/if}</div></div>{/if}
      {#if tab === 'files'}
        {#key projectId}<FilesPanel {projectId} {request} {instanceId} chatId={chat?.id} onAttach={attach} />{/key}
      {:else if tab === 'images'}
        {#key projectId}<ImagesPanel {projectId} {request} {instanceId} syntheticComfyUI={prototypeInfo?.syntheticComfyUI === true} chatId={chat?.id} />{/key}
      {:else}
        <div class="conversation" class:empty={!chat?.messages?.length}>
          <div class="messages" bind:this={messageList} onscroll={event => { const element = event.currentTarget; followReply = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}>
            {#if !chat?.messages?.length}
              <div class="welcome"><Logo class="welcome-logo" /><h1>Qu’est-ce qu’on fait aujourd’hui ?</h1><p>Un projet, ses fichiers, tes idées en images.</p><div class="welcome-actions"><Button variant="outline" onclick={() => tab = 'files'}><Files /> Explorer les fichiers</Button><Button variant="outline" onclick={() => tab = 'images'}><Image /> Créer une image</Button></div></div>
            {:else}
              <div class="message-column">
                {#each chat.messages as message, index (message.id || index)}
                  <article class="chat-message" class:user={message.role === 'user'} aria-label={message.role === 'user' ? 'Votre message' : 'Réponse du modèle'}>
                    {#if message.role === 'user'}<UserBubble content={message.text || ''} />{:else}<div class="assistant-name"><Logo class="message-logo" /><span>{message.model || chat.model || 'Assistant'}</span></div><Markdown content={message.text || ''} />{/if}
                    {#if message.attachments?.length}<div class="message-attachment-list">{#each message.attachments as file}<span><Files /> {file.name || file.path}</span>{/each}</div>{/if}
                    {#each message.actions || [] as action}<details class="action-receipt"><summary>{action.ok === false ? 'Action refusée' : 'Action effectuée'} · {action.tool || action.name || action.path || 'Outil'}</summary><pre>{JSON.stringify(action, null, 2)}</pre></details>{/each}
                    {#if message.contextReceipt}<details class="action-receipt"><summary>Contexte et permissions</summary><pre>{JSON.stringify(message.contextReceipt, null, 2)}</pre></details>{/if}
                    {#each message.imageGenerations || [] as image}<button class="image-job-link" onclick={() => tab = 'images'}>Image · {image.status || 'Suivi disponible'} · Ouvrir la galerie</button>{/each}
                    {#if message.interrupted}<p class="quiet">{message.error || 'Réponse interrompue.'}</p>{/if}
                  </article>
                {/each}
              </div>
            {/if}
          </div>
          <div class="composer-region">
            <form class="composer" onsubmit={send}>
              {#if attachments.length}<div class="attachment-chips">{#each attachments as file,index}<span><Files />{file.name || file.path}<button type="button" aria-label={'Retirer ' + (file.name || file.path)} onclick={() => attachments = attachments.filter((_, at) => at !== index)}><X /></button></span>{/each}</div>{/if}
              <Textarea id="prompt" bind:ref={composer} bind:value={prompt} oninput={saveDraft} placeholder="Écris ton message…" aria-label="Message" maxlength={16000} onkeydown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); } }} />
              <div class="composer-toolbar"><div class="composer-controls"><Button variant="ghost" size="icon" aria-label="Joindre un fichier" onclick={() => tab = 'files'}><Plus /></Button><select aria-label="Modèle" bind:value={model} onchange={() => reasoning = 'default'} disabled={!!pending}>{#each models as item}<option value={item.id}>{item.name || item.id}{item.loaded ? ' · chargé' : ''}</option>{/each}{#if !models.length}<option value="">Aucun modèle disponible</option>{/if}</select>{#if selectedModel?.reasoning?.allowedOptions?.length}<select aria-label="Raisonnement" bind:value={reasoning}><option value="default">Raisonnement par défaut</option>{#each selectedModel.reasoning.allowedOptions as option}<option value={option}>{option}</option>{/each}</select>{/if}<select aria-label="Droits sur les fichiers" bind:value={fileProfile} disabled={currentProject?.isUnassigned}><option value="none">Fichiers désactivés</option><option value="read">Lecture des fichiers</option><option value="write">Lecture et écriture</option></select></div><div class="send-controls">{#if pending}{#if streaming}<Button variant="ghost" size="icon" aria-label="Déconnecter le flux sans arrêter la demande" onclick={detach}><Unplug /></Button>{/if}<Button variant="outline" size="icon" aria-label="Arrêter la demande" disabled={!pending.id} onclick={stop}><Square /></Button>{:else}<Button type="submit" size="icon" class="send-button" aria-label="Envoyer" disabled={!prompt.trim() || !model || !projectId}><ArrowUp /></Button>{/if}</div></div>
            </form>
            <p class="composer-hint">{pending ? 'Tu peux fermer cette page. La demande reste suivie sur le serveur.' : 'Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne'}</p>
          </div>
        </div>
      {/if}
    </main>
  </div>
{/if}
