@echo off
echo Stopping Lead Matrix Pro...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5050 "') do (
    taskkill /F /PID %%a
)
timeout /t 2 > nul
