# Bionic Mobile — compagnon local

Utilisez les modèles de votre PC, consultez vos projets Bionic et continuez une conversation depuis le navigateur de votre téléphone, sur votre réseau local.

Ce projet communautaire est indépendant de Bionic. Bionic et ses modèles ne sont pas inclus. Le compagnon utilise l’API locale de Bionic et un adaptateur de lecture de ses fichiers internes.

La **stable 2.1.0** publiée apporte : certificats gérés depuis le navigateur du téléphone, contexte actualisé lors du changement de modèle et module de nettoyage ComfyUI distribué. Le curseur de tokens reste dans les paramètres, jusqu’à 5 millions. Voir la [validation 2.1](docs/v2.1-validation.md) et le [parcours certificats](docs/certificats-utilisation.md).

La **2.0.0** ajoute les plafonds de réponses par modèle/conversation, avec saisie et slider jusqu’à 5 000 000 tokens, ComfyUI optionnel avec HassakuXL/Krea2 et deux LoRA par modèle, ainsi que les projets repliables.
Voir le [guide V2](docs/v2-utilisation.md), le [plan et les décisions](docs/v2-plan.md),
les [métaprompts exécutés](docs/v2-metaprompts.md) et le [registre de validation](docs/v2-validation.md).
La distribution 2.0.0 conserve l’assistant Windows et les mises à jour proposées avec sauvegarde des données.

## Quelle version télécharger ?

Cette distribution **2.2.0-beta.1** réunit les améliorations de lecture et de paramètres. Le canal Stable reste choisi par défaut ; le canal Bêta s’active dans **Paramètres → Maintenance et aide → Mises à jour**. Le premier passage depuis la stable 2.1.0 suit la procédure manuelle avec sauvegarde, car cette stable ignore les préversions. Voir [le choix des canaux](docs/mises-a-jour.md). La [Release bêta 2.2.0-beta.1](https://github.com/Shaft1942/bionic_local_server/releases/tag/v2.2.0-beta.1) distribue le ZIP de cette version d’essai.

La dernière stable est la **version 2.1.0**, avec un assistant d’installation Windows et des mises à jour proposées au démarrage puis toutes les 24 heures. Téléchargez **`bionic-mobile-v2.1.0.zip`** depuis [la Release 2.1.0](https://github.com/Shaft1942/bionic_local_server/releases/tag/v2.1.0), avec `SHA256SUMS.txt`. **Node.js 24 ou ultérieur est requis** : l’assistant peut réutiliser une installation existante ou, avec votre accord, télécharger une copie portable officielle. Node.js n’est pas inclus dans le ZIP. Aucun Docker requis. Depuis 1.9.0, une mise à jour compatible peut être proposée dans le compagnon ; depuis 1.8.0, suivez [la procédure manuelle](docs/sauvegarde-mise-a-jour.md). **Code → Download ZIP** fournit l’état de la branche choisie, qui peut différer d’une Release. Voir [les mises à jour proposées](docs/mises-a-jour.md).

Le [bilan du lot d’audit](docs/choix-audit.md) décrit les choix intégrés et leurs limites. La [vérification](docs/verification.md) distingue les essais synthétiques locaux de la CI et des essais réels. Pour mettre à jour une installation existante, suivez [la procédure de sauvegarde](docs/sauvegarde-mise-a-jour.md).

## Ce que vous pouvez faire

- Retrouver les projets et les conversations existants, puis démarrer une **suite web distincte**.
- Classer les conversations dans un autre projet ou **Sans projet**, sans déplacer leurs fichiers ni modifier les historiques natifs Bionic.
- Renommer ou supprimer un chat depuis ses options. Pour un historique natif, le nom et le masquage restent propres au compagnon ; l’original Bionic est préservé.
- Choisir un modèle, régler l’effort lorsqu’il le prend en charge et consulter les mesures de génération disponibles.
- Voir les instances chargées et les décharger pour libérer la mémoire du PC.
- Lire, télécharger et modifier les fichiers texte du projet depuis le téléphone.
- Choisir les outils de fichiers du modèle : **Aucun**, **Lecture** ou **Modification** ; retrouver la corbeille du projet même après suppression du chat source.
- Activer la recherche et la lecture de pages Internet publiques, avec une option pour approuver chaque recherche et URL exacte avant envoi.
- Faire proposer un script Python, Node.js ou PowerShell et **valider son code exact avant chaque exécution** sur le PC.
- Créer une branche indépendante d’une conversation entière ou jusqu’à un message inclus, sans rejouer ses outils.
- Importer des fichiers du téléphone dans le projet et joindre des textes, des documents ou des images compatibles au chat.
- Quitter le navigateur pendant une réponse et retrouver la génération en cours à la réouverture, tant que le PC et les serveurs restent actifs.
- Rédiger le message suivant, l’ajouter à la file de la conversation et ouvrir un autre chat pendant les réponses en cours.
- Retrouver les réponses terminées depuis une absence, conserver des livrables et consulter le contexte réellement utilisé pour une nouvelle réponse.
- Conserver volontairement les textes de messages non envoyés sur cet appareil pendant 1 heure, 24 heures ou 7 jours, ou seulement dans l’onglet.

**Les messages écrits ici ne sont pas ajoutés aux conversations natives de Bionic.** Les outils d’agent, MCP et compétences de Bionic ne sont pas hérités. Le compagnon fournit ses propres outils de fichiers, de web et de scripts, avec des autorisations distinctes.

## Démarrer sous Windows

1. Téléchargez **bionic-mobile-v2.1.0.zip** depuis [la Release 2.0.0](https://github.com/Shaft1942/bionic_local_server/releases/tag/v2.0.0), puis extrayez entièrement l’archive.
2. Double-cliquez sur **Installer.cmd**. Choisissez le dossier du compagnon et un Node.js compatible, ou cochez le téléchargement portable proposé.
3. Dans **Bionic → API des modèles locaux**, activez le serveur. Reportez son adresse dans l’assistant ; le suffixe `/v1` est accepté et retiré automatiquement. Le bouton **Tester l’API** lit la liste des modèles sans génération ni déchargement.
4. Vérifiez le récapitulatif puis cliquez sur **Installer**. Le raccourci et le démarrage sont proposés. L’accès au téléphone via le pare-feu est facultatif et demande l’accord Windows sur un réseau privé.
5. Ouvrez **ACCES-PRIVE.txt** dans le dossier installé pour trouver votre code personnel et les adresses du PC et du téléphone. Le téléphone doit être connecté au même Wi-Fi.

L’assistant ne transfère aucune conversation depuis un autre dossier. Pour reconfigurer une installation existante, arrêtez-la puis lancez son propre **Installer.cmd** et choisissez **Ce dossier**. Pour la mettre à jour, utilisez le parcours prévu à cet effet. Le [guide de l’assistant](docs/assistant-installation.md) détaille les choix et leurs limites ; le [parcours manuel](docs/installation.md#installation-manuelle) reste disponible.

Aucune installation de dépendances npm n’est nécessaire pour exécuter le serveur. **Python est facultatif** : il sert à extraire le texte des documents PDF, DOCX et XLSX et à exécuter les scripts Python que vous validez. Le téléchargement des fichiers et les autres fonctions restent disponibles sans Python.

Le guide [Installation](docs/installation.md) détaille ces étapes et les options Python.

## À savoir avant d’utiliser les fichiers

Dans **Outils fichiers**, **Modification** autorise des opérations immédiates sur le PC et reste le réglage d’un nouveau chat ordinaire. **Lecture** permet de lister, chercher, inspecter et lire sans mutation par ces outils directs ; **Aucun** les désactive. Les anciens choix activé/désactivé restent respectivement Modification/Aucun. Les remplacements conservent une copie précédente et les retraits passent par une corbeille récupérable ; une sauvegarde indépendante de vos projets reste utile.

L’application n’envoie pas automatiquement toute votre bibliothèque au modèle. Les lectures par outil sont limitées à des extraits et à un budget par demande. Les fichiers que vous joignez explicitement font partie du contexte envoyé.

**Internet et les scripts sont désactivés par défaut.** Le menu **Outils** permet de les activer pour les messages suivants. Les scripts approuvés s’exécutent avec les droits de votre compte, au-delà du seul dossier du projet : **ce n’est pas un bac à sable**. Une modification par script n’a pas de sauvegarde automatique garantie. Consultez le [guide des outils](docs/outils-agents.md) avant d’autoriser une proposition.

**Valider chaque recherche et URL avant envoi** est volontaire et distinct de l’autorisation web. Dans ce mode, chaque envoi des outils web attend un accord exact et les redirections sont refusées. Cette option et le profil Lecture ne limitent pas le réseau ou les droits d’un script approuvé.

Un chat web illisible est préservé et signalé par un **inventaire partiel** ; les autres restent accessibles. Aucune réparation automatique n’est tentée. Le [guide de dépannage](docs/depannage.md) explique la récupération manuelle. Sous Windows, **Diagnostic.cmd** produit un diagnostic borné et **Deconnecter-appareils.cmd** invalide globalement les sessions sans arrêter les travaux ; un appareil connaissant le code peut se reconnecter.

Le premier démarrage utilise **HTTP** et un code d’accès pour un **réseau local de confiance**. Dans **Paramètres → Connexion et appareils → Sécurité des connexions**, depuis le téléphone ou le PC, préparez HTTPS, téléchargez l’autorité puis vérifiez la connexion avant activation. Depuis HTTPS, créez et téléchargez directement le certificat privé de chaque appareil, avec son mot de passe d’import, puis activez si souhaité le certificat client obligatoire (mTLS). L’import dans le système demande votre confirmation. Le port de vérification est configuré une fois dans l’assistant Windows ; **Certificats.cmd** reste un outil de récupération locale. Consultez le [parcours certificats](docs/certificats-utilisation.md).

N’exposez pas directement le compagnon sur Internet et n’ouvrez pas de redirection de port sur votre routeur. Lisez [Sécurité](SECURITY.md) avant de partager un accès.

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
| Choix d’audit retenus, critères, dépendances et limites du diff local | [Lot d’audit](docs/choix-audit.md) |

## Compatibilité

La base de validation est **Windows, Node.js 24+ et Bionic 1.1.8+10**. La lecture des projets dépend d’une structure interne Bionic, notamment SQLite ; elle peut nécessiter une adaptation après une mise à jour de Bionic. Le lancement par `npm start` est prévu sur les autres systèmes, mais leur fonctionnement complet n’est pas validé.

L’analyse d’images nécessite un modèle marqué **Vision**. L’effort, les appels d’outils et les statistiques dépendent du modèle et des réponses de l’API. Tous les modèles ne sont pas fiables pour modifier des fichiers.

## Licence

Le code du compagnon est fourni sous [licence MIT](LICENSE). Cette licence ne couvre ni Bionic, ni les modèles, ni les fichiers de vos projets.
