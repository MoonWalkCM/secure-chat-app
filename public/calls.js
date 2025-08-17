// Глобальные переменные для звонков
let currentCall = null;
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let callStatusPolling = null;
let contacts = [];
let currentUser = null;
let pingInterval = null;
let callTimer = null;
let ringtoneInterval = null; // Добавляем переменную для интервала звонка
let incomingCallShown = false; // Добавляем флаг для отслеживания показа входящего звонка
let processedCallIds = new Set(); // Добавляем Set для отслеживания обработанных звонков

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeCalls();
});

async function initializeCalls() {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/';
        return;
    }

    try {
        // Получаем информацию о текущем пользователе
        const decoded = JSON.parse(atob(token.split('.')[1]));
        currentUser = decoded.login;
        
        // Загружаем контакты
        await loadContacts();
        
        // Начинаем опрос статуса звонков
        startCallStatusPolling();
        
        // Начинаем ping для поддержания онлайн статуса
        startPing();
        
        console.log('Звонки инициализированы');
    } catch (error) {
        console.error('Ошибка инициализации звонков:', error);
    }
}

// Функция ping для поддержания онлайн статуса
function startPing() {
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
            console.error('Ошибка ping:', error);
        }
    }, 15000);
}

// Очистка ping при выходе
function stopPing() {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
}

// Загрузка контактов
async function loadContacts() {
    try {
        const response = await fetch('/contacts', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });
        
        if (response.ok) {
            contacts = await response.json();
            renderContacts();
        } else {
            console.error('Ошибка загрузки контактов');
        }
    } catch (error) {
        console.error('Ошибка загрузки контактов:', error);
    }
}

// Отрисовка контактов
function renderContacts() {
    const contactsContainer = document.getElementById('contacts-list');
    if (!contactsContainer) return;

    contactsContainer.innerHTML = '';
    
    if (contacts.length === 0) {
        contactsContainer.innerHTML = `
            <div class="placeholder">
                <i class="fas fa-users"></i>
                <h3>Нет контактов</h3>
                <p>Добавьте контакты для начала звонков</p>
            </div>
        `;
        return;
    }
    
    contacts.forEach(contact => {
        const contactElement = document.createElement('div');
        contactElement.className = 'contact-item';
        contactElement.innerHTML = `
            <div class="contact-info">
                <div class="contact-name">${contact.nickname || contact.login}</div>
                <div class="contact-status ${contact.is_online ? 'online' : 'offline'}">
                    ${contact.is_online ? 'Онлайн' : 'Оффлайн'}
                </div>
            </div>
            <div class="contact-actions">
                <button class="call-btn video-call" onclick="startCall('${contact.login}', true)" ${currentCall ? 'disabled' : ''}>
                    <i class="fas fa-video"></i>
                </button>
                <button class="call-btn audio-call" onclick="startCall('${contact.login}', false)" ${currentCall ? 'disabled' : ''}>
                    <i class="fas fa-phone"></i>
                </button>
            </div>
        `;
        contactsContainer.appendChild(contactElement);
    });
}

// Создание peer connection
function createPeerConnection() {
    const config = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
    };
    
    const pc = new RTCPeerConnection(config);
    
    // Обработчик получения удаленных треков
    pc.ontrack = (event) => {
        console.log('=== ПОЛУЧЕН УДАЛЕННЫЙ ПОТОК ===');
        console.log('Streams:', event.streams);
        console.log('Track:', event.track);
        
        if (event.streams && event.streams[0]) {
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
                console.log('Устанавливаем удаленное видео');
                
                // Принудительно воспроизводим видео
                setTimeout(() => {
                    forceVideoPlay();
                }, 100);
            }
        }
    };
    
    // Обработчик ICE кандидатов
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Отправляем ICE кандидат:', event.candidate.type);
            sendIceCandidate(event.candidate);
        }
    };
    
    // Обработчики состояния соединения
    pc.onconnectionstatechange = () => {
        console.log('🔗 Состояние соединения:', pc.connectionState);
    };
    
    pc.oniceconnectionstatechange = () => {
        console.log('🧊 Состояние ICE соединения:', pc.iceConnectionState);
    };
    
    pc.onicegatheringstatechange = () => {
        console.log('📡 Состояние сбора ICE:', pc.iceGatheringState);
    };
    
    return pc;
}

// Начало звонка
async function startCall(recipient, withVideo) {
    try {
        console.log(`🚀 Начинаем ${withVideo ? 'видео' : 'аудио'} звонок к ${recipient}`);
        
        // Получаем медиа потоки
        const constraints = {
            audio: true,
            video: withVideo ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            } : false
        };
        
        console.log('Запрашиваем медиа потоки с ограничениями:', constraints);
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('✅ Локальные медиа потоки получены');
        console.log('Треки:', localStream.getTracks().map(t => `${t.kind}: ${t.enabled}`));
        
        // Создаем RTCPeerConnection
        peerConnection = createPeerConnection();
        
        // Добавляем локальный поток
        localStream.getTracks().forEach(track => {
            console.log(`Добавляем трек: ${track.kind}`);
            peerConnection.addTrack(track, localStream);
        });
        
        // Создаем offer
        console.log('Создаем offer...');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log('✅ Локальное описание установлено');
        
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
                withVideo: withVideo
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Offer отправлен успешно, callId:', data.callId);
            
            // Устанавливаем текущий звонок
            currentCall = {
                id: data.callId,
                caller: currentUser,
                recipient: recipient,
                status: 'pending',
                withVideo: withVideo
            };
            
            // Показываем интерфейс звонка
            showCallInterface();
            updateCallStatus('Набор...');
            
            console.log('🎯 Звонок инициирован:', data.callId);
        }
    } catch (error) {
        console.error('❌ Ошибка начала звонка:', error);
        alert(`Ошибка начала звонка: ${error.message}`);
    }
}

// Отправка ICE кандидата
async function sendIceCandidate(candidate) {
    if (!currentCall) return;
    
    try {
        await fetch('/call/ice-candidate', {
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
    } catch (error) {
        console.error('Ошибка отправки ICE кандидата:', error);
    }
}

// Улучшенная функция завершения звонка
async function endCall() {
    try {
        console.log('🔚 Завершаем звонок');
        
        // Очищаем флаги
        incomingCallShown = false;
        processedCallIds.clear();
        
        if (currentCall) {
            // Отправляем запрос на завершение звонка
            try {
                const response = await fetch('/call/end', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                    },
                    body: JSON.stringify({ callId: currentCall.id })
                });
                
                if (response.ok) {
                    console.log('✅ Запрос на завершение звонка отправлен');
                } else if (response.status === 404) {
                    console.log('ℹ️ Звонок уже завершен на сервере');
                } else {
                    console.warn('⚠️ Ошибка отправки запроса на завершение:', response.status);
                }
            } catch (error) {
                console.error('❌ Ошибка отправки запроса на завершение:', error);
            }
        }
        
        // Останавливаем локальные медиа потоки
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                console.log('🛑 Остановлен трек:', track.kind);
            });
            localStream = null;
        }
        
        // Закрываем peer connection
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
            console.log('🔌 PeerConnection закрыт');
        }
        
        // Очищаем интервалы
        if (callStatusPolling) {
            clearInterval(callStatusPolling);
            callStatusPolling = null;
        }
        if (callTimer) {
            clearInterval(callTimer);
            callTimer = null;
        }
        
        // Скрываем интерфейс звонка
        hideCallInterface();
        
        // Сбрасываем переменные
        currentCall = null;
        currentUser = null;
        
        // Перезагружаем контакты
        await loadContacts();
        
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
        
        if (response.ok) {
            const data = await response.json();
            return data.callSession;
        } else if (response.status === 404) {
            console.log('ℹ️ Звонок не найден на сервере:', callId);
            return null;
        } else {
            console.error('❌ Ошибка получения статуса звонка:', response.status);
            return null;
        }
    } catch (error) {
        console.error('❌ Ошибка запроса статуса звонка:', error);
        return null;
    }
}

// Запуск опроса статуса звонков
function startCallStatusPolling() {
    callStatusPolling = setInterval(async () => {
        try {
            await checkIncomingCalls(); // Проверяем входящие звонки
            
            if (currentCall) {
                const callStatus = await getCallStatus(currentCall.id);
                if (callStatus) {
                    handleCallStatusUpdate(callStatus);
                    // Обрабатываем ICE кандидаты от сервера
                    if (callStatus.iceCandidates && callStatus.iceCandidates.length > 0) {
                        await processIceCandidates(callStatus.iceCandidates);
                    }
                } else {
                    // Звонок не найден на сервере, завершаем локально
                    console.log('🔄 Звонок не найден на сервере, завершаем локально');
                    endCall();
                }
            }
        } catch (error) {
            console.error('❌ Ошибка опроса статуса звонков:', error);
        }
    }, 2000);
}

// Обработка ICE кандидатов
async function processIceCandidates(iceCandidates) {
    if (!peerConnection) return;
    
    for (const iceData of iceCandidates) {
        // Проверяем, что кандидат от собеседника и еще не обработан
        if (iceData.from !== currentUser && !iceData.processed) {
            try {
                console.log('Добавляем ICE кандидат от собеседника:', iceData.candidate.type);
                await peerConnection.addIceCandidate(new RTCIceCandidate(iceData.candidate));
                iceData.processed = true; // Помечаем как обработанный
            } catch (error) {
                console.error('Ошибка добавления ICE кандидата:', error);
            }
        }
    }
}

// Проверка входящих звонков
async function checkIncomingCalls() {
    try {
        const response = await fetch('/call/incoming', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });
        
        if (response.ok) {
            const incomingCalls = await response.json();
            
            // Фильтруем только новые звонки
            const newCalls = incomingCalls.filter(call => !processedCallIds.has(call.id));
            
            if (newCalls.length > 0 && !incomingCallShown) {
                const call = newCalls[0]; // Берем первый новый звонок
                processedCallIds.add(call.id); // Отмечаем как обработанный
                incomingCallShown = true; // Устанавливаем флаг показа
                
                console.log('📞 Входящий звонок от:', call.caller);
                showIncomingCall(call);
            }
        }
    } catch (error) {
        console.error('❌ Ошибка проверки входящих звонков:', error);
    }
}

// Показ входящего звонка
function showIncomingCall(call) {
    console.log('📞 Входящий звонок от:', call.caller);
    
    const incomingCallHTML = `
        <div id="incoming-call-overlay" class="incoming-call-overlay">
            <div class="incoming-call-modal">
                <div class="incoming-call-info">
                    <h3>Входящий ${call.withVideo ? 'видео' : 'аудио'} звонок</h3>
                    <p>От: ${call.caller}</p>
                </div>
                <div class="incoming-call-actions">
                    <button id="accept-call-btn" class="accept-btn">
                        <i class="fas fa-phone"></i> Принять
                    </button>
                    <button id="reject-call-btn" class="reject-btn">
                        <i class="fas fa-phone-slash"></i> Отклонить
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', incomingCallHTML);
    
    document.getElementById('accept-call-btn').onclick = () => acceptIncomingCall(call);
    document.getElementById('reject-call-btn').onclick = () => rejectIncomingCall(call);
    
    playRingtone();
}

// Принятие входящего звонка
async function acceptIncomingCall(call) {
    try {
        console.log('✅ Принимаем входящий звонок');
        
        // Получаем медиа потоки
        const constraints = {
            audio: true,
            video: call.withVideo ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            } : false
        };
        
        console.log('Запрашиваем медиа потоки с ограничениями:', constraints);
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('✅ Локальные медиа потоки получены');
        console.log('Треки:', localStream.getTracks().map(t => `${t.kind}: ${t.enabled}`));
        
        // Создаем RTCPeerConnection
        peerConnection = createPeerConnection();
        
        // Добавляем локальный поток
        localStream.getTracks().forEach(track => {
            console.log(`Добавляем трек: ${track.kind}`);
            peerConnection.addTrack(track, localStream);
        });
        
        // Устанавливаем удаленное описание
        console.log('Устанавливаем удаленное описание (offer)');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer));
        console.log('✅ Удаленное описание установлено');
        
        // Создаем answer
        console.log('Создаем answer...');
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log('✅ Локальное описание установлено');
        
        // Отправляем answer
        const response = await fetch('/call/answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                callId: call.id,
                answer: answer
            })
        });
        
        if (response.ok) {
            console.log('✅ Answer отправлен успешно');
            currentCall = {
                id: call.id,
                caller: call.caller,
                recipient: call.recipient,
                status: 'active',
                withVideo: call.withVideo
            };
            
            hideIncomingCall();
            showCallInterface();
            updateCallStatus('Звонок активен');
        }
    } catch (error) {
        console.error('❌ Ошибка принятия звонка:', error);
        hideIncomingCall();
        alert(`Ошибка принятия звонка: ${error.message}`);
    }
}

// Отклонение входящего звонка
async function rejectIncomingCall(call) {
    try {
        await fetch('/call/reject', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({
                callId: call.id
            })
        });
        
        hideIncomingCall();
    } catch (error) {
        console.error('Ошибка отклонения звонка:', error);
        hideIncomingCall();
    }
}

// Скрытие интерфейса входящего звонка
function hideIncomingCall() {
    const overlay = document.getElementById('incoming-call-overlay');
    if (overlay) {
        overlay.remove();
    }
    stopRingtone();
    incomingCallShown = false; // Сбрасываем флаг показа
    console.log('🔇 Входящий звонок скрыт');
}

// Функция воспроизведения звонка
function playRingtone() {
    try {
        // Создаем AudioContext только при необходимости
        if (!window.audioContext) {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Проверяем состояние AudioContext
        if (window.audioContext.state === 'suspended') {
            console.log('🔊 AudioContext приостановлен, пытаемся возобновить...');
            window.audioContext.resume().then(() => {
                console.log('✅ AudioContext возобновлен');
                startRingtone();
            }).catch(error => {
                console.error('❌ Ошибка возобновления AudioContext:', error);
            });
        } else {
            startRingtone();
        }
    } catch (error) {
        console.error('❌ Ошибка создания AudioContext:', error);
    }
}

function startRingtone() {
    try {
        const audioContext = window.audioContext;
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 1);
        
        // Повторяем каждую секунду
        ringtoneInterval = setInterval(() => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.5);
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 1);
        }, 1000);
        
        console.log('🔊 Звонок начал играть');
    } catch (error) {
        console.error('❌ Ошибка воспроизведения звонка:', error);
    }
}

// Функция остановки звонка
function stopRingtone() {
    if (ringtoneInterval) {
        clearInterval(ringtoneInterval);
        ringtoneInterval = null;
        console.log('🔇 Звонок остановлен');
    }
}

// Обработка обновления статуса звонка
function handleCallStatusUpdate(callStatus) {
    console.log('📊 Обновление статуса звонка:', callStatus.status);
    
    if (callStatus.status === 'rejected' || callStatus.status === 'ended') {
        if (currentCall) {
            console.log('🔄 Звонок завершен сервером, завершаем локально');
            endCall();
        }
    } else if (callStatus.status === 'active' && currentCall && currentCall.status === 'pending') {
        // Звонок принят, устанавливаем удаленное описание (answer)
        if (callStatus.answer && peerConnection) {
            peerConnection.setRemoteDescription(new RTCSessionDescription(callStatus.answer))
                .then(() => {
                    currentCall.status = 'active';
                    updateCallStatus('Звонок активен');
                    console.log('✅ Удаленное описание установлено');
                })
                .catch(error => {
                    console.error('❌ Ошибка установки соединения:', error);
                    alert(`Ошибка установки соединения: ${error.message}`);
                });
        }
    }
}

// Показ интерфейса звонка
function showCallInterface() {
    const callInterface = document.getElementById('call-interface');
    const noCallPlaceholder = document.getElementById('no-call-placeholder');
    
    if (callInterface) {
        callInterface.style.display = 'flex';
    }
    
    if (noCallPlaceholder) {
        noCallPlaceholder.style.display = 'none';
    }
    
    const localVideo = document.getElementById('local-video');
    if (localVideo && localStream) {
        localVideo.srcObject = localStream;
        localVideo.play().catch(e => console.error('Ошибка воспроизведения локального видео:', e));
    }
}

// Скрытие интерфейса звонка
function hideCallInterface() {
    const callInterface = document.getElementById('call-interface');
    const noCallPlaceholder = document.getElementById('no-call-placeholder');
    
    if (callInterface) {
        callInterface.style.display = 'none';
    }
    
    if (noCallPlaceholder) {
        noCallPlaceholder.style.display = 'flex';
    }
    
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
}

// Обновление статуса звонка
function updateCallStatus(status) {
    const statusElement = document.getElementById('call-status');
    if (statusElement) {
        statusElement.textContent = status;
    }
}

// Таймер звонка
function startCallTimer() {
    if (callTimer) {
        clearInterval(callTimer);
    }
    
    const startTime = Date.now();
    callTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        updateCallStatus(`Звонок активен (${minutes}:${seconds.toString().padStart(2, '0')})`);
    }, 1000);
}

function stopCallTimer() {
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
}

// Управление микрофоном
function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const muteBtn = document.getElementById('mute-btn');
            if (muteBtn) {
                muteBtn.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
                muteBtn.style.background = audioTrack.enabled ? '#a0aec0' : '#f56565';
            }
        }
    }
}

// Управление камерой
function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const videoBtn = document.getElementById('video-btn');
            if (videoBtn) {
                videoBtn.innerHTML = videoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
                videoBtn.style.background = videoTrack.enabled ? '#a0aec0' : '#f56565';
            }
        }
    }
}

// Принудительное воспроизведение видео
function forceVideoPlay() {
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo && remoteVideo.srcObject) {
        try {
            console.log('🎥 Принудительно воспроизводим видео');
            remoteVideo.play().catch(error => {
                if (error.name === 'AbortError') {
                    console.log('ℹ️ Воспроизведение прервано (нормально при завершении звонка)');
                } else {
                    console.error('❌ Ошибка принудительного воспроизведения:', error);
                }
            });
        } catch (error) {
            console.error('❌ Ошибка принудительного воспроизведения:', error);
        }
    }
}

// Очистка при выходе
window.addEventListener('beforeunload', () => {
    if (currentCall) {
        endCall();
    }
    stopPing();
});

// Функция очистки всех звонков (для отладки)
async function clearAllCalls() {
    try {
        const response = await fetch('/call/clear-all', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Очищены все звонки:', data.message);
            alert('Все звонки очищены!');
        }
    } catch (error) {
        console.error('❌ Ошибка очистки звонков:', error);
    }
}

// Функция получения информации о звонках (для отладки)
async function getCallDebugInfo() {
    try {
        const response = await fetch('/call/debug', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('📊 Информация о звонках:', data);
            alert(`Всего звонков: ${data.totalCalls}\n${data.calls.map(c => `${c.id}: ${c.caller}→${c.recipient} (${c.status})`).join('\n')}`);
        }
    } catch (error) {
        console.error('❌ Ошибка получения информации о звонках:', error);
    }
}

// Добавляем кнопки отладки в консоль
console.log('🔧 Функции отладки:');
console.log('- clearAllCalls() - очистить все звонки');
console.log('- getCallDebugInfo() - получить информацию о звонках'); 
