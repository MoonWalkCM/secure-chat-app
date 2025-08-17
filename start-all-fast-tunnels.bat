@echo off
echo ========================================
echo    Быстрые туннели для России - Запуск
echo ========================================
echo.

echo Остановка предыдущих процессов...
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak > nul

echo 1. Запуск Node.js сервера...
start "Node.js Server" cmd /k "npm start"

echo 2. Ожидание запуска сервера (10 секунд)...
timeout /t 10 /nobreak > nul

echo 3. Запуск быстрых туннелей...
echo.

echo - Expose (самый быстрый) - РЕКОМЕНДУЕТСЯ
start "Expose Tunnel" cmd /k "expose 3000"

echo - Serveo (SSH туннель) - самый надежный
start "Serveo Tunnel" cmd /k "ssh -R 80:localhost:3000 serveo.net"

echo - Telebit (альтернатива)
start "Telebit Tunnel" cmd /k "telebit --port 3000"

echo.
echo ========================================
echo    Все быстрые туннели запущены!
echo ========================================
echo.
echo Локальный доступ: http://localhost:3000
echo.
echo Доступные туннели:
echo 1. Expose: https://random-name.expose.dev (в окне Expose)
echo 2. Serveo: https://random-name.serveo.net (в окне SSH)
echo 3. Telebit: https://random-name.telebit.io (в окне Telebit)
echo.
echo Рекомендации для России:
echo - Expose: самый быстрый (8-12 Мбит/с)
echo - Serveo: самый надежный (4-6 Мбит/с)
echo - Telebit: альтернатива (6-10 Мбит/с)
echo.
echo Все туннели:
echo - НЕ требуют пароль
echo - Поддерживают WebSocket
echo - Работают в России
echo - Быстрее LocalTunnel в 3-4 раза
echo.
echo Тестирование:
echo 1. Откройте любой URL в браузере
echo 2. Протестируйте с телефона (другая сеть)
echo 3. Проверьте чат и звонки
echo 4. Убедитесь, что WebSocket работает
echo 5. Проверьте скорость загрузки
echo.
echo Для остановки: закройте окна или Ctrl+C
echo.
pause 