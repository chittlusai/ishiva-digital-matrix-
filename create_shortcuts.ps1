$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')

# Create Start Shortcut
$StartShortcut = $WshShell.CreateShortcut("$DesktopPath\Start Lead Matrix.lnk")
$StartShortcut.TargetPath = "wscript.exe"
$StartShortcut.Arguments = """c:\Users\chitt\.gemini\antigravity\scratch\lead-gen-frontend\Start_Dashboard.vbs"""
$StartShortcut.IconLocation = "c:\Users\chitt\.gemini\antigravity\scratch\lead-gen-frontend\dashboard_icon.ico"
$StartShortcut.WorkingDirectory = "c:\Users\chitt\.gemini\antigravity\scratch\lead-gen-frontend"
$StartShortcut.Save()

# Create Stop Shortcut
$StopShortcut = $WshShell.CreateShortcut("$DesktopPath\Stop Lead Matrix.lnk")
$StopShortcut.TargetPath = "c:\Users\chitt\.gemini\antigravity\scratch\lead-gen-frontend\stop.bat"
$StopShortcut.IconLocation = "%SystemRoot%\System32\SHELL32.dll,27" # A stop/X icon
$StopShortcut.WorkingDirectory = "c:\Users\chitt\.gemini\antigravity\scratch\lead-gen-frontend"
$StopShortcut.WindowStyle = 7 # Minimized
$StopShortcut.Save()

Write-Host "Shortcuts created on desktop successfully!"
