# Sauvegarde et mise à jour

[Retour au README](../README.md)

## Ce qui vous appartient

Le dépôt GitHub et les archives publiques contiennent le programme. Vos conversations, fichiers et codes restent dans votre installation locale.

| Emplacement | Contenu à protéger |
| --- | --- |
| `data/` | Conversations web et branches, propositions de scripts et leurs sorties, reçus de contexte, copies de pièces jointes, livrables dans `data/workspace/`, sauvegardes et corbeille dans `data/file-backups/`, authentification |
| `config.local.json` | Vos ports, chemins et réglages privés |
| `ACCES-PRIVE.txt` | Code d’accès en clair et adresses de connexion |
| Dossiers de travail de vos projets | Fichiers modifiés et dossier `Imports telephone/` |
| Dossiers de données Bionic | Projets et historiques natifs, gérés séparément par Bionic |
| `runtime/` et journaux | Informations d’exécution et chemins locaux ; ce ne sont pas des archives publiques |
| Environnement privé du serveur | Jeton Bionic, éventuelle clé Brave et endpoint SearXNG ; ces réglages ne sont pas automatiquement copiés avec `config.local.json` |
| Stockage du navigateur | Textes de messages non envoyés si leur conservation durable a été choisie ; ils ne sont pas inclus dans la sauvegarde du serveur |

Une sauvegarde du seul dossier du compagnon ne protège pas les fichiers des projets situés ailleurs. Les copies de `data/file-backups/` aident à annuler des remplacements ; elles ne remplacent pas une sauvegarde indépendante de vos projets.

La corbeille conserve les octets des fichiers retirés par l’outil dédié, dans `data/file-backups/`. **Fichiers du projet → Corbeille du projet** permet de les retrouver même après suppression du chat source ; les boutons des actions historiques restent aussi disponibles. L’inventaire est limité au projet et signale les copies endommagées. Une branche copie le journal sous forme historique et ne transfère pas ses droits. La restauration refuse d’écraser un fichier qui occupe déjà le chemin d’origine ; aucune purge automatique n’est ajoutée.

Les scripts approuvés peuvent modifier des fichiers en dehors du projet et ne produisent pas automatiquement de sauvegarde pour chaque changement. Leur code et leurs sorties peuvent contenir des informations privées ; ils sont conservés dans les conversations. `data/tool-runs/` sert aux fichiers temporaires d’exécution, normalement nettoyés après la fin : ce dossier n’est pas une bibliothèque de scripts à restaurer ou à publier.

Le suivi des réponses consultées est conservé dans le navigateur de chaque appareil, pas dans `data/`. Une sauvegarde du serveur conserve l’étagère de livrables et ses copies, mais ne transporte pas ces repères de lecture sur un autre navigateur.

Le classement local, les noms personnalisés et le masquage des conversations natives sont enregistrés dans `data/conversation-locations.json`. Ce fichier fait partie de la sauvegarde du compagnon : restaurer uniquement les données Bionic ne restaure pas ces choix. Les conversations web portent directement leur nom et leur projet de destination dans `data/chats/`. Aucun de ces changements ne déplace ni ne supprime les fichiers des projets.

La suppression d’une conversation web n’a pas de fonction d’annulation dans l’interface. Faites une sauvegarde privée si vous souhaitez pouvoir retrouver son historique. Les copies de livrables conservées dans `data/workspace/` survivent à la suppression du chat source. Supprimer une conversation native la masque seulement dans le compagnon ; son historique original reste géré par Bionic.

## Faire une sauvegarde cohérente

1. Attendez la fin des réponses et des enregistrements. Refusez les propositions de script en attente et attendez la fin des scripts exécutés, puis arrêtez le compagnon avec `Arreter.cmd`.
2. Copiez `data/`, `config.local.json` et `ACCES-PRIVE.txt` dans un emplacement privé.
3. Sauvegardez séparément les dossiers de projets et les données Bionic selon votre pratique habituelle.
4. Protégez cette copie comme vos documents originaux : elle peut contenir leurs textes, leurs images et leurs anciennes versions.

`runtime/` est recréé au démarrage et ne doit pas être restauré depuis un autre PC.

Avec les certificats, une copie complète de `data/` contient aussi l’autorité
privée, le registre des appareils et le plancher de sécurité. C’est une
sauvegarde d’identité sensible : la protéger comme une clé, séparément des
sauvegardes ordinaires de conversations. `scripts/deploy-local.mjs` exclut cette
identité et les exports clients de sa sauvegarde de sources/données ; l’identité
active reste sur la cible et son empreinte est contrôlée après mise à jour.
Pour restaurer seulement des conversations, recopier leurs sous-dossiers dans
l’installation existante sans remplacer `data/security/` ni le plancher.
Une restauration manuelle complète d’un ancien `data/` peut restaurer d’anciens
droits et certificats : elle reste une intervention explicite du propriétaire
du PC, hors garantie de non-recul applicative. Ne pas revenir à une version qui
ignore la gestion des certificats. Voir le [guide certificats](certificats-utilisation.md).

Une approbation en attente n’est pas un travail à relancer après restauration : au redémarrage du serveur elle expire, un script précédemment en cours est marqué interrompu et les messages en attente ne sont pas rejoués. Vérifiez les fichiers avant de proposer une nouvelle exécution ; une interruption du processus ne prouve pas qu’il n’a rien modifié.

Une intention de mutation directe restée sans reçu est marquée **Opération à vérifier** après redémarrage. Les copies proposées sont des pistes à examiner, pas la preuve d’un succès ni une transaction à reprendre. Leur téléchargement préserve la version disponible ; vérifiez aussi le fichier actuel avant toute restauration manuelle.

## Installer une nouvelle version

À partir de 1.9.0, les installations extraites d'un ZIP peuvent accepter une [mise à jour proposée](mises-a-jour.md), après vérification au démarrage et toutes les 24 heures de fonctionnement. Le refus d'une version est mémorisé et aucune installation ne commence sans confirmation. La première installation de ce mécanisme depuis 1.8.0 reste manuelle ; les instructions ci-dessous restent utilisables pour une mise à jour ou une récupération manuelle.

Choisissez le ZIP construit et les notes de la [Release souhaitée](https://github.com/Shaft1942/bionic_local_server/releases). Si vous partez de 1.8.0, l'installation initiale du vérificateur de mises à jour demande cette procédure manuelle. Conservez votre installation précédente et ses données privées avant la mise à jour. Le numéro dans les sources ne suffit pas à identifier une Release : vérifiez aussi son tag et le résultat du workflow. Voir [le guide de publication](publication.md).

1. Faites la sauvegarde précédente.
2. Téléchargez la nouvelle archive depuis les [Releases](https://github.com/Shaft1942/bionic_local_server/releases) et extrayez-la dans un nouveau dossier.
3. Consultez le [journal des versions](../CHANGELOG.md). Comparez le nouveau `config.example.json` avec votre configuration privée sans recopier vos secrets dans l’exemple.
4. Copiez vos `data/`, `config.local.json` et `ACCES-PRIVE.txt` dans le nouveau dossier. Ne remplacez pas votre `data/config.json` par celui d’une autre installation.
5. Arrêtez l’ancien serveur, puis lancez le nouveau. Vérifiez l’ouverture du chat, les projets et un fichier sans importance avant de reprendre un travail.
6. Conservez temporairement l’ancien dossier arrêté pour revenir en arrière si nécessaire.

Avant de déplacer l’installation, utilisez `Retirer-autorisation-reseau.cmd` dans l’ancien dossier si vous y aviez créé une autorisation. La règle dépend du dossier : recréez-la volontairement dans le nouveau si nécessaire. Les adresses sont rafraîchies au démarrage. Les sessions de connexion ne sont pas conservées lors du redémarrage : utilisez votre code habituel.

**Ne récupérez jamais de code d’accès ou de dossier `data/` depuis GitHub.** Une archive publique doit démarrer sans ces fichiers et générer un code propre à chaque installation.

## Renouveler un code perdu ou divulgué

Pour simplement déconnecter les sessions, exécutez **Deconnecter-appareils.cmd** depuis le dossier du serveur actif, ou `node scripts/revoke-sessions.mjs` depuis ce dossier. Le lanceur `.ps1` correspondant est également fourni. L’utilitaire vérifie l’identité de l’instance sur la boucle locale, utilise son secret local sans l’afficher et invalide **toutes les sessions en mémoire**, sans interrompre générations, files ou accords. Pour révoquer le certificat d’un appareil particulier en mTLS, utiliser **Certificats.cmd → Retirer un appareil** ; cela refuse son identité et ferme ses connexions sans retirer les autres appareils.

**Aux niveaux HTTP et HTTPS, un appareil connaissant encore le code peut se reconnecter.** En mTLS, son certificat doit aussi être autorisé. La déconnexion globale ne change ni le code ni le registre des certificats. Pour un code divulgué, suivez la rotation ci-dessous ; pour recommencer tout le parcours de confiance, utiliser la réinitialisation locale explicite de **Certificats.cmd**, serveur arrêté. La déconnexion de l’interface efface les brouillons durables du navigateur concerné ; l’utilitaire local ne garantit pas l’effacement instantané du stockage des appareils distants.

Cette procédure renouvelle aussi le secret d’administration local et déconnecte les sessions.

1. Arrêtez le serveur et faites une sauvegarde privée de `data/`.
2. Déplacez **uniquement `data/config.json` et `ACCES-PRIVE.txt`** vers un emplacement privé hors du dossier du compagnon. Ne supprimez pas `data/chats/`, les pièces jointes ou les sauvegardes de fichiers.
3. Redémarrez : de nouveaux fichiers d’authentification et un nouveau code sont créés.
4. Vérifiez le nouveau code, puis protégez ou éliminez les anciennes copies contenant l’ancien code selon vos besoins de sauvegarde.

Ne confondez pas `data/config.json` avec `config.local.json`. Le premier contient l’authentification générée ; le second vos réglages de connexion.

## Revenir à la version précédente

Arrêtez le nouveau serveur avant de lancer l’ancien. Si une version future annonce un changement de format des données, restaurez également sa sauvegarde compatible au lieu de mélanger des formats. Les fichiers de projet déjà modifiés ne sont pas annulés par un retour de version du programme : restaurez-les séparément si nécessaire.
