# Chat — bêta 7

La bêta 7 rétablit trois fonctions du chat présentes dans l'ancienne interface.

- Les images générées apparaissent dans le message qui les a demandées, avec leur état et des liens d'ouverture et de téléchargement. Le suivi continue lorsque le texte de la réponse est terminé et reprend au rechargement. La galerie et la quantité de 1 à 5 images restent disponibles.
- Chaque message utilisateur ou assistant dispose d'une commande Copier. Elle copie le texte original, y compris le Markdown et les blocs de code. En HTTP sur le réseau local, un mécanisme compatible est essayé ; en cas de refus du navigateur, une sélection manuelle est proposée.
- Chaque réponse affiche les tokens de sortie, la durée totale, le débit et l'attente lorsqu'ils sont disponibles. Le détail donne les mesures supplémentaires fournies par le moteur. Une mesure absente reste indiquée comme indisponible ; aucun token n'est déduit du texte. Un débit calculé à partir d'une durée observée est signalé comme approximatif.

Les métriques mesurables des réponses arrêtées ou échouées sont conservées comme partielles. Les anciens messages ne possédant pas ces données ne reçoivent pas de mesures inventées. La durée du message texte et l'état d'un rendu graphique sont deux informations distinctes.

Les corrections se limitent à ces régressions et à leur contrat de flux/persistance. Elles conservent les profils, droits, lots d'images, contrôleurs et protections de la bêta 6.

Vérifications reproductibles sur fixtures synthétiques : `npm run test:browser:beta7-images`, `npm run test:browser:beta7-copy` et `npm run test:browser:beta7-stats`. Elles ne demandent aucun modèle ni GPU réels. Les essais sur une installation active constituent une qualification séparée.
