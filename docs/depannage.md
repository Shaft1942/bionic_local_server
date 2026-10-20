# Dépannage

[Retour au README](../README.md)

Commencez par vérifier l’accès **sur le PC**, puis sur le téléphone. Cela permet de distinguer un serveur arrêté d’un blocage réseau.

## La page ne s’ouvre pas sur le PC

1. Extrayez entièrement l’archive.
2. Lancez `Demarrer.cmd`. Le dossier doit être accessible en écriture.
3. Vérifiez que Node.js 24+ est installé. Dans un nouveau terminal, `node --version` doit afficher une version au moins égale à 24.
4. Consultez localement `server-error.log` et `server.log`. Ils peuvent contenir des informations privées : ne les publiez pas tels quels.
5. Si le port est déjà utilisé, arrêtez l’ancien compagnon avec `Arreter.cmd` ou changez `port` dans `config.local.json`, puis relancez.

Un lancement dans un terminal avec `npm start` permet de lire l’erreur directement. Ce terminal doit rester ouvert pendant ce test.

## La page fonctionne sur le PC mais expire sur le téléphone

- Utilisez l’adresse LAN inscrite dans `ACCES-PRIVE.txt`, avec **`http://`** et le bon port. `localhost` ne convient pas sur le téléphone.
- Vérifiez que le téléphone et le PC sont sur le même réseau, et non sur un Wi-Fi invité isolé. Un VPN peut modifier ce trajet.
- Sous Windows, vérifiez que le réseau domestique est classé **privé**, puis exécutez `Autoriser-reseau.cmd` et acceptez la demande Windows. Ne désactivez pas tout le pare-feu.
- Relancez le compagnon après un changement d’adresse IP et relisez `ACCES-PRIVE.txt`.
- Si le port a changé, vérifiez la règle de pare-feu pour le nouveau port.
- Lancez le serveur depuis les fichiers Windows du dossier installé. Un lancement depuis un environnement isolé de développement peut répondre sur le PC tout en restant inaccessible depuis le réseau.

Si un autre serveur de ce PC fonctionne sur le téléphone, cela confirme une partie du trajet réseau, mais pas l’autorisation du port de ce compagnon.

## Le code est refusé ou la session a expiré

Utilisez le code du fichier **ACCES-PRIVE.txt de cette installation**. Après un redémarrage, reconnectez-vous. Plusieurs échecs successifs déclenchent un délai temporaire ; attendez avant de réessayer.

Si le fichier a été perdu ou si un code a été divulgué, suivez la procédure de renouvellement dans [Sauvegarde et mise à jour](sauvegarde-mise-a-jour.md). Ne demandez pas à une autre personne de vous envoyer son code.

## Bionic est indisponible ou les modèles n’apparaissent pas

1. Vérifiez que Bionic et son **serveur API local** sont lancés.
2. Comparez le port affiché dans Bionic avec `apiUrl` dans `config.local.json`. L’adresse doit viser ce PC et ne pas finir par `/v1`.
3. Si l’API exige un jeton, définissez `BIONIC_API_TOKEN` dans votre environnement privé, puis relancez le compagnon.
4. Vérifiez qu’un modèle utilisable est disponible dans Bionic. Le chargement à la demande est un réglage de Bionic.

Activer CORS ou exposer l’API Bionic sur le réseau n’est pas nécessaire au compagnon.

## Les projets ou historiques sont introuvables

Vérifiez `bionicRoot` : il doit désigner le **dossier de données Bionic**, pas le dossier d’installation de l’exécutable. Vérifiez aussi que Bionic fonctionne sous le même compte utilisateur et que les disques des projets sont accessibles.

Le compagnon utilise des données internes Bionic. Une mise à jour de Bionic peut changer leur format. Ne tentez pas de réparer ou migrer la base native avec ce compagnon. Signalez la version de Bionic et un message d’erreur nettoyé dans une issue.

Certaines conversations temporaires, archivées ou sous-conversations ne sont pas présentées. Les historiques affichés sont une projection textuelle : les anciennes pièces jointes et les outils natifs ne sont pas importés intégralement.

## Une conversation web est illisible

Un JSON tronqué ou une structure de chat web invalide est isolé : les autres chats restent accessibles et la liste ainsi que l’activité annoncent un **inventaire partiel**. L’ouverture directe du chat concerné rend une erreur claire. Le compagnon ne répare, déplace, exporte ou réécrit pas automatiquement ses octets. Une panne générale de droits d’accès ou du registre reste une erreur, sans être présentée comme une liste vide complète.

Pour intervenir manuellement sur le PC :

1. Arrêtez votre copie du serveur après la fin des travaux et sauvegardez privément tout `data/`.
2. Conservez une copie exacte du fichier suspect dans `data/chats/` avant de l’ouvrir dans un éditeur. Les noms `web-….json` sont des identifiants, pas une preuve du contenu.
3. Comparez avec une sauvegarde connue et restaurez seulement une copie dont vous avez vérifié l’origine. À défaut, gardez les octets pour une analyse locale ; ne devinez pas les messages manquants et ne publiez pas ce JSON.
4. Redémarrez votre copie et vérifiez l’avertissement et les chats sains. Ne tentez aucune réparation de l’historique natif Bionic avec cette procédure.

Ce traitement a été éprouvé sur des fixtures synthétiques ; il ne signifie pas qu’une conversation personnelle endommagée a été trouvée ou récupérée.

## Faire un diagnostic borné

Sous Windows, exécutez **Diagnostic.cmd** dans le dossier du compagnon ; ailleurs, utilisez `node scripts/diagnostic.mjs`. `Diagnostic.ps1` est aussi fourni. Le diagnostic vérifie à la demande Node, l’accès HTTP/authentification à l’API locale, la forme de sa réponse modèles, le schéma natif et Python facultatif. Il ne lit pas les messages et ne lance aucun modèle, prompt ou script de projet.

Le fichier local `diagnostic-bionic.json` est construit par liste blanche : versions du compagnon et de Node, nom fixe, état et code du contrôle, durée et identifiant de corrélation. Il ne reprend ni erreur brute, ni chemin, nom de projet, modèle, jeton ou message, et n’est envoyé à aucun service distant. Relisez-le avant de le partager ; ne joignez pas à sa place vos journaux bruts. Un état inconnu signale un contrôle non conclusif, pas un succès.

## Un import lent expire

Le corps d’une requête dispose par défaut de **180 000 ms** pour arriver au serveur. L’expiration est explicite et ne doit pas être confondue avec un arrêt du calcul après acceptation. Les limites de taille restent appliquées. Le réglage `requestTimeoutMs` est décrit dans [Configuration](configuration.md) ; son choix n’a pas été validé sur un téléphone ou un Wi-Fi physique.

## Un document n’a pas d’aperçu ou ne se joint pas

- DOCX/XLSX : vérifiez Python 3.10+ et le réglage `python`.
- PDF : installez aussi les dépendances de `requirements.txt` avec ce même Python.
- Un PDF scanné peut ne contenir aucun texte ; l’application ne fait pas d’OCR.
- Un document chiffré, endommagé, trop grand ou trop long peut être refusé.

Le téléchargement reste disponible dans la limite autorisée. Un fichier importé sans pièce jointe reste enregistré dans `Imports telephone/`.

Pour une image, choisissez un modèle **Vision**, utilisez PNG/JPEG/WebP et respectez la limite de 6 Mo. Les autres formats, dont HEIC et GIF, ne sont pas automatiquement envoyés à un modèle Vision.

## Le modèle ne modifie pas un fichier

Vérifiez que **Outils fichiers → Modification** est sélectionné et que le projet Bionic a un dossier de travail enregistré. Le profil **Lecture** refuse volontairement les mutations directes, et **Aucun** désactive ces outils. Le modèle doit savoir appeler des outils ; sa réponse seule n’atteste pas un enregistrement. Le journal des actions montre le résultat réel.

Les outils ne modifient que des textes compatibles dans le dossier de travail du projet. Ils n’exécutent pas de commandes et ne parcourent pas les liens de dossiers. Une lecture ciblée doit précéder un remplacement, sauf si vous donnez vous-même le passage exact. Un remplacement complet exige une lecture complète préalable. Les JSON proposés doivent être valides.

Si le budget de lecture est atteint, faites une demande plus précise en nommant le fichier et le passage. Augmenter l’effort ne retire pas les limites de lecture ni les protections d’écriture.

## Un conflit empêche l’enregistrement ou la restauration

Le fichier a probablement changé sur le PC depuis son ouverture. Conservez votre brouillon avec **Télécharger mes changements**, puis rouvrez la version actuelle et rapprochez les contenus. La restauration refuse aussi d’écraser une version plus récente sans la vérification attendue.

Les copies précédentes sont dans `data/file-backups/`, avec des métadonnées. Si une restauration manuelle est nécessaire, arrêtez le serveur, sauvegardez d’abord la version actuelle et vérifiez la correspondance entre la copie et le fichier avant tout remplacement.

## La réponse ne revient pas après fermeture du navigateur

Vérifiez que le PC n’a pas été mis en veille, que Bionic répond encore et que le serveur n’a pas redémarré. Rouvrez la conversation au lieu de renvoyer immédiatement le prompt. Une génération interrompue par l’arrêt du serveur conserve son état sauvegardé mais n’est pas relancée automatiquement.

## Demander de l’aide sans diffuser ses données

Indiquez la version du compagnon, de Node.js, de Bionic, le système et les étapes de reproduction avec un projet fictif. Ne joignez pas `ACCES-PRIVE.txt`, `config.local.json`, `data/`, `runtime/`, vos historiques, vos registres ou des journaux bruts. Relisez aussi les captures : les noms de projets, chemins, messages et adresses peuvent être personnels.
