@echo off
echo ========================================
echo    Установка Git и загрузка в GitHub
echo ========================================
echo.

echo 1. Скачивание Git...
echo Скачиваем Git для Windows...
powershell -Command "& {Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe' -OutFile 'git-installer.exe'}"

if exist git-installer.exe (
    echo.
    echo 2. Установка Git...
    echo Запускаем установщик Git...
    echo Пожалуйста, установите Git с настройками по умолчанию
    echo После установки нажмите любую клавишу...
    start /wait git-installer.exe
    del git-installer.exe
    
    echo.
    echo 3. Обновление PATH...
    echo Обновляем переменные среды...
    refreshenv
    
    echo.
    echo 4. Проверка установки Git...
    git --version
    if %errorlevel% equ 0 (
        echo Git успешно установлен!
    ) else (
        echo Ошибка: Git не найден. Попробуйте перезапустить командную строку.
        pause
        exit /b 1
    )
) else (
    echo Ошибка: Не удалось скачать Git.
    echo Пожалуйста, установите Git вручную:
    echo 1. Перейдите на https://git-scm.com/downloads
    echo 2. Скачайте Git for Windows
    echo 3. Установите с настройками по умолчанию
    echo 4. Перезапустите командную строку
    pause
    exit /b 1
)

echo.
echo ========================================
echo    Настройка Git и загрузка кода
echo ========================================
echo.

echo 5. Настройка Git...
echo Введите ваше имя (например: John Doe):
set /p git_name=
git config --global user.name "%git_name%"

echo Введите ваш email (например: john@example.com):
set /p git_email=
git config --global user.email "%git_email%"

echo.
echo 6. Инициализация Git репозитория...
git init
git add .
git commit -m "Initial commit: Secure Chat Application"

echo.
echo 7. Подключение к GitHub...
echo Введите URL вашего GitHub репозитория:
echo (например: https://github.com/YOUR_USERNAME/YOUR_REPO.git)
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