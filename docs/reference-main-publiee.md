# Base publiée pour les prochaines itérations

Vérification du 22 octobre 2026. Consigne utilisateur : repartir de la dernière version publiée sur `main`, en commençant par l'évolution des images. Le répertoire local de développement ne devient pas implicitement la référence.

## Référence confirmée

| Élément | Valeur vérifiée |
| --- | --- |
| Dépôt | [Shaft1942/bionic_local_server](https://github.com/Shaft1942/bionic_local_server) |
| Branche | `main` |
| Commit | [`f47adbf44c863438aa2289bf676e7ac1f1ab054a`](https://github.com/Shaft1942/bionic_local_server/commit/f47adbf44c863438aa2289bf676e7ac1f1ab054a) |
| Version du package | `2.0.0` dans le [package publié](https://github.com/Shaft1942/bionic_local_server/blob/f47adbf44c863438aa2289bf676e7ac1f1ab054a/package.json) |
| Dernière release stable observée | [`v2.0.0`](https://github.com/Shaft1942/bionic_local_server/releases/tag/v2.0.0), publiée le 22 octobre à 22 h 20, heure de Paris |
| Tag annoté | `b2daa282d50548d513d91b9124fb5eb84e462cf9`, pointant sur le même commit que `main` |
| Archive | `bionic-mobile-v2.0.0.zip` |
| SHA-256 de l'archive selon GitHub | `a6e1ec1e9643d28311096c015842b97c45f62dbaadc7a4d37cdd288f06a842ed` |

Le fil **« Coordonner les conversations par fil »**, `01a164ff-1267-7cf0-866f-245b7fbd5b07`, a été relu. Il est terminé et rapporte merge, publication et contrôles du ZIP/autoupdate. L'API GitHub confirme la release et l'égalité du commit cible du tag avec celui de `main`.

Les [vérifications CI de cette révision](https://github.com/Shaft1942/bionic_local_server/actions/runs/39847901887) sont terminées avec succès. La [première publication](https://github.com/Shaft1942/bionic_local_server/actions/runs/39847900801) a réussi ; un second lancement est en échec, le fil d'intégration indiquant que la release existait déjà. Les pièces jointes sont présentes. Aucune nouvelle exécution des tests ou de l'archive n'est revendiquée par ce relevé.

## Ce qui existe déjà pour les images

La lecture des sources à ce commit confirme :

- Deux profils : Krea 2 Turbo et HassakuXL Illustrious v34 ; deux LoRA par profil, catalogue réel et intensités de −2 à 20.
- Jobs persistés, propriétaires projet/chat/message, paramètres figés à l'envoi, reprise du suivi et état inconnu sans resoumission automatique.
- Copie locale contrôlée de l'image, empreinte, affichage/téléchargement authentifiés, prompt/seed/dimensions/LoRA visibles.
- Outils conversationnels `generate_comfy_image` et alias historique ; paramètres accessibles et diagnostic sans rendu.

Sources : [service images](https://github.com/Shaft1942/bionic_local_server/blob/f47adbf44c863438aa2289bf676e7ac1f1ab054a/lib/comfy-images.mjs), [LoRA](https://github.com/Shaft1942/bionic_local_server/blob/f47adbf44c863438aa2289bf676e7ac1f1ab054a/lib/comfy-loras.mjs), [outils](https://github.com/Shaft1942/bionic_local_server/blob/f47adbf44c863438aa2289bf676e7ac1f1ab054a/lib/agent-tools.mjs), [cartes et suivi](https://github.com/Shaft1942/bionic_local_server/blob/f47adbf44c863438aa2289bf676e7ac1f1ab054a/public/comfy-images.js).

Le delta recherché est donc : service images neutre et adaptateurs, un second moteur qualifié, préparation du prompt adaptée à la recette, entrées de contrôle typées, génération directe, diagnostics matériels et parcours utilisateur simplifié. Les graphes, LoRA et jobs ne sont pas des fonctions à reconstruire depuis zéro.

## Écarts importants avec le dossier local

Le dossier principal est sur `feature/compagnon-v2`, avec HEAD `d252cda31628f0ca0af38df5a9167977410791b4` et de nombreux changements non commités. Son package déclare 2.1.3. Ce numéro local n'implique pas que son contenu soit plus complet que la release 2.0.0.

Une comparaison Git de la révision publiée avec les fichiers de travail a notamment trouvé :

| Élément de `main` à conserver | Observation |
| --- | --- |
| Garde d'autoupdate | `server.mjs:96` inclut les jobs ComfyUI actifs. Ce terme est absent du fichier de travail local. |
| Réglage des tokens | Curseur synchronisé et validation manuelle jusqu'à 5 000 000 tokens, avec plafond effectif toujours limité par le contexte. Le dossier local examiné ne possède pas ce parcours complet. |
| Installation Windows | Nom de script de pare-feu corrigé dans `Installer.ps1`, plutôt qu'un chemin accentué ne correspondant pas au fichier livré. |
| Installateur de mise à jour | Reprise bornée des renommages Windows et ajustements de redémarrage présents dans les sources publiées. |
| Tests de régression | Des cas supplémentaires sur LoRA, réglages, installation et autoupdate figurent sur `main`. |

Références : [garde des travaux](https://github.com/Shaft1942/bionic_local_server/blob/f47adbf44c863438aa2289bf676e7ac1f1ab054a/server.mjs#L95), [préférences](https://github.com/Shaft1942/bionic_local_server/blob/f47adbf44c863438aa2289bf676e7ac1f1ab054a/lib/model-preferences.mjs), [interface](https://github.com/Shaft1942/bionic_local_server/blob/f47adbf44c863438aa2289bf676e7ac1f1ab054a/public/index.html#L140), [installateur](https://github.com/Shaft1942/bionic_local_server/blob/f47adbf44c863438aa2289bf676e7ac1f1ab054a/Installer.ps1), [autoupdate](https://github.com/Shaft1942/bionic_local_server/blob/f47adbf44c863438aa2289bf676e7ac1f1ab054a/lib/update-installer.mjs).

Les modules images centraux et les deux graphes comparés correspondent déjà aux sources publiées. Les différences identifiées ne justifient donc ni une réécriture de l'intégration ComfyUI ni une réapplication brute de tous les fichiers locaux.

## Règle de reprise du développement

1. Avant de commencer l'implémentation, revérifier `main`, le tag et la dernière release ; si une autre publication est intervenue, actualiser ce relevé et relire les écarts pertinents.
2. Partir d'un espace de travail dédié fondé sur la référence publiée retenue ; préserver le dossier partagé en cours. Ne pas effectuer de reset/checkout destructif pour « revenir à main ».
3. Reporter les documents exploratoires et les choix utilisateur explicitement. Tout autre changement local doit être examiné comme un delta, pas considéré comme acquis.
4. Préserver garde de mise à jour, curseur/budgets, installation, tests et compatibilité des données dès la première modification images.
5. Limiter la première livraison aux images multi-moteurs ; l'indépendance complète de Bionic reste un chantier compatible mais séparé.

L'étude et la roadmap corrigées se trouvent dans [Images locales](exploration-moteurs-images-locaux.md) et le [plan général](plan-independance-multi-moteurs.md). Aucun changement de branche, merge, push, déploiement ou modification du code exécutable n'a été effectué pour ce recalage.
