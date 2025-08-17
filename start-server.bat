@echo off
echo Starting Chat Server with Global Access...
echo.

echo 1. Starting Node.js server...
start "Node.js Server" cmd /k "npm start"

echo 2. Waiting for server to start...
timeout /t 3 /nobreak > nul

echo 3. Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel run chat-app"

echo 4. Starting Localtunnel (backup)...
start "Localtunnel" cmd /k "lt --port 3000 --subdomain chat-app-secure"

echo.
echo All services started!
echo.
echo Access URLs:
echo - Local: http://localhost:3000
echo - Cloudflare Tunnel: https://chat-app.your-domain.com (after DNS setup)
echo - Localtunnel: https://chat-app-secure.loca.lt
echo.
echo Press any key to exit...
pause > nul 