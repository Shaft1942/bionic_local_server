# Pistes d’évolution de Bionic Mobile

Recherche et propositions du **20 octobre 2026** (Europe/Paris).

**Statut : exploration, pas annonce de fonctionnalités livrées.** Ce document propose des évolutions ; leur présence ici ne signifie pas qu’elles sont implémentées. La documentation d’utilisation et le journal des versions décrivent les fonctions effectivement disponibles. Les pages de produits citées peuvent évoluer après cette date.

## Partir des usages de ce compagnon

Bionic Mobile sert à travailler depuis un téléphone sur les modèles et les fichiers d’un PC du réseau local. Les priorités sont de pouvoir continuer à écrire, retrouver le travail en cours et comprendre ce qui a été lu ou modifié. Les ressources du PC et les fichiers peuvent être partagés entre plusieurs chats.

La base documentaire examinée comprend le README, le guide d’utilisation et les contrôles du chat de la version 1.5.0. Le compagnon possède ses propres conversations web et outils de fichiers : ces pistes ne supposent ni synchronisation en écriture avec les conversations natives, ni accès aux agents ou MCP de Bionic.

## Ce que recommandent les sources

Les recommandations suivantes sont documentées ; les fonctionnalités du chapitre suivant sont nos propositions pour les appliquer ici.

- **Rendre l’IA compréhensible et corrigeable.** Les recommandations Microsoft HAX demandent d’indiquer les capacités et limites, de permettre la correction et d’expliquer les conséquences des actions. Elles proviennent de travaux de recherche ; ce ne sont pas une obligation d’ajouter un tableau de bord à chaque écran. [Microsoft HAX — Guidelines](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/) et [présentation des 18 recommandations](https://www.microsoft.com/en-us/research/?p=564561).
- **Distinguer attendre, réorienter et arrêter.** VS Code documente trois actions différentes pendant une requête : mettre un message en file, réorienter après une étape d’outil, ou arrêter puis envoyer. Les messages en attente peuvent être réordonnés. C’est un exemple de produit, pas la preuve qu’il faut reproduire toutes ses options. [VS Code — Send messages while a request is running](https://code.visualstudio.com/docs/chat/chat-overview#send-messages-while-a-request-is-running).
- **Séparer les conversations ne sépare pas les fichiers.** La documentation des sessions VS Code distingue les historiques de chat de l’espace de travail partagé. Deux chats peuvent toucher les mêmes fichiers. [VS Code — Understand sessions and chats](https://code.visualstudio.com/docs/agents/concepts/sessions#chats-within-a-session).
- **Conserver le contrôle au bon niveau.** Le guide PAIR conseille d’équilibrer automatisation et contrôle ; ses chapitres sur les explications et les erreurs insistent sur des attentes adaptées et une voie de reprise. [Google PAIR — Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/), [Explainability + Trust](https://pair.withgoogle.com/guidebook-v2/chapter/explainability-trust/), [Errors + Graceful Failure](https://pair.withgoogle.com/guidebook-v2/chapter/errors-failing/).
- **Annoncer les changements sans interrompre la lecture.** WCAG 4.1.3 prévoit des messages de statut accessibles sans déplacement du focus. Le minimum WCAG 2.5.8 est généralement de 24 × 24 pixels CSS, avec des exceptions ; viser des contrôles plus grands aide sur téléphone. [W3C — Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) et [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## Douze propositions, par priorité

Priorités : **P0** répond au besoin immédiat ; **P1** renforce le travail quotidien ; **P2** mérite une expérimentation. La complexité est relative au compagnon actuel, sans estimation de délai. Les garde-fous ci-dessous sont des choix de conception proposés pour Bionic Mobile.

| Priorité | Proposition | Bénéfice concret | Complexité | Point d’attention |
| --- | --- | --- | --- | --- |
| P0 | **1. Une file visible dans chaque chat** : continuer à saisir, puis « Ajouter à la file ». Afficher le rang et permettre de retirer ou modifier les messages qui ne sont pas encore partis. | Préparer la suite sans attendre ni interrompre la réponse. | Moyenne à élevée | Distinguer un brouillon d’un message accepté par le serveur ; ne pas doubler l’envoi après reconnexion. |
| P0 | **2. Un nouveau chat toujours accessible**, avec un compteur discret « 2 en cours » et l’état de chaque conversation dans la liste. | Poser une autre question pendant un travail long et retrouver chaque résultat. | Élevée | Historiques indépendants, ressources et fichiers partagés ; contrôler la concurrence côté serveur. |
| P1 | **3. Des brouillons propres à chaque chat**, y compris au nouveau chat d’un projet, avec « Brouillon conservé sur cet appareil ». | Changer de conversation sans perdre sa saisie, son effort ou ses pièces jointes en préparation. | Moyenne | Ne jamais envoyer un brouillon automatiquement ; limiter les données conservées sur un téléphone partagé. |
| P1 | **4. Un tiroir « Contexte utilisé »** : pièces jointes choisies, extraits réellement lus et éventuelle troncature, ouvrables dans le navigateur de fichiers. | Comprendre pourquoi un fichier intervient et corriger un contexte trop large. | Moyenne | Distinguer contenu annoncé, effectivement envoyé et lu par outil ; les tokens sont une estimation si l’API ne les mesure pas. |
| P1 | **5. Un compte rendu des changements** en fin de réponse : fichiers créés ou modifiés, comparaison avant/après et restauration disponible. | Vérifier le travail du modèle en quelques gestes, même depuis le téléphone. | Moyenne à élevée | S’appuyer sur les opérations enregistrées, pas sur les déclarations du modèle ; une restauration doit détecter les changements ultérieurs. |
| P1 | **6. Une activité lisible par étapes** : « En attente », « Chargement du modèle », « Lecture de notes.md », « Réponse », « Terminé » ou « Interrompu ». | Distinguer une réponse lente d’un serveur injoignable. | Moyenne | Montrer seulement les événements réellement observés ; éviter les pourcentages et temps restants inventés. |
| P1 | **7. Une boîte des résultats non lus**, avec retour direct au chat et position de lecture conservée. | Retrouver ce qui s’est terminé pendant une autre conversation ou après verrouillage du téléphone. | Moyenne | Un indicateur dans l’application ne garantit pas une notification système lorsque le navigateur est fermé. |
| P2 | **8. Un carnet de projet choisi par l’utilisateur** : consignes, vocabulaire, décisions et quelques références épinglées. Un extrait peut devenir une fiche après validation. | Éviter de répéter les règles du projet à chaque nouveau chat. | Moyenne | Aucun ajout silencieux ni chargement intégral des fichiers ; montrer ce qui sera réutilisé et permettre de le retirer. |
| P2 | **9. « Explorer une autre approche »** depuis une réponse : créer une variante avec une copie de l’historique jusqu’à ce point. | Tester une idée sans encombrer le fil de travail principal. | Moyenne à élevée | Une variante de conversation ne clone pas les fichiers ; proposer la lecture seule pour une comparaison, puis choisir explicitement quelle approche appliquer. |
| P2 | **10. Un banc d’essai personnel** : poser le même prompt à deux modèles, successivement, puis épingler la réponse préférée. | Choisir un modèle à partir de ses propres tâches plutôt qu’uniquement des tokens/s. | Élevée | Rejouer les entrées identiques ; désactiver les écritures de fichiers dans la comparaison ; compter le temps de chargement à part. |
| P2 | **11. Des actions de départ liées à la sélection** : « Résumer ce passage », « Chercher les décisions », « Proposer une modification ». Elles préremplissent un message éditable. | Réduire la saisie sur mobile sans imposer une réponse ni une action automatique. | Faible à moyenne | Ne pas envoyer sur un simple tap ; ne joindre que la sélection annoncée. |
| P1 | **12. Un mode lecture confortable** : ne plus défiler automatiquement quand on remonte, bouton « Revenir à la réponse », commandes tactiles larges et annonce vocale des phases importantes. | Lire une réponse ou une différence de fichier pendant que le modèle continue. | Moyenne | Garder le focus clavier et annoncer les étapes, pas chaque token ; fournir des libellés en plus des couleurs. |

## Les quatre investissements recommandés

### 1. File de messages et états explicites

Le bouton principal devrait dire **« Envoyer »** au repos et **« Ajouter à la file »** lorsqu’une réponse est en cours. « Arrêter la réponse » reste une action séparée. Pour une première version, ne pas ajouter de commande « Réorienter » : elle demande une véritable prise en charge des interruptions aux limites des outils.

Exemple : on demande une analyse, puis on ajoute « ensuite, rédige une synthèse courte ». La seconde demande attend la première réponse et utilise l’historique mis à jour. Le modèle et les options choisis doivent être attachés au message accepté, afin qu’un changement ultérieur de sélecteur ne modifie pas silencieusement la tâche.

Les attentes doivent avoir une identité stable côté serveur. La fermeture du navigateur ne les annule pas. Après erreur ou arrêt volontaire, la politique de reprise doit être affichée : suspendre les suites est plus compréhensible que lancer des modifications dépendant d’un résultat incomplet. Une attente remise en brouillon doit être présentée comme telle.

La conservation des tâches n’impose pas une relance après redémarrage du PC : relire et reprendre explicitement peut être préférable pour des demandes qui modifient des fichiers.

### 2. Navigation libre entre les chats, avec ressources partagées assumées

Un changement de chat doit détacher seulement son affichage ; le travail serveur continue. Chaque conversation garde son brouillon, ses options et son indicateur. Le retour dans un chat retrouve le bon travail sans renvoyer le prompt.

La possibilité d’ouvrir plusieurs chats ne doit pas promettre que tous les modèles calculent en même temps. Prévoir une limite d’exécutions configurable et un état d’attente explicite. La valeur adaptée dépend du PC et des modèles. Pour les fichiers, préserver les vérifications de version et traiter les écritures concurrentes sans écrasement silencieux.

### 3. « Contexte utilisé » plutôt qu’une impression de lecture totale

Sous le message, une ligne compacte pourrait annoncer **« 2 pièces jointes · 3 extraits lus »**. Un détail affiche les sources et les passages avec leur rôle : joint par vous, lu par le modèle, tronqué. Les lectures futures d’outils ne peuvent pas être prédites avant l’envoi ; le détail s’enrichit pendant la tâche.

Ce panneau porte sur les entrées et actions observables. Il ne prétend pas révéler le raisonnement interne du modèle et ne transforme pas une explication générée en preuve technique. Il devrait aussi préciser quand l’historique ancien a été limité.

### 4. Un résultat vérifiable pour les fichiers

Présenter **« 2 fichiers modifiés · 1 création »**, puis des cartes ouvrables contenant les différences et les sauvegardes disponibles. Après une erreur, montrer les écritures déjà réalisées. **Arrêter** n’annule pas rétroactivement un enregistrement.

Le modèle actuel d’enregistrement immédiat peut rester une option. Un futur mode **« Proposer avant d’enregistrer »** demanderait un vrai stockage des modifications en attente et une vérification des versions au moment de l’application. Une simple consigne dans le prompt ne remplace pas cette fonction. La consultation des différences et les points de reprise ont un précédent documenté dans [VS Code — Review and revert agent changes](https://code.visualstudio.com/docs/agents/run/review-code-edits#review-agent-changes).

## Deux limites à prévoir avant d’aller plus loin

**Notifications système et installation.** Commencer par les résultats non lus dans l’application. L’accès actuel en HTTP sur une adresse du réseau local ne permet pas de promettre les notifications système du navigateur ; les API concernées nécessitent un contexte sécurisé et leur disponibilité dépend du navigateur. Un mode HTTPS local et la compatibilité mobile demanderaient un chantier séparé. [MDN — Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API).

**Pas de télémétrie externe par défaut.** Les essais peuvent être mesurés localement : temps avant la première réponse, perte de brouillon, messages envoyés deux fois, écritures refusées pour conflit. Un bouton d’avis n’entraîne pas le modèle local à lui seul. Toute collecte et son effet doivent être annoncés ; aucune nouvelle fonctionnalité ne devrait envoyer les conversations à un service externe par surprise.

## Scénarios pour juger une future implémentation

1. Lancer une réponse A, écrire B, changer de chat, créer C, puis revenir : les brouillons et les réponses restent dans leur conversation.
2. Mettre B en file, le retirer avant son départ, fermer puis rouvrir le navigateur : B ne part pas et A n’est pas envoyée deux fois.
3. Couper le Wi-Fi après l’acceptation : au retour, l’interface distingue tâche poursuivie sur le PC, attente acceptée et brouillon resté sur l’appareil.
4. Interrompre A après une écriture : le fichier modifié reste signalé et la suite ne s’exécute pas sans que sa politique soit claire.
5. Deux chats tentent d’éditer le même fichier : le second ne remplace pas une version qu’il n’a pas lue.
6. Lire un ancien message au clavier ou au lecteur d’écran : une arrivée de texte ne vole ni le focus ni la position de lecture.

Ces scénarios sont des critères proposés, pas des comptes rendus de tests déjà réalisés.
