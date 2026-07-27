@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0CAP_NHAT_SPEC.ps1"
if errorlevel 1 (
  echo.
  echo Khong the cap nhat danh sach SPEC. Vui long kiem tra lai thu muc spec.
  pause
  exit /b 1
)

powershell.exe -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:8773/__health'; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }"
if errorlevel 1 (
  start "TON KHO LOCAL SERVER" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0LOCAL_SERVER.ps1" -Port 8773
)

powershell.exe -NoProfile -Command "$ok=$false; 1..20 | ForEach-Object { try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:8773/__health'; if($r.StatusCode -eq 200){$ok=$true; break} } catch {}; Start-Sleep -Milliseconds 250 }; if($ok){exit 0}else{exit 1}"
if errorlevel 1 (
  echo.
  echo Khong khoi dong duoc may chu noi bo. Website se mo truc tiep,
  echo nhung mot so anh tren file xuat co the bi thay bang o CHUA CO ANH.
  start "" "%~dp0inventory.html"
  exit /b 0
)

start "" "http://127.0.0.1:8773/inventory.html?v=23"
endlocal
