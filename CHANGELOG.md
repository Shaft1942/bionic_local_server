# Journal des versions

## 2.1.3 — 22 octobre 2026

- Force maximale des deux LoRA portée à 20 dans les sliders et la validation serveur.

## 2.1.2 — 22 octobre 2026

- Réglage des deux forces LoRA par sliders de −2 à 2, au pas de 0,05, avec valeur affichée en direct et utilisation au clavier.

## 2.1.1 — 22 octobre 2026

- Le sélecteur d’image suit aussi le changement de conversation et la reprise de son brouillon ; il est bloqué pendant les opérations qui verrouillent le formulaire.
- Les consignes d’outil demandent une description en anglais, adaptée aux modèles locaux, en conservant les textes à afficher et les prompts exacts explicitement fournis.

## 2.1.0 — 22 octobre 2026

- Choix de Krea2 Turbo ou HassakuXL dans les outils du message, conservé avec le brouillon et la conversation.
- Deux LoRA facultatifs par modèle, avec forces indépendantes et catalogue fourni par les loaders ComfyUI : dossiers ajoutés et fichiers téléchargés reconnus par l’instance.
- La demande conserve le modèle et les LoRA choisis lors de son envoi ; contrôle des noms avant soumission. La présence dans le catalogue ne garantit pas la compatibilité du LoRA avec le modèle.
- `FreeMemoryAfterWorkflow` relié après `SaveImage` dans les deux workflows : déchargement des modèles et libération mémoire en fin d’exécution, selon le mécanisme de `/free`.

## 2.0.0 — 22 octobre 2026

- Paramètres accessibles depuis la barre latérale et les options de conversation, avec fermeture directe et Échap.
- Réponses : plafond automatique de 8 192 tokens, ajusté au contexte estimé à chaque appel, y compris outils et résultats. Choix par modèle ou conversation ; les valeurs souhaitées restent conservées. Signalement des réponses coupées.
- ComfyUI facultatif, réglable dans l’UI : URL locale/LAN, test sans rendu, Krea2 Turbo ou HassakuXL Illustrious v34. Suivi persistant lié à l’adresse et au workflow d’origine ; images consultables après désactivation.
- Projets et conversations regroupés dans un arbre repliable, listes chargées à l’ouverture et affichage progressif.
- Mémoire courte des reçus d’outils déjà transmis, bornée et dépourvue d’autorisations ; vue des capacités et limites réellement fournies par le compagnon.
- Métaprompts exécutés, plan de projet, décisions d’audit, exports de workflows et preuves de validation conservés dans la documentation. Sources 1.11.0 locales réunies avec l’historique Git 1.10.0.

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
