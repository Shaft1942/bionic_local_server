# Journal des versions

## Lot d’audit — changements locaux non publiés, 21 octobre 2026

La branche `feat/choix-audit-bionic` part du commit `5e92da3` de `main` et conserve `package.json` en **1.8.0**. La dernière Release GitHub vérifiée le 21 octobre reste **v1.5.0**. Ce lot n’ajoute ni tag ni publication ; les sections ci-dessous décrivent des étapes historiques de préparation.

- Chats web JSON ou schéma illisibles isolés dans les listes et l’activité, avertissement d’inventaire partiel, source préservée et récupération manuelle.
- Profils de fichiers Aucun/Lecture/Modification, compatibilité des anciens booléens et permissions figées par message. Accord volontaire pour chaque recherche et URL exacte des outils web ; redirections refusées en mode renforcé. Les scripts approuvés gardent leurs droits propres.
- Corbeille accessible par projet sans dépendre du chat supprimé, contrôle des copies et restauration sans écrasement ni purge. Intentions avant mutations directes, résultat incertain après interruption et copies à examiner sans rejeu automatique ni promesse de transaction.
- Révocation globale des sessions avec `Deconnecter-appareils.cmd`, sans arrêt des travaux ; le code partagé permet toujours de se reconnecter. Réception HTTP bornée à 180 000 ms par défaut, distincte de la génération.
- Liste des conversations moins souvent reconstruite et focus préservé ; textes des droits précisés, badge « À valider », accès à la source d’une branche et rappel des fichiers partagés. Brouillons de messages conservés durablement seulement sur choix de l’utilisateur, avec durée et effacement à la déconnexion ; l’éditeur de fichiers reste hors périmètre.
- Comparaison passive des textes jusqu’à 200 Ko par version, seulement si le fichier actuel porte encore l’empreinte de l’action ; aucun rapprochement ou enregistrement automatique. Deux commandes d’import distinguent conserver dans le projet et joindre au prochain message. Annonces de recherche et d’événements dédupliquées.
- Parcours de chats partagés pendant un cycle et benchmark synthétique froid/chaud 10/100/1 000 chats ; aucun index persistant, cache LRU ou pagination. Les images historiques sont résolues après sélection, avec estimation de contexte toujours approximative.
- Plafond d’inférences optionnel, désactivé par défaut (`maxConcurrentInferences: 0`), FIFO par appel modèle et créneau libéré pendant les accords humains. Le délai global existant de trente minutes inclut admission et attente d’accord.
- Diagnostic à cinq contrôles avec export par liste blanche, sans prompt ni lancement de modèle. Fabrique importable `createCompanion`, fixtures de chemins canoniques/POSIX corrigées et deux parcours navigateur de développement versionnés ; Playwright reste une dépendance de développement.

La portée des vérifications, la CI publique encore en échec et les essais non réalisés sont dans [Vérification](docs/verification.md). Les critères et retours arrière sont dans [Choix d’audit](docs/choix-audit.md).

## 1.8.0 — en préparation

- Outils du compagnon activables séparément pour les fichiers, le web public et les scripts ; autorisations figées dans chaque message envoyé, y compris en file d’attente.
- Recherche ciblée de noms ou de passages, inspection, création de dossiers, copie et déplacement sans écrasement, corbeille privée et restauration depuis l’action d’origine.
- Recherche web DuckDuckGo sans clé, SearXNG explicitement configuré ou Brave facultatif ; lecture passive de pages publiques avec protections DNS, redirections et budgets. Un blocage du moteur reste une erreur explicite.
- Scripts Python, Node.js et PowerShell : validation du code exact à chaque proposition, refus et expiration sans exécution, sorties et durée bornées. Les scripts validés ont les droits du compte du PC et ne sont pas isolés dans un bac à sable.
- Branches indépendantes depuis une conversation ou un message inclus, sans rejouer les actions ni copier leurs droits de restauration ou d’exécution. Web et scripts désactivés dans la nouvelle branche.
- Approbations retrouvées après fermeture du navigateur ; un redémarrage du serveur expire les attentes et n’exécute pas les propositions abandonnées.
- Reçus de contexte enrichis des résultats web et des sorties de scripts, en distinguant réception par le compagnon et transmission confirmée au modèle.
- Guide des outils, configuration des moteurs et méta-prompts exécutés. La portée des essais reste détaillée dans le bilan de vérification ; la disponibilité d’un site public ou d’un modèle réel n’est pas déduite de tests simulés.
- Compatibilité avec le classement, le renommage, la suppression et Sans projet : droits de fichiers et scripts désactivés après déplacement, restauration de corbeille sérialisée avec les changements du chat, noms de branches limités à 120 caractères et projets d’origine conservés.

## 1.7.0 — en préparation

- Fermeture directe de l’aide « Comment fonctionne ce compagnon ? », avec un bouton toujours visible pendant le défilement et le raccourci Échap.
- Déplacement des conversations entre projets ou vers **Sans projet**, depuis les options du chat. Le classement des historiques natifs reste propre au compagnon ; leurs originaux Bionic restent intacts.
- Renommage et suppression dans le même menu, avec confirmation avant suppression. Un historique natif reçoit un nom local ou est masqué dans le compagnon ; les fichiers du projet et les copies de livrables restent conservés.
- **Depuis votre départ** : retrouvez les nouvelles réponses terminées ou interrompues du compagnon et consultez leur message d’origine. Le suivi des éléments consultés est propre à chaque appareil.
- **Livrables** : conservez volontairement une réponse ou un fichier produit, sous forme de copie figée, avec titre, origine et téléchargement.
- **Contexte utilisé** : consultez pour chaque nouvelle réponse les messages sélectionnés, les pièces jointes transmises et les extraits effectivement lus par les outils.
- Saisie sur téléphone plus compacte : modèle et effort côte à côte, envoi et arrêt à droite du texte, aide de l’effort affichée pendant son réglage.
- Menu **Fichiers** sur téléphone pour les pièces jointes, les imports et l’autorisation de modification, dont l’état reste visible quand le menu est fermé.
- Documentation des méta-prompts exécutés et vérifications sur des données synthétiques.

## 1.6.0 — en préparation

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
