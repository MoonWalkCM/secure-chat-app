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
let pendingIceCandidates = [];

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
    
    // Входящий звонок — используем currentCall при клике
    acceptCallBtn?.addEventListener('click', () => {
        if (currentCall) {
            acceptIncomingCall(currentCall);
        } else {
            console.error('❌ Нет данных входящего звонка при попытке принять');
        }
    });
    rejectCallBtn?.addEventListener('click', () => {
        const callId = currentCall?.id || currentCall?.callId;
        if (callId) {
            rejectIncomingCall(callId);
        } else {
            console.error('❌ Нет ID входящего звонка при попытке отклонить');
        }
    });
    
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
        
        // Создаем WebRTC соединение
        createPeerConnection();
        
        // Получаем медиапоток
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: true
        });
        
        // Добавляем локальные треки
        stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream);
        });
        
        // Сохраняем локальный поток и показываем видео
        localStream = stream;
        localVideo.srcObject = localStream;
        localVideo.play().catch(e => console.log('⚠️ Ошибка воспроизведения локального видео:', e));
        
        // Создаем offer
        const offer = await peerConnection.createOffer();
        console.log('📋 Создан offer:', {
            type: offer.type,
            sdpLength: offer.sdp ? offer.sdp.length : 0,
            offerKeys: Object.keys(offer),
            offerType: typeof offer
        });
        
        // Проверяем offer перед отправкой
        if (!offer || !offer.type || !offer.sdp) {
            console.error('❌ Неверный формат созданного offer:', offer);
            throw new Error('Не удалось создать offer');
        }
        
        await peerConnection.setLocalDescription(offer);
        console.log('✅ Локальное описание установлено');
        
        // Отправляем offer на сервер
        console.log('📤 Отправляем offer на сервер:', {
            recipient: recipient,
            offerType: offer.type,
            offerKeys: Object.keys(offer),
            withVideo: true
        });
        
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
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Устанавливаем текущий звонок
        currentCall = {
            callId: data.callId,
            recipient: recipient,
            isIncoming: false,
            stream: stream,
            answerReceived: false,
            status: 'pending'
        };
        // После получения callId — отправляем отложенные кандидаты
        flushPendingIceCandidates();
        
        console.log('✅ Видеозвонок инициирован:', data.callId);
        
        // Начинаем опрос статуса
        startCallStatusPolling();
        
        // Показываем интерфейс звонка
        showCallInterface();
        
    } catch (error) {
        console.error('❌ Ошибка начала видеозвонка:', error);
        alert('Ошибка начала звонка: ' + error.message);
        endCall();
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
            callId: data.callId,
            recipient: recipient,
            type: 'audio',
            status: 'pending'
        };
        flushPendingIceCandidates();
        
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
function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
    }
    
    // Создаем новое соединение с STUN серверами
    peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
    });
    
    console.log('🔗 WebRTC соединение создано');
    
    // Обработчик получения удаленного потока
    peerConnection.ontrack = (event) => {
        console.log('📺 Получен удаленный поток');
        
        if (event.streams && event.streams[0]) {
            remoteStream = event.streams[0];
            
            // Показываем удаленное видео
            remoteVideo.srcObject = remoteStream;
            
            // Принудительно воспроизводим видео
            remoteVideo.play().catch(e => {
                console.log('⚠️ Ошибка воспроизведения удаленного видео:', e);
                // Повторная попытка через 1 секунду
                setTimeout(() => {
                    remoteVideo.play().catch(e2 => console.log('⚠️ Ошибка полноэкранного воспроизведения:', e2));
                }, 1000);
            });
            
            // Также показываем в полноэкранном режиме
            fullscreenRemoteVideo.srcObject = remoteStream;
            fullscreenRemoteVideo.play().catch(e => {
                console.log('⚠️ Ошибка полноэкранного воспроизведения:', e);
            });
        }
    };
    
    // Обработчик ICE кандидатов
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            try {
                console.log('🧊 Отправляем ICE кандидат:', event.candidate.candidate ? 'candidate' : 'end');
                enqueueIceCandidate(event.candidate);
            } catch (e) {
                console.warn('⚠️ Ошибка постановки ICE кандидата в очередь:', e);
            }
        }
    };
    
    // Обработчики состояния соединения
    peerConnection.oniceconnectionstatechange = () => {
        console.log('🧊 Состояние ICE:', peerConnection.iceConnectionState);
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('🔗 Состояние соединения:', peerConnection.connectionState);
    };
    
    peerConnection.onicegatheringstatechange = () => {
        console.log('🧊 Состояние сбора ICE:', peerConnection.iceGatheringState);
    };
}

// Отправка ICE кандидата с повторными попытками
async function sendIceCandidate(candidate) {
    if (!currentCall || !currentCall.callId) {
        console.log('⚠️ Нет активного звонка для отправки ICE кандидата');
        return;
    }
    
    // Проверяем, что звонок активен и не завершен
    if (currentCall.status === 'ended' || currentCall.status === 'rejected') {
        console.log('⚠️ Звонок завершен, не отправляем ICE кандидат');
        return;
    }
    
    const sendWithRetry = async (retryCount = 0) => {
        try {
            const response = await fetch('/call/ice-candidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                },
                body: JSON.stringify({
                    callId: currentCall.callId,
                    candidate: candidate
                })
            });
            
            if (response.status === 404) {
                // На Vercel другой инстанс может еще не создать запись. Не роняем звонок.
                console.log('ℹ️ Звонок не найден на сервере для ICE кандидата (404). Подождем и попробуем позже.');
                throw new Error('Call not found');
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            console.log('✅ ICE кандидат отправлен успешно');
        } catch (error) {
            console.error('❌ Ошибка отправки ICE кандидата:', error);
            
            if (retryCount < 3) {
                console.log(`🔄 Повторная попытка ${retryCount + 1}/3 через 1 секунду...`);
                setTimeout(() => sendWithRetry(retryCount + 1), 1000);
            } else {
                console.log('❌ Превышено количество попыток отправки ICE кандидата');
            }
        }
    };
    
    await sendWithRetry();
}

// Кладем кандидата в буфер, если callId еще нет, иначе отправляем сразу
function enqueueIceCandidate(candidate) {
    if (!currentCall || !currentCall.callId) {
        pendingIceCandidates.push(candidate);
        return;
    }
    sendIceCandidate(candidate);
}

// Отправляем все отложенные ICE кандидаты, когда появился callId
async function flushPendingIceCandidates() {
    if (!currentCall || !currentCall.callId) return;
    if (!pendingIceCandidates.length) return;
    const toSend = pendingIceCandidates.slice();
    pendingIceCandidates = [];
    for (const candidate of toSend) {
        try {
            await sendIceCandidate(candidate);
        } catch (e) {
            console.error('❌ Ошибка отправки отложенного ICE кандидата:', e);
        }
    }
}

// Показ интерфейса звонка
function showCallInterface() {
    contactsSection.style.display = 'none';
    callInterface.style.display = 'flex';
    updateCallStatus('Набор...');
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
        if (fsMuteBtn) fsMuteBtn.innerHTML = `<span class="btn-icon">${muteIcon}</span>`;
        
        // Обновляем стили
        muteBtn.classList.toggle('active', isMuted);
        if (fsMuteBtn) fsMuteBtn.classList.toggle('active', isMuted);
        
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
        if (fsVideoBtn) fsVideoBtn.innerHTML = `<span class="btn-icon">${videoIcon}</span>`;
        
        // Обновляем стили
        videoBtn.classList.toggle('active', !isVideoEnabled);
        if (fsVideoBtn) fsVideoBtn.classList.toggle('active', !isVideoEnabled);
        
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
        // Обновляем локальный поток
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
    if (!remoteStream) {
        remoteStream = remoteVideo?.srcObject || remoteStream;
    }
    if (!localStream) {
        localStream = localVideo?.srcObject || localStream;
    }
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
        
        // Останавливаем опрос статуса
        if (callStatusPolling) {
            clearInterval(callStatusPolling);
            callStatusPolling = null;
        }
        
        // Останавливаем рингтон
        stopRingtone();
        
        // Скрываем интерфейс входящего звонка
        hideIncomingCall();
        
        // Выходим из полноэкранного режима
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            console.log('⛶ Выход из полноэкранного режима');
        }
        
        // Отправляем завершение на сервер
        if (currentCall && currentCall.callId) {
            try {
                const response = await fetch('/call/end', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                    },
                    body: JSON.stringify({
                        callId: currentCall.callId
                    })
                });
                
                if (!response.ok) {
                    console.log('ℹ️ Звонок уже завершен на сервере');
                }
            } catch (error) {
                console.log('ℹ️ Ошибка отправки завершения звонка:', error.message);
            }
        }
        
        // Очищаем ресурсы
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        // Сбрасываем буфер ICE кандидатов
        pendingIceCandidates = [];
        
        if (currentCall && currentCall.stream) {
            currentCall.stream.getTracks().forEach(track => track.stop());
        }
        
        // Очищаем видео элементы
        localVideo.srcObject = null;
        remoteVideo.srcObject = null;
        
        // Скрываем интерфейс звонка
        hideCallInterface();
        
        // Сбрасываем состояние
        currentCall = null;
        incomingCallShown = false;
        processedCallIds.clear();
        
        console.log('✅ Звонок завершен');
        
    } catch (error) {
        console.error('❌ Ошибка завершения звонка:', error);
    }
}

// Получение статуса звонка
async function getCallStatus(callId) {
    try {
        const response = await fetch(`/call/status/${callId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });
        
        if (response.status === 404) {
            console.log('ℹ️ Звонок не найден на сервере (404), подождем и попробуем позже');
            return null;
        }
        
        if (!response.ok) {
            console.error('❌ Ошибка сервера при получении статуса:', response.status);
            return null;
        }
        
        const data = await response.json();
        return data.callSession;
    } catch (error) {
        console.error('❌ Ошибка получения статуса звонка:', error);
        return null;
    }
}

// Опрос статуса звонка
function startCallStatusPolling() {
    if (callStatusPolling) {
        clearInterval(callStatusPolling);
    }
    
    callStatusPolling = setInterval(async () => {
        if (!currentCall || !currentCall.callId) {
            clearInterval(callStatusPolling);
            return;
        }
        
        const callSession = await getCallStatus(currentCall.callId);
        
        if (!callSession) {
            // Пока нет данных — продолжаем ждать
            updateCallStatus('Набор...');
            return;
        }
        
        // Обрабатываем изменения статуса
        if (callSession.status === 'rejected') {
            console.log('📞 Звонок отклонен');
            currentCall.status = 'rejected';
            endCall();
        } else if (callSession.status === 'ended') {
            console.log('📞 Звонок завершен');
            currentCall.status = 'ended';
            endCall();
        } else if (callSession.status === 'active' && callSession.answer) {
            // Обрабатываем ответ на звонок
            if (!currentCall.answerReceived) {
                console.log('📞 Соединяю...');
                currentCall.answerReceived = true;
                currentCall.status = 'active';
                await handleCallAnswer(callSession.answer);
                updateCallStatus('Разговор идет');
            }
        } else if (callSession.status === 'active' && !callSession.answer) {
            // На Vercel ответ может прийти позже — показываем промежуточный статус
            updateCallStatus('Соединяю...');
        }
        
        // Логируем состояние offer и answer для отладки
        if (callSession.offer) {
            console.log('📋 Offer доступен:', typeof callSession.offer);
            if (typeof callSession.offer === 'string') {
                try {
                    const parsedOffer = JSON.parse(callSession.offer);
                    console.log('📋 Offer распарсен:', parsedOffer.type);
                } catch (e) {
                    console.error('❌ Ошибка парсинга offer в статусе:', e);
                    console.error('📋 Сырой offer:', callSession.offer);
                }
            } else {
                console.log('📋 Offer уже объект:', callSession.offer.type);
            }
        } else {
            console.log('⚠️ Offer отсутствует');
        }
        
        if (callSession.answer) {
            console.log('📋 Answer доступен:', typeof callSession.answer);
            if (typeof callSession.answer === 'string') {
                try {
                    const parsedAnswer = JSON.parse(callSession.answer);
                    console.log('📋 Answer распарсен:', parsedAnswer.type);
                } catch (e) {
                    console.error('❌ Ошибка парсинга answer в статусе:', e);
                    console.error('📋 Сырой answer:', callSession.answer);
                }
            } else {
                console.log('📋 Answer уже объект:', callSession.answer.type);
            }
        } else {
            console.log('⚠️ Answer отсутствует');
        }
        
        // Обрабатываем ICE кандидаты
        if (callSession.iceCandidates) {
            for (const iceCandidate of callSession.iceCandidates) {
                if (!iceCandidate.processed && iceCandidate.from !== currentUser.login) {
                    try {
                        if (!peerConnection.remoteDescription) {
                            console.log('⏳ Ждем remoteDescription для добавления ICE кандидатов');
                        }
                        await peerConnection.addIceCandidate(iceCandidate.candidate);
                        iceCandidate.processed = true;
                        console.log('✅ ICE кандидат добавлен от:', iceCandidate.from);
                    } catch (error) {
                        console.error('❌ Ошибка добавления ICE кандидата:', error);
                    }
                }
            }
        }
    }, 3000); // Проверяем каждые 3 секунды
}

// Остановка опроса статуса
function stopCallStatusPolling() {
    if (callStatusPolling) {
        clearInterval(callStatusPolling);
        callStatusPolling = null;
    }
}

// Обработка обновления статуса звонка
async function handleCallStatusUpdate(callSession) {
    if (!callSession) return;
    
    switch (callSession.status) {
        case 'active':
            updateCallStatus('Разговор идет');
            break;
        case 'ended':
        case 'rejected':
            endCall();
            break;
        case 'pending':
            updateCallStatus('Набор...');
            break;
    }
    
    // Обрабатываем answer если есть
    if (callSession.answer && peerConnection) {
        try {
            if (!peerConnection.remoteDescription || peerConnection.signalingState !== 'stable') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(callSession.answer));
                updateCallStatus('Разговор идет');
            }
        } catch (e) {
            console.error('❌ Ошибка установки удаленного описания из статуса:', e);
        }
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

// Проверка входящих звонков
async function checkIncomingCalls() {
    try {
        const response = await fetch('/call/incoming', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });
        
        if (!response.ok) {
            console.error('❌ Ошибка получения входящих звонков:', response.status);
            return;
        }
        
        const incomingCalls = await response.json();
        
        for (const callSession of incomingCalls) {
            console.log('📋 Обрабатываем звонок:', {
                id: callSession.id,
                caller: callSession.caller,
                hasOffer: !!callSession.offer,
                offerType: typeof callSession.offer
            });
            
            if (!incomingCallShown && !processedCallIds.has(callSession.id)) {
                console.log('📞 Входящий звонок от:', callSession.caller);
                
                // Показываем интерфейс входящего звонка
                showIncomingCall(callSession);
                
                // Воспроизводим рингтон
                playRingtone();
                
                // Отмечаем как показанный
                incomingCallShown = true;
                processedCallIds.add(callSession.id);
                
                // Устанавливаем обработчики кнопок
                document.getElementById('acceptCallBtn').onclick = () => acceptIncomingCall(callSession);
                document.getElementById('rejectCallBtn').onclick = () => {
                    const callId = callSession.id || (currentCall && currentCall.id);
                    rejectIncomingCall(callId);
                };
                
                console.log('🔗 Обработчики кнопок установлены для звонка:', callSession.id);
                
                break; // Показываем только первый звонок
            }
        }
    } catch (error) {
        console.error('❌ Ошибка проверки входящих звонков:', error);
    }
}

// Показ входящего звонка
function showIncomingCall(call) {
    if (incomingCallShown) return;
    
    console.log('📞 Входящий звонок от:', call.caller);
    console.log('📋 Полные данные входящего звонка:', call);
    
    incomingCallerName.textContent = call.caller || 'Неизвестный';
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
async function acceptIncomingCall(callSession) {
    try {
        console.log('✅ Принимаем входящий звонок от:', callSession.caller);
        console.log('📋 Полные данные звонка:', callSession);
        console.log('📋 Данные звонка:', {
            id: callSession.id,
            caller: callSession.caller,
            status: callSession.status,
            withVideo: callSession.withVideo,
            offerType: typeof callSession.offer,
            offerRaw: callSession.offer
        });
        
        // Если нет id, пытаемся взять его из currentCall или из DOM/статуса
        if ((!callSession || !callSession.id) && currentCall && (currentCall.id || currentCall.callId)) {
            console.log('⚠️ Используем данные из currentCall для восстановления id');
            callSession = { ...callSession, id: currentCall.id || currentCall.callId, caller: callSession.caller || currentCall.caller, offer: callSession.offer || currentCall.offer, withVideo: callSession.withVideo ?? currentCall.withVideo };
        }
        
        // Проверяем, что у нас есть все необходимые данные
        if (!callSession.id) {
            throw new Error('ID звонка отсутствует');
        }
        
        if (!callSession.caller) {
            throw new Error('Имя звонящего отсутствует');
        }
        
        // Парсим offer из callSession
        let offer;
        if (typeof callSession.offer === 'string') {
            try {
                offer = JSON.parse(callSession.offer);
                console.log('✅ Offer успешно распарсен из строки:', offer.type);
            } catch (e) {
                console.error('❌ Ошибка парсинга offer:', e);
                console.error('📋 Сырой offer:', callSession.offer);
                throw new Error('Неверный формат offer');
            }
        } else {
            offer = callSession.offer;
            console.log('✅ Offer уже объект:', offer.type);
        }
        
        // Проверяем, что offer не null и имеет правильную структуру
        if (!offer) {
            console.error('❌ Offer отсутствует (null/undefined)');
            throw new Error('Offer отсутствует');
        }
        
        if (!offer.type) {
            console.error('❌ Offer не содержит type:', offer);
            throw new Error('Offer не содержит type');
        }
        
        if (!offer.sdp) {
            console.error('❌ Offer не содержит sdp:', offer);
            throw new Error('Offer не содержит sdp');
        }
        
        console.log('✅ Offer успешно получен:', offer.type);
        
        // Создаем WebRTC соединение
        createPeerConnection();

        // Устанавливаем текущий звонок заранее, чтобы был callId для ICE
        currentCall = {
            callId: callSession.id,
            recipient: callSession.caller,
            isIncoming: true,
            stream: null,
            answerReceived: true,
            status: 'active'
        };
        
        // Получаем медиапоток
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: true
        });
        
        // Добавляем локальные треки
        stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream);
        });
        
        // Показываем локальное видео
        localStream = stream;
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.play().catch(e => console.log('⚠️ Ошибка воспроизведения локального видео:', e));
        }
        
        // Устанавливаем удаленное описание
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Создаем ответ
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Отправляем ответ на сервер
        const response = await fetch('/call/answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                callId: callSession.id,
                answer: answer
            })
        });
        
        if (!response.ok) {
            // На Vercel при холодном старте возможна краткая рассинхронизация, не роняем звонок
            console.warn('⚠️ Сервер ответил ошибкой на /call/answer:', response.status);
        }
        
        // Дополняем текущий звонок потоком
        currentCall.stream = stream;
        // После установки callId — отправляем отложенные кандидаты
        flushPendingIceCandidates();
        
        console.log('✅ Входящий звонок принят');
        
        // Скрываем интерфейс входящего звонка
        hideIncomingCall();
        
        // Останавливаем рингтон
        stopRingtone();
        
        // Начинаем опрос статуса
        startCallStatusPolling();
        
        // Показываем интерфейс звонка
        showCallInterface();
        
    } catch (error) {
        console.error('❌ Ошибка принятия входящего звонка:', error);
        alert('Ошибка принятия звонка: ' + error.message);
        endCall();
    }
}

// Отклонение входящего звонка
async function rejectIncomingCall(callId) {
    try {
        console.log('❌ Отклоняем входящий звонок:', callId);
        
        // Проверяем, что callId передан
        if (!callId) {
            console.error('❌ ID звонка не передан для отклонения');
            hideIncomingCall();
            stopRingtone();
            return;
        }
        
        // Отправляем отклонение на сервер
        const response = await fetch('/call/reject', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                callId: callId
            })
        });
        
        if (!response.ok) {
            console.error('❌ Ошибка отклонения звонка:', response.status);
            const errorData = await response.json().catch(() => ({}));
            console.error('📋 Детали ошибки:', errorData);
        } else {
            console.log('✅ Запрос на отклонение отправлен успешно');
        }
        
        // Скрываем интерфейс входящего звонка
        hideIncomingCall();
        
        // Останавливаем рингтон
        stopRingtone();
        
        console.log('✅ Входящий звонок отклонен');
        
    } catch (error) {
        console.error('❌ Ошибка отклонения входящего звонка:', error);
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

// Обработка ответа на звонок
async function handleCallAnswer(answer) {
    try {
        console.log('📞 Получен ответ на звонок');
        
        if (peerConnection) {
            // Парсим answer если он пришел как строка
            let answerObj;
            if (typeof answer === 'string') {
                try {
                    answerObj = JSON.parse(answer);
                } catch (e) {
                    console.error('❌ Ошибка парсинга answer:', e);
                    throw new Error('Неверный формат answer');
                }
            } else {
                answerObj = answer;
            }
            
            // Проверяем, что answer не null и имеет правильную структуру
            if (!answerObj || !answerObj.type || !answerObj.sdp) {
                console.error('❌ Неверный формат answer:', answerObj);
                throw new Error('Неверный формат answer - отсутствует type или sdp');
            }
            
            console.log('✅ Answer успешно получен:', answerObj.type);
            
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answerObj));
            console.log('✅ Удаленное описание установлено');
        }
    } catch (error) {
        console.error('❌ Ошибка обработки ответа на звонок:', error);
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
