# Reçu du lot certificats

22 octobre 2026 — branche `codex/certificats`, base V2
`a948b1926e139ba72046195951911ac16af30f2a`, cadrage initial `3e24568`.
Ce reçu concerne les sources du worktree dédié, sans déploiement ni activation
sur l’installation utilisée. La version de release n’est pas modifiée.

Commits d’implémentation : `5b0793f` (PKI/stockage), `b64074f`
(transport/exploitation), `33f5845` (interface). Le commit de documentation
final suit ces trois commits ; son SHA complet est fourni dans la livraison.

## Résultat livré

Le compagnon conserve son démarrage HTTP initial. `Certificats.cmd` prépare
HTTPS, puis mTLS, sur un port TLS temporaire ne servant que la preuve. Le lien
local à usage unique expire après dix minutes. Une connexion réelle, un clic
explicite et, pour mTLS, un appareil autorisé précèdent la fermeture de l’ancien
accès. Le niveau confirmé est persistant, sans retour distant automatique.

Une CA par installation signe des certificats serveur et client aux usages
distincts. Les identités client sont individuelles ; leur export PKCS#12 chiffré
et leur mot de passe sont uniquement écrits dans des fichiers locaux protégés.
La création, le renouvellement client et le reset demandent un serveur arrêté.
La récupération locale change les accès et conserve les données personnelles.

L’administration HTTP est séparée, liée uniquement à `127.0.0.1`, authentifiée
par le secret local et limitée à ses routes. Elle ne sert pas l’application,
les clés ni une récupération distante. Les cookies HTTPS sont `Secure` et liés
à une epoch ; les sessions mTLS sont aussi liées à l’empreinte du client.
La révocation ferme les sockets concernées et la reprise TLS est désactivée.

Le [choix de signature](certificats-signature.md) documente le bundle maintenu,
les versions et licences, l’empreinte, le correctif de sel PBKDF2 nécessaire à
l’import Windows natif, et l’absence de téléchargement au runtime.

## Matrice de recette

| Critère | Résultat et portée |
| --- | --- |
| T01 HTTP initial | Factory et routes historiques testées sur installations fictives ; aucune PKI écrite par une simple lecture HTTP. |
| T02 Identité serveur | Vrais clients TLS : CA reconnue, SAN DNS/IP, mauvais nom, CA étrangère et serveur expiré. Aucune validation TLS désactivée pour conclure à un succès. |
| T03 Fermeture HTTP et sessions | Après preuve : ancien HTTP réseau refusé, anciens cookies inutilisables, cookie HTTPS sécurisé ; le canal de maintenance ne sert ni login ni application. |
| T04 mTLS obligatoire | Refus sans certificat, avec CA étrangère, certificat non enregistré/révoqué, mauvais usage, client expiré ou futur sous sa propre CA. Un code ou cookie ne remplace pas le certificat. |
| T05 Appareils indépendants | Identités A/B distinctes, cookie A non utilisable avec B, révocation A fermant son socket persistant, reprise TLS ne contournant pas le registre ; B reste admis. Ajout/renouvellement local vérifiés. |
| T06 Persistance et pannes | Niveau conservé après réouverture/redémarrage ; états, clés, plancher ou modes incohérents verrouillés. Serveur expiré renouvelé par maintenance et preuve réelles sans ouvrir HTTP. Arrêt concurrent ne recrée pas de listener. |
| T07 Récupération | Reset local hors ligne d’une PKI corrompue, rotation du code/jeton/epoch, empreintes des données fictives conservées ; anciennes identités et cookies n’empêchent pas le nouveau parcours HTTP. Aucune route distante de reset. |
| T08 Renouvellement et adresses | Renouvellement serveur en mTLS sans baisse de niveau, connexion TLS au nouveau nom SAN en boucle locale ; émission client remplaçante révoquant seulement son prédécesseur. Aucun changement réel du réseau de la machine. |
| T09 Exploitation | Lanceurs Windows et maintenance aux trois niveaux, compatibilité d’update et conservation PKI/plancher testées. Helper pare-feu et tâche d’expiration testés avec commandes simulées. UAC, vraie règle/tâche Windows, veille et téléphone restent hors de cette preuve. |
| T10 Secrets et distribution | CA distinctes, registre sans clés client, ACL compte courant + SYSTEM, rejet des liens dans les ancêtres, provenance du bundle et export public contrôlés ; fichiers de certificats/clés interdits dans les manifestes de distribution. |
| T11 Appareils physiques | **Non validé sur téléphone/tablette.** UI testée à 1440 et 390 px sur métadonnées et routes fictives. Import PKCS#12 Windows .NET éphémère validé ; il ne valide pas Safari/Chrome mobile ni la confiance système d’un appareil physique. |

## Contrôles et limites

Recette finale sur le candidat :

- `node --test test/*.test.mjs` : **481 réussis, 0 échec, 0 ignoré**, en 19,6 s.
  TEMP/TMP sont dirigés vers `runtime/certificates-suite-tests/` du worktree.
- `node scripts/check.mjs` : **94 fichiers JavaScript** vérifiés.
- `node scripts/check-export.mjs` : **185 sources publiques** autorisées, sans
  données d’installation.
- `node scripts/build-release.mjs` : construction propre de l’archive locale
  **2.0.0 inchangée**, avec les 185 fichiers. Cette construction n’est ni une
  publication ni une autorisation de déployer ; la coordination gère la release.
- Le worker détaché a redémarré de vraies fixtures HTTPS et mTLS, avec maintenance
  dynamique ; une régression de startup vers HTTP malgré un plancher mTLS a
  provoqué un refus, un retour arrière et une reconnexion mTLS valide. Les
  applications de ces essais sont des stubs ; processus, TLS et worker sont réels.

La suite complète a été exécutée après gel des écritures des agents. Les essais
de navigation dédiés sont réussis aux deux largeurs ; ils utilisent des routes
simulées, avec fermeture directe, Échap, retour du focus, erreur et reprise.

Les suites dédiées sont `test/certificate-pki.test.mjs`,
`test/certificate-store.test.mjs`, `test/certificate-transport.test.mjs`,
`test/certificate-operations.test.mjs` et `test/certificates-ui.test.mjs`.
Les parcours de paramètres sont aussi contrôlés par
`scripts/browser-certificates.mjs`, avec routes fictives sans serveur actif.
Les captures sont ignorées sous `browser-test-results/certificates/`.

Les sockets et imports Windows ont nécessité une exécution hors du bac à sable
sur leurs seules fixtures. Les refus `EACCES` du bac à sable ne sont pas des
résultats positifs. Des essais historiques de fichiers ont également rencontré
des fixtures ayant deux liens physiques (`nlink=2`) dans l’environnement : la
protection existante les a refusées. La baseline V2 a présenté le même défaut ;
aucune protection de production ni test historique n’a été affaibli pour le masquer.

Une restauration manuelle complète d’un ancien état par le propriétaire Windows
reste hors de la garantie applicative de non-recul. Les sauvegardes de PKI
doivent rester séparées et privées. Le reset peut nécessiter de retirer les
anciennes autorités de confiance sur les appareils, puis d’installer la nouvelle.

## Fichiers communs modifiés

- Serveur : `server.mjs` et son transport dédié ; modules PKI/stockage nouveaux.
- Exploitation : `Bionic-mobile-commun.ps1`, `Demarrer.ps1`, `Arreter.ps1`,
  `Autoriser-reseau-prive.ps1`, `Installation-commun.ps1`, `Installer.ps1`,
  `lib/update-installer.mjs`, `lib/diagnostics.mjs`, `scripts/diagnostic.mjs`,
  `scripts/revoke-sessions.mjs`, `scripts/deploy-local.mjs`.
- Interface : `public/index.html`, `public/settings.js`, `public/style.css` et
  le module `public/certificates.js`.
- Distribution : `.gitignore`, `release-manifest.json`,
  `scripts/release-files.mjs`, `test/release.test.mjs` et notices tierces.
- Documentation : `README.md`, `SECURITY.md`, `docs/configuration.md`,
  `docs/sauvegarde-mise-a-jour.md`, plan et guides certificats.

L’intégration et le déploiement appartiennent à la coordination. Aucune commande
de cette recette n’a arrêté, redémarré ou sollicité en génération Bionic, ComfyUI
ou le compagnon de l’installation utilisée.
