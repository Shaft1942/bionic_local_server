# Mises à jour proposées

[Maintenance et récupération](sauvegarde-mise-a-jour.md) · [Journal des versions](../CHANGELOG.md)

**Paramètres → Maintenance** permet de vérifier les Releases du dépôt officiel et d’accepter une version compatible. La vérification automatique a lieu au démarrage puis toutes les 24 heures de fonctionnement, si elle est activée. **Aucune installation ne commence sans votre confirmation.** Une archive locale ou un numéro dans les sources ne prouve pas qu’une Release est publiée.

## Choisir

Le canal **Stable**, choisi par défaut, exclut les préversions. **Bêta** ajoute les versions d’essai numérotées `X.Y.Z-beta.N` et accepte aussi les stables plus récentes. Le choix est commun à l’installation et ne télécharge rien. Revenir à Stable attend une stable supérieure ; cela ne réinstalle pas une ancienne version.

| Action | Effet |
| --- | --- |
| **Vérifier maintenant** | Vérifier sans installer ; reste disponible si l’automatique est désactivé |
| **Installer et redémarrer** | Après confirmation, télécharger, vérifier, sauvegarder les sources, installer et redémarrer cette instance |
| **Plus tard** | Masquer l’indication dans cet onglet pour cette session |
| **Ignorer cette version** | Conserver le refus sur le PC pour tous les appareils ; une version ultérieure reste proposable |

Toute personne connectée au compagnon partage ces choix. Avant d’accepter un redémarrage, prévenez les autres utilisateurs de l’installation et enregistrez leurs fichiers ouverts.

## Compatibilité et sauts de versions

La version proposée est la plus récente **compatible et supérieure** : les numéros sont comparés, pas seulement les dates. Par exemple, `2.5.0` succède à `2.5.0-beta.2`. Les versions intermédiaires ne sont pas obligatoires si le manifeste autorise le saut.

Une Release doit fournir le ZIP, `SHA256SUMS.txt` et `update-manifest.json`. Ce manifeste fixe la compatibilité avec la version installée, Node.js, le système et le protocole de mise à jour. Une Release incompatible ou incomplète est écartée ; cela ne garantit pas qu’une installation manuelle fonctionnerait.

L’installation automatique cible **Windows et un dossier extrait du ZIP**, avec Node.js 24+ si le manifeste l’autorise. Un checkout contenant `.git` doit être mis à jour avec Git. Une préversion doit être une bêta numérotée et correctement déclarée. Si les contrôles bornés ne peuvent pas choisir une version avec certitude, une erreur est affichée sans sélection.

## Préservation et arrêt

Conversations, authentification, configuration privée, code d’accès et fichiers de projets sont conservés. Les dossiers de projets ne sont ni migrés ni remplacés. Un travail actif ou incertain empêche l’installation, y compris s’il commence pendant le téléchargement. La préparation ne demande aucune génération ni déchargement du modèle.

Enregistrez les fichiers ouverts avant l’installation. Le texte des brouillons de cet onglet et ses références jointes peuvent être conservés temporairement, au plus trente minutes, puis restaurés après reconnexion à la même instance. Les saisies des autres appareils ne peuvent pas être garanties par le serveur. Fermer le navigateur après acceptation n’annule pas l’installateur lancé sur le PC.

Le contrôle de redémarrage vérifie la version, l’identité et le processus lancé ; une réponse quelconque sur le port ne suffit pas. Aucun processus n’est tué sur la seule base de son numéro de port.

## Sauvegardes, échecs et limites

Faites une **sauvegarde indépendante de vos données et projets**. Les sauvegardes de sources dans `runtime/update-jobs/` ne la remplacent pas et restent privées. La première mise à jour ne dispose pas encore d’empreintes permettant d’identifier toutes les modifications manuelles ; les fichiers remplacés sont copiés exactement. Les mises à jour suivantes peuvent refuser des sources modifiées ou manquantes.

Une archive altérée, un lien, un chemin interdit ou une collision avec un fichier extérieur à la distribution provoque un refus. Le protocole 1 limite les ZIP à 32 Mio et chaque source à 2 Mio ; les archives chiffrées, entrées non prises en charge et changements de casse ne sont pas installés automatiquement.

En cas d’échec d’écriture ou de redémarrage, l’installateur tente de rétablir les anciennes sources et de relancer cette version. Une coupure de courant, un disque plein ou un verrou persistant peut imposer une récupération manuelle : consultez `runtime/update-jobs/<identifiant>/` sur le PC. Un verrou `runtime/update.lock` après arrêt brutal doit être examiné ; ne le supprimez pas pendant une installation active.

Une mise à jour conserve l’identité des certificats et refuse une régression vers un programme qui l’ignorerait. Revenir au programme précédent n’annule pas les changements de fichiers ou de formats de données. Suivez [Sauvegarde et mise à jour](sauvegarde-mise-a-jour.md) pour une installation manuelle ou une récupération.
