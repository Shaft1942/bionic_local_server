[Index de la documentation](README.md) · [English guide](en/guide.md#interface-language)

# Langues de l’interface

## Utiliser le français ou l’anglais

Dans **Paramètres → Langue et brouillons → Langue de l’interface**, choisissez Français ou English. Le choix est appliqué immédiatement et enregistré dans ce navigateur, pour cette origine. Un autre navigateur, nom d’hôte, protocole ou port possède sa propre préférence. Au premier accès, les langues du navigateur sont consultées ; une variante régionale reconnue rejoint sa langue de base. Si aucune langue n’est reconnue, l’interface utilise le français.

La langue de l’interface ne fait pas partie des requêtes au modèle : aucun ajout au prompt, consigne système ou traduction des réponses. Messages, prompts d’images, noms, fichiers, extraits et code restent inchangés. Demandez la langue de réponse souhaitée dans votre message. Les formulaires et le message en cours restent ouverts lors d’un changement. Si le navigateur refuse le stockage, le choix reste utilisable dans l’onglet et les paramètres signalent qu’il n’est pas mémorisé.

L’interface web et son aide sont disponibles dans les deux langues. Le [README anglais](../README.en.md) et le [guide anglais](en/guide.md) couvrent l’installation et les usages courants ; les autres guides techniques, installateurs et scripts du PC restent principalement en français. Les diagnostics libres de Bionic, ComfyUI, du système ou des extensions, les historiques et les notes de version distantes conservent leur langue source.

## Contribuer aux traductions

Les traductions sont locales, sans service distant ni dépendance d’exécution. Les cinq catalogues de chaque langue sont dans `public/locales/{fr,en}/` : `ui.js`, `app.js`, `settings.js`, `components.js` et `local-services.js`. Corrigez une traduction sous sa clé existante et conservez les mêmes paramètres dans toutes les langues. Le français est le repli d’une entrée manquante ; une clé absente partout s’affiche telle quelle.

| Source | Responsabilité |
| --- | --- |
| `public/i18n.js` | Registre des langues, résolution, stockage, traductions, pluriels et formats `Intl` |
| `public/i18n-bootstrap.js` | Amorçage des libellés statiques avant les contrôleurs |
| `public/locales/<langue>/` | Catalogues et vocabulaire des fonctions |
| `public/index.html` | Textes français de secours et attributs de traduction explicites |
| `test/i18n.test.mjs`, `scripts/browser-i18n.mjs` | Parité des catalogues et parcours de changement de langue |

Les clés de catalogue sont stables. Les clés `ui.<empreinte>` issues de l’extraction initiale sont des identifiants opaques : ne recalculez pas leur empreinte lorsque le texte change. Modifiez les valeurs sous la même clé et gardez le texte français HTML de secours cohérent. Pour les nouveaux textes, préférez des clés sémantiques.

Traduisez des phrases entières, avec leur contexte d’usage, plutôt que des fragments à concaténer. Conservez les paramètres `{name}`. Ils restent du texte et ne sont pas injectés par `innerHTML`. `count` sélectionne un pluriel via `Intl.PluralRules` et se formate selon la locale. Utilisez `number` et `date` pour les autres mesures ; les valeurs techniques des formulaires et API conservent leur format, notamment le point décimal JSON.

Les attributs `data-i18n`, `data-i18n-title`, `data-i18n-placeholder`, `data-i18n-alt`, `data-i18n-aria-label` et `data-i18n-aria-valuetext` ciblent uniquement les textes d’interface. `data-i18n-initial` est retiré après l’amorçage pour les emplacements ensuite gérés par un contrôleur. Aucun balayage du texte utilisateur n’est prévu.

Pour les textes dynamiques, utilisez `BionicI18n.t(key, params)`, `number` et `date`. `onChange` actualise les contrôles sans relancer les opérations serveur ; `bindText` et `bindAttribute` localisent les contrôles à l’intérieur des messages sans toucher à leur contenu. Les capacités serveur connues sont traduites par correspondance exacte ; une description inconnue reste intacte. Préférez des codes serveur stables avec paramètres à la traduction approximative de messages libres.

## Ajouter une langue

1. Ajoutez ses métadonnées au tableau `languages` de `public/i18n.js` : code, nom natif, locale et direction `ltr` ou `rtl`. Le sélecteur utilise ce registre.
2. Créez les cinq catalogues dans `public/locales/<code>/`, avec les mêmes clés et paramètres. Prévoyez les catégories de pluriel de cette locale, dont `other`.
3. Chargez les catalogues avant `i18n-bootstrap.js` dans l’HTML. Ajoutez leurs fichiers à la liste statique autorisée de `server.mjs` et à `release-manifest.json`, leur dossier aux contrôles de `scripts/check.mjs`, puis adaptez les tests de parité et les parcours navigateur à la langue ajoutée.
4. Vérifiez les phrases longues à 320 et 1280 px, la recherche des paramètres, les libellés accessibles, les nombres et les dates. Pour une langue RTL, vérifiez aussi les dispositions et icônes directionnelles avant de la déclarer prise en charge.

Seuls le français et l’anglais sont livrés. Une traduction préparée par un modèle doit recevoir une relecture linguistique et les mêmes contrôles de parité et de comportement.

## Vérifier une modification

Depuis la racine du dépôt applicatif :

```sh
npm run check
npm run check:docs
node --test test/i18n.test.mjs
npm run test:browser:i18n
```

Le parcours navigateur demande Playwright, installé comme dépendance de développement. Avant une distribution, exécutez aussi `npm test` et `npm run check:export`, selon le [guide de développement](developpement.md). Les vérifications utilisent des données synthétiques : elles ne qualifient ni un modèle réel, ni un téléphone physique, ni le réseau local.
