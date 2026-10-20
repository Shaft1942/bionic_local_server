# Méta-prompts exécutés — outils des agents et branches de conversations

Implémentation du **20 octobre 2026**, sur la branche `feat/outils-agents`, à partir du compagnon 1.7. Ces consignes restituent sous une forme réutilisable le travail du coordinateur et de trois agents : branches, audit des scripts, durcissement web et revue croisée. Elles ne contiennent ni historique personnel ni secret d’exécution.

## Coordinateur — permissions, outils et intégration

```text
Dans une nouvelle branche du compagnon Bionic, ajoute aux outils du modèle :
recherche et lecture web publiques, recherche de fichiers et manipulation
complète dans le projet, scripts Python/Node/PowerShell avec validation
humaine du code exact. Ajoute aussi les branches de conversations demandées.
Préserve le menu compact, les brouillons, les chats parallèles, les files,
les livrables et les reçus de contexte existants.

Les outils appartiennent au compagnon, pas à l’agent natif ni aux MCP Bionic.
Sépare les droits de fichiers, de web et de scripts. Internet et scripts sont
désactivés par défaut. Fige leurs valeurs au moment où chaque message est
accepté et persiste-les avec la file ; une nouvelle case cochée ne modifie
pas un tour déjà reçu. Le serveur vérifie les droits à chaque appel d’outil.

Conserve le dossier de travail du projet pour les outils directs de fichiers.
Ajoute recherche ciblée, inspection, création de dossiers, copie/déplacement
sans écrasement et corbeille récupérable. La version inspectée doit rester
actuelle ; un changement concurrent n’autorise pas à perdre les données.
Les suppressions de dossiers et la suppression permanente ne font pas partie
de ces outils. Les recherches restent bornées et ne préchargent pas le projet.

Pour chaque script, montre l’interpréteur, le dossier et le code précis.
Attends une validation unique authentifiée du projet et du chat concernés,
enregistrée avant reprise. Un refus, une expiration, une annulation ou une
erreur d’enregistrement ne doit jamais autoriser l’exécution. L’accord n’est
pas une autorisation de scripts futurs. Affiche clairement les droits du
compte du PC : le dossier de départ n’est pas un bac à sable et les effets
ne sont pas tous annulables. Borne durée, code, propositions et sorties.

La fermeture du téléphone détache le flux sans perdre la proposition. Les
statuts persistent et le polling permet la reprise. Un redémarrage expire
les anciennes attentes ; il ne rejoue aucun script. Ajoute aux reçus les
résultats externes exacts reçus et marque séparément leur transmission
confirmée après acceptation HTTP du contexte par l’API du modèle.

Répartis les modules entre agents pour éviter les éditions concurrentes.
Intègre serveur et interface sous une seule autorité d’édition. Fais des
revues croisées sur des risques concrets. Vérifie les tests isolés et les
parcours bureau/mobile avec des données fictives ; ne contacte pas un réseau
privé pour tester le SSRF. Mets à jour les guides et l’export propre. Ne
modifie pas l’installation quotidienne et ne publie rien sans instruction.
```

## Agent branches de conversations

```text
Construis un module pur de fork, avec tests synthétiques. Une branche est
un nouveau chat web du même projet, copié jusqu’au message choisi inclus,
ou jusqu’au dernier message si aucun point n’est choisi. Préserve la source.
Ne lis pas de fichier du projet, n’appelle pas le modèle et ne rejoue rien.

Rejette un point assistant en cours. Permets un point antérieur pendant la
génération source. Renouvelle les identifiants des messages et conserve les
pièces jointes enregistrées et la provenance. Les journaux et reçus restent
historiques, passifs, sans droits d’exécution, de restauration ou de pinning
de fichier. Ne copie ni demande, ni file, ni validation en attente. Web et
scripts sont désactivés. La branche ne synchronise aucun futur message avec
la source et ne copie pas les fichiers vivants du projet.

Vérifie points de coupe, rôles et identifiants malformés, source intacte,
historique incomplet, refus des réponses actives, forks répétés et retrait
des capacités. Donne au coordinateur un contrat d’API explicite, sans
éditer ses fichiers serveur. Vérifie aussi les parcours interface isolés,
la navigation et les largeurs étroites, sans données personnelles.
```

## Agent audit des validations et scripts

```text
Audite puis teste les modules de validation et d’exécution. Cherche les
contournements concrets avant de proposer des restrictions hypothétiques.
Une proposition doit rester immuable avant et après affichage ; les
observateurs ne peuvent pas remplacer le code approuvé. L’approbation est
unique, limitée au projet/chat, expire après dix minutes et doit être
persistée avant exécution. Le refus et les appels concurrents comptent dans
le budget de quatre propositions.

Valide interpréteur, dossier de départ et code ; exécute sans shell de
commande implicite. Le script explicite peut avoir les droits complets du
compte, ce qui doit être expliqué sans promesse de sandbox. Réduis les
variables héritées et ne divulgue pas de secrets serveur dans les sorties.
Vérifie l’UTF-8 PowerShell Windows, les interpréteurs absents, les délais,
la sortie excessive et l’arrêt. Le nettoyage ne doit pas suivre un dossier
temporaire détourné après exécution.

Utilise dossiers temporaires possédés et processus injectés lorsque le
runtime réel ne peut pas être exercé. Ne qualifie pas ces simulations de
validation réelle PowerShell. Signale les limites et les défauts concrets
au coordinateur, sans commit ni publication.
```

## Agent audit du web, revue croisée et documentation

```text
Durcis le module web public en conservant ses contrats injectables :
search(query, options) et read(url, options). Refuse les adresses locales,
privées et spéciales IPv4/IPv6, les DNS mixtes et les réponses malformées.
Épingle la connexion à une adresse vérifiée ; un contrôle DNS séparé ne
suffit pas contre le rebinding. Réévalue chaque redirection et ne propage
pas les secrets du moteur à sa destination. Borne toute l’opération,
résolution DNS comprise, même si une implémentation injectée ignore l’arrêt.

Accepte uniquement le texte prévu, avec limites de taille, de MIME et
d’encodage. Extrais un texte passif, sans navigation ni JavaScript et sans
regex quadratique sur le HTML malformé. Une recherche rend des URL réelles
et bornées ou une erreur explicite. DuckDuckGo peut refuser les robots :
ne promets pas un succès universel. SearXNG peut être local seulement via
configuration explicite du propriétaire ; Brave est facultatif via clé privée.

Teste avec DNS et transport injectés, sans socket vers un réseau privé.
Fais ensuite une courte revue croisée en lecture seule : permissions figées,
reprise des validations après fermeture téléphone, reçus reçu/transmis,
erreurs qui ne prétendent pas une réussite. Signale les défauts au détenteur
des fichiers, sans y appliquer de changements concurrents.

Mets à jour les guides : fonctionnement du menu, fichiers et corbeille,
approbation du code exact, droits PC sans sandbox, limites et stockage privé,
fork jusqu’au message inclus sans replay, moteurs configurables et absence
de promesse de réseau réel testé. Cite les docs primaires OWASP/IANA, Node
et SearXNG. Laisse les chiffres finaux de vérification au coordinateur.
```

## Résultats et portée

Le [guide des outils](outils-agents.md) et le [guide d’utilisation](utilisation.md) décrivent les comportements et limites livrés. La [configuration](configuration.md) explique les variables privées des moteurs et des interpréteurs. Le [bilan de vérification](verification.md) précise les tests effectivement exécutés et les intégrations restant à confirmer ; ces méta-prompts ne valent pas preuve d’accès réel aux moteurs, au téléphone ou à tous les runtimes.
