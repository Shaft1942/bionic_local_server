# Contrat de capacités du compagnon

`GET /api/companion-capabilities` fournit un JSON descriptif `schemaVersion: 1` aux clients authentifiés. Il utilise les gardes habituelles de transport, hôte, réseau local et session de [server.mjs](../server.mjs). Aucun paramètre de requête n'est accepté (400) ; aucune mutation n'est proposée (POST : 404). La réponse porte `Cache-Control: no-store`.

Ce contrat est une projection des services existants dans [companion-capabilities.mjs](../lib/companion-capabilities.mjs). Les services et routes d'action continuent de valider chaque intention : la réponse n'accorde aucun droit et ne garantit aucune génération. Les anciens `/api/capabilities`, `/api/status`, `/api/models` et `/api/image-provider` conservent leurs contrats.

## Structure versionnée

Les propriétés nouvelles sont additives. Un client doit ignorer les champs inconnus et traiter les états ou versions inconnus comme inconnus. Chaque support a la forme `{ state, reasonCode }` avec `state: supported | unsupported | unknown`. `reasonCode` est null pour un support confirmé ; il est destiné à une traduction locale, jamais à être interprété comme une autorisation.

| Champ | Signification |
| --- | --- |
| `schemaVersion` | Entier 1, indépendant de la version de l'application |
| `inference.provider` | `bionic`, `llamacpp` ou `unknown` |
| `inference.revision` | Révision opaque du moteur capturée avant la lecture, ou null |
| `inference.support.chat` | Support du protocole du connecteur, sans promesse de joignabilité |
| `inference.support.modelManagement` | Chargement/déchargement via l'API du moteur du connecteur ; Bionic oui, llama.cpp direct non |
| `inference.catalogue` | `{ state: observed | unknown, reasonCode }` ; observed confirme seulement une lecture valide du catalogue |
| `inference.models` | Liste des modèles LLM du catalogue observé, vide si inconnu |
| `images.providerId` | Identifiant public du fournisseur d'images ou `unknown` |
| `images.support` | Méthodes proposées par le fournisseur d'images actif |
| `images.enabled` | Activation configurée : true, false ou null si inconnue |
| `images.reachability` | Toujours `{ state: unknown, reasonCode: not-probed }` dans cette version |
| `images.availability` | `blocked / image-disabled` si désactivé, sinon unknown avec raison |
| `images.parameters.imageCount` | Support de l'image, min 1, max 5 avec lots, 1 sans lots, null si inconnu |
| `permissions` | Conditions par requête, aucune permission effective projet/chat/message |

Les supports images sont `singleImage`, `batch`, `series`, `history`, `retry`, `cancelQueued`, `recoveryByOwner`, `localImageBytes`, `lifecycle` et `workflowSelection`. Ils viennent de [image-provider.mjs](../lib/image-provider.mjs), qui inspecte les méthodes proposées par le service. Ils ne décrivent ni un moteur distant ni les modèles installés dans ComfyUI. Aucun processus n'est lancé et aucun appel à `available()` ou `checkConnection()` n'est effectué.

## Modèles et paramètres réellement pris en charge

Chaque modèle expose `id`, `loaded` (booléen ou null), `contextLength` (entier positif ou null), `support` et `parameters`. Les noms libres, endpoints, tokens, métadonnées brutes et messages d'erreur distants sont exclus. Un catalogue malformé, ambigu (identifiants dupliqués), excessif ou contenant un jeton configuré dans un identifiant n'est pas restitué.

`support.tools` vient du champ utilisé par le garde d'outils du serveur ; il peut être inconnu. Bionic rapporte vision et options d'effort par modèle. Le connecteur llama.cpp direct ne qualifie ni vision ni effort et rapporte les outils comme inconnus. Un support inconnu ne doit pas être présenté comme un support confirmé ou une interdiction démontrée du moteur distant.

| Paramètre du contrat | Détails | Propriétaire de l'effet |
| --- | --- | --- |
| `maxOutputTokens` | `{ support, min: 1, max: 5000000, automatic: 8192, contextBound: true }` ; borne de préférence, réduite selon le budget de contexte | [model-preferences.mjs](../lib/model-preferences.mjs), puis `max_tokens` du transport |
| `reasoningEffort` | `{ support, options }` ; uniquement les choix Bionic annoncés et validés, liste vide sinon | [reasoning.mjs](../lib/reasoning.mjs), puis `reasoning_effort` du transport |
| `temperature`, `topP`, `topK`, `seed`, `repeatPenalty` | `{ support: { state: unsupported, reasonCode: parameter-not-forwarded } }` | Le [transport](../lib/model-transport.mjs) ne les transmet pas pour le texte |

Le `seed` non pris en charge ici concerne le texte. Les paramètres image seed/format/LoRA restent dans les contrats existants des workflows ; ils ne sont pas ajoutés à ce premier lot. `loaded` et `contextLength` sont des observations du catalogue, pas un reçu d'admission ou de réservation GPU.

`modelManagement: unsupported` pour llama.cpp décrit uniquement l'API du connecteur direct. Le chargement d'un GGUF par lancement de llama-server avec un profil possédé reste une capacité distincte du superviseur local et du sélecteur de modèles existants, hors de cette première projection. Un client ne doit pas utiliser ce champ pour masquer ou nier ce parcours.

`permissions.fileAccess` porte `request-scoped / file-profile-required`, `webAccess` porte `request-scoped / web-access-required`, `scriptAccess` porte `request-scoped / exact-code-approval-required`, `imageAccess` porte `request-scoped / image-access-required`. Un projet de travail, le profil de fichiers et les accords exacts restent contrôlés au point d'effet. Les scripts sur PC demandent toujours la validation humaine du code précis.

## Raisons et récupération

| Code stable | Sens et parcours client |
| --- | --- |
| `not-supported` | Fonction non prise en charge par le connecteur ou modèle décrit |
| `model-capability-unknown` | Capacité du modèle non confirmée |
| `provider-unknown` | Connecteur non identifié par cette version |
| `parameter-not-forwarded` | Paramètre non transmis par le transport actuel |
| `catalogue-unavailable` | Lecture du catalogue refusée ou échouée ; une nouvelle lecture peut récupérer |
| `catalogue-invalid` | Catalogue non exploitable ; aucune métadonnée brute exposée |
| `inference-changed` | Connexion modifiée pendant la lecture ; ignorer ces observations et actualiser |
| `image-capability-unknown` | Méthode image non déclarée par le descripteur |
| `image-settings-unknown` | Activation non observable |
| `image-disabled` | Génération désactivée dans les réglages |
| `not-probed` | Aucune sonde réseau effectuée pour les images |

La lecture du catalogue utilise seulement `modelService.list()` : `/api/v1/models` pour Bionic ou `/v1/models` et `/props` pour llama.cpp. Ce GET ne charge/décharge aucun modèle, ne soumet aucun prompt, ne réconcilie aucun journal de mutation et n'acquiert aucune ressource. Si la révision change pendant l'attente, la réponse garde l'identité initiale avec catalogue inconnu et liste vide. Une nouvelle lecture actualise les observations ; aucune intention d'action n'est rejouée.

Le contrat est vérifié par [companion-capabilities.test.mjs](../test/companion-capabilities.test.mjs) sur dépendances et protocoles synthétiques, sans listener ni moteur. Les tests ne qualifient pas le GPU, une installation de Bionic/llama.cpp/ComfyUI ni un téléphone.
