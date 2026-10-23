# Utiliser le compagnon 2.0

Au pied de la colonne des projets et conversations, l'icône **Paramètres** ouvre les réglages. Le bouton de fermeture
reste visible ; Échap ferme le panneau et rend le focus à son bouton d’ouverture.

## Longueur des réponses

Choisir le modèle, puis **Automatique** ou **Valeur personnalisée**.
Le mode personnalisé propose un curseur et une saisie précise synchronisés, de
**1 à 5 000 000 tokens**. Le curseur permet un réglage rapide ; la saisie conserve
la précision à un token près. Ce maximum configurable ne modifie pas la capacité
du modèle : le plafond effectivement envoyé reste limité par son contexte disponible.
Le mode automatique demande jusqu’à **8 192 tokens par appel**. Le serveur
réduit ce nombre si les messages, images et outils occupent le contexte chargé.
Le reçu indique le budget réellement envoyé et précise qu’il s’agit d’une estimation.

La coche **Appliquer à chaque session de ce modèle** enregistre un défaut sur
le PC, partagé par les appareils connectés au même compagnon. Décochée, elle
enregistre le choix dans la conversation courante. Pour une nouvelle conversation,
le choix local est appliqué à son premier envoi. Un historique Bionic devient une
suite web ; l’original n’est pas modifié.

Ordre de priorité : choix de la conversation, défaut du modèle, automatique.
Choisir Automatique localement permet aussi de déroger à un défaut manuel du modèle.
Un changement de contexte peut réduire le plafond effectif sans effacer la valeur souhaitée.

Un message interrompu à la limite de tokens est signalé dans le chat. Vérifier
les scripts ou documents concernés avant leur utilisation.

## ComfyUI facultatif

1. Démarrer ComfyUI sur le PC ou le réseau privé.
2. Dans Paramètres, activer ComfyUI, saisir son adresse et choisir le workflow.
3. Utiliser **Tester la connexion et les modèles** : ce contrôle ne lance aucun rendu.
4. Enregistrer, puis activer **Générer des images avec ComfyUI** dans le menu Outils du message.
5. Demander l’image en langage naturel. Le modèle appelle l’outil ; le résultat est
   affiché dans le message avec un bouton de téléchargement après réussite du rendu.

L’adresse est vue depuis le PC serveur du compagnon. `127.0.0.1` désigne ce PC,
même quand le chat est ouvert sur un téléphone. Les adresses IPv4 privées du LAN
sont acceptées. La configuration est désactivée par défaut dans une nouvelle installation.

Les profils disponibles reprennent **Krea2 Turbo** et **HassakuXL Illustrious v34**
avec leurs modèles et réglages définis. La chaîne mixte reste expérimentale et est
archivée dans `docs/comfy-workflows` pour un travail ultérieur.

Le suivi conserve l’adresse et le workflow de chaque génération. Il ne resoumet
pas automatiquement une demande ambiguë. Les images déjà obtenues restent
consultables après désactivation. Attendre la fin des générations pour modifier
la connexion ou le workflow. Une soumission n’est pas une image réussie.

## Projets et conversations

La barre latérale présente les projets sous forme de groupes repliables. Ouvrir
un projet charge ses conversations ; une longue liste propose **Afficher plus**.
Les conversations sans projet ont leur propre groupe. Le projet courant reste
celui du sélecteur Projet ; choisir un autre fil change le contexte de travail.

## Ce qui vient de l’audit

Le panneau Paramètres décrit les capacités et limites du compagnon. Les réponses
conservent un reçu de contexte et une mémoire courte des outils déjà transmis,
bornée à 2 400 caractères. Cette mémoire historique n’accorde aucun droit et ne
prouve pas l’état actuel d’un fichier ; une modification demande une nouvelle lecture.

Les outils propres au compagnon fonctionnent indépendamment de ceux de Bionic
Desktop. L’héritage des MCP, skills et sous-agents Desktop, le navigateur interactif
et la synchronisation native bidirectionnelle restent hors de ce socle.
