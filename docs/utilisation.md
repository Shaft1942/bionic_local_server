# Utilisation

[Retour au README](../README.md)

## Projets et conversations

Choisissez un projet dans la liste. Les conversations natives de Bionic sont consultées en lecture seule. Le bouton d’actualisation permet de retrouver les changements faits dans Bionic.

Si vous répondez à une conversation native, le compagnon crée une **suite web**. Cette suite est enregistrée sur le PC dans `data/chats/`, puis reste accessible depuis ce compagnon. Elle n’est pas réécrite dans l’historique natif Bionic. Les pièces jointes, raisonnements et actions internes d’une ancienne conversation ne sont pas reproduits intégralement : le compagnon importe une projection textuelle des messages visibles, soumise à des limites de taille.

Vous pouvez aussi commencer un nouveau chat dans le projet sélectionné. Le modèle reçoit un historique limité pour respecter son contexte ; l’affichage du fil complet ne garantit pas que chaque ancien message soit transmis au modèle à chaque demande.

## Écrire et changer de chat pendant une réponse

La zone de saisie reste disponible pendant la génération. Vous pouvez préparer le message suivant sans interrompre le modèle. **Ajouter à la file** transmet ce message au serveur du PC : il attend la fin du tour précédent dans la même conversation. Un message en attente peut être retiré avant son démarrage. La file accepte au maximum dix messages en attente par conversation.

Le modèle, l’effort, les droits de modification et les pièces jointes sont ceux choisis au moment de l’envoi. Les pièces jointes sont copiées à cet instant ; les modifier ensuite sur le PC ne change pas silencieusement la demande déjà acceptée. L’historique transmis au modèle est construit lorsque le tour commence, pour inclure la réponse précédente.

**Nouveau chat web**, les projets et les conversations restent accessibles pendant les réponses. Chaque fil conserve son brouillon et ses pièces jointes en préparation. Les brouillons sont stockés dans la session de cet onglet du navigateur : ils survivent à un rechargement, mais leur conservation après fermeture de l’onglet dépend du navigateur. Ils ne sont pas synchronisés entre appareils et ne sont jamais envoyés automatiquement.

Les demandes reçues continuent sur le PC lorsque vous consultez un autre fil ou fermez le navigateur. Les conversations ont des historiques distincts, mais partagent la puissance de calcul et, selon le projet, les fichiers. Plusieurs chats peuvent soumettre des demandes ; le parallélisme réel dépend de Bionic et du modèle. Les protections contre les écritures concurrentes restent actives.

Si vous arrêtez la réponse ou si elle échoue, les messages suivants restent conservés mais sont interrompus : ils ne partent pas automatiquement après un tour incomplet. Les autres chats continuent.

Après un redémarrage du serveur, les générations et attentes abandonnées sont affichées comme interrompues. Elles ne sont pas exécutées automatiquement : relisez le fil et renvoyez la demande souhaitée.

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
