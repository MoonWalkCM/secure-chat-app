document.addEventListener('DOMContentLoaded', async () => {
    const translations = window.translations || {
        en: {
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
            passwordTooShort: "Password must be at least 12 characters",
            serverError: "Server error",
            invalidKey: "Invalid or used registration key"
        },
        ru: {
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
            passwordTooShort: "Пароль должен содержать не менее 12 символов",
            serverError: "Ошибка сервера",
            invalidKey: "Неверный или использованный ключ регистрации"
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

    const registerBtn = document.getElementById('register-btn');
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');

    // Генерация ключей при загрузке страницы
    let publicKey;
    try {
        const keyPair = await generateKeyPair();
        publicKey = await exportKey(keyPair.publicKey);
        localStorage.setItem('publicKey', publicKey);
        localStorage.setItem('privateKey', await exportKey(keyPair.privateKey));
    } catch (error) {
        console.error('Ошибка генерации ключей:', error);
        showNotification(translations[savedLang].serverError);
        return;
    }

    registerBtn.addEventListener('click', () => {
        const login = document.getElementById('login').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const key = document.getElementById('key').value.trim();
        const nickname = login;

        if (!login || !email || !password || !key) {
            showNotification(translations[savedLang].allFieldsRequired);
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showNotification(translations[savedLang].invalidEmail);
            return;
        }

        if (password.length < 12) {
            showNotification(translations[savedLang].passwordTooShort);
            return;
        }

        fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, email, password, key, nickname, publicKey })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error);
            } else {
                localStorage.setItem('jwtToken', data.token);
                localStorage.setItem('userData', JSON.stringify(data.user));
                showNotification(data.message || 'Регистрация выполнена успешно!', false);
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

    // Encryption utilities
    async function generateKeyPair() {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                hash: 'SHA-256'
            },
            true,
            ['encrypt', 'decrypt']
        );
        return keyPair;
    }

    async function exportKey(key) {
        const exported = await window.crypto.subtle.exportKey('jwk', key);
        return JSON.stringify(exported);
    }
});
