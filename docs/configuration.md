# Configuration

Le moteur texte peut être choisi par `inferenceProvider` : `bionic` (défaut) ou `llamacpp`. Pour ce dernier, `llamaUrl` désigne un serveur direct en boucle locale, sans suffixe `/v1`, sur un port distinct des autres services ; défaut `http://127.0.0.1:1236`. Variables : `BIONIC_MOBILE_INFERENCE_PROVIDER`, `BIONIC_LLAMA_URL`, et `BIONIC_LLAMA_API_TOKEN` facultatif pour le jeton serveur. Le jeton Bionic reste propre à Bionic. Voir [llama.cpp : lancement, limites et cohabitation](llamacpp.md). Le choix ne lance ni n'arrête de moteur ; le changement s'applique après redémarrage de cette seule instance du compagnon.

[Documentation](README.md) · [Installation](installation.md) · [Dépannage](depannage.md)

Les réglages courants se font dans **Paramètres** : plafonds de réponse, images/ComfyUI, sécurité et maintenance. Le [guide d’utilisation](utilisation.md) explique leur portée. La langue de l’interface se choisit par navigateur ; elle ne règle ni celle des réponses ni celle des prompts.

**Canaé est la seule interface, à l’adresse `/`.** Une mise à jour depuis la 2.5 conserve les réglages et données de l’installation. Les anciennes valeurs `uiMode: "legacy"` ou `"llama"`, ainsi que `BIONIC_MOBILE_UI_MODE=legacy` ou `llama`, sont acceptées pour compatibilité et ouvrent toutes Canaé ; elles ne sélectionnent plus une autre interface. Le fichier privé n’est pas réécrit pour cette migration. Une valeur inconnue reste refusée. Les anciens favoris `/legacy/` et `/prototype/` redirigent vers `/` ; aucune page de l’ancienne interface n’est servie. Voir [entrée et migration](llama-ui-prototype.md#entrée-unique-et-mise-à-jour-depuis-la-25).

Pour l’initialisation, copiez **config.example.json** en **config.local.json** à la racine du compagnon. Ce fichier est privé et ignoré par Git. Les variables d’environnement sont prioritaires ; redémarrez après leur modification ou celle du fichier. **data/config.json** contient l’authentification générée : ne le remplacez pas par l’exemple.

## Réglages usuels

```json
{
  "port": 8769,
  "certificateProofPort": 8770,
  "apiUrl": "http://127.0.0.1:1235",
  "bionicRoot": "",
  "python": "",
  "extraRoots": [],
  "maxConcurrentInferences": 0,
  "resourcePolicy": "exclusive",
  "shutdownTimeoutMs": 15000,
  "requestTimeoutMs": 180000,
  "comfyUrl": "http://127.0.0.1:8188",
  "comfyEnabled": true,
  "comfyWorkflowId": "krea2_turbo"
}
```

| Champ | Usage |
| --- | --- |
| `port` | Port du compagnon, 1–65535 ; défaut 8769 |
| `certificateProofPort` | Port TLS distinct pour la preuve de certificat ; défaut port principal +1, ou −1 si 65535. Écoute seulement pendant une préparation, dix minutes maximum |
| `apiUrl` | API Bionic HTTP en boucle locale, sans `/v1`, identifiant, paramètres ni fragment. Vérifiez le port dans Bionic |
| `bionicRoot` | Dossier de données Bionic ; vide : `.lmstudio/apps/bionic` du compte. Ce n’est pas le dossier de `Bionic.exe` |
| `python` | Interpréteur pour l’extraction de documents et les scripts Python validés ; vide : `python` sous Windows, `python3` ailleurs |
| `extraRoots` | Dossiers supplémentaires pour l’exploration manuelle ; tableau vide au départ |
| `maxConcurrentInferences` | Plafond des appels texte simultanés, 0–32 ; 0 désactive ce plafond. Ne contrôle pas les clients externes |
| `resourcePolicy` | Coordination de base `exclusive` (défaut) ou `independent`. Le choix mémoire du lot d’images pilote aussi ses phases texte/images ; voir [ComfyUI](comfyui.md#modèle-texte-pendant-les-images) |
| `shutdownTimeoutMs` | Délai d’arrêt du compagnon, 100–120000 ms ; défaut 15000 |
| `requestTimeoutMs` | Réception d’un corps HTTP, 30000–1800000 ms ; défaut 180000. Ne coupe pas une génération déjà acceptée |
| `comfyEnabled`, `comfyUrl`, `comfyWorkflowId` | Valeurs initiales ComfyUI : détection permise, `http://127.0.0.1:8188`, `krea2_turbo`. Les images sont cochées par défaut seulement si l’API est disponible. Un `false` explicite reste prioritaire. Autre profil : `hassaku_illustrious` |

Le téléphone appelle le compagnon, qui contacte Bionic sur le PC. CORS et l’exposition réseau de l’API Bionic ne sont pas nécessaires. Les préférences ComfyUI enregistrées dans l’interface sont ensuite prioritaires dans `data/comfy-settings.json` : [Images ComfyUI](comfyui.md).

Les chemins JSON peuvent utiliser `/` ou des antislashs doublés. Les profils du lanceur se règlent séparément sur le PC : [Serveurs sur le PC](local-services.md).

## Dossiers supplémentaires explicites

```json
{
  "extraRoots": [
    {
      "id": "documents-partages",
      "name": "Documents partagés",
      "path": "C:/MesProjets/Documentation",
      "writable": false
    }
  ]
}
```

Chaque dossier a un identifiant distinct et un chemin absolu. `writable: false` conserve la lecture seule ; `true` autorise l’édition manuelle des textes compatibles. Ces dossiers peuvent être accessibles depuis plusieurs projets : évitez une racine personnelle trop large. Ils n’élargissent pas la racine des outils directs du modèle. Un projet adopté utilise les dossiers explicitement confirmés lors de son adoption, plutôt qu’un ajout implicite d’accès.

## Variables d’environnement

| Variable | Réglage |
| --- | --- |
| `BIONIC_MOBILE_PORT` | `port` |
| `BIONIC_MOBILE_CERTIFICATE_PROOF_PORT` | `certificateProofPort` ; règle de pare-feu correspondante nécessaire |
| `BIONIC_API_URL` | `apiUrl` |
| `BIONIC_API_TOKEN` | Jeton privé si Bionic l’exige |
| `BIONIC_MOBILE_BIONIC_ROOT` | `bionicRoot` |
| `BIONIC_MOBILE_PROJECT_REGISTRY` | Registre de projets pour les fichiers ; normalement dérivé du dossier Bionic |
| `BIONIC_MOBILE_EXTRA_ROOTS` | Tableau JSON `extraRoots` |
| `BIONIC_MOBILE_PYTHON` | Interpréteur Python |
| `BIONIC_MOBILE_NODE` | Node.js utilisé par les lanceurs Windows |
| `BIONIC_MOBILE_MAX_INFERENCES` | `maxConcurrentInferences` |
| `BIONIC_MOBILE_RESOURCE_POLICY` | `resourcePolicy` |
| `BIONIC_MOBILE_SHUTDOWN_TIMEOUT_MS` | `shutdownTimeoutMs` |
| `BIONIC_MOBILE_REQUEST_TIMEOUT_MS` | `requestTimeoutMs` |
| `BIONIC_COMFY_ENABLED` | Initialisation ComfyUI : `true`/`false` ou `1`/`0` |
| `BIONIC_COMFY_URL` | URL initiale ComfyUI |
| `BIONIC_COMFY_WORKFLOW_ID` | Profil initial ComfyUI |
| `BIONIC_SEARCH_URL` | Endpoint SearXNG complet |
| `BIONIC_BRAVE_SEARCH_KEY` | Clé privée Brave Search |
| `BIONIC_SEARCH_FALLBACK` | `brave` pour le secours après DuckDuckGo, avec clé ; vide au départ |

Un plafond d’inférences compte chaque appel modèle, y compris après un outil, et libère son créneau pendant un accord humain. Le délai global d’un tour reste de trente minutes, attente et accord compris. La capacité réelle de Bionic et du GPU reste indépendante de ce réglage.

Exemple pour un autre port dans un terminal PowerShell :

```powershell
$env:BIONIC_MOBILE_PORT = '8775'
npm start
```

Les jetons doivent rester dans l’environnement privé du serveur. Ne les placez pas dans le navigateur, le dépôt ou une commande destinée à être partagée.

## Certificats et transport du compagnon

Le niveau HTTP/HTTPS/mTLS se gère dans **Paramètres → Sécurité et accès → Sécurité des connexions**, sans champ de configuration ni retour automatique à HTTP. Le stockage de `data/security/` et le plancher `data/security-floor.json` sont privés : ne les supprimez pas pour contourner un verrouillage.

L’application conserve son port après confirmation. `certificateProofPort` sert seulement à la préparation temporaire. La maintenance possède un port HTTP éphémère sur **127.0.0.1 uniquement**, distinct de l’application. HTTPS du compagnon ne change pas le transport des API Bionic ou ComfyUI. Voir [Certificats](certificats-utilisation.md).

## Moteur de recherche des agents

Le web est activé pour les nouveaux choix de conversation, sans écraser une désactivation explicite. Lorsqu’il est autorisé pour le message, le moteur est choisi dans cet ordre :

1. `BIONIC_SEARCH_URL` : SearXNG à cet endpoint.
2. Sinon `BIONIC_BRAVE_SEARCH_KEY` : Brave Search.
3. Sinon DuckDuckGo Lite sans clé.

Sans secours explicite, un échec ne change pas de fournisseur. Pour garder DuckDuckGo en premier et Brave en secours, définissez **BIONIC_SEARCH_FALLBACK=brave** et la clé Brave. SearXNG reste prioritaire et ne bascule pas. Le secours est tenté une fois après un échec exploitable, sans contourner un refus de sécurité ; avec validation web, il exige un nouvel accord avant transmission à Brave.

Les blocages DuckDuckGo 202/403/429 empêchent les recherches répétées dans le même tour, sans bloquer la lecture d’une URL publique. Un nouveau message peut réessayer.

Pour SearXNG, indiquez l’endpoint complet, par exemple `http://127.0.0.1:8080/search`, sans identifiants, paramètres ni fragment. Le compagnon ajoute `q` et `format=json` ; activez le format JSON dans les réglages SearXNG. L’endpoint configuré peut être local, mais ses redirections sont refusées et cela ne donne pas accès à d’autres pages privées. Voir [API SearXNG](https://docs.searxng.org/dev/search_api.html).

Ces réglages de recherche appartiennent à l’environnement serveur, pas à `config.local.json`. Les recherches et URL sont communiquées aux services concernés. Les limites et accords sont décrits dans [Outils et autorisations](outils-agents.md#internet-public).

## Changement de réseau ou de port

Après un changement de réseau, relancez le compagnon et relisez les adresses de `ACCES-PRIVE.txt`. Si le port change, adaptez son autorisation réseau. Si le nom ou l’IP change en HTTPS, le certificat doit couvrir la nouvelle adresse : voir [Certificats](certificats-utilisation.md#si-la-vérification-échoue). Le code reste conservé tant que l’authentification de l’installation l’est.
