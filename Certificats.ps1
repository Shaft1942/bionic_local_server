$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Bionic-mobile-commun.ps1')
$nodePath = Get-BionicNode -Root $PSScriptRoot
& $nodePath --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'scripts/certificates.mjs') @args
if ($LASTEXITCODE -ne 0) { throw 'Operation certificats non confirmee. Le niveau existant ne recule pas automatiquement.' }
