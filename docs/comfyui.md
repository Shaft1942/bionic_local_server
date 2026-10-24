# Images ComfyUI dans les conversations

Dans **Paramètres**, activer ComfyUI, choisir son URL et son workflow, tester puis
enregistrer. Dans le menu Outils du message, activer **Générer des images avec ComfyUI**,
puis demander une image en langage naturel. Un modèle compatible avec les appels
d’outils est nécessaire. L’image et son bouton de téléchargement apparaissent dans
le message de l’assistant. Le rendu continue lorsque le navigateur est fermé.

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
le workflow sélectionné dans les paramètres.

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
Voir `docs/history/v2-live-proof.json`. Hassaku a été précontrôlé sur l’instance ;
aucun nouveau rendu Hassaku ou mixte n’a été lancé dans ce chantier.
