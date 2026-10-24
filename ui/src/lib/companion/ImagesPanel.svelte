<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ImageCountField from './ImageCountField.svelte';
	import { tr } from './preferences.svelte';
	import { panelStorageKey,readPanelStorage } from './panel-storage';
	type Api = (route: string, options?: RequestInit) => Promise<any>;
	type Job = { id: string; status: string; prompt: string; seed: number; format: string; width?: number; height?: number; workflowId: string; workflowLabel?: string; queuedLocally?: boolean; promptId?: string; error?: string; image?: any; loras?: { name?: string; strength?: number }[]; modelPolicy?: string; queuePosition?: number };
	type Track = { requestId: string; kind: 'direct' | 'retry'; chatId?: string; messageId?: string; jobId?: string; job?: Job; issue?: string; terminal?: boolean };
	let { projectId, chatId, request, instanceId = 'prototype', syntheticComfyUI = false }: { projectId: string; chatId?: string; instanceId?: string; syntheticComfyUI?: boolean; request: Api; onAttach?: (attachment: any) => void } = $props();
	let settings = $state<any>(null), workflowId = $state(''), prompt = $state(''), seed = $state('42'), format = $state('square'), negativePrompt = $state('');
	let imageCount = $state(1);
	let tracks = $state<Track[]>([]), gallery = $state<Job[]>([]), galleryTotal = $state(0), nextCursor = $state<string | null>(null);
	let busy = $state(false), syncing = $state(false), failure = $state(''), notice = $state(''), ready = $state(false);
	let loadedProject = '', loadedInstance = '', epoch = 0;
	let mounted = $state(false);
	const unresolved = $derived(tracks.some(track => !track.jobId && !track.terminal));
	const workflow = $derived(settings?.workflows?.find((item: any) => item.id === workflowId));
	const effectiveMemoryPolicy = $derived(settings?.imageMemoryPolicy?.effectiveDefaultPolicy ?? settings?.modelPolicy);
	const active = (job?: Job) => !!job && ['waiting-resource', 'submitting', 'queued', 'running'].includes(job.status);
	const storageKey = (pid = projectId) => panelStorageKey(instanceId,'image-tracking',pid);
	const draftKey = (pid = projectId) => panelStorageKey(instanceId,'image-draft',pid);
	const labels: Record<string, string> = $derived({ 'waiting-resource': tr('En attente de ressource',"Waiting for resources"), submitting: tr('Soumission au serveur',"Submitting to server"), queued: tr('Dans la file',"Queued"), running: tr('Génération en cours',"Generating"), succeeded: tr('Image prête',"Image ready"), failed: tr('Échec',"Failed"), unknown: tr('Résultat incertain',"Uncertain result"), cancelled: tr('Annulée localement',"Cancelled locally"), stopped: tr('Arrêtée',"Stopped") });
	const params = (values: Record<string, string>) => new URLSearchParams(values).toString();
	const imageUrl = (job: Job, download = false) => '/api/comfy/generation-image?' + params({ projectId, jobId: job.id, ...(download ? { download: '1' } : {}) });
	function uuid() {
		// getRandomValues reste disponible sur l'adresse HTTP du réseau local.
		const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
		const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}
	function persistTracks() {
		try { localStorage.setItem(storageKey(), JSON.stringify(tracks.slice(-100).map(({ job, ...track }) => track))); return true; }
		catch { notice = tr('Suivi local indisponible. Les images restent conservées sur le serveur.','Local tracking unavailable. Images remain stored on the server.'); return false; }
	}
	function saveDraft() {
		try { sessionStorage.setItem(draftKey(), JSON.stringify({ prompt, seed, format, workflowId, negativePrompt, imageCount })); } catch { /* Le formulaire reste disponible en mémoire. */ }
	}
	function replaceTrack(target: Track | string, patch: Partial<Track>) {
		tracks = tracks.map(track => (typeof target === 'string' ? track.requestId === target && !track.jobId : target.jobId ? track.jobId === target.jobId : track.requestId === target.requestId && !track.jobId) ? { ...track, ...patch } : track); persistTracks();
	}
	function ingestChat(chat: any, pid: string, token: number) {
		if (pid !== projectId || token !== epoch) return;
		for (const message of chat.messages ?? []) for (const job of message.imageGenerations ?? []) {
			const requestId = message.imageRetry?.requestId ?? message.requestId ?? `recovered-${job.id}`;
			let index = tracks.findIndex(track => track.jobId === job.id);
			if(index < 0) index = tracks.findIndex(track => track.requestId === requestId && !track.jobId);
			const patch: Track = { requestId, kind: message.imageRetry ? 'retry' : 'direct', chatId: chat.id, messageId: message.id, jobId: job.id, job, terminal: false };
			if (index < 0) tracks = [...tracks, patch]; else tracks = tracks.map((track, i) => i === index ? { ...track, ...patch, issue: undefined } : track);
		}
		persistTracks();
	}
	async function loadChat(id: string, pid: string, token: number) {
		const chat = await request('/api/conversation?' + params({ projectId: pid, id, limit: '100' }));
		ingestChat(chat, pid, token); return chat;
	}
	async function recover(track: Track, pid: string, token: number) {
		if (track.chatId && track.messageId && track.jobId) {
			const job = await request('/api/comfy/generation?' + params({ projectId: pid, chatId: track.chatId, messageId: track.messageId, jobId: track.jobId }));
			if (pid === projectId && token === epoch) replaceTrack(track, { job, issue: undefined });
			return;
		}
		let id = track.chatId;
		if (track.kind === 'direct') {
			const receipt = await request('/api/chat-request?' + params({ projectId: pid, requestId: track.requestId })); id = receipt.id;
			if (pid !== projectId || token !== epoch) return;
			if (id) replaceTrack(track, { chatId: id });
			if (!id && ['error', 'stopped', 'completed'].includes(receipt.status)) { replaceTrack(track, { terminal: true, issue: tr('Terminé sans image : ','Finished without an image: ') + (receipt.message || tr('demande refusée avant la génération','request rejected before generation')) }); return; }
			if (!id) { replaceTrack(track, { issue: tr('Demande reçue. Le serveur prépare son suivi.','Request received. The server is preparing its tracking.') }); return; }
		}
		if (!id) return;
		const chat = await loadChat(id, pid, token);
		if (pid !== projectId || token !== epoch) return;
		const matching = chat.messages?.find((message: any) => message.requestId === track.requestId && message.role === 'assistant' || message.imageRetry?.requestId === track.requestId);
		if (!matching?.imageGenerations?.length && (matching?.imageRetry?.error || ['error', 'stopped', 'completed'].includes(matching?.outcome))) replaceTrack(track, { terminal: true, issue: tr('Terminé sans image : ','Finished without an image: ') + (matching?.imageRetry?.error || matching?.text || tr('demande arrêtée','request stopped')) });
	}
	async function loadGallery(append = false) {
		const pid = projectId, token = epoch;
		const page = await request('/api/comfy/generations?' + params({ projectId: pid, ...(append && nextCursor ? { cursor: nextCursor } : {}) }));
		if (pid !== projectId || token !== epoch) return;
		gallery = append ? [...gallery, ...(page.images ?? [])] : page.images ?? []; galleryTotal = page.total ?? gallery.length; nextCursor = page.nextCursor ?? null;
	}
	async function synchronize() {
		if (!mounted || !ready || syncing || !projectId || document.hidden) return;
		syncing = true; const pid = projectId, token = epoch;
		try {
			let changed = false;
			for (const track of [...tracks]) {
				if (track.terminal || track.job && !active(track.job) && !track.issue) continue;
				try { await recover(track, pid, token); changed = true; }
				catch (error: any) { if (pid === projectId && token === epoch) replaceTrack(track, { issue: error?.status === 404 ? tr('Suivi pas encore retrouvé. Aucun nouvel envoi automatique.','Tracking not found yet. No automatic resubmission.') : tr('Connexion interrompue. Le suivi reprendra par lecture du serveur.','Connection interrupted. Tracking resumes through server reads.') }); }
				if (pid !== projectId || token !== epoch) return;
			}
			if (changed) await loadGallery();
		} catch { if (pid === projectId && token === epoch) notice = tr('Connexion interrompue. Les travaux restent sur le serveur.',"Connection interrupted. Jobs remain on the server."); }
		finally { syncing = false; }
	}
	async function initialize(pid: string) {
		loadedProject = pid; loadedInstance = instanceId; const token = ++epoch; ready = false; settings = null; tracks = []; gallery = []; failure = ''; notice = ''; prompt = ''; negativePrompt = ''; seed = '42'; format = 'square'; workflowId = ''; imageCount = 1;
		if (!pid) return;
		try {
			const saved = JSON.parse(readPanelStorage(localStorage,instanceId,'image-tracking',pid,window.location.pathname) ?? '[]');
			if (Array.isArray(saved)) tracks = saved.filter(track => typeof track?.requestId === 'string' && ['direct', 'retry'].includes(track.kind)).slice(-100);
			const draft = JSON.parse(readPanelStorage(sessionStorage,instanceId,'image-draft',pid,window.location.pathname) ?? 'null');
			if (draft) { prompt = typeof draft.prompt === 'string' ? draft.prompt : ''; negativePrompt = typeof draft.negativePrompt === 'string' ? draft.negativePrompt : ''; seed = typeof draft.seed === 'string' ? draft.seed : '42'; format = ['square', 'portrait', 'landscape'].includes(draft.format) ? draft.format : 'square'; workflowId = typeof draft.workflowId === 'string' ? draft.workflowId : ''; }
			if (Number.isInteger(draft?.imageCount) && draft.imageCount >= 1 && draft.imageCount <= 5) imageCount = draft.imageCount;
		} catch { /* Le serveur demeure l'autorité de suivi. */ }
		try {
			const result = await request('/api/comfy/settings');
			if (pid !== projectId || token !== epoch) return;
			settings = result; if (!result.workflows?.some((item: any) => item.id === workflowId)) workflowId = result.workflowId ?? result.workflows?.[0]?.id ?? '';
			await loadGallery(); if (chatId) await loadChat(chatId, pid, token);
			if (pid !== projectId || token !== epoch) return;
			ready = true; await synchronize();
		} catch (error: any) { if (pid === projectId && token === epoch) failure = error?.message || tr('Impossible de charger les images du projet.',"Could not load project images."); }
	}
	async function submit() {
		if (busy || unresolved || !prompt.trim()) return;
		const pid = projectId, token = epoch, requestId = uuid(), selectedSeed = Number(seed);
		if (!Number.isSafeInteger(selectedSeed) || selectedSeed < 0 || selectedSeed > 4294967295) { failure = tr('La seed doit être un entier entre 0 et 4 294 967 295.',"The seed must be an integer between 0 and 4,294,967,295."); return; }
		busy = true; failure = ''; notice = tr('Demande enregistrée localement. Envoi au compagnon…',"Request saved locally. Sending to companion…"); saveDraft();
		tracks = [...tracks, { requestId, kind: 'direct' }];
		if(!persistTracks()){tracks=tracks.filter(track=>track.requestId!==requestId);failure=tr('Aucun envoi effectué. Autorise le stockage local pour conserver le suivi avant de générer.','Nothing was sent. Allow local storage to preserve tracking before generating.');busy=false;return;}
		try {
			const result = await request('/api/comfy/generate', { method: 'POST', body: JSON.stringify({ requestId, projectId: pid, ...(chatId?.startsWith('web-') ? { sessionId: chatId } : {}), prompt: prompt.trim(), workflowId, seed: selectedSeed, format, imageCount, ...(workflow?.negativePrompt && negativePrompt ? { negativePrompt } : {}) }) });
			if (pid !== projectId || token !== epoch) return;
			const generations: Job[] = result.generations?.length ? result.generations : result.generation ? [result.generation] : [];
			if (generations.length) ingestChat({ id: result.id, messages: [{ id: result.messageId, requestId, imageGenerations: generations }] }, pid, token);
			else replaceTrack(requestId, { chatId: result.id, messageId: result.messageId });
			notice = tr('Demande reçue par le serveur. Tu peux quitter puis retrouver son suivi.',"Request received by the server. You can leave and return to its tracking."); await loadGallery();
		} catch (error: any) {
			if (pid === projectId && token === epoch) { const rejected=error?.status>=400&&error.status<500&&![408,409].includes(error.status);failure = error?.message || tr('Connexion interrompue. Vérifie le suivi avant toute nouvelle demande.','Connection interrupted. Check tracking before making a new request.');replaceTrack(requestId,{terminal:rejected,issue:rejected?tr('Demande refusée. Aucun travail image reçu.','Request rejected. No image job accepted.'):tr('Envoi à vérifier par lecture du serveur. Aucun renvoi automatique.','Check submission through server reads. No automatic resubmission.')}); }
		} finally { busy = false; }
	}
	async function act(track: Track, operation: 'cancel' | 'same' | 'new') {
		if (busy || !track.job || !track.chatId || !track.messageId) return;
		busy = true; failure = ''; const pid = projectId, token = epoch, requestId = uuid();
		const owner = { projectId: pid, chatId: track.chatId, messageId: track.messageId, jobId: track.job.id };
		if (operation !== 'cancel') { tracks = [...tracks, { requestId, kind: 'retry', chatId: track.chatId }]; if(!persistTracks()){tracks=tracks.filter(item=>item.requestId!==requestId);failure=tr('Aucune relance effectuée : suivi local indisponible.','No retry submitted: local tracking unavailable.');busy=false;return;} }
		try {
			const result = await request('/api/comfy/generation/' + (operation === 'cancel' ? 'cancel' : 'retry'), { method: 'POST', body: JSON.stringify({ ...owner, ...(operation === 'cancel' ? {} : { seedMode: operation, requestId }) }) });
			if (pid !== projectId || token !== epoch) return;
			if (operation === 'cancel') { replaceTrack(track, { job: result }); notice = tr('Image retirée de la file locale.',"Image removed from the local queue."); }
			else { replaceTrack(requestId, { job: result.job, jobId: result.job?.id, chatId: result.chatId, messageId: result.messageId }); notice = tr('Nouvelle demande de variante reçue.',"New variation request received."); }
			await loadGallery();
		} catch (error: any) { if (pid === projectId && token === epoch) { failure = error?.message || tr('Action non confirmée. Vérifie le suivi.','Action unconfirmed. Check tracking.');if(operation!=='cancel'){const rejected=error?.status>=400&&error.status<500&&![408,409].includes(error.status);replaceTrack(requestId,{terminal:rejected,issue:rejected?tr('Relance refusée. Aucun nouveau travail reçu.','Retry rejected. No new job accepted.'):tr('Relance à vérifier. Aucun nouvel envoi automatique.','Check retry tracking. No automatic resubmission.')});} } }
		finally { busy = false; }
	}
	function prepare(job: Job) { prompt = job.prompt; workflowId = job.workflowId; seed = String(job.seed); format = job.format; negativePrompt = ''; imageCount = 1; saveDraft(); notice = tr('Prompt, workflow, format et seed repris pour une image. Vérifie les autres réglages puis lance explicitement la génération.',"Prompt, workflow, format and seed restored for one image. Review other settings, then explicitly start generation."); document.getElementById('image-prompt')?.focus(); }
	$effect(() => { const pid = projectId; if (mounted && (pid !== loadedProject || instanceId !== loadedInstance)) void initialize(pid); });
	$effect(() => { const id = chatId, pid = projectId; if (mounted && ready && id) void loadChat(id, pid, epoch).catch(() => { notice = tr('Le suivi de cette conversation sera revérifié à la prochaine connexion.',"This conversation’s tracking will be checked again when the connection resumes."); }); });
	onMount(() => {
		mounted = true; void initialize(projectId);
		const timer = setInterval(() => void synchronize(), 1800), resume = () => void synchronize();
		window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume);
		return () => { mounted = false; ++epoch; clearInterval(timer); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); };
	});
</script>

<section class="images-panel" aria-label={tr('Atelier images ComfyUI',"ComfyUI image workspace")}>
	<header><div><h2>{tr('Atelier images',"Image workspace")}</h2><p>{tr('Créer, suivre et retrouver les images de ce projet.',"Create, track and find this project’s images.")}</p></div><Button variant="outline" disabled={syncing || !ready} onclick={() => { notice = tr('Vérification du suivi sur le serveur…',"Checking server tracking…"); void synchronize(); }}>{tr('Actualiser le suivi',"Refresh tracking")}</Button></header>
	<p class="fixture-label">{syntheticComfyUI ? tr('Prototype isolé · ComfyUI simulé · aucune génération sur le GPU',"Isolated prototype · simulated ComfyUI · no GPU generation") : tr('ComfyUI du compagnon · génération réelle sur demande',"Companion ComfyUI · real generation on request")}</p>
	{#if failure}<p class="feedback error" role="alert">{failure}</p>{/if}{#if notice}<p class="feedback" role="status">{notice}</p>{/if}
	{#if !projectId}<p class="empty">{tr('Choisis un projet pour ouvrir son atelier.',"Choose a project to open its workspace.")}</p>{:else}
	<div class="atelier"><form onsubmit={event => { event.preventDefault(); void submit(); }} oninput={() => queueMicrotask(saveDraft)}>
		<h3>{tr('Nouvelle image',"New image")}</h3><label for="image-workflow">Workflow</label><select id="image-workflow" bind:value={workflowId} disabled={busy || !ready}>{#each settings?.workflows ?? [] as item}<option value={item.id}>{item.label}</option>{/each}</select>
		<label for="image-prompt">{tr('Description de l’image',"Image description")}</label><textarea id="image-prompt" bind:value={prompt} maxlength="6000" rows="5" placeholder={tr('Décris le sujet, la lumière et la composition…',"Describe the subject, lighting and composition…")} required disabled={busy}></textarea>
		{#if workflow?.negativePrompt}<label for="image-negative">{tr('Éléments à éviter',"Elements to avoid")}</label><textarea id="image-negative" bind:value={negativePrompt} rows="2" disabled={busy}></textarea>{/if}
		<div class="fields"><div><label for="image-seed">Seed</label><input id="image-seed" type="text" inputmode="numeric" pattern="[0-9]+" bind:value={seed} disabled={busy} required /></div><div><label for="image-format">Format</label><select id="image-format" bind:value={format} disabled={busy}><option value="square">{tr('Carré · 1024 × 1024',"Square · 1024 × 1024")}</option><option value="portrait">{tr('Portrait · 832 × 1216',"Portrait · 832 × 1216")}</option><option value="landscape">{tr('Paysage · 1216 × 832',"Landscape · 1216 × 832")}</option></select></div></div>
		<ImageCountField id="atelier-image-count" bind:value={imageCount} disabled={busy || !ready || !settings?.enabled} onValueChange={()=>queueMicrotask(saveDraft)}/>
		{#if settings}<p class="settings-meta">{settings.enabled ? tr('Connecteur activé',"Connector enabled") : tr('Connecteur désactivé',"Connector disabled")} · {tr('Modèle texte :','Text model:')} {effectiveMemoryPolicy==='unload'?tr('décharger','unload'):effectiveMemoryPolicy==='alternate'?tr('alterner','alternate'):tr('conserver','keep')} · {tr('Nettoyage après workflow :','Cleanup after workflow:')} {settings.memoryCleanup ? tr('oui',"yes") : tr('non',"no")}</p>{#if settings.imageMemoryPolicy?.defaultAdjusted}<p class="settings-meta">{tr("Le modèle texte reste chargé : les travaux locaux alternent, sans déchargement GPU confirmé.","The text model stays loaded: local work alternates, with no confirmed GPU unload.")}</p>{/if}{#if settings.queuePaused}<p class="feedback error">{tr('La file est suspendue après une soumission incertaine. Vérification côté serveur nécessaire.',"The queue is paused after an uncertain submission. Server verification is required.")}</p>{/if}{/if}
		<Button type="submit" disabled={busy || !ready || !settings?.enabled || !prompt.trim() || unresolved || settings?.queuePaused}>{busy ? tr('Envoi en cours…',"Sending…") : syntheticComfyUI ? tr(imageCount===1?'Générer une image de test':`Générer ${imageCount} images de test`,imageCount===1?'Generate a test image':`Generate ${imageCount} test images`) : tr(imageCount===1?'Générer une image':`Générer ${imageCount} images`,imageCount===1?'Generate an image':`Generate ${imageCount} images`)}</Button>
		{#if unresolved}<p class="settings-meta">{tr('Une demande attend confirmation. « Actualiser le suivi » consulte son état sans relancer la génération.',"A request awaits confirmation. Refresh tracking checks its state without generating again.")}</p>{/if}
	</form><div class="tracking" aria-live="polite"><h3>{tr('Suivi conservé sur le serveur',"Tracking preserved on the server")}</h3>{#if !tracks.length}<p class="empty">{tr('Les travaux apparaîtront ici. Fermer l’interface n’annule pas un travail reçu.',"Jobs will appear here. Closing the interface does not cancel an accepted job.")}</p>{/if}
		{#each [...tracks].reverse() as track (track.jobId || track.requestId)}<article class="job"><div class="job-heading"><strong>{track.job ? labels[track.job.status] ?? track.job.status : track.terminal ? tr('Terminée sans image','Finished without an image') : tr('Vérification de l’envoi','Checking submission')}</strong><span class="request-id" title={track.requestId}>{track.requestId.slice(0, 8)}</span></div>
			{#if track.job}<p class="job-prompt">{track.job.prompt}</p><p class="settings-meta">{track.job.workflowLabel ?? track.job.workflowId} · seed {track.job.seed} · {track.job.width} × {track.job.height}{track.job.queuePosition ? ' · position ' + track.job.queuePosition : ''}</p>
				{#if track.job.status === 'succeeded' && track.job.image}<a href={imageUrl(track.job)} target="_blank" rel="noreferrer" aria-label={tr('Ouvrir l’image',"Open image")}><img src={imageUrl(track.job)} alt={track.job.prompt} loading="lazy" /></a>{/if}
				{#if track.job.error}<p class="job-error">{track.job.error}</p>{/if}
				<div class="actions">{#if track.job.status === 'queued' && track.job.queuedLocally && !track.job.promptId}<Button size="sm" variant="outline" disabled={busy} onclick={() => void act(track, 'cancel')}>{tr('Annuler l’attente locale',"Cancel local waiting")}</Button>{/if}
				{#if ['succeeded','failed','cancelled'].includes(track.job.status)}<Button size="sm" variant="outline" disabled={busy || unresolved} onclick={() => void act(track, 'same')}>{tr('Relancer · même seed',"Retry · same seed")}</Button><Button size="sm" variant="outline" disabled={busy || unresolved} onclick={() => void act(track, 'new')}>{tr('Relancer · nouvelle seed',"Retry · new seed")}</Button>{/if}
				{#if track.job.status === 'succeeded' && track.job.image}<a class="download" href={imageUrl(track.job, true)} download>{tr('Télécharger',"Download")}</a>{/if}</div>
			{/if}{#if track.issue}<p class="job-error">{track.issue}</p>{/if}
		</article>{/each}
	</div></div>
	<div class="gallery-heading"><div><h3>{tr('Galerie du projet',"Project gallery")}</h3><p>{galleryTotal} {tr(galleryTotal>1?'images conservées':'image conservée',galleryTotal>1?'saved images':'saved image')}</p></div>{#if gallery.length}<a class="download" href={'/api/comfy/images.zip?' + params({ projectId }) + gallery.slice(0, 20).map(job => '&jobId=' + encodeURIComponent(job.id)).join('')} download>{tr('Télécharger','Download')} {Math.min(20, gallery.length)} {tr(gallery.length>1?'images en ZIP':'image en ZIP',gallery.length>1?'images as ZIP':'image as ZIP')}</a>{/if}</div>
	{#if !gallery.length}<p class="empty">{tr('Les images terminées resteront accessibles ici après reconnexion.',"Completed images remain accessible here after reconnecting.")}</p>{/if}
	<div class="gallery">{#each gallery as job (job.id)}<article class="gallery-item"><a href={imageUrl(job)} target="_blank" rel="noreferrer" aria-label={tr('Ouvrir : ','Open: ') + job.prompt}><img src={imageUrl(job)} alt={job.prompt} loading="lazy" /></a><div><p>{job.prompt}</p><p class="settings-meta">{job.workflowLabel ?? job.workflowId} · seed {job.seed}</p><div class="actions"><Button size="sm" variant="outline" disabled={busy} onclick={() => prepare(job)}>{tr('Préparer une variante','Prepare a variation')}</Button><a class="download" href={imageUrl(job, true)} download>{tr('Télécharger',"Download")}</a></div></div></article>{/each}</div>
	{#if nextCursor}<Button variant="outline" disabled={syncing} onclick={() => void loadGallery(true).catch((error: any) => failure = error.message)}>Afficher plus d’images</Button>{/if}{/if}
</section>

<style>
	.images-panel{height:100%;overflow:auto;padding:24px;color:var(--foreground);font-size:14px}header{display:flex;gap:16px;align-items:center;justify-content:space-between;margin-bottom:14px}h2{font-size:21px;font-weight:600;margin:0 0 5px}h3{font-size:15px;font-weight:600;margin:0 0 14px}p{margin:0;line-height:1.5;color:var(--muted-foreground)}header p,.gallery-heading p{font-size:13px}.fixture-label{display:inline-block;border:1px solid var(--border);border-radius:5px;font-size:11px;padding:4px 8px;margin-bottom:18px;background:var(--muted)}.feedback{padding:12px 14px;border:1px solid var(--border);border-radius:8px;background:var(--muted);color:var(--foreground);margin-bottom:14px;overflow-wrap:anywhere}.error{border-color:#b95353;color:#b32929}.atelier{display:grid;grid-template-columns:minmax(240px,380px) minmax(0,1fr);gap:24px;padding-bottom:28px;border-bottom:1px solid var(--border)}form{min-width:0}form label{display:block;font-size:12px;font-weight:500;margin:14px 0 7px}textarea,select,input{width:100%;border:1px solid var(--border);border-radius:7px;padding:10px;background:var(--background);color:inherit;font-size:13px}textarea{resize:vertical;line-height:1.6}textarea:focus-visible,select:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid var(--ring);outline-offset:2px}.fields{display:grid;grid-template-columns:minmax(80px,1fr) minmax(120px,1.4fr);gap:12px}.settings-meta{font-size:11px;line-height:1.6;margin:10px 0 12px;overflow-wrap:anywhere}.tracking{min-width:0}.tracking>h3{margin-bottom:12px}.job{border:1px solid var(--border);border-radius:9px;padding:15px;margin-bottom:12px;background:var(--background)}.job-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px}.request-id{font:10px ui-monospace,Consolas,monospace;color:var(--muted-foreground)}.job-prompt{font-size:13px;color:var(--foreground);margin-top:9px;overflow-wrap:anywhere}.job img{max-height:270px;max-width:100%;object-fit:contain;border-radius:6px;margin:6px 0 12px}.job-error{font-size:12px;overflow-wrap:anywhere;margin-top:8px}.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.download{font-size:12px;text-decoration:underline}.empty{padding:18px 0;font-size:13px}.gallery-heading{display:flex;gap:15px;align-items:center;justify-content:space-between;margin:26px 0 18px}.gallery-heading h3{margin-bottom:5px}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;margin-bottom:20px}.gallery-item{border:1px solid var(--border);border-radius:9px;overflow:hidden;min-width:0}.gallery-item>a{display:block;background:var(--muted)}.gallery-item img{width:100%;height:210px;object-fit:contain}.gallery-item>div{padding:13px}.gallery-item p{font-size:12px;overflow-wrap:anywhere}.gallery-item .settings-meta{font-size:11px}.images-panel :global(button:disabled){opacity:.5}@media(max-width:800px){.atelier{grid-template-columns:1fr;gap:22px}.tracking{max-height:none}}@media(max-width:520px){.images-panel{padding:16px}header{flex-wrap:wrap;align-items:flex-start}.fields{grid-template-columns:1fr}.gallery-heading{align-items:flex-start;flex-direction:column}.gallery{grid-template-columns:1fr}.gallery-item img{height:260px}}
	@media(max-width:720px){.images-panel :global(button),select,input,.download{min-height:44px}.download{display:inline-flex;align-items:center}}
</style>
