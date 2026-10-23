# Sécurité et données privées

[Documentation française](docs/README.md) · [English usage and safety](docs/en/guide.md)

## Périmètre

Bionic Mobile est un compagnon personnel pour un **réseau local de confiance**. Il ne fournit ni comptes distincts, ni rôles, ni isolation entre utilisateurs : chaque appareil autorisé partage le périmètre du compagnon. N’exposez pas le port sur Internet, n’ajoutez pas de redirection NAT et n’utilisez pas un réseau public ou invité non maîtrisé.

Le navigateur contacte le compagnon ; les appels à l’API Bionic restent en boucle locale. Les outils web envoient les recherches et URL aux services concernés. Un accès chiffré ne protège pas contre un compte Windows compromis, un script approuvé ou un document piégeant un modèle.

## Connexions et certificats

Le premier accès utilise HTTP et un code aléatoire propre à l’installation. Sur ce transport, code, messages et fichiers ne sont pas chiffrés entre appareil et PC. Dans **Paramètres → Sécurité et accès → Sécurité des connexions**, préparez HTTPS, importez l’autorité publique et vérifiez l’adresse et son empreinte par un canal fiable avant activation. Ne contournez pas un avertissement de certificat.

Les clés de l’autorité et du serveur restent sur le PC. Le certificat privé PKCS#12 d’un appareil se télécharge uniquement depuis une session HTTPS authentifiée, une seule fois pendant cinq minutes. Son mot de passe est affiché une fois puis effacé à la fermeture du panneau ; il n’est pas mis dans une URL ni stocké dans le navigateur. **La clé privée de l’autorité ne doit jamais être transférée sur un appareil.** Le certificat client obligatoire (mTLS) est facultatif et distinct de la confiance HTTPS.

La preuve de connexion utilise un port TLS distinct et un ticket à usage unique. Après confirmation d’une montée de sécurité, une panne, expiration ou clé manquante ne réactive pas automatiquement HTTP. Le canal de maintenance reste en boucle locale, avec des routes limitées et un secret d’administration ; il n’expose pas l’application ni les archives privées.

En mTLS, la chaîne et le registre de l’appareil sont contrôlés et les sessions sont liées au certificat. Le renouvellement conserve l’ancien accès jusqu’au retrait explicite ; les révocations ferment les connexions concernées. La récupération totale exige une action locale explicite, serveur arrêté : elle renouvelle les accès en préservant les conversations et fichiers. Une restauration manuelle d’une ancienne sauvegarde peut restaurer une ancienne identité.

Consultez le [parcours certificats](docs/certificats-utilisation.md) pour l’import et le dépannage, et la [documentation technique](docs/certificats-signature.md) pour signature et stockage.

## Fichiers, outils et serveurs

- Les sessions utilisent un cookie `HttpOnly`, `SameSite=Strict`, et des contrôles d’hôte/origine. Les requêtes, lectures, imports et étapes d’outils sont bornés.
- Les historiques natifs sont lus sans écriture. Les chemins autorisés, liens symboliques, catégories sensibles et versions de fichiers sont contrôlés ; des sauvegardes ou une corbeille accompagnent les mutations prévues.
- **Modification** est le profil fichiers d’un nouveau chat ordinaire. Il autorise des écritures directes sans accord par fichier. Choisissez **Lecture** ou **Aucun** lorsque ces droits ne sont pas nécessaires, notamment face à un document non fiable.
- Internet est activé par défaut pour les nouveaux choix de conversation ; une désactivation explicite reste respectée. Les scripts restent désactivés et exigent toujours un accord sur chaque proposition. La validation facultative des recherches/URL est distincte de l’autorisation web. L’extraction web est passive, sans JavaScript, avec contrôle des adresses et redirections.
- **Chaque script exige un accord sur son code exact puis utilise les droits du compte PC : ce n’est pas un bac à sable.** Le dossier du projet, le profil Lecture et l’accord web ne limitent pas ses accès au PC/réseau. L’arrêt ou le délai ne garantit pas l’annulation des effets ou l’arrêt de descendants. Une sauvegarde indépendante reste nécessaire.
- Le lanceur utilise des profils préparés sur le PC ; le modèle et le téléphone ne construisent pas de commandes libres. Il distingue identité, API et activité, refuse les contrôles incertains et protège les travaux suivis par le compagnon. Le réglage d’usage dédié est une convention : aucun verrou n’empêche un client externe de contacter le moteur.
- Après une réponse perdue, un résultat incertain ou un redémarrage, les opérations ne sont pas automatiquement rejouées. Consultez le suivi avant toute nouvelle demande.

Ces protections ne constituent pas un audit exhaustif. Le filtrage de fichiers ne garantit pas qu’un document autorisé ne contient aucun secret. Les outils et scripts sont détaillés dans [Outils](docs/outils-agents.md) ; les profils dans [Serveurs sur le PC](docs/local-services.md).

## Données exclues du dépôt et des archives

Ne partagez jamais `ACCES-PRIVE.txt`, `config.local.json`, `config.launchers.local.json`, `.env*`, jetons, clés ou exports PKCS#12. Gardez privés `data/`, `runtime/`, historiques natifs, registres de projets, sauvegardes, imports et captures personnelles. Les traces d’agents et relevés d’un poste restent hors du dépôt produit. Les exemples et fixtures sont fabriqués.

Le `.gitignore` ne retire pas un fichier déjà suivi. La [distribution](docs/publication.md) doit provenir de la liste fermée des sources revues, jamais d’une copie de l’installation active. Une sauvegarde contenant accès ou certificats exige la même protection que l’original.

Si un secret est exposé, arrêtez sa diffusion, retirez les copies publiques, renouvelez-le auprès du service propriétaire et examinez historique Git, releases et autres copies. Effacer le dernier fichier ne rend pas le secret à nouveau confidentiel.

## Signaler un problème

Utilisez **Security → Advisories → Report a vulnerability** dans le [dépôt](https://github.com/Shaft1942/bionic_local_server) si ce parcours est disponible. Sinon, ouvrez une issue minimale demandant un canal privé, sans secret ni détail d’exploitation. Donnez versions, périmètre et reproduction fictive. Aucun délai de traitement n’est garanti.
