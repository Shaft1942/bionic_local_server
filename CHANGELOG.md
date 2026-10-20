# Journal des versions

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
