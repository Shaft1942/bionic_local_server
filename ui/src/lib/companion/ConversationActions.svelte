<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { MoreHorizontal, GitBranch, Pencil, ArrowRightLeft, Trash2 } from '@lucide/svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { tr } from './preferences.svelte';
	type Target = { projectId: string; id: string; messageId?: string };
	type Mutation = { operation: 'rename'|'move'|'delete'|'fork'; projectId: string; id: string; name?: string; targetProjectId?: string; messageId?: string; knownIds?: string[]; startedAt: number };
	let { request, projectId, chat, projects = [], messageId, locked = false, compact = false, instanceId = 'companion', onConversationChange, onNavigate }: {
		request: (route:string, options?:RequestInit)=>Promise<any>; projectId:string; chat:any; projects?:any[]; messageId?:string; locked?:boolean; compact?:boolean; instanceId?:string; language?:'fr'|'en';
		onConversationChange?:(next:any|null)=>void|Promise<void>; onNavigate?:(target:Target)=>void|Promise<void>;
	} = $props();
	let form = $state<'rename'|'move'|'delete'|null>(null), name = $state(''), targetProjectId = $state(''), busy = $state(false), failure = $state(''), notice = $state(''), pending = $state<Mutation|null>(null);
	let menu=$state<HTMLDetailsElement>(), input=$state<HTMLInputElement>();
	let mounted=$state(false),loadedScope='';
	const native=$derived(chat?.readOnly||chat?.source==='bionic');
	const key = (pid=projectId,id=chat?.id) => `bionic:conversation-operation:${instanceId}:${pid}:${id}`;
	const query = (route:string, values:Record<string,string>) => route+'?'+new URLSearchParams(values);
	const scopeMatches = (operation:Mutation) => operation.projectId===projectId&&operation.id===chat?.id;
	function close() { form=null; if(menu){menu.open=false;menu.querySelector('summary')?.focus();} }
	async function edit(mode:'rename'|'move'|'delete') { form=mode;name=chat?.name||'';targetProjectId=projects.find(item=>item.id!==projectId)?.id||'';failure='';await tick();input?.focus(); }
	function readPending() { try { const value=JSON.parse(sessionStorage.getItem(key())||'null');return value&&['rename','move','delete','fork'].includes(value.operation)&&value.projectId===projectId&&value.id===chat?.id?value:null; } catch { return null; } }
	function clearPending(operation:Mutation) { sessionStorage.removeItem(key(operation.projectId,operation.id));if(scopeMatches(operation))pending=null; }
	async function notify(next:any|null, operation:Mutation, navigate=false) {
		if(!scopeMatches(operation))return;
		await onConversationChange?.(next);
		if(navigate&&next)await onNavigate?.({projectId:next.projectId||operation.projectId,id:next.id});
		close();
	}
	async function perform(operation:Mutation['operation']) {
		if(busy||locked||!chat?.id)return;
		const previous=readPending();if(previous){pending=previous;failure=tr('Vérifie la modification précédente avant un nouvel envoi.','Check the previous change before sending another request.');return;}
		const mutation:Mutation={operation,projectId,id:chat.id,startedAt:Date.now(),...(operation==='rename'?{name:name.trim()}:{}),...(operation==='move'?{targetProjectId}:{}),...(operation==='fork'&&messageId?{messageId}:{})};
		busy=true;failure='';notice='';
		try {
			if(operation==='fork'){const listed=await request(query('/api/sessions',{projectId}));mutation.knownIds=(listed.sessions||[]).map((item:any)=>item.id);}
			// Record the intention before POST. A lost response never authorizes a second fork.
			sessionStorage.setItem(key(),JSON.stringify(mutation));pending=mutation;
			const body=operation==='fork'?{projectId:mutation.projectId,chatId:mutation.id,...(mutation.messageId?{messageId:mutation.messageId}:{})}:{projectId:mutation.projectId,id:mutation.id,...(operation==='rename'?{name:mutation.name}:{}),...(operation==='move'?{targetProjectId:mutation.targetProjectId}:{})};
			const result=await request('/api/conversation/'+operation,{method:'POST',body:JSON.stringify(body)});
			clearPending(mutation);
			if(operation==='delete')await notify(null,mutation);
			else if(operation==='fork'){await notify(result,mutation,true);}
			else await notify(result.conversation,mutation,operation==='move');
			notice=tr('Modification enregistrée.','Change saved.');
		} catch(error:any) {
			if(error?.status>=400&&error.status<500&&pending){clearPending(mutation);}
			failure=error?.message||tr('Résultat non confirmé. Relis le serveur avant toute nouvelle action.','Result unconfirmed. Read the server state before taking another action.');
		} finally {busy=false;}
	}
	async function recover() {
		const operation=pending||readPending();if(!operation||busy)return;busy=true;failure='';
		try {
			if(operation.operation==='fork'){
				const result=await request(query('/api/sessions',{projectId:operation.projectId}));
				const candidates=(result.sessions||[]).filter((item:any)=>!operation.knownIds?.includes(item.id)&&item.origin?.kind==='fork'&&item.origin?.id===operation.id&&(!operation.messageId||item.origin.messageId===operation.messageId));
				if(candidates.length!==1)throw Error(tr('Branche non identifiée de façon unique. Consulte les conversations ; aucun nouvel envoi n’a été fait.','The branch could not be identified uniquely. Check the conversations; nothing was sent again.'));
				const next=await request(query('/api/conversation',{projectId:operation.projectId,id:candidates[0].id,limit:'100'}));clearPending(operation);await notify(next,operation,true);
			}else{
				const pid=operation.targetProjectId||operation.projectId;
				if(operation.operation==='delete'){
					const result=await request(query('/api/sessions',{projectId:pid}));
					if((result.sessions||[]).some((item:any)=>item.id===operation.id)){clearPending(operation);notice=tr('La conversation est toujours présente. Aucune suppression relancée.','The conversation is still present. Deletion was not sent again.');return;}
					clearPending(operation);await notify(null,operation);
				}else{
					let next;
					try{next=await request(query('/api/conversation',{projectId:pid,id:operation.id,limit:'100'}));}
					catch(error:any){if(operation.operation!=='move'||error.status!==404)throw error;next=await request(query('/api/conversation',{projectId:operation.projectId,id:operation.id,limit:'100'}));}
					clearPending(operation);await notify(next,operation,operation.operation==='move');
				}
			}
			notice=tr('État retrouvé sur le serveur, sans nouvel envoi.','Server state recovered without sending again.');
		}catch(error:any){failure=error?.message||tr('Relecture impossible. Aucun nouvel envoi.','Unable to read the server. Nothing was sent again.');}finally{busy=false;}
	}
	onMount(()=>{
		loadedScope=key();pending=readPending();mounted=true;
		const keyboard=(event:KeyboardEvent)=>{if(event.key==='Escape'&&menu?.open){event.preventDefault();close();}};
		const outside=(event:MouseEvent)=>{if(menu?.open&&!event.composedPath().includes(menu)){menu.open=false;form=null;}};
		document.addEventListener('keydown',keyboard);document.addEventListener('click',outside);
		return()=>{document.removeEventListener('keydown',keyboard);document.removeEventListener('click',outside);};
	});
	$effect(()=>{const scope=key();if(mounted&&scope!==loadedScope){loadedScope=scope;pending=readPending();failure='';notice='';form=null;if(menu)menu.open=false;}});
</script>

{#if chat?.id}
	<div class="conversation-actions" class:message-actions={!!messageId} class:compact={compact&&!!messageId}>
		{#if messageId}<Button variant="ghost" size="sm" class="message-branch-button" disabled={busy||locked||!!pending} onclick={()=>void perform('fork')} aria-label={tr('Créer une branche depuis ce message','Create a branch from this message')} title={tr('Créer une branche depuis ce message','Create a branch from this message')} aria-busy={busy}><GitBranch size={16} aria-hidden="true"/>{#if !compact}{tr('Créer une branche','Branch')}{/if}</Button>
		{:else}<details bind:this={menu}>
			<summary aria-label={tr('Actions de la conversation','Conversation actions')}><MoreHorizontal size={18}/><span>{tr('Conversation','Conversation')}</span></summary>
			<div class="actions-menu">
				{#if chat.readOnly||chat.source==='bionic'}<p class="scope-note">{tr('Historique natif en lecture seule. Le classement reste local au compagnon.','Native history is read only. Organization changes stay in the companion.')}</p>{/if}
				{#if !form}<Button variant="ghost" disabled={busy||locked||!!pending} onclick={()=>void edit('rename')}><Pencil size={15}/>{tr('Renommer','Rename')}</Button><Button variant="ghost" disabled={busy||locked||!!pending||projects.filter(item=>item.id!==projectId).length===0} onclick={()=>void edit('move')}><ArrowRightLeft size={15}/>{tr('Déplacer vers un projet','Move to a project')}</Button><Button variant="ghost" disabled={busy||locked||!!pending||!chat.messages?.length} onclick={()=>void perform('fork')}><GitBranch size={15}/>{tr('Créer une branche','Create a branch')}</Button><Button variant="ghost" disabled={busy||locked||!!pending} onclick={()=>void edit('delete')}><Trash2 size={15}/>{native?tr('Masquer dans le compagnon','Hide in the companion'):tr('Supprimer la conversation','Delete conversation')}</Button>
				{:else}<form onsubmit={event=>{event.preventDefault();if(form)void perform(form);}}>
					{#if form==='rename'}<label for={'conversation-name-'+chat.id}>{tr('Nom de la conversation','Conversation name')}</label><input bind:this={input} id={'conversation-name-'+chat.id} bind:value={name} maxlength="120" required disabled={busy}/>
					{:else if form==='move'}<label for={'conversation-target-'+chat.id}>{tr('Projet de destination','Destination project')}</label><select id={'conversation-target-'+chat.id} bind:value={targetProjectId} disabled={busy}>{#each projects.filter(item=>item.id!==projectId) as item}<option value={item.id}>{item.name}</option>{/each}</select><p>{tr('La conversation changera de projet. Les actions anciennes conservent leur projet d’origine.','The conversation will move. Past actions keep their original project.')}</p>
					{:else}<p>{native?tr('Masquer cet historique dans le compagnon ? La base native reste intacte.','Hide this history in the companion? Native data stays unchanged.'):tr('Supprimer cette conversation web et son historique local ? Les fichiers du projet ne sont pas supprimés.','Delete this web conversation and its local history? Project files are retained.')}</p>{/if}
					<div class="form-actions"><Button type="submit" disabled={busy||!!pending||(form==='rename'&&!name.trim())||(form==='move'&&!targetProjectId)}>{form==='delete'?tr('Confirmer la suppression','Confirm deletion'):tr('Enregistrer','Save')}</Button><Button variant="outline" disabled={busy} onclick={()=>form=null}>{tr('Annuler','Cancel')}</Button></div>
				</form>{/if}
			</div>
		</details>{/if}
		{#if !messageId&&chat.origin?.id}<Button variant="ghost" size="sm" onclick={()=>void onNavigate?.({projectId:chat.origin.projectId||projectId,id:chat.origin.id,messageId:chat.origin.messageId})}>{tr('Voir la conversation d’origine','View source conversation')}</Button>{/if}
		{#if pending}<div class="mutation-status" role="status"><span>{tr('Modification à vérifier sur le serveur.','Check the change on the server.')}</span><Button variant="outline" size="sm" disabled={busy} onclick={()=>void recover()}>{tr('Vérifier la modification','Check change')}</Button></div>{/if}
		{#if failure}<p class="failure" role="alert">{failure}</p>{/if}{#if notice}<p class="feedback" role="status">{notice}</p>{/if}
	</div>
{/if}

<style>
	.conversation-actions.compact { display: contents; }
	.compact :global(.message-branch-button) { grid-column: 3; grid-row: 1; width: 44px; height: 44px; padding: 0; color: var(--muted-foreground); }
	.compact :global(.message-branch-button:hover), .compact :global(.message-branch-button:focus-visible) { color: var(--foreground); }
	.compact > .mutation-status, .compact > .failure, .compact > .feedback { grid-column: 1 / -1; }
	.conversation-actions{position:relative;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;min-width:0}.message-actions{margin-top:8px}details{position:relative}summary{display:flex;align-items:center;gap:7px;cursor:pointer;list-style:none;padding:8px;border-radius:6px}summary::-webkit-details-marker{display:none}summary:hover{background:var(--muted)}summary:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--ring);outline-offset:2px}.actions-menu{position:absolute;right:0;top:100%;width:min(330px,calc(100vw - 38px));padding:10px;background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:9px;box-shadow:0 8px 28px #0002;z-index:40;display:flex;flex-direction:column;gap:4px}.actions-menu :global(button){justify-content:flex-start;white-space:normal;text-align:left}label{display:block;margin:4px 0 7px;font-weight:500}input,select{width:100%;padding:9px;border:1px solid var(--border);border-radius:6px;background:var(--background);color:var(--foreground)}p{margin:8px 0;line-height:1.6;overflow-wrap:anywhere}.scope-note,.feedback{color:var(--muted-foreground)}.form-actions,.mutation-status{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px}.failure{color:var(--destructive)}.mutation-status{padding:8px;border:1px solid var(--border);border-radius:6px}.conversation-actions :global(button:disabled){opacity:.5}@media(max-width:720px){summary,.conversation-actions :global(button){min-height:44px}.actions-menu{position:fixed;top:auto;bottom:20px;right:16px;max-height:75vh;overflow:auto}}
</style>
