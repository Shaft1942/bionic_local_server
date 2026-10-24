# Journal des versions

## 2.6.0-beta.4 — Canaé — candidate locale

- Choix du GGUF depuis le champ de message avec chargement confirmé, remplacement du modèle possédé et activation de sa connexion une fois le modèle et son contexte prêts. Le modèle actif reste distinct du fichier sélectionné ; les réponses perdues se vérifient sans second lancement.
- Paramètres regroupés sous **Serveurs du PC**, avec **Moteurs d’inférence** (Bionic et llama-server) et **Génération d’images** (ComfyUI). Conversation conserve les réglages du modèle et de longueur de réponse.
- Les fenêtres se ferment au clic sur le fond extérieur, en conservant les brouillons. Cliquer dedans ou commencer un glissement dedans ne les ferme pas.
- L’accueil présente Canaé sans mention de l’interface utilisée.

## 2.6.0-beta.3 — Canaé — candidate locale

- L’application devient Canaé, avec la mascotte fournie. Les identifiants techniques et le format des mises à jour restent compatibles.
- Fichiers, images, activité et paramètres s’ouvrent dans une fenêtre centrée avec navigation au clavier, fermeture par Échap et brouillon de chat conservé. Le raccourci Paramètres dupliqué du pied de navigation est supprimé.
- Cases à cocher natives visibles ; Internet proposé par défaut et images proposées lorsque le fournisseur configuré est détecté, sans remplacer les choix explicites. Curseurs avec saisie précise pour les LoRA, le plafond de réponse, le contexte et les couches GPU du profil llama-server.
- Sécurité complète dans llama-ui : préparation HTTPS/mTLS, preuve navigateur, autorité publique, appareils, renouvellement/révocation et export privé temporaire. Le prototype utilise désormais le véritable contrôleur de transport, en conservant son mode initial jusqu’à une activation explicite.
- Bibliothèque GGUF partagée avec Bionic, sans copie de poids. Profil llama-server possédé, sélection du modèle et démarrage/remplacement/arrêt explicites depuis la webapp ; processus externes exclus, refus pendant les travaux et récupération par lecture après perte de réponse.

## 2.6.0-beta.2 — candidate locale

- Paramètres natifs dans llama-ui : moteur de conversation et connexion, modèles et plafonds, ComfyUI/LoRA/mémoire, serveurs du PC, apparence et brouillons, sécurité, mises à jour et diagnostic.
- Un seul moteur d'inférence actif à la fois, sélectionné dans la webapp : Bionic ou llama-server. Connexions persistantes, jetons séparés, application au repos et réconciliation des opérations ambiguës après redémarrage.
- Génération d'images commune aux connecteurs de conversation ; contrat de fournisseur indépendant préparant les futurs moteurs images, avec ComfyUI comme fournisseur distribué.
- Actions sur les conversations et messages, approbations scripts/web, activité, livrables, versions et corbeille portés dans llama-ui ; historique paginé, file de messages, brouillons complets et français/anglais.
- Séries de 1 à 5 images depuis le chat, suivi distinct des jobs, galerie et ZIP conservés. La récupération relit l'état serveur sans nouvelle soumission.

## 2.5.1-beta.2 — 2026-10-24 — candidate locale

- Dans **Projets et conversations**, un bouton **+** à droite du compteur ouvre directement un nouveau chat web dans le projet choisi, y compris depuis un projet replié. Les brouillons sont conservés et la conversation est enregistrée au premier envoi.
- Images : récupération bornée d'un appel d'outil oublié sur commande explicite, annonces de lancement retenues jusqu'au reçu du service et erreurs de soumission affichées directement. Aucun renvoi après un appel image déjà tenté.
- Suivi ComfyUI : état inconnu lorsque le job disparaît de la file et de son historique après revérification ; carte incertaine pendant une perte de connexion, sans soumission automatique.
- Cette candidate conserve les corrections de reprise et la configuration des serveurs de la bêta.1, les valeurs par défaut Internet/images, les séries de 1 à 5 images, les choix mémoire, la galerie, les actions image et l'interface français/anglais.

## 2.5.1-beta.1 — 2026-10-24 — candidate locale

- Les refus avant tout lancement n'immobilisent plus le compagnon. Les véritables effets inconnus restent protégés ; l'ancien refus Bionic avant ouverture est migré sans rejouer une commande.
- Le contrôle Bionic peut reprendre après redémarrage du compagnon lorsque l'identité complète du même contrôleur, son profil et son API sont revalidés. Un serveur étranger ou une identité ambiguë n'est pas adopté.
- Paramètres → Serveurs : cartes simplifiées, détails repliés, récupération guidée, arrêt du serveur Bionic explicitant que Desktop reste ouvert ; durée des opérations corrigée.
- Configuration sur le PC dans les paramètres : détection bornée, choix natif du dossier, validation et enregistrement, chemins avancés si nécessaire. Aucune commande libre et aucune ouverture automatique d'un moteur.
- Internet activé par défaut pour les nouveaux choix ; images activées lorsque ComfyUI configuré est disponible. Les droits, brouillons et réglages explicitement désactivés restent respectés.

Les entrées décrivent les évolutions du produit. Les comptes rendus de travail, mesures d’un poste, plans et prompts internes ne font pas partie de cette documentation. Les versions effectivement disponibles sont dans les [Releases](https://github.com/Shaft1942/bionic_local_server/releases).

## 2.6.0-beta.1 — candidate locale

- Prototype d'interface dérivée de llama-ui : projets, conversations, fichiers et atelier images sur les API existantes du compagnon, avec thème clair/sombre.
- Reprise du suivi après déconnexion avec identifiant de demande conservé et consultation du serveur sans renvoi automatique.
- Connecteur llama.cpp facultatif et démonstration synthétique séparée des installations personnelles. L'interface antérieure reste accessible.
- Le port de l'interface française/anglaise et des fonctions avancées n'est pas encore complet ; voir [les parcours et limites du prototype](docs/llama-ui-prototype.md).

## 2.5.0 — 2026-10-23

- Interface **français/anglais**, choix mémorisé par navigateur et indépendant de la langue des conversations, prompts et fichiers. README et guide d’usage anglais ajoutés ; documentation réorganisée, synthétisée et débarrassée des traces internes.
- Assistant d’installation Windows actualisé : version affichée, accès aux guides français/anglais et configuration explicite des serveurs après installation. Le profil privé des lanceurs est exclu des sources copiées et conservé lors d’une reconfiguration sur place.
- Images ComfyUI : **1 à 5 images par demande**, file commune, choix de conserver/décharger le modèle texte ou de répondre entre les images, préférences par demande et brouillon. Annulation des images encore locales, relance à graine identique ou nouvelle, aperçu, galerie et téléchargement ZIP. **Livrables → Génération** rassemble les images du projet.
- **Serveurs sur le PC** : configuration locale, suivi et commandes manuelles Bionic/ComfyUI avec confirmations, contrôle d’identité et récupération sans rejeu. Les travaux connus ou incertains et les attentes GPU protègent les opérations incompatibles.
- Projets locaux et adoption explicite de dossiers/droits ; pagination des messages, index dérivé et cache borné. Historiques natifs toujours en lecture seule.
- Fiabilité : réservations par phase, attente des chargements et nettoyages avant libération, checkpoints et arrêt bornés, flux lents récupérables et isolement des suivis illisibles. Une soumission incertaine n’est pas renvoyée automatiquement.
- Fenêtres et menus fermables au clic extérieur, focus/clavier préservés ; reconnexion en haut. Guide certificats revu et version installée discrète dans les paramètres.

La distribution conserve Node.js 24+ et les canaux Stable/Bêta. Les configurations, accès et données restent locaux. Les limites et la procédure de mise à jour sont dans [la documentation](docs/README.md).

## Versions précédentes

| Version | Principales évolutions |
| --- | --- |
| 2.3.0 | Paramètres par rubrique, Maintenance/Aide séparées, lecture des conversations et configuration ComfyUI guidée |
| 2.1.0 | Gestion HTTPS/mTLS depuis le navigateur, contexte actualisé au changement de modèle, module mémoire ComfyUI fourni |
| 2.0.0 | Plafonds de réponse par modèle/conversation, Hassaku XL et Krea 2 avec deux LoRA par profil, projets repliables |
| 1.11.0 / 1.10.0 | Améliorations du compagnon, de l’installation et des outils de navigation web |
| 1.9.0 | Mises à jour proposées avec vérification de compatibilité, empreintes et sauvegarde |
| 1.8.0 | Outils, validations de scripts et branches de conversations |
| 1.5.0 | Première génération du compagnon et consultation des projets depuis le navigateur |

Les détails des anciennes préversions restent dans l’historique Git et les notes des Releases correspondantes.
