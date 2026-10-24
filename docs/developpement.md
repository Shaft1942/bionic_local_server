# Développement

[Documentation](README.md) · [Contribution](../CONTRIBUTING.md) · [Publication](publication.md)

## Environnement

Node.js **24+** et Git sont requis. Le serveur n’a aucune dépendance npm d’exécution et le navigateur ne demande aucune compilation. Python **3.10+** est facultatif pour l’extraction documentaire et les scripts Python ; l’extraction PDF utilise `pypdf`. Le lanceur ComfyUI utilise le Python de l’installation sélectionnée.

```sh
git clone https://github.com/Shaft1942/bionic_local_server.git
cd bionic_local_server
npm run check
npm test
npm run check:export
npm run check:docs
```

Pour un essai manuel, utilisez un dossier, un port et des projets distincts de votre installation personnelle. Partez de `config.example.json`, puis `npm start`. N’utilisez pas une configuration privée comme fixture.

## Sources et responsabilités

| Sources | Rôle |
| --- | --- |
| `server.mjs` | Fabrique `createCompanion`, authentification, routes et intégration |
| `lib/bionic-store.mjs` | Historiques natifs sans écriture |
| `lib/local-projects.mjs`, `lib/conversation-organizer.mjs` | Projets locaux, adoption explicite et classement |
| `lib/conversation-repository.mjs` | Conversations web, index dérivé, cache et pagination |
| `lib/model-service.mjs`, `lib/model-transport.mjs` | Capacités, chargement/déchargement et transport |
| `lib/agent-tools.mjs`, `lib/file-agent.mjs` | Permissions, appels d’outils, budgets et flux |
| `lib/project-files.mjs`, `lib/tool-approvals.mjs`, `lib/script-tools.mjs`, `lib/web-tools.mjs` | Frontières fichiers, accords et accès web |
| `lib/comfy-images.mjs`, `lib/comfy-settings.mjs`, `workflows/` | Recettes image fixes, file, suivi et relance |
| `lib/gpu-scheduler.mjs`, `lib/job-coordinator.mjs`, `lib/inference-gate.mjs` | Politique des lots, réservations et limites d’inférence |
| `lib/local-service-*.mjs`, `scripts/local-service-host.py` | Contrôle manuel Bionic/ComfyUI, identité et reçus |
| `lib/companion-lifecycle.mjs`, `lib/ndjson-writer.mjs` | Arrêt borné, checkpoints et clients lents |
| `lib/certificate-*.mjs`, `vendor/` | Identités locales et transport HTTPS/mTLS |
| `public/` | Interface, reçus, galeries, paramètres et catalogues |
| `ui/src/lib/companion/` | Présentation Canaé, navigation et interactions ; les sources Svelte sont compilées dans `public/llama-ui/` |
| `ui/src/lib/companion/client/`, `api.ts` | Client applicatif du suivi des demandes, contrats ciblés et validation des événements/reçus externes |
| `lib/companion-capabilities.mjs` | Projection descriptive des supports/permissions/paramètres, sans effet sur les moteurs |
| `test/`, `scripts/browser-*.mjs` | Tests synthétiques et parcours de développement |

Importer `server.mjs` n’ouvre pas de port et ne crée pas de fichiers. `createCompanion(options)` initialise un dossier explicite avec des dépendances injectables ; les tests remplacent les moteurs, fichiers natifs et transports concernés. L’appelant possède l’écoute et la fermeture des ressources.

Le même serveur livre l'API et le build de Canaé. Les composants possèdent la présentation, les brouillons et la navigation ; le client applicatif possède le suivi des intentions et la récupération par lecture. Les règles et les permissions restent dans les services et adaptateurs backend. Le [contrat de capacités](capabilities.md) distingue le support intrinsèque, les permissions et la disponibilité ; son affichage n'accorde aucun droit. Cette séparation est progressive : toutes les frontières ne sont pas encore typées.

Pour modifier l'interface Canaé, installer les dépendances verrouillées avec `npm --prefix ui ci`, puis exécuter `npm --prefix ui run check` et `npm run build:ui`. Vérifier le build effectivement servi et mettre à jour la liste fermée du manifeste quand les noms d'assets changent. Les dépendances de développement ne sont pas nécessaires à l'utilisateur de l'archive compilée.

## Invariants

- Capturer permissions et préférences à l’acceptation ; construire le contexte au démarrage du tour.
- Garder les historiques natifs en lecture seule et les projets locaux sous une autorité explicite. Une adoption ne doit jamais élargir silencieusement les droits.
- Exiger un accord lié au code exact avant chaque script. Un fork copie des données historiques, pas les validations ou pouvoirs de restauration de la source.
- Conserver les reçus et intentions avant effet. Une réponse perdue ou un résultat inconnu ne justifie pas de resoumission automatique.
- Libérer les réservations après règlement d’un chargement non annulable ou d’une récupération mémoire, y compris en cas d’erreur/annulation.
- Distinguer processus, API, activité et modèle chargé. Un reçu privé seul ne prouve pas la propriété d’un processus.
- Ne jamais traduire le contenu utilisateur lors d’un changement de langue ; voir [Internationalisation](internationalisation.md).

## Vérifications

Choisissez d’abord les tests du propriétaire touché. Les tests HTTP utilisent `handle` en mémoire ou des listeners temporaires sur `127.0.0.1:0`. Les registres et bases sont fabriqués. Un appel réel à Bionic, ComfyUI, un modèle ou un projet personnel reste une qualification distincte et explicite.

Avant une livraison, lancez syntaxe, suite complète et export. La CI les exécute sur Windows et Ubuntu avec Node.js 24 ; ses résultats appartiennent au commit réellement testé. Une réussite locale ne remplace pas la CI distante.

Les cinq tests Python/OS de `test/local-service-process.test.mjs` sont opt-in via `BIONIC_LIFECYCLE_REAL_PYTHON=1`. Ils créent leurs propres processus synthétiques ; ne les présentez pas comme réussis lorsqu’ils sont ignorés. Les tests de certificats utilisent une PKI fictive et des ports temporaires, sans installation dans le magasin système.

## Parcours navigateur

Pour développer uniquement :

```sh
npm install --include=dev
npx playwright install chromium
npm run test:browser
```

Les scripts interceptent les requêtes avec leurs API synthétiques. `PLAYWRIGHT_MODULE_PATH` permet une installation Playwright existante, `BIONIC_BROWSER_CHANNEL` choisit un navigateur installé et `BIONIC_SMOKE_SCREENSHOTS` choisit un dossier de sortie privé. Ne codez aucun chemin personnel dans les sources.

| Parcours | Commande |
| --- | --- |
| Conversations, file et accords | `npm run test:browser` |
| Langue, streaming et saisies | `npm run test:browser:i18n` |
| Quantité d’images et mémoire | `npm run test:browser:image-counts` |
| Annulation, relance, galerie et ZIP | `npm run test:browser:image-actions` |
| Commandes des serveurs et récupération | `npm run test:browser:services` |
| Projets, droits, clic extérieur et image directe | `npm run test:browser:beta24` |
| Pagination et ancrage des messages | `npm run test:browser:history` |
| Paramètres, aide et certificats | `node scripts/browser-settings.mjs`, `npm run test:browser:help`, `node scripts/browser-certificates.mjs` |

Le nom historique `beta24` reste un identifiant de test, pas le canal de la version livrée. Le bootstrap TLS isolé est dans `scripts/browser-certificate-bootstrap.mjs` ; la confiance du certificat y est limitée au processus de test.

## Contenu public

Le dépôt et l’archive contiennent sources, exemples neutres, documentation actuelle et tests reproductibles. Les données d’installation, profils locaux, sorties, comptes rendus d’agents et anciennes preuves de poste restent exclus. Actualisez la liste fermée `release-manifest.json` pour chaque ajout/retrait public ; `check:export` refuse un fichier suivi hors liste.

Les distributions de moteur non exercées, le téléphone physique, l’import système de certificats et le pare-feu restent des qualifications distinctes. Décrivez précisément versions, données et limites de chaque preuve.
