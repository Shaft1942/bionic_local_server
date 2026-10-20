# Contribuer

Merci de proposer des améliorations reproductibles et adaptées à un usage personnel sur réseau local.

Avant une modification, lisez [Développement](docs/developpement.md), [Sécurité](SECURITY.md) et les [limites fonctionnelles](README.md). Pour une évolution importante, une issue courte permet d’expliquer le problème et le résultat souhaité avant de modifier largement l’application.

## Une contribution attendue

1. Travaillez dans votre fork ou une branche dédiée, avec une installation de test séparée.
2. Reproduisez le problème avec des projets, messages et fichiers fictifs.
3. Ajoutez une vérification utile pour une correction qui touche les écritures, l’accès réseau, la reprise ou la lecture des bases Bionic.
4. Exécutez les contrôles décrits dans [Développement](docs/developpement.md).
5. Actualisez les guides et le journal des versions si le comportement change.
6. Ouvrez une pull request avec le problème, la solution, les vérifications réalisées et les limites non vérifiées.

Le français est la langue des guides et de l’interface actuelle. Préservez une formulation accessible, les états d’erreur utiles et le fonctionnement sur téléphone. L’application utilise le JavaScript natif du navigateur et les modules Node.js ; évitez d’ajouter une dépendance ou une étape de compilation sans nécessité expliquée.

## Données et compatibilité

N’ajoutez jamais de conversations, registres, chemins personnels, jetons, captures réelles ou sauvegardes de projets. Les fixtures doivent être fabriquées pour les tests. N’utilisez pas l’écriture dans la base native Bionic comme raccourci pour synchroniser les réponses.

Si vous adaptez une nouvelle version de Bionic ou un autre système, précisez ce qui a été réellement validé. Ne remplacez pas la mention de compatibilité existante par une promesse plus large sur la seule base d’une compilation ou d’une capture.

## Licence

En proposant une contribution, vous acceptez qu’elle soit distribuée sous la [licence MIT](LICENSE) du projet. Ne copiez pas d’éléments propriétaires de Bionic ou de contenus personnels dans cette distribution.
