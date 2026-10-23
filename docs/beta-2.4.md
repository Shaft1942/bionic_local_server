# Version 2.4 bêta

Date : 23 octobre 2026. Base vérifiée : stable 2.3.0, commit `f3158fc7e377861feb6069ef2312997a5734bf7a`. Préversion : `2.4.0-beta.3`, distribuée sur le canal Bêta, sans changement de la stable. Ce document décrit le lot intégré ; il ne constate pas une installation ou un gain de performance sur un moteur réel.

## Interactions

- Cliquer sur le fond extérieur ferme les fenêtres et menus concernés. Un clic à l'intérieur, ou un geste commencé à l'intérieur puis relâché dehors, conserve leur contenu. La fermeture au clavier et le retour du focus sont préservés.
- L'actualisation/reconnexion du compagnon est accessible en haut de la colonne projets. Le doublon du bas est retiré.
- Le menu Outils permet de générer le prompt saisi directement en image. Ce trajet utilise les mêmes workflows, paramètres, droits, reçus persistés et cartes de suivi que l'outil conversationnel ; aucun appel au modèle texte n'est nécessaire. Un identifiant de demande reçu n'est pas resoumis automatiquement après une réponse réseau perdue.
- Le parcours des projets permet de créer un projet local sans dossier, ou d'adopter une identité Bionic après aperçu des dossiers. Aucune racine et aucun droit d'écriture ne sont présélectionnés. Les droits retenus ne dépassent pas ceux de l'aperçu. Les historiques Bionic restent lus à leur emplacement d'origine.

## Architecture et pannes

Le serveur reste un processus Node.js unique. Le coordinateur de ressources, le cycle d'arrêt, le transport du modèle et l'écriture NDJSON ont des propriétaires séparés. Le dépôt de conversations gère l'index dérivé des résumés et des identifiants de demandes, la limite du cache et les curseurs d'historique. Le registre local possède les projets adoptés et leurs droits explicites.

| Recommandation de l'audit | Traitement dans ce lot |
| --- | --- |
| A1 — maintenance pendant image | Garde déjà présente dans la stable conservée ; inventaire commun des générations, attentes, mutations et soumissions. |
| A2 — job image corrompu | Chargement indépendant des jobs, conservation des octets illisibles et état dégradé visible dans les réglages ; aucune resoumission déduite d'un fichier endommagé. |
| A3 — arrêt prématuré | Fermeture de l'admission, annulation, attente des tâches puis des dernières persistences ; délai d'arrêt explicite. |
| A4 — dépendance au catalogue Bionic | Projets locaux persistés et adoption à identifiant stable. Les chats locaux existants restent consultables lorsque le catalogue natif est absent ; les anciens dossiers ne reçoivent aucun droit supplémentaire. |
| A5 — concurrence texte/images | Réservations par phase, politique configurable, attente et annulation. Aucun verrou d'inférence conservé pendant un outil ou un accord humain. Les rendus déjà connus réservent leur ressource à la reprise. |
| A6 — volume | Résumés et requêtes indexés sans réhydrater tous les messages à chaque inventaire, cache des chats inactifs borné, checkpoints regroupés et API paginées. JSON reste le stockage de référence. |
| A7 — responsabilités serveur | Extraction progressive du dépôt, de l'autorité projets, du transport, du coordinateur, du cycle de vie et du flux client. Les contrôleurs et une partie de l'orchestration de conversation restent dans server.mjs. |
| A8 — fournisseurs/capacités | Transport Bionic derrière un adaptateur, identité figée dans la file ; outils pris en charge, refusés ou inconnus, avec preuve du catalogue et essai explicite si activés. Aucun autre moteur n'est déclaré qualifié. |
| A9 — mobile/observabilité | HTTPS/mTLS existants conservés et guide revu ; compteurs de ressources, checkpoints et détachements clients sans messages ni credentials ; buffer NDJSON borné et reprise par requête. |

La suite des extractions reste progressive. L'audit conditionne SQLite, un worker pour les lectures natives coûteuses et un adaptateur de moteur supplémentaire à des mesures/qualifications ; ce lot ne déclenche pas ces migrations. Un flux d'événements multiplexé peut remplacer ultérieurement plusieurs interrogations après qualification de ses curseurs et de sa reprise. Les historiques natifs, identifiants et formats JSON compatibles restent préservés.

## Réglages et API

`resourcePolicy` vaut `exclusive` par défaut : les phases de calcul texte et les rendus images ne sont pas admis ensemble par le compagnon. `independent` permet leur concurrence lorsque les ressources des moteurs sont distinctes ou que l'utilisateur a qualifié ce profil. La limite `maxConcurrentInferences` continue à borner les seules phases texte. Variable correspondante : `BIONIC_MOBILE_RESOURCE_POLICY`.

`shutdownTimeoutMs` vaut 15 000 ms, de 100 à 120 000 ms ; variable `BIONIC_MOBILE_SHUTDOWN_TIMEOUT_MS`. Si la finalisation dépasse ce délai, l'arrêt est annoncé non confirmé, avec code d'erreur, plutôt que présenté comme un checkpoint réussi. Une application externe utilisant directement un moteur n'est pas pilotée par ce coordinateur.

Une annulation attend le règlement du chargement de modèle partagé avant de libérer sa réservation ; elle n'annule pas le chargement demandé aussi par une autre conversation. Un timeout fournisseur ou une soumission image `unknown` ne prouvent pas l'arrêt du moteur distant : la politique ne garantit pas une exclusivité physique de toutes les opérations GPU.

Les nouveaux endpoints exigent la session habituelle et les mutations conservent les contrôles d'origine :

- `POST /api/local-projects` avec `{name}` crée un projet local sans dossier.
- `GET /api/local-projects/adoption?projectId=...` fournit l'aperçu et son empreinte ; `POST /api/local-projects/adopt` confirme `{projectId,fingerprint,roots:[{id,writable}]}`. Un aperçu périmé ou un élargissement de droits est refusé.
- `POST /api/comfy/generate` avec `{requestId,projectId,sessionId?,prompt,workflowId?}` retourne le chat/message propriétaire et le job ; `GET /api/chat-request` permet de retrouver l'envoi. La génération directe et un nouveau message texte dans le même chat ne se superposent pas pendant la soumission.
- `GET /api/conversation?projectId=...&id=...&limit=100` retourne la page récente et `pagination`. `before` reprend avant le premier message de la page courante. Les identités de messages anciens dépourvus d'identifiant sont déterministes en mémoire, sans écriture des historiques natifs.
- `GET /api/sessions` et `GET /api/activity` acceptent `limit` et `cursor`. Les clients historiques sans limite conservent leur contrat précédent. Un curseur devenu invalide reçoit 409, sans saut silencieux d'une partie de l'historique.
- `GET /api/runtime-status` fournit des compteurs authentifiés : tâches, ressources, attente, cache, checkpoints et clients détachés. Il ne contient ni prompt, ni réponse, ni chemin de projet ni secret.

Le cache conserve au plus 64 conversations inactives et environ 32 Mo de JSON sérialisé. Les conversations en calcul, en écriture, en file ou utilisées par une lecture en cours restent épinglées ; elles peuvent temporairement dépasser ces limites. L'index est dérivé : s'il est illisible, ses octets sont conservés et les résumés sont reconstruits. Un dépassement de taille ou échec d'écriture de l'index est signalé et n'efface pas les conversations.

## Certificats

Le [guide d'installation](installation.md), le [parcours certificats](certificats-utilisation.md), le [dépannage](depannage.md) et l'aide intégrée distinguent l'autorité publique HTTPS du certificat appareil privé mTLS. Les étapes couvrent Android, iOS/iPadOS et Windows. Le redémarrage Android figure comme dépannage observé après import de la bonne autorité ; il ne remplace ni la correspondance d'adresse, ni la validité du certificat. Aucune installation d'application ou de gestionnaire de certificats tiers n'est nécessaire à ce parcours.

## Dépendances de livraison

L'optimisation issue du diagnostic de génération est reprise depuis le livrable terminé `3d25416eec34c4888f413239888877b34fab6e64`, porté sémantiquement sur la coordination actuelle. Après un lot d'outils consacré à l'image, une confirmation du compagnon clôt le tour sans second appel au modèle texte. Un lot mixte attend la fin de l'image avant sa synthèse ; un état inconnu clôt le tour sans nouvel appel ni nouvelle soumission. L'attente couvre aussi la réservation d'une ressource et reste interruptible. Aucun déchargement systématique ni changement du contexte Qwen n'est ajouté.

Le diagnostic dispose de ses essais réels séparés ; ses durées ne constituent pas une mesure de cette bêta intégrée. Quinze scénarios d'intégration synthétiques couvrent les statuts, l'alias historique, les erreurs sans job, les lots mixtes et l'annulation.

Le lot français/anglais demandé séparément est intégré depuis `8492a84769576b434d6fab052b5a0e9e62cc107d`, avec son complément d'accessibilité `fe0d1ea8383a96fa7cde5041a7a1e331064808b3` et les nouvelles chaînes des écrans 2.4. Les [catalogues extensibles](internationalisation.md), pluriels, dates et nombres suivent la langue choisie par navigateur. Le choix dans Paramètres → Langue et brouillons reste indépendant des prompts et des réponses du modèle. Les passages FR↔EN préservent formulaires, droits choisis, secrets d'export synthétiques, brouillons, messages et défilement ; ils ne déclenchent aucune requête serveur.

Les tests API et navigateur utilisent des données synthétiques. Ils ne prouvent ni import de certificat système, ni téléphone physique, ni pare-feu, ni performance de modèle/GPU. La publication GitHub ne déploie pas cette version sur une installation personnelle. La préversion est proposée après choix explicite du canal Bêta dans Paramètres → Maintenance → Mises à jour ; revenir au canal Stable ne rétrograde pas une bêta installée.

Validation finale de l'assemblage : **665 tests réussis, zéro échec/skip**, 136 fichiers JavaScript vérifiés et export fermé de 235 sources. Les parcours ordinateur/mobile simulés des fenêtres, images directes, projets, pagination, langues, aide, certificats, paramètres, lecture et mises à jour passent. Le bootstrap HTTP → HTTPS est aussi exercé sur un serveur/certificat de fixture, avec confiance limitée au processus navigateur et sans import système. Les rapports détaillés et méta-prompts exécutés restent dans le dépôt du socle, hors distribution.
