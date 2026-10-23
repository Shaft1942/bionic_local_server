# Journal des versions

## 2.4.1-beta.1 — version de travail, non publiée

- Images par demande : curseur accessible de 1 à 5, séries de longueur exacte, cartes i/N et validation complète avant admission.
- Outils : choix rapide Conserver, Décharger ou Répondre entre les images, propre à la demande et au brouillon ; retour explicite aux paramètres globaux sans modifier les lots déjà acceptés.

- Nouvelle option « Répondre entre les images » : Qwen reste chargé et les réponses texte attendues passent entre deux rendus, sans chevauchement de calcul ni interruption du sampler. Les choix simultané et déchargement restent disponibles.
- Mesures de réponse : durée depuis l’envoi, attente avant admission et durée ComfyUI distincte sur chaque carte. Accusé immédiat et Stop disponibles pendant l’attente du GPU.
- Génération en série : préparation des prompts en un appel, cartes séparées et file FIFO commune aux conversations (douze images maximum), sans calculs image simultanés. Le nettoyage ComfyUI facultatif reste appliqué après chaque image.
- Choix mémoire : conserver les modèles texte pour continuer à discuter, ou les décharger avant le lot et différer les nouvelles inférences jusqu'à sa fin. Reprise explicite après une soumission incertaine, sans rejeu automatique ; suivi des jobs distants et protection GPU rétablis après redémarrage.
- Images ComfyUI : confirmation de lancement produite par le compagnon sans seconde inférence de conclusion. Les lots mêlant image et autres outils attendent la fin du rendu avant leur synthèse texte ; les soumissions incertaines ne sont pas relancées.

## 2.3.0 — 2026-10-23

- Publication stable du contenu validé de 2.2.1-beta.4, sans changement fonctionnel supplémentaire. Les préversions restent disponibles dans l’historique GitHub.
- Paramètres organisés par usage, avec Maintenance et Aide séparées, guide audité en huit thèmes et onze raccourcis préservant les saisies et le focus.
- Configuration ComfyUI guidée : recherche du serveur, diagnostic des modèles et nœuds, nettoyage mémoire facultatif et module fourni avec installation expliquée.
- Améliorations de lecture des conversations et barre système dans la colonne des projets ; canaux de mise à jour Stable/Bêta avec préférences conservées.
- Le manifeste de mise à jour déclare le canal stable. La 2.3.0 est proposée aux installations compatibles des canaux Stable et Bêta ; aucun passage par une préversion n’est requis.
- Validation de la beta.4 : 610 tests, parcours navigateur synthétiques à 320/390/1280 px et revue indépendante. Aucun nouveau rendu, modèle, GPU ou téléphone physique qualifié par la promotion stable.


## 2.2.1-beta.4 — 2026-10-23

- Paramètres : Maintenance et Aide sont deux rubriques distinctes. Maintenance conserve mises à jour, diagnostic et configuration PC ; Aide regroupe le guide et les capacités.
- Guide intégré audité contre le code puis corrigé : conversations, fichiers et pièces jointes, permissions web/scripts, ComfyUI et mémoire facultative, connexion, dépannage et mises à jour.
- Les anciens accès d’aide ouvrent la même page. Les raccourcis du guide conservent les saisies et ciblent les bons réglages, avec recherche et navigation clavier.
- Conservation des ajouts de la beta.3 ; les métaprompts et rapports d’audit des agents restent dans le socle de développement.


## 2.2.1-beta.3 — 2026-10-23

- Paramètres → Images : configuration guidée en trois étapes, recherche des serveurs locaux (ports 8188/8000 et adresse saisie), diagnostic séparé du serveur, des fichiers de modèles et des nœuds, avec instructions et dossiers attendus.
- Nettoyage mémoire facultatif, désactivé sur installation neuve ; choix existant conservé et figé avec chaque demande. Sans nettoyage, aucun module custom ni sortie IMAGE de SaveImage n'est requis.
- Module mémoire téléchargeable depuis les paramètres authentifiés, installation manuelle expliquée ; effets après rendu, coût du rechargement et absence de garantie de gain explicités.
- Conservation des parcours de paramètres, lecture et canaux de mise à jour de la beta.2.


## 2.2.1-beta.2 — 23 octobre 2026

- Barre de statut, modèles chargés et paramètres limitée à la colonne des projets et conversations ; la conversation retrouve toute sa hauteur.
- Informations et indications de mise à jour exclusivement dans les paramètres.
- Déconnexion déplacée dans Connexion et appareils, avec protection des saisies de paramètres non enregistrées.

## 2.2.1-beta.1 — 23 octobre 2026

- Mises à jour intégrées aux paramètres, dans Maintenance et aide, avec canal Stable ou Bêta, version et état de vérification.
- Paramètres et Modèles chargés réunis dans la barre du bas avec Reconnexion au PC et Déconnecter ; accès par icônes nommées, sans doublons dans l'en-tête.
- Reprise des optimisations CI : contrôles Windows/Linux sur les PR et main, lancement manuel pour les branches de travail, annulation des contrôles obsolètes et délai maximal de 15 minutes. Le workflow de publication conserve ses règles.

## 2.2.0-beta.1 — 23 octobre 2026

- Deux canaux dans Paramètres → Maintenance et aide → Mises à jour : stable par défaut et bêta sur choix explicite, partagé par l'installation PC. La vérification automatique reste indépendante du canal.
- Le canal stable exclut les préversions ; le canal bêta reçoit les bêtas et les stables compatibles plus récentes. Un retour au canal stable attend une stable supérieure à la bêta installée, sans retour automatique à une ancienne version.
- Publication bêta distincte sur GitHub, avec archive, empreinte et manifeste contrôlés. La stable 2.1.0 déjà publiée reste la référence stable ; le premier passage depuis cette version exige une installation manuelle de la bêta, car son vérificateur ignore les préversions.

- Les icônes de copie et de création de branche sont regroupées à droite de chaque message. La création de branche est directement accessible.

- Durée, tokens générés et débit visibles à droite de « Détails du tour » replié. Copie des prompts, réponses et blocs de code par icône accessible, avec texte source exact et repli manuel.
- Paramètres regroupés par tâche, avec recherche locale des réglages et indications de portée. Brouillons, diagnostic, certificats, modèles et mises à jour restent accessibles depuis leurs destinations et raccourcis.
- Les formulaires de plafond et de ComfyUI proposent une annulation et signalent les saisies non enregistrées. La fermeture permet de poursuivre, d'abandonner ou de conserver ces saisies dans l'onglet, sans conserver les secrets de certificat.
- Lecture des réponses : titres, listes ordonnées et imbriquées, citations et tableaux Markdown ; blocs de code avec langage, copie exacte et sélection manuelle si le presse-papiers est indisponible. Le code affiché reste passif.
- Les informations secondaires sont regroupées dans « Détails du tour ». Le plafond ordinaire y est replié ; les réductions, réponses coupées, erreurs et validations restent visibles. « Régler le plafond » ouvre la cible connue du tour, ou demande de choisir le modèle si sa provenance n'a pas été relevée.
- La lecture conserve la sélection, le focus et les volets pendant les mises à jour. Remonter dans le fil suspend le suivi automatique ; « Revenir à la réponse » permet de retrouver la suite.

## 2.1.0 — 23 octobre 2026

- Paramètres → Sécurité des connexions : préparer HTTPS, télécharger l’autorité publique, créer et télécharger un certificat client chiffré depuis le navigateur, renouveler et révoquer un appareil. L’activation exige une connexion de preuve ; la récupération après perte de tous les accès reste locale au PC.
- L’assistant Windows configure une fois l’accès au compagnon et un port fixe de vérification HTTPS, sur le réseau privé choisi. Après cette préparation, la gestion des certificats est disponible depuis le téléphone. L’installation d’un certificat et sa confiance restent confirmées dans Android/iOS.
- Le curseur et la saisie du plafond de réponse restent synchronisés dans Paramètres, de 1 à 5 000 000 tokens ; les préférences par modèle/conversation sont conservées.
- Après déchargement ou changement de modèle, le budget utilise le contexte effectivement chargé par Bionic. Suppression de la limite artificielle de 4 096 tokens pour un modèle froid ; une capacité inconnue est distinguée d’un contexte réellement plein.
- Module ComfyUI `FreeMemoryAfterWorkflow` inclus avec ses instructions. Les workflows conservent leur nettoyage final ; après une interruption ou erreur avant ce nœud, une récupération limitée aux nouveaux jobs du compagnon est demandée seulement si la file observée est vide. Aucun gain de vitesse n’est déduit de ces contrôles.
- Mises à jour : conservation de la PKI et du niveau HTTPS/mTLS, contrôle par un canal de maintenance local séparé, refus d’un retour en HTTP et récupération des sources précédentes en cas d’échec. Les reprises bornées des verrous Windows de la 2.0 sont conservées.

Portée des essais et limites : [validation 2.1](docs/v2.1-validation.md).

## 2.0.0 — 22 octobre 2026

- Paramètres accessibles depuis la barre latérale et les options de conversation, avec fermeture directe et Échap.
- Réponses : plafond automatique de 8 192 tokens ajusté au contexte estimé à chaque appel, outils et résultats compris. Saisie précise et slider synchronisés de 1 à 5 000 000 tokens, par modèle ou conversation. La préférence reste conservée et le budget effectif respecte le contexte disponible. Signalement des réponses coupées.
- ComfyUI facultatif et configurable dans l’interface : URL locale/LAN, test sans rendu, choix Krea2 Turbo ou HassakuXL Illustrious v34 dans les outils du message, conservé avec le brouillon et la conversation.
- Deux LoRA facultatifs par modèle, sélectionnés dans le catalogue de l’instance ComfyUI (dossiers supplémentaires et téléchargements reconnus compris). Sliders de force de −2 à 20 par pas de 0,05, valeur affichée en direct ; 0 désactive l’emplacement. La présence dans le catalogue ne garantit pas la compatibilité avec le modèle.
- Le modèle et les LoRA sont figés à l’envoi. Suivi persistant lié à l’adresse et au workflow d’origine ; images accessibles après désactivation. Le sélecteur suit la conversation et son brouillon. Les consignes d’outil demandent une description en anglais tout en conservant les textes à afficher et les prompts exacts explicitement fournis.
- `FreeMemoryAfterWorkflow` relié après `SaveImage` dans les deux workflows : déchargement des modèles et libération mémoire en fin d’exécution selon le mécanisme de `/free`. Le nœud doit être installé sur l’instance ComfyUI.
- Projets et conversations dans un arbre repliable, avec chargement à l’ouverture et affichage progressif.
- Mémoire courte des reçus d’outils déjà transmis, bornée et dépourvue d’autorisations ; vue des capacités et limites du compagnon.
- Mise à jour Windows : reprise bornée des renommages temporairement bloqués et retour arrière confirmé par empreintes, avec redémarrage de l’ancienne version lorsque les sources sont restaurées.
- Assistant Windows conservé ; correction du nom du script d’autorisation du pare-feu facultatif. La mise à jour attend aussi la fin des générations d’images avant tout redémarrage.
- Métaprompts, décisions, workflows et preuves conservés dans les guides V2. Les itérations locales 2.1.0 à 2.1.3 sont réunies dans cette première release publique 2.0.0 ; la protection contre les retours de version reste active.

## 1.11.0 — 22 octobre 2026

- Génération Krea2 Turbo locale depuis les conversations, avec permission Images indépendante, paramètres bornés, suivi persistant et affichage/téléchargement de l’image. Aucune resoumission automatique après un envoi incertain ; reprise du suivi après redémarrage. Le compagnon sert les images authentifiées au réseau local.

## 1.10.0 — 22 octobre 2026

- Assistant Windows `Installer.cmd` : choix du dossier, configuration guidée de l’API Bionic et du port, détection de Node.js et téléchargement portable officiel facultatif avec contrôle SHA-256 et signature Windows. Raccourci et démarrage proposés ; accès au téléphone facultatif avec accord Windows pour le pare-feu privé. Préservation des données et sauvegarde des réglages pour une reconfiguration sur place ; aucune migration automatique entre installations.

- Recherche sans clé via l’interface officielle DuckDuckGo Lite ; URL envoyée identique à celle présentée à la validation. Les blocages HTTP 202/403/429 sont explicites et empêchent les tentatives répétées dans le même tour, sans empêcher une lecture d’URL directe.
- Secours Brave facultatif avec `BIONIC_SEARCH_FALLBACK=brave` et une clé privée côté serveur. Accord distinct avant l’envoi à Brave si la validation web est activée ; aucune bascule après annulation ou refus de sécurité. Brave reste le moteur principal si seule sa clé est configurée.
- Instructions web plus précises : consulter les sources et annoncer un échec au lieu de présenter des connaissances générales comme une recherche effectuée. Le respect de ces instructions dépend toujours du modèle utilisé.

## 1.9.0 — 21 octobre 2026

- Vérification centrale des Releases publiques à chaque démarrage du serveur puis toutes les 24 heures de fonctionnement, avec vérification manuelle et désactivation facultative.
- Proposition discrète de la seule version stable la plus récente compatible avec l'installation, Windows et Node.js, même en sautant plusieurs versions. Métadonnées de compatibilité jointes aux futures Releases ; les anciennes Releases sans ce contrat ne sont pas proposées automatiquement.
- Choix distincts : installer et redémarrer après confirmation, reporter dans cet onglet, ou ignorer durablement cette version. Le refus d'une version ne masque pas une suivante.
- Installation réservée aux dossiers extraits d'une archive, quand aucun travail n'est en cours. Vérification des empreintes et de l'inventaire, sauvegarde des sources remplacées, protection des données privées et redémarrage avec contrôle de l'identité et de la version. Retour aux sources précédentes si l'application de la mise à jour ou son contrôle de démarrage échoue.
- Préservation temporaire des brouillons de l'onglet pendant le redémarrage. Les fichiers ouverts non enregistrés empêchent l'installation ; le même code permet de se reconnecter.

La première installation de 1.9.0 reste manuelle : 1.8.0 n'inclut pas de vérificateur. Les limites de compatibilité et de récupération sont décrites dans [Mises à jour](docs/mises-a-jour.md).

## 1.8.0 — 21 octobre 2026

Cette version réunit les conversations parallèles, les livrables, les outils et branches de conversations, le lot d’audit et les ajustements de présentation après essai. Les historiques natifs Bionic restent en lecture seule ; les données privées et les fichiers des projets ne font pas partie de l’archive.

- Ajustement après essai : outils et permissions repliés sur ordinateur comme sur téléphone ; modèle, effort et résumé des droits restent visibles. Les commandes secondaires des réponses sont regroupées dans **Détails et actions**, celles de vos messages dans les trois points de la bulle. Les demandes d’accord, interruptions, opérations incertaines et indicateurs d’erreur restent dans le fil.

- Chats web JSON ou schéma illisibles isolés dans les listes et l’activité, avertissement d’inventaire partiel, source préservée et récupération manuelle.
- Profils de fichiers Aucun/Lecture/Modification, compatibilité des anciens booléens et permissions figées par message. Accord volontaire pour chaque recherche et URL exacte des outils web ; redirections refusées en mode renforcé. Les scripts approuvés gardent leurs droits propres.
- Corbeille accessible par projet sans dépendre du chat supprimé, contrôle des copies et restauration sans écrasement ni purge. Intentions avant mutations directes, résultat incertain après interruption et copies à examiner sans rejeu automatique ni promesse de transaction.
- Révocation globale des sessions avec `Deconnecter-appareils.cmd`, sans arrêt des travaux ; le code partagé permet toujours de se reconnecter. Réception HTTP bornée à 180 000 ms par défaut, distincte de la génération.
- Liste des conversations moins souvent reconstruite et focus préservé ; textes des droits précisés, badge « À valider », accès à la source d’une branche et rappel des fichiers partagés. Brouillons de messages conservés durablement seulement sur choix de l’utilisateur, avec durée et effacement à la déconnexion ; l’éditeur de fichiers reste hors périmètre.
- Comparaison passive des textes jusqu’à 200 Ko par version, seulement si le fichier actuel porte encore l’empreinte de l’action ; aucun rapprochement ou enregistrement automatique. Deux commandes d’import distinguent conserver dans le projet et joindre au prochain message. Annonces de recherche et d’événements dédupliquées.
- Parcours de chats partagés pendant un cycle et benchmark synthétique froid/chaud 10/100/1 000 chats ; aucun index persistant, cache LRU ou pagination. Les images historiques sont résolues après sélection, avec estimation de contexte toujours approximative.
- Plafond d’inférences optionnel, désactivé par défaut (`maxConcurrentInferences: 0`), FIFO par appel modèle et créneau libéré pendant les accords humains. Le délai global existant de trente minutes inclut admission et attente d’accord.
- Diagnostic à cinq contrôles avec export par liste blanche, sans prompt ni lancement de modèle. Fabrique importable `createCompanion`, fixtures de chemins canoniques/POSIX corrigées et deux parcours navigateur de développement versionnés ; Playwright reste une dépendance de développement.

La portée des vérifications et les essais non réalisés sont dans [Vérification](docs/verification.md). Le résultat de la CI est à vérifier sur le commit du tag. Les critères et retours arrière sont dans [Choix d’audit](docs/choix-audit.md).

### Outils et branches de conversations inclus dans 1.8.0

- Outils du compagnon activables séparément pour les fichiers, le web public et les scripts ; autorisations figées dans chaque message envoyé, y compris en file d’attente.
- Recherche ciblée de noms ou de passages, inspection, création de dossiers, copie et déplacement sans écrasement, corbeille privée et restauration depuis l’action d’origine.
- Recherche web DuckDuckGo sans clé, SearXNG explicitement configuré ou Brave facultatif ; lecture passive de pages publiques avec protections DNS, redirections et budgets. Un blocage du moteur reste une erreur explicite.
- Scripts Python, Node.js et PowerShell : validation du code exact à chaque proposition, refus et expiration sans exécution, sorties et durée bornées. Les scripts validés ont les droits du compte du PC et ne sont pas isolés dans un bac à sable.
- Branches indépendantes depuis une conversation ou un message inclus, sans rejouer les actions ni copier leurs droits de restauration ou d’exécution. Web et scripts désactivés dans la nouvelle branche.
- Approbations retrouvées après fermeture du navigateur ; un redémarrage du serveur expire les attentes et n’exécute pas les propositions abandonnées.
- Reçus de contexte enrichis des résultats web et des sorties de scripts, en distinguant réception par le compagnon et transmission confirmée au modèle.
- Guide des outils, configuration des moteurs et méta-prompts exécutés. La portée des essais reste détaillée dans le bilan de vérification ; la disponibilité d’un site public ou d’un modèle réel n’est pas déduite de tests simulés.
- Compatibilité avec le classement, le renommage, la suppression et Sans projet : droits de fichiers et scripts désactivés après déplacement, restauration de corbeille sérialisée avec les changements du chat, noms de branches limités à 120 caractères et projets d’origine conservés.

### Livrables et contexte inclus dans 1.8.0

- Fermeture directe de l’aide « Comment fonctionne ce compagnon ? », avec un bouton toujours visible pendant le défilement et le raccourci Échap.
- Déplacement des conversations entre projets ou vers **Sans projet**, depuis les options du chat. Le classement des historiques natifs reste propre au compagnon ; leurs originaux Bionic restent intacts.
- Renommage et suppression dans le même menu, avec confirmation avant suppression. Un historique natif reçoit un nom local ou est masqué dans le compagnon ; les fichiers du projet et les copies de livrables restent conservés.
- **Depuis votre départ** : retrouvez les nouvelles réponses terminées ou interrompues du compagnon et consultez leur message d’origine. Le suivi des éléments consultés est propre à chaque appareil.
- **Livrables** : conservez volontairement une réponse ou un fichier produit, sous forme de copie figée, avec titre, origine et téléchargement.
- **Contexte utilisé** : consultez pour chaque nouvelle réponse les messages sélectionnés, les pièces jointes transmises et les extraits effectivement lus par les outils.
- Saisie sur téléphone plus compacte : modèle et effort côte à côte, envoi et arrêt à droite du texte, aide de l’effort affichée pendant son réglage.
- Menu **Fichiers** sur téléphone pour les pièces jointes, les imports et l’autorisation de modification, dont l’état reste visible quand le menu est fermé.
- Documentation des méta-prompts exécutés et vérifications sur des données synthétiques.

### Conversations parallèles incluses dans 1.8.0

- Rédaction du message suivant pendant la réponse du modèle, avec mise en attente dans la même conversation.
- Navigation et nouveaux chats pendant les générations, avec suivi distinct des réponses.
- Brouillons et pièces jointes séparés par conversation ; les réglages sont figés pour chaque message envoyé.
- File d’attente conservée sur le PC et annulation ciblée. Un redémarrage du serveur ne rejoue pas automatiquement les demandes interrompues.
- Pistes d’évolution de l’interface documentées à partir de sources publiques, distinctes des fonctions implémentées.

## 1.5.0 — 2026-10-20

Préparation de la première distribution publique du compagnon local.

- Configuration locale séparée des sources, avec exemple partageable et dossiers supplémentaires explicitement opt-in.
- Installation indépendante du poste de développement : Node.js 24+, Python facultatif pour l’extraction de documents, lanceurs Windows.
- Documentation d’installation, d’usage, de dépannage, de sauvegarde, de contribution et de publication.
- Licence MIT et consignes pour exclure les codes, historiques, chemins et données privées des archives.
- Sources et tests préparés pour une distribution sans données d’exécution personnelles.

Cette distribution reprend les fonctions du prototype : projets et historiques Bionic en lecture seule, suites web, choix du modèle et de l’effort, mesures disponibles, déchargement d’instances, fichiers de projet, import depuis le téléphone, outils de modification de textes, reprise après fermeture du navigateur et lectures ciblées.

La compatibilité de référence est Windows avec Node.js 24+ et Bionic 1.1.8+10. Les réponses web restent dans le compagnon ; les outils natifs Bionic ne sont pas hérités. L’accès HTTP est destiné au réseau local de confiance.

Les numéros antérieurs correspondent à des itérations locales du prototype, sans promesse d’archives publiques ni de support rétroactif.
