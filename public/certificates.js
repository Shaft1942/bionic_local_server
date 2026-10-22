/* This panel only reads public certificate metadata through the authenticated API. */
function createCompanionCertificates({api,getState,node}) {
  const el=id=>document.getElementById(id);
  const modes={http:'HTTP',https:'HTTPS',mtls:'HTTPS + certificat client'};
  const descriptions={
    http:'Les échanges ne sont pas chiffrés. Utilise ce niveau sur un réseau de confiance.',
    https:'Les échanges sont chiffrés et le certificat du serveur est vérifié par ton appareil.',
    mtls:'Les échanges sont chiffrés. Chaque appareil doit aussi présenter son certificat client autorisé.'
  };
  let revision=0;
  const dates=new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'});
  function date(value){const result=new Date(value);return value&&Number.isFinite(result.getTime())?dates.format(result):'Date inconnue';}
  function clear(){
    el('certificate-data').hidden=true;
    el('certificate-mode').textContent='';el('certificate-description').textContent='';
    el('certificate-pending').textContent='';el('certificate-pending').hidden=true;
    el('certificate-details').replaceChildren();el('certificate-devices').replaceChildren();
    el('certificate-devices-empty').hidden=true;
  }
  function reset(){++revision;clear();el('certificate-status').textContent='';el('certificate-error').hidden=true;el('certificate-refresh').disabled=false;}
  function render(data){
    if(!Object.hasOwn(modes,data?.mode)||!Array.isArray(data.devices))throw Error('Invalid security status');
    el('certificate-mode').textContent=modes[data.mode];
    el('certificate-description').textContent=descriptions[data.mode];
    const details=el('certificate-details');
    const field=(label,value,className='')=>details.append(node('dt','',label),node('dd',className,value));
    if(data.server){
      field('Empreinte du serveur (SHA-256)',data.server.fingerprint||'Indisponible','certificate-fingerprint');
      field('Certificat serveur valable jusqu’au',date(data.server.expiresAt));
      field('Adresses couvertes',Array.isArray(data.server.hosts)?data.server.hosts.join(', '):'Indisponibles');
    }else field('Certificat serveur','Pas encore créé.');
    if(data.authority){
      field('Empreinte de l’autorité locale (SHA-256)',data.authority.fingerprint||'Indisponible','certificate-fingerprint');
      field('Autorité locale valable jusqu’au',date(data.authority.expiresAt));
    }else field('Autorité locale','Pas encore créée.');
    if(data.candidate&&Object.hasOwn(modes,data.candidate.mode)){
      const expired=Date.parse(data.candidate.expiresAt)<=Date.now();
      el('certificate-pending').textContent=expired
        ?'La préparation de '+modes[data.candidate.mode]+' a expiré. Reprends-la sur le PC serveur avec Certificats.cmd.'
        :'Préparation de '+modes[data.candidate.mode]+' en attente de vérification. Termine le parcours ouvert depuis Certificats.cmd sur le PC serveur. Vérification possible jusqu’au '+date(data.candidate.expiresAt)+'.';
      el('certificate-pending').hidden=false;
    }
    for(const device of data.devices){
      const row=node('li','certificate-device','');
      const state=device.revokedAt?'Révoqué le '+date(device.revokedAt):Date.parse(device.expiresAt)<=Date.now()?'Expiré':'Autorisé';
      row.append(node('strong','certificate-device-name',device.name||'Appareil sans nom'));
      row.append(node('p','certificate-device-state',state+' · Valable jusqu’au '+date(device.expiresAt)));
      row.append(node('p','certificate-fingerprint',device.fingerprint||'Empreinte indisponible'));
      el('certificate-devices').append(row);
    }
    el('certificate-devices-empty').hidden=data.devices.length>0;
    el('certificate-data').hidden=false;
  }
  async function load(){
    const epoch=getState().authEpoch,ticket=++revision;
    if(!getState().authenticated){reset();return;}
    clear();el('certificate-error').hidden=true;el('certificate-status').textContent='Chargement de la sécurité des connexions…';el('certificate-refresh').disabled=true;
    const current=()=>ticket===revision&&epoch===getState().authEpoch&&getState().authenticated&&!el('settings-view').hidden;
    try{
      const data=await api('/api/security/status');
      if(!current())return;
      render(data);el('certificate-status').textContent='';
    }catch{
      if(current()){clear();el('certificate-status').textContent='';el('certificate-error').hidden=false;}
    }finally{if(current())el('certificate-refresh').disabled=false;}
  }
  el('certificate-refresh').addEventListener('click',load);
  return {load,reset};
}
