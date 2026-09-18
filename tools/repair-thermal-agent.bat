@echo off
setlocal
cd /d "%~dp0.."

echo.
echo ==========================================
echo   UniquePOS Thermal Printer Repair
echo ==========================================
echo.

echo [1/4] Stopping the old thermal agent...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-NetTCPConnection -LocalPort 17890 -ErrorAction SilentlyContinue; if($c){$c ^| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}"

echo [2/4] Downloading the current thermal agent...
curl.exe -L --fail --silent --show-error -o "tools\thermal-print-agent.cjs" "https://raw.githubusercontent.com/muchangitony-code/unique-POS/main/tools/thermal-print-agent.cjs"
if errorlevel 1 (
  echo.
  echo ERROR: Could not download the current thermal agent.
  echo Check the internet connection and try again.
  pause
  exit /b 1
)

echo [3/4] Starting the repaired agent...
echo.
node "tools\thermal-print-agent.cjs"
pause
