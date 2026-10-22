'use strict';

function createProjectTree({ container, node, icon, getView, fetchSessions, renderSession, onSelectProject, onCount }) {
  const storageKey = 'bm_project_tree';
  const cache = new Map(), expanded = new Set(), collapsed = new Set(), pages = new Map();
  let projects = [], signature = '', generation = 0, currentProject = null, previousSearch = '';
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    for (const id of saved?.expanded || []) if (typeof id === 'string' && id.length <= 128) expanded.add(id);
    for (const id of saved?.collapsed || []) if (typeof id === 'string' && id.length <= 128) collapsed.add(id);
  } catch {}
  function remember() {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ expanded: [...expanded].slice(0, 2000), collapsed: [...collapsed].slice(0, 2000) })); } catch {}
  }
  function entry(id) {
    if (!cache.has(id)) cache.set(id, { sessions: [], loaded: false, loading: false, error: '', partial: false, warnings: [], seq: 0 });
    return cache.get(id);
  }
  function setSessions(id, result) {
    const item = entry(id);
    Object.assign(item, { sessions: result.sessions || [], loaded: true, loading: false, error: '', partial: !!result.partial, warnings: result.warnings || [] });
  }
  function rows(project, view) {
    return [...(view.pending || []).filter(row => row.projectId === project.id), ...entry(project.id).sessions];
  }
  function matching(project, view) {
    const search = view.search.trim().toLocaleLowerCase('fr');
    return rows(project, view).filter(row => String(row.name || '').toLocaleLowerCase('fr').includes(search));
  }
  async function ensure(id, retry = false) {
    const view = getView(), item = entry(id);
    if (!view.authenticated || item.loading || (item.loaded && !retry) || (item.error && !retry)) return;
    const seq = ++item.seq, epoch = view.authEpoch, revision = view.revision, token = generation;
    item.loading = true; item.error = ''; signature = ''; render();
    try {
      const result = await fetchSessions(id), after = getView();
      if (generation !== token || seq !== item.seq || !after.authenticated || epoch !== after.authEpoch || revision !== after.revision || !projects.some(project => project.id === id)) {
        if (generation === token && seq === item.seq) { item.loading = false; signature = ''; }
        return;
      }
      setSessions(id, result);
      // The current project is loaded by the existing navigation sequence.
      // Lazy expansion never changes its selected conversation or draft.
    } catch (error) {
      if (generation !== token || !getView().authenticated || epoch !== getView().authEpoch) return;
      item.loading = false; item.error = error.message || 'Impossible de charger ce projet.'; signature = '';
    }
    if (generation === token) render();
  }
  function setProjects(next) {
    projects = next.slice(); generation++; signature = '';
    const ids = new Set(projects.map(project => project.id));
    for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    for (const id of expanded) if (!ids.has(id)) expanded.delete(id);
    for (const id of collapsed) if (!ids.has(id)) collapsed.delete(id);
    // Explicit refresh and project management refresh the already opened groups.
    for (const [id, item] of cache) if (id !== getView().projectId) { item.loaded = false; item.loading = false; item.error = ''; item.seq++; }
    remember();
  }
  function activate(id) {
    if (!id) return;
    expanded.add(id); collapsed.delete(id); remember(); signature = '';
  }
  function setLoading(id) {
    const item = entry(id); item.seq++; item.loading = true; item.error = ''; signature = ''; render();
  }
  function setError(id, message) {
    const item = entry(id); item.loading = false; item.error = message; signature = ''; render();
  }
  function focusKey(element) { return element?.closest('[data-tree-key]')?.dataset.treeKey; }
  function render() {
    const view = getView();
    if (!view.authenticated) return;
    if (currentProject !== view.projectId) {
      currentProject = view.projectId;
      if (!collapsed.has(currentProject)) expanded.add(currentProject);
    }
    const search = view.search.trim().toLocaleLowerCase('fr');
    if (search !== previousSearch) {
      pages.clear();
      if (search) for (const project of projects) if (entry(project.id).loaded && matching(project, view).length) expanded.add(project.id);
      previousSearch = search;
    }
    const model = projects.map(project => ({ project, item: entry(project.id), matches: matching(project, view), open: expanded.has(project.id) }));
    const nextSignature = JSON.stringify({ search, active: view.projectId, current: view.currentId, draft: view.viewKey, disabled: view.disabled, groups: model.map(({ project, item, matches, open }) => [project.id, project.name, project.isUnassigned, open, pages.get(project.id) || 6, item.loading, item.loaded, item.error, item.partial, item.warnings, matches.map(row => [row.id, row.name, row.updatedAt, row.source, row.origin, row.generation, row.queueCount])]), jobs: view.jobs });
    if (signature === nextSignature) return;
    signature = nextSignature;
    const focus = focusKey(document.activeElement), scroll = container.scrollTop;
    container.replaceChildren();
    if (search) container.append(node('p', 'project-search-scope', 'Recherche dans les conversations chargées. Déplie les autres projets pour y chercher.'));
    if (!projects.length) container.append(node('p', 'list-empty', 'Aucun projet Bionic trouvé. Crée un projet dans Bionic puis actualise.'));
    let count = 0, unloaded = 0;
    for (const { project, item, matches, open } of model) {
      count += matches.length; if (!item.loaded) unloaded++;
      const section = node('section', 'project-group'); section.dataset.projectId = project.id;
      section.classList.toggle('project-current', project.id === view.projectId);
      const heading = node('div', 'project-group-heading');
      const toggle = node('button', 'project-toggle'); toggle.type = 'button'; toggle.dataset.treeKey = 'toggle:' + project.id;
      toggle.disabled = view.disabled; toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', (open ? 'Replier' : 'Déplier') + ' les conversations de ' + project.name);
      const childrenId = 'project-chats-' + projects.indexOf(project); toggle.setAttribute('aria-controls', childrenId);
      const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); chevron.setAttribute('viewBox', '0 0 24 24'); chevron.setAttribute('aria-hidden', 'true');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path'); line.setAttribute('d', 'm9 5 7 7-7 7'); chevron.append(line); toggle.append(chevron);
      const select = node('button', 'project-select'); select.type = 'button'; select.dataset.treeKey = 'project:' + project.id;
      select.disabled = view.disabled; select.setAttribute('aria-current', String(project.id === view.projectId)); select.setAttribute('aria-label', 'Ouvrir le projet ' + project.name);
      select.append(icon('folder'), node('span', 'project-name', project.name));
      if (item.loaded) select.append(node('span', 'project-conversation-count', String(search ? matches.length : rows(project, view).length)));
      select.addEventListener('click', () => { activate(project.id); onSelectProject(project.id); });
      const changeExpansion = (next = !open) => {
        if (view.disabled) return;
        if (next) { expanded.add(project.id); collapsed.delete(project.id); } else { expanded.delete(project.id); collapsed.add(project.id); }
        remember(); signature = ''; render(); if (next) ensure(project.id);
      };
      toggle.addEventListener('click', () => changeExpansion());
      heading.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight') { event.preventDefault(); if (!open) changeExpansion(true); else section.querySelector('.session')?.focus(); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); if (open) changeExpansion(false); else toggle.focus(); }
      });
      heading.append(toggle, select); section.append(heading);
      const children = node('div', 'project-conversations'); children.id = childrenId; children.hidden = !open;
      if (open) {
        if (item.partial) children.append(node('p', 'partial-warning', item.warnings.map(warning => warning.message).join(' ') || 'Inventaire partiel : certaines conversations sont illisibles. Les autres restent accessibles.'));
        if (item.loading && !item.loaded) children.append(node('p', 'project-group-state', 'Chargement des conversations…'));
        else if (item.error) {
          children.append(node('p', 'project-group-state error', item.error));
          const retry = node('button', 'project-more', 'Réessayer'); retry.type = 'button'; retry.dataset.treeKey = 'retry:' + project.id;
          retry.disabled = view.disabled; retry.addEventListener('click', () => ensure(project.id, true)); children.append(retry);
        }
        else if (item.loaded && !matches.length) children.append(node('p', 'project-group-state', search ? 'Aucune conversation correspondante.' : 'Aucune conversation. Commence un nouveau chat dans ce projet.'));
        const limit = pages.get(project.id) || 6, visible = matches.slice(0, limit);
        // A selected chat remains visible when it is older than the first page.
        const current = matches.find(row => project.id === view.projectId && row.id === view.currentId);
        if (current && !visible.includes(current)) visible.push(current);
        for (const row of visible) {
          const button = renderSession(row, project.id); button.disabled = view.disabled; button.dataset.treeKey = 'session:' + project.id + ':' + row.id; button.dataset.projectId = project.id;
          children.append(button);
        }
        if (matches.length > visible.length) {
          const more = node('button', 'project-more', 'Afficher plus (' + (matches.length - visible.length) + ')'); more.type = 'button'; more.dataset.treeKey = 'more:' + project.id; more.disabled = view.disabled;
          more.addEventListener('click', () => {
            pages.set(project.id, limit + 6); signature = ''; render();
            const nextMore = [...container.querySelectorAll('[data-tree-key]')].find(element => element.dataset.treeKey === 'more:' + project.id);
            if (!nextMore) [...container.querySelectorAll('.project-group')].find(element => element.dataset.projectId === project.id)?.querySelectorAll('.session')[limit]?.focus({ preventScroll: true });
          }); children.append(more);
        }
      }
      section.append(children);
      container.append(section);
    }
    onCount?.(count, unloaded, !!search);
    container.scrollTop = scroll;
    if (focus) [...container.querySelectorAll('[data-tree-key]')].find(element => element.dataset.treeKey === focus)?.focus({ preventScroll: true });
    for (const { project, open, item } of model) if (open && !item.loaded && !item.loading && !item.error) ensure(project.id);
  }
  function reset() {
    generation++; cache.clear(); expanded.clear(); collapsed.clear(); pages.clear(); projects = []; currentProject = null; previousSearch = ''; signature = '';
    container.replaceChildren(); onCount?.(0, 0, false);
    try { sessionStorage.removeItem(storageKey); } catch {}
  }
  return { setProjects, setSessions, setLoading, setError, activate, render, reset };
}
