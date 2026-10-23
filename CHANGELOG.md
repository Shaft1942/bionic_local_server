# Journal des versions

Les entrées décrivent les évolutions du produit. Les comptes rendus de travail, mesures d’un poste, plans et prompts internes ne font pas partie de cette documentation. Les versions effectivement disponibles sont dans les [Releases](https://github.com/Shaft1942/bionic_local_server/releases).

## 2.5.0 — 2026-10-23

- Interface **français/anglais**, choix mémorisé par navigateur et indépendant de la langue des conversations, prompts et fichiers. README et guide d’usage anglais ajoutés ; documentation réorganisée, synthétisée et débarrassée des traces internes.
- Images ComfyUI : **1 à 5 images par demande**, file commune, choix de conserver/décharger le modèle texte ou de répondre entre les images, préférences par demande et brouillon. Annulation des images encore locales, relance à graine identique ou nouvelle, aperçu, galerie et téléchargement ZIP. **Livrables → Génération** rassemble les images du projet.
- **Serveurs sur le PC** : configuration locale, suivi et commandes manuelles Bionic/ComfyUI avec confirmations, contrôle d’identité et récupération sans rejeu. Les travaux connus ou incertains et les attentes GPU protègent les opérations incompatibles.
- Projets locaux et adoption explicite de dossiers/droits ; pagination des messages, index dérivé et cache borné. Historiques natifs toujours en lecture seule.
- Fiabilité : réservations par phase, attente des chargements et nettoyages avant libération, checkpoints et arrêt bornés, flux lents récupérables et isolement des suivis illisibles. Une soumission incertaine n’est pas renvoyée automatiquement.
- Fenêtres et menus fermables au clic extérieur, focus/clavier préservés ; reconnexion en haut. Guide certificats revu et version installée discrète dans les paramètres.

La distribution conserve Node.js 24+ et les canaux Stable/Bêta. Les configurations, accès et données restent locaux. Les limites et la procédure de mise à jour sont dans [la documentation](docs/README.md).

## Versions précédentes

| Version | Principales évolutions |
| --- | --- |
| 2.3.0 | Paramètres par rubrique, Maintenance/Aide séparées, lecture des conversations et configuration ComfyUI guidée |
| 2.1.0 | Gestion HTTPS/mTLS depuis le navigateur, contexte actualisé au changement de modèle, module mémoire ComfyUI fourni |
| 2.0.0 | Plafonds de réponse par modèle/conversation, Hassaku XL et Krea 2 avec deux LoRA par profil, projets repliables |
| 1.11.0 / 1.10.0 | Améliorations du compagnon, de l’installation et des outils de navigation web |
| 1.9.0 | Mises à jour proposées avec vérification de compatibilité, empreintes et sauvegarde |
| 1.8.0 | Outils, validations de scripts et branches de conversations |
| 1.5.0 | Première génération du compagnon et consultation des projets depuis le navigateur |

Les détails des anciennes préversions restent dans l’historique Git et les notes des Releases correspondantes.
