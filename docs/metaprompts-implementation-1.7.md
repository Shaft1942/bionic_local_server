# Méta-prompts exécutés — retour, livrables et contexte

Implémentation du **20 octobre 2026**, sur la branche `feat/retour-livrables-contexte`, à partir des conversations parallèles de la version 1.6.0. Trois agents ont reçu des responsabilités distinctes ; le coordinateur assemble et vérifie leur travail. Voici leurs consignes sous une forme réutilisable, sans chemin personnel.

## Coordinateur — contrats, intégration et vérification

```text
Implémente trois fonctions dans une nouvelle branche du compagnon Bionic :
« Depuis votre départ », une étagère de livrables et « Contexte utilisé ».
Pars des fonctions existantes et préserve les chats parallèles, les files,
les brouillons et les contrôles d’accès aux projets.

Avant les modifications, répartis les fichiers entre trois agents :
- contexte réellement transmis, cycle de génération et intégration serveur ;
- activité et conservation des livrables, avec tests isolés ;
- interface commune pour les trois fonctions.
Fais convenir les contrats d’API et les structures de données avant que les
interfaces dépendent d’un format non confirmé. Garde une seule autorité
d’édition pour le serveur et une pour le frontend.

Rends les trois fonctions utilisables sur téléphone, avec états vides,
chargement, erreur et reprise. Ne déduis pas d’un texte du modèle la réussite
d’une action. Ne marque pas des résultats consultés au simple affichage d’un
panneau. Ne reconstruis pas un ancien contexte en relisant les fichiers.

Vérifie des données synthétiques : consultation d’une nouvelle réponse,
rechargement, ouverture du bon message, conservation du brouillon, épinglage
et téléchargement d’une copie, changement ou disparition de son fichier
source, isolation entre projets et fidélité des extraits de contexte.
Ajoute les contrôles d’accès, d’origine, de version et de contenu passif.

Exécute les tests adaptés, puis un parcours navigateur bureau et mobile.
Regroupe les défauts constatés en une correction et une confirmation bornée.
Mets à jour usage, limites, sauvegarde et manifeste de distribution. Vérifie
l’archive propre et crée un commit avec une identité GitHub de confidentialité.
N’installe pas cette branche dans la copie quotidienne et ne publie rien
sur GitHub sans instruction correspondante.
```

## Agent contexte et serveur

```text
Produis un reçu persistant pour chaque nouvelle réponse assistant. Il décrit
l’historique réellement retenu et omis, les pièces jointes effectivement
transmises et chaque extrait reçu par un appel de lecture réussi.

Utilise le constructeur du contexte envoyé au modèle. Pour un message en
file, le reçu naît au démarrage du tour, avec la réponse précédente, et non
à l’acceptation initiale du prompt. Les extraits d’outils conservent chemin,
empreinte, position, taille et texte borné réellement observé.

Ne charge aucun fichier supplémentaire pour produire ce reçu. Ne transforme
pas les caractères en compte exact de tokens. Une ancienne réponse sans
reçu reste indiquée comme indisponible. La transmission d’une pièce jointe
ne prouve pas que le modèle l’a comprise.

Enregistre aussi la date et l’issue réelles de chaque réponse terminée,
arrêtée ou interrompue, y compris au constat d’un redémarrage. N’invente pas
de date de fin pour les anciens messages déjà terminés.

Intègre les routes du module d’activité et de livrables derrière la session
existante. Préserve la vérification d’origine des mutations et le périmètre
du projet. Les téléchargements de copies sont des pièces jointes passives.
Écris des tests synthétiques de sélection, de file, de lecture et de reprise.
```

## Agent activité et livrables

```text
Crée un module indépendant, injectable et testé, sans modifier le serveur
détenu par l’autre agent.

L’activité provient des issues confirmées des réponses web. Chaque événement
possède une identité stable, un projet, un chat, un message et sa date de fin.
La liste est bornée et les filtres de projet sont validés. La consultation
reste propre à l’appareil ; elle n’exige aucun suivi global de l’utilisateur.

L’épinglage est volontaire : réponse assistant enregistrée ou fichier issu
d’une action d’écriture réellement réussie. Le serveur résout la source
depuis le chat ; un chemin arbitraire envoyé par le client ne suffit pas.
Vérifie les droits et l’empreinte avant de conserver une copie figée.

Stocke métadonnées et copie dans les données privées du compagnon avec
écritures ordonnées, identifiants contrôlés, limites de taille et vérification
d’intégrité. Différencie la copie conservée du fichier vivant : inchangé,
modifié, absent ou indisponible. Renommer le titre et retirer le livrable
ne modifient jamais le fichier d’origine.

Teste persistance, concurrence, projets croisés, source modifiée ou absente,
identifiants malformés, fausse action réussie, corruption et téléchargement
passif. Aucun accès à des projets ou modèles réels dans les tests.
```

## Agent interface mobile et bureau

```text
Intègre les trois fonctions dans le design existant du compagnon.

« Depuis votre départ » propose une liste globale ou par projet, un repère
des nouveautés sur cet appareil et un accès au message exact. Ouvrir le
panneau ne marque rien comme consulté. La consultation suit une action
explicite et n’est confirmée qu’après l’ouverture réussie de sa cible.
Préserve la saisie, la position de lecture et les générations en cours.

L’étagère permet d’épingler, ouvrir, télécharger, renommer et retirer des
copies. Montre clairement l’origine, le caractère figé et l’état du fichier
du PC. Les titres et contenus sont rendus passivement ; ne lance pas du HTML
généré et ne présente pas un fichier annoncé mais inexistant comme disponible.

« Contexte utilisé » s’ouvre sous la réponse et montre le reçu fourni par le
serveur, y compris ses limites. Préserve son ouverture pendant les mises à
jour. Une ancienne réponse sans reçu ne reçoit pas de données reconstituées.

Prévois navigation retour sur téléphone, contrôles nommés, focus visible,
annonces de statuts limitées et états vides utiles. La déconnexion masque
toutes les vues privées. N’ajoute ni notification système, ni indexation,
ni chargement automatique de fichiers, ni refonte visuelle hors périmètre.
```

## Résultats et portée

Le [guide d’utilisation](utilisation.md) décrit les fonctions et les limites réellement livrées dans cette branche. Le [bilan de vérification](verification.md) distingue contrôles automatisés, parcours sur API simulée et intégration Bionic réelle. Les autres [pistes exploratoires](PISTES-UX.md) restent à sélectionner séparément.
