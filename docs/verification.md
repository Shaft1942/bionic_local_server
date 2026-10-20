# Vérification des distributions

La distribution a été préparée le 20 octobre 2026 dans une copie distincte de l’installation d’origine. Les tests utilisent des projets, conversations et modèles synthétiques ; ils n’appellent pas les modèles réels, n’écrivent pas dans les projets de l’utilisateur et ne changent aucune règle du pare-feu.

## Contrôles couverts

- Adaptateur des historiques Bionic : sélection des projets enregistrés, projection des messages, lecture seule SQLite et prise en charge des bases WAL.
- Authentification et isolation des routes : refus des accès non connectés, des origines externes et des chemins hors des dossiers autorisés.
- Fichiers : conflits de version, copies précédentes, restauration, imports sans écrasement, pièces jointes et refus des noms de périphériques Windows.
- Génération : effort, métriques, actions du modèle, lecture ciblée, maintien de la réponse après déconnexion, récupération et arrêt explicite.
- Portabilité : configuration sans chemin personnel et vérification de l’identité de l’instance dans les lanceurs Windows.
- Distribution : absence des données locales dans la liste d’export et blocage de motifs de jetons ou de clés privées.

## Portée de la validation

Les tests locaux ont été exécutés sous Windows avec Node.js 24. Les scripts PowerShell ont été analysés et leurs fonctions testées sans appliquer de règle réseau. Le test qui crée un lien de dossier peut être ignoré lorsque l’environnement refuse cette création ; les vérifications de chemins hors racine restent couvertes.

Le contrôle local compte 99 tests : 98 réussis et un test de création de lien ignoré par l’environnement protégé. Deux extractions vierges du ZIP ont ensuite démarré sur des ports isolés, chacune avec une authentification générée distincte. L’extraction DOCX et XLSX a été vérifiée avec un Python standard sur des documents synthétiques. Le CRC du ZIP, sa liste exacte de 63 fichiers, ses octets et son empreinte ont été contrôlés ; aucune donnée de l’installation d’origine n’y figure. L’extraction PDF avec la dépendance optionnelle n’a pas été réinstallée pendant ce contrôle.

La compatibilité de l’adaptateur natif a été établie lors du développement avec Bionic 1.1.8+10. Son format interne peut évoluer. La préparation de la distribution ne constitue pas un test sur un second PC ni une validation de toutes les versions de Bionic. Le workflow GitHub prévoit aussi les tests sous Ubuntu ; leur résultat ne doit être annoncé qu’après exécution dans GitHub Actions.

Le contrôle d’export réduit le risque de partager des données d’installation. Il ne reconnaît pas tous les secrets imaginables dans un fichier arbitraire : tout ajout au manifeste reste à relire. Aucun service distant de télémétrie n’est ajouté à l’application. Les connexions qu’elle réalise vers le modèle sont dirigées vers l’API Bionic locale configurée.

Pour reproduire les contrôles et construire une archive, voir [Développement](developpement.md) et [Publication](publication.md).

## Branche conversations parallèles — 1.6.0 en préparation

Contrôles du 20 octobre 2026, sur la branche `feat/conversations-paralleles`. L’installation utilisée au quotidien n’est pas remplacée et cette archive de test ne constitue pas une release GitHub publiée.

La suite Windows compte **116 tests : 115 réussis, aucun échec et un test de création de lien ignoré par l’environnement**. Les nouveaux cas couvrent les envois simultanés, les files FIFO, la limite de dix attentes, les options et pièces jointes figées, les extraits conservés pour reprise, les doublons, les écritures de sauvegarde ordonnées, l’annulation ciblée, les autres chats qui continuent, le refus du déchargement et le redémarrage sans rejeu des outils.

Deux parcours ont été exécutés dans Chrome avec une copie isolée du serveur et une API de modèle simulée. Ils vérifient la rédaction pendant une réponse, deux chats actifs, le départ du message suivant avec l’historique de la première réponse, le retrait d’une attente, la navigation entre projets, les brouillons et pièces jointes propres à chaque fil, ainsi que la récupération après rechargement. Les aperçus bureau (1280 px) et téléphone (390 px) ont été inspectés ; aucun débordement horizontal n’a été constaté. Le contrôle mécanique signale seulement l’image d’aperçu de fichier sans source initiale : cet élément existant reste masqué jusqu’à l’ouverture d’une image réelle.

Le manifeste public contient **65 fichiers**, dont les pistes UX sourcées et les méta-prompts d’exploration. L’ajout documentaire ultérieur n’a pas modifié le code testé. Le contrôle d’export et la construction du ZIP utilisent cette même liste. Les tests de concurrence valident le protocole du compagnon ; ils ne mesurent pas la capacité d’un modèle Bionic réel à exécuter plusieurs demandes simultanément. Aucune règle réseau, donnée Bionic ou fichier de projet personnel n’a été modifié.

## Branche retour, livrables et contexte — 1.7.0 en préparation

Contrôles du 20 octobre 2026, sur la branche locale `feat/retour-livrables-contexte`, créée à partir de la branche des conversations parallèles. L’installation utilisée au quotidien reste distincte et cette archive de test n’est pas une release GitHub publiée. Les [méta-prompts exécutés](metaprompts-implementation-1.7.md) décrivent les tâches des trois agents et leurs limites.

La suite Windows compte **159 tests : 158 réussis, aucun échec et un test de création de lien ignoré par l’environnement**. Les 29 fichiers JavaScript passent le contrôle de syntaxe. Les nouveaux cas couvrent les événements de fin de réponse et les interruptions détectées, les copies figées des livrables, l’isolation entre projets, les origines falsifiées, les limites de stockage et l’intégrité des copies. Ils vérifient aussi la sélection réelle du contexte, les pièces jointes figées, les lectures d’outils réussies et la transmission qui reste non confirmée en cas d’échec de l’appel au modèle.

Deux parcours complets ont été exécutés dans Chrome avec un serveur isolé et une API de modèle simulée. Ils vérifient l’absence de reconstitution du contexte ancien, les extraits réellement lus, l’épinglage volontaire d’une réponse et d’un fichier, la conservation des brouillons, les marqueurs de lecture propres à l’appareil et la récupération après rechargement. Ouvrir « Depuis votre départ » ne marque rien comme lu ; consulter une réponse ouvre et vise le bon message. Une autre fin de tâche est reçue pendant que ce panneau reste ouvert. Le téléchargement d’un livrable conserve ses octets après modification du fichier source ; renommer ou retirer l’épingle préserve ce fichier. L’isolation entre projets et la fermeture des vues privées après déconnexion ont aussi été contrôlées.

Les aperçus bureau (1280 px) et téléphone (390 px) ont été inspectés. Le second parcours contrôle aussi une largeur de 320 px ; aucun débordement horizontal n’a été constaté. Aucune erreur JavaScript de page n’a été remontée. Le contrôle mécanique signale seulement l’image d’aperçu existante, masquée et sans source jusqu’à l’ouverture d’une image réelle.

Le manifeste public contient **71 fichiers**. Le contrôle d’export, le CRC du ZIP, sa liste exacte de fichiers, ses octets comparés aux sources et son empreinte SHA-256 sont vérifiés lors de la construction. Aucun état local, historique personnel ou copie de livrable n’est distribué. Ces contrôles utilisent des données synthétiques : ils ne constituent pas un essai sur un téléphone physique, un test du réseau Wi-Fi ni une génération avec Bionic ou le GPU réels.

La disposition compacte de la saisie a ensuite été vérifiée dans Chrome avec une API simulée, sur des largeurs de 320, 390, 844 et 1280 px. Modèle et effort restent sur la même ligne, sans débordement horizontal, avec des cibles d’au moins 44 px. Pour le même contenu, la hauteur totale de la zone de composition passe de 350 à 289 px à 390 px de large, et de 368 à 289 px à 320 px de large ; sa hauteur sur bureau est conservée. Le parcours contrôle le choix de modèle, l’effort mémorisé, l’effort indisponible, les options réellement envoyées, la saisie et l’arrêt pendant une réponse, sans perdre le brouillon. Les aperçus bureau et téléphone, au repos et pendant une réponse, ont été inspectés ; aucun téléphone physique ni clavier virtuel natif n’a été utilisé pour ces mesures.
