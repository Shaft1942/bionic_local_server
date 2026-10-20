'use strict';
// Only unsent message text is durable. Files, credentials and tool settings never enter this store.
function createMessageDraftStore({ storage, now = () => Date.now() } = {}) {
  let key = '', epochKey = '', epoch = '', revoked = false, duration = 0, entries = new Map();
  const durations = [3600000, 86400000, 604800000];
  const newEpoch = () => String(now()) + '-' + Math.random().toString(36).slice(2);
  function synchronize() {
    if (key && !revoked && storage.getItem(epochKey) !== epoch) { revoked = true; duration = 0; entries = new Map(); return true; }
    return false;
  }
  function commit() {
    if (!key) return;
    if (synchronize() || revoked) return;
    if (!duration) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ version: 1, epoch, duration, entries: [...entries] }));
  }
  function activate(instanceId) {
    entries = new Map(); duration = 0;
    if (typeof instanceId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(instanceId)) { key = ''; return { duration, entries }; }
    key = 'bm_message_drafts_v1_' + instanceId; epochKey = key + '_epoch'; revoked = false;
    epoch = storage.getItem(epochKey);
    if (!epoch) { epoch = newEpoch(); storage.setItem(epochKey,epoch); }
    const saved = JSON.parse(storage.getItem(key) || 'null');
    if (saved?.version === 1 && saved.epoch === epoch && durations.includes(saved.duration)) {
      duration = saved.duration;
      for (const row of (Array.isArray(saved.entries) ? saved.entries : []).slice(-100)) {
        if (Array.isArray(row) && typeof row[0] === 'string' && row[0].includes('|') && typeof row[1]?.text === 'string' && row[1].text.length <= 16000 && Number.isFinite(row[1].expiresAt) && row[1].expiresAt > now()) entries.set(row[0], { text: row[1].text, expiresAt: row[1].expiresAt });
      }
      commit();
    }
    return { duration, entries: new Map(entries) };
  }
  function save(drafts) {
    if (synchronize()) return { revoked: true };
    if (revoked) return;
    if (!duration || !key) return;
    const next = new Map();
    for (const [id, draft] of [...drafts].slice(-100)) {
      const text = typeof draft?.text === 'string' ? draft.text.slice(0, 16000) : '';
      if (!text) continue;
      const old = entries.get(id);
      next.set(id, { text, expiresAt: old?.text === text ? old.expiresAt : now() + duration });
    }
    entries = new Map([...next].filter(([, value]) => value.expiresAt > now()));
    commit();
  }
  function setDuration(value, drafts) {
    if (synchronize() || revoked) throw new Error('La conservation a été effacée dans un autre onglet. Reconnecte ce serveur avant de la réactiver.');
    const selected = Number(value);
    if (selected !== 0 && !durations.includes(selected)) throw new Error('Choisis une durée de conservation.');
    if (selected && !key) throw new Error('La conservation durable est indisponible : reconnecte ce serveur.');
    duration = selected; entries = new Map();
    if (!duration) commit(); else save(drafts);
  }
  function clear() { if (key) { epoch = newEpoch(); storage.setItem(epochKey,epoch); storage.removeItem(key); } revoked = false; duration = 0; entries = new Map(); }
  return { activate, save, setDuration, clear, synchronize, handlesStorageKey: value => key && (value === null || value === key || value === epochKey), get duration() { return duration; } };
}
