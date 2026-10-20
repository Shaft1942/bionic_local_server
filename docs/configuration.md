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
  "extraRoots": []
}
```

| Champ | Signification |
| --- | --- |
| `port` | Port HTTP du compagnon. Par défaut : `8769`. Choisissez un autre port s’il est déjà utilisé. |
| `apiUrl` | Adresse de l’API Bionic sur ce PC, sans `/v1` final. L’exemple utilise `1235` ; vérifiez le port dans Bionic. Seules les adresses de boucle locale sont autorisées. |
| `bionicRoot` | Dossier de données Bionic. Vide : détection dans `.lmstudio/apps/bionic` du compte utilisateur. Ce n’est pas le dossier de `Bionic.exe`. |
| `python` | Exécutable Python destiné à l’extraction de documents. Vide : `python` sous Windows, `python3` ailleurs. Sans Python, le téléchargement reste disponible. |
| `extraRoots` | Dossiers supplémentaires visibles manuellement dans l’explorateur de fichiers. Tableau vide par défaut. |

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

Chaque dossier doit avoir un identifiant distinct, un nom et un chemin absolu existant. `writable: false` limite l’usage à la consultation ; `true` permet l’édition manuelle des textes compatibles. Ces dossiers sont disponibles depuis les projets du compagnon : ne choisissez pas un dossier personnel trop large. Ils n’élargissent pas le périmètre des outils du modèle, qui restent dans le dossier de travail du projet Bionic.

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
| `BIONIC_MOBILE_PYTHON` | Exécutable Python pour l’extraction |
| `BIONIC_MOBILE_NODE` | Exécutable Node.js utilisé par les lanceurs Windows |

Le registre de projets interne est normalement `.internal/projects-registry.json` sous le dossier Bionic. Il est préférable de laisser sa détection automatique ; un registre de fichiers différent ne transforme pas une collection quelconque en projets natifs Bionic.

Exemple PowerShell pour tester un port différent pendant la session :

```powershell
$env:BIONIC_MOBILE_PORT = '8775'
npm start
```

Si votre API Bionic requiert un jeton, définissez `BIONIC_API_TOKEN` dans votre environnement privé, sans le copier dans une issue, une capture ou une commande publiée. Consultez [Sécurité](../SECURITY.md) pour les données à conserver privées.

## Changement de réseau ou de port

Les adresses de connexion sont actualisées dans `ACCES-PRIVE.txt` au démarrage. Après un changement de réseau, relancez le compagnon et utilisez la nouvelle adresse. Si vous changez le port, vérifiez également la règle de pare-feu Windows. Le code d’accès existant est conservé tant que les données d’authentification le sont.
