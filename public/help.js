'use strict';

// Public, local guide. Opening it never calls a service or changes a setting.
function renderCompanionHelp({ container, node, navigate }) {
  const guide = node('div', 'help-guide');
  const paragraph = text => node('p', '', text);
  function list(parent, items, ordered = false) {
    const result = node(ordered ? 'ol' : 'ul', 'help-list');
    for (const text of items) result.append(node('li', '', text));
    parent.append(result);
  }
  function shortcut(parent, label, page, target) {
    const button = node('button', 'file-action help-settings-link', label);
    button.type = 'button';
    button.dataset.helpPage = page;
    button.dataset.helpTarget = target;
    button.addEventListener('click', () => navigate(page, target));
    parent.append(button);
  }
  function section(id, title, open = false) {
    const details = node('details', 'help-section');
    details.id = id.replace('help-', 'help-topic-');
    details.open = open;
    const summary = node('summary', '', title);
    summary.id = id;
    const body = node('div', 'help-section-body');
    details.append(summary, body);
    guide.append(details);
    return body;
  }

  guide.append(paragraph('Le compagnon relie ton navigateur à Bionic sur le PC. Ouvre une rubrique pour comprendre un usage ou retrouver le réglage correspondant. Les capacités réellement disponibles sont indiquées sous ce guide.'));

  const start = section('help-start', 'Démarrer une conversation', true);
  list(start, [
    'Sur le PC, démarre Bionic, active son API locale et démarre le compagnon. Le téléphone utilise l’adresse du compagnon, pas celle de l’API Bionic.',
    'Choisis un projet, puis un chat ou une nouvelle conversation. « Sans projet » permet de discuter ; choisis un projet pour joindre des fichiers ou utiliser les outils fichiers et scripts.',
    'Choisis le modèle près de la saisie. Vérifie les permissions dans Outils, écris ta demande puis envoie-la. Les actions effectuées apparaissent dans le fil.'
  ], true);
  start.append(paragraph('Le compagnon fournit ses propres outils. Il ne reprend pas les skills, MCP, agents ni les autorisations configurés dans Bionic. Un modèle doit prendre en charge les appels d’outils pour les utiliser.'));
  shortcut(start, 'Vérifier la connexion au PC', 'maintenance', 'diagnostics-open');

  const chat = section('help-chat', 'Conversations, modèles et brouillons');
  chat.append(paragraph('Les historiques natifs Bionic sont consultés sans modification. Leur répondre crée une suite web distincte sur ce PC ; les nouveaux messages ne sont pas synchronisés vers Bionic. Renommer ou retirer un historique dans le compagnon conserve son original Bionic.'));
  chat.append(paragraph('Créer une branche copie les messages jusqu’au point choisi, sans rejouer les outils. Les fils deviennent indépendants, mais leurs fichiers de projet restent partagés. Vérifie les permissions avant de continuer : Internet et les scripts sont désactivés dans une nouvelle branche.'));
  chat.append(paragraph('Le modèle et l’effort concernent le prochain envoi. Le plafond de réponse se règle pour ce chat ou comme défaut du modèle ; il reste limité par le contexte disponible. Une réponse signalée comme coupée peut contenir un document ou un script incomplet.'));
  chat.append(paragraph('La conservation des messages non envoyés concerne le texte sur ce navigateur. Les fichiers joints et le contenu de l’éditeur ne sont pas sauvegardés durablement avec le brouillon. Déconnexion et effacement retirent les copies locales.'));
  shortcut(chat, 'Régler la longueur des réponses', 'models', 'output-mode');
  shortcut(chat, 'Régler la conservation des brouillons', 'reading', 'draft-duration');

  const files = section('help-files', 'Importer, joindre et modifier des fichiers');
  files.append(paragraph('Importer copie un fichier de ton appareil dans « Imports telephone » du projet sur le PC. Joindre ajoute un fichier ou un extrait au prochain message, sans l’envoyer. « Importer puis joindre » combine ces deux étapes. Un message accepte jusqu’à quatre pièces jointes exploitables.'));
  files.append(paragraph('Les textes, PDF, DOCX et XLSX contenant du texte peuvent être joints selon le résultat de leur extraction. Si le document est partiellement extrait, sélectionne un passage dans l’aperçu. Pour analyser une image, choisis un modèle marqué Vision ; joindre une image ne génère pas une nouvelle image ComfyUI.'));
  files.append(paragraph('Dans « Fichiers du projet », tu peux consulter les fichiers, éditer les textes pris en charge et retrouver les livrables et la corbeille. Les PDF, DOCX et XLSX sont présentés sous forme de texte extrait ; les outils directs ne les modifient pas dans leur format d’origine.'));
  files.append(paragraph('Dans Outils, « Aucun », « Lecture » et « Modification » contrôlent les outils directs du modèle. Un nouveau chat ordinaire démarre en Modification : vérifie ce choix avant l’envoi. Dans ce mode, les écritures autorisées sont immédiates, sans validation fichier par fichier. Les actions réussies peuvent proposer une comparaison, une restauration ou la version précédente, sous réserve que le fichier n’ait pas changé. Garde des sauvegardes indépendantes.'));
  shortcut(files, 'Vérifier les autorisations des outils', 'tools', 'settings-edit-tools');

  const tools = section('help-tools', 'Internet et scripts : choisir ce que tu autorises');
  tools.append(paragraph('Les permissions sont indépendantes et figées pour chaque message à son acceptation. Les modifier ensuite concerne les prochains envois. Une réponse du modèle affirmant avoir agi ne remplace pas le résultat d’une action dans le fil.'));
  tools.append(node('h3', '', 'Rechercher et lire Internet'));
  tools.append(paragraph('Le PC envoie les recherches au moteur configuré et lit des pages publiques. Les comptes et cookies de ton navigateur ne sont pas transmis. Les mots recherchés et les URL quittent le PC : évite d’y inclure des secrets. L’option « Valider chaque recherche et URL avant envoi » affiche chaque requête exacte avant son autorisation.'));
  tools.append(node('h3', '', 'Exécuter un script'));
  tools.append(paragraph('L’option Scripts permet au modèle de proposer du code Python, Node.js ou PowerShell. Chaque proposition attend ton accord sur le code exact dans le chat. Lis-le avant de choisir « Exécuter ce script » ou « Refuser ».'));
  tools.append(paragraph('Un script approuvé s’exécute avec les droits du compte du PC : ce n’est pas un bac à sable. Il peut agir hors du projet et utiliser le réseau même si les outils fichiers ou Internet sont désactivés. Un arrêt ou une erreur n’annule pas ses changements.'));
  shortcut(tools, 'Régler les outils du prochain message', 'tools', 'settings-edit-tools');

  const images = section('help-images', 'Configurer et utiliser les images ComfyUI');
  list(images, [
    'Démarre ComfyUI, puis ouvre Images et ComfyUI. « Rechercher le serveur » vérifie les ports 8188 et 8000 du PC du compagnon et l’adresse saisie ; il ne parcourt pas tout le réseau. Pour un autre port ou un autre PC, renseigne l’adresse accessible depuis le PC du compagnon.',
    'Choisis Krea 2 Turbo ou Hassaku XL Illustrious v34, puis teste la connexion et les modèles. Le diagnostic distingue serveur, modèles et nœuds manquants, sans lancer de rendu. Installe les éléments requis dans ComfyUI ; le compagnon ne télécharge pas automatiquement les modèles.',
    'Choisis le nettoyage mémoire, active ComfyUI puis enregistre. Tester utilise tes saisies sans les enregistrer. Dans Outils du message, autorise les images, choisis le profil et demande une création à un modèle compatible avec les appels d’outils.'
  ], true);
  images.append(paragraph('Les workflows fournis sont fixes : le compagnon ne reprend pas le graphe ouvert dans ComfyUI. Deux LoRA facultatifs par profil se règlent dans Images et ComfyUI ; leur présence au catalogue ne garantit pas leur compatibilité. Le profil, les LoRA et le nettoyage sont figés pour le message envoyé.'));
  images.append(node('h3', '', 'À quoi sert le nettoyage mémoire facultatif ?'));
  images.append(paragraph('« Décharger les modèles ComfyUI après chaque rendu » peut rendre de la mémoire à d’autres applications ou aider en cas de ralentissement entre rendus, notamment avec Krea 2. Les poids devront être rechargés au rendu suivant, qui peut être plus lent. Aucun gain de vitesse ni quantité de mémoire libérée n’est garanti.'));
  images.append(paragraph('Laisse cette option désactivée pour utiliser ComfyUI sans le module mémoire. Pour l’activer, télécharge le module fourni depuis les paramètres, copie-le dans le dossier custom_nodes de l’instance ComfyUI utilisée, puis redémarre cette instance après la fin de ses travaux. Le diagnostic vérifie aussi la compatibilité du module avec SaveImage.'));
  images.append(paragraph('Le nettoyage intervient après le workflow, pas systématiquement avant chaque prompt. Il ne décharge pas le modèle de conversation Bionic. Les images arrivent dans le chat via le compagnon ; le téléphone n’a pas besoin d’accéder directement à ComfyUI.'));
  shortcut(images, 'Ouvrir la configuration ComfyUI', 'images', 'comfy-discover');
  shortcut(images, 'Choisir le nettoyage mémoire', 'images', 'comfy-memory-cleanup');

  const connection = section('help-connection', 'Connexion du téléphone et sécurité');
  connection.append(paragraph('Utilise le compagnon sur un réseau local de confiance. En HTTP, le code, les messages et les fichiers ne sont pas chiffrés pendant leur transport. Le parcours Connexion et appareils permet de préparer HTTPS puis un certificat par appareil avec mTLS.'));
  connection.append(node('h3', '', 'Activer HTTPS en trois étapes'));
  list(connection, [
    'Prépare HTTPS pour le nom ou l’IP utilisé sur ton téléphone. Télécharge l’autorité publique bionic-autorite.crt et compare son empreinte SHA-256 complète avec celle affichée sur le PC.',
    'Installe cette autorité comme certificat CA dans le système de ton appareil. Télécharger le fichier seul ne suffit pas. Le navigateur ne peut pas confirmer cet import à ta place.',
    'Ouvre la vérification sécurisée et confirme seulement sans alerte de certificat. Reviens ensuite à l’adresse HTTPS habituelle du compagnon et reconnecte-toi. Ajoute alors l’application à l’écran d’accueil depuis le menu du navigateur si souhaité.'
  ], true);
  connection.append(node('h3', '', 'Où installer l’autorité publique ?'));
  list(connection, [
    'Android : dans les réglages de sécurité, recherche Certificat, puis Installer un certificat → Certificat CA. Choisis le .crt, pas un certificat Wi-Fi. Les libellés varient selon le fabricant.',
    'iPhone/iPad : installe le profil téléchargé dans Réglages, puis active sa confiance totale dans Général → Informations → Réglages des certificats.',
    'Windows : dans certmgr.msc du compte du navigateur, importe le .crt sous Autorités de certification racines de confiance → Certificats.'
  ]);
  connection.append(paragraph('En cas d’alerte, relève l’adresse exacte et le code NET::ERR_CERT_… sans partager les tickets d’une URL de preuve. Vérifie la bonne autorité, le nom/IP couvert et les dates. Après import correct sur Android, fermer puis rouvrir Chrome, puis au besoin redémarrer le téléphone, est une piste de reprise observée ; cela ne garantit pas de corriger toute erreur. Ne contourne pas l’alerte.'));
  connection.append(node('h3', '', 'Le certificat appareil est une étape distincte'));
  connection.append(paragraph('HTTPS seul ne demande pas de .p12. Pour rendre le certificat client obligatoire avec mTLS, crée puis importe une identité .p12 propre à cet appareil avec le mot de passe affiché, avant d’exiger et vérifier mTLS. Cette identité et son mot de passe restent privés : ne les joins jamais à une demande d’aide. La clé privée de l’autorité reste sur le PC.'));
  connection.append(paragraph('Les appareils autorisés partagent le même périmètre : il n’y a pas de comptes ni de rôles séparés. Conserve privés le code d’accès et les données du compagnon. N’expose pas directement son serveur sur Internet.'));
  shortcut(connection, 'Ouvrir Connexion et appareils', 'connection', 'certificate-title');

  const troubleshooting = section('help-troubleshooting', 'Résoudre un problème');
  list(troubleshooting, [
    'Le modèle ne répond pas : vérifie que Bionic et son API locale fonctionnent sur le PC, puis ouvre le diagnostic de connexion. Il ne lance ni message ni modèle. « Reconnexion au PC » relit aussi les projets et conversations.',
    'Un outil ne fonctionne pas : vérifie le projet, la compatibilité du modèle et les permissions du message concerné. Regarde le résultat de l’action dans le fil ; un script ou un envoi web peut attendre ta validation.',
    'ComfyUI est introuvable : vérifie son démarrage, son adresse et son port. Pour un autre PC, vérifie son écoute réseau et le pare-feu du réseau privé. Une recherche sans résultat ne prouve pas que l’option serveur est désactivée.',
    'Une image est « à vérifier » après un délai ou une coupure : regarde l’état de ComfyUI avant de refaire la demande. Le compagnon ne resoumet pas automatiquement une génération incertaine. Arrêter la réponse du chat n’interrompt pas globalement les travaux ComfyUI.',
    'Un fichier joint a changé : retire-le puis joins sa nouvelle version. Après une action ou un script en erreur, vérifie le fichier actuel avant toute restauration.'
  ]);
  shortcut(troubleshooting, 'Ouvrir le diagnostic de connexion', 'maintenance', 'diagnostics-open');
  shortcut(troubleshooting, 'Tester ComfyUI sans rendu', 'images', 'comfy-test');

  const updates = section('help-updates', 'Mettre à jour le compagnon');
  updates.append(paragraph('Dans Maintenance, choisis le canal Stable ou Bêta puis vérifie les mises à jour. Bêta inclut les versions en cours d’essai. L’installation demande toujours ton accord et redémarre le serveur du compagnon ; attends la fin des travaux et enregistre tes modifications de fichiers.'));
  updates.append(paragraph('Revenir au canal Stable ne réinstalle pas une ancienne version : le compagnon attend une stable plus récente. Si l’installation automatique est indisponible, le panneau indique la raison. « Plus tard » et « Ignorer cette version » n’installent rien.'));
  shortcut(updates, 'Ouvrir les mises à jour', 'maintenance', 'updates-title');

  container.replaceChildren(guide);
}
