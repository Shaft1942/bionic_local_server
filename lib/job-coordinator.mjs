// Resource reservations cover one inference phase, never tools or human approval.
// Only counts and durations leave this module; prompts and credentials do not.
export function createJobCoordinator({ policy = 'exclusive', maxText = 0 } = {}) {
  if (!['exclusive', 'independent'].includes(policy)) throw new Error('Politique de ressources invalide.');
  const active = { text: 0, image: 0 }, waiting = [];
  const metrics = { admitted: 0, cancelled: 0, waitMs: 0, runMs: 0 };
  let stopping = false;
  const stopped = () => Object.assign(new Error('Demande arrêtée avant admission de la ressource.'), { status: 409 });
  const allowed = kind => (!maxText || kind !== 'text' || active.text < maxText) &&
    (policy === 'independent' || (kind === 'text' ? active.image === 0 : active.text === 0 && active.image === 0));
  function lease(kind) {
    active[kind]++; metrics.admitted++; const started = performance.now(); let done = false;
    return () => { if (done) return; done = true; active[kind]--; metrics.runMs += performance.now() - started; drain(); };
  }
  function drain() {
    while (!stopping && waiting.length) {
      const index=policy==='independent'?waiting.findIndex(item=>allowed(item.kind)):allowed(waiting[0].kind)?0:-1;
      if(index<0)break;
      const [item] = waiting.splice(index,1); item.signal?.removeEventListener('abort', item.abort);
      if (item.signal?.aborted) { item.reject(stopped()); continue; }
      metrics.waitMs += performance.now() - item.started; item.resolve(lease(item.kind));
    }
  }
  function acquire(kind, signal) {
    if (!Object.hasOwn(active, kind)) return Promise.reject(new Error('Ressource inconnue.'));
    if (stopping || signal?.aborted) return Promise.reject(stopped());
    return new Promise((resolve, reject) => {
      const item = { kind, signal, resolve, reject, started: performance.now() };
      item.abort = () => { const i = waiting.indexOf(item); if (i < 0) return; waiting.splice(i, 1); metrics.cancelled++; reject(stopped()); drain(); };
      signal?.addEventListener('abort', item.abort, { once: true }); waiting.push(item); drain();
    });
  }
  // Existing image renders must reserve before the server admits new text work.
  function restoreImage() { if (stopping) throw stopped(); return lease('image'); }
  function stop() { stopping = true; for (const item of waiting.splice(0)) { item.signal?.removeEventListener('abort', item.abort); item.reject(stopped()); } }
  return { acquire, restoreImage, stop, status: () => ({ policy, stopping, active: { ...active }, waiting: { text: waiting.filter(x => x.kind === 'text').length, image: waiting.filter(x => x.kind === 'image').length }, metrics: Object.fromEntries(Object.entries(metrics).map(([k,v]) => [k, Math.round(v)])) }) };
}
