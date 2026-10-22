# Revue finale indépendante hors ligne

Aucun livrable modifié ; aucun accès réseau, import navigateur ou rendu pendant cette revue.

## Résultat

Aucun blocage structurel identifié dans les trois couples UI/API.

- hassaku_illustrious : 7 nœuds, 9 liens ; précontrôle sans erreur, égalité UI/API, modes0, seed42 fixe, bindings et SHA256 vérifiés.
- krea2_turbo : 9 nœuds, 9 liens ; précontrôle sans erreur, égalité UI/API, modes0, seed42 fixe, bindings et SHA256 vérifiés.
- hassaku_vers_krea2_experimental : 16 nœuds, 20 liens ; précontrôle sans erreur, égalité UI/API, modes0, seed42 fixe, bindings et SHA256 vérifiés.

Vérifications supplémentaires : IDs uniques ; compteurs last_node_id/last_link_id cohérents ; chaque lien UI correspond exactement à une entrée API ; type de sortie confirmé par object-info ; liens réciproques des sorties présents ; aucun lien orphelin ; graphes sans cycle ; tous les nœuds actifs (mode0). Valeurs widgets_values identiques aux valeurs nommées dans leur ordre exporté ; seeds fixes dans UI et API. Sorties du manifest reliées à SaveImage.

Les prompts livrés décrivent seulement un botaniste adulte et une fougère sous serre. Aucun prompt personnel provenant du workflow utilisateur, aucun nœud AuraFlow, enhancer ou LoRA dans les graphes livrés. Aucun nœud d'appel réseau ou payant.

## Script finish_bundle.py

Le script reprend les prototypes UI des deux exports natifs, réinitialise tous les liens, donne de nouveaux IDs au segment Krea2 et reconstruit les connexions par noms d'entrées. La mise à jour des widgets se fait par widgets_values_named ; l'ordre utilisé est celui du dictionnaire des widgets exportés, puis contrôlé contre les widgets JSON finaux. Pour le nœud VAEEncode ajouté manuellement, il n'existe aucun widget à synchroniser. Le passage 17/IMAGE → 120/VAEEncode(qwen_image_vae) → 103/KSampler est correct ; aucun latent SDXL non vide n'est réutilisé par Krea2.

Les champs de preuve api_imported_in_frontend/ui_exported_from_frontend inscrits par ce script sont des déclarations de provenance fournies par le pilote : la revue hors ligne confirme le contenu, pas l'historique navigateur. Les indications du manifest et de verification.json distinguent correctement l'UI03 assemblé de l'UI01/02 exporté.

## Limites conservées

- Le fichier UI03 final assemblé n'a pas encore été réimporté dans le navigateur ; cela reste explicitement indiqué.
- Aucun modèle n'a été chargé ni aucun rendu GPU évalué dans cette revue. La présence des fichiers dans object-info ne prouve pas leur intégrité ni leur capacité de chargement.
- Hassaku → Krea2 reste expérimental : le denoise0.5 sur Turbo8 modifie le schedule de distillation de référence ; la fidélité à la composition et la qualité ne sont pas établies.
- Le futur appel depuis le compagnon local reste une intégration distincte.
