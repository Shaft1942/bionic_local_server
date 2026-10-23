# Assistant d'installation Windows

L’assistant est inclus depuis la version **1.10.0**. Téléchargez l’archive depuis [la Release 1.10.0](https://github.com/Shaft1942/bionic_local_server/releases/tag/v1.10.0). Une installation 1.9.0 peut recevoir cette version par son vérificateur de mises à jour.

Extraire entierement l'archive puis double-cliquer sur **Installer.cmd**. L'assistant fonctionne avec Windows PowerShell 5.1, meme si Node.js n'est pas encore installe. Aucun compte ni Docker requis.

1. **Dossier** : choisir un dossier vide, propose par defaut dans les applications locales du compte Windows. **Ce dossier** conserve l'emplacement depuis lequel l'assistant a ete ouvert. Une destination contenant deja des fichiers est refusee pour eviter de melanger deux installations.
2. **Node.js** : reutiliser un executable compatible detecte, choisir `node.exe`, ou cocher le telechargement d'une copie portable Node.js 24 depuis `nodejs.org`. Cette derniere option conserve le fichier de licence, controle l'empreinte SHA-256 officielle et la signature Windows avant le premier lancement. Elle cible x64 et ARM64, sans changer le PATH, le registre ou le Node.js global.
3. **Bionic** : saisir l'API locale (le suffixe `/v1` est retire automatiquement), le port du compagnon, le port de vérification HTTPS et le dossier des donnees Bionic. Le port de vérification proposé est libre au moment du contrôle ; choisir une autre valeur en cas de conflit. **Tester l'API** ne demande que la liste des modeles, sans generation ni dechargement. Une API arretee ou protegee par jeton peut rester non verifiee ; terminer l'installation ne signifie pas que Bionic est joignable.
4. **Recapitulatif** : choisir le raccourci et le demarrage, puis **Installer**. L’option d’accès au téléphone autorise exactement les deux ports pour le Node de ce dossier, sur l’interface et le sous-réseau privés choisis, avec un accord administrateur Windows initial. Le port de vérification écoute seulement pendant une préparation de certificat ; le canal de maintenance reste en boucle locale. Sans cette option, le pare-feu reste inchange. Le routeur n'est jamais configure.

La copie initiale suit la liste fermee des sources publiques : aucun historique, jeton, code d'acces, log, fichier de projet ou reglage prive du dossier source n'est transfere. La nouvelle installation produit ses propres donnees d'authentification au premier demarrage. Le code et les adresses se trouvent dans `ACCES-PRIVE.txt`.

Pour **reconfigurer une installation existante**, arreter d'abord son serveur avec `Arreter.cmd`, lancer son propre `Installer.cmd`, puis utiliser **Ce dossier**. Les conversations restent sur place ; les champs non modifies de la configuration sont conserves et les reglages remplaces sont sauvegardes sous `runtime/install-backups`. Une installation active est refusee meme si l'on change de port. L'assistant n'est pas une procedure de migration entre dossiers ni une mise a jour des sources : utiliser le parcours [Mises a jour](mises-a-jour.md) pour cela.

Avant **Installer**, annuler ne change rien. Pendant la preparation et le telechargement, annuler retire le dossier temporaire ; une requete reseau deja engagee peut prendre quelques secondes pour se terminer. Une installation deja enregistree n'est pas supprimee si l'on annule pendant les etapes facultatives de demarrage ou de pare-feu. Un raccourci deja present est conserve. Pour supprimer une installation, arreter son serveur, retirer son autorisation reseau si elle existe, puis sauvegarder les donnees avant de retirer le dossier et son raccourci.

Le runtime portable n'est pas inclus dans les archives GitHub et n'est pas remplace par les mises a jour du compagnon. Pour mettre Node.js a jour, installer une version compatible separement ou remplacer sa copie portable apres arret et sauvegarde. Les sources du compagnon sont MIT ; Node.js conserve sa propre licence. Les mises a jour de securite de Node.js restent a surveiller.

Les variables d'environnement avancees gardent priorite sur les reglages du wizard (notamment `BIONIC_MOBILE_NODE`, `BIONIC_MOBILE_PORT`, `BIONIC_API_URL`). Les chemins contenant des liens/jonctions de dossiers sont refuses pour la copie initiale. En cas d'echec, corriger le champ indique, verifier le dossier temporaire eventuel, ou consulter [Depannage](depannage.md).

## Certificats depuis le téléphone (2.1)

Après l’installation et son autorisation réseau initiale, ouvrir **Paramètres → Sécurité des connexions** dans le navigateur du téléphone. Le même parcours s’ouvre avec **Accès sécurisés** dans l’assistant Windows. Il permet de préparer HTTPS, télécharger l’autorité publique puis, après vérification HTTPS, créer et télécharger le certificat client et son mot de passe d’importation. Le système du téléphone demande toujours de confirmer l’installation et la confiance.

Pour une installation existante, la nouvelle autorisation des deux ports doit être accordée une fois sur le PC. L’application signale si cette préparation n’est pas enregistrée. Un changement de port ou de réseau peut nécessiter de renouveler cette autorisation ; le navigateur ne modifie pas le pare-feu Windows. `certificateProofPort` dans `config.local.json`, ou `BIONIC_MOBILE_CERTIFICATE_PROOF_PORT`, fixe ce port distinct de celui du compagnon.

Le parcours normal ne nécessite plus `Certificats.cmd`. Cette commande reste un outil local de secours lorsqu’aucun appareil ne peut accéder au compagnon. Les conversations et les fichiers sont conservés. Voir le [parcours certificats](certificats-utilisation.md).
