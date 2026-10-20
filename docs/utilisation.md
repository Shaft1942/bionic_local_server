# Utilisation

[Retour au README](../README.md)

## Projets et conversations

Choisissez un projet dans la liste. Les conversations natives de Bionic sont consultées en lecture seule. Le bouton d’actualisation permet de retrouver les changements faits dans Bionic.

Si vous répondez à une conversation native, le compagnon crée une **suite web**. Cette suite est enregistrée sur le PC dans `data/chats/`, puis reste accessible depuis ce compagnon. Elle n’est pas réécrite dans l’historique natif Bionic. Les pièces jointes, raisonnements et actions internes d’une ancienne conversation ne sont pas reproduits intégralement : le compagnon importe une projection textuelle des messages visibles, soumise à des limites de taille.

Vous pouvez aussi commencer un nouveau chat dans le projet sélectionné. Le modèle reçoit un historique limité pour respecter son contexte ; l’affichage du fil complet ne garantit pas que chaque ancien message soit transmis au modèle à chaque demande.

## Déplacer une conversation

Ouvrez le chat, puis le bouton **Options de la conversation** (les trois points dans l’en-tête). Choisissez le projet dans **Déplacer la conversation vers**, ou **Sans projet**, puis validez avec **Déplacer**. Le chat s’ouvre dans sa destination. Le classement est enregistré sur le PC ; actualisez les autres navigateurs pour retrouver le changement.

Les conversations web conservent leur identifiant, leurs messages et leurs reçus de contexte. Pour une conversation native Bionic, le compagnon mémorise seulement son classement : l’original reste à sa place et continue d’être lu sans modification dans Bionic. Une réponse à ce fil crée toujours une suite web. Le groupe Sans projet est proposé même si Bionic n’en fournit pas ; un groupe local déjà utilisé reste accessible si un groupe natif apparaît ensuite.

Le déplacement attend la fin de la réponse et des messages en file de ce chat. Les autres conversations peuvent continuer. Le texte du brouillon est conservé ; ses pièces jointes non envoyées sont retirées pour éviter de réinterpréter leurs chemins dans le nouveau projet. Joignez-les à nouveau si nécessaire. L’autorisation de modification est désactivée après un déplacement : réactivez-la explicitement dans le projet cible si vous souhaitez utiliser ses outils. Sans projet permet de discuter, avec les outils et l’import de fichiers désactivés.

Les fichiers et livrables déjà conservés restent dans leur projet. Les anciennes actions de fichiers ne peuvent pas être rejouées ou épinglées depuis un autre projet. Les pièces jointes déjà enregistrées dans l’historique gardent leur contenu figé ; elles peuvent encore faire partie du contexte de la conversation, sans relire le dossier d’origine. Les nouveaux reçus identifient leur projet d’origine lorsqu’il est connu. Les copies de livrables existantes restent téléchargeables dans leur étagère ; pour retrouver un message déplacé dont l’ancien lien ne fonctionne plus, ouvrez le chat dans son nouveau projet.

L’aide **Comment fonctionne ce compagnon ?** se ferme directement avec la croix en haut à droite de son panneau, ou avec la touche **Échap**. La croix reste visible lorsque vous faites défiler le texte ; il n’est pas nécessaire de rouvrir le menu des options.

## Renommer ou supprimer une conversation

Ouvrez **Options de la conversation** (les trois points), puis **Renommer**. Saisissez un nom de 1 à 120 caractères et enregistrez. Le nom est conservé sur le PC et apparaît après actualisation sur les autres appareils. Renommer conserve les messages, le brouillon et ses pièces jointes. Pour une conversation native, seul le nom affiché dans le compagnon change : son nom et son contenu restent intacts dans Bionic.

Dans le même menu, **Supprimer** demande une confirmation. Une conversation web est supprimée du compagnon, avec ses messages et son brouillon sur l’appareil utilisé. Il n’y a pas de corbeille dans l’interface. Une conversation native est seulement masquée dans le compagnon ; elle reste disponible dans Bionic. Le masquage persiste après actualisation et redémarrage du serveur. Une suite web déjà créée reste une conversation distincte et n’est pas supprimée avec son fil natif.

La suppression ne touche ni les fichiers du projet, ni les imports, ni les copies de livrables déjà conservées. Ces copies restent téléchargeables, mais leur lien vers le message d’origine peut ne plus aboutir. Les brouillons encore présents dans un autre navigateur ne sont pas effacés à distance.

Le renommage et la suppression sont indisponibles pendant une réponse ou tant que ce chat a des messages en attente. Attendez leur fin ou arrêtez la réponse et retirez les attentes avant de recommencer. Les autres chats peuvent continuer à répondre.

## Écrire et changer de chat pendant une réponse

Sur téléphone, le modèle et l’effort se choisissent côte à côte sous le texte. L’envoi se trouve à droite du message ; pendant une réponse, la flèche ajoute le message à la file et le bouton carré arrête la réponse de ce chat. L’aide détaillée de l’effort apparaît quand ce sélecteur est actif et reste associée au champ pour les lecteurs d’écran.

Le menu **Fichiers**, juste au-dessus de la saisie sur téléphone, regroupe **Fichier du projet**, **Importer un fichier** et l’autorisation de modification par le modèle. Son libellé indique toujours si les modifications sont autorisées ou désactivées. Le panneau s’ouvre au-dessus du bouton et se ferme avec un nouvel appui, un appui ailleurs ou la touche Échap. Les pièces jointes et le suivi d’import restent visibles hors du menu. Sur bureau, les trois commandes restent directement accessibles.

La zone de saisie reste disponible pendant la génération. Vous pouvez préparer le message suivant sans interrompre le modèle. **Ajouter à la file** transmet ce message au serveur du PC : il attend la fin du tour précédent dans la même conversation. Un message en attente peut être retiré avant son démarrage. La file accepte au maximum dix messages en attente par conversation.

Le modèle, l’effort, les droits de modification et les pièces jointes sont ceux choisis au moment de l’envoi. Les pièces jointes sont copiées à cet instant ; les modifier ensuite sur le PC ne change pas silencieusement la demande déjà acceptée. L’historique transmis au modèle est construit lorsque le tour commence, pour inclure la réponse précédente.

**Nouveau chat web**, les projets et les conversations restent accessibles pendant les réponses. Chaque fil conserve son brouillon et ses pièces jointes en préparation. Les brouillons sont stockés dans la session de cet onglet du navigateur : ils survivent à un rechargement, mais leur conservation après fermeture de l’onglet dépend du navigateur. Ils ne sont pas synchronisés entre appareils et ne sont jamais envoyés automatiquement.

Les demandes reçues continuent sur le PC lorsque vous consultez un autre fil ou fermez le navigateur. Les conversations ont des historiques distincts, mais partagent la puissance de calcul et, selon le projet, les fichiers. Plusieurs chats peuvent soumettre des demandes ; le parallélisme réel dépend de Bionic et du modèle. Les protections contre les écritures concurrentes restent actives.

Si vous arrêtez la réponse ou si elle échoue, les messages suivants restent conservés mais sont interrompus : ils ne partent pas automatiquement après un tour incomplet. Les autres chats continuent.

Après un redémarrage du serveur, les générations et attentes abandonnées sont affichées comme interrompues. Elles ne sont pas exécutées automatiquement : relisez le fil et renvoyez la demande souhaitée.

## Depuis votre départ

Le bouton **Depuis votre départ**, dans la liste des conversations ou l’en-tête du chat sur téléphone, ouvre les réponses web terminées, arrêtées ou en erreur. Vous pouvez filtrer par projet ou voir tous les projets. Seuls les cent événements les plus récents sont présentés.

Le compteur est propre à cet appareil et à cette installation du serveur. Au premier usage, le suivi commence à cet instant ; les événements antérieurs restent consultables sans être comptés comme nouveaux. Ouvrir le panneau ne marque aucune réponse comme consultée. **Consulter la réponse** rejoint le message exact et le marque après une ouverture réussie ; vous pouvez aussi choisir **Marquer comme consultée** sur un élément.

Ce repère est conservé dans le stockage local du navigateur, sans texte de conversation. Il n’est pas synchronisé entre appareils. Effacer ce stockage réinitialise le suivi. Le compteur se met à jour périodiquement lorsque la page est ouverte ; il ne s’agit pas d’une notification système quand le navigateur est fermé.

Les anciens messages sans date de fin enregistrée ne reçoivent pas de date inventée et n’apparaissent pas comme des nouveautés. Après un redémarrage du serveur, **Interruption constatée** indique la date à laquelle le compagnon a découvert la génération interrompue, qui peut être postérieure à l’arrêt réel du PC. L’activité des conversations natives de Bionic n’est pas suivie par cette vue.

## Conserver et retrouver des livrables

Sous une réponse enregistrée, ouvrez **Conserver comme livrable**, ajustez le titre puis choisissez **Conserver la copie figée**. Une création ou modification de fichier confirmée propose aussi **Conserver ce fichier**. Ce dernier choix vérifie que le fichier du PC correspond encore à la version produite par l’action ; un changement intervenu entre-temps provoque un refus explicite.

Ouvrez **Livrables** dans la liste des conversations, ou l’onglet correspondant depuis **Depuis votre départ**. Les copies sont séparées par projet. Chaque élément garde son origine et sa date de conservation. **Ouvrir la copie** permet de consulter son aperçu et de la télécharger, de renommer son titre, de revenir au message d’origine ou de la retirer de l’étagère.

La copie est indépendante de la source :

- Le fichier actuel peut être identique, modifié, absent ou momentanément inaccessible ; cet état est indiqué dans le détail.
- **Télécharger la copie** restitue les octets conservés, même si le fichier source a changé ou a disparu.
- **Télécharger le fichier actuel du PC**, lorsqu’il est disponible, est une action distincte.
- Renommer le titre ne renomme pas le fichier d’origine. Retirer un livrable supprime seulement sa fiche et sa copie privée, jamais le texte du chat ni le fichier du projet.

L’aperçu est passif : un contenu HTML, SVG ou du code n’est pas exécuté. Les réponses sont téléchargées en texte ; les fichiers conservent leur nom et leurs octets. Un aperçu long est limité à 12 000 caractères, avec une indication permettant de télécharger la copie complète. Le compagnon ne transforme pas automatiquement une réponse en document Word ou PDF.

Les limites de l’étagère, pour toute l’installation, sont de **1 000 livrables ou 128 000 000 octets**, de **256 000 octets par réponse** et de **2 000 000 octets par fichier**. Un dépassement est refusé sans tronquer silencieusement la copie. Les copies et leurs fiches sont enregistrées dans `data/workspace/` et font partie des données privées à sauvegarder. Une copie identique déjà épinglée depuis la même source est réutilisée.

## Contexte utilisé pour une réponse

Ouvrez **Contexte utilisé** sous une nouvelle réponse assistant. Le reçu indique l’historique retenu, les messages écartés, les pièces jointes sélectionnées et les lectures réussies par les outils. Les extraits d’outils conservent le texte observé, sa position et l’empreinte du fichier au moment de la lecture. Ce panneau ne relit pas les fichiers du projet pour reconstruire le passé.

Pour un message en attente, le reçu est construit lorsque son tour commence : il peut alors inclure la réponse précédente. Il évolue avec les lectures d’outils et reste accessible après rechargement. Les pièces jointes appartiennent aux copies enregistrées lors de l’envoi, pas au fichier qui aurait été modifié ensuite sur le PC.

**Transmission non confirmée** signifie que le compagnon n’a pas obtenu de confirmation de l’API ; ce n’est pas une preuve que la requête n’a jamais été reçue. Une transmission confirmée indique une requête acceptée, sans garantir que le modèle a correctement utilisé chaque élément. Une lecture d’outil peut avoir réussi sur le PC alors que son résultat n’a pas encore été confirmé dans une requête au modèle.

Le reçu ne révèle pas le raisonnement interne. Il décrit l’historique, les pièces jointes et les extraits ; les consignes du compagnon et les définitions des outils autorisés s’ajoutent à ces éléments. Les aperçus de pièces jointes sont courts ; leur message d’origine permet de retrouver la copie jointe. Aucun nombre exact de tokens n’est déduit du nombre de caractères. Une ancienne réponse sans reçu affiche **Relevé indisponible**.

## Modèles, effort et vitesse

Sélectionnez un modèle disponible dans la liste. Le chargement à la demande dépend du réglage Bionic. Pour une image PNG, JPEG ou WebP, choisissez un modèle portant la mention **Vision**.

Le champ **Effort** présente les choix pris en charge pour le modèle. Un niveau plus élevé peut prendre davantage de temps ou de contexte. L’application conserve une option par défaut et n’invente pas de prise en charge pour un modèle inconnu.

Les mesures de tokens, durée et tokens/s s’affichent lorsqu’elles peuvent être calculées ou sont fournies par l’API. Elles ne constituent pas un benchmark comparable entre tous les modèles ; une demande avec plusieurs étapes d’outils peut ne pas avoir de vitesse globale affichée.

Dans **Modèles chargés**, vous pouvez décharger une instance. Son fichier reste sur le disque. L’action peut affecter les autres conversations Bionic utilisant cette instance. Un prochain message peut recharger le modèle si Bionic autorise le chargement à la demande.

## Quitter le navigateur pendant une réponse

Après l’envoi, le serveur du PC poursuit la génération même si vous fermez le navigateur ou verrouillez le téléphone. À votre retour, rouvrez l’application et la conversation : l’état et la réponse sont récupérés sans renvoyer le même prompt.

Le PC, Bionic et le serveur doivent rester actifs. Une mise en veille, un arrêt du serveur, un plantage ou l’arrêt du modèle peuvent interrompre la réponse. Le texte déjà enregistré reste disponible ; une génération interrompue par l’arrêt du serveur n’est pas relancée automatiquement. **Arrêter** dans le chat demande l’annulation des étapes restantes ; les changements de fichiers déjà réalisés sont conservés.

## Consulter et modifier les fichiers vous-même

Ouvrez **Fichiers du projet**. Les dossiers disponibles proviennent du dossier de travail du projet Bionic, de ses liens enregistrés et, si vous en avez configuré, de dossiers supplémentaires explicites.

Les droits d’écriture des dossiers liés sont repris de Bionic. Un dossier supplémentaire est partagé entre les projets visibles dans le compagnon : ajoutez-en uniquement si cela vous convient. Certains fichiers techniques ou sensibles et les liens de fichiers sont masqués ou bloqués ; le compagnon n’est pas un explorateur complet de votre PC.

Pour un texte compatible :

1. Ouvrez le fichier, modifiez son contenu et choisissez **Enregistrer sur le PC**.
2. Une copie précédente est conservée dans `data/file-backups/`. Le bouton d’annulation proposé permet de rétablir la version sauvegardée, tant qu’aucune autre modification du fichier ne crée de conflit.
3. Si le fichier a changé sur le PC, l’application refuse d’écraser la nouvelle version. Téléchargez vos changements, puis rouvrez le fichier pour les rapprocher de la version actuelle.

Les formats texte et de code reconnus sont éditables dans la limite de **1 Mo**. Les PDF, DOCX et XLSX peuvent fournir un aperçu textuel si l’extraction est installée, mais ne sont pas édités dans leur format d’origine. Un fichier peut rester téléchargeable même sans aperçu.

## Donner des fichiers au modèle

**Fichier du projet** permet de joindre un fichier déjà présent. Pour un texte, vous pouvez sélectionner seulement le passage utile dans l’éditeur avant de le joindre. **Importer un fichier** ouvre le sélecteur de votre téléphone ou ordinateur.

L’import copie les fichiers dans **`Imports telephone/`**, à l’intérieur du dossier de travail du projet sélectionné. Un nom déjà utilisé reçoit un suffixe : l’import n’écrase pas le fichier existant. Le fichier importé reste dans le projet même si vous retirez sa pièce jointe du message ou n’envoyez pas le message.

| Opération | Limite |
| --- | --- |
| Import depuis l’appareil | 20 Mo par fichier, 10 fichiers par sélection |
| Pièces jointes d’un message | 4 maximum |
| Image transmise à un modèle Vision | PNG, JPEG ou WebP, 6 Mo maximum |
| Téléchargement d’un fichier du PC | 64 Mo maximum |
| Modification d’un texte | 1 Mo maximum |

Les formats exploitables sont joints automatiquement dans la limite disponible. Un format non pris en charge peut être importé et conservé sans devenir une pièce jointe utilisable par le modèle. Un texte joint peut être tronqué ou refusé s’il dépasse les budgets du message ou du modèle.

Les images et les textes joints sont conservés avec la conversation pour que leur contenu ne change pas silencieusement si le fichier du projet évolue ensuite. Cela représente une copie supplémentaire de données privées dans `data/`.

## Laisser le modèle modifier les textes

L’option **« Le modèle peut modifier les textes du projet »** est cochée par défaut dans un nouveau chat et mémorisée dans la conversation. Lorsqu’elle est cochée, le modèle peut :

- Lister un dossier et lire des extraits de textes pertinents.
- Créer un fichier texte ou de code dans le dossier de travail du projet.
- Remplacer un passage exact et unique déjà lu ou explicitement donné dans votre message.
- Réécrire entièrement un fichier seulement après l’avoir lu en totalité dans la demande.

**L’enregistrement est immédiat : il n’y a pas de demande d’approbation pour chaque modification.** Les actions apparaissent sous la réponse avec leur résultat. Une modification réussie offre une restauration de la copie précédente lorsque la version du fichier le permet. Une création ne supprime pas automatiquement le nouveau fichier lors d’une restauration.

Exemple de demande ciblée : « Dans `notes.md`, trouve le paragraphe sur les délais et remplace la date du 12 par le 15. Ne modifie rien d’autre. »

Les outils du modèle sont limités au **dossier de travail du projet**. Ils ne peuvent pas exécuter de commande, supprimer un fichier ou utiliser automatiquement les outils MCP de Bionic. Les dossiers supplémentaires et liés peuvent être parcourus manuellement selon leurs droits, mais ne deviennent pas une permission générale pour l’agent.

Le modèle ne reçoit pas d’emblée le contenu de tous les fichiers. Les lectures par outil sont limitées à **3 000 caractères par extrait**, **6 fichiers distincts** et un budget total dépendant du contexte du modèle, plafonné à **12 000 caractères par demande**. Les extraits lus par outil ne sont pas automatiquement réinjectés au prochain tour. Les pièces jointes explicites ont leur propre budget de contexte.

Si vous souhaitez seulement discuter, décochez l’option. Si le modèle ne sait pas utiliser les outils ou choisit de ne pas les appeler, aucune modification ne peut être déduite de sa seule réponse : vérifiez le journal des actions et le fichier.
