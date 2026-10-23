param([string]$PreviewDirectory)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Installation-commun.ps1')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()

$script:state = @{ Step=0; Busy=$false; Node=''; Result=$null; Worker=$null; Handle=$null; Token=$null; Queue=$null }
$form = New-Object Windows.Forms.Form
$form.Text = 'Installer Bionic Mobile'; $form.Size = New-Object Drawing.Size(780,680)
$form.MinimumSize = New-Object Drawing.Size(740,640); $form.StartPosition='CenterScreen'; $form.AutoScaleMode='Dpi'
$form.Font = New-Object Drawing.Font('Segoe UI',10); $form.BackColor=[Drawing.Color]::White
$layout = New-Object Windows.Forms.TableLayoutPanel
$layout.Dock='Fill'; $layout.Padding=New-Object Windows.Forms.Padding(28); $layout.ColumnCount=1; $layout.RowCount=5
$null=$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Absolute',30)))
$null=$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Absolute',54)))
$null=$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Percent',100)))
$null=$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Absolute',65)))
$null=$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Absolute',46)))
$form.Controls.Add($layout)
$stepLabel=New-Object Windows.Forms.Label; $stepLabel.Dock='Fill'; $stepLabel.ForeColor=[Drawing.Color]::FromArgb(65,82,110)
$title=New-Object Windows.Forms.Label; $title.Dock='Fill'; $title.Font=New-Object Drawing.Font('Segoe UI',19,[Drawing.FontStyle]::Bold)
$hostPanel=New-Object Windows.Forms.Panel; $hostPanel.Dock='Fill'
$feedback=New-Object Windows.Forms.Label; $feedback.Dock='Fill'; $feedback.Padding=New-Object Windows.Forms.Padding(0,8,0,0); $feedback.AccessibleName='Etat de l installation'
$buttons=New-Object Windows.Forms.FlowLayoutPanel; $buttons.Dock='Fill'; $buttons.FlowDirection='RightToLeft'
function New-ActionButton([string]$Text) { $b=New-Object Windows.Forms.Button; $b.Text=$Text; $b.Size=New-Object Drawing.Size(132,38); $b.Margin=New-Object Windows.Forms.Padding(8,0,0,0); return $b }
$next=New-ActionButton 'Suivant'; $cancel=New-ActionButton 'Annuler'; $previous=New-ActionButton 'Précédent'
$next.BackColor=[Drawing.Color]::FromArgb(25,92,215); $next.ForeColor=[Drawing.Color]::White; $next.FlatStyle='Flat'
$buttons.Controls.AddRange(@($next,$cancel,$previous)); $form.AcceptButton=$next; $form.CancelButton=$cancel
$layout.Controls.Add($stepLabel,0,0); $layout.Controls.Add($title,0,1); $layout.Controls.Add($hostPanel,0,2); $layout.Controls.Add($feedback,0,3); $layout.Controls.Add($buttons,0,4)

function New-Page {
    $page=New-Object Windows.Forms.FlowLayoutPanel; $page.Dock='Fill'; $page.FlowDirection='TopDown'; $page.WrapContents=$false; $page.AutoScroll=$true
    return $page
}
function Add-Info($Page,[string]$Text,[int]$Height=55) {
    $label=New-Object Windows.Forms.Label; $label.Text=$Text; $label.Size=New-Object Drawing.Size(660,$Height); $label.Margin=New-Object Windows.Forms.Padding(0,0,0,10)
    $Page.Controls.Add($label); return $label
}
function Add-Field($Page,[string]$Label,[string]$Value,[bool]$Browse=$false) {
    $null=Add-Info $Page $Label 24
    $row=New-Object Windows.Forms.FlowLayoutPanel; $row.Size=New-Object Drawing.Size(664,40); $row.Margin=New-Object Windows.Forms.Padding(0,0,0,12)
    $field=New-Object Windows.Forms.TextBox; $field.Text=$Value; $field.Width=if($Browse){525}else{650}; $field.AccessibleName=$Label
    $row.Controls.Add($field)
    if ($Browse) {
        $button=New-Object Windows.Forms.Button; $button.Text='Parcourir...'; $button.Size=New-Object Drawing.Size(115,30); $button.Tag=$field
        $button.Add_Click({ $dialog=New-Object Windows.Forms.FolderBrowserDialog; $dialog.Description='Choisir le dossier'; if(Test-Path -LiteralPath $this.Tag.Text -PathType Container){$dialog.SelectedPath=$this.Tag.Text}; if($dialog.ShowDialog($form) -eq 'OK'){$this.Tag.Text=$dialog.SelectedPath}; $dialog.Dispose() })
        $row.Controls.Add($button)
    }
    $Page.Controls.Add($row); return $field
}
function Add-Choice($Page,[string]$Text,[bool]$Checked) {
    $choice=New-Object Windows.Forms.CheckBox; $choice.Text=$Text; $choice.Checked=$Checked; $choice.Size=New-Object Drawing.Size(660,40); $choice.Margin=New-Object Windows.Forms.Padding(0,4,0,4)
    $Page.Controls.Add($choice); return $choice
}
$pages=@((New-Page),(New-Page),(New-Page),(New-Page),(New-Page))
$existing=Test-Path -LiteralPath (Join-Path $PSScriptRoot 'data/config.json')
$defaultTarget=if($existing){$PSScriptRoot}else{Join-Path $env:LOCALAPPDATA 'BionicMobile'}
$null=Add-Info $pages[0] 'Installe le compagnon sur ce PC. Bionic et ses modèles restent separes. Aucun compte, Docker ou droit administrateur requis pour cette installation.' 65
$destination=Add-Field $pages[0] 'Dossier du compagnon' $defaultTarget $true
$useHere=New-ActionButton 'Ce dossier'; $pages[0].Controls.Add($useHere); $useHere.Add_Click({$destination.Text=$PSScriptRoot})
$null=Add-Info $pages[0] 'Une nouvelle installation utilise un dossier vide. Pour conserver une installation et ses conversations, lance son Installer.cmd puis choisis Ce dossier. Les mises a jour disposent de leur propre parcours.' 80

$null=Add-Info $pages[1] 'Le serveur utilise Node.js 24 ou plus récent. Le compagnon ne necessite aucune dependance npm. Python reste facultatif pour les documents et scripts.' 65
$nodeStatus=Add-Info $pages[1] '' 50
try { $script:state.Node=Get-BionicNode -Root $PSScriptRoot; $nodeStatus.Text='Node.js compatible détecté : ' + $script:state.Node } catch { $nodeStatus.Text='Node.js compatible non détecté. Choisis node.exe ou autorise le téléchargement portable ci-dessous.' }
$chooseNode=New-ActionButton 'Choisir node.exe'; $chooseNode.Width=180; $pages[1].Controls.Add($chooseNode)
$chooseNode.Add_Click({$dialog=New-Object Windows.Forms.OpenFileDialog; $dialog.Filter='Node.js (node.exe)|node.exe'; if($dialog.ShowDialog($form) -eq 'OK'){$script:state.Node=$dialog.FileName; $nodeStatus.Text='Executable choisi : '+$dialog.FileName; $download.Checked=$false}; $dialog.Dispose()})
$download=Add-Choice $pages[1] 'Télécharger Node.js 24 portable depuis nodejs.org (Internet requis)' $false
$null=Add-Info $pages[1] 'Uniquement si tu coches cette option : téléchargement officiel pour Windows x64/ARM64, controle SHA-256 et signature Windows. Copie privée dans runtime, sans changer le PATH ni le Node du PC. La licence de Node.js est conservee.' 95
$download.Add_CheckedChanged({$chooseNode.Enabled=-not $download.Checked})

$local=Read-BionicJson (Join-Path $PSScriptRoot 'config.local.json')
$apiValue=if(Get-BionicField $local 'apiUrl'){$local.apiUrl}else{'http://127.0.0.1:1235'}
$portValue=if(Get-BionicField $local 'port'){[string]$local.port}else{'8769'}
if (-not (Get-BionicField $local 'port')) { foreach($candidate in 8769..8789){if(-not (Test-BionicPortOpen $candidate)){$portValue=[string]$candidate;break}} }
$rootValue=if(Get-BionicField $local 'bionicRoot'){$local.bionicRoot}else{Join-Path $env:USERPROFILE '.lmstudio\apps\bionic'}
$api=Add-Field $pages[2] 'API locale affichee dans Bionic' $apiValue
$port=Add-Field $pages[2] 'Port du compagnon (different du port de Bionic)' $portValue
$proofPortValue=Get-BionicField $local 'certificateProofPort'
if ($null -eq $proofPortValue) {
    $proofPortValue=if ([int]$portValue -lt 65535) { [int]$portValue + 1 } else { [int]$portValue - 1 }
    foreach ($offset in 1..32) {
        $suggested=(([int]$portValue + $offset - 1) % 65535) + 1
        if ($suggested -ne ([Uri]$apiValue).Port -and -not (Test-BionicPortOpen $suggested)) { $proofPortValue=$suggested; break }
    }
}
$proofPort=Add-Field $pages[2] 'Port de verification HTTPS (utilise pendant la configuration)' ([string]$proofPortValue)
$bionicRoot=Add-Field $pages[2] 'Dossier de données Bionic (pas Bionic.exe)' $rootValue $true
$testApi=New-ActionButton 'Tester l API'; $pages[2].Controls.Add($testApi)
$apiStatus=Add-Info $pages[2] 'Le test lit uniquement la liste des modèles. Une API indisponible ne bloque pas l installation : elle devra etre activee avant de discuter.' 65
$testApi.Add_Click({ $testApi.Enabled=$false; $apiStatus.Text='Verification de l API locale...'; $form.Refresh(); try{$apiStatus.Text=Test-BionicInstallApi $api.Text}catch{$apiStatus.Text=$_.Exception.Message}; $testApi.Enabled=$true })

$review=Add-Info $pages[3] '' 140
$shortcut=Add-Choice $pages[3] 'Creer un raccourci sur le Bureau' $true
$launch=Add-Choice $pages[3] 'Demarrer le compagnon après installation' $true
$firewall=Add-Choice $pages[3] 'Autoriser le telephone et la configuration HTTPS sur le réseau privé' $false
$null=Add-Info $pages[3] 'Accord administrateur Windows unique pour les deux ports, sur ce réseau privé. Ensuite, les certificats se gèrent depuis Paramètres sur le téléphone. Sans cette option, le pare-feu reste inchangé. Aucun changement du routeur ni du profil réseau.' 75
$firewall.Add_CheckedChanged({if($firewall.Checked){$launch.Checked=$true}})
$launch.Add_CheckedChanged({if(-not $launch.Checked){$firewall.Checked=$false}})
$complete=Add-Info $pages[4] '' 145
$openApp=New-ActionButton 'Ouvrir l application'; $openApp.Width=190; $pages[4].Controls.Add($openApp)
$openApp.Add_Click({$config=Read-BionicJson (Join-Path $script:state.Result.Root 'data/config.json');if(Test-BionicIdentity (Get-BionicPing -Port $script:state.Result.Port -Root $script:state.Result.Root) ([string](Get-BionicField $config 'instanceId'))){Start-Process (Get-BionicApplicationUrl -Root $script:state.Result.Root -Port $script:state.Result.Port)}else{$feedback.Text='Le serveur de ce dossier ne repond pas. Lance Demarrer.cmd.'}})
$openAccess=New-ActionButton 'Code et adresses'; $openAccess.Width=175; $pages[4].Controls.Add($openAccess)
$openAccess.Add_Click({ $file=Join-Path $script:state.Result.Root 'ACCES-PRIVE.txt'; if(Test-Path -LiteralPath $file){Start-Process -FilePath 'notepad.exe' -ArgumentList ('"'+$file+'"')}else{$feedback.Text='Lance Demarrer.cmd pour générér ACCES-PRIVE.txt.'} })
$openFolder=New-ActionButton 'Ouvrir le dossier'; $openFolder.Width=175; $pages[4].Controls.Add($openFolder)
$openFolder.Add_Click({Start-Process -FilePath 'explorer.exe' -ArgumentList ('"'+$script:state.Result.Root+'"')})
$manageCertificates=New-ActionButton 'Acces securises'; $manageCertificates.Width=190
$pages[0].Controls.Add($manageCertificates)
$manageCertificates.Add_Click({
    try {
        $selected=Assert-BionicInstallPath $destination.Text
        $config=Read-BionicJson (Join-Path $selected 'data/config.json')
        $selectedPort=Get-BionicPort $selected
        if (-not (Test-BionicIdentity (Get-BionicPing -Port $selectedPort -Root $selected) ([string](Get-BionicField $config 'instanceId')))) { throw 'Demarre cette installation pour ouvrir ses parametres de securite.' }
        $address=(Get-BionicApplicationUrl -Root $selected -Port $selectedPort).TrimEnd('/') + '/?settings=security'
        Start-Process -FilePath $address
    } catch { $feedback.Text=$_.Exception.Message }
})
$null=Add-Info $pages[0] 'Acces securises ouvre les parametres dans le navigateur. HTTPS et les certificats clients se configurent aussi depuis le telephone. Certificats.cmd reste disponible sur le PC en cas de perte de tous les acces.' 65


function Show-Step([int]$Index) {
    $script:state.Step=$Index; $hostPanel.Controls.Clear(); $hostPanel.Controls.Add($pages[$Index])
    $titles=@('Choisir le dossier','Préparer Node.js','Connecter Bionic','Verifier et installér','Installation terminée')
    $title.Text=$titles[$Index]; $stepLabel.Text=if($Index -eq 4){'BIONIC MOBILE  /  PRÊT'}else{'BIONIC MOBILE  /  ÉTAPE '+($Index+1)+' SUR 4'}
    $previous.Visible=$Index -gt 0 -and $Index -lt 4; $cancel.Visible=$Index -lt 4
    $next.Text=if($Index -eq 3){'Installer'}elseif($Index -eq 4){'Fermer'}else{'Suivant'}
    $feedback.Text=''; $pages[$Index].SelectNextControl($null,$true,$true,$true,$false) | Out-Null
    if($Index -eq 3){$review.Text="Dossier : $($destination.Text)`r`nNode.js : $(if($download.Checked){'copie portable à télécharger'}else{'exécutable déjà disponible'})`r`nBionic : $($api.Text)`r`nCompagnon : port $($port.Text) (niveau de securite existant conserve)`r`nVerification HTTPS : port $($proofPort.Text)`r`n`r`nLes conversations d un autre dossier ne sont pas transférées."}
}

$timer=New-Object Windows.Forms.Timer; $timer.Interval=150
$timer.Add_Tick({
    $message=$null; while($script:state.Queue.TryDequeue([ref]$message)){$feedback.Text=$message}
    if(-not $script:state.Handle.IsCompleted){return}
    $timer.Stop()
    try {
        $items=$script:state.Worker.EndInvoke($script:state.Handle)
        if($script:state.Worker.HadErrors){throw $script:state.Worker.Streams.Error[0]}
        $script:state.Result=$items[$items.Count-1]
        Show-Step 4
        $complete.Text="Compagnon installé dans :`r`n$($script:state.Result.Root)`r`n`r`n$($script:state.Result.Message)`r`n`r`nSur le telephone : meme Wi-Fi, puis adresse et code dans ACCES-PRIVE.txt."
    } catch { $feedback.Text='Installation non terminée : '+$_.Exception.Message+' Tu peux corriger puis réessayer.' }
    finally { $script:state.Worker.Dispose(); $script:state.Token.Dispose(); $script:state.Busy=$false; $next.Enabled=$true; $previous.Enabled=$true; $cancel.Enabled=$true; $cancel.Text='Annuler' }
})
$next.Add_Click({
    if($script:state.Step -eq 4){$form.Close();return}
    try {
        if($script:state.Step -eq 0){$destination.Text=Assert-BionicInstallPath $destination.Text; if(-not [string]::Equals($destination.Text,$PSScriptRoot,[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $destination.Text) -and @(Get-ChildItem -LiteralPath $destination.Text -Force).Count){throw 'Choisis un dossier vide, ou Ce dossier pour conserver cette installation.'}}
        if($script:state.Step -eq 1 -and -not $download.Checked){if(-not $script:state.Node){throw 'Choisis node.exe ou coche le téléchargement portable.'}}
        if($script:state.Step -eq 2){$api.Text=ConvertTo-BionicApiUrl $api.Text; $number=0; if(-not [int]::TryParse($port.Text,[ref]$number) -or $number -lt 1 -or $number -gt 65535){throw 'Le port doit etre un entier entre 1 et 65535.'}; if(Test-BionicPortOpen $number){throw 'Ce port est occupe. Choisis un autre port, ou arrêté cette installation avant de la reconfigurer.'};if(([Uri]$api.Text).Port -eq $number){throw 'Utilise un port different de celui de Bionic.'}; $proofNumber=0; if(-not [int]::TryParse($proofPort.Text,[ref]$proofNumber) -or $proofNumber -lt 1 -or $proofNumber -gt 65535 -or $proofNumber -eq $number -or $proofNumber -eq ([Uri]$api.Text).Port){throw 'Choisis un port de verification HTTPS distinct du compagnon et de Bionic, entre 1 et 65535.'}; if(Test-BionicPortOpen $proofNumber){throw 'Le port de verification HTTPS est occupe. Choisis un autre port.'}; if($bionicRoot.Text){$null=Assert-BionicInstallPath $bionicRoot.Text}}
        if($script:state.Step -lt 3){Show-Step ($script:state.Step+1);return}
        $script:state.Token=New-Object Threading.CancellationTokenSource
        $script:state.Queue=New-Object 'Collections.Concurrent.ConcurrentQueue[string]'
        $script:state.Worker=[PowerShell]::Create()
        $job={param($helper,$source,$target,$port,$proofPort,$api,$bionic,$node,$download,$shortcut,$launch,$firewall,$token,$queue)
            $ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; . $helper
            $result=Install-BionicCompanion -Source $source -Destination $target -Port $port -CertificateProofPort $proofPort -ApiUrl $api -BionicRoot $bionic -NodePath $node -DownloadNode $download -Cancellation $token -Progress {$queue.Enqueue($args[0])}
            $messages=New-Object 'Collections.Generic.List[string]'
            function Invoke-WizardScript([string]$Path) {
                # Wait only for the launcher process, not its long-lived server
                # or inherited pipeline handles. Logs stay inside private runtime.
                $logRoot=Join-Path $result.Root 'runtime/install-steps'
                $null=New-Item -ItemType Directory -Path $logRoot -Force
                $id=[Guid]::NewGuid().ToString('N')
                $child=Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$Path+'"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot ($id+'.out.log')) -RedirectStandardError (Join-Path $logRoot ($id+'.err.log')) -PassThru
                try { $child.WaitForExit(); return $child.ExitCode -eq 0 }
                finally { $child.Dispose() }
            }
            if($shortcut){try{$desktop=[Environment]::GetFolderPath('Desktop');$link=Join-Path $desktop 'Bionic Mobile.lnk';if(Test-Path -LiteralPath $link){$messages.Add('Raccourci existant conserve.')}else{$shell=New-Object -ComObject WScript.Shell;$s=$shell.CreateShortcut($link);$s.TargetPath=Join-Path $result.Root 'Demarrer.cmd';$s.WorkingDirectory=$result.Root;$s.Description='Demarrer le compagnon local Bionic';$s.Save();$messages.Add('Raccourci créé sur le Bureau.')}}catch{$messages.Add('Raccourci non créé ; utilise Demarrer.cmd.')}}
            if($launch){$queue.Enqueue('Démarrage du compagnon...');if(Invoke-WizardScript (Join-Path $result.Root 'Demarrer.ps1')){$messages.Add('Serveur demarre.');if($firewall){$queue.Enqueue('Autorisation du pare-feu : attends la demande Windows...');if(Invoke-WizardScript (Join-Path $result.Root 'Autoriser-reseau-prive.ps1')){$messages.Add('Acces telephone et verification HTTPS autorises sur le réseau privé.')}else{$messages.Add('Pare-feu non confirme : utilise Autoriser-reseau.cmd si nécessaire.')}}}else{$messages.Add('Serveur non demarre : consulte server-error.log puis Demarrer.cmd.')}}else{$messages.Add('Lance Demarrer.cmd quand tu seras pret.')}
            $result.Message=$messages -join ' '; return $result
        }
        $null=$script:state.Worker.AddScript($job).AddArgument((Join-Path $PSScriptRoot 'Installation-commun.ps1')).AddArgument($PSScriptRoot).AddArgument($destination.Text).AddArgument([int]$port.Text).AddArgument([int]$proofPort.Text).AddArgument($api.Text).AddArgument($bionicRoot.Text).AddArgument($script:state.Node).AddArgument($download.Checked).AddArgument($shortcut.Checked).AddArgument($launch.Checked).AddArgument($firewall.Checked).AddArgument($script:state.Token.Token).AddArgument($script:state.Queue)
        $script:state.Handle=$script:state.Worker.BeginInvoke(); $script:state.Busy=$true; $next.Enabled=$false; $previous.Enabled=$false; $feedback.Text='Préparation...'; $timer.Start()
    }catch{$feedback.Text=$_.Exception.Message}
})
$previous.Add_Click({Show-Step ($script:state.Step-1)})
$cancel.Add_Click({if($script:state.Busy){$script:state.Token.Cancel();$cancel.Enabled=$false;$feedback.Text='Annulation demandee. Une installation deja enregistree sera conservee.'}else{$form.Close()}})
$form.Add_FormClosing({if($script:state.Busy){$_.Cancel=$true;$script:state.Token.Cancel();$feedback.Text='Annulation demandee. Attends la fin de l operation en cours.'}})
Show-Step 0
if($PreviewDirectory){
    $null=New-Item -ItemType Directory -Path $PreviewDirectory -Force
    $form.Opacity=0; $form.ShowInTaskbar=$false; $form.Show()
    foreach($index in 0..3){Show-Step $index;[Windows.Forms.Application]::DoEvents();$form.PerformLayout();$bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height);$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save((Join-Path $PreviewDirectory ('installation-'+$index+'.png')));$bitmap.Dispose()}
    $form.Close()
}else{$null=$form.ShowDialog()}
$timer.Dispose();$form.Dispose()
