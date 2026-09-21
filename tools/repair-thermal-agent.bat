@echo off
setlocal
cd /d "%~dp0.."

echo.
echo ==========================================
echo   UniquePOS Thermal Printer Repair
echo ==========================================
echo.

echo [1/4] Stopping any agent using port 17890...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":17890" ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo [2/4] Downloading the current thermal agent...
curl.exe -L --fail --silent --show-error -o "tools	hermal-print-agent.cjs" "https://raw.githubusercontent.com/muchangitony-code/unique-POS/main/tools/thermal-print-agent.cjs?v=2.1.0-raw-spooler"
if errorlevel 1 (
  echo.
  echo ERROR: Could not download the current thermal agent.
  echo Check the internet connection and try again.
  pause
  exit /b 1
)

echo [3/4] Verifying the downloaded agent...
findstr /C:"2.1.0-raw-spooler" "tools	hermal-print-agent.cjs" >nul
if errorlevel 1 (
  echo.
  echo ERROR: The downloaded thermal agent is not the expected version.
  pause
  exit /b 1
)

echo [4/4] Starting the repaired agent...
echo.
node "tools	hermal-print-agent.cjs"
pause
