@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0CAP_NHAT_SPEC.ps1"
echo.
pause
endlocal
