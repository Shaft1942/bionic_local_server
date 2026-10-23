$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Bionic-mobile-commun.ps1')
if (Start-BionicElevated $PSCommandPath) { exit 0 }
$name = Get-BionicFirewallName $PSScriptRoot
Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if (@(Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue).Count) { throw 'Le retrait de la regle reseau n est pas confirme.' }
$networkMarker = Join-Path $PSScriptRoot 'runtime/certificate-network.json'
if (Test-Path -LiteralPath $networkMarker) { Remove-Item -LiteralPath $networkMarker -Force }
Write-Output 'Autorisation reseau de ce dossier retiree. Les autres instances sont conservees.'
