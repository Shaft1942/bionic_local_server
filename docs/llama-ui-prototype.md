# Canaé — interface et entrée unique

Cette candidate utilise une interface Svelte adaptée de llama-ui. Le compagnon conserve l’autorité sur les projets, conversations, fichiers, droits et travaux images. L’interface, le moteur de conversation et le fournisseur d’images ont des rôles distincts.

Fichiers, Images, Activité et Paramètres s’ouvrent dans une fenêtre centrée. Échap, la croix ou un clic sur le fond extérieur ferment la fenêtre et rendent le focus au bouton d’ouverture. Un clic intérieur ou un glissement commencé dedans ne la ferme pas. La conversation et son brouillon restent présents ; fermer les paramètres conserve les modifications non enregistrées en mémoire dans cet onglet. Le raccourci Paramètres en bas à gauche a été supprimé.

Les cases à cocher utilisent leur affichage natif. Les valeurs numériques pour lesquelles une progression a du sens disposent d’un curseur et d’une saisie exacte : LoRA −2 à 20, budget de réponse de 1 à 5 millions de tokens (échelle logarithmique), contexte de lancement et couches GPU du profil llama-server. Un plafond demandé ne garantit pas que le modèle ou le serveur peut l’accepter ; le contexte effectivement confirmé reste l’autorité. Les URL, ports, graines et jetons gardent une saisie adaptée.

## Paramètres dans la webapp

Ouvrir **Paramètres** depuis la navigation ou la barre du projet. Les rubriques sont les suivantes :

- **Conversation** : choisir le modèle à régler et son plafond de réponse, globalement ou pour cette conversation. Les instances Bionic peuvent être déchargées avec confirmation.
- **Serveurs du PC → Moteurs d’inférence** : sélectionner Bionic ou llama-server, préparer leurs adresses et jetons séparés, tester/appliquer la connexion ; configurer les profils et le lancement Bionic et llama-server. Bibliothèque GGUF, contexte et couches GPU restent configurables ici. Le registre des fournisseurs présente les seuls moteurs implémentés ; ajouter un moteur demande aussi son adaptateur et ses contrôles.
- **Serveurs du PC → Génération d’images** : adresse et activation ComfyUI, découverte bornée, workflow, deux LoRA par profil et forces, contrôle de compatibilité, politique du modèle texte et nettoyage après workflow ; configuration et commandes explicites du serveur ComfyUI. Les nonces, révisions et accords restent ceux du serveur.
- **Apparence et brouillons** : thème système/clair/sombre, français/anglais et durée des brouillons (onglet, une heure, un jour, sept jours). Ces choix sont propres au navigateur et à l’instance. Effacer les brouillons ne supprime ni les conversations ni le suivi des demandes.
- **Connexion sécurisée** : état HTTP/HTTPS/mTLS, autorité publique, appareils, création/révocation et préparation guidée. Les changements de transport conservent leurs preuves et confirmations. Les exports privés restent temporaires et ne sont pas mémorisés dans les préférences.
- **Mises à jour et diagnostic** : canal Stable/Bêta, vérification, installation explicite, diagnostic et liens d’aide. Une installation est refusée tant qu’un fichier modifié doit être sauvegardé.

Les formulaires visités restent en mémoire en changeant de rubrique ou d’espace. Les champs secrets ne sont pas stockés par les brouillons du navigateur ; recharger la page abandonne ces saisies non enregistrées. Les actions dont le résultat est inconnu se vérifient par lecture, sans réémission automatique.

## Connexion et installation initiale

L’installation initiale définit notamment le port d’écoute et les chemins nécessaires au démarrage. Canaé est la seule interface ; aucun réglage de mode n’est nécessaire.

- `/` ouvre Canaé, indépendamment du moteur d’inférence.
- Les anciens favoris `/prototype`, `/prototype/`, `/legacy` et `/legacy/` redirigent vers `/`.
- `/llama-ui/index.html` redirige aussi vers l’entrée canonique ; les assets compilés restent servis sous `/llama-ui/assets/`.
- Les autres anciennes pages et les scripts/styles de l’ancienne interface ne sont plus exposés par HTTP. Leur présence éventuelle dans les sources ou une sauvegarde de mise à jour ne rend pas une seconde interface accessible.

## Entrée unique et mise à jour depuis la 2.5

Installer la mise à jour avec le parcours habituel, puis recharger l’adresse du compagnon. Le code nouveau sert Canaé même si la configuration privée conservée contient `"uiMode":"legacy"` ou si le lanceur transmet encore `BIONIC_MOBILE_UI_MODE=legacy`. Les valeurs historiques `legacy` et `llama` restent lisibles ; elles désignent maintenant la même interface. Une valeur inconnue reste une erreur de configuration. Cette normalisation s’effectue en mémoire, sans remplacer `config.local.json`.

Les ports, chemins, connexions, identité d’installation, code d’accès, certificats et conversations restent ceux de l’installation. Les brouillons déjà créés dans Canaé gardent leur stockage par instance et navigateur ; aucune importation implicite d’un ancien brouillon d’interface n’est effectuée. Les API, téléchargements authentifiés et preuves de certificat conservent leurs routes et protections. Les redirections n’ajoutent pas de droit et ne recopient aucun paramètre d’URL dans leur destination.

Les anciens fichiers publics peuvent rester présents après une première mise à jour sans référence de sources, afin de préserver d’éventuels travaux locaux ; le serveur ne les sert plus comme interface. Ne pas supprimer les historiques ni les configurations privées pour changer d’affichage. Si un ancien onglet affiche encore son contenu déjà chargé, recharger `/` pour ouvrir Canaé.

## Moteurs et modèles

Le changement d’inférence se fait ensuite dans la webapp, sans redémarrer le compagnon. L’application conserve ses choix dans un fichier privé local ; il prime sur les valeurs initiales au prochain démarrage. Les jetons ne sont jamais renvoyés par l’API de lecture et ne passent pas d’un fournisseur à l’autre. Modifier une adresse exige de remplacer ou effacer explicitement son ancien jeton.

Sur le PC de cette préversion, la bibliothèque autorisée est `E:/AI/Models`. Seuls les répertoires autorisés et leurs sous-dossiers sont parcourus avec des bornes ; les liens et projecteurs multimodaux sont exclus du profil texte. Les en-têtes sont lus sans parcourir les poids. La présence d’un GGUF ne garantit pas sa compatibilité avec la version de llama-server installée. Le fichier est ouvert à son emplacement d’origine, comme par Bionic.

Le profil possédé utilise un port distinct (1238 par défaut) et zéro couche GPU initialement. Le serveur externe sur 1237 ne peut pas être adopté ou arrêté. Un modèle encore chargé dans un moteur configuré bloque le nouveau lancement ; son état ambigu bloque également l’opération. Les modifications de dossier, binaire et port exigent le navigateur du PC serveur ; la sélection d’un modèle de cette bibliothèque est accessible sur le réseau authentifié.

Avec llama-server actif, le champ **Modèle** existant propose le modèle actuellement chargé et les **Fichiers GGUF** de la bibliothèque. Sélectionner un GGUF demande confirmation, puis charge ou remplace seulement le processus possédé ; après vérification du modèle, de son alias et de son contexte, Canaé applique sa connexion aux prochains messages. Il n’y a ni second sélecteur ni bouton de chargement dans le composer. Une annulation ou un refus remet le modèle actif dans le champ. Pendant une opération non confirmée, ce même champ indique le chargement ou la vérification ; son suivi est relu automatiquement sans nouvelle soumission. Avec Bionic, la liste habituelle des modèles est conservée.

Le bouton **Modèles chargés**, à côté de la déconnexion dans la navigation gauche, affiche les instances en mémoire et leur contexte, y compris les embeddings Bionic. Leur déchargement est confirmé explicitement et refusé pendant les travaux concernés. Pour llama-server, seul un processus possédé par Canaé peut être arrêté depuis ce menu. Le serveur direct externe ne dispose pas d’une commande de déchargement prise en charge par ce connecteur et n’est pas adopté. Un résultat perdu est vérifié par lecture, sans second envoi.

Le chargement bloque les nouveaux envois et changements concurrents ; les réponses/images actives ou incertaines le refusent. L’intention est enregistrée avant effet dans un journal privé. Après perte de réponse, la lecture de son suivi peut terminer l’activation d’un processus déjà confirmé ; elle ne lance ni n’arrête aucun processus. Un état incertain demande une vérification et n’autorise aucune nouvelle soumission automatique. Les brouillons et permissions restent conservés. Passer au profil possédé efface, après confirmation, le jeton llama-server externe afin qu’il ne traverse pas cette nouvelle connexion ; le jeton Bionic reste séparé.

Un lancement manuel depuis les paramètres conserve la possibilité de sélectionner ensuite la connexion dans **Serveurs du PC → Moteurs d’inférence**. Les commandes sur Bionic, ComfyUI et llama-server restent indépendantes du choix du fichier.

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

Les tests synthétiques qualifient les contrats, pas un rendu ComfyUI réel, le GPU ou un téléphone physique. llama-server direct exige un modèle chargé et un contexte confirmé. Son déchargement par API est indisponible : un réglage global « Décharger » est appliqué en mode « Alterner », avec sérialisation des travaux locaux et modèle conservé ; une demande explicite « Décharger » reste refusée avant effet. Aucune libération de mémoire GPU n’est confirmée par cette alternance. Les installations, ports, certificats système et allocations matérielles nécessitent leur qualification initiale.
