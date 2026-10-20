# Outils des agents et branches de conversations

[Retour au README](../README.md) · [Utilisation](utilisation.md) · [Configuration](configuration.md)

Le compagnon fournit ses propres outils au modèle appelé par l’API locale Bionic. Il ne récupère pas les agents, serveurs MCP, compétences, sessions de navigateur ou permissions configurés dans l’application Bionic. Un modèle doit savoir produire des appels d’outils compatibles pour les utiliser ; sa réponse seule ne confirme jamais qu’une action a eu lieu.

## Choisir les droits d’un message

Ouvrez **Outils** près de la saisie. Les permissions sont indépendantes :

| Permission | Ce qu’elle permet | Au départ |
| --- | --- | --- |
| Gérer et modifier les fichiers du projet | Recherche ciblée, lecture, création et édition, dossiers, copie, déplacement et corbeille dans le projet | Activée dans un nouveau chat ordinaire |
| Rechercher et lire Internet | Recherche de sources et lecture de pages HTTP(S) publiques | Désactivée |
| Scripts sur le PC, avec validation | Proposition de code Python, Node.js ou PowerShell à valider individuellement | Désactivée |

Les choix sont conservés avec le chat et ses brouillons, puis **figés à l’envoi de chaque message**. Un changement ultérieur concerne les prochains messages, pas une demande déjà reçue ou mise en attente. Pour arrêter un tour actif, utilisez **Arrêter** dans ce chat. Les autres conversations restent indépendantes.

Une branche de conversation démarre toujours avec Internet et les scripts désactivés. Elle reprend le droit de fichiers d’une source web qui l’avait activé ; une branche issue d’un historique natif ne l’active pas. Vérifiez ces choix avant d’envoyer votre nouvelle demande.

## Fichiers du projet

Les outils directs de fichiers utilisent uniquement le dossier de travail du projet Bionic. Les dossiers liés et `extraRoots` restent accessibles manuellement selon leurs droits, sans devenir des racines autorisées pour ces outils. Les protections de chemins, de liens et de versions restent appliquées côté serveur.

| Action | Comportement |
| --- | --- |
| Lister ou chercher | Noms de fichiers, ou courts passages correspondants ; aucun chargement initial de toute la bibliothèque |
| Lire | Extrait ciblé, éventuellement autour d’un texte recherché |
| Inspecter | Taille et empreinte actuelle, sans lire le contenu au modèle |
| Créer un dossier ou un texte | Chemin relatif dans le projet ; une création ne remplace pas un fichier existant |
| Modifier un texte | Version lue requise, remplacement exact et unique ou réécriture après lecture complète ; copie précédente conservée |
| Copier | Fichier inspecté ou lu, destination libre, octets conservés |
| Déplacer ou renommer | Fichier inspecté ou lu, destination libre ; pas de déplacement de dossier |
| Mettre à la corbeille | Copie privée puis retrait du fichier, après contrôle de sa version ; pas de suppression définitive ni de dossier |

Les changements par ces outils sont immédiats lorsqu’ils sont autorisés pour le message. Ils n’attendent pas le bouton d’approbation réservé aux scripts. Leur résultat apparaît dans **Actions de l’agent**. Une version devenue ancienne ou une destination occupée provoque un refus ; le modèle doit adapter sa demande au résultat de l’outil.

**Restaurer le fichier**, sous une mise à la corbeille réussie, restitue sa copie au chemin d’origine, dans le même projet. La restauration est disponible après la fin de la réponse et refuse d’écraser un fichier revenu à ce chemin. Les octets et métadonnées de corbeille sont conservés dans `data/file-backups/`. Ils ne sont pas purgés automatiquement. **Rétablir la version précédente** d’une édition est une opération distincte, également soumise à un contrôle de version.

La lecture directe est limitée à six fichiers distincts par demande, avec des extraits de 3 000 caractères au maximum. Les nouveaux extraits, y compris ceux d’une recherche de contenu, partagent un budget dépendant du contexte du modèle et plafonné à 12 000 caractères. Une recherche peut inspecter davantage de fichiers sur le disque sans envoyer tout leur contenu : au plus 300 fichiers, 80 dossiers, 200 000 caractères inspectés et 20 correspondances, avec indication d’un résultat partiel. Les fichiers trop grands pour cette recherche sont ignorés et signalés.

Les opérations d’inspection, copie, déplacement et corbeille acceptent des fichiers jusqu’à 20 Mo, y compris des formats non textuels. L’édition manuelle reste limitée à 1 Mo ; une écriture du modèle est en plus limitée à 300 000 caractères. Les PDF, DOCX et XLSX ne sont pas édités dans leur format d’origine par ces outils. Pour fabriquer ou transformer un document plus complexe, le modèle peut proposer un script, soumis à l’accord décrit ci-dessous.

## Internet public

**Rechercher et lire Internet** donne au modèle deux possibilités : rechercher une expression et lire un extrait d’une URL publique. Le serveur du PC fait ces requêtes ; le navigateur du téléphone ne fournit ni compte connecté ni cookies de site au modèle.

Une recherche renvoie au plus cinq URL, avec titre et court extrait lorsqu’il est disponible. Le modèle peut ensuite lire les sources utiles. Un résultat de moteur n’est pas une page vérifiée : les liens du journal permettent de retrouver les sources effectivement obtenues. Les contenus externes restent des données non fiables, sans pouvoir d’accorder une permission de script ou de fichier.

Les moteurs disponibles sont, par priorité : SearXNG explicitement configuré, Brave si une clé privée est définie, sinon DuckDuckGo sans clé. **DuckDuckGo ne garantit pas l’accès automatisé** : CAPTCHA, refus, schéma inattendu ou absence de résultats exploitables provoquent une erreur claire. Le compagnon n’invente pas de résultat et ne change pas silencieusement de moteur. Voir [la configuration des moteurs](configuration.md#moteur-de-recherche-des-agents).

| Limite | Valeur |
| --- | --- |
| Recherche | 500 caractères maximum |
| Résultats | 5 sources, titres de 220 caractères et extraits de 400 caractères maximum |
| URL publique | HTTP ou HTTPS, ports 80 ou 443, sans identifiants intégrés, 3 000 caractères maximum après normalisation |
| Lecture | 1 500 000 octets maximum par réponse ; types texte HTML, texte brut, XML ou JSON acceptés |
| Extrait renvoyé | 4 000 caractères par défaut, 6 000 maximum ; recherche d’un passage possible |
| Redirections | 3 maximum, avec réévaluation de chaque destination |
| Délai | 15 secondes pour l’opération complète, résolution DNS et redirections comprises |
| Budget d’une demande au modèle | 8 appels web maximum, 18 000 caractères de résultats sérialisés au total |

Le lecteur n’exécute ni JavaScript ni sous-ressources HTML. Il ne navigue pas dans les comptes connectés, ne télécharge pas de fichiers binaires et ne transforme pas une page dynamique en navigateur interactif. Les réponses sont décodées en UTF-8 ; les autres encodages ne sont pas convertis. Une compression malgré la demande `identity` est refusée. Certaines pages resteront donc indisponibles même si elles s’ouvrent manuellement.

Les adresses locales, privées et spéciales IPv4/IPv6 sont refusées. Un nom qui renvoie à la fois des adresses publiques et privées est refusé entièrement. La connexion utilise une adresse déjà vérifiée, afin d’éviter une deuxième résolution différente ; les redirections repassent par ces contrôles. L’unique exception est l’endpoint SearXNG que le propriétaire configure explicitement : il peut être local, mais ne donne pas accès à d’autres pages privées. Ses redirections sont refusées.

Les mots recherchés sont transmis au fournisseur choisi et les pages demandées voient une requête issue du PC. Évitez d’inclure dans une recherche un jeton, une clé ou du contenu privé inutile. La clé Brave reste dans l’environnement du serveur et n’est pas transmise au modèle. Les résultats externes utilisés sont néanmoins conservés dans le reçu privé du chat, dans la limite de son aperçu.

## Scripts validés sur le PC

L’activation de **Scripts sur le PC, avec validation** permet seulement de proposer du code. Chaque proposition affiche son interpréteur, son dossier de départ et **son code exact**. Choisissez **Exécuter ce script** pour cette proposition précise, ou **Refuser**. Le modèle ne peut pas utiliser votre accord pour remplacer ce code par un autre, pour relancer une validation traitée ou pour autoriser automatiquement la suite.

Le code s’exécute avec **les droits de votre compte du PC**. Le dossier de travail est un dossier validé du projet, mais ce n’est pas un bac à sable : le script peut lire ou modifier ailleurs, appeler le réseau, lancer d’autres programmes et produire des changements sans copie précédente automatique. La désactivation des outils directs de fichiers ou du web ne limite pas ces capacités une fois ce script approuvé. Accordez uniquement le code que vous acceptez réellement d’exécuter.

| Limite | Valeur |
| --- | --- |
| Interpréteurs | Python, Node.js, PowerShell ; installation disponible requise |
| Code proposé | 20 000 caractères maximum |
| Propositions | 4 par demande, refus compris |
| Validation | 10 minutes, une seule décision, limitée au projet et au chat concernés |
| Durée demandée | 30 secondes par défaut, 120 secondes maximum |
| Sorties capturées | 24 000 octets au total pour stdout et stderr |
| Sorties envoyées au modèle | 4 000 caractères de stdout et 2 000 de stderr maximum, troncature indiquée |

Python utilise le réglage `python` ou `BIONIC_MOBILE_PYTHON`. Node.js utilise l’interpréteur du serveur. PowerShell utilise Windows PowerShell sous Windows, ou `pwsh` s’il est disponible ailleurs. Une absence d’interpréteur est une erreur explicite, pas une exécution réussie.

Le compagnon demande l’arrêt au délai, à l’excès de sortie ou à l’arrêt explicite du tour. **Une erreur, un arrêt ou une sortie tronquée n’annule pas les changements déjà effectués.** Le contrôle du processus n’est pas une isolation de sécurité ; il ne rend pas un code arbitraire réversible. Vérifiez les fichiers si une exécution finit en erreur ou est constatée interrompue après un redémarrage.

Si vous fermez le navigateur avant de décider, le serveur conserve la demande et attend jusqu’à son expiration. Rouvrez le chat pour retrouver la proposition. Si vous avez déjà validé, l’exécution continue sur le PC et son résultat est conservé. Un refus, une expiration ou une annulation n’exécute pas ce script. Après un redémarrage du serveur, les anciennes validations en attente expirent et ne sont pas rejouées ; les exécutions interrompues sont signalées.

Le code proposé, les décisions et les sorties restent dans `data/chats/`. Le compagnon utilise des fichiers temporaires sous `data/tool-runs/`, normalement nettoyés en fin d’exécution. L’environnement transmis au processus est réduit aux variables d’exécution utiles, sans hériter directement des jetons Bionic et Brave ; cela ne protège pas les secrets lisibles sur le disque par votre compte. Ces fichiers, journaux et conversations restent privés.

## Branches de conversations

**Créer une branche du chat** copie le fil jusqu’à son dernier message enregistré. **Créer une branche depuis ici** copie le début du fil jusqu’au message choisi **inclus**. La copie crée immédiatement un nouveau chat web dans le même projet, sans appeler le modèle, exécuter un outil ou modifier la source.

Une réponse assistant encore en cours ne peut pas être le dernier message copié. Choisissez un point antérieur, y compris pendant une génération dans le fil source, ou attendez sa fin. Les messages qui arrivent ensuite dans la source ne sont pas ajoutés à la branche. Les demandes en attente et les brouillons ne sont pas copiés.

Les messages et pièces jointes copiés gardent leur contenu enregistré, dans les limites déjà disponibles pour un historique Bionic. Les messages copiés reçoivent de nouveaux identifiants. Les actions précédentes deviennent un **historique passif** : leurs anciens identifiants de restauration, d’approbation et d’exécution ne donnent aucun droit dans le nouveau fil. Un reçu copié est marqué historique et ne prétend pas qu’un outil vient d’être rejoué.

Internet et les scripts sont désactivés dans la nouvelle branche. Le modèle et les choix d’effort disponibles peuvent être repris ; vérifiez le modèle et les droits de fichiers avant de continuer. Une branche issue de Bionic demeure une conversation du compagnon et ne s’écrit pas dans l’application native.

Les historiques sont indépendants, **les fichiers du projet sont partagés**. Modifier un fichier depuis une branche affecte le même fichier du PC que depuis la source. Cette fonction ne crée pas une copie de dossier, un environnement isolé, un second modèle ni une synchronisation bidirectionnelle.

## Contexte, preuves et limites des essais

Le journal décrit les actions et leur résultat. **Contexte utilisé** décrit les éléments reçus, puis leur transmission confirmée au modèle. Une requête HTTP réussie de l’API confirme l’acceptation du contexte, pas la compréhension du modèle. Les aperçus cumulés web/scripts sont limités à 12 000 caractères ; le reçu indique leur éventuelle troncature. Les résultats d’outils ne sont pas automatiquement rejoués au prochain message.

Les essais automatisés utilisent des projets temporaires, des DNS et transports injectés et des réponses de modèle simulées. Ils ne prouvent pas l’accès réel à DuckDuckGo, SearXNG ou Brave depuis chaque PC, ni le comportement de tous les modèles ou interpréteurs installés. Le [bilan de vérification](verification.md) précise ce qui a effectivement été exécuté pour cette version.

Références primaires pour l’implémentation et sa maintenance :

- [Prévention SSRF par OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), notamment validation des adresses et contrôle des redirections.
- [Registre IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/) et [registre IANA IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/) des plages spéciales.
- [Node.js : `http.request`](https://nodejs.org/docs/latest-v24.x/api/http.html#httprequesturl-options-callback) pour les connexions et [Node.js : `child_process.spawn`](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options) pour les processus, leurs options et leurs sorties.
- [API de recherche SearXNG](https://docs.searxng.org/dev/search_api.html) et [formats autorisés](https://docs.searxng.org/admin/settings/settings_search.html#formats).
