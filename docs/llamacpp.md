# Qualification de llama.cpp comme premier moteur alternatif

Décision utilisateur du 24 octobre 2026. Statut : cadrage, connecteur non implémenté et aucun essai réel effectué.

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
