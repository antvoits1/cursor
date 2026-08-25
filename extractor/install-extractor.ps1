$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms

$PackageDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceDir = Join-Path $PackageDir 'app'
$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\Extractor-Aug21-Phase2-v3'
$LogFile = Join-Path $env:TEMP 'Extractor-Aug21-Phase2-v3-setup.log'

function Ensure-Dir([string]$Path) {
    if (!(Test-Path -LiteralPath $Path)) { New-Item -ItemType Directory -Force -Path $Path | Out-Null }
}

function Log([string]$Message) {
    $line = "$(Get-Date -Format s)  $Message"
    try { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 } catch {}
}

function Run-Native([string]$Exe, [string[]]$Arguments, [string]$Label) {
    $stdout = Join-Path $env:TEMP ("extractor-" + [guid]::NewGuid().ToString('N') + '.out.log')
    $stderr = Join-Path $env:TEMP ("extractor-" + [guid]::NewGuid().ToString('N') + '.err.log')
    try {
        Log "START: $Label"
        $p = Start-Process -FilePath $Exe -ArgumentList $Arguments -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        if (Test-Path -LiteralPath $stdout) {
            Get-Content -LiteralPath $stdout -ErrorAction SilentlyContinue | ForEach-Object { Log ([string]$_) }
        }
        if (Test-Path -LiteralPath $stderr) {
            Get-Content -LiteralPath $stderr -ErrorAction SilentlyContinue | ForEach-Object { Log ([string]$_) }
        }
        Log "END: $Label (exit $($p.ExitCode))"
        if ($p.ExitCode -ne 0) { throw "$Label failed with exit code $($p.ExitCode)." }
    }
    finally {
        Remove-Item -LiteralPath $stdout,$stderr -Force -ErrorAction SilentlyContinue
    }
}

function Find-Python {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'),
        'C:\Python312\python.exe',
        'C:\Python311\python.exe'
    )
    foreach ($candidate in $candidates) { if (Test-Path -LiteralPath $candidate) { return $candidate } }
    foreach ($cmd in @('py.exe','python.exe')) {
        try {
            $found = (Get-Command $cmd -ErrorAction Stop).Source
            if ($found) { return $found }
        } catch {}
    }
    return $null
}

function Install-Python {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (!$winget) { throw 'Python is not installed and Windows Package Manager (winget) is unavailable.' }
    Run-Native $winget.Source @('install','--id','Python.Python.3.12','-e','--scope','user','--silent','--disable-interactivity','--accept-package-agreements','--accept-source-agreements') 'Python 3.12 installation'
}

try {
    Remove-Item -LiteralPath $LogFile -Force -ErrorAction SilentlyContinue
    Log 'Starting Extractor one-time setup v3.'
    Ensure-Dir $InstallDir

    foreach ($name in @('app.py','requirements.txt','static','web','pwa','IntelligenceExtractor.ico')) {
        $source = Join-Path $SourceDir $name
        if (!(Test-Path -LiteralPath $source)) { throw "Package file missing: $name" }
        $target = Join-Path $InstallDir $name
        Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
    }

    $Python = Find-Python
    if (!$Python) {
        Install-Python
        Start-Sleep -Seconds 3
        $Python = Find-Python
    }
    if (!$Python) { throw 'Python 3 could not be located after installation.' }
    Log "Using Python: $Python"

    $VenvDir = Join-Path $InstallDir '.venv'
    $VenvPython = Join-Path $VenvDir 'Scripts\python.exe'
    if (!(Test-Path -LiteralPath $VenvPython)) {
        Run-Native $Python @('-m','venv',$VenvDir) 'Private Python environment creation'
    }

    # A corrupted global pip cache caused the v2 warning/failure. Clear it when possible,
    # then install with cache disabled so cache warnings cannot affect setup.
    try { Run-Native $VenvPython @('-m','pip','cache','purge') 'pip cache cleanup' } catch { Log 'pip cache cleanup skipped; continuing cache-free.' }
    Run-Native $VenvPython @('-m','pip','install','--no-cache-dir','--disable-pip-version-check','--upgrade','pip','wheel','setuptools') 'Python package bootstrap'
    Run-Native $VenvPython @('-m','pip','install','--no-cache-dir','--disable-pip-version-check','-r',(Join-Path $InstallDir 'requirements.txt')) 'Extractor dependency installation'

    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $InstallDir 'playwright-browsers'
    Ensure-Dir $env:PLAYWRIGHT_BROWSERS_PATH
    Run-Native $VenvPython @('-m','playwright','install','chromium') 'Chromium runtime installation'

    Run-Native $VenvPython @('-m','py_compile',(Join-Path $InstallDir 'app.py')) 'Installed app.py verification'

    $LauncherVbs = Join-Path $InstallDir 'Launch Extractor.vbs'
    $Launcher = @"
Option Explicit
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "$InstallDir"
shell.Environment("PROCESS")("PLAYWRIGHT_BROWSERS_PATH") = "$InstallDir\playwright-browsers"
shell.Run Chr(34) & "$VenvDir\Scripts\pythonw.exe" & Chr(34) & " " & Chr(34) & "$InstallDir\app.py" & Chr(34), 0, False
"@
    Set-Content -LiteralPath $LauncherVbs -Value $Launcher -Encoding ASCII

    $Desktop = [Environment]::GetFolderPath('Desktop')
    $ShortcutPath = Join-Path $Desktop 'Extractor.lnk'
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = "$env:WINDIR\System32\wscript.exe"
    $Shortcut.Arguments = '"' + $LauncherVbs + '"'
    $Shortcut.WorkingDirectory = $InstallDir
    $Icon = Join-Path $InstallDir 'IntelligenceExtractor.ico'
    if (Test-Path -LiteralPath $Icon) { $Shortcut.IconLocation = $Icon }
    $Shortcut.Description = 'Extractor - Aug 21 Phase 2 v3'
    $Shortcut.Save()

    Log 'Setup completed successfully.'
    Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList ('"' + $LauncherVbs + '"')
    [System.Windows.Forms.MessageBox]::Show('Extractor setup is complete. Use the Extractor desktop shortcut from now on.','Extractor',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
    exit 0
}
catch {
    Log "SETUP FAILED: $($_.Exception.Message)"
    [System.Windows.Forms.MessageBox]::Show("Extractor setup failed.`n`n$($_.Exception.Message)`n`nLog: $LogFile",'Extractor Setup',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    exit 1
}
