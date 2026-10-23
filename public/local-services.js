/* Manual engine control. Server capabilities, ownership and revisions are authoritative. */
function createLocalServices({api,node,getState,onNavigate,pollMs=2500}) {
  const i18n=globalThis.BionicI18n,t=(key,params)=>i18n.t('settings.launcher.'+key,params),el=id=>document.getElementById(id);
  const views=new Map(),services=new Map(),pending=new Map(),storageKey='bionic.local-service-requests.v1';
  let visible=false,timer=null,loading=null,epoch=0,nonce='',lastSeen=null,disconnected=false,reloading=false;
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
    const details=node('details','local-service-details'),detailTitle=node('summary',''),detailText=node('p','');details.append(detailTitle,detailText);
    const setup=button('setup',()=>{el('launcher-setup-guide').open=true;el('launcher-setup-title').focus({preventScroll:true});el('launcher-setup-guide').scrollIntoView({block:'nearest'});});
    const related=button(id==='bionic'?'modelsLink':'imagesLink',()=>onNavigate?.(id==='bionic'?'models':'images'));
    const links=node('div','settings-actions');links.append(setup,related);
    section.append(heading,summary,observations,actions,unavailable,confirmation,operation,error,details,links);el('local-services-list').append(section);
    const view={section,heading,summary,fields,buttons,check,unavailable,confirmation,confirmTitle,impact,activity,cancel,confirm,operation,operationText,continues,error,details,detailTitle,detailText,setup,related,intention:null,errorCode:null};views.set(id,view);return view;
  }
  for(const id of ['bionic','comfyui'])createView(id);
  function announce(value){const target=el('local-services-status');if(target)text(target,value);}
  function render(){
    for(const [id,view]of views){
      const service=services.get(id),engine=name(id),request=pending.get(id),op=service?.operation,active=op&&!terminal(op.status),busy=!!request||active;
      text(view.heading,t(id));
      const configuration=safeState(service?.configuration?.status,['unconfigured','valid','invalid'],'unconfigured');
      const process=safeState(service?.process?.state,['stopped','running','starting','stopping','external','unknown']);
      const apiState=safeState(service?.api?.state==='unavailable'?'unreachable':service?.api?.state,['ready','reachable','checking','unreachable','unknown','unchecked']);
      text(view.summary,disconnected?t('connectionLost',{time:time(lastSeen)}):!service?t('loading'):configuration!=='valid'?t('configuration.'+configuration):t('api.'+apiState));
      for(const key of ['process','api','model','activity'])text(view.fields[key].term,t('label.'+key));
      text(view.fields.process.value,t('process.'+process));
      text(view.fields.api.value,t('api.'+apiState)+(service?.api?.observedAt?' · '+time(service.api.observedAt):''));
      const model=service?.model;
      text(view.fields.model.value,model?.state==='loaded'&&Number.isSafeInteger(model.count)?t('model.loaded',{count:model.count}):['none','empty','unloaded'].includes(model?.state)?t('model.none'):t('model.unchecked'));
      const activity=service?.activity;
      text(view.fields.activity.value,['idle','clear'].includes(activity?.state)?t('activity.idle'):['active','busy'].includes(activity?.state)&&Number.isSafeInteger(activity.count)?t('activity.active',{count:activity.count}):t('activity.unchecked'));
      const reasons=[];if(view.intention&&service?.revision!==view.intention.revision)reasons.push(reason('revision_changed'));
      for(const [action,control]of Object.entries(view.buttons)){const capability=service?.actions?.[action];text(control,t(action,{engine}));control.hidden=configuration!=='valid'||action==='start'&&capability?.reasonCode==='already_running';control.disabled=!capability?.allowed||disconnected||busy||!valid();if(capability&&!capability.allowed)reasons.push(reason(capability.reasonCode));}
      text(view.check,t('check'));view.check.disabled=!!loading;
      text(view.unavailable,configuration!=='valid'?t('setupHelp'):[...new Set(reasons)].join(' '));view.unavailable.hidden=!view.unavailable.textContent;
      text(view.setup,t('setup'));text(view.related,t(id==='bionic'?'modelsLink':'imagesLink'));text(view.detailTitle,t('details'));
      const mode=safeState(service?.controlMode,['owned-process','observe-only','bionic-cli'],'observe-only');
      text(view.detailText,t('mode.'+mode)+(service?.configuration?.profileLabel?' · '+service.configuration.profileLabel:'')+(service?.configuration?.reasonCode?' · '+reason(service.configuration.reasonCode):''));
      view.confirmation.hidden=!view.intention;
      if(view.intention){const action=view.intention.action;text(view.confirmTitle,t('confirm.'+action,{engine}));text(view.impact,t('impact.'+action,{usage:t('usage.'+id)}));text(view.activity,t('confirm.activity',{time:time(service?.activity?.observedAt)}));text(view.cancel,t('confirm.cancel'));text(view.confirm,t('confirm.'+action+'Action',{engine}));view.confirm.disabled=busy||disconnected||!service?.actions?.[action]?.allowed||service?.revision!==view.intention.revision;}
      view.operation.hidden=!op&&!request;
      if(request?.uncertain)text(view.operationText,t('unknownResult'));
      else if(op){const phaseAlias={reserved:'accepted',stopped:'stopped',complete:'completed',reconcile:'unknown'};const phase=safeState(phaseAlias[op.phase]||op.phase,['accepted','checking','stopping','starting','checking-api','checking_activity','stopping_process','starting_process','checking_api','stopped','completed','failed','unknown']);const status=safeState(op.status,['accepted','running','succeeded','failed','unknown']);text(view.operationText,t('operation',{engine,action:t('action.'+safeState(op.action,['start','stop','restart'],'start')),status:t('status.'+status),phase:t('phase.'+phase)}));}
      else if(request)text(view.operationText,t('sending',{engine}));
      if(op&&!terminal(op.status)&&op.startedAt&&Number.isFinite(Date.parse(op.startedAt)))text(view.operationText,view.operationText.textContent+' · '+t('elapsed',{count:Math.max(0,Math.floor((Date.now()-Date.parse(op.startedAt))/1000))}));
      view.operation.setAttribute('aria-busy',String(!!request||!!active));text(view.continues,t('continues'));view.continues.hidden=!active&&!request;
      const failure=view.errorCode||(['failed','unknown'].includes(op?.status)?op.resultCode:null);text(view.error,failure?reason(failure):'');view.error.hidden=!failure;
    }
    const reload=el('local-services-reload');if(reload)reload.disabled=reloading||!!loading;
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
  async function recover(ticket,auth){for(const [id,request]of [...pending]){try{const result=await api('/api/local-service-operations/'+encodeURIComponent(request.key));if(ticket!==epoch||auth!==getState().authEpoch||!valid())return;const operation=result.operation||result;if(operation?.id){services.set(id,{...services.get(id),operation});pending.delete(id);persist();}}catch(error){if(error.status===404){/* Acceptance is uncertain: never replay or infer failure from a missing observation. */}}}}
  async function refresh(){
    if(!visible||!valid())return;if(loading)return loading;
    const ticket=epoch,auth=getState().authEpoch;
    loading=(async()=>{try{const data=await api('/api/local-services');if(ticket!==epoch||auth!==getState().authEpoch||!valid())return;nonce=typeof data.csrfNonce==='string'?data.csrfNonce:'';for(const service of data.services||[])if(views.has(service.id))services.set(service.id,service);disconnected=false;lastSeen=new Date().toISOString();await recover(ticket,auth);if(ticket!==epoch||auth!==getState().authEpoch||!valid())return;const signature=[...services].map(([id,value])=>id+':'+value.revision+':'+value.operation?.status).join('|');if(signature!==refresh.signature){refresh.signature=signature;announce([...services].map(([id,value])=>name(id)+' : '+t('api.'+safeState(value.api?.state==='unavailable'?'unreachable':value.api?.state,['ready','reachable','checking','unreachable','unknown','unchecked']))).join(' · '));}}
      catch{if(ticket===epoch&&auth===getState().authEpoch&&valid()){disconnected=true;announce(t('connectionLost',{time:time(lastSeen)}));}}
      finally{if(ticket===epoch){loading=null;render();schedule();}}})();render();return loading;
  }
  function setVisible(value){visible=value===true;if(!visible){++epoch;loading=null;reloading=false;clearTimeout(timer);timer=null;cancelConfirmation(null,false);return;}return refresh();}
  function reset(){++epoch;visible=false;clearTimeout(timer);timer=null;loading=null;nonce='';services.clear();pending.clear();persist();lastSeen=null;disconnected=false;cancelConfirmation(null,false);render();}
  async function reload(){if(reloading||!visible||disconnected)return;reloading=true;cancelConfirmation(null,false);render();const ticket=epoch,auth=getState().authEpoch;try{await api('/api/local-services/configuration/reload',{method:'POST',headers:{'X-Local-Service-CSRF':nonce},body:'{}'});if(ticket===epoch&&auth===getState().authEpoch&&valid())await refresh();}catch{if(ticket===epoch&&auth===getState().authEpoch&&valid())announce(t('reloadFailed'));}finally{if(ticket===epoch){reloading=false;render();}}}
  el('local-services-reload')?.addEventListener('click',reload);
  el('settings-view')?.addEventListener('keydown',event=>{if(event.key==='Escape'&&cancelConfirmation()){event.preventDefault();event.stopPropagation();}},true);
  document.addEventListener?.('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;}else if(visible)refresh();});
  i18n.onChange(render);render();
  return {setVisible,refresh,reset,cancelConfirmation,async openService(id){await setVisible(true);views.get(id)?.heading.focus({preventScroll:true});}};
}
