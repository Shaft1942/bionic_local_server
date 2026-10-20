@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Retirer-autorisation-reseau.ps1"
if errorlevel 1 pause
