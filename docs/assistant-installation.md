# Assistant d’installation Windows

[Installation](installation.md) · [Configuration](configuration.md) · [Mises à jour](mises-a-jour.md)

Extrayez entièrement le paquet de distribution, puis ouvrez **Installer.cmd**. L’assistant utilise Windows PowerShell 5.1 et peut préparer Node.js sans installation préalable.

## Installation initiale

1. **Dossier** : choisissez une destination vide ou **Ce dossier**. Une destination déjà remplie est refusée pour éviter de mélanger des installations.
2. **Node.js** : réutilisez un exécutable compatible, choisissez `node.exe` ou demandez le téléchargement d’une copie portable Node.js 24 depuis `nodejs.org`. Cette option contrôle l’empreinte SHA-256 officielle et la signature Windows ; elle cible x64/ARM64, sans modifier le Node.js global, le registre ni le `PATH`.
3. **Bionic** : indiquez l’API locale, le port du compagnon, le port distinct de vérification HTTPS et le dossier de données Bionic. Le suffixe `/v1` est retiré. **Tester l’API** consulte la liste des modèles, sans génération ni déchargement. Un test non concluant ne signifie pas que l’installation a échoué, ni que l’API sera disponible ensuite.
4. **Récapitulatif** : choisissez le raccourci, le démarrage et, si nécessaire, l’accès au téléphone, puis **Installer**. L’autorisation réseau demande un accord administrateur Windows et vise les deux ports précis pour le Node.js de ce dossier, sur l’interface et le sous-réseau privés choisis. Elle ne configure pas le routeur.

La copie initiale suit la liste fermée des fichiers publics. Aucun historique, code d’accès, jeton ou fichier de projet du dossier source n’est transféré. La nouvelle installation crée son identité au premier démarrage ; le code et les adresses sont dans **ACCES-PRIVE.txt**.

Le port de vérification HTTPS n’écoute que pendant une préparation de certificat. La maintenance reste en boucle locale. Pour sécuriser le téléphone, l’entrée **Accès sécurisés** ouvre le même parcours que **Paramètres → Sécurité et accès** : [Certificats](certificats-utilisation.md).

## Reconfigurer sans changer de dossier

Arrêtez le serveur avec **Arreter.cmd**, ouvrez le **Installer.cmd** de cette installation et choisissez **Ce dossier**. Les conversations restent sur place ; les champs non modifiés sont conservés et les réglages remplacés sont sauvegardés dans `runtime/install-backups/`. Une installation encore active est refusée, même avec un autre port.

L’assistant ne migre pas les données vers un autre dossier et ne met pas les sources à jour. Suivez [Sauvegarde et mise à jour](sauvegarde-mise-a-jour.md) pour ces opérations.

## Annuler et entretenir

Avant **Installer**, annuler ne change rien. Pendant la préparation, l’annulation nettoie le dossier temporaire ; une requête déjà engagée peut encore prendre quelques secondes. Une installation déjà enregistrée reste présente si l’annulation intervient pendant les étapes facultatives. Un raccourci existant est conservé.

Le runtime portable garde sa licence et sa maintenance propres : les mises à jour du compagnon ne mettent pas Node.js à jour. Pour désinstaller, arrêtez le compagnon, retirez son autorisation réseau, sauvegardez vos données, puis retirez son dossier et son raccourci.

Les variables d’environnement restent prioritaires, notamment `BIONIC_MOBILE_NODE`, `BIONIC_MOBILE_PORT` et `BIONIC_API_URL`. Les chemins avec liens/jonctions sont refusés pour la copie initiale. En cas d’échec, consultez [Dépannage](depannage.md).
