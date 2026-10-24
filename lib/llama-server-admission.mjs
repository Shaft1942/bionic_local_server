/** A reachable external direct server cannot be treated as unloaded from absent meta. */
export function assertExternalInferenceIdle(provider, catalogue) {
  const refuse=(code,message)=>{throw Object.assign(new Error(message),{status:409,code});};
  if(!Array.isArray(catalogue)||!['bionic','llamacpp'].includes(provider))refuse('llama-other-engine-unknown','L’état du moteur existant ne peut pas être vérifié.');
  if(provider==='llamacpp'&&catalogue.length)refuse('llama-other-engine-loaded','Arrête le serveur llama-server externe avant de démarrer ce profil. Son catalogue ne prouve pas que son modèle est déchargé.');
  for(const model of catalogue){
    if(!model||typeof model.type!=='string'||model.type==='llm'&&typeof model.loaded!=='boolean')refuse('llama-other-engine-unknown','L’état d’un modèle existant est ambigu. Contrôle ce moteur avant le lancement.');
    if(model.type==='llm'&&model.loaded)refuse('llama-other-engine-loaded','Décharge le modèle du moteur existant avant de démarrer ce profil. Aucun serveur externe n’est arrêté automatiquement.');
  }
}
