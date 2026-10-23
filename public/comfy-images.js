/* Generated images are server-owned assets, never arbitrary model-supplied URLs. */
function createImageGenerationView({api,node,getState,redraw,onRetry,newRequestId}) {
  let polling=false,previewFocus=null,previewJobId='';
  const attempts=new Map(),selections=new Map();
  const labels=()=>({'waiting-resource':BionicI18n.t('components.images.waitingResource'),stopped:BionicI18n.t('components.images.stopped'),submitting:BionicI18n.t("components.beta25.818c73dc9e"),queued:BionicI18n.t("components.beta25.3408c60177"),running:BionicI18n.t("components.beta25.4d26ed8fc4"),succeeded:BionicI18n.t("components.images.succeeded"),failed:BionicI18n.t("components.images.failed"),unknown:BionicI18n.t("components.images.unknown"),cancelled:BionicI18n.t("components.beta25.83e2f6be25"),canceled:BionicI18n.t("components.beta25.83e2f6be25")});
  const seriesLabel=job=>Number.isInteger(job.seriesTotal)&&job.seriesTotal>=2&&job.seriesTotal<=5&&Number.isInteger(job.seriesIndex)&&job.seriesIndex>=1&&job.seriesIndex<=job.seriesTotal?BionicI18n.t('components.beta25.series',{index:job.seriesIndex,total:job.seriesTotal}):'';
  const owner=(chat,message,options={})=>({projectId:options.projectId||chat?.projectId,chatId:chat?.id,messageId:message?.id});
  function url(job,chat,message,download=false,options={}){return options.projectOnly?'/api/comfy/generation-image?'+new URLSearchParams({projectId:options.projectId,jobId:job.id}):'/api/comfy/image?'+new URLSearchParams({jobId:job.id,projectId:chat.projectId,chatId:chat.id,messageId:message.id,...(download?{download:'1'}:{})});}
  function zipUrl(projectId,jobs){const params=new URLSearchParams({projectId});for(const job of jobs)params.append('jobId',typeof job==='string'?job:job.id);return '/api/comfy/images.zip?'+params;}
  function closePreview(){const dialog=document.getElementById?.('generated-image-preview');if(!dialog?.open)return;dialog.close();}
  function preview(job,chat,message,opener,options={}){
    const dialog=document.getElementById?.('generated-image-preview');if(!dialog)return;
    previewFocus=opener;previewJobId=job.id;
    document.getElementById('generated-image-preview-title').textContent=seriesLabel(job).replace(/ · $/,'')||BionicI18n.t("components.images.succeeded");
    const image=document.getElementById('generated-image-preview-image');image.src=url(job,chat,message,false,options);image.alt=job.prompt||BionicI18n.t("components.images.succeeded");
    document.getElementById('generated-image-preview-caption').textContent=job.prompt||'';
    if(!dialog.open)dialog.showModal();document.getElementById('generated-image-preview-close').focus();
  }
  const dialog=document.getElementById?.('generated-image-preview');
  if(dialog){document.getElementById('generated-image-preview-close').addEventListener('click',closePreview);dialog.addEventListener('close',()=>{document.getElementById('generated-image-preview-image').removeAttribute('src');const fallback=[...document.querySelectorAll('[data-preview-image]')].find(button=>button.dataset.previewImage===previewJobId);(previewFocus?.isConnected?previewFocus:fallback)?.focus({preventScroll:true});});}
  function id(){if(newRequestId)return newRequestId();if(globalThis.crypto?.randomUUID)return crypto.randomUUID();return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^Math.random()*16>>Number(c)/4).toString(16));}
  function actions(job,chat,message,figure){
    const canCancel=job.status==='queued'&&job.queuedLocally===true&&!job.promptId;
    const canRetry=['succeeded','failed','cancelled'].includes(job.status);
    if(!canCancel&&!canRetry)return;
    const controls=node('div','generated-image-actions'),feedback=node('p','generated-image-meta');feedback.setAttribute('role','status');
    const key=job.id,record=attempts.get(key)||{busy:false,message:'',requestIds:{}};attempts.set(key,record);feedback.textContent=record.message;
    const buttons=[];
    function control(label,operation){const button=node('button','file-action',label);button.type='button';button.disabled=record.busy;button.dataset.workspaceFocus='image:'+job.id+':'+operation;buttons.push(button);controls.append(button);button.addEventListener('click',async()=>{
      if(record.busy)return;record.busy=true;buttons.forEach(button=>button.disabled=true);const epoch=getState().authEpoch,scope=owner(chat,message);
      record.message=feedback.textContent=operation==='cancel'?BionicI18n.t("components.beta25.76d28aec52"):BionicI18n.t("components.beta25.0f5c30c5ff");
      try{
        if(operation==='cancel'){
          const latest=await api('/api/comfy/generation/cancel',{method:'POST',body:JSON.stringify({...scope,jobId:job.id})});
          if(epoch!==getState().authEpoch||!getState().authenticated)return;Object.assign(job,latest);record.message=BionicI18n.t("components.beta25.2e2aff7e29");redraw();
        }else{
          const requestId=record.requestIds[operation]||(record.requestIds[operation]=id());
          const result=await api('/api/comfy/generation/retry',{method:'POST',body:JSON.stringify({...scope,jobId:job.id,seedMode:operation,requestId})});
          if(epoch!==getState().authEpoch||!getState().authenticated)return;
          record.message=feedback.textContent=BionicI18n.t("components.beta25.035d3b4870");
          try{if(onRetry)await onRetry(result,scope);}
          catch{record.message=feedback.textContent=BionicI18n.t("components.beta25.cdad1d6459");}
          delete record.requestIds[operation];
        }
      }catch(error){if(epoch===getState().authEpoch&&getState().authenticated)record.message=feedback.textContent=error.message+(operation==='cancel'?'':BionicI18n.t("components.beta25.ae01d576c7"));}
      finally{record.busy=false;if(epoch===getState().authEpoch&&getState().authenticated){buttons.forEach(button=>button.disabled=false);feedback.textContent=record.message;redraw();}}
    });}
    if(canCancel)control(BionicI18n.t("components.beta25.7964856b70"),'cancel');
    if(canRetry){control(BionicI18n.t("components.beta25.dd31fef4b4"),'same');control(BionicI18n.t("components.beta25.2301ac3fc6"),'new');}
    figure.append(controls,feedback);
  }
  function card(job,chat,message,options={}){
    const figure=node('figure','generated-image');figure.dataset.imageJobId=job.id;
    const position=job.status==='queued'&&Number.isSafeInteger(job.queuePosition)&&job.queuePosition>0?BionicI18n.t('components.beta25.position',{position:job.queuePosition}):'';
    const status=node('p','generated-image-status',seriesLabel(job)+(labels()[job.status]||BionicI18n.t("components.images.tracking"))+position);status.setAttribute('role','status');figure.append(status);
    if(job.status==='succeeded'&&job.image){
      const image=node('img','generated-image-result');image.src=url(job,chat,message,false,options);image.alt=(job.prompt||BionicI18n.t("components.images.succeeded")).slice(0,200);image.width=job.width;image.height=job.height;image.loading='lazy';
      image.addEventListener('error',()=>{status.textContent='L’image est indisponible. Reconnecte-toi puis actualise cet espace.';});figure.append(image);
      const links=node('div','generated-image-actions');
      const show=node('button','file-action',BionicI18n.t("components.beta25.f02feea881"));show.type='button';show.dataset.previewImage=job.id;show.dataset.workspaceFocus='preview:'+job.id;show.addEventListener('click',()=>preview(job,chat,message,show,options));
      const download=node('a','file-action',BionicI18n.t("components.images.download"));download.href=url(job,chat,message,true,options);download.download='ComfyUI-'+job.id+'.png';download.dataset.workspaceFocus='download:'+job.id;links.append(show,download);figure.append(links);
    }
    if(job.error)figure.append(node('p','generated-image-error',job.error));
    const duration=Number.isFinite(job.executionDurationMs)&&job.executionDurationMs>=0?BionicI18n.t('components.beta25.duration',{seconds:BionicI18n.number(job.executionDurationMs/1000,{maximumFractionDigits:1})}):'';
    figure.append(node('figcaption','generated-image-meta',(job.workflowLabel||(job.workflowId==='hassaku_illustrious'?'Hassaku XL Illustrious v34':'Krea2 Turbo'))+' · '+job.width+' × '+job.height+' · seed '+job.seed+duration));
    const policy={keep:BionicI18n.t("components.beta25.f939f6c304"),alternate:BionicI18n.t("components.beta25.1c54ce625c"),unload:BionicI18n.t("components.beta25.83c8060e01")}[job.modelPolicy];
    if(policy)figure.append(node('p','generated-image-meta',BionicI18n.t('components.beta25.policy',{policy})));
    if(job.loras?.length)figure.append(node('p','generated-image-meta','LoRA : '+job.loras.map(lora=>lora.name+' ('+lora.strength+')').join(' · ')));
    const details=node('details','generated-image-prompt');details.append(node('summary','',BionicI18n.t("components.images.prompt")),node('p','',job.prompt));figure.append(details);
    if(!options.readonly&&!options.projectOnly)actions(job,chat,message,figure);
    return figure;
  }
  function gallery(jobs,chat,message,options={}){
    const section=node('section','generated-image-gallery');section.setAttribute('aria-label',options.projectOnly?BionicI18n.t("components.beta25.a676d19f27"):BionicI18n.t("components.beta25.2a7737c4f6"));
    const projectId=options.projectId||chat.projectId,available=jobs.filter(job=>job.status==='succeeded'&&job.image);
    if(options.projectOnly){
      const selected=selections.get(projectId)||new Set();selections.set(projectId,selected);
      const controls=node('div','generated-image-gallery-toolbar'),count=node('span','generated-image-meta'),zip=node('a','file-action',BionicI18n.t("components.beta25.36dff16bfd"));zip.download='images-generees.zip';
      const error=node('p','generated-image-error');error.setAttribute('role','status');
      function update(){count.textContent=BionicI18n.t('components.beta25.selection',{count:selected.size});zip.hidden=!selected.size;zip.href=zipUrl(projectId,[...selected]);}
      controls.append(count,zip);section.append(controls,error);update();
      const grid=node('div','generated-image-grid');
      for(const job of available){const item=node('div','generated-image-gallery-item'),label=node('label','generated-image-select'),input=node('input');input.type='checkbox';input.checked=selected.has(job.id);input.setAttribute('aria-label',BionicI18n.t('components.beta25.select',{prompt:(job.prompt||'').slice(0,120)}));label.append(input,node('span','',BionicI18n.t("components.beta25.d735fddccc")));input.addEventListener('change',()=>{if(input.checked&&selected.size>=20){input.checked=false;error.textContent=BionicI18n.t("components.beta25.4b5d9e65d5");return;}if(input.checked)selected.add(job.id);else selected.delete(job.id);error.textContent='';update();});item.append(label,card(job,chat,message,{...options,readonly:true}));grid.append(item);}
      section.append(grid);return section;
    }
    const groups=new Map();for(const job of jobs){const key=job.seriesId||job.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(job);}
    for(const group of groups.values()){
      const ready=group.filter(job=>job.status==='succeeded'&&job.image),header=node('div','generated-image-gallery-toolbar');
      header.append(node('h3','',group[0].seriesTotal>1?BionicI18n.t('components.beta25.seriesTitle',{count:group[0].seriesTotal}):BionicI18n.t("components.images.succeeded")),node('span','generated-image-meta',BionicI18n.t('components.beta25.available',{ready:ready.length,total:group.length})));
      if(ready.length&&ready.length<=5){const zip=node('a','file-action',BionicI18n.t("components.beta25.3e77a846a2"));zip.href=zipUrl(projectId,ready);zip.download='serie-images.zip';zip.dataset.workspaceFocus='zip:'+group[0].id;header.append(zip);}
      if(ready.length>5)header.append(node('p','generated-image-error',BionicI18n.t("components.beta25.abefcaf401")));
      const grid=node('div','generated-image-grid');for(const job of group)grid.append(card(job,chat,message,options));section.append(header,grid);
    }
    return section;
  }
  async function poll(){
    const state=getState();if(polling||!state.authenticated||document.hidden||!state.chat?.id)return;
    const chat=state.chat,epoch=state.authEpoch;
    const pending=(chat.messages||[]).flatMap(message=>(message.imageGenerations||[]).filter(job=>['waiting-resource','submitting','queued','running'].includes(job.status)).map(job=>({message,job})));
    if(!pending.length)return;polling=true;let changed=false;
    try{for(const {message,job}of pending){try{const latest=await api('/api/comfy/generation?'+new URLSearchParams({jobId:job.id,projectId:chat.projectId,chatId:chat.id,messageId:message.id}));if(epoch!==getState().authEpoch||!getState().authenticated)return;if(JSON.stringify(latest)!==JSON.stringify(job)){Object.assign(job,latest);changed=true;}}catch{}}if(changed&&getState().chat===chat)redraw();}finally{polling=false;}
  }
  setInterval(poll,2000);document.addEventListener('visibilitychange',poll);window.addEventListener('online',poll);
  return {card,gallery,poll,reset(){attempts.clear();selections.clear();closePreview();}};
}
