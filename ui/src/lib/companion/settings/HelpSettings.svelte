<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr, preferences } from '../preferences.svelte';
  import { parseCompanionCapabilities, type CompanionCapabilities, type Capability } from '../client/capabilities-contract';
  import type { Request } from './types';
  import frSource from '../../../../../public/locales/fr/components.js?raw';
  import enSource from '../../../../../public/locales/en/components.js?raw';

  type Destination = 'conversation' | 'servers' | 'appearance' | 'security' | 'maintenance';
  let { request, active = true, navigate }: { request: Request; active?: boolean; navigate: (page: Destination, section?: 'inference' | 'images') => void } = $props();
  // Reuse the public guide catalogues as data; never execute legacy globals.
  function catalogue(source: string): Record<string, string> {
    return Object.assign({}, ...Array.from(source.matchAll(/BionicI18n\.register\("(?:fr|en)",\s*(\{[\s\S]*?\})\);/g), match => JSON.parse(match[1])));
  }
  const dictionaries = { fr: catalogue(frSource), en: catalogue(enSource) };
  const t = (key: string) => dictionaries[preferences.language]['components.' + key] || dictionaries.fr['components.' + key] || key;
  let data = $state<CompanionCapabilities | null>(null), busy = $state(false), failure = $state<'auth' | 'read' | ''>('');
  let mounted = false, controller: AbortController | undefined;
  async function load() {
    if (busy) return;
    busy = true; failure = ''; data = null;
    controller = new AbortController();
    try {
      const value = parseCompanionCapabilities(await request('/api/companion-capabilities', { method: 'GET', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }));
      if (mounted) data = value;
    } catch (error) {
      if (mounted) failure = (error as { status?: number })?.status === 401 || (error as { status?: number })?.status === 403 ? 'auth' : 'read';
    } finally { if (mounted) busy = false; }
  }
  onMount(() => { mounted = true; void load(); return () => { mounted = false; controller?.abort(); }; });
  function stateLabel(item: Capability) {
    switch (item.state) {
      case 'supported': return tr('Pris en charge', 'Supported');
      case 'unsupported': return tr('Non pris en charge', 'Unsupported');
      case 'observed': return tr('Catalogue lu', 'Catalogue read');
      case 'blocked': return tr('Indisponible', 'Unavailable');
      case 'request-scoped': return tr('À autoriser pour chaque message', 'Permission selected for each message');
      default: return tr('Inconnu', 'Unknown');
    }
  }
  function reason(item: Capability) {
    switch (item.reasonCode) {
      case null: return '';
      case 'not-probed': return tr('Connexion et exécution non testées.', 'Connection and execution have not been tested.');
      case 'image-disabled': return tr('Images désactivées dans les paramètres.', 'Images are disabled in settings.');
      case 'image-settings-unknown': return tr('Activation des images non confirmée.', 'Image activation is unconfirmed.');
      case 'parameter-not-forwarded': return tr('Ce paramètre n’est pas transmis au moteur.', 'This parameter is not forwarded to the engine.');
      case 'not-supported': return tr('Non pris en charge par ce moteur ou ce modèle.', 'Unsupported by this engine or model.');
      case 'file-profile-required': return tr('Le profil fichiers du message détermine les droits.', 'The message file profile determines access.');
      case 'web-access-required': return tr('L’accès web doit être sélectionné pour le message.', 'Web access must be selected for the message.');
      case 'image-access-required': return tr('L’accès aux images doit être sélectionné pour le message.', 'Image access must be selected for the message.');
      case 'exact-code-approval-required': return tr('Chaque script demande un accord sur son code exact.', 'Every script requires approval of its exact code.');
      case 'catalogue-unavailable': return tr('Catalogue indisponible. Relis les capacités pour réessayer.', 'Catalogue unavailable. Reload capabilities to retry.');
      case 'inference-changed': return tr('Le moteur a changé pendant la lecture. Relis les capacités.', 'The engine changed during the read. Reload capabilities.');
      case 'catalogue-invalid': return tr('Catalogue non confirmé.', 'Catalogue unconfirmed.');
      case 'provider-unknown': return tr('Moteur non reconnu.', 'Unrecognized engine.');
      case 'model-capability-unknown': return tr('Le modèle ne confirme pas cette capacité.', 'The model does not confirm this capability.');
      case 'image-capability-unknown': return tr('Le fournisseur ne confirme pas cette capacité.', 'The provider does not confirm this capability.');
      default: return tr('Information non reconnue ; aucune disponibilité confirmée.', 'Unrecognized information; availability is unconfirmed.');
    }
  }
  const imageLabels = { singleImage: ['Une image', 'Single image'], batch: ['Lot d’images', 'Image batch'], series: ['Série de prompts', 'Prompt series'], history: ['Historique des images', 'Image history'], retry: ['Relancer une image', 'Retry an image'], cancelQueued: ['Annuler une image en attente', 'Cancel a queued image'] };
  const modelLabels = { tools: ['Appels d’outils', 'Tool calls'], vision: ['Vision', 'Vision'], reasoningEffort: ['Effort de raisonnement', 'Reasoning effort'] };
  const parameterLabels = { maxOutputTokens: ['Plafond de réponse', 'Response limit'], reasoningEffort: ['Effort de raisonnement', 'Reasoning effort'], temperature: ['Température', 'Temperature'], topP: ['Top P', 'Top P'], topK: ['Top K', 'Top K'], seed: ['Graine', 'Seed'], repeatPenalty: ['Pénalité de répétition', 'Repeat penalty'] };
  const permissionLabels = { fileAccess: ['Fichiers', 'Files'], webAccess: ['Internet', 'Internet'], scriptAccess: ['Scripts', 'Scripts'], imageAccess: ['Images', 'Images'] };
  async function jump(event: MouseEvent, id: string) {
    event.preventDefault();
    const target = document.getElementById(id) as HTMLDetailsElement | null;
    if (!target) return;
    if (target.tagName === 'DETAILS') target.open = true;
    await tick(); (target.querySelector('summary') || target).focus(); target.scrollIntoView({ block: 'start' });
  }
</script>

<section class="help-guide" aria-label={tr('Aide et capacités', 'Help and capabilities')}>
  <h2 id="companion-help-title" tabindex="-1">{tr('Aide et capacités', 'Help and capabilities')}</h2>
  <p class="settings-description">{tr('Retrouve un usage, son réglage et les capacités annoncées par le serveur. Ouvrir cette aide ne lance aucune génération et ne modifie aucun réglage.', 'Find guidance, its settings and capabilities reported by the server. Opening help starts no generation and changes no settings.')}</p>
  <nav class="help-index" aria-label={tr('Rubriques d’aide', 'Help topics')}>
    {#each ['start','chat','files','tools','images','connection','troubleshooting','updates'] as topic}<a href={'#help-' + topic} onclick={event => jump(event, 'help-' + topic)}>{t('help.' + (topic === 'start' ? 'startTitle' : topic === 'connection' ? 'connectionTitle' : topic + 'Title'))}</a>{/each}
    <a href="#help-capabilities" onclick={event => jump(event, 'help-capabilities')}>{tr('Capacités annoncées', 'Reported capabilities')}</a>
  </nav>

  <details id="help-start" open><summary>{t('help.startTitle')}</summary><div class="help-body">
    <ol><li>{tr('Sur le PC, démarre le moteur choisi (Bionic ou llama-server) et le compagnon. Sur le téléphone, ouvre l’adresse du compagnon.', 'On the PC, start the selected engine (Bionic or llama-server) and the companion. On the phone, open the companion address.')}</li><li>{t('help.startProject')}</li><li>{tr('Choisis le modèle près de la saisie. Vérifie Droits sur les fichiers et Outils et images avant d’envoyer ta demande.', 'Choose the model beside the composer. Check File permissions and Tools and images before sending your request.')}</li></ol>
    <p>{t('help.ownTools')}</p><p>{tr('Bionic et llama.cpp servent les réponses. Le compagnon garde ses propres projets, fichiers, permissions et outils. Le support des outils dépend aussi du modèle ; Vision et l’effort de raisonnement ne sont pas identiques entre moteurs.', 'Bionic and llama.cpp serve responses. The companion keeps its own projects, files, permissions and tools. Tool support also depends on the model; vision and reasoning effort differ between engines.')}</p>
    <button class="inline-link" onclick={() => navigate('servers', 'inference')}>{tr('Configurer le moteur de conversation', 'Configure the conversation engine')}</button>
    <p>{tr('Les commandes de profils locaux sont distinctes de la gestion via l’API du moteur. Pour llama-server, la rubrique Bibliothèque et lancement de llama-server permet de préparer un profil GGUF et de démarrer explicitement un processus possédé par Canaé.', 'Local profile commands are separate from management through the engine API. For llama-server, the llama-server library and startup section lets you prepare a GGUF profile and explicitly start a process owned by Canaé.')}</p>
  </div></details>
  <details id="help-chat"><summary>{t('help.chatTitle')}</summary><div class="help-body"><p>{t('help.nativeHistory')}</p><p>{tr('Le modèle choisi concerne le prochain envoi. Le plafond de réponse se règle pour ce chat ou comme défaut du modèle ; il reste limité par le contexte disponible. Une réponse coupée peut contenir un document ou un script incomplet.', 'The selected model applies to the next message. Set the response limit for this chat or as the model default; available context still bounds it. A truncated response may contain an incomplete document or script.')}</p><p>{t('help.drafts')}</p><div class="help-links"><button class="inline-link" onclick={() => navigate('conversation')}>{t('help.responseLength')}</button><button class="inline-link" onclick={() => navigate('appearance')}>{t('help.draftRetention')}</button></div></div></details>
  <details id="help-files"><summary>{t('help.filesTitle')}</summary><div class="help-body"><p>{t('help.importAttach')}</p><p>{t('help.supportedFiles')}</p><p>{t('help.projectFiles')}</p><p>{tr('Dans la saisie, Droits sur les fichiers choisit aucun accès, lecture, ou lecture et écriture pour le prochain message. Les écritures autorisées sont immédiates. Vérifie le résultat dans le fil et conserve tes sauvegardes.', 'In the composer, File permissions selects no access, read, or read and write for the next message. Authorized writes are immediate. Check results in the conversation and keep backups.')}</p></div></details>
  <details id="help-tools"><summary>{t('help.toolsTitle')}</summary><div class="help-body"><p>{t('help.fixedPermissions')}</p><h3>{t('help.webTitle')}</h3><p>{t('help.webHelp')}</p><h3>{t('help.scriptTitle')}</h3><p>{t('help.scriptApproval')}</p><p>{t('help.scriptPermissions')}</p><p>{tr('Ces choix se trouvent dans Outils et images, sous la saisie du chat.', 'Find these choices in Tools and images below the chat composer.')}</p></div></details>
  <details id="help-images"><summary>{t('help.imagesTitle')}</summary><div class="help-body"><p>{tr('Démarre ComfyUI sur le PC, puis configure l’adresse, le profil et les LoRA dans Serveurs du PC → Génération d’images. Le test du profil ne lance pas de rendu. Active et enregistre les réglages avant de demander une image.', 'Start ComfyUI on the PC, then configure its address, profile and LoRAs under PC servers → Image generation. Testing a profile starts no render. Enable and save settings before requesting an image.')}</p><p>{t('help.comfyWorkflows')}</p><p>{t('beta25.help.series')}</p><p>{t('beta25.help.policy')}</p><p>{tr('Dans Images, tu peux aussi générer directement une description sans modèle texte, suivre chaque image, annuler son attente locale et relancer un travail terminé avec la même graine ou une nouvelle. La galerie du projet propose les images et un ZIP de vingt images au maximum. Vérifie une soumission incertaine avant de reprendre la file.', 'In Images, you can also generate a description directly without a text model, track each image, cancel local waiting and retry a finished job with the same or a new seed. The project gallery offers images and a ZIP of up to twenty images. Check an uncertain submission before resuming the queue.')}</p><h3>{t('help.memoryTitle')}</h3><p>{t('help.memoryBenefit')}</p><p>{t('help.memoryInstall')}</p><p>{t('help.memoryTiming')}</p><button class="inline-link" onclick={() => navigate('servers', 'images')}>{t('help.comfySettings')}</button></div></details>
  <details id="help-connection"><summary>{t('help.connectionTitle')}</summary><div class="help-body"><p>{t('help.connectionHelp')}</p><ol>{#each ['httpsPrepare','httpsInstallAuthority','httpsVerify'] as key}<li>{t('beta24.help.' + key)}</li>{/each}</ol><h3>{t('beta24.help.authorityInstallTitle')}</h3><ul>{#each ['authorityAndroid','authorityIos','authorityWindows'] as key}<li>{t('beta24.help.' + key)}</li>{/each}</ul><p>{t('beta24.help.certificateWarning')}</p><p>{t('beta24.help.deviceCertificate')}</p><p>{t('help.sharedAccess')}</p><button class="inline-link" onclick={() => navigate('security')}>{tr('Ouvrir Connexion sécurisée', 'Open Secure connection')}</button></div></details>
  <details id="help-troubleshooting"><summary>{t('help.troubleshootingTitle')}</summary><div class="help-body"><ul>{#each ['modelProblem','toolProblem','serverProblem','imageProblem','fileProblem'] as key}<li>{t('help.' + key)}</li>{/each}</ul><div class="help-links"><button class="inline-link" onclick={() => navigate('maintenance')}>{t('help.connectionDiagnostics')}</button><button class="inline-link" onclick={() => navigate('servers', 'images')}>{tr('Vérifier les réglages images', 'Check image settings')}</button></div></div></details>
  <details id="help-updates"><summary>{t('help.updatesTitle')}</summary><div class="help-body"><p>{tr('Dans Mises à jour et diagnostic, choisis Stable ou Bêta puis vérifie les mises à jour. L’installation demande un accord et redémarre le compagnon : attends la fin des travaux et enregistre les fichiers avant de confirmer.', 'Under Updates and diagnostics, choose Stable or Beta, then check for updates. Installation requires approval and restarts the companion: wait for jobs to finish and save files before confirming.')}</p><p>{tr('Revenir à Stable ne réinstalle pas une ancienne version : le compagnon attend une stable plus récente. Si l’installation automatique est indisponible, le panneau indique la raison. Ignorer une version ne l’installe pas.', 'Returning to Stable does not reinstall an older version: the companion waits for a newer stable release. If automatic installation is unavailable, the panel explains why. Ignoring a version does not install it.')}</p><button class="inline-link" onclick={() => navigate('maintenance')}>{t('help.updatesSettings')}</button></div></details>

  <section id="help-capabilities" tabindex="-1" aria-labelledby="help-capabilities-title" aria-busy={busy}>
    <h3 id="help-capabilities-title">{tr('Capacités annoncées', 'Reported capabilities')}</h3>
    <p class="settings-description">{tr('Le support d’une fonction, son autorisation et sa disponibilité sont distincts. Cette lecture ne teste ni génération, ni GPU, ni connexion ComfyUI. Les droits restent vérifiés au moment de chaque action.', 'Function support, permission and availability are separate. This read tests no generation, GPU or ComfyUI connection. Permissions are still checked for each action.')}</p>
    <Button variant="outline" onclick={load} disabled={busy || !active}>{tr('Relire les capacités', 'Reload capabilities')}</Button>
    {#if busy}<p role="status">{tr('Lecture des capacités…', 'Reading capabilities…')}</p>{/if}
    {#if failure}<p role="alert" class="settings-error">{failure === 'auth' ? tr('Session non autorisée. Reconnecte-toi au compagnon, puis relis les capacités.', 'Session unauthorized. Sign in to the companion, then reload capabilities.') : tr('Capacités indisponibles ou réponse non reconnue. Vérifie la connexion au compagnon, puis relis les capacités.', 'Capabilities unavailable or response unrecognized. Check the companion connection, then reload capabilities.')}</p>{/if}
    {#if data}
      <h4>{tr('Moteur de conversation', 'Conversation engine')}</h4>
      <p>{data.inference.provider === 'bionic' ? 'Bionic' : data.inference.provider === 'llamacpp' ? 'llama.cpp' : tr('Moteur inconnu', 'Unknown engine')}</p>
      <dl class="capability-list"><dt>{tr('Conversation', 'Chat')}</dt><dd>{stateLabel(data.inference.support.chat)} <span>{reason(data.inference.support.chat)}</span></dd><dt>{tr('Gestion via l’API du moteur', 'Management through the engine API')}</dt><dd>{stateLabel(data.inference.support.modelManagement)} <span>{reason(data.inference.support.modelManagement)}</span></dd><dt>{tr('Catalogue', 'Catalogue')}</dt><dd>{stateLabel(data.inference.catalogue)} <span>{reason(data.inference.catalogue)}</span></dd></dl>
      {#each data.inference.models as model (model.id)}<details class="model-capabilities"><summary>{model.id}</summary><div class="help-body"><p>{model.loaded === null ? tr('Chargement inconnu', 'Load state unknown') : model.loaded ? tr('Modèle chargé', 'Model loaded') : tr('Modèle non chargé', 'Model not loaded')} · {tr('Contexte', 'Context')} : {model.contextLength ?? tr('inconnu', 'unknown')}</p><dl class="capability-list">{#each Object.entries(modelLabels) as [key, label]}{@const item = model.support[key as keyof typeof model.support]}<dt>{tr(label[0], label[1])}</dt><dd>{stateLabel(item)} <span>{reason(item)}</span></dd>{/each}</dl><h4>{tr('Paramètres transmis', 'Forwarded parameters')}</h4><dl class="capability-list">{#each Object.entries(parameterLabels) as [key, label]}{@const item = model.parameters[key as keyof typeof model.parameters]}<dt>{tr(label[0], label[1])}</dt><dd>{stateLabel(item)} <span>{reason(item)}</span></dd>{/each}</dl></div></details>{/each}
      {#if !data.inference.models.length}<p>{tr('Aucun modèle confirmé dans ce catalogue.', 'No model confirmed in this catalogue.')}</p>{/if}
      <h4>{tr('Images', 'Images')} · {data.images.providerId === 'comfyui' ? 'ComfyUI' : tr('fournisseur inconnu', 'unknown provider')}</h4>
      <dl class="capability-list"><dt>{tr('Activation', 'Activation')}</dt><dd>{data.images.enabled === null ? tr('Inconnue', 'Unknown') : data.images.enabled ? tr('Activée', 'Enabled') : tr('Désactivée', 'Disabled')}</dd><dt>{tr('Connexion', 'Connection')}</dt><dd>{stateLabel(data.images.reachability)} <span>{reason(data.images.reachability)}</span></dd><dt>{tr('Disponibilité', 'Availability')}</dt><dd>{stateLabel(data.images.availability)} <span>{reason(data.images.availability)}</span></dd>{#each Object.entries(imageLabels) as [key, label]}{@const item = data.images.support[key as keyof typeof data.images.support]}<dt>{tr(label[0], label[1])}</dt><dd>{stateLabel(item)} <span>{reason(item)}</span></dd>{/each}</dl>
      <h4>{tr('Permissions des messages', 'Message permissions')}</h4><dl class="capability-list">{#each Object.entries(permissionLabels) as [key, label]}{@const item = data.permissions[key as keyof typeof data.permissions]}<dt>{tr(label[0], label[1])}</dt><dd>{stateLabel(item)} <span>{reason(item)}</span></dd>{/each}</dl>
    {/if}
  </section>
</section>

<style>
  .help-guide { max-width:74ch; font-size:13px; line-height:1.7; overflow-wrap:anywhere; }
  .help-index { display:flex; flex-wrap:wrap; gap:6px 18px; margin:20px 0 28px; }
  .help-index a { display:flex; align-items:center; min-height:44px; color:var(--foreground); text-decoration:underline; text-underline-offset:3px; }
  .help-guide details { border-top:1px solid var(--border); margin:0; }
  .help-guide summary { color:var(--foreground); padding:14px 0; min-height:48px; font-weight:500; }
  .help-body { padding:0 0 20px; }
  .help-body p { margin:10px 0 16px; }
  .help-body ul,.help-body ol { padding-left:22px; list-style:revert; }
  .help-body li { margin:9px 0; }
  .help-links { display:flex; gap:5px 20px; flex-wrap:wrap; }
  .help-guide .inline-link { min-height:44px; text-align:left; }
  .help-guide :is(button,a,summary):focus-visible { outline:2px solid var(--ring); outline-offset:3px; border-radius:4px; }
  #help-capabilities { border-top:1px solid var(--border); padding-top:8px; margin-top:20px; scroll-margin-top:20px; }
  .capability-list { display:grid; grid-template-columns:minmax(100px,1fr) minmax(0,2fr); gap:12px 20px; margin:15px 0 24px; }
  .capability-list dt { color:var(--muted-foreground); }
  .capability-list dd { margin:0; }
  .capability-list dd span { display:block; color:var(--muted-foreground); }
  @media(max-width:450px) { .capability-list { grid-template-columns:minmax(0,1fr); gap:3px; }.capability-list dd { margin-bottom:13px; } }
</style>
