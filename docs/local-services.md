# Serveurs sur le PC

[Installation](installation.md) · [Images ComfyUI](comfyui.md) · [Dépannage](depannage.md)

**Paramètres → Serveurs sur le PC** permet de démarrer, arrêter ou redémarrer une API Bionic explicitement configurée et une instance ComfyUI Python lancée par le compagnon. Les modèles ne sont pas chargés pour vérifier l’état. **Arrêter** et **Redémarrer** demandent confirmation et refusent une activité connue ou incertaine.

## Préparer une installation

Sur le PC, lancez **Configurer-serveurs.cmd**. L’assistant valide les chemins puis enregistre `config.launchers.local.json`. Il ne télécharge, ne démarre et n’arrête aucun moteur. Dans les paramètres, utilisez ensuite **Relire la configuration**. Le fichier d’exemple reste désactivé.

Les API pilotées doivent être en boucle locale et correspondre aux connexions déjà utilisées par le compagnon : `apiUrl` pour Bionic et l’URL enregistrée de ComfyUI. Le profil de lancement ne les modifie pas. ComfyUI sur un autre PC reste utilisable pour générer, mais ne peut pas être piloté par ce lanceur.

Choisissez un **usage dédié au compagnon**. C’est une convention : des clients externes peuvent contourner son admission. Une file vide ou une liste de modèles ne garantit pas l’absence de travail extérieur.

### Bionic

Sélectionnez le CLI officiel `lms.exe`, le fichier de contrôle Bionic `http-server.json` exact et, pour le démarrage à froid, `Bionic.exe`. Le fichier de contrôle reste dans son emplacement natif ; ses credentials ne sont pas copiés sur le téléphone ni dans les arguments. Le CLI utilise son mécanisme normal d’accès, sans repli vers une autre application.

**Arrêter Bionic coupe son API HTTP et laisse le Desktop ouvert.** Redémarrer relance cette API. Une API déjà active hors du contrôle du compagnon reste externe ; elle n’est pas adoptée automatiquement.

### ComfyUI

Sélectionnez le Python de l’installation, son `main.py` et le dossier correspondant. Le lancement utilise un hôte Python fourni avec contrôle local authentifié ; il n’accepte ni shell ni arguments libres. Une instance Comfy Desktop déjà ouverte n’est ni adoptée ni fermée.

L’arrêt est coopératif et limité au processus contrôlé. Des descendants encore actifs ou un périmètre de processus non vérifiable rendent l’arrêt indisponible. Une distribution ou version différente peut nécessiter une qualification spécifique.

## Progression et récupération

**API prête**, **processus lancé** et **modèle chargé** sont trois informations distinctes. Fermer les paramètres n’annule pas une opération acceptée. Après une coupure de connexion, le navigateur retrouve son état sans renvoyer automatiquement la commande. Un timeout n’autorise pas un second lancement.

Une opération sans arrêt confirmé reste **indéterminée**. Après redémarrage du compagnon, un reçu enregistré ne suffit pas à reprendre le contrôle : une identité vérifiable et un contrôleur authentifié restent nécessaires. Si l’état reste ambigu, vérifiez l’installation sur le PC. Ne supprimez pas un journal pour provoquer un rejeu ; aucun bouton de fermeture forcée n’est fourni.

Les générations texte/images, attentes, accords humains, chargements de modèles et mises à jour participent aux contrôles d’activité. Une opération susceptible de perdre un travail est refusée pendant ces états. Les consultations restent disponibles.

## Portée et données privées

Le téléphone ne peut pas choisir un autre exécutable, inventer une commande ou changer l’environnement de lancement. Les profils, états et reçus de contrôle sont privés et exclus de Git et de la distribution.

Le lanceur ne fournit ni modèle, ni moteur supplémentaire, ni isolation du PC. Les scripts que vous approuvez dans une conversation conservent les droits de votre compte : voir [Outils et autorisations](outils-agents.md).
