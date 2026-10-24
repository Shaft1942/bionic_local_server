import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectSessions, matchingSessions, unassignedSessions } from '../ui/src/lib/companion/project-sessions.ts';

const projects = [{ id: 'a', name: 'Projet A' }, { id: 'b', name: 'Projet B' }, { id: 'native-default', name: 'Sans projet · Bionic', isUnassigned: true }, { id: 'companion-unassigned', name: 'Sans projet', isUnassigned: true }];
const deferred = () => { let resolve; const promise = new Promise(done => resolve = done); return { promise, resolve }; };
const page = (sessions, extra = {}) => ({ sessions, total: sessions.length, hasMore: false, nextCursor: null, ...extra });
function fixture(read) {
  let groups = {}, received = [], failures = [];
  const catalogue = createProjectSessions({ read, changed: next => groups = next, received: (id, rows) => received.push({ id, rows }), failed: failure => failures.push(failure) });
  catalogue.setProjects(projects);
  return { catalogue, get groups() { return groups; }, received, failures };
}

test('lazy project reads coalesce independently and never change another project cursor', async () => {
  const pendingA = deferred(), pendingB = deferred(), calls = [];
  const f = fixture((id, cursor) => { calls.push({ id, cursor }); return id === 'a' ? pendingA.promise : pendingB.promise; });
  const a = f.catalogue.load('a'), again = f.catalogue.load('a'), b = f.catalogue.load('b');
  await Promise.resolve(); assert.equal(calls.length, 2); assert(f.groups.a.busy); assert(f.groups.b.busy);
  pendingB.resolve(page([{ id: 'same', name: 'Dans B' }], { hasMore: true, nextCursor: 'same', total: 2 }));
  await b; assert.equal(f.groups.b.sessions[0].projectId, 'b'); assert(f.groups.a.busy);
  pendingA.resolve(page([{ id: 'same', name: 'Dans A' }])); await Promise.all([a, again]);
  assert.equal(f.groups.a.sessions[0].name, 'Dans A'); assert.equal(f.groups.a.nextCursor, null); assert.equal(f.groups.b.nextCursor, 'same');
  await f.catalogue.load('a'); assert.equal(calls.length, 2, 'an already loaded expansion uses its cache');
});

test('bottom conversations include all unassigned sources and keep duplicate ids distinct', async () => {
  const f = fixture(async id => page([{ id: 'shared', projectId: id, name: 'Même titre', updatedAt: id === 'native-default' ? 20 : 10 }]));
  await Promise.all(projects.map(project => f.catalogue.load(project.id)));
  const rows = unassignedSessions(projects, f.groups, 'même');
  assert.deepEqual(rows.map(row => [row.projectId, row.id]), [['native-default', 'shared'], ['companion-unassigned', 'shared']]);
  assert.equal(rows.some(row => ['a', 'b'].includes(row.projectId)), false);
});

test('pagination is per project and refresh preserves the loaded window while removing stale rows', async () => {
  const calls = []; let revision = 0;
  const f = fixture(async (id, cursor) => {
    calls.push({ id, cursor });
    if (id === 'b') return page([{ id: 'b1' }]);
    return cursor ? page([{ id: revision ? 'a3' : 'a2' }], { total: 2 }) : page([{ id: revision ? 'a0' : 'a1' }], { total: 2, hasMore: true, nextCursor: 'a1' });
  });
  await f.catalogue.load('a'); await f.catalogue.load('b'); await f.catalogue.load('a', { append: true });
  assert.deepEqual(f.groups.a.sessions.map(row => row.id), ['a1', 'a2']);
  revision++; await f.catalogue.load('a', { refresh: true });
  assert.deepEqual(f.groups.a.sessions.map(row => row.id), ['a0', 'a3']); assert.equal(f.groups.a.pages, 2);
  assert.equal(calls.filter(call => call.id === 'b').length, 1); assert.equal(f.groups.b.sessions[0].id, 'b1');
});

test('invalidating move source and destination rejects stale reads and does not resurrect removed rows', async () => {
  const old = deferred(); let current = false;
  const f = fixture(async id => !current ? old.promise : page(id === 'b' ? [{ id: 'moved' }] : []));
  const stale = f.catalogue.load('a'); await Promise.resolve();
  f.catalogue.invalidate(['a', 'b']); current = true;
  await Promise.all([f.catalogue.load('a'), f.catalogue.load('b')]);
  old.resolve(page([{ id: 'moved' }])); await stale;
  assert.deepEqual(f.groups.a.sessions, []); assert.equal(f.groups.b.sessions[0].id, 'moved');
});

test('logout and removed project discard pending titles without calling the observer', async () => {
  const old = deferred(); const f = fixture(() => old.promise);
  const pending = f.catalogue.load('a'); await Promise.resolve(); f.catalogue.reset();
  old.resolve(page([{ id: 'late', name: 'Titre tardif' }])); await pending;
  assert.equal(Object.keys(f.groups).length, 0); assert.deepEqual(f.received, []);
  const removed = deferred(); const g = fixture(() => removed.promise);
  const read = g.catalogue.load('a'); await Promise.resolve(); g.catalogue.setProjects(projects.filter(project => project.id !== 'a'));
  removed.resolve(page([{ id: 'removed' }])); await read;
  assert.equal(g.groups.a, undefined); assert.deepEqual(g.received, []);
});

test('failed pagination retains visible rows and explicit refresh recovers from a stale cursor', async () => {
  let calls = 0;
  const f = fixture(async (_id, cursor) => { calls++; if (cursor) throw Object.assign(Error('Le contenu a changé.'), { status: 409 }); return page([{ id: calls > 2 ? 'new' : 'first' }], { hasMore: true, nextCursor: 'first', total: 3 }); });
  await f.catalogue.load('a'); await f.catalogue.load('a', { append: true });
  assert.equal(f.groups.a.sessions[0].id, 'first'); assert.match(f.groups.a.error, /changé/); assert.equal(f.groups.a.busy, false);
  await f.catalogue.load('a', { refresh: true }); assert.equal(f.groups.a.error, ''); assert.equal(f.groups.a.sessions[0].id, 'new');
});

test('search filters only loaded rows and does not trigger project or history reads', async () => {
  let calls = 0; const f = fixture(async () => { calls++; return page([{ id: 'one', name: 'Café du projet' }]); });
  await f.catalogue.load('a'); assert.equal(matchingSessions(f.groups.a, '  CAFÉ ').length, 1);
  assert.deepEqual(matchingSessions(f.groups.b, 'café'), []); assert.equal(calls, 1);
});

test('malformed repeated cursors and foreign project rows cannot contaminate a group', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return page([{ id: 'own' }, { id: 'foreign', projectId: 'b' }], { hasMore: true, nextCursor: 'own', total: 3 }); });
  await f.catalogue.load('a'); assert.deepEqual(f.groups.a.sessions.map(row => row.id), ['own']);
  await f.catalogue.load('a', { append: true }); assert.equal(f.groups.a.sessions.length, 1); assert.match(f.groups.a.error, /invalide/); assert.equal(calls, 2);
});

test('valid identifier names cannot inherit or replace the catalogue prototype', async () => {
  const f = fixture(async () => page([{ id: 'one' }]));
  f.catalogue.setProjects([{ id: '__proto__', name: 'Premier' }, { id: 'constructor', name: 'Second' }]);
  await Promise.all([f.catalogue.load('__proto__'), f.catalogue.load('constructor')]);
  assert.equal(Object.getPrototypeOf(f.groups), null); assert.equal(f.groups.__proto__.sessions[0].projectId, '__proto__'); assert.equal(f.groups.constructor.sessions[0].projectId, 'constructor');
});
