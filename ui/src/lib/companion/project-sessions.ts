export type SidebarProject = { id: string; name: string; isUnassigned?: boolean };
export type SidebarSession = { id: string; projectId: string; name?: string; updatedAt?: number; generation?: { status?: string }; queue?: unknown[]; [key: string]: unknown };
export type SessionGroup = { sessions: SidebarSession[]; loaded: boolean; busy: boolean; error: string; warnings: string[]; hasMore: boolean; nextCursor: string | null; total: number; pages: number };
export const emptySessionGroup = (): SessionGroup => ({ sessions: [], loaded: false, busy: false, error: '', warnings: [], hasMore: false, nextCursor: null, total: 0, pages: 0 });

/** Each project owns its cursor and read generation. This catalogue never opens a conversation. */
export function createProjectSessions({ read, changed, received, failed }: {
  read: (projectId: string, cursor?: string) => Promise<any>;
  changed: (groups: Record<string, SessionGroup>) => void;
  received?: (projectId: string, sessions: SidebarSession[]) => void;
  failed?: (failure: unknown) => void;
}) {
  let groups: Record<string, SessionGroup> = Object.create(null), projects = new Set<string>(), epoch = 0;
  const sequences = new Map<string, number>(), pending = new Map<string, Promise<void>>();
  const publish = () => changed(Object.assign(Object.create(null), groups));
  const fresh = (id: string) => { sequences.set(id, (sequences.get(id) || 0) + 1); pending.delete(id); };
  function invalidate(ids: string[]) {
    for (const id of new Set(ids)) if (projects.has(id)) { fresh(id); groups[id] = emptySessionGroup(); }
    publish();
  }
  async function load(id: string, { append = false, refresh = false } = {}): Promise<void> {
    if (!projects.has(id)) return;
    if (pending.has(id)) return pending.get(id);
    const previous = groups[id] || emptySessionGroup();
    if (append ? !previous.hasMore : previous.loaded && !refresh) return;
    const sequence = (sequences.get(id) || 0) + 1, currentEpoch = epoch;
    sequences.set(id, sequence);
    const current = () => currentEpoch === epoch && projects.has(id) && sequences.get(id) === sequence;
    groups[id] = { ...previous, busy: true, error: '' }; publish();
    const task = Promise.resolve().then(async () => {
      try {
        // Re-read the visible window on refresh. Retaining old pages blindly would
        // leave moved/deleted conversations in their former group indefinitely.
        const pageCount = append ? 1 : Math.max(1, previous.pages);
        let cursor = append ? previous.nextCursor || undefined : undefined;
        let sessions = append ? [...previous.sessions] : [], warnings: string[] = [];
        let page: any, pages = append ? previous.pages : 0;
        const seenCursors = new Set<string>(cursor ? [cursor] : []);
        for (let index = 0; index < pageCount; index++) {
          page = await read(id, cursor);
          if (!current()) return;
          if (!Array.isArray(page?.sessions) || (page.hasMore === true && (typeof page.nextCursor !== 'string' || !page.nextCursor || seenCursors.has(page.nextCursor)))) throw new Error('La liste reçue est invalide. / Invalid conversation list.');
          const known = new Set(sessions.map(item => item.id));
          for (const item of page.sessions) if (typeof item?.id === 'string' && (!item.projectId || item.projectId === id) && !known.has(item.id)) { sessions.push({ ...item, projectId: id }); known.add(item.id); }
          warnings.push(...(Array.isArray(page.warnings) ? page.warnings.flatMap((warning: any) => typeof warning === 'string' ? [warning] : typeof warning?.message === 'string' ? [warning.message] : []) : []));
          pages++;
          if (!page.hasMore) break;
          cursor = page.nextCursor; seenCursors.add(cursor!);
        }
        if (!current()) return;
        groups[id] = { sessions, loaded: true, busy: false, error: '', warnings: [...new Set(warnings)], hasMore: page.hasMore === true, nextCursor: typeof page.nextCursor === 'string' ? page.nextCursor : null, total: Number.isSafeInteger(page.total) ? page.total : sessions.length, pages };
        publish(); received?.(id, sessions);
      } catch (failure: any) {
        if (!current()) return;
        groups[id] = { ...previous, busy: false, error: failure?.message || 'Lecture indisponible. / Unable to load conversations.' }; publish(); failed?.(failure);
      } finally { if (current()) pending.delete(id); }
    });
    pending.set(id, task); return task;
  }
  return {
    load, invalidate,
    setProjects(next: SidebarProject[]) {
      projects = new Set(next.map(project => project.id));
      for (const id of Object.keys(groups)) if (!projects.has(id)) { fresh(id); delete groups[id]; }
      publish();
    },
    reset() { epoch++; projects.clear(); groups = Object.create(null); pending.clear(); sequences.clear(); publish(); }
  };
}

export function matchingSessions(group: SessionGroup | undefined, search: string): SidebarSession[] {
  const text = search.trim().toLocaleLowerCase();
  return (group?.sessions || []).filter(session => (session.name || '').toLocaleLowerCase().includes(text));
}

export function unassignedSessions(projects: SidebarProject[], groups: Record<string, SessionGroup>, search: string): SidebarSession[] {
  return projects.filter(project => project.isUnassigned).flatMap(project => matchingSessions(groups[project.id], search)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.projectId.localeCompare(b.projectId) || a.id.localeCompare(b.id));
}
