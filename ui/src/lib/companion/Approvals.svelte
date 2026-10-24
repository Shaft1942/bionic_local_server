<script lang="ts">
	import { onMount } from 'svelte';
	import { ShieldCheck, Globe, Code, RefreshCw } from '@lucide/svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { tr } from './preferences.svelte';
	let { request, projectId, chat, message, locked = false, onConversationChange }: {
		request:(route:string,options?:RequestInit)=>Promise<any>;projectId:string;chat:any;message?:any;locked?:boolean;language?:'fr'|'en';onConversationChange?:(next:any|null)=>void|Promise<void>;onNavigate?:(target:any)=>void;
	} = $props();
	let busy = $state<Record<string,boolean>>({}), uncertain = $state<Record<string,boolean>>({}), feedback = $state<Record<string,string>>({}), states = $state<Record<string,string>>({}), now = $state(Date.now());
	const rows = $derived((message?[message]:chat?.messages||[]).flatMap((item:any)=>(item.approvals||[]).map((approval:any)=>({approval,message:item}))));
	const stamp = (approval:any) => JSON.stringify({id:approval.id,projectId:approval.projectId,chatId:approval.chatId,kind:approval.kind,runtime:approval.runtime,cwd:approval.cwd,directory:approval.directory,code:approval.code,tool:approval.tool,parameters:approval.parameters,host:approval.host,createdAt:approval.createdAt,expiresAt:approval.expiresAt});
	function label(status:string) { const labels:Record<string,string>={pending:tr('En attente de votre décision','Awaiting your decision'),approved:tr('Autorisé','Approved'),denied:tr('Refusé','Denied'),expired:tr('Validation expirée','Approval expired'),cancelled:tr('Validation annulée','Approval cancelled')};return labels[status]||status; }
	function executionLabel(status:string){const labels:Record<string,string>={running:tr('Exécution en cours','Running'),completed:tr('Exécution terminée','Execution completed'),failed:tr('Exécution en échec','Execution failed'),interrupted:tr('Exécution interrompue','Execution interrupted'),stopped:tr('Exécution arrêtée','Execution stopped')};return labels[status]||status;}
	function canDecide(row:any) { const approval=row.approval;return !locked&&!chat?.readOnly&&!row.message?.fromFork&&!approval.historical&&approval.projectId===projectId&&approval.chatId===chat?.id&&approval.status==='pending'&&!states[approval.id]&&now<approval.expiresAt&&!uncertain[approval.id]; }
	async function fresh(pid:string,id:string) { return request('/api/conversation?'+new URLSearchParams({projectId:pid,id,limit:'100'})); }
	async function recheck(approval:any) {
		if(busy[approval.id])return;const pid=projectId,id=chat?.id;busy={...busy,[approval.id]:true};
		try {
			const current=await fresh(pid,id), found=(current.messages||[]).flatMap((item:any)=>item.approvals||[]).find((item:any)=>item.id===approval.id);
			if(pid!==projectId||id!==chat?.id)return;
			if(!found)throw Error(tr('Cette validation n’est plus disponible. Aucun accord renvoyé.','This approval is no longer available. No decision was sent again.'));
			if(stamp(found)!==stamp(approval)){await onConversationChange?.(current);throw Error(tr('La proposition a changé. Relis la version actualisée avant de décider.','The proposal changed. Review its current version before deciding.'));}
			uncertain={...uncertain,[approval.id]:false};states={...states,[approval.id]:found.status==='pending'?'':found.status};feedback={...feedback,[approval.id]:tr('État relu sur le serveur. Aucun nouvel accord envoyé.','Server state checked. No new approval was sent.')};await onConversationChange?.(current);
		}catch(error:any){feedback={...feedback,[approval.id]:error?.message||tr('Impossible de relire la validation.','Unable to read approval state.')};}
		finally{busy={...busy,[approval.id]:false};}
	}
	async function decide(row:any,decision:'approve'|'deny') {
		const approval=row.approval;if(!canDecide(row)||busy[approval.id])return;
		const pid=projectId,id=chat.id;busy={...busy,[approval.id]:true};feedback={...feedback,[approval.id]:''};let submitted=false;
		try {
			// Re-read the frozen proposal before a human decision. Displayed code cannot be substituted by the client.
			const current=await fresh(pid,id), currentMessage=(current.messages||[]).find((item:any)=>item.id===row.message.id), exact=currentMessage?.approvals?.find((item:any)=>item.id===approval.id);
			if(pid!==projectId||id!==chat?.id)return;
			if(!exact||exact.status!=='pending'||currentMessage.fromFork||stamp(exact)!==stamp(approval)||Date.now()>=exact.expiresAt){await onConversationChange?.(current);throw Error(tr('Validation expirée, déjà traitée ou proposition modifiée. Aucun accord envoyé.','Approval expired, already handled or changed. No decision was sent.'));}
			submitted=true;uncertain={...uncertain,[approval.id]:true};
			const result=await request('/api/tool-approval',{method:'POST',body:JSON.stringify({id:approval.id,projectId:pid,chatId:id,decision})});
			if(pid!==projectId||id!==chat?.id)return;
			states={...states,[approval.id]:result.status};uncertain={...uncertain,[approval.id]:false};feedback={...feedback,[approval.id]:label(result.status)};
			try{await onConversationChange?.(await fresh(pid,id));}catch{feedback={...feedback,[approval.id]:tr('Décision reçue. Le résultat d’exécution sera retrouvé par relecture.','Decision received. Read the server again to recover the execution result.')};}
		}catch(error:any){if(pid===projectId&&id===chat?.id)feedback={...feedback,[approval.id]:(error?.message||tr('Décision non confirmée.','Decision unconfirmed.'))+(submitted?tr(' Vérifie le suivi ; aucun renvoi automatique.',' Check the status; nothing is sent again automatically.'):'')};}
		finally{busy={...busy,[approval.id]:false};}
	}
	onMount(()=>{const timer=setInterval(()=>now=Date.now(),1000);return()=>clearInterval(timer);});
</script>

{#each rows as row (row.approval.id)}
	{@const approval=row.approval}
	{@const web=approval.kind==='web'}
	<section class="approval-card" aria-label={web?tr('Validation de la requête Internet','Web request approval'):tr('Validation du script','Script approval')} data-approval-id={approval.id}>
		<header>{#if web}<Globe size={17}/>{:else}<Code size={17}/>{/if}<h3>{web?tr('Requête Internet à valider','Review web request'):tr('Script à valider','Review script')}</h3><span>{label(states[approval.id]||(approval.status==='pending'&&now>=approval.expiresAt?'expired':approval.status))}</span></header>
		<p class="approval-source">{tr('Projet','Project')} : {approval.projectId} · {tr('Conversation','Conversation')} : {approval.chatId}<br/>{tr('Demande','Request')} : {row.message.requestId||tr('historique','history')}{#if row.message.model||approval.model} · {tr('Modèle','Model')} : {row.message.model||approval.model}{/if}</p>
		{#if web}<p>{approval.host}</p><pre>{JSON.stringify({tool:approval.tool,...approval.parameters},null,2)}</pre><p>{tr('Cet accord porte sur cette requête exacte et les données affichées.','This decision applies to this exact request and the displayed data.')}</p>
		{:else}<p>{approval.runtime} · {approval.cwd||approval.directory||tr('Dossier du projet','Project folder')}</p><pre>{approval.code||''}</pre><p>{tr('Ce code exact s’exécute avec les droits du compte du PC. Le dossier du projet ne constitue pas un bac à sable.','This exact code runs with the PC account permissions. The project folder is not a sandbox.')}</p>{/if}
		{#if approval.executionStatus}<p class="execution-state"><ShieldCheck size={15}/>{executionLabel(approval.executionStatus)}</p>{/if}
		{#if canDecide(row)}<div class="approval-buttons"><Button disabled={busy[approval.id]} onclick={()=>void decide(row,'deny')} variant="outline">{tr('Refuser','Deny')}</Button><Button disabled={busy[approval.id]} onclick={()=>void decide(row,'approve')}>{web?tr('Autoriser cette requête','Approve this request'):tr('Exécuter ce code','Run this code')}</Button></div>{/if}
		{#if uncertain[approval.id]}<div class="approval-buttons"><Button variant="outline" disabled={busy[approval.id]} onclick={()=>void recheck(approval)}><RefreshCw size={14}/>{tr('Vérifier la décision','Check decision')}</Button></div>{/if}
		{#if row.message.fromFork||approval.historical}<p>{tr('Journal historique : aucune autorisation réutilisable.','Historical record: no reusable approval.')}</p>{/if}
		{#if feedback[approval.id]}<p class="approval-feedback" role="status">{feedback[approval.id]}</p>{/if}
	</section>
{/each}

<style>
	.approval-card{padding:16px;border:1px solid var(--border);border-radius:10px;background:var(--muted);font-size:13px;margin:14px 0;overflow-wrap:anywhere}.approval-card header{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.approval-card h3{font-size:14px;font-weight:600;margin:0}.approval-card header span{margin-left:auto;color:var(--muted-foreground);font-size:12px}.approval-card p{line-height:1.6;margin:10px 0}.approval-source{font-size:11px;color:var(--muted-foreground)}pre{background:var(--background);border:1px solid var(--border);border-radius:7px;padding:12px;max-height:380px;overflow:auto;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.approval-buttons,.execution-state{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}.approval-feedback{font-size:12px}.approval-card :global(button:disabled){opacity:.5}@media(max-width:720px){.approval-card{padding:12px}.approval-card :global(button){min-height:44px}.approval-buttons :global(button){white-space:normal;text-align:left}}
</style>
