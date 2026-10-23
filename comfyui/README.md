# Nettoyage mémoire ComfyUI

À partir de la 2.2.1-beta.3, le compagnon utilise `FreeMemoryAfterWorkflow` seulement
si l’option facultative « Décharger les modèles ComfyUI après chaque rendu » est activée.
Elle est désactivée pour une installation neuve ; les réglages enregistrés anciens
conservent leur comportement. Désactivée, aucun module ni sortie IMAGE sur SaveImage
n’est requis. Le choix est figé pour chaque demande. Les deux graphes de production
conservent le nœud comme recette de référence, y compris Krea 2 Turbo. Le module est fourni ici :
`custom_nodes/free_memory_after_workflow.py`. Il ne demande aucun paquet Python.

Pour une instance où le nœud est absent, copier ce seul fichier dans le dossier
`custom_nodes` du **serveur ComfyUI utilisé**, puis redémarrer ce serveur après la
fin de ses travaux. Il ne suffit pas de le copier dans le dossier du compagnon.
Dans les paramètres du compagnon, **Tester la connexion et les modèles** vérifie
ensuite sa présence et son rôle de nœud de sortie. Aucune installation ni aucun
redémarrage ComfyUI n'est effectué par le compagnon ou son autoupdate.

Le nœud 99 dépend de `SaveImage`. Il programme les indicateurs `unload_models` et
`free_memory`, puis le worker ComfyUI les traite après le workflow : déchargement
des modèles ComfyUI, remise à zéro du cache de l'exécuteur et collecte mémoire.
Avec le nettoyage activé, les graphes soumis exigent donc une sortie `IMAGE` d'indice 0 sur `SaveImage`.
Elle est présente dans le backend ComfyUI 0.42.2 vérifié pour cette intégration
(`RETURN_TYPES = ("IMAGE",)` et résultat `images`). Certaines autres versions de
`SaveImage` ne renvoient aucune sortie. Dans ce cas, **Tester la connexion et les
modèles** refuse le graphe avec « lien de sortie absent » : le type générique
du déclencheur ne rend pas valide une sortie inexistante. Le compagnon ne modifie
ni le backend ComfyUI ni les liens du graphe automatiquement.
Il ne décharge pas un modèle Bionic. Le journal
`[Free Memory after Workflow] Requested ...` confirme la **demande**, pas une
quantité de RAM ou de VRAM libérée.

Si le nettoyage a été activé pour ce travail et qu’un nouveau travail du compagnon échoue ou est interrompu avant la sauvegarde,
le nœud final peut ne pas être atteint. À partir de la 2.1, le compagnon demande
alors une seule fois `/free` avec les deux indicateurs, après avoir retrouvé
l'erreur terminale de son propre `prompt_id` et vérifié que la file est vide.
Une file occupée, un historique incertain ou un ancien travail ne déclenche pas
cette récupération. La tentative est enregistrée avant son envoi et n'est pas
répétée automatiquement, même si la réponse réseau est perdue. Si un autre
travail arrive entre le contrôle et `/free`, ComfyUI attend sa fin pour traiter
les indicateurs ; le compagnon n'appelle jamais `/interrupt`.

Les états `memoryCleanupRecovery` du suivi sont `checking`, `requesting`,
`requested`, `skipped_busy`, `failed` ou `unknown`. `requested` signifie seulement
que le serveur a accepté la demande. La durée `executionDurationMs`, lorsqu'elle
est disponible, vient des événements de début et de fin ComfyUI ; elle exclut
l'attente en file et ne mesure pas le temps de nettoyage.

Ce mécanisme ne garantit pas une accélération : les modèles devront être
rechargés au besoin. Une comparaison de performance demande la même seed, le
même prompt, les mêmes modèles/LoRA, la même résolution et un état mémoire
comparable, sur plusieurs générations. Il ne faut pas comparer un rendu réussi
à un rendu interrompu, ni un rendu sans LoRA à un rendu avec deux LoRA.
