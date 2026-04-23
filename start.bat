@echo off
title Article Generator Server
echo ---------------------------------------------------
echo 🚀 Starting Article Generator Server...
echo ---------------------------------------------------
cd /d "%~dp0"

:: Check if node_modules exists, if not, try to install
if not exist "node_modules\" (
    echo 📦 node_modules not found. Installing dependencies...
    call npm install
)

:: Start the server
call npm start

:: If the server stops for some reason, keep the window open
echo.
echo ⚠️ Server has stopped.
pause
