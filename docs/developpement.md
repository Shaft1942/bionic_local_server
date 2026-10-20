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
| `server.mjs` | Serveur HTTP, authentification, routes, conversations web et cycle de génération |
| `lib/bionic-store.mjs` | Projection en lecture seule des projets et conversations natifs |
| `lib/conversation-organizer.mjs` | Classement, noms et masquage locaux des conversations natives, groupe Sans projet, sans écriture dans Bionic |
| `lib/project-files.mjs` | Périmètres de dossiers, lecture, imports, sauvegardes et écritures contrôlées |
| `lib/file-agent.mjs` | Outils de fichiers, budget de lecture et décodage des appels d’outils |
| `lib/model-service.mjs` | Liste des modèles, capacités et déchargement |
| `lib/reasoning.mjs` | Choix d’effort selon le modèle |
| `lib/generation-metrics.mjs` | Mesures de génération disponibles |
| `lib/context-receipt.mjs` | Reçu borné du contexte sélectionné et des extraits effectivement lus |
| `lib/workspace-features.mjs` | Activité des réponses web et copies figées de livrables, isolées par projet |
| `public/` | Interface navigateur sans framework de compilation |
| `lib/document-extract.py` | Extraction de texte PDF, DOCX et XLSX |
| `test/` | Fixtures fictives et tests automatisés |
| `scripts/` | Aides de distribution et de vérification |

Le navigateur utilise une session authentifiée pour joindre le serveur. Le serveur relaie les générations vers l’API locale Bionic, puis conserve les réponses web dans son propre `data/`. La génération ne dépend pas de la présence continue du navigateur. Les outils de fichiers sont exécutés par le compagnon : ils ne réutilisent pas l’agent natif Bionic.

## Vérifications

Depuis la racine du dépôt :

```sh
npm run check
npm test
npm run check:export
```

Les tests doivent rester isolés : registres synthétiques, bases SQLite fabriquées, dossiers temporaires possédés par le test et réponses d’API simulées. Aucun test ne doit modifier des données Bionic ou des projets personnels par défaut. Les formats documentaires optionnels peuvent nécessiter Python et les dépendances correspondantes.

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
- Le renommage et la suppression après rechargement, le refus pendant une génération ou une attente, et l’absence de réapparition d’un chat supprimé après une écriture concurrente.
- Le nom local et le masquage des fils natifs sans modification de leur source, ainsi que la conservation des fichiers et livrables lorsque leur chat d’origine est supprimé.

## Adaptateur Bionic

La référence de compatibilité est Bionic **1.1.8+10**. `bionic-store.mjs` lit le registre et les bases SQLite internes, en lecture seule. Les redirections et branches natives doivent rester cohérentes dans la projection ; une simple lecture de toutes les lignes par date ne représente pas forcément le contexte visible.

En cas de base occupée, l’adaptateur peut construire un instantané temporaire de lecture. Il ne doit pas migrer, réparer ni écrire dans les fichiers natifs. Une mise à jour Bionic exige une vérification du schéma et des comportements, avec une fixture anonymisée construite pour les tests, pas une copie d’historique réel.

## Données privées et publication

Une exécution locale génère `data/`, `runtime/`, `ACCES-PRIVE.txt` et des journaux. Ils ne doivent pas devenir des fixtures, des artefacts CI ou une partie d’une release. Le fichier local de configuration et les jetons d’environnement restent privés.

Avant une proposition de publication, suivez [Publication](publication.md). Ne copiez pas tout un dossier actif vers une archive, même si `.gitignore` existe.
