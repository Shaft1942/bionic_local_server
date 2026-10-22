# Socle de la version 2.0

22 octobre 2026. Projet local : `E:\Projets\bionic_local_compagnon`.
Base de travail importée : sources 1.11.0 incluant la passerelle Krea2.
Ce plan organise le candidat V2 ; le numéro affiché, une publication et la mise
à jour de l'installation personnelle restent des états distincts.

## Sources et ordre des preuves

Les trois chats ont été lus avec `read_thread` :

- « Trouver une IA graphique pour Bionic », `01a164ab-e3b4-7e81-996b-015ab1c16e19` : audit et limites.
- « Trouver une IA graphique pour Bionic (2) », `01a164b8-9ba1-78f1-a01d-4955293677d4` : workflows puis intégration Krea2 et image réellement obtenue.
- « Créer un serveur local pour Bionic (2) », `01a15aed-7698-7d00-96b3-5471992458f6` : distribution et explication du plafond de sortie.

L'audit du 22 octobre se trouve dans
`E:\AI\ChatGPT\2026-10-22\quelle-ia-serait-capable-de-faire\outputs\Audit-Compagnon-Local-et-Bionic.md`.
Les sources et choix historiques se trouvent dans
`E:\AI\ChatGPT\2026-10-19\je-voudrais-3\outputs\bionic-mobile-github`.
L'intégration Krea2 est postérieure à la conclusion « aucun outil dédié » de
l'audit. Le travail V2 part donc de son code actuel, avec ses jobs persistés.

## Décisions et critères d'acceptation

| ID | Observation audit / demande | Décision pour le socle | Critère et preuve attendue |
| --- | --- | --- | --- |
| B01 | Plafond fixe 2 048 tokens, scripts coupés | Budget automatique plus généreux, ajusté à la place estimée | Tests petits/grands contextes et appels outils ; reçu avec valeur demandée/effective et source |
| B02 | Valeur manuelle souhaitée par modèle | Override isolé par identifiant de modèle | A ne modifie pas B ; une réduction temporaire de contexte ne remplace pas le souhait |
| B03 | Coche chaque session / cette session | Persistance serveur volontaire par modèle ; conversation courante sans coche | Réouverture, changement de modèle et nouveau chat vérifiés ; pas de persistance globale implicite |
| B04 | Fin de tour ne prouve pas réponse complète | `length` affiché comme réponse limitée ; appel tronqué non exécuté | Stream simulé avec `finish_reason=length`, état et avertissement vérifiés |
| C01 | ComfyUI doit être optionnel | Activation et paramètres accessibles dans l'UI | Désactivé : pas d'outil offert ni POST ; test de connexion sans génération |
| C02 | Installation personnelle local/LAN | URL ComfyUI configurable, adressage contrôlé côté serveur | Sondes GET des endpoints réellement accessibles ; entrée invalide refusée |
| C03 | Workflows déjà définis | Krea2 et HassakuXL disponibles ; chaîne mixte connue mais reportée | Précontrôle des graphes/nœuds ; aucune validation GPU déduite du précontrôle |
| C04 | Script limité à 120 s | Jobs asynchrones persistés indépendants du chat | Soumission, suivi, erreur, reprise prompt_id et ambiguïté sans re-POST vérifiés |
| C05 | Image non affichée automatiquement dans audit | Conserver image attachée, route authentifiée et téléchargement | Octets d'image fixture, portée/authentification ; essai visuel identifié séparément |
| A01 | Résultats d'outils absents au tour suivant | Mémoire bornée de reçus transmis et sources historiques | Liste blanche, borne stricte, sources, aucune approbation/permission/code/sortie brute |
| A02 | Capacités Desktop non héritées | Vue claire des capacités présentes et limites du compagnon | Statut réel des outils, limites et absence d'héritage MCP/skills/sous-agents |
| A03 | Historique sélectionné limité | Garder la sélection bornée et rendre son omission explicite | Reçu : historique retenu/omis, mémoire d'outils et budget sans compte exact inventé |
| U01 | Paramètres utilisables sur téléphone | Panneau refermable directement, Échap, retour focus | Parcours UI aux largeurs étroite et bureau, brouillon conservé |
| U02 | Demande ultérieure : arbre de projets repliables dans la barre latérale | Projets et conversations regroupés, état repliable sans perdre le chat actif | Clavier, Sans projet, actualisation, sélection et brouillon conservés ; contrôle après intégration |
| R01 | Conservation des chats et données | Compatibilité des anciens fichiers, pas de migration destructive | Suite des contrats, fixtures anciennes, sources publiques seules dans archive |

## Lots et responsabilités

1. Chef de projet : décisions, métaprompts, matrice et contrôle du périmètre.
2. Agent budget : module et préférences des modèles, intégration serveur du budget.
3. Agent ComfyUI : configuration, service, graphes et vérifications des nœuds.
4. Coordinateur intégrateur : paramètres UI/routes, capacités et tests d'ensemble.

Les fichiers partagés ont un auteur à la fois. Les jobs ComfyUI existants, la file
de messages, les validations et les historiques natifs conservent leurs contrats.
Le chef de projet livre séparément `lib/tool-memory.mjs` et son test, à intégrer
par l'auteur de `server.mjs`.

## Fonctionnalités reportées

| Piste | Motif et condition pour la reprendre |
| --- | --- |
| Hériter des MCP Desktop | L'API native existe, mais le MCP dynamique localhost a été refusé en audit ; vérifier une intégration préconfigurée et un contrat distinct avant promesse |
| Catalogue et orchestration de skills runtime | Lire un fichier de skill n'implémente pas sa sélection ni son orchestration ; spécifier autorisations et cycle de vie |
| Sous-agents appelables par le modèle | Les agents utilisés pour ce chantier ne sont pas une fonction runtime ; stockage, délégation, budgets et arrêt demandent un lot dédié |
| Navigateur interactif avec comptes/cookies | Nouveau périmètre et nouveau moteur ; le lecteur web reste public et passif |
| Augmenter toutes les limites de fichiers/web/scripts | Budgets indépendants avec protections déjà définies ; les rendre tous réglables ne découle pas du seul besoin de réponses longues |
| Synchronisation native bidirectionnelle Bionic | Aucun contrat vérifié pour écrire dans les sessions natives ; conserver leur lecture seule |
| Chaîne Hassaku → Krea2 | Workflows déjà préparés, mais qualité et fidélité de cette chaîne non validées sur GPU ; proposer les deux workflows séparés et expliquer ce report dans Paramètres |

## Conditions de clôture

Les critères livrés doivent avoir une preuve dans [Validation V2](v2-validation.md).
Un contrôle de syntaxe, les tests de modules/routes, le contrôle d'export et la
construction de l'archive vérifient le candidat local. La CI distante, un rendu GPU
sur chaque workflow et un téléphone physique doivent être marqués séparément s'ils
n'ont pas été exécutés. Une connexion HTTP seule n'est pas un rendu validé.
