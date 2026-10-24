<script lang="ts">
  import { onMount,tick } from 'svelte';
  import { Check,X,Folder,RefreshCw } from '@lucide/svelte';
  import { tr } from './preferences.svelte';
  type Operation={operation:'rename'|'move'|'fork'|'delete';projectId:string;id:string;name?:string;targetProjectId?:string;startedAt:number};
  let { request,projectId,chat,projects,instanceId,locked=false,beforeChange,onChange,onEditingChange,onFailure }: {
    request:(route:string,options?:RequestInit)=>Promise<any>;projectId:string;chat:any;projects:any[];instanceId:string;locked?:boolean;
    beforeChange:()=>void;onChange:(next:any)=>Promise<void>;onEditingChange:(value:boolean)=>void;onFailure:(message:string)=>void;
  }=$props();
  let editing=$state(false),name=$state(''),destination=$state(''),busy=$state(false),pending=$state<Operation|null>(null),mounted=false,scope='';
  let input=$state<HTMLInputElement>(),titleButton=$state<HTMLButtonElement>(),projectMenu=$state<HTMLDetailsElement>(),projectTrigger=$state<HTMLElement>();
  const currentProject=$derived(projects.find(project=>project.id===projectId));
  const unassigned=$derived(projects.find(project=>project.id==='companion-unassigned'&&project.isUnassigned)||projects.find(project=>project.isUnassigned));
  const projectName=$derived(currentProject?.isUnassigned?tr('Sans projet','Without a project'):currentProject?.name||tr('Projet indisponible','Project unavailable'));
  const title=$derived(chat?.name||tr('Nouveau chat','New chat'));
  const key=(pid=projectId,id=chat?.id)=>`bionic:conversation-operation:${instanceId}:${pid}:${id}`;
  function readPending(){try{const value=JSON.parse(sessionStorage.getItem(key())||'null');return value&&['rename','move','fork','delete'].includes(value.operation)&&value.projectId===projectId&&value.id===chat?.id?value as Operation:null;}catch{return null;}}
  function clear(operation:Operation){sessionStorage.removeItem(key(operation.projectId,operation.id));if(operation.projectId===projectId&&operation.id===chat?.id)pending=null;}
  function query(pid:string,id:string){return '/api/conversation?'+new URLSearchParams({projectId:pid,id,limit:'100'});}
  async function focusTitle(){await tick();if(pending)document.getElementById('conversation-header-recover')?.focus();else titleButton?.focus();}
  async function edit(){if(!chat?.id||locked||busy||pending)return;name=title;editing=true;onEditingChange(true);await tick();input?.focus();input?.select();}
  async function cancel(){editing=false;onEditingChange(false);await focusTitle();}
  function closeProject(){if(projectMenu)projectMenu.open=false;}
  async function settle(operation:Operation,next:any){
    if(next?.id!==operation.id||typeof next.projectId!=='string')throw Error(tr('Résultat non confirmé. Vérifie la modification.','Result unconfirmed. Check the change.'));
    const active=operation.projectId===projectId&&operation.id===chat?.id;clear(operation);
    if(active){await onChange(next);editing=false;onEditingChange(false);closeProject();await focusTitle();}
  }
  async function perform(operation:'rename'|'move'){
    if(!chat?.id||locked||busy)return;
    const previous=readPending();if(previous){pending=previous;onFailure(tr('Vérifie la modification précédente avant un nouvel envoi.','Check the previous change before sending another request.'));return;}
    if(operation==='rename'&&!name.trim()||operation==='move'&&(!destination||destination===projectId))return;
    const intent:Operation={operation,projectId,id:chat.id,startedAt:Date.now(),...(operation==='rename'?{name:name.trim()}:{targetProjectId:destination})};
    busy=true;onFailure('');beforeChange();
    try{
      sessionStorage.setItem(key(),JSON.stringify(intent));pending=intent;
      const result=await request('/api/conversation/'+operation,{method:'POST',body:JSON.stringify({projectId:intent.projectId,id:intent.id,...(operation==='rename'?{name:intent.name}:{targetProjectId:intent.targetProjectId})})});
      await settle(intent,result.conversation);
    }catch(error:any){
      if(error?.status>=400&&error.status<500&&error.status!==408&&pending)clear(intent);
      onFailure(error?.message||tr('Résultat non confirmé. Vérifie la modification sans la renvoyer.','Result unconfirmed. Check the change without sending it again.'));
    }finally{busy=false;}
  }
  async function recover(){
    const operation=pending||readPending();if(!operation||busy)return;
    if(!['rename','move'].includes(operation.operation)){onFailure(tr('Vérifie cette opération depuis le menu Conversation.','Check this operation from the Conversation menu.'));return;}
    busy=true;onFailure('');
    try{
      let next;
      try{next=await request(query(operation.targetProjectId||operation.projectId,operation.id));}
      catch(error:any){if(operation.operation!=='move'||error.status!==404)throw error;next=await request(query(operation.projectId,operation.id));}
      if(operation.operation==='rename'&&next.name!==operation.name||operation.operation==='move'&&next.projectId!==operation.targetProjectId){clear(operation);onFailure(tr('État relu : la modification n’a pas été appliquée. Aucun nouvel envoi.','State refreshed: the change was not applied. Nothing was sent again.'));return;}
      await settle(operation,next);
    }catch(error:any){onFailure(error?.message||tr('Relecture impossible. Aucun nouvel envoi.','Unable to read the state. Nothing was sent again.'));}
    finally{busy=false;}
  }
  function keyboard(event:KeyboardEvent){if(event.key==='Escape'&&projectMenu?.open){event.preventDefault();closeProject();projectTrigger?.focus();}}
  function outside(event:PointerEvent){if(projectMenu?.open&&event.target instanceof Node&&!projectMenu.contains(event.target))closeProject();}
  onMount(()=>{mounted=true;scope=key();pending=readPending();});
  $effect(()=>{const next=key(),current=chat;if(mounted){pending=readPending();if(next!==scope){scope=next;editing=false;onEditingChange(false);closeProject();}}});
</script>

<svelte:window onkeydown={keyboard} onpointerdown={outside}/>
<div class="conversation-header">
  {#if editing}<form class="title-editor" onsubmit={event=>{event.preventDefault();void perform('rename');}}><input bind:this={input} bind:value={name} aria-label={tr('Nom de la conversation','Conversation name')} maxlength="120" required disabled={busy||locked||!!pending} onkeydown={event=>{if(event.key==='Escape'){event.preventDefault();void cancel();}}}/><button type="submit" class="header-action" aria-label={tr('Enregistrer le titre','Save title')} title={tr('Enregistrer le titre','Save title')} disabled={busy||locked||!!pending||!name.trim()}><Check size={16}/></button><button type="button" class="header-action" aria-label={tr('Annuler le changement de titre','Cancel title change')} title={tr('Annuler le changement de titre','Cancel title change')} onclick={()=>void cancel()}><X size={16}/></button></form>
  {:else if chat?.id}<button bind:this={titleButton} type="button" class="conversation-title" data-conversation-title aria-label={tr('Renommer la conversation','Rename conversation')+': '+title} title={tr('Renommer la conversation','Rename conversation')+': '+title} disabled={busy||locked||!!pending} onclick={()=>void edit()}>{title}</button>
  {:else}<span class="conversation-title" data-conversation-title>{title}</span>{/if}
  {#if pending}<button id="conversation-header-recover" type="button" class="header-action" aria-label={tr('Vérifier la modification du titre ou du projet','Check title or project change')} title={tr('Vérifier la modification du titre ou du projet','Check title or project change')} disabled={busy} onclick={()=>void recover()}><RefreshCw size={16}/></button><span class="sr-only" role="status">{tr('Modification à vérifier sur le serveur.','Check the change on the server.')}</span>{/if}
  {#if !editing}<details bind:this={projectMenu} class="header-project"><summary bind:this={projectTrigger} data-conversation-project aria-label={tr('Projet de la conversation','Conversation project')+': '+projectName} title={tr('Projet de la conversation','Conversation project')+': '+projectName} onclick={()=>{if(!projectMenu?.open)destination=projectId;}}><Folder size={16}/><span>{projectName}</span></summary><div class="project-options"><label for="header-project-choice">{tr('Projet de la conversation','Conversation project')}</label><select id="header-project-choice" aria-label={tr('Projet de destination','Destination project')} bind:value={destination} disabled={!chat?.id||busy||locked||!!pending}>{#if unassigned}<option value={unassigned.id}>{tr('Sans projet','Without a project')}</option>{/if}{#each projects.filter(project=>!project.isUnassigned) as project}<option value={project.id}>{project.name}</option>{/each}</select><p>{!chat?.id?tr('Pour commencer dans un projet, utilise le + à côté de son nom.','To start in a project, use the + beside its name.'):chat.readOnly||chat.source==='bionic'?tr('Seul le classement local change ; l’historique natif reste intact.','Only the local organization changes; native history stays intact.'):tr('Les actions et fichiers déjà joints gardent leur projet d’origine.','Past actions and attachments retain their original project.')}</p><button type="button" class="save-project" disabled={!chat?.id||busy||locked||!!pending||!destination||destination===projectId} onclick={()=>void perform('move')}>{destination===unassigned?.id?tr('Détacher du projet','Detach from project'):tr('Rattacher au projet','Attach to project')}</button></div></details>{/if}
</div>

<style>
  .conversation-header{display:flex;align-items:center;gap:3px;min-width:0;flex:1;}.conversation-title{font:inherit;min-height:44px;min-width:0;flex:1;padding:0 5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:left;border:0;background:transparent;color:var(--foreground);line-height:44px;}.conversation-title:disabled{opacity:.7;}.title-editor{display:flex;align-items:center;gap:3px;flex:1;min-width:0;}.title-editor input{width:100%;min-width:0;flex:1;height:40px;padding:5px 8px;font:inherit;}.header-action{display:grid;place-items:center;width:44px;height:44px;flex:0 0 44px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--muted-foreground);}.header-action:hover,.conversation-title:hover{background:var(--muted);}.header-action:disabled{opacity:.5;}.header-project{position:relative;min-width:0;max-width:40%;}.header-project summary{display:flex;align-items:center;gap:5px;min-height:44px;padding:0 5px;cursor:pointer;list-style:none;font-size:11px;color:var(--muted-foreground);}.header-project summary::-webkit-details-marker{display:none;}.header-project summary>span{max-width:130px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}.header-project summary :global(svg){flex-shrink:0;}.project-options{position:fixed;z-index:40;top:62px;left:50%;transform:translateX(-50%);width:min(330px,calc(100vw - 16px));padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--background);color:var(--foreground);font-size:12px;font-weight:400;}.project-options label{display:block;margin-bottom:6px;}.project-options select{width:100%;min-height:44px;padding:8px;background:var(--background);border:1px solid var(--border);border-radius:6px;}.project-options p{font-size:11px;line-height:1.5;white-space:normal;margin:10px 0;}.save-project{width:100%;min-height:44px;padding:8px;border:1px solid var(--border);border-radius:6px;}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}@media(max-width:759px){.header-project{max-width:44px;}.header-project summary{width:40px;justify-content:center;}.header-project summary>span{display:none;}}
</style>
