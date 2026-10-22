/* Generated images are server-owned assets, never arbitrary model-supplied URLs. */
function createImageGenerationView({api,node,getState,redraw}) {
  let polling=false;
  const labels={submitting:'Envoi à ComfyUI…',queued:'Image en attente dans ComfyUI…',running:'ComfyUI génère ton image sur le PC…',succeeded:'Image générée',failed:'La génération a échoué',unknown:'Résultat de génération à vérifier'};
  function url(job,chat,message,download=false){return '/api/comfy/image?'+new URLSearchParams({jobId:job.id,projectId:chat.projectId,chatId:chat.id,messageId:message.id,...(download?{download:'1'}:{})});}
  function card(job,chat,message){
    const figure=node('figure','generated-image');figure.dataset.imageJobId=job.id;
    const status=node('p','generated-image-status',labels[job.status]||'Suivi de génération');status.setAttribute('role','status');figure.append(status);
    if(job.status==='succeeded'&&job.image){
      const image=node('img','generated-image-result');image.src=url(job,chat,message);image.alt=job.prompt.slice(0,200);image.width=job.width;image.height=job.height;image.loading='lazy';
      image.addEventListener('error',()=>{status.textContent='L’image est indisponible. Reconnecte-toi puis actualise la conversation.';});
      figure.append(image);
      const download=node('a','file-action','Télécharger l’image');download.href=url(job,chat,message,true);download.download='ComfyUI-'+job.id+'.png';figure.append(download);
    }
    if(job.error)figure.append(node('p','generated-image-error',job.error));
    figure.append(node('figcaption','generated-image-meta',(job.workflowLabel||(job.workflowId==='hassaku_illustrious'?'Hassaku XL Illustrious v34':'Krea2 Turbo'))+' · '+job.width+' × '+job.height+' · seed '+job.seed));
    if(job.loras?.length)figure.append(node('p','generated-image-meta','LoRA : '+job.loras.map(lora=>lora.name+' ('+lora.strength+')').join(' · ')));
    const details=node('details','generated-image-prompt');details.append(node('summary','','Prompt utilisé'),node('p','',job.prompt));figure.append(details);
    return figure;
  }
  async function poll(){
    const state=getState();if(polling||!state.authenticated||document.hidden||!state.chat?.id)return;
    const chat=state.chat,epoch=state.authEpoch;
    const pending=(chat.messages||[]).flatMap(message=>(message.imageGenerations||[]).filter(job=>['submitting','queued','running'].includes(job.status)).map(job=>({message,job})));
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
