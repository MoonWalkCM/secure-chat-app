@echo off
echo ========================================
echo    Chat Server - Quick Start
echo ========================================
echo.

echo Starting Node.js server...
start "Node.js Server" cmd /k "npm start"

echo Waiting 5 seconds for server to start...
timeout /t 5 /nobreak > nul

echo Starting Localtunnel...
start "Localtunnel" cmd /k "lt --port 3000 --subdomain chat-app-secure"

echo.
echo ========================================
echo    Server is starting...
echo ========================================
echo.
echo Local access: http://localhost:3000
echo.
echo Localtunnel URL will appear in the new window.
echo Wait for the URL to appear, then you can access
echo your chat app from anywhere in the world!
echo.
echo Press any key to exit this window...
pause > nul 