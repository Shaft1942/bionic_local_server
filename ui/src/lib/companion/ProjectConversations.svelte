<script lang="ts">
  import { tick } from 'svelte';
  import { ChevronDown, ChevronRight, Folder, MessageSquare, Plus } from '@lucide/svelte';
  import { matchingSessions, unassignedSessions, type SidebarProject, type SidebarSession, type SessionGroup } from './project-sessions';
  import { tr } from './preferences.svelte';
  let { projects, groups, projectId, chatId = '', expanded, search = '', onExpand, onProject, onConversation, onNewChat, onLoad }: {
    projects: SidebarProject[]; groups: Record<string, SessionGroup>; projectId: string; chatId?: string; expanded: string[]; search?: string;
    onExpand: (id: string, open: boolean) => void; onProject: (id: string) => void; onConversation: (projectId: string, id: string) => void; onNewChat: (id: string) => void; onLoad: (id: string, append: boolean) => void;
  } = $props();
  const assigned = $derived(projects.filter(project => !project.isUnassigned));
  const unassigned = $derived(projects.filter(project => project.isUnassigned));
  const looseSessions = $derived(unassignedSessions(projects, groups, search));
  const looseCount = $derived(search.trim() ? looseSessions.length : unassigned.reduce((total, project) => total + (groups[project.id]?.total || 0), 0));
  const looseTarget = $derived(unassigned.find(project => project.id === 'companion-unassigned') || unassigned[0]);
  let root: HTMLDivElement;
  const childrenId = (id: string) => 'project-conversations-' + encodeURIComponent(id);
  async function projectKey(event: KeyboardEvent, id: string) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); onExpand(id, false); }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!expanded.includes(id)) onExpand(id, true);
      else { await tick(); root.querySelector<HTMLElement>('#' + CSS.escape(childrenId(id)) + ' .session-row')?.focus(); }
    }
  }
</script>

{#snippet sessionRow(session: SidebarSession)}
  <button type="button" class="session-row" class:active={session.projectId === projectId && session.id === chatId} aria-current={session.projectId === projectId && session.id === chatId ? 'page' : undefined} data-project-id={session.projectId} data-session-id={session.id} title={session.name || tr('Conversation', 'Conversation')} onclick={() => onConversation(session.projectId, session.id)}>
    <MessageSquare /><span>{session.name || tr('Conversation', 'Conversation')}</span>
    {#if session.generation?.status === 'running' || session.queue?.length}<span class="running-dot" aria-label={tr('En cours', 'Running')}></span>{/if}
  </button>
{/snippet}

{#snippet groupState(project: SidebarProject)}
  {@const group = groups[project.id]}
  {#if group?.busy && !group.loaded}<p class="group-state" role="status">{tr('Chargement…', 'Loading…')}</p>{/if}
  {#if group?.error}<div class="group-state failure" role="status"><p>{group.error}</p><button type="button" class="group-retry" disabled={group.busy} onclick={() => onLoad(project.id, false)}>{tr('Actualiser la liste', 'Refresh list')}{unassigned.length > 1 && project.isUnassigned ? ' · ' + project.name : ''}</button></div>{/if}
  {#if group?.warnings.length}<p class="group-state" role="status">{tr('Liste partielle : ', 'Partial list: ') + group.warnings.join(' · ')}</p>{/if}
  {#if group?.hasMore}<button type="button" class="group-more" data-project-id={project.id} disabled={group.busy} onclick={() => onLoad(project.id, true)}>{group.busy ? tr('Chargement…', 'Loading…') : tr('Charger d’autres conversations', 'Load more conversations')}{unassigned.length > 1 && project.isUnassigned ? ' · ' + project.name : ''}</button>{/if}
{/snippet}

<div class="sidebar-lists" bind:this={root}>
  {#if search.trim()}<p class="search-scope">{tr('Recherche parmi les conversations chargées. Déplie un projet ou charge la suite pour élargir la recherche.', 'Search covers loaded conversations. Expand a project or load more to search further.')}</p>{/if}
  <nav class="project-list" aria-label={tr('Conversations des projets', 'Project conversations')}>
    {#each assigned as project (project.id)}
      {@const open = expanded.includes(project.id)}
      {@const matches = matchingSessions(groups[project.id], search)}
      <div class="project-group" data-project-id={project.id}>
        <div class="project-row">
          <button type="button" class="project-collapse" aria-label={(open ? tr('Replier le projet ', 'Collapse project ') : tr('Déplier le projet ', 'Expand project ')) + project.name} aria-expanded={open} aria-controls={childrenId(project.id)} onclick={() => onExpand(project.id, !open)} onkeydown={event => projectKey(event, project.id)}>{#if open}<ChevronDown />{:else}<ChevronRight />{/if}</button>
          <button type="button" class="project-select" class:active={project.id === projectId} title={project.name} onclick={() => onProject(project.id)} onkeydown={event => projectKey(event, project.id)}><Folder /><span>{project.name}</span></button>
          <button type="button" class="project-new" aria-label={tr('Nouveau chat dans ', 'New chat in ') + project.name} onclick={() => onNewChat(project.id)}><Plus /></button>
        </div>
        <div id={childrenId(project.id)} class="chat-list project-conversations" hidden={!open}>
          {#if open}
            {#each matches as session (session.projectId + ':' + session.id)}{@render sessionRow(session)}{/each}
            {#if groups[project.id]?.loaded && !matches.length && !groups[project.id]?.error}<p class="group-state">{search.trim() ? tr('Aucun chat trouvé.', 'No chats found.') : tr('Aucune conversation.', 'No conversations yet.')}</p>{/if}
            {@render groupState(project)}
          {/if}
        </div>
      </div>
    {/each}
  </nav>
  <div class="section-label loose-heading"><span>{tr('Conversations', 'Conversations')}</span><div><span class="subtle" data-unassigned-count>{looseCount}</span>{#if looseTarget}<button type="button" class="loose-new" aria-label={tr('Nouveau chat sans projet', 'New chat without a project')} onclick={() => onNewChat(looseTarget.id)}><Plus /></button>{/if}</div></div>
  <nav class="chat-list unassigned-conversations" aria-label={tr('Conversations sans projet', 'Conversations without a project')}>
    {#each looseSessions as session (session.projectId + ':' + session.id)}{@render sessionRow(session)}{/each}
    {#if unassigned.every(project => groups[project.id]?.loaded) && !looseSessions.length}<p class="group-state">{search.trim() ? tr('Aucun chat trouvé.', 'No chats found.') : tr('Tes conversations sans projet apparaîtront ici.', 'Your conversations without a project will appear here.')}</p>{/if}
    {#each unassigned as project (project.id)}{@render groupState(project)}{/each}
  </nav>
</div>

<style>
  .sidebar-lists{display:flex;flex-direction:column;gap:4px;flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border) transparent;}
  .project-list{max-height:none;overflow:visible;flex-shrink:0;}
  .project-conversations{margin:2px 0 7px 19px;padding-left:6px;border-left:1px solid var(--border);}
  .chat-list{flex:initial;overflow:visible;}
  .chat-list[hidden]{display:none;}
  .project-row button{min-height:37px;}
  .project-row .project-collapse{flex:0 0 25px;padding:6px 3px;}
  .project-row .project-new{flex:0 0 32px;padding:8px;}
  .project-row .project-select{flex:1;min-width:0;}
  .project-conversations .session-row{font-size:12px;min-height:34px;padding:8px 7px;gap:7px;}
  .session-row>span:first-of-type{min-width:0;}
  .session-row :global(svg){width:15px;height:15px;flex-shrink:0;}
  .group-state,.search-scope{font-size:11px;line-height:1.55;color:var(--muted-foreground);padding:5px 9px;margin:0;overflow-wrap:anywhere;}
  .group-state p{margin:0 0 5px;}
  .project-list .group-more,.chat-list .group-more,.project-list .group-retry,.chat-list .group-retry{font-size:11px;color:var(--muted-foreground);min-height:32px;padding:6px 9px;white-space:normal;}
  .group-more:disabled,.group-retry:disabled{opacity:.6;cursor:default;}
  .loose-heading{flex-shrink:0;margin-top:14px;}
  .loose-heading>div{display:flex;align-items:center;gap:8px;}
  .loose-new{display:grid;place-items:center;width:26px;height:26px;padding:4px;border:0;border-radius:6px;background:transparent;color:var(--muted-foreground);}
  .loose-new:hover{background:var(--accent);}
  .loose-new :global(svg){width:15px;height:15px;}
  .unassigned-conversations{padding-bottom:4px;}
  @media(pointer:coarse){.project-conversations .session-row{min-height:40px;}.project-row button,.loose-new{min-height:40px;}.loose-new{width:32px;}}
</style>
