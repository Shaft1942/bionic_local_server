# Module mémoire ComfyUI

[Guide des images](../docs/comfyui.md) · [English image guide](../docs/en/guide.md)

`custom_nodes/free_memory_after_workflow.py` est un module facultatif. Copiez ce seul fichier dans `custom_nodes` de l’instance **ComfyUI utilisée**, attendez la fin des travaux puis redémarrez cette instance. Il n’exige aucun paquet Python supplémentaire. Le compagnon ne l’installe pas automatiquement.

Dans **Paramètres → Images et ComfyUI**, l’option **Libérer les modèles ComfyUI après chaque image** l’applique à chaque rendu, y compris dans une série. Elle est désactivée sur une installation neuve. **Tester la connexion et les modèles** vérifie sa disponibilité et son contrat avec `SaveImage`.

- Désactivée : le nœud 99 est retiré du graphe soumis ; aucun module ni sortie IMAGE de `SaveImage` n’est requis.
- Activée : `FreeMemoryAfterWorkflow` attend `SaveImage` et demande les indicateurs `unload_models`/`free_memory`. Il exige une sortie `IMAGE` d’indice 0 ; si cette version de `SaveImage` ne la fournit pas, désactivez le nettoyage.

Les indicateurs sont traités **après le workflow**, pas systématiquement avant chaque prompt. Ils concernent ComfyUI, pas le modèle texte Bionic. Le journal du nœud confirme une demande, pas une quantité de mémoire libérée. Recharger les poids peut ralentir le rendu suivant ; aucun gain de vitesse n’est garanti.

Après l’échec terminal d’un nouveau job ayant choisi ce nettoyage, le compagnon peut demander `/free` une seule fois après avoir vérifié sa propre erreur et une file vide. L’intention est persistée avant l’appel, sans répétition après réponse perdue. Aucun `/interrupt` n’est envoyé. Les états `memoryCleanupRecovery` décrivent le suivi ; `requested` signifie seulement demande acceptée.

Les recettes utilisées par le produit sont `workflows/krea2-turbo.api.json` et `workflows/hassaku-illustrious.api.json`. Une comparaison de performance exige prompt, graine, modèle/LoRA, résolution et état mémoire comparables sur plusieurs essais ; un nettoyage ne constitue pas une réservation du GPU contre les autres applications.
