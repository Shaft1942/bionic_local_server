param([Parameter(Mandatory=$true)][ValidateSet('bionic','comfyui')][string]$ServiceId)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = if ($ServiceId -eq 'bionic') { 'Choisir le dossier contenant Bionic.exe' } else { 'Choisir le dossier de ComfyUI ou de son installation portable' }
$dialog.ShowNewFolderButton = $false
try {
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($dialog.SelectedPath) }
} finally { $dialog.Dispose() }
