# Signature et stockage des certificats

[Documentation](README.md) · [Sécurité](../SECURITY.md) · [Usage et récupération](certificats-utilisation.md)

Cette page décrit les contrats techniques à préserver. Les procédures d’import utilisateur sont dans le guide d’usage ; les essais synthétiques et leur portée sont expliqués dans [Développement](developpement.md).

## Dépendances et provenance

Le bundle embarqué utilise **@peculiar/x509 2.2.0**, **PKI.js 4.0.0** et **ASN1.js 4.0.0**. Versions, intégrités, transformations et licences sont enregistrées dans `vendor/certificate-crypto.provenance.json`, `vendor/certificate-crypto.package-lock.json` et [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md). Le test de recette vérifie l’empreinte du bundle.

WebCrypto de Node.js réalise génération des clés et opérations cryptographiques. Les bibliothèques encodent X.509, PKCS#8 et PKCS#12 ; Node/OpenSSL valide les chaînes et usages entrants. Aucun téléchargement de code, appel npm ou exécutable OpenSSL n’est nécessaire à l’exécution du compagnon. Une absence d’alerte lors d’un ancien audit n’est pas une garantie pour les dépendances actuelles : toute mise à jour demande revue de provenance et tests.

## Profils émis

| Identité | Clé et signature | Usages et validité |
| --- | --- | --- |
| Autorité locale | RSA 3072, exposant 65537, SHA-256 | CA, `keyCertSign`, `cRLSign`, chemin 0 ; 3650 jours |
| Serveur | Nouvelle RSA 3072, signature de la CA | `serverAuth`, `digitalSignature`/`keyEncipherment`, SAN DNS/IP ; au plus 397 jours |
| Appareil | Nouvelle RSA 3072, signature de la CA | `clientAuth`, `digitalSignature`/`keyEncipherment` ; au plus 397 jours |

Les numéros de série sont aléatoires, positifs et bornés à 20 octets. L’antidatage de cinq minutes tolère un léger décalage d’horloge ; une émission hors validité de la CA est refusée. Les empreintes du registre sont des SHA-256 hexadécimales minuscules.

Le PKCS#12 utilise PBES2 AES-256-CBC, PBKDF2-HMAC-SHA-256 à 100 000 itérations et un sel de 16 octets par protection. Sa MAC utilise SHA-256, 100 000 itérations et un sel propre de 64 octets. Certificats et clé de l’archive sont chiffrés. Le mot de passe accepte 12 à 200 caractères ASCII imprimables pour limiter les divergences d’encodage des importateurs.

## Correctif d’interopérabilité

Le bundle remplace le sel PBKDF2 par défaut de 64 octets de PKI.js par **16 octets** pour l’import PKCS#12 natif Windows. Le changement porte uniquement sur `CryptoEngine.encryptEncryptedContentInfo`, avec contrôle de version et d’empreinte de la source ; les empreintes avant/après restent dans la provenance. Les algorithmes, le nombre d’itérations et la génération aléatoire ne changent pas.

Les OCTET STRING construits sont normalisés en représentation primitive adaptée à DER. La MAC est calculée après préparation des contenus et son digest inclut le paramètre NULL de compatibilité. Aucun attribut Microsoft ni algorithme ancien 3DES/RC2 n’est nécessaire. Une nouvelle version des bibliothèques doit préserver ou requalifier ces choix, y compris avec un importeur indépendant.

## Stockage et invariants

`lib/certificate-store.mjs` gère `data/security/`. Les PEM privés CA/serveur sont protégés par ACL sous Windows, ou droits 0700/0600 sous Unix. Ils ne sont pas chiffrés par DPAPI : la protection du compte et des sauvegardes reste nécessaire. Le serveur n’installe aucun certificat dans le magasin système.

La clé privée appareil ne persiste pas dans ce magasin. Le téléchargement HTTPS garde le PKCS#12 en mémoire cinq minutes au plus, lié à la session et au certificat client éventuel, avec un usage unique. L’export local de maintenance reste un fichier privé à retirer après import/transfert fiable. Aucune clé n’est servie en HTTP non chiffré et aucun mot de passe n’entre dans une URL ou journal.

L’état comporte niveau `http`/`https`/`mtls`, epoch et identités. Le plancher `data/security-floor.json` est persisté avant une montée : une interruption incohérente produit un verrouillage, pas un repli HTTP. État partiel, clé incohérente, plancher invalide ou lien symbolique provoquent `SECURITY_LOCKED`. `allowExpired:true` est réservé à la maintenance sans abaissement du niveau réseau.

La récupération locale complète exige le serveur arrêté et une confirmation sur le PC ; elle renouvelle identité, code et sessions, et conserve les autres données. Restaurer manuellement un ancien dossier entier reste hors de la garantie contre le recul d’identité.

La preuve de transport doit précéder `confirmServer` ou `activateMtls`. Un renouvellement conserve mTLS. La révocation doit fermer les sockets et invalider les sessions : un registre modifié seul ne clôt pas une connexion déjà ouverte.

## Vérifier une évolution

Les tests PKI, magasin, transport et parcours navigateur utilisent des certificats et données fictifs. Ils ne prouvent pas l’import ou la confiance d’un téléphone physique. Pour une évolution des bibliothèques, exercez aussi les mauvais mot de passe, nom, usages, CA étrangère, expiration et indépendance des clés ; conservez les notices et contrôles d’intégrité du bundle.
