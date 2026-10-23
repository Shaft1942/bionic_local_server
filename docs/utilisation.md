# Utilisation

[Retour au README](../README.md)

## Projets et conversations

Choisissez un projet dans la liste. Les conversations natives de Bionic sont consultées en lecture seule. Le bouton d’actualisation permet de retrouver les changements faits dans Bionic.

Les actualisations identiques ne reconstruisent plus les boutons de conversations ; lors d’un changement réel, le focus reste sur le même chat si possible, sinon sur une entrée voisine ou la recherche. Un chat web illisible est laissé intact et un avertissement **Inventaire partiel** accompagne les listes et l’activité accessibles. Une erreur globale du dossier reste une erreur explicite. Voir [la récupération manuelle](depannage.md#une-conversation-web-est-illisible).

Si vous répondez à une conversation native, le compagnon crée une **suite web**. Cette suite est enregistrée sur le PC dans `data/chats/`, puis reste accessible depuis ce compagnon. Elle n’est pas réécrite dans l’historique natif Bionic. Les pièces jointes, raisonnements et actions internes d’une ancienne conversation ne sont pas reproduits intégralement : le compagnon importe une projection textuelle des messages visibles, soumise à des limites de taille.

Vous pouvez aussi commencer un nouveau chat dans le projet sélectionné. Le modèle reçoit un historique limité pour respecter son contexte ; l’affichage du fil complet ne garantit pas que chaque ancien message soit transmis au modèle à chaque demande.

## Lire les réponses

Sous une réponse assistant, **Détails du tour** regroupe le journal d’outils, la création d’une branche, les mesures de génération, **Contexte utilisé** et **Conserver comme livrable**. Ce volet reste fermé tant que vous ne l’ouvrez pas. Les formulaires et volets ouverts sont conservés pendant les actualisations de la conversation. Échap le ferme et ramène le focus sur son titre.

Les validations à traiter, opérations incertaines, interruptions et indicateurs d’action en erreur restent accessibles directement dans le fil. Ouvrir les détails n’exécute aucun outil. Pour un de vos messages, les trois points dans sa bulle donnent accès à ses actions.

Les réponses affichent les titres, listes ordonnées et imbriquées, citations et tableaux Markdown usuels. Les blocs de code portent un langage lorsqu’il est fourni, et **Code proposé** ou **Code fourni** selon l’auteur. **Copier le code** utilise le texte source exact, avec espaces et retours à la ligne ; un bloc non fermé reste signalé et copiable sans lui inventer une fin. Si la copie automatique est indisponible, une sélection manuelle est proposée, avec fermeture directe et Échap. Afficher ou copier du code ne l’exécute pas ; l’accord d’un script reste une action distincte.

Le plafond ordinaire est dans **Détails du tour**. Une réduction liée au contexte ou une réponse coupée reste visible. **Régler le plafond** ouvre le chat courant et le modèle utilisé lorsqu’il a été relevé pendant l’envoi dans cet onglet. Pour une réponse ancienne ou après rechargement, le modèle peut être inconnu : l’interface invite alors à choisir celui du prochain envoi, sans attribuer l’ancienne réponse au modèle actuellement sélectionné.

Si vous remontez dans le fil, les nouveaux fragments ne vous ramènent pas automatiquement en bas. **Revenir à la réponse** retrouve la suite. Une sélection de texte ou un contrôle de code focalisé est conservé ; le corps concerné attend la fin de cette interaction pour afficher ses derniers fragments. Le bouton permet aussi de retrouver la suite immédiatement. Les validations, erreurs et états de la génération continuent de s’actualiser.

## Créer une branche d’une conversation

Choisissez **Créer une branche du chat** dans le menu **Outils**, ou **Créer une branche depuis ici** dans **Détails du tour** d’une réponse ou les trois points de votre message. Le compagnon crée un nouveau chat web contenant les messages jusqu’au point choisi **inclus**. Le fil source reste intact ; aucune demande n’est envoyée au modèle pendant cette copie.

Les suites sont indépendantes : les nouveaux messages ne se synchronisent ni avec la source ni vers Bionic. Les journaux d’outils et les reçus éventuellement copiés sont des traces historiques passives : aucun script, fichier ou restauration n’est rejoué et aucune validation en attente n’est transférée. Le web et les scripts sont désactivés dans la branche ; vérifiez aussi le droit de fichiers avant votre prochain message.

Vous pouvez créer une branche à partir d’un message précédent pendant qu’une réponse continue dans la source. Une réponse assistant en cours ne peut pas servir de point de départ : attendez sa fin ou choisissez un message antérieur. Une branche reste dans le même projet ; **elle partage donc les fichiers du PC**, même si son historique est séparé. **Voir la conversation source** retrouve l’origine disponible sans créer de graphe ; une source indisponible est signalée sans perdre la branche. Voir [les règles des branches](outils-agents.md#branches-de-conversations).

## Déplacer une conversation

Ouvrez le chat, puis le bouton **Options de la conversation** (les trois points dans l’en-tête). Choisissez le projet dans **Déplacer la conversation vers**, ou **Sans projet**, puis validez avec **Déplacer**. Le chat s’ouvre dans sa destination. Le classement est enregistré sur le PC ; actualisez les autres navigateurs pour retrouver le changement.

Les conversations web conservent leur identifiant, leurs messages et leurs reçus de contexte. Pour une conversation native Bionic, le compagnon mémorise seulement son classement : l’original reste à sa place et continue d’être lu sans modification dans Bionic. Une réponse à ce fil crée toujours une suite web. Le groupe Sans projet est proposé même si Bionic n’en fournit pas ; un groupe local déjà utilisé reste accessible si un groupe natif apparaît ensuite.

Le déplacement attend la fin de la réponse et des messages en file de ce chat, y compris une validation de script en attente. Les autres conversations peuvent continuer. Le texte du brouillon est conservé ; ses pièces jointes non envoyées sont retirées pour éviter de réinterpréter leurs chemins dans le nouveau projet. Joignez-les à nouveau si nécessaire. Les autorisations de fichiers et de scripts sont désactivées après un déplacement : réactivez-les explicitement dans le projet cible si nécessaire. Sans projet permet de discuter avec les fichiers, les scripts et les imports désactivés ; le web reste activable séparément.

Les fichiers et livrables déjà conservés restent dans leur projet. Les anciennes actions de fichiers ne peuvent pas être rejouées ou épinglées depuis un autre projet. Les pièces jointes déjà enregistrées dans l’historique gardent leur contenu figé ; elles peuvent encore faire partie du contexte de la conversation, sans relire le dossier d’origine. Les nouveaux reçus identifient leur projet d’origine lorsqu’il est connu. Les copies de livrables existantes restent téléchargeables dans leur étagère ; pour retrouver un message déplacé dont l’ancien lien ne fonctionne plus, ouvrez le chat dans son nouveau projet.

L’aide **Comment fonctionne ce compagnon ?** se ferme directement avec la croix en haut à droite de son panneau, ou avec la touche **Échap**. La croix reste visible lorsque vous faites défiler le texte ; il n’est pas nécessaire de rouvrir le menu des options.

## Renommer ou supprimer une conversation

Ouvrez **Options de la conversation** (les trois points), puis **Renommer**. Saisissez un nom de 1 à 120 caractères et enregistrez. Le nom est conservé sur le PC et apparaît après actualisation sur les autres appareils. Renommer conserve les messages, le brouillon et ses pièces jointes. Pour une conversation native, seul le nom affiché dans le compagnon change : son nom et son contenu restent intacts dans Bionic.

Dans le même menu, **Supprimer** demande une confirmation. Une conversation web est supprimée du compagnon, avec ses messages et son brouillon sur l’appareil utilisé. Il n’y a pas de corbeille de conversations dans l’interface. La corbeille des fichiers du projet reste indépendante. Une conversation native est seulement masquée dans le compagnon ; elle reste disponible dans Bionic. Le masquage persiste après actualisation et redémarrage du serveur. Une suite web déjà créée reste une conversation distincte et n’est pas supprimée avec son fil natif.

La suppression ne touche ni les fichiers du projet, ni les imports, ni les copies de livrables déjà conservées. Ces copies restent téléchargeables, mais leur lien vers le message d’origine peut ne plus aboutir. Les brouillons encore présents dans un autre navigateur ne sont pas effacés à distance.

Le renommage et la suppression sont indisponibles pendant une réponse ou tant que ce chat a des messages en attente. Attendez leur fin ou arrêtez la réponse et retirez les attentes avant de recommencer. Les autres chats peuvent continuer à répondre.

L'icône de deux feuilles permet de copier le texte seul d'un prompt (y compris en attente), d'une réponse ou d'un bloc de code. Les pièces jointes et détails techniques ne sont pas ajoutés à cette copie. Le texte source conserve sa mise en forme Markdown et ses sauts de ligne. Si le presse-papiers est indisponible, une sélection manuelle est proposée. À droite de **Détails du tour**, deux zones affichent la durée totale puis les tokens générés et le débit ; **≈** signale un débit estimé. Une valeur absente reste indiquée par un tiret.

## Retrouver les paramètres

La barre située au pied de la colonne des projets et conversations réunit **Paramètres**, **Modèles chargés** et **Reconnexion au PC**, à côté de l'état de connexion. Sur téléphone, revenez à cette colonne avec **Retour aux conversations** pour retrouver ces accès. Les mises à jour sont entièrement intégrées à **Paramètres → Maintenance et aide**, y compris leur indication de disponibilité ; le choix du canal Stable ou Bêta ne déclenche aucune installation. **Déconnecter cet appareil** se trouve dans **Paramètres → Connexion et appareils** et demande d'enregistrer ou d'annuler les saisies des paramètres avant de quitter la session.

**Paramètres** regroupe six rubriques : Conversations et affichage, Modèles et réponses, Outils et autorisations, Images et ComfyUI, Connexion et appareils, Maintenance et aide. Sur téléphone, **Rubriques** revient à la liste. **Fermer** et Échap ramènent au déclencheur. La recherche locale comprend aussi des synonymes comme « tokens », « longueur » ou « certificat » ; elle recherche les intitulés et les portées, sans indexer les valeurs personnelles.

Les choix du prochain envoi restent dans le composeur : modèle, effort, outils et profil d'image. Les paramètres en montrent le résumé et permettent de rejoindre ces contrôles canoniques. **Voir les modèles chargés** agit sur les instances en mémoire du PC. Les brouillons sont dans **Conversations et affichage**, le diagnostic et les mises à jour dans **Maintenance et aide**. Les actions de classement du chat et les opérations sur les fichiers restent dans leurs espaces habituels.

Dans **Modèles et réponses**, le modèle sélectionné cible uniquement le plafond. **Ce chat uniquement** crée une exception pour ce modèle ; **Automatique** est aussi une exception explicite, distincte du défaut du modèle. Avant un premier envoi ou depuis un historique natif, le réglage local est préparé dans l'onglet. **Défaut de ce modèle** enregistre le défaut global et retire l'exception du chat courant ; les exceptions des autres chats restent prioritaires. Le contexte chargé et l'origine sont affichés lorsqu'ils sont connus. Le plafond effectif exact dépend du contexte de chaque appel ; il n'est pas prédit comme une capacité garantie dans cet écran.

**Annuler la saisie** restaure le dernier réglage lu ou enregistré du formulaire. Fermer ou changer de cible avec une saisie non soumise propose de continuer, d'abandonner ou de conserver la saisie dans cet onglet. Cette conservation n'enregistre rien sur le PC et ne couvre aucun mot de passe, export ou ticket de certificat. Les actions déjà confirmées — mise à jour, certificat, brouillon effacé — gardent leurs propres effets. **Relire les réglages du PC** recharge explicitement les valeurs serveur.

Dans **Images et ComfyUI**, le service et les deux LoRA de chaque profil concernent l'installation partagée. Le profil du prochain message est un choix séparé. **Tester la connexion et les modèles** n'enregistre pas la saisie et ne lance aucun rendu. Les erreurs et l'indisponibilité restent indiquées.

## Écrire et changer de chat pendant une réponse

Sur téléphone, le modèle et l’effort se choisissent côte à côte sous le texte. L’envoi se trouve à droite du message ; pendant une réponse, la flèche ajoute le message à la file et le bouton carré arrête la réponse de ce chat. L’aide détaillée de l’effort apparaît quand ce sélecteur est actif et reste associée au champ pour les lecteurs d’écran.

Le menu **Outils**, juste au-dessus de la saisie, regroupe **Fichier du projet**, **Importer dans le projet**, **Importer puis joindre**, la création d’une branche et les permissions de fichiers, de web et de scripts. **Outils fichiers** propose Aucun, Lecture et Modification. L’accord de chaque recherche et URL est une option distincte. Le résumé et le pied de saisie décrivent les droits sélectionnés, y compris les scripts séparés. Le panneau s’ouvre au-dessus du bouton et se ferme avec un nouvel appui, un appui ailleurs ou la touche Échap. Les pièces jointes et le suivi d’import restent visibles hors du menu.

La zone de saisie reste disponible pendant la génération. Vous pouvez préparer le message suivant sans interrompre le modèle. **Ajouter à la file** transmet ce message au serveur du PC : il attend la fin du tour précédent dans la même conversation. Un message en attente peut être retiré avant son démarrage. La file accepte au maximum dix messages en attente par conversation.

Le modèle, l’effort, les permissions de fichiers, de web et de scripts et les pièces jointes sont ceux choisis au moment de l’envoi. Modifier un réglage ensuite ne change pas une demande déjà reçue. Les pièces jointes sont copiées à cet instant ; les modifier ensuite sur le PC ne change pas silencieusement la demande déjà acceptée. L’historique transmis au modèle est construit lorsque le tour commence, pour inclure la réponse précédente.

**Nouveau chat web**, les projets et les conversations restent accessibles pendant les réponses. Chaque fil conserve son brouillon et ses pièces jointes en préparation dans la session de l’onglet. Dans **Paramètres → Conversations et affichage**, accessible aussi depuis les options du chat, **Brouillons sur cet appareil** propose volontairement **1 heure**, **24 heures** ou **7 jours** de conservation locale du seul texte non envoyé. Par défaut, **Cet onglet uniquement** conserve le comportement de session. La durée part de la dernière modification du texte ; les copies expirées sont retirées lors de leur lecture. Les pièces jointes, réglages et textes de l’éditeur de fichiers n’entrent pas dans la conservation durable.

Les textes durables sont propres à cet appareil et à cette installation, sans synchronisation ni envoi automatique. **Effacer mes brouillons** et la déconnexion les retirent sur ce navigateur. **Télécharger ce brouillon** exporte le texte courant. Si le stockage local échoue, le texte visible reste disponible avec une alerte pour le télécharger ; cette conservation n’est pas une sauvegarde garantie.

Les demandes reçues continuent sur le PC lorsque vous consultez un autre fil ou fermez le navigateur. Les conversations ont des historiques distincts, mais partagent la puissance de calcul et, selon le projet, les fichiers. Plusieurs chats peuvent soumettre des demandes ; le parallélisme réel dépend de Bionic et du modèle. Les protections contre les écritures concurrentes restent actives.

Une conversation attendant un accord porte le badge **À valider**. Ouvrez-la pour rejoindre la carte concernée ; le titre de l’onglet indique aussi le nombre d’attentes du projet affiché. Les annonces de recherche, d’accord attendu et de fin de réponse évitent les répétitions identiques. Aucun centre supplémentaire ni notification système n’est ajouté ; aucun essai avec lecteur d’écran réel n’est déduit de ces attributs d’accessibilité.

Si vous arrêtez la réponse ou si elle échoue, les messages suivants restent conservés mais sont interrompus : ils ne partent pas automatiquement après un tour incomplet. Les autres chats continuent.

Après un redémarrage du serveur, les générations et attentes abandonnées sont affichées comme interrompues. Elles ne sont pas exécutées automatiquement : relisez le fil et renvoyez la demande souhaitée.

## Depuis votre départ

Le bouton **Depuis votre départ**, dans la liste des conversations ou l’en-tête du chat sur téléphone, ouvre les réponses web terminées, arrêtées ou en erreur. Vous pouvez filtrer par projet ou voir tous les projets. Seuls les cent événements les plus récents sont présentés.

Le compteur est propre à cet appareil et à cette installation du serveur. Au premier usage, le suivi commence à cet instant ; les événements antérieurs restent consultables sans être comptés comme nouveaux. Ouvrir le panneau ne marque aucune réponse comme consultée. **Consulter la réponse** rejoint le message exact et le marque après une ouverture réussie ; vous pouvez aussi choisir **Marquer comme consultée** sur un élément.

Ce repère est conservé dans le stockage local du navigateur, sans texte de conversation. Il n’est pas synchronisé entre appareils. Effacer ce stockage réinitialise le suivi. Le compteur se met à jour périodiquement lorsque la page est ouverte ; il ne s’agit pas d’une notification système quand le navigateur est fermé.

Les anciens messages sans date de fin enregistrée ne reçoivent pas de date inventée et n’apparaissent pas comme des nouveautés. Après un redémarrage du serveur, **Interruption constatée** indique la date à laquelle le compagnon a découvert la génération interrompue, qui peut être postérieure à l’arrêt réel du PC. L’activité des conversations natives de Bionic n’est pas suivie par cette vue.

## Conserver et retrouver des livrables

Sous une réponse enregistrée, ouvrez **Détails du tour**, puis **Conserver comme livrable**, ajustez le titre et choisissez **Conserver la copie figée**. Une création ou modification de fichier confirmée propose aussi **Conserver ce fichier** dans son journal. Ce dernier choix vérifie que le fichier du PC correspond encore à la version produite par l’action ; un changement intervenu entre-temps provoque un refus explicite.

Ouvrez **Livrables** dans la liste des conversations, ou l’onglet correspondant depuis **Depuis votre départ**. Les copies sont séparées par projet. Chaque élément garde son origine et sa date de conservation. **Ouvrir la copie** permet de consulter son aperçu et de la télécharger, de renommer son titre, de revenir au message d’origine ou de la retirer de l’étagère.

La copie est indépendante de la source :

- Le fichier actuel peut être identique, modifié, absent ou momentanément inaccessible ; cet état est indiqué dans le détail.
- **Télécharger la copie** restitue les octets conservés, même si le fichier source a changé ou a disparu.
- **Télécharger le fichier actuel du PC**, lorsqu’il est disponible, est une action distincte.
- Renommer le titre ne renomme pas le fichier d’origine. Retirer un livrable supprime seulement sa fiche et sa copie privée, jamais le texte du chat ni le fichier du projet.

L’aperçu est passif : un contenu HTML, SVG ou du code n’est pas exécuté. Les réponses sont téléchargées en texte ; les fichiers conservent leur nom et leurs octets. Un aperçu long est limité à 12 000 caractères, avec une indication permettant de télécharger la copie complète. Le compagnon ne transforme pas automatiquement une réponse en document Word ou PDF.

Les limites de l’étagère, pour toute l’installation, sont de **1 000 livrables ou 128 000 000 octets**, de **256 000 octets par réponse** et de **2 000 000 octets par fichier**. Un dépassement est refusé sans tronquer silencieusement la copie. Les copies et leurs fiches sont enregistrées dans `data/workspace/` et font partie des données privées à sauvegarder. Une copie identique déjà épinglée depuis la même source est réutilisée.

## Contexte utilisé pour une réponse

Ouvrez **Détails du tour**, puis **Contexte utilisé** sous une nouvelle réponse assistant. Le reçu indique l’historique retenu, les messages écartés, les pièces jointes sélectionnées et les lectures réussies par les outils. Les extraits d’outils conservent le texte observé, sa position et l’empreinte du fichier au moment de la lecture. Ce panneau ne relit pas les fichiers du projet pour reconstruire le passé.

Pour un message en attente, le reçu est construit lorsque son tour commence : il peut alors inclure la réponse précédente. Il évolue avec les lectures d’outils et reste accessible après rechargement. Les pièces jointes appartiennent aux copies enregistrées lors de l’envoi, pas au fichier qui aurait été modifié ensuite sur le PC.

**Transmission non confirmée** signifie que le compagnon n’a pas obtenu de confirmation de l’API ; ce n’est pas une preuve que la requête n’a jamais été reçue. Une transmission confirmée indique une requête acceptée, sans garantir que le modèle a correctement utilisé chaque élément. Une lecture d’outil peut avoir réussi sur le PC alors que son résultat n’a pas encore été confirmé dans une requête au modèle.

Le reçu ne révèle pas le raisonnement interne. Il décrit l’historique, les pièces jointes et les extraits ; les consignes du compagnon et les définitions des outils autorisés s’ajoutent à ces éléments. Les aperçus de pièces jointes sont courts ; leur message d’origine permet de retrouver la copie jointe. Aucun nombre exact de tokens n’est déduit du nombre de caractères. Une ancienne réponse sans reçu affiche **Relevé indisponible**.

Les images anciennes sont résolues seulement après sélection de l’historique : une image écartée n’est pas ouverte. L’estimation en caractères et coût d’image reste approximative ; elle n’est pas un comptage exact des tokens du modèle.

Les résultats web et les sorties de scripts apparaissent aussi dans le reçu. Un résultat peut avoir été reçu par le compagnon sans avoir encore été transmis au modèle ; le statut reste alors **Transmission non confirmée**. Leur aperçu partagé est limité à 12 000 caractères et peut être plus court que le résultat envoyé. Dans une branche, le reçu copié porte la mention historique et ne décrit pas une nouvelle exécution.

## Modèles, effort et vitesse

Sélectionnez un modèle disponible dans la liste. Le chargement à la demande dépend du réglage Bionic. Pour une image PNG, JPEG ou WebP, choisissez un modèle portant la mention **Vision**.

Le champ **Effort** présente les choix pris en charge pour le modèle. Un niveau plus élevé peut prendre davantage de temps ou de contexte. L’application conserve une option par défaut et n’invente pas de prise en charge pour un modèle inconnu.

Les mesures de tokens, durée et tokens/s sont disponibles dans **Détails du tour** lorsqu’elles peuvent être calculées ou sont fournies par l’API. Elles ne constituent pas un benchmark comparable entre tous les modèles ; une demande avec plusieurs étapes d’outils peut ne pas avoir de vitesse globale affichée.

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

**Fichier du projet** permet de joindre un fichier déjà présent. Pour un texte, vous pouvez sélectionner seulement le passage utile dans l’éditeur avant de le joindre. **Importer dans le projet** ouvre le sélecteur de votre téléphone ou ordinateur et conserve les fichiers sur le PC sans les joindre. **Importer puis joindre** ajoute aussi les formats compatibles au prochain message, dans les places disponibles, sans envoyer ce message. Le suivi indique les imports et pièces jointes effectivement ajoutées.

L’import copie les fichiers dans **`Imports telephone/`**, à l’intérieur du dossier de travail du projet sélectionné. Un nom déjà utilisé reçoit un suffixe : l’import n’écrase pas le fichier existant. Le fichier importé reste dans le projet même si vous retirez sa pièce jointe du message ou n’envoyez pas le message.

| Opération | Limite |
| --- | --- |
| Import depuis l’appareil | 20 Mo par fichier, 10 fichiers par sélection |
| Pièces jointes d’un message | 4 maximum |
| Image transmise à un modèle Vision | PNG, JPEG ou WebP, 6 Mo maximum |
| Téléchargement d’un fichier du PC | 64 Mo maximum |
| Modification d’un texte | 1 Mo maximum |

Avec **Importer puis joindre**, les formats exploitables sont joints dans la limite disponible. Un format non pris en charge peut être importé et conservé sans devenir une pièce jointe utilisable par le modèle. Un texte joint peut être tronqué ou refusé s’il dépasse les budgets du message ou du modèle.

Les images et les textes joints sont conservés avec la conversation pour que leur contenu ne change pas silencieusement si le fichier du projet évolue ensuite. Cela représente une copie supplémentaire de données privées dans `data/`.

## Gérer les fichiers avec le modèle

Le profil **Outils fichiers → Modification** est choisi par défaut dans un nouveau chat ordinaire et mémorisé dans la conversation. Avec ce profil, le modèle peut :

- Lister un dossier et lire des extraits de textes pertinents.
- Chercher des noms ou des passages, inspecter la version d’un fichier et créer un dossier.
- Créer un fichier texte ou de code dans le dossier de travail du projet.
- Remplacer un passage exact et unique déjà lu ou explicitement donné dans votre message.
- Réécrire entièrement un fichier seulement après l’avoir lu en totalité dans la demande.
- Copier, déplacer ou renommer un fichier inspecté, sans écraser de destination existante ; le retirer vers la corbeille privée, avec restauration depuis le chat ou **Fichiers du projet → Corbeille du projet**.

**L’enregistrement est immédiat : il n’y a pas de demande d’approbation pour chaque modification.** Les actions apparaissent sous la réponse avec leur résultat. Une modification réussie offre une restauration de la copie précédente lorsque la version du fichier le permet. Une création ne supprime pas automatiquement le nouveau fichier lors d’une restauration.

**Comparer la modification** montre les versions texte disponibles jusqu’à 200 Ko par version, uniquement si le fichier actuel a encore l’empreinte de l’action. Une version ultérieure est annoncée sans être présentée comme le diff historique de cette action. L’aperçu est passif et ne fusionne ni n’enregistre rien. Une opération interrompue sans reçu reste **à vérifier** ; les éventuelles copies candidates ne prouvent pas un succès et aucune action n’est rejouée.

Exemple de demande ciblée : « Dans `notes.md`, trouve le paragraphe sur les délais et remplace la date du 12 par le 15. Ne modifie rien d’autre. »

Ces outils de fichiers sont limités au **dossier de travail du projet**. Ils ne suppriment pas définitivement les fichiers ni les dossiers et ne lancent pas de commandes. Les dossiers supplémentaires et liés peuvent être parcourus manuellement selon leurs droits, mais n’élargissent pas le périmètre de ces outils. L’autorisation distincte de scripts permet de proposer du code à valider ; elle a une portée plus large, décrite ci-dessous. Aucun de ces réglages n’importe les outils MCP de Bionic.

Le modèle ne reçoit pas d’emblée le contenu de tous les fichiers. La lecture directe est limitée à **3 000 caractères par extrait**, **6 fichiers distincts** et un budget total dépendant du contexte du modèle, plafonné à **12 000 caractères par demande**. La recherche de passages peut inspecter davantage de fichiers, mais seuls les extraits trouvés et bornés sont transmis dans ce même budget. Les extraits lus par outil ne sont pas automatiquement réinjectés au prochain tour. Les pièces jointes explicites ont leur propre budget de contexte.

Pour une analyse avec ces outils sans mutation directe, choisissez **Lecture** ; pour discuter sans outils directs de fichiers, choisissez **Aucun**. Ces profils ne limitent pas les droits séparés d’un script que vous approuvez. Si le modèle ne sait pas utiliser les outils ou choisit de ne pas les appeler, aucune modification ne peut être déduite de sa seule réponse : vérifiez le journal des actions et le fichier.

## Rechercher et lire Internet

Activez **Rechercher et lire Internet** dans **Outils**, puis envoyez une demande précise. Le modèle peut chercher des sources et lire des extraits de pages publiques. Il ne reçoit pas automatiquement vos fichiers pour les envoyer au moteur de recherche ; évitez néanmoins toute recherche contenant un secret ou du texte privé inutile.

Vous pouvez aussi activer **Valider chaque recherche et URL avant envoi**. Chaque query ou URL exacte attend alors votre accord ; refus et expiration n’envoient rien par cet outil. Les redirections sont refusées dans ce mode et une autre requête attend son propre accord. Sans cette option volontaire, le mode rapide reste disponible. Cela ne contrôle pas les requêtes réseau d’un script approuvé.

Les résultats affichent leurs URL. Une page ne donne aucune autorisation d’agir sur le PC : ses instructions restent des données externes non fiables. Le compagnon ne se connecte pas à vos comptes, n’exécute pas le JavaScript des sites et ne parcourt pas le réseau local par cet outil. Un moteur bloqué ou un CAPTCHA produit une erreur explicite. Une URL directe peut rester lisible si la recherche échoue. Voir [moteurs, limites et configuration](outils-agents.md#internet-public).

## Valider un script sur le PC

Activez **Scripts sur le PC, avec validation** dans **Outils**. Cela autorise le modèle à **proposer** du code Python, Node.js ou PowerShell. Chaque proposition affiche le code exact et son dossier de travail dans le chat. Lisez-les puis choisissez **Exécuter ce script** ou **Refuser** ; un accord ne vaut pas pour la proposition suivante.

**Le script validé a les droits de votre compte du PC.** Son dossier de départ est le projet, mais il peut agir ailleurs, accéder au réseau ou modifier des fichiers sans les sauvegardes des outils d’édition. Ce n’est pas un bac à sable. Un arrêt ou une erreur ne rétablit pas les changements déjà réalisés.

Une demande de validation expire après dix minutes. Elle reste consultable si vous fermez puis rouvrez le navigateur avant expiration, tant que le serveur continue. Après un redémarrage du serveur, une attente abandonnée expire et n’est pas exécutée. Les statuts et les sorties restent dans le chat. Les limites de durée, de code et de sortie sont détaillées dans le [guide des outils](outils-agents.md#scripts-validés-sur-le-pc).
