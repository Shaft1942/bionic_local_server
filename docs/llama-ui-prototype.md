# Interface llama-ui — prototype 2.6.0-beta.1

Cette candidate ajoute une interface Svelte adaptée de composants de llama-ui. Les conversations, projets, fichiers, autorisations et travaux images restent gérés par le serveur du compagnon. Le connecteur de conversation llama.cpp est décrit dans [llamacpp.md](llamacpp.md).

## Choisir l'interface

Le réglage `uiMode` accepte `legacy` (interface antérieure, valeur par défaut) ou `llama` dans `config.local.json`. L'équivalent d'environnement est `BIONIC_MOBILE_UI_MODE`. Il s'applique à l'installation concernée après redémarrage.

- `/prototype/` ouvre la nouvelle interface quand son build est installé.
- `/` ouvre l'interface sélectionnée.
- `/legacy/` ouvre l'interface antérieure, y compris ses paramètres et fonctions non encore portées.

Les trois adresses utilisent les mêmes sessions et API. Le changement de présentation ne crée pas de copie maîtresse de conversations dans le navigateur.

## Parcours disponibles

- Choisir et créer un projet local ; retrouver et ouvrir ses conversations.
- Démarrer une conversation avec le modèle disponible, envoyer et suivre une réponse ; arrêter explicitement une demande ou détacher seulement son flux réseau.
- Revenir après une déconnexion : le navigateur consulte l'état de la demande et recharge la conversation. Il ne renvoie pas automatiquement le message.
- Ouvrir les dossiers autorisés du projet, lire un fichier, le joindre et enregistrer une modification de texte avec contrôle de version. Un conflit conserve le brouillon et permet de comparer la version serveur.
- Ouvrir l'atelier images, soumettre un prompt, suivre le travail serveur, consulter les images conservées et préparer une variante. Les actions de relance sont explicites.
- Utiliser le thème clair/sombre et la disposition adaptée aux petites largeurs.

Les cartes et formulaires sont une première surface de prototype. Les réglages avancés, les parcours d'adoption de dossiers, les autorisations de scripts/web et certaines actions historiques restent disponibles dans l'interface antérieure. L'interface nouvelle est actuellement en français ; elle ne constitue pas un port complet des traductions français/anglais de l'interface antérieure.

## Construire les assets

Node.js 24+ est requis. Depuis le dépôt :

```powershell
npm --prefix ui ci
npm run build:ui
npm --prefix ui run check
```

Les dépendances frontend servent à la fabrication des assets. L'utilisateur d'une archive précompilée n'a pas besoin d'un serveur Vite ou de dépendances npm pour démarrer le compagnon.

Le build et les composants dérivés conservent leur provenance et les avis de licence. Voir [provenance](../ui/UPSTREAM.md) et [licence amont](../ui/LICENSE.llama.cpp). La logique des outils du navigateur amont, ses autorisations permanentes et son stockage de conversations IndexedDB ne sont pas repris comme autorités.

## Démonstration isolée

```powershell
npm run start:prototype -- --port 8878
```

Le runner crée ses données synthétiques dans un dossier distinct. Il refuse de réutiliser un dossier non vide qui ne porte pas son marqueur de fixture. Son code public de démonstration est `prototype-260` ; il écoute uniquement sur `127.0.0.1`. Ce code n'est jamais destiné à une installation personnelle ni à une écoute LAN.

Dans ce runner, les projets et fichiers sont synthétiques, le modèle par défaut simule une réponse lente et **ComfyUI est toujours simulé**. Cela permet de contrôler les reprises sans toucher aux services et au GPU de l'utilisateur.

Pour qualifier séparément un moteur déjà démarré explicitement :

```powershell
npm run start:prototype -- --port 8878 --llama-url http://127.0.0.1:1237
```

Cette option n'installe, ne démarre, ne charge et ne décharge aucun moteur. Elle autorise uniquement le catalogue, les propriétés et les requêtes de conversation vers cette origine locale explicite. Le ComfyUI de la démonstration reste simulé.

## Limites de qualification

Les tests de la fixture prouvent les contrats HTTP et navigateur du compagnon. Une réussite simulée ne qualifie ni un rendu ComfyUI réel, ni le GPU, ni un téléphone physique. Les limites de gestion mémoire du premier connecteur llama.cpp restent applicables, notamment l'absence de déchargement automatique d'un modèle direct externe.

Une demande dont le résultat est inconnu reste visible et ne doit pas être resoumise automatiquement. Fermer le flux ou la page n'équivaut pas à arrêter la génération ; le bouton d'arrêt explicite vise la demande identifiée.
