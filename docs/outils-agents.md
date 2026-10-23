# Outils et autorisations

[Utilisation](utilisation.md) · [Configuration](configuration.md) · [Sécurité](../SECURITY.md)

Le compagnon fournit ses propres outils au modèle via l’API Bionic. Il n’importe pas les agents, MCP, compétences, comptes de navigateur ou permissions d’une autre application. Le modèle doit savoir appeler les outils ; **sa réponse seule ne confirme pas une action**.

## Choisir les droits d’un message

Ouvrez **Outils** près de la saisie. Les choix sont indépendants, conservés avec le chat et figés à l’envoi, y compris pour les messages mis en attente.

| Choix | Portée | État initial d’un chat ordinaire |
| --- | --- | --- |
| **Outils fichiers : Aucun / Lecture / Modification** | Désactiver les outils directs, autoriser leur lecture ou ajouter les mutations du dossier de travail | Modification |
| **Rechercher et lire Internet** | Recherches et extraits de pages publiques depuis le PC | Activé pour les nouveaux choix |
| **Valider chaque recherche et URL avant envoi** | Accord sur les données et la destination exactes de chaque outil web | Désactivé |
| **Scripts sur le PC, avec validation** | Propositions de scripts à approuver une par une | Désactivé |
| **Générer des images avec ComfyUI** | Accès aux profils d’image configurés, avec quantité de 1 à 5 | Activé si ComfyUI est détecté et disponible |

Les droits du projet restent nécessaires. Un déplacement de chat désactive fichiers et scripts ; **Sans projet** ne permet ni ces outils ni imports. Les images ont leurs réglages distincts : [Images ComfyUI](comfyui.md).

## Fichiers du projet

Les outils directs du modèle visent le **dossier de travail du projet**, avec ses droits effectifs. Les dossiers liés et `extraRoots` peuvent être parcourus manuellement mais n’élargissent pas cette racine. Un projet local créé sans dossier ne fournit pas d’accès aux fichiers. Après adoption d’un projet Bionic, seuls les dossiers et droits confirmés restent disponibles.

| Action | Contrôle et résultat |
| --- | --- |
| Lister, chercher, lire ou inspecter | Noms, courts extraits ou empreinte ; toute la bibliothèque n’est pas envoyée au modèle |
| Créer un dossier ou un texte | Chemin relatif, destination libre |
| Modifier un texte | Version lue, passage exact et unique ; réécriture complète après lecture complète ; copie précédente conservée |
| Copier, déplacer ou renommer | Fichier inspecté, destination libre ; aucun déplacement de dossier |
| Mettre à la corbeille | Copie privée avant retrait d’un fichier ; pas de suppression définitive ni de dossier |

**Une mutation autorisée est immédiate, sans accord par fichier.** Les chemins sensibles, sorties de racine, liens et conflits de version restent refusés. Les droits d’un script approuvé sont différents et plus larges.

**Rétablir la version précédente** utilise la copie d’une édition et vérifie la version actuelle. **Restaurer le fichier**, après une mise à la corbeille, refuse une destination occupée. **Fichiers du projet → Corbeille du projet** donne aussi accès aux copies après suppression du chat source ; aucune purge automatique n’est effectuée. Un déplacement de chat n’autorise pas à restaurer ses anciennes actions dans le nouveau projet.

**Comparer la modification** affiche une comparaison passive, jusqu’à 200 000 octets par version et 2 000 lignes, si le fichier actuel correspond encore à l’action. Ce n’est ni une fusion ni un enregistrement. Après interruption, une **Opération à vérifier** et ses copies candidates ne prouvent pas le succès : contrôlez le fichier actuel. Aucun rejeu automatique n’est effectué.

Les lectures directes sont limitées à **six fichiers par demande**, **3 000 caractères par extrait** et un budget total dépendant du modèle, plafonné à **12 000 caractères**. Une recherche inspecte au plus 300 fichiers/80 dossiers et 200 000 caractères, pour 20 correspondances ; elle signale les résultats partiels. Les extraits d’outils ne sont pas automatiquement réinjectés au tour suivant.

Inspection, copie, déplacement et corbeille acceptent des fichiers jusqu’à 20 Mo. L’édition manuelle est limitée à 1 Mo et une écriture du modèle à 300 000 caractères. Les PDF, DOCX et XLSX ne sont pas édités dans leur format d’origine.

## Internet public

Le PC effectue les recherches et lectures. Le téléphone ne fournit ni cookies ni comptes de sites au modèle. Les contenus obtenus sont des données non fiables et n’accordent aucun droit de fichier ou de script.

Le moteur suit la priorité **SearXNG configuré → Brave avec clé → DuckDuckGo Lite**. Un secours Brave peut être choisi explicitement ; il exige un nouvel accord lorsque la validation web est active. CAPTCHA, refus, délai ou résultat inexploitable restent des erreurs. Voir [Configuration des moteurs](configuration.md#moteur-de-recherche-des-agents).

| Limite | Valeur |
| --- | --- |
| Recherche | 500 caractères ; cinq résultats maximum |
| URL | HTTP(S) public, ports 80/443, sans identifiant, 3 000 caractères maximum |
| Lecture | 1 500 000 octets ; texte HTML, brut, XML ou JSON |
| Extrait | 4 000 caractères par défaut, 6 000 maximum |
| Redirections | Trois maximum en mode rapide ; aucune en mode avec accord |
| Durée | Quinze secondes pour l’opération complète |
| Budget du tour | Huit appels web et 18 000 caractères de résultats sérialisés |

Le lecteur n’exécute ni JavaScript ni sous-ressources et ne télécharge pas de binaire. Les pages dynamiques et comptes connectés peuvent rester indisponibles. Adresses privées/spéciales, résolutions mixtes publiques/privées et redirections non autorisées sont refusées. Seul l’endpoint SearXNG expressément configuré peut être local ; cette exception ne s’étend pas aux pages lues.

**Valider chaque recherche et URL avant envoi** affiche la requête et sa destination exactes avant transmission. Refus, expiration ou annulation n’envoient rien par cet outil ; un texte ou une URL différents exigent un autre accord. Les actions réussies conservent un relevé **Données envoyées au web**. Les recherches peuvent révéler leur contenu au fournisseur : n’y placez pas de secret. Cet accord ne filtre pas tous les secrets et ne limite pas le réseau d’un script approuvé.

## Scripts validés sur le PC

Chaque proposition montre le code exact, l’interpréteur et le dossier de départ. **Exécuter ce script** autorise cette proposition uniquement ; **Refuser** ne l’exécute pas. Le modèle ne peut ni remplacer le code après accord ni réutiliser une décision traitée.

**Le script dispose des droits du compte du PC. Son dossier de départ n’est pas un bac à sable.** Il peut agir ailleurs, appeler le réseau et modifier des fichiers sans sauvegarde automatique. Les profils Lecture/Aucun et l’interdiction du web ne limitent pas ces capacités après votre accord. Un arrêt ou une erreur n’annule pas les effets déjà produits.

| Limite | Valeur |
| --- | --- |
| Interpréteurs | Python, Node.js, PowerShell, disponibles sur le PC |
| Code | 20 000 caractères maximum |
| Propositions | Quatre par demande, refus compris |
| Accord | Dix minutes, une décision, projet et chat concernés |
| Durée demandée | Trente secondes par défaut, 120 maximum |
| Sorties capturées | 24 000 octets stdout/stderr au total |
| Sorties envoyées au modèle | 4 000 caractères stdout et 2 000 stderr maximum, troncature indiquée |

Python utilise `python` ou `BIONIC_MOBILE_PYTHON`, Node.js l’interpréteur du serveur, et PowerShell Windows PowerShell ou `pwsh` selon le système. Un interpréteur absent produit une erreur explicite.

Fermer le navigateur laisse la proposition attendre son expiration ou le script déjà accepté continuer. Après redémarrage du serveur, les attentes expirent et les exécutions abandonnées sont signalées, sans rejeu. Contrôlez les fichiers avant une nouvelle exécution. Les descendants détachés ne sont pas garantis arrêtés par le contrôle du processus.

Code, décisions et sorties sont conservés dans les conversations privées. Les fichiers temporaires de `data/tool-runs/` sont normalement retirés en fin d’exécution. L’environnement transmis est réduit, sans transmettre directement les jetons Bionic/Brave ; cela ne protège pas les secrets accessibles sur disque au compte du PC.

## Branches de conversations

Une branche copie les messages jusqu’au point choisi inclus dans un nouveau chat web du même projet, sans appel modèle ni modification du fil source. Brouillons et messages en attente ne sont pas copiés. Une réponse en cours ne peut pas être le dernier point de la copie.

Les anciens journaux, reçus et décisions sont un **historique passif** : aucun droit d’exécution, d’accord ou de restauration n’est transmis. Le web et les scripts repartent désactivés. Le profil de fichiers d’une source web est repris ; depuis un historique natif, il est Aucun. Vérifiez ces choix avant l’envoi.

Les historiques sont indépendants mais **les fichiers du projet sont partagés**. Une branche n’est ni une copie de dossier ni un environnement isolé. **Voir la conversation source** retrouve l’origine lorsqu’elle est disponible ; sa disparition ne supprime pas la branche.

## Contexte et vérification

Le journal indique les actions et leurs résultats. **Contexte utilisé** décrit les éléments reçus et leur transmission au modèle, sans garantir sa compréhension. Les aperçus web/scripts partagent une limite de 12 000 caractères et peuvent être tronqués. Un reçu copié dans une branche ne décrit pas une nouvelle exécution.

Vérifiez les effets dans le journal et les fichiers ; les performances et la capacité à appeler les outils dépendent du modèle. Conservez des sauvegardes indépendantes et utilisez des fichiers de test pour les documents ou scripts non fiables.
