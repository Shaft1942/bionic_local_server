# Sécurité et données privées

## Périmètre prévu

Bionic Mobile est un compagnon personnel pour un **réseau local de confiance**. Il utilise HTTP : le code, les messages et les fichiers ne bénéficient pas d’un chiffrement de transport entre le téléphone et le PC. Une personne ayant accès au réseau ou au code peut présenter un risque pour ces données.

N’exposez pas directement le serveur sur Internet, n’ajoutez pas de redirection NAT et n’utilisez pas un Wi-Fi public ou invité non maîtrisé. Cette application ne fournit ni isolation entre utilisateurs, ni rôles, ni comptes séparés. Toute personne qui dispose du code accède au même périmètre du compagnon, avec les possibilités de lecture et d’écriture correspondantes.

Le navigateur contacte le compagnon ; le compagnon appelle l’API Bionic en boucle locale. L’API Bionic n’a pas besoin d’être exposée au réseau. Le serveur rejette les adresses d’API distantes dans sa configuration normale. L’option web distincte permet des connexions sortantes du PC vers le moteur de recherche et les pages publiques demandées. Les recherches et URL sont donc communiquées aux services concernés ; ne les utilisez pas pour transmettre des secrets.

## Protections présentes et limites

- Un code aléatoire propre à l’installation, dont une empreinte est enregistrée pour la vérification ; le code lisible reste dans `ACCES-PRIVE.txt`.
- Des sessions temporaires en cookie `HttpOnly` et `SameSite=Strict`, ainsi que des contrôles d’hôte, d’origine et de provenance réseau.
- Des limites sur les requêtes, les imports, les lectures et les étapes d’outils.
- Des chemins de fichiers contrôlés, des catégories sensibles masquées et le refus de liens de fichiers ou de sorties du dossier autorisé.
- Des sauvegardes avant remplacement et une vérification de version avant l’écriture, pour limiter les écrasements en cas de changement concurrent.
- La consultation des historiques natifs sans écriture ni migration de leurs bases.
- Pour les outils web : adresses publiques contrôlées, résolution DNS vérifiée et connexion fixée à l’adresse contrôlée, redirections revérifiées, taille et durée bornées, extraction passive sans JavaScript. Seul un endpoint SearXNG explicitement configuré peut viser un moteur local ; cette confiance ne s’étend pas aux URL de pages choisies par le modèle.
- Pour les scripts : options désactivées par défaut, accord humain lié au code exact, au projet et au chat, sans réutilisation après décision ou redémarrage. Les branches n’héritent d’aucune attente de validation ni d’aucun pouvoir de restauration du journal source.

Ces protections ne constituent pas un audit de sécurité exhaustif. Le logiciel, le système, Bionic, les modèles et les documents peuvent encore comporter des défauts. Le filtrage de noms de fichiers ne garantit pas qu’un document autorisé ne contient aucun secret.

L’option de modification par le modèle est cochée par défaut dans un nouveau chat. Lorsqu’elle est active, les écritures autorisées sont **immédiates**, sans approbation par fichier. Un contenu de document peut aussi tromper un modèle malgré les consignes de séparation entre données et instructions. Utilisez un projet de test pour les documents non fiables, décochez cette option quand elle n’est pas nécessaire et conservez des sauvegardes indépendantes.

L’option de scripts permet de proposer du code Python, Node.js ou PowerShell. **Chaque proposition exige un accord explicite, puis s’exécute avec les droits du compte du PC : ce n’est pas un bac à sable.** Le dossier de travail du projet ne limite pas ses accès aux fichiers ou au réseau. L’environnement transmis est réduit, mais le code approuvé peut lire les données accessibles au compte. L’expiration, les limites de durée et l’arrêt de processus ne garantissent ni l’annulation des modifications ni l’arrêt de descendants détachés. Le code et ses sorties sont conservés dans les conversations privées. Voir le [guide des outils](docs/outils-agents.md).

## Ce qui ne doit pas être publié

Ne partagez pas :

- `ACCES-PRIVE.txt`, `config.local.json`, les fichiers `.env` et les jetons d’API.
- `data/`, qui contient notamment les conversations web, l’authentification, des copies de pièces jointes et les sauvegardes de fichiers.
- `runtime/`, les journaux, les sauvegardes privées et les traces d’exécution.
- Les dossiers de données Bionic, les bases SQLite, les registres et métadonnées de projets personnels.
- Les vrais fichiers de projets, y compris `Imports telephone/`, ou des captures montrant leur contenu.

Le fichier `.gitignore` évite les ajouts accidentels habituels, mais ne retire pas un fichier déjà suivi par Git. Vérifiez les fichiers suivis et l’historique avant une publication. Les archives doivent provenir de la copie de distribution propre, jamais d’un dossier actif contenant vos données.

Si un secret est publié, retirez-le des sources et archives, renouvelez-le immédiatement, puis examinez aussi l’historique Git, les releases et les copies éventuelles. Une suppression dans le dernier commit ne suffit pas à le rendre secret de nouveau.

## Signaler une vulnérabilité

Pour [ce dépôt](https://github.com/Shaft1942/bionic_local_server), utilisez **Security → Advisories → Report a vulnerability** si le signalement privé est activé. Sinon, ouvrez une issue minimale demandant un canal confidentiel, **sans publier de secret, d’exploitation détaillée ni de données personnelles**.

Un signalement utile contient la version du compagnon, de Bionic, de Node.js et du système, le périmètre concerné et une reproduction sur données fictives. Le projet ne promet pas de délai de traitement ni de maintenance rétroactive ; vérifiez les versions publiées et les notes de correction avant une mise à jour.
