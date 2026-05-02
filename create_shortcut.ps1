$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\Lead Matrix.lnk")
$Shortcut.TargetPath = "c:\Users\chitt\.gemini\antigravity\scratch\lead-gen-frontend\Start_Dashboard.vbs"
$Shortcut.IconLocation = "c:\Users\chitt\.gemini\antigravity\scratch\lead-gen-frontend\dashboard_icon.ico"
$Shortcut.Save()
