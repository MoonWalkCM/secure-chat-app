// Глобальные переменные
let currentUser = null;
let currentCall = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let isMuted = false;
let isVideoEnabled = true;
let isFullscreen = false;
let currentCamera = 'user'; // 'user' или 'environment'
let socket = null;
let pingInterval = null;

// Элементы DOM
const contactsList = document.getElementById('contactsList');
const callInterface = document.getElementById('callInterface');
const contactsSection = document.getElementById('contactsSection');
const searchInput = document.getElementById('searchInput');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callStatus = document.getElementById('callStatus');
const remoteVideoLabel = document.getElementById('remoteVideoLabel');

// Кнопки управления
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const flipCameraBtn = document.getElementById('flipCameraBtn');
const endCallBtn = document.getElementById('endCallBtn');

// Входящий звонок
const incomingCallOverlay = document.getElementById('incomingCallOverlay');
const incomingCallerName = document.getElementById('incomingCallerName');
const incomingCallType = document.getElementById('incomingCallType');
const acceptCallBtn = document.getElementById('acceptCallBtn');
const rejectCallBtn = document.getElementById('rejectCallBtn');

// Полноэкранный режим
const fullscreenOverlay = document.getElementById('fullscreenOverlay');
const fullscreenRemoteVideo = document.getElementById('fullscreenRemoteVideo');
const fullscreenLocalVideo = document.getElementById('fullscreenLocalVideo');
const fsMuteBtn = document.getElementById('fsMuteBtn');
const fsVideoBtn = document.getElementById('fsVideoBtn');
const fsFlipCameraBtn = document.getElementById('fsFlipCameraBtn');
const fsEndCallBtn = document.getElementById('fsEndCallBtn');
const exitFullscreenBtn = document.getElementById('exitFullscreenBtn');

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎥 Инициализация системы видеозвонков');
    initializeApp();
    setupEventListeners();
});

// Основная инициализация
async function initializeApp() {
    try {
        // Проверяем авторизацию
        const token = localStorage.getItem('jwtToken');
        if (!token) {
            window.location.href = '/';
            return;
        }

        // Получаем данные пользователя
        const userData = localStorage.getItem('userData');
        if (userData) {
            currentUser = JSON.parse(userData);
            console.log('👤 Текущий пользователь:', currentUser.login);
        }

        // Инициализируем WebSocket
        initializeWebSocket(token);

        // Загружаем контакты
        await loadContacts();
        
        // Запускаем ping
        startPingInterval();
        
        console.log('✅ Приложение инициализировано');
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
    }
}

// Инициализация WebSocket
function initializeWebSocket(token) {
    // Определяем URL для WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('🔌 Подключаемся к WebSocket:', wsUrl);
    
    socket = io(wsUrl);
    
    // Обработчики WebSocket событий
    socket.on('connect', () => {
        console.log('✅ WebSocket подключен');
        // Аутентифицируем пользователя
        socket.emit('authenticate', { token: token });
    });
    
    socket.on('disconnect', () => {
        console.log('❌ WebSocket отключен');
    });
    
    socket.on('connect_error', (error) => {
        console.error('❌ Ошибка подключения WebSocket:', error);
    });
    
    // Обработчики звонков
    socket.on('call:incoming', (data) => {
        console.log('📞 Входящий звонок через WebSocket:', data);
        showIncomingCall(data);
    });
    
    socket.on('call:offered', (data) => {
        console.log('✅ Звонок предложен:', data);
        currentCall = {
            id: data.callId,
            status: 'pending'
        };
        showCallInterface();
        updateCallStatus('Ожидание ответа...');
    });
    
    socket.on('call:answered', (data) => {
        console.log('✅ Звонок принят:', data);
        if (peerConnection && peerConnection.signalingState !== 'stable') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        updateCallStatus('Подключено');
    });
    
    socket.on('call:rejected', (data) => {
        console.log('❌ Звонок отклонен:', data);
        endCall();
    });
    
    socket.on('call:ended', (data) => {
        console.log('📞 Звонок завершен:', data);
        endCall();
    });
    
    socket.on('call:ice-candidate', (data) => {
        console.log('🧊 Получен ICE кандидат:', data);
        if (peerConnection && data.from !== currentUser.login) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    });
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Поиск контактов
    searchInput?.addEventListener('input', filterContacts);
    
    // Кнопки управления звонком
    muteBtn?.addEventListener('click', toggleMute);
    videoBtn?.addEventListener('click', toggleVideo);
    fullscreenBtn?.addEventListener('click', enterFullscreen);
    flipCameraBtn?.addEventListener('click', flipCamera);
    endCallBtn?.addEventListener('click', endCall);
    
    // Входящий звонок
    acceptCallBtn?.addEventListener('click', acceptIncomingCall);
    rejectCallBtn?.addEventListener('click', rejectIncomingCall);
    
    // Полноэкранный режим
    fsMuteBtn?.addEventListener('click', toggleMute);
    fsVideoBtn?.addEventListener('click', toggleVideo);
    fsFlipCameraBtn?.addEventListener('click', flipCamera);
    fsEndCallBtn?.addEventListener('click', endCall);
    exitFullscreenBtn?.addEventListener('click', exitFullscreen);
    
    // Выход
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

// Загрузка контактов
async function loadContacts() {
    try {
        const response = await fetch('/contacts', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки контактов');
        }
        
        const contacts = await response.json();
        displayContacts(contacts);
        console.log('📋 Контакты загружены:', contacts.length);
    } catch (error) {
        console.error('❌ Ошибка загрузки контактов:', error);
        contactsList.innerHTML = '<div class="error">Ошибка загрузки контактов</div>';
    }
}

// Отображение контактов
function displayContacts(contacts) {
    if (!contactsList) return;
    
    contactsList.innerHTML = '';
    
    if (contacts.length === 0) {
        contactsList.innerHTML = '<div class="no-contacts">Нет контактов для звонков</div>';
        return;
    }
    
    contacts.forEach(contact => {
        const contactElement = createContactElement(contact);
        contactsList.appendChild(contactElement);
    });
}

// Создание элемента контакта
function createContactElement(contact) {
    const div = document.createElement('div');
    div.className = 'contact-item';
    
    const statusClass = contact.is_online ? 'online' : 'offline';
    const statusText = contact.is_online ? '🟢 Онлайн' : '🔴 Оффлайн';
    
    div.innerHTML = `
        <div class="contact-info">
            <div class="contact-name">${contact.nickname || contact.login}</div>
            <div class="contact-status ${statusClass}">${statusText}</div>
        </div>
        <div class="contact-actions">
            <button class="call-btn video-call" onclick="startVideoCall('${contact.login}')" title="Видеозвонок">
                📹
            </button>
            <button class="call-btn audio-call" onclick="startAudioCall('${contact.login}')" title="Аудиозвонок">
                🎤
            </button>
        </div>
    `;
    
    return div;
}

// Фильтрация контактов
function filterContacts() {
    const searchTerm = searchInput.value.toLowerCase();
    const contactItems = contactsList.querySelectorAll('.contact-item');
    
    contactItems.forEach(item => {
        const contactName = item.querySelector('.contact-name').textContent.toLowerCase();
        if (contactName.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Начало видеозвонка
async function startVideoCall(recipient) {
    try {
        console.log('🎥 Начинаем видеозвонок к', recipient);
        
        // Запрашиваем медиа потоки
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            }
        });
        
        localStream = stream;
        localVideo.srcObject = stream;
        
        // Создаем WebRTC соединение
        await createPeerConnection();
        
        // Добавляем локальные треки
        stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream);
        });
        
        // Создаем offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Отправляем offer через WebSocket
        socket.emit('call:offer', {
            recipient: recipient,
            offer: offer,
            withVideo: true
        });
        
        console.log('✅ Видеозвонок инициирован через WebSocket');
        
    } catch (error) {
        console.error('❌ Ошибка начала видеозвонка:', error);
        alert('Ошибка начала видеозвонка: ' + error.message);
    }
}

// Начало аудиозвонка
async function startAudioCall(recipient) {
    try {
        console.log('🎤 Начинаем аудиозвонок к', recipient);
        
        // Запрашиваем только аудио
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });
        
        localStream = stream;
        localVideo.srcObject = stream;
        
        // Создаем WebRTC соединение
        await createPeerConnection();
        
        // Добавляем аудио трек
        const audioTrack = stream.getAudioTracks()[0];
        peerConnection.addTrack(audioTrack, stream);
        
        // Создаем offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Отправляем offer через WebSocket
        socket.emit('call:offer', {
            recipient: recipient,
            offer: offer,
            withVideo: false
        });
        
        console.log('✅ Аудиозвонок инициирован через WebSocket');
        
    } catch (error) {
        console.error('❌ Ошибка начала аудиозвонка:', error);
        alert('Ошибка начала аудиозвонка: ' + error.message);
    }
}

// Создание WebRTC соединения
async function createPeerConnection() {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
    };
    
    peerConnection = new RTCPeerConnection(configuration);
    
    // Обработчики событий
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && currentCall) {
            socket.emit('call:ice-candidate', {
                callId: currentCall.id,
                candidate: event.candidate
            });
        }
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('🔗 Состояние соединения:', peerConnection.connectionState);
        updateCallStatus(peerConnection.connectionState);
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('🧊 Состояние ICE:', peerConnection.iceConnectionState);
    };
    
    peerConnection.ontrack = (event) => {
        console.log('📺 Получен удаленный поток');
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
        fullscreenRemoteVideo.srcObject = remoteStream;
        
        // Принудительное воспроизведение
        remoteVideo.play().catch(e => console.log('⚠️ Ошибка воспроизведения:', e));
        fullscreenRemoteVideo.play().catch(e => console.log('⚠️ Ошибка полноэкранного воспроизведения:', e));
    };
    
    console.log('🔗 WebRTC соединение создано');
}

// Показ интерфейса звонка
function showCallInterface() {
    contactsSection.style.display = 'none';
    callInterface.style.display = 'flex';
    updateCallStatus('Подключение...');
}

// Скрытие интерфейса звонка
function hideCallInterface() {
    contactsSection.style.display = 'block';
    callInterface.style.display = 'none';
    currentCall = null;
}

// Обновление статуса звонка
function updateCallStatus(status) {
    if (callStatus) {
        callStatus.querySelector('.status-text').textContent = status;
    }
}

// Переключение микрофона
function toggleMute() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        isMuted = !audioTrack.enabled;
        
        // Обновляем кнопки
        const muteIcon = isMuted ? '🔇' : '🎤';
        muteBtn.innerHTML = `<span class="btn-icon">${muteIcon}</span>`;
        fsMuteBtn.innerHTML = `<span class="btn-icon">${muteIcon}</span>`;
        
        // Обновляем стили
        muteBtn.classList.toggle('active', isMuted);
        fsMuteBtn.classList.toggle('active', isMuted);
        
        console.log(isMuted ? '🔇 Микрофон отключен' : '🎤 Микрофон включен');
    }
}

// Переключение камеры
function toggleVideo() {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        isVideoEnabled = videoTrack.enabled;
        
        // Обновляем кнопки
        const videoIcon = isVideoEnabled ? '📹' : '🚫';
        videoBtn.innerHTML = `<span class="btn-icon">${videoIcon}</span>`;
        fsVideoBtn.innerHTML = `<span class="btn-icon">${videoIcon}</span>`;
        
        // Обновляем стили
        videoBtn.classList.toggle('active', !isVideoEnabled);
        fsVideoBtn.classList.toggle('active', !isVideoEnabled);
        
        console.log(isVideoEnabled ? '📹 Камера включена' : '🚫 Камера отключена');
    }
}

// Переворот камеры
async function flipCamera() {
    if (!localStream) return;
    
    try {
        console.log('🔄 Переворачиваем камеру');
        
        // Останавливаем текущий видео трек
        const oldVideoTrack = localStream.getVideoTracks()[0];
        if (oldVideoTrack) {
            oldVideoTrack.stop();
        }
        
        // Переключаем камеру
        currentCamera = currentCamera === 'user' ? 'environment' : 'user';
        
        // Получаем новый видео поток
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
                facingMode: currentCamera
            }
        });
        
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        // Заменяем трек в локальном потоке
        localStream.removeTrack(oldVideoTrack);
        localStream.addTrack(newVideoTrack);
        
        // Заменяем трек в WebRTC соединении
        const senders = peerConnection.getSenders();
        const videoSender = senders.find(sender => sender.track?.kind === 'video');
        if (videoSender) {
            videoSender.replaceTrack(newVideoTrack);
        }
        
        // Обновляем видео элементы
        localVideo.srcObject = localStream;
        fullscreenLocalVideo.srcObject = localStream;
        
        console.log('✅ Камера перевернута на:', currentCamera);
        
    } catch (error) {
        console.error('❌ Ошибка переворота камеры:', error);
        alert('Ошибка переворота камеры: ' + error.message);
    }
}

// Вход в полноэкранный режим
function enterFullscreen() {
    if (!remoteStream) return;
    
    isFullscreen = true;
    fullscreenOverlay.style.display = 'flex';
    
    // Копируем потоки
    fullscreenRemoteVideo.srcObject = remoteStream;
    fullscreenLocalVideo.srcObject = localStream;
    
    // Синхронизируем состояние кнопок
    updateFullscreenControls();
    
    console.log('⛶ Вход в полноэкранный режим');
}

// Выход из полноэкранного режима
function exitFullscreen() {
    isFullscreen = false;
    fullscreenOverlay.style.display = 'none';
    console.log('⛶ Выход из полноэкранного режима');
}

// Обновление полноэкранных элементов управления
function updateFullscreenControls() {
    // Синхронизируем состояние кнопок
    const muteIcon = isMuted ? '🔇' : '🎤';
    const videoIcon = isVideoEnabled ? '📹' : '🚫';
    
    fsMuteBtn.innerHTML = `<span class="btn-icon">${muteIcon}</span>`;
    fsVideoBtn.innerHTML = `<span class="btn-icon">${videoIcon}</span>`;
    
    fsMuteBtn.classList.toggle('active', isMuted);
    fsVideoBtn.classList.toggle('active', !isVideoEnabled);
}

// Завершение звонка
async function endCall() {
    try {
        console.log('📞 Завершаем звонок');
        
        // Останавливаем локальные потоки
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        // Закрываем WebRTC соединение
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        // Очищаем видео элементы
        localVideo.srcObject = null;
        remoteVideo.srcObject = null;
        fullscreenRemoteVideo.srcObject = null;
        fullscreenLocalVideo.srcObject = null;
        
        // Уведомляем сервер через WebSocket
        if (currentCall) {
            socket.emit('call:end', { callId: currentCall.id });
        }
        
        // Скрываем интерфейс
        hideCallInterface();
        exitFullscreen();
        
        // Сбрасываем состояние
        isMuted = false;
        isVideoEnabled = true;
        currentCamera = 'user';
        
        console.log('✅ Звонок завершен');
        
    } catch (error) {
        console.error('❌ Ошибка завершения звонка:', error);
    }
}

// Показ входящего звонка
function showIncomingCall(call) {
    if (incomingCallOverlay.style.display === 'block') return;
    
    console.log('📞 Входящий звонок от:', call.caller);
    
    incomingCallerName.textContent = call.caller;
    incomingCallType.textContent = call.withVideo ? 'Видеозвонок' : 'Аудиозвонок';
    
    // Сохраняем данные звонка
    currentCall = {
        id: call.callId,
        caller: call.caller,
        offer: call.offer,
        withVideo: call.withVideo
    };
    
    incomingCallOverlay.style.display = 'flex';
    playRingtone();
}

// Скрытие входящего звонка
function hideIncomingCall() {
    incomingCallOverlay.style.display = 'none';
    stopRingtone();
}

// Принятие входящего звонка
async function acceptIncomingCall() {
    try {
        console.log('✅ Принимаем входящий звонок');
        
        // Запрашиваем медиа потоки
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: currentCall.withVideo ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            } : false
        });
        
        localStream = stream;
        localVideo.srcObject = stream;
        
        // Создаем WebRTC соединение
        await createPeerConnection();
        
        // Добавляем локальные треки
        stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream);
        });
        
        // Устанавливаем удаленное описание (offer)
        await peerConnection.setRemoteDescription(new RTCSessionDescription(currentCall.offer));
        
        // Создаем answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Отправляем answer через WebSocket
        socket.emit('call:answer', {
            callId: currentCall.id,
            answer: answer
        });
        
        // Скрываем входящий звонок и показываем интерфейс
        hideIncomingCall();
        showCallInterface();
        
        console.log('✅ Входящий звонок принят');
        
    } catch (error) {
        console.error('❌ Ошибка принятия звонка:', error);
        alert('Ошибка принятия звонка: ' + error.message);
    }
}

// Отклонение входящего звонка
async function rejectIncomingCall() {
    try {
        console.log('❌ Отклоняем входящий звонок');
        
        // Отправляем отклонение через WebSocket
        socket.emit('call:reject', { callId: currentCall.id });
        
        hideIncomingCall();
        currentCall = null;
        
        console.log('✅ Входящий звонок отклонен');
        
    } catch (error) {
        console.error('❌ Ошибка отклонения звонка:', error);
    }
}

// Воспроизведение звонка
function playRingtone() {
    // Создаем простой звук звонка
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.5);
    
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
    
    // Повторяем каждые 2 секунды
    window.ringtoneInterval = setInterval(() => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    }, 2000);
}

// Остановка звонка
function stopRingtone() {
    if (window.ringtoneInterval) {
        clearInterval(window.ringtoneInterval);
        window.ringtoneInterval = null;
    }
}

// Ping для поддержания онлайн статуса
function startPingInterval() {
    if (pingInterval) {
        clearInterval(pingInterval);
    }
    
    pingInterval = setInterval(async () => {
        try {
            await fetch('/ping', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                }
            });
        } catch (error) {
            console.error('❌ Ошибка ping:', error);
        }
    }, 15000);
}

// Выход
function logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userData');
    window.location.href = '/';
}

// Очистка при закрытии страницы
window.addEventListener('beforeunload', () => {
    if (currentCall) {
        endCall();
    }
    if (pingInterval) {
        clearInterval(pingInterval);
    }
    if (socket) {
        socket.disconnect();
    }
});

console.log('🎥 Система видеозвонков с WebSocket загружена'); 
