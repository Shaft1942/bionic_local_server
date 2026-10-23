# Mises à jour proposées

[Retour au README](../README.md)

À partir de 1.9.0, le compagnon vérifie les Releases publiques de `Shaft1942/bionic_local_server` au démarrage de son serveur, puis toutes les **24 heures de fonctionnement**. Le navigateur peut être fermé : cette vérification tourne sur le PC. Plusieurs téléphones ou onglets n'ajoutent pas de vérifications GitHub. Elle n'empêche pas de démarrer si Internet ou GitHub est indisponible ; aucun programme n'est installé dans ce cas.

La vérification transmet à GitHub une demande publique de liste de versions et de métadonnées de compatibilité. Elle n'envoie ni conversations, ni fichiers des projets, ni chemins, ni code d'accès. GitHub reçoit les informations habituelles d'une connexion réseau, notamment l'adresse IP publique. Aucun compte ou jeton GitHub n'est nécessaire.

## Choisir

Ouvrez **Paramètres → Maintenance et aide → Mises à jour**. L'icône Paramètres se trouve dans la barre du bas, avec Modèles chargés, Reconnexion au PC et Déconnecter. Une indication discrète sur Paramètres apparaît si une version compatible est disponible ; aucune fenêtre ne s'ouvre automatiquement.

Le **canal de publication** vaut **Stable** par défaut, même après installation d'un ZIP bêta. Le choix **Bêta** ajoute les versions d'essai `X.Y.Z-beta.N` aux stables compatibles plus récentes. Le choix s'applique au PC pour tous les appareils connectés et reste indépendant de la vérification automatique. Changer le canal n'installe rien ; si les vérifications automatiques sont désactivées, utilisez **Vérifier maintenant**.

Après une bêta, revenir à Stable attend une version stable plus récente ; cela ne réinstalle pas une ancienne version. Par exemple, `2.2.0-beta.1` peut recevoir `2.2.0`, mais pas `2.1.0`.

- **Installer et redémarrer** : après votre confirmation explicite, le serveur télécharge et vérifie l'archive, prépare une sauvegarde des sources, arrête cette instance et la redémarre. Reconnectez-vous avec votre code habituel si nécessaire.
- **Plus tard** : masque l'indication de cette version dans l'onglet pour la session en cours. Les paramètres restent ouverts. Rien n'est téléchargé ni installé. Une vérification manuelle peut réafficher l'indication.
- **Ignorer cette version** : mémorise ce choix sur le PC pour tous les appareils, dans `data/update-state.json`. Cette version ne sera plus proposée, y compris après redémarrage. Une version ultérieure compatible reste proposable. Le compagnon ne propose pas une version plus ancienne simplement parce que la plus récente a été ignorée.
- **Vérifier maintenant** : relance une vérification dédoublonnée. Les vérifications automatiques peuvent être désactivées ; la commande manuelle reste disponible.

Les réglages de vérification et le refus sont communs à l'installation. Toute personne connectée avec le code du compagnon peut prendre ces décisions, comme pour les autres opérations du compagnon.

## Compatibilité et sauts de versions

Une version proposée doit appartenir au canal choisi, être supérieure à celle installée, disposer des trois pièces jointes attendues et d'un manifeste de protocole connu. Le canal Stable exclut les préversions ; Bêta accepte aussi les stables. Le serveur examine la liste paginée des Releases et compare les numéros, pas seulement leur date : `beta.10` vient après `beta.2`, et la stable vient après les bêtas du même numéro. Il ne propose qu'une version : la plus récente dont les conditions sont satisfaites. Il n'impose pas les versions intermédiaires.

`update-manifest.json` déclare la version de départ minimale, une borne maximale éventuelle, les versions majeures de Node.js autorisées, les systèmes pris en charge et l'empreinte de l'archive. Une version plus récente incompatible est ignorée au profit de la plus récente compatible. Une incompatibilité ou une absence de métadonnées ne constitue pas une preuve qu'une installation manuelle fonctionnerait.

Le protocole 1 installe automatiquement **sous Windows**, avec Node.js 24 ou ultérieur si la Release l'autorise, dans un dossier extrait du ZIP. Un checkout contenant `.git` reste consultable mais refuse l'installation automatique : utilisez Git. Les brouillons, préversions autres que les bêtas numérotées et anciennes Releases sans manifeste ne sont pas proposés. Une bêta doit être marquée comme préversion sur GitHub et porter le canal bêta dans son manifeste. Les vérifications sont bornées en durée, taille et pagination ; si ces limites empêchent une sélection certaine, une erreur est affichée et aucune version n'est choisie.

## Préservation et arrêt

Conversations, authentification, `config.local.json`, code d'accès, fichiers de projets et fichiers locaux extérieurs à la distribution sont conservés. Aucun dossier de projet n'est migré ou remplacé par l'installateur. Les sauvegardes de sources restent privées dans `runtime/update-jobs/` ; elles ne sont pas jointes aux Releases.

Une génération, une file d'attente, un accord humain attendu, un import ou un enregistrement en cours empêche l'installation. Un travail commencé pendant le téléchargement empêche aussi le démarrage de l'installateur. Fermer le téléphone après acceptation n'annule pas une installation déjà lancée sur le PC. La préparation ne commande pas le modèle et ne décharge pas les modèles Bionic.

Les fichiers ouverts non enregistrés dans l'onglet doivent être enregistrés avant d'installer. Les brouillons de messages et leurs références de pièces jointes sont copiés temporairement dans le stockage de session de cet onglet, pour au plus trente minutes ; ils sont restaurés après reconnexion à la même instance, puis cette copie est supprimée. Une déconnexion volontaire la supprime aussi. Les autres appareils peuvent avoir des textes non enregistrés que le serveur ne peut pas détecter : enregistrez-les avant d'accepter un redémarrage partagé.

Le programme redémarré doit répondre avec la version attendue et la même identité ; son PID doit correspondre au processus lancé. Une réponse sur un port occupé ne suffit pas. Aucun processus n'est recherché ou tué par son numéro de port.

## Sauvegardes, échecs et limites

Conservez une sauvegarde indépendante de vos données : les copies de sources de l'installateur ne remplacent pas une sauvegarde des conversations et des projets. Lors de la première mise à jour automatique, l'absence d'empreinte de référence empêche de distinguer vos modifications manuelles du code d'origine. Les fichiers remplacés sont sauvegardés exactement ; les anciennes sources non remplacées sont conservées. Après une installation réussie, les empreintes enregistrées permettent de refuser une mise à jour si les sources ont été modifiées ou ont disparu.

Un téléchargement altéré, une archive mal formée, un lien, un chemin interdit ou une collision avec un fichier extérieur à la distribution entraîne un refus. Les changements de casse de noms de fichiers ne sont pas appliqués automatiquement. Les archives du protocole 1 sont limitées à 32 Mio, les sources individuelles à 2 Mio, et les entrées ZIP chiffrées ou non prises en charge sont refusées.

Si une écriture ou le contrôle de redémarrage échoue dans le processus d'installation, celui-ci tente de remettre les sources précédentes et de relancer l'ancienne version. Une coupure du PC, un disque plein, un verrou persistant ou l'arrêt forcé de l'installateur peuvent exiger une récupération manuelle : aucune transaction résistante à toute panne n'est promise. Le journal, les sauvegardes et l'état sont dans `runtime/update-jobs/<identifiant>/`. Un verrou `runtime/update.lock` resté après un arrêt brutal doit être examiné sur le PC avant toute nouvelle installation ; ne le supprimez pas pendant une installation active.

Le retour de version du programme n'annule jamais les modifications déjà effectuées dans les projets. Une Release qui change un format de données doit déclarer un périmètre de compatibilité et une procédure adaptée ; le numéro de version ne garantit pas cette compatibilité.

## Premier déploiement

La Release 1.8.0 ne possède pas ce mécanisme. Installez manuellement la première version qui le contient en suivant [Sauvegarde et mise à jour](sauvegarde-mise-a-jour.md). Les publications suivantes doivent joindre `update-manifest.json`, le ZIP et `SHA256SUMS.txt`. Une archive construite localement ou une branche de développement n'est pas une Release publiée.

La stable **2.1.0** publiée ne possède pas le sélecteur de canal et ignore les préversions. Pour rejoindre la première bêta, suivez la même procédure manuelle avec sauvegarde. Activez ensuite le canal Bêta pour recevoir les préversions suivantes. La publication de la bêta conserve la stable 2.1.0 et son téléchargement habituels.

## Numérotation des versions de développement V2

Les essais locaux 2.1.0 à 2.1.3 ont précédé la première release publique 2.0.0 ; leurs ajouts ComfyUI/LoRA sont réunis dans cette release. Ces numéros locaux restent supérieurs à 2.0.0 : une installation de développement 2.1.x ne recevra donc pas automatiquement cette release. La protection contre les retours de version est conservée. Pour passer d’une telle copie à la distribution publique, suivre la procédure manuelle de [sauvegarde et mise à jour](sauvegarde-mise-a-jour.md), dans un dossier propre, en préservant les données et les accès. Ne pas modifier simplement le numéro d’une installation active.
