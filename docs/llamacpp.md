# Qualification de llama.cpp comme premier moteur alternatif

Décision utilisateur du 24 octobre 2026. Statut : premier connecteur testé sur fixtures et premier essai réel texte/outils réussi avec Gemma QAT 12B en CPU.

## Premier essai réel — 24 octobre 2026

- Binaire installé : `b11840-36e36e63a`, Windows x86_64 ; GGUF existant `gemma-4-12B-it-QAT-Q4_0.gguf` (6 975 879 008 octets), sans copie ni conversion.
- Serveur de test séparé du serveur llama.cpp déjà ouvert : CPU deux threads, zéro couche GPU, offload des opérations désactivé, contexte 1024, un slot, projecteur désactivé, budget de raisonnement 0.
- Modules du connecteur utilisés : catalogue et contexte chargés, transport Chat Completions en streaming, reconstruction des appels d'outils.
- Texte : réponse exacte `Paris` à une question courte en français. Outil synthétique : appel structuré `report_test_result({"answer":4})`, retour injecté sans effet de bord, puis réponse finale en français. Aucun accès web ou fichier exécuté par cet outil.
- Mesures serveur sur ces trois requêtes courtes : génération de 3,48 à 3,82 tokens/s et chargement/joignabilité en environ 7 secondes. Ce sont des mesures CPU à deux threads, pas un benchmark GPU ou une mesure de qualité générale.
- La RAM disponible a été surveillée ; le minimum échantillonné était d'environ 2,38 Gio. Le serveur possédé a été arrêté après l'essai ; le serveur préexistant a conservé son alias avant/après. Aucun appel de gestion vers Bionic ou ComfyUI et aucune modification de leurs configurations.

Limites : cet essai qualifie cette combinaison pour des échanges courts et un outil synthétique. Il ne qualifie pas le GPU, les longs contextes, la vision, les autres modèles, la cohabitation avec un rendu Krea2 ni le parcours complet dans l'interface du compagnon. Le serveur a signalé des corrections de types de tokens du GGUF au chargement ; les trois échanges testés ont néanmoins abouti.

## Utiliser ce premier connecteur

Ce lot prend en charge un **llama-server direct, un modèle texte**, démarré explicitement. Le serveur doit exposer `/v1/models` et `/props` avec `default_generation_settings.n_ctx` (contexte d'un slot). Le maximum théorique `n_ctx_train` ne sert pas de contexte chargé. Le routeur, la vision et le réglage d'effort restent hors qualification. Les outils sont indiqués « inconnus » jusqu'à un essai avec le modèle/template retenu ; seuls les outils activés dans le compagnon sont proposés.

Installer séparément une distribution officielle de [llama.cpp](https://github.com/ggml-org/llama.cpp/releases), adaptée au système et au backend retenu. Conserver l'exécutable et ses bibliothèques ensemble. Aucun téléchargement ou installation n'est effectué par le connecteur.

Depuis un terminal PowerShell dans ce checkout, préparer le lancement avec un GGUF déjà présent (chemins fictifs à remplacer) :

```powershell
node scripts/llamacpp.mjs --server "D:\Moteurs\llama.cpp\llama-server.exe" --model "D:\Modeles\conversation.gguf"
```

Sans `--start`, la commande vérifie les fichiers et affiche le plan, sans lancer de processus. Elle lit seulement l'en-tête GGUF, ce qui ne confirme pas la compatibilité de l'architecture. Sélectionner un modèle de conversation, pas un fichier `mmproj` seul. Aucun poids n'est déplacé, copié, converti ou téléchargé.

Ajouter `--start` pour exécuter explicitement le serveur. Les valeurs initiales sont : boucle locale, port 1236, alias `companion-llama`, contexte 4096, un slot et **zéro couche GPU**. Un port occupé provoque un échec, sans arrêter son occupant. Les options `--port`, `--context`, `--gpu-layers` permettent une configuration explicite. Le script retire les variables ambiantes `LLAMA_*` du processus enfant pour éviter des options de téléchargement/chargement implicites. Aucun lancement automatique au démarrage du compagnon, aucun arrêt d'une instance externe.

Pour connecter un compagnon de test, utiliser une installation et ses ports distincts des instances actives. Dans la configuration privée de cette seule installation :

```json
{
  "port": 8876,
  "certificateProofPort": 8877,
  "inferenceProvider": "llamacpp",
  "llamaUrl": "http://127.0.0.1:1236",
  "comfyEnabled": false
}
```

Ces valeurs servent à la configuration initiale. Depuis la **2.6.0-beta.2**, **Paramètres → Conversation** permet de sélectionner et tester Bionic ou llama-server, puis d'appliquer une connexion unique au repos, sans redémarrage du compagnon. Les choix web persistent et priment sur les valeurs initiales au démarrage suivant. Les adresses et jetons de chaque moteur restent séparés ; le jeton Bionic n'est jamais envoyé à llama.cpp. `apiUrl` et les profils de lancement Bionic gardent leur sens Bionic. Voir [les paramètres de llama-ui](llama-ui-prototype.md).

Les équivalents d'environnement restent `BIONIC_MOBILE_INFERENCE_PROVIDER=llamacpp`, `BIONIC_LLAMA_URL` et, si nécessaire, `BIONIC_LLAMA_API_TOKEN`. Le mode initial par défaut reste `bionic`. Un contrôle de connexion n'exécute aucune génération et ne charge aucun modèle. Tous les connecteurs d'inférence disposent du même outil images, fourni actuellement par ComfyUI.

Les identifiants de modèle llama.cpp sont séparés par moteur/endpoint/alias ; l'alias natif est utilisé seulement pour la requête d'inférence. Les préférences et efforts Bionic ne sont pas réutilisés par simple égalité de nom. La provenance est enregistrée sur les réponses. Une panne ne redirige jamais la requête vers Bionic.

## Mémoire et cohabitation

Ce premier connecteur **ne charge, ne décharge et n'arrête aucun modèle distant**. Il exige un modèle déjà chargé et un contexte connu avant tout envoi. Un modèle en veille ou en chargement est refusé avec un message explicite. Les fonctions de gestion du routeur demanderont une qualification distincte ; les routes de gestion Bionic ne sont jamais utilisées pour llama.cpp.

La politique images « décharger » est donc refusée avant rendu si un modèle llama.cpp est chargé. Le bouton de déchargement du catalogue est désactivé. Ne pas la remplacer par « conserver » pour contourner un manque de mémoire : la coordination du compagnon ne régule pas les autres applications. Commencer avec un essai CPU et ComfyUI désactivé dans la copie de test ; ne qualifier la cohabitation GPU qu'avec une allocation explicite et une mesure mémoire. Le lot ne prétend pas encore libérer automatiquement la VRAM avant Krea2.

Le fichier GGUF est partagé sur disque, pas l'allocation mémoire : charger les mêmes poids dans Bionic et llama.cpp peut doubler leur consommation. Les modèles image Krea2 et leurs encodeurs/VAE restent sous le contrôle de ComfyUI.

## Vérifications reproductibles

```powershell
node --test test/llamacpp.test.mjs test/llamacpp-http.test.mjs
npm run check
npm test
npm run check:export
```

Les tests automatisés utilisent des réponses HTTP, outils, poids et authentifiants synthétiques. Ils ne valident ni le GPU ni les GGUF de l'utilisateur. Le premier essai réel ci-dessus est distinct ; toute autre combinaison de version, poids, backend ou contexte reste à qualifier.

## Branche et intégration

- Branche produit : `codex/llamacpp`, dépôt `Shaft1942/bionic_local_server`.
- Base récupérée depuis GitHub : `origin/main`, commit `f8fe56877a5ae0a8dbce89f711cd7426018d93be`, également cible du tag `v2.5.0` à la création.
- Travail dans un worktree dédié ; préserver le checkout partagé et ses index.
- Intégrer régulièrement les avancées de `origin/main` par merge explicite dans cette branche. Conserver les commits déjà partagés ; ne pas réécrire leur historique.
- Produire des commits ciblés : transport/adaptateur, contrats et tests, puis branchement au produit et interface. Éviter les refontes ou reformatages sans lien avec llama.cpp.
- Réintégration prévue par PR vers la branche d'intégration retenue, `main` par défaut. Les autres évolutions peuvent fusionner dans `main` indépendamment ; aucune dépendance à une branche parallèle n'est présumée.
- Si une dépendance parallèle devient nécessaire, consigner son commit et sa provenance avant de l'intégrer ; éviter de réappliquer le même changement par copie puis cherry-pick.
- Les fichiers communs (`server.mjs`, configuration, boucle d'outils et UI) demandent coordination et résolution des conflits selon les contrats de chaque évolution. Un worktree isole les écritures, sans garantir une fusion sans conflit.
- Avant intégration : actualiser la base, relire le delta complet, exécuter les contrôles produit et `npm test` selon le guide de développement. Publier séparément les limites de qualification réelle.

## Comportement recherché

Le compagnon se connectera à une version identifiée de `llama-server` pour le texte, le streaming et les appels structurés d'outils. L'exécution des outils et les permissions resteront dans le compagnon. LM Studio et Ollama restent des cibles ultérieures.

Réutiliser les GGUF compatibles depuis leurs emplacements actuels, sans déplacement ni duplication imposée. Un format GGUF ne garantit pas la prise en charge de l'architecture, de la quantification, du template ou des fichiers complémentaires. Les autres formats nécessitent une vérification spécifique, sans conversion automatique.

Les chemins de modèles sont distincts des racines de projets accessibles aux outils. Aucun accès général aux données natives Bionic ne découle du partage des poids.

Krea2 reste servi par ComfyUI : ses composants image ne deviennent pas des modèles de conversation llama.cpp. Le compagnon permettra au modèle de conversation de préparer un prompt puis de demander une génération au service images existant.

## Première qualification

1. Identifier les dossiers autorisés et un premier GGUF existant ; figer version de llama.cpp, backend GPU, template, contexte et paramètres.
2. Vérifier catalogue, génération en streaming, annulation, erreurs et appel d'un outil synthétique avec retour au modèle.
3. Adapter le chargement/déchargement au mode serveur et à la version choisis ; préserver les instances utilisées par les autres clients.
4. Lors d'un essai réel explicitement borné, mesurer la mémoire libérée avant un rendu ComfyUI/Krea2 ; ne pas déduire ce résultat d'un succès HTTP.
5. Distinguer fonctionnement du connecteur et indépendance complète : l'autorité locale des projets et conversations fait partie du chantier multi-moteurs et doit être qualifiée séparément.

## Consignes de travail

Appliquer les consignes du socle transmises avec la mission : séparation des deux dépôts, fichiers privés exclus, fixtures synthétiques par défaut et préservation des installations actives. Le worktree ne transporte pas automatiquement les consignes ni les guides du socle ; les relire depuis leur racine avant chaque mission, ou les retransmettre explicitement si ce checkout est déplacé.

Ne pas prendre les anciennes observations du checkout partagé comme état de ce worktree. Cartographier les contrats dans cette base avant toute implémentation. Fixer les chemins possédés et coordonner les fichiers communs avant de commencer.

Documentation officielle à figer sur une révision pour l'implémentation : [llama.cpp](https://github.com/ggml-org/llama.cpp), [serveur](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [appels d'outils](https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md).
