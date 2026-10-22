# Installation helpers. Dot-sourcing never installs, downloads or launches anything.
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot 'Bionic-mobile-commun.ps1')

function Assert-BionicInstallPath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path) -or -not [IO.Path]::IsPathRooted($Path) -or $Path.StartsWith('\\')) { throw 'Choisis un dossier local avec un chemin complet.' }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($full.Length -lt 5 -or $full -eq [IO.Path]::GetPathRoot($full).TrimEnd('\')) { throw 'Choisis un sous-dossier pour le compagnon.' }
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Un fichier ou un lien de dossier occupe ce chemin.' }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    return $full
}

function ConvertTo-BionicApiUrl {
    param([string]$Value)
    $uri = $null
    if (-not [Uri]::TryCreate($Value.Trim(), [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'http' -or $uri.Host -notin @('localhost','127.0.0.1','[::1]') -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -notin @('/','/v1','/v1/')) { throw 'Adresse attendue : http://127.0.0.1:1235 (ou localhost), avec ou sans /v1.' }
    return $uri.GetLeftPart([UriPartial]::Authority)
}

function Test-BionicInstallApi {
    param([string]$ApiUrl)
    $address = ConvertTo-BionicApiUrl $ApiUrl
    # No redirects, no credentials, no generation, only the loopback model list.
    $request = [Net.HttpWebRequest]::Create($address + '/v1/models')
    $request.AllowAutoRedirect = $false; $request.Timeout = 4000; $request.ReadWriteTimeout = 4000; $request.Proxy = $null
    $response = $null; $reader = $null
    try {
        $response = $request.GetResponse()
        if ([int]$response.StatusCode -ne 200 -or $response.ContentLength -gt 1048576) { throw 'Reponse API inattendue.' }
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        $buffer = New-Object char[] 4096; $text = New-Object Text.StringBuilder
        while (($count = $reader.Read($buffer,0,$buffer.Length)) -gt 0) { $null = $text.Append($buffer,0,$count); if ($text.Length -gt 1048576) { throw 'Reponse API trop grande.' } }
        $models = $text.ToString() | ConvertFrom-Json
        if ($null -eq $models.PSObject.Properties['data'] -or $models.data -isnot [array]) { throw 'Liste de modeles absente.' }
        return 'API joignable : ' + @($models.data).Count + ' modele(s) visible(s). Aucun modele sollicite.'
    } catch { throw 'API non verifiee. Active le serveur local dans Bionic et verifie son port. Une API avec jeton peut demander une configuration manuelle.' }
    finally { if ($reader) { $reader.Dispose() }; if ($response) { $response.Dispose() }; $request.Abort() }
}

function Get-BionicInstallFiles {
    param([string]$Source)
    $root = Assert-BionicInstallPath $Source
    $manifest = Read-BionicJson (Join-Path $root 'release-manifest.json')
    $seen = @{}
    foreach ($relative in $manifest.files) {
        if ($relative -notmatch '^[a-zA-Z0-9_.@/-]+$' -or $relative -match '(^|/)(\.{1,2}|data|runtime|dist|node_modules|\.git)(/|$)' -or $relative -match '(^|/)(config\.local\.json|ACCES-PRIVE\.txt|\.env)' -or $relative -match '\.(pem|key|pfx|p12|crt|cer|der|zip|bin)$' -or $relative -match '(^|/)(security|certificate-exports)(/|$)' -or $seen.ContainsKey($relative)) { throw 'Inventaire de distribution invalide.' }
        $seen[$relative] = $true
        $file = Join-Path $root $relative
        $cursor = $file
        while ($cursor.Length -gt $root.Length) {
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Lien interdit dans les sources.' }
            $cursor = [IO.Path]::GetDirectoryName($cursor)
        }
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Source de distribution absente.' }
        $relative
    }
    if ($seen.Count -lt 10 -or -not $seen.ContainsKey('server.mjs') -or -not $seen.ContainsKey('Demarrer.ps1')) { throw 'Archive incomplete : extrais tous les fichiers avant de lancer Installer.cmd.' }
}

function Get-BionicNodeDownload {
    param([string]$Checksums, [string]$Architecture)
    if ($Architecture -notin @('x64','arm64')) { throw 'Le telechargement portable cible Windows x64 ou ARM64. Choisis un Node.js installe manuellement.' }
    $pattern = '(?m)^([a-fA-F0-9]{64})\s+(node-(v24\.\d+\.\d+)-win-' + $Architecture + '\.zip)\s*$'
    $matches = [regex]::Matches($Checksums,$pattern)
    if ($matches.Count -ne 1) { throw 'Empreinte officielle Node.js 24 introuvable ou ambigue.' }
    return @{ Hash=$matches[0].Groups[1].Value.ToLowerInvariant(); Archive=$matches[0].Groups[2].Value; Version=$matches[0].Groups[3].Value }
}

function Install-BionicPortableNode {
    param([string]$Root, $Cancellation)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $architecture = switch ($architecture) { 'AMD64' { 'x64' }; 'ARM64' { 'arm64' }; default { 'unsupported' } }
    $sums = Invoke-WebRequest -Uri 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0
    $download = Get-BionicNodeDownload ([string]$sums.Content) $architecture
    $directory = Join-Path $Root 'runtime/node'
    $null = New-Item -ItemType Directory -Path $directory -Force
    $archive = Join-Path $directory ('download-' + [Guid]::NewGuid().ToString('N') + '.zip')
    $response = $null; $stream = $null; $output = $null; $zip = $null
    try {
        if ($Cancellation) { $Cancellation.ThrowIfCancellationRequested() }
        $request = [Net.HttpWebRequest]::Create('https://nodejs.org/dist/' + $download.Version + '/' + $download.Archive)
        $request.AllowAutoRedirect=$false; $request.Timeout=20000; $request.ReadWriteTimeout=20000
        $response=$request.GetResponse()
        if ([int]$response.StatusCode -ne 200 -or $response.ContentLength -gt 150000000) { throw 'Archive Node.js invalide ou trop grande.' }
        $stream=$response.GetResponseStream(); $output=[IO.File]::Open($archive,[IO.FileMode]::CreateNew)
        $buffer=New-Object byte[] 65536; $total=0
        while (($count=$stream.Read($buffer,0,$buffer.Length)) -gt 0) { if ($Cancellation) { $Cancellation.ThrowIfCancellationRequested() }; $total+=$count; if ($total -gt 150000000) { throw 'Archive Node.js trop grande.' }; $output.Write($buffer,0,$count) }
        $output.Dispose(); $output=$null
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $download.Hash) { throw 'Empreinte Node.js incorrecte : aucun executable lance.' }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip=[IO.Compression.ZipFile]::OpenRead($archive)
        foreach ($name in @('node.exe','LICENSE')) {
            $entry=$zip.GetEntry($download.Archive.Replace('.zip','') + '/' + $name)
            if ($null -eq $entry -or $entry.Length -gt 150000000) { throw 'Archive Node.js incomplete.' }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $directory $name),$false)
        }
        $signature=Get-AuthenticodeSignature -LiteralPath (Join-Path $directory 'node.exe')
        if ($signature.Status -ne 'Valid') { throw 'Signature Windows de Node.js non valide. Aucun executable lance.' }
        return Join-Path $directory 'node.exe'
    } finally {
        if ($zip) { $zip.Dispose() }; if ($output) { $output.Dispose() }; if ($stream) { $stream.Dispose() }; if ($response) { $response.Dispose() }
        if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    }
}

function Install-BionicCompanion {
    param([string]$Source, [string]$Destination, [int]$Port, [string]$ApiUrl, [string]$BionicRoot, [string]$NodePath, [bool]$DownloadNode, $Cancellation, [scriptblock]$Progress = {})
    $sourceRoot=Assert-BionicInstallPath $Source; $target=Assert-BionicInstallPath $Destination
    $inPlace=[string]::Equals($sourceRoot,$target,[StringComparison]::OrdinalIgnoreCase)
    if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port invalide.' }
    $api=ConvertTo-BionicApiUrl $ApiUrl
    if (([Uri]$api).Port -eq $Port) { throw 'Le port du compagnon doit etre different du port de l API Bionic.' }
    if ($BionicRoot) { $null=Assert-BionicInstallPath $BionicRoot }
    if (Test-BionicPortOpen $Port) { throw 'Ce port est occupe. Choisis un autre port, ou arrete ce compagnon avant de le reconfigurer.' }
    if ($inPlace) {
        $null=Assert-BionicInstallPath (Join-Path $target 'runtime')
        $runtime=Get-BionicRuntime $target
        if ($null -ne $runtime -and (Test-BionicPortOpen ([int]$runtime.port))) { throw 'Cette installation tourne encore. Arrete-la avant de la reconfigurer, meme si tu changes de port.' }
        $configFile=Join-Path $target 'config.local.json'
        if ((Test-Path -LiteralPath $configFile) -and ((Get-Item -LiteralPath $configFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Lien interdit pour config.local.json.' }
        if ($DownloadNode -and (Test-Path -LiteralPath (Join-Path $target 'runtime/node'))) { throw 'Un Node portable existe deja. Selectionne-le ou conserve-le.' }
    }
    if (-not $inPlace -and (Test-Path -LiteralPath $target) -and @(Get-ChildItem -LiteralPath $target -Force).Count) { throw 'Le dossier contient deja des fichiers. Choisis un dossier vide. Pour reconfigurer une installation, lance son propre Installer.cmd.' }
    $files=@(Get-BionicInstallFiles $sourceRoot)
    $parent=Split-Path $target -Parent
    if (-not (Test-Path -LiteralPath $parent)) { $null=New-Item -ItemType Directory -Path $parent -Force }
    $stage=Join-Path $parent ('.bionic-install-' + [Guid]::NewGuid().ToString('N'))
    $null=New-Item -ItemType Directory -Path $stage
    try {
        & $Progress 'Copie des sources publiques dans un dossier temporaire...'
        if (-not $inPlace) { foreach ($relative in $files) { if ($Cancellation) { $Cancellation.ThrowIfCancellationRequested() }; $to=Join-Path $stage $relative; $null=New-Item -ItemType Directory -Path (Split-Path $to -Parent) -Force; Copy-Item -LiteralPath (Join-Path $sourceRoot $relative) -Destination $to } }
        if ($DownloadNode) { & $Progress 'Telechargement Node.js 24 depuis nodejs.org, puis verification SHA-256 et signature Windows...'; $node=Install-BionicPortableNode $stage $Cancellation }
        else { $node=$NodePath }
        if (-not $node -or -not (Test-Path -LiteralPath $node -PathType Leaf) -or [IO.Path]::GetExtension($node) -ne '.exe') { throw 'Choisis node.exe, version 24 ou plus recente.' }
        $version=& $node --version 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]$version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw 'Node.js 24 minimum est requis.' }
        $settings=if ($inPlace) { Read-BionicJson (Join-Path $target 'config.local.json') } else { $null }
        if ($null -eq $settings) { $settings=New-Object PSObject }
        $settings | Add-Member -NotePropertyName port -NotePropertyValue $Port -Force
        $settings | Add-Member -NotePropertyName apiUrl -NotePropertyValue $api -Force
        if ($BionicRoot) { $settings | Add-Member -NotePropertyName bionicRoot -NotePropertyValue $BionicRoot -Force }
        $utf8=New-Object Text.UTF8Encoding($false)
        [IO.File]::WriteAllText((Join-Path $stage 'config.local.json'),($settings | ConvertTo-Json -Depth 30),$utf8)
        $null=New-Item -ItemType Directory -Path (Join-Path $stage 'runtime') -Force
        $savedNode=if ($DownloadNode) { Join-Path $target 'runtime/node/node.exe' } else { [IO.Path]::GetFullPath($node) }
        [IO.File]::WriteAllText((Join-Path $stage 'runtime/node-path.json'),(@{path=$savedNode} | ConvertTo-Json),$utf8)
        if ($Cancellation) { $Cancellation.ThrowIfCancellationRequested() }
        & $Progress 'Enregistrement de l installation...'
        if ($inPlace) {
            if (Test-BionicPortOpen $Port) { throw 'Le port vient de devenir occupe. Aucun reglage applique.' }
            $null=New-Item -ItemType Directory -Path (Join-Path $target 'runtime') -Force
            $written=New-Object 'Collections.Generic.List[string]'; $backups=@{}; $movedNode=$false
            try {
                if ($DownloadNode) { Move-Item -LiteralPath (Join-Path $stage 'runtime/node') -Destination (Join-Path $target 'runtime/node'); $movedNode=$true }
                foreach ($relative in @('runtime/node-path.json','config.local.json')) {
                    $dest=Join-Path $target $relative; $from=Join-Path $stage $relative
                    if (Test-Path -LiteralPath $dest) {
                        if ((Get-Item -LiteralPath $dest -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Lien interdit dans les reglages.' }
                        $backup=Join-Path $target ('runtime/install-backups/' + [Guid]::NewGuid().ToString('N') + '/' + $relative)
                        $null=New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force
                        [IO.File]::Replace($from,$dest,$backup); $backups[$relative]=$backup
                    } else { [IO.File]::Move($from,$dest) }
                    $written.Add($relative)
                }
            } catch {
                foreach ($relative in $written) { $dest=Join-Path $target $relative; if ($backups.ContainsKey($relative)) { Copy-Item -LiteralPath $backups[$relative] -Destination $dest -Force } else { Remove-Item -LiteralPath $dest -Force } }
                $nodeDirectory=Join-Path $target 'runtime/node'
                if ($movedNode -and [IO.Path]::GetFullPath($nodeDirectory).StartsWith($target + '\',[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $nodeDirectory -Recurse -Force }
                throw
            }
        } else {
            if (Test-Path -LiteralPath $target) { [IO.Directory]::Delete($target,$false) }
            [IO.Directory]::Move($stage,$target)
        }
        return @{ Root=$target; Port=$Port; Node=$savedNode; Existing=$inPlace }
    } finally {
        # Only our own freshly generated sibling directory can be removed.
        if ((Test-Path -LiteralPath $stage) -and [IO.Path]::GetDirectoryName($stage) -eq $parent -and [IO.Path]::GetFileName($stage) -match '^\.bionic-install-[a-f0-9]{32}$') { Remove-Item -LiteralPath $stage -Recurse -Force }
    }
}
