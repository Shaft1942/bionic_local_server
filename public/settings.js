/* Server-owned settings; unsent preferences and form drafts stay separate. */
function createCompanionSettings({api,getState,node,onChange,onNavigate,onPageChange}) {
  const i18n=globalThis.BionicI18n,t=(key,params)=>i18n.t(key,params);
  const el=id=>document.getElementById(id),pending=new Map(),outputDrafts=new Map(),messageRenderers=new Map(),nodeRenderers=new Map();
  const certificateClient=createCompanionCertificates({api,getState,node});
  const certificates={load:()=>certificateClient.load(),reset(){certificateClient.reset();el('certificate-hosts').value='';el('certificate-device-name').value='';}};
  const pages=['reading','models','tools','images','servers','connection','maintenance','help'];
  // Search only this public vocabulary, never form values or certificate secrets.
  const searchIndex=[["language", "reading", "interface-language"], ["drafts", "reading", "draft-duration"], ["downloadDraft", "reading", "draft-download"], ["clearDrafts", "reading", "draft-clear"], ["model", "models", "settings-edit-model"], ["output", "models", "output-mode"], ["loadedModels", "models", "settings-models-loaded"], ["files", "tools", "settings-edit-tools"], ["web", "tools", "settings-edit-tools"], ["scripts", "tools", "settings-edit-tools"], ["images", "tools", "settings-edit-image"], ["discover", "images", "comfy-discover"], ["enableComfy", "images", "comfy-enabled"], ["comfyUrl", "images", "comfy-url"], ["workflow", "images", "comfy-workflow"], ["loras", "images", "comfy-lora-1"], ["loraCatalog", "images", "comfy-loras-refresh"], ["testComfy", "images", "comfy-test"], ["memory", "images", "comfy-memory-cleanup"], ["security", "connection", "certificate-title"], ["https", "connection", "certificate-prepare"], ["deviceCertificate", "connection", "certificate-device-name"], ["refreshCertificates", "connection", "certificate-refresh"], ["updates", "maintenance", "updates-title"], ["diagnostics", "maintenance", "diagnostics-open"], ["guide", "help", "help-content"], ["capabilities", "help", "capabilities-title"], ["chatHelp", "help", "help-chat"], ["filesHelp", "help", "help-files"], ["imageHelp", "help", "help-images"], ["connectionHelp", "help", "help-connection"], ["troubleshoot", "help", "help-troubleshooting"], ["organize", "tools", "settings-heading-tools"], ["projectFiles", "tools", "settings-heading-tools"], ["advanced", "maintenance", "settings-heading-maintenance"]].map(([id,page,target])=>({id,page,target}));
  searchIndex.push({id:'launcher',page:'servers',target:'settings-heading-servers'});
  let pendingComfyAvailability=null;
  const localServices=typeof createLocalServices==='function'?createLocalServices({api,node,getState,onNavigate:page=>showPage(page,'settings-heading-'+page),onComfyAvailability(available){if(!comfy){pendingComfyAvailability=available;return;}if(comfy.available===available)return;comfy={...comfy,available};onChange?.();imagePermission();}}):null;
  let opener,scope,generation=0,viewRevision=0,comfyRevision=0,loraRevision=0,navigationRevision=0,outputOperation=0;
  const outputOperations=new Map();
  let setupRevision=0,setupOperation=0,discoveryOperation=0,resumeRevision=0,pendingResume=null;
  let comfy=null,savingRevision=null,loraDrafts={},editingWorkflow=null,loraNames=[],imageOptionsSignature='';
  let loadedModel=null,outputData=null,outputBaseline=null,comfyBaseline=null,comfyDraft=null;
  let outputSubmitting=null,comfySubmitting=null,transition=null,activePage='reading',capabilities=null,capabilitiesFailed=false,languagePersisted=null;
  const key=(model,view=getState().viewKey)=>JSON.stringify([view,model]);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const number=n=>i18n.number(n);
  const modelPolicy=value=>['keep','unload','alternate'].includes(value)?value:'keep';
  const imageCount=value=>Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=5?Number(value):1;
  const imagePolicyChoice=value=>['keep','unload','alternate'].includes(value)?value:'';
  function acceptComfy(data){comfy=pendingComfyAvailability===null?data:{...data,available:pendingComfyAvailability};pendingComfyAvailability=null;}
  const loraNumber={format:n=>i18n.number(n,{minimumFractionDigits:2,maximumFractionDigits:2})};
  const current=revision=>revision===viewRevision&&!el('settings-view').hidden&&getState().authenticated;
  const listen=(id,type,callback)=>el(id)?.addEventListener(type,callback);
  function message(id,value,error=false){const target=el(id);if(!target)return;const render=typeof value==='function'?value:null;if(render)messageRenderers.set(id,{render,error});else messageRenderers.delete(id);target.textContent=render?render():value;target.hidden=!target.textContent;if(error)target.setAttribute('role','alert');}
  function forgetNodes(container){for(const target of nodeRenderers.keys())if(container?.contains?.(target))nodeRenderers.delete(target);}
  function translatedNode(tag,className,render){const target=node(tag,className,render());nodeRenderers.set(target,render);return target;}
  function allSessions(){return el('output-all-sessions').value==='model';}
  function destination(all){el('output-all-sessions').value=all?'model':'session';}
  const validOutputTokens=value=>Number.isSafeInteger(value)&&value>=1&&value<=5000000;
  const outputInput=()=>({mode:el('output-mode').value,tokens:el('output-tokens').value,destination:allSessions()?'model':'session'});
  function profileCopies(profiles={},workflows=comfy?.workflows||[]){const result={};for(const id of new Set([...Object.keys(profiles),...workflows.map(w=>w.id)]))result[id]=[0,1].map(index=>({name:profiles[id]?.[index]?.name||'',strength:profiles[id]?.[index]?.strength??1}));return result;}
  function rememberLoras(){if(editingWorkflow)loraDrafts[editingWorkflow]=[1,2].map(index=>({name:el('comfy-lora-'+index).value,strength:Number(el('comfy-lora-'+index+'-strength').value)}));}
  function comfyInput(){rememberLoras();return {enabled:el('comfy-enabled').checked,url:el('comfy-url').value,workflowId:el('comfy-workflow').value,memoryCleanup:el('comfy-memory-cleanup').checked,modelPolicy:modelPolicy(el('comfy-model-policy').value),loraProfiles:structuredClone(loraDrafts)};}
  const outputSavedBaseline=()=>outputSubmitting?.revision===viewRevision&&outputSubmitting.model===loadedModel?outputSubmitting.value:outputBaseline;
  function outputDirty(){const baseline=outputSavedBaseline();return !!baseline&&!same(outputInput(),baseline);}
  function comfyDirty(){const baseline=comfySubmitting?.revision===viewRevision?comfySubmitting.value:comfyBaseline;return !!baseline&&!same(comfyInput(),baseline);}
  function hasUnsaved(){return outputDirty()||comfyDirty()||outputDrafts.size>0||comfyDraft!==null;}
  const currentUnsaved=()=>outputDirty()||comfyDirty();
  function updateDirty(){const output=outputDirty(),images=comfyDirty();message('output-dirty',()=>output?t('settings.output.dirty'):'');message('comfy-dirty',()=>images?t('settings.comfy.dirty'):'');if(el('output-cancel'))el('output-cancel').disabled=!output;if(el('comfy-cancel'))el('comfy-cancel').disabled=!images;outputInfo();}
  function outputInfo(){
    if(!scope)return;const target={...scope},data=outputData,local=()=>target.id?t('settings.output.chat',{name:target.name}):t('settings.output.nextChat');
    message('output-scope',()=>allSessions()?t('settings.output.destinationModel'):t('settings.output.destinationChat',{chat:local(),detail:!target.id?t('settings.output.tabOnly'):''}));
    if(!data)return;const prepared=pending.get(key(loadedModel,target.viewKey));
    const source=()=>t('settings.output.'+(prepared?'prepared':data.source==='session'?'session':data.source==='model'?'model':'auto'));
    const automatic=prepared?prepared.maxOutputTokens===null:data.automatic===true||data.source==='auto';
    message('output-origin',()=>t('settings.output.origin',{source:source(),detail:automatic&&(prepared||data.source==='session')?t('settings.output.autoOverride'):''}));
    const requested=prepared?prepared.maxOutputTokens??8192:data.maxOutputTokens??8192;
    message('output-effective',()=>t('settings.output.effective',{tokens:t('settings.output.tokens',{count:number(requested)}),automatic:automatic?t('settings.output.automatic'):'',context:Number.isSafeInteger(data.contextLength)&&data.contextLength>0?t('settings.output.tokens',{count:number(data.contextLength)}):t('settings.output.contextUnknown')}));
  }
  function comfyInfo(){el('comfy-queue-paused').hidden=comfy?.queuePaused!==true;el('comfy-queue-resume').disabled=pendingResume?.revision===viewRevision;if(!comfy)return;const data=comfy;message('comfy-scope',()=>t('settings.comfy.scope'));message('comfy-origin',()=>t(data.updatedAt?'settings.comfy.originSaved':'settings.comfy.originUndated'));message('comfy-effective',()=>t('settings.comfy.effective',{state:t(data.enabled?'settings.comfy.enabled':'settings.comfy.disabled'),workflow:data.workflows?.find(w=>w.id===data.workflowId)?.label||data.workflowId||t('settings.comfy.notSpecified'),jobs:data.activeJobs?t('settings.comfy.activeJobs',{count:data.activeJobs}):''}));}
  function summaries(){
    const state=getState(),model=state.status?.models?.find(m=>m.id===el('model').value),profile=el('agent-files')?.value,effort=el('effort');
    message('settings-chat-summary',()=>t('settings.model.summary',{model:model?.name||t('settings.model.none'),effort:effort?.disabled||model?.reasoning?.allowedOptions?.length===0?t('settings.model.effortUnavailable'):t('settings.model.effort',{effort:t('settings.effort.'+(['default','off','on','low','medium','high','xhigh'].includes(effort?.value)?effort.value:'default'))}),context:model?.contextLength?t('settings.model.context',{count:number(model.contextLength)}):t('settings.model.contextUnknown')}));
    message('settings-tools-summary',()=>t('settings.tools.summary',{files:t('settings.tools.files.'+(['none','read','write'].includes(profile)?profile:'chat')),web:t('settings.tools.web.'+(el('agent-web')?.checked?el('agent-web-approval')?.checked?'approved':'allowed':'disabled')),scripts:t('settings.tools.scripts.'+(el('agent-scripts')?.checked?'approved':'disabled'))}));
    if(model?.tools===false)message('settings-tools-summary',()=>t('settings.tools.unavailable'));
    else if(state.projects?.find(project=>project.id===state.projectId)?.isUnassigned)message('settings-tools-summary',()=>t('settings.tools.noProject'));
    const imageId=state.draftImageWorkflowId??state.chat?.imageWorkflowId??comfy?.workflowId;
    message('settings-image-summary',()=>t('settings.images.summary',{service:comfy?.enabled===false?t('settings.images.serviceDisabled'):'',permission:t(el('agent-images')?.checked?'settings.images.allowed':'settings.images.disabled'),workflow:comfy?.workflows?.find(w=>w.id===imageId)?.label||imageId||t('settings.images.noProfile')}));
  }
  function syncOutputSlider(){const value=Number(el('output-tokens').value);if(validOutputTokens(value))el('output-tokens-slider').value=value;el('output-tokens-slider').setAttribute('aria-valuetext',t('settings.output.tokens',{count:number(Number(el('output-tokens-slider').value))}));}
  function outputMode(){const manual=el('output-mode').value==='manual';el('output-manual').hidden=!manual;el('output-tokens').required=manual;el('output-tokens').disabled=!manual;el('output-tokens-slider').disabled=!manual;syncOutputSlider();}
  function applyOutput(value){el('output-mode').value=value.mode;el('output-tokens').value=value.tokens;destination(value.destination==='model');outputMode();}
  function outputLoading(value){for(const id of ['output-mode','output-all-sessions','output-tokens','output-tokens-slider'])el(id).disabled=value;if(!value)outputMode();}
  function comfyLoading(value){for(const id of ['comfy-model-policy','comfy-memory-cleanup','comfy-discover','comfy-enabled','comfy-url','comfy-workflow','comfy-lora-1','comfy-lora-2','comfy-lora-1-strength','comfy-lora-2-strength','comfy-loras-refresh','comfy-save','comfy-test'])el(id).disabled=value;}
  function showStrength(index){const input=el('comfy-lora-'+index+'-strength'),value=loraNumber.format(Number(input.value));el('comfy-lora-'+index+'-value').textContent=value;input.setAttribute('aria-valuetext',value);}
  function showLoras(){const slots=loraDrafts[editingWorkflow]||[];for(const index of [1,2]){const slot=slots[index-1]||{name:'',strength:1},names=[...new Set([...loraNames,...(slot.name?[slot.name]:[])])],empty=node('option','',BionicI18n.t("ui.5053dbcc46a5"));empty.value='';el('comfy-lora-'+index).replaceChildren(empty,...names.map(name=>{const option=node('option','',name+(loraNames.includes(name)?'':BionicI18n.t("settings.lora.checkPresence")));option.value=name;return option;}));el('comfy-lora-'+index).value=slot.name;el('comfy-lora-'+index+'-strength').value=slot.strength;showStrength(index);}}
  function applyComfy(value){invalidateSetup();el('comfy-model-policy').value=modelPolicy(value.modelPolicy);el('comfy-memory-cleanup').checked=value.memoryCleanup===true;el('comfy-enabled').checked=value.enabled;el('comfy-url').value=value.url;el('comfy-workflow').value=value.workflowId;loraDrafts=structuredClone(value.loraProfiles);editingWorkflow=value.workflowId;showLoras();}
  function imagePermission(){
    const enabled=comfy?.enabled===true;
    if(!enabled)el('agent-images').disabled=true;
    const state=getState(),workflows=comfy?.workflows||[],signature=JSON.stringify(workflows);
    if(signature!==imageOptionsSignature){el('image-workflow').replaceChildren(...workflows.map(w=>{const option=node('option','',w.label);option.value=w.id;return option;}));imageOptionsSignature=signature;}
    const selected=state.draftImageWorkflowId??state.chat?.imageWorkflowId??comfy?.workflowId;
    el('image-workflow').value=workflows.some(w=>w.id===selected)?selected:comfy?.workflowId||'';
    el('image-workflow').disabled=!enabled||state.loading||state.uploading;
    const amount=imageCount(state.draftImageCount??state.chat?.imageCount),active=enabled&&el('agent-images').checked;
    const countLabel=t('settings.beta25.imageCount',{count:amount});
    el('image-count').value=String(amount);el('image-count').setAttribute('aria-valuetext',countLabel);
    el('image-count-value').textContent=active?countLabel:t('settings.beta25.disabledCount');
    el('image-count').disabled=!active||state.loading||state.uploading;
    const choice=imagePolicyChoice(state.draftImageModelPolicy??state.chat?.imageModelPolicy);
    el('image-model-policy').value=choice;el('image-model-policy').disabled=!active||state.loading||state.uploading;
    const effective=choice||modelPolicy(comfy?.modelPolicy),count=(comfy?.loraProfiles?.[el('image-workflow').value]||[]).filter(slot=>slot.name&&slot.strength!==0).length;
    const mode=t(amount>1?'settings.beta25.modeSeries':'settings.beta25.modeSingle',{count:amount}),policy=t('settings.beta25.'+effective);
    el('image-settings-help').textContent=!enabled?t('settings.comfy.savedDisabled'):!active?t('settings.beta25.noImages'):t('settings.beta25.selection',{model:workflows.find(w=>w.id===el('image-workflow').value)?.label||'',count,mode,scope:t(choice?'settings.beta25.messageScope':'settings.beta25.globalScope'),policy});
  }
  async function refresh(){const epoch=getState().authEpoch,ticket=++comfyRevision;try{const data=await api('/api/comfy/settings');if(ticket!==comfyRevision||epoch!==getState().authEpoch||!getState().authenticated)return;acceptComfy(data);onChange?.();imagePermission();if(!el('settings-view').hidden){comfyInfo();summaries();}}catch{if(ticket===comfyRevision&&epoch===getState().authEpoch){comfy=null;imagePermission();}}}
  function available(target){return target&&!target.disabled&&!target.hidden&&!target.closest?.('[hidden]')&&(!target.matches||target.matches('button,input,select,textarea,a[href],[tabindex]'))&&(!target.getClientRects||target.getClientRects().length>0);}
  function focusDestination(page,id){const target=el(id);for(let details=target?.closest?.('details');details;details=details.parentElement?.closest?.('details'))details.open=true;const heading=el('settings-heading-'+page),selected=available(target)?target:heading;selected?.scrollIntoView?.({block:'nearest'});selected?.focus({preventScroll:true});return selected;}
  function showPage(page,focusId){
    if(!pages.includes(page))page='reading';const previous=activePage;if(previous==='connection'&&page!=='connection')certificates.reset();activePage=page;localServices?.setVisible(page==='servers');
    const nav=++navigationRevision,revision=viewRevision;el('settings-view').dataset.settingsIndex='false';
    for(const id of pages)if(el('settings-page-'+id))el('settings-page-'+id).hidden=id!==page;
    const body=document.querySelector?.('.settings-body');if(body)body.scrollTop=0;
    for(const button of document.querySelectorAll('#settings-nav [data-settings-page]'))button.setAttribute('aria-current',button.dataset.settingsPage===page?'page':'false');
    const loading=page==='connection'?certificates.load():Promise.resolve(onPageChange?.(page)),focused=focusId?focusDestination(page,focusId):null;
    return loading.then(()=>{if(focusId&&focused!==el(focusId)&&current(revision)&&navigationRevision===nav&&document.activeElement===focused&&available(el(focusId)))focusDestination(page,focusId);});
  }
  const fold=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function search(){const tokens=fold(el('settings-search').value).trim().split(/\s+/).filter(Boolean),results=el('settings-results');results.replaceChildren();if(!tokens.length){message('settings-search-status','');results.hidden=true;return;}const entries=searchIndex.map(entry=>({...entry,label:t(entry.id==='launcher'?'settings.launcher.search.label':'settings.search.'+entry.id+'.label'),keywords:t(entry.id==='launcher'?'settings.launcher.search.keywords':'settings.search.'+entry.id+'.keywords'),scope:t(entry.id==='launcher'?'settings.launcher.search.scope':'settings.search.'+entry.id+'.scope')})),matches=entries.filter(entry=>tokens.every(token=>fold(entry.label+' '+entry.keywords+' '+entry.scope).includes(token)));results.hidden=false;for(const entry of matches){const button=node('button','settings-search-result');button.type='button';button.append(node('span','',entry.label),node('small','',entry.scope));button.addEventListener('click',()=>{el('settings-search').value='';search();showPage(entry.page,entry.target);});results.append(button);}message('settings-search-status',()=>matches.length?t('settings.search.results',{count:matches.length}):t('settings.search.empty'));}
  function cancelOutput(){if(outputSavedBaseline())applyOutput(outputSavedBaseline());if(scope&&loadedModel)outputDrafts.delete(key(loadedModel,scope.viewKey));message('output-error','');message('output-result',()=>t('settings.output.cancelled'));updateDirty();}
  function cancelComfy(){if(comfyBaseline)applyComfy(comfySubmitting?.revision===viewRevision?comfySubmitting.value:comfyBaseline);comfyDraft=null;message('comfy-error','');message('comfy-result',()=>t('settings.comfy.cancelled'));updateDirty();}
  function rememberForms(){if(outputDirty()&&scope&&loadedModel)outputDrafts.set(key(loadedModel,scope.viewKey),outputInput());if(comfyDirty())comfyDraft=comfyInput();}
  function discardForms(){if(scope&&loadedModel)outputDrafts.delete(key(loadedModel,scope.viewKey));comfyDraft=null;if(outputSavedBaseline())applyOutput(outputSavedBaseline());if(comfyBaseline)applyComfy(comfySubmitting?.revision===viewRevision?comfySubmitting.value:comfyBaseline);updateDirty();}
  function requestTransition(action,reason){if(!currentUnsaved())return action();if(transition){el('settings-unsaved-continue').focus({preventScroll:true});return transition.promise;}let resolve;const promise=new Promise(done=>resolve=done);transition={action,resolve,promise,focus:document.activeElement};el('settings-unsaved').hidden=false;message('settings-unsaved-message',()=>t('settings.transition.unsaved',{reason:typeof reason==='function'?reason():reason}));let secret=false;try{const url=new URL(el('comfy-url').value);secret=!!(url.username||url.password);}catch{}el('settings-unsaved-keep').disabled=secret&&comfyDirty();if(secret&&comfyDirty())message('settings-unsaved-message',()=>t('settings.transition.credentials'));el('settings-unsaved-continue').focus({preventScroll:true});return promise;}
  async function decideTransition(choice){const selected=transition;if(!selected)return;transition=null;el('settings-unsaved').hidden=true;if(choice==='continue'){selected.focus?.focus({preventScroll:true});selected.resolve(false);return;}if(choice==='keep')rememberForms();else discardForms();try{const result=await selected.action();selected.resolve(result);}catch(error){selected.resolve(false);message('output-error',error.message,true);}}
  function closeNow(restore=true){
    certificates.reset();localServices?.setVisible(false);nodeRenderers.clear();messageRenderers.clear();++generation;++viewRevision;++loraRevision;++navigationRevision;
    if(transition){transition.resolve(false);transition=null;}
    el('settings-unsaved').hidden=true;el('settings-view').hidden=true;el('app').hidden=!getState().authenticated;
    if(restore&&getState().authenticated){
      if(opener?.isConnected&&available(opener))opener.focus({preventScroll:true});
      else [el('conversation-options-toggle'),el('settings-open-sidebar')].find(available)?.focus({preventScroll:true});
    }
    return true;
  }
  function close(restore=true){if(el('settings-view').hidden)return true;return requestTransition(()=>closeNow(restore),()=>t('settings.transition.close'));}
  async function loadOutput(){
    const ticket=++generation,revision=viewRevision,epoch=getState().authEpoch,model=el('settings-model').value;loadedModel=model;outputBaseline=null;outputData=null;outputLoading(true);message('output-current',()=>model?t('settings.output.loading'):t('settings.output.noModel'));message('output-error','');message('output-result','');el('output-save').disabled=true;
    if(!model){message('output-origin',()=>t('settings.output.noOrigin'));message('output-effective',()=>t('settings.output.selectModel'));return;}
    try{const query=new URLSearchParams({model,...(scope.projectId?{projectId:scope.projectId}:{}),...(scope.id?{id:scope.id}:{})}),data=await api('/api/model-preferences?'+query);if(ticket!==generation||!current(revision)||epoch!==getState().authEpoch||el('settings-model').value!==model)return;outputData=data;const ready=pending.get(key(model,scope.viewKey)),value=ready?ready.maxOutputTokens:data.automatic===true||data.source==='auto'?null:data.maxOutputTokens;outputBaseline={mode:value===null?'auto':'manual',tokens:String(value??8192),destination:(ready?.applyToAllSessions??data.applyToAllSessions)?'model':'session'};applyOutput(outputBaseline);const draft=outputDrafts.get(key(model,scope.viewKey));if(draft&&!same(draft,outputBaseline))applyOutput(draft);else outputDrafts.delete(key(model,scope.viewKey));outputLoading(false);message('output-current',()=>ready?t('settings.output.ready'):t('settings.output.loaded'));updateDirty();}
    catch(e){if(ticket===generation&&current(revision))message('output-error',e.message,true);}finally{if(ticket===generation&&current(revision))el('output-save').disabled=!outputBaseline||savingRevision===viewRevision;}
  }
  async function loadLoras(){const revision=viewRevision,ticket=++loraRevision,url=el('comfy-url').value.trim();el('comfy-loras-refresh').disabled=true;message('comfy-loras-status',()=>t('settings.loras.loading'));try{const data=await api('/api/comfy/loras',{method:'POST',body:JSON.stringify({url})});if(ticket!==loraRevision||!current(revision)||el('comfy-url').value.trim()!==url)return;rememberLoras();loraNames=data.loras;showLoras();message('comfy-loras-status',()=>t('settings.loras.available',{count:data.loras.length}));}catch(e){if(ticket===loraRevision&&current(revision))message('comfy-loras-status',()=>t('settings.loras.unavailable',{error:e.message}));}finally{if(ticket===loraRevision&&current(revision))el('comfy-loras-refresh').disabled=false;}}
  async function loadComfy(revision){el('comfy-queue-paused').hidden=true;const ticket=++comfyRevision;comfyLoading(true);message('comfy-error','');message('comfy-result',()=>t('settings.loading'));try{const data=await api('/api/comfy/settings');if(ticket!==comfyRevision||!current(revision))return;acceptComfy(data);el('comfy-workflow').replaceChildren(...data.workflows.map(w=>{const option=node('option','',w.label);option.value=w.id;return option;}));loraNames=[];comfyBaseline={enabled:data.enabled,url:data.url,workflowId:data.workflowId,memoryCleanup:data.memoryCleanup===true,modelPolicy:modelPolicy(data.modelPolicy),loraProfiles:profileCopies(data.loraProfiles,data.workflows)};applyComfy(comfyBaseline);if(comfyDraft&&!same(comfyDraft,comfyBaseline))applyComfy(comfyDraft);else comfyDraft=null;comfyLoading(false);loadLoras();message('comfy-result',()=>data.activeJobs?t('settings.comfy.jobsBusy',{count:data.activeJobs}):'');comfyInfo();summaries();updateDirty();onChange?.();imagePermission();}catch(e){if(current(revision)){message('comfy-error',e.message,true);message('comfy-result','');}}}
  const capabilityText={"Modèles et réponses": ["models", "Modèles servis par Bionic. Plafond automatique de 8 192 tokens, adapté au contexte estimé à chaque appel ; réglage par modèle ou conversation."], "Fichiers du projet": ["files", "Lecture, création et modification selon le profil du message. Copies précédentes et reçus consultables. Projet de travail nécessaire."], "Internet": ["internet", "Recherche et lecture de pages publiques. DuckDuckGo sans clé ; disponibilité intermittente, secours Brave facultatif configuré sur le PC. Sans JavaScript ni connexion de compte."], "Scripts sur le PC": ["scripts", "Python, Node.js et PowerShell. Validation du code exact avant exécution. 120 secondes maximum par script, 4 propositions par tour."], "ComfyUI": ["comfy", "Intégration facultative. Workflows Krea2 Turbo et HassakuXL Illustrious v34. Une image par message, suivi persistant et téléchargement dans le chat."], "Contexte et actions": ["context", "Historique récent borné, reçu des fichiers et outils transmis. Résumés historiques limités à 2 400 caractères, à revérifier avant action."], "Bionic Desktop": ["desktop", "Historiques natifs consultés en lecture. MCP, skills, sous-agents et navigateur interactif de Desktop ne sont pas hérités."]};
  function renderCapabilities(){const target=el('settings-capabilities');if(!target)return;target.replaceChildren();if(capabilitiesFailed){target.append(node('dd','',t('settings.capabilities.error')));return;}for(const entry of capabilities||[]){const known=capabilityText[entry.name],id=known?.[1]===entry.description?known[0]:null;target.append(node('dt','',id?t('settings.capabilities.'+id+'.name'):entry.name),node('dd','',id?t('settings.capabilities.'+id+'.description'):entry.description));}}
  async function loadCapabilities(revision){try{const data=await api('/api/capabilities');if(!current(revision))return;capabilities=data.items;capabilitiesFailed=false;renderCapabilities();}catch{if(current(revision)){capabilities=null;capabilitiesFailed=true;renderCapabilities();}}}
  async function openNow(event={}){const revision=++viewRevision,state=getState();opener=event.currentTarget||document.activeElement;scope={projectId:state.projectId,id:state.chat?.source==='web'?state.chat.id:null,viewKey:state.viewKey,name:state.chat?.name||t('settings.chat.current')};outputBaseline=null;comfyBaseline=null;outputSubmitting=null;comfySubmitting=null;el('comfy-save').disabled=false;el('comfy-test').disabled=false;el('comfy-discover').disabled=false;invalidateSetup();forgetNodes(el('comfy-servers'));el('comfy-servers').replaceChildren();message('comfy-discovery-status','');el('diagnostics-open').disabled=false;el('diagnostics-result').replaceChildren();el('diagnostics-result').hidden=true;el('settings-unsaved').hidden=true;el('settings-view').hidden=false;el('app').hidden=true;el('settings-close').focus({preventScroll:true});el('settings-search').value='';search();el('settings-model').replaceChildren(...(state.status?.models||[]).map(m=>{const option=node('option','',m.name);option.value=m.id;return option;}));const selected=event.outputModel||el('model').value;el('settings-model').value=(state.status?.models||[]).some(m=>m.id===selected)?selected:state.status?.models?.[0]?.id||'';const security=showPage(event.page||'reading'),nav=navigationRevision;if(!event.page)el('settings-view').dataset.settingsIndex='true';summaries();await Promise.allSettled([security,loadOutput(),loadComfy(revision),loadCapabilities(revision)]);return {revision,nav};}
  function open(event){const request={currentTarget:event?.currentTarget||document.activeElement,page:event?.page,outputModel:event?.outputModel};return !el('settings-view').hidden&&currentUnsaved()?requestTransition(()=>openNow(request),()=>t('settings.transition.target')):openNow(request);}
  async function openPage(event,page,focusId){const opened=await open({currentTarget:event?.currentTarget||document.activeElement,outputModel:event?.outputModel,page});if(!opened||!current(opened.revision)||navigationRevision!==opened.nav||activePage!==page)return false;if(document.activeElement!==el('settings-close'))return false;if(focusId)focusDestination(page,focusId);return true;}
  function requestNavigate(target){return requestTransition(()=>{closeNow(false);return onNavigate?.(target);},()=>t('settings.transition.navigate'));}
  function reload(){return requestTransition(async()=>{const revision=++viewRevision;++generation;++loraRevision;outputBaseline=null;comfyBaseline=null;el('comfy-test').disabled=false;el('comfy-save').disabled=false;await Promise.allSettled([activePage==='connection'?certificates.load():Promise.resolve(),loadOutput(),loadComfy(revision),loadCapabilities(revision)]);return true;},()=>t('settings.transition.reload'));}
  listen('output-settings-form','submit',async event=>{
    event.preventDefault();if(savingRevision===viewRevision||!outputBaseline)return;
    savingRevision=viewRevision;el('output-save').disabled=true;message('output-error','');
    const model=loadedModel,value=el('output-mode').value==='auto'?null:Number(el('output-tokens').value),all=allSessions();
    const target={...scope},revision=viewRevision,epoch=getState().authEpoch,submitted=outputInput(),formGeneration=generation;
    const operationKey=key(model,target.viewKey),operation=++outputOperation;
    const sameForm=()=>current(revision)&&loadedModel===model&&generation===formGeneration;
    try{
      if(value!==null&&!validOutputTokens(value)){const error=Error(t('settings.output.invalid'));error.i18nKey='settings.output.invalid';throw error;}
      const preference={maxOutputTokens:value,applyToAllSessions:all};
      outputOperations.set(operationKey,operation);outputDrafts.delete(operationKey);outputSubmitting={revision,model,value:submitted};updateDirty();
      let data;
      if(target.id||all)data=await api('/api/model-preferences',{method:'POST',body:JSON.stringify({model,projectId:target.projectId,...(target.id?{id:target.id}:{}),...preference})});
      if(epoch!==getState().authEpoch||!getState().authenticated||outputOperations.get(operationKey)!==operation)return;
      if(!target.id&&!all)pending.set(operationKey,preference);else pending.delete(operationKey);
      if(same(outputDrafts.get(operationKey),submitted))outputDrafts.delete(operationKey);
      if(sameForm()){
        outputBaseline=submitted;outputData={...outputData,...data,source:all?(value===null?'auto':'model'):'session',automatic:value===null,maxOutputTokens:value??8192,applyToAllSessions:all};
        message('output-result',()=>!target.id&&!all?t('settings.output.firstSaved'):all?t('settings.output.modelSaved'):t('settings.output.chatSaved'));outputInfo();
      }
    }catch(e){if(sameForm())message('output-error',()=>e.i18nKey?t(e.i18nKey):e.message,true);}
    finally{if(savingRevision===revision)savingRevision=null;if(outputSubmitting?.revision===revision&&outputSubmitting.model===model)outputSubmitting=null;if(current(revision)){el('output-save').disabled=!outputBaseline||savingRevision===viewRevision;updateDirty();}}
  });
  listen('comfy-settings-form','submit',async event=>{event.preventDefault();const revision=viewRevision,epoch=getState().authEpoch,ticket=++comfyRevision,submitted=comfyInput();comfySubmitting={revision,value:submitted};el('comfy-save').disabled=true;message('comfy-error','');updateDirty();try{const data=await api('/api/comfy/settings',{method:'POST',body:JSON.stringify({...submitted,url:submitted.url.trim()})});if(ticket!==comfyRevision||epoch!==getState().authEpoch||!getState().authenticated)return;acceptComfy(data);if(current(revision)){const unchanged=same(comfyInput(),submitted);comfyBaseline={enabled:data.enabled,url:data.url,workflowId:data.workflowId,memoryCleanup:data.memoryCleanup===true,modelPolicy:modelPolicy(data.modelPolicy),loraProfiles:profileCopies(data.loraProfiles,data.workflows)};if(unchanged)applyComfy(comfyBaseline);comfyDraft=null;message('comfy-result',()=>t(comfy.enabled?'settings.comfy.savedEnabled':'settings.comfy.savedDisabled'));comfyInfo();summaries();}onChange?.();imagePermission();}catch(e){if(current(revision))message('comfy-error',e.message,true);}finally{if(comfySubmitting?.revision===revision)comfySubmitting=null;if(current(revision)){el('comfy-save').disabled=false;updateDirty();}}});
  function invalidateSetup(){
    ++setupRevision;el('comfy-diagnostic').hidden=true;message('comfy-result','');forgetNodes(el('comfy-servers'));el('comfy-servers').replaceChildren();message('comfy-discovery-status','');
  }
  async function checkComfy(){
    const revision=viewRevision,ticket=++setupRevision,operation=++setupOperation;
    el('comfy-test').disabled=true;message('comfy-error','');message('comfy-result',()=>t('settings.comfy.checking'));el('comfy-diagnostic').hidden=true;
    try{
      const {url,workflowId,loraProfiles,memoryCleanup}=comfyInput();
      const data=await api('/api/comfy/check',{method:'POST',body:JSON.stringify({url,workflowId,loraProfiles,memoryCleanup})});
      if(!current(revision)||ticket!==setupRevision)return;
      el('comfy-diagnostic').hidden=false;forgetNodes(el('comfy-models'));el('comfy-models').replaceChildren();el('comfy-node-errors').replaceChildren();
      message('comfy-server-status',()=>data.reachable?t('settings.comfy.connected',{url:data.url,version:data.system?.comfyuiVersion||t('settings.comfy.unknownVersion')}):t('settings.comfy.unreachable',{error:data.error||t('settings.comfy.checkAddress')}));
      const selected=data.workflows?.find(w=>w.id===workflowId);
      message('comfy-model-status',()=>data.reachable?t('settings.comfy.expectedFiles',{model:selected?.label||t('settings.comfy.thisModel')}):t('settings.comfy.modelsUnchecked'));
      for(const model of selected?.models||[])el('comfy-models').append(translatedNode('li','',()=>t(model.available?'settings.comfy.modelPresent':'settings.comfy.modelMissing',{name:model.name,folder:model.folder})));
      for(const error of selected?.errors||[])el('comfy-node-errors').append(node('li','error',error));
      const memory=data.memoryCleanup;
      message('comfy-memory-status',()=>!data.reachable?t('settings.comfy.memoryUnchecked'):memory?.compatible?(memoryCleanup?t('settings.comfy.memoryEnabled'):t('settings.comfy.memoryAvailable')):(memory?.available?t('settings.comfy.memoryBadLink'):t('settings.comfy.memoryMissing'))+(memoryCleanup?t('settings.comfy.memoryUncheck'):t('settings.comfy.memoryNotBlocking')));
      message('comfy-result',()=>data.ok?t('settings.comfy.checked'):memoryCleanup&&selected?.models?.every(m=>m.available)?t('settings.comfy.checkNodes'):t('settings.comfy.fixReported'));
    }catch(e){if(current(revision)&&ticket===setupRevision){message('comfy-error',e.message,true);message('comfy-result','');}}
    finally{if(current(revision)&&operation===setupOperation)el('comfy-test').disabled=false;}
  }
  el('comfy-test').addEventListener('click',checkComfy);
  el('comfy-discover').addEventListener('click',async()=>{
    const revision=viewRevision,ticket=++setupRevision,operation=++discoveryOperation,url=el('comfy-url').value.trim();
    el('comfy-discover').disabled=true;forgetNodes(el('comfy-servers'));el('comfy-servers').replaceChildren();message('comfy-error','');message('comfy-discovery-status',()=>t('settings.comfy.discovering'));el('comfy-diagnostic').hidden=true;
    try{
      const data=await api('/api/comfy/discover',{method:'POST',body:JSON.stringify({url})});
      if(!current(revision)||ticket!==setupRevision)return;
      message('comfy-discovery-status',()=>data.servers.length?t('settings.comfy.found',{count:data.servers.length}):t('settings.comfy.noneFound'));
      for(const server of data.servers){
        const button=translatedNode('button','file-action',()=>t('settings.comfy.useServer',{url:server.url}));button.type='button';
        button.addEventListener('click',()=>{el('comfy-url').value=server.url;invalidateSetup();updateDirty();checkComfy();});el('comfy-servers').append(button);
      }
    }catch(e){if(current(revision)&&ticket===setupRevision)message('comfy-discovery-status',e.message);}
    finally{if(current(revision)&&operation===discoveryOperation)el('comfy-discover').disabled=false;}
  });
  listen('comfy-queue-resume','click',async()=>{
    if(comfy?.queuePaused!==true||pendingResume?.revision===viewRevision)return;
    const revision=viewRevision,epoch=getState().authEpoch,ticket=++resumeRevision;
    const sameResume=()=>current(revision)&&getState().authEpoch===epoch&&ticket===resumeRevision;
    pendingResume={revision,ticket};el('comfy-queue-resume').disabled=true;message('comfy-error','');message('comfy-result',BionicI18n.t("components.beta25.a4fe8f042b"));
    try{
      await api('/api/comfy/queue/resume',{method:'POST',body:JSON.stringify({})});
      if(!sameResume())return;
      const data=await api('/api/comfy/settings');
      if(!sameResume())return;
      comfy={...comfy,queuePaused:data.queuePaused===true,activeJobs:data.activeJobs??comfy?.activeJobs};
      comfyInfo();message('comfy-result',comfy.queuePaused?BionicI18n.t("components.beta25.4c24f6da74"):BionicI18n.t("components.beta25.4edf1f013f"));
    }catch(e){if(sameResume()){message('comfy-error',e.message,true);message('comfy-result','');}}
    finally{if(pendingResume?.ticket===ticket)pendingResume=null;if(sameResume())el('comfy-queue-resume').disabled=false;}
  });
  listen('comfy-model-policy','change',updateDirty);
  listen('comfy-memory-cleanup','change',()=>{invalidateSetup();updateDirty();});
  listen('comfy-workflow','change',()=>{invalidateSetup();rememberLoras();editingWorkflow=el('comfy-workflow').value;showLoras();updateDirty();});listen('comfy-loras-refresh','click',loadLoras);for(const index of [1,2]){listen('comfy-lora-'+index+'-strength','input',()=>{invalidateSetup();showStrength(index);updateDirty();});listen('comfy-lora-'+index,'change',()=>{invalidateSetup();updateDirty();});}for(const id of ['comfy-enabled','comfy-url'])listen(id,id==='comfy-url'?'input':'change',()=>{invalidateSetup();updateDirty();});
  listen('settings-model','change',()=>{const next=el('settings-model').value;if(next===loadedModel)return;el('settings-model').value=loadedModel;return requestTransition(()=>{el('settings-model').value=next;return loadOutput();},()=>t('settings.transition.model'));});
  listen('output-mode','change',()=>{outputMode();updateDirty();});listen('output-all-sessions','change',updateDirty);listen('output-tokens','input',()=>{syncOutputSlider();updateDirty();});listen('output-tokens-slider','input',()=>{el('output-tokens').value=el('output-tokens-slider').value;syncOutputSlider();updateDirty();});listen('output-cancel','click',cancelOutput);listen('comfy-cancel','click',cancelComfy);listen('settings-reload','click',reload);
  listen('settings-close','click',()=>close());listen('settings-view','keydown',event=>{if(event.key==='Escape'){event.preventDefault();if(transition)decideTransition('continue');else close();}});for(const choice of ['continue','discard','keep'])listen('settings-unsaved-'+choice,'click',()=>decideTransition(choice));for(const button of document.querySelectorAll('#settings-nav [data-settings-page]'))button.addEventListener('click',()=>showPage(button.dataset.settingsPage,'settings-heading-'+button.dataset.settingsPage));listen('settings-back','click',()=>{++navigationRevision;if(activePage==='connection')certificates.reset();localServices?.setVisible(false);el('settings-view').dataset.settingsIndex='true';el('settings-search').focus({preventScroll:true});});listen('settings-search','input',search);
  for(const [id,target]of [['settings-edit-model','model'],['settings-edit-tools','tools'],['settings-edit-image','image']])listen(id,'click',()=>requestNavigate(target));listen('settings-open-sidebar','click',open);globalThis.addEventListener?.('beforeunload',event=>{if(getState().authenticated&&hasUnsaved()){event.preventDefault();event.returnValue='';}});
  function languageStatus(){if(languagePersisted===null){message('interface-language-status','');return;}message('interface-language-status',()=>t(languagePersisted?'settings.language.saved':'settings.language.unpersisted'),!languagePersisted);}
  function setupLanguage(){const select=el('interface-language');if(!select)return;select.replaceChildren(...i18n.languages.map(language=>{const option=node('option','',language.label);option.value=language.code;return option;}));select.value=i18n.getLanguage();languageStatus();}
  listen('interface-language','change',()=>{const result=i18n.setLanguage(el('interface-language').value);languagePersisted=result.persisted;el('interface-language').value=i18n.getLanguage();languageStatus();});
  i18n.onChange(()=>{
    if(el('interface-language'))el('interface-language').value=i18n.getLanguage();
    for(const [id,{render,error}]of [...messageRenderers])message(id,render,error);
    for(const [target,render]of [...nodeRenderers]){if(target.isConnected===false){nodeRenderers.delete(target);continue;}target.textContent=render();}
    // Update LoRA labels in place to preserve focus, values and unsaved strengths.
    for(const index of [1,2]){const select=el('comfy-lora-'+index);for(const option of select?.options||[]){if(!option.value)option.textContent=t('settings.lora.none');else option.textContent=option.value+(loraNames.includes(option.value)?'':t('settings.lora.checkPresence'));}if(el('comfy-lora-'+index+'-strength'))showStrength(index);}
    if(!el('settings-view').hidden){summaries();search();if(scope)outputInfo();if(comfy)comfyInfo();renderCapabilities();}
    if(comfy)imagePermission();syncOutputSlider();languageStatus();
  });
  setupLanguage();
  renderCompanionHelp({container:el('help-content'),node,navigate:(page,id)=>showPage(page,id)});
  return {refresh,close,openPage,async openService(id){if(await openPage({currentTarget:document.activeElement},'servers','settings-heading-servers'))await localServices?.openService(id);},requestNavigate,hasUnsaved,revision:()=>viewRevision,isCurrent:revision=>current(revision),async openOutput(event,model){if(await openPage({currentTarget:event?.currentTarget||document.activeElement,outputModel:model},'models',model?'output-mode':'settings-model'))el('output-settings-form').scrollIntoView({block:'start'});},async openSecurity(){await openPage({currentTarget:el('settings-open-sidebar')},'connection','certificate-title');},imagePermission,imageDefaultEnabled:()=>comfy?.enabled===true&&comfy?.available===true,enabled:()=>comfy?.enabled===true,decorate(data){const preference=pending.get(key(data.model));return {...data,...(preference?{outputPreferences:preference}:{}),...(data.imageAccess?{imageWorkflowId:el('image-workflow').value||comfy?.workflowId,imageCount:imageCount(el('image-count').value),...(imagePolicyChoice(el('image-model-policy').value)?{imageModelPolicy:el('image-model-policy').value}:{})}:{})};},accepted(data,viewKey){const k=key(data.model,viewKey),value=pending.get(k);if(value&&same(value,data.outputPreferences))pending.delete(k);},reset(){localServices?.reset();pending.clear();outputDrafts.clear();outputOperations.clear();++comfyRevision;comfyDraft=null;outputBaseline=null;comfyBaseline=null;comfy=null;pendingComfyAvailability=null;outputSubmitting=null;comfySubmitting=null;closeNow(false);}};
}
