<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowUp, RefreshCw, Folder, FileText } from '@lucide/svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { tr } from './preferences.svelte';
	type Api = (route: string, options?: RequestInit) => Promise<any>;
	type Root = { id: string; name: string; writable: boolean };
	type Entry = { name: string; path: string; directory: boolean };
	type ProjectFile = { rootId: string; path: string; name: string; size: number; kind?: string; text?: string; hash?: string; editable?: boolean; attachable?: boolean; truncated?: boolean; notice?: string; saved?: boolean };
	let { projectId, request, onAttach, onDirtyChange, instanceId = 'prototype' }: { projectId: string; request: Api; chatId?: string; instanceId?: string; onAttach?: (attachment: any) => void; onDirtyChange?: (dirty:boolean)=>void } = $props();
	let roots = $state<Root[]>([]), rootId = $state(''), location = $state(''), entries = $state<Entry[]>([]);
	let file = $state<ProjectFile | null>(null), text = $state(''), original = $state(''), baseHash = $state('');
	let busy = $state(false), notice = $state(''), failure = $state(''), conflict = $state(false), serverVersion = $state<ProjectFile | null>(null);
	let loadedProject = '', loadedInstance = '', sequence = 0, uploader: HTMLInputElement;
	const dirty = $derived(!!file?.editable && text !== original);
	$effect(() => { onDirtyChange?.(dirty); });
	const query = (relative = location, rid = rootId, pid = projectId) => new URLSearchParams({ projectId: pid, rootId: rid, path: relative });
	const draftKey = (pid: string, rid: string, path: string, identity = instanceId) => `companion-prototype:${identity}:${window.location.pathname}:file:${pid}:${rid}:${path}`;
	function rememberDraft() {
		if (!file?.editable || !loadedProject) return;
		try {
			const key = draftKey(loadedProject, file.rootId, file.path, loadedInstance);
			if (text !== original) sessionStorage.setItem(key, JSON.stringify({ text, original, hash: baseHash }));
			else sessionStorage.removeItem(key);
		} catch { notice = tr('Le brouillon ne peut pas être conservé dans ce navigateur. Télécharge-le avant de quitter.',"The draft cannot be stored in this browser. Download it before leaving."); }
	}
	function displayFile(next: ProjectFile) {
		file = next; original = next.text ?? ''; text = original; baseHash = next.hash ?? ''; conflict = false; serverVersion = null;
		try {
			const saved = sessionStorage.getItem(draftKey(loadedProject, next.rootId, next.path));
			if (saved && next.editable) {
				const draft = JSON.parse(saved);
				if (typeof draft.text === 'string' && typeof draft.original === 'string' && typeof draft.hash === 'string') {
					text = draft.text; original = draft.original; baseHash = draft.hash;
					conflict = draft.hash !== next.hash;
					notice = conflict ? tr('Brouillon retrouvé. Le fichier serveur a changé : compare les deux versions avant de continuer.',"Draft recovered. The server file changed: compare both versions before continuing.") : tr('Brouillon non enregistré retrouvé dans cet onglet.',"Unsaved draft recovered in this tab.");
				}
			}
		} catch { /* Un brouillon invalide n'accorde aucun droit et n'est pas utilisé. */ }
	}
	async function run(action: () => Promise<void>) {
		if (busy) return; const pid = projectId; busy = true; failure = '';
		try { await action(); } catch (error: any) { if (pid === projectId) failure = error?.message || tr('Opération impossible. Vérifie la connexion.',"Operation unavailable. Check the connection."); }
		finally { if (pid === projectId) busy = false; }
	}
	async function browse(path = '', rid = rootId) {
		rememberDraft(); const epoch = ++sequence, pid = projectId;
		const result = await request('/api/files?' + query(path, rid, pid));
		if (epoch !== sequence || pid !== projectId) return;
		rootId = rid; location = result.path; entries = result.entries ?? []; file = null; text = ''; original = ''; conflict = false; serverVersion = null;
	}
	async function open(path: string) {
		rememberDraft(); const epoch = ++sequence, pid = projectId;
		const result = await request('/api/file?' + query(path));
		if (epoch !== sequence || pid !== projectId) return;
		notice = ''; displayFile(result);
	}
	async function initialize(pid: string) {
		rememberDraft(); loadedProject = pid; loadedInstance = instanceId; const token = ++sequence; roots = []; entries = []; file = null; rootId = ''; location = ''; failure = ''; notice = ''; text = ''; original = '';
		if (!pid) return;
		busy = true;
		try {
			const result = await request('/api/file-roots?' + new URLSearchParams({ projectId: pid }));
			if (projectId !== pid || token !== sequence) return;
			roots = result.roots ?? []; rootId = roots[0]?.id ?? '';
			if (rootId) await browse('');
		} catch (error: any) { if (pid === projectId) failure = error?.message || tr('Impossible de charger les fichiers.',"Could not load files."); }
		finally { if (pid === projectId) busy = false; }
	}
	async function save() {
		if (!file?.editable || !dirty) return;
		const current = file, pid = projectId, epoch = sequence, content = text;
		await run(async () => {
			try {
				const saved = await request('/api/file/save', { method: 'POST', body: JSON.stringify({ projectId: pid, rootId: current.rootId, path: current.path, hash: baseHash, text: content }) });
				if (pid !== projectId || epoch !== sequence) return;
				sessionStorage.removeItem(draftKey(pid, current.rootId, current.path)); displayFile(saved); notice = tr('Fichier enregistré. La copie précédente est conservée par le serveur.',"File saved. The server keeps the previous copy.");
			} catch (error: any) {
				if (pid === projectId && epoch === sequence) { conflict = error?.status === 409; rememberDraft(); }
				throw error;
			}
		});
	}
	async function compare() {
		if (!file) return;
		const current = file, pid = projectId, epoch = sequence;
		await run(async () => {
			const result = await request('/api/file?' + query(current.path, current.rootId, pid));
			if (pid === projectId && epoch === sequence) { serverVersion = result; notice = tr('Version serveur affichée séparément. Ton brouillon est conservé.',"Server version shown separately. Your draft is preserved."); }
		});
	}
	function useServerVersion() {
		if (!file || !serverVersion) return;
		if (dirty && !window.confirm(tr('Remplacer ce brouillon par la version serveur ? Télécharge-le d’abord si tu veux le conserver.',"Replace this draft with the server version? Download it first if you want to keep it."))) return;
		sessionStorage.removeItem(draftKey(projectId, file.rootId, file.path)); const version = serverVersion; displayFile(version); notice = tr('Version serveur chargée.',"Server version loaded.");
	}
	function downloadDraft() {
		if (!file) return;
		const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), link = document.createElement('a');
		link.href = url; link.download = 'brouillon-' + file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	async function upload(event: Event) {
		const input = event.target as HTMLInputElement, imported = input.files?.[0], pid = projectId;
		if (!imported) return;
		if (imported.size > 20_000_000) { failure = tr('Choisis un fichier de moins de 20 Mo.',"Choose a file smaller than 20 MB."); input.value = ''; return; }
		await run(async () => {
			const result = await request('/api/file/upload?' + new URLSearchParams({ projectId: pid, name: imported.name }), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: imported });
			if (pid !== projectId) return;
			await browse('Imports telephone', result.rootId); await open(result.path); notice = tr('Fichier importé dans le projet. Joins-le au chat si nécessaire.',"File imported into the project. Attach it to the chat if needed.");
		}); input.value = '';
	}
	$effect(() => { const pid = projectId; if (pid !== loadedProject || instanceId !== loadedInstance) void initialize(pid); });
	onMount(() => {
		const beforeLeave = (event: BeforeUnloadEvent) => { rememberDraft(); if (dirty) { event.preventDefault(); event.returnValue = ''; } };
		window.addEventListener('beforeunload', beforeLeave);
		return () => { rememberDraft(); window.removeEventListener('beforeunload', beforeLeave); };
	});
</script>

<section class="files-panel" aria-label={tr('Fichiers du projet',"Project files")} aria-busy={busy}>
	<header><div><h2>{tr('Fichiers du projet',"Project files")}</h2><p>{tr('Consulte, joins ou modifie les fichiers autorisés.',"Inspect, attach or edit permitted files.")}</p></div><Button variant="outline" disabled={busy || !roots.some(root => root.id === 'project' && root.writable)} onclick={() => uploader.click()}>{tr('Importer un fichier',"Import a file")}</Button><input bind:this={uploader} class="hidden-input" type="file" aria-label={tr('Importer un fichier dans le projet',"Import a file into the project")} onchange={upload} disabled={busy} /></header>
	{#if failure}<p class="feedback error" role="alert">{failure}{#if conflict} {tr('Ton brouillon reste dans l’éditeur. Aucune écriture forcée n’a été faite.','Your draft remains in the editor. No overwrite was forced.')}{/if}</p>{/if}
	{#if notice}<p class="feedback" role="status">{notice}</p>{/if}
	{#if !projectId}<p class="empty">{tr('Choisis un projet pour afficher ses fichiers.',"Choose a project to view its files.")}</p>
	{:else if !roots.length && !busy}<p class="empty">{tr('Ce projet ne possède aucun dossier autorisé.',"This project has no authorized folder.")}</p>
	{:else}<div class="workspace">
		<aside class="browser" aria-label={tr('Navigation dans les fichiers',"File navigation")}>
			<label for="file-root">{tr('Dossier autorisé',"Authorized folder")}</label><select id="file-root" value={rootId} disabled={busy} onchange={event => void run(() => browse('', event.currentTarget.value))}>{#each roots as root}<option value={root.id}>{root.name}{root.writable ? '' : tr(' · lecture seule'," · read only")}</option>{/each}</select>
			<div class="path"><Button size="sm" variant="ghost" disabled={busy || !location} onclick={() => void run(() => browse(location.split('/').slice(0, -1).join('/')))} aria-label={tr('Dossier parent',"Parent folder")}><ArrowUp size={16}/></Button><span title={location || '/'}>{location || '/'}</span><Button size="sm" variant="ghost" disabled={busy} onclick={() => void run(() => browse(location))} aria-label={tr('Actualiser les fichiers',"Refresh files")}><RefreshCw size={16}/></Button></div>
			<ul>{#each entries as entry}<li><button class:current={file?.path === entry.path} disabled={busy} aria-label={`${entry.directory ? tr('Ouvrir le dossier',"Open folder") : tr('Ouvrir le fichier',"Open file")} ${entry.name}`} onclick={() => void run(() => entry.directory ? browse(entry.path) : open(entry.path))}><span aria-hidden="true">{#if entry.directory}<Folder size={16}/>{:else}<FileText size={16}/>{/if}</span><span>{entry.name}</span></button></li>{/each}</ul>
			{#if !entries.length && !busy}<p class="empty">{tr('Dossier vide',"Empty folder")}</p>{/if}
		</aside>
		<div class="editor-area">
			{#if file}<div class="file-title"><div><h3>{file.name}</h3><p>{Math.max(0, file.size / 1000).toFixed(1)} {tr('ko','kB')} · {file.editable ? tr('modifiable',"editable") : tr('lecture seule',"read only")}{dirty ? tr(' · brouillon non enregistré'," · unsaved draft") : ''}</p></div><a href={'/api/file/download?' + query(file.path, file.rootId)} download>{tr('Télécharger',"Download")}</a></div>
				{#if file.notice}<p class="feedback">{file.notice}</p>{/if}{#if file.truncated}<p class="feedback">{tr('Aperçu partiel. Le fichier ne peut pas être joint en entier depuis cet aperçu.',"Partial preview. This preview cannot attach the entire file.")}</p>{/if}
				{#if file.text !== undefined}<label class="editor-label" for="project-file-editor">{tr('Contenu de','Contents of')} {file.name}</label><textarea id="project-file-editor" class="file-editor" bind:value={text} readonly={!file.editable} disabled={busy} oninput={() => queueMicrotask(rememberDraft)} spellcheck="false"></textarea>
				{:else if file.kind === 'image'}<img class="file-preview" src={'/api/file/download?' + query(file.path, file.rootId) + '&inline=1'} alt={file.name} />
				{:else}<p class="empty">{tr('L’aperçu de ce format n’est pas disponible. Tu peux le télécharger.',"No preview is available for this format. You can download it.")}</p>{/if}
				<div class="actions"><Button disabled={busy || !dirty || conflict} onclick={() => void save()}>{tr('Enregistrer',"Save")}</Button><Button variant="outline" disabled={busy || !file.attachable || !!file.truncated || dirty || !onAttach} onclick={() => { if (file && onAttach) { onAttach({ rootId: file.rootId, path: file.path, hash: file.hash, name: file.name }); notice = tr('Fichier joint au prochain message du chat.',"File attached to the next chat message."); } }}>{tr('Joindre au chat',"Attach to chat")}</Button>{#if dirty}<Button variant="ghost" onclick={downloadDraft}>{tr('Télécharger le brouillon',"Download draft")}</Button>{/if}{#if conflict}<Button variant="outline" disabled={busy} onclick={() => void compare()}>{tr('Comparer la version serveur',"Compare server version")}</Button>{/if}</div>
				{#if file.hash}<p class="hash">{tr('Version :','Version:')} {baseHash.slice(0, 16)}…</p>{/if}
				{#if serverVersion}<div class="comparison"><h3>{tr('Version actuelle sur le serveur',"Current server version")}</h3><pre>{serverVersion.text ?? tr('Aucun aperçu texte',"No text preview")}</pre><Button variant="outline" disabled={busy} onclick={useServerVersion}>{tr('Utiliser la version serveur',"Use server version")}</Button></div>{/if}
			{:else}<div class="empty editor-empty"><span aria-hidden="true"><FileText size={36}/></span><h3>{tr('Un projet, ses fichiers',"A project and its files")}</h3><p>{tr('Ouvre un fichier à gauche pour le consulter ou le joindre au chat.',"Open a file on the left to inspect it or attach it to the chat.")}</p></div>{/if}
		</div>
	</div>{/if}
</section>

<style>
	.files-panel{height:100%;overflow:auto;padding:24px;color:var(--foreground);font-size:14px}header{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px}h2{font-size:21px;font-weight:600;margin:0 0 5px}h3{font-weight:600;margin:0;font-size:15px}p{margin:0;color:var(--muted-foreground);line-height:1.5}header p{font-size:13px}.hidden-input{display:none}.feedback{padding:12px 14px;border:1px solid var(--border);border-radius:8px;margin:0 0 14px;background:var(--muted);color:var(--foreground);overflow-wrap:anywhere}.error{border-color:#b95353;color:#b32929}.workspace{display:grid;grid-template-columns:240px minmax(0,1fr);border:1px solid var(--border);border-radius:10px;min-height:480px;overflow:hidden}.browser{border-right:1px solid var(--border);padding:14px;background:var(--sidebar,var(--background))}.browser label{display:block;font-size:12px;color:var(--muted-foreground);margin-bottom:7px}select{background:var(--background);border:1px solid var(--border);border-radius:6px;color:inherit;width:100%;padding:9px;font-size:13px}.path{display:flex;align-items:center;gap:5px;margin:12px 0 8px}.path span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.browser ul{list-style:none;margin:0;padding:0;max-height:55vh;overflow:auto}.browser li button{width:100%;display:flex;gap:9px;text-align:left;padding:9px 8px;border-radius:6px;align-items:flex-start;cursor:pointer}.browser li button span:last-child{overflow-wrap:anywhere;min-width:0}.browser li button:hover,.browser li button.current{background:var(--muted)}.browser button:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid var(--ring);outline-offset:2px}.editor-area{min-width:0;padding:20px;display:flex;flex-direction:column;gap:14px}.file-title{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;overflow-wrap:anywhere}.file-title p{font-size:12px;margin-top:4px}.file-title a{text-decoration:underline;font-size:12px;flex-shrink:0}.editor-label{font-size:12px;color:var(--muted-foreground)}.file-editor{flex:1;width:100%;min-height:300px;padding:12px;border:1px solid var(--border);border-radius:7px;background:var(--background);color:inherit;resize:vertical;font:13px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;tab-size:2}.actions{display:flex;gap:8px;flex-wrap:wrap}.hash{font:11px ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}.empty{padding:22px 8px;font-size:13px}.editor-empty{margin:auto;text-align:center;max-width:310px}.editor-empty>span{display:block;font-size:38px;color:var(--muted-foreground);margin-bottom:15px}.editor-empty h3{margin-bottom:9px}.file-preview{max-width:100%;max-height:460px;object-fit:contain}.comparison{border-top:1px solid var(--border);padding-top:16px}.comparison pre{font:12px/1.6 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;margin:12px 0}.files-panel :global(button:disabled){opacity:.5;cursor:default}@media(max-width:720px){.files-panel{padding:16px}header{align-items:flex-start;flex-wrap:wrap}.workspace{grid-template-columns:1fr}.browser{border-right:0;border-bottom:1px solid var(--border)}.browser ul{max-height:190px}.editor-area{padding:14px}.file-title{flex-wrap:wrap}.file-editor{min-height:280px}}
	@media(max-width:720px){.files-panel :global(button),select,.file-title a{min-height:44px}.browser li button{padding-top:12px;padding-bottom:12px}.file-title a{display:inline-flex;align-items:center}}
</style>
