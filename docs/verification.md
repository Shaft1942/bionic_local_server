# Vérification de la distribution 1.5.0

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
