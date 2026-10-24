# Images ComfyUI dans les conversations

Dans **Paramètres**, activer ComfyUI, choisir son URL et son modèle d’image, tester puis
enregistrer. Dans le menu Outils du message, activer **Générer des images avec ComfyUI**,
puis demander une image en langage naturel. Un modèle compatible avec les appels
d’outils est nécessaire. L’image et son bouton de téléchargement apparaissent dans
le message de l’assistant. Le rendu continue lorsque le navigateur est fermé.

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

Les deux graphes de production terminent par `FreeMemoryAfterWorkflow` (nœud 99),
dont `trigger` dépend de la sortie de `SaveImage`. Ce nœud installé localement pose
les drapeaux `unload_models` et `free_memory`, comme `/free` ; ComfyUI les traite
après le workflow. Le nettoyage est donc effectué après la sauvegarde de l’image.
Le nœud doit être installé sur l’instance visée ; le test de connexion signale son
absence. Les anciens exports éditables archivés ne sont pas les graphes exécutés.

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
Voir `docs/history/v2-live-proof.json`. L’extension 2.1 a ensuite été testée avec
des rendus HassakuXL et Krea2 avec LoRA depuis des prompts du compagnon ; voir
`docs/v2-validation.md`. Le workflow mixte reste expérimental et non validé.
