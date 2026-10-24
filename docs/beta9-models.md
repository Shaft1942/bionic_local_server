# Canaé beta.9 : moteur, modèle et réflexion

Le chat regroupe le moteur d’inférence, le modèle et la réflexion près du champ de message. Le moteur sélectionné s’applique à tous les chats ; il utilise les connexions configurées dans les paramètres. Choisir une valeur dans le menu ne lance rien : le bouton de validation applique le changement, puis relit l’état du serveur. Les brouillons et leurs permissions sont conservés.

## Réflexion proposée par le modèle

Le menu présente uniquement les options déclarées pour le modèle sélectionné. Un modèle binaire propose Désactivée/Activée ; un modèle annonçant des niveaux propose ses niveaux. « Par défaut » laisse le moteur décider. Le choix du brouillon est conservé par moteur et modèle ; une ancienne valeur devenue indisponible revient au défaut dans l’affichage et dans la requête envoyée.

Avec Bionic, les options viennent de son catalogue. Avec llama.cpp, le contrôle activé/désactivé est proposé lorsque le template public confirme le contrôle natif `enable_thinking`. Un nom de modèle, une balise de réflexion ou un booléen général d’effort ne suffisent pas à inventer des niveaux. Si le contrôle ne peut pas être établi, le chat l’indique et conserve le défaut du moteur. Voir [le contrat de capacités](capabilities.md).

## Choisir un GGUF

Le modèle chargé et les fichiers GGUF disponibles restent dans le même menu. Choisir un fichier ouvre une confirmation dans l’application avec Annuler et Charger et utiliser. La confirmation relit le profil et ses révisions avant le lancement. Une réponse perdue est récupérée en lecture ; elle ne déclenche pas un deuxième chargement.

Un serveur externe conserve son propre lanceur et n’est jamais arrêté ou adopté par le choix d’un fichier. Le chat permet de passer explicitement à la connexion du profil GGUF local configuré, puis de choisir son modèle séparément. Si cette connexion portait un jeton externe, son effacement est annoncé avant confirmation. Un port occupé, un profil changé ou une opération en cours produit un refus explicite.

Les limites initiales du [chantier de parité beta.8](beta8-parity.md) restent distinctes de ces corrections. Cette candidate locale n’est pas une publication ni une promotion stable. Les vérifications synthétiques ne qualifient pas les moteurs, modèles, rendus GPU ou téléphones réels ; ces essais nécessitent des preuves séparées.
