# Certificats et connexion sécurisée

[Installation](installation.md) · [Dépannage](depannage.md) · [Sécurité](../SECURITY.md)

Une nouvelle installation commence en HTTP sur le réseau de confiance. **Paramètres → Sécurité et accès → Sécurité des connexions** prépare HTTPS, puis facultativement mTLS. Le lien `/?settings=security` et **Accès sécurisés** dans l’assistant ouvrent ce même parcours. Aucune de ces actions ne sollicite Bionic ou ComfyUI.

## Quel fichier sert à quoi ?

| Élément | Usage et confidentialité |
| --- | --- |
| **Autorité publique** `bionic-autorite.crt` | À installer comme autorité de confiance/CA sur l’appareil. Comparez sa SHA-256 complète avec celle affichée sur le PC ; elle ne contient pas la clé privée |
| Certificat serveur | Présenté automatiquement ; doit couvrir les noms/IP réellement utilisés. Ce n’est pas une identité à importer sur le téléphone |
| **Identité client** `.p12` et mot de passe | Privés, propres à un appareil, pour mTLS. Inutiles pour HTTPS seul. Importez l’identité sur l’appareil prévu puis retirez les copies de transfert |
| Clé privée de l’autorité ou du serveur | Sur le PC uniquement. Ne transmettez jamais `.key`, `rootCA-key.pem` ou le dossier `data/security/` à un téléphone ou pour demander de l’aide |

Le nom du certificat ne suffit pas à identifier la bonne autorité. Son empreinte diffère de celle du certificat serveur ; comparez des éléments de même type.

## Passer du HTTP initial à HTTPS

1. Lors de l’installation Windows, préparez si nécessaire l’accès au téléphone : port principal et port de preuve HTTPS, sur le même réseau privé. Le navigateur n’ouvre pas le pare-feu ; une installation sans ce réglage doit être configurée sur le PC.
2. Dans **Sécurité des connexions**, choisissez **Préparer HTTPS**. Vérifiez les noms/IP sous **Adresses du serveur**. Le niveau confirmé reste inchangé pendant la préparation.
3. Téléchargez l’autorité publique sur l’appareil. Pour ce premier transfert HTTP, comparez sa SHA-256 avec celle affichée sur le PC par un canal fiable, puis [installez-la comme CA](#installer-lautorité-sur-son-appareil). Le téléchargement seul ne suffit pas.
4. Choisissez **Vérifier la connexion sécurisée**, puis ouvrez la vérification. La page doit s’ouvrir **sans alerte de certificat**. N’ignorez jamais une alerte pour confirmer. Confirmez dans cette page, ouvrez l’adresse HTTPS habituelle et reconnectez-vous avec votre code.

Après confirmation, les anciennes sessions sont invalidées et le niveau actif devient HTTPS. Le port principal reste le même ; le port de preuve n’écoute que pendant la préparation, dix minutes maximum. Un échec ou une expiration conserve le niveau confirmé, sans retour automatique à HTTP.

## Installer l’autorité sur son appareil

Les menus varient selon le système, sa version et le fabricant. Utilisez les réglages intégrés. Une politique d’appareil géré peut empêcher l’import ; faites intervenir son administrateur.

### Android avec Chrome

Dans les réglages Android, recherchez **certificat**, puis **Chiffrement et identifiants → Installer un certificat → Certificat CA** ou le libellé équivalent. Choisissez l’autorité publique vérifiée ; Android peut demander le code de verrouillage de l’appareil. Ce code n’est pas le mot de passe d’une archive `.p12`.

Revenez dans Chrome et ouvrez la preuve HTTPS. Si la bonne autorité reste ignorée, fermez puis rouvrez Chrome ; un redémarrage du téléphone peut aussi permettre la prise en compte. Cela ne corrige ni une mauvaise adresse ni une expiration.

### iPhone / iPad avec Safari

Téléchargez puis ouvrez l’autorité dans Safari. Dans **Réglages → Profil téléchargé**, examinez et installez le profil. Activez ensuite explicitement sa confiance TLS dans **Général → Informations → Réglages des certificats**. Installer le profil et lui faire confiance sont deux étapes distinctes.

Les profils installés se trouvent dans **Général → VPN et gestion de l’appareil**. Si le profil téléchargé a disparu avant installation, téléchargez-le à nouveau. Revenez dans Safari et vérifiez l’absence d’alerte.

### Windows avec Chrome ou Edge

Vérifiez la SHA-256 de l’autorité publique, puis ouvrez `certmgr.msc` pour le compte du navigateur. Importez-la dans **Autorités de certification racines de confiance → Certificats** du magasin **Utilisateur actuel**. Un magasin machine modifierait une autre portée de confiance. Rouvrez le navigateur et contrôlez la preuve HTTPS.

Une empreinte affichée dans un autre algorithme ne se compare pas directement à la SHA-256 du compagnon.

## Ajouter l’application sur l’écran d’accueil

Après confirmation, ouvrez **l’adresse HTTPS habituelle**, reconnectez-vous et utilisez l’offre du navigateur : installation dans Chrome Android ou ajout à l’écran d’accueil de Safari. L’offre dépend du navigateur et ne constitue pas une preuve TLS. Une ancienne icône HTTP peut devoir être recréée depuis la bonne adresse. Le PC et le compagnon doivent toujours rester actifs.

## Ajouter une identité privée puis activer mTLS (facultatif)

1. Depuis HTTPS vérifié, nommez l’appareil puis choisissez **Créer le certificat de cet appareil**. L’archive `.p12` chiffrée est téléchargeable une fois pendant cinq minutes, liée à la session. Son mot de passe disparaît à la fermeture du panneau ou à l’expiration ; aucune copie n’est conservée dans le stockage du navigateur.
2. Importez cette **identité client**, avec le mot de passe d’archive : certificat utilisateur pour VPN/applications sous Android, profil d’identité sur iOS/iPadOS, magasin **Personnel** du compte sous Windows. Ne l’importez pas comme autorité racine. Revenez dans le navigateur et sélectionnez cette identité si demandé.
3. Choisissez **Exiger un certificat client pour se connecter**. La preuve exige alors une identité enregistrée. Tant qu’elle n’est pas confirmée, HTTPS reste le niveau actif.

Créez une identité distincte par appareil, en plus de la même CA publique. En mTLS, un appareil autorisé peut préparer l’identité du suivant. Privilégiez le téléchargement sur l’appareil cible ; si un transfert privé est nécessaire, utilisez un canal maîtrisé et communiquez le mot de passe séparément. Aucun export privé ne transite par HTTP ou par une URL. N’envoyez jamais `.p12` ou mot de passe dans une demande d’aide.

**Renouveler** depuis l’interface conserve l’ancienne identité pendant l’import et le contrôle du remplaçant. Retirez ensuite l’ancienne depuis un autre appareil autorisé. **Retirer cet appareil** demande confirmation et ferme ses connexions ; vous ne pouvez pas retirer le certificat de votre connexion actuelle ni révoquer simultanément tous les accès.

L’import et la sélection restent à vérifier dans le navigateur de chaque appareil ; la réception du fichier seule ne prouve pas qu’il est utilisé.

## Si la vérification échoue

Relevez l’**adresse exacte** et le **code complet** de l’erreur, sans ticket ni paramètres privés. Vérifiez l’autorité et son empreinte, l’heure des appareils et les noms/IP dans **Détails des certificats → Adresses couvertes**.

Un nom DNS et une IP sont deux entrées différentes. Après changement d’adresse, renouvelez le certificat serveur avec les bonnes adresses ; réinstaller la CA ne corrige pas ce défaut. Un délai sur le port de preuve peut être réseau, sans défaut de certificat. Voir la [table de dépannage HTTPS](depannage.md#https-affiche-une-alerte-de-certificat).

## Maintenance et compatibilité sur le PC

**Certificats.cmd** fournit la maintenance locale et la récupération quand le navigateur n’est plus utilisable.

### Préparer HTTPS depuis le PC

Démarrez cette installation, ouvrez **Certificats.cmd → Préparer HTTPS**, puis indiquez les noms/IP nécessaires. Transférez uniquement l’autorité publique vérifiée. Si la preuve est bloquée par Windows, **Autoriser-preparation-certificats.cmd** demande l’élévation pour une règle limitée au port candidat, au Node.js de cette installation et au réseau privé choisi. Cette règle est retirée à la fin ou à l’expiration ; le port principal reste géré séparément.

Ouvrez la preuve sur l’appareil sans contourner d’alerte, confirmez, puis reconnectez-vous à l’adresse habituelle. **État** et `ACCES-PRIVE.txt` indiquent les adresses actualisées.

### Export local d’un appareil, puis certificat obligatoire

Arrêtez cette installation, puis utilisez **Certificats.cmd → Créer un certificat appareil**. L’archive chiffrée et son mot de passe sont écrits séparément dans un sous-dossier privé de `runtime/certificate-exports/`. Transférez-les par un canal maîtrisé, importez l’identité puis retirez les copies de transfert.

Redémarrez le compagnon et préparez mTLS. Confirmez la preuve avec le navigateur présentant cette identité. Ajouter ensuite une identité locale exige de nouveau l’arrêt du compagnon, sans réouvrir d’accès HTTP réseau.

### Perte, révocation et renouvellement depuis le PC

| Besoin | Commande et effet |
| --- | --- |
| Retirer une identité perdue | Serveur actif, **Retirer un appareil** avec son identifiant/empreinte ; les autres restent admis |
| Renouveler une identité localement | Serveur arrêté, **Renouveler un appareil** ; nouvel export et révocation de l’ancien. Ce parcours local diffère du renouvellement progressif de l’interface |
| Nouveau nom/IP ou serveur expiré | Serveur actif, **Renouveler serveur/adresse**, puis nouvelle preuve au même niveau ; les clés et la CA doivent encore être utilisables |
| Annuler une préparation | Retirer le candidat sans changer le niveau déjà confirmé |

Les commandes avancées de `Certificats.ps1` sont `status`, `https`, `mtls`, `issue-device`, `renew-device`, `revoke-device`, `renew-server` et `cancel-preparation`. Ne passez jamais un mot de passe en argument.

## Recommencer depuis le PC

Arrêtez le compagnon, ouvrez **Certificats.cmd → Réinitialiser les accès** et saisissez localement **REINITIALISER**. Cette récupération explicite renouvelle code et jeton de maintenance, remplace l’identité de certificats et revient au HTTP initial. Les anciennes identités client deviennent inutilisables et les exports locaux sont retirés. Conversations, pièces jointes, images, livrables et fichiers des projets sont conservés.

L’identifiant d’installation reste stable ; la CA et l’époque de sécurité changent. Une réinstallation ordinaire conserve l’identité et ne remplace pas cette récupération. Un serveur encore actif, un port occupé ou une incohérence de runtime provoque un refus, sans tuer un processus inconnu. Ne supprimez pas le plancher de sécurité pour contourner un refus.

## Arrêt, diagnostic et mises à jour

Les lanceurs et diagnostics utilisent la maintenance locale sur `127.0.0.1`, aux trois niveaux de sécurité, sans désactiver TLS dans le navigateur. Un diagnostic confirmant HTTPS/mTLS côté serveur ne remplace pas une connexion depuis le téléphone.

Installation et mises à jour conservent l’identité existante et refusent un programme qui ignorerait les certificats. Une sauvegarde complète de `data/` contient des clés et peut restaurer d’anciens droits : protégez-la séparément des copies ordinaires de conversations. Voir [Sauvegarde et récupération](sauvegarde-mise-a-jour.md).

## Références système

- [Google — Certificats Android](https://support.google.com/pixelphone/answer/2844832?hl=fr)
- [Apple — Confiance d’un certificat installé manuellement](https://support.apple.com/fr-fr/102390) et [installation d’un profil](https://support.apple.com/fr-fr/102400)
- [Microsoft — Magasins de certificats](https://learn.microsoft.com/en-us/windows-server/identity/ad-cs/inspect-certificates-manage-certificate-stores)
- [Google Chrome — Erreurs de certificat](https://support.google.com/chrome/answer/95669?hl=fr)

Les versions et politiques du système peuvent modifier les écrans ou empêcher un import. Contrôlez le résultat sur chaque appareil utilisé.
