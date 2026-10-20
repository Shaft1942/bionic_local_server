$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Bionic-mobile-commun.ps1')
$nodePath = Get-BionicNode
& $nodePath --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'scripts\diagnostic.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Diagnostic non confirme.' }
