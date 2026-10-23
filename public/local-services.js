/* Manual engine control. Server capabilities, ownership and revisions are authoritative. */
function createLocalServices({api,node,getState,onNavigate,onComfyAvailability,pollMs=2500}) {
  const i18n=globalThis.BionicI18n,t=(key,params)=>i18n.t('settings.launcher.'+key,params),el=id=>document.getElementById(id);
  const views=new Map(),services=new Map(),pending=new Map(),storageKey='bionic.local-service-requests.v1';
  let visible=false,timer=null,loading=null,epoch=0,nonce='',lastSeen=null,disconnected=false,reloading=false,setupData=null,lastComfyAvailability=null;
  const terminal=status=>['succeeded','failed','unknown'].includes(status);
  const safeState=(value,allowed,fallback='unknown')=>allowed.includes(value)?value:fallback;
  const time=value=>{try{return value?i18n.date(value,{hour:'2-digit',minute:'2-digit',second:'2-digit'}):t('unchecked');}catch{return t('unchecked');}};
  const text=(target,value)=>{if(target.textContent!==value)target.textContent=value;};
  const name=id=>id==='bionic'?'Bionic':'ComfyUI';
  const valid=()=>getState().authenticated===true;
  function requestKey(){if(globalThis.crypto.randomUUID)return globalThis.crypto.randomUUID();const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const value=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');return value.slice(0,8)+'-'+value.slice(8,12)+'-'+value.slice(12,16)+'-'+value.slice(16,20)+'-'+value.slice(20);}
  function persist(){try{sessionStorage.setItem(storageKey,JSON.stringify([...pending].map(([id,value])=>({id,key:value.key}))));}catch{/* Recovery also uses the server's latest operation. */}}
  try{for(const item of JSON.parse(sessionStorage.getItem(storageKey)||'[]'))if(['bionic','comfyui'].includes(item.id)&&typeof item.key==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(item.key))pending.set(item.id,{key:item.key,uncertain:true});}catch{/* Storage can be denied. */}
  function button(label,handler){const target=node('button','file-action');target.type='button';target.addEventListener('click',handler);target.label=label;return target;}
  function reason(code){const aliases={stale_revision:'revision_changed','csrf-refused':'revision_changed',setup_required:'unconfigured',configuration_invalid:'invalid_configuration',platform_unsupported:'not_supported',reconciliation_required:'process_unknown',operation_active:'operation_in_progress',already_running:'already_running',external_service:'external_process',identity_unconfirmed:'identity_changed',service_busy:'activity_active',interrupted:'process_unknown',effect_unconfirmed:'process_unknown',process_stopped:'process_exited',termination_unconfirmed:'stop_timeout',availability_unconfirmed:'api_timeout',activity_or_identity_changed:'activity_changed','service-busy':'busy','revision-changed':'revision_changed','activity-unknown':'activity_unknown'};code=aliases[code]||code;const known=['desktop_start_required','desktop_start_unconfirmed','already_running','activity_changed','unconfigured','invalid_configuration','observe_only','external_process','activity_unknown','activity_active','revision_changed','operation_in_progress','process_unknown','not_supported','exclusive_control_required','controller_unavailable','identity_changed','api_timeout','stop_timeout','process_exited','configuration_changed','maintenance','busy','not_owned','unqualified'];return t('reason.'+(known.includes(code)?code:'unavailable'));}
  function createView(id){
    const section=node('section','local-service');section.id='launcher-'+id;section.setAttribute('aria-labelledby','launcher-'+id+'-title');
    const heading=node('h3','');heading.id='launcher-'+id+'-title';heading.tabIndex=-1;
    const summary=node('p','local-service-summary'),observations=node('dl','local-service-observations'),fields={};
    for(const key of ['process','api','model','activity']){const term=node('dt',''),value=node('dd','');observations.append(term,value);fields[key]={term,value};}
    const actions=node('div','settings-actions'),buttons={};for(const action of ['start','stop','restart']){buttons[action]=button(action,()=>intend(id,action));buttons[action].id='launcher-'+id+'-'+action;actions.append(buttons[action]);}
    const check=button('check',()=>refresh());actions.append(check);
    const unavailable=node('p','local-service-unavailable');unavailable.id='launcher-'+id+'-unavailable';for(const control of Object.values(buttons))control.setAttribute('aria-describedby',unavailable.id);
    const confirmation=node('div','local-service-confirmation');confirmation.hidden=true;confirmation.setAttribute('role','group');confirmation.setAttribute('aria-labelledby','launcher-'+id+'-confirm-title');
    const confirmTitle=node('h4','');confirmTitle.id='launcher-'+id+'-confirm-title';confirmTitle.tabIndex=-1;
    const impact=node('p',''),activity=node('p',''),confirmActions=node('div','settings-actions');
    const cancel=button('confirm.cancel',()=>cancelConfirmation(id)),confirm=button('',()=>submit(id));confirm.className='file-action';confirmActions.append(cancel,confirm);confirmation.append(confirmTitle,impact,activity,confirmActions);
    const operation=node('div','local-service-operation');operation.hidden=true;operation.tabIndex=-1;const operationText=node('p',''),continues=node('p','');operation.append(operationText,continues);
    const error=node('p','error');error.hidden=true;error.setAttribute('role','alert');
    const details=node('details','local-service-details'),detailTitle=node('summary',''),detailText=node('p','');details.append(detailTitle,detailText,observations,buttons.restart);
    const editor=node('details','local-service-setup'),editorTitle=node('summary','');editor.hidden=true;editor.id='launcher-'+id+'-setup';editorTitle.id=editor.id+'-title';editor.append(editorTitle);
    const setupHelp=node('p',''),setupActions=node('div','settings-actions'),detect=button('configure.detect',()=>configure(id,'discover')),pick=button('configure.pick',()=>configure(id,'pick'));detect.id='launcher-'+id+'-detect';pick.id='launcher-'+id+'-pick';setupActions.append(detect,pick);
    const candidates=node('select','');candidates.id='launcher-'+id+'-candidates';candidates.hidden=true;candidates.addEventListener('change',()=>applyCandidate(id));
    const advanced=node('details','local-service-details'),advancedTitle=node('summary','');advanced.append(advancedTitle);const inputs={};
    for(const field of id==='bionic'?['appPath','cliPath','apiInfoPath']:['workingDirectory','pythonPath','entryPath']){const label=node('label','local-service-field'),caption=node('span',''),input=node('input','');input.id='launcher-'+id+'-'+field;input.type='text';input.autocomplete='off';input.spellcheck=false;input.maxLength=2048;input.addEventListener('input',()=>{views.get(id).setupDirty=true;});label.append(caption,input);advanced.append(label);inputs[field]={input,caption};}
    const consentLabel=node('label','local-service-consent'),consent=node('input',''),consentText=node('span','');consent.type='checkbox';consent.id='launcher-'+id+'-exclusive';consent.addEventListener('change',render);consentLabel.append(consent,consentText);
    const save=button('configure.save',()=>configure(id,'save'));save.id='launcher-'+id+'-save';const setupStatus=node('p','');setupStatus.tabIndex=-1;setupStatus.id='launcher-'+id+'-setup-status';setupStatus.setAttribute('role','status');setupStatus.setAttribute('aria-live','polite');
    editor.append(setupHelp,setupActions,candidates,advanced,consentLabel,save,setupStatus);
    const setup=button('setup',()=>{editor.hidden=false;editor.open=true;editorTitle.focus({preventScroll:true});editor.scrollIntoView({block:'nearest'});loadSetup(true);});setup.id='launcher-'+id+'-configure';
    const related=button(id==='bionic'?'modelsLink':'imagesLink',()=>onNavigate?.(id==='bionic'?'models':'images'));
    const links=node('div','settings-actions');links.append(setup,related);
    const scope=node('p','local-service-scope');section.append(heading,summary,scope,actions,unavailable,confirmation,operation,error,details,links,editor);el('local-services-list').append(section);
    const view={section,heading,summary,scope,fields,buttons,check,unavailable,confirmation,confirmTitle,impact,activity,cancel,confirm,operation,operationText,continues,error,details,detailTitle,detailText,setup,related,editor,editorTitle,setupHelp,detect,pick,candidates,advancedTitle,inputs,consent,consentText,save,setupStatus,setupBusy:false,setupMessage:null,candidateData:[],intention:null,errorCode:null};views.set(id,view);return view;
  }
  for(const id of ['bionic','comfyui'])createView(id);
  function announce(value){const target=el('local-services-status');if(target)text(target,value);}
  function render(){
    for(const [id,view]of views){
      const service=services.get(id),engine=name(id),request=pending.get(id),op=service?.operation,active=!!op&&!terminal(op.status),busy=!!request||active;
      text(view.heading,t(id));
      const configuration=safeState(service?.configuration?.status,['unconfigured','valid','invalid'],'unconfigured');
      const process=safeState(service?.process?.state,['stopped','running','starting','stopping','external','unknown']);
      const apiState=safeState(service?.api?.state==='unavailable'?'unreachable':service?.api?.state,['ready','reachable','checking','unreachable','unknown','unchecked']);
      const running=['ready','reachable'].includes(apiState),working=['active','busy'].includes(service?.activity?.state);
      const simple=active||request?'working':working?'busy':running?'available':process==='stopped'?'stopped':'reconnect';
      text(view.summary,disconnected?t('connectionLost',{time:time(lastSeen)}):!service?t('loading'):configuration!=='valid'?t('configuration.'+configuration):t('simple.'+simple));
      text(view.scope,id==='bionic'?t('bionicScope'):'');view.scope.hidden=id!=='bionic';
      for(const key of ['process','api','model','activity'])text(view.fields[key].term,t('label.'+key));
      text(view.fields.process.value,t('process.'+process));
      text(view.fields.api.value,t('api.'+apiState)+(service?.api?.observedAt?' · '+time(service.api.observedAt):''));
      const model=service?.model;
      text(view.fields.model.value,model?.state==='loaded'&&Number.isSafeInteger(model.count)?t('model.loaded',{count:model.count}):['none','empty','unloaded'].includes(model?.state)?t('model.none'):t('model.unchecked'));
      const activity=service?.activity;
      text(view.fields.activity.value,['idle','clear'].includes(activity?.state)?t('activity.idle'):['active','busy'].includes(activity?.state)&&Number.isSafeInteger(activity.count)?t('activity.active',{count:activity.count}):t('activity.unchecked'));
      const reasons=[];if(view.intention&&service?.revision!==view.intention.revision)reasons.push(reason('revision_changed'));
      for(const [action,control]of Object.entries(view.buttons)){const capability=service?.actions?.[action];text(control,t(id==='bionic'&&action==='stop'?'stopApi':action,{engine}));control.hidden=configuration!=='valid'||!capability?.allowed;control.disabled=!capability?.allowed||disconnected||busy||!valid();if(capability&&!capability.allowed&&capability.reasonCode!=='already_running')reasons.push(reason(capability.reasonCode));}
      text(view.check,t('check'));view.check.disabled=!!loading;
      const controllable=service?.actions?.stop?.allowed||service?.actions?.start?.allowed;
      text(view.unavailable,configuration!=='valid'?t('setupHelp'):!controllable?reasons[0]||t('recovery'):'');view.unavailable.hidden=!view.unavailable.textContent;
      text(view.setup,t('setup'));text(view.related,t(id==='bionic'?'modelsLink':'imagesLink'));text(view.detailTitle,t('details'));
      const mode=safeState(service?.controlMode,['owned-process','observe-only','bionic-cli'],'observe-only');
      text(view.detailText,t('mode.'+mode)+(service?.configuration?.profileLabel?' · '+service.configuration.profileLabel:'')+(service?.configuration?.reasonCode?' · '+reason(service.configuration.reasonCode):''));
      view.confirmation.hidden=!view.intention;
      if(view.intention){const action=view.intention.action;text(view.confirmTitle,t('confirm.'+action,{engine}));text(view.impact,t('impact.'+action,{usage:t('usage.'+id)})+(id==='bionic'?' '+t('bionicScope'):''));text(view.activity,t('confirm.activity',{time:time(service?.activity?.observedAt)}));text(view.cancel,t('confirm.cancel'));text(view.confirm,t('confirm.'+action+'Action',{engine}));view.confirm.disabled=busy||disconnected||!service?.actions?.[action]?.allowed||service?.revision!==view.intention.revision;}
      view.operation.hidden=!op&&!request;
      if(request?.uncertain)text(view.operationText,t('unknownResult'));
      else if(op){const phaseAlias={reserved:'accepted',stopped:'stopped',complete:'completed',reconcile:'unknown'};const phase=safeState(phaseAlias[op.phase]||op.phase,['accepted','checking','stopping','starting','checking-api','checking_activity','stopping_process','starting_process','checking_api','stopped','completed','failed','unknown']);const status=safeState(op.status,['accepted','running','succeeded','failed','unknown']);text(view.operationText,t('operation',{engine,action:t('action.'+safeState(op.action,['start','stop','restart'],'start')),status:t('status.'+status),phase:t('phase.'+phase)}));}
      else if(request)text(view.operationText,t('sending',{engine}));
      const startedAt=typeof op?.startedAt==='number'?op.startedAt:Date.parse(op?.startedAt);if(op&&!terminal(op.status)&&Number.isFinite(startedAt))text(view.operationText,view.operationText.textContent+' · '+t('elapsed',{count:Math.max(0,Math.floor((Date.now()-startedAt)/1000))}));
      view.operation.setAttribute('aria-busy',String(!!request||!!active));text(view.continues,t('continues'));view.continues.hidden=!active&&!request;
      const failure=view.errorCode||(['failed','unknown'].includes(op?.status)?op.resultCode:null);text(view.error,failure?reason(failure):'');view.error.hidden=!failure;
      text(view.editorTitle,t('configure.title',{engine}));text(view.advancedTitle,t('configure.advanced'));text(view.setupHelp,t(setupData?.canConfigure===true?'configure.help':'configure.pcOnly'));text(view.detect,t('configure.detect'));text(view.pick,t('configure.pick'));text(view.save,t('configure.save'));text(view.consentText,t('configure.exclusive'));view.candidates.setAttribute('aria-label',t('configure.candidates'));
      for(const [field,{caption,input}]of Object.entries(view.inputs)){text(caption,t('configure.field.'+field));input.disabled=view.setupBusy||setupData?.canConfigure!==true;}
      for(const control of [view.detect,view.pick,view.save,view.consent,view.candidates])control.disabled=view.setupBusy||setupData?.canConfigure!==true||disconnected||busy;view.save.disabled||=view.consent.checked!==true;
      if(view.setupMessage)text(view.setupStatus,t('configure.'+view.setupMessage));
    }
    const reload=el('local-services-reload');if(reload)reload.disabled=reloading||!!loading;
  }
  async function loadSetup(force=false){
    if(!nonce||!valid()||setupData&&!force)return;const ticket=epoch,auth=getState().authEpoch;
    try{const data=await api('/api/local-service-setup',{headers:{'X-Local-Service-CSRF':nonce}});if(ticket!==epoch||auth!==getState().authEpoch||!valid())return;setupData=data;
      for(const service of data.services||[]){const view=views.get(service.id);if(!view||view.setupDirty)continue;for(const [field,{input}]of Object.entries(view.inputs))input.value=service.profile?.[field]||'';}
    }catch{if(ticket===epoch&&auth===getState().authEpoch)setupData={canConfigure:false};}finally{if(ticket===epoch)render();}
  }
  function applyCandidate(id){const view=views.get(id),candidate=view.candidateData[Number(view.candidates.value)];if(!candidate)return;for(const [field,{input}]of Object.entries(view.inputs))input.value=candidate.profile?.[field]||'';view.setupDirty=true;view.setupMessage='review';render();}
  async function configure(id,action){
    const view=views.get(id);if(view.setupBusy||setupData?.canConfigure!==true||disconnected||pending.has(id)||!valid())return;
    if(action==='save'&&view.consent.checked!==true)return;view.setupBusy=true;view.setupMessage='working';render();const ticket=epoch,auth=getState().authEpoch;
    const payload={serviceId:id};if(action==='save'){payload.expectedRevision=setupData.revision;payload.exclusiveControl=true;payload.profile=Object.fromEntries(Object.entries(view.inputs).filter(([,v])=>v.input.value?.trim()).map(([field,v])=>[field,v.input.value.trim()]));}
    try{const result=await api('/api/local-service-setup/'+action,{method:'POST',headers:{'X-Local-Service-CSRF':nonce},body:JSON.stringify(payload)});if(ticket!==epoch||auth!==getState().authEpoch||!valid())return;
      if(action==='save'){setupData=result;view.setupDirty=false;view.consent.checked=false;view.setupMessage='saved';await refresh();}
      else{view.candidateData=result.candidates||[];view.candidates.replaceChildren(...view.candidateData.map((candidate,index)=>{const option=node('option','',candidate.label);option.value=String(index);return option;}));view.candidates.hidden=view.candidateData.length<2;if(view.candidateData.length){view.candidates.value='0';applyCandidate(id);}else view.setupMessage=result.cancelled?'cancelled':'notFound';}
    }catch(error){if(ticket===epoch&&auth===getState().authEpoch&&valid()){view.setupMessage=['setup-stale-revision','stale_revision','revision-changed'].includes(error.code)?'changed':'failed';if(view.setupMessage==='changed')await loadSetup(true);}}
    finally{if(ticket===epoch&&auth===getState().authEpoch&&valid()){view.setupBusy=false;render();view.setupStatus.focus?.({preventScroll:true});}}
  }
  function cancelConfirmation(id,restore=true){let found=false;for(const [key,view]of views)if((!id||id===key)&&view.intention){const action=view.intention.action;view.intention=null;found=true;if(restore)view.buttons[action].focus({preventScroll:true});}if(found)render();return found;}
  function intend(id,action){const service=services.get(id),view=views.get(id);if(!service?.actions?.[action]?.allowed||disconnected||pending.has(id))return;if(action==='start')return submit(id,action);cancelConfirmation(null,false);view.intention={action,revision:service.revision};render();view.confirmTitle.focus({preventScroll:true});}
  async function submit(id,directAction){
    const service=services.get(id),view=views.get(id),action=directAction||view.intention?.action,revision=view.intention?.revision??service?.revision;
    if(!action||pending.has(id)||disconnected||!service?.actions?.[action]?.allowed||revision!==service.revision)return;
    const key=requestKey(),ticket=epoch,auth=getState().authEpoch;pending.set(id,{key});persist();view.intention=null;view.errorCode=null;render();view.operation.focus({preventScroll:true});
    try{const result=await api('/api/local-services/'+id+'/actions',{method:'POST',headers:{'X-Local-Service-CSRF':nonce},body:JSON.stringify({action,expectedRevision:revision,idempotencyKey:key})});if(ticket!==epoch||auth!==getState().authEpoch||!valid())return;const operation=result.operation||result;services.set(id,{...service,operation});pending.delete(id);persist();announce(t('operationAccepted',{engine:name(id)}));}
    catch(error){if(ticket!==epoch||auth!==getState().authEpoch||!valid())return;if(error.status&&error.status<500){pending.delete(id);persist();view.errorCode=error.code||'unavailable';}else{pending.set(id,{key,uncertain:true});persist();}}
    finally{if(ticket===epoch&&auth===getState().authEpoch&&valid()){render();if(visible)await refresh();}}
  }
  function schedule(){clearTimeout(timer);timer=null;if(visible&&!document.hidden&&valid())timer=setTimeout(()=>refresh(),pollMs);}
  function syncComfyAvailability(){const apiState=services.get('comfyui')?.api?.state;const available=['ready','reachable'].includes(apiState)?true:['unavailable','unreachable'].includes(apiState)?false:null;if(available!==null&&available!==lastComfyAvailability){lastComfyAvailability=available;onComfyAvailability?.(available);}}
  async function recover(ticket,auth){for(const [id,request]of [...pending]){try{const result=await api('/api/local-service-operations/'+encodeURIComponent(request.key));if(ticket!==epoch||auth!==getState().authEpoch||!valid())return;const operation=result.operation||result;if(operation?.id){services.set(id,{...services.get(id),operation});pending.delete(id);persist();}}catch(error){if(error.status===404){/* Acceptance is uncertain: never replay or infer failure from a missing observation. */}}}}
  async function refresh(){
    if(!visible||!valid())return;if(loading)return loading;
    const ticket=epoch,auth=getState().authEpoch;
    loading=(async()=>{try{const data=await api('/api/local-services');if(ticket!==epoch||auth!==getState().authEpoch||!valid())return;nonce=typeof data.csrfNonce==='string'?data.csrfNonce:'';for(const service of data.services||[])if(views.has(service.id))services.set(service.id,service);disconnected=false;lastSeen=new Date().toISOString();await recover(ticket,auth);await loadSetup();if(ticket!==epoch||auth!==getState().authEpoch||!valid())return;syncComfyAvailability();const signature=[...services].map(([id,value])=>id+':'+value.revision+':'+value.operation?.status).join('|');if(signature!==refresh.signature){refresh.signature=signature;announce([...services].map(([id,value])=>name(id)+' : '+t('api.'+safeState(value.api?.state==='unavailable'?'unreachable':value.api?.state,['ready','reachable','checking','unreachable','unknown','unchecked']))).join(' · '));}}
      catch{if(ticket===epoch&&auth===getState().authEpoch&&valid()){disconnected=true;announce(t('connectionLost',{time:time(lastSeen)}));}}
      finally{if(ticket===epoch){loading=null;render();schedule();}}})();render();return loading;
  }
  function setVisible(value){visible=value===true;if(!visible){++epoch;loading=null;reloading=false;for(const view of views.values())view.setupBusy=false;clearTimeout(timer);timer=null;cancelConfirmation(null,false);return;}return refresh();}
  function reset(){++epoch;visible=false;clearTimeout(timer);timer=null;loading=null;nonce='';setupData=null;lastComfyAvailability=null;for(const view of views.values()){view.setupBusy=false;view.setupDirty=false;view.setupMessage=null;view.candidateData=[];view.candidates.replaceChildren();view.candidates.hidden=true;view.consent.checked=false;view.editor.open=false;view.editor.hidden=true;view.setupStatus.textContent='';for(const {input}of Object.values(view.inputs))input.value='';}services.clear();pending.clear();persist();lastSeen=null;disconnected=false;cancelConfirmation(null,false);render();}
  async function reload(){if(reloading||!visible||disconnected)return;reloading=true;cancelConfirmation(null,false);render();const ticket=epoch,auth=getState().authEpoch;try{await api('/api/local-services/configuration/reload',{method:'POST',headers:{'X-Local-Service-CSRF':nonce},body:'{}'});if(ticket===epoch&&auth===getState().authEpoch&&valid())await refresh();}catch{if(ticket===epoch&&auth===getState().authEpoch&&valid())announce(t('reloadFailed'));}finally{if(ticket===epoch){reloading=false;render();}}}
  el('local-services-reload')?.addEventListener('click',reload);
  el('settings-view')?.addEventListener('keydown',event=>{if(event.key==='Escape'&&cancelConfirmation()){event.preventDefault();event.stopPropagation();}},true);
  document.addEventListener?.('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;}else if(visible)refresh();});
  i18n.onChange(render);render();
  return {setVisible,refresh,reset,cancelConfirmation,async openService(id){await setVisible(true);views.get(id)?.heading.focus({preventScroll:true});}};
}
