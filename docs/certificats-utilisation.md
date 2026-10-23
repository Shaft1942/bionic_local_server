# Certificats : configuration depuis le navigateur

Le compagnon commence en HTTP. Ouvrir **Paramètres → Sécurité et accès → Sécurité des connexions**
sur le téléphone ou le PC. Le lien `/?settings=security` ouvre directement cette
section après connexion ; **Accès sécurisés** dans l’assistant Windows ouvre
la même interface. Aucune opération de ce parcours ne sollicite Bionic ou ComfyUI.

## Quel fichier sert à quoi ?

| Élément | Usage | À conserver où ? |
| --- | --- | --- |
| **Autorité publique** `bionic-autorite.crt` | Permet au téléphone de vérifier l’identité du serveur HTTPS. Son empreinte SHA-256 doit correspondre à celle affichée sur le PC. | À installer comme **autorité de confiance / certificat CA** sur chaque appareil. Elle ne contient pas la clé privée de l’autorité. |
| Certificat serveur | Couvre les noms et IP déclarés lors de la préparation (SAN). Il est présenté automatiquement au navigateur. | Le compagnon le gère sur le PC ; ce n’est pas le fichier à importer comme identité du téléphone. |
| **Identité client** `bionic-appareil.p12` et son mot de passe | Identifie un appareil lorsque mTLS est activé. Facultative pour HTTPS seul. | Privés, propres à un appareil. Importer l’identité sur l’appareil prévu, puis supprimer les copies de transfert. Ne jamais les joindre à une demande d’aide. |
| Clé privée de l’autorité / du serveur (`.key`, `rootCA-key.pem` ou autre nom) | Permet de signer ou d’utiliser les certificats du serveur. | Sur le PC uniquement, dans le stockage privé du compagnon. Ne jamais la transférer, ni copier `data/security/` pour installer un téléphone. |

Installer une autorité ajoute de la confiance au système : vérifier **l’empreinte
SHA-256 complète de l’autorité**, pas seulement son nom. L’empreinte du certificat
serveur est différente de celle de l’autorité ; comparer des éléments de même type.
Une autorité d’une ancienne installation ou d’un autre compagnon ne convient pas.

## Passer du HTTP initial à HTTPS

1. Lors de l’installation Windows, autoriser si souhaité l’accès au téléphone.
   L’assistant prépare les deux ports précis, principal et vérification HTTPS,
   sur le même réseau Windows privé. Une installation existante sans ce réglage
   le signale dans les paramètres : terminer cette configuration une fois sur le
   PC. Le navigateur n’ouvre aucune règle de pare-feu et ne demande pas d’UAC.
2. Dans **Sécurité des connexions**, choisir **Préparer HTTPS**. Les adresses
   actuelles sont proposées ; les autres noms/IP se règlent sous **Adresses du
   serveur**. Le niveau actif reste HTTP à ce stade.
3. Télécharger **l’autorité du compagnon** (`bionic-autorite.crt`) directement sur ce téléphone et
   [l’installer comme autorité de confiance](#installer-lautorité-sur-son-appareil) dans les réglages du système. Le
   système impose ses confirmations ; le téléchargement seul ne suffit pas. Pour ce premier transfert HTTP, comparer
   l’empreinte avec celle affichée sur le PC par un canal fiable : le réseau HTTP
   initial ne fournit pas à lui seul une preuve d’identité.
4. Choisir **Vérifier la connexion sécurisée**, puis **Ouvrir la vérification
   sécurisée**. Un nouvel onglet vérifie le certificat du candidat. Ne jamais
   confirmer après avoir ignoré un avertissement de certificat. Confirmer le
   passage à HTTPS dans la page sécurisée, puis ouvrir le compagnon à l’adresse
   HTTPS et se reconnecter avec son code. Les anciennes sessions sont invalidées.

Le résultat attendu est une page HTTPS ouverte **sans alerte de certificat**, puis
le niveau actif **HTTPS** dans les paramètres. Un certificat appareil n’est pas
nécessaire à cette première étape. Le port habituel du compagnon reste identique ;
le port temporaire sert seulement à la preuve. Ne pas ajouter l’application à
l’écran d’accueil à partir de la page de preuve.

## Installer l’autorité sur son appareil

Les libellés dépendent de la version du système et du fabricant. Utiliser les
réglages intégrés ; aucun gestionnaire de certificats tiers n’est requis par ce
parcours. Un appareil géré par une organisation peut refuser l’import : demander
alors à son administrateur, sans contourner sa politique.

### Android avec Chrome

1. Télécharger `bionic-autorite.crt` depuis le compagnon et vérifier son empreinte
   avec le PC. Le simple fait d’ouvrir le fichier dans Chrome peut ne pas l’installer.
2. Dans les paramètres Android, rechercher **certificat**. Le parcours courant est
   **Sécurité et confidentialité → Autres paramètres de sécurité → Chiffrement et
   identifiants → Installer un certificat → Certificat CA**. Choisir le fichier
   téléchargé et accepter les confirmations système après vérification.
3. Contrôler sa présence dans les autorités/identifiants de confiance de
   l’utilisateur. Pour ce fichier public, ne pas choisir « certificat Wi-Fi » ou
   l’import d’une identité VPN/application. Le système peut demander le code de
   verrouillage de l’appareil ; ce n’est pas le mot de passe d’une archive `.p12`.
4. Revenir dans Chrome et ouvrir la preuve HTTPS. Si la bonne CA reste ignorée,
   fermer puis rouvrir Chrome. Si nécessaire, essayer un redémarrage du téléphone
   puis la même adresse : cette reprise a résolu un cas utilisateur, sans
   constituer une garantie pour tous les appareils.

L’aide Google confirme l’emplacement général des identifiants, mais son exemple
d’import concerne le Wi-Fi. Le choix **CA** pour une racine et **certificat
utilisateur** pour une identité `.p12` est précisé par le guide Android de HPE
Aruba. Voir les [sources](#références-système).

### iPhone / iPad avec Safari

1. Télécharger et ouvrir l’autorité depuis Safari. Dans **Réglages → Profil
   téléchargé**, examiner puis installer le profil de certificat. Les profils
   installés sont visibles dans **Général → VPN et gestion de l’appareil**.
2. Aller dans **Réglages → Général → Informations → Réglages des certificats** et
   activer la **confiance totale** uniquement pour l’autorité vérifiée du compagnon.
   L’installation manuelle du profil ne lui donne pas automatiquement la confiance TLS.
3. Revenir dans Safari et ouvrir la preuve HTTPS sans avertissement.

Si le profil téléchargé n’apparaît plus avant installation, le télécharger à
nouveau : Apple indique qu’un profil non installé est supprimé après huit minutes.
L’import d’une identité client reste distinct de l’activation de confiance de la CA.

### Windows avec Chrome ou Edge

1. Télécharger l’autorité publique depuis le compagnon, puis vérifier son
   empreinte SHA-256 avec celle des paramètres sur le PC serveur.
2. Ouvrir `certmgr.msc` pour le compte Windows qui utilise le navigateur. Dans
   **Autorités de certification racines de confiance → Certificats**, choisir
   **Toutes les tâches → Importer** et sélectionner l’autorité publique vérifiée.
   Le magasin **Utilisateur actuel** évite de modifier la confiance de tous les
   comptes du PC ; un magasin machine relève d’une autre portée d’administration.
3. Vérifier l’autorité importée, puis rouvrir le navigateur et la preuve HTTPS.

Si un assistant affiche une empreinte d’un autre algorithme, elle ne se compare
pas directement à la SHA-256 du compagnon. Ne pas conclure à une correspondance
sur le seul nom. Le résultat doit être contrôlé dans le navigateur utilisé.

## Ajouter l’application sur l’écran d’accueil

Après confirmation HTTPS, ouvrir **l’adresse HTTPS habituelle** du compagnon sans
alerte, puis se reconnecter. Sur Android, le menu Chrome propose selon sa version
**Installer l’application** ou **Installer et créer un raccourci**. Suivre les
écrans proposés. Sur iPhone/iPad, utiliser l’ajout à l’écran d’accueil de Safari
si proposé. L’absence d’une offre d’installation automatique ne prouve pas une
panne des certificats. Le compagnon ne devient pas autonome : le PC et son
serveur doivent rester disponibles.

Une icône créée avant HTTPS peut ouvrir une ancienne adresse HTTP ; vérifier sa
destination et la recréer depuis l’adresse sécurisée au besoin. Ne jamais
confondre l’offre d’installation avec une preuve de validité TLS.

## Ajouter une identité privée puis activer mTLS (facultatif)

1. Depuis la connexion HTTPS vérifiée, nommer l’appareil puis choisir **Créer le
   certificat de cet appareil**. Télécharger le `.p12` chiffré. Le
   téléchargement est lié à la session et utilisable une fois pendant cinq
   minutes. Le mot de passe disparaît à la fermeture du panneau ou après cinq
   minutes ; aucune copie n’est conservée dans le stockage du navigateur.
2. Importer cette **identité client** dans le système, en utilisant le mot de passe
   d’archive affiché. Sur Android, choisir le certificat utilisateur pour VPN et
   applications ; sur iPhone/iPad, suivre l’import de profil d’identité ; sur
   Windows, l’assistant PKCS#12/PFX importe l’identité dans **Personnel** du compte
   du navigateur. Au retour dans le navigateur, sélectionner ce certificat si demandé.
   Ne pas importer un `.p12` comme autorité racine. La sélection réelle dépend
   du couple OS/navigateur et reste à vérifier sur l’appareil.
3. Pour rendre ce certificat obligatoire, choisir **Exiger un certificat client
   pour se connecter**. La nouvelle preuve TLS exige une identité enregistrée ;
   un appareil sans certificat ne peut pas confirmer. Le niveau HTTPS reste
   actif tant que la preuve mTLS n’est pas confirmée.

Créer un certificat par appareil. En mTLS, un appareil déjà autorisé peut créer
une identité pour le suivant. Privilégier le téléchargement sur l’appareil cible
tant que HTTPS seul est actif. Si un transfert privé vers un autre appareil
possédé est nécessaire, utiliser un canal maîtrisé et communiquer le mot de passe
séparément ; ni archive ni mot de passe ne doivent passer par une demande d’aide.
Ce second appareil doit importer la même
autorité et sa propre identité. Aucun mot de passe ou export privé ne transite
par HTTP, par une URL ou par le canal de maintenance local.

Pour renouveler une identité, utiliser **Renouveler** dans sa ligne. L’ancien
certificat reste autorisé pendant l’import et la vérification du remplaçant.
Le retirer ensuite explicitement depuis un autre appareil autorisé. **Retirer
cet appareil** demande une confirmation nommée et ferme ses connexions. Le
certificat de la connexion actuelle ne peut pas être révoqué depuis cette même
connexion. Une course entre deux révocations ne retire pas tous les accès.

Le port de preuve `certificateProofPort` écoute seulement pendant la préparation,
dix minutes au maximum. Un conflit de port ou un échec de preuve conserve le
niveau confirmé et les données. Recommencer dans les paramètres après correction.
La réception du `.p12` facilite le parcours ; le navigateur ne peut pas effectuer
l’import système ou la sélection de certificat à la place de l’utilisateur.

## Si la vérification échoue

Noter l’**adresse exacte** (protocole, nom/IP et port) et le **code complet** affiché
par le navigateur. Une demande d’aide exclut les tickets et paramètres privés des
URL de preuve. Vérifier l’empreinte de l’autorité, la date des deux appareils et
la présence du nom/IP dans **Détails des certificats → Adresses couvertes**. Les
noms préparés pour un nouveau certificat doivent couvrir l’adresse qui sera
utilisée ; une IP et un nom DNS ne sont pas interchangeables dans un certificat.

Un changement d’IP exige un renouvellement du serveur avec les bonnes adresses,
pas une réinstallation aveugle de la CA. Un délai réseau sur le port de preuve
ne prouve pas un défaut de certificat. Reprendre la [table de dépannage
HTTPS](depannage.md#https-affiche-une-alerte-de-certificat) selon l’erreur exacte.

## Maintenance et compatibilité sur le PC

`Certificats.cmd` conserve les commandes locales ci-dessous pour la récupération,
un serveur expiré ou les anciens usages. Ce n’est plus le parcours normal.

### Préparer HTTPS depuis le PC

1. Démarrer ce compagnon avec `Demarrer.cmd`, puis ouvrir `Certificats.cmd` et
   choisir **Préparer HTTPS**. Indiquer les noms/IP réellement utilisés par les
   appareils. Conserver `127.0.0.1` et `localhost` si une vérification sur le PC
   est souhaitée. Un changement d’adresse ultérieur nécessite un renouvellement.
2. Depuis le PC, transférer le **certificat public de l’autorité** indiqué par
   l’assistant par un canal fiable. Comparer son empreinte SHA-256 avec celle
   affichée par le PC. Aucun fichier `.key`, aucune clé de CA et aucun dossier
   `data/security` ne doit être transmis à un appareil.
3. Installer cette autorité sur l’appareil et activer sa confiance TLS. Les
   manipulations dépendent du système. Sur iPhone/iPad, l’installation du profil
   et l’activation explicite de sa confiance sont deux étapes distinctes.
4. Si le port temporaire de preuve est bloqué par Windows, lancer depuis ce PC
   **`Autoriser-preparation-certificats.cmd`** et accepter l’élévation Windows.
   Ce choix ouvre uniquement le port candidat, pour l’exécutable Node de cette
   instance, l’interface et le sous-réseau Windows privés sélectionnés. Il ne
   modifie pas le profil réseau, le routeur ni le port de maintenance.
5. Ouvrir le lien **preuve HTTPS** sur l’appareil. Un lien local alternatif est
   affiché si `127.0.0.1` fait partie du certificat. Ne pas poursuivre après
   avoir ignoré un avertissement de certificat. Confirmer dans la page de preuve
   seulement après vérification. La préparation expire après dix minutes.
6. L’assistant **État** doit alors indiquer `https`. Revenir à l’adresse HTTPS
   du compagnon et saisir le code. Les anciennes sessions ont été déconnectées.
   `ACCES-PRIVE.txt` contient les adresses actualisées.

Une préparation ne change pas le niveau confirmé. L’application conserve son
port habituel après confirmation ; le port candidat sert seulement à cette
preuve. Le pare-feu habituel reste géré par `Autoriser-reseau.cmd`.

L’autorisation temporaire dispose d’un moniteur caché qui retire sa propre règle
dès la fin, l’annulation, le changement ou l’expiration de la préparation. Une
tâche Windows SYSTEM indépendante est enregistrée avant l’ouverture, à la même
échéance, pour retirer cette règle si le moniteur disparaît ; elle est supprimée
lors du retrait normal. Après une veille ou un redémarrage, son exécution dépend
du planificateur Windows. La preuve serveur expire indépendamment de ce
mécanisme. Le statut final du moniteur est dans
`runtime/certificate-firewall-status.json`. Aucun changement de pare-feu ni tâche
Windows n’est exécuté lors des tests automatisés de ce helper : ses commandes
sont simulées.

### Export local d’un appareil, puis certificat obligatoire

1. Arrêter **cette installation** avec `Arreter.cmd`. Bionic et ComfyUI restent
   ouverts. Dans `Certificats.cmd`, choisir **Créer un certificat appareil** et
   lui donner un nom distinct.
2. L’assistant écrit un `.p12` chiffré et son fichier de mot de passe dans un
   sous-dossier privé de `runtime/certificate-exports/`. Les ACL Windows limitent
   ces fichiers au compte qui exploite le compagnon et à SYSTEM. Le mot de passe
   n’est ni passé en argument de commande, ni envoyé en HTTP, ni affiché dans
   les diagnostics. Le nom du fichier du mot de passe est indiqué localement.
3. Transférer l’archive par un canal fiable ; communiquer le mot de passe
   séparément. Importer l’identité client sur cet appareil. Effacer les copies de
   transfert après l’import. Chaque appareil reçoit une archive différente.
4. Redémarrer ce compagnon. Choisir **Préparer mTLS**, puis effectuer et confirmer
   la preuve HTTPS depuis un navigateur présentant le certificat de cet appareil.
   Le niveau `mtls` confirmé exige ensuite le certificat client et le code/session.

Pour ajouter un appareil après activation du mTLS, répéter la création locale
serveur arrêté, puis redémarrer. Le niveau confirmé reste mTLS pendant toute
l’opération. Aucun accès réseau HTTP n’est rouvert.

### Perte, révocation et renouvellement depuis le PC

- **Retirer un appareil** : serveur actif, utiliser son identifiant ou son
  empreinte visible dans **État**. Son certificat est refusé et ses connexions
  actives fermées. Les autres identités restent autorisées.
- **Renouveler un appareil** : serveur arrêté, choisir **Renouveler un appareil**.
  Un nouveau `.p12` avec un nouveau mot de passe est exporté, puis l’ancien
  identifiant est révoqué. Importer la nouvelle archive et redémarrer. En cas
  d’interruption de l’opération, vérifier le registre dans **État** avant reprise.
- **Renouveler le serveur ou changer de nom/IP** : serveur actif, choisir
  **Renouveler serveur/adresse**, fournir les nouveaux SAN et refaire une preuve
  au même niveau. La CA reste propre à cette installation. Un serveur expiré ne
  donne pas accès aux données en réseau ; sa maintenance locale permet le
  renouvellement si les clés sont encore valides et présentes. Une autorité
  expirée ou des clés perdues peuvent nécessiter la réinitialisation locale.
- **Annuler une préparation** : retire le candidat réseau ; conserve le niveau
  déjà confirmé.

Les commandes avancées peuvent être lancées via `Certificats.ps1` avec `status`,
`https`, `mtls`, `issue-device "Nom appareil"`, `renew-device IDENTIFIANT`,
`revoke-device IDENTIFIANT`, `renew-server` ou `cancel-preparation`. Les commandes
qui créent des clés ou réinitialisent l’identité exigent un serveur arrêté. Ne
pas utiliser un mot de passe comme argument.

## Recommencer depuis le PC

Arrêter ce compagnon, ouvrir `Certificats.cmd`, puis choisir **Réinitialiser les
accès**. La saisie locale de `REINITIALISER` est obligatoire. Cette action change
le code d’accès et le jeton de maintenance, remplace l’identité de certificats et
revient explicitement au HTTP initial. Les anciennes archives client deviennent
inutilisables. Les anciens exports locaux sont retirés. Les conversations,
pièces jointes, travaux images, livrables et fichiers projets sont conservés.
L’identifiant de l’installation reste stable ; l’époque de sécurité et la CA
seront nouvelles. Une simple réinstallation conserve l’identité existante et ne
remplace pas cette action.

La récupération reste possible si le stockage de certificats est corrompu ou si
une clé a disparu. Un processus encore actif, un port occupé, un lien symbolique
ou une incohérence d’identité du runtime entraînent un refus explicite. Aucun
processus découvert n’est tué. Ne pas supprimer manuellement le plancher de
sécurité pour contourner un refus.

## Arrêt, diagnostic et mises à jour

`Demarrer.cmd`, `Arreter.cmd`, `Deconnecter-appareils.cmd` et `Diagnostic.cmd`
utilisent la maintenance locale de la même instance aux trois niveaux. Ce canal
HTTP est lié uniquement à `127.0.0.1` et ne sert ni l’application, ni des clés, ni
une récupération distante. Son port éphémère est publié sans secret dans
`runtime/transport.json`; le jeton reste dans `data/config.json` et voyage
seulement dans le corps des requêtes locales. L’identité du serveur est vérifiée
avant toute action, sans désactiver la validation TLS de l’application.

Les diagnostics construisent une liste de codes, sans clés, mot de passe,
archives client ou copie du stockage privé. Un code `COMPANION_HTTPS_OK` ou
`COMPANION_MTLS_OK` signifie que la maintenance locale confirme ce mode ; ce test
ne remplace pas une connexion TLS depuis le téléphone.

L’installateur conserve `data/` et la PKI lors d’une reconfiguration sur place.
L’outil de mise à jour refuse une distribution sans capacité certificats dès
qu’une identité ou un plancher existent, y compris après une réinitialisation
en HTTP. Une restauration applicative ne doit pas réimporter silencieusement
une ancienne identité. La sauvegarde préparée par `scripts/deploy-local.mjs`
exclut le stockage de certificats, le plancher et les exports ; le déploiement
vérifie que l’identité présente sur la cible n’a pas changé. Conserver les
sauvegardes de conversations séparément de toute sauvegarde volontaire de PKI.
Une restauration manuelle complète par le propriétaire du PC sort de cette
garantie.

## Limites de recette

Le worker de mise à jour a été testé avec de vrais processus détachés, de vrais
serveurs TLS/mTLS et une maintenance locale sur port dynamique. Leur application
était une fixture minimale : cette preuve couvre la sonde de redémarrage, la
conservation de la PKI et le refus d’une régression HTTP avec retour au code mTLS
antérieur. Elle ne constitue pas un déploiement de l’application utilisée.

Les connexions TLS automatisées et les fixtures Windows ne prouvent pas l’import
ou la sélection d’identité dans un téléphone physique. Avant distribution,
essayer sur chaque couple OS/navigateur cible : confiance CA, import PKCS#12,
présentation du bon certificat, renouvellement, révocation et perte d’appareil.
L’élévation UAC, la création réelle de la règle temporaire, son expiration après
veille et la tâche de secours restent également à vérifier sur un PC Windows
consentant. Aucun de ces changements système n’a été activé sur l’installation
utilisée pendant ce développement.

## Références système

Sources officielles consultées le **23 octobre 2026**. Elles décrivent les
mécanismes système ; les libellés et l’import sur chaque appareil physique
doivent encore être vérifiés.

- [Google — Ajouter et supprimer des certificats Android](https://support.google.com/pixelphone/answer/2844832?hl=fr) : emplacement des identifiants ; exemple Wi-Fi à distinguer de la CA HTTPS.
- [HPE Aruba — Installer les certificats CA et utilisateur Android](https://arubanetworking.hpe.com/techdocs/VIA/oxygen/VIA%20User%20Guide/GUID-562E6522-AFA7-41EC-8F16-D7792A935086.html) : distinction entre racine CA et identité utilisateur PKCS#12.
- [Apple — Faire confiance à un certificat installé manuellement](https://support.apple.com/fr-fr/102390) : activation explicite de confiance TLS après import manuel.
- [Apple — Installer un profil de configuration](https://support.apple.com/fr-fr/102400) : installation dans Réglages et durée d’attente du profil téléchargé.
- [Microsoft — Magasins de certificats](https://learn.microsoft.com/en-us/windows-server/identity/ad-cs/inspect-certificates-manage-certificate-stores) et [import d’une autorité pour l’utilisateur actuel](https://learn.microsoft.com/en-us/powershell/module/pki/import-certificate) : portée du magasin et contrôle après import.
- [Microsoft — Import d’une identité PFX](https://learn.microsoft.com/en-us/powershell/module/pki/import-pfxcertificate) et [Apple — Distribution de certificats aux appareils](https://support.apple.com/fr-fr/guide/deployment/depcdc9a6a3f/web) : identité privée distincte du certificat public.
- [Google Chrome — Erreurs de certificat](https://support.google.com/chrome/answer/95669?hl=fr) : code d’erreur et vérification de date/heure.
- [Google Chrome — Utiliser les applications Web](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=fr) : installation Android depuis le menu du navigateur.
- [Apple — Transformer un site en application Safari](https://support.apple.com/fr-fr/guide/iphone/iphea86e5236/ios) : ajout à l’écran d’accueil.

Exploitation Windows : [règles NetSecurity](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule),
[paramètres du planificateur Windows](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset).
