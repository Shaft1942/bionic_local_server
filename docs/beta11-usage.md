# Canaé beta.11

Canaé s’ouvre à l’adresse habituelle du compagnon. La mise à jour depuis2.5.0 garde les données et les réglages, tout en ouvrant cette interface. Les anciennes adresses d’entrée renvoient vers le même accueil ; aucun accès séparé à legacy n’est proposé.

## Conversations

**Nouveau chat** crée une conversation sans projet, visible dans **Conversations**. Le bouton **+** à côté d’un projet prépare une conversation associée à ce projet. Le nom d’un projet, par exemple « No Project », ne change pas son rôle : seules les sources réellement sans projet sont regroupées dans Conversations.

Clique sur le titre dans l’en-tête du chat pour le modifier à cet endroit. Entrée enregistre, Échap annule. Le choix du projet permet de rattacher ou détacher la conversation. Pour un historique d’origine, ces opérations portent sur les métadonnées du compagnon ; elles ne réécrivent pas la base native.

Ouvrir un nouveau chat ne doit ni arrêter une génération déjà lancée, ni changer son moteur. Le brouillon et les permissions du nouveau chat restent séparés. La barre de commandes sur deux lignes, les copies et branches, les outils et les images des versions précédentes restent disponibles.

## Moteurs et modèles

Le pilotage distingue le serveur, le modèle chargé et la connexion choisie dans le chat. Les serveurs Bionic, llama.cpp et ComfyUI déjà démarrés peuvent être détectés et utilisés. Un serveur arrêté peut être préparé puis lancé depuis l’interface sur le PC. Les chemins et les arguments de lancement exigent cette préparation explicite.

Le compagnon permet d’arrêter les processus qu’il a lui-même démarrés, après vérification de leur identité. Un processus lancé par une autre application reste externe : sa connexion et ses modèles peuvent être utilisés selon son API, mais le compagnon ne s’attribue pas son arrêt. Un état inconnu propose une relecture ; il ne déclenche pas automatiquement une seconde commande.

Le chargement Bionic conserve le contexte enregistré dans Bionic. Le chargement ou remplacement d’un GGUF utilise le profil llama.cpp géré. Le panneau affiche les modèles et états observés ; un catalogue indisponible n’empêche pas d’accéder aux commandes du serveur. ComfyUI charge ses modèles lors d’un rendu explicite ; la commande de libération distingue demande acceptée et mémoire effectivement libérée.

## Politique mémoire des images

Le connecteur llama.cpp direct ne possède pas d’API de déchargement du modèle. Quand le réglage global demande ce déchargement, le compagnon utilise une **alternance** compatible et l’affiche : l’inférence et le rendu sont sérialisés, le modèle reste chargé. Cela ne prouve aucune libération de mémoire GPU. Une sélection explicite de déchargement non compatible est refusée avant le modèle ou le rendu, avec accès aux choix compatibles.

Pour arrêter un serveur llama.cpp géré, utilise sa commande d’arrêt dans le pilotage. Les capacités d’un serveur externe ne sont pas étendues à partir de son port ou de son PID.

Les performances et la mémoire nécessaire dépendent des modèles et du matériel. Les contrôles synthétiques, les viewports et les reçus d’API ne qualifient pas à eux seuls un téléphone physique ou une libération mesurée du GPU.
