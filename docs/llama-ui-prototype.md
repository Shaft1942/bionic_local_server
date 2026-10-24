# Canaé et llama-ui — 2.6.0-beta.3

Cette candidate utilise une interface Svelte adaptée de llama-ui. Le compagnon conserve l’autorité sur les projets, conversations, fichiers, droits et travaux images. L’interface, le moteur de conversation et le fournisseur d’images ont des rôles distincts.

Fichiers, Images, Activité et Paramètres s’ouvrent dans une fenêtre centrée. Échap ou la croix ferment la fenêtre et rendent le focus au bouton d’ouverture. La conversation et son brouillon restent présents ; fermer les paramètres conserve les modifications non enregistrées en mémoire dans cet onglet. Le raccourci Paramètres en bas à gauche a été supprimé.

Les cases à cocher utilisent leur affichage natif. Les valeurs numériques pour lesquelles une progression a du sens disposent d’un curseur et d’une saisie exacte : LoRA −2 à 20, budget de réponse de 1 à 5 millions de tokens (échelle logarithmique), contexte de lancement et couches GPU du profil llama-server. Un plafond demandé ne garantit pas que le modèle ou le serveur peut l’accepter ; le contexte effectivement confirmé reste l’autorité. Les URL, ports, graines et jetons gardent une saisie adaptée.

## Paramètres dans la webapp

Ouvrir **Paramètres** depuis la navigation ou la barre du projet. Les rubriques sont les suivantes :

- **Conversation** : sélectionner Bionic ou llama-server, saisir leurs adresses locales et éventuellement des jetons séparés, tester la connexion, appliquer le moteur actif, régler le plafond de réponse par modèle ou conversation. Un seul moteur est actif à la fois. Les modèles sont actualisables et les instances Bionic déchargeables avec confirmation.
- **Images et ComfyUI** : adresse et activation du fournisseur, découverte bornée, workflow, deux LoRA par profil et forces, contrôle de compatibilité, politique du modèle texte et nettoyage après workflow.
- **Modèles llama-server** : bibliothèque GGUF partagée, profil de lancement possédé, choix du fichier, contexte et couches GPU, démarrage/remplacement/arrêt explicites. Aucun téléchargement ni chargement automatique.
- **Serveurs du PC** : état, profil de lancement, détection d’une installation, choix natif sur le PC et commandes explicites Bionic/ComfyUI. Les nonces, révisions et accords restent ceux du serveur.
- **Apparence et brouillons** : thème système/clair/sombre, français/anglais et durée des brouillons (onglet, une heure, un jour, sept jours). Ces choix sont propres au navigateur et à l’instance. Effacer les brouillons ne supprime ni les conversations ni le suivi des demandes.
- **Connexion sécurisée** : état HTTP/HTTPS/mTLS, autorité publique, appareils, création/révocation et préparation guidée. Les changements de transport conservent leurs preuves et confirmations. Les exports privés restent temporaires et ne sont pas mémorisés dans les préférences.
- **Mises à jour et diagnostic** : canal Stable/Bêta, vérification, installation explicite, diagnostic et liens d’aide. Une installation est refusée tant qu’un fichier modifié doit être sauvegardé.

Les formulaires visités restent en mémoire en changeant de rubrique ou d’espace. Les champs secrets ne sont pas stockés par les brouillons du navigateur ; recharger la page abandonne ces saisies non enregistrées. Les actions dont le résultat est inconnu se vérifient par lecture, sans réémission automatique.

## Connexion et installation initiale

L’installation initiale définit notamment le port d’écoute et les chemins nécessaires au démarrage. Le mode d’interface `uiMode` accepte `legacy` (valeur initiale) ou `llama` dans la configuration initiale ; équivalent `BIONIC_MOBILE_UI_MODE`.

- `/` ouvre l’interface sélectionnée.
- `/prototype/` ouvre llama-ui lorsque son build est installé.
- `/legacy/` conserve l’ancienne interface sur les mêmes API et conversations.

Le changement d’inférence se fait ensuite dans la webapp, sans redémarrer le compagnon. L’application conserve ses choix dans un fichier privé local ; il prime sur les valeurs initiales au prochain démarrage. Les jetons ne sont jamais renvoyés par l’API de lecture et ne passent pas d’un fournisseur à l’autre. Modifier une adresse exige de remplacer ou effacer explicitement son ancien jeton.

Sur le PC de cette préversion, la bibliothèque autorisée est `E:/AI/Models`. Seuls les répertoires autorisés et leurs sous-dossiers sont parcourus avec des bornes ; les liens et projecteurs multimodaux sont exclus du profil texte. Les en-têtes sont lus sans parcourir les poids. La présence d’un GGUF ne garantit pas sa compatibilité avec la version de llama-server installée. Le fichier est ouvert à son emplacement d’origine, comme par Bionic.

Le profil possédé utilise un port distinct (1238 par défaut) et zéro couche GPU initialement. Le serveur externe sur 1237 ne peut pas être adopté ou arrêté. Un modèle encore chargé dans un moteur configuré bloque le nouveau lancement ; son état ambigu bloque également l’opération. Une fois le profil démarré explicitement, sa connexion se sélectionne dans **Conversation**. Les modifications de dossier, binaire et port exigent le navigateur du PC serveur ; la sélection d’un modèle de cette bibliothèque est accessible sur le réseau authentifié.

La propriété du processus repose sur son handle enfant, jamais sur un PID seul. Une déconnexion du navigateur ne le relance pas. Après un redémarrage du compagnon, un ancien processus encore présent reste détecté sans être adopté : son arrêt se fait sur le PC. Ce profil doit être réservé à Canaé ; les demandes qu’un client tiers lui enverrait directement ne sont pas comptées comme travaux de Canaé.

La sécurité utilise le contrôleur de transport normal du compagnon. HTTP, HTTPS et mTLS restent distincts ; attacher ce contrôleur n’active pas HTTPS. La préparation exige une preuve depuis le navigateur avant activation. Les clés de l’autorité ne sont jamais exportées ; les exports d’appareils sont temporaires, liés à la session et à usage unique, et ne sont pas proposés depuis une connexion HTTP. Les essais automatisés utilisent des certificats synthétiques ; la confiance d’un téléphone physique doit être vérifiée sur cet appareil.

Le contrôle de connexion lit uniquement le catalogue et les propriétés, avec bornes de temps et de taille. Il ne charge aucun modèle. Le changement de moteur est refusé pendant une réponse, une attente, une image, une approbation ou un effet inconnu. Après une gestion Bionic ambiguë, **Actualiser les modèles** relit le catalogue et réconcilie l’état sans rejouer le chargement ou le déchargement. Voir [les limites de llama-server](llamacpp.md).

## Conversations et projets

La navigation permet de créer un projet et d’ouvrir directement un nouveau chat dans chaque projet, y compris replié. Les dossiers d’un projet importé sont adoptés explicitement avec leurs droits. Les historiques natifs restent en lecture seule ; une suite et une branche sont des conversations locales avec leur origine conservée.

Les menus permettent de renommer, déplacer, masquer/supprimer et créer une branche depuis une conversation ou un message. Une branche ne rejoue aucune action, approbation ou génération passée. Les listes et historiques longs ont une pagination ; charger les messages précédents conserve l’ancrage de lecture.

Chaque brouillon conserve le texte, les pièces jointes, le modèle et les choix d’outils. Les permissions fichiers, Internet, scripts, images, workflow et quantité sont capturées à l’envoi. Internet est proposé par défaut, et les images si le fournisseur configuré est disponible ; un choix explicitement désactivé reste respecté. Les scripts et appels web soumis à accord présentent leur proposition exacte.

Une demande active ne bloque pas les autres chats. Les messages suivants de la même conversation rejoignent la file du serveur. Fermer le flux réseau ou la page ne vaut pas annulation ; le contrôle d’arrêt vise une demande identifiée. Après une coupure, le suivi relit l’état serveur puis la conversation et ne renvoie aucun message automatiquement.

## Fichiers, activité et images

Les fichiers autorisés peuvent être consultés, importés, joints et modifiés avec contrôle de version. Un conflit conserve le brouillon et permet de comparer le serveur. L’espace **Activité** rassemble les réponses depuis l’absence, les copies livrables, les actions et versions et la corbeille. Les restaurations vérifient le projet, la source et le hash courant.

Tous les moteurs de conversation utilisent le même outil de génération d’images et les mêmes permissions. ComfyUI est le fournisseur actuellement distribué. Le chat peut demander une série de **1 à 5 images**, avec politique mémoire figée. L’atelier propose la génération directe d’une image, les variantes explicites, le suivi de chaque job, la galerie et le ZIP. Une série reste une demande contenant plusieurs jobs distincts.

Un contrat interne `image-jobs-v1` permet d’intégrer un autre fournisseur d’images sans changer le connecteur d’inférence. Il exige notamment des identités de travaux durables, la reprise par propriétaire, les états incertains et les octets d’image locaux. Les noms historiques des outils et les routes `/api/comfy` restent des interfaces de compatibilité. Un futur adaptateur réel et ses écrans de configuration doivent être implémentés et qualifiés ; aucun fournisseur supplémentaire n’est proposé fictivement.

## Construire et vérifier

Node.js 24+ est requis. Les dépendances frontend servent à construire les assets ; une archive précompilée n’exige ni Vite ni installation npm pour démarrer.

```powershell
npm --prefix ui ci
npm --prefix ui run check
npm run build:ui
npm test
npm run check:export
```

Les parcours navigateur reproductibles sont `scripts/browser-llama-ui.mjs`, `browser-llama-settings.mjs`, `browser-llama-advanced.mjs` et `browser-llama-conservation.mjs`. Ils emploient des fixtures et des moteurs synthétiques, jamais les projets personnels ni le GPU. Les composants dérivés conservent [leur provenance](../ui/UPSTREAM.md) et [la licence amont](../ui/LICENSE.llama.cpp). Le stockage IndexedDB des conversations et les outils du navigateur amont ne deviennent pas des autorités du compagnon.

## Démonstration isolée et limites

```powershell
npm run start:prototype -- --port 8878
```

Le runner crée un dossier distinct et refuse un dossier non vide sans son marqueur. Son code public de démonstration est `prototype-260` ; il écoute uniquement en boucle locale. Ce code n’est pas celui d’une installation personnelle. Les projets, fichiers, modèle et ComfyUI y sont simulés.

Pour un moteur déjà démarré explicitement, ajouter `--llama-url http://127.0.0.1:1237`. Seuls le catalogue, les propriétés et les échanges de conversation de cette origine sont alors permis ; ComfyUI reste simulé. La fixture ne permet pas de remplacer ses connexions par des serveurs personnels depuis les paramètres.

Les tests synthétiques qualifient les contrats, pas un rendu ComfyUI réel, le GPU ou un téléphone physique. llama-server direct exige un modèle chargé et un contexte confirmé ; son déchargement et les politiques images qui l’exigent restent refusés avant rendu. Les installations, ports, certificats système et allocations matérielles nécessitent leur qualification initiale.
