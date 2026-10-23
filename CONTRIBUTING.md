# Contribuer / Contributing

Le compagnon vise un usage personnel sur réseau local. Proposez des changements reproductibles avec des données fictives et une description de leurs limites.

1. Travaillez dans un fork ou une branche et une installation de test séparée.
2. Lisez [Développement](docs/developpement.md) et [Sécurité](SECURITY.md).
3. Ajoutez une vérification utile pour les changements d’accès, d’écriture, de réseau ou de reprise ; évitez les tests qui recopient le texte d’un guide.
4. Exécutez les contrôles pertinents, actualisez les guides et le [journal des versions](CHANGELOG.md).
5. Décrivez dans la pull request le problème, le résultat, les commandes réellement exécutées et les points non vérifiés.

L’interface et l’accueil du dépôt sont disponibles en français et en anglais. Toute modification d’un libellé conserve la parité des catalogues et leurs paramètres. Pour ajouter une langue, suivez le [guide d’internationalisation](docs/internationalisation.md). Les conversations, fichiers et prompts ne doivent pas être traduits par le choix de langue de l’interface.

N’ajoutez jamais de données d’installation, historiques, profils de lancement, chemins personnels, accès, journaux bruts ou captures privées. Les méta-prompts, traces d’agents et preuves de poste n’appartiennent pas à ce dépôt produit. Les exemples neutres, tests et scripts de développement reproductibles restent des sources publiques utiles.

Les historiques natifs Bionic restent en lecture seule. Une évolution du schéma Bionic ou une adaptation à un autre système précise ce qui a été réellement testé. Aucun moteur, modèle ou composant propriétaire Bionic n’est inclus.

## English

Use a separate branch and test installation, reproduce issues with synthetic data, and run the checks in [Development](docs/developpement.md). Describe the problem, resulting behavior, actual validation and remaining limits in your pull request. See the [English guide](docs/en/guide.md) for product usage.

Keep French and English catalogue keys and parameters aligned. UI language must not translate user files, messages, prompts or model responses. See [Internationalization](docs/internationalisation.md) before adding a language.

Never commit installation data, launcher profiles, native histories, credentials, personal paths, raw logs or private screenshots. Internal agent prompts and workstation reports stay outside this product repository. Native Bionic histories are read-only.

Contributions use the project’s [MIT license](LICENSE), which does not cover Bionic, models or users’ documents.
