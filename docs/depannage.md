# Dépannage

[Documentation](README.md) · [Configuration](configuration.md) · [Sauvegarde et récupération](sauvegarde-mise-a-jour.md)

Vérifiez d’abord l’accès sur le PC, puis sur le téléphone. Relevez la version installée, l’action et le message exacts avant de changer plusieurs réglages.

## La page ne s’ouvre pas sur le PC

1. Extrayez entièrement l’archive dans un dossier accessible en écriture.
2. Lancez **Demarrer.cmd**. Le runtime doit être Node.js 24 ou ultérieur ; l’assistant peut préparer sa copie portable.
3. Consultez localement `server-error.log` et `server.log`, sans les publier tels quels. Un lancement `npm start` dans un terminal permet de voir l’erreur ; laissez ce terminal ouvert pendant le test.
4. En cas de conflit de port, arrêtez cette ancienne instance avec son **Arreter.cmd** ou choisissez un autre port dans sa configuration. Ne tuez pas un processus inconnu sur la seule base du port.

## La page fonctionne sur le PC mais expire sur le téléphone

Utilisez l’adresse LAN de **ACCES-PRIVE.txt**, avec le protocole et le port exacts. `localhost` désigne le téléphone. Ne revenez pas à HTTP pour contourner une erreur HTTPS.

Vérifiez le même réseau local, sans isolation Wi-Fi invité, puis la classification **privée** du réseau Windows. **Autoriser-reseau.cmd** ouvre le périmètre prévu après accord Windows ; ne désactivez pas tout le pare-feu. Un VPN peut modifier le trajet. Après changement d’IP ou de port, relancez le compagnon, relisez les adresses et vérifiez la règle réseau.

L’accès d’un autre service du PC ne prouve pas que ce port est autorisé. Utilisez les lanceurs du dossier installé ; un serveur lancé dans un environnement de développement isolé peut ne pas être accessible au téléphone.

## HTTPS affiche une alerte de certificat

Relevez **l’adresse exacte** et le **code complet**, sans ticket ni paramètres de preuve privés. Ne franchissez pas l’alerte pour confirmer.

| Erreur | Vérification |
| --- | --- |
| `NET::ERR_CERT_AUTHORITY_INVALID` | Bonne autorité installée comme CA, même SHA-256 que sur le PC ; confiance totale activée sur iPhone/iPad |
| `NET::ERR_CERT_COMMON_NAME_INVALID` | Nom/IP de l’URL présent dans les adresses couvertes ; renouvelez le serveur après changement d’adresse |
| `NET::ERR_CERT_DATE_INVALID` | Heure des appareils et dates de validité ; maintenance locale pour un serveur expiré |
| Identité client refusée en mTLS | Import et sélection de la bonne `.p12`, identité encore autorisée ; la CA et le code ne remplacent pas l’identité client |
| Preuve expirée ou inaccessible | Préparation active, port de preuve distinct, réseau et pare-feu ; recommencez après expiration |

Après un import correct sur Android, fermez/réouvrez Chrome ; si nécessaire, redémarrez le téléphone. Cette reprise ne corrige ni une mauvaise adresse ni un certificat expiré. Une ancienne icône peut ouvrir HTTP : vérifiez HTTPS dans le navigateur avant de recréer le raccourci.

Voir [Installer l’autorité](certificats-utilisation.md#installer-lautorité-sur-son-appareil). Ne partagez jamais clé privée, `.p12`, mot de passe ou stockage `data/security/` pour diagnostiquer.

## Le code est refusé ou la session a expiré

Utilisez le code de **cette installation**, dans **ACCES-PRIVE.txt**. Un redémarrage invalide les sessions ; plusieurs échecs imposent un délai avant nouvel essai. Pour un accès perdu ou compromis, suivez [Renouveler un code](sauvegarde-mise-a-jour.md#renouveler-un-code-perdu-ou-divulgué).

## Bionic est indisponible ou les modèles n’apparaissent pas

Vérifiez que Bionic et son API locale sont lancés, puis comparez l’adresse avec `apiUrl` : HTTP en boucle locale, sans `/v1`. Si un jeton est requis, définissez `BIONIC_API_TOKEN` dans l’environnement privé et relancez le compagnon. Vérifiez la disponibilité du modèle et le chargement à la demande dans Bionic. CORS et exposition de l’API au réseau ne sont pas nécessaires.

Avec les profils de lancement, **Paramètres → Serveurs sur le PC** distingue processus lancé et API prête. Une instance externe n’est pas automatiquement adoptée. Un état indéterminé doit être vérifié sur le PC sans répétition de la commande : [Serveurs sur le PC](local-services.md#progression-et-récupération).

## Les projets ou historiques sont introuvables

`bionicRoot` doit viser les données Bionic du bon compte, pas `Bionic.exe`. Vérifiez aussi les disques et droits des dossiers. Un projet local créé dans le compagnon n’a aucun dossier automatiquement ; l’adoption d’un projet Bionic demande un aperçu et des droits explicites.

Les formats internes peuvent évoluer avec Bionic. Le compagnon ne répare ni ne migre la base native. Certaines conversations temporaires ou sous-conversations ne sont pas présentées ; la projection textuelle ne reprend pas intégralement les anciennes pièces jointes ou outils.

## Une conversation web est illisible

Un JSON tronqué ou invalide laisse les autres chats accessibles avec **Inventaire partiel**. L’ouverture du chat concerné échoue explicitement ; ses octets ne sont pas réparés ni déplacés automatiquement. Une panne globale de droits reste une erreur, sans être présentée comme une liste vide complète.

Pour une récupération locale : arrêtez le serveur après la fin des travaux, sauvegardez tout `data/`, puis gardez une copie exacte du fichier suspect de `data/chats/`. Comparez avec une sauvegarde connue et ne restaurez qu’une copie d’origine vérifiée. Sans copie fiable, conservez les octets pour analyse locale au lieu d’inventer les messages manquants. Redémarrez et contrôlez l’avertissement. Ne publiez pas ce JSON et n’appliquez pas cette procédure à l’historique natif.

## Faire un diagnostic borné

**Diagnostic.cmd** ou `node scripts/diagnostic.mjs` vérifie Node.js, API/authentification, forme de la liste des modèles, schéma natif et Python facultatif. Aucun message n’est lu et aucun modèle, prompt ou script de projet n’est lancé.

Le fichier `diagnostic-bionic.json` conserve des codes, versions, durées et un identifiant de corrélation, sans reprendre les erreurs brutes ou données personnelles. Relisez-le avant partage. Un contrôle inconnu n’est pas une réussite.

## Un import lent expire

`requestTimeoutMs` borne la réception HTTP, 180 000 ms au départ, sans couper un calcul déjà accepté. Les limites de taille restent applicables. Vérifiez le message d’expiration avant de renvoyer un import ; [Configuration](configuration.md) décrit le réglage.

## Un document n’a pas d’aperçu ou ne se joint pas

DOCX/XLSX exigent Python 3.10+ et PDF exige aussi les dépendances de `requirements.txt`, installées avec le même interpréteur. Le compagnon ne fait pas d’OCR ; chiffrement, corruption ou taille peuvent empêcher l’extraction. Un fichier importé reste dans `Imports telephone/` même s’il n’est pas joint.

Pour Vision, choisissez un modèle compatible et une image PNG/JPEG/WebP de 6 Mo maximum ; HEIC et GIF ne sont pas automatiquement convertis. Le téléchargement peut rester disponible sans aperçu.

## Le modèle ne modifie pas un fichier

Vérifiez **Outils fichiers → Modification**, un dossier de travail disponible et ses droits. Lecture/Aucun refusent les mutations directes. Le modèle doit appeler un outil ; le texte de sa réponse ne confirme pas l’écriture. Examinez le journal des actions.

Un remplacement demande une version lue et un passage exact ; une réécriture complète demande une lecture complète. En cas de budget atteint, ciblez le fichier et le passage. Augmenter l’effort ne retire pas ces limites. Voir [Outils fichiers](outils-agents.md#fichiers-du-projet).

## Un conflit empêche l’enregistrement ou la restauration

Téléchargez vos changements, rouvrez le fichier actuel et rapprochez les versions. La restauration refuse aussi une destination occupée. Pour une récupération manuelle depuis `data/file-backups/`, arrêtez le serveur et sauvegardez la version actuelle avant tout remplacement.

## Une image attend ou sa soumission est incertaine

Vérifiez ComfyUI, le diagnostic des modèles/nœuds et le mode texte/images choisi. **Annuler cette image** concerne uniquement une attente encore locale. Après soumission incertaine, inspectez la file et les sorties moteur avant **Reprendre la file après vérification** ; ne répétez pas directement le prompt. Le nettoyage mémoire ne garantit pas un gain de vitesse : [Images ComfyUI](comfyui.md).

## La réponse ne revient pas après fermeture du navigateur

Rouvrez le chat sans renvoyer immédiatement le prompt. Vérifiez que le PC n’a pas été mis en veille et que compagnon et moteur sont actifs. Après arrêt serveur, le texte sauvegardé reste disponible mais les travaux interrompus ne sont pas relancés automatiquement.

## Demander de l’aide sans diffuser ses données

Indiquez versions du compagnon, Node.js, Bionic et système, puis reproduisez avec un projet fictif. Retirez des captures les noms, chemins, messages et accès privés. Ne joignez ni `ACCES-PRIVE.txt`, configuration locale, `data/`, `runtime/`, historique, registre ni journal brut. Voir [Sécurité](../SECURITY.md).
