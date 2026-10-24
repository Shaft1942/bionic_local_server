<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ArrowUp, Plus, Search, Folder, MessageSquare, PanelLeftClose, PanelLeftOpen, Files, Image, Square, RefreshCw, Unplug, X, LogOut, Settings, Activity, ChevronDown, ChevronRight } from '@lucide/svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import Logo from '$lib/components/app/misc/Logo.svelte';
  import UserBubble from './UserBubble.svelte';
  import Markdown from './Markdown.svelte';
  import MessageImages from './MessageImages.svelte';
  import MessageStats from './MessageStats.svelte';
  import CopyMessage from './CopyMessage.svelte';
  import FilesPanel from './FilesPanel.svelte';
  import ImagesPanel from './ImagesPanel.svelte';
  import ImageCountField from './ImageCountField.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import WorkspaceDialog from './WorkspaceDialog.svelte';
  import ModelPicker from './ModelPicker.svelte';
  import LoadedModelsMenu from './LoadedModelsMenu.svelte';
  import ConversationActions from './ConversationActions.svelte';
  import WorkspacePanel from './WorkspacePanel.svelte';
  import Approvals from './Approvals.svelte';
  import ProjectAccess from './ProjectAccess.svelte';
  import { activatePreferences, preferences, tr } from './preferences.svelte';
  import { ApiError, newRequestId, post, query, request, sendStream, terminal } from './api';

  type Job = { requestId:string; projectId:string; id?:string; draftNonce?:string; status:string; phase?:string; disconnected?:boolean };
  type Draft = { text:string; updatedAt:number; attachments:any[]; model:string; reasoning:string; fileProfile:string; webAccess:boolean; webApproval:boolean; scriptAccess:boolean; imageAccess:boolean; imageWorkflowId:string; imageCount:number; imageModelPolicy:string; nonce:string };
  let authenticated=$state(false), ready=$state(false), error=$state(''), notice=$state('');
  let code=$state(''), loginBusy=$state(false);
  let projects=$state<any[]>([]), sessions=$state<any[]>([]), models=$state<any[]>([]), sessionPage=$state<any>(null), sessionWarnings=$state<string[]>([]);
  let projectId=$state(''), chat=$state<any>(null), model=$state(''), reasoning=$state('default'), inference=$state<any>(null), comfy=$state<any>(null);
  let prompt=$state(''), attachments=$state<any[]>([]), fileProfile=$state('read'), webAccess=$state(true), webApproval=$state(false), scriptAccess=$state(false), imageAccess=$state(false);
  let imageWorkflowId=$state(''), imageCount=$state(1), imageModelPolicy=$state('');
  let jobs=$state<Job[]>([]), streamingIds=$state<string[]>([]);
  let tab=$state<'chat'|'files'|'images'|'activity'|'settings'>('chat'), sidebarOpen=$state(true), search=$state(''), collapsedProjects=$state<string[]>([]);
  let projectForm=$state(false), projectName=$state(''), creatingProject=$state(false), historyBusy=$state(false), sessionsBusy=$state(false), filesDirty=$state(false);
  let instanceId=$state(''), prototypeInfo=$state<any>(null), draftNonce=$state(''), settingsVisited=$state(false), filesVisited=$state(false), imagesVisited=$state(false), activityVisited=$state(false), settingsDirty=$state(false);
  let draftKey='', storageKey='', drafts:Record<string,Draft>={};
  let controllers=new Map<string,AbortController>(), streamTexts=new Map<string,string>(), recoveryBusy=false, viewSequence=0, sessionsSequence=0, lastCatalog=0, mounted=true;
  let messageList=$state<HTMLDivElement>(), composer=$state<HTMLTextAreaElement|null>(null);
  let followReply=true;
  let modelSelectionBusy=$state(false);
  const workspaceItems=[{id:'chat',fr:'Chat',en:'Chat',icon:MessageSquare},{id:'files',fr:'Fichiers',en:'Files',icon:Files},{id:'images',fr:'Images',en:'Images',icon:Image},{id:'activity',fr:'Activité',en:'Activity',icon:Activity},{id:'settings',fr:'Paramètres',en:'Settings',icon:Settings}];
  const currentProject=$derived(projects.find(item=>item.id===projectId));
  const selectedModel=$derived(models.find(item=>item.id===model));
  const visibleSessions=$derived(sessions.filter(item=>(item.name||'').toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const currentJobs=$derived(jobs.filter(item=>item.projectId===projectId&&(item.id?item.id===chat?.id:!chat?.id&&item.draftNonce===draftNonce)));
  const currentJob=$derived(currentJobs.find(item=>item.status!=='queued')||currentJobs[0]);
  const starting=$derived(currentJobs.some(item=>!item.id));
  const dark=$derived(preferences.theme==='dark'||preferences.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);

  function persist() {
    if(!storageKey)return;
    localStorage.setItem(storageKey,JSON.stringify({projectId,chatId:chat?.id||'',jobs}));
    const draftStore=preferences.draftHours===0?sessionStorage:localStorage;
    const otherStore=preferences.draftHours===0?localStorage:sessionStorage;
    const cutoff=preferences.draftHours===0?0:Date.now()-preferences.draftHours*3600000;
    drafts=Object.fromEntries(Object.entries(drafts).filter(([,draft])=>draft.updatedAt>=cutoff));
    draftStore.setItem(storageKey+':drafts',JSON.stringify(drafts));otherStore.removeItem(storageKey+':drafts');
  }
  function saveDraft() {
    if(draftKey)drafts[draftKey]={text:prompt,updatedAt:Date.now(),attachments:$state.snapshot(attachments),model,reasoning,fileProfile,webAccess,webApproval,scriptAccess,imageAccess,imageWorkflowId,imageCount,imageModelPolicy,nonce:draftNonce};
    try{persist();}catch{error=tr('Le navigateur ne peut pas conserver le brouillon.','The browser cannot preserve this draft.');}
  }
  function switchDraft() {
    draftKey=projectId+':'+(chat?.id||'new');
    const value=drafts[draftKey];
    prompt=value?.text||'';attachments=value?.attachments||[];draftNonce=value?.nonce||newRequestId();
    model=models.some(item=>item.id===value?.model)?value!.model:models.some(item=>item.id===chat?.model)?chat.model:model;
    reasoning=value?.reasoning||chat?.reasoningByModel?.[model]||'default';
    fileProfile=currentProject?.isUnassigned?'none':value?.fileProfile||chat?.fileProfile||'read';
    webAccess=value?.webAccess??chat?.webAccess??true;webApproval=value?.webApproval??chat?.webApproval??false;
    scriptAccess=!currentProject?.isUnassigned&&(value?.scriptAccess??chat?.scriptAccess??false);
    imageAccess=value?.imageAccess??chat?.imageAccess??(comfy?.enabled===true&&comfy?.available===true);
    imageWorkflowId=value?.imageWorkflowId||chat?.imageWorkflowId||comfy?.workflowId||'';
    const restoredCount=value?.imageCount??chat?.imageCount??1;
    imageCount=Number.isInteger(restoredCount)&&restoredCount>=1&&restoredCount<=5?restoredCount:1;imageModelPolicy=value?.imageModelPolicy??chat?.imageModelPolicy??'';
  }
  function report(failure:any) {
    error=failure?.message||tr('Le compagnon est indisponible.','The companion is unavailable.');
    if(failure?.status===401){authenticated=false;chat=null;projects=[];sessions=[];for(const controller of controllers.values())controller.abort();}
  }
  async function scrollReply(){await tick();if(followReply&&messageList)messageList.scrollTop=messageList.scrollHeight;}
  function updateJob(id:string,patch:Partial<Job>){jobs=jobs.map(item=>item.requestId===id?{...item,...patch}:item);}
  function rememberGeneration(value:any,pid:string){
    for(const active of [value?.generation,...(value?.queue||[])]){
      if(!active?.requestId||terminal(active.status)||jobs.some(item=>item.requestId===active.requestId))continue;
      jobs=[...jobs,{requestId:active.requestId,projectId:pid,id:value.id,status:active.status,phase:active.phase}];
    }
  }
  async function refreshSessions(append=false){
    if(!projectId||(append&&sessionsBusy))return;const pid=projectId,sequence=++sessionsSequence;const cursor=append?sessionPage?.nextCursor:'';sessionsBusy=true;
    try{const result=await request(query('/api/sessions',{projectId:pid,limit:'100',...(cursor?{cursor}:{})}));
      if(pid!==projectId||sequence!==sessionsSequence)return;
      const extras=!append&&sessions.length>100?sessions.filter(item=>!result.sessions.some((known:any)=>known.id===item.id)):[];
      sessions=append?[...sessions,...result.sessions.filter((item:any)=>!sessions.some(known=>known.id===item.id))]:[...(result.sessions||[]),...extras];
      sessionPage=extras.length?{...sessionPage,total:result.total}:{hasMore:result.hasMore,nextCursor:result.nextCursor,total:result.total};sessionWarnings=result.warnings||[];
      for(const session of result.sessions||[])rememberGeneration(session,pid);
    }finally{if(sequence===sessionsSequence)sessionsBusy=false;}
  }
  function mergeHistory(previous:any,incoming:any,older=false){
    if(!previous||previous.id!==incoming.id||!incoming.pagination)return incoming;
    const existing=previous.messages||[],received=incoming.messages||[];
    if(older){const ids=new Set(existing.map((item:any)=>item.id));return {...previous,messages:[...received.filter((item:any)=>!ids.has(item.id)),...existing],pagination:incoming.pagination};}
    const overlap=received.findIndex((item:any)=>existing.some((known:any)=>known.id===item.id));
    if(overlap<0)return {...incoming,historyWindowReset:existing.length>0&&received.length>0};
    const first=existing.findIndex((item:any)=>item.id===received[overlap].id),prefix=existing.slice(0,first);
    return {...incoming,messages:[...prefix,...received],pagination:prefix.length?{...incoming.pagination,hasMore:previous.pagination?.hasMore===true,nextCursor:previous.pagination?.nextCursor}:incoming.pagination};
  }
  async function loadConversation(pid:string,id:string,sequence=viewSequence){
    const result=await request(query('/api/conversation',{projectId:pid,id,limit:'100'}));rememberGeneration(result,pid);
    for(const message of result.messages||[])if(message.role==='assistant'&&streamTexts.has(message.requestId))message.text=streamTexts.get(message.requestId);
    if(projectId===pid&&sequence===viewSequence&&chat?.id===id){chat=mergeHistory(chat,result);persist();await scrollReply();}
    return result;
  }
  async function olderMessages(){
    if(historyBusy||!chat?.pagination?.hasMore)return;
    const pid=projectId,id=chat.id,sequence=viewSequence,height=messageList?.scrollHeight||0,top=messageList?.scrollTop||0;historyBusy=true;
    try{const page=await request(query('/api/conversation',{projectId:pid,id,limit:'100',before:chat.pagination.nextCursor}));
      if(sequence!==viewSequence||projectId!==pid||chat?.id!==id)return;
      chat=mergeHistory(chat,page,true);followReply=false;await tick();if(messageList)messageList.scrollTop=top+messageList.scrollHeight-height;
    }catch(failure){report(failure);}finally{historyBusy=false;}
  }
  async function openSession(id:string){
    saveDraft();const sequence=++viewSequence;chat={id,messages:[]};error='';notice='';tab='chat';followReply=true;
    if(innerWidth<760)sidebarOpen=false;
    try{await loadConversation(projectId,id,sequence);if(sequence===viewSequence){switchDraft();await recover();}}catch(failure){report(failure);}
  }
  async function chooseProject(id:string){
    saveDraft();++viewSequence;projectId=id;chat=null;sessions=[];sessionPage=null;error='';notice='';tab='chat';switchDraft();persist();
    try{await refreshSessions();}catch(failure){report(failure);}
  }
  async function newChat(pid=projectId){
    if(pid!==projectId)await chooseProject(pid);else saveDraft();
    ++viewSequence;chat=null;tab='chat';notice='';error='';switchDraft();draftNonce=newRequestId();saveDraft();
    if(innerWidth<760)sidebarOpen=false;await tick();composer?.focus();
  }
  async function reloadProjects(){const result=await request('/api/projects');projects=result.projects||[];}
  async function createProject(event:SubmitEvent){
    event.preventDefault();if(!projectName.trim()||creatingProject)return;creatingProject=true;
    try{const result=await post('/api/local-projects',{name:projectName.trim()});await reloadProjects();projectForm=false;projectName='';await chooseProject(result.project.id);}
    catch(failure){report(failure);}finally{creatingProject=false;}
  }
  async function refreshEngines(reportModelFailure=true){
    const values=await Promise.allSettled([request('/api/inference/settings'),request('/api/models'),request('/api/comfy/settings')]);
    if(values[0].status==='fulfilled')inference=values[0].value;
    if(values[1].status==='fulfilled'){models=(values[1].value.models||[]).filter((item:any)=>item.type==='llm');if(!models.some(item=>item.id===model))model=models.find(item=>item.loaded)?.id||models[0]?.id||'';}else{models=[];model='';if(reportModelFailure)report(values[1].reason);}
    if(values[2].status==='fulfilled'){comfy=values[2].value;if(!imageWorkflowId)imageWorkflowId=comfy.workflowId||'';}
  }
  async function start(){
    const ping=await request('/api/ping');instanceId=ping.instanceId;prototypeInfo=ping.prototypeInfo||null;activatePreferences(instanceId);
    storageKey='bionic:llama-prototype:'+instanceId;let saved:any={};
    try{
      saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
      const draftStore=preferences.draftHours===0?sessionStorage:localStorage;
      const values=JSON.parse(draftStore.getItem(storageKey+':drafts')||'{}');
      const cutoff=preferences.draftHours===0?0:Date.now()-preferences.draftHours*3600000;
      drafts=Object.fromEntries(Object.entries(values).filter(([,value]:any)=>value&&typeof value.text==='string'&&value.updatedAt>=cutoff)) as Record<string,Draft>;
      jobs=Array.isArray(saved.jobs)?saved.jobs.filter((item:any)=>item&&/^[a-zA-Z0-9-]{16,100}$/.test(item.requestId)&&typeof item.projectId==='string'):saved.pending?.requestId?[saved.pending]:[];
    }catch{notice=tr('La restauration locale est indisponible.','Local restoration is unavailable.');}
    await reloadProjects();authenticated=true;await refreshEngines();
    projectId=projects.some(item=>item.id===saved.projectId)?saved.projectId:projects[0]?.id||'';
    if(projectId){await refreshSessions();if(saved.chatId){chat={id:saved.chatId,messages:[]};try{await loadConversation(projectId,saved.chatId);}catch(failure){chat=null;report(failure);}}switchDraft();await recover();}
    ready=true;
  }
  async function login(event:SubmitEvent){event.preventDefault();if(loginBusy)return;loginBusy=true;error='';try{await post('/api/login',{code});code='';await start();}catch(failure){report(failure);}finally{ready=true;loginBusy=false;}}
  async function logout(){try{saveDraft();await post('/api/logout',{});for(const controller of controllers.values())controller.abort();authenticated=false;chat=null;projects=[];sessions=[];}catch(failure){report(failure);}}
  function attach(file:any){
    if(attachments.length>=4){error=tr('Tu peux joindre jusqu’à quatre fichiers.','You can attach up to four files.');return;}
    if(!attachments.some(item=>item.rootId===file.rootId&&item.path===file.path))attachments=[...attachments,file];
    tab='chat';notice=tr('Fichier joint au prochain message.','File attached to the next message.');saveDraft();
  }
  function onStream(event:any,text:string,requestId:string){
    const job=jobs.find(item=>item.requestId===requestId);if(!job)return;
    if(event.type==='delta')streamTexts.set(requestId,(streamTexts.get(requestId)||'')+(event.text||''));
    if(event.type==='start'||event.type==='queued'){
      updateJob(requestId,{id:event.id,status:event.type==='queued'?'queued':'running',phase:event.phase});
      const sameView=projectId===job.projectId&&(job.id?chat?.id===job.id:!chat?.id&&draftNonce===job.draftNonce);
      if(sameView){
        chat={...(chat||{}),id:event.id,name:event.name||text.slice(0,70),messages:chat?.messages||[]};
        if(event.type==='start'&&!chat.messages.some((item:any)=>item.requestId===requestId)){
          chat.messages.push({id:requestId+':user',role:'user',text,requestId});
          chat.messages.push({id:event.replyId,role:'assistant',text:'',requestId,model:event.model,provider:event.provider,outputBudget:event.outputBudget,contextReceipt:event.contextReceipt,actions:[],approvals:[]});
        }
        const waitingDraft=drafts[projectId+':new'];
        if(!job.id&&waitingDraft?.nonce===job.draftNonce){delete drafts[projectId+':new'];draftKey=projectId+':'+event.id;}
      }
      persist();void refreshSessions().catch(report);
    }
    if(projectId===job.projectId&&chat?.id===(event.id||jobs.find(item=>item.requestId===requestId)?.id)){
      const reply=chat.messages?.find((item:any)=>item.role==='assistant'&&item.requestId===requestId);
      if(reply){
        for(const key of ['contextReceipt','outputBudget','metrics'])if(event[key]!==undefined)reply[key]=event[key];
        if(event.type==='done'||event.type==='error'){
          for(const key of ['finishedAt','outcome','limited','truncated','finishReason'])if(event[key]!==undefined)reply[key]=event[key];
          reply.complete=event.type==='done';reply.interrupted=event.type==='error';
        }
      }
      if(event.type==='delta'&&reply)reply.text=streamTexts.get(requestId)||'';
      if(event.type==='action'&&reply)reply.actions=[...(reply.actions||[]),event.action];
      if(event.type==='approval'&&reply){reply.approvals=[...(reply.approvals||[]).filter((item:any)=>item.id!==event.approval?.id),event.approval].filter(Boolean);}
      if(event.type==='error')error=event.message;
      if(event.type==='capability'&&event.message)notice=event.message;
      if(event.type==='approval')void recover(true);
      void scrollReply();
    }
  }
  async function send(event?:Event){
    event?.preventDefault();if(!prompt.trim()||!model||!projectId||starting||modelSelectionBusy)return;
    if(composer?.form&&!composer.form.reportValidity())return;
    error='';notice='';followReply=true;const text=prompt.trim(),requestId=newRequestId(),pid=projectId,sequence=viewSequence;
    const snapshot:Draft={text,updatedAt:Date.now(),attachments:$state.snapshot(attachments),model,reasoning,fileProfile,webAccess,webApproval,scriptAccess,imageAccess,imageWorkflowId,imageCount,imageModelPolicy,nonce:draftNonce};
    const job:Job={requestId,projectId:pid,...(chat?.id?{id:chat.id}:{}),draftNonce,status:'starting'};
    const payload={requestId,projectId:pid,sessionId:chat?.id||null,model,reasoning,fileAccess:fileProfile!=='none',fileProfile,webAccess,webApproval,scriptAccess,imageAccess:comfy?.enabled===true&&imageAccess,text,attachments:attachments.map(({name,...reference})=>reference),...(imageAccess?{imageWorkflowId,imageCount,...(imageModelPolicy?{imageModelPolicy}:{})}:{})};
    jobs=[...jobs,job];drafts[draftKey]=snapshot;
    try{persist();}catch{jobs=jobs.filter(item=>item.requestId!==requestId);error=tr('Autorise le stockage local avant l’envoi pour conserver son suivi.','Allow local storage before sending so the request can be tracked.');return;}
    prompt='';attachments=[];saveDraft();const controller=new AbortController();controllers.set(requestId,controller);streamTexts.set(requestId,'');streamingIds=[...streamingIds,requestId];
    try{await sendStream(payload,controller.signal,event=>onStream(event,text,requestId));}
    catch(failure:any){
      let rejected=failure instanceof ApiError&&failure.status>=400&&failure.status<500&&![408,409].includes(failure.status);
      if(failure instanceof ApiError&&failure.status===409){
        try{const receipt=await request(query('/api/chat-request',{projectId:pid,requestId}));updateJob(requestId,{id:receipt.id,status:receipt.status});}
        catch(check:any){if(check?.status===404)rejected=true;}
      }
      if(rejected){jobs=jobs.filter(item=>item.requestId!==requestId);if(sequence===viewSequence&&pid===projectId&&!prompt){prompt=text;attachments=snapshot.attachments;saveDraft();}}
      else updateJob(requestId,{disconnected:true});
      error=failure instanceof ApiError?failure.message:tr('Le flux est interrompu. Vérification de la demande sur le serveur.','Stream interrupted. Checking the request on the server.');
      if(failure?.status===401)report(failure);
    }finally{controllers.delete(requestId);streamTexts.delete(requestId);streamingIds=streamingIds.filter(id=>id!==requestId);if(authenticated&&mounted)await recover();}
  }
  async function recover(includeStreaming=false){
    if(!authenticated||recoveryBusy)return;recoveryBusy=true;
    try{
      for(const target of [...jobs]){
        if(!includeStreaming&&controllers.has(target.requestId))continue;
        try{
          const result=await request(query('/api/chat-request',{projectId:target.projectId,requestId:target.requestId}));
          if(!jobs.some(item=>item.requestId===target.requestId))continue;
          updateJob(target.requestId,{id:result.id||target.id,status:result.status,phase:result.phase,disconnected:false});
          const sameView=projectId===target.projectId&&(chat?.id===result.id||!chat?.id&&target.draftNonce===draftNonce);
          if(result.id&&sameView){if(!chat?.id)chat={id:result.id,messages:[]};await loadConversation(target.projectId,result.id);}
          if(terminal(result.status)&&!controllers.has(target.requestId)){jobs=jobs.filter(item=>item.requestId!==target.requestId);if(sameView)notice=result.message||tr('Réponse retrouvée sur le serveur.','Reply recovered from the server.');}
        }catch(failure:any){updateJob(target.requestId,{disconnected:true});if(failure?.status===404)error=tr('Demande non retrouvée. Aucun message renvoyé : vérifie à nouveau son état.','Request not found. No message was resent: check its state again.');else report(failure);}
      }
      persist();
      if(Date.now()-lastCatalog>6000){lastCatalog=Date.now();await refreshSessions();}
    }catch(failure){report(failure);}finally{recoveryBusy=false;}
  }
  async function stop(job=currentJob){if(!job?.id)return;try{await post('/api/cancel',{projectId:job.projectId,id:job.id,requestId:job.requestId});notice=tr('Arrêt demandé au serveur.','Stop requested on the server.');await recover(true);}catch(failure){report(failure);}}
  function detach(){if(!currentJob)return;updateJob(currentJob.requestId,{disconnected:true});controllers.get(currentJob.requestId)?.abort();}
  async function visitJob(job:Job){if(projectId!==job.projectId)await chooseProject(job.projectId);if(job.id)await openSession(job.id);else await recover();}
  async function changedLoadedModels(){saveDraft();await refreshEngines(false);saveDraft();}
  async function changedInference(){saveDraft();model='';reasoning='default';await refreshEngines();notice=tr('Moteur et modèle actifs actualisés.','Active engine and model updated.');saveDraft();}
  function changeTab(next:typeof tab){saveDraft();if(next==='settings')settingsVisited=true;if(next==='files')filesVisited=true;if(next==='images')imagesVisited=true;if(next==='activity')activityVisited=true;if(tab==='settings'&&next!=='settings')void refreshEngines().catch(report);tab=next;if(next==='chat')void refreshSessions().catch(report);}
  async function changedConversation(next:any|null){saveDraft();++viewSequence;if(!next&&chat?.id)sessions=sessions.filter(item=>item.id!==chat.id);chat=next;if(next?.projectId&&next.projectId!==projectId){projectId=next.projectId;sessions=[];sessionPage=null;await reloadProjects();}switchDraft();persist();await refreshSessions();}
  async function navigate(target:{projectId:string;id:string;messageId?:string}){
    if(target.projectId!==projectId)await chooseProject(target.projectId);await openSession(target.id);
    while(target.messageId&&!chat?.messages?.some((item:any)=>item.id===target.messageId)&&chat?.pagination?.hasMore)await olderMessages();
    await tick();if(target.messageId){followReply=false;document.getElementById('message-'+target.messageId)?.scrollIntoView({block:'center'});}
  }
  function changedPreferences(value:any){if(value?.clearDrafts){drafts={};prompt='';attachments=[];localStorage.removeItem(storageKey+':drafts');sessionStorage.removeItem(storageKey+':drafts');for(const source of [localStorage,sessionStorage])for(const key of Object.keys(source))if(key.startsWith('companion-prototype:'+instanceId+':')&&(key.includes(':file:')||key.includes(':image-draft:')))source.removeItem(key);filesDirty=false;}else saveDraft();}
  function beforeMaintenance(){saveDraft();if(filesDirty){error=tr('Enregistre ou abandonne le fichier modifié avant la maintenance.','Save or discard the edited file before maintenance.');return false;}return true;}
  $effect(()=>{document.documentElement.classList.toggle('dark',dark);document.documentElement.lang=preferences.language;});
  onMount(()=>{
    mounted=true;sidebarOpen=innerWidth>=760;start().catch(failure=>{if(failure.status!==401)report(failure);ready=true;});
    const timer=setInterval(()=>{if(!document.hidden)void recover(true);},1800);
    const resume=()=>{if(!document.hidden)void recover(true);},save=()=>saveDraft();
    addEventListener('online',resume);addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume);addEventListener('pagehide',save);
    return()=>{mounted=false;clearInterval(timer);removeEventListener('online',resume);removeEventListener('pageshow',resume);removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',resume);for(const controller of controllers.values())controller.abort();};
  });
</script>

{#if !authenticated}
  <main class="login-page"><div class="login-card"><Logo class="welcome-logo" /><h1>Canaé</h1><p>{tr('Tes projets, tes fichiers, tes conversations.','Your projects, files and conversations.')}</p>
    {#if ready}<form onsubmit={login}><label for="access-code">{tr('Code d’accès du prototype','Prototype access code')}</label><input id="access-code" type="password" bind:value={code} required autocomplete="current-password" /><Button type="submit" disabled={loginBusy}>{loginBusy?tr('Connexion…','Connecting…'):tr('Se connecter','Sign in')}</Button></form>{:else}<p role="status">{tr('Connexion au compagnon…','Connecting to the companion…')}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}<small>2.6.0-beta.7</small></div></main>
{:else}
  <div class="companion-shell" class:sidebar-hidden={!sidebarOpen}>
    {#if sidebarOpen}<aside class="navigation" aria-label="Navigation">
      <div class="brand-row"><a href="/prototype/" class="brand"><Logo class="brand-logo" /><span>Canaé</span></a><Button variant="ghost" size="icon" aria-label={tr('Fermer la navigation','Close navigation')} onclick={()=>sidebarOpen=false}><PanelLeftClose /></Button></div>
      <Button variant="outline" class="new-chat" onclick={()=>newChat()}><Plus />{tr('Nouveau chat','New chat')}</Button>
      <label class="search-field"><Search /><input aria-label={tr('Rechercher un chat','Search chats')} bind:value={search} placeholder={tr('Rechercher un chat','Search chats')} /></label>
      <div class="section-label"><span>{tr('Projets','Projects')}</span><Button variant="ghost" size="icon" aria-label={tr('Créer un projet','Create a project')} onclick={()=>projectForm=!projectForm}><Plus /></Button></div>
      {#if projectForm}<form class="project-form" onsubmit={createProject}><input aria-label={tr('Nom du projet','Project name')} bind:value={projectName} placeholder={tr('Nom du projet','Project name')} maxlength="120" required /><Button type="submit" size="sm" disabled={creatingProject}>{tr('Créer','Create')}</Button></form>{/if}
      <div class="project-list">{#each projects as project (project.id)}<div class="project-row"><button class="project-collapse" aria-label={(collapsedProjects.includes(project.id)?tr('Déplier le projet ','Expand project '):tr('Replier le projet ','Collapse project '))+project.name} aria-expanded={!collapsedProjects.includes(project.id)} onclick={()=>collapsedProjects=collapsedProjects.includes(project.id)?collapsedProjects.filter(id=>id!==project.id):[...collapsedProjects,project.id]}>{#if collapsedProjects.includes(project.id)}<ChevronRight />{:else}<ChevronDown />{/if}</button><button class:active={project.id===projectId} onclick={()=>chooseProject(project.id)}><Folder /><span>{project.name}</span></button><button class="project-new" aria-label={tr('Nouveau chat dans ','New chat in ')+project.name} onclick={()=>newChat(project.id)}><Plus /></button></div>{/each}</div>
      <div class="section-label"><span>{tr('Conversations','Conversations')}</span><span class="subtle">{sessionPage?.total??sessions.length}</span></div>
      <nav class="chat-list" aria-label={tr('Conversations','Conversations')} hidden={collapsedProjects.includes(projectId)}>
        {#each visibleSessions as session (session.id)}<button class:active={session.id===chat?.id} onclick={()=>openSession(session.id)}><MessageSquare /><span>{session.name||tr('Conversation','Conversation')}</span>{#if session.generation?.status==='running'||session.queue?.length}<span class="running-dot" aria-label={tr('En cours','Running')}></span>{/if}</button>{/each}
        {#if !visibleSessions.length}<p class="quiet">{search?tr('Aucun chat trouvé.','No chats found.'):tr('Tes conversations apparaîtront ici.','Your conversations will appear here.')}</p>{/if}
        {#if sessionPage?.hasMore}<Button variant="ghost" size="sm" disabled={sessionsBusy} onclick={()=>refreshSessions(true)}>{tr('Charger d’autres conversations','Load more conversations')}</Button>{/if}
        {#if sessionWarnings.length}<p class="quiet" role="status">{tr('Liste partielle : ','Partial list: ')+sessionWarnings.join(' · ')}</p>{/if}
      </nav>
      <div class="navigation-footer"><span class="version">2.6.0-beta.7 · {inference?.provider==='llamacpp'?'llama-server':inference?.provider==='bionic'?'Bionic':tr('Moteur local','Local engine')}</span><div><a class="legacy-link" href="/legacy/">{tr('Ancienne interface','Legacy interface')}</a><div class="footer-controls"><LoadedModelsMenu {request} {models} {inference} onModelsChange={changedLoadedModels} disabled={starting||modelSelectionBusy} /><Button variant="ghost" size="icon" aria-label={tr('Se déconnecter','Sign out')} onclick={logout}><LogOut /></Button></div></div></div>
    </aside>{/if}
    <main class="workspace">
      <header class="workspace-header"><div class="workspace-title">{#if !sidebarOpen}<Button variant="ghost" size="icon" aria-label={tr('Ouvrir la navigation','Open navigation')} onclick={()=>sidebarOpen=true}><PanelLeftOpen /></Button>{/if}<span>{chat?.name||currentProject?.name||tr('Nouveau chat','New chat')}</span></div>
        <nav class="workspace-tabs" hidden={tab!=='chat'} aria-label={tr('Espace du projet','Project workspace')}>{#each workspaceItems as item}<button aria-label={tr(item.fr,item.en)} class:active={tab===item.id} onclick={()=>changeTab(item.id as typeof tab)}><item.icon /><span>{tr(item.fr,item.en)}</span></button>{/each}</nav>
      </header>
      {#if prototypeInfo?.syntheticComfyUI||prototypeInfo?.syntheticProjects}<div class="global-notice status fixture-notice">{tr('Démonstration isolée','Isolated demonstration')} · {prototypeInfo.realInference?tr('modèle réel','real model'):tr('modèle simulé','simulated model')} · {prototypeInfo.syntheticComfyUI?tr('ComfyUI simulé','simulated ComfyUI'):'ComfyUI'} · {tr('projets de test','test projects')}</div>{/if}
      {#if error}<div class="global-notice error" role="alert"><span>{error}</span><button aria-label={tr('Masquer l’erreur','Dismiss error')} onclick={()=>error=''}><X /></button></div>{/if}
      {#if jobs.length||notice}<div class="global-notice status" role="status"><span>{currentJob?.disconnected?tr('Connexion perdue · suivi sur le serveur','Connection lost · tracked on the server'):currentJob?.status==='queued'?tr('Dans la file d’attente','Queued'):jobs.length?jobs.length+' '+tr('demande(s) suivie(s)','tracked request(s)'):notice}</span><div>{#if jobs.length}<Button variant="ghost" size="sm" onclick={()=>recover(true)}><RefreshCw />{tr('Vérifier','Check')}</Button>{#if !currentJob}<Button variant="ghost" size="sm" onclick={()=>visitJob(jobs[0])}>{tr('Voir la demande','View request')}</Button>{/if}{/if}</div></div>{/if}
      <WorkspaceDialog open={tab!=='chat'} title={tr(workspaceItems.find(item=>item.id===tab)?.fr||'Espace du projet',workspaceItems.find(item=>item.id===tab)?.en||'Project workspace')} onClose={()=>changeTab('chat')}>
        {#snippet navigation()}<nav class="workspace-tabs" aria-label={tr('Espace du projet','Project workspace')}>{#each workspaceItems as item}<button aria-label={tr(item.fr,item.en)} class:active={tab===item.id} onclick={()=>changeTab(item.id as typeof tab)}><item.icon /><span>{tr(item.fr,item.en)}</span></button>{/each}</nav>{/snippet}
        {#if settingsVisited}<div class="settings-host" hidden={tab!=='settings'}>
          <SettingsPanel active={tab==='settings'} onDirtyChange={(value:boolean)=>settingsDirty=value} {request} {projectId} chatId={chat?.id} modelId={model} onInferenceChange={changedInference} onPreferencesChange={changedPreferences} {beforeMaintenance} onClose={()=>changeTab('chat')} />
        </div>{/if}
        {#if filesVisited}<div class="popup-panel" hidden={tab!=='files'}>{#key projectId}<ProjectAccess project={currentProject} {request} onChanged={reloadProjects} /><FilesPanel {projectId} {request} {instanceId} chatId={chat?.id} onAttach={attach} onDirtyChange={(value:boolean)=>filesDirty=value} />{/key}</div>{/if}
        {#if imagesVisited}<div class="popup-panel" hidden={tab!=='images'}>{#key projectId}<ImagesPanel {projectId} {request} {instanceId} syntheticComfyUI={prototypeInfo?.syntheticComfyUI===true} chatId={chat?.id} />{/key}</div>{/if}
        {#if activityVisited}<div class="popup-panel" hidden={tab!=='activity'}>{#key projectId}<WorkspacePanel {request} {projectId} {chat} {instanceId} language={preferences.language} onConversationChange={changedConversation} onNavigate={navigate} onImages={()=>changeTab('images')} />{/key}</div>{/if}
      </WorkspaceDialog>
        <div class="conversation" class:empty={!chat?.messages?.length}>
          {#if chat?.id}<div class="conversation-tools">{#if chat.source!=='web'||chat.origin}<span class="quiet">{chat.source!=='web'?tr('Historique d’origine · actions passives','Original history · passive actions'):tr('Copie avec origine conservée','Copy with preserved origin')}</span>{/if}<ConversationActions {request} {projectId} {chat} {projects} {instanceId} language={preferences.language} onConversationChange={changedConversation} onNavigate={navigate} /></div>{/if}
          <div class="messages" bind:this={messageList} onscroll={event=>{const element=event.currentTarget;followReply=element.scrollHeight-element.scrollTop-element.clientHeight<100;}}>
            {#if !chat?.messages?.length}<div class="welcome"><Logo class="welcome-logo" /><h1>{tr('Qu’est-ce qu’on fait aujourd’hui ?','What shall we do today?')}</h1><p>{tr('Un projet, ses fichiers, tes idées en images.','A project, its files, your ideas in pictures.')}</p><div class="welcome-actions"><Button variant="outline" onclick={()=>changeTab('files')}><Files />{tr('Explorer les fichiers','Explore files')}</Button><Button variant="outline" onclick={()=>changeTab('images')}><Image />{tr('Créer une image','Create an image')}</Button></div></div>
            {:else}<div class="message-column">
              {#if chat.pagination}<div class="history-controls">{#if chat.pagination.hasMore}<Button variant="outline" size="sm" disabled={historyBusy} onclick={olderMessages}>{tr('Charger les messages précédents','Load earlier messages')}</Button>{/if}<span class="quiet">{chat.messages.length} / {chat.pagination.total} {tr('messages','messages')}{chat.historyWindowReset?' · '+tr('Fenêtre actualisée','Window refreshed'):''}</span></div>{/if}
              {#each chat.messages as message,index (message.id||index)}<article id={'message-'+message.id} class="chat-message" class:user={message.role==='user'} aria-label={message.role==='user'?tr('Votre message','Your message'):tr('Réponse du modèle','Model reply')}>
                {#if message.role==='user'}<UserBubble content={message.text||''} />{:else}<div class="assistant-name"><Logo class="message-logo" /><span>{message.model||chat.model||'Assistant'}{message.provider?.provider?' · '+message.provider.provider:''}</span></div><Markdown content={message.text||''} />{/if}
                {#if message.attachments?.length}<div class="message-attachment-list">{#each message.attachments as file}<span><Files />{file.name||file.path}</span>{/each}</div>{/if}
                <Approvals {request} {projectId} {chat} {message} language={preferences.language} onConversationChange={changedConversation} onNavigate={navigate} />
                {#each message.actions||[] as action}<details class="action-receipt"><summary>{(message.historicalActions||message.fromFork)?tr('Action historique','Historical action'):action.ok===false?tr('Action refusée','Action refused'):tr('Action effectuée','Action performed')} · {action.tool||action.name||action.path||tr('Outil','Tool')}</summary><pre>{JSON.stringify(action,null,2)}</pre></details>{/each}
                {#if message.contextReceipt||message.outputBudget||message.metrics}<details class="action-receipt"><summary>{tr('Contexte, permissions et statistiques','Context, permissions and statistics')}</summary><pre>{JSON.stringify({context:message.contextReceipt,output:message.outputBudget,metrics:message.metrics},null,2)}</pre></details>{/if}
                <MessageImages {request} {projectId} chatId={chat.id} {message} active={tab==='chat'} onOpenGallery={()=>changeTab('images')} />
                {#if message.role==='assistant'}<MessageStats {message} language={preferences.language} running={jobs.some(item=>item.requestId===message.requestId&&!terminal(item.status))&&!message.finishedAt} />{/if}
                {#if message.interrupted||message.truncated}<p class="quiet">{message.error||(message.truncated?tr('Réponse limitée par le budget de sortie.','Reply reached its output budget.'):tr('Réponse interrompue.','Reply interrupted.'))}</p>{/if}
                {#if message.role==='user'||message.role==='assistant'}<CopyMessage text={message.text||''} role={message.role} />{/if}
                <ConversationActions {request} {projectId} {chat} {instanceId} messageId={message.id} language={preferences.language} onConversationChange={changedConversation} onNavigate={navigate} />
              </article>{/each}
            </div>{/if}
          </div>
          <div class="composer-region"><form class="composer" onsubmit={send}>
            {#if attachments.length}<div class="attachment-chips">{#each attachments as file,index}<span><Files />{file.name||file.path}<button type="button" aria-label={tr('Retirer ','Remove ')+(file.name||file.path)} onclick={()=>{attachments=attachments.filter((_,at)=>at!==index);saveDraft();}}><X /></button></span>{/each}</div>{/if}
            <Textarea id="prompt" bind:ref={composer} bind:value={prompt} oninput={()=>queueMicrotask(saveDraft)} placeholder={tr('Écris ton message…','Write your message…')} aria-label={tr('Message','Message')} maxlength={16000} onkeydown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();void send();}}} />
            <div class="composer-toolbar"><div class="composer-controls"><Button variant="ghost" size="icon" aria-label={tr('Joindre un fichier','Attach a file')} onclick={()=>changeTab('files')}><Plus /></Button>
              <ModelPicker {request} {models} {inference} bind:model disabled={starting||modelSelectionBusy} onBusyChange={value=>modelSelectionBusy=value} onSelected={()=>{reasoning='default';queueMicrotask(saveDraft);}} onInferenceChange={changedInference} onFailure={message=>error=message} />
              {#if selectedModel?.reasoning?.allowedOptions?.length}<select aria-label={tr('Raisonnement','Reasoning')} bind:value={reasoning} onchange={()=>queueMicrotask(saveDraft)}><option value="default">{tr('Raisonnement par défaut','Default reasoning')}</option>{#each selectedModel.reasoning.allowedOptions as option}<option value={option}>{option}</option>{/each}</select>{/if}
              <select aria-label={tr('Droits sur les fichiers','File permissions')} bind:value={fileProfile} onchange={()=>queueMicrotask(saveDraft)} disabled={currentProject?.isUnassigned}><option value="none">{tr('Fichiers désactivés','Files disabled')}</option><option value="read">{tr('Lecture des fichiers','Read files')}</option><option value="write">{tr('Lecture et écriture','Read and write')}</option></select>
            </div><div class="send-controls">{#if currentJob}{#if streamingIds.includes(currentJob.requestId)}<Button variant="ghost" size="icon" aria-label={tr('Déconnecter le flux sans arrêter la demande','Disconnect stream without stopping request')} onclick={detach}><Unplug /></Button>{/if}<Button variant="outline" size="icon" aria-label={tr('Arrêter la demande','Stop request')} disabled={!currentJob.id} onclick={()=>stop()}><Square /></Button>{/if}<Button type="submit" size="icon" class="send-button" aria-label={tr('Envoyer','Send')} disabled={!prompt.trim()||!model||!projectId||starting||modelSelectionBusy}><ArrowUp /></Button></div></div>
            <details class="tool-options" onchange={()=>queueMicrotask(saveDraft)}><summary>{tr('Outils et images','Tools and images')}</summary><div class="tool-grid"><label><input type="checkbox" bind:checked={webAccess} />{tr('Recherche web','Web search')}</label><label><input type="checkbox" bind:checked={webApproval} disabled={!webAccess} />{tr('Accord pour chaque appel web','Approve each web call')}</label><label><input type="checkbox" bind:checked={scriptAccess} disabled={currentProject?.isUnassigned} />{tr('Scripts avec approbation','Scripts with approval')}</label><label><input type="checkbox" bind:checked={imageAccess} disabled={!comfy?.enabled||!comfy?.available} />{tr('Génération d’images','Image generation')}</label>
              {#if imageAccess}<label>{tr('Workflow','Workflow')}<select aria-label={tr('Workflow du chat','Chat workflow')} bind:value={imageWorkflowId}>{#each comfy?.workflows||[] as workflow}<option value={workflow.id}>{workflow.name||workflow.label||workflow.id}</option>{/each}</select></label>{#key projectId+':'+(chat?.id||'new')}<ImageCountField id="chat-image-count" bind:value={imageCount} disabled={!comfy?.enabled||!comfy?.available} onValueChange={()=>queueMicrotask(saveDraft)}/>{/key}<label>{tr('Modèle texte pendant les images','Text model during images')}<select aria-label={tr('Politique mémoire des images','Image memory policy')} bind:value={imageModelPolicy}><option value="">{tr('Réglage de l’application','Application setting')}</option><option value="keep">{tr('Garder chargé','Keep loaded')}</option><option value="unload">{tr('Décharger','Unload')}</option><option value="alternate">{tr('Alterner','Alternate')}</option></select></label>{/if}
            </div><p class="quiet">{tr('Les droits sont fixés à l’envoi. Les mêmes outils sont disponibles quel que soit le moteur d’inférence.','Permissions are fixed when sent. The same tools are available with every inference engine.')}</p></details>
          </form><p class="composer-hint">{currentJobs.length?tr('Les nouveaux messages rejoignent la file. Tu peux quitter la page.','New messages join the queue. You can leave this page.'):tr('Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne','Enter to send · Shift + Enter for a new line')}</p></div>
        </div>
    </main>
  </div>
{/if}
