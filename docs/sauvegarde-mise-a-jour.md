# Sauvegarde et mise à jour

[Documentation](README.md) · [Mises à jour proposées](mises-a-jour.md) · [Certificats](certificats-utilisation.md)

## Ce qui vous appartient

Le dépôt et les archives publiques contiennent le programme. Vos conversations, fichiers, réglages et accès appartiennent à l’installation locale.

| Emplacement privé | Contenu à protéger |
| --- | --- |
| `data/` | Chats et branches, reçus, pièces jointes, images ComfyUI, livrables, corbeille/sauvegardes de fichiers, projets adoptés et authentification |
| `data/security/` et `data/security-floor.json` | Identité des certificats, clés et plancher de sécurité ; sauvegarde particulièrement sensible |
| `config.local.json`, `config.launchers.local.json` | Connexions, chemins et profils de lancement |
| `ACCES-PRIVE.txt` | Code en clair et adresses |
| Dossiers de projets | Fichiers actuels et `Imports telephone/`, éventuellement hors du dossier du compagnon |
| Données Bionic | Projets et historiques natifs, sauvegardés séparément |
| Environnement du serveur | Jeton Bionic, clé Brave ou endpoint SearXNG ; pas automatiquement copiés avec les fichiers de configuration |
| Navigateur | Brouillons durables, langue et repères de lecture propres à cet appareil ; absents de la sauvegarde serveur |

`runtime/` et les journaux restent privés, mais ne doivent pas être restaurés comme état actif sur une autre installation. Les profils du lanceur peuvent être conservés séparément pour révision sur le PC ; copier un reçu de processus ne donne pas son contrôle à un nouveau serveur.

Les copies d’édition et la corbeille dans `data/file-backups/` ne remplacent pas une sauvegarde indépendante. La corbeille permet de restaurer un fichier si son chemin est libre, sans purge automatique ; elle ne restaure pas un chat supprimé. Les scripts approuvés peuvent modifier des fichiers ailleurs sans sauvegarde automatique.

Les copies de livrables et images réussies restent disponibles après suppression de leur chat source. Les noms, classements et masquages des conversations natives sont locaux au compagnon ; sauvegarder Bionic seul ne les conserve pas.

## Faire une sauvegarde cohérente

1. Attendez la fin des réponses, images, scripts et enregistrements. Traitez les accords en attente, puis arrêtez le compagnon avec **Arreter.cmd**.
2. Copiez les données et configurations privées dans un emplacement protégé. Une copie complète de `data/` comprend aussi l’identité et les clés : traitez-la comme une sauvegarde d’accès sensible.
3. Sauvegardez séparément les dossiers de projets et les données Bionic.
4. Gardez la version du programme correspondante et protégez les sauvegardes comme les originaux, sans les ajouter au dépôt ni aux archives publiques.

Pour restaurer seulement des conversations dans une installation existante, ne remplacez pas `data/security/` ni `data/security-floor.json`. Une restauration complète d’un ancien `data/` peut rétablir d’anciens certificats et droits : elle relève d’une intervention locale explicite. Ne revenez pas à un programme qui ignore les certificats.

Après une interruption, les accords expirent et les travaux abandonnés ne sont pas rejoués. Un script interrompu peut déjà avoir modifié des fichiers. Une **Opération à vérifier** et ses copies candidates exigent une inspection ; elles ne constituent pas une transaction à reprendre automatiquement.

## Installer une nouvelle version

Les installations extraites d’un ZIP peuvent accepter une [mise à jour proposée](mises-a-jour.md). Pour une migration ou récupération manuelle :

1. Faites la sauvegarde précédente, **ancien serveur arrêté**.
2. Téléchargez le paquet construit et ses sommes de contrôle depuis les [Releases](https://github.com/Shaft1942/bionic_local_server/releases), puis extrayez-le dans un nouveau dossier.
3. Consultez le [journal des versions](../CHANGELOG.md). Comparez la configuration d’exemple avec vos réglages, sans copier vos secrets dans l’exemple.
4. Transférez vos `data/`, `config.local.json` et `ACCES-PRIVE.txt`, depuis cette installation uniquement, sans mélanger plusieurs identités. Réexaminez le profil privé des lanceurs si les chemins changent. Ne copiez pas `runtime/` comme preuve de processus encore contrôlés.
5. Démarrez le nouveau compagnon et vérifiez accès, projets, conversations et un fichier de test avant de reprendre le travail.
6. Conservez temporairement l’ancien dossier arrêté pour une récupération éventuelle.

Si vous aviez autorisé l’ancien dossier dans le pare-feu, retirez volontairement cette règle puis créez celle du nouveau dossier. Les adresses sont rafraîchies au démarrage ; le même code permet de se reconnecter si l’authentification a été transférée.

**Ne récupérez jamais de code ni de données privées depuis GitHub.** Une archive publique propre crée son accès au premier lancement. Un checkout Git se met à jour avec Git, en préservant ses fichiers privés ; l’installateur automatique le refuse.

## Renouveler un code perdu ou divulgué

Pour fermer seulement les sessions, lancez **Deconnecter-appareils.cmd** dans le dossier du serveur actif, ou `node scripts/revoke-sessions.mjs`. Cette action vérifie l’identité locale, conserve le code et ne coupe pas les travaux. **Une personne connaissant le code peut se reconnecter** ; en mTLS, une identité autorisée est aussi nécessaire.

Pour retirer un appareil en mTLS, utilisez **Sécurité des connexions → Retirer cet appareil** depuis une autre identité, ou la maintenance locale. Les autres identités restent admises.

Si le code est perdu ou divulgué et qu’un nouvel accès complet est nécessaire, utilisez la [récupération locale de Certificats.cmd](certificats-utilisation.md#recommencer-depuis-le-pc), serveur arrêté, avec confirmation **REINITIALISER**. Elle conserve les conversations et projets mais renouvelle aussi l’identité des certificats et revient explicitement au HTTP initial. Refaites ensuite HTTPS et les identités appareils. Ne supprimez pas manuellement le stockage de sécurité pour obtenir cet effet.

## Revenir à la version précédente

Arrêtez le nouveau serveur avant de lancer l’ancien. Vérifiez sa compatibilité avec les formats de données et les certificats ; restaurez une sauvegarde compatible si les notes l’exigent. Un retour de version du programme n’annule pas les modifications déjà réalisées dans les fichiers de projets. Ne restaurez pas silencieusement une ancienne identité de certificat avec une sauvegarde de conversations.
