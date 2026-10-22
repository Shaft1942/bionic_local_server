# Pure helpers when dot-sourced. No firewall or scheduled task is changed here.
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot 'Bionic-mobile-commun.ps1')
function Get-BionicCertificatePreparation {
    param([Parameter(Mandatory = $true)][string]$Root)
    $runtime = Get-BionicRuntime $Root
    if ($null -eq $runtime) { throw 'Demarre ce compagnon et prepare HTTPS ou mTLS dans Certificats.cmd.' }
    $config = Assert-BionicRuntimeIdentity $Root $runtime
    $payload = @{ token=[string](Get-BionicField $config 'adminToken'); action='status' } | ConvertTo-Json -Compress
    $status = Invoke-RestMethod -Method Post -Uri ((Get-BionicMaintenanceBase -Root $Root -Port ([int]$runtime.port)) + '/api/admin/certificates/action') -Body $payload -ContentType 'application/json' -TimeoutSec 3 -MaximumRedirection 0 -UseBasicParsing
    $candidate = Get-BionicField $status 'candidate'
    if ($null -eq $candidate) { return $null }
    $uri = $null; $expiry = [DateTimeOffset]::MinValue
    if (-not [Uri]::TryCreate([string](Get-BionicField $candidate 'url'), [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/' -or $uri.Port -lt 1 -or $uri.Port -gt 65535 -or -not [DateTimeOffset]::TryParse([string](Get-BionicField $candidate 'expiresAt'), [ref]$expiry)) { throw 'Preparation de certificats invalide.' }
    $remaining = ($expiry - [DateTimeOffset]::UtcNow).TotalSeconds
    if ($remaining -le 0 -or $remaining -gt 605) { throw 'Preparation expiree ou duree invalide. Relance-la dans Certificats.cmd.' }
    return [pscustomobject]@{ Port=$uri.Port; ExpiresAt=$expiry; Url=$uri.AbsoluteUri; InstanceId=[string]$config.instanceId; Runtime=$runtime }
}
function Get-BionicCertificateScope {
    param($Runtime)
    $nodePath=[string](Get-BionicField $Runtime 'node')
    if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { throw 'Executable Node.js du serveur introuvable.' }
    $runtimeAddresses=@(Get-BionicField $Runtime 'addresses')
    $addresses=@(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -in $runtimeAddresses -and $_.InterfaceAlias -notmatch 'WSL|vEthernet|Docker|VirtualBox|VMware' } | Where-Object { @(Get-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Private' }).Count -gt 0 })
    $address=$addresses | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1
    if (-not $address) { $address=$addresses | Select-Object -First 1 }
    if (-not $address -or $address.PrefixLength -lt 16 -or $address.PrefixLength -gt 30) { throw 'Aucun sous-reseau Windows prive compatible. Le profil reseau ne sera pas modifie.' }
    $bytes=[Net.IPAddress]::Parse($address.IPAddress).GetAddressBytes()
    for ($index=0; $index -lt 4; $index++) { $bits=[Math]::Max(0,[Math]::Min(8,[int]$address.PrefixLength-8*$index)); $mask=if($bits -eq 0){0}else{(255 -shl (8-$bits)) -band 255}; $bytes[$index]=$bytes[$index] -band $mask }
    return [pscustomobject]@{ Node=$nodePath; Address=$address.IPAddress; Subnet=([Net.IPAddress]::new($bytes).ToString())+'/'+$address.PrefixLength; Interface=$address.InterfaceAlias }
}
function Invoke-BionicCertificateFirewallLease {
    param([Parameter(Mandatory = $true)][string]$Root)
    $preparation=Get-BionicCertificatePreparation $Root
    if ($null -eq $preparation) { throw 'Aucune preparation active. Aucun port ouvert.' }
    $scope=Get-BionicCertificateScope $preparation.Runtime
    $name=(Get-BionicFirewallName $Root)+'-Certificats-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
    $taskName=$name+'-Expiration'
    if ($name -notmatch '^[A-Za-z0-9-]+$') { throw 'Nom de regle invalide.' }
    # Only fixed generated names are embedded; no path, token or user input.
    $cleanup="Get-NetFirewallRule -Name '$name' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop; Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false -ErrorAction SilentlyContinue"
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cleanup))
    $action=New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand '+$encoded)
    $trigger=New-ScheduledTaskTrigger -Once -At $preparation.ExpiresAt.LocalDateTime
    $principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
    # Refuse to open anything if the independent expiry cleanup cannot be saved.
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Retire uniquement le port temporaire de preuve TLS Bionic de cette installation.' -ErrorAction Stop | Out-Null
    $opened=$false
    try {
        New-NetFirewallRule -Name $name -DisplayName 'Bionic Mobile - preuve certificats temporaire' -Description ('Expiration '+$preparation.ExpiresAt.ToString('o')) -Direction Inbound -Action Allow -Protocol TCP -LocalPort $preparation.Port -Program $scope.Node -LocalAddress $scope.Address -RemoteAddress $scope.Subnet -InterfaceAlias $scope.Interface -Profile Private -ErrorAction Stop | Out-Null
        $opened=$true
        while ([DateTimeOffset]::UtcNow -lt $preparation.ExpiresAt) {
            Start-Sleep -Milliseconds 1500
            try { $current=Get-BionicCertificatePreparation $Root } catch { break }
            if ($null -eq $current -or $current.InstanceId -cne $preparation.InstanceId -or $current.Port -ne $preparation.Port -or $current.ExpiresAt -ne $preparation.ExpiresAt) { break }
        }
    } finally {
        # Keep the independent cleanup task if removing the rule fails.
        Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    }
}
