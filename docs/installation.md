# Installation

[Documentation](README.md) · [Configuration](configuration.md) · [Dépannage](depannage.md)

Le PC héberge Bionic, les modèles et le compagnon. Le téléphone utilise son navigateur ; il ne télécharge aucun modèle. Utilisez un réseau local de confiance, sans redirection du port du compagnon vers Internet.

## Assistant Windows

Téléchargez le paquet `bionic-mobile-v….zip` et `SHA256SUMS.txt` de la même version depuis les [Releases](https://github.com/Shaft1942/bionic_local_server/releases). Choisissez une stable pour l’usage courant, puis extrayez entièrement l’archive dans un dossier accessible en écriture. Les archives **Source code** contiennent les sources du dépôt et diffèrent du paquet de distribution.

Double-cliquez sur **Installer.cmd**. L’assistant prépare le dossier, Node.js, les ports et la connexion Bionic ; il propose ensuite le démarrage, un raccourci et l’accès au téléphone. Il fonctionne même sans Node.js préinstallé. Voir [Assistant d’installation](assistant-installation.md).

## Installation manuelle

1. Installez **Node.js 24 ou ultérieur** depuis [nodejs.org](https://nodejs.org/en/download). L’archive du compagnon ne l’inclut pas. Aucun Docker ni compte Codex n’est nécessaire.
2. Extrayez l’archive dans un dossier utilisateur, hors de `Program Files`.
3. Dans **Bionic → API des modèles locaux**, activez le serveur et relevez son adresse. CORS et l’exposition de cette API au réseau ne sont pas nécessaires.
4. Copiez `config.example.json` en `config.local.json`. Renseignez `apiUrl` avec l’adresse HTTP en boucle locale de Bionic, **sans `/v1` final**, par exemple `http://127.0.0.1:1235`. Utilisez le port réellement affiché par Bionic.
5. Si la détection automatique ne convient pas, renseignez `bionicRoot` : c’est le dossier de données Bionic, pas celui de `Bionic.exe`. Voir [Configuration](configuration.md).
6. Lancez **Demarrer.cmd**, puis ouvrez l’adresse du PC indiquée dans **ACCES-PRIVE.txt** et saisissez le code de cette installation.

Il n’y a pas de dépendance npm à installer pour le serveur. Sur les autres systèmes, lancez `npm start` depuis le dossier extrait ; les scripts Windows et le parcours complet macOS/Linux ne sont pas équivalents.

## Lancer et arrêter sous Windows

| Fichier | Action |
| --- | --- |
| `Demarrer.cmd` | Démarrer le compagnon en arrière-plan ou retrouver cette instance déjà active |
| `Relancer.cmd` | Arrêter et redémarrer cette instance après un changement de configuration |
| `Arreter.cmd` | Arrêter le compagnon |
| `Deconnecter-appareils.cmd` | Fermer ses sessions ; le code reste valable |
| `Diagnostic.cmd` | Contrôler la compatibilité sans envoyer de message ni générer |
| `Configurer-serveurs.cmd` | Préparer les profils de lancement Bionic/ComfyUI sur le PC |

Les lanceurs recherchent Node.js dans l’ordre prévu par l’installation : `BIONIC_MOBILE_NODE`, copie portable, chemin enregistré par l’assistant, puis installation système. Le runtime portable demande sa propre maintenance. Le lancement facultatif de Bionic et ComfyUI se configure séparément : [Serveurs sur le PC](local-services.md).

## Ouvrir depuis le téléphone

1. Laissez le PC et le compagnon actifs ; Bionic ou ComfyUI doivent aussi être disponibles pour les fonctions qui les utilisent.
2. Connectez le téléphone au même réseau local, hors Wi-Fi invité isolé.
3. Ouvrez l’adresse LAN de **ACCES-PRIVE.txt**, avec son protocole et son port exacts. `localhost` sur le téléphone désigne le téléphone. Une nouvelle installation commence en HTTP ; une installation sécurisée conserve HTTPS.
4. Si nécessaire, classez votre réseau domestique Windows en **privé**, puis utilisez **Autoriser-reseau.cmd**. Ne désactivez pas tout le pare-feu. Pour retirer cette autorisation, utilisez **Retirer-autorisation-reseau.cmd**.
5. Connectez-vous avec le code de l’installation, puis préparez HTTPS depuis **Paramètres → Sécurité et accès**.

Le [guide des certificats](certificats-utilisation.md) décrit l’import de l’autorité publique, la comparaison d’empreinte et la preuve HTTPS. Ne confirmez jamais après avoir franchi une alerte de certificat. Une fois l’adresse HTTPS habituelle ouverte sans alerte, le navigateur peut proposer l’installation sur l’écran d’accueil. Cette icône ne remplace pas le serveur du PC.

## Langue et premier usage

Dans **Paramètres → Langue et brouillons → Langue de l’interface**, choisissez **Français** ou **English**. Le choix concerne ce navigateur ; il ne traduit ni les conversations, ni les fichiers, ni les prompts d’image et ne règle pas la langue du modèle. Vous pouvez demander une réponse dans la langue souhaitée dans votre message. Voir [Utilisation](utilisation.md#langue-de-linterface-et-des-réponses) et le [guide anglais](en/guide.md).

## Python facultatif pour les documents

Les textes et images pris en charge fonctionnent sans Python. L’extraction DOCX/XLSX demande **Python 3.10+** ; les PDF demandent aussi `pypdf`. Installez Python séparément, puis, avec le même interpréteur :

```powershell
python -m pip install -r requirements.txt
```

Renseignez `python` dans la configuration si nécessaire ; ailleurs, le programme par défaut est `python3`. Sans extraction, les documents peuvent rester conservés et téléchargeables. Le compagnon ne fait pas d’OCR des PDF scannés et n’édite pas ces formats dans leur forme d’origine.
