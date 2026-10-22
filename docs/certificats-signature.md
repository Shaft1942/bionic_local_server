# Signature et stockage des certificats

Implémentation du 22 octobre 2026, Node.js 24. Aucune installation active n’a été
modifiée pour ces contrôles. Les essais utilisent exclusivement des données
fictives sous `work/` et des ports de boucle locale éphémères.

## Choix de signature

Le moteur embarqué est un bundle JavaScript de **@peculiar/x509 2.2.0**, **PKI.js
4.0.0** et **ASN1.js 4.0.0**, construit avec esbuild 0.28.2. Les versions,
provenances npm, empreintes d’intégrité et licences des dépendances transitives
sont consignées dans `vendor/certificate-crypto.provenance.json`,
`vendor/certificate-crypto.package-lock.json` et `THIRD-PARTY-NOTICES.md`.
L’empreinte SHA-256 du bundle est vérifiée par un test de recette.

La génération des clés, les signatures RSA, AES et PBKDF2 utilisent le WebCrypto
natif de Node.js. Les bibliothèques codent les structures X.509, PKCS#8 et
PKCS#12 ; le projet ne possède pas d’encodeur ASN.1 artisanal. La validation TLS,
des usages et des chaînes entrantes utilise Node/OpenSSL, et non un validateur
JavaScript. Le compagnon ne télécharge aucun code et n’appelle ni npm ni un
exécutable OpenSSL à l’exécution.

Le registre npm a été interrogé pendant la préparation : `npm audit` ne signalait
aucune vulnérabilité pour ces dépendances le 22 octobre 2026. C’est un constat
daté, pas une garantie contre une découverte ultérieure. node-forge 1.4.0 a été
écarté après consultation de son suivi d’alertes RSA actuel.

Références primaires : [documentation x509](https://peculiarventures.github.io/x509/docs/usage/),
[sources PKI.js](https://github.com/PeculiarVentures/PKI.js),
[API PFX PKI.js](https://pkijs.org/docs/api/classes/PFX/),
[TLS Node.js](https://nodejs.org/api/tls.html),
[suivi de l’alerte node-forge](https://github.com/digitalbazaar/forge/issues/1154).

## Profil émis

| Identité | Clé et signature | Usages et durée |
| --- | --- | --- |
| Autorité de l’installation | RSA 3072, exposant 65537, SHA-256 | CA, `keyCertSign`, `cRLSign`, contrainte de chemin 0 ; 3650 jours |
| Serveur | Nouvelle RSA 3072, signée SHA-256 par la CA locale | `serverAuth` seulement, `digitalSignature`/`keyEncipherment`, DNS/IP réels dans les SAN ; expiration au plus 397 jours après génération |
| Appareil | Nouvelle RSA 3072, signée SHA-256 par la même CA | `clientAuth` seulement, `digitalSignature`/`keyEncipherment` ; expiration au plus 397 jours après génération |

Les numéros de série sont positifs, aléatoires et limités à 20 octets. Les dates
sont antidatées de cinq minutes pour tolérer un léger décalage d’horloge ; une
émission hors de la période de validité de la CA est refusée. Les empreintes de
registre sont des SHA-256 hexadécimales minuscules, sans deux-points.

Un export appareil est un PKCS#12/PFX protégé par **PBES2 AES-256-CBC et
PBKDF2-HMAC-SHA-256, 100 000 itérations**, avec un sel aléatoire de 16 octets
distinct pour chaque protection. La MAC PKCS#12 utilise SHA-256, 100 000
itérations et son propre sel aléatoire de 64 octets. Les certificats et la clé
embarqués dans l’archive sont chiffrés. Le mot de passe doit contenir 12 à 200
caractères ASCII imprimables, afin d’éviter les divergences d’encodage entre
importateurs ; le parcours local génère un secret aléatoire.

## Compatibilité PKCS#12 : correctif explicite

PKI.js 4.0.0 emploie par défaut un sel PBKDF2 de 64 octets. Une archive ainsi
produite a été lue par Node/OpenSSL et par le lecteur PKCS#12 géré de .NET, mais
son import natif Windows dans `X509Certificate2Collection` a échoué. En ne
changeant que ce sel à **16 octets**, l’import natif a réussi avec les deux
certificats, une seule clé privée et le refus du mauvais mot de passe.

Le script de construction applique donc ce correctif d’interopérabilité unique
à `CryptoEngine.encryptEncryptedContentInfo`. Il vérifie la version et
l’empreinte exacte du fichier source avant transformation, et enregistre les
empreintes avant/après dans la provenance. Les algorithmes, le générateur
aléatoire et le nombre d’itérations ne changent pas. Une mise à jour de PKI.js
exige une revue explicite du correctif et la réexécution du test Windows.

La représentation BER construite de certains OCTET STRING est également
normalisée via les objets ASN1.js en représentation primitive, adaptée à DER.
La MAC finale est calculée après préparation des contenus ; son identifiant de
digest inclut un paramètre NULL pour compatibilité. Aucun attribut de fournisseur
Microsoft ni algorithme ancien 3DES/RC2 n’est nécessaire dans l’archive.

## Stockage et récupération

`lib/certificate-store.mjs` conserve les fichiers dans `data/security/`. Les clés
de la CA et du serveur sont des PEM privés protégés par des droits Windows
limités au SID de l’utilisateur et à SYSTEM (`icacls`, arguments séparés, sans
interpolation de commande). Sous Unix, les droits sont 0700 pour les dossiers et
0600 pour les fichiers. Ces fichiers ne sont pas chiffrés par DPAPI : le compte
Windows du serveur doit rester protégé. Le serveur n’installe aucun certificat
dans le magasin de confiance Windows.

La clé privée d’un appareil ne figure jamais dans ce stockage. Elle reste
temporairement en mémoire durant la création du PKCS#12, puis le magasin ne
conserve que son identité publique. Les fichiers d’export locaux sont privés et
doivent être supprimés après transfert fiable et import. L’API interne retournant
le Buffer PFX est réservée au parcours d’export local, sans route HTTP de clé.

L’état version 1 comprend le niveau `http`/`https`/`mtls`, une epoch UUID,
l’autorité, le serveur actif, le candidat et le registre des appareils. Les
écritures sont atomiques par fichier, avec synchronisation avant renommage. Le
plancher distinct `data/security-floor.json` porte l’epoch et le niveau confirmé.
Il est écrit avant une montée : une interruption entre les deux écritures produit
un verrouillage explicite au prochain démarrage. Elle ne rétablit jamais HTTP.

La simple lecture d’une installation HTTP n’écrit aucune identité. Après la
première opération de certificats, un stockage partiellement absent, une clé
incohérente, des métadonnées invalides, un mauvais plancher, un lien symbolique ou
un certificat actif pas encore valide entraînent `SECURITY_LOCKED`. Un certificat
actif expiré bloque aussi le chargement normal ; `allowExpired:true` est réservé
à la maintenance qui conserve le niveau et applique le refus de l’application
réseau. Il permet la préparation d’un remplacement, sans renouveler la CA ni
abaisser le niveau.

`resetCertificateStoreLocal(dataDir)` permet la récupération même si l’ancien état
est illisible. Son appelant impose une opération explicite locale, serveur arrêté,
et renouvelle le code, les sessions et le jeton d’administration. La fonction
retire exclusivement `data/security/`, remplace le plancher avec une nouvelle
epoch HTTP et conserve les autres données. Les liens symboliques dans les
ancêtres, le répertoire de sécurité ou le plancher sont refusés. Une restauration
manuelle complète d’anciens fichiers par l’utilisateur Windows reste hors de la
garantie contre le recul de sécurité.

Le magasin ne décide pas seul qu’une connexion de preuve est réussie : le serveur
de transport doit vérifier la connexion réelle avant `confirmServer` et
`activateMtls`. `confirmServer` conserve mTLS lors d’un renouvellement. La
révocation doit aussi fermer les sockets et invalider les sessions dans la couche
serveur ; un registre seul ne met pas fin à une connexion déjà ouverte.

## Contrôles réalisés et limites

`node --test test/certificate-pki.test.mjs test/certificate-store.test.mjs` couvre
la séparation des CA, les SAN DNS/IP, les usages serveur/client, les connexions
HTTPS/mTLS réelles, l’absence de certificat client, la CA étrangère, l’expiration,
le mauvais nom, le mot de passe PKCS#12 et l’import indépendant Windows .NET
avec `EphemeralKeySet` (sans installation dans un magasin système).

Les essais de stockage couvrent la montée persistante, le renouvellement en mTLS,
deux appareils et la révocation ciblée, la perte de clés/état, un plancher
incohérent, la maintenance d’un serveur expiré et une récupération conservant des
conversations/pièces jointes fictives. Les contrôles intégrés de transport, sessions,
Host/Origin, mises à jour et lanceurs sont décrits dans le reçu global du lot.

**Les imports et la présentation du certificat sur téléphone/tablette physiques
ne sont pas validés par ces tests.** La reconnaissance de la CA par le système et
le choix du certificat client restent à essayer sur les OS et navigateurs cibles
(T11), avec consentement explicite pour la confiance système. Aucun test ne
désactive la validation TLS pour conclure à une réussite.

## Reconstruire le bundle (développement seulement)

Installer Node.js 24 et npm, puis préparer un répertoire de build isolé
`work/crypto-build`. Copier `vendor/certificate-crypto.package-lock.json` dans
ce répertoire sous le nom `package-lock.json`, et créer un `package.json` contenant
les dépendances racines exactes du lockfile. Exécuter `npm ci --ignore-scripts`
dans ce répertoire, puis `node scripts/build-crypto-vendor.mjs` depuis le dépôt.
Revoir la provenance, les licences et le résultat de `npm audit`, puis exécuter
les tests PKI/store et le test d’import natif Windows avant de livrer le bundle.
Une modification du hash source attendu de PKI.js n’est jamais automatique.
