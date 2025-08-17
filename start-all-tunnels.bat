@echo off
echo ========================================
echo    Все туннели для России - Запуск
echo ========================================
echo.

echo Остановка предыдущих процессов...
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak > nul

echo 1. Запуск Node.js сервера...
start "Node.js Server" cmd /k "npm start"

echo 2. Ожидание запуска сервера (10 секунд)...
timeout /t 10 /nobreak > nul

echo 3. Запуск всех туннелей...
echo.

echo - Serveo (SSH туннель) - РЕКОМЕНДУЕТСЯ для России
start "Serveo Tunnel" cmd /k "ssh -R 80:localhost:3000 serveo.net"

echo - Ngrok (если работает в России)
start "Ngrok Tunnel" cmd /k "ngrok http 3000 --host-header=localhost:3000"

echo - LocalTunnel без поддомена
start "LocalTunnel" cmd /k "lt --port 3000"

echo - LocalTunnel с поддоменом (может требовать пароль)
start "LocalTunnel Subdomain" cmd /k "lt --port 3000 --subdomain chat-app-secure"

echo.
echo ========================================
echo    Все туннели запущены!
echo ========================================
echo.
echo Локальный доступ: http://localhost:3000
echo.
echo Доступные туннели:
echo 1. Serveo: https://random-name.serveo.net (в окне SSH)
echo 2. Ngrok: https://random-id.ngrok.io (в окне Ngrok)
echo 3. LocalTunnel: https://random-id.loca.lt (в окне LocalTunnel)
echo 4. LocalTunnel Sub: https://chat-app-secure.loca.lt (может требовать пароль)
echo.
echo Рекомендации для России:
echo - Serveo: самый надежный
echo - Ngrok: самый быстрый (если работает)
echo - LocalTunnel: резервный вариант
echo.
echo Тестирование:
echo 1. Откройте любой URL в браузере
echo 2. Протестируйте с телефона (другая сеть)
echo 3. Проверьте чат и звонки
echo 4. Убедитесь, что WebSocket работает
echo.
echo Для остановки: закройте окна или Ctrl+C
echo.
pause 