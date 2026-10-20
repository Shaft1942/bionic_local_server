import { randomUUID } from 'node:crypto';
const string = description => ({ type: 'string', description });
const tool = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } });
export const FILE_TOOLS = [
  tool('search_project_files','Chercher des noms ou des passages dans le projet, sans charger tous les fichiers dans le contexte.',{path:string('Dossier relatif ou chaîne vide.'),query:string('Texte à chercher.'),mode:{type:'string',enum:['name','text']}},['path','query','mode']),
  tool('inspect_project_file','Obtenir la taille et la version actuelle d’un fichier avant copie, déplacement ou mise à la corbeille.',{path:string('Fichier relatif.')},['path']),
  tool('create_project_directory','Créer un dossier dans le projet.',{path:string('Dossier relatif à créer.')},['path']),
  tool('copy_project_file','Copier un fichier inspecté pendant cette demande, sans remplacer de fichier existant.',{path:string('Fichier source inspecté.'),destination:string('Nouveau chemin relatif.')},['path','destination']),
  tool('move_project_file','Déplacer ou renommer un fichier inspecté, sans écraser la destination. Ne déplace pas de dossier.',{path:string('Fichier source inspecté.'),destination:string('Nouveau chemin relatif.')},['path','destination']),
  tool('trash_project_file','Retirer un fichier inspecté vers la corbeille privée, avec restauration possible depuis le chat. Jamais de suppression permanente ni de dossier.',{path:string('Fichier inspecté à retirer.')},['path']),
  tool('list_project_files', 'Lister un dossier du projet. Chemins relatifs uniquement.', { path: string('Dossier relatif, chaîne vide pour la racine.') }, ['path']),
  tool('read_project_file', 'Lire seulement un extrait utile au travail demandé. Utiliser query pour viser un passage, puis next si nécessaire. Ne pas parcourir toute une bibliothèque.', { path: string('Chemin relatif du fichier pertinent.'), start: { type: 'integer', minimum: 0, description: 'Position en caractères, 0 au début.' }, length: { type: 'integer', minimum: 1, maximum: 3000, description: 'Nombre de caractères utiles, au maximum 3000.' }, query: string('Texte à chercher dans ce fichier pour lire autour de sa première occurrence.') }, ['path']),
  tool('replace_project_text', 'Remplacer un passage exact et unique fourni par l’utilisateur ou lu dans le fichier pendant cette demande. Enregistrement immédiat avec sauvegarde. Relire après un conflit.', { path: string('Fichier relatif.'), old_text: string('Passage exact à remplacer, unique dans le fichier.'), new_text: string('Nouveau texte, éventuellement vide.') }, ['path', 'old_text', 'new_text']),
  tool('write_project_file', 'Créer un fichier texte ou remplacer entièrement un fichier déjà lu en totalité. Les fichiers JSON doivent être valides. Enregistrement immédiat avec sauvegarde.', { path: string('Chemin relatif du fichier.'), content: string('Contenu complet du fichier.') }, ['path', 'content'])
];
const fail = (status, message) => Object.assign(new Error(message), { status });
export const FILE_MUTATION_TOOLS = Object.freeze(['create_project_directory','copy_project_file','move_project_file','trash_project_file','replace_project_text','write_project_file']);
export function normalizeFileProfile({fileProfile,fileAccess} = {}) {
  if (fileProfile !== undefined) {
    if (!['none','read','write'].includes(fileProfile)) throw fail(400, 'Profil de fichiers invalide.');
    return fileProfile;
  }
  return fileAccess === true ? 'write' : 'none';
}
export function createFileAgent({ files, projectId, fileProfile = 'write', readLimit = 3000, readBudget = 12000, signal, userPrompt = '', initialReads = [] }) {
  normalizeFileProfile({fileProfile});
  const reads = new Map();
  const listings = new Set(), delivered = new Set(), opened = new Set();
  let remaining = readBudget;
  for (const file of initialReads) if (file.rootId === 'project' && file.kind !== 'image' && typeof file.text === 'string') reads.set(file.path, { hash: file.hash, excerpts: [file.text], full: !file.excerpt });
  function check() { if (signal?.aborted) throw fail(409, 'Demande arrêtée.'); }
  function validText(path, text) {
    if (typeof text !== 'string' || text.includes('\0') || text.length > 300_000 || Buffer.byteLength(text) > 1_000_000) throw fail(400, 'Contenu de fichier invalide ou trop volumineux.');
    if (/\.json$/i.test(path)) { try { JSON.parse(text); } catch { throw fail(400, 'Le JSON proposé est invalide. Corrige-le avant de réessayer ; aucun enregistrement effectué.'); } }
  }
  return {
    async execute(call) {
      const action = { id: randomUUID(), name: call.function?.name, path: '', ok: false, createdAt: Date.now() };
      try {
        check();
        if (typeof call.function?.arguments !== 'string' || call.function.arguments.length > 500_000) throw fail(400, 'Arguments d’outil invalides.');
        let args; try { args = JSON.parse(call.function.arguments); } catch { throw fail(400, 'Arguments JSON de l’outil invalides.'); }
        if (!args || typeof args.path !== 'string' || args.path.length > 1600) throw fail(400, 'Chemin relatif manquant.');
        action.path = args.path;
        const name = call.function.name;
        if (fileProfile === 'none' || (fileProfile !== 'write' && FILE_MUTATION_TOOLS.includes(name))) throw fail(403, 'Ce profil de fichiers n’autorise pas cette opération.');
        let result, read, extraReads;
        if(name==='search_project_files') {
          result=await files.search(projectId,'project',args.query,{path:args.path,mode:args.mode});
          extraReads=[];
          for(const match of result.matches)if(typeof match.text==='string'){
            if(remaining<=0){match.text='';continue;}
            match.text=match.text.slice(0,remaining);remaining-=match.text.length;
            extraReads.push({...match});const previous=reads.get(match.path);reads.set(match.path,{hash:match.hash,excerpts:[...(previous?.hash===match.hash?previous.excerpts:[]),match.text],full:false});
          }
          action.message='Recherche dans le projet · '+result.matches.length+' résultat(s)';
        } else if(name==='inspect_project_file') {
          result=await files.inspect(projectId,'project',args.path);const previous=reads.get(args.path);if(previous?.hash!==result.hash)reads.set(args.path,{hash:result.hash,excerpts:[],full:false});action.message='Version du fichier inspectée';
        } else if(name==='create_project_directory') { result=await files.mkdir(projectId,'project',args.path);action.message='Dossier créé';
        } else if(['copy_project_file','move_project_file','trash_project_file'].includes(name)) {
          const version=reads.get(args.path);if(!version)throw fail(409,'Inspecte ou lis le fichier avant cette opération.');
          if(name!=='trash_project_file'&&typeof args.destination!=='string')throw fail(400,'Destination relative manquante.');
          result=await files.manipulate(projectId,'project',args.path,version.hash,{...(name!=='trash_project_file'?{destination:args.destination}:{}),remove:name!=='copy_project_file'});
          action.hash=result.hash;action.destination=result.moved||result.created?result.path:undefined;action.trashId=result.trashId;action.message=name==='copy_project_file'?'Fichier copié':name==='move_project_file'?'Fichier déplacé':'Fichier mis à la corbeille';
          if(name!=='copy_project_file')reads.delete(args.path);
        } else if (name === 'list_project_files') {
          if (listings.has(args.path)) throw fail(409, 'Ce dossier est déjà listé dans cette demande. Utilise les chemins du résultat précédent, sans relister.');
          const listing = await files.list(projectId, 'project', args.path);
          listings.add(args.path);
          result = { path: listing.path, entries: listing.entries.slice(0, 100).map(entry => ({ path: entry.path, directory: entry.directory })), truncated: listing.entries.length > 100, note: 'Noms uniquement : lis seulement les fichiers nécessaires à la demande actuelle.' };
          action.message = 'Dossier consulté';
        } else if (name === 'read_project_file') {
          if (remaining <= 0 || (!opened.has(args.path) && opened.size >= 6)) throw fail(409, 'Budget de lecture de cette demande atteint. Travaille avec les extraits reçus et explique ce qui reste à consulter, sans ouvrir d’autres fichiers.');
          const file = await files.read(projectId, 'project', args.path);
          if (!file.attachable || file.kind === 'image') throw fail(415, 'Ce fichier ne contient pas de texte lisible par cet outil. Pour une image, demande à l’utilisateur de la joindre au message avec un modèle Vision.');
          let start = args.start ?? 0;
          if (!Number.isSafeInteger(start) || start < 0 || start > file.text.length) throw fail(400, 'Position de lecture invalide.');
          if (args.length !== undefined && (!Number.isSafeInteger(args.length) || args.length < 1 || args.length > 3000)) throw fail(400, 'Longueur de lecture invalide (1 à 3000 caractères).');
          if (args.query !== undefined) {
            if (typeof args.query !== 'string' || !args.query.trim() || args.query.length > 300) throw fail(400, 'Recherche invalide.');
            const index = file.text.toLocaleLowerCase().indexOf(args.query.toLocaleLowerCase(), start);
            if (index < 0) throw fail(404, 'Ce passage n’a pas été trouvé dans ce fichier.');
            start = Math.max(start, index - 250);
          }
          const text = file.text.slice(start, start + Math.min(readLimit, args.length ?? readLimit, remaining)), previous = reads.get(args.path);
          const fragment = JSON.stringify([file.path, file.hash, start, text.length]);
          if (delivered.has(fragment)) throw fail(409, 'Cet extrait est déjà présent dans le contexte de cette demande. Utilise-le sans le relire.');
          delivered.add(fragment); opened.add(args.path); remaining -= text.length;
          const excerpts = previous?.hash === file.hash ? previous.excerpts : [];
          excerpts.push(text);
          reads.set(args.path, { hash: file.hash, excerpts, full: (previous?.hash === file.hash && previous.full) || (start === 0 && text.length === file.text.length && !file.truncated) });
          result = { path: args.path, text, start, next: start + text.length < file.text.length ? start + text.length : null, totalCharacters: file.text.length, remainingReadCharacters: remaining, editable: file.editable };
          // This metadata stays outside the model payload and reuses the exact result bytes.
          read = { path: file.path, hash: file.hash, start, text, totalCharacters: file.text.length, truncated: !!file.truncated };
          action.message = 'Extrait lu · ' + text.length + ' caractères';
        } else if (name === 'replace_project_text' || name === 'write_project_file') {
          let file;
          try { file = await files.read(projectId, 'project', args.path); } catch (e) { if (e.status !== 404 || name !== 'write_project_file') throw e; }
          let text;
          if (!file) {
            text = args.content; validText(args.path, text);
            // Validate editable file type even for creations.
            if (!/\.(?:txt|md|markdown|json|jsonl|csv|tsv|yaml|yml|toml|ini|cfg|conf|log|xml|html|htm|svg|css|scss|js|mjs|cjs|ts|tsx|jsx|py|ps1|psm1|cmd|bat|sh|sql|r|c|h|cpp|hpp|java|rs|go|rb|php|vue|svelte|tex|bib)$/i.test(args.path)) throw fail(415, 'La création par le modèle est réservée aux fichiers texte et de code.');
            check(); result = await files.create(projectId, 'project', args.path, Buffer.from(text, 'utf8'));
            action.message = 'Fichier créé';
          } else {
            let read = reads.get(args.path);
            if (!read && name === 'replace_project_text' && typeof args.old_text === 'string' && args.old_text && userPrompt.includes(args.old_text)) read = { hash: file.hash, excerpts: [args.old_text], full: false };
            if (!read || read.hash !== file.hash) throw fail(409, 'Lis ou relis ce fichier avec read_project_file avant de le modifier : sa version peut avoir changé.');
            if (!file.editable) throw fail(403, 'Ce fichier n’est pas modifiable par cet outil.');
            if (name === 'write_project_file') {
              if (!read.full) throw fail(400, 'Le fichier n’a pas été lu en totalité. Utilise un remplacement exact pour ne pas perdre son contenu.');
              text = args.content;
            } else {
              if (typeof args.old_text !== 'string' || !args.old_text || typeof args.new_text !== 'string' || !read.excerpts.some(excerpt => excerpt.includes(args.old_text))) throw fail(400, 'Le passage à remplacer doit être un texte exact déjà lu.');
              const index = file.text.indexOf(args.old_text);
              if (index < 0 || file.text.indexOf(args.old_text, index + 1) >= 0) throw fail(400, 'Le passage à remplacer est absent ou présent plusieurs fois. Choisis un extrait unique.');
              text = file.text.slice(0, index) + args.new_text + file.text.slice(index + args.old_text.length);
            }
            validText(args.path, text); check();
            result = await files.write(projectId, 'project', args.path, file.hash, text);
            reads.delete(args.path);
            action.message = 'Fichier modifié'; action.backupId = result.backupId;
          }
          action.hash = result.hash;
          result = { saved: true, path: args.path, hash: result.hash, backupSaved: !!action.backupId };
        } else throw fail(400, 'Outil non autorisé.');
        action.ok = true;
        return { action, result, ...(read ? { read } : {}), ...(extraReads ? { reads:extraReads } : {}) };
      } catch (e) {
        action.message = e.status ? e.message : 'L’opération sur ce fichier a échoué. Aucun succès ne peut être confirmé.';
        return { action, result: { error: action.message } };
      }
    }
  };
}

/** Collect indexed, possibly fragmented OpenAI-compatible tool calls. */
export async function consumeModelStream(body, { onContent, metrics, signal }) {
  const decoder = new TextDecoder(), calls = new Map();
  let buffer = '', text = '', done = false, finishReason;
  function packet(line) {
    if (!line.startsWith('data:')) return;
    const value = line.slice(5).trim(); if (!value) return;
    if (value === '[DONE]') { done = true; return; }
    const event = JSON.parse(value); if (event.error) throw fail(502, 'Bionic a interrompu la génération.');
    metrics?.observe(event);
    const choice = event.choices?.[0];
    if (choice?.finish_reason) { done = true; finishReason = choice.finish_reason; }
    const content = choice?.delta?.content;
    if (typeof content === 'string' && content) { text += content; onContent(content); }
    for (const part of choice?.delta?.tool_calls || []) {
      if (!Number.isInteger(part.index) || part.index < 0 || part.index > 15) throw fail(502, 'Appel d’outil invalide reçu du modèle.');
      const call = calls.get(part.index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (part.id) call.id = part.id;
      if (part.function?.name) call.function.name += part.function.name;
      if (part.function?.arguments) call.function.arguments += part.function.arguments;
      if (call.function.arguments.length > 500_000 || call.function.name.length > 100 || call.id.length > 256) throw fail(502, 'Appel d’outil trop volumineux.');
      calls.set(part.index, call);
    }
  }
  for await (const chunk of body) {
    if (signal?.aborted) throw fail(409, 'Demande arrêtée.');
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n'); buffer = lines.pop();
    if (buffer.length > 2_000_000) throw fail(502, 'Réponse du modèle trop volumineuse.');
    for (const line of lines) packet(line);
  }
  if (buffer.trim()) packet(buffer);
  if (!done) throw fail(502, 'Bionic a fermé la réponse avant sa fin. Le texte reçu est conservé.');
  return { text, calls: [...calls.entries()].sort((a,b) => a[0]-b[0]).map(([,call]) => ({ ...call, id: call.id || 'call_' + randomUUID() })), finishReason };
}
