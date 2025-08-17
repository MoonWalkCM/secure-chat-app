document.addEventListener('DOMContentLoaded', () => {
    // Загрузка переводов
    const translations = {
        en: {
            profileTitle: "Your Profile",
            greeting: "How are you, {nickname}?",
            profileSubtitle: "Manage your nickname and password",
            loginTitle: "Login",
            loginSubtitle: "Your unique login identifier",
            nicknameTitle: "Nickname",
            nicknameSubtitle: "Choose a display name for your profile",
            passwordTitle: "Password",
            passwordSubtitle: "Update your account password",
            loginPlaceholder: "Login",
            nicknamePlaceholder: "Nickname",
            newPasswordPlaceholder: "New Password",
            updateButton: "Update Profile",
            logout: "Logout",
            serverError: "Server error",
            updateSuccess: "Profile updated successfully",
            noChanges: "No changes provided",
            passwordTooShort: "Password must be at least 12 characters long",
            unauthorizedAccess: "Unauthorized access",
            invalidActivationKey: "Invalid activation key",
            levelUpSuccess: "Level upgraded to 5 successfully",
            generateKeySuccess: "Registration key generated: ",
            updateUserPasswordSuccess: "User password updated successfully",
            targetLoginRequired: "Target login and new password are required",
            userNotFound: "User not found",
            settingsSaved: "Settings saved successfully",
            searchKeyTitle: "Search by Key",
            searchKeySubtitle: "Search for a user by their registration key",
            searchKeyPlaceholder: "Registration Key",
            searchKeyResult: "User found: Login: {login}, Email: {email}, Key: {key}",
            noUserFound: "No user found for this key",
            invalidKeyFormat: "Invalid key format",
            banUserTitle: "Ban User",
            banUserSubtitle: "Ban a user by their login",
            banUserPlaceholder: "User Login",
            banUserSuccess: "User banned successfully",
            loginRequired: "Login is required",
            showKeysTitle: "Registration Keys List",
            showKeysSubtitle: "View all registration keys",
            showKeysButton: "Show Keys",
            noKeysFound: "No registration keys found",
            keysListHeader: "Registration Keys"
        },
        ru: {
            profileTitle: "Ваш профиль",
            greeting: "Привет, {nickname}!",
            profileSubtitle: "Управляйте своим ником и паролем",
            loginTitle: "Логин",
            loginSubtitle: "Ваш уникальный идентификатор",
            nicknameTitle: "Ник",
            nicknameSubtitle: "Выберите отображаемое имя для профиля",
            passwordTitle: "Пароль",
            passwordSubtitle: "Обновите пароль вашей учетной записи",
            loginPlaceholder: "Логин",
            nicknamePlaceholder: "Ник",
            newPasswordPlaceholder: "Новый пароль",
            updateButton: "Обновить профиль",
            logout: "Выйти",
            serverError: "Ошибка сервера",
            updateSuccess: "Профиль успешно обновлен",
            noChanges: "Нет изменений для сохранения",
            passwordTooShort: "Пароль должен содержать минимум 12 символов",
            unauthorizedAccess: "Неавторизованный доступ",
            invalidActivationKey: "Неверный ключ активации",
            levelUpSuccess: "Уровень успешно повышен до 5",
            generateKeySuccess: "Ключ регистрации сгенерирован: ",
            updateUserPasswordSuccess: "Пароль пользователя успешно обновлен",
            targetLoginRequired: "Логин и новый пароль обязательны",
            userNotFound: "Пользователь не найден",
            settingsSaved: "Настройки успешно сохранены",
            searchKeyTitle: "Поиск по ключу",
            searchKeySubtitle: "Найти пользователя по ключу регистрации",
            searchKeyPlaceholder: "Ключ регистрации",
            searchKeyResult: "Пользователь найден: Логин: {login}, Email: {email}, Ключ: {key}",
            noUserFound: "Пользователь с таким ключом не найден",
            invalidKeyFormat: "Неверный формат ключа",
            banUserTitle: "Забанить пользователя",
            banUserSubtitle: "Забанить пользователя по логину",
            banUserPlaceholder: "Логин пользователя",
            banUserSuccess: "Пользователь успешно забанен",
            loginRequired: "Логин обязателен",
            showKeysTitle: "Список ключей регистрации",
            showKeysSubtitle: "Просмотреть все ключи регистрации",
            showKeysButton: "Показать ключи",
            noKeysFound: "Ключи регистрации не найдены",
            keysListHeader: "Ключи регистрации"
        }
    };

    // Применение языка
    let currentLang = localStorage.getItem('language') || 'ru';
    function applyLanguage(lang) {
        document.querySelectorAll('[data-lang-key]').forEach(elem => {
            const key = elem.getAttribute('data-lang-key');
            if (translations[lang] && translations[lang][key]) {
                elem.textContent = translations[lang][key];
            }
        });
        // Обновление приветствия
        const nicknameGreeting = document.getElementById('nickname-greeting');
        if (nicknameGreeting && currentUserNickname) {
            nicknameGreeting.textContent = translations[lang].greeting.replace('{nickname}', currentUserNickname);
        }
        document.documentElement.lang = lang;
        localStorage.setItem('language', lang);
        currentLang = lang;
        // Обновление активной кнопки языка
        document.querySelectorAll('.language-toggle .toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    }

    // Проверка токена
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        showNotification(translations[currentLang].unauthorizedAccess);
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        return;
    }

    // Инициализация переменных
    const loginInput = document.getElementById('login');
    const nicknameInput = document.getElementById('nickname');
    const passwordInput = document.getElementById('password');
    const activationKeyInput = document.getElementById('activation-key');
    const activateKeyBtn = document.getElementById('activate-key-btn');
    const generateKeyBtn = document.getElementById('generate-key-btn');
    const generatedKeyDisplay = document.getElementById('generated-key');
    const targetLoginInput = document.getElementById('target-login');
    const newUserPasswordInput = document.getElementById('new-user-password');
    const updateUserPasswordBtn = document.getElementById('update-user-password-btn');
    const updateBtn = document.getElementById('update-btn');
    const searchKeyInput = document.getElementById('search-key');
    const searchKeyBtn = document.getElementById('search-key-btn');
    const searchKeyResult = document.getElementById('search-key-result');
    const banLoginInput = document.getElementById('ban-login');
    const banUserBtn = document.getElementById('ban-user-btn');
    const showKeysBtn = document.getElementById('show-keys-btn');
    const keysList = document.getElementById('keys-list');
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');
    let currentUserNickname = null;
    let currentUserLevel = 0;

    // Загрузка данных профиля
    fetch('/profile', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(response.status === 401 ? translations[currentLang].unauthorizedAccess : translations[currentLang].serverError);
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            showNotification(data.error);
            if (data.error === 'Токен не предоставлен' || data.error === 'Неверный токен') {
                localStorage.removeItem('jwtToken');
                setTimeout(() => window.location.href = 'index.html', 2000);
            }
        } else {
            currentUserNickname = data.nickname || data.login;
            currentUserLevel = data.level || 0;
            loginInput.value = data.login;
            nicknameInput.value = currentUserNickname;
            applyLanguage(currentLang); // Обновляем приветствие
            loginInput.disabled = true; // Логин только для чтения
            // Показать админские секции для уровня 5
            if (currentUserLevel === 5) {
                document.querySelectorAll('.admin-section').forEach(section => {
                    section.style.display = 'block';
                });
            }
            // Применение сохраненных настроек
            applyThemeFromSettings(data.primary_color, data.theme);
            // Применение стилей для тем
            applyThemeSwatchStyles();
        }
    })
    .catch(error => {
        console.error('Ошибка получения профиля:', error.message);
        showNotification(error.message);
        if (error.message === translations[currentLang].unauthorizedAccess) {
            localStorage.removeItem('jwtToken');
            setTimeout(() => window.location.href = 'index.html', 2000);
        }
    });

    // Применение стилей для тем
    function applyThemeSwatchStyles() {
        const themeSwatches = document.querySelectorAll('.theme-swatch');
        themeSwatches.forEach(swatch => {
            const baseColor = swatch.dataset.base;
            const gradientColor = swatch.dataset.gradient;
            swatch.style.background = `linear-gradient(135deg, ${baseColor}, ${gradientColor})`;
        });
    }

    // Обработка активации ключа
    activateKeyBtn.addEventListener('click', () => {
        const key = activationKeyInput.value.trim();
        if (!key) {
            showNotification('Activation key is required');
            return;
        }
        fetch('/activate-key', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error);
            } else {
                showNotification(translations[currentLang].levelUpSuccess, false);
                currentUserLevel = 5;
                document.querySelectorAll('.admin-section').forEach(section => {
                    section.style.display = 'block';
                });
                activationKeyInput.value = '';
            }
        })
        .catch(error => {
            console.error('Ошибка активации ключа:', error);
            showNotification(translations[currentLang].serverError);
        });
    });

    // Обработка генерации ключа
    generateKeyBtn.addEventListener('click', () => {
        if (currentUserLevel !== 5) {
            showNotification('Level 5 required to generate keys');
            return;
        }
        fetch('/generate-key', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error);
            } else {
                generatedKeyDisplay.textContent = translations[currentLang].generateKeySuccess + data.key;
                generatedKeyDisplay.style.display = 'block';
                showNotification(translations[currentLang].generateKeySuccess + data.key, false);
            }
        })
        .catch(error => {
            console.error('Ошибка генерации ключа:', error);
            showNotification(translations[currentLang].serverError);
        });
    });

    // Обработка поиска по ключу
    searchKeyBtn.addEventListener('click', () => {
        if (currentUserLevel !== 5) {
            showNotification('Level 5 required to search by key');
            return;
        }
        const key = searchKeyInput.value.trim();
        if (!key) {
            showNotification('Registration key is required');
            return;
        }
        if (!key.match(/^MWX-LLC-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
            showNotification(translations[currentLang].invalidKeyFormat);
            return;
        }
        fetch('/search-key', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error);
                searchKeyResult.style.display = 'none';
            } else {
                searchKeyResult.textContent = translations[currentLang].searchKeyResult
                    .replace('{login}', data.login)
                    .replace('{email}', data.email)
                    .replace('{key}', data.key);
                searchKeyResult.style.display = 'block';
                showNotification(translations[currentLang].searchKeyResult
                    .replace('{login}', data.login)
                    .replace('{email}', data.email)
                    .replace('{key}', data.key), false);
                searchKeyInput.value = '';
            }
        })
        .catch(error => {
            console.error('Ошибка поиска по ключу:', error);
            showNotification(translations[currentLang].serverError);
        });
    });

    // Обработка бана пользователя
    banUserBtn.addEventListener('click', () => {
        if (currentUserLevel !== 5) {
            showNotification('Level 5 required to ban users');
            return;
        }
        const login = banLoginInput.value.trim();
        if (!login) {
            showNotification(translations[currentLang].loginRequired);
            return;
        }
        fetch('/ban-user', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ login })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error);
            } else {
                showNotification(translations[currentLang].banUserSuccess, false);
                banLoginInput.value = '';
            }
        })
        .catch(error => {
            console.error('Ошибка бана пользователя:', error);
            showNotification(translations[currentLang].serverError);
        });
    });

    // Обработка обновления пароля другого пользователя
    updateUserPasswordBtn.addEventListener('click', () => {
        if (currentUserLevel !== 5) {
            showNotification('Level 5 required to update user passwords');
            return;
        }
        const targetLogin = targetLoginInput.value.trim();
        const newPassword = newUserPasswordInput.value;
        if (!targetLogin || !newPassword) {
            showNotification(translations[currentLang].targetLoginRequired);
            return;
        }
        if (newPassword.length < 12) {
            showNotification(translations[currentLang].passwordTooShort);
            return;
        }
        fetch('/update-user-password', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetLogin, newPassword })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error);
            } else {
                showNotification(translations[currentLang].updateUserPasswordSuccess, false);
                targetLoginInput.value = '';
                newUserPasswordInput.value = '';
            }
        })
        .catch(error => {
            console.error('Ошибка обновления пароля пользователя:', error);
            showNotification(translations[currentLang].serverError);
        });
    });

    // Обработка отображения списка ключей
    showKeysBtn.addEventListener('click', () => {
        if (currentUserLevel !== 5) {
            showNotification('Level 5 required to view registration keys');
            return;
        }
        fetch('/list-keys', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error);
                keysList.style.display = 'none';
            } else {
                if (data.keys.length === 0) {
                    keysList.innerHTML = `<p>${translations[currentLang].noKeysFound}</p>`;
                } else {
                    keysList.innerHTML = `
                        <h4>${translations[currentLang].keysListHeader}</h4>
                        <ul class="keys-list">
                            ${data.keys.map(key => `
                                <li class="key-item">
                                    <span>Key: ${key.key}</span>
                                    <span>Created by: ${key.created_by}</span>
                                    <span>Created at: ${new Date(key.created_at).toLocaleString()}</span>
                                    <span>Used: ${key.used ? 'Yes' : 'No'}</span>
                                    <span>Used by: ${key.used_by || 'N/A'}</span>
                                </li>
                            `).join('')}
                        </ul>
                    `;
                }
                keysList.style.display = 'block';
                keysList.classList.add('show');
            }
        })
        .catch(error => {
            console.error('Ошибка получения списка ключей:', error);
            showNotification(translations[currentLang].serverError);
            keysList.style.display = 'none';
        });
    });

    // Обработка обновления профиля
    updateBtn.addEventListener('click', () => {
        const nickname = nicknameInput.value.trim();
        const password = passwordInput.value;
        const theme = localStorage.getItem('theme') || 'default';
        const primary_color = localStorage.getItem('themeColor') || '#82AAFF';

        // Валидация на стороне клиента
        if (!nickname && !password && theme === 'default' && primary_color === '#82AAFF') {
            showNotification(translations[currentLang].noChanges);
            return;
        }
        if (password && password.length < 12) {
            showNotification(translations[currentLang].passwordTooShort);
            return;
        }

        // Отправка запроса на обновление
        const updateData = { theme, primary_color };
        if (nickname) updateData.nickname = nickname;
        if (password) updateData.password = password;

        fetch('/profile', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error);
                if (data.error === 'Токен не предоставлен' || data.error === 'Неверный токен') {
                    localStorage.removeItem('jwtToken');
                    setTimeout(() => window.location.href = 'index.html', 2000);
                }
            } else {
                showNotification(translations[currentLang].updateSuccess, false);
                if (nickname) {
                    currentUserNickname = nickname;
                    nicknameInput.value = nickname;
                    applyLanguage(currentLang); // Обновляем приветствие
                }
                passwordInput.value = ''; // Очищаем поле пароля
            }
        })
        .catch(error => {
            console.error('Ошибка при обновлении профиля:', error);
            showNotification(translations[currentLang].serverError);
        });
    });

    // Кнопка выхода
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('publicKey');
            localStorage.removeItem('privateKey');
            window.location.href = 'index.html';
        });
    }

    // Обработка настроек страницы
    // Цвет интерфейса
    const colorSwatches = document.querySelectorAll('.color-palette .color-swatch:not(.theme-swatch)');
    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            const color = swatch.style.getPropertyValue('--swatch-color');
            document.documentElement.style.setProperty('--primary-color', color);
            localStorage.setItem('themeColor', color);
            showNotification(translations[currentLang].settingsSaved, false);
        });
    });

    // Темы
    const themeSwatches = document.querySelectorAll('.color-palette .theme-swatch');
    themeSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            const baseColor = swatch.dataset.base;
            const gradientColor = swatch.dataset.gradient;
            document.body.style.background = `linear-gradient(135deg, ${baseColor}, ${gradientColor})`;
            localStorage.setItem('overallThemeBaseColor', baseColor);
            localStorage.setItem('overallThemeGradientColor', gradientColor);
            localStorage.setItem('theme', `gradient-${baseColor}`);
            showNotification(translations[currentLang].settingsSaved, false);
        });
    });

    // Язык
    const languageButtons = document.querySelectorAll('.language-toggle .toggle-btn');
    languageButtons.forEach(button => {
        button.addEventListener('click', () => {
            const lang = button.dataset.lang;
            applyLanguage(lang);
            showNotification(translations[currentLang].settingsSaved, false);
        });
    });

    // Выделение RAM
    const ramSlider = document.querySelector('.ram-slider .slider');
    const ramValue = document.querySelector('.ram-slider .slider-value');
    if (ramSlider && ramValue) {
        ramSlider.addEventListener('input', () => {
            const value = ramSlider.value;
            ramValue.textContent = `${value} MB`;
            localStorage.setItem('ramAllocation', value);
            showNotification(translations[currentLang].settingsSaved, false);
        });
        // Установить начальное значение
        const savedRam = localStorage.getItem('ramAllocation') || '1024';
        ramSlider.value = savedRam;
        ramValue.textContent = `${savedRam} MB`;
    }

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

    // Применение темы
    function applyThemeFromSettings(primaryColor, theme) {
        const savedColor = primaryColor || localStorage.getItem('themeColor') || '#82aaff';
        document.documentElement.style.setProperty('--primary-color', savedColor);
        localStorage.setItem('themeColor', savedColor);
        const savedOverallThemeBase = localStorage.getItem('overallThemeBaseColor') || '#2a5298';
        const savedOverallThemeGradient = localStorage.getItem('overallThemeGradientColor') || '#1e3c72';
        if (theme && theme.startsWith('gradient-')) {
            document.body.style.background = `linear-gradient(135deg, ${savedOverallThemeBase}, ${savedOverallThemeGradient})`;
        } else {
            document.body.style.background = 'linear-gradient(135deg, #2a5298, #1e3c72)';
        }
        localStorage.setItem('theme', theme || 'default');
    }
});