# Méta prompts utilisés pour préparer la distribution

Ces prompts ont été exécutés par des agents spécialisés pour préparer la version 1.5.0. Ils sont fournis sous une forme réutilisable, sans chemins locaux ni données de l’installation d’origine.

## Agent de revue sécurité et confidentialité

> Agis comme auditeur indépendant d’une application destinée à un dépôt public. Lis les sources sans consulter les conversations, codes d’accès ni fichiers de configuration privés. Cherche les chemins propres à une machine, les dépendances implicites à un environnement de développement, les risques de fuite dans les archives et les défauts liés à l’accès réseau et aux écritures de fichiers. Propose des corrections concrètes et classées par priorité. Ne publie rien et ne modifie aucune donnée utilisateur. Une fois les correctifs intégrés, examine la liste exacte des fichiers distribués et signale les risques résiduels sans promettre un audit exhaustif.

Résultat : retrait des chemins personnels et du runtime implicite, absence de dossier supplémentaire ouvert par défaut, règle réseau limitée au profil privé, refus des noms de périphériques Windows et distribution fondée sur une liste fermée. Les secrets et les données d’installation sont générés localement et exclus des exports.

## Agent de portabilité Windows

> Rends les lanceurs utilisables sur un autre PC avec Node.js installé normalement. Supprime tout chemin utilisateur codé en dur. Lis le port dans la configuration courante. Avant de réutiliser ou arrêter un serveur, vérifie qu’il appartient au dossier et à l’installation attendus. Limite toute autorisation réseau à une action volontaire, au réseau privé et au sous-réseau local. Prévois une action de retrait. Vérifie la syntaxe PowerShell et les fonctions sans démarrer la production ni modifier réellement le pare-feu.

Résultat : recherche de Node.js dans le PATH ou par réglage explicite, identifiant d’installation, détection des conflits de ports, règle distincte par dossier, commandes de démarrage, arrêt, relance et retrait de l’autorisation. Six tests Windows couvrent ces fonctions.

## Agent de documentation

> Rédige une documentation française pour une personne qui télécharge l’application pour la première fois, puis pour un contributeur. Explique les prérequis, le démarrage sur Windows, les réglages, le téléphone sur le Wi-Fi, les fichiers du projet, les sauvegardes et les mises à jour. Distingue les conversations natives en lecture seule et leurs suites web. Documente les limites du réseau HTTP local et des outils. Ajoute la licence MIT confirmée, les consignes de contribution, le signalement de problèmes et la procédure de publication d’une archive propre. Vérifie les liens et la concordance avec le code. Ne reprends aucune donnée personnelle et ne publie rien.

Résultat : README, licence, guides d’installation, utilisation, configuration, dépannage, sauvegarde et mise à jour, développement et publication, politique de sécurité et modèles d’issues.

## Agent coordinateur et intégration

> Assemble uniquement les sources autorisées dans une copie propre. Sépare configuration publique d’exemple et état privé généré à l’exécution. Ajoute des tests synthétiques, un contrôle des fichiers suivis par Git, un détecteur de motifs sensibles et un générateur de ZIP utilisant la même liste fermée. Vérifie la création d’une installation neuve, l’archive extraite, la documentation et les corrections remontées par les autres agents. Préserve l’installation utilisée par le propriétaire et ses données. La publication utilise exclusivement le contenu contrôlé de la distribution.

Les résultats vérifiés et leurs limites sont décrits dans [Vérification](verification.md). Ces prompts ne remplacent pas une revue humaine des changements futurs ni des fichiers ajoutés au manifeste.

## Agents utilisés pour les conversations parallèles (1.6.0 en préparation)

> Agent interface : remplace le verrou global de rédaction par un suivi propre à chaque conversation. Préserve les brouillons, les réglages et les pièces jointes lors de la navigation ; une réponse reçue pour un autre fil ne doit jamais remplacer le chat affiché. Permets la mise en attente et la récupération de plusieurs demandes sans duplication.

> Agent serveur : accepte les messages dans une file FIFO par conversation, conserve les options et les pièces jointes au moment de leur acceptation, et laisse les autres conversations progresser indépendamment. Sérialise les sauvegardes et vérifie l’annulation ciblée, les doublons, les conflits et le redémarrage sans répétition des outils. Utilise uniquement des données et modèles synthétiques dans les tests.

> Agent recherche et revue : cherche sur Internet des recommandations primaires concernant les interfaces d’IA ; distingue les comportements documentés des propositions créatives pour ce compagnon. Priorise les usages et les critères de validation. Relis ensuite les changements de concurrence pour identifier les pertes de messages ou de données.

Le coordinateur vérifie l’intégration dans un navigateur avec une API simulée, relit les limites et contrôle la distribution. Les pistes non livrées sont séparées dans [Pistes UX](PISTES-UX.md).

## Exploration créative des fonctionnalités

Une nouvelle exploration du 20 octobre 2026 utilise trois angles indépendants : usage mobile, travail sur les fichiers et modèles locaux. Les [méta-prompts réutilisables et le bilan d’exécution](metaprompts-exploration.md) décrivent les consignes du coordinateur et des trois agents. Les propositions recoupées et leurs sources figurent dans [Pistes UX](PISTES-UX.md).

## Implémentation du premier lot — version 1.7.0

Trois agents ont implémenté le reçu de contexte et son intégration serveur, le module d’activité et de livrables, puis leur interface mobile et bureau. Leurs [méta-prompts exécutés](metaprompts-implementation-1.7.md) précisent les contrats, les tests et la revue croisée. Les résultats effectivement contrôlés figurent dans [Vérification](verification.md).
