@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Convert-VectorCraft.ps1" -Independent -Source "%~1"
pause
