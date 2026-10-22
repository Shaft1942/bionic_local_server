# Certificats : configuration depuis le navigateur

Le compagnon commence en HTTP. Ouvrir **Paramètres → Sécurité des connexions**
sur le téléphone ou le PC. Le lien `/?settings=security` ouvre directement cette
section après connexion ; **Accès sécurisés** dans l’assistant Windows ouvre
la même interface. Aucune opération de ce parcours ne sollicite Bionic ou ComfyUI.

## Parcours recommandé sur le téléphone

1. Lors de l’installation Windows, autoriser si souhaité l’accès au téléphone.
   L’assistant prépare les deux ports précis, principal et vérification HTTPS,
   sur le même réseau Windows privé. Une installation existante sans ce réglage
   le signale dans les paramètres : terminer cette configuration une fois sur le
   PC. Le navigateur n’ouvre aucune règle de pare-feu et ne demande pas d’UAC.
2. Dans **Sécurité des connexions**, choisir **Préparer HTTPS**. Les adresses
   actuelles sont proposées ; les autres noms/IP se règlent sous **Adresses du
   serveur**. Le niveau actif reste HTTP à ce stade.
3. Télécharger **l’autorité du compagnon** directement sur ce téléphone et
   l’installer comme autorité de confiance dans les réglages du système. Le
   système impose ses confirmations. Pour ce premier transfert HTTP, comparer
   l’empreinte avec celle affichée sur le PC par un canal fiable : le réseau HTTP
   initial ne fournit pas à lui seul une preuve d’identité.
4. Choisir **Vérifier la connexion sécurisée**, puis **Ouvrir la vérification
   sécurisée**. Un nouvel onglet vérifie le certificat du candidat. Ne jamais
   confirmer après avoir ignoré un avertissement de certificat. Confirmer le
   passage à HTTPS dans la page sécurisée, puis ouvrir le compagnon à l’adresse
   HTTPS et se reconnecter avec son code. Les anciennes sessions sont invalidées.
5. Depuis cette connexion HTTPS, nommer l’appareil puis choisir **Créer le
   certificat de cet appareil**. Télécharger le `.p12` chiffré et importer ce
   fichier dans le système avec le mot de passe affiché dans le panneau. Le
   téléchargement est lié à la session et utilisable une fois pendant cinq
   minutes. Le mot de passe disparaît à la fermeture du panneau ou après cinq
   minutes ; aucune copie n’est conservée dans le stockage du navigateur.
6. Pour rendre ce certificat obligatoire, choisir **Exiger un certificat client
   pour se connecter**. La nouvelle preuve TLS exige une identité enregistrée ;
   un appareil sans certificat ne peut pas confirmer. Le niveau HTTPS reste
   actif tant que la preuve mTLS n’est pas confirmée.

Créer un certificat par appareil. En mTLS, un appareil déjà autorisé peut créer
une identité pour le suivant ; transférer le fichier privé et communiquer son
mot de passe de façon appropriée. Ce second appareil doit importer la même
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

Références système : [règles Windows NetSecurity](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule),
[paramètres du planificateur Windows](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset).
