import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../public/project-tree.js', import.meta.url), 'utf8');
function fixture(fetchSessions = async () => ({ sessions: [] })) {
  const storage = new Map();
  const document = { activeElement: null };
  class Element {
    constructor(tag, className = '', text = '') { this.tag = tag; this.className = className; this.text = text; this.children = []; this.dataset = {}; this.attributes = {}; this.events = {}; this.parent = null; this.scrollTop = 0; this.classList = { toggle: (name, on) => { const classes = new Set(this.className.split(' ')); if (on) classes.add(name); else classes.delete(name); this.className = [...classes].join(' '); } }; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren(...children) { for (const child of this.children) child.parent = null; this.children = []; this.append(...children); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(name, fn) { this.events[name] = fn; }
    matches(selector) { return selector === '[data-tree-key]' ? this.dataset.treeKey !== undefined : selector.startsWith('.') && this.className.split(' ').includes(selector.slice(1)); }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector); }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    focus() { document.activeElement = this; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  }
  document.createElementNS = (_ns, tag) => new Element(tag);
  const node = (tag, className = '', text = '') => new Element(tag, className, text);
  const context = vm.createContext({ document, sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  vm.runInContext(source, context);
  const view = { authenticated: true, authEpoch: 1, revision: 0, projectId: 'p1', currentId: null, viewKey: 'p1|new', search: '', disabled: false, pending: [], jobs: [] };
  const container = node('nav'), selected = [], counts = [];
  const tree = context.createProjectTree({ container, node, icon: () => node('svg'), getView: () => view, fetchSessions, renderSession: row => { const button = node('button', 'session', row.name); button.dataset.sessionId = row.id; return button; }, onSelectProject: id => selected.push(id), onCount: (...args) => counts.push(args) });
  tree.setProjects([{ id: 'p1', name: 'Premier projet' }, { id: 'p2', name: 'Projet confidentiel' }, { id: 'companion-unassigned', name: 'Sans projet', isUnassigned: true }]);
  tree.setSessions('p1', { sessions: Array.from({ length: 9 }, (_, index) => ({ id: 'a' + index, name: 'Conversation ' + index })) });
  return { tree, view, document, container, storage, selected, counts };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const group = (f, id) => f.container.querySelectorAll('.project-group').find(item => item.dataset.projectId === id);

test('projects expose six actual rows then more, preserve focus, and retain distinct active project and chat', () => {
  const f = fixture(); f.tree.render();
  assert.equal(f.container.querySelectorAll('.project-group').length, 3);
  assert.equal(f.container.querySelectorAll('.session').length, 6);
  assert.equal(group(f, 'p1').querySelector('.project-toggle').attributes['aria-expanded'], 'true');
  assert.equal(group(f, 'p2').querySelector('.project-toggle').attributes['aria-expanded'], 'false');
  group(f, 'p1').querySelector('.project-more').events.click();
  assert.equal(f.container.querySelectorAll('.session').length, 9); assert.equal(f.document.activeElement.dataset.sessionId, 'a6');
  const current = f.container.querySelectorAll('.session')[3]; current.focus(); f.view.currentId = 'a3'; f.tree.render();
  assert.equal(f.document.activeElement.dataset.sessionId, 'a3');
  group(f, 'p2').querySelector('.project-select').events.click(); assert.deepEqual(f.selected, ['p2']);
  const saved = f.storage.get('bm_project_tree'); assert(!saved.includes('confidentiel')); assert(!saved.includes('Conversation'));
});
test('project expansion fetches once lazily without changing selection and keyboard can collapse it', async () => {
  let resolve, calls = 0;
  const f = fixture(async id => { calls++; assert.equal(id, 'p2'); return new Promise(done => { resolve = done; }); });
  f.tree.render(); assert.equal(calls, 0);
  group(f, 'p2').querySelector('.project-toggle').events.click();
  assert.equal(calls, 1); assert.equal(f.view.projectId, 'p1'); assert.match(group(f, 'p2').textContent, /Chargement/);
  f.tree.render(); assert.equal(calls, 1);
  resolve({ sessions: [{ id: 'b1', name: 'Autre conversation' }] }); await tick();
  assert.equal(group(f, 'p2').querySelectorAll('.session').length, 1);
  let prevented = false;
  group(f, 'p2').querySelector('.project-group-heading').events.keydown({ key: 'ArrowLeft', preventDefault() { prevented = true; } });
  assert(prevented); assert.equal(group(f, 'p2').querySelector('.project-toggle').attributes['aria-expanded'], 'false');
  assert.equal(group(f, 'p2').querySelectorAll('.session').length, 0);
});
test('search covers loaded projects, explains its scope and keeps every unopened project available', () => {
  const f = fixture();
  f.tree.setSessions('p2', { sessions: [{ id: 'b', name: 'Conversation spéciale' }] });
  f.view.search = 'spéciale'; f.tree.render();
  assert.equal(f.container.querySelectorAll('.project-group').length, 3);
  assert.equal(f.container.querySelectorAll('.session').length, 1); assert.equal(f.container.querySelector('.session').dataset.sessionId, 'b');
  assert.match(f.container.querySelector('.project-search-scope').textContent, /conversations chargées/);
  assert.equal(group(f, 'companion-unassigned').querySelector('.project-toggle').disabled, false);
  assert.equal(f.counts.at(-1)[0], 1);
});
test('failed lazy loads have an explicit retry and partial warnings stay with their project', async () => {
  let attempts = 0;
  const f = fixture(async () => { if (++attempts === 1) throw new Error('PC indisponible'); return { sessions: [{ id: 'b', name: 'Accessible' }], partial: true, warnings: [{ message: 'Un historique est illisible.' }] }; });
  f.tree.render(); group(f, 'p2').querySelector('.project-toggle').events.click(); await tick();
  assert.match(group(f, 'p2').textContent, /PC indisponible/);
  group(f, 'p2').querySelector('.project-more').events.click(); await tick();
  assert.equal(attempts, 2); assert.equal(group(f, 'p2').querySelectorAll('.session').length, 1);
  assert.match(group(f, 'p2').querySelector('.partial-warning').textContent, /illisible/);
  assert.equal(group(f, 'p1').querySelector('.partial-warning'), undefined);
});
test('a project mutation invalidates a lazy response and releases its loader for the next refresh', async () => {
  let resolve, attempts = 0;
  const f = fixture(async () => { attempts++; return new Promise(done => { resolve = done; }); });
  f.tree.render(); group(f, 'p2').querySelector('.project-toggle').events.click();
  f.view.revision++; resolve({ sessions: [{ id: 'stale', name: 'Ancien emplacement' }] }); await tick();
  f.tree.render(); assert.equal(attempts, 2);
  resolve({ sessions: [{ id: 'fresh', name: 'Emplacement actuel' }] }); await tick();
  assert.equal(group(f, 'p2').querySelector('.session').dataset.sessionId, 'fresh');
  assert(!f.container.textContent.includes('Ancien emplacement'));
});
test('logout clears stored expansion and loaded titles and discards an outstanding project response', async () => {
  let resolve;
  const f = fixture(async () => new Promise(done => { resolve = done; }));
  f.tree.render(); group(f, 'p2').querySelector('.project-toggle').events.click();
  assert(f.storage.has('bm_project_tree'));
  f.view.authenticated = false; f.view.authEpoch++; f.tree.reset();
  resolve({ sessions: [{ id: 'late', name: 'Titre privé tardif' }] }); await tick();
  assert.equal(f.container.textContent, ''); assert.equal(f.container.querySelectorAll('.session').length, 0); assert.equal(f.storage.has('bm_project_tree'), false);
  f.view.authenticated = true; f.tree.setProjects([{ id: 'p2', name: 'Projet' }]); f.tree.render();
  assert(!f.container.textContent.includes('Titre privé tardif'));
});
