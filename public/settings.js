document.addEventListener('DOMContentLoaded', () => {
    // --- DICTIONARY FOR LANGUAGES ---
    const translations = {
        en: {
            dashboard: "MwLauncher",
            home: "Home",
            chats: "Chats",
            profile: "Profile",
            welcome: "Welcome, MwX!",
            welcomeSubtitle: "This is your Launcher for games. Here's an overview of your account.",
            augustusCrack: "Augustus Crack",
            launch: "Launch",
            overview: "Overview",
            // Chats Page
            chatsTitle: "Chats",
            chatsSubtitle: "Connect with friends and other players",
            searchPlaceholder: "Search contacts...",
            messagePlaceholder: "Type a message...",
            // Settings Page
            pageTitle: "Page Settings",
            pageSubtitle: "Customize the appearance and language of the interface.",
            themeTitle: "Interface Color",
            themeSubtitle: "Select your favorite accent color.",
            colorThemeTitle: "Color Themes",
            colorThemeSubtitle: "Choose a predefined color theme for the entire dashboard.",
            langTitle: "Language",
            langSubtitle: "Choose interface language.",
            ramTitle: "RAM Allocation",
            ramSubtitle: "For optimization of complex scripts.",
            logoutTitle: "Logout",
            logoutSubtitle: "Securely log out of your account.",
            logoutButton: "Log Out Now",
            // Registration Page
            registerTitle: "Register",
            loginPlaceholder: "Login",
            emailPlaceholder: "Email",
            passwordPlaceholder: "Password",
            keyPlaceholder: "Registration Key",
            registerButton: "Register",
            loginLink: "Already have an account? Login",
            hint1: "Use a strong password",
            hint2: "Include numbers and symbols",
            hint3: "Avoid common words",
            allFieldsRequired: "All fields are required",
            invalidEmail: "Invalid email format",
            passwordTooShort: "Password must be at least 6 characters",
            serverError: "Server error",
            // Profile Page
            profileTitle: "Your Profile",
            greeting: "How are you, ",
            profileSubtitle: "Manage your nickname and password",
            loginTitle: "Login",
            loginSubtitle: "Your unique login identifier",
            nicknameTitle: "Nickname",
            nicknameSubtitle: "Choose a display name for your profile",
            passwordTitle: "Password",
            passwordSubtitle: "Update your account password",
            nicknamePlaceholder: "Nickname",
            newPasswordPlaceholder: "New Password",
            updateButton: "Update Profile",
            updateSuccess: "Profile updated successfully",
            noChanges: "No changes provided"
        },
        ru: {
            dashboard: "MwLauncher",
            home: "Главная",
            chats: "Чаты",
            profile: "Профиль",
            welcome: "Добро пожаловать, MwX!",
            welcomeSubtitle: "Это ваша главная панель. Здесь находится обзор вашей учетной записи.",
            augustusCrack: "Augustus Crack",
            launch: "Запустить",
            overview: "Обзор",
            // Chats Page
            chatsTitle: "Чаты",
            chatsSubtitle: "Общайтесь с друзьями и другими игроками",
            searchPlaceholder: "Поиск контактов...",
            messagePlaceholder: "Введите сообщение...",
            // Settings Page
            pageTitle: "Настройки страницы",
            pageSubtitle: "Настройте внешний вид и язык интерфейса.",
            themeTitle: "Цвет интерфейса",
            themeSubtitle: "Выберите ваш любимый акцентный цвет.",
            colorThemeTitle: "Цветовые темы",
            colorThemeSubtitle: "Выберите предопределенную цветовую тему для всей панели.",
            langTitle: "Язык",
            langSubtitle: "Выберите язык интерфейса.",
            ramTitle: "Выделение ОЗУ",
            ramSubtitle: "Для оптимизации сложных скриптов.",
            logoutTitle: "Выход",
            logoutSubtitle: "Безопасный выход из аккаунта.",
            logoutButton: "Выйти сейчас",
            // Registration Page
            registerTitle: "Регистрация",
            loginPlaceholder: "Логин",
            emailPlaceholder: "Электронная почта",
            passwordPlaceholder: "Пароль",
            keyPlaceholder: "Ключ регистрации",
            registerButton: "Зарегистрироваться",
            loginLink: "Уже есть аккаунт? Войти",
            hint1: "Используйте надежный пароль",
            hint2: "Включите цифры и символы",
            hint3: "Избегайте распространенных слов",
            allFieldsRequired: "Все поля обязательны",
            invalidEmail: "Неверный формат email",
            passwordTooShort: "Пароль должен содержать не менее 6 символов",
            serverError: "Ошибка сервера",
            // Profile Page
            profileTitle: "Ваш профиль",
            greeting: "Как дела, ",
            profileSubtitle: "Управляйте своим ником и паролем",
            loginTitle: "Логин",
            loginSubtitle: "Ваш уникальный идентификатор",
            nicknameTitle: "Ник",
            nicknameSubtitle: "Выберите отображаемое имя для профиля",
            passwordTitle: "Пароль",
            passwordSubtitle: "Обновите пароль вашей учетной записи",
            nicknamePlaceholder: "Ник",
            newPasswordPlaceholder: "Новый пароль",
            updateButton: "Обновить профиль",
            updateSuccess: "Профиль успешно обновлен",
            noChanges: "Нет изменений для сохранения"
        }
    };

    // Make translations available globally for other scripts
    window.translations = translations;

    // --- UNIVERSAL FUNCTIONS ---

    function applyTheme(color) {
        document.documentElement.style.setProperty('--primary-color', color);
    }

    function applyOverallTheme(baseColor, gradientColor) {
        document.body.style.background = `linear-gradient(135deg, ${baseColor}, ${gradientColor})`;
    }

    function applyLanguage(lang) {
        document.querySelectorAll('[data-lang-key]').forEach(elem => {
            const key = elem.getAttribute('data-lang-key');
            if (translations[lang] && translations[lang][key]) {
                elem.textContent = translations[lang][key];
            }
        });
        document.documentElement.lang = lang;
    }

    function loadSettings() {
        // Load Theme (accent color)
        const savedColor = localStorage.getItem('themeColor') || '#82aaff';
        applyTheme(savedColor);

        // Load Overall Theme (body background gradient)
        const savedOverallThemeBase = localStorage.getItem('overallThemeBaseColor');
        const savedOverallThemeGradient = localStorage.getItem('overallThemeGradientColor');
        if (savedOverallThemeBase && savedOverallThemeGradient) {
            applyOverallTheme(savedOverallThemeBase, savedOverallThemeGradient);
        } else {
            // Default overall theme if not saved
            applyOverallTheme('#2a5298', '#1e3c72');
        }

        // Load Language
        const savedLang = localStorage.getItem('language') || 'en';
        applyLanguage(savedLang);

        // Update active states on settings page if it's the current page
        if (document.querySelector('.color-palette')) {
            // Interface Color swatches
            document.querySelectorAll('.setting-card:nth-child(1) .color-swatch').forEach(swatch => {
                swatch.classList.remove('active');
                if (swatch.dataset.color === savedColor) {
                    swatch.classList.add('active');
                }
            });

            // Overall Theme swatches
            document.querySelectorAll('.setting-card:nth-child(2) .color-swatch').forEach(swatch => {
                swatch.classList.remove('active');
                if (swatch.dataset.color === savedOverallThemeBase) {
                    swatch.classList.add('active');
                }
            });
        }
        if (document.querySelector('.language-toggle')) {
            document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById(`lang-${savedLang}`).classList.add('active');
        }
    }

    // --- CLOCK ---
    const timeElement = document.getElementById('msk-time');
    if (timeElement) {
        const updateTime = () => {
            const mskTime = new Date().toLocaleString("en-US", {
                timeZone: "Europe/Moscow",
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            timeElement.textContent = `MSK ${mskTime}`;
        };
        updateTime();
        setInterval(updateTime, 1000);
    }

    // --- EVENT LISTENERS FOR SETTINGS PAGE ---

    // Theme switcher (Interface Color)
    const interfaceColorSwatches = document.querySelectorAll('.setting-card:nth-child(1) .color-swatch');
    if (interfaceColorSwatches) {
        interfaceColorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                const color = swatch.dataset.color;
                localStorage.setItem('themeColor', color);
                applyTheme(color);
                interfaceColorSwatches.forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            });
        });
    }

    // New Color Themes switcher (Overall Theme)
    const overallThemeSwatches = document.querySelectorAll('.setting-card:nth-child(2) .color-swatch');
    if (overallThemeSwatches) {
        overallThemeSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                const baseColor = swatch.dataset.color;
                const gradientColor = swatch.dataset.gradient;
                localStorage.setItem('overallThemeBaseColor', baseColor);
                localStorage.setItem('overallThemeGradientColor', gradientColor);
                applyOverallTheme(baseColor, gradientColor);
                overallThemeSwatches.forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            });
        });
    }

    // Language toggle
    const langButtons = document.querySelectorAll('.language-toggle .toggle-btn');
    if (langButtons) {
        langButtons.forEach(button => {
            button.addEventListener('click', () => {
                const lang = button.id.split('-')[1];
                localStorage.setItem('language', lang);
                applyLanguage(lang);
                langButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            });
        });
    }

    // RAM slider
    const ramSlider = document.getElementById('ramRange');
    const ramValue = document.getElementById('ramValue');
    if (ramSlider) {
        ramSlider.addEventListener('input', () => {
            ramValue.textContent = ramSlider.value;
        });
    }

    // Logout button functionality
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // --- INITIAL LOAD ---
    loadSettings();
});