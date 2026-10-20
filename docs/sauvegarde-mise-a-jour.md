# Sauvegarde et mise à jour

[Retour au README](../README.md)

## Ce qui vous appartient

Le dépôt GitHub et les archives publiques contiennent le programme. Vos conversations, fichiers et codes restent dans votre installation locale.

| Emplacement | Contenu à protéger |
| --- | --- |
| `data/` | Conversations web et reçus de contexte, copies de pièces jointes, livrables dans `data/workspace/`, sauvegardes de fichiers et authentification |
| `config.local.json` | Vos ports, chemins et réglages privés |
| `ACCES-PRIVE.txt` | Code d’accès en clair et adresses de connexion |
| Dossiers de travail de vos projets | Fichiers modifiés et dossier `Imports telephone/` |
| Dossiers de données Bionic | Projets et historiques natifs, gérés séparément par Bionic |
| `runtime/` et journaux | Informations d’exécution et chemins locaux ; ce ne sont pas des archives publiques |

Une sauvegarde du seul dossier du compagnon ne protège pas les fichiers des projets situés ailleurs. Les copies de `data/file-backups/` aident à annuler des remplacements ; elles ne remplacent pas une sauvegarde indépendante de vos projets.

Le suivi des réponses consultées est conservé dans le navigateur de chaque appareil, pas dans `data/`. Une sauvegarde du serveur conserve l’étagère de livrables et ses copies, mais ne transporte pas ces repères de lecture sur un autre navigateur.

Le classement local des conversations natives est enregistré dans `data/conversation-locations.json`. Il fait partie de la sauvegarde du compagnon : restaurer uniquement les données Bionic ne restaure pas ce classement. Les conversations web portent directement leur projet de destination dans `data/chats/`. Aucun de ces déplacements ne déplace les fichiers des projets.

## Faire une sauvegarde cohérente

1. Attendez la fin des réponses et des enregistrements, puis arrêtez le compagnon avec `Arreter.cmd`.
2. Copiez `data/`, `config.local.json` et `ACCES-PRIVE.txt` dans un emplacement privé.
3. Sauvegardez séparément les dossiers de projets et les données Bionic selon votre pratique habituelle.
4. Protégez cette copie comme vos documents originaux : elle peut contenir leurs textes, leurs images et leurs anciennes versions.

`runtime/` est recréé au démarrage et ne doit pas être restauré depuis un autre PC.

## Installer une nouvelle version

1. Faites la sauvegarde précédente.
2. Téléchargez la nouvelle archive depuis les [Releases](https://github.com/Shaft1942/bionic_local_server/releases) et extrayez-la dans un nouveau dossier.
3. Consultez le [journal des versions](../CHANGELOG.md). Comparez le nouveau `config.example.json` avec votre configuration privée sans recopier vos secrets dans l’exemple.
4. Copiez vos `data/`, `config.local.json` et `ACCES-PRIVE.txt` dans le nouveau dossier. Ne remplacez pas votre `data/config.json` par celui d’une autre installation.
5. Arrêtez l’ancien serveur, puis lancez le nouveau. Vérifiez l’ouverture du chat, les projets et un fichier sans importance avant de reprendre un travail.
6. Conservez temporairement l’ancien dossier arrêté pour revenir en arrière si nécessaire.

Avant de déplacer l’installation, utilisez `Retirer-autorisation-reseau.cmd` dans l’ancien dossier si vous y aviez créé une autorisation. La règle dépend du dossier : recréez-la volontairement dans le nouveau si nécessaire. Les adresses sont rafraîchies au démarrage. Les sessions de connexion ne sont pas conservées lors du redémarrage : utilisez votre code habituel.

**Ne récupérez jamais de code d’accès ou de dossier `data/` depuis GitHub.** Une archive publique doit démarrer sans ces fichiers et générer un code propre à chaque installation.

## Renouveler un code perdu ou divulgué

Cette procédure renouvelle aussi le secret d’administration local et déconnecte les sessions.

1. Arrêtez le serveur et faites une sauvegarde privée de `data/`.
2. Déplacez **uniquement `data/config.json` et `ACCES-PRIVE.txt`** vers un emplacement privé hors du dossier du compagnon. Ne supprimez pas `data/chats/`, les pièces jointes ou les sauvegardes de fichiers.
3. Redémarrez : de nouveaux fichiers d’authentification et un nouveau code sont créés.
4. Vérifiez le nouveau code, puis protégez ou éliminez les anciennes copies contenant l’ancien code selon vos besoins de sauvegarde.

Ne confondez pas `data/config.json` avec `config.local.json`. Le premier contient l’authentification générée ; le second vos réglages de connexion.

## Revenir à la version précédente

Arrêtez le nouveau serveur avant de lancer l’ancien. Si une version future annonce un changement de format des données, restaurez également sa sauvegarde compatible au lieu de mélanger des formats. Les fichiers de projet déjà modifiés ne sont pas annulés par un retour de version du programme : restaurez-les séparément si nécessaire.
