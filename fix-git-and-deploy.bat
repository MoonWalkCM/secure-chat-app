@echo off
echo ========================================
echo    Исправление Git и загрузка в GitHub
echo ========================================
echo.

echo 1. Очистка старых Git файлов...
if exist .git (
    rmdir /s /q .git
    echo Старые Git файлы удалены.
)

echo.
echo 2. Проверка наличия Git...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo Git не найден в PATH.
    echo Пожалуйста, установите Git:
    echo 1. Перейдите на https://git-scm.com/downloads
    echo 2. Скачайте Git for Windows
    echo 3. Установите с настройками по умолчанию
    echo 4. Перезапустите командную строку
    echo 5. Запустите этот скрипт снова
    pause
    exit /b 1
)

echo Git найден!

echo.
echo 3. Настройка Git...
echo Введите ваше имя (например: Иван Иванов):
set /p git_name=
git config --global user.name "%git_name%"

echo Введите ваш email (например: ivan@example.com):
set /p git_email=
git config --global user.email "%git_email%"

echo.
echo 4. Инициализация Git репозитория...
git init
git add .
git commit -m "Initial commit: Secure Chat Application"

echo.
echo 5. Подключение к GitHub...
echo Введите URL вашего GitHub репозитория:
echo (например: https://github.com/MoonWalkCM/secure-chat-app.git)
set /p repo_url=
git remote add origin %repo_url%
git branch -M main
git push -u origin main

echo.
echo ========================================
echo    Код успешно загружен в GitHub!
echo ========================================
echo.
echo Теперь перейдите к развертыванию:
echo 1. Vercel: https://vercel.com
echo 2. Netlify: https://netlify.com
echo.
echo Выберите один из сервисов и подключите ваш GitHub репозиторий.
echo.
pause 