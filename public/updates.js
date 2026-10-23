'use strict';
function initUpdates({ api, isAuthenticated = () => true, toast = () => {}, beforeInstall = () => true, beforeReload = () => {}, openSettings = () => {} }) {
  const $ = id => document.getElementById(id);
  const state = { active: false, epoch: 0, revision: 0, status: null, busy: false, action: '', request: false, error: '', timer: null, reconnectTimer: null, controller: null, dismissed: null, announced: null, restarting: false, pendingChannel: null };
  const authenticated = () => state.active && isAuthenticated();
  const candidate = () => state.status?.candidate;
  const channelLabel = channel => channel === 'beta' ? 'Bêta' : 'Stable';
  function acceptStatus(data) {
    if ((data?.channel || 'stable') !== (state.status?.channel || 'stable')) { state.dismissed = null; state.announced = null; }
    state.status = data;
  }
  const dirtyFile = () => {
    const save = $('file-save');
    return !!save && !save.hidden && !save.disabled && !$('files-view')?.hidden;
  };
  const date = value => {
    if (!value) return '';
    const time = new Date(value);
    return Number.isNaN(time.getTime()) ? '' : time.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  };
  function message(text = '') { state.error = text; $('updates-error').textContent = text; $('updates-error').hidden = !text; }
  function render() {
    const data = state.status, next = candidate(), available = !!next && next.version !== data?.ignoredVersion && next.version !== state.dismissed;
    $('updates-badge').hidden = !available;
    $('settings-maintenance-nav').classList.toggle('update-available', available);
    $('updates-version').textContent = data ? `Version installée : ${data.currentVersion} · canal ${channelLabel(data.installedChannel)}` : 'Lecture de la version installée…';
    const installing = state.restarting || ['preparing', 'installing', 'restarting'].includes(data?.installation?.status);
    $('updates-status').textContent = installing ? data?.installation?.message || 'Installation en cours. Le serveur va redémarrer…' : state.busy ? state.action : data?.checking ? 'Vérification en cours…' : next ? next.version === data?.ignoredVersion ? 'Cette version est ignorée.' : `Une version compatible est disponible : ${next.version}.` : data ? `Aucune mise à jour compatible sur le canal ${channelLabel(data.channel)}.` : '';
    $('updates-candidate').hidden = !next;
    $('updates-candidate-title').textContent = next ? `Version ${next.version} · ${channelLabel(next.channel || data.channel)}` : '';
    const published = date(next?.publishedAt); $('updates-published').textContent = published ? `Publiée le ${published}` : ''; $('updates-published').hidden = !published;
    $('updates-notes').textContent = next?.notes ? String(next.notes).slice(0, 24000) : 'Aucune note fournie pour cette version.';
    $('updates-enabled').checked = data?.enabled !== false;
    $('updates-enabled').disabled = !data || state.busy || installing;
    $('updates-channel').value = state.pendingChannel || data?.channel || 'stable';
    $('updates-channel').disabled = !data || state.busy || installing;
    $('updates-channel-note').textContent = data?.channel === 'beta'
      ? 'Bêta inclut des versions en cours d’essai. Une installation demande toujours ton accord.'
      : data?.installedChannel === 'beta'
        ? 'Le retour à Stable attend une version stable plus récente. La version installée reste utilisée jusque-là.'
        : 'Stable propose les versions publiées pour un usage courant.';
    $('updates-check').disabled = state.busy || !!data?.checking || installing;
    $('updates-install').disabled = !next || next.version === data?.ignoredVersion || !data?.canInstall || state.busy || installing;
    $('updates-ignore').disabled = !next || state.busy || installing || next.version === data?.ignoredVersion;
    $('updates-later').disabled = installing;
    const unavailable = next && !data?.canInstall ? data?.unavailableReason || 'L’installation automatique est indisponible pour cette installation.' : '';
    $('updates-unavailable').textContent = unavailable; $('updates-unavailable').hidden = !unavailable;
    $('updates-checked').textContent = data?.lastCheckedAt ? `Dernière vérification : ${date(data.lastCheckedAt)}.` : 'Aucune vérification terminée.';
    if (data?.error && !state.busy && !state.error) message(typeof data.error === 'string' ? data.error : data.error.message || 'La vérification a échoué. Réessaie avec « Vérifier maintenant ».');
    if (available && state.announced !== next.version) { state.announced = next.version; $('updates-announcement').textContent = `La version ${next.version} du compagnon est disponible dans Paramètres, Maintenance.`; }
  }
  function schedule() {
    clearTimeout(state.timer);
    if (authenticated() && !state.restarting) state.timer = setTimeout(() => { if (!document.hidden) refresh(); else schedule(); }, state.status?.checking ? 1500 : 60000);
  }
  async function refresh() {
    if (!authenticated() || state.request || state.busy || state.restarting) return;
    const epoch = state.epoch, revision = state.revision; state.request = true;
    const controller = new AbortController(); state.controller = controller;
    try { const data = await api('/api/updates', { signal: controller.signal }); if (epoch !== state.epoch || revision !== state.revision || !authenticated()) return; acceptStatus(data); if (!state.busy) message(''); render(); }
    catch (error) { if (epoch === state.epoch && authenticated() && error.name !== 'AbortError') message(error.message); }
    finally { if (epoch === state.epoch) { state.request = false; state.controller = null; schedule(); } }
  }
  async function mutate(route, body) {
    if (!authenticated() || state.busy || state.restarting) return;
    const epoch = state.epoch; ++state.revision; state.busy = true; state.action = route.endsWith('/install') ? 'Préparation de l’installation…' : route.endsWith('/check') ? 'Vérification en cours…' : 'Enregistrement du choix…'; message(''); render();
    try {
      const data = await api(route, { method: 'POST', body: JSON.stringify(body) });
      if (epoch !== state.epoch || !authenticated()) return;
      if (data?.currentVersion) acceptStatus(data);
      return data;
    } catch (error) { if (epoch === state.epoch && authenticated()) { message(error.status === 409 ? 'Une opération est en cours sur le PC. Attends sa fin, puis réessaie.' : error.message); } return null; }
    finally { if (epoch === state.epoch) { state.busy = false; render(); schedule(); } }
  }
  async function open() {
    if (!authenticated()) return;
    return openSettings(document.activeElement);
  }
  async function reconnect(version, epoch) {
    const started = Date.now();
    const poll = async () => {
      if (epoch !== state.epoch || !authenticated()) return;
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 3500);
      try {
        const response = await fetch('/api/ping', { cache: 'no-store', signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        if (data?.app === 'bionic-mobile-local' && data.version === version) {
          state.restarting = false;
          if (dirtyFile()) { message('La mise à jour est installée. Enregistre les changements du fichier, puis actualise cette page.'); render(); return; }
          await beforeReload(data);
          location.reload(); return;
        }
      } catch {} finally { clearTimeout(timeout); }
      if (Date.now() - started > 120000) { state.restarting = false; message('Le serveur ne s’est pas reconnecté. Vérifie-le sur le PC, puis actualise la page. Tes modifications affichées restent ouvertes.'); render(); schedule(); return; }
      state.reconnectTimer = setTimeout(poll, 2000);
    };
    state.reconnectTimer = setTimeout(poll, 1500);
  }
  async function install() {
    const next = candidate(); if (!authenticated() || !next || !state.status?.canInstall || state.busy || state.restarting) return;
    if (dirtyFile()) return message('Un fichier contient des changements non enregistrés. Enregistre-le sur le PC ou télécharge tes changements avant d’installer la mise à jour.');
    if (!window.confirm(`Installer la version ${next.version} et redémarrer le serveur maintenant ? Les sources du programme seront remplacées avec une sauvegarde. Conversations, réglages et projets sont conservés. Tu devras peut-être te reconnecter avec le même code.`)) return;
    try { if (!(await beforeInstall())) return; } catch (error) { return message(error.message || 'Impossible de préparer tes brouillons. L’installation n’a pas commencé.'); }
    const epoch = state.epoch;
    const result = await mutate('/api/updates/install', { version: next.version, confirm: true });
    if (!result || epoch !== state.epoch || !authenticated()) return;
    state.restarting = true; clearTimeout(state.timer); message(''); render();
    reconnect(next.version, epoch);
  }
  $('updates-later').addEventListener('click', () => { state.dismissed = candidate()?.version; render(); toast('Cette version sera rappelée lors de la prochaine connexion.'); });
  $('updates-ignore').addEventListener('click', async () => { const version = candidate()?.version; if (!version) return; const result = await mutate('/api/updates/ignore', { version }); if (result) { state.status.ignoredVersion = version; render(); toast(`La version ${version} ne sera plus proposée.`); } });
  $('updates-enabled').addEventListener('change', async () => { const enabled = $('updates-enabled').checked; const result = await mutate('/api/updates/preferences', { enabled }); if (result) { state.status.enabled = enabled; render(); } else render(); });
  $('updates-channel').addEventListener('change', async () => {
    const select = $('updates-channel'), channel = select.value;
    if (!authenticated() || state.busy || state.restarting || !['stable', 'beta'].includes(channel)) return render();
    const epoch = state.epoch, focused = document.activeElement === select;
    state.pendingChannel = channel;
    await mutate('/api/updates/preferences', { channel });
    if (epoch !== state.epoch || !authenticated()) return;
    state.pendingChannel = null;
    render();
    if (focused && !$('settings-view').hidden && !$('settings-page-maintenance').hidden && (document.activeElement === document.body || document.activeElement === select)) select.focus({ preventScroll: true });
  });
  $('updates-check').addEventListener('click', async () => { state.dismissed = null; const result = await mutate('/api/updates/check', {}); if (result) await refresh(); });
  $('updates-install').addEventListener('click', install);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  return {
    activate() { if (state.active) return refresh(); state.active = true; ++state.epoch; render(); return refresh(); },
    stop() { state.active = false; ++state.epoch; clearTimeout(state.timer); clearTimeout(state.reconnectTimer); state.controller?.abort(); state.controller = null; state.request = false; state.busy = false; state.restarting = false; state.pendingChannel = null; state.status = null; state.dismissed = null; state.announced = null; message(''); $('updates-announcement').textContent = ''; render(); },
    open, refresh, isRestarting() { return state.restarting; }
  };
}
