@echo off
echo ========================================
echo    Serveo Tunnel для России - Запуск
echo ========================================
echo.

echo Остановка предыдущих процессов...
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak > nul

echo 1. Запуск Node.js сервера...
start "Node.js Server" cmd /k "npm start"

echo 2. Ожидание запуска сервера (10 секунд)...
timeout /t 10 /nobreak > nul

echo 3. Запуск Serveo SSH туннеля...
start "Serveo Tunnel" cmd /k "ssh -R 80:localhost:3000 serveo.net"

echo.
echo ========================================
echo    Сервер запущен!
echo ========================================
echo.
echo Локальный доступ: http://localhost:3000
echo.
echo Serveo URL появится в новом окне.
echo Обычно это: https://random-name.serveo.net
echo.
echo Преимущества Serveo:
echo - НЕ требует пароль
echo - Работает в России
echo - Поддерживает WebSocket
echo - Бесплатно
echo.
echo Тестирование:
echo 1. Откройте Serveo URL в браузере
echo 2. Протестируйте с телефона (другая сеть)
echo 3. Проверьте чат и звонки
echo 4. Убедитесь, что WebSocket работает
echo.
echo Для остановки: закройте окна или Ctrl+C
echo.
pause 