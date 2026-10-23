# Préparer une distribution

[Documentation](README.md) · [Développement](developpement.md) · [Sécurité](../SECURITY.md)

Le dépôt produit contient les sources publiques, exemples neutres, guides actuels, licences et tests synthétiques. Il ne contient ni installation active, données, profils de lancement privés, sorties de tests, méta-prompts, rapports d’agents ou relevés d’un poste personnel. Un fichier retiré du dernier commit peut rester dans l’historique ; un secret exposé exige renouvellement et traitement de ses copies, selon [Sécurité](../SECURITY.md).

## Version et canaux

| Canal | Version du paquet et tag | Release GitHub |
| --- | --- | --- |
| Stable | `X.Y.Z`, `vX.Y.Z` | Normale, dernière stable |
| Bêta | `X.Y.Z-beta.N`, `vX.Y.Z-beta.N` | Préversion, jamais dernière stable |

`N` est un entier positif sans zéro initial. Les autres suffixes et métadonnées de build sont refusés. Chaque publication utilise une version et un tag nouveaux ; le tag correspond exactement à `package.json`. Le `CHANGELOG.md` contient une section pour ce numéro complet. Le choix de canal d’une installation reste indépendant du paquet installé ; voir [Mises à jour](mises-a-jour.md).

## Contrôler le candidat

Travaillez depuis une copie propre des sources sélectionnées, jamais par copie d’une installation contenant ses données. Examinez diff, index, licences et liens français/anglais.

```sh
git status --short
git diff
npm run check
npm test
npm run check:export
npm run check:docs
```

La liste fermée `release-manifest.json` définit les fichiers autorisés dans Git et le ZIP. Tout ajout ou retrait doit être intentionnel et cohérent avec l’index. L’export refuse chemins privés, liens symboliques, formats de données/clé et motifs connus d’accès ; ce scan ne remplace pas une revue du contenu. `.gitignore` n’efface pas un fichier déjà suivi.

La CI de branche ou de pull request vérifie Windows et Ubuntu, Node.js 24. Avant le tag, exigez son succès sur le commit exact et vérifiez les parcours d’installation/mise à jour correspondant aux bornes annoncées avec données synthétiques. Les modèles et systèmes non exercés ne sont pas compatibles du seul fait d’une archive construite.

## Construire et inspecter

```sh
npm run release -- --channel stable
# Pour un paquet X.Y.Z-beta.N : npm run release -- --channel beta
```

Le canal demandé doit correspondre à `package.json`. Sans option, il est déduit de la version. Le dossier `dist/` reçoit :

- `bionic-mobile-v<version>.zip` : sources publiques sous un dossier versionné ;
- `SHA256SUMS.txt` : empreinte du ZIP ;
- `update-manifest.json` : version, canal, archive, empreinte et compatibilité.

Comparez inventaire du ZIP et manifeste, chaque entrée et ses sources, CRC et SHA-256. Le manifeste de mise à jour reste extérieur au ZIP pour éviter une empreinte circulaire. L’extraction ne doit contenir aucun code d’accès préexistant, profil privé, `data/`, `runtime/` ou journal. Un essai de démarrage et migration utilise un dossier neuf ou une ancienne installation synthétique.

`update-compatibility.json` déclare protocole, versions installées acceptées, Node.js et plateformes. Sa borne minimale est une déclaration à vérifier, pas une conséquence du numéro de version. Ne la relevez pas sans nécessité et ne promettez pas un saut non qualifié. Les empreintes prouvent la cohérence des pièces jointes, pas une signature indépendante du compte éditeur.

## Publication GitHub

La construction locale ne publie rien. Une publication autorisée consiste à envoyer le tag du commit vérifié. `.github/workflows/release.yml` valide le tag, lance les contrôles, construit l’archive puis crée la Release avec les trois pièces jointes. Une bêta utilise `--prerelease --latest=false` ; une stable utilise `--latest`.

Les notes décrivent le résultat, l’installation, la mise à jour et les limites. Les guides annoncent les fonctions de la version sans affirmer sa publication avant son existence. Après publication, téléchargez les pièces jointes et vérifiez version, inventaire, empreintes et détection par le canal attendu.

Les [Releases](https://github.com/Shaft1942/bionic_local_server/releases) et [exécutions CI](https://github.com/Shaft1942/bionic_local_server/actions/workflows/ci.yml) donnent l’état distant. GitHub distribue les sources et archives ; GitHub Pages n’héberge pas ce serveur Node.js. Aucun envoi forcé ni réécriture d’historique ne découle d’un nettoyage documentaire.
