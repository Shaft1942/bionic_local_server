# Installation

[Retour au README](../README.md)

## Sur le PC qui exécute Bionic

Le PC héberge Bionic, ses modèles et ce compagnon. Le téléphone n’installe aucun modèle : il utilise son navigateur.

1. Vérifiez qu’une conversation fonctionne directement dans Bionic.
2. Installez [Node.js](https://nodejs.org/en/download), version **24 minimum**. Sous Windows, laissez l’installateur ajouter Node.js au `PATH`, puis rouvrez les fenêtres de terminal déjà ouvertes.
3. Téléchargez l'archive nommée `bionic-mobile-vX.Y.Z.zip` et `SHA256SUMS.txt` depuis la [Release choisie](https://github.com/Shaft1942/bionic_local_server/releases). **Source code** et **Code → Download ZIP** fournissent les sources, qui peuvent différer du paquet construit par le workflow. Cette branche prépare 1.9.0 ; la Release 1.8.0 publiée au début du travail ne contient pas encore le vérificateur de mises à jour. Pour essayer 1.9.0 avant publication, construisez son archive avec `npm run release`, puis extrayez le ZIP de `dist/`. Voir [Mises à jour](mises-a-jour.md).
4. Extrayez tous les fichiers dans un dossier utilisateur accessible en écriture. Ne lancez pas l’application depuis l’intérieur de l’archive ou depuis `Program Files`.
5. Dans les paramètres de **Bionic → API des modèles locaux**, activez le serveur. Relevez l’URL affichée. Il n’est pas nécessaire d’activer CORS ni d’exposer cette API au réseau : le compagnon l’appelle depuis le PC.
6. Copiez `config.example.json` en `config.local.json`. Si Bionic affiche par exemple `http://localhost:1234/v1`, utilisez `"apiUrl": "http://127.0.0.1:1234"`. Il faut l’adresse du serveur, **sans `/v1` final**. Le réglage doit correspondre à votre propre port Bionic.

Le dossier Bionic est détecté par défaut dans `.lmstudio/apps/bionic` de votre compte utilisateur. Si vous utilisez un autre emplacement, renseignez `bionicRoot` comme expliqué dans [Configuration](configuration.md). Il s’agit du dossier de **données**, pas du dossier contenant `Bionic.exe`.

## Lancer et arrêter sous Windows

- **Demarrer.cmd** : démarrer le serveur en arrière-plan ou retrouver un serveur déjà actif.
- **Relancer.cmd** : arrêter puis redémarrer, notamment après une modification de configuration ou une mise à jour.
- **Arreter.cmd** : arrêter le serveur du compagnon.
- **Deconnecter-appareils.cmd** : révoquer globalement les sessions du serveur actif sans arrêter ses travaux ; un appareil connaissant le code peut se reconnecter.
- **Diagnostic.cmd** : produire les cinq contrôles bornés de compatibilité, sans message ni génération, dans `diagnostic-bionic.json`.

Les lanceurs utilisent Node.js présent dans le `PATH`, ou le chemin explicitement indiqué par `BIONIC_MOBILE_NODE`. Ils ne requièrent pas Codex.

Au premier démarrage, ouvrez **ACCES-PRIVE.txt** dans le dossier de l’application. Il contient le code personnel et les adresses disponibles. Ouvrez d’abord l’adresse du PC, habituellement [http://127.0.0.1:8769](http://127.0.0.1:8769), puis saisissez le code. Chaque installation crée son propre code : aucun code fourni par GitHub n’est nécessaire.

## Ouvrir depuis le téléphone

1. Laissez le PC, Bionic et le compagnon allumés.
2. Connectez le téléphone au même réseau local. Évitez le Wi-Fi invité, qui peut isoler les appareils.
3. Ouvrez **l’adresse du téléphone inscrite dans ACCES-PRIVE.txt**. `localhost` sur le téléphone désigne le téléphone, pas le PC.
4. Si le PC répond mais pas le téléphone, vérifiez que le réseau Windows est **privé**, puis lancez **Autoriser-reseau.cmd**. La demande Windows sert à créer une règle de pare-feu limitée au réseau privé et au sous-réseau local.
5. Saisissez le code d’accès. Vous pouvez ajouter un favori dans le navigateur.

Ne redirigez pas ce port vers Internet. L’accès fonctionne sur le réseau local de confiance ; il ne constitue pas un service public multi-utilisateur. Un redémarrage du serveur ferme les sessions de connexion : le même code permet de se reconnecter.

Pour supprimer l’autorisation réseau, exécutez `Retirer-autorisation-reseau.ps1` depuis PowerShell avec les droits demandés. Le serveur peut aussi être utilisé uniquement sur le PC sans ajouter de règle de pare-feu.

## Python facultatif pour les documents

Les textes et les images pris en charge fonctionnent sans Python. L’extraction de texte de **DOCX et XLSX** demande **Python 3.10+** ; le module **pypdf** est également nécessaire pour les **PDF**.

Installez Python depuis [python.org](https://www.python.org/downloads/), puis indiquez son exécutable dans `config.local.json` si la détection automatique ne le trouve pas. Sous Windows, le programme recherché par défaut est `python` ; sur les autres systèmes, `python3`.

Pour ajouter la prise en charge PDF avec ce même Python, dans le dossier du compagnon :

```powershell
python -m pip install -r requirements.txt
```

Sur un système utilisant `python3`, remplacez `python` par `python3`. Si vous utilisez un environnement virtuel, renseignez son exécutable Python complet dans la configuration. Une installation sans Python reste utilisable : les documents sont conservés et téléchargeables, mais leur texte ne peut pas être joint automatiquement.

Les PDF scannés sans texte ne sont pas reconnus par OCR. Les documents chiffrés ou invalides peuvent également rester sans texte exploitable.

## Autres systèmes

Dans un terminal ouvert dans le dossier extrait :

```sh
npm start
```

Il n’y a pas de dépendances npm à installer pour le serveur. Les lanceurs et l’autorisation de pare-feu fournis ciblent Windows. Sur macOS et Linux, le pare-feu, les chemins Bionic et les permissions doivent être adaptés ; ce parcours complet n’a pas été validé.

En cas de difficulté, consultez [Dépannage](depannage.md).
