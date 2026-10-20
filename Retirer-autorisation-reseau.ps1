$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Bionic-mobile-commun.ps1')
if (Start-BionicElevated $PSCommandPath) { exit 0 }
$name = Get-BionicFirewallName $PSScriptRoot
Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Output 'Autorisation reseau de ce dossier retiree. Les autres instances sont conservees.'
