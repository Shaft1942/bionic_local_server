# Canaé beta.10 : un chat plus compact

Les choix **moteur, modèle et réflexion** restent dans le chat, dans une barre compacte. Les options de réflexion viennent toujours du modèle sélectionné. Les aides ordinaires et l'accès au profil GGUF sont disponibles dans les options du moteur ; les erreurs et les actions de récupération restent visibles lorsqu'elles sont nécessaires.

## Conversations et projets

Chaque projet déplié affiche ses propres conversations. La section **Conversations** du bas contient uniquement celles qui ne sont associées à aucun projet, y compris lorsqu'elles viennent de plusieurs sources. Déplier un projet ne change pas le chat ouvert ni son brouillon. Le classement et les historiques d'origine ne sont pas réécrits par cette présentation.

Les listes se chargent par pages. La recherche porte sur les conversations déjà chargées ; charger les pages suivantes permet d'élargir ce périmètre.

## Actions dans le message

Les icônes de copie et de branche sont intégrées à l'en-tête du message concerné. Elles restent accessibles au clavier et au tactile. La copie conserve le texte original et propose une sélection manuelle si le navigateur refuse l'accès au presse-papiers. La création de branche conserve sa portée et sa récupération après une réponse perdue.

## Moteurs, modèles et images

L'entrée de gestion permet d'accéder aux modèles chargés et aux réglages des serveurs d'inférence et d'images. Le chargement et le déchargement suivent les capacités du moteur. Décharger un modèle et arrêter un serveur sont des actions distinctes ; un GGUF géré par Canaé se libère en arrêtant son processus possédé.

Un serveur externe n'est pas adopté à partir de son port ou de son PID. Les états indisponibles ou inconnus restent explicites. Les confirmations, droits locaux et vérifications après une réponse ambiguë restent applicables.

Cette candidate locale poursuit les [fonctionnalités de beta.9](beta9-models.md) et le [chantier de parité beta.8](beta8-parity.md). Les tests synthétiques et les vérifications du build ne qualifient pas un téléphone physique, un moteur réel ou un rendu GPU. Les essais réels déjà réalisés conservent leur propre révision.
