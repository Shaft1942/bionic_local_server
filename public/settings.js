/* Server-owned settings; unsent preferences and form drafts stay separate. */
function createCompanionSettings({api,getState,node,onChange,onNavigate,onPageChange}) {
  const el=id=>document.getElementById(id),pending=new Map(),outputDrafts=new Map();
  const certificateClient=createCompanionCertificates({api,getState,node});
  const certificates={load:()=>certificateClient.load(),reset(){certificateClient.reset();el('certificate-hosts').value='';el('certificate-device-name').value='';}};
  const pages=['reading','models','tools','images','connection','maintenance'];
  // Search only this public vocabulary, never form values or certificate secrets.
  const searchIndex=[
    ['Brouillons sur cet appareil','reading','draft-duration','texte conserver durée onglet heure jours local navigateur','Cet appareil'],
    ['Télécharger le brouillon','reading','draft-download','export message non envoyé','Brouillon courant'],
    ['Effacer les brouillons','reading','draft-clear','supprimer copies locales conservation','Cet appareil'],
    ['Modèle et effort du prochain message','models','settings-edit-model','raisonnement contexte chargé mémoire llm','Prochain envoi'],
    ['Plafond de réponse','models','output-mode','tokens longueur sortie automatique personnalisé défaut héritage exception','Chat ou défaut du modèle'],
    ['Modèles chargés','models','settings-models-loaded','décharger instance mémoire vram bionic','Moteur partagé'],
    ['Outils fichiers','tools','settings-edit-tools','aucun lecture modification autorisation permissions sauvegarde','Prochain envoi'],
    ['Web et validation des envois','tools','settings-edit-tools','internet recherche url accord moteur searxng brave duckduckgo','Prochain envoi'],
    ['Scripts avec validation','tools','settings-edit-tools','python node powershell code exécution pc droits','Prochain envoi'],
    ['Autoriser les images','tools','settings-edit-image','générer image outils prochain message','Prochain envoi'],
    ['Rechercher ComfyUI','images','comfy-discover','détection serveur ports localhost installation','Action ponctuelle'],
    ['Activer ComfyUI','images','comfy-enabled','service connexion global','Installation'],
    ['Adresse ComfyUI','images','comfy-url','url serveur pc réseau local','Installation'],
    ['Workflow image par défaut','images','comfy-workflow','profil krea hassaku modèle','Défaut global'],
    ['LoRA et forces','images','comfy-lora-1','lora 1 2 intensité poids profils catalogue','Global par workflow'],
    ['Catalogue LoRA','images','comfy-loras-refresh','actualiser lire liste présence compatibilité','Serveur ComfyUI'],
    ['Tester ComfyUI','images','comfy-test','connexion modèles nœuds diagnostic sans rendu enregistrer','Action ponctuelle'],
    ['Nettoyage mémoire facultatif','images','comfy-memory-cleanup','free memory krea module décharger facultatif mémoire','Installation'],
    ['Sécurité HTTP HTTPS mTLS','connection','certificate-title','connexion certificat chiffrement autorité empreinte','Installation et appareil'],
    ['Préparer HTTPS','connection','certificate-prepare','hôtes noms dns certificat serveur preuve vérifier','Installation'],
    ['Certificat de cet appareil','connection','certificate-device-name','client p12 créer télécharger renouveler retirer révoquer','Appareil concerné'],
    ['Actualiser les certificats','connection','certificate-refresh','état appareils autorité','Lecture du serveur'],
    ['Mises à jour du compagnon','maintenance','updates-title','version installer redémarrer vérifier automatique ignorer canal publication stable bêta beta','Installation'],
    ['Diagnostic de connexion','maintenance','diagnostics-open','rapport télécharger bionic moteur outils config pc','Action ponctuelle'],
    ['Aide et capacités','maintenance','settings-help','fonctionnement limites connexion api port python configuration','Information'],
    ['Organiser une conversation','tools','settings-heading-tools','renommer déplacer supprimer branche classement historique source','Actions du fil'],
    ['Fichiers et livrables du projet','tools','settings-heading-tools','importer joindre éditeur corbeille restauration livrables étagère dossiers fichiers projet','Actions du projet'],
    ['Configuration avancée sur le PC','maintenance','settings-heading-maintenance','port api bionic racines dossiers python timeout concurrence kv cache gpu configuration pc','Configuration hors interface']
  ].map(([label,page,target,keywords,scope])=>({label,page,target,keywords,scope}));
  let opener,scope,generation=0,viewRevision=0,comfyRevision=0,loraRevision=0,navigationRevision=0,outputOperation=0;
  const outputOperations=new Map();
  let setupRevision=0;
  let comfy=null,savingRevision=null,loraDrafts={},editingWorkflow=null,loraNames=[],imageOptionsSignature='';
  let loadedModel=null,outputData=null,outputBaseline=null,comfyBaseline=null,comfyDraft=null;
  let outputSubmitting=null,comfySubmitting=null,transition=null,activePage='reading';
  const key=(model,view=getState().viewKey)=>JSON.stringify([view,model]);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const number=n=>new Intl.NumberFormat('fr-FR').format(n);
  const loraNumber=new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const current=revision=>revision===viewRevision&&!el('settings-view').hidden&&getState().authenticated;
  const listen=(id,type,callback)=>el(id)?.addEventListener(type,callback);
  function message(id,value,error=false){const target=el(id);if(!target)return;target.textContent=value;target.hidden=!value;if(error)target.setAttribute('role','alert');}
  function allSessions(){return el('output-all-sessions').value==='model';}
  function destination(all){el('output-all-sessions').value=all?'model':'session';}
  const validOutputTokens=value=>Number.isSafeInteger(value)&&value>=1&&value<=5000000;
  const outputInput=()=>({mode:el('output-mode').value,tokens:el('output-tokens').value,destination:allSessions()?'model':'session'});
  function profileCopies(profiles={},workflows=comfy?.workflows||[]){const result={};for(const id of new Set([...Object.keys(profiles),...workflows.map(w=>w.id)]))result[id]=[0,1].map(index=>({name:profiles[id]?.[index]?.name||'',strength:profiles[id]?.[index]?.strength??1}));return result;}
  function rememberLoras(){if(editingWorkflow)loraDrafts[editingWorkflow]=[1,2].map(index=>({name:el('comfy-lora-'+index).value,strength:Number(el('comfy-lora-'+index+'-strength').value)}));}
  function comfyInput(){rememberLoras();return {enabled:el('comfy-enabled').checked,url:el('comfy-url').value,workflowId:el('comfy-workflow').value,memoryCleanup:el('comfy-memory-cleanup').checked,loraProfiles:structuredClone(loraDrafts)};}
  const outputSavedBaseline=()=>outputSubmitting?.revision===viewRevision&&outputSubmitting.model===loadedModel?outputSubmitting.value:outputBaseline;
  function outputDirty(){const baseline=outputSavedBaseline();return !!baseline&&!same(outputInput(),baseline);}
  function comfyDirty(){const baseline=comfySubmitting?.revision===viewRevision?comfySubmitting.value:comfyBaseline;return !!baseline&&!same(comfyInput(),baseline);}
  function hasUnsaved(){return outputDirty()||comfyDirty()||outputDrafts.size>0||comfyDraft!==null;}
  const currentUnsaved=()=>outputDirty()||comfyDirty();
  function updateDirty(){const output=outputDirty(),images=comfyDirty();message('output-dirty',output?'Saisie non enregistrée pour cette cible.':'');message('comfy-dirty',images?'Saisie non enregistrée pour l’installation et les profils.':'');if(el('output-cancel'))el('output-cancel').disabled=!output;if(el('comfy-cancel'))el('comfy-cancel').disabled=!images;outputInfo();}
  function outputInfo(){
    if(!scope)return;const local=scope.id?'Ce chat « '+scope.name+' »':'Prochain chat de cette vue, avant son premier envoi';
    message('output-scope',allSessions()?'Destination : défaut de ce modèle. Enregistrer retire aussi l’exception du chat courant ; les exceptions des autres chats restent prioritaires.':'Destination : '+local+'. '+(!scope.id?'Le choix enregistré ici reste dans cet onglet jusqu’au premier envoi.':''));
    if(!outputData)return;const prepared=pending.get(key(loadedModel,scope.viewKey));
    const source=prepared?'Préparé dans cet onglet pour le premier envoi':outputData.source==='session'?'Exception de ce chat':outputData.source==='model'?'Défaut de ce modèle':'Automatique du compagnon';
    const automatic=prepared?prepared.maxOutputTokens===null:outputData.automatic===true||outputData.source==='auto';
    message('output-origin','Origine en vigueur : '+source+'. '+(automatic&&(prepared||outputData.source==='session')?'Automatique est une exception locale, pas une reprise du défaut du modèle.':''));
    const requested=prepared?prepared.maxOutputTokens??8192:outputData.maxOutputTokens??8192,context=Number.isSafeInteger(outputData.contextLength)&&outputData.contextLength>0?number(outputData.contextLength)+' tokens':'à confirmer au chargement';
    message('output-effective','Plafond demandé en vigueur : '+number(requested)+' tokens'+(automatic?' (automatique)':'')+'. Contexte chargé : '+context+'. Le plafond réellement appliqué est calculé à chaque appel selon messages, pièces jointes et outils ; il peut être réduit.');
  }
  function comfyInfo(){if(!comfy)return;message('comfy-scope','Portée : installation entière. Deux LoRA par workflow, communs aux chats qui utilisent ce profil. Le choix et l’autorisation Images du prochain message restent distincts.');message('comfy-origin',comfy.updatedAt?'Origine : configuration enregistrée sur ce PC.':'Origine : configuration fournie par ce PC ; enregistrement persistant non daté.');const label=comfy.workflows?.find(w=>w.id===comfy.workflowId)?.label||comfy.workflowId||'non indiqué';message('comfy-effective','Configuration en vigueur : '+(comfy.enabled?'ComfyUI activé':'ComfyUI désactivé')+' · '+label+'. '+(comfy.activeJobs?comfy.activeJobs+' génération(s) en cours. ':'')+'Enregistrer ne vérifie pas la connexion ; Tester utilise les saisies sans les enregistrer.');}
  function summaries(){
    const state=getState(),model=state.status?.models?.find(m=>m.id===el('model').value),profile=el('agent-files')?.value;
    const effort=el('effort'),effortLabel=effort?.selectedOptions?.[0]?.textContent||({default:'Par défaut',off:'Désactivé',on:'Activé',low:'Faible',medium:'Moyen',high:'Élevé',xhigh:'Très élevé'}[effort?.value]||'Par défaut');
    message('settings-chat-summary','Prochain message : '+(model?.name||'modèle non sélectionné')+' · '+(effort?.disabled||model?.reasoning?.allowedOptions?.length===0?'effort indisponible pour ce modèle':'effort '+effortLabel)+'. '+(model?.contextLength?'Contexte annoncé : '+number(model.contextLength)+' tokens.':'Contexte chargé non confirmé ici.')+' Le modèle du plafond ci-dessous ne change pas celui du message.');
    message('settings-tools-summary','Prochain envoi : fichiers '+({none:'désactivés',read:'en lecture seule',write:'modifiables'}[profile]||'selon le chat')+' · Web '+(el('agent-web')?.checked?'autorisé'+(el('agent-web-approval')?.checked?' avec validation de chaque envoi':''):'désactivé')+' · scripts '+(el('agent-scripts')?.checked?'proposables avec validation du code exact':'désactivés')+'. Ces contrôles restent dans le composeur.');
    if(model?.tools===false)message('settings-tools-summary','Les appels d’outils ne sont pas disponibles pour le modèle sélectionné. Choisis un modèle compatible avant d’autoriser des outils dans le chat.');
    else if(state.projects?.find(project=>project.id===state.projectId)?.isUnassigned)message('settings-tools-summary','Sans projet : outils fichiers et scripts indisponibles. Le Web public et les images restent des choix séparés pour le prochain envoi.');
    const imageId=state.draftImageWorkflowId??state.chat?.imageWorkflowId??comfy?.workflowId,label=comfy?.workflows?.find(w=>w.id===imageId)?.label||imageId||'profil non sélectionné';message('settings-image-summary',(comfy?.enabled===false?'Service ComfyUI désactivé : configure-le dans Images avant de l’autoriser. ':'')+'Prochain envoi : images '+(el('agent-images')?.checked?'autorisées':'désactivées')+' · '+label+'. Le profil utilise les LoRA globaux enregistrés pour ce workflow.');
  }
  function syncOutputSlider(){const value=Number(el('output-tokens').value);if(validOutputTokens(value))el('output-tokens-slider').value=value;el('output-tokens-slider').setAttribute('aria-valuetext',number(Number(el('output-tokens-slider').value))+' tokens');}
  function outputMode(){const manual=el('output-mode').value==='manual';el('output-manual').hidden=!manual;el('output-tokens').required=manual;el('output-tokens').disabled=!manual;el('output-tokens-slider').disabled=!manual;syncOutputSlider();}
  function applyOutput(value){el('output-mode').value=value.mode;el('output-tokens').value=value.tokens;destination(value.destination==='model');outputMode();}
  function outputLoading(value){for(const id of ['output-mode','output-all-sessions','output-tokens','output-tokens-slider'])el(id).disabled=value;if(!value)outputMode();}
  function comfyLoading(value){for(const id of ['comfy-memory-cleanup','comfy-discover','comfy-enabled','comfy-url','comfy-workflow','comfy-lora-1','comfy-lora-2','comfy-lora-1-strength','comfy-lora-2-strength','comfy-loras-refresh','comfy-save','comfy-test'])el(id).disabled=value;}
  function showStrength(index){const input=el('comfy-lora-'+index+'-strength'),value=loraNumber.format(Number(input.value));el('comfy-lora-'+index+'-value').textContent=value;input.setAttribute('aria-valuetext',value);}
  function showLoras(){const slots=loraDrafts[editingWorkflow]||[];for(const index of [1,2]){const slot=slots[index-1]||{name:'',strength:1},names=[...new Set([...loraNames,...(slot.name?[slot.name]:[])])],empty=node('option','','Aucun LoRA');empty.value='';el('comfy-lora-'+index).replaceChildren(empty,...names.map(name=>{const option=node('option','',name+(loraNames.includes(name)?'':' (présence à vérifier)'));option.value=name;return option;}));el('comfy-lora-'+index).value=slot.name;el('comfy-lora-'+index+'-strength').value=slot.strength;showStrength(index);}}
  function applyComfy(value){invalidateSetup();el('comfy-memory-cleanup').checked=value.memoryCleanup===true;el('comfy-enabled').checked=value.enabled;el('comfy-url').value=value.url;el('comfy-workflow').value=value.workflowId;loraDrafts=structuredClone(value.loraProfiles);editingWorkflow=value.workflowId;showLoras();}
  function imagePermission(){const enabled=comfy?.enabled===true;if(!enabled)el('agent-images').disabled=true;const state=getState(),workflows=comfy?.workflows||[],signature=JSON.stringify(workflows);if(signature!==imageOptionsSignature){el('image-workflow').replaceChildren(...workflows.map(w=>{const option=node('option','',w.label);option.value=w.id;return option;}));imageOptionsSignature=signature;}const selected=state.draftImageWorkflowId??state.chat?.imageWorkflowId??comfy?.workflowId;el('image-workflow').value=workflows.some(w=>w.id===selected)?selected:comfy?.workflowId||'';el('image-workflow').disabled=!enabled||state.loading||state.uploading;const count=(comfy?.loraProfiles?.[el('image-workflow').value]||[]).filter(slot=>slot.name&&slot.strength!==0).length;el('image-settings-help').textContent=enabled?'Modèle : '+(workflows.find(w=>w.id===el('image-workflow').value)?.label||'')+(count?' · '+count+' LoRA actif(s)':' · sans LoRA')+'.':'ComfyUI est désactivé. Active-le dans les paramètres.';}
  async function refresh(){const epoch=getState().authEpoch,ticket=++comfyRevision;try{const data=await api('/api/comfy/settings');if(ticket!==comfyRevision||epoch!==getState().authEpoch||!getState().authenticated)return;comfy=data;onChange?.();imagePermission();if(!el('settings-view').hidden){comfyInfo();summaries();}}catch{if(ticket===comfyRevision&&epoch===getState().authEpoch){comfy=null;imagePermission();}}}
  function available(target){return target&&!target.disabled&&!target.hidden&&!target.closest?.('[hidden]')&&(!target.matches||target.matches('button,input,select,textarea,a[href],[tabindex]'))&&(!target.getClientRects||target.getClientRects().length>0);}
  function focusDestination(page,id){const target=el(id),heading=el('settings-heading-'+page),selected=available(target)?target:heading;selected?.scrollIntoView?.({block:'nearest'});selected?.focus({preventScroll:true});return selected;}
  function showPage(page,focusId){
    if(!pages.includes(page))page='reading';const previous=activePage;if(previous==='connection'&&page!=='connection')certificates.reset();activePage=page;
    const nav=++navigationRevision,revision=viewRevision;el('settings-view').dataset.settingsIndex='false';
    for(const id of pages)if(el('settings-page-'+id))el('settings-page-'+id).hidden=id!==page;
    const body=document.querySelector?.('.settings-body');if(body)body.scrollTop=0;
    for(const button of document.querySelectorAll('[data-settings-page]'))button.setAttribute('aria-current',button.dataset.settingsPage===page?'page':'false');
    const loading=page==='connection'?certificates.load():Promise.resolve(onPageChange?.(page)),focused=focusId?focusDestination(page,focusId):null;
    return loading.then(()=>{if(focusId&&focused!==el(focusId)&&current(revision)&&navigationRevision===nav&&document.activeElement===focused&&available(el(focusId)))focusDestination(page,focusId);});
  }
  const fold=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function search(){const tokens=fold(el('settings-search').value).trim().split(/\s+/).filter(Boolean),results=el('settings-results');results.replaceChildren();if(!tokens.length){message('settings-search-status','');results.hidden=true;return;}const matches=searchIndex.filter(entry=>tokens.every(token=>fold(entry.label+' '+entry.keywords+' '+entry.scope).includes(token)));results.hidden=false;for(const entry of matches){const button=node('button','settings-search-result');button.type='button';button.append(node('span','',entry.label),node('small','',entry.scope));button.addEventListener('click',()=>{el('settings-search').value='';search();showPage(entry.page,entry.target);});results.append(button);}message('settings-search-status',matches.length?matches.length+' réglage(s) ou action(s) trouvés.':'Aucun résultat. Essaie « tokens », « brouillons », « LoRA » ou « certificat ».');}
  function cancelOutput(){if(outputSavedBaseline())applyOutput(outputSavedBaseline());if(scope&&loadedModel)outputDrafts.delete(key(loadedModel,scope.viewKey));message('output-error','');message('output-result','Saisie non enregistrée annulée. Aucun réglage déjà envoyé n’est annulé.');updateDirty();}
  function cancelComfy(){if(comfyBaseline)applyComfy(comfySubmitting?.revision===viewRevision?comfySubmitting.value:comfyBaseline);comfyDraft=null;message('comfy-error','');message('comfy-result','Saisie non enregistrée annulée. Aucun effet déjà appliqué n’est annulé.');updateDirty();}
  function rememberForms(){if(outputDirty()&&scope&&loadedModel)outputDrafts.set(key(loadedModel,scope.viewKey),outputInput());if(comfyDirty())comfyDraft=comfyInput();}
  function discardForms(){if(scope&&loadedModel)outputDrafts.delete(key(loadedModel,scope.viewKey));comfyDraft=null;if(outputSavedBaseline())applyOutput(outputSavedBaseline());if(comfyBaseline)applyComfy(comfySubmitting?.revision===viewRevision?comfySubmitting.value:comfyBaseline);updateDirty();}
  function requestTransition(action,reason){if(!currentUnsaved())return action();if(transition){el('settings-unsaved-continue').focus({preventScroll:true});return transition.promise;}let resolve;const promise=new Promise(done=>resolve=done);transition={action,resolve,promise,focus:document.activeElement};el('settings-unsaved').hidden=false;message('settings-unsaved-message','Des saisies ne sont pas enregistrées pour les formulaires affichés. '+reason+' Continuer reste sur cette page ; Abandonner retire seulement ces saisies ; Conserver les garde en mémoire de cet onglet, sans les appliquer. Les brouillons d’autres cibles sont préservés. Un rechargement du navigateur les perdra. Les saisies et secrets de certificats ne sont jamais conservés.');let secret=false;try{const url=new URL(el('comfy-url').value);secret=!!(url.username||url.password);}catch{}el('settings-unsaved-keep').disabled=secret&&comfyDirty();if(secret&&comfyDirty())message('settings-unsaved-message','Cette adresse contient des identifiants : corrige-la ou abandonne la saisie. Les identifiants ne peuvent pas entrer dans le brouillon des paramètres.');el('settings-unsaved-continue').focus({preventScroll:true});return promise;}
  async function decideTransition(choice){const selected=transition;if(!selected)return;transition=null;el('settings-unsaved').hidden=true;if(choice==='continue'){selected.focus?.focus({preventScroll:true});selected.resolve(false);return;}if(choice==='keep')rememberForms();else discardForms();try{const result=await selected.action();selected.resolve(result);}catch(error){selected.resolve(false);message('output-error',error.message,true);}}
  function closeNow(restore=true){
    certificates.reset();++generation;++viewRevision;++loraRevision;++navigationRevision;
    if(transition){transition.resolve(false);transition=null;}
    el('settings-unsaved').hidden=true;el('settings-view').hidden=true;el('app').hidden=!getState().authenticated;
    if(restore&&getState().authenticated){
      if(opener?.isConnected&&available(opener))opener.focus({preventScroll:true});
      else [el('conversation-options-toggle'),el('settings-open-sidebar')].find(available)?.focus({preventScroll:true});
    }
    return true;
  }
  function close(restore=true){if(el('settings-view').hidden)return true;return requestTransition(()=>closeNow(restore),'Fermer les paramètres ?');}
  async function loadOutput(){
    const ticket=++generation,revision=viewRevision,epoch=getState().authEpoch,model=el('settings-model').value;loadedModel=model;outputBaseline=null;outputData=null;outputLoading(true);message('output-current',model?'Chargement du réglage…':'Aucun modèle disponible pour régler le plafond.');message('output-error','');message('output-result','');el('output-save').disabled=true;
    if(!model){message('output-origin','Origine indisponible : aucun modèle sélectionné.');message('output-effective','Choisis ou rends disponible un modèle avant de modifier son plafond.');return;}
    try{const query=new URLSearchParams({model,...(scope.projectId?{projectId:scope.projectId}:{}),...(scope.id?{id:scope.id}:{})}),data=await api('/api/model-preferences?'+query);if(ticket!==generation||!current(revision)||epoch!==getState().authEpoch||el('settings-model').value!==model)return;outputData=data;const ready=pending.get(key(model,scope.viewKey)),value=ready?ready.maxOutputTokens:data.automatic===true||data.source==='auto'?null:data.maxOutputTokens;outputBaseline={mode:value===null?'auto':'manual',tokens:String(value??8192),destination:(ready?.applyToAllSessions??data.applyToAllSessions)?'model':'session'};applyOutput(outputBaseline);const draft=outputDrafts.get(key(model,scope.viewKey));if(draft&&!same(draft,outputBaseline))applyOutput(draft);else outputDrafts.delete(key(model,scope.viewKey));outputLoading(false);message('output-current',ready?'Réglage enregistré dans cet onglet, prêt pour le premier envoi.':'Réglage actuel chargé.');updateDirty();}
    catch(e){if(ticket===generation&&current(revision))message('output-error',e.message,true);}finally{if(ticket===generation&&current(revision))el('output-save').disabled=!outputBaseline||savingRevision===viewRevision;}
  }
  async function loadLoras(){const revision=viewRevision,ticket=++loraRevision,url=el('comfy-url').value.trim();el('comfy-loras-refresh').disabled=true;message('comfy-loras-status','Lecture des LoRA reconnus par ComfyUI…');try{const data=await api('/api/comfy/loras',{method:'POST',body:JSON.stringify({url})});if(ticket!==loraRevision||!current(revision)||el('comfy-url').value.trim()!==url)return;rememberLoras();loraNames=data.loras;showLoras();message('comfy-loras-status',data.loras.length+' LoRA disponible(s) dans ComfyUI.');}catch(e){if(ticket===loraRevision&&current(revision))message('comfy-loras-status','Liste indisponible : '+e.message+' Les choix du formulaire sont conservés.');}finally{if(ticket===loraRevision&&current(revision))el('comfy-loras-refresh').disabled=false;}}
  async function loadComfy(revision){const ticket=++comfyRevision;comfyLoading(true);message('comfy-error','');message('comfy-result','Chargement…');try{const data=await api('/api/comfy/settings');if(ticket!==comfyRevision||!current(revision))return;comfy=data;el('comfy-workflow').replaceChildren(...data.workflows.map(w=>{const option=node('option','',w.label);option.value=w.id;return option;}));loraNames=[];comfyBaseline={enabled:data.enabled,memoryCleanup:data.memoryCleanup===true,url:data.url,workflowId:data.workflowId,loraProfiles:profileCopies(data.loraProfiles,data.workflows)};applyComfy(comfyBaseline);if(comfyDraft&&!same(comfyDraft,comfyBaseline))applyComfy(comfyDraft);else comfyDraft=null;comfyLoading(false);loadLoras();message('comfy-result',data.activeJobs?data.activeJobs+' génération(s) en cours. La configuration peut être refusée pendant leur exécution.':'');comfyInfo();summaries();updateDirty();onChange?.();imagePermission();}catch(e){if(current(revision)){message('comfy-error',e.message,true);message('comfy-result','');}}}
  async function loadCapabilities(revision){try{const data=await api('/api/capabilities');if(!current(revision))return;el('settings-capabilities').replaceChildren();for(const entry of data.items)el('settings-capabilities').append(node('dt','',entry.name),node('dd','',entry.description));}catch{if(current(revision))el('settings-capabilities').replaceChildren(node('dd','','Impossible de charger les capacités. Réessaie Recharger les réglages.'));}}
  async function openNow(event={}){const revision=++viewRevision,state=getState();opener=event.currentTarget||document.activeElement;scope={projectId:state.projectId,id:state.chat?.source==='web'?state.chat.id:null,viewKey:state.viewKey,name:state.chat?.name||'conversation courante'};outputBaseline=null;comfyBaseline=null;outputSubmitting=null;comfySubmitting=null;el('comfy-save').disabled=false;el('comfy-test').disabled=false;el('comfy-discover').disabled=false;invalidateSetup();el('comfy-servers').replaceChildren();message('comfy-discovery-status','');el('diagnostics-open').disabled=false;el('diagnostics-result').replaceChildren();el('diagnostics-result').hidden=true;el('settings-unsaved').hidden=true;el('settings-view').hidden=false;el('app').hidden=true;el('settings-close').focus({preventScroll:true});el('settings-search').value='';search();el('settings-model').replaceChildren(...(state.status?.models||[]).map(m=>{const option=node('option','',m.name);option.value=m.id;return option;}));const selected=event.outputModel||el('model').value;el('settings-model').value=(state.status?.models||[]).some(m=>m.id===selected)?selected:state.status?.models?.[0]?.id||'';const security=showPage(event.page||'reading'),nav=navigationRevision;if(!event.page)el('settings-view').dataset.settingsIndex='true';summaries();await Promise.allSettled([security,loadOutput(),loadComfy(revision),loadCapabilities(revision)]);return {revision,nav};}
  function open(event){const request={currentTarget:event?.currentTarget||document.activeElement,page:event?.page,outputModel:event?.outputModel};return !el('settings-view').hidden&&currentUnsaved()?requestTransition(()=>openNow(request),'Changer de cible de paramètres ?'):openNow(request);}
  async function openPage(event,page,focusId){const opened=await open({currentTarget:event?.currentTarget||document.activeElement,outputModel:event?.outputModel,page});if(!opened||!current(opened.revision)||navigationRevision!==opened.nav||activePage!==page)return false;if(document.activeElement!==el('settings-close'))return false;if(focusId)focusDestination(page,focusId);return true;}
  function requestNavigate(target){return requestTransition(()=>{closeNow(false);return onNavigate?.(target);},'Revenir à ce contrôle dans la conversation ?');}
  function reload(){return requestTransition(async()=>{const revision=++viewRevision;++generation;++loraRevision;outputBaseline=null;comfyBaseline=null;el('comfy-test').disabled=false;el('comfy-save').disabled=false;await Promise.allSettled([activePage==='connection'?certificates.load():Promise.resolve(),loadOutput(),loadComfy(revision),loadCapabilities(revision)]);return true;},'Recharger les réglages depuis le PC ?');}
  listen('output-settings-form','submit',async event=>{
    event.preventDefault();if(savingRevision===viewRevision||!outputBaseline)return;
    savingRevision=viewRevision;el('output-save').disabled=true;message('output-error','');
    const model=loadedModel,value=el('output-mode').value==='auto'?null:Number(el('output-tokens').value),all=allSessions();
    const target={...scope},revision=viewRevision,epoch=getState().authEpoch,submitted=outputInput(),formGeneration=generation;
    const operationKey=key(model,target.viewKey),operation=++outputOperation;
    const sameForm=()=>current(revision)&&loadedModel===model&&generation===formGeneration;
    try{
      if(value!==null&&!validOutputTokens(value))throw Error('Choisis un nombre entier entre 1 et 5 000 000.');
      const preference={maxOutputTokens:value,applyToAllSessions:all};
      outputOperations.set(operationKey,operation);outputDrafts.delete(operationKey);outputSubmitting={revision,model,value:submitted};updateDirty();
      let data;
      if(target.id||all)data=await api('/api/model-preferences',{method:'POST',body:JSON.stringify({model,projectId:target.projectId,...(target.id?{id:target.id}:{}),...preference})});
      if(epoch!==getState().authEpoch||!getState().authenticated||outputOperations.get(operationKey)!==operation)return;
      if(!target.id&&!all)pending.set(operationKey,preference);else pending.delete(operationKey);
      if(same(outputDrafts.get(operationKey),submitted))outputDrafts.delete(operationKey);
      if(sameForm()){
        outputBaseline=submitted;outputData={...outputData,...data,source:all?(value===null?'auto':'model'):'session',automatic:value===null,maxOutputTokens:value??8192,applyToAllSessions:all};
        message('output-result',!target.id&&!all?'Réglage prêt pour le premier envoi de cette conversation.':all?'Défaut de ce modèle enregistré ; exception du chat courant retirée.':'Réglage enregistré pour cette conversation.');outputInfo();
      }
    }catch(e){if(sameForm())message('output-error',e.message,true);}
    finally{if(savingRevision===revision)savingRevision=null;if(outputSubmitting?.revision===revision&&outputSubmitting.model===model)outputSubmitting=null;if(current(revision)){el('output-save').disabled=!outputBaseline||savingRevision===viewRevision;updateDirty();}}
  });
  listen('comfy-settings-form','submit',async event=>{event.preventDefault();const revision=viewRevision,epoch=getState().authEpoch,ticket=++comfyRevision,submitted=comfyInput();comfySubmitting={revision,value:submitted};el('comfy-save').disabled=true;message('comfy-error','');updateDirty();try{const data=await api('/api/comfy/settings',{method:'POST',body:JSON.stringify({...submitted,url:submitted.url.trim()})});if(ticket!==comfyRevision||epoch!==getState().authEpoch||!getState().authenticated)return;comfy=data;if(current(revision)){const unchanged=same(comfyInput(),submitted);comfyBaseline={enabled:data.enabled,memoryCleanup:data.memoryCleanup===true,url:data.url,workflowId:data.workflowId,loraProfiles:profileCopies(data.loraProfiles,data.workflows)};if(unchanged)applyComfy(comfyBaseline);comfyDraft=null;message('comfy-result','Configuration enregistrée. '+(comfy.enabled?'Active Images dans le menu Outils pour le prochain message.':'ComfyUI est désactivé.'));comfyInfo();summaries();}onChange?.();imagePermission();}catch(e){if(current(revision))message('comfy-error',e.message,true);}finally{if(comfySubmitting?.revision===revision)comfySubmitting=null;if(current(revision)){el('comfy-save').disabled=false;updateDirty();}}});
  function invalidateSetup(){
    ++setupRevision;el('comfy-diagnostic').hidden=true;message('comfy-result','');
  }
  async function checkComfy(){
    const revision=viewRevision,ticket=++setupRevision;
    el('comfy-test').disabled=true;message('comfy-error','');message('comfy-result','Vérification du serveur, des modèles et du nettoyage…');el('comfy-diagnostic').hidden=true;
    try{
      const {url,workflowId,loraProfiles,memoryCleanup}=comfyInput();
      const data=await api('/api/comfy/check',{method:'POST',body:JSON.stringify({url,workflowId,loraProfiles,memoryCleanup})});
      if(!current(revision)||ticket!==setupRevision)return;
      el('comfy-diagnostic').hidden=false;el('comfy-models').replaceChildren();el('comfy-node-errors').replaceChildren();
      message('comfy-server-status',data.reachable?'Serveur connecté : '+data.url+' (ComfyUI '+(data.system?.comfyuiVersion||'version inconnue')+').':'Serveur inaccessible : '+(data.error||'vérifie l’adresse, le port et le démarrage de ComfyUI.'));
      const selected=data.workflows?.find(w=>w.id===workflowId);
      message('comfy-model-status',data.reachable?'Fichiers attendus pour '+(selected?.label||'ce modèle')+' :':'Modèles non vérifiés. Démarre le serveur puis relance la vérification.');
      for(const model of selected?.models||[])el('comfy-models').append(node('li','',(model.available?'Présent : ':'Manquant : ')+model.name+' — '+model.folder));
      for(const error of selected?.errors||[])el('comfy-node-errors').append(node('li','error',error));
      const memory=data.memoryCleanup;
      message('comfy-memory-status',!data.reachable?'Module mémoire non vérifié.':memory?.compatible?(memoryCleanup?'Nettoyage activé : module compatible.':'Nettoyage désactivé : module compatible, disponible si besoin.'):(memory?.available?'Module détecté, mais lien SaveImage incompatible. ':'Module mémoire absent ou incompatible. ')+(memoryCleanup?'Décoche le nettoyage pour continuer sans ce module, ou suis les instructions d’installation.':'Le nettoyage est désactivé : cela ne bloque pas la génération.'));
      message('comfy-result',data.ok?'Prêt à enregistrer. Aucun rendu lancé.':memoryCleanup&&selected?.models?.every(m=>m.available)?'Vérifie les nœuds et le module mémoire ci-dessus.':'Complète les éléments signalés, puis vérifie à nouveau.');
    }catch(e){if(current(revision)&&ticket===setupRevision){message('comfy-error',e.message,true);message('comfy-result','');}}
    finally{if(current(revision))el('comfy-test').disabled=false;}
  }
  el('comfy-test').addEventListener('click',checkComfy);
  el('comfy-discover').addEventListener('click',async()=>{
    const revision=viewRevision,ticket=++setupRevision,url=el('comfy-url').value.trim();
    el('comfy-discover').disabled=true;el('comfy-servers').replaceChildren();message('comfy-error','');message('comfy-discovery-status','Recherche sur le PC du compagnon…');el('comfy-diagnostic').hidden=true;
    try{
      const data=await api('/api/comfy/discover',{method:'POST',body:JSON.stringify({url})});
      if(!current(revision)||ticket!==setupRevision)return;
      message('comfy-discovery-status',data.servers.length?'Serveur(s) trouvé(s). Choisis une adresse pour vérifier les modèles.':'Aucun serveur trouvé aux adresses testées. Consulte « ComfyUI n’est pas trouvé ? » ou saisis un autre port.');
      for(const server of data.servers){
        const button=node('button','file-action','Utiliser '+server.url);button.type='button';
        button.addEventListener('click',()=>{el('comfy-url').value=server.url;invalidateSetup();updateDirty();checkComfy();});el('comfy-servers').append(button);
      }
    }catch(e){if(current(revision)&&ticket===setupRevision)message('comfy-discovery-status',e.message);}
    finally{if(current(revision))el('comfy-discover').disabled=false;}
  });
  for(const id of ['comfy-url','comfy-workflow','comfy-memory-cleanup','comfy-lora-1','comfy-lora-2','comfy-lora-1-strength','comfy-lora-2-strength'])listen(id,id==='comfy-url'||id.includes('strength')?'input':'change',()=>{invalidateSetup();updateDirty();});
  listen('comfy-workflow','change',()=>{rememberLoras();editingWorkflow=el('comfy-workflow').value;showLoras();updateDirty();});listen('comfy-loras-refresh','click',loadLoras);for(const index of [1,2]){listen('comfy-lora-'+index+'-strength','input',()=>{showStrength(index);updateDirty();});listen('comfy-lora-'+index,'change',updateDirty);}for(const id of ['comfy-enabled','comfy-url'])listen(id,id==='comfy-url'?'input':'change',updateDirty);
  listen('settings-model','change',()=>{const next=el('settings-model').value;if(next===loadedModel)return;el('settings-model').value=loadedModel;return requestTransition(()=>{el('settings-model').value=next;return loadOutput();},'Changer le modèle ciblé par ce plafond ?');});
  listen('output-mode','change',()=>{outputMode();updateDirty();});listen('output-all-sessions','change',updateDirty);listen('output-tokens','input',()=>{syncOutputSlider();updateDirty();});listen('output-tokens-slider','input',()=>{el('output-tokens').value=el('output-tokens-slider').value;syncOutputSlider();updateDirty();});listen('output-cancel','click',cancelOutput);listen('comfy-cancel','click',cancelComfy);listen('settings-reload','click',reload);
  listen('settings-close','click',()=>close());listen('settings-view','keydown',event=>{if(event.key==='Escape'){event.preventDefault();if(transition)decideTransition('continue');else close();}});for(const choice of ['continue','discard','keep'])listen('settings-unsaved-'+choice,'click',()=>decideTransition(choice));for(const button of document.querySelectorAll('[data-settings-page]'))button.addEventListener('click',()=>showPage(button.dataset.settingsPage,'settings-heading-'+button.dataset.settingsPage));listen('settings-back','click',()=>{++navigationRevision;if(activePage==='connection')certificates.reset();el('settings-view').dataset.settingsIndex='true';el('settings-search').focus({preventScroll:true});});listen('settings-search','input',search);
  for(const [id,target]of [['settings-edit-model','model'],['settings-edit-tools','tools'],['settings-edit-image','image'],['settings-help','help']])listen(id,'click',()=>requestNavigate(target));listen('settings-open-sidebar','click',open);globalThis.addEventListener?.('beforeunload',event=>{if(getState().authenticated&&hasUnsaved()){event.preventDefault();event.returnValue='';}});
  return {refresh,close,openPage,requestNavigate,hasUnsaved,revision:()=>viewRevision,isCurrent:revision=>current(revision),async openOutput(event,model){if(await openPage({currentTarget:event?.currentTarget||document.activeElement,outputModel:model},'models',model?'output-mode':'settings-model'))el('output-settings-form').scrollIntoView({block:'start'});},async openSecurity(){await openPage({currentTarget:el('settings-open-sidebar')},'connection','certificate-title');},imagePermission,enabled:()=>comfy?.enabled===true,decorate(data){const preference=pending.get(key(data.model));return {...data,...(preference?{outputPreferences:preference}:{}),...(data.imageAccess?{imageWorkflowId:el('image-workflow').value||comfy?.workflowId}:{})};},accepted(data,viewKey){const k=key(data.model,viewKey),value=pending.get(k);if(value&&same(value,data.outputPreferences))pending.delete(k);},reset(){pending.clear();outputDrafts.clear();outputOperations.clear();++comfyRevision;comfyDraft=null;outputBaseline=null;comfyBaseline=null;comfy=null;outputSubmitting=null;comfySubmitting=null;closeNow(false);}};
}
