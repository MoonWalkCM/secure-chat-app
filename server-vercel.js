const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Секреты
const JWT_SECRET = process.env.JWT_SECRET || 'mwlauncher-secret-key-2024-fixed';

// In-memory storage для Vercel (вместо SQLite)
const users = new Map();
const messages = new Map();
const contacts = new Map();
const activeConnections = new Map(); // Для отслеживания онлайн статуса
const callSessions = new Map(); // Для управления звонками
const socketUsers = new Map(); // Для связи socket.id с пользователями

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
    console.log('Создаем тестовых пользователей...');
    
    const { publicKey: publicKey1, privateKey: privateKey1 } = generateKeyPair();
    const { publicKey: publicKey2, privateKey: privateKey2 } = generateKeyPair();
    const { publicKey: publicKey3, privateKey: privateKey3 } = generateKeyPair();
    
    const hashedPassword = await bcrypt.hash('test', 10);
    
    // Тестовый пользователь 1
    users.set('test', {
        id: 1,
        login: 'test',
        password: hashedPassword,
        email: 'test@example.com',
        registration_key: 'test-key',
        nickname: 'Тестовый пользователь',
        theme: 'default',
        primary_color: '#82AAFF',
        level: 0,
        is_banned: 0,
        public_key: publicKey1,
        private_key: privateKey1
    });
    
    // Тестовый пользователь 2
    users.set('test2', {
        id: 2,
        login: 'test2',
        password: hashedPassword,
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
    
    // Тестовый пользователь 3 (админ)
    users.set('admin', {
        id: 3,
        login: 'admin',
        password: hashedPassword,
        email: 'admin@example.com',
        registration_key: 'admin-key',
        nickname: 'Администратор',
        theme: 'dark',
        primary_color: '#FF6B6B',
        level: 10,
        is_banned: 0,
        public_key: publicKey3,
        private_key: privateKey3
    });
    
    // Добавляем их в контакты друг друга
    contacts.set('test', ['test2', 'admin']);
    contacts.set('test2', ['test', 'admin']);
    contacts.set('admin', ['test', 'test2']);
    
    console.log('Тестовые пользователи созданы!');
    console.log('Доступные пользователи:', Array.from(users.keys()));
    console.log('Все пароли: test');
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
        
        if (users.has(login)) {
            console.log('Пользователь уже существует:', login);
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
        console.log('Пользователь создан:', login);
        console.log('Всего пользователей:', users.size);
        
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
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        
        console.log('Попытка входа:', login);
        console.log('Всего пользователей в памяти:', users.size);
        console.log('Доступные пользователи:', Array.from(users.keys()));
        
        const user = users.get(login);
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
        activeConnections.set(login, { timestamp: Date.now() });
        
        console.log('Успешный вход:', login);
        
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
        
        // Очищаем только очень старые звонки (старше 30 минут)
        const now = Date.now();
        for (const [callId, session] of callSessions.entries()) {
            if (now - session.timestamp > 1800000) { // 30 минут
                console.log('🗑️ Удаляем очень старый звонок:', callId);
                callSessions.delete(callId);
            }
        }
        
        // Проверяем, не занят ли получатель
        const recipientSession = Array.from(callSessions.values()).find(session => 
            session.participants.includes(recipient) && 
            (session.status === 'active' || session.status === 'pending') &&
            (now - session.timestamp) < 300000 // Только звонки младше 5 минут
        );
        
        if (recipientSession) {
            console.log('🚫 Получатель занят:', recipient, 'занят звонком:', recipientSession.id);
            return res.status(409).json({ error: 'Пользователь занят другим звонком' });
        }
        
        // Проверяем, не инициировал ли звонящий уже звонок
        const callerSession = Array.from(callSessions.values()).find(session => 
            session.caller === caller.login && 
            (session.status === 'active' || session.status === 'pending') &&
            (now - session.timestamp) < 300000 // Только звонки младше 5 минут
        );
        
        if (callerSession) {
            console.log('🚫 Звонящий уже в звонке:', caller.login, 'звонок:', callerSession.id);
            return res.status(409).json({ error: 'У вас уже есть активный звонок' });
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
            timestamp: Date.now(),
            iceCandidates: []
        };
        
        callSessions.set(callId, callSession);
        console.log('📞 Создан новый звонок:', callId, 'от', caller.login, 'к', recipient);
        console.log('📊 Всего звонков в памяти:', callSessions.size);
        
        res.json({ 
            success: true, 
            callId: callId,
            message: 'Звонок инициирован'
        });
    } catch (error) {
        console.error('❌ Ошибка инициации звонка:', error);
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
        console.log('📞 Запрос на принятие звонка:', callId, 'от пользователя:', answerer.login);
        
        const callSession = callSessions.get(callId);
        
        if (!callSession) {
            console.log('❌ Звонок не найден для принятия:', callId);
            console.log('📋 Доступные звонки:', Array.from(callSessions.keys()));
            return res.status(404).json({ error: 'Звонок не найден' });
        }
        
        if (callSession.recipient !== answerer.login) {
            console.log('🚫 Пользователь не авторизован для принятия звонка:', answerer.login);
            return res.status(403).json({ error: 'Не авторизован для ответа на этот звонок' });
        }
        
        callSession.answer = answer;
        callSession.status = 'active';
        console.log('✅ Звонок принят:', callId, 'пользователем:', answerer.login);
        console.log('📊 Всего звонков в памяти:', callSessions.size);
        
        res.json({ 
            success: true, 
            message: 'Звонок принят'
        });
    } catch (error) {
        console.error('❌ Ошибка ответа на звонок:', error);
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
        console.log('Звонок отклонен:', callId, 'пользователем:', rejecter.login);
        
        res.json({ 
            success: true, 
            message: 'Звонок отклонен'
        });
    } catch (error) {
        console.error('Ошибка отклонения звонка:', error);
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
            console.log('Звонок не найден для завершения:', callId);
            return res.status(404).json({ error: 'Звонок не найден' });
        }
        
        if (!callSession.participants.includes(ender.login)) {
            return res.status(403).json({ error: 'Не авторизован для завершения этого звонка' });
        }
        
        callSession.status = 'ended';
        console.log('Звонок завершен:', callId, 'пользователем:', ender.login);
        
        res.json({ 
            success: true, 
            message: 'Звонок завершен'
        });
    } catch (error) {
        console.error('Ошибка завершения звонка:', error);
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
            timestamp: Date.now(),
            processed: false
        });
        
        console.log('ICE кандидат получен от:', sender.login, 'для звонка:', callId, 'тип:', candidate.type);
        
        res.json({ 
            success: true, 
            message: 'ICE кандидат получен'
        });
    } catch (error) {
        console.error('Ошибка обработки ICE кандидата:', error);
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
        console.log('🔍 Запрос статуса звонка:', callId, 'от пользователя:', user.login);
        console.log('📊 Всего звонков в памяти:', callSessions.size);
        
        const callSession = callSessions.get(callId);
        
        if (!callSession) {
            console.log('❌ Звонок не найден для статуса:', callId);
            console.log('📋 Доступные звонки:', Array.from(callSessions.keys()));
            return res.status(404).json({ error: 'Звонок не найден' });
        }
        
        if (!callSession.participants.includes(user.login)) {
            console.log('🚫 Пользователь не авторизован для звонка:', user.login);
            return res.status(403).json({ error: 'Не авторизован для этого звонка' });
        }
        
        console.log('✅ Статус звонка найден:', callSession.status);
        
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
        console.error('❌ Ошибка получения статуса звонка:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение входящих звонков для пользователя
app.get('/call/incoming', (req, res) => {
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
        
        // Получаем все активные звонки для пользователя
        const userCalls = Array.from(callSessions.values()).filter(session => 
            session.recipient === user.login && session.status === 'pending'
        );
        
        if (userCalls.length > 0) {
            console.log('📞 Входящие звонки для', user.login, ':', userCalls.length);
            console.log('📋 ID звонков:', userCalls.map(call => call.id));
        }
        
        res.json(userCalls);
    } catch (error) {
        console.error('❌ Ошибка получения входящих звонков:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Очистка старых звонков (каждые 30 минут)
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [callId, session] of callSessions.entries()) {
        // Удаляем только очень старые звонки (старше 60 минут)
        if (now - session.timestamp > 3600000) { // 60 минут
            callSessions.delete(callId);
            cleanedCount++;
            console.log('🗑️ Автоматически удален старый звонок:', callId);
        }
    }
    if (cleanedCount > 0) {
        console.log(`🧹 Автоматически очищено ${cleanedCount} старых звонков`);
    }
}, 1800000); // Каждые 30 минут

// Принудительная очистка всех звонков (для отладки)
app.post('/call/clear-all', (req, res) => {
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
        
        const count = callSessions.size;
        callSessions.clear();
        console.log(`Пользователь ${user.login} очистил все звонки (${count} шт.)`);
        
        res.json({ success: true, message: `Очищено ${count} звонков` });
    } catch (error) {
        console.error('Ошибка очистки звонков:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение информации о звонках (для отладки)
app.get('/call/debug', (req, res) => {
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
        
        const calls = Array.from(callSessions.values()).map(session => ({
            id: session.id,
            caller: session.caller,
            recipient: session.recipient,
            status: session.status,
            timestamp: session.timestamp,
            age: Date.now() - session.timestamp
        }));
        
        res.json({ 
            totalCalls: callSessions.size,
            calls: calls
        });
    } catch (error) {
        console.error('Ошибка получения информации о звонках:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// === ДОПОЛНИТЕЛЬНЫЕ ЭНДПОИНТЫ ===

// Поиск пользователей по никнейму
app.get('/search-user', (req, res) => {
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
        
        const { nickname } = req.query;
        if (!nickname) {
            return res.status(400).json({ error: 'Никнейм не указан' });
        }
        
        const searchResults = [];
        for (const [login, userData] of users.entries()) {
            if (login !== decoded.login && // Исключаем себя
                (userData.nickname?.toLowerCase().includes(nickname.toLowerCase()) ||
                 login.toLowerCase().includes(nickname.toLowerCase()))) {
                searchResults.push({
                    login: userData.login,
                    nickname: userData.nickname || userData.login,
                    email: userData.email
                });
            }
        }
        
        res.json(searchResults);
    } catch (error) {
        console.error('Ошибка поиска пользователей:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удаление контакта по логину
app.delete('/contacts/:login', (req, res) => {
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
        
        const contactLogin = req.params.login;
        
        if (contacts.has(decoded.login)) {
            const userContacts = contacts.get(decoded.login);
            const index = userContacts.indexOf(contactLogin);
            if (index > -1) {
                userContacts.splice(index, 1);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка удаления контакта:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Отправка жалобы на пользователя
app.post('/report/:login', (req, res) => {
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
        
        const reportedLogin = req.params.login;
        const { reason } = req.body;
        
        if (!users.has(reportedLogin)) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        // Здесь можно добавить логику сохранения жалоб
        console.log(`Жалоба от ${decoded.login} на ${reportedLogin}: ${reason}`);
        
        res.json({ success: true, message: 'Жалоба отправлена' });
    } catch (error) {
        console.error('Ошибка отправки жалобы:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновление онлайн статуса (для поддержания активности)
app.post('/ping', (req, res) => {
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
        
        // Обновляем время последней активности
        activeConnections.set(decoded.login, { timestamp: Date.now() });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка ping:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Создаем тестовых пользователей при первом запуске
createTestUsers();

module.exports = server; 
