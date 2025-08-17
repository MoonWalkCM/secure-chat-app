const express = require('express');
const { createServer } = require('http');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const server = createServer(app);

// Секреты
const JWT_SECRET = process.env.JWT_SECRET || 'mwlauncher-secret-key-2024-fixed';

// In-memory storage для Vercel (вместо SQLite)
const users = new Map();
const messages = new Map();
const contacts = new Map();
const activeConnections = new Map(); // Для отслеживания онлайн статуса
const callSessions = new Map(); // Для управления звонками

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

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

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/main.html'));
});

app.get('/chats', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/chats.html'));
});

app.get('/calls', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/calls.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/profile.html'));
});

app.get('/setting', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/setting.html'));
});

// Регистрация
app.post('/register', async (req, res) => {
    try {
        const { login, password, email, registration_key } = req.body;
        
        if (users.has(login)) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const { publicKey, privateKey } = generateKeyPair();
        
        const user = {
            id: Date.now(),
            login,
            password: hashedPassword,
            email,
            registration_key,
            nickname: login,
            theme: 'default',
            primary_color: '#82AAFF',
            level: 0,
            is_banned: 0,
            public_key: publicKey,
            private_key: privateKey
        };
        
        users.set(login, user);
        
        const token = jwt.sign({ login }, JWT_SECRET, { expiresIn: '24h' });
        
        res.json({ 
            success: true, 
            token,
            user: {
                login: user.login,
                email: user.email,
                nickname: user.nickname,
                level: user.level,
                theme: user.theme,
                primary_color: user.primary_color
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        
        const user = users.get(login);
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        const token = jwt.sign({ login }, JWT_SECRET, { expiresIn: '24h' });
        
        // Отмечаем пользователя как онлайн
        activeConnections.set(login, { timestamp: Date.now() });
        
        res.json({ 
            success: true, 
            token,
            user: {
                login: user.login,
                email: user.email,
                nickname: user.nickname,
                level: user.level,
                theme: user.theme,
                primary_color: user.primary_color
            }
        });
    } catch (error) {
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
        const user = users.get(decoded.login);
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const userMessages = messages.get(decoded.login) || [];
        res.json({ messages: userMessages });
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
        const sender = users.get(decoded.login);
        if (!sender) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const { recipient, content, type = 'text' } = req.body;
        const recipientUser = users.get(recipient);
        
        if (!recipientUser) {
            return res.status(404).json({ error: 'Получатель не найден' });
        }
        
        const messageId = Date.now();
        const aesKey = generateAESKey();
        const encrypted = encryptWithAES(content, aesKey);
        
        const message = {
            id: messageId,
            sender: sender.login,
            recipient: recipient,
            content: content,
            encrypted_content: encrypted.encrypted,
            encryption_key: encryptMessage(aesKey, recipientUser.public_key),
            encryption_iv: encrypted.iv,
            type: type,
            timestamp: new Date().toISOString(),
            is_read: 0
        };
        
        // Сохраняем сообщение для отправителя
        if (!messages.has(sender.login)) {
            messages.set(sender.login, []);
        }
        messages.get(sender.login).push(message);
        
        // Сохраняем сообщение для получателя
        if (!messages.has(recipient)) {
            messages.set(recipient, []);
        }
        messages.get(recipient).push(message);
        
        res.json({ success: true, message });
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
        const user = users.get(decoded.login);
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const userContacts = contacts.get(decoded.login) || [];
        const contactsList = userContacts.map(contactLogin => {
            const contactUser = users.get(contactLogin);
            const isOnline = activeConnections.has(contactLogin) && 
                           (Date.now() - activeConnections.get(contactLogin).timestamp) < 30000; // 30 секунд
            return {
                login: contactLogin,
                nickname: contactUser?.nickname || contactLogin,
                is_online: isOnline
            };
        });
        
        res.json(contactsList);
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
        const user = users.get(decoded.login);
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const { contact_login } = req.body;
        const contactUser = users.get(contact_login);
        
        if (!contactUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        if (!contacts.has(decoded.login)) {
            contacts.set(decoded.login, []);
        }
        
        if (!contacts.get(decoded.login).includes(contact_login)) {
            contacts.get(decoded.login).push(contact_login);
        }
        
        res.json({ success: true });
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
        const user = users.get(decoded.login);
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const { contact_login } = req.body;
        
        if (contacts.has(decoded.login)) {
            const userContacts = contacts.get(decoded.login);
            const index = userContacts.indexOf(contact_login);
            if (index > -1) {
                userContacts.splice(index, 1);
            }
        }
        
        res.json({ success: true });
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
        const user = users.get(decoded.login);
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const { nickname, theme, primary_color } = req.body;
        
        if (nickname) user.nickname = nickname;
        if (theme) user.theme = theme;
        if (primary_color) user.primary_color = primary_color;
        
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
        const caller = users.get(decoded.login);
        if (!caller) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const { recipient, offer, withVideo } = req.body;
        const recipientUser = users.get(recipient);
        
        if (!recipientUser) {
            return res.status(404).json({ error: 'Получатель не найден' });
        }
        
        // Проверяем, не занят ли получатель
        const recipientSession = Array.from(callSessions.values()).find(session => 
            session.participants.includes(recipient) && session.status === 'active'
        );
        
        if (recipientSession) {
            return res.status(409).json({ error: 'Пользователь занят другим звонком' });
        }
        
        const callId = Date.now().toString();
        const callSession = {
            id: callId,
            caller: caller.login,
            recipient: recipient,
            offer: offer,
            withVideo: withVideo,
            status: 'pending',
            participants: [caller.login, recipient],
            timestamp: Date.now()
        };
        
        callSessions.set(callId, callSession);
        
        res.json({ 
            success: true, 
            callId: callId,
            message: 'Звонок инициирован'
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
        const answerer = users.get(decoded.login);
        if (!answerer) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const { callId, answer } = req.body;
        const callSession = callSessions.get(callId);
        
        if (!callSession) {
            return res.status(404).json({ error: 'Звонок не найден' });
        }
        
        if (callSession.recipient !== answerer.login) {
            return res.status(403).json({ error: 'Не авторизован для ответа на этот звонок' });
        }
        
        callSession.answer = answer;
        callSession.status = 'active';
        
        res.json({ 
            success: true, 
            message: 'Звонок принят'
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
        const rejecter = users.get(decoded.login);
        if (!rejecter) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const { callId } = req.body;
        const callSession = callSessions.get(callId);
        
        if (!callSession) {
            return res.status(404).json({ error: 'Звонок не найден' });
        }
        
        if (callSession.recipient !== rejecter.login) {
            return res.status(403).json({ error: 'Не авторизован для отклонения этого звонка' });
        }
        
        callSession.status = 'rejected';
        
        res.json({ 
            success: true, 
            message: 'Звонок отклонен'
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
        const ender = users.get(decoded.login);
        if (!ender) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const { callId } = req.body;
        const callSession = callSessions.get(callId);
        
        if (!callSession) {
            return res.status(404).json({ error: 'Звонок не найден' });
        }
        
        if (!callSession.participants.includes(ender.login)) {
            return res.status(403).json({ error: 'Не авторизован для завершения этого звонка' });
        }
        
        callSession.status = 'ended';
        
        res.json({ 
            success: true, 
            message: 'Звонок завершен'
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
        const sender = users.get(decoded.login);
        if (!sender) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const { callId, candidate } = req.body;
        const callSession = callSessions.get(callId);
        
        if (!callSession) {
            return res.status(404).json({ error: 'Звонок не найден' });
        }
        
        if (!callSession.participants.includes(sender.login)) {
            return res.status(403).json({ error: 'Не авторизован для этого звонка' });
        }
        
        // Сохраняем ICE кандидата
        if (!callSession.iceCandidates) {
            callSession.iceCandidates = [];
        }
        callSession.iceCandidates.push({
            from: sender.login,
            candidate: candidate,
            timestamp: Date.now()
        });
        
        res.json({ 
            success: true, 
            message: 'ICE кандидат получен'
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
        const user = users.get(decoded.login);
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        const { callId } = req.params;
        const callSession = callSessions.get(callId);
        
        if (!callSession) {
            return res.status(404).json({ error: 'Звонок не найден' });
        }
        
        if (!callSession.participants.includes(user.login)) {
            return res.status(403).json({ error: 'Не авторизован для этого звонка' });
        }
        
        res.json({ 
            success: true, 
            callSession: {
                id: callSession.id,
                status: callSession.status,
                caller: callSession.caller,
                recipient: callSession.recipient,
                withVideo: callSession.withVideo,
                offer: callSession.offer,
                answer: callSession.answer,
                iceCandidates: callSession.iceCandidates || []
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Очистка старых звонков (каждые 5 минут)
setInterval(() => {
    const now = Date.now();
    for (const [callId, session] of callSessions.entries()) {
        if (now - session.timestamp > 300000) { // 5 минут
            callSessions.delete(callId);
        }
    }
}, 300000);

// Создаем тестового пользователя при первом запуске
if (users.size === 0) {
    const { publicKey, privateKey } = generateKeyPair();
    users.set('test', {
        id: 1,
        login: 'test',
        password: '$2b$10$rQZ8K9vX2mN3pL4qR5sT6uV7wX8yZ9aA0bB1cC2dE3fF4gG5hH6iI7jJ8kK9lL0mM1nN2oO3pP4qQ5rR6sS7tT8uU9vV0wW1xX2yY3zZ',
        email: 'test@example.com',
        registration_key: 'test-key',
        nickname: 'Тестовый пользователь',
        theme: 'default',
        primary_color: '#82AAFF',
        level: 0,
        is_banned: 0,
        public_key: publicKey,
        private_key: privateKey
    });
    
    // Создаем второго тестового пользователя
    const { publicKey: publicKey2, privateKey: privateKey2 } = generateKeyPair();
    users.set('test2', {
        id: 2,
        login: 'test2',
        password: '$2b$10$rQZ8K9vX2mN3pL4qR5sT6uV7wX8yZ9aA0bB1cC2dE3fF4gG5hH6iI7jJ8kK9lL0mM1nN2oO3pP4qQ5rR6sS7tT8uU9vV0wW1xX2yY3zZ',
        email: 'test2@example.com',
        registration_key: 'test-key',
        nickname: 'Тестовый пользователь 2',
        theme: 'default',
        primary_color: '#82AAFF',
        level: 0,
        is_banned: 0,
        public_key: publicKey2,
        private_key: privateKey2
    });
    
    // Добавляем их в контакты друг друга
    contacts.set('test', ['test2']);
    contacts.set('test2', ['test']);
}

module.exports = app; 