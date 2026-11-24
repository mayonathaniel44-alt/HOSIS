@echo off
cd /d "%~dp0"
if not exist backend\node_modules call npm.cmd ci --prefix backend
if errorlevel 1 exit /b 1
if not exist frontend\dist\index.html (
  if not exist frontend\node_modules call npm.cmd ci --prefix frontend
  call npm.cmd run build --prefix frontend
)
if errorlevel 1 exit /b 1
node scripts\setup-first-run.cjs
if errorlevel 1 exit /b 1
node scripts\start.cjs
pause
