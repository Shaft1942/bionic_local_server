# Prompts exécutés pour l’audit

Modèle déjà chargé : `google/gemma-4-12b-qat`. Chaque prompt ouvre une conversation synthétique indépendante. Raisonnement désactivé pour ces essais courts.

## P1-fichiers

Droits : fichiers=write, web=false, scripts=false.

```text
Audit de fichiers dans le projet temporaire uniquement. Lis source-audit.txt avec read_project_file. Crée resultat-audit.txt avec write_project_file, en conservant exactement son contenu, puis remplace uniquement Etat=initial par Etat=verifie avec replace_project_text. Relis resultat-audit.txt pour vérifier. N'utilise pas de script. Réponse finale en 3 lignes maximum, avec le marqueur réellement lu et les actions confirmées.
```

## P2-lecture-web

Droits : fichiers=none, web=true, scripts=false.

```text
Audit web réel. Appelle read_web_page pour lire exactement https://example.com/ puis donne le titre et une courte phrase du contenu effectivement obtenu, avec URL. Pas de recherche, pas de script, pas de réponse de mémoire. Si échec, annonce l'erreur. Réponse en 4 lignes maximum.
```

## P3-recherche-web

Droits : fichiers=none, web=true, scripts=false.

```text
Audit de recherche Internet. Appelle search_web avec la requête exacte : ComfyUI official server API prompt history. Si la recherche fonctionne, appelle read_web_page sur une source officielle obtenue puis cite son URL et un fait vérifié. Si le moteur refuse la recherche, indique le refus exact et arrête sans inventer de liens, sans nouvelle recherche ni script. Réponse en 5 lignes maximum.
```

## P4-powershell-cmd

Droits : fichiers=none, web=false, scripts=true.

```text
Audit réel PowerShell et CMD, dans ce projet de test. Appelle run_project_script avec runtime=powershell, directory vide, timeoutSeconds=15 et exactement ce code, sans ajout ni reformulation :
Write-Output ('PS=' + $PSVersionTable.PSVersion.ToString()); & cmd.exe /d /c ver
Attends le résultat de l'outil puis rapporte les versions et exitCode. N'écris aucun fichier et ne liste pas les variables d'environnement. Réponse finale en 4 lignes maximum.
```

## P5-python

Droits : fichiers=none, web=false, scripts=true.

```text
Audit réel Python. Appelle run_project_script avec runtime=python, directory vide, timeoutSeconds=15 et exactement ce code :
import sys, os
print('PY=' + sys.version.split()[0])
print('CWD=' + os.getcwd())
Attends le résultat et rapporte la version Python, le dossier de travail et exitCode. Aucun autre code ou outil. Réponse finale en 4 lignes maximum.
```

## P6-node

Droits : fichiers=none, web=false, scripts=true.

```text
Audit réel Node.js. Appelle run_project_script avec runtime=node, directory vide, timeoutSeconds=15 et exactement ce code :
console.log(JSON.stringify({platform:process.platform,node:process.version,cwd:process.cwd()}));
Attends le résultat et rapporte plateforme, version et exitCode. Aucun autre code ou outil. Réponse finale en 4 lignes maximum.
```

## P7-comfyui-local

Droits : fichiers=none, web=false, scripts=true.

```text
Audit d'accès local à ComfyUI en lecture seule. Appelle run_project_script avec runtime=node, directory vide, timeoutSeconds=15 et exactement ce code :
const r=await fetch('http://127.0.0.1:8188/system_stats',{signal:AbortSignal.timeout(5000)});const j=await r.json();console.log(JSON.stringify({http_status:r.status,comfyui_version:j.system?.comfyui_version}));
Attends le résultat et donne http_status et comfyui_version. Aucun POST, aucune génération, aucun téléchargement, aucun autre outil. Réponse finale en 3 lignes maximum.
```

## P8-web-local-refuse

Droits : fichiers=none, web=true, scripts=false.

```text
Audit négatif du lecteur web. Appelle exactement une fois read_web_page sur http://127.0.0.1:8188/system_stats puis rapporte fidèlement son résultat ou son refus. Aucun autre outil, script ou contournement ; ne génère aucune image. Réponse en 3 lignes maximum.
```

## P9-inventaire-declaratif

Droits : fichiers=read, web=true, scripts=true.

```text
Sans appeler d'outil ni consulter de fichier, liste les noms exacts des fonctions d'outils qui te sont proposées pour ce message. Dis explicitement si une fonction MCP Bionic native, un outil de sous-agent, un navigateur interactif ou un générateur d'image nommé est présent dans cette liste. Ne déduis rien de tes connaissances générales et ne prétends pas avoir exécuté d'action. Réponse en 12 lignes maximum.
```
