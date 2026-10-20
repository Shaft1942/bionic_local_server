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
