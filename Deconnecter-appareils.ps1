$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Bionic-mobile-commun.ps1')
$nodePath = Get-BionicNode
& $nodePath --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'scripts\revoke-sessions.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Revocation non confirmee.' }
