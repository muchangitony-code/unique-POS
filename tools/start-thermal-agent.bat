@echo off
setlocal
cd /d "%~dp0.."
node tools\thermal-print-agent.cjs
pause
