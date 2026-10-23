# Version 2.5.0-beta.1

Assemblage local préparé le 23 octobre 2026 à partir de `2.4.0-beta.3` (`3576e9a`) et `2.4.1-beta.2` (`2f42791`), sur leur base stable commune `f3158fc`. Ce document ne constate pas une publication ou une installation personnelle.

## Fonctions réunies

La version conserve les interactions, projets locaux, adoption explicite des droits, pagination, fiabilité du stockage et du transport, guide certificats, interface FR/EN et version discrète dans les paramètres de la [2.4](beta-2.4.md).

Elle ajoute le curseur de 1 à 5 images, les préférences par conversation et brouillon, la file commune de douze images, les modes Conserver/Décharger/Répondre entre les images, l’annulation locale individuelle, la relance à graine identique ou différente, la galerie et les ZIP de la 2.4.1. **Livrables → Génération** rassemble les images réussies du projet, y compris celles d’une conversation supprimée. Les nouveaux contrôles et la galerie suivent la langue de l’interface ; les prompts, images et données utilisateur restent inchangés.

## Coordination

L’ordonnanceur GPU gère les lots et les réponses entre images ; le coordinateur de ressources conserve les compteurs, limites texte et réservations pendant les phases de calcul. Les acquisitions suivent l’ordre ordonnanceur, coordinateur, admission d’inférence pour éviter une attente circulaire.

- **Conserver**, valeur initiale héritée de la 2.4.1 : une autre conversation peut calculer pendant le rendu. Ce choix explicite autorise le parallélisme texte/image même avec le profil général `exclusive`. Une baisse de performance reste possible.
- **Répondre entre les images** : le modèle reste chargé ; le texte passe entre les rendus et attend l’image en cours.
- **Décharger** : les réponses en cours terminent leur phase, les modèles texte sont déchargés pour le lot, les nouvelles inférences attendent. Le prochain chargement a un coût.

Sans ordonnanceur injecté, le service image conserve le contrat du coordinateur général. Un job illisible reste isolé sans réécriture de ses octets. Une attente interrompue ou un résultat incertain ne provoque aucun renvoi automatique. La réservation reste détenue jusqu’à confirmation du nettoyage après erreur. L’arrêt reste borné et attend les checkpoints terminaux.

Le parcours **Générer ce prompt directement** reste une image exacte sans préparation par un modèle texte. Le curseur de quantité concerne les demandes conversationnelles avec outils.

## Contrôles et limites

La validation utilise les tests et API synthétiques du produit. Les parcours navigateur couvrent les séries de 1 à 5, politiques et brouillons, annulation/relance avec réponse perdue, galerie de 22 images, limite ZIP de 20, aperçu/focus, changement FR/EN, interactions et pagination. Les commandes sont décrites dans [Développement](developpement.md).

L’archive locale est construite depuis la liste fermée de distribution. Les résultats exacts accompagnent la livraison. Aucun nouveau benchmark de modèle/GPU, téléphone physique, import système de certificat, déploiement ou publication n’est réalisé par cet assemblage. Les mesures des branches d’origine ne qualifient pas automatiquement cette nouvelle version.
