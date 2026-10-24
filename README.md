[Français](README.md) · [English](README.en.md)

# Canaé — compagnon local

**Candidate locale Canaé 2.6.0-beta.6** : interface llama-ui, fenêtres centrées, paramètres natifs avec curseurs et sécurité HTTP/HTTPS/mTLS. Un seul moteur de conversation est sélectionné dans la webapp ; les GGUF sont partagés avec Bionic sans copie. Internet et images disponibles sont proposés par défaut, en conservant les désactivations explicites. Voir [la candidate et ses limites](docs/llama-ui-prototype.md). Cette mention ne constitue pas une publication.

La bêta 6 ajoute le curseur de quantité d’images dans le chat et l’atelier et renforce les reprises des moteurs et des sauvegardes. Voir [l’audit, les corrections et les extensions proposées](docs/beta6-audit.md).

**Référence stable 2.5.0** · Discutez avec les modèles de votre PC et retrouvez vos projets depuis le navigateur de votre téléphone, sur votre réseau local.

Le compagnon utilise l’API locale de Bionic et peut générer des images avec ComfyUI. Ce projet communautaire est indépendant de Bionic ; ni Bionic, ni ComfyUI, ni leurs modèles ne sont inclus.

## Ce que vous pouvez faire

- Consulter les projets et conversations Bionic, puis continuer dans une **suite web distincte**, sans modifier les historiques natifs.
- Créer des projets locaux, adopter un projet Bionic en choisissant ses dossiers autorisés, classer les chats et créer des branches.
- Choisir le modèle, l’effort et la limite de réponse ; retrouver les générations en cours et mettre les messages suivants en file.
- Joindre des documents ou images, consulter et modifier les fichiers texte, conserver des livrables et restaurer les fichiers de la corbeille.
- Autoriser séparément les outils fichiers, le web et les scripts exécutés après validation de leur code exact.
- Générer **1 à 5 images par demande** avec Krea 2 Turbo ou HassakuXL, régler deux LoRA par profil et choisir la gestion mémoire texte/images.
- Annuler une image encore en attente locale, relancer un rendu avec la même graine ou une nouvelle, parcourir la galerie et télécharger un ZIP.
- Démarrer, arrêter ou redémarrer les serveurs compatibles dans **Paramètres → Serveurs sur le PC**, après configuration explicite sur le PC.
- Utiliser l’interface et son aide en **français ou en anglais**, avec un choix propre à chaque navigateur.

Les outils, MCP et compétences de Bionic ne sont pas hérités : le compagnon fournit ses propres outils et autorisations.

## Installer sous Windows

Il faut **Node.js 24 ou ultérieur**, Bionic avec son API locale et un dossier accessible en écriture. Docker et une installation de dépendances npm ne sont pas nécessaires pour utiliser le serveur.

1. Téléchargez l’archive `bionic-mobile-v….zip` et `SHA256SUMS.txt` de la même version depuis les [Releases](https://github.com/Shaft1942/bionic_local_server/releases). Extrayez entièrement le ZIP. Les archives de sources GitHub peuvent différer du paquet de distribution.
2. Lancez **Installer.cmd**. L’assistant propose le dossier, un Node.js existant ou le téléchargement d’une copie portable officielle, puis les réglages de connexion.
3. Dans **Bionic → API des modèles locaux**, activez le serveur et reportez son adresse dans l’assistant. **Tester l’API** consulte les modèles sans lancer de génération.
4. Installez puis démarrez le compagnon. L’ouverture du pare-feu est facultative ; elle demande un accord Windows et reste limitée au réseau privé et au sous-réseau local.
5. Ouvrez **ACCES-PRIVE.txt** dans le dossier installé. Utilisez l’adresse du PC et son code personnel, puis l’adresse du téléphone sur le même réseau local.

Pour les étapes détaillées et le démarrage par `npm start`, voir [Installation](docs/installation.md). **Python est facultatif** : il sert à extraire DOCX/XLSX, les PDF avec `pypdf`, et à exécuter les scripts Python approuvés. Les PDF scannés ne bénéficient pas d’OCR.

## Choisir la langue

Dans **Paramètres → Langue et brouillons → Langue de l’interface**, choisissez Français ou English. Le changement est immédiat et mémorisé dans ce navigateur, pour l’adresse utilisée. Un autre navigateur, port ou accès HTTPS possède son propre choix.

Au premier accès, une langue du navigateur est utilisée si elle est prise en charge ; sinon, le français est choisi. **Ce réglage ne traduit ni vos messages, ni les réponses du modèle, ni les prompts, ni les fichiers.** Demandez au modèle la langue de réponse souhaitée dans votre message. Les diagnostics des moteurs et les outils Windows peuvent conserver leur langue d’origine.

Le [guide anglais](docs/en/guide.md) couvre l’installation et l’usage courant. Les autres guides détaillés sont principalement en français. Pour contribuer aux traductions, voir [Internationalisation](docs/internationalisation.md).

## Utiliser les images et les serveurs

Dans **Paramètres → Images et ComfyUI**, renseignez le serveur, vérifiez les modèles requis, puis activez et enregistrez. Le menu **Outils** du message permet de choisir le profil, **1 à 5 images** et la politique du modèle texte : **Conserver**, **Répondre entre les images** ou **Décharger avant les images**. Le choix est figé pour chaque demande.

**Générer ce prompt directement** produit une seule image avec votre texte exact, sans préparation par le modèle de conversation. Le nettoyage ComfyUI facultatif intervient après chaque rendu ; il est distinct du déchargement des modèles texte. Voir [Images](docs/comfyui.md).

Préparez le lanceur dans **Paramètres → Serveurs sur le PC** : détection, choix du dossier et validation des chemins. **Configurer-serveurs.cmd** reste une alternative sur le PC. Le lanceur pilote l’API Bionic sélectionnée et les instances ComfyUI Python qu’il contrôle ; il ne prend pas en charge une instance externe simplement parce qu’elle répond. Arrêter le serveur Bionic coupe son API sans fermer son application Desktop. Voir [Serveurs sur le PC](docs/local-services.md).

## Permissions et accès

Dans **Outils fichiers**, **Modification** est le choix initial d’un nouveau chat ordinaire : les écritures autorisées sont immédiates, sans confirmation par fichier. Choisissez **Lecture** ou **Aucun** si vous n’en avez pas besoin. Les sauvegardes de remplacement et la corbeille ne remplacent pas une sauvegarde indépendante.

Le web est activé pour les nouveaux choix, sans écraser une désactivation explicite. Les images le sont lorsque ComfyUI est détecté et disponible. Les scripts restent désactivés par défaut. Vous pouvez demander un accord pour chaque recherche et URL. **Chaque script exige l’approbation de son code exact, puis s’exécute avec les droits du compte PC : ce n’est pas un bac à sable.** Les profils de fichiers ne limitent pas les droits d’un script approuvé.

Le compagnon est destiné à un **réseau local de confiance**. HTTP ne chiffre pas le code, les messages et les fichiers. Dans **Paramètres → Sécurité et accès**, préparez HTTPS, puis éventuellement un certificat par appareil avec mTLS. Ne contournez pas les alertes de certificat et n’exposez pas directement ce port sur Internet.

L’application ne fournit ni comptes séparés ni isolation entre utilisateurs autorisés. Gardez privés le code d’accès, `data/`, la configuration locale, les profils de lancement et les sauvegardes d’identité. Voir [Sécurité](SECURITY.md) et [Certificats](docs/certificats-utilisation.md).

## Mettre à jour et sauvegarder

Dans **Paramètres → Maintenance → Mises à jour**, choisissez Stable ou Bêta puis vérifiez les versions disponibles. L’installation demande votre accord ; les travaux actifs ou incertains peuvent la bloquer. Les checkouts Git se mettent à jour avec Git.

Avant une mise à jour manuelle, attendez la fin des travaux, arrêtez le compagnon et sauvegardez ses données privées ainsi que les dossiers de projets séparément. Une sauvegarde complète de `data/` inclut l’identité de certificats et doit rester protégée. La langue et les brouillons conservés dans le navigateur ne font pas partie de cette copie serveur.

Voir [Sauvegarde et mise à jour](docs/sauvegarde-mise-a-jour.md) et [Mises à jour proposées](docs/mises-a-jour.md).

## Documentation

| Besoin | Guide |
| --- | --- |
| Trouver le bon parcours | [Index de la documentation](docs/README.md) |
| Installer, discuter et gérer les fichiers | [Installation](docs/installation.md) · [Utilisation](docs/utilisation.md) |
| Images, mémoire et contrôle des serveurs | [ComfyUI](docs/comfyui.md) · [Serveurs sur le PC](docs/local-services.md) |
| Outils, permissions et accès sécurisé | [Outils](docs/outils-agents.md) · [Sécurité](SECURITY.md) |
| Régler les connexions ou résoudre un problème | [Configuration](docs/configuration.md) · [Dépannage](docs/depannage.md) |
| Contribuer ou préparer une distribution | [Contribution](CONTRIBUTING.md) · [Développement](docs/developpement.md) · [Publication](docs/publication.md) |
| Consulter les changements | [Journal des versions](CHANGELOG.md) |

## Compatibilité et licence

La cible principale est **Windows avec Node.js 24+**. La lecture des projets Bionic dépend de ses formats internes et peut nécessiter une adaptation après une mise à jour. Sur macOS et Linux, le démarrage par `npm start` est prévu, mais le parcours complet n’est pas qualifié. La prise en charge des outils, de la vision et de l’effort dépend du modèle ; les performances dépendent du matériel et des moteurs.

Le compagnon est sous [licence MIT](LICENSE). Cette licence ne couvre pas Bionic, ComfyUI, les modèles ou vos fichiers.
