/* Browser enrollment keeps export secrets in this open panel only. */
function createCompanionCertificates({api,getState,node}) {
  const el=id=>document.getElementById(id),modes={http:'HTTP',https:'HTTPS',mtls:'HTTPS + certificat client'};
  const descriptions={http:'Les échanges ne sont pas chiffrés. Utilise ce niveau sur un réseau de confiance.',https:'Les échanges sont chiffrés et le certificat du serveur est vérifié par ton appareil.',mtls:'Les échanges sont chiffrés. Chaque appareil doit aussi présenter son certificat client autorisé.'};
  const dates=new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'});
  let revision=0,metadata,working=false,exportData,exportTimer,revokeTarget;
  function date(value){const result=new Date(value);return value&&Number.isFinite(result.getTime())?dates.format(result):'Date inconnue';}
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
    if(!Object.hasOwn(modes,data?.mode)||!Array.isArray(data.devices))throw Error('Invalid security status');metadata=data;
    text('certificate-mode',modes[data.mode]);text('certificate-description',descriptions[data.mode]);
    const details=el('certificate-details');details.replaceChildren();
    const field=(label,value,className='')=>details.append(node('dt','',label),node('dd',className,value));
    if(data.server){field('Empreinte du serveur (SHA-256)',data.server.fingerprint||'Indisponible','certificate-fingerprint');field('Certificat serveur valable jusqu’au',date(data.server.expiresAt));field('Adresses couvertes',Array.isArray(data.server.hosts)?data.server.hosts.join(', '):'Indisponibles');}else field('Certificat serveur','Pas encore créé.');
    if(data.authority){field('Empreinte de l’autorité locale (SHA-256)',data.authority.fingerprint||'Indisponible','certificate-fingerprint');field('Autorité locale valable jusqu’au',date(data.authority.expiresAt));}else field('Autorité locale','Pas encore créée.');
    const pending=data.candidate&&Object.hasOwn(modes,data.candidate.mode),expired=pending&&Date.parse(data.candidate.expiresAt)<=Date.now();
    el('certificate-pending').hidden=!pending;text('certificate-pending',pending?(expired?'La préparation de '+modes[data.candidate.mode]+' a expiré. Recommence la préparation ci-dessous.':'Préparation de '+modes[data.candidate.mode]+' en attente de vérification. L’accès actuel reste actif jusqu’à ta confirmation. Vérification possible jusqu’au '+date(data.candidate.expiresAt)+'.'):'');
    const web=data.web,canConfigure=web?.canConfigure===true;
    el('certificate-controls').hidden=!canConfigure;
    el('certificate-network-help').hidden=!canConfigure||web.proofPortProvisioned!==false;
    text('certificate-network-help',web?.proofPortProvisioned===false?'Configuration réseau à terminer une seule fois sur le PC : autorise le port de vérification HTTPS '+(web.proofPort||'configuré')+' dans l’assistant d’installation. Les certificats se géreront ensuite depuis ce téléphone.':'');
    el('certificate-setup-form').hidden=!canConfigure||!!pending&&!expired;
    text('certificate-setup-title',data.mode==='http'?'Chiffrer les connexions':'Renouveler le certificat du serveur');
    text('certificate-prepare',data.mode==='http'?'Préparer HTTPS':'Préparer le renouvellement');
    text('certificate-setup-help',data.mode==='http'?'Prépare HTTPS pour le nom ou l’IP réellement utilisé sur ton téléphone. Installe ensuite l’autorité publique .crt comme certificat CA, puis vérifie la connexion sans alerte. L’accès actuel reste disponible jusqu’à ta confirmation.':'Prépare le nouveau certificat pour les noms et IP réellement utilisés ci-dessous. Une nouvelle adresse doit être couverte par ce certificat. Le niveau actuel reste actif jusqu’à ta vérification.');
    if(canConfigure&&!el('certificate-hosts').value)el('certificate-hosts').value=(web.suggestedHosts||data.server?.hosts||[]).join(', ');
    const proof=web?.proofRequest;
    el('certificate-preparation').hidden=!pending||expired||!canConfigure;
    el('certificate-proof-form').hidden=!proof;
    el('certificate-proof-id').value=proof?.id||'';el('certificate-proof-csrf').value=web?.csrfToken||'';
    text('certificate-ca-fingerprint',data.authority?.fingerprint||'Actualise les paramètres.');
    text('certificate-proof-help',proof?'La vérification ouvre un nouvel onglet sur un port temporaire. Confirme uniquement sans avertissement de certificat, puis reviens à l’adresse HTTPS habituelle du compagnon. En cas d’alerte, relève l’adresse et le code NET::ERR_CERT_… ; consulte le guide ci-dessous.':'Cette préparation a été ouverte dans une autre connexion. Recommence-la ici pour obtenir une vérification liée à cet appareil.');
    el('certificate-device-form').hidden=!web?.canIssueDevice;
    el('certificate-mtls').hidden=!canConfigure||data.mode!=='https'||!data.devices.some(device=>!device.revokedAt&&Date.parse(device.expiresAt)>Date.now());
    el('certificate-devices').replaceChildren();
    for(const device of data.devices){
      const row=node('li','certificate-device',''),active=!device.revokedAt&&Date.parse(device.expiresAt)>Date.now();
      const state=device.revokedAt?'Révoqué le '+date(device.revokedAt):active?'Autorisé':'Expiré';
      row.append(node('strong','certificate-device-name',device.name||'Appareil sans nom'),node('p','certificate-device-state',state+' · Valable jusqu’au '+date(device.expiresAt)),node('p','certificate-fingerprint',device.fingerprint||'Empreinte indisponible'));
      if(web?.canIssueDevice&&!device.revokedAt){
        const renew=node('button','file-action','Renouveler');renew.type='button';renew.addEventListener('click',()=>issueDevice({previousId:device.id}));row.append(renew);
        if(web.currentDeviceId!==device.id){const revoke=node('button','file-action','Retirer cet appareil');revoke.type='button';revoke.addEventListener('click',()=>{revokeTarget=device;text('certificate-revoke-message','Retirer « '+device.name+' » ? Ses prochaines connexions seront refusées. Ses conversations et fichiers restent conservés.');el('certificate-revoke-confirm').hidden=false;el('certificate-revoke-yes').focus();});row.append(revoke);}else row.append(node('p','','Certificat utilisé par cette connexion.'));
      }
      el('certificate-devices').append(row);
    }
    el('certificate-devices-empty').hidden=data.devices.length>0;el('certificate-data').hidden=false;
  }
  async function load(){
    if(working)return;const epoch=getState().authEpoch,ticket=++revision;if(!getState().authenticated){reset();return;}
    clear();el('certificate-error').hidden=true;text('certificate-status','Chargement de la sécurité des connexions…');el('certificate-refresh').disabled=true;
    try{const data=await api('/api/security/status');if(!current(ticket,epoch))return;render(data);text('certificate-status','');}
    catch{if(current(ticket,epoch)){clear();text('certificate-status','');el('certificate-error').hidden=false;}}
    finally{if(current(ticket,epoch))el('certificate-refresh').disabled=false;}
  }
  async function run(work){
    if(working)return;const ticket=revision,epoch=getState().authEpoch;busy(true);actionMessage('','');
    try{await work(()=>current(ticket,epoch));}catch(error){if(current(ticket,epoch))actionMessage('',error.message||'Action impossible. Actualise les paramètres puis réessaie.');}
    finally{if(current(ticket,epoch))busy(false);}
  }
  async function action(input){if(!metadata?.web?.csrfToken)throw Error('Actualise les paramètres pour reprendre la configuration.');return api('/api/security/actions',{method:'POST',headers:{'X-Bionic-CSRF':metadata.web.csrfToken},body:JSON.stringify(input)});}
  function hosts(){return el('certificate-hosts').value.split(/[,\s]+/).map(value=>value.trim()).filter(Boolean);}
  function prepare(mode){return run(async valid=>{const data=await action({action:'prepare',mode,hosts:hosts()});if(valid()){render(data.status);actionMessage('Préparation prête. Vérifie l’empreinte de l’autorité avec le PC, installe le .crt comme CA, puis ouvre la vérification sécurisée.','');el('certificate-ca-download').focus();}});}
  function issueDevice(input){return run(async valid=>{
    actionMessage('Création du certificat…','');const issued=await action({action:'issue-device',...input});if(!valid())return;
    clearExport();exportData=issued;text('certificate-export-password',issued.passphrase);el('certificate-download').hidden=false;
    text('certificate-export-title',issued.previousId?'Certificat de remplacement prêt':'Certificat prêt à télécharger');
    text('certificate-export-help',issued.previousId?'L’ancien certificat reste actif. Importe et vérifie ce remplacement avant de retirer l’ancien appareil. Garde le .p12 et son mot de passe privés ; ne les envoie jamais pour demander de l’aide.':'Ce .p12 est une identité client privée pour mTLS, distincte de l’autorité .crt. Importe-le comme certificat utilisateur avec le mot de passe ci-dessus. Garde-les privés et supprime la copie de transfert après import. Le navigateur peut ensuite demander de sélectionner cette identité.');
    el('certificate-export').hidden=false;exportTimer=setTimeout(clearExport,Math.max(1,Date.parse(issued.expiresAt)-Date.now()));
    const data=await api('/api/security/status');if(valid()){render(data);actionMessage('Certificat créé. Télécharge-le et importe-le sur cet appareil.','');el('certificate-download').focus();}
  });}
  el('certificate-refresh').addEventListener('click',load);
  el('certificate-setup-form').addEventListener('submit',event=>{event.preventDefault();prepare(metadata?.mode==='mtls'?'mtls':'https');});
  el('certificate-mtls').addEventListener('click',()=>prepare('mtls'));
  el('certificate-cancel').addEventListener('click',()=>run(async valid=>{const data=await action({action:'cancel-preparation'});if(valid()){render(data);actionMessage('Préparation annulée. Le niveau actif est conservé.','');}}));
  el('certificate-device-form').addEventListener('submit',event=>{event.preventDefault();issueDevice({name:el('certificate-device-name').value.trim()});});
  el('certificate-download').addEventListener('click',()=>run(async valid=>{
    if(!exportData)throw Error('Le téléchargement a expiré. Crée un nouveau certificat.');
    const response=await fetch('/api/security/device-download',{method:'POST',headers:{'Content-Type':'application/json','X-Bionic-CSRF':metadata.web.csrfToken},body:JSON.stringify({exportId:exportData.exportId})});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'Téléchargement impossible. Actualise les paramètres puis réessaie.');}
    const blob=await response.blob();if(!valid())return;const url=URL.createObjectURL(blob),link=node('a','','');link.href=url;link.download='bionic-appareil.p12';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);el('certificate-download').hidden=true;actionMessage('Identité privée téléchargée. Importe bionic-appareil.p12 avec le mot de passe ci-dessus ; ne les joins jamais à une demande d’aide.','');
  }));
  el('certificate-export-clear').addEventListener('click',clearExport);
  el('certificate-revoke-no').addEventListener('click',()=>{revokeTarget=null;el('certificate-revoke-confirm').hidden=true;});
  el('certificate-revoke-yes').addEventListener('click',()=>run(async valid=>{if(!revokeTarget)return;const target=revokeTarget;const data=await action({action:'revoke-device',id:target.id,confirmName:target.name});if(valid()){revokeTarget=null;el('certificate-revoke-confirm').hidden=true;render(data);actionMessage('Accès retiré pour « '+target.name+' ».','');}}));
  return {load,reset};
}
