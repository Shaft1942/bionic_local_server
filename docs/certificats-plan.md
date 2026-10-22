# Certificats serveur et clients : fiche d’implémentation

22 octobre 2026 — cadrage accepté, implémentation non commencée.
Branche `codex/certificats`, base V2 `a948b1926e139ba72046195951911ac16af30f2a`.
Cette préparation porte uniquement sur cette fiche ; elle n’active aucun service.

## Parcours retenu

| Niveau persistant | Accès distant au compagnon |
| --- | --- |
| HTTP initial | Code d’accès existant, échanges non chiffrés sur réseau de confiance. |
| HTTPS | Certificat serveur reconnu par l’appareil, code et session conservés comme mécanismes d’accès. |
| HTTPS + certificat client (mTLS) | Protection précédente et certificat individuel valide obligatoire pour chaque appareil. |

Une autorité de certification (CA) est créée par installation. Sa clé privée reste
protégée sur le PC ; chaque appareil reçoit sa propre identité. Aucun secret de
clé privée, notamment une archive client PKCS#12, ne transite en HTTP.
La confiance initiale se vérifie depuis le PC par transfert fiable ou comparaison
de l’empreinte publique. L’ajout ultérieur d’un appareil est autorisé depuis le PC
sans rouvrir l’application distante en HTTP ou sans certificat client.

La montée est préparée puis confirmée après une connexion réelle au niveau cible,
avant fermeture de l’ancien accès. Une préparation échouée conserve le niveau
précédent ; un niveau confirmé ne recule jamais automatiquement, même en cas de
certificat expiré, de clé absente ou d’erreur au démarrage.

## Lots à réaliser

1. **Identité et certificats** : stockage privé séparé des conversations, droits
   Windows restreints, certificats serveur/client aux usages distincts, registre
   des appareils, expiration, renouvellement et révocation. Choisir un outil de
   signature maintenu et une méthode d’import compatible avec les appareils
   cibles ; aucun outil ni téléchargement n’est ajouté dans cette préparation.
2. **Transport et sessions** : HTTPS/mTLS natif Node, contrôle du certificat puis
   de l’appareil autorisé avant tout accès privé, cookies `Secure`, invalidation
   des anciennes sessions à la montée. Adapter les contrôles Host/Origin et les
   adresses affichées ; couvrir le nom ou l’IP réellement utilisé dans les SAN
   du certificat serveur. Vérifier les connexions persistantes et la reprise TLS.
3. **Parcours et récupération** : assistant de confiance et d’enrôlement, contrôle
   effectif avant confirmation, statut du niveau et des expirations, ajout/retrait
   d’appareils. L’import et la confiance système restent des actions explicites ;
   un viewport mobile ne valide pas leur fonctionnement sur téléphone physique.
4. **Exploitation et distribution** : adapter installation, arrêt, redémarrage,
   diagnostic, déconnexion et mise à jour. Si un canal d’administration HTTP est
   conservé, le lier uniquement à la boucle locale, avec secret local et routes
   limitées ; ne pas y servir l’application ni un parcours de récupération LAN.
   Préserver niveau et PKI aux mises à jour, exclure les secrets des archives et
   diagnostics ; ajouter les nouvelles sources publiques au manifeste à l’intégration.

## Récupération depuis le PC serveur

- **Un appareil perdu** : révoquer son certificat et ses sessions, puis enrôler
  son remplaçant. Les autres appareils conservent leur accès.
- **Recommencer tout le parcours** : action locale explicite « Réinitialiser les
  accès sécurisés » dans l’installateur, nouvelle identité de sécurité et retrait
  des anciens accès/certificats/sessions. Le retour au HTTP initial, s’il est
  choisi, fait partie de cette action locale ; aucun échec distant ne le déclenche.
- Conserver chats, pièces jointes, livrables, sauvegardes et fichiers projets.
  La réinstallation actuelle conserve `data/` : elle ne suffit pas à remettre
  l’identité à zéro. Les restaurations gérées doivent traiter séparément données
  et identité, sans réimporter silencieusement d’anciens droits. Une restauration
  manuelle complète d’un ancien état reste hors de cette garantie applicative.

## Critères de recette et preuves attendues

Tous les critères ci-dessous restent **à exécuter** dans le futur lot.

| ID | Critère | Preuve attendue |
| --- | --- | --- |
| T01 | HTTP initial compatible avec une installation V2 existante. | Fixture ancienne : code, chats, fichiers et routes existantes. |
| T02 | HTTPS reconnu pour l’adresse utilisée ; certificats étrangers, mauvais SAN et expirés refusés par le client. | Connexions TLS réelles, sans désactivation de validation. |
| T03 | Après confirmation HTTPS, aucun accès privé HTTP LAN ; anciennes sessions invalidées, cookies sécurisés. | Essais réseau positifs/négatifs et vérification des cookies. |
| T04 | mTLS refuse certificat absent, inconnu, expiré, révoqué ou issu d’une autre installation, même avec code/cookie valide. | Matrice TLS et contrôle du registre d’appareils. |
| T05 | Deux appareils ont deux identités ; retirer A ne retire pas B. Ajouter C ne rouvre pas un accès moins sécurisé. | Enrôlement/révocation réels, sessions actives et reprise TLS incluses. |
| T06 | Niveau confirmé conservé après redémarrage, mise à jour, clé absente ou certificat expiré ; aucun repli LAN. | Essais d’erreur et migration en installation isolée. |
| T07 | Récupération totale exclusivement locale, anciens accès invalidés, conversations/fichiers conservés. | Refus distant ; inventaires et empreintes avant/après sur données fictives. |
| T08 | Renouvellement, changement d’adresse et ajout d’appareil possibles après activation mTLS. | Parcours depuis le PC, connexions vérifiées aux nouvelles identités/adresses. |
| T09 | Lanceurs, diagnostic et mises à jour utilisables aux trois niveaux ; restauration ou retour de version gérés sans recul silencieux. | Recette Windows isolée ; incompatibilité bloquée explicitement. |
| T10 | Aucune clé privée dans Git, distribution, diagnostic ou réponse HTTP ; aucune CA commune aux installations. | Contrôle des sorties/export et comparaison de deux installations neuves. |
| T11 | Import, confiance serveur et présentation du certificat client réellement utilisables sur les appareils cibles. | Essais sur téléphone/tablette physiques, OS et navigateur consignés ; captures sans secrets. |

## Points d’intégration et références

- `server.mjs` : création HTTP, sessions, Host/Origin, adresses et administration.
- `Installation-commun.ps1`, `Installer.ps1`, `Bionic-mobile-commun.ps1`,
  `Arreter.ps1`, `scripts/revoke-sessions.mjs`, `lib/update-installer.mjs` :
  configuration, sondes et maintenance actuellement liées au HTTP local.
- Documentation : sécurité, installation, configuration, sauvegarde et mise à jour.
- [TLS Node.js : certificats clients et refus des connexions non autorisées](https://nodejs.org/api/tls.html#tlscreateserveroptions-secureconnectionlistener).
- [Apple : confiance explicite pour les profils de certificats installés manuellement](https://support.apple.com/en-us/102390).

La recette devra distinguer tests automatisés, TLS sur sockets réelles, essais
Windows et appareils physiques. Cette fiche ne constitue aucune de ces preuves.
L’intégration du code et la recette se feront séparément, sans utiliser l’instance
active ni interrompre les travaux ComfyUI.
