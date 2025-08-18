const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const app = express();

// Секреты
const JWT_SECRET = process.env.JWT_SECRET || 'mwlauncher-secret-key-2024-fixed';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://secure-chat:iLMQjkum0b8rL5h2@cluster0.0s1thrl.mongodb.net/secure-chat?retryWrites=true&w=majority&appName=Cluster0';

// MongoDB клиент
let db = null;
let client = null;

// In-memory storage для Vercel (вместо SQLite)
const users = new Map();
const messages = new Map();
const contacts = new Map();
const activeConnections = new Map(); // Для отслеживания онлайн статуса

// In-memory fallback для звонков
const inMemoryCalls = new Map();

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

// Подключение к MongoDB
async function connectToMongoDB() {
    try {
        if (!client) {
            console.log('🔗 Попытка подключения к MongoDB...');
            console.log('📡 URI:', MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
            
            client = new MongoClient(MONGODB_URI, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000,
                socketTimeoutMS: 45000,
            });
            
            await client.connect();
            db = client.db('secure-chat');
            await db.admin().ping();
            console.log('✅ Подключение к MongoDB установлено');
        }
        return db;
    } catch (error) {
        console.error('❌ Ошибка подключения к MongoDB:', error.message);
        console.log('⚠️ Используем in-memory storage как fallback');
        return null;
    }
}

// Получение коллекции звонков с fallback
async function getCallsCollection() {
    try {
        const database = await connectToMongoDB();
        if (database) {
            return database.collection('calls');
        } else {
            console.log('⚠️ MongoDB недоступен, используем in-memory storage');
            return null;
        }
    } catch (error) {
        console.error('❌ Ошибка получения коллекции:', error.message);
        return null;
    }
}

// Коллекция буфера ICE кандидатов
async function getIceCollection() {
    try {
        const database = await connectToMongoDB();
        if (database) {
            return database.collection('call_ice');
        }
        return null;
    } catch (error) {
        console.error('❌ Ошибка получения коллекции ICE:', error.message);
        return null;
    }
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
app.post('/call/offer', async (req, res) => {
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
        
        const callId = Date.now().toString();
        
        // Проверяем, что offer имеет правильную структуру
        console.log('📋 Получен offer от клиента:', {
            offerType: typeof offer,
            offerKeys: offer ? Object.keys(offer) : 'null',
            hasType: offer && offer.type,
            hasSdp: offer && offer.sdp,
            typeValue: offer && offer.type,
            sdpLength: offer && offer.sdp ? offer.sdp.length : 0
        });
        
        if (!offer || !offer.type || !offer.sdp) {
            console.error('❌ Неверный формат offer от клиента:', offer);
            console.error('📋 Тип offer:', typeof offer);
            console.error('📋 Содержимое offer:', JSON.stringify(offer, null, 2));
            return res.status(400).json({ error: 'Неверный формат offer' });
        }
        
        console.log('✅ Offer валиден:', {
            type: offer.type,
            sdpLength: offer.sdp ? offer.sdp.length : 0
        });
        
        const callSession = {
            id: callId,
            caller: caller.login,
            recipient: recipient,
            offer: JSON.stringify(offer), // Сохраняем как JSON строку
            withVideo: withVideo,
            status: 'pending',
            participants: [caller.login, recipient],
            timestamp: Date.now(),
            iceCandidates: []
        };
        
        console.log('📋 CallSession для сохранения:', {
            id: callSession.id,
            offerType: typeof callSession.offer,
            offerLength: callSession.offer.length
        });
        
        // Пытаемся сохранить в MongoDB, если не получается - используем in-memory
        const callsCollection = await getCallsCollection();
        if (callsCollection) {
            try {
                // Очищаем старые звонки (старше 10 минут)
                const now = Date.now();
                await callsCollection.deleteMany({ timestamp: { $lt: now - 600000 } });
                
                // Проверяем, не занят ли получатель
                const recipientSession = await callsCollection.findOne({
                    participants: recipient,
                    status: { $in: ['active', 'pending'] },
                    timestamp: { $gt: now - 300000 }
                });
                
                if (recipientSession) {
                    console.log('🚫 Получатель занят:', recipient, 'занят звонком:', recipientSession.id);
                    return res.status(409).json({ error: 'Пользователь занят другим звонком' });
                }
                
                // Проверяем, не инициировал ли звонящий уже звонок
                const callerSession = await callsCollection.findOne({
                    caller: caller.login,
                    status: { $in: ['active', 'pending'] },
                    timestamp: { $gt: now - 300000 }
                });
                
                if (callerSession) {
                    console.log('🚫 Звонящий уже в звонке:', caller.login, 'звонок:', callerSession.id);
                    return res.status(409).json({ error: 'У вас уже есть активный звонок' });
                }
                
                // Сохраняем в MongoDB
                await callsCollection.insertOne(callSession);
                console.log('📞 Создан новый звонок в MongoDB:', callId, 'от', caller.login, 'к', recipient);
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB, используем in-memory:', mongoError.message);
                inMemoryCalls.set(callId, callSession);
                console.log('📞 Создан новый звонок в памяти:', callId, 'от', caller.login, 'к', recipient);
            }
        } else {
            // Используем in-memory storage
            inMemoryCalls.set(callId, callSession);
            console.log('📞 Создан новый звонок в памяти:', callId, 'от', caller.login, 'к', recipient);
        }
        
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
app.post('/call/answer', async (req, res) => {
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
        
        let callSession = null;
        
        // Сначала пытаемся найти в MongoDB
        const callsCollection = await getCallsCollection();
        if (callsCollection) {
            try {
                callSession = await callsCollection.findOne({ id: callId });
                if (callSession) {
                    console.log('📞 Звонок найден в MongoDB:', callId);
                    console.log('📋 Данные звонка из MongoDB:', {
                        id: callSession.id,
                        status: callSession.status,
                        offerType: typeof callSession.offer,
                        offerLength: callSession.offer ? callSession.offer.length : 0
                    });
                }
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB при поиске звонка для ответа:', mongoError.message);
            }
        }
        
        // Если не найден в MongoDB, ищем в памяти
        if (!callSession) {
            callSession = inMemoryCalls.get(callId);
            if (callSession) {
                console.log('📞 Звонок найден в памяти для ответа:', callId);
            }
        }
        
        if (!callSession) {
            console.log('❌ Звонок не найден для принятия:', callId);
            return res.status(404).json({ error: 'Звонок не найден' });
        }
        
        if (callSession.recipient !== answerer.login) {
            console.log('🚫 Пользователь не авторизован для принятия звонка:', answerer.login);
            return res.status(403).json({ error: 'Не авторизован для ответа на этот звонок' });
        }
        
        // Проверяем, что answer имеет правильную структуру
        if (!answer || !answer.type || !answer.sdp) {
            console.error('❌ Неверный формат answer от клиента:', answer);
            return res.status(400).json({ error: 'Неверный формат answer' });
        }
        
        // Обновляем звонок
        if (callsCollection) {
            try {
                await callsCollection.updateOne(
                    { id: callId },
                    { 
                        $set: { 
                            answer: JSON.stringify(answer), // Сохраняем как JSON строку
                            status: 'active'
                        }
                    }
                );
                console.log('✅ Звонок принят в MongoDB:', callId, 'пользователем:', answerer.login);
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB при обновлении звонка:', mongoError.message);
                // Обновляем в памяти как fallback
                callSession.answer = JSON.stringify(answer); // Сохраняем как JSON строку
                callSession.status = 'active';
                inMemoryCalls.set(callId, callSession);
                console.log('✅ Звонок принят в памяти:', callId, 'пользователем:', answerer.login);
            }
        } else {
            // Обновляем в памяти
            callSession.answer = JSON.stringify(answer); // Сохраняем как JSON строку
            callSession.status = 'active';
            inMemoryCalls.set(callId, callSession);
            console.log('✅ Звонок принят в памяти:', callId, 'пользователем:', answerer.login);
        }
        
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
app.post('/call/reject', async (req, res) => {
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
        console.log('📞 Запрос на отклонение звонка:', callId, 'от пользователя:', rejecter.login);
        
        let callSession = null;
        
        // Сначала пытаемся найти в MongoDB
        const callsCollection = await getCallsCollection();
        if (callsCollection) {
            try {
                callSession = await callsCollection.findOne({ id: callId });
                if (callSession) {
                    console.log('📞 Звонок найден в MongoDB для отклонения:', callId);
                }
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB при поиске звонка для отклонения:', mongoError.message);
            }
        }
        
        // Если не найден в MongoDB, ищем в памяти
        if (!callSession) {
            callSession = inMemoryCalls.get(callId);
            if (callSession) {
                console.log('📞 Звонок найден в памяти для отклонения:', callId);
            }
        }
        
        if (!callSession) {
            console.log('❌ Звонок не найден для отклонения:', callId);
            return res.status(404).json({ error: 'Звонок не найден' });
        }
        
        if (callSession.recipient !== rejecter.login) {
            console.log('🚫 Пользователь не авторизован для отклонения звонка:', rejecter.login);
            return res.status(403).json({ error: 'Не авторизован для отклонения этого звонка' });
        }
        
        // Обновляем статус в MongoDB
        if (callsCollection) {
            try {
                await callsCollection.updateOne(
                    { id: callId },
                    { $set: { status: 'rejected' } }
                );
                console.log('✅ Звонок отклонен в MongoDB:', callId, 'пользователем:', rejecter.login);
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB при отклонении звонка:', mongoError.message);
                // Обновляем в памяти как fallback
                callSession.status = 'rejected';
                inMemoryCalls.set(callId, callSession);
                console.log('✅ Звонок отклонен в памяти:', callId, 'пользователем:', rejecter.login);
            }
        } else {
            // Обновляем в памяти
            callSession.status = 'rejected';
            inMemoryCalls.set(callId, callSession);
            console.log('✅ Звонок отклонен в памяти:', callId, 'пользователем:', rejecter.login);
        }
        
        res.json({ 
            success: true, 
            message: 'Звонок отклонен'
        });
    } catch (error) {
        console.error('❌ Ошибка отклонения звонка:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Завершение звонка
app.post('/call/end', async (req, res) => {
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
        console.log('📞 Запрос на завершение звонка:', callId, 'от пользователя:', ender.login);
        
        let callSession = null;
        
        // Сначала пытаемся найти в MongoDB
        const callsCollection = await getCallsCollection();
        if (callsCollection) {
            try {
                callSession = await callsCollection.findOne({ id: callId });
                if (callSession) {
                    console.log('📞 Звонок найден в MongoDB для завершения:', callId);
                }
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB при поиске звонка для завершения:', mongoError.message);
            }
        }
        
        // Если не найден в MongoDB, ищем в памяти
        if (!callSession) {
            callSession = inMemoryCalls.get(callId);
            if (callSession) {
                console.log('📞 Звонок найден в памяти для завершения:', callId);
            }
        }
        
        if (!callSession) {
            console.log('❌ Звонок не найден для завершения:', callId);
            return res.status(404).json({ error: 'Звонок не найден' });
        }
        
        if (!callSession.participants.includes(ender.login)) {
            console.log('🚫 Пользователь не авторизован для завершения звонка:', ender.login);
            return res.status(403).json({ error: 'Не авторизован для завершения этого звонка' });
        }
        
        // Обновляем статус в MongoDB
        if (callsCollection) {
            try {
                await callsCollection.updateOne(
                    { id: callId },
                    { $set: { status: 'ended' } }
                );
                console.log('✅ Звонок завершен в MongoDB:', callId, 'пользователем:', ender.login);
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB при завершении звонка:', mongoError.message);
                // Обновляем в памяти как fallback
                callSession.status = 'ended';
                inMemoryCalls.set(callId, callSession);
                console.log('✅ Звонок завершен в памяти:', callId, 'пользователем:', ender.login);
            }
        } else {
            // Обновляем в памяти
            callSession.status = 'ended';
            inMemoryCalls.set(callId, callSession);
            console.log('✅ Звонок завершен в памяти:', callId, 'пользователем:', ender.login);
        }
        
        res.json({ 
            success: true, 
            message: 'Звонок завершен'
        });
    } catch (error) {
        console.error('❌ Ошибка завершения звонка:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ICE кандидаты
app.post('/call/ice-candidate', async (req, res) => {
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
        
        let callSession = null;
        let storedIn = 'memory';
        
        // Сначала пытаемся найти в MongoDB
        const callsCollection = await getCallsCollection();
        if (callsCollection) {
            try {
                callSession = await callsCollection.findOne({ id: callId });
                if (callSession) {
                    storedIn = 'mongo';
                }
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB при поиске звонка для ICE:', mongoError.message);
            }
        }
        
        // Если не найден в MongoDB, ищем в памяти
        if (!callSession) {
            callSession = inMemoryCalls.get(callId);
            storedIn = 'memory';
        }
        
        // Если звонок не найден (другой инстанс/холодный старт), все равно буферизуем ICE
        // Проверку авторизации пропускаем в этом редком случае, чтобы не ломать соединение
        // На стадии потребления кандидатов будет валидация по участникам
        
        // Добавляем ICE кандидата (буферизуем в отдельной коллекции для надежности)
        const iceCandidate = {
            callId,
            from: sender.login,
            candidate,
            timestamp: Date.now(),
            processed: false
        };

        const iceCollection = await getIceCollection();
        if (iceCollection) {
            try {
                await iceCollection.insertOne(iceCandidate);
                console.log('ICE кандидат сохранен в MongoDB буфере от:', sender.login, 'для звонка:', callId, 'тип:', candidate.type);
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB при буферизации ICE кандидата:', mongoError.message);
                // Fallback: сохраняем в памяти внутри callSession
                if (!callSession.iceCandidates) {
                    callSession.iceCandidates = [];
                }
                callSession.iceCandidates.push(iceCandidate);
                inMemoryCalls.set(callId, callSession);
                console.log('ICE кандидат сохранен в памяти (fallback) от:', sender.login, 'для звонка:', callId, 'тип:', candidate.type);
            }
        } else {
            if (!callSession.iceCandidates) {
                callSession.iceCandidates = [];
            }
            callSession.iceCandidates.push(iceCandidate);
            inMemoryCalls.set(callId, callSession);
            console.log('ICE кандидат сохранен в памяти от:', sender.login, 'для звонка:', callId, 'тип:', candidate.type);
        }
        
        res.json({ 
            success: true, 
            message: 'ICE кандидат получен'
        });
    } catch (error) {
        console.error('Ошибка обработки ICE кандидата:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение входящих звонков
app.get('/call/incoming', async (req, res) => {
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
        
        console.log('🔍 Запрос входящих звонков от пользователя:', user.login);
        
        let incomingCalls = [];
        
        // Сначала пытаемся найти в MongoDB
        const callsCollection = await getCallsCollection();
        if (callsCollection) {
            try {
                const now = Date.now();
                const mongoCalls = await callsCollection.find({
                    recipient: user.login,
                    status: 'pending',
                    timestamp: { $gt: now - 300000 } // Звонки за последние 5 минут
                }).toArray();
                
                incomingCalls = mongoCalls.map(call => ({
                    id: call.id,
                    caller: call.caller,
                    offer: call.offer,
                    withVideo: call.withVideo,
                    timestamp: call.timestamp
                }));
                
                console.log('📞 Найдено входящих звонков в MongoDB:', incomingCalls.length);
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB при поиске входящих звонков:', mongoError.message);
            }
        }
        
        // Также проверяем в памяти
        for (const [callId, callSession] of inMemoryCalls.entries()) {
            if (callSession.recipient === user.login && 
                callSession.status === 'pending' && 
                callSession.timestamp > Date.now() - 300000) {
                
                // Проверяем, не дублируется ли уже в списке
                if (!incomingCalls.find(call => call.id === callId)) {
                    incomingCalls.push({
                        id: callSession.id,
                        caller: callSession.caller,
                        offer: callSession.offer,
                        withVideo: callSession.withVideo,
                        timestamp: callSession.timestamp
                    });
                }
            }
        }
        
        console.log('📞 Всего входящих звонков:', incomingCalls.length);
        
        res.json(incomingCalls);
    } catch (error) {
        console.error('❌ Ошибка получения входящих звонков:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение статуса звонка
app.get('/call/status/:callId', async (req, res) => {
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
        
        let callSession = null;
        
        // Сначала пытаемся найти в MongoDB
        const callsCollection = await getCallsCollection();
        if (callsCollection) {
            try {
                callSession = await callsCollection.findOne({ id: callId });
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB при поиске звонка:', mongoError.message);
            }
        }
        
        // Если не найден в MongoDB, ищем в памяти
        if (!callSession) {
            callSession = inMemoryCalls.get(callId);
            if (callSession) {
                console.log('📞 Звонок найден в памяти:', callId);
            }
        }
        
        if (!callSession) {
            // Возвращаем pending, чтобы клиенты не роняли соединение
            console.log('ℹ️ Звонок не найден для статуса, возвращаем pending:', callId);
            return res.json({ success: true, callSession: { id: callId, status: 'pending', iceCandidates: [] } });
        }
        
        if (!callSession.participants.includes(user.login)) {
            console.log('🚫 Пользователь не авторизован для звонка:', user.login);
            return res.status(403).json({ error: 'Не авторизован для этого звонка' });
        }
        
        console.log('✅ Статус звонка найден:', callSession.status);
        
        // Собираем также буферизированные ICE кандидаты для этого звонка и очищаем их
        let bufferedIce = [];
        try {
            const iceCollection = await getIceCollection();
            if (iceCollection) {
                bufferedIce = await iceCollection.find({ callId }).toArray();
                if (bufferedIce.length > 0) {
                    await iceCollection.deleteMany({ callId });
                    console.log('📦 Выдано и очищено буферизированных ICE кандидатов:', bufferedIce.length, 'для', callId);
                }
            }
        } catch (e) {
            console.error('❌ Ошибка выборки буферизированных ICE кандидатов:', e.message);
        }

        res.json({ 
            success: true, 
            callSession: {
                id: callSession.id,
                status: callSession.status,
                caller: callSession.caller,
                recipient: callSession.recipient,
                withVideo: callSession.withVideo,
                offer: callSession.offer ? (() => {
                    try {
                        const parsed = JSON.parse(callSession.offer);
                        // Дополнительная проверка структуры
                        if (parsed && parsed.type && parsed.sdp) {
                            console.log('✅ Offer успешно распарсен для API:', parsed.type);
                            return parsed;
                        } else {
                            console.error('❌ Неверная структура offer после парсинга:', {
                                hasParsed: !!parsed,
                                hasType: !!(parsed && parsed.type),
                                hasSdp: !!(parsed && parsed.sdp),
                                parsed: parsed
                            });
                            return null;
                        }
                    } catch (e) {
                        console.error('❌ Ошибка парсинга offer:', e);
                        console.error('📋 Сырые данные offer:', callSession.offer);
                        return null;
                    }
                })() : null,
                answer: callSession.answer ? (() => {
                    try {
                        const parsed = JSON.parse(callSession.answer);
                        // Дополнительная проверка структуры
                        if (parsed && parsed.type && parsed.sdp) {
                            return parsed;
                        } else {
                            console.error('❌ Неверная структура answer после парсинга:', parsed);
                            return null;
                        }
                    } catch (e) {
                        console.error('❌ Ошибка парсинга answer:', e);
                        return null;
                    }
                })() : null,
                iceCandidates: [
                    ...((callSession.iceCandidates) ? callSession.iceCandidates : []),
                    ...bufferedIce.map(item => ({ from: item.from, candidate: item.candidate, timestamp: item.timestamp, processed: false }))
                ]
            }
        });
    } catch (error) {
        console.error('❌ Ошибка получения статуса звонка:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение входящих звонков для пользователя
app.get('/call/incoming', async (req, res) => {
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
        
        let userCalls = [];
        
        // Сначала пытаемся получить из MongoDB
        const callsCollection = await getCallsCollection();
        if (callsCollection) {
            try {
                userCalls = await callsCollection.find({
                    recipient: user.login,
                    status: 'pending'
                }).toArray();
            } catch (mongoError) {
                console.error('❌ Ошибка MongoDB при получении входящих звонков:', mongoError.message);
            }
        }
        
        // Добавляем звонки из памяти
        for (const [callId, callSession] of inMemoryCalls.entries()) {
            if (callSession.recipient === user.login && callSession.status === 'pending') {
                userCalls.push(callSession);
            }
        }
        
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

// Принудительная очистка всех звонков (для отладки)
app.post('/call/clear-all', async (req, res) => {
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
        
        let deletedCount = 0;
        
        // Очищаем MongoDB
        const callsCollection = await getCallsCollection();
        if (callsCollection) {
            try {
                const result = await callsCollection.deleteMany({});
                deletedCount += result.deletedCount;
            } catch (mongoError) {
                console.error('❌ Ошибка очистки MongoDB:', mongoError.message);
            }
        }
        
        // Очищаем память
        const memoryCount = inMemoryCalls.size;
        inMemoryCalls.clear();
        deletedCount += memoryCount;
        
        console.log(`Пользователь ${user.login} очистил все звонки (${deletedCount} шт.)`);
        
        res.json({ success: true, message: `Очищено ${deletedCount} звонков` });
    } catch (error) {
        console.error('Ошибка очистки звонков:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

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

// Инициализируем MongoDB при запуске
connectToMongoDB().then(() => {
    console.log('🚀 Сервер готов к работе с MongoDB (или in-memory fallback)');
}).catch(error => {
    console.error('❌ Ошибка инициализации MongoDB:', error);
});

// Очистка старых звонков (каждые 10 минут)
setInterval(async () => {
    try {
        const callsCollection = await getCallsCollection();
        if (callsCollection) {
            const now = Date.now();
            const result = await callsCollection.deleteMany({ 
                timestamp: { $lt: now - 1800000 } // 30 минут
            });
            if (result.deletedCount > 0) {
                console.log(`🧹 Автоматически очищено ${result.deletedCount} старых звонков из MongoDB`);
            }
        }
        
        // Также очищаем in-memory звонки
        const now = Date.now();
        let deletedInMemory = 0;
        for (const [callId, callSession] of inMemoryCalls.entries()) {
            if (now - callSession.timestamp > 1800000) { // 30 минут
                inMemoryCalls.delete(callId);
                deletedInMemory++;
            }
        }
        if (deletedInMemory > 0) {
            console.log(`🧹 Автоматически очищено ${deletedInMemory} старых звонков из памяти`);
        }
    } catch (error) {
        console.error('❌ Ошибка автоматической очистки звонков:', error);
    }
}, 600000); // Каждые 10 минут

module.exports = app; 
