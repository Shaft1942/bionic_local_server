# Audit et corrections de la bêta 6

La candidate `2.6.0-beta.6` prolonge la bêta 5. Les essais de développement utilisent des moteurs, projets et données synthétiques ; une qualification sur une installation réelle reste une preuve distincte.

## Images : quantité et suivi

Le chat et l’atelier Images proposent un curseur **Nombre d’images**, de 1 à 5, avec saisie numérique. La quantité est restaurée avec la conversation ou le brouillon du projet. L’atelier peut générer un lot directement, sans appel au moteur de conversation.

Le serveur valide le nombre avant de créer la demande. Il prépare le lot atomiquement, utilise des seeds distinctes et le fait passer dans la file existante. Chaque image possède son propre suivi. Recharger l’interface ou récupérer une réponse perdue retrouve les mêmes travaux ; ces actions ne soumettent pas à nouveau le lot.

Une synchronisation ayant récupéré les images avant la réponse initiale fusionne les cartes par identifiant. Elle ne crée pas une seconde carte du même travail.

## Chargements et reprise des serveurs

Un modèle encore présent pendant un arrêt incertain ne prouve pas la réussite de son remplacement. La gestion llama-server distingue désormais les phases d’arrêt et de lancement ; la sélection du modèle exige aussi que l’opération soit réconciliée avant d’activer la connexion.

La fin confirmée d’un processus termine l’opération correspondante. La sélection propage cet échec quand il lui est corrélé, au lieu de maintenir un verrou indéfini. Une relecture ne lance ni n’arrête un processus.

La reprise des démarrages et redémarrages ComfyUI exige un reçu corrélé à la bonne opération. Un reçu ancien ou appartenant à une autre demande ne suffit pas à confirmer l’action.

Ce reçu est conservé aussi quand l’API devient prête après le délai initial. Le démarrage se réconcilie alors par relecture, sans lancer une deuxième instance.

Bionic peut recopier son CLI lors du démarrage du Desktop. L’identité approuvée du CLI repose sur le chemin canonique et le contenu SHA-256, vérifiés avant chaque invocation. Une recopie identique reste utilisable ; des octets modifiés imposent une nouvelle validation. Les preuves du contrôleur (processus, date de création, exécutable et configuration native) restent nécessaires. Après un arrêt natif, un nouveau démarrage exige à la fois le statut arrêté du CLI et l’absence de listener local confirmée.

Une erreur ponctuelle d’écriture d’un checkpoint texte conserve l’état à sauvegarder. Le serveur retente sa persistance même quand le navigateur est déconnecté et qu’aucun nouveau token n’arrive.

## Extensions restant à concevoir

- **Contrôle llama-server après redémarrage de Canaé** : un hôte persistant, un canal local authentifié et une preuve d’identité complète permettraient de retrouver le contrôle. Un port ou PID isolé ne permet pas d’adopter un serveur externe.
- **Alternance mémoire des moteurs** : pour un llama-server possédé, enregistrer un état de reprise du profil, arrêter le processus avant la phase image, puis recharger explicitement le même GGUF après le rendu. Cette extension doit traiter les erreurs et annulations à chaque étape et être mesurée sur GPU réel.
- **Annulation d’un lancement en cours** : séparer l’acceptation de l’opération et son suivi, puis demander l’arrêt au contrôleur possédé. Une réponse perdue doit rester réconciliable avant tout nouveau lancement.
- **Réglages supplémentaires d’inférence** : partir des capacités déclarées par chaque version de moteur, valider les bornes côté serveur, enregistrer la révision et afficher les options réellement prises en charge. Aucun jeu de paramètres universel n’est supposé.

Ces extensions ne sont pas annoncées comme disponibles dans cette candidate. Les confirmations, contrôles d’activité et limites de propriété existants restent nécessaires.
