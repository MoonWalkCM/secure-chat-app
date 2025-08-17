@echo off
echo ========================================
echo    Подготовка к развертыванию на GitHub
echo ========================================
echo.

echo 1. Создание .gitignore файла...
if not exist .gitignore (
    echo node_modules/ > .gitignore
    echo .env >> .gitignore
    echo *.log >> .gitignore
    echo .DS_Store >> .gitignore
    echo Thumbs.db >> .gitignore
    echo .vscode/ >> .gitignore
    echo .idea/ >> .gitignore
    echo npm-debug.log* >> .gitignore
    echo yarn-debug.log* >> .gitignore
    echo yarn-error.log* >> .gitignore
    echo .netlify/ >> .gitignore
    echo .vercel/ >> .gitignore
    echo chat.db >> .gitignore
    echo chat.db-journal >> .gitignore
    echo "Файл .gitignore создан!"
) else (
    echo "Файл .gitignore уже существует!"
)

echo.
echo 2. Создание README.md...
if not exist README.md (
    echo # Secure Chat Application > README.md
    echo. >> README.md
    echo ## Features >> README.md
    echo - End-to-end encryption >> README.md
    echo - Video and audio calls >> README.md
    echo - Real-time messaging >> README.md
    echo - File sharing >> README.md
    echo - User authentication >> README.md
    echo. >> README.md
    echo ## Installation >> README.md
    echo ```bash >> README.md
    echo npm install >> README.md
    echo npm start >> README.md
    echo ``` >> README.md
    echo "Файл README.md создан!"
) else (
    echo "Файл README.md уже существует!"
)

echo.
echo 3. Проверка package.json...
if exist package.json (
    echo "package.json найден!"
) else (
    echo "ОШИБКА: package.json не найден!"
    pause
    exit /b 1
)

echo.
echo ========================================
echo    Готово к развертыванию!
echo ========================================
echo.
echo Следующие шаги:
echo 1. Установите Git: https://git-scm.com/downloads
echo 2. Создайте репозиторий на GitHub.com
echo 3. Выполните команды:
echo    git init
echo    git add .
echo    git commit -m "Initial commit"
echo    git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
echo    git push -u origin main
echo 4. Подключите к Vercel: https://vercel.com
echo.
echo Или используйте Netlify: https://netlify.com
echo.
pause 