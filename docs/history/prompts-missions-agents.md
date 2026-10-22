# Missions d’audit rédigées et exécutées

Trois agents ont été lancés en parallèle à la demande de l’utilisateur, dans le même chat. Ils ont produit leurs rapports indépendants et des vérifications ciblées ; l’agent principal a ensuite exécuté les prompts avec le modèle réel et consolidé les conclusions.

## Agent 1 — audit_compagnon

```text
Audit en lecture seule du Compagnon Local. Source connue E:\AI\ChatGPT\2026-10-19\je-voudrais-3\outputs\bionic-mobile-github ; installation probable outputs\bionic-mobile. Vérifie AGENTS.md applicables avant exploration. Objectif : inventorier outils réellement exposés au modèle, boucle tool_calls, fichiers lecture/écriture, web, exécution scripts/PowerShell/cmd/Python, approvals, limites, routage Bionic, MCP/skills, erreurs et plafonds (2048 tokens signalé). Distingue outils propres au compagnon et outils natifs Bionic. Pas de modification, génération modèle ou redémarrage, pas de contenu personnel ni secrets. Écris rapport précis avec références fichier:ligne dans E:\AI\ChatGPT\2026-10-22\quelle-ia-serait-capable-de-faire\work\audit-compagnon-agent.md. Tu peux exécuter tests unitaires ciblés isolés existants si aucun effet sur l'installation ; précise simulation vs réel. Envoie conclusion concise et chemin.
```

Précision transmise pendant l’audit : le processus actif se trouve dans le dossier Desktop nommé v1.9.0 mais sert la version 1.10.0 ; ne pas le confondre avec l’ancienne copie 1.7.0. L’agent principal réalise les essais de modèle réel, distincts de cette inspection.

## Agent 2 — audit_desktop

```text
Audit en lecture seule des capacités de Bionic Desktop classique sur ce PC et documentation primaire actuelle. Vérifie AGENTS.md éventuels et inventorie version installée, agent natif (shell, cmd/PowerShell, fichiers, internet, MCP, skills, subagents si vérifiable), surfaces API dont /v1/chat/completions vs /api/v1/chat et intégrations. Ne lance aucun modèle, n'ouvre/modifie aucune conversation personnelle, n'exécute aucune commande via UI Bionic, ne lis/affiche aucun secret. Cherche installation/ressources publiques ciblées, config seulement noms/drapeaux publics si nécessaire. Vérifie docs LM Studio Bionic avec web. Ne transpose pas les fonctions LM Studio classique à Bionic sans preuve. Rapport avec preuves chemin:ligne et URLs ; distinctions vérifié local/documenté/non testé, dans E:\AI\ChatGPT\2026-10-22\quelle-ia-serait-capable-de-faire\work\audit-desktop-agent.md. Conclusion concise et chemin au parent.
```

Précisions transmises : application active E:\AI\Bionic\Bionic.exe ; les restrictions du sandbox sur les processus et sockets ne doivent pas être interprétées comme une absence d’application. Examiner le contrat `integrations` de l’API native sans assimiler ses MCP au shell, skills et contexte Desktop. L’agent principal réalise la sonde MCP éphémère locale.

## Agent 3 — audit_ecarts

```text
Audit indépendant en lecture seule des limites et écarts du Compagnon Local par rapport à Bionic Desktop. Source E:\AI\ChatGPT\2026-10-19\je-voudrais-3\outputs\bionic-mobile-github. Vérifie AGENTS.md. Cherche tests existants outil web/script/fichiers, limites sandbox, approbations, réseau/LAN, intégrations MCP/skills, antécédents journaux fictifs vs réels, visibilité preuves aux utilisateurs, limites de réponse, retries. Prépare 4-6 prompts d'audit reproductibles (web, fichier temporaire, cmd/Powershell, environnement local, appel endpoint local/ComfyUI, inventaire outils) à exécuter isolément sans effet sur données utilisateur. Tu peux lancer tests unitaires ciblés isolés sans contacter modèles ni installation live. Ne modifie pas le produit ; ne contacte pas autres chats. Rapport preuves fichier:ligne et résultats tests dans E:\AI\ChatGPT\2026-10-22\quelle-ia-serait-capable-de-faire\work\audit-ecarts-agent.md. Distingue absent natif vs remplaçable par script. Envoie conclusion et chemin.
```

Précisions transmises : distinguer les erreurs EPERM liées au dossier temporaire protégé d’un défaut produit ; vérifier que la version active correspond au code source audité ; ne pas compter une réponse de modèle comme preuve d’exécution sans reçu d’outil.

## Travail de consolidation exécuté par l’agent principal

```text
Lire les deux chats référencés avant d’en utiliser les informations. Identifier le processus du port 8769 et la version servie en mémoire. Vérifier les empreintes du code de production. Créer un projet et des conversations synthétiques isolés, puis envoyer des prompts au modèle déjà chargé à travers les vraies routes HTTP du compagnon. Vérifier fichiers, web, PowerShell/CMD, Python, Node, accès HTTP local ComfyUI et refus attendu du lecteur web. Accepter uniquement les programmes de lecture prédéfinis, via la route d’approbation. Ne pas changer la configuration ni les conversations existantes et ne pas soumettre de génération ComfyUI. Sonder séparément le contrat MCP natif avec un outil éphémère inerte et store:false. Consolider les résultats réels, simulés, statiques et inconnus dans une comparaison et des preuves exportables.
```

Les neuf prompts effectivement envoyés à Gemma sont conservés dans [prompts-audit-reel.md](prompts-audit-reel.md). Le prompt et le résultat de la sonde MCP sont dans [preuves-api-native-mcp.json](preuves-api-native-mcp.json).
