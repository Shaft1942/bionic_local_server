$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Bionic-mobile-commun.ps1')
$nodePath = Get-BionicNode
& $nodePath (Join-Path $PSScriptRoot 'scripts/configure-local-services.mjs') @args
exit $LASTEXITCODE
