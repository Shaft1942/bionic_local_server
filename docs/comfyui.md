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
la fin du rendu, y compris une attente de ressource avant soumission. Une soumission
au résultat incertain termine le tour avec un message de vérification, sans nouvel
appel du modèle ni renvoi de l’image. Les erreurs de validation survenues avant la
création d’un job restent expliquées par le parcours conversationnel habituel.

Dans la 2.5, le choix mémoire du lot pilote la coordination texte/images :
**Conserver** autorise une autre conversation pendant le rendu, **Répondre entre les images**
intercale les réponses et **Décharger** attend la fin des phases texte puis décharge
les modèles texte avant le lot. Ce choix prend priorité sur le profil général de
ressources pour les images. Les compteurs et limites du coordinateur restent actifs.
Aucun mécanisme ne réserve le GPU face aux autres applications ou instances ; le
contexte Bionic reste celui confirmé par le fournisseur. Voir [la coordination 2.5](beta-2.5.md).

Pour utiliser le prompt exact sans modèle de conversation, saisir le texte puis
choisir **Outils → Générer ce prompt directement**. Ce parcours réutilise le modèle
d’image, les LoRA, les droits et le suivi des jobs. Les fichiers joints ne sont pas
utilisés ; depuis un historique Bionic, il crée une conversation web distincte.

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

Une installation neuve laisse ComfyUI et le nettoyage désactivés. Une configuration déjà enregistrée en version 1 ou 2 conserve son ancien nettoyage activé ; le passage au format 4 est enregistré au prochain changement. Un choix explicitement désactivé reste désactivé après redémarrage.

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

Dans **Outils**, régler **Images par demande** avec le curseur de **1 à 5** avant
d’envoyer le message. Une seule image garde son outil habituel ; à partir de deux,
`generate_comfy_image_series` prépare exactement le nombre choisi de descriptions
et de seeds distinctes dans un seul appel. Le compagnon valide l’ensemble avant
d’admettre le lot, même si le modèle ne respecte pas le schéma annoncé. Chaque image possède sa carte et revient
dans la conversation d'origine avec son indice et sa position dans la file.

La file est commune aux conversations de cette instance : douze images actives
au maximum, lots FIFO, une seule soumission ComfyUI en cours à la fois. Les
images d’une série restent groupées, qu’elle contienne deux, trois, quatre ou cinq images. Le nettoyage ComfyUI facultatif reste appliqué
après chaque image ; un échec du lot peut aussi demander le nettoyage. Le conserver
actif peut éviter des ralentissements de Krea 2 entre deux prompts. Garder les poids
en mémoire jusqu'à la fin du lot n'a pas amélioré les performances sur le GPU testé.
Les demandes sont enregistrées sous `data/comfy-generations` avant soumission,
puis suivies par `prompt_id`. Les images sont copiées dans ce dossier privé et
servies par une route authentifiée du compagnon, jamais par un localhost envoyé au téléphone.
Les chemins et le graphe ne sont pas choisis par le modèle.
Chaque job garde son URL, son workflow et son nœud de sortie. Les anciennes
images restent lisibles après désactivation. Attendre la fin des générations
pour changer de connexion ou de workflow.

Dans **Paramètres → Images et ComfyUI**, choisir la gestion du modèle texte :

- **Conserver le modèle texte** (valeur initiale) : les autres conversations peuvent
  répondre pendant les images. La concurrence GPU/mémoire peut ralentir le rendu.
- **Répondre entre les images** : le modèle reste chargé. Les prédictions déjà
  admises terminent avant l’image ; les réponses texte en attente passent ensuite
  entre deux images de la série. Le sampler finit son image avant de céder la place.
  Les nouvelles réponses ne dépassent pas l’image suivante déjà réservée. Les lots
  d’images restent FIFO. Une réponse longue retarde l’image suivante ; la mémoire
  du modèle texte reste occupée et aucun délai fixe n’est garanti.
- **Décharger avant les images** : le lot attend les inférences en cours, décharge
  les instances LLM chargées dans Bionic avec confirmation, puis bloque les nouvelles
  inférences de ce compagnon jusqu'à la fin du lot. Le modèle sera rechargé à la
  prochaine réponse avec les réglages Bionic existants. Ce rechargement a un coût ;
  la stratégie ne garantit pas un délai complet inférieur.

Le menu **Outils → Modèle texte pendant les images** permet de choisir le mode
pour la prochaine demande, sans ouvrir les paramètres. **Paramètres globaux**
reprend le défaut enregistré ; Conserver, Décharger et Répondre entre les images
créent une exception propre à cette demande et conservée dans la conversation.
Choisir à nouveau Paramètres globaux retire cette exception. Les brouillons
conservent leurs choix séparément.

La politique effective est figée à l’envoi du message. Le choix rapide peut servir
pour un nouveau lot pendant que d’autres attendent, sans changer leur politique.
Modifier les réglages globaux exige une file vide. Cette coordination ne couvre pas une autre instance ou une autre application.

Un délai expiré ou un redémarrage pendant la soumission donne un état inconnu,
sans répétition automatique du POST. La file suspend les nouvelles images. Après
vérification des sorties de ComfyUI, **Reprendre la file après vérification** exige
une file moteur vide, clôt les soumissions incertaines sans les rejouer et reprend
uniquement les lots encore admis en mémoire. Les jobs déjà connus sont suivis après
redémarrage ; les images encore locales sont marquées interrompues, sans rejeu.
Le verrou des anciens jobs distants est rétabli. Arrêter la réponse du modèle
n'interrompt pas globalement les travaux ComfyUI ni un lot déjà enregistré.

Pour les clients API, `POST /api/chat` accepte `imageCount`, entier de 1 à 5 (défaut 1), avec
`imageAccess: true`. Pour 2–5 images, seul l’outil de série est proposé avec un
schéma de longueur exacte ; ses arguments
sont `{images: [{prompt, seed, format?}, ...]}` (exactement le nombre choisi).
L'action renvoie `imageGenerations`, et chaque job ajoute `seriesId`, `seriesIndex`,
`seriesTotal`, `queuePosition`, `queuedLocally` et `modelPolicy`.
`imageModelPolicy: "keep" | "alternate" | "unload"` peut surcharger le défaut pour
ce message ; absent ou null revient aux paramètres globaux. Le champ conservé
dans le chat et annoncé au start représente cette exception, enum ou null ; le
job porte la politique effective capturée. Le suivi et les
images conservent leurs routes authentifiées et leurs propriétaires projet/chat/message.
`POST /api/comfy/settings` accepte `modelPolicy: "keep" | "alternate" | "unload"` ; les anciens
réglages migrent vers `keep`. `POST /api/comfy/queue/resume` reçoit `{}` et ne resoumet
jamais un job incertain. Les limites et erreurs sont distinctes d'une réussite image.

Les réponses texte terminées conservent les mesures du moteur et ajoutent
`metrics.totalSeconds` depuis l’enregistrement de la demande (file, chargement,
calcul et outils inclus), ainsi que `metrics.queueSeconds` pour l’attente initiale
dans le chat et les admissions modèle. Cette dernière mesure exclut le chargement
du modèle et les accords humains. La durée affichée privilégie `totalSeconds`, avec
repli sur `responseSeconds` pour les anciens messages. Les cartes images montrent
la durée d’exécution ComfyUI lorsqu’elle est connue, distincte de leur attente.

Cette fonction est indépendante des outils fichiers, Internet et scripts ; elle
n’affaiblit pas leurs validations. Les conversations natives Bionic restent en
lecture seule. La cohabitation mémoire et la durée de génération dépendent des
modèles chargés dans Bionic et de l’offload ComfyUI.

## Galerie, annulation et relance — beta2

**Annuler l’attente** retire une image encore locale, sans `prompt_id`. Les autres
images du lot continuent. Dès que l’envoi à ComfyUI commence, ce bouton disparaît :
aucune interruption globale du moteur n’est envoyée. Un état annulé reste conservé
après redémarrage et un second clic ne relance rien.

**Relancer** crée une nouvelle image, dans un nouveau message du chat source, avec
le même prompt, format, workflow, LoRA, nettoyage mémoire et choix de modèle texte.
On choisit une graine identique ou une nouvelle graine distincte. L’original reste
disponible. Une image active ou dont la soumission est incertaine ne se relance pas.
Un changement d’adresse du moteur ou de contenu du workflow depuis l’original
demande une nouvelle génération ordinaire ; la recette ne change pas silencieusement.

La galerie permet de télécharger les images disponibles d’une série en ZIP.
**Livrables → Génération** rassemble automatiquement les copies privées des images
réussies dans toutes les conversations du projet. Les pages suivantes se chargent
explicitement ; les copies restent accessibles après suppression du chat source.
Le téléchargement sélectionné accepte 1 à 20 images, au maximum 32 Mio par image
et 128 Mio par archive. Le ZIP conserve les PNG et ajoute un manifeste avec les
prompts, graines, modèle, LoRA et empreintes SHA-256 ; aucun chemin privé ni adresse
de moteur n’est ajouté au manifeste. Il ne relance aucune image.

Routes authentifiées :

- `POST /api/comfy/generation/cancel` : `{projectId,chatId,messageId,jobId}` ; renvoie le job annulé, ou 409 si l’envoi a déjà commencé.
- `POST /api/comfy/generation/retry` : mêmes propriétaires, `seedMode: "same" | "new"` et `requestId` UUID stable ; renvoie `{job,chatId,messageId,message}`. Répéter cet identifiant retourne le même job. Une relance interrompue avant son reçu n’est jamais rejouée automatiquement.
- `GET /api/comfy/generations?projectId=…&cursor=…` : `{images,total,nextCursor}`, 200 images maximum par page ; chaque DTO porte son propriétaire pour retrouver la source.
- `GET /api/comfy/generation-image?projectId=…&jobId=…` : PNG conservé, vérifié par SHA-256 ; `download=1` déclenche le téléchargement.
- `GET /api/comfy/images.zip?projectId=…&jobId=…&jobId=…` : ZIP des seules images sélectionnées et réussies. Tous les propriétaires sont vérifiés avant lecture ; une entrée d’un autre projet refuse l’ensemble.

Un rendu Krea2 1024 × 1024 piloté par Gemma a réussi pendant la validation V2.
Voir `docs/history/v2-live-proof.json`. Les ajouts LoRA réunis dans la release 2.0.0 ont été testés avec
des rendus HassakuXL et Krea2 avec LoRA depuis des prompts du compagnon ; voir
`docs/v2-validation.md`. Le workflow mixte reste expérimental et non validé.
