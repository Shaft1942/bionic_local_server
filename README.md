# Bionic Mobile — compagnon local

Utilisez les modèles de votre PC, consultez vos projets Bionic et continuez une conversation depuis le navigateur de votre téléphone, sur votre réseau local.

Ce projet communautaire est indépendant de Bionic. Bionic et ses modèles ne sont pas inclus. Le compagnon utilise l’API locale de Bionic et un adaptateur de lecture de ses fichiers internes.

## Ce que vous pouvez faire

- Retrouver les projets et les conversations existants, puis démarrer une **suite web distincte**.
- Classer les conversations dans un autre projet ou **Sans projet**, sans déplacer leurs fichiers ni modifier les historiques natifs Bionic.
- Renommer ou supprimer un chat depuis ses options. Pour un historique natif, le nom et le masquage restent propres au compagnon ; l’original Bionic est préservé.
- Choisir un modèle, régler l’effort lorsqu’il le prend en charge et consulter les mesures de génération disponibles.
- Voir les instances chargées et les décharger pour libérer la mémoire du PC.
- Lire, télécharger et modifier les fichiers texte du projet depuis le téléphone.
- Autoriser le modèle à lire des extraits pertinents, créer et modifier des textes, avec journal des actions et sauvegardes.
- Importer des fichiers du téléphone dans le projet et joindre des textes, des documents ou des images compatibles au chat.
- Quitter le navigateur pendant une réponse et retrouver la génération en cours à la réouverture, tant que le PC et les serveurs restent actifs.
- Rédiger le message suivant, l’ajouter à la file de la conversation et ouvrir un autre chat pendant les réponses en cours.
- Retrouver les réponses terminées depuis une absence, conserver des livrables et consulter le contexte réellement utilisé pour une nouvelle réponse.

**Les messages écrits ici ne sont pas ajoutés aux conversations natives de Bionic.** Les outils d’agent, MCP et compétences de Bionic ne sont pas hérités. Le compagnon possède ses propres outils limités aux fichiers du projet.

## Démarrer

1. Installez **Node.js 24 ou une version ultérieure** depuis [nodejs.org](https://nodejs.org/en/download). Bionic doit déjà fonctionner sur ce PC.
2. Téléchargez une [version publiée](https://github.com/Shaft1942/bionic_local_server/releases), ou utilisez **Code → Download ZIP** sur [le dépôt](https://github.com/Shaft1942/bionic_local_server). Extrayez entièrement l’archive dans un dossier à vous.
3. Dans Bionic, activez le serveur **API des modèles locaux** et notez son adresse. Copiez `config.example.json` en `config.local.json`, puis ajustez `apiUrl` si nécessaire. Le port d’exemple `1235` n’est pas forcément celui de votre installation.
4. Sous Windows, double-cliquez sur **Demarrer.cmd**. Sur le PC, ouvrez [http://127.0.0.1:8769](http://127.0.0.1:8769) si vous avez conservé le port proposé.
5. Ouvrez **ACCES-PRIVE.txt**, créé au premier démarrage, pour trouver votre code personnel et l’adresse à ouvrir sur le téléphone.
6. Connectez le téléphone au même Wi-Fi. Si le pare-feu bloque l’accès, lancez **Autoriser-reseau.cmd** sur un réseau Windows privé, puis réessayez.

Aucune installation de dépendances npm n’est nécessaire pour exécuter le serveur. **Python est facultatif** : il sert seulement à extraire le texte des documents PDF, DOCX et XLSX. Le téléchargement des fichiers reste possible sans Python.

Le guide [Installation](docs/installation.md) détaille ces étapes et les options Python.

## À savoir avant d’utiliser les fichiers

L’option **« Le modèle peut modifier les textes du projet »** autorise des enregistrements immédiats sur le PC. Elle est cochée par défaut dans une nouvelle conversation. Décochez-la pour discuter sans les outils de fichiers. Les remplacements conservent une copie précédente ; une sauvegarde indépendante de vos projets reste utile.

L’application n’envoie pas automatiquement toute votre bibliothèque au modèle. Les lectures par outil sont limitées à des extraits et à un budget par demande. Les fichiers que vous joignez explicitement font partie du contexte envoyé.

Ce serveur utilise **HTTP** et un code d’accès pour un **réseau local de confiance**. Il ne doit pas être exposé directement sur Internet. N’ouvrez pas de redirection de port sur votre routeur. Lisez [Sécurité](SECURITY.md) avant de partager un accès.

## Documentation

| Besoin | Guide |
| --- | --- |
| Installer et accéder depuis le téléphone | [Installation](docs/installation.md) |
| Conversations, fichiers, modèles et reprise | [Utilisation](docs/utilisation.md) |
| Ports, dossiers et variables d’environnement | [Configuration](docs/configuration.md) |
| Page inaccessible, API ou documents indisponibles | [Dépannage](docs/depannage.md) |
| Préserver ses données pendant une mise à jour | [Sauvegarde et mise à jour](docs/sauvegarde-mise-a-jour.md) |
| Comprendre le code et lancer les vérifications | [Développement](docs/developpement.md) et [Contribution](CONTRIBUTING.md) |
| Préparer un dépôt et une archive sans données privées | [Publication](docs/publication.md) |
| Évolution du projet | [Journal des versions](CHANGELOG.md) |
| Idées d’évolution et bonnes pratiques des interfaces d’IA | [20 pistes UX](docs/PISTES-UX.md) et [méta-prompts d’exploration](docs/metaprompts-exploration.md) |
| Agents utilisés et portée des contrôles | [Méta prompts](docs/metaprompts.md) et [Vérification](docs/verification.md) |

## Compatibilité

La base de validation est **Windows, Node.js 24+ et Bionic 1.1.8+10**. La lecture des projets dépend d’une structure interne Bionic, notamment SQLite ; elle peut nécessiter une adaptation après une mise à jour de Bionic. Le lancement par `npm start` est prévu sur les autres systèmes, mais leur fonctionnement complet n’est pas validé.

L’analyse d’images nécessite un modèle marqué **Vision**. L’effort, les appels d’outils et les statistiques dépendent du modèle et des réponses de l’API. Tous les modèles ne sont pas fiables pour modifier des fichiers.

## Licence

Le code du compagnon est fourni sous [licence MIT](LICENSE). Cette licence ne couvre ni Bionic, ni les modèles, ni les fichiers de vos projets.
