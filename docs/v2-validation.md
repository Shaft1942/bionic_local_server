# Validation du candidat V2

22 octobre 2026. Ce registre contient les contrôles de ce chantier. Les chiffres
d'anciens rapports ne sont pas des résultats de la V2.

## Registre des preuves

| Lot | Contrôle | État de ce registre |
| --- | --- | --- |
| Sources | Trois chats relus, audit et docs des sources comparés | Effectué ; intégration Krea2 ultérieure à l'audit identifiée |
| Budget modèles | Automatique, manuel, portée session / durable, clamp | Agent budget : lot intégré de **156 tests réussis** incluant six tests dédiés ; chiffres communs non additionnables |
| Troncature | Réponse limitée et appel outil incomplet | Agent budget : reçu et réponse sauvegardée avec `length`, couverture par le lot intégré |
| ComfyUI | Configuration, endpoints réels, graphes, jobs et images | **15 tests ciblés réussis** ; précontrôle réel local/LAN ; rendu Krea2 V2 réel réussi dans une instance isolée, preuve ci-dessous |
| Mémoire d'outils | Sources transmises, borne, liste blanche, aucune autorité | **8 tests du module réussis** ; agent budget : intégration au tour suivant contrôlée dans le lot de 156 |
| Routes Paramètres | Authentification, origine, persistance et test sans rendu | Chef de projet : **4 tests HTTP réussis**, vrais handlers et services injectés sans socket |
| Interface | Paramètres, fermeture, focus, mobile et brouillons | **12 parcours navigateur réussis** à **320 et 1280 px** : quatre historiques, deux V2 et six multiprojets ; six tests unitaires de l'arbre inclus dans la suite |
| Régression | Suite complète et syntaxe | **441 tests réussis**, aucun échec ni test ignoré ; **81 fichiers JavaScript** contrôlés |
| Distribution | Manifeste et liste publique | **159 sources exportables** contrôlées ; l'archive à déployer doit être reconstruite après le gel des présentes sources |
| Mise à jour | Répétition isolée 1.11.0 → 2.0.0 | Réussie via l'installateur transactionnel, version/PID et conservation chats/auth contrôlés ; détail du premier retour arrière ci-dessous |

## Ce que les preuves doivent distinguer

- Une réponse HTTP d'un service local confirme cette route à cet instant.
- Un graphe accepté par le précontrôle ne prouve pas un rendu GPU réussi.
- Un job soumis n'est réussi que lorsque sa sortie réelle est récupérée.
- Un test de modèle injecté vérifie la boucle du compagnon et pas la fidélité de tous les modèles locaux.
- Une ancienne image obtenue avant ce chantier prouve l'intégration précédente, pas les modifications V2.
- Un navigateur à viewport réduit ne constitue pas un téléphone physique.
- Une archive locale et ses tests ne prouvent ni publication ni CI distante.

## Mémoire courte des outils

Commande exécutée : `node --test test/tool-memory.test.mjs`.
Les huit cas vérifient les sources de fichiers transmises avec empreinte et projet,
l'exclusion des champs arbitraires, du code et des sorties brutes de scripts, la
distinction résultat de recherche/page lue, le retrait des query/fragments d'URL,
l'absence d'extrait après échec, la citation JSON des données, les bornes strictes,
la priorité aux actions récentes, l'immuabilité et les états de jobs non terminés.
Ils n'appellent aucun modèle, fichier de projet, réseau ou moteur de script.

Les extraits de fichiers restent des données historiques déjà transmises : ils
ne donnent pas une version actuelle ni un droit d'écriture. Le filtre de noms et
motifs sensibles est prudent ; il ne prétend pas identifier tous les secrets
possibles d'un document. Les sorties brutes de scripts et les objets d'accord
sont exclus par structure plutôt que par ce filtre.

## Routes des paramètres

Commande exécutée : `node --test test/v2-settings-http.test.mjs`.
Les quatre tests traversent les handlers de production sans ouvrir de port.
Ils vérifient HTTP 401 sans session, 403 depuis une origine étrangère, la
persistance après redémarrage de la fixture, les entrées invalides sans mutation,
le précontrôle de connexion via GET `/system_stats`, `/queue`, `/object_info`,
une incompatibilité de modèle, et le refus 409 d'une demande d'image lorsque
l'intégration est désactivée. Aucun POST `/prompt` ni appel d'inférence n'est
effectué. Le catalogue conserve la lecture seule des historiques natifs et
annonce l'absence d'héritage des outils Desktop.

Les premiers essais de certains autres lots ont rencontré `EPERM` dans le TEMP
système ou lors d'une connexion loopback du bac à sable. Les tests purement
locaux ont été relancés avec TEMP/TMP sous `work/` ; l'agent ComfyUI a exécuté
son test HTTP local hors de cette restriction. Ces erreurs d'environnement ne
sont pas comptées comme des résultats produit réussis ou ignorées silencieusement.

## Essai réel avec Bionic et Krea2

La [preuve structurée](history/v2-live-proof.json) du 22 octobre 2026 utilise une
instance isolée du compagnon et le modèle déjà chargé
`google/gemma-4-12b-qat`, contexte configuré à **262 144 tokens**.
Le reçu et les corps réellement envoyés à Bionic montrent un plafond automatique
de **8 192 tokens**, puis le choix manuel de **512 tokens** dans la conversation.
Les petites réponses de contrôle ne remplissent pas ces plafonds : elles vérifient
le réglage transmis, sans prétendre mesurer une génération de 8 192 tokens.

Le prompt d'image a provoqué l'appel réel `generate_comfy_image`, le suivi du
workflow `krea2_turbo`, la récupération d'un PNG **1024 × 1024**, seed **43**,
**916 993 octets**, SHA-256
`14e53ab53b25cf97b6483b559a7383a0e13ca528c00d5a5e2a374a5ec32e0861`.
La preuve porte le statut `succeeded` après récupération de la sortie, et le
coordinateur a inspecté l'image. Il ne s'agit ni d'un simple HTTP 200 ni d'une
soumission seule. Aucun rendu HassakuXL ou de la chaîne mixte n'est déduit de cet
essai Krea2, et cette instance isolée ne valide pas encore l'installation active.

## Parcours navigateur et derniers changements

`scripts/browser-v2.mjs` utilise l'interface réelle et des transports simulés.
Le coordinateur a vérifié les réglages par modèle et conversation, la persistance
volontaire, le test ComfyUI sans sauvegarde implicite, la fermeture par Échap et
le retour du focus, l'envoi effectif des permissions et du plafond, le message
de troncature et l'absence de débordement aux largeurs 320 et 1280 px.
Les captures locales se trouvent sous `browser-test-results/`, hors distribution.
Ces parcours n'utilisent pas un téléphone physique.

La demande ultérieure d'un arbre de projets repliables modifie la barre latérale.
Ses six tests ciblés passent : groupes réels, pagination et focus, ouverture
paresseuse sans changer de projet, recherche dont la portée est explicite,
erreur avec reprise, invalidation d'une réponse devenue ancienne après mutation,
et nettoyage à la déconnexion. La revue a fait corriger le cas d'une réponse
devenue ancienne qui laissait un projet bloqué en chargement.
Les six parcours navigateur multiprojets passent également : navigation,
recherche et brouillons ; réponse tardive après déconnexion ; navigation rapide,
chacun aux deux largeurs. L'aperçu mobile de l'arbre a été inspecté.

Les preuves locales finales sont `work/browser-smoke-final.json`,
`work/browser-v2-final.json` et `work/browser-tree-final.json` : **12 parcours
réussis** au total. Le journal final `work/v2-tests-final.tap` contient **441 tests
réussis**, zéro échec et zéro test ignoré. Le contrôle syntaxique porte sur
**81 fichiers JavaScript** ; le manifeste distribue **159 sources publiques**.
Les lots de 156, 15, 8 et 4 tests cités plus haut partagent des cas avec la suite
et ne s'additionnent pas aux 441. L'ancien journal `work/v2-tests.tap` est un
instantané intermédiaire de 435 tests.

## Répétition de la mise à jour

Le coordinateur a répété la mise à jour complète de **1.11.0 vers 2.0.0** dans
une installation isolée, via `scripts/deploy-local.mjs` et l'installateur
transactionnel existant. Le résultat a été confirmé sur le port de test **64595**,
PID **40684**, travail `515d018f-524e-44fa-b086-f2f3c6e77a17`. Les empreintes des
conversations synthétiques et de l'authentification ont été conservées.

La première répétition a effectué un retour arrière avec `recovered:true`.
Sa cause initiale n'a pas été identifiée. La réapplication du même plan a ensuite
réussi. Ce résultat valide la répétition et montre un rétablissement constaté ;
il ne transforme pas l'échec initial en succès ni en cause résolue.

La revue du premier script d'overlay a conduit à réutiliser le mécanisme
transactionnel testé pour le contrôle des sources, le redémarrage, l'identité du
processus et le retour arrière. Une référence de sources périmée ne peut être
réconciliée qu'après comparaison avec une source explicitement connue ; les
éventuels écarts de fins de ligne CRLF/LF sont comptés séparément dans la preuve.
Les jobs ComfyUI V1 déjà terminés sont adaptés en mémoire sans réécriture gratuite
de leurs fichiers ; les changements d'état effectifs restent persistés.

## Installation personnelle

**Déploiement confirmé le 22 octobre 2026** : la version 2.0.0 répond sur le
port 8769. Le worker transactionnel a terminé avec le job
`a73fc216-2036-4041-bc5b-78f95170d4eb`. L’identité de l’installation est conservée,
et les empreintes des quatre conversations web, de l’authentification et de la
configuration locale ont été contrôlées sans changement. Une sauvegarde complète
privée est conservée dans `work/private-backups` ; ce dossier est exclu de Git
et des archives publiques.

La référence de mise à jour était restée en 1.10.0 après l’ajout local de Krea2.
Avant de la réconcilier, les **124 fichiers de la distribution 1.11.0** ont été
comparés aux sources récupérées : mêmes contenus, avec **15 différences de fins
de ligne seulement**. La nouvelle référence couvre les empreintes exactes de
l’installation 2.0.0.

L’activation ComfyUI est le changement de configuration explicitement demandé :
`http://127.0.0.1:8188`, profil `krea2_turbo`. Le navigateur réel a confirmé les
**six groupes de projets**, le contrôle de connexion/modèles sans rendu et
l’affichage d’une image Krea2 existante de 1024 pixels de large. Aucune erreur
JavaScript n’a été relevée. Ces contrôles ont utilisé Edge sans fenêtre visible
sur le PC ; aucun essai sur téléphone physique n’est revendiqué.

La preuve privée détaillée se trouve dans `work/deployment-proof.json` et dans
la sauvegarde. Elle contient le chemin de l’installation et reste hors distribution.

Le développement travaille sur `E:\Projets\bionic_local_compagnon`. Les tests
utilisent des conversations synthétiques. Le rendu de validation et le déploiement
autorisés sont distingués des contrôles de connexion sans génération ci-dessus.

Voir [le périmètre et les critères](v2-plan.md).
