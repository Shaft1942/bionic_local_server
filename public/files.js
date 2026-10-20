'use strict';
function createProjectFileBrowser({ api, node, icon, toast, getProject, isBusy, onAttach, onChange = () => {} }) {
  const $ = id => document.getElementById(id);
  const state = { roots: [], projectId: null, rootId: null, path: '', file: null, busy: false, original: '', attachments: [], sequence: 0 };
  const dirty = () => !!state.file?.editable && $('file-editor').value !== state.original;
  const query = (relative = state.path, rootId = state.rootId) => new URLSearchParams({ projectId: state.projectId, rootId, path: relative }).toString();
  function fail(message) { $('files-error').textContent = message || ''; $('files-error').hidden = !message; }
  function canLeave() { return !dirty() || window.confirm('Tes changements ne sont pas enregistrés. Quitter ce fichier sans les enregistrer ?'); }
  function controls() {
    $('file-operation').hidden = !state.busy;
    $('files-view').setAttribute('aria-busy', String(state.busy));
    for (const id of ['file-root', 'file-up', 'files-refresh']) $(id).disabled = state.busy;
    $('file-up').disabled = state.busy || !state.path;
    $('file-list').querySelectorAll('button').forEach(button => button.disabled = state.busy);
    $('file-save').hidden = !state.file?.editable;
    $('file-save').disabled = state.busy || !dirty();
    $('file-editor').readOnly = state.busy || !state.file?.editable;
    $('file-attach').hidden = !state.file?.attachable;
    $('file-attach').disabled = state.busy || dirty() || isBusy();
    $('file-undo').disabled = state.busy || dirty();
    $('file-download-draft').hidden = !dirty();
    if (dirty()) $('file-status').textContent = 'Modifications non enregistrées sur le PC.';
  }
  async function run(action) {
    if (state.busy) return;
    state.busy = true; fail(''); controls();
    try { await action(); } catch (e) { fail(e.status === 404 && /Action inconnue/.test(e.message) ? 'Cette fonction nécessite la nouvelle version du serveur. Relance-le sur le PC, puis actualise cette page.' : e.message); }
    finally { state.busy = false; controls(); }
  }
  function resetFile() {
    state.file = null; state.original = ''; $('file-opened').hidden = true; $('file-empty').hidden = false;
    $('file-editor').value = ''; $('file-image').removeAttribute('src'); $('files-view').classList.remove('file-selected');
  }
  async function browse(relative = '') {
    if (!canLeave()) return;
    const sequence = ++state.sequence;
    const result = await api('/api/files?' + query(relative));
    if (sequence !== state.sequence) return;
    state.path = result.path; resetFile(); $('file-location').textContent = result.path ? '/' + result.path : '/';
    $('file-list').replaceChildren();
    for (const entry of result.entries) {
      const button = node('button', 'file-row'); button.type = 'button'; button.append(icon(entry.directory ? 'folder' : 'file'), node('span', '', entry.name));
      button.dataset.filePath = entry.path;
      button.setAttribute('aria-label', (entry.directory ? 'Ouvrir le dossier ' : 'Ouvrir le fichier ') + entry.name);
      button.addEventListener('click', () => run(() => entry.directory ? browse(entry.path) : openFile(entry.path)));
      $('file-list').append(button);
    }
    if (!result.entries.length) $('file-list').append(node('p', 'file-list-empty', 'Ce dossier est vide. Les fichiers internes, clés et raccourcis sont masqués.'));
    controls();
  }
  function showFile(file) {
    state.file = file; state.original = file.text || '';
    $('file-opened').hidden = false; $('file-empty').hidden = true; $('files-view').classList.add('file-selected');
    $('file-name').textContent = file.name;
    const size = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(file.size / 1000);
    $('file-description').textContent = `${size} Ko · ` + (file.editable ? 'Texte modifiable sur le PC' : file.kind === 'document' ? 'Texte extrait · document en lecture seule' : 'Lecture seule');
    $('file-editor').value = state.original; $('file-editor').hidden = file.text === undefined;
    $('file-editor').classList.toggle('prose', file.kind === 'document' || /\.(?:md|markdown|txt|log)$/i.test(file.name));
    $('file-editor').wrap = $('file-editor').classList.contains('prose') ? 'soft' : 'off';
    $('file-list').querySelectorAll('button').forEach(button => button.setAttribute('aria-current', String(button.dataset.filePath === file.path)));
    $('file-image').hidden = file.kind !== 'image';
    if (file.kind === 'image') $('file-image').src = '/api/file/download?' + query(file.path) + '&inline=1'; else $('file-image').removeAttribute('src');
    $('file-download').href = '/api/file/download?' + query(file.path);
    $('file-download').download = file.name;
    $('file-undo').hidden = !file.backupId;
    $('file-status').textContent = file.notice || (file.truncated ? 'Aperçu partiel. Sélectionne le passage à joindre.' : file.saved ? 'Enregistré sur le PC. Une copie de la version précédente est conservée.' : file.editable ? 'Enregistre tes changements pour les retrouver dans Bionic.' : file.attachable ? file.kind === 'image' ? 'Cette image peut être jointe à un modèle marqué Vision.' : 'Ce texte peut être joint à une conversation.' : 'Ce format est consultable ou téléchargeable ; il ne peut pas être joint au modèle ici.');
    $('file-selection-help').hidden = !file.attachable || file.kind === 'image';
    controls();
  }
  async function openFile(relative) {
    if (!canLeave()) return;
    const sequence = ++state.sequence;
    $('file-status').textContent = 'Ouverture du fichier…';
    const file = await api('/api/file?' + query(relative));
    if (sequence === state.sequence) showFile(file);
  }
  async function open() {
    if (isBusy()) return toast('Attends la fin de l’import ou du chargement pour ouvrir les fichiers.');
    const project = getProject(); if (!project) return;
    $('files-trash').hidden=true;document.querySelector('.files-layout').hidden=false;
    state.projectId = project.id; $('files-title').textContent = 'Fichiers · ' + project.name;
    $('app').hidden = true; $('files-view').hidden = false; resetFile();
    await run(async () => {
      const result = await api('/api/file-roots?projectId=' + encodeURIComponent(project.id)); state.roots = result.roots;
      $('file-root').replaceChildren();
      for (const root of result.roots) $('file-root').append(new Option(root.name + (root.writable ? '' : ' · lecture seule'), root.id));
      state.rootId = result.roots[0]?.id;
      if (!state.rootId) { $('file-list').replaceChildren(node('p', 'file-list-empty', 'Aucun dossier disponible pour ce projet.')); return; }
      $('file-root-description').textContent = result.roots[0].path;
      await browse('');
    });
    $('files-close').focus();
  }
  function close() {
    if (!canLeave()) return;
    ++state.sequence; $('files-view').hidden = true; $('app').hidden = false;
    ($('composer-files').open ? $('attach-file') : $('files-menu-toggle')).focus();
  }
  function renderAttachments() {
    $('attachments').replaceChildren(); $('attachments').hidden = !state.attachments.length;
    for (const [index, file] of state.attachments.entries()) {
      const chip = node('div', 'attachment-chip');
      chip.append(icon('file'), node('span', '', file.name + (file.selection ? ' · extrait' : '')));
      const remove = node('button', 'icon-button'); remove.type = 'button'; remove.append(icon('close')); remove.setAttribute('aria-label', 'Retirer ' + file.name); remove.disabled = isBusy();
      remove.addEventListener('click', () => { state.attachments.splice(index, 1); renderAttachments(); onChange(); }); chip.append(remove); $('attachments').append(chip);
    }
  }
  $('files-close').append(icon('back')); $('file-up').append(icon('up')); $('files-refresh').append(icon('refresh')); $('files-open-sidebar').prepend(icon('folder')); $('attach-file').prepend(icon('attach'));
  $('files-open-sidebar').addEventListener('click', open); $('attach-file').addEventListener('click', open);
  $('files-close').addEventListener('click', close);
  $('file-back-list').addEventListener('click', () => { if (canLeave()) resetFile(); });
  $('file-up').addEventListener('click', () => run(() => browse(state.path.split('/').slice(0, -1).join('/'))));
  $('files-refresh').addEventListener('click', () => run(() => browse(state.path)));
  $('file-root').addEventListener('change', () => {
    if (!canLeave()) { $('file-root').value = state.rootId; return; }
    state.rootId = $('file-root').value; $('file-root-description').textContent = state.roots.find(root => root.id === state.rootId)?.path || '';
    state.file = null; run(() => browse(''));
  });
  $('file-editor').addEventListener('input', controls);
  $('file-save').addEventListener('click', () => run(async () => {
    const file = state.file;
    const saved = await api('/api/file/save', { method: 'POST', body: JSON.stringify({ projectId: state.projectId, rootId: state.rootId, path: file.path, hash: file.hash, text: $('file-editor').value }) });
    showFile(saved); toast('Fichier enregistré sur le PC.');
  }));
  $('file-undo').addEventListener('click', () => run(async () => {
    const file = state.file;
    const restored = await api('/api/file/restore', { method: 'POST', body: JSON.stringify({ projectId: state.projectId, rootId: state.rootId, path: file.path, hash: file.hash, backupId: file.backupId }) });
    showFile(restored); toast('Version précédente rétablie sur le PC.');
  }));
  $('file-download-draft').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([$('file-editor').value], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'mes-changements-' + state.file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('file-attach').addEventListener('click', () => {
    const file = state.file; if (!file?.attachable || dirty() || state.busy || isBusy()) return;
    if (state.attachments.length >= 4) return fail('Tu peux joindre au maximum quatre fichiers. Retire une pièce jointe dans le chat pour continuer.');
    const start = file.kind === 'image' ? 0 : $('file-editor').selectionStart, end = file.kind === 'image' ? 0 : $('file-editor').selectionEnd;
    const selection = end > start ? { start, end } : undefined;
    if (file.truncated && !selection) return fail('Cet aperçu est partiel. Sélectionne le passage que tu veux joindre.');
    if ((selection ? end - start : file.text?.length || 0) > 160000) return fail('Ce texte est trop long. Sélectionne seulement le passage utile à ta question.');
    state.attachments.push({ rootId: state.rootId, path: file.path, hash: file.hash, name: file.name, ...(selection ? { selection } : {}) });
    renderAttachments(); onChange(); close(); onAttach(); toast(selection ? 'Extrait joint au prochain message.' : 'Fichier joint au prochain message.');
  });
  $('files-trash-open').addEventListener('click',()=>run(async()=>{if(!canLeave())return;const projectId=state.projectId;const result=await api('/api/files/trash?'+new URLSearchParams({projectId}));if(projectId!==state.projectId)return;$('files-trash').hidden=false;document.querySelector('.files-layout').hidden=true;$('files-trash-list').replaceChildren();$('files-trash-status').textContent=(result.warnings||[]).map(x=>x.message).join(' ')||(result.items.length?'Copies vérifiées du projet courant.':'La corbeille est vide.');if(result.truncated)$('files-trash-status').textContent+=' Liste partielle (limite de copies).';for(const item of result.items){const row=node('article','trash-row');row.append(node('h3','',item.path||'Copie indisponible'),node('p','',item.status==='available'?(new Date(item.savedAt).toLocaleString('fr-FR'))+' · '+item.size+' octets':'Copie endommagée : restauration indisponible.'));if(item.status==='available'){const link=node('a','file-action','Télécharger');link.href='/api/files/trash/download?'+new URLSearchParams({projectId,backupId:item.id});link.download='';const restore=node('button','file-action','Restaurer sans écraser');restore.type='button';restore.addEventListener('click',async()=>{restore.disabled=true;try{await api('/api/files/trash/restore',{method:'POST',body:JSON.stringify({projectId,backupId:item.id})});restore.textContent='Restauré';toast('Fichier restauré dans le projet.');}catch(e){fail(e.message);restore.disabled=false;}});row.append(link,restore);}$('files-trash-list').append(row);}$('files-trash-close').focus();}));
  $('files-trash-close').addEventListener('click',()=>{$('files-trash').hidden=true;document.querySelector('.files-layout').hidden=false;$('files-trash-open').focus();});
  window.addEventListener('beforeunload', event => { if (!$('files-view').hidden && dirty()) { event.preventDefault(); event.returnValue = ''; } });
  return { clear() { state.attachments = []; renderAttachments(); }, snapshot() { return state.attachments.map(file => ({ ...file, ...(file.selection ? { selection: { ...file.selection } } : {}) })); }, restore(attachments) { state.attachments = (Array.isArray(attachments) ? attachments : []).slice(0, 4).map(file => ({ rootId: file.rootId, path: file.path, hash: file.hash, name: file.name || file.path?.split(/[\\/]/).pop() || 'Fichier', ...(file.selection ? { selection: { start: file.selection.start, end: file.selection.end } } : {}) })); renderAttachments(); }, references() { return state.attachments.map(({ name, ...reference }) => ({ ...reference, ...(reference.selection ? { selection: { ...reference.selection } } : {}) })); }, refresh: renderAttachments, addImported(file) { if (!file.attachable || file.truncated || state.attachments.length >= 4) return false; state.attachments.push({ rootId: file.rootId, path: file.path, hash: file.hash, name: file.name }); renderAttachments(); return true; } };
}
