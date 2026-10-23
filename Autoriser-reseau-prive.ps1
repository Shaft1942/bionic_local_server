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
    # The loopback control channel reports the active settings, including env overrides.
    $transport = Get-BionicTransport -Root $PSScriptRoot -Port ([int]$runtime.port)
    $proofPort = 0
    if ((Get-BionicField $transport 'instanceId') -cne (Get-BionicField $runtime 'instanceId') -or
        [int](Get-BionicField $transport 'appPort') -ne [int]$runtime.port -or
        -not [int]::TryParse([string](Get-BionicField $transport 'proofPort'), [ref]$proofPort) -or
        $proofPort -lt 1 -or $proofPort -gt 65535 -or $proofPort -eq [int]$runtime.port) { throw 'Port de verification HTTPS non confirme par ce serveur. Redemarre la version 2.1 avant de configurer le reseau.' }
    $networkMarker = Join-Path $PSScriptRoot 'runtime/certificate-network.json'
    if ((Get-Item -LiteralPath (Split-Path $networkMarker -Parent) -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Lien interdit pour le dossier runtime.' }
    if ((Test-Path -LiteralPath $networkMarker) -and ((Get-Item -LiteralPath $networkMarker -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Lien interdit pour le rapport de configuration reseau.' }
    # Invalidate the diagnostic before changing rules; a failure must not claim success.
    if (Test-Path -LiteralPath $networkMarker) { Remove-Item -LiteralPath $networkMarker -Force }
    $name = Get-BionicFirewallName $PSScriptRoot
    Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -Name $name -DisplayName ('Bionic Mobile - ' + (Split-Path $PSScriptRoot -Leaf)) -Direction Inbound -Action Allow -Protocol TCP -LocalPort @([int]$runtime.port, $proofPort) -Program $nodePath -LocalAddress $address.IPAddress -RemoteAddress $subnet -InterfaceAlias $address.InterfaceAlias -Profile Private | Out-Null
    $verifiedRule = Get-NetFirewallRule -Name $name -ErrorAction Stop
    $verifiedPorts = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $verifiedRule -ErrorAction Stop
    $ports = @($verifiedPorts.LocalPort | ForEach-Object { ([string]$_).Split(',') })
    if ([string]$verifiedRule.Enabled -ne 'True' -or [string]$verifiedRule.Direction -ne 'Inbound' -or [string]$verifiedRule.Action -ne 'Allow' -or @($verifiedRule.Profile) -notcontains 'Private' -or @($ports).Count -ne 2 -or [string]$runtime.port -notin $ports -or [string]$proofPort -notin $ports -or [string]$verifiedPorts.Protocol -notin @('TCP','6')) { throw 'Regle du reseau non confirmee : aucun succes enregistre.' }
    $verifiedApplication = Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $verifiedRule -ErrorAction Stop
    $verifiedAddresses = Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $verifiedRule -ErrorAction Stop
    $verifiedInterface = Get-NetFirewallInterfaceFilter -AssociatedNetFirewallRule $verifiedRule -ErrorAction Stop
    if (-not [string]::Equals([string]$verifiedApplication.Program, $nodePath, [StringComparison]::OrdinalIgnoreCase) -or
        @($verifiedAddresses.LocalAddress).Count -ne 1 -or [string]$verifiedAddresses.LocalAddress -ne [string]$address.IPAddress -or
        @($verifiedAddresses.RemoteAddress).Count -ne 1 -or [string]$verifiedAddresses.RemoteAddress -ne $subnet -or
        @($verifiedInterface.InterfaceAlias).Count -ne 1 -or [string]$verifiedInterface.InterfaceAlias -ne [string]$address.InterfaceAlias) { throw 'Le perimetre de la regle reseau n est pas confirme.' }
    $marker = @{version=1; instanceId=[string](Get-BionicField $runtime 'instanceId'); appPort=[int]$runtime.port; proofPort=$proofPort; provisionedAt=[DateTimeOffset]::UtcNow.ToString('o'); localAddress=[string]$address.IPAddress; prefixLength=[int]$address.PrefixLength; remoteSubnet=$subnet; interfaceAlias=[string]$address.InterfaceAlias; program=$nodePath}
    [IO.File]::WriteAllText($networkMarker, ($marker | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
    $report = @(
        'Autorisation du pare-feu creee pour ce dossier et ce reseau prive.'
        ('Adresse : ' + (Get-BionicTransport -Root $PSScriptRoot -Port ([int]$runtime.port)).appProtocol + '//' + $address.IPAddress + ':' + $runtime.port)
        ('Ports TCP : ' + $runtime.port + ' (compagnon), ' + $proofPort + ' (verification HTTPS)')
        'La verification HTTPS ecoute seulement pendant une preparation de certificat.'
        'Les certificats se gerent ensuite depuis Parametres dans le navigateur du telephone.'
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
