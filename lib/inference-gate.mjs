// Optional FIFO admission around each upstream prediction, never around human approval.
export function createInferenceGate(limit = 0) {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 32) throw new Error('Plafond d’inférence invalide.');
  let active = 0; const waiting = [];
  const aborted = () => Object.assign(new Error('Demande arrêtée avant admission.'), { status: 409 });
  function drain() {
    while (waiting.length && (!limit || active < limit)) {
      const item = waiting.shift(); item.signal?.removeEventListener('abort', item.abort);
      if (item.signal?.aborted) { item.reject(aborted()); continue; }
      active++; let released = false;
      item.resolve(() => { if (!released) { released = true; active--; drain(); } });
    }
  }
  function acquire(signal) {
    if (signal?.aborted) return Promise.reject(aborted());
    return new Promise((resolve, reject) => {
      const item = { resolve, reject, signal };
      item.abort = () => { const index = waiting.indexOf(item); if (index >= 0) { waiting.splice(index, 1); reject(aborted()); } };
      signal?.addEventListener('abort', item.abort, { once: true }); waiting.push(item); drain();
    });
  }
  return { acquire, snapshot: () => ({ limit, active, waiting: waiting.length }) };
}
