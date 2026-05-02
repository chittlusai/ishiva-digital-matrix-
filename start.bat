@echo off
cd /d "c:\Users\chitt\.gemini\antigravity\scratch\lead-gen-frontend"
call venv\Scripts\activate.bat
python app.py > startup.log 2>&1
