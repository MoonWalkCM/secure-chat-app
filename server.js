const express = require('express');
const { createServer } = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Функции шифрования
function generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });
    return { publicKey, privateKey };
}

function encryptMessage(message, publicKey) {
    const buffer = Buffer.from(message, 'utf8');
    const encrypted = crypto.publicEncrypt(publicKey, buffer);
    return encrypted.toString('base64');
}

function decryptMessage(encryptedMessage, privateKey) {
    const buffer = Buffer.from(encryptedMessage, 'base64');
    const decrypted = crypto.privateDecrypt(privateKey, buffer);
    return decrypted.toString('utf8');
}

function generateAESKey() {
    return crypto.randomBytes(32).toString('base64');
}

function encryptWithAES(data, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'base64'), iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return {
        encrypted,
        iv: iv.toString('base64')
    };
}

function decryptWithAES(encryptedData, key, iv) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'base64'), Buffer.from(iv, 'base64'));
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

const app = express();
const server = createServer(app);
const port = 3000;

// Путь к папке с Start.bat
const batDir = 'C:\\Augustusb4.20.3';
const batFilePath = path.join(batDir, 'Start.bat');

// Секреты
const LEVEL_UP_KEY = 'MWX-SECRET-FKSL-94KF';
const JWT_SECRET = process.env.JWT_SECRET || 'mwlauncher-secret-key-2024-fixed';

// Middleware для обработки JSON и файлов
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Инициализация базы данных SQLite
const db = new sqlite3.Database('users.db', (err) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err.message);
        return;
    }
    console.log('Подключено к базе данных SQLite.');

    // Создание таблицы users
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            login TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            registration_key TEXT NOT NULL,
            nickname TEXT,
            theme TEXT DEFAULT 'default',
            primary_color TEXT DEFAULT '#82AAFF',
            level INTEGER DEFAULT 0,
            is_banned INTEGER DEFAULT 0,
            public_key TEXT,
            private_key TEXT
        )
    `, (err) => {
        if (err) {
            console.error('Ошибка создания таблицы users:', err.message);
            return;
        }
        // Проверка и добавление столбцов в таблицу users
        db.all("PRAGMA table_info(users)", (err, rows) => {
            if (err) {
                console.error('Ошибка проверки таблицы users:', err.message);
                return;
            }
            const hasNickname = rows.some(row => row.name === 'nickname');
            const hasTheme = rows.some(row => row.name === 'theme');
            const hasColor = rows.some(row => row.name === 'primary_color');
            const hasLevel = rows.some(row => row.name === 'level');
            const hasBanned = rows.some(row => row.name === 'is_banned');
            const hasPublicKey = rows.some(row => row.name === 'public_key');
            const hasPrivateKey = rows.some(row => row.name === 'private_key');

            if (!hasNickname) {
                db.run("ALTER TABLE users ADD COLUMN nickname TEXT", (err) => {
                    if (err) console.error('Ошибка добавления столбца nickname:', err.message);
                    else db.run("UPDATE users SET nickname = login WHERE nickname IS NULL");
                });
            }
            if (!hasTheme) {
                db.run("ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'default'");
            }
            if (!hasColor) {
                db.run("ALTER TABLE users ADD COLUMN primary_color TEXT DEFAULT '#82AAFF'");
            }
            if (!hasLevel) {
                db.run("ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 0");
            }
            if (!hasBanned) {
                db.run("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0");
            }
            if (!hasPublicKey) {
                db.run("ALTER TABLE users ADD COLUMN public_key TEXT");
            }
            if (!hasPrivateKey) {
                db.run("ALTER TABLE users ADD COLUMN private_key TEXT");
            }
        });
    });

    // Создание таблицы messages
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT UNIQUE NOT NULL,
            from_login TEXT NOT NULL,
            to_login TEXT NOT NULL,
            content TEXT NOT NULL,
            encrypted_content TEXT,
            encryption_key TEXT,
            encryption_iv TEXT,
            timestamp TEXT NOT NULL,
            is_audio INTEGER DEFAULT 0,
            is_read INTEGER DEFAULT 0,
            file_name TEXT,
            file_type TEXT,
            file_size INTEGER
        )
    `, (err) => {
        if (err) {
            console.error('Ошибка создания таблицы messages:', err.message);
            return;
        }
        // Проверка и добавление столбцов шифрования в таблицу messages
        db.all("PRAGMA table_info(messages)", (err, rows) => {
            if (err) {
                console.error('Ошибка проверки таблицы messages:', err.message);
                return;
            }
            const hasEncryptedContent = rows.some(row => row.name === 'encrypted_content');
            const hasEncryptionKey = rows.some(row => row.name === 'encryption_key');
            const hasEncryptionIv = rows.some(row => row.name === 'encryption_iv');

            if (!hasEncryptedContent) {
                db.run("ALTER TABLE messages ADD COLUMN encrypted_content TEXT", (err) => {
                    if (err) console.error('Ошибка добавления столбца encrypted_content:', err.message);
                });
            }
            if (!hasEncryptionKey) {
                db.run("ALTER TABLE messages ADD COLUMN encryption_key TEXT", (err) => {
                    if (err) console.error('Ошибка добавления столбца encryption_key:', err.message);
                });
            }
            if (!hasEncryptionIv) {
                db.run("ALTER TABLE messages ADD COLUMN encryption_iv TEXT", (err) => {
                    if (err) console.error('Ошибка добавления столбца encryption_iv:', err.message);
                });
            }
        });
    });

    // Создание таблицы contacts
    db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
            user_login TEXT NOT NULL,
            contact_login TEXT NOT NULL,
            last_message_timestamp TEXT,
            PRIMARY KEY (user_login, contact_login)
        )
    `);

    // Создание таблицы active_connections
    db.run(`
        CREATE TABLE IF NOT EXISTS active_connections (
            user_login TEXT NOT NULL,
            connection_type TEXT NOT NULL,
            connection_id TEXT NOT NULL,
            last_activity TEXT,
            PRIMARY KEY (user_login, connection_type, connection_id)
        )
    `);

    // Создание таблицы registration_keys
    db.run(`
        CREATE TABLE IF NOT EXISTS registration_keys (
            key TEXT PRIMARY KEY,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            used_by TEXT,
            FOREIGN KEY (created_by) REFERENCES users(login)
        )
    `);
});

// WebSocket сервер
const clients = new Map();

const wss = new WebSocket.Server({ server });
wss.on('connection', (ws, req) => {
    console.log('Новый WebSocket-клиент подключен');
    ws.on('message', async (message) => {
        let data;
        try {
            data = JSON.parse(message);
            console.log('Получено WebSocket-сообщение:', data);
        } catch (e) {
            console.error('Некорректное WebSocket-сообщение:', message.toString());
            return;
        }

        if (data.type === 'login') {
            try {
                const decoded = jwt.verify(data.token, JWT_SECRET);
                const login = decoded.login;
                db.get('SELECT nickname, theme, primary_color, level, is_banned FROM users WHERE login = ?', [login], (err, row) => {
                    if (err) {
                        console.error('Ошибка получения данных пользователя:', err.message);
                        ws.send(JSON.stringify({ type: 'error', message: 'Ошибка сервера' }));
                        return;
                    }
                    if (!row) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Пользователь не найден' }));
                        return;
                    }
                    if (row.is_banned) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Ваш аккаунт заблокирован' }));
                        return;
                    }
                    clients.set(ws, { login, nickname: row.nickname || login, theme: row.theme || 'default', primary_color: row.primary_color || '#82AAFF', level: row.level || 0 });
                    
                    // Добавляем запись о подключении
                    const connectionId = Math.random().toString(36).substr(2, 9);
                    db.run('INSERT OR REPLACE INTO active_connections (user_login, connection_type, connection_id, last_activity) VALUES (?, ?, ?, ?)',
                        [login, 'chat', connectionId, new Date().toISOString()]);
                    
                    broadcastUsers();
                    db.all('SELECT contact_login FROM contacts WHERE user_login = ?', [login], (err, rows) => {
                        if (!err) {
                            const contacts = rows.map(row => row.contact_login);
                            ws.send(JSON.stringify({ type: 'contacts', contacts }));
                        }
                    });
                });
            } catch (error) {
                console.error('Ошибка верификации JWT:', error.message);
                ws.send(JSON.stringify({ type: 'error', message: 'Неверный токен' }));
            }
        } else if (data.type === 'message' || data.type === 'file') {
            const clientData = clients.get(ws);
            if (!clientData) {
                ws.send(JSON.stringify({ type: 'error', message: 'Не авторизован' }));
                return;
            }
            const isAudio = data.is_audio || 0;
            const messageId = data.message_id || Date.now().toString() + Math.random().toString(36).substr(2, 9);
            console.log('Сохранение сообщения:', { messageId, from: clientData.login, to: data.to_login, isAudio });

            // Нормализация содержимого для голосовых сообщений и файлов
            let content = data.content;
            if (isAudio && !content.startsWith('data:audio/')) {
                content = `data:audio/webm;base64,${content}`;
            } else if (data.file_name && data.file_type && content && !content.startsWith('data:')) {
                content = `data:${data.file_type};base64,${content}`;
            }

            // Шифрование сообщения
            const aesKey = generateAESKey();
            const { encrypted, iv } = encryptWithAES(content, aesKey);

            // Получение публичного ключа получателя для шифрования AES ключа
            db.get('SELECT public_key FROM users WHERE login = ?', [data.to_login], (err, recipient) => {
                if (err) {
                    console.error('Ошибка получения публичного ключа получателя:', err.message);
                    ws.send(JSON.stringify({ type: 'error', message: 'Ошибка шифрования' }));
                    return;
                }
                if (!recipient || !recipient.public_key) {
                    console.error('Публичный ключ получателя не найден, сохраняем без шифрования');
                    // Сохраняем сообщение без шифрования, если у получателя нет ключей
                    const params = [
                        messageId,
                        clientData.login,
                        data.to_login,
                        content,
                        null, // encrypted_content
                        null, // encryption_key
                        null, // encryption_iv
                        data.timestamp,
                        isAudio,
                        0,
                        data.file_name,
                        data.file_type,
                        data.file_size
                    ];

                    db.run(
                        'INSERT INTO messages (message_id, from_login, to_login, content, encrypted_content, encryption_key, encryption_iv, timestamp, is_audio, is_read, file_name, file_type, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        params,
                        (err) => {
                            if (err) {
                                console.error('Ошибка сохранения сообщения:', err.message);
                                ws.send(JSON.stringify({ type: 'error', message: `Ошибка сохранения сообщения: ${err.message}` }));
                                return;
                            }
                            console.log('Сообщение сохранено без шифрования:', messageId);
                            
                            // Обновляем контакты
                            db.run(
                                'INSERT OR REPLACE INTO contacts (user_login, contact_login, last_message_timestamp) VALUES (?, ?, ?)',
                                [clientData.login, data.to_login, data.timestamp]
                            );
                            db.run(
                                'INSERT OR REPLACE INTO contacts (user_login, contact_login, last_message_timestamp) VALUES (?, ?, ?)',
                                [data.to_login, clientData.login, data.timestamp]
                            );

                            // Отправляем сообщение всем участникам
                            wss.clients.forEach(client => {
                                const recipientData = clients.get(client);
                                if (
                                    client.readyState === WebSocket.OPEN &&
                                    recipientData &&
                                    (recipientData.login === clientData.login || recipientData.login === data.to_login)
                                ) {
                                    client.send(JSON.stringify({
                                        type: data.type,
                                        message_id: messageId,
                                        from_login: clientData.login,
                                        to_login: data.to_login,
                                        nickname: clientData.nickname || clientData.login,
                                        content: content,
                                        timestamp: data.timestamp,
                                        is_audio: isAudio,
                                        delivered: true,
                                        is_read: 0,
                                        file_name: data.file_name,
                                        file_type: data.file_type,
                                        file_size: data.file_size
                                    }));
                                }
                            });
                        }
                    );
                    return;
                }

                // Шифрование AES ключа с публичным ключом получателя
                const encryptedKey = encryptMessage(aesKey, recipient.public_key);

                const params = [
                    messageId,
                    clientData.login,
                    data.to_login,
                    content, // Оригинальное сообщение для отправителя
                    encrypted, // Зашифрованное сообщение
                    encryptedKey, // Зашифрованный AES ключ
                    iv, // Вектор инициализации
                    data.timestamp,
                    isAudio,
                    0,
                    data.file_name,
                    data.file_type,
                    data.file_size
                ];

                db.run(
                    'INSERT INTO messages (message_id, from_login, to_login, content, encrypted_content, encryption_key, encryption_iv, timestamp, is_audio, is_read, file_name, file_type, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    params,
                    (err) => {
                        if (err) {
                            console.error('Ошибка сохранения сообщения:', err.message);
                            ws.send(JSON.stringify({ type: 'error', message: `Ошибка сохранения сообщения: ${err.message}` }));
                            return;
                        }
                        console.log('Зашифрованное сообщение успешно сохранено:', messageId);
                        db.run(
                            'INSERT OR REPLACE INTO contacts (user_login, contact_login, last_message_timestamp) VALUES (?, ?, ?)',
                            [clientData.login, data.to_login, data.timestamp]
                        );
                        db.run(
                            'INSERT OR REPLACE INTO contacts (user_login, contact_login, last_message_timestamp) VALUES (?, ?, ?)',
                            [data.to_login, clientData.login, data.timestamp]
                        );

                        wss.clients.forEach(client => {
                            const recipientData = clients.get(client);
                            if (
                                client.readyState === WebSocket.OPEN &&
                                recipientData &&
                                (recipientData.login === clientData.login || recipientData.login === data.to_login)
                            ) {
                                // Отправляем оригинальное сообщение отправителю и зашифрованное получателю
                                const messageToSend = {
                                    type: data.type,
                                    message_id: messageId,
                                    from_login: clientData.login,
                                    to_login: data.to_login,
                                    nickname: clientData.nickname || clientData.login,
                                    timestamp: data.timestamp,
                                    is_audio: isAudio,
                                    delivered: true,
                                    is_read: 0,
                                    file_name: data.file_name,
                                    file_type: data.file_type,
                                    file_size: data.file_size
                                };

                                if (recipientData.login === clientData.login) {
                                    // Отправитель видит оригинальное сообщение
                                    messageToSend.content = content;
                                } else {
                                    // Получатель видит зашифрованное сообщение
                                    messageToSend.content = encrypted;
                                    messageToSend.encrypted_key = encryptedKey;
                                    messageToSend.iv = iv;
                                }

                                client.send(JSON.stringify(messageToSend));
                            }
                        });
                    }
                );
            });
        } else if (data.type === 'typing') {
            const clientData = clients.get(ws);
            if (!clientData) return;
            wss.clients.forEach(client => {
                const recipientData = clients.get(client);
                if (
                    client.readyState === WebSocket.OPEN &&
                    recipientData &&
                    recipientData.login === data.to_login
                ) {
                    client.send(JSON.stringify({
                        type: 'typing',
                        from_login: clientData.login,
                        to_login: data.to_login
                    }));
                }
            });
        } else if (data.type === 'call_login') {
            // Авторизация для звонков
            try {
                const decoded = jwt.verify(data.token, JWT_SECRET);
                const login = decoded.login;
                
                // Получаем данные пользователя
                db.get('SELECT nickname, theme, primary_color, level, is_banned FROM users WHERE login = ?', [login], (err, row) => {
                    if (err) {
                        console.error('Ошибка получения данных пользователя для звонков:', err.message);
                        return;
                    }
                    if (!row) {
                        console.error('Пользователь не найден для звонков:', login);
                        return;
                    }
                    if (row.is_banned) {
                        console.error('Заблокированный пользователь пытается войти в звонки:', login);
                        return;
                    }
                    
                    // Добавляем в список клиентов для звонков
                    clients.set(ws, { 
                        login, 
                        nickname: row.nickname || login, 
                        theme: row.theme || 'default', 
                        primary_color: row.primary_color || '#82AAFF', 
                        level: row.level || 0 
                    });
                    
                    // Добавляем запись о подключении для звонков
                    const connectionId = Math.random().toString(36).substr(2, 9);
                    db.run('INSERT OR REPLACE INTO active_connections (user_login, connection_type, connection_id, last_activity) VALUES (?, ?, ?, ?)',
                        [login, 'chat', connectionId, new Date().toISOString()]);
                    
                    console.log('Пользователь авторизован для звонков:', login);
                });
            } catch (error) {
                console.error('Ошибка авторизации для звонков:', error.message);
            }
        } else if (data.type === 'call_offer') {
            // Обработка предложения звонка
            const clientData = clients.get(ws);
            if (!clientData) return;
            
            console.log(`Звонок от ${clientData.login} к ${data.target}`);
            
            // Находим получателя
            wss.clients.forEach(client => {
                const recipientData = clients.get(client);
                if (
                    client.readyState === WebSocket.OPEN &&
                    recipientData &&
                    recipientData.login === data.target
                ) {
                    client.send(JSON.stringify({
                        type: 'call_offer',
                        offer: data.offer,
                        caller: clientData.login
                    }));
                }
            });
        } else if (data.type === 'call_answer') {
            // Обработка ответа на звонок
            const clientData = clients.get(ws);
            if (!clientData) return;
            
            console.log(`Ответ на звонок от ${clientData.login} к ${data.target}`);
            
            // Находим инициатора звонка
            wss.clients.forEach(client => {
                const recipientData = clients.get(client);
                if (
                    client.readyState === WebSocket.OPEN &&
                    recipientData &&
                    recipientData.login === data.target
                ) {
                    client.send(JSON.stringify({
                        type: 'call_answer',
                        answer: data.answer
                    }));
                }
            });
        } else if (data.type === 'call_reject') {
            // Обработка отклонения звонка
            const clientData = clients.get(ws);
            if (!clientData) return;
            
            console.log(`Звонок отклонен ${clientData.login} к ${data.target}`);
            
            // Уведомляем инициатора
            wss.clients.forEach(client => {
                const recipientData = clients.get(client);
                if (
                    client.readyState === WebSocket.OPEN &&
                    recipientData &&
                    recipientData.login === data.target
                ) {
                    client.send(JSON.stringify({
                        type: 'call_rejected'
                    }));
                }
            });
        } else if (data.type === 'call_end') {
            // Обработка завершения звонка
            const clientData = clients.get(ws);
            if (!clientData) return;
            
            console.log(`Звонок завершен ${clientData.login} к ${data.target}`);
            
            // Уведомляем другую сторону
            wss.clients.forEach(client => {
                const recipientData = clients.get(client);
                if (
                    client.readyState === WebSocket.OPEN &&
                    recipientData &&
                    recipientData.login === data.target
                ) {
                    client.send(JSON.stringify({
                        type: 'call_end'
                    }));
                }
            });
        } else if (data.type === 'ice_candidate') {
            // Передача ICE кандидатов
            const clientData = clients.get(ws);
            if (!clientData) return;
            
            // Находим получателя
            wss.clients.forEach(client => {
                const recipientData = clients.get(client);
                if (
                    client.readyState === WebSocket.OPEN &&
                    recipientData &&
                    recipientData.login === data.target
                ) {
                    client.send(JSON.stringify({
                        type: 'ice_candidate',
                        candidate: data.candidate
                    }));
                }
            });
        } else if (data.type === 'read') {
            const clientData = clients.get(ws);
            if (!clientData) return;
            db.run('UPDATE messages SET is_read = 1 WHERE message_id = ?', [data.message_id], (err) => {
                if (err) {
                    console.error('Ошибка обновления статуса прочтения:', err.message);
                    return;
                }
                wss.clients.forEach(client => {
                    const recipientData = clients.get(client);
                    if (
                        client.readyState === WebSocket.OPEN &&
                        recipientData &&
                        recipientData.login === data.from_login
                    ) {
                        client.send(JSON.stringify({
                            type: 'read',
                            message_id: data.message_id
                        }));
                    }
                });
            });
        }
    });

    ws.on('close', () => {
        const clientData = clients.get(ws);
        if (clientData) {
            console.log(`Клиент ${clientData.login} отключен`);
            
            // Удаляем запись о подключении
            db.run('DELETE FROM active_connections WHERE user_login = ? AND connection_type = ?', 
                [clientData.login, 'chat']);
            
            clients.delete(ws);
            broadcastUsers();
        } else {
            console.log('Клиент неизвестный отключен');
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket ошибка:', error.message);
    });
});

function broadcastUsers() {
    const users = Array.from(clients.values()).map(client => ({
        login: client.login,
        nickname: client.nickname || client.login,
        theme: client.theme,
        primary_color: client.primary_color,
        level: client.level
    }));
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'users', users }));
        }
    });
}

// Генерация ключа в формате MWX-LLC-XXXX-XXXX
function generateRegistrationKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const part1 = Array(4).fill().map(() => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    const part2 = Array(4).fill().map(() => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `MWX-LLC-${part1}-${part2}`;
}

// Регистрация нового пользователя
app.post('/register', async (req, res) => {
    const { login, password, email, key, nickname } = req.body;
    if (!login || !password || !email || !key) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }
    // Проверка ключа регистрации
    db.get('SELECT key, used FROM registration_keys WHERE key = ? AND used = 0', [key], async (err, row) => {
        if (err) {
            console.error('Ошибка проверки ключа регистрации:', err.message);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        if (!row) {
            return res.status(400).json({ error: 'Неверный или использованный ключ регистрации' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Неверный формат email' });
        }
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            db.get('SELECT login, email FROM users WHERE login = ? OR email = ?', [login, email], (err, row) => {
                if (err) {
                    console.error('Ошибка проверки пользователя:', err.message);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                if (row) {
                    return res.status(400).json({ error: 'Логин или email уже занят' });
                }
                // Генерация ключей шифрования для нового пользователя
                const { publicKey, privateKey } = generateKeyPair();
                
                db.run(
                    'INSERT INTO users (login, password, email, registration_key, nickname, level, is_banned, public_key, private_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [login, hashedPassword, email, key, nickname || login, 0, 0, publicKey, privateKey],
                    function (err) {
                        if (err) {
                            console.error('Ошибка регистрации:', err.message);
                            return res.status(500).json({ error: 'Ошибка регистрации' });
                        }
                        // Отметить ключ как использованный
                        db.run('UPDATE registration_keys SET used = 1, used_by = ? WHERE key = ?', [login, key], (err) => {
                            if (err) {
                                console.error('Ошибка обновления ключа:', err.message);
                            }
                        });
                        res.json({ message: 'Регистрация успешна' });
                    }
                );
            });
        } catch (error) {
            console.error('Ошибка хеширования пароля:', error.message);
            res.status(500).json({ error: 'Ошибка сервера' });
        }
    });
});

// Активация ключа для повышения уровня
app.post('/activate-key', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    const { key } = req.body;
    if (!key) {
        return res.status(400).json({ error: 'Ключ не предоставлен' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const login = decoded.login;
        if (key !== LEVEL_UP_KEY) {
            return res.status(400).json({ error: 'Неверный ключ активации' });
        }
        db.run('UPDATE users SET level = 5 WHERE login = ?', [login], function (err) {
            if (err) {
                console.error('Ошибка активации ключа:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            res.json({ message: 'Уровень успешно повышен до 5' });
        });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Генерация ключа регистрации (только для уровня 5)
app.post('/generate-key', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const login = decoded.login;
        db.get('SELECT level FROM users WHERE login = ?', [login], (err, row) => {
            if (err) {
                console.error('Ошибка проверки уровня:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            if (!row || row.level !== 5) {
                return res.status(403).json({ error: 'Требуется уровень 5 для генерации ключа' });
            }
            const newKey = generateRegistrationKey();
            const timestamp = new Date().toISOString();
            db.run(
                'INSERT INTO registration_keys (key, created_by, created_at, used) VALUES (?, ?, ?, 0)',
                [newKey, login, timestamp],
                function (err) {
                    if (err) {
                        console.error('Ошибка генерации ключа:', err.message);
                        return res.status(500).json({ error: 'Ошибка сервера' });
                    }
                    res.json({ key: newKey, message: 'Ключ успешно сгенерирован' });
                }
            );
        });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Поиск по ключу регистрации (только для уровня 5)
app.post('/search-key', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    const { key } = req.body;
    if (!key) {
        return res.status(400).json({ error: 'Ключ не предоставлен' });
    }
    if (!key.match(/^MWX-LLC-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
        return res.status(400).json({ error: 'Неверный формат ключа' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const login = decoded.login;
        db.get('SELECT level FROM users WHERE login = ?', [login], (err, row) => {
            if (err) {
                console.error('Ошибка проверки уровня:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            if (!row || row.level !== 5) {
                return res.status(403).json({ error: 'Требуется уровень 5 для поиска по ключу' });
            }
            db.get('SELECT login, email, registration_key FROM users WHERE registration_key = ?', [key], (err, user) => {
                if (err) {
                    console.error('Ошибка поиска по ключу:', err.message);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                if (!user) {
                    return res.status(404).json({ error: 'Пользователь с таким ключом не найден' });
                }
                res.json({ login: user.login, email: user.email, key: user.registration_key });
            });
        });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Получение списка всех ключей регистрации (только для уровня 5)
app.get('/list-keys', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const login = decoded.login;
        db.get('SELECT level FROM users WHERE login = ?', [login], (err, row) => {
            if (err) {
                console.error('Ошибка проверки уровня:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            if (!row || row.level !== 5) {
                return res.status(403).json({ error: 'Требуется уровень 5 для просмотра ключей' });
            }
            db.all('SELECT key, created_by, created_at, used, used_by FROM registration_keys ORDER BY created_at DESC', [], (err, rows) => {
                if (err) {
                    console.error('Ошибка получения списка ключей:', err.message);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                res.json({ keys: rows });
            });
        });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Бан пользователя (только для уровня 5)
app.post('/ban-user', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    const { login } = req.body;
    if (!login) {
        return res.status(400).json({ error: 'Логин обязателен' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const adminLogin = decoded.login;
        db.get('SELECT level FROM users WHERE login = ?', [adminLogin], (err, row) => {
            if (err) {
                console.error('Ошибка проверки уровня:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            if (!row || row.level !== 5) {
                return res.status(403).json({ error: 'Требуется уровень 5 для бана пользователя' });
            }
            db.get('SELECT login FROM users WHERE login = ?', [login], (err, user) => {
                if (err) {
                    console.error('Ошибка поиска пользователя:', err.message);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                if (!user) {
                    return res.status(404).json({ error: 'Пользователь не найден' });
                }
                db.run('UPDATE users SET is_banned = 1 WHERE login = ?', [login], function (err) {
                    if (err) {
                        console.error('Ошибка бана пользователя:', err.message);
                        return res.status(500).json({ error: 'Ошибка сервера' });
                    }
                    // Отключение пользователя через WebSocket
                    wss.clients.forEach(client => {
                        const clientData = clients.get(client);
                        if (clientData && clientData.login === login && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'banned', message: 'Ваш аккаунт заблокирован' }));
                            client.close();
                        }
                    });
                    res.json({ message: `Пользователь ${login} успешно забанен` });
                });
            });
        });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Обновление пароля другого пользователя (только для уровня 5)
app.post('/update-user-password', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    const { targetLogin, newPassword } = req.body;
    if (!targetLogin || !newPassword) {
        return res.status(400).json({ error: 'Логин и новый пароль обязательны' });
    }
    if (newPassword.length < 12) {
        return res.status(400).json({ error: 'Пароль должен содержать минимум 12 символов' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const login = decoded.login;
        db.get('SELECT level FROM users WHERE login = ?', [login], async (err, row) => {
            if (err) {
                console.error('Ошибка проверки уровня:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            if (!row || row.level !== 5) {
                return res.status(403).json({ error: 'Требуется уровень 5 для изменения пароля другого пользователя' });
            }
            try {
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                db.run('UPDATE users SET password = ? WHERE login = ?', [hashedPassword, targetLogin], function (err) {
                    if (err) {
                        console.error('Ошибка обновления пароля:', err.message);
                        return res.status(500).json({ error: 'Ошибка сервера' });
                    }
                    if (this.changes === 0) {
                        return res.status(404).json({ error: 'Пользователь не найден' });
                    }
                    res.json({ message: `Пароль для пользователя ${targetLogin} успешно обновлен` });
                });
            } catch (error) {
                console.error('Ошибка хеширования пароля:', error.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
        });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Авторизация пользователя
app.post('/login', (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    db.get('SELECT login, password, nickname, theme, primary_color, level, is_banned FROM users WHERE login = ?', [login], async (err, row) => {
        if (err) {
            console.error('Ошибка проверки пользователя:', err.message);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        if (!row) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        if (row.is_banned) {
            return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
        }
        try {
            const match = await bcrypt.compare(password, row.password);
            if (match) {
                const token = jwt.sign({ login: row.login }, JWT_SECRET, { expiresIn: '1d' });
                res.json({ 
                    message: 'Авторизация успешна', 
                    redirect: 'main.html',
                    token,
                    user: {
                        login: row.login,
                        nickname: row.nickname,
                        theme: row.theme,
                        primary_color: row.primary_color,
                        level: row.level
                    }
                });
            } else {
                res.status(401).json({ error: 'Неверный логин или пароль' });
            }
        } catch (error) {
            console.error('Ошибка проверки пароля:', error.message);
            res.status(500).json({ error: 'Ошибка сервера' });
        }
    });
});

// Получение данных профиля
app.get('/profile', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const login = decoded.login;
        db.get('SELECT login, nickname, theme, primary_color, level, is_banned FROM users WHERE login = ?', [login], (err, row) => {
            if (err) {
                console.error('Ошибка получения профиля:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            if (!row) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            if (row.is_banned) {
                return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
            }
            res.json({ login: row.login, nickname: row.nickname, theme: row.theme, primary_color: row.primary_color, level: row.level });
        });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Обновление профиля
app.post('/profile', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    const { nickname, password, theme, primary_color } = req.body;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const login = decoded.login;
        db.get('SELECT login, is_banned FROM users WHERE login = ?', [login], async (err, row) => {
            if (err) {
                console.error('Ошибка проверки пользователя:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            if (!row) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            if (row.is_banned) {
                return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
            }
            let query = 'UPDATE users SET ';
            const params = [];
            let updates = [];
            if (nickname) {
                updates.push('nickname = ?');
                params.push(nickname);
            }
            if (password) {
                try {
                    const hashedPassword = await bcrypt.hash(password, 10);
                    updates.push('password = ?');
                    params.push(hashedPassword);
                } catch (error) {
                    console.error('Ошибка хеширования пароля:', error.message);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
            }
            if (theme) {
                updates.push('theme = ?');
                params.push(theme);
            }
            if (primary_color) {
                updates.push('primary_color = ?');
                params.push(primary_color);
            }
            if (updates.length === 0) {
                return res.status(400).json({ error: 'Не указаны данные для обновления' });
            }
            query += updates.join(', ') + ' WHERE login = ?';
            params.push(login);
            db.run(query, params, function (err) {
                if (err) {
                    console.error('Ошибка обновления профиля:', err.message);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                res.json({ message: 'Профиль успешно обновлен' });
            });
        });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Поиск пользователя
app.get('/search-user', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    try {
        jwt.verify(token, JWT_SECRET);
        const { nickname } = req.query;
        if (!nickname) {
            return res.status(400).json({ error: 'Не указан никнейм' });
        }
        db.all('SELECT login, nickname FROM users WHERE nickname LIKE ? OR login LIKE ?', [`%${nickname}%`, `%${nickname}%`], (err, rows) => {
            if (err) {
                console.error('Ошибка поиска пользователя:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            if (!rows.length) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            res.json(rows);
        });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Получение приватных сообщений
app.get('/messages', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const from = decoded.login;
        const { to } = req.query;
        if (!from || !to) {
            return res.status(400).json({ error: 'Не указаны пользователи' });
        }
        db.all(
            `SELECT message_id, from_login, to_login, content, encrypted_content, encryption_key, encryption_iv, timestamp, is_audio, is_read, file_name, file_type, file_size
             FROM messages
             WHERE (from_login = ? AND to_login = ?) OR (from_login = ? AND to_login = ?)
             ORDER BY timestamp ASC`,
            [from, to, to, from],
            (err, rows) => {
                if (err) {
                    console.error('Ошибка получения сообщений:', err.message);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                
                // Получение приватного ключа пользователя для расшифровки
                db.get('SELECT private_key FROM users WHERE login = ?', [from], (err, user) => {
                    if (err) {
                        console.error('Ошибка получения приватного ключа:', err.message);
                        return res.status(500).json({ error: 'Ошибка сервера' });
                    }
                    
                    const messages = rows.map(msg => {
                        let decryptedContent = msg.content;
                        
                        // Если сообщение зашифровано и пользователь не отправитель, расшифровываем
                        if (msg.encrypted_content && msg.encryption_key && msg.encryption_iv && msg.from_login !== from) {
                            try {
                                // Расшифровываем AES ключ
                                const decryptedKey = decryptMessage(msg.encryption_key, user.private_key);
                                // Расшифровываем сообщение
                                decryptedContent = decryptWithAES(msg.encrypted_content, decryptedKey, msg.encryption_iv);
                            } catch (error) {
                                console.error('Ошибка расшифровки сообщения:', error.message);
                                decryptedContent = '[Сообщение не может быть расшифровано]';
                            }
                        }
                        
                        if (msg.is_audio && !decryptedContent.startsWith('data:audio/')) {
                            decryptedContent = `data:audio/webm;base64,${decryptedContent}`;
                            msg.type = 'file';
                        } else if (msg.file_name && msg.file_type && decryptedContent) {
                            if (!decryptedContent.startsWith('data:')) {
                                decryptedContent = `data:${msg.file_type};base64,${decryptedContent}`;
                            }
                            msg.type = 'file';
                        } else {
                            msg.type = 'message';
                        }
                        
                        return {
                            ...msg,
                            content: decryptedContent
                        };
                    });
                    res.json({ messages });
                });
            }
        );
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Добавление контакта
app.post('/add-contact', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userLogin = decoded.login;
        const { contact_login } = req.body;
        
        if (!contact_login) {
            return res.status(400).json({ error: 'Не указан контакт' });
        }
        
        if (userLogin === contact_login) {
            return res.status(400).json({ error: 'Нельзя добавить себя в контакты' });
        }
        
        // Проверяем, существует ли пользователь
        db.get('SELECT login FROM users WHERE login = ?', [contact_login], (err, user) => {
            if (err) {
                console.error('Ошибка проверки пользователя:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            if (!user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            
            // Проверяем, есть ли уже такой контакт
            db.get('SELECT * FROM contacts WHERE user_login = ? AND contact_login = ?', 
                [userLogin, contact_login], (err, existing) => {
                    if (err) {
                        console.error('Ошибка проверки контакта:', err.message);
                        return res.status(500).json({ error: 'Ошибка сервера' });
                    }
                    
                    if (existing) {
                        return res.status(400).json({ error: 'Контакт уже существует' });
                    }
                    
                    // Добавляем контакт
                    db.run('INSERT INTO contacts (user_login, contact_login, last_message_timestamp) VALUES (?, ?, ?)', 
                        [userLogin, contact_login, new Date().toISOString()], (err) => {
                            if (err) {
                                console.error('Ошибка добавления контакта:', err.message);
                                return res.status(500).json({ error: 'Ошибка сервера' });
                            }
                            res.json({ message: 'Контакт успешно добавлен' });
                        });
                });
        });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Удаление контакта
app.post('/remove-contact', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userLogin = decoded.login;
        const { contact_login } = req.body;
        
        if (!contact_login) {
            return res.status(400).json({ error: 'Не указан контакт' });
        }
        
        db.run('DELETE FROM contacts WHERE user_login = ? AND contact_login = ?', 
            [userLogin, contact_login], (err) => {
                if (err) {
                    console.error('Ошибка удаления контакта:', err.message);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                res.json({ message: 'Контакт успешно удален' });
            });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Получение списка контактов
app.get('/contacts', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const login = decoded.login;
        db.all(
            `SELECT c.contact_login as login, u.nickname, u.level,
                    CASE WHEN ac.user_login IS NOT NULL THEN 1 ELSE 0 END as is_online
             FROM contacts c
             JOIN users u ON c.contact_login = u.login
             LEFT JOIN active_connections ac ON c.contact_login = ac.user_login AND ac.connection_type = 'chat'
             WHERE c.user_login = ?
             ORDER BY c.last_message_timestamp DESC`,
            [login],
            (err, rows) => {
                if (err) {
                    console.error('Ошибка получения контактов:', err.message);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                // Возвращаем массив напрямую для совместимости
                res.json(rows);
            }
        );
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Проверка существования файлов и запуск Start.bat
app.get('/launch', (req, res) => {
    if (!fs.existsSync(batDir)) {
        console.error(`Папка не найдена: ${batDir}`);
        return res.status(404).json({ error: `Папка ${batDir} не найдена` });
    }
    if (!fs.existsSync(batFilePath)) {
        console.error(`Файл не найден: ${batFilePath}`);
        return res.status(404).json({ error: `Файл ${batFilePath} не найден` });
    }
    const javaPath = path.join(batDir, 'jre', 'bin', 'javaw.exe');
    const jarPath = path.join(batDir, 'augustus.jar');
    if (!fs.existsSync(javaPath)) {
        console.error(`Файл javaw.exe не найден: ${javaPath}`);
        return res.status(404).json({ error: `Файл javaw.exe не найден: ${javaPath}` });
    }
    if (!fs.existsSync(jarPath)) {
        console.error(`Файл augustus.jar не найден: ${jarPath}`);
        return res.status(404).json({ error: `Файл augustus.jar не найден: ${jarPath}` });
    }
    exec(`"${batFilePath}"`, { cwd: batDir, shell: true }, (error, stdout, stderr) => {
        if (error) {
            console.error('Ошибка запуска Start.bat:', error.message);
            console.error('stderr:', stderr);
            return res.status(500).json({ error: `Ошибка запуска программы: ${error.message}` });
        }
        console.log('stdout:', stdout);
        res.json({ message: 'Программа успешно запущена' });
    });
});

// Генерация ключей для существующих пользователей
app.post('/generate-keys', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const login = decoded.login;
        
        // Проверяем, есть ли уже ключи у пользователя
        db.get('SELECT public_key, private_key FROM users WHERE login = ?', [login], (err, row) => {
            if (err) {
                console.error('Ошибка проверки ключей:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            if (row && row.public_key && row.private_key) {
                return res.json({ message: 'Ключи уже существуют' });
            }
            
            // Генерируем новые ключи
            const { publicKey, privateKey } = generateKeyPair();
            
            db.run('UPDATE users SET public_key = ?, private_key = ? WHERE login = ?', 
                [publicKey, privateKey, login], (err) => {
                    if (err) {
                        console.error('Ошибка сохранения ключей:', err.message);
                        return res.status(500).json({ error: 'Ошибка сервера' });
                    }
                    res.json({ message: 'Ключи шифрования успешно сгенерированы' });
                });
        });
    } catch (error) {
        console.error('Ошибка верификации JWT:', error.message);
        res.status(401).json({ error: 'Неверный токен' });
    }
});

// Запуск сервера
server.listen(port, '127.0.0.1', () => {
    console.log(`Сервер запущен на http://127.0.0.1:${port}`);
});