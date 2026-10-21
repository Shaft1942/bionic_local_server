# Configuration

[Retour au README](../README.md)

Le fichier **`config.example.json`** contient les valeurs de départ partageables. Copiez-le en **`config.local.json`**, à la racine du compagnon. Ce second fichier est privé et ignoré par Git. Redémarrez le serveur après un changement.

Le fichier `data/config.json` est différent : il est généré pour l’authentification. Ne le remplacez pas par le fichier d’exemple et ne l’éditez pas pour changer les ports.

## Réglages usuels

```json
{
  "port": 8769,
  "apiUrl": "http://127.0.0.1:1235",
  "bionicRoot": "",
  "python": "",
  "extraRoots": [],
  "maxConcurrentInferences": 0,
  "requestTimeoutMs": 180000
}
```

| Champ | Signification |
| --- | --- |
| `port` | Port HTTP du compagnon. Par défaut : `8769`. Choisissez un autre port s’il est déjà utilisé. |
| `apiUrl` | Adresse de l’API Bionic sur ce PC, sans `/v1` final. L’exemple utilise `1235` ; vérifiez le port dans Bionic. Seules les adresses de boucle locale sont autorisées. |
| `bionicRoot` | Dossier de données Bionic. Vide : détection dans `.lmstudio/apps/bionic` du compte utilisateur. Ce n’est pas le dossier de `Bionic.exe`. |
| `python` | Exécutable Python destiné à l’extraction de documents et aux scripts Python validés. Vide : `python` sous Windows, `python3` ailleurs. Sans Python, ces deux usages sont indisponibles ; les autres fonctions restent disponibles. |
| `extraRoots` | Dossiers supplémentaires visibles manuellement dans l’explorateur de fichiers. Tableau vide par défaut. |
| `maxConcurrentInferences` | Plafond des appels modèle simultanés du compagnon, entier de `0` à `32`. `0` par défaut : régulation désactivée. Un plafond positif admet les appels en FIFO et libère le créneau pendant un accord humain ; il ne pilote ni le GPU ni les autres clients Bionic. |
| `requestTimeoutMs` | Durée maximale de réception d’un corps HTTP, de `30000` à `1800000` ms ; défaut `180000` ms. Elle borne notamment connexion, messages et imports, sans couper une génération déjà acceptée. Aucun essai Wi-Fi physique n’est déduit de cette valeur. |

N’utilisez pas l’adresse IP du téléphone ni une IP publique pour `apiUrl`. Le téléphone appelle le compagnon ; seul le compagnon contacte l’API Bionic locale. CORS n’est pas nécessaire pour ce trajet.

Les chemins peuvent contenir des espaces. En JSON, doublez les antislashs Windows ou utilisez des `/` : `"C:/MesProjets"`.

## Dossiers supplémentaires explicites

Vous pouvez ajouter un dossier à l’explorateur manuel :

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

Chaque dossier doit avoir un identifiant distinct, un nom et un chemin absolu existant. `writable: false` limite l’usage à la consultation ; `true` permet l’édition manuelle des textes compatibles. Ces dossiers sont disponibles depuis les projets du compagnon : ne choisissez pas un dossier personnel trop large. Ils n’élargissent pas le périmètre des outils directs de fichiers du modèle, qui restent dans le dossier de travail du projet Bionic. Un script validé dispose toutefois des droits du compte du PC et n’est pas limité à ce périmètre.

## Variables d’environnement

Les variables prennent le pas sur le fichier local. Elles sont utiles pour un lancement depuis un terminal ou un environnement personnel ; ne placez pas de secret dans un fichier versionné.

| Variable | Réglage |
| --- | --- |
| `BIONIC_MOBILE_PORT` | Port du compagnon |
| `BIONIC_API_URL` | Adresse de l’API Bionic locale |
| `BIONIC_API_TOKEN` | Jeton d’API si votre serveur Bionic en exige un |
| `BIONIC_MOBILE_BIONIC_ROOT` | Dossier de données Bionic |
| `BIONIC_MOBILE_PROJECT_REGISTRY` | Chemin explicite du registre de projets pour le service de fichiers ; par défaut dérivé du dossier Bionic |
| `BIONIC_MOBILE_EXTRA_ROOTS` | Tableau JSON de dossiers supplémentaires |
| `BIONIC_MOBILE_PYTHON` | Exécutable Python pour l’extraction et les scripts validés ; utilisez un chemin absolu pour imposer un interpréteur précis |
| `BIONIC_MOBILE_NODE` | Exécutable Node.js utilisé par les lanceurs Windows |
| `BIONIC_MOBILE_MAX_INFERENCES` | Prioritaire sur `maxConcurrentInferences`, mêmes valeurs de `0` à `32` |
| `BIONIC_MOBILE_REQUEST_TIMEOUT_MS` | Prioritaire sur `requestTimeoutMs`, mêmes bornes en millisecondes |
| `BIONIC_SEARCH_URL` | Endpoint HTTP(S) complet de recherche SearXNG, par exemple `http://127.0.0.1:8080/search`, sans identifiant, paramètres ni fragment |
| `BIONIC_BRAVE_SEARCH_KEY` | Clé privée facultative pour Brave Search, utilisée seulement si aucun endpoint SearXNG n’est configuré |
| `BIONIC_SEARCH_FALLBACK` | `brave` pour essayer DuckDuckGo Lite d’abord puis Brave en secours si une clé est définie ; vide par défaut |

Le registre de projets interne est normalement `.internal/projects-registry.json` sous le dossier Bionic. Il est préférable de laisser sa détection automatique ; un registre de fichiers différent ne transforme pas une collection quelconque en projets natifs Bionic.

Le plafond d’inférences compte chaque appel à l’API du modèle, y compris les appels suivants après un outil. La rédaction, la navigation et les messages acceptés restent disponibles. Le délai global d’un tour reste de **trente minutes, attente d’admission et accord humain compris** : libérer un créneau pendant l’accord ne suspend pas ce délai. Remettez le plafond à `0` et redémarrez votre copie pour retrouver l’admission sans plafond. La capacité réelle de Bionic et du modèle doit être vérifiée séparément.

Exemple PowerShell pour tester un port différent pendant la session :

```powershell
$env:BIONIC_MOBILE_PORT = '8775'
npm start
```

Si votre API Bionic requiert un jeton, définissez `BIONIC_API_TOKEN` dans votre environnement privé, sans le copier dans une issue, une capture ou une commande publiée. Consultez [Sécurité](../SECURITY.md) pour les données à conserver privées.

## Moteur de recherche des agents

Le web est désactivé par défaut dans le chat. Lorsqu’il est autorisé pour un message, le choix du moteur suit cet ordre :

1. `BIONIC_SEARCH_URL` défini : SearXNG à l’adresse configurée.
2. Sinon, `BIONIC_BRAVE_SEARCH_KEY` défini : Brave Search.
3. Sinon : interface publique DuckDuckGo Lite, sans clé, [documentée pour les clients sans JavaScript](https://duckduckgo.com/duckduckgo-help-pages/features/non-javascript).

Sans configuration de secours, un échec ne change pas de fournisseur. DuckDuckGo peut refuser les robots ou demander une vérification humaine, y compris sur Lite. Les HTTP 202/403/429 sont signalés comme des blocages : les recherches suivantes du même tour ne sont pas renvoyées au moteur ; la lecture d’une URL publique reste disponible. Un nouveau message peut réessayer. Les résultats vides ou illisibles restent des erreurs, jamais un succès inventé.

Pour garder DuckDuckGo en premier et utiliser Brave seulement en secours, définissez **les deux variables serveur** `BIONIC_SEARCH_FALLBACK=brave` et `BIONIC_BRAVE_SEARCH_KEY`. Sans clé, le secours reste inactif. Sans la première variable, la clé continue de sélectionner Brave comme moteur principal. SearXNG conserve la priorité et ne bascule pas vers Brave.

Le secours est tenté une seule fois après une erreur de recherche (réseau, délai, refus distant ou résultats inexploitables), jamais après une annulation ou un refus de sécurité. Avec la validation de chaque envoi, une **seconde demande d’accord** indique l’URL exacte de Brave avant toute transmission ; refuser cet accord n’envoie rien à Brave. Sans cette validation, l’autorisation web et la configuration du serveur autorisent le secours. Les actions réussies indiquent « secours Brave » et le fournisseur réel. La clé est envoyée uniquement à l’API Brave, sans suivre ses redirections. Consultez les [instructions officielles pour créer et conserver la clé](https://api-dashboard.search.brave.com/documentation/guides/authentication) ; les limites de votre abonnement restent applicables.

Pour votre propre instance SearXNG, indiquez **l’endpoint complet**, normalement terminé par `/search`. Le compagnon ajoute lui-même `q` et `format=json`. Le format JSON doit être activé dans le `settings.yml` de SearXNG, en conservant vos autres réglages :

```yaml
search:
  formats:
    - html
    - json
```

Une instance qui n’autorise pas le JSON peut répondre HTTP 403 ; de nombreuses instances publiques limitent cet accès. Voir l’[API de recherche SearXNG](https://docs.searxng.org/dev/search_api.html) et le [réglage `search.formats`](https://docs.searxng.org/admin/settings/settings_search.html#formats).

Exemple de lancement PowerShell, pour une instance locale que vous avez installée séparément :

```powershell
$env:BIONIC_SEARCH_URL = 'http://127.0.0.1:8080/search'
npm start
```

L’endpoint SearXNG explicitement configuré peut être local et utiliser un autre port ; ses redirections sont refusées. Cette exception n’ouvre pas la lecture de pages privées aux agents. Les URL de résultats restent filtrées comme des pages publiques. Utilisez un endpoint de confiance : les mots recherchés lui seront transmis.

Ces deux variables de recherche se règlent **uniquement dans l’environnement du serveur**, pas comme nouveaux champs de `config.local.json`. Relancez le serveur pour les appliquer. Si vous utilisez `Demarrer.cmd`, il doit hériter du même environnement. Conservez toute clé Brave dans votre configuration privée ; ne la placez ni dans le navigateur, ni dans un fichier versionné, ni dans une archive. Les limites du web et des scripts sont décrites dans [Outils des agents](outils-agents.md).

## Changement de réseau ou de port

Les adresses de connexion sont actualisées dans `ACCES-PRIVE.txt` au démarrage. Après un changement de réseau, relancez le compagnon et utilisez la nouvelle adresse. Si vous changez le port, vérifiez également la règle de pare-feu Windows. Le code d’accès existant est conservé tant que les données d’authentification le sont.
