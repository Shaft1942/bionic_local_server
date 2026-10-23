# Images ComfyUI dans les conversations

Dans **Paramètres**, activer ComfyUI, choisir son URL et son modèle d’image, tester puis
enregistrer. Dans le menu Outils du message, activer **Générer des images avec ComfyUI**,
puis demander une image en langage naturel. Un modèle compatible avec les appels
d’outils est nécessaire. L’image et son bouton de téléchargement apparaissent dans
le message de l’assistant. Le rendu continue lorsque le navigateur est fermé.

Après un appel d’outil consacré à l’image, le compagnon affiche lui-même la
confirmation et termine la réponse texte, sans rappeler le modèle de conversation
pendant le rendu. Le suivi et l’affichage de l’image continuent automatiquement.
Si le modèle renvoie un lot mêlant image et autres outils, la synthèse texte attend
la fin du rendu. Une soumission au résultat incertain termine le tour avec un
message de vérification, sans nouvel appel du modèle ni renvoi de l’image.
Les erreurs de validation survenues avant la création d’un job restent expliquées
par le parcours conversationnel habituel.

Cette optimisation évite le chevauchement provoqué par ce tour d’outils ; elle ne
réserve pas le GPU face aux autres chats, instances du compagnon ou applications.
Elle ne décharge pas automatiquement les modèles Bionic ou ComfyUI.

Dans **Outils → Modèle d’image**, choisir Krea 2 Turbo ou Hassaku XL pour le prochain
message. Le choix est conservé avec le brouillon et la conversation. Dans
**Paramètres → ComfyUI**, chaque modèle dispose de deux emplacements LoRA facultatifs
avec un slider de force entre −2 et 20, au pas de 0,05, et sa valeur affichée en direct (0 désactive l’emplacement). Changer de modèle dans ce
formulaire permet de préparer ses propres LoRA ; enregistrer sauvegarde les deux
recettes. Le modèle et les LoRA sont figés lors de l’envoi du message.

**Actualiser les LoRA** consulte les listes `lora_name` de `LoraLoader` et de
`LoraLoaderModelOnly` dans `/object_info`. Tous les fichiers reconnus par ComfyUI,
y compris ses dossiers supplémentaires et les téléchargements de l’application,
sont proposés avec leur chemin relatif. Après un ajout, actualiser le catalogue ;
si ComfyUI n’a pas encore indexé le fichier, le faire reconnaître dans ComfyUI.
Une présence dans la liste ne prouve pas la compatibilité : choisir des LoRA
SDXL/Illustrious pour Hassaku, et Krea 2 pour Krea 2. Aucun LoRA n’est activé d’office.
Krea utilise `LoraLoaderModelOnly` ; Hassaku applique la même force au modèle et au
CLIP avec `LoraLoader`, sans remplacer le VAE du checkpoint.

## Configuration guidée (2.2.1-beta.3)

Dans **Paramètres → Images**, suivre les trois étapes :

1. **Trouver ComfyUI** : démarrer ComfyUI, puis **Rechercher le serveur**. Le compagnon interroge seulement `/system_stats` sur les ports 8188 et 8000 du PC du compagnon et sur l'adresse saisie. Il ne parcourt pas le réseau. Choisir un résultat lance le diagnostic complet sans enregistrer ni générer. Un port différent se saisit manuellement. L'absence de résultat ne prouve pas que l'option serveur est désactivée : vérifier démarrage, port, adresse et, uniquement pour un autre PC, accès réseau privé.
2. **Vérifier le modèle d'image** : choisir Krea 2 ou Hassaku puis **Tester la connexion et les modèles**. Le résultat sépare serveur, fichiers attendus et nœuds. Chaque modèle est marqué présent/manquant avec son dossier dans ComfyUI : `models/diffusion_models`, `models/text_encoders`, `models/vae` ou `models/checkpoints`. Les noms exacts du graphe sont requis ; les modèles renommés ou rangés sous un autre nom relatif ne sont pas sélectionnés automatiquement. Les dossiers supplémentaires configurés dans ComfyUI restent pris en compte via son catalogue.
3. **Choisir le nettoyage mémoire**, puis activer ComfyUI et enregistrer. Aucun diagnostic ne télécharge de poids, ne lance un rendu ou ne modifie le serveur. Les poids et leurs licences restent à obtenir auprès de leurs éditeurs ; voir le [guide officiel des modèles](https://docs.comfy.org/basic-concepts/models). Les LoRA sont facultatifs dans les réglages avancés.

Une installation neuve laisse ComfyUI et le nettoyage désactivés. Une configuration déjà enregistrée en version 1 ou 2 conserve son ancien nettoyage activé ; le passage au format 3 est enregistré au prochain changement. Un choix explicitement désactivé reste désactivé après redémarrage.

## Nettoyage mémoire facultatif

L'option **Décharger les modèles ComfyUI après chaque rendu** peut aider à rendre de la mémoire à d'autres applications ou à traiter un ralentissement entre rendus, notamment avec Krea 2. Elle ne garantit aucun gain : le rechargement des poids peut ralentir le rendu suivant. Elle ne décharge jamais le modèle de conversation Bionic et ne constitue pas un déchargement systématique avant chaque prompt.

- **Désactivée** : le compagnon retire le nœud 99 du graphe soumis. Aucun module supplémentaire n'est nécessaire ; un `SaveImage` standard sans sortie IMAGE est accepté. La gestion mémoire normale de ComfyUI reste active. Aucune récupération `/free` n'est déclenchée après erreur pour ces nouvelles demandes.
- **Activée** : le graphe conserve `FreeMemoryAfterWorkflow`, dépendant de `SaveImage`. Les indicateurs `unload_models` et `free_memory` sont traités après le workflow. La récupération après échec reste limitée au propre job terminal du compagnon et à une file observée vide ; aucun `/interrupt` n'est appelé. Le choix est figé à l'acceptation du message et persisté avec le job ; les anciens jobs conservent leurs règles.

Le formulaire permet de **télécharger le module mémoire fourni** via une route authentifiée du compagnon. Copier `free_memory_after_workflow.py` dans `custom_nodes` de l'instance ComfyUI utilisée, attendre la fin des travaux puis redémarrer cette instance. Aucun paquet Python supplémentaire n'est requis. Copier le fichier uniquement dans le compagnon ne l'installe pas dans ComfyUI. L'installation et le redémarrage restent manuels.

Le diagnostic montre l'absence du module même lorsque l'option est désactivée, sans bloquer le workflow. Activée, elle exige aussi que le module soit un nœud de sortie et que `SaveImage` fournisse une sortie IMAGE d'indice 0. Si cette combinaison est incompatible, désactiver le nettoyage pour continuer. Les graphes archivés restent des exports historiques ; les graphes de production incluent le nœud facultatif que le service retire au besoin.

Le serveur ComfyUI doit être démarré sur le PC ou le réseau privé. L’adresse par
défaut est `http://127.0.0.1:8188` ; HTTP loopback et les IPv4 RFC1918 sont acceptés,
sans identifiants, chemin ou redirection. Une nouvelle installation laisse ComfyUI
désactivé. Les réglages initiaux `comfyEnabled`, `comfyUrl`, `comfyWorkflowId` dans
`config.local.json`, ou `BIONIC_COMFY_ENABLED`, `BIONIC_COMFY_URL`,
`BIONIC_COMFY_WORKFLOW_ID`, s’appliquent avant le premier enregistrement dans l’UI.
Ensuite les préférences sont dans `data/comfy-settings.json`.

Le workflow Krea2 utilise Krea2 Turbo FP8 scaled, Qwen3VL 4B FP8 type `krea2`,
Qwen Image VAE, Euler/simple, 8 étapes, CFG 1, lot 1. Les fichiers de modèle doivent
être disponibles dans ComfyUI. Le modèle de conversation fournit uniquement le
prompt, le format (1024², 832×1216, 1216×832) et éventuellement une seed 32 bits.

Le second profil reprend HassakuXL Illustrious v34, 25 étapes, CFG 6,
Euler ancestral/normal, en portrait par défaut. Les profils de production sont
dans `workflows`. Les exports éditables et la variante mixte expérimentale sont
archivés dans `docs/comfy-workflows`. Aucun modèle ou nœud n’est installé automatiquement.

Le contrôle **Tester la connexion et les modèles** consulte seulement
`/system_stats`, `/object_info` et `/queue` ; il ne soumet pas de job. L’outil
`generate_comfy_image` et son alias historique `generate_krea2_image` utilisent
le modèle choisi pour le message, avec le réglage des paramètres comme valeur par défaut.

Une image maximum par message et quatre générations en attente dans le compagnon.
Les demandes sont enregistrées sous `data/comfy-generations` avant soumission,
puis suivies par `prompt_id`. Les images sont copiées dans ce dossier privé et
servies par une route authentifiée du compagnon, jamais par un localhost envoyé au téléphone.
Les chemins et le graphe ne sont pas choisis par le modèle.
Chaque job garde son URL, son workflow et son nœud de sortie. Les anciennes
images restent lisibles après désactivation. Attendre la fin des générations
pour changer de connexion ou de workflow.

Un délai expiré ou un redémarrage pendant la soumission donne un état inconnu,
sans répétition automatique du POST. Vérifier ComfyUI avant de soumettre un nouveau
message. Un redémarrage reprend le suivi des jobs déjà connus. Arrêter la réponse
du modèle n’interrompt pas globalement les travaux ComfyUI.

Cette fonction est indépendante des outils fichiers, Internet et scripts ; elle
n’affaiblit pas leurs validations. Les conversations natives Bionic restent en
lecture seule. La cohabitation mémoire et la durée de génération dépendent des
modèles chargés dans Bionic et de l’offload ComfyUI.

Un rendu Krea2 1024 × 1024 piloté par Gemma a réussi pendant la validation V2.
Voir `docs/history/v2-live-proof.json`. Les ajouts LoRA réunis dans la release 2.0.0 ont été testés avec
des rendus HassakuXL et Krea2 avec LoRA depuis des prompts du compagnon ; voir
`docs/v2-validation.md`. Le workflow mixte reste expérimental et non validé.
