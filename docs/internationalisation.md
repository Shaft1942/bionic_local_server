# Langues de l’interface

Préparation de la 2.4 bêta : français et anglais. Dans Paramètres → Conversations et affichage → Langue de l’interface, le choix est appliqué immédiatement et enregistré dans ce navigateur, pour cette origine. HTTPS, un autre nom d’hôte ou un autre navigateur possèdent leur propre préférence. Au premier accès, les langues du navigateur sont consultées ; une variante régionale reconnue rejoint sa langue de base. Si aucune langue n’est reconnue, l’interface utilise le français.

La langue de l’interface ne fait pas partie des requêtes au modèle : aucun ajout au prompt, consigne système, changement des conversations ou traduction des réponses. Les noms, fichiers, extraits, code et textes saisis restent inchangés. Les formulaires et le message en cours restent ouverts lors d’un changement. Si le navigateur refuse le stockage, le choix reste utilisable dans l’onglet et les paramètres signalent qu’il n’est pas mémorisé.

## Organisation

- `public/i18n.js` : registre des langues (code, nom natif, locale et direction), résolution, stockage, traductions, pluriels et formats `Intl`.
- `public/locales/{fr,en}/{ui,app,settings,components}.js` : catalogues locaux chargés sans service de traduction ni dépendance d’exécution.
- `public/i18n-bootstrap.js` : application des libellés statiques avant les contrôleurs. Les textes HTML de secours restent en français si JavaScript n’est pas disponible.
- `data-i18n`, `data-i18n-title`, `data-i18n-placeholder`, `data-i18n-alt`, `data-i18n-aria-label` et `data-i18n-aria-valuetext` ciblent explicitement des textes d’interface. `data-i18n-initial` est retiré après l’amorçage pour les emplacements ensuite possédés par un contrôleur. Aucun balayage du texte utilisateur.
- `BionicI18n.t(key, params)`, `number` et `date` sont utilisés pour les textes dynamiques ; `onChange` actualise les contrôles existants sans relancer les opérations serveur. `bindText` et `bindAttribute` permettent les contrôles localisés dans les blocs de messages sans toucher au code ou à la réponse.

Les clés de catalogue sont stables. Les domaines dynamiques utilisent des noms sémantiques. Les clés `ui.<empreinte>` proviennent de l’extraction initiale de l’HTML français : leur empreinte est un identifiant opaque, pas un calcul à refaire quand le texte change. Modifier les deux valeurs de catalogue sous la même clé ; garder le texte français HTML de secours cohérent. Les nouveaux textes peuvent utiliser des clés sémantiques comme `ui.language.label`.

Une traduction manquante utilise le français, puis affiche la clé si elle n’existe dans aucun catalogue. Les paramètres `{name}` restent du texte ; ils ne sont jamais injectés par `innerHTML`. Le nombre `count` choisit une catégorie avec `Intl.PluralRules` et se formate avec la locale ; les autres paramètres se formatent explicitement avec `number`/`date` quand ils représentent une mesure. Les valeurs de champs et d’API restent au format technique (par exemple le point décimal JSON).

## Ajouter une langue

1. Ajouter ses métadonnées au tableau `languages` de `public/i18n.js`, avec son nom natif, sa locale et `dir: 'ltr'` ou `'rtl'`. Le sélecteur utilise ce registre ; aucun nouveau branchement de paramètres n’est nécessaire.
2. Créer les quatre catalogues dans `public/locales/<code>/`, en reprenant les mêmes clés et paramètres. Traduire des phrases entières ; prévoir toutes les catégories de pluriel utiles à cette locale et au minimum `other`. Ne pas concaténer des fragments pour construire une phrase nouvelle.
3. Charger les catalogues avant `i18n-bootstrap.js` dans l’HTML ; les ajouter à la liste fermée `STATIC` de `server.mjs` et à `release-manifest.json`. Étendre la liste des répertoires de `scripts/check.mjs` et celle des langues dans les tests de parité.
4. Vérifier la traduction, la recherche de paramètres, les libellés d’accessibilité, les nombres/dates et les phrases longues en largeur 320 et 1280 px. Pour une langue RTL, la direction du document est prévue ; adapter et vérifier les dispositions et icônes directionnelles avant de déclarer cette langue prise en charge. Le français et l’anglais seuls sont livrés ici.

Un modèle comme Qwen peut préparer un catalogue, suivi d’une relecture humaine et des mêmes vérifications de clés, paramètres et comportement. Le traducteur fonctionne entièrement localement avec les catalogues livrés.

## Périmètre et vérification

L’interface web, son aide et ses libellés sont localisés. Les diagnostics ou erreurs libres renvoyés par Bionic, ComfyUI, le système et les extensions, les historiques déjà enregistrés, les notes de version distantes et la documentation/les installateurs du PC conservent leur langue source. Les capacités serveur connues sont traduites par correspondance exacte ; une description nouvelle reste intacte. Pour étendre les messages serveur, préférer des codes stables avec paramètres plutôt qu’une traduction approximative de données libres.

Commandes de vérification : `npm run check`, `node --test test/i18n.test.mjs`, `npm test`, `npm run check:export`, et `node scripts/browser-i18n.mjs` avec Playwright de développement disponible. Les tests utilisent des données et API synthétiques ; ils ne valident ni modèle réel, ni téléphone physique, ni réseau local.
