document.addEventListener('DOMContentLoaded', async () => {
    // Проверка авторизации
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/';
        return;
    }

    // Функции шифрования на клиентской стороне
    async function generateKeyPair() {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true,
            ["encrypt", "decrypt"]
        );
        return keyPair;
    }

    async function exportPublicKey(publicKey) {
        const exported = await window.crypto.subtle.exportKey("spki", publicKey);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    }

    async function exportPrivateKey(privateKey) {
        const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    }

    async function importPublicKey(publicKeyString) {
        const binaryString = atob(publicKeyString);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return await window.crypto.subtle.importKey(
            "spki",
            bytes,
            {
                name: "RSA-OAEP",
                hash: "SHA-256",
            },
            true,
            ["encrypt"]
        );
    }

    async function importPrivateKey(privateKeyString) {
        const binaryString = atob(privateKeyString);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return await window.crypto.subtle.importKey(
            "pkcs8",
            bytes,
            {
                name: "RSA-OAEP",
                hash: "SHA-256",
            },
            true,
            ["decrypt"]
        );
    }

    async function encryptMessage(message, publicKey) {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const encrypted = await window.crypto.subtle.encrypt(
            {
                name: "RSA-OAEP"
            },
            publicKey,
            data
        );
        return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    }

    async function decryptMessage(encryptedMessage, privateKey) {
        const binaryString = atob(encryptedMessage);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: "RSA-OAEP"
            },
            privateKey,
            bytes
        );
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    async function decryptAESMessage(encryptedData, key, iv) {
        try {
            console.log('Начало расшифровки AES:', {
                encryptedDataLength: encryptedData?.length,
                keyLength: key?.length,
                ivLength: iv?.length
            });
            
            const binaryString = atob(encryptedData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const ivBytes = new Uint8Array(atob(iv).split('').map(char => char.charCodeAt(0)));
            const keyBytes = new Uint8Array(atob(key).split('').map(char => char.charCodeAt(0)));
            
            console.log('Байты подготовлены:', {
                dataBytes: bytes.length,
                ivBytes: ivBytes.length,
                keyBytes: keyBytes.length
            });
            
            const cryptoKey = await window.crypto.subtle.importKey(
                "raw",
                keyBytes,
                { name: "AES-CBC" },
                false,
                ["decrypt"]
            );
            
            const decrypted = await window.crypto.subtle.decrypt(
                {
                    name: "AES-CBC",
                    iv: ivBytes
                },
                cryptoKey,
                bytes
            );
            
            const decoder = new TextDecoder();
            const result = decoder.decode(decrypted);
            console.log('AES расшифровка завершена успешно');
            return result;
        } catch (error) {
            console.error('Ошибка в decryptAESMessage:', error);
            throw error;
        }
    }

    // Генерация ключей при первом входе
    async function ensureKeysExist() {
        const hasKeys = localStorage.getItem('hasEncryptionKeys');
        if (!hasKeys) {
            try {
                const keyPair = await generateKeyPair();
                const publicKeyString = await exportPublicKey(keyPair.publicKey);
                const privateKeyString = await exportPrivateKey(keyPair.privateKey);
                
                // Сохраняем приватный ключ локально
                localStorage.setItem('privateKey', privateKeyString);
                localStorage.setItem('hasEncryptionKeys', 'true');
                
                // Отправляем публичный ключ на сервер
                const response = await fetch('/generate-keys', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        publicKey: publicKeyString
                    })
                });
                
                if (response.ok) {
                    console.log('Ключи шифрования успешно созданы');
                }
            } catch (error) {
                console.error('Ошибка создания ключей шифрования:', error);
            }
        }
    }

    // Инициализация ключей
    await ensureKeysExist();
    
    // Проверяем наличие ключей
    const hasKeys = localStorage.getItem('hasEncryptionKeys');
    const privateKey = localStorage.getItem('privateKey');
    console.log('Статус ключей шифрования:', {
        hasKeys: !!hasKeys,
        hasPrivateKey: !!privateKey
    });

    // Загрузка переводов
    const translations = {
        en: {
            chatTitle: "Chats",
            chatSubtitle: "Connect with other users in real-time.",
            onlineUsers: "Online Users",
            contacts: "Contacts",
            searchPlaceholder: "Search user...",
            messagePlaceholder: "Type a message...",
            serverError: "Server error",
            connectionError: "Failed to connect to chat server",
            messageSent: "Message sent",
            userNotFound: "User not found",
            selectContact: "Select a contact to start chatting",
            audioRecording: "Recording...",
            audioError: "Audio recording not supported",
            emptyMessage: "Enter a message",
            typing: "is typing...",
            sending: "Sending...",
            delivered: "Delivered",
            menuHome: "Home",
            menuChats: "Chats",
            menuProfile: "Profile",
            menuLogout: "Logout",
            fileSending: "Sending file...",
            fileSent: "File sent",
            fileError: "Error sending file",
            fileTooLarge: "File too large",
            muteContact: "",
            unmuteContact: "",
            reportContact: "",
            deleteContact: "",
            contactMuted: "Contact muted",
            contactUnmuted: "Contact unmuted",
            contactReported: "Contact reported",
            contactDeleted: "Contact deleted"
        },
        ru: {
            chatTitle: "Чаты",
            chatSubtitle: "Общайтесь с другими пользователями в реальном времени.",
            onlineUsers: "Пользователи онлайн",
            contacts: "Контакты",
            searchPlaceholder: "Поиск пользователя...",
            messagePlaceholder: "Введите сообщение...",
            serverError: "Ошибка сервера",
            connectionError: "Не удалось подключиться к серверу чата",
            messageSent: "Сообщение отправлено",
            userNotFound: "Пользователь не найден",
            selectContact: "Выберите контакт для начала чата",
            audioRecording: "Запись...",
            audioError: "Запись аудио не поддерживается",
            emptyMessage: "Введите сообщение",
            typing: "печатает...",
            sending: "Отправка...",
            delivered: "Доставлено",
            menuHome: "Главная",
            menuChats: "Чаты",
            menuProfile: "Профиль",
            menuLogout: "Выйти",
            fileSending: "Отправка файла...",
            fileSent: "Файл отправлен",
            fileError: "Ошибка отправки файла",
            fileTooLarge: "Файл слишком большой",
            muteContact: "",
            unmuteContact: "",
            reportContact: "",
            deleteContact: "",
            contactMuted: "Контакт заглушен",
            contactUnmuted: "Контакт размучен",
            contactReported: "Жалоба отправлена",
            contactDeleted: "Контакт удален"
        }
    };

    const savedLang = localStorage.getItem('language') || 'ru';
    function applyLanguage(lang) {
        document.querySelectorAll('[data-lang-key]').forEach(elem => {
            const key = elem.getAttribute('data-lang-key');
            if (translations[lang] && translations[lang][key]) {
                elem.textContent = translations[lang][key];
            }
        });
        document.documentElement.lang = lang;
        document.getElementById('chat-recipient').textContent = translations[lang].selectContact;
    }
    applyLanguage(savedLang);

    // WebSocket соединение (отключено для Vercel serverless)
    let ws = null;
    let isConnected = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let messagePollingInterval = null;
    let pingInterval = null; // Добавляем pingInterval
    
    // Переменные для чата
    const currentLogin = JSON.parse(atob(token.split('.')[1])).login;
    let selectedContact = null;
    let unreadMessages = JSON.parse(localStorage.getItem('unreadMessages') || '{}');
    let displayedMessages = new Set();
    const sentSound = new Audio('https://freesound.org/data/previews/415/415764_5121236-lq.mp3');
    const receivedSound = new Audio('https://freesound.org/data/previews/320/320655_5260872-lq.mp3');

    // Функция для получения сообщений через polling (вместо WebSocket)
    function startMessagePolling() {
        if (messagePollingInterval) {
            clearInterval(messagePollingInterval);
        }
        
        messagePollingInterval = setInterval(async () => {
            try {
                const response = await fetch('/messages', {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.messages && data.messages.length > 0) {
                        // Обрабатываем новые сообщения
                        data.messages.forEach(message => {
                            if (!displayedMessages.has(message.id)) {
                                displayMessage(message);
                                displayedMessages.add(message.id);
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('Ошибка при получении сообщений:', error);
            }
        }, 3000); // Проверяем каждые 3 секунды
        
        // Добавляем ping для поддержания онлайн статуса
        pingInterval = setInterval(async () => {
            try {
                await fetch('/ping', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                    }
                });
            } catch (error) {
                console.error('Ошибка ping:', error);
            }
        }, 15000); // Ping каждые 15 секунд
    }

    function stopMessagePolling() {
        if (messagePollingInterval) {
            clearInterval(messagePollingInterval);
            messagePollingInterval = null;
        }
        if (pingInterval) { // Очищаем pingInterval
            clearInterval(pingInterval);
            pingInterval = null;
        }
    }

    // Функция подключения (упрощенная для serverless)
    function connectWebSocket() {
        console.log('Подключение к серверу...');
        isConnected = true;
        startMessagePolling();
        updateConnectionStatus();
    }

    // Функция отключения
    function disconnectWebSocket() {
        console.log('Отключение от сервера...');
        isConnected = false;
        stopMessagePolling();
        updateConnectionStatus();
    }

    // Обновление статуса подключения
    function updateConnectionStatus() {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = isConnected ? 'Подключено' : 'Отключено';
            statusElement.className = isConnected ? 'status-connected' : 'status-disconnected';
        }
    }

    // Функция отображения сообщения
    function displayMessage(data) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${data.from_login === currentLogin ? 'sent' : 'received'}`;
        messageDiv.setAttribute('data-message-id', data.id);
        
        const isFromMe = data.from_login === currentLogin;
        const senderName = isFromMe ? 'Вы' : (selectedContact?.nickname || data.from_login);
        
        let content = '';
        if (data.type === 'text') {
            content = `<div class="message-content">${escapeHtml(data.content)}</div>`;
        } else if (data.type === 'file') {
            content = `<div class="message-content file-message">
                <i class="fas fa-file"></i>
                <span>${data.filename || 'Файл'}</span>
                <button onclick="downloadFile('${data.content}', '${data.filename || 'file'}')">Скачать</button>
            </div>`;
        } else if (data.type === 'audio') {
            content = `<div class="message-content audio-message">
                <audio controls>
                    <source src="${data.content}" type="audio/webm">
                </audio>
            </div>`;
        }
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${senderName}</span>
                <span class="message-time">${new Date(data.timestamp).toLocaleTimeString()}</span>
            </div>
            ${content}
            <div class="message-status">
                ${isFromMe ? '<i class="fas fa-check"></i>' : ''}
            </div>
        `;
        
        messages.appendChild(messageDiv);
        messages.scrollTop = messages.scrollHeight;
        
        // Воспроизводим звук для входящих сообщений
        if (!isFromMe) {
            receivedSound.play().catch(e => console.error('Ошибка воспроизведения звука:', e));
        }
    }

    // Функция экранирования HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Функция скачивания файла
    function downloadFile(base64Data, filename) {
        const link = document.createElement('a');
        link.href = `data:application/octet-stream;base64,${base64Data}`;
        link.download = filename;
        link.click();
    }

    // Подключаемся к серверу
    connectWebSocket();

    const messages = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-message-btn');
    const recordButton = document.getElementById('record-audio-btn');
    const fileInput = document.getElementById('file-input');
    const fileUploadButton = document.getElementById('file-upload-btn');
    const contactsList = document.getElementById('contacts-list');
    const searchInput = document.getElementById('search-input');
    const chatRecipient = document.getElementById('chat-recipient');
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');
    const toggleContactsBtn = document.getElementById('toggle-contacts-btn');
    const reportModal = document.getElementById('report-modal');
    const reportReason = document.getElementById('report-reason');
    const submitReportBtn = document.getElementById('submit-report-btn');
    const contactsSection = document.querySelector('.contacts-section');
    const chatSection = document.querySelector('.chat-section');

    let mediaRecorder = null;
    let audioChunks = [];

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        recordButton.addEventListener('click', () => {
            if (!recordButton.classList.contains('recording')) {
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        mediaRecorder = new MediaRecorder(stream);
                        audioChunks = [];
                        mediaRecorder.start();
                        recordButton.classList.add('recording');
                        recordButton.innerHTML = '<i class="fas fa-stop"></i> ' + translations[savedLang].audioRecording;
                        console.log('Начата запись аудио');

                        mediaRecorder.ondataavailable = (e) => {
                            audioChunks.push(e.data);
                        };

                        mediaRecorder.onstop = () => {
                            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                            const reader = new FileReader();
                            reader.readAsDataURL(audioBlob);
                            reader.onloadend = async () => {
                                const base64Audio = reader.result;
                                if (selectedContact && ws.readyState === WebSocket.OPEN) {
                                    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                                    const message = {
                                        type: 'message',
                                        message_id: messageId,
                                        from_login: currentLogin,
                                        to_login: selectedContact.login,
                                        content: base64Audio,
                                        timestamp: new Date().toISOString(),
                                        is_audio: 1
                                    };
                                    const sendingMessage = document.createElement('div');
                                    sendingMessage.classList.add('message', 'sent', 'sending');
                                    sendingMessage.textContent = translations[savedLang].sending;
                                    messages.appendChild(sendingMessage);
                                    messages.scrollTop = messages.scrollHeight;
                                    ws.send(JSON.stringify(message));
                                    console.log('Отправлено голосовое сообщение:', message);
                                    sendingMessage.remove();
                                    sentSound.play().catch(e => {
                                        console.error('Ошибка воспроизведения звука отправки:', e);
                                    });
                                    showNotification(translations[savedLang].messageSent, false);
                                } else if (!selectedContact) {
                                    showNotification(translations[savedLang].selectContact);
                                } else {
                                    showNotification(translations[savedLang].connectionError);
                                }
                                stream.getTracks().forEach(track => track.stop());
                                recordButton.classList.remove('recording');
                                recordButton.innerHTML = '<i class="fas fa-microphone"></i>';
                            };
                        };
                    })
                    .catch(error => {
                        console.error('Ошибка записи аудио:', error);
                        showNotification(translations[savedLang].audioError);
                    });
            } else {
                mediaRecorder.stop();
                console.log('Запись аудио остановлена');
            }
        });
    } else {
        recordButton.style.display = 'none';
        console.warn('Запись аудио не поддерживается в этом браузере');
    }

    fileUploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (!selectedContact) {
            showNotification(translations[savedLang].selectContact);
            return;
        }
        if (ws.readyState !== WebSocket.OPEN) {
            showNotification(translations[savedLang].connectionError);
            return;
        }

        const maxSingleMessageSize = 5 * 1024 * 1024;
        const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const sendingMessage = document.createElement('div');
        sendingMessage.classList.add('message', 'sent', 'sending');
        sendingMessage.textContent = translations[savedLang].fileSending;
        messages.appendChild(sendingMessage);
        messages.scrollTop = messages.scrollHeight;

        if (file.size <= maxSingleMessageSize) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const fileData = reader.result;
                const message = {
                    type: 'file',
                    message_id: messageId,
                    from_login: currentLogin,
                    to_login: selectedContact.login,
                    file_name: file.name,
                    file_type: file.type,
                    file_size: file.size,
                    content: fileData,
                    timestamp: new Date().toISOString()
                };
                try {
                    ws.send(JSON.stringify(message));
                    console.log('Отправлен файл:', message);
                    sendingMessage.remove();
                    sentSound.play().catch(e => {
                        console.error('Ошибка воспроизведения звука отправки:', e);
                    });
                    showNotification(translations[savedLang].fileSent, false);
                    fileInput.value = '';
                } catch (error) {
                    console.error('Ошибка отправки файла:', error);
                    sendingMessage.remove();
                    showNotification(translations[savedLang].fileError);
                }
            };
            reader.onerror = () => {
                console.error('Ошибка чтения файла:', reader.error);
                sendingMessage.remove();
                showNotification(translations[savedLang].fileError);
            };
        } else {
            showNotification(translations[savedLang].fileTooLarge);
            sendingMessage.remove();
        }
    });

    messageInput.addEventListener('input', () => {
        if (selectedContact && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'typing',
                from_login: currentLogin,
                to_login: selectedContact.login
            }));
            console.log('Отправлено уведомление о наборе текста:', { from: currentLogin, to: selectedContact.login });
        }
    });

    sendButton.addEventListener('click', async () => {
        const content = messageInput.value.trim();
        if (!content) {
            showNotification(translations[savedLang].emptyMessage);
            return;
        }
        if (!selectedContact) {
            showNotification(translations[savedLang].selectContact);
            return;
        }
        if (ws.readyState !== WebSocket.OPEN) {
            showNotification(translations[savedLang].connectionError);
            return;
        }
        const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const sendingMessage = document.createElement('div');
        sendingMessage.classList.add('message', 'sent', 'sending');
        sendingMessage.textContent = translations[savedLang].sending;
        messages.appendChild(sendingMessage);
        messages.scrollTop = messages.scrollHeight;
        try {
            const message = {
                type: 'message',
                message_id: messageId,
                from_login: currentLogin,
                to_login: selectedContact.login,
                content: content,
                timestamp: new Date().toISOString(),
                is_audio: 0
            };
            ws.send(JSON.stringify(message));
            console.log('Отправлено текстовое сообщение:', message);
            messageInput.value = '';
            sendingMessage.remove();
            sentSound.play().catch(e => {
                console.error('Ошибка воспроизведения звука отправки:', e);
            });
            showNotification(translations[savedLang].messageSent, false);
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            sendingMessage.remove();
            showNotification(translations[savedLang].serverError);
        }
    });

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendButton.click();
        }
    });

    function formatDuration(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) {
            return '0:00';
        }
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }

    function createAudioPlayer(audioSrc) {
        if (!audioSrc.startsWith('data:audio/')) {
            audioSrc = `data:audio/webm;base64,${audioSrc}`;
        }
        const player = document.createElement('div');
        player.classList.add('audio-player');
        player.innerHTML = `
            <button class="play-pause-btn">
                <i class="fas fa-play"></i>
            </button>
            <div class="waveform">
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
            </div>
            <div class="progress-container">
                <div class="progress-bar"></div>
            </div>
            <span class="duration">0:00</span>
        `;
        const audio = new Audio(audioSrc);
        const playPauseBtn = player.querySelector('.play-pause-btn');
        const progressBar = player.querySelector('.progress-bar');
        const durationDisplay = player.querySelector('.duration');
        const waveformBars = player.querySelectorAll('.wave-bar');

        activeAudioPlayers.push({ audio, player, playPauseBtn, waveformBars });

        audio.addEventListener('loadedmetadata', () => {
            durationDisplay.textContent = formatDuration(audio.duration);
        });

        audio.addEventListener('error', () => {
            console.error('Ошибка загрузки аудио:', audio.error);
            durationDisplay.textContent = '0:00';
        });

        playPauseBtn.addEventListener('click', () => {
            activeAudioPlayers.forEach(otherPlayer => {
                if (otherPlayer.audio !== audio && !otherPlayer.audio.paused) {
                    otherPlayer.audio.pause();
                    otherPlayer.audio.currentTime = 0;
                    otherPlayer.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                    otherPlayer.player.classList.remove('playing');
                    otherPlayer.waveformBars.forEach(bar => {
                        bar.style.animation = 'none';
                    });
                    otherPlayer.player.querySelector('.progress-bar').style.width = '0%';
                    otherPlayer.player.querySelector('.duration').textContent = formatDuration(otherPlayer.audio.duration || 0);
                }
            });

            if (audio.paused) {
                audio.play().catch(e => {
                    console.error('Ошибка воспроизведения аудио:', e);
                    showNotification(translations[savedLang].audioError);
                });
                playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                player.classList.add('playing');
                waveformBars.forEach((bar, index) => {
                    bar.style.animation = `wave ${0.5 + index * 0.1}s ease-in-out infinite alternate`;
                });
            } else {
                audio.pause();
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                player.classList.remove('playing');
                waveformBars.forEach(bar => {
                    bar.style.animation = 'none';
                });
            }
        });

        audio.addEventListener('timeupdate', () => {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = `${isFinite(progress) ? progress : 0}%`;
            durationDisplay.textContent = formatDuration(audio.currentTime);
        });

        audio.addEventListener('ended', () => {
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            player.classList.remove('playing');
            progressBar.style.width = '0%';
            durationDisplay.textContent = formatDuration(audio.duration || 0);
            waveformBars.forEach(bar => {
                bar.style.animation = 'none';
            });
        });

        return player;
    }

    function showNotification(message, isError = true) {
        notificationText.textContent = message;
        notification.style.background = isError ? 'rgba(255, 75, 75, 0.9)' : 'rgba(75, 255, 75, 0.9)';
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 2600);
    }

    function showImageModal(src, alt) {
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.innerHTML = `
            <button class="close-btn" title="Закрыть">×</button>
            <img src="${src}" alt="${alt || ''}">
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-btn').onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', esc);
            }
        });
    }

    function showReportModal(login) {
        reportModal.style.display = 'flex';
        const reportNickname = document.getElementById('report-nickname');
        reportNickname.value = login; // Pre-fill the nickname
        reportReason.value = ''; // Clear the reason field
        submitReportBtn.onclick = () => {
            const nickname = reportNickname.value.trim();
            const reason = reportReason.value.trim();
            if (!nickname || !reason) {
                showNotification('Введите ник и причину жалобы', true);
                return;
            }
            fetch(`/report/${encodeURIComponent(nickname)}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showNotification(data.error);
                } else {
                    showNotification(translations[savedLang].contactReported, false);
                    reportModal.style.display = 'none';
                }
            })
            .catch(error => {
                console.error('Ошибка отправки жалобы:', error);
                showNotification(translations[savedLang].serverError);
            });
        };
        reportModal.querySelector('.close-btn').onclick = () => {
            reportModal.style.display = 'none';
        };
        reportModal.onclick = (e) => {
            if (e.target === reportModal) {
                reportModal.style.display = 'none';
            }
        };
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') {
                reportModal.style.display = 'none';
                document.removeEventListener('keydown', esc);
            }
        });
    }

    function displayFileMessage(msg) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', msg.from_login === currentLogin ? 'sent' : 'received');
        messageElement.dataset.messageId = msg.message_id;

        const contentElement = document.createElement('div');
        contentElement.classList.add('message-content', 'file-message');

        const isImage = msg.file_type && msg.file_type.startsWith('image/');
        let imgSrc = null;
        if (isImage) {
            if (msg.content.startsWith('data:image/')) {
                imgSrc = msg.content;
            } else if (/^[A-Za-z0-9+/=]+$/.test(msg.content)) {
                imgSrc = `data:${msg.file_type || 'image/jpeg'};base64,${msg.content}`;
            }
        }
        if (imgSrc) {
            const img = document.createElement('img');
            img.src = imgSrc;
            img.alt = msg.file_name;
            img.style.cursor = 'zoom-in';
            img.onclick = () => showImageModal(imgSrc, msg.file_name);
            contentElement.appendChild(img);
        } else if (msg.content.startsWith('data:')) {
            const fileLink = document.createElement('a');
            fileLink.href = msg.content;
            fileLink.download = msg.file_name;
            fileLink.classList.add('file-link');
            fileLink.innerHTML = `
                <i class="fas fa-file"></i>
                <span>${msg.file_name}</span>
                <span class="file-size">(${(msg.file_size / 1024 / 1024).toFixed(2)} MB)</span>
            `;
            contentElement.appendChild(fileLink);
        } else if (/^[A-Za-z0-9+/=]+$/.test(msg.content) && msg.file_type) {
            const fileLink = document.createElement('a');
            fileLink.href = `data:${msg.file_type};base64,${msg.content}`;
            fileLink.download = msg.file_name;
            fileLink.classList.add('file-link');
            fileLink.innerHTML = `
                <i class="fas fa-file"></i>
                <span>${msg.file_name}</span>
                <span class="file-size">(${(msg.file_size / 1024 / 1024).toFixed(2)} MB)</span>
            `;
            contentElement.appendChild(fileLink);
        } else {
            const fileLink = document.createElement('a');
            fileLink.href = '#';
            fileLink.download = msg.file_name;
            fileLink.classList.add('file-link');
            fileLink.innerHTML = `
                <i class="fas fa-file"></i>
                <span>${msg.file_name}</span>
                <span class="file-size">(${(msg.file_size / 1024 / 1024).toFixed(2)} MB)</span>
            `;
            fileLink.addEventListener('click', (e) => {
                e.preventDefault();
                showNotification('Файл недоступен для просмотра', true);
            });
            contentElement.appendChild(fileLink);
        }

        messageElement.appendChild(document.createElement('div')).classList.add('sender');
        messageElement.querySelector('.sender').textContent = msg.nickname || msg.from_login;
        messageElement.appendChild(contentElement);
        messageElement.appendChild(document.createElement('div')).classList.add('timestamp');
        messageElement.querySelector('.timestamp').textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (msg.from_login === currentLogin) {
            const status = document.createElement('div');
            status.classList.add('message-status');
            status.innerHTML = msg.is_read ? '<i class="fas fa-check-double read"></i>' : msg.delivered ? '<i class="fas fa-check-double"></i>' : '<i class="fas fa-check"></i>';
            messageElement.appendChild(status);
        }

        if (
            (msg.from_login === currentLogin && msg.to_login === selectedContact?.login) ||
            (msg.from_login === selectedContact?.login && msg.to_login === currentLogin)
        ) {
            messages.appendChild(messageElement);
            messages.scrollTop = messages.scrollHeight;
            if (msg.from_login !== currentLogin && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'read', message_id: msg.message_id, from_login: currentLogin }));
                console.log(`Отправлено уведомление о прочтении для сообщения ${msg.message_id}`);
            }
        } else {
            const contactLogin = msg.from_login === currentLogin ? msg.to_login : msg.from_login;
            unreadMessages[contactLogin] = (unreadMessages[contactLogin] || 0) + 1;
            localStorage.setItem('unreadMessages', JSON.stringify(unreadMessages));
            updateContactNotifications(contactLogin);
        }
    }

    async function displayMessage(msg) {
        if (msg.type === 'file' || msg.is_audio) {
            if (msg.is_audio) {
                const messageElement = document.createElement('div');
                messageElement.classList.add('message', msg.from_login === currentLogin ? 'sent' : 'received');
                messageElement.dataset.messageId = msg.message_id;
                const content = createAudioPlayer(msg.content);
                messageElement.appendChild(document.createElement('div')).classList.add('sender');
                messageElement.querySelector('.sender').textContent = msg.nickname || msg.from_login;
                messageElement.appendChild(content);
                messageElement.appendChild(document.createElement('div')).classList.add('timestamp');
                messageElement.querySelector('.timestamp').textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                if (msg.from_login === currentLogin) {
                    const status = document.createElement('div');
                    status.classList.add('message-status');
                    status.innerHTML = msg.is_read ? '<i class="fas fa-check-double read"></i>' : msg.delivered ? '<i class="fas fa-check-double"></i>' : '<i class="fas fa-check"></i>';
                    messageElement.appendChild(status);
                }
                if (
                    (msg.from_login === currentLogin && msg.to_login === selectedContact?.login) ||
                    (msg.from_login === selectedContact?.login && msg.to_login === currentLogin)
                ) {
                    messages.appendChild(messageElement);
                    messages.scrollTop = messages.scrollHeight;
                    if (msg.from_login !== currentLogin && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'read', message_id: msg.message_id, from_login: currentLogin }));
                        console.log(`Отправлено уведомление о прочтении для сообщения ${msg.message_id}`);
                    }
                } else {
                    const contactLogin = msg.from_login === currentLogin ? msg.to_login : msg.from_login;
                    unreadMessages[contactLogin] = (unreadMessages[contactLogin] || 0) + 1;
                    localStorage.setItem('unreadMessages', JSON.stringify(unreadMessages));
                    updateContactNotifications(contactLogin);
                }
            } else {
                displayFileMessage(msg);
            }
            return;
        }

        const messageElement = document.createElement('div');
        messageElement.classList.add('message', msg.from_login === currentLogin ? 'sent' : 'received');
        messageElement.dataset.messageId = msg.message_id;
        const content = document.createElement('div');
        content.classList.add('message-content');
        content.textContent = msg.content;
        messageElement.appendChild(document.createElement('div')).classList.add('sender');
        messageElement.querySelector('.sender').textContent = msg.nickname || msg.from_login;
        messageElement.appendChild(content);
        messageElement.appendChild(document.createElement('div')).classList.add('timestamp');
        messageElement.querySelector('.timestamp').textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (msg.from_login === currentLogin) {
            const status = document.createElement('div');
            status.classList.add('message-status');
            status.innerHTML = msg.is_read ? '<i class="fas fa-check-double read"></i>' : msg.delivered ? '<i class="fas fa-check-double"></i>' : '<i class="fas fa-check"></i>';
            messageElement.appendChild(status);
        }
        if (
            (msg.from_login === currentLogin && msg.to_login === selectedContact?.login) ||
            (msg.from_login === selectedContact?.login && msg.to_login === currentLogin)
        ) {
            messages.appendChild(messageElement);
            messages.scrollTop = messages.scrollHeight;
            if (msg.from_login !== currentLogin && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'read', message_id: msg.message_id, from_login: currentLogin }));
                console.log(`Отправлено уведомление о прочтении для сообщения ${msg.message_id}`);
            }
        } else {
            const contactLogin = msg.from_login === currentLogin ? msg.to_login : msg.from_login;
            unreadMessages[contactLogin] = (unreadMessages[contactLogin] || 0) + 1;
            localStorage.setItem('unreadMessages', JSON.stringify(unreadMessages));
            updateContactNotifications(contactLogin);
        }
    }

    function updateContactsOnlineStatus(onlineUsers) {
        const contactItems = document.querySelectorAll('.contact-item');
        contactItems.forEach(item => {
            const login = item.dataset.login;
            const isOnline = onlineUsers.some(user => user.login === login);
            const avatarElement = item.querySelector('.contact-avatar');
            if (avatarElement) {
                avatarElement.className = `contact-avatar ${isOnline ? 'online' : 'offline'}`;
            }
        });
    }

    function getAvatarColor(str) {
        const colors = ['#25d366', '#128c7e', '#075e54', '#34b7f1', '#f7b731', '#f47b7b', '#a259c4', '#f4845f'];
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    }

    function getAvatarInitials(name) {
        if (!name) return '?';
        const parts = name.split(' ');
        if (parts.length === 1) return name[0].toUpperCase();
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    function addContact(user) {
        const existingContact = Array.from(contactsList.children).some(
            contact => contact.dataset.login === user.login
        );
        if (!existingContact && user.login !== currentLogin) {
            const contactItem = document.createElement('div');
            contactItem.classList.add('contact-item');
            contactItem.dataset.login = user.login;

            const avatar = document.createElement('div');
            avatar.className = 'contact-avatar offline';
            avatar.style.background = getAvatarColor(user.nickname || user.login);
            avatar.textContent = getAvatarInitials(user.nickname || user.login);
            contactItem.appendChild(avatar);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'contact-name';
            nameSpan.textContent = user.nickname || user.login;
            contactItem.appendChild(nameSpan);

            const muteIcon = document.createElement('span');
            muteIcon.className = 'mute-icon';
            muteIcon.innerHTML = '<i class="fas fa-volume-mute"></i>';
            const mutedContacts = JSON.parse(localStorage.getItem('mutedContacts') || '[]');
            muteIcon.style.display = mutedContacts.includes(user.login) ? 'inline-block' : 'none';
            contactItem.appendChild(muteIcon);

            const menuButton = document.createElement('button');
            menuButton.className = 'menu-button';
            menuButton.innerHTML = '<i class="fas fa-cog"></i>';
            contactItem.appendChild(menuButton);

            const menu = document.createElement('div');
            menu.className = 'contact-menu';
            const isMuted = mutedContacts.includes(user.login);
            menu.innerHTML = `
                <div class="contact-menu-item" data-action="mute">
                    <i class="fas ${isMuted ? 'fa-volume-up' : 'fa-volume-mute'}"></i>
                    ${translations[savedLang][isMuted ? 'unmuteContact' : 'muteContact']}
                </div>
                <div class="contact-menu-item" data-action="report">
                    <i class="fas fa-exclamation-triangle"></i>
                    ${translations[savedLang].reportContact}
                </div>
                <div class="contact-menu-item" data-action="delete">
                    <i class="fas fa-trash"></i>
                    ${translations[savedLang].deleteContact}
                </div>
            `;
            contactItem.appendChild(menu);

            const badge = document.createElement('span');
            badge.className = 'notification-badge';
            contactItem.appendChild(badge);

            contactItem.addEventListener('click', (e) => {
                if (!e.target.closest('.menu-button') && !e.target.closest('.contact-menu')) {
                    selectContact(user, contactItem);
                    // Скрываем контакты и показываем чат на мобильных устройствах
                    if (window.innerWidth <= 768) {
                        contactsSection.classList.add('hidden-mobile');
                        contactsSection.style.display = 'none';
                        chatSection.style.display = 'block';
                    }
                }
            });

            menuButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = menu.classList.contains('show');
                document.querySelectorAll('.contact-menu.show').forEach(m => m.classList.remove('show'));
                if (!isOpen) {
                    menu.classList.add('show');
                }
            });

            menuButton.addEventListener('mouseenter', () => {
                menu.classList.add('show');
            });

            menuButton.addEventListener('mouseleave', (e) => {
                if (!menu.contains(e.relatedTarget)) {
                    menu.classList.remove('show');
                }
            });

            menu.addEventListener('mouseenter', () => {
                menu.classList.add('show');
            });

            menu.addEventListener('mouseleave', (e) => {
                if (!menuButton.contains(e.relatedTarget)) {
                    menu.classList.remove('show');
                }
            });

            menu.querySelectorAll('.contact-menu-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = item.dataset.action;
                    handleContactAction(action, user.login, contactItem);
                    menu.classList.remove('show');
                });
            });

            document.addEventListener('click', (e) => {
                if (!contactItem.contains(e.target)) {
                    menu.classList.remove('show');
                }
            });

            contactsList.appendChild(contactItem);
            saveContact(user);
            updateContactNotifications(user.login);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'login', token }));
            }
        }
    }

    function handleContactAction(action, login, contactElement) {
        const mutedContacts = JSON.parse(localStorage.getItem('mutedContacts') || '[]');
        if (action === 'mute') {
            const isMuted = mutedContacts.includes(login);
            if (isMuted) {
                const index = mutedContacts.indexOf(login);
                mutedContacts.splice(index, 1);
                localStorage.setItem('mutedContacts', JSON.stringify(mutedContacts));
                const muteIcon = contactElement.querySelector('.mute-icon');
                if (muteIcon) muteIcon.style.display = 'none';
                const menuItem = contactElement.querySelector('.contact-menu-item[data-action="mute"]');
                if (menuItem) {
                    menuItem.innerHTML = `<i class="fas fa-volume-mute"></i> ${translations[savedLang].muteContact}`;
                }
                showNotification(translations[savedLang].contactUnmuted, false);
            } else {
                mutedContacts.push(login);
                localStorage.setItem('mutedContacts', JSON.stringify(mutedContacts));
                const muteIcon = contactElement.querySelector('.mute-icon');
                if (muteIcon) muteIcon.style.display = 'inline-block';
                const menuItem = contactElement.querySelector('.contact-menu-item[data-action="mute"]');
                if (menuItem) {
                    menuItem.innerHTML = `<i class="fas fa-volume-up"></i> ${translations[savedLang].unmuteContact}`;
                }
                showNotification(translations[savedLang].contactMuted, false);
            }
        } else if (action === 'report') {
            showReportModal(login);
        } else if (action === 'delete') {
            const contacts = JSON.parse(localStorage.getItem('contacts') || '[]');
            const updatedContacts = contacts.filter(c => c.login !== login);
            localStorage.setItem('contacts', JSON.stringify(updatedContacts));
            delete unreadMessages[login];
            localStorage.setItem('unreadMessages', JSON.stringify(unreadMessages));
            contactElement.remove();
            if (selectedContact?.login === login) {
                selectedContact = null;
                chatRecipient.textContent = translations[savedLang].selectContact;
                messages.innerHTML = '';
                // Показываем контакты на мобильных устройствах после удаления
                if (window.innerWidth <= 768) {
                    contactsSection.classList.remove('hidden-mobile');
                    contactsSection.style.display = 'block';
                    chatSection.style.display = 'none';
                }
            }
            fetch(`/contacts/${encodeURIComponent(login)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showNotification(data.error);
                } else {
                    showNotification(translations[savedLang].contactDeleted, false);
                }
            })
            .catch(error => {
                console.error('Ошибка удаления контакта:', error);
                showNotification(translations[savedLang].serverError, true);
            });
        }
    }

    function selectContact(user, contactElement) {
        selectedContact = user;
        chatRecipient.textContent = user.nickname || user.login;
        messages.innerHTML = '';
        unreadMessages[user.login] = 0;
        localStorage.setItem('unreadMessages', JSON.stringify(unreadMessages));
        updateContactNotifications(user.login);
        console.log('Загрузка сообщений для:', user.login);
        fetch(`/messages?to=${encodeURIComponent(user.login)}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showNotification(data.error);
                } else {
                    for (const msg of data.messages) {
                        displayMessage(msg);
                        if (msg.from_login !== currentLogin && !msg.is_read && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'read', message_id: msg.message_id, from_login: currentLogin }));
                            console.log(`Отправлено уведомление о прочтении для сообщения ${msg.message_id}`);
                        }
                    }
                }
            })
            .catch(error => {
                console.error('Ошибка загрузки сообщений:', error);
                showNotification(translations[savedLang].serverError);
            });
        document.querySelectorAll('.contact-item').forEach(item => item.classList.remove('active'));
        contactElement.classList.add('active');
    }

    function updateContactNotifications(login) {
        const contactItem = document.querySelector(`.contact-item[data-login="${login}"]`);
        if (contactItem) {
            const badge = contactItem.querySelector('.notification-badge');
            const count = unreadMessages[login] || 0;
            badge.textContent = count > 0 ? count : '';
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
    }

    function saveContact(user) {
        const contacts = JSON.parse(localStorage.getItem('contacts') || '[]');
        if (!contacts.some(c => c.login === user.login)) {
            contacts.push({ login: user.login, nickname: user.nickname || user.login });
            localStorage.setItem('contacts', JSON.stringify(contacts));
        }
    }

    // Обработчик для кнопки "Контакты" на мобильных устройствах
    toggleContactsBtn.addEventListener('click', () => {
        if (contactsSection.classList.contains('hidden-mobile')) {
            // Показываем контакты, скрываем чат
            contactsSection.classList.remove('hidden-mobile');
            contactsSection.style.display = 'block';
            chatSection.style.display = 'none';
        } else {
            // Показываем чат, скрываем контакты (если контакт выбран)
            if (selectedContact) {
                contactsSection.classList.add('hidden-mobile');
                contactsSection.style.display = 'none';
                chatSection.style.display = 'block';
            } else {
                showNotification(translations[savedLang].selectContact);
            }
        }
    });

    function loadContacts() {
        const contacts = JSON.parse(localStorage.getItem('contacts') || '[]');
        contacts.forEach(user => addContact(user));
        // На мобильных устройствах изначально показываем контакты
        if (window.innerWidth <= 768) {
            contactsSection.classList.remove('hidden-mobile');
            contactsSection.style.display = 'block';
            chatSection.style.display = 'none';
        }
    }

    loadContacts();

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        if (query) {
            fetch(`/search-user?nickname=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showNotification(data.error);
                } else {
                    data.forEach(user => addContact(user));
                }
            })
            .catch(error => {
                console.error('Ошибка поиска пользователя:', error);
                showNotification(translations[savedLang].serverError);
            });
        }
    });

    function applyThemeFromSettings() {
        const savedColor = localStorage.getItem('themeColor') || '#25d366';
        document.documentElement.style.setProperty('--primary-color', savedColor);
        const rgb = savedColor.match(/\d+/g);
        if (rgb) {
            document.documentElement.style.setProperty('--primary-color-rgb', rgb.join(','));
        }
        const savedOverallThemeBase = localStorage.getItem('overallThemeBaseColor');
        const savedOverallThemeGradient = localStorage.getItem('overallThemeGradientColor');
        if (savedOverallThemeBase && savedOverallThemeGradient) {
            document.body.style.background = `linear-gradient(135deg, ${savedOverallThemeBase}, ${savedOverallThemeGradient})`;
        } else {
            document.body.style.background = 'linear-gradient(135deg, #2a5298, #1e3c72)';
        }
    }
    applyThemeFromSettings();

    // Обработка изменения размера окна для корректного отображения на мобильных устройствах
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            // На десктопе показываем обе секции
            contactsSection.classList.remove('hidden-mobile');
            contactsSection.style.display = 'block';
            chatSection.style.display = 'block';
        } else {
            // На мобильных устройствах показываем либо контакты, либо чат
            if (selectedContact) {
                contactsSection.classList.add('hidden-mobile');
                contactsSection.style.display = 'none';
                chatSection.style.display = 'block';
            } else {
                contactsSection.classList.remove('hidden-mobile');
                contactsSection.style.display = 'block';
                chatSection.style.display = 'none';
            }
        }
    });
});
