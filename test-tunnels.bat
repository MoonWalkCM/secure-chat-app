@echo off
echo ========================================
echo    Тестирование туннелей для России
echo ========================================
echo.

echo 1. Запуск Node.js сервера...
start "Node.js Server" cmd /k "npm start"

echo 2. Ожидание запуска сервера...
timeout /t 5 /nobreak > nul

echo 3. Тестирование LocalTunnel...
start "LocalTunnel" cmd /k "lt --port 3000 --subdomain chat-app-secure --local-host localhost"

echo 4. Тестирование Serveo (SSH туннель)...
start "Serveo" cmd /k "ssh -R 80:localhost:3000 serveo.net"

echo 5. Тестирование LocalTunnel с другим поддоменом...
start "LocalTunnel Backup" cmd /k "lt --port 3000 --subdomain chat-app-backup --local-host localhost"

echo.
echo ========================================
echo    Туннели запущены для тестирования
echo ========================================
echo.
echo Доступные URL:
echo - Local: http://localhost:3000
echo - LocalTunnel: https://chat-app-secure.loca.lt
echo - LocalTunnel Backup: https://chat-app-backup.loca.lt
echo - Serveo: (появится в окне Serveo)
echo.
echo Тестируйте каждый URL с разных устройств!
echo.
pause 