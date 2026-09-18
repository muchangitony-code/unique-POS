@echo off
setlocal
cd /d "%~dp0.."
echo Updating UniquePOS Thermal Print Agent...
where curl.exe >nul 2>&1
if %errorlevel%==0 (
  curl.exe -L --fail --silent --show-error -o "tools\thermal-print-agent.cjs" "https://raw.githubusercontent.com/muchangitony-code/unique-POS/main/tools/thermal-print-agent.cjs"
)
echo Starting UniquePOS Thermal Print Agent...
node "tools\thermal-print-agent.cjs"
pause
