$ErrorActionPreference = 'Stop'

$desktopDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$startBat = Join-Path $desktopDir 'START-EXTRACTOR.bat'
if (-not (Test-Path $startBat)) {
  throw "START-EXTRACTOR.bat was not found next to this installer."
}

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Extractor.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $startBat
$shortcut.WorkingDirectory = $desktopDir
$shortcut.WindowStyle = 1
$shortcut.Description = 'Start Extractor on this computer'
$shortcut.Save()

Write-Host "Created desktop shortcut:"
Write-Host "  $shortcutPath"
Write-Host ""
Write-Host "First launch installs Node/Python packages once."
Write-Host "After that, just double-click Extractor."
