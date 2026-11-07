@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Convert-VectorCraft.ps1" "%~1"
pause
