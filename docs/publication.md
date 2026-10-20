# Publication sur GitHub

[Retour au README](../README.md)

Ce guide concerne la **copie de distribution propre** du programme. Il ne faut pas publier le dossier d’une installation active contenant des conversations, codes, journaux ou sauvegardes.

Le dépôt prévu est [Shaft1942/bionic_local_server](https://github.com/Shaft1942/bionic_local_server). La licence du compagnon est [MIT](../LICENSE). Elle n’inclut pas Bionic, les modèles ou les documents des utilisateurs.

## Vérifier la copie avant l’envoi

Les sources, les tests fictifs, les lanceurs, la configuration d’exemple et la documentation peuvent être distribués. La copie ne doit contenir ni historique personnel, ni trace d’exécution réelle.

À contrôler avant tout commit et dans l’archive finale :

- Absence de `data/`, `runtime/`, `ACCES-PRIVE.txt`, `config.local.json`, fichiers `.env`, journaux et sauvegardes.
- Absence de bases ou registres personnels Bionic, projets réels, imports du téléphone et captures montrant des conversations réelles.
- Absence de jetons, codes, noms de compte Windows, chemins privés et adresses propres à la machine d’origine dans les sources ou l’historique.
- Configuration d’exemple neutre : aucun dossier supplémentaire ouvert par défaut, aucun chemin vers un runtime privé, aucun code prérempli.
- Licence, version et liens de documentation cohérents ; limites fonctionnelles explicites.
- Vérifications automatisées réussies et lancement depuis une extraction propre, sans utiliser le runtime de la machine de développement par un chemin personnel codé en dur.

Un scan automatique aide à détecter des motifs connus, mais ne prouve pas l’absence de toute donnée privée. Relisez la liste réelle des fichiers à publier. `.gitignore` n’efface pas les secrets déjà suivis et ne filtre pas une archive créée en copiant un dossier entier.

## Préparer le dépôt

Dans un dépôt déjà cloné, examinez les modifications avant de les indexer :

```sh
git status --short
git diff
git ls-files
```

Si le dépôt distant contient déjà des commits, récupérez son état et conservez son historique. N’utilisez pas un envoi forcé pour remplacer un historique sans examen. Si vous partez d’un dossier neuf, initialisez son historique uniquement avec les fichiers de distribution revus.

Avant l’envoi, exécutez les contrôles décrits dans [Développement](developpement.md) :

```sh
npm run check
npm test
npm run check:export
```

Inspectez aussi les fichiers indexés, qui sont ceux du prochain commit :

```sh
git diff --cached --stat
git diff --cached
```

Les identités de commit sont des métadonnées publiques. Choisissez votre identité Git selon votre préférence, par exemple une adresse GitHub de confidentialité, sans recopier une identité personnelle depuis un autre projet.

## Créer une archive téléchargeable

Le projet fournit une construction depuis une **liste fermée de fichiers autorisés**, déclarée dans `release-manifest.json` :

```sh
npm run release
```

L’archive est écrite dans `dist/`. Vérifiez le résultat des contrôles et son contenu avant tout envoi. N’archivez pas à la place un dossier lancé puis rempli de données privées. Si vous ajoutez un fichier nécessaire au lancement ou à la documentation, vérifiez qu’il est inclus dans la liste de distribution.

Extrayez l’archive obtenue dans un dossier vierge et vérifiez au minimum :

1. Le README, la licence, les guides, les scripts et tous les fichiers nécessaires au lancement sont présents.
2. Aucun dossier de données, code préexistant ou élément personnel n’est inclus.
3. Le démarrage crée une authentification propre à cette extraction, et non un code livré dans l’archive.
4. L’utilisateur peut configurer son propre port Bionic et ses chemins sans modifier le code.

Les fichiers générés pendant cette validation restent dans le dossier de test ; ne les réintégrez pas dans la release.

## Publier une version

Après validation du commit et de l’archive, créez une version GitHub avec un tag correspondant à `package.json`, par exemple **`v1.5.0`**, une note de version et l’archive propre en pièce jointe. Ajoutez une empreinte SHA-256 de l’archive si elle est produite par votre procédure de distribution.

La note doit dire ce qui est nouveau, comment installer et mettre à jour, ce qui a été testé et les limitations connues. Les versions de Bionic et les systèmes non vérifiés ne doivent pas être présentés comme compatibles par défaut.

Le workflow `release.yml` automatise cette procédure lors de l’envoi d’un tag `v*` : il vérifie que le tag correspond à la version du paquet, lance les tests, construit l’archive depuis le manifeste et crée une Release avec le ZIP et `SHA256SUMS.txt`. L’envoi de ce tag déclenche donc une publication téléchargeable ; ne l’effectuez qu’après revue des sources. Les vérifications ordinaires des branches et pull requests disposent seulement d’un accès en lecture au dépôt.

GitHub peut distribuer le code et les archives, mais **GitHub Pages n’héberge pas le serveur Node.js de cette application**. Chaque personne télécharge et exécute sa propre copie sur son PC avec Bionic. Aucun serveur central n’est nécessaire à cette distribution.

## Après publication

Ouvrez la page publique et téléchargez l’archive publiée pour contrôler ce que reçoivent réellement les utilisateurs. Ne publiez pas de captures d’une installation personnelle pour illustrer la release ; utilisez seulement des données fictives préparées à cet effet.

Si un élément privé apparaît malgré ces contrôles, appliquez la procédure de [Sécurité](../SECURITY.md) : retrait, renouvellement des secrets concernés et examen des autres copies, y compris l’historique et les releases.
