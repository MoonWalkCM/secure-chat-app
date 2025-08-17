const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();

// Секреты
const JWT_SECRET = process.env.JWT_SECRET || 'mwlauncher-secret-key-2024-fixed';

// Путь к базе данных
const dbPath = path.join(__dirname, 'database.db');

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Инициализация базы данных
let db;

function initDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Ошибка подключения к базе данных:', err.message);
                reject(err);
                return;
            }
            console.log('Подключено к базе данных SQLite.');
            
            // Создание таблиц
            db.serialize(() => {
                // Таблица пользователей
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
                `);

                // Таблица сообщений
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
                `);

                // Таблица контактов
                db.run(`
                    CREATE TABLE IF NOT EXISTS contacts (
                        user_login TEXT NOT NULL,
                        contact_login TEXT NOT NULL,
                        last_message_timestamp TEXT,
                        PRIMARY KEY (user_login, contact_login)
                    )
                `);

                // Таблица активных соединений
                db.run(`
                    CREATE TABLE IF NOT EXISTS active_connections (
                        user_login TEXT NOT NULL,
                        connection_type TEXT NOT NULL,
                        connection_id TEXT NOT NULL,
                        last_activity TEXT,
                        PRIMARY KEY (user_login, connection_type, connection_id)
                    )
                `);

                // Таблица звонков
                db.run(`
                    CREATE TABLE IF NOT EXISTS call_sessions (
                        id TEXT PRIMARY KEY,
                        caller TEXT NOT NULL,
                        recipient TEXT NOT NULL,
                        offer TEXT,
                        answer TEXT,
                        status TEXT DEFAULT 'pending',
                        with_video INTEGER DEFAULT 0,
                        timestamp INTEGER,
                        ice_candidates TEXT
                    )
                `);

                // Создаем тестовых пользователей если их нет
                db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
                    if (err) {
                        console.error('Ошибка проверки пользователей:', err);
                        return;
                    }
                    
                    if (row.count === 0) {
                        console.log('Создаем тестовых пользователей...');
                        createTestUsers();
                    }
                });

                resolve();
            });
        });
    });
}

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

// Создание тестовых пользователей
async function createTestUsers() {
    const { publicKey: publicKey1, privateKey: privateKey1 } = generateKeyPair();
    const { publicKey: publicKey2, privateKey: privateKey2 } = generateKeyPair();
    
    const hashedPassword = await bcrypt.hash('test', 10);
    
    // Тестовый пользователь 1
    db.run(`
        INSERT INTO users (login, password, email, registration_key, nickname, public_key, private_key)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['test', hashedPassword, 'test@example.com', 'test-key', 'Тестовый пользователь', publicKey1, privateKey1]);
    
    // Тестовый пользователь 2
    db.run(`
        INSERT INTO users (login, password, email, registration_key, nickname, public_key, private_key)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['test2', hashedPassword, 'test2@example.com', 'test-key', 'Тестовый пользователь 2', publicKey2, privateKey2]);
    
    // Добавляем их в контакты друг друга
    db.run(`
        INSERT INTO contacts (user_login, contact_login)
        VALUES (?, ?)
    `, ['test', 'test2']);
    
    db.run(`
        INSERT INTO contacts (user_login, contact_login)
        VALUES (?, ?)
    `, ['test2', 'test']);
    
    console.log('Тестовые пользователи созданы!');
}

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/main', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/main.html'));
});

app.get('/chats', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/chats.html'));
});

app.get('/calls', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/calls.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/profile.html'));
});

app.get('/setting', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/setting.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/register.html'));
});

// Регистрация
app.post('/register', async (req, res) => {
    try {
        const { login, password, email, registration_key } = req.body;
        
        console.log('Регистрация:', { login, email, registration_key });
        
        // Проверяем, существует ли пользователь
        db.get('SELECT login FROM users WHERE login = ?', [login], async (err, row) => {
            if (err) {
                console.error('Ошибка проверки пользователя:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            if (row) {
                console.log('Пользователь уже существует:', login);
                return res.status(400).json({ error: 'Пользователь уже существует' });
            }
            
            const hashedPassword = await bcrypt.hash(password, 10);
            const { publicKey, privateKey } = generateKeyPair();
            
            db.run(`
                INSERT INTO users (login, password, email, registration_key, nickname, public_key, private_key)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [login, hashedPassword, email, registration_key, login, publicKey, privateKey], function(err) {
                if (err) {
                    console.error('Ошибка создания пользователя:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                
                console.log('Пользователь создан:', login);
                
                const token = jwt.sign({ login }, JWT_SECRET, { expiresIn: '24h' });
                
                res.json({ 
                    success: true, 
                    token,
                    user: {
                        login: login,
                        email: email,
                        nickname: login,
                        level: 0,
                        theme: 'default',
                        primary_color: '#82AAFF'
                    }
                });
            });
        });
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        
        console.log('Попытка входа:', login);
        
        db.get('SELECT * FROM users WHERE login = ?', [login], async (err, user) => {
            if (err) {
                console.error('Ошибка поиска пользователя:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            if (!user) {
                console.log('Пользователь не найден:', login);
                return res.status(401).json({ error: 'Неверный логин или пароль' });
            }
            
            console.log('Пользователь найден, проверяем пароль...');
            const isValidPassword = await bcrypt.compare(password, user.password);
            console.log('Пароль валиден:', isValidPassword);
            
            if (!isValidPassword) {
                console.log('Неверный пароль для пользователя:', login);
                return res.status(401).json({ error: 'Неверный логин или пароль' });
            }
            
            const token = jwt.sign({ login }, JWT_SECRET, { expiresIn: '24h' });
            
            // Отмечаем пользователя как онлайн
            const connectionId = Math.random().toString(36).substr(2, 9);
            db.run('INSERT OR REPLACE INTO active_connections (user_login, connection_type, connection_id, last_activity) VALUES (?, ?, ?, ?)',
                [login, 'web', connectionId, new Date().toISOString()]);
            
            console.log('Успешный вход:', login);
            
            res.json({ 
                success: true, 
                token,
                user: {
                    login: user.login,
                    email: user.email,
                    nickname: user.nickname || user.login,
                    level: user.level || 0,
                    theme: user.theme || 'default',
                    primary_color: user.primary_color || '#82AAFF'
                }
            });
        });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение сообщений
app.get('/messages', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        db.all('SELECT * FROM messages WHERE from_login = ? OR to_login = ? ORDER BY timestamp DESC', 
            [decoded.login, decoded.login], (err, rows) => {
            if (err) {
                console.error('Ошибка получения сообщений:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            res.json({ messages: rows });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Отправка сообщения
app.post('/send-message', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { recipient, content, type = 'text' } = req.body;
        
        // Получаем данные отправителя и получателя
        db.get('SELECT * FROM users WHERE login = ?', [decoded.login], (err, sender) => {
            if (err || !sender) {
                return res.status(401).json({ error: 'Пользователь не найден' });
            }
            
            db.get('SELECT * FROM users WHERE login = ?', [recipient], (err, recipientUser) => {
                if (err || !recipientUser) {
                    return res.status(404).json({ error: 'Получатель не найден' });
                }
                
                const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                const aesKey = generateAESKey();
                const encrypted = encryptWithAES(content, aesKey);
                
                const message = {
                    message_id: messageId,
                    from_login: sender.login,
                    to_login: recipient,
                    content: content,
                    encrypted_content: encrypted.encrypted,
                    encryption_key: encryptMessage(aesKey, recipientUser.public_key),
                    encryption_iv: encrypted.iv,
                    timestamp: new Date().toISOString()
                };
                
                db.run(`
                    INSERT INTO messages (message_id, from_login, to_login, content, encrypted_content, encryption_key, encryption_iv, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [message.message_id, message.from_login, message.to_login, message.content, 
                     message.encrypted_content, message.encryption_key, message.encryption_iv, message.timestamp], function(err) {
                    if (err) {
                        console.error('Ошибка сохранения сообщения:', err);
                        return res.status(500).json({ error: 'Ошибка сервера' });
                    }
                    
                    res.json({ success: true, message });
                });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение контактов
app.get('/contacts', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        db.all(`
            SELECT c.contact_login, u.nickname, 
                   CASE WHEN ac.last_activity IS NOT NULL 
                        AND datetime(ac.last_activity) > datetime('now', '-30 seconds') 
                   THEN 1 ELSE 0 END as is_online
            FROM contacts c
            LEFT JOIN users u ON c.contact_login = u.login
            LEFT JOIN active_connections ac ON c.contact_login = ac.user_login
            WHERE c.user_login = ?
        `, [decoded.login], (err, rows) => {
            if (err) {
                console.error('Ошибка получения контактов:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            const contactsList = rows.map(row => ({
                login: row.contact_login,
                nickname: row.nickname || row.contact_login,
                is_online: row.is_online === 1
            }));
            
            res.json(contactsList);
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Добавление контакта
app.post('/add-contact', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { contact_login } = req.body;
        
        db.get('SELECT login FROM users WHERE login = ?', [contact_login], (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            
            db.run('INSERT OR IGNORE INTO contacts (user_login, contact_login) VALUES (?, ?)', 
                [decoded.login, contact_login], function(err) {
                if (err) {
                    console.error('Ошибка добавления контакта:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                
                res.json({ success: true });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удаление контакта
app.post('/remove-contact', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { contact_login } = req.body;
        
        db.run('DELETE FROM contacts WHERE user_login = ? AND contact_login = ?', 
            [decoded.login, contact_login], function(err) {
            if (err) {
                console.error('Ошибка удаления контакта:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            res.json({ success: true });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновление профиля
app.post('/update-profile', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { nickname, theme, primary_color } = req.body;
        
        const updates = [];
        const values = [];
        
        if (nickname) {
            updates.push('nickname = ?');
            values.push(nickname);
        }
        if (theme) {
            updates.push('theme = ?');
            values.push(theme);
        }
        if (primary_color) {
            updates.push('primary_color = ?');
            values.push(primary_color);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }
        
        values.push(decoded.login);
        
        db.run(`UPDATE users SET ${updates.join(', ')} WHERE login = ?`, values, function(err) {
            if (err) {
                console.error('Ошибка обновления профиля:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            // Получаем обновленные данные пользователя
            db.get('SELECT * FROM users WHERE login = ?', [decoded.login], (err, user) => {
                if (err || !user) {
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                
                res.json({ 
                    success: true,
                    user: {
                        login: user.login,
                        email: user.email,
                        nickname: user.nickname,
                        level: user.level,
                        theme: user.theme,
                        primary_color: user.primary_color
                    }
                });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// === ЗВОНКИ ===

// Получение ICE серверов для WebRTC
app.get('/ice-servers', (req, res) => {
    const iceServers = [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                'stun:stun3.l.google.com:19302',
                'stun:stun4.l.google.com:19302'
            ]
        }
    ];
    
    res.json({ iceServers });
});

// Инициация звонка
app.post('/call/offer', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { recipient, offer, withVideo } = req.body;
        
        db.get('SELECT login FROM users WHERE login = ?', [recipient], (err, recipientUser) => {
            if (err || !recipientUser) {
                return res.status(404).json({ error: 'Получатель не найден' });
            }
            
            // Проверяем, не занят ли получатель
            db.get('SELECT id FROM call_sessions WHERE recipient = ? AND status = "active"', [recipient], (err, activeCall) => {
                if (err) {
                    console.error('Ошибка проверки активных звонков:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                
                if (activeCall) {
                    return res.status(409).json({ error: 'Пользователь занят другим звонком' });
                }
                
                const callId = Date.now().toString();
                
                db.run(`
                    INSERT INTO call_sessions (id, caller, recipient, offer, with_video, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [callId, decoded.login, recipient, offer, withVideo ? 1 : 0, Date.now()], function(err) {
                    if (err) {
                        console.error('Ошибка создания звонка:', err);
                        return res.status(500).json({ error: 'Ошибка сервера' });
                    }
                    
                    res.json({ 
                        success: true, 
                        callId: callId,
                        message: 'Звонок инициирован'
                    });
                });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Ответ на звонок
app.post('/call/answer', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { callId, answer } = req.body;
        
        db.run(`
            UPDATE call_sessions 
            SET answer = ?, status = 'active' 
            WHERE id = ? AND recipient = ?
        `, [answer, callId, decoded.login], function(err) {
            if (err) {
                console.error('Ошибка обновления звонка:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Звонок не найден' });
            }
            
            res.json({ 
                success: true, 
                message: 'Звонок принят'
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Отклонение звонка
app.post('/call/reject', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { callId } = req.body;
        
        db.run(`
            UPDATE call_sessions 
            SET status = 'rejected' 
            WHERE id = ? AND recipient = ?
        `, [callId, decoded.login], function(err) {
            if (err) {
                console.error('Ошибка отклонения звонка:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            res.json({ 
                success: true, 
                message: 'Звонок отклонен'
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Завершение звонка
app.post('/call/end', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { callId } = req.body;
        
        db.run(`
            UPDATE call_sessions 
            SET status = 'ended' 
            WHERE id = ? AND (caller = ? OR recipient = ?)
        `, [callId, decoded.login, decoded.login], function(err) {
            if (err) {
                console.error('Ошибка завершения звонка:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            res.json({ 
                success: true, 
                message: 'Звонок завершен'
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ICE кандидаты
app.post('/call/ice-candidate', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { callId, candidate } = req.body;
        
        // Получаем текущие ICE кандидаты
        db.get('SELECT ice_candidates FROM call_sessions WHERE id = ?', [callId], (err, row) => {
            if (err || !row) {
                return res.status(404).json({ error: 'Звонок не найден' });
            }
            
            let iceCandidates = [];
            if (row.ice_candidates) {
                try {
                    iceCandidates = JSON.parse(row.ice_candidates);
                } catch (e) {
                    iceCandidates = [];
                }
            }
            
            iceCandidates.push({
                from: decoded.login,
                candidate: candidate,
                timestamp: Date.now()
            });
            
            db.run('UPDATE call_sessions SET ice_candidates = ? WHERE id = ?', 
                [JSON.stringify(iceCandidates), callId], function(err) {
                if (err) {
                    console.error('Ошибка сохранения ICE кандидата:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                
                res.json({ 
                    success: true, 
                    message: 'ICE кандидат получен'
                });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение статуса звонка
app.get('/call/status/:callId', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { callId } = req.params;
        
        db.get('SELECT * FROM call_sessions WHERE id = ? AND (caller = ? OR recipient = ?)', 
            [callId, decoded.login, decoded.login], (err, callSession) => {
            if (err) {
                console.error('Ошибка получения статуса звонка:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            if (!callSession) {
                return res.status(404).json({ error: 'Звонок не найден' });
            }
            
            let iceCandidates = [];
            if (callSession.ice_candidates) {
                try {
                    iceCandidates = JSON.parse(callSession.ice_candidates);
                } catch (e) {
                    iceCandidates = [];
                }
            }
            
            res.json({ 
                success: true, 
                callSession: {
                    id: callSession.id,
                    status: callSession.status,
                    caller: callSession.caller,
                    recipient: callSession.recipient,
                    withVideo: callSession.with_video === 1,
                    offer: callSession.offer,
                    answer: callSession.answer,
                    iceCandidates: iceCandidates
                }
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Очистка старых звонков (каждые 5 минут)
setInterval(() => {
    const fiveMinutesAgo = Date.now() - 300000;
    db.run('DELETE FROM call_sessions WHERE timestamp < ?', [fiveMinutesAgo], (err) => {
        if (err) {
            console.error('Ошибка очистки старых звонков:', err);
        }
    });
}, 300000);

// Инициализация базы данных при запуске
initDatabase().then(() => {
    console.log('База данных инициализирована');
}).catch((err) => {
    console.error('Ошибка инициализации базы данных:', err);
});

module.exports = app; 
