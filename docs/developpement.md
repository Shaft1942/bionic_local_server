# Développement

[Retour au README](../README.md) · [Règles de contribution](../CONTRIBUTING.md)

## Environnement

- Node.js **24+**, notamment pour l’accès SQLite intégré.
- Git pour travailler sur le dépôt.
- Python **3.10+ facultatif** pour les tests et usages d’extraction documentaire concernés ; `pypdf` pour les PDF.
- Bionic sur le même PC pour une vérification réelle de l’intégration.

Le serveur n’a pas de dépendances npm d’exécution et le frontend ne nécessite pas de compilation.

```sh
git clone https://github.com/Shaft1942/bionic_local_server.git
cd bionic_local_server
```

Copiez `config.example.json` en `config.local.json`, choisissez un port de test disponible et un dossier Bionic de test lorsque vous exercez les écritures. Ne démarrez pas simultanément une copie de développement sur le port d’une installation active.

## Organisation du code

| Emplacement | Rôle |
| --- | --- |
| `server.mjs` | Fabrique `createCompanion`, serveur HTTP, authentification, routes, conversations web et cycle de génération ; écoute seulement lors du lancement direct |
| `lib/bionic-store.mjs` | Projection en lecture seule des projets et conversations natifs |
| `lib/conversation-organizer.mjs` | Classement, noms et masquage locaux des conversations natives, groupe Sans projet, sans écriture dans Bionic |
| `lib/project-files.mjs` | Périmètres de dossiers, lecture, imports, sauvegardes et écritures contrôlées |
| `lib/file-agent.mjs` | Outils de fichiers, budget de lecture et décodage des appels d’outils |
| `lib/agent-tools.mjs` | Sélection des outils par permissions figées, budgets web et journal des résultats |
| `lib/web-tools.mjs` | Recherche, lecture passive, filtrage public des adresses et transport HTTP épinglé |
| `lib/tool-approvals.mjs` | Propositions de code immuables, validation unique, expiration et annulation |
| `lib/script-tools.mjs` | Interpréteurs locaux, exécution après accord, délais et sorties bornées |
| `lib/conversation-fork.mjs` | Instantanés indépendants des messages, historique passif et retrait des capacités d’exécution |
| `lib/model-service.mjs` | Liste des modèles, capacités et déchargement |
| `lib/reasoning.mjs` | Choix d’effort selon le modèle |
| `lib/generation-metrics.mjs` | Mesures de génération disponibles |
| `lib/context-receipt.mjs` | Reçu borné du contexte sélectionné et des extraits effectivement lus |
| `lib/workspace-features.mjs` | Activité des réponses web et copies figées de livrables, isolées par projet |
| `lib/inference-gate.mjs` | Admission FIFO optionnelle de chaque inférence ; les accords humains ne gardent pas de créneau |
| `lib/request-body.mjs` | Réception bornée en taille et durée, distincte du streaming après acceptation |
| `lib/diagnostics.mjs` | Cinq contrôles à la demande et rapport construit par liste blanche |
| `public/message-drafts.js` | Conservation volontaire des textes non envoyés, durée et retrait local |
| `public/` | Interface navigateur sans framework de compilation |
| `lib/document-extract.py` | Extraction de texte PDF, DOCX et XLSX |
| `test/` | Fixtures fictives et tests automatisés |
| `scripts/` | Aides de distribution et de vérification |

Le navigateur utilise une session authentifiée pour joindre le serveur. Le serveur relaie les générations vers l’API locale Bionic, puis conserve les réponses web dans son propre `data/`. La génération et l’attente d’une validation ne dépendent pas de la présence continue du navigateur. Les outils sont exécutés par le compagnon : ils ne réutilisent pas l’agent, les MCP ni les compétences natifs Bionic.

Importer `server.mjs` ne crée ni fichier ni port. `createCompanion(options)` initialise volontairement une instance avec dépendances injectables et retourne notamment `handle`, `server` et `close`. Les tests de routes importent cette fabrique sans remplacer ni tronquer son code source. Le cycle de génération et le stockage ne font pas l’objet d’une extraction générale supplémentaire.

Les trois permissions sont capturées à l’acceptation du message et conservées dans la file. Le contexte se construit au démarrage de son tour. Les propositions et décisions de script sont enregistrées avant la reprise ; l’API authentifiée de validation vérifie le projet, le chat et l’identifiant de la proposition. Le code affiché ne peut pas être remplacé par le corps de la requête d’approbation. Le redémarrage n’hydrate pas d’anciennes validations exécutables.

Le reçu de contexte note les sorties externes reçues avec `transmitted: false`. Seule une réponse HTTP réussie de l’API du modèle confirme leur retransmission. Les textes et journaux copiés par un fork restent des données historiques ; ses validations, identifiants de demande, files et droits de restauration ne sont pas transférés. Les fichiers vivants du projet restent partagés entre les conversations.

## Vérifications

Depuis la racine du dépôt :

```sh
npm run check
npm test
npm run check:export
```

Les tests doivent rester isolés : registres synthétiques, bases SQLite fabriquées, dossiers temporaires possédés par le test et réponses d’API simulées. Aucun test ne doit modifier des données Bionic ou des projets personnels par défaut. Les formats documentaires optionnels peuvent nécessiter Python et les dépendances correspondantes.

### Deux parcours navigateur de développement

Le serveur utilisateur démarre sans installation npm. Pour développer et rejouer le smoke uniquement, installez la dépendance de développement **Playwright 1.62.1**, puis son navigateur :

```sh
npm install --include=dev
npx playwright install chromium
npm run test:browser
```

La commande appelle `node scripts/browser-smoke.mjs`. Elle utilise deux parcours, chacun à 320 et 1280 px : file de messages, navigation, brouillon séparé et effacement entre deux onglets ; badge d’accord, carte de script, déduplication des annonces et refus. Elle intercepte tous les accès avec une API synthétique et charge les fichiers de l’interface, sans démarrer Bionic ni un modèle. Elle contrôle les actions observables, erreurs JavaScript et débordements ; il ne s’agit pas d’une couverture de toute l’interface.

Une installation de développement existante peut être réutilisée avec `PLAYWRIGHT_MODULE_PATH` pointant vers le dossier du paquet Playwright et `BIONIC_BROWSER_CHANNEL=chrome` pour un Chrome installé. Aucun chemin propre au poste n’est requis dans le code. `BIONIC_SMOKE_SCREENSHOTS` permet de choisir un dossier local pour les captures synthétiques ; ces sorties restent hors manifeste. `BIONIC_SMOKE_BREAK_SEND=1` neutralise volontairement l’envoi dans la fixture pour vérifier que le parcours détecte cette régression, puis doit être retiré.

Le smoke n’est **pas activé automatiquement en CI**. Playwright n’est pas une dépendance d’exécution et aucun navigateur n’est nécessaire au lancement du serveur. Un viewport de 320 px n’est pas un téléphone physique, un clavier natif, un lecteur d’écran ni un test Wi-Fi.

### Lecture des conversations

`node --test test/message-text.test.mjs` vérifie le rendu DOM passif, les liens, listes/tableaux, bornes sur textes malformés et la copie exacte, y compris CRLF et code non clôturé. `node scripts/browser-reading.mjs` exerce ensuite l'interface à 320, 390 et 1280 px : contenus mêlés, refus d'une validation, états d'erreur, image, presse-papiers simulé, streaming NDJSON contrôlé, sélection/focus/détails, défilement et accès au plafond du bon modèle/chat. Toutes les requêtes sont interceptées ; aucun serveur utilisateur ni moteur n'est contacté. Les variables de runtime et de captures ci-dessus sont réutilisées.

Le nouveau module `public/message-text.js` est servi par la liste explicite d'actifs statiques ; le test HTTP de `test/server.test.mjs` vérifie cette route et son type JavaScript sans ouvrir de port. Les sources/tests/smoke font partie du manifeste fermé de distribution. Le renderer est un sous-ensemble volontaire du Markdown, pas une implémentation exhaustive de CommonMark ; HTML brut et images Markdown distantes restent du texte passif.

### Navigation des paramètres

`node scripts/browser-settings.mjs` utilise les mêmes variables Playwright que les autres smokes. Il charge l'interface avec une API entièrement synthétique et vérifie les destinations, la recherche, le clavier, les formulaires et leurs limites à 320/390/1280 px. Les actions certificat et maintenance sont simulées ; ce parcours ne valide ni un import système de certificat, ni une mise à jour réelle, ni un moteur ou un téléphone physique. Les tests de portée et de réponses tardives sont complétés par `node --test test/settings-ui.test.mjs`.

### Mesurer les parcours des chats

```sh
npm run benchmark:chats
```

`scripts/benchmark-chats.mjs` fabrique 10, 100 puis 1 000 chats temporaires et mesure froid/chaud : durée, parcours de répertoire, lectures JSON, désérialisations et mémoire du processus. Il compare un contrôle parcourant les chats pour chacun de deux projets au partage du même cycle, avec le **même lecteur actuel**. Ce contrôle reproduit le motif de parcours de `5e92da3`, pas toute l’ancienne application. L’API interne `withScanCycle` de la fabrique sert à cette mesure.

Les observations locales passent de deux parcours à un pour ce cycle et ne relisent pas les JSON du cache chaud. Une seule mesure par taille, sans isolation mémoire ni GC forcé, ne démontre aucun gain de latence utilisateur ou de mémoire. L’application conserve son cache existant ; aucun index persistant, cache LRU, pagination ou migration de stockage n’est ajouté. L’activité partage également un seul parcours pendant sa requête.

### Diagnostic et révocation locale

`node scripts/diagnostic.mjs` écrit `diagnostic-bionic.json` avec les seuls champs autorisés et sans lancer de modèle. `node scripts/revoke-sessions.mjs` invalide les sessions de l’instance locale reconnue sans afficher son secret ; le code existant permet toujours une reconnexion. Les lanceurs Windows `Diagnostic.cmd` / `.ps1` et `Deconnecter-appareils.cmd` / `.ps1` appellent ces commandes. Voir [Dépannage](depannage.md) et [Sauvegarde](sauvegarde-mise-a-jour.md) pour leurs limites.

`check:export` vérifie la préparation de la distribution. `npm run release` construit une archive dans `dist/` à partir de la liste fermée de `release-manifest.json`, puis les contrôles d’export doivent être pris en compte avant toute publication. Ne remplacez pas ce parcours par une copie complète d’un dossier actif. Le champ `private: true` de `package.json` évite une publication npm accidentelle ; il n’empêche pas un dépôt GitHub public.

Pour lancer une instance manuelle :

```sh
npm start
```

Une validation avec une API simulée vérifie le protocole du compagnon ; elle ne prouve pas qu’un modèle réel sait utiliser les outils. Une validation réelle doit nommer les versions utilisées et se dérouler dans un projet sans données importantes.

Selon la modification, vérifiez aussi :

- Les refus d’accès sans session et les contrôles d’origine.
- L’absence de sortie des dossiers autorisés, de traversée de liens et d’écrasement de fichiers récents.
- Les imports homonymes, les limites de taille et les formats non exploitables.
- Les outils désactivés, les lectures ciblées, les erreurs du modèle et la restauration.
- La fermeture puis la réouverture du navigateur pendant une réponse, sans duplication d’envoi.
- La navigation entre deux générations, les brouillons et pièces jointes propres à chaque fil, et l’ordre des messages en attente.
- L’annulation d’une seule demande, l’isolation de ses réglages et l’absence de relance automatique après un redémarrage.
- Le téléphone en largeur étroite, les contrôles accessibles et l’affichage des erreurs.
- La consultation ciblée d’un événement sans marquage global, la conservation d’une copie malgré un changement de source et les reçus après erreur de transmission.
- Le filtrage IPv4/IPv6, les DNS mixtes, le rebinding et chaque redirection, en injectant résolution et transport plutôt qu’en contactant un réseau privé.
- Les schémas des moteurs, les CAPTCHA, les contenus trop grands ou non textuels, les délais DNS/HTTP et les sorties HTML passives.
- Le refus d’exécuter sans accord, le double clic, le mauvais projet ou chat, la modification de la proposition, l’expiration, l’arrêt et les checkpoints en erreur.
- Les sorties excessives, les erreurs d’interpréteur, la persistance après fermeture du téléphone et l’absence de replay après redémarrage.
- Les branches jusqu’au message inclus, la source intacte, les identifiants renouvelés, l’historique passif et les permissions web/scripts désactivées.

- Le renommage et la suppression après rechargement, le refus pendant une génération ou une attente, et l’absence de réapparition d’un chat supprimé après une écriture concurrente.
- Le nom local et le masquage des fils natifs sans modification de leur source, ainsi que la conservation des fichiers et livrables lorsque leur chat d’origine est supprimé.
- Les validations bloquant les changements de classement, les scripts désactivés après déplacement et dans Sans projet, et la restauration de corbeille sérialisée avec le déplacement ou la suppression du chat.

Les contrats, limites et liens vers les API primaires figurent dans [Outils des agents](outils-agents.md). Les [méta-prompts d’implémentation 1.8](metaprompts-implementation-1.8.md) décrivent la répartition et les revues croisées. Les résultats d’essais, y compris les fonctionnalités non vérifiées en réseau réel, restent dans [Vérification](verification.md).

## Adaptateur Bionic

La référence de compatibilité est Bionic **1.1.8+10**. `bionic-store.mjs` lit le registre et les bases SQLite internes, en lecture seule. Les redirections et branches natives doivent rester cohérentes dans la projection ; une simple lecture de toutes les lignes par date ne représente pas forcément le contexte visible.

En cas de base occupée, l’adaptateur peut construire un instantané temporaire de lecture. Il ne doit pas migrer, réparer ni écrire dans les fichiers natifs. Une mise à jour Bionic exige une vérification du schéma et des comportements, avec une fixture anonymisée construite pour les tests, pas une copie d’historique réel.

## Données privées et publication

Une exécution locale génère `data/`, `runtime/`, `ACCES-PRIVE.txt` et des journaux. Ils ne doivent pas devenir des fixtures, des artefacts CI ou une partie d’une release. Le fichier local de configuration et les jetons d’environnement restent privés.

Avant une proposition de publication, suivez [Publication](publication.md). Ne copiez pas tout un dossier actif vers une archive, même si `.gitignore` existe.
