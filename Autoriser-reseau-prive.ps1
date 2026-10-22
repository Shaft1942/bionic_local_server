# Optional. Running this file explicitly requests Windows administrator approval.
# It never changes the network profile or router configuration.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Bionic-mobile-commun.ps1')
if (Start-BionicElevated $PSCommandPath) { exit 0 }
try {
    $runtime = Get-BionicRuntime $PSScriptRoot
    if ($null -eq $runtime) { throw 'Demarre d''abord le serveur de ce dossier.' }
    $null = Assert-BionicRuntimeIdentity $PSScriptRoot $runtime
    $nodePath = [string](Get-BionicField $runtime 'node')
    if ([string]::IsNullOrWhiteSpace($nodePath) -or -not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { throw 'Executable Node.js du serveur introuvable.' }
    $runtimeAddresses = @(Get-BionicField $runtime 'addresses')
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -in $runtimeAddresses -and $_.InterfaceAlias -notmatch 'WSL|vEthernet|Docker|VirtualBox|VMware'
    } | Where-Object {
        @(Get-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Private' }).Count -gt 0
    })
    $address = $addresses | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1
    if (-not $address) { $address = $addresses | Select-Object -First 1 }
    if (-not $address) { throw 'Aucune connexion locale avec le profil Windows Prive. Si ce reseau est fiable, choisis ce profil dans les parametres Windows puis relance ce script. Aucun profil modifie automatiquement.' }
    if ($address.PrefixLength -lt 16 -or $address.PrefixLength -gt 30) { throw 'Sous-reseau inhabituel : configuration manuelle requise.' }
    $bytes = [Net.IPAddress]::Parse($address.IPAddress).GetAddressBytes()
    for ($index = 0; $index -lt 4; $index++) {
        $bits = [Math]::Max(0, [Math]::Min(8, [int]$address.PrefixLength - 8 * $index))
        $maskByte = if ($bits -eq 0) { 0 } else { (255 -shl (8 - $bits)) -band 255 }
        $bytes[$index] = $bytes[$index] -band $maskByte
    }
    $subnet = ([Net.IPAddress]::new($bytes).ToString()) + '/' + $address.PrefixLength
    $name = Get-BionicFirewallName $PSScriptRoot
    Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -Name $name -DisplayName ('Bionic Mobile - ' + (Split-Path $PSScriptRoot -Leaf)) -Direction Inbound -Action Allow -Protocol TCP -LocalPort $runtime.port -Program $nodePath -LocalAddress $address.IPAddress -RemoteAddress $subnet -InterfaceAlias $address.InterfaceAlias -Profile Private | Out-Null
    $report = @(
        'Autorisation du pare-feu creee pour ce dossier et ce reseau prive.'
        ('Adresse : ' + (Get-BionicTransport -Root $PSScriptRoot -Port ([int]$runtime.port)).appProtocol + '//' + $address.IPAddress + ':' + $runtime.port)
        ('Port TCP : ' + $runtime.port)
        ('Appareils autorises : ' + $subnet)
        ('Interface : ' + $address.InterfaceAlias)
        ('Regle Windows : ' + $name)
        'Aucun changement du profil reseau ou du routeur.'
    ) -join [Environment]::NewLine
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'reseau-verification.txt'), $report)
    Write-Output $report
} catch {
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'reseau-verification.txt'), ('Echec : ' + $_.Exception.Message))
    throw
}
