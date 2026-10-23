# Aide dans l’application

Dans **Paramètres → Aide**, le guide intégré couvre le démarrage, les conversations et brouillons, les fichiers, les permissions web et scripts, ComfyUI, la connexion des appareils, le dépannage et les mises à jour. Ouvrir une rubrique ne déclenche aucun appel réseau ni changement de réglage. Les boutons conduisent aux paramètres concernés, sans exécuter l’action qu’ils désignent.

Les capacités annoncées par le serveur figurent sous le guide. Elles décrivent les fonctions disponibles ; les permissions effectives restent celles du projet et du message.

**Paramètres → Maintenance** regroupe les mises à jour, le diagnostic de connexion et les indications de configuration avancée sur le PC. La déconnexion de cet appareil reste dans **Connexion et appareils**. L’aide est une rubrique distincte. Les écrans conservent leurs précisions près des contrôles : le guide explique les usages et les conséquences, sans remplacer les messages d’état.

## Documentation détaillée

- [Outils, validations et branches](outils-agents.md)
- [Images ComfyUI et nettoyage mémoire facultatif](comfyui.md)
- [Certificats et connexion des appareils](certificats-utilisation.md)
- [Utilisation générale](utilisation.md)
- [Sécurité et données privées](../SECURITY.md)

## Maintenir l’aide

Le contenu public est rendu par `public/help.js`, avec `renderCompanionHelp({ container, node, navigate })`. Les sections utilisent les éléments natifs `details` et `summary`. Le rendu utilise du texte et des nœuds DOM, sans interprétation HTML des données du serveur. La navigation est fournie par le contrôleur des paramètres.

Une modification de comportement doit être vérifiée dans son module propriétaire avant d’être annoncée dans ce guide. Les recettes ComfyUI, les permissions, les effets des scripts et les canaux de mise à jour demandent une attention particulière. Les preuves sur données synthétiques ne qualifient pas un téléphone, un modèle ni un service réel.
