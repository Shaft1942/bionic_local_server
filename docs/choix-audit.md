# Choix d’audit retenus — diff local non publié

[Retour au README](../README.md) · [Vérification](verification.md) · [Développement](developpement.md)

Ce lot reprend les **23 choix explicitement retenus** le 20 octobre 2026 dans l’audit `bionic-audit-1.8.0-5e92da3-2026-10-20`. Sa référence est [`5e92da3fae6dccdb36738eb42ab4a0b1b2b00bf1`](https://github.com/Shaft1942/bionic_local_server/commit/5e92da3fae6dccdb36738eb42ab4a0b1b2b00bf1), `main` annoncé en 1.8.0. Les changements sont préparés sur `feat/choix-audit-bionic`, avec ce numéro conservé. Ils ne sont pas publiés. Au contrôle GitHub du 21 octobre 2026, la dernière Release reste v1.5.0 et la dernière CI examinée sur la référence auditée, run 39498935835, est rouge.

Les fonctions décrites ici sont présentes dans le diff local. Les critères ci-dessous forment un contrat de vérification ; leur présence dans le tableau ne signifie pas qu’un essai réel, une plateforme ou chaque combinaison d’interface a été validé. Le [bilan de vérification](verification.md) fait autorité sur les essais effectués. Aucune publication ni modification d’installation personnelle ne fait partie du lot.

## Périmètre de sécurité et de données

Les historiques natifs Bionic restent lus sans modification. Les tests utilisent des projets, bases, conversations et réponses d’API synthétiques. Les versions périmées restent refusées ; l’accord d’un script reste lié à son code exact. Les travaux ne comportent ni push, merge, tag, Release, redémarrage actif, migration de projet personnel ni essai de modèle ou téléphone réel.

| Choix | Livraison et limites | Critère et contrôle à conserver | Retour arrière à déclencher si… |
| --- | --- | --- | --- |
| S01 — Chat illisible | Erreurs JSON/schéma individuelles isolées, octets préservés, listes et activité partielles signalées, ouverture directe explicite. Récupération manuelle seulement. | Chat sain + invalide ; comparer les octets avant/après ; distinguer disparition individuelle et erreur globale de permissions. | Un chat disparaît sans avertissement ou un fichier source est réparé/retiré sans action explicite. |
| S02 — Accord web | `webApproval` volontaire par chat et figé par message : accord de chaque query et URL exacte, refus des redirections dans ce mode ; mode rapide conservé. Les scripts gardent leur réseau séparé. | Fournisseur injecté : refus, expiration et arrêt n’envoient rien ; query/URL/paramètres identiques à l’accord ; un nouvel envoi exige son accord. | La destination ou le texte envoyé diffère, ou le produit laisse croire à une limitation du réseau des scripts. |
| S03 — Profils fichiers | `fileProfile: none/read/write` ; compatibilité `fileAccess` false→none, true→write. Snapshot par message et file ; aucun accord ajouté à chaque sauvegarde en Modification. | Table des outils et mutations forgées en Lecture ; migration, fork et déplacement ne confèrent pas de nouveaux droits. | Un ancien choix acquiert plus de droits ou un appel direct contourne Lecture. |
| S04 — Corbeille | Inventaire, téléchargement et restauration des copies `kind=trash` par projet, sans chat source ; contrôles de portée/hash ; copie endommagée annoncée. Ni purge ni écrasement. | Corbeille puis suppression du chat ; mauvais projet, collision, copie et métadonnées invalides ; historique de fork passif. | Des projets se mélangent, un chemin de stockage privé fuit ou une destination occupée est remplacée. |
| S05 — Révocation | `Deconnecter-appareils.cmd` / `.ps1` et `scripts/revoke-sessions.mjs` invalident globalement les sessions de l’instance locale reconnue, sans arrêter les travaux. Cookie et code partagés ne sont pas une identité d’appareil. | Ancien cookie refusé ; générations et attentes intactes ; reconnexion possible avec le code ; route limitée au secret d’administration et à la boucle locale. | Le travail est interrompu, un accès non autorisé révoque les sessions ou une révocation ciblée est promise. |
| S06 — Réception HTTP | `requestTimeoutMs` défaut 180 000 ms, applicable à la réception login/chat/import ; taille bornée, erreur d’expiration explicite. Aucun délai socket global ajouté. | Corps synthétique lent ou incomplet ; import aux limites ; génération déjà acceptée préservée. Le Wi-Fi physique reste à essayer. | Le calcul est coupé par le délai de réception ou une requête abandonnée reste sans borne. |
| S07 — Intentions | Intention enregistrée avant mutation directe ; après interruption, statut incertain et copies candidates vérifiées. Aucun rejeu, transaction générale ou garantie de panne physique. | Interruption entre intention/action/reçu ; erreur de persistance ; examiner copies et fichier actuel sans déduire un succès. | Une action est rejouée ou l’absence de reçu est présentée comme succès ou absence d’effet. |

La rotation d’un code compromis reste la procédure d’arrêt et de renouvellement des fichiers d’authentification. La révocation seule ne change pas ce code et ne garantit pas l’effacement instantané du stockage des navigateurs distants. Les procédures sont dans [Sauvegarde](sauvegarde-mise-a-jour.md) et [Dépannage](depannage.md).

## Périmètre d’interface

| Choix | Livraison et limites | Critère et contrôle à conserver | Retour arrière à déclencher si… |
| --- | --- | --- | --- |
| U01 — Focus des conversations | Pas de reconstruction des boutons si le résumé est identique ; conservation du focus lors d’un vrai changement. Le fil n’est pas refondu. | Polling identique puis chat modifié/supprimé : focus même entrée, voisine ou recherche, sans vol de focus hors liste. | Le polling déplace le focus ou empêche d’atteindre le chat voulu. |
| U02 — Textes des droits | Résumé et pied de saisie expriment Aucun/Lecture/Modification, web et scripts séparés. | Combinaisons de profils et options, nouveau chat, Sans projet, fork et déplacement ; vérifier aussi le snapshot envoyé. | Le texte annonce un droit absent ou masque une capacité active. |
| U03 — Brouillons de messages | Session par défaut ; conservation durable volontaire du texte seul pendant 1 h, 24 h ou 7 j, propre à l’appareil/instance ; effacement et téléchargement, déconnexion nettoyante. Éditeur de fichiers exclu. | Expiration, effacement, déconnexion, quotas et stockage refusé ; texte visible préservé avec alerte. Aucune pièce jointe ou autorité durable. | Un texte part seul, la copie ne s’efface pas ou l’interface promet une sauvegarde garantie. |
| U04 — Accord attendu | Badge texte « À valider », titre d’onglet et ouverture vers la carte exacte à partir des métadonnées existantes. Aucun centre ni notification système. | Attente, refus et fin ; bonne carte, pas de faux badge sur historique passif. | Le badge conduit à une autre décision ou une attente reste invisible. |
| U05 — Source des branches | Lien « Voir la conversation source » et rappel des fichiers partagés ; origine indisponible signalée. Aucun graphe ni nouveau menu général. | Source disponible, coupure par message, source déplacée/supprimée ; branche toujours consultable sans rejeu. | La navigation perd la branche ou présente les fichiers comme isolés. |
| U06 — Comparaison | Diff passif d’une action texte : copie précédente vérifiée et fichier actuel seulement si hash identique à l’action. 200 000 octets par version, aperçu 2 000 lignes. Ni fusion ni édition de conflit. | Version identique, ultérieure, copie altérée, mauvais projet, binaire et dépassement ; contenu affiché comme texte passif. | Une version ultérieure est attribuée à l’action ou la comparaison applique un changement. |
| U07 — Deux imports | « Importer dans le projet » conserve sur le PC ; « Importer puis joindre » ajoute aussi les formats compatibles au prochain message dans les places disponibles. Destination et absence d’écrasement conservées. | Import seul, import/jointure, limite de quatre pièces, format incompatible et homonyme ; aucun envoi automatique. | Un import seul est joint ou le statut masque un fichier resté uniquement sur disque. |
| U08 — Annonces | Recherche différée, accord attendu et fin de réponse annoncés via état accessible, annonces identiques dédupliquées. | Polling répété et événements distincts ; aucune annonce de chaque fragment de génération. Essai lecteur d’écran réel encore nécessaire. | Le polling répète continuellement les annonces ou masque un changement utile. |

La commande navigateur versionnée reste volontairement limitée à **deux parcours** : file/navigation/brouillon et refus de script, aux largeurs 320 et 1280 px. Elle ne valide pas tous les comportements du tableau. Les captures et contrôles mécaniques ne constituent pas un essai sur téléphone physique ou une certification d’accessibilité.

## Périmètre technique et de livraison

| Choix | Livraison et limites | Critère et contrôle à conserver | Retour arrière à déclencher si… |
| --- | --- | --- | --- |
| A01 — Parcours partagés | Snapshot partagé dans un cycle, compteurs et benchmark froid/chaud 10/100/1 000 chats. Cache existant conservé ; aucun index, cache LRU, pagination ou nouveau stockage. | Comparer contrôle par projet et cycle partagé avec le même lecteur ; listes/activité après mutations ; mesurer lectures, désérialisations et mémoire sans promettre de gain utilisateur. | Résumé périmé, événement perdu/dupliqué ou reprise régressée. |
| A02 — Images tardives | Sélection de l’historique avant résolution de ses images. Approximation en caractères/coût image conservée, sans nouveau tokeniseur ni changement de plafond de sortie. | Image ancienne exclue et absente, image retenue, code/Unicode, budgets proches des limites et capacités d’instances ; aucun compte exact de tokens inventé. | Une pièce retenue est omise ou les erreurs de contexte augmentent. |
| A03 — Admission | `maxConcurrentInferences: 0` par défaut, option 1–32 ; FIFO par inférence, annulation en attente et créneau libéré pendant accord. Le délai global de trente minutes inclut admission et accord. | Plusieurs chats sous limites 1/2 puis option désactivée ; refus/arrêt/erreur sans blocage des autres ; ordre du chat conservé. | Interblocage, changement d’ordre, perte/rejeu ou attente sans issue. |
| A04 — Diagnostic | Cinq contrôles à la demande, rapport construit par liste blanche, lanceurs et commande. Aucun prompt, modèle lancé, message lu ou envoi distant. | Vérifier Node, accès API/auth, forme modèles, schéma natif et Python facultatif ; erreurs brutes, chemins, jetons et contenu exclus du rapport. | Un champ privé est exporté ou un état inconnu devient un succès. |
| A05 — Fixtures CI | Fixtures Python absolues pour la plateforme, comparaisons canoniques et synchronisation des tests de concurrence corrigées localement. CI publique auditée encore rouge. | Préserver les assertions de confinement et concurrence ; suite Windows locale. **Ubuntu et CI distante sur ce diff non exécutés** : critère multiplateforme restant. | Les tests deviennent verts par suppression d’assertion ou le confinement est affaibli. |
| A06 — Distribution | Stable v1.5.0 / main `5e92da3` 1.8.0 / lot local non publié distingués, checklist, manifeste fermé et préparation d’archive synthétique. Aucun installateur ni auto-update. | Inventaire/hash/CRC/octet du ZIP, extraction vierge et mise à jour de fixtures ; future CI sur commit exact avant publication distinctement autorisée. | Secrets inclus, authentification remplacée ou documentation annonçant une livraison absente. |
| A07 — Fabrique | `createCompanion` importable sans fichier ni port à l’import ; initialisation explicite et injection pour routes. Aucune extraction générale du stockage ou de la génération. | Import sans effets, deux instances isolées et contrats existants sans modification textuelle du serveur dans les tests. | Le comportement change ou l’injection complique les tests sans besoin. |
| A08 — Smoke | Deux parcours synthétiques dans `scripts/browser-smoke.mjs`, Playwright 1.62.1 de développement ; commande, erreurs JS, actions et débordement. Ni CI automatique ni dépendance utilisateur. | Rejeu avec dépendance explicite ; tester aussi la détection d’un envoi volontairement cassé. Clone/extraction propres et limites consignés. | Conversations privées dans sorties, instabilité excessive ou navigateur requis au lancement utilisateur. |

Les mesures A01 exécutées réduisent le motif de deux parcours par projet à un parcours partagé et observent zéro nouvelle lecture JSON à chaud. Le contrôle utilise le même lecteur actuel pour les deux variantes : ce n’est pas une comparaison des serveurs complets avant/après. Les durées restent indicatives ; la mémoire du processus sans isolation ni GC forcé ne démontre aucune économie de mémoire. Les scripts et leurs commandes sont documentés dans [Développement](developpement.md).

## Dépendances conservées

- S01 et A01 partagent la lecture des chats ; l’isolation ne nécessite pas de nouveau cache. U01 complète l’évitement des parcours sans infrastructure commune supplémentaire.
- S02 réutilise les cartes et états d’accord de U04. Le profil de fichiers S03 se décrit avec U02 mais n’accorde aucun pouvoir aux scripts. Les permissions restent figées par demande.
- S04, S07 et U06 réutilisent copies et empreintes ; aucune dépendance n’autorise une transaction, un snapshot général ou une reprise d’action.
- A03 réutilise les états de génération de U04/U08. Une attente humaine libère le créneau sans prolonger le délai global.
- A05, A07 et A08 restent séparables : la fabrique et les parcours navigateur ne sont pas des conditions pour corriger une fixture de CI. A08 n’active pas la CI.
- A06 permet de clarifier la documentation sans attendre la CI ; **publier** nécessite une CI du commit exact et une nouvelle instruction. Une archive locale n’accorde pas cette autorisation.

## Méta-prompts restitués

Les textes suivants sont une restitution des responsabilités et contraintes données au coordinateur et aux agents, **pas une transcription verbatim** de leurs messages. Les premiers agents ont été interrompus par une limite de quota ; le coordinateur a repris l’intégration et une relecture indépendante fraîche a été demandée. Cette répartition ne vaut pas preuve que chaque tâche ou critère a été exécuté par son agent initial.

### Coordinateur et intégration

```text
Vérifie le dépôt, son état et l’écart à 5e92da3, puis travaille uniquement sur
feat/choix-audit-bionic et les 23 choix retenus. Établis les limites avant
d’implémenter. Réserve les fichiers à un seul auteur à la fois. Garde les
historiques natifs en lecture seule et toutes les données de test fictives.

Prends serveur, configuration, lecture/stockage, réception HTTP, admission,
diagnostic et intégration. Isole les chats invalides avec warning sans les
réécrire. Fige les permissions, persiste les intentions avant mutation et
ne rejoue rien. Garde le plafond d’inférences désactivé par défaut, FIFO par
appel ; libère le créneau à l’accord sans modifier le délai global de 30 min.

Reproduis les défauts synthétiques, mesure froid/chaud, intègre les modules
et l’interface, puis exerce les tests et les deux parcours navigateur.
Fais relire par un agent qui n’a pas écrit les changements. Prépare une
archive depuis le manifeste et vérifie uniquement une installation fictive.
Distingue statique, simulation, CI et réel ; aucun push, merge, Release,
redémarrage actif ni projet personnel. Consigne ce qui reste non vérifié.
```

### Agent outils, fichiers, accords et branches

```text
Possède seulement les modules d’outils/fichiers/web/forks attribués et leurs
tests. Ajoute none/read/write avec booléens compatibles et refus serveur des
mutations en Lecture. L’accord web volontaire porte sur chaque query/URL
exacte ; refus et expiration n’appellent rien, redirections refusées en
mode renforcé. Ne présente pas cela comme un contrôle réseau des scripts.

Rends la corbeille listable et récupérable par projet sans chat source,
avec contrôle de portée, copie/hash et destination libre ; ne purge rien.
Fournis une comparaison passive des versions bornées, seulement si le hash
actuel égale celui de l’action. Les forks gardent leurs traces passives sans
autorité transférée. Utilise dépendances injectées et fichiers temporaires,
annonce les limites au coordinateur, sans éditer son serveur en parallèle.
```

### Agent interface

```text
Possède public/ et conserve la disposition compacte. Stabilise les boutons
de conversations et le focus, corrige les textes des permissions, ajoute
les profils et l’accord web séparé. Les brouillons durables sont opt-in,
texte de message seul, à durée choisie, effaçables à la déconnexion ; pas
d’extension à l’éditeur de fichiers.

Ajoute badge À valider et accès à la carte, source disponible d’une branche
avec rappel des fichiers partagés, diff passif borné, deux imports et
annonces dédupliquées. Pas de centre, graphe, fusion ou refonte. Préserve
brouillons et navigation ; vérifie sur API fictive aux largeurs étroites.
Ne déduis aucun essai de téléphone ou lecteur d’écran réel de ce contrôle.
```

### Agent tests, livraison et documentation

```text
Prépare benchmark et deux smoke navigateur reproductibles, sans serveur
Bionic, modèle ou données personnels. Toute dépendance navigateur reste
de développement, sans activation CI automatique. Corrige les fixtures de
chemins de plateforme sans affaiblir confinement ou sérialisation.

Documente seulement les comportements du diff, les commandes, critères,
dépendances, retours arrière et limites. Distingue stable/main/branche,
sans changer le numéro 1.8.0 ni publier. Le manifeste doit inclure toutes
les sources publiques nouvelles, lanceurs et tests ; exclure données,
runtime, node_modules, dist, journaux et travail privé. Laisse les chiffres
finaux au coordinateur après la dernière suite et la preuve d’archive.
```

### Relecteur indépendant

```text
Relis le diff après intégration sans modifier les fichiers des auteurs.
Cherche des cas concrets sur fixtures : schémas de chats, permissions,
autorités historiques, web exact, corbeille, versions, réception, admission,
diagnostic et stockage de brouillons. Signale emplacement, déclencheur,
impact et contrôle reproductible. Fais corriger par le détenteur du fichier,
puis vérifie le correctif. Ne transforme ni une suite locale ni un viewport
simulé en CI verte ou validation de produit exhaustive.
```

## Revenir en arrière

Pour une option, revenez d’abord au réglage précédent : accord web désactivé, profil explicitement choisi, conservation des messages limitée à l’onglet, plafond d’inférences à `0`. Effacer les brouillons supprime leurs copies locales et ne récupère pas un texte déjà perdu.

Pour le programme, conservez une sauvegarde privée et la précédente extraction arrêtée, puis appliquez [le retour de version](sauvegarde-mise-a-jour.md#revenir-à-la-version-précédente). Les fichiers de projet déjà modifiés ne sont pas annulés par un retour du programme. Un journal incertain, une copie de corbeille ou une ancienne approbation ne doit jamais être rejoué automatiquement. Les déclencheurs des tableaux demandent d’isoler et de corriger le comportement concerné avant d’en étendre le périmètre.
