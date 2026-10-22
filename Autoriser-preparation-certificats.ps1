param([switch]$Monitor)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Certificats-reseau-commun.ps1')
if ($Monitor) {
    $result=@{ state='completed'; message='Autorisation temporaire retiree.' }
    try { Invoke-BionicCertificateFirewallLease -Root $PSScriptRoot }
    catch { $result=@{state='error';message=$_.Exception.Message} }
    $file=Join-Path $PSScriptRoot 'runtime/certificate-firewall-status.json'
    [IO.File]::WriteAllText($file,($result | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    if ($result.state -eq 'error') { exit 1 }
    exit 0
}
$prepared=Get-BionicCertificatePreparation $PSScriptRoot
if ($null -eq $prepared) { throw 'Prepare en premier HTTPS ou mTLS dans Certificats.cmd. Aucun port ouvert.' }
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
$arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-Monitor')
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList $arguments | Out-Null }
else { Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList $arguments | Out-Null }
Write-Output 'Demande Windows transmise pour le seul port de preuve TLS, sur le reseau prive. Le suivi cache retire la regle a la fin de la preparation ou a son expiration (10 minutes maximum).'
Write-Output 'Si Windows refuse la demande, aucun port ne sera ouvert. Le statut final sera dans runtime/certificate-firewall-status.json.'
