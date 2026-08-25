export const ONECLICK_FILENAME = "AA-Extractor-OneClick.vbs";
export const ONECLICK_ZIP_FILENAME = "AA-Extractor-OneClick.zip";

export function normalizeAppUrl(url: string) {
  const trimmed = url.trim() || "http://localhost:3000";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function buildOneClickVbs(appUrl: string) {
  const url = normalizeAppUrl(appUrl).replace(/"/g, "");
  return `' AA Extractor — one-click installer
' Double-click once. No command window. Goes straight to the front page.
' 1) Downloads the app icon
' 2) Creates a Desktop + Start Menu shortcut
' 3) Opens AA Extractor immediately

Option Explicit
Dim sh, fso, http, stream, appDir, desktop, startMenu, url, browser, args, ico, sc

url = "${url}"
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\\AAExtractor"
If Not fso.FolderExists(appDir) Then fso.CreateFolder appDir

desktop = sh.SpecialFolders("Desktop")
startMenu = sh.SpecialFolders("StartMenu") & "\\Programs"
ico = appDir & "\\aa-extractor.ico"

On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP.6.0")
http.Open "GET", url & "aa-extractor.ico", False
http.Send
If Err.Number = 0 And http.Status = 200 Then
  Set stream = CreateObject("ADODB.Stream")
  stream.Type = 1
  stream.Open
  stream.Write http.ResponseBody
  stream.SaveToFile ico, 2
  stream.Close
End If
Err.Clear
On Error GoTo 0

Function BrowserPath()
  Dim candidates, i
  candidates = Array( _
    sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\\Microsoft\\Edge\\Application\\msedge.exe", _
    sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\\Microsoft\\Edge\\Application\\msedge.exe", _
    sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\\Google\\Chrome\\Application\\chrome.exe", _
    sh.ExpandEnvironmentStrings("%LocalAppData%") & "\\Google\\Chrome\\Application\\chrome.exe" _
  )
  For i = 0 To UBound(candidates)
    If fso.FileExists(candidates(i)) Then
      BrowserPath = candidates(i)
      Exit Function
    End If
  Next
  BrowserPath = ""
End Function

browser = BrowserPath()
args = "--app=" & url & " --new-window --window-size=1440,920"

Sub WriteShortcut(path)
  Set sc = sh.CreateShortcut(path)
  If browser <> "" Then
    sc.TargetPath = browser
    sc.Arguments = args
  Else
    sc.TargetPath = url
    sc.Arguments = ""
  End If
  sc.WorkingDirectory = appDir
  sc.Description = "AA Extractor"
  sc.WindowStyle = 1
  If fso.FileExists(ico) Then sc.IconLocation = ico
  sc.Save
End Sub

WriteShortcut desktop & "\\AA Extractor.lnk"
If fso.FolderExists(startMenu) Then WriteShortcut startMenu & "\\AA Extractor.lnk"

Dim cfg
Set cfg = fso.CreateTextFile(appDir & "\\app-url.txt", True)
cfg.WriteLine url
cfg.Close

If browser <> "" Then
  sh.Run Chr(34) & browser & Chr(34) & " " & args, 1, False
Else
  sh.Run "cmd /c start " & Chr(34) & Chr(34) & " " & Chr(34) & url & Chr(34), 0, False
End If
`;
}

export function buildInstallReadme(appUrl: string) {
  const url = normalizeAppUrl(appUrl);
  return `AA Extractor — one-click for Windows
=====================================

Double-click  ${ONECLICK_FILENAME}

That single click:
  • downloads the app icon
  • puts "AA Extractor" on your Desktop (and Start Menu)
  • opens the front page with no command window

After that, just use the Desktop shortcut. It opens straight to:
  ${url}

If Windows SmartScreen asks, choose More info → Run anyway.
This file only creates a shortcut to the official app URL.
`;
}
