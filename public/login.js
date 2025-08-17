document.addEventListener('DOMContentLoaded', async () => {
    const translations = window.translations || {
        en: {
            loginTitle: "Login",
            loginPlaceholder: "Login",
            passwordPlaceholder: "Password",
            rememberMe: "Remember me",
            loginButton: "Login",
            registerLink: "Don't have an account? Register",
            hint1: "Use a strong password",
            hint2: "Include numbers and symbols",
            hint3: "Avoid common words",
            allFieldsRequired: "All fields are required",
            serverError: "Server error",
            accountBanned: "Your account is banned"
        },
        ru: {
            loginTitle: "Вход",
            loginPlaceholder: "Логин",
            passwordPlaceholder: "Пароль",
            rememberMe: "Запомнить меня",
            loginButton: "Войти",
            registerLink: "Нет аккаунта? Зарегистрироваться",
            hint1: "Используйте надежный пароль",
            hint2: "Включите цифры и символы",
            hint3: "Избегайте распространенных слов",
            allFieldsRequired: "Все поля обязательны",
            serverError: "Ошибка сервера",
            accountBanned: "Ваш аккаунт заблокирован"
        }
    };

    function applyLanguage(lang) {
        document.querySelectorAll('[data-lang-key]').forEach(elem => {
            const key = elem.getAttribute('data-lang-key');
            if (translations[lang] && translations[lang][key]) {
                elem.textContent = translations[lang][key];
            }
        });
        document.documentElement.lang = lang;
    }

    const savedLang = localStorage.getItem('language') || 'ru';
    applyLanguage(savedLang);

    const hints = document.querySelectorAll('.hint-item');
    let currentHint = 0;
    setInterval(() => {
        hints[currentHint].classList.remove('active');
        currentHint = (currentHint + 1) % hints.length;
        hints[currentHint].classList.add('active');
    }, 3000);

    const loginBtn = document.getElementById('login-btn');
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');

    loginBtn.addEventListener('click', async () => {
        const login = document.getElementById('login').value.trim();
        const password = document.getElementById('password').value;

        if (!login || !password) {
            showNotification(translations[savedLang].allFieldsRequired);
            return;
        }

        fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error === 'Ваш аккаунт заблокирован' ? translations[savedLang].accountBanned : data.error);
            } else {
                localStorage.setItem('jwtToken', data.token);
                localStorage.setItem('userData', JSON.stringify(data.user));
                showNotification(data.message || 'Вход выполнен успешно!', false);
                setTimeout(() => {
                    window.location.href = '/main';
                }, 1000);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification(translations[savedLang].serverError);
        });
    });

    function showNotification(message, isError = true) {
        notificationText.textContent = message;
        notification.style.background = isError ? 'rgba(255, 75, 75, 0.9)' : 'rgba(75, 255, 75, 0.9)';
        notification.style.display = 'block';
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.style.display = 'none';
            }, 300);
        }, 3000);
    }
});
