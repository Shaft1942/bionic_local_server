# 2.5.1-beta.1 — reprise et configuration simplifiées

Candidate locale issue de la stable 2.5.0. Elle conserve ses fonctions images, fichiers, projets, conversations et interface français/anglais.

## Préparer Bionic et ComfyUI

Sur le PC, ouvrez **Paramètres → Serveurs sur le PC**, puis la configuration du moteur. **Détecter** cherche dans quelques emplacements habituels sans parcourir tout le disque. **Choisir le dossier** ouvre une sélection Windows à votre demande et propose les chemins connus de cette installation. Confirmez les chemins et l'usage dédié au compagnon, puis enregistrez. Cette opération ne démarre aucun moteur.

Si aucune installation complète n'est trouvée, les réglages avancés permettent de corriger ses chemins dans les paramètres. Bionic utilise son CLI et son propre fichier de contrôle ; ComfyUI utilise le Python de l'installation et son main.py. Les commandes, arguments libres et variables d'environnement ne sont jamais saisis dans le navigateur. Le script Configurer-serveurs.cmd reste une alternative locale.

Sur téléphone, l'état et les commandes restent utilisables une fois la préparation faite. Le choix de logiciels et l'enregistrement de leurs chemins exigent une connexion locale sur le PC ; les chemins ne sont pas retournés aux appareils du réseau.

## Utilisation et reprise

Chaque carte donne d'abord la disponibilité et l'action utile. Les observations techniques sont dans les détails. L'arrêt et le redémarrage restent confirmés et bloqués pendant les travaux incompatibles. **Arrêter le serveur Bionic laisse son application Desktop ouverte.** Une instance ComfyUI ouverte ailleurs reste en observation.

Un refus prouvé avant lancement devient un échec terminé : il ne bloque pas les autres demandes. Après redémarrage du compagnon, Bionic peut être contrôlé à nouveau si l'identité complète du contrôleur déjà détenu, son profil et son API sont confirmés. Une identité changée, une inspection impossible ou un véritable résultat inconnu n'est pas considéré comme une autorisation d'arrêter. Aucune commande n'est répétée automatiquement et aucun bouton Forcer n'est fourni.

## Valeurs par défaut des outils

Pour de nouveaux choix, Internet est activé. Les images sont cochées lorsque ComfyUI est configuré, détecté et disponible ; une nouvelle installation permet cette détection. Les anciens réglages, brouillons et droits explicitement désactivés restent prioritaires. Aucun modèle n'est chargé et aucune image n'est générée par la simple vérification. Les scripts gardent leur validation humaine et restent désactivés par défaut.

Les vérifications de développement sont effectuées sur fixtures synthétiques. Elles ne qualifient pas automatiquement une nouvelle distribution de moteur, le matériel ou un téléphone physique.
