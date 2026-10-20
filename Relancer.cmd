@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Arreter.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Demarrer.ps1"
if errorlevel 1 pause
