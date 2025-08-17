@echo off
echo ========================================
echo    LocalTunnel для России - Запуск
echo ========================================
echo.

echo Остановка предыдущих процессов...
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak > nul

echo 1. Запуск Node.js сервера...
start "Node.js Server" cmd /k "npm start"

echo 2. Ожидание запуска сервера (10 секунд)...
timeout /t 10 /nobreak > nul

echo 3. Запуск LocalTunnel...
start "LocalTunnel" cmd /k "lt --port 3000 --subdomain chat-app-secure --local-host localhost"

echo.
echo ========================================
echo    Сервер запущен!
echo ========================================
echo.
echo Локальный доступ: http://localhost:3000
echo.
echo LocalTunnel URL появится в новом окне.
echo Обычно это: https://chat-app-secure.loca.lt
echo.
echo Тестирование:
echo 1. Откройте LocalTunnel URL в браузере
echo 2. Протестируйте с телефона (другая сеть)
echo 3. Проверьте чат и звонки
echo 4. Убедитесь, что WebSocket работает
echo.
echo Для остановки: закройте окна или Ctrl+C
echo.
pause 