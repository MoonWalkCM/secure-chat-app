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
let callStatusPolling = null;
let incomingCallPolling = null;
let pingInterval = null;
let incomingCallShown = false;
let processedCallIds = new Set();

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

        // Загружаем контакты
        await loadContacts();
        
        // Запускаем опросы
        startIncomingCallPolling();
        startPingInterval();
        
        console.log('✅ Приложение инициализировано');
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
    }
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
    
    // Очистка звонков
    document.getElementById('clearCallsBtn')?.addEventListener('click', clearAllCalls);
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
        
        // Запрашиваем медиа потоки с высоким качеством
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000
            },
            video: {
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
                frameRate: { ideal: 30, min: 24 },
                facingMode: 'user'
            }
        });
        
        localStream = stream;
        localVideo.srcObject = stream;
        
        // Создаем WebRTC соединение
        await createPeerConnection();
        
        // Добавляем локальные треки с приоритетом
        stream.getTracks().forEach(track => {
            const sender = peerConnection.addTrack(track, stream);
            
            // Устанавливаем приоритет для видео
            if (track.kind === 'video') {
                const params = sender.getParameters();
                if (params.encodings && params.encodings.length > 0) {
                    params.encodings[0].maxBitrate = 2500000; // 2.5 Mbps
                    params.encodings[0].maxFramerate = 30;
                    sender.setParameters(params);
                }
            }
        });
        
        // Создаем offer с оптимизациями
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        
        await peerConnection.setLocalDescription(offer);
        
        // Отправляем offer на сервер
        const response = await fetch('/call/offer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                recipient: recipient,
                offer: offer,
                withVideo: true
            })
        });
        
        if (!response.ok) {
            throw new Error('Ошибка инициации звонка');
        }
        
        const data = await response.json();
        currentCall = {
            id: data.callId,
            recipient: recipient,
            type: 'video'
        };
        
        // Показываем интерфейс звонка
        showCallInterface();
        startCallStatusPolling();
        
        console.log('✅ Видеозвонок инициирован:', data.callId);
        
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
        
        // Отправляем offer на сервер
        const response = await fetch('/call/offer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                recipient: recipient,
                offer: offer,
                withVideo: false
            })
        });
        
        if (!response.ok) {
            throw new Error('Ошибка инициации звонка');
        }
        
        const data = await response.json();
        currentCall = {
            id: data.callId,
            recipient: recipient,
            type: 'audio'
        };
        
        // Показываем интерфейс звонка
        showCallInterface();
        startCallStatusPolling();
        
        console.log('✅ Аудиозвонок инициирован:', data.callId);
        
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
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceTransportPolicy: 'all'
    };
    
    peerConnection = new RTCPeerConnection(configuration);
    
    // Обработчики событий
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('🧊 Отправляем ICE кандидат:', event.candidate.type);
            sendIceCandidate(event.candidate);
        }
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('🔗 Состояние соединения:', peerConnection.connectionState);
        updateCallStatus(peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'connected') {
            console.log('✅ WebRTC соединение установлено!');
            updateCallStatus('Подключено');
        } else if (peerConnection.connectionState === 'failed') {
            console.log('❌ WebRTC соединение не удалось');
            updateCallStatus('Ошибка соединения');
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('🧊 Состояние ICE:', peerConnection.iceConnectionState);
        
        if (peerConnection.iceConnectionState === 'connected') {
            console.log('✅ ICE соединение установлено!');
        } else if (peerConnection.iceConnectionState === 'failed') {
            console.log('❌ ICE соединение не удалось');
        }
    };
    
    peerConnection.onicegatheringstatechange = () => {
        console.log('🧊 Состояние сбора ICE:', peerConnection.iceGatheringState);
    };
    
    peerConnection.ontrack = (event) => {
        console.log('📺 Получен удаленный поток');
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
        fullscreenRemoteVideo.srcObject = remoteStream;
        
        // Принудительное воспроизведение с повторными попытками
        const playVideo = async () => {
            try {
                await remoteVideo.play();
                console.log('✅ Удаленное видео воспроизводится');
            } catch (error) {
                console.log('⚠️ Ошибка воспроизведения удаленного видео:', error);
                // Повторная попытка через 1 секунду
                setTimeout(playVideo, 1000);
            }
        };
        
        const playFullscreenVideo = async () => {
            try {
                await fullscreenRemoteVideo.play();
                console.log('✅ Полноэкранное видео воспроизводится');
            } catch (error) {
                console.log('⚠️ Ошибка полноэкранного воспроизведения:', error);
                // Повторная попытка через 1 секунду
                setTimeout(playFullscreenVideo, 1000);
            }
        };
        
        playVideo();
        playFullscreenVideo();
    };
    
    console.log('🔗 WebRTC соединение создано');
}

// Отправка ICE кандидата
async function sendIceCandidate(candidate) {
    if (!currentCall) return;
    
    const maxRetries = 3;
    let retryCount = 0;
    
    const sendWithRetry = async () => {
        try {
            const response = await fetch('/call/ice-candidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                },
                body: JSON.stringify({
                    callId: currentCall.id,
                    candidate: candidate
                })
            });
            
            if (response.ok) {
                console.log('✅ ICE кандидат отправлен успешно');
            } else if (response.status === 404) {
                console.log('ℹ️ Звонок не найден на сервере для ICE кандидата');
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Ошибка отправки ICE кандидата:', error);
            
            if (retryCount < maxRetries) {
                retryCount++;
                console.log(`🔄 Повторная попытка ${retryCount}/${maxRetries} через 1 секунду...`);
                setTimeout(sendWithRetry, 1000);
            } else {
                console.error('❌ Не удалось отправить ICE кандидат после всех попыток');
            }
        }
    };
    
    sendWithRetry();
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
        
        // Останавливаем опросы
        stopCallStatusPolling();
        
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
        
        // Уведомляем сервер
        if (currentCall) {
            try {
                await fetch('/call/end', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                    },
                    body: JSON.stringify({
                        callId: currentCall.id
                    })
                });
            } catch (error) {
                console.log('ℹ️ Звонок уже завершен на сервере');
            }
        }
        
        // Скрываем интерфейс
        hideCallInterface();
        exitFullscreen();
        
        // Сбрасываем состояние
        isMuted = false;
        isVideoEnabled = true;
        currentCamera = 'user';
        incomingCallShown = false;
        processedCallIds.clear();
        
        console.log('✅ Звонок завершен');
        
    } catch (error) {
        console.error('❌ Ошибка завершения звонка:', error);
    }
}

// Опрос статуса звонка
function startCallStatusPolling() {
    if (callStatusPolling) {
        clearInterval(callStatusPolling);
    }
    
    callStatusPolling = setInterval(async () => {
        if (!currentCall) return;
        
        try {
            const response = await fetch(`/call/status/${currentCall.id}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                handleCallStatusUpdate(data.callSession);
            } else if (response.status === 404) {
                console.log('ℹ️ Звонок не найден на сервере, но продолжаем локально');
                // Не завершаем звонок сразу, даем время на восстановление
            } else {
                console.error('❌ Ошибка сервера при получении статуса:', response.status);
            }
        } catch (error) {
            console.error('❌ Ошибка получения статуса звонка:', error);
            // Не завершаем звонок при сетевых ошибках
        }
    }, 3000); // Увеличиваем интервал до 3 секунд
}

// Остановка опроса статуса
function stopCallStatusPolling() {
    if (callStatusPolling) {
        clearInterval(callStatusPolling);
        callStatusPolling = null;
    }
}

// Обработка обновления статуса звонка
function handleCallStatusUpdate(callSession) {
    if (!callSession) return;
    
    switch (callSession.status) {
        case 'active':
            updateCallStatus('Подключено');
            break;
        case 'ended':
        case 'rejected':
            endCall();
            break;
        case 'pending':
            updateCallStatus('Ожидание ответа...');
            break;
    }
    
    // Обрабатываем answer если есть
    if (callSession.answer && peerConnection && peerConnection.signalingState !== 'stable') {
        peerConnection.setRemoteDescription(new RTCSessionDescription(callSession.answer));
    }
    
    // Обрабатываем ICE кандидаты
    if (callSession.iceCandidates && callSession.iceCandidates.length > 0) {
        callSession.iceCandidates.forEach(candidateData => {
            if (!candidateData.processed) {
                peerConnection.addIceCandidate(new RTCIceCandidate(candidateData.candidate));
                candidateData.processed = true;
            }
        });
    }
}

// Опрос входящих звонков
function startIncomingCallPolling() {
    if (incomingCallPolling) {
        clearInterval(incomingCallPolling);
    }
    
    incomingCallPolling = setInterval(async () => {
        try {
            const response = await fetch('/call/incoming', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                }
            });
            
            if (response.ok) {
                const incomingCalls = await response.json();
                if (incomingCalls.length > 0 && !incomingCallShown) {
                    const call = incomingCalls[0];
                    if (!processedCallIds.has(call.id)) {
                        showIncomingCall(call);
                        processedCallIds.add(call.id);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Ошибка получения входящих звонков:', error);
        }
    }, 3000);
}

// Показ входящего звонка
function showIncomingCall(call) {
    if (incomingCallShown) return;
    
    console.log('📞 Входящий звонок от:', call.caller);
    
    incomingCallerName.textContent = call.caller;
    incomingCallType.textContent = call.withVideo ? 'Видеозвонок' : 'Аудиозвонок';
    
    // Сохраняем данные звонка
    currentCall = {
        id: call.id,
        caller: call.caller,
        offer: call.offer,
        withVideo: call.withVideo
    };
    
    incomingCallShown = true;
    incomingCallOverlay.style.display = 'flex';
    playRingtone();
}

// Скрытие входящего звонка
function hideIncomingCall() {
    incomingCallOverlay.style.display = 'none';
    stopRingtone();
    incomingCallShown = false;
}

// Принятие входящего звонка
async function acceptIncomingCall() {
    try {
        console.log('✅ Принимаем входящий звонок');
        
        // Запрашиваем медиа потоки с высоким качеством
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000
            },
            video: currentCall.withVideo ? {
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
                frameRate: { ideal: 30, min: 24 },
                facingMode: 'user'
            } : false
        });
        
        localStream = stream;
        localVideo.srcObject = stream;
        
        // Создаем WebRTC соединение
        await createPeerConnection();
        
        // Добавляем локальные треки с приоритетом
        stream.getTracks().forEach(track => {
            const sender = peerConnection.addTrack(track, stream);
            
            // Устанавливаем приоритет для видео
            if (track.kind === 'video') {
                const params = sender.getParameters();
                if (params.encodings && params.encodings.length > 0) {
                    params.encodings[0].maxBitrate = 2500000; // 2.5 Mbps
                    params.encodings[0].maxFramerate = 30;
                    sender.setParameters(params);
                }
            }
        });
        
        // Устанавливаем удаленное описание (offer)
        await peerConnection.setRemoteDescription(new RTCSessionDescription(currentCall.offer));
        
        // Создаем answer с оптимизациями
        const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: currentCall.withVideo
        });
        
        await peerConnection.setLocalDescription(answer);
        
        // Отправляем answer
        await fetch('/call/answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                callId: currentCall.id,
                answer: answer
            })
        });
        
        // Скрываем входящий звонок и показываем интерфейс
        hideIncomingCall();
        showCallInterface();
        startCallStatusPolling();
        
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
        
        // Отправляем отклонение
        await fetch('/call/reject', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                callId: currentCall.id
            })
        });
        
        hideIncomingCall();
        currentCall = null;
        
        console.log('✅ Входящий звонок отклонен');
        
    } catch (error) {
        console.error('❌ Ошибка отклонения звонка:', error);
    }
}

// Воспроизведение звонка
function playRingtone() {
    try {
        // Создаем AudioContext только при необходимости
        if (!window.audioContext) {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Возобновляем контекст если приостановлен
        if (window.audioContext.state === 'suspended') {
            window.audioContext.resume();
        }
        
        const oscillator = window.audioContext.createOscillator();
        const gainNode = window.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(window.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, window.audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, window.audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0, window.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, window.audioContext.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(0, window.audioContext.currentTime + 0.5);
        
        oscillator.start(window.audioContext.currentTime);
        oscillator.stop(window.audioContext.currentTime + 0.5);
        
        // Повторяем каждые 2 секунды
        window.ringtoneInterval = setInterval(() => {
            if (window.audioContext.state === 'suspended') {
                window.audioContext.resume();
            }
            
            const oscillator = window.audioContext.createOscillator();
            const gainNode = window.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(window.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, window.audioContext.currentTime);
            oscillator.frequency.setValueAtTime(600, window.audioContext.currentTime + 0.5);
            
            gainNode.gain.setValueAtTime(0, window.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, window.audioContext.currentTime + 0.1);
            gainNode.gain.linearRampToValueAtTime(0, window.audioContext.currentTime + 0.5);
            
            oscillator.start(window.audioContext.currentTime);
            oscillator.stop(window.audioContext.currentTime + 0.5);
        }, 2000);
    } catch (error) {
        console.error('❌ Ошибка воспроизведения звонка:', error);
    }
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

// Очистка всех звонков
async function clearAllCalls() {
    try {
        console.log('🧹 Очищаем все звонки...');
        
        const response = await fetch('/call/clear-all', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            alert(`✅ ${data.message}`);
            console.log('✅ Звонки очищены:', data.message);
        } else {
            throw new Error('Ошибка очистки звонков');
        }
    } catch (error) {
        console.error('❌ Ошибка очистки звонков:', error);
        alert('❌ Ошибка очистки звонков: ' + error.message);
    }
}

// Очистка при закрытии страницы
window.addEventListener('beforeunload', () => {
    if (currentCall) {
        endCall();
    }
    if (pingInterval) {
        clearInterval(pingInterval);
    }
    if (incomingCallPolling) {
        clearInterval(incomingCallPolling);
    }
    if (callStatusPolling) {
        clearInterval(callStatusPolling);
    }
});

console.log('🎥 Система видеозвонков с HTTP polling загружена'); 
