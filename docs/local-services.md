# Serveurs sur le PC — 2.4.2-beta.2

Le compagnon peut piloter une API Bionic explicitement sélectionnée et une instance ComfyUI Python qu'il lance lui-même. Ouvre **Paramètres → Serveurs sur le PC** pour consulter leur état. Démarrer est manuel ; Arrêter et Redémarrer demandent confirmation et refusent une activité connue ou incertaine. Aucune commande n'est envoyée au modèle.

## Préparer une installation

Sur le PC du compagnon, lance `Configurer-serveurs.cmd`. L'assistant local enregistre un profil dans `config.launchers.local.json` après validation des chemins. Il ne télécharge, ne démarre et n'arrête aucun moteur. Ensuite, utilise **Relire la configuration** dans les paramètres. Le fichier d'exemple est volontairement désactivé.

Les deux API doivent être en boucle locale. Les adresses utilisées restent celles des connexions du compagnon : `apiUrl` et l'URL effective enregistrée de ComfyUI. Un profil de lancement ne modifie pas ces connexions. ComfyUI sur un autre PC reste utilisable selon les règles existantes, en observation uniquement pour le lanceur.

Le profil demande un **usage dédié au compagnon** : les clients externes et les commandes manuelles peuvent contourner l'admission du compagnon. Ce réglage est une convention d'utilisation, pas un verrou universel du moteur. N'annonce pas une absence de travaux externes sur la seule base d'une liste de modèles ou d'une file vide.

### Bionic

Sélectionne le CLI officiel `lms.exe`, le chemin exact de son fichier de contrôle Bionic `http-server.json` et, pour le démarrage à froid, `Bionic.exe`. Le fichier de contrôle reste à son emplacement natif ; son contenu n'est pas copié dans le compagnon, le téléphone ou les arguments du programme. Le CLI lit ses propres credentials via son mécanisme normal. L'override sélectionne cet hôte sans repli vers une autre application.

**Arrêter Bionic coupe son API HTTP, sans fermer le Desktop.** Redémarrer relance cette API. Aucun modèle n'est chargé volontairement pour vérifier l'état. L'application peut conserver ses propres préférences de démarrage. Une API déjà active ailleurs reste externe : le compagnon ne la prend pas automatiquement sous son contrôle.

### ComfyUI

Sélectionne le Python de l'installation, son `main.py` et le dossier contenant cette entrée. Le lancement passe par un hôte Python fixe du compagnon, avec contrôle local authentifié et sans shell ni arguments libres. Une instance Comfy Desktop déjà ouverte n'est ni adoptée ni fermée.

L'arrêt coopératif déclenche l'interruption dans le processus Python contrôlé ; il ne repose pas sur un kill de PID. Sous Windows, le périmètre est contrôlé avec un Job Object utilisé pour le comptage, sans fermeture forcée ni kill à la disparition du compagnon. Des descendants encore actifs ou un périmètre non vérifiable rendent l'arrêt indisponible. Les versions/distributions non qualifiées doivent rester décrites comme telles.

## Progression et récupération

L'API prête, le processus lancé et le modèle chargé sont trois informations différentes. Fermer les paramètres laisse une opération acceptée continuer sur le PC. Après une coupure, le navigateur retrouve son reçu par GET ; il ne renvoie pas automatiquement une commande. Un timeout n'autorise pas un second lancement.

Un arrêt non confirmé ne devient jamais « arrêté ». Au redémarrage du compagnon, un reçu privé ne suffit pas à reprendre le contrôle : un contrôleur authentifié et une identité vérifiable sont requis. La reconnexion à un hôte Python vivant est possible ; si son endpoint a disparu et que le nouveau compagnon ne possède plus la preuve OS de sortie, l'état peut rester indéterminé. Vérifie alors l'installation sur le PC ; ne supprime pas un journal d'opération ambigu pour provoquer un rejeu.

Les demandes texte/images, relances, reprises de file, attentes d'accord, chargements de modèles et mises à jour sont protégés par une admission commune. Les attentes et réservations de l'ordonnanceur GPU comptent aussi comme travaux actifs. Les consultations restent disponibles pendant les opérations. Les inconnues persistées bloquent les commandes susceptibles de perdre un travail ; aucun bouton Forcer n'est livré.

## Séparation et distribution

Le téléphone ne peut ni créer une recette de commande, ni changer un exécutable, des arguments ou l'environnement. Les profils, états de contrôle et reçus secrets sont exclus de Git, de la distribution et des outils fichiers. Les scripts expressément approuvés par l'humain conservent les droits du compte PC ; le lanceur ne leur ajoute pas un bac à sable.

Le candidat réunit le lanceur de la 2.4.2-beta.1 et les fonctions images de la 2.4.1-beta.2, avec les résolutions FR/EN et de coordination de l'assemblage local 2.5. Il conserve les fonctionnalités de la v2.4.0-beta.3 : paramètres, version discrète, canaux de mise à jour, projets et conversations. Le curseur 1–5 concerne les demandes conversationnelles avec outils ; Générer ce prompt directement conserve une image exacte sans préparation par un modèle texte. Annulation locale, relance, galerie/ZIP et Livrables → Génération sont présents. Les contrats sont extensibles ; aucun moteur supplémentaire n'est fourni. La preuve de qualification datée du lanceur reste historique ; les vérifications synthétiques du nouvel assemblage ne valent pas nouvel essai d'un moteur, d'un téléphone ou d'un rendu réel.
