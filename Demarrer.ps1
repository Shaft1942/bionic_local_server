$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Bionic-mobile-commun.ps1')

# Always use current settings, never the port left by an earlier run.
$serverPort = Get-BionicPort $PSScriptRoot
$config = Read-BionicJson (Join-Path $PSScriptRoot 'data\config.json')
$expectedInstance = [string](Get-BionicField $config 'instanceId')
$ping = Get-BionicPing $serverPort
if (Test-BionicIdentity $ping $expectedInstance) {
    Write-Output "Le serveur de ce dossier est deja actif : http://127.0.0.1:$serverPort"
    Write-Output 'Le code et les adresses du telephone sont dans ACCES-PRIVE.txt.'
    exit 0
}
if ($null -ne $ping -or (Test-BionicPortOpen $serverPort)) {
    throw "Le port $serverPort est occupe par un autre serveur. Aucun processus arrete. Choisis un autre port dans config.local.json."
}
$nodePath = Get-BionicNode
$process = Start-Process -FilePath $nodePath -ArgumentList @('--disable-warning=ExperimentalWarning', 'server.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-error.log') -PassThru
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 400
    $process.Refresh()
    if ($process.HasExited) { break }
    # On first launch, the server itself creates the identifier and private code.
    $config = Read-BionicJson (Join-Path $PSScriptRoot 'data\config.json')
    $expectedInstance = [string](Get-BionicField $config 'instanceId')
    $ping = Get-BionicPing $serverPort
    if (Test-BionicIdentity $ping $expectedInstance) { $ready = $true; break }
    if ($null -ne $ping) { throw "Le port $serverPort appartient a une autre instance. Aucun processus arrete." }
}
if (-not $ready) { throw 'Le serveur n''a pas demarre. Consulte server-error.log dans ce dossier.' }
Write-Output "Serveur actif : http://127.0.0.1:$serverPort"
Write-Output 'Sur le telephone, utilise l''adresse et le code de ACCES-PRIVE.txt.'
