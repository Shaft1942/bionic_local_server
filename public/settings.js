/* Settings stay server-owned; unsent conversation overrides stay in this tab. */
function createCompanionSettings({api,getState,node,onChange}) {
  const el=id=>document.getElementById(id), pending=new Map();
  const certificates=createCompanionCertificates({api,getState,node});
  let opener, scope, generation=0, viewRevision=0, comfyRevision=0, comfy=null, savingRevision=null;
  const key=(model,view=getState().viewKey)=>JSON.stringify([view,model]);
  const number=n=>new Intl.NumberFormat('fr-FR').format(n);
  function message(id,value,error=false){el(id).textContent=value;el(id).hidden=!value;if(error)el(id).setAttribute('role','alert');}
  function outputMode(){el('output-manual').hidden=el('output-mode').value!=='manual';el('output-tokens').required=!el('output-manual').hidden;}
  function imagePermission(){
    const enabled=comfy?.enabled===true;
    if(!enabled)el('agent-images').disabled=true;
    el('image-settings-help').textContent=enabled?'Workflow : '+(comfy.workflows?.find(w=>w.id===comfy.workflowId)?.label||comfy.workflowId)+'.':'ComfyUI est désactivé. Active-le dans les paramètres.';
  }
  async function refresh(){const epoch=getState().authEpoch,ticket=++comfyRevision;try{const data=await api('/api/comfy/settings');if(ticket!==comfyRevision||epoch!==getState().authEpoch||!getState().authenticated)return;comfy=data;onChange?.();imagePermission();}catch{if(ticket===comfyRevision&&epoch===getState().authEpoch){comfy=null;imagePermission();}}}
  const current=revision=>revision===viewRevision&&!el('settings-view').hidden&&getState().authenticated;
  function close(restore=true){certificates.reset();if(el('settings-view').hidden)return;++generation;++viewRevision;el('settings-view').hidden=true;el('app').hidden=!getState().authenticated;if(restore&&opener?.isConnected)opener.focus({preventScroll:true});}
  async function loadOutput(){
    const ticket=++generation,model=el('settings-model').value;if(!model)return;
    message('output-current','Chargement du réglage…');message('output-error','');message('output-result','');el('output-save').disabled=true;
    try{
      const query=new URLSearchParams({model,...(scope.projectId?{projectId:scope.projectId}:{}),...(scope.id?{id:scope.id}:{})});
      const data=await api('/api/model-preferences?'+query);if(ticket!==generation||el('settings-view').hidden)return;
      const draft=pending.get(key(model,scope.viewKey));
      const value=draft?draft.maxOutputTokens:data.automatic===true||data.source==='auto'?null:data.maxOutputTokens;
      el('output-mode').value=value===null?'auto':'manual';el('output-tokens').value=value??8192;
      el('output-all-sessions').checked=draft?.applyToAllSessions??data.applyToAllSessions;
      message('output-current','Contexte du modèle : '+number(data.contextLength)+' tokens. Réglage : '+(value===null?'automatique':number(value)+' tokens')+'.');outputMode();
    }catch(e){if(ticket===generation)message('output-error',e.message,true);}
    finally{if(ticket===generation)el('output-save').disabled=false;}
  }
  async function open(event){
    const revision=++viewRevision;
    el('comfy-save').disabled=false;el('comfy-test').disabled=false;
    opener=event?.currentTarget||document.activeElement;const state=getState();
    scope={projectId:state.projectId,id:state.chat?.source==='web'?state.chat.id:null,viewKey:state.viewKey};
    el('settings-view').hidden=false;el('app').hidden=true;el('settings-close').focus({preventScroll:true});
    el('settings-model').replaceChildren(...(state.status?.models||[]).map(m=>{const option=node('option','',m.name);option.value=m.id;return option;}));
    el('settings-model').value=el('model').value;message('comfy-error','');message('comfy-result','Chargement…');
    await Promise.allSettled([certificates.load(),loadOutput(),(async()=>{
      try{const ticket=++comfyRevision,data=await api('/api/comfy/settings');if(ticket!==comfyRevision||!current(revision))return;comfy=data;el('comfy-enabled').checked=data.enabled;el('comfy-url').value=data.url;
        el('comfy-workflow').replaceChildren(...data.workflows.map(w=>{const option=node('option','',w.label);option.value=w.id;return option;}));el('comfy-workflow').value=data.workflowId;message('comfy-result',data.activeJobs?data.activeJobs+' génération(s) en cours. Attends leur fin pour modifier la configuration.':'');onChange?.();imagePermission();
      }catch(e){if(current(revision)){message('comfy-error',e.message,true);message('comfy-result','');}}
    })(),(async()=>{
      try{const data=await api('/api/capabilities');if(!current(revision))return;el('settings-capabilities').replaceChildren();for(const entry of data.items)el('settings-capabilities').append(node('dt','',entry.name),node('dd','',entry.description));}catch{if(current(revision))el('settings-capabilities').replaceChildren(node('dd','','Impossible de charger les capacités. Ferme puis rouvre les paramètres.'));}
    })()]);
  }
  el('output-settings-form').addEventListener('submit',async event=>{
    event.preventDefault();if(savingRevision===viewRevision)return;savingRevision=viewRevision;el('output-save').disabled=true;message('output-error','');
    const model=el('settings-model').value,value=el('output-mode').value==='auto'?null:Number(el('output-tokens').value),all=el('output-all-sessions').checked,target={...scope},revision=viewRevision,epoch=getState().authEpoch;
    try{
      if(value!==null&&(!Number.isSafeInteger(value)||value<1||value>1000000))throw Error('Choisis un nombre entier entre 1 et 1 000 000.');
      const preference={maxOutputTokens:value,applyToAllSessions:all};
      if(target.id||all)await api('/api/model-preferences',{method:'POST',body:JSON.stringify({model,projectId:target.projectId,...(target.id?{id:target.id}:{}),...preference})});
      if(epoch!==getState().authEpoch||!getState().authenticated)return;
      if(!target.id&&!all)pending.set(key(model,target.viewKey),preference);else pending.delete(key(model,target.viewKey));
      if(current(revision)&&el('settings-model').value===model)message('output-result',!target.id&&!all?'Réglage prêt pour le premier envoi de cette conversation.':all?'Valeur par défaut enregistrée pour ce modèle.':'Réglage enregistré pour cette conversation.');
    }catch(e){if(current(revision))message('output-error',e.message,true);}finally{if(savingRevision===revision)savingRevision=null;if(current(revision))el('output-save').disabled=false;}
  });
  function comfyInput(){return {enabled:el('comfy-enabled').checked,url:el('comfy-url').value.trim(),workflowId:el('comfy-workflow').value};}
  el('comfy-settings-form').addEventListener('submit',async event=>{
    event.preventDefault();const revision=viewRevision,epoch=getState().authEpoch,ticket=++comfyRevision;el('comfy-save').disabled=true;message('comfy-error','');
    try{const data=await api('/api/comfy/settings',{method:'POST',body:JSON.stringify(comfyInput())});if(ticket!==comfyRevision||epoch!==getState().authEpoch||!getState().authenticated)return;comfy=data;if(current(revision))message('comfy-result','Configuration enregistrée. '+(comfy.enabled?'Active Images dans le menu Outils pour le prochain message.':'ComfyUI est désactivé.'));onChange?.();imagePermission();}
    catch(e){if(current(revision))message('comfy-error',e.message,true);}finally{if(current(revision))el('comfy-save').disabled=false;}
  });
  el('comfy-test').addEventListener('click',async()=>{
    const revision=viewRevision;el('comfy-test').disabled=true;message('comfy-error','');message('comfy-result','Vérification de ComfyUI et des modèles…');
    try{const {url,workflowId}=comfyInput(),data=await api('/api/comfy/check',{method:'POST',body:JSON.stringify({url,workflowId})});if(!current(revision))return;if(data.reachable===false)throw Error(data.error||'ComfyUI est inaccessible. Vérifie son adresse et son serveur.');const selected=data.workflows.find(w=>w.id===workflowId);message('comfy-result',data.ok?'Connexion confirmée. Les nœuds et modèles du workflow sont présents. Aucun rendu lancé.':'Connexion établie, mais ce workflow est incomplet : '+(selected?.errors||[]).join(' '));}
    catch(e){if(current(revision)){message('comfy-error',e.message,true);message('comfy-result','');}}finally{if(current(revision))el('comfy-test').disabled=false;}
  });
  el('settings-model').addEventListener('change',loadOutput);el('output-mode').addEventListener('change',outputMode);
  el('settings-close').addEventListener('click',()=>close());el('settings-view').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
  for(const id of ['settings-open','settings-open-sidebar'])el(id).addEventListener('click',open);
  return {refresh,close,imagePermission,enabled:()=>comfy?.enabled===true,decorate(data){const preference=pending.get(key(data.model));return preference?{...data,outputPreferences:preference}:data;},accepted(data,viewKey){const k=key(data.model,viewKey),value=pending.get(k);if(value&&JSON.stringify(value)===JSON.stringify(data.outputPreferences))pending.delete(k);},reset(){pending.clear();comfy=null;close(false);}};
}
