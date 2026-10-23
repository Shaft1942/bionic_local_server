/* Generated images are server-owned assets, never arbitrary model-supplied URLs. */
function createImageGenerationView({api,node,getState,redraw}) {
  let polling=false;
  const labels=()=>({'waiting-resource':BionicI18n.t('components.images.waitingResource'),stopped:BionicI18n.t('components.images.stopped'),submitting:BionicI18n.t('components.images.submitting'),queued:BionicI18n.t('components.images.queued'),running:BionicI18n.t('components.images.running'),succeeded:BionicI18n.t('components.images.succeeded'),failed:BionicI18n.t('components.images.failed'),unknown:BionicI18n.t('components.images.unknown')});
  function url(job,chat,message,download=false){return '/api/comfy/image?'+new URLSearchParams({jobId:job.id,projectId:chat.projectId,chatId:chat.id,messageId:message.id,...(download?{download:'1'}:{})});}
  function card(job,chat,message){
    const figure=node('figure','generated-image');figure.dataset.imageJobId=job.id;
    const status=node('p','generated-image-status',labels()[job.status]||BionicI18n.t('components.images.tracking'));status.setAttribute('role','status');figure.append(status);
    if(job.status==='succeeded'&&job.image){
      const image=node('img','generated-image-result');image.src=url(job,chat,message);image.alt=job.prompt.slice(0,200);image.width=job.width;image.height=job.height;image.loading='lazy';
      image.addEventListener('error',()=>{status.textContent=BionicI18n.t('components.images.unavailable');});
      figure.append(image);
      const download=node('a','file-action',BionicI18n.t('components.images.download'));download.href=url(job,chat,message,true);download.download='ComfyUI-'+job.id+'.png';figure.append(download);
    }
    if(job.error)figure.append(node('p','generated-image-error',job.error));
    figure.append(node('figcaption','generated-image-meta',(job.workflowLabel||(job.workflowId==='hassaku_illustrious'?'Hassaku XL Illustrious v34':'Krea2 Turbo'))+' · '+job.width+' × '+job.height+' · seed '+job.seed));
    if(job.loras?.length)figure.append(node('p','generated-image-meta',BionicI18n.t('components.images.loras', { loras: job.loras.map(lora=>lora.name+' ('+BionicI18n.number(lora.strength)+')').join(' · ') })));
    const details=node('details','generated-image-prompt');details.append(node('summary','',BionicI18n.t('components.images.prompt')),node('p','',job.prompt));figure.append(details);
    return figure;
  }
  async function poll(){
    const state=getState();if(polling||!state.authenticated||document.hidden||!state.chat?.id)return;
    const chat=state.chat,epoch=state.authEpoch;
    const pending=(chat.messages||[]).flatMap(message=>(message.imageGenerations||[]).filter(job=>['waiting-resource','submitting','queued','running'].includes(job.status)).map(job=>({message,job})));
    if(!pending.length)return;
    polling=true;let changed=false;
    try{
      for(const {message,job}of pending){
        try{
          const latest=await api('/api/comfy/generation?'+new URLSearchParams({jobId:job.id,projectId:chat.projectId,chatId:chat.id,messageId:message.id}));
          if(epoch!==getState().authEpoch||!getState().authenticated)return;
          if(JSON.stringify(latest)!==JSON.stringify(job)){Object.assign(job,latest);changed=true;}
        }catch{/* The existing login/offline UI handles disconnection. Never resubmit. */}
      }
      if(changed&&getState().chat===chat)redraw();
    }finally{polling=false;}
  }
  setInterval(poll,2000);
  document.addEventListener('visibilitychange',poll);window.addEventListener('online',poll);
  return {card,poll};
}
