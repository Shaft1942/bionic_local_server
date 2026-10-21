# Méta-prompts exécutés : mises à jour proposées

Branche de travail : `feat/mises-a-jour-automatiques`, depuis la Release 1.8.0. Version préparée : 1.9.0. Ce document décrit les tâches déléguées ; le bilan de vérification distingue les essais synthétiques et les opérations réellement effectuées.

## Agent de vérification des versions

> Implémente un service indépendant, sans dépendance supplémentaire, qui interroge les Releases publiques de Shaft1942/bionic_local_server au démarrage du serveur puis toutes les 24 heures de fonctionnement. Injecte horloge, réseau et temporisation pour tester cette cadence sans attendre une journée. Sérialise les vérifications, borne les téléchargements et les délais, et ne bloque jamais le démarrage du chat sur une panne GitHub. Parcours les pages et trie les versions stables numériquement. Examine les métadonnées de compatibilité pour ne proposer que la plus récente compatible avec le système, Node.js et la version installée, même en sautant plusieurs versions. Refuse les brouillons, préversions, versions antérieures et métadonnées inconnues. Mémorise le refus de la version exacte sans refuser les suivantes. Aucun téléchargement de programme ni installation sans acceptation. Aucun fichier ou message personnel n'est transmis à GitHub. Ajoute des tests de cadence, pagination, incompatibilité, refus, reprise et erreurs réseau.

## Agent d'installation

> Prépare une installation consentie sur Windows, séparée du processus serveur. Contrôle l'empreinte du ZIP et sa liste de fichiers avant toute écriture dans le programme. Refuse les chemins traversants, liens, collisions et emplacements privés. Conserve conversations, authentification, configuration, fichiers de projets et fichiers inconnus. Refuse l'installation automatique dans un checkout Git. Sauvegarde les sources remplacées et journalise les opérations. Ne termine que le processus de cette instance, après accord et contrôle des travaux en cours. Redémarre avec le même Node.js et vérifie identité et version sur la boucle locale. En cas d'échec, restaure les sources précédentes et garde un diagnostic privé. Teste la préservation des données, les refus et le retour arrière dans des dossiers synthétiques isolés ; n'installe rien dans l'application personnelle de l'utilisateur. Génère un manifeste de compatibilité et d'intégrité comme pièce jointe des futures Releases.

## Agent d'interface

> Ajoute une proposition discrète, cohérente avec l'interface existante sur téléphone et ordinateur. Conserve les commandes peu fréquentes dans un panneau accessible avec fermeture visible, Échap et retour du focus. Présente version installée, version proposée et notes comme texte sans interpréter de HTML distant. Distingue installer et redémarrer, plus tard, et ignorer cette version. Fournis une vérification manuelle et la désactivation des vérifications automatiques. L'acceptation doit rappeler le redémarrage et préserver les brouillons ; les fichiers non enregistrés et les travaux en cours doivent empêcher l'installation. Les appels passent par le serveur authentifié : le téléphone ne contacte pas GitHub directement.

## Intégration et revue contradictoire

> Intègre les trois composants, puis vérifie les frontières : authentification et origine HTTP, refus sans installation, cadence par serveur et non par navigateur, absence de double installation, concurrence avec messages/imports/enregistrements, compatibilité de plusieurs versions, protection des données privées, reprise après redémarrage et échec d'installation. Fais relire indépendamment les composants auxquels l'agent n'a pas contribué. Teste les parcours d'acceptation/refus et les vues 320/1280 sur données synthétiques. Mets à jour documentation, manifeste de distribution, workflow de publication et bilan. N'annonce pas une mise à jour réelle ou une compatibilité universelle à partir de fixtures.

## Références techniques

- [GitHub : liste paginée des Releases publiques](https://docs.github.com/en/rest/releases/releases#list-releases).
- [GitHub : pièces jointes de Release et empreinte SHA-256](https://docs.github.com/en/rest/releases/assets#get-a-release-asset).
- Le numéro de version et le manifeste de compatibilité priment sur la date de publication ; une Release sans métadonnées compatibles n'est pas installée automatiquement.
