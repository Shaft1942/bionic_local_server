# Bionic Mobile : exploration des prochaines fonctionnalités

**Recherche du 20 octobre 2026 — Europe/Paris.** Trois agents ont exploré indépendamment les usages mobiles, le travail sur les fichiers et les modèles locaux. Leurs 24 concepts ont été regroupés avec les pistes précédentes en **20 propositions priorisées**. Certaines approfondissent une idée antérieure ; ce ne sont pas vingt inventions inédites.

**Statut : propositions, pas fonctions ajoutées.** Cette exploration ne modifie pas l’application. Elle se fonde sur les sources de la branche locale `feat/conversations-paralleles`, version 1.6.0 en préparation, et sur des documents Web primaires consultés à cette date. Elle ne permet pas de déduire quelle version tourne dans un navigateur ouvert.

Les [méta-prompts réutilisables et le bilan d’exécution](metaprompts-exploration.md) décrivent la méthode. Aucun entretien utilisateur ni essai des fonctions proposées avec un modèle réel n’a été réalisé. Les priorités et efforts sont nos appréciations, à valider par des essais concrets.

## Le point de départ réel

| État dans la branche analysée | Fonctions |
| --- | --- |
| Déjà développées et testées en 1.6.0 | Rédaction pendant une réponse, file par conversation, chats parallèles, brouillons et pièces jointes séparés, retrait d’une attente, reprise après reconnexion. Ce ne sont plus des nouveautés à proposer. |
| Déjà présentes, à enrichir | Journal d’actions de fichiers, sauvegardes et restauration ; sélection d’extraits ; effort selon le modèle ; instances chargées ; statistiques disponibles ; imports et téléchargements. |
| Absentes ou partielles | Vue des résultats non lus, étagère de livrables, différences avant/après, recettes structurées, permissions limitées à une mission, provenance des affirmations. Le contexte réellement transmis n’a pas de reçu complet. |
| Non observées par le compagnon | Mémoire GPU réellement libre, activité de tous les clients Bionic, qualité effective de chaque modèle, présence de toutes les nouvelles API documentées chez LM Studio. |

Les conversations web et outils de fichiers du compagnon restent distincts des conversations natives Bionic. Une documentation LM Studio peut inspirer une fonction ; sa compatibilité avec Bionic doit être vérifiée avant implémentation.

## Ce que la recherche conseille pour cette application

1. **Montrer des faits observables.** Une explication séduisante peut faire trop confiance à l’IA. Présenter fichiers effectivement lus, actions confirmées et limites connues est ici plus utile qu’un badge « confiance 95 % ». Le principe vient de [Microsoft HAX](https://www.microsoft.com/en-us/haxtoolkit/guideline/make-clear-why-the-system-did-what-it-did/) ; le choix de ces preuves est notre adaptation.
2. **Garder une correction facile et un contrôle proportionné.** Les choix importants doivent être compréhensibles et réversibles. Pour Bionic Mobile : préparer une recette ou une mission sans l’envoyer automatiquement, puis vérifier son résultat. [Google PAIR — Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/).
3. **Séparer résultat, conversation et fichier.** Un livrable retrouvable peut avoir un lien vers son chat et sa version de fichier. Des ressources autonomes sont documentées chez [VS Code](https://code.visualstudio.com/docs/agents/run/artifacts) et [Claude](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) ; notre étagère légère est une proposition pour le compagnon.
4. **Transformer les répétitions en entrées explicites.** Des modèles de prompts avec champs évitent de réécrire une demande complexe. [Open WebUI](https://docs.openwebui.com/features/workspace/prompts/) fournit ce précédent ; une recette Bionic devrait garder un aperçu avant envoi et des fichiers choisis au lancement.
5. **Annoncer les changements sans voler la lecture.** Signaler une fin de tâche sans ouvrir de force un autre chat et annoncer les phases utiles, pas chaque token. Le principe d’accessibilité vient du [W3C, statuts sans prise de focus](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
6. **Nommer précisément l’incertitude réseau.** Une absence de confirmation n’est pas une preuve de non-réception. Proposer une récupération concrète plutôt que conclure sans preuve que le PC dort. [Google PAIR — Errors + Graceful Failure](https://pair.withgoogle.com/guidebook-v2/chapter/errors-failing/).

Ce sont des recommandations de recherche et des exemples de produits, pas une liste universelle de composants à recopier. Notre critère : l’utilisateur doit pouvoir retrouver, comprendre ou corriger son travail depuis son téléphone avec moins de manipulations.

## Les vingt pistes

**P1** : valeur proche des besoins déjà exprimés. **P2** : à expérimenter ensuite. Effort relatif au compagnon actuel, sans estimation de délai ni promesse de performance. Tous les intitulés ci-dessous désignent des propositions.

### Retrouver et vérifier le travail

| Nº / priorité | Proposition et usage concret | Premier périmètre utile | Effort / limite importante |
| --- | --- | --- | --- |
| 1 · P1 | **Contexte utilisé** : comprendre ce que le modèle a reçu pour cette réponse. | Pièces jointes, extraits réellement lus, historique limité et origine de chaque entrée. | Moyen. Distinguer préparation provisoire et contenu final ; aucun compteur exact de tokens inventé. |
| 2 · P1 | **Revue des changements** : voir ce qui a changé dans les fichiers. | Liste issue des actions confirmées, comparaison avant/après et restauration de la version disponible. | Moyen à fort. Une restauration refuse d’écraser une version plus récente ; création et remplacement restent distincts. |
| 3 · P1 | **Depuis votre départ** : retrouver les réponses terminées pendant une absence. | États terminés/interrompus/non lus, accès au message exact, position de lecture conservée. | Moyen. Pas de résumé généré nécessaire ; « affiché » ne signifie pas « lu ». |
| 4 · P1 | **Étagère de livrables** : retrouver une note ou un tableau sans relire tout le chat. | Épingler une réponse ou un fichier réel, le nommer, l’ouvrir et le télécharger. | Moyen. Distinguer copie figée et fichier vivant ; commencer par texte, Markdown et CSV. |

### Préparer des demandes plus précises

| Nº / priorité | Proposition et usage concret | Premier périmètre utile | Effort / limite importante |
| --- | --- | --- | --- |
| 5 · P1 | **Recettes à remplir** : « comparer ces deux documents », « extraire une liste », « préparer une note ». | Quelques champs, sources choisies, format de sortie et aperçu du prompt avant envoi. | Moyen. Ni pièce jointe d’une ancienne exécution ni permission d’écriture héritée en silence. |
| 6 · P1 | **Mission bornée** : « lire ce dossier, modifier seulement ce fichier ». | Droits de lecture/écriture par mission, chemins choisis et récapitulatif près de l’envoi. | Moyen à fort. Les refus doivent être imposés par le serveur, pas seulement par une phrase du prompt. |
| 7 · P1 | **Mes réglages favoris** : retrouver son modèle et son effort habituels. | Profils créés par l’utilisateur, valeurs visibles, modifiables et sans envoi automatique. | Faible. Signaler un modèle disparu ; un effort réduit ne garantit pas une réponse plus courte ou meilleure. |
| 8 · P1 | **Compatibilité de la demande** : repérer image, outils ou effort inconnus pour le modèle choisi. | Trois états : annoncé, non pris en charge, inconnu ; conserver le brouillon lors du changement de modèle. | Moyen. Une capacité annoncée par l’API ne prouve pas sa fiabilité sur la tâche. |
| 9 · P1 | **Sas d’import** : choisir ce qui entre dans le projet et ce qui sera joint au modèle. | Aperçu du lot, noms/destination, choix importer/joindre, confirmation puis reçu. | Moyen. Définir la durée d’une éventuelle zone temporaire ; ne pas laisser croire qu’un import est éphémère. |
| 10 · P1 | **Diagnostic partageable** : aider un ami dont la page ne répond pas. | Tests à la demande des deux liaisons, rapport limité à des champs autorisés, aperçu avant copie. | Faible à moyen. Exclure conversations, codes, chemins et IP par défaut ; aucune transmission externe automatique. |

### Produire, réviser et réutiliser

| Nº / priorité | Proposition et usage concret | Premier périmètre utile | Effort / limite importante |
| --- | --- | --- | --- |
| 11 · P2 | **Sources liées à leur version** : ouvrir le passage qui a servi à une affirmation. | Identifiants d’extraits effectivement lus, chemin, empreinte et indication de modification ultérieure. | Moyen à fort. Une citation valide ne garantit pas que l’affirmation est vraie ; aucun badge de vérité automatique. |
| 12 · P2 | **Corriger un passage** : sélectionner une phrase du résultat et dicter sa modification. | Citation exacte ou sélection de fichier dans un brouillon, avec lien et version de la source. | Faible à moyen. Détecter une version périmée et les occurrences ambiguës ; ne pas envoyer au simple tap. |
| 13 · P2 | **Structure du résultat contrôlée** : « CSV à six colonnes » ou « JSON lisible ». | Règles déterministes choisies avant envoi, appliquées au fichier effectivement enregistré. | Moyen. Contrôler la forme ne certifie pas le fond ; pas d’exécution de code arbitraire. |
| 14 · P2 | **Mettre à jour un livrable** : reprendre une synthèse quand ses sources ont changé. | Liens explicites avec quelques sources, détection de leurs empreintes à l’ouverture, demande préremplie. | Fort. Pas de surveillance permanente ni de mise à jour automatique ; ne pas afficher « projet à jour ». |
| 15 · P2 | **Carnet de projet choisi** : réutiliser quelques consignes et décisions validées. | Fiches que l’utilisateur épingle, inclusion visible et budget limité au prochain message. | Moyen. Aucune mémorisation silencieuse ni lecture intégrale du projet par défaut. |

### Mieux vivre le téléphone et le PC local

| Nº / priorité | Proposition et usage concret | Premier périmètre utile | Effort / limite importante |
| --- | --- | --- | --- |
| 16 · P1 | **Sommaire et recherche dans un long fil** : rejoindre une recommandation sans dix balayages. | Titres Markdown existants, ancres, recherche textuelle et retour à la position lue. | Faible à moyen. Ne pas inventer la structure des réponses ; garder une lecture calme pendant le streaming. |
| 17 · P1 | **Brouillon sans connexion** : finir sa saisie après une coupure Wi-Fi. | Texte conservé sur l’appareil, copie/export possible, statut reçu/non confirmé explicite. | Moyen. Ne promet pas une ouverture à froid hors connexion ; rapprochement par identifiant avant un renvoi incertain. |
| 18 · P2 | **Paquet à emporter** : consulter certains résultats quand on quitte la maison. | Téléchargement choisi d’une réponse et de fichiers ; copie datée clairement identifiée. | Faible à moyen. Aucune synchronisation hors connexion ; les téléchargements sortent du contrôle d’accès de l’application. |
| 19 · P2 | **Mode PC partagé** : ne pas multiplier les nouvelles générations pendant un autre travail. | Limite globale volontaire du compagnon, attente équitable entre chats et pause des prochains départs. | Moyen à fort. Ne contrôle ni ComfyUI ni les autres clients Bionic et ne réserve pas de VRAM. |
| 20 · P2 | **Photo ciblée pour le modèle** : cadrer le détail utile avant de joindre une grande image. | Recadrage/réduction avec aperçu de la copie et taille affichée ; original séparé. | Moyen. Vérifier orientation et lisibilité ; ne pas promettre gain de calcul ou retrait des métadonnées sans mesure. |

Les idées 3/16/17/18 viennent surtout de l’exploration mobile, 4/5/6/9/11/12/13/14 de l’exploration fichiers et 7/8/10/19/20 de l’exploration modèles locaux. Le contexte, la revue des changements et le carnet prolongent les pistes antérieures. Les convergences, notamment les livrables, ont été fusionnées.

## Six fiches concrètes pour choisir la suite

### A. Depuis votre départ — retrouver les fins de tâches

**Scénario.** Une analyse se termine et un autre chat s’interrompt pendant que le téléphone est verrouillé. Au retour, « 1 réponse terminée · 1 demande interrompue » mène aux bons messages sans changer la conversation ouverte.

**Premier essai :** conserver un repère de consultation par appareil, présenter les transitions serveur et proposer « Reprendre ma lecture ». Aucun résumé du modèle n’est nécessaire.

**Test de réussite :** trois chats terminent dans un ordre différent ; seul le message explicitement consulté perd son indicateur. Le lecteur d’écran reçoit un statut bref sans déplacement du focus. Le périmètre « cet appareil » reste visible tant qu’aucune synchronisation n’est prévue.

**Origine :** notre proposition appliquant les recommandations W3C sur les statuts. C’est une évolution des non-lus, pas un système de notifications externes.

### B. Étagère de livrables — le résultat devient un objet

**Scénario.** Après une longue conversation, on conserve « Note de synthèse » et « Tableau des options ». Demain, on les retrouve dans le projet avec leur origine et leur version, sans chercher le dernier message utile.

**Premier essai :** action manuelle « Conserver comme livrable », titre éditable, lien au chat et aux fichiers issus d’actions confirmées. Commencer par Markdown, texte et CSV ; la génération native de Word/PDF demanderait des outils supplémentaires.

**Test de réussite :** une création échouée n’apparaît jamais comme fichier disponible. Si le fichier change sur le PC, la carte signale que sa version diffère de la copie conservée. Le téléchargement respecte les mêmes contrôles de chemin que l’explorateur actuel.

**Origine :** inspiration des artefacts documentés dans VS Code et Claude ; le classement léger par projet est notre adaptation. Ne pas exécuter du HTML généré dans l’origine authentifiée du compagnon.

### C. Contexte utilisé — un reçu de ce qui a été transmis

**Scénario.** Une réponse mentionne un document inattendu. Sous le message, « 2 pièces jointes · 3 extraits lus » permet d’ouvrir les entrées réelles et de voir qu’une partie de l’ancien historique a été écartée.

**Premier essai :** enregistrer des références bornées aux entrées construites et aux lectures d’outils ; afficher leur provenance. La liste finale d’un message en attente n’est connue qu’à son démarrage.

**Test de réussite :** une conversation générale sans fichier n’affiche aucun fichier « lu ». Un extrait tronqué est signalé et aucun pourcentage de contexte exact n’est déduit des caractères. Les informations servent à comprendre les entrées, pas à prétendre révéler le raisonnement interne.

**Origine :** notre proposition appliquant PAIR et HAX ; les distinctions entre collection documentaire et contexte sélectionné ont un précédent dans Open WebUI.

### D. Recettes à remplir — moins de saisie, des entrées choisies

**Scénario.** « Comparer deux documents » demande deux fichiers et les points importants. L’utilisateur prévisualise ensuite une demande complète au lieu de recopier ses anciennes instructions.

**Premier essai :** trois recettes locales : synthèse, comparaison, liste vers CSV. Champs requis, format voulu et sources visibles ; création d’un brouillon puis envoi explicite.

**Test de réussite :** une entrée obligatoire absente bloque l’envoi. Une recette créée dans un autre projet ne joint aucun de ses anciens fichiers. Une modification du texte de la recette est visible et ne change pas une demande déjà acceptée.

**Origine :** Open WebUI documente des prompts réutilisables avec formulaires. Le choix limité de recettes et leur aperçu sont notre proposition pour le téléphone.

### E. Mission bornée — une autonomie qui a un périmètre

**Scénario.** « Lis le dossier de référence, propose une note ; tu peux modifier seulement la note finale. » Une fiche rappelle les chemins et les droits avant le départ.

**Premier essai :** modes lecture et modification, listes de fichiers autorisés et éventuel dossier de création. Les autorisations sont figées à l’envoi et contrôlées lors de chaque appel d’outil.

**Test de réussite :** un outil demandant un chemin hors mission est refusé même si le modèle le réclame. Une instruction cachée dans un document n’élargit pas les droits ; changer les réglages du chat suivant ne change pas la mission acceptée.

**Origine :** les permissions de Claude Code illustrent le contrôle par outil. Elles ne sont pas une API Bionic ; la restriction serait une fonction nouvelle du serveur compagnon. Un mode « proposer avant d’appliquer » demanderait en plus un stockage des propositions et des versions.

### F. Favoris et compatibilité — des choix explicables

**Scénario.** L’utilisateur rappelle ses réglages « Analyse documentaire », puis joint une photo. L’interface garde le brouillon et indique si Vision et outils sont annoncés ou inconnus pour ce modèle.

**Premier essai :** favoris nommés par l’utilisateur et valeurs visibles, plus fiche des capacités brutes de l’API. Un favori dont le modèle manque devient indisponible, sans remplacement silencieux.

**Test de réussite :** réponses API avec capacités absentes, fausses ou valides ; aucun « inconnu » ne devient « fiable ». L’effort sélectionné reste celui envoyé, sans promesse de gain de vitesse ou de qualité.

**Origine :** métadonnées documentées chez LM Studio et principe PAIR de contrôle compréhensible ; la fiche et les favoris sont notre proposition.

## Ordre recommandé

**Premier petit lot : 3 + 4 + 1**, soit retour après absence, livrables retrouvables et contexte utilisé. Il prolonge les chats parallèles et l’usage des fichiers sans augmenter l’autonomie du modèle. Pour commencer encore plus petit : livrer seulement la liste des fins de tâches et l’épinglage manuel d’un résultat.

**Lot suivant : 5 + 7 + 8**, recettes et choix de modèles compréhensibles. Ils réduisent les manipulations et les paramètres oubliés ; le diagnostic 10 peut s’y ajouter si le partage avec d’autres utilisateurs entraîne des demandes d’aide.

**Travail plus structurant : 2 + 6**, revue des changements et missions bornées. À traiter ensemble avec les conflits entre chats et l’édition de fichiers, avant de proposer des traitements plus autonomes. Les autres fonctions restent des expériences à sélectionner selon les usages réellement observés.

Ce classement est le jugement du coordinateur. Les agents privilégiaient respectivement la reprise mobile, les livrables/recettes et les favoris/diagnostic : le premier lot combine leurs résultats avec les besoins exprimés sur le contexte et les fichiers.

## Idées à garder sous conditions, et celles à écarter

- **Préparer un modèle avant de rédiger** : intéressant uniquement après vérification du chargement explicite dans l’API Bionic. Aucun faux prompt ni maintien en vie périodique. La documentation d’événements LM Studio est une inspiration, pas un test de l’installation.
- **Comparer des modèles** : commencer par des demandes successives, identiques, sans écritures de fichiers ; les tokens/s ne sont pas une note de qualité.
- **Comprendre la durée** : distinguer attente dans la file, premier fragment et réponse finale. Sans événement approprié, ne pas répartir arbitrairement le silence entre chargement et calcul.
- **Écarter « Optimiser automatiquement mon PC »** : l’application n’observe pas toute l’activité ni la mémoire libre ; décharger d’autres instances pourrait interrompre un autre usage.
- **Écarter « Lire, classer et indexer tout mon projet » par défaut** : cela reproduirait le contexte excessif déjà signalé. Préférer sources choisies et parcours ciblés.
- **Ne pas promettre notifications et application totalement hors connexion sur le LAN HTTP actuel.** Les services workers et API de notification ont des exigences de contexte sécurisé et de compatibilité. Un téléchargement volontaire est un premier périmètre distinct et réalisable.

## Sources et limites de l’enquête

Sources primaires consultées par les agents ou le coordinateur le **20 octobre 2026**. Les pages de produits évoluent ; leur comportement ne démontre pas la compatibilité de Bionic. Les propositions et critères de tests ci-dessus sont les nôtres.

| Source | Ce qu’elle étaye ici |
| --- | --- |
| [Microsoft HAX — Explications](https://www.microsoft.com/en-us/haxtoolkit/guideline/make-clear-why-the-system-did-what-it-did/) | Explications adaptées, avec attention au risque de confiance excessive. |
| [Google PAIR — Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/) | Équilibre entre contrôle et automatisation ; effets du feedback à expliquer. Un avis ne réentraîne pas à lui seul le modèle local. |
| [Google PAIR — Errors + Graceful Failure](https://pair.withgoogle.com/guidebook-v2/chapter/errors-failing/) | Reprise compréhensible après erreur. |
| [Google PAIR — Explainability + Trust](https://pair.withgoogle.com/guidebook-v2/chapter/explainability-trust/) | Capacités, limites et confiance ajustée à ce que le système peut faire. |
| [W3C — Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | Statuts accessibles sans prise de focus. |
| [W3C — Headings and Labels](https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html) | Titres descriptifs pour s’orienter ; ne prescrit pas notre sommaire. |
| [W3C — Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Lecture à 320 pixels CSS avec exceptions pour certains contenus. |
| [W3C — Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Minimum généralement de 24 × 24 pixels CSS avec exceptions ; viser 44 × 44 pour le confort est notre choix, pas ce minimum AA. |
| [Open WebUI — Prompts](https://docs.openwebui.com/features/workspace/prompts/) | Prompts réutilisables, variables et formulaires. |
| [Open WebUI — Knowledge](https://docs.openwebui.com/features/workspace/knowledge/) | Travail avec des collections et du contexte documentaire sélectionné. |
| [VS Code — Artifacts](https://code.visualstudio.com/docs/agents/run/artifacts) | Ressources produites accessibles en dehors du flux de conversation. |
| [Claude — Artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) | Contenus autonomes retrouvables dans un espace dédié ; URL actuelle après redirection. |
| [Claude Code — Permissions](https://code.claude.com/docs/en/permissions) | Autorisations effectives et modes par outil ; distincts d’une consigne de prompt. |
| [LM Studio — Modèles](https://lmstudio.ai/docs/developer/rest/list) | Modèle, instances, capacités et configurations ; ne fournit pas à lui seul une mesure globale de mémoire libre. |
| [LM Studio — Streaming events](https://lmstudio.ai/docs/developer/rest/streaming-events) | Exemple de phases observables ; l’adaptateur actuel n’exploite pas automatiquement ce flux. |
| [MDN — Navigator.onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine) | Indice de connexion imparfait, pas preuve que le PC ou l’API est accessible. |
| [MDN — Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) | Exigence de contexte sécurisé pour le cache d’application par service worker. |
| [MDN — Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API) | Contraintes des notifications navigateur, distinctes des non-lus internes. |
| [MDN — createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) | Recadrage et redimensionnement côté navigateur ; compatibilité et résultat à tester. |

Pas d’entretien utilisateur, de benchmark, de validation d’une nouvelle API Bionic ou de test de ces futurs parcours pendant cette exploration. Les contraintes de confidentialité, d’authentification et de version des fichiers restent à vérifier pour chaque implémentation. Aucun service de collecte externe, surveillance permanente ou indexation générale n’est proposé par défaut.
