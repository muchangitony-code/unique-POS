@echo off
setlocal
cd /d "%~dp0.."

echo Stopping any old thermal agent...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":17890" ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
timeout /t 1 /nobreak >nul

echo Downloading current UniquePOS Thermal Print Agent...
curl.exe -L --fail --silent --show-error -o "tools\thermal-print-agent.cjs" "https://raw.githubusercontent.com/muchangitony-code/unique-POS/main/tools/thermal-print-agent.cjs?v=2.1.0-raw-spooler"
if errorlevel 1 (
  echo.
  echo ERROR: Could not download the current thermal agent.
  pause
  exit /b 1
)

echo Verifying thermal agent version...
findstr /C:"AGENT_CAPABILITIES = ["raw-spooler"" "tools\thermal-print-agent.cjs" >nul
if errorlevel 1 (
  echo.
  echo ERROR: Downloaded agent does not contain the RAW ESC/POS capability.
  echo The old thermal agent will NOT be started.
  pause
  exit /b 1
)

echo Starting UniquePOS Thermal Print Agent...
node "tools\thermal-print-agent.cjs"
pause
