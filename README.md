# Bionic Mobile — compagnon local

Utilisez les modèles de votre PC, consultez vos projets Bionic et continuez une conversation depuis le navigateur de votre téléphone, sur votre réseau local.

Ce projet communautaire est indépendant de Bionic. Bionic et ses modèles ne sont pas inclus. Le compagnon utilise l’API locale de Bionic et un adaptateur de lecture de ses fichiers internes.

## Ce que vous pouvez faire

- Retrouver les projets et les conversations existants, puis démarrer une **suite web distincte**.
- Choisir un modèle, régler l’effort lorsqu’il le prend en charge et consulter les mesures de génération disponibles.
- Voir les instances chargées et les décharger pour libérer la mémoire du PC.
- Lire, télécharger et modifier les fichiers texte du projet depuis le téléphone.
- Autoriser le modèle à rechercher dans le projet, créer et modifier des textes, copier, déplacer et retirer des fichiers vers une corbeille récupérable.
- Activer la recherche et la lecture de pages Internet publiques pour une demande.
- Faire proposer un script Python, Node.js ou PowerShell et **valider son code exact avant chaque exécution** sur le PC.
- Créer une branche indépendante d’une conversation entière ou jusqu’à un message inclus, sans rejouer ses outils.
- Importer des fichiers du téléphone dans le projet et joindre des textes, des documents ou des images compatibles au chat.
- Quitter le navigateur pendant une réponse et retrouver la génération en cours à la réouverture, tant que le PC et les serveurs restent actifs.
- Rédiger le message suivant, l’ajouter à la file de la conversation et ouvrir un autre chat pendant les réponses en cours.
- Retrouver les réponses terminées depuis une absence, conserver des livrables et consulter le contexte réellement utilisé pour une nouvelle réponse.

**Les messages écrits ici ne sont pas ajoutés aux conversations natives de Bionic.** Les outils d’agent, MCP et compétences de Bionic ne sont pas hérités. Le compagnon fournit ses propres outils de fichiers, de web et de scripts, avec des autorisations distinctes.

## Démarrer

1. Installez **Node.js 24 ou une version ultérieure** depuis [nodejs.org](https://nodejs.org/en/download). Bionic doit déjà fonctionner sur ce PC.
2. Téléchargez une [version publiée](https://github.com/Shaft1942/bionic_local_server/releases), ou utilisez **Code → Download ZIP** sur [le dépôt](https://github.com/Shaft1942/bionic_local_server). Extrayez entièrement l’archive dans un dossier à vous.
3. Dans Bionic, activez le serveur **API des modèles locaux** et notez son adresse. Copiez `config.example.json` en `config.local.json`, puis ajustez `apiUrl` si nécessaire. Le port d’exemple `1235` n’est pas forcément celui de votre installation.
4. Sous Windows, double-cliquez sur **Demarrer.cmd**. Sur le PC, ouvrez [http://127.0.0.1:8769](http://127.0.0.1:8769) si vous avez conservé le port proposé.
5. Ouvrez **ACCES-PRIVE.txt**, créé au premier démarrage, pour trouver votre code personnel et l’adresse à ouvrir sur le téléphone.
6. Connectez le téléphone au même Wi-Fi. Si le pare-feu bloque l’accès, lancez **Autoriser-reseau.cmd** sur un réseau Windows privé, puis réessayez.

Aucune installation de dépendances npm n’est nécessaire pour exécuter le serveur. **Python est facultatif** : il sert à extraire le texte des documents PDF, DOCX et XLSX et à exécuter les scripts Python que vous validez. Le téléchargement des fichiers et les autres fonctions restent disponibles sans Python.

Le guide [Installation](docs/installation.md) détaille ces étapes et les options Python.

## À savoir avant d’utiliser les fichiers

L’option **« Gérer et modifier les fichiers du projet »** autorise des opérations immédiates sur le PC. Elle est cochée par défaut dans une nouvelle conversation ordinaire. Décochez-la pour discuter sans les outils directs de fichiers. Les remplacements conservent une copie précédente et les retraits passent par une corbeille récupérable ; une sauvegarde indépendante de vos projets reste utile.

L’application n’envoie pas automatiquement toute votre bibliothèque au modèle. Les lectures par outil sont limitées à des extraits et à un budget par demande. Les fichiers que vous joignez explicitement font partie du contexte envoyé.

**Internet et les scripts sont désactivés par défaut.** Le menu **Outils** permet de les activer pour les messages suivants. Les scripts approuvés s’exécutent avec les droits de votre compte, au-delà du seul dossier du projet : **ce n’est pas un bac à sable**. Une modification par script n’a pas de sauvegarde automatique garantie. Consultez le [guide des outils](docs/outils-agents.md) avant d’autoriser une proposition.

Ce serveur utilise **HTTP** et un code d’accès pour un **réseau local de confiance**. Il ne doit pas être exposé directement sur Internet. N’ouvrez pas de redirection de port sur votre routeur. Lisez [Sécurité](SECURITY.md) avant de partager un accès.

## Documentation

| Besoin | Guide |
| --- | --- |
| Installer et accéder depuis le téléphone | [Installation](docs/installation.md) |
| Conversations, fichiers, modèles et reprise | [Utilisation](docs/utilisation.md) |
| Recherche web, corbeille, validation des scripts et branches de conversations | [Outils des agents](docs/outils-agents.md) |
| Ports, dossiers et variables d’environnement | [Configuration](docs/configuration.md) |
| Page inaccessible, API ou documents indisponibles | [Dépannage](docs/depannage.md) |
| Préserver ses données pendant une mise à jour | [Sauvegarde et mise à jour](docs/sauvegarde-mise-a-jour.md) |
| Comprendre le code et lancer les vérifications | [Développement](docs/developpement.md) et [Contribution](CONTRIBUTING.md) |
| Préparer un dépôt et une archive sans données privées | [Publication](docs/publication.md) |
| Évolution du projet | [Journal des versions](CHANGELOG.md) |
| Idées d’évolution et bonnes pratiques des interfaces d’IA | [20 pistes UX](docs/PISTES-UX.md) et [méta-prompts d’exploration](docs/metaprompts-exploration.md) |
| Agents utilisés et portée des contrôles | [Méta prompts](docs/metaprompts.md) et [Vérification](docs/verification.md) |
| Consignes exécutées pour les outils et les branches 1.8 | [Méta-prompts d’implémentation 1.8](docs/metaprompts-implementation-1.8.md) |

## Compatibilité

La base de validation est **Windows, Node.js 24+ et Bionic 1.1.8+10**. La lecture des projets dépend d’une structure interne Bionic, notamment SQLite ; elle peut nécessiter une adaptation après une mise à jour de Bionic. Le lancement par `npm start` est prévu sur les autres systèmes, mais leur fonctionnement complet n’est pas validé.

L’analyse d’images nécessite un modèle marqué **Vision**. L’effort, les appels d’outils et les statistiques dépendent du modèle et des réponses de l’API. Tous les modèles ne sont pas fiables pour modifier des fichiers.

## Licence

Le code du compagnon est fourni sous [licence MIT](LICENSE). Cette licence ne couvre ni Bionic, ni les modèles, ni les fichiers de vos projets.
