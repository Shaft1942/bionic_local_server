# Images ComfyUI

[Utilisation](utilisation.md) · [Serveurs sur le PC](local-services.md) · [Configuration](configuration.md)

Le compagnon utilise une instance ComfyUI séparée, avec les profils **Krea 2 Turbo** et **Hassaku XL Illustrious** fournis. Les poids, licences et nœuds requis restent à installer dans ComfyUI. Aucun modèle n’est téléchargé automatiquement.

## Configurer ComfyUI

Dans **Paramètres → Images et ComfyUI** :

1. Démarrez ComfyUI, puis **Rechercher le serveur** ou saisissez son adresse. La recherche consulte seulement l’adresse indiquée et les ports 8188/8000 du PC ; elle ne parcourt pas le réseau.
2. Choisissez le modèle d’image, puis **Tester la connexion et les modèles**. Le diagnostic distingue serveur, fichiers attendus et nœuds. Il ne génère rien et n’enregistre pas la saisie. Les noms relatifs attendus dans le catalogue ComfyUI doivent correspondre au profil.
3. Choisissez la gestion du modèle texte et le nettoyage ComfyUI, activez le service et enregistrez.

L’adresse initiale est `http://127.0.0.1:8188`. Les URL HTTP de boucle locale ou IPv4 privées sont acceptées, sans identifiants, chemin ou redirection. Une installation neuve laisse ComfyUI et son nettoyage désactivés. Les préférences enregistrées dans l’interface prennent ensuite le pas sur l’initialisation de `config.local.json` ; elles sont privées dans `data/comfy-settings.json`.

Les profils de production se trouvent dans `workflows/` : Krea 2 Turbo utilise 8 étapes et CFG 1 ; Hassaku XL Illustrious v34 utilise 25 étapes et CFG 6. Ce sont des recettes fixes, pas un éditeur de workflow. Les formats proposés sont carré 1024 × 1024, portrait 832 × 1216 et paysage 1216 × 832.

## Annonce et état du rendu

Une annonce du modèle (« Running », « je lance l'image ») ne constitue pas un reçu ComfyUI. Pour une commande explicite telle que « Génère l'image », si le modèle répond sans outil, le compagnon lui demande une seule fois un appel image structuré, avec le nombre d'images choisi. Aucun workflow n'est soumis à partir du texte libre de cette annonce. Si le modèle ignore encore l'appel, le tour se termine avec une erreur et aucune génération n'est annoncée.

Le texte des tours avec images est vérifié avant affichage ; les annonces accompagnant un appel image sont remplacées par le reçu du service. Un refus de soumission est affiché directement. Les cartes suivent les jobs appartenant à cette conversation : attente locale, envoi, file ComfyUI, exécution, image disponible ou échec. Si le suivi devient inaccessible, la carte affiche un état incertain et poursuit ses consultations, sans nouvel envoi. Un job absent de la file et de son historique après une seconde vérification passe en état inconnu ; la file locale est suspendue pour éviter les doublons.

## Demander une ou plusieurs images

Dans **Outils**, activez **Générer des images avec ComfyUI**, choisissez le **Modèle d’image** puis **Images par demande**, de **1 à 5**. Envoyez votre demande à un modèle de conversation capable d’appeler des outils. Pour 2 à 5 images, le modèle doit préparer exactement ce nombre de prompts et de graines distinctes ; le compagnon valide le lot avant de l’admettre.

Les cartes indiquent l’état de chaque image et sa position. Le suivi continue sur le PC lorsque vous fermez le navigateur. Les lots de cette installation sont traités dans l’ordre d’arrivée, sans mélange entre séries ; douze images au maximum peuvent être actives ou en attente, avec une seule soumission ComfyUI à la fois.

Pour utiliser votre texte exact sans préparation par un modèle de conversation, choisissez **Outils → Générer ce prompt directement**. Ce parcours produit **une image**, utilise le profil choisi et les réglages globaux de génération ; les fichiers joints et le curseur de quantité ne sont pas utilisés. Depuis un historique Bionic, il crée une suite web distincte.

Une image réussie est copiée dans les données privées du compagnon et devient téléchargeable depuis l’appareil. Les historiques natifs Bionic ne sont pas modifiés. La langue de l’interface ne traduit pas les prompts ; choisissez leur langue selon le modèle d’image et vos besoins.

## Modèle texte pendant les images

Le défaut se règle dans **Paramètres → Images et ComfyUI**. Pour une demande conversationnelle, **Outils → Modèle texte pendant les images** peut créer une exception ; **Paramètres globaux** la retire. Le choix est figé à l’envoi et ne change pas les lots déjà acceptés.

| Choix | Effet |
| --- | --- |
| **Conserver le modèle texte** (`keep`, défaut) | Permet aux autres conversations de répondre pendant le rendu. Le partage de mémoire ou de GPU peut ralentir les travaux. |
| **Répondre entre les images** (`alternate`) | Garde le modèle chargé et laisse passer les réponses en attente entre deux images. Une image commencée finit avant de céder la place ; une réponse longue retarde la suivante. |
| **Décharger avant les images** (`unload`) | Attend les inférences en cours, décharge les instances texte Bionic avec confirmation puis bloque les nouvelles inférences du compagnon pendant le lot. Le prochain message peut recharger le modèle avec les réglages Bionic. |

Le choix image pilote la coordination avec les phases texte ; les plafonds d’admission restent actifs. Il ne réserve pas le GPU face à d’autres applications ou clients Bionic. Aucun mode ne garantit un temps total plus court. Les réglages globaux de génération ne peuvent pas être modifiés avec une file active.

## LoRA

Chaque profil possède deux emplacements LoRA facultatifs. **Actualiser les LoRA** relit le catalogue de ComfyUI. Une présence dans la liste ne prouve pas la compatibilité : utilisez des LoRA adaptés à Hassaku/Illustrious ou à Krea 2.

La force va de **−2 à 20**, par pas de **0,05** ; zéro désactive l’emplacement. Aucun LoRA n’est sélectionné au départ. Les profils se règlent séparément et sont figés lors de l’envoi. Hassaku applique la force au modèle et au CLIP ; Krea utilise le chargeur modèle seul.

## Nettoyage mémoire facultatif

**Libérer les modèles ComfyUI après chaque image** est indépendant du modèle texte Bionic. Le nettoyage demande une libération **après** le workflow ; ce n’est pas un déchargement systématique avant chaque prompt. Il peut rendre de la mémoire, au prix d’un rechargement au rendu suivant, sans garantie de gain.

- **Désactivé** : aucun module supplémentaire n’est requis ; ComfyUI conserve sa gestion mémoire normale.
- **Activé** : le nœud `FreeMemoryAfterWorkflow` fourni doit être installé dans l’instance utilisée, avec un `SaveImage` compatible. Le diagnostic explique les manques. En cas d’incompatibilité, désactivez le nettoyage pour utiliser le profil standard.

Le bouton de téléchargement du module est authentifié. Copiez `free_memory_after_workflow.py` dans `custom_nodes/` de ComfyUI puis, après la fin des travaux, redémarrez cette instance. Aucun paquet Python supplémentaire n’est requis. Copier le fichier dans le seul compagnon ne l’installe pas dans ComfyUI.

Le choix est conservé avec chaque image. Après un échec terminal connu, la récupération mémoire peut être demandée seulement si cette option était active et si la file moteur est observée vide. Le compagnon n’utilise pas d’interruption globale pour cela.

## Galerie, annulation et relance

**Annuler cette image** retire uniquement une image encore dans la file locale, avant soumission au moteur. Les autres images du lot continuent. Après le début de l’envoi, cette commande n’interrompt pas le moteur. **Arrêter** la réponse texte n’annule pas un lot déjà enregistré.

**Relancer** crée une nouvelle image dans le chat source avec la même recette : prompt, format, profil, LoRA, nettoyage et politique texte. Choisissez la même graine ou une nouvelle graine. L’original reste disponible. Une image active ou incertaine ne se relance pas ; un changement d’adresse moteur ou de contenu du workflow demande une nouvelle génération ordinaire.

La galerie propose le ZIP des images disponibles d’une série. **Livrables → Génération** regroupe les copies réussies du projet, même après suppression du chat source. Le téléchargement sélectionné accepte **1 à 20 images**, au plus **32 Mio par image** et **128 Mio par archive**. Le ZIP conserve les PNG et ajoute un manifeste des prompts, graines, profils, LoRA et empreintes SHA-256. Il ne relance aucun rendu.

## File suspendue ou soumission incertaine

Un délai expiré ou un redémarrage pendant la soumission peut laisser le résultat **inconnu**. Le compagnon ne répète pas automatiquement le POST et suspend les nouvelles images.

Vérifiez d’abord les sorties et travaux dans ComfyUI. **Reprendre la file après vérification** exige une file moteur vide, clôt les soumissions incertaines sans les rejouer et reprend seulement les lots encore admis en mémoire. Après redémarrage du compagnon, les jobs distants connus restent suivis ; les images qui attendaient encore localement sont marquées interrompues. Ne renvoyez pas une demande incertaine avant cette vérification.

Pour configurer le démarrage facultatif de l’instance depuis le compagnon, voir [Serveurs sur le PC](local-services.md). Les performances et la compatibilité dépendent des versions, des modèles, du matériel et des autres usages de votre installation.
