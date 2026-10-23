# Shared helpers. Loading this file never starts a server or changes Windows.
Set-StrictMode -Version 2.0

function Read-BionicJson {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-BionicField {
    param($Object, [string]$Name)
    if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) { return $Object.$Name }
    return $null
}

function Get-BionicPort {
    param([Parameter(Mandatory = $true)][string]$Root)
    $settings = Read-BionicJson (Join-Path $Root 'config.local.json')
    $value = Get-BionicField $settings 'port'
    if ($null -eq $value) { $value = 8769 }
    if (-not [string]::IsNullOrWhiteSpace($env:BIONIC_MOBILE_PORT)) { $value = $env:BIONIC_MOBILE_PORT }
    $parsed = 0
    if (-not [int]::TryParse([string]$value, [ref]$parsed) -or $parsed -lt 1 -or $parsed -gt 65535) {
        throw 'Port invalide : utilise un entier entre 1 et 65535 dans config.local.json ou BIONIC_MOBILE_PORT.'
    }
    return $parsed
}

function Get-BionicNode {
    param([string]$Root = $PSScriptRoot)
    $explicit = -not [string]::IsNullOrWhiteSpace($env:BIONIC_MOBILE_NODE)
    $candidates = @()
    if ($explicit) { $candidates += $env:BIONIC_MOBILE_NODE }
    else {
        $candidates += Join-Path $Root 'runtime\node\node.exe'
        $saved = Read-BionicJson (Join-Path $Root 'runtime\node-path.json')
        $configured = [string](Get-BionicField $saved 'path')
        if ($configured) { $candidates += $configured }
        $candidates += 'node.exe'
        if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'nodejs\node.exe' }
    }
    foreach ($candidate in $candidates) {
        $command = Get-Command -Name $candidate -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $command) { continue }
        $version = & $command.Source --version 2>$null
        if ($LASTEXITCODE -eq 0 -and [string]$version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 24) { return $command.Source }
    }
    throw 'Node.js 24 ou plus recent est necessaire. Lance Installer.cmd pour le detecter ou telecharger une copie portable, ou renseigne BIONIC_MOBILE_NODE.'
}

function Get-BionicPing {
    param([int]$Port, [string]$Root)
    try {
        $base = if ($Root) { Get-BionicMaintenanceBase -Root $Root -Port $Port } else { "http://127.0.0.1:$Port" }
        return Invoke-RestMethod -Uri ($base + "/api/ping") -TimeoutSec 2 -MaximumRedirection 0 -UseBasicParsing
    }
    catch { return $null }
}

function Test-BionicPortOpen {
    param([int]$Port)
    $client = New-Object Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        if ($task.Wait(700)) { return $client.Connected }
        return $false
    } catch { return $false }
    finally { $client.Dispose() }
}

function Test-BionicIdentity {
    param($Ping, [string]$InstanceId)
    return (-not [string]::IsNullOrWhiteSpace($InstanceId) -and
        (Get-BionicField $Ping 'app') -eq 'bionic-mobile-local' -and
        (Get-BionicField $Ping 'instanceId') -ceq $InstanceId)
}

function Get-BionicRuntime {
    param([Parameter(Mandatory = $true)][string]$Root)
    $runtime = Read-BionicJson (Join-Path $Root 'runtime\server.json')
    if ($null -eq $runtime) { return $null }
    $expectedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $actualRoot = Get-BionicField $runtime 'root'
    if ([string]::IsNullOrWhiteSpace($actualRoot) -or
        -not [string]::Equals($expectedRoot, [IO.Path]::GetFullPath($actualRoot).TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Le fichier runtime appartient a un autre dossier. Aucun changement effectue.'
    }
    $runtimePort = 0
    if (-not [int]::TryParse([string](Get-BionicField $runtime 'port'), [ref]$runtimePort) -or $runtimePort -lt 1 -or $runtimePort -gt 65535) {
        throw 'Port invalide dans runtime/server.json. Aucun changement effectue.'
    }
    return $runtime
}

function Assert-BionicRuntimeIdentity {
    param([Parameter(Mandatory = $true)][string]$Root, $Runtime)
    $config = Read-BionicJson (Join-Path $Root 'data\config.json')
    $instanceId = [string](Get-BionicField $config 'instanceId')
    if ([string]::IsNullOrWhiteSpace($instanceId) -or (Get-BionicField $Runtime 'instanceId') -cne $instanceId) {
        throw 'Identite de serveur incoherente dans ce dossier. Aucun autre serveur ne sera modifie.'
    }
    $ping = Get-BionicPing -Port ([int]$Runtime.port) -Root $Root
    if (-not (Test-BionicIdentity $ping $instanceId)) {
        throw 'Le serveur de ce dossier ne repond pas, ou le port appartient a une autre instance. Aucun changement effectue.'
    }
    return $config
}

function Get-BionicFirewallName {
    param([Parameter(Mandatory = $true)][string]$Root)
    $canonical = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/').ToLowerInvariant()
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical))).Replace('-', '').Substring(0, 16) }
    finally { $sha.Dispose() }
    return 'BionicMobileLocal-' + $hash
}

function Start-BionicElevated {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { return $false }
    $child = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $ScriptPath + '"')) -PassThru -Wait
    if ($child.ExitCode -ne 0) { throw 'La modification du pare-feu a echoue. Consulte reseau-verification.txt dans ce dossier.' }
    return $true
}

# Transport metadata contains no secret. Never probe the HTTPS application by
# bypassing validation: maintenance has its own loopback-only HTTP listener.
function Get-BionicTransport {
    param([Parameter(Mandatory = $true)][string]$Root, [int]$Port = 0)
    if ($Port -eq 0) { $Port = Get-BionicPort $Root }
    $metadata = Read-BionicJson (Join-Path $Root 'runtime/transport.json')
    if ($null -eq $metadata) {
        if ((Test-Path -LiteralPath (Join-Path $Root 'data/security/state.json')) -or (Test-Path -LiteralPath (Join-Path $Root 'data/security-floor.json'))) { throw 'Canal de maintenance non publie. Demarre ce compagnon avant cette operation.' }
        return [pscustomobject]@{ version=1; mode='http'; appPort=$Port; adminPort=$Port; appProtocol='http:' }
    }
    $config = Read-BionicJson (Join-Path $Root 'data/config.json')
    $instanceId = [string](Get-BionicField $config 'instanceId')
    if ((Get-BionicField $metadata 'version') -ne 1 -or -not $instanceId -or (Get-BionicField $metadata 'instanceId') -cne $instanceId) { throw 'Identite du transport incoherente. Aucun autre serveur ne sera contacte.' }
    foreach ($name in @('appPort','adminPort','pid')) {
        $number = 0
        if (-not [int]::TryParse([string](Get-BionicField $metadata $name), [ref]$number) -or $number -lt 1 -or ($name -ne 'pid' -and $number -gt 65535)) { throw 'Metadonnees de transport invalides.' }
    }
    $mode = [string](Get-BionicField $metadata 'mode')
    $protocol = [string](Get-BionicField $metadata 'appProtocol')
    if ($mode -notin @('http','https','mtls') -or ($mode -eq 'http' -and ($protocol -ne 'http:')) -or ($mode -ne 'http' -and ($protocol -ne 'https:' -or $metadata.appPort -eq $metadata.adminPort))) { throw 'Mode de transport invalide.' }
    return $metadata
}

function Get-BionicMaintenanceBase {
    param([Parameter(Mandatory = $true)][string]$Root, [int]$Port = 0)
    $transport = Get-BionicTransport -Root $Root -Port $Port
    return 'http://127.0.0.1:' + $transport.adminPort
}

function Get-BionicApplicationUrl {
    param([Parameter(Mandatory = $true)][string]$Root, [int]$Port = 0)
    $transport = Get-BionicTransport -Root $Root -Port $Port
    $hostName = '127.0.0.1'
    if ($transport.mode -ne 'http') {
        $security = Read-BionicJson (Join-Path $Root 'data/security/state.json')
        $server = Get-BionicField $security 'server'
        $hosts = @(Get-BionicField $server 'hosts' | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
        if ($hosts.Count -gt 0 -and $hosts -notcontains '127.0.0.1') { $hostName = [string]$hosts[0] }
    }
    if ($hostName.Contains(':')) { $hostName = '[' + $hostName.Trim('[',']') + ']' }
    $uri = $null
    $url = $transport.appProtocol + '//' + $hostName + ':' + $transport.appPort
    if (-not [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$uri) -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/') { throw 'Adresse applicative invalide.' }
    return $url
}
