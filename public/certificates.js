/* Browser enrollment keeps export secrets in this open panel only. */
function createCompanionCertificates({api,getState,node}) {
  const el=id=>document.getElementById(id),modes={http:'HTTP',https:'HTTPS',mtls:'mtls'};
  const descriptions=()=>({http:BionicI18n.t('components.certificates.httpDescription'),https:BionicI18n.t('components.certificates.httpsDescription'),mtls:BionicI18n.t('components.certificates.mtlsDescription')});
  const modeLabel=mode=>mode==='mtls'?BionicI18n.t('components.certificates.mtls'):modes[mode];
  let revision=0,metadata,working=false,exportData,exportTimer,revokeTarget;
  function date(value){const result=new Date(value);return value&&Number.isFinite(result.getTime())?BionicI18n.date(result,{dateStyle:'medium',timeStyle:'short'}):BionicI18n.t('components.certificates.dateUnknown');}
  function text(id,value){el(id).textContent=value;}
  function clearExport(){if(exportTimer)clearTimeout(exportTimer);exportTimer=null;exportData=null;text('certificate-export-password','');text('certificate-export-help','');el('certificate-export').hidden=true;}
  function clear(){
    metadata=null;el('certificate-data').hidden=true;text('certificate-mode','');text('certificate-description','');text('certificate-pending','');el('certificate-pending').hidden=true;
    el('certificate-details').replaceChildren();el('certificate-devices').replaceChildren();el('certificate-devices-empty').hidden=true;
    el('certificate-controls').hidden=true;el('certificate-network-help').hidden=true;el('certificate-revoke-confirm').hidden=true;
    el('certificate-proof-id').value='';el('certificate-proof-csrf').value='';revokeTarget=null;
  }
  function reset(){++revision;busy(false);clear();clearExport();text('certificate-status','');el('certificate-error').hidden=true;el('certificate-refresh').disabled=false;actionMessage('','');}
  function actionMessage(result,error){text('certificate-action-result',result);text('certificate-action-error',error);el('certificate-action-error').hidden=!error;}
  function busy(value){working=value;el('certificate-refresh').disabled=value;for(const root of ['certificate-controls','certificate-devices'])for(const button of el(root).querySelectorAll?.('button')||[])button.disabled=value;}
  function current(ticket,epoch){return ticket===revision&&epoch===getState().authEpoch&&getState().authenticated&&!el('settings-view').hidden;}
  function render(data){
    if(!Object.hasOwn(modes,data?.mode)||!Array.isArray(data.devices))throw Error(BionicI18n.t('components.certificates.invalidStatus'));metadata=data;
    text('certificate-mode',modeLabel(data.mode));text('certificate-description',descriptions()[data.mode]);
    const details=el('certificate-details');details.replaceChildren();
    const field=(label,value,className='')=>details.append(node('dt','',label),node('dd',className,value));
    if(data.server){field(BionicI18n.t('components.certificates.serverFingerprint'),data.server.fingerprint||BionicI18n.t('components.certificates.unavailable'),'certificate-fingerprint');field(BionicI18n.t('components.certificates.serverExpires'),date(data.server.expiresAt));field(BionicI18n.t('components.certificates.hosts'),Array.isArray(data.server.hosts)?data.server.hosts.join(', '):BionicI18n.t('components.certificates.hostsUnavailable'));}else field(BionicI18n.t('components.certificates.serverCertificate'),BionicI18n.t('components.certificates.notCreated'));
    if(data.authority){field(BionicI18n.t('components.certificates.authorityFingerprint'),data.authority.fingerprint||BionicI18n.t('components.certificates.unavailable'),'certificate-fingerprint');field(BionicI18n.t('components.certificates.authorityExpires'),date(data.authority.expiresAt));}else field(BionicI18n.t('components.certificates.authority'),BionicI18n.t('components.certificates.authorityNotCreated'));
    const pending=data.candidate&&Object.hasOwn(modes,data.candidate.mode),expired=pending&&Date.parse(data.candidate.expiresAt)<=Date.now();
    el('certificate-pending').hidden=!pending;text('certificate-pending',pending?(expired?BionicI18n.t('components.certificates.preparationExpired', { mode: modeLabel(data.candidate.mode) }):BionicI18n.t('components.certificates.preparationPending', { mode: modeLabel(data.candidate.mode), date: date(data.candidate.expiresAt) })):'');
    const web=data.web,canConfigure=web?.canConfigure===true;
    el('certificate-controls').hidden=!canConfigure;
    el('certificate-network-help').hidden=!canConfigure||web.proofPortProvisioned!==false;
    text('certificate-network-help',web?.proofPortProvisioned===false?BionicI18n.t('components.certificates.networkSetup', { port: web.proofPort || BionicI18n.t('components.certificates.configuredPort') }):'');
    el('certificate-setup-form').hidden=!canConfigure||!!pending&&!expired;
    text('certificate-setup-title',data.mode==='http'?BionicI18n.t('components.certificates.encrypt'):BionicI18n.t('components.certificates.renewServer'));
    text('certificate-prepare',data.mode==='http'?BionicI18n.t('components.certificates.prepareHttps'):BionicI18n.t('components.certificates.prepareRenewal'));
    text('certificate-setup-help',data.mode==='http'?BionicI18n.t('components.certificates.setupHttps'):BionicI18n.t('components.certificates.setupRenewal'));
    if(canConfigure&&!el('certificate-hosts').value)el('certificate-hosts').value=(web.suggestedHosts||data.server?.hosts||[]).join(', ');
    const proof=web?.proofRequest;
    el('certificate-preparation').hidden=!pending||expired||!canConfigure;
    el('certificate-proof-form').hidden=!proof;
    el('certificate-proof-id').value=proof?.id||'';el('certificate-proof-csrf').value=web?.csrfToken||'';
    text('certificate-ca-fingerprint',data.authority?.fingerprint||BionicI18n.t('components.certificates.refresh'));
    text('certificate-proof-help',proof?BionicI18n.t('components.certificates.proof'):BionicI18n.t('components.certificates.proofOtherConnection'));
    el('certificate-device-form').hidden=!web?.canIssueDevice;
    el('certificate-mtls').hidden=!canConfigure||data.mode!=='https'||!data.devices.some(device=>!device.revokedAt&&Date.parse(device.expiresAt)>Date.now());
    el('certificate-devices').replaceChildren();
    for(const device of data.devices){
      const row=node('li','certificate-device',''),active=!device.revokedAt&&Date.parse(device.expiresAt)>Date.now();
      const state=device.revokedAt?BionicI18n.t('components.certificates.revoked', { date: date(device.revokedAt) }):active?BionicI18n.t('components.certificates.authorized'):BionicI18n.t('components.certificates.expired');
      row.append(node('strong','certificate-device-name',device.name||BionicI18n.t('components.certificates.unnamed')),node('p','certificate-device-state',BionicI18n.t('components.certificates.deviceMeta', { state, date: date(device.expiresAt) })),node('p','certificate-fingerprint',device.fingerprint||BionicI18n.t('components.certificates.fingerprintUnavailable')));
      if(web?.canIssueDevice&&!device.revokedAt){
        const renew=node('button','file-action',BionicI18n.t('components.certificates.renew'));renew.type='button';renew.addEventListener('click',()=>issueDevice({previousId:device.id}));row.append(renew);
        if(web.currentDeviceId!==device.id){const revoke=node('button','file-action',BionicI18n.t('components.certificates.removeDevice'));revoke.type='button';revoke.addEventListener('click',()=>{revokeTarget=device;text('certificate-revoke-message',BionicI18n.t('components.certificates.revokeConfirm', { name: device.name }));el('certificate-revoke-confirm').hidden=false;el('certificate-revoke-yes').focus();});row.append(revoke);}else row.append(node('p','',BionicI18n.t('components.certificates.currentDevice')));
      }
      el('certificate-devices').append(row);
    }
    el('certificate-devices-empty').hidden=data.devices.length>0;el('certificate-data').hidden=false;
  }
  async function load(){
    if(working)return;const epoch=getState().authEpoch,ticket=++revision;if(!getState().authenticated){reset();return;}
    clear();el('certificate-error').hidden=true;text('certificate-status',BionicI18n.t('components.certificates.loading'));el('certificate-refresh').disabled=true;
    try{const data=await api('/api/security/status');if(!current(ticket,epoch))return;render(data);text('certificate-status','');}
    catch{if(current(ticket,epoch)){clear();text('certificate-status','');el('certificate-error').hidden=false;}}
    finally{if(current(ticket,epoch))el('certificate-refresh').disabled=false;}
  }
  async function run(work){
    if(working)return;const ticket=revision,epoch=getState().authEpoch;busy(true);actionMessage('','');
    try{await work(()=>current(ticket,epoch));}catch(error){if(current(ticket,epoch))actionMessage('',error.message||BionicI18n.t('components.certificates.actionFailed'));}
    finally{if(current(ticket,epoch))busy(false);}
  }
  async function action(input){if(!metadata?.web?.csrfToken)throw Error(BionicI18n.t('components.certificates.refreshToConfigure'));return api('/api/security/actions',{method:'POST',headers:{'X-Bionic-CSRF':metadata.web.csrfToken},body:JSON.stringify(input)});}
  function hosts(){return el('certificate-hosts').value.split(/[,\s]+/).map(value=>value.trim()).filter(Boolean);}
  function prepare(mode){return run(async valid=>{const data=await action({action:'prepare',mode,hosts:hosts()});if(valid()){render(data.status);actionMessage(BionicI18n.t('components.certificates.prepared'),'');el('certificate-ca-download').focus();}});}
  function issueDevice(input){return run(async valid=>{
    actionMessage(BionicI18n.t('components.certificates.creating'),'');const issued=await action({action:'issue-device',...input});if(!valid())return;
    clearExport();exportData=issued;text('certificate-export-password',issued.passphrase);el('certificate-download').hidden=false;
    text('certificate-export-title',issued.previousId?BionicI18n.t('components.certificates.replacementReady'):BionicI18n.t('components.certificates.downloadReady'));
    text('certificate-export-help',issued.previousId?BionicI18n.t('components.certificates.replacementHelp'):BionicI18n.t('components.certificates.exportHelp'));
    el('certificate-export').hidden=false;exportTimer=setTimeout(clearExport,Math.max(1,Date.parse(issued.expiresAt)-Date.now()));
    const data=await api('/api/security/status');if(valid()){render(data);actionMessage(BionicI18n.t('components.certificates.created'),'');el('certificate-download').focus();}
  });}
  el('certificate-refresh').addEventListener('click',load);
  el('certificate-setup-form').addEventListener('submit',event=>{event.preventDefault();prepare(metadata?.mode==='mtls'?'mtls':'https');});
  el('certificate-mtls').addEventListener('click',()=>prepare('mtls'));
  el('certificate-cancel').addEventListener('click',()=>run(async valid=>{const data=await action({action:'cancel-preparation'});if(valid()){render(data);actionMessage(BionicI18n.t('components.certificates.cancelled'),'');}}));
  el('certificate-device-form').addEventListener('submit',event=>{event.preventDefault();issueDevice({name:el('certificate-device-name').value.trim()});});
  el('certificate-download').addEventListener('click',()=>run(async valid=>{
    if(!exportData)throw Error(BionicI18n.t('components.certificates.downloadExpired'));
    const response=await fetch('/api/security/device-download',{method:'POST',headers:{'Content-Type':'application/json','X-Bionic-CSRF':metadata.web.csrfToken},body:JSON.stringify({exportId:exportData.exportId})});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||BionicI18n.t('components.certificates.downloadFailed'));}
    const blob=await response.blob();if(!valid())return;const url=URL.createObjectURL(blob),link=node('a','','');link.href=url;link.download='bionic-appareil.p12';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);el('certificate-download').hidden=true;actionMessage(BionicI18n.t('components.certificates.downloaded'),'');
  }));
  el('certificate-export-clear').addEventListener('click',clearExport);
  el('certificate-revoke-no').addEventListener('click',()=>{revokeTarget=null;el('certificate-revoke-confirm').hidden=true;});
  el('certificate-revoke-yes').addEventListener('click',()=>run(async valid=>{if(!revokeTarget)return;const target=revokeTarget;const data=await action({action:'revoke-device',id:target.id,confirmName:target.name});if(valid()){revokeTarget=null;el('certificate-revoke-confirm').hidden=true;render(data);actionMessage(BionicI18n.t('components.certificates.revokedToast', { name: target.name }),'');}}));
  BionicI18n.onChange(() => {
    if(metadata) {
      const hostsDraft=el('certificate-hosts').value,deviceDraft=el('certificate-device-name').value;
      render(metadata); el('certificate-hosts').value=hostsDraft;el('certificate-device-name').value=deviceDraft;busy(working);
    }
    if(exportData) {
      text('certificate-export-title',BionicI18n.t(exportData.previousId?'components.certificates.replacementReady':'components.certificates.downloadReady'));
      text('certificate-export-help',BionicI18n.t(exportData.previousId?'components.certificates.replacementHelp':'components.certificates.exportHelp'));
    }
    if(revokeTarget) text('certificate-revoke-message',BionicI18n.t('components.certificates.revokeConfirm',{name:revokeTarget.name}));
  });
  return {load,reset};
}
