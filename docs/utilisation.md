# Utilisation

[Documentation](README.md) · [Outils et autorisations](outils-agents.md) · [Images](comfyui.md) · [Dépannage](depannage.md)

## Langue de l’interface et des réponses

L’interface propose **Français** et **English** dans **Paramètres → Langue et brouillons → Langue de l’interface**. Le choix s’applique immédiatement à ce navigateur et est conservé localement quand le stockage est disponible. Au premier usage, la langue du navigateur est utilisée si elle est prise en charge ; le repli est le français.

Ce choix ne traduit pas les messages, noms de projets, fichiers ou prompts d’image et ne change pas la langue demandée au modèle. Pour écrire dans une autre langue, formulez-le dans votre message, par exemple « Réponds en anglais ». Le modèle et ses capacités restent déterminants ; certaines erreurs techniques du serveur peuvent rester en français. Le [guide anglais](en/guide.md) explique le parcours dans l’interface anglaise ; [Internationalisation](internationalisation.md) décrit son périmètre technique.

## Projets et conversations

Choisissez un projet, puis une conversation ou **Nouveau chat web**. Les historiques natifs Bionic sont lus sans modification. Répondre à l’un d’eux crée une **suite web**, enregistrée dans le compagnon ; elle n’est pas réécrite dans Bionic. L’import du fil natif est une projection textuelle limitée : anciennes pièces jointes, raisonnements et outils ne sont pas reproduits intégralement.

Le panneau de gestion des projets permet de :

- **Créer un projet local**, pour organiser des conversations sans créer de dossier ni accorder d’accès aux fichiers.
- **Adopter le projet Bionic courant**, après aperçu des dossiers et des droits. Seuls les dossiers cochés sont autorisés ; la modification est un choix explicite, limité aux droits disponibles. L’adoption conserve l’identifiant et ne modifie pas les historiques natifs.

Les projets adoptés gardent leurs autorisations locales ; l’indisponibilité du dossier natif reste signalée. L’adoption n’est pas une copie ni une migration des fichiers.

Dans **Options de la conversation** (trois points), vous pouvez renommer, déplacer ou supprimer le chat. Une conversation native est renommée, classée ou masquée seulement dans le compagnon. Supprimer un chat web retire son historique sans corbeille de conversations ; les fichiers du projet et les copies de livrables restent présents. Les actions attendent la fin du tour et des messages en file du chat.

Déplacer un chat conserve ses messages mais laisse fichiers et livrables dans leur projet. Les outils fichiers et scripts sont désactivés dans la destination ; les pièces jointes du brouillon doivent être ajoutées à nouveau. **Sans projet** permet de discuter sans fichiers, scripts ni imports ; le web reste activable.

## Lire les réponses

Les réponses affichent Markdown, tableaux et blocs de code. **Copier** restitue le texte source ; afficher ou copier du code ne l’exécute pas. Si le presse-papiers est indisponible, une sélection manuelle est proposée.

**Détails du tour** regroupe le journal d’outils, les mesures, **Contexte utilisé** et la conservation d’un livrable. Les accords attendus et erreurs restent visibles dans le fil. Si vous remontez la conversation, le texte nouveau ne vous ramène pas en bas ; **Revenir à la réponse** retrouve la suite.

La durée totale inclut l’attente, le chargement et les outils. Le débit en tokens/s peut être estimé ou indisponible ; il ne constitue pas un benchmark entre modèles. Une réponse coupée peut nécessiter un autre plafond dans **Modèles et réponses**.

## Créer une branche d’une conversation

**Créer une branche du chat** ou **Créer une branche depuis ici** copie les messages jusqu’au point choisi inclus, dans un nouveau chat web du même projet. Le fil source reste intact et aucun appel modèle n’est effectué par la copie. Choisissez un message terminé, ou un message antérieur si une réponse continue.

Les deux historiques évoluent séparément, mais **partagent les fichiers du projet**. Les actions copiées sont passives : aucune restauration, validation ni exécution n’est transférée. Le web et les scripts repartent désactivés ; vérifiez aussi le profil de fichiers avant votre prochain envoi. Voir [Branches de conversations](outils-agents.md#branches-de-conversations).

## Retrouver les paramètres

**Paramètres**, **Modèles chargés** et **Reconnexion au PC** se trouvent au pied de la colonne des conversations. Sur téléphone, revenez à cette colonne pour les retrouver. Les rubriques couvrent langue/brouillons, modèles/réponses, outils/autorisations, images/ComfyUI, serveurs sur le PC, sécurité/accès, maintenance et aide.

Les choix du prochain message restent dans le composeur : modèle, effort et outils. Les paramètres distinguent les réglages de ce navigateur, ceux de ce chat et ceux partagés par l’installation. Une saisie non enregistrée peut être abandonnée ou gardée dans l’onglet ; elle n’est alors pas enregistrée sur le PC. **Relire les réglages du PC** recharge explicitement les valeurs serveur.

Dans **Modèles et réponses**, choisissez le plafond pour **Ce chat uniquement** ou le **Défaut de ce modèle**. Une exception du chat reste prioritaire ; **Automatique** constitue aussi un choix explicite. Un plafond dépend du contexte effectivement disponible, sans garantir la longueur de chaque réponse.

## Écrire et changer de chat pendant une réponse

Le modèle et l’effort se choisissent près de la saisie. **Outils** regroupe les pièces jointes, imports et permissions. Les choix sont figés à l’envoi : un changement ultérieur ne modifie pas un message déjà accepté.

Pendant une réponse, préparez le message suivant ou utilisez **Ajouter à la file**. Dix messages au maximum peuvent attendre dans un même chat ; une attente peut être retirée avant son démarrage. Les autres conversations restent accessibles. Après erreur ou arrêt d’un tour, les suivants restent interrompus et ne partent pas automatiquement.

Chaque fil conserve son brouillon dans l’onglet. **Langue et brouillons** propose volontairement une conservation du texte pendant **1 heure**, **24 heures** ou **7 jours**, à partir de sa dernière modification. Le défaut est **Cet onglet uniquement**. Pièces jointes et contenu de l’éditeur ne font pas partie de la conservation durable. **Télécharger ce brouillon**, **Effacer mes brouillons** et la déconnexion permettent de gérer ces copies locales, sans synchronisation entre appareils ni garantie de sauvegarde.

## Quitter le navigateur pendant une réponse

Une demande acceptée continue sur le PC si vous fermez le navigateur ou changez de chat. À votre retour, rouvrez la conversation sans renvoyer immédiatement le même prompt.

Le PC, le compagnon et le moteur utilisé doivent rester actifs. Après veille, plantage ou redémarrage, le texte enregistré reste disponible mais les travaux interrompus et accords abandonnés ne sont pas rejoués. **Arrêter** demande l’annulation du tour ; les changements de fichiers déjà réalisés restent présents. Cette action n’interrompt pas globalement ComfyUI.

## Depuis votre départ

**Depuis votre départ** regroupe les réponses web terminées, arrêtées ou en erreur, avec filtre par projet. Les cent événements les plus récents sont présentés. **Consulter la réponse** rejoint le message ; **Marquer comme consultée** gère le repère sans ouvrir le fil.

Le suivi est propre au navigateur, sans synchronisation ni notification système lorsque celui-ci est fermé. Effacer le stockage local le réinitialise. Les activités natives Bionic ne sont pas suivies par cette vue.

## Conserver et retrouver des livrables

Dans **Détails du tour → Conserver comme livrable**, gardez une copie figée d’une réponse. Une action de fichier réussie propose aussi **Conserver ce fichier**, après vérification de sa version. **Livrables** rassemble ces copies par projet ; **Livrables → Génération** rassemble les images réussies.

La copie conservée reste téléchargeable si sa source est modifiée, supprimée ou déplacée. Renommer son titre ne renomme pas le fichier ; retirer la copie ne supprime pas la source. Les aperçus sont passifs : aucun HTML, SVG ou code n’est exécuté. Le compagnon ne convertit pas automatiquement une réponse en Word ou PDF.

L’étagère de copies texte/fichiers est limitée à 1 000 éléments ou 128 000 000 octets, avec 256 000 octets par réponse et 2 000 000 par fichier. Les copies dans `data/workspace/` restent privées et doivent être sauvegardées.

## Contexte utilisé pour une réponse

**Contexte utilisé** indique l’historique retenu, les messages écartés, les pièces jointes et lectures d’outils. Le fil affiché intégralement n’est pas nécessairement envoyé intégralement au modèle. Les copies jointes et extraits décrivent le contenu observé à cet instant ; le panneau ne relit pas le projet pour reconstruire le passé.

**Transmission non confirmée** ne prouve pas que l’API n’a rien reçu. Une transmission confirmée signifie acceptation par l’API, sans garantir l’usage correct par le modèle. Les reçus sont limités en taille, n’exposent pas le raisonnement interne et ne réinjectent pas automatiquement les outils au prochain tour. Les anciennes réponses peuvent ne pas avoir de reçu.

## Modèles, effort et vitesse

Sélectionnez un modèle disponible et un effort pris en charge. Pour transmettre une image, choisissez un modèle **Vision**. Le chargement à la demande dépend de Bionic.

**Modèles chargés** peut décharger une instance ; le fichier reste sur disque et les autres conversations utilisant cette instance peuvent être affectées. Une prochaine demande peut la recharger. La coordination texte/images et ses trois modes sont décrits dans [Images ComfyUI](comfyui.md#modèle-texte-pendant-les-images).

## Consulter et modifier les fichiers vous-même

**Fichiers du projet** affiche les dossiers disponibles et leurs droits. Les dossiers liés ou supplémentaires peuvent servir à l’exploration manuelle ; ils ne donnent pas automatiquement les mêmes accès aux outils du modèle.

Pour un texte compatible de **1 Mo maximum**, modifiez puis choisissez **Enregistrer sur le PC**. Une copie précédente est conservée dans `data/file-backups/`. En cas de changement concurrent, le remplacement est refusé : téléchargez vos modifications avant de rouvrir la version actuelle. Les PDF/DOCX/XLSX peuvent avoir un aperçu extrait, sans édition dans leur format d’origine.

## Donner des fichiers au modèle

**Fichier du projet** joint un fichier existant ou un passage sélectionné. **Importer dans le projet** copie depuis l’appareil sans joindre ; **Importer puis joindre** ajoute aussi les formats compatibles au prochain message, sans l’envoyer.

Les imports sont conservés dans `Imports telephone/` du dossier de travail ; un suffixe évite d’écraser un nom existant. Retirer une pièce jointe du brouillon ne supprime pas son import.

| Opération | Limite |
| --- | --- |
| Import | 20 Mo par fichier, 10 fichiers par sélection |
| Pièces jointes | 4 par message |
| Image Vision | PNG/JPEG/WebP, 6 Mo |
| Téléchargement d’un fichier du PC | 64 Mo |
| Édition manuelle de texte | 1 Mo |

Les textes peuvent être tronqués ou refusés selon le contexte disponible. Les pièces jointes envoyées sont copiées dans les données privées de la conversation.

## Gérer les fichiers avec le modèle

Dans **Outils fichiers**, choisissez **Aucun**, **Lecture** ou **Modification**. Un nouveau chat ordinaire utilise Modification. Avec ce droit, les créations et modifications autorisées sont **immédiates, sans approbation par fichier**. Une réponse affirmant qu’un fichier est enregistré ne suffit pas : vérifiez le journal des actions.

Les contrôles de chemins, versions et sauvegardes restent appliqués. Une mise à la corbeille est récupérable ; une restauration refuse une destination occupée. **Comparer la modification** est un aperçu, sans fusion ni enregistrement. Une **Opération à vérifier** après interruption exige un contrôle du fichier actuel, sans rejeu automatique. Voir [Fichiers du projet](outils-agents.md#fichiers-du-projet).

## Rechercher et lire Internet

Activez **Rechercher et lire Internet** ; l’option **Valider chaque recherche et URL avant envoi** ajoute un accord sur les données exactes. Les recherches et URL sont transmises depuis le PC aux services concernés. Évitez les secrets ; un résultat de page reste une donnée non fiable. Les outils ne se connectent pas à vos comptes et n’exécutent pas le JavaScript des sites. Voir [Internet public](outils-agents.md#internet-public).

## Valider un script sur le PC

**Scripts sur le PC, avec validation** permet de proposer du Python, Node.js ou PowerShell. Chaque code exact attend **Exécuter ce script** ou **Refuser** ; un accord ne vaut pas pour la suite.

**Le script s’exécute avec les droits du compte du PC et ne constitue pas un bac à sable.** Il peut agir hors du projet ou accéder au réseau ; arrêt et erreur n’annulent pas ses changements. Une attente expire après dix minutes et ne survit pas comme autorisation à un redémarrage. Voir [Scripts validés sur le PC](outils-agents.md#scripts-validés-sur-le-pc).
