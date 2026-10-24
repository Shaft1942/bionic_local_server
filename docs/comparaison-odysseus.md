# Comparaison avec Odysseus et conséquences pour le compagnon

Étude du 22 octobre 2026, réalisée par trois agents en lecture parallèle : produit/usages, moteurs/images et migration/exploitation. Intégration et vérification des conclusions dans le [plan d'évolution](plan-independance-multi-moteurs.md).

Mise à jour de référence : les prochaines itérations partent de la **main publiée 2.0.0**, commit `f47adbf44c863438aa2289bf676e7ac1f1ab054a`, et non du dossier local 2.1.3 de la première étude. Le [recalage publié](reference-main-publiee.md) confirme que les fonctions images comparées ci-dessous sont présentes sur main et identifie les correctifs supplémentaires à préserver. La priorité utilisateur est désormais une livraison images multi-moteurs, références et LoRA, compatible avec le plan d'indépendance général ; voir l'[étude images et sa roadmap D1](exploration-moteurs-images-locaux.md).

## Conclusion proposée

Poursuivre l'indépendance du compagnon et reprendre les principes utiles d'Odysseus : connexions identifiées, capacités explicites, outils adaptés au contexte, services indépendants et données portables. Préparer ensuite une comparaison de modèles et un accès ComfyUI sans dépendre d'un appel d'outil du LLM.

Le remplacement du compagnon par Odysseus n'est pas justifié par cette étude seule. Odysseus propose un espace plus vaste ; la conservation de nos workflows, données et parcours Windows/téléphone demanderait une qualification spécifique. Une cohabitation reste envisageable pour ses fonctions complémentaires, avec données et autorisations séparées.

Cette conclusion est une recommandation de conception fondée sur documents et sources. Elle ne constitue pas un benchmark d'usage, de vitesse, de stabilité ou de sécurité des deux applications.

## 1. Périmètre et niveau de preuve

Le site fourni, [odysseusai.dev](https://odysseusai.dev/), indique être un guide indépendant non affilié. Il a servi de point d'entrée. Les faits techniques ci-dessous sont recoupés avec le [dépôt officiel](https://github.com/odysseus-dev/odysseus) et son [site officiel](https://odysseus-dev.github.io/odysseus/).

Révision de référence Odysseus : branche `dev`, commit **`01566b158e627748f70ac402571f2f78241fb6f9`**. Les liens de fichiers de cette étude sont fixés à cette révision. Une description de `dev` n'est pas une garantie concernant `main`, une autre image ou une future installation.

Base de la première comparaison : sources locales déclarant **2.1.3**, plan d'indépendance existant, services et documentation courants. Base de reprise désormais vérifiée : **main publiée 2.0.0**, au commit ci-dessus. Les validations antérieures ne sont pas présentées comme des essais refaits pendant cette étude.

Niveaux employés : **annoncé** sur le site ; **documenté** dans les guides ; **code lu** pour les contrats effectivement examinés. Aucun Odysseus n'a été installé ou exécuté, aucun modèle appelé et aucun rendu lancé. La revue n'est pas exhaustive de toutes les branches et intégrations.

## 2. Comparaison fonctionnelle

| Domaine | Odysseus : observation et preuve | Compagnon actuel | Décision proposée |
| --- | --- | --- | --- |
| Espace de travail | Chat, agents, documents et fonctions personnelles présentés dans le produit. Annoncé/documenté. [O1], [O2] | Chats propres, projets et fichiers ; catalogue encore dépendant de Bionic. | Conserver le noyau autonome et le registre local prévus dans L1. |
| Moteurs | Plusieurs endpoints locaux/API ; paramètres et particularités d'Ollama documentés. [O3] | Un serveur de texte, catalogue et gestion Bionic/LM Studio. | Connexions stables, adaptateurs et réglages par connexion/modèle. |
| Capacités | Schéma canonique et lecteurs spécialisés existent, mais leur propre spécification les déclare non raccordés aux sélecteurs et au runtime général. Code/doc lus. [O4] | Capacités normalisées depuis le catalogue Bionic ; inconnues parfois traitées comme utilisables. | Relier réellement les capacités à la requête, aux outils et à l'UI ; qualifier leur provenance et leur fraîcheur. |
| Outils/agents | Contrat de tour distinguant outils requis, offerts et exécutables. L'aptitude du modèle reste distincte. [O5] | Outils fichiers/web/scripts/images et validations propres au compagnon. | Garder la boucle et les autorisations du compagnon ; proposer un ensemble d'outils réduit et figé au message. |
| Images et ComfyUI | La fonction image examinée appelle une API `/images/generations`, ou `/images` chez OpenRouter. ComfyUI apparaît aussi dans un inventaire de processus. Un connecteur de workflows ComfyUI n'est pas établi par les sources examinées. [O6], [O7] | Workflows Krea2/Hassaku, deux LoRA, validation des nœuds, jobs persistés, suivi `prompt_id`, copies d'images. Code local lu. | Préserver notre service ComfyUI spécialisé et ses reprises ; ne pas le remplacer par une API image générique. |
| Comparaison | Route A/B, identité masquée jusqu'au vote, deux endpoints identifiés. Code lu. [O8] | Choix d'un modèle à la fois ; chats parallèles possibles. | Ajouter un mode de comparaison borné après stabilisation des connecteurs. |
| Recherche | Recherche approfondie et jobs durables documentés ; la note technique distingue implémentation et validation réelle complète restant à consigner. [O9] | Recherche/lecture web avec permissions, approbation exacte facultative et reçus. | Réutiliser ce socle pour une extension de recherche bornée, après la migration. |
| Mémoire | Mémoire persistante, routes et provenance ; dépendances de mémoire vectorielle documentées. [O3], [O10] | Mémoire courte des reçus et contexte du chat ; aucune mémoire globale automatique annoncée. | Commencer par des notes explicites par projet, avec inclusion choisie ; indexation/RAG facultatifs ensuite. |
| Documents | Documents versionnés, propriété indépendante d'une session dans le code examiné. [O11] | Édition de textes du projet, imports et copies de livrables. | Étendre les livrables vers un éditeur avec propositions et versions si l'usage le justifie. |
| Téléphone | Pont d'appairage, identité serveur et modèles du propriétaire, sans clés API. Code/doc lus. [O12] | Interface navigateur, code partagé et révocation globale ; brouillons volontaires. | Conserver les parcours actuels ; étudier l'appairage et la révocation par appareil séparément. |
| Installation | Windows natif Python 3.11+, Docker possible ; shell/Cookbook avec Bash ; certains serveurs locaux demandent WSL/Linux. Documenté. [O3] | Node 24+, serveur sans installation npm ; Python facultatif, lanceurs Windows. | Maintenir ce déploiement et les moteurs déjà installés ; aucun remplacement de stack nécessaire. |
| Sauvegarde | Guide et outil de snapshot/vérification/restauration présents ; ChromaDB Docker est un volume distinct. Documenté. [O13] | Sauvegarde/mise à jour et données privées existantes ; migration de schéma à prévoir. | Séparer sauvegarde de restauration complète et export portable sans secrets. |
| Permissions | Rôles et contrôles, mais limites explicites de confinement du shell/fichiers et des jetons mobiles. [O14] | Profils de fichiers directs ; scripts approuvés avec droits du compte, hors seul projet. | Comparer les contrôles précis ; ne qualifier aucune application de globalement sandboxée. |
| Maintenance | Roadmap demandant encore audits d'intégrations, sondes, réduction du contexte agent et qualification d'installation. [O15] | Périmètre plus réduit, tests existants ; nouvelle compatibilité à démontrer. | Privilégier une matrice de preuves et des fonctions utilisables en état dégradé. |

Les cases « code lu » attestent l'existence du mécanisme examiné, pas la réussite d'un parcours réel avec un modèle donné.

## 3. Ce qui change concrètement dans le plan

### À intégrer aux lots L0–L6

**Capacités utilisables de bout en bout.** Garder pour chaque assertion sa valeur, sa source, sa portée connexion/modèle/instance, la version connue et la date. Distinguer assertion fournisseur et essai observé. Une panne ne démontre pas une absence de support. Un réglage manuel est possible, visible et réversible ; il n'accorde aucun droit. En cas de contradiction, conserver les éléments plutôt qu'écraser silencieusement une preuve.

Le test doit vérifier que la valeur retenue par l'UI est celle appliquée aux paramètres et outils envoyés. Un type ou une spécification de capacité sans consommateur runtime ne satisfait pas ce critère. La spécification Odysseus indique elle-même que fusion, expiration et intégration générale restent des travaux ultérieurs à sa révision de référence. [O4]

**Contexte et outils proportionnés.** Le reçu distingue instructions, historique, documents/images, schémas d'outils et réserve de réponse, avec estimations annoncées. Le serveur n'offre que les outils autorisés et utiles au mode choisi ; conserver les limites actuelles d'actions. Évaluer un petit contexte et un contexte ample. La roadmap Odysseus identifie l'excès de contexte agent sur petits modèles comme chantier ; cela confirme l'intérêt de ce contrôle. [O15]

Le comportement textuel de secours documenté pour certains endpoints Ollama dans Odysseus n'est pas repris implicitement. Une réponse contenant du code ou une pseudo-commande n'est pas un appel d'outil autorisé dans le compagnon. Un moteur sans appels structurés qualifiés peut rester utilisable pour discuter et pour préparer un prompt d'image manuel. [O3]

**Diagnostic par service.** Connexion texte, source Bionic, ComfyUI, extraction de documents et recherche exposent leurs états séparément. Présenter l'étape en échec, une erreur expurgée, la dernière vérification et une action utile. L'absence de modèle au premier démarrage n'empêche pas de créer un projet ou consulter ses données. Un test de connexion reste distinct d'un essai de génération.

**Portabilité et sauvegarde.** Définir un export versionné avec messages, provenance, pièces jointes récupérables, livrables, paramètres non secrets et empreintes. Décrire les omissions, les références de moteurs non résolues et les limites d'import. Ne pas exporter les accords actifs, sessions, jetons ou droits d'accès à des chemins comme des autorisations réutilisables. L'import présente un aperçu et demande de réadopter les dossiers et connexions.

La sauvegarde privée, elle, doit restaurer les paramètres d'authentification et tous les magasins utilisés, avec un inventaire vérifiable. Le guide Odysseus montre pourquoi un simple archivage du dossier principal peut omettre un magasin externe en Docker. Il fournit bien un outil de sauvegarde : une ancienne ligne de roadmap sur ce sujet ne permet pas d'en conclure l'absence. [O13], [O15]

### Prochaines extensions après l'indépendance

| Extension | Première version raisonnable | Critère de sortie |
| --- | --- | --- |
| Comparaison de modèles | Deux connexions/modèles, même question et contexte commun compatible, options effectives visibles, texte seul | Résultats et erreurs séparés, annulation indépendante, ordre aveugle possible, identité révélée après évaluation ; pas d'outil à effet de bord ni recherche rejouée. |
| Génération ComfyUI directe | Formulaire utilisant les profils et le service actuels, sans LLM | Même choix instance/workflow/LoRA, mêmes validations, persistance et suivi ; fonctionne sans moteur de conversation connecté. |
| Notes de projet | Notes éditées par l'utilisateur, sources et inclusion volontaire dans un message | Isolation entre projets, aperçu exact du contexte ajouté, suppression et export ; aucune écriture automatique du modèle dans une mémoire globale. |

Une comparaison de réponses n'est pas un benchmark de moteurs : documenter prompt, historique, modèle exact, contexte, quantification connue, cache, paramètres et concurrence. Mesurer réussite de la tâche et exactitude des outils, puis latence et tokens/s lorsque disponibles. Le même GPU peut imposer une exécution séquentielle ; ne pas promettre le simultané par défaut.

### Extensions optionnelles à spécifier séparément

- Éditeur de livrables avec versions, propositions de modifications et comparaison avant enregistrement ; conserver les contrôles d'empreinte et conflits existants.
- Recherche approfondie par job : budget de temps/pages, URL et sources conservées, état partiel explicite, reprise sans doublon ; les permissions web restent applicables à chaque envoi prévu.
- Appairage par appareil, jeton révocable et portée limitée ; un jeton de chat n'autorise pas l'administration ou l'exécution de scripts.
- MCP préconfigurés et skills versionnés uniquement après définition de leur cycle de vie, schémas, permissions et budget de contexte. Notes, résultats web et fichiers de skills restent des données non fiables ; pas de privilège obtenu depuis leur texte.

Mail/calendrier, gestion Docker/SSH des modèles, mémoire globale automatique, téléchargement de plugins exécutables et skills auto-modifiants ne sont pas ajoutés à la migration d'indépendance.

## 4. Continuer, cohabiter ou remplacer

| Voie | Usage pertinent | Preuve nécessaire avant de la retenir |
| --- | --- | --- |
| Continuer le compagnon — recommandation actuelle | Préserver ses projets/outils et la chaîne Windows/téléphone/ComfyUI tout en ouvrant les moteurs | Clôture des lots L0–L6 et matrice des capacités réelles. |
| Cohabiter avec Odysseus | Tester une fonction complémentaire telle que comparaison ou recherche | Installation isolée autorisée, ports/données/auth séparés, budgets GPU et quelques tâches communes ; aucun partage direct des bases. |
| Remplacer le compagnon | Choisir un espace plus vaste comme application principale | Prouver les parcours utiles, conversion des données, workflows/LoRA/jobs, droits, récupération et usage téléphone ; documenter les écarts acceptés. |
| Forker Odysseus | Personnalisation durable justifiant l'entretien d'un autre code et des changements amont | Étude dédiée de maintenance, tests, reprise des personnalisations et licence ; aucune décision implicite dans cette comparaison. |

Une cohabitation peut réutiliser les mêmes serveurs d'inférence, mais les limites de concurrence du compagnon ne contrôlent pas les demandes d'Odysseus. Il faut qualifier la cohabitation mémoire avant d'activer des automatismes ou de multiplier les rendus.

Le compagnon porte une licence MIT ; Odysseus déclare AGPL-3.0-or-later dans les sources consultées. La recommandation présente est une conception indépendante, sans copie de code. Un éventuel fork ou emprunt de code ferait l'objet d'un choix explicite et d'une vérification de licence. [O16]

## 5. Grille d'évaluation d'un éventuel pilote

Aucun pilote n'a été installé par cette étude. Si la comparaison doit devenir expérimentale, employer une copie de données et une liste courte de tâches :

1. Ajouter deux serveurs portant un même nom de modèle, puis continuer un chat sur l'autre connexion.
2. Faire lire un fichier de projet et vérifier qu'aucun autre dossier n'est accessible par l'outil direct.
3. Préparer une modification ou un script ; vérifier les permissions, le code présenté et l'absence de réexécution après arrêt.
4. Rendu Krea2 et Hassaku avec leurs LoRA exacts, puis reprise d'un job connu et lecture d'une image après désactivation du serveur.
5. Déconnexion du navigateur, panne d'un service et petit contexte : vérifier conservation du travail, limites annoncées et indépendance des autres fonctions.
6. Export, sauvegarde et restauration sur copie : comparer messages, provenance, pièces jointes et livrables ; documenter les éléments non convertibles.
7. Même parcours sur téléphone physique et installation Windows cible, avec temps de mise en place et dépendances réellement nécessaires.

Le compte rendu doit séparer fonction documentée, essai simulé, essai réel, tâche réussie et limite observée. Aucun score de popularité ou de vitesse isolé ne remplace cette grille.

## 6. Sources primaires et fichiers locaux examinés

[O1] [Site officiel Odysseus](https://odysseus-dev.github.io/odysseus/).

[O2] [README officiel à la révision étudiée](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/README.md).

[O3] [Guide d'installation et configuration](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/website/setup.md).

[O4] [Spécification de la couche canonique de capacités et limites d'intégration](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/specs/model-capability-canonical.md).

[O5] [Contrat du tour agent](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/docs/AGENT_TURN_CONTRACT.md).

[O6] [Génération d'images : `do_generate_image`](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/src/ai_interaction.py#L1158).

[O7] [Inventaire des processus et serveurs de modèles](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/src/tools/cookbook.py#L492).

[O8] [Routes de comparaison](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/routes/compare/compare_routes.py).

[O9] [Jobs d'outils en arrière-plan et limites de validation](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/docs/BACKGROUND_TOOL_JOBS.md).

[O10] [Routes de mémoire](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/routes/memory/memory_routes.py).

[O11] [Routes des documents](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/routes/document/document_routes.py).

[O12] [Pont mobile et appairage](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/companion/README.md).

[O13] [Sauvegarde et restauration](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/website/backup-restore.md).

[O14] [Modèle de menace](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/THREAT_MODEL.md).

[O15] [Roadmap et travaux restant à qualifier](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/ROADMAP.md).

[O16] [Licence Odysseus](https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/LICENSE) ; [licence locale du compagnon](../LICENSE).

Fichiers locaux relus ou examinés par les agents : `README.md`, `package.json`, `server.mjs`, `lib/config.mjs`, `lib/model-service.mjs`, `lib/comfy-images.mjs`, documentation ComfyUI et plan d'indépendance. Cette liste décrit les sources de la comparaison, pas une nouvelle validation de leur exécution.

[O1]: https://odysseus-dev.github.io/odysseus/
[O2]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/README.md
[O3]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/website/setup.md
[O4]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/specs/model-capability-canonical.md
[O5]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/docs/AGENT_TURN_CONTRACT.md
[O6]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/src/ai_interaction.py#L1158
[O7]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/src/tools/cookbook.py#L492
[O8]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/routes/compare/compare_routes.py
[O9]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/docs/BACKGROUND_TOOL_JOBS.md
[O10]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/routes/memory/memory_routes.py
[O11]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/routes/document/document_routes.py
[O12]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/companion/README.md
[O13]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/website/backup-restore.md
[O14]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/THREAT_MODEL.md
[O15]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/ROADMAP.md
[O16]: https://github.com/odysseus-dev/odysseus/blob/01566b158e627748f70ac402571f2f78241fb6f9/LICENSE
