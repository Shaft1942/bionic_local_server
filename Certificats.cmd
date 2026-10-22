@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Certificats.ps1" %*
pause
