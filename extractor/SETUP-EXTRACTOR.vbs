Option Explicit
Dim shell, fso, baseDir, ps1, cmd, rc
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = fso.BuildPath(baseDir, "install-extractor.ps1")
If Not fso.FileExists(ps1) Then
  MsgBox "Installer file is missing: " & ps1, 16, "Extractor Setup"
  WScript.Quit 1
End If
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
rc = shell.Run(cmd, 0, True)
WScript.Quit rc
