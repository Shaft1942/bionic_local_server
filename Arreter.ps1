$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Bionic-mobile-commun.ps1')

$runtime = Get-BionicRuntime $PSScriptRoot
if ($null -eq $runtime) { Write-Output 'Aucun serveur lance depuis ce dossier.'; exit 0 }
if (-not (Test-BionicPortOpen ([int]$runtime.port))) {
    Write-Output 'Le serveur de ce dossier est deja arrete.'
    exit 0
}
$config = Assert-BionicRuntimeIdentity $PSScriptRoot $runtime
$adminToken = [string](Get-BionicField $config 'adminToken')
if ([string]::IsNullOrWhiteSpace($adminToken)) { throw 'Code d''administration absent. Aucun processus arrete.' }
$payload = @{ token = $adminToken } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$($runtime.port)/api/admin/stop" -Body $payload -ContentType 'application/json' -TimeoutSec 3 -UseBasicParsing | Out-Null
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not (Test-BionicPortOpen ([int]$runtime.port))) {
        Write-Output 'Serveur arrete. Bionic reste ouvert.'
        exit 0
    }
    Start-Sleep -Milliseconds 250
}
throw 'La demande d''arret a ete transmise, mais le serveur repond encore. Reessaie dans quelques instants.'
